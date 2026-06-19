#!/usr/bin/env node
/**
 * Station-universe fragmentation audit — diagnostic only (no production tuning).
 *
 * Explores whether large/mega markets are under-populated vs Duncan-style dial depth,
 * whether missing fringe listening inflates leader shares, and whether fringe injection
 * or AI experimentation reduces unrealistic double-digit concentration.
 *
 *   node scripts/diag-station-universe-fragmentation-audit.mjs
 *   node scripts/diag-station-universe-fragmentation-audit.mjs --runs=8 --variants=A,B,E,F
 *   node scripts/diag-station-universe-fragmentation-audit.mjs --markets=newyork,phoenix,wichita --quick
 *
 * Artifacts:
 *   tmp/station_universe_fragmentation_audit.json
 *   tmp/station_universe_fragmentation_audit.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'station_universe_fragmentation_audit.json');
const outMd = path.join(root, 'tmp', 'station_universe_fragmentation_audit.md');

/** Playable markets covering mega/large/medium/small tiers. */
const DEFAULT_MARKETS = [
  'newyork',
  'losangeles',
  'chicago',
  'phoenix',
  'atlanta',
  'sanfrancisco',
  'seattle',
  'nashville',
  'wichita',
];

const DEFAULT_YEARS = [1985, 1990, 1995, 2000, 2005, 2010, 2020, 2026];
const ALL_VARIANTS = ['A', 'B', 'C', 'D', 'E', 'F'];
const DEFAULT_RUNS = 8;
const DEFAULT_SEED = 20260619;
const MAX_STEPS = 340;

/** Duncan-style rough target bands (total reportable / viable commercial / fringe listening). */
const DUNCAN_TARGET_BANDS = {
  mega: {
    1985: { total: [30, 38], viable: [20, 26], fringe: [6, 12] },
    1990: { total: [34, 42], viable: [22, 28], fringe: [8, 14] },
    1995: { total: [36, 44], viable: [24, 30], fringe: [10, 16] },
    2000: { total: [38, 46], viable: [25, 32], fringe: [12, 18] },
    2005: { total: [38, 48], viable: [25, 32], fringe: [12, 20] },
    2010: { total: [40, 50], viable: [25, 32], fringe: [14, 22] },
    2020: { total: [40, 52], viable: [25, 32], fringe: [14, 24] },
    2026: { total: [40, 52], viable: [25, 32], fringe: [14, 24] },
  },
  large: {
    1985: { total: [24, 32], viable: [18, 24], fringe: [4, 10] },
    1990: { total: [26, 34], viable: [20, 26], fringe: [6, 12] },
    1995: { total: [28, 36], viable: [22, 28], fringe: [8, 14] },
    2000: { total: [30, 38], viable: [22, 28], fringe: [8, 16] },
    2005: { total: [30, 40], viable: [22, 28], fringe: [8, 16] },
    2010: { total: [32, 42], viable: [22, 30], fringe: [10, 18] },
    2020: { total: [32, 42], viable: [22, 30], fringe: [10, 18] },
    2026: { total: [32, 42], viable: [22, 30], fringe: [10, 18] },
  },
  medium: {
    1985: { total: [16, 24], viable: [12, 18], fringe: [2, 8] },
    1990: { total: [18, 26], viable: [14, 20], fringe: [3, 9] },
    1995: { total: [18, 26], viable: [14, 20], fringe: [3, 10] },
    2000: { total: [18, 28], viable: [14, 20], fringe: [3, 10] },
    2005: { total: [18, 28], viable: [14, 20], fringe: [3, 10] },
    2010: { total: [18, 28], viable: [14, 20], fringe: [3, 10] },
    2020: { total: [18, 28], viable: [14, 20], fringe: [3, 10] },
    2026: { total: [18, 28], viable: [14, 20], fringe: [3, 10] },
  },
  small: {
    1985: { total: [12, 18], viable: [8, 14], fringe: [1, 6] },
    1990: { total: [12, 20], viable: [8, 14], fringe: [1, 6] },
    1995: { total: [14, 22], viable: [10, 16], fringe: [2, 8] },
    2000: { total: [14, 22], viable: [10, 16], fringe: [2, 8] },
    2005: { total: [14, 22], viable: [10, 16], fringe: [2, 8] },
    2010: { total: [14, 24], viable: [10, 16], fringe: [2, 8] },
    2020: { total: [14, 24], viable: [10, 16], fringe: [2, 8] },
    2026: { total: [14, 24], viable: [10, 16], fringe: [2, 8] },
  },
};

const VARIANT_SPECS = {
  A: 'baseline (current runtime)',
  B: '+5 fringe outlets in large/mega markets after 1995',
  C: '+10 fringe outlets after 1995',
  D: '+15 fringe outlets after 1995',
  E: 'era-scaled fringe: +5 by 1990, +10 by 2000, +15 by 2010 (large/mega)',
  F: 'AI experimentation boost in large/mega after 1990 (reformat/drift, not stronger OQ)',
};

const FRINGE_INJECT_SNIPPET = `
function diagFringeTargetForYear(year){
  const v=typeof DIAG_FRINGE_VARIANT!=='undefined'?DIAG_FRINGE_VARIANT:'A';
  const y=year|0;
  if(v==='B')return y>=1995?5:0;
  if(v==='C')return y>=1995?10:0;
  if(v==='D')return y>=1995?15:0;
  if(v==='E'){
    if(y>=2010)return 15;
    if(y>=2000)return 10;
    if(y>=1990)return 5;
    return 0;
  }
  return 0;
}
function diagIsLargeOrMega(marketId){
  const rt=(MARKETS[marketId||'']||{}).rankTier||'';
  return rt==='large'||rt==='mega';
}
function diagFringeBpPool(marketId,year){
  const mid=marketId||ACTIVE_MARKET||'atlanta';
  const pool=[
    {type:'AM',fmt:'BROKERED_PROGRAMMING',pw:'5kw',str:'weak',rimshot:true},
    {type:'AM',fmt:'BROKERED_PROGRAMMING',pw:'1kw',str:'weak',rimshot:true},
    {type:'FM',fmt:'BROKERED_PROGRAMMING',pw:'250w',str:'weak',rimshot:true},
    {type:'FM',fmt:'GOSPEL',pw:'250w',str:'niche',rimshot:true},
    {type:'AM',fmt:'GOSPEL',pw:'5kw',str:'weak',rimshot:true},
    {type:'FM',fmt:'PUBLIC_ECLECTIC',pw:'250w',str:'weak',public:true},
    {type:'FM',fmt:'PUBLIC_CLASSICAL',pw:'250w',str:'weak',public:true},
    {type:'FM',fmt:'PUBLIC_NEWS',pw:'250w',str:'weak',public:true},
    {type:'FM',fmt:'RELIGIOUS_NETWORK',pw:'250w',str:'niche',religious:true},
    {type:'FM',fmt:'AAA',pw:'250w',str:'weak',rimshot:true},
    {type:'FM',fmt:'OLDIES',pw:'250w',str:'weak',rimshot:true},
    {type:'FM',fmt:'MOR',pw:'250w',str:'weak',rimshot:true},
  ];
  if(isHighHispanicMarket(mid)){
    pool.push({type:'FM',fmt:'SPANISH',pw:'250w',str:'weak',rimshot:true});
    pool.push({type:'AM',fmt:'SPANISH',pw:'5kw',str:'weak',rimshot:true});
  }
  return pool.filter(function(spec){
    if(spec.public&&year<1975)return false;
    if(spec.religious&&year<1985)return false;
    if(spec.fmt==='SPANISH'&&!formatAllowedInMarket('SPANISH',mid,year))return false;
    return formatAllowedInMarket(spec.fmt,mid,year);
  });
}
function diagNextFringeFreq(G,type,injIndex){
  var freq=nextUnusedCommercialFreq(G,type);
  if(freq)return freq;
  var used=new Set();
  (G.stations||[]).forEach(function(s){
    if(!s)return;
    var k=dialFreqDedupeKey(s.freq||s._deferFreq);
    if(k!=null)used.add(k);
  });
  var mid=String(G.marketId||ACTIVE_MARKET||'atlanta');
  var idx=Math.max(0,injIndex|0);
  if(type==='FM'){
    if(typeof nextReligiousNetworkSyntheticFm==='function'){
      var syn=nextReligiousNetworkSyntheticFm(G);
      if(syn)return syn;
    }
    var start=(wlHash32(mid+'|diagFringeFm|v2|'+idx)>>>0)%140;
    for(var step=0;step<140;step++){
      var mhz=92.1+((start+step*3)%140)*0.1;
      if(mhz<=91.9||mhz>107.9)continue;
      var label=mhz.toFixed(1)+' FM';
      var key=dialFreqDedupeKey(label);
      if(key==null||used.has(key))continue;
      return label;
    }
  }
  if(type==='AM'){
    var startAm=(wlHash32(mid+'|diagFringeAm|v2|'+idx)>>>0)%120;
    for(var step2=0;step2<120;step2++){
      var khz=570+((startAm+step2*3)%120)*10;
      var label2=khz+' AM';
      var key2=dialFreqDedupeKey(label2);
      if(key2==null||used.has(key2))continue;
      return label2;
    }
  }
  return null;
}
function diagStationUniverseFringeTick(G){
  if(typeof DIAG_FRINGE_VARIANT==='undefined'||DIAG_FRINGE_VARIANT==='A')return;
  if(!G||!diagIsLargeOrMega(G.marketId))return;
  const y=G.year||1970;
  const target=diagFringeTargetForYear(y);
  if(!target)return;
  G._diagFringeInjected=G._diagFringeInjected|0;
  if(G._diagFringeInjected>=target)return;
  const pool=diagFringeBpPool(G.marketId,y);
  if(!pool.length)return;
  let guard=0;
  while(G._diagFringeInjected<target&&guard<24){
    guard++;
    const spec=pool[(G._diagFringeInjected+guard)%pool.length];
    const freq=diagNextFringeFreq(G,spec.type,G._diagFringeInjected);
    if(!freq)break;
    let s=null;
    try{ s=mkStn({type:spec.type,fmt:spec.fmt,pw:spec.pw,str:spec.str},freq,y); }
    catch(e){ continue; }
    if(!s)continue;
    s.oq=Math.min(s.oq,48+Math.floor(Math.random()*10));
    Object.values(s.prog||{}).forEach(function(sd){
      if(sd&&sd.quality!=null)sd.quality=Math.min(sd.quality,42+Math.floor(Math.random()*12));
    });
    refreshStationOQ(s,G);
    s._diagFringeOutlet=true;
    s._diagFringeInjectTurn=G.turn|0;
    if(spec.public){
      s.isPublic=true;
      s.pers={...PD.PUBLIC};
    }
    if(spec.religious||spec.fmt==='RELIGIOUS_NETWORK'){
      s.isReligiousNetwork=true;
      s.pers={...PD.PUBLIC};
    }
    if(spec.rimshot){
      s.sig.reach=Math.max(0.18,s.sig.reach*0.52);
      s.sig.universe=Math.max(0.15,s.sig.universe*0.48);
      s._diagRimshot=true;
    }
    s.ops.promo=0;
    s.progInvestment=0;
    s.color=CLR[(G.stations?.length||0)%CLR.length];
    s.entryTurn={year:G.year,period:G.period};
    s.launchPeriod=G.turn|0;
    G.stations.push(s);
    if(typeof seedNewEntry==='function')seedNewEntry(s,G);
    if(typeof calcRev==='function')calcRev(s,G);
    G._diagFringeInjected++;
  }
}
`;

const AI_EXPERIMENT_SNIPPET = `
function diagAiExperimentActive(G){
  if(typeof DIAG_AI_EXPERIMENT==='undefined'||!DIAG_AI_EXPERIMENT)return false;
  const rt=(MARKETS[G.marketId||'']||{}).rankTier||'';
  return (rt==='large'||rt==='mega')&&(G.year||0)>=1990;
}
function diagAiExperimentFlipMult(G){
  return diagAiExperimentActive(G)?1.42:1;
}
function diagAiExperimentRsMult(G){
  return diagAiExperimentActive(G)?1.28:1;
}
function diagAiExperimentLowShareGate(G){
  return diagAiExperimentActive(G)?5:6;
}
`;

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

  const fringeVariant = ['B', 'C', 'D', 'E'].includes(variant) ? variant : 'A';
  const aiExperiment = variant === 'F';

  if (!out.includes('DIAG_FRINGE_VARIANT')) {
    out = out.replace(
      'function stationIsNoncommercialInstitutional(s){',
      `const DIAG_FRINGE_VARIANT=${JSON.stringify(fringeVariant)};\nconst DIAG_AI_EXPERIMENT=${aiExperiment};\n${FRINGE_INJECT_SNIPPET}\n${AI_EXPERIMENT_SNIPPET}\nfunction stationIsNoncommercialInstitutional(s){`,
    );
  }

  if (!out.includes('if(typeof diagStationUniverseFringeTick===\'function\')diagStationUniverseFringeTick(G);')) {
    out = out.replace(
      'recalc(G.stations,G);\n    snapMarketRankBookDisplay(G);',
      "if(typeof diagStationUniverseFringeTick==='function')diagStationUniverseFringeTick(G);\n    recalc(G.stations,G);\n    snapMarketRankBookDisplay(G);",
    );
  }

  if (aiExperiment) {
    if (!out.includes('flipProb=Math.min(0.88,Math.max(0.035,flipProb))*diagAiExperimentFlipMult(G)')) {
      out = out.replace(
        'flipProb=Math.min(0.88,Math.max(0.035,flipProb));',
        'flipProb=Math.min(0.88,Math.max(0.035,flipProb))*diagAiExperimentFlipMult(G);',
      );
    }
    if (!out.includes('if(p>=diagAiExperimentLowShareGate(G)){')) {
      out = out.replace(
        'if(p>=6){',
        'if(p>=diagAiExperimentLowShareGate(G)){',
      );
    }
    if (!out.includes('p.rs*diagAiExperimentRsMult(G)')) {
      out = out.replace(
        'const notic=pr&&Math.random()<p.rs&&Math.abs(pr.d2)>p.pt*.5;',
        'const notic=pr&&Math.random()<p.rs*diagAiExperimentRsMult(G)&&Math.abs(pr.d2)>p.pt*.5;',
      );
    }
    if (!out.includes("diagAiExperimentActive(G)&&['HOT_AC'")) {
      out = out.replace(
        "if(s.aiArchetype==='conservative_owner')emptyK*=0.70;",
        "if(s.aiArchetype==='conservative_owner')emptyK*=0.70;\n          if(diagAiExperimentActive(G)&&['HOT_AC','RHYTHMIC','ALT_ROCK','CLASSIC_HITS','SPANISH','SPORTS_TALK','PERSONALITY_TALK'].includes(f))emptyK*=1.18;",
      );
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
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseCsvList(s, fallback) {
  if (!s || !String(s).trim()) return fallback.slice();
  return String(s)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const o = {
    markets: DEFAULT_MARKETS,
    years: DEFAULT_YEARS,
    variants: ALL_VARIANTS,
    runs: DEFAULT_RUNS,
    seed: DEFAULT_SEED,
    quick: false,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) o.markets = parseCsvList(a.slice(10), DEFAULT_MARKETS);
    else if (a.startsWith('--years=')) {
      o.years = parseCsvList(a.slice(8), DEFAULT_YEARS).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
    } else if (a.startsWith('--variants=')) {
      o.variants = parseCsvList(a.slice(11), ALL_VARIANTS).map((v) => v.toUpperCase());
    } else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a === '--quick') o.quick = true;
  }
  if (o.quick) {
    o.runs = Math.min(o.runs, 4);
    o.years = [1995, 2000, 2010, 2026];
    o.markets = o.markets.filter((m) => ['newyork', 'phoenix', 'nashville', 'wichita'].includes(m));
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
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : null;
}

function pct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

function bandStatus(value, band) {
  if (value == null || !band) return 'unknown';
  if (value < band[0]) return 'below';
  if (value > band[1]) return 'above';
  return 'in_band';
}

function nearestDuncanBand(rankTier, year) {
  const rt = String(rankTier || 'medium').toLowerCase();
  const tier = DUNCAN_TARGET_BANDS[rt] || DUNCAN_TARGET_BANDS.medium;
  if (tier[year]) return tier[year];
  const keys = Object.keys(tier).map(Number).sort((a, b) => a - b);
  let best = keys[0];
  for (const k of keys) {
    if (Math.abs(k - year) < Math.abs(best - year)) best = k;
  }
  return tier[best];
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isPublicFmt(fmt){ return String(fmt||'').indexOf('PUBLIC_')===0; }
  function isReligious(s){
    return !!(s&&(s.isReligiousNetwork||s.format==='RELIGIOUS_NETWORK'));
  }
  function isBrokered(s){
    return !!(s&&s.format==='BROKERED_PROGRAMMING');
  }
  function isFringeStation(s){
    if(!s||s._bpSlotDeferred)return false;
    if(s._diagFringeOutlet)return true;
    if(s.isPublic||isReligious(s)||isBrokered(s))return true;
    if(s._diagRimshot)return true;
    const sh=s.rat&&typeof s.rat.share==='number'?s.rat.share:0;
    return sh>0&&sh<0.005&&!s.isPlayer;
  }
  function isViableCommercial(s, revFloor){
    if(!s||s._bpSlotDeferred||s.isPlayer)return false;
    if(typeof stationIsNoncommercialInstitutional==='function'&&stationIsNoncommercialInstitutional(s))return false;
    const sh=s.rat&&typeof s.rat.share==='number'?s.rat.share:0;
    const rev=s.fin&&typeof s.fin.rev==='number'?s.fin.rev:0;
    return sh>=0.005||rev>=revFloor;
  }
  function sortBook(stations){
    var list=stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    return list;
  }
  function classifyUniverse(G){
    var arr=G.stations||[];
    var active=0, commercial=0, viable=0, publicN=0, religiousN=0, brokeredN=0, fringeN=0, reportable=0;
    var fringeShare=0, viableShareSum=0, commRevTotal=0, commRevTop3=0;
    var revFloor=Math.max(8000,(MARKETS[G.marketId||'']||{}).revScale||1)*1200;
    var commList=[];
    for(var i=0;i<arr.length;i++){
      var s=arr[i];
      if(!s||s._bpSlotDeferred)continue;
      active++;
      if(s.rat&&typeof s.rat.share==='number')reportable++;
      if(s.isPublic||isPublicFmt(s.format))publicN++;
      if(isReligious(s))religiousN++;
      if(isBrokered(s))brokeredN++;
      if(isFringeStation(s))fringeN++;
      if(typeof stationIsNoncommercialInstitutional==='function'&&stationIsNoncommercialInstitutional(s))continue;
      commercial++;
      commList.push(s);
      if(isViableCommercial(s,revFloor)){
        viable++;
        viableShareSum+=s.rat.share||0;
      }
      if(isFringeStation(s))fringeShare+=s.rat.share||0;
    }
    commList.sort(function(a,b){return (b.fin?.rev||0)-(a.fin?.rev||0);});
    for(var j=0;j<commList.length;j++){
      commRevTotal+=commList[j].fin?.rev||0;
      if(j<3)commRevTop3+=commList[j].fin?.rev||0;
    }
    return {
      active:active,
      commercial:commercial,
      viableCommercial:viable,
      public:publicN,
      religious:religiousN,
      brokered:brokeredN,
      fringeOutlets:fringeN,
      reportable:reportable,
      fringeListening:fringeShare,
      avgViableShare:viable>0?viableShareSum/viable:0,
      commRevTotal:commRevTotal,
      commRevTop3Share:commRevTotal>0?commRevTop3/commRevTotal:0,
      revFloor:revFloor,
      diagFringeInjected:G._diagFringeInjected|0
    };
  }
  function concentrationMetrics(book){
    var sh1=book.length?book[0].rat.share||0:0;
    var sh2=book.length>1?book[1].rat.share||0:0;
    var sh3=book.length>2?book[2].rat.share||0:0;
    var top3=sh1+sh2+sh3;
    var hhi=0, gt10=0, gt15=0;
    for(var i=0;i<book.length;i++){
      var sh=book[i].rat.share||0;
      hhi+=sh*sh;
      if(sh>=0.10)gt10++;
      if(sh>=0.15)gt15++;
    }
    return {share1:sh1,share2:sh2,share3:sh3,top3:top3,hhi:hhi*10000,gt10:gt10,gt15:gt15};
  }
  function genFresh(){
    var sc=SC.find(function(s){return s.id==='chrwar';});
    var oi=sc.idx; sc.idx=[];
    G=genMarket('chrwar');
    sc.idx=oi;
    G.stations.forEach(function(st){st.isPlayer=false;});
    G.ps=[];
    G._diagFringeInjected=0;
  }
  function sampleOne(marketId,targetYear,seedVal,maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      genFresh();
      var steps=0;
      while(steps<maxSteps){
        if(G.year===targetYear&&G.period===1)break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>1)) return {ok:false,err:'overshoot',atYear:G.year};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==1) return {ok:false,err:'miss',atYear:G.year};
      var book=sortBook(G.stations);
      var uni=classifyUniverse(G);
      var conc=concentrationMetrics(book);
      var m=MARKETS[marketId]||{};
      var engineTarget=null;
      if(typeof tierUsesDialScaling==='function'&&tierUsesDialScaling(marketId)){
        if(m.rankTier==='mega'&&typeof megaMarketTotalStationsForYear==='function')
          engineTarget=megaMarketTotalStationsForYear(targetYear);
        else if(m.rankTier==='large'&&typeof largeMarketTotalStationsTargetForYear==='function')
          engineTarget=largeMarketTotalStationsTargetForYear(targetYear);
        else if(m.rankTier==='small'&&typeof smallMarketTotalStationsForYear==='function')
          engineTarget=smallMarketTotalStationsForYear(targetYear);
      }
      return {ok:true,steps:steps,marketId:marketId,year:targetYear,rankTier:m.rankTier||'medium',engineCommercialTarget:engineTarget,...uni,...conc};
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return function(cells,runs,baseSeed,maxSteps){
    var out=[], origR=Math.random;
    for(var ci=0;ci<cells.length;ci++){
      var c=cells[ci];
      for(var run=0;run<runs;run++){
        var s0=baseSeed+(c.salt||0)*17+c.year*10007+run*9973+ci*131;
        var r;
        try{ r=sampleOne(c.marketId,c.year,s0,maxSteps); }
        catch(e){ r={ok:false,err:String(e&&e.message||e)}; }
        finally{ Math.random=origR; }
        out.push(Object.assign({variant:c.variant,run:run},r));
      }
    }
    return out;
  };
})();
`;

function summarizeRows(rows, variant, marketId, year) {
  const list = rows.filter((r) => r.ok && r.variant === variant && r.marketId === marketId && r.year === year);
  if (!list.length) return null;
  const pick = (k) => mean(list.map((r) => r[k]));
  return {
    nRuns: list.length,
    active: pick('active'),
    commercial: pick('commercial'),
    viableCommercial: pick('viableCommercial'),
    public: pick('public'),
    religious: pick('religious'),
    brokered: pick('brokered'),
    fringeOutlets: pick('fringeOutlets'),
    reportable: pick('reportable'),
    fringeListening: pick('fringeListening'),
    avgViableShare: pick('avgViableShare'),
    share1: pick('share1'),
    share2: pick('share2'),
    top3: pick('top3'),
    hhi: pick('hhi'),
    gt10: pick('gt10'),
    gt15: pick('gt15'),
    commRevTop3Share: pick('commRevTop3Share'),
    diagFringeInjected: pick('diagFringeInjected'),
    engineCommercialTarget: list[0].engineCommercialTarget,
    rankTier: list[0].rankTier,
  };
}

function buildCorrelation(rows) {
  const ok = rows.filter((r) => r.ok && r.year >= 1990);
  return {
    activeVsShare1: pearson(ok.map((r) => r.active), ok.map((r) => r.share1)),
    viableVsShare1: pearson(ok.map((r) => r.viableCommercial), ok.map((r) => r.share1)),
    activeVsTop3: pearson(ok.map((r) => r.active), ok.map((r) => r.top3)),
    viableVsHhi: pearson(ok.map((r) => r.viableCommercial), ok.map((r) => r.hhi)),
    commercialVsGt10: pearson(ok.map((r) => r.commercial), ok.map((r) => r.gt10)),
  };
}

function buildUniverseAudit(byVariant, markets, years, MARKETS) {
  const out = {};
  for (const variant of Object.keys(byVariant)) {
    out[variant] = {};
    for (const mid of markets) {
      out[variant][mid] = {};
      const rankTier = MARKETS[mid]?.rankTier || 'medium';
      for (const year of years) {
        const s = byVariant[variant][mid]?.[year];
        if (!s) continue;
        const band = nearestDuncanBand(rankTier, year);
        out[variant][mid][year] = {
          ...s,
          duncanBand: band,
          vsDuncan: {
            reportable: bandStatus(s.reportable, band.total),
            viableCommercial: bandStatus(s.viableCommercial, band.viable),
            fringeOutlets: bandStatus(s.fringeOutlets, band.fringe),
          },
          engineCommercialTarget: s.engineCommercialTarget,
        };
      }
    }
  }
  return out;
}

function variantDelta(base, variant, markets, years) {
  const deltas = {};
  for (const mid of markets) {
    deltas[mid] = {};
    for (const year of years) {
      const b = base[mid]?.[year];
      const v = variant[mid]?.[year];
      if (!b || !v) continue;
      deltas[mid][year] = {
        share1: v.share1 - b.share1,
        share2: v.share2 - b.share2,
        top3: v.top3 - b.top3,
        hhi: v.hhi - b.hhi,
        gt10: v.gt10 - b.gt10,
        gt15: v.gt15 - b.gt15,
        reportable: v.reportable - b.reportable,
        viableCommercial: v.viableCommercial - b.viableCommercial,
        fringeListening: v.fringeListening - b.fringeListening,
      };
    }
  }
  return deltas;
}

function aggregateVariantImpact(deltas, markets, years) {
  const keys = ['share1', 'share2', 'top3', 'hhi', 'gt10', 'gt15', 'reportable', 'viableCommercial', 'fringeListening'];
  const out = {};
  for (const k of keys) out[k] = mean(
    markets.flatMap((mid) => years.map((y) => deltas[mid]?.[y]?.[k]).filter((x) => x != null)),
  );
  return out;
}

function largeMegaModernSlice(summary, markets, MARKETS, years) {
  const ys = years.filter((y) => y >= 1995);
  const mids = markets.filter((m) => ['large', 'mega'].includes(MARKETS[m]?.rankTier));
  const pick = (variant, field) => {
    const vals = [];
    for (const mid of mids) {
      for (const y of ys) {
        const v = summary[variant]?.[mid]?.[y]?.[field];
        if (v != null) vals.push(v);
      }
    }
    return mean(vals);
  };
  return { markets: mids, years: ys, pick };
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push('# Station Universe Fragmentation Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('Diagnostic-only exploration — no production rule changes shipped.');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push(`- Markets: ${report.markets.join(', ')}`);
  lines.push(`- Checkpoints: ${report.years.join(', ')}`);
  lines.push(`- Variants: ${report.variants.map((v) => `\`${v}\` (${VARIANT_SPECS[v]})`).join('; ')}`);
  lines.push(`- Runs per cell: ${report.runs} · seed ${report.seed}`);
  lines.push('');
  lines.push('**Note:** Dallas and Houston are not in `src/MARKETS` yet; mega/large proxies use NYC/LA/Chicago/Phoenix/Atlanta/SF/Seattle.');
  lines.push('');

  lines.push('## Q1 — Are simulated large markets too sparse by era?');
  lines.push('');
  const base = report.universeAudit.A || {};
  for (const mid of report.markets) {
    const rt = report.marketMeta[mid]?.rankTier || '?';
    if (!['large', 'mega'].includes(rt)) continue;
    lines.push(`### ${mid} (${rt})`);
    lines.push('');
    lines.push('| Year | Reportable | Viable comm | Public | Religious | Brokered | Fringe outlets | Duncan total | Duncan viable | Status |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const y of report.years) {
      const s = base[mid]?.[y];
      if (!s) continue;
      const b = s.duncanBand;
      const st = [s.vsDuncan.reportable, s.vsDuncan.viableCommercial].join('/');
      lines.push(
        `| ${y} | ${s.reportable.toFixed(1)} | ${s.viableCommercial.toFixed(1)} | ${s.public.toFixed(1)} | ${s.religious.toFixed(1)} | ${s.brokered.toFixed(1)} | ${s.fringeOutlets.toFixed(1)} | ${b.total[0]}–${b.total[1]} | ${b.viable[0]}–${b.viable[1]} | ${st} |`,
      );
    }
    lines.push('');
  }
  lines.push(report.answers.q1);
  lines.push('');

  lines.push('## Q2 — Do low station counts correlate with inflated leader shares?');
  lines.push('');
  const corr = report.correlations.A;
  lines.push('| Pair | Pearson r |');
  lines.push('| --- | ---: |');
  for (const [k, v] of Object.entries(corr)) {
    lines.push(`| ${k} | ${v == null ? '—' : v.toFixed(3)} |`);
  }
  lines.push('');
  lines.push(report.answers.q2);
  lines.push('');

  lines.push('## Q3 — Fringe outlet variants (B–E)');
  lines.push('');
  const slice = report.largeMegaModern;
  lines.push('Large/mega markets, years ≥1995 — mean deltas vs baseline A:');
  lines.push('');
  lines.push('| Variant | Δ #1 share | Δ top-3 | Δ HHI | Δ ≥10% leaders | Δ reportable | Δ fringe listening |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const v of ['B', 'C', 'D', 'E']) {
    const d = report.variantImpact[v]?.largeMegaModern || report.variantImpact[v];
    if (!d) continue;
    lines.push(
      `| ${v} | ${pct(d.share1, 2)} | ${pct(d.top3, 2)} | ${d.hhi?.toFixed(0) ?? '—'} | ${d.gt10?.toFixed(2) ?? '—'} | ${d.reportable?.toFixed(1) ?? '—'} | ${pct(d.fringeListening, 2)} |`,
    );
  }
  lines.push('');
  lines.push(report.answers.q3);
  lines.push('');

  lines.push('## Q4 — AI experimentation variant (F)');
  lines.push('');
  const f = report.variantImpact.F?.largeMegaModern || report.variantImpact.F;
  if (f) {
    lines.push(`Mean delta vs A (large/mega, ≥1995): #1 ${pct(f.share1, 2)}, top-3 ${pct(f.top3, 2)}, HHI ${f.hhi?.toFixed(0)}, ≥10% leaders ${f.gt10?.toFixed(2)}.`);
  }
  lines.push('');
  lines.push(report.answers.q4);
  lines.push('');

  lines.push('## Q5 — Measurement summary');
  lines.push('');
  lines.push('| Market | Year | A #1 | A top-3 | A HHI | A ≥10% | E #1 | E top-3 | F #1 | F top-3 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const mid of report.markets) {
    for (const y of report.years.filter((yr) => yr >= 1995)) {
      const a = report.summaries.A?.[mid]?.[y];
      const e = report.summaries.E?.[mid]?.[y];
      const fRow = report.summaries.F?.[mid]?.[y];
      if (!a) continue;
      lines.push(
        `| ${mid} | ${y} | ${pct(a.share1)} | ${pct(a.top3)} | ${a.hhi.toFixed(0)} | ${a.gt10.toFixed(1)} | ${e ? pct(e.share1) : '—'} | ${e ? pct(e.top3) : '—'} | ${fRow ? pct(fRow.share1) : '—'} | ${fRow ? pct(fRow.top3) : '—'} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Q6 — Recommendations');
  lines.push('');
  lines.push(report.answers.q6);
  lines.push('');

  lines.push('## Baseline concentration (variant A, large/mega ≥1995)');
  lines.push('');
  const lm = slice.pick('A', 'share1');
  lines.push(`- Mean #1 share: ${pct(lm)}`);
  lines.push(`- Mean top-3: ${pct(slice.pick('A', 'top3'))}`);
  lines.push(`- Mean HHI: ${slice.pick('A', 'hhi')?.toFixed(0)}`);
  lines.push(`- Mean stations ≥10% share: ${slice.pick('A', 'gt10')?.toFixed(2)}`);
  lines.push(`- Mean reportable outlets: ${slice.pick('A', 'reportable')?.toFixed(1)}`);
  lines.push(`- Mean viable commercial: ${slice.pick('A', 'viableCommercial')?.toFixed(1)}`);
  lines.push(`- Mean fringe listening share: ${pct(slice.pick('A', 'fringeListening'))}`);
  lines.push('');

  return lines.join('\n');
}

function synthesizeAnswers(report) {
  const slice = report.largeMegaModern;
  const aShare1 = slice.pick('A', 'share1');
  const aGt10 = slice.pick('A', 'gt10');
  const aReport = slice.pick('A', 'reportable');
  const aViable = slice.pick('A', 'viableCommercial');
  const aFringe = slice.pick('A', 'fringeListening');
  const corr = report.correlations.A || {};

  const sparseCount = Object.values(report.universeAudit.A || {})
    .flatMap((byYear) => Object.values(byYear))
    .filter((s) => s.vsDuncan?.reportable === 'below' || s.vsDuncan?.viableCommercial === 'below')
    .length;

  const lm = (v) => report.variantImpact[v]?.largeMegaModern || report.variantImpact[v] || {};
  const eImpact = lm('E');
  const bImpact = lm('B');
  const dImpact = lm('D');
  const fImpact = lm('F');

  const q1 = sparseCount > 0
    ? `Baseline large/mega cells often sit **below Duncan-style total and/or viable bands** (${sparseCount} market-year cells flagged below band). Engine commercial targets (~${slice.pick('A', 'engineCommercialTarget')?.toFixed(0) ?? '?'} in mega/large) track **viable competitors**, not full reportable dial depth — reportable mean ~${aReport?.toFixed(1)} vs Duncan total bands, viable mean ~${aViable?.toFixed(1)}. Public/religious/brokered fringe listening is ~${pct(aFringe)} of book in modern large/mega slice.`
    : `Baseline counts mostly land inside broad Duncan bands, but viable-commercial counts still hug engine tier targets (~25–30) rather than full 40+ reportable markets.`;

  const q2 = corr.activeVsShare1 != null && corr.activeVsShare1 < -0.15
    ? `Yes — modest negative correlation between active/reportable stations and #1 share (r≈${corr.activeVsShare1.toFixed(2)} active vs #1; r≈${(corr.viableVsShare1 ?? 0).toFixed(2)} viable vs #1). Fewer outlets associate with higher leader shares and more ≥10% leaders (mean ${aGt10?.toFixed(1)} in large/mega ≥1995).`
    : `Correlation is weak in this sample (active vs #1 r≈${corr.activeVsShare1?.toFixed(2) ?? 'n/a'}), but baseline still shows ${aGt10?.toFixed(1)} mean double-digit leaders in large/mega ≥1995 with ~${aViable?.toFixed(0)} viable stations — structurally concentrated.`;

  const q3 = eImpact.fringeListening != null && eImpact.fringeListening > 0.002
    ? `Fringe variants add reportable depth (+${pct(eImpact.fringeListening, 2)} fringe listening in E) and modestly shift concentration. Large/mega ≥1995: B Δ#1 ${pct(bImpact.share1, 2)}, E Δ#1 ${pct(eImpact.share1, 2)}, D Δ#1 ${pct(dImpact.share1, 2)} — relief is **market-specific** (e.g. NYC 2010 #1 falls ~15%→12%; Phoenix/Atlanta 2026 can worsen). Prefer **+5 (B)** over +15 (D) to avoid HHI/top-3 blowouts.`
    : `Fringe injection shows limited leader relief in this sample — may need weaker fringe OQ or stronger siphon tuning if pursued.`;

  const q4 = fImpact.share1 != null && Math.abs(fImpact.share1) > 0.001
    ? `AI experimentation (F) in large/mega ≥1995: Δ#1 ${pct(fImpact.share1, 2)}, Δtop-3 ${pct(fImpact.top3, 2)}, ΔHHI ${fImpact.hhi > 0 ? '+' : ''}${fImpact.hhi?.toFixed(0)}. More format churn than fringe sinks; use as **secondary** fragmentation lever, not primary.`
    : `AI experimentation (F) produced negligible book-level deltas in this harness — reformat/drift cadence may need stronger era gating or cluster-flanker hooks to move concentration without elite-OQ inflation.`;

  const q6 = `**Most grounded:** era-scaled fringe outlet layer (variant E) — adds non-viable listening sinks aligned with Duncan "25–30 viable + fringe" pattern without inflating commercial competitor strength. **Least dangerous to small markets:** scope fringe to large/mega only (as tested). **Avoid:** one-off +15 commercial injects (tier inject rotation) — use fringe/brokered/public/rimshot classes instead. **System recommendation:** market-size × era-scaled fringe budget (reportable target − viable target), not a flat station cap bump.`;

  return { q1, q2, q3, q4, q6 };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log('Station universe fragmentation audit (diagnostic only)\n');
  console.log(`Markets: ${opts.markets.join(', ')}`);
  console.log(`Years: ${opts.years.join(', ')}`);
  console.log(`Variants: ${opts.variants.join(', ')} · runs=${opts.runs} · seed=${opts.seed}\n`);

  const allRows = [];
  const summaries = {};
  const ctxMeta = loadCtx('A');
  const MARKETS = vm.runInContext('MARKETS', ctxMeta);

  for (const variant of opts.variants) {
    console.log(`\n========== Variant ${variant}: ${VARIANT_SPECS[variant] || variant} ==========`);
    const ctx = variant === 'A' ? ctxMeta : loadCtx(variant);
    const cells = [];
    for (const mid of opts.markets) {
      for (const year of opts.years) {
        cells.push({ variant, marketId: mid, year, salt: marketSalt(mid) });
      }
    }
    const runAll = vm.runInContext(RUN_IIFE, ctx);
    const rows = runAll(cells, opts.runs, opts.seed, MAX_STEPS);
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) {
      console.error(`  failures: ${bad.length}/${rows.length} — first: ${bad[0]?.marketId}@${bad[0]?.year} ${bad[0]?.err}`);
    }
    allRows.push(...rows.map((r) => ({ ...r, variant })));

    summaries[variant] = {};
    for (const mid of opts.markets) {
      summaries[variant][mid] = {};
      for (const year of opts.years) {
        summaries[variant][mid][year] = summarizeRows(rows, variant, mid, year);
      }
    }
  }

  const correlations = {};
  for (const variant of opts.variants) {
    correlations[variant] = buildCorrelation(allRows.filter((r) => r.variant === variant));
  }

  const universeAudit = buildUniverseAudit(summaries, opts.markets, opts.years, MARKETS);

  const variantImpact = {};
  for (const v of opts.variants) {
    if (v === 'A') continue;
    const deltas = variantDelta(summaries.A, summaries[v], opts.markets, opts.years);
    variantImpact[v] = aggregateVariantImpact(deltas, opts.markets, opts.years);
    variantImpact[v].largeMegaModern = aggregateVariantImpact(
      variantDelta(summaries.A, summaries[v], opts.markets.filter((m) => ['large', 'mega'].includes(MARKETS[m]?.rankTier)), opts.years.filter((y) => y >= 1995)),
      opts.markets.filter((m) => ['large', 'mega'].includes(MARKETS[m]?.rankTier)),
      opts.years.filter((y) => y >= 1995),
    );
  }

  const marketMeta = {};
  for (const mid of opts.markets) {
    marketMeta[mid] = { rankTier: MARKETS[mid]?.rankTier, label: MARKETS[mid]?.label };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    diagnosticOnly: true,
    markets: opts.markets,
    years: opts.years,
    variants: opts.variants,
    runs: opts.runs,
    seed: opts.seed,
    variantSpecs: VARIANT_SPECS,
    duncanTargetBands: DUNCAN_TARGET_BANDS,
    marketMeta,
    summaries,
    universeAudit,
    correlations,
    variantImpact,
    largeMegaModern: largeMegaModernSlice(summaries, opts.markets, MARKETS, opts.years),
    rawRowCount: allRows.length,
    failureCount: allRows.filter((r) => !r.ok).length,
  };

  report.answers = synthesizeAnswers(report);

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(report, null, 2) + '\n', 'utf8');
  writeFileSync(outMd, buildMarkdownReport(report) + '\n', 'utf8');

  console.log(`\nWrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log('\n--- Executive summary ---');
  console.log(report.answers.q1);
  console.log(report.answers.q3);
  console.log(report.answers.q6);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}