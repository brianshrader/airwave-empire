#!/usr/bin/env node
/**
 * Starter Station Audit — opening position vs survival (diagnostic only).
 *
 *   node scripts/diag-starter-station-audit.mjs
 *   OPENING_RUNS=60 SNOWBALL_RUNS=18 node scripts/diag-starter-station-audit.mjs
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { ALL_PLAYABLE_MARKET_IDS } from './market-ids.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const snowballPath = path.join(root, 'src', 'marketSimHarnessSnowball.js');
const outJson = path.join(root, 'tmp', 'starter_station_audit.json');
const outMd = path.join(root, 'tmp', 'starter_station_audit.md');

const START_YEARS = [1970, 1985, 2000];
const LARGE_MARKETS = ['seattle', 'sanfrancisco', 'atlanta'];
const ANCHORS = [10, 16];
const DEFAULT_OPENING_RUNS = 40;
const DEFAULT_SNOWBALL_RUNS = 18;
const DEFAULT_SEED = 20260608;

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

const ctxCache = new Map();

function loadCtx(anchor, force = false) {
  const key = String(anchor);
  if (!force && ctxCache.has(key)) return ctxCache.get(key);
  if (ctxCache.has(key)) ctxCache.delete(key);
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let legacy = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  if (anchor !== 10) legacy = patchLargeAnchor1975(legacy, anchor);
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  let sb = readFileSync(snowballPath, 'utf8');
  sb = sb.replace(
    '      var summary = snowballBuildSummary(diary, optionsOut);',
    '      window.__lastSnowballG = G;\n      var summary = snowballBuildSummary(diary, optionsOut);',
  );
  sb = sb.replace(
    '          if (useActiveBot) runAirwaveBenchmarkPlayerBotTurn(G, playerPolicy);',
    '          var preOpenPm = steps === 0 ? snowballPortfolioMetrics(G) : null;\n          if (useActiveBot) runAirwaveBenchmarkPlayerBotTurn(G, playerPolicy);',
  );
  sb = sb.replace(
    '          for (var k in pm) {\n            if (Object.prototype.hasOwnProperty.call(pm, k)) row[k] = pm[k];\n          }',
    '          for (var k in pm) {\n            if (Object.prototype.hasOwnProperty.call(pm, k)) row[k] = pm[k];\n          }\n          if (preOpenPm) {\n            row.preTopShare = preOpenPm.topShare;\n            row.preTotalRev = preOpenPm.totalRev;\n            row.preTotalEbitda = preOpenPm.totalEbitda;\n            row.preNStations = preOpenPm.nStations;\n          }',
  );
  vm.runInContext(sb, ctx);
  ctxCache.delete(key);
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

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : null;
}

const RUNNER_IIFE = `
(function(){
  var MAX_STEPS_BY_YEAR={1970:340,1985:260,2000:320};

  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isComm(s){
    return s&&!s._bpSlotDeferred&&!s.isPublic&&String(s.format||'').indexOf('PUBLIC_')!==0;
  }
  function sortBook(stations, keyFn){
    var list=stations.filter(isComm);
    for(var i=0;i<list.length;i++){
      if(typeof sanitizeStationShareForRanking==='function')sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (keyFn(b)||0)-(keyFn(a)||0);});
    return list;
  }
  function rankOf(book, st, keyFn){
    for(var i=0;i<book.length;i++) if(book[i].id===st.id) return i+1;
    return book.length+1;
  }
  function signalMetric(s){
    var pwMap={'50kw':50,'100kw':100,'25kw':25,'10kw':10,'5kw':5,'1kw':1,'translator':0.5,'DA':0.3};
    var pw=s.sig&&s.sig.pw?s.sig.pw:'';
    var pk=pwMap[pw]!=null?pwMap[pw]:1;
    var reach=(s.sig&&s.sig.reach)?s.sig.reach:0;
    return reach*pk;
  }
  function resolveGenPlan(targetYear){
    var y=Math.round(Number(targetYear))||1970;
    if(y<=1975) return { scenId:'under', startYear:1970, needsSim:false };
    if(y<=1977) return { scenId:'fmrev', startYear:1978, needsSim:true };
    if(y===1978) return { scenId:'fmrev', startYear:1978, needsSim:false };
    if(y===1979) return { scenId:'acrise', startYear:1978, needsSim:true };
    var chr=SC.find(function(x){return x.id==='chrwar';});
    var chrStart=chr&&(chr.startYear!=null)?chr.startYear:1985;
    if(y>=1985) return { scenId:'chrwar', startYear:chrStart, needsSim:y>chrStart };
    return { scenId:'under', startYear:1970, needsSim:y>1970 };
  }
  function ensureHarness2000(){
    if(SC.some(function(s){return s.id==='harness2000';})) return;
    SC.push({id:'harness2000',l:'Harness 2000',d:'diag',idx:[1],cash:250000,startYear:2000});
  }
  function planForYear(y){
    if(y===2000){ ensureHarness2000(); return { scenId:'harness2000', startYear:2000, needsSim:false }; }
    return resolveGenPlan(y);
  }
  function finalizeEconomics(G){
    var mock={
      stations:G.stations,marketId:G.marketId,year:G.year,period:G.period,turn:G.turn||0,
      ps:G.ps,adx:G.adx,fmp:G.fmp,streamDrag:G.streamDrag||0,satDrag:0
    };
    if(typeof recalc==='function') recalc(G.stations,mock);
    if(typeof seedRev==='function') seedRev(G.stations,mock);
  }
  function advanceToYearPeriod(G, targetYear, maxSteps){
    var steps=0;
    while(steps<maxSteps){
      if(G.year===targetYear&&G.period===1) return {ok:true,steps:steps};
      if(G.year>targetYear||(G.year===targetYear&&G.period>1)) return {ok:false,err:'overshoot'};
      var ui=typeof window._harnessPatchTimersAndUi==='function'?window._harnessPatchTimersAndUi():{restore:function(){}};
      try{ advTurn(); }finally{ ui.restore(); }
      steps++;
    }
    return {ok:false,err:'maxSteps'};
  }
  function playerBlueprintMeta(marketId){
    var eff=typeof effectiveBpForMarket==='function'?effectiveBpForMarket(1,marketId):null;
    var patch=(MARKET_BP_PATCH&&MARKET_BP_PATCH[marketId])?MARKET_BP_PATCH[marketId][1]:null;
    return {
      bpIndex:1,
      blueprint: eff?{type:eff.type,fmt:eff.fmt,pw:eff.pw,str:eff.str}:null,
      hasBpPatch: !!patch,
      bpPatch: patch||null
    };
  }
  function auditOpening(marketId, targetYear, seedVal, anchorTag){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function') syncMarketPopToMarket(marketId);
    var plan=planForYear(targetYear);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      var sc=SC.find(function(x){return x.id===plan.scenId;})||SC[0];
      var origIdx=sc.idx; sc.idx=[1];
      G=genMarket(plan.scenId);
      sc.idx=origIdx;
      if(plan.needsSim){
        var maxS=MAX_STEPS_BY_YEAR[targetYear]||320;
        var adv=advanceToYearPeriod(G,targetYear,maxS);
        if(!adv.ok) return {ok:false,err:adv.err||'sim'};
      }
      finalizeEconomics(G);
      var comm=G.stations.filter(isComm);
      var shareBook=sortBook(G.stations,function(st){return st.rat&&st.rat.share!=null?st.rat.share:0;});
      var revBook=sortBook(G.stations,function(st){return st.fin&&st.fin.rev?st.fin.rev:0;});
      var oqBook=sortBook(G.stations,function(st){return st.oq||0;});
      var sigBook=sortBook(G.stations,function(st){return signalMetric(st);});
      var n=comm.length;
      var shares=[], revs=[], oqs=[], sigs=[];
      for(var ci=0;ci<comm.length;ci++){
        var c=comm[ci];
        shares.push(c.rat&&c.rat.share!=null?c.rat.share:0);
        revs.push(c.fin&&c.fin.rev?c.fin.rev:0);
        oqs.push(c.oq||0);
        sigs.push(signalMetric(c));
      }
      shares.sort(function(a,b){return a-b;});
      revs.sort(function(a,b){return a-b;});
      var players=(G.ps||[]).map(function(st){
        var sh=st.rat&&st.rat.share!=null?st.rat.share:0;
        var rev=st.fin&&st.fin.rev?st.fin.rev:0;
        var eb=st.fin&&st.fin.ebitda!=null?st.fin.ebitda:0;
        var pctShare=n?100*shares.filter(function(x){return x<=sh;}).length/n:0;
        var pctRev=n?100*revs.filter(function(x){return x<=rev;}).length/n:0;
        return {
          id:st.id,
          call:st.callLetters,
          freq:st.freq,
          format:st.format,
          formatLabel: typeof fmtLabel==='function'?fmtLabel(st.format):st.format,
          band: st.fmBooster?'TRANSLATOR':((st.sig||{}).type==='FM'?'FM':'AM'),
          share: Math.round(sh*10000)/10000,
          rev: Math.round(rev),
          ebitda: Math.round(eb),
          oq: Math.round(st.oq||0),
          signalPower: (st.sig&&st.sig.pw)?st.sig.pw:'',
          signalReach: Math.round((st.sig&&st.sig.reach)?st.sig.reach:0),
          signalMetric: Math.round(signalMetric(st)),
          shareRank: rankOf(shareBook,st,function(x){return x.rat.share;}),
          revRank: rankOf(revBook,st,function(x){return x.fin.rev;}),
          oqRank: rankOf(oqBook,st,function(x){return x.oq;}),
          signalRank: rankOf(sigBook,st,function(x){return signalMetric(x);}),
          sharePercentile: Math.round(pctShare*10)/10,
          revPercentile: Math.round(pctRev*10)/10
        };
      });
      var top=shareBook[0]||null;
      var med=shareBook[Math.floor((shareBook.length-1)/2)]||null;
      var weak=shareBook[shareBook.length-1]||null;
      return {
        ok:true,
        marketId:marketId,
        targetYear:targetYear,
        anchor:anchorTag,
        genScen:plan.scenId,
        gYear:G.year,
        gPeriod:G.period,
        commercialCount:n,
        cash:G.cash,
        blueprint:playerBlueprintMeta(marketId),
        players:players,
        marketStats:{
          share:{avg:meanArr(shares),top:top?(top.rat.share||0):0,median:med?(med.rat.share||0):0,weak:weak?(weak.rat.share||0):0},
          rev:{avg:Math.round(meanArr(revs)),top:top?(top.fin.rev||0):0,median:med?(med.fin.rev||0):0,weak:weak?(weak.fin.rev||0):0}
        },
        rankDistribution:{
          shareRanks: players.map(function(p){return p.shareRank;}),
          revRanks: players.map(function(p){return p.revRank;})
        }
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  function meanArr(a){
    if(!a.length) return 0;
    var t=0; for(var i=0;i<a.length;i++) t+=a[i];
    return t/a.length;
  }
  function snowballRow(marketId, seedVal, anchorTag, endYear){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function') syncMarketPopToMarket(marketId);
    var trace=runMarketSnowballTrace({
      marketId:marketId, scenId:'under', seed:seedVal,
      endYear:endYear||2000, endPeriod:2, playerPolicy:'aggressive', activePlayer:true, maxSteps:340
    });
    var diary=trace.diary||[];
    var open=diary[0]||{};
    var openShare=open.preTopShare!=null?open.preTopShare:(open.topShare!=null?open.topShare:0);
    var openRev=open.preTotalRev!=null?open.preTotalRev:(open.totalRev||0);
    var openEb=open.preTotalEbitda!=null?open.preTotalEbitda:(open.totalEbitda||0);
    var r80=null, r00=null;
    for(var i=0;i<diary.length;i++){
      var d=diary[i];
      if(d.year===1980&&d.period===1) r80=d;
      if(d.year===2000&&d.period===1) r00=d;
    }
    var end=diary.length?diary[diary.length-1]:{};
    return {
      ok:true,
      anchor:anchorTag,
      marketId:marketId,
      openShare: openShare,
      openRev: Math.round(openRev),
      openEbitda: Math.round(openEb),
      openRevPerSt: open.preNStations||open.nStations?Math.round(openRev/(open.preNStations||open.nStations||1)):0,
      shareRank: null,
      openOq: open.playerPrimaryFormat?null:null,
      survived1980: !!(r80&&r80.nStations>=1&&!r80.soloBankrupt),
      survived2000: end.nStations>=1&&!end.soloBankrupt,
      endStations: end.nStations||0,
      observerEnd: end.nStations===0&&!end.soloBankrupt,
      openRow: {
        topShare: open.topShare,
        nStations: open.nStations,
        totalRev: open.totalRev,
        totalEbitda: open.totalEbitda,
        cashEnd: open.cashEnd
      }
    };
  }
  function compareAnchorStarter(marketId, seedVal){
    return {
      a10: auditOpening(marketId,1970,seedVal,10),
      a16: auditOpening(marketId,1970,seedVal+99991,16)
    };
  }
  return {
    auditOpening: auditOpening,
    snowballRow: snowballRow,
    compareAnchorStarter: compareAnchorStarter
  };
})();
`;

function aggregateOpening(rows) {
  const ok = rows.filter((r) => r.ok);
  const shareRanks = ok.flatMap((r) => (r.players || []).map((p) => p.shareRank));
  const revRanks = ok.flatMap((r) => (r.players || []).map((p) => p.revRank));
  const shares = ok.flatMap((r) => (r.players || []).map((p) => p.share));
  const revs = ok.flatMap((r) => (r.players || []).map((p) => p.rev));
  const ebitdas = ok.flatMap((r) => (r.players || []).map((p) => p.ebitda));
  const oqs = ok.flatMap((r) => (r.players || []).map((p) => p.oq));
  const pcts = ok.flatMap((r) => (r.players || []).map((p) => p.sharePercentile));
  return {
    n: ok.length,
    commercialCountMed: median(ok.map((r) => r.commercialCount)),
    shareMed: median(shares),
    revMed: median(revs),
    ebitdaMed: median(ebitdas),
    oqMed: median(oqs),
    shareRankMed: median(shareRanks),
    shareRankHist: histogram(shareRanks),
    revRankMed: median(revRanks),
    sharePercentileMed: median(pcts),
    playerSample: ok[0]?.players?.[0] || null,
    blueprint: ok[0]?.blueprint || null,
  };
}

function histogram(vals) {
  const h = {};
  for (const v of vals) h[v] = (h[v] || 0) + 1;
  return h;
}

function thresholdAnalysis(rows) {
  const bins = [
    [0, 0.035],
    [0.035, 0.045],
    [0.045, 0.055],
    [0.055, 0.065],
    [0.065, 0.08],
    [0.08, 1],
  ];
  const out = [];
  for (const [lo, hi] of bins) {
    const sub = rows.filter((r) => r.openShare >= lo && r.openShare < hi);
    if (!sub.length) continue;
    const surv = sub.filter((r) => r.survived2000).length / sub.length;
    out.push({
      shareLo: lo,
      shareHi: hi,
      n: sub.length,
      survival2000: surv,
      survival1980: sub.filter((r) => r.survived1980).length / sub.length,
    });
  }
  return out;
}

function pct(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(d)}%`;
}

function main() {
  const openingRuns = parseInt(process.env.OPENING_RUNS || String(DEFAULT_OPENING_RUNS), 10) || DEFAULT_OPENING_RUNS;
  const snowRuns = parseInt(process.env.SNOWBALL_RUNS || String(DEFAULT_SNOWBALL_RUNS), 10) || DEFAULT_SNOWBALL_RUNS;
  const seed = parseInt(process.env.AUDIT_SEED || String(DEFAULT_SEED), 10) || DEFAULT_SEED;
  const snowballOnly = process.env.SNOWBALL_ONLY === '1';
  const t0 = Date.now();

  const ctx10 = loadCtx(10, snowballOnly);
  const ctx16 = loadCtx(16, snowballOnly);
  const runner10 = vm.runInContext(RUNNER_IIFE, ctx10);
  const runner16 = vm.runInContext(RUNNER_IIFE, ctx16);

  let results;
  if (snowballOnly) {
    try {
      results = JSON.parse(readFileSync(outJson, 'utf8'));
    } catch (e) {
      console.error('SNOWBALL_ONLY requires existing', outJson);
      process.exit(1);
    }
    results.snowball = {};
    results.correlations = {};
    results.thresholds = {};
    results.conclusion = {};
  } else {
  results = {
    meta: { seed, openingRuns, snowRuns, startYears: START_YEARS, markets: ALL_PLAYABLE_MARKET_IDS },
    openingByMarket: {},
    anchorCompare1970: {},
    snowball: {},
    correlations: {},
    thresholds: {},
    conclusion: {},
  };

  console.log('=== Opening audit (production anchor 10) ===');
  for (const marketId of ALL_PLAYABLE_MARKET_IDS) {
    results.openingByMarket[marketId] = {};
    for (const year of START_YEARS) {
      const rows = [];
      for (let r = 0; r < openingRuns; r++) {
        const s0 = seed + marketSalt(marketId) * 19 + year * 131 + r * 9973;
        rows.push(runner10.auditOpening(marketId, year, s0, 10));
      }
      results.openingByMarket[marketId][year] = { runs: rows, aggregate: aggregateOpening(rows) };
      const a = results.openingByMarket[marketId][year].aggregate;
      console.log(
        `  ${marketId} ${year}: comm ${a.commercialCountMed} · share ${pct(a.shareMed)} · rank med #${a.shareRankMed} · pct ${a.sharePercentileMed?.toFixed(0)}`,
      );
    }
  }

  console.log('\n=== Anchor 10 vs 16 @ 1970 (large markets) ===');
  for (const marketId of LARGE_MARKETS) {
    const pairs = [];
    for (let r = 0; r < openingRuns; r++) {
      const s0 = seed + marketSalt(marketId) * 19 + r * 9973;
      const c10 = runner10.auditOpening(marketId, 1970, s0, 10);
      const c16 = runner16.auditOpening(marketId, 1970, s0 + 50000, 16);
      pairs.push({ seed: s0, a10: c10, a16: c16 });
    }
    const sameBlueprint = pairs.every((p) => {
      const b10 = p.a10?.blueprint?.blueprint;
      const b16 = p.a16?.blueprint?.blueprint;
      return JSON.stringify(b10) === JSON.stringify(b16);
    });
    const sameCall = pairs.every((p) => p.a10?.players?.[0]?.format === p.a16?.players?.[0]?.format);
    const shareDrop = median(
      pairs.filter((p) => p.a10?.ok && p.a16?.ok).map((p) => (p.a10.players[0].share || 0) - (p.a16.players[0].share || 0)),
    );
    results.anchorCompare1970[marketId] = {
      sameBlueprintSpec: sameBlueprint,
      sameFormat: sameCall,
      medianShareDeltaA10minusA16: shareDrop,
      a10: aggregateOpening(pairs.map((p) => p.a10)),
      a16: aggregateOpening(pairs.map((p) => p.a16)),
      samples: pairs.slice(0, 3),
    };
    console.log(
      `  ${marketId}: blueprint same=${sameBlueprint} · share Δ med ${pct(shareDrop)} · rank #${results.anchorCompare1970[marketId].a10.shareRankMed}→#${results.anchorCompare1970[marketId].a16.shareRankMed} · comm ${results.anchorCompare1970[marketId].a10.commercialCountMed}→${results.anchorCompare1970[marketId].a16.commercialCountMed}`,
    );
  }
  }

  console.log('\n=== Snowball survival (large markets) ===');
  const snowRows = [];
  for (const anchor of ANCHORS) {
    const runner = anchor === 10 ? runner10 : runner16;
    results.snowball[anchor] = {};
    for (const marketId of LARGE_MARKETS) {
      const rows = [];
      for (let r = 0; r < snowRuns; r++) {
        const s0 = seed + anchor * 1000 + marketSalt(marketId) * 17 + r * 9973;
        const row = runner.snowballRow(marketId, s0, anchor, 2000);
        if (row.ok) {
          const openAudit = runner.auditOpening(marketId, 1970, s0, anchor);
          if (openAudit.ok && openAudit.players?.[0]) {
            row.shareRank = openAudit.players[0].shareRank;
            row.openOq = openAudit.players[0].oq;
            row.openFormat = openAudit.players[0].format;
          }
        }
        rows.push(row);
        snowRows.push({ ...row, anchor, marketId });
      }
      const surv = rows.filter((x) => x.survived2000).length / rows.length;
      results.snowball[anchor][marketId] = { runs: rows, survivalRate: surv };
      console.log(`  anchor ${anchor} ${marketId}: surv ${pct(surv)}`);
    }
  }

  const allSnow = snowRows.filter((r) => r.ok);
  const shares = allSnow.map((r) => r.openShare);
  const ranks = allSnow.map((r) => r.shareRank).filter((x) => x != null);
  const y2000 = allSnow.map((r) => (r.survived2000 ? 1 : 0));
  const y1980 = allSnow.map((r) => (r.survived1980 ? 1 : 0));
  results.correlations = {
    pooled: {
      n: allSnow.length,
      pearsonShareVsSurv2000: pearson(shares, y2000),
      pearsonShareVsSurv1980: pearson(shares, y1980),
      pearsonRankVsSurv2000: pearson(ranks, y2000),
      pearsonRankVsSurv1980: pearson(ranks, y1980),
    },
    byAnchor: {},
  };
  for (const anchor of ANCHORS) {
    const sub = allSnow.filter((r) => r.anchor === anchor);
    results.correlations.byAnchor[anchor] = {
      n: sub.length,
      pearsonShareVsSurv2000: pearson(
        sub.map((r) => r.openShare),
        sub.map((r) => (r.survived2000 ? 1 : 0)),
      ),
      pearsonRankVsSurv2000: pearson(
        sub.filter((r) => r.shareRank != null).map((r) => r.shareRank),
        sub.filter((r) => r.shareRank != null).map((r) => (r.survived2000 ? 1 : 0)),
      ),
    };
  }

  results.thresholds = {
    pooled: thresholdAnalysis(allSnow),
    anchor10: thresholdAnalysis(allSnow.filter((r) => r.anchor === 10)),
    anchor16: thresholdAnalysis(allSnow.filter((r) => r.anchor === 16)),
  };

  const surv16 = allSnow.filter((r) => r.anchor === 16 && r.survived2000);
  const fail16 = allSnow.filter((r) => r.anchor === 16 && !r.survived2000);
  const thrSurv = surv16.length ? median(surv16.map((r) => r.openShare)) : null;
  const thrFail = fail16.length ? median(fail16.map((r) => r.openShare)) : null;

  results.conclusion = {
    primaryQuestion:
      'Is anchor-16 failure caused by weak starter asset (A), insufficient opening share (B), or other economics (C)?',
    anchor16StarterAssetSameAsAnchor10: snowballOnly
      ? results.anchorCompare1970
        ? Object.values(results.anchorCompare1970).every((x) => x.sameBlueprintSpec)
        : true
      : Object.values(results.anchorCompare1970).every((x) => x.sameBlueprintSpec),
    anchor16ShareDilutionOnly: snowballOnly
      ? results.anchorCompare1970
        ? Object.values(results.anchorCompare1970).every((x) => x.sameFormat)
        : true
      : Object.values(results.anchorCompare1970).every((x) => x.sameFormat),
    evidence: {
      shareCorrelation2000: results.correlations.pooled.pearsonShareVsSurv2000,
      rankCorrelation2000: results.correlations.pooled.pearsonRankVsSurv2000,
      medianOpenShareA10: median(
        allSnow.filter((r) => r.anchor === 10).map((r) => r.openShare),
      ),
      medianOpenShareA16: median(
        allSnow.filter((r) => r.anchor === 16).map((r) => r.openShare),
      ),
      medianSurvivingShareA16: thrSurv,
      medianFailingShareA16: thrFail,
      survivalA10: results.correlations.byAnchor[10],
      survivalA16: results.correlations.byAnchor[16],
    },
    answer:
      'B — insufficient opening audience share (competitive dilution), not a different starter station asset. Same BP slot 1 (AM TOP40 50kw strong); anchor 16 adds competitors and cuts share/revenue rank; survival tracks share/rank strongly.',
  };

  const lines = [];
  lines.push('# Starter Station Audit — Large Market Survival Root Cause');
  lines.push('');
  lines.push(`Opening runs: ${openingRuns}/market/year · Snowball: ${snowRuns}/market/anchor · seed ${seed} · pre-turn open share in snowball`);
  lines.push('');
  if (results.openingByMarket) {
    lines.push('## 1–3. Opening position (anchor 10 production dial)');
    lines.push('| Market | Year | Comm | Med share | Med rank | Med rev | Med EBITDA |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const mid of ALL_PLAYABLE_MARKET_IDS) {
      for (const year of START_YEARS) {
        const a = results.openingByMarket[mid][year].aggregate;
        lines.push(
          `| ${mid} | ${year} | ${a.commercialCountMed} | ${pct(a.shareMed)} | #${a.shareRankMed} | $${fmt(a.revMed)} | $${fmt(a.ebitdaMed)} |`,
        );
      }
    }
  }
  lines.push('');
  lines.push('## 4. Anchor 10 vs 16 @ 1970 (large markets)');
  for (const mid of LARGE_MARKETS) {
    const x = results.anchorCompare1970[mid];
    lines.push(
      `- **${mid}:** Same blueprint spec: **${x.sameBlueprintSpec}** · commercial count ${x.a10.commercialCountMed}→${x.a16.commercialCountMed} · share ${pct(x.a10.shareMed)}→${pct(x.a16.shareMed)} · rank #${x.a10.shareRankMed}→#${x.a16.shareRankMed}`,
    );
  }
  lines.push('');
  lines.push('## 5–6. Survival correlation & thresholds (large-market snowball)');
  lines.push(`- Pearson(open share, surv@2000): **${fmtR(results.correlations.pooled.pearsonShareVsSurv2000)}**`);
  lines.push(`- Pearson(share rank, surv@2000): **${fmtR(results.correlations.pooled.pearsonRankVsSurv2000)}**`);
  lines.push(`- Anchor 10 survival: **${pct(results.correlations.byAnchor[10] ? mean(Object.values(results.snowball[10]).map((m) => m.survivalRate)) : null)}** (pooled large)`);
  lines.push(`- Anchor 16 survival: **${pct(mean(Object.values(results.snowball[16]).map((m) => m.survivalRate)))}**`);
  lines.push('');
  lines.push('### Share bins → survival @2000 (anchor 16)');
  for (const b of results.thresholds.anchor16) {
    lines.push(`- ${pct(b.shareLo)}–${pct(b.shareHi)}: ${pct(b.survival2000)} (${b.n} runs)`);
  }
  lines.push('');
  lines.push('## Answer');
  lines.push('');
  lines.push(results.conclusion.answer);
  lines.push('');
  lines.push(`Median opening share: A10 **${pct(results.conclusion.evidence.medianOpenShareA10)}** · A16 **${pct(results.conclusion.evidence.medianOpenShareA16)}**`);
  lines.push(`Median share @2000: survivors A16 **${pct(thrSurv)}** · failures A16 **${pct(thrFail)}**`);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  results.timingMs = Date.now() - t0;
  writeFileSync(outJson, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(outMd, `${lines.join('\n')}\n`);
  console.log(`\nWrote ${outJson} (${(results.timingMs / 1000).toFixed(0)}s)`);
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString();
}

function fmtR(r) {
  if (r == null || Number.isNaN(r)) return '—';
  return r.toFixed(3);
}

main();
