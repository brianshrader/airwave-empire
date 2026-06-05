#!/usr/bin/env node
/**
 * Legend pipeline diagnostic — funnel, compensation, cap/poach, bottlenecks.
 *
 *   npm run diag:legend-pipeline
 *   node scripts/diag-legend-pipeline.mjs --markets=losangeles,newyork --years=32
 *
 * Output: tmp/legend_pipeline.json, tmp/legend_pipeline.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const runnerPath = path.join(__dirname, 'diag-legend-pipeline-runner.vm.js');
const outJson = path.join(root, 'tmp', 'legend_pipeline.json');
const outMd = path.join(root, 'tmp', 'legend_pipeline.md');

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
    removeEventListener() {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    style: { setProperty() {} },
    dataset: {},
    setAttribute() {},
    getAttribute() { return null; },
    contains() { return false; },
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
  getElementById(id) {
    const el = stubEl();
    if (id === 'abtn') el.disabled = false;
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
    location: { reload() {}, href: 'http://127.0.0.1/' },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    setInterval() { return 0; },
    clearTimeout() {},
    alert() {},
    fetch: null,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    parseInt,
    parseFloat,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, renderStatus() {} };
  return ctx;
}

function loadVm(marketId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(
    injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
    ctx,
    { filename: 'legacy.js',
      timeout: 600_000 },
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
    markets: ['wichita', 'nashville', 'chicago', 'sanfrancisco', 'newyork', 'losangeles'],
    years: 32,
    startYear: 1970,
    seeds: 2,
    seed: 20260607,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) {
      o.markets = a
        .slice(10)
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith('--years=')) o.years = parseInt(a.slice(8), 10) || o.years;
    else if (a.startsWith('--start-year=')) o.startYear = parseInt(a.slice(13), 10) || o.startYear;
    else if (a.startsWith('--seeds=')) o.seeds = Math.max(1, parseInt(a.slice(8), 10) || 2);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a === '--all-markets') o.markets = [...ALL_PLAYABLE_MARKET_IDS];
  }
  return o;
}

function median(nums) {
  const x = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!x.length) return null;
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : Math.round((x[m - 1] + x[m]) / 2);
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 10000) / 100;
}

function percentile(nums, p) {
  const x = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!x.length) return null;
  const idx = Math.floor(x.length * p);
  return x[Math.min(idx, x.length - 1)];
}

function tierSalaryStats(careers, filterFn) {
  const sub = careers.filter(filterFn);
  const sal = sub.map((c) => c.lastSalary).filter((s) => s > 0);
  const mktMult = sub.map((c) => c.salaryMultMktMedian).filter(Number.isFinite);
  const stnMult = sub.map((c) => c.salaryMultStnMedian).filter(Number.isFinite);
  return {
    n: sub.length,
    medianSalary: median(sal),
    p90Salary: percentile(sal, 0.9),
    p99Salary: percentile(sal, 0.99),
    medianMultMkt: median(mktMult),
    p90MultMkt: percentile(mktMult, 0.9),
    medianMultStn: median(stnMult),
    p90MultStn: percentile(stnMult, 0.9),
  };
}

function summarizeCareers(careers, label) {
  const n = careers.length;
  if (!n) return { label, n: 0 };

  const stars = careers.filter((c) => c.everStar);
  const elites = careers.filter((c) => c.everElite);
  const legends = careers.filter((c) => c.everLegendCand);
  const franchises = careers.filter((c) => c.everFranchise);

  const timeMed = (field) =>
    median(
      careers.filter((c) => c[field] != null).map((c) => c[field]),
    );

  const nearMiss = careers.filter(
    (c) => !c.everLegendCand && c.maxTrueQ >= 85 && c.maxTenureYrs >= 10,
  );
  const starNearMiss = careers.filter(
    (c) => !c.everLegendCand && c.everStar && c.maxTenureYrs >= 10,
  );
  const limiterCounts = {};
  for (const c of nearMiss) {
    const L = c.firstLimiter || 'unknown';
    limiterCounts[L] = (limiterCounts[L] || 0) + 1;
  }
  const starLimiterCounts = {};
  for (const c of starNearMiss) {
    let L = c.firstLimiter || 'unknown';
    if (c.maxTrueQ < 85) L = 'quality_trueQ_below_85';
    starLimiterCounts[L] = (starLimiterCounts[L] || 0) + 1;
  }
  const limiterRanked = Object.entries(limiterCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([factor, count]) => ({
      factor,
      count,
      pctOfNearMiss: pct(count, nearMiss.length),
    }));
  const starLimiterRanked = Object.entries(starLimiterCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([factor, count]) => ({
      factor,
      count,
      pctOfStarNearMiss: pct(count, starNearMiss.length),
    }));

  const franchiseBlockerCounts = {};
  for (const c of legends.filter((x) => !x.everFranchise)) {
    for (const b of c.franchiseBlockers || []) {
      franchiseBlockerCounts[b] = (franchiseBlockerCounts[b] || 0) + 1;
    }
  }
  const franchiseBlockerRanked = Object.entries(franchiseBlockerCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([factor, count]) => ({ factor, count }));

  const legendSub = legends;
  const franchiseSub = franchises;

  return {
    label,
    n,
    pipelineSurvival: {
      pctStar: pct(stars.length, n),
      pctElite: pct(elites.length, n),
      pctLegendCandidate: pct(legends.length, n),
      pctFranchiseLegend: pct(franchises.length, n),
      counts: {
        star: stars.length,
        elite: elites.length,
        legendCandidate: legends.length,
        franchiseLegend: franchises.length,
      },
    },
    timeToTierMedianYears: {
      star: timeMed('yearsToStar'),
      elite: timeMed('yearsToElite'),
      legendCandidate: timeMed('yearsToLegendCand'),
      franchiseLegend: timeMed('yearsToFranchise'),
    },
    salaryByTier: {
      ordinary: tierSalaryStats(careers, () => true),
      star: tierSalaryStats(careers, (c) => c.everStar),
      elite: tierSalaryStats(careers, (c) => c.everElite),
      legendCandidate: tierSalaryStats(careers, (c) => c.everLegendCand),
      franchiseLegend: tierSalaryStats(careers, (c) => c.everFranchise),
      endStateStarNotLegend: tierSalaryStats(
        careers,
        (c) => c.everStar && !c.everLegendCand,
      ),
    },
    stationDependence: {
      legendCandidate: legendSub.length
        ? {
            avgBookRank: Math.round(
              (legendSub.reduce((a, c) => a + (c.lastBookRank || 0), 0) / legendSub.length) * 10,
            ) / 10,
            avgSharePct:
              Math.round(
                (legendSub.reduce((a, c) => a + (c.lastSharePct || 0), 0) / legendSub.length) * 10,
              ) / 10,
            avgTenureYrs:
              Math.round(
                (legendSub.reduce((a, c) => a + (c.lastTenureYrs || 0), 0) / legendSub.length) * 10,
              ) / 10,
            avgYearsAtRank1: median(legendSub.map((c) => c.yearsAtRank1)),
            avgYearsTop3: median(legendSub.map((c) => c.yearsTop3)),
          }
        : null,
      franchiseLegend: franchiseSub.length
        ? {
            avgBookRank: Math.round(
              (franchiseSub.reduce((a, c) => a + (c.lastBookRank || 0), 0) / franchiseSub.length) *
                10,
            ) / 10,
            avgSharePct:
              Math.round(
                (franchiseSub.reduce((a, c) => a + (c.lastSharePct || 0), 0) / franchiseSub.length) *
                  10,
              ) / 10,
            avgTenureYrs:
              Math.round(
                (franchiseSub.reduce((a, c) => a + (c.lastTenureYrs || 0), 0) / franchiseSub.length) *
                  10,
              ) / 10,
            avgYearsAtRank1: median(franchiseSub.map((c) => c.yearsAtRank1)),
            avgYearsTop3: median(franchiseSub.map((c) => c.yearsTop3)),
          }
        : null,
    },
    capInteraction: {
      legendCandidate: summarizeCapSlice(legendSub),
      franchiseLegend: summarizeCapSlice(franchiseSub),
    },
    poachInteraction: {
      legendCandidate: summarizePoachSlice(legendSub),
      franchiseLegend: summarizePoachSlice(franchiseSub),
    },
    trueQualityCeiling: {
      maxObservedTrueQ: Math.max(...careers.map((c) => c.maxTrueQ || 0), 0),
      pctCareersMaxTrueQ75: pct(careers.filter((c) => c.maxTrueQ >= 75).length, n),
      pctCareersMaxTrueQ85: pct(careers.filter((c) => c.maxTrueQ >= 85).length, n),
      pctCareersMaxTrueQ90: pct(careers.filter((c) => c.maxTrueQ >= 90).length, n),
      pctCareersMaxDisplayQ85: pct(careers.filter((c) => c.maxDisplayQ >= 85).length, n),
    },
    bottleneckNearMiss: {
      nearMissCount: nearMiss.length,
      pctOfAllCareers: pct(nearMiss.length, n),
      firstLimiterRanked: limiterRanked,
      starNearMissCount: starNearMiss.length,
      starNearMissPct: pct(starNearMiss.length, n),
      starFirstLimiterRanked: starLimiterRanked,
    },
    franchisePromotionBlockers: {
      legendCandidatesNotFranchise: legends.length - franchises.length,
      blockerRanked: franchiseBlockerRanked,
    },
    topFranchiseRows: franchises
      .sort((a, b) => b.lastSalary - a.lastSalary)
      .slice(0, 12)
      .map((c) => ({
        name: c.name,
        marketId: c.marketId,
        salary: c.lastSalary,
        multMkt: c.salaryMultMktMedian,
        tenure: c.lastTenureYrs,
        rank: c.lastBookRank,
        share: c.lastSharePct,
        maxQ: c.maxTrueQ,
        yearsTop3: c.yearsTop3,
        capBoundYears: c.capBoundYears,
        poachCoursings: c.poachCoursings,
      })),
  };
}

function summarizeCapSlice(sub) {
  if (!sub.length) return { n: 0 };
  return {
    n: sub.length,
    pctEverAtCap: pct(sub.filter((c) => c.everAtCap).length, sub.length),
    pctEverAboveCap: pct(sub.filter((c) => c.everAboveCap).length, sub.length),
    medianCapBoundYears: median(sub.map((c) => c.capBoundYears)),
    medianUncappedFallEnd: median(sub.map((c) => c.lastUncappedFall)),
    medianSalary: median(sub.map((c) => c.lastSalary)),
  };
}

function summarizePoachSlice(sub) {
  if (!sub.length) return { n: 0 };
  const withPoach = sub.filter((c) => (c.poachCoursings || 0) > 0);
  return {
    n: sub.length,
    pctReceivedPoachInterest: pct(withPoach.length, sub.length),
    medianPoachCoursings: median(sub.map((c) => c.poachCoursings || 0)),
    medianOfferPremiumPct: median(
      sub.map((c) => c.avgPoachOfferPremiumPct).filter(Number.isFinite),
    ),
    medianStationMoves: median(sub.map((c) => c.stationMoves || 0)),
    totalSuccessfulPoachesOut: sub.reduce((a, c) => a + (c.successfulPoachesOut || 0), 0),
  };
}

function buildMegaVsLegendCreation(careers) {
  const byTier = {};
  for (const tier of ['small', 'medium', 'large', 'mega']) {
    const sub = careers.filter((c) => c.rankTier === tier);
    if (!sub.length) continue;
    const s = summarizeCareers(sub, tier);
    byTier[tier] = {
      careers: sub.length,
      pctFranchise: s.pipelineSurvival.pctFranchiseLegend,
      pctLegend: s.pipelineSurvival.pctLegendCandidate,
      pctStar: s.pipelineSurvival.pctStar,
      medianSalaryStar: s.salaryByTier.star.medianSalary,
      medianSalaryLegend: s.salaryByTier.legendCandidate.medianSalary,
      franchiseCount: s.pipelineSurvival.counts.franchiseLegend,
      legendCount: s.pipelineSurvival.counts.legendCandidate,
    };
  }
  const mega = byTier.mega;
  const small = byTier.small;
  return {
    byTier,
    megaCreatesMoreLegends:
      mega && small ? mega.pctLegend > small.pctLegend * 1.5 : null,
    megaPaysMoreWithoutMoreLegends:
      mega && small
        ? mega.medianSalaryStar > (small.medianSalaryStar || 0) * 1.2 &&
          mega.pctFranchise <= small.pctFranchise * 1.2
        : null,
    interpretation:
      mega && small
        ? mega.pctFranchise > small.pctFranchise * 2
          ? 'Mega markets produce more franchise-tier talent (creation), not only higher pay.'
          : mega.medianSalaryStar > (small.medianSalaryStar || 0) * 1.25 &&
              mega.pctFranchise <= small.pctFranchise * 1.5
            ? 'Mega markets chiefly lift star pay; franchise creation rates stay similar or only modestly higher.'
            : 'Mixed — review per-tier funnel and salary tables.'
        : 'Insufficient tier coverage.',
  };
}

function rankFranchiseCauses(report) {
  const g = report.global;
  const n = g.n || 1;
  const causes = [];
  const surv = g.pipelineSurvival;
  const ceil = g.trueQualityCeiling || {};

  if ((ceil.pctCareersMaxTrueQ85 || 0) < 1) {
    causes.push({
      cause: 'Talent generation ceiling: trueQ rarely reaches elite/legend thresholds (85/90)',
      metric: `max observed trueQ ${ceil.maxObservedTrueQ ?? report.trueQCeilingPooled?.maxObservedAcrossRuns ?? '—'}; ${ceil.pctCareersMaxTrueQ85 ?? 0}% careers ever ≥85 trueQ (QRG star hire ≤82, Fall cap 94)`,
      weight: 500,
    });
  }

  causes.push({
    cause: 'Upstream: few careers reach legend-candidate gate (station rank + share + tenure)',
    metric: `${surv.pctLegendCandidate}% legend candidates vs ${surv.pctStar}% stars`,
    weight: Math.max(0, 100 - surv.pctLegendCandidate * 20),
  });

  const starBn = g.bottleneckNearMiss?.starFirstLimiterRanked || [];
  const topStarBn = starBn[0];
  if (topStarBn) {
    causes.push({
      cause: `Among stars with 10yr+ tenure (no legend): #1 limiter = ${topStarBn.factor}`,
      metric: `${topStarBn.count} careers (${topStarBn.pctOfStarNearMiss}% of star near-miss)`,
      weight: topStarBn.pctOfStarNearMiss * 1.2,
    });
  }

  const bn = g.bottleneckNearMiss?.firstLimiterRanked || [];
  const topBn = bn[0];
  if (topBn) {
    causes.push({
      cause: `Station success gate: near-miss limiter #1 = ${topBn.factor} (${topBn.pctOfNearMiss}% of Q≥85, tenure≥10 non-legends)`,
      metric: `${topBn.count} careers`,
      weight: topBn.pctOfNearMiss,
    });
  }

  const fb = g.franchisePromotionBlockers?.blockerRanked || [];
  for (const row of fb.slice(0, 4)) {
    causes.push({
      cause: `Franchise tier blocker: ${row.factor}`,
      metric: `${row.count} legend candidates`,
      weight: row.count * 8,
    });
  }

  const cap = g.capInteraction?.legendCandidate;
  if (cap?.n) {
    causes.push({
      cause: 'Compensation: cap binding on legend candidates',
      metric: `${cap.pctEverAtCap}% ever at cap, median ${cap.medianSalary != null ? '$' + cap.medianSalary.toLocaleString() : '—'}`,
      weight: cap.pctEverAtCap * 0.6,
    });
  }

  const poach = g.poachInteraction?.legendCandidate;
  if (poach?.n) {
    causes.push({
      cause: 'Poaching / mobility interrupts long anchor tenures',
      metric: `${poach.medianStationMoves} median station moves among legends`,
      weight: (poach.medianStationMoves || 0) * 12,
    });
  }

  causes.push({
    cause: 'Franchise definition stack (15yr + 10yr top-3 + 10% share + Q≥90 + poach/cap history)',
    metric: `${surv.pctFranchiseLegend}% franchise vs ${surv.pctLegendCandidate}% legend candidate`,
    weight: Math.max(1, (surv.pctLegendCandidate - surv.pctFranchiseLegend) * 15),
  });

  causes.sort((a, b) => b.weight - a.weight);
  return causes;
}

function poolTrueQCeiling(runs) {
  const ceilings = runs.filter((r) => r.ok && r.trueQCeiling).map((r) => r.trueQCeiling);
  if (!ceilings.length) return null;
  const maxObs = Math.max(...ceilings.map((c) => c.maxObserved || 0));
  const pct85 =
    ceilings.reduce((a, c) => a + (c.pctReach85 || 0), 0) / ceilings.length;
  return { maxObservedAcrossRuns: maxObs, meanPctReach85: Math.round(pct85 * 10) / 10, samples: ceilings };
}

function buildReport(runs, config) {
  const careers = runs.filter((r) => r.ok).flatMap((r) => r.careers);
  const report = {
    generatedAt: new Date().toISOString(),
    config,
    methodology: {
      tiers: {
        ordinary: 'All on-air paid talent careers (first appearance with salary > 0)',
        star: 'trueQ ≥ 75 OR market top-10% trueQ (Fall snapshot)',
        elite: 'trueQ ≥ 85, morning/afternoon drive, station book rank ≤ 5',
        legendCandidate:
          'Same Fall: tenure ≥ 10yr at station, rank ≤ 3, share ≥ 8%, trueQ ≥ 85',
        franchiseLegend:
          'tenure ≥ 15yr, ≥ 10 calendar years in top-3 (Fall periods/2), max share ≥ 10%, trueQ ≥ 90, ≥ 2 poach courtings OR ≥ 8 Fall periods at cap',
      },
      sim: 'Headless genMarket + advTurn; not player saves',
      tenure: 'Calendar years since talent._hireYear at current station',
      poach: '_rivalPoachPending + _poachLastCourtingTurn on talent',
      bottleneck:
        'Talents with max trueQ ≥ 85 and max tenure ≥ 10 who never hit legend candidate — first missing gate at earliest qualifying Fall',
    },
    runs: { total: runs.length, ok: runs.filter((r) => r.ok).length },
    careerRows: careers.length,
    trueQCeilingPooled: poolTrueQCeiling(runs),
    global: summarizeCareers(careers, 'all markets pooled'),
    byMarket: {},
    byRankTier: {},
    megaMarketQuestion: {},
    franchiseRateAnswer: {},
  };

  for (const mkt of [...new Set(careers.map((c) => c.marketId))]) {
    report.byMarket[mkt] = summarizeCareers(
      careers.filter((c) => c.marketId === mkt),
      mkt,
    );
  }
  for (const tier of ['small', 'medium', 'large', 'mega']) {
    const sub = careers.filter((c) => c.rankTier === tier);
    if (sub.length) report.byRankTier[tier] = summarizeCareers(sub, tier);
  }

  report.megaMarketQuestion = buildMegaVsLegendCreation(careers);
  report.franchiseRateAnswer = {
    observedFranchisePct: report.global.pipelineSurvival.pctFranchiseLegend,
    headline:
      'Why does the simulation currently produce only ~0.1–0.2% franchise-tier talent?',
    rankedCauses: rankFranchiseCauses(report),
    diagnosis:
      (report.global.trueQualityCeiling?.pctCareersMaxTrueQ85 || 0) < 1
        ? 'Primarily upstream talent-generation (_trueQuality ceiling) — elite/legend/franchise tier gates are unreachable in cold sims before station-rank or salary-cap constraints matter.'
        : report.global.pipelineSurvival.pctFranchiseLegend < 0.5
          ? 'Primarily upstream station-success funnel (rank/share/tenure stack) — compensation caps are secondary.'
          : 'Mixed upstream and compensation — review ranked causes.',
  };

  return report;
}

function renderMd(report) {
  const lines = [];
  const g = report.global;
  const surv = g.pipelineSurvival || {};

  lines.push('# Legend pipeline diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Tier definitions');
  lines.push('');
  lines.push('| Tier | Criteria |');
  lines.push('| --- | --- |');
  lines.push('| Star | trueQ ≥ 75 or market top 10% |');
  lines.push('| Elite | trueQ ≥ 85, morning/afternoon drive, station rank ≤ 5 |');
  lines.push('| Legend candidate | 10yr tenure, rank ≤ 3, share ≥ 8%, trueQ ≥ 85 |');
  lines.push('| Franchise legend | 15yr tenure, 10yr top-3, share ≥ 10%, trueQ ≥ 90, poach/cap history |');
  lines.push('');
  lines.push('## 1. Pipeline survival (% of all hired careers)');
  lines.push('');
  lines.push('| Tier | % | Count |');
  lines.push('| --- | ---: | ---: |');
  lines.push(`| Star | ${surv.pctStar}% | ${surv.counts?.star ?? '—'} |`);
  lines.push(`| Elite | ${surv.pctElite}% | ${surv.counts?.elite ?? '—'} |`);
  lines.push(`| Legend candidate | ${surv.pctLegendCandidate}% | ${surv.counts?.legendCandidate ?? '—'} |`);
  lines.push(`| Franchise legend | ${surv.pctFranchiseLegend}% | ${surv.counts?.franchiseLegend ?? '—'} |`);
  lines.push(`| Career rows | — | ${g.n} |`);
  lines.push('');
  lines.push('## 2. Time to tier (median years from hire)');
  lines.push('');
  const t = g.timeToTierMedianYears || {};
  lines.push(`| Star | ${t.star ?? '—'} |`);
  lines.push(`| Elite | ${t.elite ?? '—'} |`);
  lines.push(`| Legend candidate | ${t.legendCandidate ?? '—'} |`);
  lines.push(`| Franchise legend | ${t.franchiseLegend ?? '—'} |`);
  lines.push('');
  lines.push('## 3. Salary progression by tier (end-state Fall)');
  lines.push('');
  for (const [tier, s] of Object.entries(g.salaryByTier || {})) {
    if (!s?.n) continue;
    lines.push(
      `**${tier}** (n=${s.n}) — median $${s.medianSalary?.toLocaleString() ?? '—'}, P90 $${s.p90Salary?.toLocaleString() ?? '—'}, P99 $${s.p99Salary?.toLocaleString() ?? '—'}, × market median ${s.medianMultMkt ?? '—'}, × station median ${s.medianMultStn ?? '—'}`,
    );
  }
  lines.push('');
  lines.push('## 4. Station dependence (legend / franchise subsets)');
  lines.push('');
  lines.push(JSON.stringify(g.stationDependence, null, 2).replace(/^/gm, ''));
  lines.push('');
  lines.push('## 5. Cap interaction');
  lines.push('');
  lines.push(JSON.stringify(g.capInteraction, null, 2).replace(/^/gm, ''));
  lines.push('');
  lines.push('## 6. Poaching interaction');
  lines.push('');
  lines.push(JSON.stringify(g.poachInteraction, null, 2).replace(/^/gm, ''));
  lines.push('');
  lines.push('## 7. Market tier effects');
  lines.push('');
  for (const [tier, s] of Object.entries(report.byRankTier || {})) {
    const p = s.pipelineSurvival;
    lines.push(
      `**${tier}** — franchise ${p.pctFranchiseLegend}%, legend ${p.pctLegendCandidate}%, star ${p.pctStar}%, star median $${s.salaryByTier?.star?.medianSalary?.toLocaleString() ?? '—'}`,
    );
  }
  lines.push('');
  lines.push(`**Mega vs creation:** ${report.megaMarketQuestion?.interpretation || '—'}`);
  lines.push('');
  lines.push('## trueQ ceiling (talent generation)');
  lines.push('');
  const ceil = g.trueQualityCeiling || {};
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Max observed trueQ (any career) | ${ceil.maxObservedTrueQ ?? '—'} |`);
  lines.push(`| % careers with max trueQ ≥ 75 | ${ceil.pctCareersMaxTrueQ75 ?? '—'}% |`);
  lines.push(`| % careers with max trueQ ≥ 85 | ${ceil.pctCareersMaxTrueQ85 ?? '—'}% |`);
  lines.push(`| % careers with max trueQ ≥ 90 | ${ceil.pctCareersMaxTrueQ90 ?? '—'}% |`);
  lines.push(`| % careers with max display quality ≥ 85 | ${ceil.pctCareersMaxDisplayQ85 ?? '—'}% |`);
  lines.push('');
  lines.push('## 8. Bottleneck analysis');
  lines.push('');
  lines.push(`**Strict (trueQ ≥ 85, tenure ≥ 10, never legend):** ${g.bottleneckNearMiss?.nearMissCount ?? 0} careers`);
  lines.push('');
  for (const row of g.bottleneckNearMiss?.firstLimiterRanked || []) {
    lines.push(`- **${row.factor}**: ${row.count} (${row.pctOfNearMiss}% of near-miss)`);
  }
  lines.push('');
  lines.push(`**Star + tenure ≥ 10, never legend:** ${g.bottleneckNearMiss?.starNearMissCount ?? 0} (${g.bottleneckNearMiss?.starNearMissPct ?? 0}% of all)`);
  lines.push('');
  for (const row of g.bottleneckNearMiss?.starFirstLimiterRanked || []) {
    lines.push(`- **${row.factor}**: ${row.count} (${row.pctOfStarNearMiss}% of star near-miss)`);
  }
  lines.push('');
  lines.push('## Franchise promotion blockers (legend candidates who never franchise)');
  lines.push('');
  for (const row of g.franchisePromotionBlockers?.blockerRanked || []) {
    lines.push(`- ${row.factor}: ${row.count}`);
  }
  lines.push('');
  lines.push('## Key deliverable');
  lines.push('');
  lines.push(`### ${report.franchiseRateAnswer.headline}`);
  lines.push('');
  lines.push(`**Observed franchise rate:** ${report.franchiseRateAnswer.observedFranchisePct}% of career rows.`);
  lines.push('');
  lines.push('**Ranked causes (by measured contribution weight):**');
  lines.push('');
  let i = 1;
  for (const c of report.franchiseRateAnswer.rankedCauses || []) {
    lines.push(`${i}. ${c.cause} — ${c.metric}`);
    i += 1;
  }
  lines.push('');
  lines.push(`**Diagnosis:** ${report.franchiseRateAnswer.diagnosis}`);
  lines.push('');
  if (g.topFranchiseRows?.length) {
    lines.push('## Sample franchise legends');
    lines.push('');
    lines.push('| Name | Market | Salary | ×Mkt | Tenure | Rank | Share | Q | Yrs top-3 |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const r of g.topFranchiseRows) {
      lines.push(
        `| ${r.name} | ${r.marketId} | $${r.salary.toLocaleString()} | ${r.multMkt} | ${r.tenure} | #${r.rank} | ${r.share}% | ${r.maxQ} | ${r.yearsTop3} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const vmCache = new Map();
  const runs = [];
  let idx = 0;

  for (const marketId of config.markets) {
    if (!vmCache.has(marketId)) vmCache.set(marketId, loadVm(marketId));
    const ctx = vmCache.get(marketId);
    for (let s = 0; s < config.seeds; s++) {
      const seed = (config.seed + idx * 9973) >>> 0;
      idx += 1;
      const run = vm.runInContext(
        `__wlRunLegendPipelineSim(${JSON.stringify({
          marketId,
          startYear: config.startYear,
          years: config.years,
          seed,
        })})`,
        ctx,
      );
      runs.push(run);
      if (!run.ok) console.error(`FAIL ${marketId} seed=${seed}: ${run.error}`);
    }
  }

  const report = buildReport(runs, config);
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(outMd, `${renderMd(report)}\n`, 'utf8');
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  const surv = report.global.pipelineSurvival;
  console.log(
    `Star ${surv.pctStar}% · Elite ${surv.pctElite}% · Legend ${surv.pctLegendCandidate}% · Franchise ${surv.pctFranchiseLegend}%`,
  );
}

main();
