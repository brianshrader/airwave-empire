/**
 * Snapshot all on-air commercial talent salaries at a calendar book.
 * globalThis.__wlRunSalaryConcentrationSnap(config)
 */
(function () {
  'use strict';

  const SCENARIO_BY_START = { 1970: 'under', 1985: 'chrwar', 2000: 'harness2000' };

  function ensureHarnessScenario() {
    if (typeof SC === 'undefined' || !Array.isArray(SC)) return;
    if (SC.some((s) => s.id === 'harness2000')) return;
    SC.push({
      id: 'harness2000',
      l: 'Harness 2000',
      d: 'Diagnostic',
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

  function stationBookRank(s, G) {
    try {
      if (typeof rankStationsByShareCompetition === 'function') {
        const rr = rankStationsByShareCompetition(G.stations || []);
        return rr.rankById?.[s.id] ?? null;
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  }

  function rankBucket(rank, nBook) {
    if (!rank || rank < 1) return 'unknown';
    if (rank <= 3) return 'top3';
    if (rank <= 5) return 'top4_5';
    if (rank <= 10) return 'rank6_10';
    if (nBook && rank > Math.max(10, Math.ceil(nBook * 0.66))) return 'bottom_third';
    return 'mid_pack';
  }

  function captureAllTalents(G) {
    const mktId = G.marketId || ACTIVE_MARKET || 'atlanta';
    const mkt = (typeof MARKETS !== 'undefined' && MARKETS[mktId]) || {};
    const rankTier = mkt.rankTier || 'medium';
    const rr =
      typeof rankStationsByShareCompetition === 'function'
        ? rankStationsByShareCompetition(G.stations || [])
        : { n: 0, rankById: {} };
    const nBook = rr.n || 0;
    const out = [];

    (G.stations || []).forEach((s) => {
      if (!s || s._bpSlotDeferred) return;
      if (typeof stationIsNoncommercialInstitutional === 'function' && stationIsNoncommercialInstitutional(s)) {
        return;
      }
      if (s.isPublic) return;
      const bookRank = stationBookRank(s, G);
      const rb = rankBucket(bookRank, nBook);
      const revHalf = s.fin?.rev || 0;
      const revAnnual = revHalf * 2;
      const share = s.rat?.share || 0;

      function pushTalent(t, slot, isCoHost) {
        if (!t || !(t.salary > 0)) return;
        const tq =
          typeof talentTrueQuality === 'function'
            ? talentTrueQuality(t)
            : typeof t._trueQuality === 'number'
              ? t._trueQuality
              : t.quality | 0;
        const hireY = t._hireYear != null ? t._hireYear : G.year;
        const tenureYrs = Math.max(0, (G.year | 0) - hireY);
        let estCap = null;
        try {
          const sl = t.slot || slot;
          const [capEl] =
            typeof eliteTalentIncumbentPremiumMults === 'function'
              ? eliteTalentIncumbentPremiumMults(t, sl, share)
              : [1, 1];
          const tenureYrsForCap = tenureYrs;
          const tenureCapMult = 1 + Math.min(0.18, Math.max(0, tenureYrsForCap - 12) * 0.012);
          const slotBx =
            typeof slotStarMaxBaseForDaypart === 'function' &&
            typeof marketRankTierOnAirPayMult === 'function'
              ? Math.round(
                  slotStarMaxBaseForDaypart(sl) * marketRankTierOnAirPayMult(mktId),
                )
              : 0;
          if (slotBx > 0 && typeof salInfl === 'function') {
            estCap = Math.round(salInfl(slotBx, G.year) * tenureCapMult * capEl * 500) / 500;
          }
        } catch (_e) {
          estCap = null;
        }
        out.push({
          talentId: t.id || null,
          name: t.name || '',
          slot: t.slot || slot,
          isCoHost: !!isCoHost,
          isPlayer: !!s.isPlayer,
          call: s.callLetters || '',
          salary: t.salary | 0,
          trueQ: Math.round(tq * 10) / 10,
          quality: t.quality | 0,
          superstar: t.superstar === true,
          periodsAtStation: t.periodsAtStation | 0,
          tenureYrs,
          cyr: t.cyr || 0,
          bookRank,
          rankBucket: rb,
          share,
          revAnnual,
          salaryPctOfRev: revAnnual > 0 ? Math.round((t.salary / revAnnual) * 10000) / 100 : null,
          estSalaryCap: estCap,
          atCap: estCap != null && t.salary >= estCap * 0.98,
          marketId: mktId,
          rankTier,
        });
      }

      Object.entries(s.prog || {}).forEach(([slot, sd]) => {
        if (!sd) return;
        if (sd.talent) pushTalent(sd.talent, slot, false);
        const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
        if (ch) pushTalent(ch, slot, true);
      });
    });
    return out;
  }

  globalThis.__wlRunSalaryConcentrationSnap = function runSnap(config) {
    const marketId = config.marketId;
    const startYear = config.startYear || 1970;
    const targetYear = config.targetYear;
    const seed = config.seed >>> 0;
    const maxSteps = (config.maxSteps || 120) | 0;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const summary = {
      marketId,
      startYear,
      targetYear,
      seed,
      ok: false,
      calendarYear: null,
      period: null,
      talentCount: 0,
      talents: [],
    };

    try {
      ensureHarnessScenario();
      ACTIVE_MARKET = marketId;
      _selectedMarket = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      const scen = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
      G = genMarket(scen);
      G.marketId = marketId;
      G.tutorialMode = false;
      G.cash = Math.max(G.cash || 0, 8000000);
      if (typeof recalc === 'function') recalc(G.stations, G);
      if (typeof seedRev === 'function') seedRev(G.stations, G);

      let steps = 0;
      while (steps < maxSteps && (G.year < targetYear || (G.year === targetYear && (G.period | 0) < 2))) {
        advTurn();
        steps += 1;
        if ((G.cash || 0) < 200000) G.cash = 8000000;
      }

      summary.calendarYear = G.year;
      summary.period = G.period;
      summary.steps = steps;
      summary.talents = captureAllTalents(G);
      summary.talentCount = summary.talents.length;
      summary.ok = true;
    } catch (e) {
      summary.error = String(e && e.message ? e.message : e);
    } finally {
      Math.random = origRand;
    }
    return summary;
  };
})();
