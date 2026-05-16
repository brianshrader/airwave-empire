#!/usr/bin/env node
/**
 * Public NCE tier + public-radio validation (Phase 1, public formats only).
 *
 * ## 1) Career mode (primary)
 * Start `genMarketMP('1970')`, advance to fall of each checkpoint year, re-apply institutional
 * tier for that calendar year, `recalc`, snapshot PUBLIC_NEWS / PUBLIC_CLASSICAL / PUBLIC_ECLECTIC / PUBLIC_JAZZ.
 * Checkpoints: 1975, 1980, 1990, 2000, 2010, 2020, 2026.
 *
 * ## 2) Snapshot mode (secondary)
 * `genMarket('under')` with temporary `startYear=2026` — cold modern dial.
 *
 * **Snapshot variant** (`--snapshot-variant=normal|parity|both`):
 * - `normal` (default): `sc.idx` intact — Underdog player slot + penalties (matches solo Underdog).
 * - `parity`: clear `sc.idx` during `genMarket` (same trick as `genMarketMP`) — all-AI dial, no weakened player slot; compare to career’s rival-only assumption.
 * - `both`: run each seed twice and report both (diagnostic for cold-start vs generator artifact).
 *
 * Tuning: `window.__PUBLIC_RADIO_TUNING__` — `baseline` vs `tuned` (see `publicRadioTuningBlend` in legacy.js).
 *
 * ## 3) Flagship tier path check (harness only — not a playable market)
 * `--flagship-tier-probe` injects temporary `MARKETS[__harness_flagship_probe_*]` rows (synthetic ids),
 * scans until `computePublicNceTier` returns `flagship` for PUBLIC_NEWS @ 2026, then prints `id`, `u`, `S`, `C`.
 * Confirms flagship logic without further global threshold changes.
 * For real WUNC/MPR-style incidence: add **Raleigh**, **Minneapolis**, etc. later with `eduIndex` + `publicCivicIndex`
 * in `MARKETS` — do not tune globally from Seattle/NY/LA/Chicago alone.
 *
 * Usage:
 *   node scripts/validate-public-nce-tier.mjs
 *   node scripts/validate-public-nce-tier.mjs --flagship-tier-probe
 *   node scripts/validate-public-nce-tier.mjs --runs=40 --mode=compare
 *   node scripts/validate-public-nce-tier.mjs --harness=snapshot --runs=80 --mode=tuned
 *   node scripts/validate-public-nce-tier.mjs --harness=snapshot --snapshot-variant=both --runs=40 --mode=tuned
 *   node scripts/validate-public-nce-tier.mjs --harness=both --runs=30 --snapshot-runs=70 --mode=compare
 *
 * Env:
 *   PUBLIC_NCE_HARNESS_MARKETS=seattle,newyork,...   (comma-separated market ids)
 *   VALIDATION_QUIET=0                               (show legacy console noise)
 *
 * Output:
 *   tmp/public_nce_tier_validation.csv   (rows from both harnesses when enabled; `snapshotVariant` blank for career, `normal`|`parity` for snapshot)
 *   Console: summaries, rank histograms, tier distribution, validation Q&A
 *   Console: Nashville `computePublicStationTargetCount` vs startYear 1978–2026 (third-public probe)
 *
 * Requires: src/legacy.js + src/marketSimHarness.js
 */
/* eslint-disable no-console */

import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import vm from 'vm';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outCsv = path.join(root, 'tmp', 'public_nce_tier_validation.csv');

const DEFAULT_MARKETS = ['seattle', 'newyork', 'losangeles', 'chicago', 'atlanta', 'nashville', 'wichita'];
const CAREER_CHECKPOINTS = [1975, 1980, 1990, 2000, 2010, 2020, 2026];
const RANK_HIST_BINS = [
  { key: 'rk1', label: 'rank 1', test: (r) => r === 1 },
  { key: 'rk2', label: 'rank 2', test: (r) => r === 2 },
  { key: 'rk3', label: 'rank 3', test: (r) => r === 3 },
  { key: 'rk4_5', label: 'rank 4–5', test: (r) => r === 4 || r === 5 },
  { key: 'rk6_10', label: 'rank 6–10', test: (r) => r != null && r >= 6 && r <= 10 },
  { key: 'rk11_20', label: 'rank 11–20', test: (r) => r != null && r >= 11 && r <= 20 },
  { key: 'rk21p', label: 'rank 21+', test: (r) => r == null || r > 20 },
];

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
    dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() {
      return null;
    },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    closest() {
      return null;
    },
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
  addEventListener() {},
  removeEventListener() {},
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

function parseArgs(argv) {
  let runs = 35;
  let snapshotRuns = 70;
  let harness = 'career';
  let mode = 'compare';
  let careerMaxSteps = 22000;
  let flagshipTierProbe = false;
  let snapshotVariant = 'normal';
  for (const a of argv) {
    if (a === '--flagship-tier-probe') flagshipTierProbe = true;
    else if (a.startsWith('--runs=')) runs = Math.max(1, parseInt(a.slice('--runs='.length), 10) || 35);
    else if (a.startsWith('--snapshot-runs='))
      snapshotRuns = Math.max(1, parseInt(a.slice('--snapshot-runs='.length), 10) || 70);
    else if (a.startsWith('--harness=')) harness = a.slice('--harness='.length).toLowerCase();
    else if (a.startsWith('--mode=')) mode = a.slice('--mode='.length).toLowerCase();
    else if (a.startsWith('--career-max-steps='))
      careerMaxSteps = Math.max(500, parseInt(a.slice('--career-max-steps='.length), 10) || 22000);
    else if (a.startsWith('--snapshot-variant='))
      snapshotVariant = a.slice('--snapshot-variant='.length).toLowerCase();
  }
  if (!['tuned', 'baseline', 'compare', 'both'].includes(mode)) mode = 'compare';
  if (mode === 'both') mode = 'compare';
  if (!['career', 'snapshot', 'both'].includes(harness)) harness = 'career';
  if (!['normal', 'parity', 'both'].includes(snapshotVariant)) snapshotVariant = 'normal';
  return { runs, snapshotRuns, harness, mode, careerMaxSteps, flagshipTierProbe, snapshotVariant };
}

function parseMarketsFromEnv() {
  const raw = process.env.PUBLIC_NCE_HARNESS_MARKETS;
  if (!raw || !String(raw).trim()) return DEFAULT_MARKETS.slice();
  return String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function installHarness(ctx, careerMaxSteps) {
  const maxS = Number(careerMaxSteps) || 22000;
  const checkpointsJson = JSON.stringify(CAREER_CHECKPOINTS);
  const code = `
(function () {
  var CHECKPOINTS = ${checkpointsJson};
  var CAREER_MAX_STEPS = ${maxS};

  function snapPub(st, rk, nTot) {
    if (!st) return null;
    var share = st.rat && typeof st.rat.share === 'number' ? st.rat.share : null;
    var aqh = st.rat && typeof st.rat.aqh === 'number' ? st.rat.aqh : null;
    var r = rk.rankById[st.id];
    return {
      tierStored: st._nceTier || 'typical',
      tierEffect: publicNceTierEffect(st),
      rank: r,
      nStations: nTot,
      share: share,
      aqh: aqh,
      top10: share != null && r != null && r <= 10,
      top5: share != null && r != null && r <= 5,
      top3: share != null && r != null && r <= 3,
      first: r === 1,
      second: r === 2,
    };
  }

  function maxCommercialShare(G) {
    var maxComm = 0;
    var i;
    for (i = 0; i < G.stations.length; i++) {
      var c = G.stations[i];
      if (!c || c._bpSlotDeferred || c.isPublic) continue;
      var shc = c.rat && typeof c.rat.share === 'number' ? c.rat.share : 0;
      if (shc > maxComm) maxComm = shc;
    }
    return maxComm;
  }

  window.__publicNceHarnessSnapshotRun = function (marketId, seed, tuningMode, variant) {
    variant = variant || 'normal';
    var tuning = tuningMode === 'baseline' ? 'baseline' : 'tuned';
    window.__PUBLIC_RADIO_TUNING__ = tuning;
    var origR = Math.random;
    var s = seed >>> 0;
    Math.random = function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    try {
      var ui = window._harnessPatchTimersAndUi();
      try {
        ACTIVE_MARKET = marketId;
        syncMarketPopToMarket(marketId);
        var scU = SC.find(function (x) { return x.id === 'under'; });
        if (!scU) return { ok: false, error: 'SC under missing' };
        var prevSY = scU.startYear;
        var prevIdx = scU.idx;
        scU.startYear = 2026;
        if (variant === 'parity') {
          scU.idx = [];
        }
        var Glocal;
        try {
          Glocal = genMarket('under');
        } finally {
          if (prevSY === undefined) delete scU.startYear;
          else scU.startYear = prevSY;
          scU.idx = prevIdx;
        }
        G = Glocal;
        var news = null;
        var klass = null;
        var eclectic = null;
        var jazz = null;
        var i;
        for (i = 0; i < G.stations.length; i++) {
          var st = G.stations[i];
          if (!st || st._bpSlotDeferred) continue;
          if (st.isPublic && st.format === 'PUBLIC_NEWS') news = st;
          if (st.isPublic && st.format === 'PUBLIC_CLASSICAL') klass = st;
          if (st.isPublic && st.format === 'PUBLIC_ECLECTIC') eclectic = st;
          if (st.isPublic && st.format === 'PUBLIC_JAZZ') jazz = st;
        }
        var rk = rankStationsByShareCompetition(G.stations);
        var nTot = rk.n || 0;
        var sySnap = G.scenario && G.scenario.startYear != null ? G.scenario.startYear : G.year;
        var pubN = 0;
        for (i = 0; i < G.stations.length; i++) {
          var st2 = G.stations[i];
          if (st2 && st2.isPublic && !st2._bpSlotDeferred) pubN++;
        }
        return {
          ok: true,
          harness: 'snapshot',
          snapshotVariant: variant,
          marketId: marketId,
          seed: seed,
          tuningMode: tuning,
          checkpointYear: 2026,
          year: G.year,
          period: G.period,
          advanceSteps: 0,
          news: snapPub(news, rk, nTot),
          classical: snapPub(klass, rk, nTot),
          eclectic: snapPub(eclectic, rk, nTot),
          jazz: snapPub(jazz, rk, nTot),
          publicStationCount: pubN,
          targetPublicCount: computePublicStationTargetCount(marketId, sySnap),
          maxCommercialShare: maxCommercialShare(G),
        };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      } finally {
        ui.restore();
      }
    } finally {
      Math.random = origR;
    }
  };

  window.__publicNceHarnessCareerRun = function (marketId, seed, tuningMode) {
    var tuning = tuningMode === 'baseline' ? 'baseline' : 'tuned';
    window.__PUBLIC_RADIO_TUNING__ = tuning;
    var origR = Math.random;
    var s = seed >>> 0;
    Math.random = function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    try {
      var ui = window._harnessPatchTimersAndUi();
      try {
        ACTIVE_MARKET = marketId;
        syncMarketPopToMarket(marketId);
        G = genMarketMP('1970');
        MP.mode = 'solo';
        MP.isHost = false;
        if (MP.players) MP.players = [];
        var rows = [];
        var ci;
        for (ci = 0; ci < CHECKPOINTS.length; ci++) {
          var y = CHECKPOINTS[ci];
          var adv = advanceGToYearPeriod(y, 2, CAREER_MAX_STEPS);
          if (!adv.ok) {
            return {
              ok: false,
              harness: 'career',
              marketId: marketId,
              seed: seed,
              tuningMode: tuning,
              error: 'advance_' + y,
              at: adv.at,
              steps: adv.steps,
              checkpoint: y,
              partialRows: rows,
            };
          }
          var news = null;
          var klass = null;
          var eclectic = null;
          var jazz = null;
          var i;
          for (i = 0; i < G.stations.length; i++) {
            var st = G.stations[i];
            if (!st || st._bpSlotDeferred) continue;
            if (st.isPublic && st.format === 'PUBLIC_NEWS') news = st;
            if (st.isPublic && st.format === 'PUBLIC_CLASSICAL') klass = st;
            if (st.isPublic && st.format === 'PUBLIC_ECLECTIC') eclectic = st;
            if (st.isPublic && st.format === 'PUBLIC_JAZZ') jazz = st;
          }
          if (news) assignPublicNceTierToStation(news, marketId, y);
          if (klass) assignPublicNceTierToStation(klass, marketId, y);
          if (eclectic) assignPublicNceTierToStation(eclectic, marketId, y);
          if (jazz) assignPublicNceTierToStation(jazz, marketId, y);
          recalc(G.stations, G);
          var rk = rankStationsByShareCompetition(G.stations);
          var nTot = rk.n || 0;
          var pubN = 0;
          for (i = 0; i < G.stations.length; i++) {
            var st3 = G.stations[i];
            if (st3 && st3.isPublic && !st3._bpSlotDeferred) pubN++;
          }
          rows.push({
            checkpointYear: y,
            simYear: G.year,
            simPeriod: G.period,
            advanceStepsThisLeg: adv.steps,
            news: snapPub(news, rk, nTot),
            classical: snapPub(klass, rk, nTot),
            eclectic: snapPub(eclectic, rk, nTot),
            jazz: snapPub(jazz, rk, nTot),
            publicStationCount: pubN,
            targetPublicCount: computePublicStationTargetCount(marketId, y),
            maxCommercialShare: maxCommercialShare(G),
          });
        }
        return { ok: true, harness: 'career', marketId: marketId, seed: seed, tuningMode: tuning, rows: rows };
      } catch (e) {
        return { ok: false, harness: 'career', error: String(e && e.message ? e.message : e) };
      } finally {
        ui.restore();
      }
    } finally {
      Math.random = origR;
    }
  };
})();
`;
  vm.runInContext(code, ctx);
}

function loadSim(ctx, careerMaxSteps) {
  injectMarketEcologyIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  installHarness(ctx, careerMaxSteps);
}

function runSnapshot(ctx, marketId, seed, tuningMode, variant) {
  const v = variant === 'parity' ? 'parity' : 'normal';
  return vm.runInContext(
    `__publicNceHarnessSnapshotRun(${JSON.stringify(marketId)}, ${seed >>> 0}, ${JSON.stringify(tuningMode)}, ${JSON.stringify(v)})`,
    ctx
  );
}

function runCareer(ctx, marketId, seed, tuningMode) {
  return vm.runInContext(
    `__publicNceHarnessCareerRun(${JSON.stringify(marketId)}, ${seed >>> 0}, ${JSON.stringify(tuningMode)})`,
    ctx
  );
}

function sorted(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x)).map(Number);
  a.sort((p, q) => p - q);
  return a;
}

function quantile(sortedArr, q) {
  if (!sortedArr.length) return null;
  const pos = (sortedArr.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (pos - lo);
}

function summarizeShares(shares) {
  const s = sorted(shares);
  const n = s.length;
  if (!n) return { n: 0, mean: null, median: null, p90: null, max: null };
  const mean = s.reduce((a, b) => a + b, 0) / n;
  return {
    n,
    mean,
    median: quantile(s, 0.5),
    p90: quantile(s, 0.9),
    max: s[n - 1],
  };
}

function pct(count, total) {
  if (!total) return 0;
  return (100 * count) / total;
}

function seedFor(markets, mkt, r) {
  return (900000 + markets.indexOf(mkt) * 104729 + r * 7919) >>> 0;
}

function pushCsvRow(csvRows, parts) {
  csvRows.push(parts.join(','));
}

function csvHeader() {
  return [
    'harness',
    'tuningMode',
    'snapshotVariant',
    'marketId',
    'seed',
    'checkpointYear',
    'format',
    'tierStored',
    'tierEffect',
    'rank',
    'nStations',
    'share',
    'share_pct',
    'aqh',
    'top10',
    'top5',
    'top3',
    'rank1',
    'rank2',
    'simYear',
    'simPeriod',
    'advanceStepsSegment',
    'maxCommercialShare',
  ].join(',');
}

function rowFromSnap(harness, tuning, mkt, seed, ck, fmt, snap, maxComm, advSeg, simY, simP, snapshotVariantCsv) {
  if (!snap) return null;
  const sv =
    snapshotVariantCsv != null && String(snapshotVariantCsv).length ? String(snapshotVariantCsv) : '';
  return [
    harness,
    tuning,
    sv,
    mkt,
    seed,
    ck,
    fmt,
    snap.tierStored,
    snap.tierEffect,
    snap.rank != null ? String(snap.rank) : '',
    snap.nStations != null ? String(snap.nStations) : '',
    snap.share != null ? snap.share.toFixed(8) : '',
    snap.share != null ? (snap.share * 100).toFixed(4) : '',
    snap.aqh != null ? String(Math.round(snap.aqh)) : '',
    snap.top10 ? '1' : '0',
    snap.top5 ? '1' : '0',
    snap.top3 ? '1' : '0',
    snap.first ? '1' : '0',
    snap.second ? '1' : '0',
    simY != null ? String(simY) : '',
    simP != null ? String(simP) : '',
    advSeg != null ? String(advSeg) : '',
    maxComm != null ? maxComm.toFixed(8) : '',
  ];
}

/** @param {Record<string, number>} counts keyed by RANK_HIST_BINS.label */
function asciiHistogram(counts, total, width) {
  const w = width || 28;
  if (!total) return '  (no data)';
  const maxC = Math.max(...RANK_HIST_BINS.map((b) => counts[b.label] || 0), 1);
  const lines = [];
  for (const b of RANK_HIST_BINS) {
    const k = b.label;
    const c = counts[k] || 0;
    const barLen = Math.round((c / maxC) * w);
    const bar = '#'.repeat(barLen) + '·'.repeat(Math.max(0, w - barLen));
    lines.push(`  ${k.padEnd(12)} ${String(c).padStart(6)} (${pct(c, total).toFixed(1)}%) ${bar}`);
  }
  return lines.join('\n');
}

function careerKey(tuning, ck, mkt) {
  return `${tuning}|${ck}|${mkt}`;
}

/** Harness-only: prove `computePublicNceTier` can return flagship (no playable market; temp MARKETS keys). */
function runFlagshipTierProbe(ctx) {
  const probeSrc = `
(function () {
  var y0 = 2026;
  var base = {
    id: '',
    callPrefix: 'W',
    label: 'Harness flagship tier probe',
    region: 'Northeast',
    rankTier: 'mega',
    archetypeId: 'northeast_mega',
    pop: { '12-17': 100, '18-24': 100, '25-34': 100, '35-49': 100, '50-64': 100, '65+': 50 },
    revScale: 1,
    adxBonus: 0.02,
    amFreqs: ['660 AM'],
    fmFreqs: ['92.1 FM'],
    fmFacilityByFreq: { '92.1 FM': '100kw' },
    blackPop: 0.1,
    hispPop1970: 0.1,
    hispPop2000: 0.15,
    hispPop2020: 0.2,
    churchGoing: 0.4,
    countryBonus: 0,
    urbanBonus: 0.1,
    culture: { country: 0.02, urban: 0.1, newsTalk: 0.1, religion: 0, spanish: 0.05 },
    selectBlurb: 'headless tier probe only — not a playable market',
    fmPenBias: 0,
    fmMusicFragMult: 1,
    spokenWordAmResilience: 1,
    heritageAmResilience: 1,
    countryAmHoldout: 1,
    eduIndex: 1.32,
    publicCivicIndex: 1.17,
    teams: [],
  };
  var maxI = 300000;
  var best = { C: -1, id: null, u: null, S: null };
  for (var i = 0; i < maxI; i++) {
    var id = '__harness_flagship_probe_' + i;
    if (MARKETS[id]) continue;
    MARKETS[id] = Object.assign({}, base, { id: id });
    if (typeof window !== 'undefined') window.MARKETS = MARKETS;
    var edu = marketEduIndex(id);
    var civic = publicCivicIndexForMarket(id);
    var mkt = MARKETS[id];
    var rankTier = mkt.rankTier || 'medium';
    var tierNorm = rankTier === 'mega' ? 1 : rankTier === 'large' ? 0.8 : rankTier === 'medium' ? 0.5 : 0.28;
    var eduN = Math.max(0, Math.min(1, (edu - 0.88) / (1.24 - 0.88)));
    var civN = Math.max(0, Math.min(1, (civic - 0.92) / (1.12 - 0.92)));
    var eraN = _smoothstep(1985, 2010, y0) * 0.55 + _smoothstep(2010, 2026, y0) * 0.45;
    var S = 0.38 * eduN + 0.16 * civN + 0.28 * tierNorm + 0.18 * eraN;
    var u = publicNceTierQuantile01(id, 'PUBLIC_NEWS', y0);
    var C = 0.58 * S + 0.42 * u;
    if (C > best.C) best = { C: C, id: id, u: u, S: S, eduN: eduN, civN: civN };
    var tier = computePublicNceTier({ marketId: id, format: 'PUBLIC_NEWS', startYear: y0, blend01: 1 });
    if (tier === 'flagship') {
      return { ok: true, id: id, tier: tier, u: u, S: S, C: C, eduN: eduN, civN: civN, iterations: i + 1 };
    }
    delete MARKETS[id];
  }
  return { ok: false, error: 'no flagship in ' + maxI + ' synthetic ids', best: best, maxI: maxI };
})();
`;
  return vm.runInContext(probeSrc, ctx);
}

function main() {
  const cfg = parseArgs(process.argv.slice(2));
  if (cfg.flagshipTierProbe) {
    const quietVm = process.env.VALIDATION_QUIET !== '0' && process.env.VALIDATION_QUIET !== 'false';
    const ctx = createVmContext(quietVm);
    loadSim(ctx, cfg.careerMaxSteps);
    console.log('=== Flagship tier probe (harness-only synthetic MARKETS ids; not playable) ===');
    const r = runFlagshipTierProbe(ctx);
    if (r.ok) {
      console.log('OK: flagship path confirmed.');
      console.log('  marketId:', r.id);
      console.log('  tier:', r.tier);
      console.log('  u:', r.u.toFixed(6), 'S:', r.S.toFixed(6), 'C:', r.C.toFixed(6), 'eduN:', r.eduN.toFixed(4), 'civN:', r.civN.toFixed(4));
      console.log('  iterations:', r.iterations);
    } else {
      console.error('FAIL:', r.error);
      if (r.best && r.best.id != null) {
        console.log('  best C seen:', r.best.C.toFixed(6), 'id:', r.best.id, 'u:', r.best.u.toFixed(6), 'S:', r.best.S.toFixed(6));
      }
      process.exitCode = 1;
    }
    return;
  }

  const { runs, snapshotRuns, harness, mode, careerMaxSteps, snapshotVariant: snapshotVariantOpt } = cfg;
  const quietVm = process.env.VALIDATION_QUIET !== '0' && process.env.VALIDATION_QUIET !== 'false';
  const markets = parseMarketsFromEnv();

  const doCareer = harness === 'career' || harness === 'both';
  const doSnapshot = harness === 'snapshot' || harness === 'both';
  const careerSeeds = doCareer ? runs : 0;
  const snapSeeds = doSnapshot ? (harness === 'both' ? snapshotRuns : runs) : 0;
  const snapshotVariants =
    !doSnapshot ? [] : snapshotVariantOpt === 'both' ? ['normal', 'parity'] : [snapshotVariantOpt];

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const ctx = createVmContext(quietVm);
  loadSim(ctx, careerMaxSteps);

  const tuningModes = mode === 'compare' ? ['baseline', 'tuned'] : mode === 'baseline' ? ['baseline'] : ['tuned'];

  const csvRows = [csvHeader()];

  /** Career aggregates: key -> { ranks: number[], shares: number[], top5, top3, first, second, n } */
  const careerAgg = {};
  /** tuned career @2026: tier counts per market (PUBLIC_NEWS) */
  const careerTier2026ByMkt = {};
  for (const mkt of markets) careerTier2026ByMkt[mkt] = { typical: 0, strong: 0, flagship: 0, n: 0 };
  /** Snapshot 2026 tuned: tier frequency per market × variant */
  const snapTierNewsByMkt = {};
  for (const variant of snapshotVariants) {
    snapTierNewsByMkt[variant] = {};
    for (const mkt of markets) snapTierNewsByMkt[variant][mkt] = { typical: 0, strong: 0, flagship: 0, n: 0 };
  }
  /** Snapshot: snapByModeMarket[tuning][variant][mkt] */
  const snapByModeMarket = {};

  function emptySnapBucket() {
    return {
      okRuns: 0,
      tierNewsStored: null,
      tierNewsEffect: null,
      tierClassStored: null,
      news: { shares: [], ranks: [], top5n: 0, top10n: 0, top3n: 0, firstn: 0, secondn: 0, maxShare: 0 },
      classical: { shares: [], ranks: [], top5c: 0, maxShare: 0 },
      maxCommercialShareAcrossSeeds: 0,
      maxCommSamples: [],
      totalPubSamples: [],
      meanMaxCommercial: null,
      meanTotalPublic: null,
    };
  }

  for (const tuning of tuningModes) {
    snapByModeMarket[tuning] = {};
    for (const variant of snapshotVariants) {
      snapByModeMarket[tuning][variant] = {};
      for (const mkt of markets) snapByModeMarket[tuning][variant][mkt] = emptySnapBucket();
    }
  }

  /** Career @2026: max commercial share per seed (tuned/baseline), one value per seed/market */
  const careerMaxComm2026ByTuningMkt = {};

  // ── Career runs ──
  if (doCareer) {
    for (const tuning of tuningModes) {
      for (const mkt of markets) {
        for (let r = 0; r < careerSeeds; r++) {
          const seed = seedFor(markets, mkt, r);
          const o = runCareer(ctx, mkt, seed, tuning);
          if (!o.ok) {
            console.error(`FAIL career ${mkt} seed=${seed} tuning=${tuning}: ${o.error}`, o.at || '', o.partialRows ? `rows=${o.partialRows.length}` : '');
            continue;
          }
          for (const row of o.rows || []) {
            const ck = row.checkpointYear;
            const advSeg = row.advanceStepsThisLeg;
            const simY = row.simYear;
            const simP = row.simPeriod;
            const maxC = row.maxCommercialShare;

            for (const fmt of ['PUBLIC_NEWS', 'PUBLIC_CLASSICAL', 'PUBLIC_ECLECTIC', 'PUBLIC_JAZZ']) {
              const snap =
                fmt === 'PUBLIC_NEWS'
                  ? row.news
                  : fmt === 'PUBLIC_CLASSICAL'
                    ? row.classical
                    : fmt === 'PUBLIC_ECLECTIC'
                      ? row.eclectic
                      : row.jazz;
              const parts = rowFromSnap('career', tuning, mkt, seed, ck, fmt, snap, maxC, advSeg, simY, simP, '');
              if (parts) pushCsvRow(csvRows, parts);

              if (fmt === 'PUBLIC_NEWS' && snap) {
                const k = careerKey(tuning, ck, mkt);
                if (!careerAgg[k]) careerAgg[k] = { ranks: [], shares: [], top5: 0, top3: 0, first: 0, second: 0, n: 0 };
                const ag = careerAgg[k];
                ag.n++;
                if (snap.rank != null) ag.ranks.push(snap.rank);
                if (snap.share != null) ag.shares.push(snap.share);
                if (snap.top5) ag.top5++;
                if (snap.top3) ag.top3++;
                if (snap.first) ag.first++;
                if (snap.second) ag.second++;
                if (ck === 2026 && maxC != null && Number.isFinite(maxC)) {
                  const km = `${tuning}|${mkt}`;
                  if (!careerMaxComm2026ByTuningMkt[km]) careerMaxComm2026ByTuningMkt[km] = [];
                  careerMaxComm2026ByTuningMkt[km].push(maxC);
                }
                if (tuning === 'tuned' && ck === 2026) {
                  const tb = careerTier2026ByMkt[mkt];
                  tb.n++;
                  const ts = snap.tierStored;
                  if (ts === 'flagship') tb.flagship++;
                  else if (ts === 'strong') tb.strong++;
                  else tb.typical++;
                }
              }
            }
          }
        }
      }
    }
  }

  // ── Snapshot runs ──
  if (doSnapshot) {
    for (const tuning of tuningModes) {
      for (const variant of snapshotVariants) {
        for (const mkt of markets) {
          const B = snapByModeMarket[tuning][variant][mkt];
          for (let r = 0; r < snapSeeds; r++) {
            const seed = seedFor(markets, mkt, r);
            const o = runSnapshot(ctx, mkt, seed, tuning, variant);
            if (!o.ok) {
              console.error(`FAIL snapshot(${variant}) ${mkt} seed=${seed} tuning=${tuning}: ${o.error}`);
              continue;
            }
            B.okRuns++;
            const ck = o.checkpointYear || 2026;
            const advSeg = o.advanceSteps || 0;
            for (const fmt of ['PUBLIC_NEWS', 'PUBLIC_CLASSICAL', 'PUBLIC_ECLECTIC', 'PUBLIC_JAZZ']) {
              const snap =
                fmt === 'PUBLIC_NEWS'
                  ? o.news
                  : fmt === 'PUBLIC_CLASSICAL'
                    ? o.classical
                    : fmt === 'PUBLIC_ECLECTIC'
                      ? o.eclectic
                      : o.jazz;
              const parts = rowFromSnap(
                'snapshot',
                tuning,
                mkt,
                seed,
                ck,
                fmt,
                snap,
                o.maxCommercialShare,
                advSeg,
                o.year,
                o.period,
                variant
              );
              if (parts) pushCsvRow(csvRows, parts);
            }
            if (o.news) {
              if (tuning === 'tuned') {
                const tc = snapTierNewsByMkt[variant][mkt];
                tc.n++;
                const ts = o.news.tierStored;
                if (ts === 'flagship') tc.flagship++;
                else if (ts === 'strong') tc.strong++;
                else tc.typical++;
              }
              if (B.tierNewsStored == null) B.tierNewsStored = o.news.tierStored;
              if (B.tierNewsEffect == null) B.tierNewsEffect = o.news.tierEffect;
              if (o.news.share != null) {
                B.news.shares.push(o.news.share);
                B.news.maxShare = Math.max(B.news.maxShare, o.news.share);
              }
              if (o.news.rank != null) B.news.ranks.push(o.news.rank);
              if (o.news.top5) B.news.top5n++;
              if (o.news.top10) B.news.top10n++;
              if (o.news.top3) B.news.top3n++;
              if (o.news.first) B.news.firstn++;
              if (o.news.second) B.news.secondn++;
            }
            if (o.classical) {
              if (B.tierClassStored == null) B.tierClassStored = o.classical.tierStored;
              if (o.classical.share != null) {
                B.classical.shares.push(o.classical.share);
                B.classical.maxShare = Math.max(B.classical.maxShare, o.classical.share);
              }
              if (o.classical.rank != null) B.classical.ranks.push(o.classical.rank);
              if (o.classical.top5) B.classical.top5c++;
            }
            if (o.maxCommercialShare != null && Number.isFinite(o.maxCommercialShare)) {
              B.maxCommSamples.push(o.maxCommercialShare);
              B.maxCommercialShareAcrossSeeds = Math.max(B.maxCommercialShareAcrossSeeds, o.maxCommercialShare);
            }
            let tpub = 0;
            for (const pk of ['news', 'classical', 'eclectic', 'jazz']) {
              const z = o[pk];
              if (z && typeof z.share === 'number' && !Number.isNaN(z.share)) tpub += z.share;
            }
            B.totalPubSamples.push(tpub);
          }

          const sn = summarizeShares(B.news.shares);
          const sc = summarizeShares(B.classical.shares);
          B.news.share = sn;
          B.news.rankMedian = quantile(sorted(B.news.ranks), 0.5);
          B.news.rankP90 = quantile(sorted(B.news.ranks), 0.9);
          B.news.pctTop5 = pct(B.news.top5n, B.okRuns);
          B.news.pctTop10 = pct(B.news.top10n, B.okRuns);
          B.news.pctTop3 = pct(B.news.top3n, B.okRuns);
          B.news.pctFirst = pct(B.news.firstn, B.okRuns);
          B.news.pctSecond = pct(B.news.secondn, B.okRuns);
          B.classical.share = sc;
          B.classical.rankMedian = quantile(sorted(B.classical.ranks), 0.5);
          B.classical.pctTop5 = pct(B.classical.top5c, B.okRuns);
          B.meanMaxCommercial =
            B.maxCommSamples.length > 0
              ? B.maxCommSamples.reduce((a, b) => a + b, 0) / B.maxCommSamples.length
              : null;
          B.meanTotalPublic =
            B.totalPubSamples.length > 0
              ? B.totalPubSamples.reduce((a, b) => a + b, 0) / B.totalPubSamples.length
              : null;
        }
      }
    }
  }

  writeFileSync(outCsv, csvRows.join('\n'), 'utf8');
  console.log('Wrote', outCsv);
  const scaleProbe = vm.runInContext(
    `(function(){
      function genCount(mid){
        ACTIVE_MARKET = mid;
        syncMarketPopToMarket(mid);
        G = genMarketMP('1985');
        var sy = (G.scenario && G.scenario.startYear != null) ? G.scenario.startYear : 1985;
        var tgt = computePublicStationTargetCount(mid, sy);
        var plan = computePublicExpansionFormatsAfterBase(mid, sy);
        var n = 0, ec = false, jz = false;
        var fmts = [];
        for (var i = 0; i < G.stations.length; i++) {
          var s = G.stations[i];
          if (!s || s._bpSlotDeferred || !s.isPublic) continue;
          n++;
          fmts.push(s.format);
          if (s.format === 'PUBLIC_ECLECTIC') ec = true;
          if (s.format === 'PUBLIC_JAZZ') jz = true;
        }
        return { market: mid, scenarioStart: sy, target: tgt, plan: plan.join('+'), count: n, eclectic: ec, jazz: jz, fmts: fmts.join(','), ok: n === tgt && n >= 2 && n <= 4 };
      }
      return [genCount('wichita'), genCount('newyork'), genCount('losangeles'), genCount('nashville'), genCount('seattle')];
    })()`,
    ctx
  );
  console.log('\n=== PUBLIC station count vs target (genMarketMP 1985 / chrwar) ===');
  console.log(JSON.stringify(scaleProbe, null, 2));

  const planProbe = vm.runInContext(
    `(function(){
      return ['wichita','nashville','atlanta','seattle','chicago','newyork','losangeles'].map(function(mid){
        ACTIVE_MARKET = mid;
        syncMarketPopToMarket(mid);
        return {
          market: mid,
          target2026: computePublicStationTargetCount(mid, 2026),
          expansion2026: (computePublicExpansionFormatsAfterBase(mid, 2026).join('+') || '—'),
          target1970: computePublicStationTargetCount(mid, 1970),
          expansion1970: (computePublicExpansionFormatsAfterBase(mid, 1970).join('+') || '—'),
        };
      });
    })()`,
    ctx
  );
  console.log('\n=== Public expansion plan (target count + extra formats after news/classical) ===');
  console.table(planProbe);

  const wRow = planProbe.find((r) => r.market === 'wichita');
  const naRow = planProbe.find((r) => r.market === 'nashville');
  const megaRows = planProbe.filter((r) => ['newyork', 'losangeles', 'chicago'].includes(r.market));
  const jazzPlan2026 = planProbe.filter((r) => String(r.expansion2026).includes('PUBLIC_JAZZ')).map((r) => r.market);
  console.log('\n=== Harness answers: PUBLIC_JAZZ ecosystem ===');
  console.log(
    `1) Wichita capped at 2? target2026=${wRow?.target2026} expansion="${wRow?.expansion2026}" (expect no third public slot).`
  );
  console.log(
    `2) Mega 3–4? ${megaRows.map((r) => `${r.market}:target=${r.target2026}`).join(' | ')} — when target=4, expansion lists both music outlets.`
  );
  console.log(
    `3) Jazz mainly large/mega: markets with PUBLIC_JAZZ in 2026 expansion plan: ${jazzPlan2026.length ? jazzPlan2026.join(', ') : 'none'} (${jazzPlan2026.length}/7).`
  );
  console.log(
    `4) Nashville (medium) eclectic bias when 3rd: target2026=${naRow?.target2026} expansion="${naRow?.expansion2026}".`
  );
  console.log(
    `5) Dial realization @1985 (scaleProbe): compare count vs target; jazz=true only if that outlet exists on the dial.`
  );

  const nashvillePublicTargetByYear = vm.runInContext(
    `(function () {
      var rows = [];
      for (var y = 1978; y <= 2026; y++) {
        var tgt = computePublicStationTargetCount('nashville', y);
        rows.push({ startYear: y, targetPublic: tgt, third: tgt >= 3 ? 'yes' : '' });
      }
      var n3 = 0;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].targetPublic >= 3) n3++;
      }
      return { rows: rows, yearsWithThird: n3, yearSpan: rows.length };
    })()`,
    ctx
  );
  console.log('\n=== Nashville — computePublicStationTargetCount by scenario startYear (1978–2026) ===');
  console.table(nashvillePublicTargetByYear.rows);
  console.log(
    `  Years with third public planned: ${nashvillePublicTargetByYear.yearsWithThird} / ${nashvillePublicTargetByYear.yearSpan} (stable per market + startYear; FM dial must still have a free slot at gen).`
  );

  console.log('Markets:', markets.join(', '));
  console.log('Harness:', harness, '| Tuning mode(s):', tuningModes.join(', '));
  if (doSnapshot) console.log('Snapshot variant(s):', snapshotVariants.join(', ') || '(none)');
  if (doCareer) console.log('Career seeds / market / tuning:', careerSeeds, `(max ${careerMaxSteps} adv steps per checkpoint leg)`);
  if (doSnapshot) console.log('Snapshot seeds / market / tuning:', snapSeeds);
  console.log('');

  // ── Career: mean share & rank freq by checkpoint (PUBLIC_NEWS, tuned) ──
  if (doCareer) {
    console.log('=== CAREER — PUBLIC_NEWS mean share % by checkpoint (tuned) ===');
    console.log('checkpoint'.padEnd(12) + markets.map((m) => m.slice(0, 9).padStart(10)).join(''));
    for (const ck of CAREER_CHECKPOINTS) {
      let line = String(ck).padEnd(12);
      for (const mkt of markets) {
        const k = careerKey('tuned', ck, mkt);
        const ag = careerAgg[k];
        const meanPct =
          ag && ag.shares.length ? ((ag.shares.reduce((a, b) => a + b, 0) / ag.shares.length) * 100).toFixed(1) : '—';
        line += meanPct.padStart(10);
      }
      console.log(line);
    }
    console.log('');

    if (tuningModes.includes('baseline')) {
      console.log('=== CAREER — PUBLIC_NEWS mean share % by checkpoint (baseline) ===');
      console.log('checkpoint'.padEnd(12) + markets.map((m) => m.slice(0, 9).padStart(10)).join(''));
      for (const ck of CAREER_CHECKPOINTS) {
        let line = String(ck).padEnd(12);
        for (const mkt of markets) {
          const k = careerKey('baseline', ck, mkt);
          const ag = careerAgg[k];
          const meanPct =
            ag && ag.shares.length ? ((ag.shares.reduce((a, b) => a + b, 0) / ag.shares.length) * 100).toFixed(1) : '—';
          line += meanPct.padStart(10);
        }
        console.log(line);
      }
      console.log('');
    }

    console.log('=== CAREER — PUBLIC_NEWS top-5 / top-3 / #1 / #2 frequency % by checkpoint (tuned, pooled all markets) ===');
    console.log(
      'checkpoint'.padEnd(12) + '%top5'.padStart(10) + '%top3'.padStart(10) + '%#1'.padStart(10) + '%#2'.padStart(10) + 'n'.padStart(8)
    );
    for (const ck of CAREER_CHECKPOINTS) {
      let top5 = 0;
      let top3 = 0;
      let first = 0;
      let second = 0;
      let n = 0;
      for (const mkt of markets) {
        const k = careerKey('tuned', ck, mkt);
        const ag = careerAgg[k];
        if (!ag) continue;
        top5 += ag.top5;
        top3 += ag.top3;
        first += ag.first;
        second += ag.second;
        n += ag.n;
      }
      console.log(
        String(ck).padEnd(12) +
          pct(top5, n).toFixed(1).padStart(10) +
          pct(top3, n).toFixed(1).padStart(10) +
          pct(first, n).toFixed(1).padStart(10) +
          pct(second, n).toFixed(1).padStart(10) +
          String(n).padStart(8)
      );
    }
    console.log('');

    console.log('=== CAREER — Rank histogram (PUBLIC_NEWS, tuned, pooled markets) by checkpoint ===');
    for (const ck of CAREER_CHECKPOINTS) {
      const ranks = [];
      for (const mkt of markets) {
        const k = careerKey('tuned', ck, mkt);
        const ag = careerAgg[k];
        if (ag && ag.ranks.length) ranks.push(...ag.ranks);
      }
      const total = ranks.length;
      const counts = {};
      for (const b of RANK_HIST_BINS) counts[b.label] = 0;
      for (const r of ranks) {
        for (const b of RANK_HIST_BINS) {
          if (b.test(r)) {
            counts[b.label]++;
            break;
          }
        }
      }
      console.log(`-- checkpoint ${ck} (n=${total})`);
      console.log(asciiHistogram(counts, total, 26));
      console.log('');
    }

    console.log('=== CAREER — PUBLIC_NEWS stored tier distribution @ 2026 (tuned, by market) ===');
    for (const mkt of markets) {
      const tb = careerTier2026ByMkt[mkt];
      if (!tb.n) console.log(`  ${mkt}: (no data)`);
      else
        console.log(
          `  ${mkt}: typical=${tb.typical} strong=${tb.strong} flagship=${tb.flagship} (n=${tb.n})`
        );
    }
    console.log('');

    console.log('=== CAREER — Rank histogram @ 2026 (PUBLIC_NEWS, tuned, per market) ===');
    for (const mkt of markets) {
      const k = careerKey('tuned', 2026, mkt);
      const ag = careerAgg[k];
      const ranks = ag && ag.ranks.length ? ag.ranks : [];
      const total = ranks.length;
      const counts = {};
      for (const b of RANK_HIST_BINS) counts[b.label] = 0;
      for (const r of ranks) {
        for (const b of RANK_HIST_BINS) {
          if (b.test(r)) {
            counts[b.label]++;
            break;
          }
        }
      }
      console.log(`-- ${mkt} (n=${total})`);
      console.log(asciiHistogram(counts, total, 22));
      console.log('');
    }

    console.log('=== CAREER @2026 — mean max commercial share % (per tuning / market; same as harness maxCommercialShare) ===');
    function meanArr(a) {
      if (!a || !a.length) return null;
      return a.reduce((x, y) => x + y, 0) / a.length;
    }
    for (const tuning of tuningModes) {
      console.log(`-- ${tuning}`);
      for (const mkt of markets) {
        const arr = careerMaxComm2026ByTuningMkt[`${tuning}|${mkt}`];
        const mu = meanArr(arr);
        console.log(
          `  ${mkt}: mean max comm ${mu != null ? (mu * 100).toFixed(2) : '—'}% (n=${arr?.length ?? 0})`
        );
      }
    }
    console.log('');
  }

  // ── Snapshot summary ──
  if (doSnapshot) {
    function printSnapTable(tuning, variant) {
      console.log(
        `=== SNAPSHOT 2026 (${variant}) — ${tuning.toUpperCase()} PUBLIC_NEWS (${snapSeeds} seeds / market) ===`
      );
      console.log(
        'market'.padEnd(12) +
          'mean%'.padStart(8) +
          'med%'.padStart(8) +
          'p90%'.padStart(8) +
          'max%'.padStart(8) +
          'medRk'.padStart(8) +
          '%top5'.padStart(8) +
          '%top3'.padStart(8) +
          '%#1'.padStart(8) +
          '%#2'.padStart(8) +
          'mxCm%'.padStart(8) +
          'totPub%'.padStart(9)
      );
      for (const mkt of markets) {
        const b = snapByModeMarket[tuning][variant][mkt];
        if (!b || !b.okRuns) continue;
        const sn = b.news.share;
        console.log(
          mkt.padEnd(12) +
            (sn.mean != null ? (sn.mean * 100).toFixed(2) : '—').padStart(8) +
            (sn.median != null ? (sn.median * 100).toFixed(2) : '—').padStart(8) +
            (sn.p90 != null ? (sn.p90 * 100).toFixed(2) : '—').padStart(8) +
            (sn.max != null ? (sn.max * 100).toFixed(2) : '—').padStart(8) +
            (b.news.rankMedian != null ? String(Math.round(b.news.rankMedian)) : '—').padStart(8) +
            b.news.pctTop5.toFixed(1).padStart(8) +
            b.news.pctTop3.toFixed(1).padStart(8) +
            b.news.pctFirst.toFixed(1).padStart(8) +
            (b.news.pctSecond != null ? b.news.pctSecond.toFixed(1) : '—').padStart(8) +
            (b.meanMaxCommercial != null ? (b.meanMaxCommercial * 100).toFixed(2) : '—').padStart(8) +
            (b.meanTotalPublic != null ? (b.meanTotalPublic * 100).toFixed(2) : '—').padStart(9)
        );
      }
      console.log('');
    }

    if (tuningModes.includes('tuned')) {
      for (const variant of snapshotVariants) {
        console.log(`=== SNAPSHOT 2026 (${variant}) — PUBLIC_NEWS tier counts (tuned) + first-seed tier ===`);
        for (const mkt of markets) {
          const b = snapByModeMarket.tuned[variant][mkt];
          const tc = snapTierNewsByMkt[variant][mkt];
          if (!b || !b.okRuns) {
            console.log(`  ${mkt}: (no successful runs)`);
            continue;
          }
          console.log(
            `  ${mkt}: typical=${tc.typical} strong=${tc.strong} flagship=${tc.flagship} (n=${tc.n}) | example seed tier stored=${b.tierNewsStored} effect=${b.tierNewsEffect} | classical stored=${b.tierClassStored}`
          );
        }
        console.log('');
      }
    }

    for (const tuning of tuningModes) {
      for (const variant of snapshotVariants) {
        printSnapTable(tuning, variant);
      }
    }

    if (tuningModes.length === 2) {
      for (const variant of snapshotVariants) {
        console.log(`=== SNAPSHOT (${variant}) — tuned vs baseline (mean share % delta, PUBLIC_NEWS) ===`);
        for (const mkt of markets) {
          const tb = snapByModeMarket.tuned[variant][mkt];
          const bb = snapByModeMarket.baseline[variant][mkt];
          if (!tb || !bb || !tb.okRuns || !bb.okRuns) continue;
          const dm =
            tb.news.share.mean != null && bb.news.share.mean != null
              ? (tb.news.share.mean - bb.news.share.mean) * 100
              : null;
          console.log(`  ${mkt}: Δmean ${dm != null ? dm.toFixed(3) : '—'} pts`);
        }
        console.log('');
      }
    }

    if (snapshotVariants.includes('normal') && snapshotVariants.includes('parity') && tuningModes.includes('tuned')) {
      console.log(
        '=== SNAPSHOT parity diagnostic (tuned): parity − normal — ΔmeanNews pts, Δ%#1, ΔmeanMaxComm pts, ΔmeanTotPub pts ==='
      );
      for (const mkt of markets) {
        const n = snapByModeMarket.tuned.normal[mkt];
        const p = snapByModeMarket.tuned.parity[mkt];
        if (!n || !p || !n.okRuns || !p.okRuns) continue;
        const dm =
          n.news.share.mean != null && p.news.share.mean != null
            ? (p.news.share.mean - n.news.share.mean) * 100
            : null;
        const d1 = p.news.pctFirst - n.news.pctFirst;
        const dmc =
          n.meanMaxCommercial != null && p.meanMaxCommercial != null
            ? (p.meanMaxCommercial - n.meanMaxCommercial) * 100
            : null;
        const dtp =
          n.meanTotalPublic != null && p.meanTotalPublic != null
            ? (p.meanTotalPublic - n.meanTotalPublic) * 100
            : null;
        console.log(
          `  ${mkt}: ΔmeanNews ${dm != null ? (dm >= 0 ? '+' : '') + dm.toFixed(2) : '—'} | Δ#1% ${d1 >= 0 ? '+' : ''}${d1.toFixed(1)} | ΔmxComm ${dmc != null ? (dmc >= 0 ? '+' : '') + dmc.toFixed(2) : '—'} | ΔtotPub ${dtp != null ? (dtp >= 0 ? '+' : '') + dtp.toFixed(2) : '—'}`
        );
      }
      console.log('');
    }
  }

  const tier2026Tuned = { typical: 0, strong: 0, flagship: 0, n: 0 };
  if (doCareer) {
    for (const mkt of markets) {
      const tb = careerTier2026ByMkt[mkt];
      tier2026Tuned.typical += tb.typical;
      tier2026Tuned.strong += tb.strong;
      tier2026Tuned.flagship += tb.flagship;
      tier2026Tuned.n += tb.n;
    }
  }

  console.log('=== Validation questions (heuristic; tuned career for trajectory unless noted) ===');
  const earlyCk = 1975;
  const midCk = 2000;
  const lateCk = 2026;
  function pooledMeanTuned(ck) {
    let sum = 0;
    let n = 0;
    for (const mkt of markets) {
      const k = careerKey('tuned', ck, mkt);
      const ag = careerAgg[k];
      if (!ag || !ag.shares.length) continue;
      sum += ag.shares.reduce((a, b) => a + b, 0);
      n += ag.shares.length;
    }
    return n ? sum / n : null;
  }
  function pooledTop5Tuned(ck) {
    let t5 = 0;
    let n = 0;
    for (const mkt of markets) {
      const k = careerKey('tuned', ck, mkt);
      const ag = careerAgg[k];
      if (!ag) continue;
      t5 += ag.top5;
      n += ag.n;
    }
    return n ? pct(t5, n) : null;
  }

  if (doCareer) {
    const m1975 = pooledMeanTuned(earlyCk);
    const m2000 = pooledMeanTuned(midCk);
    const m2026 = pooledMeanTuned(lateCk);
    const p5_1975 = pooledTop5Tuned(earlyCk);
    const p5_2026 = pooledTop5Tuned(lateCk);
    console.log(
      `1) Too strong too early? Pooled tuned mean PUBLIC_NEWS share: ${m1975 != null ? (m1975 * 100).toFixed(2) : '—'}% @${earlyCk} vs ${m2000 != null ? (m2000 * 100).toFixed(2) : '—'}% @${midCk} vs ${m2026 != null ? (m2026 * 100).toFixed(2) : '—'}% @${lateCk}. Top5% @1975=${p5_1975 != null ? p5_1975.toFixed(1) : '—'} vs @2026=${p5_2026 != null ? p5_2026.toFixed(1) : '—'}.`
    );
    console.log(
      `2) Enough growth 2000–2026? Mean share moves ${m2000 != null && m2026 != null ? (((m2026 - m2000) / Math.max(1e-6, m2000)) * 100).toFixed(0) : '—'}% relative from @${midCk} to @${lateCk} (pooled tuned).`
    );
    console.log(
      `3)–4) Strong/flagship matter & flagship rarity: career @2026 pooled (tuned) tier counts — typical:${tier2026Tuned.typical}, strong:${tier2026Tuned.strong}, flagship:${tier2026Tuned.flagship} (n=${tier2026Tuned.n}). Compare baseline vs tuned in CSV.`
    );
    console.log(
      `5) WUNC-style by modern era: use career @2010–2026 columns — top5% @2026 pooled=${p5_2026 != null ? p5_2026.toFixed(1) : '—'}%; inspect mega markets in CSV.`
    );
    const hegemonyLines = [];
    if (doSnapshot && tuningModes.includes('tuned')) {
      for (const variant of snapshotVariants) {
        const heg = [];
        for (const mkt of markets) {
          const t = snapByModeMarket.tuned[variant][mkt];
          if (t && t.okRuns && t.news.pctFirst >= 40) heg.push(mkt);
        }
        hegemonyLines.push(`${variant}: ${heg.length ? heg.join(', ') : 'none'}`);
      }
    }
    console.log(
      `6) Too dominant everywhere? ${
        doSnapshot && hegemonyLines.length
          ? `Snapshot 2026 (tuned) markets with ≥40% #1 seeds — ${hegemonyLines.join(' | ')}. `
          : doSnapshot
            ? '(No tuned snapshot data for hegemony line.) '
            : '(Snapshot not run — use --harness=snapshot or both.) '
      }Career: see rank histograms (pooled by checkpoint + per market @2026).`
    );
  } else if (doSnapshot) {
    console.log(
      '(Career harness disabled.) Use career or both for trajectory questions (1–5). Snapshot tables and CSV rows cover modern 2026 cold dial; use --snapshot-variant=parity|both to compare all-AI vs Underdog slot.'
    );
  } else {
    console.log('(No harness selected — use --harness=career, snapshot, or both.)');
  }

  console.log('');
  console.log('=== Recommendation ===');
  const rec = [];
  if (doCareer && tier2026Tuned.flagship === 0 && tier2026Tuned.n > 0) {
    rec.push('No flagship PUBLIC_NEWS at 2026 in career sample — flagship gates still strict for this path.');
  }
  if (doSnapshot && tuningModes.includes('tuned')) {
    let hotNormal = false;
    let hotParity = false;
    for (const variant of snapshotVariants) {
      for (const mkt of markets) {
        const t = snapByModeMarket.tuned[variant][mkt];
        if (t && t.okRuns && t.news.pctFirst >= 50) {
          if (variant === 'normal') hotNormal = true;
          if (variant === 'parity') hotParity = true;
        }
      }
    }
    if (hotNormal && hotParity && snapshotVariants.includes('normal') && snapshotVariants.includes('parity')) {
      rec.push(
        'Snapshot normal and parity @2026 both show ≥50% #1 in sampled markets — dominance is not explained by Underdog/player slot alone; review cold commercial head + public formulas.'
      );
    } else {
      if (hotNormal)
        rec.push(
          'Snapshot (normal / Underdog slot) @2026 shows very high #1 in some majors — run --snapshot-variant=both to isolate player-slot vs generator.'
        );
      if (hotParity)
        rec.push(
          'Snapshot (parity / no player slot) @2026 shows very high #1 in some majors — cold dial + public stack, not only Underdog artifact.'
        );
    }
  }
  if (!rec.length) rec.push('See CSV for per-seed detail; adjust tiers/era curves from career means and rank histograms.');
  rec.forEach((line) => console.log('-', line));
}

main();
