/**
 * SYNC: Keep aligned with sellerDisposition / playerAcqAsk in src/legacy.js (search "V1 seller realism").
 * Used by scripts/report-acquisition-sellers.mjs and scripts/test-solo-reentry.mjs.
 */

export const ACP = {
  dominant: 2800000,
  strong: 1800000,
  moderate: 950000,
  emerging: 550000,
  niche: 350000,
  weak: 200000,
};

export function wlHash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function stationIsNoncommercialInstitutional(s) {
  if (!s || s._bpSlotDeferred) return false;
  if (s.isPublic) return true;
  if (s.isReligiousNetwork) return true;
  if (s.format === 'RELIGIOUS_NETWORK') return true;
  return false;
}

export function acqPrice(s, G) {
  const annualRev = (s.fin?.rev || 50000) * 2;
  const base = Math.max(625000, annualRev * 10);
  const corpPremium = s.corpOwner ? 1.6 : 1.0;
  const sharePrem = 1 + s.rat.share * 4;
  return Math.round((base * corpPremium * sharePrem) / 100000) * 100000;
}

export function sellerDispositionHashU(s, G, salt) {
  return (
    (wlHash32(
      String(G.marketId || '') +
        '::' +
        String(s.id || '') +
        '::seller::' +
        salt +
        '::' +
        (G.year || 1970) +
        '::' +
        (G.period || 1) +
        '::' +
        (G.turn || 0)
    ) %
      10000) /
    10000
  );
}

export function sellerDisposition(s, G, opts) {
  opts = opts || {};
  const lmaBuyout = !!opts.lmaBuyout;
  const chipFor = (t) => {
    if (t === 'not_for_sale') return 'not_for_sale';
    if (t === 'reluctant') return 'premium_ask';
    if (t === 'eager') return 'motivated_seller';
    if (t === 'distressed') return 'distressed_seller';
    return 'market_price';
  };
  if (!s || s.isPlayer || s._bpSlotDeferred || stationIsNoncommercialInstitutional(s))
    return { tier: 'normal', mult: 1, chip: 'market_price' };
  const comm = (G.stations || [])
    .filter((x) => x && !x._bpSlotDeferred && !stationIsNoncommercialInstitutional(x) && !x.isPlayer)
    .sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
  const n = Math.max(1, comm.length);
  const marketDepth = n >= 5;
  const rank = comm.findIndex((x) => x.id === s.id) + 1;
  const sh = Math.max(0, Number(s.rat?.share) || 0);
  const eb = s.fin?.ebitda ?? 0;
  const annualRev = Math.max(0, Number(s.fin?.rev) || 0) * 2;
  const isCorp = !!s.corpOwner;
  const year = G.year || 1970;
  const post96 = year >= 1996;
  const uA = sellerDispositionHashU(s, G, 'A');
  const uB = sellerDispositionHashU(s, G, 'B');

  let tier = 'normal';
  if (eb < -22000 || sh < 0.012 || (eb < -9000 && sh < 0.03)) tier = 'distressed';
  else if (marketDepth && rank === 1 && sh >= 0.054 && eb > 8000) tier = 'not_for_sale';
  else if (marketDepth && rank === 2 && sh >= 0.052 && eb > 20000 && annualRev > 400000 && isCorp)
    tier = 'not_for_sale';
  else if (
    marketDepth &&
    ((rank <= 2 && sh >= 0.046 && eb > -4000) ||
      (rank <= 3 && sh >= 0.04 && (eb > 12000 || isCorp)) ||
      (rank <= 5 && isCorp && sh >= 0.033 && (eb > -12000 || sh >= 0.038)) ||
      (rank <= 3 && eb > 48000))
  )
    tier = 'reluctant';
  else if (!marketDepth && isCorp && rank <= 3 && sh >= 0.036 && eb > -15000) tier = 'reluctant';
  else if (post96 && !isCorp && marketDepth && rank >= Math.ceil(n * 0.48) && sh < 0.042 && eb < 28000 && eb >= -12000)
    tier = 'eager';

  let mult = 1;
  if (tier === 'reluctant') mult = 1.5 + uA * 0.75;
  else if (tier === 'eager') mult = 0.85 + uB * 0.1;
  else if (tier === 'distressed') mult = 0.6 + uB * 0.2;
  else if (tier === 'not_for_sale') mult = 0;

  if (lmaBuyout) {
    if (tier === 'not_for_sale') {
      tier = 'normal';
      mult = 1;
    } else if (tier === 'reluctant') mult = Math.max(1.35, mult * 0.84);
  }

  return { tier, mult, chip: chipFor(tier) };
}

export function playerAcqFairValue(s, G) {
  if (!s || stationIsNoncommercialInstitutional(s)) return null;
  if (s.isPublic) return Math.round((s.oq * 2000 + 62500) / 12500) * 12500;
  return acqPrice(s, G) || ACP[s.str] || 50000;
}

export function playerAcqAsk(s, G, opts) {
  if (!s || stationIsNoncommercialInstitutional(s)) return null;
  const fair = playerAcqFairValue(s, G);
  if (fair == null || !Number.isFinite(fair) || fair <= 0) return null;
  const d = sellerDisposition(s, G, opts);
  if (d.tier === 'not_for_sale' && !opts?.lmaBuyout) return null;
  const mult = d.tier === 'not_for_sale' ? 1 : d.mult;
  return Math.round((fair * mult) / 100000) * 100000;
}
