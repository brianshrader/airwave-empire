/**
 * VM runner — 2020 commercial quality distribution, prog spend by tier, climb times, 90+ streaks.
 * Exposes: globalThis.__wlRunQualityDistribution2020(config)
 */
(function () {
  'use strict';

  const SCENARIO_BY_START = {
    1970: 'under',
    1985: 'chrwar',
    2000: 'harness2000',
  };

  const BUCKET_ORDER = ['lt50', '50-59', '60-69', '70-79', '80-89', '90-94', '95-99'];

  function ensureHarnessScenarios() {
    if (typeof SC === 'undefined' || !Array.isArray(SC)) return;
    if (!SC.some((s) => s.id === 'harness2000')) {
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

  function emptyBucketCounts() {
    const o = {};
    BUCKET_ORDER.forEach((b) => {
      o[b] = 0;
    });
    return o;
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

  function stationProgSpend(st) {
    if (st._wlLastProgSpend != null && Number.isFinite(st._wlLastProgSpend)) {
      return Math.max(0, Math.round(st._wlLastProgSpend));
    }
    const eff = st.fin?.effProg;
    if (eff != null && Number.isFinite(eff)) return Math.max(0, Math.round(eff));
    return Math.max(0, Math.round(st.ops?.progBudget || 0));
  }

  function runDistributionSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear;
    const endYear = config.endYear || 2020;
    const seed = config.seed >>> 0;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const tier = (MARKETS[marketId] || {}).rankTier || 'medium';
    /** @type {Map<string, object>} */
    const tracks = new Map();

    function ensureTrack(st) {
      if (!tracks.has(st.id)) {
        tracks.set(st.id, {
          callLetters: st.callLetters || '',
          first80: null,
          first90: null,
          first95: null,
          max90Streak: 0,
          current90Streak: 0,
          last90Year: null,
          progRecent: [],
          oqAt2020: null,
          bucket2020: null,
          prevMorning: null,
          prevAfternoon: null,
          lastMajorTalentLossYear: null,
        });
      }
      return tracks.get(st.id);
    }

    function snapshotTalent(t) {
      if (!t) return null;
      return {
        id: String(t.id || ''),
        quality: t.quality | 0,
        superstar: t.superstar === true,
        periodsAtStation: t.periodsAtStation | 0,
        name: t.name || '',
      };
    }

    function notePrimeTalentLoss(tr, slot, prev, year) {
      if (!prev) return;
      const prime = slot === 'morningDrive' || slot === 'afternoonDrive';
      const major =
        prime &&
        (prev.quality >= 60 || prev.superstar || prev.periodsAtStation >= 10);
      if (major) tr.lastMajorTalentLossYear = year;
    }

    function trackPrimeTalent(st, tr, year) {
      ['morningDrive', 'afternoonDrive'].forEach((slot) => {
        const sd = st.prog?.[slot];
        const cur = snapshotTalent(sd?.talent);
        const key = slot === 'morningDrive' ? 'prevMorning' : 'prevAfternoon';
        const prev = tr[key];
        if (prev && (!cur || cur.id !== prev.id)) {
          notePrimeTalentLoss(tr, slot, prev, year);
        }
        tr[key] = cur;
      });
    }

    function ownershipType(st) {
      if (st.isPlayer) return 'player';
      if (st.corpOwner) return 'corporate';
      return 'independent';
    }

    function stationAgeYears(st, Gref) {
      const turn = Gref.turn | 0;
      if (st.launchPeriod != null && st.launchPeriod >= 0 && turn > st.launchPeriod) {
        return (turn - st.launchPeriod) / 2;
      }
      if (st.entryTurn?.year) return Math.max(0, (Gref.year || 2020) - st.entryTurn.year);
      return Math.max(0, (st._formatAge || 0) / 2);
    }

    function yearsSinceHistoryMajorLoss(st, endYear) {
      const hist = st._history || [];
      for (let i = 0; i < hist.length; i++) {
        const h = hist[i];
        if (!h || h.type !== 'TALENT') continue;
        const msg = String(h.msg || '');
        const prime =
          /MORNING|AFTERNOON|Morning|Afternoon|morning host|morning drive/i.test(msg);
        const loss =
          /Released|left for|leaves |replaced.*host|displaced|Benched.*MORNING|Benched.*AFTERNOON/i.test(
            msg,
          ) && !/^Hired /i.test(msg) && !/^Poached /i.test(msg) && !/^Received /i.test(msg);
        if (prime && loss && h.y) return endYear - h.y;
      }
      return null;
    }

    function yearsSinceMajorTalentLoss(st, tr, endYear) {
      const fromTrack =
        tr.lastMajorTalentLossYear != null ? endYear - tr.lastMajorTalentLossYear : null;
      const fromHist = yearsSinceHistoryMajorLoss(st, endYear);
      if (fromTrack == null) return fromHist;
      if (fromHist == null) return fromTrack;
      return Math.min(fromTrack, fromHist);
    }

    try {
      initGame(marketId, startYear);
      const endPeriods = (endYear - startYear) * 2;

      for (let step = 0; step < endPeriods && G.year < endYear; step++) {
        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;

        const year = G.year;
        const yearEnd = G.period === 2;

        commercialStations(G).forEach((st) => {
          const tr = ensureTrack(st);
          const oq = st.oq | 0;
          const spend = stationProgSpend(st);
          tr.progRecent.push(spend);
          if (tr.progRecent.length > 8) tr.progRecent.shift();
          trackPrimeTalent(st, tr, year);

          if (yearEnd) {
            if (oq >= 80 && tr.first80 == null) tr.first80 = year;
            if (oq >= 90 && tr.first90 == null) tr.first90 = year;
            if (oq >= 95 && tr.first95 == null) tr.first95 = year;

            if (oq >= 90) {
              if (tr.last90Year === year - 1) tr.current90Streak += 1;
              else tr.current90Streak = 1;
              tr.max90Streak = Math.max(tr.max90Streak, tr.current90Streak);
              tr.last90Year = year;
            } else {
              tr.current90Streak = 0;
              tr.last90Year = null;
            }
          }
        });
      }

      // Advance into 2020 if we stopped at 2019
      while (G.year < endYear) {
        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;
      }

      const stations2020 = [];
      const elite9599 = [];
      const bucketCounts = emptyBucketCounts();
      const snapshotYear = G.year || 2020;

      commercialStations(G).forEach((st) => {
        const tr = ensureTrack(st);
        const oq = st.oq | 0;
        const bucket = oqBucket(oq);
        bucketCounts[bucket] += 1;
        const recent = tr.progRecent.length
          ? tr.progRecent.reduce((a, b) => a + b, 0) / tr.progRecent.length
          : stationProgSpend(st);
        tr.oqAt2020 = oq;
        tr.bucket2020 = bucket;
        tr.medianProgRecent = Math.round(recent);

        let years80to90 = null;
        let years90to95 = null;
        if (tr.first80 != null && tr.first90 != null && tr.first90 >= tr.first80) {
          years80to90 = tr.first90 - tr.first80;
        }
        if (tr.first90 != null && tr.first95 != null && tr.first95 >= tr.first90) {
          years90to95 = tr.first95 - tr.first90;
        }

        const mdQ = Math.round(st.prog?.morningDrive?.quality || 0);
        const owner = ownershipType(st);
        const simulcastFollower =
          typeof isSimulcastProgrammingReceiver === 'function' &&
          isSimulcastProgrammingReceiver(st, G);
        const ageYears = stationAgeYears(st, G);
        const yrsSinceLoss = yearsSinceMajorTalentLoss(st, tr, snapshotYear);

        const row = {
          id: st.id,
          call: st.callLetters || '',
          oq,
          bucket,
          progSpendRecent: tr.medianProgRecent,
          years80to90,
          years90to95,
          max90StreakYears: tr.max90Streak,
          isPlayer: !!st.isPlayer,
          ownership: owner,
          simulcastFollower: !!simulcastFollower,
          morningQuality: mdQ,
          morningQualityAbove95: mdQ > 95,
          stationAgeYears: Math.round(ageYears * 10) / 10,
          yearsSinceMajorTalentLoss: yrsSinceLoss,
          formatAgeYears: Math.round(((st._formatAge || 0) / 2) * 10) / 10,
        };

        stations2020.push(row);
        if (bucket === '95-99') elite9599.push(row);
      });

      return {
        ok: true,
        marketId,
        rankTier: tier,
        startYear,
        seed,
        endYear: G.year,
        nCommercial: stations2020.length,
        bucketCounts,
        stations2020,
        elite9599,
      };
    } catch (err) {
      return {
        ok: false,
        marketId,
        rankTier: tier,
        startYear,
        seed,
        error: String(err && err.message ? err.message : err),
        bucketCounts: emptyBucketCounts(),
        stations2020: [],
      };
    } finally {
      Math.random = origRand;
    }
  }

  globalThis.__wlRunQualityDistribution2020 = function runBatch(config) {
    const markets = config.markets || [];
    const startYears = config.startYears || [1970, 1985, 2000];
    const runs = config.runs || 4;
    const baseSeed = (config.seed >>> 0) || 20260531;
    const results = [];

    for (const marketId of markets) {
      for (const startYear of startYears) {
        for (let r = 0; r < runs; r++) {
          const seed = (baseSeed + r * 104729 + startYear * 997 + marketId.length * 31) >>> 0;
          results.push(runDistributionSim({ marketId, startYear, seed }));
        }
      }
    }
    return results;
  };
})();
