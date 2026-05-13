#!/usr/bin/env node
/**
 * Audit signal-swap fee by game year. Logic must match src/legacy.js
 * (BASE_SWAP_SIGNAL_FEE, swapSignalFeeEraMult, swapSignalFeeForYear).
 */
const BASE_SWAP_SIGNAL_FEE = 25000;
function swapSignalFeeEraMult(year) {
  const y = typeof year === 'number' ? year : 1985;
  if (y < 1980) return 0.85;
  if (y < 1993) return 1.0;
  if (y < 2003) return 1.2;
  if (y < 2008) return 1.3;
  return 1.15;
}
function swapSignalFeeForYear(year) {
  const raw = BASE_SWAP_SIGNAL_FEE * swapSignalFeeEraMult(year);
  return Math.round(raw / 1000) * 1000;
}

const samples = [1975, 1985, 1998, 2005, 2012];
console.log('swap-signal fee audit (BASE $25K × era mult, round to $1K)\n');
for (const y of samples) {
  const m = swapSignalFeeEraMult(y);
  const fee = swapSignalFeeForYear(y);
  console.log(`  ${y}: mult=${m} → ${fee.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`);
}

const f1975 = swapSignalFeeForYear(1975);
const f1985 = swapSignalFeeForYear(1985);
const f1998 = swapSignalFeeForYear(1998);
const f2005 = swapSignalFeeForYear(2005);
const f2012 = swapSignalFeeForYear(2012);

const checks = [
  ['1975 < 25K', f1975 < 25000],
  ['1985 ≈ 25K', f1985 === 25000],
  ['1998 > 25K', f1998 > 25000],
  ['2005 ≥ 1998', f2005 >= f1998],
  ['2012 < 2005 (post-peak soften)', f2012 < f2005],
];
let ok = true;
for (const [label, pass] of checks) {
  const mark = pass ? '✓' : '✗';
  if (!pass) ok = false;
  console.log(`  ${mark} ${label}`);
}
process.exit(ok ? 0 : 1);
