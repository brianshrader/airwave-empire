/**
 * LMA fee model — LMA_FEE_MODEL_SYNC (keep in sync with src/legacy.js LMA_FEE_MODEL_SYNC_START/END).
 * Standalone module for audit scripts; duplicates billing spine constants only.
 */
export const LMA_LEGACY_FLAT_RATE = 0.65;

const MARKET_BILLING_CURVE = {
  1970: 14000000, 1975: 24000000, 1980: 42000000, 1985: 68000000, 1987: 82000000,
  1990: 100000000, 1995: 130000000, 2000: 160000000, 2005: 148000000,
  2010: 130000000, 2015: 116000000, 2020: 110000000,
};

export const MINI_MARKETS = {
  nashville: { revScale: 0.5, rankTier: 'medium' },
  atlanta: { revScale: 1.0, rankTier: 'large' },
  chicago: { revScale: 2.8, rankTier: 'mega' },
  newyork: { revScale: 6.8, rankTier: 'mega' },
};

function marketRevScaleSecondaryLift(rs) {
  const r = rs == null || Number.isNaN(rs) ? 1 : rs;
  if (r >= 1) return 1;
  return 1 + (1 - r) * 0.5;
}

const BILLING_REVSCALE_EXP = 0.6;
function billingEffectiveRevScale(rs) {
  const r = rs == null || Number.isNaN(rs) ? 1 : Number(rs);
  if (r <= 1) return r;
  return Math.pow(r, BILLING_REVSCALE_EXP);
}

export function marketAnnualBillingAudit(year, marketId) {
  const mkt = MINI_MARKETS[marketId] || MINI_MARKETS.atlanta;
  const rsRaw = mkt.revScale || 1;
  const rs = billingEffectiveRevScale(rsRaw);
  const lift = marketRevScaleSecondaryLift(rsRaw);
  const ys = Object.keys(MARKET_BILLING_CURVE).map(Number).sort((a, b) => a - b);
  if (year <= ys[0]) return Math.round(MARKET_BILLING_CURVE[ys[0]] * rs * lift);
  if (year >= ys[ys.length - 1]) return Math.round(MARKET_BILLING_CURVE[ys[ys.length - 1]] * rs * lift);
  for (let i = 1; i < ys.length; i++) {
    const y0 = ys[i - 1], y1 = ys[i];
    if (year <= y1) {
      const t = (year - y0) / (y1 - y0);
      const v = MARKET_BILLING_CURVE[y0] + (MARKET_BILLING_CURVE[y1] - MARKET_BILLING_CURVE[y0]) * t;
      return Math.round(v * rs * lift);
    }
  }
  return Math.round(MARKET_BILLING_CURVE[1987] * rs * lift);
}

export function marketHalfSeasonFactorAudit(year, period) {
  const base = period === 2 ? 1.04 : 0.96;
  const election = period === 2 && year % 2 === 0 ? 1.03 : 1.0;
  return base * election;
}

/** Era weight: pre-1990 weak → 1990s ramp → 1996–2003 peak → gradual fade post-mid-2000s. */
export function lmaEraFactor(year) {
  const y = year;
  if (y < 1988) return 0.34;
  if (y < 1990) return 0.38 + (y - 1988) * 0.02;
  if (y <= 1995) return 0.46 + ((y - 1990) / 5) * 0.44;
  if (y <= 2003) return 0.9 + ((y - 1995) / 8) * 0.12;
  if (y <= 2012) return 1.02 - ((y - 2003) / 9) * 0.22;
  return Math.max(0.72, 0.8 - (y - 2012) * 0.004);
}

const LMA_K_BASE = { mega: 0.003, large: 0.0023, medium: 0.0016, small: 0.0012 };
const LMA_K_PERF = 0.048;

function lmaAbsoluteCapHalfYear(year, rankTier) {
  const e = lmaEraFactor(year);
  const tierM = rankTier === 'mega' ? 1.0 : rankTier === 'large' ? 0.72 : 0.48;
  const v = 2.15e6 * (0.62 + 0.38 * e) * tierM;
  return Math.round(v / 5000) * 5000;
}

/**
 * @param {number} halfPeriodMarketPool — same construction as seedRev halfTarget (annual*0.5*halfSeason*adx)
 * @param {number} grossRev — station gross billing this half-year (pre-LMA override)
 * @param {number} seedEbitda — operating EBITDA before LMA cash (lessor: pre-override; lessee: current fin.ebitda)
 * @param {string} rankTier — MARKETS[].rankTier
 * @param {number} year
 * @param {boolean} isFm
 */
export function lmaComputeFeeRounded(halfPeriodMarketPool, grossRev, seedEbitda, rankTier, year, isFm) {
  const tier = rankTier || 'large';
  const kb = LMA_K_BASE[tier] ?? LMA_K_BASE.large;
  const sigM = isFm ? 1.06 : 1.0;
  const E = lmaEraFactor(year);
  const raw = (halfPeriodMarketPool * kb + grossRev * LMA_K_PERF * sigM) * E;
  const capRev = grossRev * 0.11;
  const capEbitda = seedEbitda > 0 ? seedEbitda * 0.28 : Number.POSITIVE_INFINITY;
  const absCap = lmaAbsoluteCapHalfYear(year, tier);
  let fee = Math.min(raw, capRev, capEbitda, absCap);
  if (fee < 0) fee = 0;
  return Math.round(fee / 1000) * 1000;
}

export function legacyFlatFeeRounded(grossRev) {
  return Math.round((grossRev * LMA_LEGACY_FLAT_RATE) / 1000) * 1000;
}

export function auditHalfPool(year, marketId, period = 1, adx = 1) {
  const annual = marketAnnualBillingAudit(year, marketId);
  const hsf = marketHalfSeasonFactorAudit(year, period);
  const adxU = Math.max(0.75, adx);
  return Math.round(annual * 0.5 * hsf * adxU);
}
