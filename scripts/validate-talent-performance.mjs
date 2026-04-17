#!/usr/bin/env node
/**
 * A/B validation: talent-performance layer (legacy recalc) OFF vs ON, over multiple years.
 * Optional sharp talent salary cut on one tracked format to observe delayed trajectory.
 *
 *   node scripts/validate-talent-performance.mjs
 *   node scripts/validate-talent-performance.mjs --markets=chicago,seattle,newyork --start-year=2005
 *   node scripts/validate-talent-performance.mjs --cut --cut-format=top40_chr
 *   node scripts/validate-talent-performance.mjs --json=tmp/talent_performance_validation.json
 *
 * Batch (multi-seed, full sim, ON vs ON+cut only; no layer-OFF):
 *   node scripts/validate-talent-performance.mjs --cut --cut-format=top40_chr --runs=20 --seed-start=424242 --json=tmp/talent_perf_batch_top40.json
 *
 * With --cut: prints a "Cut station delta (ON vs ON+cut)" table per market and adds report.cutStationComparison[],
 *   report.cutStationSummary[] (onNo−onCut deltas, behavior tag), cutStationAggregateByFormat, fullValidationConclusion (JSON).
 *
 * Controlled single-station validation (deterministic forward + scoped layer): scripts/validate-talent-performance-controlled.mjs
 *
 * Toggle: window.__WL_TALENT_PERFORMANCE_LAYER__ === false disables the layer (default: on / undefined).
 *
 * Env: VALIDATION_QUIET=0 — show legacy console.log in VM
 */
/* eslint-disable no-console */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const defaultJsonOut = path.join(root, 'tmp', 'talent_performance_validation.json');

const DEFAULT_MARKETS = ['chicago', 'seattle', 'newyork'];

/** Tracked format buckets → legacy format ids (first match by share order). */
const FORMAT_PICK = {
  top40_chr: ['TOP40', 'CHR'],
  news_talk: ['NEWS_TALK', 'ALL_NEWS'],
  ac_easy: ['ADULT_CONTEMP', 'HOT_AC'],
  country: ['COUNTRY'],
  album_rock: ['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK'],
};

const FORMAT_LABEL = {
  top40_chr: 'Top 40 / CHR',
  news_talk: 'News / Talk',
  ac_easy: 'AC / Adult Contemporary',
  country: 'Country',
  album_rock: 'Album Rock',
};

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function loadLegacySrc() {
  let src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  return injectHeadlessMegaFragNewsGuard(src);
}

function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
  };
}

const documentStub = {
  body: { innerHTML: '' },
  head: { appendChild() {} },
  createElement() {
    return { href: '', download: '', click() {} };
  },
  getElementById() {
    return stubEl();
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
  readyState: 'complete',
};

function createVmContext(quiet) {
  const noop = () => {};
  const ctx = vm.createContext({
    console: quiet
      ? { log: noop, warn: noop, error: console.error, table: noop }
      : console,
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() {
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class {
      constructor() {}
    },
    FileReader: class {
      readAsText() {}
    },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) {
          typedArray[i] = Math.floor(Math.random() * 256);
        }
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      },
    },
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    Symbol,
    Proxy,
    Reflect,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Int8Array,
    Uint8Array,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function loadSim(ctx) {
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
}

function installRunner(ctx) {
  const fk = JSON.stringify(FORMAT_PICK);
  const code = `
(function () {
  var FORMAT_PICK = ${fk};

  function pickTrackedStationIds(G) {
    var out = {};
    var fkKeys = Object.keys(FORMAT_PICK);
    var k, t, j, comm, targets, found;
    for (k = 0; k < fkKeys.length; k++) {
      var key = fkKeys[k];
      targets = FORMAT_PICK[key];
      comm = (G.stations || []).filter(function (s) {
        return s && !s._bpSlotDeferred && !s.isPublic;
      });
      comm.sort(function (a, b) {
        return (b.rat && b.rat.share ? b.rat.share : 0) - (a.rat && a.rat.share ? a.rat.share : 0);
      });
      found = null;
      for (t = 0; t < targets.length; t++) {
        for (j = 0; j < comm.length; j++) {
          if (comm[j].format === targets[t]) {
            found = comm[j];
            break;
          }
        }
        if (found) break;
      }
      out[key] = found ? found.id : null;
    }
    return out;
  }

  function commercialRankById(G, stationId) {
    var comm = (G.stations || []).filter(function (s) {
      return s && !s._bpSlotDeferred && !s.isPublic;
    });
    comm.sort(function (a, b) {
      return (b.rat && b.rat.share ? b.rat.share : 0) - (a.rat && a.rat.share ? a.rat.share : 0);
    });
    var idx = comm.findIndex(function (s) {
      return s.id === stationId;
    });
    return idx < 0 ? null : idx + 1;
  }

  function stationSnapshot(G, stationId) {
    var s = (G.stations || []).find(function (x) {
      return x.id === stationId;
    });
    if (!s) return null;
    var rev = s.fin && s.fin.rev ? s.fin.rev : 0;
    var ebitda = s.fin && s.fin.ebitda != null ? s.fin.ebitda : 0;
    var margin = rev > 0 ? ebitda / rev : null;
    var h =
      typeof classifyCommercialHealthDiagnostic === 'function' ? classifyCommercialHealthDiagnostic(s) : null;
    return {
      callLetters: s.callLetters,
      format: s.format,
      share: s.rat && s.rat.share,
      sharePct: s.rat && s.rat.share != null ? Math.round(s.rat.share * 10000) / 100 : null,
      rev: Math.round(rev),
      ebitda: Math.round(ebitda),
      margin: margin,
      marginPct: margin != null ? Math.round(margin * 10000) / 100 : null,
      talent: s.fin && s.fin.tal != null ? Math.round(s.fin.tal) : null,
      health: h,
      rank: commercialRankById(G, stationId),
      year: G.year,
      period: G.period,
    };
  }

  function applySharpTalentCut(st) {
    if (!st) return 0;
    var n = 0;
    Object.values(st.prog || {}).forEach(function (sd) {
      if (sd && sd.talent && sd.talent.salary != null) {
        sd.talent.salary = Math.max(1, Math.round(sd.talent.salary * 0.12));
        n++;
      }
    });
    return n;
  }

  /**
   * layerOn: true = default talent-performance layer, false = __WL_TALENT_PERFORMANCE_LAYER__ off
   * applyCut: slash salaries on station for cutFormatKey, then seedRev + recalc for consistent fin + ratings
   */
  window.__validateTalentPerformanceRun = function (opts) {
    opts = opts || {};
    var marketId = opts.marketId || 'chicago';
    var seed = opts.seed != null ? opts.seed : 424242;
    var layerOn = opts.layerOn !== false;
    var applyCut = !!opts.applyCut;
    var cutFormatKey = opts.cutFormatKey || 'top40_chr';
    var startYear = opts.startYear != null ? opts.startYear : 2005;
    var maxAdvance = opts.maxAdvance != null ? opts.maxAdvance : 2000;

    var origR = Math.random;
    var rng = seed;
    Math.random = function () {
      rng = (rng * 9301 + 49297) % 233280;
      return rng / 233280;
    };

    var ui = typeof window._harnessPatchTimersAndUi === 'function' ? window._harnessPatchTimersAndUi() : { restore: function () {} };
    try {
      if (typeof window !== 'undefined') {
        window.__WL_TALENT_PERFORMANCE_LAYER__ = false;
      }

      ACTIVE_MARKET = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      G = genMarketMP('1985');
      MP.mode = 'solo';
      MP.isHost = false;
      if (MP.players) MP.players = [];

      var adv = advanceGToYearPeriod(startYear, 2, maxAdvance);
      if (!adv.ok) {
        return { ok: false, marketId: marketId, seed: seed, layerOn: layerOn, applyCut: applyCut, error: adv.error, at: adv.at, steps: adv.steps };
      }

      var trackedIds = pickTrackedStationIds(G);
      var cutStationId = applyCut ? trackedIds[cutFormatKey] : null;
      var cutStation = cutStationId ? G.stations.find(function (x) { return x.id === cutStationId; }) : null;
      var salariesCut = 0;

      if (typeof window !== 'undefined') {
        window.__WL_TALENT_PERFORMANCE_LAYER__ = layerOn ? undefined : false;
      }

      if (applyCut && cutStation) {
        salariesCut = applySharpTalentCut(cutStation);
        if (typeof seedRev === 'function') seedRev(G.stations, G);
        if (typeof recalc === 'function') recalc(G.stations, G);
      }

      var checkpoints = [
        { label: 'start', advFromPrevious: 0 },
        { label: 'plus_1y', advFromPrevious: 2 },
        { label: 'plus_3y', advFromPrevious: 4 },
        { label: 'plus_5y', advFromPrevious: 4 },
      ];

      var rows = [];
      var ci, cj, need, lbl, snaps, fk, id, prevAdv;

      prevAdv = 0;
      for (ci = 0; ci < checkpoints.length; ci++) {
        need = checkpoints[ci].advFromPrevious;
        lbl = checkpoints[ci].label;
        for (cj = 0; cj < need; cj++) {
          advTurn();
        }
        snaps = {};
        for (fk in trackedIds) {
          id = trackedIds[fk];
          if (id) snaps[fk] = stationSnapshot(G, id);
          else snaps[fk] = null;
        }
        rows.push({
          checkpoint: lbl,
          labelHuman:
            lbl === 'start'
              ? 'Start (shared advance w/ layer off; forward=' + (layerOn ? 'ON' : 'OFF') + (applyCut ? '; cut+seedRev/recalc' : '') + ')'
              : lbl === 'plus_1y'
                ? '+1 year (2 half-periods)'
                : lbl === 'plus_3y'
                  ? '+3 years (6 half-periods from start)'
                  : '+5 years (10 half-periods from start)',
          year: G.year,
          period: G.period,
          advTurnsFromBaseline: prevAdv + need,
          snapshotsByFormat: snaps,
        });
        prevAdv += need;
      }

      return {
        ok: true,
        marketId: marketId,
        seed: seed,
        layerOn: layerOn,
        talentLayerFlag: layerOn ? 'on(default)' : 'off(false)',
        applyCut: applyCut,
        cutFormatKey: cutFormatKey,
        salariesSlashed: salariesCut,
        cutStationCall: cutStation ? cutStation.callLetters : null,
        startYear: startYear,
        advanceStepsToStart: adv.steps,
        trackedStationIds: trackedIds,
        checkpoints: rows,
      };
    } finally {
      ui.restore();
      Math.random = origR;
      if (typeof window !== 'undefined') window.__WL_TALENT_PERFORMANCE_LAYER__ = undefined;
    }
  };
})();
`;
  vm.runInContext(code, ctx);
}

function parseArgs(argv) {
  let jsonOut = null;
  let jsonExplicit = false;
  const markets = [];
  let startYear = 2005;
  let seed = 424242;
  let seedStartExplicit = null;
  let batchRuns = null;
  let applyCut = false;
  let cutFormat = 'top40_chr';
  for (const a of argv) {
    if (a === '--json') {
      jsonExplicit = true;
      jsonOut = defaultJsonOut;
    } else if (a.startsWith('--json=')) {
      jsonExplicit = true;
      jsonOut = a.slice('--json='.length);
    } else if (a.startsWith('--markets=')) {
      markets.push(...a.slice('--markets='.length).split(',').map((x) => x.trim()).filter(Boolean));
    } else if (a.startsWith('--start-year=')) {
      startYear = parseInt(a.slice('--start-year='.length), 10) || 2005;
    } else if (a.startsWith('--seed-start=')) {
      seedStartExplicit = parseInt(a.slice('--seed-start='.length), 10);
      if (Number.isNaN(seedStartExplicit)) seedStartExplicit = 424242;
    } else if (a.startsWith('--seed=')) {
      seed = parseInt(a.slice('--seed='.length), 10) || 424242;
    } else if (a.startsWith('--runs=')) {
      const n = parseInt(a.slice('--runs='.length), 10);
      batchRuns = Number.isFinite(n) && n > 0 ? n : null;
    } else if (a === '--cut') {
      applyCut = true;
    } else if (a.startsWith('--cut-format=')) {
      cutFormat = a.slice('--cut-format='.length).trim() || 'top40_chr';
    }
  }
  const seedStart = seedStartExplicit != null ? seedStartExplicit : seed;
  return {
    jsonOut: jsonExplicit ? jsonOut || defaultJsonOut : null,
    jsonExplicit,
    markets: markets.length ? markets : DEFAULT_MARKETS,
    startYear,
    seed,
    seedStart,
    batchRuns,
    applyCut,
    cutFormat,
  };
}

/** Documented thresholds for cut-station verdict (reporting only). */
const CUT_VERDICT_THRESHOLDS = {
  sharePpMild: 0.3,
  sharePpMeaningful: 0.75,
  sharePpSevere: 1.5,
  sharePpCounterintuitive: 0.6,
  rankWorseMild: 1,
  rankWorseMeaningful: 2,
  rankWorseSevere: 3,
  revRelDropMild: 0.06,
  revRelDropSevere: 0.18,
  revRelGainCounterintuitive: 0.08,
};

function findCheckpoint(run, label) {
  return run?.checkpoints?.find((r) => r.checkpoint === label) || null;
}

function buildCutStationComparison(on, onCut, marketId, cutFormatKey) {
  if (!on?.ok || !onCut?.ok) {
    return { ok: false, error: 'missing run', rows: [], verdict: 'insufficient_data' };
  }
  const labels = ['start', 'plus_1y', 'plus_3y', 'plus_5y'];
  const rows = [];
  const fk = cutFormatKey;
  for (const cp of labels) {
    const rowA = findCheckpoint(on, cp);
    const rowB = findCheckpoint(onCut, cp);
    const sA = rowA?.snapshotsByFormat?.[fk];
    const sB = rowB?.snapshotsByFormat?.[fk];
    const call = sA?.callLetters || sB?.callLetters || '';
    const fmt = sA?.format || sB?.format || '';
    const noSh = sA?.sharePct;
    const cutSh = sB?.sharePct;
    const dSh = noSh != null && cutSh != null ? cutSh - noSh : null;
    const noRev = sA?.rev;
    const cutRev = sB?.rev;
    const dRev = noRev != null && cutRev != null ? cutRev - noRev : null;
    const dRevRel = noRev != null && noRev !== 0 && cutRev != null ? (cutRev - noRev) / Math.abs(noRev) : null;
    const noMg = sA?.marginPct;
    const cutMg = sB?.marginPct;
    const dMg = noMg != null && cutMg != null ? cutMg - noMg : null;
    const noRk = sA?.rank;
    const cutRk = sB?.rank;
    const dRk = noRk != null && cutRk != null ? cutRk - noRk : null;
    const noTal = sA?.talent;
    const cutTal = sB?.talent;
    rows.push({
      checkpoint: cp,
      marketId,
      cutFormatKey: fk,
      callLetters: call,
      format: fmt,
      noCutSharePct: noSh,
      cutSharePct: cutSh,
      deltaSharePctPoints: dSh,
      noCutRev: noRev,
      cutRev: cutRev,
      deltaRev: dRev,
      deltaRevRelative: dRevRel,
      noCutMarginPct: noMg,
      cutMarginPct: cutMg,
      deltaMarginPctPoints: dMg,
      noCutRank: noRk,
      cutRank: cutRk,
      deltaRank: dRk,
      noCutTalent: noTal,
      cutTalent: cutTal,
    });
  }
  const verdict = classifyCutStationVerdict(rows);
  return {
    ok: true,
    marketId,
    cutFormatKey: fk,
    comparisonMode: 'layer_ON_no_cut vs layer_ON_plus_cut',
    rows,
    verdict: verdict.label,
    verdictDetail: verdict.detail,
    thresholdsUsed: CUT_VERDICT_THRESHOLDS,
  };
}

function classifyCutStationVerdict(rows) {
  const T = CUT_VERDICT_THRESHOLDS;
  const r5 = rows.find((r) => r.checkpoint === 'plus_5y');
  const r3 = rows.find((r) => r.checkpoint === 'plus_3y');
  if (!r5 || r5.noCutSharePct == null || r5.cutSharePct == null) {
    return { label: 'insufficient_data', detail: 'Missing +5y or share data' };
  }
  const d5 = r5.deltaSharePctPoints;
  const dR5 = r5.deltaRank;
  const dRev5 = r5.deltaRevRelative;
  const d3 = r3?.deltaSharePctPoints;

  const counterImprove =
    d5 > T.sharePpCounterintuitive &&
    (dR5 == null || dR5 <= 0) &&
    (dRev5 == null || dRev5 > -0.04);
  if (counterImprove || (dRev5 != null && dRev5 > T.revRelGainCounterintuitive && d5 > 0.2)) {
    return {
      label: 'counterintuitive_improvement',
      detail: 'Cut path ahead on share and/or revenue vs no-cut at +5y (see thresholds).',
    };
  }
  if (d5 <= -T.sharePpSevere || (dR5 != null && dR5 >= T.rankWorseSevere) || (dRev5 != null && dRev5 <= -T.revRelDropSevere)) {
    return { label: 'severe_erosion', detail: 'Large share drop, rank loss, and/or revenue loss at +5y.' };
  }
  if (
    d5 <= -T.sharePpMeaningful ||
    (dR5 != null && dR5 >= T.rankWorseMeaningful) ||
    (d3 != null && d3 <= -0.65 && d5 <= -0.45)
  ) {
    return { label: 'meaningful_erosion', detail: 'Clear deterioration vs no-cut by +3y/+5y.' };
  }
  if (d5 <= -T.sharePpMild || (dR5 != null && dR5 >= T.rankWorseMild)) {
    return { label: 'mild_erosion', detail: 'Modest share/rank disadvantage vs no-cut.' };
  }
  if (
    Math.abs(d5) < 0.25 &&
    (dR5 == null || Math.abs(dR5) < 1) &&
    (dRev5 == null || Math.abs(dRev5) < T.revRelDropMild)
  ) {
    return { label: 'no_meaningful_effect', detail: 'Deltas within noise band at +5y.' };
  }
  return { label: 'no_meaningful_effect', detail: 'Does not meet stronger erosion criteria.' };
}

function pad(n, w) {
  const s = n == null ? '' : String(n);
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

function printCutStationDeltaTable(title, comp) {
  console.log('');
  console.log('══ ' + title + ' ══');
  if (!comp || !comp.ok) {
    console.log('  (unavailable: ' + (comp?.error || 'unknown') + ')');
    return;
  }
  console.log(
    '  market=' +
      comp.marketId +
      '  format=' +
      (comp.rows[0]?.format || comp.cutFormatKey) +
      '  call=' +
      (comp.rows[0]?.callLetters || '?') +
      '  |  verdict: ' +
      comp.verdict +
      ' — ' +
      (comp.verdictDetail || '')
  );
  console.log(
    '  ' +
      pad('checkpoint', 12) +
      pad('no_sh%', 8) +
      pad('cut_sh%', 8) +
      pad('Δpp', 8) +
      pad('no_rev', 12) +
      pad('cut_rev', 12) +
      pad('Δrev', 11) +
      pad('no_mg%', 8) +
      pad('cut_mg%', 8) +
      pad('Δmg_pp', 8) +
      pad('no_rk', 6) +
      pad('cut_rk', 6) +
      pad('Δrk', 6) +
      pad('no_tal', 9) +
      pad('cut_tal', 9)
  );
  console.log('  ' + '-'.repeat(132));
  for (const r of comp.rows || []) {
    const dSh = r.deltaSharePctPoints != null ? r.deltaSharePctPoints.toFixed(2) : '';
    const dRev = r.deltaRev != null ? String(r.deltaRev) : '';
    const dMg = r.deltaMarginPctPoints != null ? r.deltaMarginPctPoints.toFixed(2) : '';
    const dRk = r.deltaRank != null ? String(r.deltaRank) : '';
    console.log(
      '  ' +
        pad(r.checkpoint, 12) +
        pad(r.noCutSharePct != null ? r.noCutSharePct.toFixed(2) : '', 8) +
        pad(r.cutSharePct != null ? r.cutSharePct.toFixed(2) : '', 8) +
        pad(dSh, 8) +
        pad(r.noCutRev != null ? r.noCutRev : '', 12) +
        pad(r.cutRev != null ? r.cutRev : '', 12) +
        pad(dRev, 11) +
        pad(r.noCutMarginPct != null ? r.noCutMarginPct.toFixed(1) : '', 8) +
        pad(r.cutMarginPct != null ? r.cutMarginPct.toFixed(1) : '', 8) +
        pad(dMg, 8) +
        pad(r.noCutRank != null ? r.noCutRank : '', 6) +
        pad(r.cutRank != null ? r.cutRank : '', 6) +
        pad(dRk, 6) +
        pad(r.noCutTalent != null ? r.noCutTalent : '', 9) +
        pad(r.cutTalent != null ? r.cutTalent : '', 9)
    );
  }
}

/** Share/rev/rank as (no cut − cut): positive ⇒ cut station is worse (lower share/rev or worse rank #). */
function cutRowDeltasOnNoMinusOnCut(row) {
  if (!row) return null;
  const sh =
    row.noCutSharePct != null && row.cutSharePct != null ? row.noCutSharePct - row.cutSharePct : null;
  const rev =
    row.noCutRev != null && row.cutRev != null ? row.noCutRev - row.cutRev : null;
  const rk =
    row.noCutRank != null && row.cutRank != null ? row.noCutRank - row.cutRank : null;
  return { shareOnNoMinusOnCut: sh, revOnNoMinusOnCut: rev, rankOnNoMinusOnCut: rk };
}

function summarizeCutStationForReport(comp) {
  if (!comp || !comp.ok) {
    return {
      marketId: comp?.marketId,
      cutFormatKey: comp?.cutFormatKey,
      verdict: comp?.verdict || 'insufficient_data',
      behavior: 'insufficient_data',
      keyPlus5y: null,
      deltasByCheckpoint: null,
    };
  }
  const byCp = {};
  for (const r of comp.rows || []) {
    byCp[r.checkpoint] = {
      ...cutRowDeltasOnNoMinusOnCut(r),
      deltaRevLegacyCutMinusNo: r.deltaRev,
      deltaRankLegacyCutMinusNo: r.deltaRank,
    };
  }
  const r1 = comp.rows?.find((x) => x.checkpoint === 'plus_1y');
  const r3 = comp.rows?.find((x) => x.checkpoint === 'plus_3y');
  const r5 = comp.rows?.find((x) => x.checkpoint === 'plus_5y');
  const d1 = cutRowDeltasOnNoMinusOnCut(r1)?.shareOnNoMinusOnCut;
  const d3 = cutRowDeltasOnNoMinusOnCut(r3)?.shareOnNoMinusOnCut;
  const d5 = cutRowDeltasOnNoMinusOnCut(r5)?.shareOnNoMinusOnCut;

  const TH = 0.04;
  let unstable = false;
  if (d1 != null && d3 != null && d5 != null) {
    const a = d1 > TH;
    const b = d3 > TH;
    const c = d5 > TH;
    const x = d1 < -TH;
    const y = d3 < -TH;
    const z = d5 < -TH;
    if ((a && (y || z)) || (b && (x || z)) || (c && (x || y))) unstable = true;
  }

  let behavior = 'flat_weak';
  const v = comp.verdict;
  if (v === 'counterintuitive_improvement') behavior = 'counterintuitive';
  else if (v === 'insufficient_data') behavior = 'insufficient_data';
  else if (unstable) behavior = 'unstable_noisy';
  else if (v === 'severe_erosion' || v === 'meaningful_erosion' || v === 'mild_erosion')
    behavior = 'consistent_erosion';
  else if (v === 'no_meaningful_effect') behavior = 'flat_weak';
  else if (d5 != null && d5 > 0.03) behavior = 'consistent_erosion';
  else behavior = 'flat_weak';

  return {
    marketId: comp.marketId,
    cutFormatKey: comp.cutFormatKey,
    verdict: comp.verdict,
    verdictDetail: comp.verdictDetail,
    behavior,
    unstableSharePath: unstable,
    keyPlus5y: {
      shareOnNoMinusOnCut_pp: cutRowDeltasOnNoMinusOnCut(r5)?.shareOnNoMinusOnCut,
      revOnNoMinusOnCut: cutRowDeltasOnNoMinusOnCut(r5)?.revOnNoMinusOnCut,
      rankOnNoMinusOnCut: cutRowDeltasOnNoMinusOnCut(r5)?.rankOnNoMinusOnCut,
    },
    deltasByCheckpoint: {
      plus_1y: cutRowDeltasOnNoMinusOnCut(r1),
      plus_3y: cutRowDeltasOnNoMinusOnCut(r3),
      plus_5y: cutRowDeltasOnNoMinusOnCut(r5),
    },
  };
}

function aggregateFormatShareAtPlus5y(perMarket) {
  const vals = perMarket
    .map((p) => p.keyPlus5y?.shareOnNoMinusOnCut_pp)
    .filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return {
    meanShareDeltaOnNoMinusOnCut_pp: sum / vals.length,
    minShareDeltaOnNoMinusOnCut_pp: Math.min(...vals),
    maxShareDeltaOnNoMinusOnCut_pp: Math.max(...vals),
    n: vals.length,
  };
}

function readinessConclusion(perMarket, cutFormatKey) {
  const notes = [];
  const counter = perMarket.filter((p) => p.behavior === 'counterintuitive');
  const unstable = perMarket.filter((p) => p.behavior === 'unstable_noisy');
  const agg = aggregateFormatShareAtPlus5y(perMarket);
  if (counter.length) notes.push(counter.length + ' market(s) classified counterintuitive: ' + counter.map((c) => c.marketId).join(', '));
  if (unstable.length >= 2) notes.push(unstable.length + ' market(s) show unstable share path across checkpoints.');
  if (agg && agg.minShareDeltaOnNoMinusOnCut_pp < -0.15)
    notes.push('Min +5y share delta (onNo−onCut) is negative in at least one market (cut ahead on share).');
  const top40ish = cutFormatKey === 'top40_chr';
  const passDirection =
    agg &&
    agg.meanShareDeltaOnNoMinusOnCut_pp > 0 &&
    agg.minShareDeltaOnNoMinusOnCut_pp > -0.05;
  if (top40ish && counter.length) notes.push('Top 40: counterintuitive verdicts fail the bar.');
  if (!top40ish && counter.length >= 2) notes.push('News/Talk: multiple counterintuitive results.');
  const readiness =
    counter.length === 0 && passDirection && unstable.length < 2 ? 'ready_for_gameplay' : 'needs_adjustment';
  if (notes.length === 0 && readiness === 'ready_for_gameplay')
    notes.push('Directionally consistent; no counterintuitive verdicts; aggregate share deltas favor no-cut.');
  return { readiness, aggregatePlus5yShareDelta: agg, notes };
}

function numericStats(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(v));
  if (!nums.length) return null;
  nums.sort((a, b) => a - b);
  const sum = nums.reduce((x, y) => x + y, 0);
  const mid = Math.floor(nums.length / 2);
  const med = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  const pos = nums.filter((x) => x > 0).length;
  return {
    mean: sum / nums.length,
    median: med,
    min: nums[0],
    max: nums[nums.length - 1],
    pctPositive: (100 * pos) / nums.length,
    n: nums.length,
  };
}

/**
 * Heuristic batch label — does not replace single-seed verdict thresholds.
 * Uses +5y share (onNo−onCut): positive ⇒ cut underperforms on share.
 */
function batchFormatConclusion(shareStatsPlus5y) {
  if (!shareStatsPlus5y || !shareStatsPlus5y.n) return 'insufficient_data';
  const { mean, median, pctPositive, n } = shareStatsPlus5y;
  if (pctPositive < 38 && mean < -0.02 && n >= 8) return 'Counterintuitive on average';
  if (pctPositive >= 58 && mean > 0.06 && (median > 0.02 || mean > 0.12)) return 'Directional on average';
  if (pctPositive >= 52 && mean > 0.015) return 'Weak but directional';
  if (pctPositive >= 45 && mean > -0.02 && mean < 0.06) return 'Too noisy / mixed';
  return 'Too noisy / mixed';
}

function defaultBatchJsonPath(cutFormat) {
  const slug = cutFormat === 'news_talk' ? 'newstalk' : 'top40';
  return path.join(root, 'tmp', `talent_perf_batch_${slug}.json`);
}

function checkpointDeltasFromComparisonRow(row) {
  if (!row) return null;
  return cutRowDeltasOnNoMinusOnCut(row);
}

function runBatchValidation(quietVm, args) {
  const { markets, startYear, cutFormat, batchRuns, seedStart, jsonExplicit } = args;
  const jsonOut = jsonExplicit && args.jsonOut ? args.jsonOut : defaultBatchJsonPath(cutFormat);

  const CHECKS = ['plus_1y', 'plus_3y', 'plus_5y'];
  const initCp = () => ({ share: [], rev: [], rank: [] });
  const flatByCp = {};
  const byMarket = {};
  for (const cp of CHECKS) flatByCp[cp] = initCp();
  for (const m of markets) {
    byMarket[m] = {};
    for (const cp of CHECKS) byMarket[m][cp] = initCp();
  }

  const perRun = [];

  for (let runIndex = 0; runIndex < batchRuns; runIndex++) {
    const seed = seedStart + runIndex;
    const runEntry = { runIndex, seed, markets: {} };
    for (const marketId of markets) {
      const baseOpts = { marketId, seed, startYear, applyCut: false, cutFormatKey: cutFormat };
      const ctxOn = makeFreshRunnerContext(quietVm);
      const on = vm.runInContext(
        `__validateTalentPerformanceRun(${JSON.stringify({ ...baseOpts, layerOn: true })})`,
        ctxOn
      );
      const ctxCut = makeFreshRunnerContext(quietVm);
      const onCut = vm.runInContext(
        `__validateTalentPerformanceRun(${JSON.stringify({ marketId, seed, startYear, applyCut: true, cutFormatKey: cutFormat, layerOn: true })})`,
        ctxCut
      );
      const comp = buildCutStationComparison(on, onCut, marketId, cutFormat);
      const summary = summarizeCutStationForReport(comp);
      runEntry.markets[marketId] = {
        ok: comp.ok,
        verdict: comp.verdict,
        verdictDetail: comp.verdictDetail,
        cutStationComparison: comp.rows,
        cutStationSummary: summary,
      };

      if (comp.ok && comp.rows) {
        for (const cp of CHECKS) {
          const row = comp.rows.find((r) => r.checkpoint === cp);
          const d = checkpointDeltasFromComparisonRow(row);
          if (d && d.shareOnNoMinusOnCut != null) {
            flatByCp[cp].share.push(d.shareOnNoMinusOnCut);
            flatByCp[cp].rev.push(d.revOnNoMinusOnCut);
            flatByCp[cp].rank.push(d.rankOnNoMinusOnCut);
            byMarket[marketId][cp].share.push(d.shareOnNoMinusOnCut);
            byMarket[marketId][cp].rev.push(d.revOnNoMinusOnCut);
            byMarket[marketId][cp].rank.push(d.rankOnNoMinusOnCut);
          }
        }
      }
    }
    perRun.push(runEntry);
    process.stderr.write(`batch run ${runIndex + 1}/${batchRuns} seed=${seed}\n`);
  }

  const buildAgg = (src) => {
    const o = {};
    for (const cp of CHECKS) {
      o[cp] = {
        shareOnNoMinusOnCut_pp: numericStats(src[cp].share),
        revOnNoMinusOnCut: numericStats(src[cp].rev),
        rankOnNoMinusOnCut: numericStats(src[cp].rank),
      };
    }
    return o;
  };

  const aggregateAllRunsAndMarkets = buildAgg(flatByCp);
  const aggregateByMarket = {};
  for (const m of markets) aggregateByMarket[m] = buildAgg(byMarket[m]);

  const share5 = aggregateAllRunsAndMarkets.plus_5y?.shareOnNoMinusOnCut_pp;
  const formatLevelConclusion = batchFormatConclusion(share5);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'batch_full_sim',
    batchRuns,
    seedStart,
    seedStep: 1,
    markets,
    startYear,
    cutFormat,
    cutFormatLabel: FORMAT_LABEL[cutFormat] || cutFormat,
    scenarios: 'layer_ON_no_cut vs layer_ON_plus_cut (layer OFF not run in batch)',
    perRun,
    aggregateAcrossAllRunsAndMarkets: aggregateAllRunsAndMarkets,
    aggregateByMarket,
    formatLevelConclusion,
    interpretation: {
      deltas:
        'share/rev/rank are onNo − onCut (positive share ⇒ no-cut ahead; positive rank ⇒ no-cut has better numeric rank).',
      batch:
        'Each run uses seed = seedStart + runIndex. Fresh VM per scenario. Compares aggregate mean/median/% positive to assess seed noise vs systematic bias.',
      compareFormats:
        'Run separate batches for top40_chr and news_talk; compare aggregateAcrossAllRunsAndMarkets.plus_5y.shareOnNoMinusOnCut_pp (mean, pctPositive) across the two JSON files for personality vs music-heavy effect size.',
    },
  };

  const dir = path.dirname(jsonOut);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');

  printBatchSummary(report, jsonOut);
}

function printBatchSummary(report, jsonOut) {
  const agg = report.aggregateAcrossAllRunsAndMarkets;
  const fc = report.formatLevelConclusion;
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(
    '  BATCH  runs=' + report.batchRuns + '  seedStart=' + report.seedStart + '  format=' + report.cutFormat
  );
  console.log('══════════════════════════════════════════════════════════════');
  for (const cp of ['plus_1y', 'plus_3y', 'plus_5y']) {
    const s = agg[cp]?.shareOnNoMinusOnCut_pp;
    if (!s) continue;
    console.log(
      '  ' +
        cp +
        '  shareΔ(onNo−onCut) pp:  mean=' +
        s.mean.toFixed(4) +
        '  median=' +
        s.median.toFixed(4) +
        '  min=' +
        s.min.toFixed(4) +
        '  max=' +
        s.max.toFixed(4) +
        '  %pos=' +
        s.pctPositive.toFixed(1) +
        '%  n=' +
        s.n
    );
    const r = agg[cp]?.revOnNoMinusOnCut;
    const k = agg[cp]?.rankOnNoMinusOnCut;
    if (r && r.n)
      console.log('         revΔ mean=' + r.mean.toFixed(0) + '  rankΔ mean=' + (k && k.n ? k.mean.toFixed(3) : 'n/a'));
  }
  console.log('');
  console.log('  Format-level conclusion: ' + fc);
  console.log('  Wrote ' + jsonOut);
  console.log('══════════════════════════════════════════════════════════════');
}

function printFullValidationSummary(report, cutFormat) {
  const per = report.cutStationSummary || [];
  const agg = report.cutStationAggregateByFormat?.[cutFormat];
  const con = report.fullValidationConclusion;
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Full validation summary  (cut: ' + cutFormat + ')');
  console.log('══════════════════════════════════════════════════════════════');
  for (const p of per) {
    console.log(
      '  ' +
        String(p.marketId).padEnd(10) +
        '  verdict=' +
        String(p.verdict).padEnd(28) +
        '  behavior=' +
        p.behavior
    );
    const k = p.keyPlus5y;
    if (k && k.shareOnNoMinusOnCut_pp != null) {
      console.log(
        '    +5y  shareΔ(onNo−onCut)=' +
          k.shareOnNoMinusOnCut_pp.toFixed(2) +
          'pp  revΔ=' +
          (k.revOnNoMinusOnCut != null ? k.revOnNoMinusOnCut : 'n/a') +
          '  rankΔ(onNo−onCut)=' +
          (k.rankOnNoMinusOnCut != null ? k.rankOnNoMinusOnCut : 'n/a')
      );
    }
  }
  if (agg) {
    console.log('');
    console.log(
      '  Aggregate +5y share Δ (onNo−onCut, pp):  mean=' +
        agg.meanShareDeltaOnNoMinusOnCut_pp.toFixed(3) +
        '  min=' +
        agg.minShareDeltaOnNoMinusOnCut_pp.toFixed(3) +
        '  max=' +
        agg.maxShareDeltaOnNoMinusOnCut_pp.toFixed(3)
    );
  }
  if (con) {
    console.log('');
    console.log('  Conclusion: ' + con.readiness);
    for (const n of con.notes || []) console.log('    — ' + n);
  }
  console.log('══════════════════════════════════════════════════════════════');
}

function addRankDeltasFromStart(run) {
  if (!run || !run.ok || !run.checkpoints || run.checkpoints.length < 2) return;
  const startSnaps = run.checkpoints[0].snapshotsByFormat;
  if (!startSnaps) return;
  for (const row of run.checkpoints) {
    const snaps = row.snapshotsByFormat || {};
    for (const fk of Object.keys(FORMAT_PICK)) {
      const cur = snaps[fk];
      const base = startSnaps[fk];
      if (cur && base && cur.rank != null && base.rank != null) {
        cur.rankDeltaFromStart = cur.rank - base.rank;
      }
    }
  }
}

function printCheckpointTable(title, run) {
  console.log('');
  console.log('── ' + title + ' ──');
  if (!run.ok) {
    console.log('  FAILED: ' + run.error, run.at || '');
    return;
  }
  console.log(
    '  market=' +
      run.marketId +
      ' seed=' +
      run.seed +
      ' layer=' +
      run.talentLayerFlag +
      ' cut=' +
      run.applyCut +
      (run.cutStationCall ? ' (' + run.cutStationCall + ')' : '')
  );
  for (const row of run.checkpoints || []) {
    console.log('  [' + row.checkpoint + ']  Y' + row.year + ' P' + row.period + '  (' + row.labelHuman + ')');
    const snaps = row.snapshotsByFormat || {};
    for (const fk of Object.keys(FORMAT_PICK)) {
      const s = snaps[fk];
      if (!s) {
        console.log('    ' + fk + ': (no station)');
        continue;
      }
      const rd = s.rankDeltaFromStart != null && s.rankDeltaFromStart !== 0 ? ' Δrank' + (s.rankDeltaFromStart > 0 ? '+' : '') + s.rankDeltaFromStart : '';
      console.log(
        '    ' +
          fk +
          ': ' +
          s.callLetters +
          ' ' +
          s.format +
          '  sh=' +
          (s.sharePct != null ? s.sharePct : '?') +
          '%  rev=$' +
          s.rev +
          '  margin=' +
          (s.marginPct != null ? s.marginPct + '%' : 'n/a') +
          '  tal=$' +
          (s.talent != null ? s.talent : '?') +
          '  rank#' +
          (s.rank != null ? s.rank : '?') +
          rd +
          '  ' +
          (s.health || '')
      );
    }
  }
}

function makeFreshRunnerContext(quietVm) {
  const ctx = createVmContext(quietVm);
  loadSim(ctx);
  installRunner(ctx);
  return ctx;
}

function main() {
  const quietVm = process.env.VALIDATION_QUIET !== '0' && process.env.VALIDATION_QUIET !== 'false';
  const args = parseArgs(process.argv.slice(2));
  const { jsonOut, jsonExplicit, markets, startYear, seed, seedStart, batchRuns, applyCut, cutFormat } = args;

  if (batchRuns != null && batchRuns >= 2 && applyCut) {
    runBatchValidation(quietVm, args);
    return;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    startYear,
    seed,
    markets,
    cutStationComparison: [],
    cutScenario: applyCut ? { format: cutFormat, note: 'Salaries on cut station ×0.12, then seedRev+recalc before trajectory' } : null,
    interpretation: {
      layerToggle:
        'window.__WL_TALENT_PERFORMANCE_LAYER__ === false disables talent franchise score effects in recalc (ceiling + momentum stickiness); omitted/true = on.',
      sharedAdvance:
        'genMarketMP + advance to startYear always runs with the layer OFF so RNG and station lineup match between A/B; only forward advTurns use the chosen layer.',
      vmIsolation:
        'Each scenario runs in a fresh vm context (reload legacy+harness) so global legacy state cannot leak between OFF/ON/cut runs.',
      checkpoints:
        'Half-years: start at end of startYear P2; +1y = +2 advTurn; +3y = +6 cumulative; +5y = +10 cumulative from that baseline.',
      cutStationVerdict:
        'Compares layer ON no-cut vs layer ON+cut for the tracked format station only. Labels: no_meaningful_effect | mild_erosion | meaningful_erosion | severe_erosion | counterintuitive_improvement | insufficient_data. See cutStationComparison[].thresholdsUsed and verdictDetail.',
    },
    runs: [],
  };

  console.log('Talent performance validation (A/B layer + optional cut)');
  console.log('startYear=' + startYear + '  seed=' + seed + '  markets=' + markets.join(', '));
  console.log('');

  for (const marketId of markets) {
    const baseOpts = { marketId, seed, startYear, applyCut: false, cutFormatKey: cutFormat };
    const ctxOff = makeFreshRunnerContext(quietVm);
    const off = vm.runInContext(`__validateTalentPerformanceRun(${JSON.stringify({ ...baseOpts, layerOn: false })})`, ctxOff);
    const ctxOn = makeFreshRunnerContext(quietVm);
    const on = vm.runInContext(`__validateTalentPerformanceRun(${JSON.stringify({ ...baseOpts, layerOn: true })})`, ctxOn);
    addRankDeltasFromStart(off);
    addRankDeltasFromStart(on);
    report.runs.push({ variant: 'layer_off', marketId, result: off });
    report.runs.push({ variant: 'layer_on', marketId, result: on });

    printCheckpointTable(marketId.toUpperCase() + ' — layer OFF', off);
    printCheckpointTable(marketId.toUpperCase() + ' — layer ON', on);

    if (applyCut) {
      const ctxCut = makeFreshRunnerContext(quietVm);
      const onCut = vm.runInContext(
        `__validateTalentPerformanceRun(${JSON.stringify({ marketId, seed, startYear, applyCut: true, cutFormatKey: cutFormat, layerOn: true })})`,
        ctxCut
      );
      addRankDeltasFromStart(onCut);
      report.runs.push({ variant: 'layer_on_cut', marketId, result: onCut });
      printCheckpointTable(marketId.toUpperCase() + ' — layer ON + talent cut (' + cutFormat + ')', onCut);

      const comp = buildCutStationComparison(on, onCut, marketId, cutFormat);
      report.cutStationComparison.push(comp);
      printCutStationDeltaTable('Cut station delta (ON vs ON+cut) — ' + marketId.toUpperCase(), comp);
    }
  }

  if (applyCut && report.cutStationComparison.length) {
    report.cutStationSummary = report.cutStationComparison.map(summarizeCutStationForReport);
    report.cutStationAggregateByFormat = {
      [cutFormat]: aggregateFormatShareAtPlus5y(report.cutStationSummary),
    };
    report.fullValidationConclusion = readinessConclusion(report.cutStationSummary, cutFormat);
    printFullValidationSummary(report, cutFormat);
  }

  if (jsonOut) {
    const dir = path.dirname(jsonOut);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');
    console.log('');
    console.log('Wrote JSON: ' + jsonOut);
  }
}

main();
