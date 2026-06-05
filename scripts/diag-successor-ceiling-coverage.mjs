#!/usr/bin/env node
/**
 * Ceiling enforcement coverage audit — successor fills vs hooks/clamp.
 *
 *   npm run diag:successor-ceiling-coverage
 *
 * Output: tmp/successor_ceiling_coverage.json, tmp/successor_ceiling_coverage.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const ceilingPath = path.join(root, 'src', 'morningSuccessorCeiling.js');
const helpersPath = path.join(root, 'scripts/successorRecoveryRunnerHelpers.vm.js');
const runnerPath = path.join(root, 'scripts/diag-successor-ceiling-coverage-runner.vm.js');
const outJson = path.join(root, 'tmp', 'successor_ceiling_coverage.json');
const outMd = path.join(root, 'tmp', 'successor_ceiling_coverage.md');

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

function loadVm(marketId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  try {
    vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  } catch (_e) {
    /* optional */
  }
  vm.runInContext(readFileSync(ceilingPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(helpersPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(
    injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
    ctx,
    { filename: 'legacy.js', timeout: 600_000 },
  );
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
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || o.runs);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--markets=')) {
      o.markets = a.slice(10).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    }
  }
  return o;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((100 * n) / d * 100) / 100;
}

const FIXED_CAP = 88;

/** Prior departure qualifies for successor ceiling enforcement. */
function departureRequiresCeiling(priorQ) {
  return (priorQ | 0) >= 90;
}

/** Classify enforcement vs telemetry for a single fill event. */
function classifyEnforcement(e) {
  const priorQ = e.originalPriorSlotQ | 0;
  const replQ = e.replacementSlotQAtFill | 0;
  const requiresCeiling = departureRequiresCeiling(priorQ);
  const assignSkipped =
    e.onAssignSkippedReason === 'no_pending' ||
    e.fillTurnLogTypes?.includes('onAssignSkipped');

  if (e.hasCeilingAfterFill) {
    return 'ceiling_active_at_fill';
  }
  if (e.ceilingAppliedOnFillTurn) {
    if (e.ceilingClearedSameTurn) return 'ceiling_applied_cleared_same_turn';
    return 'ceiling_applied_no_mc_at_snap';
  }
  if (e.ceilingClearedSameTurn && e.ceilingClearReason === 'tenure_met_prior_reached') {
    return 'ceiling_cleared_same_turn';
  }
  if (e.internalPromotionDirect || e.fillTurnLogTypes?.includes('internalPromotionDirect')) {
    return 'internal_promotion_direct';
  }
  if (assignSkipped) {
    if (!requiresCeiling) return 'no_ceiling_required_sub90';
    if (replQ <= FIXED_CAP) return 'repl_within_fixed_cap_no_pending';
    if (e.fillTiming === 'delayed_fill') return 'delayed_pending_expired';
    return 'true_missing_enforcement';
  }
  if (!requiresCeiling) {
    return 'no_ceiling_required_sub90';
  }
  if (replQ <= FIXED_CAP) {
    return 'repl_within_fixed_cap';
  }
  if (
    !e.onSlotFillCalled &&
    (e.fillPath === 'ai_internal_promotion' ||
      e.fillPath === 'internal_promotion_direct' ||
      e.replacementType === 'internal')
  ) {
    return 'internal_promotion_direct_no_wrapper';
  }
  return 'true_missing_enforcement';
}

function aggregate(events) {
  const filled = events.filter((e) => e.replacementType !== 'vacant');
  const classified = filled.map((e) => ({
    ...e,
    enforcementClass: classifyEnforcement(e),
  }));

  const byClass = {};
  for (const e of classified) {
    const c = e.enforcementClass;
    if (!byClass[c]) byClass[c] = 0;
    byClass[c] += 1;
  }

  const byPath = {};
  for (const e of classified) {
    const p = e.fillPath || 'unknown';
    if (!byPath[p]) {
      byPath[p] = { count: 0, noMcAtSnap: 0, noWrapper: 0, aboveCeiling: 0, trueMissing: 0 };
    }
    byPath[p].count += 1;
    if (!e.hasCeilingAfterFill) byPath[p].noMcAtSnap += 1;
    if (!e.onSlotFillCalled) byPath[p].noWrapper += 1;
    if (e.slotQExceededCeilingAtFill) byPath[p].aboveCeiling += 1;
    if (e.enforcementClass === 'true_missing_enforcement') byPath[p].trueMissing += 1;
  }

  const impossibleImmediate = classified.filter((e) =>
    e.integrityFlags?.includes('immediate_while_capped'),
  );

  const noMcAtSnap = classified.filter((e) => !e.hasCeilingAfterFill);
  const trueMissing = classified.filter((e) => e.enforcementClass === 'true_missing_enforcement');
  const delayedExpired = classified.filter((e) => e.enforcementClass === 'delayed_pending_expired');
  const enforcedOnFill = classified.filter(
    (e) =>
      e.hasCeilingAfterFill ||
      e.ceilingAppliedOnFillTurn ||
      e.enforcementClass === 'ceiling_cleared_same_turn' ||
      e.enforcementClass === 'ceiling_applied_cleared_same_turn',
  );

  return {
    totalFills: filled.length,
    pctHasCeilingAfterFill: pct(classified.filter((e) => e.hasCeilingAfterFill).length, filled.length),
    pctOnSlotFillCalled: pct(classified.filter((e) => e.onSlotFillCalled).length, filled.length),
    pctNoteClearCalled: pct(classified.filter((e) => e.noteClearCalled).length, filled.length),
    pctSlotQAboveCeilingAtFill: pct(
      classified.filter((e) => e.slotQExceededCeilingAtFill).length,
      filled.length,
    ),
    pctEnforcementOnFillTurn: pct(enforcedOnFill.length, filled.length),
    impossibleImmediateEndOfFill: impossibleImmediate.length,
    /** Legacy metric: mc object absent at end-of-turn snap (includes legitimate clears). */
    missingMcAtSnapCount: noMcAtSnap.length,
    /** Telemetry-only: wrapper not invoked on fill turn. */
    missingWrapperCount: classified.filter((e) => !e.onSlotFillCalled).length,
    /** Same-turn fill: prior≥90, repl>88, wrapper ran but no pending/apply log. */
    trueMissingEnforcementCount: trueMissing.length,
    delayedPendingExpiredCount: delayedExpired.length,
    delayedPendingExpiredAboveCapCount: delayedExpired.filter(
      (e) => (e.replacementSlotQAtFill | 0) > FIXED_CAP,
    ).length,
    ceilingAppliedClearedSameTurnCount: classified.filter(
      (e) => e.enforcementClass === 'ceiling_applied_cleared_same_turn',
    ).length,
    byEnforcementClass: byClass,
    byFillPath: byPath,
    samplesTrueMissing: trueMissing.slice(0, 15),
    samplesMissingMcAtSnap: noMcAtSnap.slice(0, 15),
    samplesAboveCeiling: classified.filter((e) => e.slotQExceededCeilingAtFill).slice(0, 15),
  };
}

function renderMd(report) {
  const lines = [];
  lines.push('# Successor Ceiling Coverage Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`Total successor fills: **${report.summary.totalFills}**`);
  lines.push(`Has ceiling after fill (snap): **${report.summary.pctHasCeilingAfterFill}%**`);
  lines.push(`Enforcement on fill turn: **${report.summary.pctEnforcementOnFillTurn}%**`);
  lines.push(`onSlotFill wrapper called: **${report.summary.pctOnSlotFillCalled}%**`);
  lines.push(`noteClear called: **${report.summary.pctNoteClearCalled}%**`);
  lines.push(`Slot Q > ceiling at fill: **${report.summary.pctSlotQAboveCeilingAtFill}%**`);
  lines.push(`Impossible immediate (capped): **${report.summary.impossibleImmediateEndOfFill}**`);
  lines.push(`Missing mc at snap (telemetry): **${report.summary.missingMcAtSnapCount}**`);
  lines.push(`True missing enforcement: **${report.summary.trueMissingEnforcementCount}**`);
  lines.push('');
  lines.push('## By enforcement class');
  lines.push('');
  lines.push('| Class | Count |');
  lines.push('| --- | --- |');
  for (const [c, n] of Object.entries(report.summary.byEnforcementClass).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${c} | ${n} |`);
  }
  lines.push('');
  lines.push('## By fill path');
  lines.push('');
  lines.push('| Path | Count | No mc@snap | No wrapper | Q > ceiling | True missing |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const [p, d] of Object.entries(report.summary.byFillPath).sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`| ${p} | ${d.count} | ${d.noMcAtSnap} | ${d.noWrapper} | ${d.aboveCeiling} | ${d.trueMissing} |`);
  }
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log('[diag:successor-ceiling-coverage]', config);
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const ctx = loadVm(config.markets[0]);
  const results = ctx.__wlRunSuccessorCeilingCoverage(config);
  const events = results.filter((r) => r.ok).flatMap((r) => r.events || []);
  const summary = aggregate(events);
  const classifiedEvents = events
    .filter((e) => e.replacementType !== 'vacant')
    .map((e) => ({ ...e, enforcementClass: classifyEnforcement(e) }));

  const report = {
    generatedAt: new Date().toISOString(),
    config,
    summary,
    events: classifiedEvents,
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, renderMd(report));
  console.log('[diag:successor-ceiling-coverage] wrote', outJson);
  console.log(JSON.stringify(summary, null, 2));
}

main();
