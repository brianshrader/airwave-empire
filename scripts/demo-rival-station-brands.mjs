#!/usr/bin/env node
/**
 * Prints sample rival station brands (1970s-style) for QA and copy review.
 * `node scripts/demo-rival-station-brands.mjs`
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const b = require('../server/rivalStationBranding.js');

function row(r) {
  return [
    r.market,
    r.format,
    r.callLetters,
    r.frequency,
    r.publicShortBrand,
    r.nickname || '—',
    r.positioningLine,
    r.scores.overall,
    r.redFlag.ok ? 'pass' : 'FAIL',
  ].join('\t');
}

console.log('=== 20 samples per format (Chicago, W***) ===\n');
const grid = b.generateFormatSampleGrid(20);
for (const fmt of Object.keys(grid)) {
  console.log(`--- ${fmt} ---`);
  console.log('market\tformat\tcall\tdialHuman\tshortBrand\tnickname\tpositioning\tscore\tredFlag');
  for (const r of grid[fmt]) {
    console.log(row(r));
  }
  console.log('');
}

console.log('\n=== Multi-market showcase (W east of Mississippi, K west) ===\n');
const mk = b.generateMultiMarketSamples();
for (const [mid, stations] of Object.entries(mk)) {
  console.log(`--- ${mid} ---`);
  for (const r of stations) {
    console.log(JSON.stringify(r, null, 2));
    console.log('');
  }
}
