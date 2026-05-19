#!/usr/bin/env node
/**
 * Market ecology regression harness — format mix + concentration + lane shares.
 * Cold start: genMarketMP(era) → advTurn to target Spring book (same harness as tier concentration diag).
 *
 *   node scripts/diag-market-ecology-regression.mjs
 *   node scripts/diag-market-ecology-regression.mjs --runs=10 --seed=42
 *
 * CSV: tmp/market_ecology_regression.csv
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
} from './expectedFormatLeadershipProfile.mjs';
import {
  describeSpanishLanguageBucket,
  isSpanishLanguageFormat,
  SPANISH_LANGUAGE_FORMAT_IDS,
  SPANISH_LANGUAGE_FORMAT_PREFIXES,
} from './spanishLanguageFormats.mjs';
import { SPANISH_BOOK_STATIONS_SNIPPET } from './spanishSubtypeHelpers.mjs';
import {
  describeSpanishSubtypeCatalog,
  enrichSpanishSubtypeOnRows,
  formatSpanishSubtypeBlock,
  meanSpanishSubtypeAcrossRuns,
} from './spanishSubtypeDiagnostics.mjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS, DIAG_ONLY_MARKET_IDS } = require('./market-ids.cjs');

function joinMismatchFlags(...flags) {
  return flags.filter(Boolean).join('|');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outCsv = path.join(root, 'tmp', 'market_ecology_regression.csv');

const DEFAULT_MARKETS = [
  'seattle',
  'sanfrancisco',
  'losangeles',
  'newyork',
  'chicago',
  'atlanta',
  'nashville',
  'wichita',
];
const DEFAULT_YEARS = [1995, 2000, 2006, 2010, 2020, 2026];

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function loadLegacySrc() {
  let src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  return injectHeadlessMegaFragNewsGuard(src);
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
    querySelector() {
      return null;
    },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    getAttribute() {
      return null;
    },
    setAttribute() {},
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() {
    return stubEl();
  },
  getElementById() {
    return stubEl();
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
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
    setInterval() {
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class {
      constructor() {}
    },
    FileReader: class {
      readAsText() {}
    },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) {
          typedArray[i] = Math.floor(Math.random() * 256);
        }
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
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

function parseCsvList(s, fallback) {
  if (!s || !String(s).trim()) return fallback.slice();
  return String(s)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const VALID_GEN_ERAS = ['1970', '1978', '1985'];
const DEFAULT_MAX_STEPS_BY_ERA = { '1970': 340, '1978': 300, '1985': 240 };

function parseArgs(argv) {
  let maxStepsExplicit = false;
  const o = {
    markets: DEFAULT_MARKETS,
    years: DEFAULT_YEARS,
    period: 1,
    runs: 8,
    seed: 20260515,
    maxSteps: null,
    era: '1985',
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) o.markets = parseCsvList(a.slice('--markets='.length), DEFAULT_MARKETS);
    else if (a.startsWith('--years=')) {
      o.years = parseCsvList(a.slice('--years='.length), DEFAULT_YEARS)
        .map((x) => parseInt(x, 10))
        .filter((n) => !Number.isNaN(n));
    } else if (a.startsWith('--period=')) o.period = parseInt(a.slice('--period='.length), 10) || 1;
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice('--runs='.length), 10) || 8);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice('--seed='.length), 10) || o.seed;
    else if (a.startsWith('--maxSteps=')) {
      maxStepsExplicit = true;
      o.maxSteps = Math.max(40, parseInt(a.slice('--maxSteps='.length), 10) || 240);
    } else if (a.startsWith('--era=')) {
      o.era = String(a.slice('--era='.length)).trim();
    }
  }
  const e = String(o.era || '').trim();
  if (!VALID_GEN_ERAS.includes(e)) {
    throw new Error(`--era must be one of ${VALID_GEN_ERAS.join(', ')} (got ${JSON.stringify(o.era)})`);
  }
  o.era = e;
  if (o.maxSteps == null || !maxStepsExplicit) {
    o.maxSteps = maxStepsExplicit ? o.maxSteps : DEFAULT_MAX_STEPS_BY_ERA[o.era] ?? 240;
  }
  return o;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function mean(xs) {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Phoenix / Spanish investigation — per-market station + share breakdown. */
function printSpanishMarketDiagnostics(ctx, okRows, marketIds, years) {
  const MARKETS = vm.runInContext('typeof MARKETS !== "undefined" ? MARKETS : null', ctx);
  const lines = [
    '',
    '=== Spanish format diagnostics (station generation + book share) ===',
    describeSpanishSubtypeCatalog(),
  ];
  for (const mid of marketIds) {
    const mktRow = MARKETS?.[mid] || {};
    const cult = mktRow.culture || {};
    lines.push(`\n[${mid}] MARKETS inputs: hispPop2020=${mktRow.hispPop2020 ?? '—'} culture.spanish=${cult.spanish ?? '—'} rankTier=${mktRow.rankTier ?? '—'}`);
    lines.push(`  Note: spanishLanguageStrength (ecology trait) is a lane prior, not a target Nielsen share.`);
    for (const y of years) {
      const list = okRows.filter((r) => r.marketId === mid && r.year === y);
      if (!list.length) continue;
      let ecoSpan = null;
      try {
        const eco = deriveMarketEcology(mktRow, mid, y, null);
        ecoSpan = eco?.spanishLanguageStrength;
      } catch {
        ecoSpan = null;
      }
      const n = list.length;
      const stBook = mean(list.map((r) => r.spanishStationCount));
      const stAll = mean(list.map((r) => r.spanishStationCountAll));
      const shTotal = mean(list.map((r) => r.spanishShare));
      const shLead = mean(list.map((r) => r.spanishLeaderShare));
      const shAm = mean(list.map((r) => r.spanishAmShare));
      const shFm = mean(list.map((r) => r.spanishFmShare));
      const nBook = mean(list.map((r) => r.nBook));
      lines.push(
        `  ${y}: ecology.spanishLanguageStrength=${ecoSpan != null ? (ecoSpan * 100).toFixed(1) + '%' : '—'} | ` +
          `SPANISH stations in book ${stBook != null ? stBook.toFixed(2) : '—'} (all commercial ${stAll != null ? stAll.toFixed(2) : '—'}) | ` +
          `book stations total ${nBook != null ? nBook.toFixed(1) : '—'}`,
      );
      lines.push(
        `       book share: total ${shTotal != null ? (shTotal * 100).toFixed(2) : '—'}% | ` +
          `top SPANISH ${shLead != null ? (shLead * 100).toFixed(2) : '—'}% | ` +
          `AM ${shAm != null ? (shAm * 100).toFixed(2) : '—'}% FM ${shFm != null ? (shFm * 100).toFixed(2) : '—'}% of Spanish mass`,
      );
      const shLang = mean(list.map((r) => r.spanishLanguageShare));
      const shLegacy = mean(list.map((r) => r.spanishShareLegacy));
      lines.push(
        `       Spanish-language book share: ${shLang != null ? (shLang * 100).toFixed(2) : '—'}% ` +
          `(legacy SPANISH-only: ${shLegacy != null ? (shLegacy * 100).toFixed(2) : '—'}%)`,
      );
      lines.push(`       ${describeSpanishLanguageBucket()}`);
      const srcAgg = {};
      for (const r of list) {
        const o = r.spanishBySource || {};
        for (const k of Object.keys(o)) srcAgg[k] = (srcAgg[k] || 0) + o[k];
      }
      const srcMean = Object.keys(srcAgg)
        .sort()
        .map((k) => `${k}:${(srcAgg[k] / n).toFixed(2)}`)
        .join(' ');
      lines.push(`       Spanish stations by source (mean/run): ${srcMean || '(none)'}`);
      const subMean = meanSpanishSubtypeAcrossRuns(list);
      lines.push(formatSpanishSubtypeBlock(subMean));
      if (mid === 'phoenix' && list[0]) {
        const sample = list[Math.floor(list.length / 2)];
        lines.push(`       sample run top5: ${sample.top5mix || '(none)'}`);
      }
    }
  }
  lines.push('');
  lines.push(
    'Generation context: national timeline adds rival-SPANISH-AM at 1992; MARKETS.spanishLaunches queue adds scheduled entrants (Phoenix: 1994 FM + 2002 FM).',
  );
  return lines.join('\n');
}

function escCsv(s) {
  const t = String(s ?? '');
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function assertDiagnosticMarkets(ctx, marketIds) {
  const MARKETS = vm.runInContext('typeof MARKETS !== "undefined" ? MARKETS : null', ctx);
  if (!MARKETS || typeof MARKETS !== 'object') throw new Error('MARKETS missing after legacy load');
  const playable = new Set(ALL_PLAYABLE_MARKET_IDS);
  const diagOnly = new Set(DIAG_ONLY_MARKET_IDS);
  for (const mid of marketIds) {
    if (!MARKETS[mid]) {
      throw new Error(
        `Unknown market "${mid}". Add a MARKETS row (see tmp/market_scaffold/<city>/suggested_MARKETS_row.js) ` +
          `or use --markets with a playable id (${ALL_PLAYABLE_MARKET_IDS.join(', ')}).`,
      );
    }
    if (!playable.has(mid) && !diagOnly.has(mid)) {
      console.warn(
        `[diag] "${mid}" is not in ALL_PLAYABLE_MARKET_IDS or DIAG_ONLY_MARKET_IDS — proceeding for harness only.`,
      );
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  assertDiagnosticMarkets(ctx, opts.markets);

  const salts = {};
  for (const m of opts.markets) salts[m] = marketSalt(m);

  const spanishFmtExact = [...SPANISH_LANGUAGE_FORMAT_IDS];
  const spanishFmtPrefixes = [...SPANISH_LANGUAGE_FORMAT_PREFIXES];
  const innerFixed = `
  (function(){
    var SALTS = ${JSON.stringify(salts)};
    var GEN_ERA = ${JSON.stringify(opts.era)};
    var SPANISH_LANG_FMT_EXACT = ${JSON.stringify(spanishFmtExact)};
    var SPANISH_LANG_FMT_PREFIXES = ${JSON.stringify(spanishFmtPrefixes)};
    function isSpanishLanguageFormat(fmt){
      var raw=String(fmt||'').trim().toUpperCase();
      if(!raw)return false;
      for(var i=0;i<SPANISH_LANG_FMT_EXACT.length;i++){
        if(SPANISH_LANG_FMT_EXACT[i]===raw)return true;
      }
      for(var j=0;j<SPANISH_LANG_FMT_PREFIXES.length;j++){
        if(raw.indexOf(SPANISH_LANG_FMT_PREFIXES[j])===0)return true;
      }
      return false;
    }
    function eligibleBookStations(G){
      return (G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
      });
    }
    function fmtKey(fmt){
      return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
    }
    function sortBook(stations){
      var list=stations.slice();
      for(var i=0;i<list.length;i++){
        if(typeof sanitizeStationShareForRanking==='function')sanitizeStationShareForRanking(list[i]);
      }
      list.sort(function(a,b){
        var sa=a.rat&&a.rat.share||0,sb=b.rat&&b.rat.share||0;
        if(Math.abs(sb-sa)>1e-9)return sb-sa;
        return String(a.id).localeCompare(String(b.id));
      });
      return list;
    }
    function isChrLineageFmt(fmt){
      var raw=String(fmt||'');
      if(raw==='RHYTHMIC'||raw==='HOT_AC'||raw==='CHR')return true;
      return fmtKey(fmt)==='TOP40';
    }
    function chrLaneShare(s){
      if(!isChrLineageFmt(s.format))return 0;
      return Number(s.rat&&s.rat.share)||0;
    }
    function sampleOneRun(marketId,targetYear,targetPeriod,maxSteps){
      ACTIVE_MARKET=marketId;
      syncMarketPopToMarket(marketId);
      G=genMarketMP(GEN_ERA);
      MP.mode='solo';
      MP.isHost=false;
      if(MP.players)MP.players=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===targetYear&&G.period===targetPeriod)break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>targetPeriod))
          return {ok:false,err:'overshoot',atYear:G.year,atPeriod:G.period,steps:steps};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==targetPeriod)
        return {ok:false,err:'miss',atYear:G.year,atPeriod:G.period,steps:steps};
      var book=sortBook(eligibleBookStations(G));
      var fmtSum={};
      var chr=0, ctry=0, talk=0, pub=0, gos=0, hhi=0;
      var chrLineageCount=0, chrLeaderShare=0;
      var spanishStationCount=0, spanishStationCountAll=0, spanishLeaderShare=0;
      var spanishAmShare=0, spanishFmShare=0, spanishLabelHist={};
      var spanishBySource={};
      var span=0, spanLegacy=0;
      var allSt=(G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&!s.isPlayer&&typeof stationIsNoncommercialInstitutional==='function'&&!stationIsNoncommercialInstitutional(s);
      });
      for(var ai=0;ai<allSt.length;ai++){
        var ast=allSt[ai];
        if(!isSpanishLanguageFormat(ast.format))continue;
        spanishStationCountAll++;
        var src=ast._spanishLaunchId
          ?('launch:'+ast._spanishLaunchId)
          :(ast._megaFragmentationEntrant?'mega_frag':(ast._spanishLaunchEntrant?'spanish_launch':'timeline_or_other'));
        spanishBySource[src]=(spanishBySource[src]||0)+1;
      }
      for(var j=0;j<book.length;j++){
        var st=book[j];
        var sh=Number(st.rat&&st.rat.share)||0;
        hhi+=sh*sh;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        if(isChrLineageFmt(st.format)){
          chrLineageCount++;
          if(sh>chrLeaderShare)chrLeaderShare=sh;
        }
        chr+=chrLaneShare(st);
        var rf=String(st.format||'');
        if(rf==='COUNTRY')ctry+=sh;
        if(rf==='NEWS_TALK'||rf==='SPORTS_TALK'||rf==='PERSONALITY_TALK'||rf==='ALL_NEWS')talk+=sh;
        if(st.isPublic||rf.indexOf('PUBLIC_')===0)pub+=sh;
        if(rf==='GOSPEL')gos+=sh;
        if(isSpanishLanguageFormat(rf)){
          span+=sh;
          if(rf==='SPANISH')spanLegacy+=sh;
          spanishStationCount++;
          spanishLabelHist[rf]=(spanishLabelHist[rf]||0)+1;
          if(sh>spanishLeaderShare)spanishLeaderShare=sh;
          var band=(st.sig&&st.sig.type)||'?';
          if(band==='AM')spanishAmShare+=sh;
          else spanishFmShare+=sh;
        }
      }
      var lead=book[0]||null;
      var sh1=lead?Number(lead.rat.share)||0:0;
      var sh2=book.length>1?Number(book[1].rat.share)||0:0;
      var sh5=book.length>4?Number(book[4].rat.share)||0:0;
      var top5=[];
      for(var t=0;t<Math.min(5,book.length);t++){
        top5.push(String(book[t].format)+':'+(Number(book[t].rat&&book[t].rat.share)||0).toFixed(4));
      }
      ${SPANISH_BOOK_STATIONS_SNIPPET}
      return {
        ok:true,
        steps:steps,
        nBook:book.length,
        fmtSum:fmtSum,
        chrTotal:chr,
        chrLineageCount:chrLineageCount,
        chrLeaderShare:chrLeaderShare,
        country:ctry,
        newsTalk:talk,
        publicShare:pub,
        gospelShare:gos,
        spanishLanguageShare:span,
        spanishShareLegacy:spanLegacy,
        spanishShare:span,
        spanishStationCount:spanishStationCount,
        spanishStationCountAll:spanishStationCountAll,
        spanishLeaderShare:spanishLeaderShare,
        spanishAmShare:spanishAmShare,
        spanishFmShare:spanishFmShare,
        spanishLabelHist:spanishLabelHist,
        spanishBySource:spanishBySource,
        spanishBookStations:spanishBookStations,
        hhi_x10000:hhi*10000,
        gap12:sh1-sh2,
        gap15:sh1-sh5,
        leaderFmtRaw:lead?String(lead.format):'',
        leaderFmtKey:lead?fmtKey(lead.format):'',
        top5mix:top5.join('|'),
      };
    }
    return function runAll(markets,years,targetPeriod,numRuns,baseSeed,maxSteps){
      var rows=[];
      var mi,yi,run,salt,s0,r,origR;
      origR=Math.random;
      for(mi=0;mi<markets.length;mi++){
        var mid=markets[mi];
        salt=SALTS[mid]||0;
        for(yi=0;yi<years.length;yi++){
          var y=years[yi];
          for(run=0;run<numRuns;run++){
            s0=baseSeed+salt*17+y*10007+run*9973;
            (function(seedVal){
              var s=seedVal;
              Math.random=function(){
                s=(s*9301+49297)%233280;
                return s/233280;
              };
            })(s0);
            try{
              r=sampleOneRun(mid,y,targetPeriod,maxSteps);
            }catch(e){
              r={ok:false,err:String(e&&e.message||e)};
            }finally{
              Math.random=origR;
            }
            rows.push({
              marketId:mid,
              year:y,
              period:targetPeriod,
              run:run,
              ok:r.ok,
              err:r.err||'',
              fmtSum:r.fmtSum,
              chrTotal:r.chrTotal,
              chrLineageCount:r.chrLineageCount,
              chrLeaderShare:r.chrLeaderShare,
              country:r.country,
              newsTalk:r.newsTalk,
              publicShare:r.publicShare,
              gospelShare:r.gospelShare,
              spanishLanguageShare:r.spanishLanguageShare,
              spanishShareLegacy:r.spanishShareLegacy,
              spanishShare:r.spanishShare,
              spanishStationCount:r.spanishStationCount,
              spanishStationCountAll:r.spanishStationCountAll,
              spanishLeaderShare:r.spanishLeaderShare,
              spanishAmShare:r.spanishAmShare,
              spanishFmShare:r.spanishFmShare,
              spanishLabelHist:r.spanishLabelHist,
              spanishBySource:r.spanishBySource,
              spanishBookStations:r.spanishBookStations,
              hhi_x10000:r.hhi_x10000,
              gap12:r.gap12,
              gap15:r.gap15,
              leaderFmtRaw:r.leaderFmtRaw,
              leaderFmtKey:r.leaderFmtKey,
              nBook:r.nBook,
              top5mix:r.top5mix,
            });
          }
        }
      }
      return rows;
    };
  })();
  `;

  const runAll = vm.runInContext(innerFixed, ctx);
  const rows = runAll(opts.markets, opts.years, opts.period, opts.runs, opts.seed, opts.maxSteps);
  const MARKETS = vm.runInContext('typeof MARKETS!=="undefined"?MARKETS:null', ctx);
  if (!MARKETS || typeof MARKETS !== 'object') throw new Error('MARKETS missing after legacy load');

  const bad = rows.filter((r) => !r.ok);
  if (bad.length) {
    console.error('Sample failures (first 8):', bad.slice(0, 8));
    if (bad.length === rows.length) throw new Error(`All ${rows.length} samples failed`);
  }
  const okRows = rows.filter((r) => r.ok);
  enrichSpanishSubtypeOnRows(okRows, ctx);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const CSV_HEADER = [
    'genEra',
    'marketId',
    'year',
    'period',
    'nRuns',
    'mean_hhi_x10000',
    'mean_gap12',
    'mean_gap15',
    'mean_chr_lane_share',
    'mean_spoken_word_share',
    'mean_public_share',
    'mean_country_share',
    'mean_gospel_share',
    'mean_spanish_share',
    'mean_spanish_language_share',
    'mean_spanish_share_legacy',
    'mean_nBook',
    'top5_mean_formats',
    'num1_format_key_histogram',
    'num1_format_raw_histogram',
    'actual_top40_win_rate',
    'expected_top40_weight',
    'mismatch_top40',
    'expected_top_buckets',
    'actual_top_buckets',
    'chr_bucket_total_share',
    'expected_chr_bucket_strength',
    'chr_lineage_station_count',
    'chr_avg_share_per_station',
    'chr_leader_share',
    'expected_chr_leader_share_cap',
    'mismatch_chr_bucket',
    'mismatch_chr_concentration',
  ].join(',');

  const csvLines = [CSV_HEADER];
  const mismatchSummary = [];
  const chrMismatchSummary = [];
  const linesOut = [
    'Market ecology regression (cold genMarketMP → Spring book)',
    `genEra=${opts.era} maxSteps=${opts.maxSteps} runs/cell=${opts.runs} seed=${opts.seed}`,
    'CHR lane = TOP40 (canonical) + CHR + RHYTHMIC + HOT_AC.',
    'Spoken word = NEWS_TALK + SPORTS_TALK + PERSONALITY_TALK + ALL_NEWS.',
    'Public = isPublic or format prefix PUBLIC_.',
    describeSpanishLanguageBucket(),
    'Expected leadership = QA-only `expectedFormatLeadershipProfile(ecology,year)` (see scripts/expectedFormatLeadershipProfile.mjs).',
    'actual_top40_win_rate = fraction of runs where #1 canonical key is TOP40 (CHR maps to TOP40).',
    'mismatch_top40: SEVERE if wins>70% and expected<35%; MODERATE if wins−expected>0.20 and wins>45%.',
    'CHR bucket QA: expectedChrBucketStrengthByEra + expectedChrLeaderShareCap (src/marketEcologyCore.js).',
    'mismatch_chr_bucket: BUCKET_SEVERE if bucket>expected+8pp (y>=2000); BUCKET_MODERATE if +5pp.',
    'mismatch_chr_concentration: CONCENTRATION_SEVERE if leader>cap+4pp; MODERATE if +2.5pp.',
    '',
  ];

  for (const mid of opts.markets) {
    for (const y of opts.years) {
      const list = okRows.filter((r) => r.marketId === mid && r.year === y);
      if (!list.length) continue;
      const n = list.length;
      const hhis = list.map((r) => r.hhi_x10000);
      const gap12s = list.map((r) => r.gap12);
      const gap15s = list.map((r) => r.gap15);
      const chrs = list.map((r) => r.chrTotal);
      const chrCounts = list.map((r) => r.chrLineageCount);
      const chrLeaders = list.map((r) => r.chrLeaderShare);
      const chrAvgPerSt = list.map((r) => {
        const c = Math.max(1, Number(r.chrLineageCount) || 0);
        return (Number(r.chrTotal) || 0) / c;
      });
      const nts = list.map((r) => r.newsTalk);
      const pubs = list.map((r) => r.publicShare);
      const cts = list.map((r) => r.country);
      const gos = list.map((r) => r.gospelShare);
      const sps = list.map((r) => r.spanishLanguageShare ?? r.spanishShare);
      const spsLegacy = list.map((r) => r.spanishShareLegacy ?? r.spanishShare);
      const nbs = list.map((r) => r.nBook);

      const fmtMeans = new Map();
      for (const r of list) {
        const o = r.fmtSum || {};
        for (const k of Object.keys(o)) {
          if (!fmtMeans.has(k)) fmtMeans.set(k, []);
          fmtMeans.get(k).push(o[k]);
        }
      }
      const fmtAgg = [];
      for (const [k, arr] of fmtMeans) {
        fmtAgg.push({ k, m: mean(arr) });
      }
      fmtAgg.sort((a, b) => b.m - a.m);
      const top5f = fmtAgg.slice(0, 5).map((x) => `${x.k}:${x.m.toFixed(4)}`).join('|');

      const histKey = {};
      const histRaw = {};
      for (const r of list) {
        const k = r.leaderFmtKey || '?';
        const raw = r.leaderFmtRaw || '?';
        histKey[k] = (histKey[k] || 0) + 1;
        histRaw[raw] = (histRaw[raw] || 0) + 1;
      }
      const histKeyStr = Object.keys(histKey)
        .sort((a, b) => histKey[b] - histKey[a])
        .map((k) => `${k}:${histKey[k]}`)
        .join('|');
      const histRawStr = Object.keys(histRaw)
        .sort((a, b) => histRaw[b] - histRaw[a])
        .map((k) => `${k}:${histRaw[k]}`)
        .join('|');

      const mktRow = MARKETS[mid] || {};
      const ecology = deriveMarketEcology(mktRow, mid, y, null);
      const expectedChrBucket = expectedChrBucketStrengthByEra(y, ecology);
      const expectedChrLeaderCap = expectedChrLeaderShareCap(y, ecology);
      const expProf = expectedFormatLeadershipProfile(ecology, y);
      const top40Wins = list.filter((r) => (r.leaderFmtKey || '') === 'TOP40').length;
      const actualTop40WinRate = n ? top40Wins / n : 0;
      const expectedTop40Weight = expProf.top40ChrWeight;
      const mismatchTop40 = classifyTop40Mismatch(actualTop40WinRate, expectedTop40Weight);
      const actualAgg = aggregateMeansToLeadershipBuckets(fmtAgg);
      const chrBucketTotal = mean(chrs);
      const mismatchChrBucket = classifyChrBucketMismatch(chrBucketTotal, expectedChrBucket, y);
      const chrLeaderMean = mean(chrLeaders);
      const mismatchChrConc = classifyChrConcentrationMismatch(chrLeaderMean, expectedChrLeaderCap);

      const row = {
        genEra: opts.era,
        marketId: mid,
        year: y,
        period: opts.period,
        nRuns: n,
        mean_hhi_x10000: mean(hhis),
        mean_gap12: mean(gap12s),
        mean_gap15: mean(gap15s),
        mean_chr_lane_share: mean(chrs),
        mean_spoken_word_share: mean(nts),
        mean_public_share: mean(pubs),
        mean_country_share: mean(cts),
        mean_gospel_share: mean(gos),
        mean_spanish_share: mean(sps),
        mean_spanish_language_share: mean(sps),
        mean_spanish_share_legacy: mean(spsLegacy),
        mean_nBook: mean(nbs),
        top5_mean_formats: top5f,
        num1_format_key_histogram: histKeyStr,
        num1_format_raw_histogram: histRawStr,
        actual_top40_win_rate: actualTop40WinRate,
        expected_top40_weight: expectedTop40Weight,
        mismatch_top40: mismatchTop40,
        expected_top_buckets: expProf.serialized,
        actual_top_buckets: actualAgg.serialized,
        chr_bucket_total_share: chrBucketTotal,
        expected_chr_bucket_strength: expectedChrBucket,
        chr_lineage_station_count: mean(chrCounts),
        chr_avg_share_per_station: mean(chrAvgPerSt),
        chr_leader_share: chrLeaderMean,
        expected_chr_leader_share_cap: expectedChrLeaderCap,
        mismatch_chr_bucket: mismatchChrBucket,
        mismatch_chr_concentration: mismatchChrConc,
      };

      csvLines.push(
        [
          row.genEra,
          row.marketId,
          row.year,
          row.period,
          row.nRuns,
          row.mean_hhi_x10000 != null ? row.mean_hhi_x10000.toFixed(2) : '',
          row.mean_gap12 != null ? (row.mean_gap12 * 100).toFixed(2) : '',
          row.mean_gap15 != null ? (row.mean_gap15 * 100).toFixed(2) : '',
          row.mean_chr_lane_share != null ? (row.mean_chr_lane_share * 100).toFixed(2) : '',
          row.mean_spoken_word_share != null ? (row.mean_spoken_word_share * 100).toFixed(2) : '',
          row.mean_public_share != null ? (row.mean_public_share * 100).toFixed(2) : '',
          row.mean_country_share != null ? (row.mean_country_share * 100).toFixed(2) : '',
          row.mean_gospel_share != null ? (row.mean_gospel_share * 100).toFixed(2) : '',
          row.mean_spanish_share != null ? (row.mean_spanish_share * 100).toFixed(2) : '',
          row.mean_spanish_language_share != null ? (row.mean_spanish_language_share * 100).toFixed(2) : '',
          row.mean_spanish_share_legacy != null ? (row.mean_spanish_share_legacy * 100).toFixed(2) : '',
          row.mean_nBook != null ? row.mean_nBook.toFixed(2) : '',
          escCsv(row.top5_mean_formats),
          escCsv(row.num1_format_key_histogram),
          escCsv(row.num1_format_raw_histogram),
          row.actual_top40_win_rate != null ? (row.actual_top40_win_rate * 100).toFixed(2) : '',
          row.expected_top40_weight != null ? (row.expected_top40_weight * 100).toFixed(2) : '',
          escCsv(row.mismatch_top40 || ''),
          escCsv(row.expected_top_buckets),
          escCsv(row.actual_top_buckets),
          row.chr_bucket_total_share != null ? (row.chr_bucket_total_share * 100).toFixed(2) : '',
          row.expected_chr_bucket_strength != null ? (row.expected_chr_bucket_strength * 100).toFixed(2) : '',
          row.chr_lineage_station_count != null ? row.chr_lineage_station_count.toFixed(2) : '',
          row.chr_avg_share_per_station != null ? (row.chr_avg_share_per_station * 100).toFixed(2) : '',
          row.chr_leader_share != null ? (row.chr_leader_share * 100).toFixed(2) : '',
          row.expected_chr_leader_share_cap != null ? (row.expected_chr_leader_share_cap * 100).toFixed(2) : '',
          escCsv(row.mismatch_chr_bucket || ''),
          escCsv(row.mismatch_chr_concentration || ''),
        ].join(','),
      );

      linesOut.push(
        `${mid} ${y}: HHI≈${row.mean_hhi_x10000 != null ? row.mean_hhi_x10000.toFixed(0) : '—'} ` +
          `gap1-2=${row.mean_gap12 != null ? (row.mean_gap12 * 100).toFixed(2) : '—'}pp ` +
          `chr=${row.mean_chr_lane_share != null ? (row.mean_chr_lane_share * 100).toFixed(1) : '—'}% ` +
          `talk=${row.mean_spoken_word_share != null ? (row.mean_spoken_word_share * 100).toFixed(1) : '—'}% ` +
          `pub=${row.mean_public_share != null ? (row.mean_public_share * 100).toFixed(1) : '—'}% ` +
          `ctry=${row.mean_country_share != null ? (row.mean_country_share * 100).toFixed(1) : '—'}% ` +
          `gos=${row.mean_gospel_share != null ? (row.mean_gospel_share * 100).toFixed(1) : '—'}% ` +
          `esp=${row.mean_spanish_language_share != null ? (row.mean_spanish_language_share * 100).toFixed(1) : '—'}%` +
          `${row.mean_spanish_share_legacy != null && Math.abs(row.mean_spanish_language_share - row.mean_spanish_share_legacy) > 0.0005 ? ` (legacy ${(row.mean_spanish_share_legacy * 100).toFixed(1)}%)` : ''} | #1 keys ${histKeyStr}`,
      );
      linesOut.push(
        `  [expected leadership] ${row.expected_top_buckets}  (TOP40 #1 prior ${(row.expected_top40_weight * 100).toFixed(1)}%)`,
      );
      linesOut.push(
        `  [actual #1 TOP40 win rate] ${(row.actual_top40_win_rate * 100).toFixed(1)}%  |  [book-share buckets] ${row.actual_top_buckets}`,
      );
      if (row.mismatch_top40) {
        linesOut.push(
          `  *** MISMATCH ${row.mismatch_top40}: sim #1 TOP40 ${(row.actual_top40_win_rate * 100).toFixed(0)}% vs expected weight ${(row.expected_top40_weight * 100).toFixed(0)}% ***`,
        );
        mismatchSummary.push(
          `${mid} ${y}: ${row.mismatch_top40}  #1_TOP40_wins=${(row.actual_top40_win_rate * 100).toFixed(0)}% expected_TOP40_prior=${(row.expected_top40_weight * 100).toFixed(0)}%`,
        );
      }

      const chrFlags = joinMismatchFlags(row.mismatch_chr_bucket, row.mismatch_chr_concentration);
      linesOut.push(
        `  [CHR bucket] actual ${(row.chr_bucket_total_share * 100).toFixed(1)}% expected ${(row.expected_chr_bucket_strength * 100).toFixed(1)}% | ` +
          `stations ${row.chr_lineage_station_count.toFixed(1)} avg/st ${(row.chr_avg_share_per_station * 100).toFixed(1)}% | ` +
          `leader ${(row.chr_leader_share * 100).toFixed(1)}% cap ${(row.expected_chr_leader_share_cap * 100).toFixed(1)}% | ` +
          `#1 TOP40 ${(row.actual_top40_win_rate * 100).toFixed(0)}%${chrFlags ? ` | ${chrFlags}` : ''}`,
      );
      if (chrFlags) {
        chrMismatchSummary.push(
          `${mid} ${y}: ${chrFlags}  bucket=${(row.chr_bucket_total_share * 100).toFixed(0)}%/` +
            `exp=${(row.expected_chr_bucket_strength * 100).toFixed(0)}% leader=${(row.chr_leader_share * 100).toFixed(0)}%/` +
            `cap=${(row.expected_chr_leader_share_cap * 100).toFixed(0)}% #1_TOP40=${(row.actual_top40_win_rate * 100).toFixed(0)}%`,
        );
      }
    }
  }

  linesOut.push('');
  linesOut.push('Mismatch summary (#1 canonical TOP40 win rate vs trait-derived prior):');
  if (!mismatchSummary.length) linesOut.push('  (none)');
  else mismatchSummary.forEach((ln) => linesOut.push(`  ${ln}`));

  linesOut.push('');
  linesOut.push('CHR bucket / concentration mismatch summary:');
  if (!chrMismatchSummary.length) linesOut.push('  (none)');
  else chrMismatchSummary.forEach((ln) => linesOut.push(`  ${ln}`));

  writeFileSync(outCsv, csvLines.join('\n') + '\n', 'utf8');
  console.log(linesOut.join('\n'));

  const spanishDiagMarkets = opts.markets.filter(
    (m) => m === 'phoenix' || m === 'miami' || process.argv.includes('--spanish-diag'),
  );
  if (spanishDiagMarkets.length) {
    console.log(printSpanishMarketDiagnostics(ctx, okRows, spanishDiagMarkets, opts.years));
    for (const diagMid of spanishDiagMarkets) {
      const outJson = path.join(root, 'tmp', 'market_scaffold', diagMid, 'spanish_format_diag.json');
      mkdirSync(path.dirname(outJson), { recursive: true });
      const byYear = {};
      for (const y of opts.years) {
        const list = okRows.filter((r) => r.marketId === diagMid && r.year === y);
        if (!list.length) continue;
        const srcAgg = {};
        for (const r of list) {
          for (const [k, v] of Object.entries(r.spanishBySource || {})) {
            srcAgg[k] = (srcAgg[k] || 0) + v;
          }
        }
        const srcMean = {};
        for (const k of Object.keys(srcAgg)) srcMean[k] = srcAgg[k] / list.length;
        byYear[y] = {
          meanSpanishStationCount: mean(list.map((r) => r.spanishStationCount)),
          meanSpanishStationCountAll: mean(list.map((r) => r.spanishStationCountAll)),
          meanSpanishLanguageShare: mean(list.map((r) => r.spanishLanguageShare ?? r.spanishShare)),
          meanSpanishShareLegacy: mean(list.map((r) => r.spanishShareLegacy ?? r.spanishShare)),
          meanSpanishLeaderShare: mean(list.map((r) => r.spanishLeaderShare)),
          spanishBySourceMean: srcMean,
          spanishSubtype: meanSpanishSubtypeAcrossRuns(list),
          runs: list.length,
        };
      }
      writeFileSync(
        outJson,
        `${JSON.stringify({ marketId: diagMid, recordedAt: new Date().toISOString(), byYear }, null, 2)}\n`,
        'utf8',
      );
      console.log(`Wrote ${outJson}`);
    }
  }

  console.log(`\nWrote ${outCsv} (${csvLines.length - 1} summary rows)`);
}

main();
