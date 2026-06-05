/**
 * Contract refusal diagnostic runner.
 * Exposes: globalThis.__wlRunContractRefusalSim(config)
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
    const scenId = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
    ACTIVE_MARKET = marketId;
    _selectedMarket = marketId;
    if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
    G = genMarket(scenId);
    G.marketId = marketId;
    G.tutorialMode = false;
    G._wlRefusalDiag = true;
    G._wlRefusalEvents = [];
    G.cash = Math.max(G.cash || 0, 3500000);
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  function countRenewalOpportunities(Gopt) {
    let n = 0;
    const talents = [];
    (Gopt.ps || []).forEach((s) => {
      if (!s?.isPlayer) return;
      Object.entries(s.prog || {}).forEach(([slot, sd]) => {
        if (!sd) return;
        const pairs = [[sd.talent, false]];
        const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
        if (ch) pairs.push([ch, true]);
        pairs.forEach(([t, isCoHost]) => {
          if (!t || t._letExpire) return;
          const cyr = t.cyr || 0;
          if (cyr > 0.5) return;
          n += 1;
          talents.push({
            stationId: s.id,
            call: s.callLetters || '',
            slot,
            isCoHost,
            cyr,
            wantsExit: !!t._wantsExit,
            satisfaction: t._satisfaction | 0,
          });
        });
      });
    });
    return { count: n, talents };
  }

  function simulatePlayerRenewals(Gopt) {
    let attempts = 0;
    let skippedExit = 0;
    (Gopt.ps || []).forEach((s) => {
      if (!s?.isPlayer) return;
      Object.entries(s.prog || {}).forEach(([slot, sd]) => {
        if (!sd?.talent || sd.talent._letExpire) return;
        const t = sd.talent;
        const cyr = t.cyr || 0;
        if (cyr > 0.5) return;
        if (typeof wlTalentHasExitIntent === 'function' && wlTalentHasExitIntent(t)) {
          skippedExit += 1;
          globalThis.__wlRefusalLog('renewal_opportunity_exit_intent', {
            stationId: s.id,
            call: s.callLetters || '',
            slot,
            cyr,
            wantsExitReason: t._wantsExitReason || '',
            satisfaction: t._satisfaction | 0,
          });
          return;
        }
        try {
          const ce = buildContractEconObject(s, slot, t, false, t);
          const cost = ce.ext2Cost || ce.ext1Cost;
          if (!cost || (Gopt.cash || 0) < cost / 2) {
            globalThis.__wlRefusalLog('renewal_opportunity_no_cash', {
              stationId: s.id,
              slot,
              cost,
              cash: Gopt.cash || 0,
            });
            return;
          }
          attempts += 1;
          doExtend(s.id, slot, ce.ext2Cost ? 2 : 1, cost, 'host', false);
        } catch (_e) {
          /* ignore */
        }
      });
    });
    return { attempts, skippedExit };
  }

  function newsDepartures(news, year, period) {
    return (news || []).filter((n) => {
      if (!n || n.y !== year || n.p !== period) return false;
      const t = String(n.t || '').toLowerCase();
      return (
        t.includes('declined a new contract') ||
        t.includes('refused to re-sign') ||
        t.includes("won't sign") ||
        t.includes('walks away') ||
        t.includes('not interested in a new deal') ||
        t.includes('intends to leave') ||
        t.includes('plans to leave') ||
        t.includes('contract not renewed')
      );
    });
  }

  globalThis.__wlRunContractRefusalSim = function runSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear;
    const seed = config.seed >>> 0;
    const endYear = config.endYear || startYear + (config.years || 15);
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
      renewalOpportunityTalentPeriods: [],
      simulatedExtendAttempts: 0,
      simulatedExtendSkippedExitIntent: 0,
      extendAttempts: 0,
      extendRefused: 0,
      exitIntentSet: 0,
      contractModifierChecks: 0,
      refuse3yrBlocks: 0,
      departuresRefusalLike: 0,
      expiryWarnings: 0,
      noRefusalReasons: {
        satisfaction_too_high: 0,
        loyal_personality_shield: 0,
        top3_shield: 0,
        roll_failed: 0,
        cyr_still_positive: 0,
        let_expire: 0,
        not_player_station: 0,
      },
      exitIntentByReason: {},
      events: [],
    };

    try {
      initGame(marketId, startYear);
      const endPeriods = (endYear - startYear) * 2;

      for (let step = 0; step < endPeriods && G.year < endYear; step++) {
        const wasYear = G.year;
        const wasPeriod = G.period;

        const opp = countRenewalOpportunities(G);
        summary.renewalOpportunities += opp.count;

        if (simulateRenewals && opp.count) {
          const sim = simulatePlayerRenewals(G);
          summary.simulatedExtendAttempts += sim.attempts;
          summary.simulatedExtendSkippedExitIntent += sim.skippedExit;
        }

        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;
        summary.periods += 1;

        const departNews = newsDepartures(G.news, wasYear, wasPeriod);
        summary.departuresRefusalLike += departNews.length;

        (G.news || []).forEach((n) => {
          if (!n || n.y !== wasYear || n.p !== wasPeriod) return;
          if (String(n.t || '').includes('expires next period')) summary.expiryWarnings += 1;
        });
      }

      const ev = G._wlRefusalEvents || [];
      summary.events = ev;
      summary.extendAttempts = ev.filter((e) => e.type === 'extend_attempt').length;
      summary.extendRefused = ev.filter((e) => e.type === 'extend_attempt' && e.refused).length;
      summary.exitIntentSet = ev.filter((e) => e.type === 'exit_intent_set').length;
      summary.contractModifierChecks = ev.filter((e) => e.type === 'contract_modifiers').length;
      summary.refuse3yrBlocks = ev.filter((e) => e.type === 'contract_modifiers' && e.refuse3yr).length;

      for (const e of ev.filter((x) => x.type === 'exit_intent_set')) {
        const r = e.reason || 'unknown';
        summary.exitIntentByReason[r] = (summary.exitIntentByReason[r] || 0) + 1;
      }

      summary.ok = true;
      return summary;
    } catch (err) {
      summary.error = String(err && err.message ? err.message : err);
      return summary;
    } finally {
      Math.random = origRand;
    }
  };

  globalThis.__wlRunContractRefusalBatch = function runBatch(config) {
    const markets = config.markets || [];
    const startYears = config.startYears || [1970];
    const runs = config.runs || 2;
    const baseSeed = (config.seed >>> 0) || 20260602;
    const results = [];
    for (const marketId of markets) {
      for (const startYear of startYears) {
        const endYear = config.endYearByStart?.[startYear] || config.endYear || startYear + (config.years || 15);
        for (let r = 0; r < runs; r++) {
          const seed = (baseSeed + r * 104729 + startYear * 997 + marketId.length * 31) >>> 0;
          results.push(
            globalThis.__wlRunContractRefusalSim({
              marketId,
              startYear,
              endYear,
              seed,
              simulateRenewals: config.simulateRenewals,
            }),
          );
        }
      }
    }
    return results;
  };
})();
