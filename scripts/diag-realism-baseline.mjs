#!/usr/bin/env node
/**
 * Pin current simulation state as the realism baseline for delta reports.
 *
 *   npm run diag:realism-baseline
 *   npm run diag:realism-baseline -- --label=post-supply-phase1
 *   npm run diag:realism-baseline -- --include-market-suite --runs=10
 */
/* eslint-disable no-console */

import { readFileSync, existsSync } from 'fs';
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
import { saveBaseline, buildBaselinePayload, gitShortSha } from './editorial/baseline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = {
    label: 'default',
    seed: DEFAULT_EDITORIAL_SEED,
    includeMarketSuite: false,
    suiteRuns: 10,
    notes: '',
  };
  for (const a of argv) {
    if (a.startsWith('--label=')) o.label = a.slice(8).trim();
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_EDITORIAL_SEED;
    else if (a.startsWith('--notes=')) o.notes = a.slice(8);
    else if (a === '--include-market-suite') o.includeMarketSuite = true;
    else if (a.startsWith('--runs=')) o.suiteRuns = Math.max(1, parseInt(a.slice(7), 10) || 10);
  }
  return o;
}

function runMarketSuite(runs) {
  console.log(`▶ Market suite (playable-only, ${runs} runs)…`);
  const r = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'diag-market-suite.mjs'),
    '--playable-only',
    `--runs=${runs}`,
    '--json',
  ], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (!existsSync(paths.marketSuiteJson)) {
    console.warn('Market suite artifact missing; baseline will omit suite summary.');
    return null;
  }
  return JSON.parse(readFileSync(paths.marketSuiteJson, 'utf8'));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Pinning realism baseline "${opts.label}" (seed ${opts.seed}, git ${gitShortSha()})…`);

  console.log('▶ Reference panel…');
  const referencePanel = runReferencePanel({
    markets: REFERENCE_PANEL_MARKETS,
    years: REFERENCE_PANEL_YEARS,
    seed: opts.seed,
  });

  let marketSuite = null;
  if (opts.includeMarketSuite) {
    marketSuite = runMarketSuite(opts.suiteRuns);
  } else if (existsSync(paths.marketSuiteJson)) {
    console.log('▶ Using existing market_suite.json (pass --include-market-suite to refresh)');
    marketSuite = JSON.parse(readFileSync(paths.marketSuiteJson, 'utf8'));
  }

  const { metrics, topFormatsByCell, marketSuiteSummary } = buildBaselinePayload(referencePanel, marketSuite);
  const manifest = saveBaseline({
    label: opts.label,
    seed: opts.seed,
    referencePanel,
    marketSuiteSummary,
    metrics,
    topFormatsByCell,
    notes: opts.notes,
  });

  console.log(`\nBaseline pinned: ${manifest.label}`);
  console.log(`  ${paths.baselineManifest}`);
  console.log(`  ${paths.baselineMetrics}`);
  console.log(`  ${metrics ? Object.keys(metrics).length : 0} metrics`);
  console.log('\nCommit baseline/realism/ when this reflects a build you want to diff against.');
}

main();
