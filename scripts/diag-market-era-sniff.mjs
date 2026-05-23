#!/usr/bin/env node
/**
 * Early-era opening dial sniff — post-genMarket book only (read-only).
 *
 *   npm run diag:market-era-sniff
 *   npm run diag:market-era-sniff -- --market=phoenix --year=1970 --runs=100
 *   npm run diag:market-era-sniff -- --market=losangeles --year=1970 --runs=50
 *
 * Artifacts: tmp/market_era_sniff/<market>_<year>.json
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outDir = path.join(root, 'tmp', 'market_era_sniff');

const DEFAULT_MARKET = 'phoenix';
const DEFAULT_YEAR = 1970;
const DEFAULT_RUNS = 100;
const DEFAULT_SEED = 20260523;

const TRACKED_FORMATS = [
  'TOP40',
  'CHR',
  'HOT_AC',
  'ADULT_CONTEMP',
  'COUNTRY',
  'SOUL_RNB',
  'NEWS_TALK',
  'MOR',
];

const SPOKEN_FORMATS = new Set([
  'NEWS_TALK',
  'SPORTS_TALK',
  'PERSONALITY_TALK',
  'ALL_NEWS',
  'BROKERED_PROGRAMMING',
]);

const HITS_FORMATS = new Set(['TOP40', 'CHR']);

/** Diagnostic-only rubric (not gameplay). Phoenix 1970 is the reference case. */
const PHOENIX_1970_HEURISTICS = {
  hitsPresencePass: 0.7,
  hitsPresenceWarn: 0.4,
  morCombinedPass: 0.35,
  morCombinedWarn: 0.5,
  top2Pass: 0.45,
  top2Warn: 0.6,
  musicPass: 0.6,
  musicWarn: 0.5,
  hitLeaderRunnerUpPass: 0.5,
  hitLeaderRunnerUpWarn: 0.3,
};

const GENERIC_1970_HEURISTICS = {
  hitsPresencePass: 0.55,
  hitsPresenceWarn: 0.35,
  morCombinedPass: 0.42,
  morCombinedWarn: 0.55,
  top2Pass: 0.5,
  top2Warn: 0.65,
  musicPass: 0.55,
  musicWarn: 0.45,
  hitLeaderRunnerUpPass: 0.4,
  hitLeaderRunnerUpWarn: 0.25,
};

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
  const o = { market: DEFAULT_MARKET, year: DEFAULT_YEAR, runs: DEFAULT_RUNS, seed: DEFAULT_SEED };
  for (const a of argv) {
    if (a.startsWith('--market=')) o.market = a.slice(9).trim().toLowerCase();
    else if (a.startsWith('--year=')) o.year = parseInt(a.slice(7), 10) || DEFAULT_YEAR;
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
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

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  return percentile(s, 0.5);
}

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function heuristicsFor(marketId, year) {
  if (marketId === 'phoenix' && year === 1970) return PHOENIX_1970_HEURISTICS;
  if (year <= 1975) return GENERIC_1970_HEURISTICS;
  return null;
}

function overallVerdict(checks) {
  if (checks.some((c) => c.level === 'fail')) return 'fail';
  if (checks.some((c) => c.level === 'warn')) return 'warn';
  return 'pass';
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isPublicFmt(fmt){
    return String(fmt||'').indexOf('PUBLIC_')===0;
  }
  function isSpokenFmt(fmt){
    var f=fmtKey(fmt);
    return f==='NEWS_TALK'||f==='SPORTS_TALK'||f==='PERSONALITY_TALK'||f==='ALL_NEWS'||f==='BROKERED_PROGRAMMING';
  }
  function sortBook(stations){
    var list=stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    return list;
  }
  function resolveGenPlan(targetYear){
    var y=Math.round(Number(targetYear))||1970;
    if(y<=1975) return { scenId:'under', startYear:1970, needsSim:false };
    if(y<=1977) return { scenId:'fmrev', startYear:1978, needsSim:true };
    if(y===1978) return { scenId:'fmrev', startYear:1978, needsSim:false };
    if(y===1979) return { scenId:'acrise', startYear:1978, needsSim:true };
    var chr=SC.find(function(x){return x.id==='chrwar';});
    var chrStart=chr&&(chr.startYear!=null)?chr.startYear:1985;
    if(y>=1985) return { scenId:'chrwar', startYear:chrStart, needsSim:y>chrStart };
    return { scenId:'under', startYear:1970, needsSim:y>1970 };
  }
  function openingSniffOne(marketId, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var plan=resolveGenPlan(targetYear);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      var sc=SC.find(function(x){return x.id===plan.scenId;})||SC[0];
      var origIdx=sc.idx; sc.idx=[];
      G=genMarket(plan.scenId);
      sc.idx=origIdx;
      if(plan.needsSim){
        G.stations.forEach(function(st){st.isPlayer=false;});
        G.ps=[];
        var steps=0;
        while(steps<maxSteps){
          if(G.year===targetYear&&G.period===1)break;
          if(G.year>targetYear||(G.year===targetYear&&G.period>1)) return {ok:false,err:'overshoot'};
          var ui=window._harnessPatchTimersAndUi();
          try{ advTurn(); }finally{ ui.restore(); }
          steps++;
        }
        if(G.year!==targetYear||G.period!==1) return {ok:false,err:'miss'};
      }
      var book=sortBook(G.stations);
      var fmtSum={}, fmtPresent={};
      var commercialAm=0, commercialFm=0, nceCount=0;
      for(var k=0;k<G.stations.length;k++){
        var st=G.stations[k];
        if(!st||st._bpSlotDeferred) continue;
        var sig=st.sig||{};
        var pub=isPublicFmt(st.format);
        if(sig.type==='AM'){ if(!pub) commercialAm++; }
        else if(sig.type==='FM'){ if(pub) nceCount++; else commercialFm++; }
      }
      var spokenShare=0, musicShare=0, morShare=0, publicShare=0;
      for(var j=0;j<book.length;j++){
        var sh=book[j].rat.share||0;
        var fk=fmtKey(book[j].format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        fmtPresent[fk]=true;
        if(isSpokenFmt(fk)) spokenShare+=sh;
        else if(isPublicFmt(fk)) publicShare+=sh;
        else musicShare+=sh;
        if(fk==='MOR') morShare+=sh;
      }
      var lead=book[0]||null;
      var second=book[1]||null;
      var leadFmt=lead?fmtKey(lead.format):'';
      var secondFmt=second?fmtKey(second.format):'';
      var leadSh=lead?(lead.rat.share||0):0;
      var secondSh=second?(second.rat.share||0):0;
      var hitsPresent=!!(fmtPresent.TOP40||fmtPresent.CHR);
      var hitLeaderOrRunnerUp=(leadFmt==='TOP40'||leadFmt==='CHR'||secondFmt==='TOP40'||secondFmt==='CHR');
      return {
        ok:true,
        genScen:plan.scenId,
        genStartYear:plan.startYear,
        needsSim:plan.needsSim,
        gYear:G.year,
        gPeriod:G.period,
        fmtSum:fmtSum,
        fmtPresent:fmtPresent,
        leaderFmt:leadFmt,
        leaderShare:leadSh,
        secondFmt:secondFmt,
        secondShare:secondSh,
        top2Combined:leadSh+secondSh,
        morShare:morShare,
        musicShare:musicShare,
        spokenShare:spokenShare,
        publicShare:publicShare,
        hitsPresent:hitsPresent,
        hitLeaderOrRunnerUp:hitLeaderOrRunnerUp,
        commercialAm:commercialAm,
        commercialFm:commercialFm,
        nceCount:nceCount,
        stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { openingSniffOne: openingSniffOne, resolveGenPlan: resolveGenPlan };
})();
`;

function evaluateHeuristics(stats, h) {
  if (!h) {
    return [{ level: 'warn', code: 'no_heuristics', message: 'No era sniff rubric for this market/year (reporting metrics only)' }];
  }
  const checks = [];
  const add = (level, code, msg) => checks.push({ level, code, message: msg });

  if (stats.hitsPresenceRate >= h.hitsPresencePass) {
    add('pass', 'hits_present', `TOP40/CHR present in ${pct(stats.hitsPresenceRate)} of runs`);
  } else if (stats.hitsPresenceRate >= h.hitsPresenceWarn) {
    add('warn', 'hits_present', `TOP40/CHR present in ${pct(stats.hitsPresenceRate)} of runs (below ${pct(h.hitsPresencePass)} target)`);
  } else {
    add('fail', 'hits_present', `TOP40/CHR present in only ${pct(stats.hitsPresenceRate)} of runs`);
  }

  const morMed = stats.morShareMedian;
  if (morMed <= h.morCombinedPass) {
    add('pass', 'mor_share', `Median combined MOR share ${pct(morMed)}`);
  } else if (morMed <= h.morCombinedWarn) {
    add('warn', 'mor_share', `Median combined MOR share ${pct(morMed)} (elevated)`);
  } else {
    add('fail', 'mor_share', `Median combined MOR share ${pct(morMed)} > ${pct(h.morCombinedWarn)}`);
  }

  const top2Med = stats.top2Median;
  if (top2Med <= h.top2Pass) {
    add('pass', 'top2_conc', `Median top-2 concentration ${pct(top2Med)}`);
  } else if (top2Med <= h.top2Warn) {
    add('warn', 'top2_conc', `Median top-2 concentration ${pct(top2Med)}`);
  } else {
    add('fail', 'top2_conc', `Median top-2 concentration ${pct(top2Med)} > ${pct(h.top2Warn)}`);
  }

  const musicMed = stats.musicShareMedian;
  if (musicMed >= h.musicPass) {
    add('pass', 'music_share', `Median music share ${pct(musicMed)}`);
  } else if (musicMed >= h.musicWarn) {
    add('warn', 'music_share', `Median music share ${pct(musicMed)}`);
  } else {
    add('fail', 'music_share', `Median music share ${pct(musicMed)} below ${pct(h.musicWarn)}`);
  }

  if (stats.hitLeaderRunnerUpRate >= h.hitLeaderRunnerUpPass) {
    add('pass', 'hit_leader', `Hit-radio #1/#2 in ${pct(stats.hitLeaderRunnerUpRate)} of runs`);
  } else if (stats.hitLeaderRunnerUpRate >= h.hitLeaderRunnerUpWarn) {
    add('warn', 'hit_leader', `Hit-radio #1/#2 in ${pct(stats.hitLeaderRunnerUpRate)} of runs`);
  } else {
    add('fail', 'hit_leader', `Hit-radio #1/#2 in only ${pct(stats.hitLeaderRunnerUpRate)} of runs`);
  }

  return checks;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();

  const ctx = loadCtx();
  const MARKETS = vm.runInContext('typeof MARKETS!=="undefined"?MARKETS:{}', ctx);
  if (!MARKETS[opts.market]) {
    console.error(`Unknown market "${opts.market}" — no MARKETS row`);
    process.exitCode = 1;
    return;
  }

  const api = vm.runInContext(RUN_IIFE, ctx);
  const genPlan = api.resolveGenPlan(opts.market, opts.year);
  const maxSteps = MAX_STEPS_BY_YEAR[opts.year] ?? 320;

  const rows = [];
  const origR = Math.random;

  for (let run = 0; run < opts.runs; run++) {
    const s0 = opts.seed + marketSalt(opts.market) * 17 + opts.year * 10007 + run * 9973;
    let r;
    try {
      r = api.openingSniffOne(opts.market, opts.year, s0, maxSteps);
    } catch (e) {
      r = { ok: false, err: String(e?.message || e) };
    } finally {
      Math.random = origR;
    }
    rows.push({ run, ...r });
  }

  const okRows = rows.filter((r) => r.ok);
  const failRate = 1 - okRows.length / Math.max(1, rows.length);

  const fmtPresenceRates = {};
  for (const fmt of TRACKED_FORMATS) {
    const key = fmt === 'CHR' ? 'CHR' : fmt;
    const alt = fmt === 'TOP40' ? 'TOP40' : fmt;
    fmtPresenceRates[fmt] =
      okRows.filter((r) => r.fmtPresent?.[alt] || (fmt === 'TOP40' && r.fmtPresent?.CHR)).length /
      Math.max(1, okRows.length);
  }

  const leaderHist = {};
  for (const r of okRows) {
    const k = r.leaderFmt || '?';
    leaderHist[k] = (leaderHist[k] || 0) + 1;
  }

  const meanFmtShare = {};
  for (const fmt of TRACKED_FORMATS) {
    meanFmtShare[fmt] = mean(okRows.map((r) => r.fmtSum?.[fmt] ?? 0));
  }
  if (meanFmtShare.CHR != null && meanFmtShare.TOP40 != null) {
    meanFmtShare.TOP40 = (meanFmtShare.TOP40 || 0) + (meanFmtShare.CHR || 0);
  }

  const stats = {
    hitsPresenceRate:
      okRows.filter((r) => r.hitsPresent).length / Math.max(1, okRows.length),
    morShareMedian: median(okRows.map((r) => r.morShare)),
    top2Median: median(okRows.map((r) => r.top2Combined)),
    musicShareMedian: median(okRows.map((r) => r.musicShare)),
    spokenShareMedian: median(okRows.map((r) => r.spokenShare)),
    hitLeaderRunnerUpRate:
      okRows.filter((r) => r.hitLeaderOrRunnerUp).length / Math.max(1, okRows.length),
    leaderShareMedian: median(okRows.map((r) => r.leaderShare)),
    commercialAmMedian: median(okRows.map((r) => r.commercialAm)),
    commercialFmMedian: median(okRows.map((r) => r.commercialFm)),
    nceMedian: median(okRows.map((r) => r.nceCount)),
    stationCountMedian: median(okRows.map((r) => r.stationCount)),
  };

  const h = heuristicsFor(opts.market, opts.year);
  const checks = evaluateHeuristics(stats, h);
  if (failRate > 0.01) {
    checks.unshift({
      level: failRate > 0.05 ? 'fail' : 'warn',
      code: 'sim_failures',
      message: `${(failRate * 100).toFixed(1)}% opening gen failures`,
    });
  }
  const verdict = overallVerdict(checks);

  const label = MARKETS[opts.market]?.label || opts.market;
  console.log(`${label} ${opts.year} opening sniff`);
  console.log(`Runs: ${opts.runs} (ok: ${okRows.length}, fail: ${rows.length - okRows.length})`);
  console.log(`Gen: scenario=${genPlan.scenId} startYear=${genPlan.startYear} needsSim=${genPlan.needsSim}`);
  console.log('');
  console.log(`TOP40/CHR presence: ${pct(stats.hitsPresenceRate)}`);
  console.log(`Median MOR share: ${pct(stats.morShareMedian)}`);
  console.log(`Median top-2 concentration: ${pct(stats.top2Median)}`);
  console.log(`Median music share: ${pct(stats.musicShareMedian)}`);
  console.log(`Median spoken share: ${pct(stats.spokenShareMedian)}`);
  console.log(`Hit-radio #1/#2 rate: ${pct(stats.hitLeaderRunnerUpRate)}`);
  console.log('');
  console.log('Mean format shares (tracked):');
  for (const fmt of TRACKED_FORMATS) {
    if (fmt === 'CHR') continue;
    const sh = meanFmtShare[fmt];
    if (sh != null && sh > 0.001) console.log(`  ${fmt}: ${pct(sh)}`);
  }
  console.log('');
  console.log('#1 format histogram:');
  for (const [fmt, n] of Object.entries(leaderHist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${fmt}: ${n}`);
  }
  console.log('');
  console.log('Checks:');
  for (const c of checks) {
    console.log(`  [${c.level.toUpperCase()}] ${c.message}`);
  }
  console.log(`\nVERDICT: ${verdict.toUpperCase()}`);
  console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${opts.market}_${opts.year}.json`);
  const artifact = {
    recordedAt: new Date().toISOString(),
    marketId: opts.market,
    label,
    year: opts.year,
    runs: opts.runs,
    seed: opts.seed,
    timingMs: Date.now() - t0,
    genPlan,
    mode: genPlan.needsSim ? 'gen_then_sim' : 'gen_only',
    stats,
    formatPresenceRates: fmtPresenceRates,
    meanFormatShares: meanFmtShare,
    leaderFmtHistogram: leaderHist,
    checks,
    verdict,
    heuristics: h,
    sampleFailures: rows.filter((r) => !r.ok).slice(0, 8),
    sampleRuns: okRows.slice(0, 5).map((r) => ({
      run: r.run,
      leaderFmt: r.leaderFmt,
      leaderShare: r.leaderShare,
      secondFmt: r.secondFmt,
      secondShare: r.secondShare,
      morShare: r.morShare,
      hitsPresent: r.hitsPresent,
      fmtSum: r.fmtSum,
    })),
  };
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`\nWrote ${outPath}`);

  if (verdict === 'fail') process.exitCode = 1;
}

main();
