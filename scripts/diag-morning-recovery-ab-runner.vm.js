/**
 * VM runner — morning recovery A/B (transitions + 2020 OQ distribution).
 * Exposes: globalThis.__wlRunMorningRecoveryAb(config)
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

  function ownershipType(st) {
    if (st.isPlayer) return 'player';
    if (st.corpOwner) return 'corporate';
    return 'independent';
  }

  function periodIndex(y, p) {
    return (y | 0) * 2 + ((p | 0) === 2 ? 1 : 0);
  }

  function yearsBetween(fromY, fromP, toY, toP) {
    return (periodIndex(toY, toP) - periodIndex(fromY, fromP)) / 2;
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

  function departSlotTier(slotQ) {
    const q = slotQ | 0;
    if (q < 70) return 'lt70';
    if (q < 85) return '70-84';
    if (q < 95) return '85-94';
    return '95+';
  }

  function emptyBucketCounts() {
    const o = {};
    BUCKET_ORDER.forEach((b) => {
      o[b] = 0;
    });
    return o;
  }

  function snapMorning(st) {
    const sd = st.prog?.morningDrive;
    if (!sd) return null;
    return {
      talentId: sd.talent?.id != null ? String(sd.talent.id) : null,
      talentName: sd.talent?.name || '',
      talentQ: sd.talent ? sd.talent.quality | 0 : null,
      slotQ: Math.round(sd.quality || 0),
      tenurePeriods: sd.talent ? sd.talent.periodsAtStation | 0 : 0,
      rev: Math.round(st.fin?.rev || 0),
      share: st.rat?.share || 0,
    };
  }

  function initGame(marketId, startYear, variant) {
    ensureHarnessScenarios();
    const scenId = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
    ACTIVE_MARKET = marketId;
    _selectedMarket = marketId;
    if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
    G = genMarket(scenId);
    G.marketId = marketId;
    G.tutorialMode = false;
    G._wlMorningRecoveryAbDiag = true;
    G._wlMorningRecoveryVariant = variant || 'A';
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  function collect2020Snapshot(G, marketId, tier) {
    const buckets = emptyBucketCounts();
    const rows = [];
    let sumOq = 0;
    let n = 0;
    let above90 = 0;
    let bucket9599 = 0;
    let playerAbove95 = 0;
    let playerCount = 0;
    const formatCounts = {};

    commercialStations(G).forEach((st) => {
      const oq = Math.round(st.oq || 0);
      const b = oqBucket(oq);
      buckets[b] += 1;
      sumOq += oq;
      n += 1;
      if (oq >= 90) above90 += 1;
      if (oq >= 95 && oq <= 99) bucket9599 += 1;
      if (st.isPlayer) {
        playerCount += 1;
        if (oq >= 95) playerAbove95 += 1;
      }
      const fmt = String(st.format || 'UNKNOWN');
      formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
      rows.push({
        marketId,
        rankTier: tier,
        stationId: st.id,
        call: st.callLetters || '',
        oq,
        bucket: b,
        format: fmt,
        ownership: ownershipType(st),
        morningSlotQ: Math.round(st.prog?.morningDrive?.quality || 0),
        share: st.rat?.share || 0,
      });
    });

    return {
      commercialCount: n,
      meanOq: n ? Math.round((sumOq / n) * 100) / 100 : null,
      pctAbove90: n ? Math.round((100 * above90) / n * 100) / 100 : 0,
      pct9599: n ? Math.round((100 * bucket9599) / n * 100) / 100 : 0,
      buckets,
      playerStations: playerCount,
      playerStationsAbove95: playerAbove95,
      formatCounts,
      rows,
    };
  }

  function runRecoveryAbSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear;
    const endYear = config.endYear || 2020;
    const seed = config.seed >>> 0;
    const variant = config.variant || 'A';
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const tier = (MARKETS[marketId] || {}).rankTier || 'medium';
    const active = new Map();
    const events = [];
    let eventSeq = 0;

    function finalizeEvent(ev, endIdx) {
      if (ev._finalized) return;
      ev._finalized = true;
      if (!ev.recoveredQuality) ev.yearsToRecoverQuality = null;
      if (!ev.recoveredRevenue) ev.yearsToRecoverRevenue = null;
      if (!ev.exceededQuality) ev.yearsToExceedQuality = null;
      ev.observationPeriods = endIdx - ev.departPeriodIdx;
      events.push(ev);
    }

    function updateActiveTrackers(st, cur, idx) {
      const list = active.get(st.id);
      if (!list?.length) return;
      for (let i = list.length - 1; i >= 0; i--) {
        const ev = list[i];
        if (ev._finalized) continue;

        if (!ev.recoveredQuality && cur.slotQ >= ev.departingSlotQ) {
          ev.recoveredQuality = true;
          ev.yearsToRecoverQuality = yearsBetween(
            ev.departYear,
            ev.departPeriod,
            G.year,
            G.period,
          );
        }
        if (!ev.exceededQuality && cur.slotQ > ev.departingSlotQ) {
          ev.exceededQuality = true;
          ev.yearsToExceedQuality = yearsBetween(
            ev.departYear,
            ev.departPeriod,
            G.year,
            G.period,
          );
        }
        const revFloor = Math.max(0, Math.round(ev.preDepartureRev * 0.98));
        if (!ev.recoveredRevenue && ev.preDepartureRev > 0 && cur.rev >= revFloor) {
          ev.recoveredRevenue = true;
          ev.yearsToRecoverRevenue = yearsBetween(
            ev.departYear,
            ev.departPeriod,
            G.year,
            G.period,
          );
        }

        if (idx - ev.departPeriodIdx >= 40) finalizeEvent(ev, idx);
      }
      active.set(
        st.id,
        list.filter((ev) => !ev._finalized),
      );
    }

    function recordDeparture(st, prev, cur, idx) {
      eventSeq += 1;
      const owner = ownershipType(st);
      const isMajor =
        typeof wlMorningRecoveryIsMajorDeparture === 'function'
          ? wlMorningRecoveryIsMajorDeparture(prev.slotQ, prev.tenurePeriods || 0)
          : prev.slotQ >= 85 || (prev.tenurePeriods | 0) >= 10;
      const isEliteLoss = (prev.slotQ | 0) >= 90;
      const isSuperEliteLoss = (prev.slotQ | 0) >= 95;

      const ev = {
        eventId: `${marketId}:${startYear}:${seed}:${eventSeq}`,
        variant,
        marketId,
        rankTier: tier,
        ownership: owner,
        stationId: st.id,
        call: st.callLetters || '',
        format: st.format || '',
        departYear: G.year,
        departPeriod: G.period,
        departPeriodIdx: idx,
        departingSlotQ: prev.slotQ,
        departingTalentQ: prev.talentQ,
        departingTenure: prev.tenurePeriods || 0,
        departingTalentName: prev.talentName,
        replacementSlotQ: cur.slotQ,
        replacementTalentQ: cur.talentQ,
        replacementTalentName: cur.talentName || '',
        slotQDeltaImmediate: cur.slotQ - prev.slotQ,
        preDepartureRev: prev.rev,
        preDepartureShare: prev.share,
        postDepartureRevImmediate: cur.rev,
        isMajor,
        isEliteLoss,
        isSuperEliteLoss,
        departSlotTier: departSlotTier(prev.slotQ),
        recoveredQuality: cur.slotQ >= prev.slotQ,
        exceededQuality: cur.slotQ > prev.slotQ,
        yearsToRecoverQuality:
          cur.slotQ >= prev.slotQ
            ? yearsBetween(G.year, G.period, G.year, G.period)
            : null,
        yearsToExceedQuality:
          cur.slotQ > prev.slotQ
            ? yearsBetween(G.year, G.period, G.year, G.period)
            : null,
        recoveredRevenue: prev.rev > 0 && cur.rev >= Math.round(prev.rev * 0.98),
        yearsToRecoverRevenue:
          prev.rev > 0 && cur.rev >= Math.round(prev.rev * 0.98)
            ? yearsBetween(G.year, G.period, G.year, G.period)
            : null,
        _finalized: false,
      };

      if (!ev.recoveredQuality || !ev.recoveredRevenue || !ev.exceededQuality) {
        if (!active.has(st.id)) active.set(st.id, []);
        active.get(st.id).push(ev);
      } else {
        ev.observationPeriods = 0;
        ev._finalized = true;
        events.push(ev);
      }
    }

    try {
      initGame(marketId, startYear, variant);

      const endPeriods = (endYear - startYear) * 2;

      for (let step = 0; step < endPeriods && G.year < endYear; step++) {
        const beforeSnap = new Map();
        commercialStations(G).forEach((st) => {
          const s = snapMorning(st);
          if (s) beforeSnap.set(st.id, s);
        });

        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;

        const idx = periodIndex(G.year, G.period);

        commercialStations(G).forEach((st) => {
          const prev = beforeSnap.get(st.id);
          let cur = snapMorning(st);
          if (!cur) return;

          if (
            prev &&
            prev.talentId &&
            cur.talentId &&
            prev.talentId !== cur.talentId &&
            typeof wlMorningRecoveryApplyOnDeparture === 'function'
          ) {
            wlMorningRecoveryApplyOnDeparture(st, prev, G);
            cur = snapMorning(st);
          }

          updateActiveTrackers(st, cur, idx);

          if (prev && prev.talentId && prev.talentId !== cur.talentId) {
            recordDeparture(st, prev, cur, idx);
          }
        });
      }

      while (G.year < endYear) {
        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;
        const idx = periodIndex(G.year, G.period);
        commercialStations(G).forEach((st) => {
          const cur = snapMorning(st);
          if (!cur) return;
          updateActiveTrackers(st, cur, idx);
        });
      }

      const finalIdx = periodIndex(G.year, G.period);
      active.forEach((list) => {
        list.forEach((ev) => finalizeEvent(ev, finalIdx));
      });

      const snapshot2020 = collect2020Snapshot(G, marketId, tier);

      return {
        ok: true,
        variant,
        marketId,
        rankTier: tier,
        startYear,
        seed,
        endYear: G.year,
        eventCount: events.length,
        events,
        snapshot2020,
      };
    } catch (err) {
      return {
        ok: false,
        variant,
        marketId,
        rankTier: tier,
        startYear,
        seed,
        error: String(err && err.message ? err.message : err),
        eventCount: 0,
        events: [],
        snapshot2020: null,
      };
    } finally {
      Math.random = origRand;
    }
  }

  globalThis.__wlRunMorningRecoveryAb = function runBatch(config) {
    const markets = config.markets || [];
    const startYears = config.startYears || [1970, 1985, 2000];
    const runs = config.runs || 2;
    const variant = config.variant || 'A';
    const baseSeed = (config.seed >>> 0) || 20260601;
    const results = [];

    for (const marketId of markets) {
      for (const startYear of startYears) {
        for (let r = 0; r < runs; r++) {
          const seed = (baseSeed + r * 104729 + startYear * 997 + marketId.length * 31) >>> 0;
          results.push(
            runRecoveryAbSim({ marketId, startYear, seed, variant, endYear: config.endYear }),
          );
        }
      }
    }
    return results;
  };
})();
