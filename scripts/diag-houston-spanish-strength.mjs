#!/usr/bin/env node
/**
 * Houston 2026 Spanish strength audit — answers player complaints vs harness medians.
 *
 *   node scripts/diag-houston-spanish-strength.mjs
 *   node scripts/diag-houston-spanish-strength.mjs --runs=16 --seeds=1,2,3,4,5,6,7,8
 *   node scripts/diag-houston-spanish-strength.mjs --legacy=tmp/legacy_production.js --label=production
 *
 * Output: tmp/houston_spanish_strength.md + .json
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { isSpanishLanguageFormat } from './spanishLanguageFormats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const defaultLegacy = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const spanishCompPath = path.join(root, 'src', 'realismSpanishComposition.js');
const outMd = path.join(root, 'tmp', 'houston_spanish_strength.md');
const outJson = path.join(root, 'tmp', 'houston_spanish_strength.json');

const MARKET = 'houston';
const TARGET_YEAR = 2026;
const GEN_ERA = '1985';
const MAX_STEPS = 100;
const DEFAULT_RUNS = 16;
const DEFAULT_SEED = 20260628;

const SPANISH_PILLARS = [
  'SPANISH',
  'REGIONAL_MEXICAN',
  'SPANISH_CONTEMPORARY',
  'SPANISH_TROPICAL',
  'SPANISH_ADULT_HITS',
];

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function stubEl() {
  return {
    disabled: false, textContent: '', innerHTML: '', value: '', style: {}, dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {}, querySelector() { return null; }, focus() {}, click() {},
    addEventListener() {}, removeEventListener() {}, getAttribute() { return null; }, setAttribute() {},
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
    globalThis: null, window: null, document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearTimeout() {}, clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {}, fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray?.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = Math.floor(Math.random() * 256);
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      },
    },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Symbol, Proxy, Reflect,
    parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined, Int8Array, Uint8Array, Buffer, Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  const m = Math.floor(n / 2);
  return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function pct(x) {
  return x == null ? '—' : `${(x * 100).toFixed(2)}%`;
}

function parseArgs(argv) {
  const o = {
    runs: DEFAULT_RUNS,
    seed: DEFAULT_SEED,
    seeds: null,
    legacy: defaultLegacy,
    label: 'workspace',
    skipSpanishComp: false,
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
    else if (a.startsWith('--seeds=')) {
      o.seeds = a.slice(8).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
    } else if (a.startsWith('--legacy=')) o.legacy = a.slice(9);
    else if (a.startsWith('--label=')) o.label = a.slice(8);
    else if (a === '--skip-spanish-comp') o.skipSpanishComp = true;
  }
  return o;
}

function loadVm(opts) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let legacySrc = injectHeadlessMegaFragNewsGuard(readFileSync(opts.legacy, 'utf8'));
  vm.runInContext(legacySrc, ctx);
  if (!opts.skipSpanishComp && existsSync(spanishCompPath)) {
    vm.runInContext(readFileSync(spanishCompPath, 'utf8'), ctx);
  }
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function runSuite(opts) {
  const ctx = loadVm(opts);
  const seedList = opts.seeds?.length ? opts.seeds : Array.from({ length: opts.runs }, (_, i) => opts.seed + i * 9973);

  const inner = `
  (function(){
    var MARKET=${JSON.stringify(MARKET)};
    var TARGET_YEAR=${TARGET_YEAR};
    var GEN_ERA=${JSON.stringify(GEN_ERA)};
    var MAX_STEPS=${MAX_STEPS};
    var PILLARS=${JSON.stringify(SPANISH_PILLARS)};
    function isSpanFmt(fmt){
      var f=String(fmt||'');
      if(PILLARS.indexOf(f)>=0)return true;
      return f.indexOf('SPANISH_')===0;
    }
    function sortBook(G){
      var list=(G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
      });
      for(var i=0;i<list.length;i++){
        if(typeof sanitizeStationShareForRanking==='function')sanitizeStationShareForRanking(list[i]);
      }
      list.sort(function(a,b){
        var sa=a.rat.share||0,sb=b.rat.share||0;
        if(Math.abs(sb-sa)>1e-9)return sb-sa;
        return String(a.id).localeCompare(String(b.id));
      });
      return list;
    }
    function subtypePresence(book){
      var out={};
      PILLARS.forEach(function(p){out[p]=0;});
      book.forEach(function(st){
        var f=String(st.format||'');
        if(out[f]!=null&&(Number(st.rat.share)||0)>0.005)out[f]=1;
      });
      return out;
    }
    function cloneStackCount(book){
      var byFmt={};
      book.forEach(function(st){
        if(!isSpanFmt(st.format))return;
        var sh=Number(st.rat.share)||0;
        if(sh<0.02)return;
        var f=String(st.format);
        if(!byFmt[f])byFmt[f]=[];
        byFmt[f].push(sh);
      });
      var stacks=0;
      Object.keys(byFmt).forEach(function(f){
        if(byFmt[f].length>=2&&byFmt[f].reduce(function(a,x){return a+x;},0)>=0.08)stacks++;
      });
      return stacks;
    }
    function runOne(seed){
      ACTIVE_MARKET=MARKET;
      syncMarketPopToMarket(MARKET);
      G=genMarketMP(GEN_ERA);
      G._wlShareCalib={leaderCaps:false,publicFloor:true};
      MP.mode='solo';
      var s=seed, origR=Math.random;
      Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
      try{
        var steps=0;
        while(steps<MAX_STEPS){
          if(G.year===TARGET_YEAR&&G.period===1)break;
          if(G.year>TARGET_YEAR)return {ok:false,err:'overshoot'};
          var ui=window._harnessPatchTimersAndUi();
          try{ advTurn(); }finally{ ui.restore(); }
          steps++;
        }
        var book=sortBook(G);
        var spanishLane=0, spanTop5=0, spanTop10=0, spanOver10=0;
        var spanStations=[];
        book.forEach(function(st,idx){
          var sh=Number(st.rat.share)||0;
          if(!isSpanFmt(st.format))return;
          spanishLane+=sh;
          spanStations.push({rank:idx+1,call:st.callLetters,format:st.format,share:sh});
          if(sh>0.10)spanOver10++;
          if(idx<5)spanTop5++;
          if(idx<10)spanTop10++;
        });
        var top10=book.slice(0,10).map(function(st,idx){
          return {rank:idx+1,call:st.callLetters,format:st.format,share:Number(st.rat.share)||0};
        });
        var compOn=typeof spanishCompositionEnabled==='function'&&spanishCompositionEnabled();
        var nUmbrella=book.filter(function(st){return st.format==='SPANISH';}).length;
        var nSubtype=book.filter(function(st){
          return isSpanFmt(st.format)&&st.format!=='SPANISH';
        }).length;
        return {
          ok:true,
          seed:seed,
          spanishLane:spanishLane,
          spanTop5:spanTop5,
          spanTop10:spanTop10,
          spanOver10:spanOver10,
          spanCount:spanStations.length,
          cloneStacks:cloneStackCount(book),
          subtypePresence:subtypePresence(book),
          top10:top10,
          spanStations:spanStations,
          compositionEnabled:compOn,
          nUmbrellaDial:nUmbrella,
          nSubtypeDial:nSubtype,
        };
      }catch(e){
        return {ok:false,err:String(e&&e.message||e),seed:seed};
      }finally{ Math.random=origR; }
    }
    return function(seeds){ return seeds.map(runOne); };
  })();
  `;

  const runAll = vm.runInContext(inner, ctx);
  return runAll(seedList);
}

function summarize(label, rows) {
  const ok = rows.filter((r) => r.ok);
  const lanes = ok.map((r) => r.spanishLane);
  const top5 = ok.map((r) => r.spanTop5);
  const top10 = ok.map((r) => r.spanTop10);
  const over10 = ok.map((r) => r.spanOver10);
  const clones = ok.map((r) => r.cloneStacks);

  const pillarCounts = {};
  for (const p of SPANISH_PILLARS) pillarCounts[p] = 0;
  ok.forEach((r) => {
    Object.entries(r.subtypePresence || {}).forEach(([k, v]) => {
      if (v) pillarCounts[k] = (pillarCounts[k] || 0) + 1;
    });
  });

  return {
    label,
    n: ok.length,
    compositionEnabled: ok[0]?.compositionEnabled ?? null,
    nUmbrellaDial: ok[0]?.nUmbrellaDial,
    nSubtypeDial: ok[0]?.nSubtypeDial,
    spanishLane: { mean: mean(lanes), median: median(lanes), max: Math.max(...lanes, 0) },
    spanTop5: { mean: mean(top5), median: median(top5), max: Math.max(...top5, 0) },
    spanTop10: { mean: mean(top10), median: median(top10), max: Math.max(...top10, 0) },
    spanOver10: { mean: mean(over10), max: Math.max(...over10, 0) },
    cloneStacks: { mean: mean(clones), max: Math.max(...clones, 0) },
    pillarPresence: pillarCounts,
    samples: ok,
    failures: rows.filter((r) => !r.ok),
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const suites = [];

  // Current workspace (with Spanish Composition IIFE when present)
  suites.push(summarize('workspace+composition', runSuite(opts)));

  // Production proxy: HEAD commit legacy, no composition file
  const prodLegacy = path.join(root, 'tmp', '_legacy_production_head.js');
  try {
    execSync(`git show HEAD:src/legacy.js > "${prodLegacy}"`, { cwd: root, stdio: 'pipe' });
    if (existsSync(prodLegacy)) {
      suites.push(
        summarize(
          'git-HEAD-legacy (no composition IIFE)',
          runSuite({ ...opts, legacy: prodLegacy, skipSpanishComp: true, label: 'git-HEAD' }),
        ),
      );
    }
  } catch {
    /* optional */
  }

  const lines = [
    '# Houston 2026 Spanish strength audit',
    '',
    `Spring ${TARGET_YEAR} · genMarketMP(${GEN_ERA}) · ${opts.runs} runs · market=${MARKET}`,
    '',
    '| Suite | Composition | Lane median | Lane max | Span in top 5 (med) | Span in top 10 (med) | Stations >10% | Clone stacks max |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const s of suites) {
    lines.push(
      `| **${s.label}** | ${s.compositionEnabled ? 'on' : 'off'} | ${pct(s.spanishLane.median)} | ${pct(s.spanishLane.max)} | ${s.spanTop5.median?.toFixed(1) ?? '—'} | ${s.spanTop10.median?.toFixed(1) ?? '—'} | ${s.spanOver10.max?.toFixed(0) ?? '—'} | ${s.cloneStacks.max?.toFixed(0) ?? '—'} |`,
    );
  }

  lines.push('', '## Subtype presence (runs with format in book)', '');
  for (const s of suites) {
    lines.push(`### ${s.label}`, '');
    for (const p of SPANISH_PILLARS) {
      const n = s.pillarPresence[p] || 0;
      if (n) lines.push(`- ${p}: ${n}/${s.n} runs`);
    }
    lines.push('');
  }

  // Show worst-case run from workspace
  const ws = suites[0];
  if (ws?.samples?.length) {
    const worst = [...ws.samples].sort((a, b) => b.spanishLane - a.spanishLane)[0];
    lines.push('## Heaviest Spanish lane run (workspace)', '');
    lines.push(`Seed ${worst.seed} · lane ${pct(worst.spanishLane)} · ${worst.spanTop5} in top 5 · ${worst.spanTop10} in top 10`, '');
    lines.push('| # | Call | Format | Share |', '|---|------|--------|-------|');
    worst.top10.forEach((r) => {
      lines.push(`| ${r.rank} | ${r.call} | ${r.format} | ${pct(r.share)} |`);
    });
    lines.push('');
  }

  lines.push('## Interpretation', '');
  lines.push('- **Lane median ~13%** with 1–2 Spanish in top 5 is defensible in Houston (~38% Hispanic).');
  lines.push('- **Red flags:** lane median >25%, 3+ Spanish in top 5, multiple stations >12%, clone stacks ≥2.');
  lines.push('- If **git-HEAD** (production proxy) shows higher concentration than **workspace+composition**, player may be on pre-promotion umbrella SPANISH ecology.');

  mkdirSync(path.dirname(outMd), { recursive: true });
  writeFileSync(outMd, lines.join('\n') + '\n', 'utf8');
  writeFileSync(outJson, JSON.stringify({ opts, suites }, null, 2) + '\n', 'utf8');
  console.log(lines.join('\n'));
  console.log(`\nWrote ${outMd}`);
}

main();
