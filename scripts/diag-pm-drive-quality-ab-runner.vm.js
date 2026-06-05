/**
 * PM Drive quality A/B runner.
 * Exposes: globalThis.__wlRunPmDriveQualityAb(config)
 */
(function () {
  'use strict';

  const PRIME = ['morningDrive', 'midday', 'afternoonDrive'];
  const PM = 'afternoonDrive';
  const SNAP_YEARS = [1980, 1990, 2000, 2010, 2020];
  const SCENARIO_BY_START = { 1970: 'under', 1985: 'chrwar', 2000: 'harness2000' };
  const OQ_BUCKETS = ['lt50', '50-59', '60-69', '70-79', '80-89', '90-94', '95-99'];

  function ensureHarnessScenario() {
    if (typeof SC === 'undefined' || !Array.isArray(SC)) return;
    if (SC.some((s) => s.id === 'harness2000')) return;
    SC.push({
      id: 'harness2000',
      l: 'Harness 2000',
      d: 'Diagnostic cold start at 2000.',
      startYear: 2000,
      idx: [9],
      cash: 2200000,
      diff: 'MEDIUM',
      oqBoost: 0,
    });
  }

  function seededRandom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function isCommercial(st) {
    return (
      st &&
      !st._bpSlotDeferred &&
      typeof stationIsNoncommercialInstitutional === 'function' &&
      !stationIsNoncommercialInstitutional(st)
    );
  }

  function stationType(s) {
    if (!s) return 'unknown';
    if (s.isPlayer) return 'player';
    if (s.corpOwner) return 'ai_corp';
    return 'ai_indie';
  }

  function getSlotQ(s, slot) {
    const q = s?.prog?.[slot]?.quality;
    return typeof q === 'number' && !Number.isNaN(q) ? q : null;
  }

  function hostTrueQ(st, slot) {
    const t = st?.prog?.[slot]?.talent;
    if (!t) return null;
    if (typeof talentTrueQuality === 'function') return Math.round(talentTrueQuality(t) || 0);
    return t.quality != null ? Math.round(t.quality) : null;
  }

  function oqBucket(oq) {
    const q = Math.round(Number(oq) || 0);
    if (q < 50) return 'lt50';
    if (q < 60) return '50-59';
    if (q < 70) return '60-69';
    if (q < 80) return '70-79';
    if (q < 90) return '80-89';
    if (q < 95) return '90-94';
    return '95-99';
  }

  function emptySlotStats() {
    const bySlot = {};
    PRIME.forEach((sl) => {
      bySlot[sl] = { denom: 0, ge90: 0, ge95: 0, ge98: 0 };
    });
    return {
      commercialCount: 0,
      bySlot,
      lowTalentElitePm: 0,
      playerPmGe95: 0,
      playerPmCount: 0,
    };
  }

  function snapshotPrimeStats(Gopt) {
    const out = emptySlotStats();
    (Gopt.stations || []).forEach((s) => {
      if (!isCommercial(s)) return;
      out.commercialCount += 1;
      PRIME.forEach((sl) => {
        const q = getSlotQ(s, sl);
        if (q == null) return;
        const st = out.bySlot[sl];
        st.denom += 1;
        if (q >= 90) st.ge90 += 1;
        if (q >= 95) st.ge95 += 1;
        if (q >= 98) st.ge98 += 1;
      });
      const pmQ = getSlotQ(s, PM);
      const htq = hostTrueQ(s, PM);
      if (pmQ != null && pmQ >= 95 && htq != null && htq < 45 && !s.isPlayer) {
        out.lowTalentElitePm += 1;
      }
      if (s.isPlayer) {
        out.playerPmCount += 1;
        if (pmQ != null && pmQ >= 95) out.playerPmGe95 += 1;
      }
    });
    return out;
  }

  function snapshotEcology2020(Gopt) {
    const buckets = {};
    OQ_BUCKETS.forEach((b) => {
      buckets[b] = 0;
    });
    let n = 0;
    let sumOq = 0;
    let zombieLike = 0;
    let lowShareSpiral = 0;
    let certProxyOk = 0;

    (Gopt.stations || []).forEach((st) => {
      if (!isCommercial(st)) return;
      const oq = Math.round(st.oq || 0);
      const share = st.rat?.share || 0;
      buckets[oqBucket(oq)] += 1;
      n += 1;
      sumOq += oq;
      if (st.isZombie || st.isNicheSurvival || share < 0.008) zombieLike += 1;
      if (share < 0.015 && oq < 50) lowShareSpiral += 1;
      if (oq >= 45 && share >= 0.008) certProxyOk += 1;
    });

    return {
      commercialCount: n,
      meanOq: n ? Math.round((sumOq / n) * 100) / 100 : null,
      pct9599: n ? Math.round((100 * buckets['95-99']) / n * 100) / 100 : 0,
      buckets,
      zombieLike,
      lowShareSpiral,
      certProxyOkPct: n ? Math.round((100 * certProxyOk) / n * 100) / 100 : 0,
    };
  }

  function summarizeAuditEvents(events) {
    const pm = (events || []).filter((e) => e.type === 'slot_delta' && e.slot === PM);
    const countQ = (q) => pm.filter((e) => e.q1r === q).length;
    const runAi = pm.filter((e) => e.source === 'runAI' && e.dq > 0);
    const runAi100 = runAi.filter((e) => e.q1r === 100).length;
    return {
      pmDeltaEvents: pm.length,
      pmExact98: countQ(98),
      pmExact99: countQ(99),
      pmExact100: countQ(100),
      runAiIncreases: runAi.length,
      runAiTo100: runAi100,
      decayIncreases: pm.filter((e) => e.source === 'decay' && e.dq > 0).length,
    };
  }

  function initGame(marketId, startYear) {
    ensureHarnessScenario();
    const scenId = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
    ACTIVE_MARKET = marketId;
    _selectedMarket = marketId;
    if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
    G = genMarket(scenId);
    G.marketId = marketId;
    G.tutorialMode = false;
    G._wlPmDriveAuditOn = true;
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  globalThis.__wlRunPmDriveQualityAb = function run(config) {
    const marketId = config.marketId;
    const startYear = config.startYear || 1970;
    const endYear = config.endYear || 2021;
    const seed = (config.seed >>> 0) || 1;
    const variant = config.variant || 'A';
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const summary = {
      ok: false,
      marketId,
      startYear,
      endYear,
      seed,
      variant,
      decades: {},
      ecology2020: null,
      audit: null,
    };

    try {
      initGame(marketId, startYear);
      const endPeriods = (endYear - startYear) * 2;

      for (let step = 0; step < endPeriods && (G.year | 0) < endYear; step++) {
        if ((G.period | 0) === 2) {
          const y = G.year | 0;
          if (SNAP_YEARS.includes(y)) {
            summary.decades[String(y)] = snapshotPrimeStats(G);
          }
        }
        advTurn();
      }

      summary.ecology2020 = snapshotEcology2020(G);
      summary.audit = summarizeAuditEvents((G._wlPmDriveAudit && G._wlPmDriveAudit.events) || []);
      summary.ok = true;
      return summary;
    } catch (err) {
      summary.error = String(err && err.message ? err.message : err);
      return summary;
    } finally {
      Math.random = origRand;
    }
  };
})();
