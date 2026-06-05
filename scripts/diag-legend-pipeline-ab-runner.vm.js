/**
 * Legend pipeline A/B metrics wrapper.
 * globalThis.__wlRunLegendPipelineAb(config)
 */
(function () {
  'use strict';

  if (typeof globalThis.__wlRunLegendPipelineSim !== 'function') {
    throw new Error('requires diag-legend-pipeline-runner.vm.js');
  }

  function pct(n, d) {
    if (!d) return 0;
    return Math.round((n / d) * 10000) / 100;
  }

  function median(nums) {
    const x = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (!x.length) return null;
    const m = Math.floor(x.length / 2);
    return x.length % 2 ? x[m] : Math.round((x[m - 1] + x[m]) / 2);
  }

  function percentile(nums, p) {
    const x = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (!x.length) return null;
    const idx = Math.floor(x.length * p);
    return x[Math.min(idx, x.length - 1)];
  }

  function buildCareerRow(c) {
    return {
      everStar: c.everStar,
      everElite: c.everElite,
      everLegendCand: c.everLegendCand,
      everFranchise: c.everFranchise,
      yearsToElite: c.yearsToElite,
      yearsToLegendCand: c.yearsToLegendCand,
      yearsToFranchise: c.yearsToFranchise,
      maxTrueQ: c.maxTrueQ,
      lastSalary: c.lastSalary,
      salaryMultMktMedian: c.salaryMultMktMedian,
      everAtCap: c.everAtCap,
      everAboveCap: c.everAboveCap,
      poachCoursings: c.poachCoursings || 0,
      avgPoachOfferPremiumPct: null,
    };
  }

  function summarizeMetrics(careers, run) {
    const n = careers.length;
    const maxTrueQs = careers.map((c) => c.maxTrueQ).filter(Number.isFinite);
    const endSal = careers.map((c) => c.lastSalary).filter((s) => s > 0);
    const mktMed = median(
      careers.map((c) => c.lastMktSalMedian).filter(Number.isFinite),
    ) || median(endSal) || 1;
    const mults = careers
      .map((c) => c.salaryMultMktMedian)
      .filter(Number.isFinite);

    const highQ = careers.filter((c) => c.maxTrueQ >= 85);
    const highQPoach = highQ.filter((c) => (c.poachCoursings || 0) > 0);
    const st = run.stationImpact || {};
    const econ = run.endEconomy || {};

    return {
      talentDistribution: {
        careerRows: n,
        medianTrueQ: median(maxTrueQs),
        p90TrueQ: percentile(maxTrueQs, 0.9),
        p99TrueQ: percentile(maxTrueQs, 0.99),
        maxTrueQ: maxTrueQs.length ? maxTrueQs[maxTrueQs.length - 1] : null,
        pctTrueQ75: pct(maxTrueQs.filter((q) => q >= 75).length, n),
        pctTrueQ85: pct(maxTrueQs.filter((q) => q >= 85).length, n),
        pctTrueQ90: pct(maxTrueQs.filter((q) => q >= 90).length, n),
      },
      legendPipeline: {
        pctStar: pct(careers.filter((c) => c.everStar).length, n),
        pctElite: pct(careers.filter((c) => c.everElite).length, n),
        pctLegendCandidate: pct(careers.filter((c) => c.everLegendCand).length, n),
        pctFranchiseLegend: pct(careers.filter((c) => c.everFranchise).length, n),
        medianYearsToElite: median(
          careers.filter((c) => c.yearsToElite != null).map((c) => c.yearsToElite),
        ),
        medianYearsToLegend: median(
          careers.filter((c) => c.yearsToLegendCand != null).map((c) => c.yearsToLegendCand),
        ),
        medianYearsToFranchise: median(
          careers.filter((c) => c.yearsToFranchise != null).map((c) => c.yearsToFranchise),
        ),
      },
      salaryConcentration: {
        marketMedianSalary: mktMed,
        p90Salary: percentile(endSal, 0.9),
        p99Salary: percentile(endSal, 0.99),
        maxSalary: endSal.length ? Math.max(...endSal) : null,
        pctGte2xMedian: pct(mults.filter((m) => m >= 2).length, n),
        pctGte3xMedian: pct(mults.filter((m) => m >= 3).length, n),
        pctGte5xMedian: pct(mults.filter((m) => m >= 5).length, n),
        pctGte10xMedian: pct(mults.filter((m) => m >= 10).length, n),
        pctPinnedAtCap: pct(careers.filter((c) => c.everAtCap).length, n),
        pctAboveCap: pct(careers.filter((c) => c.everAboveCap).length, n),
        pctHighQEverAtCap: pct(highQ.filter((c) => c.everAtCap).length, highQ.length || 1),
      },
      stationImpact: {
        avgShareLiftHighQEmployed: st.avgShareLiftHighQ,
        avgReplacementShareDrop: st.avgReplacementShareDrop,
        highQDepartures: st.highQDepartures || 0,
        poachAttemptsHighQ: highQ.reduce((a, c) => a + (c.poachCoursings || 0), 0),
        pctHighQWithPoachInterest: pct(highQPoach.length, highQ.length || 1),
        medianPoachPremiumHighQ: median(
          highQ.map((c) => c.avgPoachOfferPremiumPct).filter(Number.isFinite),
        ),
        avgIdentityPeakHighQStations: st.avgIdentityPeakHighQ,
      },
      economyGuardrails: econ,
    };
  }

  globalThis.__wlRunLegendPipelineAb = function runAb(config) {
    if (typeof wlLegendAbSetVariant === 'function') {
      wlLegendAbSetVariant(config.variant || 'A');
    }

    const run = globalThis.__wlRunLegendPipelineSim({
      marketId: config.marketId,
      startYear: config.startYear || 1970,
      years: config.years || 35,
      seed: config.seed >>> 0,
    });

    const summary = {
      variant: config.variant || 'A',
      marketId: config.marketId,
      startYear: config.startYear,
      years: config.years || 35,
      seed: config.seed,
      ok: run.ok,
      error: run.error,
    };

    if (!run.ok) return summary;

    const careers = (run.careers || []).map(buildCareerRow);
    summary.metrics = summarizeMetrics(careers, run);
    summary.careerCount = careers.length;
    summary.endYear = run.endYear;
    return summary;
  };
})();
