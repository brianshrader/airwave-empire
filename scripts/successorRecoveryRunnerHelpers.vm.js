/**
 * Shared VM helpers for successor recovery / ceiling diagnostics.
 * Attaches: globalThis.__wlSuccessorRecoveryHelpers
 */
(function () {
  'use strict';

  const CEILING_TOLERANCE = 1;
  const DAYPARTS = ['morningDrive', 'afternoonDrive', 'midday', 'evening', 'overnight'];

  function periodIndex(y, p) {
    return (y | 0) * 2 + ((p | 0) === 2 ? 1 : 0);
  }

  function yearsBetween(fromY, fromP, toY, toP) {
    return (periodIndex(toY, toP) - periodIndex(fromY, fromP)) / 2;
  }

  function priorBucket(q) {
    const n = q | 0;
    if (n < 90) return '85-89';
    if (n < 94) return '90-93';
    return '94+';
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

  function snapMorningFull(st) {
    const sd = st.prog?.morningDrive;
    if (!sd) return null;
    const mc = st.morningSuccessorCeiling || null;
    return {
      talentId: sd.talent?.id != null ? String(sd.talent.id) : null,
      talentName: sd.talent?.name || '',
      talentQ: sd.talent ? sd.talent.quality | 0 : null,
      talentSuperstar: sd.talent?.superstar === true,
      slotQ: Math.round(sd.quality || 0),
      tenurePeriods: sd.talent ? sd.talent.periodsAtStation | 0 : 0,
      rev: Math.round(st.fin?.rev || 0),
      share: st.rat?.share || 0,
      hasCeiling: !!mc,
      ceiling: mc ? Math.round(mc.ceiling || 0) : null,
      ceilingPriorSlotQ: mc ? mc.priorSlotQ | 0 : null,
      replacementType: mc ? mc.replacementType || null : null,
      pendingPriorSlotQ: st._morningSuccessorPending?.priorSlotQ | 0,
    };
  }

  function computeIntegrityFlags(ev, tolerance) {
    tolerance = tolerance != null ? tolerance : CEILING_TOLERANCE;
    const flags = [];
    const prior = ev.originalPriorSlotQ | 0;
    const repl = ev.replacementSlotQAtFill | 0;
    const ceiling = ev.ceilingAtFill;

    if (ev.filled && ev.replacementType !== 'vacant') {
      if (!ev.hasCeilingAfterFill) flags.push('no_ceiling_after_fill');
      if (ceiling != null && repl > ceiling + tolerance) flags.push('repl_above_ceiling');
      if (
        ceiling != null &&
        prior > ceiling + tolerance &&
        repl >= prior &&
        (ev.immediateRecoverEndOfFill || ev.immediateRecoverOriginal)
      ) {
        flags.push('immediate_while_capped');
      }
    }
    return flags;
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

  function snapStationTalents(st) {
    const map = new Map();
    for (const sl of DAYPARTS) {
      const sd = st.prog?.[sl];
      if (!sd?.talent || sd.talent.id == null) continue;
      map.set(String(sd.talent.id), { slot: sl });
    }
    return map;
  }

  function buildClusterIdx(G, commercialStations) {
    const byOwner = new Map();
    for (const st of commercialStations(G)) {
      const owner = st.corpOwner ? String(st.corpOwner) : null;
      if (!owner) continue;
      if (!byOwner.has(owner)) byOwner.set(owner, new Map());
      for (const sl of DAYPARTS) {
        const sd = st.prog?.[sl];
        if (!sd?.talent || sd.talent.id == null) continue;
        byOwner.get(owner).set(String(sd.talent.id), { stationId: st.id, slot: sl });
      }
    }
    return byOwner;
  }

  /**
   * Tracks successor departures → fills with t+1 post-clamp recovery measurement.
   */
  function createSuccessorDepartureTracker(opts) {
    const openDepartures = new Map();
    const pendingTPlus1 = new Map();
    const events = [];
    let eventSeq = 0;

    function finalizeOpen(ev, idx, reason) {
      if (ev._finalized) return;
      ev._finalized = true;
      ev.finalStatus = reason || ev.fillTiming || 'vacancy_still_open';
      ev.fillTiming = ev.fillTiming || 'vacancy_still_open';
      ev.observationPeriods = idx - ev.departPeriodIdx;
      events.push(ev);
    }

    function updateRecovery(ev, cur, idx) {
      const origTarget = ev.originalPriorSlotQ | 0;
      if (!ev.recoveredQuality && cur.slotQ >= origTarget) {
        ev.recoveredQuality = true;
        ev.recoveredOriginal = true;
        ev.yearsToRecoverQuality = yearsBetween(
          ev.departYear,
          ev.departPeriod,
          G.year,
          G.period,
        );
        ev.yearsToRecoverOriginal = ev.yearsToRecoverQuality;
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
      if (idx - ev.departPeriodIdx >= 40) finalizeOpen(ev, idx, 'observation_complete');
    }

    function attachFillMeta(ev, after, repType, extra) {
      ev.filled = true;
      ev.replacementType = repType;
      ev.replacementSlotQAtFill = after.slotQ | 0;
      ev.replacementSlotQ = after.slotQ | 0;
      ev.replacementTalentQ = after.talentQ;
      ev.hasCeilingAfterFill = after.hasCeiling;
      ev.hasCeilingAtFill = after.hasCeiling;
      ev.ceilingAtFill = after.ceiling;
      ev.ceilingPriorSlotQAtFill = after.ceilingPriorSlotQ || ev.originalPriorSlotQ;
      ev.immediateRecoverEndOfFill = (after.slotQ | 0) >= (ev.originalPriorSlotQ | 0);
      ev.immediateRecoverOriginal = ev.immediateRecoverEndOfFill;
      Object.assign(ev, extra || {});
      ev.integrityFlags = computeIntegrityFlags(ev);
      ev.integrityFlagged = ev.integrityFlags.length > 0;
      if (ev.immediateRecoverEndOfFill) {
        ev.recoveredQuality = true;
        ev.recoveredOriginal = true;
        ev.yearsToRecoverQuality = yearsBetween(
          ev.departYear,
          ev.departPeriod,
          G.year,
          G.period,
        );
        ev.yearsToRecoverOriginal = ev.yearsToRecoverQuality;
      }
    }

    function onSuccessorDeparture(st, before, after, idx, repType, extra) {
      if (!isSuccessorSnap(before)) return null;
      if (openDepartures.has(st.id)) {
        finalizeOpen(openDepartures.get(st.id), idx, 'superseded_by_new_departure');
      }

      eventSeq += 1;
      const originalPriorSlotQ = before.slotQ | 0;
      const ev = {
        eventId: `${opts.marketId}:${opts.startYear}:${opts.seed}:${eventSeq}`,
        marketId: opts.marketId,
        stationId: st.id,
        call: st.callLetters || '',
        isSuccessorDeparture: true,
        departYear: G.year,
        departPeriod: G.period,
        departPeriodIdx: idx,
        originalPriorSlotQ,
        departingSlotQ: originalPriorSlotQ,
        departingTalentQ: before.talentQ,
        departingTenure: before.tenurePeriods || 0,
        preDepartureRev: before.rev,
        preDepartureShare: before.share,
        priorSlotQLoweredDuringVacancy: false,
        vacancyPeriods: 0,
        minVacancySlotQ: null,
        filled: false,
        fillTiming: null,
        fillPeriodIdx: null,
        periodsVacantBeforeFill: null,
        replacementType: null,
        replacementSlotQAtFill: null,
        replacementSlotQ: null,
        hasCeilingAfterFill: null,
        ceilingAtFill: null,
        recoveredQuality: false,
        recoveredOriginal: false,
        recoveredRevenue: false,
        yearsToRecoverQuality: null,
        yearsToRecoverOriginal: null,
        immediateRecoverEndOfFill: false,
        immediateRecoverOriginal: false,
        immediateRecoverTPlus1: false,
        integrityFlags: [],
        integrityFlagged: false,
        _finalized: false,
        _awaitingTPlus1: false,
        ...(extra || {}),
      };

      const sameTurnFill = after && after.talentId && after.talentId !== before.talentId;
      if (sameTurnFill) {
        ev.fillTiming = 'same_turn_fill';
        ev.fillPeriodIdx = idx;
        ev.periodsVacantBeforeFill = 0;
        attachFillMeta(ev, after, repType || 'external', {});
        ev._awaitingTPlus1 = true;
        pendingTPlus1.set(st.id, ev);
        if (!ev.recoveredQuality) openDepartures.set(st.id, ev);
        else {
          ev._finalized = true;
          ev.finalStatus = 'same_turn_fill';
          events.push(ev);
        }
      } else {
        ev.fillTiming = 'vacancy_opened';
        if (after && !after.talentId) {
          ev.minVacancySlotQ = after.slotQ | 0;
          if ((after.slotQ | 0) < originalPriorSlotQ) ev.priorSlotQLoweredDuringVacancy = true;
        }
        openDepartures.set(st.id, ev);
      }
      return ev;
    }

    function onDelayedFill(st, before, after, idx, repType, extra) {
      const ev = openDepartures.get(st.id);
      if (!ev || ev.filled || ev._finalized) return null;
      if (!before || before.talentId) return null;
      if (!after || !after.talentId) return null;

      ev.fillTiming = 'delayed_fill';
      ev.fillPeriodIdx = idx;
      ev.periodsVacantBeforeFill = idx - ev.departPeriodIdx;
      ev.vacancySlotQAtFill = before.slotQ | 0;
      if ((before.slotQ | 0) < (ev.originalPriorSlotQ | 0)) ev.priorSlotQLoweredDuringVacancy = true;
      attachFillMeta(ev, after, repType || 'external', extra || {});
      ev._awaitingTPlus1 = true;
      pendingTPlus1.set(st.id, ev);
      return ev;
    }

    function trackVacancy(st, slotQ) {
      const ev = openDepartures.get(st.id);
      if (!ev || ev.filled || ev._finalized) return;
      const q = slotQ | 0;
      ev.vacancyPeriods = (ev.vacancyPeriods | 0) + 1;
      if (ev.minVacancySlotQ == null || q < ev.minVacancySlotQ) ev.minVacancySlotQ = q;
      if (q < (ev.originalPriorSlotQ | 0)) ev.priorSlotQLoweredDuringVacancy = true;
    }

    function processTurnStart(st, after) {
      const ev = pendingTPlus1.get(st.id);
      if (!ev || !ev._awaitingTPlus1) return;
      ev._awaitingTPlus1 = false;
      pendingTPlus1.delete(st.id);
      ev.slotQAtTPlus1 = after.slotQ | 0;
      ev.ceilingAtTPlus1 = after.ceiling;
      ev.hasCeilingAtTPlus1 = after.hasCeiling;
      ev.immediateRecoverTPlus1 = (after.slotQ | 0) >= (ev.originalPriorSlotQ | 0);
      if (ev.immediateRecoverEndOfFill && !ev.immediateRecoverTPlus1) {
        ev.recoveredQuality = false;
        ev.recoveredOriginal = false;
        ev.yearsToRecoverQuality = null;
        ev.yearsToRecoverOriginal = null;
      }
      if (ev.immediateRecoverTPlus1 && !ev.recoveredQuality) {
        ev.recoveredQuality = true;
        ev.recoveredOriginal = true;
        ev.yearsToRecoverQuality = yearsBetween(
          ev.departYear,
          ev.departPeriod,
          G.year,
          G.period,
        );
        ev.yearsToRecoverOriginal = ev.yearsToRecoverQuality;
      }
      ev.integrityFlags = computeIntegrityFlags(ev);
      ev.integrityFlagged = ev.integrityFlags.length > 0;
    }

    function processTurnEnd(st, after, idx) {
      const openEv = openDepartures.get(st.id);
      if (openEv && openEv.filled && !openEv._finalized) updateRecovery(openEv, after, idx);
      if (openEv && !openEv.filled && !after.talentId) trackVacancy(st, after.slotQ);
    }

    function finalizeAll(idx) {
      openDepartures.forEach((ev) => {
        if (!ev._finalized) finalizeOpen(ev, idx, 'vacancy_still_open');
      });
      pendingTPlus1.forEach((ev) => {
        if (ev._awaitingTPlus1) {
          ev._awaitingTPlus1 = false;
          ev.immediateRecoverTPlus1 = false;
        }
      });
      pendingTPlus1.clear();
    }

    return {
      openDepartures,
      pendingTPlus1,
      events,
      onSuccessorDeparture,
      onDelayedFill,
      processTurnStart,
      processTurnEnd,
      finalizeAll,
      classifyReplacement,
      snapStationTalents,
      buildClusterIdx,
    };
  }

  globalThis.__wlSuccessorRecoveryHelpers = {
    CEILING_TOLERANCE,
    periodIndex,
    yearsBetween,
    priorBucket,
    isSuccessorSnap,
    snapMorningFull,
    computeIntegrityFlags,
    classifyReplacement,
    snapStationTalents,
    buildClusterIdx,
    createSuccessorDepartureTracker,
  };
})();
