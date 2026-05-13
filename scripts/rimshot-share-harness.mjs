#!/usr/bin/env node
/**
 * Rimshot / low-coverage headline-share harness — headless legacy.js + advTurn().
 *
 * Measures how often commercial stations with effUniverse < --universe-max hit
 * headline share thresholds (15% / 20% / 25%) across seeded Monte Carlo runs.
 *
 * Uses the same VM + legacy loading pattern as validate-gm-campaign-headless.mjs
 * (real engine, no reimplementation of ratings math).
 *
 * Usage (space-separated or equals form):
 *   node scripts/rimshot-share-harness.mjs --runs 200 --periods 48 --market wichita
 *   node scripts/rimshot-share-harness.mjs --runs=200 --markets wichita,atlanta,nashville
 *   node scripts/rimshot-share-harness.mjs --markets wichita,nashville,atlanta,seattle,chicago --runs 200 --periods 48 --universe-max 0.25
 *
 * npm forwards args after `--`:
 *   npm run sim:rimshot-harness -- --runs 2 --periods 2 --market atlanta
 *
 * Options:
 *   --runs <n>           Monte Carlo seeds (default 100)
 *   --seed-start <n>     First seed (default 1)
 *   --periods <n>        advTurn calls per run after genMarket (default 48)
 *   --market <id>        Single market (default wichita) if --markets omitted
 *   --markets <a,b,c>    Comma-separated list (overrides --market)
 *   --scenario <id>      genMarket scenario id (default under)
 *   --universe-max <n>   Rimshot threshold: effUniverse < n (default 0.25)
 *   --json [path]        Write full JSON report (path optional)
 *   --quiet              Less engine console noise; parsed options still print to stderr
 *
 * npm: npm run sim:rimshot-harness
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const gmModePath = path.join(root, 'src', 'gmMode.js');
const campaignModePath = path.join(root, 'src', 'campaignMode.js');

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function makeLegacySrc(marketId) {
  let legacySrc = readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  }
  legacySrc = legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
  return injectHeadlessMegaFragNewsGuard(legacySrc);
}

function loadEngine(ctx, marketId) {
  const campaignSrc = readFileSync(campaignModePath, 'utf8');
  const gmSrc = readFileSync(gmModePath, 'utf8');
  const legacySrc = makeLegacySrc(marketId);
  vm.runInContext(campaignSrc, ctx);
  vm.runInContext(gmSrc, ctx);
  vm.runInContext(legacySrc, ctx);
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createHeadlessContext(quiet) {
  const noop = () => {};
  const ctx = vm.createContext({
    console: quiet
      ? { log: noop, warn: noop, error: console.error, table: noop, info: noop }
      : console,
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: {
      body: { innerHTML: '' },
      head: { appendChild() {} },
      addEventListener: noop,
      removeEventListener: noop,
      createElement() {
        return { href: '', download: '', click() {} };
      },
      getElementById() {
        return {
          disabled: false,
          textContent: '',
          innerHTML: '',
          value: '',
          style: {},
          classList: { contains() { return false; }, add() {}, remove() {} },
          appendChild() {},
          querySelector() { return null; },
          focus() {},
          click() {},
          addEventListener() {},
          removeEventListener() {},
        };
      },
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return null;
      },
      readyState: 'complete',
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() {}, setItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn, _ms) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() {
      return 0;
    },
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert: noop,
    fetch: null,
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('utf8'),
    Blob: class BlobStub {
      constructor() {}
    },
    FileReader: class FileReaderStub {
      readAsText() {}
    },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) {
          typedArray[i] = Math.floor(Math.random() * 256);
        }
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
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
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: true, players: [], renderStatus: noop };
  ctx.cm = noop;
  ctx.om = noop;
  ctx.showToast = noop;
  ctx.showError = noop;
  ctx.autoSave = noop;
  ctx.wlTrackSoloSession = noop;
  ctx.getLocalSave = () => null;
  ctx.openScenSelect = noop;
  return ctx;
}

/** Flags that take a value (may use `--flag value` or `--flag=value`). */
const FLAGS_WITH_VALUE = new Set(['runs', 'seed-start', 'periods', 'market', 'markets', 'scenario', 'universe-max', 'json']);

function parseArgs(argv) {
  const out = {
    runs: 100,
    seedStart: 1,
    periods: 48,
    market: 'wichita',
    markets: null,
    scenario: 'under',
    universeMax: 0.25,
    json: null,
    quiet: false,
  };

  const unknown = [];
  const positionals = [];

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];

    if (!token.startsWith('--')) {
      positionals.push(token);
      i++;
      continue;
    }

    let key;
    let val;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      key = token.slice(2, eq);
      val = token.slice(eq + 1);
      i++;
      if (key === 'quiet') {
        out.quiet = val !== 'false' && val !== '0';
        continue;
      }
      if (!FLAGS_WITH_VALUE.has(key)) {
        unknown.push(token);
        continue;
      }
    } else {
      key = token.slice(2);
      if (key === 'quiet') {
        out.quiet = true;
        i++;
        continue;
      }
      if (!FLAGS_WITH_VALUE.has(key)) {
        unknown.push(token);
        i++;
        continue;
      }
      if (key === 'json') {
        if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
          val = argv[i + 1];
          i += 2;
        } else {
          val = undefined;
          i++;
        }
      } else {
        if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
          throw new Error(`[rimshot-harness] Missing value for --${key} (use --${key} <value> or --${key}=<value>)`);
        }
        val = argv[i + 1];
        i += 2;
      }
    }

    switch (key) {
      case 'runs': {
        const n = parseInt(String(val), 10);
        if (!Number.isFinite(n) || n < 1) throw new Error(`[rimshot-harness] Invalid --runs: ${val}`);
        out.runs = n;
        break;
      }
      case 'seed-start': {
        const n = parseInt(String(val), 10);
        if (!Number.isFinite(n)) throw new Error(`[rimshot-harness] Invalid --seed-start: ${val}`);
        out.seedStart = n;
        break;
      }
      case 'periods': {
        const n = parseInt(String(val), 10);
        if (!Number.isFinite(n) || n < 1) throw new Error(`[rimshot-harness] Invalid --periods: ${val}`);
        out.periods = n;
        break;
      }
      case 'market':
        out.market = String(val || '').trim() || 'wichita';
        break;
      case 'markets':
        out.markets = String(val || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!out.markets.length) throw new Error('[rimshot-harness] --markets list is empty');
        break;
      case 'scenario':
        out.scenario = String(val || '').trim() || 'under';
        break;
      case 'universe-max': {
        const x = Number(val);
        if (!Number.isFinite(x) || x <= 0 || x > 1) {
          throw new Error(`[rimshot-harness] Invalid --universe-max (expect 0–1): ${val}`);
        }
        out.universeMax = x;
        break;
      }
      case 'json':
        out.json = val != null && String(val).trim() ? String(val).trim() : null;
        break;
      default:
        unknown.push(`--${key}`);
    }
  }

  if (positionals.length) {
    throw new Error(
      `[rimshot-harness] Unexpected positional argument(s): ${positionals.map((p) => JSON.stringify(p)).join(', ')}\n` +
        '  This script only accepts --flags. See header comment in scripts/rimshot-share-harness.mjs',
    );
  }
  if (unknown.length) {
    throw new Error(
      `[rimshot-harness] Unknown or unsupported flag(s): ${unknown.join(', ')}\n` +
        '  Supported: --runs, --seed-start, --periods, --market, --markets, --scenario, --universe-max, --json, --quiet',
    );
  }

  return out;
}

/** Always stderr so stdout stays JSON-only for piping. */
function logParsedOptions(opts, resolvedMarkets) {
  const summary = {
    runs: opts.runs,
    seedStart: opts.seedStart,
    periods: opts.periods,
    markets: resolvedMarkets,
    scenario: opts.scenario,
    universeMax: opts.universeMax,
    json: opts.json,
    quiet: opts.quiet,
  };
  console.error('[rimshot-harness] parsed options:', JSON.stringify(summary));
}

function runOne(ctx, opts) {
  const { seed, marketId, periods, scenarioId, universeMax } = opts;
  return vm.runInContext(
    `
    (function(){
      var rng = (${mulberry32.toString()})(${seed >>> 0});
      Math.random = function(){ return rng(); };
      ACTIVE_MARKET = ${JSON.stringify(marketId)};
      _selectedMarket = ${JSON.stringify(marketId)};
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(${JSON.stringify(marketId)});

      G = genMarket(${JSON.stringify(scenarioId)});
      G.marketId = ${JSON.stringify(marketId)};
      G.ps = (G.stations || []).filter(function(s){ return s && s.isPlayer; });

      var UMAX = ${Number(universeMax)};
      var rimshotsPerPeriod = [];
      var maxShareById = {};

      for (var t = 0; t < ${periods | 0}; t++) {
        advTurn();
        var row = [];
        (G.stations || []).forEach(function(s) {
          if (!s || s.isPublic || s._bpSlotDeferred) return;
          var eu = typeof effUniverse === 'function' ? effUniverse(s) : (s.sig && s.sig.universe != null ? s.sig.universe : 0.65);
          if (!(eu < UMAX)) return;
          var sh = Number(s.rat && s.rat.share);
          if (!isFinite(sh)) return;
          var id = s.id || '';
          var prev = maxShareById[id];
          if (!isFinite(prev) || sh > prev) maxShareById[id] = sh;
          row.push({
            id: id,
            callLetters: s.callLetters || '',
            format: s.format || '',
            eu: eu,
            share: sh,
            rev: s.fin && s.fin.rev != null ? s.fin.rev : null,
            pw: s.sig && s.sig.pw,
            band: s.sig && s.sig.type
          });
        });
        rimshotsPerPeriod.push({
          turn: t + 1,
          year: G.year,
          period: G.period,
          stations: row
        });
      }

      return { rimshotsPerPeriod: rimshotsPerPeriod, maxShareById: maxShareById };
    })()
    `,
    ctx,
  );
}

function aggregate(reportRows, thresholds) {
  let n = 0;
  let ge15 = 0;
  let ge20 = 0;
  let ge25 = 0;
  for (const r of reportRows) {
    const sh = r.share;
    if (!(sh >= 0)) continue;
    n++;
    if (sh >= thresholds[0]) ge15++;
    if (sh >= thresholds[1]) ge20++;
    if (sh >= thresholds[2]) ge25++;
  }
  return {
    rimshotStationObservations: n,
    pctShareGte15: n ? ge15 / n : 0,
    pctShareGte20: n ? ge20 / n : 0,
    pctShareGte25: n ? ge25 / n : 0,
  };
}

function main() {
  let opts;
  let markets;
  try {
    opts = parseArgs(process.argv.slice(2));
    markets = opts.markets && opts.markets.length ? opts.markets : [opts.market];
    logParsedOptions(opts, markets);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }

  const thresholds = [0.15, 0.2, 0.25];

  const byMarket = {};
  const allRows = [];

  for (const marketId of markets) {
    const ctx = createHeadlessContext(opts.quiet);
    loadEngine(ctx, marketId);

    const reportRows = [];
    const maxEver = [];

    for (let i = 0; i < opts.runs; i++) {
      const seed = opts.seedStart + i;
      const out = runOne(ctx, {
        seed,
        marketId,
        periods: opts.periods,
        scenarioId: opts.scenario,
        universeMax: opts.universeMax,
      });

      for (const per of out.rimshotsPerPeriod || []) {
        for (const st of per.stations || []) {
          reportRows.push({
            marketId,
            seed,
            turn: per.turn,
            year: per.year,
            period: per.period,
            ...st,
          });
        }
      }
      for (const [id, sh] of Object.entries(out.maxShareById || {})) {
        maxEver.push({ marketId, seed, stationId: id, maxShare: sh });
      }
    }

    const agg = aggregate(reportRows, thresholds);
    byMarket[marketId] = {
      rimshotStationObservations: agg.rimshotStationObservations,
      pctShareGte15: fmtPct(agg.pctShareGte15),
      pctShareGte20: fmtPct(agg.pctShareGte20),
      pctShareGte25: fmtPct(agg.pctShareGte25),
      runs: opts.runs,
      periodsPerRun: opts.periods,
      scenario: opts.scenario,
      universeMax: opts.universeMax,
    };

    allRows.push(...reportRows);
    maxEver.sort((a, b) => b.maxShare - a.maxShare);
    byMarket[marketId].topMaxShareSamples = maxEver.slice(0, 8);
  }

  const g = aggregate(allRows, thresholds);

  const report = {
    meta: {
      runsPerMarket: opts.runs,
      seedRange: [opts.seedStart, opts.seedStart + opts.runs - 1],
      periodsPerRun: opts.periods,
      scenario: opts.scenario,
      universeMax: opts.universeMax,
      markets,
      thresholdsPct: thresholds.map((x) => Math.round(x * 100)),
      note:
        'Each observation is one commercial station after one advTurn where effUniverse < universeMax. Same station appears many times across turns/runs.',
    },
    global: {
      rimshotStationObservations: g.rimshotStationObservations,
      pctShareGte15: fmtPct(g.pctShareGte15),
      pctShareGte20: fmtPct(g.pctShareGte20),
      pctShareGte25: fmtPct(g.pctShareGte25),
    },
    byMarket,
  };

  if (!opts.quiet) {
    console.log(JSON.stringify(report, null, 2));
  }

  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify(report, null, 2), 'utf8');
    if (!opts.quiet) console.error('Wrote', opts.json);
  }
}

function fmtPct(x) {
  return `${(100 * x).toFixed(2)}%`;
}

main();
