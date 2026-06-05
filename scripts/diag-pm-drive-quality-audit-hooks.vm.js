/**
 * Diagnostic-only hooks for PM Drive quality inflation auditing.
 *
 * Loaded AFTER legacy.js in a VM harness.
 * Primary output is `G._wlPmDriveAudit.events` and `G._wlPmDriveAudit.crossings`.
 */
(function () {
  'use strict';

  const PRIME = ['morningDrive', 'midday', 'afternoonDrive'];
  const PM = 'afternoonDrive';
  const THRS = [90, 95, 98];

  function diagOn(Gopt) {
    return !!(Gopt && Gopt._wlPmDriveAuditOn);
  }

  function ensureAudit(Gopt) {
    if (!Gopt._wlPmDriveAudit) {
      Gopt._wlPmDriveAudit = {
        events: [],
        crossings: {}, // key stationId::slot::thr -> {y,p,source}
      };
    }
    return Gopt._wlPmDriveAudit;
  }

  function stType(s) {
    if (!s) return 'unknown';
    if (s.isPlayer) return 'player';
    if (s.corpOwner) return 'ai_corp';
    return 'ai_indie';
  }

  function slotQ(s, sl) {
    const v = s?.prog?.[sl]?.quality;
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  }

  function slotTalent(s, sl) {
    const sd = s?.prog?.[sl];
    const host = sd?.talent || null;
    const co = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
    return {
      hostName: host?.name || null,
      hostId: host?.id != null ? String(host.id) : null,
      hostQ: host?.quality != null ? Math.round(host.quality || 0) : null,
      hostTrueQ: typeof talentTrueQuality === 'function' && host ? Math.round(talentTrueQuality(host) || 0) : null,
      coName: co?.name || null,
      coId: co?.id != null ? String(co.id) : null,
      coQ: co?.quality != null ? Math.round(co.quality || 0) : null,
      coTrueQ: typeof talentTrueQuality === 'function' && co ? Math.round(talentTrueQuality(co) || 0) : null,
    };
  }

  function progBudgetInfo(Gopt, s) {
    let cap = 0;
    try {
      cap = typeof progBudgetCapForPeriod === 'function' ? progBudgetCapForPeriod(Gopt) : 0;
    } catch (_e) {
      cap = 0;
    }
    const b = Math.min(s?.ops?.progBudget || 0, cap || 0);
    const pct = cap > 0 ? b / cap : 0;
    return { progBudget: b, progCap: cap, progPctCap: pct };
  }

  function pushEv(Gopt, ev) {
    if (!diagOn(Gopt)) return;
    const a = ensureAudit(Gopt);
    a.events.push({
      y: Gopt.year,
      p: Gopt.period,
      turn: Gopt.turn | 0,
      marketId: Gopt.marketId || null,
      ...ev,
    });
  }

  // Simple tag stack to attribute changes when possible.
  globalThis.__wlPmDriveTagStack = globalThis.__wlPmDriveTagStack || [];
  function tagTop() {
    const st = globalThis.__wlPmDriveTagStack;
    return st.length ? st[st.length - 1] : 'unknown';
  }
  function withTag(tag, fn) {
    globalThis.__wlPmDriveTagStack.push(tag);
    try {
      return fn();
    } finally {
      globalThis.__wlPmDriveTagStack.pop();
    }
  }

  function recordSlotDelta(Gopt, s, sl, q0, q1, source, note, t0, t1) {
    if (q0 == null || q1 == null || q0 === q1) return;
    const dq = q1 - q0;
    const tinfo = t1 || slotTalent(s, sl);
    const binfo = progBudgetInfo(Gopt, s);

    const jumpedTo = (v) => {
      const r = Math.round(v);
      return r === 98 || r === 99 || r === 100;
    };

    pushEv(Gopt, {
      type: 'slot_delta',
      source,
      stationId: s.id,
      call: s.callLetters || '',
      stationType: stType(s),
      corpOwner: s.corpOwner || null,
      slot: sl,
      q0,
      q1,
      dq,
      q0r: Math.round(q0),
      q1r: Math.round(q1),
      jumpedExact98: Math.round(q1) === 98 && Math.round(q0) !== 98,
      jumpedExact99: Math.round(q1) === 99 && Math.round(q0) !== 99,
      jumpedExact100: Math.round(q1) === 100 && Math.round(q0) !== 100,
      jumpedIntoEliteBand: jumpedTo(q1) && !jumpedTo(q0),
      ...binfo,
      ...tinfo,
      beforeHostName: t0?.hostName || null,
      beforeHostId: t0?.hostId || null,
      beforeHostQ: t0?.hostQ ?? null,
      beforeHostTrueQ: t0?.hostTrueQ ?? null,
      beforeCoName: t0?.coName || null,
      beforeCoId: t0?.coId || null,
      beforeCoQ: t0?.coQ ?? null,
      beforeCoTrueQ: t0?.coTrueQ ?? null,
      note: note || null,
    });

    // Threshold crossings
    const a = ensureAudit(Gopt);
    THRS.forEach((thr) => {
      if (q0 < thr && q1 >= thr) {
        const k = `${s.id}::${sl}::${thr}`;
        if (!a.crossings[k]) {
          a.crossings[k] = { y: Gopt.year, p: Gopt.period, source };
          pushEv(Gopt, { type: 'cross', source, stationId: s.id, stationType: stType(s), slot: sl, thr, q1 });
        }
      }
    });
  }

  function snapPrime(s) {
    const out = {};
    PRIME.forEach((sl) => {
      out[sl] = slotQ(s, sl);
    });
    return out;
  }

  // Wrap decay(s): captures asymmetric decay rates + reveal steps inside.
  if (typeof decay === 'function') {
    const orig = decay;
    globalThis.decay = function decayWrapped(s, year, period) {
      const Gopt = typeof G !== 'undefined' ? G : null;
      if (!diagOn(Gopt) || !s?.prog) return orig(s, year, period);
      const before = snapPrime(s);
      const beforeTal = {};
      PRIME.forEach((sl) => (beforeTal[sl] = slotTalent(s, sl)));
      const ret = withTag('decay', () => orig(s, year, period));
      const after = snapPrime(s);
      const afterTal = {};
      PRIME.forEach((sl) => (afterTal[sl] = slotTalent(s, sl)));
      PRIME.forEach((sl) => recordSlotDelta(Gopt, s, sl, before[sl], after[sl], 'decay', null, beforeTal[sl], afterTal[sl]));
      return ret;
    };
  }

  // Wrap runAI(G): captures AI-periodic quality nudges and staffing outcomes.
  if (typeof runAI === 'function') {
    const orig = runAI;
    globalThis.runAI = function runAIWrapped(Gopt) {
      if (!diagOn(Gopt)) return orig(Gopt);
      const stations = (Gopt?.stations || []).filter((s) => s?.prog && !s._bpSlotDeferred);
      const before = new Map();
      stations.forEach((s) => {
        const q = snapPrime(s);
        const t = {};
        PRIME.forEach((sl) => (t[sl] = slotTalent(s, sl)));
        before.set(s.id, { q, t });
      });
      const ret = withTag('runAI', () => orig(Gopt));
      stations.forEach((s) => {
        const b = before.get(s.id);
        if (!b) return;
        const a = snapPrime(s);
        const t1 = {};
        PRIME.forEach((sl) => (t1[sl] = slotTalent(s, sl)));
        PRIME.forEach((sl) => recordSlotDelta(Gopt, s, sl, b.q[sl], a[sl], 'runAI', null, b.t[sl], t1[sl]));
      });
      return ret;
    };
  }

  // Wrap hire/move/replace helpers that directly set sd.quality with talent-fit boosts.
  [
    'initCoHostChemistryReveal',
    'applyTalentPerformanceRevealDecayStep',
    'applyCoHostChemistryRevealDecayStep',
    'clearPairingChemistryOnly',
  ].forEach((fnName) => {
    if (typeof globalThis[fnName] !== 'function') return;
    const orig = globalThis[fnName];
    globalThis[fnName] = function wrapped(...args) {
      const Gopt = typeof G !== 'undefined' ? G : null;
      if (!diagOn(Gopt)) return orig(...args);
      const sd = args[0];
      // attempt to resolve station/slot from sd backrefs if present (often not); otherwise omit.
      const q0 = typeof sd?.quality === 'number' ? sd.quality : null;
      const ret = withTag(fnName, () => orig(...args));
      const q1 = typeof sd?.quality === 'number' ? sd.quality : null;
      if (q0 != null && q1 != null && q0 !== q1) {
        pushEv(Gopt, {
          type: 'sd_quality_delta',
          source: fnName,
          dq: q1 - q0,
          q0,
          q1,
          q0r: Math.round(q0),
          q1r: Math.round(q1),
        });
      }
      return ret;
    };
  });

  // Wrap advTurn(): capture any remaining deltas not attributable to decay/runAI wrappers.
  if (typeof advTurn === 'function') {
    const orig = advTurn;
    globalThis.advTurn = function advTurnWrapped() {
      const Gopt = typeof G !== 'undefined' ? G : null;
      if (!diagOn(Gopt)) return orig();

      const stations = (Gopt?.stations || []).filter((s) => s?.prog && !s._bpSlotDeferred);
      const before = new Map();
      stations.forEach((s) => before.set(s.id, snapPrime(s)));

      const ret = withTag('advTurn', () => orig());

      stations.forEach((s) => {
        const b = before.get(s.id);
        if (!b) return;
        const a = snapPrime(s);
        PRIME.forEach((sl) => {
          if (b[sl] == null || a[sl] == null || b[sl] === a[sl]) return;
          // If decay/runAI already recorded, we still keep this as a fallback “turnNet” record.
          recordSlotDelta(Gopt, s, sl, b[sl], a[sl], 'advTurn_net', tagTop());
        });
      });

      return ret;
    };
  }

  globalThis.__wlPmDriveAuditHooksInstalled = true;
})();

