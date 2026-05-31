#!/usr/bin/env node
/**
 * Station quality inflation diagnostic — market-wide OQ distribution, prog budget tiers,
 * natural drift control, morning host departure impact.
 *
 *   npm run diag:quality-inflation
 *   npm run diag:quality-inflation -- --runs=5 --markets=wichita,atlanta
 *
 * Output: tmp/quality_inflation_summary.json
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
const runnerPath = path.join(root, 'scripts', 'diag-quality-inflation-runner.vm.js');
const outJson = path.join(root, 'tmp', 'quality_inflation_summary.json');

const DECADE_YEARS = [1980, 1990, 2000, 2010, 2020];

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

function injectQualityNoProgPatch(src) {
  return src
    .replace(
      's.progInvestment=(s.progInvestment||0)+invest;',
      'if(!G._wlQualityNoProg)s.progInvestment=(s.progInvestment||0)+invest;',
    )
    .replace(
      'if(Math.random()<p.ms)sd.quality=Math.min(100,sd.quality+rnd(1,4));',
      'if(!G._wlQualityNoProg&&Math.random()<p.ms)sd.quality=Math.min(100,sd.quality+rnd(1,4));',
    )
    .replace(
      'const totalProgSpend=cappedProg+(s.progInvestment||0);',
      'const totalProgSpend=cappedProg+(s.progInvestment||0);s._wlLastProgSpend=totalProgSpend;',
    );
}

function patchActiveMarket(src, marketId) {
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  }
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
  const noop = () => {};
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error, table: noop },
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
    atob: (s) => Buffer.from(String(s), 'base64').toString('utf8'),
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

function loadVmForMarket(marketId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  try {
    vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, {
      filename: 'talentRetention.js',
      timeout: 600_000,
    });
  } catch (_e) {
    /* optional */
  }
  let legacySrc = injectQualityNoProgPatch(
    injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
  );
  vm.runInContext(legacySrc, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(
    `showToast = function(){}; showToastWithSubscribeCta = function(){};`,
    ctx,
  );
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, {
    filename: 'diag-quality-inflation-runner.vm.js',
    timeout: 600_000,
  });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 4,
    seed: 20260531,
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
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function aggregateDecadeSnaps(results, noProg) {
  const byYear = {};
  for (const r of results) {
    if (!r.ok || !!r.noProgInvest !== noProg) continue;
    for (const snap of r.decadeSnaps || []) {
      const y = snap.year;
      if (!byYear[y]) byYear[y] = { p90: [], p95: [], p98: [], meanOq: [], n: [] };
      byYear[y].p90.push(snap.p90.pct);
      byYear[y].p95.push(snap.p95.pct);
      byYear[y].p98.push(snap.p98.pct);
      byYear[y].meanOq.push(snap.meanOq);
      byYear[y].n.push(snap.n);
    }
  }
  const out = {};
  for (const y of DECADE_YEARS) {
    const b = byYear[y];
    if (!b) continue;
    out[y] = {
      pctAbove90: mean(b.p90),
      pctAbove95: mean(b.p95),
      pctAbove98: mean(b.p98),
      meanOq: mean(b.meanOq),
      avgStationCount: mean(b.n),
      samples: b.p90.length,
    };
  }
  return out;
}

function aggregatePlayer2020(results) {
  const counts = [];
  for (const r of results) {
    if (!r.ok || r.noProgInvest || !r.player2020) continue;
    counts.push((r.player2020.playerAbove95 || []).length);
  }
  return {
    meanPlayerStationsAbove95: mean(counts),
    median: counts.length
      ? [...counts].sort((a, b) => a - b)[Math.floor(counts.length / 2)]
      : null,
    samples: counts.length,
    perRunCounts: counts,
  };
}

function aggregateNaturalDrift(results) {
  const normal = results.filter((r) => r.ok && !r.noProgInvest);
  const frozen = results.filter((r) => r.ok && r.noProgInvest);

  function driftDelta(rs) {
    const deltas = [];
    for (const r of rs) {
      const series = r.naturalDrift || [];
      if (series.length < 4) continue;
      const start = mean(series.slice(0, 4).map((p) => p.meanOq));
      const end = mean(series.slice(-4).map((p) => p.meanOq));
      if (start != null && end != null) deltas.push(end - start);
    }
    return deltas;
  }

  const normalD = driftDelta(normal);
  const frozenD = driftDelta(frozen);
  return {
    normalMeanOqDelta: mean(normalD),
    frozenMeanOqDelta: mean(frozenD),
    inflationFromManagement: mean(normalD) - mean(frozenD),
    normalSamples: normalD.length,
    frozenSamples: frozenD.length,
  };
}

function aggregateBudgetClimbs(climbs) {
  const ok = climbs.filter((c) => c.ok);
  const byPair = {};
  for (const c of ok) {
    const key = `${c.startQ}→${c.targetQ}`;
    if (!byPair[key]) byPair[key] = [];
    byPair[key].push(c);
  }
  const out = {};
  for (const [key, rows] of Object.entries(byPair)) {
    out[key] = {
      avgBudgetPerPeriod: mean(rows.map((r) => r.budgetPerPeriod)),
      avgPeriodsToTarget: mean(rows.map((r) => r.periodsToTarget)),
      avgTotalSpend: mean(rows.map((r) => r.totalSpend)),
      avgPctOfCap: mean(rows.map((r) => r.pctOfCap)),
      samples: rows.length,
      byMarket: rows.map((r) => ({
        market: r.marketId,
        year: r.year,
        budgetPerPeriod: r.budgetPerPeriod,
        periods: r.periodsToTarget,
        totalSpend: r.totalSpend,
        pctOfCap: r.pctOfCap,
      })),
    };
  }
  return out;
}

function aggregateDepartures(deps) {
  const ok = deps.filter((d) => d.ok);
  return {
    samples: ok.length,
    avgShareDelta: mean(ok.map((d) => d.impact.shareDelta)),
    avgShareDeltaPct: mean(
      ok.map((d) => d.impact.shareDeltaPct).filter((x) => x != null),
    ),
    avgRevDelta: mean(ok.map((d) => d.impact.revDelta)),
    avgRevDeltaPct: mean(
      ok.map((d) => d.impact.revDeltaPct).filter((x) => x != null),
    ),
    avgAqhDelta: mean(ok.map((d) => d.impact.aqhDelta)),
    avgAqhDeltaPct: mean(
      ok.map((d) => d.impact.aqhDeltaPct).filter((x) => x != null),
    ),
    avgOqDelta: mean(ok.map((d) => d.impact.oqDelta)),
    byMarket: ok.map((d) => ({
      market: d.marketId,
      call: d.stationCall,
      preShare: d.preDepart.share,
      postShare: d.postSeries?.[d.postSeries.length - 1]?.share,
      shareDeltaPct: d.impact.shareDeltaPct,
      revDeltaPct: d.impact.revDeltaPct,
      oqDelta: d.impact.oqDelta,
    })),
  };
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log('[diag:quality-inflation] config', config);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const ctx = loadVmForMarket(config.markets[0]);
  const suite = ctx.__wlRunQualityInflationSuite({
    markets: config.markets,
    startYears: config.startYears,
    runs: config.runs,
    seed: config.seed,
  });

  const normalResults = suite.marketResults.filter((r) => !r.noProgInvest);
  const failed = suite.marketResults.filter((r) => !r.ok);

  const summary = {
    generatedAt: new Date().toISOString(),
    config,
    runs: {
      total: suite.marketResults.length,
      ok: suite.marketResults.filter((r) => r.ok).length,
      failed: failed.length,
      failures: failed.slice(0, 5).map((f) => ({
        market: f.marketId,
        startYear: f.startYear,
        error: f.error,
      })),
    },
    commercialQualityByDecade: aggregateDecadeSnaps(suite.marketResults, false),
    playerOwnedAbove95By2020: aggregatePlayer2020(suite.marketResults),
    programmingBudgetToClimb: aggregateBudgetClimbs(suite.budgetClimbs),
    naturalInflationControl: aggregateNaturalDrift(suite.marketResults),
    morningHostDepartureImpact: aggregateDepartures(suite.departures),
    notes: [
      'Commercial % uses station.oq (overall programming quality) at decade boundary years.',
      'noProgInvest control zeros AI progInvestment and AI random quality micro-bumps.',
      'Budget climb isolates one player station via decay() with uniform slot quality.',
      'Morning departure: 96-quality host replaced with 70-quality entry hire after settle.',
    ],
  };

  writeFileSync(outJson, JSON.stringify(summary, null, 2));
  console.log('[diag:quality-inflation] wrote', outJson);
  console.log(JSON.stringify(summary, null, 2));
}

main();
