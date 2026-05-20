#!/usr/bin/env node
/**
 * Portland leadership correction A/B — in-vm patches only (no shipped legacy.js changes).
 *
 * Variants:
 *   A  Baseline
 *   B  Portland formatLifecycle COUNTRY modernRetention (0.38) on appl mktFmt
 *   C  west_fm_fragmented + chrResistance TOP40 peakability (1990–1999 + modern path)
 *   D  Light public/AAA leader nudge (high publicRadioStrength + west_fm_fragmented)
 *   E  B + C + D combined
 *
 *   npm run diag:portland-leadership-correction
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  aggregateFmtSumToFamilyShares,
  canonicalFormatId,
  familyForFormat,
  loadFormatFamiliesCatalog,
} from './formatFamilyHelpers.mjs';
import { aggregateMeansToLeadershipBuckets } from './expectedFormatLeadershipProfile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'portland_leadership_correction_ab.json');

const MARKETS = ['portland', 'seattle', 'phoenix', 'atlanta'];
const YEARS = [1975, 1985, 1995, 2005, 2026];
const RUNS = 12;
const SEED = 20260518;
const ERA = '1970';
const MAX_STEPS = 340;
const PERIOD = 1;

const VARIANT_FLAGS = { A: 0, B: 1, C: 2, D: 4, E: 7 };

const ROCK_AAA_FMTS = new Set(['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK', 'AAA']);
const PUBLIC_FMT_PREFIX = 'PUBLIC_';

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

/** Injected before legacy — variant flags on globalThis.__WL_PDX_LEAD_FLAGS__ (bits: B=1, C=2, D=4). */
const LEAD_CORR_PRELUDE = `
globalThis.__WL_PDX_LEAD_FLAGS__=globalThis.__WL_PDX_LEAD_FLAGS__||0;

function __wlIsWestFmFragmented(marketId){
  const m=MARKETS[marketId||'']||{};
  return /west_fm_fragmented/i.test(String(m.archetypeId||''));
}

/** Variant B: Portland COUNTRY lifecycle modernRetention (profile override 0.38 vs national 0.8). */
function __wlDiagCountryLifecycleMktFmt(marketId,year){
  if(!(globalThis.__WL_PDX_LEAD_FLAGS__&1))return 1;
  if(marketId!=='portland')return 1;
  const y=Math.round(Number(year))||1970;
  const peak=2005, plateauEnd=2015, declineEnd=2026;
  const modernRetention=0.38;
  const historicStrength=0.72;
  let nationalDecline=0;
  if(y>plateauEnd){
    nationalDecline=_smoothstep(plateauEnd,declineEnd,y);
  }else if(y>peak){
    nationalDecline=_smoothstep(peak,plateauEnd,y)*0.35;
  }
  const retentionCurve=y>peak
    ?modernRetention+(1-modernRetention)*(1-nationalDecline)
    :historicStrength+(1-historicStrength)*_smoothstep(1960,peak,y);
  const damp=1-0.42*nationalDecline*(1-modernRetention/0.8);
  const histBoost=1+0.06*(historicStrength-0.5)*(y<peak?1:0.35);
  return Math.max(0.78,Math.min(1.08,damp*histBoost*retentionCurve));
}

/** Variant C: extend 90s TOP40 leader trim to west_fm_fragmented + chrResistance. */
function westFmFragTop40LeaderTrimProfile(marketId,year,eco){
  if(!(globalThis.__WL_PDX_LEAD_FLAGS__&2)){
    return {active:false,bypassTraitGate:false,eraGate:0,maxTrimCap:0.11,extraTrimTerm:0};
  }
  const y=Math.round(Number(year))||1970;
  if(!__wlIsWestFmFragmented(marketId)||!eco)return {active:false,bypassTraitGate:false,eraGate:0,maxTrimCap:0.11,extraTrimTerm:0};
  const chrR=Number(eco.chrResistance)||0;
  if(y>=1990&&y<=1999&&chrR>=0.52){
    const eraGate=_smoothstep(1990,1996,y);
    return {active:true,bypassTraitGate:chrR>=0.53,eraGate,maxTrimCap:0.16,extraTrimTerm:0.024*eraGate};
  }
  if(y>=2000&&chrR>=0.58){
    const eraGate=_smoothstep(2000,2005,y)*(y<2005?1:(0.32+0.68*_smoothstep(2005,2018,y)));
    return {active:true,bypassTraitGate:false,eraGate,maxTrimCap:0.13,extraTrimTerm:0.012*eraGate};
  }
  return {active:false,bypassTraitGate:false,eraGate:0,maxTrimCap:0.11,extraTrimTerm:0};
}

/** Variant D: leader-only nudge toward public / AAA when close behind (book total ~unchanged). */
function applyWestFmPublicAaaLeaderNudge(stations,G,activeIx,engageWeightedPop,habitDenom){
  if(!(globalThis.__WL_PDX_LEAD_FLAGS__&4))return;
  const mid=G.marketId||ACTIVE_MARKET;
  if(!__wlIsWestFmFragmented(mid))return;
  const mkt=MARKETS[mid]||{};
  const eco=marketEcologySnapshotForGameplay(mid,mkt,Math.round(Number(G?.year))||1970,G);
  if(!eco||(Number(eco.publicRadioStrength)||0)<0.72)return;
  const y=Math.round(Number(G?.year))||1970;
  if(y<1995)return;
  const comm=[];
  for(let k=0;k<activeIx.length;k++){
    const s=stations[activeIx[k]];
    if(s&&!stationIsNoncommercialInstitutional(s))comm.push(s);
  }
  if(comm.length<3)return;
  let leader=null,leaderSh=0;
  for(let i=0;i<comm.length;i++){
    const sh=Number(comm[i].rat?.share)||0;
    if(sh>leaderSh){leaderSh=sh;leader=comm[i];}
  }
  if(!leader||leaderSh<0.06)return;
  const leadFmt=String(leader.format||'');
  if(leadFmt!=='TOP40'&&leadFmt!=='COUNTRY'&&leadFmt!=='URBAN_CONTEMP')return;
  const targets=comm.filter(s=>{
    const f=String(s.format||'');
    return s.isPublic||f.indexOf('PUBLIC_')===0||f==='AAA'||f==='ALT_ROCK';
  });
  if(!targets.length)return;
  let best=null,bestSh=0;
  for(let i=0;i<targets.length;i++){
    const sh=Number(targets[i].rat?.share)||0;
    if(sh>bestSh){bestSh=sh;best=targets[i];}
  }
  if(!best||leaderSh-bestSh>0.028)return;
  if(leaderSh-bestSh<0.004)return;
  const gap=leaderSh-bestSh;
  const nudge=Math.min(0.022,gap*0.55+0.006)*_smoothstep(1995,2010,y);
  const bestRatio=(bestSh+nudge)/Math.max(1e-9,bestSh);
  const leadRatio=(leaderSh-nudge*0.85)/Math.max(1e-9,leaderSh);
  if(bestRatio<1.002&&leadRatio>0.998)return;
  scaleStationListeningShares(best,G,best,bestRatio,engageWeightedPop,habitDenom);
  scaleStationListeningShares(leader,G,leader,leadRatio,engageWeightedPop,habitDenom);
}
`;

function patchLegacyForLeadershipCorrection(src) {
  let out = LEAD_CORR_PRELUDE + injectHeadlessMegaFragNewsGuard(src);

  out = out.replace(
    'function phoenixDiagTop40LeaderTrimProfile(marketId,year){',
    `function phoenixDiagTop40LeaderTrimProfile(marketId,year){
  const eco=typeof marketEcologySnapshotForGameplay==='function'
    ?marketEcologySnapshotForGameplay(marketId,MARKETS[marketId||'']||MARKETS.atlanta,year,null)
    :null;
  const wff=typeof westFmFragTop40LeaderTrimProfile==='function'
    ?westFmFragTop40LeaderTrimProfile(marketId,year,eco):null;
  if(wff&&wff.active)return wff;`,
  );

  out = out.replace(
    `  if(s.format==='COUNTRY'){
    mktFmt+=(mkt.countryBonus||0)*0.38+(cult.country||0)*0.38;
    if(marketId==='losangeles')mktFmt-=0.17;
    if(marketId==='newyork')mktFmt-=0.125;
    if(marketId==='chicago')mktFmt-=0.035;
  }`,
    `  if(s.format==='COUNTRY'){
    mktFmt+=(mkt.countryBonus||0)*0.38+(cult.country||0)*0.38;
    if(marketId==='losangeles')mktFmt-=0.17;
    if(marketId==='newyork')mktFmt-=0.125;
    if(marketId==='chicago')mktFmt-=0.035;
    if(typeof __wlDiagCountryLifecycleMktFmt==='function')mktFmt*=__wlDiagCountryLifecycleMktFmt(marketId,year);
  }`,
  );

  const trimCall =
    '    applyModernTop40LeaderPeakabilityTrim(stations,G,activeIx,engageWeightedPop,postAqhDenom);\n    applyListeningHoursShareFromAqh(stations,G);';
  const trimCallPatched =
    '    applyModernTop40LeaderPeakabilityTrim(stations,G,activeIx,engageWeightedPop,postAqhDenom);\n    applyWestFmPublicAaaLeaderNudge(stations,G,activeIx,engageWeightedPop,postAqhDenom);\n    applyListeningHoursShareFromAqh(stations,G);';

  if (!out.includes(trimCallPatched)) {
    out = out.replace(trimCall, trimCallPatched);
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
  body: { innerHTML: '', classList: { toggle() {} }, appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  documentElement: { style: {}, dataset: {} },
  createElement() { return stubEl(); },
  getElementById() { return stubEl(); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext(flags) {
  const noop = () => {};
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error, table: noop },
    __WL_HEADLESS__: true,
    __WL_PDX_LEAD_FLAGS__: flags,
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
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
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

function loadCtx(flags) {
  const ctx = createVmContext(flags);
  injectMarketEcologyIife(ctx);
  vm.runInContext(patchLegacyForLeadershipCorrection(readFileSync(legacyPath, 'utf8')), ctx, {
    filename: 'legacy.js',
    timeout: 180_000,
  });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function runSimulation(ctx) {
  const salts = Object.fromEntries(MARKETS.map((m) => [m, marketSalt(m)]));
  const inner = `
  (function(){
    var SALTS = ${JSON.stringify(salts)};
    var GEN_ERA = ${JSON.stringify(ERA)};
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
      if(typeof sanitizeStationShareForRanking==='function'){
        for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
      }
      list.sort(function(a,b){
        var sa=a.rat&&a.rat.share||0,sb=b.rat&&b.rat.share||0;
        if(Math.abs(sb-sa)>1e-9)return sb-sa;
        return String(a.id).localeCompare(String(b.id));
      });
      return list;
    }
    function isPublicFmt(st){
      var f=String(st.format||'');
      return !!(st.isPublic||f.indexOf('PUBLIC_')===0);
    }
    function isAaaAltFmt(fmt){
      var f=String(fmt||'');
      return f==='AAA'||f==='ALT_ROCK';
    }
    function isRockAaaFmt(fmt){
      var f=String(fmt||'');
      return f==='AAA'||f==='ALT_ROCK'||f==='ALBUM_ROCK'||f==='CLASSIC_ROCK';
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
      var fmtSum={}, hhi=0, ctry=0, top40=0, pub=0, aaa=0, rockAaa=0;
      for(var j=0;j<book.length;j++){
        var st=book[j];
        var sh=Number(st.rat&&st.rat.share)||0;
        hhi+=sh*sh;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        if(String(st.format||'')==='COUNTRY')ctry+=sh;
        if(fk==='TOP40')top40+=sh;
        if(isPublicFmt(st))pub+=sh;
        if(String(st.format||'')==='AAA')aaa+=sh;
        if(isRockAaaFmt(st.format))rockAaa+=sh;
      }
      var lead=book[0]||null;
      var leadFmt=lead?String(lead.format):'';
      var leadKey=lead?fmtKey(lead.format):'';
      return {
        ok:true, fmtSum:fmtSum, hhi_x10000:hhi*10000,
        country:ctry, top40:top40, publicShare:pub, aaaShare:aaa, rockAaaShare:rockAaa,
        leaderFmtRaw:leadFmt, leaderFmtKey:leadKey,
        leaderIsPublic:isPublicFmt(lead||{}),
        leaderIsAaaAlt:isAaaAltFmt(leadFmt),
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
            rows.push({marketId:mktId,year:y,run:run,result:r});
          }
        }
      }
      return rows;
    };
  })();
  `;
  return vm.runInContext(inner, ctx)(MARKETS, YEARS, PERIOD, RUNS, SEED, MAX_STEPS);
}

function summarizeCell(rows, marketId, year, catalog) {
  const ok = rows.filter((r) => r.result?.ok && r.marketId === marketId && r.year === year);
  if (!ok.length) return null;
  const n = ok.length;

  const fmtHist = {};
  const famHist = {};
  const fmtAgg = {};

  for (const row of ok) {
    const r = row.result;
    const k = r.leaderFmtKey || '?';
    fmtHist[k] = (fmtHist[k] || 0) + 1;
    const fam = familyForFormat(r.leaderFmtRaw, catalog) || 'UNMAPPED';
    famHist[fam] = (famHist[fam] || 0) + 1;
    for (const [fmt, sh] of Object.entries(r.fmtSum || {})) {
      const cid = canonicalFormatId(fmt, catalog);
      fmtAgg[cid] = (fmtAgg[cid] || 0) + (Number(sh) || 0);
    }
  }

  const fmtMean = {};
  for (const [k, v] of Object.entries(fmtAgg)) fmtMean[k] = v / n;

  const famMean = aggregateFmtSumToFamilyShares(
    Object.fromEntries(Object.entries(fmtMean).map(([k, v]) => [k, v])),
    catalog,
  ).familyShares;

  const lb = aggregateMeansToLeadershipBuckets(
    Object.entries(fmtMean).map(([k, m]) => ({ k, m })),
  ).buckets;

  return {
    runs: n,
    hhi: mean(ok.map((r) => r.result.hhi_x10000)),
    countryPct: mean(ok.map((r) => r.result.country)) * 100,
    top40Pct: mean(ok.map((r) => r.result.top40)) * 100,
    publicPct: mean(ok.map((r) => r.result.publicShare)) * 100,
    aaaPct: mean(ok.map((r) => r.result.aaaShare)) * 100,
    rockAaaPct: mean(ok.map((r) => r.result.rockAaaShare)) * 100,
    familyShares: famMean,
    leadershipBuckets: lb,
    top40Num1Wins: ok.filter((r) => r.result.leaderFmtKey === 'TOP40').length,
    countryNum1Wins: ok.filter((r) => r.result.leaderFmtKey === 'COUNTRY').length,
    publicNum1Wins: ok.filter((r) => r.result.leaderIsPublic).length,
    aaaAltNum1Wins: ok.filter((r) => r.result.leaderIsAaaAlt).length,
    leaderFmtHistogram: fmtHist,
    leaderFamilyHistogram: famHist,
    topFormats: Object.entries(fmtMean)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([format, share]) => ({ format, share })),
  };
}

function histStr(h) {
  return Object.entries(h)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join(' ');
}

function famStr(fam) {
  return Object.entries(fam)
    .filter(([, v]) => v > 0.001)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`)
    .join(' | ');
}

function printPortlandSpotlight(all, year) {
  console.log(`\n--- Portland @ ${year} (leadership focus) ---`);
  console.log(
    'Var | HHI | CTRY% | #1CTRY | TOP40% | #1T40 | PUB% | #1PUB | AAA% | #1AAA | #1 format hist | #1 family hist',
  );
  for (const vid of ['A', 'B', 'C', 'D', 'E']) {
    const s = all[vid]?.portland?.[year];
    if (!s) continue;
    console.log(
      [
        vid,
        s.hhi?.toFixed(0) ?? '—',
        s.countryPct?.toFixed(1),
        `${s.countryNum1Wins}/${s.runs}`,
        s.top40Pct?.toFixed(1),
        `${s.top40Num1Wins}/${s.runs}`,
        s.publicPct?.toFixed(1),
        `${s.publicNum1Wins}/${s.runs}`,
        s.aaaPct?.toFixed(1),
        `${s.aaaAltNum1Wins}/${s.runs}`,
        histStr(s.leaderFmtHistogram),
        histStr(s.leaderFamilyHistogram),
      ].join(' | '),
    );
  }
}

function printControlDelta(all, marketId, year) {
  const a = all.A?.[marketId]?.[year];
  const e = all.E?.[marketId]?.[year];
  if (!a || !e) return;
  console.log(
    `  ${marketId} ${year}: HHI ${a.hhi?.toFixed(0)}→${e.hhi?.toFixed(0)} | ctry ${a.countryPct?.toFixed(1)}%→${e.countryPct?.toFixed(1)}% | #1CTRY ${a.countryNum1Wins}→${e.countryNum1Wins} | #1T40 ${a.top40Num1Wins}→${e.top40Num1Wins} | pub ${a.publicPct?.toFixed(1)}%→${e.publicPct?.toFixed(1)}%`,
  );
}

function main() {
  console.log('Portland leadership correction A/B (in-vm only)');
  console.log(`Markets: ${MARKETS.join(', ')} | Years: ${YEARS.join(', ')} | ${RUNS} runs/cell | era=${ERA}\n`);

  const catalog = loadFormatFamiliesCatalog();
  const all = {};

  for (const [vid, flags] of Object.entries(VARIANT_FLAGS)) {
    const labels = {
      A: 'Baseline',
      B: 'Portland COUNTRY lifecycle modernRetention',
      C: 'west_fm_fragmented chrResistance TOP40 trim',
      D: 'Light public/AAA leader nudge',
      E: 'Combined B+C+D',
    };
    console.log(`\n========== Variant ${vid}: ${labels[vid]} (flags=${flags}) ==========\n`);
    const ctx = loadCtx(flags);
    const rows = runSimulation(ctx);
    const fails = rows.filter((r) => !r.result?.ok);
    if (fails.length) console.warn(`  ${fails.length} failed runs (sample: ${fails[0]?.result?.err})`);

    all[vid] = {};
    for (const mid of MARKETS) {
      all[vid][mid] = {};
      for (const y of YEARS) {
        const s = summarizeCell(rows, mid, y, catalog);
        all[vid][mid][y] = s;
        if (!s) continue;
        if (mid === 'portland' && (y === 1995 || y === 2026)) {
          console.log(
            `  portland ${y}: HHI≈${s.hhi.toFixed(0)} | fam: ${famStr(s.familyShares)} | #1fmt ${histStr(s.leaderFmtHistogram)} | #1fam ${histStr(s.leaderFamilyHistogram)}`,
          );
        }
      }
    }
  }

  for (const y of [1995, 2026]) printPortlandSpotlight(all, y);

  console.log('\n========== Control markets: A → E (book-share drift) ==========\n');
  for (const mid of ['seattle', 'phoenix', 'atlanta']) {
    for (const y of [1995, 2026]) printControlDelta(all, mid, y);
  }

  console.log('\n========== Answer: leadership vs book shares (Portland) ==========\n');
  const p95a = all.A?.portland?.[1995];
  const p95e = all.E?.portland?.[1995];
  const p26a = all.A?.portland?.[2026];
  const p26e = all.E?.portland?.[2026];
  if (p95a && p95e) {
    console.log(
      `1995: TOP40 #1 wins ${p95a.top40Num1Wins}→${p95e.top40Num1Wins} | TOP40 share ${p95a.top40Pct.toFixed(1)}%→${p95e.top40Pct.toFixed(1)}% | HHI ${p95a.hhi.toFixed(0)}→${p95e.hhi.toFixed(0)}`,
    );
  }
  if (p26a && p26e) {
    console.log(
      `2026: COUNTRY #1 wins ${p26a.countryNum1Wins}→${p26e.countryNum1Wins} | COUNTRY share ${p26a.countryPct.toFixed(1)}%→${p26e.countryPct.toFixed(1)}% | PUBLIC #1 ${p26a.publicNum1Wins}→${p26e.publicNum1Wins} | PUBLIC share ${p26a.publicPct.toFixed(1)}%→${p26e.publicPct.toFixed(1)}%`,
    );
  }

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(
    outJson,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        markets: MARKETS,
        years: YEARS,
        runs: RUNS,
        seed: SEED,
        era: ERA,
        variants: VARIANT_FLAGS,
        results: all,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nWrote ${outJson}`);
}

main();
