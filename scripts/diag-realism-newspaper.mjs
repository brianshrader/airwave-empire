#!/usr/bin/env node
/**
 * AIRWAVE EMPIRE — Automated Realism & Gameplay Delta Newspaper.
 *
 *   npm run diag:realism-newspaper
 *   npm run diag:realism-newspaper -- --full
 *   npm run diag:realism-newspaper -- --label=supply-phase1-test
 *
 * Artifacts: tmp/realism_newspaper/realism_newspaper.{md,json}
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
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
import { loadBaseline, gitShortSha, baselineExists } from './editorial/baseline.mjs';
import { generateNewspaper } from './editorial/newspaper.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = {
    seed: DEFAULT_EDITORIAL_SEED,
    full: false,
    label: '',
    skipPanel: false,
    suiteRuns: 10,
  };
  for (const a of argv) {
    if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_EDITORIAL_SEED;
    else if (a.startsWith('--label=')) o.label = a.slice(8).trim();
    else if (a === '--full') o.full = true;
    else if (a === '--skip-panel') o.skipPanel = true;
    else if (a.startsWith('--runs=')) o.suiteRuns = Math.max(1, parseInt(a.slice(7), 10) || 10);
  }
  return o;
}

function runMarketSuite(runs) {
  console.log(`▶ Market suite (playable-only, ${runs} runs)…`);
  spawnSync(process.execPath, [
    path.join(root, 'scripts', 'diag-market-suite.mjs'),
    '--playable-only',
    `--runs=${runs}`,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (!existsSync(paths.marketSuiteJson)) return null;
  return JSON.parse(readFileSync(paths.marketSuiteJson, 'utf8'));
}

function loadReferencePanel(opts) {
  if (opts.skipPanel && existsSync(paths.referencePanelOut)) {
    console.log('▶ Using cached reference panel');
    return JSON.parse(readFileSync(paths.referencePanelOut, 'utf8'));
  }
  console.log(`▶ Reference panel (seed ${opts.seed})…`);
  const panel = runReferencePanel({
    markets: REFERENCE_PANEL_MARKETS,
    years: REFERENCE_PANEL_YEARS,
    seed: opts.seed,
  });
  mkdirSync(path.dirname(paths.referencePanelOut), { recursive: true });
  writeFileSync(paths.referencePanelOut, `${JSON.stringify(panel, null, 2)}\n`);
  return panel;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();

  console.log('AIRWAVE EMPIRE — Realism & Gameplay Delta Report\n');

  if (!baselineExists()) {
    console.warn('⚠ No baseline pinned. Deltas will be empty until you run: npm run diag:realism-baseline -- --label=initial\n');
  }

  const referencePanel = loadReferencePanel(opts);

  let marketSuite = null;
  if (opts.full) {
    marketSuite = runMarketSuite(opts.suiteRuns);
  } else if (existsSync(paths.marketSuiteJson)) {
    console.log('▶ Using existing market_suite.json (pass --full to refresh)');
    marketSuite = JSON.parse(readFileSync(paths.marketSuiteJson, 'utf8'));
  } else {
    console.log('▶ Market suite skipped (no artifact; pass --full to run)');
  }

  const baseline = loadBaseline();
  const { markdown, report } = generateNewspaper({
    referencePanel,
    marketSuite,
    baseline,
    gitSha: gitShortSha(),
    label: opts.label || null,
  });

  mkdirSync(paths.newspaperDir, { recursive: true });
  const mdPath = path.join(paths.newspaperDir, 'realism_newspaper.md');
  const jsonPath = path.join(paths.newspaperDir, 'realism_newspaper.json');
  writeFileSync(mdPath, markdown);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log('\n' + markdown.split('\n').slice(0, 20).join('\n'));
  console.log(`\n… (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);
}

main();
