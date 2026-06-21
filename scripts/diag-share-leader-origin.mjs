#!/usr/bin/env node
/**
 * Leader share-origin audit — where does the final #1 displayed share come from?
 *
 * Empirical decomposition across many frozen-book recalc runs. Pins the eventual
 * final #1 station and traces its headline share through L1 → post-L1 layers.
 *
 *   node scripts/diag-share-leader-origin.mjs
 *   node scripts/diag-share-leader-origin.mjs --quick
 *
 * Artifacts: tmp/share_leader_origin.json, tmp/share_leader_origin.md
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
  patchLeaderOriginCapture,
  LAYER_LABELS,
  DUNCAN_AQH_ENVELOPES,
  envelopeFor,
  pct,
  mean,
  marketSalt,
} from './diag-share-decomposition-lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'share_leader_origin.json');
const outMd = path.join(root, 'tmp', 'share_leader_origin.md');

const MAX_STEPS = 360;
const DEFAULT_RUNS = 16;
const DEFAULT_SEED = 20260628;

const CELLS = [
  { marketId: 'newyork', year: 2003, primary: true },
  { marketId: 'newyork', year: 2010, primary: true },
  { marketId: 'nashville', year: 2003, primary: true },
  { marketId: 'nashville', year: 2010, primary: true },
  { marketId: 'atlanta', year: 2010, primary: true },
  { marketId: 'phoenix', year: 2026, primary: false },
  { marketId: 'chicago', year: 2010, primary: false },
  { marketId: 'losangeles', year: 2010, primary: false },
];

const GRID_ENVELOPES = {
  ...DUNCAN_AQH_ENVELOPES,
  chicago: { 2010: { share1: [5.5, 7.5], top3: [14, 20] } },
  losangeles: { 2010: { share1: [5.5, 7.5], top3: [14, 20] } },
  phoenix: {
    ...DUNCAN_AQH_ENVELOPES.phoenix,
    2026: { share1: [8, 11], top3: [20, 26] },
  },
};

/** User-facing stages mapped to decomp layer keys. */
const STAGE_LAYERS = [
  { key: 'L1_postCohort', label: 'L1 cohort appeal' },
  { key: 'L3_postHabitReconcile', label: 'After long-tail + habit' },
  { key: 'L4_postOtherAudio', label: 'Other audio' },
  { key: 'L5_postListeningHours', label: 'Listening hours' },
  { key: 'L6_postTrimBoost', label: 'Trim / boosts' },
  { key: 'L8_final', label: 'Final (sanitize + endgame)' },
];

const DELTA_GROUPS = [
  { key: 'l1Base', label: 'L1 base (absolute)', from: null, to: 'L1_postCohort' },
  { key: 'preL1Reconcile', label: 'Long-tail + habit', from: 'L1_postCohort', to: 'L3_postHabitReconcile' },
  { key: 'otherAudio', label: 'Other audio', from: 'L3_postHabitReconcile', to: 'L4_postOtherAudio' },
  { key: 'listeningHours', label: 'Listening hours', from: 'L4_postOtherAudio', to: 'L5_postListeningHours' },
  { key: 'trim', label: 'Trim / boosts', from: 'L5_postListeningHours', to: 'L6_postTrimBoost' },
  { key: 'endgame', label: 'Sanitize + endgame', from: 'L6_postTrimBoost', to: 'L8_final' },
];

function gridEnvelope(marketId, year) {
  const m = GRID_ENVELOPES[marketId];
  if (!m) return envelopeFor(marketId, year);
  if (m[year]) return m[year];
  const keys = Object.keys(m).map(Number).sort((a, b) => a - b);
  let best = keys[0];
  for (const k of keys) {
    if (k <= year) best = k;
  }
  return m[best] || null;
}

function bandDistance(valPct, band) {
  if (valPct == null || !band) return null;
  if (valPct >= band[0] && valPct <= band[1]) return 0;
  if (valPct < band[0]) return band[0] - valPct;
  return valPct - band[1];
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
  src = patchLeaderOriginCapture(patchLegacyForShareDecomp(src));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

const RUN_IIFE = `
(function(MAX_STEPS){
  function isCommercial(s){
    return s&&!s._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'&&!stationIsNoncommercialInstitutional(s)&&s.rat;
  }
  function topCommercial(stations){
    var comm=stations.filter(isCommercial);
    comm.sort(function(a,b){return (Number(b.rat.share)||0)-(Number(a.rat.share)||0);});
    return comm[0]||null;
  }
  function shareOf(stations,id){
    var s=stations.find(function(x){return x.id===id;});
    return s&&s.rat?Number(s.rat.share)||0:null;
  }
  function layerVal(layers,key,field){
    var row=layers.find(function(l){return l.layer===key;});
    return row?row[field]:null;
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
    G.ps=[];
    var steps=0;
    while(steps<MAX_STEPS){
      if(G.year===y&&G.period===1)break;
      if(G.year>y)return {ok:false};
      var ui=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui.restore();}
      steps++;
    }
    if(G.year!==y||G.period!==1)return {ok:false};
    return {ok:true,frozen:JSON.parse(JSON.stringify(G.stations))};
  }
  function runOrigin(frozen,marketId,y){
    var stations=JSON.parse(JSON.stringify(frozen));
    G.stations=stations; G.marketId=marketId; G.year=y; G.period=1;
    G._shareDecompActive=true; G._shareDecompLayers=[]; G._shareOriginPinId=null;
    recalc(stations,G);
    var finalLead=topCommercial(stations);
    if(!finalLead)return {ok:false,err:'no_leader'};
    var finalId=finalLead.id;
    var marketLayers=(G._shareDecompLayers||[]).map(function(l){
      return {layer:l.layer,marketShare1:l.share1,marketTop3:l.top3};
    });
    var frozenPreShare=shareOf(frozen,finalId);
    var frozenLeader=topCommercial(frozen);
    var l1WasLeader=!!(frozenLeader&&frozenLeader.id===finalId);

    stations=JSON.parse(JSON.stringify(frozen));
    G.stations=stations; G.marketId=marketId; G.year=y; G.period=1;
    G._shareDecompActive=true; G._shareDecompLayers=[]; G._shareOriginPinId=finalId;
    recalc(stations,G);
    var layers=G._shareDecompLayers||[];
    var pinned={};
    var layerKeys=${JSON.stringify(STAGE_LAYERS.map((s) => s.key))};
    for(var i=0;i<layerKeys.length;i++){
      pinned[layerKeys[i]]=layerVal(layers,layerKeys[i],'pinnedShare');
    }
    return {
      ok:true,
      finalId:finalId,
      finalCall:String(finalLead.callLetters||''),
      finalFormat:String(finalLead.format||''),
      frozenPreShare:frozenPreShare,
      pinned:pinned,
      marketLayers:marketLayers,
      l1WasLeader:l1WasLeader,
      finalShare:pinned.L8_final,
      marketShare1Final:layerVal(layers,'L8_final','share1'),
    };
  }
  return {simToYear:simToYear,runOrigin:runOrigin};
})(${MAX_STEPS})
`;

function parseArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED, quick: false };
  for (const a of argv) {
    if (a === '--quick') {
      o.quick = true;
      o.runs = 4;
      o.cells = CELLS.filter((c) => c.marketId === 'nashville' || c.marketId === 'newyork');
    } else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
  }
  o.cells = o.cells || CELLS;
  return o;
}

function computeAttribution(run) {
  const p = run.pinned;
  const final = p.L8_final;
  if (final == null) return null;

  const stages = {};
  for (const s of STAGE_LAYERS) {
    stages[s.key] = p[s.key];
  }

  const deltas = {};
  for (const g of DELTA_GROUPS) {
    if (g.key === 'l1Base') {
      deltas[g.key] = p.L1_postCohort;
      continue;
    }
    const a = p[g.from];
    const b = p[g.to];
    deltas[g.key] = a != null && b != null ? b - a : null;
  }

  const postL1 = final - (p.L1_postCohort ?? final);
  return { stages, deltas, final, postL1, frozenPreShare: run.frozenPreShare };
}

function aggregateRuns(runs) {
  const attrs = runs.map(computeAttribution).filter(Boolean);
  if (!attrs.length) return null;

  const meanDelta = (k) => mean(attrs.map((a) => a.deltas[k]).filter((x) => x != null));
  const meanStage = (k) => mean(attrs.map((a) => a.stages[k]).filter((x) => x != null));

  const final = meanStage('L8_final');
  const d = {};
  for (const g of DELTA_GROUPS) {
    d[g.key] = g.key === 'l1Base' ? meanStage('L1_postCohort') : meanDelta(g.key);
  }

  const pctOfFinal = {};
  if (final) {
    for (const g of DELTA_GROUPS) {
      if (g.key === 'l1Base') pctOfFinal[g.key] = (d.l1Base / final) * 100;
      else pctOfFinal[g.key] = ((d[g.key] || 0) / final) * 100;
    }
  }

  const stageMeans = {};
  for (const s of STAGE_LAYERS) {
    stageMeans[s.key] = meanStage(s.key);
  }

  return {
    n: attrs.length,
    finalShare: final,
    frozenPreShare: mean(attrs.map((a) => a.frozenPreShare).filter((x) => x != null)),
    l1Share: d.l1Base,
    stageMeans,
    deltas: d,
    postL1Net: mean(attrs.map((a) => a.postL1)),
    pctOfFinal,
    l1WasLeaderRate: mean(runs.map((r) => (r.l1WasLeader ? 1 : 0))),
  };
}

function fmtPt(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(2)}%`;
}

function fmtDelta(x) {
  if (x == null || Number.isNaN(x)) return '—';
  const pp = x * 100;
  return `${pp >= 0 ? '+' : ''}${pp.toFixed(2)} pt`;
}

function buildMarkdown(report) {
  const lines = [
    '# Leader Share-Origin Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Traces the **eventual final #1** station through each recalc checkpoint (pinned id).',
    'Production-like pipeline — no tier mass-scale, no OQ/appeal overrides.',
    `Runs per cell: ${report.runs} · Total runs: ${report.totalRuns}`,
    '',
    '## Question answered',
    '',
    'Where does a typical #1 leader\'s displayed share come from — empirically, averaged across runs?',
    '',
  ];

  for (const cell of report.cells) {
    const key = `${cell.marketId}|${cell.year}`;
    const agg = report.aggregates[key];
    if (!agg) continue;
    const env = gridEnvelope(cell.marketId, cell.year);
    lines.push(`### ${cell.marketId} · ${cell.year}${cell.primary ? '' : ' (validation)'}`);
    if (env?.share1) {
      lines.push(`Duncan #1: ${env.share1[0]}–${env.share1[1]}% · top-3: ${env.top3?.join('–')}%`);
    }
    lines.push('');
    lines.push(`Average final #1: **${pct(agg.finalShare)}** · L1 base: **${pct(agg.l1Share)}** · Post-L1 net: **${fmtDelta(agg.postL1Net)}**`);
    lines.push(`Final #1 was also frozen-book leader: ${pct(agg.l1WasLeaderRate, 0)} of runs`);
    lines.push('');
    lines.push('| Stage | Leader share after | Δ from prior | % of final share |');
    lines.push('| --- | ---: | ---: | ---: |');

    let prev = agg.frozenPreShare;
    if (prev != null) {
      lines.push(`| Frozen pre-recalc | ${pct(prev)} | — | ${((prev / agg.finalShare) * 100).toFixed(0)}% |`);
    }

    for (const s of STAGE_LAYERS) {
      const share = agg.stageMeans[s.key];
      const dg = DELTA_GROUPS.find((g) => g.to === s.key);
      const delta = dg && dg.key !== 'l1Base' ? agg.deltas[dg.key] : null;
      const pctFinal = share != null && agg.finalShare ? (share / agg.finalShare) * 100 : null;
      lines.push(
        `| ${s.label} | ${pct(share)} | ${delta != null ? fmtDelta(delta) : '—'} | ${pctFinal != null ? `${pctFinal.toFixed(0)}%` : '—'} |`,
      );
    }
    lines.push(`| **Final display** | **${pct(agg.finalShare)}** | — | 100% |`);
    lines.push('');

    if (env?.top3) {
      const mkt = report.marketAggregates[key];
      if (mkt) {
        lines.push(`Market top-3 (book leader, not pinned): ${pct(mkt.finalTop3)} · d(top-3) ${bandDistance(mkt.finalTop3 * 100, env.top3)?.toFixed(1) ?? '—'} pt`);
        lines.push('');
      }
    }
  }

  lines.push('## Cross-market summary (primary cells)');
  lines.push('');
  lines.push('| Market | Final #1 | L1 base | +LH | +Trim | +Endgame | Post-L1 net | Duncan #1 d |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const cell of report.cells.filter((c) => c.primary)) {
    const key = `${cell.marketId}|${cell.year}`;
    const agg = report.aggregates[key];
    if (!agg) continue;
    const env = gridEnvelope(cell.marketId, cell.year);
    const d1 = bandDistance(agg.finalShare * 100, env?.share1);
    lines.push(
      `| ${cell.marketId} ${cell.year} | ${pct(agg.finalShare)} | ${pct(agg.l1Share)} | ${fmtDelta(agg.deltas.listeningHours)} | ${fmtDelta(agg.deltas.trim)} | ${fmtDelta(agg.deltas.endgame)} | ${fmtDelta(agg.postL1Net)} | ${d1?.toFixed(1) ?? '—'} |`,
    );
  }

  lines.push('');
  lines.push('## Layer reference');
  for (const [k, v] of Object.entries(LAYER_LABELS)) {
    lines.push(`- \`${k}\`: ${v}`);
  }
  lines.push('');
  lines.push('## Reading');
  lines.push('');
  lines.push(report.reading);
  lines.push('');
  return lines.join('\n');
}

function buildReading(aggregates) {
  const nash = aggregates['nashville|2003'];
  const nyc = aggregates['newyork|2003'];
  if (!nash || !nyc) return '';

  return [
    `Nashville 2003: final #1 averages **${pct(nash.finalShare)}** (Duncan 7–9%). `
      + `**${nash.pctOfFinal?.l1Base?.toFixed(0) ?? '—'}%** of that is already present at L1 (${pct(nash.l1Share)}); `
      + `post-L1 layers add **${fmtDelta(nash.postL1Net)}** net — listening hours **${fmtDelta(nash.deltas.listeningHours)}**, `
      + `trim **${fmtDelta(nash.deltas.trim)}**, other audio **${fmtDelta(nash.deltas.otherAudio)}**.`,
    `NYC 2003: final **${pct(nyc.finalShare)}** vs L1 **${pct(nyc.l1Share)}**; LH **${fmtDelta(nyc.deltas.listeningHours)}**, trim **${fmtDelta(nyc.deltas.trim)}**.`,
    'OQ/appeal audits showed eliminating elite quality barely moves these numbers — the increments above are the empirical source of displayed concentration.',
  ].join('\n\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  console.log('[share-leader-origin] loading VM…');
  const ctx = loadCtx();
  const api = vm.runInContext(RUN_IIFE, ctx);

  const raw = [];
  let failures = 0;

  for (const cell of opts.cells) {
    console.log(`==> ${cell.marketId} ${cell.year}`);
    const runs = [];
    for (let run = 0; run < opts.runs; run++) {
      const seed = opts.seed + marketSalt(cell.marketId) * 17 + cell.year * 10007 + run * 9973;
      const sim = api.simToYear(cell.marketId, cell.year, seed);
      if (!sim.ok) {
        failures++;
        continue;
      }
      const r = api.runOrigin(sim.frozen, cell.marketId, cell.year);
      if (!r.ok) {
        failures++;
        continue;
      }
      runs.push(r);
      raw.push({ marketId: cell.marketId, year: cell.year, run, ...r });
    }
    console.log(`  ${runs.length}/${opts.runs} ok · final #1 avg ${pct(mean(runs.map((x) => x.finalShare)))}`);
  }

  const aggregates = {};
  const marketAggregates = {};
  for (const cell of opts.cells) {
    const key = `${cell.marketId}|${cell.year}`;
    const runs = raw.filter((r) => r.marketId === cell.marketId && r.year === cell.year);
    aggregates[key] = aggregateRuns(runs);
    marketAggregates[key] = {
      finalTop3: mean(runs.map((r) => {
        const l = r.marketLayers?.find((x) => x.layer === 'L8_final');
        return l?.marketTop3;
      })),
      finalShare1: mean(runs.map((r) => r.marketShare1Final)),
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runs: opts.runs,
    totalRuns: raw.length,
    failureCount: failures,
    cells: opts.cells,
    aggregates,
    marketAggregates,
    rawSample: raw.slice(0, 3),
    reading: buildReading(aggregates),
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outMd, `${buildMarkdown(report)}\n`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
}

main();
