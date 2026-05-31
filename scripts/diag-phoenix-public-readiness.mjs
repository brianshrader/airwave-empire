#!/usr/bin/env node
/**
 * Phoenix public-readiness correction pass — diagnostic only (no gameplay ship).
 *
 *   node scripts/diag-phoenix-public-readiness.mjs
 *
 * A baseline | B rock leader strength (Phoenix diag only)
 * | C Spanish launch timing/strength | D rock frag → Spanish/AC | E combined minimal
 *
 * Controls: losangeles, newyork, atlanta, nashville, wichita, seattle
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

const VARIANTS = ['A', 'B', 'C', 'D', 'E'];
const BENCHMARK_YEARS = [1995, 2005, 2026];
const RUNS = 12;
const SEED = 20260518;
const MAX_STEPS = 320;
const TARGET = 'phoenix';
const CONTROLS = ['losangeles', 'newyork', 'atlanta', 'nashville', 'wichita', 'seattle'];
const ALL_MARKETS = [TARGET, ...CONTROLS];

/** Sunbelt Hispanic priors (leadership buckets, share of book). */
const PHOENIX_TARGET_2026 = {
  TOP40_CHR: 0.1,
  AC_HOT_AC: 0.1,
  ROCK_ALT_AAA: 0.1,
  COUNTRY: 0.08,
  NEWS_TALK_SPORTS: 0.1,
  GOSPEL_CCM: 0.08,
  URBAN_RHYTHMIC: 0.1,
  SPANISH: 0.22,
  PUBLIC_RADIO: 0.06,
};

const PHOENIX_ROCK_OQ = `  if(['CLASSIC_ROCK','ADULT_CONTEMP','ALBUM_ROCK','OLDIES','CLASSIC_HITS'].includes(station.format)&&sig.type==='FM'){
    return 1.1;
  }`;

const PHOENIX_ROCK_OQ_B = `  if(['CLASSIC_ROCK','ADULT_CONTEMP','ALBUM_ROCK','OLDIES','CLASSIC_HITS'].includes(station.format)&&sig.type==='FM'){
    return 0.96;
  }`;

const PHOENIX_SPANISH_LAUNCHES_BASE = `    spanishLaunches:[
      {id:'phoenix_spanish_1994_fm',y:1994,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
      {id:'phoenix_spanish_2002_fm',y:2002,p:2,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'emerging'}},
    ],`;

const PHOENIX_SPANISH_LAUNCHES_C = `    spanishLaunches:[
      {id:'phoenix_spanish_1988_fm',y:1988,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
      {id:'phoenix_spanish_1994_fm',y:1994,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'strong'}},
      {id:'phoenix_spanish_2002_fm',y:2002,p:2,bp:{type:'FM',fmt:'SPANISH',pw:'100kw',str:'moderate'}},
    ],`;

const PHOENIX_FRAG_BASE = `    fragmentationLaunches:[
      {id:'phoenix_frag_cr_1986',y:1986,p:1,bp:{type:'FM',fmt:'CLASSIC_ROCK',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_ac_1988',y:1988,p:2,bp:{type:'FM',fmt:'ADULT_CONTEMP',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_cr2_1991',y:1991,p:1,bp:{type:'FM',fmt:'CLASSIC_ROCK',pw:'50kw',str:'strong'}},
      {id:'phoenix_frag_oldies_1993',y:1993,p:2,bp:{type:'FM',fmt:'OLDIES',pw:'50kw',str:'moderate'}},
    ],`;

const PHOENIX_FRAG_D = `    fragmentationLaunches:[
      {id:'phoenix_frag_cr_1986',y:1986,p:1,bp:{type:'FM',fmt:'CLASSIC_ROCK',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_ac_1988',y:1988,p:2,bp:{type:'FM',fmt:'ADULT_CONTEMP',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_spanish_1991',y:1991,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_oldies_1993',y:1993,p:2,bp:{type:'FM',fmt:'OLDIES',pw:'50kw',str:'moderate'}},
    ],`;

const MKTFMT_SPANISH_ANCHOR = `  if(['SPANISH','RHYTHMIC','URBAN_CONTEMP'].includes(s.format)){
    mktFmt+=(cult.spanish||0)*0.18+(mkt.urbanBonus||0)*0.12;
    if(marketId==='losangeles')mktFmt+=0.065;
  }`;

const MKTFMT_SPANISH_C = `  if(['SPANISH','RHYTHMIC','URBAN_CONTEMP'].includes(s.format)){
    mktFmt+=(cult.spanish||0)*0.18+(mkt.urbanBonus||0)*0.12;
    if(marketId==='losangeles')mktFmt+=0.065;
    if(isPhoenixDiagMarket(marketId)&&s.format==='SPANISH'){
      const h2020=mkt.hispPop2020??0;
      mktFmt+=0.05+0.10*Math.min(1,h2020/0.35);
    }
  }`;

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
  const useB = variant === 'B' || variant === 'E';
  const useC = variant === 'C' || variant === 'E';
  const useD = variant === 'D' || variant === 'E';

  if (useB && out.includes(PHOENIX_ROCK_OQ)) {
    out = out.replace(PHOENIX_ROCK_OQ, PHOENIX_ROCK_OQ_B);
  }
  if (useC) {
    if (out.includes(PHOENIX_SPANISH_LAUNCHES_BASE)) {
      out = out.replace(PHOENIX_SPANISH_LAUNCHES_BASE, PHOENIX_SPANISH_LAUNCHES_C);
    }
    if (out.includes(MKTFMT_SPANISH_ANCHOR)) {
      out = out.replace(MKTFMT_SPANISH_ANCHOR, MKTFMT_SPANISH_C);
    }
  }
  if (useD && out.includes(PHOENIX_FRAG_BASE)) {
    out = out.replace(PHOENIX_FRAG_BASE, PHOENIX_FRAG_D);
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
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function genModeForYear(year) {
  return year <= 1975 ? 'under1970' : 'mp1985';
}

function fmtSharesToBuckets(shares) {
  const fmtAgg = Object.entries(shares || {})
    .map(([k, v]) => ({ k, m: v }))
    .sort((a, b) => b.m - a.m);
  return aggregateMeansToLeadershipBuckets(fmtAgg).buckets;
}

function leaderStats(histStr) {
  const parts = (histStr || '').split('|').filter(Boolean);
  if (!parts.length) return { spanishWins: 0, rockWins: 0, unique: 0, topShare: 0 };
  const counts = parts.map((p) => {
    const [fmt, n] = p.split(':');
    return { fmt, n: parseInt(n, 10) || 0 };
  });
  const sum = counts.reduce((a, c) => a + c.n, 0);
  const max = Math.max(...counts.map((c) => c.n));
  const spanishWins = counts.filter((c) => c.fmt === 'SPANISH').reduce((a, c) => a + c.n, 0);
  const rockWins = counts
    .filter((c) => ['CLASSIC_ROCK', 'ALBUM_ROCK', 'ALT_ROCK', 'AAA'].includes(c.fmt))
    .reduce((a, c) => a + c.n, 0);
  return { spanishWins: sum ? spanishWins / sum : 0, rockWins: sum ? rockWins / sum : 0, unique: parts.length, topShare: sum ? max / sum : 0 };
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function rosterDetail(stations){
    var rockFmts=['CLASSIC_ROCK','ALBUM_ROCK','ALT_ROCK','AAA'];
    var counts={}, shares={}, rockStn=0, spanStn=0;
    var topRock=0, topSpan=0, topAny=0;
    for(var i=0;i<stations.length;i++){
      var s=stations[i];
      if(!s||s._bpSlotDeferred||!s.rat||typeof s.rat.share!=='number')continue;
      var fk=fmtKey(s.format);
      counts[fk]=(counts[fk]||0)+1;
      shares[fk]=(shares[fk]||0)+(s.rat.share||0);
      if(s.rat.share>topAny){topAny=s.rat.share; topAnyFmt=fk;}
      if(rockFmts.indexOf(fk)>=0){
        rockStn++;
        if(s.rat.share>topRock) topRock=s.rat.share;
      }
      if(fk==='SPANISH'){
        spanStn++;
        if(s.rat.share>topSpan) topSpan=s.rat.share;
      }
    }
    var rockShare=0;
    for(var j=0;j<rockFmts.length;j++) rockShare+=(shares[rockFmts[j]]||0);
    return {
      counts:counts, shares:shares,
      rockStationCount:rockStn, spanishStationCount:spanStn,
      rockBookShare:rockShare, spanishBookShare:shares.SPANISH||0,
      topRockShare:topRock, topSpanishShare:topSpan, topAnyShare:topAny, topAnyFmt:topAnyFmt||''
    };
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
    var stations=[];
    var dialCtx={stations:stations, marketId:marketId};
    var commercialTarget=tierMarketCommercialTargetForGen(marketId,bpYear);
    var atlantaDefSet=new Set();
    if(bpYear===1970){
      for(var di=0;di<BP.length;di++) if(isBpSlotDeferred1970(di,marketId)) atlantaDefSet.add(di);
    }
    var tierTailDef=tierMarketBpTailDeferIndices(marketId,commercialTarget,atlantaDefSet,new Set());
    var preN=0;
    for(var bi=0;bi<BP.length;bi++){
      var effBp=effectiveBpForMarket(bi, marketId);
      effBp=adjustBlueprintForMarketDial(effBp, bi, marketId);
      var fq=nextUnusedCommercialFreq(dialCtx, effBp.type);
      if((bpYear===1970&&isBpSlotDeferred1970(bi,marketId))||tierTailDef.has(bi))
        stations.push({_bpSlotDeferred:true,_bpIdx:bi,_deferFreq:fq});
      else stations.push(mkStn(effBp,fq,bpYear));
    }
    preN=stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length;
    injectTierMarketCommercialExtras(stations,dialCtx,bpYear,commercialTarget);
    var injectFmts=stations.slice(preN).filter(function(s){return s&&!s._bpSlotDeferred;}).map(function(s){return fmtKey(s.format);});
    var spanishQ=typeof marketSpanishLaunchesQueueForNewGame==='function'?marketSpanishLaunchesQueueForNewGame(marketId):[];
    var fragQ=typeof marketFragmentationLaunchesQueueForNewGame==='function'?marketFragmentationLaunchesQueueForNewGame(marketId):[];
    var m=MARKETS[marketId]||{};
    return {
      bpPatch:MARKET_BP_PATCH[marketId]||{},
      rankTier:m.rankTier, archetypeId:m.archetypeId,
      isMega:typeof isMegaMarketId==='function'?isMegaMarketId(marketId):false,
      tierInjectBlocked:typeof PHOENIX_DIAG_TIER_INJECT_BLOCK_FMTS!=='undefined'?PHOENIX_DIAG_TIER_INJECT_BLOCK_FMTS.slice():[],
      tierInject:injectFmts,
      spanishLaunches:spanishQ.map(function(e){return e.y+':'+fmtKey(e.bp.fmt)+':'+(e.bp.str||'');}),
      fragmentationLaunches:fragQ.map(function(e){return e.y+':'+fmtKey(e.bp.fmt)+':'+(e.bp.str||'');}),
      rockOqMult:typeof phoenixDiagOpeningOqMult==='function'?phoenixDiagOpeningOqMult({format:'CLASSIC_ROCK',sig:{type:'FM'}}):null
    };
  }
  function sampleOne(marketId, genMode, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      if(genMode==='mp1985'){
        var sc=SC.find(function(x){return x.id==='chrwar';});
        var oi=sc.idx; sc.idx=[];
        G=genMarket('chrwar');
        sc.idx=oi;
      }else{
        var sc2=SC.find(function(x){return x.id==='under';});
        var oi2=sc2.idx; sc2.idx=[];
        G=genMarket('under');
        sc2.idx=oi2;
      }
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
      var detail=rosterDetail(G.stations);
      var book=G.stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
      book.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
      var hhi=0;
      for(var j=0;j<book.length;j++){var sh=book[j].rat.share||0; hhi+=sh*sh;}
      ${TRUTH_AUDIT_SPANISH_BOOK_SNIPPET}
      return {
        ok:true, bookShares:detail.shares, leaderFmt:book[0]?fmtKey(book[0].format):'',
        hhi:hhi*10000, spanishStations:detail.spanishStationCount,
        rockStations:detail.rockStationCount, rockBookShare:detail.rockBookShare,
        spanishBookShare:detail.spanishBookShare, topRockShare:detail.topRockShare,
        topSpanishShare:detail.topSpanishShare, topAnyShare:detail.topAnyShare,
        topAnyFmt:detail.topAnyFmt, spanishBookStations:spanishBookStations
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { traceGenPipeline: traceGenPipeline, sampleOne: sampleOne };
})();
`;

function summarize(rows, variant, marketId, year) {
  const list = rows.filter((r) => r.ok && r.variant === variant && r.marketId === marketId && r.year === year);
  if (!list.length) return null;
  const bucketRuns = list.map((r) => fmtSharesToBuckets(r.bookShares));
  const meanBuckets = {};
  for (const k of LEADERSHIP_BUCKET_KEYS) {
    meanBuckets[k] = mean(bucketRuns.map((b) => b[k] ?? 0));
  }
  const hist = {};
  for (const r of list) {
    const k = r.leaderFmt || '?';
    hist[k] = (hist[k] || 0) + 1;
  }
  const histStr = Object.keys(hist)
    .sort((a, b) => hist[b] - hist[a])
    .map((k) => `${k}:${hist[k]}`)
    .join('|');
  const topFormats = Object.entries(
    list.reduce((acc, r) => {
      for (const [k, v] of Object.entries(r.bookShares || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {}),
  )
    .map(([k, v]) => ({ k, v: v / list.length }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  return {
    meanBuckets,
    spanishPct: (meanBuckets.SPANISH ?? 0) * 100,
    chrPct: (meanBuckets.TOP40_CHR ?? 0) * 100,
    countryPct: (meanBuckets.COUNTRY ?? 0) * 100,
    rockPct: (meanBuckets.ROCK_ALT_AAA ?? 0) * 100,
    acPct: (meanBuckets.AC_HOT_AC ?? 0) * 100,
    urbanPct: (meanBuckets.URBAN_RHYTHMIC ?? 0) * 100,
    talkPct: (meanBuckets.NEWS_TALK_SPORTS ?? 0) * 100,
    publicPct: (meanBuckets.PUBLIC_RADIO ?? 0) * 100,
    hhi: mean(list.map((r) => r.hhi)),
    histStr,
    leaderStats: leaderStats(histStr),
    spanishStations: mean(list.map((r) => r.spanishStations)),
    rockStations: mean(list.map((r) => r.rockStations)),
    rockBookShare: mean(list.map((r) => r.rockBookShare)) * 100,
    spanishBookShare: mean(list.map((r) => r.spanishBookShare)) * 100,
    topRockShare: mean(list.map((r) => r.topRockShare)) * 100,
    topSpanishShare: mean(list.map((r) => r.topSpanishShare)) * 100,
    topFormats,
  };
}

function variantSpec(v) {
  return (
    {
      A: 'baseline (shipped Phoenix diag)',
      B: 'phoenixDiagOpeningOqMult FM rock 1.1→0.96 (leader strength only)',
      C: 'Phoenix spanishLaunches 1988+1994 strong+2002 100kw; appl() SPANISH mktFmt boost',
      D: 'fragmentation: 1991 strong CLASSIC_ROCK → SPANISH moderate',
      E: 'B + C + D combined minimal',
    }[v] || v
  );
}

function gapVsTarget(buckets, target = PHOENIX_TARGET_2026) {
  return Object.fromEntries(
    LEADERSHIP_BUCKET_KEYS.map((k) => [k, ((buckets[k] ?? 0) - (target[k] ?? 0)) * 100]),
  );
}

function controlBleed(results, year = 2026) {
  const a = results.A[year];
  const out = {};
  for (const mid of CONTROLS) {
    const histA = a[mid]?.histStr;
    out[mid] = VARIANTS.every((v) => results[v][year][mid]?.histStr === histA);
  }
  return out;
}

function main() {
  console.log('Phoenix public-readiness pass (12 runs × 1995/2005/2026)\n');

  const phoenixMarket = {
    id: 'phoenix',
    rankTier: 'large',
    archetypeId: 'sunbelt_diversified',
    culture: { country: 0.09, urban: 0.03, newsTalk: 0.07, religion: 0.09, spanish: 0.15 },
    hispPop2020: 0.301,
    countryBonus: 0.09,
    urbanBonus: 0.03,
  };

  const baselineCtx = loadCtx('A');
  const apiBase = vm.runInContext(RUN_IIFE, baselineCtx);
  const pipeline = apiBase.traceGenPipeline('phoenix', 'chrwar');
  const eco = deriveMarketEcology(phoenixMarket, 'phoenix', 2026, null);
  const ecoPrior = expectedFormatLeadershipProfile(eco, 2026);

  console.log('═══ Root-cause trace (gen @1985 chrwar) ═══\n');
  console.log(JSON.stringify(pipeline, null, 2));
  console.log(`\necology @2026: spanishStrength=${eco.spanishLanguageStrength?.toFixed(3)} country=${eco.countryStrength?.toFixed(3)}`);
  console.log(`expected prior: ${ecoPrior.serialized}`);
  console.log(
    '\nMechanisms:\n' +
      '  • MARKET_BP_PATCH: slots 15/16/18 CLASSIC_ROCK+ALBUM_ROCK strong/moderate\n' +
      '  • fragmentationLaunches: 2× CLASSIC_ROCK (1986 moderate, 1991 strong) + AC + OLDIES\n' +
      '  • spanishLaunches: 1994+2002 only (2 FM); no mega _mega_spanish_* (rankTier=large)\n' +
      '  • phoenixDiagOpeningOqMult: FM rock ×1.1 vs FM CHR ×0.84\n' +
      '  • tier inject: CHR blocked; rock/AOR can still inject nationally\n' +
      '  • LA gets appl() +0.065 on SPANISH; Phoenix does not (baseline)\n',
  );

  const results = {};
  const allRows = [];

  for (const variant of VARIANTS) {
    console.log(`\n========== ${variant}: ${variantSpec(variant)} ==========\n`);
    const ctx = loadCtx(variant);
    const api = vm.runInContext(RUN_IIFE, ctx);
    const cells = [];
    for (const year of BENCHMARK_YEARS) {
      for (const mid of ALL_MARKETS) {
        cells.push({
          variant,
          marketId: mid,
          year,
          genMode: genModeForYear(year),
          salt: marketSalt(mid),
        });
      }
    }
    const rows = [];
    const origR = Math.random;
    for (let ci = 0; ci < cells.length; ci++) {
      const c = cells[ci];
      for (let run = 0; run < RUNS; run++) {
        const s0 = SEED + (c.salt || 0) * 17 + c.year * 10007 + run * 9973 + ci * 131;
        let r;
        try {
          r = api.sampleOne(c.marketId, c.genMode, c.year, s0, MAX_STEPS);
        } catch (e) {
          r = { ok: false, err: String(e?.message || e) };
        } finally {
          Math.random = origR;
        }
        const row = {
          variant: c.variant,
          marketId: c.marketId,
          year: c.year,
          run,
          ...r,
        };
        rows.push(row);
        allRows.push(row);
      }
    }
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) console.error(`  failures: ${bad.length} — ${bad[0]?.marketId}@${bad[0]?.year}: ${bad[0]?.err}`);

    results[variant] = {};
    for (const year of BENCHMARK_YEARS) {
      results[variant][year] = { phoenix: summarize(rows, variant, TARGET, year) };
      for (const mid of CONTROLS) {
        results[variant][year][mid] = summarize(rows, variant, mid, year);
      }
    }

    const p = results[variant];
    console.log('Year\tSpan\tCHR\tCtry\tRock\tHHI\t#1\tSpan#1%\tRock#1%\tSpanStn\tTopRock%\tTopSpan%');
    for (const year of BENCHMARK_YEARS) {
      const s = p[year].phoenix;
      if (!s) continue;
      console.log(
        [
          year,
          s.spanishPct.toFixed(1),
          s.chrPct.toFixed(1),
          s.countryPct.toFixed(1),
          s.rockPct.toFixed(1),
          s.hhi.toFixed(0),
          s.histStr,
          `${(s.leaderStats.spanishWins * 100).toFixed(0)}%`,
          `${(s.leaderStats.rockWins * 100).toFixed(0)}%`,
          s.spanishStations.toFixed(1),
          s.topRockShare.toFixed(1),
          s.topSpanishShare.toFixed(1),
        ].join('\t'),
      );
    }
  }

  enrichSpanishSubtypeOnRows(allRows.filter((r) => r.ok && r.marketId === TARGET), baselineCtx, {
    phoenix: phoenixMarket,
  });

  console.log('\n========== Phoenix @2026 — A/B comparison ==========\n');
  console.log('Var\tSpan\tRock\tCHR\tCtry\tSpan#1%\tRock#1%\tSpanStn\tTopRock%\tΔSpan\tΔRock');
  for (const variant of VARIANTS) {
    const p = results[variant][2026].phoenix;
    const base = results.A[2026].phoenix;
    const g = gapVsTarget(p.meanBuckets);
    console.log(
      [
        variant,
        p.spanishPct.toFixed(1),
        p.rockPct.toFixed(1),
        p.chrPct.toFixed(1),
        p.countryPct.toFixed(1),
        `${(p.leaderStats.spanishWins * 100).toFixed(0)}%`,
        `${(p.leaderStats.rockWins * 100).toFixed(0)}%`,
        p.spanishStations.toFixed(1),
        p.topRockShare.toFixed(1),
        `${(p.spanishPct - base.spanishPct).toFixed(1)}`,
        `${(p.rockPct - base.rockPct).toFixed(1)}`,
      ].join('\t'),
    );
    if (variant === 'A') {
      console.log(`  gaps vs target: SPANISH ${g.SPANISH?.toFixed(1)}pp ROCK ${g.ROCK_ALT_AAA?.toFixed(1)}pp CHR ${g.TOP40_CHR?.toFixed(1)}pp`);
    }
  }

  console.log('\n========== Spanish subtype @2026 (variant A) ==========\n');
  const sub26 = meanSpanishSubtypeAcrossRuns(
    allRows.filter((r) => r.ok && r.variant === 'A' && r.year === 2026 && r.marketId === TARGET),
  );
  console.log(formatSpanishSubtypeBlock(sub26, '  '));

  const bleed = controlBleed(results);
  console.log('\n========== Control #1 stability @2026 ==========\n');
  for (const mid of CONTROLS) {
    console.log(`  ${mid}: ${bleed[mid] ? 'STABLE' : 'CHANGED'}`);
  }

  const a26 = results.A[2026].phoenix;
  const e26 = results.E[2026].phoenix;
  const playableInternal =
    e26.spanishPct >= 16 &&
    e26.leaderStats.spanishWins >= 0.25 &&
    e26.rockPct <= 14 &&
    e26.leaderStats.rockWins <= 0.35;

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const artifactPath = path.join(root, 'tmp', 'phoenix_public_readiness.json');
  writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runs: RUNS,
        seed: SEED,
        years: BENCHMARK_YEARS,
        targetIdentity: PHOENIX_TARGET_2026,
        variantSpec: Object.fromEntries(VARIANTS.map((v) => [v, variantSpec(v)])),
        rootCause: {
          rockDominance: [
            'MARKET_BP_PATCH slots 15/16/18 seed CLASSIC_ROCK/ALBUM_ROCK',
            'fragmentationLaunches: dual CLASSIC_ROCK incl 1991 strong',
            'phoenixDiagOpeningOqMult FM rock ×1.1',
            'tier inject may add national AOR/CR; CHR inject blocked for Phoenix',
            'leader concentration: high topRockShare with modest rock station count → strength not count',
          ],
          spanishUnderperformance: [
            'Only 2 spanishLaunches (1994 moderate, 2002 emerging); no 1988 anchor',
            'isMegaMarketId false → no mega supplemental Spanish queue',
            'appl() LA +0.065 on SPANISH; Phoenix lacks diag boost',
            'Regional Mexican inference favors Phoenix traits but gameplay is umbrella SPANISH',
            'Binding: launch timing + leader appeal more than station count ceiling',
          ],
        },
        pipelineTrace: pipeline,
        ecology2026: eco,
        results,
        spanishSubtype2026: sub26,
        controlBleed: bleed,
        recommendation: {
          bestMinimalFix: 'E (B+C+D): phoenix-scoped rock OQ 0.96, earlier/stronger spanishLaunches, swap 1991 frag CR→SPANISH',
          internallyPlayable: playableInternal,
          publicExposureReady: false,
          rationale:
            'DIAG_ONLY until Spanish #1 share ≥22% book and rock ≤10% with stable controls; E moves directionally but may need BP patch slot 15 CR→AC',
        },
        baselineMismatch2026: gapVsTarget(a26.meanBuckets),
        afterE2026: gapVsTarget(e26.meanBuckets),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nWrote ${artifactPath}`);
  console.log(`\nInternally playable (heuristic E@2026): ${playableInternal ? 'CLOSE' : 'NO'}`);
  console.log('Public exposure ready: NO (remain DIAG_ONLY)');
}

main();
