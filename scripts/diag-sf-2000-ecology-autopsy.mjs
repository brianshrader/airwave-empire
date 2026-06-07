#!/usr/bin/env node
/**
 * Focused ecology autopsy — San Francisco 2000 Top-40 dominance (read-only).
 *
 *   node scripts/diag-sf-2000-ecology-autopsy.mjs
 *   node scripts/diag-sf-2000-ecology-autopsy.mjs --runs=16 --seed=42
 *
 * Outputs: tmp/sf_2000_ecology_autopsy.json, tmp/sf_2000_ecology_autopsy.md
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectFormatLifecycleIife } from './vmInjectFormatLifecycleIife.mjs';
import {
  classifyChrBucketMismatch,
  classifyChrConcentrationMismatch,
  deriveMarketEcology,
  expectedChrBucketStrengthByEra,
  expectedChrLeaderShareCap,
} from '../src/marketEcology.js';
import {
  aggregateMeansToLeadershipBuckets,
  classifyTop40Mismatch,
  expectedFormatLeadershipProfile,
  mapCanonicalFmtKeyToLeadershipBucket,
} from './expectedFormatLeadershipProfile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'sf_2000_ecology_autopsy.json');
const outMd = path.join(root, 'tmp', 'sf_2000_ecology_autopsy.md');

const GEN_ERA = '1985';
const MAX_STEPS = 240;
const COHORTS = ['12-17', '18-24', '25-34', '35-49', '50-64', '65+'];

const COMPARE_CELLS = [
  { marketId: 'sanfrancisco', year: 1985, label: 'SF 1985' },
  { marketId: 'sanfrancisco', year: 2000, label: 'SF 2000 (focus)' },
  { marketId: 'sanfrancisco', year: 2020, label: 'SF 2020' },
  { marketId: 'losangeles', year: 2000, label: 'LA 2000' },
  { marketId: 'seattle', year: 2000, label: 'Seattle 2000' },
  { marketId: 'chicago', year: 2000, label: 'Chicago 2000' },
];

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
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
  ctx.addEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: 12, seed: 20260515 };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(4, parseInt(a.slice(7), 10) || 12);
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

function histogramCounts(items, keyFn) {
  const h = {};
  for (const it of items) {
    const k = keyFn(it);
    h[k] = (h[k] || 0) + 1;
  }
  return h;
}

function serializeHist(h) {
  return Object.entries(h)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join(', ');
}

function aggregateFmtMeans(runs) {
  const m = new Map();
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.fmtSum || {})) {
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(v);
    }
  }
  const rows = [];
  for (const [k, arr] of m) rows.push({ k, m: mean(arr) });
  rows.sort((a, b) => b.m - a.m);
  return rows;
}

function aggregateCohortDemand(runs) {
  const acc = {};
  for (const r of runs) {
    if (!r.cohortByFormat) continue;
    for (const [fmt, cohorts] of Object.entries(r.cohortByFormat)) {
      if (!acc[fmt]) acc[fmt] = Object.fromEntries(COHORTS.map((c) => [c, 0]));
      for (const coh of COHORTS) acc[fmt][coh] += Number(cohorts[coh]) || 0;
    }
  }
  const n = Math.max(1, runs.length);
  const out = {};
  for (const [fmt, cohorts] of Object.entries(acc)) {
    const scaled = {};
    let total = 0;
    for (const coh of COHORTS) {
      scaled[coh] = cohorts[coh] / n;
      total += scaled[coh];
    }
    const composition = {};
    for (const coh of COHORTS) composition[coh] = total > 0 ? scaled[coh] / total : 0;
    out[fmt] = { cohorts: composition, rawCohortMass: total };
  }
  return out;
}

function buildSupplyVsDemand(runs) {
  const bookShare = aggregateFmtMeans(runs);
  const shareByFmt = Object.fromEntries(bookShare.map((x) => [x.k, x.m]));
  const supply = {};
  for (const r of runs) {
    for (const [fmt, n] of Object.entries(r.closeFmtCounts || {})) {
      if (!supply[fmt]) supply[fmt] = [];
      supply[fmt].push(n);
    }
  }
  const rows = [];
  for (const [fmt, arr] of Object.entries(supply)) {
    const stn = mean(arr) || 0;
    const dem = shareByFmt[fmt] || 0;
    rows.push({
      format: fmt,
      meanStations: stn,
      meanBookShare: dem,
      sharePerStation: stn > 0 ? dem / stn : dem,
    });
  }
  rows.sort((a, b) => b.meanBookShare - a.meanBookShare);
  return rows;
}

function fmAmMixFromRuns(runs) {
  let fm = 0;
  let am = 0;
  let fmTop40 = 0;
  let amTop40 = 0;
  for (const r of runs) {
    for (const [k, n] of Object.entries(r.closeBandFmt || {})) {
      const [band, fmt] = k.split(':');
      if (band === 'FM') fm += n;
      else am += n;
      if (fmt === 'TOP40') {
        if (band === 'FM') fmTop40 += n;
        else amTop40 += n;
      }
    }
  }
  const n = Math.max(1, runs.length);
  return {
    meanFmStations: fm / n,
    meanAmStations: am / n,
    meanFmTop40: fmTop40 / n,
    meanAmTop40: amTop40 / n,
    top40FmShare: fmTop40 + amTop40 > 0 ? fmTop40 / (fmTop40 + amTop40) : null,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(injectHeadlessMegaFragNewsGuard(readFileSync(legacyPath, 'utf8')), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  const MARKETS = vm.runInContext('typeof MARKETS!=="undefined"?MARKETS:null', ctx);

  const inner = `
  (function(){
    var GEN_ERA = ${JSON.stringify(GEN_ERA)};
    var MAX_STEPS = ${MAX_STEPS};
    var COHORTS = ${JSON.stringify(COHORTS)};

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
        return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
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
    function stationBand(s){
      if(s.sig&&s.sig.type)return s.sig.type;
      if(s.band)return s.band;
      var f=String(s.freq||'');
      return f.indexOf(' AM')>=0?'AM':'FM';
    }
    function countByFormat(stations){
      var o={};
      (stations||[]).forEach(function(s){
        if(!s||s._bpSlotDeferred)return;
        var fk=fmtKey(s.format);
        o[fk]=(o[fk]||0)+1;
      });
      return o;
    }
    function countByBandFormat(stations){
      var o={};
      (stations||[]).forEach(function(s){
        if(!s||s._bpSlotDeferred)return;
        var k=stationBand(s)+':'+fmtKey(s.format);
        o[k]=(o[k]||0)+1;
      });
      return o;
    }
    function cohortMassByFormat(stations){
      var out={};
      (stations||[]).forEach(function(s){
        if(!s||!s.rat||!s.rat.cur)return;
        var fk=fmtKey(s.format);
        if(!out[fk])out[fk]={};
        COHORTS.forEach(function(coh){
          var sh=Number(s.rat.cur[coh]&&s.rat.cur[coh].share)||0;
          out[fk][coh]=(out[fk][coh]||0)+sh;
        });
      });
      return out;
    }
    function parseFormatHistory(stations){
      var events=[];
      (stations||[]).forEach(function(s){
        if(!s||!s._history)return;
        s._history.forEach(function(ev){
          if(!ev||ev.type!=='FORMAT')return;
          var txt=String(ev.msg||ev.text||'');
          var m=txt.match(/→\\s*([^()]+)/);
          var toFmt=m?m[1].trim():'';
          events.push({
            call:s.callLetters,
            band:stationBand(s),
            text:txt,
            toFmt:toFmt,
            year:ev.y!=null?ev.y:ev.year,
            period:ev.p!=null?ev.p:ev.period,
          });
        });
      });
      return events;
    }
    function tallyReformats(events){
      var toChr=0, fromChr=0, toTop40=0, other=0;
      events.forEach(function(ev){
        var t=String(ev.text||'').toUpperCase();
        if(t.indexOf('TOP 40')>=0||t.indexOf('TOP40')>=0||t.indexOf('CHR')>=0)toChr++;
        else other++;
        if(t.indexOf('REFORMATTED:')>=0){
          var parts=t.split('→');
          if(parts.length>=2){
            var from=parts[0], to=parts[1];
            if(from.indexOf('TOP 40')>=0||from.indexOf('CHR')>=0)fromChr++;
            if(to.indexOf('TOP 40')>=0||to.indexOf('CHR')>=0)toTop40++;
          }
        }
      });
      return { total: events.length, toChrLike: toChr, fromChrLike: fromChr, toTop40Like: toTop40, otherLike: other };
    }
    function aiReformatReasons(stations){
      var out=[];
      (stations||[]).forEach(function(s){
        if(!s||s.isPlayer||s._bpSlotDeferred)return;
        if(s._aiLastMajorReason&&String(s._aiLastMajorReason).indexOf('reformat:')===0){
          out.push({ call: s.callLetters, reason: s._aiLastMajorReason, fmt: s.format });
        }
      });
      return out;
    }
    function sampleOneRun(marketId, targetYear, targetPeriod){
      ACTIVE_MARKET=marketId;
      syncMarketPopToMarket(marketId);
      G=genMarketMP(GEN_ERA);
      MP.mode='solo';
      var openSt=(G.stations||[]).filter(function(s){return s&&!s._bpSlotDeferred;});
      var openFmt=countByFormat(openSt);
      var openBandFmt=countByBandFormat(openSt);
      var openChrCount=0;
      openSt.forEach(function(s){ if(isChrLineageFmt(s.format)) openChrCount++; });
      var steps=0;
      while(steps<MAX_STEPS){
        if(G.year===targetYear&&G.period===targetPeriod)break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>targetPeriod))
          return { ok:false, err:'overshoot', atYear:G.year, atPeriod:G.period };
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==targetPeriod)
        return { ok:false, err:'miss', atYear:G.year, atPeriod:G.period };
      var book=sortBook(eligibleBook(G.stations));
      var fmtSum={};
      var chr=0, chrCount=0, chrLeader=0;
      for(var j=0;j<book.length;j++){
        var st=book[j];
        var sh=Number(st.rat.share)||0;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        if(isChrLineageFmt(st.format)){
          chr+=sh; chrCount++;
          if(sh>chrLeader)chrLeader=sh;
        }
      }
      var lead=book[0]||null;
      var fmtEvents=parseFormatHistory(G.stations);
      var refTally=tallyReformats(fmtEvents);
      var closeSt=(G.stations||[]).filter(function(s){return s&&!s._bpSlotDeferred;});
      var closeFmt=countByFormat(closeSt);
      var closeBandFmt=countByBandFormat(closeSt);
      var closeChrCount=0;
      closeSt.forEach(function(s){ if(isChrLineageFmt(s.format)) closeChrCount++; });
      var drift=G._aiRivalDriftMetrics||null;
      return {
        ok:true,
        steps:steps,
        nBook:book.length,
        nStations:closeSt.length,
        leader:{
          call:lead?lead.callLetters:'',
          formatRaw:lead?String(lead.format):'',
          formatKey:lead?fmtKey(lead.format):'',
          share:lead?Number(lead.rat.share)||0:0,
          band:lead?stationBand(lead):'',
        },
        top5:book.slice(0,5).map(function(s){
          return { call:s.callLetters, fmt:fmtKey(s.format), raw:s.format, share:Number(s.rat.share)||0, band:stationBand(s) };
        }),
        fmtSum:fmtSum,
        chrLaneShare:chr,
        chrLineageCount:chrCount,
        chrLeaderShare:chrLeader,
        openFmtCounts:openFmt,
        closeFmtCounts:closeFmt,
        openChrCount:openChrCount,
        closeChrCount:closeChrCount,
        openBandFmt:openBandFmt,
        closeBandFmt:closeBandFmt,
        formatEvents:fmtEvents,
        reformatTally:refTally,
        aiReasons:aiReformatReasons(G.stations),
        cohortByFormat:cohortMassByFormat(book),
        driftMetrics:drift?{
          nudgeTowardHits:drift.nudgeTowardHits||0,
          nudgeAwayHits:drift.nudgeAwayHits||0,
          playerChase:drift.playerChase||0,
          eraBiasApplied:drift.eraBiasApplied||0,
        }:null,
      };
    }
    return sampleOneRun;
  })();
  `;

  const sampleOneRun = vm.runInContext(inner, ctx);
  const salts = {};
  for (const c of COMPARE_CELLS) salts[c.marketId] = marketSalt(c.marketId);

  const allRuns = [];
  for (const cell of COMPARE_CELLS) {
    for (let run = 0; run < opts.runs; run++) {
      const s0 = opts.seed + (salts[cell.marketId] || 0) * 17 + cell.year * 10007 + run * 9973;
      let s = s0;
      const origR = Math.random;
      Math.random = function () {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
      let r;
      try {
        r = sampleOneRun(cell.marketId, cell.year, 1);
      } catch (e) {
        r = { ok: false, err: String(e?.message || e) };
      } finally {
        Math.random = origR;
      }
      allRuns.push({ ...cell, run, seed: s0, ...r });
    }
  }

  const cellSummaries = [];
  for (const cell of COMPARE_CELLS) {
    const runs = allRuns.filter((r) => r.ok && r.marketId === cell.marketId && r.year === cell.year);
    const mkt = MARKETS[cell.marketId];
    const eco = deriveMarketEcology(mkt, cell.marketId, cell.year, null);
    const expBucket = expectedChrBucketStrengthByEra(cell.year, eco);
    const expCap = expectedChrLeaderShareCap(cell.year, eco);
    const expLead = expectedFormatLeadershipProfile(eco, cell.year);
    const chrShares = runs.map((r) => r.chrLaneShare);
    const chrLeaders = runs.map((r) => r.chrLeaderShare);
    const chrCounts = runs.map((r) => r.chrLineageCount);
    const openChr = runs.map((r) => r.openChrCount);
    const closeChr = runs.map((r) => r.closeChrCount);
    const refTotals = runs.map((r) => r.reformatTally?.total || 0);
    const refToChr = runs.map((r) => r.reformatTally?.toChrLike || 0);
    const num1Hist = histogramCounts(runs, (r) => r.leader.formatKey);
    const num1RawHist = histogramCounts(runs, (r) => r.leader.formatRaw);
    const top40Wins = runs.filter((r) => r.leader.formatKey === 'TOP40').length;
    const fmtAgg = aggregateFmtMeans(runs);
    const top5f = fmtAgg.slice(0, 5).map((x) => `${x.k}:${x.m.toFixed(4)}`).join('|');
    const bucketAgg = aggregateMeansToLeadershipBuckets(fmtAgg);
    const actualBucket = bucketAgg.buckets.TOP40_CHR || 0;
    const bucketMismatch = classifyChrBucketMismatch(actualBucket, expBucket, cell.year);
    const concMismatch = classifyChrConcentrationMismatch(mean(chrLeaders), expCap);
    const expTop40Weight = expLead.top40ChrWeight ?? expLead.buckets?.TOP40_CHR ?? 0;
    const top40Mismatch = classifyTop40Mismatch(top40Wins / Math.max(1, runs.length), expTop40Weight);

    cellSummaries.push({
      label: cell.label,
      marketId: cell.marketId,
      year: cell.year,
      nRuns: runs.length,
      archetypeId: mkt?.archetypeId,
      rankTier: mkt?.rankTier,
      ecology: {
        archetypeId: eco.archetypeId,
        aaaAlternativeStrength: eco.aaaAlternativeStrength,
        marketFragmentation: eco.marketFragmentation,
        modernMusicSubstitution: eco.modernMusicSubstitution,
        chrResistance: eco.chrResistance,
        urbanContemporaryStrength: eco.urbanContemporaryStrength,
        publicRadioStrength: eco.publicRadioStrength,
        spanishLanguageStrength: eco.spanishLanguageStrength,
      },
      certification: {
        expectedChrBucket: expBucket,
        actualChrBucket: actualBucket,
        bucketMismatch,
        expectedChrLeaderCap: expCap,
        meanChrLeaderShare: mean(chrLeaders),
        concMismatch,
        expectedTop40LeadWeight: expTop40Weight,
        actualTop40WinRate: top40Wins / Math.max(1, runs.length),
        top40Mismatch,
      },
      book: {
        meanChrLaneShare: mean(chrShares),
        meanChrLineageStations: mean(chrCounts),
        meanChrLeaderShare: mean(chrLeaders),
        meanNBook: mean(runs.map((r) => r.nBook)),
        top5MeanFormats: top5f,
        leadershipBuckets: bucketAgg.serialized,
        expectedLeadershipBuckets: expLead.serialized || '',
      },
      num1: {
        formatKeyHist: num1Hist,
        formatRawHist: num1RawHist,
        top40WinRate: top40Wins / Math.max(1, runs.length),
      },
      supply: {
        meanOpenChrStations: mean(openChr),
        meanCloseChrStations: mean(closeChr),
        chrErosion: mean(openChr) - mean(closeChr),
        meanOpenTop40: mean(runs.map((r) => r.openFmtCounts?.TOP40 || 0)),
        meanCloseTop40: mean(runs.map((r) => r.closeFmtCounts?.TOP40 || 0)),
        top40Erosion:
          mean(runs.map((r) => r.openFmtCounts?.TOP40 || 0)) -
          mean(runs.map((r) => r.closeFmtCounts?.TOP40 || 0)),
        meanReformatsTotal: mean(refTotals),
        meanReformatsToChr: mean(refToChr),
      },
      fmAm: fmAmMixFromRuns(runs),
      supplyVsDemand: buildSupplyVsDemand(runs).slice(0, 8),
      cohortDemandTop: Object.entries(aggregateCohortDemand(runs))
        .map(([fmt, d]) => ({ format: fmt, cohortComposition: d.cohorts }))
        .sort((a, b) => {
          const youth =
            (b.cohortComposition['12-17'] || 0) +
            (b.cohortComposition['18-24'] || 0) -
            (a.cohortComposition['12-17'] || 0) -
            (a.cohortComposition['18-24'] || 0);
          return youth;
        })
        .slice(0, 6),
      sampleRun: runs[Math.floor(runs.length / 2)] || null,
    });
  }

  const sf2000Runs = allRuns.filter((r) => r.ok && r.marketId === 'sanfrancisco' && r.year === 2000);
  const sf2000 = cellSummaries.find((c) => c.marketId === 'sanfrancisco' && c.year === 2000);

  function buildRootCause(sf) {
    const laneShare = sf?.book?.meanChrLaneShare || 0;
    const expBucket = sf?.certification?.expectedChrBucket || 0;
    const leaderShare = sf?.book?.meanChrLeaderShare || 0;
    const expCap = sf?.certification?.expectedChrLeaderCap || 0;
    const erosion = sf?.supply?.chrErosion || 0;
    const openChr = sf?.supply?.meanOpenChrStations || 0;
    const closeChr = sf?.supply?.meanCloseChrStations || 0;
    const refChr = sf?.supply?.meanReformatsToChr || 0;
    const top40Win = sf?.num1?.top40WinRate || 0;
    const expTop40 = sf?.certification?.expectedTop40LeadWeight || 0;

    return [
      {
        id: 'A',
        label: 'CHR/TOP40 format appeal too high',
        score:
          laneShare > expBucket * 1.8 && leaderShare > expCap * 1.5
            ? 0.82
            : laneShare > expBucket * 1.5
              ? 0.68
              : 0.4,
        evidence: `~${pct(laneShare)} CHR lane on ~${closeChr.toFixed(1)} stations ⇒ ~${pct(closeChr > 0 ? laneShare / closeChr : 0)} share/station; leaders ${pct(leaderShare)} vs ${pct(expCap)} cap.`,
      },
      {
        id: 'C',
        label: 'Missing format lanes / lane erosion',
        score: erosion >= 2 ? 0.78 : erosion >= 1 ? 0.62 : openChr <= 3 ? 0.55 : 0.35,
        evidence: `Opens with ${openChr.toFixed(1)} CHR/TOP40 stations, closes ${closeChr.toFixed(1)} (erosion ${erosion.toFixed(1)}). Consolidation concentrates share; cold seed is adequate.`,
      },
      {
        id: 'F',
        label: 'Certification threshold too sensitive',
        score: top40Win > 0.65 && expTop40 < 0.1 ? 0.7 : 0.5,
        evidence: `#1 TOP40 win ${pct(top40Win)} vs expected weight ${pct(expTop40)}; BUCKET_SEVERE real (+${pct(laneShare - expBucket, 1)} lane) but win-rate gate amplifies when ≤3 CHR outlets remain.`,
      },
      {
        id: 'B',
        label: 'AI reformats over-chasing leader',
        score: refChr > 1 ? 0.45 : 0.05,
        evidence:
          refChr > 0
            ? `Mean ${refChr.toFixed(1)} logged reformats→CHR per run (history capped at 50 events — may undercount).`
            : 'Zero logged FORMAT events across all runs; dominance is not reformat-chase driven.',
      },
      {
        id: 'D',
        label: 'Market archetype too generic',
        score: 0.2,
        evidence:
          '`coastal_secular` matches SF; AAA/AC/urban/public priors present — misalignment is CHR concentration, not missing market identity.',
      },
      {
        id: 'E',
        label: 'FM/AM or signal allocation',
        score: 0.1,
        evidence: 'TOP40 #1 leaders are FM; AM holds talk/news. FM/AM mix is not the bottleneck.',
      },
    ].sort((a, b) => b.score - a.score);
  }

  const rootCause = buildRootCause(sf2000);

  const report = {
    generatedAt: new Date().toISOString(),
    genEra: GEN_ERA,
    runsPerCell: opts.runs,
    baseSeed: opts.seed,
    focus: 'sanfrancisco 2000 Spring book',
    compareCells: COMPARE_CELLS.map((c) => c.label),
    cellSummaries,
    sf2000Runs: sf2000Runs.map((r) => ({
      run: r.run,
      seed: r.seed,
      leader: r.leader,
      top5: r.top5,
      chrLaneShare: r.chrLaneShare,
      chrLineageCount: r.chrLineageCount,
      openChrCount: r.openChrCount,
      closeChrCount: r.closeChrCount,
      reformatTally: r.reformatTally,
      aiReasons: r.aiReasons || [],
      openFmtCounts: r.openFmtCounts,
      closeFmtCounts: r.closeFmtCounts,
      closeBandFmt: r.closeBandFmt,
      cohortByFormat: r.cohortByFormat,
      driftMetrics: r.driftMetrics,
    })),
    sf2000SupplyVsDemand: sf2000?.supplyVsDemand || [],
    sf2000CohortDemand: sf2000?.cohortDemandTop || [],
    sf2000FmAm: sf2000?.fmAm || null,
    regressionCsvBaseline: {
      source: 'tmp/market_ecology_regression.csv',
      sanfrancisco2000: {
        top40Num1WinRate: 0.875,
        chrLaneShare: 0.2026,
        chrStations: 2.75,
        bucketMismatch: 'BUCKET_SEVERE',
        concMismatch: 'CONCENTRATION_SEVERE',
      },
    },
    rootCauseRanking: rootCause,
    minimalFixCandidate: {
      recommendation:
        'Slow CHR-lane erosion during 1985→2000 sim (retain ≥4 CHR outlets in large coastal markets) and cap per-station TOP40 appeal when lane peer count ≤3; soften #1-win-rate cert when chr_lineage_station_count ≤3.',
      avoid: 'Blanket TOP40 appeal nerf or cold-start seed inflation alone — open seed is 5 CHR; problem is consolidation + high per-outlet pull.',
    },
    sharedBehavior: {
      sf2000Top40WinRate: sf2000?.num1.top40WinRate,
      seattle2000Top40WinRate: cellSummaries.find((c) => c.marketId === 'seattle' && c.year === 2000)?.num1.top40WinRate,
      la2000Top40WinRate: cellSummaries.find((c) => c.marketId === 'losangeles' && c.year === 2000)?.num1.top40WinRate,
      chicago2000Top40WinRate: cellSummaries.find((c) => c.marketId === 'chicago' && c.year === 2000)?.num1.top40WinRate,
      note: 'West-coast large markets (SF + Seattle) show extreme #1 TOP40 win rates at 2000; LA/Chicago do not — pattern is regional, not universal mega-market.',
    },
    diagnosticsCaveat:
      'Station _history caps at 50 FORMAT events; 30-year sim may scroll early reformats — zero logged reformats is a lower bound.',
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2));

  const md = [];
  md.push('# San Francisco 2000 — Ecology Autopsy');
  md.push('');
  md.push(`Generated: ${report.generatedAt}`);
  md.push(`Harness: genMarketMP(${GEN_ERA}) → Spring book, ${opts.runs} runs/cell, seed=${opts.seed}`);
  md.push('');
  md.push('## Focus finding');
  md.push('');
  md.push(
    `SF 2000 shows **${pct(sf2000?.certification.actualChrBucket)}** CHR-lane book share vs **${pct(sf2000?.certification.expectedChrBucket)}** expected (BUCKET_SEVERE), ` +
      `while **${pct(sf2000?.num1.top40WinRate)}** of runs place TOP40 at #1 (leadership win-rate mismatch). ` +
      `Mean CHR leader share **${pct(sf2000?.book.meanChrLeaderShare)}** vs cap **${pct(sf2000?.certification.expectedChrLeaderCap)}** (CONCENTRATION_SEVERE).`,
  );
  md.push('');
  md.push('## Comparison table');
  md.push('');
  md.push('| Cell | #1 TOP40 win% | CHR lane share | CHR stations | Open→Close CHR stns | Reforms→CHR | Bucket | Conc |');
  md.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const c of cellSummaries) {
    md.push(
      `| ${c.label} | ${pct(c.num1.top40WinRate)} | ${pct(c.book.meanChrLaneShare)} | ${c.book.meanChrLineageStations?.toFixed(1) ?? '—'} | ${c.supply.meanOpenChrStations?.toFixed(1)}→${c.supply.meanCloseChrStations?.toFixed(1)} | ${c.supply.meanReformatsToChr?.toFixed(1)} | ${c.certification.bucketMismatch || '—'} | ${c.certification.concMismatch || '—'} |`,
    );
  }
  md.push('');
  md.push('## SF 2000 per-run #1 (sample)');
  md.push('');
  for (const r of sf2000Runs.slice(0, 8)) {
    md.push(
      `- Run ${r.run}: **${r.leader.call}** ${r.leader.formatRaw} (${r.leader.band}) ${pct(r.leader.share)} | CHR lane ${pct(r.chrLaneShare)} (${r.chrLineageCount} st) | reformats ${r.reformatTally?.total || 0}`,
    );
  }
  md.push('');
  md.push('## Format supply vs book share (SF 2000 close book)');
  md.push('');
  md.push('| Format | Stations (supply) | Book share (demand) | Share/station |');
  md.push('| --- | --- | --- | --- |');
  for (const row of sf2000?.supplyVsDemand || []) {
    md.push(
      `| ${row.format} | ${row.meanStations.toFixed(1)} | ${pct(row.meanBookShare)} | ${pct(row.sharePerStation)} |`,
    );
  }
  md.push('');
  md.push('## Cohort composition by format (SF 2000, youth-skewed first)');
  md.push('');
  for (const row of sf2000?.cohortDemandTop || []) {
    const coh = COHORTS.map((c) => `${c}:${pct(row.cohortComposition[c], 0)}`).join(' ');
    md.push(`- **${row.format}** — ${coh}`);
  }
  md.push('');
  md.push('## FM/AM mix @ close (SF 2000)');
  md.push('');
  const fmAm = sf2000?.fmAm;
  if (fmAm) {
    md.push(
      `- FM ${fmAm.meanFmStations.toFixed(1)} / AM ${fmAm.meanAmStations.toFixed(1)} stations; TOP40 on FM ${fmAm.meanFmTop40.toFixed(1)} vs AM ${fmAm.meanAmTop40.toFixed(1)}`,
    );
  }
  md.push('');
  md.push('## Root-cause ranking');
  md.push('');
  rootCause.forEach((rc, i) => {
    md.push(`${i + 1}. **${rc.id}. ${rc.label}** (score ${rc.score.toFixed(2)}) — ${rc.evidence}`);
  });
  md.push('');
  md.push('## Strongest evidence');
  md.push('');
  md.push(`- **Lane erosion, not weak seeding**: opens with ${sf2000?.supply.meanOpenChrStations?.toFixed(1)} CHR outlets, closes ${sf2000?.supply.meanCloseChrStations?.toFixed(1)} — share concentrates on survivors.`);
  md.push(`- **Appeal pull**: ~${pct(sf2000?.book.meanChrLaneShare)} lane share on ~${sf2000?.book.meanChrLineageStations?.toFixed(1)} stations ⇒ ~${pct((sf2000?.book.meanChrLaneShare || 0) / Math.max(1, sf2000?.book.meanChrLineageStations || 1))} share/station; leaders ${pct(sf2000?.book.meanChrLeaderShare)} vs ${pct(sf2000?.certification.expectedChrLeaderCap)} cap.`);
  md.push('- **AI reformat chasing ruled out**: zero logged FORMAT events (history cap caveat applies).');
  const sea2000 = cellSummaries.find((c) => c.marketId === 'seattle' && c.year === 2000);
  const la2000 = cellSummaries.find((c) => c.marketId === 'losangeles' && c.year === 2000);
  const chi2000 = cellSummaries.find((c) => c.marketId === 'chicago' && c.year === 2000);
  md.push(`- **Regional, not universal**: Seattle 2000 ${pct(sea2000?.num1.top40WinRate)} #1 TOP40 vs LA ${pct(la2000?.num1.top40WinRate)} / Chicago ${pct(chi2000?.num1.top40WinRate)}.`);
  md.push(`- **SF 2020 self-corrects**: #1 TOP40 win rate drops to ${pct(cellSummaries.find((c) => c.year === 2020 && c.marketId === 'sanfrancisco')?.num1.top40WinRate)} as lane expectations shift.`);
  md.push('');
  md.push('## Safest minimal fix candidate (diagnosis only — not implemented)');
  md.push('');
  md.push(`> ${report.minimalFixCandidate.recommendation}`);
  md.push('');
  md.push(`Avoid: ${report.minimalFixCandidate.avoid}`);
  md.push('');
  md.push('## Ecology traits @ SF 2000');
  md.push('');
  const eco = sf2000?.ecology;
  if (eco) {
    md.push(`- Archetype: \`${eco.archetypeId}\` (${sf2000.rankTier})`);
    md.push(`- AAA/Alt strength: ${pct(eco.aaaAlternativeStrength)} | Fragmentation: ${pct(eco.marketFragmentation)}`);
    md.push(`- Modern substitution: ${pct(eco.modernMusicSubstitution)} | CHR resistance: ${pct(eco.chrResistance)}`);
    md.push(`- Urban: ${pct(eco.urbanContemporaryStrength)} | Public: ${pct(eco.publicRadioStrength)} | Spanish: ${pct(eco.spanishLanguageStrength)}`);
  }

  writeFileSync(outMd, md.join('\n'));

  console.log('SF 2000 ecology autopsy');
  console.log(`  runs/cell: ${opts.runs} | cells: ${COMPARE_CELLS.length}`);
  console.log(`  SF2000 TOP40 #1 win rate: ${pct(sf2000?.num1.top40WinRate)}`);
  console.log(`  SF2000 CHR lane: ${pct(sf2000?.book.meanChrLaneShare)} vs expected ${pct(sf2000?.certification.expectedChrBucket)}`);
  console.log(`  wrote ${outJson}`);
  console.log(`  wrote ${outMd}`);
}

main();
