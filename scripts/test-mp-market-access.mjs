#!/usr/bin/env node
/**
 * Unit checks for MP host market pinning (server/mpMarketAccess.js).
 *
 *   node scripts/test-mp-market-access.mjs
 */
/* eslint-disable no-console */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  marketIdFromGameState,
  sanitizeMpHostGameState,
} = require('../server/mpMarketAccess.js');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  }
}

// marketIdFromGameState
assert(marketIdFromGameState({ marketId: 'Chicago' }) === 'chicago', 'normalizes market id');
assert(marketIdFromGameState({}) === 'atlanta', 'defaults missing market to atlanta');
assert(marketIdFromGameState(null) === 'atlanta', 'defaults null G to atlanta');

// sanitizeMpHostGameState — no pin before draft
const lobby = { mpMarketId: null };
const g1 = { marketId: 'seattle', year: 1970 };
assert(sanitizeMpHostGameState(lobby, g1) === g1, 'no pin: returns same reference');

// pin after start_draft
const room = { mpMarketId: 'atlanta' };
const g2 = { marketId: 'seattle', year: 1970, period: 1 };
const g2s = sanitizeMpHostGameState(room, g2);
assert(g2s !== g2, 'pinned: returns new object when market differs');
assert(g2s.marketId === 'atlanta', 'pinned: forces atlanta');
assert(g2.marketId === 'seattle', 'pinned: does not mutate input');
assert(g2s.year === 1970, 'pinned: preserves other fields');

const g3 = { marketId: 'atlanta', year: 1980 };
assert(sanitizeMpHostGameState(room, g3) === g3, 'pinned: same market keeps reference');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('OK — mpMarketAccess sanity checks passed');
