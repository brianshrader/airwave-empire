#!/usr/bin/env node
/**
 * AAA (Adult Album Alternative) format validation harness — snapshot and optional career paths.
 *
 * Evidence-only: does not tune sim parameters. Does not modify PUBLIC_ECLECTIC / religious / acquisition logic.
 *
 *   node scripts/validate-aaa-format.mjs
 *   node scripts/validate-aaa-format.mjs --runs=3 --mode=snapshot
 *   node scripts/validate-aaa-format.mjs --mode=career --runs=1
 *   node scripts/validate-aaa-format.mjs --mode=both --runs=2
 *   node scripts/validate-aaa-format.mjs --markets=seattle,wichita
 *   AAA_HARNESS_MARKETS=seattle,nashville node scripts/validate-aaa-format.mjs
 *
 * Semantics: after `advanceGToYearPeriod(Y,2)` the clock sits at the start of fall Y (that period’s
 * `chkEv` has not run). The harness calls one extra `advTurn()` so fall events (including AAA unlock)
 * and ratings reflect the closed fall book. CSV `year` is that calendar Y; `simYear` / `simPeriod`
 * are the post-advance game clock (often spring Y+1 / period 1).
 *
 * Env: VALIDATION_QUIET=0 — legacy console.log inside VM
 */
/* eslint-disable no-console */

import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const defaultCsvPath = path.join(root, 'tmp', 'aaa_format_validation.csv');

const DEFAULT_MARKETS = ['seattle', 'newyork', 'losangeles', 'chicago', 'atlanta', 'nashville', 'wichita'];
const DEFAULT_YEARS = [1985, 1990, 1995, 2005, 2015, 2026];
const ECOLOGY_FORMATS = [
  'AAA',
  'PUBLIC_ECLECTIC',
  'ALT_ROCK',
  'ALBUM_ROCK',
  'CLASSIC_ROCK',
  'ADULT_CONTEMP',
  'HOT_AC',
  'NEWS_TALK',
];

const CAREER_CHECKPOINTS = [1985, 1990, 1995, 2005, 2015, 2026];

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

function installHarnessRunner(ctx) {
  const code = `
(function () {
  var ECOLOGY_FORMATS = ${JSON.stringify(ECOLOGY_FORMATS)};

  function activeStations(G) {
    return (G.stations || []).filter(function (s) {
      return s && !s._bpSlotDeferred;
    });
  }

  function commercialActive(G) {
    return activeStations(G).filter(function (s) {
      return !s.isPublic && !stationIsNoncommercialInstitutional(s);
    });
  }

  function commercialRankList(G) {
    var comm = commercialActive(G);
    comm.sort(function (a, b) {
      var sa = a.rat && a.rat.share != null ? a.rat.share : 0;
      var sb = b.rat && b.rat.share != null ? b.rat.share : 0;
      return sb - sa;
    });
    return comm;
  }

  function rankOfStationInCommercialList(comm, id) {
    var idx = comm.findIndex(function (s) {
      return s.id === id;
    });
    return idx < 0 ? null : idx + 1;
  }

  function ecologyBlock(G) {
    var act = activeStations(G);
    var out = {};
    var k, fmt, list, maxSh, i, sh;
    for (k = 0; k < ECOLOGY_FORMATS.length; k++) {
      fmt = ECOLOGY_FORMATS[k];
      list = act.filter(function (s) {
        return s.format === fmt;
      });
      maxSh = 0;
      for (i = 0; i < list.length; i++) {
        sh = list[i].rat && list[i].rat.share != null ? list[i].rat.share : 0;
        if (sh > maxSh) maxSh = sh;
      }
      out['eco_' + fmt + '_count'] = list.length;
      out['eco_' + fmt + '_maxShare'] = maxSh;
    }
    return out;
  }

  function aaaLabelSuffix() {
    try {
      return String(fmtLabel('AAA') || 'AAA');
    } catch (e) {
      return 'Adult Album Alternative';
    }
  }

  /**
   * logicalCalendarYear — book year for era lift / grouping (after closing fall of that year, G.year may be Y+1).
   */
  function snapshotMetrics(G, marketId, label, run, seed, mode, logicalCalendarYear) {
    var m = MARKETS[marketId] || {};
    var edu = typeof m.eduIndex === 'number' && !isNaN(m.eduIndex) ? m.eduIndex : null;
    var tier = m.rankTier || '';
    var arch = m.archetypeId || '';
    var region = m.region || '';
    var bookY = logicalCalendarYear != null ? logicalCalendarYear : G.year;
    var eraLift = typeof aaaEraLift === 'function' ? aaaEraLift(bookY) : null;
    var plaus = typeof aaaMarketPlausibility01 === 'function' ? aaaMarketPlausibility01(marketId) : null;

    var commRanked = commercialRankList(G);
    var aaaList = commRanked.filter(function (s) {
      return s.format === 'AAA';
    });
    var nAaa = aaaList.length;
    var best = nAaa ? aaaList[0] : null;
    var rank = best ? rankOfStationInCommercialList(commRanked, best.id) : null;
    var share = best && best.rat ? best.rat.share : null;
    var aqh = best && best.rat && best.rat.aqh != null ? best.rat.aqh : null;
    var rev = best && best.fin && best.fin.rev != null ? best.fin.rev : null;
    var ebitda = best && best.fin && best.fin.ebitda != null ? best.fin.ebitda : null;

    var lbl = aaaLabelSuffix();
    var aiReformatToAaa = 0;
    var event1985p2Aaa = 0;
    var j, st;
    for (j = 0; j < aaaList.length; j++) {
      st = aaaList[j];
      if (st._aiLastMajorReason && String(st._aiLastMajorReason).indexOf('reformat:') === 0 && String(st._aiLastMajorReason).indexOf(lbl) !== -1) {
        aiReformatToAaa++;
      }
      if (st.entryTurn && st.entryTurn.year === 1985 && st.entryTurn.period === 2) {
        event1985p2Aaa++;
      }
    }

    var sigDial = best ? (best.sig && best.sig.type ? best.sig.type : '') + '|' + (best.freq || '') : '';

    var eco = ecologyBlock(G);

    var row = {
      mode: mode,
      label: label,
      marketId: marketId,
      year: bookY,
      simYear: G.year,
      simPeriod: G.period,
      run: run,
      seed: seed,
      aaaStationCount: nAaa,
      aaaAiReformatCount: aiReformatToAaa,
      aaaEvent1985p2SpawnCount: event1985p2Aaa,
      bestAaaCall: best ? best.callLetters : '',
      bestAaaShare: share,
      bestAaaRank: rank,
      bestAaaAqh: aqh,
      bestAaaRev: rev,
      bestAaaEbitda: ebitda,
      bestAaaTop15: rank != null && rank <= 15 ? 1 : 0,
      bestAaaTop10: rank != null && rank <= 10 ? 1 : 0,
      bestAaaTop5: rank != null && rank <= 5 ? 1 : 0,
      bestAaaTop3: rank != null && rank <= 3 ? 1 : 0,
      bestAaaNum1: rank === 1 ? 1 : 0,
      bestAaaSigDial: sigDial,
      bestAaaAiReason: best && best._aiLastMajorReason != null ? String(best._aiLastMajorReason) : '',
      aaaEraLift: eraLift,
      aaaMarketPlausibility01: plaus,
      eduIndex: edu,
      rankTier: tier,
      archetypeId: arch,
      region: region,
    };
    var ek;
    for (ek in eco) {
      if (Object.prototype.hasOwnProperty.call(eco, ek)) row[ek] = eco[ek];
    }
    return row;
  }

  /**
   * opts: { marketId, seed, targetYear, run, mode, maxAdvance }
   */
  window.__aaaHarness_snapshotRun = function (opts) {
    opts = opts || {};
    var marketId = opts.marketId || 'seattle';
    var seed = opts.seed != null ? opts.seed : 424242;
    var targetYear = opts.targetYear != null ? opts.targetYear : 2005;
    var run = opts.run != null ? opts.run : 0;
    var mode = opts.mode || 'snapshot';
    var maxAdvance = opts.maxAdvance != null ? opts.maxAdvance : 6000;

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
        return { ok: false, error: adv.error, at: adv.at, steps: adv.steps, marketId: marketId, seed: seed, run: run, mode: mode };
      }
      /* advanceGToYearPeriod(Y,2) stops at calendar start of fall Y (chkEv for fall not run yet). */
      advTurn();
      var row = snapshotMetrics(G, marketId, targetYear + '-fall-closed', run, seed, mode, targetYear);
      row.advanceSteps = adv.steps + 1;
      row.ok = true;
      return row;
    } finally {
      ui.restore();
      Math.random = origR;
    }
  };

  /**
   * Continuous sim from 1985 genMarketMP to fall of each checkpoint year (same RNG stream).
   * opts: { marketId, seed, checkpoints, run, maxAdvance }
   */
  window.__aaaHarness_careerRun = function (opts) {
    opts = opts || {};
    var marketId = opts.marketId || 'seattle';
    var seed = opts.seed != null ? opts.seed : 424242;
    var checkpoints = opts.checkpoints || [1985, 1995, 2005, 2026];
    var run = opts.run != null ? opts.run : 0;
    var maxAdvance = opts.maxAdvance != null ? opts.maxAdvance : 12000;

    var origR = Math.random;
    var rng = seed;
    Math.random = function () {
      rng = (rng * 9301 + 49297) % 233280;
      return rng / 233280;
    };
    var ui = typeof window._harnessPatchTimersAndUi === 'function' ? window._harnessPatchTimersAndUi() : { restore: function () {} };
    var rows = [];
    try {
      ACTIVE_MARKET = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      G = genMarketMP('1985');
      MP.mode = 'solo';
      MP.isHost = false;
      if (MP.players) MP.players = [];

      var ci, y, adv, row;
      for (ci = 0; ci < checkpoints.length; ci++) {
        y = checkpoints[ci];
        adv = advanceGToYearPeriod(y, 2, maxAdvance);
        if (!adv.ok) {
          return { ok: false, error: adv.error, at: adv.at, steps: adv.steps, marketId: marketId, seed: seed, run: run, partialRows: rows };
        }
        advTurn();
        row = snapshotMetrics(G, marketId, 'career-' + y + '-fall-closed', run, seed, 'career', y);
        row.advanceSteps = adv.steps + 1;
        row.checkpointYear = y;
        rows.push(row);
      }
      return { ok: true, marketId: marketId, seed: seed, run: run, rows: rows };
    } finally {
      ui.restore();
      Math.random = origR;
    }
  };
})();
`;
  vm.runInContext(code, ctx);
}

function parseArgs(argv) {
  const envM = process.env.AAA_HARNESS_MARKETS;
  let runs = 1;
  let mode = 'snapshot';
  const markets = [];
  let csvPath = defaultCsvPath;
  for (const a of argv) {
    if (a.startsWith('--runs=')) runs = Math.max(1, parseInt(a.slice('--runs='.length), 10) || 1);
    else if (a.startsWith('--mode=')) mode = (a.slice('--mode='.length) || 'snapshot').trim();
    else if (a.startsWith('--markets=')) {
      markets.push(...a.slice('--markets='.length).split(',').map((x) => x.trim()).filter(Boolean));
    } else if (a.startsWith('--csv=')) csvPath = a.slice('--csv='.length).trim() || defaultCsvPath;
  }
  if (envM && !argv.some((x) => x.startsWith('--markets='))) {
    markets.push(...envM.split(',').map((x) => x.trim()).filter(Boolean));
  }
  const useMarkets = markets.length ? markets : DEFAULT_MARKETS;
  if (!['snapshot', 'career', 'both'].includes(mode)) mode = 'snapshot';
  return { runs, mode, markets: useMarkets, csvPath };
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function rowToCsvLine(obj, keys) {
  return keys.map((k) => csvEscape(obj[k])).join(',');
}

function buildRecommendation(aggregate) {
  const recs = [];
  const { byEra, lowPlausDom, wichitaStrong1985, top1Rate1985, top5Rate2005, zeroAaaRate2005, aiPickRate, crowdedRock } = aggregate;

  if (top1Rate1985 > 0.08) recs.push('AAA too strong (frequent #1 in 1985)');
  if (wichitaStrong1985) recs.push('AAA too strong or mis-targeted (Wichita hot in 1985)');
  if (lowPlausDom) recs.push('AI choosing or sustaining AAA in low-plausibility markets disproportionately');

  if (zeroAaaRate2005 > 0.55) recs.push('AAA too weak (missing in most 2005 snapshots)');
  if (byEra[2005] && byEra[2005].meanBestShare < 0.012) recs.push('AAA too weak (mean best share tiny by 2005)');

  if (top5Rate2005 > 0.35) recs.push('AAA too strong (top-5 routine in 2005)');
  if (crowdedRock > 0.65) recs.push('ecology lane too crowded (rock/AC formats all high-max-share together)');

  if (aiPickRate < 0.02 && byEra[2026] && byEra[2026].meanCount < 0.5) recs.push('AI not choosing it (no reformats; sparse AAA stations by 2026)');

  if (!recs.length) return 'looks plausible';
  return recs.join(' | ');
}

function main() {
  const quiet = process.env.VALIDATION_QUIET !== '0';
  const { runs, mode, markets, csvPath } = parseArgs(process.argv.slice(2));
  const ctx = createVmContext(quiet);
  loadSim(ctx);
  installHarnessRunner(ctx);

  const snapshotFn = vm.runInContext('__aaaHarness_snapshotRun', ctx);
  const careerFn = vm.runInContext('__aaaHarness_careerRun', ctx);

  const csvRows = [];
  const flatKeys = new Set();

  const pushRow = (r) => {
    Object.keys(r).forEach((k) => flatKeys.add(k));
    csvRows.push(r);
  };

  let snapOk = 0;
  let snapFail = 0;

  for (let run = 0; run < runs; run++) {
    const seed = 900000 + run * 171717;
    for (const marketId of markets) {
      if (mode === 'snapshot' || mode === 'both') {
        for (const y of DEFAULT_YEARS) {
          const r = snapshotFn({ marketId, seed, targetYear: y, run, mode: 'snapshot', maxAdvance: 8000 });
          if (!r.ok) {
            snapFail++;
            pushRow({
              mode: 'snapshot',
              marketId,
              year: y,
              run,
              seed,
              ok: 0,
              error: r.error || 'unknown',
            });
          } else {
            snapOk++;
            pushRow(r);
          }
        }
      }
      if (mode === 'career' || mode === 'both') {
        const cr = careerFn({
          marketId,
          seed,
          checkpoints: CAREER_CHECKPOINTS,
          run,
          maxAdvance: 14000,
        });
        if (!cr.ok) {
          pushRow({
            mode: 'career',
            marketId,
            run,
            seed,
            ok: 0,
            error: cr.error || 'career_failed',
          });
        } else {
          for (const row of cr.rows) pushRow(row);
        }
      }
    }
  }

  const keys = Array.from(flatKeys).sort((a, b) => a.localeCompare(b));
  const header = keys.join(',');
  const lines = [header, ...csvRows.map((r) => rowToCsvLine(r, keys))];
  mkdirSync(path.dirname(csvPath), { recursive: true });
  writeFileSync(csvPath, lines.join('\n'), 'utf8');

  // --- Aggregate for console + recommendation ---
  const snapRows = csvRows.filter((r) => r.mode === 'snapshot' && r.ok !== 0 && r.error == null);
  const byEra = {};
  for (const r of snapRows) {
    const y = r.year;
    if (!byEra[y]) byEra[y] = { n: 0, sumCount: 0, sumBestShare: 0, sumTop5: 0, sumNum1: 0, sumPlaus: 0, sumAiRef: 0 };
    const t = byEra[y];
    t.n++;
    t.sumCount += r.aaaStationCount || 0;
    t.sumBestShare += r.bestAaaShare != null ? r.bestAaaShare : 0;
    t.sumTop5 += r.bestAaaTop5 || 0;
    t.sumNum1 += r.bestAaaNum1 || 0;
    t.sumPlaus += r.aaaMarketPlausibility01 != null ? r.aaaMarketPlausibility01 : 0;
    t.sumAiRef += r.aaaAiReformatCount || 0;
  }
  for (const y of Object.keys(byEra)) {
    const t = byEra[y];
    t.meanCount = t.n ? t.sumCount / t.n : 0;
    t.meanBestShare = t.n ? t.sumBestShare / t.n : 0;
    t.top5Rate = t.n ? t.sumTop5 / t.n : 0;
    t.num1Rate = t.n ? t.sumNum1 / t.n : 0;
    t.meanPlaus = t.n ? t.sumPlaus / t.n : 0;
    t.meanAiReformat = t.n ? t.sumAiRef / t.n : 0;
  }

  const y1985 = snapRows.filter((r) => r.year === 1985);
  const top1Rate1985 = y1985.length ? y1985.reduce((a, r) => a + (r.bestAaaNum1 || 0), 0) / y1985.length : 0;
  const wichita1985 = y1985.filter((r) => r.marketId === 'wichita');
  const wichitaStrong1985 =
    wichita1985.length &&
    wichita1985.some((r) => (r.bestAaaShare || 0) > 0.07 || (r.bestAaaRank || 99) <= 3);

  const y2005 = snapRows.filter((r) => r.year === 2005);
  const zeroAaaRate2005 = y2005.length ? y2005.filter((r) => !r.aaaStationCount).length / y2005.length : 0;
  const top5Rate2005 = y2005.length ? y2005.reduce((a, r) => a + (r.bestAaaTop5 || 0), 0) / y2005.length : 0;

  let lowPlausDom = false;
  const lowPl = snapRows.filter((r) => (r.aaaMarketPlausibility01 || 0) < 0.42);
  const hiPl = snapRows.filter((r) => (r.aaaMarketPlausibility01 || 0) >= 0.52);
  if (lowPl.length && hiPl.length) {
    const a = lowPl.filter((r) => r.year >= 1995 && (r.bestAaaShare || 0) > 0.045).length / lowPl.length;
    const b = hiPl.filter((r) => r.year >= 1995 && (r.bestAaaShare || 0) > 0.045).length / hiPl.length;
    if (a > b + 0.12) lowPlausDom = true;
  }

  const aiPickRate = snapRows.length ? snapRows.reduce((a, r) => a + (r.aaaAiReformatCount > 0 ? 1 : 0), 0) / snapRows.length : 0;

  let crowdedRock = 0;
  let crowdedN = 0;
  for (const r of snapRows) {
    if (r.year < 1990) continue;
    crowdedN++;
    const keysRock = ['eco_CLASSIC_ROCK_maxShare', 'eco_ALT_ROCK_maxShare', 'eco_ADULT_CONTEMP_maxShare', 'eco_HOT_AC_maxShare'];
    const hi = keysRock.filter((k) => (r[k] || 0) > 0.12).length;
    if (hi >= 3 && (r.eco_AAA_maxShare || 0) > 0.08) crowdedRock++;
  }
  const crowdedRockRate = crowdedN ? crowdedRock / crowdedN : 0;

  const recommendation = buildRecommendation({
    byEra,
    lowPlausDom,
    wichitaStrong1985,
    top1Rate1985,
    top5Rate2005,
    zeroAaaRate2005,
    aiPickRate,
    crowdedRock: crowdedRockRate,
  });

  console.log('=== AAA format validation harness ===');
  console.log('Markets:', markets.join(', '));
  console.log('Years:', DEFAULT_YEARS.join(', '));
  console.log('Runs:', runs, 'Mode:', mode);
  console.log('CSV:', csvPath);
  console.log('Snapshot OK:', snapOk, 'fail:', snapFail);
  console.log('');
  console.log('--- Per-era snapshot aggregates (mean over market×run cells) ---');
  for (const y of DEFAULT_YEARS) {
    const t = byEra[y];
    if (!t || !t.n) {
      console.log(y + ': (no data)');
      continue;
    }
    console.log(
      `${y}: AAA stations/cell=${t.meanCount.toFixed(2)} | best AAA share≈${(t.meanBestShare * 100).toFixed(2)}% | top5%=${(t.top5Rate * 100).toFixed(0)}% | #1%=${(t.num1Rate * 100).toFixed(0)}% | mean plaus=${t.meanPlaus.toFixed(3)} | mean AI→AAA reformats/cell=${t.meanAiReformat.toFixed(2)}`
    );
  }

  console.log('');
  console.log('--- Era expectation notes (heuristic vs captured data) ---');
  console.log(
    '1985: expect rare/weak — #1 rate=' + (top1Rate1985 * 100).toFixed(1) + '% Wichita strong(>7%sh or top3)=' + (wichitaStrong1985 ? 'YES' : 'no')
  );
  console.log('1995: expect viable not universal — mean AAA count ' + (byEra[1995] ? byEra[1995].meanCount.toFixed(2) : 'n/a'));
  console.log(
    '2005: expect competitive — top5 rate ' + (top5Rate2005 * 100).toFixed(0) + '% | zero AAA rate ' + (zeroAaaRate2005 * 100).toFixed(0) + '%'
  );
  console.log('2026: niche survival — mean best share ' + (byEra[2026] ? (byEra[2026].meanBestShare * 100).toFixed(2) : 'n/a') + '%');
  console.log('Ecology: share of post-1990 cells with crowded rock/AC+AAA=' + (crowdedRockRate * 100).toFixed(0) + '%');
  console.log('');
  console.log('Recommendation:', recommendation);
  console.log('');
  console.log('validate-aaa-format: done');

  // Static sanity (fast fail if registry broken)
  const FM = vm.runInContext('FM', ctx);
  if (!FM.AAA || FM.AAA.unlock !== 1985) {
    console.error('FM.AAA registry check failed');
    process.exit(1);
  }
}

main();
