#!/usr/bin/env node
/**
 * Station Economics / EBITDA Margin Audit (diagnostic only — no gameplay changes).
 *
 *   npm run diag:station-economics
 *   node scripts/diag-station-economics-audit.mjs --runs=4
 *
 * Artifacts: tmp/station_economics_audit.json, tmp/station_economics_audit.md
 */
/* eslint-disable no-console */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { familyForFormat, loadFormatFamiliesCatalog } from './formatFamilyHelpers.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const talentPath = path.join(root, 'src', 'talentRetention.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'station_economics_audit.json');
const outMd = path.join(root, 'tmp', 'station_economics_audit.md');

const START_YEARS = [1970, 1985, 2000];
const SNAPSHOT_YEARS = [1980, 1990, 2000, 2010, 2020, 2025];
const DEFAULT_RUNS = 4;
const DEFAULT_SEED = 20260615;
const END_YEAR = 2025;

const ERA_BANDS = [
  { id: '1970s', min: 1970, max: 1979 },
  { id: '1980s', min: 1980, max: 1989 },
  { id: '1990s', min: 1990, max: 1999 },
  { id: '2000s', min: 2000, max: 2009 },
  { id: '2010s', min: 2010, max: 2019 },
  { id: '2020s', min: 2020, max: 2030 },
];

const RANK_BUCKETS = ['rank1', 'top3', 'top5', 'middle', 'bottom_half'];

function injectHeadlessDiagFixes(src) {
  let out = src;
  // Headless recalc hits const reassignment in staffingAutomationAppealTradeoffMult (runtime throw).
  out = out.replace(
    'function staffingAutomationAppealTradeoffMult(s,G){\n  const t=stationAutomationScore(s,G);\n  const fmt=staffingAutomationFormatPenaltyMult(s.format);',
    'function staffingAutomationAppealTradeoffMult(s,G){\n  const t=stationAutomationScore(s,G);\n  let fmt=staffingAutomationFormatPenaltyMult(s.format);',
  );
  return injectHeadlessLaunchNewsGuard(out);
}

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
  // legacy advTurn references `global.wlCampaign*` (browser has global; Node VM does not)
  ctx.global = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

let ctxSingleton = null;

function loadCtx() {
  if (ctxSingleton) return ctxSingleton;
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let legacy = injectHeadlessDiagFixes(readFileSync(legacyPath, 'utf8'));
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  if (readFileSync(talentPath, 'utf8')) {
    vm.runInContext(readFileSync(talentPath, 'utf8'), ctx, { filename: 'talentRetention.js', timeout: 120_000 });
  }
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  ctxSingleton = ctx;
  return ctx;
}

const RUNNER_IIFE = `
(function(cfg){
  var SNAPSHOT_YEARS=cfg.snapshotYears;
  var END_YEAR=cfg.endYear;
  var DAYPARTS=['morningDrive','midday','afternoonDrive','evening','overnight'];

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
  function annualTalentPayroll(s){
    return periodTalentPayroll(s)*2;
  }
  function captureStationRow(s, G, rank, nComm){
    if(typeof calcRev==='function') calcRev(s, G);
    var rev=s.fin&&s.fin.rev?s.fin.rev:0;
    var cost=s.fin&&s.fin.cost?s.fin.cost:0;
    var ebitda=s.fin&&s.fin.ebitda!=null?s.fin.ebitda:(rev-cost);
    var fix=s.fin&&s.fin.fix?s.fin.fix:0;
    var talPeriod=periodTalentPayroll(s);
    var talAnnual=talPeriod*2;
    var lineup=slotLineup(s);
    var mkt=MARKETS[G.marketId||ACTIVE_MARKET]||{};
    return {
      marketId:G.marketId,
      year:G.year,
      stationId:s.id,
      callLetters:s.callLetters||'',
      format:s.format||'',
      ownerType:ownerType(s),
      signal:signalBand(s),
      rank:rank,
      nCommercial:nComm,
      share:Math.round((s.rat&&s.rat.share||0)*10000)/10000,
      rev:Math.round(rev),
      expenses:Math.round(cost),
      ebitda:Math.round(ebitda),
      ebitdaMargin:rev>5000?Math.round((ebitda/rev)*10000)/10000:null,
      fixedCost:Math.round(fix),
      talentPayrollAnnual:Math.round(talAnnual),
      talentPayrollPctRev:rev>5000?Math.round((talPeriod/rev)*10000)/10000:null,
      fixedCostPctRev:rev>5000?Math.round((fix/rev)*10000)/10000:null,
      sellout:Math.round((s.ops&&s.ops.sell||0)*10000)/10000,
      oq:Math.round(s.oq||0),
      morningQ:lineup.q.morning,
      middayQ:lineup.q.midday,
      afternoonQ:lineup.q.afternoon,
      eveningQ:lineup.q.evening,
      staffedDayparts:lineup.staffed,
      vacantDayparts:lineup.vacant,
      automatedDayparts:lineup.automated,
      automationScore:typeof stationAutomationScore==='function'?Math.round(stationAutomationScore(s,G)*1000)/1000:0
    };
  }
  function captureSnapshot(G, snapYear){
    if(G.year!==snapYear||G.period!==1) return null;
    var book=sortBook(G.stations);
    var rows=[];
    for(var i=0;i<book.length;i++){
      rows.push(captureStationRow(book[i], G, i+1, book.length));
    }
    return rows;
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
    if(typeof calcRev!=='function') return null;
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
      if(x&&!x._bpSlotDeferred) calcRev(x, Gc);
    });
    var revAfter=st.fin&&st.fin.rev?st.fin.rev:0;
    var ebitdaAfter=st.fin&&st.fin.ebitda!=null?st.fin.ebitda:0;
    return {
      slot:slot,
      salarySaveAnnual:salarySaveAnnual,
      salarySavePeriod:saveHalf,
      qualityBefore:Math.round(qualBefore),
      qualityAfter:sd.quality,
      revBefore:Math.round(revBefore),
      revAfter:Math.round(revAfter),
      revDelta:Math.round(revAfter-revBefore),
      ebitdaBefore:Math.round(ebitdaBefore),
      ebitdaAfter:Math.round(ebitdaAfter),
      ebitdaDelta:Math.round(ebitdaAfter-ebitdaBefore),
      netBetter:ebitdaAfter>ebitdaBefore
    };
  }
  function genHeadless(marketId, startYear){
    var sc=SC.find(function(x){ return x.id==='under'; });
    if(!sc) return {ok:false, err:'no_scenario'};
    var savedIdx=sc.idx.slice();
    sc.idx=[];
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function') syncMarketPopToMarket(marketId);
    var g;
    try{
      g=genMarket('under');
    }catch(e){
      sc.idx=savedIdx;
      return {ok:false, err:'gen_throw', message:String(e&&e.message||e)};
    }
    if(typeof wlBindGameState==='function') wlBindGameState(g);
    else G=g;
    sc.idx=savedIdx;
    (g.stations||[]).forEach(function(st){ if(st) st.isPlayer=false; });
    g.ps=[];
    g._wlHarnessDeterministic=true;
    if(!g.news) g.news=[];
    var guard=0;
    var targetYear=Math.round(Number(startYear))||1970;
    while((g.year<targetYear||(g.year===targetYear&&g.period!==1))&&guard<500){
      try{
        advTurn();
      }catch(e){
        return {ok:false, err:'adv_throw', year:g.year, period:g.period, message:String(e&&e.message||e)};
      }
      guard++;
    }
    if(g.year!==targetYear||g.period!==1){
      return {ok:false, err:'warmup_miss', year:g.year, period:g.period, targetYear:targetYear, guard:guard};
    }
    return {ok:true, G:g};
  }
  function runOne(cfg){
    var s=cfg.seed;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    var ui=window._harnessPatchTimersAndUi?window._harnessPatchTimersAndUi():null;
    try{
    var boot=genHeadless(cfg.marketId, cfg.startYear);
    if(!boot.ok) return {ok:false, err:boot.err, detail:boot};
    if(typeof wlBindGameState==='function') wlBindGameState(boot.G);
    else G=boot.G;
    var snapshots={};
    var whatIfs=[];
    var steps=0;
    var startY=Math.round(Number(cfg.startYear))||1970;
    var maxSteps=Math.min(480, (END_YEAR-startY)*2+40);
    function maybeCapture(){
      var y=Math.round(Number(G.year));
      if(SNAPSHOT_YEARS.indexOf(y)<0||G.period!==1||y<startY) return;
      if(snapshots[y]) return;
      var cap=captureSnapshot(G, y);
      if(cap&&cap.length) snapshots[y]=cap;
    }
    maybeCapture();
    while(steps<maxSteps){
      if(G.year>END_YEAR||(G.year===END_YEAR&&G.period>1)) break;
      try{
        advTurn();
      }catch(e){
        return {ok:false, err:'sim_throw', year:G.year, period:G.period, steps:steps, message:String(e&&e.message||e)};
      }
      steps++;
      maybeCapture();
    }
    maybeCapture();
    var lastYear=SNAPSHOT_YEARS.filter(function(y){ return snapshots[y]; }).pop();
    if(lastYear){
      var book=sortBook(G.stations);
      for(var j=0;j<book.length;j++){
        var st=book[j];
        if(!isComm(st)) continue;
        var slot=pickCutSlot(st);
        if(!slot) continue;
        var wf=whatIfCutDaypart(G, st, slot);
        if(wf){
          wf.stationId=st.id;
          wf.format=st.format;
          wf.rank=j+1;
          wf.share=Math.round((st.rat&&st.rat.share||0)*10000)/10000;
          wf.oq=Math.round(st.oq||0);
          wf.ebitdaMargin=st.fin&&st.fin.rev>5000?Math.round(((st.fin.ebitda||0)/st.fin.rev)*10000)/10000:null;
          whatIfs.push(wf);
        }
      }
    }
    return {
      ok:true,
      marketId:cfg.marketId,
      startYear:cfg.startYear,
      seed:cfg.seed,
      steps:steps,
      endYear:G.year,
      endPeriod:G.period,
      snapshots:snapshots,
      whatIf:lastYear,
      whatIfYear:lastYear,
      whatIfs:whatIfs
    };
    }catch(e){
      return {ok:false, err:'run_throw', message:String(e&&e.message||e)};
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

function rankBucket(rank, nComm) {
  if (rank === 1) return 'rank1';
  if (rank <= 3) return 'top3';
  if (rank <= 5) return 'top5';
  if (rank <= Math.max(1, Math.floor(nComm / 2))) return 'middle';
  return 'bottom_half';
}

const catalog = loadFormatFamiliesCatalog();

function formatFamilyBucket(fmt, signal) {
  if (fmt === 'BROKERED_PROGRAMMING') return 'brokered';
  if (signal === 'stream') return 'stream_digital';
  const fam = familyForFormat(fmt, catalog);
  if (!fam) {
    if (String(fmt || '').startsWith('PUBLIC_')) return 'public';
    return 'other';
  }
  if (fam === 'PUBLIC') return 'public';
  if (fam === 'SPOKEN') {
    if (fmt === 'SPORTS_TALK') return 'sports';
    return 'news_talk';
  }
  if (fam === 'INSTITUTIONAL' || fam === 'CHRISTIAN') return 'brokered';
  if (['HITS', 'ROCK', 'ADULT', 'COUNTRY', 'URBAN'].includes(fam)) return 'music';
  if (fam === 'SPANISH') return 'music';
  return 'other';
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

function enrichRow(row, marketTier) {
  return {
    ...row,
    era: eraForYear(row.year),
    marketTier,
    rankBucket: rankBucket(row.rank, row.nCommercial),
    formatFamily: formatFamilyBucket(row.format, row.signal),
  };
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
    const rev = list.map((r) => r.rev);
    const exp = list.map((r) => r.expenses);
    const eb = list.map((r) => r.ebitda);
    const margins = list.map((r) => r.ebitdaMargin).filter((m) => m != null);
    const talPct = list.map((r) => r.talentPayrollPctRev).filter((m) => m != null);
    const fixPct = list.map((r) => r.fixedCostPctRev).filter((m) => m != null);
    const mDist = distStats(margins);
    out[k] = {
      n: list.length,
      medianRev: distStats(rev)?.median ?? null,
      medianExpenses: distStats(exp)?.median ?? null,
      medianEbitda: distStats(eb)?.median ?? null,
      medianEbitdaMargin: mDist?.median ?? null,
      p25EbitdaMargin: mDist?.p25 ?? null,
      p75EbitdaMargin: mDist?.p75 ?? null,
      pctNegativeEbitda: margins.length
        ? list.filter((r) => r.ebitda < 0).length / list.length
        : null,
      pctMarginAbove20: margins.length ? margins.filter((m) => m > 0.2).length / margins.length : null,
      pctMarginAbove30: margins.length ? margins.filter((m) => m > 0.3).length / margins.length : null,
      pctMarginAbove40: margins.length ? margins.filter((m) => m > 0.4).length / margins.length : null,
      pctMarginAbove50: margins.length ? margins.filter((m) => m > 0.5).length / margins.length : null,
      pctMarginBelow15: margins.length ? margins.filter((m) => m < 0.15).length / margins.length : null,
      medianTalentPayrollPctRev: distStats(talPct)?.median ?? null,
      medianFixedCostPctRev: distStats(fixPct)?.median ?? null,
    };
  }
  return out;
}

function summarizeWhatIfs(items) {
  const ok = items.filter((w) => w && w.ebitdaDelta != null);
  if (!ok.length) return null;
  const savesDistressed = ok.filter((w) => (w.ebitdaBefore || 0) < 0 && w.ebitdaDelta > 0).length;
  const distressedN = ok.filter((w) => (w.ebitdaBefore || 0) < 0).length;
  const profitableBoost = ok.filter((w) => (w.ebitdaBefore || 0) > 0 && w.ebitdaDelta > 0).length;
  const profitableN = ok.filter((w) => (w.ebitdaBefore || 0) > 0).length;
  const revHurtMore = ok.filter((w) => w.revDelta < 0 && Math.abs(w.revDelta) > (w.salarySavePeriod || 0)).length;
  const minimal = ok.filter((w) => Math.abs(w.ebitdaDelta) < Math.max(5000, (w.salarySavePeriod || 0) * 0.15)).length;
  return {
    n: ok.length,
    medianEbitdaDelta: distStats(ok.map((w) => w.ebitdaDelta))?.median ?? null,
    medianRevDelta: distStats(ok.map((w) => w.revDelta))?.median ?? null,
    pctSavesDistressed: distressedN ? savesDistressed / distressedN : null,
    pctBoostProfitable: profitableN ? profitableBoost / profitableN : null,
    pctRevLossExceedsSave: ok.length ? revHurtMore / ok.length : null,
    pctMinimalEffect: ok.length ? minimal / ok.length : null,
  };
}

function buildVerdict(agg, sf1980, modern, whatIf, elite) {
  const signals = [];
  let score = { plausible: 0, tooProfitable: 0, underScaled: 0, weakModern: 0 };

  const top5_80s = agg.byEraRank?.['1980s|top5'] || agg.byEraRank?.['1980s|rank1'];
  if (top5_80s?.medianEbitdaMargin != null && top5_80s.medianEbitdaMargin > 0.38) {
    score.tooProfitable += 2;
    signals.push(`1980s top stations median EBITDA margin ${pctFrac(top5_80s.medianEbitdaMargin)} (p75 ${pctFrac(top5_80s.p75EbitdaMargin)})`);
  }
  if (top5_80s?.pctMarginAbove40 != null && top5_80s.pctMarginAbove40 > 0.35) {
    score.tooProfitable += 1;
    signals.push(`${pctFrac(top5_80s.pctMarginAbove40)} of 1980s top-5 snapshots exceed 40% margin`);
  }

  const talAll = Object.values(agg.byEra || {})
    .map((x) => x.medianTalentPayrollPctRev)
    .filter((x) => x != null);
  const medTal = distStats(talAll)?.median;
  if (medTal != null && medTal < 0.09) {
    score.underScaled += 2;
    signals.push(`Median talent payroll is only ${pctFrac(medTal)} of revenue across eras`);
  }
  const fixAll = Object.values(agg.byEra || {})
    .map((x) => x.medianFixedCostPctRev)
    .filter((x) => x != null);
  const medFix = distStats(fixAll)?.median;
  if (medTal != null && medFix != null && medTal + medFix < 0.42) {
    score.underScaled += 1;
    signals.push(`Talent + fixed overhead median ${pctFrac(medTal + medFix)} of revenue — limited room for other opex`);
  }

  if (modern) {
    if (modern.pctNegativeEbitda != null && modern.pctNegativeEbitda < 0.12) {
      score.weakModern += 1;
      signals.push(`Only ${pctFrac(modern.pctNegativeEbitda)} commercial stations unprofitable in 2010–2025`);
    }
    if (modern.pctMarginAbove40 != null && modern.pctMarginAbove40 > 0.22) {
      score.weakModern += 2;
      signals.push(`${pctFrac(modern.pctMarginAbove40)} of modern-era snapshots still above 40% EBITDA margin`);
    }
    if (modern.pctMarginBelow15 != null && modern.pctMarginBelow15 < 0.2) {
      score.weakModern += 1;
      signals.push(`Only ${pctFrac(modern.pctMarginBelow15)} below 15% margin (weak pressure band)`);
    }
  }

  if (whatIf?.pctRevLossExceedsSave != null && whatIf.pctRevLossExceedsSave > 0.45) {
    score.plausible += 1;
    signals.push(`Talent cut what-if: revenue loss exceeds salary save in ${pctFrac(whatIf.pctRevLossExceedsSave)} of cases`);
  }
  if (whatIf?.pctBoostProfitable != null && whatIf.pctBoostProfitable > 0.55) {
    signals.push(`Cutting a daypart raises EBITDA on ${pctFrac(whatIf.pctBoostProfitable)} of already-profitable stations (mechanical save; see margin tables)`);
  }

  if (sf1980?.n >= 8 && sf1980.pctMarginAbove45 != null) {
    signals.push(
      `San Francisco 1980: ${pctFrac(sf1980.pctMarginAbove45)} of commercial snapshots ≥45% margin (median ${pctFrac(sf1980.medianEbitdaMargin)})`,
    );
  }

  if (elite?.medianEbitdaMargin != null && elite.medianEbitdaMargin > 0.35) {
    score.tooProfitable += 1;
    signals.push(`Elite (OQ≥90, top-5) median margin ${pctFrac(elite.medianEbitdaMargin)}, talent ${pctFrac(elite.medianTalentPayrollPctRev)} of rev`);
  }

  const rank1_80s = agg.byEraRank?.['1980s|rank1'];
  const rank1_00s = agg.byEraRank?.['2000s|rank1'];
  const rank1_20s = agg.byEraRank?.['2020s|rank1'];
  if (rank1_80s?.medianEbitdaMargin != null && rank1_80s.medianEbitdaMargin > 0.35) {
    score.tooProfitable += 2;
    signals.push(`1980s #1 stations median EBITDA margin ${pctFrac(rank1_80s.medianEbitdaMargin)}`);
  }
  if (rank1_00s?.medianEbitdaMargin != null && rank1_00s.medianEbitdaMargin > 0.35) {
    score.tooProfitable += 1;
    signals.push(`2000s #1 stations median EBITDA margin ${pctFrac(rank1_00s.medianEbitdaMargin)}`);
  }
  if (modern?.pctNegativeEbitda != null && modern.pctNegativeEbitda > 0.55) {
    score.weakModern -= 1;
    signals.push(`${pctFrac(modern.pctNegativeEbitda)} of 2010–2025 commercial snapshots are unprofitable (high distress, not weak pressure)`);
  }
  if (
    modern?.pctMarginAbove30 != null &&
    modern.pctMarginAbove30 < 0.05 &&
    (modern.pctNegativeEbitda == null || modern.pctNegativeEbitda < 0.5)
  ) {
    score.weakModern += 2;
    signals.push(`Only ${pctFrac(modern.pctMarginAbove30)} above 30% EBITDA margin in 2010–2025`);
  }
  if (modern?.pctNegativeEbitda != null && modern.pctNegativeEbitda > 0.8 && modern.pctMarginAbove30 < 0.08) {
    score.weakModern = 0;
    score.plausible = 0;
    signals.push(
      'Market-wide modern snapshots are mostly deep losses with almost no high-margin outliers — player-flagship audit recommended',
    );
  }
  if (rank1_20s?.medianTalentPayrollPctRev != null && rank1_20s.medianTalentPayrollPctRev < 0.08) {
    score.underScaled += 1;
    signals.push(`2020s #1 talent payroll only ${pctFrac(rank1_20s.medianTalentPayrollPctRev)} of period revenue`);
  }

  const ranked = [
    ['B', score.tooProfitable],
    ['C', score.underScaled],
    ['D', score.weakModern],
    ['A', score.plausible],
  ].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  let verdict = 'E';
  let verdictLabel = 'Needs further targeted audit';
  if (top[1] >= 2) {
    verdict = top[0];
    verdictLabel =
      top[0] === 'A'
        ? 'Station economics look broadly plausible'
        : top[0] === 'B'
          ? 'Successful stations are too profitable'
          : top[0] === 'C'
            ? 'Talent payroll / fixed costs are under-scaled'
            : 'Modern-era pressure is too weak';
  } else if (top[1] === 1 && ranked[1][1] === 1) {
    verdict = 'E';
    verdictLabel = 'Mixed signals — needs further targeted audit';
  } else if (top[1] >= 1 && top[0] !== 'B') {
    verdict = top[0];
    verdictLabel =
      top[0] === 'C'
        ? 'Talent payroll / fixed costs are under-scaled'
        : top[0] === 'D'
          ? 'Modern-era pressure is too weak'
          : 'Station economics look broadly plausible';
  }

  const cutVerdict =
    whatIf?.pctRevLossExceedsSave > 0.5
      ? 'C'
      : whatIf?.pctSavesDistressed > 0.35 && whatIf?.pctSavesDistressed > (whatIf?.pctRevLossExceedsSave || 0)
        ? 'A'
        : whatIf?.pctBoostProfitable > 0.5
          ? 'B'
          : whatIf?.pctMinimalEffect > 0.4
            ? 'D'
            : 'mixed';

  return { verdict, verdictLabel, signals, score, talentCutVerdict: cutVerdict };
}

function renderMd(report) {
  const lines = [];
  lines.push('# Station Economics / EBITDA Margin Audit');
  lines.push('');
  lines.push('Diagnostic: `scripts/diag-station-economics-audit.mjs` · `npm run diag:station-economics`');
  lines.push('');
  lines.push(`Markets: ${report.meta.markets.join(', ')}`);
  lines.push(
    `Start years: ${report.meta.startYears.join(', ')} · ${report.meta.runsPerCell} seeds/cell · snapshots: ${report.meta.snapshotYears.join(', ')}`,
  );
  lines.push('');
  lines.push(
    '_Method: headless `genMarket(\'under\')` with all `isPlayer` cleared — full commercial book, not a single player flagship._',
  );
  lines.push('');
  lines.push(`## Verdict: **${report.verdict.verdict}) ${report.verdict.verdictLabel}**`);
  lines.push('');
  lines.push('Talent-cut what-if (non-morning daypart removed): **' + report.verdict.talentCutVerdict + '**');
  lines.push('');
  for (const s of report.verdict.signals) lines.push(`- ${s}`);
  lines.push('');

  lines.push('## EBITDA margin by era × market tier (commercial stations)');
  lines.push('| Era | Tier | N | Med margin | P25 | P75 | >30% | >40% | Neg EBITDA |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const era of ERA_BANDS.map((e) => e.id)) {
    for (const tier of ['mega', 'large', 'medium', 'small']) {
      const g = report.aggregates.byEraTier[`${era}|${tier}`];
      if (!g) continue;
      lines.push(
        `| ${era} | ${tier} | ${g.n} | ${pctFrac(g.medianEbitdaMargin)} | ${pctFrac(g.p25EbitdaMargin)} | ${pctFrac(g.p75EbitdaMargin)} | ${pctFrac(g.pctMarginAbove30)} | ${pctFrac(g.pctMarginAbove40)} | ${pctFrac(g.pctNegativeEbitda)} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Successful stations — margin by era × rank bucket');
  lines.push('| Era | Rank | N | Med margin | Med rev | Talent % rev | Fixed % rev |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const era of ERA_BANDS.map((e) => e.id)) {
    for (const rb of ['rank1', 'top3', 'top5']) {
      const g = report.aggregates.byEraRank[`${era}|${rb}`];
      if (!g) continue;
      lines.push(
        `| ${era} | ${rb} | ${g.n} | ${pctFrac(g.medianEbitdaMargin)} | ${money(g.medianRev)} | ${pctFrac(g.medianTalentPayrollPctRev)} | ${pctFrac(g.medianFixedCostPctRev)} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Modern era (2010–2025 snapshots)');
  const mod = report.modernEra;
  if (mod) {
    lines.push(`- Commercial station-periods: **${mod.n}**`);
    lines.push(`- Unprofitable (EBITDA < 0): **${pctFrac(mod.pctNegativeEbitda)}**`);
    lines.push(`- Profitable but <15% margin: **${pctFrac(mod.pctMarginBelow15)}**`);
    lines.push(`- Above 30% margin: **${pctFrac(mod.pctMarginAbove30)}**`);
    lines.push(`- Above 40% margin: **${pctFrac(mod.pctMarginAbove40)}**`);
  }
  lines.push('');

  lines.push('## San Francisco 1980 (player concern benchmark)');
  const sf = report.sf1980;
  if (sf) {
    lines.push(`- N=${sf.n} · median margin **${pctFrac(sf.medianEbitdaMargin)}** · p75 **${pctFrac(sf.p75EbitdaMargin)}**`);
    lines.push(`- Share ≥45% margin: **${pctFrac(sf.pctMarginAbove45)}** · ≥40%: **${pctFrac(sf.pctMarginAbove40)}**`);
    lines.push(
      `- Median rev ${money(sf.medianRev)} · expenses ${money(sf.medianExpenses)} · EBITDA ${money(sf.medianEbitda)} · talent ${pctFrac(sf.medianTalentPayrollPctRev)} of rev`,
    );
  }
  lines.push('');

  lines.push('## Elite stations (OQ ≥ 90, rank ≤ 5)');
  const el = report.elite;
  if (el) {
    lines.push(
      `| N | Med margin | Talent % | Fixed % | Staffed DP | Automated DP |`,
    );
    lines.push(
      `| ---: | ---: | ---: | ---: | ---: | ---: |`,
    );
    lines.push(
      `| ${el.n} | ${pctFrac(el.medianEbitdaMargin)} | ${pctFrac(el.medianTalentPayrollPctRev)} | ${pctFrac(el.medianFixedCostPctRev)} | ${el.medianStaffedDayparts ?? '—'} | ${el.medianAutomatedDayparts ?? '—'} |`,
    );
  }
  lines.push('');

  lines.push('## Talent-cut what-if (last snapshot year per run)');
  const w = report.whatIfSummary;
  if (w) {
    lines.push(`- Cases: **${w.n}** · median EBITDA Δ **${money(w.medianEbitdaDelta)}** · median rev Δ **${money(w.medianRevDelta)}**`);
    lines.push(`- Saves distressed: **${pctFrac(w.pctSavesDistressed)}** · Boosts profitable: **${pctFrac(w.pctBoostProfitable)}**`);
    lines.push(`- Rev loss > salary save: **${pctFrac(w.pctRevLossExceedsSave)}** · Minimal effect: **${pctFrac(w.pctMinimalEffect)}**`);
    lines.push('');
    lines.push('Interpretation key: **A** saves distressed · **B** margin-harvest on winners · **C** revenue hit dominates · **D** negligible');
  }
  lines.push('');
  lines.push('## Rerun');
  lines.push('```bash');
  lines.push('npm run diag:station-economics');
  lines.push('node scripts/diag-station-economics-audit.mjs --runs=6 --seed=20260615');
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

  ctxSingleton = null;
  const ctx = loadCtx();
  const tierByMarket = {};
  for (const mid of ALL_PLAYABLE_MARKET_IDS) {
    vm.runInContext(`ACTIVE_MARKET='${mid}';`, ctx);
    const m = vm.runInContext(`MARKETS['${mid}']`, ctx);
    tierByMarket[mid] = m?.rankTier || 'medium';
  }

  const runConfigs = [];
  for (const marketId of ALL_PLAYABLE_MARKET_IDS) {
    for (const startYear of START_YEARS) {
      for (let r = 0; r < args.runs; r++) {
        runConfigs.push({
          marketId,
          startYear,
          seed: args.seed + marketSalt(marketId) * 17 + startYear * 991 + r * 9973,
        });
      }
    }
  }

  console.log(
    `Station economics audit: ${ALL_PLAYABLE_MARKET_IDS.length} markets × ${START_YEARS.length} starts × ${args.runs} seeds = ${runConfigs.length} sims`,
  );

  const batchSize = 4;
  const runResults = [];
  for (let i = 0; i < runConfigs.length; i += batchSize) {
    const batch = runConfigs.slice(i, i + batchSize);
    const payload = {
      snapshotYears: SNAPSHOT_YEARS,
      endYear: END_YEAR,
      runs: batch,
    };
    const chunk = vm.runInContext(`(${RUNNER_IIFE})(${JSON.stringify(payload)})`, ctx);
    runResults.push(...chunk);
    process.stdout.write(`  ${Math.min(i + batchSize, runConfigs.length)}/${runConfigs.length}\r`);
  }
  console.log('');

  const allRows = [];
  const whatIfAll = [];
  let fail = 0;
  for (const res of runResults) {
    if (!res.ok) {
      fail++;
      continue;
    }
    const tier = tierByMarket[res.marketId] || 'medium';
    for (const [yr, rows] of Object.entries(res.snapshots || {})) {
      if (Number(yr) < res.startYear) continue;
      for (const row of rows) {
        allRows.push(enrichRow(row, tier));
      }
    }
    for (const wf of res.whatIfs || []) whatIfAll.push({ ...wf, marketId: res.marketId, year: res.whatIfYear });
  }

  const aggregates = {
    byEra: aggregateGroup(allRows, (r) => r.era),
    byTier: aggregateGroup(allRows, (r) => r.marketTier),
    byEraTier: aggregateGroup(allRows, (r) => `${r.era}|${r.marketTier}`),
    byEraRank: aggregateGroup(allRows, (r) => `${r.era}|${r.rankBucket}`),
    byFormatFamily: aggregateGroup(allRows, (r) => r.formatFamily),
  };

  const modernRows = allRows.filter((r) => r.year >= 2010 && r.year <= 2025);
  const modernEra = aggregateGroup(modernRows, () => 'all').all;

  const sf1980Rows = allRows.filter((r) => r.marketId === 'sanfrancisco' && r.year === 1980);
  const sfMargins = sf1980Rows.map((r) => r.ebitdaMargin).filter((m) => m != null);
  const sf1980 = {
    n: sf1980Rows.length,
    medianEbitdaMargin: distStats(sfMargins)?.median ?? null,
    p75EbitdaMargin: distStats(sfMargins)?.p75 ?? null,
    pctMarginAbove40: sfMargins.length ? sfMargins.filter((m) => m > 0.4).length / sfMargins.length : null,
    pctMarginAbove45: sfMargins.length ? sfMargins.filter((m) => m > 0.45).length / sfMargins.length : null,
    medianRev: distStats(sf1980Rows.map((r) => r.rev))?.median ?? null,
    medianExpenses: distStats(sf1980Rows.map((r) => r.expenses))?.median ?? null,
    medianEbitda: distStats(sf1980Rows.map((r) => r.ebitda))?.median ?? null,
    medianTalentPayrollPctRev: distStats(sf1980Rows.map((r) => r.talentPayrollPctRev).filter(Boolean))?.median ?? null,
  };

  const eliteRows = allRows.filter((r) => r.oq >= 90 && r.rank <= 5);
  const elite = {
    n: eliteRows.length,
    medianEbitdaMargin: distStats(eliteRows.map((r) => r.ebitdaMargin).filter(Boolean))?.median ?? null,
    medianTalentPayrollPctRev: distStats(eliteRows.map((r) => r.talentPayrollPctRev).filter(Boolean))?.median ?? null,
    medianFixedCostPctRev: distStats(eliteRows.map((r) => r.fixedCostPctRev).filter(Boolean))?.median ?? null,
    medianStaffedDayparts: distStats(eliteRows.map((r) => r.staffedDayparts))?.median ?? null,
    medianAutomatedDayparts: distStats(eliteRows.map((r) => r.automatedDayparts))?.median ?? null,
  };

  const whatIfSummary = summarizeWhatIfs(whatIfAll);
  const verdict = buildVerdict(aggregates, sf1980, modernEra, whatIfSummary, elite);

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      markets: ALL_PLAYABLE_MARKET_IDS,
      startYears: START_YEARS,
      snapshotYears: SNAPSHOT_YEARS,
      endYear: END_YEAR,
      runsPerCell: args.runs,
      seed: args.seed,
      sims: runConfigs.length,
      failedSims: fail,
      stationPeriods: allRows.length,
    },
    verdict,
    aggregates,
    modernEra,
    sf1980,
    elite,
    whatIfSummary,
    sampleRows: allRows
      .filter((r) => r.marketId === 'sanfrancisco' && r.year === 1980 && r.rank <= 5)
      .slice(0, 12),
    failed: runResults.filter((r) => !r.ok).slice(0, 20),
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, renderMd(report));
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Verdict: ${verdict.verdict}) ${verdict.verdictLabel}`);
  if (fail) console.warn(`Warning: ${fail} sim runs failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
