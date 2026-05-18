#!/usr/bin/env node
/**
 * Wichita market truth audit — pipeline trace vs Nashville control; book vs ground truth.
 * Diagnostic only — does not modify shipped gameplay.
 *
 *   node scripts/diag-wichita-truth-audit.mjs
 *
 * Output: tmp/wichita_truth_audit.json
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
const MAX_STEPS = 280;

/** RadioInsight / Nielsen qualitative + Duncan small-market arc (book-share priors, not station counts). */
const WICHITA_GROUND_TRUTH = {
  1975: {
    label: 'Duncan mid-70s: AM heritage, country + top40 + MOR, gospel daytimers',
    buckets: {
      COUNTRY: 0.2,
      TOP40_CHR: 0.18,
      ROCK_ALT_AAA: 0.08,
      AC_HOT_AC: 0.1,
      NEWS_TALK_SPORTS: 0.12,
      GOSPEL_CCM: 0.12,
      URBAN_RHYTHMIC: 0.04,
      SPANISH: 0.02,
      PUBLIC_RADIO: 0.04,
    },
  },
  1985: {
    label: 'Duncan late-80s: FM country emerging, AOR fights, AM talk pivot begins',
    buckets: {
      COUNTRY: 0.22,
      ROCK_ALT_AAA: 0.16,
      TOP40_CHR: 0.12,
      AC_HOT_AC: 0.14,
      NEWS_TALK_SPORTS: 0.14,
      GOSPEL_CCM: 0.1,
      URBAN_RHYTHMIC: 0.05,
      SPANISH: 0.03,
      PUBLIC_RADIO: 0.04,
    },
  },
  1995: {
    label: 'Duncan 90s: FM country + classic rock; AM music dying',
    buckets: {
      COUNTRY: 0.24,
      ROCK_ALT_AAA: 0.18,
      TOP40_CHR: 0.1,
      AC_HOT_AC: 0.12,
      NEWS_TALK_SPORTS: 0.16,
      GOSPEL_CCM: 0.08,
      URBAN_RHYTHMIC: 0.04,
      SPANISH: 0.03,
      PUBLIC_RADIO: 0.05,
    },
  },
  2005: {
    label: 'Duncan 2000s: country still core; CHR resistance; talk steady',
    buckets: {
      COUNTRY: 0.26,
      ROCK_ALT_AAA: 0.14,
      TOP40_CHR: 0.08,
      AC_HOT_AC: 0.12,
      NEWS_TALK_SPORTS: 0.18,
      GOSPEL_CCM: 0.1,
      URBAN_RHYTHMIC: 0.04,
      SPANISH: 0.04,
      PUBLIC_RADIO: 0.04,
    },
  },
  2026: {
    label: 'RadioInsight 2025–26: country #1–#2 cluster; AC/classic hits; thin Spanish; news/talk meaningful',
    buckets: {
      COUNTRY: 0.28,
      ROCK_ALT_AAA: 0.12,
      TOP40_CHR: 0.08,
      AC_HOT_AC: 0.14,
      NEWS_TALK_SPORTS: 0.16,
      GOSPEL_CCM: 0.1,
      URBAN_RHYTHMIC: 0.05,
      SPANISH: 0.04,
      PUBLIC_RADIO: 0.03,
    },
  },
};

const WICHITA_MARKET = {
  id: 'wichita',
  rankTier: 'small',
  archetypeId: 'midwest_legacy',
  culture: { country: 0.14, urban: 0.04, newsTalk: 0.05, religion: 0.09, spanish: 0.04 },
  countryBonus: 0.1,
  blackPop: 0.11,
  churchGoing: 0.52,
  eduIndex: 0.9,
  publicCivicIndex: 0.94,
  fmPenBias: -0.04,
  fmMusicFragMult: 0.98,
  hispPop2020: 0.16,
};

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
  src = injectHeadlessMegaFragNewsGuard(src);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 180_000 });
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

function expectedEcologyBuckets(marketRow, marketId, year) {
  const eco = deriveMarketEcology(marketRow, marketId, year, null);
  return expectedFormatLeadershipProfile(eco, year).buckets;
}

function bucketDelta(actual, expected) {
  const out = {};
  for (const k of LEADERSHIP_BUCKET_KEYS) {
    out[k] = (actual[k] ?? 0) - (expected[k] ?? 0);
  }
  return out;
}

function largestDivergences(delta, n = 3) {
  return Object.entries(delta)
    .map(([k, v]) => ({ k, v, abs: Math.abs(v) }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, n);
}

const TRACE_AND_BOOK_IIFE = `
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
  function sortFmtMap(m){
    return Object.keys(m).sort(function(a,b){return (m[b]||0)-(m[a]||0);}).map(function(k){return k+':'+((m[k]*1000|0)/10);}).join('|');
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
    var nationalBp=[];
    for(var i=0;i<BP.length;i++){
      var base=BP[i];
      var eff0=effectiveBpForMarket(i, marketId);
      var eff=adjustBlueprintForMarketDial(eff0, i, marketId);
      var map=(MARKETS[marketId]||{}).dialBpAmToFm;
      var remapped=!!(map&&map[i]&&eff0.type==='AM');
      nationalBp.push({
        idx:i, baseFmt:base.fmt, baseType:base.type, baseStr:base.str,
        effFmt:eff.fmt, effType:eff.type, effStr:eff.str, remapped:remapped,
        patch:!!(MARKET_BP_PATCH[marketId]&&MARKET_BP_PATCH[marketId][i])
      });
    }
    var stations=[];
    var dialCtx={stations:stations, marketId:marketId};
    var tierDialScaling=tierUsesDialScaling(marketId)&&sc.id!=='tutorial_turnaround';
    var commercialTarget=tierDialScaling?tierMarketCommercialTargetForGen(marketId,bpYear):19;
    var atlantaDefSet=new Set();
    if(bpYear===1970){
      for(var di=0;di<BP.length;di++) if(isBpSlotDeferred1970(di,marketId)) atlantaDefSet.add(di);
    }
    var playerBpIdxSet=new Set(Array.isArray(sc.idx)?sc.idx:[]);
    var tierTailDef=tierDialScaling?tierMarketBpTailDeferIndices(marketId,commercialTarget,atlantaDefSet,playerBpIdxSet):new Set();
    var afterBp=[];
    for(var bi=0;bi<BP.length;bi++){
      var effBp=effectiveBpForMarket(bi, marketId);
      effBp=adjustBlueprintForMarketDial(effBp, bi, marketId);
      var fq=nextUnusedCommercialFreq(dialCtx, effBp.type);
      if(fq==null) throw new Error('freq null slot '+bi);
      if((bpYear===1970&&isBpSlotDeferred1970(bi,marketId))||tierTailDef.has(bi))
        stations.push({_bpSlotDeferred:true,_bpIdx:bi,_deferFreq:fq});
      else
        stations.push(mkStn(effBp,fq,bpYear));
    }
    var afterBpRoster=rosterByFormat(stations,false);
    var preInjectCount=stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length;
    if(tierDialScaling) injectTierMarketCommercialExtras(stations,dialCtx,bpYear,commercialTarget);
    var injectAdded=stations.slice(preInjectCount).filter(function(s){return s&&!s._bpSlotDeferred;});
    var injectFormats=injectAdded.map(function(s){return fmtKey(s.format);});
    var afterInjectRoster=rosterByFormat(stations,false);
    var preRivalCount=stations.length;
    var rivalsAdded=[];
    if(bpYear>1970){
      var preEvents=EVDATA.filter(function(ev){return ev.y<bpYear&&ev.e&&ev.e.indexOf('rival-')>=0;});
      preEvents.forEach(function(ev){
        ev.e.split('|').filter(function(p){return p.indexOf('rival-')===0;}).forEach(function(part){
          var bits=part.split('-');
          var fmt=bits[1], type=bits[2], pw=bits[3], str=bits[4];
          if(!fmt||!FM[fmt]) return;
          var already=stations.some(function(s){return s&&!s._bpSlotDeferred&&s.format===fmt&&!s.isPlayer;});
          if(already) return;
          var freq2=nextUnusedCommercialFreq({stations:stations,marketId:marketId},type);
          if(!freq2) return;
          stations.push(mkStn({type:type,fmt:fmt,pw:pw,str:str},freq2,bpYear));
          rivalsAdded.push(fmtKey(fmt));
        });
      });
    }
    var afterRivalRoster=rosterByFormat(stations,false);
    return {
      bpYear:bpYear,
      commercialTarget:commercialTarget,
      tierDialScaling:tierDialScaling,
      tierTailDeferred:[].slice.call(tierTailDef),
      nationalBp:nationalBp,
      dialBpAmToFm:JSON.parse(JSON.stringify((MARKETS[marketId]||{}).dialBpAmToFm||{})),
      afterBpRoster:afterBpRoster,
      tierInjectFormats:injectFormats,
      afterInjectRoster:afterInjectRoster,
      preGenRivalFormats:rivalsAdded,
      afterRivalRoster:afterRivalRoster,
      finalGenCount:stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length
    };
  }
  function bookAtYear(marketId, genScenId, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    var eraMap={'1970':'under','1978':'fmrev','1985':'chrwar'};
    var scen=genScenId||'chrwar';
    var sc=SC.find(function(x){return x.id===scen;});
    var origIdx=sc.idx; sc.idx=[];
    G=genMarket(scen);
    sc.idx=origIdx;
  G.stations.forEach(function(st){st.isPlayer=false;});
    G.ps=[];
    var steps=0;
    while(steps<maxSteps){
      if(G.year===targetYear&&G.period===1) break;
      if(G.year>targetYear||(G.year===targetYear&&G.period>1)) return {ok:false,err:'overshoot'};
      var ui=window._harnessPatchTimersAndUi();
      try{ advTurn(); }finally{ ui.restore(); }
      steps++;
    }
    if(G.year!==targetYear||G.period!==1) return {ok:false,err:'miss'};
    var book=G.stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
    book.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    var roster=rosterByFormat(G.stations,true);
    var lead=book[0]||null;
    var hhi=0;
    for(var j=0;j<book.length;j++){var sh=book[j].rat.share||0; hhi+=sh*sh;}
    return {
      ok:true,
      genYear:G.scenario&&G.scenario.startYear!=null?G.scenario.startYear:(sc.startYear||1970),
      bookShares:roster.shares,
      rosterCounts:roster.counts,
      leaderFmt:lead?fmtKey(lead.format):'',
      hhi:hhi*10000
    };
  }
  return { traceGenPipeline: traceGenPipeline, bookAtYear: bookAtYear };
})();
`;

function genPathForBenchmarkYear(year) {
  if (year <= 1975) return { genScen: 'under', genYear: 1970, note: 'gen 1970 → sim to target' };
  if (year === 1985) return { genScen: 'chrwar', genYear: 1985, note: 'gen 1985' };
  return { genScen: 'chrwar', genYear: 1985, note: 'gen 1985 → sim to target' };
}

function fmtSharesToBuckets(shares) {
  const fmtAgg = Object.entries(shares || {})
    .map(([k, v]) => ({ k, m: v }))
    .sort((a, b) => b.m - a.m);
  return aggregateMeansToLeadershipBuckets(fmtAgg).buckets;
}

function main() {
  console.log('Wichita market truth audit (diagnostic)\n');
  const ctx = loadCtx();
  const api = vm.runInContext(TRACE_AND_BOOK_IIFE, ctx);

  const pipeline = {};
  for (const mid of ['wichita', 'nashville']) {
    const scen = mid === 'wichita' ? 'chrwar' : 'chrwar';
    pipeline[mid] = api.traceGenPipeline(mid, scen);
  }

  const bookResults = { wichita: {}, nashville: {} };
  for (const mid of ['wichita', 'nashville']) {
    const salt = marketSalt(mid);
    for (const year of BENCHMARK_YEARS) {
      const path = genPathForBenchmarkYear(year);
      const runs = [];
      for (let run = 0; run < RUNS; run++) {
        const s0 = SEED + salt * 17 + year * 10007 + run * 9973;
        const r = api.bookAtYear(mid, path.genScen, year, s0, MAX_STEPS);
        runs.push(r);
      }
      const ok = runs.filter((r) => r.ok);
      if (!ok.length) {
        bookResults[mid][year] = { error: runs[0]?.err || 'no ok runs' };
        continue;
      }
      const bucketRuns = ok.map((r) => fmtSharesToBuckets(r.bookShares));
      const meanBuckets = {};
      for (const k of LEADERSHIP_BUCKET_KEYS) {
        meanBuckets[k] = mean(bucketRuns.map((b) => b[k] ?? 0));
      }
      const hist = {};
      for (const r of ok) {
        const k = r.leaderFmt || '?';
        hist[k] = (hist[k] || 0) + 1;
      }
      bookResults[mid][year] = {
        genPath: path,
        meanBuckets,
        meanBucketsPct: Object.fromEntries(
          LEADERSHIP_BUCKET_KEYS.map((k) => [k, (meanBuckets[k] * 100).toFixed(1)]),
        ),
        hhi: mean(ok.map((r) => r.hhi)),
        leaderHist: Object.keys(hist)
          .sort((a, b) => hist[b] - hist[a])
          .map((k) => `${k}:${hist[k]}`)
          .join('|'),
        topFormats: mean(
          ok.map((r) =>
            Object.entries(r.bookShares || {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([k, v]) => `${k}:${(v * 100).toFixed(1)}`)
              .join(','),
          ),
        ),
      };
    }
  }

  const comparisons = {};
  for (const year of BENCHMARK_YEARS) {
    const gt = WICHITA_GROUND_TRUTH[year]?.buckets || {};
    const actual = bookResults.wichita[year]?.meanBuckets || {};
    const eco = expectedEcologyBuckets(WICHITA_MARKET, 'wichita', year);
    const vsTruth = bucketDelta(actual, gt);
    const vsEco = bucketDelta(actual, eco);
    const nash = bookResults.nashville[year]?.meanBuckets || {};
    comparisons[year] = {
      groundTruthNote: WICHITA_GROUND_TRUTH[year]?.label,
      wichitaVsTruthTop: largestDivergences(vsTruth),
      wichitaVsEcologyTop: largestDivergences(vsEco),
      wichitaCountry: ((actual.COUNTRY || 0) * 100).toFixed(1),
      truthCountry: ((gt.COUNTRY || 0) * 100).toFixed(1),
      nashvilleCountry: ((nash.COUNTRY || 0) * 100).toFixed(1),
      wichitaRock: (((actual.ROCK_ALT_AAA || 0) * 100).toFixed(1)),
      truthRock: (((gt.ROCK_ALT_AAA || 0) * 100).toFixed(1)),
    };
  }

  const out = {
    recordedAt: new Date().toISOString(),
    runs: RUNS,
    seed: SEED,
    pipeline,
    bookResults,
    comparisons,
  };

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const outPath = path.join(root, 'tmp', 'wichita_truth_audit.json');
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);

  // ── Console report ──
  console.log('═══ 1. National blueprint → dialBpAmToFm (gen 1985, chrwar) ═══\n');
  for (const mid of ['wichita', 'nashville']) {
    const p = pipeline[mid];
    console.log(`--- ${mid} ---`);
    console.log(`  commercialTarget=${p.commercialTarget} tierTailDeferred=${p.tierTailDeferred.length} slots`);
    const remaps = p.nationalBp.filter((r) => r.remapped);
    console.log(`  dialBpAmToFm remaps (${remaps.length}):`);
    for (const r of remaps) {
      const spec = p.dialBpAmToFm[r.idx];
      console.log(
        `    BP[${r.idx}] ${r.baseFmt}/${r.baseType} → ${r.effFmt}/${r.effType} spec=${JSON.stringify(spec)}`,
      );
    }
    console.log(`  tier inject (order): ${p.tierInjectFormats.join(', ') || '(none)'}`);
    console.log(`  pre-gen EVDATA rivals (<${p.bpYear}): ${p.preGenRivalFormats.join(', ') || '(none)'}`);
    console.log(`  roster after BP: ${JSON.stringify(p.afterBpRoster.counts)}`);
    console.log(`  roster after inject: ${JSON.stringify(p.afterInjectRoster.counts)}`);
    console.log('');
  }

  console.log('═══ 2. Book composition vs ground truth (8-run mean, leadership buckets %) ═══\n');
  const hdr = 'Year\tGenPath\tW-Ctry\tTruth\tNash-Ctry\tW-Rock\tTruth-Rock\tW-Talk\tTruth-Talk\t#1 Wichita';
  console.log(hdr);
  for (const year of BENCHMARK_YEARS) {
    const w = bookResults.wichita[year];
    const c = comparisons[year];
    if (!w?.meanBucketsPct) continue;
    console.log(
      [
        year,
        w.genPath?.note || '',
        c.wichitaCountry,
        c.truthCountry,
        c.nashvilleCountry,
        c.wichitaRock,
        c.truthRock,
        (w.meanBucketsPct.NEWS_TALK_SPORTS || '0'),
        ((WICHITA_GROUND_TRUTH[year].buckets.NEWS_TALK_SPORTS || 0) * 100).toFixed(1),
        w.leaderHist,
      ].join('\t'),
    );
  }

  console.log('\n═══ 3. Largest Wichita gaps vs RadioInsight/Duncan ground truth ═══\n');
  for (const year of BENCHMARK_YEARS) {
    const c = comparisons[year];
    console.log(`${year}: ${c.groundTruthNote}`);
    for (const d of c.wichitaVsTruthTop) {
      const sign = d.v >= 0 ? '+' : '';
      console.log(`  ${d.k}: ${sign}${(d.v * 100).toFixed(1)} pp vs truth`);
    }
  }

  console.log('\n═══ 4. Divergence diagnosis (where runtime leaves Wichita reality) ═══\n');
  const p = pipeline.wichita;
  const rockRemaps = p.nationalBp.filter((r) => r.remapped && /ROCK|TOP40/.test(r.effFmt));
  const gospelRemaps = p.nationalBp.filter((r) => r.remapped && r.effFmt === 'GOSPEL');
  const countryRemap = p.nationalBp.filter((r) => r.remapped && r.effFmt === 'COUNTRY');
  const injectRock = p.tierInjectFormats.filter((f) => /ROCK|ALT|AAA|ADULT_CONTEMP|TOP40/.test(f)).length;
  const injectCountry = p.tierInjectFormats.filter((f) => f === 'COUNTRY').length;

  console.log('Stage A — National BP (no MARKET_BP_PATCH for Wichita):');
  console.log('  Uses generic Sunbelt-style national blueprint; Nashville same base; Wichita has no country patch.');
  console.log(`Stage B — dialBpAmToFm: ${rockRemaps.length} rock/top40 FM remaps, ${gospelRemaps.length} gospel, ${countryRemap.length} country`);
  console.log(`Stage C — tier inject @1985: ${p.tierInjectFormats.length} adds — rock/AC/alt-heavy (${injectRock}) vs country (${injectCountry})`);
  console.log(`Stage D — pre-gen rivals: ${p.preGenRivalFormats.length} formats from EVDATA (<1985)`);
  const w26 = bookResults.wichita[2026];
  if (w26?.meanBucketsPct) {
    console.log('Stage E — book @2026 after sim:');
    console.log(`  COUNTRY ${w26.meanBucketsPct.COUNTRY}% (truth ~28%) | ROCK ${w26.meanBucketsPct.ROCK_ALT_AAA}% (truth ~12%)`);
    console.log(`  #1: ${w26.leaderHist} | HHI≈${w26.hhi?.toFixed(0)}`);
  }

  console.log(`\nWrote ${outPath}`);
}

main();
