#!/usr/bin/env node
/**
 * King of the Dial (wsb) ×25: opening player share, OQ, share after first advTurn.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
  console: { log() {}, error: console.error },
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

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy.js'), 'utf8'), ctx);

const runs = 25;
const baseSeed = 20260326;
const rows = [];

for (let r = 0; r < runs; r++) {
  vm.runInContext(
    `
    (function(){
      var s = ${baseSeed} + ${r} * 131071;
      Math.random = function(){
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    })();
    G = genMarket('wsb');
    var p = G.stations.find(function(st){ return st.isPlayer; });
    var openSh = p.rat.share;
    var openOq = p.oq;
    var comm = G.stations.filter(function(s){ return s && !s._bpSlotDeferred && !s.isPublic; });
    var totOpen = comm.reduce(function(a, s){ return a + (s.rat.share || 0); }, 0);
    advTurn();
    var p2 = G.stations.find(function(st){ return st.isPlayer; });
    var firstBookSh = p2.rat.share;
    globalThis.__kod = { openSh: openSh, openOq: openOq, firstBookSh: firstBookSh, totOpen: totOpen };
    `,
    ctx
  );
  const k = ctx.__kod;
  rows.push(k);
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

const pct = (x) => Math.round(x * 10000) / 100;
console.log(JSON.stringify({
  runs,
  openingSharePlayerPct: { min: pct(Math.min(...rows.map((r) => r.openSh))), max: pct(Math.max(...rows.map((r) => r.openSh))), avg: pct(mean(rows.map((r) => r.openSh))) },
  openingOQ: { min: Math.min(...rows.map((r) => r.openOq)), max: Math.max(...rows.map((r) => r.openOq)), avg: Math.round(mean(rows.map((r) => r.openOq)) * 10) / 10 },
  firstBookSharePlayerPct: { min: pct(Math.min(...rows.map((r) => r.firstBookSh))), max: pct(Math.max(...rows.map((r) => r.firstBookSh))), avg: pct(mean(rows.map((r) => r.firstBookSh))) },
  openingTotalShareSum: { min: Math.min(...rows.map((r) => r.totOpen)), max: Math.max(...rows.map((r) => r.totOpen)), avg: mean(rows.map((r) => r.totOpen)) },
}, null, 2));
