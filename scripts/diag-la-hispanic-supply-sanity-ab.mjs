#!/usr/bin/env node
/**
 * LA Hispanic mega supply sanity A/B — diagnostic only.
 *
 *   node scripts/diag-la-hispanic-supply-sanity-ab.mjs
 *
 * A current runtime | B 1994 launch only | C 2003 only | D 2003 moderate | E no mega leader nudge
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
const FOCUS_YEAR = 2026;
const MARKETS = ['losangeles', 'newyork', 'phoenix', 'atlanta', 'nashville'];
const RUNS = 8;
const SEED = 20260515;
const MAX_STEPS = 320;

const MEGA_SUPP_RUNTIME = `const HIGH_HISPANIC_MEGA_SPANISH_SUPPLEMENTAL=[
  {y:1994,p:1,win:2,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
  {y:2003,p:1,win:3,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'strong'}},
];`;

const MEGA_SUPP_B = `const HIGH_HISPANIC_MEGA_SPANISH_SUPPLEMENTAL=[
  {y:1994,p:1,win:2,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
];`;

const MEGA_SUPP_C = `const HIGH_HISPANIC_MEGA_SPANISH_SUPPLEMENTAL=[
  {y:2003,p:1,win:3,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'strong'}},
];`;

const MEGA_SUPP_D = `const HIGH_HISPANIC_MEGA_SPANISH_SUPPLEMENTAL=[
  {y:1994,p:1,win:2,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
  {y:2003,p:1,win:3,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
];`;

const LEADER_BOOST_HEAD = `function applyHighHispanicSpanishLeaderBoost(stations,G,activeIx,engageWeightedPop,habitDenom){
  const mid=G.marketId||ACTIVE_MARKET;
  if(!isHighHispanicMarket(mid))return;`;

const LEADER_BOOST_E = `function applyHighHispanicSpanishLeaderBoost(stations,G,activeIx,engageWeightedPop,habitDenom){
  const mid=G.marketId||ACTIVE_MARKET;
  if(isHighHispanicMegaMarket(mid)&&typeof LA_SANITY_MEGA_NO_LEADER!=='undefined'&&LA_SANITY_MEGA_NO_LEADER)return;
  if(!isHighHispanicMarket(mid))return;`;

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

  if (variant === 'B' && out.includes(MEGA_SUPP_RUNTIME)) {
    out = out.replace(MEGA_SUPP_RUNTIME, MEGA_SUPP_B);
  } else if (variant === 'C' && out.includes(MEGA_SUPP_RUNTIME)) {
    out = out.replace(MEGA_SUPP_RUNTIME, MEGA_SUPP_C);
  } else if (variant === 'D' && out.includes(MEGA_SUPP_RUNTIME)) {
    out = out.replace(MEGA_SUPP_RUNTIME, MEGA_SUPP_D);
  }

  if (variant === 'E') {
    if (!out.includes('LA_SANITY_MEGA_NO_LEADER')) {
      out = out.replace(
        'function isHighHispanicMegaMarket(marketId){',
        'const LA_SANITY_MEGA_NO_LEADER=true;\nfunction isHighHispanicMegaMarket(marketId){',
      );
    }
    if (out.includes(LEADER_BOOST_HEAD)) {
      out = out.replace(LEADER_BOOST_HEAD, LEADER_BOOST_E);
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
    talkPct: meanB('NEWS_TALK_SPORTS') * 100,
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
      A: 'current runtime (1994+2003 strong mega supplemental + leader nudge)',
      B: '1994 mega supplemental only',
      C: '2003 mega supplemental only',
      D: '1994 + 2003 moderate (not strong)',
      E: 'A launches; disable applyHighHispanicSpanishLeaderBoost on mega',
    }[v] || v
  );
}

function main() {
  console.log('LA Hispanic mega supply sanity A/B @2026 (diagnostic)\n');
  console.log('LA truth band @2026: Spanish share ~17%; Spanish #1 wins 20–45%\n');

  const results = {};
  for (const variant of VARIANTS) {
    console.log(`\n========== ${variant}: ${variantSpec(variant)} ==========\n`);
    const ctx = loadCtx(variant);
    const cells = MARKETS.map((mid) => ({
      variant,
      marketId: mid,
      year: FOCUS_YEAR,
      genMode: 'mp1985',
      salt: marketSalt(mid),
    }));
    const rows = vm.runInContext(RUN_IIFE, ctx)(cells, RUNS, SEED, MAX_STEPS);
    results[variant] = {};
    for (const mid of MARKETS) {
      results[variant][mid] = summarize(rows, variant, mid, FOCUS_YEAR);
    }

    console.log('market\tSpanStn\tSpan%\tSpan#1\tTalk%\tRock%\tCHR%\tCtry%\tHHI\t#1');
    for (const mid of MARKETS) {
      const s = results[variant][mid];
      console.log(
        [
          mid,
          s.spanishStations.toFixed(1),
          s.spanishPct.toFixed(1),
          `${(s.spanishNum1 * 100).toFixed(0)}%`,
          s.talkPct.toFixed(1),
          s.rockPct.toFixed(1),
          s.chrPct.toFixed(1),
          s.countryPct.toFixed(1),
          s.hhi.toFixed(0),
          s.histStr,
        ].join('\t'),
      );
    }
  }

  console.log('\n========== LA @2026 vs truth (17% share, 20–45% Span#1) ==========\n');
  console.log('Var\tSpan%\tSpan#1\tSpanStn\tTalk%\tRock%');
  for (const v of VARIANTS) {
    const s = results[v].losangeles;
    console.log([v, s.spanishPct.toFixed(1), `${(s.spanishNum1 * 100).toFixed(0)}%`, s.spanishStations.toFixed(1), s.talkPct.toFixed(1), s.rockPct.toFixed(1)].join('\t'));
  }

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(
    path.join(root, 'tmp', 'la_hispanic_supply_sanity_ab.json'),
    `${JSON.stringify({ recordedAt: new Date().toISOString(), runs: RUNS, seed: SEED, variantSpec: Object.fromEntries(VARIANTS.map((v) => [v, variantSpec(v)])), laTruth2026: { spanishPct: 17, spanishNum1Range: [0.2, 0.45] }, results }, null, 2)}\n`,
  );
  console.log('\nWrote tmp/la_hispanic_supply_sanity_ab.json');
}

main();
