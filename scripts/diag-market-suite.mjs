#!/usr/bin/env node
/**
 * Market QA suite orchestrator — runs existing diagnostic harnesses and emits PASS/WARN/FAIL dashboard.
 * Diagnostic/reporting only (no gameplay, billing, picker, or exposure changes).
 *
 *   npm run diag:market-suite
 *   npm run diag:market-suite -- --runs=10
 *   npm run diag:market-suite -- --markets=sanfrancisco,phoenix --runs=10
 *   npm run diag:market-suite -- --playable-only --runs=10
 *   npm run diag:market-suite -- --runs=100 --deep
 *
 * Artifacts: tmp/market_suite/market_suite.{json,md,csv}
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import {
  runStabilitySweep,
  DEFAULT_STRESS_SCENARIOS,
  FAST_STRESS_SCENARIOS,
} from './marketStabilityHarness.mjs';

const require = createRequire(import.meta.url);
const {
  ALL_PLAYABLE_MARKET_IDS,
  DIAG_ONLY_MARKET_IDS,
  DEV_PLAYTEST_MARKET_IDS,
} = require('./market-ids.cjs');
const planMarkets = require('../server/planMarkets.js');
const BILLING_PLAYABLE = planMarkets.ALL_PLAYABLE_MARKET_IDS_ORDERED;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const suiteDir = path.join(root, 'tmp', 'market_suite');
const legacyPath = path.join(root, 'src', 'legacy.js');

const PREFERRED_MARKET_ORDER = [
  'newyork',
  'losangeles',
  'chicago',
  'atlanta',
  'nashville',
  'wichita',
  'seattle',
  'sanfrancisco',
  'phoenix',
  'portland',
  'miami',
];

/** Era sniff jobs (spawn diag:market-era-sniff). */
const SUITE_ERA_CHECKS = [
  { market: 'phoenix', year: 1970 },
  { market: 'losangeles', year: 1970 },
  { market: 'nashville', year: 1985 },
  { market: 'wichita', year: 2026 },
  { market: 'portland', year: 2026 },
];

/** SF calendar spot checks via stability harness (AQH/revenue freeze). */
const SF_STRESS_SPOTS = [
  { marketId: 'sanfrancisco', scenarioId: 'fmrev', endYear: 2006, endPeriod: 2, label: 'sf_2006' },
  { marketId: 'sanfrancisco', scenarioId: 'gm_under', endYear: 2018, endPeriod: 2, label: 'sf_2018' },
];

const SPANISH_HEAVY_MARKETS = new Set(['phoenix', 'losangeles', 'newyork', 'chicago', 'miami']);

function parseCsvList(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function parseArgs(argv) {
  const o = {
    markets: null,
    runs: 25,
    deep: false,
    json: false,
    skipCert: false,
    skipStress: false,
    skipEra: false,
    skipSpanish: false,
    playableOnly: false,
    diagOnly: false,
    includeDevPlaytest: true,
    quiet: true,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) o.markets = parseCsvList(a.slice(10));
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || 25);
    else if (a === '--deep') o.deep = true;
    else if (a === '--json') o.json = true;
    else if (a === '--skip-cert') o.skipCert = true;
    else if (a === '--skip-stress') o.skipStress = true;
    else if (a === '--skip-era') o.skipEra = true;
    else if (a === '--skip-spanish') o.skipSpanish = true;
    else if (a === '--playable-only') o.playableOnly = true;
    else if (a === '--diag-only') o.diagOnly = true;
    else if (a === '--no-dev-playtest') o.includeDevPlaytest = false;
    else if (a === '--verbose') o.quiet = false;
  }
  if (o.deep) o.runs = Math.max(o.runs, 100);
  return o;
}

function marketsWithLegacyRows() {
  const src = readFileSync(legacyPath, 'utf8');
  const keys = new Set();
  const re = /^\s{2}([a-z][a-z0-9_]*):\{\s*$/gm;
  let m;
  const blockStart = src.indexOf('const MARKETS={');
  const slice = blockStart >= 0 ? src.slice(blockStart, blockStart + 120_000) : src;
  while ((m = re.exec(slice))) {
    keys.add(m[1]);
  }
  return keys;
}

function resolveDefaultMarkets(opts, legacyKeys) {
  if (opts.markets?.length) return opts.markets.filter((id) => legacyKeys.has(id) || DIAG_ONLY_MARKET_IDS.includes(id));

  const ids = new Set();
  if (!opts.diagOnly) {
    for (const id of ALL_PLAYABLE_MARKET_IDS) ids.add(id);
  }
  if (!opts.playableOnly) {
    for (const id of DIAG_ONLY_MARKET_IDS) ids.add(id);
    if (opts.includeDevPlaytest) {
      for (const id of DEV_PLAYTEST_MARKET_IDS) ids.add(id);
    }
  }

  const ordered = PREFERRED_MARKET_ORDER.filter((id) => ids.has(id));
  for (const id of ids) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered.filter((id) => legacyKeys.has(id) || ALL_PLAYABLE_MARKET_IDS.includes(id));
}

function exposureLabel(marketId, audit) {
  const parts = [];
  if (audit.inPlayable) parts.push('playable');
  if (audit.inDiagOnly) parts.push('diag-only');
  if (audit.inDevPlaytest) parts.push('dev-playtest');
  if (audit.inLegacy) parts.push('legacy');
  else parts.push('no-legacy-row');
  return parts.join('+') || 'unknown';
}

function buildExposureAudit(marketId, legacyKeys) {
  const inPlayable = ALL_PLAYABLE_MARKET_IDS.includes(marketId);
  const inDiagOnly = DIAG_ONLY_MARKET_IDS.includes(marketId);
  const inDevPlaytest = DEV_PLAYTEST_MARKET_IDS.includes(marketId);
  const inLegacy = legacyKeys.has(marketId);
  const inBillingPlayable = BILLING_PLAYABLE.includes(marketId);
  const inPlanPro = planMarkets.ALL_PLAYABLE_MARKET_IDS_ORDERED.includes(marketId);
  const inPlanTrial = planMarkets.marketIdsForPlanSlug('trial_user').includes(marketId);
  const inPlanStarter = planMarkets.STARTER_MARKET_IDS.includes(marketId);
  const inPlanFree = planMarkets.marketIdsForPlanSlug('free_user').includes(marketId);
  const inProOnly = planMarkets.PRO_ONLY_MARKET_IDS.includes(marketId);

  const issues = [];
  if (inPlayable && !inPlanPro) issues.push('playable_missing_from_pro_plan');
  if (inPlayable && !inBillingPlayable) issues.push('playable_missing_from_billing');
  if (inDiagOnly && inPlanPro) issues.push('diag_only_in_pro_plan');
  if (inDiagOnly && inBillingPlayable) issues.push('diag_only_in_billing_playable');
  if (inDiagOnly && inPlayable) issues.push('diag_only_listed_as_playable');
  if (!inLegacy && (inPlayable || inDiagOnly)) issues.push('missing_markets_row');
  if (inDiagOnly && !inLegacy) issues.push('diag_scaffold_only');

  let verdict = 'PASS';
  const hard = issues.filter(
    (i) =>
      i.startsWith('playable_missing') ||
      i.startsWith('diag_only_in_') ||
      i === 'diag_only_listed_as_playable',
  );
  if (hard.length) verdict = 'FAIL';
  else if (issues.length) verdict = 'WARN';

  return {
    inPlayable,
    inDiagOnly,
    inDevPlaytest,
    inLegacy,
    inBillingPlayable,
    inPlanPro,
    inPlanTrial,
    inPlanStarter,
    inPlanFree,
    inProOnly,
    issues,
    verdict,
  };
}

function runNodeScript(scriptName, args) {
  const scriptPath = path.join(root, 'scripts', scriptName);
  const r = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    exitCode: r.status ?? 1,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

function normVerdict(v) {
  if (!v) return 'SKIP';
  const s = String(v).toLowerCase();
  if (s === 'pass') return 'PASS';
  if (s === 'warn') return 'WARN';
  if (s === 'fail') return 'FAIL';
  return s.toUpperCase();
}

function worstVerdict(...vals) {
  const order = { FAIL: 3, WARN: 2, PASS: 1, SKIP: 0 };
  let best = 'SKIP';
  let score = -1;
  for (const v of vals) {
    const n = normVerdict(v);
    const sc = order[n] ?? 0;
    if (sc > score) {
      score = sc;
      best = n;
    }
  }
  return best;
}

function certYears(deep) {
  return deep ? [1985, 1995, 2005, 2026] : [1985, 1995, 2026];
}

function eraRuns(suiteRuns, deep) {
  if (deep) return Math.min(100, Math.max(50, suiteRuns * 2));
  return Math.min(50, Math.max(25, suiteRuns * 2));
}

function runCertification(markets, opts) {
  const years = certYears(opts.deep);
  const certRuns = opts.deep ? Math.max(opts.runs, 50) : opts.runs;
  const args = [
    `--markets=${markets.join(',')}`,
    `--years=${years.join(',')}`,
    `--runs=${certRuns}`,
    '--json',
  ];
  const t0 = Date.now();
  const proc = runNodeScript('diag-market-certification.mjs', args);
  const byMarket = {};
  for (const m of markets) {
    const p = path.join(root, 'tmp', 'market_certification', `${m}.json`);
    if (!existsSync(p)) {
      byMarket[m] = { verdict: proc.exitCode ? 'FAIL' : 'WARN', notes: 'cert artifact missing' };
      continue;
    }
    const report = JSON.parse(readFileSync(p, 'utf8'));
    byMarket[m] = {
      verdict: normVerdict(report.verdict?.overall),
      notes: report.error || report.checks?.find((c) => c.level === 'fail')?.code || '',
      internalReady: report.verdict?.internalReady,
      publicCandidate: report.verdict?.publicCandidate,
    };
  }
  return { byMarket, timingMs: Date.now() - t0, exitCode: proc.exitCode };
}

function runEraSniff(markets, opts) {
  const checks = SUITE_ERA_CHECKS.filter((c) => markets.includes(c.market));
  const runs = eraRuns(opts.runs, opts.deep);
  const byMarket = {};
  for (const m of markets) byMarket[m] = { verdict: 'SKIP', checks: [] };

  for (const job of checks) {
    const t0 = Date.now();
    const proc = runNodeScript('diag-market-era-sniff.mjs', [
      `--market=${job.market}`,
      `--year=${job.year}`,
      `--runs=${runs}`,
    ]);
    const outPath = path.join(root, 'tmp', 'market_era_sniff', `${job.market}_${job.year}.json`);
    let verdict = proc.exitCode ? 'FAIL' : 'WARN';
    let notes = '';
    if (existsSync(outPath)) {
      const art = JSON.parse(readFileSync(outPath, 'utf8'));
      verdict = normVerdict(art.verdict);
      const failCheck = art.checks?.find((c) => c.level === 'fail');
      notes = failCheck?.message || art.checks?.[0]?.message || '';
    }
    const prev = byMarket[job.market];
    byMarket[job.market] = {
      verdict: worstVerdict(prev.verdict, verdict),
      checks: [...(prev.checks || []), { year: job.year, verdict, notes, timingMs: Date.now() - t0 }],
    };
  }
  return { byMarket };
}

function runStability(markets, opts) {
  const scenarios = opts.deep ? DEFAULT_STRESS_SCENARIOS : FAST_STRESS_SCENARIOS;
  const spotChecks = markets.includes('sanfrancisco') ? SF_STRESS_SPOTS : [];
  const t0 = Date.now();
  const sweep = runStabilitySweep({
    markets,
    runs: opts.runs,
    scenarios,
    spotChecks,
    quiet: opts.quiet,
  });
  const byMarket = {};
  for (const m of markets) {
    const entry = sweep.byMarket[m] || { verdict: 'SKIP' };
    const notes = Object.entries(entry.failuresByType || {})
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    byMarket[m] = { verdict: entry.verdict || 'PASS', notes };
  }
  return { byMarket, sweep, timingMs: Date.now() - t0 };
}

function runSpanish(markets, opts) {
  const targets = markets.filter((m) => SPANISH_HEAVY_MARKETS.has(m));
  const byMarket = {};
  for (const m of markets) {
    if (!targets.includes(m)) byMarket[m] = { verdict: 'SKIP', notes: 'not spanish-heavy' };
  }
  if (!targets.length) return { byMarket };

  const spanishRuns = opts.deep ? Math.max(8, Math.min(12, opts.runs)) : Math.max(4, Math.min(8, Math.ceil(opts.runs / 3)));
  runNodeScript('diag-spanish-subtype-truth-sanity.mjs', [`--runs=${spanishRuns}`]);
  const outPath = path.join(root, 'tmp', 'spanish_subtype_truth_sanity.json');
  if (!existsSync(outPath)) {
    for (const m of targets) byMarket[m] = { verdict: 'WARN', notes: 'spanish artifact missing' };
    return { byMarket };
  }
  const report = JSON.parse(readFileSync(outPath, 'utf8'));
  for (const m of targets) {
    const cells = report.byCell?.[m];
    if (!cells) {
      byMarket[m] = { verdict: m === 'miami' ? 'WARN' : 'SKIP', notes: 'no spanish cells (scaffold?)' };
      continue;
    }
    const flags = [];
    for (const year of Object.keys(cells)) {
      for (const f of cells[year]?.flags || []) flags.push(`${year}:${f}`);
    }
    const hard = flags.some((f) => /WRONG_LEADER|NO_SPANISH|MONO_/.test(f));
    const warn = flags.some((f) => /AM_|FM_|EARLY_/.test(f));
    byMarket[m] = {
      verdict: hard ? 'FAIL' : warn || flags.length ? 'WARN' : 'PASS',
      notes: flags.slice(0, 4).join('; ') || 'ok',
    };
  }
  return { byMarket };
}

function overallForRow(row) {
  return worstVerdict(row.cert, row.stability, row.era, row.spanish, row.exposureAudit);
}

function pad(s, n) {
  const t = String(s ?? '');
  return t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length);
}

function printTable(rows) {
  const hdr =
    `${pad('market', 14)} | ${pad('exposure', 18)} | ${pad('cert', 5)} | ${pad('stability', 9)} | ${pad('era', 5)} | ${pad('spanish', 7)} | ${pad('exposureAudit', 13)} | ${pad('overall', 7)} | notes`;
  console.log(hdr);
  console.log('-'.repeat(hdr.length));
  for (const r of rows) {
    console.log(
      `${pad(r.marketId, 14)} | ${pad(r.exposure, 18)} | ${pad(r.cert, 5)} | ${pad(r.stability, 9)} | ${pad(r.era, 5)} | ${pad(r.spanish, 7)} | ${pad(r.exposureAudit, 13)} | ${pad(r.overall, 7)} | ${(r.notes || '').slice(0, 60)}`,
    );
  }
}

function writeMarkdown(report, rows) {
  const lines = [
    '# Market QA suite',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode} · runs: ${report.config.runs} · markets: ${report.config.markets.length}`,
    '',
    '| market | exposure | cert | stability | era | spanish | exposureAudit | overall | notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.marketId} | ${r.exposure} | ${r.cert} | ${r.stability} | ${r.era} | ${r.spanish} | ${r.exposureAudit} | ${r.overall} | ${(r.notes || '').replace(/\|/g, '/')} |`,
    );
  }
  lines.push('', `**Suite verdict:** ${report.verdict}`, '');
  return `${lines.join('\n')}\n`;
}

function writeCsv(rows) {
  const hdr = 'market,exposure,cert,stability,era,spanish,exposureAudit,overall,notes';
  const body = rows.map((r) =>
    [r.marketId, r.exposure, r.cert, r.stability, r.era, r.spanish, r.exposureAudit, r.overall, `"${(r.notes || '').replace(/"/g, '""')}"`].join(','),
  );
  return `${hdr}\n${body.join('\n')}\n`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const legacyKeys = marketsWithLegacyRows();
  const markets = resolveDefaultMarkets(opts, legacyKeys);
  const skipped = (opts.markets || []).filter((id) => !markets.includes(id) && !legacyKeys.has(id));

  mkdirSync(suiteDir, { recursive: true });
  const t0 = Date.now();

  if (!opts.json) {
    console.log('Market QA suite');
    console.log(`  markets (${markets.length}): ${markets.join(', ')}`);
    if (skipped.length) console.log(`  skipped (no MARKETS row): ${skipped.join(', ')}`);
    console.log(`  runs: ${opts.runs}${opts.deep ? ' (deep)' : ''}`);
  }

  const exposureByMarket = {};
  for (const m of markets) {
    exposureByMarket[m] = buildExposureAudit(m, legacyKeys);
  }

  let cert = { byMarket: {} };
  if (!opts.skipCert) {
    if (!opts.json) console.log('\n▶ Certification…');
    cert = runCertification(markets, opts);
  } else {
    for (const m of markets) cert.byMarket[m] = { verdict: 'SKIP', notes: 'skipped' };
  }

  let stability = { byMarket: {} };
  if (!opts.skipStress) {
    if (!opts.json) console.log('▶ Stability…');
    stability = runStability(markets, opts);
  } else {
    for (const m of markets) stability.byMarket[m] = { verdict: 'SKIP', notes: 'skipped' };
  }

  let era = { byMarket: {} };
  if (!opts.skipEra) {
    if (!opts.json) console.log('▶ Era sniff…');
    era = runEraSniff(markets, opts);
  } else {
    for (const m of markets) era.byMarket[m] = { verdict: 'SKIP' };
  }

  let spanish = { byMarket: {} };
  if (!opts.skipSpanish) {
    if (!opts.json) console.log('▶ Spanish subtype sanity…');
    spanish = runSpanish(markets, opts);
  } else {
    for (const m of markets) spanish.byMarket[m] = { verdict: 'SKIP' };
  }

  const rows = markets.map((marketId) => {
    const audit = exposureByMarket[marketId];
    const certV = cert.byMarket[marketId]?.verdict || 'SKIP';
    const stabV = stability.byMarket[marketId]?.verdict || 'SKIP';
    const eraV = era.byMarket[marketId]?.verdict || 'SKIP';
    const spanV = spanish.byMarket[marketId]?.verdict || 'SKIP';
    const expAuditV = audit.verdict;
    const notes = [
      cert.byMarket[marketId]?.notes,
      stability.byMarket[marketId]?.notes,
      era.byMarket[marketId]?.checks?.map((c) => `${c.year}:${c.verdict}`).join(' '),
      spanish.byMarket[marketId]?.notes,
      audit.issues.join(', '),
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 200);

    const row = {
      marketId,
      exposure: exposureLabel(marketId, audit),
      cert: certV,
      stability: stabV,
      era: eraV,
      spanish: spanV,
      exposureAudit: expAuditV,
      overall: worstVerdict(certV, stabV, eraV, spanV, expAuditV),
      notes,
      audit,
    };
    row.overall = overallForRow(row);
    return row;
  });

  const suiteVerdict = worstVerdict(...rows.map((r) => r.overall));
  const timingMs = Date.now() - t0;

  const report = {
    generatedAt: new Date().toISOString(),
    verdict: suiteVerdict,
    mode: opts.deep ? 'deep' : 'standard',
    timingMs,
    config: {
      markets,
      runs: opts.runs,
      deep: opts.deep,
      skipCert: opts.skipCert,
      skipStress: opts.skipStress,
      skipEra: opts.skipEra,
      skipSpanish: opts.skipSpanish,
      playableOnly: opts.playableOnly,
      diagOnly: opts.diagOnly,
    },
    rows,
    stabilitySummary: stability.sweep
      ? { failuresByType: stability.sweep.failuresByType, totals: stability.sweep.totals }
      : null,
  };

  writeFileSync(path.join(suiteDir, 'market_suite.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(suiteDir, 'market_suite.md'), writeMarkdown(report, rows));
  writeFileSync(path.join(suiteDir, 'market_suite.csv'), writeCsv(rows));

  if (!opts.json) {
    console.log('\n' + '═'.repeat(80));
    printTable(rows);
    console.log(`\nSuite verdict: ${suiteVerdict} (${(timingMs / 1000).toFixed(1)}s)`);
    console.log(`Wrote ${suiteDir}/market_suite.{json,md,csv}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(suiteVerdict === 'FAIL' ? 1 : 0);
}

main();
