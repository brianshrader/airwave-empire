/**
 * Successor recovery timing audit — departure vs fill, vacancy decay, recovery targets.
 * Exposes: globalThis.__wlRunSuccessorRecoveryTiming(config)
 */
(function () {
  'use strict';

  const SCENARIO_BY_START = {
    1970: 'under',
    1985: 'chrwar',
    2000: 'harness2000',
  };

  const DAYPARTS = ['morningDrive', 'afternoonDrive', 'midday', 'evening', 'overnight'];

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

  function periodIndex(y, p) {
    return (y | 0) * 2 + ((p | 0) === 2 ? 1 : 0);
  }

  function yearsBetween(fromY, fromP, toY, toP) {
    return (periodIndex(toY, toP) - periodIndex(fromY, fromP)) / 2;
  }

  function isSuccessorSnap(snap) {
    if (!snap?.talentId) return false;
    const slotQ = snap.slotQ | 0;
    const tenure = snap.tenurePeriods | 0;
    if (slotQ >= 90) return true;
    if (slotQ >= 85 && tenure >= 12) return true;
    if (snap.talentSuperstar === true) return true;
    return false;
  }

  function snapMorning(st) {
    const H = globalThis.__wlSuccessorRecoveryHelpers;
    if (H) return H.snapMorningFull(st);
    const sd = st.prog?.morningDrive;
    if (!sd) return null;
    const mc = st.morningSuccessorCeiling || null;
    return {
      talentId: sd.talent?.id != null ? String(sd.talent.id) : null,
      talentName: sd.talent?.name || '',
      slotQ: Math.round(sd.quality || 0),
      tenurePeriods: sd.talent ? sd.talent.periodsAtStation | 0 : 0,
      talentSuperstar: sd.talent?.superstar === true,
      hasCeiling: !!mc,
      ceiling: mc ? Math.round(mc.ceiling || 0) : null,
      ceilingPriorSlotQ: mc ? mc.priorSlotQ | 0 : null,
      pendingPriorSlotQ: st._morningSuccessorPending?.priorSlotQ | 0,
    };
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

  function buildClusterIdx(G) {
    const byOwner = new Map();
    for (const st of commercialStations(G)) {
      const owner = st.corpOwner ? String(st.corpOwner) : null;
      if (!owner) continue;
      if (!byOwner.has(owner)) byOwner.set(owner, new Map());
      for (const sl of DAYPARTS) {
        const sd = st.prog?.[sl];
        if (!sd?.talent || sd.talent.id == null) continue;
        byOwner.get(owner).set(String(sd.talent.id), { stationId: st.id });
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

  function initGame(marketId, startYear) {
    ensureHarnessScenarios();
    const scenId = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
    ACTIVE_MARKET = marketId;
    _selectedMarket = marketId;
    if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
    G = genMarket(scenId);
    G.marketId = marketId;
    G.tutorialMode = false;
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  function runTimingAuditSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear;
    const endYear = config.endYear || 2020;
    const seed = config.seed >>> 0;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const events = [];
    /** @type {Map<string, object>} active successor departure awaiting fill or tracking recovery */
    const openDepartures = new Map();
    const pendingTPlus1 = new Map();
    let eventSeq = 0;

    function finalizeOpen(ev, endIdx, reason) {
      if (ev._finalized) return;
      ev._finalized = true;
      ev.finalStatus = reason || ev.fillTiming || 'vacancy_still_open';
      ev.observationPeriods = endIdx - ev.departPeriodIdx;
      events.push(ev);
      openDepartures.delete(ev.stationId);
    }

    function updateRecovery(ev, cur, idx) {
      if (ev._finalized || !ev.filled) return;
      const origTarget = ev.originalPriorSlotQ | 0;
      const harnessTarget = ev.harnessRecoveryTarget | 0;
      const vacancyTarget = ev.vacancySlotQAtFill != null ? ev.vacancySlotQAtFill | 0 : null;

      if (!ev.recoveredOriginal && cur.slotQ >= origTarget) {
        ev.recoveredOriginal = true;
        ev.yearsToRecoverOriginal = yearsBetween(
          ev.departYear,
          ev.departPeriod,
          G.year,
          G.period,
        );
      }
      if (!ev.recoveredHarness && cur.slotQ >= harnessTarget) {
        ev.recoveredHarness = true;
        ev.yearsToRecoverHarness = yearsBetween(
          ev.departYear,
          ev.departPeriod,
          G.year,
          G.period,
        );
      }
      if (
        vacancyTarget != null &&
        !ev.recoveredVacancyTarget &&
        cur.slotQ >= vacancyTarget
      ) {
        ev.recoveredVacancyTarget = true;
        ev.yearsToRecoverVacancyTarget = yearsBetween(
          ev.departYear,
          ev.departPeriod,
          G.year,
          G.period,
        );
      }
      if (idx - ev.departPeriodIdx >= 40) finalizeOpen(ev, idx, 'observation_cap');
    }

    function trackVacancySlotQ(ev, slotQ) {
      if (ev._finalized || ev.filled) return;
      const q = slotQ | 0;
      ev.vacancyPeriods = (ev.vacancyPeriods | 0) + 1;
      if (ev.minVacancySlotQ == null || q < ev.minVacancySlotQ) ev.minVacancySlotQ = q;
      if (ev.maxVacancySlotQ == null || q > ev.maxVacancySlotQ) ev.maxVacancySlotQ = q;
      ev.lastVacancySlotQ = q;
    }

    function openSuccessorDeparture(st, before, after, idx, stationTalents, clusterIdx) {
      if (!isSuccessorSnap(before)) return;
      if (openDepartures.has(st.id)) {
        finalizeOpen(openDepartures.get(st.id), idx, 'superseded_by_new_departure');
      }

      eventSeq += 1;
      const originalPriorSlotQ = before.slotQ | 0;
      const ev = {
        eventId: `${marketId}:${startYear}:${seed}:${eventSeq}`,
        marketId,
        stationId: st.id,
        call: st.callLetters || '',
        departYear: G.year,
        departPeriod: G.period,
        departPeriodIdx: idx,
        originalPriorSlotQ,
        harnessRecoveryTarget: originalPriorSlotQ,
        departingTalentName: before.talentName,
        vacancySlotQImmediate: after && !after.talentId ? after.slotQ | 0 : null,
        slotQDropOnDeparture:
          after && !after.talentId ? originalPriorSlotQ - (after.slotQ | 0) : null,
        priorSlotQLoweredDuringVacancy: false,
        minVacancySlotQ: null,
        maxVacancySlotQ: null,
        lastVacancySlotQ: null,
        vacancyPeriods: 0,
        filled: false,
        fillTiming: null,
        fillPeriodIdx: null,
        periodsVacantBeforeFill: null,
        replacementType: null,
        replacementSlotQAtFill: null,
        ceilingAtFill: null,
        ceilingPriorSlotQAtFill: null,
        trustTransferApplied: null,
        recoveredOriginal: false,
        recoveredHarness: false,
        recoveredVacancyTarget: false,
        yearsToRecoverOriginal: null,
        yearsToRecoverHarness: null,
        yearsToRecoverVacancyTarget: null,
        immediateRecoverOriginal: false,
        immediateRecoverHarness: false,
        _finalized: false,
      };

      const sameTurnFill = after && after.talentId && after.talentId !== before.talentId;
      if (sameTurnFill) {
        const repType = classifyReplacement(st, after.talentId, stationTalents, clusterIdx);
        ev.filled = true;
        ev.fillTiming = 'same_turn_fill';
        ev.fillPeriodIdx = idx;
        ev.periodsVacantBeforeFill = 0;
        ev.replacementType = repType;
        ev.replacementSlotQAtFill = after.slotQ | 0;
        ev.ceilingAtFill = after.ceiling;
        ev.ceilingPriorSlotQAtFill = after.ceilingPriorSlotQ || originalPriorSlotQ;
        ev.trustTransferApplied = repType === 'internal';
        ev.vacancySlotQAtFill = null;
        ev.immediateRecoverEndOfFill = (after.slotQ | 0) >= originalPriorSlotQ;
        ev.immediateRecoverOriginal = ev.immediateRecoverEndOfFill;
        ev.hasCeilingAfterFill = after.hasCeiling;
        if (ev.immediateRecoverEndOfFill) {
          ev.recoveredOriginal = true;
          ev.yearsToRecoverOriginal = 0;
          ev.recoveredHarness = true;
          ev.yearsToRecoverHarness = 0;
        }
        pendingTPlus1.set(st.id, ev);
        if (!ev.recoveredOriginal) openDepartures.set(st.id, ev);
        else {
          ev._finalized = true;
          ev.finalStatus = 'same_turn_fill';
          ev.observationPeriods = 0;
          events.push(ev);
        }
      } else {
        ev.fillTiming = 'vacancy_opened';
        if (after && !after.talentId) {
          ev.minVacancySlotQ = after.slotQ | 0;
          ev.maxVacancySlotQ = after.slotQ | 0;
          ev.lastVacancySlotQ = after.slotQ | 0;
          if ((after.slotQ | 0) < originalPriorSlotQ) {
            ev.priorSlotQLoweredDuringVacancy = true;
          }
        }
        openDepartures.set(st.id, ev);
      }
    }

    function tryFillOpenDeparture(st, before, after, idx, stationTalents, clusterIdx) {
      const ev = openDepartures.get(st.id);
      if (!ev || ev.filled || ev._finalized) return;
      if (!before || before.talentId) return;
      if (!after || !after.talentId) return;

      const repType = classifyReplacement(st, after.talentId, stationTalents, clusterIdx);
      ev.filled = true;
      ev.fillTiming = 'delayed_fill';
      ev.fillPeriodIdx = idx;
      ev.periodsVacantBeforeFill = idx - ev.departPeriodIdx;
      ev.replacementType = repType;
      ev.replacementSlotQAtFill = after.slotQ | 0;
      ev.ceilingAtFill = after.ceiling;
      ev.ceilingPriorSlotQAtFill = after.ceilingPriorSlotQ || ev.originalPriorSlotQ;
      ev.trustTransferApplied = repType === 'internal';
      ev.vacancySlotQAtFill = before.slotQ | 0;
      if ((before.slotQ | 0) < (ev.originalPriorSlotQ | 0)) {
        ev.priorSlotQLoweredDuringVacancy = true;
      }
      ev.harnessRecoveryTarget = before.slotQ | 0;
      ev.immediateRecoverEndOfFill = (after.slotQ | 0) >= (ev.originalPriorSlotQ | 0);
      ev.immediateRecoverOriginal = ev.immediateRecoverEndOfFill;
      ev.immediateRecoverHarness = (after.slotQ | 0) >= (ev.harnessRecoveryTarget | 0);
      ev.hasCeilingAfterFill = after.hasCeiling;
      pendingTPlus1.set(st.id, ev);
      if (ev.immediateRecoverOriginal) {
        ev.recoveredOriginal = true;
        ev.yearsToRecoverOriginal = yearsBetween(
          ev.departYear,
          ev.departPeriod,
          G.year,
          G.period,
        );
      }
      if (ev.immediateRecoverHarness) {
        ev.recoveredHarness = true;
        ev.yearsToRecoverHarness = yearsBetween(
          ev.departYear,
          ev.departPeriod,
          G.year,
          G.period,
        );
      }
      if ((after.slotQ | 0) >= (before.slotQ | 0)) {
        ev.recoveredVacancyTarget = true;
        ev.yearsToRecoverVacancyTarget = yearsBetween(
          ev.departYear,
          ev.departPeriod,
          G.year,
          G.period,
        );
      }
    }

    try {
      initGame(marketId, startYear);
      const endPeriods = (endYear - startYear) * 2;

      for (let step = 0; step < endPeriods && G.year < endYear; step++) {
        const beforeSnap = new Map();
        const beforeTalents = new Map();
        const clusterIdx = buildClusterIdx(G);

        commercialStations(G).forEach((st) => {
          const s = snapMorning(st);
          if (s) {
            beforeSnap.set(st.id, s);
            const pend = pendingTPlus1.get(st.id);
            if (pend && pend._awaitingTPlus1 !== false) {
              pend.immediateRecoverTPlus1 = (s.slotQ | 0) >= (pend.originalPriorSlotQ | 0);
              if (pend.immediateRecoverEndOfFill && !pend.immediateRecoverTPlus1) {
                pend.recoveredOriginal = false;
                pend.recoveredQuality = false;
                pend.yearsToRecoverOriginal = null;
                pend.yearsToRecoverQuality = null;
              }
              if (pend.immediateRecoverTPlus1 && !pend.recoveredOriginal) {
                pend.recoveredOriginal = true;
                pend.recoveredQuality = true;
                pend.yearsToRecoverOriginal = yearsBetween(
                  pend.departYear,
                  pend.departPeriod,
                  G.year,
                  G.period,
                );
                pend.yearsToRecoverQuality = pend.yearsToRecoverOriginal;
              }
              pendingTPlus1.delete(st.id);
            }
          }
          beforeTalents.set(st.id, snapStationTalents(st));
        });

        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;

        const idx = periodIndex(G.year, G.period);

        commercialStations(G).forEach((st) => {
          const before = beforeSnap.get(st.id);
          const after = snapMorning(st);
          if (!after) return;

          const stationTalents = beforeTalents.get(st.id) || new Map();

          if (before && before.talentId && isSuccessorSnap(before)) {
            const talentChanged = before.talentId !== after.talentId;
            if (talentChanged && !openDepartures.has(st.id)) {
              openSuccessorDeparture(st, before, after, idx, stationTalents, clusterIdx);
            } else if (talentChanged && openDepartures.has(st.id)) {
              finalizeOpen(openDepartures.get(st.id), idx, 'superseded');
              openSuccessorDeparture(st, before, after, idx, stationTalents, clusterIdx);
            }
          }

          tryFillOpenDeparture(st, before, after, idx, stationTalents, clusterIdx);

          const openEv = openDepartures.get(st.id);
          if (openEv && !openEv.filled && !after.talentId) {
            trackVacancySlotQ(openEv, after.slotQ);
          }

          if (openEv && openEv.filled && !openEv._finalized) {
            updateRecovery(openEv, after, idx);
          }
        });
      }

      while (G.year < endYear) {
        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;
        const idx = periodIndex(G.year, G.period);
        commercialStations(G).forEach((st) => {
          const after = snapMorning(st);
          if (!after) return;
          const openEv = openDepartures.get(st.id);
          if (openEv && !openEv.filled && !after.talentId) trackVacancySlotQ(openEv, after.slotQ);
          if (openEv && openEv.filled && !openEv._finalized) updateRecovery(openEv, after, idx);
        });
      }

      const finalIdx = periodIndex(G.year, G.period);
      openDepartures.forEach((ev) => finalizeOpen(ev, finalIdx, 'vacancy_still_open'));

      return {
        ok: true,
        marketId,
        startYear,
        seed,
        eventCount: events.length,
        events,
      };
    } catch (err) {
      return {
        ok: false,
        marketId,
        startYear,
        seed,
        error: String(err && err.message ? err.message : err),
        eventCount: 0,
        events: [],
      };
    } finally {
      Math.random = origRand;
    }
  }

  globalThis.__wlRunSuccessorRecoveryTiming = function runBatch(config) {
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
            runTimingAuditSim({ marketId, startYear, seed, endYear: config.endYear }),
          );
        }
      }
    }
    return results;
  };
})();
