/**
 * Spanish Composition — commercial music pillar runtime (launch sequencing, appeal decomposition, rival durability).
 * FM/FA/DRIFT for pillars live in legacy.js; this module owns lane competition wiring only.
 */
(function realismSpanishComposition(global) {
  'use strict';

  const UMBRELLA = 'SPANISH';

  const DEFAULT_CONFIG = {
    enabled: true,
    commercialMajor: ['REGIONAL_MEXICAN', 'SPANISH_CONTEMPORARY'],
    commercialSecondary: ['SPANISH_TROPICAL', 'SPANISH_ADULT_HITS'],
    spokenCommercial: ['SPANISH_NEWS_TALK'],
    /** Megamarket Hispanic AM talk migration path (post-1998 music → talk). */
    amTalkMigrationMarkets: ['losangeles', 'newyork', 'miami'],
    tropicalArchetypes: ['northeast_mega', 'west_fm_fragmented', 'sunbelt_diversified'],
    sunbeltLaunchSequence: [
      'REGIONAL_MEXICAN',
      'SPANISH_CONTEMPORARY',
      'REGIONAL_MEXICAN',
      'SPANISH_ADULT_HITS',
    ],
    /** Lane >15% with fewer than 4 Spanish FMs — Houston duopoly guard (Duncan-shaped fragmentation). */
    concentratedLaneShareGe: 0.15,
    concentratedLaneDialCountLt: 4,
    concentratedLaneStrength: 0.52,
    concentratedLaneDuopolyStrength: 0.38,
  };

  function cfg() {
    return { ...DEFAULT_CONFIG, ...(global.__REALISM_SPANISH_COMPOSITION_V1__ || {}) };
  }

  function enabled() {
    if (global.__WL_REALISM_SPANISH_COMPOSITION_POC === false) return false;
    const c = cfg();
    return c.enabled !== false;
  }

  function commercialFmts() {
    const c = cfg();
    return [...(c.commercialMajor || []), ...(c.commercialSecondary || [])];
  }

  function spokenCommercialFmts() {
    const c = cfg();
    return [...(c.spokenCommercial || ['SPANISH_NEWS_TALK'])];
  }

  function isCommercialFmt(fmt) {
    if (!enabled()) return fmt === UMBRELLA;
    const k = String(fmt || '').trim().toUpperCase();
    return commercialFmts().includes(k);
  }

  function isSpanishSpokenWordFmt(fmt) {
    if (!enabled()) return false;
    const k = String(fmt || '').trim().toUpperCase();
    return spokenCommercialFmts().includes(k);
  }

  function isSpanishLaneMusicFmt(fmt) {
    return isUmbrellaSpanishFmt(fmt) || (enabled() && isCommercialFmt(fmt));
  }

  function isUmbrellaSpanishFmt(fmt) {
    return String(fmt || '').trim().toUpperCase() === UMBRELLA;
  }

  /** Umbrella + music + spoken Spanish — use for lane identity / family buckets. */
  function isSpanishLaneFmt(fmt) {
    if (isSpanishLaneMusicFmt(fmt)) return true;
    return enabled() && isSpanishSpokenWordFmt(fmt);
  }

  function isSpanishLaunchBpFmt(fmt) {
    return isUmbrellaSpanishFmt(fmt) || (enabled() && isCommercialFmt(fmt));
  }

  function cohortKeys() {
    const COH = legacyRef('COH');
    if (COH && COH.length) return COH;
    return ['12-17', '18-24', '25-34', '35-49', '50-64', '65+'];
  }

  /** legacy.js binds FM/FA/etc. as const — not on globalThis until initCore; vm eval reaches lexical bindings. */
  function legacyRef(name) {
    if (global[name] != null) return global[name];
    if (global.window && global.window[name] != null) return global.window[name];
    try {
      return (0, eval)(name);
    } catch (_e) {
      return undefined;
    }
  }

  function ensureFmFaInstalled() {
    if (!enabled()) return false;
    const FM = legacyRef('FM');
    if (!FM?.REGIONAL_MEXICAN) return false;
    installFmFa();
    return true;
  }

  function computeMassScales() {
    global.__spanishCompositionCohortSkew = computeCohortSkews();
  }

  function computeCohortSkews() {
    const FA = legacyRef('FA');
    if (!FA?.SPANISH) return {};
    const keys = cohortKeys();
    const skews = {};
    commercialFmts().forEach((fmt) => {
      const ratios = keys.map((c) => (FA[fmt]?.[c] || 0) / Math.max(1e-6, FA.SPANISH[c] || 0.1));
      const mean = ratios.reduce((a, b) => a + b, 0) / Math.max(1, keys.length);
      const row = {};
      keys.forEach((c, i) => {
        row[c] = mean > 1e-6 ? ratios[i] / mean : 1;
      });
      skews[fmt] = row;
    });
    return skews;
  }

  function isSunbeltCompositionMarket(marketId) {
    const m = typeof MARKETS !== 'undefined' ? MARKETS[marketId || ''] : null;
    if (!m) return false;
    const arch = String(m.archetypeId || '');
    const h = m.hispPop2020 ?? 0;
    const span = (m.culture && m.culture.spanish) ?? 0;
    if (arch === 'sunbelt_diversified' || arch === 'texas_sunbelt') return true;
    return h >= 0.18 && span >= 0.10;
  }

  function isTropicalMarket(marketId) {
    const m = typeof MARKETS !== 'undefined' ? MARKETS[marketId || ''] : null;
    if (!m) return false;
    const arches = cfg().tropicalArchetypes || [];
    return arches.includes(String(m.archetypeId || ''));
  }

  function launchSequenceForMarket(marketId) {
    const base = cfg().sunbeltLaunchSequence || [
      'REGIONAL_MEXICAN',
      'SPANISH_CONTEMPORARY',
      'REGIONAL_MEXICAN',
      'SPANISH_ADULT_HITS',
    ];
    if (!isTropicalMarket(marketId)) {
      return base.filter((f) => f !== 'SPANISH_TROPICAL');
    }
    return base;
  }

  function defaultSpanishSubtypeFmt() {
    return 'REGIONAL_MEXICAN';
  }

  function fmtForLaunchSlot(marketId, slot) {
    if (!enabled() || !isSunbeltCompositionMarket(marketId)) return defaultSpanishSubtypeFmt();
    const seq = launchSequenceForMarket(marketId);
    if (!seq.length) return defaultSpanishSubtypeFmt();
    return seq[Math.min(slot, seq.length - 1)] || defaultSpanishSubtypeFmt();
  }

  function unifiedSpanishLaunchEntries(marketId) {
    const m = typeof MARKETS !== 'undefined' ? MARKETS[marketId || ''] : null;
    const entries = [];
    if (m && Array.isArray(m.spanishLaunches)) {
      m.spanishLaunches.forEach((ent) => {
        if (ent.bp && (isUmbrellaSpanishFmt(ent.bp.fmt) || isCommercialFmt(ent.bp.fmt))) {
          entries.push({
            id: ent.id || `spanish_${ent.y}_${ent.p}`,
            y: ent.y,
            p: ent.p || 1,
            source: 'spanish',
          });
        }
      });
    }
    if (m && Array.isArray(m.fragmentationLaunches)) {
      m.fragmentationLaunches.forEach((ent) => {
        if (ent.bp && (isUmbrellaSpanishFmt(ent.bp.fmt) || isCommercialFmt(ent.bp.fmt))) {
          entries.push({
            id: ent.id || `frag_${ent.y}_${ent.p}`,
            y: ent.y,
            p: ent.p || 1,
            source: 'frag',
          });
        }
      });
    }
    entries.sort((a, b) => a.y - b.y || a.p - b.p);
    return entries;
  }

  function launchFmtById(marketId) {
    const map = new Map();
    if (!enabled() || !isSunbeltCompositionMarket(marketId)) return map;
    const entries = unifiedSpanishLaunchEntries(marketId);
    entries.forEach((ent, idx) => {
      map.set(ent.id, fmtForLaunchSlot(marketId, idx));
    });
    return map;
  }

  function applyLaunchDefs(defs, marketId) {
    if (!enabled() || !defs || !defs.length) return defs;
    ensureFmFaInstalled();
    const idMap = launchFmtById(marketId);
    if (!idMap.size) return defs;
    const FM = legacyRef('FM');
    return defs.map((ent) => {
      const bp = ent.bp;
      if (!bp || (!isUmbrellaSpanishFmt(bp.fmt) && !isCommercialFmt(bp.fmt))) return ent;
      const id = ent.id || `spanish_${ent.y}_${ent.p}`;
      const fmt = idMap.get(id);
      if (!fmt || !FM || !FM[fmt]) return ent;
      return { ...ent, bp: { ...bp, fmt } };
    });
  }

  function inheritUmbrellaTables() {
    if (!enabled()) return;
    const fmts = commercialFmts();
    const spoken = spokenCommercialFmts();
    const COMMUNITY_IDENTITY = legacyRef('COMMUNITY_IDENTITY');
    const TALENT_FORMAT_WEIGHT = legacyRef('TALENT_FORMAT_WEIGHT');
    const FGS = legacyRef('FGS');
    const SPORTS_FORMAT_FIT = legacyRef('SPORTS_FORMAT_FIT');
    const MARKET_FMT_ADJ = legacyRef('MARKET_FMT_ADJ');
    const MUSIC_FMTS = legacyRef('MUSIC_FMTS');
    const RESEARCH_STRATEGY_MUSIC_FMTS = legacyRef('RESEARCH_STRATEGY_MUSIC_FMTS');
    const BRANDS = legacyRef('BRANDS');
    const spanCi = COMMUNITY_IDENTITY?.SPANISH;
    const spanTw = TALENT_FORMAT_WEIGHT?.SPANISH;
    const newsTw = TALENT_FORMAT_WEIGHT?.NEWS_TALK;
    const spanFgs = FGS?.SPANISH;
    const newsFgs = FGS?.NEWS_TALK;
    const spanSports = SPORTS_FORMAT_FIT?.SPANISH;
    const spanBrands = BRANDS?.SPANISH;
    const newsBrands = BRANDS?.NEWS_TALK;
    [...fmts, ...spoken].forEach((f) => {
      const isTalk = spoken.includes(f);
      if (COMMUNITY_IDENTITY && spanCi != null && COMMUNITY_IDENTITY[f] == null) {
        COMMUNITY_IDENTITY[f] = isTalk ? (COMMUNITY_IDENTITY.SPANISH_NEWS_TALK ?? spanCi * 0.92) : spanCi;
      }
      if (TALENT_FORMAT_WEIGHT && TALENT_FORMAT_WEIGHT[f] == null) {
        if (isTalk && newsTw != null) TALENT_FORMAT_WEIGHT[f] = newsTw;
        else if (spanTw != null) TALENT_FORMAT_WEIGHT[f] = spanTw;
      }
      if (FGS && FGS[f] == null) {
        if (isTalk && newsFgs != null) FGS[f] = newsFgs;
        else if (spanFgs != null) FGS[f] = spanFgs;
      }
      if (SPORTS_FORMAT_FIT && spanSports != null && SPORTS_FORMAT_FIT[f] == null) {
        SPORTS_FORMAT_FIT[f] = spanSports;
      }
      if (BRANDS && BRANDS[f] == null) {
        if (isTalk && newsBrands) BRANDS[f] = newsBrands.slice();
        else if (spanBrands) BRANDS[f] = spanBrands.slice();
      }
    });
    if (MARKET_FMT_ADJ) {
      Object.keys(MARKET_FMT_ADJ).forEach((mkt) => {
        const spanAdj = MARKET_FMT_ADJ[mkt]?.SPANISH;
        if (spanAdj == null) return;
        fmts.forEach((f) => {
          if (MARKET_FMT_ADJ[mkt][f] == null) {
            MARKET_FMT_ADJ[mkt][f] = spanAdj;
          }
        });
      });
    }
    if (MUSIC_FMTS && Array.isArray(MUSIC_FMTS)) {
      fmts.forEach((f) => {
        if (!MUSIC_FMTS.includes(f)) MUSIC_FMTS.push(f);
      });
    }
    if (RESEARCH_STRATEGY_MUSIC_FMTS && Array.isArray(RESEARCH_STRATEGY_MUSIC_FMTS)) {
      fmts.forEach((f) => {
        if (!RESEARCH_STRATEGY_MUSIC_FMTS.includes(f)) {
          RESEARCH_STRATEGY_MUSIC_FMTS.push(f);
        }
      });
    }
  }

  function installFmFa() {
    if (!enabled()) return;
    computeMassScales();
    inheritUmbrellaTables();
  }

  function isComm(s) {
    return (
      s
      && !s._bpSlotDeferred
      && typeof stationIsNoncommercialInstitutional === 'function'
      && !stationIsNoncommercialInstitutional(s)
      && s.rat
    );
  }

  function intraSubtypeMult(s, coh, G) {
    if (!enabled() || !isCommercialFmt(s.format)) return 1;
    const threshold = cfg().intraSubtypeBleedWhenPeerShareGe ?? 0.06;
    const strength = cfg().intraSubtypeBleedStrength ?? 0.22;
    const fmt = String(s.format);
    let peerMax = 0;
    (G.stations || []).forEach((st) => {
      if (!isComm(st) || st.id === s.id) return;
      if (String(st.format) !== fmt) return;
      const sh = Number(st.rat.share) || 0;
      if (sh > peerMax) peerMax = sh;
    });
    if (peerMax < threshold) return 1;
    const bleed = 1 - strength * Math.min(1, (peerMax - threshold) / 0.08);
    return Math.max(0.62, bleed);
  }

  /** Cohort overlap 0–1 between two commercial subtypes at one demo cell. */
  function cohortOverlap(fmtA, fmtB, coh) {
    const skewA = global.__spanishCompositionCohortSkew?.[fmtA]?.[coh] ?? 1;
    const skewB = global.__spanishCompositionCohortSkew?.[fmtB]?.[coh] ?? 1;
    const min = Math.min(skewA, skewB);
    const max = Math.max(skewA, skewB);
    return max > 1e-6 ? min / max : 0;
  }

  function subtypeTierScale(fmt) {
    const tiers = cfg().subtypeTierAppealScale;
    if (!tiers) return 1;
    const v = tiers[String(fmt || '')];
    return typeof v === 'number' && v > 0 ? v : 1;
  }

  /** Cross-subtype cannibalization — overlapping cohorts bleed when a peer pillar is viable. */
  function crossSubtypeCannibalMult(s, coh, G) {
    if (!enabled() || !isCommercialFmt(s.format)) return 1;
    const conc = concentratedLaneContext(G);
    const threshold = conc
      ? (cfg().concentratedLaneCrossCannibalPeerGe ?? 0.025)
      : (cfg().crossSubtypeCannibalWhenPeerShareGe ?? 0.035);
    const strength = conc
      ? (cfg().concentratedLaneCrossCannibalStrength ?? 0.52)
      : (cfg().crossSubtypeCannibalStrength ?? 0.38);
    const fmt = String(s.format);
    let penalty = 0;
    (G.stations || []).forEach((st) => {
      if (!isComm(st) || st.id === s.id) return;
      const peerFmt = String(st.format);
      if (!isCommercialFmt(peerFmt) || peerFmt === fmt) return;
      const peerSh = Number(st.rat.share) || 0;
      if (peerSh < threshold) return;
      const overlap = cohortOverlap(fmt, peerFmt, coh);
      if (overlap < 0.12) return;
      const rel = Math.min(1, (peerSh - threshold) / 0.09);
      penalty += strength * overlap * rel * Math.min(0.22, peerSh);
    });
    return Math.max(0.45, 1 - penalty);
  }

  function adultHitsNicheMult(s, coh, G) {
    if (!enabled() || String(s.format) !== 'SPANISH_ADULT_HITS') return 1;
    const softCap = cfg().adultHitsSoftShareCap ?? 0.045;
    const hardCap = cfg().adultHitsHardShareCap ?? 0.07;
    const base = cfg().adultHitsBaseAppealScale ?? 0.66;
    const ownSh = stationShare01(s);
    let mult = base;

    if (ownSh > softCap) {
      const over = Math.min(1, (ownSh - softCap) / Math.max(0.02, hardCap - softCap));
      mult *= Math.max(0.28, 1 - over * 0.72);
    }
    if (ownSh >= hardCap) {
      mult *= Math.max(0.22, 1 - (ownSh - hardCap) * 4.5);
    }

    const younger = coh === '12-17' || coh === '18-24';
    const older = coh === '50-64' || coh === '65+';
    if (younger) mult *= 0.5;
    else if (older) mult *= 1.06;

    const year = G.year || 2002;
    if (year < 2004) mult *= 0.82;

    return Math.max(0.22, mult);
  }

  function dominantSelfTaxShareCap(fmt) {
    const caps = cfg().dominantSelfTaxShareCap;
    if (caps && caps[String(fmt)] != null) return caps[String(fmt)];
    if (String(fmt) === 'REGIONAL_MEXICAN') return cfg().regionalMexicanSoftShareCap ?? 0.11;
    if (String(fmt) === 'SPANISH_CONTEMPORARY') return cfg().contemporarySoftShareCap ?? 0.055;
    if (String(fmt) === 'SPANISH_ADULT_HITS') return cfg().adultHitsSoftShareCap ?? 0.04;
    return 0.1;
  }

  function dominantSpanishLeader(G) {
    if (G.__spanishCompDominantLeaderTick !== G.turn) {
      delete G.__spanishCompDominantLeader;
      G.__spanishCompDominantLeaderTick = G.turn;
    }
    if (G.__spanishCompDominantLeader) return G.__spanishCompDominantLeader;
    let leader = null;
    let topSh = 0;
    (G.stations || []).forEach((st) => {
      if (!isComm(st) || !isCommercialFmt(st.format)) return;
      const sh = stationShare01(st);
      if (sh > topSh) {
        topSh = sh;
        leader = st;
      }
    });
    const state = { leader, topSh, leaderFmt: leader ? String(leader.format) : null };
    G.__spanishCompDominantLeader = state;
    return state;
  }

  function countCommercialSpanishPeers(G, excludeStation) {
    let n = 0;
    (G.stations || []).forEach((st) => {
      if (!isComm(st) || !isCommercialFmt(st.format)) return;
      if (st === excludeStation) return;
      if (stationShare01(st) >= 0.02) n += 1;
    });
    return n;
  }

  function formatLaneShare01(G, fmt) {
    const key = String(fmt || '');
    let total = 0;
    (G.stations || []).forEach((st) => {
      if (!isComm(st) || String(st.format) !== key) return;
      total += stationShare01(st);
    });
    return total;
  }

  function spanishLaneShare01(G) {
    let total = 0;
    (G.stations || []).forEach((st) => {
      if (!isComm(st) || !isCommercialFmt(st.format)) return;
      total += stationShare01(st);
    });
    return total;
  }

  function countSpanishCommercialDial(G) {
    let n = 0;
    (G.stations || []).forEach((st) => {
      if (!isComm(st) || !isCommercialFmt(st.format)) return;
      n += 1;
    });
    return n;
  }

  /** Thin Spanish dial + fat lane book — e.g. two FMs owning #1/#2 (Houston playtest). */
  function concentratedLaneContext(G) {
    const laneGe = cfg().concentratedLaneShareGe ?? 0.15;
    const dialLt = cfg().concentratedLaneDialCountLt ?? 4;
    const lane = spanishLaneShare01(G);
    const dial = countSpanishCommercialDial(G);
    if (lane < laneGe || dial >= dialLt) return null;
    const thinRel = Math.min(1, (dialLt - dial) / Math.max(1, dialLt - 2));
    const laneRel = Math.min(1, (lane - laneGe) / 0.1);
    return { lane, dial, thinRel, laneRel, intensity: thinRel * laneRel };
  }

  function concentratedLaneMult(s, coh, G) {
    if (!enabled() || !isCommercialFmt(s.format)) return 1;
    const ctx = concentratedLaneContext(G);
    if (!ctx) return 1;

    const strength = cfg().concentratedLaneStrength ?? 0.52;
    const ownSh = stationShare01(s);
    const shareRel = Math.min(1, ownSh / 0.05);
    let mult = 1 - strength * ctx.intensity * shareRel;

    const rmLane = formatLaneShare01(G, 'REGIONAL_MEXICAN');
    const contLane = formatLaneShare01(G, 'SPANISH_CONTEMPORARY');
    const laneGe = cfg().concentratedLaneShareGe ?? 0.15;
    if (rmLane >= 0.07 && contLane >= 0.07) {
      const duoStrength = cfg().concentratedLaneDuopolyStrength ?? 0.38;
      const duoRel = Math.min(1, (rmLane + contLane - laneGe) / 0.1);
      mult *= Math.max(0.48, 1 - duoStrength * ctx.thinRel * duoRel);
    }

    return Math.max(0.4, mult);
  }

  function countReliefEligiblePeers(G, leader) {
    let n = 0;
    (G.stations || []).forEach((st) => {
      if (!siblingReliefEligibleStation(st, G, leader)) return;
      n += 1;
    });
    return n;
  }

  /**
   * Headroom-aware relief gate — only siblings below cap, viable, market-eligible,
   * and not already co-emperor strength receive recycled appeal.
   */
  function siblingReliefEligibleStation(st, G, leaderOverride) {
    if (!enabled() || !isComm(st) || !isCommercialFmt(st.format)) return false;
    const { leader } = leaderOverride
      ? { leader: leaderOverride }
      : dominantSpanishLeader(G);
    if (!leader || st === leader) return false;

    const fmt = String(st.format);
    const ownSh = stationShare01(st);
    const marketId = G.marketId || (typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : '');
    const year = G.year || 2002;

    if (fmt === 'SPANISH_TROPICAL' && !isTropicalMarket(marketId)) return false;

    if (typeof formatAllowedInMarket === 'function' && !formatAllowedInMarket(fmt, marketId, year)) {
      return false;
    }

    const seq = launchSequenceForMarket(marketId);
    if (seq.length && !seq.includes(fmt)) return false;

    const ownCap = dominantSelfTaxShareCap(fmt);
    const fmtLaneSh = formatLaneShare01(G, fmt);
    const followerLt = cfg().dominantSelfTaxReliefFollowerShareLt ?? 0.07;
    if (fmtLaneSh >= ownCap || fmtLaneSh >= followerLt) return false;
    if (ownSh >= ownCap || ownSh >= followerLt) return false;

    if (fmt === 'SPANISH_ADULT_HITS') {
      const ahLaneLt = cfg().dominantSelfTaxReliefAdultHitsLaneLt ?? 0.03;
      const ahSoft = cfg().adultHitsSoftShareCap ?? 0.045;
      if (fmtLaneSh >= ahLaneLt || ownSh >= ahSoft) return false;
    }

    const crossBlock = cfg().dominantSelfTaxReliefCrossBlockShareGe ?? 0.08;
    const rmLane = formatLaneShare01(G, 'REGIONAL_MEXICAN');
    const contLane = formatLaneShare01(G, 'SPANISH_CONTEMPORARY');
    if (fmt === 'SPANISH_CONTEMPORARY' && rmLane >= crossBlock) return false;
    if (fmt === 'REGIONAL_MEXICAN' && contLane >= crossBlock) return false;

    const minViable = cfg().dominantSelfTaxReliefMinShareGe ?? 0.015;
    const scheduled = !!(st._spanishLaunchId || st._spanishLaunchEntrant || st._fragmentationLaunchId);
    if (ownSh < minViable && !scheduled) return false;

    return true;
  }

  /** Over-target share on the lane leader — marginal difficulty on the next rating point. */
  function dominantSubtypeSelfTaxMult(s, coh, G) {
    if (!enabled() || !isCommercialFmt(s.format)) return 1;
    const { leader, topSh } = dominantSpanishLeader(G);
    if (!leader || leader !== s) return 1;

    const domGe = cfg().dominantSelfTaxShareGe ?? 0.06;
    if (topSh < domGe) return 1;

    const cap = dominantSelfTaxShareCap(s.format);
    const fmtLaneSh = formatLaneShare01(G, s.format);
    const taxBase = Math.max(topSh, fmtLaneSh);
    if (taxBase <= cap) return 1;

    const over = Math.min(1, (taxBase - cap) / 0.055);
    const strength = cfg().dominantSelfTaxStrength ?? 0.44;
    const peers = countCommercialSpanishPeers(G, s);
    const rmLane = formatLaneShare01(G, 'REGIONAL_MEXICAN');
    const soloExtremeGe = cfg().soloRmExtremeShareGe ?? 0.16;
    let scaleAdj = peers === 0 ? (cfg().dominantSelfTaxSoloScale ?? 0.55) : 1;
    if (
      peers === 0
      && String(s.format) === 'REGIONAL_MEXICAN'
      && rmLane >= soloExtremeGe
    ) {
      scaleAdj = cfg().soloRmExtremeSelfTaxScale ?? 1.12;
    }
    if (peers > 0 && countReliefEligiblePeers(G, leader) === 0) {
      scaleAdj = cfg().dominantSelfTaxNoHeadroomScale ?? 0.65;
    }
    const conc = concentratedLaneContext(G);
    if (conc) scaleAdj *= Math.max(0.5, 1 - 0.35 * conc.intensity);
    let mult = Math.max(0.52, 1 - over * strength * scaleAdj);
    return mult;
  }

  /**
   * Redirect taxed appeal to sibling pillars with headroom — cohort overlap weighted.
   * Blocked when sibling is at cap, co-emperor strength, ineligible, or AH above niche.
   */
  function dominantSubtypeSiblingReliefMult(s, coh, G) {
    if (!enabled() || !isCommercialFmt(s.format)) return 1;
    const { leader, topSh, leaderFmt } = dominantSpanishLeader(G);
    if (!leader || leader === s || !leaderFmt) return 1;
    if (!siblingReliefEligibleStation(s, G, leader)) return 1;

    const cap = dominantSelfTaxShareCap(leaderFmt);
    if (topSh <= cap) return 1;

    const ownCap = dominantSelfTaxShareCap(s.format);
    const fmtLaneSh = formatLaneShare01(G, s.format);
    const laneHeadroom = Math.max(0, ownCap - fmtLaneSh);
    const headroomFactor = Math.min(1, laneHeadroom / 0.04);
    if (headroomFactor < 0.05) return 1;

    const over = Math.min(1, (topSh - cap) / 0.055);
    const relief = cfg().dominantSelfTaxSiblingRelief ?? 0.36;
    const overlap = cohortOverlap(String(s.format), leaderFmt, coh);
    const cohortFactor = 0.5 + overlap * 0.5;
    return Math.min(1.22, 1 + over * relief * cohortFactor * headroomFactor);
  }

  /** RM + Contemporary both viable — extra overlap cannibalization on Contemporary when RM is already strong. */
  function rmContemporaryDualEmperorMult(s, coh, G) {
    if (!enabled() || String(s.format) !== 'SPANISH_CONTEMPORARY') return 1;

    const rmLane = formatLaneShare01(G, 'REGIONAL_MEXICAN');
    const contLane = formatLaneShare01(G, 'SPANISH_CONTEMPORARY');
    const dualGe = cfg().rmContDualEmperorLaneGe ?? 0.08;
    if (rmLane < dualGe || contLane < dualGe) return 1;

    const overlap = cohortOverlap('SPANISH_CONTEMPORARY', 'REGIONAL_MEXICAN', coh);
    if (overlap < 0.22) return 1;

    const rel = Math.min(1, (Math.min(rmLane, contLane) - dualGe + 0.012) / 0.045);
    const strength = cfg().rmContDualEmperorStrength ?? 0.4;
    let mult = Math.max(0.58, 1 - strength * overlap * rel * (0.32 + rmLane));
    const conc = concentratedLaneContext(G);
    if (conc) mult = Math.max(0.45, mult * (1 - 0.32 * conc.intensity));
    return mult;
  }

  /** Phoenix v1 — block Tropical appeal outside Caribbean/NYC archetypes (existing dial pollution). */
  function marketFormatGateMult(s, G) {
    if (!enabled() || String(s.format) !== 'SPANISH_TROPICAL') return 1;
    const marketId = G.marketId || (typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : '');
    if (isTropicalMarket(marketId)) return 1;
    return cfg().nonTropicalTropicalAppealScale ?? 0.18;
  }

  /**
   * Once a Spanish subtype is dominant, the next overlapping product faces higher marginal difficulty.
   * Low cohort overlap (e.g. Adult Hits 50+ vs Contemporary youth) gets a lighter tax.
   */
  function coEmperorMarginalMult(s, coh, G) {
    if (!enabled() || !isCommercialFmt(s.format)) return 1;
    const fmt = String(s.format);
    let dominantFmt = null;
    let dominantSh = 0;
    (G.stations || []).forEach((st) => {
      if (!isComm(st) || !isCommercialFmt(st.format)) return;
      const sh = Number(st.rat.share) || 0;
      if (sh > dominantSh) {
        dominantSh = sh;
        dominantFmt = String(st.format);
      }
    });
    const domGe = cfg().coEmperorDominantShareGe ?? 0.07;
    if (!dominantFmt || dominantFmt === fmt || dominantSh < domGe) return 1;

    const overlap = cohortOverlap(fmt, dominantFmt, coh);
    const exemptLt = cfg().coEmperorCohortOverlapExemptLt ?? 0.2;
    const strength = cfg().coEmperorMarginalStrength ?? 0.42;
    const rel = Math.min(1, (dominantSh - domGe) / 0.11);

    if (overlap < exemptLt) {
      return Math.max(0.78, 1 - strength * dominantSh * 0.22);
    }
    return Math.max(0.4, 1 - strength * overlap * rel * (0.55 + dominantSh * 1.1));
  }

  /** Combined subtype separation — intra + cross cannibalization, niche ceiling, co-emperor tax. */
  function subtypeSeparationMult(s, coh, G) {
    if (!enabled() || !isCommercialFmt(s.format)) return 1;
    return subtypeTierScale(s.format)
      * intraSubtypeMult(s, coh, G)
      * crossSubtypeCannibalMult(s, coh, G)
      * coEmperorMarginalMult(s, coh, G)
      * rmContemporaryDualEmperorMult(s, coh, G)
      * dominantSubtypeSelfTaxMult(s, coh, G)
      * dominantSubtypeSiblingReliefMult(s, coh, G)
      * concentratedLaneMult(s, coh, G)
      * adultHitsNicheMult(s, coh, G);
  }

  /** Commercial pillars inherit umbrella FA mass with subtype cohort skew + intra-subtype bleed. */
  function applBaseAff(s, coh, G) {
    if (!enabled()) return null;
    if (isSpanishSpokenWordFmt(s.format)) {
      ensureFmFaInstalled();
      const FA = legacyRef('FA');
      const mkt = typeof MARKETS !== 'undefined' ? MARKETS[G?.marketId || ACTIVE_MARKET] : null;
      const h = mkt?.hispPop2020 ?? 0;
      const span = (mkt?.culture && mkt.culture.spanish) ?? 0;
      const laneBoost = 1 + Math.min(0.18, Math.max(0, h - 0.12) * 0.35 + Math.max(0, span - 0.10) * 0.22);
      const base = FA?.[s.format]?.[coh] ?? FA?.NEWS_TALK?.[coh] ?? 0.1;
      return base * laneBoost;
    }
    if (!isCommercialFmt(s.format)) return null;
    ensureFmFaInstalled();
    const FA = legacyRef('FA');
    const umbrella = FA?.SPANISH?.[coh] ?? 0.1;
    const skew = global.__spanishCompositionCohortSkew?.[s.format]?.[coh] ?? 1;
    const bleed = subtypeSeparationMult(s, coh, G);
    return umbrella * skew * bleed;
  }

  function dialHasSpanishFmt(present) {
    if (!present) return false;
    if (present.has(UMBRELLA)) return true;
    if (!enabled()) return false;
    return commercialFmts().some((f) => present.has(f));
  }

  function marketFormatMonMult(marketId, format) {
    const MARKET_FMT_ADJ = legacyRef('MARKET_FMT_ADJ');
    let v = MARKET_FMT_ADJ?.[marketId]?.[format];
    if ((v == null || v <= 0) && isCommercialFmt(format)) {
      v = MARKET_FMT_ADJ?.[marketId]?.SPANISH;
    }
    return typeof v === 'number' && v > 0 ? v : 1;
  }

  /** Rival AI / reformat — aggregate Spanish lane share or count across umbrella + commercial pillars. */
  function fmtLaneShare(fmtShares, fmt) {
    if (!enabled() || !isSpanishLaneFmt(fmt) || !fmtShares) return fmtShares?.[fmt] || 0;
    let total = 0;
    Object.keys(fmtShares).forEach((k) => {
      if (isSpanishLaneFmt(k)) total += fmtShares[k] || 0;
    });
    return total;
  }

  function fmtLaneCount(fmtCounts, fmt) {
    if (!enabled() || !isSpanishLaneFmt(fmt) || !fmtCounts) return fmtCounts?.[fmt] || 0;
    let total = 0;
    Object.keys(fmtCounts).forEach((k) => {
      if (isSpanishLaneFmt(k)) total += fmtCounts[k] || 0;
    });
    return total;
  }

  /**
   * When a Spanish pillar leader is hot but the subtype has fewer than two strong stations,
   * prefer a same-pillar clone before adjacent attacks (Houston KSPN playtest).
   */
  function pickCrCloneFormat(G) {
    if (!enabled()) return null;
    const pillarLeaderGe = cfg().pillarCloneLeaderShareGe ?? 0.06;
    const pillarStrongTarget = cfg().pillarCloneStrongTarget ?? 2;
    const strongShare = 0.02;
    const marketId = G.marketId || (typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : '');
    const year = G.year || 1970;
    const FM = legacyRef('FM');
    let best = null;

    commercialFmts().forEach((fmt) => {
      const lane = (G.stations || []).filter((st) => isComm(st) && String(st.format) === fmt);
      if (!lane.length) return;
      lane.sort((a, b) => stationShare01(b) - stationShare01(a));
      const leadSh = stationShare01(lane[0]);
      if (leadSh < pillarLeaderGe) return;
      const nStrong = lane.filter((st) => stationShare01(st) >= strongShare).length;
      if (nStrong >= pillarStrongTarget) return;
      if (typeof formatAllowedInMarket === 'function' && !formatAllowedInMarket(fmt, marketId, year)) return;
      if (!FM || !FM[fmt]) return;
      if (!best || leadSh > best.leaderShare) best = { fmt, leaderShare: leadSh };
    });

    return best ? best.fmt : null;
  }

  function pickCrSpanishFormat(G) {
    if (!enabled()) return defaultSpanishSubtypeFmt();
    const marketId = G.marketId || ACTIVE_MARKET;
    const year = G.year || 1970;
    const counts = {};
    commercialFmts().forEach((f) => { counts[f] = 0; });
    (G.stations || []).filter(isComm).forEach((s) => {
      const f = String(s.format || '');
      if (counts[f] != null) counts[f] += 1;
    });
    const order = launchSequenceForMarket(marketId).slice();
    order.sort((a, b) => (counts[a] || 0) - (counts[b] || 0));
    const FM = legacyRef('FM');
    for (const f of order) {
      if (FM && FM[f] && formatAllowedInMarket(f, marketId, year)) return f;
    }
    return defaultSpanishSubtypeFmt();
  }

  const SPANISH_ESCAPE_FMTS = [
    'MOR', 'OLDIES', 'HOT_AC', 'ADULT_STANDARDS', 'ADULT_CONTEMP',
    'CLASSIC_HITS', 'BROKERED_PROGRAMMING', 'BEAUTIFUL_MUSIC', 'ALL_NEWS',
  ];

  function highHispanicMarket(marketId) {
    return typeof isHighHispanicMarket === 'function'
      && isHighHispanicMarket(marketId || (typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : ''));
  }

  function stationShare01(s) {
    return Number(s?.rat?.share) || 0;
  }

  function scheduledSpanishPillar(s) {
    return !!(s._spanishLaunchId || s._spanishLaunchEntrant || s._fragmentationLaunchId);
  }

  function heritageSpanishAmLaunch(s) {
    if (!s || !s._spanishLaunchId) return false;
    if (s.fmBooster) return false;
    const band = s._spanishLaunchScheduledBand || s.sig?.type;
    return String(band || '').toUpperCase() === 'AM';
  }

  function heritageSpanishAmLaneHold(s, G) {
    if (!enabled() || !heritageSpanishAmLaunch(s)) return false;
    if (!highHispanicMarket(G?.marketId || ACTIVE_MARKET)) return false;
    return isSpanishLaneMusicFmt(s.format);
  }

  /** KLAT-class heritage AM: modest niche appeal, cap runaway growth. */
  function heritageAmAppealMult(s, G) {
    if (!heritageSpanishAmLaneHold(s, G)) return 1;
    const sh = stationShare01(s);
    const y = G?.year || 1970;
    if (y >= 1995 && y <= 2010) {
      if (sh > 0.025) return 0.22;
      if (sh > 0.018) return 0.32;
      if (sh > 0.015) return 0.42;
      if (sh >= 0.005 && sh <= 0.012) return 1.10;
      if (sh < 0.004) return 1.08;
      return 0.85;
    }
    if (sh > 0.03) return 0.72;
    return 1;
  }

  /** Extra AM music penalty for scheduled heritage entrants (KLAT-class niche, not FM-scale). */
  function heritageAmStructuralPenaltyMult(s, G) {
    if (!heritageSpanishAmLaneHold(s, G)) return 1;
    const y = G?.year || 1970;
    if (y < 1990) return 1;
    if (y <= 2008) return 0.58;
    return 0.62;
  }

  /** Counter-weight high-Hispanic mktFmt lift so heritage AM stays KLAT-niche, not FM-leader scale. */
  function heritageAmMktFmtMult(s, G) {
    if (!heritageSpanishAmLaneHold(s, G)) return 1;
    const y = G?.year || 1970;
    if (y >= 1995 && y <= 2010) return 0.34;
    if (y >= 1990) return 0.55;
    return 1;
  }

  /** Skip long-tail mean blend that inflates KLAT-class heritage above raw appeal. */
  function heritageAmRecalcSmoothWeight(s, G) {
    if (!heritageSpanishAmLaneHold(s, G)) return null;
    return 1;
  }

  function heritageAmShareCap01(s, G) {
    if (!heritageSpanishAmLaneHold(s, G)) return null;
    const y = G?.year || 1970;
    if (y >= 1995 && y <= 2010) return 0.015;
    if (y >= 1990) return 0.02;
    return null;
  }

  function heritageAmApplyShareCap(s, G) {
    const cap = heritageAmShareCap01(s, G);
    if (cap == null || !s?.rat) return false;
    const sh = Number(s.rat.share) || 0;
    if (sh <= cap + 1e-6) return false;
    const ratio = cap / Math.max(sh, 1e-6);
    const engageWeightedPop = (typeof COH !== 'undefined' ? COH : []).reduce((sum, c) => {
      const pop = (typeof POP !== 'undefined' && POP.cohorts?.[c]?.t) || 0;
      const engage = (typeof AQH_ENGAGE !== 'undefined' && AQH_ENGAGE[c]) || 0.060;
      return sum + pop * engage;
    }, 0);
    (typeof COH !== 'undefined' ? COH : []).forEach((coh) => {
      const cur = s.rat.cur?.[coh];
      if (!cur) return;
      const pop = (typeof POP !== 'undefined' && POP.cohorts?.[coh]?.t) || 0;
      const engage = (typeof AQH_ENGAGE !== 'undefined' && AQH_ENGAGE[coh]) || 0.060;
      cur.share = Math.round(cur.share * ratio * 10000) / 10000;
      cur.aqh = Math.round(cur.share * pop * engage);
      if (s.mom?.[coh]) {
        s.mom[coh].cur = cur.share;
        s.mom[coh].tgt = Math.min(s.mom[coh].tgt ?? cap, cap);
      }
    });
    s.rat.aqh = (typeof COH !== 'undefined' ? COH : []).reduce((sum, c) => sum + (s.rat.cur?.[c]?.aqh || 0), 0);
    const H = typeof publicNewsHabitEngageMult === 'function' ? publicNewsHabitEngageMult(s, G) : 1;
    s.rat.share = (typeof COH !== 'undefined' ? COH : []).reduce((sum, c) => {
      const pop = (typeof POP !== 'undefined' && POP.cohorts?.[c]?.t) || 0;
      const engage = ((typeof AQH_ENGAGE !== 'undefined' && AQH_ENGAGE[c]) || 0.060) * H;
      return sum + (s.rat.cur?.[c]?.share || 0) * (pop * engage);
    }, 0) / Math.max(engageWeightedPop, 1);
    return true;
  }

  function spanishAmTalkMigrationMarket(marketId) {
    const id = String(marketId || (typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : '') || '');
    const listed = cfg().amTalkMigrationMarkets || [];
    if (listed.includes(id)) return true;
    return false;
  }

  function spanishAmTalkMigrationEligible(s, G) {
    if (!enabled() || !s) return false;
    const y = G?.year || 1970;
    if (y < 1998) return false;
    if (String(s.sig?.type || '').toUpperCase() !== 'AM' || s.fmBooster) return false;
    if (!isSpanishLaneMusicFmt(s.format)) return false;
    const marketId = G?.marketId || ACTIVE_MARKET;
    if (!spanishAmTalkMigrationMarket(marketId)) return false;
    if (typeof formatAllowedInMarket === 'function') {
      return formatAllowedInMarket('SPANISH_NEWS_TALK', marketId, y);
    }
    return true;
  }

  /** Viable Spanish pillar — inherits umbrella SPANISH durability in high-Hispanic markets. */
  function viableSpanishPillarHold(s, G) {
    if (!enabled()) return false;
    const marketId = G.marketId || ACTIVE_MARKET;
    if (!highHispanicMarket(marketId)) return false;
    if (heritageSpanishAmLaneHold(s, G)) {
      return stationShare01(s) >= 0.004;
    }
    if (!isSpanishLaneFmt(s.format)) return false;
    const sh = stationShare01(s);
    const floor = scheduledSpanishPillar(s) ? 0.035 : 0.04;
    return sh >= floor;
  }

  /** Block rivalReformat flip away from Spanish lane — but not music→talk within lane. */
  function rivalReformatBlockFlip(s, G) {
    if (heritageSpanishAmLaneHold(s, G)) return true;
    if (!viableSpanishPillarHold(s, G)) return false;
    if (spanishAmTalkMigrationEligible(s, G)) return false;
    return true;
  }

  /** Clear accumulated struggle when a Spanish pillar has recovered (mirror umbrella tenure). */
  function rivalReformatRecoverLowShare(s, G) {
    if (!viableSpanishPillarHold(s, G)) return false;
    s._lowSharePeriods = 0;
    return true;
  }

  /** Reduce flip probability for Spanish lane stations in high-Hispanic markets (GOSPEL-style). */
  function rivalReformatFlipMult(s, G) {
    if (!enabled()) return 1;
    const marketId = G.marketId || ACTIVE_MARKET;
    if (!highHispanicMarket(marketId)) return 1;
    const sh = stationShare01(s);
    if (heritageSpanishAmLaneHold(s, G)) {
      if (sh >= 0.005 && sh <= 0.02) return 0.22;
      if (sh < 0.005) return 0.45;
      if (sh < 0.04) return 0.35;
      return 0.55;
    }
    if (!isSpanishLaneFmt(s.format)) return 1;
    if (spanishAmTalkMigrationEligible(s, G)) {
      if (sh >= 0.04) return 0.55;
      if (sh >= 0.03) return 0.78;
      return 1.12;
    }
    if (sh >= 0.04) {
      const hold = 0.1 + Math.min(0.28, (sh - 0.04) * 4);
      const sched = scheduledSpanishPillar(s) ? 0.14 : 0;
      return Math.max(0.03, 1 - hold - sched);
    }
    if (sh >= 0.03) return 0.5;
    return 1;
  }

  /** Penalize MOR/OLDIES escape; boost other Spanish subtypes over generic exits. */
  function rivalReformatCandidateMult(s, targetFmt, G) {
    if (!enabled() || !isSpanishLaneFmt(s.format)) return 1;
    const fromFmt = String(s.format || '');
    const toFmt = String(targetFmt || '');
    const marketId = G.marketId || ACTIVE_MARKET;
    if (!highHispanicMarket(marketId)) return 1;
    const sh = stationShare01(s);

    if (toFmt === 'SPANISH_TROPICAL' && !isTropicalMarket(marketId)) {
      return cfg().reformatTropicalBlockedMult ?? 0.02;
    }

    if (isSpanishSpokenWordFmt(toFmt) && isSpanishLaneMusicFmt(fromFmt) && spanishAmTalkMigrationEligible(s, G)) {
      return 2.6;
    }

    if (isSpanishLaneFmt(toFmt)) {
      if (toFmt !== fromFmt) return 1.4;
      return 0.04;
    }

    if (sh >= 0.035) {
      if (SPANISH_ESCAPE_FMTS.includes(toFmt)) return 0.015;
      return 0.06;
    }
    if (sh >= 0.03) {
      if (SPANISH_ESCAPE_FMTS.includes(toFmt)) return 0.1;
      return 0.3;
    }
    return 1;
  }

  /** At viable share, only allow flipping within Spanish lane — music or talk, not English exit. */
  function rivalReformatFilterCandidates(s, candidates, G) {
    if (heritageSpanishAmLaneHold(s, G) && Array.isArray(candidates)) {
      const lane = candidates.filter((f) => isSpanishLaneFmt(f) && f !== s.format);
      if (lane.length) return lane;
      return candidates.filter((f) => isSpanishLaneFmt(f));
    }
    if (!viableSpanishPillarHold(s, G) || !Array.isArray(candidates)) return candidates;
    let alt = candidates.filter((f) => {
      if (f === s.format) return false;
      return isCommercialFmt(f) || isSpanishSpokenWordFmt(f);
    });
    if (spanishAmTalkMigrationEligible(s, G)) {
      const talk = 'SPANISH_NEWS_TALK';
      if (!alt.includes(talk)) alt.push(talk);
    }
    if (alt.length) return alt;
    return candidates.filter((f) => isSpanishLaneFmt(f) && f !== s.format);
  }

  /** Strip Tropical from reformat targets outside tropical archetype markets (Spanish lane only). */
  function rivalReformatTropicalGuard(s, candidates, G) {
    if (!enabled() || !Array.isArray(candidates) || !isSpanishLaneFmt(s.format)) return candidates;
    const marketId = G.marketId || ACTIVE_MARKET;
    if (isTropicalMarket(marketId)) return candidates;
    return candidates.filter((f) => String(f) !== 'SPANISH_TROPICAL');
  }

  global.spanishCompositionEnabled = enabled;
  global.spanishCompositionIsCommercialFmt = isCommercialFmt;
  global.spanishCompositionIsSpanishSpokenWordFmt = isSpanishSpokenWordFmt;
  global.spanishCompositionIsSpanishLaneMusicFmt = isSpanishLaneMusicFmt;
  global.spanishCompositionIsSpanishLaneFmt = isSpanishLaneFmt;
  global.spanishCompositionSpanishAmTalkMigrationMarket = spanishAmTalkMigrationMarket;
  global.spanishCompositionSpanishAmTalkMigrationEligible = spanishAmTalkMigrationEligible;
  global.spanishCompositionIsSpanishLaunchBpFmt = isSpanishLaunchBpFmt;
  global.spanishCompositionCommercialFmts = commercialFmts;
  global.spanishCompositionApplyLaunchDefs = applyLaunchDefs;
  global.spanishCompositionApplBaseAff = applBaseAff;
  global.spanishCompositionIntraSubtypeMult = intraSubtypeMult;
  global.spanishCompositionSubtypeSeparationMult = subtypeSeparationMult;
  global.spanishCompositionSiblingReliefEligible = siblingReliefEligibleStation;
  global.spanishCompositionDialHasSpanishFmt = dialHasSpanishFmt;
  global.spanishCompositionMarketFormatMonMult = marketFormatMonMult;
  global.spanishCompositionPickCrFormat = pickCrSpanishFormat;
  global.spanishCompositionPickCrCloneFormat = pickCrCloneFormat;
  global.spanishCompositionFmtLaneShare = fmtLaneShare;
  global.spanishCompositionFmtLaneCount = fmtLaneCount;
  global.spanishCompositionInstallFmFa = installFmFa;
  global.spanishCompositionEnsureFmFaInstalled = ensureFmFaInstalled;
  global.spanishCompositionRivalReformatBlockFlip = rivalReformatBlockFlip;
  global.spanishCompositionRivalReformatRecoverLowShare = rivalReformatRecoverLowShare;
  global.spanishCompositionRivalReformatFlipMult = rivalReformatFlipMult;
  global.spanishCompositionRivalReformatCandidateMult = rivalReformatCandidateMult;
  global.spanishCompositionRivalReformatFilterCandidates = rivalReformatFilterCandidates;
  global.spanishCompositionRivalReformatTropicalGuard = rivalReformatTropicalGuard;
  global.spanishCompositionHeritageAmAppealMult = heritageAmAppealMult;
  global.spanishCompositionHeritageAmStructuralPenaltyMult = heritageAmStructuralPenaltyMult;
  global.spanishCompositionHeritageAmMktFmtMult = heritageAmMktFmtMult;
  global.spanishCompositionHeritageAmRecalcSmoothWeight = heritageAmRecalcSmoothWeight;
  global.spanishCompositionHeritageAmApplyShareCap = heritageAmApplyShareCap;

  if (enabled()) ensureFmFaInstalled();
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
