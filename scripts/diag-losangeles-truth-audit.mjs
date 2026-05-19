#!/usr/bin/env node
/**
 * Los Angeles market truth audit — book vs Duncan/LA-format priors (diagnostic only).
 *
 *   node scripts/diag-losangeles-truth-audit.mjs
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { deriveMarketEcology } from '../src/marketEcology.js';
import {
  aggregateMeansToLeadershipBuckets,
  expectedFormatLeadershipProfile,
  LEADERSHIP_BUCKET_KEYS,
} from './expectedFormatLeadershipProfile.mjs';
import { TRUTH_AUDIT_SPANISH_BOOK_SNIPPET } from './spanishSubtypeHelpers.mjs';
import {
  enrichSpanishSubtypeOnRows,
  formatSpanishSubtypeBlock,
  meanSpanishSubtypeAcrossRuns,
} from './spanishSubtypeDiagnostics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

const BENCHMARK_YEARS = [1975, 1985, 1995, 2005, 2026];
const RUNS = 8;
const SEED = 20260515;
const MAX_STEPS = 320;

/**
 * LA book-share priors — Duncan mega arc + LA Hispanic radio reality.
 * LA hispPop2020 45% / culture.spanish 22% → strongest US Spanish cluster,
 * but mega English dial + talk/CHR/urban fragmentation caps aggregate share vs Sunbelt.
 * Spanish #1: fragmented (Spanish wins some books; not lockout).
 */
const LA_GROUND_TRUTH = {
  1975: {
    label: 'Duncan 1975: AM heritage; early Spanish AM; CHR/MOR/urban; country thin',
    buckets: {
      TOP40_CHR: 0.26,
      AC_HOT_AC: 0.2,
      ROCK_ALT_AAA: 0.08,
      COUNTRY: 0.03,
      NEWS_TALK_SPORTS: 0.08,
      GOSPEL_CCM: 0.06,
      URBAN_RHYTHMIC: 0.14,
      SPANISH: 0.08,
      PUBLIC_RADIO: 0.05,
    },
    spanishNum1Range: [0, 0.15],
    leaderDiversity: 'moderate',
  },
  1985: {
    label: 'Duncan 1985: FM fragmentation; Spanish growing; CHR/AC/rock battle',
    buckets: {
      TOP40_CHR: 0.18,
      AC_HOT_AC: 0.16,
      ROCK_ALT_AAA: 0.16,
      COUNTRY: 0.04,
      NEWS_TALK_SPORTS: 0.1,
      GOSPEL_CCM: 0.05,
      URBAN_RHYTHMIC: 0.12,
      SPANISH: 0.12,
      PUBLIC_RADIO: 0.05,
    },
    spanishNum1Range: [0, 0.25],
    leaderDiversity: 'high',
  },
  1995: {
    label: 'Duncan 1995: mega fragmentation; Spanish meaningful; talk rising',
    buckets: {
      TOP40_CHR: 0.14,
      AC_HOT_AC: 0.14,
      ROCK_ALT_AAA: 0.14,
      COUNTRY: 0.05,
      NEWS_TALK_SPORTS: 0.14,
      GOSPEL_CCM: 0.05,
      URBAN_RHYTHMIC: 0.12,
      SPANISH: 0.14,
      PUBLIC_RADIO: 0.06,
    },
    spanishNum1Range: [0.1, 0.35],
    leaderDiversity: 'high',
  },
  2005: {
    label: 'Duncan 2005: Spanish top-tier; talk + urban; CHR viable; weak country',
    buckets: {
      TOP40_CHR: 0.1,
      AC_HOT_AC: 0.12,
      ROCK_ALT_AAA: 0.12,
      COUNTRY: 0.05,
      NEWS_TALK_SPORTS: 0.16,
      GOSPEL_CCM: 0.05,
      URBAN_RHYTHMIC: 0.12,
      SPANISH: 0.16,
      PUBLIC_RADIO: 0.06,
    },
    spanishNum1Range: [0.15, 0.45],
    leaderDiversity: 'high',
  },
  2026: {
    label: 'LA 2026: Spanish major lane (~16–18% book); fragmented #1 (talk/CHR/Spanish/urban); rock present',
    buckets: {
      TOP40_CHR: 0.09,
      AC_HOT_AC: 0.1,
      ROCK_ALT_AAA: 0.12,
      COUNTRY: 0.06,
      NEWS_TALK_SPORTS: 0.14,
      GOSPEL_CCM: 0.05,
      URBAN_RHYTHMIC: 0.14,
      SPANISH: 0.17,
      PUBLIC_RADIO: 0.07,
    },
    spanishNum1Range: [0.2, 0.45],
    leaderDiversity: 'high',
  },
};

const LA_MARKET = {
  id: 'losangeles',
  rankTier: 'mega',
  archetypeId: 'west_fm_fragmented',
  culture: { country: 0.03, urban: 0.12, newsTalk: 0.07, religion: 0.05, spanish: 0.22 },
  countryBonus: 0.02,
  blackPop: 0.14,
  churchGoing: 0.38,
  eduIndex: 1.14,
  publicCivicIndex: 1.03,
  fmPenBias: 0.068,
  fmMusicFragMult: 1.1,
  hispPop1970: 0.14,
  hispPop2000: 0.38,
  hispPop2020: 0.45,
  urbanBonus: 0.12,
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
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        return a;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
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

function loadCtx() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let src = readFileSync(legacyPath, 'utf8');
  src = injectHeadlessLaunchNewsGuard(src);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 240_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function mean(xs) {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function bucketDelta(actual, expected) {
  const out = {};
  for (const k of LEADERSHIP_BUCKET_KEYS) out[k] = (actual[k] ?? 0) - (expected[k] ?? 0);
  return out;
}

function largestDivergences(delta, n = 5) {
  return Object.entries(delta)
    .map(([k, v]) => ({ k, v, abs: Math.abs(v) }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, n);
}

function leaderConcentration(histStr) {
  const parts = (histStr || '').split('|').filter(Boolean);
  if (!parts.length) return { unique: 0, topShare: 0, spanishWins: 0 };
  const counts = parts.map((p) => parseInt(p.split(':')[1], 10) || 0);
  const max = Math.max(...counts);
  const sum = counts.reduce((a, b) => a + b, 0);
  const spanPart = parts.find((p) => p.startsWith('SPANISH:'));
  const spanWins = spanPart ? parseInt(spanPart.split(':')[1], 10) || 0 : 0;
  return { unique: parts.length, topShare: sum ? max / sum : 0, spanishWins: sum ? spanWins / sum : 0 };
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function rosterByFormat(stations, bookShares){
    const counts={}, shares={};
    for(var i=0;i<stations.length;i++){
      var s=stations[i];
      if(!s||s._bpSlotDeferred)continue;
      var fk=fmtKey(s.format);
      counts[fk]=(counts[fk]||0)+1;
      if(bookShares&&s.rat&&typeof s.rat.share==='number'){
        shares[fk]=(shares[fk]||0)+s.rat.share;
      }
    }
    return {counts:counts, shares:shares};
  }
  function traceGenPipeline(marketId, scenId){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    UC=new Set();amfIdx=0;fmfIdx=0;
    _gbBrandIdTaken=new Set();
    setNextFreqListsForMarket(marketId);
    shuffleFreqListsForNewGame();
    var sc=SC.find(function(s){return s.id===scenId;})||SC[0];
    var bpYear=sc.startYear||1970;
    var patched=[];
    for(var i=0;i<BP.length;i++){
      var base=BP[i];
      var eff=effectiveBpForMarket(i, marketId);
      var hasPatch=!!(MARKET_BP_PATCH[marketId]&&MARKET_BP_PATCH[marketId][i]);
      patched.push({idx:i,baseFmt:base.fmt,effFmt:eff.fmt,effType:eff.type,patched:hasPatch});
    }
    var stations=[];
    var dialCtx={stations:stations, marketId:marketId};
    var commercialTarget=tierMarketCommercialTargetForGen(marketId,bpYear);
    var atlantaDefSet=new Set();
    if(bpYear===1970){
      for(var di=0;di<BP.length;di++) if(isBpSlotDeferred1970(di,marketId)) atlantaDefSet.add(di);
    }
    var tierTailDef=tierMarketBpTailDeferIndices(marketId,commercialTarget,atlantaDefSet,new Set());
    for(var bi=0;bi<BP.length;bi++){
      var effBp=effectiveBpForMarket(bi, marketId);
      effBp=adjustBlueprintForMarketDial(effBp, bi, marketId);
      var fq=nextUnusedCommercialFreq(dialCtx, effBp.type);
      if(fq==null) throw new Error('freq null slot '+bi);
      if((bpYear===1970&&isBpSlotDeferred1970(bi,marketId))||tierTailDef.has(bi))
        stations.push({_bpSlotDeferred:true,_bpIdx:bi,_deferFreq:fq});
      else stations.push(mkStn(effBp,fq,bpYear));
    }
    var afterBp=rosterByFormat(stations,false);
    var preN=stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length;
    injectTierMarketCommercialExtras(stations,dialCtx,bpYear,commercialTarget);
    var injectFmts=stations.slice(preN).filter(function(s){return s&&!s._bpSlotDeferred;}).map(function(s){return fmtKey(s.format);});
    var afterInject=rosterByFormat(stations,false);
    var megaFrag=[];
    if(typeof megaMarketFragmentationQueueForNewGame==='function'&&isMegaMarketId(marketId)){
      megaFrag=megaMarketFragmentationQueueForNewGame(marketId).map(function(e){return e.y+':'+fmtKey(e.bp.fmt)+':'+(e.bp.str||'');});
    }
    var spanishQ=[];
    if(typeof marketSpanishLaunchesDefs==='function'){
      spanishQ=marketSpanishLaunchesDefs(marketId).map(function(e){return e.y+':'+fmtKey(e.bp.fmt)+':'+(e.bp.str||'');});
    }
    return {
      bpYear:bpYear, commercialTarget:commercialTarget,
      bpPatch:MARKET_BP_PATCH[marketId]||{},
      patchedSlots:patched.filter(function(p){return p.patched;}),
      afterBpRoster:afterBp.counts,
      tierInject:injectFmts,
      afterInjectRoster:afterInject.counts,
      megaFragSchedule:megaFrag,
      spanishLaunchSchedule:spanishQ,
      tierTailDeferred:[].slice.call(tierTailDef)
    };
  }
  function bookAtYear(marketId, genScenId, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      var sc=SC.find(function(x){return x.id===genScenId;});
      var oi=sc.idx; sc.idx=[];
      G=genMarket(genScenId);
      sc.idx=oi;
      G.stations.forEach(function(st){st.isPlayer=false;});
      G.ps=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===targetYear&&G.period===1)break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>1)) return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==1) return {ok:false,err:'miss'};
      var book=G.stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
      book.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
      var roster=rosterByFormat(G.stations,true);
      var hhi=0;
      for(var j=0;j<book.length;j++){var sh=book[j].rat.share||0; hhi+=sh*sh;}
      var spanCount=G.stations.filter(function(st){return st&&!st._bpSlotDeferred&&fmtKey(st.format)==='SPANISH';}).length;
      ${TRUTH_AUDIT_SPANISH_BOOK_SNIPPET}
      return {
        ok:true, bookShares:roster.shares, leaderFmt:book[0]?fmtKey(book[0].format):'',
        hhi:hhi*10000, stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length,
        spanishStationCount:spanCount,
        spanishBookStations:spanishBookStations
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { traceGenPipeline: traceGenPipeline, bookAtYear: bookAtYear };
})();
`;

function fmtSharesToBuckets(shares) {
  const fmtAgg = Object.entries(shares || {})
    .map(([k, v]) => ({ k, m: v }))
    .sort((a, b) => b.m - a.m);
  return aggregateMeansToLeadershipBuckets(fmtAgg).buckets;
}

function summarizeBookRows(rows, marketId, year) {
  const list = rows.filter((r) => r.ok && r.marketId === marketId && r.year === year);
  if (!list.length) return null;
  const hist = {};
  for (const r of list) {
    const k = r.leaderFmt || '?';
    hist[k] = (hist[k] || 0) + 1;
  }
  const histStr = Object.keys(hist)
    .sort((a, b) => hist[b] - hist[a])
    .map((k) => `${k}:${hist[k]}`)
    .join('|');
  const bucketRuns = list.map((r) => fmtSharesToBuckets(r.bookShares));
  const meanBuckets = {};
  for (const k of LEADERSHIP_BUCKET_KEYS) {
    meanBuckets[k] = bucketRuns.reduce((s, b) => s + (b[k] ?? 0), 0) / bucketRuns.length;
  }
  return {
    meanBuckets,
    hhi: mean(list.map((r) => r.hhi)),
    histStr,
    leaderConc: leaderConcentration(histStr),
    stations: mean(list.map((r) => r.stationCount)),
    spanishStations: mean(list.map((r) => r.spanishStationCount)),
  };
}

function genPath(year) {
  return year <= 1975 ? 'under' : 'chrwar';
}

function main() {
  console.log('Los Angeles market truth audit (diagnostic)\n');
  const ctx = loadCtx();
  const api = vm.runInContext(RUN_IIFE, ctx);

  const pipeline = api.traceGenPipeline('losangeles', 'chrwar');
  const nycPipe = api.traceGenPipeline('newyork', 'chrwar');

  const rows = [];
  for (const year of BENCHMARK_YEARS) {
    const salt = marketSalt('losangeles');
    const scen = genPath(year);
    for (let run = 0; run < RUNS; run++) {
      rows.push({
        marketId: 'losangeles',
        year,
        run,
        ...api.bookAtYear('losangeles', scen, year, SEED + salt * 17 + year * 10007 + run * 9973, MAX_STEPS),
      });
    }
  }

  const bad = rows.filter((r) => !r.ok);
  if (bad.length) console.error(`Failures: ${bad.length} — ${bad[0]?.err}`);

  enrichSpanishSubtypeOnRows(rows, ctx, { losangeles: LA_MARKET });

  console.log('═══ 1. Pipeline trace @ gen 1985 (chrwar) ═══\n');
  console.log('losangeles MARKET_BP_PATCH:', JSON.stringify(pipeline.bpPatch));
  console.log(`commercialTarget=${pipeline.commercialTarget}`);
  console.log('tier inject:', pipeline.tierInject.join(', ') || '(none)');
  console.log('after inject:', JSON.stringify(pipeline.afterInjectRoster));
  console.log('MEGA_MARKET_FRAGMENTATION:', pipeline.megaFragSchedule.join(', '));
  console.log('marketSpanishLaunchesDefs (mega supplemental):', pipeline.spanishLaunchSchedule.join(', '));
  console.log('\nnewyork spanish schedule (compare):', nycPipe.spanishLaunchSchedule.join(', '));

  console.log('\n═══ 2. Book vs LA ground truth (8-run mean, leadership buckets %) ═══\n');
  console.log('Year\tSpan\tTruth\tTalk\tTruth\tCHR\tTruth\tRock\tTruth\tSpanStn\tSpan#1%\tHHI\t#1');
  for (const year of BENCHMARK_YEARS) {
    const s = summarizeBookRows(rows, 'losangeles', year);
    const gt = LA_GROUND_TRUTH[year].buckets;
    if (!s) continue;
    const b = s.meanBuckets;
    const gtR = LA_GROUND_TRUTH[year].spanishNum1Range;
    const span1Ok = s.leaderConc.spanishWins >= gtR[0] && s.leaderConc.spanishWins <= gtR[1];
    console.log(
      [
        year,
        (b.SPANISH * 100).toFixed(1),
        (gt.SPANISH * 100).toFixed(0),
        (b.NEWS_TALK_SPORTS * 100).toFixed(1),
        (gt.NEWS_TALK_SPORTS * 100).toFixed(0),
        (b.TOP40_CHR * 100).toFixed(1),
        (gt.TOP40_CHR * 100).toFixed(0),
        (b.ROCK_ALT_AAA * 100).toFixed(1),
        (gt.ROCK_ALT_AAA * 100).toFixed(0),
        s.spanishStations.toFixed(1),
        `${(s.leaderConc.spanishWins * 100).toFixed(0)}%${span1Ok ? '' : ' !'}`,
        s.hhi.toFixed(0),
        s.histStr,
      ].join('\t'),
    );
  }

  console.log('\n═══ 3. Largest gaps vs truth @2026 ═══\n');
  const y26 = summarizeBookRows(rows, 'losangeles', 2026);
  if (y26) {
    const gt = LA_GROUND_TRUTH[2026];
    const d = bucketDelta(y26.meanBuckets, gt.buckets);
    for (const x of largestDivergences(d, 6)) {
      const sign = x.v >= 0 ? '+' : '';
      console.log(`  ${x.k}: ${sign}${(x.v * 100).toFixed(1)} pp`);
    }
    console.log(`  Spanish stations: ${y26.spanishStations.toFixed(1)}`);
    console.log(
      `  Spanish #1 wins: ${(y26.leaderConc.spanishWins * 100).toFixed(0)}% (truth range ${(gt.spanishNum1Range[0] * 100).toFixed(0)}–${(gt.spanishNum1Range[1] * 100).toFixed(0)}%)`,
    );
    console.log(`  #1 hist: ${y26.histStr}`);
    const spanShare = y26.meanBuckets.SPANISH * 100;
    const spanTruth = gt.buckets.SPANISH * 100;
    if (spanShare > spanTruth + 4) console.log('  → Spanish SHARE likely overcorrected (+4pp vs truth band)');
    if (y26.leaderConc.spanishWins > gt.spanishNum1Range[1] + 0.15) {
      console.log('  → Spanish #1 leadership likely overcorrected (lockout vs fragmented truth)');
    }
  }

  console.log('\n═══ 4. Spanish subtype inference (Phase 1 diag) ═══\n');
  for (const year of BENCHMARK_YEARS) {
    const list = rows.filter((r) => r.ok && r.year === year);
    console.log(`${year}:\n${formatSpanishSubtypeBlock(meanSpanishSubtypeAcrossRuns(list), '  ')}`);
  }

  const eco = deriveMarketEcology(LA_MARKET, 'losangeles', 2026, null);
  const ecoPrior = expectedFormatLeadershipProfile(eco, 2026);
  console.log('\nEcology trait prior @2026:', ecoPrior.serialized);
  console.log('MARKETS: hispPop2020=0.45 culture.spanish=0.22');

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(
    path.join(root, 'tmp', 'losangeles_truth_audit.json'),
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runs: RUNS,
        seed: SEED,
        groundTruthNotes:
          'LA priors: Duncan mega + Nielsen-shaped; 2026 Spanish book ~17%; #1 fragmented 20–45% Spanish wins',
        pipeline,
        book: BENCHMARK_YEARS.map((y) => ({
          year: y,
          summary: summarizeBookRows(rows, 'losangeles', y),
          truth: LA_GROUND_TRUTH[y],
        })),
        spanishSubtypeByYear: Object.fromEntries(
          BENCHMARK_YEARS.map((y) => [
            y,
            meanSpanishSubtypeAcrossRuns(rows.filter((r) => r.ok && r.year === y)),
          ]),
        ),
        ecologyPrior2026: ecoPrior.serialized,
      },
      null,
      2,
    )}\n`,
  );
  console.log('\nWrote tmp/losangeles_truth_audit.json');
}

main();
