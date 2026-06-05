/**
 * Diagnostic-only legend pipeline A/B hooks (VM — not shipped gameplay).
 * Variants: A=baseline, B=high-ceiling gen, C=career breakout, D=B+C mild, E=B+C strong.
 */
(function () {
  'use strict';

  const TALK_FMTS = new Set([
    'NEWS_TALK',
    'PERSONALITY_TALK',
    'ALL_NEWS',
    'TALK',
    'SPORTS_TALK',
  ]);
  const HITS_FMTS = new Set(['TOP40', 'CHR', 'AC', 'HOT_AC', 'URBAN', 'COUNTRY']);
  const DRIVE_SLOTS = new Set(['morningDrive', 'afternoonDrive']);

  const GEN_RATE = {
    mild: { small: 0.002, medium: 0.0035, large: 0.006, mega: 0.009 },
    strong: { small: 0.0035, medium: 0.006, large: 0.01, mega: 0.015 },
  };

  const BREAK_RATE = { mild: 0.028, strong: 0.048 };
  const BREAK_DELTA = { mild: [0.4, 0.85], strong: [0.65, 1.25] };

  globalThis.WL_LEGEND_AB = { variant: 'A' };

  globalThis.wlLegendAbSetVariant = function wlLegendAbSetVariant(variant) {
    WL_LEGEND_AB.variant = variant || 'A';
  };

  function abStrength() {
    const v = WL_LEGEND_AB.variant;
    return v === 'E' ? 'strong' : 'mild';
  }

  function generationEnabled() {
    const v = WL_LEGEND_AB.variant;
    return v === 'B' || v === 'D' || v === 'E';
  }

  function breakoutEnabled() {
    const v = WL_LEGEND_AB.variant;
    return v === 'C' || v === 'D' || v === 'E';
  }

  function slotFmtBias(slot, fmt) {
    let mult = 1;
    if (DRIVE_SLOTS.has(slot)) mult *= 2.4;
    if (TALK_FMTS.has(fmt)) mult *= 1.85;
    if (HITS_FMTS.has(fmt)) mult *= 1.35;
    if (fmt === 'PERSONALITY_TALK') mult *= 1.2;
    return mult;
  }

  globalThis.wlLegendAbMkTalAdjust = function wlLegendAbMkTalAdjust(tal, slot, fmt, tier, marketId, Gref) {
    if (!generationEnabled() || !tal) return;
    const rk = ((typeof MARKETS !== 'undefined' && MARKETS[marketId]) || {}).rankTier || 'medium';
    const rates = GEN_RATE[abStrength()];
    const base = rates[rk] || rates.medium;
    const p = base * slotFmtBias(slot, fmt);
    if (Math.random() >= p) return;

    const hq = Math.round(85 + Math.random() * 7);
    tal._trueQuality = hq;
    tal._legendAbHighCeiling = true;
    tal.quality = Math.min(97, Math.max(tal.quality | 0, Math.round(hq + (Math.random() * 8 - 4))));
    if (hq >= 88 && tier !== 'star') {
      const bump = Math.round(tal.salary * (1.04 + Math.random() * 0.08) / 500) * 500;
      tal.salary = Math.min(bump, Math.round(tal.salary * 1.14 / 500) * 500);
    }
  };

  globalThis.wlLegendAbFallBreakoutStep = function wlLegendAbFallBreakoutStep(s, sl, t, Gref) {
    if (!breakoutEnabled() || !t || !s) return;
    if ((Gref.period | 0) !== 2) return;

    const tq =
      typeof talentTrueQuality === 'function' ? talentTrueQuality(t) : t._trueQuality || t.quality | 0;
    if (tq < 70 || tq > 82) return;
    if (t._legendAbHighCeiling) return;

    const hireY = t._hireYear != null ? t._hireYear : Gref.year;
    const tenure = Math.max(0, (Gref.year | 0) - hireY);
    if (tenure < 5) return;
    if ((t.morale | 0) < 65) return;

    const share = s.rat?.share || 0;
    if (share < 0.06) return;

    let rank = null;
    try {
      if (typeof rankStationsByShareCompetition === 'function') {
        const rr = rankStationsByShareCompetition(Gref.stations || []);
        rank = rr.rankById?.[s.id] ?? null;
      }
    } catch (_e) {
      return;
    }
    if (rank == null || rank > 5) return;

    const strength = abStrength();
    const rate = BREAK_RATE[strength] * (DRIVE_SLOTS.has(sl) ? 1.35 : 1);
    if (Math.random() >= rate) return;

    const [lo, hi] = BREAK_DELTA[strength];
    const delta = lo + Math.random() * (hi - lo);
    const cap = 94;
    if (typeof t._trueQuality === 'number' && !Number.isNaN(t._trueQuality)) {
      t._trueQuality = Math.min(cap, Math.round(t._trueQuality + delta));
    } else {
      t._trueQuality = Math.min(cap, Math.round(tq + delta));
    }
    t.quality = Math.min(100, Math.max(t.quality | 0, Math.round(t.quality + delta * 0.45)));
    t._legendAbBreakoutSteps = (t._legendAbBreakoutSteps || 0) + 1;
  };
})();
