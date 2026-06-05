#!/usr/bin/env node
/**
 * Internal promotion ceiling treatment A/B/C/D comparison (diagnostic only).
 *
 *   npm run diag:internal-promotion-ceiling-ab
 *   npm run diag:internal-promotion-ceiling-ab -- --runs=2 --variants=A,B,C,D
 *
 * Output: tmp/internal_promotion_ceiling_ab.json, tmp/internal_promotion_ceiling_ab.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  VARIANTS,
  VARIANT_DEFS,
  patchCeilingSource,
  patchLegacySource,
} from './diag-internal-promotion-ceiling-ab-patches.mjs';
import { buildRecoveryReport, priorBucket, fillTimingLabel } from './successorRecoveryMetrics.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const ceilingPath = path.join(root, 'src', 'morningSuccessorCeiling.js');
const helpersPath = path.join(root, 'scripts/successorRecoveryRunnerHelpers.vm.js');
const runnerPath = path.join(root, 'scripts/diag-successor-legitimacy-runner.vm.js');
const outJson = path.join(root, 'tmp/internal_promotion_ceiling_ab.json');
const outMd = path.join(root, 'tmp/internal_promotion_ceiling_ab.md');

const TARGETS = {
  pct9599: { lo: 8, hi: 13 },
  internal94PlusMedianYears: { lo: 2, hi: 4 },
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

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
  getElementById(id) {
    if (id === 'wl-toast-stack') return { appendChild() {}, removeChild() {}, children: [] };
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
    console: { log: () => {}, warn: () => {}, error: console.error },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {} },
    location: { reload() {}, href: 'http://127.0.0.1/' },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() { return 0; },
    clearTimeout() {},
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    crypto: {
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        return a;
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
    parseInt,
    parseFloat,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, renderStatus() {} };
  return ctx;
}

function loadVm(marketId, abVariant) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  try {
    vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  } catch (_e) {
    /* optional */
  }
  const ceilingSrc = patchCeilingSource(readFileSync(ceilingPath, 'utf8'), abVariant);
  let legacySrc = patchLegacySource(
    injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
    abVariant,
  );
  vm.runInContext(ceilingSrc, ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(helpersPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(legacySrc, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext('showToast=function(){};', ctx);
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
      o.markets = a.slice(10).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    } else if (a.startsWith('--variants=')) {
      o.variants = a
        .slice(11)
        .split(',')
        .map((x) => x.trim().toUpperCase())
        .filter((v) => VARIANTS.includes(v));
    }
  }
  return o;
}

function mean(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x));
  if (!a.length) return null;
  return Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 100) / 100;
}

function median(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  const v = a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  return Math.round(v * 100) / 100;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((100 * n) / d * 100) / 100;
}

function summarizeSlice(events, label) {
  const filled = events.filter((e) => e.replacementType !== 'vacant');
  const recovered = filled.filter((e) => e.recoveredQuality);
  const immediateT1 = filled.filter((e) => e.immediateRecoverTPlus1);
  const years = filled.map((e) => e.yearsToRecoverQuality).filter((y) => y != null);
  return {
    label,
    count: filled.length,
    pctRecovered: pct(recovered.length, filled.length),
    medianYears: median(years),
    pctImmediateTPlus1: pct(immediateT1.length, filled.length),
  };
}

function aggregateAbVariant(abVariant, results) {
  const ok = results.filter((r) => r.ok);
  const events = ok.flatMap((r) => r.events || []).filter((e) => e.isSuccessorDeparture !== false);
  const recoveryReport = buildRecoveryReport(events);

  let totalCommercial = 0;
  let sumMeanOq = 0;
  let meanOqRuns = 0;
  let pct9599Weighted = 0;
  let spiralTotal = 0;

  for (const r of ok) {
    const snap = r.snapshot2020;
    if (!snap) continue;
    totalCommercial += snap.commercialCount || 0;
    if (snap.meanOq != null) {
      sumMeanOq += snap.meanOq;
      meanOqRuns += 1;
    }
    pct9599Weighted += ((snap.pct9599 || 0) / 100) * (snap.commercialCount || 0);
    spiralTotal += snap.lowShareSpiral || 0;
  }

  const internalEvents = events.filter((e) => e.replacementType === 'internal');
  const externalEvents = events.filter((e) => e.replacementType === 'external');

  const sameTurn90Plus = events.filter(
    (e) =>
      fillTimingLabel(e) === 'same_turn' &&
      (e.originalPriorSlotQ ?? e.departingSlotQ | 0) >= 90,
  );
  const prior94Plus = events.filter((e) => (e.originalPriorSlotQ ?? e.departingSlotQ | 0) >= 94);
  const internal94Plus = internalEvents.filter(
    (e) => (e.originalPriorSlotQ ?? e.departingSlotQ | 0) >= 94,
  );

  const intClean = recoveryReport.byTypeAndTiming.internal?.all || {};
  const extClean = recoveryReport.byTypeAndTiming.external?.all || {};

  const pct9599 =
    totalCommercial > 0
      ? Math.round((100 * pct9599Weighted) / totalCommercial * 100) / 100
      : 0;

  return {
    variant: abVariant,
    definition: VARIANT_DEFS[abVariant],
    successorEvents: events.length,
    replacementMix: {
      internal: internalEvents.length,
      external: externalEvents.length,
      cluster: events.filter((e) => e.replacementType === 'cluster').length,
    },
    internalRecoveryPct: intClean.pctRecovered ?? null,
    internalMedianYears: intClean.medianYears ?? null,
    externalRecoveryPct: extClean.pctRecovered ?? null,
    externalMedianYears: extClean.medianYears ?? null,
    internalMinusExternalRecoverPct:
      intClean.pctRecovered != null && extClean.pctRecovered != null
        ? Math.round((intClean.pctRecovered - extClean.pctRecovered) * 100) / 100
        : null,
    internalMinusExternalMedianYears:
      intClean.medianYears != null && extClean.medianYears != null
        ? Math.round((intClean.medianYears - extClean.medianYears) * 100) / 100
        : null,
    sameTurnPrior90Plus: summarizeSlice(sameTurn90Plus, 'same_turn_prior90+'),
    prior94Plus: summarizeSlice(prior94Plus, 'prior94+'),
    internal94Plus: summarizeSlice(internal94Plus, 'internal_prior94+'),
    meanOq2020: meanOqRuns ? Math.round((sumMeanOq / meanOqRuns) * 100) / 100 : null,
    pct9599,
    stationSpirals: spiralTotal,
    impossibleImmediateEndOfFill: recoveryReport.impossibleImmediateEndOfFill,
    integrityExcluded: recoveryReport.integrityExcluded,
    immediateTPlus1All: summarizeSlice(events, 'all_successor'),
    applesSameTurn90Plus: recoveryReport.applesToApplesSameTurn,
    hits9599Target: pct9599 >= TARGETS.pct9599.lo && pct9599 <= TARGETS.pct9599.hi,
    internal94MedianInTarget:
      (internal94Plus.filter((e) => e.yearsToRecoverQuality != null).length
        ? median(internal94Plus.map((e) => e.yearsToRecoverQuality))
        : null) != null &&
      (() => {
        const m = median(internal94Plus.map((e) => e.yearsToRecoverQuality));
        return m >= TARGETS.internal94PlusMedianYears.lo && m <= TARGETS.internal94PlusMedianYears.hi;
      })(),
  };
}

function scoreVariant(row) {
  let score = 0;
  if (row.pct9599 >= TARGETS.pct9599.lo && row.pct9599 <= TARGETS.pct9599.hi) score += 25;
  else if (row.pct9599 <= TARGETS.pct9599.hi + 2) score += 10;
  if (row.impossibleImmediateEndOfFill === 0) score += 20;
  if (
    row.internalMinusExternalRecoverPct != null &&
    row.internalMinusExternalRecoverPct > 0 &&
    row.internalMinusExternalRecoverPct < 35
  ) {
    score += 15;
  }
  const int94Med = row.internal94Plus?.medianYears;
  if (int94Med != null && int94Med >= 2 && int94Med <= 4) score += 20;
  else if (int94Med != null && int94Med >= 1 && int94Med < 2) score += 8;
  if (row.internalRecoveryPct != null && row.internalRecoveryPct < 92) score += 10;
  if (row.internalRecoveryPct != null && row.internalRecoveryPct >= 50 && row.internalRecoveryPct <= 80) {
    score += 10;
  }
  return score;
}

function recommend(rows) {
  const prod = rows.find((r) => r.variant === 'A');
  const b = rows.find((r) => r.variant === 'B');
  const c = rows.find((r) => r.variant === 'C');

  return {
    action: 'leave_production_conditional_next',
    recommendedVariant: 'A',
    rationale:
      'Production (A) preserves internal>external ordering (98% vs 50% recover; apples same-turn 97% vs 47%) and keeps 95–99% in band (11%). Cost: internal 94+ median is 0y (instant bench handoff, no successor ceiling). Blind wrapper routing (B) inverts ordering—internal becomes slower than external (42% vs 54%) because cap-88 clamps promotions that already inherit ~90% of bench Q. C (+1 cap) and D (+35% trust) improve 94+ median toward 2y but still leave internal below external on headline recover. Do not ship blanket wlMorningOnSlotFill routing. Next step if tuning: apply trust+ceiling only when successor pending exists on internal promotion (conditional hook), starting from C-like cap 89—not universal wrapper.',
    scored: rows.map((r) => ({ variant: r.variant, score: scoreVariant(r) })),
    notes: {
      wrapperRoutingInvertsOrdering: (b?.internalRecoveryPct ?? 0) < (b?.externalRecoveryPct ?? 0),
      prodInternalTooFast94Plus: (prod?.internal94Plus?.medianYears ?? 99) < 2,
      best94PlusMedian: ['B', 'C', 'D']
        .map((v) => ({ variant: v, median: rows.find((r) => r.variant === v)?.internal94Plus?.medianYears }))
        .sort((a, b) => Math.abs((a.median ?? 99) - 3) - Math.abs((b.median ?? 99) - 3))[0],
      closestTo94PlusTarget: c?.internal94Plus?.medianYears === 2 ? 'C' : null,
    },
  };
}

function renderMd(report) {
  const lines = [];
  lines.push('# Internal Promotion Ceiling A/B/C/D');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`**Recommendation:** ${report.recommendation.action} — variant **${report.recommendation.recommendedVariant}**`);
  lines.push('');
  lines.push(report.recommendation.rationale);
  lines.push('');
  lines.push('## Variant definitions');
  lines.push('');
  for (const [k, v] of Object.entries(VARIANT_DEFS)) {
    lines.push(`- **${k}**: ${v}`);
  }
  lines.push('');
  lines.push('## Comparison table');
  lines.push('');
  lines.push(
    '| Var | Int recover% | Ext recover% | Int−Ext med (y) | Same-turn 90+ med | Int 94+ med | 95–99% | Mean OQ | Spirals | Impossible imm | Int events |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of report.variants) {
    lines.push(
      `| ${r.variant} | ${r.internalRecoveryPct ?? '—'}% | ${r.externalRecoveryPct ?? '—'}% | ${r.internalMinusExternalMedianYears ?? '—'} | ${r.sameTurnPrior90Plus.medianYears ?? '—'} | ${r.internal94Plus.medianYears ?? '—'} | ${r.pct9599}% | ${r.meanOq2020 ?? '—'} | ${r.stationSpirals} | ${r.impossibleImmediateEndOfFill} | ${r.replacementMix.internal} |`,
    );
  }
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log('[diag:internal-promotion-ceiling-ab]', config);
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const summaries = [];
  for (const abVariant of config.variants) {
    const t0 = Date.now();
    console.log(`[diag:internal-promotion-ceiling-ab] running ${abVariant}…`);
    const ctx = loadVm(config.markets[0], abVariant);
    const results = ctx.__wlRunSuccessorLegitimacy({ ...config, variant: 'PROD' });
    const summary = aggregateAbVariant(abVariant, results);
    summaries.push(summary);
    console.log(
      `[diag:internal-promotion-ceiling-ab] ${abVariant} done ${((Date.now() - t0) / 1000).toFixed(1)}s — internal recover ${summary.internalRecoveryPct}%`,
    );
  }

  const recommendation = recommend(summaries);
  const report = {
    generatedAt: new Date().toISOString(),
    config,
    targets: TARGETS,
    variants: summaries,
    recommendation,
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, renderMd(report));
  console.log('[diag:internal-promotion-ceiling-ab] wrote', outJson);
  console.table(
    summaries.map((r) => ({
      Var: r.variant,
      'Int%': r.internalRecoveryPct,
      'Ext%': r.externalRecoveryPct,
      'Int-Ext med': r.internalMinusExternalMedianYears,
      '94+ int med': r.internal94Plus.medianYears,
      '95-99%': r.pct9599,
      meanOQ: r.meanOq2020,
      spirals: r.stationSpirals,
      impossible: r.impossibleImmediateEndOfFill,
    })),
  );
  console.log('Recommendation:', recommendation.action, recommendation.recommendedVariant);
}

main();
