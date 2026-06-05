/**
 * Elite daypart quality diagnostic runner.
 * Exposes:
 *   - globalThis.__wlEliteDaypartRun(config)
 */
(function () {
  'use strict';

  const PRIME_SLOTS = ['morningDrive', 'midday', 'afternoonDrive'];
  const SNAP_YEARS = [1980, 1990, 2000, 2010, 2020];

  function seededRandom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function stationType(s) {
    if (!s) return 'unknown';
    if (s.isPlayer) return 'player';
    if (s.corpOwner) return 'ai_corp';
    return 'ai_indie';
  }

  function isCommercialPlayableStation(s) {
    if (!s || s._bpSlotDeferred) return false;
    if (typeof stationIsNoncommercialInstitutional === 'function' && stationIsNoncommercialInstitutional(s)) return false;
    if (s.isPublic) return false;
    return true;
  }

  function progCap(Gopt) {
    try {
      return typeof progBudgetCapForPeriod === 'function' ? progBudgetCapForPeriod(Gopt) : 0;
    } catch (_e) {
      return 0;
    }
  }

  function progPct(s, cap) {
    if (!cap) return 0;
    return Math.max(0, Math.min(1, (Math.min(cap, s?.ops?.progBudget || 0)) / cap));
  }

  function getSlotQ(s, slot) {
    const q = s?.prog?.[slot]?.quality;
    return typeof q === 'number' && !Number.isNaN(q) ? q : null;
  }

  function snapshotMarket(Gopt, yearLabel) {
    const cap = progCap(Gopt);
    const rows = [];
    (Gopt.stations || []).forEach((s) => {
      if (!isCommercialPlayableStation(s)) return;
      const rec = {
        stationId: s.id,
        call: s.callLetters || '',
        type: stationType(s),
        corpOwner: s.corpOwner || null,
        progBudget: s?.ops?.progBudget || 0,
        progCap: cap,
        progPctCap: progPct(s, cap),
        prime: {},
      };
      PRIME_SLOTS.forEach((sl) => {
        rec.prime[sl] = getSlotQ(s, sl);
      });
      rec.allPrime95 = PRIME_SLOTS.every((sl) => (rec.prime[sl] || 0) >= 95);
      rec.allPrime98 = PRIME_SLOTS.every((sl) => (rec.prime[sl] || 0) >= 98);
      rows.push(rec);
    });
    return { year: yearLabel, n: rows.length, stations: rows };
  }

  function countThresholds(snapshot) {
    const out = {
      totalStations: snapshot.n,
      bySlot: {},
      byType: {},
      allPrime: { ge95: 0, ge98: 0 },
    };
    const THRS = [90, 95, 98];
    PRIME_SLOTS.forEach((sl) => {
      out.bySlot[sl] = { ge90: 0, ge95: 0, ge98: 0, denom: 0 };
    });
    snapshot.stations.forEach((r) => {
      if (r.allPrime95) out.allPrime.ge95++;
      if (r.allPrime98) out.allPrime.ge98++;
      const t = r.type || 'unknown';
      if (!out.byType[t]) out.byType[t] = { n: 0, allPrime95: 0, allPrime98: 0 };
      out.byType[t].n++;
      if (r.allPrime95) out.byType[t].allPrime95++;
      if (r.allPrime98) out.byType[t].allPrime98++;
      PRIME_SLOTS.forEach((sl) => {
        const q = r.prime[sl];
        if (q == null) return;
        out.bySlot[sl].denom++;
        if (q >= 90) out.bySlot[sl].ge90++;
        if (q >= 95) out.bySlot[sl].ge95++;
        if (q >= 98) out.bySlot[sl].ge98++;
      });
    });
    return out;
  }

  function yearsSinceStart(startYear, y, p) {
    const dy = (y - startYear) * 2 + ((p | 0) === 2 ? 1 : 0);
    return dy / 2;
  }

  // Growth curves: use per-station slot threshold crossing times from hooks store (if present).
  function growthCurvesFromStore(Gopt, startYear) {
    const store = Gopt?._wlEliteDaypartStore;
    const curves = {};
    const pairs = [
      [70, 80],
      [80, 90],
      [90, 95],
      [95, 98],
    ];
    PRIME_SLOTS.forEach((sl) => {
      curves[sl] = {};
      pairs.forEach(([a, b]) => {
        curves[sl][`${a}_${b}`] = { samples: [] };
      });
    });
    if (!store || !store.crossed) return curves;

    // We only record thr>=80 in hooks, so 70->80 is approximated as (time80 - timeStart).
    function getCross(stationId, slot, thr) {
      return store.crossed[`${stationId}::${slot}::${thr}`] || null;
    }

    const stations = (Gopt.stations || []).filter((s) => isCommercialPlayableStation(s));
    stations.forEach((s) => {
      PRIME_SLOTS.forEach((sl) => {
        const c80 = getCross(s.id, sl, 80);
        const c90 = getCross(s.id, sl, 90);
        const c95 = getCross(s.id, sl, 95);
        const c98 = getCross(s.id, sl, 98);
        if (c80) curves[sl]['70_80'].samples.push(yearsSinceStart(startYear, c80.y, c80.p));
        if (c80 && c90) curves[sl]['80_90'].samples.push(yearsSinceStart(startYear, c90.y, c90.p) - yearsSinceStart(startYear, c80.y, c80.p));
        if (c90 && c95) curves[sl]['90_95'].samples.push(yearsSinceStart(startYear, c95.y, c95.p) - yearsSinceStart(startYear, c90.y, c90.p));
        if (c95 && c98) curves[sl]['95_98'].samples.push(yearsSinceStart(startYear, c98.y, c98.p) - yearsSinceStart(startYear, c95.y, c95.p));
      });
    });
    return curves;
  }

  function summarizeSamples(samples) {
    const s = samples.filter((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0);
    s.sort((a, b) => a - b);
    if (!s.length) return { n: 0, avg: null, med: null };
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    const mid = Math.floor(s.length / 2);
    const med = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    return { n: s.length, avg, med };
  }

  function summarizeCurves(curves) {
    const out = {};
    for (const [slot, bands] of Object.entries(curves)) {
      out[slot] = {};
      for (const [k, v] of Object.entries(bands)) {
        out[slot][k] = summarizeSamples(v.samples || []);
      }
    }
    return out;
  }

  // Nashville case study helper: mark top-2 commercial stations as player at start (diagnostic only).
  function nashvilleForceTwoPlayerStations(Gopt) {
    if (!Gopt || !Array.isArray(Gopt.stations)) return;
    const commercial = Gopt.stations.filter((s) => isCommercialPlayableStation(s) && !s.isPlayer);
    commercial.sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
    const pick = commercial.slice(0, 2);
    pick.forEach((s) => {
      s.isPlayer = true;
      s.color = s.color || '#22c55e';
    });
    Gopt.ps = Gopt.stations.filter((s) => s.isPlayer);
  }

  globalThis.__wlEliteDaypartRun = function run(config) {
    const marketId = config.marketId;
    const startYear = config.startYear || 1970;
    const endYear = config.endYear || 2021;
    const seed = (config.seed >>> 0) || 1;
    const enableHooks = config.enableHooks !== false;
    const nashvilleTwoStations = !!config.nashvilleTwoStations;

    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const out = {
      ok: false,
      marketId,
      startYear,
      endYear,
      seed,
      snapshots: {},
      snapshotStats: {},
      curves: null,
      curvesSummary: null,
      eventsTail: [],
      nashvilleCase1980: null,
    };

    try {
      // initGame() is provided by the harness (legacy.js in VM context)
      ACTIVE_MARKET = marketId;
      _selectedMarket = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      const scenId = startYear === 1985 ? 'chrwar' : startYear === 2000 ? 'harness2000' : 'under';
      G = genMarket(scenId);
      G.marketId = marketId;
      G.tutorialMode = false;
      if (enableHooks) G._wlEliteDaypartDiag = true;

      if (nashvilleTwoStations) nashvilleForceTwoPlayerStations(G);

      if (typeof recalc === 'function') recalc(G.stations, G);
      if (typeof seedRev === 'function') seedRev(G.stations, G);

      // iterate periods until endYear (exclusive)
      const maxSteps = (endYear - startYear) * 2 + 4;
      for (let i = 0; i < maxSteps && (G.year | 0) < endYear; i++) {
        // Snapshot at end of Fall book for target years (period 2).
        if (SNAP_YEARS.includes(G.year | 0) && (G.period | 0) === 2) {
          const snap = snapshotMarket(G, G.year | 0);
          out.snapshots[String(G.year | 0)] = snap;
          out.snapshotStats[String(G.year | 0)] = countThresholds(snap);
        }

        // Nashville case: capture 1980 end-of-year counts (with forced 2 player stations).
        if (nashvilleTwoStations && (G.year | 0) === 1980 && (G.period | 0) === 2) {
          const snap80 = snapshotMarket(G, 1980);
          const st = countThresholds(snap80);
          out.nashvilleCase1980 = st;
        }

        advTurn();
      }

      const curves = growthCurvesFromStore(G, startYear);
      out.curves = curves;
      out.curvesSummary = summarizeCurves(curves);

      const ev = G?._wlEliteDaypartStore?.events || [];
      out.eventsTail = ev.slice(Math.max(0, ev.length - 500));

      out.ok = true;
      return out;
    } catch (e) {
      out.error = String(e && e.message ? e.message : e);
      return out;
    } finally {
      Math.random = origRand;
    }
  };
})();

