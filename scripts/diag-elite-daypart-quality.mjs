#!/usr/bin/env node
/**
 * Elite daypart quality acquisition audit (diagnostic only — no tuning changes).
 *
 * Outputs:
 *   tmp/elite_daypart_quality.json
 *   tmp/elite_daypart_quality.md
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
const hooksPath = path.join(root, 'scripts', 'diag-elite-daypart-quality-hooks.vm.js');
const runnerPath = path.join(root, 'scripts', 'diag-elite-daypart-quality-runner.vm.js');
const outJson = path.join(root, 'tmp', 'elite_daypart_quality.json');
const outMd = path.join(root, 'tmp', 'elite_daypart_quality.md');

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
  vm.runInContext(readFileSync(legacyPath, 'utf8'), ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext('showToast=function(){};', ctx);
  vm.runInContext(readFileSync(hooksPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  // ensure harness2000 exists (runner references it)
  vm.runInContext(
    `if(typeof SC!=='undefined'&&Array.isArray(SC)&&!SC.some(s=>s.id==='harness2000')){SC.push({id:'harness2000',l:'Harness 2000',d:'Diagnostic cold start at 2000.',startYear:2000,idx:[9],cash:2200000,diff:'MEDIUM',oqBoost:0});}`,
    ctx,
    { timeout: 600_000 },
  );
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 6,
    seed: 20260603,
    markets: [...ALL_PLAYABLE_MARKET_IDS],
    startYear: 1970,
    endYear: 2021,
    decades: [1980, 1990, 2000, 2010, 2020],
    enableHooks: true,
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || o.runs);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--start-year=')) o.startYear = parseInt(a.slice(13), 10) || o.startYear;
    else if (a.startsWith('--end-year=')) o.endYear = parseInt(a.slice(11), 10) || o.endYear;
    else if (a.startsWith('--markets=')) o.markets = a.slice(10).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    else if (a === '--no-hooks') o.enableHooks = false;
  }
  return o;
}

function mergeStats(a, b) {
  const out = JSON.parse(JSON.stringify(a));
  out.totalRuns = (out.totalRuns || 0) + 1;
  for (const year of Object.keys(b.snapshotStats || {})) {
    if (!out.snapshotStats) out.snapshotStats = {};
    if (!out.snapshotStats[year]) out.snapshotStats[year] = b.snapshotStats[year];
    else {
      // add counts
      const dst = out.snapshotStats[year];
      const src = b.snapshotStats[year];
      dst.totalStations += src.totalStations;
      ['morningDrive', 'midday', 'afternoonDrive'].forEach((sl) => {
        dst.bySlot[sl].ge90 += src.bySlot[sl].ge90;
        dst.bySlot[sl].ge95 += src.bySlot[sl].ge95;
        dst.bySlot[sl].ge98 += src.bySlot[sl].ge98;
        dst.bySlot[sl].denom += src.bySlot[sl].denom;
      });
      dst.allPrime.ge95 += src.allPrime.ge95;
      dst.allPrime.ge98 += src.allPrime.ge98;
      for (const [t, rec] of Object.entries(src.byType || {})) {
        if (!dst.byType[t]) dst.byType[t] = { n: 0, allPrime95: 0, allPrime98: 0 };
        dst.byType[t].n += rec.n;
        dst.byType[t].allPrime95 += rec.allPrime95;
        dst.byType[t].allPrime98 += rec.allPrime98;
      }
    }
  }
  return out;
}

function renderMd(report) {
  const lines = [];
  lines.push('# Elite Daypart Quality Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Diagnostic is **measurement-only**; no tuning changes.');
  lines.push('- “Minimal investment” in UI is `progBudget < 34% of cap` (see `progBudgetInvestmentTierLabel`).');
  lines.push('- Slot quality can rise via: programming budget boosts, focused-programming bump, reveal steps, hires/poaches, and other mechanics; attribution is coarse and tracked in events.');
  lines.push('');

  lines.push('## Snapshot distribution (aggregated across runs/markets)');
  lines.push('');
  for (const year of Object.keys(report.agg.snapshotStats || {}).sort()) {
    const st = report.agg.snapshotStats[year];
    lines.push(`### ${year}`);
    lines.push('');
    lines.push(`Total station-rows: ${st.totalStations}`);
    ['morningDrive', 'midday', 'afternoonDrive'].forEach((sl) => {
      const b = st.bySlot[sl];
      const pct = (n) => (b.denom ? Math.round((n / b.denom) * 1000) / 10 : 0);
      lines.push(`- ${sl}: 90+ ${pct(b.ge90)}% · 95+ ${pct(b.ge95)}% · 98+ ${pct(b.ge98)}% (denom ${b.denom})`);
    });
    lines.push(`- allPrime95: ${st.allPrime.ge95} · allPrime98: ${st.allPrime.ge98}`);
    lines.push('');
  }

  if (report.nashvilleCaseStudy) {
    lines.push('## Nashville 1970 start case study');
    lines.push('');
    lines.push('Diagnostic variant: force top-2 commercial stations to `isPlayer=true` at start (measurement only) and simulate to 1980.');
    lines.push('');
    const c = report.nashvilleCaseStudy;
    lines.push(`Runs: ${c.runsOk}/${c.runsTotal}`);
    if (c.agg1980) {
      const st = c.agg1980;
      lines.push(`- By 1980: allPrime95=${st.allPrime.ge95} · allPrime98=${st.allPrime.ge98} (across all stations, aggregated)`);
      lines.push(
        `- Morning 95+=${st.bySlot.morningDrive.ge95}/${st.bySlot.morningDrive.denom} · 98+=${st.bySlot.morningDrive.ge98}/${st.bySlot.morningDrive.denom}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  console.log('[diag:elite-daypart-quality]', config);

  const ctx = loadVm(config.markets[0] || 'nashville');
  const results = [];
  let agg = { totalRuns: 0, snapshotStats: {} };

  for (const marketId of config.markets) {
    for (let r = 0; r < config.runs; r++) {
      const seed = (config.seed + r * 104729 + marketId.length * 31) >>> 0;
      const res = ctx.__wlEliteDaypartRun({
        marketId,
        startYear: config.startYear,
        endYear: config.endYear,
        seed,
        enableHooks: config.enableHooks,
      });
      results.push(res);
      if (res.ok) agg = mergeStats(agg, res);
    }
  }

  // Nashville case study: forced two-player-station variant to 1980
  const nash = { runsTotal: config.runs, runsOk: 0, results: [], agg1980: null };
  const nCtx = config.markets.includes('nashville') ? ctx : loadVm('nashville');
  let agg1980 = null;
  for (let r = 0; r < config.runs; r++) {
    const seed = (config.seed + 7777 + r * 104729) >>> 0;
    const res = nCtx.__wlEliteDaypartRun({
      marketId: 'nashville',
      startYear: 1970,
      endYear: 1981,
      seed,
      enableHooks: true,
      nashvilleTwoStations: true,
    });
    nash.results.push(res);
    if (res.ok && res.nashvilleCase1980) {
      nash.runsOk += 1;
      if (!agg1980) agg1980 = res.nashvilleCase1980;
      else {
        agg1980.totalStations += res.nashvilleCase1980.totalStations;
        ['morningDrive', 'midday', 'afternoonDrive'].forEach((sl) => {
          agg1980.bySlot[sl].ge90 += res.nashvilleCase1980.bySlot[sl].ge90;
          agg1980.bySlot[sl].ge95 += res.nashvilleCase1980.bySlot[sl].ge95;
          agg1980.bySlot[sl].ge98 += res.nashvilleCase1980.bySlot[sl].ge98;
          agg1980.bySlot[sl].denom += res.nashvilleCase1980.bySlot[sl].denom;
        });
        agg1980.allPrime.ge95 += res.nashvilleCase1980.allPrime.ge95;
        agg1980.allPrime.ge98 += res.nashvilleCase1980.allPrime.ge98;
      }
    }
  }
  nash.agg1980 = agg1980;

  const report = {
    generatedAt: new Date().toISOString(),
    config,
    mechanics: {
      minimalInvestmentPctCapMax: 0.34,
      decayProgBudgetFormula: '(totalProgSpend / max(10000, progCap/6)) * 4 * slotWeight * austerityEff',
      focusBumpPerPeriod: '~0.20–0.50 points on focused slot (plus small talent-true-quality nudges)',
    },
    agg,
    results,
    nashvilleCaseStudy: nash,
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, renderMd(report));
  console.log('[diag:elite-daypart-quality] wrote', outJson);
}

main();

