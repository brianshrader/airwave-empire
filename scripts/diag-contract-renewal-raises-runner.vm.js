/**
 * Contract renewal raise diagnostic runner.
 * globalThis.__wlRunContractRenewalRaisesSim(config)
 */
(function () {
  'use strict';

  const SCENARIO_BY_START = { 1970: 'under', 1985: 'chrwar', 2000: 'harness2000' };

  function ensureHarnessScenario() {
    if (typeof SC === 'undefined' || !Array.isArray(SC)) return;
    if (SC.some((s) => s.id === 'harness2000')) return;
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

  function seededRandom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function initGame(marketId, startYear) {
    ensureHarnessScenario();
    ACTIVE_MARKET = marketId;
    _selectedMarket = marketId;
    if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
    G = genMarket(scenIdFromStart(startYear));
    G.marketId = marketId;
    G.tutorialMode = false;
    G._wlRenewalRaisesDiag = true;
    G._wlRenewalEvents = [];
    G.cash = Math.max(G.cash || 0, 5000000);
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  function scenIdFromStart(startYear) {
    return SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
  }

  function countRenewalOpportunities(Gopt) {
    let n = 0;
    (Gopt.ps || []).forEach((s) => {
      if (!s?.isPlayer) return;
      Object.entries(s.prog || {}).forEach(([slot, sd]) => {
        const pairs = [[sd?.talent, false]];
        const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
        if (ch) pairs.push([ch, true]);
        pairs.forEach(([t]) => {
          if (!t || t._letExpire) return;
          if ((t.cyr || 0) > 0.5) return;
          n += 1;
        });
      });
    });
    return n;
  }

  function simulatePlayerRenewals(Gopt) {
    let attempts = 0;
    let errors = 0;
    const extendFn = globalThis.doExtend;
    if (typeof extendFn !== 'function') return { attempts, errors: 1 };
    (Gopt.ps || []).forEach((s) => {
      if (!s?.isPlayer) return;
      Object.entries(s.prog || {}).forEach(([slot, sd]) => {
        if (!sd?.talent || sd.talent._letExpire) return;
        const t = sd.talent;
        const cyr = t.cyr || 0;
        if (cyr > 0.5) return;
        if (typeof wlTalentHasExitIntent === 'function' && wlTalentHasExitIntent(t)) return;
        if (t._contractExtendY === Gopt.year && t._contractExtendP === Gopt.period) return;
        try {
          const ce = buildContractEconObject(s, slot, t, false, t);
          const cost = ce.ext2Cost || ce.ext1Cost;
          if (!cost || (Gopt.cash || 0) < cost / 2) return;
          attempts += 1;
          extendFn(s.id, slot, ce.ext2Cost ? 2 : 1, cost, 'host', false);
        } catch (e) {
          errors += 1;
          if (!Gopt._wlRenewalRaiseLastErr) {
            Gopt._wlRenewalRaiseLastErr = String(e && e.message ? e.message : e);
          }
        }
      });
    });
    return { attempts, errors };
  }

  globalThis.__wlRunContractRenewalRaisesSim = function runSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear;
    const seed = config.seed >>> 0;
    const endYear = config.endYear || startYear + (config.years || 30);
    const simulateRenewals = config.simulateRenewals !== false;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const summary = {
      marketId,
      startYear,
      endYear,
      seed,
      simulateRenewals,
      ok: false,
      periods: 0,
      renewalOpportunities: 0,
      simulatedExtendAttempts: 0,
      simulatedExtendErrors: 0,
      events: [],
    };

    try {
      initGame(marketId, startYear);
      const endPeriods = (endYear - startYear) * 2;

      for (let step = 0; step < endPeriods && G.year < endYear; step++) {
        summary.renewalOpportunities += countRenewalOpportunities(G);
        if (simulateRenewals) {
          const sim = simulatePlayerRenewals(G);
          summary.simulatedExtendAttempts += sim.attempts;
          summary.simulatedExtendErrors += sim.errors || 0;
        }
        advTurn();
        if ((G.cash || 0) < 200000) G.cash = 5000000;
        summary.periods += 1;
      }

      summary.events = (G._wlRenewalEvents || []).slice();
      summary.lastSimError = G._wlRenewalRaiseLastErr || null;
      summary.ok = true;
    } catch (e) {
      summary.error = String(e && e.message ? e.message : e);
    } finally {
      Math.random = origRand;
    }
    return summary;
  };
})();
