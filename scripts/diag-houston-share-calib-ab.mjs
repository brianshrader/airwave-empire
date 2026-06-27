#!/usr/bin/env node
/**
 * Houston 2026 share-calibration A/B — three-way cold-start comparison.
 *
 *   node scripts/diag-houston-share-calib-ab.mjs
 *   node scripts/diag-houston-share-calib-ab.mjs --runs=16
 *
 * Variants (G._wlShareCalib):
 *   B0 baseline     — no leader caps, no public floor (pre-calibration book)
 *   B1 caps+floor   — leader caps on, public floor on
 *   B2 floor-only   — leader caps off, public floor on (production default)
 *
 * Output: tmp/houston_share_calib_ab.md + .json
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outMd = path.join(root, 'tmp', 'houston_share_calib_ab.md');
const outJson = path.join(root, 'tmp', 'houston_share_calib_ab.json');

const VARIANTS = [
  { id: 'B0', label: 'baseline (no caps, no floor)', leaderCaps: false, publicFloor: false },
  { id: 'B1', label: 'caps + floor', leaderCaps: true, publicFloor: true },
  { id: 'B2', label: 'floor only (prod default)', leaderCaps: false, publicFloor: true },
];

const MARKET = 'houston';
const TARGET_YEAR = 2026;
const TARGET_PERIOD = 1;
const GEN_ERA = '1985';
const MAX_STEPS = 320;
const DEFAULT_RUNS = 12;
const SEED = 20260625;

const SPOKEN_FMTS = new Set([
  'NEWS_TALK',
  'CONSERVATIVE_TALK',
  'SPORTS_TALK',
  'PERSONALITY_TALK',
  'ALL_NEWS',
]);

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
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

function createVmContext() {
  const noop = () => {};
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
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = Math.floor(Math.random() * 256);
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
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

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function parseRuns(argv) {
  for (const a of argv) {
    if (a.startsWith('--runs=')) return Math.max(1, parseInt(a.slice('--runs='.length), 10) || DEFAULT_RUNS);
  }
  return DEFAULT_RUNS;
}

function main() {
  const runs = parseRuns(process.argv.slice(2));
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(injectHeadlessMegaFragNewsGuard(readFileSync(legacyPath, 'utf8')), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);

  const inner = `
  (function(){
    var MARKET=${JSON.stringify(MARKET)};
    var TARGET_YEAR=${TARGET_YEAR};
    var TARGET_PERIOD=${TARGET_PERIOD};
    var GEN_ERA=${JSON.stringify(GEN_ERA)};
    var MAX_STEPS=${MAX_STEPS};
    var VARIANTS=${JSON.stringify(VARIANTS)};
    var SPOKEN=${JSON.stringify([...SPOKEN_FMTS])};
    function spokenFmt(fmt){ return SPOKEN.indexOf(fmt)>=0; }
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
    function metricsFromBook(book){
      var sh1=book.length?Number(book[0].rat.share)||0:0;
      var spoken=[], pub=0;
      for(var i=0;i<book.length;i++){
        var st=book[i], sh=Number(st.rat.share)||0;
        if(st.isPublic&&st.format==='PUBLIC_NEWS')pub+=sh;
        if(spokenFmt(st.format))spoken.push({st:st,sh:sh});
      }
      spoken.sort(function(a,b){return b.sh-a.sh;});
      var topSpoken=spoken.length?spoken[0].sh:0;
      var spokenSum=spoken.reduce(function(a,x){return a+x.sh;},0);
      var gt8=0,gt12=0;
      for(var j=0;j<book.length;j++){
        var s=Number(book[j].rat.share)||0;
        if(s>0.08)gt8++;
        if(s>0.12)gt12++;
      }
      return {
        share1:sh1,
        topSpoken:topSpoken,
        spokenSum:spokenSum,
        publicNews:pub,
        gt8:gt8,
        gt12:gt12,
        nBook:book.length,
        leadFormat:book[0]?String(book[0].format):'',
        leadSpokenFormat:spoken[0]?String(spoken[0].st.format):'',
      };
    }
    function sampleOne(variant,seed){
      ACTIVE_MARKET=MARKET;
      syncMarketPopToMarket(MARKET);
      G=genMarketMP(GEN_ERA);
      G._wlShareCalib={leaderCaps:variant.leaderCaps,publicFloor:variant.publicFloor};
      MP.mode='solo';
      var s=seed;
      var origR=Math.random;
      Math.random=function(){
        s=(s*9301+49297)%233280;
        return s/233280;
      };
      var steps=0;
      try{
        while(steps<MAX_STEPS){
          if(G.year===TARGET_YEAR&&G.period===TARGET_PERIOD)break;
          if(G.year>TARGET_YEAR||(G.year===TARGET_YEAR&&G.period>TARGET_PERIOD))
            return {ok:false,err:'overshoot'};
          var ui=window._harnessPatchTimersAndUi();
          try{ advTurn(); }finally{ ui.restore(); }
          steps++;
        }
        if(G.year!==TARGET_YEAR||G.period!==TARGET_PERIOD)return {ok:false,err:'miss'};
        var book=sortBook(eligibleBookStations(G));
        var m=metricsFromBook(book);
        m.ok=true;
        m.steps=steps;
        return m;
      }catch(e){
        return {ok:false,err:String(e&&e.message||e)};
      }finally{
        Math.random=origR;
      }
    }
    return function runAll(runs,baseSeed){
      var out=[];
      for(var vi=0;vi<VARIANTS.length;vi++){
        var v=VARIANTS[vi];
        for(var r=0;r<runs;r++){
          var seed=baseSeed+r*9973;
          out.push(Object.assign({variant:v.id,run:r},sampleOne(v,seed)));
        }
      }
      return out;
    };
  })();
  `;

  const runAll = vm.runInContext(inner, ctx);
  const rows = runAll(runs, SEED);
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) console.warn('Failures:', bad.slice(0, 5));

  const summary = {};
  for (const v of VARIANTS) {
    const list = rows.filter((r) => r.variant === v.id && r.ok);
    summary[v.id] = {
      id: v.id,
      label: v.label,
      leaderCaps: v.leaderCaps,
      publicFloor: v.publicFloor,
      n: list.length,
      share1_mean: mean(list.map((r) => r.share1)),
      share1_max: list.length ? Math.max(...list.map((r) => r.share1)) : null,
      topSpoken_mean: mean(list.map((r) => r.topSpoken)),
      topSpoken_max: list.length ? Math.max(...list.map((r) => r.topSpoken)) : null,
      spokenSum_mean: mean(list.map((r) => r.spokenSum)),
      publicNews_mean: mean(list.map((r) => r.publicNews)),
      gt8_mean: mean(list.map((r) => r.gt8)),
      gt12_mean: mean(list.map((r) => r.gt12)),
      pct_share1_gt_12: list.length ? list.filter((r) => r.share1 > 0.12).length / list.length : null,
      pct_topSpoken_gt_12: list.length ? list.filter((r) => r.topSpoken > 0.12).length / list.length : null,
    };
  }

  const lines = [
    `# Houston ${TARGET_YEAR} share calibration A/B`,
    '',
    `Cold start: genMarketMP(${GEN_ERA}) → Spring ${TARGET_YEAR} · ${runs} runs/variant · seed ${SEED}`,
    '',
    '| Variant | #1 mean | #1 max | Top spoken mean | Top spoken max | Spoken sum | Public news | >8% stns | >12% stns | % runs #1>12% | % spoken>12% |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const v of VARIANTS) {
    const s = summary[v.id];
    const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
    const num = (x, d = 2) => (x == null ? '—' : (x * 100).toFixed(d) + '%');
    lines.push(
      `| **${s.id}** ${s.label} | ${num(s.share1_mean)} | ${num(s.share1_max)} | ${num(s.topSpoken_mean)} | ${num(s.topSpoken_max)} | ${num(s.spokenSum_mean)} | ${num(s.publicNews_mean)} | ${s.gt8_mean == null ? '—' : s.gt8_mean.toFixed(2)} | ${s.gt12_mean == null ? '—' : s.gt12_mean.toFixed(2)} | ${pct(s.pct_share1_gt_12)} | ${pct(s.pct_topSpoken_gt_12)} |`,
    );
  }

  lines.push('', '## Interpretation', '');
  lines.push('- **B0** = uncapped book (caps/floor both off) — shows whether spoken monsters recur without outcome fixes.');
  lines.push('- **B1** = full calibration patch (caps + floor).');
  lines.push('- **B2** = production default (floor on, caps off) — preferred if top spoken stays plausible without hard trims.');
  lines.push('');
  lines.push('If B0 top spoken mean ≫ B2 and B1 ≈ B2, leader caps were masking model issues. If B2 alone keeps spoken leaders plausible, keep caps off.');

  mkdirSync(path.dirname(outMd), { recursive: true });
  writeFileSync(outMd, lines.join('\n') + '\n', 'utf8');
  writeFileSync(outJson, JSON.stringify({ market: MARKET, year: TARGET_YEAR, runs, seed: SEED, summary, rows }, null, 2) + '\n', 'utf8');

  console.log(lines.join('\n'));
  console.log(`\nWrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
  if (bad.length) console.log(`Note: ${bad.length} failed samples`);
}

main();
