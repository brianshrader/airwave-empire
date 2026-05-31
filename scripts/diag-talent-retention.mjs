#!/usr/bin/env node
/**
 * Talent retention diagnostic harness — long passive solo sims, exit taxonomy, death spirals.
 * Read-only: does not change gameplay.
 *
 *   npm run diag:talent-retention
 *   npm run diag:talent-retention -- --runs=5 --years=15 --markets=wichita,nashville --seed=42
 *
 * Output:
 *   tmp/talent_retention_diag.csv
 *   tmp/talent_retention_summary.json
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectFormatLifecycleIife } from './vmInjectFormatLifecycleIife.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const runnerPath = path.join(__dirname, 'diag-talent-retention-runner.vm.js');
const outCsv = path.join(root, 'tmp', 'talent_retention_diag.csv');
const outJson = path.join(root, 'tmp', 'talent_retention_summary.json');

const DEFAULT_START_YEARS = [1970, 1985, 2000];
const CAUSE_ORDER = [
  'dissatisfaction',
  'life_career',
  'market_ambition',
  'retirement',
  'burnout',
  'poaching',
  'let_expire',
  'station_disposition',
  'unknown',
];

const RETENTION_CAUSES = new Set([
  'dissatisfaction',
  'life_career',
  'market_ambition',
  'retirement',
  'burnout',
  'poaching',
  'let_expire',
]);

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
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
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

function loadVmForMarket(marketId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, {
    filename: 'talentRetention.js',
    timeout: 300_000,
  });
  const legacySrc = injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId));
  vm.runInContext(legacySrc, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, {
    filename: 'diag-talent-retention-runner.vm.js',
    timeout: 300_000,
  });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 20,
    years: 25,
    seed: 20260530,
    markets: [...ALL_PLAYABLE_MARKET_IDS],
    startYears: [...DEFAULT_START_YEARS],
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || o.runs);
    else if (a.startsWith('--years=')) o.years = Math.max(5, parseInt(a.slice(8), 10) || o.years);
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

function pct(n, d) {
  if (!d) return 0;
  return (100 * n) / d;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h;
}

function runSeed(base, marketId, startYear, runIdx) {
  return (base + marketSalt(marketId) * 997 + startYear * 131 + runIdx * 104729) >>> 0;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exitsToCsv(exits) {
  const cols = [
    'runId',
    'marketId',
    'startYear',
    'seed',
    'exitYear',
    'exitPeriod',
    'cause',
    'talentName',
    'slot',
    'isCoHost',
    'stationCall',
    'stationRank',
    'stationShare',
    'prevRank',
    'rankDeclineStreak',
    'stationCash',
    'stationEbitda',
    'repTag',
    'repTurnover',
    'structMorale',
    'morale',
    'effectiveMorale',
    'satisfaction',
    'quality',
    'salary',
    'tenurePeriods',
    'personality',
    'cyrRemaining',
    'marketTier',
    'top3Station',
    'rank1Station',
    'bottomHalf',
    'highMorale',
    'highSat',
    'lifeReason',
    'lifeDest',
    'newsSample',
  ];
  const lines = [cols.join(',')];
  for (const ex of exits) {
    lines.push(cols.map((c) => csvEscape(ex[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function summarize(allRuns, allExits, allSpirals, config) {
  const okRuns = allRuns.filter((r) => r.ok);
  const stationYears = okRuns.reduce((s, r) => s + (r.stationYears || 0), 0);
  const retentionExits = allExits.filter((e) => RETENTION_CAUSES.has(e.cause));
  const byCause = {};
  for (const c of CAUSE_ORDER) byCause[c] = 0;
  for (const ex of allExits) {
    byCause[ex.cause] = (byCause[ex.cause] || 0) + 1;
  }

  const diss = retentionExits.filter((e) => e.cause === 'dissatisfaction');
  const life = retentionExits.filter((e) => e.cause === 'life_career');
  const amb = retentionExits.filter((e) => e.cause === 'market_ambition');

  const top3 = retentionExits.filter((e) => e.top3Station);
  const rank1 = retentionExits.filter((e) => e.rank1Station);
  const bottomHalf = retentionExits.filter((e) => e.bottomHalf);
  const declining = retentionExits.filter((e) => (e.rankDeclineStreak | 0) >= 2);
  const highMorExits = retentionExits.filter((e) => e.highMorale || e.highSat);

  const per10SY = (n) => (stationYears > 0 ? (10 * n) / stationYears : 0);

  const ambSmallHighQ = amb.filter(
    (e) =>
      (e.marketTier === 'small' || e.marketTier === 'medium') && (e.quality | 0) >= 72,
  );

  const lifeByRun = okRuns.map((r) => ({
    runId: r.runId,
    marketId: r.marketId,
    startYear: r.startYear,
    lifeCount: (r.exits || []).filter((e) => e.cause === 'life_career' || e.cause === 'market_ambition')
      .length,
  }));
  const lifeCounts = lifeByRun.map((x) => x.lifeCount);
  const lifeMean = mean(lifeCounts) || 0;
  const lifeVar =
    lifeCounts.length > 1
      ? lifeCounts.reduce((s, x) => s + (x - lifeMean) ** 2, 0) / (lifeCounts.length - 1)
      : 0;
  const lifeClusterScore = lifeMean > 0 ? Math.sqrt(lifeVar) / lifeMean : 0;

  const spiralRuns = new Set(allSpirals.map((s) => `${s.marketId}:${s.startYear}:${s.runId}`));
  const spiralRecovered = allSpirals.filter((s) => s.recovered).length;

  const flags = [];
  const lifeRate = per10SY(life.length + amb.length);
  if (retentionExits.length === 0) flags.push('NO_DEPARTURES_OBSERVED');
  if (lifeRate > 1.2) flags.push('LIFE_EVENTS_TOO_FREQUENT');
  if (pct(diss.filter((e) => e.top3Station).length, top3.length) > 35 && top3.length >= 5) {
    flags.push('WINNING_STATIONS_OVERPUNISHED');
  }
  if (pct(spiralRuns.size, okRuns.length) > 35 && okRuns.length >= 4) {
    flags.push('DEATH_SPIRAL_TOO_COMMON');
  }
  const dissAtHealthy =
    diss.length > 0
      ? pct(
          diss.filter((e) => e.top3Station || (e.satisfaction | 0) >= 58).length,
          diss.length,
        )
      : 0;
  if (diss.length >= 8 && dissAtHealthy > 40 && mean(diss.map((e) => e.satisfaction | 0)) > 52) {
    flags.push('DISSATISFACTION_NOT_CORRELATED_WITH_BAD_CONDITIONS');
  }
  if (pct(byCause.unknown || 0, retentionExits.length) > 18 && retentionExits.length >= 10) {
    flags.push('TOO_MANY_UNKNOWN_EXITS');
  }

  return {
    generatedAt: new Date().toISOString(),
    config,
    runs: {
      total: allRuns.length,
      ok: okRuns.length,
      failed: allRuns.length - okRuns.length,
    },
    stationYears,
    totalExits: allExits.length,
    retentionExits: retentionExits.length,
    stationDispositionExits: byCause.station_disposition || 0,
    exitsByCause: byCause,
    ratesPer10StationYears: {
      allRetentionExits: per10SY(retentionExits.length),
      dissatisfaction: per10SY(byCause.dissatisfaction || 0),
      lifeCareer: per10SY(byCause.life_career || 0),
      marketAmbition: per10SY(byCause.market_ambition || 0),
      retirement: per10SY(byCause.retirement || 0),
      burnout: per10SY(byCause.burnout || 0),
      poaching: per10SY(byCause.poaching || 0),
      letExpire: per10SY(byCause.let_expire || 0),
      unknown: per10SY(byCause.unknown || 0),
    },
    successfulStationLosses: {
      top3Exits: top3.length,
      rank1Exits: rank1.length,
      bottomHalfExits: bottomHalf.length,
      decliningTrendExits: declining.length,
      highMoraleOrSatExits: highMorExits.length,
      top3Dissatisfaction: diss.filter((e) => e.top3Station).length,
      top3LifeOrAmbition: top3.filter(
        (e) => e.cause === 'life_career' || e.cause === 'market_ambition',
      ).length,
    },
    dissatisfactionProfile:
      diss.length > 0
        ? {
            count: diss.length,
            avgSatisfaction: mean(diss.map((e) => e.satisfaction).filter((x) => x != null)),
            avgMorale: mean(diss.map((e) => e.effectiveMorale | 0)),
            avgRank: mean(diss.map((e) => e.stationRank).filter((x) => x != null)),
            avgDeclineStreak: mean(diss.map((e) => e.rankDeclineStreak | 0)),
            pctAtTop3: pct(diss.filter((e) => e.top3Station).length, diss.length),
            pctAtHealthySat: pct(diss.filter((e) => (e.satisfaction | 0) >= 58).length, diss.length),
          }
        : null,
    lifeCareerProfile: {
      lifeCareerCount: life.length,
      marketAmbitionCount: amb.length,
      per10StationYearsLife: per10SY(life.length),
      per10StationYearsAmbition: per10SY(amb.length),
      highQualitySmallMarketAmbition: ambSmallHighQ.length,
      clusteringCoefficient: lifeClusterScore,
    },
    deathSpirals: {
      events: allSpirals.length,
      runsWithSpiral: spiralRuns.size,
      pctRunsWithSpiral: pct(spiralRuns.size, okRuns.length),
      recoveredCount: spiralRecovered,
      recoveryRate: allSpirals.length ? pct(spiralRecovered, allSpirals.length) : null,
    },
    warningFlags: flags,
    failedRuns: allRuns.filter((r) => !r.ok).map((r) => ({ marketId: r.marketId, startYear: r.startYear, runId: r.runId, error: r.error })),
  };
}

function printSummary(summary) {
  console.log('\n=== Talent retention diagnostic ===\n');
  console.log(
    `Runs: ${summary.runs.ok}/${summary.runs.total} ok · ${summary.stationYears} station-years · ${summary.retentionExits} retention exits (${summary.stationDispositionExits} station dispositions excluded)`,
  );
  console.log('\nExits by cause:');
  for (const c of CAUSE_ORDER) {
    const n = summary.exitsByCause[c] || 0;
    const r = summary.ratesPer10StationYears[c === 'life_career' ? 'lifeCareer' : c === 'market_ambition' ? 'marketAmbition' : c === 'let_expire' ? 'letExpire' : c] ?? summary.ratesPer10StationYears.allExits;
    const rateKey =
      c === 'dissatisfaction'
        ? 'dissatisfaction'
        : c === 'life_career'
          ? 'lifeCareer'
          : c === 'market_ambition'
            ? 'marketAmbition'
            : c === 'let_expire'
              ? 'letExpire'
              : c;
    console.log(`  ${c.padEnd(18)} ${String(n).padStart(5)}  (${(summary.ratesPer10StationYears[rateKey] ?? 0).toFixed(3)}/10 SY)`);
  }
  console.log('\nSuccessful-station losses:');
  const ssl = summary.successfulStationLosses;
  console.log(`  Top-3 station exits:        ${ssl.top3Exits} (dissatisfaction ${ssl.top3Dissatisfaction}, life/ambition ${ssl.top3LifeOrAmbition})`);
  console.log(`  #1 station exits:           ${ssl.rank1Exits}`);
  console.log(`  Bottom-half exits:          ${ssl.bottomHalfExits}`);
  console.log(`  Declining-trend exits:      ${ssl.decliningTrendExits}`);
  console.log(`  High morale/sat exits:      ${ssl.highMoraleOrSatExits}`);
  if (summary.dissatisfactionProfile) {
    const d = summary.dissatisfactionProfile;
    console.log('\nDissatisfaction exits (correlation-style):');
    console.log(
      `  avg sat ${d.avgSatisfaction?.toFixed(1) ?? '—'} · avg morale ${d.avgMorale?.toFixed(1) ?? '—'} · avg rank ${d.avgRank?.toFixed(1) ?? '—'} · decline streak ${d.avgDeclineStreak?.toFixed(1) ?? '—'}`,
    );
    console.log(`  at top-3: ${d.pctAtTop3.toFixed(1)}% · healthy sat: ${d.pctAtHealthySat.toFixed(1)}%`);
  }
  const lc = summary.lifeCareerProfile;
  console.log('\nLife / career:');
  console.log(
    `  life ${lc.lifeCareerCount} (${lc.per10StationYearsLife.toFixed(3)}/10 SY) · ambition ${lc.marketAmbitionCount} (${lc.per10StationYearsAmbition.toFixed(3)}/10 SY)`,
  );
  console.log(
    `  HQ small/medium ambition exits: ${lc.highQualitySmallMarketAmbition} · cluster CV ${lc.clusteringCoefficient.toFixed(2)}`,
  );
  const ds = summary.deathSpirals;
  console.log('\nDeath spirals:');
  console.log(
    `  ${ds.events} events in ${ds.runsWithSpiral} runs (${ds.pctRunsWithSpiral.toFixed(1)}%) · recovery ${ds.recoveryRate != null ? `${ds.recoveryRate.toFixed(1)}%` : '—'}`,
  );
  if (summary.warningFlags.length) {
    console.log('\n⚠ Warning flags:');
    summary.warningFlags.forEach((f) => console.log(`  • ${f}`));
  } else {
    console.log('\nNo warning flags tripped.');
  }
  if (summary.failedRuns.length) {
    console.log(`\nFailed runs: ${summary.failedRuns.length} (see JSON)`);
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  console.log(
    `Talent retention diag — markets=${config.markets.length} startYears=${config.startYears.join(',')} runs=${config.runs} years=${config.years} seed=${config.seed}`,
  );

  const ctxCache = new Map();
  const allRuns = [];
  const allExits = [];
  const allSpirals = [];
  let runCounter = 0;

  for (const marketId of config.markets) {
    if (!ctxCache.has(marketId)) {
      process.stdout.write(`Loading VM for ${marketId}… `);
      ctxCache.set(marketId, loadVmForMarket(marketId));
      console.log('ok');
    }
    const ctx = ctxCache.get(marketId);

    for (const startYear of config.startYears) {
      for (let r = 0; r < config.runs; r++) {
        const seed = runSeed(config.seed, marketId, startYear, r);
        runCounter++;
        process.stdout.write(
          `[${runCounter}] ${marketId} ${startYear} run ${r + 1}/${config.runs}… `,
        );
        const result = ctx.__wlRunTalentRetentionSim({
          marketId,
          startYear,
          seed,
          years: config.years,
          runId: runCounter,
        });
        if (result.ok) {
          console.log(`${result.exitCount} exits`);
        } else {
          console.log(`FAIL: ${result.error}`);
        }
        allRuns.push(result);
        allExits.push(...(result.exits || []));
        allSpirals.push(...(result.spirals || []));
      }
    }
  }

  const summary = summarize(allRuns, allExits, allSpirals, config);
  writeFileSync(outCsv, exitsToCsv(allExits), 'utf8');
  writeFileSync(outJson, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  printSummary(summary);
  console.log(`\nWrote ${outCsv}`);
  console.log(`Wrote ${outJson}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
