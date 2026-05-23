#!/usr/bin/env node
/**
 * Phoenix CHR recovery narrow follow-up — in-vm only (H/I/J/K vs A).
 *
 *   npm run diag:phoenix-chr-recovery-narrow
 *
 * Artifact: tmp/phoenix_chr_recovery_narrow.json
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
const outJson = path.join(root, 'tmp', 'phoenix_chr_recovery_narrow.json');

const VARIANTS = ['A', 'H', 'I', 'J', 'K'];
const PHOENIX = 'phoenix';
const SEED = 20260521;
const SIM_YEARS = [1985, 1995, 2005, 2026];

const MAX_STEPS_BY_YEAR = { 1985: 260, 1995: 320, 2005: 320, 2026: 320 };

const TIER_INJECT_ANCHOR =
  'if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt))continue;';
const TIER_INJECT_B =
  "if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt)&&cand.fmt!=='TOP40')continue;";

const PHOENIX_FRAG_ANCHOR = `    fragmentationLaunches:[
      {id:'phoenix_frag_cr_1986',y:1986,p:1,bp:{type:'FM',fmt:'CLASSIC_ROCK',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_ac_1988',y:1988,p:2,bp:{type:'FM',fmt:'ADULT_CONTEMP',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_spanish_1991',y:1991,p:1,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_oldies_1993',y:1993,p:2,bp:{type:'FM',fmt:'OLDIES',pw:'50kw',str:'moderate'}},
    ],`;

const PHOENIX_FRAG_K = `    fragmentationLaunches:[
      {id:'phoenix_frag_cr_1986',y:1986,p:1,bp:{type:'FM',fmt:'CLASSIC_ROCK',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_ac_1988',y:1988,p:2,bp:{type:'FM',fmt:'ADULT_CONTEMP',pw:'50kw',str:'moderate'}},
      {id:'phoenix_frag_top40_1992',y:1992,p:2,bp:{type:'FM',fmt:'TOP40',pw:'50kw',str:'emerging'}},
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

const VARIANT_DESC = {
  A: 'Shipped baseline (1970 BP Top40 + chrwar suppression)',
  H: 'B + appeal off + trim off (no 1992 frag)',
  I: 'B + appeal off only',
  J: 'B + trim off only',
  K: 'H + 1992 FM TOP40 emerging frag',
};

const PRIOR_F_REFERENCE = {
  label: 'Prior full F (from diag-phoenix-chr-recovery-ab)',
  chr2026: 0.1,
  spanish2026: 0.181,
  note: 'F = B + moderate 1992 frag + appeal off + trim off',
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

function patchLegacyNarrow(src, variant) {
  let out = injectHeadlessLaunchNewsGuard(src);
  const useB = ['H', 'I', 'J', 'K'].includes(variant);
  const useAppealOff = ['H', 'I', 'K'].includes(variant);
  const useTrimOff = ['H', 'J', 'K'].includes(variant);
  const useFragK = variant === 'K';

  if (useB && out.includes(TIER_INJECT_ANCHOR)) {
    out = out.replace(TIER_INJECT_ANCHOR, TIER_INJECT_B);
  }
  if (useAppealOff && out.includes(APPEAL_MULT_ANCHOR)) {
    out = out.replace(APPEAL_MULT_ANCHOR, APPEAL_MULT_OFF);
  }
  if (useTrimOff && out.includes(LEADER_TRIM_ANCHOR)) {
    out = out.replace(LEADER_TRIM_ANCHOR, LEADER_TRIM_OFF);
  }
  if (useFragK && out.includes(PHOENIX_FRAG_ANCHOR)) {
    out = out.replace(PHOENIX_FRAG_ANCHOR, PHOENIX_FRAG_K);
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
  const src = patchLegacyNarrow(readFileSync(legacyPath, 'utf8'), variant);
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

function chrBandOk(year, chr) {
  if (year === 1995 || year === 2005) return chr >= 0.06 && chr <= 0.14;
  if (year === 2026) return chr >= 0.05 && chr <= 0.12;
  return true;
}

function acceptanceRow(opening, byYear) {
  const y26 = byYear[2026];
  return {
    open1970: opening.pass,
    chr1995: chrBandOk(1995, byYear[1995].chrBucket),
    chr2005: chrBandOk(2005, byYear[2005].chrBucket),
    chr2026: chrBandOk(2026, y26.chrBucket),
    span2026Ideal: y26.spanishShare >= 0.2 && y26.spanishShare <= 0.28,
    span2026Min: y26.spanishShare >= 0.18,
    rock2026: y26.rockShare <= 0.18,
    noCr1: y26.crLeaderRate === 0,
    noChrDom: y26.chrBucket < 0.22,
    allCore:
      opening.pass &&
      chrBandOk(1995, byYear[1995].chrBucket) &&
      chrBandOk(2005, byYear[2005].chrBucket) &&
      chrBandOk(2026, y26.chrBucket) &&
      y26.spanishShare >= 0.18 &&
      y26.rockShare <= 0.18 &&
      y26.crLeaderRate === 0 &&
      y26.chrBucket < 0.22,
    allIdeal:
      opening.pass &&
      chrBandOk(1995, byYear[1995].chrBucket) &&
      chrBandOk(2005, byYear[2005].chrBucket) &&
      chrBandOk(2026, y26.chrBucket) &&
      y26.spanishShare >= 0.2 &&
      y26.spanishShare <= 0.28 &&
      y26.rockShare <= 0.18 &&
      y26.crLeaderRate === 0 &&
      y26.chrBucket < 0.22,
  };
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
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
    return null;
  }
  function bucketsFromShares(shares){
    var b={TOP40_CHR:0,AC_HOT_AC:0,ROCK_ALT_AAA:0,COUNTRY:0,SPANISH:0};
    for(var k in (shares||{})){
      var bk=bucketForFmt(k);
      if(bk&&b[bk]!=null) b[bk]+=shares[k]||0;
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
      var shares={};
      for(var j=0;j<book.length;j++){
        var fk=fmtKey(book[j].format);
        shares[fk]=(shares[fk]||0)+(book[j].rat.share||0);
      }
      var buckets=bucketsFromShares(shares);
      var lead=book[0]?fmtKey(book[0].format):'';
      var hitsN=0;
      for(var k=0;k<G.stations.length;k++){
        var st=G.stations[k];
        if(!st||st._bpSlotDeferred) continue;
        var f2=fmtKey(st.format);
        if(f2==='TOP40'||f2==='CHR'||f2==='HOT_AC'||f2==='RHYTHMIC') hitsN++;
      }
      return {
        ok:true,
        shares:shares,
        buckets:buckets,
        leaderFmt:lead,
        top40Share:shares.TOP40||0,
        hotAcShare:shares.HOT_AC||0,
        chrBucket:buckets.TOP40_CHR||0,
        spanishShare:buckets.SPANISH||(shares.SPANISH||0),
        rockShare:(shares.CLASSIC_ROCK||0)+(shares.ALBUM_ROCK||0)+(shares.ALT_ROCK||0),
        hitsStationCount:hitsN,
        morShare:shares.MOR||0,
        hitsPresent:!!(shares.TOP40||shares.CHR||shares.HOT_AC),
        top2:(book[0]?book[0].rat.share:0)+(book[1]?book[1].rat.share:0),
        hitLeaderOrRunnerUp:lead==='TOP40'||lead==='CHR'||(book[1]&&['TOP40','CHR'].includes(fmtKey(book[1].format)))
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { opening1970: function(m,s){return simToYear(m,1970,s,0);}, simToYear: simToYear };
})();
`;

function summarizeSim(rows) {
  const ok = rows.filter((r) => r.ok);
  return {
    n: ok.length,
    chrBucket: mean(ok.map((r) => r.chrBucket)),
    top40Share: mean(ok.map((r) => r.top40Share)),
    hotAcShare: mean(ok.map((r) => r.hotAcShare)),
    spanishShare: mean(ok.map((r) => r.spanishShare)),
    rockShare: mean(ok.map((r) => r.rockShare)),
    hitsStationCount: mean(ok.map((r) => r.hitsStationCount)),
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
    hitsPresenceRate: ok.filter((r) => r.hitsPresent).length / Math.max(1, ok.length),
    morShareMedian: median(ok.map((r) => r.morShare)),
    hitLeaderRunnerUpRate: ok.filter((r) => r.hitLeaderOrRunnerUp).length / Math.max(1, ok.length),
    pass: openingPass({
      hitsPresenceRate: ok.filter((r) => r.hitsPresent).length / Math.max(1, ok.length),
      morShareMedian: median(ok.map((r) => r.morShare)),
      hitLeaderRunnerUpRate: ok.filter((r) => r.hitLeaderOrRunnerUp).length / Math.max(1, ok.length),
    }),
  };
}

function parseArgs(argv) {
  const o = { openingRuns: 100, simRuns: 25, seed: SEED };
  for (const a of argv) {
    if (a.startsWith('--opening-runs=')) o.openingRuns = Math.max(1, parseInt(a.slice(15), 10) || 100);
    else if (a.startsWith('--sim-runs=')) o.simRuns = Math.max(1, parseInt(a.slice(11), 10) || 25);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || SEED;
  }
  return o;
}

function productionPatchFor(variant) {
  const parts = [];
  if (['H', 'I', 'J', 'K'].includes(variant)) {
    parts.push('phoenixDiagTierInjectFormatBlocked: allow TOP40 (remove from block list)');
  }
  if (['H', 'I', 'K'].includes(variant)) {
    parts.push('phoenixDiagTop40HitsAppealMult → return 1');
  }
  if (['H', 'J', 'K'].includes(variant)) {
    parts.push('phoenixDiagTop40LeaderTrimProfile → inactive in 1990–99');
  }
  if (variant === 'K') {
    parts.push('fragmentationLaunches: phoenix_frag_top40_1992 FM emerging @1992p2');
  }
  return parts.join('; ') || 'none';
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const results = { variants: {}, priorF: PRIOR_F_REFERENCE, seed: opts.seed };

  console.log('Phoenix CHR recovery narrow follow-up (chrwar path)\n');

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

    const byYear = {};
    for (const year of SIM_YEARS) {
      const simRows = [];
      for (let run = 0; run < opts.simRuns; run++) {
        const s0 = opts.seed + marketSalt(PHOENIX) * 17 + year * 10007 + run * 9973 + variant.charCodeAt(0) * 131;
        let r;
        try {
          r = api.simToYear(PHOENIX, year, s0, MAX_STEPS_BY_YEAR[year] ?? 320);
        } catch (e) {
          r = { ok: false, err: String(e?.message || e) };
        } finally {
          Math.random = origR;
        }
        simRows.push(r);
      }
      byYear[year] = summarizeSim(simRows);
    }

    const acceptance = acceptanceRow(opening, byYear);
    results.variants[variant] = {
      description: VARIANT_DESC[variant],
      opening,
      byYear,
      acceptance,
      productionPatch: productionPatchFor(variant),
    };

    console.log(
      `[${variant}] ${VARIANT_DESC[variant]}\n` +
        `  1970: ${opening.pass ? 'PASS' : 'FAIL'} | CHR 85/95/05/26: ${pct(byYear[1985].chrBucket)}/${pct(byYear[1995].chrBucket)}/${pct(byYear[2005].chrBucket)}/${pct(byYear[2026].chrBucket)} | Span26 ${pct(byYear[2026].spanishShare)} Rock26 ${pct(byYear[2026].rockShare)} | core=${acceptance.allCore ? 'YES' : 'no'} ideal=${acceptance.allIdeal ? 'YES' : 'no'}\n`,
    );
  }

  console.log('\n── By year (CHR bucket / Spanish) ──');
  console.log('Var | 1985 CHR | 1995 CHR | 2005 CHR | 2026 CHR | 2026 Span | 2026 Rock | CR#1');
  for (const v of VARIANTS) {
    const y = results.variants[v].byYear;
    const a = results.variants[v].acceptance;
    console.log(
      `${v}   | ${pct(y[1985].chrBucket).padStart(7)} | ${pct(y[1995].chrBucket).padStart(7)} | ${pct(y[2005].chrBucket).padStart(7)} | ${pct(y[2026].chrBucket).padStart(7)} | ${pct(y[2026].spanishShare).padStart(8)} | ${pct(y[2026].rockShare).padStart(8)} | ${y[2026].crLeaderRate === 0 ? '0' : 'Y'}`,
    );
  }

  console.log('\n── Spanish / CHR tradeoff @2026 ──');
  for (const v of VARIANTS) {
    const y26 = results.variants[v].byYear[2026];
    console.log(`  ${v}: CHR ${pct(y26.chrBucket)} | Spanish ${pct(y26.spanishShare)} | hits stn ${y26.hitsStationCount?.toFixed(1)}`);
  }
  console.log(`  F†: CHR ${pct(PRIOR_F_REFERENCE.chr2026)} | Spanish ${pct(PRIOR_F_REFERENCE.spanish2026)} (prior ab run)`);

  let best = 'H';
  let bestScore = -1;
  for (const v of ['H', 'I', 'J', 'K']) {
    const acc = results.variants[v].acceptance;
    let sc = 0;
    if (acc.allIdeal) sc += 100;
    else if (acc.allCore) sc += 60;
    if (acc.chr1995) sc += 10;
    if (acc.chr2005) sc += 10;
    if (acc.chr2026) sc += 15;
    if (acc.span2026Ideal) sc += 20;
    else if (acc.span2026Min) sc += 8;
    sc -= v.charCodeAt(0) * 0.01;
    if (sc > bestScore) {
      bestScore = sc;
      best = v;
    }
  }

  const hAcc = results.variants.H.acceptance;
  const hEnough = hAcc.allCore || (hAcc.chr2026 && hAcc.chr1995 && hAcc.open1970);
  const fNecessary = !results.variants.H.acceptance.allCore && PRIOR_F_REFERENCE.chr2026 >= 0.08;

  results.recommendation = {
    variant: best,
    description: VARIANT_DESC[best],
    productionPatch: productionPatchFor(best),
    hMeetsCore: hAcc.allCore,
    hMeetsIdeal: hAcc.allIdeal,
    fullFNecessary: fNecessary,
    ship: results.variants[best].acceptance.allIdeal,
  };

  console.log(`\nIs H enough? core gates: ${hAcc.allCore ? 'YES' : 'NO'} | ideal (Span 20–28%): ${hAcc.allIdeal ? 'YES' : 'NO'}`);
  console.log(`Is full F necessary? ${fNecessary && !hAcc.allCore ? 'Likely yes for CHR bands' : hAcc.allCore ? 'No — H (or best narrow) may suffice' : 'Maybe — H alone may not hit CHR 6%+ bands'}`);
  console.log(`Recommended: ${best} — ${productionPatchFor(best)}`);
  console.log(`Ship (diagnostic recommendation only): ${results.recommendation.ship ? 'consider' : 'no'}`);

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(
    outJson,
    `${JSON.stringify({ recordedAt: new Date().toISOString(), timingMs: Date.now() - t0, ...results }, null, 2)}\n`,
  );
  console.log(`\nWrote ${outJson} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

main();
