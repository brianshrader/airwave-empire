#!/usr/bin/env node
/**
 * Contract refusal frequency audit (diagnostic only — no tuning changes).
 *
 *   npm run diag:contract-refusal
 *   npm run diag:contract-refusal -- --markets=nashville --start-years=1970 --end-year=1985
 *
 * Output: tmp/contract_refusal_audit.json, tmp/contract_refusal_audit.md
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
const hooksPath = path.join(root, 'scripts/diag-contract-refusal-hooks.vm.js');
const runnerPath = path.join(root, 'scripts/diag-contract-refusal-runner.vm.js');
const outJson = path.join(root, 'tmp', 'contract_refusal_audit.json');
const outMd = path.join(root, 'tmp', 'contract_refusal_audit.md');

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
  getElementById() { return stubEl(); },
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

function loadVm(marketId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(
    injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
    ctx,
    { filename: 'legacy.js', timeout: 600_000 },
  );
  vm.runInContext('showToast=function(){};', ctx);
  vm.runInContext(readFileSync(hooksPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 2,
    seed: 20260602,
    markets: [...ALL_PLAYABLE_MARKET_IDS],
    startYears: [1970, 1985, 2000],
    endYear: null,
    years: 30,
    simulateRenewals: true,
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || o.runs);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--years=')) o.years = parseInt(a.slice(8), 10) || o.years;
    else if (a.startsWith('--end-year=')) o.endYear = parseInt(a.slice(11), 10) || o.endYear;
    else if (a.startsWith('--markets=')) {
      o.markets = a.slice(10).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    } else if (a.startsWith('--start-years=')) {
      o.startYears = a.slice(14).split(',').map((x) => parseInt(x.trim(), 10)).filter(Number.isFinite);
    } else if (a === '--no-simulate-renewals') {
      o.simulateRenewals = false;
    }
  }
  return o;
}

function aggregateResults(results) {
  const ok = results.filter((r) => r.ok);
  const sum = (fn) => ok.reduce((s, r) => s + fn(r), 0);
  const byMarket = {};
  for (const r of ok) {
    if (!byMarket[r.marketId]) {
      byMarket[r.marketId] = {
        runs: 0,
        renewalOpportunities: 0,
        extendAttempts: 0,
        extendRefused: 0,
        exitIntentSet: 0,
        refuse3yrBlocks: 0,
        departuresRefusalLike: 0,
        expiryWarnings: 0,
      };
    }
    const b = byMarket[r.marketId];
    b.runs += 1;
    b.renewalOpportunities += r.renewalOpportunities;
    b.extendAttempts += r.extendAttempts;
    b.extendRefused += r.extendRefused;
    b.exitIntentSet += r.exitIntentSet;
    b.refuse3yrBlocks += r.refuse3yrBlocks;
    b.departuresRefusalLike += r.departuresRefusalLike;
    b.expiryWarnings += r.expiryWarnings;
  }
  return {
    runs: { total: results.length, ok: ok.length },
    renewalOpportunities: sum((r) => r.renewalOpportunities),
    extendAttempts: sum((r) => r.extendAttempts),
    extendRefused: sum((r) => r.extendRefused),
    exitIntentSet: sum((r) => r.exitIntentSet),
    contractModifierChecks: sum((r) => r.contractModifierChecks),
    refuse3yrBlocks: sum((r) => r.refuse3yrBlocks),
    departuresRefusalLike: sum((r) => r.departuresRefusalLike),
    expiryWarnings: sum((r) => r.expiryWarnings),
    simulatedExtendSkippedExitIntent: sum((r) => r.simulatedExtendSkippedExitIntent || 0),
    byMarket,
  };
}

function renderMd(report) {
  const lines = [];
  lines.push('# Contract Refusal Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Model note');
  lines.push('');
  lines.push('- There is **no random roll when you click Sign** — refusal only happens if `_wantsExit` was already set by retention logic.');
  lines.push('- **3-year refusal** is UI-only (`satisfaction < 52` or exit intent disables 3yr tile; 1–2 yr may still work).');
  lines.push('- Diagnostic simulates an **active player** auto-extending when contract ≤ 0.5 yr remaining.');
  lines.push('');
  lines.push('## All markets summary');
  lines.push('');
  const a = report.allMarkets;
  lines.push(`| Metric | Count |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Renewal opportunities (≤0.5 yr, player talent-periods) | ${a.renewalOpportunities} |`);
  lines.push(`| Simulated extend attempts | ${a.extendAttempts} |`);
  lines.push(`| Extend blocked (exit intent) | ${a.extendRefused} |`);
  lines.push(`| Exit intent newly set | ${a.exitIntentSet} |`);
  lines.push(`| Contract modifier checks (UI open) | ${a.contractModifierChecks} |`);
  lines.push(`| refuse3yr blocks | ${a.refuse3yrBlocks} |`);
  lines.push(`| Departure/refusal-like news | ${a.departuresRefusalLike} |`);
  lines.push(`| Expiry warnings | ${a.expiryWarnings} |`);
  lines.push('');
  if (report.nashville1970_1985) {
    const n = report.nashville1970_1985;
    lines.push('## Nashville 1970–1985');
    lines.push('');
    lines.push(`| Metric | Count |`);
    lines.push(`| --- | ---: |`);
    lines.push(`| Renewal opportunities | ${n.renewalOpportunities} |`);
    lines.push(`| Extend attempts | ${n.extendAttempts} |`);
    lines.push(`| Extend refused | ${n.extendRefused} |`);
    lines.push(`| Exit intent set | ${n.exitIntentSet} |`);
    lines.push(`| Departure/refusal news | ${n.departuresRefusalLike} |`);
  }
  lines.push('');
  lines.push('## By market');
  lines.push('');
  lines.push('| Market | Runs | Renew opps | Extend tries | Refused | Exit intent | Refuse 3yr | Departures |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [mid, b] of Object.entries(report.allMarkets.byMarket).sort((x, y) => x[0].localeCompare(y[0]))) {
    lines.push(
      `| ${mid} | ${b.runs} | ${b.renewalOpportunities} | ${b.extendAttempts} | ${b.extendRefused} | ${b.exitIntentSet} | ${b.refuse3yrBlocks} | ${b.departuresRefusalLike} |`,
    );
  }
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  console.log('[diag:contract-refusal]', config);

  const endYear = config.endYear || null;
  const batchConfig = {
    markets: config.markets,
    startYears: config.startYears,
    runs: config.runs,
    seed: config.seed,
    simulateRenewals: config.simulateRenewals,
    years: config.years,
    endYear: endYear || undefined,
    endYearByStart: endYear ? Object.fromEntries(config.startYears.map((y) => [y, endYear])) : undefined,
  };

  const ctx = loadVm(config.markets[0]);
  const allResults = ctx.__wlRunContractRefusalBatch(batchConfig);
  const allMarkets = aggregateResults(allResults);

  let nashvilleResults = [];
  if (!config.markets.includes('nashville') || config.startYears.length !== 1 || config.startYears[0] !== 1970) {
    const nCtx = config.markets.includes('nashville') ? ctx : loadVm('nashville');
    nashvilleResults = nCtx.__wlRunContractRefusalBatch({
      markets: ['nashville'],
      startYears: [1970],
      runs: config.runs,
      seed: config.seed,
      simulateRenewals: config.simulateRenewals,
      endYearByStart: { 1970: 1985 },
    });
  } else {
    nashvilleResults = allResults.filter((r) => r.marketId === 'nashville' && r.startYear === 1970);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config,
    devLoadOrder: [
      'play.html loads /src/talentRetention.js before /src/legacy.js (same in vite dev + production build)',
      'wlTalentRetention.runPeriod called from talentEvents each advTurn (solo, non-simQuiet)',
      'doExtend blocks only when wlTalentHasExitIntent(t)',
    ],
    allMarkets,
    nashville1970_1985: aggregateResults(nashvilleResults),
    results: allResults,
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, renderMd(report));
  console.log('[diag:contract-refusal] wrote', outJson);
  console.log(JSON.stringify({ allMarkets: report.allMarkets, nashville: report.nashville1970_1985 }, null, 2));
}

main();
