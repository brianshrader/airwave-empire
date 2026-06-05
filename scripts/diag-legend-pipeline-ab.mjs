#!/usr/bin/env node
/**
 * Legend pipeline A/B — diagnostic-only talent-generation variants (A–E).
 *
 *   npm run diag:legend-pipeline-ab
 *   node scripts/diag-legend-pipeline-ab.mjs --variants=A,B,E --runs=1
 *
 * Output: tmp/legend_pipeline_ab.json, tmp/legend_pipeline_ab.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { VARIANTS, VARIANT_DEFS, patchLegacySource } from './diag-legend-pipeline-ab-patches.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const hooksPath = path.join(__dirname, 'diag-legend-pipeline-ab-hooks.vm.js');
const legendRunnerPath = path.join(__dirname, 'diag-legend-pipeline-runner.vm.js');
const abRunnerPath = path.join(__dirname, 'diag-legend-pipeline-ab-runner.vm.js');
const outJson = path.join(root, 'tmp', 'legend_pipeline_ab.json');
const outMd = path.join(root, 'tmp', 'legend_pipeline_ab.md');

const DEFAULT_MARKETS = [
  'wichita',
  'nashville',
  'seattle',
  'sanfrancisco',
  'chicago',
  'newyork',
];
const DEFAULT_START_YEARS = [1970, 1985, 2000];

const TARGETS = {
  pctTrueQ85: { lo: 1, hi: 3 },
  pctTrueQ90: { lo: 0.2, hi: 0.8 },
  pctFranchise: { lo: 0.3, hi: 1.0 },
  pctGte5x: { lo: 1, hi: 3 },
  medianTrueQDrift: { max: 3 },
  meanOqDrift: { max: 4 },
  pct9599Drift: { max: 3 },
};

function injectHeadlessLaunchNewsGuard(src) {
  let out = src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  return out;
}

function patchActiveMarket(src, marketId) {
  return src.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
}

function stubEl() {
  return {
    disabled: false,
    appendChild() {},
    addEventListener() {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    style: { setProperty() {} },
    dataset: {},
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
  getElementById() {
    const el = stubEl();
    el.disabled = false;
    return el;
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext() {
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: console.error },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() { return 0; },
    clearTimeout() {},
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    parseInt,
    parseFloat,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, renderStatus() {} };
  return ctx;
}

function loadVm(marketId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  const legacyBase = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  const patched = patchLegacySource(patchActiveMarket(legacyBase, marketId));
  vm.runInContext(readFileSync(hooksPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(patched, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(
    'showToast=function(){};renderAll=function(){};openContract=function(){};',
    ctx,
  );
  vm.runInContext(readFileSync(legendRunnerPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(abRunnerPath, 'utf8'), ctx, { timeout: 600_000 });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    markets: DEFAULT_MARKETS,
    startYears: DEFAULT_START_YEARS,
    years: 35,
    seeds: 4,
    seed: 20260608,
    variants: [...VARIANTS],
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) {
      o.markets = a
        .slice(10)
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith('--start-years=')) {
      o.startYears = a
        .slice(14)
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter(Number.isFinite);
    } else if (a.startsWith('--years=')) o.years = parseInt(a.slice(8), 10) || o.years;
    else if (a.startsWith('--seeds=')) o.seeds = Math.max(1, parseInt(a.slice(8), 10) || 4);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--variants=')) {
      o.variants = a
        .slice(11)
        .split(',')
        .map((x) => x.trim().toUpperCase())
        .filter((v) => VARIANTS.includes(v));
    } else if (a.startsWith('--runs=')) o.seeds = Math.max(1, parseInt(a.slice(7), 10) || 1);
  }
  return o;
}

function median(nums) {
  const x = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!x.length) return null;
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : Math.round((x[m - 1] + x[m]) / 2);
}

function mean(nums) {
  const x = nums.filter(Number.isFinite);
  if (!x.length) return null;
  return Math.round((x.reduce((a, b) => a + b, 0) / x.length) * 100) / 100;
}

function poolVariant(runs) {
  const ok = runs.filter((r) => r.ok && r.metrics);
  if (!ok.length) return { runs: runs.length, ok: 0 };

  const pick = (path) => ok.map((r) => path.split('.').reduce((o, k) => o?.[k], r.metrics));

  const pct85 = pick('talentDistribution.pctTrueQ85');
  const pct90 = pick('talentDistribution.pctTrueQ90');
  const pctFr = pick('legendPipeline.pctFranchiseLegend');
  const pct5x = pick('salaryConcentration.pctGte5xMedian');
  const medTq = pick('talentDistribution.medianTrueQ');
  const meanOq = pick('economyGuardrails.meanOq');
  const pct9599 = pick('economyGuardrails.pct9599');
  const capHighQ = pick('salaryConcentration.pctHighQEverAtCap');
  const pinned = pick('salaryConcentration.pctPinnedAtCap');

  return {
    runs: runs.length,
    ok: ok.length,
    talentDistribution: {
      medianTrueQ: median(medTq),
      p90TrueQ: median(ok.map((r) => r.metrics.talentDistribution.p90TrueQ)),
      p99TrueQ: median(ok.map((r) => r.metrics.talentDistribution.p99TrueQ)),
      maxTrueQ: Math.max(...ok.map((r) => r.metrics.talentDistribution.maxTrueQ || 0)),
      pctTrueQ75: mean(pick('talentDistribution.pctTrueQ75')),
      pctTrueQ85: mean(pct85),
      pctTrueQ90: mean(pct90),
    },
    legendPipeline: {
      pctStar: mean(pick('legendPipeline.pctStar')),
      pctElite: mean(pick('legendPipeline.pctElite')),
      pctLegendCandidate: mean(pick('legendPipeline.pctLegendCandidate')),
      pctFranchiseLegend: mean(pctFr),
      medianYearsToElite: median(pick('legendPipeline.medianYearsToElite')),
      medianYearsToLegend: median(pick('legendPipeline.medianYearsToLegend')),
      medianYearsToFranchise: median(pick('legendPipeline.medianYearsToFranchise')),
    },
    salaryConcentration: {
      marketMedianSalary: median(pick('salaryConcentration.marketMedianSalary')),
      p90Salary: median(pick('salaryConcentration.p90Salary')),
      p99Salary: median(pick('salaryConcentration.p99Salary')),
      maxSalary: Math.max(...ok.map((r) => r.metrics.salaryConcentration.maxSalary || 0)),
      pctGte2xMedian: mean(pick('salaryConcentration.pctGte2xMedian')),
      pctGte3xMedian: mean(pick('salaryConcentration.pctGte3xMedian')),
      pctGte5xMedian: mean(pct5x),
      pctGte10xMedian: mean(pick('salaryConcentration.pctGte10xMedian')),
      pctPinnedAtCap: mean(pinned),
      pctAboveCap: mean(pick('salaryConcentration.pctAboveCap')),
      pctHighQEverAtCap: mean(capHighQ),
    },
    stationImpact: {
      avgShareLiftHighQ: mean(pick('stationImpact.avgShareLiftHighQEmployed')),
      avgReplacementDrop: mean(pick('stationImpact.avgReplacementShareDrop')),
      poachAttemptsHighQ: mean(pick('stationImpact.poachAttemptsHighQ')),
      pctHighQWithPoach: mean(pick('stationImpact.pctHighQWithPoachInterest')),
      medianPoachPremiumHighQ: median(pick('stationImpact.medianPoachPremiumHighQ')),
    },
    economyGuardrails: {
      meanOq: mean(meanOq),
      pct9599: mean(pct9599),
      medianEbitdaMargin: median(pick('economyGuardrails.medianEbitdaMargin')),
      hhi: median(pick('economyGuardrails.hhi')),
      zombieLike: mean(pick('economyGuardrails.zombieLike')),
      spiralLike: mean(pick('economyGuardrails.spiralLike')),
      soloBankruptRuns: ok.filter((r) => r.metrics.economyGuardrails.soloBankrupt).length,
    },
    careerRows: ok.reduce((a, r) => a + (r.careerCount || 0), 0),
  };
}

function inBand(val, band) {
  if (val == null) return false;
  return val >= band.lo && val <= band.hi;
}

function scoreVariant(pooled, baseline) {
  if (!pooled?.talentDistribution || !pooled?.ok) return 0;
  let score = 0;
  const t = pooled.talentDistribution;
  const l = pooled.legendPipeline;
  const s = pooled.salaryConcentration;
  const e = pooled.economyGuardrails;
  const b = baseline;

  if (inBand(t.pctTrueQ85, TARGETS.pctTrueQ85)) score += 25;
  else if ((t.pctTrueQ85 || 0) > 0) score += 8;

  if (inBand(t.pctTrueQ90, TARGETS.pctTrueQ90)) score += 15;
  if (inBand(l.pctFranchiseLegend, TARGETS.pctFranchise)) score += 25;
  else if ((l.pctFranchiseLegend || 0) > 0) score += 10;

  if (inBand(s.pctGte5xMedian, TARGETS.pctGte5x)) score += 15;

  const tqDrift = Math.abs((t.medianTrueQ || 0) - (b?.talentDistribution?.medianTrueQ || 0));
  if (tqDrift <= TARGETS.medianTrueQDrift.max) score += 10;

  const oqDrift = Math.abs((e.meanOq || 0) - (b?.economyGuardrails?.meanOq || 0));
  if (oqDrift <= TARGETS.meanOqDrift.max) score += 10;

  const oq9599Drift = Math.abs((e.pct9599 || 0) - (b?.economyGuardrails?.pct9599 || 0));
  if (oq9599Drift <= TARGETS.pct9599Drift.max) score += 10;

  if ((e.zombieLike || 0) <= (b?.economyGuardrails?.zombieLike || 999) * 1.15) score += 5;
  if ((e.spiralLike || 0) <= (b?.economyGuardrails?.spiralLike || 999) * 1.15) score += 5;

  return score;
}

function recommendDirection(pooled, baselineA) {
  const lines = [];
  const variants = Object.entries(pooled).filter(([k, p]) => k !== 'A' && p?.ok);
  const scored = variants
    .map(([v, p]) => ({ v, p, score: scoreVariant(p, baselineA) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const bOnly = pooled.B;
  const cOnly = pooled.C;

  if (!best || best.score <= 0) {
    lines.push('No variant met franchise tail targets — generation/breakout rates may need recalibration in a follow-up grid.');
    return lines;
  }

  lines.push(`Best balanced variant by guardrail score: **${best.v}** (score ${best.score}).`);

  const bFr = bOnly?.legendPipeline?.pctFranchiseLegend || 0;
  const cFr = cOnly?.legendPipeline?.pctFranchiseLegend || 0;
  const b85 = bOnly?.talentDistribution?.pctTrueQ85 || 0;
  const c85 = cOnly?.talentDistribution?.pctTrueQ85 || 0;

  if (b85 > c85 * 1.5 && bFr >= cFr) {
    lines.push('High-ceiling **generation (B)** produces more trueQ≥85 careers than breakout-only (C).');
  } else if (c85 > b85 * 1.2) {
    lines.push('**Career breakout (C)** lifts trueQ more than hire-time generation alone.');
  } else {
    lines.push('Generation and breakout contribute similarly — combined variants (D/E) warrant review.');
  }

  const capB = bOnly?.salaryConcentration?.pctHighQEverAtCap;
  const capE = pooled.E?.salaryConcentration?.pctHighQEverAtCap;
  if (
    (best.p.legendPipeline?.pctFranchiseLegend || 0) < TARGETS.pctFranchise.lo &&
    (best.p.talentDistribution?.pctTrueQ85 || 0) >= TARGETS.pctTrueQ85.lo
  ) {
    lines.push(
      'trueQ≥85 tail exists but **franchise legend rate stays ~0%** — station rank/share/tenure/poach-history gates remain the second upstream bottleneck after generation.',
    );
  }

  if ((capE || 0) > 25 || (best.p.salaryConcentration?.pctHighQEverAtCap || 0) > 20) {
    lines.push('Salary caps bind ~25–35% of high-trueQ careers in generation variants — compensation becomes the next bottleneck once station-success gates are cleared.');
  } else if ((best.p.salaryConcentration?.pctGte5xMedian || 0) < TARGETS.pctGte5x.lo) {
    lines.push('Even with legend-capable trueQ, ≥5× salary tail stays ~0.2% — cap/floor path limits pay until legends anchor top-3 stations for years.');
  }

  const oqDrift = Math.abs(
    (best.p.economyGuardrails?.meanOq || 0) - (baselineA?.economyGuardrails?.meanOq || 0),
  );
  if (oqDrift > TARGETS.meanOqDrift.max) {
    lines.push('Station OQ guardrails drifted — watch for quality inflation if pursuing this direction.');
  } else {
    lines.push('Station OQ guardrails held — no broad quality inflation detected in the winning variant.');
  }

  lines.push('**Direction (diagnostic only):** pursue upstream trueQ tail creation before salary tuning; prefer the scored variant mechanism mix for a production design spike.');
  return lines;
}

function renderMd(report) {
  const lines = [];
  lines.push('# Legend pipeline A/B (diagnostic only)');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Variants');
  lines.push('');
  for (const v of VARIANTS) {
    lines.push(`- **${v}**: ${VARIANT_DEFS[v]}`);
  }
  lines.push('');
  lines.push('## A–E comparison (pooled across markets × start years × seeds)');
  lines.push('');
  lines.push('| Variant | Med trueQ | P90 TQ | Max TQ | %≥85 | %≥90 | %Star | %Elite | %Legend | %Franchise | %≥5× sal | %cap pin | mean OQ | %95–99 OQ |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');

  for (const v of VARIANTS) {
    const p = report.pooledByVariant[v];
    if (!p?.ok) continue;
    const t = p.talentDistribution;
    const l = p.legendPipeline;
    const s = p.salaryConcentration;
    const e = p.economyGuardrails;
    lines.push(
      `| ${v} | ${t.medianTrueQ ?? '—'} | ${t.p90TrueQ ?? '—'} | ${t.maxTrueQ ?? '—'} | ${t.pctTrueQ85 ?? '—'}% | ${t.pctTrueQ90 ?? '—'}% | ${l.pctStar ?? '—'}% | ${l.pctElite ?? '—'}% | ${l.pctLegendCandidate ?? '—'}% | ${l.pctFranchiseLegend ?? '—'}% | ${s.pctGte5xMedian ?? '—'}% | ${s.pctPinnedAtCap ?? '—'}% | ${e.meanOq ?? '—'} | ${e.pct9599 ?? '—'}% |`,
    );
  }
  lines.push('');
  lines.push('## Targets');
  lines.push('');
  lines.push(`- trueQ ≥85: **${TARGETS.pctTrueQ85.lo}–${TARGETS.pctTrueQ85.hi}%** of careers`);
  lines.push(`- trueQ ≥90: **${TARGETS.pctTrueQ90.lo}–${TARGETS.pctTrueQ90.hi}%**`);
  lines.push(`- Franchise legends: **${TARGETS.pctFranchise.lo}–${TARGETS.pctFranchise.hi}%**`);
  lines.push(`- Salary ≥5× median: **${TARGETS.pctGte5x.lo}–${TARGETS.pctGte5x.hi}%**`);
  lines.push('');
  lines.push('## Mechanism comparison');
  lines.push('');
  for (const line of report.recommendation || []) lines.push(line);
  lines.push('');
  lines.push('## Salary & cap detail');
  lines.push('');
  for (const v of VARIANTS) {
    const s = report.pooledByVariant[v]?.salaryConcentration;
    if (!s) continue;
    lines.push(
      `**${v}** — med $${s.marketMedianSalary?.toLocaleString() ?? '—'}, P99 $${s.p99Salary?.toLocaleString() ?? '—'}, max $${s.maxSalary?.toLocaleString() ?? '—'}, ≥10× ${s.pctGte10xMedian ?? '—'}%, high-Q at cap ${s.pctHighQEverAtCap ?? '—'}%`,
    );
  }
  lines.push('');
  lines.push('## Station impact');
  lines.push('');
  for (const v of VARIANTS) {
    const st = report.pooledByVariant[v]?.stationImpact;
    if (!st) continue;
    lines.push(
      `**${v}** — share lift w/ high-Q ${st.avgShareLiftHighQ ?? '—'}pp, replacement drop ${st.avgReplacementDrop ?? '—'}pp, poach on high-Q ${st.pctHighQWithPoach ?? '—'}%`,
    );
  }
  lines.push('');
  lines.push('## Economy guardrails');
  lines.push('');
  for (const v of VARIANTS) {
    const e = report.pooledByVariant[v]?.economyGuardrails;
    if (!e) continue;
    lines.push(
      `**${v}** — HHI ${e.hhi ?? '—'}, zombies ${e.zombieLike ?? '—'}, spirals ${e.spiralLike ?? '—'}, bankrupt runs ${e.soloBankruptRuns ?? 0}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const vmCache = new Map();
  const allRuns = [];
  let idx = 0;

  for (const variant of config.variants) {
    for (const marketId of config.markets) {
      const vmKey = marketId;
      if (!vmCache.has(vmKey)) vmCache.set(vmKey, loadVm(marketId));
      const ctx = vmCache.get(vmKey);

      for (const startYear of config.startYears) {
        for (let s = 0; s < config.seeds; s++) {
          const seed = (config.seed + idx * 9973) >>> 0;
          idx += 1;
          const run = vm.runInContext(
            `__wlRunLegendPipelineAb(${JSON.stringify({
              variant,
              marketId,
              startYear,
              years: config.years,
              seed,
            })})`,
            ctx,
          );
          allRuns.push(run);
          if (!run.ok) {
            console.error(`FAIL ${variant} ${marketId} ${startYear} seed=${seed}: ${run.error}`);
          }
        }
      }
    }
  }

  const pooledByVariant = {};
  for (const v of VARIANTS) {
    pooledByVariant[v] = poolVariant(allRuns.filter((r) => r.variant === v));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config,
    variantDefs: VARIANT_DEFS,
    targets: TARGETS,
    runs: { total: allRuns.length, ok: allRuns.filter((r) => r.ok).length },
    pooledByVariant,
    scores: Object.fromEntries(
      VARIANTS.map((v) => [v, scoreVariant(pooledByVariant[v], pooledByVariant.A)]),
    ),
    recommendation: recommendDirection(pooledByVariant, pooledByVariant.A),
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(outMd, `${renderMd(report)}\n`, 'utf8');
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  for (const v of config.variants) {
    const p = pooledByVariant[v];
    if (!p?.ok) continue;
    console.log(
      `${v}: %≥85=${p.talentDistribution.pctTrueQ85}% franchise=${p.legendPipeline.pctFranchiseLegend}% ≥5×sal=${p.salaryConcentration.pctGte5xMedian}% score=${report.scores[v]}`,
    );
  }
}

main();
