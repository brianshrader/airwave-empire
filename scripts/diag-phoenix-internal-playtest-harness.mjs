#!/usr/bin/env node
/**
 * Phoenix internal-playtest harness — DIAG_ONLY market coherence gate (read-only).
 *
 *   npm run diag:phoenix-internal-playtest
 *   npm run diag:phoenix-internal-playtest -- --runs=8
 *
 * @see tmp/phoenix_rock_decomposition.json
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  aggregateFmtSumToFamilyShares,
  familyForFormat,
  FAMILY_DISPLAY_ORDER,
  loadFormatFamiliesCatalog,
} from './formatFamilyHelpers.mjs';
import {
  aggregateMeansToLeadershipBuckets,
  LEADERSHIP_BUCKET_KEYS,
} from './expectedFormatLeadershipProfile.mjs';
import { TRUTH_AUDIT_SPANISH_BOOK_SNIPPET } from './spanishSubtypeHelpers.mjs';
import {
  enrichSpanishSubtypeOnRows,
  formatSpanishSubtypeBlock,
  meanSpanishSubtypeAcrossRuns,
} from './spanishSubtypeDiagnostics.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS, DIAG_ONLY_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'phoenix_internal_playtest_harness.json');

const PHOENIX = 'phoenix';
const CONTROL_MARKETS = ['losangeles', 'atlanta', 'seattle', 'wichita'];
const BENCHMARK_YEARS = [1975, 1985, 1995, 2005, 2026];
const ROCK_FMTS = new Set(['CLASSIC_ROCK', 'ALBUM_ROCK', 'ALT_ROCK', 'AAA', 'CLASSIC_HITS', 'OLDIES']);

const MAX_STEPS_BY_YEAR = {
  1975: 340,
  1985: 260,
  1995: 320,
  2005: 320,
  2026: 320,
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
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
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

function loadCtx() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  const src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: 12, seed: 20260521 };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || 12);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
  }
  return o;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function familyIdToDisplayShare(familyShares) {
  const out = {};
  for (const fid of FAMILY_DISPLAY_ORDER) {
    const sh = familyShares?.[fid];
    if (sh != null && sh > 0) out[fid] = sh;
  }
  return out;
}

function histStrFromRuns(runs, key) {
  const hist = {};
  for (const r of runs) {
    const k = r[key] || '?';
    hist[k] = (hist[k] || 0) + 1;
  }
  return Object.keys(hist)
    .sort((a, b) => hist[b] - hist[a])
    .map((k) => `${k}:${hist[k]}`)
    .join('|');
}

function topFormatsFromRuns(runs, n = 10) {
  const sum = {};
  let count = 0;
  for (const r of runs) {
    if (!r.ok) continue;
    count++;
    for (const [fmt, sh] of Object.entries(r.fmtSum || {})) {
      sum[fmt] = (sum[fmt] || 0) + sh;
    }
  }
  if (!count) return [];
  return Object.entries(sum)
    .map(([fmt, total]) => ({ fmt, share: total / count }))
    .sort((a, b) => b.share - a.share)
    .slice(0, n);
}

function summarizeMarketYear(runs, marketId, year) {
  const list = runs.filter((r) => r.ok && r.marketId === marketId && r.year === year);
  if (!list.length) return null;

  const fmtRuns = list.map((r) => r.fmtSum);
  const familyRuns = fmtRuns.map((fs) => aggregateFmtSumToFamilyShares(fs).familyShares);
  const bucketRuns = fmtRuns.map((fs) => {
    const agg = Object.entries(fs).map(([k, m]) => ({ k, m }));
    return aggregateMeansToLeadershipBuckets(agg).buckets;
  });

  const meanFamily = {};
  for (const fid of FAMILY_DISPLAY_ORDER) {
    meanFamily[fid] = mean(familyRuns.map((fr) => fr[fid] ?? 0));
  }

  const meanBuckets = {};
  for (const k of LEADERSHIP_BUCKET_KEYS) {
    meanBuckets[k] = mean(bucketRuns.map((b) => b[k] ?? 0));
  }

  const rockFmtShare = mean(
    list.map((r) =>
      Object.entries(r.fmtSum || {}).reduce((s, [fmt, sh]) => s + (ROCK_FMTS.has(fmt) ? sh : 0), 0),
    ),
  );

  return {
    nRuns: list.length,
    stationCount: mean(list.map((r) => r.stationCount)),
    hhi: mean(list.map((r) => r.hhi)),
    leaderGap12: mean(list.map((r) => r.leaderGap12)),
    topFormats: topFormatsFromRuns(list, 10),
    familyShares: meanFamily,
    familySharesDisplay: familyIdToDisplayShare(meanFamily),
    leadershipBuckets: meanBuckets,
    leaderFmtHist: histStrFromRuns(list, 'leaderFmtKey'),
    leaderFamilyHist: histStrFromRuns(list, 'leaderFamilyId'),
    spanishShare: meanBuckets.SPANISH ?? 0,
    spanishStations:
      mean(list.map((r) => r.spanishStationCount)) ||
      meanSpanishSubtypeAcrossRuns(list)?.meanTotalSpanishStations ||
      0,
    classicRockShare: mean(list.map((r) => r.fmtSum?.CLASSIC_ROCK ?? 0)),
    rockFamilyShare: meanFamily.ROCK ?? rockFmtShare ?? 0,
    countryShare: meanBuckets.COUNTRY ?? 0,
    chrShare: meanBuckets.TOP40_CHR ?? 0,
    acHotAcShare: meanBuckets.AC_HOT_AC ?? 0,
    publicShare: meanBuckets.PUBLIC_RADIO ?? 0,
    urbanShare: meanBuckets.URBAN_RHYTHMIC ?? 0,
    spanishSubtype: meanSpanishSubtypeAcrossRuns(list),
    crWins: list.filter((r) => r.leaderFmtKey === 'CLASSIC_ROCK').length / list.length,
    spanishFamilyWins: list.filter((r) => r.leaderFamilyId === 'SPANISH').length / list.length,
  };
}

function check(level, code, message, detail = {}) {
  return { level, code, message, detail };
}

function evaluatePhoenixChecks(byYear, runs) {
  const checks = [];
  const y26 = byYear[2026];
  const y05 = byYear[2005];
  const y95 = byYear[1995];

  if (!y26) {
    checks.push(check('fail', 'no_data_2026', 'No successful Phoenix runs @2026'));
    return checks;
  }

  const span26 = y26.spanishShare;
  if (span26 >= 0.18 && span26 <= 0.28) {
    checks.push(check('pass', 'spanish_2026_band', `Spanish ${pct(span26)} in 18–28% band`));
  } else if (span26 >= 0.14 && span26 < 0.18) {
    checks.push(check('warn', 'spanish_2026_low', `Spanish ${pct(span26)} below 18% target`));
  } else if (span26 > 0.28 && span26 <= 0.32) {
    checks.push(check('warn', 'spanish_2026_high', `Spanish ${pct(span26)} above 28% target`));
  } else {
    checks.push(check('fail', 'spanish_2026_oob', `Spanish ${pct(span26)} outside acceptable band`));
  }

  const sub = y26.spanishSubtype;
  const rmSharePct = sub?.meanSubtypeSharePct?.REGIONAL_MEXICAN ?? 0;
  const rmShare = rmSharePct > 1 ? rmSharePct / 100 : rmSharePct;
  const rmLead = (sub?.leadershipWinsBySubtype?.REGIONAL_MEXICAN ?? 0) / Math.max(1, y26.nRuns);
  if (rmShare >= 0.5 && rmLead >= 0.5) {
    checks.push(
      check('pass', 'rm_dominant_2026', `Regional Mexican ${pct(rmShare)} mass, ${(rmLead * 100).toFixed(0)}% run leadership`),
    );
  } else {
    checks.push(check('warn', 'rm_dominant_2026', `Regional Mexican mass ${pct(rmShare)} — review subtype mix`));
  }

  const rock26 = y26.rockFamilyShare;
  if (rock26 <= 0.18) {
    checks.push(check('pass', 'rock_2026_ideal', `Rock family ${pct(rock26)} ≤18%`));
  } else if (rock26 <= 0.25) {
    checks.push(check('warn', 'rock_2026_elevated', `Rock family ${pct(rock26)} above 18% warn threshold`));
  } else {
    checks.push(check('fail', 'rock_2026_high', `Rock family ${pct(rock26)} above 25% fail threshold`));
  }

  const bandIn = (v, lo, hi, code, label) => {
    if (v >= lo && v <= hi) checks.push(check('pass', code, `${label} ${pct(v)} in ${pct(lo)}–${pct(hi)}`));
    else if (v >= lo * 0.75 && v <= hi * 1.35) {
      checks.push(check('warn', `${code}_warn`, `${label} ${pct(v)} near band`));
    } else checks.push(check('fail', `${code}_fail`, `${label} ${pct(v)} outside band`));
  };

  bandIn(y26.countryShare, 0.06, 0.14, 'country_2026', 'Country');
  bandIn(y26.chrShare, 0.06, 0.14, 'chr_2026', 'CHR');
  bandIn(y26.publicShare, 0.02, 0.07, 'public_2026', 'Public');
  bandIn(y26.urbanShare, 0.03, 0.1, 'urban_2026', 'Urban');

  if (y26.crWins <= 0.25) {
    checks.push(check('pass', 'cr_not_dominant_2026', `CLASSIC_ROCK #1 in ${(y26.crWins * 100).toFixed(0)}% of runs`));
  } else if (y26.crWins <= 0.5) {
    checks.push(check('warn', 'cr_leader_2026', `CLASSIC_ROCK #1 in ${(y26.crWins * 100).toFixed(0)}% of runs`));
  } else {
    checks.push(check('fail', 'cr_leader_2026', `CLASSIC_ROCK #1 in ${(y26.crWins * 100).toFixed(0)}% of runs`));
  }

  if (y26.spanishFamilyWins >= 0.67) {
    checks.push(
      check('pass', 'spanish_family_leader_2026', `SPANISH #1 family ${(y26.spanishFamilyWins * 100).toFixed(0)}% of runs`),
    );
  } else if (y26.spanishFamilyWins >= 0.5) {
    checks.push(
      check('warn', 'spanish_family_leader_2026', `SPANISH #1 family ${(y26.spanishFamilyWins * 100).toFixed(0)}% of runs`),
    );
  } else {
    checks.push(
      check('fail', 'spanish_family_leader_2026', `SPANISH #1 family only ${(y26.spanishFamilyWins * 100).toFixed(0)}% of runs`),
    );
  }

  if (y95) {
    if (y95.spanishShare >= 0.05) {
      checks.push(check('pass', 'spanish_1995_emerge', `Spanish ${pct(y95.spanishShare)} @1995`));
    } else if (y95.spanishShare >= 0.02) {
      checks.push(check('warn', 'spanish_1995_thin', `Spanish ${pct(y95.spanishShare)} thin @1995`));
    } else {
      checks.push(check('fail', 'spanish_1995_missing', `Spanish ${pct(y95.spanishShare)} @1995`));
    }
  }

  if (y05) {
    if (y05.spanishShare >= 0.12) {
      checks.push(check('pass', 'spanish_2005_serious', `Spanish ${pct(y05.spanishShare)} @2005`));
    } else if (y05.spanishShare >= 0.08) {
      checks.push(check('warn', 'spanish_2005_moderate', `Spanish ${pct(y05.spanishShare)} @2005`));
    } else {
      checks.push(check('fail', 'spanish_2005_weak', `Spanish ${pct(y05.spanishShare)} @2005`));
    }
  }

  if (y95 && y26 && y26.rockFamilyShare < y95.rockFamilyShare - 0.02) {
    checks.push(
      check(
        'pass',
        'rock_decline_arc',
        `Rock ${pct(y95.rockFamilyShare)} @1995 → ${pct(y26.rockFamilyShare)} @2026`,
      ),
    );
  } else if (y95 && y26) {
    checks.push(
      check('warn', 'rock_decline_arc', `Rock did not decline 1995→2026 (${pct(y95.rockFamilyShare)} → ${pct(y26.rockFamilyShare)})`),
    );
  }

  if (y26.chrShare >= 0.06 && y26.chrShare <= 0.2) {
    checks.push(check('pass', 'chr_present_2026', `CHR ${pct(y26.chrShare)} present, not dominant`));
  } else if (y26.chrShare > 0.2) {
    checks.push(check('warn', 'chr_high_2026', `CHR ${pct(y26.chrShare)} elevated @2026`));
  }

  const failN = runs.filter((r) => !r.ok && r.marketId === PHOENIX).length;
  if (failN === 0) checks.push(check('pass', 'sim_stability', 'All Phoenix sim runs completed'));
  else checks.push(check('fail', 'sim_stability', `${failN} Phoenix sim failures`));

  return checks;
}

function overallVerdict(checks) {
  const fail = checks.filter((c) => c.level === 'fail').length;
  const warn = checks.filter((c) => c.level === 'warn').length;
  if (fail > 0) return { status: 'fail', fail, warn };
  if (warn > 0) return { status: 'warn', fail, warn };
  return { status: 'pass', fail, warn };
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function sortBook(stations){
    var list=stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    return list;
  }
  function sampleOne(marketId, year, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      if(year<=1975){
        var sc=SC.find(function(x){return x.id==='under';});
        var oi=sc.idx; sc.idx=[];
        G=genMarket('under');
        sc.idx=oi;
      } else {
        var sc2=SC.find(function(x){return x.id==='chrwar';});
        var oi2=sc2.idx; sc2.idx=[];
        G=genMarket('chrwar');
        sc2.idx=oi2;
      }
      G.stations.forEach(function(st){st.isPlayer=false;});
      G.ps=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===year&&G.period===1)break;
        if(G.year>year||(G.year===year&&G.period>1)) return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==year||G.period!==1) return {ok:false,err:'miss'};
      var book=sortBook(G.stations);
      var fmtSum={}, hhi=0;
      for(var j=0;j<book.length;j++){
        var sh=book[j].rat.share||0;
        var fk=fmtKey(book[j].format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        hhi+=sh*sh;
      }
      var lead=book[0]||null;
      var second=book[1]||null;
      var leadSh=lead?(lead.rat.share||0):0;
      var secondSh=second?(second.rat.share||0):0;
      var spanN=0;
      ${TRUTH_AUDIT_SPANISH_BOOK_SNIPPET}
      return {
        ok:true,
        fmtSum:fmtSum,
        hhi:hhi*10000,
        stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length,
        leaderFmtKey:lead?fmtKey(lead.format):'',
        leaderShare:leadSh,
        leaderGap12:leadSh-secondSh,
        spanishStationCount:spanishBookStations.length,
        spanishBookStations:spanishBookStations
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { sampleOne: sampleOne };
})();
`;

function main() {
  loadFormatFamiliesCatalog();
  const opts = parseArgs(process.argv.slice(2));
  console.log('Phoenix internal-playtest harness (DIAG_ONLY)\n');
  console.log(`Years: ${BENCHMARK_YEARS.join(', ')} | runs: ${opts.runs} | seed: ${opts.seed}\n`);

  const ctx = loadCtx();
  const MARKETS = vm.runInContext('typeof MARKETS!=="undefined"?MARKETS:{}', ctx);
  const playable = vm.runInContext(
    'typeof ALL_PLAYABLE_MARKET_IDS!=="undefined"?ALL_PLAYABLE_MARKET_IDS:[]',
    ctx,
  );

  const phoenixDiagOnly =
    !playable.includes(PHOENIX) && DIAG_ONLY_MARKET_IDS.includes(PHOENIX) && !!MARKETS[PHOENIX];
  console.log(`Phoenix in ALL_PLAYABLE_MARKET_IDS: ${playable.includes(PHOENIX) ? 'YES (unexpected)' : 'no'}`);
  console.log(`Phoenix in DIAG_ONLY_MARKET_IDS: ${DIAG_ONLY_MARKET_IDS.includes(PHOENIX) ? 'yes' : 'no'}`);
  console.log(`MARKETS.phoenix row present: ${MARKETS[PHOENIX] ? 'yes' : 'no'}\n`);

  const api = vm.runInContext(RUN_IIFE, ctx);
  const markets = [PHOENIX, ...CONTROL_MARKETS];
  const rows = [];
  const origR = Math.random;

  for (const marketId of markets) {
    for (const year of BENCHMARK_YEARS) {
      const maxSteps = MAX_STEPS_BY_YEAR[year] ?? 320;
      for (let run = 0; run < opts.runs; run++) {
        const s0 = opts.seed + marketSalt(marketId) * 17 + year * 10007 + run * 9973;
        let r;
        try {
          r = api.sampleOne(marketId, year, s0, maxSteps);
        } catch (e) {
          r = { ok: false, err: String(e?.message || e) };
        } finally {
          Math.random = origR;
        }
        const row = { marketId, year, run, ...r };
        if (row.ok && row.leaderFmtKey) {
          row.leaderFamilyId = familyForFormat(row.leaderFmtKey) || 'OTHER';
        }
        rows.push(row);
      }
    }
  }

  enrichSpanishSubtypeOnRows(
    rows.filter((r) => r.ok && r.marketId === PHOENIX),
    ctx,
    { phoenix: MARKETS[PHOENIX] },
  );

  const phoenixByYear = {};
  for (const year of BENCHMARK_YEARS) {
    phoenixByYear[year] = summarizeMarketYear(rows, PHOENIX, year);
  }

  const controlsByYear = {};
  for (const mid of CONTROL_MARKETS) {
    controlsByYear[mid] = {};
    for (const year of BENCHMARK_YEARS) {
      controlsByYear[mid][year] = summarizeMarketYear(rows, mid, year);
    }
  }

  console.log('═══ 1. Phoenix market identity by year ═══\n');
  for (const year of BENCHMARK_YEARS) {
    const s = phoenixByYear[year];
    if (!s) {
      console.log(`${year}: no data\n`);
      continue;
    }
    console.log(`--- ${year} (${s.nRuns} runs) ---`);
    console.log(`  Stations: ${s.stationCount?.toFixed(1)} | HHI: ${s.hhi?.toFixed(0)} | #1−#2 gap: ${(s.leaderGap12 * 100).toFixed(1)}pp`);
    console.log(`  #1 format: ${s.leaderFmtHist}`);
    console.log(`  #1 family: ${s.leaderFamilyHist}`);
    console.log('  Family shares:');
    const famEntries = Object.entries(s.familySharesDisplay || s.familyShares || {}).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [fam, sh] of famEntries) {
      if (sh >= 0.001) console.log(`    ${fam}: ${pct(sh)}`);
    }
    console.log('  Top formats:');
    for (const t of s.topFormats.slice(0, 10)) {
      console.log(`    ${t.fmt}: ${pct(t.share)}`);
    }
    console.log('');
  }

  console.log('═══ 2. Phoenix-specific metrics ═══\n');
  console.log('Year\tSpan\tSpanStn\tCR\tRockFam\tCtry\tCHR\tAC/HAC\tPub\tUrban');
  for (const year of BENCHMARK_YEARS) {
    const s = phoenixByYear[year];
    if (!s) continue;
    console.log(
      [
        year,
        pct(s.spanishShare),
        s.spanishStations?.toFixed(1),
        pct(s.classicRockShare),
        pct(s.rockFamilyShare),
        pct(s.countryShare),
        pct(s.chrShare),
        pct(s.acHotAcShare),
        pct(s.publicShare),
        pct(s.urbanShare),
      ].join('\t'),
    );
  }
  console.log('\nSpanish subtype @2026:');
  const sub26 = phoenixByYear[2026]?.spanishSubtype;
  if (sub26) console.log(formatSpanishSubtypeBlock(sub26, '  '));

  const checks = evaluatePhoenixChecks(phoenixByYear, rows);
  const verdict = overallVerdict(checks);

  console.log('\n═══ 3. Pass / warn / fail checklist ═══\n');
  for (const c of checks) {
    const tag = c.level.toUpperCase().padEnd(4);
    console.log(`  [${tag}] ${c.message}`);
  }
  console.log(`\nOverall: ${verdict.status.toUpperCase()} (${verdict.fail} fail, ${verdict.warn} warn)`);

  console.log('\n═══ 4. Control drift sanity @2026 (read-only) ═══\n');
  console.log('Market\tROCK\tSPANISH\t#1 family');
  for (const mid of CONTROL_MARKETS) {
    const c = controlsByYear[mid][2026];
    if (!c) continue;
    console.log([mid, pct(c.rockFamilyShare), pct(c.spanishShare), c.leaderFamilyHist].join('\t'));
  }

  const playtestReady = verdict.status !== 'fail' && phoenixDiagOnly;
  const publicReady = false;

  const artifact = {
    recordedAt: new Date().toISOString(),
    runs: opts.runs,
    seed: opts.seed,
    years: BENCHMARK_YEARS,
    diagOnly: {
      phoenixInPlayable: playable.includes(PHOENIX),
      phoenixInDiagOnly: DIAG_ONLY_MARKET_IDS.includes(PHOENIX),
      allPlayableMarketIds: [...playable],
      diagOnlyMarketIds: [...DIAG_ONLY_MARKET_IDS],
    },
    phoenixByYear,
    controlsByYear,
    checks,
    verdict,
    playtestReady,
    publicReady,
  };

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`\nWrote ${outJson}`);
  console.log(`\nInternal playtest ready: ${playtestReady ? 'YES' : 'NO'}`);
  console.log(`Public exposure ready: ${publicReady ? 'YES' : 'NO'} (remain DIAG_ONLY)`);
}

main();
