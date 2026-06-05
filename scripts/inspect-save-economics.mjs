#!/usr/bin/env node
/**
 * Human-save station economics inspector (diagnostic only — no gameplay changes).
 *
 *   npm run inspect:save-economics -- --file=/path/to/save.json
 *   npm run inspect:save-economics -- --file=save.json --station=KABC
 *   npm run inspect:save-economics -- --file=save.json --market=sanfrancisco --year=1980
 *   npm run inspect:save-economics -- --file=save.json --station=KBAY --raw-only
 *   npm run inspect:save-economics -- --file=save.json --station=KBAY --trace-pnl
 *
 * Save format: JSON from Save/Load → Download, cloud save export, or
 *   localStorage key `airwave_empire_autosave` (wrapper `{ v, saved, label, G }`).
 *
 * Artifacts: tmp/save_economics_inspection.json, tmp/save_economics_inspection.md
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
const outJson = path.join(root, 'tmp', 'save_economics_inspection.json');
const outMd = path.join(root, 'tmp', 'save_economics_inspection.md');

const LARGE_MARKET_IDS = new Set(['seattle', 'sanfrancisco', 'atlanta']);
const DAYPARTS = ['morningDrive', 'midday', 'afternoonDrive', 'evening', 'overnight'];

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

function patchActiveMarket(src, marketId) {
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) return src;
  return src.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
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
  const key = `${LARGE_MARKET_IDS.has(marketId) ? 'large16' : 'default'}:${marketId}`;
  if (ctxCache.has(key)) return ctxCache.get(key);
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let legacy = injectHeadlessDiagFixes(readFileSync(legacyPath, 'utf8'));
  legacy = patchActiveMarket(legacy, marketId || 'atlanta');
  if (LARGE_MARKET_IDS.has(marketId)) legacy = patchLargeAnchor1975(legacy, 16);
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(readFileSync(talentPath, 'utf8'), ctx, { filename: 'talentRetention.js', timeout: 120_000 });
  ctxCache.set(key, ctx);
  return ctx;
}

/** Mirrors station card EBITDA in legacy.js `rStns()` (revUi − costUi, combined for owned simulcast pairs). */
function uiStationCardProfit(s, stations, playerIds) {
  if (!s?.fin) return null;
  let junior = null;
  if (s.simulcastWith) {
    const p = stations.find((st) => st?.id === s.simulcastWith && st.simulcastWith === s.id);
    if (p && playerIds.has(s.id) && playerIds.has(p.id)) junior = p;
  }
  const revUi = junior ? (s.fin.rev || 0) + (junior.fin.rev || 0) : s.fin.rev || 0;
  const costUi = junior ? (s.fin.cost || 0) + (junior.fin.cost || 0) : s.fin.cost || 0;
  return {
    revUi: Math.round(revUi),
    costUi: Math.round(costUi),
    stnEbitda: Math.round(revUi - costUi),
    finEbitda: Math.round(s.fin.ebitda ?? revUi - costUi),
    combinedWith: junior?.callLetters || null,
    formula: junior
      ? 'revUi=sum(leg.fin.rev); costUi=sum(leg.fin.cost); display=revUi-costUi (rStns)'
      : 'revUi=fin.rev; costUi=fin.cost; display=revUi-costUi (=fin.ebitda when consistent)',
  };
}

function finSnapshotFromStation(s) {
  const f = s?.fin || {};
  return {
    rev: Math.round(f.rev || 0),
    cost: Math.round(f.cost || 0),
    ebitda: Math.round(f.ebitda != null ? f.ebitda : (f.rev || 0) - (f.cost || 0)),
    fix: Math.round(f.fix || 0),
    tal: Math.round(f.tal != null ? f.tal : 0),
    salesAdmin: Math.round(f.salesAdmin || 0),
    opsFloor: Math.round(f.opsFloor || 0),
    effPromo: Math.round(f.effPromo || 0),
    effProg: Math.round(f.effProg || 0),
    syndicationRights: Math.round(f.syndicationRights || 0),
    streamRev: Math.round(f.streamRev || 0),
    digitalRev: Math.round(f.digitalRev || 0),
    terRev: Math.round(f.terRev != null ? f.terRev : 0),
    competitiveBaselinePromo: Math.round(f.competitiveBaselinePromo || 0),
    competitiveBaselineProg: Math.round(f.competitiveBaselineProg || 0),
    aiLoanInterest: Math.round(f.aiLoanInterest || 0),
    amHitsContestOpex: Math.round(f.amHitsContestOpex || 0),
    lmaGrossRev: Math.round(s._lmaGrossRev || 0) || null,
    lmaSeedEbitda: Math.round(s._lmaSeedEbitda || 0) || null,
    share: Math.round((s.rat?.share || 0) * 10000) / 10000,
    sellout: Math.round((s.ops?.sell || 0) * 10000) / 10000,
  };
}

const TRACE_PNL_IIFE = `
(function(cfg){
  var Graw=cfg.G;
  var targetIds=cfg.targetStationIds||[];
  if(!Graw||!targetIds.length) return {ok:false,err:'no_targets'};

  function snapFin(G, stage){
    var rows=[];
    targetIds.forEach(function(id){
      var s=(G.stations||[]).find(function(x){ return x&&x.id===id; });
      if(!s) return;
      var f=s.fin||{};
      rows.push({
        stage:stage,
        callLetters:s.callLetters||'',
        stationId:id,
        share:Math.round((s.rat&&s.rat.share||0)*10000)/10000,
        rev:Math.round(f.rev||0),
        cost:Math.round(f.cost||0),
        ebitda:Math.round(f.ebitda!=null?f.ebitda:(f.rev||0)-(f.cost||0)),
        fix:Math.round(f.fix||0),
        tal:Math.round(f.tal!=null?f.tal:0),
        syndicationRights:Math.round(f.syndicationRights||0),
        salesAdmin:Math.round(f.salesAdmin||0),
        opsFloor:Math.round(f.opsFloor||0),
        effPromo:Math.round(f.effPromo||0),
        effProg:Math.round(f.effProg||0)
      });
    });
    return rows;
  }
  function bindOnly(G){
    if(typeof wlBindGameState==='function') wlBindGameState(G);
    ACTIVE_MARKET=G.marketId||'atlanta';
    if(typeof syncMarketPopToMarket==='function') syncMarketPopToMarket(ACTIVE_MARKET);
    G.ps=(G.stations||[]).filter(function(st){ return st&&st.isPlayer; });
    if(!G.news) G.news=[];
    if(typeof normalizeSimulcastLinksInPlace==='function') normalizeSimulcastLinksInPlace(G);
    if(typeof enforceFmNonDupConstraints==='function') enforceFmNonDupConstraints(G);
  }
  var trace=[];
  var G=JSON.parse(JSON.stringify(Graw));
  trace=trace.concat(snapFin(G,'raw_save'));
  bindOnly(G);
  trace=trace.concat(snapFin(G,'after_bind_normalize'));
  if(typeof migrateSave==='function') migrateSave(G);
  trace=trace.concat(snapFin(G,'after_migrateSave'));
  if(typeof recalc==='function') recalc(G.stations,G);
  trace=trace.concat(snapFin(G,'after_recalc'));
  if(typeof seedRev==='function') seedRev(G.stations,G);
  trace=trace.concat(snapFin(G,'after_seedRev'));
  if(typeof updateAllStationsBudgetStress==='function') updateAllStationsBudgetStress(G);
  trace=trace.concat(snapFin(G,'after_updateBudgetStress'));
  (G.stations||[]).forEach(function(st){
    if(st&&!st._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'&&!stationIsNoncommercialInstitutional(st)&&typeof calcRev==='function'){
      calcRev(st,G);
    }
  });
  trace=trace.concat(snapFin(G,'after_calcRev_all_stations'));
  return {
    ok:true,
    game:{marketId:G.marketId,year:G.year,period:G.period,turn:G.turn},
    ratingsLoadRepair:G._wlRatingsLoadRepairStations||0,
    trace:trace
  };
})`;

const RAW_ONLY_IIFE = `
(function(cfg){
  var G=cfg.G;
  var ids=cfg.targetStationIds||[];
  var playerIds=new Set((G.stations||[]).filter(function(s){ return s&&s.isPlayer; }).map(function(s){ return s.id; }));
  var rows=[];
  ids.forEach(function(id){
    var s=(G.stations||[]).find(function(x){ return x&&x.id===id; });
    if(!s) return;
    var f=s.fin||{};
    var junior=null;
    if(s.simulcastWith){
      var p=(G.stations||[]).find(function(st){ return st&&st.id===s.simulcastWith&&st.simulcastWith===s.id; });
      if(p&&playerIds.has(s.id)&&playerIds.has(p.id)) junior=p;
    }
    var revUi=junior?(f.rev||0)+(junior.fin.rev||0):(f.rev||0);
    var costUi=junior?(f.cost||0)+(junior.fin.cost||0):(f.cost||0);
    rows.push({
      stationId:id,
      callLetters:s.callLetters,
      format:s.format,
      signal:s.sig&&s.sig.type,
      isPlayer:!!s.isPlayer,
      simulcastWith:s.simulcastWith||null,
      uiCombinedWith:junior?junior.callLetters:null,
      fin: {
        rev:Math.round(f.rev||0),
        cost:Math.round(f.cost||0),
        ebitda:Math.round(f.ebitda!=null?f.ebitda:(f.rev||0)-(f.cost||0)),
        fix:Math.round(f.fix||0),
        tal:Math.round(f.tal!=null?f.tal:0),
        syndicationRights:Math.round(f.syndicationRights||0),
        salesAdmin:Math.round(f.salesAdmin||0),
        opsFloor:Math.round(f.opsFloor||0),
        effPromo:Math.round(f.effPromo||0),
        effProg:Math.round(f.effProg||0),
        terRev:f.terRev!=null?Math.round(f.terRev):null,
        streamRev:Math.round(f.streamRev||0),
        digitalRev:Math.round(f.digitalRev||0)
      },
      uiStationCard: {
        revUi:Math.round(revUi),
        costUi:Math.round(costUi),
        stnEbitda:Math.round(revUi-costUi),
        finEbitda:Math.round(f.ebitda!=null?f.ebitda:(f.rev||0)-(f.cost||0)),
        matchesFinEbitda:Math.abs((revUi-costUi)-(f.ebitda!=null?f.ebitda:(f.rev||0)-(f.cost||0)))<2
      },
      share:Math.round((s.rat&&s.rat.share||0)*10000)/10000,
      sellout:Math.round((s.ops&&s.ops.sell||0)*10000)/10000
    });
  });
  return {
    ok:true,
    mode:'raw_only',
    game:{marketId:G.marketId,year:G.year,period:G.period,turn:G.turn},
    uiProfitField: {
      source:'legacy.js rStns() station card',
      label:'EBITDA',
      period:'half-year (same as Revenue / period and Expenses / period)',
      formula:'stnEbitda = revUi - costUi; for owned simulcast pairs revUi/costUi sum both legs',
      notAnnualized:true,
      notTalentOnly:true,
      companyLevel:'station card is per-station (or combined pair); portfolio cash uses sum(st.fin.ebitda) at period close'
    },
    stations:rows
  };
})`;

const INSPECT_IIFE = `
(function(cfg){
  var DAYPARTS=['morningDrive','midday','afternoonDrive','evening','overnight'];
  var Graw=cfg.G;
  if(!Graw||!Graw.stations) return {ok:false, err:'invalid_G'};

  function isComm(s){
    return s&&!s._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'&&!stationIsNoncommercialInstitutional(s);
  }
  function sortBook(stations){
    var list=(stations||[]).filter(isComm);
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++) sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){ return (b.rat&&b.rat.share||0)-(a.rat&&a.rat.share||0); });
    return list;
  }
  function ownerType(s){
    if(s.isPlayer) return 'player';
    if(s.corpOwner) return 'corporate';
    return 'ai_independent';
  }
  function cloneG(){
    return JSON.parse(JSON.stringify(Graw));
  }
  function prepareGame(G){
    if(typeof wlBindGameState==='function') wlBindGameState(G);
    else { /* lexical G in legacy */ }
    ACTIVE_MARKET=G.marketId||'atlanta';
    if(typeof syncMarketPopToMarket==='function') syncMarketPopToMarket(ACTIVE_MARKET);
    G.ps=(G.stations||[]).filter(function(st){ return st&&st.isPlayer; });
    if(!G.news) G.news=[];
    if(typeof normalizeSimulcastLinksInPlace==='function') normalizeSimulcastLinksInPlace(G);
    if(typeof enforceFmNonDupConstraints==='function') enforceFmNonDupConstraints(G);
    if(typeof migrateSave==='function') migrateSave(G);
    if(typeof recalc==='function') recalc(G.stations, G);
    if(typeof seedRev==='function') seedRev(G.stations, G);
    if(typeof updateAllStationsBudgetStress==='function') updateAllStationsBudgetStress(G);
    // Match loadLocalSave/importSave: do not re-run calcRev on every station (that overwrites saved fin.* and disagrees with live UI).
  }
  function recalcAll(G, opts){
    opts=opts||{};
    if(typeof recalc==='function') recalc(G.stations, G);
    if(typeof seedRev==='function') seedRev(G.stations, G);
    if(typeof updateAllStationsBudgetStress==='function') updateAllStationsBudgetStress(G);
    if(opts.runCalcRev){
      (G.stations||[]).forEach(function(st){
        if(st&&!st._bpSlotDeferred&&isComm(st)&&typeof calcRev==='function') calcRev(st,G);
      });
    }
  }
  function totalAqh(s){
    if(typeof COH==='undefined'||!s.rat||!s.rat.cur) return 0;
    return COH.reduce(function(sum,c){ return sum+(s.rat.cur[c]&&s.rat.cur[c].aqh||0); },0);
  }
  function slotLineup(s){
    var staffed=0, vacant=0, auto=0, talent=[];
    var q={morning:null,midday:null,afternoon:null,evening:null};
    DAYPARTS.forEach(function(sl){
      var sd=s.prog&&s.prog[sl];
      if(!sd){ vacant++; return; }
      var qual=sd.quality!=null?Math.round(sd.quality):null;
      if(sl==='morningDrive') q.morning=qual;
      else if(sl==='midday') q.midday=qual;
      else if(sl==='afternoonDrive') q.afternoon=qual;
      else if(sl==='evening') q.evening=qual;
      if(sd.talent){
        staffed++;
        talent.push({
          slot:sl,
          name:sd.talent.name||sd.talent.id||'?',
          salaryAnnual:Math.round(sd.talent.salary||0),
          quality:Math.round(sd.talent.quality||0),
          halfPeriodPay:typeof payrollHalfPeriodForDaypartSlot==='function'
            ?Math.round(payrollHalfPeriodForDaypartSlot(sd))
            :Math.round((sd.talent.salary||0)/2)
        });
        return;
      }
      if(qual!=null&&qual<28) auto++;
      else vacant++;
    });
    return {staffed:staffed,vacant:vacant,automated:auto,q:q,talent:talent};
  }
  function finBreakdown(s){
    var f=s.fin||{};
    var ident=typeof stationIdentityBudgetPnlContribution==='function'
      ?Math.round(stationIdentityBudgetPnlContribution(s,G))
      :0;
    return {
      revenue:Math.round(f.rev||0),
      terrestrial:Math.round(f.terRev!=null?f.terRev:0),
      stream:Math.round(f.streamRev||0),
      digital:Math.round(f.digitalRev||0),
      digitalShare:Math.round((f.digitalShare||0)*10000)/10000,
      expenses:Math.round(f.cost||0),
      ebitda:Math.round(f.ebitda!=null?f.ebitda:((f.rev||0)-(f.cost||0))),
      fixed:Math.round(f.fix||0),
      talent:Math.round(f.tal||0),
      salesAdmin:Math.round(f.salesAdmin||0),
      opsFloor:Math.round(f.opsFloor||0),
      effPromo:Math.round(f.effPromo||0),
      effProg:Math.round(f.effProg||0),
      opsPromo:Math.round(s.ops&&s.ops.promo||0),
      opsProgBudget:Math.round(s.ops&&s.ops.progBudget||0),
      competitiveBaselinePromo:Math.round(f.competitiveBaselinePromo||0),
      competitiveBaselineProg:Math.round(f.competitiveBaselineProg||0),
      streamUpkeep:Math.round(f.streamUpkeep||0),
      syndicationRights:Math.round(f.syndicationRights||0),
      aiLoanInterest:Math.round(f.aiLoanInterest||0),
      amHitsContestOpex:Math.round(f.amHitsContestOpex||0),
      groupOverhead:Math.round(f.groupOverhead||0),
      identityPnl:ident,
      salesAdminRate:Math.round((f.salesAdminRate||0)*10000)/10000
    };
  }
  function captureRow(s,G,rank,nComm){
    var lineup=slotLineup(s);
    var rev=(s.fin&&s.fin.rev)||0;
    var cost=(s.fin&&s.fin.cost)||0;
    var ebitda=s.fin&&s.fin.ebitda!=null?s.fin.ebitda:(rev-cost);
    var fix=(s.fin&&s.fin.fix)||0;
    var tal=(s.fin&&s.fin.tal)||0;
    return {
      stationId:s.id,
      callLetters:s.callLetters||'',
      brand:s.brand||'',
      format:s.format||'',
      signal:(s.sig&&s.sig.type)||'AM',
      power:s.sig&&s.sig.pw||'',
      coverage:s.sig&&s.sig.coverage||null,
      ownerType:ownerType(s),
      isPlayer:!!s.isPlayer,
      rank:rank,
      nCommercial:nComm,
      share:Math.round((s.rat&&s.rat.share||0)*10000)/10000,
      aqh:Math.round(totalAqh(s)),
      sellout:Math.round((s.ops&&s.ops.sell||0)*10000)/10000,
      oq:Math.round(s.oq||0),
      identity:Math.round(s.identity||0),
      daypartQ:lineup.q,
      staffedDayparts:lineup.staffed,
      vacantDayparts:lineup.vacant,
      automatedDayparts:lineup.automated,
      talent:lineup.talent,
      fin:finBreakdown(s),
      ebitdaMargin:rev>5000?Math.round((ebitda/rev)*10000)/10000:null,
      talentPayrollPctRev:rev>5000?Math.round((tal/rev)*10000)/10000:null,
      fixedCostPctRev:rev>5000?Math.round((fix/rev)*10000)/10000:null,
      streamActive:!!(s.stream&&s.stream.active),
      harnessPlayerRevMult:typeof G._wlHarnessPlayerRevMult==='number'?G._wlHarnessPlayerRevMult:null
    };
  }
  function pickStation(G, cfg){
    if(cfg.marketId&&(G.marketId||'')!==cfg.marketId) return {st:null, book:[], err:'market_mismatch'};
    if(cfg.year!=null&&G.year!==cfg.year) return {st:null, book:[], err:'year_mismatch'};
    if(cfg.period!=null&&G.period!==cfg.period) return {st:null, book:[], err:'period_mismatch'};
    var book=sortBook(G.stations);
    var pool=book;
    if(cfg.stationKey){
      var key=String(cfg.stationKey).toLowerCase();
      var hit=pool.find(function(s){
        return (s.id&&String(s.id).toLowerCase()===key)
          ||(s.callLetters&&String(s.callLetters).toLowerCase().indexOf(key)>=0);
      });
      if(hit) return {st:hit, book:book};
    }
    var players=pool.filter(function(s){ return s.isPlayer; });
    var cand=players.length?players:pool;
    cand.sort(function(a,b){
      var ra=a.fin&&a.fin.rev?a.fin.rev:0;
      var rb=b.fin&&b.fin.rev?b.fin.rev:0;
      if(rb!==ra) return rb-ra;
      return (b.rat&&b.rat.share||0)-(a.rat&&a.rat.share||0);
    });
    if(!cand.length) return {st:null, book:book};
    return {st:cand[0], book:book};
  }
  function revenueDecomposition(s,G,dbg){
    var fin=s.fin||{};
    var decomp={
      note:'Pre-seedRev calcRev intermediates via G._econDebugIds; pool context from debugRevenueTrace',
      totalRev:Math.round(fin.rev||0),
      terrestrialRev:Math.round(fin.terRev!=null?fin.terRev:0),
      streamRev:Math.round(fin.streamRev||0),
      digitalRev:Math.round(fin.digitalRev||0),
      sellout:Math.round((s.ops&&s.ops.sell||0)*10000)/10000,
      spotsPerHour:s.ops&&s.ops.spots!=null?s.ops.spots:null,
      shareDecimal:Math.round((s.rat&&s.rat.share||0)*10000)/10000,
      aqh:Math.round(totalAqh(s)),
      isPlayer:!!s.isPlayer,
      harnessPlayerRevMult:typeof G._wlHarnessPlayerRevMult==='number'?G._wlHarnessPlayerRevMult:null
    };
    if(dbg){
      decomp.preSeedRevGross=Math.round(dbg.revGrossPreFm||0);
      decomp.fmEarlyEraMonMult=dbg.fmEarlyEraMonMult;
      decomp.marketFormatMonMult=dbg.mktFmtMon;
      decomp.shareSelloutMult=dbg.shareSelloutMult;
      decomp.dominantEarlyEraMult=dbg.dominantEarlyEraMult;
      decomp.amTalkSmallMarketMult=dbg.amTalkSmMult;
      decomp.mktFixMult=dbg.mktFixMult;
    }
    if(typeof debugRevenueTrace==='function'){
      var tr=debugRevenueTrace(G,s.id);
      if(tr){
        decomp.marketBilling={
          annualMarketBilling:tr.annualMarketBilling,
          halfPeriodPool:tr.halfPeriodDollarPool_halfTarget,
          sumAllCommercialRev:tr.sum_fin_rev_allCommercial,
          poolCheckAbsErr:tr.poolCheck_absErr,
          billingRevScale:tr.billingEffectiveRevScale,
          adxUsed:tr.adxUsedInHalfTarget
        };
        var row=tr.stations&&tr.stations.find(function(r){ return r.id===s.id; });
        if(row){
          decomp.rankInMarket=row.rank;
          decomp.monetizationEfficiency=row.monetizationEff;
          decomp.pctOfHalfPeriodPool=row.pctOfHalfPeriodPool;
          decomp.earlyEraDominantMultPreSeed=row.earlyEraDominantMult_preSeed;
        }
      }
    }
    if(s.isPlayer&&typeof playerCompetitiveBaselinePromoProg==='function'){
      var pc=typeof promoBudgetCapForPeriod==='function'?promoBudgetCapForPeriod(G):0;
      var pgc=typeof progBudgetCapForPeriod==='function'?progBudgetCapForPeriod(G):0;
      var bp=playerCompetitiveBaselinePromoProg(s,G,fin.rev||0,pc,pgc);
      decomp.playerBaselinePromo=bp.promo;
      decomp.playerBaselineProg=bp.prog;
      decomp.playerBaselineTotal=bp.promo+bp.prog;
    }
    return decomp;
  }
  function counterfactuals(baseG, stId){
    var out={};
    function findSt(G){ return (G.stations||[]).find(function(x){ return x&&x.id===stId; }); }

    // 1) isPlayer=false
    var G1=cloneG();
    prepareGame(G1);
    var s1=findSt(G1);
    if(s1){
      recalcAll(G1);
      s1=findSt(G1);
      var base1=finBreakdown(s1);
      s1.isPlayer=false;
      G1.ps=(G1.stations||[]).filter(function(x){ return x&&x.isPlayer; });
      recalcAll(G1,{runCalcRev:true});
      var s1b=findSt(G1);
      out.noPlayerFlag=finBreakdown(s1b);
      out.noPlayerFlagDelta={
        rev:out.noPlayerFlag.revenue-base1.revenue,
        expenses:out.noPlayerFlag.expenses-base1.expenses,
        ebitda:out.noPlayerFlag.ebitda-base1.ebitda
      };
    }

    // 2) no competitive baseline (player stays player; cost without baseline floor)
    var G0=cloneG();
    prepareGame(G0);
    var s0=findSt(G0);
    if(s0&&s0.isPlayer){
      recalcAll(G0,{runCalcRev:true});
      s0=findSt(G0);
      var f0=s0.fin||{};
      var promoCap=typeof promoBudgetCapForPeriod==='function'?promoBudgetCapForPeriod(G0):0;
      var progCap=typeof progBudgetCapForPeriod==='function'?progBudgetCapForPeriod(G0):0;
      var opsP=Math.min(s0.ops&&s0.ops.promo||0,promoCap);
      var opsPg=Math.min(s0.ops&&s0.ops.progBudget||0,progCap);
      var saveP=Math.max(0,(f0.effPromo||0)-opsP);
      var savePg=Math.max(0,(f0.effProg||0)-opsPg);
      var costNoBase=(f0.cost||0)-saveP-savePg;
      out.noPlayerBaseline={
        effPromoSaved:saveP,
        effProgSaved:savePg,
        expenses:Math.round(costNoBase),
        ebitda:Math.round((f0.rev||0)-costNoBase),
        note:'Analytic trim of effPromo/effProg down to ops caps; does not re-run calcRev'
      };
    }

    // 3) cut one non-morning talent
    var Gc=cloneG();
    prepareGame(Gc);
    var sc=findSt(Gc);
    if(sc){
      var order=['afternoonDrive','midday','evening','overnight'];
      var slot=null;
      for(var i=0;i<order.length;i++){
        var sd=sc.prog&&sc.prog[order[i]];
        if(sd&&sd.talent){ slot=order[i]; break; }
      }
      if(slot){
        var revB=sc.fin&&sc.fin.rev||0;
        var ebitdaB=sc.fin&&sc.fin.ebitda||0;
        var sal=Math.round((sc.prog[slot].talent.salary||0));
        var qualB=sc.prog[slot].quality!=null?sc.prog[slot].quality:40;
        sc.prog[slot].talent=null;
        sc.prog[slot].quality=Math.max(12,Math.round(qualB*0.72));
        if(typeof refreshStationOQ==='function') refreshStationOQ(sc,Gc);
        recalcAll(Gc,{runCalcRev:true});
        sc=findSt(Gc);
        out.talentCut={
          slot:slot,
          salarySaveAnnual:sal,
          revAfter:Math.round(sc.fin&&sc.fin.rev||0),
          revDelta:Math.round((sc.fin&&sc.fin.rev||0)-revB),
          ebitdaAfter:Math.round(sc.fin&&sc.fin.ebitda||0),
          ebitdaDelta:Math.round((sc.fin&&sc.fin.ebitda||0)-ebitdaB),
          netBetter:(sc.fin&&sc.fin.ebitda||0)>ebitdaB
        };
      }
    }

    // 4) double talent payroll
    var Gd=cloneG();
    prepareGame(Gd);
    var sdbl=findSt(Gd);
    if(sdbl){
      recalcAll(Gd);
      sdbl=findSt(Gd);
      var baseD=finBreakdown(sdbl);
      DAYPARTS.forEach(function(sl){
        var p=sdbl.prog&&sdbl.prog[sl];
        if(p&&p.talent&&p.talent.salary) p.talent.salary=Math.round(p.talent.salary*2);
        var co=typeof slotTalentB==='function'?slotTalentB(p):null;
        if(co&&co.salary) co.salary=Math.round(co.salary*2);
      });
      recalcAll(Gd);
      sdbl=findSt(Gd);
      out.payrollDoubled=finBreakdown(sdbl);
      out.payrollDoubledDelta={
        expenses:out.payrollDoubled.expenses-baseD.expenses,
        ebitda:out.payrollDoubled.ebitda-baseD.ebitda
      };
    }

    // 5) fixed costs +25%
    var Gf=cloneG();
    prepareGame(Gf);
    var sf=findSt(Gf);
    if(sf){
      recalcAll(Gf,{runCalcRev:true});
      sf=findSt(Gf);
      var revF=sf.fin&&sf.fin.rev||0;
      var fixF=sf.fin&&sf.fin.fix||0;
      var costF=sf.fin&&sf.fin.cost||0;
      var ebitdaF=sf.fin&&sf.fin.ebitda||0;
      var costUp=Math.round(costF+fixF*0.25);
      out.fixedCostsPlus25Pct={
        fixedWas:fixF,
        fixedBump:Math.round(fixF*0.25),
        expenses:costUp,
        ebitda:Math.round(revF-costUp),
        ebitdaMargin:revF>5000?Math.round(((revF-costUp)/revF)*10000)/10000:null,
        note:'Analytic +25% on fin.fix only; other cost lines unchanged'
      };
      out.fixedCostsPlus25PctDelta={
        ebitda:Math.round(revF-costUp)-ebitdaF,
        marginDelta:revF>5000?Math.round(((revF-costUp)/revF-(ebitdaF/revF))*10000)/10000:null
      };
    }

    return out;
  }
  function analyzeQuestions(row, decomp, cf, book){
    var rev=row.fin.revenue;
    var margin=row.ebitdaMargin;
    var ans=[];
    var drivers=[];
    if(decomp.pctOfHalfPeriodPool!=null){
      drivers.push('~'+decomp.pctOfHalfPeriodPool+'% of market half-period billing pool');
    }
    if(decomp.shareDecimal!=null&&decomp.shareDecimal>=0.08) drivers.push('strong share ('+(decomp.shareDecimal*100).toFixed(1)+'%)');
    else if(decomp.shareDecimal!=null) drivers.push('share '+(decomp.shareDecimal*100).toFixed(1)+'%');
    if(decomp.sellout>=0.5) drivers.push('sellout '+Math.round(decomp.sellout*100)+'%');
    if(decomp.dominantEarlyEraMult&&decomp.dominantEarlyEraMult>1.02) drivers.push('early-era dominant-audience mult ×'+decomp.dominantEarlyEraMult);
    if(decomp.fmEarlyEraMonMult&&decomp.fmEarlyEraMonMult>1.02) drivers.push('FM early-era monetization ×'+decomp.fmEarlyEraMonMult);
    if(decomp.playerBaselineTotal>0) drivers.push('player competitive baseline spend floor ~$'+decomp.playerBaselineTotal+'/period (cost)');
    if(decomp.digitalRev>rev*0.05) drivers.push('digital/stream slice $'+decomp.digitalRev);
    if(row.isPlayer&&decomp.harnessPlayerRevMult!=null&&decomp.harnessPlayerRevMult<1){
      drivers.push('harness player rev mult ×'+decomp.harnessPlayerRevMult);
    }
    ans.push({
      q:'Why is revenue ~$'+rev+'/period?',
      a:drivers.length?drivers.join('; '):'Share × AQH × CPM × sellout stack, normalized via seedRev to market billing pool.'
    });
    ans.push({
      q:'Is ~'+Math.round((margin||0)*100)+'% EBITDA margin plausible?',
      a:margin!=null&&margin>=0.25&&margin<=0.55
        ?'Yes — within plausible range for a high-share FM leader if fixed/talent load is not over-scaled.'
        :margin!=null&&margin>0.55
          ?'Margin is high — check dominant-era multipliers, low fixed footprint, or baseline promo/prog treated as competitive spend.'
          :'Margin is low or negative — costs dominate; live concern may be profitability floor not revenue ceiling.'
    });
    if(cf.talentCut){
      ans.push({
        q:'Would talent cuts materially improve EBITDA?',
        a:cf.talentCut.netBetter
          ?'Cut '+cf.talentCut.slot+' improves EBITDA by $'+cf.talentCut.ebitdaDelta+' (rev Δ $'+cf.talentCut.revDelta+').'
          :'Cut '+cf.talentCut.slot+' hurts EBITDA by $'+(-cf.talentCut.ebitdaDelta)+' — rev loss exceeds payroll save.'
      });
    }
    if(cf.fixedCostsPlus25Pct){
      ans.push({
        q:'Profitable under higher overhead?',
        a:(cf.fixedCostsPlus25Pct.ebitdaMargin!=null&&cf.fixedCostsPlus25Pct.ebitdaMargin>0)
          ?'Still profitable at +25% fixed: margin ~'+Math.round(cf.fixedCostsPlus25Pct.ebitdaMargin*100)+'%.'
          :'Not profitable at +25% fixed costs bump.'
      });
    }
    var ai1=book.filter(function(s){ return !s.isPlayer; })[0];
    if(ai1){
      var r1=ai1.fin&&ai1.fin.rev||0;
      ans.push({
        q:'Vs AI #1 in save ('+(ai1.callLetters||ai1.id)+')',
        a:'Player rev $'+rev+' vs AI $'+Math.round(r1)+'; share '+(row.share*100).toFixed(1)+'% vs '+((ai1.rat&&ai1.rat.share||0)*100).toFixed(1)+'%.'
      });
    }
    var verdict='plausible_flagship';
    if(rev>=1500000&&margin!=null&&margin>=0.40) verdict='matches_live_sf1980_pattern';
    else if(margin!=null&&margin>0.55) verdict='possibly_too_profitable';
    else if(rev<400000&&margin!=null&&margin<0) verdict='distressed_not_flagship';
    return {answers:ans, verdict:verdict, drivers:drivers};
  }

  var playerIds=new Set((Graw.stations||[]).filter(function(s){ return s&&s.isPlayer; }).map(function(s){ return s.id; }));
  var savedPick=pickStation(JSON.parse(JSON.stringify(Graw)), cfg);
  var savedRow=savedPick.st?captureRow(savedPick.st,Graw,savedPick.book.findIndex(function(x){ return x&&x.id===savedPick.st.id; })+1,savedPick.book.length):null;
  var savedUi=savedPick.st?{
    revUi:0,costUi:0,stnEbitda:0,finEbitda:Math.round(savedPick.st.fin&&savedPick.st.fin.ebitda!=null?savedPick.st.fin.ebitda:0)
  }:null;
  if(savedPick.st){
    var s0=savedPick.st;
    var j0=null;
    if(s0.simulcastWith){
      var p0=(Graw.stations||[]).find(function(st){ return st&&st.id===s0.simulcastWith&&st.simulcastWith===s0.id; });
      if(p0&&playerIds.has(s0.id)&&playerIds.has(p0.id)) j0=p0;
    }
    var rv0=j0?(s0.fin.rev||0)+(j0.fin.rev||0):(s0.fin.rev||0);
    var cv0=j0?(s0.fin.cost||0)+(j0.fin.cost||0):(s0.fin.cost||0);
    savedUi={revUi:Math.round(rv0),costUi:Math.round(cv0),stnEbitda:Math.round(rv0-cv0),finEbitda:Math.round(s0.fin.ebitda!=null?s0.fin.ebitda:(rv0-cv0)),combinedWith:j0?j0.callLetters:null};
  }

  var G=cloneG();
  prepareGame(G);
  var pick=pickStation(G, cfg);
  if(pick.err) return {ok:false, err:pick.err, marketId:G.marketId, year:G.year, period:G.period, wanted:cfg};
  if(!pick.st) return {ok:false, err:'no_station', marketId:G.marketId, year:G.year, period:G.period};
  var st=pick.st;
  var rank=pick.book.findIndex(function(x){ return x&&x.id===st.id; })+1;

  var row=captureRow(st,G,rank,pick.book.length);

  var dbg=null;
  if(cfg.includeCalcRevDebug){
    var Gd=cloneG();
    prepareGame(Gd);
    Gd._econDebugIds=[st.id];
    Gd._econDebugLog=[];
    recalcAll(Gd,{runCalcRev:true});
    var stDbg=(Gd.stations||[]).find(function(x){ return x&&x.id===st.id; });
    dbg=Gd._econDebugLog&&Gd._econDebugLog.length?Gd._econDebugLog[Gd._econDebugLog.length-1]:null;
    if(stDbg) row.calcRevOnlyFin=finBreakdown(stDbg);
  }
  var decomp=revenueDecomposition(st,G,dbg);
  var cf=counterfactuals(Graw, st.id);
  var qa=analyzeQuestions(row,decomp,cf,pick.book);

  var playerSummary=pick.book.filter(function(s){ return s.isPlayer; }).map(function(s){
    return {
      id:s.id,
      callLetters:s.callLetters,
      format:s.format,
      signal:s.sig&&s.sig.type,
      rev:Math.round(s.fin&&s.fin.rev||0),
      margin:s.fin&&s.fin.rev>5000?Math.round((s.fin.ebitda/s.fin.rev)*10000)/10000:null
    };
  }).sort(function(a,b){ return b.rev-a.rev; });

  var pipelineMismatch=null;
  if(savedRow&&row){
    pipelineMismatch={
      savedEbitda:savedUi?savedUi.stnEbitda:savedRow.fin.ebitda,
      pipelineEbitda:row.fin.ebitda,
      savedRev:savedUi?savedUi.revUi:savedRow.fin.revenue,
      pipelineRev:row.fin.revenue,
      ebitdaDelta:row.fin.ebitda-(savedUi?savedUi.stnEbitda:savedRow.fin.ebitda),
      revDelta:row.fin.revenue-(savedUi?savedUi.revUi:savedRow.fin.revenue),
      note:'Inspector now matches load path (migrateSave→recalc→seedRev, no calcRev). Use --trace-pnl to see calcRev-only drift.'
    };
  }

  return {
    ok:true,
    mode:'full_pipeline',
    saveMeta:cfg.saveMeta,
    game:{marketId:G.marketId,year:G.year,period:G.period,turn:G.turn,cash:Math.round(G.cash||0),adx:G.adx},
    selection:{stationKey:cfg.stationKey||null,autoPicked:!cfg.stationKey},
    uiProfitField:{
      source:'legacy.js rStns()',
      label:'EBITDA',
      formula:'stnEbitda = revUi - costUi (sums both legs for owned simulcast pair on one card)',
      matchesFinEbitdaWhenSolo:'fin.ebitda should equal rev-cost for a single leg with no pair'
    },
    savedStation:savedRow,
    savedUiProfit:savedUi,
    station:row,
    pipelineMismatch:pipelineMismatch,
    revenueDecomposition:decomp,
    calcRevDebug:dbg,
    counterfactuals:cf,
    analysis:qa,
    playerStationsInSave:playerSummary,
    commercialRankBook:pick.book.slice(0,12).map(function(s,i){
      return {
        rank:i+1,
        callLetters:s.callLetters,
        isPlayer:!!s.isPlayer,
        format:s.format,
        rev:Math.round(s.fin&&s.fin.rev||0),
        margin:s.fin&&s.fin.rev>5000?Math.round((s.fin.ebitda/s.fin.rev)*10000)/10000:null,
        share:Math.round((s.rat&&s.rat.share||0)*10000)/10000
      };
    })
  };
})
`;

function parseArgs(argv) {
  const out = {
    file: null,
    station: null,
    market: null,
    year: null,
    period: null,
    rawOnly: false,
    tracePnl: false,
  };
  for (const a of argv) {
    if (a === '--raw-only') out.rawOnly = true;
    else if (a === '--trace-pnl') out.tracePnl = true;
    else if (a.startsWith('--file=')) out.file = a.slice(7);
    else if (a.startsWith('--station=')) out.station = a.slice(10);
    else if (a.startsWith('--market=')) out.market = a.slice(9);
    else if (a.startsWith('--year=')) out.year = Number(a.slice(7));
    else if (a.startsWith('--period=')) out.period = Number(a.slice(9));
  }
  return out;
}

function findStationIds(G, stationKey) {
  if (!G?.stations?.length) return [];
  if (!stationKey) {
    const players = G.stations.filter((s) => s?.isPlayer);
    const pool = players.length ? players : G.stations;
    pool.sort((a, b) => (b.fin?.rev || 0) - (a.fin?.rev || 0));
    return pool[0]?.id ? [pool[0].id] : [];
  }
  const key = String(stationKey).toLowerCase();
  const hit = G.stations.find(
    (s) =>
      s &&
      ((s.id && String(s.id).toLowerCase() === key) ||
        (s.callLetters && String(s.callLetters).toLowerCase().includes(key))),
  );
  return hit?.id ? [hit.id] : [];
}

function extractGameState(parsed) {
  if (!parsed || typeof parsed !== 'object') return { G: null, meta: {} };
  if (parsed.G && typeof parsed.G === 'object') {
    return {
      G: parsed.G,
      meta: { v: parsed.v, saved: parsed.saved, label: parsed.label },
    };
  }
  if (parsed.stations && parsed.year != null) {
    return { G: parsed, meta: { wrapped: false } };
  }
  return { G: null, meta: {} };
}

function money(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const x = Math.round(n);
  if (Math.abs(x) >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`;
  if (Math.abs(x) >= 1000) return `$${Math.round(x / 1000)}K`;
  return `$${x}`;
}

function pctFrac(f) {
  if (f == null || Number.isNaN(f)) return '—';
  return `${(f * 100).toFixed(1)}%`;
}

function buildTraceMd(report) {
  const lines = [];
  lines.push('# Save P&L trace');
  lines.push('');
  if (!report.ok) {
    lines.push(`**Error:** ${report.err}`);
    return lines.join('\n');
  }
  const g = report.game || {};
  lines.push(`**Game:** ${g.marketId} ${g.year} ${g.period === 1 ? 'Spring' : 'Fall'} · ratings repair stations: ${report.ratingsLoadRepair || 0}`);
  lines.push('');
  lines.push('| Stage | Calls | Rev | Cost | EBITDA | Share |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
  for (const r of report.trace || []) {
    lines.push(
      `| ${r.stage} | ${r.callLetters} | ${money(r.rev)} | ${money(r.cost)} | ${money(r.ebitda)} | ${pctFrac(r.share)} |`,
    );
  }
  const raw = (report.trace || []).filter((r) => r.stage === 'raw_save');
  const end = (report.trace || []).filter((r) => r.stage === 'after_calcRev_all_stations');
  if (raw.length && end.length) {
    lines.push('');
    for (const r of raw) {
      const e = end.find((x) => x.stationId === r.stationId);
      if (!e) continue;
      lines.push(
        `**${r.callLetters}:** saved EBITDA ${money(r.ebitda)} → after pipeline ${money(e.ebitda)} (Δ ${money(e.ebitda - r.ebitda)})`,
      );
    }
  }
  return lines.join('\n');
}

function buildRawMd(report) {
  const lines = [];
  lines.push('# Save economics (raw JSON only)');
  lines.push('');
  const ui = report.uiProfitField || {};
  lines.push(`**UI field:** ${ui.label} — ${ui.formula}`);
  lines.push(`**Period:** ${ui.period || 'half-year per period'}`);
  lines.push('');
  for (const st of report.stations || []) {
    const f = st.fin || {};
    const u = st.uiStationCard || {};
    lines.push(`## ${st.callLetters} (${st.format} ${st.signal})`);
    lines.push(`- Saved fin.rev ${money(f.rev)} · fin.cost ${money(f.cost)} · fin.ebitda ${money(f.ebitda)}`);
    lines.push(`- UI card EBITDA ${money(u.stnEbitda)} (revUi ${money(u.revUi)} − costUi ${money(u.costUi)})`);
    if (st.uiCombinedWith) lines.push(`- Combined simulcast card with ${st.uiCombinedWith}`);
    lines.push(`- Share ${pctFrac(st.share)} · sellout ${pctFrac(st.sellout)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function buildMd(report) {
  const lines = [];
  lines.push('# Save Economics Inspection');
  lines.push('');
  lines.push('Inspector: `scripts/inspect-save-economics.mjs` · `npm run inspect:save-economics`');
  lines.push('');
  if (!report.ok) {
    lines.push(`**Error:** ${report.err || 'unknown'}`);
    if (report.detail) lines.push('', '```json', JSON.stringify(report.detail, null, 2), '```');
    return lines.join('\n');
  }
  if (report.mode === 'raw_only') return buildRawMd(report);
  if (report.mode === 'trace_pnl') return buildTraceMd(report);

  const sm = report.saveMeta || {};
  const g = report.game || {};
  const st = report.station || {};
  const fin = st.fin || {};
  lines.push(`**Save:** ${sm.label || '(no label)'} · saved ${sm.saved || '?'} · game ${g.marketId} ${g.year} ${g.period === 1 ? 'Spring' : 'Fall'}`);
  if (report.selection?.autoPicked) lines.push('**Station:** auto-selected highest-revenue player station (use `--station=` to override)');
  if (report.pipelineMismatch) {
    const m = report.pipelineMismatch;
    lines.push('');
    lines.push('## Saved vs inspector pipeline (important)');
    lines.push('');
    lines.push(`| | Saved (matches live UI) | After inspector pipeline | Δ |`);
    lines.push(`| --- | ---: | ---: | ---: |`);
    lines.push(`| EBITDA | ${money(m.savedEbitda)} | ${money(m.pipelineEbitda)} | ${money(m.ebitdaDelta)} |`);
    lines.push(`| Revenue | ${money(m.savedRev)} | ${money(m.pipelineRev)} | ${money(m.revDelta)} |`);
    lines.push('');
    lines.push(m.note);
    lines.push('');
    lines.push('Use `--raw-only` or `--trace-pnl` to inspect without assuming pipeline numbers match the game UI.');
  }
  lines.push('');
  lines.push('## Station snapshot (after migrateSave → recalc → seedRev, same as game load)');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Calls / brand | ${st.callLetters || '—'} / ${st.brand || '—'} |`);
  lines.push(`| Format / signal | ${st.format || '—'} ${st.signal || ''} ${st.power || ''} |`);
  lines.push(`| Owner | ${st.ownerType} · isPlayer=${st.isPlayer} |`);
  lines.push(`| Rank / share / AQH | #${st.rank} · ${pctFrac(st.share)} · ${st.aqh || '—'} |`);
  lines.push(`| Revenue / period | ${money(fin.revenue)} |`);
  lines.push(`| Expenses / period | ${money(fin.expenses)} |`);
  lines.push(`| EBITDA / margin | ${money(fin.ebitda)} · ${pctFrac(st.ebitdaMargin)} |`);
  lines.push(`| Terrestrial / stream / digital | ${money(fin.terrestrial)} / ${money(fin.stream)} / ${money(fin.digital)} |`);
  lines.push(`| Fixed / talent | ${money(fin.fixed)} (${pctFrac(st.fixedCostPctRev)} rev) / ${money(fin.talent)} (${pctFrac(st.talentPayrollPctRev)} rev) |`);
  lines.push(`| Sellout / OQ / identity | ${pctFrac(st.sellout)} / ${st.oq ?? '—'} / ${st.identity ?? '—'} |`);
  lines.push(`| Ops promo/prog (eff) | ${money(fin.opsPromo)} / ${money(fin.opsProgBudget)} → eff ${money(fin.effPromo)} / ${money(fin.effProg)} |`);
  if (fin.competitiveBaselinePromo > 0 || fin.competitiveBaselineProg > 0) {
    lines.push(`| Player baseline floor | promo ${money(fin.competitiveBaselinePromo)} · prog ${money(fin.competitiveBaselineProg)} |`);
  }
  lines.push('');
  lines.push('### Dayparts');
  const dq = st.daypartQ || {};
  lines.push(`- Morning ${dq.morning ?? '—'} · Mid ${dq.midday ?? '—'} · PM ${dq.afternoon ?? '—'} · Eve ${dq.evening ?? '—'}`);
  lines.push(`- Staffed ${st.staffedDayparts} · vacant ${st.vacantDayparts} · automated ${st.automatedDayparts}`);
  if (st.talent?.length) {
    lines.push('');
    lines.push('| Slot | Talent | Salary | Q |');
    lines.push('| --- | --- | ---: | ---: |');
    for (const t of st.talent) {
      lines.push(`| ${t.slot} | ${t.name} | ${money(t.salaryAnnual)} | ${t.quality} |`);
    }
  }
  lines.push('');
  lines.push('## Revenue decomposition');
  const d = report.revenueDecomposition || {};
  if (d.marketBilling) {
    lines.push(`- Market annual billing: ${money(d.marketBilling.annualMarketBilling)} · half-period pool: ${money(d.marketBilling.halfPeriodPool)}`);
    lines.push(`- Station share of pool: ${d.pctOfHalfPeriodPool != null ? `${d.pctOfHalfPeriodPool}%` : '—'} · monetization eff: ${d.monetizationEfficiency ?? '—'}`);
  }
  lines.push(`- AQH ${d.aqh ?? '—'} · sellout ${pctFrac(d.sellout)} · share ${pctFrac(d.shareDecimal)}`);
  if (d.preSeedRevGross) {
    lines.push(`- Pre–seedRev terrestrial gross: ${money(d.preSeedRevGross)} (× FM early ${d.fmEarlyEraMonMult ?? 1} × sellout ${d.shareSelloutMult ?? 1} × dominant ${d.dominantEarlyEraMult ?? 1})`);
  }
  if (d.playerBaselineTotal) lines.push(`- Player baseline promo+prog floor (cost): ${money(d.playerBaselineTotal)}`);
  lines.push('');
  lines.push('## Cost breakdown (period)');
  lines.push('');
  lines.push('| Line | $ |');
  lines.push('| --- | ---: |');
  for (const [k, v] of [
    ['Fixed (staff/fac/reg/SF/cluster)', fin.fixed],
    ['Talent payroll', fin.talent],
    ['Sales & admin', fin.salesAdmin],
    ['Ops floor', fin.opsFloor],
    ['Promo (effective)', fin.effPromo],
    ['Programming (effective)', fin.effProg],
    ['Stream upkeep', fin.streamUpkeep],
    ['Syndication / rights', fin.syndicationRights],
    ['Identity budget P&L', fin.identityPnl],
    ['AM hits contest', fin.amHitsContestOpex],
    ['AI loan interest', fin.aiLoanInterest],
  ]) {
    if (v) lines.push(`| ${k} | ${money(v)} |`);
  }
  lines.push('');
  lines.push('## Counterfactuals');
  const cf = report.counterfactuals || {};
  if (cf.noPlayerFlag) {
    const delta = cf.noPlayerFlagDelta || {};
    lines.push(`1. **isPlayer=false** — rev ${money(cf.noPlayerFlag.revenue)} (Δ ${money(delta.rev)}) · margin ${pctFrac(cf.noPlayerFlag.revenue > 0 ? cf.noPlayerFlag.ebitda / cf.noPlayerFlag.revenue : null)}`);
  }
  if (cf.noPlayerBaseline) {
    lines.push(`2. **No player baseline promo/prog** — EBITDA ${money(cf.noPlayerBaseline.ebitda)} (saved spend ${money((cf.noPlayerBaseline.effPromoSaved || 0) + (cf.noPlayerBaseline.effProgSaved || 0))})`);
  }
  if (cf.talentCut) {
    lines.push(`3. **Cut ${cf.talentCut.slot}** — EBITDA Δ ${money(cf.talentCut.ebitdaDelta)} · rev Δ ${money(cf.talentCut.revDelta)} · rational=${cf.talentCut.netBetter ? 'yes' : 'no'}`);
  }
  if (cf.payrollDoubled) {
    lines.push(`4. **Payroll ×2** — expenses ${money(cf.payrollDoubled.expenses)} · EBITDA ${money(cf.payrollDoubled.ebitda)}`);
  }
  if (cf.fixedCostsPlus25Pct) {
    lines.push(`5. **Fixed +25%** — EBITDA ${money(cf.fixedCostsPlus25Pct.ebitda)} · margin ${pctFrac(cf.fixedCostsPlus25Pct.ebitdaMargin)}`);
  }
  lines.push('');
  lines.push('## Q&A');
  for (const item of report.analysis?.answers || []) {
    lines.push(`**${item.q}**`);
    lines.push(`${item.a}`);
    lines.push('');
  }
  lines.push(`**Balance read:** ${report.analysis?.verdict || '—'}`);
  if (report.analysis?.drivers?.length) {
    lines.push('');
    lines.push('Drivers: ' + report.analysis.drivers.join(' · '));
  }
  if (report.playerStationsInSave?.length > 1) {
    lines.push('');
    lines.push('## All player stations in save');
    lines.push('| Calls | Format | Rev | Margin |');
    lines.push('| --- | --- | ---: | ---: |');
    for (const p of report.playerStationsInSave) {
      lines.push(`| ${p.callLetters} | ${p.format} ${p.signal || ''} | ${money(p.rev)} | ${pctFrac(p.margin)} |`);
    }
  }
  lines.push('');
  lines.push('## Export save from browser');
  lines.push('See `public/export-save-for-inspector.html` or in-game **Save/Load → Download save file**.');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run inspect:save-economics -- --file=/path/to/airwave-empire-*.json --station=KXXX');
  lines.push('```');
  return lines.join('\n');
}

function writeBootstrapTestSave(marketId = 'wichita') {
  const ctx = loadCtx(marketId);
  const outPath = path.join(root, 'tmp', '_inspect_test_save.json');
  const boot = vm.runInContext(
    `(function(){
      var sc=SC.find(function(x){ return x.id==='under'; });
      if(!sc) return {ok:false};
      sc.idx=[0];
      ACTIVE_MARKET='${marketId}';
      if(typeof syncMarketPopToMarket==='function') syncMarketPopToMarket('${marketId}');
      var g=genMarket('under');
      return {ok:true, G:g, label:'bootstrap-test'};
    })()`,
    ctx,
    { timeout: 120_000 },
  );
  if (!boot?.ok || !boot.G) throw new Error('bootstrap_failed');
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify({ v: 1, saved: new Date().toISOString(), label: boot.label, G: boot.G }),
  );
  console.log('Wrote bootstrap test save:', outPath, boot.G.marketId, boot.G.year);
  return outPath;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--write-test-save')) {
    const mktArg = argv.find((a) => a.startsWith('--market='));
    writeBootstrapTestSave(mktArg ? mktArg.slice(9) : 'wichita');
    return;
  }
  const args = parseArgs(argv);
  if (!args.file) {
    console.error(
      'Usage: node scripts/inspect-save-economics.mjs --file=/path/to/save.json [--station=id|calls] [--market=] [--year=] [--period=1|2]',
    );
    console.error('       node scripts/inspect-save-economics.mjs --file=save.json --station=KBAY --raw-only');
    console.error('       node scripts/inspect-save-economics.mjs --file=save.json --station=KBAY --trace-pnl');
    console.error('       node scripts/inspect-save-economics.mjs --write-test-save  # dev smoke test');
    process.exit(1);
  }
  const filePath = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error('Could not read file:', filePath, e.message);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
  }
  const { G, meta } = extractGameState(parsed);
  if (!G?.stations?.length) {
    console.error('Save JSON must contain payload.G with stations (or a raw G object).');
    process.exit(1);
  }
  const marketId = args.market || G.marketId || 'atlanta';
  const targetIds = findStationIds(G, args.station);

  if (args.rawOnly) {
    const report = vm.runInContext(`(${RAW_ONLY_IIFE})(${JSON.stringify({ G, targetStationIds: targetIds })})`, createVmContext(), { timeout: 30_000 });
    report.input = { file: filePath, ...args };
    report.saveMeta = meta;
    mkdirSync(path.join(root, 'tmp'), { recursive: true });
    writeFileSync(outJson, JSON.stringify(report, null, 2));
    writeFileSync(outMd, buildMd(report));
    console.log('Wrote', outJson);
    for (const st of report.stations || []) {
      console.log(`${st.callLetters} raw EBITDA ${money(st.fin.ebitda)} · UI card ${money(st.uiStationCard?.stnEbitda)}`);
    }
    return;
  }

  const ctx = loadCtx(marketId);
  const cfg = {
    G,
    marketId: args.market || null,
    year: Number.isFinite(args.year) ? args.year : null,
    period: Number.isFinite(args.period) ? args.period : null,
    stationKey: args.station || null,
    saveMeta: meta,
    targetStationIds: targetIds,
    includeCalcRevDebug: !!args.tracePnl,
  };
  let report;
  try {
    if (args.tracePnl) {
      report = vm.runInContext(`(${TRACE_PNL_IIFE})(${JSON.stringify(cfg)})`, ctx, { timeout: 300_000 });
      report.mode = 'trace_pnl';
      report.saveMeta = meta;
      report.selection = { stationKey: args.station || null, stationIds: targetIds };
    } else {
      report = vm.runInContext(`(${INSPECT_IIFE})(${JSON.stringify(cfg)})`, ctx, { timeout: 300_000 });
    }
  } catch (e) {
    report = { ok: false, err: 'vm_throw', message: String(e?.message || e) };
  }
  report = report || { ok: false, err: 'empty_result' };
  report.input = { file: filePath, ...args };
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, buildMd(report));
  console.log('Wrote', outJson);
  console.log('Wrote', outMd);
  if (!report.ok) {
    console.error('Inspection failed:', report.err);
    process.exit(1);
  }
  if (report.mode === 'trace_pnl') {
    const raw = (report.trace || []).filter((r) => r.stage === 'raw_save');
    const end = (report.trace || []).filter((r) => r.stage === 'after_calcRev_all_stations');
    for (const r of raw) {
      const e = end.find((x) => x.stationId === r.stationId);
      console.log(
        `${r.callLetters}: raw ${money(r.ebitda)} → pipeline ${money(e?.ebitda)} (rev ${money(r.rev)} → ${money(e?.rev)})`,
      );
    }
    return;
  }
  const st = report.station;
  if (report.pipelineMismatch) {
    console.log(
      `${st.callLetters}: saved UI EBITDA ${money(report.pipelineMismatch.savedEbitda)} vs pipeline ${money(report.pipelineMismatch.pipelineEbitda)}`,
    );
  }
  console.log(
    `${st.callLetters} ${st.format} ${st.signal} · pipeline rev ${money(st.fin.revenue)} · margin ${pctFrac(st.ebitdaMargin)}`,
  );
}

main();
