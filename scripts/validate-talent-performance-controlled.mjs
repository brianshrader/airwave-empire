#!/usr/bin/env node
/**
 * Controlled station-level validation for the talent-performance layer.
 *
 * Reduces market branching noise by:
 * - Setting G._wlHarnessDeterministic after the shared advance (no rival AI, no random events,
 *   no rival reformats, etc. — same pipeline as other harnesses; see legacy advTurn simQuiet).
 * - Scoping the layer to the tracked station only via window.__WL_TALENT_PERF_VALIDATION_STATION_ID__
 *   so competitors are not re-rated by the layer during the experiment.
 *
 * Three paths for the selected station (same seed, market, checkpoint ladder):
 *   on_no_cut — layer ON (scoped), no salary cut
 *   on_cut    — layer ON (scoped), sharp cut on that station
 *   off_cut   — layer OFF globally, same cut
 *
 *   node scripts/validate-talent-performance-controlled.mjs
 *   node scripts/validate-talent-performance-controlled.mjs --markets=chicago,seattle,newyork --formats=top40_chr,news_talk
 *   node scripts/validate-talent-performance-controlled.mjs --json=tmp/talent_performance_controlled.json
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
const defaultJsonOut = path.join(root, 'tmp', 'talent_performance_controlled.json');

const DEFAULT_MARKETS = ['chicago', 'newyork', 'seattle'];
const DEFAULT_FORMATS = ['top40_chr', 'news_talk'];

/** Tracked format buckets → legacy format ids (first match by share order). */
const FORMAT_PICK = {
  top40_chr: ['TOP40', 'CHR'],
  news_talk: ['NEWS_TALK', 'ALL_NEWS'],
};

const FORMAT_LABEL = {
  top40_chr: 'Top 40 / CHR',
  news_talk: 'News / Talk',
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

function installControlledRunner(ctx) {
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
      talentFranchise: s.talentFranchise != null && Number.isFinite(s.talentFranchise) ? Math.round(s.talentFranchise * 1000) / 1000 : null,
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
   * layerMode: 'on_no_cut' | 'on_cut' | 'off_cut'
   * After shared advance: G._wlHarnessDeterministic = true for forward path.
   */
  window.__validateTalentPerformanceControlledRun = function (opts) {
    opts = opts || {};
    var marketId = opts.marketId || 'chicago';
    var seed = opts.seed != null ? opts.seed : 424242;
    var layerMode = opts.layerMode || 'on_no_cut';
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
        window.__WL_TALENT_PERF_VALIDATION_STATION_ID__ = undefined;
      }

      ACTIVE_MARKET = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      G = genMarketMP('1985');
      MP.mode = 'solo';
      MP.isHost = false;
      if (MP.players) MP.players = [];

      var adv = advanceGToYearPeriod(startYear, 2, maxAdvance);
      if (!adv.ok) {
        return {
          ok: false,
          marketId: marketId,
          seed: seed,
          layerMode: layerMode,
          error: adv.error,
          at: adv.at,
          steps: adv.steps,
        };
      }

      var trackedIds = pickTrackedStationIds(G);
      var focusId = trackedIds[cutFormatKey];
      if (!focusId) {
        return { ok: false, marketId: marketId, layerMode: layerMode, error: 'no_station_for_format', cutFormatKey: cutFormatKey };
      }
      var focusStation = G.stations.find(function (x) {
        return x.id === focusId;
      });

      G._wlHarnessDeterministic = true;

      if (typeof window !== 'undefined') {
        if (layerMode === 'off_cut') {
          window.__WL_TALENT_PERFORMANCE_LAYER__ = false;
          window.__WL_TALENT_PERF_VALIDATION_STATION_ID__ = undefined;
        } else {
          window.__WL_TALENT_PERFORMANCE_LAYER__ = undefined;
          window.__WL_TALENT_PERF_VALIDATION_STATION_ID__ = focusId;
        }
      }

      var applyCut = layerMode === 'on_cut' || layerMode === 'off_cut';
      var salariesCut = 0;
      if (applyCut && focusStation) {
        salariesCut = applySharpTalentCut(focusStation);
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
      var ci, cj, need, lbl, snap, prevAdv;
      prevAdv = 0;
      for (ci = 0; ci < checkpoints.length; ci++) {
        need = checkpoints[ci].advFromPrevious;
        lbl = checkpoints[ci].label;
        for (cj = 0; cj < need; cj++) {
          advTurn();
        }
        snap = stationSnapshot(G, focusId);
        rows.push({
          checkpoint: lbl,
          labelHuman:
            lbl === 'start'
              ? 'Start (deterministic forward; layer per scenario; cut+seedRev/recalc if cut)'
              : lbl === 'plus_1y'
                ? '+1 year (2 half-periods)'
                : lbl === 'plus_3y'
                  ? '+3 years (6 half-periods from start)'
                  : '+5 years (10 half-periods from start)',
          year: G.year,
          period: G.period,
          advTurnsFromBaseline: prevAdv + need,
          snapshot: snap,
        });
        prevAdv += need;
      }

      return {
        ok: true,
        marketId: marketId,
        seed: seed,
        layerMode: layerMode,
        talentLayerFlag:
          layerMode === 'off_cut' ? 'off(false)' : 'on(scoped to focus station)',
        cutFormatKey: cutFormatKey,
        focusStationId: focusId,
        focusCallLetters: focusStation ? focusStation.callLetters : null,
        applyCut: applyCut,
        salariesSlashed: salariesCut,
        deterministicForward: true,
        scopedLayerStationId: layerMode === 'off_cut' ? null : focusId,
        advanceStepsToStart: adv.steps,
        checkpoints: rows,
      };
    } finally {
      ui.restore();
      Math.random = origR;
      if (typeof window !== 'undefined') {
        window.__WL_TALENT_PERFORMANCE_LAYER__ = undefined;
        window.__WL_TALENT_PERF_VALIDATION_STATION_ID__ = undefined;
      }
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
  const formats = [];
  let startYear = 2005;
  let seed = 424242;
  for (const a of argv) {
    if (a === '--json') {
      jsonExplicit = true;
      jsonOut = defaultJsonOut;
    } else if (a.startsWith('--json=')) {
      jsonExplicit = true;
      jsonOut = a.slice('--json='.length);
    } else if (a.startsWith('--markets=')) {
      markets.push(...a.slice('--markets='.length).split(',').map((x) => x.trim()).filter(Boolean));
    } else if (a.startsWith('--formats=')) {
      formats.push(...a.slice('--formats='.length).split(',').map((x) => x.trim()).filter(Boolean));
    } else if (a.startsWith('--start-year=')) {
      startYear = parseInt(a.slice('--start-year='.length), 10) || 2005;
    } else if (a.startsWith('--seed=')) {
      seed = parseInt(a.slice('--seed='.length), 10) || 424242;
    }
  }
  return {
    jsonOut: jsonExplicit ? jsonOut || defaultJsonOut : null,
    markets: markets.length ? markets : DEFAULT_MARKETS,
    formats: formats.length ? formats : DEFAULT_FORMATS,
    startYear,
    seed,
  };
}

function findCp(run, label) {
  return run?.checkpoints?.find((r) => r.checkpoint === label) || null;
}

function snap(run, label) {
  return findCp(run, label)?.snapshot || null;
}

function deltaNum(a, b) {
  if (a == null || b == null) return null;
  return a - b;
}

function buildCheckpointRows(onNo, onCut, offCut, marketId, cutFormatKey) {
  const labels = ['start', 'plus_1y', 'plus_3y', 'plus_5y'];
  const rows = [];
  for (const cp of labels) {
    const a = snap(onNo, cp);
    const b = snap(onCut, cp);
    const c = snap(offCut, cp);
    rows.push({
      checkpoint: cp,
      marketId,
      cutFormatKey,
      onNoCut: a,
      onCut: b,
      offCut: c,
      // a=onNoCut, b=onCut, c=offCut — all deltas are (minuend − subtrahend) per label
      delta_onCut_vs_onNo: {
        sharePct: deltaNum(a?.sharePct, b?.sharePct),
        rev: deltaNum(a?.rev, b?.rev),
        marginPct: deltaNum(a?.marginPct, b?.marginPct),
        rank: deltaNum(a?.rank, b?.rank),
        talent: deltaNum(a?.talent, b?.talent),
      },
      delta_offCut_vs_onNo: {
        sharePct: deltaNum(a?.sharePct, c?.sharePct),
        rev: deltaNum(a?.rev, c?.rev),
        marginPct: deltaNum(a?.marginPct, c?.marginPct),
        rank: deltaNum(a?.rank, c?.rank),
        talent: deltaNum(a?.talent, c?.talent),
      },
      delta_onCut_vs_offCut: {
        sharePct: deltaNum(c?.sharePct, b?.sharePct),
        rev: deltaNum(c?.rev, b?.rev),
        marginPct: deltaNum(c?.marginPct, b?.marginPct),
        rank: deltaNum(c?.rank, b?.rank),
        talent: deltaNum(c?.talent, b?.talent),
      },
    });
  }
  return rows;
}

/** Success signals (reporting). Share deltas are onNo − onCut (positive ⇒ no-cut ahead on share). */
function successSignals(rows) {
  const r5 = rows.find((x) => x.checkpoint === 'plus_5y');
  const r1 = rows.find((x) => x.checkpoint === 'plus_1y');
  const r0 = rows.find((x) => x.checkpoint === 'start');
  const d = r5?.delta_onCut_vs_onNo || {};
  const dOff = r5?.delta_onCut_vs_offCut || {};
  const EPS = 0.02;

  const onCutWorseThanOnNoShare =
    d.sharePct != null && d.sharePct > EPS;
  const onCutWorseThanOnNoRank =
    d.rank != null && d.rank < 0;
  const onCutWorseThanOnNoRev = d.rev != null && d.rev > EPS;

  const onCutWorseThanOffCutShare =
    dOff.sharePct != null && dOff.sharePct > EPS;
  const onCutWorseThanOffCutRank = dOff.rank != null && dOff.rank < 0;

  const d1s = r1?.delta_onCut_vs_onNo?.sharePct;
  const d5s = r5?.delta_onCut_vs_onNo?.sharePct;
  const gradualShareWidening =
    d1s != null && d5s != null && d5s - d1s > 0.03;

  return {
    at_plus_5y: {
      onCut_vs_onNo_shareAdvantageToNoCut: d.sharePct,
      onCut_vs_onNo_rankStepsWorseForCut: d.rank,
      onCut_vs_onNo_revAdvantageToNoCut: d.rev,
      onCutWorseThanOnNo_byShare: onCutWorseThanOnNoShare,
      onCutWorseThanOnNo_byRank: onCutWorseThanOnNoRank,
      onCutWorseThanOnNo_byRev: onCutWorseThanOnNoRev,
      onCut_vs_offCut_share: dOff.sharePct,
      onCutWorseThanOffCut_byShare: onCutWorseThanOffCutShare,
      onCutWorseThanOffCut_byRank: onCutWorseThanOffCutRank,
    },
    gradual: {
      shareDisadvantageCut_vs_noCut_abs_at_plus_1y: r1 ? Math.abs(r1.delta_onCut_vs_onNo?.sharePct || 0) : null,
      shareDisadvantageCut_vs_noCut_abs_at_plus_5y: r5 ? Math.abs(r5.delta_onCut_vs_onNo?.sharePct || 0) : null,
      gradualShareWidening,
    },
  };
}

function pad(s, w) {
  const t = s == null ? '' : String(s);
  return t.length >= w ? t.slice(0, w) : t + ' '.repeat(w - t.length);
}

function printCaseTable(title, rows) {
  console.log('');
  console.log('══ ' + title + ' ══');
  console.log(
    pad('cp', 10) +
      pad('path', 10) +
      pad('sh%', 7) +
      pad('rev', 11) +
      pad('mg%', 7) +
      pad('rk', 4) +
      pad('tal', 8) +
      pad('health', 14)
  );
  console.log('-'.repeat(88));
  for (const r of rows) {
    let label = r.checkpoint;
    for (const path of ['onNoCut', 'onCut', 'offCut']) {
      const sn = r[path];
      console.log(
        pad(label, 10) +
          pad(path, 10) +
          pad(sn?.sharePct != null ? sn.sharePct.toFixed(2) : '', 7) +
          pad(sn?.rev != null ? sn.rev : '', 11) +
          pad(sn?.marginPct != null ? sn.marginPct.toFixed(1) : '', 7) +
          pad(sn?.rank != null ? sn.rank : '', 4) +
          pad(sn?.talent != null ? sn.talent : '', 8) +
          pad(sn?.health || '', 14)
      );
      label = '';
    }
    console.log(
      pad('', 10) +
        pad('Δ onNo−onCut', 14) +
        pad(
          r.delta_onCut_vs_onNo?.sharePct != null ? r.delta_onCut_vs_onNo.sharePct.toFixed(2) + 'pp' : '',
          7
        ) +
        pad(r.delta_onCut_vs_onNo?.rev != null ? String(r.delta_onCut_vs_onNo.rev) : '', 11) +
        pad(r.delta_onCut_vs_onNo?.marginPct != null ? r.delta_onCut_vs_onNo.marginPct.toFixed(1) : '', 7) +
        pad(r.delta_onCut_vs_onNo?.rank != null ? String(r.delta_onCut_vs_onNo.rank) : '', 4) +
        pad(r.delta_onCut_vs_onNo?.talent != null ? String(r.delta_onCut_vs_onNo.talent) : '', 8) +
        pad('', 14)
    );
    console.log(
      pad('', 10) +
        pad('Δ onNo−offCut', 14) +
        pad(
          r.delta_offCut_vs_onNo?.sharePct != null ? r.delta_offCut_vs_onNo.sharePct.toFixed(2) + 'pp' : '',
          7
        ) +
        pad(r.delta_offCut_vs_onNo?.rev != null ? String(r.delta_offCut_vs_onNo.rev) : '', 11) +
        pad(r.delta_offCut_vs_onNo?.marginPct != null ? r.delta_offCut_vs_onNo.marginPct.toFixed(1) : '', 7) +
        pad(r.delta_offCut_vs_onNo?.rank != null ? String(r.delta_offCut_vs_onNo.rank) : '', 4) +
        pad(r.delta_offCut_vs_onNo?.talent != null ? String(r.delta_offCut_vs_onNo.talent) : '', 8) +
        pad('', 14)
    );
    console.log(
      pad('', 10) +
        pad('Δ offCut−onCut', 14) +
        pad(
          r.delta_onCut_vs_offCut?.sharePct != null ? r.delta_onCut_vs_offCut.sharePct.toFixed(2) + 'pp' : '',
          7
        ) +
        pad(r.delta_onCut_vs_offCut?.rev != null ? String(r.delta_onCut_vs_offCut.rev) : '', 11) +
        pad(r.delta_onCut_vs_offCut?.marginPct != null ? r.delta_onCut_vs_offCut.marginPct.toFixed(1) : '', 7) +
        pad(r.delta_onCut_vs_offCut?.rank != null ? String(r.delta_onCut_vs_offCut.rank) : '', 4) +
        pad(r.delta_onCut_vs_offCut?.talent != null ? String(r.delta_onCut_vs_offCut.talent) : '', 8) +
        pad('', 14)
    );
    console.log('');
  }
}

function makeFreshContext(quietVm) {
  const ctx = createVmContext(quietVm);
  loadSim(ctx);
  installControlledRunner(ctx);
  return ctx;
}

function main() {
  const quietVm = process.env.VALIDATION_QUIET !== '0' && process.env.VALIDATION_QUIET !== 'false';
  const { jsonOut, markets, formats, startYear, seed } = parseArgs(process.argv.slice(2));

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'talent_performance_controlled',
    startYear,
    seed,
    markets,
    formats,
    deterministicForward: true,
    layerScope: 'single_station_when_layer_on',
    interpretation: {
      deterministicForward:
        'After the shared advance to startYear P2, G._wlHarnessDeterministic=true so advTurn skips rival AI, random events, rival reformats, talent events, etc. (legacy simQuiet path).',
      scopedLayer:
        'When layer is ON, window.__WL_TALENT_PERF_VALIDATION_STATION_ID__ limits talent franchise ratings effects to the tracked station; competitors behave as if the layer were off for them.',
      talentFranchiseScore:
        'Hidden station.talentFranchise (0–1) drifts from talent spend vs expected after each seedRev; drives stickiness/ceiling in recalc — not a direct adequacy→rating multiplier.',
      paths:
        'on_no_cut = layer ON scoped, no cut; on_cut = layer ON scoped + salary cut; off_cut = layer OFF globally + same cut. Compare whether erosion is layer-attributable (on_cut vs off_cut) vs baseline drift (off_cut vs on_no).',
      successCriteriaHint:
        'Look for on_cut worse than on_no on share/rank/rev by +5y, on_cut worse than off_cut (layer amplifies cut pain), and widening gap vs +1y (gradual). Personality-heavy formats should show larger layer deltas than weak-personality formats in aggregate.',
    },
    cases: [],
  };

  console.log('Talent performance — CONTROLLED station validation (deterministic forward + scoped layer)');
  console.log('startYear=' + startYear + '  seed=' + seed);
  console.log('markets=' + markets.join(', ') + '  formats=' + formats.map((f) => FORMAT_LABEL[f] || f).join(', '));
  console.log('');

  for (const marketId of markets) {
    for (const cutFormatKey of formats) {
      if (!FORMAT_PICK[cutFormatKey]) {
        console.warn('Skip unknown format key:', cutFormatKey);
        continue;
      }
      const base = { marketId, seed, startYear, cutFormatKey };
      const ctxA = makeFreshContext(quietVm);
      const onNo = vm.runInContext(`__validateTalentPerformanceControlledRun(${JSON.stringify({ ...base, layerMode: 'on_no_cut' })})`, ctxA);
      const ctxB = makeFreshContext(quietVm);
      const onCut = vm.runInContext(`__validateTalentPerformanceControlledRun(${JSON.stringify({ ...base, layerMode: 'on_cut' })})`, ctxB);
      const ctxC = makeFreshContext(quietVm);
      const offCut = vm.runInContext(`__validateTalentPerformanceControlledRun(${JSON.stringify({ ...base, layerMode: 'off_cut' })})`, ctxC);

      const rows = buildCheckpointRows(onNo, onCut, offCut, marketId, cutFormatKey);
      const sig = successSignals(rows);
      const caseObj = {
        marketId,
        cutFormatKey,
        formatLabel: FORMAT_LABEL[cutFormatKey] || cutFormatKey,
        ok: !!(onNo?.ok && onCut?.ok && offCut?.ok),
        focusStationId: onNo?.focusStationId ?? onCut?.focusStationId,
        focusCallLetters: onNo?.focusCallLetters ?? onCut?.focusCallLetters,
        runs: {
          on_no_cut: onNo,
          on_cut: onCut,
          off_cut: offCut,
        },
        checkpointComparison: rows,
        successSignals: sig,
      };
      report.cases.push(caseObj);

      const title = marketId.toUpperCase() + ' — ' + (FORMAT_LABEL[cutFormatKey] || cutFormatKey);
      if (!caseObj.ok) {
        console.log('');
        console.log('FAIL ' + title);
        if (!onNo?.ok) console.log('  on_no_cut:', onNo?.error || onNo);
        if (!onCut?.ok) console.log('  on_cut:', onCut?.error || onCut);
        if (!offCut?.ok) console.log('  off_cut:', offCut?.error || offCut);
        continue;
      }
      printCaseTable(title + ' — ' + (onNo.focusCallLetters || ''), rows);
      console.log('  successSignals (+5y):', JSON.stringify(sig.at_plus_5y));
      console.log('  gradual:', JSON.stringify(sig.gradual));
    }
  }

  const absShareByFormat = {};
  for (const c of report.cases) {
    if (!c.ok) continue;
    const fk = c.cutFormatKey;
    const r5 = c.checkpointComparison?.find((x) => x.checkpoint === 'plus_5y');
    const d = r5?.delta_onCut_vs_onNo?.sharePct;
    if (d == null) continue;
    if (!absShareByFormat[fk]) absShareByFormat[fk] = { sumAbs: 0, n: 0 };
    absShareByFormat[fk].sumAbs += Math.abs(d);
    absShareByFormat[fk].n += 1;
  }
  report.personalitySensitivityBatch = {};
  for (const fk of Object.keys(absShareByFormat)) {
    const { sumAbs, n } = absShareByFormat[fk];
    report.personalitySensitivityBatch[fk] = {
      meanAbsShareDelta_onNo_minus_onCut_pp_at_plus_5y: n ? sumAbs / n : null,
      n,
    };
  }
  console.log('');
  console.log('Batch mean |onNo−onCut| share (pp) at +5y by format:', JSON.stringify(report.personalitySensitivityBatch));

  if (jsonOut) {
    const dir = path.dirname(jsonOut);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');
    console.log('');
    console.log('Wrote JSON: ' + jsonOut);
  }
}

main();
