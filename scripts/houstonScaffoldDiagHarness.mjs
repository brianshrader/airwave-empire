/**
 * Shared VM harness for Houston scaffold diagnostics (read-only).
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { TRUTH_AUDIT_SPANISH_BOOK_SNIPPET } from './spanishSubtypeHelpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.join(__dirname, '..');
export const legacyPath = path.join(root, 'src', 'legacy.js');
export const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

export const FOCUS = 'houston';
export const PEER_COMPARE = ['dallas', 'atlanta', 'phoenix', 'chicago'];
export const MEGA_COMPARE = ['newyork', 'losangeles', 'chicago'];
export const OPENING_YEARS = [1970, 1985, 2000, 2020, 2026];
export const IDENTITY_DECADES = [1970, 1985, 2000, 2020, 2026];
export const PASSIVE_ARCS = [
  { id: '1970_to_2026', startYear: 1970, endYear: 2026 },
];
export const DEFAULT_RUNS = 40;
export const DEFAULT_SEED = 20260605;

export const MAX_STEPS_SNAPSHOT = {
  1970: 0,
  1985: 260,
  2000: 320,
  2020: 320,
  2026: 320,
};

export function injectHeadlessLaunchNewsGuard(src) {
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

export function createVmContext() {
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

export function loadDiagApi() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  const src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  const api = vm.runInContext(RUN_IIFE, ctx);
  return { ctx, api };
}

export function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

export function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const idx = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[idx] : (s[idx] + s[idx + 1]) / 2;
}

export function pct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function aggregateMetricRows(rows, pick) {
  const vals = rows.map(pick).filter((v) => v != null && !Number.isNaN(v));
  return { mean: mean(vals), median: median(vals), n: vals.length };
}

export function parseDiagArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(10, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
  }
  return o;
}

export function readMarketMeta(ctx, marketId) {
  const m = ctx.MARKETS?.[marketId] || {};
  return {
    id: marketId,
    label: m.label || marketId,
    archetypeId: m.archetypeId || '',
    rankTier: m.rankTier || '',
    revScale: m.revScale ?? null,
    hispPop1970: m.hispPop1970 ?? null,
    hispPop2000: m.hispPop2000 ?? null,
    hispPop2020: m.hispPop2020 ?? null,
    countryBonus: m.countryBonus ?? null,
    urbanBonus: m.urbanBonus ?? null,
    blackPop: m.blackPop ?? null,
    spanishLaunches: Array.isArray(m.spanishLaunches) ? m.spanishLaunches.length : 0,
  };
}

export function runMonteCarloOpening(api, marketId, years, runs, seed, origR) {
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
      zombieCount: aggregateMetricRows(ok, (r) => r.zombieCount),
      spiralCount: aggregateMetricRows(ok, (r) => r.spiralCount),
    };
  }
  return byYear;
}

export function runPassiveArcs(api, marketId, runs, seed, origR) {
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
        zombieCount: aggregateMetricRows(ok, (r) => r.zombieCount),
        spiralCount: aggregateMetricRows(ok, (r) => r.spiralCount),
        maxSpiralDuringRun: aggregateMetricRows(ok, (r) => r.maxSpiralDuringRun),
        attritionRemoved: aggregateMetricRows(ok, (r) => r.attritionRemoved),
        soloBankruptRate: mean(ok.map((r) => (r.soloBankrupt ? 1 : 0))),
      },
      identityByDecade: Object.fromEntries(
        IDENTITY_DECADES.map((y) => {
          const decadeRows = ok.map((r) => r.decadeSnaps?.[y] || (y === 2026 ? {
            countryShare: r.countryShare,
            spokenShare: r.spokenShare,
            spanishShare: r.spanishShare,
            urbanRnbShare: r.urbanRnbShare,
            chrShare: r.chrShare,
          } : null)).filter(Boolean);
          return [y, {
            countryShare: aggregateMetricRows(decadeRows, (r) => r.countryShare),
            spokenShare: aggregateMetricRows(decadeRows, (r) => r.spokenShare),
            spanishShare: aggregateMetricRows(decadeRows, (r) => r.spanishShare),
            urbanRnbShare: aggregateMetricRows(decadeRows, (r) => r.urbanRnbShare),
            chrShare: aggregateMetricRows(decadeRows, (r) => r.chrShare),
          }];
        }),
      ),
    };
  }
  return out;
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
      clusterCount:0,
      formatDiversity:formatDiversity,
      countryShare:countryShare,
      spanishShare:spanishShare,
      spokenShare:spokenShare,
      urbanRnbShare:urbanRnbShare,
      chrShare:chrShare,
      zombieCount:zombieCount,
      nicheSurvivalCount:nicheCount,
      spiralCount:spiralCount,
      attritionRemoved:G._attritionRemovedCumulative||0,
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
      var m=bookMetrics(G);
      m.ok=true;
      return m;
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  function passiveArcRun(marketId, startYear, endYear, seedVal, maxSteps){
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      initPassive(marketId, startYear);
      var decadeSnaps={};
      var maxZombie=0, maxSpiral=0, steps=0;
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
        try{ advTurn(); }catch(e){ return {ok:false,err:'advTurn:'+String(e&&e.message||e),steps:steps}; }
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
      terminal.decadeSnaps=decadeSnaps;
      terminal.maxZombieDuringRun=maxZombie;
      terminal.maxSpiralDuringRun=maxSpiral;
      return terminal;
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { snapshotAtYear: snapshotAtYear, passiveArcRun: passiveArcRun };
})();
`;
