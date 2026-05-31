#!/usr/bin/env node
/**
 * Spanish subtype truth sanity — Phase 1 inference QA (no gameplay changes).
 *
 *   node scripts/diag-spanish-subtype-truth-sanity.mjs
 *   node scripts/diag-spanish-subtype-truth-sanity.mjs --runs=8
 *
 * @see data/spanishFormats.v1.json
 * @see scripts/spanishSubtypeHelpers.mjs
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectFormatLifecycleIife } from './vmInjectFormatLifecycleIife.mjs';
import { deriveMarketEcology } from '../src/marketEcology.js';
import { SPANISH_BOOK_STATIONS_SNIPPET } from './spanishSubtypeHelpers.mjs';
import {
  scoreSpanishSubtypeMarketAffinities,
  spanishSubtypeIds,
} from './spanishSubtypeHelpers.mjs';
import {
  enrichSpanishSubtypeOnRows,
  meanSpanishSubtypeAcrossRuns,
} from './spanishSubtypeDiagnostics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'spanish_subtype_truth_sanity.json');

const BENCHMARK_YEARS = [1995, 2005, 2026];
const DEFAULT_RUNS = 8;
const SEED = 20260519;
const MAX_STEPS = 320;
const GEN_ERA = '1970';

const SIM_MARKETS = ['phoenix', 'losangeles', 'newyork', 'chicago', 'miami'];

/** Future markets — affinity prior only (not in MARKETS / no sim). */
const FUTURE_MARKET_STUBS = {
  houston: {
    id: 'houston',
    label: 'Houston (future stub)',
    region: 'Southwest',
    rankTier: 'mega',
    archetypeId: 'sunbelt_diversified',
    hispPop2020: 0.44,
    blackPop: 0.23,
    culture: { spanish: 0.2, newsTalk: 0.08, urban: 0.1 },
    sportsMarketIndex: 1.05,
  },
  sanantonio: {
    id: 'sanantonio',
    label: 'San Antonio (future stub)',
    region: 'Southwest',
    rankTier: 'large',
    archetypeId: 'sunbelt_diversified',
    hispPop2020: 0.64,
    blackPop: 0.07,
    culture: { spanish: 0.28, newsTalk: 0.06, urban: 0.05 },
    sportsMarketIndex: 0.85,
  },
};

/**
 * Expected market identity (heuristic QA — not hardcoded inference tables).
 * @type {Record<string, { label: string, dominant?: string[], mustInclude?: string[], avoidMonopoly?: boolean, maxMonoShare?: number }>}
 */
const MARKET_IDENTITY = {
  phoenix: {
    label: 'Regional Mexican dominant',
    dominant: ['REGIONAL_MEXICAN'],
    mustInclude: ['REGIONAL_MEXICAN'],
    avoidMonopoly: false,
    maxMonoShare: 0.95,
  },
  losangeles: {
    label: 'RM + Contemporary + Tropical/Adult Hits mix',
    dominant: ['SPANISH_CONTEMPORARY', 'REGIONAL_MEXICAN', 'SPANISH_TROPICAL'],
    mustInclude: ['SPANISH_CONTEMPORARY', 'REGIONAL_MEXICAN', 'SPANISH_TROPICAL'],
    avoidMonopoly: true,
    maxMonoShare: 0.8,
  },
  newyork: {
    label: 'News/Talk + Tropical + Contemporary',
    dominant: ['SPANISH_NEWS_TALK', 'SPANISH_CONTEMPORARY', 'SPANISH_TROPICAL'],
    mustInclude: ['SPANISH_NEWS_TALK', 'SPANISH_CONTEMPORARY', 'SPANISH_TROPICAL'],
    avoidMonopoly: true,
    maxMonoShare: 0.75,
  },
  chicago: {
    label: 'Regional Mexican + News/Talk + Contemporary',
    dominant: ['REGIONAL_MEXICAN', 'SPANISH_NEWS_TALK', 'SPANISH_CONTEMPORARY'],
    mustInclude: ['REGIONAL_MEXICAN', 'SPANISH_NEWS_TALK', 'SPANISH_CONTEMPORARY'],
    avoidMonopoly: true,
    maxMonoShare: 0.8,
  },
  miami: {
    label: 'Tropical + News/Talk + Contemporary',
    dominant: ['SPANISH_TROPICAL', 'SPANISH_NEWS_TALK', 'SPANISH_CONTEMPORARY'],
    mustInclude: ['SPANISH_TROPICAL', 'SPANISH_NEWS_TALK', 'SPANISH_CONTEMPORARY'],
    avoidMonopoly: true,
    maxMonoShare: 0.75,
  },
  houston: {
    label: 'Regional Mexican dominant; sports possible',
    dominant: ['REGIONAL_MEXICAN'],
    mustInclude: ['REGIONAL_MEXICAN'],
    affinityOnly: true,
  },
  sanantonio: {
    label: 'Regional Mexican dominant',
    dominant: ['REGIONAL_MEXICAN'],
    mustInclude: ['REGIONAL_MEXICAN'],
    affinityOnly: true,
  },
};

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
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() { return 0; },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray?.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) {
          typedArray[i] = Math.floor(Math.random() * 256);
        }
        return typedArray;
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

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function loadMiamiMarketsRow() {
  const rawPath = path.join(root, 'tmp', 'market_scaffold', 'miami', 'raw_market_data.json');
  const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
  const fmFacilityByFreq = {};
  for (const [freq, sig] of Object.entries(raw.fmSignalByFreq || {})) {
    const kw = sig?.erpKw != null ? `${sig.erpKw}kw` : '50kw';
    fmFacilityByFreq[freq] = kw;
  }
  return {
    id: 'miami',
    callPrefix: raw.callPrefix || 'W',
    label: raw.label || 'Miami',
    region: raw.region || 'Southeast',
    rankTier: raw.rankTier || 'large',
    archetypeId: raw.archetypeId || 'sunbelt_diversified',
    pop: raw.pop,
    revScale: raw.revScale ?? 1.42,
    adxBonus: raw.adxBonus ?? 0.028,
    amFreqs: raw.amFreqs,
    fmFreqs: raw.fmFreqs,
    fmFacilityByFreq,
    blackPop: raw.blackPop,
    hispPop1970: raw.hispPop1970,
    hispPop2000: raw.hispPop2000,
    hispPop2020: raw.hispPop2020,
    churchGoing: raw.churchGoing,
    countryBonus: raw.countryBonus,
    urbanBonus: raw.urbanBonus,
    culture: raw.culture,
    fmPenBias: raw.fmPenBias,
    fmMusicFragMult: raw.fmMusicFragMult,
    spokenWordAmResilience: raw.spokenWordAmResilience,
    heritageAmResilience: raw.heritageAmResilience,
    countryAmHoldout: raw.countryAmHoldout,
    eduIndex: raw.eduIndex,
    publicCivicIndex: raw.publicCivicIndex,
    teams: raw.teams || [],
    selectBlurb: raw.selectBlurb || 'Miami scaffold (diag)',
    spanishLaunches: [
      { id: 'miami_spanish_1992_fm', y: 1992, p: 1, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
      { id: 'miami_spanish_2001_fm', y: 2001, p: 2, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'strong' } },
      { id: 'miami_spanish_2008_am', y: 2008, p: 1, bp: { type: 'AM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
    ],
  };
}

function injectScaffoldMarkets(ctx) {
  const miami = loadMiamiMarketsRow();
  vm.runInContext(`MARKETS.miami = ${JSON.stringify(miami)};`, ctx);
  return { miami };
}

function buildRunHarness(salts, runs) {
  return `
  (function(){
    var SALTS = ${JSON.stringify(salts)};
    var GEN_ERA = ${JSON.stringify(GEN_ERA)};
    function eligibleBookStations(G){
      return (G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
      });
    }
    function fmtKey(fmt){
      return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
    }
    function isSpanishLanguageFormat(fmt){
      var raw=String(fmt||'').trim().toUpperCase();
      return raw==='SPANISH'||raw.indexOf('SPANISH_')===0;
    }
    function sortBook(stations){
      var list=stations.slice();
      list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
      return list;
    }
    function sampleOneRun(marketId,targetYear,maxSteps){
      ACTIVE_MARKET=marketId;
      if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
      G=genMarketMP(GEN_ERA);
      MP.mode='solo';
      MP.isHost=false;
      if(MP.players)MP.players=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===targetYear&&G.period===1)break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>1))
          return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==1) return {ok:false,err:'miss'};
      var book=sortBook(eligibleBookStations(G));
      var spanCount=0, spanShare=0;
      for(var j=0;j<book.length;j++){
        if(isSpanishLanguageFormat(book[j].format)){
          spanCount++;
          spanShare+=Number(book[j].rat&&book[j].rat.share)||0;
        }
      }
      ${SPANISH_BOOK_STATIONS_SNIPPET}
      return {
        ok:true,
        spanishStationCount:spanCount,
        spanishShare:spanShare,
        spanishBookStations:spanishBookStations,
        nBook:book.length
      };
    }
    return function runMarketYear(marketId,year,baseSeed,maxSteps,numRuns){
      var rows=[];
      var salt=SALTS[marketId]||0;
      var origR=Math.random;
      for(var run=0;run<numRuns;run++){
        var s0=baseSeed+salt*17+year*10007+run*9973;
        (function(seedVal){
          var s=seedVal;
          Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
        })(s0);
        var r;
        try{ r=sampleOneRun(marketId,year,maxSteps); }
        catch(e){ r={ok:false,err:String(e&&e.message||e)}; }
        finally{ Math.random=origR; }
        rows.push({marketId:marketId,year:year,run:run,ok:r.ok,err:r.err||'',
          spanishStationCount:r.spanishStationCount,
          spanishShare:r.spanishShare,
          spanishBookStations:r.spanishBookStations,
          nBook:r.nBook});
      }
      return rows;
    };
  })();
  `;
}

function topSubtype(sub) {
  const entries = Object.entries(sub?.meanSubtypeSharePct || {}).filter(([, v]) => v > 0.001);
  if (!entries.length) return { id: '—', share: 0 };
  entries.sort((a, b) => b[1] - a[1]);
  return { id: entries[0][0], share: entries[0][1] };
}

function formatCounts(sub) {
  const parts = spanishSubtypeIds()
    .map((id) => {
      const c = sub?.meanSubtypeCounts?.[id] || 0;
      if (c < 0.05) return null;
      return `${id.replace('SPANISH_', '').replace('REGIONAL_MEXICAN', 'RM')}:${c.toFixed(2)}`;
    })
    .filter(Boolean);
  return parts.join(' ') || '—';
}

function formatShares(sub) {
  const parts = spanishSubtypeIds()
    .map((id) => {
      const p = sub?.meanSubtypeSharePct?.[id] || 0;
      if (p < 0.02) return null;
      const short = id.replace('SPANISH_', '').replace('REGIONAL_MEXICAN', 'RM');
      return `${short}:${(p * 100).toFixed(0)}%`;
    })
    .filter(Boolean);
  return parts.join(' ') || '—';
}

function amFmSkewFromRows(rows) {
  const am = {};
  const fm = {};
  let amN = 0;
  let fmN = 0;
  for (const r of rows) {
    for (const a of r.spanishSubtypeSummary?.assignments || []) {
      const id = a.inferredSubtype;
      if (a.sigType === 'AM') {
        am[id] = (am[id] || 0) + 1;
        amN++;
      } else if (a.sigType === 'FM') {
        fm[id] = (fm[id] || 0) + 1;
        fmN++;
      }
    }
  }
  const musicFm = ['SPANISH_CONTEMPORARY', 'SPANISH_TROPICAL', 'REGIONAL_MEXICAN', 'SPANISH_ADULT_HITS'];
  const talkAm = ['SPANISH_NEWS_TALK', 'SPANISH_SPORTS_TALK', 'REGIONAL_MEXICAN'];
  const fmMusicPct = fmN ? musicFm.reduce((s, k) => s + (fm[k] || 0), 0) / fmN : null;
  const amTalkPct = amN ? talkAm.reduce((s, k) => s + (am[k] || 0), 0) / amN : null;
  const amMusicPct = amN ? musicFm.reduce((s, k) => s + (am[k] || 0), 0) / amN : null;
  const fmTalkPct = fmN
    ? ((fm.SPANISH_NEWS_TALK || 0) + (fm.SPANISH_SPORTS_TALK || 0)) / fmN
    : null;
  return { amN, fmN, amMusicPct, amTalkPct, fmMusicPct, fmTalkPct };
}

function evaluateFlags(marketId, year, sub, rows, identity) {
  const flags = [];
  if (!sub || identity.affinityOnly) return flags;

  const top = topSubtype(sub);
  const stCount = sub.meanTotalSpanishStations || 0;

  if (stCount < 0.5) {
    flags.push('NO_SPANISH_BOOK');
    return flags;
  }

  if (stCount >= 2.5 && identity.avoidMonopoly && top.share > (identity.maxMonoShare ?? 0.8)) {
    flags.push(`MONO_${top.id}`);
  }

  if (stCount >= 2.5 && identity.dominant?.length && !identity.dominant.includes(top.id)) {
    flags.push(`WRONG_LEADER_${top.id}`);
  }

  if (stCount >= 2.5) {
    for (const must of identity.mustInclude || []) {
      const c = sub.meanSubtypeCounts?.[must] || 0;
      const minCount = year >= 2005 ? 0.35 : 0.2;
      if (c < minCount) flags.push(`MISSING_${must}`);
    }
  }

  const skew = amFmSkewFromRows(rows);
  let amContemporaryOrTropical = false;
  for (const r of rows) {
    for (const a of r.spanishSubtypeSummary?.assignments || []) {
      if (
        a.sigType === 'AM' &&
        (a.inferredSubtype === 'SPANISH_CONTEMPORARY' || a.inferredSubtype === 'SPANISH_TROPICAL')
      ) {
        amContemporaryOrTropical = true;
      }
    }
  }
  if (skew.amN >= 2 && amContemporaryOrTropical) {
    flags.push('AM_MUSIC_HEAVY');
  }
  if (skew.fmN >= 3 && skew.fmTalkPct != null && skew.fmTalkPct > 0.35) {
    flags.push('FM_TALK_HEAVY');
  }
  if (skew.amN >= 2 && skew.amTalkPct != null && skew.amTalkPct < 0.35) {
    flags.push('AM_TALK_LIGHT');
  }

  if (year === 1995) {
    const ah = sub.meanSubtypeCounts?.SPANISH_ADULT_HITS || 0;
    const sp = sub.meanSubtypeCounts?.SPANISH_SPORTS_TALK || 0;
    if (ah > 0.2) flags.push('EARLY_ADULT_HITS');
    if (sp > 0.15) flags.push('EARLY_SPORTS_TALK');
    const kinds = spanishSubtypeIds().filter((id) => (sub.meanSubtypeCounts?.[id] || 0) > 0.1).length;
    if (stCount >= 2 && kinds < 2) flags.push('EARLY_LOW_DIVERSITY');
  }

  return flags;
}

function affinityRow(marketId, year) {
  const stub = FUTURE_MARKET_STUBS[marketId];
  let eco = null;
  try {
    eco = deriveMarketEcology(stub, marketId, year, null);
  } catch {
    eco = null;
  }
  const prior = scoreSpanishSubtypeMarketAffinities(stub, year, eco);
  const sorted = Object.entries(prior).sort((a, b) => b[1] - a[1]);
  return {
    marketId,
    year,
    mode: 'affinity_only',
    topPrior: sorted[0]?.[0],
    priorTop3: sorted.slice(0, 3).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(' '),
    identity: MARKET_IDENTITY[marketId]?.label,
  };
}

function parseArgs(argv) {
  let runs = DEFAULT_RUNS;
  for (const a of argv) {
    if (a.startsWith('--runs=')) runs = parseInt(a.split('=')[1], 10) || DEFAULT_RUNS;
  }
  return { runs };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log('Spanish subtype truth sanity (Phase 1 diagnostic inference only)\n');
  console.log(`Markets: ${SIM_MARKETS.join(', ')} | years: ${BENCHMARK_YEARS.join(', ')} | runs: ${opts.runs}\n`);

  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8')), ctx, {
    filename: 'legacy.js',
    timeout: 240_000,
  });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  const scaffoldOverrides = injectScaffoldMarkets(ctx);

  const salts = {};
  for (const m of SIM_MARKETS) salts[m] = marketSalt(m);
  const runFn = vm.runInContext(buildRunHarness(salts, opts.runs), ctx);

  const tableRows = [];
  const allFlags = [];
  const report = { recordedAt: new Date().toISOString(), runs: opts.runs, years: BENCHMARK_YEARS, byCell: {} };

  const hdr =
    'Market'.padEnd(14) +
    'Year'.padEnd(6) +
    'St#'.padEnd(5) +
    'Cnt/run'.padEnd(22) +
    'Share mass'.padEnd(28) +
    '#1 subtype'.padEnd(22) +
    'Flags';
  console.log(hdr);
  console.log('-'.repeat(hdr.length));

  for (const marketId of SIM_MARKETS) {
    report.byCell[marketId] = {};
    for (const year of BENCHMARK_YEARS) {
      const rawRows = runFn(marketId, year, SEED, MAX_STEPS, opts.runs);
      const okRows = rawRows.filter((r) => r.ok);
      const bad = rawRows.filter((r) => !r.ok);
      if (bad.length) console.error(`  [${marketId} ${year}] failures: ${bad.length} — ${bad[0]?.err}`);

      enrichSpanishSubtypeOnRows(okRows, ctx, scaffoldOverrides);
      const sub = meanSpanishSubtypeAcrossRuns(okRows);
      const identity = MARKET_IDENTITY[marketId];
      const flags = evaluateFlags(marketId, year, sub, okRows, identity);
      const top = topSubtype(sub);
      const stMean = mean(okRows.map((r) => r.spanishStationCount));
      const skew = amFmSkewFromRows(okRows);

      const row = {
        marketId,
        year,
        meanSpanishStations: stMean,
        subtype: sub,
        topSubtype: top.id,
        topSubtypeSharePct: top.share,
        amFmSkew: skew,
        flags,
        identity: identity.label,
        leadershipWins: sub?.leadershipWinsBySubtype,
      };
      report.byCell[marketId][year] = row;
      tableRows.push(row);
      if (flags.length) allFlags.push({ marketId, year, flags });

      const line = [
        marketId.padEnd(14),
        String(year).padEnd(6),
        (stMean != null ? stMean.toFixed(2) : '—').padEnd(5),
        formatCounts(sub).padEnd(22),
        formatShares(sub).padEnd(28),
        `${top.id.replace('SPANISH_', '').replace('REGIONAL_MEXICAN', 'RM')} ${(top.share * 100).toFixed(0)}%`.padEnd(22),
        flags.join('|') || 'ok',
      ].join('');
      console.log(line);
    }
    console.log('');
  }

  console.log('── Future markets (market-affinity prior only; not in MARKETS / no sim) ──\n');
  for (const fid of ['houston', 'sanantonio']) {
    for (const year of BENCHMARK_YEARS) {
      const ar = affinityRow(fid, year);
      report.byCell[fid] = report.byCell[fid] || {};
      report.byCell[fid][year] = ar;
      console.log(
        `${fid.padEnd(14)} ${year}  prior #1: ${ar.topPrior}  (${ar.priorTop3})  — ${ar.identity}`,
      );
    }
    console.log('');
  }

  console.log('═══ AM/FM skew summary @2026 ═══\n');
  for (const marketId of SIM_MARKETS) {
    const row = report.byCell[marketId]?.[2026];
    const sk = row?.amFmSkew;
    if (!sk || sk.amN + sk.fmN === 0) {
      console.log(`  ${marketId}: (no AM/FM Spanish assignments)`);
      continue;
    }
    console.log(
      `  ${marketId}: AM n=${sk.amN} talk/regional ${sk.amTalkPct != null ? (sk.amTalkPct * 100).toFixed(0) : '—'}% music ${sk.amMusicPct != null ? (sk.amMusicPct * 100).toFixed(0) : '—'}% | ` +
        `FM n=${sk.fmN} music ${sk.fmMusicPct != null ? (sk.fmMusicPct * 100).toFixed(0) : '—'}% talk ${sk.fmTalkPct != null ? (sk.fmTalkPct * 100).toFixed(0) : '—'}%`,
    );
  }

  console.log('\n═══ Flags (implausible concentration / identity) ═══\n');
  if (!allFlags.length) console.log('  (none)');
  else {
    for (const f of allFlags) {
      console.log(`  ${f.marketId} ${f.year}: ${f.flags.join(', ')}`);
    }
  }

  console.log('\n═══ Heuristic Q&A (from this run) ═══\n');
  const recs = buildRecommendations(report, tableRows);
  for (const q of recs.answers) console.log(`  • ${q}`);
  console.log('\nRecommendations:');
  for (const r of recs.tweaks) console.log(`  - ${r}`);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify({ ...report, recommendations: recs }, null, 2)}\n`);
  console.log(`\nWrote ${outJson}`);
}

function buildRecommendations(report, tableRows) {
  const answers = [];
  const tweaks = [];

  const la26 = tableRows.find((r) => r.marketId === 'losangeles' && r.year === 2026);
  const phx26 = tableRows.find((r) => r.marketId === 'phoenix' && r.year === 2026);
  const nyc26 = tableRows.find((r) => r.marketId === 'newyork' && r.year === 2026);
  const chi26 = tableRows.find((r) => r.marketId === 'chicago' && r.year === 2026);
  const mia26 = tableRows.find((r) => r.marketId === 'miami' && r.year === 2026);

  if (la26) {
    const mono = la26.topSubtypeSharePct > 0.8;
    answers.push(
      mono
        ? `LA over-inferred as ${la26.topSubtype}: ${(la26.topSubtypeSharePct * 100).toFixed(0)}% of Spanish mass — monopoly risk.`
        : `LA Contemporary share ${((la26.subtype?.meanSubtypeSharePct?.SPANISH_CONTEMPORARY || 0) * 100).toFixed(0)}% with RM/Tropical present — mix looks plausible.`,
    );
    if (mono) tweaks.push('Lower mega+West FM contemporary stack or strengthen dial-position rotation for station 2+.');
  }

  if (phx26) {
    const rmShare = phx26.subtype?.meanSubtypeSharePct?.REGIONAL_MEXICAN || 0;
    answers.push(
      rmShare >= 0.7
        ? `Phoenix Regional Mexican dominance (${(rmShare * 100).toFixed(0)}%) — matches Sunbelt identity.`
        : `Phoenix RM share only ${(rmShare * 100).toFixed(0)}% — may need stronger Southwest prior.`,
    );
  }

  if (nyc26) {
    const news = nyc26.subtype?.meanSubtypeSharePct?.SPANISH_NEWS_TALK || 0;
    const cont = nyc26.subtype?.meanSubtypeSharePct?.SPANISH_CONTEMPORARY || 0;
    answers.push(
      news >= 0.35 && news <= 0.65
        ? `NYC news/talk ${(news * 100).toFixed(0)}% + contemporary ${(cont * 100).toFixed(0)}% — plausible mega spoken-word lean.`
        : `NYC news/talk ${(news * 100).toFixed(0)}% — ${news > 0.65 ? 'high' : 'low'} vs expected three-lane mix.`,
    );
    if ((nyc26.subtype?.meanSubtypeCounts?.SPANISH_TROPICAL || 0) < 0.3) {
      tweaks.push('NYC: bump tropical when caribbeanLean + 3+ Spanish stations (dial slot 2–3).');
    }
  }

  const earlyLa = tableRows.filter((r) => r.marketId === 'losangeles' && r.year === 1995);
  if (earlyLa.some((r) => r.flags.includes('EARLY_LOW_DIVERSITY'))) {
    answers.push('1995 LA: launch-year gates may be collapsing diversity when only 2 stations exist — expected.');
    tweaks.push('Relax launch-year penalty when station count ≤2 (use market prior lanes only).');
  }

  const amFlags = tableRows.filter((r) => r.flags.some((f) => f.startsWith('AM_')));
  if (amFlags.length) {
    answers.push(`AM skew flags on ${amFlags.length} cells — review AM bonus for news/regional vs FM music.`);
  } else {
    answers.push('AM/FM skew: no AM_MUSIC_HEAVY flags this run — band tendencies mostly coherent.');
  }

  if (mia26) {
    answers.push(
      mia26.flags.length
        ? `Miami (scaffold): ${mia26.flags.join(', ')} — verify after MARKETS merge.`
        : `Miami scaffold: top ${mia26.topSubtype} — tropical/news/contemporary mix ${formatShares(mia26.subtype)}.`,
    );
  }

  const hou26 = report.byCell.houston?.[2026];
  if (hou26?.topPrior === 'REGIONAL_MEXICAN') {
    answers.push('Houston stub prior: Regional Mexican #1 — aligned for future market.');
  }

  if (!tweaks.length) {
    tweaks.push('No mandatory heuristic changes; re-run after MARKETS adds Miami/Houston/San Antonio.');
  }

  return { answers, tweaks };
}

main();
