#!/usr/bin/env node
/**
 * Gate 2 Legend Platform A/B — platform/tenure/placement levers on top of E generation.
 *
 *   npm run diag:legend-platform-ab
 *   node scripts/diag-legend-platform-ab.mjs --variants=E,K --markets=chicago
 *
 * Output: tmp/legend_platform_ab.json, tmp/legend_platform_ab.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { VARIANTS, VARIANT_DEFS, patchLegacySource } from './diag-legend-platform-ab-patches.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const hooksPath = path.join(__dirname, 'diag-legend-platform-ab-hooks.vm.js');
const runnerPath = path.join(__dirname, 'diag-legend-pipeline-runner.vm.js');
const outJson = path.join(root, 'tmp', 'legend_platform_ab.json');
const outMd = path.join(root, 'tmp', 'legend_platform_ab.md');

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
  pctLegend: { lo: 0.3, hi: 1.0 },
  pctFranchise: { lo: 0.1, hi: 0.5 },
  medianCareerSpan: { lo: 4, hi: 14 },
  churnBefore10: { hi: 60 },
  trappedWeak: { hi: 35 },
  pctGte5x: { lo: 0.5, hi: 4 },
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
    seed: 20260610,
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
    }
  }
  return o;
}

function mean(nums) {
  const x = nums.filter(Number.isFinite);
  if (!x.length) return null;
  return Math.round((x.reduce((a, b) => a + b, 0) / x.length) * 100) / 100;
}

function median(nums) {
  const x = nums.filter(Number.isFinite).sort((a, b) => a - b);
  if (!x.length) return null;
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : Math.round((x[m - 1] + x[m]) / 2);
}

function poolSalary(careers) {
  const n = careers.length;
  const sal = careers.map((c) => c.lastSalary).filter((s) => s > 0);
  const mults = careers.map((c) => c.salaryMultMktMedian).filter(Number.isFinite);
  const highQ = careers.filter((c) => c.maxTrueQ >= 85);
  return {
    medianSalary: median(sal),
    p90Salary: percentile(sal, 0.9),
    p99Salary: percentile(sal, 0.99),
    maxSalary: sal.length ? Math.max(...sal) : null,
    pctGte5x: n ? mean(mults.map((m) => (m >= 5 ? 100 : 0))) : 0,
    pctGte10x: n ? mean(mults.map((m) => (m >= 10 ? 100 : 0))) : 0,
    pctHighQAtCap: highQ.length
      ? mean(highQ.map((c) => (c.everAtCap ? 100 : 0)))
      : 0,
  };
}

function percentile(nums, p) {
  const x = nums.filter(Number.isFinite).sort((a, b) => a - b);
  if (!x.length) return null;
  const idx = Math.floor(x.length * p);
  return x[Math.min(idx, x.length - 1)];
}

function poolLegendPipeline(careers) {
  const n = careers.length;
  return {
    pctElite: mean(careers.map((c) => (c.everElite ? 100 : 0))),
    pctLegendCand: mean(careers.map((c) => (c.everLegendCand ? 100 : 0))),
    pctFranchise: mean(careers.map((c) => (c.everFranchise ? 100 : 0))),
    medianYearsToLegend: median(
      careers.filter((c) => c.yearsToLegendCand != null).map((c) => c.yearsToLegendCand),
    ),
    medianYearsToFranchise: median(
      careers.filter((c) => c.yearsToFranchise != null).map((c) => c.yearsToFranchise),
    ),
  };
}

function poolVariant(runs) {
  const ok = runs.filter((r) => r.ok);
  if (!ok.length) return { runs: runs.length, ok: 0 };

  const careers = ok.flatMap((r) => r.careers || []);
  const cohorts = ok.map((r) => r.highQCohort).filter(Boolean);
  const totalCohort = cohorts.reduce((a, c) => a + (c.cohortSize || 0), 0);
  const totalCareers = ok.reduce((a, r) => a + (r.careerCount || 0), 0);

  const ct = (path) =>
    mean(cohorts.map((c) => path.split('.').reduce((o, k) => o?.[k], c)));

  const platformDiags = ok.map((r) => r.platformDiag).filter(Boolean);

  return {
    runs: runs.length,
    ok: ok.length,
    highQCohort: {
      size: totalCohort,
      pctOfCareers: totalCareers ? Math.round((totalCohort / totalCareers) * 10000) / 100 : 0,
      medianCareerSpan: ct('careerTrajectory.medianCareerSpanYrs'),
      pctTenure5Plus: ct('careerTrajectory.pctTenure5Plus'),
      pctTenure10Plus: ct('careerTrajectory.pctTenure10Plus'),
      pctTenure15Plus: ct('careerTrajectory.pctTenure15Plus'),
      pctStartTop5: ct('startingPlatform.pctStartTop5'),
      pctEverTop3: ct('careerTrajectory.pctEverTop3Station'),
      pctLegendPlatform: ct('careerTrajectory.pctEverLegendPlatform'),
      pctStrongAlignment: ct('platformAlignment.pctWithStrongPlatform'),
      pctTrappedWeak: ct('platformAlignment.pctScatteredWeak'),
      pctChurnBefore10: ct('careerTrajectory.pctDepartedBefore10yr'),
      pctWrongDaypart: ct('careerTrajectory.pctWrongDaypartHighQ'),
    },
    legendPipeline: poolLegendPipeline(careers),
    salary: poolSalary(careers),
    economy: {
      meanOq: mean(ok.map((r) => r.endEconomy?.meanOq)),
      pct9599: mean(ok.map((r) => r.endEconomy?.pct9599)),
      hhi: median(ok.map((r) => r.endEconomy?.hhi)),
      zombieLike: mean(ok.map((r) => r.endEconomy?.zombieLike)),
      spiralLike: mean(ok.map((r) => r.endEconomy?.spiralLike)),
      soloBankruptRuns: ok.filter((r) => r.endEconomy?.soloBankrupt).length,
    },
    platformDiag: {
      retentionSaves: mean(platformDiags.map((d) => d.retentionSaves || 0)),
      renewalBoosts: mean(platformDiags.map((d) => d.renewalBoosts || 0)),
      upwardPoaches: mean(platformDiags.map((d) => d.upwardPoaches || 0)),
      upwardPoachOffers: mean(platformDiags.map((d) => d.upwardPoachOffers || 0)),
      highQBorn: mean(platformDiags.map((d) => d.highQBorn || 0)),
    },
  };
}

function leverDelta(pooled, base, path) {
  const parts = path.split('.');
  const get = (obj) => parts.reduce((o, k) => o?.[k], obj);
  const b = get(base);
  const v = get(pooled);
  if (!Number.isFinite(b) || !Number.isFinite(v)) return null;
  return Math.round((v - b) * 100) / 100;
}

function analyzeLevers(pooled, eBase) {
  const levers = [
    { key: 'F', label: 'Drive-slot bias', variant: 'F' },
    { key: 'G', label: 'Top-station placement', variant: 'G' },
    { key: 'H', label: 'Retention / lock-in', variant: 'H' },
    { key: 'I', label: 'Upward poaching', variant: 'I' },
  ];
  const metrics = [
    ['highQCohort.medianCareerSpan', 'median career span'],
    ['highQCohort.pctChurnBefore10', 'churn before 10yr'],
    ['highQCohort.pctStartTop5', 'start top-5'],
    ['highQCohort.pctLegendPlatform', 'legend platform'],
    ['legendPipeline.pctLegendCand', 'legend candidates'],
    ['legendPipeline.pctFranchise', 'franchise'],
  ];

  const scores = levers.map((lev) => {
    const p = pooled[lev.variant];
    if (!p?.ok) return { ...lev, score: 0 };
    let score = 0;
    for (const [path] of metrics) {
      const d = leverDelta(p, eBase, path);
      if (path.includes('Churn') && d != null && d < 0) score += Math.abs(d) * 2;
      else if (path.includes('medianCareerSpan') && d != null && d > 0) score += d * 3;
      else if (d != null && d > 0) score += d * 1.5;
    }
    return { ...lev, score: Math.round(score * 10) / 10 };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

function recommendNext(pooled, eBase) {
  const lines = [];
  const k = pooled.K;
  const e = pooled.E || eBase;
  const j = pooled.J;

  if (!e?.ok) {
    lines.push('Baseline E missing — re-run grid.');
    return lines;
  }

  const best = ['J', 'K', 'H', 'G', 'F', 'I']
    .map((v) => ({ v, p: pooled[v] }))
    .filter((x) => x.p?.ok)
    .sort((a, b) => {
      const score = (p) =>
        (p.legendPipeline?.pctFranchise || 0) * 40 +
        (p.legendPipeline?.pctLegendCand || 0) * 25 +
        (p.highQCohort?.pctTenure10Plus || 0) * 0.5 -
        (p.highQCohort?.pctChurnBefore10 || 0) * 0.3;
      return score(b.p) - score(a.p);
    })[0];

  if (best) {
    lines.push(`Strongest Gate 2 package in grid: **${best.v}** (legend ${best.p.legendPipeline?.pctLegendCand ?? 0}%, franchise ${best.p.legendPipeline?.pctFranchise ?? 0}%).`);
  }

  const levers = analyzeLevers(pooled, e);
  if (levers[0]) {
    lines.push(`Single lever with most Gate 2 movement vs E: **${levers[0].label}** (${levers[0].key}).`);
  }

  if ((k?.legendPipeline?.pctFranchise || 0) > 0 || (j?.legendPipeline?.pctFranchise || 0) > 0) {
    lines.push('Franchise-tier personalities **do form** under combined platform variants — Gate 2 partially opens.');
    if ((k?.salary?.pctHighQAtCap || 0) > 20) {
      lines.push('Compensation caps bind a meaningful share of high-Q / legend talent — salary path may be the **next** diagnostic after platform placement.');
    }
  } else if ((k?.legendPipeline?.pctLegendCand || 0) > 0) {
    lines.push('Legend **candidates** appear but franchise tier still thin — tenure/top-3-years stack may need another diagnostic pass.');
  } else {
    lines.push('Legend/franchise still near zero — platform levers alone insufficient; station volatility or rank/share gates may need dedicated measurement.');
  }

  if ((k?.platformDiag?.upwardPoachOffers || 0) > 8) {
    lines.push('Upward poach offers elevated — watch poach spam if tuning for production.');
  }

  lines.push('**Next step (diagnostic only):** validate winning variant on player-flagship saves; do not ship until legend+franchise rates and economy guardrails hold across markets.');
  return lines;
}

function renderMd(report) {
  const lines = [];
  lines.push('# Gate 2 Legend Platform A/B');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Variants');
  lines.push('');
  for (const v of VARIANTS) lines.push(`- **${v}**: ${VARIANT_DEFS[v]}`);
  lines.push('');
  lines.push('## Comparison table');
  lines.push('');
  lines.push('| Var | High-Q % | Med span | Churn<10y | Start T5 | Legend plat | Strong align | Legend % | Franchise % | ≥5× sal | mean OQ | Ret saves | Up poach |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');

  for (const v of VARIANTS) {
    const p = report.pooledByVariant[v];
    if (!p?.ok) continue;
    const h = p.highQCohort;
    const l = p.legendPipeline;
    const s = p.salary;
    const e = p.economy;
    const d = p.platformDiag;
    lines.push(
      `| ${v} | ${h.pctOfCareers ?? '—'}% | ${h.medianCareerSpan ?? '—'}y | ${h.pctChurnBefore10 ?? '—'}% | ${h.pctStartTop5 ?? '—'}% | ${h.pctLegendPlatform ?? '—'}% | ${h.pctStrongAlignment ?? '—'}% | ${l.pctLegendCand ?? '—'}% | ${l.pctFranchise ?? '—'}% | ${s.pctGte5x ?? '—'}% | ${e.meanOq ?? '—'} | ${Math.round(d.retentionSaves ?? 0)} | ${Math.round((d.upwardPoaches ?? 0) + (d.upwardPoachOffers ?? 0))} |`,
    );
  }
  lines.push('');
  lines.push('## Lever ranking vs E (Gate 2 movement)');
  lines.push('');
  for (const row of report.leverRanking || []) {
    lines.push(`- **${row.label} (${row.key})** — score ${row.score}`);
  }
  lines.push('');
  lines.push('## Recommendation');
  lines.push('');
  for (const line of report.recommendation || []) lines.push(line);
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
          if (!run.ok) console.error(`FAIL ${variant} ${marketId}: ${run.error}`);
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
    leverRanking: analyzeLevers(pooledByVariant, pooledByVariant.E),
    recommendation: recommendNext(pooledByVariant, pooledByVariant.E),
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(outMd, `${renderMd(report)}\n`, 'utf8');
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  for (const v of config.variants) {
    const p = pooledByVariant[v];
    if (!p?.ok) continue;
    console.log(
      `${v}: highQ=${p.highQCohort.pctOfCareers}% span=${p.highQCohort.medianCareerSpan}y legend=${p.legendPipeline.pctLegendCand}% franchise=${p.legendPipeline.pctFranchise}%`,
    );
  }
}

main();
