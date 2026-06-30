/**
 * Editorial realism workflow — shared constants and paths.
 * @see docs/EDITORIAL_WORKFLOW.md
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.join(__dirname, '..', '..');

/** Reference panel: mega + large + medium + small. */
export const REFERENCE_PANEL_MARKETS = ['newyork', 'houston', 'phoenix', 'nashville', 'wichita'];

export const REFERENCE_PANEL_YEARS = [1995, 2000, 2010, 2026];

/** Fixed seed for reproducible baseline diffs. */
export const DEFAULT_EDITORIAL_SEED = 20260628;

export const GEN_ERA = '1985';
export const MAX_SIM_STEPS = 300;
export const TARGET_PERIOD = 1;

export const SPANISH_PILLARS = [
  'REGIONAL_MEXICAN',
  'SPANISH_CONTEMPORARY',
  'SPANISH_TROPICAL',
  'SPANISH_ADULT_HITS',
  'SPANISH',
];

export const paths = {
  legacy: path.join(root, 'src', 'legacy.js'),
  harness: path.join(root, 'src', 'marketSimHarness.js'),
  spanish: path.join(root, 'src', 'realismSpanishComposition.js'),
  concernRegistry: path.join(root, 'editorial', 'concern_registry.json'),
  baselineDir: path.join(root, 'baseline', 'realism'),
  baselineManifest: path.join(root, 'baseline', 'realism', 'manifest.json'),
  baselineMetrics: path.join(root, 'baseline', 'realism', 'metrics.json'),
  baselineReferencePanel: path.join(root, 'baseline', 'realism', 'reference_panel.json'),
  baselineMarketSuite: path.join(root, 'baseline', 'realism', 'market_suite_summary.json'),
  newspaperDir: path.join(root, 'tmp', 'realism_newspaper'),
  referencePanelOut: path.join(root, 'tmp', 'reference_panel', 'reference_panel.json'),
  marketSuiteJson: path.join(root, 'tmp', 'market_suite', 'market_suite.json'),
  promptsDir: path.join(root, 'editorial', 'prompts'),
};

/** Delta thresholds for newspaper ranking. */
export const DELTA_THRESHOLDS = {
  sharePoints: 0.8,
  stationCount: 1,
  commercialCount: 1,
  spanishSharePoints: 1.0,
  verdictFlip: true,
};
