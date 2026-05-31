/**
 * VM runner — morning slot quality transitions on every host departure.
 * Exposes: globalThis.__wlRunMorningTransitions(config)
 */
(function () {
  'use strict';

  const SCENARIO_BY_START = {
    1970: 'under',
    1985: 'chrwar',
    2000: 'harness2000',
  };

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

  function snapMorning(st) {
    const sd = st.prog?.morningDrive;
    if (!sd) return null;
    return {
      talentId: sd.talent?.id != null ? String(sd.talent.id) : null,
      talentName: sd.talent?.name || '',
      talentQ: sd.talent ? sd.talent.quality | 0 : null,
      slotQ: Math.round(sd.quality || 0),
      rev: Math.round(st.fin?.rev || 0),
      share: st.rat?.share || 0,
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
    G._wlMorningTransitionsDiag = true;
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  function runMorningTransitionsSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear;
    const endYear = config.endYear || 2020;
    const seed = config.seed >>> 0;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const tier = (MARKETS[marketId] || {}).rankTier || 'medium';
    /** @type {Map<string, object>} prior morning snap before advTurn */
    const priorSnap = new Map();
    /** @type {Map<string, object[]>} active recovery trackers per station */
    const active = new Map();
    /** @type {object[]} completed departure events */
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

    try {
      initGame(marketId, startYear);

      commercialStations(G).forEach((st) => {
        const s = snapMorning(st);
        if (s) priorSnap.set(st.id, s);
      });

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
          const cur = snapMorning(st);
          if (!cur) return;

          updateActiveTrackers(st, cur, idx);

          if (prev && prev.talentId && prev.talentId !== cur.talentId) {
            eventSeq += 1;
            const owner = ownershipType(st);
            const ev = {
              eventId: `${marketId}:${startYear}:${seed}:${eventSeq}`,
              marketId,
              rankTier: tier,
              ownership: owner,
              stationId: st.id,
              call: st.callLetters || '',
              departYear: G.year,
              departPeriod: G.period,
              departPeriodIdx: idx,
              departingSlotQ: prev.slotQ,
              departingTalentQ: prev.talentQ,
              departingTalentName: prev.talentName,
              replacementSlotQ: cur.slotQ,
              replacementTalentQ: cur.talentQ,
              replacementTalentName: cur.talentName || '',
              slotQDeltaImmediate: cur.slotQ - prev.slotQ,
              preDepartureRev: prev.rev,
              preDepartureShare: prev.share,
              postDepartureRevImmediate: cur.rev,
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
              recoveredRevenue:
                prev.rev > 0 && cur.rev >= Math.round(prev.rev * 0.98),
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

          priorSnap.set(st.id, cur);
        });
      }

      while (G.year < endYear) {
        const beforeSnap = new Map();
        commercialStations(G).forEach((st) => {
          const s = snapMorning(st);
          if (s) beforeSnap.set(st.id, s);
        });
        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;
        const idx = periodIndex(G.year, G.period);
        commercialStations(G).forEach((st) => {
          const cur = snapMorning(st);
          if (!cur) return;
          updateActiveTrackers(st, cur, idx);
          priorSnap.set(st.id, cur);
        });
      }

      const finalIdx = periodIndex(G.year, G.period);
      active.forEach((list) => {
        list.forEach((ev) => finalizeEvent(ev, finalIdx));
      });

      return {
        ok: true,
        marketId,
        rankTier: tier,
        startYear,
        seed,
        endYear: G.year,
        eventCount: events.length,
        events,
      };
    } catch (err) {
      return {
        ok: false,
        marketId,
        rankTier: tier,
        startYear,
        seed,
        error: String(err && err.message ? err.message : err),
        eventCount: 0,
        events,
      };
    } finally {
      Math.random = origRand;
    }
  }

  globalThis.__wlRunMorningTransitions = function runBatch(config) {
    const markets = config.markets || [];
    const startYears = config.startYears || [1970, 1985, 2000];
    const runs = config.runs || 4;
    const baseSeed = (config.seed >>> 0) || 20260601;
    const results = [];

    for (const marketId of markets) {
      for (const startYear of startYears) {
        for (let r = 0; r < runs; r++) {
          const seed = (baseSeed + r * 104729 + startYear * 997 + marketId.length * 31) >>> 0;
          results.push(runMorningTransitionsSim({ marketId, startYear, seed }));
        }
      }
    }
    return results;
  };
})();
