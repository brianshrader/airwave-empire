#!/usr/bin/env node
/**
 * Internal audit: AM stations vs src/amFccRules.js
 * Usage:
 *   node scripts/audit-am-stations.mjs [path/to/save.json]
 * Without args: prints blueprint × default Atlanta dial (illustrative) + rule smoke tests.
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const AMFCC = await import(join(root, 'src', 'amFccRules.js'));

function auditStationRow(s) {
  if (!s?.sig || s.sig.type !== 'AM' || s.fmBooster) return null;
  const line = AMFCC.formatAmAuditLine(s);
  const desc = AMFCC.describeAmChannel(s.freq);
  return { line, desc, pass: AMFCC.amComboPassesRules(s.freq, s.sig.pw) };
}

function printHeader() {
  console.log('callsign\tfreq\tchannelKind\tpower\tstatus');
  console.log('--------\t----\t------------\t-----\t------');
}

const savePath = process.argv[2];
if (savePath && existsSync(savePath)) {
  const raw = JSON.parse(readFileSync(savePath, 'utf8'));
  const stations = raw.G?.stations || raw.stations || [];
  printHeader();
  for (const s of stations) {
    const r = auditStationRow(s);
    if (r) console.log(r.line + `\t(${r.desc.channelType}, max ${r.desc.maxPower})`);
  }
  process.exit(0);
}

// Smoke + illustrative BP × Atlanta freqs (same order as default AMF before shuffle — audit only)
printHeader();
const smoke = [
  { callLetters: 'SMOKE-A', freq: '1230 AM', sig: { type: 'AM', pw: '50kw' } },
  { callLetters: 'SMOKE-B', freq: '590 AM', sig: { type: 'AM', pw: '50kw' } },
  { callLetters: 'SMOKE-C', freq: '640 AM', sig: { type: 'AM', pw: '50kw' } },
];
for (const s of smoke) {
  const r = auditStationRow(s);
  if (r) console.log(r.line);
}

console.log('\n# normalizeAmPw smoke:');
console.log('1230 AM @ 50kw →', AMFCC.normalizeAmPw('1230 AM', '50kw'));
console.log('590 AM @ 50kw →', AMFCC.normalizeAmPw('590 AM', '50kw'));
console.log('640 AM @ 50kw →', AMFCC.normalizeAmPw('640 AM', '50kw'));

if (!savePath) {
  console.log('\n# Pass a save JSON path as the first argument to audit persisted games.');
}
