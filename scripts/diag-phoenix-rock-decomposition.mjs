#!/usr/bin/env node
/**
 * Phoenix remaining-rock decomposition — diagnostic only (shipped code baseline).
 *
 *   node scripts/diag-phoenix-rock-decomposition.mjs
 *
 * A shipped baseline | B CR leader appeal only | C BP slot 18 → HOT_AC
 * | D high-Hispanic sunbelt rock mktFmt damp | E B+C+Phoenix tier skip CR/AOR inject
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { aggregateMeansToLeadershipBuckets, LEADERSHIP_BUCKET_KEYS } from './expectedFormatLeadershipProfile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

const VARIANTS = process.env.ONLY_VARIANTS
  ? process.env.ONLY_VARIANTS.split(',').map((s) => s.trim())
  : ['A', 'B', 'C', 'D', 'E'];
const BENCHMARK_YEARS = [1995, 2005, 2026];
const RUNS = 12;
const SEED = 20260521;
const MAX_STEPS = 320;
const TARGET = 'phoenix';
const CONTROLS = ['losangeles', 'newyork', 'atlanta', 'nashville', 'wichita', 'seattle'];
const ALL_MARKETS = [TARGET, ...CONTROLS];

const ROCK_FMTS = ['CLASSIC_ROCK', 'ALBUM_ROCK', 'ALT_ROCK', 'AAA', 'CLASSIC_HITS', 'OLDIES'];

const PHOENIX_ROCK_OQ_SHIPPED = `  if(['CLASSIC_ROCK','ADULT_CONTEMP','ALBUM_ROCK','OLDIES','CLASSIC_HITS'].includes(station.format)&&sig.type==='FM'){
    return 0.96;
  }`;

const PHOENIX_ROCK_OQ_B = `  if(station.format==='CLASSIC_ROCK'&&sig.type==='FM')return 0.88;
  if(['ADULT_CONTEMP','ALBUM_ROCK','OLDIES','CLASSIC_HITS'].includes(station.format)&&sig.type==='FM'){
    return 0.96;
  }`;

const PHOENIX_BP_SLOT18_CR = `    18:{fmt:'CLASSIC_ROCK',str:'moderate'},`;
const PHOENIX_BP_SLOT18_HOTAC = `    18:{fmt:'HOT_AC',str:'moderate'},`;

const SPANISH_BLOCK_END = `    if(urbanRhythmBlocked&&['RHYTHMIC','URBAN_CONTEMP'].includes(s.format))mktFmt*=0.36;
  }`;

const SPANISH_BLOCK_D = `    if(urbanRhythmBlocked&&['RHYTHMIC','URBAN_CONTEMP'].includes(s.format))mktFmt*=0.36;
  }
  if(isHighHispanicSunbeltMarket(marketId)&&['CLASSIC_ROCK','ALBUM_ROCK','ALT_ROCK','AAA'].includes(s.format)){
    mktFmt*=0.90;
  }`;

const HIGH_HISP_SUNBELT_GATE = `/** High-Hispanic + sunbelt_diversified — rock decomposition diag gate. */
function isHighHispanicSunbeltMarket(marketId){
  const m=MARKETS[marketId||'']||{};
  return isHighHispanicMarket(marketId)&&String(m.archetypeId||'')==='sunbelt_diversified';
}
`;

const HIGH_HISP_SUNBELT_INSERT_AFTER = `function isHighHispanicMegaMarket(marketId){
  if(!isHighHispanicMarket(marketId))return false;
  return (MARKETS[marketId||'']||{}).rankTier==='mega';
}`;

const TIER_INJECT_ANCHOR =
  "if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt))continue;\n      if(formatAllowedInMarket(cand.fmt,dialCtx.marketId,bpYear)){";

const TIER_INJECT_E =
  "if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt))continue;\n      if(isPhoenixDiagMarket(dialCtx.marketId)&&['CLASSIC_ROCK','ALBUM_ROCK'].includes(cand.fmt))continue;\n      if(formatAllowedInMarket(cand.fmt,dialCtx.marketId,bpYear)){";

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

function patchLegacyForVariant(src, variant) {
  let out = injectHeadlessLaunchNewsGuard(src);
  const useB = variant === 'B' || variant === 'E';
  const useC = variant === 'C' || variant === 'E';
  const useD = variant === 'D' || variant === 'E';
  const useE = variant === 'E';

  if (useB && out.includes(PHOENIX_ROCK_OQ_SHIPPED)) {
    out = out.replace(PHOENIX_ROCK_OQ_SHIPPED, PHOENIX_ROCK_OQ_B);
  }
  if (useC && out.includes(PHOENIX_BP_SLOT18_CR)) {
    out = out.replace(PHOENIX_BP_SLOT18_CR, PHOENIX_BP_SLOT18_HOTAC);
  }
  if (useD) {
    if (!out.includes('function isHighHispanicSunbeltMarket(')) {
      out = out.replace(HIGH_HISP_SUNBELT_INSERT_AFTER, `${HIGH_HISP_SUNBELT_INSERT_AFTER}\n${HIGH_HISP_SUNBELT_GATE}`);
    }
    if (out.includes(SPANISH_BLOCK_END)) {
      out = out.replace(SPANISH_BLOCK_END, SPANISH_BLOCK_D);
    }
  }
  if (useE && out.includes(TIER_INJECT_ANCHOR)) {
    out = out.replace(TIER_INJECT_ANCHOR, TIER_INJECT_E);
  }
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

function loadCtx(variant) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  const src = patchLegacyForVariant(readFileSync(legacyPath, 'utf8'), variant);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
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

function genModeForYear(year) {
  return year <= 1975 ? 'under1970' : 'mp1985';
}

function fmtSharesToBuckets(shares) {
  const fmtAgg = Object.entries(shares || {})
    .map(([k, v]) => ({ k, m: v }))
    .sort((a, b) => b.m - a.m);
  return aggregateMeansToLeadershipBuckets(fmtAgg).buckets;
}

function leaderStats(histStr) {
  const parts = (histStr || '').split('|').filter(Boolean);
  if (!parts.length) return { spanishWins: 0, rockWins: 0, unique: 0, topShare: 0 };
  const counts = parts.map((p) => {
    const [fmt, n] = p.split(':');
    return { fmt, n: parseInt(n, 10) || 0 };
  });
  const sum = counts.reduce((a, c) => a + c.n, 0);
  const max = Math.max(...counts.map((c) => c.n));
  const spanishWins = counts.filter((c) => c.fmt === 'SPANISH').reduce((a, c) => a + c.n, 0);
  const rockWins = counts
    .filter((c) => ROCK_FMTS.includes(c.fmt))
    .reduce((a, c) => a + c.n, 0);
  return { spanishWins: sum ? spanishWins / sum : 0, rockWins: sum ? rockWins / sum : 0, unique: parts.length, topShare: sum ? max / sum : 0 };
}

const RUN_IIFE = `
(function(){
  var ROCK_FMTS=${JSON.stringify(ROCK_FMTS)};
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function rockDetail(stations){
    var shares={}, counts={}, topRock=0, topCr=0, rockStn=0;
    for(var i=0;i<stations.length;i++){
      var s=stations[i];
      if(!s||s._bpSlotDeferred||!s.rat||typeof s.rat.share!=='number')continue;
      var fk=fmtKey(s.format);
      shares[fk]=(shares[fk]||0)+(s.rat.share||0);
      counts[fk]=(counts[fk]||0)+1;
      if(ROCK_FMTS.indexOf(fk)>=0){
        rockStn++;
        if(s.rat.share>topRock) topRock=s.rat.share;
        if(fk==='CLASSIC_ROCK'&&s.rat.share>topCr) topCr=s.rat.share;
      }
    }
    var rockShare=0;
    for(var j=0;j<ROCK_FMTS.length;j++) rockShare+=(shares[ROCK_FMTS[j]]||0);
    return {
      shares:shares, counts:counts,
      rockShare:rockShare, classicRockShare:shares.CLASSIC_ROCK||0,
      albumRockShare:shares.ALBUM_ROCK||0, altRockShare:shares.ALT_ROCK||0,
      aaaShare:shares.AAA||0, rockStationCount:rockStn,
      topRockShare:topRock, topClassicRockShare:topCr
    };
  }
  function traceGenPipeline(marketId){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    UC=new Set();amfIdx=0;fmfIdx=0;
    _gbBrandIdTaken=new Set();
    setNextFreqListsForMarket(marketId);
    shuffleFreqListsForNewGame();
    var bpYear=1985;
    var stations=[];
    var dialCtx={stations:stations, marketId:marketId};
    var commercialTarget=tierMarketCommercialTargetForGen(marketId,bpYear);
    var tierTailDef=tierMarketBpTailDeferIndices(marketId,commercialTarget,new Set(),new Set());
    var bpSlots=[];
    for(var bi=0;bi<BP.length;bi++){
      var base=BP[bi];
      var eff=effectiveBpForMarket(bi, marketId);
      var patched=!!(MARKET_BP_PATCH[marketId]&&MARKET_BP_PATCH[marketId][bi]);
      bpSlots.push({idx:bi,baseFmt:base.fmt,effFmt:eff.fmt,patched:patched,str:eff.str});
    }
    var preN=0;
    for(var bi=0;bi<BP.length;bi++){
      var effBp=effectiveBpForMarket(bi, marketId);
      effBp=adjustBlueprintForMarketDial(effBp, bi, marketId);
      var fq=nextUnusedCommercialFreq(dialCtx, effBp.type);
      if(tierTailDef.has(bi)) stations.push({_bpSlotDeferred:true,_bpIdx:bi,_deferFreq:fq});
      else stations.push(mkStn(effBp,fq,bpYear));
    }
    preN=stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length;
    injectTierMarketCommercialExtras(stations,dialCtx,bpYear,commercialTarget);
    var injectFmts=stations.slice(preN).filter(function(s){return s&&!s._bpSlotDeferred;}).map(function(s){return fmtKey(s.format);});
    var spanishQ=marketSpanishLaunchesQueueForNewGame(marketId);
    var fragQ=marketFragmentationLaunchesQueueForNewGame(marketId);
    var crOq=phoenixDiagOpeningOqMult({format:'CLASSIC_ROCK',sig:{type:'FM'}});
    return {
      bpPatch:MARKET_BP_PATCH[marketId]||{},
      bpRockSlots:bpSlots.filter(function(p){return ROCK_FMTS.indexOf(p.effFmt)>=0;}),
      tierInject:injectFmts,
      tierInjectRock:injectFmts.filter(function(f){return ROCK_FMTS.indexOf(f)>=0;}),
      spanishLaunches:spanishQ.map(function(e){return e.y+':'+fmtKey(e.bp.fmt)+':'+(e.bp.str||'');}),
      fragmentationLaunches:fragQ.map(function(e){return e.y+':'+fmtKey(e.bp.fmt)+':'+(e.bp.str||'');}),
      phoenixCrOpeningOq:crOq,
      nationalBpRock:BP.filter(function(b){return ROCK_FMTS.indexOf(b.fmt)>=0;}).map(function(b){return b.fmt+':'+b.str;})
    };
  }
  function sampleOne(marketId, genMode, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      if(genMode==='mp1985'){
        var sc=SC.find(function(x){return x.id==='chrwar';});
        var oi=sc.idx; sc.idx=[];
        G=genMarket('chrwar');
        sc.idx=oi;
      }else{
        var sc2=SC.find(function(x){return x.id==='under';});
        var oi2=sc2.idx; sc2.idx=[];
        G=genMarket('under');
        sc2.idx=oi2;
      }
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
      var rd=rockDetail(G.stations);
      var book=G.stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
      book.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
      var hhi=0;
      for(var j=0;j<book.length;j++){var sh=book[j].rat.share||0; hhi+=sh*sh;}
      var spanN=G.stations.filter(function(st){return st&&!st._bpSlotDeferred&&fmtKey(st.format)==='SPANISH';}).length;
      return {
        ok:true, bookShares:rd.shares, leaderFmt:book[0]?fmtKey(book[0].format):'',
        hhi:hhi*10000, spanishStations:spanN,
        rockShare:rd.rockShare, classicRockShare:rd.classicRockShare,
        albumRockShare:rd.albumRockShare, altRockShare:rd.altRockShare,
        aaaShare:rd.aaaShare, rockStationCount:rd.rockStationCount,
        topRockShare:rd.topRockShare, topClassicRockShare:rd.topClassicRockShare,
        rockCounts:rd.counts
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { traceGenPipeline: traceGenPipeline, sampleOne: sampleOne };
})();
`;

function summarize(rows, variant, marketId, year) {
  const list = rows.filter((r) => r.ok && r.variant === variant && r.marketId === marketId && r.year === year);
  if (!list.length) return null;
  const bucketRuns = list.map((r) => fmtSharesToBuckets(r.bookShares));
  const meanBuckets = {};
  for (const k of LEADERSHIP_BUCKET_KEYS) {
    meanBuckets[k] = mean(bucketRuns.map((b) => b[k] ?? 0));
  }
  const hist = {};
  for (const r of list) {
    const k = r.leaderFmt || '?';
    hist[k] = (hist[k] || 0) + 1;
  }
  const histStr = Object.keys(hist)
    .sort((a, b) => hist[b] - hist[a])
    .map((k) => `${k}:${hist[k]}`)
    .join('|');
  return {
    meanBuckets,
    rockPct: (meanBuckets.ROCK_ALT_AAA ?? 0) * 100,
    spanishPct: (meanBuckets.SPANISH ?? 0) * 100,
    chrPct: (meanBuckets.TOP40_CHR ?? 0) * 100,
    countryPct: (meanBuckets.COUNTRY ?? 0) * 100,
    acPct: (meanBuckets.AC_HOT_AC ?? 0) * 100,
    classicRockPct: mean(list.map((r) => r.classicRockShare)) * 100,
    albumRockPct: mean(list.map((r) => r.albumRockShare)) * 100,
    altRockPct: mean(list.map((r) => r.altRockShare)) * 100,
    aaaPct: mean(list.map((r) => r.aaaShare)) * 100,
    topRockPct: mean(list.map((r) => r.topRockShare)) * 100,
    topClassicRockPct: mean(list.map((r) => r.topClassicRockShare)) * 100,
    rockStations: mean(list.map((r) => r.rockStationCount)),
    spanishStations: mean(list.map((r) => r.spanishStations)),
    hhi: mean(list.map((r) => r.hhi)),
    histStr,
    leaderStats: leaderStats(histStr),
  };
}

function variantSpec(v) {
  return (
    {
      A: 'shipped baseline',
      B: 'phoenixDiagOpeningOqMult: CLASSIC_ROCK FM 0.88 (others 0.96)',
      C: 'MARKET_BP_PATCH.phoenix[18] CLASSIC_ROCK → HOT_AC moderate',
      D: 'isHighHispanicSunbeltMarket: appl() rock mktFmt ×0.90',
      E: 'B + C + Phoenix tier inject skip CLASSIC_ROCK/ALBUM_ROCK',
    }[v] || v
  );
}

function controlBleed(results, year = 2026) {
  const out = {};
  for (const mid of CONTROLS) {
    const histA = results.A[year][mid]?.histStr;
    out[mid] = VARIANTS.every((v) => results[v][year][mid]?.histStr === histA);
  }
  return out;
}

function main() {
  console.log('Phoenix remaining-rock decomposition (12 runs, shipped baseline)\n');

  const baselineCtx = loadCtx('A');
  const apiBase = vm.runInContext(RUN_IIFE, baselineCtx);
  const pipeline = apiBase.traceGenPipeline('phoenix');

  console.log('═══ Rock source trace @ gen 1985 ═══\n');
  console.log('MARKET_BP_PATCH.phoenix:', JSON.stringify(pipeline.bpPatch));
  console.log('BP rock slots:', JSON.stringify(pipeline.bpRockSlots));
  console.log('national BP rock formats:', pipeline.nationalBpRock.join(', '));
  console.log('tier inject (all):', pipeline.tierInject.join(', '));
  console.log('tier inject (rock only):', pipeline.tierInjectRock.join(', '));
  console.log('fragmentationLaunches:', pipeline.fragmentationLaunches.join(', '));
  console.log('spanishLaunches:', pipeline.spanishLaunches.join(', '));
  console.log('phoenixDiagOpeningOqMult CLASSIC_ROCK FM:', pipeline.phoenixCrOpeningOq);

  const results = {};

  for (const variant of VARIANTS) {
    console.log(`\n========== ${variant}: ${variantSpec(variant)} ==========\n`);
    const ctx = loadCtx(variant);
    const api = vm.runInContext(RUN_IIFE, ctx);
    const rows = [];
    const origR = Math.random;
    for (const year of BENCHMARK_YEARS) {
      for (const mid of ALL_MARKETS) {
        for (let run = 0; run < RUNS; run++) {
          const s0 = SEED + marketSalt(mid) * 17 + year * 10007 + run * 9973;
          let r;
          try {
            r = api.sampleOne(mid, genModeForYear(year), year, s0, MAX_STEPS);
          } catch (e) {
            r = { ok: false, err: String(e?.message || e) };
          } finally {
            Math.random = origR;
          }
          rows.push({ variant, marketId: mid, year, run, ...r });
        }
      }
    }
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) console.error(`  failures: ${bad.length} — e.g. ${bad[0]?.marketId}@${bad[0]?.year}: ${bad[0]?.err}`);

    results[variant] = {};
    for (const year of BENCHMARK_YEARS) {
      results[variant][year] = { phoenix: summarize(rows, variant, TARGET, year) };
      for (const mid of CONTROLS) {
        results[variant][year][mid] = summarize(rows, variant, mid, year);
      }
    }

    const p = results[variant];
    console.log(
      'Year\tRock\tCR\tAOR\tSpan\tCHR\tCtry\tAC\tTopRock%\tRockStn\tHHI\t#1\tSpan#1%\tRock#1%',
    );
    for (const year of BENCHMARK_YEARS) {
      const s = p[year].phoenix;
      if (!s) continue;
      console.log(
        [
          year,
          s.rockPct.toFixed(1),
          s.classicRockPct.toFixed(1),
          s.albumRockPct.toFixed(1),
          s.spanishPct.toFixed(1),
          s.chrPct.toFixed(1),
          s.countryPct.toFixed(1),
          s.acPct.toFixed(1),
          s.topRockPct.toFixed(1),
          s.rockStations.toFixed(1),
          s.hhi.toFixed(0),
          s.histStr,
          `${(s.leaderStats.spanishWins * 100).toFixed(0)}%`,
          `${(s.leaderStats.rockWins * 100).toFixed(0)}%`,
        ].join('\t'),
      );
    }
  }

  console.log('\n========== Phoenix @2026 — A/B (rock decomposition) ==========\n');
  console.log('Var\tRock\tCR\tAOR\tAlt\tAAA\tSpan\tTopRock%\tRockStn\tSpan#1%\tΔRock');
  const base26 = results.A?.[2026]?.phoenix;
  for (const variant of VARIANTS) {
    const p = results[variant][2026].phoenix;
    if (!p) {
      console.log([variant, '(no data — variant failed)'].join('\t'));
      continue;
    }
    console.log(
      [
        variant,
        p.rockPct.toFixed(1),
        p.classicRockPct.toFixed(1),
        p.albumRockPct.toFixed(1),
        p.altRockPct.toFixed(1),
        p.aaaPct.toFixed(1),
        p.spanishPct.toFixed(1),
        p.topRockPct.toFixed(1),
        p.rockStations.toFixed(1),
        `${(p.leaderStats.spanishWins * 100).toFixed(0)}%`,
        base26 ? `${(p.rockPct - base26.rockPct).toFixed(1)}` : '—',
      ].join('\t'),
    );
  }

  const bleed = results.A ? controlBleed(results) : {};
  console.log('\n========== Control #1 stability @2026 ==========\n');
  for (const mid of CONTROLS) {
    console.log(`  ${mid}: ${bleed[mid] ? 'STABLE' : 'CHANGED'}`);
    if (!bleed[mid]) {
      for (const v of VARIANTS) {
        if (results[v][2026][mid].histStr !== results.A[2026][mid].histStr) {
          console.log(`    ${v}: ${results[v][2026][mid].histStr}`);
        }
      }
    }
  }

  const e26 = results.E?.[2026]?.phoenix;
  const a26 = results.A?.[2026]?.phoenix;
  let recommendation = 'gentle Phoenix-only fix: ship variant E (Phoenix-scoped)';
  if (e26 && e26.rockPct <= 14 && e26.classicRockPct <= 12) {
    recommendation = 'gentle Phoenix-only fix: E (CR OQ 0.88 + BP18 HOT_AC + tier skip CR/AOR inject)';
  } else if (
    bleed.losangeles === false &&
    results.D?.[2026]?.losangeles &&
    results.A?.[2026]?.losangeles &&
    results.D[2026].losangeles.rockPct < results.A[2026].losangeles.rockPct - 1
  ) {
    recommendation = 'avoid generalized Sunbelt damp — use Phoenix-only E instead';
  } else if (e26 && a26 && e26.rockPct < a26.rockPct - 3) {
    recommendation = 'gentle Phoenix-only fix: E (B+C+tier skip CR/AOR)';
  } else if (a26) {
    recommendation = 'source correction: tier inject skip CR/AOR + BP slot 18 HOT_AC + optional frag 1986→AC';
  }

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const artifactPath = path.join(root, 'tmp', 'phoenix_rock_decomposition.json');
  writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runs: RUNS,
        seed: SEED,
        variantSpec: Object.fromEntries(VARIANTS.map((v) => [v, variantSpec(v)])),
        rootCause: {
          primary: [
            'tier inject still adds CLASSIC_ROCK + ALBUM_ROCK (TIER_MARKET_INJECT_BP rotation)',
            'MARKET_BP_PATCH slot 16 ALBUM_ROCK moderate + slot 18 was CLASSIC_ROCK moderate (now AC at 15 only partially moved)',
            'fragmentationLaunches: 1986 CLASSIC_ROCK moderate still on dial',
            'national BP includes CLASSIC_ROCK/ALBUM_ROCK slots unpatched',
            'phoenixDiagOpeningOqMult 0.96 still applies to all FM rock lane (not CR-only)',
            'CLASSIC_ROCK leader peak: high topClassicRockShare with ~3 rock stations',
          ],
          secondary: ['drift/reformat may move stations to CR/AOR over sim — not primary @2026 gen'],
          mechanisms: {
            tierInjectRock: pipeline.tierInjectRock,
            bpRockSlots: pipeline.bpRockSlots,
            fragmentation: pipeline.fragmentationLaunches,
          },
        },
        pipelineTrace: pipeline,
        results,
        controlBleed: bleed,
        recommendation,
        baseline2026: a26 ?? null,
        bestVariant2026: ['E', 'B', 'C', 'D']
          .filter((v) => results[v]?.[2026]?.phoenix)
          .reduce((best, v) =>
            results[v][2026].phoenix.rockPct < results[best][2026].phoenix.rockPct ? v : best,
          'A'),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nWrote ${artifactPath}`);
  console.log(`Recommendation: ${recommendation}`);
}

main();
