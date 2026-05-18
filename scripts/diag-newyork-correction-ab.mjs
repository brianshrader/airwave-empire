#!/usr/bin/env node
/**
 * New York market correction A/B — in-vm patches only (no shipped legacy edits).
 *
 *   node scripts/diag-newyork-correction-ab.mjs
 *
 * A baseline | B softer talk BP[2] | C Spanish seeding | D rock trim | E B+C+light D
 * Controls: chicago, losangeles (NY-only patches should not move controls).
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
const TARGET_MARKET = 'newyork';
const CONTROL_MARKETS = ['chicago', 'losangeles'];
const ALL_MARKETS = [TARGET_MARKET, ...CONTROL_MARKETS];
const RUNS = 8;
const SEED = 20260515;
const MAX_STEPS = 320;

const NY_BP_STRONG = `  newyork:{
    2:{fmt:'NEWS_TALK',str:'strong'},
    13:{fmt:'COUNTRY',pw:'DA',str:'weak'},
    16:{fmt:'TOP40',str:'emerging'},
  },`;

const NY_BP_SOFT_TALK = `  newyork:{
    2:{fmt:'NEWS_TALK',str:'emerging'},
    13:{fmt:'COUNTRY',pw:'DA',str:'weak'},
    16:{fmt:'TOP40',str:'emerging'},
  },`;

const MEGA_FRAG_FN_BASE = `function megaMarketFragmentationQueueForNewGame(marketId){
  if(!isMegaMarketId(marketId))return[];
  return MEGA_MARKET_FRAGMENTATION_LAUNCHES.map(({y,p,bp})=>({y,p,bp:{...bp}}));
}`;

const MEGA_FRAG_FN_SPANISH = `function megaMarketFragmentationQueueForNewGame(marketId){
  if(!isMegaMarketId(marketId))return[];
  let q=MEGA_MARKET_FRAGMENTATION_LAUNCHES.map(({y,p,bp})=>({y,p,bp:{...bp}}));
  if(marketId==='newyork'){
    q.push({y:1992,p:2,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}});
    q.sort((a,b)=>a.y-b.y||(a.p-b.p));
    for(let i=0;i<q.length;i++){
      if(q[i].y===2006&&q[i].bp.fmt==='SPANISH'){
        q[i].bp={type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'};
      }
    }
  }
  return q;
}`;

const MEGA_FRAG_FN_ROCK_TRIM = `function megaMarketFragmentationQueueForNewGame(marketId){
  if(!isMegaMarketId(marketId))return[];
  let q=MEGA_MARKET_FRAGMENTATION_LAUNCHES.map(({y,p,bp})=>({y,p,bp:{...bp}}));
  if(marketId==='newyork'){
    q=q.filter(({y,bp})=>!(y===1983&&bp.fmt==='CLASSIC_ROCK')&&!(y===1991&&bp.fmt==='ALT_ROCK'));
  }
  return q;
}`;

const MEGA_FRAG_FN_COMBINED = `function megaMarketFragmentationQueueForNewGame(marketId){
  if(!isMegaMarketId(marketId))return[];
  let q=MEGA_MARKET_FRAGMENTATION_LAUNCHES.map(({y,p,bp})=>({y,p,bp:{...bp}}));
  if(marketId==='newyork'){
    q=q.filter(({y,bp})=>!(y===1983&&bp.fmt==='CLASSIC_ROCK')&&!(y===1991&&bp.fmt==='ALT_ROCK'));
    q.push({y:1992,p:2,bp:{type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'}});
    q.sort((a,b)=>a.y-b.y||(a.p-b.p));
    for(let i=0;i<q.length;i++){
      if(q[i].y===2006&&q[i].bp.fmt==='SPANISH'){
        q[i].bp={type:'FM',fmt:'SPANISH',pw:'50kw',str:'moderate'};
      }
    }
  }
  return q;
}`;

const TIER_INJECT_GUARD =
  "if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt))continue;\n      if(formatAllowedInMarket(cand.fmt,dialCtx.marketId,bpYear)){";

const TIER_INJECT_ROCK_SKIP =
  "if(isPhoenixDiagMarket(dialCtx.marketId)&&phoenixDiagTierInjectFormatBlocked(cand.fmt))continue;\n      if(dialCtx.marketId==='newyork'&&['CLASSIC_ROCK','ALBUM_ROCK','ALT_ROCK'].includes(cand.fmt))continue;\n      if(formatAllowedInMarket(cand.fmt,dialCtx.marketId,bpYear)){";

const NY_OPENING_TAIL = `      if(s.format==='NEWS_TALK'&&s.sig?.type==='AM')f*=1.035;
    }`;

const NY_OPENING_SPANISH = `      if(s.format==='NEWS_TALK'&&s.sig?.type==='AM')f*=1.035;
      if(s.format==='SPANISH')f*=1.05;
    }`;

const NY_OPENING_ROCK_LIGHT = `      if(['ALBUM_ROCK','CLASSIC_ROCK','ALT_ROCK'].includes(s.format)&&s.sig?.type==='FM')f*=0.90;
      if(s.format==='NEWS_TALK'&&s.sig?.type==='AM')f*=1.035;
    }`;

const NY_OPENING_ROCK_HEAVY = `      if(['ALBUM_ROCK','CLASSIC_ROCK','ALT_ROCK'].includes(s.format)&&s.sig?.type==='FM')f*=0.88;
      if(s.format==='NEWS_TALK'&&s.sig?.type==='AM')f*=1.035;
    }`;

const NY_OPENING_E = `      if(['ALBUM_ROCK','CLASSIC_ROCK','ALT_ROCK'].includes(s.format)&&s.sig?.type==='FM')f*=0.90;
      if(s.format==='NEWS_TALK'&&s.sig?.type==='AM')f*=1.035;
      if(s.format==='SPANISH')f*=1.05;
    }`;

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function patchLegacyForVariant(src, variant) {
  let out = injectHeadlessMegaFragNewsGuard(src);
  const useB = variant === 'B' || variant === 'E';
  const useC = variant === 'C' || variant === 'E';
  const useD = variant === 'D';
  const useLightD = variant === 'E';
  const useHeavyD = variant === 'D';

  if (useB) {
    out = out.replace(NY_BP_STRONG, NY_BP_SOFT_TALK);
  }

  if (useC || useHeavyD) {
    const frag = useC && useHeavyD ? MEGA_FRAG_FN_COMBINED : useC ? MEGA_FRAG_FN_SPANISH : MEGA_FRAG_FN_ROCK_TRIM;
    out = out.replace(MEGA_FRAG_FN_BASE, frag);
  }

  if (useHeavyD && out.includes(TIER_INJECT_GUARD)) {
    out = out.replace(TIER_INJECT_GUARD, TIER_INJECT_ROCK_SKIP);
  }

  if (useC && !useHeavyD && !useLightD) {
    if (out.includes(NY_OPENING_TAIL)) {
      out = out.replace(NY_OPENING_TAIL, NY_OPENING_SPANISH);
    }
  } else if (useLightD && useC) {
    if (out.includes(NY_OPENING_TAIL)) {
      out = out.replace(NY_OPENING_TAIL, NY_OPENING_E);
    }
  } else if (useHeavyD) {
    if (out.includes(NY_OPENING_TAIL)) {
      out = out.replace(NY_OPENING_TAIL, NY_OPENING_ROCK_HEAVY);
    }
  } else if (useLightD) {
    if (out.includes(NY_OPENING_TAIL)) {
      out = out.replace(NY_OPENING_TAIL, NY_OPENING_ROCK_LIGHT);
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

function leaderConcentration(histStr) {
  const parts = (histStr || '').split('|').filter(Boolean);
  if (!parts.length) return { unique: 0, topShare: 0, talkWins: 0 };
  const counts = parts.map((p) => {
    const [fmt, n] = p.split(':');
    return { fmt, n: parseInt(n, 10) || 0 };
  });
  const max = Math.max(...counts.map((c) => c.n));
  const sum = counts.reduce((a, c) => a + c.n, 0);
  const talkWins = counts
    .filter((c) => ['NEWS_TALK', 'SPORTS_TALK', 'PERSONALITY_TALK', 'ALL_NEWS'].includes(c.fmt))
    .reduce((a, c) => a + c.n, 0);
  return { unique: parts.length, topShare: sum ? max / sum : 0, talkWins: sum ? talkWins / sum : 0 };
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function eligibleBook(G){
    return (G.stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
    });
  }
  function sortBook(stations){
    var list=stations.slice();
    list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    return list;
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
    return G;
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
      var book=sortBook(eligibleBook(G));
      var shares={}, hhi=0;
      for(var j=0;j<book.length;j++){
        var sh=book[j].rat.share||0;
        hhi+=sh*sh;
        var fk=fmtKey(book[j].format);
        shares[fk]=(shares[fk]||0)+sh;
      }
      return {
        ok:true,
        bookShares:shares,
        leaderFmt:book[0]?fmtKey(book[0].format):'',
        hhi:hhi*10000
      };
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
        out.push({
          variant:c.variant, marketId:c.marketId, year:c.year, run:run,
          ok:r.ok, err:r.err||'', bookShares:r.bookShares, leaderFmt:r.leaderFmt, hhi:r.hhi
        });
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
  const lc = leaderConcentration(histStr);
  return {
    meanBuckets,
    talkPct: (meanBuckets.NEWS_TALK_SPORTS ?? 0) * 100,
    spanishPct: (meanBuckets.SPANISH ?? 0) * 100,
    rockPct: (meanBuckets.ROCK_ALT_AAA ?? 0) * 100,
    chrPct: (meanBuckets.TOP40_CHR ?? 0) * 100,
    urbanPct: (meanBuckets.URBAN_RHYTHMIC ?? 0) * 100,
    countryPct: (meanBuckets.COUNTRY ?? 0) * 100,
    publicPct: (meanBuckets.PUBLIC_RADIO ?? 0) * 100,
    hhi: mean(list.map((r) => r.hhi)),
    histStr,
    leaderConc: lc,
  };
}

function variantSpec(v) {
  const map = {
    A: 'baseline (shipped)',
    B: 'BP[2] NEWS_TALK strong→emerging',
    C: 'NY mega frag 1992 SPANISH moderate + 2006 strengthen; opening SPANISH ×1.05',
    D: 'tier inject skip AOR/CR/ALT for NY; drop 1983 CR + 1991 ALT mega launches; opening rock ×0.88',
    E: 'B + C + light D (opening rock ×0.90 only)',
  };
  return map[v] || v;
}

function scoreTargets(s, year) {
  if (!s) return [];
  const notes = [];
  if (year === 1975) {
    if (s.leaderConc.talkWins > 0.5) notes.push('1975 talk #1 >50%');
    else notes.push('1975 talk #1 OK');
    if (s.talkPct > 18) notes.push(`1975 talk share high (${s.talkPct.toFixed(1)}%)`);
  }
  if (year === 1995 && s.spanishPct < 3) notes.push(`1995 Spanish low (${s.spanishPct.toFixed(1)}%)`);
  if (year === 2026) {
    if (s.leaderConc.talkWins > 0.6) notes.push(`2026 talk #1 ${(s.leaderConc.talkWins * 100).toFixed(0)}%`);
    if (s.spanishPct < 8) notes.push(`2026 Spanish low (${s.spanishPct.toFixed(1)}%)`);
    if (s.rockPct > 16) notes.push(`2026 rock high (${s.rockPct.toFixed(1)}%)`);
  }
  return notes;
}

function main() {
  console.log('New York market correction A/B (in-vm only)\n');
  const allRows = [];
  const results = {};

  for (const variant of VARIANTS) {
    console.log(`\n========== Variant ${variant}: ${variantSpec(variant)} ==========\n`);
    const ctx = loadCtx(variant);
    const cells = [];
    for (const year of BENCHMARK_YEARS) {
      for (const mid of ALL_MARKETS) {
        cells.push({
          variant,
          marketId: mid,
          year,
          genMode: genModeForYear(year),
          salt: marketSalt(mid),
        });
      }
    }
    const rows = vm.runInContext(RUN_IIFE, ctx)(cells, RUNS, SEED, MAX_STEPS);
    allRows.push(...rows.map((r) => ({ ...r, variant })));
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) console.error(`  failures: ${bad.length} — ${bad[0]?.marketId}@${bad[0]?.year}: ${bad[0]?.err}`);

    results[variant] = {};
    for (const year of BENCHMARK_YEARS) {
      results[variant][year] = { newyork: summarize(rows, variant, TARGET_MARKET, year) };
      for (const mid of CONTROL_MARKETS) {
        results[variant][year][mid] = summarize(rows, variant, mid, year);
      }
    }

    console.log('Year\tTalk\tSpan\tRock\tCHR\tUrban\tCtry\tPub\tHHI\t#1\tTalk#1%');
    for (const year of BENCHMARK_YEARS) {
      const s = results[variant][year].newyork;
      if (!s) continue;
      console.log(
        [
          year,
          s.talkPct.toFixed(1),
          s.spanishPct.toFixed(1),
          s.rockPct.toFixed(1),
          s.chrPct.toFixed(1),
          s.urbanPct.toFixed(1),
          s.countryPct.toFixed(1),
          s.publicPct.toFixed(1),
          s.hhi.toFixed(0),
          s.histStr,
          `${(s.leaderConc.talkWins * 100).toFixed(0)}%`,
        ].join('\t'),
      );
    }
  }

  console.log('\n========== New York @2026 — variant comparison (vs baseline A) ==========\n');
  console.log('Var\tTalk\tSpan\tRock\tCHR\t#1\tTalk wins #1\tNotes');
  const base26 = results.A[2026].newyork;
  for (const variant of VARIANTS) {
    const s = results[variant][2026].newyork;
    const notes = scoreTargets(s, 2026);
    console.log(
      [
        variant,
        s.talkPct.toFixed(1),
        s.spanishPct.toFixed(1),
        s.rockPct.toFixed(1),
        s.chrPct.toFixed(1),
        s.histStr,
        `${(s.leaderConc.talkWins * 100).toFixed(0)}%`,
        notes.join('; ') || '—',
      ].join('\t'),
    );
  }

  console.log('\n========== New York @1975 — talk #1 dominance ==========\n');
  console.log('Var\tTalk%\t#1\tTalk wins #1');
  for (const variant of VARIANTS) {
    const s = results[variant][1975].newyork;
    console.log(
      [variant, s.talkPct.toFixed(1), s.histStr, `${(s.leaderConc.talkWins * 100).toFixed(0)}%`].join('\t'),
    );
  }

  console.log('\n========== New York @1995 — Spanish presence ==========\n');
  console.log('Var\tSpan%\tRock%\t#1');
  for (const variant of VARIANTS) {
    const s = results[variant][1995].newyork;
    console.log([variant, s.spanishPct.toFixed(1), s.rockPct.toFixed(1), s.histStr].join('\t'));
  }

  console.log('\n========== Control bleed — Chicago & LA @2026 (should match across variants) ==========\n');
  for (const mid of CONTROL_MARKETS) {
    console.log(`--- ${mid} ---`);
    console.log('Var\tTalk\tSpan\tRock\t#1');
    for (const variant of VARIANTS) {
      const s = results[variant][2026][mid];
      console.log(
        [variant, s.talkPct.toFixed(1), s.spanishPct.toFixed(1), s.rockPct.toFixed(1), s.histStr].join('\t'),
      );
    }
  }

  const chicagoStable = CONTROL_MARKETS.every((mid) => {
    const a = results.A[2026][mid].histStr;
    return VARIANTS.every((v) => results[v][2026][mid].histStr === a);
  });

  console.log(`\nControls stable across A–E: ${chicagoStable ? 'YES' : 'NO (check patches)'}`);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const outPath = path.join(root, 'tmp', 'newyork_correction_ab.json');
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runs: RUNS,
        seed: SEED,
        variantSpec: Object.fromEntries(VARIANTS.map((v) => [v, variantSpec(v)])),
        results,
        baseline2026: base26,
        controlsStable: chicagoStable,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nWrote ${outPath}`);
}

main();
