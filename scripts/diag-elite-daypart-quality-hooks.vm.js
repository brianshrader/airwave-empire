/**
 * Diagnostic-only hooks for elite daypart quality auditing.
 *
 * Loaded AFTER legacy.js inside a VM harness.
 * Records per-period slot-quality deltas with coarse attribution.
 */
(function () {
  'use strict';

  const PRIME_SLOTS = ['morningDrive', 'midday', 'afternoonDrive'];

  function diagOn(Gopt) {
    return !!(Gopt && Gopt._wlEliteDaypartDiag);
  }

  function ensureStore(Gopt) {
    if (!Gopt._wlEliteDaypartStore) {
      Gopt._wlEliteDaypartStore = {
        events: [],
        cum: {}, // cum[stationId][slot] = { net, progEst, focusEst, revealPerf, revealChem }
        crossed: {}, // key: stationId::slot::thr -> {y,p}
      };
    }
    return Gopt._wlEliteDaypartStore;
  }

  function pushEv(Gopt, ev) {
    if (!diagOn(Gopt)) return;
    const st = ensureStore(Gopt);
    st.events.push({
      y: Gopt.year,
      p: Gopt.period,
      turn: Gopt.turn | 0,
      marketId: Gopt.marketId || null,
      ...ev,
    });
  }

  function stationType(s) {
    if (!s) return 'unknown';
    if (s.isPlayer) return 'player';
    if (s.corpOwner) return 'ai_corp';
    return 'ai_indie';
  }

  function snapPrimeQualities(s) {
    const out = {};
    PRIME_SLOTS.forEach((sl) => {
      const q = s?.prog?.[sl]?.quality;
      out[sl] = typeof q === 'number' && !Number.isNaN(q) ? q : null;
    });
    return out;
  }

  // Wrap applyTalentPerformanceRevealDecayStep / applyCoHostChemistryRevealDecayStep if present.
  ['applyTalentPerformanceRevealDecayStep', 'applyCoHostChemistryRevealDecayStep'].forEach((fnName) => {
    if (typeof globalThis[fnName] !== 'function') return;
    const orig = globalThis[fnName];
    globalThis[fnName] = function wrapped(sd, ...rest) {
      const q0 = typeof sd?.quality === 'number' ? sd.quality : null;
      const ret = orig(sd, ...rest);
      const q1 = typeof sd?.quality === 'number' ? sd.quality : null;
      if (q0 != null && q1 != null && q1 !== q0 && typeof G !== 'undefined' && G) {
        const store = ensureStore(G);
        const sid = sd?._stationId || null;
        const sl = sd?._slotKey || null;
        if (sid && sl) {
          if (!store.cum[sid]) store.cum[sid] = {};
          if (!store.cum[sid][sl]) store.cum[sid][sl] = { net: 0, progEst: 0, focusEst: 0, revealPerf: 0, revealChem: 0 };
          store.cum[sid][sl].net += q1 - q0;
          if (fnName === 'applyTalentPerformanceRevealDecayStep') store.cum[sid][sl].revealPerf += q1 - q0;
          else store.cum[sid][sl].revealChem += q1 - q0;
        }
        pushEv(G, {
          type: 'slot_delta_component',
          component: fnName,
          stationId: sid,
          slot: sl,
          dq: q1 - q0,
        });
      }
      return ret;
    };
  });

  // Wrap decay() to record net deltas + computed programming/focus contributions.
  if (typeof decay === 'function') {
    const origDecay = decay;
    globalThis.decay = function decayWrapped(s, year, period) {
      const Gopt = typeof G !== 'undefined' ? G : null;
      if (!diagOn(Gopt) || !s || s._bpSlotDeferred) return origDecay(s, year, period);

      // annotate sd with station/slot for component wrappers above
      PRIME_SLOTS.forEach((sl) => {
        const sd = s?.prog?.[sl];
        if (sd && typeof sd === 'object') {
          sd._stationId = s.id;
          sd._slotKey = sl;
        }
      });

      const before = snapPrimeQualities(s);

      // Compute programming-budget boost estimate (mirrors legacy.js decay()).
      let prog = 0;
      let progCap = 0;
      let progBoostBySlot = {};
      try {
        progCap = typeof progBudgetCapForPeriod === 'function' ? progBudgetCapForPeriod(Gopt) : 0;
        const cappedProg = Math.min(s?.ops?.progBudget || 0, progCap || 0);
        const totalProgSpend = cappedProg + (s.progInvestment || 0);
        const _bsAust = typeof wlBudgetAusterityDisabled === 'function' && wlBudgetAusterityDisabled()
          ? 0
          : Math.max(0, Math.min(1, s.budgetStress || 0));
        const progRef = Math.max(10000, (progCap || 0) / 6);
        prog = totalProgSpend;
        if (totalProgSpend > 0 && progRef > 0) {
          const austerityProgEff = 1 - _bsAust * 0.38;
          const boost = (totalProgSpend / progRef) * 4 * austerityProgEff;
          progBoostBySlot = {
            morningDrive: boost * 1.4,
            midday: boost,
            afternoonDrive: boost * 1.1,
          };
          // bargain hire penalty applied per-slot (we log the pre-penalty value; runner can compare)
        }
      } catch (_e) {
        // ignore
      }

      // Compute focus-bump estimate (mirrors legacy.js decay()).
      let focus = null;
      let focusBump = 0;
      try {
        if (typeof ensureStationProgrammingFocus === 'function') ensureStationProgrammingFocus(s);
        const pf = typeof normalizeProgrammingFocus === 'function'
          ? normalizeProgrammingFocus(s.programmingFocus)
          : null;
        if (pf && pf !== 'balanced' && PRIME_SLOTS.includes(pf)) {
          focus = pf;
          if (typeof wlHash32 === 'function') {
            const bumpR = wlHash32(`${s.id || ''}::progFocusBump::${pf}::${year}::${period}`) % 31;
            focusBump = 0.2 + bumpR / 100;
          }
        }
      } catch (_e) {
        // ignore
      }

      const ret = origDecay(s, year, period);
      const after = snapPrimeQualities(s);

      PRIME_SLOTS.forEach((sl) => {
        const b = before[sl];
        const a = after[sl];
        if (b == null || a == null) return;
        const dq = a - b;
        const progEst = progBoostBySlot[sl] || 0;
        const focusEst = focus === sl ? focusBump : 0;

        // Update cumulative attribution buckets.
        const store = ensureStore(Gopt);
        if (!store.cum[s.id]) store.cum[s.id] = {};
        if (!store.cum[s.id][sl]) store.cum[s.id][sl] = { net: 0, progEst: 0, focusEst: 0, revealPerf: 0, revealChem: 0 };
        store.cum[s.id][sl].net += dq;
        store.cum[s.id][sl].progEst += progEst;
        store.cum[s.id][sl].focusEst += focusEst;

        pushEv(Gopt, {
          type: 'slot_delta',
          stationId: s.id,
          callLetters: s.callLetters || '',
          stationType: stationType(s),
          slot: sl,
          q0: b,
          q1: a,
          dq,
          progSpend: prog,
          progCap,
          progBoostEst: progEst,
          focus: focus || 'balanced',
          focusBumpEst: focusEst,
        });
      });

      // Threshold crossings
      const store = ensureStore(Gopt);
      const THRS = [80, 90, 95, 98];
      PRIME_SLOTS.forEach((sl) => {
        const b = before[sl];
        const a = after[sl];
        if (b == null || a == null) return;
        THRS.forEach((thr) => {
          if (b < thr && a >= thr) {
            const k = `${s.id}::${sl}::${thr}`;
            if (!store.crossed[k]) {
              store.crossed[k] = { y: Gopt.year, p: Gopt.period, turn: Gopt.turn | 0 };
              const cum = store.cum?.[s.id]?.[sl] || { net: 0, progEst: 0, focusEst: 0, revealPerf: 0, revealChem: 0 };
              pushEv(Gopt, {
                type: 'cross',
                stationId: s.id,
                stationType: stationType(s),
                slot: sl,
                thr,
                q1: a,
                cumNet: cum.net,
                cumProgEst: cum.progEst,
                cumFocusEst: cum.focusEst,
                cumRevealPerf: cum.revealPerf,
                cumRevealChem: cum.revealChem,
                cumOther: cum.net - (cum.progEst + cum.focusEst + cum.revealPerf + cum.revealChem),
              });
            }
          }
        });
      });

      return ret;
    };
  }

  globalThis.__wlEliteDaypartHooksInstalled = true;
})();

