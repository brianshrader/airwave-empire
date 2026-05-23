#!/usr/bin/env node
/**
 * Phoenix 1970 Top 40 opening identity A/B — in-vm patches only (no gameplay ship).
 *
 *   node scripts/diag-phoenix-1970-top40-ab.mjs
 *   node scripts/diag-phoenix-1970-top40-ab.mjs --opening-runs=100 --regression-runs=25
 *
 * Artifacts: tmp/phoenix_1970_top40_ab.json
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
const outJson = path.join(root, 'tmp', 'phoenix_1970_top40_ab.json');

const VARIANTS = ['A', 'B', 'C', 'D', 'E'];
const OPENING_YEAR = 1970;
const PHOENIX = 'phoenix';
const SEED = 20260523;
const REGRESSION_YEARS = [1985, 1995, 2005, 2026];

const PHOENIX_BP_ANCHOR = `  phoenix:{
    0:{fmt:'MOR',str:'strong'},
    1:{fmt:'NEWS_TALK',str:'moderate'},
    10:{fmt:'ADULT_STANDARDS',str:'moderate'},
    15:{fmt:'ADULT_CONTEMP',str:'moderate'},
    16:{fmt:'ALBUM_ROCK',str:'moderate'},
    18:{fmt:'HOT_AC',str:'moderate'},
  },`;

const PHOENIX_BP_B = `  phoenix:{
    0:{fmt:'TOP40',str:'strong'},
    1:{fmt:'NEWS_TALK',str:'moderate'},
    10:{fmt:'ADULT_STANDARDS',str:'moderate'},
    15:{fmt:'ADULT_CONTEMP',str:'moderate'},
    16:{fmt:'ALBUM_ROCK',str:'moderate'},
    18:{fmt:'HOT_AC',str:'moderate'},
  },`;

const PHOENIX_BP_D = `  phoenix:{
    0:{fmt:'TOP40',str:'strong'},
    1:{fmt:'NEWS_TALK',str:'moderate'},
    4:{fmt:'MOR',str:'moderate'},
    10:{fmt:'ADULT_STANDARDS',str:'moderate'},
    15:{fmt:'ADULT_CONTEMP',str:'moderate'},
    16:{fmt:'ALBUM_ROCK',str:'moderate'},
    18:{fmt:'HOT_AC',str:'moderate'},
  },`;

const OPENING_SHAPE_ANCHOR = `    if(isPhoenixDiagMarket(marketId)){
      const pf=phoenixDiagOpeningOqMult(s);
      if(pf!==1)f*=pf;
    }`;

const OPENING_SHAPE_C = `    if(isPhoenixDiagMarket(marketId)){
      const py=(typeof G!=='undefined'&&G&&G.year!=null)?Math.round(Number(G.year)):1970;
      if(py>=1970&&py<=1978){
        if(typeof isHitsFormatLineage==='function'&&isHitsFormatLineage(s.format)){
          if(s.sig?.type==='AM')f*=1.14;
          else if(s.sig?.type==='FM')f*=1.08;
        }
        if(s.format==='MOR'&&s.sig?.type==='AM')f*=0.85;
      }
      const pf=phoenixDiagOpeningOqMult(s);
      if(pf!==1)f*=pf;
    }`;

const PHOENIX_1970_HEURISTICS = {
  hitsPresencePass: 0.7,
  hitsPresenceWarn: 0.4,
  morCombinedPass: 0.35,
  morCombinedWarn: 0.5,
  top2Pass: 0.45,
  top2Warn: 0.6,
  musicPass: 0.6,
  hitLeaderRunnerUpPass: 0.4,
  hitLeaderRunnerUpWarn: 0.3,
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

function patchLegacyForVariant(src, variant) {
  let out = injectHeadlessLaunchNewsGuard(src);
  const useC = variant === 'C' || variant === 'E';
  const useD = variant === 'D' || variant === 'E';
  const useB = variant === 'B';

  if (useD && out.includes(PHOENIX_BP_ANCHOR)) {
    out = out.replace(PHOENIX_BP_ANCHOR, PHOENIX_BP_D);
  } else if (useB && out.includes(PHOENIX_BP_ANCHOR)) {
    out = out.replace(PHOENIX_BP_ANCHOR, PHOENIX_BP_B);
  }
  if (useC && out.includes(OPENING_SHAPE_ANCHOR)) {
    out = out.replace(OPENING_SHAPE_ANCHOR, OPENING_SHAPE_C);
  }
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

function loadCtx(variant) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  const src = patchLegacyForVariant(readFileSync(legacyPath, 'utf8'), variant);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const idx = (s.length - 1) * 0.5;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function openingVerdict(stats) {
  const h = PHOENIX_1970_HEURISTICS;
  const fails = [];
  if (stats.hitsPresenceRate < h.hitsPresenceWarn) fails.push('hits');
  if (stats.morShareMedian > h.morCombinedWarn) fails.push('mor');
  if (stats.top2Median > h.top2Warn) fails.push('top2');
  if (stats.hitLeaderRunnerUpRate < h.hitLeaderRunnerUpWarn) fails.push('hit_leader');
  if (fails.length >= 2 || fails.includes('hits')) return 'FAIL';
  if (
    stats.hitsPresenceRate >= h.hitsPresencePass &&
    stats.morShareMedian <= h.morCombinedPass &&
    stats.top2Median <= h.top2Pass &&
    stats.hitLeaderRunnerUpRate >= h.hitLeaderRunnerUpPass
  ) {
    return 'PASS';
  }
  return 'WARN';
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isPublicFmt(fmt){ return String(fmt||'').indexOf('PUBLIC_')===0; }
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
  function genModeForYear(year){
    if(year<=1975) return {scenId:'under',needsSim:false};
    return {scenId:'chrwar',needsSim:true};
  }
  function openingSniffOne(marketId, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var plan=genModeForYear(targetYear);
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
      var morShare=0, musicShare=0, spokenShare=0;
      for(var j=0;j<book.length;j++){
        var sh=book[j].rat.share||0;
        var fk=fmtKey(book[j].format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        fmtPresent[fk]=true;
        if(isSpokenFmt(fk)) spokenShare+=sh;
        else if(!isPublicFmt(fk)) musicShare+=sh;
        if(fk==='MOR') morShare+=sh;
      }
      var lead=book[0]||null, second=book[1]||null;
      var leadFmt=lead?fmtKey(lead.format):'';
      var secondFmt=second?fmtKey(second.format):'';
      var leadSh=lead?(lead.rat.share||0):0;
      var secondSh=second?(second.rat.share||0):0;
      return {
        ok:true,
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
        countryShare:fmtSum.COUNTRY||0,
        soulShare:fmtSum.SOUL_RNB||0,
        newsShare:fmtSum.NEWS_TALK||0,
        hitsPresent:!!(fmtPresent.TOP40||fmtPresent.CHR),
        hitLeaderOrRunnerUp:(leadFmt==='TOP40'||leadFmt==='CHR'||secondFmt==='TOP40'||secondFmt==='CHR')
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  function simYearOne(marketId, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var plan=genModeForYear(targetYear);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      var sc=SC.find(function(x){return x.id===plan.scenId;})||SC[0];
      var origIdx=sc.idx; sc.idx=[];
      G=genMarket(plan.scenId);
      sc.idx=origIdx;
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
      var book=sortBook(G.stations);
      var shares={};
      for(var j=0;j<book.length;j++){
        var fk=fmtKey(book[j].format);
        shares[fk]=(shares[fk]||0)+(book[j].rat.share||0);
      }
      return {
        ok:true,
        leaderFmt:book[0]?fmtKey(book[0].format):'',
        shares:shares,
        chrShare:(shares.CHR||0)+(shares.TOP40||0)+(shares.HOT_AC||0)*0.5,
        rockShare:(shares.CLASSIC_ROCK||0)+(shares.ALBUM_ROCK||0)+(shares.ALT_ROCK||0),
        spanishShare:shares.SPANISH||0,
        countryShare:shares.COUNTRY||0,
        spokenShare:(shares.NEWS_TALK||0)+(shares.SPORTS_TALK||0)+(shares.PERSONALITY_TALK||0)
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  function traceOpeningDial(marketId, seedVal){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    var sc=SC.find(function(x){return x.id==='under';});
    var origIdx=sc.idx; sc.idx=[];
    G=genMarket('under');
    sc.idx=origIdx;
    var effBp=[];
    if(typeof BP!=='undefined'&&typeof effectiveBpForMarket==='function'){
      for(var bi=0;bi<BP.length;bi++) effBp.push({idx:bi,spec:effectiveBpForMarket(bi,marketId)});
    }
    var book=sortBook(G.stations);
    var rows=[];
    for(var i=0;i<Math.min(book.length,14);i++){
      var st=book[i];
      rows.push({
        rank:i+1,
        call:st.call||'',
        band:st.sig&&st.sig.type,
        fmt:fmtKey(st.format),
        share:st.rat.share,
        str:st.str,
        oq:st.oq,
        bpSlot:st.bpSlotIndex
      });
    }
    var fmtCounts={};
    G.stations.forEach(function(st){
      if(!st||st._bpSlotDeferred)return;
      var fk=fmtKey(st.format);
      fmtCounts[fk]=(fmtCounts[fk]||0)+1;
    });
    return {effectiveBp:effBp,topBook:rows,fmtCounts:fmtCounts};
  }
  return { openingSniffOne: openingSniffOne, simYearOne: simYearOne, traceOpeningDial: traceOpeningDial };
})();
`;

function summarizeOpening(rows) {
  const ok = rows.filter((r) => r.ok);
  const leaderHist = {};
  for (const r of ok) {
    const k = r.leaderFmt || '?';
    leaderHist[k] = (leaderHist[k] || 0) + 1;
  }
  return {
    n: ok.length,
    hitsPresenceRate: ok.filter((r) => r.hitsPresent).length / Math.max(1, ok.length),
    morShareMedian: median(ok.map((r) => r.morShare)),
    top2Median: median(ok.map((r) => r.top2Combined)),
    musicShareMedian: median(ok.map((r) => r.musicShare)),
    countryShareMean: mean(ok.map((r) => r.countryShare)),
    soulShareMean: mean(ok.map((r) => r.soulShare)),
    newsShareMean: mean(ok.map((r) => r.newsShare)),
    hitLeaderRunnerUpRate: ok.filter((r) => r.hitLeaderOrRunnerUp).length / Math.max(1, ok.length),
    leaderHist,
    verdict: null,
  };
}

function summarizeSim(rows) {
  const ok = rows.filter((r) => r.ok);
  return {
    n: ok.length,
    spanishShare: mean(ok.map((r) => r.spanishShare)),
    rockShare: mean(ok.map((r) => r.rockShare)),
    chrShare: mean(ok.map((r) => r.chrShare)),
    countryShare: mean(ok.map((r) => r.countryShare)),
    spokenShare: mean(ok.map((r) => r.spokenShare)),
    leaderHist: ok.reduce((h, r) => {
      const k = r.leaderFmt || '?';
      h[k] = (h[k] || 0) + 1;
      return h;
    }, {}),
  };
}

function parseArgs(argv) {
  const o = { openingRuns: 100, regressionRuns: 25, trace: false };
  for (const a of argv) {
    if (a.startsWith('--opening-runs=')) o.openingRuns = Math.max(1, parseInt(a.slice(15), 10) || 100);
    else if (a.startsWith('--regression-runs=')) o.regressionRuns = Math.max(1, parseInt(a.slice(18), 10) || 25);
    else if (a === '--trace') o.trace = true;
  }
  return o;
}

const VARIANT_DESC = {
  A: 'Baseline (production MARKET_BP_PATCH + phoenixDiagOpeningOqMult)',
  B: 'BP slot 0: MOR→TOP40 strong (keep other Phoenix patches)',
  C: 'Opening shape 1970–78: boost hits AM/FM, trim MOR AM',
  D: 'BP slot 0 TOP40 strong + slot 4 MOR dominant→moderate',
  E: 'Combined D + C (minimal dual patch)',
};

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const results = { variants: {}, trace: null, rootCause: null };

  console.log('Phoenix 1970 Top 40 correction A/B (in-vm only)\n');

  for (const variant of VARIANTS) {
    const ctx = loadCtx(variant);
    const api = vm.runInContext(RUN_IIFE, ctx);
    const origR = Math.random;

    if (variant === 'A' && opts.trace) {
      results.trace = api.traceOpeningDial(PHOENIX, SEED);
    }

    const openingRows = [];
    for (let run = 0; run < opts.openingRuns; run++) {
      const s0 = SEED + marketSalt(PHOENIX) * 17 + OPENING_YEAR * 10007 + run * 9973 + variant.charCodeAt(0) * 131;
      let r;
      try {
        r = api.openingSniffOne(PHOENIX, OPENING_YEAR, s0, 0);
      } catch (e) {
        r = { ok: false, err: String(e?.message || e) };
      } finally {
        Math.random = origR;
      }
      openingRows.push(r);
    }
    const opening = summarizeOpening(openingRows);
    opening.verdict = openingVerdict(opening);

    const regression = {};
    for (const year of REGRESSION_YEARS) {
      const simRows = [];
      const maxSteps = MAX_STEPS_BY_YEAR[year] ?? 320;
      for (let run = 0; run < opts.regressionRuns; run++) {
        const s0 = SEED + marketSalt(PHOENIX) * 17 + year * 10007 + run * 9973 + variant.charCodeAt(0) * 131;
        let r;
        try {
          r = api.simYearOne(PHOENIX, year, s0, maxSteps);
        } catch (e) {
          r = { ok: false, err: String(e?.message || e) };
        } finally {
          Math.random = origR;
        }
        simRows.push(r);
      }
      regression[year] = summarizeSim(simRows);
    }

    const laRows = [];
    const nashRows = [];
    for (let run = 0; run < Math.min(50, opts.openingRuns); run++) {
      const sLa = SEED + marketSalt('losangeles') * 17 + 1970 * 10007 + run * 9973 + variant.charCodeAt(0);
      const sNa = SEED + marketSalt('nashville') * 17 + 1985 * 10007 + run * 9973 + variant.charCodeAt(0);
      try {
        laRows.push(api.openingSniffOne('losangeles', 1970, sLa, 0));
      } catch (_e) {
        laRows.push({ ok: false });
      }
      try {
        nashRows.push(api.simYearOne('nashville', 1985, sNa, MAX_STEPS_BY_YEAR[1985]));
      } catch (_e) {
        nashRows.push({ ok: false });
      } finally {
        Math.random = origR;
      }
    }

    results.variants[variant] = {
      description: VARIANT_DESC[variant],
      opening,
      regression,
      controls: {
        losangeles1970: summarizeOpening(laRows),
        nashville1985: summarizeSim(nashRows),
      },
    };

    console.log(
      `[${variant}] ${VARIANT_DESC[variant]}\n` +
        `  1970: hits=${pct(opening.hitsPresenceRate)} MOR=${pct(opening.morShareMedian)} top2=${pct(opening.top2Median)} ` +
        `hit#1/2=${pct(opening.hitLeaderRunnerUpRate)} country=${pct(opening.countryShareMean)} soul=${pct(opening.soulShareMean)} ` +
        `news=${pct(opening.newsShareMean)} → ${opening.verdict}\n` +
        `  2026: span=${pct(regression[2026].spanishShare)} rock=${pct(regression[2026].rockShare)} chr=${pct(regression[2026].chrShare)} ` +
        `leader=${Object.entries(regression[2026].leaderHist).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k}:${v}`).join(' ')}\n`,
    );
  }

  results.rootCause = {
    summary:
      'Phoenix MARKET_BP_PATCH replaces national AM Top 40 anchors (BP 0–1) with MOR+NEWS_TALK; national BP 4 remains MOR dominant; FM Top 40 (BP 18) deferred; tier inject blocks TOP40/HOT_AC; phoenixDiagOpeningOqMult penalizes hits (AM×0.9, FM×0.84).',
    paths: [
      'MARKET_BP_PATCH.phoenix[0]=MOR strong (was AM TOP40 dominant)',
      'MARKET_BP_PATCH.phoenix[1]=NEWS_TALK moderate (was AM TOP40 strong)',
      'BP[4] national AM MOR dominant (unpatched)',
      'phoenixDiagTierInjectFormatBlocked: TOP40,HOT_AC,...',
      'phoenixDiagOpeningOqMult hits penalty',
      'ATLANTA_1970_DEFERRED: FM TOP40 bp 18 off-air at open',
    ],
  };

  let recommended = 'D';
  let bestScore = -1;
  for (const v of ['D', 'B', 'E']) {
    const o = results.variants[v].opening;
    if (o.verdict !== 'PASS') continue;
    const r26 = results.variants[v].regression[2026];
    const r95 = results.variants[v].regression[1995];
    let score = 0;
    if (o.hitsPresenceRate >= 0.7) score += 25;
    if (o.morShareMedian <= 0.35) score += 20;
    if (o.hitLeaderRunnerUpRate >= 0.4) score += 15;
    if (o.top2Median <= 0.45) score += 10;
    if (r26.spanishShare >= 0.18 && r26.spanishShare <= 0.3) score += 10;
    if (r26.rockShare <= 0.2) score += 8;
    if (r95.chrShare >= 0.05 && r95.chrShare <= 0.18) score += 8;
    if (r26.chrShare >= 0.05) score += 5;
    if (v === 'D') score += 3;
    if (v === 'B') score += 2;
    const patchLines = v === 'B' ? 1 : v === 'D' ? 2 : 4;
    score -= patchLines;
    const la = results.variants[v].controls.losangeles1970;
    if (la.hitsPresenceRate >= 0.95) score += 5;
    if (score > bestScore) {
      bestScore = score;
      recommended = v;
    }
  }

  const rec = results.variants[recommended];
  const ship =
    rec.opening.verdict === 'PASS' &&
    rec.regression[2026].spanishShare >= 0.16 &&
    rec.regression[2026].spanishShare <= 0.32 &&
    rec.regression[2026].rockShare <= 0.22 &&
    rec.regression[1995].chrShare <= 0.2 &&
    rec.controls.losangeles1970.hitsPresenceRate >= 0.9;

  results.recommendation = {
    variant: recommended,
    description: VARIANT_DESC[recommended],
    shipReady: ship,
    filesIfShipped: [
      'src/legacy.js — MARKET_BP_PATCH.phoenix',
      recommended === 'C' || recommended === 'E'
        ? 'src/legacy.js — applyMarketOpeningShape early-era Phoenix hits boost'
        : null,
    ].filter(Boolean),
  };

  console.log('\n── A/B table (Phoenix 1970 opening) ──');
  console.log('Var | Hits% | MOR med | Top2 | Hit#1/2 | Country | Verdict');
  for (const v of VARIANTS) {
    const o = results.variants[v].opening;
    console.log(
      `${v}   | ${pct(o.hitsPresenceRate).padStart(6)} | ${pct(o.morShareMedian).padStart(7)} | ${pct(o.top2Median).padStart(5)} | ${pct(o.hitLeaderRunnerUpRate).padStart(7)} | ${pct(o.countryShareMean).padStart(7)} | ${o.verdict}`,
    );
  }

  console.log('\n── Regression vs A (Phoenix sim means) ──');
  console.log('Var | 1985 CHR | 1995 CHR | 2005 rock | 2026 span | 2026 rock | 2026 CHR');
  for (const v of VARIANTS) {
    const r = results.variants[v].regression;
    console.log(
      `${v}   | ${pct(r[1985].chrShare)} | ${pct(r[1995].chrShare)} | ${pct(r[2005].rockShare)} | ${pct(r[2026].spanishShare)} | ${pct(r[2026].rockShare)} | ${pct(r[2026].chrShare)}`,
    );
  }

  console.log('\n── Controls (should match A) ──');
  for (const v of ['A', recommended]) {
    const c = results.variants[v].controls;
    console.log(
      `${v}: LA1970 hits=${pct(c.losangeles1970.hitsPresenceRate)} | Nashville1985 leader=${Object.entries(c.nashville1985.leaderHist).sort((a, b) => b[1] - a[1])[0]?.join(':') || '—'}`,
    );
  }

  console.log(`\nRecommended minimal fix: Variant ${recommended} — ${VARIANT_DESC[recommended]}`);
  console.log(`Ship now? ${ship ? 'YES (pending your approval)' : 'NO — tune or narrow patch'}`);
  if (!ship) console.log('(Diagnostic only — no gameplay files modified.)');

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(
    outJson,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        openingRuns: opts.openingRuns,
        regressionRuns: opts.regressionRuns,
        seed: SEED,
        timingMs: Date.now() - t0,
        ...results,
        recommendation: results.recommendation,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nWrote ${outJson}`);
  console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
