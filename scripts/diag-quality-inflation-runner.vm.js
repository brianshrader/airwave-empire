/**
 * VM runner for station quality inflation diagnostics.
 * Loaded after legacy.js (+ optional talentRetention.js).
 * Exposes: globalThis.__wlRunQualityInflationSuite(config)
 */
(function () {
  'use strict';

  const SCENARIO_BY_START = {
    1970: 'under',
    1980: 'chrwar',
    1985: 'chrwar',
    1990: 'harness1990',
    2000: 'harness2000',
    2010: 'harness2010',
  };

  const DECADE_ENDS = [1980, 1990, 2000, 2010, 2020];

  function ensureHarnessScenarios() {
    if (typeof SC === 'undefined' || !Array.isArray(SC)) return;
    const add = (id, startYear, cash) => {
      if (SC.some((s) => s.id === id)) return;
      SC.push({
        id,
        l: 'Harness ' + startYear,
        d: 'Diagnostic cold start at ' + startYear + '.',
        startYear,
        idx: [9],
        cash,
        diff: 'MEDIUM',
        oqBoost: 0,
      });
    };
    add('harness1990', 1990, 2800000);
    add('harness2000', 2000, 2200000);
    add('harness2010', 2010, 1800000);
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

  function commercialStations(G) {
    return (G.stations || []).filter(isCommercial);
  }

  function pctAbove(stations, threshold) {
    const n = stations.length;
    if (!n) return { pct: 0, count: 0, n: 0 };
    const count = stations.filter((s) => (s.oq | 0) > threshold).length;
    return { pct: (100 * count) / n, count, n };
  }

  function snapshotDecadeQuality(G) {
    const comm = commercialStations(G);
    return {
      year: G.year,
      period: G.period,
      n: comm.length,
      meanOq: comm.length
        ? comm.reduce((a, s) => a + (s.oq | 0), 0) / comm.length
        : 0,
      p90: pctAbove(comm, 90),
      p95: pctAbove(comm, 95),
      p98: pctAbove(comm, 98),
      playerAbove95: (G.ps || [])
        .filter((s) => s && s.isPlayer && (s.oq | 0) > 95)
        .map((s) => ({ id: s.id, call: s.callLetters, oq: s.oq | 0 })),
    };
  }

  function initGame(marketId, startYear) {
    ensureHarnessScenarios();
    const scenId = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
    ACTIVE_MARKET = marketId;
    _selectedMarket = marketId;
    if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
    G = genMarket(scenId);
    G.marketId = marketId;
    G.tutorialMode = false;
    G._wlQualityInflationDiag = true;
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  function setUniformSlotQuality(st, q) {
    if (!st || !st.prog) return;
    Object.values(st.prog).forEach((sd) => {
      if (!sd) return;
      sd.quality = Math.max(10, Math.min(100, Math.round(q)));
    });
    if (typeof refreshStationOQ === 'function') refreshStationOQ(st, G);
  }

  /** Run passive market sim; optional noProgInvest freezes AI/player programming spend. */
  function runMarketSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear;
    const endYear = config.endYear || 2020;
    const seed = config.seed >>> 0;
    const noProgInvest = !!config.noProgInvest;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const decadeSnaps = [];
    const naturalDrift = [];
    let player2020 = null;

    try {
      initGame(marketId, startYear);
      if (noProgInvest) G._wlQualityNoProg = true;

      const endPeriods = (endYear - startYear) * 2;
      let lastYear = G.year;

      for (let step = 0; step < endPeriods && G.year < endYear; step++) {
        const y0 = G.year;
        const comm = commercialStations(G);
        if (comm.length) {
          naturalDrift.push({
            year: y0,
            period: G.period,
            meanOq: comm.reduce((a, s) => a + (s.oq | 0), 0) / comm.length,
          });
        }

        advTurn();

        if ((G._wlRetentionDiag || G._wlQualityInflationDiag) && (G.cash || 0) < 150000) {
          G.cash = 400000;
        }

        if (G.year !== lastYear) {
          lastYear = G.year;
          if (DECADE_ENDS.includes(G.year)) {
            decadeSnaps.push(snapshotDecadeQuality(G));
          }
        }
      }

      if (G.year >= 2020 || (G.year === 2019 && G.period === 2)) {
        player2020 = snapshotDecadeQuality(G);
      }

      return {
        ok: true,
        marketId,
        startYear,
        seed,
        endYear: G.year,
        noProgInvest,
        decadeSnaps,
        naturalDrift,
        player2020,
      };
    } catch (err) {
      return {
        ok: false,
        marketId,
        startYear,
        seed,
        noProgInvest,
        error: String(err && err.message ? err.message : err),
        decadeSnaps,
        naturalDrift,
        player2020,
      };
    } finally {
      Math.random = origRand;
      if (typeof G !== 'undefined' && G) delete G._wlQualityNoProg;
    }
  }

  /** Measure programming budget to climb oq from startQ to targetQ on one player station. */
  function measureProgBudgetClimb(config) {
    const marketId = config.marketId || 'wichita';
    const year = config.year || 2000;
    const startQ = config.startQ | 0;
    const targetQ = config.targetQ | 0;
    const seed = config.seed >>> 0;
    const maxPeriods = config.maxPeriods || 24;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    try {
      ensureHarnessScenarios();
      ACTIVE_MARKET = marketId;
      _selectedMarket = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      const scenId = year >= 2010 ? 'harness2010' : year >= 2000 ? 'harness2000' : year >= 1990 ? 'harness1990' : 'chrwar';
      G = genMarket(scenId);
      G.marketId = marketId;
      G.year = year;
      G.period = 1;
      G.tutorialMode = false;
      G._wlQualityInflationDiag = true;
      G._wlQualityNoProg = true;

      const st = (G.ps || []).find((s) => s && s.isPlayer);
      if (!st) throw new Error('No player station');

      setUniformSlotQuality(st, startQ);
      st.ops = st.ops || {};
      st.ops.progBudget = 0;
      st.progInvestment = 0;

      let lo = 0;
      let hi = typeof progBudgetCapForPeriod === 'function' ? progBudgetCapForPeriod(G) : 100000;
      let bestBudget = hi;
      let bestPeriods = maxPeriods + 1;

      for (let attempt = 0; attempt < 12; attempt++) {
        const budget = Math.round((lo + hi) / 2);
        setUniformSlotQuality(st, startQ);
        st.ops.progBudget = budget;
        st.progInvestment = 0;
        if (typeof refreshStationOQ === 'function') refreshStationOQ(st, G);
        let reached = false;
        let periods = 0;
        for (periods = 0; periods < maxPeriods; periods++) {
          if (typeof decay === 'function') decay(st, G.year, G.period);
          if (typeof refreshStationOQ === 'function') refreshStationOQ(st, G);
          if ((st.oq | 0) >= targetQ) {
            reached = true;
            break;
          }
          G.period = G.period === 1 ? 2 : 1;
          if (G.period === 1) G.year++;
        }
        if (reached) {
          bestBudget = budget;
          bestPeriods = periods + 1;
          hi = budget - 1;
        } else {
          lo = budget + 1;
        }
      }

      const cap = typeof progBudgetCapForPeriod === 'function' ? progBudgetCapForPeriod(G) : hi;
      const totalSpend = bestBudget * bestPeriods;
      return {
        ok: true,
        marketId,
        year,
        startQ,
        targetQ,
        seed,
        progCap: cap,
        budgetPerPeriod: bestBudget,
        periodsToTarget: bestPeriods,
        totalSpend,
        pctOfCap: cap > 0 ? Math.round((bestBudget / cap) * 1000) / 10 : 0,
        reachedTarget: (st.oq | 0) >= targetQ,
        finalOq: st.oq | 0,
      };
    } catch (err) {
      return {
        ok: false,
        error: String(err && err.message ? err.message : err),
        marketId,
        year,
        startQ,
        targetQ,
      };
    } finally {
      Math.random = origRand;
    }
  }

  /** Morning host 95+ departure vs 70 replacement — ratings/revenue impact. */
  function measureMorningHostDeparture(config) {
    const marketId = config.marketId || 'nashville';
    const seed = config.seed >>> 0;
    const settlePeriods = config.settlePeriods || 24;
    const postPeriods = config.postPeriods || 16;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    try {
      initGame(marketId, 1985);
      G.cash = Math.max(G.cash || 0, 5000000);

      for (let i = 0; i < settlePeriods; i++) {
        advTurn();
        if ((G.cash || 0) < 200000) G.cash = 5000000;
      }

      const st = (G.ps || []).find((s) => s && s.isPlayer && s.prog && s.prog.morningDrive);
      if (!st) throw new Error('No player station with morning drive');
      if (!st.prog.morningDrive) throw new Error('Missing morningDrive slot');

      const md = st.prog.morningDrive;
      if (!md.talent) {
        md.talent = mkTal('morningDrive', st.format, 'star', G.year);
      }
      md.talent.quality = 96;
      md.talent._trueQuality = 96;
      md.talent.superstar = false;
      md.quality = 96;
      if (typeof refreshStationOQ === 'function') refreshStationOQ(st, G);
      if (typeof recalc === 'function') recalc(G.stations, G);
      if (typeof seedRev === 'function') seedRev(G.stations, G);

      const baseline = {
        oq: st.oq | 0,
        share: st.rat?.share || 0,
        aqh: st.rat?.aqh | 0,
        rev: st.fin?.rev | 0,
        mdQuality: md.quality | 0,
      };

      for (let i = 0; i < 4; i++) {
        if (typeof recalc === 'function') recalc(G.stations, G);
        if (typeof seedRev === 'function') seedRev(G.stations, G);
        advTurn();
      }

      const preDepart = {
        oq: st.oq | 0,
        share: st.rat?.share || 0,
        aqh: st.rat?.aqh | 0,
        rev: st.fin?.rev | 0,
      };

      const oldName = md.talent.name || 'Host';
      clearCoHostPairingState(md);
      md.talent = mkTal('morningDrive', st.format, 'entry', G.year);
      md.talent.quality = 70;
      md.talent._trueQuality = 70;
      md.talent.superstar = false;
      md.quality = Math.round(md.quality * 0.68);
      if (typeof initTalentPerformanceReveal === 'function') {
        initTalentPerformanceReveal(md, md.talent, st.format, 'hire');
      }
      if (typeof refreshStationOQ === 'function') refreshStationOQ(st, G);

      const postDepartImmediate = {
        oq: st.oq | 0,
        share: st.rat?.share || 0,
        mdQuality: md.quality | 0,
        oldHost: oldName,
        newHost: md.talent.name,
      };

      const postSeries = [];
      for (let i = 0; i < postPeriods; i++) {
        advTurn();
        if ((G.cash || 0) < 200000) G.cash = 5000000;
        postSeries.push({
          year: G.year,
          period: G.period,
          oq: st.oq | 0,
          share: st.rat?.share || 0,
          aqh: st.rat?.aqh | 0,
          rev: st.fin?.rev | 0,
          mdQuality: md.quality | 0,
        });
      }

      const last = postSeries[postSeries.length - 1] || postDepartImmediate;
      const shareDelta = last.share - preDepart.share;
      const revDelta = last.rev - preDepart.rev;
      const aqhDelta = last.aqh - preDepart.aqh;
      const oqDelta = last.oq - preDepart.oq;

      return {
        ok: true,
        marketId,
        seed,
        stationCall: st.callLetters,
        baseline,
        preDepart,
        postDepartImmediate,
        postSeries,
        impact: {
          shareDelta,
          shareDeltaPct: preDepart.share > 0 ? (100 * shareDelta) / preDepart.share : null,
          revDelta,
          revDeltaPct: preDepart.rev > 0 ? (100 * revDelta) / preDepart.rev : null,
          aqhDelta,
          aqhDeltaPct: preDepart.aqh > 0 ? (100 * aqhDelta) / preDepart.aqh : null,
          oqDelta,
          periodsAfter: postPeriods,
        },
      };
    } catch (err) {
      return {
        ok: false,
        marketId,
        seed,
        error: String(err && err.message ? err.message : err),
      };
    } finally {
      Math.random = origRand;
    }
  }

  globalThis.__wlRunQualityInflationSuite = function runSuite(config) {
    const markets = config.markets || [];
    const startYears = config.startYears || [1970];
    const runs = config.runs || 3;
    const baseSeed = config.seed >>> 0 || 20260531;

    const marketResults = [];
    const budgetClimbs = [];
    const departures = [];

    const climbPairs = [
      [60, 70],
      [70, 80],
      [80, 90],
      [90, 95],
      [95, 99],
    ];
    const climbMarkets = [
      { marketId: 'wichita', year: 2000 },
      { marketId: 'atlanta', year: 1990 },
      { marketId: 'newyork', year: 2010 },
    ];

    for (const marketId of markets) {
      for (const startYear of startYears) {
        for (let r = 0; r < runs; r++) {
          const seed = (baseSeed + r * 104729 + startYear * 997 + marketId.length * 31) >>> 0;
          marketResults.push(
            runMarketSim({
              marketId,
              startYear,
              endYear: 2020,
              seed,
              noProgInvest: false,
            }),
          );
          marketResults.push(
            runMarketSim({
              marketId,
              startYear,
              endYear: Math.min(2020, startYear + 20),
              seed: (seed + 1) >>> 0,
              noProgInvest: true,
            }),
          );
        }
      }
    }

    climbMarkets.forEach((cm, ci) => {
      climbPairs.forEach(([startQ, targetQ], pi) => {
        budgetClimbs.push(
          measureProgBudgetClimb({
            marketId: cm.marketId,
            year: cm.year,
            startQ,
            targetQ,
            seed: (baseSeed + ci * 1000 + pi * 17) >>> 0,
          }),
        );
      });
    });

    const departureMarkets = ['wichita', 'nashville', 'atlanta', 'chicago', 'seattle'];
    for (let r = 0; r < Math.max(6, runs); r++) {
      departureMarkets.forEach((marketId, mi) => {
        const res = measureMorningHostDeparture({
          marketId,
          seed: (baseSeed + mi * 777 + r * 131) >>> 0,
        });
        departures.push(res);
        if (!res.ok && typeof console !== 'undefined') {
          console.warn('[departure-fail]', marketId, res.error);
        }
      });
    }

    return {
      marketResults,
      budgetClimbs,
      departures,
    };
  };
})();
