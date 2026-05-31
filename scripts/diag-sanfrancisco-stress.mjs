#!/usr/bin/env node
/**
 * San Francisco (and optional markets) long-run stress: AQH/share desync, zero revenue pool,
 * frozen book, stale ranker snap, NaN, advTurn crashes.
 *
 *   npm run diag:sanfrancisco-stress
 *   npm run diag:sanfrancisco-stress -- --runs=100
 *   npm run diag:sanfrancisco-stress -- --runs=25 --markets=sanfrancisco --seed=20260531
 *   npm run diag:sanfrancisco-stress -- --scenarios=under,fmrev,chrwar,gm_under --endYear=2026
 *
 * Artifacts:
 *   tmp/sanfrancisco_stress.json
 *   tmp/sanfrancisco_stress_failures.json (only when failures exist)
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  stabilityRoot as root,
  DEFAULT_STRESS_SCENARIOS,
  HARD_FAIL_TYPES,
  runStabilitySweep,
} from './marketStabilityHarness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outJson = path.join(root, 'tmp', 'sanfrancisco_stress.json');
const outFailures = path.join(root, 'tmp', 'sanfrancisco_stress_failures.json');

const DEFAULT_MARKETS = ['sanfrancisco'];

function parseCsvList(s, fallback) {
  if (!s || !String(s).trim()) return fallback.slice();
  return String(s)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const o = {
    markets: DEFAULT_MARKETS,
    scenarios: DEFAULT_STRESS_SCENARIOS,
    runs: 100,
    endYear: 2026,
    endPeriod: 2,
    seed: 20260531,
    maxTurns: 420,
    quiet: true,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) o.markets = parseCsvList(a.slice('--markets='.length), DEFAULT_MARKETS);
    else if (a.startsWith('--scenarios=')) {
      o.scenarios = parseCsvList(a.slice('--scenarios='.length), DEFAULT_STRESS_SCENARIOS);
    } else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice('--runs='.length), 10) || 100);
    else if (a.startsWith('--endYear=')) o.endYear = parseInt(a.slice('--endYear='.length), 10) || 2026;
    else if (a.startsWith('--endPeriod=')) o.endPeriod = parseInt(a.slice('--endPeriod='.length), 10) || 2;
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice('--seed='.length), 10) || o.seed;
    else if (a.startsWith('--maxTurns=')) o.maxTurns = parseInt(a.slice('--maxTurns='.length), 10) || 420;
    else if (a === '--verbose') o.quiet = false;
  }
  return o;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const sweep = runStabilitySweep({
    markets: opts.markets,
    runs: opts.runs,
    scenarios: opts.scenarios,
    endYear: opts.endYear,
    endPeriod: opts.endPeriod,
    seed: opts.seed,
    maxTurns: opts.maxTurns,
    quiet: opts.quiet,
  });

  const allFailures = [];
  const failuresByType = sweep.failuresByType;
  for (const run of sweep.runs) {
    for (const [t, c] of Object.entries(run.failureCounts || {})) {
      if (HARD_FAIL_TYPES.has(t) && allFailures.length < 500) {
        allFailures.push({ type: t, marketId: run.marketId, scenarioId: run.scenarioId, seed: run.seed });
      }
    }
  }

  const firstHard = allFailures[0] || null;
  const report = {
    generatedAt: new Date().toISOString(),
    options: opts,
    totals: sweep.totals,
    failuresByType,
    verdict: sweep.verdict,
    firstFailure: firstHard,
    runs: sweep.runs,
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  if (allFailures.length) {
    writeFileSync(
      outFailures,
      JSON.stringify(
        { generatedAt: report.generatedAt, verdict: sweep.verdict, failuresByType, failures: allFailures },
        null,
        2,
      ),
    );
  }

  console.log('San Francisco stress harness');
  console.log('  markets:', opts.markets.join(', '));
  console.log('  scenarios:', opts.scenarios.join(', '));
  console.log('  games:', sweep.totals.gamesSimulated, '· periods:', sweep.totals.periodsSimulated);
  console.log('  failures by type:', failuresByType);
  if (firstHard) {
    console.log('  first failure:', firstHard.type, '@', firstHard.marketId, firstHard.scenarioId, 'seed', firstHard.seed);
  }
  console.log('  verdict:', sweep.verdict);
  console.log('  wrote', outJson);
  if (allFailures.length) console.log('  wrote', outFailures);
  process.exit(sweep.verdict === 'FAIL' ? 1 : 0);
}

main();
