#!/usr/bin/env node
/**
 * Full editorial realism report — reference panel + newspaper + gate summary.
 *
 *   npm run diag:realism-report
 *   npm run diag:realism-report -- --full
 *   npm run diag:realism-report -- --pin-baseline --label=post-change
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  REFERENCE_PANEL_MARKETS,
  REFERENCE_PANEL_YEARS,
  DEFAULT_EDITORIAL_SEED,
  paths,
  root,
} from './editorial/config.mjs';
import { runReferencePanel } from './editorial/simSnapshot.mjs';
import { loadBaseline, saveBaseline, buildBaselinePayload, gitShortSha, baselineExists } from './editorial/baseline.mjs';
import { generateNewspaper } from './editorial/newspaper.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = {
    seed: DEFAULT_EDITORIAL_SEED,
    full: false,
    pinBaseline: false,
    label: 'snapshot',
    suiteRuns: 10,
  };
  for (const a of argv) {
    if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_EDITORIAL_SEED;
    else if (a === '--full') o.full = true;
    else if (a === '--pin-baseline') o.pinBaseline = true;
    else if (a.startsWith('--label=')) o.label = a.slice(8).trim();
    else if (a.startsWith('--runs=')) o.suiteRuns = Math.max(1, parseInt(a.slice(7), 10) || 10);
  }
  return o;
}

function runMarketSuite(runs) {
  console.log(`▶ Market suite (${runs} runs)…`);
  spawnSync(process.execPath, [
    path.join(root, 'scripts', 'diag-market-suite.mjs'),
    '--playable-only',
    `--runs=${runs}`,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (!existsSync(paths.marketSuiteJson)) return null;
  return JSON.parse(readFileSync(paths.marketSuiteJson, 'utf8'));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();

  console.log('Editorial realism report\n');

  console.log(`▶ Reference panel (seed ${opts.seed})…`);
  const referencePanel = runReferencePanel({
    markets: REFERENCE_PANEL_MARKETS,
    years: REFERENCE_PANEL_YEARS,
    seed: opts.seed,
  });
  mkdirSync(path.dirname(paths.referencePanelOut), { recursive: true });
  writeFileSync(paths.referencePanelOut, `${JSON.stringify(referencePanel, null, 2)}\n`);

  let marketSuite = null;
  if (opts.full) {
    marketSuite = runMarketSuite(opts.suiteRuns);
  } else if (existsSync(paths.marketSuiteJson)) {
    console.log('▶ Using cached market_suite.json');
    marketSuite = JSON.parse(readFileSync(paths.marketSuiteJson, 'utf8'));
  }

  if (opts.pinBaseline) {
    console.log(`▶ Pinning baseline "${opts.label}"…`);
    const { metrics, topFormatsByCell, marketSuiteSummary } = buildBaselinePayload(referencePanel, marketSuite);
    saveBaseline({
      label: opts.label,
      seed: opts.seed,
      referencePanel,
      marketSuiteSummary,
      metrics,
      topFormatsByCell,
    });
  }

  const baseline = loadBaseline();
  const { markdown, report } = generateNewspaper({
    referencePanel,
    marketSuite,
    baseline,
    gitSha: gitShortSha(),
    label: opts.label !== 'snapshot' ? opts.label : null,
  });

  mkdirSync(paths.newspaperDir, { recursive: true });
  const mdPath = path.join(paths.newspaperDir, 'realism_newspaper.md');
  const jsonPath = path.join(paths.newspaperDir, 'realism_newspaper.json');
  writeFileSync(mdPath, markdown);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const bundlePath = path.join(paths.newspaperDir, 'review_bundle.md');
  const promptRefs = [
    'editorial/prompts/chief_economist.md',
    'editorial/prompts/historical_reviewer.md',
    'editorial/prompts/fun_detector.md',
    'editorial/prompts/executive_producer.md',
  ];
  writeFileSync(
    bundlePath,
    [
      '# AI review bundle',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Artifacts',
      `- ${mdPath}`,
      `- ${jsonPath}`,
      `- ${paths.referencePanelOut}`,
      '',
      '## Prompts',
      ...promptRefs.map((p) => `- \`${p}\``),
      '',
      '## Quick summary',
      `- Significant moves: ${report.summary.significantMetricMoves}`,
      `- Market suite: ${report.summary.marketSuiteOverall}`,
      `- Chronic concerns: ${(report.concernMatches || []).length} moved, ${report.suggestedConcerns?.length || 0} suggested new`,
      '',
      'Paste `realism_newspaper.json` into AI with a prompt from `editorial/prompts/`.',
      '',
    ].join('\n'),
  );

  console.log('\n' + '═'.repeat(60));
  console.log(markdown.split('\n').slice(0, 25).join('\n'));
  console.log('…\n');
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  ${mdPath}`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${bundlePath}`);
  if (!baselineExists()) {
    console.log('\nTip: npm run diag:realism-baseline -- --label=initial');
  }
}

main();
