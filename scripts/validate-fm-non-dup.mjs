#!/usr/bin/env node
/**
 * Unit check for AM/FM non-duplication caps (mirrors legacy.js getMaxSimulcastPct bands).
 * Run: node scripts/validate-fm-non-dup.mjs
 */
function marketRankTierToFccSimulcastTier(marketId) {
  const mega = new Set(['newyork', 'losangeles', 'chicago']);
  const large = new Set(['atlanta']);
  if (mega.has(marketId)) return 1;
  if (large.has(marketId)) return 2;
  return 3;
}
function getMaxSimulcastPct(year, fccTier) {
  const y = year || 1970;
  const t = fccTier < 2 ? 1 : fccTier > 2 ? 3 : Math.round(fccTier);
  if (y >= 1996) return 100;
  if (y >= 1986) {
    if (t === 1) return 80;
    return 100;
  }
  if (y >= 1979) {
    if (t === 1) return 60;
    if (t === 2) return 75;
    return 100;
  }
  if (t === 1) return 50;
  if (t === 2) return 60;
  return 80;
}

function check(name, cond) {
  if (!cond) {
    console.error('FAIL:', name);
    process.exitCode = 1;
  } else console.log('ok:', name);
}

const y1970 = 1970;
check('NY 1970 tier1 cap 50', getMaxSimulcastPct(y1970, marketRankTierToFccSimulcastTier('newyork')) === 50);
check('CHI 1970 tier1 cap 50', getMaxSimulcastPct(y1970, marketRankTierToFccSimulcastTier('chicago')) === 50);
check('ATL 1970 tier2 cap 60', getMaxSimulcastPct(y1970, marketRankTierToFccSimulcastTier('atlanta')) === 60);
check('NSH 1970 tier3 cap 80', getMaxSimulcastPct(y1970, marketRankTierToFccSimulcastTier('nashville')) === 80);
check('NY 1990 tier1 cap 80', getMaxSimulcastPct(1990, 1) === 80);
check('NY 1996 cap 100', getMaxSimulcastPct(1996, 1) === 100);
check('NY 2005 cap 100', getMaxSimulcastPct(2005, 1) === 100);

console.log(process.exitCode ? 'Some checks failed.' : 'All checks passed.');
