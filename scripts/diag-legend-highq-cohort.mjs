#!/usr/bin/env node
/**
 * High-ceiling talent cohort — Gate 2 diagnostic (trueQ ≥85 careers only).
 *
 * Tracks where rare high-Q talent starts, how long they stay, platform fit,
 * and why they fail to become legend/franchise tier.
 *
 *   npm run diag:legend-highq-cohort
 *   node scripts/diag-legend-highq-cohort.mjs --variants=E --markets=chicago
 *
 * Output: tmp/legend_highq_cohort.json, tmp/legend_highq_cohort.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { patchLegacySource } from './diag-legend-pipeline-ab-patches.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const hooksPath = path.join(__dirname, 'diag-legend-pipeline-ab-hooks.vm.js');
const runnerPath = path.join(__dirname, 'diag-legend-pipeline-runner.vm.js');
const outJson = path.join(root, 'tmp', 'legend_highq_cohort.json');
const outMd = path.join(root, 'tmp', 'legend_highq_cohort.md');

const DEFAULT_MARKETS = [
  'wichita',
  'nashville',
  'seattle',
  'sanfrancisco',
  'chicago',
  'newyork',
];
const DEFAULT_START_YEARS = [1970, 1985, 2000];

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
  vm.runInContext(readFileSync(hooksPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(
    patchLegacySource(patchActiveMarket(injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8')), marketId)),
    ctx,
    { filename: 'legacy.js', timeout: 600_000 },
  );
  vm.runInContext(
    'showToast=function(){};renderAll=function(){};openContract=function(){};',
    ctx,
  );
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    markets: DEFAULT_MARKETS,
    startYears: DEFAULT_START_YEARS,
    years: 35,
    seeds: 4,
    seed: 20260609,
    variants: ['A', 'E'],
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
        .filter(Boolean);
    }
  }
  return o;
}

function mean(nums) {
  const x = nums.filter(Number.isFinite);
  if (!x.length) return null;
  return Math.round((x.reduce((a, b) => a + b, 0) / x.length) * 100) / 100;
}

function poolCohort(runs) {
  const ok = runs.filter((r) => r.ok && r.highQCohort);
  const cohorts = ok.map((r) => r.highQCohort);
  const totalCohort = cohorts.reduce((a, c) => a + (c.cohortSize || 0), 0);
  const totalCareers = ok.reduce((a, r) => a + (r.careerCount || 0), 0);

  if (!totalCohort) {
    return {
      runs: runs.length,
      ok: ok.length,
      cohortSize: 0,
      pctOfAllCareers: 0,
    };
  }

  const failureCounts = {};
  const allSamples = [];
  for (const c of cohorts) {
    for (const row of c.failureRanked || []) {
      failureCounts[row.factor] = (failureCounts[row.factor] || 0) + row.count;
    }
    if (c.samples) allSamples.push(...c.samples);
  }
  const failureRanked = Object.entries(failureCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([factor, count]) => ({
      factor,
      count,
      pctOfCohort: Math.round((count / totalCohort) * 1000) / 10,
    }));

  const avg = (path) =>
    mean(
      cohorts.map((c) => {
        const parts = path.split('.');
        return parts.reduce((o, k) => o?.[k], c);
      }),
    );

  return {
    runs: runs.length,
    ok: ok.length,
    cohortSize: totalCohort,
    pctOfAllCareers: totalCareers ? Math.round((totalCohort / totalCareers) * 10000) / 100 : 0,
    startingPlatform: {
      pctStartDrive: avg('startingPlatform.pctStartDrive'),
      pctStartTop5: avg('startingPlatform.pctStartTop5'),
      pctStartTop10: avg('startingPlatform.pctStartTop10'),
      medianStartSharePct: avg('startingPlatform.medianStartSharePct'),
      pctBornHighCeiling: avg('startingPlatform.pctBornHighCeiling'),
    },
    careerTrajectory: {
      medianCareerSpanYrs: avg('careerTrajectory.medianCareerSpanYrs'),
      pctActiveAtEnd: avg('careerTrajectory.pctActiveAtEnd'),
      pctDepartedBefore10yr: avg('careerTrajectory.pctDepartedBefore10yr'),
      pctTenure10Plus: avg('careerTrajectory.pctTenure10Plus'),
      pctTenure15Plus: avg('careerTrajectory.pctTenure15Plus'),
      pctEverTop3Station: avg('careerTrajectory.pctEverTop3Station'),
      pctEverLegendPlatform: avg('careerTrajectory.pctEverLegendPlatform'),
      medianStationMoves: avg('careerTrajectory.medianStationMoves'),
      pctEverElite: avg('careerTrajectory.pctEverElite'),
      pctEverLegendCand: avg('careerTrajectory.pctEverLegendCand'),
      pctEverFranchise: avg('careerTrajectory.pctEverFranchise'),
    },
    platformAlignment: {
      pctWithStrongPlatform: avg('platformAlignment.pctWithStrongPlatform'),
      pctScatteredWeak: avg('platformAlignment.pctScatteredWeak'),
      medianStationsWorked: avg('platformAlignment.medianStationsWorked'),
    },
    failureRanked,
    topSamples: allSamples
      .sort((a, b) => b.maxTrueQ - a.maxTrueQ || b.maxTenureYrs - a.maxTenureYrs)
      .slice(0, 24),
  };
}

function gate2Verdict(pooledE, pooledA) {
  const lines = [];
  const e = pooledE;
  const a = pooledA;

  if (!e.cohortSize) {
    lines.push('No trueQ≥85 cohort under variant E in this grid — widen runs or confirm generation hooks.');
    return lines;
  }

  lines.push(
    `Under **variant E**, **${e.cohortSize}** high-ceiling careers (${e.pctOfAllCareers}% of all rows) vs **${a.cohortSize || 0}** under baseline A.`,
  );

  const fail = e.failureRanked?.[0];
  if (fail) {
    lines.push(
      `Primary legend failure mode: **${fail.factor}** (${fail.pctOfCohort}% of high-Q cohort).`,
    );
  }

  const sp = e.startingPlatform || {};
  const ct = e.careerTrajectory || {};
  const pa = e.platformAlignment || {};

  if ((sp.pctStartDrive || 0) < 55) {
    lines.push(
      `High-Q talent often **starts off-drive** (${sp.pctStartDrive ?? '—'}% morning/afternoon) — platform mismatch from day one.`,
    );
  }
  if ((sp.pctStartTop5 || 0) < 40) {
    lines.push(
      `Only **${sp.pctStartTop5 ?? '—'}%** start on top-5 stations — rare talent is scattered, not placed on winning platforms.`,
    );
  }
  if ((ct.pctDepartedBefore10yr || 0) > 25) {
    lines.push(
      `**${ct.pctDepartedBefore10yr}%** exit before 10-year tenure — churn kills legend arcs before station rank/share gates matter.`,
    );
  }
  if ((ct.pctEverLegendPlatform || 0) < 15) {
    lines.push(
      `Only **${ct.pctEverLegendPlatform ?? '—'}%** ever occupy a legend platform (top-3 + ≥8% share while trueQ≥85) — talent exists but platform rarely aligns.`,
    );
  }
  if ((pa.pctScatteredWeak || 0) > 35) {
    lines.push(
      `**${pa.pctScatteredWeak ?? '—'}%** spend most high-Q years on weak stations (rank>10 or share<3%) — "Stern on a bad station" pattern.`,
    );
  }
  if ((ct.pctEverFranchise || 0) < 0.5) {
    lines.push(
      'Franchise tier remains ~0% — Gate 2 is **platform + tenure + station success**, not salary.',
    );
  }

  lines.push(
    '**Diagnostic direction:** concentrate rare generation onto drive dayparts at competitive stations, then measure whether legend rate moves before touching compensation.',
  );
  return lines;
}

function renderMd(report) {
  const lines = [];
  lines.push('# High-ceiling talent cohort (Gate 2 diagnostic)');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Question');
  lines.push('');
  lines.push('What happens to **trueQ ≥85** careers? Rare talent + right platform must align for legends.');
  lines.push('');
  lines.push('## Cohort size (A vs E)');
  lines.push('');
  for (const [v, p] of Object.entries(report.pooledByVariant)) {
    lines.push(`- **${v}**: ${p.cohortSize ?? 0} high-Q careers (${p.pctOfAllCareers ?? 0}% of all rows, ${p.ok ?? 0} runs)`);
  }
  lines.push('');

  const e = report.pooledByVariant.E || report.pooledByVariant[report.config.variants[0]];
  if (e?.cohortSize) {
    lines.push('## Variant E — where they start');
    lines.push('');
    const sp = e.startingPlatform;
    lines.push(`| Metric | Value |`);
    lines.push(`| --- | ---: |`);
    lines.push(`| Start on drive daypart | ${sp.pctStartDrive ?? '—'}% |`);
    lines.push(`| Start on top-5 station | ${sp.pctStartTop5 ?? '—'}% |`);
    lines.push(`| Start on top-10 station | ${sp.pctStartTop10 ?? '—'}% |`);
    lines.push(`| Median starting share | ${sp.medianStartSharePct ?? '—'}% |`);
    lines.push(`| Born high-ceiling at hire | ${sp.pctBornHighCeiling ?? '—'}% |`);
    lines.push('');
    lines.push('## Variant E — career trajectory');
    lines.push('');
    const ct = e.careerTrajectory;
    lines.push(`| Metric | Value |`);
    lines.push(`| --- | ---: |`);
    lines.push(`| Median career span (years) | ${ct.medianCareerSpanYrs ?? '—'} |`);
    lines.push(`| Still active at sim end | ${ct.pctActiveAtEnd ?? '—'}% |`);
    lines.push(`| Departed before 10yr tenure | ${ct.pctDepartedBefore10yr ?? '—'}% |`);
    lines.push(`| Reached 10+ yr tenure | ${ct.pctTenure10Plus ?? '—'}% |`);
    lines.push(`| Ever on top-3 station | ${ct.pctEverTop3Station ?? '—'}% |`);
    lines.push(`| Ever legend platform (top-3 + ≥8% share) | ${ct.pctEverLegendPlatform ?? '—'}% |`);
    lines.push(`| Median station moves | ${ct.medianStationMoves ?? '—'} |`);
    lines.push(`| Became elite | ${ct.pctEverElite ?? '—'}% |`);
    lines.push(`| Became legend candidate | ${ct.pctEverLegendCand ?? '—'}% |`);
    lines.push(`| Became franchise | ${ct.pctEverFranchise ?? '—'}% |`);
    lines.push('');
    lines.push('## Variant E — platform alignment');
    lines.push('');
    const pa = e.platformAlignment;
    lines.push(`- Strong platform (drive + top-5 + share≥6% + 8yr+ tenure): **${pa.pctWithStrongPlatform ?? '—'}%**`);
    lines.push(`- Scattered on weak stations (>50% high-Q falls): **${pa.pctScatteredWeak ?? '—'}%**`);
    lines.push(`- Median stations worked: **${pa.medianStationsWorked ?? '—'}**`);
    lines.push('');
    lines.push('## Why they fail to become legends (ranked)');
    lines.push('');
    for (const row of e.failureRanked || []) {
      lines.push(`- **${row.factor}**: ${row.count} (${row.pctOfCohort}%)`);
    }
    lines.push('');
    if (e.topSamples?.length) {
      lines.push('## Sample high-Q careers');
      lines.push('');
      lines.push('| Name | trueQ | Start | Slot | Start rank | Best | Max share | Tenure | Moves | Failure mode |');
      lines.push('| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
      for (const s of e.topSamples.slice(0, 16)) {
        lines.push(
          `| ${s.name} | ${s.maxTrueQ} | ${s.startCall || '—'} | ${s.startSlot || '—'} | #${s.startRank ?? '?'} | #${s.bestRank ?? '?'} | ${s.maxSharePct}% | ${s.maxTenureYrs}y | ${s.stationMoves} | ${s.legendFailure} |`,
        );
      }
      lines.push('');
    }
  }

  lines.push('## Gate 2 verdict');
  lines.push('');
  for (const line of report.gate2Verdict || []) lines.push(line);
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
      if (!vmCache.has(marketId)) vmCache.set(marketId, loadVm(marketId));
      const ctx = vmCache.get(marketId);

      for (const startYear of config.startYears) {
        for (let s = 0; s < config.seeds; s++) {
          const seed = (config.seed + idx * 9973) >>> 0;
          idx += 1;
          const run = vm.runInContext(
            `__wlRunLegendPipelineSim(${JSON.stringify({
              variant,
              marketId,
              startYear,
              years: config.years,
              seed,
              cohortMode: true,
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
  for (const v of config.variants) {
    pooledByVariant[v] = poolCohort(allRuns.filter((r) => r.variant === v));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config,
    runs: { total: allRuns.length, ok: allRuns.filter((r) => r.ok).length },
    pooledByVariant,
    gate2Verdict: gate2Verdict(pooledByVariant.E, pooledByVariant.A),
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(outMd, `${renderMd(report)}\n`, 'utf8');
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  for (const v of config.variants) {
    const p = pooledByVariant[v];
    console.log(
      `${v}: high-Q cohort=${p.cohortSize} (${p.pctOfAllCareers}% of careers) top failure=${p.failureRanked?.[0]?.factor || '—'}`,
    );
  }
}

main();
