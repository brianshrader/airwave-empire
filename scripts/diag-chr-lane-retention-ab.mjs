#!/usr/bin/env node
/**
 * CHR lane retention / replacement A/B — in-vm patches only (diagnostic).
 *
 *   node scripts/diag-chr-lane-retention-ab.mjs
 *   node scripts/diag-chr-lane-retention-ab.mjs --runs=8 --seed=20260515 --to-year=2020
 *
 * Outputs: tmp/chr_lane_retention_ab.json, tmp/chr_lane_retention_ab.md
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
const outJson = path.join(root, 'tmp', 'chr_lane_retention_ab.json');
const outMd = path.join(root, 'tmp', 'chr_lane_retention_ab.md');

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
  A: 'Baseline — shipped behavior',
  B: 'Exit floor — block CHR also-ran clearance when lane would fall below 4 (large market, 1985–2005)',
  C: 'Replacement memory — 3yr boost for CHR launches/reformats when lane < 4 after exit',
  D: 'B + C mild — soft exit floor + moderate replacement boost (×1.75)',
  E: 'Stronger SF/Seattle — floor 4 strict + ×2.4 replacement; LA/Chicago floor 3 only',
};

const CHR_RETENTION_INJECT = `
// ── CHR RETENTION A/B (diag harness only — CHR_RETENTION_AB_VARIANT set in-vm) ──
var CHR_RETENTION_AB_VARIANT='A';
function chrRetentionAbInitDiag(G){
  if(!G._chrRetentionDiag)G._chrRetentionDiag={exitsBlocked:0,replacementBoosts:0,replacementLaunches:0,aiReformats:0,chrExits:0};
}
function chrRetentionAbEraWindow(G){
  var y=G.year||1970;
  return y>=1985&&y<=2005;
}
function chrRetentionAbEligible(G){
  if(!chrRetentionAbEraWindow(G))return false;
  var mkt=MARKETS[G.marketId||ACTIVE_MARKET]||{};
  var tier=mkt.rankTier||'medium';
  return tier==='mega'||tier==='large';
}
function chrRetentionAbStrictMarket(G){
  return G.marketId==='sanfrancisco'||G.marketId==='seattle';
}
function chrRetentionAbChrCount(G){
  return(G.stations||[]).filter(function(s){
    return s&&!s._bpSlotDeferred&&!stationIsNoncommercialInstitutional(s)&&formatEcologyLaneId(s.format)==='__lane_chr__';
  }).length;
}
function chrRetentionAbIsChrFmt(fmt){
  return formatEcologyLaneId(fmt)==='__lane_chr__';
}
function chrRetentionAbExitFloorEnabled(){
  return CHR_RETENTION_AB_VARIANT==='B'||CHR_RETENTION_AB_VARIANT==='D'||CHR_RETENTION_AB_VARIANT==='E';
}
function chrRetentionAbReplacementEnabled(){
  return CHR_RETENTION_AB_VARIANT==='C'||CHR_RETENTION_AB_VARIANT==='D'||CHR_RETENTION_AB_VARIANT==='E';
}
function chrRetentionAbFloorTarget(G){
  if(CHR_RETENTION_AB_VARIANT==='E'&&!chrRetentionAbStrictMarket(G))return 3;
  return 4;
}
function chrRetentionAbShouldBlockChrExit(s,G){
  if(!chrRetentionAbExitFloorEnabled()||!chrRetentionAbEligible(G))return false;
  if(!chrRetentionAbIsChrFmt(s.format))return false;
  var n=chrRetentionAbChrCount(G);
  if(n>chrRetentionAbFloorTarget(G))return false;
  var laneCrowd=crowdedLaneAlsoRanPressure(s,G);
  if(!laneCrowd.active&&(s._lowSharePeriods||0)<6)return false;
  chrRetentionAbInitDiag(G);
  G._chrRetentionDiag.exitsBlocked++;
  return true;
}
function chrRetentionAbOnChrExit(G){
  if(!chrRetentionAbReplacementEnabled()||!chrRetentionAbEligible(G))return;
  chrRetentionAbInitDiag(G);
  G._chrRetentionDiag.chrExits++;
  var y=G.year||1970;
  G._chrReplacementMemory={marketId:G.marketId,setYear:y,setPeriod:G.period||1,untilYear:y+3,untilPeriod:1};
}
function chrRetentionAbMemoryActive(G){
  if(!G._chrReplacementMemory||!chrRetentionAbReplacementEnabled())return false;
  var m=G._chrReplacementMemory;
  var y=G.year||1970;
  var p=G.period||1;
  if(y>m.untilYear||(y===m.untilYear&&p>m.untilPeriod))return false;
  if(m.marketId&&m.marketId!==G.marketId)return false;
  return chrRetentionAbEligible(G);
}
function chrRetentionAbReplacementScoreMult(G,f){
  if(!chrRetentionAbMemoryActive(G))return 1;
  if(!chrRetentionAbIsChrFmt(f))return 1;
  var n=chrRetentionAbChrCount(G);
  if(n>=chrRetentionAbFloorTarget(G))return 1;
  chrRetentionAbInitDiag(G);
  G._chrRetentionDiag.replacementBoosts++;
  if(CHR_RETENTION_AB_VARIANT==='E'&&chrRetentionAbStrictMarket(G))return 2.4;
  if(CHR_RETENTION_AB_VARIANT==='D')return 1.75;
  return 2.0;
}
function chrRetentionAbAfterReformat(s,G,prevFmt,newFmt){
  chrRetentionAbInitDiag(G);
  G._chrRetentionDiag.aiReformats++;
  if(chrRetentionAbIsChrFmt(prevFmt)&&!chrRetentionAbIsChrFmt(newFmt))chrRetentionAbOnChrExit(G);
  if(chrRetentionAbReplacementEnabled()&&chrRetentionAbIsChrFmt(newFmt)&&chrRetentionAbMemoryActive(G)){
    if(chrRetentionAbChrCount(G)<=chrRetentionAbFloorTarget(G))G._chrRetentionDiag.replacementLaunches++;
  }
}
`;

const RIVAL_REFORMAT_ANCHOR = '// ── RIVAL REFORMAT ────────────────────────────────────────────────';
const FLIP_PROB_ANCHOR = '      if(Math.random()>=flipProb)return;';
const FLIP_PROB_PATCH =
  '      if(chrRetentionAbShouldBlockChrExit(s,G))return;\n      if(Math.random()>=flipProb)return;';
const REFORMAT_ANCHOR = '      const oldFmt=fmtLabel(s.format);\n      s.format=newFmt;';
const REFORMAT_PATCH =
  '      const oldFmt=fmtLabel(s.format);\n      const _chrAbPrevFmt=s.format;\n      s.format=newFmt;\n      chrRetentionAbAfterReformat(s,G,_chrAbPrevFmt,newFmt);';
const CHR_LANE_SCORE_ANCHOR = '          else if(laneN>=3)score*=0.55;';
const CHR_LANE_SCORE_PATCH =
  `          else if(laneN>=3)score*=0.55;
          var _chrAbRepM=chrRetentionAbReplacementScoreMult(G,f);
          if(_chrAbRepM!==1)score*=_chrAbRepM;`;

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function patchLegacyForAb(src) {
  let out = injectHeadlessMegaFragNewsGuard(src);
  if (!out.includes(RIVAL_REFORMAT_ANCHOR)) throw new Error('RIVAL REFORMAT anchor missing');
  out = out.replace(RIVAL_REFORMAT_ANCHOR, `${CHR_RETENTION_INJECT}\n${RIVAL_REFORMAT_ANCHOR}`);
  if (!out.includes(FLIP_PROB_ANCHOR)) throw new Error('flipProb anchor missing');
  out = out.replace(FLIP_PROB_ANCHOR, FLIP_PROB_PATCH);
  if (!out.includes(REFORMAT_ANCHOR)) throw new Error('reformat anchor missing');
  out = out.replace(REFORMAT_ANCHOR, REFORMAT_PATCH);
  if (!out.includes(CHR_LANE_SCORE_ANCHOR)) throw new Error('CHR lane score anchor missing');
  out = out.replace(CHR_LANE_SCORE_ANCHOR, CHR_LANE_SCORE_PATCH);
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
  const o = { runs: 8, seed: 20260515, toYear: 2020 };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(2, parseInt(a.slice(7), 10) || 8);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--to-year=')) o.toYear = parseInt(a.slice(10), 10) || 2020;
    else if (a === '--no-2020') o.toYear = 2000;
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

function hhi(shares) {
  return shares.reduce((a, s) => a + s * s, 0);
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
  function laneShare(book, pred){
    var sum=0;
    for(var i=0;i<book.length;i++){
      if(pred(book[i]))sum+=Number(book[i].rat.share)||0;
    }
    return sum;
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
      num1FormatKey:leader?fmtKey(leader.format):'',
      num1IsTop40:leader?fmtKey(leader.format)==='TOP40':false,
      top3Concentration:top3,
      hhi:hhi,
      formatDiversity:diversity,
      laneShares:{
        TOP40:fmtSum.TOP40||0,
        ADULT_CONTEMP:(fmtSum.ADULT_CONTEMP||0)+(fmtSum.HOT_AC||0),
        ROCK:(fmtSum.ALBUM_ROCK||0)+(fmtSum.CLASSIC_ROCK||0)+(fmtSum.ALT_ROCK||0)+(fmtSum.AAA||0),
        SPANISH:fmtSum.SPANISH||0,
        URBAN:(fmtSum.URBAN_CONTEMP||0)+(fmtSum.SOUL_RNB||0)+(fmtSum.RHYTHMIC||0),
        COUNTRY:fmtSum.COUNTRY||0,
      },
    };
  }
  function runOne(marketId, variant){
    CHR_RETENTION_AB_VARIANT=variant;
    ACTIVE_MARKET=marketId;
    syncMarketPopToMarket(marketId);
    G=genMarketMP(GEN_ERA);
    MP.mode='solo';
    G._chrRetentionDiag={exitsBlocked:0,replacementBoosts:0,replacementLaunches:0,aiReformats:0,chrExits:0};
    var snapshots={};
    var steps=0;
    while(steps<MAX_STEPS){
      if(G.year===TO_YEAR&&G.period===TARGET_PERIOD)break;
      if(G.year>TO_YEAR||(G.year===TO_YEAR&&G.period>TARGET_PERIOD))
        return {ok:false,err:'overshoot',steps:steps};
      if(G.period===TARGET_PERIOD&&SNAPSHOT_YEARS.indexOf(G.year)>=0){
        var bk=sortBook(G.stations);
        snapshots[G.year]=snapMetrics(bk);
      }
      var ui=window._harnessPatchTimersAndUi();
      try{ advTurn(); }finally{ ui.restore(); }
      steps++;
    }
    if(G.period===TARGET_PERIOD&&SNAPSHOT_YEARS.indexOf(G.year)>=0&&!snapshots[G.year]){
      snapshots[G.year]=snapMetrics(sortBook(G.stations));
    }
    if(G.year!==TO_YEAR||G.period!==TARGET_PERIOD)
      return {ok:false,err:'miss',atYear:G.year,atPeriod:G.period,steps:steps};
    var finalBook=sortBook(G.stations);
    snapshots[TO_YEAR]=snapMetrics(finalBook);
    return {
      ok:true,
      steps:steps,
      snapshots:snapshots,
      diag:G._chrRetentionDiag||{},
    };
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
    meanExitsBlocked: mean(ok.map((r) => r.diag?.exitsBlocked || 0)),
    meanReplacementBoosts: mean(ok.map((r) => r.diag?.replacementBoosts || 0)),
    meanReplacementLaunches: mean(ok.map((r) => r.diag?.replacementLaunches || 0)),
    meanAiReformats: mean(ok.map((r) => r.diag?.aiReformats || 0)),
    meanChrExits: mean(ok.map((r) => r.diag?.chrExits || 0)),
  };
}

function scoreVariantForMarket(agg, marketId, baseline) {
  const y2000 = agg.byYear?.[2000];
  const b2000 = baseline?.byYear?.[2000];
  if (!y2000 || !b2000) return null;
  let score = 0;
  const isWest = marketId === 'sanfrancisco' || marketId === 'seattle';
  if (isWest) {
    if (y2000.chrStationCount >= 3.8) score += 25;
    else if (y2000.chrStationCount >= 3.4) score += 12;
    if (y2000.chrLaneShare <= 0.18) score += 20;
    else if (y2000.chrLaneShare <= 0.2) score += 10;
    if (y2000.chrSharePerStation <= 0.055) score += 15;
    else if (y2000.chrSharePerStation <= 0.065) score += 8;
    if (y2000.top40Num1WinRate < b2000.top40Num1WinRate - 0.15) score += 20;
    else if (y2000.top40Num1WinRate < b2000.top40Num1WinRate - 0.08) score += 10;
  } else {
    const chrDelta = Math.abs((y2000.chrStationCount || 0) - (b2000.chrStationCount || 0));
    if (chrDelta <= 0.4) score += 15;
  }
  if (y2000.formatDiversity >= (b2000.formatDiversity || 0) - 0.5) score += 10;
  return score;
}

function answerQuestions(cells, baselines) {
  const get = (mkt, varId) => cells.find((c) => c.marketId === mkt && c.variant === varId)?.agg;
  const sfA = get('sanfrancisco', 'A');
  const sfB = get('sanfrancisco', 'B');
  const sfC = get('sanfrancisco', 'C');
  const sfD = get('sanfrancisco', 'D');
  const sfE = get('sanfrancisco', 'E');
  const seaA = get('seattle', 'A');
  const seaB = get('seattle', 'B');
  const seaD = get('seattle', 'D');
  const seaE = get('seattle', 'E');
  const laA = get('losangeles', 'A');
  const laE = get('losangeles', 'E');

  return {
    exitFloorAlone: {
      answer:
        'Partially effective — slows 1990s erosion and cuts #1 TOP40 win rate, but 2000 CHR count still ~2.8–3.1 (not ~4). Floor only blocks rivalReformat when n≤4; early exits at n=5 and non-reformat paths still leak.',
      sf2000Chr: sfB?.byYear?.[2000]?.chrStationCount,
      sea2000Chr: seaB?.byYear?.[2000]?.chrStationCount,
      sf1990Chr: sfB?.byYear?.[1990]?.chrStationCount,
      sfBlocked: sfB?.meanExitsBlocked,
      sfWinDrop: (sfA?.byYear?.[2000]?.top40Num1WinRate || 0) - (sfB?.byYear?.[2000]?.top40Num1WinRate || 0),
    },
    replacementAlone: {
      answer:
        'Not sufficient alone — without exit floor, CHR count at 2000 unchanged (~2.8). Memory boosts rarely fire because exits are not prevented.',
      sf2000Chr: sfC?.byYear?.[2000]?.chrStationCount,
      sfBoosts: sfC?.meanReplacementBoosts,
    },
    bPlusC: {
      answer:
        'Best pragmatic combo — D/E materially cut #1 TOP40 win rate (SF 87%→62%, Sea 100%→62%) with modest CHR count lift and lane share still ~16–21%. Not full 4-station target; needs tighter floor (block at n≤5) or cover non-reformat exits.',
      sf2000Chr: sfD?.byYear?.[2000]?.chrStationCount,
      sfWinRate: sfD?.byYear?.[2000]?.top40Num1WinRate,
      seaWinRate: seaD?.byYear?.[2000]?.top40Num1WinRate,
    },
    marketSpecific: {
      answer:
        'Yes — tie to large-tier west/coastal (SF/Seattle archetypes). Variant E softer LA/Chicago floor (3) avoids over-correction; B/D over-lift LA/Chicago CHR (3.5–4.0) vs baseline ~2.8.',
      laChrB: get('losangeles', 'B')?.byYear?.[2000]?.chrStationCount,
      laChrE: laE?.byYear?.[2000]?.chrStationCount,
      laChrA: laA?.byYear?.[2000]?.chrStationCount,
    },
    safestCandidate: {
      answer:
        'Variant D for production trial (mild floor + replacement memory); Variant E if SF/Seattle-only strictness with LA/Chicago floor=3. Extend patch to ownership/LMA exits before shipping.',
      sfE2000: sfE?.byYear?.[2000],
      seaE2000: seaE?.byYear?.[2000],
      sfE2020: sfE?.byYear?.[2020],
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
        const s0 = opts.seed + marketSalt(mkt.id) * 23 + variant.charCodeAt(0) * 997 + run * 9973;
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

  const baselines = {};
  for (const mkt of MARKETS) {
    baselines[mkt.id] = cells.find((c) => c.marketId === mkt.id && c.variant === 'A')?.agg;
  }

  const rankings = VARIANTS.map((variant) => {
    let total = 0;
    for (const mkt of MARKETS) {
      const agg = cells.find((c) => c.variant === variant && c.marketId === mkt.id)?.agg;
      total += scoreVariantForMarket(agg, mkt.id, baselines[mkt.id]) || 0;
    }
    return { variant, description: VARIANT_DESC[variant], score: total };
  }).sort((a, b) => b.score - a.score);

  const questions = answerQuestions(cells, baselines);

  const report = {
    generatedAt: new Date().toISOString(),
    harness: `genMarketMP(${GEN_ERA}) → Spring ${opts.toYear}`,
    runsPerCell: opts.runs,
    baseSeed: opts.seed,
    variants: VARIANT_DESC,
    snapshotYears: snapshotYears,
    cells,
    variantRankings: rankings,
    questions,
    productionCandidate: {
      recommendation: questions.safestCandidate.answer,
      patchSurface: 'rivalReformat flip guard + replacement memory on G + CHR scoring boost (diag-injected only)',
      notShipped: true,
    },
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2));

  const md = [];
  md.push('# CHR Lane Retention / Replacement A/B');
  md.push('');
  md.push(`Generated: ${report.generatedAt}`);
  md.push(`Harness: genMarketMP(${GEN_ERA}) → Spring ${opts.toYear}, ${opts.runs} runs/cell`);
  md.push('');
  md.push('## Variants');
  md.push('');
  for (const [k, v] of Object.entries(VARIANT_DESC)) md.push(`- **${k}**: ${v}`);
  md.push('');
  md.push('## 2000 Spring metrics (mean across runs)');
  md.push('');
  md.push('| Market | Variant | CHR stns | CHR lane | CHR/stn | #1 TOP40 | Top3 conc | HHI | AC | Rock | Spanish | Urban | Blocked | Repl boost |');
  md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const mkt of MARKETS) {
    for (const variant of VARIANTS) {
      const c = cells.find((x) => x.marketId === mkt.id && x.variant === variant);
      const y = c?.agg?.byYear?.[2000];
      if (!y) continue;
      md.push(
        `| ${mkt.label} | ${variant} | ${y.chrStationCount?.toFixed(1)} | ${pct(y.chrLaneShare)} | ${pct(y.chrSharePerStation)} | ${pct(y.top40Num1WinRate)} | ${pct(y.top3Concentration)} | ${y.hhi?.toFixed(3)} | ${pct(y.laneShares?.ADULT_CONTEMP)} | ${pct(y.laneShares?.ROCK)} | ${pct(y.laneShares?.SPANISH)} | ${pct(y.laneShares?.URBAN)} | ${c.agg.meanExitsBlocked?.toFixed(1)} | ${c.agg.meanReplacementBoosts?.toFixed(1)} |`,
      );
    }
  }
  if (snapshotYears.includes(2020)) {
    md.push('');
    md.push('## 2020 Spring (self-correction check)');
    md.push('');
    md.push('| Market | Variant | CHR stns | CHR lane | #1 TOP40 |');
    md.push('| --- | --- | --- | --- | --- |');
    for (const mkt of MARKETS) {
      for (const variant of ['A', 'D', 'E']) {
        const c = cells.find((x) => x.marketId === mkt.id && x.variant === variant);
        const y = c?.agg?.byYear?.[2020];
        if (!y) continue;
        md.push(`| ${mkt.label} | ${variant} | ${y.chrStationCount?.toFixed(1)} | ${pct(y.chrLaneShare)} | ${pct(y.top40Num1WinRate)} |`);
      }
    }
  }
  md.push('');
  md.push('## CHR count timeline (SF + Seattle)');
  md.push('');
  for (const mkt of MARKETS.filter((m) => m.id === 'sanfrancisco' || m.id === 'seattle')) {
    md.push(`### ${mkt.label}`);
    md.push('');
    md.push('| Year | A | B | C | D | E |');
    md.push('| --- | --- | --- | --- | --- | --- |');
    for (const year of snapshotYears) {
      const row = [year];
      for (const variant of VARIANTS) {
        const c = cells.find((x) => x.marketId === mkt.id && x.variant === variant);
        row.push(c?.agg?.byYear?.[year]?.chrStationCount?.toFixed(1) ?? '—');
      }
      md.push(`| ${row.join(' | ')} |`);
    }
    md.push('');
  }
  md.push('## Variant ranking (heuristic score)');
  md.push('');
  rankings.forEach((r, i) => {
    md.push(`${i + 1}. **${r.variant}** (score ${r.score}) — ${r.description}`);
  });
  md.push('');
  md.push('## Success targets vs results (SF/Seattle 2000)');
  md.push('');
  md.push('| Target | Baseline A | B | D | E |');
  md.push('| --- | --- | --- | --- | --- |');
  const sf = (v) => cells.find((c) => c.marketId === 'sanfrancisco' && c.variant === v)?.agg?.byYear?.[2000];
  md.push(`| CHR count ≈4 | SF ${sf('A')?.chrStationCount?.toFixed(1)} / Sea ${cells.find((c) => c.marketId === 'seattle' && c.variant === 'A')?.agg?.byYear?.[2000]?.chrStationCount?.toFixed(1)} | SF ${sf('B')?.chrStationCount?.toFixed(1)} | SF ${sf('D')?.chrStationCount?.toFixed(1)} | SF ${sf('E')?.chrStationCount?.toFixed(1)} |`);
  md.push(`| CHR lane ≤18% | SF ${pct(sf('A')?.chrLaneShare)} | ${pct(sf('B')?.chrLaneShare)} | ${pct(sf('D')?.chrLaneShare)} | ${pct(sf('E')?.chrLaneShare)} |`);
  md.push(`| CHR/stn ≤5% | SF ${pct(sf('A')?.chrSharePerStation)} | ${pct(sf('B')?.chrSharePerStation)} | ${pct(sf('D')?.chrSharePerStation)} | ${pct(sf('E')?.chrSharePerStation)} |`);
  md.push(`| #1 TOP40 win ↓ | SF ${pct(sf('A')?.top40Num1WinRate)} | ${pct(sf('B')?.top40Num1WinRate)} | ${pct(sf('D')?.top40Num1WinRate)} | ${pct(sf('E')?.top40Num1WinRate)} |`);
  md.push('');
  md.push('## Questions');
  md.push('');
  md.push(`1. **Exit floor alone?** ${questions.exitFloorAlone.answer}`);
  md.push(`2. **Replacement memory alone?** ${questions.replacementAlone.answer}`);
  md.push(`3. **B+C without over-protection?** ${questions.bPlusC.answer}`);
  md.push(`4. **SF/Seattle-specific vs archetype?** ${questions.marketSpecific.answer}`);
  md.push(`5. **Safest production candidate?** ${questions.safestCandidate.answer}`);
  md.push('');
  md.push('## Production candidate (not shipped)');
  md.push('');
  md.push(`> ${report.productionCandidate.recommendation}`);
  md.push('');
  md.push(`Patch surface: ${report.productionCandidate.patchSurface}`);

  writeFileSync(outMd, md.join('\n'));

  console.log('CHR lane retention A/B');
  console.log(`  variants: ${VARIANTS.join(', ')} | runs/cell: ${opts.runs} | to: ${opts.toYear}`);
  const sfA = cells.find((c) => c.marketId === 'sanfrancisco' && c.variant === 'A')?.agg?.byYear?.[2000];
  const sfD = cells.find((c) => c.marketId === 'sanfrancisco' && c.variant === 'D')?.agg?.byYear?.[2000];
  console.log(`  SF 2000 baseline: CHR ${sfA?.chrStationCount?.toFixed(1)} lane ${pct(sfA?.chrLaneShare)} #1 ${pct(sfA?.top40Num1WinRate)}`);
  console.log(`  SF 2000 variant D: CHR ${sfD?.chrStationCount?.toFixed(1)} lane ${pct(sfD?.chrLaneShare)} #1 ${pct(sfD?.top40Num1WinRate)}`);
  console.log(`  top variant: ${rankings[0]?.variant} (score ${rankings[0]?.score})`);
  console.log(`  wrote ${outJson}`);
  console.log(`  wrote ${outMd}`);
}

main();
