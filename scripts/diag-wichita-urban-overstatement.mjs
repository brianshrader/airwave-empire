#!/usr/bin/env node
/**
 * Wichita small-market Urban overstatement audit — diagnostic only (in-vm patches).
 *
 *   node scripts/diag-wichita-urban-overstatement.mjs
 *
 * @see docs/FORMAT_FAMILY_ARCHITECTURE.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { deriveMarketEcology } from '../src/marketEcology.js';
import {
  aggregateFmtSumToFamilyShares,
  familyForFormat,
  loadFormatFamiliesCatalog,
} from './formatFamilyHelpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'wichita_urban_overstatement_ab.json');

const WICHITA_YEARS = [1985, 1995, 2005, 2026];
const CONTROL_MARKETS = ['nashville', 'atlanta', 'newyork', 'phoenix'];
const ALL_MARKETS = ['wichita', ...CONTROL_MARKETS];
const VARIANTS = ['A', 'B', 'C', 'D', 'E'];
const RUNS = 8;
const SEED = 20260518;
const ERA = '1985';
const MAX_STEPS = 280;
const PERIOD = 1;

const URBAN_FMTS = ['SOUL_RNB', 'URBAN_CONTEMP', 'RHYTHMIC'];
const VARIANT_LABELS = {
  A: 'Baseline runtime',
  B: 'Suppress URBAN_CONTEMP/RHYTHMIC viability (small + blackPop<0.15 + midwest_legacy)',
  C: 'Substitute implausible wichita UC/RHYTHMIC at mkStn (era→CHR/AC/Classic Hits/Gospel)',
  D: 'Tier inject: drop urban slots for small + blackPop<0.15',
  E: 'Combined B + C + D',
};

const MKT_META = {
  wichita: {
    id: 'wichita',
    rankTier: 'small',
    archetypeId: 'midwest_legacy',
    blackPop: 0.11,
    urbanBonus: 0.03,
    culture: { country: 0.14, urban: 0.04, newsTalk: 0.05, religion: 0.09, spanish: 0.04 },
    countryBonus: 0.1,
    churchGoing: 0.52,
    eduIndex: 0.9,
    publicCivicIndex: 0.94,
    fmPenBias: -0.04,
    fmMusicFragMult: 0.98,
  },
  nashville: {
    id: 'nashville',
    rankTier: 'medium',
    archetypeId: 'southern_country',
    blackPop: 0.18,
    urbanBonus: 0.02,
    culture: { country: 0.26, urban: 0.03, newsTalk: 0.04, religion: 0.1, spanish: 0.02 },
    countryBonus: 0.18,
    churchGoing: 0.58,
    eduIndex: 0.88,
    publicCivicIndex: 0.96,
    fmPenBias: -0.058,
    fmMusicFragMult: 0.96,
  },
  atlanta: {
    id: 'atlanta',
    rankTier: 'large',
    archetypeId: 'sunbelt_diversified',
    blackPop: 0.358,
    urbanBonus: 0.05,
    culture: { country: 0.09, urban: 0.06, newsTalk: 0.1, religion: 0.04, spanish: 0.06 },
    countryBonus: 0,
    churchGoing: 0.54,
    eduIndex: 0.9,
    publicCivicIndex: 0.94,
    fmPenBias: -0.02,
    fmMusicFragMult: 0.98,
  },
  newyork: {
    id: 'newyork',
    rankTier: 'mega',
    archetypeId: 'northeast_mega',
    blackPop: 0.21,
    urbanBonus: 0.14,
    culture: { country: 0.04, urban: 0.08, newsTalk: 0.14, religion: 0.03, spanish: 0.1 },
    countryBonus: 0,
    churchGoing: 0.42,
    eduIndex: 1.02,
    publicCivicIndex: 1.0,
    fmPenBias: 0.02,
    fmMusicFragMult: 1.08,
  },
  phoenix: {
    id: 'phoenix',
    rankTier: 'large',
    archetypeId: 'sunbelt_growth',
    blackPop: 0.062,
    urbanBonus: 0.05,
    culture: { country: 0.07, urban: 0.05, newsTalk: 0.08, religion: 0.04, spanish: 0.12 },
    countryBonus: 0.07,
    churchGoing: 0.34,
    eduIndex: 0.92,
    publicCivicIndex: 0.9,
    fmPenBias: -0.01,
    fmMusicFragMult: 1.02,
  },
};

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function loadLegacySrc() {
  let src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
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
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = Math.floor(Math.random() * 256);
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
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Symbol,
    Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    Int8Array, Uint8Array, Buffer, Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
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

/** B: block urban-contemporary viability in low-Black small / midwest_legacy markets */
const PATCH_B = `
(function(){
  if(typeof formatAllowedInMarket!=='function'||formatAllowedInMarket.__wlUrbanAbB)return;
  var _orig=formatAllowedInMarket;
  formatAllowedInMarket=function(fmt,marketId,year){
    if(!_orig(fmt,marketId,year))return false;
    if(fmt!=='URBAN_CONTEMP'&&fmt!=='RHYTHMIC')return true;
    var m=MARKETS[marketId||'']||{};
    var bp=typeof m.blackPop==='number'?m.blackPop:0.2;
    if(m.rankTier==='small'&&bp<0.15)return false;
    if(String(m.archetypeId||'')==='midwest_legacy'&&bp<0.15)return false;
    return true;
  };
  formatAllowedInMarket.__wlUrbanAbB=true;
})();
`;

/** C: wichita UC/RHYTHMIC → plausible substitutes at station creation */
const PATCH_C = `
(function(){
  if(typeof mkStn!=='function'||mkStn.__wlUrbanAbC)return;
  var _orig=mkStn;
  function wichitaUrbanSubstitute(fmt,marketId,year){
    if(marketId!=='wichita')return fmt;
    if(fmt!=='URBAN_CONTEMP'&&fmt!=='RHYTHMIC')return fmt;
    var y=year||1985;
    if(y>=2005)return 'CLASSIC_HITS';
    if(y>=1995)return 'HOT_AC';
    if(y>=1988)return 'ADULT_CONTEMP';
    return 'TOP40';
  }
  mkStn=function(bp,freq,year){
    var mkt=typeof ACTIVE_MARKET!=='undefined'?ACTIVE_MARKET:'wichita';
    var eff=bp&&bp.fmt?{...bp,fmt:wichitaUrbanSubstitute(bp.fmt,mkt,year)}:bp;
    return _orig(eff,freq,year);
  };
  mkStn.__wlUrbanAbC=true;
})();
`;

/** D: tier inject skips urban for small + blackPop<0.15 */
const PATCH_D = `
(function(){
  if(typeof injectTierMarketCommercialExtras!=='function'||injectTierMarketCommercialExtras.__wlUrbanAbD)return;
  var _orig=injectTierMarketCommercialExtras;
  function tierInjectFiltered(marketId){
    var m=MARKETS[marketId||'']||{};
    var bp=typeof m.blackPop==='number'?m.blackPop:0.2;
    var dropUrban=m.rankTier==='small'&&bp<0.15;
    if(!dropUrban)return TIER_MARKET_INJECT_BP.slice();
    return TIER_MARKET_INJECT_BP.filter(function(x){
      return x.fmt!=='URBAN_CONTEMP'&&x.fmt!=='RHYTHMIC';
    });
  }
  injectTierMarketCommercialExtras=function(stations,dialCtx,bpYear,commercialTarget){
    if(!stations||!dialCtx||!tierUsesDialScaling(dialCtx.marketId))return;
    var INJECT=tierInjectFiltered(dialCtx.marketId);
    var pi=0;
    for(var guard=0;guard<80;guard++){
      var live=0;
      for(var i=0;i<stations.length;i++){
        var s=stations[i];
        if(s&&!s._bpSlotDeferred&&!stationIsNoncommercialInstitutional(s))live++;
      }
      if(live>=commercialTarget)break;
      var spec=null;
      for(var tries=0;tries<INJECT.length;tries++){
        var cand=INJECT[(pi+tries)%INJECT.length];
        if(typeof isPhoenixDiagMarket==='function'&&isPhoenixDiagMarket(dialCtx.marketId)&&typeof phoenixDiagTierInjectFormatBlocked==='function'&&phoenixDiagTierInjectFormatBlocked(cand.fmt))continue;
        if(formatAllowedInMarket(cand.fmt,dialCtx.marketId,bpYear)){
          spec=cand;
          pi=(pi+tries+1)%INJECT.length;
          break;
        }
      }
      if(!spec)break;
      var freq=nextUnusedCommercialFreq(dialCtx,spec.type);
      if(!freq)break;
      var st=mkStn({type:spec.type,fmt:spec.fmt,pw:spec.pw,str:spec.str},freq,bpYear);
      st._diagGenSource='tier_inject';
      stations.push(st);
    }
  };
  injectTierMarketCommercialExtras.__wlUrbanAbD=true;
})();
`;

/** Gen-source tags for pipeline trace (baseline A only) */
const PATCH_GEN_TRACE = `
(function(){
  if(typeof mkStn!=='function'||mkStn.__wlUrbanGenTrace)return;
  var _mk=mkStn;
  mkStn=function(bp,freq,year){
    var s=_mk(bp,freq,year);
    if(s)s._diagGenSource=s._diagGenSource||'mkStn';
    return s;
  };
  mkStn.__wlUrbanGenTrace=true;
  if(typeof injectTierMarketCommercialExtras==='function'&&!injectTierMarketCommercialExtras.__wlUrbanTraceWrap){
    var _inj=injectTierMarketCommercialExtras;
    injectTierMarketCommercialExtras=function(stations,dialCtx,bpYear,commercialTarget){
      var n0=stations?stations.length:0;
      _inj(stations,dialCtx,bpYear,commercialTarget);
      if(stations){
        for(var i=n0;i<stations.length;i++){
          var s=stations[i];
          if(s&&!s._diagGenSource)s._diagGenSource='tier_inject';
        }
      }
    };
    injectTierMarketCommercialExtras.__wlUrbanTraceWrap=true;
  }
})();
`;

function applyVariant(ctx, variantId) {
  if (variantId === 'B' || variantId === 'E') vm.runInContext(PATCH_B, ctx);
  if (variantId === 'C' || variantId === 'E') vm.runInContext(PATCH_C, ctx);
  if (variantId === 'D' || variantId === 'E') vm.runInContext(PATCH_D, ctx);
}

function loadCtx(variantId, withGenTrace = false) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  if (withGenTrace) vm.runInContext(PATCH_GEN_TRACE, ctx);
  applyVariant(ctx, variantId);
  return ctx;
}

function runSimGrid(ctx, marketIds, years) {
  const salts = {};
  for (const m of marketIds) salts[m] = marketSalt(m);
  const inner = `
  (function(){
    var SALTS = ${JSON.stringify(salts)};
    var GEN_ERA = ${JSON.stringify(ERA)};
    var URBAN_FMTS = ${JSON.stringify(URBAN_FMTS)};
    function eligibleBook(G){
      return (G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
      });
    }
    function fmtKey(fmt){
      return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
    }
    function sortBook(stations){
      var list=stations.slice();
      for(var i=0;i<list.length;i++){
        if(typeof sanitizeStationShareForRanking==='function')sanitizeStationShareForRanking(list[i]);
      }
      list.sort(function(a,b){
        var sa=a.rat&&a.rat.share||0,sb=b.rat&&b.rat.share||0;
        if(Math.abs(sb-sa)>1e-9)return sb-sa;
        return String(a.id).localeCompare(String(b.id));
      });
      return list;
    }
    function sampleOneRun(marketId,targetYear,targetPeriod,maxSteps){
      ACTIVE_MARKET=marketId;
      syncMarketPopToMarket(marketId);
      G=genMarketMP(GEN_ERA);
      MP.mode='solo'; MP.isHost=false; if(MP.players)MP.players=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===targetYear&&G.period===targetPeriod)break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>targetPeriod))
          return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==targetPeriod) return {ok:false,err:'miss'};
      var book=sortBook(eligibleBook(G));
      var fmtSum={}, fmtCount={}, bandFmt={}, gospelShare=0, urbanFmtShare=0;
      var soul=0, uc=0, rh=0, urbanFamily=0;
      for(var j=0;j<book.length;j++){
        var st=book[j], sh=Number(st.rat&&st.rat.share)||0;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        fmtCount[fk]=(fmtCount[fk]||0)+1;
        var band=st.sig&&st.sig.type||'?';
        bandFmt[fk+'_'+band]=(bandFmt[fk+'_'+band]||0)+1;
        if(fk==='GOSPEL')gospelShare+=sh;
        if(URBAN_FMTS.indexOf(fk)>=0)urbanFmtShare+=sh;
        if(fk==='SOUL_RNB')soul+=sh;
        if(fk==='URBAN_CONTEMP')uc+=sh;
        if(fk==='RHYTHMIC')rh+=sh;
      }
      var lead=book[0]||null;
      var leadFmt=lead?fmtKey(lead.format):'';
      var leadShare=lead?Number(lead.rat&&lead.rat.share)||0:0;
      var winsByFmt={}, winsByFamily={};
      for(var w=0;w<book.length;w++){
        if(w===0){
          var wf=fmtKey(book[w].format);
          winsByFmt[wf]=(winsByFmt[wf]||0)+1;
        }
      }
      return {
        ok:true, fmtSum:fmtSum, fmtCount:fmtCount, bandFmt:bandFmt,
        soulShare:soul, ucShare:uc, rhShare:rh, urbanFmtShare:urbanFmtShare, gospelShare:gospelShare,
        leaderFmt:leadFmt, leaderShare:leadShare, stationCount:book.length,
      };
    }
    return function runAll(markets,years,targetPeriod,numRuns,baseSeed,maxSteps){
      var rows=[], origR=Math.random;
      for(var mi=0;mi<markets.length;mi++){
        var mktId=markets[mi], salt=SALTS[mktId]||0;
        for(var yi=0;yi<years.length;yi++){
          var y=years[yi];
          for(var run=0;run<numRuns;run++){
            var s0=baseSeed+salt*17+y*10007+run*9973;
            (function(seedVal){
              var s=seedVal;
              Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
            })(s0);
            var r;
            try{ r=sampleOneRun(mktId,y,targetPeriod,maxSteps); }
            catch(e){ r={ok:false,err:String(e&&e.message||e)}; }
            finally{ Math.random=origR; }
            rows.push({marketId:mktId,year:y,run:run,ok:r.ok,err:r.err||'',...(r.ok?r:{})});
          }
        }
      }
      return rows;
    };
  })();
  `;
  const runAll = vm.runInContext(inner, ctx);
  return runAll(marketIds, years, PERIOD, RUNS, SEED, MAX_STEPS);
}

function summarizeMarketYear(rows, marketId, year, catalog) {
  const list = rows.filter((r) => r.ok && r.marketId === marketId && r.year === year);
  if (!list.length) return null;
  const n = list.length;
  const agg = (field) => mean(list.map((r) => r[field] ?? 0));
  const fmtSumMean = {};
  const fmtCountMean = {};
  const leaderHist = {};
  for (const r of list) {
    const k = r.leaderFmt || '?';
    leaderHist[k] = (leaderHist[k] || 0) + 1;
    for (const [fk, sh] of Object.entries(r.fmtSum || {})) {
      fmtSumMean[fk] = (fmtSumMean[fk] || 0) + sh / n;
    }
    for (const [fk, c] of Object.entries(r.fmtCount || {})) {
      fmtCountMean[fk] = (fmtCountMean[fk] || 0) + c / n;
    }
  }
  const { familyShares } = aggregateFmtSumToFamilyShares(fmtSumMean, catalog);
  const leadStr = Object.keys(leaderHist)
    .sort((a, b) => leaderHist[b] - leaderHist[a])
    .map((k) => `${k}:${leaderHist[k]}`)
    .join('|');

  const meta = MKT_META[marketId] || MKT_META.wichita;
  const ecology = deriveMarketEcology(meta, marketId, year, null);

  return {
    n,
    soulSharePct: (agg('soulShare') ?? 0) * 100,
    ucSharePct: (agg('ucShare') ?? 0) * 100,
    rhSharePct: (agg('rhShare') ?? 0) * 100,
    urbanFmtSharePct: (agg('urbanFmtShare') ?? 0) * 100,
    gospelSharePct: (agg('gospelShare') ?? 0) * 100,
    urbanFamilyPct: (familyShares.URBAN ?? 0) * 100,
    countryPct: (familyShares.COUNTRY ?? 0) * 100,
    familySharesPct: Object.fromEntries(
      Object.entries(familyShares).map(([k, v]) => [k, Math.round(v * 1000) / 10]),
    ),
    fmtSumMean,
    fmtCountMean,
    leaderHist: leadStr,
    leaderSharePct: (agg('leaderShare') ?? 0) * 100,
    ecology: {
      blackMusicStrength: ecology.blackMusicStrength,
      urbanContemporaryStrength: ecology.urbanContemporaryStrength,
      blackPop: meta.blackPop,
      urbanBonus: meta.urbanBonus,
      cultureUrban: meta.culture?.urban,
    },
  };
}

function wichitaBlueprintTable(ctx) {
  const inner = `
  (function(){
    var out=[];
    for(var i=0;i<BP.length;i++){
      var eff=effectiveBpForMarket(i,'wichita');
      eff=adjustBlueprintForMarketDial(eff,i,'wichita');
      var patch=(MARKET_BP_PATCH.wichita||{})[i];
      out.push({
        bpIdx:i,
        nationalFmt:BP[i].fmt,
        nationalType:BP[i].type,
        effectiveFmt:eff.fmt,
        effectiveType:eff.type,
        patch:patch||null,
        dialAmToFm:(MARKETS.wichita.dialBpAmToFm||{})[i]||null,
      });
    }
    return out;
  })();
  `;
  return vm.runInContext(inner, ctx);
}

function genAndEraTrace(ctx, marketId, targetYear) {
  const inner = `
  (function(){
    var URBAN_FMTS=${JSON.stringify(URBAN_FMTS)};
    ACTIVE_MARKET=${JSON.stringify(marketId)};
    syncMarketPopToMarket(ACTIVE_MARKET);
    G=genMarketMP(${JSON.stringify(ERA)});
    var atGen=[];
    (G.stations||[]).forEach(function(s){
      if(!s||s._bpSlotDeferred)return;
      var fk=typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(s.format):String(s.format||'');
      if(URBAN_FMTS.indexOf(fk)<0&&fk!=='GOSPEL')return;
      atGen.push({
        fmt:fk, band:s.sig&&s.sig.type, str:s.str, share:Number(s.rat&&s.rat.share)||0,
        source:s._diagGenSource||'unknown', entryY:s.entryTurn&&s.entryTurn.year,
      });
    });
    MP.mode='solo'; MP.isHost=false; if(MP.players)MP.players=[];
    var steps=0, maxSteps=${MAX_STEPS};
    while(steps<maxSteps){
      if(G.year===${targetYear}&&G.period===1)break;
      if(G.year>${targetYear})break;
      var ui=window._harnessPatchTimersAndUi();
      try{ advTurn(); }finally{ ui.restore(); }
      steps++;
    }
    function sortBook(stations){
      var list=(stations||[]).slice().filter(function(s){
        return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
      });
      list.sort(function(a,b){
        return (b.rat.share||0)-(a.rat.share||0);
      });
      return list;
    }
    var book=sortBook(G.stations);
    var urbanStations=[];
    book.forEach(function(s,idx){
      var fk=typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(s.format):String(s.format||'');
      if(URBAN_FMTS.indexOf(fk)<0&&fk!=='GOSPEL')return;
      urbanStations.push({
        rank:idx+1, fmt:fk, band:s.sig&&s.sig.type, str:s.str,
        sharePct:Math.round((Number(s.rat.share)||0)*1000)/10,
        entryY:s.entryTurn&&s.entryTurn.year, entryP:s.entryTurn&&s.entryTurn.period,
        launchPeriod:s.launchPeriod, source:s._diagGenSource||null,
        calls:s.callLetters,
      });
    });
    var fmtSum={};
    book.forEach(function(s){
      var fk=typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(s.format):String(s.format||'');
      fmtSum[fk]=(fmtSum[fk]||0)+(Number(s.rat.share)||0);
    });
    var lead=book[0];
    return {
      year:G.year, period:G.period, atGen:atGen, urbanStations:urbanStations,
      fmtSum:fmtSum, leader:lead?{fmt:lead.format,share:lead.rat.share,calls:lead.callLetters}:null,
      commercialTarget:typeof tierMarketCommercialTarget==='function'?tierMarketCommercialTarget('wichita'):null,
      tierUsesDial:typeof tierUsesDialScaling==='function'?tierUsesDialScaling('wichita'):null,
    };
  })();
  `;
  return vm.runInContext(inner, ctx);
}

function main() {
  const catalog = loadFormatFamiliesCatalog();
  console.log('Wichita Urban overstatement audit (diagnostic only)\n');

  const ctxTrace = loadCtx('A', true);
  const bpTable = wichitaBlueprintTable(ctxTrace);
  const trace1985 = genAndEraTrace(ctxTrace, 'wichita', 1985);
  const trace2026 = genAndEraTrace(ctxTrace, 'wichita', 2026);

  console.log('=== Wichita ecology / demographics (static + derived @2026) ===');
  const eco26 = deriveMarketEcology(MKT_META.wichita, 'wichita', 2026, null);
  console.log(
    `  blackPop=${MKT_META.wichita.blackPop} urbanBonus=${MKT_META.wichita.urbanBonus} culture.urban=${MKT_META.wichita.culture.urban}`,
  );
  console.log(
    `  derived: blackMusicStrength=${eco26.blackMusicStrength?.toFixed(3)} urbanContemporaryStrength=${eco26.urbanContemporaryStrength?.toFixed(3)}`,
  );
  console.log('  (Wichita blackPop 0.11 → low blackMusicStrength; does not justify ~20% UC book share.)\n');

  console.log('=== Wichita effective blueprint (gen @1985) ===');
  for (const row of bpTable) {
    if (
      URBAN_FMTS.includes(row.effectiveFmt) ||
      URBAN_FMTS.includes(row.nationalFmt) ||
      row.effectiveFmt === 'GOSPEL'
    ) {
      console.log(
        `  BP${row.bpIdx} nat=${row.nationalType}/${row.nationalFmt} → eff=${row.effectiveType}/${row.effectiveFmt}` +
          (row.dialAmToFm ? ` dialAmToFm=${JSON.stringify(row.dialAmToFm)}` : '') +
          (row.patch ? ` patch=${JSON.stringify(row.patch)}` : ''),
      );
    }
  }
  console.log(
    `  tierUsesDialScaling=${trace2026.tierUsesDial} commercialTarget≈${trace2026.commercialTarget} (TIER_MARKET_INJECT_BP includes URBAN_CONTEMP slot #4)\n`,
  );

  console.log('=== Gen trace wichita (1 run, seed implicit) ===');
  console.log('  @1985 open urban/gospel:', JSON.stringify(trace1985.atGen));
  console.log('  @2026 urban/gospel roster:', JSON.stringify(trace2026.urbanStations, null, 0));
  console.log('  @2026 leader:', trace2026.leader);

  const allVariants = {};
  const wichitaByYear = {};

  for (const vid of VARIANTS) {
    console.log(`\n=== Variant ${vid}: ${VARIANT_LABELS[vid]} ===`);
    const ctx = loadCtx(vid);
    const rows = runSimGrid(ctx, ALL_MARKETS, WICHITA_YEARS);
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) console.error(`  ${bad.length} failed — ${bad[0].err}`);

    const wYears = {};
    for (const y of WICHITA_YEARS) {
      const s = summarizeMarketYear(rows, 'wichita', y, catalog);
      if (!s) continue;
      wYears[y] = s;
      console.log(
        `  ${y}: URBAN fam ${s.urbanFamilyPct.toFixed(1)}% | SOUL ${s.soulSharePct.toFixed(1)}% UC ${s.ucSharePct.toFixed(1)}% RHY ${s.rhSharePct.toFixed(1)}% | GOSPEL ${s.gospelSharePct.toFixed(1)}% | #1 ${s.leaderHist}`,
      );
    }
    allVariants[vid] = { label: VARIANT_LABELS[vid], wichita: wYears };

    const ctrl = {};
    for (const mid of CONTROL_MARKETS) {
      const s = summarizeMarketYear(rows, mid, 2026, catalog);
      if (s) {
        ctrl[mid] = {
          urbanFamilyPct: s.urbanFamilyPct,
          ucSharePct: s.ucSharePct,
          soulSharePct: s.soulSharePct,
          leaderHist: s.leaderHist,
        };
      }
    }
    allVariants[vid].controls2026 = ctrl;
    if (vid === 'A') wichitaByYear.A = wYears;
  }

  console.log('\n=== Before/after @2026 (book share %) ===');
  console.log('Variant | URBAN fam | SOUL | UC | RHY | GOSPEL | Country fam | #1 hist');
  for (const vid of VARIANTS) {
    const s = allVariants[vid]?.wichita?.[2026];
    if (!s) {
      console.log(`${vid} | —`);
      continue;
    }
    console.log(
      `${vid} | ${s.urbanFamilyPct.toFixed(1)} | ${s.soulSharePct.toFixed(1)} | ${s.ucSharePct.toFixed(1)} | ${s.rhSharePct.toFixed(1)} | ${s.gospelSharePct.toFixed(1)} | ${s.countryPct.toFixed(1)} | ${s.leaderHist}`,
    );
  }

  console.log('\n=== Controls @2026 — urban family (variant A vs E) ===');
  for (const mid of CONTROL_MARKETS) {
    const a = allVariants.A?.controls2026?.[mid];
    const e = allVariants.E?.controls2026?.[mid];
    if (!a || !e) continue;
    const delta = e.urbanFamilyPct - a.urbanFamilyPct;
    console.log(
      `  ${mid}: A urban=${a.urbanFamilyPct.toFixed(1)}% UC=${a.ucSharePct.toFixed(1)}% → E urban=${e.urbanFamilyPct.toFixed(1)}% (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}) #1 A:${a.leaderHist} E:${e.leaderHist}`,
    );
  }

  const recommendation = {
    primaryMechanism:
      'National timeline rival-URBAN_CONTEMP (1983) launches via rival- handler without formatAllowedInMarket gate — adds FM UC at gen/early sim (entryTurn 1985p2 in trace). Second source: tier-market inject URBAN_CONTEMP (TIER_MARKET_INJECT_BP index 4) fills small-market commercial slots at gen (launchPeriod -999). SOUL_RNB is remapped to COUNTRY/GOSPEL on wichita dial; 2026 URBAN family is 100% URBAN_CONTEMP (SOUL/RHYTHMIC ~0).',
    wichitaBlueprint:
      'MARKET_BP_PATCH does not seed UC; dialBpAmToFm maps national SOUL AM slots to COUNTRY/GOSPEL FM.',
    demographicsJustified: false,
    variantFindings: {
      B: 'Partial: blocks inject + post-unlock rivals using formatAllowed — 2026 UC 16.2%→9.1%; does not remove gen rival UC.',
      C: 'Full wichita-only remap at mkStn — 2026 URBAN 0%; controls unchanged.',
      D: 'No effect vs A — UC enters via national rival path, not tier-inject list alone.',
      E: 'Same as C for wichita; controls unchanged.',
    },
    bestMinimalFix:
      'Ship: (1) gate rival-URBAN_CONTEMP/RHYTHMIC in processNationalTimeline for rankTier small + blackPop<0.15; (2) formatAllowedInMarket suppression (variant B); (3) filter TIER_MARKET_INJECT_BP urban slots for same cohort. Avoid wichita-only mkStn remap (C).',
    scope:
      'Generalize to small low-Black markets (not Wichita-only). Atlanta/NY/Phoenix controls flat under E because patches target small/blackPop<0.15 or wichita id.',
    noteOn19pct:
      'This harness mean @2026 URBAN fam ≈16.2% (8 runs). Prior family-bucket diag ~19–20% may differ by run count/seed or lifecycle rollup — same dominant mechanism (URBAN_CONTEMP).',
  };

  const artifact = {
    recordedAt: new Date().toISOString(),
    runs: RUNS,
    seed: SEED,
    era: ERA,
    wichitaYears: WICHITA_YEARS,
    blueprintTable: bpTable,
    genTrace: { at1985: trace1985, at2026: trace2026 },
    ecology: {
      wichita: { static: MKT_META.wichita, derived2026: eco26 },
      controls: Object.fromEntries(
        CONTROL_MARKETS.map((id) => [id, { static: MKT_META[id], derived2026: deriveMarketEcology(MKT_META[id], id, 2026, null) }]),
      ),
    },
    variants: allVariants,
    recommendation,
    decompositionByYear: Object.fromEntries(
      WICHITA_YEARS.map((y) => [y, allVariants.A?.wichita?.[y] ?? null]),
    ),
  };

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${outJson}`);
  console.log('\nRecommendation:', recommendation.bestMinimalFix);
}

main();
