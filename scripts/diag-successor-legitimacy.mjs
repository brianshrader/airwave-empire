#!/usr/bin/env node
/**
 * Internal Promotion / Successor Legitimacy Study (diagnostic only).
 *
 *   npm run diag:successor-legitimacy
 *   npm run diag:successor-legitimacy -- --runs=2
 *
 * Output: tmp/successor_legitimacy_summary.json, tmp/successor_legitimacy_summary.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectRecoveryAbHooks } from './diag-morning-recovery-ab-patches.mjs';
import { buildRecoveryReport, summarizeRecoveryGroup } from './successorRecoveryMetrics.mjs';
import { loadFormatFamiliesCatalog } from './formatFamilyHelpers.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const ceilingPath = path.join(root, 'src', 'morningSuccessorCeiling.js');
const hooksPath = path.join(root, 'scripts/diag-successor-legitimacy-hooks.vm.js');
const runnerPath = path.join(root, 'scripts/diag-successor-legitimacy-runner.vm.js');
const outJson = path.join(root, 'tmp', 'successor_legitimacy_summary.json');
const outMd = path.join(root, 'tmp', 'successor_legitimacy_summary.md');

const VARIANTS = ['J1', 'P1', 'P2', 'P3', 'P4', 'PROD'];
const PATCH_VARIANTS = new Set(['J1', 'P1', 'P2', 'P3', 'P4']);
const REPLACEMENT_TYPES = ['external', 'internal', 'cluster'];
const BENCH_DEPTHS = ['deep', 'moderate', 'thin'];

const TARGETS = {
  pctFullyRecoverQuality: { lo: 55, hi: 65 },
  pctExceedPriorQuality: { lo: 25, hi: 35 },
  medianYearsToRecoverQuality: { lo: 2.0, hi: 4.0 },
  pct9599: { lo: 8, hi: 12 },
  meanOq: { lo: 62, hi: 66 },
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

function loadVm(marketId, variant) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  try {
    vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  } catch (_e) {
    /* optional */
  }
  vm.runInContext(readFileSync(ceilingPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(
    readFileSync(path.join(__dirname, 'successorRecoveryRunnerHelpers.vm.js'), 'utf8'),
    ctx,
    { timeout: 600_000 },
  );
  const usePatches = PATCH_VARIANTS.has(variant);
  let legacy = injectHeadlessLaunchNewsGuard(
    patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId),
  );
  if (usePatches) {
    legacy = injectRecoveryAbHooks(legacy);
  }
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(
    'showToast=function(){}; showToastWithSubscribeCta=function(){};',
    ctx,
  );
  if (usePatches) {
    vm.runInContext(readFileSync(hooksPath, 'utf8'), ctx, { timeout: 600_000 });
  }
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 2,
    seed: 20260601,
    markets: [...ALL_PLAYABLE_MARKET_IDS],
    startYears: [1970, 1985, 2000],
    variants: [...VARIANTS],
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || o.runs);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--markets=')) {
      o.markets = a
        .slice(10)
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    }     else if (a.startsWith('--variants=')) {
      o.variants = a
        .slice(11)
        .split(',')
        .map((x) => x.trim().toUpperCase())
        .filter((v) => VARIANTS.includes(v));
    } else if (a === '--production') {
      o.variants = ['PROD'];
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

function summarizeEvents(events, label) {
  const n = events.length;
  const recoveredQ = events.filter((e) => e.recoveredQuality);
  const exceededQ = events.filter((e) => e.exceededQuality);
  const recoveredRev = events.filter((e) => e.recoveredRevenue);

  return {
    label,
    departures: n,
    pctFullyRecoverQuality: pct(recoveredQ.length, n),
    pctExceedPriorQuality: pct(exceededQ.length, n),
    avgYearsToRecoverQuality: mean(
      events.map((e) => e.yearsToRecoverQuality).filter((y) => y != null),
    ),
    medianYearsToRecoverQuality: median(
      events.map((e) => e.yearsToRecoverQuality).filter((y) => y != null),
    ),
    pctRecoverRevenue: pct(recoveredRev.length, n),
    medianYearsToRecoverRevenue: median(
      events.map((e) => e.yearsToRecoverRevenue).filter((y) => y != null),
    ),
    avgImmediateSlotQDrop: mean(events.map((e) => e.departingSlotQ - e.replacementSlotQ)),
  };
}

function aggregateVariant(variant, results, formatCatalog) {
  const ok = results.filter((r) => r.ok);
  const events = ok.flatMap((r) => r.events || []);

  let totalCommercial = 0;
  let sumMeanOq = 0;
  let meanOqRuns = 0;
  let pct9599Weighted = 0;
  let above90Total = 0;
  let spiralTotal = 0;
  let zombieTotal = 0;
  const certByMarket = {};

  for (const r of ok) {
    const snap = r.snapshot2020;
    if (!snap) continue;
    totalCommercial += snap.commercialCount || 0;
    if (snap.meanOq != null) {
      sumMeanOq += snap.meanOq;
      meanOqRuns += 1;
    }
    above90Total += Math.round(((snap.pctAbove90 || 0) / 100) * (snap.commercialCount || 0));
    pct9599Weighted += ((snap.pct9599 || 0) / 100) * (snap.commercialCount || 0);
    spiralTotal += snap.lowShareSpiral || 0;
    zombieTotal += snap.zombieLike || 0;

    const mid = r.marketId;
    if (!certByMarket[mid]) certByMarket[mid] = { meanOq: [], pct9599: [] };
    if (snap.meanOq != null) certByMarket[mid].meanOq.push(snap.meanOq);
    certByMarket[mid].pct9599.push(snap.pct9599 || 0);
  }

  const byReplacementType = {};
  for (const t of REPLACEMENT_TYPES) {
    byReplacementType[t] = summarizeEvents(
      events.filter((e) => e.replacementType === t),
      t,
    );
  }

  const byBenchDepth = {};
  for (const d of BENCH_DEPTHS) {
    byBenchDepth[d] = summarizeEvents(
      events.filter((e) => e.benchDepth === d),
      d,
    );
  }

  const withStrongBench = events.filter((e) => e.strongCandidates >= 1);
  const withoutStrongBench = events.filter((e) => e.strongCandidates === 0);

  const replacementMix = {
    external: events.filter((e) => e.replacementType === 'external').length,
    internal: events.filter((e) => e.replacementType === 'internal').length,
    cluster: events.filter((e) => e.replacementType === 'cluster').length,
    vacant: events.filter((e) => e.replacementType === 'vacant').length,
  };

  const classificationMix = {
    native: events.filter((e) => e.classificationSource === 'native').length,
    diagnostic_bench_promotion: events.filter(
      (e) => e.classificationSource === 'diagnostic_bench_promotion',
    ).length,
    diagnostic_cluster_transfer: events.filter(
      (e) => e.classificationSource === 'diagnostic_cluster_transfer',
    ).length,
    diagnostic_external_retained: events.filter(
      (e) => e.classificationSource === 'diagnostic_external_retained',
    ).length,
  };

  const stationsWithStrongBench = new Set(
    events.filter((e) => e.strongCandidates >= 1).map((e) => e.stationId),
  ).size;

  const certProxy = {};
  for (const [mid, data] of Object.entries(certByMarket)) {
    certProxy[mid] = {
      runs: data.meanOq.length,
      meanOq: mean(data.meanOq),
      pct9599: mean(data.pct9599),
    };
  }

  const recoveryReport = buildRecoveryReport(
    events.filter((e) => e.isSuccessorDeparture !== false),
  );

  return {
    variant,
    runs: { total: results.length, ok: ok.length, failed: results.length - ok.length },
    successorEvents: events.length,
    recoveryReport,
    overall: summarizeEvents(events, 'overall'),
    overallRecoveryClean: recoveryReport.headline,
    byReplacementType,
    byReplacementTypeRecoveryClean: {
      internal: recoveryReport.byTypeAndTiming.internal?.all || null,
      external: recoveryReport.byTypeAndTiming.external?.all || null,
      cluster: recoveryReport.byTypeAndTiming.cluster?.all || null,
    },
    byBenchDepth,
    benchComparison: {
      withStrongBench: summarizeEvents(withStrongBench, 'with_strong_bench'),
      withoutStrongBench: summarizeEvents(withoutStrongBench, 'without_strong_bench'),
    },
    replacementMix,
    classificationMix,
    diagnosticOverlay:
      'Passive AI external-hires into morning vacancies; successor cohort rewrites a deterministic share into internal/cluster moves from pre-turn bench maps.',
    benchAnalysis: {
      stationsWithStrongBenchAtLoss: stationsWithStrongBench,
      pctInternalOfSuccessor: pct(replacementMix.internal, events.length),
      pctExternalOfSuccessor: pct(replacementMix.external, events.length),
      pctClusterOfSuccessor: pct(replacementMix.cluster, events.length),
      internalVsExternalRecoverGap:
        (recoveryReport.byTypeAndTiming.internal?.all?.pctRecovered || 0) -
        (recoveryReport.byTypeAndTiming.external?.all?.pctRecovered || 0),
      internalVsExternalMedianGap:
        recoveryReport.byTypeAndTiming.internal?.all?.medianYears != null &&
        recoveryReport.byTypeAndTiming.external?.all?.medianYears != null
          ? Math.round(
              ((recoveryReport.byTypeAndTiming.external.all.medianYears -
                recoveryReport.byTypeAndTiming.internal.all.medianYears) +
                Number.EPSILON) *
                100,
            ) / 100
          : null,
      internalVsExternalRecoverGapLegacy:
        (byReplacementType.internal?.pctFullyRecoverQuality || 0) -
        (byReplacementType.external?.pctFullyRecoverQuality || 0),
    },
    elite: summarizeEvents(events.filter((e) => e.isEliteLoss), 'elite'),
    superElite: summarizeEvents(events.filter((e) => e.isSuperEliteLoss), 'super_elite'),
    oq2020: {
      commercialSnapshots: totalCommercial,
      meanOqAcrossRuns: meanOqRuns ? Math.round((sumMeanOq / meanOqRuns) * 100) / 100 : null,
      pctAbove90: pct(above90Total, totalCommercial),
      pct9599: pct(pct9599Weighted, totalCommercial),
    },
    sideEffects: {
      lowShareSpiralSnapshots: spiralTotal,
      zombieLikeSnapshots: zombieTotal,
    },
    certProxy,
  };
}

function hitsInflationTargets(summary) {
  const oq = summary.oq2020;
  const spiral = summary.sideEffects?.lowShareSpiralSnapshots ?? 999;
  return (
    oq.meanOqAcrossRuns >= TARGETS.meanOq.lo &&
    oq.meanOqAcrossRuns <= TARGETS.meanOq.hi &&
    oq.pct9599 >= TARGETS.pct9599.lo &&
    oq.pct9599 <= TARGETS.pct9599.hi &&
    spiral < 400
  );
}

function hitsRecoveryOrdering(summary) {
  const by = summary.byReplacementType;
  const intMed = by.internal?.medianYearsToRecoverQuality;
  const extMed = by.external?.medianYearsToRecoverQuality;
  const clMed = by.cluster?.medianYearsToRecoverQuality;
  if (by.internal.departures < 20 || by.external.departures < 20) return false;
  const intRecover = by.internal.pctFullyRecoverQuality;
  const extRecover = by.external.pctFullyRecoverQuality;
  const orderRecover = intRecover >= extRecover;
  const orderMedian =
    intMed != null && extMed != null && intMed <= extMed &&
    (clMed == null || by.cluster.departures < 10 || (clMed >= intMed && clMed <= extMed));
  return orderRecover && orderMedian;
}

function scoreVariant(summary) {
  const o = summary.overall;
  let score = 0;
  const dist = (v, lo, hi) => {
    if (v == null) return 20;
    if (v >= lo && v <= hi) return 0;
    if (v < lo) return lo - v + 3;
    return v - hi + 3;
  };
  score += dist(o.pctFullyRecoverQuality, TARGETS.pctFullyRecoverQuality.lo, TARGETS.pctFullyRecoverQuality.hi) * 2;
  score += dist(o.medianYearsToRecoverQuality, TARGETS.medianYearsToRecoverQuality.lo, TARGETS.medianYearsToRecoverQuality.hi) * 2;
  score += dist(summary.oq2020.pct9599, TARGETS.pct9599.lo, TARGETS.pct9599.hi) * 3;
  if (!hitsRecoveryOrdering(summary)) score += 15;
  return Math.round(score * 100) / 100;
}

function buildProductionProposal(winner) {
  if (!winner) return 'No variant selected.';
  const v = winner.variant;
  return [
    '## Production design: successor ceiling + legitimacy',
    '',
    '### Trigger (all variants)',
    'Apply `morningSuccessorCeiling` when morning talent departs and:',
    '- departing slot Q ≥ 90, OR',
    '- departing slot Q ≥ 85 AND tenure ≥ 12 periods, OR',
    '- departing host `superstar === true`.',
    '',
    '### Replacement classification (at hire/promotion time)',
    '- **Internal**: new morning talent ID was on another daypart at same station pre-turn.',
    '- **Cluster**: new talent ID was on another station with same `corpOwner`.',
    '- **External**: neither.',
    '',
    '### J1 base ceiling (all variants)',
    '- External fixed cap **88** for **6** periods, then **+1**/period.',
    '- Clear when replacement tenure ≥ 8 and ceiling ≥ prior slot Q.',
    '- Clamp in `decay()` after prog investment; `refreshStationOQ` after clamp.',
    '',
    v === 'J1'
      ? '### Control: no legitimacy bonus beyond classification telemetry.'
      : v === 'P1'
        ? '### P1: Internal trust transfer\n- On internal promotion only: `newSlotQ += 0.25 × (departSlotQ − newSlotQ)` before ceiling clamp.'
        : v === 'P2'
          ? '### P2: Tiered initial ceiling\n- Internal cap **92**, cluster **90**, external **88**; same 6-period fixed window + rise.'
          : v === 'P3'
            ? '### P3: P1 + P2 combined\n- Trust transfer for internal + tiered initial caps.'
            : '### P4: Bench-strength scaled\n- Trust transfer: internal up to 25%, cluster up to 12% scaled by bench score.\n- Initial cap: internal up to 92, cluster up to 90, from tenure/slot Q/talent Q/identity.',
    '',
    '### Station state',
    '```js',
    'station.morningSuccessorCeiling = {',
    '  ceiling, fixedCap, fixedPeriods: 6, risePerPeriod: 1,',
    '  priorSlotQ, priorShare, periodsActive, replacementType',
    '};',
    '```',
    '',
    '### Integration points',
    '1. Morning departure handlers (AI contract, poach, player move).',
    '2. `decay()` — step ceiling, clamp morning slot Q.',
    '3. Optional UI: show successor legitimacy tier on talent move.',
  ].join('\n');
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Successor Legitimacy Study');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(
    `> ${report.diagnosticOverlayNote || 'Diagnostic overlay rewrites external successor hires into internal/cluster moves when bench depth supports it.'}`,
  );
  lines.push('');
  lines.push('## J1 vs P1–P4 (successor-trigger cohort)');
  lines.push('');
  const { headers, rows } = report.comparisonTable;
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  lines.push('');
  lines.push(`## Recommendation: **${report.recommendedVariant}** (${report.productionReady ? 'production-ready' : 'tune further'})`);
  lines.push('');
  lines.push(report.recommendationRationale);
  lines.push('');
  for (const v of report.variants) {
    lines.push(`### ${v.variant} — recovery by replacement type (integrity-clean headline)`);
    lines.push('');
    const rr = v.recoveryReport;
    if (rr) {
      lines.push(
        `Headline (clean): ${rr.headline?.pctRecovered ?? '—'}% recover, median ${rr.headline?.medianYears ?? '—'}y; excluded ${rr.integrityExcluded} integrity-flagged / ${rr.impossibleImmediateEndOfFill} impossible immediate.`,
      );
      lines.push('');
      lines.push('| Type | Count | Recover% | Med yrs | Same-turn | Delayed |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      for (const t of REPLACEMENT_TYPES) {
        const b = rr.byTypeAndTiming[t]?.all;
        const st = rr.byTypeAndTiming[t]?.same_turn;
        const dl = rr.byTypeAndTiming[t]?.delayed;
        lines.push(
          `| ${t} | ${b?.count ?? 0} | ${b?.pctRecovered ?? '—'}% | ${b?.medianYears ?? '—'} | ${st?.pctRecovered ?? '—'}% | ${dl?.pctRecovered ?? '—'}% |`,
        );
      }
    }
    lines.push('');
    lines.push(`### ${v.variant} — legacy end-of-turn metrics`);
    lines.push('');
    lines.push('| Type | Deps | Recover Q% | Exceed Q% | Med yrs Q |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const t of REPLACEMENT_TYPES) {
      const b = v.byReplacementType[t];
      lines.push(
        `| ${t} | ${b.departures} | ${b.pctFullyRecoverQuality}% | ${b.pctExceedPriorQuality}% | ${b.medianYearsToRecoverQuality ?? '—'} |`,
      );
    }
    lines.push('');
  }
  lines.push('## Production implementation');
  lines.push('');
  lines.push(report.productionImplementation);
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log('[diag:successor-legitimacy]', config);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  loadFormatFamiliesCatalog();

  const summaries = [];
  const t0 = Date.now();

  for (const variant of config.variants) {
    const vStart = Date.now();
    console.log(`[diag:successor-legitimacy] running ${variant}…`);
    const ctx = loadVm(config.markets[0], variant);
    const results = ctx.__wlRunSuccessorLegitimacy({ ...config, variant });
    const summary = aggregateVariant(variant, results);
    summary._score = scoreVariant(summary);
    summaries.push(summary);
    console.log(
      `[diag:successor-legitimacy] ${variant} done ${((Date.now() - vStart) / 1000).toFixed(1)}s — events ${summary.successorEvents}, internal ${summary.replacementMix.internal}`,
    );
  }

  summaries.sort((a, b) => a._score - b._score);
  const j1 = summaries.find((s) => s.variant === 'J1');
  const recommended = summaries[0];
  const productionReady =
    hitsInflationTargets(recommended) &&
    hitsRecoveryOrdering(recommended) &&
    recommended.overall.medianYearsToRecoverQuality >= TARGETS.medianYearsToRecoverQuality.lo &&
    recommended.overall.medianYearsToRecoverQuality <= TARGETS.medianYearsToRecoverQuality.hi;

  const comparisonTable = {
    headers: [
      'Variant',
      'Events',
      'Recover Q%',
      'Exceed Q%',
      'Med yrs Q',
      'Mean OQ',
      '95–99%',
      'Spiral',
      'Int recover%',
      'Ext recover%',
      'Int−Ext med',
      'Score',
    ],
    rows: summaries
      .slice()
      .sort((a, b) => {
        const order = VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant);
        return order;
      })
      .map((s) => {
        const o = s.overall;
        const by = s.byReplacementType;
        return [
          s.variant,
          String(s.successorEvents),
          `${o.pctFullyRecoverQuality}%`,
          `${o.pctExceedPriorQuality}%`,
          o.medianYearsToRecoverQuality != null ? o.medianYearsToRecoverQuality.toFixed(2) : '—',
          s.oq2020.meanOqAcrossRuns != null ? s.oq2020.meanOqAcrossRuns.toFixed(1) : '—',
          `${s.oq2020.pct9599}%`,
          String(s.sideEffects.lowShareSpiralSnapshots),
          `${by.internal?.pctFullyRecoverQuality ?? '—'}%`,
          `${by.external?.pctFullyRecoverQuality ?? '—'}%`,
          s.benchAnalysis.internalVsExternalMedianGap != null
            ? String(s.benchAnalysis.internalVsExternalMedianGap)
            : '—',
          String(s._score),
        ];
      }),
  };

  const rationale = [];
  if (j1) {
    rationale.push(
      `J1 control: ${j1.overall.pctFullyRecoverQuality}% recover, median ${j1.overall.medianYearsToRecoverQuality}y, 95–99 ${j1.oq2020.pct9599}%; internal ${j1.replacementMix.internal} / external ${j1.replacementMix.external} / cluster ${j1.replacementMix.cluster}.`,
    );
  }
  if (recommended) {
    rationale.push(
      `Best variant ${recommended.variant}: ${recommended.overall.pctFullyRecoverQuality}% recover, median ${recommended.overall.medianYearsToRecoverQuality}y, 95–99 ${recommended.oq2020.pct9599}%; internal recover ${recommended.byReplacementType.internal?.pctFullyRecoverQuality}% vs external ${recommended.byReplacementType.external?.pctFullyRecoverQuality}%.`,
    );
  }
  if (productionReady) {
    rationale.push('Meets inflation guardrails and internal>external recovery ordering — ready for gameplay integration.');
  } else {
    rationale.push('Does not yet meet all success criteria — tune or combine partial winners.');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    config,
    targets: TARGETS,
    variantDefinitions: {
      J1: 'Control — J1 successor ceiling, no legitimacy bonus',
      P1: 'Internal trust transfer — 25% of departing-minus-replacement Q gap',
      P2: 'Tiered ceiling — internal 92, cluster 90, external 88',
      P3: 'P1 + P2 combined',
      P4: 'Bench-strength scaled trust + ceiling',
      PROD: 'Shipped production — J1 ceiling + P1 trust transfer + AI internal promotion',
    },
    recommendedVariant: recommended?.variant || 'J1',
    productionReady,
    recommendationRationale: rationale.join(' '),
    comparisonTable,
    productionImplementation: buildProductionProposal(recommended),
    diagnosticOverlayNote:
      'Passive AI always external-hires vacant morning slots. This harness deterministically rewrites a share of successor departures into internal promotions (bench) or cluster transfers so P1–P4 can be measured. J1 uses the same rewritten mix without legitimacy bonuses.',
    variants: summaries.slice().sort((a, b) => VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant)),
    answers: {
      internalPromotionImprovesRealismWithoutInflation:
        recommended?.variant !== 'J1' &&
        hitsInflationTargets(recommended) &&
        (recommended?.benchAnalysis.internalVsExternalRecoverGap || 0) > 0,
      strongBenchStrategicallyValuable:
        (j1?.benchComparison.withStrongBench?.pctFullyRecoverQuality || 0) >
        (j1?.benchComparison.withoutStrongBench?.pctFullyRecoverQuality || 0),
      deepBenchRecoversFaster:
        (j1?.byBenchDepth.deep?.medianYearsToRecoverQuality ?? 99) <
        (j1?.byBenchDepth.thin?.medianYearsToRecoverQuality ?? 0),
      bestReflectsBroadcastSuccession: recommended?.variant || 'J1',
    },
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, renderMarkdown(report));

  console.log('[diag:successor-legitimacy] wrote', outJson);
  console.table(
    comparisonTable.rows.map((row) =>
      Object.fromEntries(comparisonTable.headers.map((h, i) => [h, row[i]])),
    ),
  );
  console.log(`Recommendation: ${report.recommendedVariant} — production-ready: ${productionReady}`);
}

main();
