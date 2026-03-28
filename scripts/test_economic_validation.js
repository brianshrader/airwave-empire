#!/usr/bin/env node
/**
 * VM-loads src/legacy.js (with ACTIVE_MARKET patched), runs genMarket + seedRev.
 * Usage: node scripts/test_economic_validation.js
 * Default: Los Angeles + Underdog (matches economic validation harness expectations).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const marketId = (process.argv[2] || 'losangeles').toLowerCase();
const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
let legacySrc = fs.readFileSync(legacyPath, 'utf8');
if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
  console.error("Expected ACTIVE_MARKET line not found; abort.");
  process.exit(1);
}
legacySrc = legacySrc.replace(
  /let ACTIVE_MARKET='atlanta'/,
  `let ACTIVE_MARKET='${marketId === 'atlanta' ? 'atlanta' : marketId}'`
);

function stubEl() {
  return {
    disabled: false, textContent: '', innerHTML: '', value: '',
    style: {}, classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {}, querySelector() { return null; }, focus() {}, click() {},
    addEventListener() {}, removeEventListener() {},
  };
}
const documentStub = {
  body: { innerHTML: '' },
  head: { appendChild() {} },
  createElement() { return { href: '', download: '', click() {} }; },
  getElementById() { return stubEl(); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
};

const ctx = vm.createContext({
  console,
  __WL_HEADLESS__: true,
  globalThis: null,
  window: null,
  document: documentStub,
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  location: { reload() {} },
  URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
  setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
  setInterval() { return 0; },
  clearTimeout() {}, clearInterval() {},
  requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
  alert() {},
  fetch: null,
  btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
  Blob: class { constructor() {} },
  FileReader: class { readAsText() {} },
  Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
  Symbol, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
  Int8Array, Uint8Array, Buffer,
  Promise,
});
ctx.globalThis = ctx;
ctx.window = ctx;
vm.runInContext(legacySrc, ctx);

vm.runInContext(
  `
(function(){
  var s = 424242;
  Math.random = function(){
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
})();
G = genMarket('under');
seedRev(G.stations, G);
`,
  ctx
);
