#!/usr/bin/env node
/**
 * Market registry preflight — blocks deploy if playable markets are missing, stub-only,
 * or out of sync across legacy.js / billing / server.
 *
 *   node scripts/verify-market-registry.mjs
 *   npm run verify:market-registry
 *
 * Run before every production deploy (wired in deploy.sh).
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

/** Every playable market must have these MARKETS fields (catches id-only stubs). */
const REQUIRED_MARKET_ROW_KEYS = ['pop', 'fmFreqs', 'revScale', 'culture', 'teams'];

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

function injectHeadlessLaunchNewsGuard(src) {
  return src
    .replace(
      'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    )
    .replace(
      'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    )
    .replace(
      'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    );
}

function marketRowIsComplete(m) {
  if (!m || typeof m !== 'object') return false;
  for (const k of REQUIRED_MARKET_ROW_KEYS) {
    const v = m[k];
    if (v == null) return false;
    if (k === 'fmFreqs' && (!Array.isArray(v) || v.length < 8)) return false;
    if (k === 'pop' && typeof v !== 'object') return false;
    if (k === 'teams' && (!Array.isArray(v) || v.length < 1)) return false;
  }
  return true;
}

function createVmContext() {
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
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        return a;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      },
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
    undefined,
    NaN,
    Infinity,
    Int8Array,
    Uint8Array,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function loadLegacyVm() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  const legacySrc = injectHeadlessLaunchNewsGuard(readFileSync(path.join(root, 'src', 'legacy.js'), 'utf8'));
  vm.runInContext(legacySrc, ctx, { filename: 'legacy.js', timeout: 180000 });
  vm.runInContext(readFileSync(path.join(root, 'src', 'marketSimHarness.js'), 'utf8'), ctx);
  return ctx;
}

function genMarketSmoke(ctx, marketId) {
  return vm.runInContext(
    `(function(){
      ACTIVE_MARKET='${marketId}';
      if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket('${marketId}');
      var sc=SC.find(function(s){return s.id==='chrwar';});
      var oi=sc.idx; sc.idx=[];
      G=genMarket('chrwar');
      sc.idx=oi;
      if(G.marketId!=='${marketId}')return {ok:false,err:'marketId '+G.marketId};
      var st=(G.stations||[]).filter(function(s){return s&&!s._bpSlotDeferred;});
      if(st.length<12)return {ok:false,err:'stations '+st.length};
      if(typeof recalc==='function')recalc(G.stations,G);
      var book=st.filter(function(s){return s.rat&&typeof s.rat.share==='number';});
      if(!book.length)return {ok:false,err:'empty book'};
      return {ok:true,stations:st.length};
    })()`,
    ctx,
  );
}

// ── Registry sync ─────────────────────────────────────────────────────────────
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

for (const id of legacyPlayable) {
  if (DIAG_ONLY_MARKET_IDS.includes(id)) fail(`${id} is both playable and DIAG_ONLY`);
  if (DEV_PLAYTEST_MARKET_IDS.includes(id)) fail(`${id} is both playable and DEV_PLAYTEST`);
  if (legacyDevPlaytest.includes(id)) fail(`${id} is both playable and DEV_PLAYTEST (legacy)`);
}

console.log('\n=== Plan matrix ===');
const trial = marketIdsForClerkPlanSlug('trial_user');
eqArrays(trial, planMarkets.marketIdsForPlanSlug('trial_user'), 'trial plan client ↔ server');
if (trial.some((id) => PRO_ONLY_MARKET_IDS.includes(id))) {
  fail('trial plan includes a PRO_ONLY market');
} else pass('trial plan excludes all PRO_ONLY markets');

for (const id of PRO_ONLY_MARKET_IDS) {
  if (!legacyPlayable.includes(id)) fail(`PRO_ONLY ${id} missing from ALL_PLAYABLE`);
  else pass(`PRO_ONLY ${id} ∈ ALL_PLAYABLE`);
  if (!legacyProOnly.includes(id)) fail(`PRO_ONLY ${id} missing from WL_PRO_ONLY`);
}

for (const slug of ['free_user', 'starter', 'trial_user']) {
  const ids = marketIdsForClerkPlanSlug(slug);
  for (const id of PRO_ONLY_MARKET_IDS) {
    if (ids.includes(id)) fail(`${slug} incorrectly includes Pro-only ${id}`);
  }
}
pass('Starter/trial/free exclude all PRO_ONLY markets');

// ── MARKETS row completeness (no stubs) ───────────────────────────────────────
console.log('\n=== MARKETS row completeness ===');
const ctx = loadLegacyVm();
const marketsObj = vm.runInContext('MARKETS', ctx);

for (const id of legacyPlayable) {
  const row = marketsObj[id];
  if (!row) {
    fail(`${id}: missing MARKETS row`);
    continue;
  }
  if (!marketRowIsComplete(row)) {
    const keys = row ? Object.keys(row).join(', ') : 'none';
    fail(`${id}: stub or incomplete MARKETS row (keys: ${keys}) — need ${REQUIRED_MARKET_ROW_KEYS.join(', ')}`);
  } else {
    pass(`${id}: full MARKETS row`);
  }
}

// ── Runtime picker ────────────────────────────────────────────────────────────
console.log('\n=== Runtime picker ===');
const uiIds = vm.runInContext('wlUiMarketIds()', ctx);
for (const id of legacyPlayable) {
  if (!uiIds.includes(id)) fail(`wlUiMarketIds missing ${id}`);
  if (!vm.runInContext(`wlIsPlayableMarketId('${id}')`, ctx)) fail(`wlIsPlayableMarketId(${id}) false`);
}
pass(`wlUiMarketIds lists all ${legacyPlayable.length} playable markets`);

vm.runInContext(
  "window.__WL_CLERK_PLAN_SLUG='pro'; window.__WL_PLAN_MARKET_IDS=ALL_PLAYABLE_MARKET_IDS.slice();",
  ctx,
);
const proAllowed = vm.runInContext('wlGetAllowedPhase1MarketIds()', ctx);
for (const id of legacyPlayable) {
  if (!proAllowed.includes(id)) fail(`Pro plan allowed list missing ${id}`);
}
pass('Pro plan includes every playable market');

// ── genMarket smoke (all playable) ────────────────────────────────────────────
console.log('\n=== genMarket smoke (chrwar 1985) ===');
for (const id of legacyPlayable) {
  try {
    const r = genMarketSmoke(ctx, id);
    if (!r.ok) fail(`${id}: genMarket — ${r.err}`);
    else pass(`${id}: genMarket ok (${r.stations} stations)`);
  } catch (e) {
    fail(`${id}: genMarket threw — ${e?.message || e}`);
  }
}

console.log('\n=== Summary ===');
if (failures.length) {
  console.error(`\n${failures.length} failure(s) — do not deploy.`);
  console.error('If markets exist on main/houston-market but not this branch, merge before shipping.');
  process.exit(1);
}
console.log('\nAll market registry checks passed.');
