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

  const BUCKET_ORDER = ['lt50', '50-59', '60-69', '70-79', '80-89', '90-94', '95-99'];
  const DAYPARTS = ['morningDrive', 'afternoonDrive', 'midday', 'evening', 'overnight'];

  function isSuccessorDeparture(prev) {
    if (!prev) return false;
    const slotQ = prev.slotQ | 0;
    const tenure = prev.tenurePeriods | 0;
    if (slotQ >= 90) return true;
    if (slotQ >= 85 && tenure >= 12) return true;
    if (prev.talentSuperstar === true) return true;
    return false;
  }

  function snapStationTalents(st) {
    const map = new Map();
    for (const sl of DAYPARTS) {
      const sd = st.prog?.[sl];
      if (!sd?.talent || sd.talent.id == null) continue;
      map.set(String(sd.talent.id), { slot: sl });
    }
    return map;
  }

  function buildClusterTalentIndex(G) {
    const byOwner = new Map();
    for (const st of commercialStations(G)) {
      const owner = st.corpOwner ? String(st.corpOwner) : null;
      if (!owner) continue;
      if (!byOwner.has(owner)) byOwner.set(owner, new Map());
      const ownerMap = byOwner.get(owner);
      for (const sl of DAYPARTS) {
        const sd = st.prog?.[sl];
        if (!sd?.talent || sd.talent.id == null) continue;
        ownerMap.set(String(sd.talent.id), { stationId: st.id, slot: sl });
      }
    }
    return byOwner;
  }

  function classifyReplacement(st, curTalentId, stationTalentsBefore, clusterIdx) {
    if (!curTalentId) return 'vacant';
    const onStation = stationTalentsBefore.get(curTalentId);
    if (onStation && onStation.slot !== 'morningDrive') return 'internal';
    const corp = st.corpOwner ? String(st.corpOwner) : null;
    if (corp && clusterIdx.has(corp)) {
      const elsewhere = clusterIdx.get(corp).get(curTalentId);
      if (elsewhere && elsewhere.stationId !== st.id) return 'cluster';
    }
    return 'external';
  }

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
      talentSuperstar: sd.talent?.superstar === true,
      slotQ: Math.round(sd.quality || 0),
      tenurePeriods: sd.talent ? sd.talent.periodsAtStation | 0 : 0,
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
    const helpers = globalThis.__wlSuccessorRecoveryHelpers;
    const snapFn = helpers ? helpers.snapMorningFull : snapMorning;
    const tracker = helpers
      ? helpers.createSuccessorDepartureTracker({ marketId, startYear, seed })
      : null;
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

        if (!ev.recoveredQuality && cur.slotQ >= (ev.originalPriorSlotQ ?? ev.departingSlotQ)) {
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
        const beforeStationTalents = new Map();
        const clusterIdx = buildClusterTalentIndex(G);
        commercialStations(G).forEach((st) => {
          const s = snapFn(st);
          if (s) {
            beforeSnap.set(st.id, s);
            if (tracker) tracker.processTurnStart(st, s);
          }
          beforeStationTalents.set(st.id, snapStationTalents(st));
        });

        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;

        const idx = periodIndex(G.year, G.period);

        commercialStations(G).forEach((st) => {
          const prev = beforeSnap.get(st.id);
          const cur = snapFn(st);
          if (!cur) return;

          const stationTalents = beforeStationTalents.get(st.id) || new Map();
          if (tracker) {
            tracker.onDelayedFill(
              st,
              prev,
              cur,
              idx,
              tracker.classifyReplacement(st, cur.talentId, stationTalents, clusterIdx),
              {},
            );
          }

          updateActiveTrackers(st, cur, idx);

          if (prev && prev.talentId && prev.talentId !== cur.talentId) {
            const replacementType = classifyReplacement(
              st,
              cur.talentId,
              stationTalents,
              clusterIdx,
            );
            const isSuccessor = isSuccessorDeparture(prev);
            let trackerEv = null;
            if (isSuccessor && tracker) {
              trackerEv = tracker.onSuccessorDeparture(st, prev, cur, idx, replacementType, {});
            }
            eventSeq += 1;
            const owner = ownershipType(st);
            const ev = {
              eventId: `${marketId}:${startYear}:${seed}:${eventSeq}`,
              marketId,
              rankTier: tier,
              ownership: owner,
              stationId: st.id,
              call: st.callLetters || '',
              isSuccessorDeparture: isSuccessor,
              replacementType,
              hadSuccessorCeiling: !!st.morningSuccessorCeiling,
              originalPriorSlotQ: prev.slotQ,
              fillTiming: trackerEv?.fillTiming || 'same_turn_fill',
              periodsVacantBeforeFill: trackerEv?.periodsVacantBeforeFill || 0,
              hasCeilingAtFill: cur.hasCeiling ?? !!st.morningSuccessorCeiling,
              ceilingAtFill: cur.ceiling ?? st.morningSuccessorCeiling?.ceiling ?? null,
              immediateRecoverEndOfFill: trackerEv?.immediateRecoverEndOfFill ?? cur.slotQ >= prev.slotQ,
              immediateRecoverTPlus1: trackerEv?.immediateRecoverTPlus1 ?? false,
              integrityFlagged: trackerEv?.integrityFlagged ?? false,
              integrityFlags: trackerEv?.integrityFlags || [],
              departYear: G.year,
              departPeriod: G.period,
              departPeriodIdx: idx,
              departingSlotQ: prev.slotQ,
              departingTalentQ: prev.talentQ,
              departingTalentName: prev.talentName,
              replacementSlotQ: cur.slotQ,
              replacementSlotQAtFill: cur.slotQ,
              replacementTalentQ: cur.talentQ,
              replacementTalentName: cur.talentName || '',
              slotQDeltaImmediate: cur.slotQ - prev.slotQ,
              preDepartureRev: prev.rev,
              preDepartureShare: prev.share,
              postDepartureRevImmediate: cur.rev,
              recoveredQuality: trackerEv?.recoveredQuality ?? cur.slotQ >= prev.slotQ,
              exceededQuality: cur.slotQ > prev.slotQ,
              yearsToRecoverQuality:
                trackerEv?.yearsToRecoverQuality ??
                (cur.slotQ >= prev.slotQ
                  ? yearsBetween(G.year, G.period, G.year, G.period)
                  : null),
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

          if (tracker) tracker.processTurnEnd(st, cur, idx);
          priorSnap.set(st.id, cur);
        });
      }

      while (G.year < endYear) {
        const beforeSnap = new Map();
        commercialStations(G).forEach((st) => {
          const s = snapFn(st);
          if (s) {
            beforeSnap.set(st.id, s);
            if (tracker) tracker.processTurnStart(st, s);
          }
        });
        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;
        const idx = periodIndex(G.year, G.period);
        commercialStations(G).forEach((st) => {
          const cur = snapFn(st);
          if (!cur) return;
          updateActiveTrackers(st, cur, idx);
          if (tracker) tracker.processTurnEnd(st, cur, idx);
          priorSnap.set(st.id, cur);
        });
      }

      if (tracker) tracker.finalizeAll(periodIndex(G.year, G.period));

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
