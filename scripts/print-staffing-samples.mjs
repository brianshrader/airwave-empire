#!/usr/bin/env node
/**
 * Prints staffing-automation score / appeal / identity for sample formats vs vacancy patterns.
 * Mirrors src/legacy.js (load via VM). Run: node scripts/print-staffing-samples.mjs
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');

function makeCtx() {
  const noop = () => {};
  const stubEl = () => ({
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
  });
  const documentStub = {
    body: { innerHTML: '', classList: { toggle() {} } },
    head: { appendChild() {} },
    createElement() {
      return { href: '', download: '', click() {}, style: {}, classList: { toggle() {} } };
    },
    getElementById() {
      return stubEl();
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    readyState: 'complete',
  };
  return vm.createContext({
    console,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    Symbol,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Int8Array,
    Uint8Array,
    Buffer,
    Promise,
    document: documentStub,
    localStorage: { getItem: () => null, setItem: noop },
    location: { href: 'http://127.0.0.1/' },
    setTimeout: noop,
    setInterval: noop,
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame: () => 0,
    alert: noop,
    crypto: {
      randomUUID: () => '00000000-0000-4000-8000-000000000001',
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = i % 256;
        return a;
      },
    },
    MP: { mode: 'solo', playerId: 0, isHost: true, players: [], action: noop },
    addEventListener: noop,
    removeEventListener: noop,
  });
}

const SLOTS = ['morningDrive', 'midday', 'afternoonDrive', 'evening', 'overnight'];

function stubStation(format, sigType) {
  const prog = {};
  for (const sl of SLOTS) prog[sl] = { talent: null, quality: 50 };
  return {
    id: 'sample',
    format,
    sig: { type: sigType, pw: sigType === 'AM' ? '50kw' : '100kw' },
    prog,
    isPlayer: true,
    fmBooster: false,
    _bpSlotDeferred: false,
    isPublic: false,
  };
}

/** vacMask: bits 0..4 = vacant slots; lightBits: subset of vacs run as voice-track / syndicated */
function applyScenario(s, vacMask, lightBits) {
  SLOTS.forEach((sl, i) => {
    delete s.prog[sl].staffingMode;
    if ((vacMask & (1 << i)) === 0) {
      s.prog[sl].talent = {
        name: `Host${i}`,
        quality: 60,
        formatFit: { [s.format]: 0.7 },
        salary: 40000,
        cyr: 2,
        morale: 70,
      };
    } else {
      s.prog[sl].talent = null;
      if (lightBits & (1 << i)) s.prog[sl].staffingMode = 'light';
    }
  });
}

const SCENARIOS = [
  { name: 'All live local', vac: 0, light: 0 },
  { name: 'MD vacant (auto)', vac: 1, light: 0 },
  { name: 'MD+PM drive vacant', vac: 1 | 4, light: 0 },
  { name: 'MD+mid+PM vacant (mid voice-track)', vac: 1 | 2 | 4, light: 2 },
  { name: 'All vacant automation', vac: 31, light: 0 },
  { name: 'All vacant voice-track', vac: 31, light: 31 },
];

const CASES = [
  { label: 'AM NEWS_TALK 1985', year: 1985, format: 'NEWS_TALK', sig: 'AM' },
  { label: 'FM COUNTRY 1995', year: 1995, format: 'COUNTRY', sig: 'FM' },
  { label: 'FM TOP40 2015', year: 2015, format: 'TOP40', sig: 'FM' },
  { label: 'AM BROKERED 1990', year: 1990, format: 'BROKERED_PROGRAMMING', sig: 'AM' },
];

let legacySrc = readFileSync(legacyPath, 'utf8');
if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
  throw new Error('ACTIVE_MARKET anchor missing');
}
legacySrc = legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, "let ACTIVE_MARKET='wichita'");
const ctx = makeCtx();
ctx.globalThis = ctx;
ctx.window = ctx;
vm.runInContext(legacySrc, ctx);

const bundle = ctx.staffingAutomationDiagnosticBundle;
if (typeof bundle !== 'function') {
  throw new Error('staffingAutomationDiagnosticBundle not exported');
}

console.log('Staffing automation samples (appeal mult = appl trim; identity = localism growth mult)\n');
for (const c of CASES) {
  console.log(`\n=== ${c.label} ===`);
  console.log('scenario\tscore\tlabel\tappeal\tidentity\tstaffCost\topsFloor\teraTol\teraTolEff');
  const G = { year: c.year, marketId: 'wichita' };
  const s = stubStation(c.format, c.sig);
  for (const sc of SCENARIOS) {
    applyScenario(s, sc.vac, sc.light);
    const row = bundle(s, G);
    console.log(
      `${sc.name}\t${row.score}\t${row.label}\t${row.appeal}\t${row.identity}\t${row.staffCostMult}\t${row.opsFloorMult}\t${row.eraTol}\t${row.eraTolEff}`,
    );
  }
}
