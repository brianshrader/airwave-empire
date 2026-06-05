/**
 * Longitudinal cap-binding audit — tracks cap-bound periods and uncapped Fall projections.
 * globalThis.__wlRunCapBindingSim(config)
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
      d: 'Cap binding diagnostic',
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

  function estSalaryCap(s, slot, t, G) {
    const mktId = G.marketId || ACTIVE_MARKET || 'atlanta';
    const share = s.rat?.share || 0;
    const sl = t.slot || slot;
    const hireY = t._hireYear != null ? t._hireYear : G.year;
    const tenureYrsForCap = Math.max(0, (G.year | 0) - hireY);
    const tenureCapMult = 1 + Math.min(0.18, Math.max(0, tenureYrsForCap - 12) * 0.012);
    const [capEl] =
      typeof eliteTalentIncumbentPremiumMults === 'function'
        ? eliteTalentIncumbentPremiumMults(t, sl, share)
        : [1, 1];
    const slotBx =
      typeof slotStarMaxBaseForDaypart === 'function' &&
      typeof marketRankTierOnAirPayMult === 'function'
        ? Math.round(slotStarMaxBaseForDaypart(sl) * marketRankTierOnAirPayMult(mktId))
        : 0;
    if (slotBx <= 0 || typeof salInfl !== 'function') return null;
    return Math.round(salInfl(slotBx, G.year) * tenureCapMult * capEl * 500) / 500;
  }

  /** One Fall host raise pass — floors yes, mktCap no (matches advTurn period 2 host block). */
  function projectFallSalaryUncapped(s, slot, t, G, fallSteps) {
    const sl = t.slot || slot;
    const mktId = G.marketId || ACTIVE_MARKET || 'atlanta';
    const year = G.year | 0;
    const stShare = s.rat?.share || 0;
    let sal = t.salary | 0;
    if (sal <= 0) return sal;
    const steps = Math.max(1, fallSteps | 0);
    const vtLd = 0;
    for (let i = 0; i < steps; i++) {
      const baseInflation =
        typeof talentFallBaseInflationForMarket === 'function'
          ? talentFallBaseInflationForMarket(year, mktId)
          : 0.01;
      const tqMerit =
        typeof talentTrueQuality === 'function' ? talentTrueQuality(t) : t.quality | 0;
      const merit = tqMerit > 85 ? 0.008 : tqMerit > 72 ? 0.004 : 0.001;
      const perfPressure =
        typeof talentFallPerfPressureFromShare === 'function'
          ? talentFallPerfPressureFromShare(stShare, mktId)
          : 0;
      const levHost =
        typeof talentRenewalLeverage01 === 'function'
          ? talentRenewalLeverage01(s, sl, t, false)
          : 0;
      const levSal =
        levHost >= 0.44
          ? 0.0052
          : levHost >= 0.36
            ? 0.0036
            : levHost >= 0.3
              ? 0.0022
              : levHost >= 0.26
                ? 0.0011
                : 0;
      const moraleMod = (t.morale | 0) < 50 ? 0.004 : (t.morale | 0) > 80 ? -0.002 : 0;
      const vtSal = Math.min(0.028, vtLd * 0.021);
      sal = Math.round(sal * (1 + baseInflation + merit + perfPressure + moraleMod + vtSal + levSal) * 500) / 500;
      const [, floorElHost] =
        typeof eliteTalentIncumbentPremiumMults === 'function'
          ? eliteTalentIncumbentPremiumMults(t, sl, stShare)
          : [1, 1];
      const tenureYrs = Math.max(0, year - (t._hireYear != null ? t._hireYear : year));
      const tenurePrem = Math.min(0.1, Math.max(0, tenureYrs - 10) * 0.01);
      if (typeof incumbentSalaryFloorAnnual_v2 === 'function') {
        const flCore = incumbentSalaryFloorAnnual_v2(sl, tqMerit, mktId, year, s);
        const floor = Math.round(flCore * (1 + tenurePrem) * floorElHost * 500) / 500;
        if (sal < floor) sal = floor;
      }
    }
    return sal;
  }

  function talentKey(t, s, slot) {
    return String(t.id || `${s.id}:${slot}:${t.name || ''}`);
  }

  function scanFall(G, tracker) {
    const mktId = G.marketId || ACTIVE_MARKET || 'atlanta';
    const mkt = (typeof MARKETS !== 'undefined' && MARKETS[mktId]) || {};
    const rankTier = mkt.rankTier || 'medium';
    const year = G.year | 0;
    const period = G.period | 0;

    (G.stations || []).forEach((s) => {
      if (!s || s._bpSlotDeferred) return;
      if (typeof stationIsNoncommercialInstitutional === 'function' && stationIsNoncommercialInstitutional(s)) {
        return;
      }
      if (s.isPublic) return;
      const bookRank = stationBookRank(s, G);
      const share = s.rat?.share || 0;

      function visit(t, slot, isCoHost) {
        if (!t || !(t.salary > 0)) return;
        const key = talentKey(t, s, slot);
        const cap = estSalaryCap(s, slot, t, G);
        const atCap =
          cap != null && t.salary >= cap * 0.98 && t.salary <= cap * 1.02;
        const aboveCap = cap != null && t.salary > cap * 1.02;
        const uncapped1 = projectFallSalaryUncapped(s, slot, t, G, 1);
        const uncapped3 = projectFallSalaryUncapped(s, slot, t, G, 3);
        const hireY = t._hireYear != null ? t._hireYear : year;
        const tenureYrs = Math.max(0, year - hireY);
        const tq =
          typeof talentTrueQuality === 'function'
            ? talentTrueQuality(t)
            : typeof t._trueQuality === 'number'
              ? t._trueQuality
              : t.quality | 0;

        let rec = tracker.get(key);
        if (!rec) {
          rec = {
            talentId: t.id || null,
            key,
            name: t.name || '',
            marketId: mktId,
            rankTier,
            isPlayer: !!s.isPlayer,
            slot: t.slot || slot,
            isCoHost: !!isCoHost,
            firstYear: year,
            periodsOnAir: 0,
            fallSnapshots: 0,
            periodsAtCap: 0,
            periodsAboveCap: 0,
            periodsDominantTop5: 0,
            periodsDominantShare08: 0,
            maxSalary: 0,
            maxUncapped1: 0,
            maxSuppressionPct: 0,
          };
          tracker.set(key, rec);
        }
        rec.periodsOnAir += 1;
        rec.fallSnapshots += 1;
        if (atCap) rec.periodsAtCap += 1;
        if (aboveCap) rec.periodsAboveCap = (rec.periodsAboveCap || 0) + 1;
        if (bookRank != null && bookRank <= 5) rec.periodsDominantTop5 += 1;
        if (share >= 0.08) rec.periodsDominantShare08 += 1;
        rec.lastYear = year;
        rec.lastPeriod = period;
        rec.lastSalary = t.salary | 0;
        rec.lastCap = cap;
        rec.lastAtCap = atCap;
        rec.lastAboveCap = aboveCap;
        rec.lastUncapped1Fall = uncapped1;
        rec.lastUncapped3Fall = uncapped3;
        rec.lastCall = s.callLetters || '';
        rec.lastBookRank = bookRank;
        rec.lastShare = share;
        rec.lastTenureYrs = tenureYrs;
        rec.lastPeriodsAtStation = t.periodsAtStation | 0;
        rec.lastTrueQ = Math.round(tq * 10) / 10;
        rec.lastSuperstar = t.superstar === true;
        rec.maxSalary = Math.max(rec.maxSalary, t.salary | 0);
        rec.maxUncapped1 = Math.max(rec.maxUncapped1, uncapped1);
        if (atCap && t.salary > 0) {
          const sup = Math.round(((uncapped1 / t.salary - 1) * 100) * 10) / 10;
          rec.maxSuppressionPct = Math.max(rec.maxSuppressionPct, sup);
        }
      }

      Object.entries(s.prog || {}).forEach(([slot, sd]) => {
        if (!sd) return;
        if (sd.talent) visit(sd.talent, slot, false);
        const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
        if (ch) visit(ch, slot, true);
      });
    });
  }

  globalThis.__wlRunCapBindingSim = function runSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear || 1970;
    const years = config.years || 32;
    const seed = config.seed >>> 0;
    const endYear = startYear + years;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const summary = {
      marketId,
      startYear,
      endYear,
      seed,
      ok: false,
      periods: 0,
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

      const tracker = new Map();
      const maxSteps = years * 2 + 4;

      for (let step = 0; step < maxSteps && G.year < endYear; step++) {
        advTurn();
        if ((G.cash || 0) < 200000) G.cash = 8000000;
        if ((G.period | 0) === 2) scanFall(G, tracker);
        summary.periods += 1;
      }

      summary.talents = [...tracker.values()].map((rec) => {
        const sal = rec.lastSalary || 0;
        const cap = rec.lastCap;
        const u1 = rec.lastUncapped1Fall || sal;
        const u3 = rec.lastUncapped3Fall || sal;
        const atCap = !!rec.lastAtCap;
        const capBoundShare =
          rec.fallSnapshots > 0
            ? Math.round((rec.periodsAtCap / rec.fallSnapshots) * 1000) / 10
            : 0;
        const suppress1 =
          sal > 0 && u1 > sal ? Math.round(((u1 / sal - 1) * 100) * 10) / 10 : 0;
        const suppress3 =
          sal > 0 && u3 > sal ? Math.round(((u3 / sal - 1) * 100) * 10) / 10 : 0;
        const aboveCap = !!rec.lastAboveCap;
        const suppressedByCap =
          cap != null && !aboveCap && u1 > cap * 1.02 && sal <= cap * 1.02;
        const capPinning = atCap && suppressedByCap;
        const dominantAnchor =
          rec.lastTenureYrs >= 10 &&
          rec.lastBookRank != null &&
          rec.lastBookRank <= 5 &&
          (rec.lastShare || 0) >= 0.08;
        const legendCandidate =
          dominantAnchor && rec.periodsAtCap >= 8 && rec.fallSnapshots >= 12;
        return {
          ...rec,
          capBoundShare,
          suppressPct1Fall: suppress1,
          suppressPct3Fall: suppress3,
          aboveCap,
          suppressedByCap,
          capPinning,
          periodsAboveCap: rec.periodsAboveCap || 0,
          dominantAnchor,
          legendCandidate,
          gapToUncapped1: Math.max(0, u1 - sal),
          gapToUncapped3: Math.max(0, u3 - sal),
        };
      });
      summary.talentCount = summary.talents.length;
      summary.ok = true;
      summary.endYear = G.year;
    } catch (e) {
      summary.error = String(e && e.message ? e.message : e);
    } finally {
      Math.random = origRand;
    }
    return summary;
  };
})();
