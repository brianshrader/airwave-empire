/**
 * PM Drive quality audit runner.
 * Exposes: globalThis.__wlRunPmDriveQualityAudit(config)
 */
(function () {
  'use strict';

  const SCENARIO_BY_START = { 1970: 'under', 1985: 'chrwar', 2000: 'harness2000' };
  const PRIME = ['morningDrive', 'midday', 'afternoonDrive'];

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
    G._wlPmDriveAuditOn = true;
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  function getSlotQ(s, slot) {
    const q = s?.prog?.[slot]?.quality;
    return typeof q === 'number' && !Number.isNaN(q) ? q : null;
  }

  function snapshotYear(Gopt, yearLabel) {
    const rows = [];
    (Gopt.stations || []).forEach((s) => {
      if (!s?.prog || s._bpSlotDeferred) return;
      const rec = {
        stationId: s.id,
        call: s.callLetters || '',
        isPlayer: !!s.isPlayer,
        corpOwner: s.corpOwner || null,
        prime: {},
      };
      PRIME.forEach((sl) => {
        rec.prime[sl] = getSlotQ(s, sl);
      });
      rows.push(rec);
    });
    return { year: yearLabel, n: rows.length, stations: rows };
  }

  globalThis.__wlRunPmDriveQualityAudit = function run(config) {
    const marketId = config.marketId;
    const startYear = config.startYear || 1970;
    const endYear = config.endYear || 2021;
    const seed = (config.seed >>> 0) || 1;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const summary = {
      ok: false,
      marketId,
      startYear,
      endYear,
      seed,
      snapshots: {},
      eventsCount: 0,
      crossingsCount: 0,
      pm98CountAt2020: null,
    };

    try {
      initGame(marketId, startYear);
      const endPeriods = (endYear - startYear) * 2;

      for (let step = 0; step < endPeriods && (G.year | 0) < endYear; step++) {
        if ((G.period | 0) === 2) {
          const y = G.year | 0;
          if (y === 1980 || y === 1990 || y === 2000 || y === 2010 || y === 2020) {
            summary.snapshots[String(y)] = snapshotYear(G, y);
          }
        }
        advTurn();
      }

      summary.eventsCount = (G._wlPmDriveAudit?.events || []).length;
      summary.crossingsCount = Object.keys(G._wlPmDriveAudit?.crossings || {}).length;
      summary.ok = true;
      return summary;
    } catch (err) {
      summary.error = String(err && err.message ? err.message : err);
      return summary;
    } finally {
      Math.random = origRand;
    }
  };
})();

