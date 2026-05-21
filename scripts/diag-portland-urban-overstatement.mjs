#!/usr/bin/env node
/**
 * Portland Urban overstatement audit — diagnostic only (in-vm patches).
 *
 *   node scripts/diag-portland-urban-overstatement.mjs
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
  loadFormatFamiliesCatalog,
} from './formatFamilyHelpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'portland_urban_overstatement_ab.json');

const PORTLAND_YEARS = [1985, 1995, 2005, 2026];
const CONTROL_MARKETS = ['seattle', 'phoenix', 'atlanta', 'newyork', 'wichita'];
const ALL_MARKETS = ['portland', ...CONTROL_MARKETS];
const VARIANTS = ['A', 'B', 'C', 'D', 'E'];
const RUNS = 8;
const SEED = 20260520;
const ERA = '1985';
const MAX_STEPS = 280;
const PERIOD = 1;

const URBAN_FMTS = ['SOUL_RNB', 'URBAN_CONTEMP', 'RHYTHMIC'];
const BLOCK_FMTS = ['URBAN_CONTEMP', 'RHYTHMIC'];

const VARIANT_LABELS = {
  A: 'Baseline runtime',
  B: 'Suppress UC/RHY viability (west_fm_fragmented + blackPop<0.15)',
  C: 'Filter/substitute national rival + fragmentation for low-Black coastal',
  D: 'Substitute Portland UC/RHY at mkStn (AAA/AC/Alt/Classic Hits by era)',
  E: 'Combined B + C + D',
};

/** Static MARKETS rows for ecology derivation (matches legacy.js). */
const MKT_META = {
  portland: {
    id: 'portland',
    rankTier: 'large',
    archetypeId: 'west_fm_fragmented',
    region: 'West Coast',
    blackPop: 0.062,
    urbanBonus: 0.05,
    culture: { country: 0.08, urban: 0.06, newsTalk: 0.1, religion: 0.04, spanish: 0.06 },
    countryBonus: 0.07,
    churchGoing: 0.34,
    eduIndex: 1.14,
    publicCivicIndex: 1.1,
    fmPenBias: 0.044,
    fmMusicFragMult: 1.05,
  },
  seattle: {
    id: 'seattle',
    rankTier: 'large',
    archetypeId: 'west_fm_fragmented',
    region: 'West Coast',
    blackPop: 0.09,
    urbanBonus: 0.06,
    culture: { country: 0.12, urban: 0.07, newsTalk: 0.09, religion: 0.05, spanish: 0.08 },
    countryBonus: 0.1,
    churchGoing: 0.38,
    eduIndex: 1.12,
    publicCivicIndex: 1.07,
    fmPenBias: 0.042,
    fmMusicFragMult: 1.04,
  },
  phoenix: {
    id: 'phoenix',
    rankTier: 'large',
    archetypeId: 'sunbelt_diversified',
    region: 'Southwest',
    blackPop: 0.071,
    urbanBonus: 0.03,
    culture: { country: 0.09, urban: 0.03, newsTalk: 0.07, religion: 0.09, spanish: 0.15 },
    countryBonus: 0.09,
    churchGoing: 0.46,
    eduIndex: 0.93,
    publicCivicIndex: 0.94,
    fmPenBias: 0.03,
    fmMusicFragMult: 1.03,
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
    region: 'Northeast',
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
  wichita: {
    id: 'wichita',
    rankTier: 'small',
    archetypeId: 'midwest_legacy',
    region: 'Midwest',
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
};

const SHARED_HELPERS = `
var __wlUrbanBlockFmt=['URBAN_CONTEMP','RHYTHMIC'];
function __wlWestFmLowBlackBlocked(marketId){
  var m=MARKETS[marketId||'']||{};
  if(String(m.archetypeId||'')!=='west_fm_fragmented')return false;
  var bp=typeof m.blackPop==='number'?m.blackPop:0.2;
  return bp<0.15;
}
function __wlLowBlackCoastalBlocked(marketId){
  var m=MARKETS[marketId||'']||{};
  var bp=typeof m.blackPop==='number'?m.blackPop:0.2;
  if(bp>=0.15)return false;
  if(String(m.region||'').indexOf('West')>=0)return true;
  if(/coastal_secular/i.test(String(m.archetypeId||'')))return true;
  return false;
}
function __wlCoastalUrbanSubstitute(fmt,marketId,year){
  if(__wlUrbanBlockFmt.indexOf(fmt)<0)return fmt;
  var y=year||1985;
  var mkt=marketId||'';
  if(mkt==='portland'){
    if(y>=2005)return 'CLASSIC_HITS';
    if(y>=1991)return 'ALT_ROCK';
    if(y>=1985)return 'AAA';
    return 'ADULT_CONTEMP';
  }
  if(__wlWestFmLowBlackBlocked(mkt)){
    if(y>=2005)return 'CLASSIC_HITS';
    if(y>=1990)return 'ADULT_CONTEMP';
    if(y>=1985)return 'AAA';
    return 'ADULT_CONTEMP';
  }
  if(y>=2005)return 'CLASSIC_HITS';
  if(y>=1990)return 'ADULT_CONTEMP';
  return 'AAA';
}
`;

/** B: formatAllowed + appl damp for west_fm_fragmented low-Black */
const PATCH_B = `
(function(){
  ${SHARED_HELPERS}
  if(typeof formatAllowedInMarket==='function'&&!formatAllowedInMarket.__wlPortlandUrbanB){
    var _fa=formatAllowedInMarket;
    formatAllowedInMarket=function(fmt,marketId,year){
      if(!_fa(fmt,marketId,year))return false;
      if(__wlUrbanBlockFmt.indexOf(fmt)<0)return true;
      if(__wlWestFmLowBlackBlocked(marketId))return false;
      return true;
    };
    formatAllowedInMarket.__wlPortlandUrbanB=true;
  }
  if(typeof appl==='function'&&!appl.__wlPortlandUrbanB){
    var _ap=appl;
    appl=function(s,coh,G){
      var v=_ap(s,coh,G);
      if(!s||!G)return v;
      var mid=G.marketId||ACTIVE_MARKET;
      if(__wlWestFmLowBlackBlocked(mid)&&__wlUrbanBlockFmt.indexOf(s.format)>=0)return v*0.36;
      return v;
    };
    appl.__wlPortlandUrbanB=true;
  }
})();
`;

/** C: mkStn substitute for low-Black coastal (covers cold-start pre-rivals + live rivals) */
const PATCH_C_MK = `
(function(){
  ${SHARED_HELPERS}
  if(typeof mkStn!=='function'||mkStn.__wlPortlandUrbanCMk)return;
  var _mk=mkStn;
  mkStn=function(bp,freq,year){
    var mkt=typeof ACTIVE_MARKET!=='undefined'?ACTIVE_MARKET:'portland';
    var eff=bp;
    if(bp&&bp.fmt&&__wlLowBlackCoastalBlocked(mkt)&&__wlUrbanBlockFmt.indexOf(bp.fmt)>=0)
      eff=Object.assign({},bp,{fmt:__wlCoastalUrbanSubstitute(bp.fmt,mkt,year)});
    var s=_mk(eff,freq,year);
    if(s)s._diagGenSource=s._diagGenSource||'mkStn';
    return s;
  };
  mkStn.__wlPortlandUrbanCMk=true;
})();
`;

/** D: Portland-only mkStn remap */
const PATCH_D = `
(function(){
  ${SHARED_HELPERS}
  if(typeof mkStn!=='function'||mkStn.__wlPortlandUrbanD)return;
  var _mk=mkStn;
  mkStn=function(bp,freq,year){
    var mkt=typeof ACTIVE_MARKET!=='undefined'?ACTIVE_MARKET:'portland';
    var eff=bp;
    if(bp&&bp.fmt&&mkt==='portland'&&__wlUrbanBlockFmt.indexOf(bp.fmt)>=0){
      eff=Object.assign({},bp,{fmt:__wlCoastalUrbanSubstitute(bp.fmt,mkt,year)});
    }
    var s=_mk(eff,freq,year);
    if(s)s._diagGenSource=s._diagGenSource||'mkStn';
    return s;
  };
  mkStn.__wlPortlandUrbanD=true;
})();
`;

/** C also needs cold-start pre-rival + fragmentation — separate patch block */
const PATCH_C_GEN = `
(function(){
  ${SHARED_HELPERS}
  if(window.__wlPortlandUrbanCGen)return;
  window.__wlPortlandUrbanCGen=true;
  /* Patch genMarketMP pre-rival loop by wrapping mkStn is insufficient; patch at next genMarket read — use mkStn wrap from D+C shared */
  if(typeof tryLaunchOneMarketFragmentation==='function'&&!tryLaunchOneMarketFragmentation.__wlPortlandUrbanC){
    var _frag=tryLaunchOneMarketFragmentation;
    tryLaunchOneMarketFragmentation=function(G,ent){
      var mkt=G.marketId||ACTIVE_MARKET;
      if(ent&&ent.bp&&ent.bp.fmt&&__wlLowBlackCoastalBlocked(mkt)&&__wlUrbanBlockFmt.indexOf(ent.bp.fmt)>=0){
        ent={...ent,bp:{...ent.bp,fmt:__wlCoastalUrbanSubstitute(ent.bp.fmt,mkt,G.year)}};
      }
      return _frag(G,ent);
    };
    tryLaunchOneMarketFragmentation.__wlPortlandUrbanC=true;
  }
})();
`;

/** Gen trace tags */
const PATCH_GEN_TRACE = `
(function(){
  if(typeof mkStn!=='function'||mkStn.__wlPortlandGenTrace)return;
  var _mk=mkStn;
  mkStn=function(bp,freq,year){
    var s=_mk(bp,freq,year);
    if(s)s._diagGenSource=s._diagGenSource||'mkStn';
    return s;
  };
  mkStn.__wlPortlandGenTrace=true;
})();
`;

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
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: console.error, table: () => {} },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
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
        if (!typedArray?.length) return typedArray;
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

function applyVariant(ctx, variantId) {
  if (variantId === 'B' || variantId === 'E') vm.runInContext(PATCH_B, ctx);
  if (variantId === 'C' || variantId === 'E') {
    vm.runInContext(PATCH_C_MK, ctx);
    vm.runInContext(PATCH_C_GEN, ctx);
  }
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
      var fmtSum={}, fmtCount={}, bandFmt={};
      var soul=0, uc=0, rh=0, gospel=0, publicShare=0;
      for(var j=0;j<book.length;j++){
        var st=book[j], sh=Number(st.rat&&st.rat.share)||0;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        fmtCount[fk]=(fmtCount[fk]||0)+1;
        var band=st.sig&&st.sig.type||'?';
        bandFmt[fk+'_'+band]=(bandFmt[fk+'_'+band]||0)+1;
        if(fk==='GOSPEL')gospel+=sh;
        if(fk==='SOUL_RNB')soul+=sh;
        if(fk==='URBAN_CONTEMP')uc+=sh;
        if(fk==='RHYTHMIC')rh+=sh;
        if(st.isPublic||String(fk||'').indexOf('PUBLIC_')===0)publicShare+=sh;
      }
      var lead=book[0]||null;
      return {
        ok:true, fmtSum:fmtSum, fmtCount:fmtCount, bandFmt:bandFmt,
        soulShare:soul, ucShare:uc, rhShare:rh, gospelShare:gospel, publicShare:publicShare,
        leaderFmt:lead?fmtKey(lead.format):'', leaderShare:Number(lead&&lead.rat&&lead.rat.share)||0,
        stationCount:book.length,
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
  return vm.runInContext(inner, ctx)(marketIds, years, PERIOD, RUNS, SEED, MAX_STEPS);
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

  const meta = MKT_META[marketId];
  const ecology = deriveMarketEcology(meta, marketId, year, null);

  return {
    n,
    soulSharePct: (agg('soulShare') ?? 0) * 100,
    ucSharePct: (agg('ucShare') ?? 0) * 100,
    rhSharePct: (agg('rhShare') ?? 0) * 100,
    gospelSharePct: (agg('gospelShare') ?? 0) * 100,
    publicSharePct: (agg('publicShare') ?? 0) * 100,
    urbanFamilyPct: (familyShares.URBAN ?? 0) * 100,
    countryPct: (familyShares.COUNTRY ?? 0) * 100,
    adultPct: (familyShares.ADULT ?? 0) * 100,
    rockPct: ((familyShares.ROCK ?? 0) + (familyShares.HITS ?? 0)) * 100,
    familySharesPct: Object.fromEntries(
      Object.entries(familyShares).map(([k, v]) => [k, Math.round(v * 1000) / 10]),
    ),
    fmtSumMean,
    fmtCountMean,
    bandFmtMean: list[0]?.bandFmt,
    leaderHist: leadStr,
    ecology: {
      blackMusicStrength: ecology.blackMusicStrength,
      urbanContemporaryStrength: ecology.urbanContemporaryStrength,
      blackPop: meta.blackPop,
      urbanBonus: meta.urbanBonus,
      cultureUrban: meta.culture?.urban,
      archetypeId: meta.archetypeId,
      rankTier: meta.rankTier,
    },
  };
}

function portlandBlueprintTable(ctx) {
  return vm.runInContext(
    `
  (function(){
    var out=[];
    for(var i=0;i<BP.length;i++){
      var eff=effectiveBpForMarket(i,'portland');
      eff=adjustBlueprintForMarketDial(eff,i,'portland');
      var patch=(MARKET_BP_PATCH.portland||{})[i];
      out.push({
        bpIdx:i, nationalFmt:BP[i].fmt, nationalType:BP[i].type,
        effectiveFmt:eff.fmt, effectiveType:eff.type, patch:patch||null,
        dialAmToFm:(MARKETS.portland.dialBpAmToFm||{})[i]||null,
      });
    }
    return {
      rows:out,
      fragLaunches:(MARKETS.portland.fragmentationLaunches||[]).length,
      tierUsesDial:typeof tierUsesDialScaling==='function'?tierUsesDialScaling('portland'):null,
      shippedSmallUrbanGate:typeof smallMarketUrbanRhythmicPlausibilityBlocked==='function'?smallMarketUrbanRhythmicPlausibilityBlocked('portland'):null,
      shippedWestFmGate:typeof westFmFragmentedUrbanRhythmicPlausibilityBlocked==='function'?westFmFragmentedUrbanRhythmicPlausibilityBlocked('portland'):null,
      shippedMarketUrbanGate:typeof marketUrbanRhythmicPlausibilityBlocked==='function'?marketUrbanRhythmicPlausibilityBlocked('portland'):null,
      shippedWestFmUrbanGate:typeof westFmFragmentedUrbanRhythmicPlausibilityBlocked==='function'?westFmFragmentedUrbanRhythmicPlausibilityBlocked('portland'):null,
      shippedMarketUrbanGate:typeof marketUrbanRhythmicPlausibilityBlocked==='function'?marketUrbanRhythmicPlausibilityBlocked('portland'):null,
    };
  })();
  `,
    ctx,
  );
}

function genTrace(ctx, targetYear) {
  return vm.runInContext(
    `
  (function(){
    var URBAN=${JSON.stringify(URBAN_FMTS)};
    ACTIVE_MARKET='portland';
    syncMarketPopToMarket('portland');
    G=genMarketMP('1985');
    var atGen=[];
    (G.stations||[]).forEach(function(s){
      if(!s||s._bpSlotDeferred)return;
      var fk=typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(s.format):s.format;
      if(URBAN.indexOf(fk)<0&&fk!=='GOSPEL')return;
      atGen.push({fmt:fk,band:s.sig&&s.sig.type,share:s.rat&&s.rat.share,source:s._diagGenSource||'mkStn',launchPeriod:s.launchPeriod});
    });
    MP.mode='solo'; MP.isHost=false;
    var steps=0;
    while(steps<${MAX_STEPS}){
      if(G.year===${targetYear}&&G.period===1)break;
      if(G.year>${targetYear})break;
      var ui=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui.restore();}
      steps++;
    }
    var book=(G.stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
    }).sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    var urban=[];
    book.forEach(function(s,i){
      var fk=typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(s.format):s.format;
      if(URBAN.indexOf(fk)<0&&fk!=='GOSPEL')return;
      urban.push({rank:i+1,fmt:fk,band:s.sig&&s.sig.type,sharePct:Math.round((s.rat.share||0)*1000)/10,entryY:s.entryTurn&&s.entryTurn.year,launchPeriod:s.launchPeriod,calls:s.callLetters});
    });
    return {year:G.year,atGen:atGen,urbanStations:urban,leader:book[0]?{fmt:book[0].format,share:book[0].rat.share,calls:book[0].callLetters}:null};
  })();
  `,
    ctx,
  );
}

function main() {
  const catalog = loadFormatFamiliesCatalog();
  console.log('Portland Urban overstatement audit (diagnostic only)\n');

  const ctxTrace = loadCtx('A', true);
  const bpInfo = portlandBlueprintTable(ctxTrace);
  const trace1985 = genTrace(ctxTrace, 1985);
  const trace2026 = genTrace(ctxTrace, 2026);
  const eco26 = deriveMarketEcology(MKT_META.portland, 'portland', 2026, null);

  console.log('=== Portland demographics / ecology @2026 ===');
  console.log(
    `  rankTier=${MKT_META.portland.rankTier} archetype=${MKT_META.portland.archetypeId} blackPop=${MKT_META.portland.blackPop} urbanBonus=${MKT_META.portland.urbanBonus}`,
  );
  console.log(
    `  derived blackMusicStrength=${eco26.blackMusicStrength?.toFixed(3)} urbanContemporaryStrength=${eco26.urbanContemporaryStrength?.toFixed(3)}`,
  );
  console.log(
    `  shipped gates: small=${bpInfo.shippedSmallUrbanGate} west_fm=${bpInfo.shippedWestFmGate} combined=${bpInfo.shippedMarketUrbanGate}\n`,
  );

  console.log('=== Portland dial / pipeline ===');
  console.log(`  MARKET_BP_PATCH: none | fragmentationLaunches: ${bpInfo.fragLaunches} | tierUsesDialScaling: ${bpInfo.tierUsesDial}`);
  const urbanBp = bpInfo.rows.filter(
    (r) => URBAN_FMTS.includes(r.effectiveFmt) || URBAN_FMTS.includes(r.nationalFmt),
  );
  if (urbanBp.length) console.log('  Urban-ish BP slots:', urbanBp);
  else console.log('  No URBAN/SOUL in effective national blueprint for portland');
  console.log('  @1985 open urban:', JSON.stringify(trace1985.atGen));
  console.log('  @2026 urban roster:', JSON.stringify(trace2026.urbanStations));
  console.log('  @2026 leader:', trace2026.leader);

  const allVariants = {};

  for (const vid of VARIANTS) {
    console.log(`\n=== Variant ${vid}: ${VARIANT_LABELS[vid]} ===`);
    const ctx = loadCtx(vid);
    const rows = runSimGrid(ctx, ALL_MARKETS, PORTLAND_YEARS);
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) console.error(`  ${bad.length} failed — ${bad[0]?.err}`);

    const pYears = {};
    for (const y of PORTLAND_YEARS) {
      const s = summarizeMarketYear(rows, 'portland', y, catalog);
      if (!s) continue;
      pYears[y] = s;
      console.log(
        `  ${y}: URBAN ${s.urbanFamilyPct.toFixed(1)}% | SOUL ${s.soulSharePct.toFixed(1)} UC ${s.ucSharePct.toFixed(1)} RHY ${s.rhSharePct.toFixed(1)} | GOSPEL ${s.gospelSharePct.toFixed(1)}% PUBLIC ${s.publicSharePct.toFixed(1)}% | #1 ${s.leaderHist}`,
      );
    }
    allVariants[vid] = { label: VARIANT_LABELS[vid], portland: pYears };

    const ctrl = {};
    for (const mid of CONTROL_MARKETS) {
      const s = summarizeMarketYear(rows, mid, 2026, catalog);
      if (s) {
        ctrl[mid] = {
          urbanFamilyPct: s.urbanFamilyPct,
          ucSharePct: s.ucSharePct,
          aaaSharePct: (s.fmtSumMean.AAA ?? 0) * 100,
          altSharePct: (s.fmtSumMean.ALT_ROCK ?? 0) * 100,
          leaderHist: s.leaderHist,
        };
      }
    }
    allVariants[vid].controls2026 = ctrl;
  }

  const baseline = allVariants.A?.portland?.[2026];
  const best = allVariants.E?.portland?.[2026];

  console.log('\n=== Before/after @2026 (Portland book share %) ===');
  console.log('Variant | URBAN fam | UC | SOUL | RHY | GOSPEL | PUBLIC | ADULT | COUNTRY | #1');
  for (const vid of VARIANTS) {
    const s = allVariants[vid]?.portland?.[2026];
    if (!s) {
      console.log(`${vid} | —`);
      continue;
    }
    console.log(
      `${vid} | ${s.urbanFamilyPct.toFixed(1)} | ${s.ucSharePct.toFixed(1)} | ${s.soulSharePct.toFixed(1)} | ${s.rhSharePct.toFixed(1)} | ${s.gospelSharePct.toFixed(1)} | ${s.publicSharePct.toFixed(1)} | ${s.adultPct.toFixed(1)} | ${s.countryPct.toFixed(1)} | ${s.leaderHist}`,
    );
  }

  console.log('\n=== Controls @2026 (A vs E) ===');
  for (const mid of CONTROL_MARKETS) {
    const a = allVariants.A?.controls2026?.[mid];
    const e = allVariants.E?.controls2026?.[mid];
    if (!a || !e) continue;
    const d = e.urbanFamilyPct - a.urbanFamilyPct;
    console.log(
      `  ${mid}: urban A=${a.urbanFamilyPct.toFixed(1)}% E=${e.urbanFamilyPct.toFixed(1)}% (Δ${d >= 0 ? '+' : ''}${d.toFixed(1)}) UC A=${a.ucSharePct.toFixed(1)}% #1 A:${a.leaderHist}`,
    );
  }

  const recommendation = {
    primaryMechanism:
      'National timeline rival-URBAN_CONTEMP (1983) pre-applied at genMarketMP cold start (startYear>1970) and during sim — same Wichita-class artifact. Portland is rankTier large: no tier inject, no MARKET_BP_PATCH, no fragmentationLaunches. UC is not market-identity (PNW AAA/Alt/Public); ecology urbanContemporaryStrength ~0.23 does not justify ~15% book.',
    demographicsJustified: false,
    variantFindings: {},
    bestMinimalFix: '',
    scope: '',
  };

  if (baseline && best) {
    recommendation.variantFindings = {
      A_baseline_uc: baseline.ucSharePct,
      E_combined_uc: best.ucSharePct,
      B: allVariants.B?.portland?.[2026]?.ucSharePct,
      C: allVariants.C?.portland?.[2026]?.ucSharePct,
      D: allVariants.D?.portland?.[2026]?.ucSharePct,
    };
    recommendation.bestMinimalFix =
      'Extend low-Black west_fm_fragmented gate (blackPop<0.15, urbanBonus<=0.06) to formatAllowed + cold-start pre-rival + applyEv rival substitute (AAA/ADULT_CONTEMP/ALT_ROCK/CLASSIC_HITS). Generalize to Seattle/Portland — not Portland-only mkStn remap.';
    recommendation.scope =
      'west_fm_fragmented + blackPop<0.15 (Seattle qualifies; Atlanta/NYC do not). Phoenix/sunbelt use different archetype — keep separate Hispanic/urban tuning.';
  }

  const artifact = {
    recordedAt: new Date().toISOString(),
    runs: RUNS,
    seed: SEED,
    portlandYears: PORTLAND_YEARS,
    blueprint: bpInfo,
    genTrace: { at1985: trace1985, at2026: trace2026 },
    ecology: { portland: { static: MKT_META.portland, derived2026: eco26 } },
    variants: allVariants,
    recommendation,
    decompositionByYear: Object.fromEntries(PORTLAND_YEARS.map((y) => [y, allVariants.A?.portland?.[y]])),
  };

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${outJson}`);
  console.log('\nRecommendation:', recommendation.bestMinimalFix);
}

main();
