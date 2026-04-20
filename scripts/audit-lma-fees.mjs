#!/usr/bin/env node
/**
 * Old vs new LMA fee comparison for representative market/year scenarios.
 * Uses scripts/lmaFeeModelShared.mjs (keep in sync with legacy.js LMA_FEE_MODEL_SYNC).
 */
import {
  auditHalfPool,
  lmaComputeFeeRounded,
  legacyFlatFeeRounded,
  lmaEraFactor,
  lmaFmMinimumFeeHalfPeriod,
  marketAnnualBillingAudit,
  MINI_MARKETS,
} from './lmaFeeModelShared.mjs';

const years = [1985, 1993, 1998, 2005, 2015];
const markets = [
  { id: 'nashville', label: 'small/medium' },
  { id: 'atlanta', label: 'large' },
  { id: 'chicago', label: 'mega' },
];

function scenarioShares(label) {
  if (label.includes('small')) return { grossFrac: 0.018, ebitdaOnGross: 0.21 };
  if (label.includes('large')) return { grossFrac: 0.038, ebitdaOnGross: 0.29 };
  return { grossFrac: 0.052, ebitdaOnGross: 0.32 };
}

const rows = [];
for (const { id: mid, label: mlab } of markets) {
  const tier = MINI_MARKETS[mid]?.rankTier || 'large';
  for (const year of years) {
    const pool = auditHalfPool(year, mid, 1, 1);
    const { grossFrac, ebitdaOnGross } = scenarioShares(mlab);
    const grossRev = Math.round(pool * grossFrac);
    const seedEbitda = Math.round(grossRev * ebitdaOnGross);
    const newFm = lmaComputeFeeRounded(pool, grossRev, seedEbitda, tier, year, true);
    const newAm = lmaComputeFeeRounded(pool, grossRev, seedEbitda, tier, year, false);
    const oldF = legacyFlatFeeRounded(grossRev);
    rows.push({
      market: mid,
      tier: mlab,
      year,
      eraE: Number(lmaEraFactor(year).toFixed(3)),
      annualBillM: Math.round(marketAnnualBillingAudit(year, mid) / 1e5) / 10,
      halfPoolM: Math.round(pool / 1e5) / 10,
      grossK: Math.round(grossRev / 1000),
      ebitdaK: Math.round(seedEbitda / 1000),
      newFeeFmK: Math.round(newFm / 1000),
      newFeeAmK: Math.round(newAm / 1000),
      oldFeeK: Math.round(oldF / 1000),
      newPctEbitdaFm: seedEbitda > 0 ? Math.round((newFm / seedEbitda) * 100) : '—',
      oldPctEbitda: seedEbitda > 0 ? Math.round((oldF / seedEbitda) * 100) : '—',
    });
  }
}

console.log('LMA fee audit — hypothetical station vs half-period market pool (spring, adx=1)');
console.log('grossRev = pool * stationShare; seedEbitda = gross * typical margin');
console.table(rows);

// Stress: large-market station with ~$13M gross / ~$7M EBITDA half (order of user-reported 1990s distortion)
{
  const year = 1993;
  const pool = auditHalfPool(year, 'atlanta', 1, 1);
  const grossRev = 13_000_000;
  const seedEbitda = 7_000_000;
  const newF = lmaComputeFeeRounded(pool, grossRev, seedEbitda, 'large', year, true);
  const oldF = legacyFlatFeeRounded(grossRev);
  console.log('\nStress (Atlanta 1993, illustrative): gross $13.0M / EBITDA $7.0M half-year');
  console.log('  Old flat 65% fee:', oldF.toLocaleString(), `(${Math.round((oldF / seedEbitda) * 100)}% of EBITDA)`);
  console.log('  New lease-style fee:', newF.toLocaleString(), `(${Math.round((newF / seedEbitda) * 100)}% of EBITDA)`);
}

// Weak station: tiny gross/EBITDA so post-cap fee sits on FM structural floor (×2 ≈ annualized headline).
{
  const year = 1998;
  console.log('\nWeak-FM vs weak-AM floor probe (1998, spring, adx=1 — low gross forces FM onto tier floor):');
  console.log('  FM floor by tier (half-period, pre–$1k round in kernel):', {
    small: lmaFmMinimumFeeHalfPeriod('small'),
    medium: lmaFmMinimumFeeHalfPeriod('medium'),
    large: lmaFmMinimumFeeHalfPeriod('large'),
    mega: lmaFmMinimumFeeHalfPeriod('mega'),
  });
  const grossRev = 12_000;
  const seedEbitda = 3000;
  for (const { id: mid, tier, label } of [
    { id: 'nashville', tier: 'medium', label: 'nashville (medium)' },
    { id: 'atlanta', tier: 'large', label: 'atlanta (large)' },
    { id: 'chicago', tier: 'mega', label: 'chicago (mega)' },
  ]) {
    const pool = auditHalfPool(year, mid, 1, 1);
    const fm = lmaComputeFeeRounded(pool, grossRev, seedEbitda, tier, year, true);
    const am = lmaComputeFeeRounded(pool, grossRev, seedEbitda, tier, year, false);
    const annK = Math.round((fm * 2) / 1000);
    console.log(
      `  ${label}: FM ${fm.toLocaleString()}/half (~$${annK}k/yr) · AM ${am.toLocaleString()}/half · pool≈$${Math.round(pool / 1000)}k`,
    );
  }
}
