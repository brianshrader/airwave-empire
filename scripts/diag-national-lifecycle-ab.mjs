#!/usr/bin/env node
/**
 * National lifecycle influence A/B — scales national-era appeal multipliers toward neutral in-vm only.
 * Does not modify shipped src/legacy.js.
 *
 *   node scripts/diag-national-lifecycle-ab.mjs
 *
 * Variants: A=1.0, B=0.75, C=0.50, D=0.25 national lifecycle weight on deviations from 1.0
 * in appl() era curves (FORMAT_SUNSET, hits/CHR lineage, fmMusicEraPreferenceMult, aaaEraLift).
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

const MARKETS = ['wichita', 'nashville', 'portland', 'miami', 'phoenix', 'atlanta'];
const YEARS = [1995, 2000, 2006, 2010, 2020, 2026];
const RUNS = 8;
const SEED = 20260515;
const ERA = '1985';
const MAX_STEPS = 240;
const PERIOD = 1;

const VARIANT_SCALE = { A: 1, B: 0.75, C: 0.5, D: 0.25 };

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function patchLegacyNationalLifecycleScale(src, scale) {
  if (scale >= 0.999) return src;
  const prelude = `
globalThis.__WL_NATIONAL_LIFECYCLE_SCALE__=${scale};
function __wlNatM(m){var s=globalThis.__WL_NATIONAL_LIFECYCLE_SCALE__;if(s>=1||m==null||!Number.isFinite(m))return m;return 1+(m-1)*s;}
`;
  let out = prelude + src;
  out = out.replace(
    'function aaaEraLift(year){',
    'function aaaEraLift(year){',
  );
  out = out.replace(
    'return Math.max(0.875,Math.min(0.95,1.0-0.075*_smoothstep(2010,2026,y)));',
    'return __wlNatM(Math.max(0.875,Math.min(0.95,1.0-0.075*_smoothstep(2010,2026,y))));',
  );
  out = out.replace(
    'return Math.min(1.62, 1 + (inner - 1) * frag);',
    'return __wlNatM(Math.min(1.62, 1 + (inner - 1) * frag));',
  );
  out = out.replace(
    'hitsLineageEraMult*=Math.max(0.88,1-erosion);',
    'hitsLineageEraMult*=Math.max(0.88,1-erosion*(globalThis.__WL_NATIONAL_LIFECYCLE_SCALE__||1));',
  );
  out = out.replace(
    'chrLineageBucketAppealEraMult01=chrLineageBucketAppealEraMult(marketId,mkt,year,G);',
    'chrLineageBucketAppealEraMult01=__wlNatM(chrLineageBucketAppealEraMult(marketId,mkt,year,G));',
  );
  out = out.replace(
    "else if(year>fs2.peak){\n      eraMult=Math.max(0.02,1-_smoothstep(fs2.peak,fs2.dead,year)*0.98);\n    }\n  }",
    "else if(year>fs2.peak){\n      eraMult=Math.max(0.02,1-_smoothstep(fs2.peak,fs2.dead,year)*0.98*(globalThis.__WL_NATIONAL_LIFECYCLE_SCALE__||1));\n    }\n  }",
  );
  out = out.replace(
    'else if(year>fs2.peak){',
    'else if(year>fs2.peak){',
  );
  out = out.replace(
    'if(year>=fs2.dead){eraMult=0.02;}',
    'if(year>=fs2.dead){eraMult=1-(1-0.02)*(globalThis.__WL_NATIONAL_LIFECYCLE_SCALE__||1);}',
  );
  out = out.replace(
    'hitsLineageEraMult=broadTight*fmYouth*phoenixDiagTop40HitsAppealMult(marketId,year);',
    'hitsLineageEraMult=__wlNatM(broadTight*fmYouth*phoenixDiagTop40HitsAppealMult(marketId,year));',
  );
  out = out.replace(
    'aaaEraAppealMult*=1+(0.40*plT+0.62*plT*plT)*yrW;',
    'aaaEraAppealMult*=__wlNatM(1+(0.40*plT+0.62*plT*plT)*yrW);',
  );
  out = out.replace(
    'aaaEraAppealMult=aaaEraLift(year);',
    'aaaEraAppealMult=__wlNatM(aaaEraLift(year));',
  );
  out = out.replace(
    'const out=Math.max(0, aff * q * eff * amP * atl * sp * sat * strm * simBonus * driftMod * morHeritageHybridMult * hitsLineageEraMult * chrLineageBucketAppealEraMult01 * eraMult * oldiesAgeMult * fmMusPref * fmLeaderAppealTrim * franchiseDemoMult(s,coh,G) * mktFmt * allNewsSig * zombieNicheMult * staffingAutomationAppealTradeoffMult(s,G)*brokeredAppealTradeoffMult(s,G)*aaaEraAppealMult);',
    'const out=Math.max(0, aff * q * eff * amP * atl * sp * sat * strm * simBonus * driftMod * morHeritageHybridMult * __wlNatM(hitsLineageEraMult) * __wlNatM(chrLineageBucketAppealEraMult01) * __wlNatM(eraMult) * oldiesAgeMult * __wlNatM(fmMusPref) * fmLeaderAppealTrim * franchiseDemoMult(s,coh,G) * mktFmt * allNewsSig * zombieNicheMult * staffingAutomationAppealTradeoffMult(s,G)*brokeredAppealTradeoffMult(s,G)*aaaEraAppealMult);',
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
  querySelectorAll() { return [] },
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

function rockBucket(fmtSum) {
  return (fmtSum.ALBUM_ROCK || 0) + (fmtSum.CLASSIC_ROCK || 0) + (fmtSum.ALT_ROCK || 0) + (fmtSum.AAA || 0);
}

function acBucket(fmtSum) {
  return (fmtSum.ADULT_CONTEMP || 0) + (fmtSum.HOT_AC || 0);
}

function spanishBucket(fmtSum) {
  let t = fmtSum.SPANISH || 0;
  for (const k of Object.keys(fmtSum)) {
    if (k.startsWith('SPANISH_')) t += fmtSum[k];
  }
  return t;
}

function publicBucket(st, sh) {
  let t = 0;
  for (const s of st) {
    if (!s || s._bpSlotDeferred) continue;
    const sh = Number(s.rat?.share) || 0;
    const rf = String(s.format || '');
    if (s.isPublic || rf.startsWith('PUBLIC_')) t += sh;
  }
  return t;
}

function loadCtx(scale) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let src = readFileSync(legacyPath, 'utf8');
  src = injectHeadlessMegaFragNewsGuard(src);
  src = patchLegacyNationalLifecycleScale(src, scale);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 180_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function runAllMarkets(ctx, marketIds) {
  const salts = {};
  for (const m of marketIds) salts[m] = marketSalt(m);
  const spanishFmtExact = [...SPANISH_LANGUAGE_FORMAT_IDS];
  const spanishFmtPrefixes = [...SPANISH_LANGUAGE_FORMAT_PREFIXES];
  const inner = `
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
        if(G.year>targetYear||(G.year===targetYear&&G.period>targetPeriod)) return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==targetPeriod) return {ok:false,err:'miss'};
      var book=sortBook(eligibleBookStations(G));
      var fmtSum={}, chr=0, ctry=0, pub=0, hhi=0, chrLeaderShare=0;
      for(var j=0;j<book.length;j++){
        var st=book[j];
        var sh=Number(st.rat&&st.rat.share)||0;
        hhi+=sh*sh;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        if(isChrLineageFmt(st.format)){
          if(sh>chrLeaderShare)chrLeaderShare=sh;
        }
        chr+=chrLaneShare(st);
        if(String(st.format||'')==='COUNTRY')ctry+=sh;
        if(st.isPublic||String(st.format||'').indexOf('PUBLIC_')===0)pub+=sh;
      }
      var lead=book[0]||null;
      return {
        ok:true, fmtSum:fmtSum, chrTotal:chr, country:ctry, publicShare:pub,
        hhi_x10000:hhi*10000, chrLeaderShare:chrLeaderShare,
        leaderFmtKey:lead?fmtKey(lead.format):'',
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
            rows.push({ marketId:mktId, year:y, run:run, ok:r.ok, err:r.err||'',
              fmtSum:r.fmtSum, chrTotal:r.chrTotal, country:r.country, publicShare:r.publicShare,
              hhi_x10000:r.hhi_x10000, chrLeaderShare:r.chrLeaderShare, leaderFmtKey:r.leaderFmtKey });
          }
        }
      }
      return rows;
    };
  })();
  `;
  return vm.runInContext(inner, ctx)(marketIds, YEARS, PERIOD, RUNS, SEED, MAX_STEPS);
}

const MKT_META = {
  wichita: { rankTier: 'small', archetypeId: 'midwest_legacy', culture: { country: 0.14, urban: 0.04, newsTalk: 0.05, religion: 0.09, spanish: 0.04 }, countryBonus: 0.1, blackPop: 0.11, churchGoing: 0.52, eduIndex: 0.9, publicCivicIndex: 0.94, fmPenBias: -0.04, fmMusicFragMult: 0.98 },
  nashville: { rankTier: 'medium', archetypeId: 'southern_country', culture: { country: 0.26, urban: 0.03, newsTalk: 0.04, religion: 0.1, spanish: 0.02 }, countryBonus: 0.18, blackPop: 0.18, churchGoing: 0.58, eduIndex: 0.88, publicCivicIndex: 0.96, fmPenBias: -0.058, fmMusicFragMult: 0.96 },
  portland: { rankTier: 'large', archetypeId: 'west_fm_fragmented', culture: { country: 0.08, urban: 0.06, newsTalk: 0.1, religion: 0.04, spanish: 0.06 }, countryBonus: 0.07, blackPop: 0.062, churchGoing: 0.34, eduIndex: 1.14, publicCivicIndex: 1.1, fmPenBias: 0.044, fmMusicFragMult: 1.05 },
  miami: { rankTier: 'large', archetypeId: 'sunbelt_diversified', culture: { country: 0.04, urban: 0.11, newsTalk: 0.06, religion: 0.07, spanish: 0.28 }, countryBonus: 0.04, blackPop: 0.185, churchGoing: 0.41, eduIndex: 0.93, publicCivicIndex: 0.94, fmPenBias: 0.052, fmMusicFragMult: 1.09, hispPop2020: 0.475 },
  phoenix: { rankTier: 'large', archetypeId: 'sunbelt_diversified', culture: { country: 0.09, urban: 0.03, newsTalk: 0.07, religion: 0.09, spanish: 0.15 }, countryBonus: 0.09, blackPop: 0.071, churchGoing: 0.46, eduIndex: 0.93, publicCivicIndex: 0.94, fmPenBias: 0.03, fmMusicFragMult: 1.03, hispPop2020: 0.301 },
  atlanta: { rankTier: 'large', archetypeId: 'sunbelt_diversified', culture: { country: 0.09, urban: 0.06, newsTalk: 0.1, religion: 0.04, spanish: 0.06 }, countryBonus: 0, blackPop: 0.358, churchGoing: 0.54, eduIndex: 0.9, publicCivicIndex: 0.94, fmPenBias: -0.02, fmMusicFragMult: 0.98 },
};

function summarize(rows, marketId, year) {
  const list = rows.filter((r) => r.ok && r.marketId === marketId && r.year === year);
  if (!list.length) return null;
  const n = list.length;
  const hist = {};
  for (const r of list) {
    const k = r.leaderFmtKey || '?';
    hist[k] = (hist[k] || 0) + 1;
  }
  const histStr = Object.keys(hist)
    .sort((a, b) => hist[b] - hist[a])
    .map((k) => `${k}:${hist[k]}`)
    .join('|');

  const fmtMeans = {};
  for (const r of list) {
    for (const [k, v] of Object.entries(r.fmtSum || {})) {
      if (!fmtMeans[k]) fmtMeans[k] = [];
      fmtMeans[k].push(v);
    }
  }
  const fmtAvg = {};
  for (const [k, arr] of Object.entries(fmtMeans)) fmtAvg[k] = mean(arr);

  const mktRow = { id: marketId, ...MKT_META[marketId] };
  const eco = deriveMarketEcology(mktRow, marketId, year, null);
  const top40Wins = list.filter((r) => r.leaderFmtKey === 'TOP40').length / n;
  const mismatchTop40 = classifyTop40Mismatch(top40Wins, expectedFormatLeadershipProfile(eco, year).top40ChrWeight);
  const chr = mean(list.map((r) => r.chrTotal));
  const chrFlags = joinMismatchFlags(
    classifyChrBucketMismatch(chr, expectedChrBucketStrengthByEra(year, eco), year),
    classifyChrConcentrationMismatch(
      mean(list.map((r) => r.chrLeaderShare)),
      expectedChrLeaderShareCap(year, eco),
    ),
  );

  return {
    countryPct: mean(list.map((r) => r.country)) * 100,
    rockPct: mean(list.map((r) => rockBucket(r.fmtSum || {}))) * 100,
    acPct: mean(list.map((r) => acBucket(r.fmtSum || {}))) * 100,
    chrPct: chr * 100,
    publicPct: mean(list.map((r) => r.publicShare)) * 100,
    spanishPct: mean(list.map((r) => spanishBucket(r.fmtSum || {}))) * 100,
    aaaPct: mean(list.map((r) => (r.fmtSum?.AAA || 0))) * 100,
    hhi: mean(list.map((r) => r.hhi_x10000)),
    histStr,
    top40Mismatch: mismatchTop40 || null,
    chrFlags: chrFlags || null,
  };
}

function main() {
  console.log('National lifecycle A/B — appl() era national mults scaled toward 1.0');
  console.log(`Markets: ${MARKETS.join(', ')} | ${RUNS} runs/cell | seed=${SEED}\n`);

  const all = {};
  for (const [vid, scale] of Object.entries(VARIANT_SCALE)) {
    const label =
      vid === 'A'
        ? 'A baseline (100% national lifecycle in appl)'
        : `B/C/D national lifecycle weight ${(scale * 100).toFixed(0)}%`;
    console.log(`\n========== Variant ${vid}: ${label} ==========\n`);
    const ctx = loadCtx(scale);
    const rows = runAllMarkets(ctx, MARKETS);
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) console.error(`  ${bad.length} failed — sample: ${bad[0]?.err}`);

    all[vid] = { scale, byMarket: {} };
    for (const mid of MARKETS) {
      const y2026 = summarize(rows, mid, 2026);
      all[vid].byMarket[mid] = { 2026: y2026 };
      if (!y2026) continue;
      console.log(
        `${mid} 2026: ctry=${y2026.countryPct.toFixed(1)}% rock=${y2026.rockPct.toFixed(1)}% AC=${y2026.acPct.toFixed(1)}% chr=${y2026.chrPct.toFixed(1)}% pub=${y2026.publicPct.toFixed(1)}% esp=${y2026.spanishPct.toFixed(1)}% AAA=${y2026.aaaPct.toFixed(1)}% HHI≈${y2026.hhi.toFixed(0)}`,
      );
      console.log(`         #1 ${y2026.histStr}${y2026.chrFlags ? ` | ${y2026.chrFlags}` : ''}`);
    }
  }

  const spotlight = [
    { key: 'wichita', field: 'countryPct', label: 'Wichita country%' },
    { key: 'portland', field: 'publicPct', label: 'Portland public%' },
    { key: 'portland', field: 'aaaPct', label: 'Portland AAA%' },
    { key: 'miami', field: 'spanishPct', label: 'Miami Spanish%' },
    { key: 'nashville', field: 'countryPct', label: 'Nashville country%' },
  ];

  console.log('\n========== Spotlight @2026 (local identity vs national scale) ==========\n');
  console.log('Metric\tA\tB(75%)\tC(50%)\tD(25%)');
  for (const sp of spotlight) {
    const row = [sp.label];
    for (const vid of ['A', 'B', 'C', 'D']) {
      const v = all[vid]?.byMarket?.[sp.key]?.[2026]?.[sp.field];
      row.push(v != null ? v.toFixed(1) : '—');
    }
    console.log(row.join('\t'));
  }

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(
    path.join(root, 'tmp', 'national_lifecycle_ab.json'),
    `${JSON.stringify({ recordedAt: new Date().toISOString(), runs: RUNS, seed: SEED, results: all }, null, 2)}\n`,
  );
  console.log('\nWrote tmp/national_lifecycle_ab.json');
  console.log(
    '\nNote: formatLifecycleCore.js priors are not wired to gameplay yet; this test scales legacy appl() national era curves (FORMAT_SUNSET, FM/CHR/AAA national lifts).',
  );
}

main();
