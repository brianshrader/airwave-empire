'use strict';

/**
 * Canonical Phase-1 playable market IDs for Node tooling.
 * Keep identical to ALL_PLAYABLE_MARKET_IDS / DEV_BENCHMARK_MEGA_MARKET_IDS in src/legacy.js (browser bundle).
 */
const ALL_PLAYABLE_MARKET_IDS = Object.freeze([
  'newyork',
  'losangeles',
  'chicago',
  'atlanta',
  'nashville',
  'seattle',
  'wichita',
]);

/** LA / NYC / Chicago — mega-only benchmarks, ecology compare quick mode, FM rules scoped to top metros. */
const DEV_BENCHMARK_MEGA_MARKET_IDS = Object.freeze(['newyork', 'losangeles', 'chicago']);

module.exports = {
  ALL_PLAYABLE_MARKET_IDS,
  DEV_BENCHMARK_MEGA_MARKET_IDS,
};
