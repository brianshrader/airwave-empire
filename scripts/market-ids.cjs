'use strict';

/**
 * Canonical Phase-1 playable market IDs for Node tooling.
 * Keep identical to ALL_PLAYABLE_MARKET_IDS / DEV_BENCHMARK_MEGA_MARKET_IDS in src/legacy.js (browser bundle).
 * Order = Nielsen DMA rank (#1 New York … #11 Wichita).
 */
const ALL_PLAYABLE_MARKET_IDS = Object.freeze([
  'newyork',
  'losangeles',
  'chicago',
  'sanfrancisco',
  'dallas',
  'houston',
  'atlanta',
  'seattle',
  'phoenix',
  'nashville',
  'wichita',
]);

/** LA / NYC / Chicago — mega-only benchmarks, ecology compare quick mode, FM rules scoped to top metros. */
const DEV_BENCHMARK_MEGA_MARKET_IDS = Object.freeze(['newyork', 'losangeles', 'chicago']);

/**
 * MARKETS rows present for ecology/scaffold harness only — never add to ALL_PLAYABLE_MARKET_IDS or billing.
 * Keep in sync with DIAG_ONLY rows in src/legacy.js MARKETS.
 */
const DIAG_ONLY_MARKET_IDS = Object.freeze(['portland', 'miami']);

/** Browser dev/local playtest only — keep in sync with DEV_PLAYTEST_MARKET_IDS in src/legacy.js */
const DEV_PLAYTEST_MARKET_IDS = Object.freeze([]);

module.exports = {
  ALL_PLAYABLE_MARKET_IDS,
  DEV_BENCHMARK_MEGA_MARKET_IDS,
  DIAG_ONLY_MARKET_IDS,
  DEV_PLAYTEST_MARKET_IDS,
};
