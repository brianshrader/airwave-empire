/**
 * Prototype: share concentration Phase 1 (NOT production-ready).
 *
 * Enable: window.__WL_SHARE_COMPRESSION_PHASE1 = true (play.html on this branch only).
 *
 * Playtest toggle (play.html): ?proto=share (default) | baseline | rivalry | both
 *
 * Knobs (research package — playable feel test, not Duncan-calibrated):
 * 1. Tier-aware commercial mass scale after L1 cohort appeal
 * 2. ListeningHours blend ~0.45 (pull final book back toward pre-LH habit headline)
 * 3. OtherAudio leader relief ×0.70
 *
 * Do not merge to tutorial-early-win-clean or deploy without regression gates.
 */
(function shareCompressionPhase1(global) {
  'use strict';

  const ENABLED = global.__WL_SHARE_COMPRESSION_PHASE1 === true;
  if (!ENABLED) return;

  /** Tier L1 mass scale table (matches diagnostic TIER_BASE defaults). */
  const TIER_MASS = { mega: 0.58, large: 0.64, small: 0.52 };
  const MEDIUM_EARLY = 0.78; // year <= 1998
  const MEDIUM_LATE = 0.55;
  const LH_BLEND = 0.45;
  const OA_LEADER_RELIEF_MULT = 0.70;

  function tierMassScale(G) {
    const m = MARKETS[G.marketId || ACTIVE_MARKET] || MARKETS.atlanta;
    const tier = m.rankTier || 'medium';
    const y = G.year || 1970;
    if (tier === 'mega') return TIER_MASS.mega;
    if (tier === 'large') return TIER_MASS.large;
    if (tier === 'small') return TIER_MASS.small;
    return y <= 1998 ? MEDIUM_EARLY : MEDIUM_LATE;
  }

  /** Uniform commercial mass scale after cohort appeal (L1). Preserves relative habit-weighted ranks. */
  global.applyShareCompressionTierMassScale = function applyShareCompressionTierMassScale(stations, G) {
    if (!ENABLED || !G || G._modernColdStartIncumbentRecalc) return;
    const scale = tierMassScale(G);
    if (!Number.isFinite(scale) || scale >= 0.999) return;
    G._shareCompressionMassScaleApplied = scale;
    const denom = publicRadioWeightedListeningDenominator(stations, G);
    stations.forEach((s) => {
      if (!s || s._bpSlotDeferred || typeof stationIsNoncommercialInstitutional !== 'function') return;
      if (stationIsNoncommercialInstitutional(s) || !s.rat) return;
      COH.forEach((coh) => {
        const cur = s.rat.cur[coh];
        if (!cur) return;
        cur.share = Math.round(cur.share * scale * 10000) / 10000;
        const pop = (POP.cohorts[coh]?.t || 0) * effUniverse(s);
        const engage = AQH_ENGAGE[coh] || 0.060;
        cur.aqh = Math.round(cur.share * pop * engage);
        if (s.mom[coh]) {
          s.mom[coh].cur = cur.share;
          s.mom[coh].tgt = Math.min(0.22, (s.mom[coh].tgt || cur.share) * scale);
        }
      });
      s.rat.aqh = COH.reduce((sum, c) => sum + (s.rat.cur[c]?.aqh || 0), 0);
      const H = publicNewsHabitEngageMult(s, G);
      s.rat.share = COH.reduce((sum, c) => {
        const pop = POP.cohorts[c]?.t || 0;
        const engage = (AQH_ENGAGE[c] || 0.060) * H;
        return sum + (s.rat.cur[c]?.share || 0) * (pop * engage);
      }, 0) / denom;
    });
  };

  global.shareCompressionPhase1TrimLeaderRelief = function shareCompressionPhase1TrimLeaderRelief(leaderRelief) {
    return leaderRelief * OA_LEADER_RELIEF_MULT;
  };

  global.shareCompressionPhase1BeginListeningHours = function shareCompressionPhase1BeginListeningHours(rated, G) {
    if (!ENABLED || !G || LH_BLEND <= 0) return null;
    const pre = new Map();
    for (const s of rated) pre.set(s.id, s.rat?.share || 0);
    return pre;
  };

  global.shareCompressionPhase1EndListeningHours = function shareCompressionPhase1EndListeningHours(rated, G, preLh) {
    if (!ENABLED || !G || !preLh || LH_BLEND <= 0) return;
    const blend = LH_BLEND;
    for (const s of rated) {
      const pre = preLh.get(s.id);
      if (pre == null) continue;
      const post = s.rat?.share || 0;
      s.rat.share = Math.round((post * (1 - blend) + pre * blend) * 1e8) / 1e8;
    }
  };

  global.shareCompressionPhase1Config = function shareCompressionPhase1Config() {
    return {
      enabled: true,
      tierMass: TIER_MASS,
      mediumEarly: MEDIUM_EARLY,
      mediumLate: MEDIUM_LATE,
      lhBlend: LH_BLEND,
      oaLeaderReliefMult: OA_LEADER_RELIEF_MULT,
    };
  };

  if (typeof console !== 'undefined' && console.info) {
    console.info('[share compression Phase 1] ENABLED — prototype branch, not Duncan-calibrated.');
  }
})(typeof window !== 'undefined' ? window : globalThis);
