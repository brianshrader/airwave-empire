/**
 * Reusable headless stability runner (AQH desync, zero revenue pool, frozen book, etc.).
 * Used by diag-sanfrancisco-stress.mjs and diag-market-suite.mjs.
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const stabilityRoot = path.join(__dirname, '..');
export const stabilityLegacyPath = path.join(stabilityRoot, 'src', 'legacy.js');
export const stabilityGmModePath = path.join(stabilityRoot, 'src', 'gmMode.js');
export const stabilityTalentRetentionPath = path.join(stabilityRoot, 'src', 'talentRetention.js');

export const DEFAULT_STRESS_SCENARIOS = ['under', 'fmrev', 'chrwar', 'gm_under'];
export const FAST_STRESS_SCENARIOS = ['chrwar'];

export const HARD_FAIL_TYPES = new Set([
  'aqh_desync',
  'zero_revenue_pool',
  'frozen_book',
  'nan_invalid',
  'advTurn_crash',
  'clock_stuck',
]);
export const WARN_FAIL_TYPES = new Set(['stale_snapshot']);

export function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

export function makeLegacySrc(marketId) {
  let legacySrc = readFileSync(stabilityLegacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  }
  legacySrc = legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
  return injectHeadlessMegaFragNewsGuard(legacySrc);
}

function stubEl(id) {
  const el = {
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
  if (id) el.id = id;
  return el;
}

const documentStub = {
  documentElement: { style: {}, dataset: {} },
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
  getElementById(id) {
    if (id === 'm-contract' || id === 'wl-toast-stack' || id === 'abtn') return stubEl(id);
    return stubEl();
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener() {},
};

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createHeadlessContext(quiet) {
  const noop = () => {};
  const ctx = vm.createContext({
    console: quiet
      ? { log: noop, warn: noop, error: console.error, table: noop, info: noop }
      : console,
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() { return 0; },
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert: noop,
    fetch: null,
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray?.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = Math.floor(Math.random() * 256);
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return c === 'x' ? r : (r & 0x3) | 0x8;
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

export function periodIdx(y, p) {
  return y * 2 + (p === 2 ? 1 : 0);
}

export function buildStressRunnerSrc() {
  return `
function wlStressCohortAqhSum(s){
  if(!s||!s.rat||!s.rat.cur)return 0;
  var COH=['12-17','18-24','25-34','35-49','50-64','65+'];
  if(typeof wlStationCohortAqhSum==='function')return wlStationCohortAqhSum(s);
  var sum=0;
  for(var i=0;i<COH.length;i++)sum+=(s.rat.cur[COH[i]]&&s.rat.cur[COH[i]].aqh)||0;
  return sum;
}
function wlStressMarketMetrics(G){
  var comm=(G.stations||[]).filter(function(st){
    return st&&!st._bpSlotDeferred&&st.rat&&!stationIsNoncommercialInstitutional(st);
  });
  var sumShare=0,sumCohortAqh=0,sumRatAqh=0,sumRev=0,bad=0;
  comm.forEach(function(st){
    var sh=Number(st.rat.share);
    var aq=Number(st.rat.aqh);
    var rv=Number(st.fin&&st.fin.rev);
    if(!Number.isFinite(sh)||sh<0||!Number.isFinite(aq)||aq<0||!Number.isFinite(rv)||rv<0)bad++;
    sumShare+=Number.isFinite(sh)&&sh>0?sh:0;
    sumCohortAqh+=wlStressCohortAqhSum(st);
    sumRatAqh+=Number.isFinite(aq)&&aq>0?aq:0;
    sumRev+=Number.isFinite(rv)&&rv>0?rv:0;
  });
  comm.sort(function(a,b){return (Number(b.rat.share)||0)-(Number(a.rat.share)||0);});
  var top10=comm.slice(0,10).map(function(st){
    return{
      id:String(st.id||'').slice(0,48),
      call:String(st.callLetters||'').slice(0,16),
      share:Math.round((Number(st.rat.share)||0)*1e8)/1e8,
      aqh:Math.round(Number(st.rat.aqh)||0),
      cohortAqh:Math.round(wlStressCohortAqhSum(st)),
      rev:Math.round(Number(st.fin&&st.fin.rev)||0),
    };
  });
  var snap=G._mktRankBookSnap;
  return{
    year:Number(G.year)||0,
    period:Number(G.period)||0,
    turn:Number(G.turn)||0,
    nComm:comm.length,
    sumShare:Math.round(sumShare*1e8)/1e8,
    sumCohortAqh:Math.round(sumCohortAqh),
    sumRatAqh:Math.round(sumRatAqh),
    sumRev:Math.round(sumRev),
    nanInvalid:bad,
    top10:top10,
    snapYear:snap&&Number.isFinite(Number(snap.year))?Number(snap.year):null,
    snapPeriod:snap&&Number.isFinite(Number(snap.period))?Number(snap.period):null,
    snapTurn:snap&&Number.isFinite(Number(snap.turn))?Number(snap.turn):null,
    repairCount:Number(G._wlRatingsCurRepairCount)||0,
    stitchCount:Number(G._wlRatingsStitchUsed)||0,
    closedSig:typeof wlBookStaleClosedPeriodSignature==='function'
      ?wlBookStaleClosedPeriodSignature(G.year,G.period):null,
  };
}
function wlStressInitGame(scenId,marketId){
  ACTIVE_MARKET=marketId;
  _selectedMarket=marketId;
  if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
  var sc=SC.find(function(x){return x.id===scenId;});
  if(!sc)throw new Error('Unknown scenario '+scenId);
  var startY=sc.startYear||1970;
  if(scenId==='gm_under'){
    G=typeof wlGenMarketGmUnderAtCareerTime==='function'
      ?wlGenMarketGmUnderAtCareerTime(startY,1)
      :genMarket('gm_under');
    G.marketId=marketId;
    if(typeof wlGmMode!=='undefined'&&wlGmMode.initGmStateForGame)wlGmMode.initGmStateForGame(G);
  }else{
    G=genMarket(scenId);
    G.marketId=marketId;
  }
  G._wlHarnessDeterministic=true;
  G.ps=(G.stations||[]).filter(function(s){return s&&s.isPlayer;});
  return{scenarioId:scenId,startYear:startY};
}
function wlStressRunGame(opts){
  var rng=(${mulberry32.toString()})(opts.seed>>>0);
  Math.random=function(){return rng();};
  var init=wlStressInitGame(opts.scenarioId,opts.marketId);
  var endIdx=opts.endIdx|0;
  var failures=[];
  var counts={};
  function bump(t){counts[t]=(counts[t]||0)+1;}
  var periods=0;
  var advTurnErrors=0;
  var frozenStreak=0;
  var lastClosedSig=null;
  var lastTopSig=null;
  while(wlSimCalendarPeriodIndex(G.year,G.period)<endIdx&&periods<opts.maxTurns){
    var beforeY=G.year,beforeP=G.period,beforeT=G.turn;
    var before=wlStressMarketMetrics(G);
    var repBefore=before.repairCount,stitchBefore=before.stitchCount;
    var advErr=null,advThrew=false;
    try{advTurn();}catch(e){advThrew=true;advErr=String(e&&e.message||e);}
    periods++;
    var afterY=G.year,afterP=G.period;
    var calAdv=afterY>beforeY||(afterY===beforeY&&afterP!==beforeP);
    var after=wlStressMarketMetrics(G);
    var repDelta=after.repairCount-repBefore;
    var stitchDelta=after.stitchCount-stitchBefore;
    var snapIdx=after.snapYear!=null?wlSimCalendarPeriodIndex(after.snapYear,after.snapPeriod):null;
    var gIdx=wlSimCalendarPeriodIndex(afterY,afterP);
    var closedIdx=wlSimCalendarPeriodIndex(beforeY,beforeP);
    var snapLag=snapIdx!=null?gIdx-snapIdx:null;
    var snapBehind=snapIdx!=null&&snapIdx<closedIdx;
    var record=function(type,severity,extra){
      bump(type);
      failures.push({
        type:type,
        severity:severity||'fail',
        marketId:opts.marketId,
        scenarioId:opts.scenarioId,
        seed:opts.seed,
        turn:periods,
        before:before,
        after:after,
        calendarAdvanced:calAdv,
        advTurnThrew:advThrew,
        advTurnError:advErr,
        repairDelta:repDelta,
        stitchDelta:stitchDelta,
        snapLag:snapLag,
        snapBehind:snapBehind,
        frozenStreak:frozenStreak,
        extra:extra||null,
      });
    };
    if(advThrew){
      advTurnErrors++;
      record('advTurn_crash','fail',{beforeY:beforeY,beforeP:beforeP});
      break;
    }
    if(!calAdv){
      var atOrPastEnd=wlSimCalendarPeriodIndex(beforeY,beforeP)>=endIdx;
      var gmBoardLocked=typeof wlGmSoloFireLocksBoard==='function'&&wlGmSoloFireLocksBoard();
      var mpEndgame=G.mpPhase==='endgame';
      if(!atOrPastEnd&&!gmBoardLocked&&!mpEndgame){
        record('clock_stuck','fail',{afterY:afterY,afterP:afterP});
      }
      break;
    }
    if(before.sumShare>0.02&&before.sumCohortAqh<=0){
      record('aqh_desync','fail',{phase:'before_advTurn'});
    }
    if(after.sumShare>0.02&&after.sumCohortAqh<=0){
      record('aqh_desync','fail',{phase:'after_advTurn'});
    }
    if(before.sumShare>0.02&&before.sumRev<=0){
      record('zero_revenue_pool','fail',{phase:'before_advTurn'});
    }
    if(after.sumShare>0.02&&after.sumRev<=0){
      record('zero_revenue_pool','fail',{phase:'after_advTurn'});
    }
    if(before.nanInvalid>0)record('nan_invalid','fail',{phase:'before_advTurn',count:before.nanInvalid});
    if(after.nanInvalid>0)record('nan_invalid','fail',{phase:'after_advTurn',count:after.nanInvalid});
    if(snapBehind){
      var sev=snapLag!=null&&snapLag>=2?'fail':'warn';
      record('stale_snapshot',sev,{snapLag:snapLag,closedIdx:closedIdx,snapIdx:snapIdx});
    }
    var closedSig=typeof wlBookStaleClosedPeriodSignature==='function'
      ?wlBookStaleClosedPeriodSignature(beforeY,beforeP):null;
    var topSig=after.top10.map(function(r){return r.id+':'+r.share+':'+r.rev;}).join('|');
    var bookFrozen=false;
    if(lastClosedSig&&closedSig){
      var cmp=typeof wlBookStaleProbeSharesRevsUnchanged==='function'
        ?wlBookStaleProbeSharesRevsUnchanged(lastClosedSig.fp,closedSig.fp):null;
      var shFrozen=cmp&&cmp.nCompared>=3&&cmp.sharesUnchanged>=0.98;
      var revFrozen=cmp&&cmp.nCompared>=3&&cmp.revsUnchanged>=0.98&&lastClosedSig.revSum>0&&closedSig.revSum>0;
      var sigMatch=lastClosedSig.shareSig&&lastClosedSig.shareSig===closedSig.shareSig;
      bookFrozen=shFrozen||revFrozen||sigMatch||(lastTopSig&&lastTopSig===topSig&&after.top10.length>=3);
    }
    frozenStreak=bookFrozen?frozenStreak+1:0;
    if(frozenStreak>=2){
      record('frozen_book','fail',{
        streak:frozenStreak,
        closedY:beforeY,
        closedP:beforeP,
        afterY:afterY,
        afterP:afterP,
      });
    }
    lastClosedSig=closedSig;
    lastTopSig=topSig;
  }
  return{
    marketId:opts.marketId,
    scenarioId:opts.scenarioId,
    seed:opts.seed,
    startYear:init.startYear,
    finalYear:G.year,
    finalPeriod:G.period,
    periods:periods,
    advTurnErrors:advTurnErrors,
    failureCounts:counts,
    failures:failures,
  };
}
`;
}

let cachedRunnerSrc = null;

export function injectStressRunner(ctx) {
  if (ctx.__wlStressRunnerLoaded) return;
  if (!cachedRunnerSrc) cachedRunnerSrc = buildStressRunnerSrc();
  vm.runInContext(cachedRunnerSrc, ctx);
  ctx.__wlStressRunnerLoaded = true;
}

export function loadCtxForMarket(marketId, quiet = true) {
  const ctx = createHeadlessContext(quiet);
  injectMarketEcologyIife(ctx);
  vm.runInContext(makeLegacySrc(marketId), ctx);
  vm.runInContext(readFileSync(stabilityTalentRetentionPath, 'utf8'), ctx);
  vm.runInContext(readFileSync(stabilityGmModePath, 'utf8'), ctx);
  vm.runInContext(
    `
    showToast = function(){};
    showToastWithSubscribeCta = function(){};
    if (typeof showSum === 'function') {
      var _showSum = showSum;
      showSum = function(){ try { return _showSum.apply(this, arguments); } catch(e) {} };
    }
    `,
    ctx,
  );
  injectStressRunner(ctx);
  return ctx;
}

export function runStressGame(ctx, opts) {
  injectStressRunner(ctx);
  const endIdx = periodIdx(opts.endYear, opts.endPeriod ?? 2);
  return vm.runInContext(
    `wlStressRunGame(${JSON.stringify({ ...opts, endIdx })})`,
    ctx,
  );
}

export function verdictForRun(run) {
  const hard = Object.keys(run.failureCounts || {}).some((k) => HARD_FAIL_TYPES.has(k));
  if (hard || run.advTurnErrors > 0) return 'FAIL';
  const hasWarn = Object.keys(run.failureCounts || {}).some((k) => WARN_FAIL_TYPES.has(k));
  if (hasWarn) return 'WARN';
  return 'PASS';
}

export function aggregateVerdict(verdicts) {
  if (verdicts.some((v) => v === 'FAIL')) return 'FAIL';
  if (verdicts.some((v) => v === 'WARN')) return 'WARN';
  return 'PASS';
}

/**
 * Run stability games for one or more markets.
 * @param {{
 *   markets: string[],
 *   runs: number,
 *   scenarios?: string[],
 *   spotChecks?: Array<{ marketId: string, scenarioId: string, endYear: number, endPeriod?: number, label?: string, runs?: number }>,
 *   endYear?: number,
 *   endPeriod?: number,
 *   seed?: number,
 *   maxTurns?: number,
 *   quiet?: boolean,
 * }} opts
 */
export function runStabilitySweep(opts) {
  const {
    markets,
    runs,
    scenarios = FAST_STRESS_SCENARIOS,
    spotChecks = [],
    endYear = 2026,
    endPeriod = 2,
    seed = 20260531,
    maxTurns = 420,
    quiet = true,
  } = opts;

  const ctxByMarket = {};
  for (const m of markets) {
    ctxByMarket[m] = loadCtxForMarket(m, quiet);
  }

  const runRows = [];
  const failuresByType = {};
  let totalPeriods = 0;

  const schedule = [];
  for (let r = 0; r < runs; r++) {
    const marketId = markets[r % markets.length];
    const scenarioId = scenarios[r % scenarios.length];
    schedule.push({ marketId, scenarioId, endYear, endPeriod, label: 'default' });
  }
  for (const spot of spotChecks) {
    const n = spot.runs ?? Math.max(3, Math.ceil(runs / 4));
    for (let i = 0; i < n; i++) {
      schedule.push({
        marketId: spot.marketId,
        scenarioId: spot.scenarioId,
        endYear: spot.endYear,
        endPeriod: spot.endPeriod ?? 2,
        label: spot.label || `${spot.scenarioId}_${spot.endYear}`,
      });
    }
  }

  for (let i = 0; i < schedule.length; i++) {
    const job = schedule[i];
    const gameSeed =
      (seed + i * 9973 + job.marketId.length * 131 + job.scenarioId.length * 17) >>> 0;
    const row = runStressGame(ctxByMarket[job.marketId], {
      marketId: job.marketId,
      scenarioId: job.scenarioId,
      seed: gameSeed,
      endYear: job.endYear,
      endPeriod: job.endPeriod,
      maxTurns,
    });
    row.verdict = verdictForRun(row);
    row.label = job.label;
    runRows.push({
      marketId: row.marketId,
      scenarioId: row.scenarioId,
      label: job.label,
      seed: row.seed,
      finalYear: row.finalYear,
      finalPeriod: row.finalPeriod,
      periods: row.periods,
      advTurnErrors: row.advTurnErrors,
      failureCounts: row.failureCounts,
      verdict: row.verdict,
    });
    totalPeriods += row.periods;
    for (const [t, c] of Object.entries(row.failureCounts || {})) {
      failuresByType[t] = (failuresByType[t] || 0) + c;
    }
  }

  const byMarket = {};
  for (const m of markets) {
    const mRuns = runRows.filter((r) => r.marketId === m);
    byMarket[m] = {
      verdict: aggregateVerdict(mRuns.map((r) => r.verdict)),
      games: mRuns.length,
      failuresByType: Object.fromEntries(
        Object.entries(
          mRuns.reduce((acc, r) => {
            for (const [k, v] of Object.entries(r.failureCounts || {})) {
              acc[k] = (acc[k] || 0) + v;
            }
            return acc;
          }, {}),
        ),
      ),
    };
  }

  return {
    verdict: aggregateVerdict(runRows.map((r) => r.verdict)),
    totals: { gamesSimulated: runRows.length, periodsSimulated: totalPeriods },
    failuresByType,
    byMarket,
    runs: runRows,
  };
}
