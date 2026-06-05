#!/usr/bin/env node
/**
 * Morning slot quality transition analysis — every commercial morning host departure.
 *
 *   npm run diag:morning-transitions
 *   npm run diag:morning-transitions -- --runs=4
 *
 * Output: tmp/morning_transitions_summary.json
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { buildRecoveryReport } from './successorRecoveryMetrics.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const ceilingPath = path.join(root, 'src', 'morningSuccessorCeiling.js');
const runnerPath = path.join(root, 'scripts/diag-morning-transitions-runner.vm.js');
const outJson = path.join(root, 'tmp', 'morning_transitions_summary.json');

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
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
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
  vm.runInContext(
    readFileSync(path.join(__dirname, 'successorRecoveryRunnerHelpers.vm.js'), 'utf8'),
    ctx,
    { timeout: 600_000 },
  );
  vm.runInContext(
    injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
    ctx,
    { filename: 'legacy.js', timeout: 600_000 },
  );
  vm.runInContext(
    'showToast=function(){}; showToastWithSubscribeCta=function(){};',
    ctx,
  );
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 4,
    seed: 20260601,
    markets: [...ALL_PLAYABLE_MARKET_IDS],
    startYears: [1970, 1985, 2000],
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
    } else if (a.startsWith('--start-years=')) {
      o.startYears = a
        .slice(14)
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((y) => Number.isFinite(y));
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
  const ai = events.filter((e) => e.ownership !== 'player');
  const nAi = ai.length;

  const recoveredQ = ai.filter((e) => e.recoveredQuality);
  const exceededQ = ai.filter((e) => e.exceededQuality);
  const recoveredRev = ai.filter((e) => e.recoveredRevenue);

  return {
    label,
    departures: nAi,
    playerDeparturesExcluded: n - nAi,
    avgDepartingSlotQ: mean(ai.map((e) => e.departingSlotQ)),
    avgReplacementSlotQ: mean(ai.map((e) => e.replacementSlotQ)),
    avgDepartingTalentQ: mean(ai.map((e) => e.departingTalentQ)),
    avgReplacementTalentQ: mean(ai.map((e) => e.replacementTalentQ)),
    avgImmediateSlotQDrop: mean(ai.map((e) => e.departingSlotQ - e.replacementSlotQ)),
    pctFullyRecoverQuality: pct(recoveredQ.length, nAi),
    pctExceedPriorQuality: pct(exceededQ.length, nAi),
    avgYearsToRecoverQuality: mean(
      ai.map((e) => e.yearsToRecoverQuality).filter((y) => y != null),
    ),
    medianYearsToRecoverQuality: median(
      ai.map((e) => e.yearsToRecoverQuality).filter((y) => y != null),
    ),
    avgYearsToExceedQuality: mean(
      ai.map((e) => e.yearsToExceedQuality).filter((y) => y != null),
    ),
    pctRecoverRevenue: pct(recoveredRev.length, nAi),
    avgYearsToRecoverRevenue: mean(
      ai.map((e) => e.yearsToRecoverRevenue).filter((y) => y != null),
    ),
    medianYearsToRecoverRevenue: median(
      ai.map((e) => e.yearsToRecoverRevenue).filter((y) => y != null),
    ),
    neverRecoveredQuality: ai.filter((e) => !e.recoveredQuality).length,
    neverRecoveredRevenue: ai.filter((e) => !e.recoveredRevenue).length,
  };
}

function aggregate(results) {
  const all = results
    .filter((r) => r.ok)
    .flatMap((r) =>
      (r.events || []).map((e) => ({
        ...e,
        rankTier: e.rankTier || r.rankTier,
        marketId: e.marketId || r.marketId,
      })),
    );

  const byOwnership = {
    independent: summarizeEvents(
      all.filter((e) => e.ownership === 'independent'),
      'independent',
    ),
    corporate: summarizeEvents(
      all.filter((e) => e.ownership === 'corporate'),
      'corporate',
    ),
  };

  const byMarketSize = {};
  for (const tier of ['mega', 'large', 'medium', 'small']) {
    byMarketSize[tier] = summarizeEvents(
      all.filter((e) => e.rankTier === tier && e.ownership !== 'player'),
      tier,
    );
  }

  const successorAi = all.filter((e) => e.isSuccessorDeparture && e.ownership !== 'player');
  const replacementMix = {
    internal: successorAi.filter((e) => e.replacementType === 'internal').length,
    external: successorAi.filter((e) => e.replacementType === 'external').length,
    cluster: successorAi.filter((e) => e.replacementType === 'cluster').length,
  };

  const successorRecoveryReport = buildRecoveryReport(
    successorAi.map((e) => ({
      ...e,
      originalPriorSlotQ: e.departingSlotQ,
      fillTiming: e.fillTiming || (e.periodsVacantBeforeFill > 0 ? 'delayed_fill' : 'same_turn_fill'),
      filled: e.replacementType !== 'vacant',
      hasCeilingAfterFill: e.hasCeilingAtFill,
      immediateRecoverTPlus1: e.immediateRecoverTPlus1,
      immediateRecoverEndOfFill: e.immediateRecoverEndOfFill,
      recoveredOriginal: e.recoveredQuality,
      yearsToRecoverOriginal: e.yearsToRecoverQuality,
    })),
  );

  return {
    runs: {
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    },
    totalDepartures: all.filter((e) => e.ownership !== 'player').length,
    successorDepartures: successorAi.length,
    successorReplacementMix: replacementMix,
    successorCohort: summarizeEvents(successorAi, 'successor_cohort'),
    successorRecoveryReport,
    successorByReplacementType: {
      internal: summarizeEvents(
        successorAi.filter((e) => e.replacementType === 'internal'),
        'internal',
      ),
      external: summarizeEvents(
        successorAi.filter((e) => e.replacementType === 'external'),
        'external',
      ),
      cluster: summarizeEvents(
        successorAi.filter((e) => e.replacementType === 'cluster'),
        'cluster',
      ),
    },
    overall: summarizeEvents(all, 'overall'),
    byOwnership,
    byMarketSize,
    definitions: {
      departure:
        'Commercial station morning talent id changed (includes replace, poach, contract expiry + hire).',
      departingQuality: 'morningDrive slot quality (sd.quality) immediately before advTurn.',
      replacementQuality: 'morningDrive slot quality immediately after advTurn.',
      fullRecover: 'slot quality returns to ≥ departing slot quality at any future period.',
      exceedPrior: 'slot quality strictly exceeds departing slot quality at any future period.',
      revenueRecovery: 'fin.rev returns to ≥98% of pre-departure rev.',
      playerExcluded: 'Player-owned departures excluded from bucket stats (counted separately).',
    },
  };
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log('[diag:morning-transitions]', config);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const ctx = loadVm(config.markets[0]);
  const results = ctx.__wlRunMorningTransitions(config);
  const summary = {
    generatedAt: new Date().toISOString(),
    config,
    ...aggregate(results),
  };

  writeFileSync(outJson, JSON.stringify(summary, null, 2));
  console.log('[diag:morning-transitions] wrote', outJson);
  console.log(JSON.stringify(summary, null, 2));
}

main();
