#!/usr/bin/env node
/**
 * Phoenix market truth audit — Hispanic-market architecture testbed (diagnostic only).
 *
 *   node scripts/diag-phoenix-truth-audit.mjs
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

const BENCHMARK_YEARS = [1975, 1985, 1995, 2005, 2026];
const RUNS = 8;
const SEED = 20260515;
const MAX_STEPS = 320;

/** Sunbelt Hispanic-market book-share priors (Duncan / Nielsen-shaped). */
const PHOENIX_GROUND_TRUTH = {
  1975: {
    label: '1975: AM country/MOR/TOP40; Spanish minimal; pre-boom',
    buckets: {
      TOP40_CHR: 0.22,
      AC_HOT_AC: 0.18,
      ROCK_ALT_AAA: 0.08,
      COUNTRY: 0.14,
      NEWS_TALK_SPORTS: 0.08,
      GOSPEL_CCM: 0.1,
      URBAN_RHYTHMIC: 0.08,
      SPANISH: 0.04,
      PUBLIC_RADIO: 0.04,
    },
  },
  1985: {
    label: '1985: FM growth; country + AC; Spanish emerging',
    buckets: {
      TOP40_CHR: 0.16,
      AC_HOT_AC: 0.14,
      ROCK_ALT_AAA: 0.12,
      COUNTRY: 0.12,
      NEWS_TALK_SPORTS: 0.1,
      GOSPEL_CCM: 0.08,
      URBAN_RHYTHMIC: 0.08,
      SPANISH: 0.08,
      PUBLIC_RADIO: 0.05,
    },
  },
  1995: {
    label: '1995: fragmented; Spanish meaningful; CHR viable',
    buckets: {
      TOP40_CHR: 0.12,
      AC_HOT_AC: 0.12,
      ROCK_ALT_AAA: 0.1,
      COUNTRY: 0.1,
      NEWS_TALK_SPORTS: 0.1,
      GOSPEL_CCM: 0.08,
      URBAN_RHYTHMIC: 0.1,
      SPANISH: 0.14,
      PUBLIC_RADIO: 0.05,
    },
  },
  2005: {
    label: '2005: Spanish top-tier lane; country present not dominant',
    buckets: {
      TOP40_CHR: 0.1,
      AC_HOT_AC: 0.1,
      ROCK_ALT_AAA: 0.1,
      COUNTRY: 0.08,
      NEWS_TALK_SPORTS: 0.1,
      GOSPEL_CCM: 0.08,
      URBAN_RHYTHMIC: 0.1,
      SPANISH: 0.18,
      PUBLIC_RADIO: 0.05,
    },
  },
  2026: {
    label: '2026: strong Spanish ecosystem; CHR viable; rock present not defining; country modest',
    buckets: {
      TOP40_CHR: 0.1,
      AC_HOT_AC: 0.1,
      ROCK_ALT_AAA: 0.1,
      COUNTRY: 0.08,
      NEWS_TALK_SPORTS: 0.1,
      GOSPEL_CCM: 0.08,
      URBAN_RHYTHMIC: 0.1,
      SPANISH: 0.22,
      PUBLIC_RADIO: 0.06,
    },
  },
};

const PHOENIX_MARKET = {
  id: 'phoenix',
  rankTier: 'large',
  archetypeId: 'sunbelt_diversified',
  culture: { country: 0.09, urban: 0.03, newsTalk: 0.07, religion: 0.09, spanish: 0.15 },
  countryBonus: 0.09,
  blackPop: 0.071,
  churchGoing: 0.46,
  eduIndex: 0.93,
  publicCivicIndex: 0.94,
  fmPenBias: 0.03,
  fmMusicFragMult: 1.03,
  hispPop1970: 0.085,
  hispPop2000: 0.22,
  hispPop2020: 0.301,
  urbanBonus: 0.03,
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
  const src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
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
  if (!parts.length) return { unique: 0, topShare: 0, spanishWins: 0, rockWins: 0 };
  const counts = parts.map((p) => {
    const [fmt, n] = p.split(':');
    return { fmt, n: parseInt(n, 10) || 0 };
  });
  const max = Math.max(...counts.map((c) => c.n));
  const sum = counts.reduce((a, c) => a + c.n, 0);
  const spanishWins = counts.filter((c) => c.fmt === 'SPANISH').reduce((a, c) => a + c.n, 0);
  const rockWins = counts
    .filter((c) => ['CLASSIC_ROCK', 'ALBUM_ROCK', 'ALT_ROCK', 'AAA'].includes(c.fmt))
    .reduce((a, c) => a + c.n, 0);
  return {
    unique: parts.length,
    topShare: sum ? max / sum : 0,
    spanishWins: sum ? spanishWins / sum : 0,
    rockWins: sum ? rockWins / sum : 0,
  };
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function rosterByFormat(stations, bookShares){
    var counts={}, shares={};
    for(var i=0;i<stations.length;i++){
      var s=stations[i];
      if(!s||s._bpSlotDeferred)continue;
      var fk=fmtKey(s.format);
      counts[fk]=(counts[fk]||0)+1;
      if(bookShares&&s.rat&&typeof s.rat.share==='number') shares[fk]=(shares[fk]||0)+s.rat.share;
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
      patched.push({idx:i,baseFmt:base.fmt,effFmt:eff.fmt,patched:!!(MARKET_BP_PATCH[marketId]&&MARKET_BP_PATCH[marketId][i])});
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
      if((bpYear===1970&&isBpSlotDeferred1970(bi,marketId))||tierTailDef.has(bi))
        stations.push({_bpSlotDeferred:true,_bpIdx:bi,_deferFreq:fq});
      else stations.push(mkStn(effBp,fq,bpYear));
    }
    var afterBp=rosterByFormat(stations,false);
    var preN=stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length;
    injectTierMarketCommercialExtras(stations,dialCtx,bpYear,commercialTarget);
    var injectFmts=stations.slice(preN).filter(function(s){return s&&!s._bpSlotDeferred;}).map(function(s){return fmtKey(s.format);});
    var afterInject=rosterByFormat(stations,false);
    var spanishQ=typeof marketSpanishLaunchesQueueForNewGame==='function'?marketSpanishLaunchesQueueForNewGame(marketId):[];
    var fragQ=typeof marketFragmentationLaunchesQueueForNewGame==='function'?marketFragmentationLaunchesQueueForNewGame(marketId):[];
    return {
      bpYear:bpYear, commercialTarget:commercialTarget,
      bpPatch:MARKET_BP_PATCH[marketId]||{},
      patchedSlots:patched.filter(function(p){return p.patched;}),
      nationalBpNote:'18-slot BP; Phoenix uses MARKET_BP_PATCH + phoenixDiag tier block (TOP40/HOT_AC/RHYTHMIC/URBAN)',
      afterBpRoster:afterBp.counts,
      tierInjectBlocked:typeof PHOENIX_DIAG_TIER_INJECT_BLOCK_FMTS!=='undefined'?PHOENIX_DIAG_TIER_INJECT_BLOCK_FMTS.slice():[],
      tierInject:injectFmts,
      afterInjectRoster:afterInject.counts,
      spanishLaunchSchedule:spanishQ.map(function(e){return e.y+':'+fmtKey(e.bp.fmt)+':'+(e.bp.str||'');}),
      fragmentationSchedule:fragQ.map(function(e){return e.y+':'+fmtKey(e.bp.fmt)+':'+(e.bp.str||'');}),
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
      return {
        ok:true, bookShares:roster.shares, leaderFmt:book[0]?fmtKey(book[0].format):'',
        hhi:hhi*10000, stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length,
        spanishStationCount:spanCount
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
  console.log('Phoenix market truth audit (Hispanic architecture testbed, diagnostic)\n');
  const ctx = loadCtx();
  const api = vm.runInContext(RUN_IIFE, ctx);

  const pipeline = api.traceGenPipeline('phoenix', 'chrwar');
  const eco = deriveMarketEcology(PHOENIX_MARKET, 'phoenix', 2026, null);
  const ecoPrior = expectedFormatLeadershipProfile(eco, 2026);

  const rows = [];
  for (const year of BENCHMARK_YEARS) {
    const salt = marketSalt('phoenix');
    const scen = genPath(year);
    for (let run = 0; run < RUNS; run++) {
      rows.push({
        marketId: 'phoenix',
        year,
        run,
        ...api.bookAtYear('phoenix', scen, year, SEED + salt * 17 + year * 10007 + run * 9973, MAX_STEPS),
      });
    }
  }

  const bad = rows.filter((r) => !r.ok);
  if (bad.length) console.error(`Failures: ${bad.length} — ${bad[0]?.err}`);

  console.log('═══ 1. Pipeline trace @ gen 1985 (chrwar) ═══\n');
  console.log('MARKET_BP_PATCH.phoenix:', JSON.stringify(pipeline.bpPatch));
  console.log(`commercialTarget=${pipeline.commercialTarget} tierTailDeferred=${pipeline.tierTailDeferred.length}`);
  console.log('tier inject blocked formats:', pipeline.tierInjectBlocked.join(', '));
  console.log('patched slots:', pipeline.patchedSlots.map((p) => `BP[${p.idx}] ${p.baseFmt}→${p.effFmt}`).join('; '));
  console.log('after BP:', JSON.stringify(pipeline.afterBpRoster));
  console.log('tier inject:', pipeline.tierInject.join(', ') || '(none)');
  console.log('after inject:', JSON.stringify(pipeline.afterInjectRoster));
  console.log('spanishLaunches:', pipeline.spanishLaunchSchedule.join(', '));
  console.log('fragmentationLaunches:', pipeline.fragmentationSchedule.join(', '));

  console.log('\n═══ 2. Ecology @2026 ═══\n');
  console.log(
    `spanishLanguageStrength=${eco.spanishLanguageStrength?.toFixed(3)} countryStrength=${eco.countryStrength?.toFixed(3)} aaaAlternativeStrength=${eco.aaaAlternativeStrength?.toFixed(3)}`,
  );
  console.log('expected leadership prior:', ecoPrior.serialized);
  console.log(`MARKETS: hispPop2020=${PHOENIX_MARKET.hispPop2020} culture.spanish=${PHOENIX_MARKET.culture.spanish}`);

  console.log('\n═══ 3. Book vs ground truth (8-run mean, leadership buckets %) ═══\n');
  console.log('Year\tSpan\tTruth\tCHR\tTruth\tCtry\tTruth\tRock\tTruth\tTalk\tTruth\tPub\tHHI\t#1\tSpan#1%');
  const bookByYear = {};
  for (const year of BENCHMARK_YEARS) {
    const s = summarizeBookRows(rows, 'phoenix', year);
    bookByYear[year] = { summary: s, truth: PHOENIX_GROUND_TRUTH[year] };
    if (!s) continue;
    const b = s.meanBuckets;
    const gt = PHOENIX_GROUND_TRUTH[year].buckets;
    console.log(
      [
        year,
        (b.SPANISH * 100).toFixed(1),
        (gt.SPANISH * 100).toFixed(0),
        (b.TOP40_CHR * 100).toFixed(1),
        (gt.TOP40_CHR * 100).toFixed(0),
        (b.COUNTRY * 100).toFixed(1),
        (gt.COUNTRY * 100).toFixed(0),
        (b.ROCK_ALT_AAA * 100).toFixed(1),
        (gt.ROCK_ALT_AAA * 100).toFixed(0),
        (b.NEWS_TALK_SPORTS * 100).toFixed(1),
        (gt.NEWS_TALK_SPORTS * 100).toFixed(0),
        (b.PUBLIC_RADIO * 100).toFixed(1),
        (gt.PUBLIC_RADIO * 100).toFixed(0),
        s.hhi.toFixed(0),
        s.histStr,
        `${(s.leaderConc.spanishWins * 100).toFixed(0)}%`,
      ].join('\t'),
    );
  }

  console.log('\n═══ 4. Largest gaps vs truth @2026 ═══\n');
  const y26 = bookByYear[2026]?.summary;
  if (y26) {
    const d = bucketDelta(y26.meanBuckets, PHOENIX_GROUND_TRUTH[2026].buckets);
    for (const x of largestDivergences(d, 6)) {
      const sign = x.v >= 0 ? '+' : '';
      console.log(`  ${x.k}: ${sign}${(x.v * 100).toFixed(1)} pp`);
    }
    console.log(`  Spanish stations on dial (mean): ${y26.spanishStations?.toFixed(1)}`);
    console.log(`  rock #1 wins: ${(y26.leaderConc.rockWins * 100).toFixed(0)}%`);
  }

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(
    path.join(root, 'tmp', 'phoenix_truth_audit.json'),
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runs: RUNS,
        seed: SEED,
        pipeline,
        ecology2026: eco,
        ecologyPrior2026: ecoPrior.serialized,
        book: BENCHMARK_YEARS.map((y) => bookByYear[y]),
        diagnosisQuestions: {
          earlySpanishSeeding: 'spanishLaunches start 1994; tier inject may add SPANISH but blocked CHR path dominates',
          weakSpanishAppeal: 'mktFmt uses culture.spanish*0.18; LA gets +0.065, Phoenix does not',
          rockInertia: 'fragmentationLaunches: 2x CLASSIC_ROCK (1986,1991 strong); phoenixDiagOpeningOqMult FM rock ×1.1',
          countryCarryover: 'ecology countryStrength 0.50; BP patch + countryBonus 0.09',
          demographicInfluence: 'hispPop2020 0.301 vs spanish book ~10% — launch/appeal gap',
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log('\nWrote tmp/phoenix_truth_audit.json');
}

main();
