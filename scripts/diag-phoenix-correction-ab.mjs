#!/usr/bin/env node
/**
 * Phoenix Hispanic-market architecture A/B — generalized in-vm patches only.
 *
 *   node scripts/diag-phoenix-correction-ab.mjs
 *
 * A baseline | B high-Hispanic Spanish launch timeline | C demographic weighting
 * | D rock moderation (high-Hispanic) | E combined B+C+D
 *
 * Controls: atlanta, nashville (below isHighHispanicMarket gate).
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  aggregateMeansToLeadershipBuckets,
  LEADERSHIP_BUCKET_KEYS,
} from './expectedFormatLeadershipProfile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

const VARIANTS = ['A', 'B', 'C', 'D', 'E'];
const BENCHMARK_YEARS = [1975, 1985, 1995, 2005, 2026];
const TARGET_MARKET = 'phoenix';
const CONTROL_MARKETS = ['atlanta', 'nashville'];
const ALL_MARKETS = [TARGET_MARKET, ...CONTROL_MARKETS];
const RUNS = 8;
const SEED = 20260515;
const MAX_STEPS = 320;

/** Insert before marketSpanishLaunchesDefs — shared gate for B/C/D/E. */
const HIGH_HISPANIC_GATE = `/** High-Hispanic market gate (generalized): hispPop2020 ≥ 20% or culture.spanish ≥ 12%. */
function isHighHispanicMarket(marketId){
  const m=MARKETS[marketId||'']||{};
  const h=m.hispPop2020??0;
  const span=(m.culture&&m.culture.spanish)??0;
  return h>=0.20||span>=0.12;
}
const HIGH_HISPANIC_SUPPLEMENTAL_SPANISH_LAUNCHES=[
  {id:'_hisp_supp_1988_fm',y:1988,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
];
`;

const SPANISH_LAUNCHES_FN_BASE = `function marketSpanishLaunchesDefs(marketId){
  const m=MARKETS[marketId||'']||null;
  if(!m||!Array.isArray(m.spanishLaunches)||!m.spanishLaunches.length)return [];
  return m.spanishLaunches.map(ent=>({
    ...ent,
    bp:ent.bp?{...ent.bp}:null,
  }));
}`;

const SPANISH_LAUNCHES_FN_B = `function marketSpanishLaunchesDefs(marketId){
  const m=MARKETS[marketId||'']||null;
  if(!m||!Array.isArray(m.spanishLaunches)||!m.spanishLaunches.length)return [];
  let defs=m.spanishLaunches.map(ent=>({
    ...ent,
    bp:ent.bp?{...ent.bp}:null,
  }));
  if(isHighHispanicMarket(marketId)){
    const extra=HIGH_HISPANIC_SUPPLEMENTAL_SPANISH_LAUNCHES.map(ent=>({
      ...ent,
      id:marketId+ent.id,
      bp:{...ent.bp},
    }));
    defs=[...extra,...defs];
    defs=defs.map(d=>{
      if(!d.bp||d.bp.fmt!=='SPANISH')return d;
      const bp={...d.bp};
      if(bp.str==='emerging')bp.str='moderate';
      if(bp.pw==='25kw')bp.pw='50kw';
      return {...d,bp};
    });
  }
  return defs;
}`;

const FRAG_LAUNCHES_FN_BASE = `function marketFragmentationLaunchesDefs(marketId){
  const m=MARKETS[marketId||'']||null;
  if(!m||!Array.isArray(m.fragmentationLaunches)||!m.fragmentationLaunches.length)return [];
  return m.fragmentationLaunches.map(ent=>({...ent,bp:ent.bp?{...ent.bp}:null}));
}`;

const FRAG_LAUNCHES_FN_D = `function marketFragmentationLaunchesDefs(marketId){
  const m=MARKETS[marketId||'']||null;
  if(!m||!Array.isArray(m.fragmentationLaunches)||!m.fragmentationLaunches.length)return [];
  let defs=m.fragmentationLaunches.map(ent=>({...ent,bp:ent.bp?{...ent.bp}:null}));
  if(isHighHispanicMarket(marketId)){
    defs=defs.filter(d=>!(d.y===1991&&d.bp&&d.bp.fmt==='CLASSIC_ROCK'&&d.bp.str==='strong'));
    defs=defs.map(d=>{
      if(!d.bp||!['CLASSIC_ROCK','ALBUM_ROCK','ALT_ROCK'].includes(d.bp.fmt))return d;
      const bp={...d.bp};
      if(bp.str==='strong')bp.str='moderate';
      return {...d,bp};
    });
  }
  return defs;
}`;

const MKTFMT_SPANISH_BLOCK = `  if(['SPANISH','RHYTHMIC','URBAN_CONTEMP'].includes(s.format)){
    mktFmt+=(cult.spanish||0)*0.18+(mkt.urbanBonus||0)*0.12;
    if(marketId==='losangeles')mktFmt+=0.065;
  }`;

const MKTFMT_SPANISH_BLOCK_C = `  if(['SPANISH','RHYTHMIC','URBAN_CONTEMP'].includes(s.format)){
    mktFmt+=(cult.spanish||0)*0.18+(mkt.urbanBonus||0)*0.12;
    if(marketId==='losangeles')mktFmt+=0.065;
    if(s.format==='SPANISH'&&isHighHispanicMarket(marketId)){
      const h2020=mkt.hispPop2020??0;
      const hCult=cult.spanish??0;
      const hisp01=Math.min(1,h2020/0.45);
      mktFmt+=0.06+0.14*hisp01+0.08*Math.min(1,hCult/0.24);
    }
  }`;

const TIER_INJECT_ANCHOR =
  "if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt))continue;\n      if(formatAllowedInMarket(cand.fmt,dialCtx.marketId,bpYear)){";

const TIER_INJECT_D =
  "if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt))continue;\n      if(isHighHispanicMarket(dialCtx.marketId)&&['CLASSIC_ROCK','ALBUM_ROCK','ALT_ROCK'].includes(cand.fmt))continue;\n      if(formatAllowedInMarket(cand.fmt,dialCtx.marketId,bpYear)){";

const OPENING_SHAPE_ANCHOR = `    if(isPhoenixDiagMarket(marketId)){
      const pf=phoenixDiagOpeningOqMult(s);
      if(pf!==1)f*=pf;
    }`;

const OPENING_SHAPE_D = `    if(isHighHispanicMarket(marketId)){
      if(['CLASSIC_ROCK','ALBUM_ROCK','ALT_ROCK','OLDIES'].includes(s.format)&&s.sig?.type==='FM')f*=0.90;
      if(s.format==='SPANISH'&&s.sig?.type==='FM')f*=1.06;
    }
    if(isPhoenixDiagMarket(marketId)){
      const pf=phoenixDiagOpeningOqMult(s);
      if(pf!==1)f*=pf;
    }`;

const PHOENIX_ROCK_OQ = `  if(['CLASSIC_ROCK','ADULT_CONTEMP','ALBUM_ROCK','OLDIES','CLASSIC_HITS'].includes(station.format)&&sig.type==='FM'){
    return 1.1;
  }`;

const PHOENIX_ROCK_OQ_D = `  if(['CLASSIC_ROCK','ADULT_CONTEMP','ALBUM_ROCK','OLDIES','CLASSIC_HITS'].includes(station.format)&&sig.type==='FM'){
    return 1.02;
  }`;

const SPANISH_LAUNCHS_ANCHOR =
  '/** Optional MARKETS[id].spanishLaunches — scheduled FM/AM Spanish entrants (diag / high-Hispanic markets). */';

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

function ensureHighHispanicGate(out) {
  if (out.includes('function isHighHispanicMarket(')) return out;
  return out.replace(SPANISH_LAUNCHS_ANCHOR, `${HIGH_HISPANIC_GATE}${SPANISH_LAUNCHS_ANCHOR}`);
}

function patchLegacyForVariant(src, variant) {
  let out = injectHeadlessLaunchNewsGuard(src);
  const useB = variant === 'B' || variant === 'E';
  const useC = variant === 'C' || variant === 'E';
  const useD = variant === 'D' || variant === 'E';

  if (useB || useC || useD) out = ensureHighHispanicGate(out);

  if (useB) {
    if (out.includes(SPANISH_LAUNCHES_FN_BASE)) {
      out = out.replace(SPANISH_LAUNCHES_FN_BASE, SPANISH_LAUNCHES_FN_B);
    }
  }

  if (useC) {
    out = out.replace(MKTFMT_SPANISH_BLOCK, MKTFMT_SPANISH_BLOCK_C);
  }

  if (useD) {
    if (out.includes(FRAG_LAUNCHES_FN_BASE)) {
      out = out.replace(FRAG_LAUNCHES_FN_BASE, FRAG_LAUNCHES_FN_D);
    }
    if (out.includes(TIER_INJECT_ANCHOR)) {
      out = out.replace(TIER_INJECT_ANCHOR, TIER_INJECT_D);
    }
    if (out.includes(OPENING_SHAPE_ANCHOR)) {
      out = out.replace(OPENING_SHAPE_ANCHOR, OPENING_SHAPE_D);
    }
    if (out.includes(PHOENIX_ROCK_OQ)) {
      out = out.replace(PHOENIX_ROCK_OQ, PHOENIX_ROCK_OQ_D);
    }
  }

  if (useB && useC && useD && variant === 'E') {
    if (!out.includes(SPANISH_LAUNCHES_FN_B)) {
      out = out.replace(SPANISH_LAUNCHES_FN_BASE, SPANISH_LAUNCHES_FN_B);
    }
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

function genModeForYear(year) {
  return year <= 1975 ? 'under1970' : 'mp1985';
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
    .filter((c) => ['CLASSIC_ROCK', 'ALBUM_ROCK', 'ALT_ROCK'].includes(c.fmt))
    .reduce((a, c) => a + c.n, 0);
  return { spanishWins: sum ? spanishWins / sum : 0, rockWins: sum ? rockWins / sum : 0, unique: parts.length, topShare: sum ? max / sum : 0 };
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function genFresh(genMode){
    if(genMode==='mp1985'){
      var sc=SC.find(function(s){return s.id==='chrwar';});
      var oi=sc.idx; sc.idx=[];
      G=genMarket('chrwar');
      sc.idx=oi;
    }else{
      var sc2=SC.find(function(s){return s.id==='under';});
      var oi2=sc2.idx; sc2.idx=[];
      G=genMarket('under');
      sc2.idx=oi2;
    }
    G.stations.forEach(function(st){st.isPlayer=false;});
    G.ps=[];
  }
  function sampleOne(marketId, genMode, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      genFresh(genMode);
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
      var shares={}, hhi=0;
      for(var j=0;j<book.length;j++){
        var sh=book[j].rat.share||0;
        hhi+=sh*sh;
        var fk=fmtKey(book[j].format);
        shares[fk]=(shares[fk]||0)+sh;
      }
      var spanN=G.stations.filter(function(st){return st&&!st._bpSlotDeferred&&fmtKey(st.format)==='SPANISH';}).length;
      return {ok:true, bookShares:shares, leaderFmt:book[0]?fmtKey(book[0].format):'', hhi:hhi*10000, spanishStations:spanN};
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return function(cells, runs, baseSeed, maxSteps){
    var out=[], origR=Math.random;
    for(var ci=0;ci<cells.length;ci++){
      var c=cells[ci];
      for(var run=0;run<runs;run++){
        var s0=baseSeed+(c.salt||0)*17+c.year*10007+run*9973+ci*131;
        var r;
        try{ r=sampleOne(c.marketId, c.genMode, c.year, s0, maxSteps); }
        catch(e){ r={ok:false,err:String(e&&e.message||e)}; }
        finally{ Math.random=origR; }
        out.push({variant:c.variant, marketId:c.marketId, year:c.year, run:run, ok:r.ok, err:r.err||'', bookShares:r.bookShares, leaderFmt:r.leaderFmt, hhi:r.hhi, spanishStations:r.spanishStations});
      }
    }
    return out;
  };
})();
`;

function fmtSharesToBuckets(shares) {
  const fmtAgg = Object.entries(shares || {})
    .map(([k, v]) => ({ k, m: v }))
    .sort((a, b) => b.m - a.m);
  return aggregateMeansToLeadershipBuckets(fmtAgg).buckets;
}

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
  const ls = leaderStats(histStr);
  return {
    meanBuckets,
    spanishPct: (meanBuckets.SPANISH ?? 0) * 100,
    chrPct: (meanBuckets.TOP40_CHR ?? 0) * 100,
    countryPct: (meanBuckets.COUNTRY ?? 0) * 100,
    rockPct: (meanBuckets.ROCK_ALT_AAA ?? 0) * 100,
    acPct: (meanBuckets.AC_HOT_AC ?? 0) * 100,
    urbanPct: (meanBuckets.URBAN_RHYTHMIC ?? 0) * 100,
    talkPct: (meanBuckets.NEWS_TALK_SPORTS ?? 0) * 100,
    publicPct: (meanBuckets.PUBLIC_RADIO ?? 0) * 100,
    hhi: mean(list.map((r) => r.hhi)),
    histStr,
    leaderStats: ls,
    spanishStations: mean(list.map((r) => r.spanishStations)),
  };
}

function variantSpec(v) {
  return (
    {
      A: 'baseline (shipped Phoenix diag)',
      B: 'isHighHispanicMarket: supplemental 1988 SPANISH + strengthen row launches',
      C: 'isHighHispanicMarket: appl() SPANISH mktFmt boost from hispPop2020 + culture.spanish',
      D: 'high-Hispanic: weaken frag rock, tier skip AOR/CR/ALT, opening rock×0.9 + Spanish×1.06, phoenixDiag rock 1.02',
      E: 'B + C + D combined',
    }[v] || v
  );
}

function main() {
  console.log('Phoenix Hispanic-market architecture A/B (generalized in-vm patches)\n');

  const results = {};
  for (const variant of VARIANTS) {
    console.log(`\n========== ${variant}: ${variantSpec(variant)} ==========\n`);
    const ctx = loadCtx(variant);
    const cells = [];
    for (const year of BENCHMARK_YEARS) {
      for (const mid of ALL_MARKETS) {
        cells.push({ variant, marketId: mid, year, genMode: genModeForYear(year), salt: marketSalt(mid) });
      }
    }
    const rows = vm.runInContext(RUN_IIFE, ctx)(cells, RUNS, SEED, MAX_STEPS);
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) console.error(`  failures: ${bad.length} — ${bad[0]?.marketId}@${bad[0]?.year}: ${bad[0]?.err}`);

    results[variant] = {};
    for (const year of BENCHMARK_YEARS) {
      results[variant][year] = { phoenix: summarize(rows, variant, TARGET_MARKET, year) };
      for (const mid of CONTROL_MARKETS) {
        results[variant][year][mid] = summarize(rows, variant, mid, year);
      }
    }

    const s = results[variant];
    console.log('Year\tSpan\tCHR\tCtry\tRock\tAC\tTalk\tPub\tHHI\t#1\tSpan#1%\tRock#1%\tSpanStn');
    for (const year of BENCHMARK_YEARS) {
      const p = s[year].phoenix;
      if (!p) continue;
      console.log(
        [
          year,
          p.spanishPct.toFixed(1),
          p.chrPct.toFixed(1),
          p.countryPct.toFixed(1),
          p.rockPct.toFixed(1),
          p.acPct.toFixed(1),
          p.talkPct.toFixed(1),
          p.publicPct.toFixed(1),
          p.hhi.toFixed(0),
          p.histStr,
          `${(p.leaderStats.spanishWins * 100).toFixed(0)}%`,
          `${(p.leaderStats.rockWins * 100).toFixed(0)}%`,
          p.spanishStations.toFixed(1),
        ].join('\t'),
      );
    }
  }

  console.log('\n========== Phoenix @2026 — variant comparison ==========\n');
  console.log('Var\tSpan\tCHR\tCtry\tRock\t#1\tSpan#1%\tRock#1%\tSpanStn');
  for (const variant of VARIANTS) {
    const p = results[variant][2026].phoenix;
    console.log(
      [
        variant,
        p.spanishPct.toFixed(1),
        p.chrPct.toFixed(1),
        p.countryPct.toFixed(1),
        p.rockPct.toFixed(1),
        p.histStr,
        `${(p.leaderStats.spanishWins * 100).toFixed(0)}%`,
        `${(p.leaderStats.rockWins * 100).toFixed(0)}%`,
        p.spanishStations.toFixed(1),
      ].join('\t'),
    );
  }

  console.log('\n========== Phoenix @1995 — Spanish presence ==========\n');
  for (const variant of VARIANTS) {
    const p = results[variant][1995].phoenix;
    console.log([variant, p.spanishPct.toFixed(1), p.histStr, `stn=${p.spanishStations.toFixed(1)}`].join('\t'));
  }

  console.log('\n========== Control bleed @2026 (atlanta / nashville) ==========\n');
  for (const mid of CONTROL_MARKETS) {
    console.log(`--- ${mid} ---`);
    for (const variant of VARIANTS) {
      const c = results[variant][2026][mid];
      console.log([variant, c.spanishPct.toFixed(1), c.rockPct.toFixed(1), c.histStr].join('\t'));
    }
  }

  const atlStable = CONTROL_MARKETS.every((mid) => {
    const a = results.A[2026][mid].histStr;
    return VARIANTS.every((v) => results[v][2026][mid].histStr === a);
  });

  console.log(`\nControl #1 histograms stable across A–E: ${atlStable ? 'YES' : 'NO'}`);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(
    path.join(root, 'tmp', 'phoenix_correction_ab.json'),
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runs: RUNS,
        seed: SEED,
        architecture: {
          gate: 'isHighHispanicMarket: hispPop2020>=0.20 || culture.spanish>=0.12',
          qualifies: ['phoenix', 'losangeles', 'newyork (partial)'],
          controlsBelowGate: ['atlanta', 'nashville'],
        },
        variantSpec: Object.fromEntries(VARIANTS.map((v) => [v, variantSpec(v)])),
        results,
        controlsStable: atlStable,
      },
      null,
      2,
    )}\n`,
  );
  console.log('\nWrote tmp/phoenix_correction_ab.json');
}

main();
