#!/usr/bin/env node
/**
 * Houston full certification pass (read-only).
 *
 *   node scripts/diag-houston-certification.mjs
 *   node scripts/diag-houston-certification.mjs --runs=50
 *
 * Artifacts: tmp/houston_certification.json, tmp/houston_certification.md
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
const outJson = path.join(root, 'tmp', 'houston_certification.json');
const outMd = path.join(root, 'tmp', 'houston_certification.md');

const FOCUS = 'houston';
const COMPARE = ['dallas', 'atlanta', 'phoenix', 'chicago'];
const OPENING_YEARS = [1970, 1985, 2000, 2020, 2026];
const CERT_YEARS = [1970, 1985, 2000, 2026];
const PASSIVE_ARCS = [
  { id: '1970_to_2026', startYear: 1970, endYear: 2026 },
  { id: '1985_to_2026', startYear: 1985, endYear: 2026 },
  { id: '2000_to_2026', startYear: 2000, endYear: 2026 },
];
const IDENTITY_DECADES = [1970, 1985, 2000, 2020, 2026];

const MIAMI_COMPARE = 'miami';

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
    var urbanRnbShare=(fmtSum.SOUL_RNB||0)+(fmtSum.URBAN_CONTEMP||0)+(fmtSum.GOSPEL||0)+(fmtSum.RHYTHMIC||0)*0.5;
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
      urbanRnbShare:urbanRnbShare,
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
      urbanRnbShare: aggregateMetricRows(ok, (r) => r.urbanRnbShare),
      chrShare: aggregateMetricRows(ok, (r) => r.chrShare),
      rockShare: aggregateMetricRows(ok, (r) => r.rockShare),
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
        urbanRnbShare: aggregateMetricRows(ok, (r) => r.urbanRnbShare),
        chrShare: aggregateMetricRows(ok, (r) => r.chrShare),
        rockShare: aggregateMetricRows(ok, (r) => r.rockShare),
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
            urbanRnbShare: r.urbanRnbShare,
            chrShare: r.chrShare,
            rockShare: r.rockShare,
          } : null)).filter(Boolean);
          return [y, {
            countryShare: aggregateMetricRows(decadeRows, (r) => r.countryShare),
            spokenShare: aggregateMetricRows(decadeRows, (r) => r.spokenShare),
            spanishShare: aggregateMetricRows(decadeRows, (r) => r.spanishShare),
            urbanRnbShare: aggregateMetricRows(decadeRows, (r) => r.urbanRnbShare),
            chrShare: aggregateMetricRows(decadeRows, (r) => r.chrShare),
            rockShare: aggregateMetricRows(decadeRows, (r) => r.rockShare),
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

function expectedSpanishFromMeta(marketMeta, year) {
  const m = {
    hispPop1970: marketMeta.hispPop1970 ?? 0.11,
    hispPop2000: marketMeta.hispPop2000 ?? 0.28,
    hispPop2020: marketMeta.hispPop2020 ?? 0.38,
  };
  if (year <= 2000) {
    return m.hispPop1970 + ((year - 1970) / 30) * (m.hispPop2000 - m.hispPop1970);
  }
  return m.hispPop2000 + ((year - 2000) / 26) * (m.hispPop2020 - m.hispPop2000);
}

function certHasHhiCatastrophic1970(cert) {
  return (cert?.checks || []).some((c) => String(c.message || '').includes('hhi_catastrophic') && String(c.message || '').includes('y1970'));
}

function spanishLaunchLabel(marketId, marketMeta) {
  const n = marketMeta?.spanishLaunches ?? 0;
  if (marketId === FOCUS || marketId === 'dallas' || marketId === 'phoenix') {
    return n > 0 ? `yes (${n})` : 'no';
  }
  return '—';
}

function deriveRecommendation(artifact) {
  const cert = artifact.certification.houston;
  const passive = artifact.passiveArcs.houston;
  const arc1970 = passive?.['1970_to_2026'];
  const dallasArc = artifact.passiveArcs.dallas?.['1970_to_2026'];
  const houston26 = arc1970?.identityByDecade?.[2026] || {};
  const dallas26 = dallasArc?.identityByDecade?.[2026] || {};

  const spanH = houston26.spanishShare?.mean ?? cert?.byYear?.[2026]?.means?.spanishShare;
  const spanD = dallas26.spanishShare?.mean ?? artifact.certification.dallas?.byYear?.[2026]?.means?.spanishShare;
  const ctyH = houston26.countryShare?.mean;
  const ctyD = dallas26.countryShare?.mean;
  const urbanH = houston26.urbanRnbShare?.mean;
  const urbanD = dallas26.urbanRnbShare?.mean;
  const spokenH = houston26.spokenShare?.mean;

  const certOverall = cert?.verdict?.overall ?? 'fail';
  const certInternal = cert?.verdict?.internalReady ?? false;
  const passiveFail = (arc1970?.failRate ?? 1) > 0.05;
  const structuralFail = cert?.categories?.structural === 'fail';
  const stabilityFail = cert?.categories?.stability === 'fail';

  const peersHhi1970 = ['dallas', 'atlanta', 'phoenix'].every(
    (mid) => certHasHhiCatastrophic1970(artifact.certification[mid]),
  );
  const houstonHhi1970 = certHasHhiCatastrophic1970(cert);
  const hhiRubricArtifact = certOverall === 'fail' && !certInternal && houstonHhi1970 && peersHhi1970;

  const opening26 = artifact.openingEcology.houston?.[2026];
  const chicago26 = artifact.openingEcology.chicago?.[2026];
  const megaGap = opening26?.stationCount?.median != null && chicago26?.stationCount?.median != null
    && chicago26.stationCount.median - opening26.stationCount.median >= 9;

  const answers = {
    A_campaignStable: !passiveFail && !stabilityFail && (arc1970?.terminal?.soloBankruptRate?.mean ?? 0) === 0,
    B_spanishAboveDallas: spanH != null && spanD != null && spanH > spanD - 0.01,
    B_countryNotAboveDallas: ctyH != null && ctyD != null && ctyH <= ctyD + 0.015,
    B_urbanComparable: urbanH != null && urbanD != null && urbanH >= urbanD - 0.025,
    B_spokenCompetitive: (spokenH ?? 0) >= 0.08,
    B_distinctFromDallas: false,
    C_texasSunbeltModification: false,
    D_bpPatchRequired: false,
    E_megaTierRequired: megaGap,
    F_playableReady: false,
    E_certGradeIfPlayableToday: certOverall,
    hhiRubricArtifact,
  };
  answers.B_distinctFromDallas = answers.B_spanishAboveDallas && answers.B_countryNotAboveDallas
    && answers.B_spokenCompetitive;
  answers.C_texasSunbeltModification = (ctyH != null && ctyD != null && ctyH > ctyD + 0.02)
    || (urbanH != null && urbanD != null && urbanH < urbanD - 0.03);

  let recommendation = 'FAIL';
  if (passiveFail || stabilityFail) {
    recommendation = 'FAIL';
  } else if (structuralFail && !hhiRubricArtifact) {
    recommendation = 'FAIL';
  } else if (hhiRubricArtifact && answers.B_distinctFromDallas && (spanH ?? 0) >= 0.18) {
    recommendation = 'PASS WITH RUBRIC WARNING';
  } else if (certOverall === 'pass' && certInternal && answers.B_distinctFromDallas) {
    recommendation = 'PASS';
  } else if (hhiRubricArtifact) {
    recommendation = 'PASS WITH RUBRIC WARNING';
  } else if (certOverall === 'warn' || !answers.B_spanishAboveDallas) {
    recommendation = 'WARN';
  } else if (certOverall === 'fail') {
    recommendation = hhiRubricArtifact ? 'PASS WITH RUBRIC WARNING' : 'FAIL';
  } else {
    recommendation = 'WARN';
  }

  return {
    recommendation,
    answers,
    spanH,
    spanD,
    ctyH,
    ctyD,
    urbanH,
    urbanD,
    spokenH,
    certOverall,
    certInternal,
  };
}

function renderMarkdown(artifact) {
  const lines = [];
  const { recommendation, answers } = artifact.summary;
  const meta = artifact.marketMeta;

  lines.push('# Houston Certification Pass');
  lines.push('');
  lines.push(`Recorded: ${artifact.recordedAt}`);
  lines.push(`Runs: ${artifact.config.runs} · Seed: ${artifact.config.seed}`);
  lines.push(`Focus: **${meta.label}** (\`${meta.archetypeId}\`, ${meta.rankTier})`);
  lines.push('');
  lines.push(`## Recommendation: **${recommendation}**`);
  lines.push('');

  lines.push('## A–F answers');
  lines.push('');
  lines.push('| Question | Answer |');
  lines.push('| --- | --- |');
  lines.push(`| **A.** Stable for player campaigns? | ${answers.A_campaignStable ? 'Yes — passive arcs complete with low fail rate and no solo bankruptcy.' : 'No — stability review required.'} |`);
  lines.push(`| **B.** Distinct from Dallas (Spanish↑, country≤, spoken OK)? | ${answers.B_distinctFromDallas ? `Yes — Spanish ${pct(artifact.summary.spanH)} vs Dallas ${pct(artifact.summary.spanD)}; country ${pct(artifact.summary.ctyH)} vs ${pct(artifact.summary.ctyD)}.` : 'Partial — see identity table.'} |`);
  lines.push(`| **B-detail** Urban/R&B comparable? | ${answers.B_urbanComparable ? `Yes (${pct(artifact.summary.urbanH)} vs Dallas ${pct(artifact.summary.urbanD)}).` : `Gap — Houston ${pct(artifact.summary.urbanH)} vs Dallas ${pct(artifact.summary.urbanD)} (Spanish expansion tradeoff).`} |`);
  lines.push(`| **C.** texas_sunbelt modification needed? | ${answers.C_texasSunbeltModification ? 'Optional follow-up — urban/country shape could use Gulf Coast extension.' : 'No — archetype adequate post Spanish launches.'} |`);
  lines.push(`| **D.** MARKET_BP_PATCH required? | **No** |`);
  lines.push(`| **E.** Mega-tier treatment required? | ${answers.E_megaTierRequired ? 'Borderline — station count below Chicago mega anchors.' : 'No — large tier adequate.'} |`);
  lines.push(`| **F.** Ready for DIAG_ONLY → playable? | **No** — certification pass only; not promoted in this step. |`);
  lines.push('');
  if (answers.hhiRubricArtifact) {
    lines.push('**1970 HHI rubric note:** Houston cert `fail`/`internalReady=no` driven by 1970 `hhi_catastrophic` — same pattern as Dallas, Atlanta, and Phoenix (AM-era concentration artifact, not Houston-specific instability).');
  }
  lines.push('');

  lines.push('## 1. Opening ecology (Monte Carlo snapshots)');
  lines.push('');
  lines.push('| Year | Market | HHI med | Top-3 | Top-5 | FM adopt | Stns | Country μ | Spanish μ | Spoken μ | Urban/R&B μ | CHR μ | Rock μ |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const year of OPENING_YEARS) {
    for (const mid of [FOCUS, ...COMPARE]) {
      const y = artifact.openingEcology[mid]?.[year];
      if (!y) continue;
      lines.push(`| ${year} | ${mid} | ${y.hhi.median?.toFixed(0) ?? '—'} | ${pct(y.top3Share.median)} | ${pct(y.top5Share.median)} | ${pct(y.fmAdoption.median)} | ${y.stationCount.median ?? '—'} | ${pct(y.countryShare.mean)} | ${pct(y.spanishShare.mean)} | ${pct(y.spokenShare.mean)} | ${pct(y.urbanRnbShare?.mean)} | ${pct(y.chrShare.mean)} | ${pct(y.rockShare?.mean)} |`);
    }
  }
  lines.push('');

  lines.push('## 2. Long-run passive simulation (Houston, rival-only → 2026)');
  lines.push('');
  for (const arcId of PASSIVE_ARCS.map((a) => a.id)) {
    const arc = artifact.passiveArcs.houston[arcId];
    const t = arc.terminal;
    lines.push(`### ${arcId.replace(/_/g, ' ')} (fail ${(arc.failRate * 100).toFixed(1)}%)`);
    lines.push('');
    lines.push('| Metric | Median / mean |');
    lines.push('| --- | ---: |');
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
  lines.push('| Year | Market | Country | Spanish | Spoken | Urban/R&B | CHR | Rock |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const y of IDENTITY_DECADES) {
    for (const mid of [FOCUS, 'dallas', ...COMPARE.filter((m) => m !== 'dallas')]) {
      const id = artifact.passiveArcs[mid]?.['1970_to_2026']?.identityByDecade?.[y];
      if (!id) continue;
      lines.push(`| ${y} | ${mid} | ${pct(id.countryShare?.mean)} | ${pct(id.spanishShare?.mean)} | ${pct(id.spokenShare?.mean)} | ${pct(id.urbanRnbShare?.mean)} | ${pct(id.chrShare?.mean)} | ${pct(id.rockShare?.mean)} |`);
    }
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
    const launches = spanishLaunchLabel(mid, {
      spanishLaunches: mid === FOCUS ? meta.spanishLaunchCount
        : mid === 'dallas' ? 2 : mid === 'phoenix' ? 3 : 0,
    });
    lines.push(`| ${mid} | ${c?.verdict?.overall ?? '?'} | ${c?.verdict?.internalReady ? 'yes' : 'no'} | ${pct(m?.spanishShare)} | ${pct(m?.countryShare)} | ${hhi?.toFixed(0) ?? '—'} | ${launches} |`);
  }
  if (artifact.compareNotes?.miami) {
    lines.push('');
    lines.push(`*Miami: ${artifact.compareNotes.miami}*`);
  }
  lines.push('');

  lines.push('## 5. Houston vs Dallas @2026 (passive arc)');
  lines.push('');
  lines.push('| Metric | Houston | Dallas |');
  lines.push('| --- | ---: | ---: |');
  lines.push(`| Spanish | ${pct(artifact.summary.spanH)} | ${pct(artifact.summary.spanD)} |`);
  lines.push(`| Country | ${pct(artifact.summary.ctyH)} | ${pct(artifact.summary.ctyD)} |`);
  lines.push(`| Spoken | ${pct(artifact.summary.spokenH)} | ${pct(artifact.passiveArcs.dallas?.['1970_to_2026']?.identityByDecade?.[2026]?.spokenShare?.mean)} |`);
  lines.push(`| Urban/R&B | ${pct(artifact.summary.urbanH)} | ${pct(artifact.summary.urbanD)} |`);
  lines.push('');

  lines.push('## 6. Standard certification checks (houston)');
  lines.push('');
  const houstonChecks = artifact.certification.houston?.checks || [];
  for (const c of houstonChecks.filter((x) => x.level !== 'pass').slice(0, 20)) {
    lines.push(`- [${c.level}] **${c.category}** ${c.message}`);
  }
  if (!houstonChecks.filter((x) => x.level !== 'pass').length) {
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

  console.log('Houston certification pass\n');
  console.log(`Runs: ${opts.runs} · Seed: ${opts.seed}`);

  const ctxEarly = loadCtx();
  const MARKETS_EARLY = vm.runInContext('typeof MARKETS!=="undefined"?MARKETS:{}', ctxEarly);
  const certMarkets = [FOCUS, ...COMPARE];
  const passiveMarkets = [FOCUS, 'dallas', ...COMPARE.filter((m) => m !== 'dallas')];
  const compareNotes = {};
  if (!MARKETS_EARLY[MIAMI_COMPARE]) {
    compareNotes.miami = 'not in MARKETS on this branch — Miami comparison unavailable';
  }

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

  console.log('[3/3] Passive long-run arcs…');
  const passiveArcs = {};
  for (const mid of passiveMarkets) {
    process.stdout.write(`  ${mid}…`);
    passiveArcs[mid] = runPassiveArcs(api, mid, opts.runs, opts.seed, origR);
    console.log(' done');
  }

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
      spanishLaunchCount: Array.isArray(marketMeta.spanishLaunches) ? marketMeta.spanishLaunches.length : 0,
      hasSpanishLaunches: Array.isArray(marketMeta.spanishLaunches) && marketMeta.spanishLaunches.length > 0,
    },
    compareNotes,
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
