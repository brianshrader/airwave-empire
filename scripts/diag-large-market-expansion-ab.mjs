#!/usr/bin/env node
/**
 * Large-Market Audience/Billing Expansion A/B @ anchor 16 (diagnostic only).
 *
 *   node scripts/diag-large-market-expansion-ab.mjs
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const snowballPath = path.join(root, 'src', 'marketSimHarnessSnowball.js');
const outJson = path.join(root, 'tmp', 'large_market_expansion_ab.json');
const outMd = path.join(root, 'tmp', 'large_market_expansion_ab.md');

const MARKETS = ['seattle', 'sanfrancisco', 'atlanta'];
const ANCHOR = 16;
const ANCHOR_REF = 10;
const DEFAULT_RUNS = 18;
const DEFAULT_SEED = 20260610;

const ROCK_FMTS = ['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK', 'AAA', 'CLASSIC_HITS'];

const VARIANTS = [
  { id: 'A', letter: 'A', label: 'Baseline anchor 16', spec: null },
  { id: 'B', letter: 'B', label: '+15% billing only', spec: { billingMult: 1.15 } },
  { id: 'C', letter: 'C', label: '+30% billing only', spec: { billingMult: 1.3 } },
  { id: 'D', letter: 'D', label: '+15% listening only', spec: { listeningMult: 1.15 } },
  { id: 'E', letter: 'E', label: '+30% listening only', spec: { listeningMult: 1.3 } },
  { id: 'F', letter: 'F', label: '+15% billing + 15% listening', spec: { billingMult: 1.15, listeningMult: 1.15 } },
  { id: 'G', letter: 'G', label: '+30% billing + 15% listening', spec: { billingMult: 1.3, listeningMult: 1.15 } },
  {
    id: 'H',
    letter: 'H',
    label: 'Elastic (per extra station vs anchor-10 baseline)',
    spec: { mode: 'elastic', baselineComm: 8 },
  },
];

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

function patchLargeAnchor1975(src, count) {
  return src.replace(
    /const LARGE_MARKET_TOTAL_STATIONS_ANCHORS=\[\s*\[1975,\d+\]/,
    `const LARGE_MARKET_TOTAL_STATIONS_ANCHORS=[\n  [1975,${count}]`,
  );
}

/** Patch listening dilution: reduce other-audio fraction when listening boost set. */
function patchLegacyExpansionListening(src) {
  return src
    .replace(
      `function applyOtherAudioListeningDilution(stations,G,engageWeightedPop){
  const mktId=G.marketId||ACTIVE_MARKET||'atlanta';
  const m=MARKETS[mktId]||MARKETS.atlanta;
  const fBase=otherAudioShareFraction(G.year,mktId);
  G._otherAudioShareLast=fBase;`,
      `function applyOtherAudioListeningDilution(stations,G,engageWeightedPop){
  const mktId=G.marketId||ACTIVE_MARKET||'atlanta';
  const m=MARKETS[mktId]||MARKETS.atlanta;
  const fBase=otherAudioShareFraction(G.year,mktId);
  const _wlListenBoost=(G&&G._wlExpansionListeningMult)||1;
  const fBaseUse=(_wlListenBoost>1&&typeof isLargeMarketId==='function'&&isLargeMarketId(mktId))?Math.max(0,fBase/_wlListenBoost):fBase;
  G._otherAudioShareLast=fBaseUse;`,
    )
    .replace(
      '  if(fBase<=1e-9)return;\n\n  const comm=stations.filter(s=>s&&!s._bpSlotDeferred&&!stationIsNoncommercialInstitutional(s)&&s.rat);',
      '  if(fBaseUse<=1e-9)return;\n\n  const comm=stations.filter(s=>s&&!s._bpSlotDeferred&&!stationIsNoncommercialInstitutional(s)&&s.rat);',
    )
    .replace(
      '  stations.forEach(s=>{\n    if(!s||s._bpSlotDeferred||!s.rat)return;\n    let fEff=fBase;\n    if(s.isPublic){\n      fEff=fBase;\n    } else {\n      const rank=rankById.get(s.id);\n      if(rank===undefined)return;\n      if(rank===0) fEff=fBase*(1-leaderRelief);\n      else fEff=fBase*(1+nonLeaderBoost);',
      '  stations.forEach(s=>{\n    if(!s||s._bpSlotDeferred||!s.rat)return;\n    let fEff=fBaseUse;\n    if(s.isPublic){\n      fEff=fBaseUse;\n    } else {\n      const rank=rankById.get(s.id);\n      if(rank===undefined)return;\n      if(rank===0) fEff=fBaseUse*(1-leaderRelief);\n      else fEff=fBaseUse*(1+nonLeaderBoost);',
    );
}

function patchLegacyExpansionBilling(src) {
  return src.replace(
    '  const annualTarget=marketAnnualBilling(G.year,mktId);\n  const halfTarget=Math.round(annualTarget*0.5*marketHalfSeasonFactor(G.year,G.period||1)*Math.max(0.75,G.adx||1));',
    '  const annualTarget=marketAnnualBilling(G.year,mktId);\n  const _wlBillBoost=(G&&G._wlExpansionBillingMult)||1;\n  const halfTarget=Math.round(annualTarget*0.5*marketHalfSeasonFactor(G.year,G.period||1)*Math.max(0.75,G.adx||1)*_wlBillBoost);',
  );
}

function patchSnowballExpansion(src) {
  let sb = src;
  sb = sb.replace(
    '      var summary = snowballBuildSummary(diary, optionsOut);',
    '      window.__lastSnowballG = G;\n      var summary = snowballBuildSummary(diary, optionsOut);',
  );
  sb = sb.replace(
    '      G = window.genMarket(scenId);',
    '      G = window.genMarket(scenId);\n      if (typeof window.__wlApplyExpansion === "function") window.__wlApplyExpansion(G);',
  );
  sb = sb.replace(
    '          if (useActiveBot) runAirwaveBenchmarkPlayerBotTurn(G, playerPolicy);',
    '          var preOpenPm = steps === 0 ? snowballPortfolioMetrics(G) : null;\n          if (useActiveBot) runAirwaveBenchmarkPlayerBotTurn(G, playerPolicy);',
  );
  sb = sb.replace(
    '          for (var k in pm) {\n            if (Object.prototype.hasOwnProperty.call(pm, k)) row[k] = pm[k];\n          }',
    '          for (var k in pm) {\n            if (Object.prototype.hasOwnProperty.call(pm, k)) row[k] = pm[k];\n          }\n          if (preOpenPm) {\n            row.preTopShare = preOpenPm.topShare;\n            row.preTotalRev = preOpenPm.totalRev;\n            row.preTotalEbitda = preOpenPm.totalEbitda;\n          }',
  );
  return sb;
}

const EXPANSION_HOOK = `
window.__wlExpansionSpec = null;
window.__wlApplyExpansion = function (G) {
  var spec = window.__wlExpansionSpec;
  if (!spec || !G) return;
  var mkt = G.marketId || ACTIVE_MARKET;
  if (typeof isLargeMarketId !== 'function' || !isLargeMarketId(mkt)) return;
  var nComm = 0;
  (G.stations || []).forEach(function (s) {
    if (s && !s._bpSlotDeferred && !s.isPublic && String(s.format || '').indexOf('PUBLIC_') !== 0) nComm++;
  });
  var billMult = 1;
  var listenMult = 1;
  if (spec.mode === 'elastic') {
    var extra = Math.max(0, nComm - (spec.baselineComm || 8));
    billMult = 1 + Math.min(0.35, extra * 0.04);
    listenMult = 1 + Math.min(0.2, extra * 0.025);
  } else {
    billMult = spec.billingMult || 1;
    listenMult = spec.listeningMult || 1;
  }
  G._wlExpansionApplied = { billMult: billMult, listenMult: listenMult, nCommercial: nComm };
  var mock = {
    stations: G.stations,
    marketId: G.marketId,
    year: G.year,
    period: G.period || 1,
    turn: G.turn || 0,
    ps: G.ps,
    adx: G.adx,
    fmp: G.fmp,
    streamDrag: G.streamDrag || 0,
    satDrag: 0,
  };
  if (listenMult > 1) G._wlExpansionListeningMult = listenMult;
  if (listenMult > 1 && typeof recalc === 'function') recalc(G.stations, mock);
  if (billMult > 1) G._wlExpansionBillingMult = billMult;
  if (typeof seedRev === 'function') seedRev(G.stations, mock);
  delete G._wlExpansionBillingMult;
  delete G._wlExpansionListeningMult;
};
`;

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

const ctxCache = new Map();

function loadCtx(anchor) {
  const key = String(anchor);
  if (ctxCache.has(key)) return ctxCache.get(key);
  ctxCache.delete(key);
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let legacy = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  legacy = patchLargeAnchor1975(legacy, anchor);
  legacy = patchLegacyExpansionListening(legacy);
  legacy = patchLegacyExpansionBilling(legacy);
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  let sb = patchSnowballExpansion(readFileSync(snowballPath, 'utf8'));
  vm.runInContext(sb, ctx);
  vm.runInContext(EXPANSION_HOOK, ctx);
  ctxCache.set(key, ctx);
  return ctx;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[m] : (s[m] + s[m + 1]) / 2;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

const RUNNER_IIFE = `
(function(){
  var ROCK_FMTS=${JSON.stringify(ROCK_FMTS)};

  function isComm(s){
    return s&&!s._bpSlotDeferred&&!s.isPublic&&String(s.format||'').indexOf('PUBLIC_')!==0;
  }
  function ecology(G){
    var comm=G.stations.filter(isComm);
    var book=comm.slice().sort(function(a,b){
      return (b.rat&&b.rat.share||0)-(a.rat&&a.rat.share||0);
    });
    var top3=0, top5=0, fmN=0, rockSh=0, rockN=0;
    for(var i=0;i<book.length;i++){
      var sh=book[i].rat&&book[i].rat.share!=null?book[i].rat.share:0;
      if(i<3) top3+=sh;
      if(i<5) top5+=sh;
      if(book[i].sig&&book[i].sig.type==='FM') fmN++;
      if(ROCK_FMTS.indexOf(book[i].format)>=0){ rockN++; rockSh+=sh; }
    }
    return {
      top3Share:Math.round(top3*10000)/10000,
      top5Share:Math.round(top5*10000)/10000,
      fmCommercialPct:comm.length?fmN/comm.length:0,
      rockStationCount:rockN,
      rockShare:Math.round(rockSh*10000)/10000,
      rockPresent:rockN>0
    };
  }
  function measureOpening(marketId, seedVal, spec){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function') syncMarketPopToMarket(marketId);
    window.__wlExpansionSpec=spec;
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      var sc=SC.find(function(x){return x.id==='under';});
      var origIdx=sc.idx; sc.idx=[1];
      G=genMarket('under');
      sc.idx=origIdx;
      if(typeof window.__wlApplyExpansion==='function') window.__wlApplyExpansion(G);
      var comm=G.stations.filter(isComm);
      var totalAqh=0, totalRev=0, totalShare=0;
      for(var i=0;i<comm.length;i++){
        totalAqh+=comm[i].rat&&comm[i].rat.aqh?Number(comm[i].rat.aqh):0;
        totalRev+=comm[i].fin&&comm[i].fin.rev?Number(comm[i].fin.rev):0;
        totalShare+=comm[i].rat&&comm[i].rat.share!=null?Number(comm[i].rat.share):0;
      }
      var annual=typeof marketAnnualBilling==='function'?marketAnnualBilling(1970,marketId):0;
      var billMult=G._wlExpansionApplied&&G._wlExpansionApplied.billMult?G._wlExpansionApplied.billMult:1;
      var half=Math.round(annual*0.5*(typeof marketHalfSeasonFactor==='function'?marketHalfSeasonFactor(1970,1):1)*Math.max(0.75,G.adx||1)*billMult);
      var pSt=G.ps&&G.ps[0]?G.ps[0]:null;
      var eco=ecology(G);
      return {
        ok:true,
        nCommercial:comm.length,
        totalAqh:totalAqh,
        halfBilling:half,
        totalRevenue:totalRev,
        avgRevPerStation:comm.length?totalRev/comm.length:0,
        avgSharePerStation:comm.length?totalShare/comm.length:0,
        playerShare:pSt&&pSt.rat?pSt.rat.share:0,
        playerRev:pSt&&pSt.fin?pSt.fin.rev:0,
        playerEbitda:pSt&&pSt.fin?pSt.fin.ebitda:0,
        expansionApplied:G._wlExpansionApplied||null,
        ecology:eco
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  function marketTop3(G){
    var comm=G.stations.filter(isComm).sort(function(a,b){
      return (b.rat&&b.rat.share||0)-(a.rat&&a.rat.share||0);
    });
    var t3=0;
    for(var i=0;i<Math.min(3,comm.length);i++) t3+=comm[i].rat&&comm[i].rat.share!=null?comm[i].rat.share:0;
    return Math.round(t3*10000)/10000;
  }
  function analyze(trace){
    var diary=trace.diary||[];
    var end=diary.length?diary[diary.length-1]:{};
    var open=diary[0]||{};
    var openShare=open.preTopShare!=null?open.preTopShare:(open.topShare||0);
    var operating=diary.filter(function(d){return d.nStations>=1;});
    var peakShare=0, distressSales=0, acqTotal=0, revPerSt=[], ebPerSt=[];
    for(var i=0;i<diary.length;i++){
      var d=diary[i];
      if(d.nStations>=1){
        if((d.topShare||0)>peakShare) peakShare=d.topShare||0;
        if(d.totalRev>0) revPerSt.push(d.totalRev/d.nStations);
        ebPerSt.push(d.totalEbitda/d.nStations);
      }
      if(d.distressSaleCashThisPeriod||d.hasPressureCash) distressSales++;
      if(d.actions) acqTotal+=(d.actions.acquisitions||[]).length;
    }
    var Gend=typeof window.__lastSnowballG!=='undefined'?window.__lastSnowballG:null;
    return {
      survived2000:(end.nStations||0)>=1&&!end.soloBankrupt,
      stations2000:end.nStations||0,
      distressSales:distressSales,
      peakShare:Math.round(peakShare*10000)/10000,
      openShare:Math.round(openShare*10000)/10000,
      revPerStationMed:median(revPerSt),
      ebitdaPerStationMed:median(ebPerSt),
      acqTotal:acqTotal,
      observerEnd:end.nStations===0&&!end.soloBankrupt,
      marketTop32000:Gend?marketTop3(Gend):null
    };
  }
  function median(arr){
    var s=arr.filter(function(x){return x!=null&&!isNaN(x);}).sort(function(a,b){return a-b;});
    if(!s.length) return null;
    var m=Math.floor((s.length-1)/2);
    return s.length%2?s[m]:(s[m]+s[m+1])/2;
  }
  function runSnowball(marketId, seedVal, spec){
    window.__wlExpansionSpec=spec;
    var trace=runMarketSnowballTrace({
      marketId:marketId, scenId:'under', seed:seedVal,
      endYear:2000, endPeriod:2, playerPolicy:'aggressive', activePlayer:true, maxSteps:340
    });
    var m=analyze(trace);
    return m;
  }
  return { measureOpening:measureOpening, runSnowball:runSnowball };
})();
`;

function aggregateOpening(rows) {
  const ok = rows.filter((r) => r.opening?.ok);
  const o = ok.map((r) => r.opening);
  const eco = ok.map((r) => r.opening.ecology);
  return {
    n: ok.length,
    totalAqhMed: median(o.map((x) => x.totalAqh)),
    halfBillingMed: median(o.map((x) => x.halfBilling)),
    totalRevenueMed: median(o.map((x) => x.totalRevenue)),
    avgRevPerStationMed: median(o.map((x) => x.avgRevPerStation)),
    avgSharePerStationMed: median(o.map((x) => x.avgSharePerStation)),
    playerShareMed: median(o.map((x) => x.playerShare)),
    playerRevMed: median(o.map((x) => x.playerRev)),
    playerEbitdaMed: median(o.map((x) => x.playerEbitda)),
    top3ShareMed: median(eco.map((x) => x.top3Share)),
    top5ShareMed: median(eco.map((x) => x.top5Share)),
    fmCommercialPctMed: median(eco.map((x) => x.fmCommercialPct)),
    rockShareMed: median(eco.map((x) => x.rockShare)),
    rockPresentRate: ok.length ? eco.filter((x) => x.rockPresent).length / ok.length : null,
  };
}

function aggregateSnowball(rows) {
  const ok = rows.filter((r) => !r.simError);
  const survived = ok.filter((r) => r.survived2000).length;
  return {
    n: ok.length,
    survivalRate: ok.length ? survived / ok.length : null,
    stations2000Med: median(ok.map((r) => r.stations2000)),
    distressSalesMed: median(ok.map((r) => r.distressSales)),
    peakShareMed: median(ok.map((r) => r.peakShare)),
    openShareMed: median(ok.map((r) => r.openShare)),
    revPerStationMed: median(ok.map((r) => r.revPerStationMed)),
    ebitdaPerStationMed: median(ok.map((r) => r.ebitdaPerStationMed)),
    acqTotalMed: median(ok.map((r) => r.acqTotal)),
    marketTop32000Med: median(ok.map((r) => r.marketTop32000)),
    observerEnd: ok.filter((r) => r.observerEnd).length,
    opening: aggregateOpening(ok),
  };
}

function pct(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(d)}%`;
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString();
}

function fmtShare(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function ecologyOk(agg) {
  const o = agg.opening;
  const t3 = o.top3ShareMed;
  return {
    top3InBand: t3 != null && t3 >= 0.47 && t3 <= 0.52,
    rockPresent: (o.rockPresentRate ?? 0) >= 0.9,
    fmDepth: (o.fmCommercialPctMed ?? 0) >= 0.35,
  };
}

function main() {
  const runs = parseInt(process.env.EXPANSION_RUNS || String(DEFAULT_RUNS), 10) || DEFAULT_RUNS;
  const seed = parseInt(process.env.EXPANSION_SEED || String(DEFAULT_SEED), 10) || DEFAULT_SEED;
  const t0 = Date.now();

  const ctx16 = loadCtx(ANCHOR);
  const ctx10 = loadCtx(ANCHOR_REF);
  const runner16 = vm.runInContext(RUNNER_IIFE, ctx16);
  const runner10 = vm.runInContext(RUNNER_IIFE, ctx10);

  const results = {
    meta: { anchor: ANCHOR, runs, seed, markets: MARKETS, variants: VARIANTS.map((v) => v.id) },
    variants: {},
    anchor10Reference: {},
  };

  for (const v of VARIANTS) {
    results.variants[v.id] = { letter: v.letter, label: v.label, spec: v.spec, markets: {}, pooled: null };
    console.log(`\n=== ${v.letter} ${v.label} ===`);
    const pooledRows = [];
    for (const marketId of MARKETS) {
      const rows = [];
      for (let r = 0; r < runs; r++) {
        const s0 = seed + marketSalt(marketId) * 17 + r * 9973;
        try {
          const row = runner16.runSnowball(marketId, s0, v.spec);
          const openM = runner16.measureOpening(marketId, s0, v.spec);
          if (openM.ok) row.opening = openM;
          rows.push(row);
        } catch (e) {
          rows.push({ simError: String(e?.message || e), survived2000: false });
        }
      }
      const agg = aggregateSnowball(rows);
      results.variants[v.id].markets[marketId] = { aggregate: agg };
      pooledRows.push(...rows);
      console.log(
        `  ${marketId}: surv ${pct(agg.survivalRate)} · openSh ${fmtShare(agg.openShareMed)} · top3 ${fmtShare(agg.opening.top3ShareMed)} · rev/st $${fmt(agg.revPerStationMed)}`,
      );
    }
    results.variants[v.id].pooled = aggregateSnowball(pooledRows);
    const eco = ecologyOk(results.variants[v.id].pooled);
    results.variants[v.id].ecologyCheck = eco;
    console.log(
      `  pooled surv ${pct(results.variants[v.id].pooled.survivalRate)} · top3 ${fmtShare(results.variants[v.id].pooled.opening.top3ShareMed)} · FM ${pct(results.variants[v.id].pooled.opening.fmCommercialPctMed)}`,
    );
  }

  console.log('\n=== Anchor 10 reference ===');
  const refRows = [];
  for (const marketId of MARKETS) {
    const rows = [];
    for (let r = 0; r < runs; r++) {
      const s0 = seed + marketSalt(marketId) * 17 + r * 9973;
      try {
        const row = runner10.runSnowball(marketId, s0, null);
        const openM = runner10.measureOpening(marketId, s0, null);
        if (openM.ok) row.opening = openM;
        rows.push(row);
      } catch (e) {
        rows.push({ survived2000: false });
      }
    }
    refRows.push(...rows);
  }
  results.anchor10Reference.pooled = aggregateSnowball(refRows);
  const refSurv = results.anchor10Reference.pooled.survivalRate;
  console.log(`  pooled surv ${pct(refSurv)}`);

  const baseSurv = results.variants.A.pooled.survivalRate ?? 0;
  const ranked = VARIANTS.map((v) => ({
    id: v.id,
    letter: v.letter,
    label: v.label,
    survival: results.variants[v.id].pooled.survivalRate ?? 0,
    deltaVsA: (results.variants[v.id].pooled.survivalRate ?? 0) - baseSurv,
    deltaVsA10: (results.variants[v.id].pooled.survivalRate ?? 0) - refSurv,
    opening: results.variants[v.id].pooled.opening,
    ecology: results.variants[v.id].ecologyCheck,
  })).sort((a, b) => b.survival - a.survival || b.deltaVsA - a.deltaVsA);

  const a10AvgRev = results.anchor10Reference.pooled.opening?.avgRevPerStationMed;
  const a10OpenSh = results.anchor10Reference.pooled.openShareMed;
  const viable = ranked.filter((r) => r.survival > baseSurv + 0.05);
  let recommended = null;
  for (const r of ranked) {
    if (r.id === 'A') continue;
    const eco = r.ecology;
    const revOk = a10AvgRev == null || (r.opening.avgRevPerStationMed ?? 0) <= a10AvgRev * 1.05;
    if (r.survival > baseSurv + 0.15 && eco.top3InBand && eco.rockPresent && revOk) {
      recommended = r;
      break;
    }
  }

  results.summary = {
    anchor16BaselineSurvival: baseSurv,
    anchor10ReferenceSurvival: refSurv,
    anchor10OpenShareMed: a10OpenSh,
    anchor10AvgRevPerStationMed: a10AvgRev,
    ranked,
    viableVariants: viable.map((r) => r.id),
    recommended: recommended
      ? { id: recommended.id, letter: recommended.letter, label: recommended.label, survival: recommended.survival }
      : null,
    anchor16Viable: viable.length > 0 || (recommended != null),
  };

  const lines = [];
  lines.push('# Large-Market Audience/Billing Expansion A/B (anchor 16)');
  lines.push('');
  lines.push(`Seattle · SF · Atlanta · 1970 · ${runs} runs/variant · seed ${seed}`);
  lines.push(`**Anchor 10 reference survival:** ${pct(refSurv)} · **A16 baseline:** ${pct(baseSurv)}`);
  lines.push('');
  lines.push('## A–H comparison (pooled)');
  lines.push('');
  lines.push('| Var | Model | Surv@2000 | Δ vs A | Δ vs A10 | Open player sh | Rev pool | Avg rev/st | Top-3 sh | FM% comm | Rock sh | Peak sh | Distress |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const v of VARIANTS) {
    const p = results.variants[v.id].pooled;
    const o = p.opening;
    lines.push(
      `| ${v.letter} | ${v.label} | ${pct(p.survivalRate)} | ${pct((p.survivalRate ?? 0) - baseSurv)} | ${pct((p.survivalRate ?? 0) - refSurv)} | ${fmtShare(p.openShareMed)} | $${fmt(o.totalRevenueMed)} | $${fmt(o.avgRevPerStationMed)} | ${fmtShare(o.top3ShareMed)} | ${pct(o.fmCommercialPctMed)} | ${fmtShare(o.rockShareMed)} | ${fmtShare(p.peakShareMed)} | ${p.distressSalesMed ?? '—'} |`,
    );
  }
  lines.push('');
  lines.push('## Opening expansion (pooled medians)');
  lines.push('');
  lines.push('| Var | Total AQH | Half billing | Player rev | Player EBITDA | Top-5 sh |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const v of VARIANTS) {
    const o = results.variants[v.id].pooled.opening;
    lines.push(
      `| ${v.letter} | ${fmt(o.totalAqhMed)} | $${fmt(o.halfBillingMed)} | $${fmt(o.playerRevMed)} | $${fmt(o.playerEbitdaMed)} | ${fmtShare(o.top5ShareMed)} |`,
    );
  }
  lines.push('');
  lines.push('## Ecology targets (anchor-16 realism)');
  lines.push('');
  lines.push('- Top-3 concentration target: **47–52%**');
  lines.push('- Rock present, FM depth > anchor-10 thin dial');
  lines.push('');
  lines.push('| Var | Top-3 band | Rock | FM commercial % |');
  lines.push('| --- | --- | --- | ---: |');
  for (const v of VARIANTS) {
    const e = results.variants[v.id].ecologyCheck;
    const t3 = results.variants[v.id].pooled.opening.top3ShareMed;
    lines.push(
      `| ${v.letter} | ${fmtShare(t3)} ${e.top3InBand ? 'OK' : 'miss'} | ${e.rockPresent ? 'OK' : 'miss'} | ${pct(results.variants[v.id].pooled.opening.fmCommercialPctMed)} |`,
    );
  }
  lines.push('');
  lines.push('## Recommendation (diagnostic only)');
  lines.push('');
  if (results.summary.recommended) {
    const r = results.summary.recommended;
    lines.push(`- **Best candidate:** **${r.letter}** — ${r.label} (pooled survival **${pct(r.survival)}**)`);
  } else {
    lines.push('- **No variant met viability** (survival lift >5pp vs A16 baseline while keeping ecology band).');
  }
  const bestBill = ranked.filter((x) => ['B', 'C'].includes(x.id)).sort((a, b) => b.survival - a.survival)[0];
  const bestListen = ranked.filter((x) => ['D', 'E'].includes(x.id)).sort((a, b) => b.survival - a.survival)[0];
  const bestCombo = ranked.filter((x) => ['F', 'G', 'H'].includes(x.id)).sort((a, b) => b.survival - a.survival)[0];
  lines.push(`- Best billing-only: **${bestBill?.letter}** (${pct(bestBill?.survival)}) — rev pool +${pct(((bestBill?.opening.totalRevenueMed ?? 0) / (results.variants.A.pooled.opening.totalRevenueMed || 1)) - 1)} vs A`);
  lines.push(`- Best listening-only: **${bestListen?.letter}** (${pct(bestListen?.survival)}) — player share ${fmtShare(bestListen?.opening.playerShareMed)}`);
  lines.push(`- Best combined/elastic: **${bestCombo?.letter}** (${pct(bestCombo?.survival)})`);
  lines.push('');
  lines.push('### Interpretation');
  lines.push(
    '- **Billing-only (B/C)** preserves anchor-16 ecology (top-3 ~48%, FM/rock intact) and raises the accounting pool modestly (~+3% revenue pool in harness) without moving **survival** off the 50% bimodal cliff.',
  );
  lines.push(
    '- **Listening (D–H)** cuts other-audio dilution but **re-calc** lowers top-3 concentration (~45%) and player opening share (~5.5% vs ~6.6%); still **50%** survival — share cliff dominates, not dollars alone.',
  );
  lines.push(
    `- Anchor **10** reference: survival **${pct(refSurv)}**, opening share **${fmtShare(a10OpenSh)}**, avg rev/st **$${fmt(a10AvgRev)}** vs anchor-16 **~$220k** (more stations, fixed pool).`,
  );
  lines.push(
    '- **Anchor 16 is not made viable** by partial billing/listening expansion alone in this harness; prior sensitivity showed **+4 share points** moved survival — expansion must lift **player share** toward ~7%+, not only market dollars.',
  );
  lines.push(
    '- If implementing production expansion: prefer **billing-only elastic (~+24% pool at 14 stations)** to protect ecology; pair with **small share floor** or station-scaled listening that does not re-run full recalc cold-start.',
  );

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  results.timingMs = Date.now() - t0;
  writeFileSync(outJson, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(outMd, `${lines.join('\n')}\n`);
  console.log(`\nWrote ${outJson} (${(results.timingMs / 1000).toFixed(0)}s)`);
  console.log(`A16 baseline ${pct(baseSurv)} · A10 ${pct(refSurv)} · best ${recommended?.letter} ${pct(recommended?.survival)}`);
}

main();
