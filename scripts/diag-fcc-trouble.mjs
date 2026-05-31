#!/usr/bin/env node
/**
 * FCC trouble / for-cause termination regression checks (headless legacy.js).
 *
 *   node scripts/diag-fcc-trouble.mjs
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
    addEventListener() {},
    removeEventListener() {},
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
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext() {
  const noop = () => {};
  const ctx = vm.createContext({
    console,
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert: noop,
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(typedArray) {
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = (i * 17 + 3) & 0xff;
        return typedArray;
      },
      randomUUID() { return '00000000-0000-4000-8000-000000000001'; },
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
    Symbol,
    Proxy,
    Reflect,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Int8Array,
    Uint8Array,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {}, emit() {}, action() {} };
  return ctx;
}

function loadLegacy(ctx) {
  const src = readFileSync(legacyPath, 'utf8');
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 120_000 });
  if (!ctx.__wlTroubleTestHooks) throw new Error('__wlTroubleTestHooks missing — expose from legacy.js');
  return ctx.__wlTroubleTestHooks;
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function makeMom() {
  const mom = {};
  for (const c of ['12-17', '18-24', '25-34', '35-49', '50-64', '65+']) {
    mom[c] = { cur: 0.05, tgt: 0.05 };
  }
  return mom;
}

function makeTalent(overrides = {}) {
  return {
    name: 'Test Host',
    salary: 100000,
    cyr: 2,
    morale: 65,
    quality: 72,
    periodsAtStation: 12,
    ...overrides,
  };
}

function makePlayerStation(id, slot, talent, extra = {}) {
  return {
    id,
    callLetters: 'WTEST',
    isPlayer: true,
    format: 'NEWS_TALK',
    identity: 45,
    oq: 70,
    ops: { sell: 0.65, spots: 0.5 },
    mom: makeMom(),
    rat: { share: 0.06, cur: makeMom() },
    prog: {
      morningDrive: { quality: 70 },
      midday: { quality: 70 },
      afternoonDrive: { quality: 70 },
      evening: { quality: 70 },
      overnight: { quality: 60 },
      [slot]: { talent, quality: 75 },
    },
    ...extra,
  };
}

function runCase(ctx, hooks, label, setup, optionIdx, expect) {
  const gameState = setup();
  ctx.__diagG = gameState;
  ctx.__diagExpect = expect;
  ctx.__diagOptionIdx = optionIdx;
  vm.runInContext(`(function(){
    G = __diagG;
    const cash0 = G.cash;
    const pending = G.pendingDecisionEvent;
    const appeal = __diagExpect.appealRemote != null ? __diagExpect.appealRemote : null;
    __wlTroubleTestHooks.applyTroubleResolution(pending.stationId, pending.slot, __diagOptionIdx, appeal);
    const st = G.stations.find(x => x.id === pending.stationId);
    __diagResult = {
      cashDelta: cash0 - G.cash,
      holderId: G.franchiseRights?.[pending.franchiseId]?.holderId ?? undefined,
      relationship: G.franchiseRights?.[pending.franchiseId]?.relationship?.[pending.stationId],
      sell: st?.ops?.sell,
      talentRemoved: !st?.prog?.[pending.slot]?.talent,
      franchiseHeld: !!__wlTroubleTestHooks.getStationFranchise(st, pending.slot, G),
    };
  })();`, ctx);
  const result = ctx.__diagResult;
  if (expect.cashDelta != null) {
    assert(result.cashDelta === expect.cashDelta, `${label}: cash delta ${result.cashDelta}, expected ${expect.cashDelta}`);
  }
  if (expect.talentRemoved != null) {
    assert(result.talentRemoved === expect.talentRemoved, `${label}: talentRemoved=${result.talentRemoved}, got ${result.talentRemoved}`);
  }
  if (expect.franchiseHeld != null) {
    assert(result.franchiseHeld === expect.franchiseHeld, `${label}: franchiseHeld=${expect.franchiseHeld}, got ${result.franchiseHeld}`);
  }
  if (expect.holderId != null) {
    assert(result.holderId === expect.holderId, `${label}: holderId=${result.holderId}, expected ${expect.holderId}`);
  }
  if (expect.relationship != null) {
    assert(result.relationship === expect.relationship, `${label}: relationship=${result.relationship}, expected ${expect.relationship}`);
  }
  if (expect.sell != null) {
    assert(Math.abs((result.sell || 0) - expect.sell) < 0.0001, `${label}: sell=${result.sell}, expected ${expect.sell}`);
  }
  console.log('OK', label);
}

const ctx = createVmContext();
const hooks = loadLegacy(ctx);

const buyout = hooks.talentFireBuyout(makeTalent());
assert(buyout === 120000, `sanity buyout formula expected 120000, got ${buyout}`);

runCase(ctx, hooks, 'local fcc_language apology — single fine', () => {
  const slot = 'morningDrive';
  const talent = makeTalent();
  const st = makePlayerStation('p1', slot, talent);
  return {
    year: 1990,
    period: 1,
    cash: 500000,
    stations: [st],
    ps: [st],
    news: [],
    pendingDecisionEvent: {
      scenarioId: 'fcc_language',
      stationId: 'p1',
      slot,
      talentName: talent.name,
      year: 1990,
      period: 1,
      ownerId: 0,
    },
  };
}, 0, { cashDelta: 15000, talentRemoved: false });

runCase(ctx, hooks, 'local fcc_indecency settle — single fine', () => {
  const slot = 'morningDrive';
  const talent = makeTalent();
  const st = makePlayerStation('p1', slot, talent);
  return {
    year: 1990,
    period: 1,
    cash: 500000,
    stations: [st],
    ps: [st],
    news: [],
    pendingDecisionEvent: {
      scenarioId: 'fcc_indecency',
      stationId: 'p1',
      slot,
      talentName: talent.name,
      year: 1990,
      period: 1,
      ownerId: 0,
    },
  };
}, 1, { cashDelta: 50000, talentRemoved: false });

runCase(ctx, hooks, 'local fcc_language for-cause fire — fine only, no buyout', () => {
  const slot = 'morningDrive';
  const talent = makeTalent();
  const st = makePlayerStation('p1', slot, talent);
  return {
    year: 1990,
    period: 1,
    cash: 500000,
    stations: [st],
    ps: [st],
    news: [],
    pendingDecisionEvent: {
      scenarioId: 'fcc_language',
      stationId: 'p1',
      slot,
      talentName: talent.name,
      year: 1990,
      period: 1,
      ownerId: 0,
    },
  };
}, 2, { cashDelta: 15000, talentRemoved: true });

runCase(ctx, hooks, 'non-FCC DUI terminate — still charges buyout', () => {
  const slot = 'morningDrive';
  const talent = makeTalent();
  const st = makePlayerStation('p1', slot, talent);
  return {
    year: 1990,
    period: 1,
    cash: 500000,
    stations: [st],
    ps: [st],
    news: [],
    pendingDecisionEvent: {
      scenarioId: 'dui',
      stationId: 'p1',
      slot,
      talentName: talent.name,
      year: 1990,
      period: 1,
      ownerId: 0,
    },
  };
}, 2, { cashDelta: 120000, talentRemoved: true });

runCase(ctx, hooks, 'franchise fcc drop — clears holder, no buyout', () => {
  const slot = 'morningDrive';
  const st = makePlayerStation('p1', slot, null, { format: 'PERSONALITY_TALK' });
  st.prog.morningDrive = { quality: 80 };
  return {
    year: 1990,
    period: 1,
    cash: 500000,
    stations: [st],
    ps: [st],
    news: [],
    franchiseRights: {
      wild_card: {
        holderId: 'p1',
        holderName: 'WTEST',
        fee: 320000,
        contractEnd: 1994,
        relationship: { p1: 40 },
        bids: {},
        auctionOpen: false,
      },
    },
    pendingDecisionEvent: {
      isFranchise: true,
      franchiseId: 'wild_card',
      scenarioId: 'fcc_indecency',
      stationId: 'p1',
      slot,
      talentName: '"The Wild Card Morning Show" (national franchise)',
      year: 1990,
      period: 1,
      ownerId: 0,
    },
  };
}, 2, { cashDelta: 50000, holderId: null, franchiseHeld: false, relationship: 10 });

runCase(ctx, hooks, 'franchise fcc stand by — keeps franchise, advertiser hit', () => {
  const slot = 'morningDrive';
  const st = makePlayerStation('p1', slot, null, { format: 'PERSONALITY_TALK' });
  st.prog.morningDrive = { quality: 80 };
  return {
    year: 1990,
    period: 1,
    cash: 500000,
    stations: [st],
    ps: [st],
    news: [],
    franchiseRights: {
      wild_card: {
        holderId: 'p1',
        holderName: 'WTEST',
        fee: 320000,
        contractEnd: 1994,
        relationship: { p1: 50 },
        bids: {},
        auctionOpen: false,
      },
    },
    pendingDecisionEvent: {
      isFranchise: true,
      franchiseId: 'wild_card',
      scenarioId: 'fcc_language',
      stationId: 'p1',
      slot,
      talentName: '"The Wild Card Morning Show" (national franchise)',
      year: 1990,
      period: 1,
      ownerId: 0,
    },
  };
}, 0, { cashDelta: 15000, holderId: 'p1', franchiseHeld: true, relationship: 50, sell: 0.63 });

runCase(ctx, hooks, 'franchise fcc distance — keeps franchise, syndicator penalty', () => {
  const slot = 'morningDrive';
  const st = makePlayerStation('p1', slot, null, { format: 'PERSONALITY_TALK' });
  st.prog.morningDrive = { quality: 80 };
  return {
    year: 1990,
    period: 1,
    cash: 500000,
    stations: [st],
    ps: [st],
    news: [],
    franchiseRights: {
      wild_card: {
        holderId: 'p1',
        holderName: 'WTEST',
        fee: 320000,
        contractEnd: 1994,
        relationship: { p1: 50 },
        bids: {},
        auctionOpen: false,
      },
    },
    pendingDecisionEvent: {
      isFranchise: true,
      franchiseId: 'wild_card',
      scenarioId: 'fcc_language',
      stationId: 'p1',
      slot,
      talentName: '"The Wild Card Morning Show" (national franchise)',
      year: 1990,
      period: 1,
      ownerId: 0,
    },
  };
}, 1, { cashDelta: 15000, holderId: 'p1', franchiseHeld: true, relationship: 40, sell: 0.64 });

console.log('\nAll FCC trouble diagnostics passed.');
