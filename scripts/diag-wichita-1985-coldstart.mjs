#!/usr/bin/env node
/**
 * Wichita 1985 cold-start correction A/B — in-vm patches only (no shipped legacy edits).
 *
 *   node scripts/diag-wichita-1985-coldstart.mjs
 *
 * A baseline | B MARKET_BP_PATCH + dialBpAmToFm | C opening-shape | D B+C
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  classifyChrBucketMismatch,
  classifyChrConcentrationMismatch,
  deriveMarketEcology,
  expectedChrBucketStrengthByEra,
  expectedChrLeaderShareCap,
} from '../src/marketEcology.js';
import {
  classifyTop40Mismatch,
  expectedFormatLeadershipProfile,
} from './expectedFormatLeadershipProfile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

const VARIANTS = ['A', 'B', 'C', 'D'];
const RUNS = 8;
const SEED = 20260515;
const MAX_STEPS = 280;
const PERIOD = 1;

const PATHS = [
  { id: 'w85_95', label: 'Wichita 1985→1995', markets: ['wichita'], genMode: 'mp1985', year: 1995 },
  { id: 'w85_26', label: 'Wichita 1985→2026', markets: ['wichita'], genMode: 'mp1985', year: 2026 },
  { id: 'w70_75', label: 'Wichita 1970→1975', markets: ['wichita'], genMode: 'under1970', year: 1975 },
  { id: 'n85_26', label: 'Nashville 1985→2026', markets: ['nashville'], genMode: 'mp1985', year: 2026 },
  { id: 'n70_75', label: 'Nashville 1970→1975', markets: ['nashville'], genMode: 'under1970', year: 1975 },
  { id: 'a85_26', label: 'Atlanta 1985→2026', markets: ['atlanta'], genMode: 'mp1985', year: 2026 },
  { id: 'a70_75', label: 'Atlanta 1970→1975', markets: ['atlanta'], genMode: 'under1970', year: 1975 },
];

const MKT_META = {
  wichita: {
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
  },
  nashville: {
    rankTier: 'medium',
    archetypeId: 'southern_country',
    culture: { country: 0.26, urban: 0.03, newsTalk: 0.04, religion: 0.1, spanish: 0.02 },
    countryBonus: 0.18,
    blackPop: 0.18,
    churchGoing: 0.58,
    eduIndex: 0.88,
    publicCivicIndex: 0.96,
    fmPenBias: -0.058,
    fmMusicFragMult: 0.96,
  },
  atlanta: {
    rankTier: 'large',
    archetypeId: 'sunbelt_diversified',
    culture: { country: 0.09, urban: 0.06, newsTalk: 0.1, religion: 0.04, spanish: 0.06 },
    countryBonus: 0,
    blackPop: 0.358,
    churchGoing: 0.54,
    eduIndex: 0.9,
    publicCivicIndex: 0.94,
    fmPenBias: -0.02,
    fmMusicFragMult: 0.98,
  },
};

const BASELINE_DIAL_BP = `    dialBpAmToFm:{
      3:{fmt:'ALBUM_ROCK',pw:'50kw'},
      6:{fmt:'GOSPEL',pw:'25kw'},
      10:{fmt:'TOP40',pw:'50kw'},
      11:{fmt:'ALBUM_ROCK',pw:'25kw'},
      12:{fmt:'GOSPEL',pw:'25kw'},
      13:{fmt:'COUNTRY',pw:'50kw'},
      17:{fmt:'GOSPEL',pw:'10kw'},
    },`;

const VARIANT_B_DIAL_BP = `    dialBpAmToFm:{
      3:{fmt:'COUNTRY',pw:'50kw',str:'moderate'},
      6:{fmt:'GOSPEL',pw:'25kw'},
      10:{fmt:'CLASSIC_HITS',pw:'50kw',str:'moderate'},
      11:{fmt:'COUNTRY',pw:'25kw',str:'emerging'},
      12:{fmt:'GOSPEL',pw:'25kw'},
      13:{fmt:'COUNTRY',pw:'50kw',str:'strong'},
      17:{fmt:'GOSPEL',pw:'10kw'},
    },`;

const WICHITA_BP_PATCH = `  wichita:{
    10:{fmt:'CLASSIC_HITS',str:'moderate'},
    11:{fmt:'COUNTRY',pw:'5kw',str:'moderate'},
    15:{fmt:'CLASSIC_ROCK',str:'moderate'},
    16:{fmt:'COUNTRY',str:'strong'},
  },`;

const OPENING_SHAPE_ANCHOR =
  "if(marketId==='nashville'&&s.format==='COUNTRY'&&s.sig?.type==='FM')f*=1.05;";

const OPENING_SHAPE_WICHITA = `${OPENING_SHAPE_ANCHOR}
    if(marketId==='wichita'){
      if(s.format==='COUNTRY'){
        if(s.sig?.type==='AM')f*=1.09;
        if(s.sig?.type==='FM')f*=1.12;
      }
      if(['ALBUM_ROCK','ALT_ROCK'].includes(s.format)&&s.sig?.type==='FM')f*=0.90;
      if(s.format==='TOP40')f*=0.93;
      if(s.format==='ADULT_CONTEMP'&&s.sig?.type==='FM')f*=1.04;
    }`;

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function patchLegacyForVariant(src, variant) {
  let out = injectHeadlessMegaFragNewsGuard(src);
  const useB = variant === 'B' || variant === 'D';
  const useC = variant === 'C' || variant === 'D';

  if (useB) {
    if (!out.includes("wichita:{\n    10:{fmt:'CLASSIC_HITS'")) {
      out = out.replace(
        '  phoenix:{\n    0:{fmt:\'MOR\',str:\'strong\'},',
        `${WICHITA_BP_PATCH}\n  phoenix:{\n    0:{fmt:'MOR',str:'strong'},`,
      );
    }
    if (out.includes(BASELINE_DIAL_BP)) {
      out = out.replace(BASELINE_DIAL_BP, VARIANT_B_DIAL_BP);
    }
  }

  if (useC) {
    if (!out.includes("marketId==='wichita'") || !out.includes('f*=1.12')) {
      out = out.replace(OPENING_SHAPE_ANCHOR, OPENING_SHAPE_WICHITA);
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

function rockBucket(fmtSum) {
  return (fmtSum.ALBUM_ROCK || 0) + (fmtSum.CLASSIC_ROCK || 0) + (fmtSum.ALT_ROCK || 0) + (fmtSum.AAA || 0);
}

function acBucket(fmtSum) {
  return (fmtSum.ADULT_CONTEMP || 0) + (fmtSum.HOT_AC || 0) + (fmtSum.CLASSIC_HITS || 0);
}

function talkBucket(fmtSum) {
  return (
    (fmtSum.NEWS_TALK || 0) +
    (fmtSum.SPORTS_TALK || 0) +
    (fmtSum.PERSONALITY_TALK || 0) +
    (fmtSum.ALL_NEWS || 0)
  );
}

function gospelBucket(fmtSum) {
  return (fmtSum.GOSPEL || 0) + (fmtSum.RELIGIOUS_NETWORK || 0);
}

function urbanBucket(fmtSum) {
  return (fmtSum.URBAN_CONTEMP || 0) + (fmtSum.SOUL_RNB || 0) + (fmtSum.RHYTHMIC || 0);
}

function joinMismatchFlags(...flags) {
  return flags.filter(Boolean).join('|');
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function eligibleBookStations(G){
    return (G.stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
    });
  }
  function sortBook(stations){
    var list=stations.slice();
    for(var i=0;i<list.length;i++){
      if(typeof sanitizeStationShareForRanking==='function')sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){
      var sa=a.rat&&a.rat.share||0,sb=b.rat&&b.rat.share||0;
      if(Math.abs(sb-sa)>1e-9)return sb-sa;
      return String(a.id).localeCompare(String(b.id));
    });
    return list;
  }
  function isChrLineageFmt(fmt){
    var raw=String(fmt||'');
    if(raw==='RHYTHMIC'||raw==='HOT_AC'||raw==='CHR')return true;
    return fmtKey(fmt)==='TOP40';
  }
  function chrLaneShare(s){
    if(!isChrLineageFmt(s.format))return 0;
    return Number(s.rat&&s.rat.share)||0;
  }
  function genFresh(genMode){
    if(genMode==='mp1985'){
      var sc=SC.find(function(s){return s.id==='chrwar';});
      var origIdx=sc.idx; sc.idx=[];
      G=genMarket('chrwar');
      sc.idx=origIdx;
    }else{
      var sc2=SC.find(function(s){return s.id==='under';});
      var oi=sc2.idx; sc2.idx=[];
      G=genMarket('under');
      sc2.idx=oi;
    }
    G.stations.forEach(function(st){st.isPlayer=false;});
    G.ps=[];
    MP.mode='solo'; MP.isHost=false; if(MP.players)MP.players=[];
    return G;
  }
  function sampleOneRun(marketId, genMode, targetYear, seedVal, maxSteps){
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
      var book=sortBook(eligibleBookStations(G));
      var fmtSum={}, chr=0, ctry=0, hhi=0, chrLeaderShare=0;
      for(var j=0;j<book.length;j++){
        var st=book[j];
        var sh=Number(st.rat&&st.rat.share)||0;
        hhi+=sh*sh;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        if(isChrLineageFmt(st.format)){
          if(sh>chrLeaderShare)chrLeaderShare=sh;
        }
        chr+=chrLaneShare(st);
        if(String(st.format||'')==='COUNTRY')ctry+=sh;
      }
      var lead=book[0]||null;
      return {
        ok:true, fmtSum:fmtSum, chrTotal:chr, country:ctry,
        hhi_x10000:hhi*10000, chrLeaderShare:chrLeaderShare,
        leaderFmtKey:lead?fmtKey(lead.format):'',
      };
    }catch(e){
      return {ok:false,err:String(e&&e.message||e)};
    }
  }
  return function runCells(cells, runs, baseSeed, maxSteps){
    var out=[], origR=Math.random;
    for(var ci=0;ci<cells.length;ci++){
      var cell=cells[ci];
      for(var run=0;run<runs;run++){
        var s0=baseSeed+(cell.salt||0)*17+cell.year*10007+run*9973+ci*131;
        var r;
        try{ r=sampleOneRun(cell.marketId, cell.genMode, cell.year, s0, maxSteps); }
        catch(e){ r={ok:false,err:String(e&&e.message||e)}; }
        finally{ Math.random=origR; }
        out.push({
          cellId:cell.cellId, marketId:cell.marketId, year:cell.year, genMode:cell.genMode,
          run:run, ok:r.ok, err:r.err||'',
          fmtSum:r.fmtSum, chrTotal:r.chrTotal, country:r.country,
          hhi_x10000:r.hhi_x10000, chrLeaderShare:r.chrLeaderShare, leaderFmtKey:r.leaderFmtKey,
        });
      }
    }
    return out;
  };
})();
`;

function summarize(rows, marketId, year) {
  const list = rows.filter((r) => r.ok && r.marketId === marketId && r.year === year);
  if (!list.length) return null;
  const n = list.length;
  const hist = {};
  for (const r of list) {
    const k = r.leaderFmtKey || '?';
    hist[k] = (hist[k] || 0) + 1;
  }
  const histStr = Object.keys(hist)
    .sort((a, b) => hist[b] - hist[a])
    .map((k) => `${k}:${hist[k]}`)
    .join('|');

  const mktRow = { id: marketId, ...MKT_META[marketId] };
  const eco = deriveMarketEcology(mktRow, marketId, year, null);
  const top40Wins = list.filter((r) => r.leaderFmtKey === 'TOP40').length / n;
  const chr = mean(list.map((r) => r.chrTotal));

  return {
    countryPct: mean(list.map((r) => r.country)) * 100,
    rockPct: mean(list.map((r) => rockBucket(r.fmtSum || {}))) * 100,
    acPct: mean(list.map((r) => acBucket(r.fmtSum || {}))) * 100,
    talkPct: mean(list.map((r) => talkBucket(r.fmtSum || {}))) * 100,
    gospelPct: mean(list.map((r) => gospelBucket(r.fmtSum || {}))) * 100,
    urbanPct: mean(list.map((r) => urbanBucket(r.fmtSum || {}))) * 100,
    chrPct: chr * 100,
    hhi: mean(list.map((r) => r.hhi_x10000)),
    histStr,
    top40Mismatch: classifyTop40Mismatch(top40Wins, expectedFormatLeadershipProfile(eco, year).top40ChrWeight) || null,
    chrFlags:
      joinMismatchFlags(
        classifyChrBucketMismatch(chr, expectedChrBucketStrengthByEra(year, eco), year),
        classifyChrConcentrationMismatch(
          mean(list.map((r) => r.chrLeaderShare)),
          expectedChrLeaderShareCap(year, eco),
        ),
      ) || null,
  };
}

function variantLabel(v) {
  if (v === 'A') return 'A baseline';
  if (v === 'B') return 'B MARKET_BP_PATCH + dialBpAmToFm';
  if (v === 'C') return 'C opening-shape country boost';
  return 'D combined B+C';
}

function meetsTargets(m) {
  if (!m) return { pass: false, notes: ['no data'] };
  const notes = [];
  let pass = true;
  if (m.countryPct < 12) {
    pass = false;
    notes.push(`country ${m.countryPct.toFixed(1)}% < 12%`);
  }
  if (m.rockPct > 22) {
    pass = false;
    notes.push(`rock ${m.rockPct.toFixed(1)}% > 22%`);
  }
  if (m.top40Mismatch === 'SEVERE' || (m.histStr && /^TOP40:[5-8]/.test(m.histStr))) {
    pass = false;
    notes.push('TOP40 dominance risk');
  }
  if (pass) notes.push('2026 targets met (country≥12%, rock≤22%, no TOP40 lock)');
  return { pass, notes };
}

function main() {
  console.log('Wichita 1985 cold-start correction diagnostics (in-vm only)\n');

  const all = {};
  for (const variant of VARIANTS) {
    console.log(`\n========== ${variantLabel(variant)} ==========\n`);
    const ctx = loadCtx(variant);
    const cells = [];
    for (const p of PATHS) {
      for (const mid of p.markets) {
        cells.push({
          cellId: `${p.id}`,
          marketId: mid,
          genMode: p.genMode,
          year: p.year,
          salt: marketSalt(mid),
        });
      }
    }
    const rows = vm.runInContext(RUN_IIFE, ctx)(cells, RUNS, SEED, MAX_STEPS);
    const bad = rows.filter((r) => !r.ok);
    if (bad.length) console.error(`  ${bad.length} failed — e.g. ${bad[0]?.cellId}: ${bad[0]?.err}`);

    all[variant] = {};
    for (const p of PATHS) {
      const key = p.id;
      all[variant][key] = { label: p.label, markets: {} };
      for (const mid of p.markets) {
        const s = summarize(
          rows.filter((r) => r.cellId === p.id),
          mid,
          p.year,
        );
        all[variant][key].markets[mid] = s;
        if (!s) continue;
        const flags = [s.top40Mismatch, s.chrFlags].filter(Boolean).join('|');
        console.log(
          `${p.label} | ${mid} @${p.year}: ctry=${s.countryPct.toFixed(1)}% rock=${s.rockPct.toFixed(1)}% AC=${s.acPct.toFixed(1)}% talk=${s.talkPct.toFixed(1)}% gospel=${s.gospelPct.toFixed(1)}% urban=${s.urbanPct.toFixed(1)}% HHI≈${s.hhi.toFixed(0)}`,
        );
        console.log(`  #1 ${s.histStr}${flags ? ` | ${flags}` : ''}`);
      }
    }
  }

  console.log('\n========== Wichita 1985→2026 vs targets (all variants) ==========\n');
  console.log('Var\tCountry\tRock\tAC\tTalk\tGospel\tUrban\tHHI\t#1\tTargets');
  for (const variant of VARIANTS) {
    const m = all[variant].w85_26?.markets?.wichita;
    const t = meetsTargets(m);
    console.log(
      [
        variant,
        m?.countryPct?.toFixed(1) ?? '—',
        m?.rockPct?.toFixed(1) ?? '—',
        m?.acPct?.toFixed(1) ?? '—',
        m?.talkPct?.toFixed(1) ?? '—',
        m?.gospelPct?.toFixed(1) ?? '—',
        m?.urbanPct?.toFixed(1) ?? '—',
        m?.hhi?.toFixed(0) ?? '—',
        m?.histStr ?? '—',
        t.notes.join('; '),
      ].join('\t'),
    );
  }

  console.log('\n========== 1970→1975 control (Wichita must not regress) ==========\n');
  console.log('Var\tWichita country\t#1\tNashville country\tAtlanta country');
  for (const variant of VARIANTS) {
    const w = all[variant].w70_75?.markets?.wichita;
    const n = all[variant].n70_75?.markets?.nashville;
    const a = all[variant].a70_75?.markets?.atlanta;
    console.log(
      [variant, w?.countryPct?.toFixed(1), w?.histStr, n?.countryPct?.toFixed(1), a?.countryPct?.toFixed(1)].join(
        '\t',
      ),
    );
  }

  console.log('\n========== Control bleed check (Nashville 1985→2026 across variants) ==========\n');
  for (const variant of VARIANTS) {
    const m = all[variant].n85_26?.markets?.nashville;
    console.log(`${variant}: country=${m?.countryPct?.toFixed(1)}% #1=${m?.histStr}`);
  }

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const outPath = path.join(root, 'tmp', 'wichita_1985_coldstart_ab.json');
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runs: RUNS,
        seed: SEED,
        variantSpec: {
          A: 'baseline',
          B: 'MARKET_BP_PATCH.wichita + dialBpAmToFm country-heavy',
          C: 'applyMarketOpeningShape wichita country FM +1.12, AOR/ALT 0.90, TOP40 0.93',
          D: 'B+C',
        },
        results: all,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nWrote ${outPath}`);
}

main();
