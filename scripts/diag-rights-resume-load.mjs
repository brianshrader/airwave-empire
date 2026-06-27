#!/usr/bin/env node
/**
 * Reproduce / verify syndication-rights load repair (headless legacy.js).
 *
 *   node scripts/diag-rights-resume-load.mjs
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectFormatLifecycleIife } from './vmInjectFormatLifecycleIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

function createVmContext() {
  const noop = () => {};
  const ctx = vm.createContext({
    console,
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: { body: {}, getElementById() { return null; } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearTimeout() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert: noop,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    crypto: { randomUUID() { return '00000000-0000-4000-8000-000000000001'; } },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined, Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], emit() {}, action() {} };
  return ctx;
}

function loadLegacy(ctx) {
  const src = readFileSync(legacyPath, 'utf8');
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 180_000 });
  return ctx;
}

function assertNoThrow(fn, label) {
  try {
    fn();
    console.log('OK', label);
  } catch (e) {
    console.error('FAIL', label, e.message);
    process.exit(1);
  }
}

const ctx = createVmContext();
loadLegacy(ctx);
const { repairSyndicationRightsRecords, migrateFranchiseFormatMismatch, migrateSave } = ctx;

function makeGame(overrides = {}) {
  const ai = {
    id: 'ai1',
    callLetters: 'WRIV',
    isPlayer: false,
    format: 'NEWS_TALK',
    _bpSlotDeferred: false,
    prog: {},
    mom: {},
    rat: { share: 0.03, cur: {} },
    fin: { rev: 100000, cost: 80000, ebitda: 20000 },
    sig: { type: 'AM', reach: 0.5, power: '5kw' },
    oq: 50,
    ops: { sell: 0.6, spots: 12, progBudget: 0 },
  };
  const player = {
    id: 'p1',
    callLetters: 'WYOU',
    isPlayer: true,
    format: 'OLDIES',
    _bpSlotDeferred: false,
    prog: {},
    mom: {},
    rat: { share: 0.04, cur: {} },
    fin: { rev: 120000, cost: 90000, ebitda: 30000 },
    sig: { type: 'FM', reach: 0.7, power: '50kw' },
    oq: 55,
    ops: { sell: 0.65, spots: 14, progBudget: 0 },
  };
  return {
    year: 2005,
    period: 1,
    turn: 70,
    marketId: 'wichita',
    cash: 500000,
    stations: [ai, player],
    ps: [player],
    sc: { id: 'classic', l: 'Classic' },
    news: [],
    rankerHistory: [],
    finHistory: [],
    sportsRights: {},
    franchiseRights: {},
    teamRecords: {},
    ...overrides,
  };
}

assertNoThrow(() => {
  const G = makeGame({
    franchiseRights: {
      countdown: { holderId: 'ai1' },
      broken: null,
      stringy: 'oops',
    },
  });
  repairSyndicationRightsRecords(G);
  migrateFranchiseFormatMismatch(G);
}, 'partial franchise rows + null + string');

assertNoThrow(() => {
  const G = makeGame({
    franchiseRights: {
      countdown: { holderId: 'missing_station_id', fee: 50000, contractEnd: 2006 },
    },
  });
  repairSyndicationRightsRecords(G);
  migrateFranchiseFormatMismatch(G);
}, 'orphan holderId on franchise');

assertNoThrow(() => {
  const G = makeGame({
    sportsRights: {
      chiefs: undefined,
      royals: { holderId: 'ai1', contractEnd: 2005, auctionOpen: true },
    },
  });
  // simulate pre-repair corrupt blob
  G.sportsRights.chiefs = null;
  repairSyndicationRightsRecords(G);
  migrateFranchiseFormatMismatch(G);
}, 'null sports rights entry');

assertNoThrow(() => {
  const G = makeGame({
    franchiseRights: [],
    sportsRights: [],
  });
  repairSyndicationRightsRecords(G);
  migrateSave(G);
}, 'array-shaped rights maps (migrateSave full)');

console.log('All rights resume load checks passed.');
