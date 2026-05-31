#!/usr/bin/env node
/**
 * New York market truth audit — pipeline trace + book vs Duncan/NYC ground truth.
 * Diagnostic only — does not modify shipped gameplay.
 *
 *   node scripts/diag-newyork-truth-audit.mjs
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { deriveMarketEcology } from '../src/marketEcology.js';
import {
  aggregateMeansToLeadershipBuckets,
  expectedFormatLeadershipProfile,
  LEADERSHIP_BUCKET_KEYS,
} from './expectedFormatLeadershipProfile.mjs';
import { TRUTH_AUDIT_SPANISH_BOOK_SNIPPET } from './spanishSubtypeHelpers.mjs';
import {
  enrichSpanishSubtypeOnRows,
  formatSpanishSubtypeBlock,
  meanSpanishSubtypeAcrossRuns,
} from './spanishSubtypeDiagnostics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

const BENCHMARK_YEARS = [1975, 1985, 1995, 2005, 2026];
const RUNS = 8;
const SEED = 20260515;
const MAX_STEPS = 320;

/** Duncan mega-market arc + NYC format reality (book-share priors). */
const NYC_GROUND_TRUTH = {
  1975: {
    label: 'Duncan 1975: AM-heavy; TOP40/MOR/soul/beautiful; talk emerging; country negligible',
    buckets: {
      TOP40_CHR: 0.28,
      AC_HOT_AC: 0.22,
      ROCK_ALT_AAA: 0.06,
      COUNTRY: 0.02,
      NEWS_TALK_SPORTS: 0.1,
      GOSPEL_CCM: 0.08,
      URBAN_RHYTHMIC: 0.14,
      SPANISH: 0.04,
      PUBLIC_RADIO: 0.06,
    },
    leaderDiversity: 'moderate',
  },
  1985: {
    label: 'Duncan 1985: FM takeover; CHR/urban/rock/AC; talk growing; fragmented',
    buckets: {
      TOP40_CHR: 0.2,
      AC_HOT_AC: 0.16,
      ROCK_ALT_AAA: 0.14,
      COUNTRY: 0.03,
      NEWS_TALK_SPORTS: 0.14,
      GOSPEL_CCM: 0.05,
      URBAN_RHYTHMIC: 0.12,
      SPANISH: 0.06,
      PUBLIC_RADIO: 0.05,
    },
    leaderDiversity: 'high',
  },
  1995: {
    label: 'Duncan 1995: CHR/AC/urban/talk/Spanish; mega fragmentation',
    buckets: {
      TOP40_CHR: 0.14,
      AC_HOT_AC: 0.14,
      ROCK_ALT_AAA: 0.12,
      COUNTRY: 0.04,
      NEWS_TALK_SPORTS: 0.18,
      GOSPEL_CCM: 0.06,
      URBAN_RHYTHMIC: 0.12,
      SPANISH: 0.1,
      PUBLIC_RADIO: 0.06,
    },
    leaderDiversity: 'high',
  },
  2005: {
    label: 'Duncan 2005: talk + urban + Spanish rise; CHR still viable; weak country',
    buckets: {
      TOP40_CHR: 0.1,
      AC_HOT_AC: 0.12,
      ROCK_ALT_AAA: 0.1,
      COUNTRY: 0.04,
      NEWS_TALK_SPORTS: 0.22,
      GOSPEL_CCM: 0.06,
      URBAN_RHYTHMIC: 0.11,
      SPANISH: 0.12,
      PUBLIC_RADIO: 0.06,
    },
    leaderDiversity: 'high',
  },
  2026: {
    label: 'NYC 2026: strong news/talk; Spanish + urban meaningful; viable CHR/AC; weak country; modest public; fragmented #1',
    buckets: {
      TOP40_CHR: 0.08,
      AC_HOT_AC: 0.12,
      ROCK_ALT_AAA: 0.1,
      COUNTRY: 0.04,
      NEWS_TALK_SPORTS: 0.22,
      GOSPEL_CCM: 0.06,
      URBAN_RHYTHMIC: 0.12,
      SPANISH: 0.14,
      PUBLIC_RADIO: 0.08,
    },
    leaderDiversity: 'high',
  },
};

const NYC_MARKET = {
  id: 'newyork',
  rankTier: 'mega',
  archetypeId: 'northeast_mega',
  culture: { country: 0.008, urban: 0.16, newsTalk: 0.12, religion: 0.06, spanish: 0.14 },
  countryBonus: 0,
  blackPop: 0.21,
  churchGoing: 0.42,
  eduIndex: 1.22,
  publicCivicIndex: 1.08,
  fmPenBias: 0.055,
  fmMusicFragMult: 1.06,
  hispPop1970: 0.12,
  hispPop2000: 0.22,
  hispPop2020: 0.26,
  urbanBonus: 0.14,
};

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
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
  let src = readFileSync(legacyPath, 'utf8');
  src = injectHeadlessMegaFragNewsGuard(src);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 240_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function mean(xs) {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function bucketDelta(actual, expected) {
  const out = {};
  for (const k of LEADERSHIP_BUCKET_KEYS) out[k] = (actual[k] ?? 0) - (expected[k] ?? 0);
  return out;
}

function largestDivergences(delta, n = 3) {
  return Object.entries(delta)
    .map(([k, v]) => ({ k, v, abs: Math.abs(v) }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, n);
}

function leaderConcentration(histStr) {
  const parts = (histStr || '').split('|').filter(Boolean);
  if (!parts.length) return { unique: 0, topShare: 0 };
  const counts = parts.map((p) => parseInt(p.split(':')[1], 10) || 0);
  const max = Math.max(...counts);
  const sum = counts.reduce((a, b) => a + b, 0);
  return { unique: parts.length, topShare: sum ? max / sum : 0 };
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function rosterByFormat(stations, bookShares){
    const counts={}, shares={};
    for(var i=0;i<stations.length;i++){
      var s=stations[i];
      if(!s||s._bpSlotDeferred)continue;
      var fk=fmtKey(s.format);
      counts[fk]=(counts[fk]||0)+1;
      if(bookShares&&s.rat&&typeof s.rat.share==='number'){
        shares[fk]=(shares[fk]||0)+s.rat.share;
      }
    }
    return {counts:counts, shares:shares};
  }
  function traceGenPipeline(marketId, scenId){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    UC=new Set();amfIdx=0;fmfIdx=0;
    _gbBrandIdTaken=new Set();
    setNextFreqListsForMarket(marketId);
    shuffleFreqListsForNewGame();
    var sc=SC.find(function(s){return s.id===scenId;})||SC[0];
    var bpYear=sc.startYear||1970;
    var patched=[];
    for(var i=0;i<BP.length;i++){
      var base=BP[i];
      var eff=effectiveBpForMarket(i, marketId);
      var hasPatch=!!(MARKET_BP_PATCH[marketId]&&MARKET_BP_PATCH[marketId][i]);
      patched.push({idx:i,baseFmt:base.fmt,effFmt:eff.fmt,effType:eff.type,patched:hasPatch});
    }
    var stations=[];
    var dialCtx={stations:stations, marketId:marketId};
    var commercialTarget=tierMarketCommercialTargetForGen(marketId,bpYear);
    var atlantaDefSet=new Set();
    if(bpYear===1970){
      for(var di=0;di<BP.length;di++) if(isBpSlotDeferred1970(di,marketId)) atlantaDefSet.add(di);
    }
    var tierTailDef=tierMarketBpTailDeferIndices(marketId,commercialTarget,atlantaDefSet,new Set());
    for(var bi=0;bi<BP.length;bi++){
      var effBp=effectiveBpForMarket(bi, marketId);
      effBp=adjustBlueprintForMarketDial(effBp, bi, marketId);
      var fq=nextUnusedCommercialFreq(dialCtx, effBp.type);
      if(fq==null) throw new Error('freq null slot '+bi);
      if((bpYear===1970&&isBpSlotDeferred1970(bi,marketId))||tierTailDef.has(bi))
        stations.push({_bpSlotDeferred:true,_bpIdx:bi,_deferFreq:fq});
      else stations.push(mkStn(effBp,fq,bpYear));
    }
    var afterBp=rosterByFormat(stations,false);
    var preN=stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length;
    injectTierMarketCommercialExtras(stations,dialCtx,bpYear,commercialTarget);
    var injectFmts=stations.slice(preN).filter(function(s){return s&&!s._bpSlotDeferred;}).map(function(s){return fmtKey(s.format);});
    var afterInject=rosterByFormat(stations,false);
    var megaFrag=[];
    if(typeof megaMarketFragmentationQueueForNewGame==='function'&&isMegaMarketId(marketId)){
      megaFrag=megaMarketFragmentationQueueForNewGame(marketId).map(function(e){return e.y+':'+fmtKey(e.bp.fmt);});
    }
    return {
      bpYear:bpYear, commercialTarget:commercialTarget,
      bpPatch:MARKET_BP_PATCH[marketId]||{},
      patchedSlots:patched.filter(function(p){return p.patched;}),
      afterBpRoster:afterBp, tierInject:injectFmts, afterInjectRoster:afterInject,
      megaFragSchedule:megaFrag, tierTailDeferred:[].slice.call(tierTailDef)
    };
  }
  function bookAtYear(marketId, genScenId, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      var sc=SC.find(function(x){return x.id===genScenId;});
      var oi=sc.idx; sc.idx=[];
      G=genMarket(genScenId);
      sc.idx=oi;
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
      var book=G.stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
      book.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
      var roster=rosterByFormat(G.stations,true);
      var hhi=0;
      for(var j=0;j<book.length;j++){var sh=book[j].rat.share||0; hhi+=sh*sh;}
      var spanCount=G.stations.filter(function(st){return st&&!st._bpSlotDeferred&&fmtKey(st.format)==='SPANISH';}).length;
      ${TRUTH_AUDIT_SPANISH_BOOK_SNIPPET}
      return {
        ok:true, bookShares:roster.shares, leaderFmt:book[0]?fmtKey(book[0].format):'',
        hhi:hhi*10000, stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length,
        spanishStationCount:spanCount,
        spanishBookStations:spanishBookStations
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { traceGenPipeline: traceGenPipeline, bookAtYear: bookAtYear };
})();
`;

function fmtSharesToBuckets(shares) {
  const fmtAgg = Object.entries(shares || {})
    .map(([k, v]) => ({ k, m: v }))
    .sort((a, b) => b.m - a.m);
  return aggregateMeansToLeadershipBuckets(fmtAgg).buckets;
}

function summarizeBookRows(rows, marketId, year) {
  const list = rows.filter((r) => r.ok && r.marketId === marketId && r.year === year);
  if (!list.length) return null;
  const hist = {};
  for (const r of list) {
    const k = r.leaderFmt || '?';
    hist[k] = (hist[k] || 0) + 1;
  }
  const histStr = Object.keys(hist)
    .sort((a, b) => hist[b] - hist[a])
    .map((k) => `${k}:${hist[k]}`)
    .join('|');
  const bucketRuns = list.map((r) => fmtSharesToBuckets(r.bookShares));
  const meanBuckets = {};
  for (const k of LEADERSHIP_BUCKET_KEYS) {
    meanBuckets[k] = bucketRuns.reduce((s, b) => s + (b[k] ?? 0), 0) / bucketRuns.length;
  }
  return {
    meanBuckets,
    meanBucketsPct: Object.fromEntries(
      LEADERSHIP_BUCKET_KEYS.map((k) => [k, `${((meanBuckets[k] ?? 0) * 100).toFixed(1)}`]),
    ),
    hhi: mean(list.map((r) => r.hhi)),
    histStr,
    leaderConc: leaderConcentration(histStr),
    stations: mean(list.map((r) => r.stationCount)),
  };
}

function genPath(year) {
  if (year <= 1975) return 'under';
  return 'chrwar';
}

function main() {
  console.log('New York market truth audit (diagnostic)\n');
  const ctx = loadCtx();
  const api = vm.runInContext(RUN_IIFE, ctx);

  const pipeline = api.traceGenPipeline('newyork', 'chrwar');
  const chicagoPipe = api.traceGenPipeline('chicago', 'chrwar');

  const rows = [];
  for (const year of BENCHMARK_YEARS) {
    const salt = marketSalt('newyork');
    const scen = genPath(year);
    for (let run = 0; run < RUNS; run++) {
      const s0 = SEED + salt * 17 + year * 10007 + run * 9973;
      rows.push({
        marketId: 'newyork',
        year,
        run,
        ...api.bookAtYear('newyork', scen, year, s0, MAX_STEPS),
      });
    }
  }

  const bad = rows.filter((r) => !r.ok);
  if (bad.length) console.error(`Failures: ${bad.length} — ${bad[0]?.err}`);

  enrichSpanishSubtypeOnRows(rows, ctx, { newyork: NYC_MARKET });

  console.log('═══ 1. Pipeline trace @ gen 1985 (chrwar) ═══\n');
  console.log('newyork MARKET_BP_PATCH:', JSON.stringify(pipeline.bpPatch));
  console.log(`commercialTarget=${pipeline.commercialTarget} tierTailDeferred=${pipeline.tierTailDeferred.length}`);
  console.log('patched BP slots:', pipeline.patchedSlots.map((p) => `BP[${p.idx}] ${p.baseFmt}→${p.effFmt}`).join('; '));
  console.log('after BP roster:', JSON.stringify(pipeline.afterBpRoster.counts));
  console.log('tier inject:', pipeline.tierInject.join(', ') || '(none)');
  console.log('after inject:', JSON.stringify(pipeline.afterInjectRoster.counts));
  console.log('MEGA_MARKET_FRAGMENTATION schedule:', pipeline.megaFragSchedule.join(', '));
  console.log('\nchicago (mega control) commercialTarget=', chicagoPipe.commercialTarget, 'tier inject count=', chicagoPipe.tierInject.length);

  console.log('\n═══ 2. Book vs ground truth (8-run mean, leadership buckets %) ═══\n');
  console.log('Year\tTalk\tTruth\tSpan\tTruth\tUrban\tTruth\tCHR\tTruth\tRock\tTruth\tCtry\tTruth\tHHI\t#1\tLeaders');
  for (const year of BENCHMARK_YEARS) {
    const s = summarizeBookRows(rows, 'newyork', year);
    const gt = NYC_GROUND_TRUTH[year].buckets;
    if (!s) continue;
    const b = s.meanBuckets;
    console.log(
      [
        year,
        (b.NEWS_TALK_SPORTS * 100).toFixed(1),
        (gt.NEWS_TALK_SPORTS * 100).toFixed(0),
        (b.SPANISH * 100).toFixed(1),
        (gt.SPANISH * 100).toFixed(0),
        (b.URBAN_RHYTHMIC * 100).toFixed(1),
        (gt.URBAN_RHYTHMIC * 100).toFixed(0),
        (b.TOP40_CHR * 100).toFixed(1),
        (gt.TOP40_CHR * 100).toFixed(0),
        (b.ROCK_ALT_AAA * 100).toFixed(1),
        (gt.ROCK_ALT_AAA * 100).toFixed(0),
        (b.COUNTRY * 100).toFixed(1),
        (gt.COUNTRY * 100).toFixed(0),
        s.hhi.toFixed(0),
        s.histStr,
        s.leaderConc.unique,
      ].join('\t'),
    );
  }

  console.log('\n═══ 3. Largest gaps vs truth @2026 ═══\n');
  const y26 = summarizeBookRows(rows, 'newyork', 2026);
  if (y26) {
    const d = bucketDelta(y26.meanBuckets, NYC_GROUND_TRUTH[2026].buckets);
    for (const x of largestDivergences(d, 5)) {
      const sign = x.v >= 0 ? '+' : '';
      console.log(`  ${x.k}: ${sign}${(x.v * 100).toFixed(1)} pp`);
    }
    console.log(`  #1 concentration: top format wins ${(y26.leaderConc.topShare * 100).toFixed(0)}% of runs across ${y26.leaderConc.unique} leaders`);
  }

  console.log('\n═══ 4. Spanish subtype inference (Phase 1 diag) ═══\n');
  for (const year of BENCHMARK_YEARS) {
    const list = rows.filter((r) => r.ok && r.year === year);
    console.log(`${year}:\n${formatSpanishSubtypeBlock(meanSpanishSubtypeAcrossRuns(list), '  ')}`);
  }

  const eco = deriveMarketEcology(NYC_MARKET, 'newyork', 2026, null);
  const ecoPrior = expectedFormatLeadershipProfile(eco, 2026);
  console.log('\nEcology trait prior @2026:', ecoPrior.serialized);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(
    path.join(root, 'tmp', 'newyork_truth_audit.json'),
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runs: RUNS,
        seed: SEED,
        pipeline,
        chicagoPipe,
        book: BENCHMARK_YEARS.map((y) => ({
          year: y,
          summary: summarizeBookRows(rows, 'newyork', y),
          truth: NYC_GROUND_TRUTH[y],
        })),
        spanishSubtypeByYear: Object.fromEntries(
          BENCHMARK_YEARS.map((y) => [
            y,
            meanSpanishSubtypeAcrossRuns(rows.filter((r) => r.ok && r.year === y)),
          ]),
        ),
      },
      null,
      2,
    )}\n`,
  );
  console.log('\nWrote tmp/newyork_truth_audit.json');
}

main();
