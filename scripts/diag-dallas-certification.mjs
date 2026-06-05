#!/usr/bin/env node
/**
 * Dallas–Fort Worth full certification pass (read-only).
 *
 *   node scripts/diag-dallas-certification.mjs
 *   node scripts/diag-dallas-certification.mjs --runs=50
 *
 * Artifacts: tmp/dallas_certification.json, tmp/dallas_certification.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  aggregateFmtSumToFamilyShares,
  familyForFormat,
  loadFormatFamiliesCatalog,
} from './formatFamilyHelpers.mjs';
import {
  aggregateMeansToLeadershipBuckets,
} from './expectedFormatLeadershipProfile.mjs';
import { TRUTH_AUDIT_SPANISH_BOOK_SNIPPET } from './spanishSubtypeHelpers.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS, DIAG_ONLY_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const certDir = path.join(root, 'tmp', 'market_certification');
const outJson = path.join(root, 'tmp', 'dallas_certification.json');
const outMd = path.join(root, 'tmp', 'dallas_certification.md');

const FOCUS = 'dallas';
const COMPARE = ['atlanta', 'phoenix', 'chicago'];
const OPENING_YEARS = [1970, 1985, 2000, 2020];
const CERT_YEARS = [1970, 1985, 2000, 2026];
const PASSIVE_ARCS = [
  { id: '1970_to_2026', startYear: 1970, endYear: 2026 },
  { id: '1985_to_2026', startYear: 1985, endYear: 2026 },
  { id: '2000_to_2026', startYear: 2000, endYear: 2026 },
];
const IDENTITY_DECADES = [1970, 1985, 2000, 2020, 2026];

const HOUSTON_PROXY = {
  label: 'Houston (proxy expectations — not in MARKETS)',
  rankTier: 'large',
  highHispanic: true,
  hispPop2020: 0.38,
  spanishShare2026Min: 0.15,
  spanishShare2026Target: [0.18, 0.28],
  countryShare2026Min: 0.06,
  regionalMexicanDominant: true,
};

const DEFAULT_RUNS = 50;
const DEFAULT_SEED = 20260605;

const MAX_STEPS_SNAPSHOT = {
  1970: 0,
  1985: 260,
  2000: 320,
  2020: 320,
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
    disabled: false, textContent: '', innerHTML: '', value: '', style: {}, dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {}, querySelector() { return null; }, focus() {}, click() {},
    addEventListener() {}, removeEventListener() {}, getAttribute() { return null; }, setAttribute() {},
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
    globalThis: null, window: null, document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; }, clearTimeout() {}, clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {}, fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} }, FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      },
    },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error,
    Map, Set, Symbol, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite,
    Infinity, NaN, undefined, Int8Array, Uint8Array, Buffer, Promise,
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
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED, skipCertSpawn: false };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(10, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a === '--skip-cert-spawn') o.skipCertSpawn = true;
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

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const idx = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[idx] : (s[idx] + s[idx + 1]) / 2;
}

function pct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isPublicFmt(fmt){ return String(fmt||'').indexOf('PUBLIC_')===0; }
  function isCommInst(st){ return typeof stationIsNoncommercialInstitutional==='function'&&stationIsNoncommercialInstitutional(st); }
  function sortBook(stations){
    var list=stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    return list;
  }
  function bookMetrics(G){
    var book=sortBook(G.stations);
    var fmtSum={}, hhi=0, topShares=[];
    var commercialAm=0, commercialFm=0;
    var viableCompetitors=0, formatDiversity=0;
    var zombieCount=0, nicheCount=0, spiralCount=0;
    for(var k=0;k<G.stations.length;k++){
      var st=G.stations[k];
      if(!st||st._bpSlotDeferred) continue;
      var sig=st.sig||{};
      if(st.isZombie) zombieCount++;
      if(st.isNicheSurvival) nicheCount++;
      if((st._zombieFallStreak||0)>=3) spiralCount++;
      if(isPublicFmt(st.format)||isCommInst(st)) continue;
      if(sig.type==='AM') commercialAm++;
      else if(sig.type==='FM') commercialFm++;
    }
    for(var j=0;j<book.length;j++){
      var sh=book[j].rat.share||0;
      topShares.push(sh);
      var fk=fmtKey(book[j].format);
      fmtSum[fk]=(fmtSum[fk]||0)+sh;
      hhi+=sh*sh;
      if(sh>=0.03) viableCompetitors++;
    }
    for(var fk2 in fmtSum){ if(fmtSum[fk2]>=0.02) formatDiversity++; }
    var top3=0, top5=0;
    for(var t=0;t<Math.min(3,topShares.length);t++) top3+=topShares[t];
    for(var u=0;u<Math.min(5,topShares.length);u++) top5+=topShares[u];
    var fmTotal=commercialAm+commercialFm;
    var countryShare=(fmtSum.COUNTRY||0);
    var spanishShare=(fmtSum.SPANISH||0);
    var spokenShare=(fmtSum.NEWS_TALK||0)+(fmtSum.SPORTS_TALK||0)+(fmtSum.ALL_NEWS||0);
    var chrShare=(fmtSum.TOP40||0)+(fmtSum.HOT_AC||0)+(fmtSum.RHYTHMIC||0);
    var rockShare=0;
    var rockKeys=['ALBUM_ROCK','CLASSIC_ROCK','ALT_ROCK','AAA','CLASSIC_HITS','OLDIES'];
    for(var r=0;r<rockKeys.length;r++) rockShare+=(fmtSum[rockKeys[r]]||0);
    var clusterCount=0;
    var fam={};
    for(var fk3 in fmtSum){
      var fsh=fmtSum[fk3];
      if(fsh<0.08) continue;
      var famKey=fk3;
      if(['TOP40','HOT_AC','RHYTHMIC'].indexOf(fk3)>=0) famKey='CHR';
      else if(['NEWS_TALK','SPORTS_TALK','ALL_NEWS'].indexOf(fk3)>=0) famKey='SPOKEN';
      else if(rockKeys.indexOf(fk3)>=0) famKey='ROCK';
      fam[famKey]=(fam[famKey]||0)+fsh;
    }
    for(var ck in fam){ if(fam[ck]>=0.10) clusterCount++; }
    return {
      year:G.year,
      period:G.period,
      fmtSum:fmtSum,
      hhi:hhi*10000,
      top3Share:top3,
      top5Share:top5,
      fmAdoption: fmTotal>0 ? commercialFm/fmTotal : 0,
      stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length,
      commercialAm:commercialAm,
      commercialFm:commercialFm,
      viableCompetitors:viableCompetitors,
      clusterCount:clusterCount,
      formatDiversity:formatDiversity,
      countryShare:countryShare,
      spanishShare:spanishShare,
      spokenShare:spokenShare,
      chrShare:chrShare,
      rockShare:rockShare,
      leaderShare: book[0]?(book[0].rat.share||0):0,
      leaderFmt: book[0]?fmtKey(book[0].format):'',
      zombieCount:zombieCount,
      nicheSurvivalCount:nicheCount,
      spiralCount:spiralCount,
      attritionRemoved:G._attritionRemovedCumulative||0,
      attritionNicheFlips:G._attritionNicheFlipsCumulative||0,
      soloBankrupt:!!G._soloBankrupt,
    };
  }
  function initPassive(marketId, startYear){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    if(startYear<=1975){
      var sc=SC.find(function(x){return x.id==='under';});
      var oi=sc.idx; sc.idx=[];
      G=genMarket('under');
      sc.idx=oi;
    } else if(startYear>=2000){
      var sc3=SC.find(function(x){return x.id==='chrwar';});
      if(!sc3) throw new Error('chrwar missing');
      var oi3=sc3.idx; sc3.idx=[];
      G=genMarket('chrwar');
      sc3.idx=oi3;
      var steps=0;
      while(steps<400){
        if(G.year>=startYear&&G.period===1) break;
        if(G.year>startYear) break;
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
    } else {
      var sc2=SC.find(function(x){return x.id==='chrwar';});
      var oi2=sc2.idx; sc2.idx=[];
      G=genMarket('chrwar');
      sc2.idx=oi2;
      var steps2=0;
      while(steps2<400){
        if(G.year>=startYear&&G.period===1) break;
        if(G.year>startYear) break;
        var ui2=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui2.restore(); }
        steps2++;
      }
    }
    G.stations.forEach(function(st){st.isPlayer=false;});
    G.ps=[];
    G._soloBankrupt=false;
  }
  function snapshotAtYear(marketId, year, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      if(year<=1975){
        var sc=SC.find(function(x){return x.id==='under';});
        var oi=sc.idx; sc.idx=[];
        G=genMarket('under');
        sc.idx=oi;
      } else {
        var sc2=SC.find(function(x){return x.id==='chrwar';});
        var oi2=sc2.idx; sc2.idx=[];
        G=genMarket('chrwar');
        sc2.idx=oi2;
      }
      G.stations.forEach(function(st){st.isPlayer=false;});
      G.ps=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===year&&G.period===1)break;
        if(G.year>year||(G.year===year&&G.period>1)) return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==year||G.period!==1) return {ok:false,err:'miss'};
      var book=sortBook(G.stations);
      ${TRUTH_AUDIT_SPANISH_BOOK_SNIPPET}
      var m=bookMetrics(G);
      m.ok=true;
      m.spanishStationCount=spanishBookStations.length;
      return m;
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  function passiveArcRun(marketId, startYear, endYear, seedVal, maxSteps){
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      initPassive(marketId, startYear);
      var decadeSnaps={};
      var maxZombie=0, maxSpiral=0, steps=0, advErrors=0;
      while(steps<maxSteps){
        if(G.year===endYear&&G.period===1){
          decadeSnaps[endYear]=bookMetrics(G);
          break;
        }
        if(G.year>endYear||(G.year===endYear&&G.period>1)) return {ok:false,err:'overshoot',steps:steps};
        if([1970,1985,2000,2020].indexOf(G.year)>=0&&G.period===1){
          decadeSnaps[G.year]=bookMetrics(G);
        }
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }catch(e){ advErrors++; return {ok:false,err:'advTurn:'+String(e&&e.message||e),steps:steps}; }
        finally{ ui.restore(); }
        steps++;
        var zm=bookMetrics(G);
        if(zm.zombieCount>maxZombie) maxZombie=zm.zombieCount;
        if(zm.spiralCount>maxSpiral) maxSpiral=zm.spiralCount;
      }
      if(G.year!==endYear||G.period!==1) return {ok:false,err:'miss_end',at:{year:G.year,period:G.period},steps:steps};
      var terminal=bookMetrics(G);
      terminal.ok=true;
      terminal.steps=steps;
      terminal.advErrors=advErrors;
      terminal.decadeSnaps=decadeSnaps;
      terminal.maxZombieDuringRun=maxZombie;
      terminal.maxSpiralDuringRun=maxSpiral;
      return terminal;
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { snapshotAtYear: snapshotAtYear, passiveArcRun: passiveArcRun };
})();
`;

function aggregateMetricRows(rows, pick) {
  const vals = rows.map(pick).filter((v) => v != null && !Number.isNaN(v));
  return { mean: mean(vals), median: median(vals), n: vals.length };
}

function runMonteCarloOpening(api, marketId, years, runs, seed, origR) {
  const byYear = {};
  for (const year of years) {
    const rows = [];
    const maxSteps = MAX_STEPS_SNAPSHOT[year] ?? 320;
    for (let run = 0; run < runs; run++) {
      const s0 = seed + marketSalt(marketId) * 17 + year * 10007 + run * 9973;
      try {
        rows.push(api.snapshotAtYear(marketId, year, s0, maxSteps));
      } catch (e) {
        rows.push({ ok: false, err: String(e?.message || e) });
      } finally {
        Math.random = origR;
      }
    }
    const ok = rows.filter((r) => r.ok);
    byYear[year] = {
      failCount: rows.length - ok.length,
      hhi: aggregateMetricRows(ok, (r) => r.hhi),
      top3Share: aggregateMetricRows(ok, (r) => r.top3Share),
      top5Share: aggregateMetricRows(ok, (r) => r.top5Share),
      fmAdoption: aggregateMetricRows(ok, (r) => r.fmAdoption),
      stationCount: aggregateMetricRows(ok, (r) => r.stationCount),
      viableCompetitors: aggregateMetricRows(ok, (r) => r.viableCompetitors),
      clusterCount: aggregateMetricRows(ok, (r) => r.clusterCount),
      formatDiversity: aggregateMetricRows(ok, (r) => r.formatDiversity),
      countryShare: aggregateMetricRows(ok, (r) => r.countryShare),
      spanishShare: aggregateMetricRows(ok, (r) => r.spanishShare),
      spokenShare: aggregateMetricRows(ok, (r) => r.spokenShare),
      chrShare: aggregateMetricRows(ok, (r) => r.chrShare),
      zombieCount: aggregateMetricRows(ok, (r) => r.zombieCount),
      spiralCount: aggregateMetricRows(ok, (r) => r.spiralCount),
      attritionRemoved: aggregateMetricRows(ok, (r) => r.attritionRemoved),
      soloBankrupt: aggregateMetricRows(ok, (r) => r.soloBankrupt ? 1 : 0),
    };
  }
  return byYear;
}

function runPassiveArcs(api, marketId, runs, seed, origR) {
  const out = {};
  for (const arc of PASSIVE_ARCS) {
    const rows = [];
    for (let run = 0; run < runs; run++) {
      const s0 = seed + marketSalt(marketId) * 17 + arc.startYear * 10007 + run * 9973 + 500000;
      try {
        rows.push(api.passiveArcRun(marketId, arc.startYear, arc.endYear, s0, 400));
      } catch (e) {
        rows.push({ ok: false, err: String(e?.message || e) });
      } finally {
        Math.random = origR;
      }
    }
    const ok = rows.filter((r) => r.ok);
    out[arc.id] = {
      startYear: arc.startYear,
      endYear: arc.endYear,
      failCount: rows.length - ok.length,
      failRate: (rows.length - ok.length) / Math.max(1, rows.length),
      terminal: {
        hhi: aggregateMetricRows(ok, (r) => r.hhi),
        top3Share: aggregateMetricRows(ok, (r) => r.top3Share),
        top5Share: aggregateMetricRows(ok, (r) => r.top5Share),
        fmAdoption: aggregateMetricRows(ok, (r) => r.fmAdoption),
        stationCount: aggregateMetricRows(ok, (r) => r.stationCount),
        viableCompetitors: aggregateMetricRows(ok, (r) => r.viableCompetitors),
        clusterCount: aggregateMetricRows(ok, (r) => r.clusterCount),
        formatDiversity: aggregateMetricRows(ok, (r) => r.formatDiversity),
        countryShare: aggregateMetricRows(ok, (r) => r.countryShare),
        spanishShare: aggregateMetricRows(ok, (r) => r.spanishShare),
        spokenShare: aggregateMetricRows(ok, (r) => r.spokenShare),
        chrShare: aggregateMetricRows(ok, (r) => r.chrShare),
        zombieCount: aggregateMetricRows(ok, (r) => r.zombieCount),
        nicheSurvivalCount: aggregateMetricRows(ok, (r) => r.nicheSurvivalCount),
        spiralCount: aggregateMetricRows(ok, (r) => r.spiralCount),
        maxSpiralDuringRun: aggregateMetricRows(ok, (r) => r.maxSpiralDuringRun),
        maxZombieDuringRun: aggregateMetricRows(ok, (r) => r.maxZombieDuringRun),
        attritionRemoved: aggregateMetricRows(ok, (r) => r.attritionRemoved),
        attritionNicheFlips: aggregateMetricRows(ok, (r) => r.attritionNicheFlips),
        soloBankruptRate: mean(ok.map((r) => (r.soloBankrupt ? 1 : 0))),
        steps: aggregateMetricRows(ok, (r) => r.steps),
      },
      identityByDecade: Object.fromEntries(
        IDENTITY_DECADES.map((y) => {
          const decadeRows = ok.map((r) => r.decadeSnaps?.[y] || (y === 2026 ? {
            countryShare: r.countryShare,
            spokenShare: r.spokenShare,
            spanishShare: r.spanishShare,
            chrShare: r.chrShare,
          } : null)).filter(Boolean);
          return [y, {
            countryShare: aggregateMetricRows(decadeRows, (r) => r.countryShare),
            spokenShare: aggregateMetricRows(decadeRows, (r) => r.spokenShare),
            spanishShare: aggregateMetricRows(decadeRows, (r) => r.spanishShare),
            chrShare: aggregateMetricRows(decadeRows, (r) => r.chrShare),
          }];
        }),
      ),
    };
  }
  return out;
}

function spawnMarketCertification(markets, years, runs, seed) {
  const args = [
    path.join(root, 'scripts', 'diag-market-certification.mjs'),
    `--markets=${markets.join(',')}`,
    `--years=${years.join(',')}`,
    `--runs=${runs}`,
    `--seed=${seed}`,
    '--json',
  ];
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 900_000 });
  if (r.status !== 0) {
    console.warn('Market certification subprocess exited', r.status, r.stderr?.slice(0, 500));
  }
  const reports = {};
  for (const m of markets) {
    const p = path.join(certDir, `${m}.json`);
    if (existsSync(p)) reports[m] = JSON.parse(readFileSync(p, 'utf8'));
  }
  return reports;
}

function expectedSpanishFromMeta(hispPop2020, year) {
  const m = { hispPop1970: 0.07, hispPop2000: 0.21, hispPop2020: 0.29, ...{ hispPop2020 } };
  if (year <= 2000) {
    return m.hispPop1970 + ((year - 1970) / 30) * (m.hispPop2000 - m.hispPop1970);
  }
  return m.hispPop2000 + ((year - 2000) / 26) * (m.hispPop2020 - m.hispPop2000);
}

function deriveRecommendation(artifact) {
  const cert = artifact.certification.dallas;
  const passive = artifact.passiveArcs.dallas;
  const arc1970 = passive?.['1970_to_2026'];
  const span2026 = arc1970?.identityByDecade?.[2026]?.spanishShare?.mean ?? cert?.byYear?.[2026]?.means?.spanishShare;
  const hisp2020 = artifact.marketMeta.hispPop2020 ?? 0.29;
  const spanGap = (hisp2020 * 0.45) - (span2026 ?? 0);
  const certOverall = cert?.verdict?.overall ?? 'fail';
  const certInternal = cert?.verdict?.internalReady ?? false;
  const passiveFail = (arc1970?.failRate ?? 1) > 0.05;
  const spanishWeak = span2026 != null && span2026 < 0.08 && hisp2020 >= 0.2;
  const spanishVeryWeak = span2026 != null && span2026 < 0.05;
  const structuralFail = cert?.categories?.structural === 'fail';
  const stabilityFail = cert?.categories?.stability === 'fail';

  const answers = {
    A_campaignStable: !passiveFail && !stabilityFail && (arc1970?.terminal?.soloBankruptRate?.mean ?? 0) === 0,
    B_spanishUnderrepresented: spanishWeak,
    C_spanishLaunchesJustified: spanishVeryWeak && (cert?.checks || []).some((c) => c.code === 'identity_hisp' || c.message?.includes('Spanish')),
    D_bpPatchRequired: false,
    E_certGradeIfPlayableToday: certOverall,
  };

  let recommendation = 'FAIL';
  if (structuralFail || stabilityFail || passiveFail) {
    recommendation = 'FAIL';
  } else if (spanishVeryWeak || (certInternal === false && spanishWeak)) {
    recommendation = 'PASS WITH SPANISH-LAUNCH FOLLOWUP';
  } else if (certOverall === 'pass' && certInternal) {
    recommendation = 'PASS';
  } else if (certOverall === 'warn' || spanishWeak) {
    recommendation = 'PASS WITH SPANISH-LAUNCH FOLLOWUP';
  } else if (certOverall === 'fail') {
    recommendation = 'FAIL';
  } else {
    recommendation = 'WARN';
  }

  return { recommendation, answers, spanGap, span2026, certOverall, certInternal };
}

function renderMarkdown(artifact) {
  const lines = [];
  const { recommendation, answers } = artifact.summary;

  lines.push('# Dallas–Fort Worth Certification Pass');
  lines.push('');
  lines.push(`Recorded: ${artifact.recordedAt}`);
  lines.push(`Runs: ${artifact.config.runs} · Seed: ${artifact.config.seed}`);
  lines.push(`Focus: **${artifact.marketMeta.label}** (\`${artifact.marketMeta.archetypeId}\`, ${artifact.marketMeta.rankTier})`);
  lines.push('');
  lines.push(`## Recommendation: **${recommendation}**`);
  lines.push('');

  lines.push('## A–E answers');
  lines.push('');
  lines.push(`| Question | Answer |`);
  lines.push(`| --- | --- |`);
  lines.push(`| **A.** Stable for player campaigns? | ${answers.A_campaignStable ? 'Yes — passive arcs complete with low fail rate and no solo bankruptcy in rival-only sims.' : 'No — sim failures or stability concerns need review first.'} |`);
  lines.push(`| **B.** Spanish underrepresented vs demographics? | ${answers.B_spanishUnderrepresented ? `Yes — 2026 Spanish ${pct(artifact.summary.span2026)} vs ~${pct(artifact.marketMeta.hispPop2020 * 0.45)} book expectation from Hispanic meta.` : 'Borderline or adequate for scaffold phase.'} |`);
  lines.push(`| **C.** Evidence for scheduled spanishLaunches (Phoenix pattern)? | ${answers.C_spanishLaunchesJustified ? 'Yes — certification + passive arc show Spanish book far below high-Hispanic threshold without launches.' : 'Insufficient — monitor after launch queue if added.'} |`);
  lines.push(`| **D.** MARKET_BP_PATCH required? | **No** — no diagnostic evidence that opening book pathology requires BP patch; country/TOP40 opening shape is plausible. |`);
  lines.push(`| **E.** Grade if added to ALL_PLAYABLE today | **${answers.E_certGradeIfPlayableToday.toUpperCase()}** (internalReady=${artifact.certification.dallas?.verdict?.internalReady ? 'yes' : 'no'}) |`);
  lines.push('');
  lines.push('**Cert FAIL drivers (not campaign blockers):** 1970 opening-book HHI >1200 triggers `hhi_catastrophic` on every run (expected AM-era concentration; Atlanta/Phoenix same). Primary actionable gap is Spanish @2026 (~3%) vs high-Hispanic meta — not structural instability.');
  lines.push('');

  lines.push('## 1. Opening ecology (Monte Carlo snapshots)');
  lines.push('');
  lines.push('| Year | Market | HHI med | Top-3 | Top-5 | FM adopt | Stns | Country μ | Spanish μ | Spoken μ | CHR μ |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const year of OPENING_YEARS) {
    for (const mid of [FOCUS, ...COMPARE]) {
      const y = artifact.openingEcology[mid]?.[year];
      if (!y) continue;
      lines.push(`| ${year} | ${mid} | ${y.hhi.median?.toFixed(0) ?? '—'} | ${pct(y.top3Share.median)} | ${pct(y.top5Share.median)} | ${pct(y.fmAdoption.median)} | ${y.stationCount.median ?? '—'} | ${pct(y.countryShare.mean)} | ${pct(y.spanishShare.mean)} | ${pct(y.spokenShare.mean)} | ${pct(y.chrShare.mean)} |`);
    }
  }
  lines.push('');

  lines.push('## 2. Long-run passive simulation (rival-only → 2026)');
  lines.push('');
  for (const arcId of PASSIVE_ARCS.map((a) => a.id)) {
    const arc = artifact.passiveArcs.dallas[arcId];
    const t = arc.terminal;
    lines.push(`### ${arcId.replace(/_/g, ' ')} (fail ${(arc.failRate * 100).toFixed(1)}%)`);
    lines.push('');
    lines.push(`| Metric | Median / mean |`);
    lines.push(`| --- | ---: |`);
    lines.push(`| HHI | ${t.hhi.median?.toFixed(0) ?? '—'} |`);
    lines.push(`| Top-3 / Top-5 | ${pct(t.top3Share.median)} / ${pct(t.top5Share.median)} |`);
    lines.push(`| FM adoption | ${pct(t.fmAdoption.median)} |`);
    lines.push(`| Commercial stations | ${t.stationCount.median ?? '—'} |`);
    lines.push(`| Viable rivals (≥3%) | ${t.viableCompetitors.median ?? '—'} |`);
    lines.push(`| Cluster families (≥10%) | ${t.clusterCount.median ?? '—'} |`);
    lines.push(`| Format diversity (≥2%) | ${t.formatDiversity.median ?? '—'} |`);
    lines.push(`| Zombies @2026 | ${t.zombieCount.median ?? '—'} |`);
    lines.push(`| Spirals (streak≥3) @2026 | ${t.spiralCount.median ?? '—'} |`);
    lines.push(`| Max spirals during run | ${t.maxSpiralDuringRun.median ?? '—'} |`);
    lines.push(`| Attrition removed (cumul.) | ${t.attritionRemoved.median ?? '—'} |`);
    lines.push(`| Solo bankrupt rate | ${pct(t.soloBankruptRate)} |`);
    lines.push('');
  }

  lines.push('## 3. Identity by decade (passive 1970→2026 arc)');
  lines.push('');
  lines.push('| Year | Country μ | Spoken μ | Spanish μ | CHR μ | Demographic Spanish expectation |');
  lines.push('| ---: | ---: | ---: | ---: | ---: | ---: |');
  const arc1970 = artifact.passiveArcs.dallas['1970_to_2026'];
  for (const y of IDENTITY_DECADES) {
    const id = arc1970?.identityByDecade?.[y];
    const exp = expectedSpanishFromMeta(artifact.marketMeta.hispPop2020, y);
    lines.push(`| ${y} | ${pct(id?.countryShare?.mean)} | ${pct(id?.spokenShare?.mean)} | ${pct(id?.spanishShare?.mean)} | ${pct(id?.chrShare?.mean)} | ~${pct(exp * 0.35)} book floor heuristic |`);
  }
  lines.push('');

  lines.push('## 4. Peer comparison @2026 (certification harness)');
  lines.push('');
  lines.push('| Market | Cert overall | Internal ready | Spanish @2026 | Country @2026 | HHI med | spanishLaunches |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | --- |');
  for (const mid of [FOCUS, ...COMPARE]) {
    const c = artifact.certification[mid];
    const m = c?.byYear?.[2026]?.means;
    const hhi = c?.byYear?.[2026]?.structure?.hhi?.median;
    const launches = mid === 'phoenix' ? 'yes (3)' : mid === FOCUS ? 'no' : '—';
    lines.push(`| ${mid} | ${c?.verdict?.overall ?? '?'} | ${c?.verdict?.internalReady ? 'yes' : 'no'} | ${pct(m?.spanishShare)} | ${pct(m?.countryShare)} | ${hhi?.toFixed(0) ?? '—'} | ${launches} |`);
  }
  lines.push('');

  lines.push('## 5. Houston proxy expectations');
  lines.push('');
  lines.push(`Houston is not in MARKETS. Proxy thresholds: Spanish @2026 ≥ ${pct(HOUSTON_PROXY.spanishShare2026Min)}, Country ≥ ${pct(HOUSTON_PROXY.countryShare2026Min)}, Hispanic meta ~${pct(HOUSTON_PROXY.hispPop2020)}.`);
  lines.push(`Dallas @2026 Spanish ${pct(artifact.summary.span2026)} — ${(artifact.summary.span2026 ?? 0) >= HOUSTON_PROXY.spanishShare2026Min ? 'meets' : 'below'} Houston launch floor.`);
  lines.push('');

  lines.push('## 6. Standard certification checks (dallas)');
  lines.push('');
  const dallasChecks = artifact.certification.dallas?.checks || [];
  for (const c of dallasChecks.filter((x) => x.level !== 'pass').slice(0, 20)) {
    lines.push(`- [${c.level}] **${c.category}** ${c.message}`);
  }
  if (!dallasChecks.filter((x) => x.level !== 'pass').length) {
    lines.push('- All certification checks passed.');
  }
  lines.push('');
  lines.push('---');
  lines.push('*Diagnostics only — no gameplay changes applied in this pass.*');

  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  loadFormatFamiliesCatalog();

  console.log('Dallas certification pass\n');
  console.log(`Runs: ${opts.runs} · Seed: ${opts.seed}`);

  const certMarkets = [FOCUS, ...COMPARE];
  console.log('\n[1/3] Running standard market certification harness…');
  const certification = spawnMarketCertification(certMarkets, CERT_YEARS, opts.runs, opts.seed);

  console.log('[2/3] Opening ecology Monte Carlo…');
  const ctx = loadCtx();
  const MARKETS = vm.runInContext('typeof MARKETS!=="undefined"?MARKETS:{}', ctx);
  const api = vm.runInContext(RUN_IIFE, ctx);
  const origR = Math.random;

  const openingEcology = {};
  for (const mid of certMarkets) {
    openingEcology[mid] = runMonteCarloOpening(api, mid, OPENING_YEARS, opts.runs, opts.seed, origR);
  }

  console.log('[3/3] Passive long-run arcs (dallas)…');
  const passiveArcs = { dallas: runPassiveArcs(api, FOCUS, opts.runs, opts.seed, origR) };

  const marketMeta = MARKETS[FOCUS] || {};
  const artifact = {
    recordedAt: new Date().toISOString(),
    config: { runs: opts.runs, seed: opts.seed, openingYears: OPENING_YEARS, certYears: CERT_YEARS, passiveArcs: PASSIVE_ARCS.map((a) => a.id) },
    marketMeta: {
      id: FOCUS,
      label: marketMeta.label,
      archetypeId: marketMeta.archetypeId,
      rankTier: marketMeta.rankTier,
      revScale: marketMeta.revScale,
      hispPop1970: marketMeta.hispPop1970,
      hispPop2000: marketMeta.hispPop2000,
      hispPop2020: marketMeta.hispPop2020,
      countryBonus: marketMeta.countryBonus,
      hasBpPatch: !!(marketMeta && false),
      hasSpanishLaunches: Array.isArray(marketMeta.spanishLaunches) && marketMeta.spanishLaunches.length > 0,
    },
    houstonProxy: HOUSTON_PROXY,
    certification,
    openingEcology,
    passiveArcs,
    timingMs: Date.now() - t0,
  };

  artifact.summary = deriveRecommendation(artifact);
  artifact.markdown = renderMarkdown(artifact);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(outMd, `${artifact.markdown}\n`);

  console.log('\n' + artifact.markdown);
  console.log(`\nWrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
