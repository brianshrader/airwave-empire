#!/usr/bin/env node
/**
 * PERSONALITY_TALK multi-run validation — era shape, market plausibility, dominance, AI adoption.
 *
 * Default: career mode (one continuous sim per run×market), 20 runs, 7 core markets, checkpoints 1990–2026.
 *
 *   node scripts/validate-personality-talk.mjs
 *   node scripts/validate-personality-talk.mjs --runs=20 --csv=tmp/personality_talk_validation.csv
 *   node scripts/validate-personality-talk.mjs --mode=snapshot
 *   node scripts/validate-personality-talk.mjs --mode=both
 *   node scripts/validate-personality-talk.mjs --markets=newyork,wichita,sanfrancisco
 *   node scripts/validate-personality-talk.mjs --years=1993,2005,2010,2024
 *   node scripts/validate-personality-talk.mjs --no-2026   # drop 2026 checkpoint
 *
 * Playable market ids (no Dallas/Boston in repo): newyork, losangeles, chicago, seattle,
 *   sanfrancisco, atlanta, nashville, wichita — use --markets= to add sanfrancisco etc.
 *
 * Env: VALIDATION_QUIET=0 — legacy console.log in VM
 */
/* eslint-disable no-console */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const defaultCsvPath = path.join(root, 'tmp', 'personality_talk_validation.csv');

/** Required minimum set (user spec). Order stable for reporting. */
const DEFAULT_MARKETS = [
  'newyork',
  'losangeles',
  'chicago',
  'atlanta',
  'seattle',
  'nashville',
  'wichita',
];

const DEFAULT_CHECKPOINT_YEARS = [1990, 1992, 1993, 1995, 2000, 2005, 2010, 2015, 2020, 2024, 2026];

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function loadLegacySrc() {
  let src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  return injectHeadlessMegaFragNewsGuard(src);
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
    closest() {
      return null;
    },
  };
}

const documentStub = {
  body: { innerHTML: '' },
  head: { appendChild() {} },
  createElement() {
    return { href: '', download: '', click() {} };
  },
  getElementById() {
    return stubEl();
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext(quiet) {
  const noop = () => {};
  const ctx = vm.createContext({
    console: quiet
      ? { log: noop, warn: noop, error: console.error, table: noop }
      : console,
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
    setInterval() {
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class {
      constructor() {}
    },
    FileReader: class {
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
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function loadSim(ctx) {
  injectMarketEcologyIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx, { filename: 'legacy.js' });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx, { filename: 'marketSimHarness.js' });
}

function installRunner(ctx) {
  const code = `
(function () {
  var DRIFT_STORE = 'PERSONALITY_TALK';
  var EDGY_MAX = 40;
  var LIFESTYLE_MIN = 60;

  function collectRow(G, fields) {
    var marketId = fields.marketId;
    var seed = fields.seed;
    var run = fields.run;
    var bookYear = fields.bookYear;
    var mode = fields.mode;
    var advanceSteps = fields.advanceSteps != null ? fields.advanceSteps : null;

    var comm = (G.stations || []).filter(function (s) {
      return s && !s._bpSlotDeferred && !s.isPublic && !stationIsNoncommercialInstitutional(s);
    });
    comm.sort(function (a, b) {
      var sa = a.rat && a.rat.share != null ? a.rat.share : 0;
      var sb = b.rat && b.rat.share != null ? b.rat.share : 0;
      return sb - sa;
    });
    var idToRank = {};
    var i;
    for (i = 0; i < comm.length; i++) {
      idToRank[comm[i].id] = i + 1;
    }

    var totalShare = 0;
    for (i = 0; i < comm.length; i++) {
      totalShare += comm[i].rat && comm[i].rat.share != null ? comm[i].rat.share : 0;
    }

    var pers = (G.stations || []).filter(function (s) {
      return s && !s._bpSlotDeferred && !s.isPublic && !stationIsNoncommercialInstitutional(s) && s.format === 'PERSONALITY_TALK';
    });

    var persShareSum = 0;
    var bestShare = 0;
    var bestRank = null;
    var bestId = null;
    var aiReformat = 0;
    var edgyN = 0;
    var lifeN = 0;
    var midN = 0;
    var ebitdaSum = 0;
    var lbl = '';
    try {
      lbl = String(fmtLabel('PERSONALITY_TALK') || '');
    } catch (e1) {}

    for (i = 0; i < pers.length; i++) {
      var st = pers[i];
      var sh = st.rat && st.rat.share != null ? st.rat.share : 0;
      persShareSum += sh;
      if (sh > bestShare) {
        bestShare = sh;
        bestId = st.id;
      }
      if (st._aiLastMajorReason && String(st._aiLastMajorReason).indexOf('reformat:') === 0 && lbl && String(st._aiLastMajorReason).indexOf(lbl) !== -1) {
        aiReformat++;
      }
      var d = st.drift && st.drift[DRIFT_STORE] != null ? st.drift[DRIFT_STORE] : null;
      if (d == null) midN++;
      else if (d < EDGY_MAX) edgyN++;
      else if (d > LIFESTYLE_MIN) lifeN++;
      else midN++;
      var eb = st.fin && st.fin.ebitda != null ? st.fin.ebitda : 0;
      ebitdaSum += eb;
    }

    if (bestId != null && idToRank[bestId] != null) bestRank = idToRank[bestId];

    var ecosystemShare = totalShare > 0 ? persShareSum / totalShare : 0;
    var meanPersEbitda = pers.length ? ebitdaSum / pers.length : null;

    var unlocked = typeof formatUnlockedForYear === 'function' ? formatUnlockedForYear('PERSONALITY_TALK', G) : null;

    return {
      ok: true,
      mode: mode,
      marketId: marketId,
      seed: seed,
      run: run,
      bookYear: bookYear,
      simYear: G.year,
      simPeriod: G.period,
      advanceSteps: advanceSteps,
      personalityUnlocked: unlocked,
      personalityStationCount: pers.length,
      bestPersonalityShare: bestShare,
      bestPersonalityRank: bestRank,
      totalPersonalityEcosystemShare: ecosystemShare,
      aiReformatIntoPersonalityCount: aiReformat,
      edgyPositionedCount: edgyN,
      lifestylePositionedCount: lifeN,
      midDriftPositionedCount: midN,
      meanPersonalityStationEbitda: meanPersEbitda,
      commercialStationCount: comm.length,
      top15: bestRank != null && bestRank <= 15 ? 1 : 0,
      top10: bestRank != null && bestRank <= 10 ? 1 : 0,
      top5: bestRank != null && bestRank <= 5 ? 1 : 0,
      num1: bestRank === 1 ? 1 : 0,
    };
  }

  window.__personalityHarness_career = function (opts) {
    opts = opts || {};
    var marketId = opts.marketId || 'newyork';
    var seed = opts.seed != null ? opts.seed : 777001;
    var years = opts.years || [];
    var run = opts.run != null ? opts.run : 0;
    var maxAdvance = opts.maxAdvance != null ? opts.maxAdvance : 20000;

    var origR = Math.random;
    var rng = seed;
    Math.random = function () {
      rng = (rng * 9301 + 49297) % 233280;
      return rng / 233280;
    };
    var ui = typeof window._harnessPatchTimersAndUi === 'function' ? window._harnessPatchTimersAndUi() : { restore: function () {} };
    var rows = [];
    var totalSteps = 0;
    try {
      ACTIVE_MARKET = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      G = genMarketMP('1985');
      MP.mode = 'solo';
      MP.isHost = false;
      if (MP.players) MP.players = [];

      var yi;
      for (yi = 0; yi < years.length; yi++) {
        var y = years[yi];
        var adv = advanceGToYearPeriod(y, 2, maxAdvance);
        totalSteps += adv.steps;
        if (!adv.ok) {
          return {
            ok: false,
            error: adv.error,
            at: adv.at,
            marketId: marketId,
            seed: seed,
            run: run,
            bookYear: y,
            partialRows: rows,
          };
        }
        advTurn();
        totalSteps++;
        rows.push(
          collectRow(G, {
            marketId: marketId,
            seed: seed,
            run: run,
            bookYear: y,
            mode: 'career',
            advanceSteps: totalSteps,
          })
        );
      }
      return { ok: true, marketId: marketId, seed: seed, run: run, rows: rows };
    } finally {
      ui.restore();
      Math.random = origR;
    }
  };

  window.__personalityHarness_snapshot = function (opts) {
    opts = opts || {};
    var marketId = opts.marketId || 'newyork';
    var seed = opts.seed != null ? opts.seed : 777001;
    var targetYear = opts.targetYear != null ? opts.targetYear : 2005;
    var run = opts.run != null ? opts.run : 0;
    var maxAdvance = opts.maxAdvance != null ? opts.maxAdvance : 20000;

    var origR = Math.random;
    var rng = seed;
    Math.random = function () {
      rng = (rng * 9301 + 49297) % 233280;
      return rng / 233280;
    };
    var ui = typeof window._harnessPatchTimersAndUi === 'function' ? window._harnessPatchTimersAndUi() : { restore: function () {} };
    try {
      ACTIVE_MARKET = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      G = genMarketMP('1985');
      MP.mode = 'solo';
      MP.isHost = false;
      if (MP.players) MP.players = [];

      var adv = advanceGToYearPeriod(targetYear, 2, maxAdvance);
      if (!adv.ok) {
        return { ok: false, error: adv.error, marketId: marketId, seed: seed, run: run, bookYear: targetYear, mode: 'snapshot' };
      }
      advTurn();
      var row = collectRow(G, {
        marketId: marketId,
        seed: seed,
        run: run,
        bookYear: targetYear,
        mode: 'snapshot',
        advanceSteps: adv.steps + 1,
      });
      return row;
    } finally {
      ui.restore();
      Math.random = origR;
    }
  };
})();
`;
  vm.runInContext(code, ctx);
}

function parseArg(argv, prefix, def) {
  for (const a of argv) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return def;
}

function parseCsvPath(argv) {
  const v = parseArg(argv, '--csv=', null);
  return v || defaultCsvPath;
}

function parseMarkets(argv) {
  const v = parseArg(argv, '--markets=', null);
  if (!v) return [...DEFAULT_MARKETS];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseRuns(argv) {
  const v = parseArg(argv, '--runs=', '20');
  return Math.max(1, parseInt(v, 10) || 20);
}

function parseMode(argv) {
  const v = parseArg(argv, '--mode=', 'career');
  if (v === 'snapshot' || v === 'career' || v === 'both') return v;
  return 'career';
}

function parseYears(argv, include2026) {
  const custom = parseArg(argv, '--years=', null);
  if (custom) {
    return custom
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }
  let ys = [...DEFAULT_CHECKPOINT_YEARS];
  if (!include2026) ys = ys.filter((y) => y !== 2026);
  return ys;
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function mean(arr) {
  if (!arr.length) return null;
  const v = arr.filter((x) => x != null && !isNaN(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function fmt(n, d = 4) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toFixed(d);
}

function main() {
  const argv = process.argv.slice(2);
  const quiet = process.env.VALIDATION_QUIET !== '0';
  const csvPath = parseCsvPath(argv);
  const markets = parseMarkets(argv);
  const runs = parseRuns(argv);
  const mode = parseMode(argv);
  const include2026 = !argv.includes('--no-2026');
  const years = parseYears(argv, include2026).sort((a, b) => a - b);

  const ctx = createVmContext(quiet);
  loadSim(ctx);
  installRunner(ctx);

  const rows = [];
  const career = mode === 'career' || mode === 'both';
  const snapshot = mode === 'snapshot' || mode === 'both';

  for (let r = 0; r < runs; r++) {
    for (let mi = 0; mi < markets.length; mi++) {
      const marketId = markets[mi];
      const baseSeed = 501927 + r * 10007 + mi * 131;

      if (career) {
        const res = ctx.window.__personalityHarness_career({
          marketId,
          seed: baseSeed,
          years,
          run: r,
          maxAdvance: 22000,
        });
        if (!res.ok) {
          rows.push({
            ok: false,
            mode: 'career',
            marketId,
            run: r,
            seed: baseSeed,
            bookYear: res.bookYear,
            error: res.error,
            at: res.at ? JSON.stringify(res.at) : '',
          });
          continue;
        }
        for (const row of res.rows) rows.push(row);
      }

      if (snapshot) {
        for (const y of years) {
          const snapSeed = baseSeed + y * 17;
          const row = ctx.window.__personalityHarness_snapshot({
            marketId,
            seed: snapSeed,
            targetYear: y,
            run: r,
            maxAdvance: 22000,
          });
          if (!row.ok) {
            rows.push({
              ok: false,
              mode: 'snapshot',
              marketId,
              run: r,
              seed: snapSeed,
              bookYear: y,
              error: row.error,
            });
          } else rows.push(row);
        }
      }
    }
  }

  const dir = path.dirname(csvPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const headers = [
    'ok',
    'mode',
    'bookYear',
    'marketId',
    'run',
    'seed',
    'personalityUnlocked',
    'personalityStationCount',
    'bestPersonalityShare',
    'bestPersonalityRank',
    'totalPersonalityEcosystemShare',
    'aiReformatIntoPersonalityCount',
    'edgyPositionedCount',
    'lifestylePositionedCount',
    'midDriftPositionedCount',
    'meanPersonalityStationEbitda',
    'commercialStationCount',
    'top15',
    'top10',
    'top5',
    'num1',
    'simYear',
    'simPeriod',
    'advanceSteps',
    'error',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  writeFileSync(csvPath, lines.join('\n'), 'utf8');

  const okRows = rows.filter((x) => x.ok);
  const careerRows = okRows.filter((x) => x.mode === 'career');
  const snapRows = okRows.filter((x) => x.mode === 'snapshot');

  function byYearTable(sub) {
    const byY = new Map();
    for (const row of sub) {
      const y = row.bookYear;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push(row);
    }
    const ys = [...byY.keys()].sort((a, b) => a - b);
    return { byY, ys };
  }

  function printByYear(title, sub) {
    const { byY, ys } = byYearTable(sub);
    console.log('');
    console.log(title);
    console.log(
      'year'.padEnd(6) +
        'nCell'.padStart(7) +
        'meanStn'.padStart(10) +
        'pctAny%'.padStart(10) +
        'meanBestSh'.padStart(12) +
        'meanEco%'.padStart(12) +
        'top15%'.padStart(9) +
        'top10%'.padStart(9) +
        'top5%'.padStart(9) +
        '#1%'.padStart(8) +
        'sumAIrfm'.padStart(10)
    );
    for (const y of ys) {
      const list = byY.get(y);
      const n = list.length;
      const any = list.filter((r) => (r.personalityStationCount || 0) > 0).length;
      const withStn = list.filter((r) => (r.personalityStationCount || 0) > 0);
      const meanStn = mean(list.map((r) => r.personalityStationCount || 0));
      const meanBest = mean(list.map((r) => r.bestPersonalityShare || 0));
      const meanEco = mean(list.map((r) => r.totalPersonalityEcosystemShare || 0));
      const r15 = withStn.length ? (100 * mean(withStn.map((r) => r.top15 || 0))) : null;
      const r10 = withStn.length ? (100 * mean(withStn.map((r) => r.top10 || 0))) : null;
      const r5 = withStn.length ? (100 * mean(withStn.map((r) => r.top5 || 0))) : null;
      const r1 = withStn.length ? (100 * mean(withStn.map((r) => r.num1 || 0))) : null;
      const sumAi = list.reduce((a, r) => a + (r.aiReformatIntoPersonalityCount || 0), 0);
      console.log(
        String(y).padEnd(6) +
          String(n).padStart(7) +
          fmt(meanStn, 3).padStart(10) +
          fmt((100 * any) / n, 2).padStart(10) +
          fmt(meanBest, 4).padStart(12) +
          fmt(meanEco, 4).padStart(12) +
          (r15 != null ? fmt(r15, 2) : '—').padStart(9) +
          (r10 != null ? fmt(r10, 2) : '—').padStart(9) +
          (r5 != null ? fmt(r5, 2) : '—').padStart(9) +
          (r1 != null ? fmt(r1, 2) : '—').padStart(8) +
          String(sumAi).padStart(10)
      );
    }
  }

  function printByMarketAtYear(sub, label, yTarget) {
    console.log('');
    console.log(label);
    console.log('market'.padEnd(14) + 'n'.padStart(6) + 'meanStn'.padStart(10) + 'meanEco%'.padStart(12) + 'pctAny%'.padStart(10) + 'meanBestSh'.padStart(12));
    const slice = sub.filter((r) => r.bookYear === yTarget);
    const byM = new Map();
    for (const row of slice) {
      if (!byM.has(row.marketId)) byM.set(row.marketId, []);
      byM.get(row.marketId).push(row);
    }
    const mids = [...byM.keys()].sort();
    for (const mid of mids) {
      const list = byM.get(mid);
      const n = list.length;
      const any = list.filter((r) => (r.personalityStationCount || 0) > 0).length;
      console.log(
        mid.padEnd(14) +
          String(n).padStart(6) +
          fmt(mean(list.map((r) => r.personalityStationCount || 0)), 3).padStart(10) +
          fmt(mean(list.map((r) => r.totalPersonalityEcosystemShare || 0)), 4).padStart(12) +
          fmt((100 * any) / n, 2).padStart(10) +
          fmt(mean(list.map((r) => r.bestPersonalityShare || 0)), 4).padStart(12)
      );
    }
  }

  console.log('PERSONALITY_TALK validation harness');
  console.log('CSV:', csvPath);
  console.log('Mode:', mode, '| Runs:', runs, '| Markets:', markets.join(','));
  console.log('Checkpoints:', years.join(','));
  console.log('Total rows:', rows.length, '| ok:', okRows.length, '| failed:', rows.length - okRows.length);

  if (careerRows.length) printByYear('=== By year (career) ===', careerRows);
  if (snapRows.length) printByYear('=== By year (snapshot) ===', snapRows);

  if (careerRows.length) {
    printByMarketAtYear(careerRows, '=== By market @ 2024 (career) ===', 2024);
    if (years.includes(2026)) printByMarketAtYear(careerRows, '=== By market @ 2026 (career) ===', 2026);
  }

  const pre93 = careerRows.filter((r) => r.bookYear < 1993);
  const pre93Stations = pre93.reduce((a, r) => a + (r.personalityStationCount || 0), 0);
  const c2005 = careerRows.filter((r) => r.bookYear === 2005);
  const c2024 = careerRows.filter((r) => r.bookYear === 2024);
  const meanEco = (arr) => mean(arr.map((r) => r.totalPersonalityEcosystemShare || 0));

  const wich = careerRows.filter((r) => r.marketId === 'wichita' && r.bookYear === 2024);
  const mega = careerRows.filter((r) => (r.marketId === 'newyork' || r.marketId === 'losangeles') && r.bookYear === 2024);

  console.log('');
  console.log('=== Answers (career rows) ===');
  console.log('1. Format before 1993?  Station-count sum (years<1993):', pre93Stations, '(expect 0)');
  console.log('2. Late 90s / 2000s viable?  Mean ecosystem share 2000:', fmt(meanEco(careerRows.filter((r) => r.bookYear === 2000)), 4));
  console.log('3. Peak era 1998–2008?  Compare meanEco 2000 / 2005 / 2010:', fmt(meanEco(careerRows.filter((r) => r.bookYear === 2000)), 4), '/', fmt(meanEco(careerRows.filter((r) => r.bookYear === 2005)), 4), '/', fmt(meanEco(careerRows.filter((r) => r.bookYear === 2010)), 4));
  console.log('4. Post-2010 vs 2005:  meanEco 2005 → 2015 → 2020 → 2024:', fmt(meanEco(c2005), 4), '→', fmt(meanEco(careerRows.filter((r) => r.bookYear === 2015)), 4), '→', fmt(meanEco(careerRows.filter((r) => r.bookYear === 2020)), 4), '→', fmt(meanEco(c2024), 4));
  console.log('5. Plausible markets?  See "By market @ 2024" table (mega vs small).');
  console.log('6. Wichita cold @2024?  meanEco', fmt(meanEco(wich), 4), '| mega NY/LA meanEco', fmt(meanEco(mega), 4));
  console.log('7. AI adoption (sum aiReformatIntoPersonalityCount, career all years):', careerRows.reduce((a, r) => a + (r.aiReformatIntoPersonalityCount || 0), 0));
  console.log('8. Dominance?  #1 rate (among cells with any PT) — see top row table; mean best share 2024:', fmt(mean(c2024.map((r) => r.bestPersonalityShare || 0)), 4));

  const failed = rows.filter((x) => !x.ok);
  if (failed.length) {
    console.log('');
    console.log('FAIL sample:', failed[0].error, failed[0].marketId, failed[0].bookYear, failed[0].mode);
  }

  console.log('');
  console.log('Recommendation: compare 2005 vs 2024 mean ecosystem share (career). If 2024 > 2005 materially, consider smallest nudge: post-2010 AI pick penalty, mild ratings drag, or lower rival spawn persistence — do not tune without product sign-off.');
}

main();
