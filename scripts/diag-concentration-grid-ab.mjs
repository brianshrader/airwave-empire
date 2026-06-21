#!/usr/bin/env node
/**
 * Concentration Physics Grid (Post-Phoenix) — diagnostic only.
 *
 * Sweeps mega/medium L1 tier mass scale × listeningHours blend on frozen books.
 * Scores primary anchors (Nashville weighted ≥ NYC) + validation markets.
 *
 *   node scripts/diag-concentration-grid-ab.mjs
 *   node scripts/diag-concentration-grid-ab.mjs --quick
 *
 * Artifacts: tmp/concentration_grid_ab.json, tmp/concentration_grid_ab.md
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
const outJson = path.join(root, 'tmp', 'concentration_grid_ab.json');
const outMd = path.join(root, 'tmp', 'concentration_grid_ab.md');

const MAX_STEPS = 360;
const DEFAULT_RUNS = 4;
const DEFAULT_SEED = 20260626;

/** Extended envelopes for validation markets (proxy bands). */
const GRID_ENVELOPES = {
  ...DUNCAN_AQH_ENVELOPES,
  chicago: {
    2010: { share1: [5.5, 7.5], top3: [14, 20], ge10: [0, 0], ge6: [2, 5], note: 'Mega proxy (Duncan-shaped)' },
  },
  losangeles: {
    2010: { share1: [5.5, 7.5], top3: [14, 20], ge10: [0, 0], ge6: [2, 5], note: 'Mega proxy (Duncan-shaped)' },
  },
  phoenix: {
    ...DUNCAN_AQH_ENVELOPES.phoenix,
    2026: { share1: [8, 11], top3: [20, 26], ge10: [0, 2], ge6: [2, 5], note: 'Large Sunbelt extrapolation' },
  },
};

const MEGA_SCALES = [0.48, 0.5, 0.52, 0.58];
const MEDIUM_SCALES = [0.42, 0.48, 0.52, 0.55];
const LH_BLENDS = [0.25, 0.3, 0.35, 0.4, 0.45];
const BASELINE_MEGA = 0.58;
const BASELINE_MEDIUM = 0.55;
const BASELINE_LARGE = 0.64;
const BASELINE_SMALL = 0.52;
const OA_MULTS = [1.0, 1.05, 1.08];

const PRIMARY_CELLS = [
  { marketId: 'newyork', year: 2003, weight: 1.5 },
  { marketId: 'newyork', year: 2010, weight: 1.5 },
  { marketId: 'nashville', year: 2003, weight: 2.0 },
  { marketId: 'nashville', year: 2010, weight: 2.0 },
  { marketId: 'atlanta', year: 2010, weight: 1.5 },
];

const VALIDATION_CELLS = [
  { marketId: 'phoenix', year: 2026, weight: 1.0 },
  { marketId: 'chicago', year: 2010, weight: 1.0 },
  { marketId: 'losangeles', year: 2010, weight: 1.0 },
];

const ALL_CELLS = [...PRIMARY_CELLS, ...VALIDATION_CELLS];

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

function makeTierTable(megaScale, mediumScale, year) {
  return {
    mega: megaScale,
    large: BASELINE_LARGE,
    medium: year <= 1998 ? 0.78 : mediumScale,
    small: BASELINE_SMALL,
  };
}

function configKey(mega, medium, lh, oa = 1) {
  return `m${mega.toFixed(2)}_med${medium.toFixed(2)}_lh${lh.toFixed(2)}_oa${oa.toFixed(2)}`;
}

function configLabel(mega, medium, lh, oa = 1) {
  const megaTag = mega === BASELINE_MEGA ? `${mega} (baseline)` : String(mega);
  const medTag = medium === BASELINE_MEDIUM ? `${medium} (baseline)` : String(medium);
  let s = `mega=${megaTag}, medium=${medTag}, LH blend=${lh}`;
  if (oa !== 1) s += `, OA mult=${oa}`;
  return s;
}

function buildGridConfigs() {
  const configs = [];
  for (const mega of MEGA_SCALES) {
    for (const medium of MEDIUM_SCALES) {
      for (const lh of LH_BLENDS) {
        configs.push({
          key: configKey(mega, medium, lh),
          megaScale: mega,
          mediumScale: medium,
          lhBlend: lh,
          oaMult: 1,
          label: configLabel(mega, medium, lh),
        });
      }
    }
  }
  return configs;
}

function scoreMarket(metrics, envelope, weight, isValidation) {
  if (!envelope || !metrics) {
    return { duncanScore: 0, distance: null, d1: null, d3: null, validationPenalty: 0 };
  }
  const sh1 = metrics.share1 * 100;
  const top3 = metrics.top3 * 100;
  const d1 = bandDistance(sh1, envelope.share1);
  const d3 = bandDistance(top3, envelope.top3);
  const distance = d1 + d3 * 0.5;

  let duncanScore = 0;
  if (inBand(sh1, envelope.share1)) duncanScore += 3;
  if (inBand(top3, envelope.top3)) duncanScore += 2;
  if (inBand(metrics.ge10, envelope.ge10)) duncanScore += 1;
  if (inBand(metrics.ge6, envelope.ge6)) duncanScore += 1;

  let validationPenalty = 0;
  if (isValidation && envelope.share1) {
    const [lo, hi] = envelope.share1;
    if (sh1 < lo - 3) validationPenalty += (lo - 3 - sh1) * 0.75;
    if (sh1 > hi + 3) validationPenalty += (sh1 - hi - 3) * 0.75;
  }

  return {
    duncanScore,
    distance,
    d1,
    d3,
    validationPenalty,
    weightedScore: duncanScore * weight,
    weightedDistance: distance * weight,
    weightedPenalty: validationPenalty * weight,
  };
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
  src = patchLegacyForShareDecomp(patchPostL1Skips(patchDiagnosticRetunes(src)));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED, quick: false };
  for (const a of argv) {
    if (a === '--quick') {
      o.quick = true;
      o.runs = 2;
    } else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
  }
  return o;
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
  function runConfig(frozen,marketId,y,table,lhBlend,oaMult){
    var stations=JSON.parse(JSON.stringify(frozen));
    G.stations=stations; G.marketId=marketId; G.year=y; G.period=1;
    G._shareDecompActive=true; G._shareDecompLayers=[];
    G._diagCommercialMassScale=undefined;
    G._diagCommercialMassScaleTier=true;
    G._diagTierMassScaleTable=table;
    G._diagListeningHoursBlend=lhBlend;
    G._diagOtherAudioMult=oaMult===1?undefined:oaMult;
    G._diagOtherAudioLeaderReliefMult=undefined;
    recalc(stations,G);
    var fin=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L8_final';});
    var l1=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L1_postCohort';});
    return {
      scale:G._diagCommercialMassScaleApplied,
      final:fin,
      l1:l1,
    };
  }
  return {simToYear:simToYear,runConfig:runConfig};
})(${MAX_STEPS})
`;

function aggregateConfigResults(config, byCell) {
  let totalWeightedScore = 0;
  let totalWeightedDistance = 0;
  let totalValidationPenalty = 0;
  let primaryWeightedScore = 0;
  let primaryWeightedDistance = 0;
  let nashvilleWeightedScore = 0;
  let nashvilleWeightedDistance = 0;
  const markets = {};

  for (const cell of ALL_CELLS) {
    const ck = `${cell.marketId}|${cell.year}`;
    const samples = byCell[ck];
    if (!samples?.length) continue;

    const metrics = {
      share1: mean(samples.map((s) => s.final?.share1)),
      share2: mean(samples.map((s) => s.final?.share2)),
      share3: mean(samples.map((s) => s.final?.share3)),
      top3: mean(samples.map((s) => s.final?.top3)),
      top5: mean(samples.map((s) => s.final?.top5)),
      hhi: mean(samples.map((s) => s.final?.hhi)),
      ge10: mean(samples.map((s) => s.final?.ge10)),
      ge6: mean(samples.map((s) => s.final?.ge6)),
      l1Share1: mean(samples.map((s) => s.l1?.share1)),
    };

    const envelope = gridEnvelope(cell.marketId, cell.year);
    const isValidation = VALIDATION_CELLS.some((v) => v.marketId === cell.marketId && v.year === cell.year);
    const scored = scoreMarket(metrics, envelope, cell.weight, isValidation);

    markets[ck] = {
      marketId: cell.marketId,
      year: cell.year,
      weight: cell.weight,
      isValidation,
      envelope,
      metrics,
      ...scored,
    };

    totalWeightedScore += scored.weightedScore;
    totalWeightedDistance += scored.weightedDistance;
    totalValidationPenalty += scored.weightedPenalty;

    if (!isValidation) {
      primaryWeightedScore += scored.weightedScore;
      primaryWeightedDistance += scored.weightedDistance;
    }
    if (cell.marketId === 'nashville') {
      nashvilleWeightedScore += scored.weightedScore;
      nashvilleWeightedDistance += scored.weightedDistance;
    }
  }

  const maxPrimaryScore = PRIMARY_CELLS.reduce((s, c) => s + 7 * c.weight, 0);

  return {
    ...config,
    totalWeightedScore,
    totalWeightedDistance,
    totalValidationPenalty,
    primaryWeightedScore,
    primaryWeightedDistance,
    nashvilleWeightedScore,
    nashvilleWeightedDistance,
    aggregateScore: totalWeightedScore - totalValidationPenalty,
    primaryScore: primaryWeightedScore,
    primaryDistance: primaryWeightedDistance,
    primaryScorePct: primaryWeightedScore / maxPrimaryScore,
    markets,
  };
}

function buildMarkdown(report) {
  const lines = [
    '# Concentration Physics Grid (Post-Phoenix)',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Diagnostic-only sweep: tier L1 commercial mass scale × `applyListeningHoursShareFromAqh` blend.',
    'No ecology, OQ, slot quality, sports, or AI changes.',
    '',
    '## Grid axes',
    `- Mega L1 scale: ${MEGA_SCALES.join(', ')} (baseline ${BASELINE_MEGA})`,
    `- Medium L1 scale (year > 1998): ${MEDIUM_SCALES.join(', ')} (baseline ${BASELINE_MEDIUM})`,
    `- LH blend: ${LH_BLENDS.join(', ')}`,
    `- Large/small held at ${BASELINE_LARGE} / ${BASELINE_SMALL}`,
    '',
    '## Scoring weights',
    '- Nashville cells: weight **2.0** each',
    '- NYC + Atlanta primary: weight **1.5** each',
    '- Validation (Phoenix 2026, Chicago/LA 2010): weight **1.0** + under/over band penalty',
    '',
    '## Top 15 configurations (by aggregate score − validation penalty, then distance)',
    '',
    '| Rank | Config | Agg score | Primary score | Nash score | Weighted dist | Val penalty |',
    '| ---: | --- | ---: | ---: | ---: | ---: | ---: |',
  ];

  report.topConfigs.slice(0, 15).forEach((c, i) => {
    lines.push(
      `| ${i + 1} | ${c.label} | ${c.aggregateScore.toFixed(1)} | ${c.primaryScore.toFixed(1)} | ${c.nashvilleWeightedScore.toFixed(1)} | ${c.totalWeightedDistance.toFixed(2)} | ${c.totalValidationPenalty.toFixed(2)} |`,
    );
  });

  const best = report.best;
  if (best) {
    lines.push('', '## Recommended candidate (lowest primary weighted distance)', '');
    lines.push(`**${best.label}**`, '');
    lines.push('| Market | Year | #1 | top-3 | top-5 | HHI | Duncan #1 | d(#1) | d(top-3) | Score |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |');

    for (const cell of ALL_CELLS) {
      const ck = `${cell.marketId}|${cell.year}`;
      const m = best.markets[ck];
      if (!m) continue;
      const env = m.envelope;
      const band = env?.share1 ? `${env.share1[0]}–${env.share1[1]}%` : '—';
      lines.push(
        `| ${cell.marketId} | ${cell.year} | ${pct(m.metrics.share1)} | ${pct(m.metrics.top3)} | ${pct(m.metrics.top5)} | ${m.metrics.hhi?.toFixed(0) ?? '—'} | ${band} | ${m.d1?.toFixed(2) ?? '—'} | ${m.d3?.toFixed(2) ?? '—'} | ${m.duncanScore}/7 |`,
      );
    }
  }

  if (report.oaSweep?.length) {
    lines.push('', '## Optional OtherAudio multiplier sweep (top base configs)', '');
    lines.push('| Base config | OA mult | Agg score | Δ vs base | Nashville 2003 #1 | NYC 2003 #1 |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const row of report.oaSweep.slice(0, 8)) {
      lines.push(
        `| ${row.baseLabel} | ${row.oaMult} | ${row.aggregateScore.toFixed(1)} | ${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(1)} | ${pct(row.nash2003)} | ${pct(row.nyc2003)} |`,
      );
    }
  }

  lines.push('', '## Baseline reference (mega=0.58, medium=0.55, LH blend=0)', '');
  if (report.baselineRef) {
    const b = report.baselineRef;
    lines.push(`Aggregate score: ${b.aggregateScore.toFixed(1)} · weighted distance: ${b.totalWeightedDistance.toFixed(2)}`);
    for (const cell of PRIMARY_CELLS) {
      const ck = `${cell.marketId}|${cell.year}`;
      const m = b.markets[ck];
      if (m) lines.push(`- ${cell.marketId} ${cell.year}: #1 ${pct(m.metrics.share1)} (L1 ${pct(m.metrics.l1Share1)}), top-3 ${pct(m.metrics.top3)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const gridConfigs = buildGridConfigs();
  if (opts.quick) {
    gridConfigs.length = 0;
    for (const mega of [0.48, 0.52, 0.58]) {
      for (const medium of [0.42, 0.52, 0.55]) {
        for (const lh of [0.3, 0.4]) {
          gridConfigs.push({
            key: configKey(mega, medium, lh),
            megaScale: mega,
            mediumScale: medium,
            lhBlend: lh,
            oaMult: 1,
            label: configLabel(mega, medium, lh),
          });
        }
      }
    }
  }

  console.log(`Loading legacy… (${gridConfigs.length} grid cells × ${ALL_CELLS.length} markets × ${opts.runs} runs)`);
  const ctx = loadCtx();
  const api = vm.runInContext(RUN_IIFE, ctx);

  /** configKey -> cellKey -> [samples] */
  const results = {};
  for (const cfg of gridConfigs) results[cfg.key] = {};

  for (const cell of ALL_CELLS) {
    const ck = `${cell.marketId}|${cell.year}`;
    console.log(`==> ${cell.marketId} ${cell.year}`);
    for (let run = 0; run < opts.runs; run++) {
      const seed = opts.seed + marketSalt(cell.marketId) * 17 + cell.year * 10007 + run * 9973;
      const sim = api.simToYear(cell.marketId, cell.year, seed);
      if (!sim.ok) {
        console.warn(`  run ${run}: sim failed`);
        continue;
      }
      for (const cfg of gridConfigs) {
        const table = makeTierTable(cfg.megaScale, cfg.mediumScale, cell.year);
        const r = api.runConfig(sim.frozen, cell.marketId, cell.year, table, cfg.lhBlend, cfg.oaMult);
        if (!results[cfg.key][ck]) results[cfg.key][ck] = [];
        results[cfg.key][ck].push(r);
      }
    }
  }

  const ranked = gridConfigs
    .map((cfg) => aggregateConfigResults(cfg, results[cfg.key]))
    .sort(
      (a, b) =>
        b.aggregateScore - a.aggregateScore
        || a.totalWeightedDistance - b.totalWeightedDistance
        || b.nashvilleWeightedScore - a.nashvilleWeightedScore,
    );

  const primaryKeys = PRIMARY_CELLS.map((c) => `${c.marketId}|${c.year}`);
  const primaryDistance = (c) =>
    primaryKeys.reduce((s, ck) => s + (c.markets[ck]?.weightedDistance || 0), 0);
  const validationPenaltyTotal = (c) =>
    VALIDATION_CELLS.reduce((s, cell) => {
      const ck = `${cell.marketId}|${cell.year}`;
      return s + (c.markets[ck]?.validationPenalty || 0);
    }, 0);

  const recommended = [...ranked]
    .filter((c) => validationPenaltyTotal(c) < 1.5)
    .sort(
      (a, b) =>
        primaryDistance(a) - primaryDistance(b)
        || b.nashvilleWeightedScore - a.nashvilleWeightedScore,
    )[0] || ranked[0];

  const best = recommended;

  // Baseline: tier table defaults, no LH blend (0)
  const baselineCfg = {
    key: 'baseline',
    megaScale: BASELINE_MEGA,
    mediumScale: BASELINE_MEDIUM,
    lhBlend: 0,
    oaMult: 1,
    label: `mega=${BASELINE_MEGA} (baseline), medium=${BASELINE_MEDIUM} (baseline), LH blend=0`,
  };
  const baselineByCell = {};
  for (const cell of ALL_CELLS) {
    const ck = `${cell.marketId}|${cell.year}`;
    baselineByCell[ck] = [];
    for (let run = 0; run < opts.runs; run++) {
      const seed = opts.seed + marketSalt(cell.marketId) * 17 + cell.year * 10007 + run * 9973;
      const sim = api.simToYear(cell.marketId, cell.year, seed);
      if (!sim.ok) continue;
      const table = makeTierTable(BASELINE_MEGA, BASELINE_MEDIUM, cell.year);
      const r = api.runConfig(sim.frozen, cell.marketId, cell.year, table, 0, 1);
      baselineByCell[ck].push(r);
    }
  }
  const baselineRef = aggregateConfigResults(baselineCfg, baselineByCell);

  // Optional OA sweep on top 5 base configs
  const oaSweep = [];
  if (!opts.quick && best) {
    const topBases = ranked.slice(0, 5);
    for (const base of topBases) {
      for (const oa of OA_MULTS) {
        if (oa === 1) continue;
        const oaCfg = { ...base, oaMult: oa, key: `${base.key}_oa${oa}`, label: `${base.label}, OA mult=${oa}` };
        const oaByCell = {};
        for (const cell of ALL_CELLS) {
          const ck = `${cell.marketId}|${cell.year}`;
          oaByCell[ck] = [];
          for (let run = 0; run < opts.runs; run++) {
            const seed = opts.seed + marketSalt(cell.marketId) * 17 + cell.year * 10007 + run * 9973;
            const sim = api.simToYear(cell.marketId, cell.year, seed);
            if (!sim.ok) continue;
            const table = makeTierTable(base.megaScale, base.mediumScale, cell.year);
            const r = api.runConfig(sim.frozen, cell.marketId, cell.year, table, base.lhBlend, oa);
            oaByCell[ck].push(r);
          }
        }
        const oaAgg = aggregateConfigResults(oaCfg, oaByCell);
        oaSweep.push({
          baseKey: base.key,
          baseLabel: base.label,
          oaMult: oa,
          aggregateScore: oaAgg.aggregateScore,
          delta: oaAgg.aggregateScore - base.aggregateScore,
          nash2003: oaAgg.markets['nashville|2003']?.metrics?.share1,
          nyc2003: oaAgg.markets['newyork|2003']?.metrics?.share1,
          ...oaAgg,
        });
      }
    }
    oaSweep.sort((a, b) => b.delta - a.delta || b.aggregateScore - a.aggregateScore);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: opts,
    grid: {
      megaScales: MEGA_SCALES,
      mediumScales: MEDIUM_SCALES,
      lhBlends: LH_BLENDS,
      baselineMega: BASELINE_MEGA,
      baselineMedium: BASELINE_MEDIUM,
    },
    weights: {
      nashville: 2.0,
      newyork: 1.5,
      atlanta: 1.5,
      validation: 1.0,
    },
    cells: ALL_CELLS,
    totalConfigs: gridConfigs.length,
    best,
    recommended,
    topConfigs: ranked.slice(0, 25),
    baselineRef,
    oaSweep: oaSweep.filter((r) => r.delta > 0.05).slice(0, 10),
    allConfigs: ranked,
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outMd, `${buildMarkdown(report)}\n`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);

  if (best) {
    console.log(`Best: ${best.label}`);
    console.log(`  aggregate=${best.aggregateScore.toFixed(1)} primary=${best.primaryScore.toFixed(1)} distance=${best.totalWeightedDistance.toFixed(2)}`);
    for (const cell of PRIMARY_CELLS) {
      const m = best.markets[`${cell.marketId}|${cell.year}`];
      if (m) console.log(`  ${cell.marketId} ${cell.year}: #1=${pct(m.metrics.share1)} top-3=${pct(m.metrics.top3)} score=${m.duncanScore}/7`);
    }
  }
}

main();
