#!/usr/bin/env node
/**
 * Combined L1 tier scale + otherAudio + listeningHours retune A/B — diagnostic only.
 *
 *   node scripts/diag-share-combined-retune-ab.mjs
 *   node scripts/diag-share-combined-retune-ab.mjs --quick
 *
 * Artifacts: tmp/share_combined_retune_ab.json, .md
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
const outJson = path.join(root, 'tmp', 'share_combined_retune_ab.json');
const outMd = path.join(root, 'tmp', 'share_combined_retune_ab.md');

const MAX_STEPS = 340;
const DEFAULT_MARKETS = ['newyork', 'nashville', 'phoenix', 'atlanta'];
const DEFAULT_YEARS = [1995, 2003, 2010];
const DEFAULT_RUNS = 6;
const DEFAULT_SEED = 20260625;

const TIER_BASE = { _diagCommercialMassScaleTier: true };

const VARIANTS = {
  A: { label: 'Tier L1 only (baseline)', flags: { ...TIER_BASE } },
  B: { label: 'Tier + LH blend 0.35', flags: { ...TIER_BASE, _diagListeningHoursBlend: 0.35 } },
  C: { label: 'Tier + OA leader relief ×0.70', flags: { ...TIER_BASE, _diagOtherAudioLeaderReliefMult: 0.7 } },
  D: {
    label: 'Tier + OA relief ×0.70 + LH blend 0.35',
    flags: { ...TIER_BASE, _diagOtherAudioLeaderReliefMult: 0.7, _diagListeningHoursBlend: 0.35 },
  },
  E: {
    label: 'Tier mega 0.52 + OA ×0.70 + LH 0.35',
    flags: {
      ...TIER_BASE,
      _diagTierMassScaleTable: { mega: 0.52, large: 0.64, medium: 0.78, small: 0.52 },
      _diagOtherAudioLeaderReliefMult: 0.7,
      _diagListeningHoursBlend: 0.35,
    },
  },
  F: {
    label: 'Tier + OA relief ×0.60 + LH blend 0.40',
    flags: { ...TIER_BASE, _diagOtherAudioLeaderReliefMult: 0.6, _diagListeningHoursBlend: 0.4 },
  },
  G: {
    label: 'Tier + OA f×1.08 + relief ×0.75 + LH 0.30',
    flags: {
      ...TIER_BASE,
      _diagOtherAudioMult: 1.08,
      _diagOtherAudioLeaderReliefMult: 0.75,
      _diagListeningHoursBlend: 0.3,
    },
  },
  H: {
    label: 'Tier L1-only (skip post-L1)',
    flags: {
      ...TIER_BASE,
      _diagSkipLongTail: true,
      _diagSkipOtherAudio: true,
      _diagSkipListeningHours: true,
      _diagSkipTrimBoost: true,
      _diagSkipEndgameRepairs: true,
    },
  },
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
    '# Combined retune A/B (tier L1 + otherAudio + listeningHours)',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Diagnostic-only hooks: `_diagCommercialMassScaleTier`, `_diagOtherAudioLeaderReliefMult`,',
    '`_diagOtherAudioMult`, `_diagListeningHoursBlend` (fraction pulled back toward pre-LH cohort headline).',
    '',
  ];

  for (const cell of report.cells) {
    lines.push(`## ${cell.marketId} · ${cell.year}`);
    if (cell.envelope?.note) lines.push(`Duncan: ${cell.envelope.note}`);
    lines.push(`#1 band: ${cell.envelope?.share1?.join('–')}% · top-3: ${cell.envelope?.top3?.join('–')}%`);
    lines.push('');
    lines.push('| Variant | L1 #1 | Final #1 | top-3 | ≥10% st | Duncan score |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const row of cell.rows) {
      lines.push(
        `| ${row.label} | ${pct(row.l1Share1)} | ${pct(row.finalShare1)} | ${pct(row.finalTop3)} | ${row.finalGe10?.toFixed(1) ?? '—'} | ${row.score}/7 |`,
      );
    }
    if (cell.best) {
      lines.push('');
      lines.push(`**Best:** ${cell.best.label} (score ${cell.best.score}/7, #1 ${pct(cell.best.finalShare1)})`);
    }
    lines.push('');
  }

  lines.push('## Global best variant (mean Duncan score across cells with envelopes)');
  if (report.globalBest) {
    lines.push(`**${report.globalBest.label}** — mean score ${report.globalBest.meanScore.toFixed(2)}/7 across ${report.globalBest.n} cells`);
  }
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
  function clearDiagFlags(){
    G._diagCommercialMassScale=undefined;
    G._diagCommercialMassScaleTier=false;
    G._diagTierMassScaleTable=undefined;
    G._diagOtherAudioMult=undefined;
    G._diagOtherAudioLeaderReliefMult=undefined;
    G._diagListeningHoursBlend=undefined;
    G._diagSkipLongTail=false;
    G._diagSkipOtherAudio=false;
    G._diagSkipListeningHours=false;
    G._diagSkipTrimBoost=false;
    G._diagSkipEndgameRepairs=false;
  }
  function runVariant(frozen,marketId,y,flags){
    var stations=JSON.parse(JSON.stringify(frozen));
    G.stations=stations; G.marketId=marketId; G.year=y; G.period=1;
    G._shareDecompActive=true; G._shareDecompLayers=[];
    clearDiagFlags();
    if(flags)Object.keys(flags).forEach(function(k){G[k]=flags[k];});
    recalc(stations,G);
    var l1=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L1_postCohort';});
    var fin=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L8_final';});
    return {scale:G._diagCommercialMassScaleApplied,l1:l1,final:fin};
  }
  return {simToYear:simToYear,runVariant:runVariant};
})(${MAX_STEPS})
`;

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  console.log('Loading legacy + combined retune hooks…');
  const ctx = loadCtx();
  const api = vm.runInContext(RUN_IIFE, ctx);
  const cells = [];
  const globalScores = {};

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
        if (envelope) {
          if (!globalScores[vkey]) globalScores[vkey] = { label: vdef.label, scores: [] };
          globalScores[vkey].scores.push(row.score);
        }
        return row;
      });

      rows.sort((a, b) => b.score - a.score || Math.abs(a.finalShare1 - (envelope?.share1?.[0] ?? 0) / 100) - Math.abs(b.finalShare1 - (envelope?.share1?.[0] ?? 0) / 100));
      cells.push({ marketId, year, envelope, rows, best: rows[0] || null });
    }
  }

  let globalBest = null;
  for (const [vkey, g] of Object.entries(globalScores)) {
    const meanScore = mean(g.scores);
    if (!globalBest || meanScore > globalBest.meanScore) {
      globalBest = { variant: vkey, label: g.label, meanScore, n: g.scores.length };
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: opts,
    variants: VARIANTS,
    cells,
    globalBest,
    duncanEnvelopes: DUNCAN_AQH_ENVELOPES,
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outMd, `${buildMarkdown(report)}\n`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);

  for (const cell of cells) {
    if (!cell.best) continue;
    console.log(`  ${cell.marketId} ${cell.year}: best "${cell.best.label}" #1=${pct(cell.best.finalShare1)} score=${cell.best.score}/7`);
  }
  if (globalBest) console.log(`Global best: ${globalBest.label} mean=${globalBest.meanScore.toFixed(2)}/7`);
}

main();
