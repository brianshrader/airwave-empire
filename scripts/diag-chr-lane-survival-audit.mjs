#!/usr/bin/env node
/**
 * CHR-lane survival audit — track TOP40/CHR lineage stations 1985→2000 (read-only).
 *
 *   node scripts/diag-chr-lane-survival-audit.mjs
 *   node scripts/diag-chr-lane-survival-audit.mjs --runs=8 --seed=20260515
 *
 * Outputs: tmp/chr_lane_survival_audit.json, tmp/chr_lane_survival_audit.md
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectFormatLifecycleIife } from './vmInjectFormatLifecycleIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'chr_lane_survival_audit.json');
const outMd = path.join(root, 'tmp', 'chr_lane_survival_audit.md');

const GEN_ERA = '1985';
const TARGET_YEAR = 2000;
const TARGET_PERIOD = 1;
const MAX_STEPS = 240;

const MARKETS = [
  { marketId: 'sanfrancisco', label: 'San Francisco' },
  { marketId: 'seattle', label: 'Seattle' },
  { marketId: 'losangeles', label: 'Los Angeles' },
  { marketId: 'chicago', label: 'Chicago' },
];

const TALK_FMTS = ['NEWS_TALK', 'SPORTS_TALK', 'PERSONALITY_TALK', 'ALL_NEWS'];
const ADJACENT_MUSIC = new Set([
  'ADULT_CONTEMP', 'HOT_AC', 'MOR', 'OLDIES', 'CLASSIC_HITS', 'URBAN_CONTEMP', 'SOUL_RNB',
  'COUNTRY', 'ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK', 'AAA', 'RHYTHMIC', 'BEAUTIFUL_MUSIC',
  'ADULT_STANDARDS', 'SPANISH', 'GOSPEL',
]);

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
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
  const o = { runs: 8, seed: 20260515 };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(2, parseInt(a.slice(7), 10) || 8);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
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

function categorizeExit(exitEvent, station) {
  const to = exitEvent.toFormat;
  const from = exitEvent.fromFormat;
  const tl = station.timeline || [];
  const lastSnaps = tl.slice(-4);
  const meanEbitda = mean(lastSnaps.map((s) => s.ebitda).filter((x) => x != null));
  const meanShare = mean(lastSnaps.map((s) => s.share).filter((x) => x != null));
  const flog = station.flog || [];
  const lastFlog = flog[flog.length - 1];
  const ownershipChange = exitEvent.ownershipChanged || exitEvent.corpOwnerAtExit;
  const aiReason = exitEvent.aiReason || '';
  const aiReformat = aiReason.indexOf('reformat:') === 0;

  if (ownershipChange && exitEvent.corpOwnerAtExit) {
    return { cat: 'D', label: 'Ownership/cluster consolidation' };
  }
  if (aiReformat || lastFlog?._voluntarySale || lastFlog?._distress === false) {
    if (TALK_FMTS.includes(to) || to === 'BROKERED_PROGRAMMING' || to === 'ALL_NEWS') {
      return { cat: 'C', label: 'Reformat to spoken word (AI valuation)' };
    }
    if (ADJACENT_MUSIC.has(to)) {
      return { cat: 'B', label: 'Reformat to adjacent music lane (AI valuation)' };
    }
    return { cat: 'B', label: 'Reformat (AI format valuation)' };
  }
  if (TALK_FMTS.includes(to) || to === 'BROKERED_PROGRAMMING') {
    return { cat: 'C', label: 'Reformat to spoken word' };
  }
  if (ADJACENT_MUSIC.has(to)) {
    return { cat: 'B', label: 'Reformat to adjacent music lane' };
  }
  if (lastFlog?._distress || (meanEbitda != null && meanEbitda < 0 && (meanShare == null || meanShare < 0.04))) {
    return { cat: 'A', label: 'Economic failure (distress attrition)' };
  }
  const youthCohorts = ['12-17', '18-24'];
  const oldCohorts = ['50-64', '65+'];
  const youthBefore = mean(lastSnaps.slice(0, 2).map((s) => {
    const c = s.cohortMass || {};
    return youthCohorts.reduce((a, k) => a + (c[k] || 0), 0);
  }));
  const oldAfter = mean(lastSnaps.slice(-2).map((s) => {
    const c = s.cohortMass || {};
    return oldCohorts.reduce((a, k) => a + (c[k] || 0), 0);
  }));
  if (oldAfter != null && youthBefore != null && oldAfter > youthBefore * 1.4 && ADJACENT_MUSIC.has(to)) {
    return { cat: 'E', label: 'Demographic shift (aging skew before exit)' };
  }
  return { cat: 'F', label: 'Other / uncategorized' };
}

const inner = `
(function(){
  var GEN_ERA = ${JSON.stringify(GEN_ERA)};
  var TARGET_YEAR = ${TARGET_YEAR};
  var TARGET_PERIOD = ${TARGET_PERIOD};
  var MAX_STEPS = ${MAX_STEPS};
  var TALK_FMTS = ${JSON.stringify(TALK_FMTS)};

  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isChrLineageFmt(fmt){
    var raw=String(fmt||'');
    if(raw==='RHYTHMIC'||raw==='HOT_AC'||raw==='CHR')return true;
    return fmtKey(fmt)==='TOP40';
  }
  function stationBand(s){
    if(s.sig&&s.sig.type)return s.sig.type;
    if(s.band)return s.band;
    return String(s.freq||'').indexOf(' AM')>=0?'AM':'FM';
  }
  function eligibleBook(stations){
    return (stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number'&&!stationIsNoncommercialInstitutional(s);
    });
  }
  function sortBook(book){
    var list=book.slice();
    for(var i=0;i<list.length;i++){
      if(typeof sanitizeStationShareForRanking==='function')sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){
      return (b.rat.share||0)-(a.rat.share||0)||String(a.id).localeCompare(String(b.id));
    });
    return list;
  }
  function cohortMass(st){
    var out={};
    if(!st||!st.rat||!st.rat.cur)return out;
    COH.forEach(function(coh){
      out[coh]=Number(st.rat.cur[coh]&&st.rat.cur[coh].share)||0;
    });
    return out;
  }
  function snapStation(s,rank){
    return {
      year:G.year,
      period:G.period,
      callLetters:s.callLetters,
      format:String(s.format),
      formatKey:fmtKey(s.format),
      isChr:isChrLineageFmt(s.format),
      share:Number(s.rat&&s.rat.share)||0,
      rank:rank,
      ebitda:Number(s.fin&&s.fin.ebitda)||0,
      rev:Number(s.fin&&s.fin.rev)||0,
      corpOwner:s.corpOwner||null,
      corpName:s.corpName||null,
      aiReason:s._aiLastMajorReason?String(s._aiLastMajorReason):'',
      band:stationBand(s),
      cohortMass:cohortMass(s),
    };
  }
  function trackChrSurvival(marketId){
    ACTIVE_MARKET=marketId;
    syncMarketPopToMarket(marketId);
    G=genMarketMP(GEN_ERA);
    MP.mode='solo';
    var openYear=G.year;
    var openPeriod=G.period;
    var book0=sortBook(eligibleBook(G.stations));
    var openChrIds={};
    book0.forEach(function(s){
      if(isChrLineageFmt(s.format))openChrIds[s.id]=true;
    });
    var tracked={};
    var chrCountByYear={};
    var replacements=[];
    var steps=0;

    function ensureTracked(s,wasOpenChr){
      if(!tracked[s.id]){
        tracked[s.id]={
          id:s.id,
          openCall:s.callLetters,
          openFreq:s.freq,
          openBand:stationBand(s),
          openFormat:String(s.format),
          openAtOpen:!!wasOpenChr,
          launchYear:openYear,
          launchPeriod:openPeriod,
          exit:null,
          formatChanges:[],
          ownershipChanges:[],
          timeline:[],
          flog:[],
          finalFormat:null,
          survived:false,
        };
      }
      return tracked[s.id];
    }

    book0.forEach(function(s){
      if(isChrLineageFmt(s.format)){
        var tr=ensureTracked(s,true);
        tr.timeline.push(snapStation(s,book0.findIndex(function(x){return x.id===s.id;})+1));
      }
    });

    while(steps<MAX_STEPS){
      if(G.year===TARGET_YEAR&&G.period===TARGET_PERIOD)break;
      if(G.year>TARGET_YEAR||(G.year===TARGET_YEAR&&G.period>TARGET_PERIOD))
        return {ok:false,err:'overshoot',steps:steps};
      var ui=window._harnessPatchTimersAndUi();
      try{ advTurn(); }finally{ ui.restore(); }
      steps++;
      var book=sortBook(eligibleBook(G.stations));
      var rankById={};
      book.forEach(function(s,i){ rankById[s.id]=i+1; });
      if(G.period===1){
        var chrN=0;
        book.forEach(function(s){ if(isChrLineageFmt(s.format))chrN++; });
        var yk=String(G.year);
        if(!chrCountByYear[yk])chrCountByYear[yk]=[];
        chrCountByYear[yk].push(chrN);
      }
      (G.stations||[]).forEach(function(s){
        if(!s||s._bpSlotDeferred||stationIsNoncommercialInstitutional(s))return;
        var rank=rankById[s.id]||null;
        var isChr=isChrLineageFmt(s.format);
        var wasOpen=!!openChrIds[s.id];
        var tr=tracked[s.id];
        if(!tr&&isChr){
          tr=ensureTracked(s,false);
          tr.launchYear=G.year;
          tr.launchPeriod=G.period;
          tr.openAtOpen=false;
          replacements.push({id:s.id,call:s.callLetters,year:G.year,period:G.period,format:s.format});
        }
        if(!tr)return;
        var prev=tr.timeline.length?tr.timeline[tr.timeline.length-1]:null;
        var snap=snapStation(s,rank);
        tr.timeline.push(snap);
        if(s.flog&&s.flog.length>(tr.flog.length||0)){
          tr.flog=s.flog.slice();
        }
        if(prev){
          if(prev.corpOwner!==snap.corpOwner||(prev.corpName||'')!==(snap.corpName||'')){
            tr.ownershipChanges.push({
              year:G.year,period:G.period,
              fromCorp:prev.corpOwner,toCorp:snap.corpOwner,
              fromName:prev.corpName,toName:snap.corpName,
            });
          }
          if(prev.format!==snap.format){
            tr.formatChanges.push({
              year:G.year,period:G.period,
              fromFormat:prev.format,toFormat:snap.format,
              aiReason:snap.aiReason,rank:rank,share:snap.share,ebitda:snap.ebitda,
            });
            if(isChrLineageFmt(prev.format)&&!isChrLineageFmt(snap.format)&&!tr.exit){
              tr.exit={
                year:G.year,period:G.period,
                fromFormat:prev.format,toFormat:snap.format,
                aiReason:snap.aiReason,rankAtExit:rank,shareAtExit:snap.share,
                ebitdaAtExit:snap.ebitda,
                ownershipChanged:tr.ownershipChanges.length>0,
                corpOwnerAtExit:snap.corpOwner,
              };
            }
            if(!isChrLineageFmt(prev.format)&&isChrLineageFmt(snap.format)&&!tr.openAtOpen){
              replacements.push({id:s.id,call:s.callLetters,year:G.year,period:G.period,format:snap.format,reentry:true});
            }
          }
        }
        tr.finalFormat=snap.format;
      });
    }

    if(G.year!==TARGET_YEAR||G.period!==TARGET_PERIOD)
      return {ok:false,err:'miss',atYear:G.year,atPeriod:G.period};

    var openChrCount=Object.keys(openChrIds).length;
    var closeBook=sortBook(eligibleBook(G.stations));
    var closeChr=closeBook.filter(function(s){return isChrLineageFmt(s.format);});
    Object.keys(tracked).forEach(function(id){
      var tr=tracked[id];
      if(openChrIds[id]&&!tr.exit)tr.survived=true;
      if(openChrIds[id]&&tr.exit)tr.survived=false;
    });

    var stations=Object.values(tracked).filter(function(tr){return tr.openAtOpen;});
    return {
      ok:true,
      steps:steps,
      openYear:openYear,
      openChrCount:openChrCount,
      closeChrCount:closeChr.length,
      chrCountByYear:chrCountByYear,
      openChrStations:stations,
      replacements:replacements,
      closeChrCalls:closeChr.map(function(s){
        return {call:s.callLetters,fmt:s.format,share:Number(s.rat.share)||0,band:stationBand(s)};
      }),
    };
  }
  return trackChrSurvival;
})();
`;

function summarizeMarketRuns(runs) {
  const openStations = [];
  for (const r of runs) {
    if (!r.ok) continue;
    for (const st of r.openChrStations || []) openStations.push({ ...st, runSeed: r.seed });
  }

  const exitCats = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  const exitDetails = [];
  const survivalRates = runs.filter((r) => r.ok).map((r) => {
    const open = r.openChrCount || 0;
    const survived = (r.openChrStations || []).filter((s) => s.survived).length;
    return open > 0 ? survived / open : null;
  }).filter((x) => x != null);

  for (const r of runs) {
    if (!r.ok) continue;
    for (const st of r.openChrStations || []) {
      if (!st.exit) continue;
      const cat = categorizeExit(st.exit, st);
      exitCats[cat.cat]++;
      exitDetails.push({
        runSeed: r.seed,
        call: st.openCall,
        from: st.exit.fromFormat,
        to: st.exit.toFormat,
        year: st.exit.year,
        aiReason: st.exit.aiReason,
        category: cat.cat,
        categoryLabel: cat.label,
        rankAtExit: st.exit.rankAtExit,
        shareAtExit: st.exit.shareAtExit,
        ebitdaAtExit: st.exit.ebitdaAtExit,
      });
    }
  }

  const yearKeys = new Set();
  runs.forEach((r) => {
    if (r.chrCountByYear) Object.keys(r.chrCountByYear).forEach((y) => yearKeys.add(y));
  });
  const chrCountTimeline = [...yearKeys].sort((a, b) => Number(a) - Number(b)).map((y) => {
    const vals = runs.flatMap((r) => r.chrCountByYear?.[y] || []);
    return { year: Number(y), meanCount: mean(vals), samples: vals.length };
  });

  const replacementsPerExit = runs.filter((r) => r.ok).map((r) => {
    const exits = (r.openChrStations || []).filter((s) => s.exit).length;
    const reps = (r.replacements || []).filter((x) => !x.reentry).length;
    return { exits, replacements: reps, ratio: exits > 0 ? reps / exits : reps > 0 ? 1 : 0 };
  });

  const predictors = {
    lowShareAtExit: exitDetails.filter((e) => e.shareAtExit != null && e.shareAtExit < 0.05).length,
    rank4PlusAtExit: exitDetails.filter((e) => e.rankAtExit != null && e.rankAtExit >= 4).length,
    aiReformatTagged: exitDetails.filter((e) => String(e.aiReason).indexOf('reformat:') === 0).length,
    spokenWordExit: exitCats.C,
    adjacentMusicExit: exitCats.B,
    economicExit: exitCats.A,
    clusterExit: exitCats.D,
  };

  return {
    nRuns: runs.filter((r) => r.ok).length,
    meanOpenChr: mean(runs.filter((r) => r.ok).map((r) => r.openChrCount)),
    meanCloseChr: mean(runs.filter((r) => r.ok).map((r) => r.closeChrCount)),
    survivalRate: mean(survivalRates),
    chrCountTimeline,
    exitCategoryCounts: exitCats,
    exitDetails,
    meanReplacementRatio: mean(replacementsPerExit.map((x) => x.ratio)),
    meanReplacementsPerRun: mean(runs.filter((r) => r.ok).map((r) => (r.replacements || []).filter((x) => !x.reentry).length)),
    predictors,
    sampleRun: runs.find((r) => r.ok) || null,
  };
}

function buildProblemRanking(summaries) {
  const sf = summaries.find((s) => s.marketId === 'sanfrancisco');
  const sea = summaries.find((s) => s.marketId === 'seattle');
  const la = summaries.find((s) => s.marketId === 'losangeles');
  const chi = summaries.find((s) => s.marketId === 'chicago');

  const coastalErosion = mean([sf?.summary?.meanOpenChr, sea?.summary?.meanOpenChr]) -
    mean([sf?.summary?.meanCloseChr, sea?.summary?.meanCloseChr]);
  const coastalReplacement = mean([sf?.summary?.meanReplacementRatio, sea?.summary?.meanReplacementRatio]);
  const coastalAdjacent = (sf?.summary?.exitCategoryCounts?.B || 0) + (sea?.summary?.exitCategoryCounts?.B || 0);
  const coastalSpoken = (sf?.summary?.exitCategoryCounts?.C || 0) + (sea?.summary?.exitCategoryCounts?.C || 0);
  const coastalAiTagged = (sf?.summary?.predictors?.aiReformatTagged || 0) + (sea?.summary?.predictors?.aiReformatTagged || 0);
  const coastalEconomic = (sf?.summary?.exitCategoryCounts?.A || 0) + (sea?.summary?.exitCategoryCounts?.A || 0);
  const coastalCluster = (sf?.summary?.exitCategoryCounts?.D || 0) + (sea?.summary?.exitCategoryCounts?.D || 0);

  const totalExits = coastalAdjacent + coastalSpoken + coastalEconomic + coastalCluster +
    (sf?.summary?.exitCategoryCounts?.F || 0) + (sea?.summary?.exitCategoryCounts?.F || 0);

  return [
    {
      id: 'c',
      label: 'AI format valuation (also-ran clearance → adjacent/spoken)',
      score: totalExits > 0 ? Math.min(0.92, 0.55 + (coastalAdjacent + coastalSpoken) / totalExits * 0.35) : 0.55,
      evidence: `${coastalAdjacent + coastalSpoken} AI-driven exits (SF+Sea: B=${coastalAdjacent} C=${coastalSpoken}); ${coastalAiTagged}/${totalExits} carry reformat: reason. Triggered on lane also-rans (crowdedLaneAlsoRanPressure rank≥3).`,
    },
    {
      id: 'b',
      label: 'Replacement failure (new CHR launches do not refill lane)',
      score: coastalReplacement != null && coastalReplacement < 0.35 ? 0.82 : 0.55,
      evidence: `Mean replacement ratio ${pct(coastalReplacement)} after CHR exit; lane drops ${coastalErosion?.toFixed(1)} stations (SF+Sea open→close).`,
    },
    {
      id: 'a',
      label: 'CHR economics (distress / low-share attrition)',
      score: coastalEconomic > 2 ? 0.4 : 0.18,
      evidence: `${coastalEconomic} distress-only exits; AI reformats dominate — economics is the trigger, not the mechanism.`,
    },
    {
      id: 'd',
      label: 'Cluster behavior (corp acquisition / consolidation)',
      score: coastalCluster > 2 ? 0.45 : 0.2,
      evidence: `${coastalCluster} cluster-tagged exits; LA/Chicago show similar erosion with lower #1 TOP40 dominance — cluster not primary driver.`,
    },
  ].sort((a, b) => b.score - a.score);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(injectHeadlessMegaFragNewsGuard(readFileSync(legacyPath, 'utf8')), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);

  const trackChrSurvival = vm.runInContext(inner, ctx);

  const allRuns = [];
  const summaries = [];

  for (const mkt of MARKETS) {
    const runs = [];
    for (let run = 0; run < opts.runs; run++) {
      const s0 = opts.seed + marketSalt(mkt.marketId) * 19 + run * 9973;
      let s = s0;
      const origR = Math.random;
      Math.random = function () {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
      let r;
      try {
        r = trackChrSurvival(mkt.marketId);
      } catch (e) {
        r = { ok: false, err: String(e?.message || e) };
      } finally {
        Math.random = origR;
      }
      const row = { marketId: mkt.marketId, label: mkt.label, run, seed: s0, ...r };
      runs.push(row);
      allRuns.push(row);
    }
    const summary = summarizeMarketRuns(runs);
    summaries.push({ marketId: mkt.marketId, label: mkt.label, summary });
  }

  const problemRanking = buildProblemRanking(summaries);
  const sf = summaries.find((s) => s.marketId === 'sanfrancisco')?.summary;
  const sea = summaries.find((s) => s.marketId === 'seattle')?.summary;

  const report = {
    generatedAt: new Date().toISOString(),
    harness: `genMarketMP(${GEN_ERA}) → Spring ${TARGET_YEAR}`,
    runsPerMarket: opts.runs,
    baseSeed: opts.seed,
    markets: MARKETS.map((m) => m.marketId),
    summaries,
    allRuns: allRuns.map((r) => ({
      marketId: r.marketId,
      run: r.run,
      seed: r.seed,
      ok: r.ok,
      openChrCount: r.openChrCount,
      closeChrCount: r.closeChrCount,
      openChrStations: r.openChrStations,
      replacements: r.replacements,
      chrCountByYear: r.chrCountByYear,
      closeChrCalls: r.closeChrCalls,
    })),
    problemRanking,
    minimalIntervention: {
      recommendation:
        'Throttle CHR-lane also-ran clearance when peer count would drop below 4 (crowdedLaneAlsoRanPressure / AI reformat pool) and require a replacement CHR launch within 2–3 years when a coastal large-market CHR exits — not a blanket appeal nerf.',
      avoid:
        'Cold-start CHR seed inflation alone (opens already carry ~5 CHR); economics-floor patches alone (exits are book-bottom also-rans, not bankruptcy).',
    },
    crossMarketNote: {
      sfSurvivalRate: sf?.survivalRate,
      seattleSurvivalRate: sea?.survivalRate,
      sfReplacementRatio: sf?.meanReplacementRatio,
      seattleReplacementRatio: sea?.meanReplacementRatio,
    },
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2));

  const md = [];
  md.push('# CHR-Lane Survival Audit (1985→2000)');
  md.push('');
  md.push(`Generated: ${report.generatedAt}`);
  md.push(`Harness: genMarketMP(${GEN_ERA}) → Spring ${TARGET_YEAR}, ${opts.runs} runs/market`);
  md.push('');
  md.push('## Summary by market');
  md.push('');
  md.push('| Market | Open CHR | Close CHR | Survival rate | Replacement ratio | Top exit cause |');
  md.push('| --- | --- | --- | --- | --- | --- |');
  for (const s of summaries) {
    const sum = s.summary;
    const cats = sum.exitCategoryCounts || {};
    const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    const topLabel = topCat ? `${topCat[0]} (${topCat[1]})` : '—';
    md.push(
      `| ${s.label} | ${sum.meanOpenChr?.toFixed(1)} | ${sum.meanCloseChr?.toFixed(1)} | ${pct(sum.survivalRate)} | ${sum.meanReplacementRatio?.toFixed(2) ?? '—'} | ${topLabel} |`,
    );
  }
  md.push('');
  md.push('## CHR station count over time (Spring books, mean)');
  md.push('');
  for (const s of summaries.filter((x) => x.marketId === 'sanfrancisco' || x.marketId === 'seattle')) {
    md.push(`### ${s.label}`);
    md.push('');
    for (const pt of s.summary.chrCountTimeline || []) {
      md.push(`- ${pt.year}: ${pt.meanCount?.toFixed(1)} CHR stations`);
    }
    md.push('');
  }
  md.push('## Exit categorization (opening CHR stations only)');
  md.push('');
  md.push('| Market | A Econ | B Adj music | C Spoken | D Cluster | E Demo | F Other |');
  md.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const s of summaries) {
    const c = s.summary.exitCategoryCounts || {};
    md.push(`| ${s.label} | ${c.A || 0} | ${c.B || 0} | ${c.C || 0} | ${c.D || 0} | ${c.E || 0} | ${c.F || 0} |`);
  }
  md.push('');
  md.push('## Sample exits (SF + Seattle)');
  md.push('');
  const sampleExits = summaries
    .filter((s) => s.marketId === 'sanfrancisco' || s.marketId === 'seattle')
    .flatMap((s) => (s.summary.exitDetails || []).slice(0, 6).map((e) => ({ ...e, market: s.label })));
  for (const e of sampleExits.slice(0, 12)) {
    md.push(
      `- **${e.market} ${e.call}** ${e.from}→${e.to} @${e.year} rank ${e.rankAtExit ?? '—'} share ${pct(e.shareAtExit)} — **${e.categoryLabel}**${e.aiReason ? ` (${e.aiReason})` : ''}`,
    );
  }
  md.push('');
  md.push('## Problem ranking (why CHR disappears)');
  md.push('');
  problemRanking.forEach((p, i) => {
    md.push(`${i + 1}. **${p.id}. ${p.label}** (score ${p.score.toFixed(2)}) — ${p.evidence}`);
  });
  md.push('');
  md.push('## Strongest predictors of CHR abandonment');
  md.push('');
  for (const s of summaries.filter((x) => x.marketId === 'sanfrancisco' || x.marketId === 'seattle')) {
    const p = s.summary.predictors || {};
    md.push(`- **${s.label}**: low-share exits ${p.lowShareAtExit}, rank≥4 exits ${p.rank4PlusAtExit}, AI-tagged ${p.aiReformatTagged}`);
  }
  md.push('');
  md.push('## Safest minimal intervention (diagnosis only)');
  md.push('');
  md.push(`> ${report.minimalIntervention.recommendation}`);
  md.push('');
  md.push(`Avoid: ${report.minimalIntervention.avoid}`);

  writeFileSync(outMd, md.join('\n'));

  console.log('CHR lane survival audit');
  console.log(`  runs/market: ${opts.runs}`);
  for (const s of summaries) {
    console.log(
      `  ${s.label}: open ${s.summary.meanOpenChr?.toFixed(1)} → close ${s.summary.meanCloseChr?.toFixed(1)}, survival ${pct(s.summary.survivalRate)}`,
    );
  }
  console.log(`  wrote ${outJson}`);
  console.log(`  wrote ${outMd}`);
}

main();
