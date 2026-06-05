/**
 * Ceiling enforcement coverage audit runner.
 * Exposes: globalThis.__wlRunSuccessorCeilingCoverage(config)
 */
(function () {
  'use strict';

  const H = () => globalThis.__wlSuccessorRecoveryHelpers;
  const SCENARIO_BY_START = { 1970: 'under', 1985: 'chrwar', 2000: 'harness2000' };

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

  function initGame(marketId, startYear) {
    ensureHarnessScenarios();
    const scenId = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
    ACTIVE_MARKET = marketId;
    _selectedMarket = marketId;
    if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
    G = genMarket(scenId);
    G.marketId = marketId;
    G.tutorialMode = false;
    G._wlCeilingCoverageDiag = true;
    G._wlCeilingHookLog = [];
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  function runCoverageSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear;
    const endYear = config.endYear || 2020;
    const seed = config.seed >>> 0;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const helpers = H();
    const snap = helpers.snapMorningFull;
    const tracker = helpers.createSuccessorDepartureTracker({
      marketId,
      startYear,
      seed,
    });
    const coverageEvents = [];
    const pendingClamp = new Map();

    function fillTurnLogs(stId, idx) {
      return (G._wlCeilingHookLog || []).filter((e) => {
        if (e.stationId !== stId) return false;
        if (e.periodIdx != null) return e.periodIdx === idx;
        return helpers.periodIndex(e.year, e.period) === idx;
      });
    }

    function recordFill(st, ev, after, idx) {
      if (!ev || ev._coverageRecorded || !ev.filled) return;
      ev._coverageRecorded = true;

      const logs = fillTurnLogs(st.id, idx);
      const appliedLog = logs.find((e) => e.type === 'ceilingApplied');
      const clearedLogs = logs.filter((e) => e.type === 'ceilingCleared');
      const wrapperCalled = logs.some((e) => e.type === 'onSlotFillWrapper');
      const directInternal = logs.some((e) => e.type === 'internalPromotionDirect');
      const noteHooks = logs.filter((e) => e.type === 'noteClear');
      const assignSkipped = logs.find(
        (e) => e.type === 'onAssignSkipped' || e.type === 'ceilingSkipped',
      );

      pendingClamp.set(st.id, {
        eventId: ev.eventId,
        ceilingAtFill: after.ceiling,
        slotQAtFill: after.slotQ,
      });

      let fillPath =
        G._wlCeilingFillPath ||
        logs.find((e) => e.path)?.path ||
        'unknown';
      if (directInternal && fillPath === 'ai_internal_promotion') {
        fillPath = 'internal_promotion_direct';
      }

      coverageEvents.push({
        eventId: ev.eventId,
        stationId: st.id,
        call: st.callLetters || '',
        fillTiming: ev.fillTiming,
        replacementType: ev.replacementType,
        fillPath,
        replacementSlotQAtFill: after.slotQ,
        ceilingAtFill: after.ceiling,
        hasCeilingAfterFill: after.hasCeiling,
        mcReplacementType: st.morningSuccessorCeiling?.replacementType || null,
        onSlotFillCalled: wrapperCalled,
        internalPromotionDirect: directInternal,
        noteClearCalled: noteHooks.length > 0,
        noteClearCount: noteHooks.length,
        ceilingAppliedOnFillTurn: !!appliedLog,
        ceilingClearedSameTurn: clearedLogs.length > 0,
        ceilingClearReason: clearedLogs[clearedLogs.length - 1]?.reason || null,
        onAssignSkippedReason: assignSkipped?.reason || null,
        departPriorQAtFill:
          appliedLog?.priorSlotQ ??
          st._morningSuccessorDepartPriorQ ??
          ev.originalPriorSlotQ,
        fillTurnLogTypes: logs.map((e) => e.type),
        slotQExceededCeilingAtFill: after.ceiling != null && after.slotQ > after.ceiling + 1,
        immediateRecoverEndOfFill: after.slotQ >= ev.originalPriorSlotQ,
        integrityFlags: helpers.computeIntegrityFlags({
          filled: true,
          originalPriorSlotQ: ev.originalPriorSlotQ,
          replacementSlotQAtFill: after.slotQ,
          ceilingAtFill: after.ceiling,
          hasCeilingAfterFill: after.hasCeiling,
          replacementType: ev.replacementType,
          immediateRecoverEndOfFill: after.slotQ >= ev.originalPriorSlotQ,
        }),
        fillPeriodIdx: idx,
      });
    }

    try {
      initGame(marketId, startYear);
      const endPeriods = (endYear - startYear) * 2;

      for (let step = 0; step < endPeriods && G.year < endYear; step++) {
        const beforeSnap = new Map();
        const beforeTalents = new Map();
        const clusterIdx = tracker.buildClusterIdx(G, commercialStations);

        commercialStations(G).forEach((st) => {
          const s = snap(st);
          if (s) {
            beforeSnap.set(st.id, s);
            tracker.processTurnStart(st, s);
            const pend = pendingClamp.get(st.id);
            if (pend) {
              pend.slotQAtNextPeriodStart = s.slotQ;
              pend.ceilingAtNextPeriodStart = s.ceiling;
              pend.hasCeilingAtNextPeriodStart = s.hasCeiling;
              pend.clampedByNextPeriod =
                pend.ceilingAtFill != null ? s.slotQ <= pend.ceilingAtFill + 1 : null;
              const cov = coverageEvents.find((c) => c.eventId === pend.eventId);
              if (cov) Object.assign(cov, pend);
              pendingClamp.delete(st.id);
            }
          }
          beforeTalents.set(st.id, tracker.snapStationTalents(st));
        });

        G._wlCeilingFillPath = null;
        const turnPeriodIdx = helpers.periodIndex(G.year, G.period);
        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;

        const idx = helpers.periodIndex(G.year, G.period);

        commercialStations(G).forEach((st) => {
          const before = beforeSnap.get(st.id);
          const after = snap(st);
          if (!after) return;
          const stationTalents = beforeTalents.get(st.id) || new Map();
          const repType = tracker.classifyReplacement(
            st,
            after.talentId,
            stationTalents,
            clusterIdx,
          );

          tracker.onDelayedFill(st, before, after, turnPeriodIdx, repType, {});

          if (before && before.talentId && helpers.isSuccessorSnap(before)) {
            const changed = before.talentId !== after.talentId;
            if (changed) {
              const ev = tracker.onSuccessorDeparture(st, before, after, turnPeriodIdx, repType, {});
              if (ev && ev.filled) recordFill(st, ev, after, turnPeriodIdx);
            }
          }

          const openEv = tracker.openDepartures.get(st.id);
          if (openEv && openEv.filled && openEv.fillPeriodIdx === turnPeriodIdx && !openEv._coverageRecorded) {
            recordFill(st, openEv, after, turnPeriodIdx);
          }

          tracker.processTurnEnd(st, after, idx);
        });
      }

      tracker.finalizeAll(helpers.periodIndex(G.year, G.period));

      return {
        ok: true,
        marketId,
        startYear,
        seed,
        eventCount: coverageEvents.length,
        events: coverageEvents,
      };
    } catch (err) {
      return {
        ok: false,
        marketId,
        startYear,
        seed,
        error: String(err && err.message ? err.message : err),
        eventCount: coverageEvents.length,
        events: coverageEvents,
      };
    } finally {
      Math.random = origRand;
    }
  }

  globalThis.__wlRunSuccessorCeilingCoverage = function runBatch(config) {
    const markets = config.markets || [];
    const startYears = config.startYears || [1970, 1985, 2000];
    const runs = config.runs || 2;
    const baseSeed = (config.seed >>> 0) || 20260601;
    const results = [];
    for (const marketId of markets) {
      for (const startYear of startYears) {
        for (let r = 0; r < runs; r++) {
          const seed = (baseSeed + r * 104729 + startYear * 997 + marketId.length * 31) >>> 0;
          results.push(
            runCoverageSim({ marketId, startYear, seed, endYear: config.endYear }),
          );
        }
      }
    }
    return results;
  };
})();
