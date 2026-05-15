#!/usr/bin/env node
/**
 * Phase-1 pilot market-health smoke (genMarketMP 1985 → 2025): station counts / survival signals by decade.
 *
 *   node scripts/run-phase1-market-health-smoke.mjs
 *   PHASE1_QUICK=0 node scripts/run-phase1-market-health-smoke.mjs   # full (slow): 4 runs/market
 *
 * Output: stdout + tmp/phase1_market_health_smoke.txt
 * Requires: src/legacy.js, src/marketSimHarness.js (no Playwright).
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { ALL_PLAYABLE_MARKET_IDS } from './market-ids.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outTxt = path.join(root, 'tmp', 'phase1_market_health_smoke.txt');

const PHASE1 = ALL_PLAYABLE_MARKET_IDS;

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function loadLegacySrc() {
  let src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  return injectHeadlessMegaFragNewsGuard(src);
}

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
    getAttribute() {
      return null;
    },
    setAttribute() {},
  };
}

const documentStub = {
  body: {
    innerHTML: '',
    appendChild() {},
    contains() {
      return false;
    },
  },
  head: { appendChild() {} },
  createElement() {
    return stubEl();
  },
  getElementById() {
    return stubEl();
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
  readyState: 'complete',
  /** legacy.js registers dev tutorial hotkeys at parse time */
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext() {
  const noop = () => {};
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error, table: noop },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() {
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class {
      constructor() {}
    },
    FileReader: class {
      readAsText() {}
    },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) {
          typedArray[i] = Math.floor(Math.random() * 256);
        }
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
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
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function main() {
  const quick = process.env.PHASE1_QUICK !== '0' && process.env.PHASE1_QUICK !== 'false';
  const ctx = createVmContext();
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);

  const out = vm.runInContext(
    `
    runMarketHealthByDecadeDiagnostic({
      markets: ${JSON.stringify(PHASE1)},
      quick: ${quick ? 'true' : 'false'},
      numRunsPerMarket: ${quick ? 2 : 4},
      verbose: false,
      endYear: 2025,
      seed: 20260202,
    })
    `,
    ctx
  );

  const text = (out && out.plainEnglish) || JSON.stringify(out, null, 2);
  mkdirSync(path.dirname(outTxt), { recursive: true });
  writeFileSync(outTxt, text, 'utf8');

  console.log(`Phase-1 market health (${PHASE1.join(', ')}) · quick=${quick}`);
  console.log(`Wrote ${outTxt}\n`);
  console.log(text);
}

main();
