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
  };

  function activeCfg() {
    const v =
      typeof G !== 'undefined' && G && G._wlMorningRecoveryVariant
        ? String(G._wlMorningRecoveryVariant)
        : 'A';
    return VARIANTS[v] || VARIANTS.A;
  }

  /** Broad major — used for measurement cohorts (consistent across variants). */
  function isMajorMorningLoss(slotQ, tenurePeriods) {
    return (slotQ | 0) >= 85 || (tenurePeriods | 0) >= 10;
  }

  /** Whether this variant applies treatment on departure. */
  function variantTriggers(c, prev) {
    if (!c || c.id === 'A' || !prev) return false;
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

  globalThis.wlMorningRecoveryIsMajorDeparture = isMajorMorningLoss;
  globalThis.wlMorningRecoveryVariantWouldTrigger = function (prev) {
    return variantTriggers(activeCfg(), prev);
  };

  globalThis.wlMorningRecoveryApplyOnDeparture = function applyOnDeparture(st, prev, Gopt) {
    const c = activeCfg();
    if (c.id === 'A') return false;
    if (!variantTriggers(c, prev)) return false;

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
})();
