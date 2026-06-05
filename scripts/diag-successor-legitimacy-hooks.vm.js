/**
 * Diagnostic-only successor ceiling + legitimacy hooks (in-VM, not shipped).
 */
(function () {
  'use strict';

  const J1_BASE = {
    triggerMode: 'successor',
    ceilingMode: 'simple',
    fixedCap: 88,
    fixedPeriods: 6,
    risePerPeriod: 1,
  };

  const VARIANTS = {
    J1: { id: 'J1', ...J1_BASE },
    P1: { id: 'P1', ...J1_BASE, legitimacyMode: 'trust' },
    P2: { id: 'P2', ...J1_BASE, legitimacyMode: 'ceilingTier' },
    P3: { id: 'P3', ...J1_BASE, legitimacyMode: 'trustAndCeiling' },
    P4: { id: 'P4', ...J1_BASE, legitimacyMode: 'bench' },
  };

  function activeCfg() {
    const v =
      typeof G !== 'undefined' && G && G._wlMorningRecoveryVariant
        ? String(G._wlMorningRecoveryVariant)
        : 'J1';
    return VARIANTS[v] || VARIANTS.J1;
  }

  function isMajorMorningLoss(slotQ, tenurePeriods) {
    return (slotQ | 0) >= 85 || (tenurePeriods | 0) >= 10;
  }

  function successorCeilingTriggers(prev) {
    if (!prev) return false;
    const slotQ = prev.slotQ | 0;
    const tenure = prev.tenurePeriods | 0;
    if (slotQ >= 90) return true;
    if (slotQ >= 85 && tenure >= 12) return true;
    if (prev.talentSuperstar === true) return true;
    return false;
  }

  globalThis.wlMorningRecoveryIsMajorDeparture = isMajorMorningLoss;
  globalThis.wlMorningRecoverySuccessorCeilingTriggers = successorCeilingTriggers;

  function variantTriggers(c, prev) {
    if (!c || !prev) return false;
    if (c.triggerMode === 'successor') return successorCeilingTriggers(prev);
    return isMajorMorningLoss(prev.slotQ, prev.tenurePeriods || 0);
  }

  function fixedCapForType(type, benchStrength) {
    if (type === 'internal') return 92;
    if (type === 'cluster') return 90;
    return 88;
  }

  function benchFixedCap(type, strength) {
    const base = 88;
    if (type === 'internal') return Math.min(92, base + Math.round(4 * strength));
    if (type === 'cluster') return Math.min(90, base + Math.round(2 * strength));
    return base;
  }

  function trustPctForType(type, strength, mode) {
    if (type === 'internal') {
      if (mode === 'bench') return 0.25 * strength;
      return 0.25;
    }
    if (type === 'cluster' && mode === 'bench') return 0.12 * strength;
    return 0;
  }

  function applyLegitimacy(st, prev, Gopt, c, meta) {
    const sd = st.prog && st.prog.morningDrive;
    if (!sd || !meta) return;
    const type = meta.replacementType || 'external';
    const departQ = prev.slotQ | 0;
    const replQ = sd.quality | 0;
    const strength = meta.benchStrength != null ? meta.benchStrength : 0;
    const mode = c.legitimacyMode;

    if (mode === 'trust' || mode === 'trustAndCeiling') {
      if (type === 'internal') {
        const pct = trustPctForType(type, strength, 'trust');
        sd.quality = Math.min(100, Math.round(replQ + pct * (departQ - replQ)));
      }
    } else if (mode === 'bench') {
      const pct = trustPctForType(type, strength, 'bench');
      if (pct > 0) {
        sd.quality = Math.min(100, Math.round(replQ + pct * (departQ - replQ)));
      }
    }

    if (typeof refreshStationOQ === 'function') refreshStationOQ(st, Gopt);
    return type;
  }

  function resolveFixedCap(c, meta) {
    const type = meta?.replacementType || 'external';
    const strength = meta?.benchStrength != null ? meta.benchStrength : 0;
    if (c.legitimacyMode === 'ceilingTier' || c.legitimacyMode === 'trustAndCeiling') {
      return fixedCapForType(type, strength);
    }
    if (c.legitimacyMode === 'bench') {
      return benchFixedCap(type, strength);
    }
    return c.fixedCap != null ? c.fixedCap : 88;
  }

  function initSimpleCeiling(st, prev, Gopt, c, meta) {
    const sd = st.prog && st.prog.morningDrive;
    if (!sd) return;
    const fixedCap = resolveFixedCap(c, meta);
    const fixedPeriods = c.fixedPeriods != null ? c.fixedPeriods : 6;
    const risePerPeriod = c.risePerPeriod != null ? c.risePerPeriod : 1;
    st._morningSuccessorCeiling = {
      mode: 'simple',
      ceiling: fixedCap,
      fixedCap,
      fixedPeriods,
      risePerPeriod,
      priorSlotQ: prev.slotQ | 0,
      priorShare: st.rat?.share || 0,
      priorRev: st.fin?.rev || 0,
      periodsActive: 0,
      replacementTenure: sd.talent ? sd.talent.periodsAtStation | 0 : 0,
      replacementType: meta?.replacementType || 'external',
    };
    sd.quality = Math.min(sd.quality | 0, fixedCap);
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
    const fixedPeriods = mc.fixedPeriods != null ? mc.fixedPeriods : 6;
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

  globalThis.wlMorningRecoveryApplyOnDeparture = function applyOnDeparture(st, prev, Gopt, meta) {
    const c = activeCfg();
    if (!variantTriggers(c, prev)) return false;
    const legMeta = meta || st._wlSuccessorLegitimacyMeta || null;
    if (c.legitimacyMode) applyLegitimacy(st, prev, Gopt, c, legMeta);
    if (c.ceilingMode === 'simple') {
      initSimpleCeiling(st, prev, Gopt, c, legMeta);
      return true;
    }
    return false;
  };

  globalThis.wlMorningRecoveryShockDecayStep = function shockDecayStep() {};

  globalThis.wlMorningRecoverySuccessorCeilingStep = function ceilingStep(s, Gopt) {
    if (!s._morningSuccessorCeiling) return;
    if (s._morningSuccessorCeiling.mode === 'simple') stepSimpleCeiling(s, Gopt);
  };

  globalThis.wlMorningRecoveryMorningProgMult = function () {
    return 1;
  };
  globalThis.wlMorningRecoveryAppealMult = function () {
    return 1;
  };
  globalThis.wlMorningRecoveryShareMult = function () {
    return 1;
  };
  globalThis.wlMorningRecoveryCalcRevMult = function () {
    return 1;
  };
})();
