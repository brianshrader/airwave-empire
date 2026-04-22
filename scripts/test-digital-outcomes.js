#!/usr/bin/env node
/**
 * Local-only Digital economics scenario harness.
 *
 * What it tests
 * --------------
 * Runs synthetic stations through production `calcRev` / `seedRev` plus Digital helpers
 * (`stationDigitalStrength`, `stationDigitalVolatilityMult`, `stationDigitalTerrestrialDrag`)
 * across years, formats, talent tiers, and Digital launch profiles. Compares outcomes in
 * fixed groups (A–E) to see whether Digital uplift, share, talent sensitivity, and early-mover
 * effects look balanced — not as pass/fail tests, but as review flags.
 * Also reports **Digital listening share** (AQH-based): `streamAqh / (terrAqh + streamAqh)` using
 * cohort AQH sums and `s.stream.aqh` from the same `calcRev` pass — compared to a ~12% ballpark
 * and summarized by year/format (see harness file header).
 *
 * How to run
 * ----------
 *   node scripts/test-digital-outcomes.js
 *
 * Optional: `ACTIVE_MARKET=nashville node scripts/test-digital-outcomes.js` (default nashville).
 *
 * Warning flags (heuristics)
 * --------------------------
 * Printed at end when thresholds trip: high digital share by era, large uplift for weak
 * stations, weak talent getting nearly the same digital benefit as superstar, small no-Digital
 * penalty in 2024, early-mover digRev more than 2× late entrant, etc. These are not failures.
 *
 * @see scripts/test-digital-outcomes-harness.vm.js — body executed inside vm after `legacy.js`.
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

const ctx = vm.createContext({
  console,
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

vm.runInContext(
  `
  (function(){
    var s = 999888;
    Math.random = function(){
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  })();
  `,
  ctx
);

const marketId = process.env.ACTIVE_MARKET || 'nashville';
const harnessPath = path.join(__dirname, 'test-digital-outcomes-harness.vm.js');
const harnessSrc = fs.readFileSync(harnessPath, 'utf8');

vm.runInContext(`ACTIVE_MARKET = ${JSON.stringify(marketId)};\n` + harnessSrc, ctx);

const report = ctx.globalThis.__wlDigitalHarnessReport;
if (typeof report !== 'string' || !report.length) {
  console.error('Harness did not set __wlDigitalHarnessReport');
  process.exit(1);
}
console.log(report);
