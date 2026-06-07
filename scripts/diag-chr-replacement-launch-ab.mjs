#!/usr/bin/env node
/**
 * CHR replacement launch A/B — positive replacement ecology (diag-only, in-vm patches).
 *
 *   node scripts/diag-chr-replacement-launch-ab.mjs
 *   node scripts/diag-chr-replacement-launch-ab.mjs --runs=10 --seed=20260515
 *
 * Outputs: tmp/chr_replacement_launch_ab.json, tmp/chr_replacement_launch_ab.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectFormatLifecycleIife } from './vmInjectFormatLifecycleIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'chr_replacement_launch_ab.json');
const outMd = path.join(root, 'tmp', 'chr_replacement_launch_ab.md');

const VARIANTS = ['A', 'B', 'C', 'D', 'E'];
const MARKETS = [
  { id: 'sanfrancisco', label: 'San Francisco' },
  { id: 'seattle', label: 'Seattle' },
  { id: 'losangeles', label: 'Los Angeles' },
  { id: 'chicago', label: 'Chicago' },
];
const SNAPSHOT_YEARS = [1985, 1990, 1995, 2000, 2020];
const GEN_ERA = '1985';
const TARGET_PERIOD = 1;

const VARIANT_DESC = {
  A: 'Baseline — pre-ship control (production CHR vacancy OFF)',
  B: 'Strong replacement memory — 4yr market memory; ×3.5 CHR reformat bias when count < 4 (no exit block)',
  C: 'Shipped production — lane vacancy + adjacent challenger + scoring boost (Variant C)',
  D: 'Challenger re-entry — weak CHR exit opens opportunity; adjacent AC/Rock/Hot AC also-ran may flip to CHR',
  E: 'Mild exit floor (n≤3 only) + vacancy + challenger re-entry',
};

const CHR_REPLACE_INJECT = `
// ── CHR REPLACEMENT LAUNCH A/B (diag harness — CHR_REPLACE_LAUNCH_VARIANT set in-vm) ──
var CHR_REPLACE_LAUNCH_VARIANT='A';
var CHR_RL_ADJ_CHALLENGER=['ADULT_CONTEMP','HOT_AC','ALBUM_ROCK','CLASSIC_ROCK','ALT_ROCK','AAA','RHYTHMIC'];
function chrRlAbInit(G){
  if(!G._chrRlDiag)G._chrRlDiag={
    chrExits:0,exitsBlocked:0,replacementLaunches:0,vacancyLaunches:0,
    challengerReentries:0,memoryBoosts:0,aiReformats:0,
  };
}
function chrRlAbEra(G){var y=G.year||1970;return y>=1985&&y<=2005;}
function chrRlAbEligible(G){
  if(!chrRlAbEra(G))return false;
  var tier=(MARKETS[G.marketId||ACTIVE_MARKET]||{}).rankTier||'medium';
  return tier==='mega'||tier==='large';
}
function chrRlAbWestCoastal(G){
  var ar=(MARKETS[G.marketId||ACTIVE_MARKET]||{}).archetypeId||'';
  return ar==='coastal_secular'||ar==='west_fm_fragmented'||
    G.marketId==='sanfrancisco'||G.marketId==='seattle';
}
function chrRlAbChrCount(G){
  return(G.stations||[]).filter(function(s){
    return s&&!s._bpSlotDeferred&&!stationIsNoncommercialInstitutional(s)&&
      formatEcologyLaneId(s.format)==='__lane_chr__';
  }).length;
}
function chrRlAbChrLaneShare(G){
  var sum=0;
  (G.stations||[]).forEach(function(s){
    if(!s||s._bpSlotDeferred||stationIsNoncommercialInstitutional(s))return;
    if(formatEcologyLaneId(s.format)==='__lane_chr__')sum+=Number(s.rat&&s.rat.share)||0;
  });
  return sum;
}
function chrRlAbChrSharePerStation(G){
  var n=chrRlAbChrCount(G);
  return n>0?chrRlAbChrLaneShare(G)/n:0;
}
function chrRlAbIsChrFmt(fmt){return formatEcologyLaneId(fmt)==='__lane_chr__';}
function chrRlAbShouldBlockChrExit(s,G){
  if(CHR_REPLACE_LAUNCH_VARIANT!=='E'||!chrRlAbEligible(G)||!chrRlAbIsChrFmt(s.format))return false;
  if(chrRlAbChrCount(G)>3)return false;
  var laneCrowd=crowdedLaneAlsoRanPressure(s,G);
  if(!laneCrowd.active&&(s._lowSharePeriods||0)<6)return false;
  chrRlAbInit(G);
  G._chrRlDiag.exitsBlocked++;
  return true;
}
function chrRlAbCrowdTicks(s,G,laneCrowd){
  if(CHR_REPLACE_LAUNCH_VARIANT!=='E'||laneCrowd.laneId!=='__lane_chr__')return laneCrowd.extraTicks;
  if(chrRlAbChrCount(G)<=3)return Math.max(1,Math.floor(laneCrowd.extraTicks*0.45));
  return laneCrowd.extraTicks;
}
function chrRlAbOnChrExit(G,weak){
  chrRlAbInit(G);
  G._chrRlDiag.chrExits++;
  var y=G.year||1970;
  if(CHR_REPLACE_LAUNCH_VARIANT==='B'||CHR_REPLACE_LAUNCH_VARIANT==='E'){
    G._chrRlMemory={marketId:G.marketId,setYear:y,untilYear:y+4,untilPeriod:1};
  }
  if(CHR_REPLACE_LAUNCH_VARIANT==='D'||CHR_REPLACE_LAUNCH_VARIANT==='E'){
    G._chrRlOpportunity={
      marketId:G.marketId,setYear:y,untilYear:y+3,untilPeriod:1,
      weak:!!weak,sharePerStation:chrRlAbChrSharePerStation(G),
    };
  }
}
function chrRlAbMemoryActive(G){
  if(CHR_REPLACE_LAUNCH_VARIANT!=='B'&&CHR_REPLACE_LAUNCH_VARIANT!=='E')return false;
  var m=G._chrRlMemory;
  if(!m)return false;
  var y=G.year||1970,p=G.period||1;
  if(y>m.untilYear||(y===m.untilYear&&p>m.untilPeriod))return false;
  return chrRlAbEligible(G);
}
function chrRlAbReplacementScoreMult(G,f){
  if(!chrRlAbIsChrFmt(f)||!chrRlAbEligible(G))return 1;
  var n=chrRlAbChrCount(G);
  if(n>=4)return 1;
  var mult=1;
  if(CHR_REPLACE_LAUNCH_VARIANT==='B'&&chrRlAbMemoryActive(G))mult=3.5;
  else if(CHR_REPLACE_LAUNCH_VARIANT==='E'&&chrRlAbMemoryActive(G))mult=2.8;
  if(mult>1){chrRlAbInit(G);G._chrRlDiag.memoryBoosts++;}
  return mult;
}
function chrRlAbAfterReformat(s,G,prevFmt,newFmt){
  chrRlAbInit(G);
  G._chrRlDiag.aiReformats++;
  if(chrRlAbIsChrFmt(prevFmt)&&!chrRlAbIsChrFmt(newFmt)){
    var weak=(s.rat&&s.rat.share||0)<0.02;
    chrRlAbOnChrExit(G,weak);
  }
  if(chrRlAbIsChrFmt(newFmt)&&nchrRlAbEligible(G)){
    var n=chrRlAbChrCount(G);
    if(n<=4){chrRlAbInit(G);G._chrRlDiag.replacementLaunches++;}
  }
}
function chrRlAbLaunchChrFm(G,reason){
  if(!formatAllowedInMarket('TOP40',G.marketId||ACTIVE_MARKET,G.year))return false;
  if(countMegaFragmentationEligibleCommercial(G.stations)>=countUsableCommercialDialSlots(G.marketId||ACTIVE_MARKET))return false;
  var freq=nextUnusedCommercialFreq(G,'FM');
  if(!freq)return false;
  var bp={type:'FM',fmt:'TOP40',pw:'50kw',str:'moderate'};
  var s=mkStn(bp,freq,G.year);
  s.color=CLR[(G.stations&&G.stations.length||0)%CLR.length];
  s.entryTurn={year:G.year,period:G.period};
  s.launchPeriod=G.turn||0;
  s._chrRlReplacementLaunch=reason;
  s.oq=Math.min(90,Math.round(s.oq+4));
  Object.values(s.prog||{}).forEach(function(sd){if(sd&&sd.quality!=null)sd.quality=Math.min(93,Math.round(sd.quality+3));});
  refreshStationOQ(s,G);
  G.stations.push(s);
  seedNewEntry(s,G);
  calcRev(s,G);
  if(!G.news)G.news=[];
  G.news.unshift({v:'MEDIUM',t:'📡 '+s.callLetters+' signs on — '+fmtLabel('TOP40')+' (FM '+freq+'). CHR lane vacancy fill.',y:G.year,p:G.period});
  chrRlAbInit(G);
  G._chrRlDiag.replacementLaunches++;
  G._chrRlDiag.vacancyLaunches++;
  return true;
}
function chrRlAbTryVacancyLaunch(G){
  if(CHR_REPLACE_LAUNCH_VARIANT==='C')return;
  if(CHR_REPLACE_LAUNCH_VARIANT!=='E')return;
  if(!chrRlAbEligible(G))return;
  var n=chrRlAbChrCount(G),lane=chrRlAbChrLaneShare(G);
  if(n>=4||lane<=0.15)return;
  if(!G._chrRlVacancyDue){
    var y=G.year||1970;
    G._chrRlVacancyDue={year:y+1+Math.floor(Math.random()*3),period:1};
    return;
  }
  var due=G._chrRlVacancyDue;
  if(G.year<due.year||(G.year===due.year&&G.period<due.period))return;
  if(chrRlAbLaunchChrFm(G,'vacancy'))G._chrRlVacancyDue=null;
}
function chrRlAbTryChallengerReentry(G){
  if(CHR_REPLACE_LAUNCH_VARIANT!=='D'&&CHR_REPLACE_LAUNCH_VARIANT!=='E')return;
  var y=G.year||1970;
  if(y<1988||y>2005||!chrRlAbEligible(G))return;
  if(!chrRlAbWestCoastal(G))return;
  var n=chrRlAbChrCount(G);
  if(n>=4)return;
  if(chrRlAbChrSharePerStation(G)<=0.055)return;
  var opp=G._chrRlOpportunity;
  var oppActive=opp&&G.year<=opp.untilYear&&chrRlAbEligible(G);
  if(!oppActive&&n>=3)return;
  var comm=(G.stations||[]).filter(function(s){
    return s&&!s._bpSlotDeferred&&!s.isPlayer&&!stationIsNoncommercialInstitutional(s);
  });
  comm.sort(function(a,b){return (b.rat&&b.rat.share||0)-(a.rat&&a.rat.share||0);});
  var candidates=[];
  for(var i=0;i<comm.length;i++){
    var st=comm[i],fmt=String(st.format||'');
    if(chrRlAbIsChrFmt(fmt))continue;
    if(CHR_RL_ADJ_CHALLENGER.indexOf(fmt)<0)continue;
    var rank=i+1,sh=st.rat&&st.rat.share||0;
    if(rank<12||sh>0.045)continue;
    candidates.push(st);
  }
  if(!candidates.length)return;
  var prob=CHR_REPLACE_LAUNCH_VARIANT==='E'?0.42:0.32;
  if(Math.random()>prob)return;
  var pick=candidates[Math.floor(Math.random()*candidates.length)];
  var oldFmt=fmtLabel(pick.format);
  pick.format='TOP40';
  pick._aiLastMajorReason='reformat:CHR challenger re-entry';
  pick._lowSharePeriods=0;
  if(!pick.drift)pick.drift={};
  pick.drift.TOP40=DRIFT.TOP40&&DRIFT.TOP40.default||40;
  Object.keys(pick.mom||{}).forEach(function(c){pick.mom[c]={tgt:0.01,cur:0.01};});
  pick.str='emerging';
  pick.launchPeriod=G.turn||0;
  if(!G.news)G.news=[];
  G.news.unshift({v:'MEDIUM',t:'📻 '+pick.callLetters+' flips '+oldFmt+' → '+fmtLabel('TOP40')+' (CHR opportunity slot).',y:G.year,p:G.period});
  chrRlAbInit(G);
  G._chrRlDiag.challengerReentries++;
  G._chrRlDiag.replacementLaunches++;
}
function chrReplaceAbPostTurn(G){
  if(!chrRlAbEligible(G))return;
  if(CHR_REPLACE_LAUNCH_VARIANT==='C')return;
  chrRlAbTryVacancyLaunch(G);
  chrRlAbTryChallengerReentry(G);
}
`;

// fix typo in inject: nchrRlAbEligible -> chrRlAbEligible
const CHR_REPLACE_INJECT_FIXED = CHR_REPLACE_INJECT.replace(
  'if(chrRlAbIsChrFmt(newFmt)&&nchrRlAbEligible(G)){',
  'if(chrRlAbIsChrFmt(newFmt)&&chrRlAbEligible(G)){',
);

const RIVAL_REFORMAT_ANCHOR = '// ── RIVAL REFORMAT ────────────────────────────────────────────────';
const FLIP_PROB_ANCHOR = '      if(Math.random()>=flipProb)return;';
const FLIP_PROB_PATCH =
  '      if(chrRlAbShouldBlockChrExit(s,G))return;\n      if(Math.random()>=flipProb)return;';
const REFORMAT_ANCHOR = '      const oldFmt=fmtLabel(s.format);\n      s.format=newFmt;';
const REFORMAT_PATCH =
  '      const oldFmt=fmtLabel(s.format);\n      const _chrRlPrevFmt=s.format;\n      s.format=newFmt;\n      chrRlAbAfterReformat(s,G,_chrRlPrevFmt,newFmt);';
const CHR_LANE_SCORE_ANCHOR = '          else if(laneN>=3)score*=0.55;';
const CHR_LANE_SCORE_PATCH =
  `          else if(laneN>=3)score*=0.55;
          var _chrRlRepM=chrRlAbReplacementScoreMult(G,f);
          if(_chrRlRepM!==1)score*=_chrRlRepM;`;
const CROWD_TICKS_ANCHOR =
  '      if(!isStruggling||chrCrowded)s._lowSharePeriods+=laneCrowd.extraTicks;';
const CROWD_TICKS_PATCH =
  '      if(!isStruggling||chrCrowded)s._lowSharePeriods+=chrRlAbCrowdTicks(s,G,laneCrowd);';
const RIVAL_REFORMAT_END = '  tryChrLaneVacancyReplacement(G);\n}\n\n/**\n * Corporate consolidator acquisition filter';
const RIVAL_REFORMAT_END_PATCH =
  '  tryChrLaneVacancyReplacement(G);\n  chrReplaceAbPostTurn(G);\n}\n\n/**\n * Corporate consolidator acquisition filter';

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function patchLegacyForAb(src) {
  let out = injectHeadlessMegaFragNewsGuard(src);
  if (!out.includes(RIVAL_REFORMAT_ANCHOR)) throw new Error('RIVAL REFORMAT anchor missing');
  out = out.replace(RIVAL_REFORMAT_ANCHOR, `${CHR_REPLACE_INJECT_FIXED}\n${RIVAL_REFORMAT_ANCHOR}`);
  if (!out.includes(FLIP_PROB_ANCHOR)) throw new Error('flipProb anchor missing');
  out = out.replace(FLIP_PROB_ANCHOR, FLIP_PROB_PATCH);
  if (!out.includes(REFORMAT_ANCHOR)) throw new Error('reformat anchor missing');
  out = out.replace(REFORMAT_ANCHOR, REFORMAT_PATCH);
  if (!out.includes(CHR_LANE_SCORE_ANCHOR)) throw new Error('CHR lane score anchor missing');
  out = out.replace(CHR_LANE_SCORE_ANCHOR, CHR_LANE_SCORE_PATCH);
  if (!out.includes(CROWD_TICKS_ANCHOR)) throw new Error('crowd ticks anchor missing');
  out = out.replace(CROWD_TICKS_ANCHOR, CROWD_TICKS_PATCH);
  if (!out.includes(RIVAL_REFORMAT_END)) throw new Error('rivalReformat end anchor missing');
  out = out.replace(RIVAL_REFORMAT_END, RIVAL_REFORMAT_END_PATCH);
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
    setInterval() { return 0; },
    clearTimeout: noop, clearInterval: noop,
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert: noop, fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(typedArray) {
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
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Symbol,
    Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    Int8Array, Uint8Array, Buffer, Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: 10, seed: 20260515, toYear: 2020 };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(4, Math.min(12, parseInt(a.slice(7), 10) || 10));
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--to-year=')) o.toYear = parseInt(a.slice(10), 10) || 2020;
  }
  return o;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pct(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(d)}%`;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function buildSimIife(snapshotYears, toYear) {
  return `
(function(){
  var GEN_ERA = ${JSON.stringify(GEN_ERA)};
  var TARGET_PERIOD = ${TARGET_PERIOD};
  var SNAPSHOT_YEARS = ${JSON.stringify(snapshotYears.filter((y) => y <= toYear))};
  var TO_YEAR = ${toYear};
  var MAX_STEPS = ${(toYear - 1985) * 2 + 4};

  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isChrLineageFmt(fmt){
    var raw=String(fmt||'');
    if(raw==='RHYTHMIC'||raw==='HOT_AC'||raw==='CHR')return true;
    return fmtKey(fmt)==='TOP40';
  }
  function eligibleBook(stations){
    return (stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number'&&!stationIsNoncommercialInstitutional(s);
    });
  }
  function sortBook(stations){
    var list=eligibleBook(stations);
    for(var i=0;i<list.length;i++){
      if(typeof sanitizeStationShareForRanking==='function')sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){
      return (b.rat.share||0)-(a.rat.share||0)||String(a.id).localeCompare(String(b.id));
    });
    return list;
  }
  function snapMetrics(book){
    var chrStations=0, chrShare=0, fmtSum={}, shares=[];
    for(var i=0;i<book.length;i++){
      var st=book[i];
      var sh=Number(st.rat.share)||0;
      shares.push(sh);
      var fk=fmtKey(st.format);
      fmtSum[fk]=(fmtSum[fk]||0)+sh;
      if(isChrLineageFmt(st.format)){chrStations++;chrShare+=sh;}
    }
    shares.sort(function(a,b){return b-a;});
    var top3=shares.slice(0,3).reduce(function(a,b){return a+b;},0);
    var hhi=shares.reduce(function(a,s){return a+s*s;},0);
    var diversity=0;
    for(var k in fmtSum){if(fmtSum[k]>=0.01)diversity++;}
    var leader=book[0]||null;
    return {
      chrStationCount:chrStations,
      chrLaneShare:chrShare,
      chrSharePerStation:chrStations>0?chrShare/chrStations:0,
      num1IsTop40:leader?fmtKey(leader.format)==='TOP40':false,
      top3Concentration:top3,
      hhi:hhi,
      formatDiversity:diversity,
      laneShares:{
        ADULT_CONTEMP:(fmtSum.ADULT_CONTEMP||0)+(fmtSum.HOT_AC||0),
        ROCK:(fmtSum.ALBUM_ROCK||0)+(fmtSum.CLASSIC_ROCK||0)+(fmtSum.ALT_ROCK||0)+(fmtSum.AAA||0),
        SPANISH:fmtSum.SPANISH||0,
        URBAN:(fmtSum.URBAN_CONTEMP||0)+(fmtSum.SOUL_RNB||0)+(fmtSum.RHYTHMIC||0),
        COUNTRY:fmtSum.COUNTRY||0,
      },
    };
  }
  function runOne(marketId, variant){
    CHR_REPLACE_LAUNCH_VARIANT=variant;
    ACTIVE_MARKET=marketId;
    syncMarketPopToMarket(marketId);
    G=genMarketMP(GEN_ERA);
    MP.mode='solo';
    if(variant!=='C')G._chrLaneVacancyReplacementOff=true;
    G._chrRlDiag={chrExits:0,exitsBlocked:0,replacementLaunches:0,vacancyLaunches:0,challengerReentries:0,memoryBoosts:0,aiReformats:0};
    var snapshots={};
    var steps=0;
    while(steps<MAX_STEPS){
      if(G.year===TO_YEAR&&G.period===TARGET_PERIOD)break;
      if(G.year>TO_YEAR||(G.year===TO_YEAR&&G.period>TARGET_PERIOD))
        return {ok:false,err:'overshoot',steps:steps};
      if(G.period===TARGET_PERIOD&&SNAPSHOT_YEARS.indexOf(G.year)>=0)
        snapshots[G.year]=snapMetrics(sortBook(G.stations));
      var ui=window._harnessPatchTimersAndUi();
      try{ advTurn(); }finally{ ui.restore(); }
      steps++;
    }
    snapshots[TO_YEAR]=snapMetrics(sortBook(G.stations));
    var d=G._chrRlDiag||{};
    var replRatio=d.chrExits>0?d.replacementLaunches/d.chrExits:d.replacementLaunches>0?1:0;
    return {ok:true,steps:steps,snapshots:snapshots,diag:{...d,replacementRatio:replRatio}};
  }
  return runOne;
})();
`;
}

function aggregateCell(runs) {
  const ok = runs.filter((r) => r.ok);
  const byYear = {};
  for (const y of SNAPSHOT_YEARS) {
    const rows = ok.map((r) => r.snapshots?.[y]).filter(Boolean);
    if (!rows.length) continue;
    byYear[y] = {
      chrStationCount: mean(rows.map((x) => x.chrStationCount)),
      chrLaneShare: mean(rows.map((x) => x.chrLaneShare)),
      chrSharePerStation: mean(rows.map((x) => x.chrSharePerStation)),
      top40Num1WinRate: mean(rows.map((x) => (x.num1IsTop40 ? 1 : 0))),
      top3Concentration: mean(rows.map((x) => x.top3Concentration)),
      hhi: mean(rows.map((x) => x.hhi)),
      formatDiversity: mean(rows.map((x) => x.formatDiversity)),
      laneShares: {
        ADULT_CONTEMP: mean(rows.map((x) => x.laneShares?.ADULT_CONTEMP || 0)),
        ROCK: mean(rows.map((x) => x.laneShares?.ROCK || 0)),
        SPANISH: mean(rows.map((x) => x.laneShares?.SPANISH || 0)),
        URBAN: mean(rows.map((x) => x.laneShares?.URBAN || 0)),
        COUNTRY: mean(rows.map((x) => x.laneShares?.COUNTRY || 0)),
      },
    };
  }
  return {
    nRuns: ok.length,
    byYear,
    meanChrExits: mean(ok.map((r) => r.diag?.chrExits || 0)),
    meanExitsBlocked: mean(ok.map((r) => r.diag?.exitsBlocked || 0)),
    meanReplacementLaunches: mean(ok.map((r) => r.diag?.replacementLaunches || 0)),
    meanReplacementRatio: mean(ok.map((r) => r.diag?.replacementRatio || 0)),
    meanVacancyLaunches: mean(ok.map((r) => r.diag?.vacancyLaunches || 0)),
    meanChallengerReentries: mean(ok.map((r) => r.diag?.challengerReentries || 0)),
    meanMemoryBoosts: mean(ok.map((r) => r.diag?.memoryBoosts || 0)),
    meanAiReformats: mean(ok.map((r) => r.diag?.aiReformats || 0)),
  };
}

function scoreWestVariant(agg, baseline, marketId) {
  const y = agg?.byYear?.[2000];
  const b = baseline?.byYear?.[2000];
  if (!y || !b) return 0;
  let score = 0;
  const isWest = marketId === 'sanfrancisco' || marketId === 'seattle';
  if (isWest) {
    if (y.chrStationCount >= 3.8) score += 30;
    else if (y.chrStationCount >= 3.4) score += 15;
    if (agg.meanReplacementRatio >= 0.5) score += 20;
    else if (agg.meanReplacementRatio >= 0.35) score += 10;
    if (agg.meanExitsBlocked <= 15) score += 15;
    if (y.chrSharePerStation <= 0.055) score += 10;
    if (y.top40Num1WinRate < b.top40Num1WinRate - 0.12) score += 20;
    if (y.chrLaneShare <= 0.18) score += 10;
  } else {
    const chrDelta = Math.abs((y.chrStationCount || 0) - (b.chrStationCount || 0));
    if (chrDelta <= 0.6) score += 12;
    if (agg.meanExitsBlocked <= 10) score += 8;
  }
  return score;
}

function answerQuestions(cells) {
  const g = (m, v) => cells.find((c) => c.marketId === m && c.variant === v)?.agg;
  const sfA = g('sanfrancisco', 'A');
  const sfB = g('sanfrancisco', 'B');
  const sfC = g('sanfrancisco', 'C');
  const sfD = g('sanfrancisco', 'D');
  const sfE = g('sanfrancisco', 'E');

  const bestChr = ['B', 'C', 'D', 'E']
    .map((v) => ({ v, chr: g('sanfrancisco', v)?.byYear?.[2000]?.chrStationCount || 0 }))
    .sort((a, b) => b.chr - a.chr)[0];

  return {
    replacementWithoutBlock: {
      answer:
        (sfB?.meanExitsBlocked || 0) < 5 && (sfB?.byYear?.[2000]?.chrStationCount || 0) > (sfA?.byYear?.[2000]?.chrStationCount || 0)
          ? 'Partially — strong memory (B) can lift count without blocking, but may need vacancy/challenger for 4+ target'
          : 'Memory alone (B) is insufficient for full 4-station target; vacancy (C) or challenger (D) needed',
      sfBChr: sfB?.byYear?.[2000]?.chrStationCount,
      sfBBlocked: sfB?.meanExitsBlocked,
      sfBReplRatio: sfB?.meanReplacementRatio,
    },
    bestSignal: {
      answer: `Best CHR count at SF 2000: variant ${bestChr?.v} (~${bestChr?.chr?.toFixed(1)} stns). Compare vacancy ${sfC?.meanVacancyLaunches?.toFixed(1)} vs challenger ${sfD?.meanChallengerReentries?.toFixed(1)} vs memory boosts ${sfB?.meanMemoryBoosts?.toFixed(1)}`,
      sfC: sfC?.byYear?.[2000],
      sfD: sfD?.byYear?.[2000],
      sfE: sfE?.byYear?.[2000],
    },
    marketScope: {
      answer:
        'West/coastal large markets (SF/Seattle) benefit most; apply vacancy/challenger to coastal_secular + west_fm_fragmented; LA/Chicago should use softer triggers or skip challenger',
      laE: g('losangeles', 'E')?.byYear?.[2000]?.chrStationCount,
      laA: g('losangeles', 'A')?.byYear?.[2000]?.chrStationCount,
    },
    safestCandidate: {
      answer:
        'Variant E (mild n≤3 floor + vacancy + challenger) if targets met with low blocks; else D or C alone for positive-only ecology',
      sfE: sfE?.byYear?.[2000],
      sfEBlocked: sfE?.meanExitsBlocked,
      sfERepl: sfE?.meanReplacementRatio,
    },
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const snapshotYears = SNAPSHOT_YEARS.filter((y) => y <= opts.toYear);
  const patchedSrc = patchLegacyForAb(readFileSync(legacyPath, 'utf8'));
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(patchedSrc, ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  const runOne = vm.runInContext(buildSimIife(snapshotYears, opts.toYear), ctx);

  const allRuns = [];
  for (const variant of VARIANTS) {
    for (const mkt of MARKETS) {
      for (let run = 0; run < opts.runs; run++) {
        const s0 = opts.seed + marketSalt(mkt.id) * 29 + variant.charCodeAt(0) * 991 + run * 9973;
        let s = s0;
        const origR = Math.random;
        Math.random = function () {
          s = (s * 9301 + 49297) % 233280;
          return s / 233280;
        };
        let r;
        try {
          r = runOne(mkt.id, variant);
        } catch (e) {
          r = { ok: false, err: String(e?.message || e) };
        } finally {
          Math.random = origR;
        }
        allRuns.push({ variant, marketId: mkt.id, label: mkt.label, run, seed: s0, ...r });
      }
    }
  }

  const cells = [];
  for (const variant of VARIANTS) {
    for (const mkt of MARKETS) {
      const runs = allRuns.filter((r) => r.variant === variant && r.marketId === mkt.id);
      cells.push({
        variant,
        marketId: mkt.id,
        label: mkt.label,
        description: VARIANT_DESC[variant],
        agg: aggregateCell(runs),
      });
    }
  }

  const baselines = Object.fromEntries(
    MARKETS.map((m) => [m.id, cells.find((c) => c.marketId === m.id && c.variant === 'A')?.agg]),
  );

  const rankings = VARIANTS.map((variant) => ({
    variant,
    description: VARIANT_DESC[variant],
    score: MARKETS.reduce(
      (sum, m) => sum + scoreWestVariant(
        cells.find((c) => c.variant === variant && c.marketId === m.id)?.agg,
        baselines[m.id],
        m.id,
      ),
      0,
    ),
  })).sort((a, b) => b.score - a.score);

  const questions = answerQuestions(cells);

  const report = {
    generatedAt: new Date().toISOString(),
    harness: `genMarketMP(${GEN_ERA}) → Spring ${opts.toYear}`,
    runsPerCell: opts.runs,
    baseSeed: opts.seed,
    variants: VARIANT_DESC,
    cells,
    variantRankings: rankings,
    questions,
    productionCandidate: {
      recommendation: questions.safestCandidate.answer,
      patchSurface: 'chrReplaceAbPostTurn + chrRlAbReplacementScoreMult + optional mild n≤3 floor',
      notShipped: true,
    },
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2));

  const md = [];
  md.push('# CHR Replacement Launch A/B');
  md.push('');
  md.push(`Generated: ${report.generatedAt}`);
  md.push(`Harness: genMarketMP(${GEN_ERA}) → Spring ${opts.toYear}, ${opts.runs} runs/cell`);
  md.push('');
  md.push('## Variants');
  md.push('');
  for (const [k, v] of Object.entries(VARIANT_DESC)) md.push(`- **${k}**: ${v}`);
  md.push('');
  md.push('## 2000 Spring — SF/Seattle focus');
  md.push('');
  md.push('| Market | Var | CHR | Lane | CHR/stn | #1 T40 | Repl ratio | Blocked | Vacancy | Challenger | AC | Rock | Span |');
  md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const mkt of MARKETS.filter((m) => m.id === 'sanfrancisco' || m.id === 'seattle')) {
    for (const variant of VARIANTS) {
      const c = cells.find((x) => x.marketId === mkt.id && x.variant === variant);
      const y = c?.agg?.byYear?.[2000];
      if (!y) continue;
      md.push(
        `| ${mkt.label} | ${variant} | ${y.chrStationCount?.toFixed(1)} | ${pct(y.chrLaneShare)} | ${pct(y.chrSharePerStation)} | ${pct(y.top40Num1WinRate)} | ${c.agg.meanReplacementRatio?.toFixed(2)} | ${c.agg.meanExitsBlocked?.toFixed(1)} | ${c.agg.meanVacancyLaunches?.toFixed(1)} | ${c.agg.meanChallengerReentries?.toFixed(1)} | ${pct(y.laneShares?.ADULT_CONTEMP)} | ${pct(y.laneShares?.ROCK)} | ${pct(y.laneShares?.SPANISH)} |`,
      );
    }
  }
  md.push('');
  md.push('## LA/Chicago (overcorrection check)');
  md.push('');
  md.push('| Market | Var | CHR 2000 | #1 T40 | Blocked |');
  md.push('| --- | --- | --- | --- | --- |');
  for (const mkt of MARKETS.filter((m) => m.id === 'losangeles' || m.id === 'chicago')) {
    for (const variant of ['A', 'C', 'D', 'E']) {
      const c = cells.find((x) => x.marketId === mkt.id && x.variant === variant);
      const y = c?.agg?.byYear?.[2000];
      md.push(
        `| ${mkt.label} | ${variant} | ${y?.chrStationCount?.toFixed(1) ?? '—'} | ${pct(y?.top40Num1WinRate)} | ${c?.agg?.meanExitsBlocked?.toFixed(1) ?? '—'} |`,
      );
    }
  }
  if (snapshotYears.includes(2020)) {
    md.push('');
    md.push('## 2020 self-correction');
    md.push('');
    md.push('| Market | A | D | E |');
    md.push('| --- | --- | --- | --- |');
    for (const mkt of MARKETS.filter((m) => m.id === 'sanfrancisco' || m.id === 'seattle')) {
      const row = [mkt.label];
      for (const v of ['A', 'D', 'E']) {
        const y = cells.find((c) => c.marketId === mkt.id && c.variant === v)?.agg?.byYear?.[2020];
        row.push(y ? `${y.chrStationCount?.toFixed(1)} CHR / ${pct(y.top40Num1WinRate)} #1` : '—');
      }
      md.push(`| ${row.join(' | ')} |`);
    }
  }
  md.push('');
  md.push('## CHR timeline (San Francisco)');
  md.push('');
  md.push('| Year | A | B | C | D | E |');
  md.push('| --- | --- | --- | --- | --- | --- |');
  for (const year of snapshotYears) {
    const row = [year];
    for (const v of VARIANTS) {
      row.push(
        cells.find((c) => c.marketId === 'sanfrancisco' && c.variant === v)?.agg?.byYear?.[year]?.chrStationCount?.toFixed(1) ?? '—',
      );
    }
    md.push(`| ${row.join(' | ')} |`);
  }
  md.push('');
  md.push('## Variant ranking');
  md.push('');
  rankings.forEach((r, i) => md.push(`${i + 1}. **${r.variant}** (score ${r.score}) — ${r.description}`));
  md.push('');
  md.push('## Questions');
  md.push('');
  md.push(`1. **Replacement without heavy blocking?** ${questions.replacementWithoutBlock.answer}`);
  md.push(`2. **Best replacement signal?** ${questions.bestSignal.answer}`);
  md.push(`3. **Market scope?** ${questions.marketScope.answer}`);
  md.push(`4. **Safest production candidate?** ${questions.safestCandidate.answer}`);
  md.push('');
  md.push('## Production candidate (not shipped)');
  md.push('');
  md.push(`> ${report.productionCandidate.recommendation}`);

  writeFileSync(outMd, md.join('\n'));

  const sfA = cells.find((c) => c.marketId === 'sanfrancisco' && c.variant === 'A')?.agg?.byYear?.[2000];
  const sfE = cells.find((c) => c.marketId === 'sanfrancisco' && c.variant === 'E')?.agg?.byYear?.[2000];
  console.log('CHR replacement launch A/B');
  console.log(`  runs/cell: ${opts.runs} | variants: ${VARIANTS.join(', ')}`);
  console.log(`  SF baseline: CHR ${sfA?.chrStationCount?.toFixed(1)} #1 ${pct(sfA?.top40Num1WinRate)}`);
  console.log(`  SF variant E: CHR ${sfE?.chrStationCount?.toFixed(1)} #1 ${pct(sfE?.top40Num1WinRate)} blocked ${cells.find((c) => c.variant === 'E' && c.marketId === 'sanfrancisco')?.agg?.meanExitsBlocked?.toFixed(1)}`);
  console.log(`  top variant: ${rankings[0]?.variant} (score ${rankings[0]?.score})`);
  console.log(`  wrote ${outJson}`);
  console.log(`  wrote ${outMd}`);
}

main();
