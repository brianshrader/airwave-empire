#!/usr/bin/env node
/**
 * Sample van repaint costs — keep formulas aligned with src/legacy.js (search VAN_REPAINT_BASE).
 */
function salInflMultiplier(year) {
  const y = year == null || !Number.isFinite(Number(year)) ? 1970 : Number(year);
  const p1 = Math.max(0, Math.min(15, y - 1970));
  const p2 = Math.max(0, Math.min(15, y - 1985));
  const p3 = Math.max(0, y - 2000);
  return 1.0 + p1 * 0.07 + p2 * 0.035 + p3 * 0.015;
}
function vanRepaintGraphicsCatchUp(year) {
  const y = Math.max(1970, Math.min(2040, year == null || !Number.isFinite(Number(year)) ? 1970 : Number(year)));
  return 1 + Math.min(1.28, (y - 1970) * 0.0225);
}
const VAN_REPAINT_BASE_1970_STANDARD = 540;
const TIER = { basic: 0.78, standard: 1, enhanced: 1.28, premium: 1.55 };
function marketMult(rankTier) {
  if (rankTier === 'mega') return 1.08;
  if (rankTier === 'large') return 1.03;
  if (rankTier === 'medium') return 0.98;
  return 0.93;
}
function cost(year, tier, rankTier = 'large', fleetN = 1) {
  const m = salInflMultiplier(year);
  const catchUp = vanRepaintGraphicsCatchUp(year);
  const tierK = TIER[tier] ?? 1;
  let c = VAN_REPAINT_BASE_1970_STANDARD * m * catchUp * tierK * marketMult(rankTier);
  if (fleetN > 1) c *= Math.max(0.85, 1 - 0.055 * Math.min(fleetN - 1, 4));
  return Math.max(75, Math.round(c / 25) * 25);
}

const years = [1970, 1985, 1995, 2005, 2015, 2025];
const rows = [];
for (const y of years) {
  rows.push({
    year: y,
    m: Number(salInflMultiplier(y).toFixed(3)),
    catchUp: Number(vanRepaintGraphicsCatchUp(y).toFixed(3)),
    standard_atl: cost(y, 'standard', 'large', 1),
    premium_atl: cost(y, 'premium', 'large', 1),
    standard_mega: cost(y, 'standard', 'mega', 1),
    premium_mega: cost(y, 'premium', 'mega', 1),
  });
}
console.log('Van repaint / branding (Atlanta large, single van) — Standard vs Premium tiers');
console.table(rows);

console.log('\nBefore (old model): repaint = max($2200, round(purchase × 0.30)) — e.g. 1970 ≈ $4,800 tied to van purchase price.');
console.log('After: 1970 standard ≈ $540 × tier; scales with salInflMultiplier + catch-up (see legacy.js).');
