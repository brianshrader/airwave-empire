#!/usr/bin/env node
/**
 * Nashville dial A/B split — patches MARKETS.nashville in-vm per variant, runs ecology regression cells.
 *   node scripts/diag-nashville-dial-split.mjs
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
  aggregateMeansToLeadershipBuckets,
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

const BASELINE_FM = [
  '93.1 FM',
  '94.1 FM',
  '96.3 FM',
  '97.9 FM',
  '100.1 FM',
  '102.9 FM',
  '104.5 FM',
  '105.1 FM',
  '107.5 FM',
];
const NCE_FM = ['88.3 FM', '90.3 FM', '91.1 FM'];
const COMM_FM = ['100.3 FM', '103.3 FM'];

const FM_FACILITY = {
  '88.3 FM': '50kw',
  '90.3 FM': '50kw',
  '91.1 FM': '50kw',
  '93.1 FM': '100kw',
  '94.1 FM': '100kw',
  '96.3 FM': '50kw',
  '97.9 FM': '100kw',
  '100.1 FM': '50kw',
  '100.3 FM': '50kw',
  '102.9 FM': '100kw',
  '103.3 FM': '50kw',
  '104.5 FM': '50kw',
  '105.1 FM': '50kw',
  '107.5 FM': '50kw',
};

const VARIANTS = {
  A: {
    label: 'A baseline (9 FM)',
    fmFreqs: [...BASELINE_FM],
  },
  B: {
    label: 'B baseline + NCE only',
    fmFreqs: [...NCE_FM, ...BASELINE_FM],
  },
  C: {
    label: 'C baseline + commercial only (100.3, 103.3)',
    fmFreqs: [
      '93.1 FM',
      '94.1 FM',
      '96.3 FM',
      '97.9 FM',
      '100.1 FM',
      '100.3 FM',
      '102.9 FM',
      '103.3 FM',
      '104.5 FM',
      '105.1 FM',
      '107.5 FM',
    ],
  },
  D: {
    label: 'D full scaffold (NCE + commercial)',
    fmFreqs: [...NCE_FM, ...BASELINE_FM.slice(0, 5), '100.3 FM', ...BASELINE_FM.slice(5, 6), '103.3 FM', ...BASELINE_FM.slice(6)],
  },
};

function buildFmFacility(fmFreqs) {
  const out = {};
  for (const f of fmFreqs) {
    if (!FM_FACILITY[f]) throw new Error(`missing facility for ${f}`);
    out[f] = FM_FACILITY[f];
  }
  return out;
}

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
    querySelector() {
      return null;
    },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    getAttribute() {
      return null;
    },
    setAttribute() {},
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() {
    return stubEl();
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

function patchNashvilleDial(ctx, fmFreqs) {
  const fac = buildFmFacility(fmFreqs);
  vm.runInContext(
    `(function(){
      var m=MARKETS.nashville;
      m.fmFreqs=${JSON.stringify(fmFreqs)};
      m.fmFacilityByFreq=${JSON.stringify(fac)};
    })();`,
    ctx,
  );
}

function runVariantRows(ctx) {
  const mid = 'nashville';
  const salt = marketSalt(mid);
  const spanishFmtExact = [...SPANISH_LANGUAGE_FORMAT_IDS];
  const spanishFmtPrefixes = [...SPANISH_LANGUAGE_FORMAT_PREFIXES];
  const innerFixed = `
  (function(){
    var SALTS = ${JSON.stringify({ [mid]: salt })};
    var GEN_ERA = ${JSON.stringify(ERA)};
    var SPANISH_LANG_FMT_EXACT = ${JSON.stringify(spanishFmtExact)};
    var SPANISH_LANG_FMT_PREFIXES = ${JSON.stringify(spanishFmtPrefixes)};
    function isSpanishLanguageFormat(fmt){
      var raw=String(fmt||'').trim().toUpperCase();
      if(!raw)return false;
      for(var i=0;i<SPANISH_LANG_FMT_EXACT.length;i++){
        if(SPANISH_LANG_FMT_EXACT[i]===raw)return true;
      }
      for(var j=0;j<SPANISH_LANG_FMT_PREFIXES.length;j++){
        if(raw.indexOf(SPANISH_LANG_FMT_PREFIXES[j])===0)return true;
      }
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
      MP.mode='solo';
      MP.isHost=false;
      if(MP.players)MP.players=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===targetYear&&G.period===targetPeriod)break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>targetPeriod))
          return {ok:false,err:'overshoot',atYear:G.year,atPeriod:G.period,steps:steps};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==targetPeriod)
        return {ok:false,err:'miss',atYear:G.year,atPeriod:G.period,steps:steps};
      var book=sortBook(eligibleBookStations(G));
      var fmtSum={}, chr=0, ctry=0, talk=0, pub=0, gos=0, hhi=0;
      var chrLineageCount=0, chrLeaderShare=0;
      var span=0;
      for(var j=0;j<book.length;j++){
        var st=book[j];
        var sh=Number(st.rat&&st.rat.share)||0;
        hhi+=sh*sh;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        if(isChrLineageFmt(st.format)){
          chrLineageCount++;
          if(sh>chrLeaderShare)chrLeaderShare=sh;
        }
        chr+=chrLaneShare(st);
        var rf=String(st.format||'');
        if(rf==='COUNTRY')ctry+=sh;
        if(rf==='NEWS_TALK'||rf==='SPORTS_TALK'||rf==='PERSONALITY_TALK'||rf==='ALL_NEWS')talk+=sh;
        if(st.isPublic||rf.indexOf('PUBLIC_')===0)pub+=sh;
        if(rf==='GOSPEL')gos+=sh;
        if(isSpanishLanguageFormat(rf))span+=sh;
      }
      var lead=book[0]||null;
      var sh1=lead?Number(lead.rat.share)||0:0;
      var sh2=book.length>1?Number(book[1].rat.share)||0:0;
      return {
        ok:true,
        fmtSum:fmtSum,
        chrTotal:chr,
        chrLineageCount:chrLineageCount,
        chrLeaderShare:chrLeaderShare,
        country:ctry,
        newsTalk:talk,
        publicShare:pub,
        gospelShare:gos,
        spanishLanguageShare:span,
        hhi_x10000:hhi*10000,
        gap12:sh1-sh2,
        leaderFmtKey:lead?fmtKey(lead.format):'',
      };
    }
    return function runAll(markets,years,targetPeriod,numRuns,baseSeed,maxSteps){
      var rows=[];
      var origR=Math.random;
      for(var mi=0;mi<markets.length;mi++){
        var mktId=markets[mi];
        var salt=SALTS[mktId]||0;
        for(var yi=0;yi<years.length;yi++){
          var y=years[yi];
          for(var run=0;run<numRuns;run++){
            var s0=baseSeed+salt*17+y*10007+run*9973;
            (function(seedVal){
              var s=seedVal;
              Math.random=function(){
                s=(s*9301+49297)%233280;
                return s/233280;
              };
            })(s0);
            var r;
            try{
              r=sampleOneRun(mktId,y,targetPeriod,maxSteps);
            }catch(e){
              r={ok:false,err:String(e&&e.message||e)};
            }finally{
              Math.random=origR;
            }
            rows.push({
              marketId:mktId,
              year:y,
              run:run,
              ok:r.ok,
              err:r.err||'',
              fmtSum:r.fmtSum,
              chrTotal:r.chrTotal,
              chrLineageCount:r.chrLineageCount,
              chrLeaderShare:r.chrLeaderShare,
              country:r.country,
              newsTalk:r.newsTalk,
              publicShare:r.publicShare,
              leaderFmtKey:r.leaderFmtKey,
              hhi_x10000:r.hhi_x10000,
            });
          }
        }
      }
      return rows;
    };
  })();
  `;
  const runAll = vm.runInContext(innerFixed, ctx);
  return runAll([mid], YEARS, PERIOD, RUNS, SEED, MAX_STEPS);
}

function summarizeVariant(variantId, label, rows) {
  const MARKETS = null;
  const okRows = rows.filter((r) => r.ok);
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) {
    console.error(`[${variantId}] ${bad.length} failed runs`, bad.slice(0, 3));
  }
  const byYear = {};
  for (const y of YEARS) {
    const list = okRows.filter((r) => r.year === y);
    if (!list.length) continue;
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

    const mktRow = vm.runInContext('MARKETS.nashville', createVmContext());
    // ecology from static row in legacy - use derive with patched row passed via last run ctx
    // Re-derive from legacy file row (culture unchanged across variants)
    const legacyMkt = JSON.parse(
      readFileSync(legacyPath, 'utf8').match(/nashville:\{[\s\S]*?teams:\[[\s\S]*?\],\s*\}/)?.[0]
        ? 'null'
        : 'null',
    );

    const fmtMeans = new Map();
    for (const r of list) {
      const o = r.fmtSum || {};
      for (const k of Object.keys(o)) {
        if (!fmtMeans.has(k)) fmtMeans.set(k, []);
        fmtMeans.get(k).push(o[k]);
      }
    }
    const fmtAgg = [];
    for (const [k, arr] of fmtMeans) fmtAgg.push({ k, m: mean(arr) });
    fmtAgg.sort((a, b) => b.m - a.m);

    const ecology = deriveMarketEcology(
      {
        id: 'nashville',
        rankTier: 'medium',
        culture: { country: 0.26, urban: 0.03, newsTalk: 0.04, religion: 0.1, spanish: 0.02 },
        blackPop: 0.18,
        hispPop2020: 0.095,
        countryBonus: 0.18,
        eduIndex: 0.88,
        publicCivicIndex: 0.96,
        fmPenBias: -0.058,
        fmMusicFragMult: 0.96,
      },
      'nashville',
      y,
      null,
    );
    const expectedChrBucket = expectedChrBucketStrengthByEra(y, ecology);
    const expectedChrLeaderCap = expectedChrLeaderShareCap(y, ecology);
    const expProf = expectedFormatLeadershipProfile(ecology, y);
    const top40Wins = list.filter((r) => (r.leaderFmtKey || '') === 'TOP40').length;
    const actualTop40WinRate = n ? top40Wins / n : 0;
    const mismatchTop40 = classifyTop40Mismatch(actualTop40WinRate, expProf.top40ChrWeight);
    const chrBucketTotal = mean(list.map((r) => r.chrTotal));
    const mismatchChrBucket = classifyChrBucketMismatch(chrBucketTotal, expectedChrBucket, y);
    const chrLeaderMean = mean(list.map((r) => r.chrLeaderShare));
    const mismatchChrConc = classifyChrConcentrationMismatch(chrLeaderMean, expectedChrLeaderCap);
    const chrFlags = joinMismatchFlags(mismatchChrBucket, mismatchChrConc);

    byYear[y] = {
      hhi: mean(list.map((r) => r.hhi_x10000)),
      countryPct: mean(list.map((r) => r.country)) * 100,
      publicPct: mean(list.map((r) => r.publicShare)) * 100,
      chrPct: mean(list.map((r) => r.chrTotal)) * 100,
      histKeyStr,
      top40WinPct: actualTop40WinRate * 100,
      mismatchTop40: mismatchTop40 || null,
      chrFlags: chrFlags || null,
    };
  }
  return { variantId, label, fmCount: VARIANTS[variantId].fmFreqs.length, byYear };
}

function loadCtxAndRun(variantId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  patchNashvilleDial(ctx, VARIANTS[variantId].fmFreqs);
  return runVariantRows(ctx);
}

function main() {
  console.log(`Nashville dial split — ${RUNS} runs/cell, seed=${SEED}, era=${ERA}\n`);
  const results = {};
  for (const id of ['A', 'B', 'C', 'D']) {
    const label = VARIANTS[id].label;
    const fm = VARIANTS[id].fmFreqs;
    console.log(`--- Variant ${id}: ${label} (${fm.length} FM) ---`);
    console.log(`    ${fm.join(', ')}`);
    const rows = loadCtxAndRun(id);
    const ok = rows.filter((r) => r.ok);
    const byYear = {};
    for (const y of YEARS) {
      const list = ok.filter((r) => r.year === y);
      if (!list.length) continue;
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
      const ecology = deriveMarketEcology(
        {
          id: 'nashville',
          rankTier: 'medium',
          archetypeId: 'southern_country',
          culture: { country: 0.26, urban: 0.03, newsTalk: 0.04, religion: 0.1, spanish: 0.02 },
          blackPop: 0.18,
          hispPop1970: 0.008,
          hispPop2000: 0.045,
          hispPop2020: 0.095,
          countryBonus: 0.18,
          eduIndex: 0.88,
          publicCivicIndex: 0.96,
          fmPenBias: -0.058,
          fmMusicFragMult: 0.96,
        },
        'nashville',
        y,
        null,
      );
      const expProf = expectedFormatLeadershipProfile(ecology, y);
      const top40Wins = list.filter((r) => (r.leaderFmtKey || '') === 'TOP40').length;
      const actualTop40WinRate = top40Wins / n;
      const mismatchTop40 = classifyTop40Mismatch(actualTop40WinRate, expProf.top40ChrWeight);
      const chrBucketTotal = mean(list.map((r) => r.chrTotal));
      const mismatchChrBucket = classifyChrBucketMismatch(
        chrBucketTotal,
        expectedChrBucketStrengthByEra(y, ecology),
        y,
      );
      const chrLeaderMean = mean(list.map((r) => r.chrLeaderShare));
      const mismatchChrConc = classifyChrConcentrationMismatch(
        chrLeaderMean,
        expectedChrLeaderShareCap(y, ecology),
      );
      const chrFlags = joinMismatchFlags(mismatchChrBucket, mismatchChrConc);
      byYear[y] = {
        hhi: mean(list.map((r) => r.hhi_x10000)),
        countryPct: mean(list.map((r) => r.country)) * 100,
        publicPct: mean(list.map((r) => r.publicShare)) * 100,
        chrPct: mean(list.map((r) => r.chrTotal)) * 100,
        histKeyStr,
        top40WinPct: actualTop40WinRate * 100,
        mismatchTop40: mismatchTop40 || null,
        chrFlags: chrFlags || null,
      };
      console.log(
        `  ${y}: HHI≈${byYear[y].hhi.toFixed(0)} ctry=${byYear[y].countryPct.toFixed(1)}% pub=${byYear[y].publicPct.toFixed(1)}% chr=${byYear[y].chrPct.toFixed(1)}% | #1 ${histKeyStr}` +
          (mismatchTop40 ? ` | TOP40_MISMATCH=${mismatchTop40} (${byYear[y].top40WinPct.toFixed(0)}%)` : '') +
          (chrFlags ? ` | ${chrFlags}` : ''),
      );
    }
    results[id] = { label, fmCount: fm.length, fmFreqs: fm, byYear };
    console.log('');
  }
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(
    path.join(root, 'tmp', 'nashville_dial_split.json'),
    `${JSON.stringify({ recordedAt: new Date().toISOString(), runs: RUNS, seed: SEED, results }, null, 2)}\n`,
    'utf8',
  );
  console.log('Wrote tmp/nashville_dial_split.json');
}

main();
