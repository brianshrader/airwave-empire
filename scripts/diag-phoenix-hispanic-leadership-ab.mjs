#!/usr/bin/env node
/**
 * Phoenix Hispanic leadership correction — C-based variants (in-vm only).
 *
 *   node scripts/diag-phoenix-hispanic-leadership-ab.mjs
 *
 * C0 Variant C baseline | C1 C+CR leader cap | C2 C+Spanish leadership boost
 * C3 C+earlier 2nd Spanish FM | C4 C1+C2
 *
 * Controls: atlanta, nashville (miami not in MARKETS).
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

const VARIANTS = ['C0', 'C1', 'C2', 'C3', 'C4'];
const REPORT_YEARS = [1995, 2026];
const TARGET_MARKET = 'phoenix';
const CONTROL_MARKETS = ['atlanta', 'nashville'];
const ALL_MARKETS = [TARGET_MARKET, ...CONTROL_MARKETS];
const RUNS = 8;
const SEED = 20260515;
const MAX_STEPS = 320;

const HIGH_HISPANIC_GATE = `/** High-Hispanic market gate (generalized): hispPop2020 ≥ 20% or culture.spanish ≥ 12%. */
function isHighHispanicMarket(marketId){
  const m=MARKETS[marketId||'']||{};
  const h=m.hispPop2020??0;
  const span=(m.culture&&m.culture.spanish)??0;
  return h>=0.20||span>=0.12;
}
function isHighHispanicLaunchTier(marketId){
  const rt=(MARKETS[marketId||'']||{}).rankTier||'';
  return rt==='large'||rt==='mega';
}
const HIGH_HISPANIC_SECOND_SPANISH_LAUNCH={id:'_hisp_1996_fm',y:1996,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'strong'}};
`;

const SPANISH_LAUNCHS_ANCHOR =
  '/** Optional MARKETS[id].spanishLaunches — scheduled FM/AM Spanish entrants (diag / high-Hispanic markets). */';

const SPANISH_LAUNCHES_FN_BASE = `function marketSpanishLaunchesDefs(marketId){
  const m=MARKETS[marketId||'']||null;
  if(!m||!Array.isArray(m.spanishLaunches)||!m.spanishLaunches.length)return [];
  return m.spanishLaunches.map(ent=>({
    ...ent,
    bp:ent.bp?{...ent.bp}:null,
  }));
}`;

const SPANISH_LAUNCHES_FN_C3 = `function marketSpanishLaunchesDefs(marketId){
  const m=MARKETS[marketId||'']||null;
  if(!m||!Array.isArray(m.spanishLaunches)||!m.spanishLaunches.length)return [];
  let defs=m.spanishLaunches.map(ent=>({
    ...ent,
    bp:ent.bp?{...ent.bp}:null,
  }));
  if(isHighHispanicMarket(marketId)&&isHighHispanicLaunchTier(marketId)){
    const has1996=defs.some(d=>d.y===1996&&d.bp&&d.bp.fmt==='SPANISH');
    if(!has1996){
      defs.push({
        ...HIGH_HISPANIC_SECOND_SPANISH_LAUNCH,
        id:marketId+HIGH_HISPANIC_SECOND_SPANISH_LAUNCH.id,
        bp:{...HIGH_HISPANIC_SECOND_SPANISH_LAUNCH.bp},
      });
    }
    defs=defs.map(d=>{
      if(!d.bp||d.bp.fmt!=='SPANISH')return d;
      const bp={...d.bp};
      if(bp.str==='emerging')bp.str='moderate';
      return {...d,bp};
    });
    defs.sort((a,b)=>a.y-b.y||(a.p-b.p));
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

const APPL_FM_LEADER_TRIM = `  let fmLeaderAppealTrim=1;
  if(s.sig.type==='FM'&&!stationIsNoncommercialInstitutional(s)&&year>=1978&&year<=1982&&
    !['NEWS_TALK','SPORTS_TALK','PERSONALITY_TALK','ALL_NEWS'].includes(s.format)){
    const sh=s.rat?.share??0;
    if(sh>=0.075)fmLeaderAppealTrim=1-_smoothstep(0.075,0.148,sh)*0.05;
  }`;

const APPL_FM_LEADER_TRIM_C2 = `  let fmLeaderAppealTrim=1;
  if(s.sig.type==='FM'&&!stationIsNoncommercialInstitutional(s)&&year>=1978&&year<=1982&&
    !['NEWS_TALK','SPORTS_TALK','PERSONALITY_TALK','ALL_NEWS'].includes(s.format)){
    const sh=s.rat?.share??0;
    if(sh>=0.075)fmLeaderAppealTrim=1-_smoothstep(0.075,0.148,sh)*0.05;
  }
  if(s.format==='SPANISH'&&isHighHispanicMarket(marketId)&&year>=1990){
    const sh=s.rat?.share??0;
    if(sh>=0.045&&sh<0.14)fmLeaderAppealTrim*=1+_smoothstep(0.045,0.11,sh)*0.08;
    if(sh>=0.08)fmLeaderAppealTrim*=1.04;
  }`;

const TOP40_TRIM_CALL = `    applyModernTop40LeaderPeakabilityTrim(stations,G,activeIx,engageWeightedPop,postAqhDenom);
    applyListeningHoursShareFromAqh(stations,G);`;

const TOP40_TRIM_CALL_C1 = `    applyModernTop40LeaderPeakabilityTrim(stations,G,activeIx,engageWeightedPop,postAqhDenom);
    applyHighHispanicClassicRockLeaderCap(stations,G,activeIx,engageWeightedPop,postAqhDenom);
    applyListeningHoursShareFromAqh(stations,G);`;

const TOP40_TRIM_CALL_C2 = `    applyModernTop40LeaderPeakabilityTrim(stations,G,activeIx,engageWeightedPop,postAqhDenom);
    applyHighHispanicSpanishLeaderBoost(stations,G,activeIx,engageWeightedPop,postAqhDenom);
    applyListeningHoursShareFromAqh(stations,G);`;

const TOP40_TRIM_CALL_C4 = `    applyModernTop40LeaderPeakabilityTrim(stations,G,activeIx,engageWeightedPop,postAqhDenom);
    applyHighHispanicClassicRockLeaderCap(stations,G,activeIx,engageWeightedPop,postAqhDenom);
    applyHighHispanicSpanishLeaderBoost(stations,G,activeIx,engageWeightedPop,postAqhDenom);
    applyListeningHoursShareFromAqh(stations,G);`;

const HIGH_HISPANIC_LEADER_HELPERS = `
/** Post-AQH: cap single CLASSIC_ROCK leader in high-Hispanic markets (leader-only trim). */
function applyHighHispanicClassicRockLeaderCap(stations,G,activeIx,engageWeightedPop,habitDenom){
  const mid=G.marketId||ACTIVE_MARKET;
  if(!isHighHispanicMarket(mid))return;
  const y=Math.round(Number(G?.year))||1970;
  if(y<1985)return;
  const comm=[];
  for(let k=0;k<activeIx.length;k++){
    const s=stations[activeIx[k]];
    if(s&&!stationIsNoncommercialInstitutional(s))comm.push(s);
  }
  if(comm.length<3)return;
  let leader=null,leaderSh=0;
  for(let i=0;i<comm.length;i++){
    const sh=Number(comm[i].rat?.share)||0;
    if(sh>leaderSh){leaderSh=sh;leader=comm[i];}
  }
  if(!leader||leader.format!=='CLASSIC_ROCK')return;
  const leaderCap=y>=2020?0.105:y>=2000?0.115:y>=1990?0.13:0.14;
  const trimActivate=leaderCap+0.012;
  if(leaderSh<=trimActivate)return;
  const excess=leaderSh-trimActivate;
  const trimCurve=_clamp01(excess/Math.max(0.02,0.5*leaderSh));
  const maxTrim=0.07+0.05*_smoothstep(1990,2010,y);
  const leaderMult=1-maxTrim*trimCurve;
  if(leaderMult>=0.996)return;
  let newLeaderSh=Math.max(leaderCap*1.01,leaderSh*leaderMult);
  const actualTrim=leaderSh-newLeaderSh;
  if(actualTrim<1e-6)return;
  scaleStationListeningShares(leader,G,leader,newLeaderSh/Math.max(1e-9,leaderSh),engageWeightedPop,habitDenom);
  const others=comm.filter(s=>s.id!==leader.id);
  const spanRecipients=others.filter(s=>s.format==='SPANISH');
  const pool=spanRecipients.length?spanRecipients:others.filter(s=>s.format!=='CLASSIC_ROCK');
  const usePool=pool.length?pool:others;
  let poolSum=0;
  for(let i=0;i<usePool.length;i++)poolSum+=Number(usePool[i].rat?.share)||0;
  if(poolSum<1e-9)return;
  for(let i=0;i<usePool.length;i++){
    const s=usePool[i];
    const sh=Number(s.rat?.share)||0;
    const add=actualTrim*0.78*(sh/poolSum);
    scaleStationListeningShares(s,G,s,(sh+add)/Math.max(1e-9,sh),engageWeightedPop,habitDenom);
  }
}
/** Post-AQH: nudge top Spanish station toward #1 when close behind CR leader (high-Hispanic). */
function applyHighHispanicSpanishLeaderBoost(stations,G,activeIx,engageWeightedPop,habitDenom){
  const mid=G.marketId||ACTIVE_MARKET;
  if(!isHighHispanicMarket(mid))return;
  const y=Math.round(Number(G?.year))||1970;
  if(y<1992)return;
  const comm=[];
  for(let k=0;k<activeIx.length;k++){
    const s=stations[activeIx[k]];
    if(s&&!stationIsNoncommercialInstitutional(s))comm.push(s);
  }
  if(comm.length<2)return;
  let bookLeader=null,bookLeaderSh=0;
  let topSpan=null,topSpanSh=0;
  for(let i=0;i<comm.length;i++){
    const s=comm[i];
    const sh=Number(s.rat?.share)||0;
    if(sh>bookLeaderSh){bookLeaderSh=sh;bookLeader=s;}
    if(s.format==='SPANISH'&&sh>topSpanSh){topSpanSh=sh;topSpan=s;}
  }
  if(!topSpan||topSpanSh<0.04)return;
  if(bookLeader&&bookLeader.format==='SPANISH')return;
  if(bookLeader&&bookLeader.format!=='CLASSIC_ROCK'&&bookLeader.format!=='ALBUM_ROCK')return;
  const gap=bookLeaderSh-topSpanSh;
  if(gap<0||gap>0.045)return;
  const boost=Math.min(0.028,gap*0.55+0.008);
  const newSpan=topSpanSh+boost;
  scaleStationListeningShares(topSpan,G,topSpan,newSpan/Math.max(1e-9,topSpanSh),engageWeightedPop,habitDenom);
  if(bookLeader&&bookLeaderSh>newSpan){
    const trim=boost*0.92;
    scaleStationListeningShares(bookLeader,G,bookLeader,(bookLeaderSh-trim)/Math.max(1e-9,bookLeaderSh),engageWeightedPop,habitDenom);
  }
}
`;

const TOP40_TRIM_FN_END =
  '/** Phase 3B-a: TOP40 appeal trim toward trait-era CHR bucket setpoint (1995+). Returns 1 when IIFE missing. */';

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

function ensureCBase(out) {
  if (!out.includes('function isHighHispanicMarket(')) {
    out = out.replace(SPANISH_LAUNCHS_ANCHOR, `${HIGH_HISPANIC_GATE}${SPANISH_LAUNCHS_ANCHOR}`);
  }
  if (out.includes(MKTFMT_SPANISH_BLOCK) && !out.includes('hisp01=Math.min(1,h2020/0.45)')) {
    out = out.replace(MKTFMT_SPANISH_BLOCK, MKTFMT_SPANISH_BLOCK_C);
  }
  return out;
}

function ensureLeaderHelpers(out) {
  if (out.includes('function applyHighHispanicClassicRockLeaderCap(')) return out;
  return out.replace(TOP40_TRIM_FN_END, `${HIGH_HISPANIC_LEADER_HELPERS}${TOP40_TRIM_FN_END}`);
}

function patchLegacyForVariant(src, variant) {
  let out = injectHeadlessLaunchNewsGuard(src);
  out = ensureCBase(out);

  const useC1 = variant === 'C1' || variant === 'C4';
  const useC2 = variant === 'C2' || variant === 'C4';
  const useC3 = variant === 'C3';

  if (useC1 || useC2) out = ensureLeaderHelpers(out);

  if (useC3 && out.includes(SPANISH_LAUNCHES_FN_BASE)) {
    out = out.replace(SPANISH_LAUNCHES_FN_BASE, SPANISH_LAUNCHES_FN_C3);
  }

  if (useC2 && out.includes(APPL_FM_LEADER_TRIM)) {
    out = out.replace(APPL_FM_LEADER_TRIM, APPL_FM_LEADER_TRIM_C2);
  }

  if (out.includes(TOP40_TRIM_CALL)) {
    if (variant === 'C4') out = out.replace(TOP40_TRIM_CALL, TOP40_TRIM_CALL_C4);
    else if (variant === 'C1') out = out.replace(TOP40_TRIM_CALL, TOP40_TRIM_CALL_C1);
    else if (variant === 'C2') out = out.replace(TOP40_TRIM_CALL, TOP40_TRIM_CALL_C2);
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
  const set = new Set(fmts);
  const parts = (histStr || '').split('|').filter(Boolean);
  if (!parts.length) return 0;
  let wins = 0;
  let total = 0;
  for (const p of parts) {
    const [fmt, n] = p.split(':');
    const c = parseInt(n, 10) || 0;
    total += c;
    if (set.has(fmt)) wins += c;
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
      return {ok:true, bookShares:shares, leaderFmt:book[0]?fmtKey(book[0].format):'', hhi:hhi*10000};
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
        out.push({variant:c.variant, marketId:c.marketId, year:c.year, run:run, ok:r.ok, err:r.err||'', bookShares:r.bookShares, leaderFmt:r.leaderFmt, hhi:r.hhi});
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
  const meanBuckets = (key) => mean(bucketRuns.map((b) => b[key] ?? 0));
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
    spanishPct: meanBuckets('SPANISH') * 100,
    chrPct: meanBuckets('TOP40_CHR') * 100,
    countryPct: meanBuckets('COUNTRY') * 100,
    rockPct: meanBuckets('ROCK_ALT_AAA') * 100,
    hhi: mean(list.map((r) => r.hhi)),
    histStr,
    spanishNum1: leaderWins(histStr, ['SPANISH']),
    classicRockNum1: leaderWins(histStr, ['CLASSIC_ROCK']),
    rockNum1: leaderWins(histStr, ['CLASSIC_ROCK', 'ALBUM_ROCK', 'ALT_ROCK']),
  };
}

function variantSpec(v) {
  return (
    {
      C0: 'Variant C: isHighHispanicMarket SPANISH mktFmt demographic boost',
      C1: 'C0 + post-AQH CLASSIC_ROCK leader cap (high-Hispanic only)',
      C2: 'C0 + appl Spanish fmLeaderAppealTrim + post-AQH Spanish leader nudge',
      C3: 'C0 + generalized 1996 strong 2nd Spanish FM (large/mega tier)',
      C4: 'C1 + C2 combined',
    }[v] || v
  );
}

function main() {
  console.log('Phoenix Hispanic leadership correction (C-based, in-vm only)\n');
  console.log('Note: miami not in MARKETS — controls are atlanta, nashville only.\n');

  const results = {};
  for (const variant of VARIANTS) {
    console.log(`\n========== ${variant}: ${variantSpec(variant)} ==========\n`);
    const ctx = loadCtx(variant);
    const cells = [];
    for (const year of REPORT_YEARS) {
      for (const mid of ALL_MARKETS) {
        cells.push({ variant, marketId: mid, year, genMode: genModeForYear(year), salt: marketSalt(mid) });
      }
    }
    const rows = vm.runInContext(RUN_IIFE, ctx)(cells, RUNS, SEED, MAX_STEPS);
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) console.error(`  failures: ${bad.length}`);

    results[variant] = {};
    for (const year of REPORT_YEARS) {
      results[variant][year] = { phoenix: summarize(rows, variant, TARGET_MARKET, year) };
      for (const mid of CONTROL_MARKETS) {
        results[variant][year][mid] = summarize(rows, variant, mid, year);
      }
    }

    for (const year of REPORT_YEARS) {
      const p = results[variant][year].phoenix;
      console.log(
        `@${year}  Span=${p.spanishPct.toFixed(1)}%  Span#1=${(p.spanishNum1 * 100).toFixed(0)}%  CR#1=${(p.classicRockNum1 * 100).toFixed(0)}%  Rock=${p.rockPct.toFixed(1)}%  Ctry=${p.countryPct.toFixed(1)}%  CHR=${p.chrPct.toFixed(1)}%  HHI=${p.hhi.toFixed(0)}  #1=${p.histStr}`,
      );
    }
  }

  console.log('\n========== Phoenix comparison table ==========\n');
  console.log('Var\tYear\tSpan%\tSpan#1\tCR#1\tRock%\tCtry%\tCHR%\tHHI\t#1');
  for (const variant of VARIANTS) {
    for (const year of REPORT_YEARS) {
      const p = results[variant][year].phoenix;
      console.log(
        [
          variant,
          year,
          p.spanishPct.toFixed(1),
          `${(p.spanishNum1 * 100).toFixed(0)}%`,
          `${(p.classicRockNum1 * 100).toFixed(0)}%`,
          p.rockPct.toFixed(1),
          p.countryPct.toFixed(1),
          p.chrPct.toFixed(1),
          p.hhi.toFixed(0),
          p.histStr,
        ].join('\t'),
      );
    }
  }

  console.log('\n========== Control bleed @2026 ==========\n');
  for (const mid of CONTROL_MARKETS) {
    console.log(`--- ${mid} ---`);
    for (const variant of VARIANTS) {
      const c = results[variant][2026][mid];
      console.log([variant, c.spanishPct.toFixed(1), c.histStr].join('\t'));
    }
  }

  const stable = CONTROL_MARKETS.every((mid) => {
    const a = results.C0[2026][mid].histStr;
    return VARIANTS.every((v) => results[v][2026][mid].histStr === a);
  });
  console.log(`\nControl #1 stable across C0–C4: ${stable ? 'YES' : 'NO'}`);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const outPath = path.join(root, 'tmp', 'phoenix_hispanic_leadership_ab.json');
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runs: RUNS,
        seed: SEED,
        miamiAvailable: false,
        variantSpec: Object.fromEntries(VARIANTS.map((v) => [v, variantSpec(v)])),
        results,
        controlsStable: stable,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nWrote ${outPath}`);
}

main();
