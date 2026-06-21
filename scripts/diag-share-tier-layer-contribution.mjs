#!/usr/bin/env node
/**
 * Tier-scaled layer contribution audit — otherAudio + listeningHours focus.
 * Quantifies Δ#1 and Δtop-3 per pipeline layer, rolled up by market tier × era.
 *
 *   node scripts/diag-share-tier-layer-contribution.mjs
 *   node scripts/diag-share-tier-layer-contribution.mjs --quick
 *
 * Artifacts: tmp/share_layer_contribution.json, .md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  injectHeadlessLaunchNewsGuard,
  patchLegacyForShareDecomp,
  patchPostL1Skips,
  patchDiagnosticRetunes,
  LAYER_LABELS,
  eraBucket,
  ERA_LABELS,
  pct,
  mean,
  marketSalt,
} from './diag-share-decomposition-lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'share_layer_contribution.json');
const outMd = path.join(root, 'tmp', 'share_layer_contribution.md');

const MAX_STEPS = 340;
const DEFAULT_MARKETS = ['newyork', 'losangeles', 'phoenix', 'atlanta', 'nashville', 'wichita'];
const DEFAULT_YEARS = [1995, 2003, 2010, 2020];
const DEFAULT_RUNS = 6;
const DEFAULT_SEED = 20260625;

const LAYER_CHAIN = [
  ['L1_postCohort', 'L2_postLongTail', 'longTail'],
  ['L2_postLongTail', 'L3_postHabitReconcile', 'habit'],
  ['L3_postHabitReconcile', 'L4_postOtherAudio', 'otherAudio'],
  ['L4_postOtherAudio', 'L5_postListeningHours', 'listeningHours'],
  ['L5_postListeningHours', 'L6_postTrimBoost', 'trim'],
  ['L6_postTrimBoost', 'L7_postSanitize', 'sanitize'],
  ['L7_postSanitize', 'L8_final', 'finalRepair'],
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

function createVmContext() {
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: console.error, table: () => {} },
    __WL_HEADLESS__: true, globalThis: null, window: null, document: documentStub,
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

function loadCtx() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  src = patchLegacyForShareDecomp(patchPostL1Skips(patchDiagnosticRetunes(src)));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { markets: DEFAULT_MARKETS, years: DEFAULT_YEARS, runs: DEFAULT_RUNS, seed: DEFAULT_SEED };
  for (const a of argv) {
    if (a === '--quick') {
      o.markets = ['newyork', 'nashville', 'phoenix'];
      o.years = [2003, 2010];
      o.runs = 4;
    } else if (a.startsWith('--markets=')) {
      o.markets = a.slice(10).split(',').map((x) => x.trim()).filter(Boolean);
    } else if (a.startsWith('--years=')) {
      o.years = a.slice(8).split(',').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
    } else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
  }
  return o;
}

function layerVal(layers, key, field) {
  const row = layers.find((l) => l.layer === key);
  return row ? row[field] : null;
}

function layerDelta(layers, fromKey, toKey, field) {
  const a = layerVal(layers, fromKey, field);
  const b = layerVal(layers, toKey, field);
  if (a == null || b == null) return null;
  return b - a;
}

function computeDeltas(layers) {
  const out = { l1Share1: layerVal(layers, 'L1_postCohort', 'share1'), l8Share1: layerVal(layers, 'L8_final', 'share1') };
  out.l1Top3 = layerVal(layers, 'L1_postCohort', 'top3');
  out.l8Top3 = layerVal(layers, 'L8_final', 'top3');
  out.postL1Share1 = out.l8Share1 != null && out.l1Share1 != null ? out.l8Share1 - out.l1Share1 : null;
  out.postL1Top3 = out.l8Top3 != null && out.l1Top3 != null ? out.l8Top3 - out.l1Top3 : null;
  for (const [, , key] of LAYER_CHAIN) {
    out[`d${key.charAt(0).toUpperCase()}${key.slice(1)}Share1`] = null;
    out[`d${key.charAt(0).toUpperCase()}${key.slice(1)}Top3`] = null;
  }
  for (const [from, to, key] of LAYER_CHAIN) {
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    out[`d${cap}Share1`] = layerDelta(layers, from, to, 'share1');
    out[`d${cap}Top3`] = layerDelta(layers, from, to, 'top3');
  }
  out.otherAudioF = layerVal(layers, 'L4_postOtherAudio', 'otherAudioF');
  out.otherAudioLeaderRelief = layerVal(layers, 'L4_postOtherAudio', 'otherAudioLeaderRelief');
  return out;
}

function bucketKey(tier, era) {
  return `${tier}|${era}`;
}

function rollupAdd(bucket, sample) {
  if (!bucket.n) bucket.n = 0;
  bucket.n += 1;
  for (const [k, v] of Object.entries(sample)) {
    if (v == null || Number.isNaN(v)) continue;
    if (!bucket[k]) bucket[k] = [];
    bucket[k].push(v);
  }
}

function rollupMeans(bucket) {
  const out = { n: bucket.n || 0, tier: bucket.tier, era: bucket.era };
  for (const [k, xs] of Object.entries(bucket)) {
    if (k === 'n' || k === 'tier' || k === 'era' || !Array.isArray(xs)) continue;
    out[k] = mean(xs);
  }
  return out;
}

const RUN_IIFE = `
(function(MAX_STEPS){
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
    G.ps=[];
    var steps=0;
    while(steps<MAX_STEPS){
      if(G.year===y&&G.period===1)break;
      if(G.year>y)return {ok:false};
      var ui=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui.restore();}
      steps++;
    }
    if(G.year!==y)return {ok:false};
    var tier=(MARKETS[marketId]||{}).rankTier||'medium';
    return {ok:true,frozen:JSON.parse(JSON.stringify(G.stations)),tier:tier};
  }
  function runTierScaled(frozen,marketId,y){
    var stations=JSON.parse(JSON.stringify(frozen));
    G.stations=stations; G.marketId=marketId; G.year=y; G.period=1;
    G._shareDecompActive=true; G._shareDecompLayers=[];
    G._diagCommercialMassScaleTier=true;
    recalc(stations,G);
    return {layers:G._shareDecompLayers||[],scale:G._diagCommercialMassScaleApplied};
  }
  return {simToYear:simToYear,runTierScaled:runTierScaled};
})(${MAX_STEPS})
`;

function buildMarkdown(report) {
  const lines = [
    '# Tier-scaled layer contribution (otherAudio + listeningHours)',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'All runs use corrected tier L1 mass scale (`mega 0.58`, `large 0.64`, `medium 0.78≤1998 else 0.55`, `small 0.52`).',
    'Layer deltas are **after − before** on commercial #1 share and top-3 sum.',
    '',
    '## Rollup by market tier × era',
    '',
    '| Tier | Era | n | L1 #1 | Final #1 | Post-L1 Δ#1 | **otherAudio Δ#1** | **LH Δ#1** | otherAudio Δtop-3 | LH Δtop-3 | Post-L1 Δtop-3 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const row of report.rollupRows) {
    lines.push(
      `| ${row.tier} | ${ERA_LABELS[row.era] || row.era} | ${row.n} | ${pct(row.l1Share1)} | ${pct(row.l8Share1)} | ${fmtPt(row.postL1Share1)} | **${fmtPt(row.dOtherAudioShare1)}** | **${fmtPt(row.dListeningHoursShare1)}** | ${fmtPt(row.dOtherAudioTop3)} | ${fmtPt(row.dListeningHoursTop3)} | ${fmtPt(row.postL1Top3)} |`,
    );
  }

  lines.push('', '## Per-cell detail (tier-scaled full pipeline)', '');
  for (const cell of report.cells) {
    lines.push(`### ${cell.marketId} · ${cell.year} (${cell.tier}, ${ERA_LABELS[cell.era]})`);
    lines.push(`L1 scale applied: ${cell.scaleApplied ?? '—'}`);
    lines.push('');
    lines.push('| Layer step | Δ#1 | Δtop-3 |');
    lines.push('| --- | ---: | ---: |');
    for (const [, , key] of LAYER_CHAIN) {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      lines.push(`| ${key} | ${fmtPt(cell[`d${cap}Share1`])} | ${fmtPt(cell[`d${cap}Top3`])} |`);
    }
    lines.push(`| **post-L1 total** | ${fmtPt(cell.postL1Share1)} | ${fmtPt(cell.postL1Top3)} |`);
    lines.push(`| L1 #1 → final | ${pct(cell.l1Share1)} → ${pct(cell.l8Share1)} | top-3 ${pct(cell.l1Top3)} → ${pct(cell.l8Top3)} |`);
    lines.push('');
  }

  lines.push('## Layer labels');
  for (const [k, v] of Object.entries(LAYER_LABELS)) lines.push(`- \`${k}\`: ${v}`);
  lines.push('');
  return lines.join('\n');
}

function fmtPt(x) {
  if (x == null || Number.isNaN(x)) return '—';
  const pp = x * 100;
  return `${pp >= 0 ? '+' : ''}${pp.toFixed(2)} pt`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  console.log('Loading legacy + tier scale + layer hooks…');
  const ctx = loadCtx();
  const api = vm.runInContext(RUN_IIFE, ctx);
  const cells = [];
  const rollup = {};

  for (const marketId of opts.markets) {
    for (const year of opts.years) {
      console.log(`==> ${marketId} ${year}`);
      const samples = [];
      let tier = 'medium';
      let scaleApplied = null;

      for (let run = 0; run < opts.runs; run++) {
        const sim = api.simToYear(marketId, year, opts.seed + marketSalt(marketId) * 17 + year * 10007 + run * 9973);
        if (!sim.ok) continue;
        tier = sim.tier || tier;
        const r = api.runTierScaled(sim.frozen, marketId, year);
        scaleApplied = r.scale;
        const deltas = computeDeltas(r.layers);
        samples.push(deltas);
      }

      if (!samples.length) continue;

      const era = eraBucket(year);
      const cell = {
        marketId,
        year,
        tier,
        era,
        scaleApplied,
        runs: samples.length,
      };
      for (const key of Object.keys(samples[0])) {
        cell[key] = mean(samples.map((s) => s[key]));
      }
      cells.push(cell);

      const bk = bucketKey(tier, era);
      if (!rollup[bk]) rollup[bk] = { tier, era };
      for (const s of samples) rollupAdd(rollup[bk], s);
    }
  }

  const rollupRows = Object.values(rollup)
    .map(rollupMeans)
    .sort((a, b) => {
      const tierOrder = { mega: 0, large: 1, medium: 2, small: 3 };
      const eraOrder = { pre2000: 0, '2000s': 1, '2010plus': 2 };
      return (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9) || (eraOrder[a.era] ?? 9) - (eraOrder[b.era] ?? 9);
    });

  const report = {
    generatedAt: new Date().toISOString(),
    config: opts,
    rollupRows,
    cells,
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outMd, `${buildMarkdown(report)}\n`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);

  for (const row of rollupRows) {
    console.log(
      `  ${row.tier} ${ERA_LABELS[row.era]}: OA ${fmtPt(row.dOtherAudioShare1)} #1, LH ${fmtPt(row.dListeningHoursShare1)} #1, post-L1 ${fmtPt(row.postL1Share1)}`,
    );
  }
}

main();
