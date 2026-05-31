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
const hooksPath = path.join(root, 'scripts/diag-morning-recovery-ab-hooks.vm.js');
const runnerPath = path.join(root, 'scripts/diag-morning-recovery-ab-runner.vm.js');
const outJson = path.join(root, 'tmp', 'morning_recovery_ab.json');
const outMd = path.join(root, 'tmp', 'morning_recovery_ab.md');

const ALL_VARIANTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const GRID_VARIANTS = ['A', 'E', 'F', 'G', 'H', 'I'];
const BUCKET_ORDER = ['lt50', '50-59', '60-69', '70-79', '80-89', '90-94', '95-99'];
const DEPART_TIERS = ['lt70', '70-84', '85-94', '95+'];
const MARKET_TIERS = ['mega', 'large', 'medium', 'small'];
const OWNERSHIP_KEYS = ['independent', 'corporate', 'player'];

const TARGETS = {
  pctFullyRecoverQuality: { lo: 55, hi: 65, ideal: 60 },
  pctExceedPriorQuality: { lo: 25, hi: 35, ideal: 30 },
  medianYearsToRecoverQuality: { lo: 1.5, hi: 3.0, ideal: 2.0 },
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
  };
  for (const a of argv) {
    if (a === '--grid') {
      o.grid = true;
      o.variants = [...GRID_VARIANTS];
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
  const playerEvents = allEvents.filter((e) => e.ownership === 'player');

  const bucketTotals = emptyBuckets();
  let totalCommercial = 0;
  let sumMeanOq = 0;
  let meanOqRuns = 0;
  let above90Total = 0;
  let pct9599Weighted = 0;
  let playerStations = 0;
  let playerAbove95 = 0;
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
    allMorningDepartures: allEvents.filter((e) => e.ownership !== 'player').length,
    recovery: {
      allCommercial: summarizeEvents(
        allEvents.filter((e) => e.ownership !== 'player'),
        'all_commercial',
      ),
      majorOnly: summarizeEvents(majorEvents, 'major_only'),
      eliteOnly: summarizeEvents(
        majorEvents.filter((e) => e.isEliteLoss),
        'elite_slotQ90+',
      ),
      superEliteOnly: summarizeEvents(
        majorEvents.filter((e) => e.isSuperEliteLoss),
        'super_elite_slotQ95+',
      ),
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

function scoreVariant(summary) {
  const m = summary.recovery.majorOnly;
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
  const m = summary.recovery.majorOnly;
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

function buildComparisonTable(summaries) {
  const headers = [
    'Variant',
    'Major deps',
    'Recover Q%',
    'Exceed Q%',
    'Med yrs Q',
    'Rev recover%',
    'Med yrs rev',
    'Mean OQ',
    'Pct>90',
    'Pct 95-99',
    'Score',
    'Verdict',
  ];

  const rows = summaries.map((s) => {
    const m = s.recovery.majorOnly;
    const oq = s.oq2020;
    return [
      s.variant,
      String(m.departures),
      `${m.pctFullyRecoverQuality}%`,
      `${m.pctExceedPriorQuality}%`,
      m.medianYearsToRecoverQuality != null ? m.medianYearsToRecoverQuality.toFixed(2) : '—',
      `${m.pctRecoverRevenue}%`,
      m.medianYearsToRecoverRevenue != null ? m.medianYearsToRecoverRevenue.toFixed(2) : '—',
      oq.meanOqAcrossRuns != null ? oq.meanOqAcrossRuns.toFixed(1) : '—',
      `${oq.pctAbove90}%`,
      `${oq.pct9599}%`,
      String(s._score),
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
  if (report.gridMode) lines.push('*(follow-up grid: A, E, F, G, H, I)*');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Targets');
  lines.push('- Fully recover prior Q: 55–65%');
  lines.push('- Exceed prior Q: 25–35%');
  lines.push('- Median Q recovery: 1.5–3.0 years');
  lines.push('- Elite revenue median recovery: 1–2 years');
  lines.push('- 95–99 OQ bucket: 8–12%');
  lines.push('- Mean OQ: 62–66');
  lines.push('');
  lines.push('## Variant comparison (major morning departures)');
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

function main() {
  const config = parseArgs(process.argv.slice(2));
  const outJsonPath = config.grid
    ? path.join(root, 'tmp', 'morning_recovery_ab_grid.json')
    : outJson;
  const outMdPath = config.grid
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
      `[diag:morning-recovery-ab] variant ${variant} done in ${((Date.now() - vStart) / 1000).toFixed(1)}s — major ${summary.recovery.majorOnly.departures}, elite ${summary.recovery.eliteOnly.departures}`,
    );
  }

  const baseline = variantSummaries.find((s) => s.variant === 'A');
  for (const s of variantSummaries) {
    s._score = scoreVariant(s);
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
  if (recommended._verdict === 'ship_candidate') recommendationAction = 'ship';
  else if (recommended._verdict === 'tune') recommendationAction = 'tune';
  else if (recommended.variant === 'A' || bestScore > 35) recommendationAction = 'abandon';

  const parameterSensitivity = buildParameterSensitivity(variantSummaries);
  const inflationAssessment = inflationVerdict(baseline, recommended);

  const comparisonTable = buildComparisonTable(variantSummaries);
  const rationaleParts = [];
  if (baseline) {
    const b = baseline.recovery.majorOnly;
    rationaleParts.push(
      `Baseline A: ${b.pctFullyRecoverQuality}% recover, ${b.pctExceedPriorQuality}% exceed, median Q ${b.medianYearsToRecoverQuality}y; 95–99 ${baseline.oq2020.pct9599}%; mean OQ ${baseline.oq2020.meanOqAcrossRuns}.`,
    );
  }
  const eVar = variantSummaries.find((s) => s.variant === 'E');
  if (eVar) {
    const r = eVar.recovery.majorOnly;
    rationaleParts.push(
      `Prior E: ${r.pctFullyRecoverQuality}% recover, 95–99 ${eVar.oq2020.pct9599}%, mean OQ ${eVar.oq2020.meanOqAcrossRuns}.`,
    );
  }
  if (recommended && recommended.variant !== 'A') {
    const r = recommended.recovery.majorOnly;
    const el = recommended.recovery.eliteOnly;
    rationaleParts.push(
      `Best grid variant ${recommended.variant}: major recover ${r.pctFullyRecoverQuality}%, exceed ${r.pctExceedPriorQuality}%, median Q ${r.medianYearsToRecoverQuality}y; elite median rev ${el.medianYearsToRecoverRevenue ?? '—'}y; 95–99 ${recommended.oq2020.pct9599}%; mean OQ ${recommended.oq2020.meanOqAcrossRuns}.`,
    );
  }
  if (parameterSensitivity?.movers) {
    rationaleParts.push(
      `Strongest levers: recover Q → ${parameterSensitivity.movers.pctFullyRecoverQuality}; 95–99 bucket → ${parameterSensitivity.movers.pct9599}; median Q time → ${parameterSensitivity.movers.medianYearsToRecoverQuality}.`,
    );
  }
  if (recommendationAction === 'ship') {
    rationaleParts.push('Meets target bands — candidate for gameplay integration.');
  } else if (recommendationAction === 'tune') {
    rationaleParts.push('Directionally correct but misses one or more targets — tune parameters.');
  } else {
    rationaleParts.push('No grid variant beats E enough to justify shipping; consider abandoning or redesigning levers.');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    gridMode: config.grid,
    config,
    targets: TARGETS,
    variantDefinitions: {
      A: 'Baseline — current shipped behavior',
      E: 'Combined shock + hard reset (prior strongest)',
      F: 'Elite-only stronger reset (slot Q≥90 or tenure≥12 & slot Q≥85)',
      G: 'E + longer shock (8–12 periods, stronger prog drag, gradual decay)',
      H: 'E + revenue/appeal coupling (2–6 period share drag)',
      I: 'Combined F + G + mild H (production candidate)',
    },
    recommendedVariant: recommended?.variant || 'A',
    recommendationAction,
    inflationAssessment,
    parameterSensitivity,
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
  console.log(`Recommendation: ${recommendationAction} — variant ${report.recommendedVariant}`);
  console.log(`Inflation: ${inflationAssessment}`);
}

main();
