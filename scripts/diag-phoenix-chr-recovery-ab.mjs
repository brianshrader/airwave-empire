#!/usr/bin/env node
/**
 * Phoenix later-era CHR recovery A/B — in-vm patches only (diagnostic).
 *
 *   npm run diag:phoenix-chr-recovery-ab
 *   node scripts/diag-phoenix-chr-recovery-ab.mjs --opening-runs=100 --sim-runs=25 --trace
 *
 * Artifact: tmp/phoenix_chr_recovery_ab.json
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { LEADERSHIP_BUCKET_KEYS } from './expectedFormatLeadershipProfile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'phoenix_chr_recovery_ab.json');

const VARIANTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const PHOENIX = 'phoenix';
const SEED = 20260524;
const SIM_YEARS = [1985, 1995, 2005, 2026];
const HITS_FMTS = new Set(['TOP40', 'CHR', 'HOT_AC', 'RHYTHMIC']);

const MAX_STEPS_BY_YEAR = {
  1975: 340,
  1985: 260,
  1995: 320,
  2005: 320,
  2026: 320,
};

const TIER_INJECT_ANCHOR =
  'if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt))continue;';

const TIER_INJECT_B =
  'if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt)&&cand.fmt!==\'TOP40\')continue;';

const TIER_INJECT_C =
  'if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt)&&cand.fmt!==\'HOT_AC\')continue;';

const PHOENIX_FRAG_ANCHOR = `    fragmentationLaunches:[
      {id:'phoenix_frag_cr_1986',y:1986,p:1,bp:{type:'FM',fmt:'CLASSIC_ROCK',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_ac_1988',y:1988,p:2,bp:{type:'FM',fmt:'ADULT_CONTEMP',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_spanish_1991',y:1991,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_oldies_1993',y:1993,p:2,bp:{type:'FM',fmt:'OLDIES',pw:'50kw',str:'moderate'}},
    ],`;

const PHOENIX_FRAG_D = `    fragmentationLaunches:[
      {id:'phoenix_frag_cr_1986',y:1986,p:1,bp:{type:'FM',fmt:'CLASSIC_ROCK',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_ac_1988',y:1988,p:2,bp:{type:'FM',fmt:'ADULT_CONTEMP',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_top40_1992',y:1992,p:2,bp:{type:'FM',fmt:'TOP40',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_spanish_1991',y:1991,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_oldies_1993',y:1993,p:2,bp:{type:'FM',fmt:'OLDIES',pw:'50kw',str:'moderate'}},
    ],`;

const APPEAL_MULT_ANCHOR = `function phoenixDiagTop40HitsAppealMult(marketId,year){
  if(!isPhoenixDiagMarket(marketId)||!phoenixDiagMid90sEra(year))return 1;
  return 1-_smoothstep(1990,1996,Math.round(Number(year))||1970)*0.18;
}`;

const APPEAL_MULT_OFF = `function phoenixDiagTop40HitsAppealMult(marketId,year){
  return 1;
}`;

const LEADER_TRIM_ANCHOR = `function phoenixDiagTop40LeaderTrimProfile(marketId,year){
  if(!isPhoenixDiagMarket(marketId)||!phoenixDiagMid90sEra(year)){
    return {active:false,bypassTraitGate:false,eraGate:0,maxTrimCap:0.11,extraTrimTerm:0};
  }
  const y=Math.round(Number(year))||1970;
  const eraGate=_smoothstep(1990,1996,y);
  return {active:true,bypassTraitGate:true,eraGate,maxTrimCap:0.17,extraTrimTerm:0.028*eraGate};
}`;

const LEADER_TRIM_OFF = `function phoenixDiagTop40LeaderTrimProfile(marketId,year){
  if(!isPhoenixDiagMarket(marketId)||!phoenixDiagMid90sEra(year)){
    return {active:false,bypassTraitGate:false,eraGate:0,maxTrimCap:0.11,extraTrimTerm:0};
  }
  return {active:false,bypassTraitGate:false,eraGate:0,maxTrimCap:0.11,extraTrimTerm:0};
}`;

const HITS_LINEAGE_ANCHOR =
  'hitsLineageEraMult=broadTight*fmYouth*phoenixDiagTop40HitsAppealMult(marketId,year);';

const HITS_LINEAGE_E = `hitsLineageEraMult=broadTight*fmYouth*phoenixDiagTop40HitsAppealMult(marketId,year);
    if(isPhoenixDiagMarket(marketId)&&s.sig?.type==='FM'&&year>=1985&&isHitsFormatLineage(s.format)){
      hitsLineageEraMult*=0.95/0.84;
    }`;

const VARIANT_DESC = {
  A: 'Shipped baseline (BP 0/4 Top40 + mid-90s CHR suppression)',
  B: 'Allow TOP40 tier inject at gen (HOT_AC still blocked)',
  C: 'Allow HOT_AC tier inject at gen (TOP40 still blocked)',
  D: 'Add FM TOP40 fragmentation launch @1992',
  E: 'Runtime FM hits boost ×0.95/0.84 after 1985 + disable mid-90s appeal taper',
  F: 'D + B + appeal taper off + leader trim off (combined)',
  G: 'D + appeal taper off + leader trim off (no tier-inject change)',
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

function patchLegacyForVariant(src, variant) {
  let out = injectHeadlessLaunchNewsGuard(src);
  const useB = variant === 'B' || variant === 'F';
  const useC = variant === 'C';
  const useD = variant === 'D' || variant === 'F';
  const useE = variant === 'E' || variant === 'F';
  const useAppealOff = variant === 'E' || variant === 'F';
  const useTrimOff = variant === 'F';

  if (useB && out.includes(TIER_INJECT_ANCHOR)) {
    out = out.replace(TIER_INJECT_ANCHOR, TIER_INJECT_B);
  }
  if (useC && out.includes(TIER_INJECT_ANCHOR)) {
    out = out.replace(TIER_INJECT_ANCHOR, TIER_INJECT_C);
  }
  if (useD && out.includes(PHOENIX_FRAG_ANCHOR)) {
    out = out.replace(PHOENIX_FRAG_ANCHOR, PHOENIX_FRAG_D);
  }
  if (useAppealOff && out.includes(APPEAL_MULT_ANCHOR)) {
    out = out.replace(APPEAL_MULT_ANCHOR, APPEAL_MULT_OFF);
  }
  if (useTrimOff && out.includes(LEADER_TRIM_ANCHOR)) {
    out = out.replace(LEADER_TRIM_ANCHOR, LEADER_TRIM_OFF);
  }
  if (useE && out.includes(HITS_LINEAGE_ANCHOR)) {
    out = out.replace(HITS_LINEAGE_ANCHOR, HITS_LINEAGE_E);
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
  const raw = readFileSync(legacyPath, 'utf8');
  const src = variant === 'G' ? patchLegacyVariantG(raw) : patchLegacyForVariant(raw, variant);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const idx = (s.length - 1) * 0.5;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function openingPass(stats) {
  return (
    stats.hitsPresenceRate >= 0.7 &&
    stats.morShareMedian <= 0.35 &&
    stats.hitLeaderRunnerUpRate >= 0.4
  );
}

function chrBandOk(year, chrShare) {
  if (year === 1995) return chrShare >= 0.06 && chrShare <= 0.14;
  if (year === 2005) return chrShare >= 0.06 && chrShare <= 0.14;
  if (year === 2026) return chrShare >= 0.05 && chrShare <= 0.12;
  return true;
}

function scoreVariant(opening, byYear, controls) {
  let score = 0;
  if (openingPass(opening)) score += 50;
  else return score;
  for (const y of [1995, 2005, 2026]) {
    const chr = byYear[y]?.chrBucket ?? 0;
    if (chrBandOk(y, chr)) score += 15;
    else if (chr >= 0.04) score += 5;
  }
  const y26 = byYear[2026];
  if (y26) {
    if (y26.spanishShare >= 0.18 && y26.spanishShare <= 0.28) score += 12;
    else if (y26.spanishShare >= 0.16) score += 4;
    if (y26.rockShare <= 0.18) score += 8;
    else if (y26.rockShare <= 0.22) score += 3;
    if (y26.crLeaderRate === 0) score += 8;
    if (y26.chrBucket < 0.22) score += 5;
  }
  if (controls.la1970?.hitsPresenceRate >= 0.95) score += 5;
  const patchWeight = { A: 0, B: 1, C: 1, D: 2, E: 3, F: 5 };
  return score - (patchWeight[opening.variant] ?? 0);
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isHitsFmt(fmt){ var f=fmtKey(fmt); return f==='TOP40'||f==='CHR'||f==='HOT_AC'||f==='RHYTHMIC'; }
  function sortBook(stations){
    var list=stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    return list;
  }
  function bucketForFmt(fk){
    if(fk==='TOP40'||fk==='CHR'||fk==='RHYTHMIC') return 'TOP40_CHR';
    if(fk==='HOT_AC'||fk==='ADULT_CONTEMP') return 'AC_HOT_AC';
    if(['CLASSIC_ROCK','ALBUM_ROCK','ALT_ROCK','AAA','CLASSIC_HITS','OLDIES'].indexOf(fk)>=0) return 'ROCK_ALT_AAA';
    if(fk==='COUNTRY') return 'COUNTRY';
    if(['NEWS_TALK','SPORTS_TALK','PERSONALITY_TALK','ALL_NEWS'].indexOf(fk)>=0) return 'NEWS_TALK_SPORTS';
    if(fk.indexOf('PUBLIC_')===0) return 'PUBLIC_RADIO';
    if(fk==='URBAN_CONTEMP'||fk==='SOUL_RNB') return 'URBAN_RHYTHMIC';
    if(fk==='SPANISH') return 'SPANISH';
    if(fk==='GOSPEL'||fk==='RELIGIOUS_NETWORK') return 'GOSPEL_CCM';
    return null;
  }
  function bucketsFromShares(shares){
    var b={TOP40_CHR:0,AC_HOT_AC:0,ROCK_ALT_AAA:0,COUNTRY:0,NEWS_TALK_SPORTS:0,PUBLIC_RADIO:0,URBAN_RHYTHMIC:0,SPANISH:0,GOSPEL_CCM:0};
    for(var k in (shares||{})){
      var bk=bucketForFmt(k);
      if(bk) b[bk]+=shares[k]||0;
    }
    return b;
  }
  function genForYear(targetYear){
    if(targetYear<=1975){
      var sc=SC.find(function(x){return x.id==='under';});
      var oi=sc.idx; sc.idx=[];
      G=genMarket('under');
      sc.idx=oi;
    } else {
      var sc2=SC.find(function(x){return x.id==='chrwar';});
      var oi2=sc2.idx; sc2.idx=[];
      G=genMarket('chrwar');
      sc2.idx=oi2;
    }
    G.stations.forEach(function(st){st.isPlayer=false;});
    G.ps=[];
  }
  function simToYear(marketId, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      genForYear(targetYear);
      var steps=0;
      while(steps<maxSteps){
        if(G.year===targetYear&&G.period===1)break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>1)) return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==1) return {ok:false,err:'miss'};
      var book=sortBook(G.stations);
      var shares={}, fmtCounts={};
      var hitsStations=0, top40Sh=0, chrSh=0, hotAcSh=0, bpHits=0, tierHits=0;
      for(var j=0;j<book.length;j++){
        var fk=fmtKey(book[j].format);
        var sh=book[j].rat.share||0;
        shares[fk]=(shares[fk]||0)+sh;
      }
      for(var k=0;k<G.stations.length;k++){
        var st=G.stations[k];
        if(!st||st._bpSlotDeferred) continue;
        var fk2=fmtKey(st.format);
        fmtCounts[fk2]=(fmtCounts[fk2]||0)+1;
        if(isHitsFmt(fk2)){
          hitsStations++;
          if(st.bpSlotIndex!=null&&st.bpSlotIndex>=0) bpHits++;
          else tierHits++;
        }
      }
      top40Sh=(shares.TOP40||0)+(shares.CHR||0);
      hotAcSh=shares.HOT_AC||0;
      chrSh=top40Sh+hotAcSh*0.35;
      var buckets=bucketsFromShares(shares);
      var lead=book[0]?fmtKey(book[0].format):'';
      var morShare=shares.MOR||0;
      return {
        ok:true,
        shares:shares,
        fmtCounts:fmtCounts,
        buckets:buckets,
        leaderFmt:lead,
        top40Share:shares.TOP40||0,
        chrFmtShare:shares.CHR||0,
        hotAcShare:hotAcSh,
        chrBucket:buckets.TOP40_CHR||0,
        acBucket:buckets.AC_HOT_AC||0,
        spanishShare:buckets.SPANISH||(shares.SPANISH||0),
        rockShare:(shares.CLASSIC_ROCK||0)+(shares.ALBUM_ROCK||0)+(shares.ALT_ROCK||0),
        countryShare:shares.COUNTRY||0,
        hitsStationCount:hitsStations,
        hitsBpSlots:bpHits,
        hitsNonBp:hitsStations-bpHits,
        hitsPresent:!!(shares.TOP40||shares.CHR||shares.HOT_AC),
        morShare:morShare,
        top2:(book[0]?book[0].rat.share:0)+(book[1]?book[1].rat.share:0),
        hitLeaderOrRunnerUp:lead==='TOP40'||lead==='CHR'||(book[1]&&['TOP40','CHR'].includes(fmtKey(book[1].format)))
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  function opening1970(marketId, seedVal){
    return simToYear(marketId, 1970, seedVal, 0);
  }
  function traceChr(marketId, year, seedVal, maxSteps){
    var r=simToYear(marketId, year, seedVal, maxSteps);
    if(!r.ok) return r;
    var stations=[];
    for(var i=0;i<G.stations.length;i++){
      var st=G.stations[i];
      if(!st||st._bpSlotDeferred) continue;
      var fk=fmtKey(st.format);
      if(!isHitsFmt(fk)&&fk!=='MOR') continue;
      stations.push({
        call:st.call||'',
        band:st.sig&&st.sig.type,
        fmt:fk,
        share:st.rat&&st.rat.share,
        bpSlot:st.bpSlotIndex,
        str:st.str,
        oq:st.oq
      });
    }
    stations.sort(function(a,b){return (b.share||0)-(a.share||0);});
    r.traceStations=stations.slice(0,12);
    return r;
  }
  return { opening1970: opening1970, simToYear: simToYear, traceChr: traceChr };
})();
`;

function summarizeSimRows(rows, year) {
  const ok = rows.filter((r) => r.ok);
  const buckets = {};
  for (const k of LEADERSHIP_BUCKET_KEYS) {
    buckets[k] = mean(ok.map((r) => r.buckets?.[k] ?? 0));
  }
  return {
    n: ok.length,
    chrBucket: buckets.TOP40_CHR ?? mean(ok.map((r) => r.chrBucket)),
    top40Share: mean(ok.map((r) => r.top40Share)),
    chrFmtShare: mean(ok.map((r) => r.chrFmtShare)),
    hotAcShare: mean(ok.map((r) => r.hotAcShare)),
    acBucket: buckets.AC_HOT_AC ?? 0,
    spanishShare: buckets.SPANISH ?? mean(ok.map((r) => r.spanishShare)),
    rockShare: mean(ok.map((r) => r.rockShare)),
    countryShare: mean(ok.map((r) => r.countryShare)),
    hitsStationCount: mean(ok.map((r) => r.hitsStationCount)),
    hitsBpSlots: mean(ok.map((r) => r.hitsBpSlots)),
    hitsNonBp: mean(ok.map((r) => r.hitsNonBp)),
    crLeaderRate: ok.filter((r) => r.leaderFmt === 'CLASSIC_ROCK').length / Math.max(1, ok.length),
    leaderHist: ok.reduce((h, r) => {
      const k = r.leaderFmt || '?';
      h[k] = (h[k] || 0) + 1;
      return h;
    }, {}),
  };
}

function summarizeOpening(rows) {
  const ok = rows.filter((r) => r.ok);
  return {
    n: ok.length,
    hitsPresenceRate: ok.filter((r) => r.hitsPresent).length / Math.max(1, ok.length),
    morShareMedian: median(ok.map((r) => r.morShare)),
    top2Median: median(ok.map((r) => r.top2)),
    hitLeaderRunnerUpRate: ok.filter((r) => r.hitLeaderOrRunnerUp).length / Math.max(1, ok.length),
    top40Share: mean(ok.map((r) => r.top40Share)),
    hitsStationCount: mean(ok.map((r) => r.hitsStationCount)),
    leaderHist: ok.reduce((h, r) => {
      const k = r.leaderFmt || '?';
      h[k] = (h[k] || 0) + 1;
      return h;
    }, {}),
  };
}

function parseArgs(argv) {
  const o = { openingRuns: 100, simRuns: 25, trace: false, seed: SEED };
  for (const a of argv) {
    if (a.startsWith('--opening-runs=')) o.openingRuns = Math.max(1, parseInt(a.slice(15), 10) || 100);
    else if (a.startsWith('--sim-runs=')) o.simRuns = Math.max(1, parseInt(a.slice(11), 10) || 25);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || SEED;
    else if (a === '--trace') o.trace = true;
  }
  return o;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const results = { variants: {}, trace: null, rootCause: null, seed: opts.seed };

  console.log('Phoenix later-era CHR recovery A/B (in-vm)\n');

  for (const variant of VARIANTS) {
    const ctx = loadCtx(variant);
    const api = vm.runInContext(RUN_IIFE, ctx);
    const origR = Math.random;

    const openingRows = [];
    for (let run = 0; run < opts.openingRuns; run++) {
      const s0 = opts.seed + marketSalt(PHOENIX) * 17 + 1970 * 10007 + run * 9973 + variant.charCodeAt(0) * 131;
      let r;
      try {
        r = api.opening1970(PHOENIX, s0);
      } catch (e) {
        r = { ok: false, err: String(e?.message || e) };
      } finally {
        Math.random = origR;
      }
      openingRows.push(r);
    }
    const opening = summarizeOpening(openingRows);
    opening.variant = variant;
    opening.pass = openingPass(opening);

    const byYear = {};
    for (const year of SIM_YEARS) {
      const simRows = [];
      const maxSteps = MAX_STEPS_BY_YEAR[year] ?? 320;
      for (let run = 0; run < opts.simRuns; run++) {
        const s0 = opts.seed + marketSalt(PHOENIX) * 17 + year * 10007 + run * 9973 + variant.charCodeAt(0) * 131;
        let r;
        try {
          r = api.simToYear(PHOENIX, year, s0, maxSteps);
        } catch (e) {
          r = { ok: false, err: String(e?.message || e) };
        } finally {
          Math.random = origR;
        }
        simRows.push(r);
      }
      byYear[year] = summarizeSimRows(simRows, year);
    }

    if (variant === 'A' && opts.trace) {
      const trace = {};
      for (const year of [1985, 1995, 2005, 2026]) {
        trace[year] = api.traceChr(PHOENIX, year, opts.seed + year * 1000, MAX_STEPS_BY_YEAR[year] ?? 320);
      }
      results.trace = trace;
    }

    const laRows = [];
    const nashRows = [];
    for (let run = 0; run < Math.min(50, opts.openingRuns); run++) {
      const sLa = opts.seed + marketSalt('losangeles') * 17 + 1970 * 10007 + run * 9973;
      const sNa = opts.seed + marketSalt('nashville') * 17 + 1985 * 10007 + run * 9973;
      try {
        laRows.push(api.opening1970('losangeles', sLa));
        nashRows.push(api.simToYear('nashville', 1985, sNa, MAX_STEPS_BY_YEAR[1985]));
      } catch (_e) {
        /* ignore */
      } finally {
        Math.random = origR;
      }
    }

    results.variants[variant] = {
      description: VARIANT_DESC[variant],
      opening,
      byYear,
      controls: {
        la1970: {
          hitsPresenceRate:
            laRows.filter((r) => r.ok && r.hitsPresent).length / Math.max(1, laRows.filter((r) => r.ok).length),
        },
        nashville1985: {
          leaderFmt: nashRows.filter((r) => r.ok)[0]?.leaderFmt,
          chrBucket: mean(nashRows.filter((r) => r.ok).map((r) => r.chrBucket)),
        },
      },
    };

    console.log(
      `[${variant}] ${VARIANT_DESC[variant]}\n` +
        `  1970 PASS? ${opening.pass ? 'yes' : 'NO'} | hits=${pct(opening.hitsPresenceRate)} MOR=${pct(opening.morShareMedian)} hit#1/2=${pct(opening.hitLeaderRunnerUpRate)}\n` +
        `  CHR bucket: 1985=${pct(byYear[1985].chrBucket)} 1995=${pct(byYear[1995].chrBucket)} 2005=${pct(byYear[2005].chrBucket)} 2026=${pct(byYear[2026].chrBucket)}\n` +
        `  hits stations @2026: ${byYear[2026].hitsStationCount?.toFixed(1)} (bp=${byYear[2026].hitsBpSlots?.toFixed(1)} other=${byYear[2026].hitsNonBp?.toFixed(1)})\n` +
        `  2026 span=${pct(byYear[2026].spanishShare)} rock=${pct(byYear[2026].rockShare)} CR#1=${pct(byYear[2026].crLeaderRate)}\n`,
    );
  }

  results.simPathNote =
    '1985+ uses genMarket(chrwar) + advTurn (matches diag-phoenix-internal-playtest / certification). 1970 opening uses genMarket(under) only.';

  results.rootCause = {
    summary:
      'Under chrwar path: few hits stations (~2.6) survive to 2026; tier inject blocks TOP40/HOT_AC at chrwar gen; fragmentation has no hits FM until 1992 (variant D); phoenixDiagTop40HitsAppealMult (−18% appeal 1990–99) and leader trim suppress mid-90s CHR; BP slot 0 TOP40 anchors 1970 under only.',
    mechanisms: [
      'MARKET_BP_PATCH slot 0 = AM TOP40 (1970 fix) — often only hits station early',
      'phoenixDiagTierInjectFormatBlocked: TOP40, HOT_AC, RHYTHMIC, URBAN_CONTEMP',
      'fragmentationLaunches: no TOP40/HOT_AC until variant D',
      'phoenixDiagTop40HitsAppealMult + phoenixDiagTop40LeaderTrimProfile (1990–1999)',
      'phoenixDiagOpeningOqMult FM hits ×0.84 at gen (persistent oq, not year-gated)',
    ],
  };

  let best = null;
  let bestScore = -1;
  for (const v of VARIANTS) {
    const o = results.variants[v];
    const sc = scoreVariant(o.opening, o.byYear, o.controls);
    o.score = sc;
    if (!o.opening.pass) continue;
    if (sc > bestScore) {
      bestScore = sc;
      best = v;
    }
  }
  if (!best) best = 'D';

  const rec = results.variants[best];
  const ship =
    rec?.opening.pass &&
    chrBandOk(1995, rec.byYear[1995].chrBucket) &&
    chrBandOk(2026, rec.byYear[2026].chrBucket) &&
    rec.byYear[2026].spanishShare >= 0.18 &&
    rec.byYear[2026].spanishShare <= 0.28 &&
    rec.byYear[2026].crLeaderRate === 0;

  results.recommendation = {
    variant: best,
    description: VARIANT_DESC[best],
    shipReady: ship,
    productionPatch: describeProductionPatch(best),
  };

  console.log('\n── A/B table ──');
  console.log('Var | 1970 | 1995 CHR | 2005 CHR | 2026 CHR | 2026 Span | 2026 Rock | hits stn');
  for (const v of VARIANTS) {
    const o = results.variants[v];
    const y = o.byYear;
    console.log(
      `${v}   | ${o.opening.pass ? 'PASS' : 'FAIL'} | ${pct(y[1995].chrBucket).padStart(7)} | ${pct(y[2005].chrBucket).padStart(7)} | ${pct(y[2026].chrBucket).padStart(7)} | ${pct(y[2026].spanishShare).padStart(8)} | ${pct(y[2026].rockShare).padStart(8)} | ${y[2026].hitsStationCount?.toFixed(1) ?? '—'}`,
    );
  }

  console.log(`\nRecommended: Variant ${best} — ${VARIANT_DESC[best]}`);
  console.log(`Production patch: ${results.recommendation.productionPatch}`);
  console.log(`Ship? ${ship ? 'YES (pending approval)' : 'NO — tune variant'}`);

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(
    outJson,
    `${JSON.stringify({ recordedAt: new Date().toISOString(), seed: SEED, timingMs: Date.now() - t0, ...results }, null, 2)}\n`,
  );
  console.log(`\nWrote ${outJson}`);
  console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function describeProductionPatch(variant) {
  switch (variant) {
    case 'D':
      return 'MARKETS.phoenix.fragmentationLaunches: add phoenix_frag_top40_1992 FM TOP40 @1992p2';
    case 'B':
      return 'phoenixDiagTierInjectFormatBlocked: remove TOP40 from block list (chrwar gen dial fill)';
    case 'C':
      return 'phoenixDiagTierInjectFormatBlocked: remove HOT_AC from block list';
    case 'E':
      return 'phoenixDiagTop40HitsAppealMult return 1; hitsLineageEraMult FM boost after 1985 (Phoenix only)';
    case 'F':
      return 'D + B + appeal taper off + leader trim off (too broad — prefer G below)';
    case 'G':
      return 'D + phoenixDiagTop40HitsAppealMult return 1 + phoenixDiagTop40LeaderTrimProfile inactive (no tier-inject change)';
    default:
      return 'none';
  }
}

/** Variant G: D + mid-90s suppression off (no B tier inject). */
function patchLegacyVariantG(src) {
  let out = patchLegacyForVariant(src, 'D');
  if (out.includes(APPEAL_MULT_ANCHOR)) out = out.replace(APPEAL_MULT_ANCHOR, APPEAL_MULT_OFF);
  if (out.includes(LEADER_TRIM_ANCHOR)) out = out.replace(LEADER_TRIM_ANCHOR, LEADER_TRIM_OFF);
  return out;
}

main();
