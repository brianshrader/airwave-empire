#!/usr/bin/env node
/**
 * Campaign-level Digital strategy harness (analysis only — no production edits).
 *
 * Reuses production advTurn / genMarket / calcRev / companyFinanceRollup inside a VM
 * with the same headless stubs as scripts/test-digital-outcomes.js.
 *
 * How to run
 * ----------
 *   node scripts/test-digital-campaigns.js
 *   DIGITAL_CAMPAIGN_RUNS=40 DIGITAL_CAMPAIGN_SEED=42 ACTIVE_MARKET=nashville node scripts/test-digital-campaigns.js
 *
 * Body: scripts/test-digital-campaigns-harness.vm.js (sets globalThis.__wlDigitalCampaignReport).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
  };
}

const documentStub = {
  body: { innerHTML: '' },
  head: { appendChild() {} },
  createElement() {
    return { href: '', download: '', click() {} };
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
};

const _hostLog = console.log.bind(console);
const _hostWarn = console.warn.bind(console);
const _quietConsole = {
  ...console,
  log(...args) {
    const m = args[0];
    if (typeof m === 'string' && (m.indexOf('[BTN]') === 0 || m.indexOf('[Airwave Empire]') === 0)) return;
    return _hostLog(...args);
  },
  warn(...args) {
    const m = args[0];
    if (typeof m === 'string' && m.indexOf('[recalc]') === 0) return;
    return _hostWarn(...args);
  },
};

const ctx = vm.createContext({
  console: _quietConsole,
  __WL_HEADLESS__: true,
  __WL_SHARE_INSPECT_ONLY: true,
  __WL_REQUIRE_CLERK: true,
  globalThis: null,
  window: null,
  document: documentStub,
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  location: { reload() {} },
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
  addEventListener() {},
  removeEventListener() {},
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

const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
vm.runInContext(fs.readFileSync(legacyPath, 'utf8'), ctx);

const marketId = process.env.ACTIVE_MARKET || 'nashville';
const runs = Math.max(1, Math.min(200, parseInt(process.env.DIGITAL_CAMPAIGN_RUNS || '30', 10) || 30));
const baseSeed =
  Math.max(0, parseInt(process.env.DIGITAL_CAMPAIGN_SEED || '20250421', 10) || 0) >>> 0;

const harnessPath = path.join(__dirname, 'test-digital-campaigns-harness.vm.js');
const harnessSrc = fs.readFileSync(harnessPath, 'utf8');

vm.runInContext(
  `
  ACTIVE_MARKET = ${JSON.stringify(marketId)};
  _selectedMarket = ${JSON.stringify(marketId)};
  if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(${JSON.stringify(marketId)});
  globalThis.__wlCampaignRuns = ${runs};
  globalThis.__wlCampaignBaseSeed = ${baseSeed};
  ` + harnessSrc,
  ctx
);

const report = ctx.globalThis.__wlDigitalCampaignReport;
if (typeof report !== 'string' || !report.length) {
  console.error('Harness did not set __wlDigitalCampaignReport');
  process.exit(1);
}
console.log(report);
