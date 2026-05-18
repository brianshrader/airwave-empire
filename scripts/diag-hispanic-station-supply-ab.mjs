#!/usr/bin/env node
/**
 * Hispanic station supply A/B — in-vm only (no shipped gameplay edits).
 *
 *   node scripts/diag-hispanic-station-supply-ab.mjs
 *
 * A current runtime | B earlier Spanish FM (1994) | C +second FM (2003)
 * | D tier-inject SPANISH priority | E B + C
 *
 * Miami: not in src/MARKETS — omitted (scaffold only).
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { aggregateMeansToLeadershipBuckets } from './expectedFormatLeadershipProfile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

const VARIANTS = ['A', 'B', 'C', 'D', 'E'];
const REPORT_YEARS = [1995, 2026];
const MARKETS = ['phoenix', 'losangeles', 'newyork', 'atlanta', 'nashville'];
const RUNS = 8;
const SEED = 20260515;
const MAX_STEPS = 320;

const HIGH_HISPANIC_LAUNCH_TIER_FN = `function isHighHispanicLaunchTier(marketId){
  const rt=(MARKETS[marketId||'']||{}).rankTier||'';
  return rt==='large'||rt==='mega';
}`;

const SPANISH_LAUNCHES_FN_BASE = `function marketSpanishLaunchesDefs(marketId){
  const m=MARKETS[marketId||'']||null;
  if(!m||!Array.isArray(m.spanishLaunches)||!m.spanishLaunches.length)return [];
  return m.spanishLaunches.map(ent=>({
    ...ent,
    bp:ent.bp?{...ent.bp}:null,
  }));
}`;

const SPANISH_LAUNCHES_FN_SUPPLY = `function marketSpanishLaunchesDefs(marketId){
  const m=MARKETS[marketId||'']||null;
  let defs=[];
  if(m&&Array.isArray(m.spanishLaunches)&&m.spanishLaunches.length){
    defs=m.spanishLaunches.map(ent=>({
      ...ent,
      bp:ent.bp?{...ent.bp}:null,
    }));
  }
  if(isHighHispanicMarket(marketId)&&isHighHispanicLaunchTier(marketId)){
    const add=[];
    if(typeof VARIANT_SUPPLY_B!=='undefined'&&VARIANT_SUPPLY_B){
      add.push({id:'_hisp_supply_1994_fm',y:1994,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}});
    }
    if(typeof VARIANT_SUPPLY_C!=='undefined'&&VARIANT_SUPPLY_C){
      add.push({id:'_hisp_supply_2003_fm',y:2003,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'strong'}});
    }
    for(const ent of add){
      const dup=defs.some(d=>d.y===ent.y&&d.bp&&d.bp.fmt==='SPANISH');
      if(!dup)defs.push({...ent,id:marketId+ent.id,bp:{...ent.bp}});
    }
    defs.sort((a,b)=>a.y-b.y||(a.p-b.p));
    defs=defs.map(d=>{
      if(!d.bp||d.bp.fmt!=='SPANISH')return d;
      const bp={...d.bp};
      if(bp.str==='emerging')bp.str='moderate';
      return {...d,bp};
    });
  }
  return defs;
}`;

const INJECT_FN_HEAD = `function injectTierMarketCommercialExtras(stations,dialCtx,bpYear,commercialTarget){
  if(!stations||!dialCtx||!tierUsesDialScaling(dialCtx.marketId))return;
  let pi=0;
  for(let guard=0;guard<80;guard++){`;

const INJECT_FN_D = `function tierInjectBpListForMarket(marketId){
  if(isHighHispanicMarket(marketId)&&isHighHispanicLaunchTier(marketId)&&typeof VARIANT_SUPPLY_D!=='undefined'&&VARIANT_SUPPLY_D){
    const span={type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'};
    return [span,span,...TIER_MARKET_INJECT_BP];
  }
  return TIER_MARKET_INJECT_BP;
}
function injectTierMarketCommercialExtras(stations,dialCtx,bpYear,commercialTarget){
  if(!stations||!dialCtx||!tierUsesDialScaling(dialCtx.marketId))return;
  const injectBp=tierInjectBpListForMarket(dialCtx.marketId);
  let pi=0;
  for(let guard=0;guard<80;guard++){`;

const INJECT_LOOP_PATCH = `      const cand=TIER_MARKET_INJECT_BP[(pi+tries)%TIER_MARKET_INJECT_BP.length];`;
const INJECT_LOOP_D = `      const cand=injectBp[(pi+tries)%injectBp.length];`;

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

function patchLegacyForVariant(src, variant) {
  let out = injectHeadlessLaunchNewsGuard(src);

  const useB = variant === 'B' || variant === 'E';
  const useC = variant === 'C' || variant === 'E';
  const useD = variant === 'D';

  if (!out.includes('function isHighHispanicLaunchTier(')) {
    out = out.replace(
      'function isHighHispanicMarket(marketId){',
      `${HIGH_HISPANIC_LAUNCH_TIER_FN}\nfunction isHighHispanicMarket(marketId){`,
    );
  }

  const flags = [
    `const VARIANT_SUPPLY_B=${useB};`,
    `const VARIANT_SUPPLY_C=${useC};`,
    `const VARIANT_SUPPLY_D=${useD};`,
  ].join('\n');
  if (!out.includes('VARIANT_SUPPLY_B')) {
    out = out.replace(
      'function isHighHispanicMarket(marketId){',
      `${flags}\nfunction isHighHispanicMarket(marketId){`,
    );
  }

  if (useB || useC) {
    if (out.includes(SPANISH_LAUNCHES_FN_BASE)) {
      out = out.replace(SPANISH_LAUNCHES_FN_BASE, SPANISH_LAUNCHES_FN_SUPPLY);
    }
  }

  if (useD && out.includes(INJECT_FN_HEAD)) {
    out = out.replace(INJECT_FN_HEAD, INJECT_FN_D);
    out = out.replace(INJECT_LOOP_PATCH, INJECT_LOOP_D);
    out = out.replace(
      'pi=(pi+tries+1)%TIER_MARKET_INJECT_BP.length;',
      'pi=(pi+tries+1)%injectBp.length;',
    );
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

function leaderWins(histStr, fmts) {
  const parts = (histStr || '').split('|').filter(Boolean);
  if (!parts.length) return 0;
  let wins = 0;
  let total = 0;
  for (const p of parts) {
    const [fmt, n] = p.split(':');
    const c = parseInt(n, 10) || 0;
    total += c;
    if (fmts.includes(fmt)) wins += c;
  }
  return total ? wins / total : 0;
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
  const fmtAgg = Object.entries(shares || {}).map(([k, v]) => ({ k, m: v }));
  return aggregateMeansToLeadershipBuckets(fmtAgg).buckets;
}

function summarize(rows, variant, marketId, year) {
  const list = rows.filter((r) => r.ok && r.variant === variant && r.marketId === marketId && r.year === year);
  if (!list.length) return null;
  const buckets = list.map((r) => fmtSharesToBuckets(r.bookShares));
  const meanB = (key) => mean(buckets.map((b) => b[key] ?? 0));
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
    spanishStations: mean(list.map((r) => r.spanishStations)),
    spanishPct: meanB('SPANISH') * 100,
    spanishNum1: leaderWins(histStr, ['SPANISH']),
    rockPct: meanB('ROCK_ALT_AAA') * 100,
    chrPct: meanB('TOP40_CHR') * 100,
    countryPct: meanB('COUNTRY') * 100,
    hhi: mean(list.map((r) => r.hhi)),
    histStr,
  };
}

function variantSpec(v) {
  return (
    {
      A: 'current runtime (promoted C2 appeal only)',
      B: 'high-Hispanic large/mega: supplemental 1994 SPANISH FM launch',
      C: 'high-Hispanic large/mega: supplemental 2003 SPANISH FM launch',
      D: 'tier inject: SPANISH priority at front of rotation',
      E: 'B + C combined (depth + earlier FM)',
    }[v] || v
  );
}

function main() {
  console.log('Hispanic station supply A/B (in-vm only)\n');
  console.log('Miami: not in src/MARKETS — omitted.\n');

  const results = {};
  for (const variant of VARIANTS) {
    console.log(`\n========== ${variant}: ${variantSpec(variant)} ==========\n`);
    const ctx = loadCtx(variant);
    const cells = [];
    for (const year of REPORT_YEARS) {
      for (const mid of MARKETS) {
        cells.push({ variant, marketId: mid, year, genMode: genModeForYear(year), salt: marketSalt(mid) });
      }
    }
    const rows = vm.runInContext(RUN_IIFE, ctx)(cells, RUNS, SEED, MAX_STEPS);
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) console.error(`  failures: ${bad.length} — ${bad[0]?.marketId}@${bad[0]?.year}: ${bad[0]?.err}`);

    results[variant] = {};
    for (const year of REPORT_YEARS) {
      results[variant][year] = {};
      for (const mid of MARKETS) {
        results[variant][year][mid] = summarize(rows, variant, mid, year);
      }
    }

    console.log('market\tyear\tSpanStn\tSpan%\tSpan#1\tRock%\tCHR%\tCtry%\tHHI\t#1');
    for (const mid of MARKETS) {
      for (const year of REPORT_YEARS) {
        const s = results[variant][year][mid];
        if (!s) continue;
        console.log(
          [
            mid,
            year,
            s.spanishStations.toFixed(1),
            s.spanishPct.toFixed(1),
            `${(s.spanishNum1 * 100).toFixed(0)}%`,
            s.rockPct.toFixed(1),
            s.chrPct.toFixed(1),
            s.countryPct.toFixed(1),
            s.hhi.toFixed(0),
            s.histStr,
          ].join('\t'),
        );
      }
    }
  }

  console.log('\n========== High-Hispanic markets @2026 (supply vs appeal) ==========\n');
  console.log('Var\tMkt\tSpanStn\tSpan%\tSpan#1\tRock%\tCHR%');
  for (const variant of VARIANTS) {
    for (const mid of ['phoenix', 'losangeles', 'newyork']) {
      const s = results[variant][2026][mid];
      console.log(
        [
          variant,
          mid,
          s.spanishStations.toFixed(1),
          s.spanishPct.toFixed(1),
          `${(s.spanishNum1 * 100).toFixed(0)}%`,
          s.rockPct.toFixed(1),
          s.chrPct.toFixed(1),
        ].join('\t'),
      );
    }
  }

  console.log('\n========== Controls @2026 (bleed check) ==========\n');
  for (const mid of ['atlanta', 'nashville']) {
    console.log(`--- ${mid} ---`);
    for (const variant of VARIANTS) {
      const s = results[variant][2026][mid];
      console.log([variant, s.spanishStations.toFixed(1), s.spanishPct.toFixed(1), s.histStr].join('\t'));
    }
  }

  const stable = ['atlanta', 'nashville'].every((mid) => {
    const a = results.A[2026][mid].histStr;
    return VARIANTS.every((v) => results[v][2026][mid].histStr === a);
  });

  console.log(`\nControl stability: ${stable ? 'YES' : 'NO'}`);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(
    path.join(root, 'tmp', 'hispanic_station_supply_ab.json'),
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runs: RUNS,
        seed: SEED,
        miamiInMarkets: false,
        variantSpec: Object.fromEntries(VARIANTS.map((v) => [v, variantSpec(v)])),
        results,
        controlsStable: stable,
      },
      null,
      2,
    )}\n`,
  );
  console.log('\nWrote tmp/hispanic_station_supply_ab.json');
}

main();
