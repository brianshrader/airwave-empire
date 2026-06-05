/**
 * Morning successor ceiling + internal-promotion trust transfer.
 * Loaded before legacy.js; uses global game symbols (G, SL, DAYPART_SLOTS, …).
 */
(function (global) {
  'use strict';

  const FIXED_CAP = 88;
  const FIXED_PERIODS = 6;
  const RISE_PER_PERIOD = 1;
  const TRUST_TRANSFER_PCT = 0.25;
  const BENCH_SLOTS = ['afternoonDrive', 'midday', 'evening', 'overnight'];

  function periodIdx(Gopt) {
    const gy = Gopt?.year | 0;
    const gp = Gopt?.period | 0;
    return gy * 2 + (gp === 2 ? 1 : 0);
  }

  function logCeilingCoverage(st, type, detail, Gopt) {
    const g = Gopt || (typeof G !== 'undefined' ? G : null);
    if (!g?._wlCeilingCoverageDiag || !st?.id) return;
    if (!g._wlCeilingHookLog) g._wlCeilingHookLog = [];
    g._wlCeilingHookLog.push({
      type,
      stationId: st.id,
      year: g.year,
      period: g.period,
      periodIdx: periodIdx(g),
      path: g._wlCeilingFillPath || null,
      ...(detail || {}),
    });
  }

  function snapSlot(sd) {
    if (!sd?.talent) return null;
    return {
      slotQ: Math.round(sd.quality || 0),
      tenure: sd.talent.periodsAtStation | 0,
      superstar: sd.talent.superstar === true,
    };
  }

  function successorTriggersFromSlot(st, sd, Gopt) {
    if (!sd?.talent) return false;
    const slotQ = Math.round(sd.quality || 0);
    const tenure = sd.talent.periodsAtStation | 0;
    if (slotQ >= 90) return true;
    if (slotQ >= 85 && tenure >= 12) return true;
    if (sd.talent.superstar === true) return true;
    return false;
  }

  function noteDeparture(st, Gopt) {
    const sd = st?.prog?.morningDrive;
    if (!sd?.talent) return;
    if (!successorTriggersFromSlot(st, sd, Gopt)) return;
    const priorSlotQ = Math.round(sd.quality || 0);
    st._morningSuccessorPending = {
      priorSlotQ,
      priorTalentId: sd.talent.id != null ? String(sd.talent.id) : null,
      priorShare: st.rat?.share || 0,
      priorRev: st.fin?.rev || 0,
    };
    st._morningSuccessorDepartPriorQ = priorSlotQ;
    logCeilingCoverage(st, 'noteClear', { priorSlotQ, triggered: true }, Gopt);
  }

  function resolveReplacementType(st, Gopt, opts) {
    if (opts?.replacementType) return opts.replacementType;
    if (opts?.priorSlot && opts.priorSlot !== 'morningDrive') return 'internal';
    if (opts?.fromStationId && opts.fromStationId !== st.id) {
      const corp = st.corpOwner ? String(st.corpOwner) : null;
      const fromCorp = opts.fromCorpOwner != null ? String(opts.fromCorpOwner) : null;
      if (corp && fromCorp && corp === fromCorp) return 'cluster';
      return 'external';
    }
    return 'unknown';
  }

  function applyTrustTransfer(sd, priorSlotQ) {
    const replQ = sd.quality | 0;
    const departQ = priorSlotQ | 0;
    if (departQ <= replQ) return;
    sd.quality = Math.min(100, Math.round(replQ + TRUST_TRANSFER_PCT * (departQ - replQ)));
  }

  function clearCeiling(st, Gopt, reason) {
    const mc = st?.morningSuccessorCeiling;
    if (mc) {
      logCeilingCoverage(
        st,
        'ceilingCleared',
        { reason: reason || 'unknown', priorSlotQ: mc.priorSlotQ | 0, ceiling: mc.ceiling | 0 },
        Gopt,
      );
    }
    delete st.morningSuccessorCeiling;
  }

  function initCeiling(st, Gopt, meta) {
    const pending = st._morningSuccessorPending;
    const sd = st?.prog?.morningDrive;
    if (!pending || !sd?.talent) {
      logCeilingCoverage(
        st,
        'ceilingSkipped',
        {
          reason: !pending ? 'no_pending' : 'no_talent',
          hadDepartPriorQ: st?._morningSuccessorDepartPriorQ != null,
        },
        Gopt,
      );
      return;
    }
    const priorSlotQ = pending.priorSlotQ | 0;
    const replacementType = resolveReplacementType(st, Gopt, meta);

    if (replacementType === 'internal') {
      applyTrustTransfer(sd, priorSlotQ);
    }

    st.morningSuccessorCeiling = {
      priorSlotQ,
      fixedCap: FIXED_CAP,
      fixedPeriods: FIXED_PERIODS,
      risePerPeriod: RISE_PER_PERIOD,
      periodsActive: 0,
      ceiling: FIXED_CAP,
      replacementTalentId: sd.talent.id != null ? String(sd.talent.id) : null,
      replacementType,
    };
    sd.quality = Math.min(sd.quality | 0, FIXED_CAP);
    if (typeof refreshStationOQ === 'function') refreshStationOQ(st, Gopt);
    logCeilingCoverage(
      st,
      'ceilingApplied',
      {
        priorSlotQ,
        ceiling: FIXED_CAP,
        replacementType,
        slotQAfter: sd.quality | 0,
        via: meta?.via || 'onMorningAssign',
      },
      Gopt,
    );
    delete st._morningSuccessorPending;
    delete st._morningSuccessorDepartPriorQ;
  }

  function onMorningAssign(st, Gopt, opts) {
    const meta = { ...(opts || {}), via: opts?.via || 'onMorningAssign' };
    const hadPending = !!st?._morningSuccessorPending;
    const hadDepartPriorQ = st?._morningSuccessorDepartPriorQ != null;
    if (!st?._morningSuccessorPending && st?._morningSuccessorDepartPriorQ) {
      st._morningSuccessorPending = {
        priorSlotQ: st._morningSuccessorDepartPriorQ | 0,
        priorTalentId: null,
        priorShare: st.rat?.share || 0,
        priorRev: st.fin?.rev || 0,
      };
      logCeilingCoverage(st, 'pendingRestored', { priorSlotQ: st._morningSuccessorDepartPriorQ | 0 }, Gopt);
    }
    if (!st?._morningSuccessorPending) {
      logCeilingCoverage(
        st,
        'onAssignSkipped',
        { reason: 'no_pending', hadDepartPriorQ },
        Gopt,
      );
      return;
    }
    initCeiling(st, Gopt, meta);
  }

  function clampMorning(st, Gopt) {
    const mc = st.morningSuccessorCeiling;
    if (!mc) return;
    const sd = st?.prog?.morningDrive;
    if (!sd) {
      clearCeiling(st, Gopt, 'no_slot');
      return;
    }
    const cap = Math.round(mc.ceiling);
    if ((sd.quality | 0) > cap) {
      sd.quality = cap;
      if (typeof refreshStationOQ === 'function') refreshStationOQ(st, Gopt);
    }
  }

  function stepCeiling(st, Gopt) {
    const mc = st.morningSuccessorCeiling;
    if (!mc) return;
    const sd = st?.prog?.morningDrive;
    if (!sd?.talent) {
      clearCeiling(st, Gopt, 'no_talent');
      return;
    }
    mc.periodsActive = (mc.periodsActive | 0) + 1;
    const tenure = sd.talent.periodsAtStation | 0;
    if (mc.periodsActive <= (mc.fixedPeriods | 0)) {
      mc.ceiling = mc.fixedCap != null ? mc.fixedCap : FIXED_CAP;
    } else {
      mc.ceiling = Math.min(100, (mc.ceiling | 0) + (mc.risePerPeriod || RISE_PER_PERIOD));
    }
    if (mc.ceiling >= 100 || (mc.ceiling >= (mc.priorSlotQ | 0) && tenure >= 8)) {
      clearCeiling(st, Gopt, 'tenure_met_prior_reached');
      return;
    }
    clampMorning(st, Gopt);
  }

  function benchPromotionCandidates(s, Gopt) {
    const out = [];
    for (const sl of BENCH_SLOTS) {
      if (
        typeof franchiseSlotBlocksNewLocalTalent === 'function' &&
        franchiseSlotBlocksNewLocalTalent(s, sl, Gopt)
      ) {
        continue;
      }
      if (
        typeof getStationFranchise === 'function' &&
        getStationFranchise(s, sl, Gopt) &&
        !s.prog?.[sl]?.talent
      ) {
        continue;
      }
      const sd = s.prog?.[sl];
      if (!sd?.talent) continue;
      const slotQ = Math.round(sd.quality || 0);
      const tenure = sd.talent.periodsAtStation | 0;
      const talentQ = sd.talent.quality | 0;
      if (slotQ < 65 && talentQ < 60) continue;
      if (slotQ < 72 && tenure < 4) continue;
      out.push({
        slot: sl,
        slotQ,
        tenure,
        talentQ,
        talent: sd.talent,
        score: slotQ * 0.68 + talentQ * 0.32 + Math.min(8, tenure * 0.4),
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  function tryAiInternalMorningPromotion(s, Gopt) {
    if (
      typeof franchiseSlotBlocksNewLocalTalent === 'function' &&
      franchiseSlotBlocksNewLocalTalent(s, 'morningDrive', Gopt)
    ) {
      return null;
    }
    const md = s.prog?.morningDrive;
    if (!md || md.talent) return null;
    const candidates = benchPromotionCandidates(s, Gopt);
    if (!candidates.length) return null;
    const best = candidates[0];
    let prob = 0.45;
    if (best.slotQ >= 80) prob += 0.15;
    if (best.tenure >= 8) prob += 0.1;
    prob = Math.min(0.7, prob);
    if (Math.random() > prob) return null;

    const src = s.prog[best.slot];
    if (!src?.talent) return null;
    const sourceQ = src.quality | 0;
    md.talent = src.talent;
    md.quality = Math.min(100, Math.max(md.quality | 0, Math.round(sourceQ * 0.9)));
    src.talent = null;
    src.quality = Math.max(12, Math.round(sourceQ * 0.58));
    if (typeof promoteSlotChairBtoAIfNeeded === 'function') {
      promoteSlotChairBtoAIfNeeded(src, best.slot);
    }
    if (typeof refreshStationOQ === 'function') refreshStationOQ(s, Gopt);
    logCeilingCoverage(
      s,
      'internalPromotionDirect',
      { priorSlot: best.slot, slotQAfter: md.quality | 0, replacementType: 'internal' },
      Gopt,
    );
    return { slot: best.slot, talent: md.talent, needsOnSlotFill: true };
  }

  global.wlMorningSuccessor = {
    noteDeparture,
    onMorningAssign,
    stepCeiling,
    clampMorning,
    tryAiInternalMorningPromotion,
    successorTriggersFromSlot,
    snapSlot,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
