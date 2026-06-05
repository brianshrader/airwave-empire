#!/usr/bin/env node
/**
 * Morning-drive recovery A/B balance experiment (in-VM only — no gameplay changes shipped).
 *
 *   npm run diag:morning-recovery-ab
 *   npm run diag:morning-recovery-ab -- --grid
 *   npm run diag:morning-recovery-ab -- --runs=2 --variants=A,E,F,G,H,I
 *
 * Output:
 *   tmp/morning_recovery_ab.json (default)
 *   tmp/morning_recovery_ab_grid.json (--grid)
 *   tmp/morning_recovery_ab.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectRecoveryAbHooks } from './diag-morning-recovery-ab-patches.mjs';
import { familyForFormat, loadFormatFamiliesCatalog } from './formatFamilyHelpers.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const ceilingPath = path.join(root, 'src', 'morningSuccessorCeiling.js');
const hooksPath = path.join(root, 'scripts/diag-morning-recovery-ab-hooks.vm.js');
const runnerPath = path.join(root, 'scripts/diag-morning-recovery-ab-runner.vm.js');
const outJson = path.join(root, 'tmp', 'morning_recovery_ab.json');
const outMd = path.join(root, 'tmp', 'morning_recovery_ab.md');

const ALL_VARIANTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'K', 'L'];
const GRID_VARIANTS = ['A', 'E', 'F', 'G', 'H', 'I'];
const CEILING_GRID_VARIANTS = ['A', 'G', 'J', 'K', 'L'];
const J_TUNE_GRID_VARIANTS = ['J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6'];

function isSuccessorCeilingVariant(variant) {
  return /^J\d?$/.test(variant) || ['K', 'L'].includes(variant);
}
const BUCKET_ORDER = ['lt50', '50-59', '60-69', '70-79', '80-89', '90-94', '95-99'];
const DEPART_TIERS = ['lt70', '70-84', '85-94', '95+'];
const MARKET_TIERS = ['mega', 'large', 'medium', 'small'];
const OWNERSHIP_KEYS = ['independent', 'corporate', 'player'];

const TARGETS = {
  pctFullyRecoverQuality: { lo: 55, hi: 65, ideal: 60 },
  pctExceedPriorQuality: { lo: 25, hi: 35, ideal: 30 },
  medianYearsToRecoverQuality: { lo: 2.0, hi: 4.0, ideal: 3.0 },
  medianYearsToRecoverRevenueElite: { lo: 1.0, hi: 2.0, ideal: 1.5 },
  pct9599: { lo: 8, hi: 12, ideal: 10 },
  meanOq: { lo: 62, hi: 66, ideal: 64 },
};

function injectHeadlessLaunchNewsGuard(src) {
  let out = src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  return out;
}

function patchActiveMarket(src, marketId) {
  return src.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
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
    removeChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    getAttribute() { return null; },
    setAttribute() {},
  };
}

function makeToastStackStub() {
  const children = [];
  return {
    appendChild(el) {
      children.push(el);
    },
    removeChild(el) {
      const i = children.indexOf(el);
      if (i >= 0) children.splice(i, 1);
    },
    get children() {
      return children;
    },
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
  getElementById(id) {
    if (id === 'wl-toast-stack') return makeToastStackStub();
    if (id === 'm-contract' || id === 'abtn') return stubEl(id);
    return stubEl();
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext() {
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: console.error, table: () => {} },
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
    setInterval() { return 0; },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        return a;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
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
  return ctx;
}

function loadVm(marketId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  try {
    vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  } catch (_e) {
    /* optional */
  }
  vm.runInContext(readFileSync(ceilingPath, 'utf8'), ctx, { timeout: 600_000 });
  const legacy = injectRecoveryAbHooks(
    injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
  );
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(
    'showToast=function(){}; showToastWithSubscribeCta=function(){};',
    ctx,
  );
  vm.runInContext(readFileSync(hooksPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 2,
    seed: 20260601,
    markets: [...ALL_PLAYABLE_MARKET_IDS],
    startYears: [1970, 1985, 2000],
    variants: [...ALL_VARIANTS],
    grid: false,
    gridCeiling: false,
    gridJTune: false,
  };
  for (const a of argv) {
    if (a === '--grid') {
      o.grid = true;
      o.variants = [...GRID_VARIANTS];
    } else if (a === '--grid-ceiling') {
      o.gridCeiling = true;
      o.variants = [...CEILING_GRID_VARIANTS];
    } else if (a === '--grid-j-tune') {
      o.gridJTune = true;
      o.variants = [...J_TUNE_GRID_VARIANTS];
    } else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || o.runs);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--markets=')) {
      o.markets = a
        .slice(10)
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith('--start-years=')) {
      o.startYears = a
        .slice(14)
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((y) => Number.isFinite(y));
    } else if (a.startsWith('--variants=')) {
      o.variants = a
        .slice(11)
        .split(',')
        .map((x) => x.trim().toUpperCase())
        .filter((v) => ALL_VARIANTS.includes(v));
    }
  }
  return o;
}

function mean(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x));
  if (!a.length) return null;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function median(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((100 * n) / d * 100) / 100;
}

function emptyBuckets() {
  const o = {};
  BUCKET_ORDER.forEach((b) => {
    o[b] = 0;
  });
  return o;
}

function summarizeEvents(events, label) {
  const ai = events.filter((e) => e.ownership !== 'player');
  const nAi = ai.length;
  const recoveredQ = ai.filter((e) => e.recoveredQuality);
  const exceededQ = ai.filter((e) => e.exceededQuality);
  const recoveredRev = ai.filter((e) => e.recoveredRevenue);

  return {
    label,
    departures: nAi,
    avgDepartingSlotQ: mean(ai.map((e) => e.departingSlotQ)),
    avgReplacementSlotQ: mean(ai.map((e) => e.replacementSlotQ)),
    avgImmediateSlotQDrop: mean(ai.map((e) => e.departingSlotQ - e.replacementSlotQ)),
    pctFullyRecoverQuality: pct(recoveredQ.length, nAi),
    pctExceedPriorQuality: pct(exceededQ.length, nAi),
    avgYearsToRecoverQuality: mean(
      ai.map((e) => e.yearsToRecoverQuality).filter((y) => y != null),
    ),
    medianYearsToRecoverQuality: median(
      ai.map((e) => e.yearsToRecoverQuality).filter((y) => y != null),
    ),
    pctRecoverRevenue: pct(recoveredRev.length, nAi),
    avgYearsToRecoverRevenue: mean(
      ai.map((e) => e.yearsToRecoverRevenue).filter((y) => y != null),
    ),
    medianYearsToRecoverRevenue: median(
      ai.map((e) => e.yearsToRecoverRevenue).filter((y) => y != null),
    ),
    neverRecoveredQuality: ai.filter((e) => !e.recoveredQuality).length,
  };
}

function aggregateVariantResults(variant, results, formatCatalog) {
  const ok = results.filter((r) => r.ok);
  const allEvents = ok.flatMap((r) =>
    (r.events || []).map((e) => ({
      ...e,
      rankTier: e.rankTier || r.rankTier,
      marketId: e.marketId || r.marketId,
    })),
  );

  const majorEvents = allEvents.filter((e) => e.isMajor && e.ownership !== 'player');
  const successorEvents = allEvents.filter(
    (e) => e.isSuccessorTrigger && e.ownership !== 'player',
  );
  const playerEvents = allEvents.filter((e) => e.ownership === 'player');

  const bucketTotals = emptyBuckets();
  let totalCommercial = 0;
  let sumMeanOq = 0;
  let meanOqRuns = 0;
  let above90Total = 0;
  let pct9599Weighted = 0;
  let playerStations = 0;
  let playerAbove95 = 0;
  let lowShareSpiralTotal = 0;
  let zombieLikeTotal = 0;
  const certByMarket = {};

  for (const r of ok) {
    const snap = r.snapshot2020;
    if (!snap) continue;
    totalCommercial += snap.commercialCount || 0;
    BUCKET_ORDER.forEach((b) => {
      bucketTotals[b] += snap.buckets?.[b] || 0;
    });
    if (snap.meanOq != null) {
      sumMeanOq += snap.meanOq;
      meanOqRuns += 1;
    }
    above90Total += Math.round(((snap.pctAbove90 || 0) / 100) * (snap.commercialCount || 0));
    pct9599Weighted += ((snap.pct9599 || 0) / 100) * (snap.commercialCount || 0);
    playerStations += snap.playerStations || 0;
    playerAbove95 += snap.playerStationsAbove95 || 0;
    lowShareSpiralTotal += snap.lowShareSpiral || 0;
    zombieLikeTotal += snap.zombieLike || 0;

    const mid = r.marketId;
    if (!certByMarket[mid]) {
      certByMarket[mid] = { runs: 0, meanOq: [], pct9599: [], formatFamilyShare: {} };
    }
    certByMarket[mid].runs += 1;
    if (snap.meanOq != null) certByMarket[mid].meanOq.push(snap.meanOq);
    certByMarket[mid].pct9599.push(snap.pct9599 || 0);
    const fmtCounts = snap.formatCounts || {};
    const totalFmt = Object.values(fmtCounts).reduce((s, x) => s + x, 0) || 1;
    const famShare = {};
    for (const [fmt, cnt] of Object.entries(fmtCounts)) {
      const fam = familyForFormat(fmt, formatCatalog) || 'OTHER';
      famShare[fam] = (famShare[fam] || 0) + cnt / totalFmt;
    }
    for (const [fam, share] of Object.entries(famShare)) {
      if (!certByMarket[mid].formatFamilyShare[fam]) certByMarket[mid].formatFamilyShare[fam] = [];
      certByMarket[mid].formatFamilyShare[fam].push(share);
    }
  }

  const bucketPct = {};
  BUCKET_ORDER.forEach((b) => {
    bucketPct[b] = pct(bucketTotals[b], totalCommercial);
  });

  const byMarketSize = {};
  for (const tier of MARKET_TIERS) {
    byMarketSize[tier] = summarizeEvents(
      majorEvents.filter((e) => e.rankTier === tier),
      tier,
    );
  }

  const byOwnership = {};
  for (const own of OWNERSHIP_KEYS) {
    byOwnership[own] = summarizeEvents(
      allEvents.filter((e) => e.ownership === own && (own === 'player' || e.isMajor)),
      own,
    );
  }

  const byDepartTier = {};
  for (const dt of DEPART_TIERS) {
    byDepartTier[dt] = summarizeEvents(
      majorEvents.filter((e) => e.departSlotTier === dt),
      dt,
    );
  }

  const byFormatFamily = {};
  for (const ev of majorEvents) {
    const fam = familyForFormat(ev.format, formatCatalog) || 'OTHER';
    if (!byFormatFamily[fam]) byFormatFamily[fam] = [];
    byFormatFamily[fam].push(ev);
  }
  const byFormatFamilySummary = {};
  for (const [fam, evs] of Object.entries(byFormatFamily)) {
    byFormatFamilySummary[fam] = summarizeEvents(evs, fam);
  }

  const certProxy = {};
  for (const [mid, data] of Object.entries(certByMarket)) {
    const famMeans = {};
    for (const [fam, arr] of Object.entries(data.formatFamilyShare)) {
      famMeans[fam] = mean(arr);
    }
    certProxy[mid] = {
      runs: data.runs,
      meanOq: mean(data.meanOq),
      pct9599: mean(data.pct9599),
      formatFamilyShareMean: famMeans,
    };
  }

  return {
    variant,
    runs: { total: results.length, ok: ok.length, failed: results.length - ok.length },
    majorMorningDepartures: majorEvents.length,
    successorCeilingDepartures: successorEvents.length,
    allMorningDepartures: allEvents.filter((e) => e.ownership !== 'player').length,
    recovery: {
      allCommercial: summarizeEvents(
        allEvents.filter((e) => e.ownership !== 'player'),
        'all_commercial',
      ),
      majorOnly: summarizeEvents(majorEvents, 'major_only'),
      successorTriggered: summarizeEvents(successorEvents, 'successor_trigger'),
      eliteOnly: summarizeEvents(
        majorEvents.filter((e) => e.isEliteLoss),
        'elite_slotQ90+',
      ),
      superEliteOnly: summarizeEvents(
        majorEvents.filter((e) => e.isSuperEliteLoss),
        'super_elite_slotQ95+',
      ),
    },
    sideEffects: {
      lowShareSpiralSnapshots: lowShareSpiralTotal,
      zombieLikeSnapshots: zombieLikeTotal,
    },
    oq2020: {
      commercialSnapshots: totalCommercial,
      meanOqAcrossRuns: meanOqRuns ? Math.round((sumMeanOq / meanOqRuns) * 100) / 100 : null,
      pctAbove90: pct(above90Total, totalCommercial),
      pct9599: pct(pct9599Weighted, totalCommercial),
      bucketCounts: bucketTotals,
      bucketPct,
    },
    playerSideEffects: {
      playerMorningDepartures: playerEvents.length,
      playerStationsAt2020: playerStations,
      playerStationsAbove95At2020: playerAbove95,
      playerMajorDepartures: playerEvents.filter((e) => e.isMajor).length,
      playerMajorRecovery: summarizeEvents(
        playerEvents.filter((e) => e.isMajor),
        'player_major',
      ),
    },
    breakdowns: {
      byMarketSize,
      byOwnership,
      byDepartSlotTier: byDepartTier,
      byFormatFamily: byFormatFamilySummary,
    },
    certProxy,
  };
}

function distanceFromTarget(value, target) {
  if (value == null || !Number.isFinite(value)) return 999;
  if (value >= target.lo && value <= target.hi) {
    return Math.abs(value - target.ideal);
  }
  if (value < target.lo) return target.lo - value + 5;
  return value - target.hi + 5;
}

function cohortRecovery(summary) {
  if (isSuccessorCeilingVariant(summary.variant)) {
    return summary.recovery.successorTriggered;
  }
  return summary.recovery.majorOnly;
}

function variantHitsAllTargets(summary) {
  const m = cohortRecovery(summary);
  const oq = summary.oq2020;
  const spiral = summary.sideEffects?.lowShareSpiralSnapshots ?? 0;
  return (
    m.pctFullyRecoverQuality >= TARGETS.pctFullyRecoverQuality.lo &&
    m.pctFullyRecoverQuality <= TARGETS.pctFullyRecoverQuality.hi &&
    m.pctExceedPriorQuality >= TARGETS.pctExceedPriorQuality.lo &&
    m.pctExceedPriorQuality <= TARGETS.pctExceedPriorQuality.hi &&
    m.medianYearsToRecoverQuality >= TARGETS.medianYearsToRecoverQuality.lo &&
    m.medianYearsToRecoverQuality <= TARGETS.medianYearsToRecoverQuality.hi &&
    oq.pct9599 >= TARGETS.pct9599.lo &&
    oq.pct9599 <= TARGETS.pct9599.hi &&
    oq.meanOqAcrossRuns >= TARGETS.meanOq.lo &&
    oq.meanOqAcrossRuns <= TARGETS.meanOq.hi &&
    spiral < 400
  );
}

function scoreVariant(summary) {
  const m = cohortRecovery(summary);
  const elite = summary.recovery.eliteOnly;
  const oq = summary.oq2020;
  let score = 0;

  score += distanceFromTarget(m.pctFullyRecoverQuality, TARGETS.pctFullyRecoverQuality) * 2;
  score += distanceFromTarget(m.pctExceedPriorQuality, TARGETS.pctExceedPriorQuality) * 1.5;
  score += distanceFromTarget(m.medianYearsToRecoverQuality, TARGETS.medianYearsToRecoverQuality) * 2;
  score += distanceFromTarget(oq.pct9599, TARGETS.pct9599) * 2.5;

  if (elite.departures >= 50) {
    score += distanceFromTarget(
      elite.medianYearsToRecoverRevenue,
      TARGETS.medianYearsToRecoverRevenueElite,
    ) * 1.5;
  }

  if (oq.meanOqAcrossRuns != null) {
    score += distanceFromTarget(oq.meanOqAcrossRuns, TARGETS.meanOq) * 1.5;
  }

  if (m.neverRecoveredQuality > m.departures * 0.35) {
    score += (m.neverRecoveredQuality / Math.max(1, m.departures) - 0.35) * 40;
  }

  return Math.round(score * 100) / 100;
}

function verdictForVariant(summary, score, bestScore) {
  if (summary.variant === 'A') return 'baseline';
  const m = cohortRecovery(summary);
  const oq = summary.oq2020;

  const inRecoveryBand =
    m.pctFullyRecoverQuality >= TARGETS.pctFullyRecoverQuality.lo &&
    m.pctFullyRecoverQuality <= TARGETS.pctFullyRecoverQuality.hi;
  const inExceedBand =
    m.pctExceedPriorQuality >= TARGETS.pctExceedPriorQuality.lo &&
    m.pctExceedPriorQuality <= TARGETS.pctExceedPriorQuality.hi;
  const inMedianBand =
    m.medianYearsToRecoverQuality >= TARGETS.medianYearsToRecoverQuality.lo &&
    m.medianYearsToRecoverQuality <= TARGETS.medianYearsToRecoverQuality.hi;
  const oqOk =
    oq.pct9599 >= TARGETS.pct9599.lo && oq.pct9599 <= TARGETS.pct9599.hi + 2;
  const meanOqOk =
    oq.meanOqAcrossRuns == null ||
    (oq.meanOqAcrossRuns >= TARGETS.meanOq.lo && oq.meanOqAcrossRuns <= TARGETS.meanOq.hi);

  if (
    score <= bestScore * 1.05 &&
    inRecoveryBand &&
    inExceedBand &&
    inMedianBand &&
    oqOk &&
    meanOqOk
  ) {
    return 'ship_candidate';
  }
  if (score <= bestScore * 1.2 && (inRecoveryBand || inMedianBand)) {
    return 'tune';
  }
  return 'leave_alone';
}

function reportVariantParams(variant) {
  const map = {
    J0: { fixedCap: 88, fixedPeriods: 8, risePerPeriod: 1 },
    J1: { fixedCap: 88, fixedPeriods: 6, risePerPeriod: 1 },
    J2: { fixedCap: 90, fixedPeriods: 6, risePerPeriod: 1 },
    J3: { fixedCap: 88, fixedPeriods: 6, risePerPeriod: 1.5 },
    J4: { fixedCap: 90, fixedPeriods: 6, risePerPeriod: 1.5 },
    J5: { fixedCap: 88, fixedPeriods: 4, risePerPeriod: 1 },
    J6: { fixedCap: 90, fixedPeriods: 4, risePerPeriod: 1 },
    J: { fixedCap: 88, fixedPeriods: 8, risePerPeriod: 1 },
  };
  return map[variant] || null;
}

function buildComparisonTable(summaries) {
  const headers = [
    'Variant',
    'Deps',
    'Recover Q%',
    'Exceed Q%',
    'Med yrs Q',
    'Mean OQ',
    'Pct>90',
    'Pct 95-99',
    'Spiral',
    'Score',
    'Ready',
    'Verdict',
  ];

  const rows = summaries.map((s) => {
    const m = cohortRecovery(s);
    const oq = s.oq2020;
    const cohortLabel = isSuccessorCeilingVariant(s.variant) ? 'succ' : 'major';
    return [
      s.variant,
      `${m.departures} (${cohortLabel})`,
      `${m.pctFullyRecoverQuality}%`,
      `${m.pctExceedPriorQuality}%`,
      m.medianYearsToRecoverQuality != null ? m.medianYearsToRecoverQuality.toFixed(2) : '—',
      oq.meanOqAcrossRuns != null ? oq.meanOqAcrossRuns.toFixed(1) : '—',
      `${oq.pctAbove90}%`,
      `${oq.pct9599}%`,
      String(s.sideEffects?.lowShareSpiralSnapshots ?? '—'),
      String(s._score),
      s._productionReady ? 'yes' : 'no',
      s._verdict,
    ];
  });

  return { headers, rows };
}

function buildParameterSensitivity(summaries) {
  const byVar = Object.fromEntries(summaries.map((s) => [s.variant, s]));
  const base = byVar.A;
  const e = byVar.E;
  if (!base || !e) return null;

  const metrics = [
    ['pctFullyRecoverQuality', 'recovery.majorOnly'],
    ['pctExceedPriorQuality', 'recovery.majorOnly'],
    ['medianYearsToRecoverQuality', 'recovery.majorOnly'],
    ['medianYearsToRecoverRevenue', 'recovery.eliteOnly'],
    ['pct9599', 'oq2020'],
    ['meanOqAcrossRuns', 'oq2020'],
  ];

  function pick(obj, path) {
    return path.split('.').reduce((o, k) => (o ? o[k] : null), obj);
  }

  function delta(from, to, path, key) {
    const a = pick(from, path)?.[key];
    const b = pick(to, path)?.[key];
    if (a == null || b == null) return null;
    return Math.round((b - a) * 100) / 100;
  }

  const comparisons = [
    { label: 'E vs A (combined shock+reset baseline)', from: 'A', to: 'E' },
    { label: 'F vs E (elite-only stronger reset)', from: 'E', to: 'F' },
    { label: 'G vs E (longer shock)', from: 'E', to: 'G' },
    { label: 'H vs E (revenue/appeal coupling)', from: 'E', to: 'H' },
    { label: 'I vs E (production combo)', from: 'E', to: 'I' },
  ];

  const rows = comparisons
    .filter((c) => byVar[c.from] && byVar[c.to])
    .map((c) => {
      const row = { comparison: c.label, from: c.from, to: c.to };
      for (const [key, path] of metrics) {
        row[key] = delta(byVar[c.from], byVar[c.to], path, key);
      }
      return row;
    });

  const movers = {};
  for (const [key] of metrics) {
    let best = { comp: null, abs: 0, dir: 0 };
    for (const row of rows) {
      const v = row[key];
      if (v == null) continue;
      const abs = Math.abs(v);
      if (abs > best.abs) best = { comp: row.comparison, abs, dir: v };
    }
    movers[key] = best.comp
      ? `${best.comp} (${best.dir > 0 ? '+' : ''}${best.dir})`
      : 'n/a';
  }

  return { rows, movers };
}

function inflationVerdict(baseline, candidate) {
  if (!baseline || !candidate) return 'unknown';
  const b9599 = baseline.oq2020.pct9599;
  const c9599 = candidate.oq2020.pct9599;
  const drop = b9599 - c9599;
  if (c9599 <= TARGETS.pct9599.hi && c9599 >= TARGETS.pct9599.lo) return 'solved';
  if (drop >= 5 && c9599 <= 14) return 'substantially_reduced';
  if (drop >= 2) return 'reduced_not_solved';
  return 'minimal_change';
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Morning recovery A/B diagnostic');
  if (report.gridJTuneMode) {
    lines.push('*(J successor ceiling tune grid: J0–J6)*');
  } else if (report.gridCeilingMode) {
    lines.push('*(successor ceiling grid: A, G, J, K, L)*');
  } else if (report.gridMode) {
    lines.push('*(follow-up grid: A, E, F, G, H, I)*');
  }
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Targets');
  lines.push('- Fully recover prior Q: 55–65%');
  lines.push('- Exceed prior Q: 25–35%');
  lines.push('- Median Q recovery: 2–4 years');
  lines.push('- Elite revenue median recovery: 1–2 years');
  lines.push('- 95–99 OQ bucket: 8–12%');
  lines.push('- Mean OQ: 62–66');
  lines.push('');
  lines.push('## Variant comparison (J/K/L use successor-trigger cohort; A/G use major cohort)');
  lines.push('');
  const { headers, rows } = report.comparisonTable;
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');
  lines.push('## Elite losses (slot Q ≥ 90)');
  lines.push('');
  lines.push('| Variant | Deps | Recover Q% | Exceed Q% | Med yrs Q | Med yrs rev |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const s of report.variants) {
    const e = s.recovery.eliteOnly;
    lines.push(
      `| ${s.variant} | ${e.departures} | ${e.pctFullyRecoverQuality}% | ${e.pctExceedPriorQuality}% | ${e.medianYearsToRecoverQuality ?? '—'} | ${e.medianYearsToRecoverRevenue ?? '—'} |`,
    );
  }
  lines.push('');
  lines.push(`## Recommendation: **${report.recommendationAction.toUpperCase()}** (variant ${report.recommendedVariant})`);
  lines.push('');
  lines.push(report.recommendationRationale);
  if (report.inflationAssessment) {
    lines.push('');
    lines.push(`**Quality inflation:** ${report.inflationAssessment}`);
  }
  if (report.parameterSensitivity?.movers) {
    lines.push('');
    lines.push('## Parameter levers (largest movers vs E)');
    lines.push('');
    for (const [k, v] of Object.entries(report.parameterSensitivity.movers)) {
      lines.push(`- **${k}**: ${v}`);
    }
  }
  if (report.productionImplementation) {
    lines.push('');
    lines.push('## Proposed minimal production implementation');
    lines.push('');
    lines.push(report.productionImplementation);
  }
  lines.push('');
  lines.push('## 2020 OQ bucket distribution');
  lines.push('');
  for (const s of report.variants) {
    lines.push(`### ${s.variant}`);
    lines.push(
      BUCKET_ORDER.map((b) => `${b}: ${s.oq2020.bucketPct[b]}%`).join(' · '),
    );
    lines.push('');
  }
  return lines.join('\n');
}

function buildProductionProposal(recommended) {
  if (!recommended || recommended.variant === 'A') {
    return 'No ceiling variant recommended — keep shipped behavior.';
  }
  const v = recommended.variant;
  const cfg = recommended._tuneParams || {};
  if (/^J\d?$/.test(v)) {
    const cap = cfg.fixedCap ?? 88;
    const fixed = cfg.fixedPeriods ?? 6;
    const rise = cfg.risePerPeriod ?? 1;
    return [
      '1. On successor-trigger morning departure (slot Q≥90 OR tenure≥12 & slot Q≥85 OR superstar): set `station.morningSuccessorCeiling`.',
      `2. Fixed cap ${cap} for ${fixed} periods; clamp morningDrive.quality in \`decay()\` after prog investment each turn.`,
      `3. After fixed window: ceiling += ${rise} per period until replacement tenure ≥8 and ceiling ≥ prior slot Q, then delete state.`,
      '4. Store on station: `{ ceiling, fixedCap, fixedPeriods, risePerPeriod, priorSlotQ, priorShare, periodsActive }`.',
      '5. Wire in real departure handlers (contract expiry, poach, player hire) — same trigger predicate as diagnostic.',
      '6. Call `refreshStationOQ(st, G)` after clamp; no separate AI path.',
    ].join('\n');
  }
  if (v === 'K' || v === 'L') {
    return [
      '1. On morning talent departure, if slot Q≥90 OR (slot Q≥85 AND tenure≥12) OR departing host superstar: set `station.morningSuccessorCeiling`.',
      '2. Initial cap = min(88, replacementRawQ+30, oldSlotQ−8); clamp morning slot Q each turn in `decay()`.',
      '3. Each period: cap += 0.5 base; +0.5 if share up vs departure book; +0.5 if prog spend high; slower if share/rev falling.',
      '4. Cap cannot exceed 95 until replacement tenure ≥8 periods; clear state when tenure met and cap ≥ prior slot Q.',
      v === 'L'
        ? '5. While gap >8 pts below prior slot Q: apply 3–8% calcRev multiplier decaying over ~14 periods.'
        : '5. Skip direct revenue drag unless playtests show revenue still instant-recovers.',
      '6. Hook only in legacy morning departure path + decay — no AI-only diagnostic patches.',
    ].join('\n');
  }
  return `Extend variant ${v} shock/reset logic from prior grid — ceiling alone may be insufficient.`;
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  const outJsonPath = config.gridJTune
    ? path.join(root, 'tmp', 'morning_recovery_j_tune_grid.json')
    : config.gridCeiling
      ? path.join(root, 'tmp', 'morning_recovery_ceiling_grid.json')
      : config.grid
        ? path.join(root, 'tmp', 'morning_recovery_ab_grid.json')
        : outJson;
  const outMdPath = config.gridJTune
    ? path.join(root, 'tmp', 'morning_recovery_j_tune_grid.md')
    : config.gridCeiling
      ? path.join(root, 'tmp', 'morning_recovery_ceiling_grid.md')
      : config.grid
        ? path.join(root, 'tmp', 'morning_recovery_ab_grid.md')
        : outMd;

  console.log('[diag:morning-recovery-ab] config', config);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const formatCatalog = loadFormatFamiliesCatalog();
  const ctx = loadVm(config.markets[0]);

  const variantSummaries = [];
  const t0 = Date.now();

  for (const variant of config.variants) {
    const vStart = Date.now();
    console.log(`[diag:morning-recovery-ab] running variant ${variant}…`);
    const results = ctx.__wlRunMorningRecoveryAb({ ...config, variant });
    const summary = aggregateVariantResults(variant, results, formatCatalog);
    variantSummaries.push(summary);
    console.log(
      `[diag:morning-recovery-ab] variant ${variant} done in ${((Date.now() - vStart) / 1000).toFixed(1)}s — cohort ${cohortRecovery(summary).departures}`,
    );
  }

  const baseline = variantSummaries.find((s) => s.variant === 'A' || s.variant === 'J0');
  for (const s of variantSummaries) {
    s._score = scoreVariant(s);
    s._productionReady = variantHitsAllTargets(s);
    s._tuneParams = reportVariantParams(s.variant);
  }

  const nonBaseline = variantSummaries.filter((s) => s.variant !== 'A');
  const bestScore = nonBaseline.length
    ? Math.min(...nonBaseline.map((s) => s._score))
    : 999;
  for (const s of variantSummaries) {
    s._verdict = verdictForVariant(s, s._score, bestScore);
  }

  nonBaseline.sort((a, b) => a._score - b._score);
  const recommended = nonBaseline[0] || baseline;

  let recommendationAction = 'abandon';
  if (recommended._productionReady) recommendationAction = 'ship';
  else if (recommended._verdict === 'ship_candidate') recommendationAction = 'ship';
  else if (recommended._verdict === 'tune') recommendationAction = 'tune';
  else if (recommended.variant === 'A' || recommended.variant === 'J0' || bestScore > 35) {
    recommendationAction = 'abandon';
  }

  const parameterSensitivity = buildParameterSensitivity(variantSummaries);
  const inflationAssessment = inflationVerdict(baseline, recommended);

  const comparisonTable = buildComparisonTable(variantSummaries);
  const rationaleParts = [];
  if (config.gridJTune) {
    const j0 = variantSummaries.find((s) => s.variant === 'J0');
    if (j0) {
      const r = cohortRecovery(j0);
      rationaleParts.push(
        `J0 baseline: ${r.pctFullyRecoverQuality}% recover, median Q ${r.medianYearsToRecoverQuality}y, 95–99 ${j0.oq2020.pct9599}%.`,
      );
    }
  } else if (baseline && baseline.variant === 'A') {
    const b = baseline.recovery.majorOnly;
    rationaleParts.push(
      `Baseline A: ${b.pctFullyRecoverQuality}% recover (major), 95–99 ${baseline.oq2020.pct9599}%, mean OQ ${baseline.oq2020.meanOqAcrossRuns}.`,
    );
  }
  const gVar = variantSummaries.find((s) => s.variant === 'G');
  if (gVar) {
    const r = gVar.recovery.majorOnly;
    rationaleParts.push(
      `Prior G (shock): ${r.pctFullyRecoverQuality}% recover, 95–99 ${gVar.oq2020.pct9599}%, median Q ${r.medianYearsToRecoverQuality}y.`,
    );
  }
  if (recommended && recommended.variant !== 'A') {
    const r = cohortRecovery(recommended);
    const el = recommended.recovery.eliteOnly;
    rationaleParts.push(
      `Best variant ${recommended.variant}: ${r.pctFullyRecoverQuality}% recover, ${r.pctExceedPriorQuality}% exceed, median Q ${r.medianYearsToRecoverQuality}y; elite median rev ${el.medianYearsToRecoverRevenue ?? '—'}y; 95–99 ${recommended.oq2020.pct9599}%; mean OQ ${recommended.oq2020.meanOqAcrossRuns}.`,
    );
  }
  if (parameterSensitivity?.movers) {
    rationaleParts.push(
      `Strongest levers: recover Q → ${parameterSensitivity.movers.pctFullyRecoverQuality}; 95–99 bucket → ${parameterSensitivity.movers.pct9599}; median Q time → ${parameterSensitivity.movers.medianYearsToRecoverQuality}.`,
    );
  }
  if (recommendationAction === 'ship' && recommended._productionReady) {
    rationaleParts.push('All target bands met — production-ready for gameplay integration.');
  } else if (recommendationAction === 'ship') {
    rationaleParts.push('Best score but not all hard targets met — near-ready, validate in playtest.');
  } else if (recommendationAction === 'tune') {
    rationaleParts.push('Directionally correct but misses one or more targets — continue tuning.');
  } else {
    rationaleParts.push('No tuned J variant improves enough over J0 — reconsider parameters.');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    gridMode: config.grid,
    gridCeilingMode: config.gridCeiling,
    gridJTuneMode: config.gridJTune,
    config,
    targets: TARGETS,
    variantDefinitions: {
      A: 'Baseline — current shipped behavior',
      G: 'Long shock + hard reset (prior best shock variant)',
      J0: 'Cap 88 for 8 periods, then +1/period (prior J baseline)',
      J1: 'Cap 88 for 6 periods, then +1/period',
      J2: 'Cap 90 for 6 periods, then +1/period',
      J3: 'Cap 88 for 6 periods, then +1.5/period',
      J4: 'Cap 90 for 6 periods, then +1.5/period',
      J5: 'Cap 88 for 4 periods, then +1/period',
      J6: 'Cap 90 for 4 periods, then +1/period',
      J: 'Alias for J0',
      K: 'Dynamic successor ceiling',
      L: 'Dynamic ceiling + calcRev drag',
      E: 'Combined shock + hard reset',
      F: 'Elite-only stronger reset',
      H: 'E + revenue/appeal coupling',
      I: 'Combined F + G + mild H',
    },
    recommendedVariant: recommended?.variant || 'J0',
    productionReady: !!recommended?._productionReady,
    recommendationAction,
    inflationAssessment,
    parameterSensitivity,
    productionImplementation: buildProductionProposal(recommended),
    recommendationRationale: rationaleParts.join(' '),
    comparisonTable,
    variants: variantSummaries,
  };

  writeFileSync(outJsonPath, JSON.stringify(report, null, 2));
  writeFileSync(outMdPath, renderMarkdown(report));

  console.log(`[diag:morning-recovery-ab] wrote ${outJsonPath}`);
  console.log(`[diag:morning-recovery-ab] wrote ${outMdPath}`);
  console.log('[diag:morning-recovery-ab] comparison:');
  console.table(
    comparisonTable.rows.map((row) =>
      Object.fromEntries(comparisonTable.headers.map((h, i) => [h, row[i]])),
    ),
  );
  console.log(`Recommendation: ${recommendationAction} — variant ${report.recommendedVariant} (production-ready: ${report.productionReady})`);
  console.log(`Inflation: ${inflationAssessment}`);
}

main();
