#!/usr/bin/env node
/**
 * Wichita country-generation A/B — in-vm patches only (does not modify shipped legacy.js).
 *   node scripts/diag-wichita-country-ab.mjs
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  classifyChrBucketMismatch,
  classifyChrConcentrationMismatch,
  deriveMarketEcology,
  expectedChrBucketStrengthByEra,
  expectedChrLeaderShareCap,
} from '../src/marketEcology.js';
import {
  classifyTop40Mismatch,
  expectedFormatLeadershipProfile,
} from './expectedFormatLeadershipProfile.mjs';
import {
  SPANISH_LANGUAGE_FORMAT_IDS,
  SPANISH_LANGUAGE_FORMAT_PREFIXES,
} from './spanishLanguageFormats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

const YEARS = [1995, 2000, 2006, 2010, 2020, 2026];
const RUNS = 8;
const SEED = 20260515;
const ERA = '1985';
const MAX_STEPS = 240;
const PERIOD = 1;

const BASELINE_DIAL_BP = {
  3: { fmt: 'ALBUM_ROCK', pw: '50kw' },
  6: { fmt: 'GOSPEL', pw: '25kw' },
  10: { fmt: 'TOP40', pw: '50kw' },
  11: { fmt: 'ALBUM_ROCK', pw: '25kw' },
  12: { fmt: 'GOSPEL', pw: '25kw' },
  13: { fmt: 'COUNTRY', pw: '50kw' },
  17: { fmt: 'GOSPEL', pw: '10kw' },
};

/** B1: BP11 ALBUM_ROCK→COUNTRY FM. B2: also BP13 str strong (used if B1 gen-OK). */
const VARIANT_B1_DIAL_BP = {
  ...BASELINE_DIAL_BP,
  11: { fmt: 'COUNTRY', pw: '50kw', str: 'moderate' },
};
const VARIANT_B2_DIAL_BP = {
  ...VARIANT_B1_DIAL_BP,
  13: { fmt: 'COUNTRY', pw: '50kw', str: 'strong' },
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

function joinMismatchFlags(...flags) {
  return flags.filter(Boolean).join('|');
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function rockBucketFromFmtSum(fmtSum) {
  const keys = ['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK', 'AAA'];
  let t = 0;
  for (const k of keys) t += fmtSum[k] || 0;
  return t;
}

function acBucketFromFmtSum(fmtSum) {
  return (fmtSum.ADULT_CONTEMP || 0) + (fmtSum.HOT_AC || 0);
}

/** Variant C/D: country-priority tier inject for midwest_legacy or countryStrength >= 0.55 */
const INJECT_ORDER_PATCH = `
(function(){
  if(typeof injectTierMarketCommercialExtras!=='function'||injectTierMarketCommercialExtras.__wlCountryAbPatched)return;
  var _orig=injectTierMarketCommercialExtras;
  function tierInjectListForMarket(marketId,bpYear){
    var base=TIER_MARKET_INJECT_BP.slice();
    var m=MARKETS[marketId||'']||{};
    var useMidwest=String(m.archetypeId||'')==='midwest_legacy';
    var useEco=false;
    if(!useMidwest&&typeof __wlDeriveMarketEcology==='function'){
      try{
        var eco=__wlDeriveMarketEcology(m,marketId,bpYear||1985,null);
        useEco=eco&&typeof eco.countryStrength==='number'&&eco.countryStrength>=0.55;
      }catch(_e){}
    }
    if(!useMidwest&&!useEco)return base;
    var out=base.slice();
    var ci=-1;
    for(var i=0;i<out.length;i++){ if(out[i].fmt==='COUNTRY'){ ci=i; break; } }
    if(ci>1){
      var c=out.splice(ci,1)[0];
      out.splice(1,0,c);
    }
    return out;
  }
  injectTierMarketCommercialExtras=function(stations,dialCtx,bpYear,commercialTarget){
    if(!stations||!dialCtx||!tierUsesDialScaling(dialCtx.marketId))return;
    var INJECT= tierInjectListForMarket(dialCtx.marketId,bpYear);
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
      stations.push(mkStn({type:spec.type,fmt:spec.fmt,pw:spec.pw,str:spec.str},freq,bpYear));
    }
  };
  injectTierMarketCommercialExtras.__wlCountryAbPatched=true;
})();
`;

function applyVariant(ctx, variantId) {
  if (variantId === 'B' || variantId === 'D') {
    vm.runInContext(
      `
      MARKETS.wichita.dialBpAmToFm = {
        3: { fmt: 'ALBUM_ROCK', pw: '50kw' },
        6: { fmt: 'GOSPEL', pw: '25kw' },
        10: { fmt: 'TOP40', pw: '50kw' },
        11: { fmt: 'COUNTRY', pw: '50kw', str: 'moderate' },
        12: { fmt: 'GOSPEL', pw: '25kw' },
        13: { fmt: 'COUNTRY', pw: '50kw', str: 'strong' },
        17: { fmt: 'GOSPEL', pw: '10kw' },
      };
      `,
      ctx,
    );
  }
  if (variantId === 'C' || variantId === 'D') {
    vm.runInContext(INJECT_ORDER_PATCH, ctx);
  }
}

function loadCtx(variantId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  applyVariant(ctx, variantId);
  return ctx;
}

function runMarkets(ctx, marketIds) {
  const salts = {};
  for (const m of marketIds) salts[m] = marketSalt(m);
  const spanishFmtExact = [...SPANISH_LANGUAGE_FORMAT_IDS];
  const spanishFmtPrefixes = [...SPANISH_LANGUAGE_FORMAT_PREFIXES];
  const innerFixed = `
  (function(){
    var SALTS = ${JSON.stringify(salts)};
    var GEN_ERA = ${JSON.stringify(ERA)};
    var SPANISH_LANG_FMT_EXACT = ${JSON.stringify(spanishFmtExact)};
    var SPANISH_LANG_FMT_PREFIXES = ${JSON.stringify(spanishFmtPrefixes)};
    function isSpanishLanguageFormat(fmt){
      var raw=String(fmt||'').trim().toUpperCase();
      if(!raw)return false;
      for(var i=0;i<SPANISH_LANG_FMT_EXACT.length;i++) if(SPANISH_LANG_FMT_EXACT[i]===raw)return true;
      for(var j=0;j<SPANISH_LANG_FMT_PREFIXES.length;j++) if(raw.indexOf(SPANISH_LANG_FMT_PREFIXES[j])===0)return true;
      return false;
    }
    function eligibleBookStations(G){
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
    function isChrLineageFmt(fmt){
      var raw=String(fmt||'');
      if(raw==='RHYTHMIC'||raw==='HOT_AC'||raw==='CHR')return true;
      return fmtKey(fmt)==='TOP40';
    }
    function chrLaneShare(s){
      if(!isChrLineageFmt(s.format))return 0;
      return Number(s.rat&&s.rat.share)||0;
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
      var book=sortBook(eligibleBookStations(G));
      var fmtSum={}, chr=0, ctry=0, hhi=0, chrLeaderShare=0;
      for(var j=0;j<book.length;j++){
        var st=book[j];
        var sh=Number(st.rat&&st.rat.share)||0;
        hhi+=sh*sh;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        if(isChrLineageFmt(st.format)&&sh>chrLeaderShare)chrLeaderShare=sh;
        chr+=chrLaneShare(st);
        if(String(st.format||'')==='COUNTRY')ctry+=sh;
      }
      var lead=book[0]||null;
      return {
        ok:true, fmtSum:fmtSum, chrTotal:chr, country:ctry, hhi_x10000:hhi*10000,
        chrLeaderShare:chrLeaderShare, leaderFmtKey:lead?fmtKey(lead.format):'',
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
            rows.push({
              marketId:mktId, year:y, run:run, ok:r.ok, err:r.err||'',
              fmtSum:r.fmtSum, chrTotal:r.chrTotal, country:r.country,
              hhi_x10000:r.hhi_x10000, chrLeaderShare:r.chrLeaderShare,
              leaderFmtKey:r.leaderFmtKey,
            });
          }
        }
      }
      return rows;
    };
  })();
  `;
  const runAll = vm.runInContext(innerFixed, ctx);
  return runAll(marketIds, YEARS, PERIOD, RUNS, SEED, MAX_STEPS);
}

function summarizeYear(rows, marketId, year) {
  const list = rows.filter((r) => r.ok && r.marketId === marketId && r.year === year);
  if (!list.length) return null;
  const n = list.length;
  const histKey = {};
  for (const r of list) {
    const k = r.leaderFmtKey || '?';
    histKey[k] = (histKey[k] || 0) + 1;
  }
  const histKeyStr = Object.keys(histKey)
    .sort((a, b) => histKey[b] - histKey[a])
    .map((k) => `${k}:${histKey[k]}`)
    .join('|');

  const rock = mean(list.map((r) => rockBucketFromFmtSum(r.fmtSum || {})));
  const ac = mean(list.map((r) => acBucketFromFmtSum(r.fmtSum || {})));
  const ctry = mean(list.map((r) => r.country));
  const chr = mean(list.map((r) => r.chrTotal));
  const hhi = mean(list.map((r) => r.hhi_x10000));
  const chrLeader = mean(list.map((r) => r.chrLeaderShare));

  const mktRow = {
    id: marketId,
    rankTier: marketId === 'wichita' ? 'small' : marketId === 'nashville' ? 'medium' : 'large',
    archetypeId:
      marketId === 'wichita'
        ? 'midwest_legacy'
        : marketId === 'nashville'
          ? 'southern_country'
          : 'sunbelt_diversified',
    culture:
      marketId === 'wichita'
        ? { country: 0.14, urban: 0.04, newsTalk: 0.05, religion: 0.09, spanish: 0.04 }
        : marketId === 'nashville'
          ? { country: 0.26, urban: 0.03, newsTalk: 0.04, religion: 0.1, spanish: 0.02 }
          : { country: 0.09, urban: 0.06, newsTalk: 0.1, religion: 0.04, spanish: 0.06 },
    blackPop: marketId === 'wichita' ? 0.11 : marketId === 'nashville' ? 0.18 : 0.358,
    countryBonus: marketId === 'wichita' ? 0.1 : marketId === 'nashville' ? 0.18 : 0,
    churchGoing: marketId === 'wichita' ? 0.52 : marketId === 'nashville' ? 0.58 : 0.54,
    eduIndex: 0.9,
    publicCivicIndex: 0.94,
    fmPenBias: marketId === 'wichita' ? -0.04 : -0.02,
    fmMusicFragMult: 0.98,
  };
  const ecology = deriveMarketEcology(mktRow, marketId, year, null);
  const top40Wins = list.filter((r) => r.leaderFmtKey === 'TOP40').length;
  const mismatchTop40 = classifyTop40Mismatch(top40Wins / n, expectedFormatLeadershipProfile(ecology, year).top40ChrWeight);
  const mismatchChrBucket = classifyChrBucketMismatch(chr, expectedChrBucketStrengthByEra(year, ecology), year);
  const mismatchChrConc = classifyChrConcentrationMismatch(chrLeader, expectedChrLeaderShareCap(year, ecology));
  const chrFlags = joinMismatchFlags(mismatchChrBucket, mismatchChrConc);

  return {
    countryPct: ctry * 100,
    rockPct: rock * 100,
    acPct: ac * 100,
    chrPct: chr * 100,
    hhi,
    histKeyStr,
    top40Mismatch: mismatchTop40,
    chrFlags: chrFlags || null,
    countryStrength: ecology.countryStrength,
  };
}

const VARIANT_LABELS = {
  A: 'A baseline runtime',
  B: 'B dialBpAmToFm only (BP11→COUNTRY moderate, BP13 COUNTRY strong)',
  C: 'C inject-order only (midwest_legacy or countryStrength≥0.55)',
  D: 'D combined B+C',
};

function main() {
  console.log(`Wichita country A/B — ${RUNS} runs/cell, seed=${SEED}, era=${ERA}\n`);
  const allResults = {};

  for (const vid of ['A', 'B', 'C', 'D']) {
    console.log(`=== ${VARIANT_LABELS[vid]} ===`);
    const ctx = loadCtx(vid);
    const rows = runMarkets(ctx, ['wichita']);
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) {
      console.error(`  ${bad.length} failed runs — sample: ${bad[0].err}`);
    }

    const byYear = {};
    for (const y of YEARS) {
      const s = summarizeYear(rows, 'wichita', y);
      if (!s) continue;
      byYear[y] = s;
      if (y === 2026) {
        console.log(
          `  2026: ctry=${s.countryPct.toFixed(1)}% rock=${s.rockPct.toFixed(1)}% AC=${s.acPct.toFixed(1)}% chr=${s.chrPct.toFixed(1)}% HHI≈${s.hhi.toFixed(0)} | #1 ${s.histKeyStr}` +
            (s.top40Mismatch ? ` | TOP40_${s.top40Mismatch}` : '') +
            (s.chrFlags ? ` | ${s.chrFlags}` : ''),
        );
      }
    }
    allResults[vid] = { label: VARIANT_LABELS[vid], wichita: byYear };
    console.log('');
  }

  console.log('=== Control markets @2026 (inject-order variants C & D) ===');
  for (const vid of ['A', 'C', 'D']) {
    const ctx = loadCtx(vid);
    const rows = runMarkets(ctx, ['nashville', 'atlanta']);
    console.log(`--- Variant ${vid} ---`);
    for (const mid of ['nashville', 'atlanta']) {
      const s = summarizeYear(rows, mid, 2026);
      if (!s) continue;
      console.log(
        `  ${mid}: ctry=${s.countryPct.toFixed(1)}% rock=${s.rockPct.toFixed(1)}% AC=${s.acPct.toFixed(1)}% HHI≈${s.hhi.toFixed(0)} countryStr=${s.countryStrength.toFixed(2)} | #1 ${s.histKeyStr}` +
          (s.chrFlags ? ` | ${s.chrFlags}` : ''),
      );
    }
  }

  console.log('\n=== 2026 comparison table (Wichita) ===');
  console.log('Var | Country% | Rock% | AC% | CHR% | HHI | #1 histogram');
  for (const vid of ['A', 'B', 'C', 'D']) {
    const s = allResults[vid]?.wichita?.[2026];
    if (!s) {
      console.log(`${vid} | (no data — gen failures)`);
      continue;
    }
    console.log(
      `${vid} | ${s.countryPct.toFixed(1)} | ${s.rockPct.toFixed(1)} | ${s.acPct.toFixed(1)} | ${s.chrPct.toFixed(1)} | ${s.hhi.toFixed(0)} | ${s.histKeyStr}`,
    );
  }

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(
    path.join(root, 'tmp', 'wichita_country_ab.json'),
    `${JSON.stringify({ recordedAt: new Date().toISOString(), runs: RUNS, seed: SEED, results: allResults }, null, 2)}\n`,
    'utf8',
  );
  console.log('\nWrote tmp/wichita_country_ab.json');
}

main();
