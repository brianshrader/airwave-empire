#!/usr/bin/env node
/**
 * Format Lifecycle Layer v1 — diagnostic harness (no gameplay).
 * Prints national viability indices + per-market directional weights (0–100 index, not book share).
 *
 *   npm run diag:format-lifecycle
 *   npm run diag:format-lifecycle -- --markets=portland,nashville,atlanta --years=1985,1995,2026
 *
 * @see docs/FORMAT_LIFECYCLE_LAYER_V1.md
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import {
  loadFormatLifecycleCatalog,
  nationalLifecycle,
  diagnosticDisplayIndex,
  computeMarketYearDiagnosticWeights,
  assessDiagnosticPlausibility,
} from '../src/formatLifecycleCore.js';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS, DIAG_ONLY_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

const DEFAULT_MARKETS = ['atlanta', 'nashville', 'portland', 'phoenix'];
const DEFAULT_YEARS = [1980, 1985, 1995, 2005, 2015, 2026];
const SPOTLIGHT_FORMATS = [
  'TOP40',
  'HOT_AC',
  'COUNTRY',
  'CLASSIC_ROCK',
  'NEWS_TALK',
  'AAA',
  'ALT_ROCK',
  'SPANISH',
  'PUBLIC',
  'MOR',
  'ADULT_CONTEMP',
];

const LANE_SPOTLIGHT = ['COUNTRY', 'PUBLIC', 'AAA', 'SPANISH', 'URBAN_CONTEMP'];

function parseArgs(argv) {
  const o = { markets: [...DEFAULT_MARKETS], years: [...DEFAULT_YEARS] };
  for (const a of argv) {
    if (a.startsWith('--markets=')) o.markets = a.slice(10).split(',').map((s) => s.trim()).filter(Boolean);
    if (a.startsWith('--years=')) o.years = a.slice(8).split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
  }
  return o;
}

function stubEl() {
  return {
    style: {},
    dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    addEventListener() {},
    removeEventListener() {},
    getAttribute() { return null; },
    setAttribute() {},
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement: () => stubEl(),
  getElementById: () => stubEl(),
  querySelectorAll: () => [],
  querySelector: () => null,
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext() {
  const noop = () => {};
  const ctx = vm.createContext({
    console: { log: noop, warn: console.warn, error: console.error },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    location: { reload: noop, search: '', href: 'http://127.0.0.1/' },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval: () => 0,
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Buffer,
    Promise,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  return ctx;
}

function loadMarketsVm() {
  const src = readFileSync(legacyPath, 'utf8');
  if (!src.includes('const MARKETS=')) throw new Error('MARKETS anchor missing in legacy.js');
  const ctx = createVmContext();
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 120_000 });
  return vm.runInContext('MARKETS', ctx);
}

function idxLabel(n) {
  if (n == null || Number.isNaN(n)) return 'n/a';
  return `${Number(n).toFixed(0).padStart(3)}`;
}

function printNationalTable(years, catalog) {
  console.log('\n=== Layer A — National viability index (not book share) ===\n');
  console.log('Scale 0–100 = national directional viability for the format at that year.\n');
  const hdr = ['Year', ...SPOTLIGHT_FORMATS.map((f) => f.slice(0, 6))];
  console.log(hdr.join('\t'));
  for (const y of years) {
    const row = [String(y)];
    for (const fmt of SPOTLIGHT_FORMATS) {
      const v = nationalLifecycle(fmt, y, catalog);
      row.push(v == null ? 'n/a' : idxLabel(diagnosticDisplayIndex(v)));
    }
    console.log(row.join('\t'));
  }
}

function formatTopLine(snapshot) {
  return snapshot.formats
    .slice(0, 6)
    .map((r) => `${r.format}:${idxLabel(r.displayIndex)}`)
    .join(' | ');
}

function laneIndices(snapshot) {
  const by = Object.fromEntries(snapshot.formats.map((r) => [r.format, r]));
  const pick = (fmt) => idxLabel(by[fmt]?.displayIndex);
  return {
    hits: idxLabel(snapshot.hitsLaneDisplay),
    country: pick('COUNTRY'),
    public: pick('PUBLIC'),
    aaa: pick('AAA'),
    spanish: pick('SPANISH'),
    urban: pick('URBAN_CONTEMP'),
  };
}

function printMarketBlock(marketId, market, years, catalog, allWarnings) {
  const arch = market.archetypeId || '—';
  const tier = market.rankTier || '—';
  console.log(`\n=== ${marketId} (${market.label || marketId}) tier=${tier} archetype=${arch} ===`);
  console.log('Per-format numbers = directional weight index (0–100). Not book share or #1 probability.\n');

  for (const y of years) {
    const snapshot = computeMarketYearDiagnosticWeights(market, marketId, y, catalog);
    const lanes = laneIndices(snapshot);
    console.log(`  ${y} leader=${snapshot.leaderFormat ?? '—'} idx=${idxLabel(snapshot.formats[0]?.displayIndex)}`);
    console.log(`      top: ${formatTopLine(snapshot)}`);
    console.log(
      `      lanes: hits=${lanes.hits} country=${lanes.country} public=${lanes.public} aaa=${lanes.aaa} spanish=${lanes.spanish} urban=${lanes.urban}`,
    );
    const warns = assessDiagnosticPlausibility(marketId, market, y, snapshot);
    for (const w of warns) {
      allWarnings.push(w);
      console.log(`      ⚠ ${w.message}`);
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const catalog = loadFormatLifecycleCatalog();
  const MARKETS = loadMarketsVm();
  const allWarnings = [];

  console.log('Format Lifecycle Layer v1 — diagnostics only');
  console.log('Values are relative directional weight indices (0–100), NOT book share or probabilities.');
  console.log(`Catalog: data/formatLifecycle.v1.json (v${catalog.version})`);
  console.log(`Markets: ${opts.markets.join(', ')}`);
  console.log(`Years: ${opts.years.join(', ')}`);

  printNationalTable(opts.years, catalog);

  for (const mid of opts.markets) {
    const m = MARKETS[mid];
    if (!m) {
      console.warn(`\n[skip] Unknown MARKETS["${mid}"] — add row or fix --markets`);
      continue;
    }
    const playable = ALL_PLAYABLE_MARKET_IDS.includes(mid);
    const diag = DIAG_ONLY_MARKET_IDS.includes(mid);
    if (!playable && !diag) {
      console.warn(`[warn] "${mid}" is not playable or DIAG_ONLY — harness-only`);
    }
    printMarketBlock(mid, m, opts.years, catalog, allWarnings);
  }

  if (allWarnings.length) {
    console.log(`\n=== Plausibility warnings (${allWarnings.length}) ===`);
    for (const w of allWarnings) {
      console.log(`  [${w.id}] ${w.message}`);
    }
  } else {
    console.log('\n=== Plausibility warnings: none ===');
  }

  console.log('\n---');
  console.log('Book share ground truth: npm run diag:market-ecology-regression');
  console.log('Design: docs/FORMAT_LIFECYCLE_LAYER_V1.md');
  console.log('(No gameplay changes in v1.)\n');
}

main();
