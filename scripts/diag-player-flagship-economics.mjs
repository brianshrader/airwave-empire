#!/usr/bin/env node
/**
 * Player Flagship Economics Audit (diagnostic only — no gameplay changes).
 *
 * Compares passive AI market sim vs benchmark-player flagship policy, and tests
 * whether `isPlayer` directly distorts station economics at snapshot.
 *
 *   npm run diag:player-flagship-economics
 *   node scripts/diag-player-flagship-economics.mjs --runs=6
 *
 * Artifacts: tmp/player_flagship_economics.json, tmp/player_flagship_economics.md
 */
/* eslint-disable no-console */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const talentPath = path.join(root, 'src', 'talentRetention.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const snowballPath = path.join(root, 'src', 'marketSimHarnessSnowball.js');
const outJson = path.join(root, 'tmp', 'player_flagship_economics.json');
const outMd = path.join(root, 'tmp', 'player_flagship_economics.md');

const MARKETS = ['sanfrancisco', 'seattle', 'atlanta', 'nashville', 'wichita'];
const LARGE_MARKET_IDS = new Set(['seattle', 'sanfrancisco', 'atlanta']);
const START_YEARS = [1970, 1985];
const SNAPSHOT_YEARS = [1980, 1990, 2000, 2010, 2020];
const END_YEAR = 2020;
const AC_FORMATS = new Set(['ADULT_CONTEMP', 'HOT_AC', 'TOP40', 'MOR', 'ADULT_STANDARDS']);
const DEFAULT_RUNS = 4;
const DEFAULT_SEED = 20260616;

const ERA_BANDS = [
  { id: '1980s', min: 1980, max: 1989 },
  { id: '1990s', min: 1990, max: 1999 },
  { id: '2000s', min: 2000, max: 2009 },
  { id: '2010s', min: 2010, max: 2019 },
  { id: '2020s', min: 2020, max: 2030 },
];

function injectHeadlessDiagFixes(src) {
  let out = src.replace(
    'function staffingAutomationAppealTradeoffMult(s,G){\n  const t=stationAutomationScore(s,G);\n  const fmt=staffingAutomationFormatPenaltyMult(s.format);',
    'function staffingAutomationAppealTradeoffMult(s,G){\n  const t=stationAutomationScore(s,G);\n  let fmt=staffingAutomationFormatPenaltyMult(s.format);',
  );
  out = out.replace(
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
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Buffer,
    Promise,
    parseInt,
    parseFloat,
    isFinite,
    Infinity,
    NaN,
    undefined,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

const ctxCache = new Map();

function loadCtx(marketId) {
  const key = LARGE_MARKET_IDS.has(marketId) ? 'large16' : 'default';
  if (ctxCache.has(key)) return ctxCache.get(key);
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let legacy = injectHeadlessDiagFixes(readFileSync(legacyPath, 'utf8'));
  if (key === 'large16') legacy = patchLargeAnchor1975(legacy, 16);
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(readFileSync(talentPath, 'utf8'), ctx, { filename: 'talentRetention.js', timeout: 120_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  vm.runInContext(readFileSync(snowballPath, 'utf8'), ctx);
  ctxCache.set(key, ctx);
  return ctx;
}

const RUNNER_IIFE = `
(function(cfg){
  var SNAPSHOT_YEARS=cfg.snapshotYears;
  var END_YEAR=cfg.endYear;
  var PLAYER_POLICY='aggressive';
  var DAYPARTS=['morningDrive','midday','afternoonDrive','evening','overnight'];
  var AC_FMTS={'ADULT_CONTEMP':1,'HOT_AC':1,'TOP40':1,'MOR':1,'ADULT_STANDARDS':1};

  function isComm(s){
    return s&&!s._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'&&!stationIsNoncommercialInstitutional(s);
  }
  function sortBook(stations){
    var list=stations.filter(isComm);
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++) sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){ return (b.rat&&b.rat.share||0)-(a.rat&&a.rat.share||0); });
    return list;
  }
  function playerStations(G){
    if(G.ps&&G.ps.length) return G.ps.filter(function(s){ return s&&s.isPlayer; });
    return (G.stations||[]).filter(function(s){ return s&&s.isPlayer; });
  }
  function pickPlayerFlagship(G){
    var ps=playerStations(G).filter(isComm);
    if(!ps.length) return null;
    ps.forEach(function(s){ if(typeof calcRev==='function') calcRev(s,G); });
    ps.sort(function(a,b){
      var ra=a.fin&&a.fin.rev?a.fin.rev:0;
      var rb=b.fin&&b.fin.rev?b.fin.rev:0;
      if(rb!==ra) return rb-ra;
      return (b.rat&&b.rat.share||0)-(a.rat&&a.rat.share||0);
    });
    return ps[0];
  }
  function scanSf1980PlayerHits(G, cfg){
    var hits=[];
    if(cfg.marketId!=='sanfrancisco'||G.year!==1980||G.period!==1) return hits;
    playerStations(G).filter(isComm).forEach(function(s){
      if(typeof calcRev==='function') calcRev(s,G);
      var rev=s.fin&&s.fin.rev?s.fin.rev:0;
      var margin=rev>5000&&s.fin&&s.fin.ebitda!=null?((s.fin.ebitda)/rev):null;
      var sig=(s.sig&&s.sig.type)||'';
      if(sig==='FM'&&AC_FMTS[s.format]&&rev>=1500000&&margin!=null&&margin>=0.40){
        hits.push({
          seed:cfg.seed,
          startYear:cfg.startYear,
          stationId:s.id,
          callLetters:s.callLetters||'',
          format:s.format,
          rev:Math.round(rev),
          expenses:Math.round(s.fin.cost||0),
          ebitda:Math.round(s.fin.ebitda||0),
          ebitdaMargin:Math.round(margin*10000)/10000,
          share:Math.round((s.rat&&s.rat.share||0)*10000)/10000
        });
      }
    });
    return hits;
  }
  function pickAiRank1(G){
    var book=sortBook(G.stations);
    for(var i=0;i<book.length;i++){
      if(!book[i].isPlayer) return {st:book[i], rank:i+1, n:book.length};
    }
    return null;
  }
  function ownerType(s){
    if(s.isPlayer) return 'player';
    if(s.corpOwner) return 'corporate';
    return 'ai_independent';
  }
  function signalBand(s){
    if(s.stream&&s.stream.active) return 'stream';
    return (s.sig&&s.sig.type)||'AM';
  }
  function slotLineup(s){
    var staffed=0, vacant=0, auto=0;
    var q={morning:null,midday:null,afternoon:null,evening:null};
    DAYPARTS.forEach(function(sl){
      var sd=s.prog&&s.prog[sl];
      if(!sd){ vacant++; return; }
      var qual=sd.quality!=null?Math.round(sd.quality):null;
      if(sl==='morningDrive') q.morning=qual;
      else if(sl==='midday') q.midday=qual;
      else if(sl==='afternoonDrive') q.afternoon=qual;
      else if(sl==='evening') q.evening=qual;
      if(sd.talent){ staffed++; return; }
      if(qual!=null&&qual<28) auto++;
      else vacant++;
    });
    return { staffed:staffed, vacant:vacant, automated:auto, q:q };
  }
  function periodTalentPayroll(s){
    var finTal=s.fin&&s.fin.tal!=null?s.fin.tal:0;
    if(finTal>0) return Math.round(finTal);
    var sum=0;
    DAYPARTS.forEach(function(sl){
      var sd=s.prog&&s.prog[sl];
      if(sd&&sd.talent&&sd.talent.salary) sum+=Math.round((sd.talent.salary||0)/2);
    });
    return sum;
  }
  function captureStationRow(s, G, rank, nComm, extra){
    if(typeof calcRev==='function') calcRev(s, G);
    var rev=s.fin&&s.fin.rev?s.fin.rev:0;
    var cost=s.fin&&s.fin.cost?s.fin.cost:0;
    var ebitda=s.fin&&s.fin.ebitda!=null?s.fin.ebitda:(rev-cost);
    var fix=s.fin&&s.fin.fix?s.fin.fix:0;
    var talPeriod=periodTalentPayroll(s);
    var lineup=slotLineup(s);
    var row={
      marketId:G.marketId,
      year:G.year,
      stationId:s.id,
      callLetters:s.callLetters||'',
      format:s.format||'',
      ownerType:ownerType(s),
      isPlayer:!!s.isPlayer,
      signal:signalBand(s),
      rank:rank,
      nCommercial:nComm,
      share:Math.round((s.rat&&s.rat.share||0)*10000)/10000,
      rev:Math.round(rev),
      expenses:Math.round(cost),
      ebitda:Math.round(ebitda),
      ebitdaMargin:rev>5000?Math.round((ebitda/rev)*10000)/10000:null,
      fixedCost:Math.round(fix),
      talentPayrollAnnual:Math.round(talPeriod*2),
      talentPayrollPctRev:rev>5000?Math.round((talPeriod/rev)*10000)/10000:null,
      fixedCostPctRev:rev>5000?Math.round((fix/rev)*10000)/10000:null,
      sellout:Math.round((s.ops&&s.ops.sell||0)*10000)/10000,
      oq:Math.round(s.oq||0),
      identity:Math.round(s.identity||0),
      morningQ:lineup.q.morning,
      middayQ:lineup.q.midday,
      afternoonQ:lineup.q.afternoon,
      eveningQ:lineup.q.evening,
      staffedDayparts:lineup.staffed,
      vacantDayparts:lineup.vacant,
      automatedDayparts:lineup.automated,
      digitalRev:Math.round(s.fin&&s.fin.digitalRev?s.fin.digitalRev:0),
      digitalShare:Math.round((s.fin&&s.fin.digitalShare?s.fin.digitalShare:0)*10000)/10000,
      streamActive:!!(s.stream&&s.stream.active),
      opsPromo:Math.round(s.ops&&s.ops.promo?s.ops.promo:0),
      opsProgBudget:Math.round(s.ops&&s.ops.progBudget?s.ops.progBudget:0),
      effPromo:Math.round(s.fin&&s.fin.effPromo?s.fin.effPromo:0),
      effProg:Math.round(s.fin&&s.fin.effProg?s.fin.effProg:0),
      baselinePromo:Math.round(s.fin&&s.fin.competitiveBaselinePromo?s.fin.competitiveBaselinePromo:0),
      baselineProg:Math.round(s.fin&&s.fin.competitiveBaselineProg?s.fin.competitiveBaselineProg:0),
      harnessPlayerRevMult:typeof G._wlHarnessPlayerRevMult==='number'?G._wlHarnessPlayerRevMult:null
    };
    if(extra){
      for(var k in extra){
        if(Object.prototype.hasOwnProperty.call(extra,k)) row[k]=extra[k];
      }
    }
    return row;
  }
  function captureDepFlagRow(s, G, rank, nComm){
    var Gc;
    try{ Gc=JSON.parse(JSON.stringify(G)); }catch(e){ return null; }
    var st=(Gc.stations||[]).find(function(x){ return x&&x.id===s.id; });
    if(!st) return null;
    st.isPlayer=false;
    Gc.ps=(Gc.stations||[]).filter(function(x){ return x&&x.isPlayer; });
    if(typeof recalc==='function') recalc(Gc.stations, Gc);
    (Gc.stations||[]).forEach(function(x){
      if(x&&!x._bpSlotDeferred&&isComm(x)) calcRev(x, Gc);
    });
    return captureStationRow(st, Gc, rank, nComm, {playerFlagStripped:true, runType:'dep_flag'});
  }
  function pickCutSlot(s){
    var order=['afternoonDrive','midday','evening','overnight'];
    for(var i=0;i<order.length;i++){
      var sd=s.prog&&s.prog[order[i]];
      if(sd&&sd.talent) return order[i];
    }
    return null;
  }
  function whatIfCutDaypart(G, s, slot){
    if(!slot||!s.prog||!s.prog[slot]||!s.prog[slot].talent) return null;
    calcRev(s, G);
    var revBefore=s.fin&&s.fin.rev?s.fin.rev:0;
    var ebitdaBefore=s.fin&&s.fin.ebitda!=null?s.fin.ebitda:0;
    var salarySaveAnnual=Math.round((s.prog[slot].talent.salary||0));
    var qualBefore=s.prog[slot].quality!=null?s.prog[slot].quality:40;
    var saveHalf=typeof payrollHalfPeriodForDaypartSlot==='function'
      ?Math.round(payrollHalfPeriodForDaypartSlot({talent:{salary:salarySaveAnnual}}))
      :Math.round(salarySaveAnnual/2);
    var Gc;
    try{ Gc=JSON.parse(JSON.stringify(G)); }catch(e){ return null; }
    var st=(Gc.stations||[]).find(function(x){ return x&&x.id===s.id; });
    if(!st||!st.prog||!st.prog[slot]) return null;
    var sd=st.prog[slot];
    sd.talent=null;
    sd.quality=Math.max(12, Math.round(qualBefore*0.72));
    if(typeof refreshStationOQ==='function') refreshStationOQ(st, Gc);
    if(typeof recalc==='function') recalc(Gc.stations, Gc);
    (Gc.stations||[]).forEach(function(x){
      if(x&&!x._bpSlotDeferred&&isComm(x)) calcRev(x, Gc);
    });
    var revAfter=st.fin&&st.fin.rev?st.fin.rev:0;
    var ebitdaAfter=st.fin&&st.fin.ebitda!=null?st.fin.ebitda:0;
    return {
      slot:slot,
      salarySaveAnnual:salarySaveAnnual,
      salarySavePeriod:saveHalf,
      ebitdaBefore:Math.round(ebitdaBefore),
      ebitdaAfter:Math.round(ebitdaAfter),
      revDelta:Math.round(revAfter-revBefore),
      ebitdaDelta:Math.round(ebitdaAfter-ebitdaBefore),
      netBetter:ebitdaAfter>ebitdaBefore
    };
  }
  function bootstrap(marketId, startYear, runType){
    var sc=SC.find(function(x){ return x.id==='under'; });
    if(!sc) return {ok:false, err:'no_scenario'};
    var savedIdx=sc.idx.slice();
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function') syncMarketPopToMarket(marketId);
    if(runType==='passive_ai') sc.idx=[];
    var g;
    try{
      g=genMarket('under');
    }catch(e){
      sc.idx=savedIdx;
      return {ok:false, err:'gen_throw', message:String(e&&e.message||e)};
    }
    sc.idx=savedIdx;
    if(typeof wlBindGameState==='function') wlBindGameState(g);
    else G=g;
    if(runType==='passive_ai'){
      (g.stations||[]).forEach(function(st){ if(st) st.isPlayer=false; });
      g.ps=[];
      g._wlHarnessDeterministic=true;
    }else{
      g.ps=(g.stations||[]).filter(function(st){ return st&&st.isPlayer; });
      delete g._wlHarnessDeterministic;
    }
    if(!g.news) g.news=[];
    var targetYear=Math.round(Number(startYear))||1970;
    var guard=0;
    while((g.year<targetYear||(g.year===targetYear&&g.period!==1))&&guard<500){
      if(runType==='player_flagship'&&typeof runAirwaveBenchmarkPlayerBotTurn==='function'){
        runAirwaveBenchmarkPlayerBotTurn(g, PLAYER_POLICY);
      }
      try{ advTurn(); }catch(e){
        return {ok:false, err:'adv_throw', year:g.year, period:g.period, message:String(e&&e.message||e)};
      }
      guard++;
    }
    if(g.year!==targetYear||g.period!==1){
      return {ok:false, err:'warmup_miss', year:g.year, period:g.period, targetYear:targetYear, guard:guard};
    }
    return {ok:true, G:g};
  }
  function captureYear(G, snapYear, runType){
    if(G.year!==snapYear||G.period!==1) return null;
    var book=sortBook(G.stations);
    var rows=[];
    for(var i=0;i<book.length;i++){
      rows.push(captureStationRow(book[i], G, i+1, book.length, {runType:runType}));
    }
    var out={rows:rows, runType:runType, year:snapYear};
    var flagship=pickPlayerFlagship(G);
    var ai1=pickAiRank1(G);
    if(flagship&&runType==='player_flagship'){
      var rk=book.findIndex(function(x){ return x&&x.id===flagship.id; })+1;
      out.flagship=captureStationRow(flagship, G, rk||1, book.length, {runType:'player_flagship', role:'flagship'});
      out.depFlag=captureDepFlagRow(flagship, G, rk||1, book.length);
      if(out.depFlag&&out.flagship){
        out.depDelta={
          rev:out.depFlag.rev-out.flagship.rev,
          expenses:out.depFlag.expenses-out.flagship.expenses,
          ebitda:out.depFlag.ebitda-out.flagship.ebitda,
          ebitdaMargin:(out.depFlag.ebitdaMargin!=null&&out.flagship.ebitdaMargin!=null)
            ?Math.round((out.depFlag.ebitdaMargin-out.flagship.ebitdaMargin)*10000)/10000:null,
          sellout:Math.round((out.depFlag.sellout-out.flagship.sellout)*10000)/10000,
          share:Math.round((out.depFlag.share-out.flagship.share)*10000)/10000
        };
      }
      var slot=pickCutSlot(flagship);
      if(slot) out.whatIf=whatIfCutDaypart(G, flagship, slot);
    }
    if(ai1){
      out.aiRank1=captureStationRow(ai1.st, G, ai1.rank, ai1.n, {runType:runType, role:'ai_rank1'});
      if(out.flagship){
        out.flagshipVsAi1={
          shareDelta:Math.round((out.flagship.share-out.aiRank1.share)*10000)/10000,
          revDelta:out.flagship.rev-out.aiRank1.rev,
          expenseDelta:out.flagship.expenses-out.aiRank1.expenses,
          ebitdaDelta:out.flagship.ebitda-out.aiRank1.ebitda,
          marginDelta:(out.flagship.ebitdaMargin!=null&&out.aiRank1.ebitdaMargin!=null)
            ?Math.round((out.flagship.ebitdaMargin-out.aiRank1.ebitdaMargin)*10000)/10000:null
        };
      }
    }
    return out;
  }
  function runOne(cfg){
    var s=cfg.seed;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    var ui=window._harnessPatchTimersAndUi?window._harnessPatchTimersAndUi():null;
    try{
      var boot=bootstrap(cfg.marketId, cfg.startYear, cfg.runType);
      if(!boot.ok) return {ok:false, err:boot.err, detail:boot, marketId:cfg.marketId, startYear:cfg.startYear, runType:cfg.runType, seed:cfg.seed};
      if(typeof wlBindGameState==='function') wlBindGameState(boot.G);
      else G=boot.G;
      var snapshots={};
      var sf1980Hits=[];
      var startY=Math.round(Number(cfg.startYear))||1970;
      var maxSteps=Math.min(320, (END_YEAR-startY)*2+24);
      var steps=0;
      function maybeCapture(){
        var y=Math.round(Number(G.year));
        if(SNAPSHOT_YEARS.indexOf(y)<0||G.period!==1||y<startY) return;
        if(snapshots[y]) return;
        var cap=captureYear(G, y, cfg.runType);
        if(!cap) return;
        snapshots[y]=cap;
        if(cfg.runType==='player_flagship'&&y===1980){
          sf1980Hits=sf1980Hits.concat(scanSf1980PlayerHits(G, cfg));
        }
      }
      maybeCapture();
      while(steps<maxSteps){
        if(G.year>END_YEAR||(G.year===END_YEAR&&G.period>1)) break;
        if(cfg.runType==='player_flagship'&&typeof runAirwaveBenchmarkPlayerBotTurn==='function'){
          runAirwaveBenchmarkPlayerBotTurn(G, PLAYER_POLICY);
        }
        try{ advTurn(); }catch(e){
          return {ok:false, err:'sim_throw', year:G.year, period:G.period, steps:steps, message:String(e&&e.message||e)};
        }
        steps++;
        maybeCapture();
      }
      maybeCapture();
      return {
        ok:true,
        marketId:cfg.marketId,
        startYear:cfg.startYear,
        seed:cfg.seed,
        runType:cfg.runType,
        steps:steps,
        endYear:G.year,
        endPeriod:G.period,
        snapshots:snapshots,
        sf1980Hits:sf1980Hits
      };
    }catch(e){
      return {ok:false, err:'run_throw', message:String(e&&e.message||e), marketId:cfg.marketId, startYear:cfg.startYear, runType:cfg.runType, seed:cfg.seed};
    }finally{
      if(ui&&ui.restore) ui.restore();
    }
  }
  return cfg.runs.map(function(r){ return runOne(r); });
})
`;

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function eraForYear(y) {
  const band = ERA_BANDS.find((e) => y >= e.min && y <= e.max);
  return band ? band.id : 'other';
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function distStats(values) {
  const xs = values.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  return {
    n: xs.length,
    median: percentile(xs, 0.5),
    p25: percentile(xs, 0.25),
    p75: percentile(xs, 0.75),
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
  };
}

function pctFrac(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function money(x) {
  if (x == null || Number.isNaN(x)) return '—';
  if (Math.abs(x) >= 1e6) return `$${(x / 1e6).toFixed(2)}M`;
  if (Math.abs(x) >= 1e3) return `$${Math.round(x / 1000)}K`;
  return `$${Math.round(x)}`;
}

function aggregateGroup(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const k = keyFn(row);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  const out = {};
  for (const [k, list] of groups) {
    const margins = list.map((r) => r.ebitdaMargin).filter((m) => m != null);
    const mDist = distStats(margins);
    out[k] = {
      n: list.length,
      medianRev: distStats(list.map((r) => r.rev))?.median ?? null,
      medianEbitda: distStats(list.map((r) => r.ebitda))?.median ?? null,
      medianEbitdaMargin: mDist?.median ?? null,
      pctMarginAbove30: margins.length ? margins.filter((m) => m > 0.3).length / margins.length : null,
      pctMarginAbove40: margins.length ? margins.filter((m) => m > 0.4).length / margins.length : null,
      pctMarginAbove50: margins.length ? margins.filter((m) => m > 0.5).length / margins.length : null,
      medianTalentPayrollPctRev: distStats(list.map((r) => r.talentPayrollPctRev).filter(Boolean))?.median ?? null,
      medianFixedCostPctRev: distStats(list.map((r) => r.fixedCostPctRev).filter(Boolean))?.median ?? null,
    };
  }
  return out;
}

function buildVerdict(report) {
  const signals = [];
  let score = { plausible: 0, tooProfitable: 0, aiWeak: 0, flagDistort: 0 };

  const repro = report.sf1980Reproduction;
  if (repro?.reproduced) {
    score.plausible += 1;
    signals.push(
      `SF 1980 player flagship reproduced in ${repro.hitCount}/${repro.playerRuns} player runs (rev ${money(repro.bestRev)}, margin ${pctFrac(repro.bestMargin)})`,
    );
  } else {
    signals.push(
      `SF 1980 FM AC player flagship NOT reproduced: 0 hits with rev≥$1.5M and margin≥40% in ${repro?.playerRuns || 0} benchmark-bot player runs`,
    );
    signals.push(
      'Benchmark bot often leaves underdog on weak AM while AI FM leads; live manual FM/AC flagship build is not captured by this harness',
    );
  }

  const cmp = report.playerVsAiAtFlagship;
  if (cmp?.medianMarginDelta != null && cmp.medianMarginDelta > 0.12) {
    score.tooProfitable += 2;
    signals.push(`Player flagship median margin ${pctFrac(cmp.medianPlayerMargin)} vs AI #1 ${pctFrac(cmp.medianAiMargin)} (Δ ${pctFrac(cmp.medianMarginDelta)})`);
  }
  if (cmp?.medianRevDelta != null && cmp.medianRevDelta > 400000) {
    score.tooProfitable += 1;
    signals.push(`Player flagship median rev ${money(cmp.medianPlayerRev)} vs AI #1 ${money(cmp.medianAiRev)}`);
  }

  const dep = report.depFlagSummary;
  if (dep?.medianRevDelta != null && Math.abs(dep.medianRevDelta) < 5000 && dep?.medianMarginDelta != null && Math.abs(dep.medianMarginDelta) < 0.01) {
    score.flagDistort += 0;
    signals.push('Stripping isPlayer at snapshot: rev/margin unchanged — flag is not a direct P&L multiplier');
  } else if (dep?.medianRevDelta != null || dep?.medianMarginDelta != null) {
    const revD = dep.medianRevDelta || 0;
    const marD = dep.medianMarginDelta || 0;
    if (Math.abs(revD) > 10000 || Math.abs(marD) > 0.02) {
      score.flagDistort += 2;
      signals.push(
        `Stripping isPlayer changes economics (median rev Δ ${money(revD)}, margin Δ ${pctFrac(marD)}) — indirect via promo baseline / identity / digital`,
      );
    }
  }

  const passive = report.passiveVsPlayer;
  if (passive?.playerTop3MedianMargin != null && passive?.passiveRank1MedianMargin != null) {
    if (passive.playerTop3MedianMargin - passive.passiveRank1MedianMargin > 0.15) {
      score.tooProfitable += 1;
      signals.push(
        `Player top-3 median margin ${pctFrac(passive.playerTop3MedianMargin)} vs passive-AI #1 ${pctFrac(passive.passiveRank1MedianMargin)}`,
      );
    }
  }

  const prior = report.priorAuditDiscrepancy;
  if (prior) signals.push(prior);

  const ranked = [
    ['B', score.tooProfitable],
    ['D', score.flagDistort],
    ['C', score.aiWeak],
    ['A', score.plausible],
  ].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  let verdict = 'E';
  let verdictLabel = 'Further targeted audit needed';
  if (!repro?.reproduced) {
    verdict = 'E';
    verdictLabel =
      'Further targeted audit needed (live flagship not reproduced; validate with human-play snapshot export)';
  } else if (top[1] >= 2) {
    verdict = top[0];
    verdictLabel =
      top[0] === 'A'
        ? 'Player flagship margins are plausible'
        : top[0] === 'B'
          ? 'Player stations are too profitable'
          : top[0] === 'C'
            ? 'AI stations are too weak / over-costed'
            : 'Player flag causes economic distortion';
  } else if (top[1] === 1) {
    verdict = top[0];
    verdictLabel =
      top[0] === 'A'
        ? 'Player flagship margins are plausible'
        : top[0] === 'B'
          ? 'Player stations are too profitable'
          : top[0] === 'C'
            ? 'AI stations are too weak / over-costed'
            : top[0] === 'D'
              ? 'Player flag causes economic distortion'
              : 'Further targeted audit needed';
  }

  return { verdict, verdictLabel, signals, score };
}

function renderMd(report) {
  const lines = [];
  lines.push('# Player Flagship Economics Audit');
  lines.push('');
  lines.push('Diagnostic: `scripts/diag-player-flagship-economics.mjs` · `npm run diag:player-flagship-economics`');
  lines.push('');
  lines.push(`Markets: ${report.meta.markets.join(', ')}`);
  lines.push(
    `Start years: ${report.meta.startYears.join(', ')} · ${report.meta.runsPerCell} seeds/cell · snapshots: ${report.meta.snapshotYears.join(', ')}`,
  );
  lines.push('');
  lines.push('Run types: **passive_ai** (no player, all AI) · **player_flagship** (underdog + aggressive benchmark bot) · **dep_flag** (clone flagship, strip `isPlayer`, recalc at snapshot)');
  lines.push('');
  lines.push(`## Verdict: **${report.verdict.verdict}) ${report.verdict.verdictLabel}**`);
  lines.push('');
  for (const s of report.verdict.signals) lines.push(`- ${s}`);
  lines.push('');

  lines.push('## San Francisco 1980 reproduction (player flagship, FM AC)');
  const sf = report.sf1980Reproduction;
  if (sf) {
    lines.push(`- Reproduced (rev≥$1.5M, margin≥40%): **${sf.reproduced ? 'YES' : 'NO'}** (${sf.hitCount} hits / ${sf.playerRuns} player sims)`);
    if (sf.bestHit) {
      lines.push(
        `- Best hit: ${sf.bestHit.callLetters} ${sf.bestHit.format} · rev ${money(sf.bestHit.rev)} · margin ${pctFrac(sf.bestHit.ebitdaMargin)} · share ${pctFrac(sf.bestHit.share)}`,
      );
    }
    if (sf.closest?.length) {
      lines.push('- Closest player flagships (1980 SF):');
      for (const c of sf.closest.slice(0, 5)) {
        lines.push(
          `  - ${c.callLetters} ${c.format} ${c.signal}: rev ${money(c.rev)}, margin ${pctFrac(c.ebitdaMargin)}, share ${pctFrac(c.share)}`,
        );
      }
    }
  }
  lines.push('');

  lines.push('## Player flagship vs AI #1 (same market/year snapshot)');
  const cmp = report.playerVsAiAtFlagship;
  if (cmp) {
    lines.push('| Metric | Player flagship | AI #1 | Median Δ |');
    lines.push('| --- | ---: | ---: | ---: |');
    lines.push(`| Revenue | ${money(cmp.medianPlayerRev)} | ${money(cmp.medianAiRev)} | ${money(cmp.medianRevDelta)} |`);
    lines.push(`| Expenses | ${money(cmp.medianPlayerExp)} | ${money(cmp.medianAiExp)} | ${money(cmp.medianExpenseDelta)} |`);
    lines.push(`| EBITDA margin | ${pctFrac(cmp.medianPlayerMargin)} | ${pctFrac(cmp.medianAiMargin)} | ${pctFrac(cmp.medianMarginDelta)} |`);
    lines.push(
      `| Share | ${pctFrac(cmp.medianPlayerShare)} | ${pctFrac(cmp.medianAiShare)} | ${pctFrac(cmp.medianShareDelta)} |`,
    );
    lines.push(`| N pairs | ${cmp.n} | | |`);
  }
  lines.push('');

  lines.push('## Player flagship (max revenue player station) by era');
  lines.push('| Era | N | Med rev | Med margin | >30% | >40% | Talent % | Fixed % |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const era of ERA_BANDS.map((e) => e.id)) {
    const g = report.playerFlagshipByEra?.[era];
    if (!g) continue;
    lines.push(
      `| ${era} | ${g.n} | ${money(g.medianRev)} | ${pctFrac(g.medianEbitdaMargin)} | ${pctFrac(g.pctMarginAbove30)} | ${pctFrac(g.pctMarginAbove40)} | ${pctFrac(g.medianTalentPayrollPctRev)} | ${pctFrac(g.medianFixedCostPctRev)} |`,
    );
  }
  lines.push('');

  lines.push('## isPlayer strip test (dep_flag at snapshot)');
  const dep = report.depFlagSummary;
  if (dep) {
    lines.push(`- Snapshots tested: **${dep.n}**`);
    lines.push(`- Median rev Δ: **${money(dep.medianRevDelta)}** · expenses Δ: **${money(dep.medianExpenseDelta)}** · margin Δ: **${pctFrac(dep.medianMarginDelta)}**`);
    lines.push(`- Identical rev after strip: **${pctFrac(dep.pctIdenticalRev)}** · identical margin: **${pctFrac(dep.pctIdenticalMargin)}**`);
  }
  lines.push('');

  lines.push('## Prior station-economics audit discrepancy');
  lines.push(report.priorAuditDiscrepancy || '');
  lines.push('');

  lines.push('## Talent-cut what-if (player flagships)');
  const wi = report.whatIfPlayerFlagship;
  if (wi) {
    lines.push(`- Cases: **${wi.n}** · median EBITDA Δ **${money(wi.medianEbitdaDelta)}** · median rev Δ **${money(wi.medianRevDelta)}**`);
    lines.push(`- Boosts profitable flagships: **${pctFrac(wi.pctBoostProfitable)}** · rev loss > save: **${pctFrac(wi.pctRevHurtMore)}**`);
  }
  lines.push('');

  lines.push('## Rerun');
  lines.push('```bash');
  lines.push('npm run diag:player-flagship-economics');
  lines.push('node scripts/diag-player-flagship-economics.mjs --runs=8 --seed=20260616');
  lines.push('```');
  return lines.join('\n');
}

function parseArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const runConfigs = [];
  for (const marketId of MARKETS) {
    for (const startYear of START_YEARS) {
      for (const runType of ['passive_ai', 'player_flagship']) {
        for (let r = 0; r < args.runs; r++) {
          runConfigs.push({
            marketId,
            startYear,
            runType,
            seed: args.seed + marketSalt(marketId) * 19 + startYear * 991 + (runType === 'player_flagship' ? 7 : 0) + r * 9973,
          });
        }
      }
    }
  }

  console.log(
    `Player flagship economics: ${MARKETS.length} markets × ${START_YEARS.length} starts × 2 run types × ${args.runs} seeds = ${runConfigs.length} sims`,
  );

  const resultsByMarket = new Map();
  for (const mid of MARKETS) {
    if (!resultsByMarket.has(mid)) resultsByMarket.set(mid, loadCtx(mid));
  }

  const runResults = [];
  const batchSize = 2;
  for (let i = 0; i < runConfigs.length; i += batchSize) {
    const batch = runConfigs.slice(i, i + batchSize);
    const ctx = resultsByMarket.get(batch[0].marketId);
    const payload = { snapshotYears: SNAPSHOT_YEARS, endYear: END_YEAR, runs: batch };
    const chunk = vm.runInContext(`(${RUNNER_IIFE})(${JSON.stringify(payload)})`, ctx);
    runResults.push(...chunk);
    process.stdout.write(`  ${Math.min(i + batchSize, runConfigs.length)}/${runConfigs.length}\r`);
  }
  console.log('');

  const playerFlagshipRows = [];
  const playerTop3Rows = [];
  const passiveRank1Rows = [];
  const flagshipPairs = [];
  const depFlagDeltas = [];
  const sf1980Hits = [];
  const whatIfs = [];
  let fail = 0;

  for (const res of runResults) {
    if (!res.ok) {
      fail++;
      continue;
    }
    for (const [yr, cap] of Object.entries(res.snapshots || {})) {
      const year = Number(yr);
      if (year < res.startYear) continue;
      const era = eraForYear(year);

      if (res.runType === 'player_flagship') {
        if (cap.flagship) {
          const f = { ...cap.flagship, era, startYear: res.startYear, seed: res.seed, marketId: res.marketId };
          playerFlagshipRows.push(f);
          if (cap.aiRank1 && cap.flagshipVsAi1) {
            flagshipPairs.push({
              era,
              year,
              marketId: res.marketId,
              seed: res.seed,
              playerMargin: cap.flagship.ebitdaMargin,
              aiMargin: cap.aiRank1.ebitdaMargin,
              playerRev: cap.flagship.rev,
              aiRev: cap.aiRank1.rev,
              playerExp: cap.flagship.expenses,
              aiExp: cap.aiRank1.expenses,
              playerShare: cap.flagship.share,
              aiShare: cap.aiRank1.share,
              marginDelta: cap.flagshipVsAi1.marginDelta,
              revDelta: cap.flagshipVsAi1.revDelta,
              expenseDelta: cap.flagship.expenses - cap.aiRank1.expenses,
            });
          }
          if (cap.depDelta) {
            depFlagDeltas.push({
              marketId: res.marketId,
              year,
              ...cap.depDelta,
            });
          }
          if (cap.whatIf) whatIfs.push({ ...cap.whatIf, marketId: res.marketId, year });
        }
        const ps = (cap.rows || []).filter((r) => r.isPlayer).sort((a, b) => b.share - a.share).slice(0, 3);
        for (const r of ps) {
          playerTop3Rows.push({ ...r, era, startYear: res.startYear, seed: res.seed });
        }
      }

      if (res.runType === 'passive_ai') {
        const r1 = (cap.rows || []).find((r) => r.rank === 1);
        if (r1) passiveRank1Rows.push({ ...r1, era, startYear: res.startYear, seed: res.seed });
      }
    }
    for (const h of res.sf1980Hits || []) sf1980Hits.push(h);
  }

  const playerRuns = runResults.filter((r) => r.ok && r.runType === 'player_flagship').length;
  const reproduced = sf1980Hits.length > 0;
  const bestHit = sf1980Hits.sort((a, b) => b.ebitdaMargin - a.ebitdaMargin)[0] || null;
  const sf1980FmAc = playerFlagshipRows.filter(
    (f) => f.marketId === 'sanfrancisco' && f.year === 1980 && f.signal === 'FM' && AC_FORMATS.has(f.format),
  );
  const closest = [...sf1980FmAc].sort((a, b) => {
    const scoreA = (a.rev / 1.9e6) * 0.5 + Math.max(0, a.ebitdaMargin || 0) * 0.5;
    const scoreB = (b.rev / 1.9e6) * 0.5 + Math.max(0, b.ebitdaMargin || 0) * 0.5;
    return scoreB - scoreA;
  });

  const pairMargins = flagshipPairs.filter((p) => p.playerMargin != null && p.aiMargin != null);
  const playerVsAiAtFlagship = pairMargins.length
    ? {
        n: pairMargins.length,
        medianPlayerMargin: distStats(pairMargins.map((p) => p.playerMargin))?.median,
        medianAiMargin: distStats(pairMargins.map((p) => p.aiMargin))?.median,
        medianMarginDelta: distStats(pairMargins.map((p) => p.marginDelta))?.median,
        medianPlayerRev: distStats(pairMargins.map((p) => p.playerRev))?.median,
        medianAiRev: distStats(pairMargins.map((p) => p.aiRev))?.median,
        medianRevDelta: distStats(pairMargins.map((p) => p.revDelta))?.median,
      }
    : null;

  if (playerVsAiAtFlagship && flagshipPairs.length) {
    playerVsAiAtFlagship.medianPlayerExp = distStats(flagshipPairs.map((p) => p.playerExp))?.median;
    playerVsAiAtFlagship.medianAiExp = distStats(flagshipPairs.map((p) => p.aiExp))?.median;
    playerVsAiAtFlagship.medianExpenseDelta = distStats(flagshipPairs.map((p) => p.expenseDelta))?.median;
    playerVsAiAtFlagship.medianShareDelta = distStats(pairMargins.map((p) => p.playerShare - p.aiShare))?.median;
  }

  const depFlagSummary = depFlagDeltas.length
    ? {
        n: depFlagDeltas.length,
        medianRevDelta: distStats(depFlagDeltas.map((d) => d.rev))?.median,
        medianExpenseDelta: distStats(depFlagDeltas.map((d) => d.expenses))?.median,
        medianMarginDelta: distStats(depFlagDeltas.map((d) => d.ebitdaMargin))?.median,
        pctIdenticalRev: depFlagDeltas.filter((d) => d.rev === 0).length / depFlagDeltas.length,
        pctIdenticalMargin: depFlagDeltas.filter((d) => d.ebitdaMargin === 0 || d.ebitdaMargin == null).length / depFlagDeltas.length,
      }
    : null;

  const playerTop3ByEra = aggregateGroup(playerTop3Rows, (r) => r.era);
  const playerFlagshipByEra = aggregateGroup(playerFlagshipRows, (r) => r.era);

  const passiveVsPlayer = {
    playerTop3MedianMargin: distStats(playerTop3Rows.map((r) => r.ebitdaMargin).filter(Boolean))?.median,
    passiveRank1MedianMargin: distStats(passiveRank1Rows.map((r) => r.ebitdaMargin).filter(Boolean))?.median,
  };

  const whatIfPlayerFlagship = whatIfs.length
    ? {
        n: whatIfs.length,
        medianEbitdaDelta: distStats(whatIfs.map((w) => w.ebitdaDelta))?.median,
        medianRevDelta: distStats(whatIfs.map((w) => w.revDelta))?.median,
        pctBoostProfitable: whatIfs.filter((w) => w.ebitdaBefore > 0 && w.ebitdaDelta > 0).length / whatIfs.length,
        pctRevHurtMore: whatIfs.filter((w) => w.revDelta < 0 && Math.abs(w.revDelta) > (w.salarySavePeriod || 0)).length / whatIfs.length,
      }
    : null;

  const priorAuditDiscrepancy =
    'Prior `diag:station-economics` cleared all `isPlayer` flags and averaged the full commercial book (median SF 1980 margin ~−105%). This harness keeps the underdog player station, runs the benchmark bot (hires, promo/prog, optional FM acquisition), and compares player flagship vs AI #1 at the same calendar snapshot.';

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      markets: MARKETS,
      startYears: START_YEARS,
      snapshotYears: SNAPSHOT_YEARS,
      endYear: END_YEAR,
      runsPerCell: args.runs,
      seed: args.seed,
      sims: runConfigs.length,
      failedSims: fail,
    },
    sf1980Reproduction: {
      reproduced,
      hitCount: sf1980Hits.length,
      playerRuns,
      bestHit,
      hits: sf1980Hits,
      closest: closest.slice(0, 8),
    },
    playerVsAiAtFlagship,
    playerTop3ByEra,
    playerFlagshipByEra,
    depFlagSummary,
    passiveVsPlayer,
    whatIfPlayerFlagship,
    priorAuditDiscrepancy,
    sampleSf1980Player: closest.slice(0, 6),
    verdict: null,
  };

  report.verdict = buildVerdict(report);

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, renderMd(report));
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Verdict: ${report.verdict.verdict}) ${report.verdict.verdictLabel}`);
  if (fail) console.warn(`Warning: ${fail} sim runs failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
