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
