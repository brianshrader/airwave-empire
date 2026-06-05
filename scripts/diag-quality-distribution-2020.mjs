#!/usr/bin/env node
/**
 * 2020 commercial station quality distribution — buckets, prog spend, climb times, 90+ streaks.
 *
 *   npm run diag:quality-distribution-2020
 *   npm run diag:quality-distribution-2020 -- --runs=5
 *
 * Output: tmp/quality_distribution_2020.json
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
const runnerPath = path.join(root, 'scripts/diag-quality-distribution-2020-runner.vm.js');
const outJson = path.join(root, 'tmp', 'quality_distribution_2020.json');

const BUCKET_ORDER = ['lt50', '50-59', '60-69', '70-79', '80-89', '90-94', '95-99'];
const BUCKET_LABELS = {
  lt50: '<50',
  '50-59': '50–59',
  '60-69': '60–69',
  '70-79': '70–79',
  '80-89': '80–89',
  '90-94': '90–94',
  '95-99': '95–99',
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

function injectQualityDiagPatches(src) {
  return injectHeadlessLaunchNewsGuard(src)
    .replace(
      'const totalProgSpend=cappedProg+(s.progInvestment||0);',
      'const totalProgSpend=cappedProg+(s.progInvestment||0);s._wlLastProgSpend=totalProgSpend;',
    );
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

function loadVm(marketId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  try {
    vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  } catch (_e) {
    /* optional */
  }
  vm.runInContext(readFileSync(ceilingPath, 'utf8'), ctx, { timeout: 600_000 });
  const legacySrc = injectQualityDiagPatches(
    patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId),
  );
  vm.runInContext(legacySrc, ctx, { filename: 'legacy.js', timeout: 600_000 });
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

function emptyBuckets() {
  const o = {};
  BUCKET_ORDER.forEach((b) => {
    o[b] = 0;
  });
  return o;
}

function addBuckets(target, source) {
  BUCKET_ORDER.forEach((b) => {
    target[b] = (target[b] || 0) + (source[b] || 0);
  });
}

function bucketsToPct(counts) {
  const total = BUCKET_ORDER.reduce((s, b) => s + (counts[b] || 0), 0);
  const pct = {};
  BUCKET_ORDER.forEach((b) => {
    pct[b] = total > 0 ? Math.round(((counts[b] || 0) / total) * 10000) / 100 : 0;
  });
  return { counts, total, pct };
}

function median(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function mean(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x));
  if (!a.length) return null;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function aggregateElite9599(results) {
  const elite = results
    .filter((r) => r.ok)
    .flatMap((r) =>
      (r.elite9599 || []).map((s) => ({
        ...s,
        marketId: r.marketId,
        rankTier: r.rankTier,
        startYear: r.startYear,
      })),
    );

  const n = elite.length;
  const count = (pred) => elite.filter(pred).length;

  const independent = count((s) => s.ownership === 'independent');
  const corporate = count((s) => s.ownership === 'corporate');
  const player = count((s) => s.ownership === 'player');
  const simulcast = count((s) => s.simulcastFollower);
  const morningAbove95 = count((s) => s.morningQualityAbove95);

  const ages = elite.map((s) => s.stationAgeYears).filter((x) => x != null && Number.isFinite(x));
  const lossYears = elite
    .map((s) => s.yearsSinceMajorTalentLoss)
    .filter((x) => x != null && Number.isFinite(x));

  const byTier = {};
  for (const tier of ['mega', 'large', 'medium', 'small']) {
    const sub = elite.filter((s) => s.rankTier === tier);
    const sn = sub.length;
    byTier[tier] = {
      n: sn,
      independent: sub.filter((s) => s.ownership === 'independent').length,
      corporate: sub.filter((s) => s.ownership === 'corporate').length,
      player: sub.filter((s) => s.ownership === 'player').length,
      simulcastFollower: sub.filter((s) => s.simulcastFollower).length,
      morningQualityAbove95: sub.filter((s) => s.morningQualityAbove95).length,
      avgStationAgeYears: mean(sub.map((s) => s.stationAgeYears)),
      avgYearsSinceMajorTalentLoss: mean(
        sub.map((s) => s.yearsSinceMajorTalentLoss).filter((x) => x != null),
      ),
    };
  }

  return {
    totalInBucket: n,
    counts: {
      independentlyOwned: independent,
      corporateOwned: corporate,
      playerOwned: player,
      simulcastFollowers: simulcast,
      morningQualityAbove95: morningAbove95,
    },
    pct: {
      independentlyOwned: n ? Math.round((100 * independent) / n * 100) / 100 : 0,
      corporateOwned: n ? Math.round((100 * corporate) / n * 100) / 100 : 0,
      playerOwned: n ? Math.round((100 * player) / n * 100) / 100 : 0,
      simulcastFollowers: n ? Math.round((100 * simulcast) / n * 100) / 100 : 0,
      morningQualityAbove95: n ? Math.round((100 * morningAbove95) / n * 100) / 100 : 0,
    },
    avgStationAgeYears: mean(ages),
    medianStationAgeYears: median(ages),
    avgYearsSinceMajorTalentLoss: mean(lossYears),
    medianYearsSinceMajorTalentLoss: median(lossYears),
    stationsWithRecordedMajorLoss: lossYears.length,
    stationsWithNoRecordedMajorLoss: n - lossYears.length,
    byMarketSize: byTier,
    definitions: {
      ownership:
        'player=isPlayer; corporate=corpOwner set; independent=neither (includes aiLicenseeKey indie groups).',
      simulcastFollower: 'isSimulcastProgrammingReceiver(st,G) — explicit programming receiver leg.',
      morningQualityAbove95: 'prog.morningDrive.quality > 95 at 2020 snapshot.',
      stationAgeYears: 'Periods since launchPeriod on dial ÷ 2, else entryTurn year delta.',
      majorTalentLoss:
        'Prime daypart (morning/afternoon) departure with prior host Q≥60, superstar, or 10+ periods tenure; also TALENT history scan.',
    },
  };
}

function aggregateResults(results) {
  const ok = results.filter((r) => r.ok);
  const allStations = ok.flatMap((r) =>
    (r.stations2020 || []).map((s) => ({
      ...s,
      marketId: r.marketId,
      rankTier: r.rankTier,
      startYear: r.startYear,
    })),
  );

  const overallCounts = emptyBuckets();
  ok.forEach((r) => addBuckets(overallCounts, r.bucketCounts || {}));

  const byTier = {};
  const byEra = {};
  const byTierEra = {};

  ok.forEach((r) => {
    const tier = r.rankTier || 'medium';
    const era = String(r.startYear);
    if (!byTier[tier]) byTier[tier] = emptyBuckets();
    if (!byEra[era]) byEra[era] = emptyBuckets();
    const teKey = `${tier}|${era}`;
    if (!byTierEra[teKey]) byTierEra[teKey] = { tier, era, counts: emptyBuckets() };
    addBuckets(byTier[tier], r.bucketCounts || {});
    addBuckets(byEra[era], r.bucketCounts || {});
    addBuckets(byTierEra[teKey].counts, r.bucketCounts || {});
  });

  const prog904 = allStations.filter((s) => s.bucket === '90-94').map((s) => s.progSpendRecent);
  const prog9599 = allStations.filter((s) => s.bucket === '95-99').map((s) => s.progSpendRecent);

  const climb80 = allStations
    .map((s) => s.years80to90)
    .filter((y) => y != null && y >= 0);
  const climb90 = allStations
    .map((s) => s.years90to95)
    .filter((y) => y != null && y >= 0);

  const streak10 = allStations.filter((s) => (s.max90StreakYears || 0) >= 10);

  const byTierProg = {};
  const byTierStreak = {};
  for (const tier of ['mega', 'large', 'medium', 'small']) {
    const tierSt = allStations.filter((s) => s.rankTier === tier);
    byTierProg[tier] = {
      medianProg90_94: median(tierSt.filter((s) => s.bucket === '90-94').map((s) => s.progSpendRecent)),
      medianProg95_99: median(tierSt.filter((s) => s.bucket === '95-99').map((s) => s.progSpendRecent)),
      n90_94: tierSt.filter((s) => s.bucket === '90-94').length,
      n95_99: tierSt.filter((s) => s.bucket === '95-99').length,
    };
    byTierStreak[tier] = {
      stationsWith10PlusYearsAt90Plus: tierSt.filter((s) => (s.max90StreakYears || 0) >= 10).length,
      totalStations: tierSt.length,
    };
  }

  return {
    runs: { total: results.length, ok: ok.length, failed: results.length - ok.length },
    overall2020: bucketsToPct(overallCounts),
    byMarketSize: Object.fromEntries(
      Object.entries(byTier).map(([tier, counts]) => [tier, bucketsToPct(counts)]),
    ),
    byStartEra: Object.fromEntries(
      Object.entries(byEra).map(([era, counts]) => [era, bucketsToPct(counts)]),
    ),
    byMarketSizeAndEra: Object.fromEntries(
      Object.entries(byTierEra).map(([key, v]) => [
        key,
        { tier: v.tier, era: v.era, ...bucketsToPct(v.counts) },
      ]),
    ),
    programmingBudget: {
      medianPerPeriod_90_94: median(prog904),
      medianPerPeriod_95_99: median(prog9599),
      meanPerPeriod_90_94: mean(prog904),
      meanPerPeriod_95_99: mean(prog9599),
      nStations_90_94: prog904.length,
      nStations_95_99: prog9599.length,
      byMarketSize: byTierProg,
      note: 'Uses avg programming spend over last ~4 periods at 2020 (recurring progBudget + AI progInvestment).',
    },
    climbTimes: {
      avgYears_80_to_90: mean(climb80),
      medianYears_80_to_90: median(climb80),
      samples_80_to_90: climb80.length,
      avgYears_90_to_95: mean(climb90),
      medianYears_90_to_95: median(climb90),
      samples_90_to_95: climb90.length,
      note: 'Calendar years from first fall snapshot at/above threshold; stations must hit lower tier before upper.',
    },
    streak90Plus: {
      stationsMaintaining90PlusFor10PlusYears: streak10.length,
      totalStationSnapshots: allStations.length,
      pctOfCommercial: allStations.length
        ? Math.round((100 * streak10.length) / allStations.length * 100) / 100
        : 0,
      byMarketSize: byTierStreak,
      note: 'Consecutive calendar years with oq≥90 at fall book (period 2).',
    },
    elite9599Breakdown: aggregateElite9599(results),
  };
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log('[diag:quality-distribution-2020]', config);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const ctx = loadVm(config.markets[0]);
  const results = ctx.__wlRunQualityDistribution2020(config);
  const summary = {
    generatedAt: new Date().toISOString(),
    config,
    bucketLabels: BUCKET_LABELS,
    ...aggregateResults(results),
  };

  writeFileSync(outJson, JSON.stringify(summary, null, 2));
  console.log('[diag:quality-distribution-2020] wrote', outJson);
  console.log(JSON.stringify(summary, null, 2));
}

main();
