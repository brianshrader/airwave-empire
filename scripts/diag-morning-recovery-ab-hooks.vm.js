/**
 * Diagnostic-only morning recovery variant hooks (in-VM, not shipped).
 */
(function () {
  'use strict';

  const E_BASE = {
    shock: true,
    shockMin: 6,
    shockMax: 10,
    progDrag: 0.45,
    appealDrag: 0.12,
    hardReset: true,
    talentWeight: 0.85,
    oqCarry: 0.04,
    resetCap: 74,
    chemistryMult: 0.4,
    triggerMode: 'major',
  };

  const VARIANTS = {
    A: { id: 'A' },
    B: {
      id: 'B',
      shock: true,
      shockMin: 4,
      shockMax: 8,
      progDrag: 0.35,
      appealDrag: 0.08,
      triggerMode: 'major',
    },
    C: {
      id: 'C',
      hardReset: true,
      talentWeight: 0.72,
      oqCarry: 0.08,
      resetCap: 82,
      chemistryMult: 0.55,
      triggerMode: 'major',
    },
    D: {
      id: 'D',
      shock: true,
      shockMin: 4,
      shockMax: 8,
      progDrag: 0.3,
      appealDrag: 0.06,
      hardReset: true,
      talentWeight: 0.72,
      oqCarry: 0.08,
      resetCap: 82,
      chemistryMult: 0.55,
      triggerMode: 'major',
    },
    E: { id: 'E', ...E_BASE },
    F: {
      id: 'F',
      triggerMode: 'elite',
      shock: true,
      shockMin: 6,
      shockMax: 10,
      progDrag: 0.45,
      appealDrag: 0.1,
      hardReset: true,
      talentWeight: 0.9,
      oqCarry: 0.03,
      resetCap: 66,
      chemistryMult: 0.32,
    },
    G: {
      id: 'G',
      ...E_BASE,
      shockMin: 8,
      shockMax: 12,
      progDrag: 0.52,
      gradualDecay: true,
    },
    H: {
      id: 'H',
      ...E_BASE,
      revenueCoupling: true,
      revShockMin: 2,
      revShockMax: 6,
      shareDrag: 0.14,
      appealDrag: 0.14,
    },
    I: {
      id: 'I',
      triggerMode: 'elite',
      shock: true,
      shockMin: 8,
      shockMax: 12,
      progDrag: 0.48,
      appealDrag: 0.08,
      gradualDecay: true,
      hardReset: true,
      talentWeight: 0.9,
      oqCarry: 0.03,
      resetCap: 68,
      chemistryMult: 0.35,
      revenueCoupling: true,
      revShockMin: 2,
      revShockMax: 6,
      shareDrag: 0.1,
    },
    J: {
      id: 'J',
      triggerMode: 'successor',
      ceilingMode: 'simple',
      fixedCap: 88,
      fixedPeriods: 8,
      risePerPeriod: 1,
    },
    J0: {
      id: 'J0',
      triggerMode: 'successor',
      ceilingMode: 'simple',
      fixedCap: 88,
      fixedPeriods: 8,
      risePerPeriod: 1,
    },
    J1: {
      id: 'J1',
      triggerMode: 'successor',
      ceilingMode: 'simple',
      fixedCap: 88,
      fixedPeriods: 6,
      risePerPeriod: 1,
    },
    J2: {
      id: 'J2',
      triggerMode: 'successor',
      ceilingMode: 'simple',
      fixedCap: 90,
      fixedPeriods: 6,
      risePerPeriod: 1,
    },
    J3: {
      id: 'J3',
      triggerMode: 'successor',
      ceilingMode: 'simple',
      fixedCap: 88,
      fixedPeriods: 6,
      risePerPeriod: 1.5,
    },
    J4: {
      id: 'J4',
      triggerMode: 'successor',
      ceilingMode: 'simple',
      fixedCap: 90,
      fixedPeriods: 6,
      risePerPeriod: 1.5,
    },
    J5: {
      id: 'J5',
      triggerMode: 'successor',
      ceilingMode: 'simple',
      fixedCap: 88,
      fixedPeriods: 4,
      risePerPeriod: 1,
    },
    J6: {
      id: 'J6',
      triggerMode: 'successor',
      ceilingMode: 'simple',
      fixedCap: 90,
      fixedPeriods: 4,
      risePerPeriod: 1,
    },
    K: {
      id: 'K',
      triggerMode: 'successor',
      ceilingMode: 'dynamic',
    },
    L: {
      id: 'L',
      triggerMode: 'successor',
      ceilingMode: 'dynamic',
      ceilingRevDrag: true,
      revDragMin: 0.03,
      revDragMax: 0.08,
    },
  };

  function activeCfg() {
    const v =
      typeof G !== 'undefined' && G && G._wlMorningRecoveryVariant
        ? String(G._wlMorningRecoveryVariant)
        : 'A';
    return VARIANTS[v] || VARIANTS.A;
  }

  /** Broad major — measurement cohort (consistent across variants). */
  function isMajorMorningLoss(slotQ, tenurePeriods) {
    return (slotQ | 0) >= 85 || (tenurePeriods | 0) >= 10;
  }

  /** Successor ceiling trigger (narrower than broad major). */
  function successorCeilingTriggers(prev) {
    if (!prev) return false;
    const slotQ = prev.slotQ | 0;
    const tenure = prev.tenurePeriods | 0;
    if (slotQ >= 90) return true;
    if (slotQ >= 85 && tenure >= 12) return true;
    if (prev.talentSuperstar === true) return true;
    return false;
  }

  globalThis.wlMorningRecoverySuccessorCeilingTriggers = successorCeilingTriggers;

  function variantTriggers(c, prev) {
    if (!c || c.id === 'A' || !prev) return false;
    if (c.triggerMode === 'successor') return successorCeilingTriggers(prev);
    const slotQ = prev.slotQ | 0;
    const tenure = prev.tenurePeriods | 0;
    if (c.triggerMode === 'elite') {
      return slotQ >= 90 || (tenure >= 12 && slotQ >= 85);
    }
    return isMajorMorningLoss(slotQ, tenure);
  }

  function shockDuration(st, Gopt, c, salt) {
    const min = c.shockMin | 0;
    const max = c.shockMax | 0;
    const span = Math.max(1, max - min + 1);
    if (typeof wlHash32 === 'function') {
      return min + (wlHash32(`${st.id || ''}::${salt}::${Gopt.year}::${Gopt.period}`) % span);
    }
    return min + Math.floor(Math.random() * span);
  }

  function dragT(shock, peak, gradual) {
    const t = shock / Math.max(1, peak);
    if (!gradual) return 0.55 + 0.45 * t;
    const s = t * t * (3 - 2 * t);
    return 0.4 + 0.6 * s;
  }

  function progSpendHigh(st, Gopt) {
    const spend = st._wlLastProgSpend != null ? st._wlLastProgSpend : st.ops?.progBudget || 0;
    const cap =
      typeof progBudgetCapForPeriod === 'function' ? progBudgetCapForPeriod(Gopt) : 300000;
    return spend >= cap * 0.55;
  }

  function simpleCeilingParams(c) {
    return {
      fixedCap: c.fixedCap != null ? c.fixedCap : 88,
      fixedPeriods: c.fixedPeriods != null ? c.fixedPeriods : 8,
      risePerPeriod: c.risePerPeriod != null ? c.risePerPeriod : 1,
    };
  }

  function initSimpleCeiling(st, prev, Gopt, c) {
    const sd = st.prog && st.prog.morningDrive;
    if (!sd) return;
    const p = simpleCeilingParams(c || activeCfg());
    st._morningSuccessorCeiling = {
      mode: 'simple',
      ceiling: p.fixedCap,
      fixedCap: p.fixedCap,
      fixedPeriods: p.fixedPeriods,
      risePerPeriod: p.risePerPeriod,
      priorSlotQ: prev.slotQ | 0,
      priorShare: st.rat?.share || 0,
      priorRev: st.fin?.rev || 0,
      periodsActive: 0,
      replacementTenure: sd.talent ? sd.talent.periodsAtStation | 0 : 0,
    };
    sd.quality = Math.min(sd.quality | 0, p.fixedCap);
    if (typeof refreshStationOQ === 'function') refreshStationOQ(st, Gopt);
  }

  function initDynamicCeiling(st, prev, Gopt) {
    const sd = st.prog && st.prog.morningDrive;
    if (!sd) return;
    const replRaw = sd.talent ? sd.talent.quality | 0 : 28;
    const oldQ = prev.slotQ | 0;
    const initCap = Math.min(88, replRaw + 30, oldQ - 8);
    st._morningSuccessorCeiling = {
      mode: 'dynamic',
      ceiling: Math.max(42, Math.round(initCap)),
      priorSlotQ: oldQ,
      priorShare: st.rat?.share || 0,
      priorRev: st.fin?.rev || 0,
      periodsActive: 0,
      tenureUnlock: 8,
      maxUntilTenure: 95,
      replacementTenure: sd.talent ? sd.talent.periodsAtStation | 0 : 0,
    };
    sd.quality = Math.min(sd.quality | 0, st._morningSuccessorCeiling.ceiling);
    if (typeof refreshStationOQ === 'function') refreshStationOQ(st, Gopt);
  }

  function clearCeiling(st) {
    delete st._morningSuccessorCeiling;
  }

  function clampMorningToCeiling(st, Gopt) {
    const mc = st._morningSuccessorCeiling;
    if (!mc) return;
    const sd = st.prog && st.prog.morningDrive;
    if (!sd) return;
    const cap = Math.round(mc.ceiling);
    if ((sd.quality | 0) > cap) {
      sd.quality = cap;
      if (typeof refreshStationOQ === 'function') refreshStationOQ(st, Gopt);
    }
  }

  function stepSimpleCeiling(st, Gopt) {
    const mc = st._morningSuccessorCeiling;
    if (!mc || mc.mode !== 'simple') return;
    const sd = st.prog && st.prog.morningDrive;
    if (!sd) {
      clearCeiling(st);
      return;
    }
    mc.periodsActive = (mc.periodsActive | 0) + 1;
    mc.replacementTenure = sd.talent ? sd.talent.periodsAtStation | 0 : 0;
    const fixedCap = mc.fixedCap != null ? mc.fixedCap : 88;
    const fixedPeriods = mc.fixedPeriods != null ? mc.fixedPeriods : 8;
    const rise = mc.risePerPeriod != null ? mc.risePerPeriod : 1;
    if (mc.periodsActive <= fixedPeriods) {
      mc.ceiling = fixedCap;
    } else {
      mc.ceiling = Math.min(100, (mc.ceiling || fixedCap) + rise);
    }
    if (mc.ceiling >= 100 || (mc.ceiling >= mc.priorSlotQ && mc.replacementTenure >= 8)) {
      clearCeiling(st);
      return;
    }
    clampMorningToCeiling(st, Gopt);
  }

  function stepDynamicCeiling(st, Gopt) {
    const mc = st._morningSuccessorCeiling;
    if (!mc || mc.mode !== 'dynamic') return;
    const sd = st.prog && st.prog.morningDrive;
    if (!sd) {
      clearCeiling(st);
      return;
    }
    mc.periodsActive = (mc.periodsActive | 0) + 1;
    mc.replacementTenure = sd.talent ? sd.talent.periodsAtStation | 0 : 0;
    let rise = 0.5;
    const curShare = st.rat?.share || 0;
    const curRev = st.fin?.rev || 0;
    if (curShare > (mc.priorShare || 0) + 0.0015) rise += 0.5;
    if (progSpendHigh(st, Gopt)) rise += 0.5;
    if (curShare < (mc.priorShare || 0) - 0.002 || curRev < (mc.priorRev || 0) * 0.94) {
      rise = Math.max(0.15, rise - 0.35);
    }
    mc.ceiling = (mc.ceiling || 0) + rise;
    const maxAllowed =
      mc.replacementTenure >= (mc.tenureUnlock | 0) ? 100 : mc.maxUntilTenure || 95;
    mc.ceiling = Math.min(maxAllowed, mc.ceiling);
    if (
      mc.replacementTenure >= (mc.tenureUnlock | 0) &&
      mc.ceiling >= mc.priorSlotQ - 1
    ) {
      clearCeiling(st);
      return;
    }
    if (mc.ceiling >= 99 && mc.replacementTenure >= 6) {
      clearCeiling(st);
      return;
    }
    clampMorningToCeiling(st, Gopt);
  }

  globalThis.wlMorningRecoveryIsMajorDeparture = isMajorMorningLoss;
  globalThis.wlMorningRecoveryVariantWouldTrigger = function (prev) {
    return variantTriggers(activeCfg(), prev);
  };

  globalThis.wlMorningRecoveryApplyOnDeparture = function applyOnDeparture(st, prev, Gopt) {
    const c = activeCfg();
    if (c.id === 'A') return false;
    if (!variantTriggers(c, prev)) return false;

    if (c.ceilingMode === 'simple') {
      initSimpleCeiling(st, prev, Gopt, c);
      return true;
    }
    if (c.ceilingMode === 'dynamic') {
      initDynamicCeiling(st, prev, Gopt);
      return true;
    }

    if (c.shock) {
      const dur = shockDuration(st, Gopt, c, 'mrs');
      st._morningRecoveryShock = dur;
      st._morningRecoveryShockPeak = dur;
    }

    if (c.revenueCoupling) {
      const rdur = shockDuration(st, Gopt, c, 'mrsRev');
      st._morningRecoveryRevShock = rdur;
      st._morningRecoveryRevShockPeak = rdur;
    }

    if (c.hardReset) {
      const sd = st.prog && st.prog.morningDrive;
      if (sd) {
        const tq = sd.talent ? sd.talent.quality | 0 : 28;
        const blended = Math.round(tq * c.talentWeight + (st.oq || 45) * c.oqCarry);
        const cap = c.resetCap != null ? c.resetCap : 85;
        const target = Math.min(cap, blended);
        sd.quality = Math.max(10, Math.min(100, target));
        if (sd.chemistry && typeof sd.chemistry === 'object') {
          const cm = c.chemistryMult != null ? c.chemistryMult : 0.55;
          sd.chemistry.score = Math.max(0, Math.round((sd.chemistry.score || 50) * cm));
        }
        if (typeof refreshStationOQ === 'function') refreshStationOQ(st, Gopt);
      }
    }
    return true;
  };

  globalThis.wlMorningRecoveryShockDecayStep = function shockDecayStep(s) {
    if (s._morningRecoveryShock > 0) {
      s._morningRecoveryShock = Math.max(0, s._morningRecoveryShock - 1);
    }
    if (s._morningRecoveryRevShock > 0) {
      s._morningRecoveryRevShock = Math.max(0, s._morningRecoveryRevShock - 1);
    }
  };

  globalThis.wlMorningRecoverySuccessorCeilingStep = function ceilingStep(s, Gopt) {
    if (!s._morningSuccessorCeiling) return;
    const mode = s._morningSuccessorCeiling.mode;
    if (mode === 'simple') stepSimpleCeiling(s, Gopt);
    else if (mode === 'dynamic') stepDynamicCeiling(s, Gopt);
  };

  globalThis.wlMorningRecoveryMorningProgMult = function morningProgMult(s) {
    const shock = s._morningRecoveryShock;
    if (!shock || shock <= 0) return 1;
    const c = activeCfg();
    if (!c.progDrag) return 1;
    const peak = Math.max(1, s._morningRecoveryShockPeak || shock);
    const wt = dragT(shock, peak, !!c.gradualDecay);
    return 1 - c.progDrag * wt;
  };

  globalThis.wlMorningRecoveryAppealMult = function appealMult(s) {
    const shock = s._morningRecoveryShock;
    if (!shock || shock <= 0) return 1;
    const c = activeCfg();
    if (!c.appealDrag) return 1;
    const peak = Math.max(1, s._morningRecoveryShockPeak || shock);
    const wt = dragT(shock, peak, !!c.gradualDecay);
    const morningWeight =
      typeof SW !== 'undefined' && SW.morningDrive ? SW.morningDrive : 0.38;
    return 1 - c.appealDrag * morningWeight * wt;
  };

  globalThis.wlMorningRecoveryShareMult = function shareMult(s) {
    const revShock = s._morningRecoveryRevShock;
    if (!revShock || revShock <= 0) return 1;
    const c = activeCfg();
    if (!c.revenueCoupling || !c.shareDrag) return 1;
    const peak = Math.max(1, s._morningRecoveryRevShockPeak || revShock);
    const wt = dragT(revShock, peak, !!c.gradualDecay);
    return Math.max(0.84, 1 - c.shareDrag * wt);
  };

  globalThis.wlMorningRecoveryCalcRevMult = function calcRevMult(s) {
    const c = activeCfg();
    if (!c.ceilingRevDrag || !s._morningSuccessorCeiling) return 1;
    const mc = s._morningSuccessorCeiling;
    const sd = s.prog && s.prog.morningDrive;
    if (!sd) return 1;
    const slotQ = sd.quality | 0;
    const gap = (mc.priorSlotQ | 0) - slotQ;
    if (gap <= 8) return 1;
    const minD = c.revDragMin != null ? c.revDragMin : 0.03;
    const maxD = c.revDragMax != null ? c.revDragMax : 0.08;
    const t = Math.min(1, (mc.periodsActive | 0) / 14);
    const drag = maxD - (maxD - minD) * t;
    const gapFactor = Math.min(1, (gap - 8) / 18);
    return Math.max(0.91, 1 - drag * gapFactor);
  };
})();
