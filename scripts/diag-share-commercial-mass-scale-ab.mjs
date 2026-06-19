#!/usr/bin/env node
/**
 * Tier-scaled commercial mass scale A/B — diagnostic only.
 *
 * After L1 cohort equilibrium, optionally scales commercial AQH mass before
 * long-tail / otherAudio / listeningHours. Tests Duncan-calibrated envelopes.
 *
 *   node scripts/diag-share-commercial-mass-scale-ab.mjs
 *   node scripts/diag-share-commercial-mass-scale-ab.mjs --quick
 *
 * Artifacts: tmp/share_commercial_mass_scale_ab.json, .md
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
  patchAppealExponent,
  DUNCAN_AQH_ENVELOPES,
  envelopeFor,
  pct,
  inBand,
  mean,
  marketSalt,
} from './diag-share-decomposition-lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'share_commercial_mass_scale_ab.json');
const outMd = path.join(root, 'tmp', 'share_commercial_mass_scale_ab.md');

const MAX_STEPS = 340;
const DEFAULT_MARKETS = ['newyork', 'nashville', 'phoenix', 'atlanta'];
const DEFAULT_YEARS = [1995, 2003, 2010];
const DEFAULT_RUNS = 6;
const DEFAULT_SEED = 20260624;

/** Research variants — flags applied on frozen book before instrumented recalc. */
const VARIANTS = {
  A: { label: 'Baseline', flags: {} },
  B: { label: 'Global scale 0.75', flags: { _diagCommercialMassScale: 0.75 } },
  C: { label: 'Global scale 0.65', flags: { _diagCommercialMassScale: 0.65 } },
  D: {
    label: 'Tier era-aware (mega 0.58, medium 0.78≤1998 else 0.55)',
    flags: { _diagCommercialMassScaleTier: true },
  },
  E: {
    label: 'Tier era-aware + skip listeningHours',
    flags: { _diagCommercialMassScaleTier: true, _diagSkipListeningHours: true },
  },
  F: { label: 'Appeal p=0.88', flags: { _diagAppealQExponent: 0.88 } },
  G: {
    label: 'Tier era-aware + appeal p=0.92',
    flags: { _diagCommercialMassScaleTier: true, _diagAppealQExponent: 0.92 },
  },
  H: { label: 'Skip listeningHours only', flags: { _diagSkipListeningHours: true } },
};

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
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; }, clearTimeout() {}, clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {}, fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} }, FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      },
    },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
    parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    Int8Array, Uint8Array, Buffer, Promise,
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
  src = patchAppealExponent(patchLegacyForShareDecomp(patchPostL1Skips(src)));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = {
    markets: DEFAULT_MARKETS,
    years: DEFAULT_YEARS,
    runs: DEFAULT_RUNS,
    seed: DEFAULT_SEED,
  };
  for (const a of argv) {
    if (a === '--quick') {
      o.markets = ['newyork', 'nashville'];
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

function scoreVariant(row, envelope) {
  if (!envelope) return 0;
  let score = 0;
  if (inBand(row.finalShare1 * 100, envelope.share1)) score += 3;
  if (inBand(row.finalTop3 * 100, envelope.top3)) score += 2;
  if (inBand(row.finalGe10, envelope.ge10)) score += 1;
  if (inBand(row.finalGe6, envelope.ge6)) score += 1;
  return score;
}

function buildMarkdown(report) {
  const lines = [
    '# Commercial Mass Scale A/B',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Post-L1 commercial mass scaling + optional post-layer skips vs Duncan AQH envelopes.',
    '',
  ];

  for (const cell of report.cells) {
    lines.push(`## ${cell.marketId} · ${cell.year}`);
    if (cell.envelope?.note) lines.push(`Duncan: ${cell.envelope.note}`);
    lines.push(`#1 band: ${cell.envelope?.share1?.join('–')}% · top-3: ${cell.envelope?.top3?.join('–')}%`);
    lines.push('');
    lines.push('| Variant | L1 #1 | Final #1 | top-3 | ≥10% | Duncan score |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const row of cell.rows) {
      lines.push(
        `| ${row.label} | ${pct(row.l1Share1)} | ${pct(row.finalShare1)} | ${pct(row.finalTop3)} | ${row.finalGe10?.toFixed(1) ?? '—'} | ${row.score}/7 |`,
      );
    }
    if (cell.best) {
      lines.push('');
      lines.push(`**Best variant:** ${cell.best.label} (score ${cell.best.score}/7, #1 ${pct(cell.best.finalShare1)})`);
    }
    lines.push('');
  }

  lines.push('## Tier scale table (variant D/E/G)');
  lines.push('- mega: 0.58');
  lines.push('- large: 0.64');
  lines.push('- medium: 0.78 if year ≤ 1998, else 0.55');
  lines.push('- small: 0.52');
  lines.push('');
  return lines.join('\n');
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
    return {ok:true,frozen:JSON.parse(JSON.stringify(G.stations))};
  }
  function applyFlags(flags){
    G._diagCommercialMassScale=undefined;
    G._diagCommercialMassScaleTier=false;
    G._diagAppealQExponent=undefined;
    G._diagSkipLongTail=false;
    G._diagSkipOtherAudio=false;
    G._diagSkipListeningHours=false;
    G._diagSkipTrimBoost=false;
    if(!flags)return;
    Object.keys(flags).forEach(function(k){G[k]=flags[k];});
  }
  function runVariant(frozen,marketId,y,flags){
    var stations=JSON.parse(JSON.stringify(frozen));
    G.stations=stations; G.marketId=marketId; G.year=y; G.period=1;
    G._shareDecompActive=true; G._shareDecompLayers=[];
    applyFlags(flags);
    recalc(stations,G);
    var l1=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L1_postCohort';});
    var fin=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L8_final';});
    return {
      scaleApplied:G._diagCommercialMassScaleApplied,
      l1:l1,
      final:fin,
    };
  }
  return {simToYear:simToYear,runVariant:runVariant};
})(${MAX_STEPS})
`;

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  console.log('Loading legacy + mass scale / layer skip hooks…');
  const ctx = loadCtx();
  const api = vm.runInContext(RUN_IIFE, ctx);
  const cells = [];

  for (const marketId of opts.markets) {
    for (const year of opts.years) {
      console.log(`==> ${marketId} ${year}`);
      const byVariant = {};
      for (const key of Object.keys(VARIANTS)) byVariant[key] = { l1: [], final: [] };

      for (let run = 0; run < opts.runs; run++) {
        const sim = api.simToYear(marketId, year, opts.seed + marketSalt(marketId) * 17 + year * 10007 + run * 9973);
        if (!sim.ok) continue;
        for (const [vkey, vdef] of Object.entries(VARIANTS)) {
          const r = api.runVariant(sim.frozen, marketId, year, vdef.flags);
          if (r.l1) byVariant[vkey].l1.push(r.l1);
          if (r.final) byVariant[vkey].final.push(r.final);
        }
      }

      const envelope = envelopeFor(marketId, year);
      const rows = Object.entries(VARIANTS).map(([vkey, vdef]) => {
        const row = {
          variant: vkey,
          label: vdef.label,
          l1Share1: mean(byVariant[vkey].l1.map((x) => x.share1)),
          finalShare1: mean(byVariant[vkey].final.map((x) => x.share1)),
          finalTop3: mean(byVariant[vkey].final.map((x) => x.top3)),
          finalGe10: mean(byVariant[vkey].final.map((x) => x.ge10)),
          finalGe6: mean(byVariant[vkey].final.map((x) => x.ge6)),
        };
        row.score = scoreVariant(row, envelope);
        return row;
      });

      rows.sort((a, b) => b.score - a.score || Math.abs(a.finalShare1 - (envelope?.share1?.[0] ?? 0) / 100) - Math.abs(b.finalShare1 - (envelope?.share1?.[0] ?? 0) / 100));
      cells.push({ marketId, year, envelope, rows, best: rows[0] || null });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: opts,
    variants: VARIANTS,
    cells,
    duncanEnvelopes: DUNCAN_AQH_ENVELOPES,
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outMd, `${buildMarkdown(report)}\n`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);

  for (const cell of cells) {
    if (!cell.best) continue;
    console.log(
      `  ${cell.marketId} ${cell.year}: best "${cell.best.label}" #1=${pct(cell.best.finalShare1)} score=${cell.best.score}/7`,
    );
  }
}

main();
