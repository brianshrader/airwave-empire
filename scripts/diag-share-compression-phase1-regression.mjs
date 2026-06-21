#!/usr/bin/env node
/**
 * Share compression Phase 1 regression — prototype branch only.
 *
 * Compares baseline vs Phase 1 (tier L1 mass + LH blend 0.45 + OA leader relief ×0.70)
 * on concentration, economics, AI distress, and rivalry trigger proxies.
 *
 *   node scripts/diag-share-compression-phase1-regression.mjs
 *   node scripts/diag-share-compression-phase1-regression.mjs --quick
 *
 * Artifacts: tmp/share_compression_phase1_regression.json, .md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectHeadlessLaunchNewsGuard } from './diag-share-decomposition-lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const phase1Path = path.join(root, 'src', 'shareCompressionPhase1.js');
const rivalryPath = path.join(root, 'src', 'rivalryPrototype.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const outJson = path.join(root, 'tmp', 'share_compression_phase1_regression.json');
const outMd = path.join(root, 'tmp', 'share_compression_phase1_regression.md');

const MAX_STEPS = 360;
const DEFAULT_RUNS = 6;
const DEFAULT_SEED = 20260620;

const CELLS = [
  { marketId: 'newyork', year: 2003, weight: 1.5 },
  { marketId: 'newyork', year: 2010, weight: 1.5 },
  { marketId: 'nashville', year: 2003, weight: 2.0 },
  { marketId: 'nashville', year: 2010, weight: 2.0 },
  { marketId: 'atlanta', year: 2010, weight: 1.0 },
  { marketId: 'wichita', year: 2010, weight: 1.0 },
  { marketId: 'phoenix', year: 2026, weight: 1.0 },
];

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

function createVmContext(phase1) {
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, info: () => {}, error: console.error, table: () => {} },
    __WL_HEADLESS__: true,
    __WL_SHARE_COMPRESSION_PHASE1: phase1,
    __WL_RIVALRY_PROTOTYPE: phase1,
    globalThis: null, window: null, document: documentStub,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { reload: () => {}, search: '', href: '' },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0; },
    setInterval: () => 0, clearTimeout: () => {}, clearInterval: () => {},
    requestAnimationFrame: (fn) => { if (typeof fn === 'function') fn(); },
    alert: () => {}, fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; }, randomUUID: () => '00000000-0000-4000-8000-000000000000' },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
    parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined, Int8Array, Uint8Array, Buffer, Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function loadCtx(phase1) {
  const ctx = createVmContext(phase1);
  injectMarketEcologyIife(ctx);
  const src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { filename: 'talentRetention.js', timeout: 300_000 });
  if (phase1) {
    vm.runInContext(readFileSync(phase1Path, 'utf8'), ctx, { filename: 'shareCompressionPhase1.js' });
    vm.runInContext(readFileSync(rivalryPath, 'utf8'), ctx, { filename: 'rivalryPrototype.js' });
  }
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED, quick: false };
  for (const a of argv) {
    if (a === '--quick') { o.quick = true; o.runs = 3; }
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
  }
  return o;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

const RUN_IIFE = `
(function(MAX_STEPS){
  function commercialMetrics(stations,G){
    var comm=(stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'
        &&!stationIsNoncommercialInstitutional(s)&&s.rat&&typeof s.rat.share==='number';
    });
    var shares=comm.map(function(s){return Number(s.rat.share)||0;}).filter(function(x){return x>=0;});
    shares.sort(function(a,b){return b-a;});
    var sh1=shares[0]||0,top3=0,top5=0,hhi=0,ge10=0,ge6=0,i;
    for(i=0;i<shares.length;i++){
      if(i<3)top3+=shares[i];
      if(i<5)top5+=shares[i];
      hhi+=shares[i]*shares[i];
      if(shares[i]>=0.10)ge10++;
      if(shares[i]>=0.06)ge6++;
    }
    return {nComm:comm.length,share1:sh1,top3:top3,top5:top5,hhi:Math.round(hhi*10000),ge10:ge10,ge6:ge6,
      bookSum:shares.reduce(function(a,b){return a+b;},0)};
  }
  function econMetrics(G){
    var comm=(G.stations||[]).filter(function(s){return s&&!s._bpSlotDeferred&&!s.isPublic&&s.fin;});
    var rev=0,ebitda=0,weak=0,zombie=0,distress=0;
    comm.forEach(function(s){
      rev+=(s.fin.rev||0);
      ebitda+=(s.fin.ebitda||0);
      var h=typeof classifyCommercialHealthDiagnostic==='function'?classifyCommercialHealthDiagnostic(s):'';
      if(h==='weak')weak++;
      if(h==='zombie')zombie++;
      if(s.isZombie||s.isNicheSurvival)distress++;
    });
    var ps=(G.ps||[]).filter(function(s){return s&&s.isPlayer&&s.fin;});
    var pRev=0,pEbitda=0,pShare=0;
    ps.forEach(function(s){
      pRev+=(s.fin.rev||0);
      pEbitda+=(s.fin.ebitda||0);
      pShare+=(s.rat&&s.rat.share)||0;
    });
    return {commRev:rev,commEbitda:ebitda,weak:weak,zombie:zombie,distress:distress,
      playerRev:pRev,playerEbitda:pEbitda,playerShare:pShare,playerStations:ps.length};
  }
  function rivalryProxy(G){
    var map=G._rivalryProtoMap||{};
    var keys=Object.keys(map);
    var active=keys.filter(function(k){return map[k]&&map[k].active;}).length;
    return {rivalryActiveLanes:active};
  }
  function simToYear(marketId,y,seedVal){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    var sc=SC.find(function(x){return x.id==='chrwar';});
    var oi=sc.idx; sc.idx=[];
    G=genMarket('chrwar');
    sc.idx=oi;
    G.stations.forEach(function(st){st.isPlayer=false;});
    var ps=G.stations.filter(function(st){return st&&!st.isPublic&&st.format==='TOP40';});
    if(ps.length){ps[0].isPlayer=true; G.ps=[ps[0]];} else G.ps=[];
    var steps=0;
    while(steps<MAX_STEPS){
      if(G.year===y&&G.period===1)break;
      if(G.year>y)return {ok:false};
      var ui=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui.restore();}
      steps++;
    }
    if(G.year!==y)return {ok:false};
    return {ok:true,frozen:JSON.parse(JSON.stringify(G.stations)),econ:econMetrics(G),rivalry:rivalryProxy(G)};
  }
  function recalcFrozen(frozen,marketId,y){
    if(!G)G={news:[],acts:[]};
    var stations=JSON.parse(JSON.stringify(frozen));
    G.stations=stations; G.marketId=marketId; G.year=y; G.period=1;
    recalc(stations,G);
    if(typeof rivalryProtoRefreshMap==='function')rivalryProtoRefreshMap(G);
    return {
      conc:commercialMetrics(G.stations,G),
      massScale:G._shareCompressionMassScaleApplied||null,
    };
  }
  return {simToYear:simToYear,recalcFrozen:recalcFrozen};
})(${MAX_STEPS})
`;

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function summarizeConc(samples) {
  if (!samples.length) return null;
  return {
    share1: mean(samples.map((s) => s.share1)),
    top3: mean(samples.map((s) => s.top3)),
    top5: mean(samples.map((s) => s.top5)),
    hhi: mean(samples.map((s) => s.hhi)),
    ge10: mean(samples.map((s) => s.ge10)),
    ge6: mean(samples.map((s) => s.ge6)),
  };
}

function summarizeEcon(samples) {
  if (!samples.length) return null;
  return {
    commRev: mean(samples.map((s) => s.commRev)),
    commEbitda: mean(samples.map((s) => s.commEbitda)),
    weak: mean(samples.map((s) => s.weak)),
    zombie: mean(samples.map((s) => s.zombie)),
    distress: mean(samples.map((s) => s.distress)),
    playerRev: mean(samples.map((s) => s.playerRev)),
    playerEbitda: mean(samples.map((s) => s.playerEbitda)),
    playerShare: mean(samples.map((s) => s.playerShare)),
    rivalryActive: mean(samples.map((s) => s.rivalryActive)),
  };
}

function summarize(samples) {
  if (!samples.length) return null;
  return {
    share1: mean(samples.map((s) => s.conc.share1)),
    top3: mean(samples.map((s) => s.conc.top3)),
    top5: mean(samples.map((s) => s.conc.top5)),
    hhi: mean(samples.map((s) => s.conc.hhi)),
    ge10: mean(samples.map((s) => s.conc.ge10)),
    ge6: mean(samples.map((s) => s.conc.ge6)),
    commRev: mean(samples.map((s) => s.econ.commRev)),
    commEbitda: mean(samples.map((s) => s.econ.commEbitda)),
    weak: mean(samples.map((s) => s.econ.weak)),
    zombie: mean(samples.map((s) => s.econ.zombie)),
    distress: mean(samples.map((s) => s.econ.distress)),
    playerRev: mean(samples.map((s) => s.econ.playerRev)),
    playerEbitda: mean(samples.map((s) => s.econ.playerEbitda)),
    playerShare: mean(samples.map((s) => s.econ.playerShare)),
    rivalryActive: mean(samples.map((s) => s.rivalry.rivalryActiveLanes)),
    poachGunHeadlines: mean(samples.map((s) => s.rivalry.poachGunHeadlines)),
  };
}

function buildMarkdown(report) {
  const lines = [
    '# Share Compression Phase 1 Regression',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '**Prototype only** — tier L1 mass + LH blend 0.45 + OA leader relief ×0.70.',
    'Not a production fix; compare feel vs baseline.',
    '',
    '| Market | Year | Baseline #1 | Phase1 #1 | Δ#1 | Baseline top-3 | Phase1 top-3 | Δtop-3 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of report.cells) {
    const d1 = row.phase1.share1 != null && row.baseline.share1 != null
      ? (row.phase1.share1 - row.baseline.share1) * 100 : null;
    const d3 = row.phase1.top3 != null && row.baseline.top3 != null
      ? (row.phase1.top3 - row.baseline.top3) * 100 : null;
    lines.push(
      `| ${row.marketId} | ${row.year} | ${pct(row.baseline.share1)} | ${pct(row.phase1.share1)} | ${d1 != null ? `${d1 >= 0 ? '+' : ''}${d1.toFixed(1)} pt` : '—'} | ${pct(row.baseline.top3)} | ${pct(row.phase1.top3)} | ${d3 != null ? `${d3 >= 0 ? '+' : ''}${d3.toFixed(1)} pt` : '—'} |`,
    );
  }
  lines.push('', '## Economics & distress (means across cells)', '');
  lines.push('| Metric | Baseline | Phase1 | Δ |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const key of ['commRev', 'commEbitda', 'playerRev', 'playerEbitda', 'playerShare', 'weak', 'zombie', 'distress', 'rivalryActive']) {
    const b = report.aggregate.baseline[key];
    const p = report.aggregate.phase1[key];
    let delta = '—';
    if (b != null && p != null) {
      if (key.includes('Share')) delta = `${((p - b) * 100).toFixed(2)} pt`;
      else if (key === 'commRev' || key === 'commEbitda' || key === 'playerRev' || key === 'playerEbitda') {
        delta = `${Math.round(p - b).toLocaleString()}`;
      } else delta = `${(p - b).toFixed(2)}`;
    }
    const fmt = (v) => {
      if (v == null) return '—';
      if (key.includes('Share')) return pct(v);
      if (key === 'commRev' || key === 'commEbitda' || key === 'playerRev' || key === 'playerEbitda') return Math.round(v).toLocaleString();
      return v.toFixed(2);
    };
    lines.push(`| ${key} | ${fmt(b)} | ${fmt(p)} | ${delta} |`);
  }
  lines.push('', '## Playtest readiness', '', report.playtestNote);
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const baselineCtx = loadCtx(false);
  const phase1Ctx = loadCtx(true);
  vm.runInContext(`window.__shareReg=${RUN_IIFE}`, baselineCtx);
  vm.runInContext(`window.__shareReg=${RUN_IIFE}`, phase1Ctx);
  const simCellBase = (...a) => baselineCtx.__shareReg.simToYear(...a);
  const recalcBase = (...a) => baselineCtx.__shareReg.recalcFrozen(...a);
  const recalcP1 = (...a) => phase1Ctx.__shareReg.recalcFrozen(...a);

  const cells = args.quick ? CELLS.filter((c) => c.marketId === 'nashville' || c.marketId === 'newyork') : CELLS;
  const results = [];

  for (const cell of cells) {
    const baselineConc = [];
    const phase1Conc = [];
    const baselineEcon = [];
    const phase1Econ = [];
    for (let r = 0; r < args.runs; r++) {
      const seed = args.seed + marketSalt(cell.marketId) + cell.year * 17 + r * 991;
      const frozenRun = simCellBase(cell.marketId, cell.year, seed);
      if (!frozenRun?.ok) continue;
      const b = recalcBase(frozenRun.frozen, cell.marketId, cell.year);
      const p = recalcP1(frozenRun.frozen, cell.marketId, cell.year);
      baselineConc.push(b.conc);
      phase1Conc.push(p.conc);
      if (r === 0 && cell.marketId === 'nashville' && cell.year === 2003) {
        console.log('  debug massScale', p.massScale, 'phase1 #1', p.conc.share1, 'baseline', b.conc.share1);
      }
      if (r === 0) {
        baselineEcon.push(frozenRun.econ);
        phase1Econ.push(frozenRun.econ);
      }
    }
    const bSum = summarizeConc(baselineConc);
    const pSum = summarizeConc(phase1Conc);
    results.push({
      ...cell,
      runs: args.runs,
      baseline: { ...bSum, ...summarizeEcon(baselineEcon) },
      phase1: { ...pSum, ...summarizeEcon(phase1Econ) },
    });
    const d1 = bSum?.share1 != null && pSum?.share1 != null ? ((pSum.share1 - bSum.share1) * 100).toFixed(1) : '?';
    console.log(`${cell.marketId} ${cell.year}: baseline #1 ${pct(bSum?.share1)} → phase1 ${pct(pSum?.share1)} (${d1} pt)`);
  }

  const aggBaseline = summarizeEcon(results.map((r) => r.baseline));
  const aggPhase1 = summarizeEcon(results.map((r) => r.phase1));
  aggBaseline.share1 = mean(results.map((r) => r.baseline?.share1));
  aggBaseline.top3 = mean(results.map((r) => r.baseline?.top3));
  aggPhase1.share1 = mean(results.map((r) => r.phase1?.share1));
  aggPhase1.top3 = mean(results.map((r) => r.phase1?.top3));

  const report = {
    generatedAt: new Date().toISOString(),
    branch: 'prototype/share-compression-phase1',
    config: phase1Ctx.shareCompressionPhase1Config ? phase1Ctx.shareCompressionPhase1Config() : null,
    runs: args.runs,
    seed: args.seed,
    cells: results,
    aggregate: { baseline: aggBaseline, phase1: aggPhase1 },
    playtestNote: 'Broad 2–4 pt #1 compression expected on medium markets; revenue/EBITDA should remain playable. Manual playtest via npm run dev with play.html flags. Not Duncan-real.',
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, buildMarkdown(report));
  console.log(`Wrote ${outMd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
