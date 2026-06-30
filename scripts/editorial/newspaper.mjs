/**
 * AIRWAVE EMPIRE realism & gameplay delta newspaper generator.
 */
import {
  diffMetrics,
  diffMarketSuite,
  topMovers,
  metricsFromReferencePanel,
  summarizeMarketSuite,
} from './metrics.mjs';
import {
  loadConcernRegistry,
  matchConcernsToDeltas,
  suggestNewConcerns,
  formatConcernSection,
} from './concerns.mjs';

function formatReferenceTable(panel) {
  const lines = [
    '## Reference panel — top formats',
    '',
    '| Market | Year | Top 5 formats | Spanish | Commercial |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const cell of (panel.cells || []).filter((c) => c.ok)) {
    const formats = (cell.topFormats || []).map((f) => `${f.format} ${(f.share <= 1 ? f.share * 100 : f.share).toFixed(1)}%`).join(', ');
    lines.push(
      `| ${cell.marketId} | ${cell.year} | ${formats || '—'} | ${(cell.spanishLaneShare * 100).toFixed(1)}% | ${cell.nCommDial} |`,
    );
  }
  return lines.join('\n');
}

export function generateNewspaper({
  referencePanel,
  marketSuite,
  baseline,
  gitSha,
  label,
}) {
  const { metrics: currentMetrics, topFormatsByCell } = metricsFromReferencePanel(referencePanel);
  const currentSuite = marketSuite ? summarizeMarketSuite(marketSuite) : null;

  const baselineMetrics = baseline?.metrics?.metrics || baseline?.metrics || {};
  const baselineSuite = baseline?.marketSuite || baseline?.metrics?.marketSuite || null;

  const metricDeltas = baselineMetrics && Object.keys(baselineMetrics).length
    ? diffMetrics(currentMetrics, baselineMetrics)
    : [];

  const suiteDiff = baselineSuite && currentSuite
    ? diffMarketSuite(currentSuite, baselineSuite)
    : { flips: [], overallChanged: false };

  const movers = topMovers(metricDeltas);
  const registry = loadConcernRegistry();
  const existingIds = new Set((registry.concerns || []).map((c) => c.id));
  const { matched, untouched } = matchConcernsToDeltas(registry, metricDeltas);
  const suggestions = suggestNewConcerns(metricDeltas, existingIds);

  const seed = referencePanel.meta.seed;
  const now = new Date().toISOString();

  const lines = [
    '# AIRWAVE EMPIRE — Realism & Gameplay Delta Report',
    '',
    `**Generated:** ${now}`,
    `**Build:** \`${gitSha}\`${label ? ` · ${label}` : ''}`,
    `**Baseline:** ${baseline?.manifest?.label || 'none'} (\`${baseline?.manifest?.gitSha || '—'}\`, ${baseline?.manifest?.pinnedAt?.slice(0, 10) || '—'})`,
    `**Reference panel seed:** ${seed}`,
    '',
  ];

  if (!baseline?.manifest) {
    lines.push('> No baseline pinned yet. Run `npm run diag:realism-baseline -- --label=initial` after reviewing this report.',
      '');
  }

  lines.push('## Executive summary', '');
  const sigCount = metricDeltas.filter((d) => d.significant).length;
  lines.push(`- **Significant metric moves:** ${sigCount}`);
  lines.push(`- **Market suite:** ${currentSuite?.overall || 'not run'}${suiteDiff.overallChanged ? ` (was ${suiteDiff.overallBaseline})` : ''}`);
  lines.push(`- **Verdict flips:** ${suiteDiff.flips?.length || 0}`);
  lines.push(`- **Chronic concerns tracked:** ${(registry.concerns || []).filter((c) => c.status !== 'resolved').length}`);
  lines.push('');

  lines.push('## Biggest winners', '');
  if (!movers.winners.length) lines.push('_No significant positive movers vs baseline._');
  for (const w of movers.winners) {
    const d = w.delta != null ? ` (${w.delta > 0 ? '+' : ''}${typeof w.delta === 'number' && w.kind === 'share' ? w.delta.toFixed(1) + ' pts' : w.delta})` : '';
    lines.push(`- ${w.summary}${d}`);
  }
  lines.push('');

  lines.push('## Biggest losers', '');
  if (!movers.losers.length) lines.push('_No significant negative movers vs baseline._');
  for (const l of movers.losers) {
    const d = l.delta != null ? ` (${l.delta > 0 ? '+' : ''}${typeof l.delta === 'number' && l.kind === 'share' ? l.delta.toFixed(1) + ' pts' : l.delta})` : '';
    lines.push(`- ${l.summary}${d}`);
  }
  lines.push('');

  lines.push(formatConcernSection(registry, { matched, untouched, suggestions, suiteDiff }));

  let refTable = formatReferenceTable(referencePanel);
  lines.push(refTable, '');

  lines.push('## AI review prompts', '');
  lines.push('Copy the JSON artifact (`realism_newspaper.json`) into your AI session, then run the prompts in `editorial/prompts/`.', '');
  lines.push('- **Chief Economist** → `chief_economist.md`');
  lines.push('- **Executive Producer** → `executive_producer.md`');
  lines.push('- **Fun Detector** → `fun_detector.md`');
  lines.push('- **Player Experience** → `player_experience.md`');
  lines.push('- **Historical spot check** → `historical_reviewer.md`');
  lines.push('');

  const report = {
    generatedAt: now,
    gitSha,
    label: label || null,
    baseline: baseline?.manifest || null,
    referencePanel: { meta: referencePanel.meta, cellCount: referencePanel.cells?.length },
    seed,
    summary: {
      significantMetricMoves: sigCount,
      marketSuiteOverall: currentSuite?.overall || null,
      marketSuiteChanged: suiteDiff.overallChanged,
      verdictFlips: suiteDiff.flips?.length || 0,
    },
    metricDeltas: metricDeltas.filter((d) => d.significant),
    allMetricDeltas: metricDeltas,
    movers,
    suiteDiff,
    concernMatches: matched.map(({ concern, deltas, moved }) => ({ id: concern.id, title: concern.title, moved, deltas })),
    suggestedConcerns: suggestions,
    topFormatsByCell,
    currentMetrics,
    referencePanelCells: (referencePanel.cells || []).map((c) => ({
      marketId: c.marketId,
      year: c.year,
      ok: c.ok,
      nBook: c.nBook,
      nCommDial: c.nCommDial,
      spanishLaneShare: c.spanishLaneShare,
      topShare: c.topShare,
      hhi: c.hhi,
      midTierCompetitors: c.midTierCompetitors,
      ranker: c.ranker,
      topFormats: c.topFormats,
      err: c.err,
    })),
    marketSuiteSummary: currentSuite,
  };

  return { markdown: `${lines.join('\n')}\n`, report };
}
