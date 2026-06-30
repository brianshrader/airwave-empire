#!/usr/bin/env node
/**
 * Lightweight pre-deploy realism gate.
 *
 *   npm run diag:realism-gate
 *   npm run diag:realism-gate -- --refresh
 *
 * Exit 0 = pass, 1 = investigate before ship.
 */
/* eslint-disable no-console */

import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { paths, root } from './editorial/config.mjs';
import { loadBaseline, baselineExists } from './editorial/baseline.mjs';
import { generateNewspaper } from './editorial/newspaper.mjs';
import { runReferencePanel } from './editorial/simSnapshot.mjs';
import { REFERENCE_PANEL_MARKETS, REFERENCE_PANEL_YEARS, DEFAULT_EDITORIAL_SEED } from './editorial/config.mjs';
import { gitShortSha } from './editorial/baseline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = { refresh: false };
  for (const a of argv) {
    if (a === '--refresh') o.refresh = true;
  }
  return o;
}

function loadOrRunNewspaper(refresh) {
  const jsonPath = path.join(paths.newspaperDir, 'realism_newspaper.json');
  if (!refresh && existsSync(jsonPath)) {
    return JSON.parse(readFileSync(jsonPath, 'utf8'));
  }

  if (refresh) {
    console.log('▶ Refreshing reference panel + newspaper…');
    const referencePanel = runReferencePanel({
      markets: REFERENCE_PANEL_MARKETS,
      years: REFERENCE_PANEL_YEARS,
      seed: DEFAULT_EDITORIAL_SEED,
    });
    let marketSuite = null;
    if (existsSync(paths.marketSuiteJson)) {
      marketSuite = JSON.parse(readFileSync(paths.marketSuiteJson, 'utf8'));
    }
    const baseline = loadBaseline();
    const { report } = generateNewspaper({
      referencePanel,
      marketSuite,
      baseline,
      gitSha: gitShortSha(),
    });
    return report;
  }

  if (existsSync(jsonPath)) return JSON.parse(readFileSync(jsonPath, 'utf8'));
  return null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const blockers = [];
  const warnings = [];

  console.log('Realism pre-deploy gate\n');

  if (!baselineExists()) {
    blockers.push('No baseline pinned — run: npm run diag:realism-baseline -- --label=initial');
  }

  const report = loadOrRunNewspaper(opts.refresh);
  if (!report) {
    blockers.push('No newspaper artifact — run: npm run diag:realism-newspaper');
  } else {
    if (report.summary?.marketSuiteOverall === 'FAIL') {
      blockers.push(`Market suite FAIL`);
    }
    const playableFails = (report.suiteDiff?.flips || []).filter(
      (f) => f.inPlayable && f.current === 'FAIL',
    );
    if (playableFails.length) {
      blockers.push(`Playable market(s) flipped to FAIL: ${playableFails.map((f) => f.marketId).join(', ')}`);
    }
    const playableWarnFlips = (report.suiteDiff?.flips || []).filter(
      (f) => f.inPlayable && f.current === 'WARN' && f.baseline === 'PASS',
    );
    if (playableWarnFlips.length) {
      warnings.push(`Playable market(s) PASS→WARN: ${playableWarnFlips.map((f) => f.marketId).join(', ')}`);
    }
    const sigMoves = report.summary?.significantMetricMoves ?? 0;
    if (sigMoves > 0) {
      warnings.push(`${sigMoves} significant metric move(s) vs baseline — review newspaper`);
    }
    if (report.suggestedConcerns?.length) {
      warnings.push(`${report.suggestedConcerns.length} suggested new concern(s)`);
    }
  }

  let suite = null;
  if (existsSync(paths.marketSuiteJson)) {
    suite = JSON.parse(readFileSync(paths.marketSuiteJson, 'utf8'));
    const playableFails = (suite.rows || []).filter((r) => r.audit?.inPlayable && r.overall === 'FAIL');
    if (playableFails.length) {
      blockers.push(`Market suite playable FAIL: ${playableFails.map((r) => r.marketId).join(', ')}`);
    }
  } else {
    warnings.push('No market_suite.json — run diag:market-suite or newspaper --full');
  }

  if (warnings.length) {
    console.log('Warnings:');
    for (const w of warnings) console.log(`  ⚠ ${w}`);
    console.log('');
  }

  if (blockers.length) {
    console.log('BLOCKED:');
    for (const b of blockers) console.log(`  ✗ ${b}`);
    console.log('\nGate: FAIL');
    process.exit(1);
  }

  console.log('Gate: PASS');
  if (report) {
    console.log(`  Build: ${report.gitSha}`);
    console.log(`  Baseline: ${report.baseline?.label || '—'}`);
    console.log(`  Suite: ${report.summary?.marketSuiteOverall || '—'}`);
    console.log(`  Significant moves: ${report.summary?.significantMetricMoves ?? '—'}`);
  }
  process.exit(0);
}

main();
