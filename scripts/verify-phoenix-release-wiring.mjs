#!/usr/bin/env node
/**
 * Phoenix Pro-only release wiring — registry + entitlement smoke (no deploy).
 *   node scripts/verify-phoenix-release-wiring.mjs
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import vm from 'vm';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { marketIdsForClerkPlanSlug, PRO_ONLY_MARKET_IDS } from '../src/billingEntitlements.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const {
  ALL_PLAYABLE_MARKET_IDS: NODE_PLAYABLE,
  DIAG_ONLY_MARKET_IDS,
  DEV_PLAYTEST_MARKET_IDS,
} = require('./market-ids.cjs');
const planMarkets = require('../server/planMarkets.js');

const PHOENIX = 'phoenix';
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error(`FAIL: ${msg}`);
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

function eqArrays(a, b, label) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) fail(`${label} mismatch\n  A: ${sa}\n  B: ${sb}`);
  else pass(`${label} synced (${a.length} ids)`);
}

function extractLegacyArray(name) {
  const src = readFileSync(path.join(root, 'src', 'legacy.js'), 'utf8');
  const re = new RegExp(`const ${name}=Object\\.freeze\\(\\[([^\\]]*)\\]\\)`);
  const m = src.match(re);
  if (!m) throw new Error(`Could not parse ${name} from legacy.js`);
  const inner = m[1].trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

const legacyPlayable = extractLegacyArray('ALL_PLAYABLE_MARKET_IDS');
const legacyProOnly = extractLegacyArray('WL_PRO_ONLY_MARKET_IDS');
const legacyDevPlaytest = extractLegacyArray('DEV_PLAYTEST_MARKET_IDS');

console.log('=== Registry sync ===');
eqArrays(legacyPlayable, NODE_PLAYABLE, 'legacy ALL_PLAYABLE ↔ market-ids.cjs');
eqArrays(
  legacyPlayable,
  planMarkets.ALL_PLAYABLE_MARKET_IDS_ORDERED,
  'legacy ALL_PLAYABLE ↔ server ALL_PLAYABLE_MARKET_IDS_ORDERED',
);
eqArrays(
  legacyPlayable,
  [...marketIdsForClerkPlanSlug('pro')],
  'legacy ALL_PLAYABLE ↔ billing pro plan',
);
eqArrays(legacyProOnly, [...PRO_ONLY_MARKET_IDS], 'legacy WL_PRO_ONLY ↔ billing PRO_ONLY');
eqArrays(legacyProOnly, [...planMarkets.PRO_ONLY_MARKET_IDS], 'legacy WL_PRO_ONLY ↔ server PRO_ONLY');

if (!legacyPlayable.includes(PHOENIX)) fail('phoenix missing from legacy ALL_PLAYABLE');
else pass('phoenix ∈ legacy ALL_PLAYABLE');

if (!legacyProOnly.includes(PHOENIX)) fail('phoenix missing from legacy WL_PRO_ONLY');
else pass('phoenix ∈ legacy WL_PRO_ONLY');

if (legacyDevPlaytest.includes(PHOENIX)) fail('phoenix still in legacy DEV_PLAYTEST');
else pass('phoenix ∉ legacy DEV_PLAYTEST');

if (DIAG_ONLY_MARKET_IDS.includes(PHOENIX)) fail('phoenix still in DIAG_ONLY_MARKET_IDS');
else pass('phoenix ∉ DIAG_ONLY_MARKET_IDS');

if (DEV_PLAYTEST_MARKET_IDS.includes(PHOENIX)) fail('phoenix still in market-ids DEV_PLAYTEST');
else pass('phoenix ∉ market-ids DEV_PLAYTEST');

console.log('\n=== Plan matrix ===');
const trial = marketIdsForClerkPlanSlug('trial_user');
const starter = marketIdsForClerkPlanSlug('starter');
const pro = marketIdsForClerkPlanSlug('pro');
const free = marketIdsForClerkPlanSlug('free_user');

if (pro.includes(PHOENIX)) pass('Pro plan includes phoenix');
else fail('Pro plan missing phoenix');

for (const slug of ['free_user', 'starter', 'trial_user']) {
  const ids = marketIdsForClerkPlanSlug(slug);
  if (ids.includes(PHOENIX)) fail(`${slug} incorrectly includes phoenix`);
  else pass(`${slug} excludes phoenix`);
}

eqArrays(trial, planMarkets.marketIdsForPlanSlug('trial_user'), 'trial plan client ↔ server');
if (trial.some((id) => PRO_ONLY_MARKET_IDS.includes(id))) {
  fail('trial plan still includes a PRO_ONLY market');
} else pass('trial plan excludes all PRO_ONLY markets');

console.log('\n=== Runtime picker (VM) ===');
const noop = () => {};
function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener: noop,
    removeEventListener: noop,
    getAttribute() { return null; },
    setAttribute() {},
  };
}
const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
  getElementById() { return stubEl(); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener: noop,
  removeEventListener: noop,
};
const ctx = vm.createContext({
  console: { log: noop, warn: noop, error: console.error },
  __WL_HEADLESS__: true,
  globalThis: null,
  window: null,
  document: documentStub,
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  location: { reload() {}, search: '', href: 'http://127.0.0.1/', hostname: 'localhost' },
  setTimeout(fn) {
    if (typeof fn === 'function') fn();
    return 0;
  },
  setInterval() { return 0; },
  clearTimeout() {},
  clearInterval() {},
  requestAnimationFrame(fn) {
    if (typeof fn === 'function') fn();
  },
  alert() {},
  fetch: null,
  Math,
  Date,
  JSON,
  Array,
  Object,
  String,
  Number,
  Boolean,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  undefined,
  NaN,
  Infinity,
});
ctx.globalThis = ctx;
ctx.window = ctx;
ctx.window.addEventListener = noop;
ctx.window.removeEventListener = noop;
injectMarketEcologyIife(ctx);
const legacySrc = readFileSync(path.join(root, 'src', 'legacy.js'), 'utf8');
vm.runInContext(legacySrc, ctx, { filename: 'legacy.js', timeout: 120000 });

const uiIds = vm.runInContext('wlUiMarketIds()', ctx);
if (uiIds.includes(PHOENIX)) pass('wlUiMarketIds includes phoenix (production picker)');
else fail('wlUiMarketIds missing phoenix');

const playable = vm.runInContext("wlIsPlayableMarketId('phoenix')", ctx);
if (playable) pass('wlIsPlayableMarketId(phoenix) true');
else fail('wlIsPlayableMarketId(phoenix) false');

const proOnly = vm.runInContext("wlIsProOnlyMarketId('phoenix')", ctx);
if (proOnly) pass('wlIsProOnlyMarketId(phoenix) true');
else fail('wlIsProOnlyMarketId(phoenix) false');

// Scenario picker lock smoke: non-Pro should not have phoenix in allowed set; Pro should.
vm.runInContext("window.__WL_CLERK_PLAN_SLUG='starter'; window.__WL_PLAN_MARKET_IDS=['newyork','losangeles','chicago','atlanta','nashville'];", ctx);
const starterAllowed = vm.runInContext('wlGetAllowedPhase1MarketIds()', ctx);
if (!starterAllowed.includes(PHOENIX)) pass('Starter allowed markets exclude phoenix');
else fail('Starter allowed markets include phoenix');

vm.runInContext("window.__WL_CLERK_PLAN_SLUG='pro'; window.__WL_PLAN_MARKET_IDS=ALL_PLAYABLE_MARKET_IDS.slice();", ctx);
const proAllowed = vm.runInContext('wlGetAllowedPhase1MarketIds()', ctx);
if (proAllowed.includes(PHOENIX)) pass('Pro allowed markets include phoenix');
else fail('Pro allowed markets missing phoenix');

const starterLockTitle = vm.runInContext("wlMarketPlanLockTitle('phoenix','starter')", ctx);
if (starterLockTitle && /Pro market/i.test(starterLockTitle)) pass('Starter lock title mentions Pro market');
else fail(`Starter lock title unexpected: ${starterLockTitle}`);

console.log('\n=== Summary ===');
if (failures.length) {
  console.error(`\n${failures.length} failure(s) — do not deploy.`);
  process.exit(1);
}
console.log('\nAll registry + entitlement checks passed.');
