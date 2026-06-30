/**
 * Baseline pinning and loading for realism editorial workflow.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'fs';
import { execSync } from 'child_process';
import { paths, root } from './config.mjs';
import { metricsFromReferencePanel, summarizeMarketSuite } from './metrics.mjs';

export function gitShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function loadBaseline() {
  if (!existsSync(paths.baselineManifest)) return null;
  const manifest = JSON.parse(readFileSync(paths.baselineManifest, 'utf8'));
  const metrics = existsSync(paths.baselineMetrics)
    ? JSON.parse(readFileSync(paths.baselineMetrics, 'utf8'))
    : {};
  const referencePanel = existsSync(paths.baselineReferencePanel)
    ? JSON.parse(readFileSync(paths.baselineReferencePanel, 'utf8'))
    : null;
  const marketSuite = existsSync(paths.baselineMarketSuite)
    ? JSON.parse(readFileSync(paths.baselineMarketSuite, 'utf8'))
    : null;
  return { manifest, metrics, referencePanel, marketSuite };
}

export function saveBaseline({ label, seed, referencePanel, marketSuiteSummary, metrics, topFormatsByCell, notes }) {
  mkdirSync(paths.baselineDir, { recursive: true });

  const manifest = {
    version: 1,
    label: label || 'default',
    pinnedAt: new Date().toISOString(),
    gitSha: gitShortSha(),
    seed,
    notes: notes || '',
    markets: referencePanel?.meta?.markets || [],
    years: referencePanel?.meta?.years || [],
  };

  writeFileSync(paths.baselineManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(paths.baselineReferencePanel, `${JSON.stringify(referencePanel, null, 2)}\n`);
  writeFileSync(
    paths.baselineMetrics,
    `${JSON.stringify({ metrics, topFormatsByCell, marketSuite: marketSuiteSummary }, null, 2)}\n`,
  );
  if (marketSuiteSummary) {
    writeFileSync(paths.baselineMarketSuite, `${JSON.stringify(marketSuiteSummary, null, 2)}\n`);
  }

  return manifest;
}

export function buildBaselinePayload(referencePanel, marketSuite) {
  const { metrics, topFormatsByCell } = metricsFromReferencePanel(referencePanel);
  const marketSuiteSummary = marketSuite ? summarizeMarketSuite(marketSuite) : null;
  return { metrics, topFormatsByCell, marketSuiteSummary };
}

export function baselineExists() {
  return existsSync(paths.baselineManifest) && existsSync(paths.baselineMetrics);
}
