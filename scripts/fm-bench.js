#!/usr/bin/env node
/**
 * Headless FM market stats (1970–1980). Requires src/legacy.js __WL_HEADLESS__ guards.
 * G must be assigned inside vm (let G is not ctx.G).
 * Usage: node scripts/fm-bench.js [runs] [seed]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const runs = Math.max(1, parseInt(process.argv[2] || '100', 10) || 100);
const seed = process.argv[3] !== undefined ? parseInt(process.argv[3], 10) : Date.now();

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
  setTimeout(fn, _delay, ...args) {
    if (typeof fn === 'function') fn(...args);
    return 0;
  },
  setInterval() { return 0; },
  clearTimeout() {}, clearInterval() {},
  requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
  alert() {},
  fetch: null,
  btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
  Blob: class { constructor() {} },
  FileReader: class { readAsText() {} },
  Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, WeakMap, WeakSet,
  Symbol, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
  Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array,
  ArrayBuffer, DataView, TextEncoder, TextDecoder,
  Promise,
  Buffer,
});

ctx.globalThis = ctx;
ctx.window = ctx;

const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
vm.runInContext(fs.readFileSync(legacyPath, 'utf8'), ctx);

function isFmStation(s) {
  return s && !s._bpSlotDeferred && !s.isPublic && (s.sig?.type === 'FM' || s.fmBooster);
}

function shareOf(s, snap) {
  const v = snap.shares[s.id];
  return v !== undefined ? v : s.rat.share || 0;
}

function statsForYear(stations, year, snap) {
  const comm = stations.filter((s) => s && !s._bpSlotDeferred && !s.isPublic);
  const ranked = [...comm].sort((a, b) => shareOf(b, snap) - shareOf(a, snap));
  const fm = comm.filter(isFmStation);
  const fmShare = fm.reduce((a, s) => a + shareOf(s, snap), 0);
  const totalShare = comm.reduce((a, s) => a + shareOf(s, snap), 0);
  const top10 = ranked.slice(0, 10);
  const fmInTop = top10.filter(isFmStation).length;
  const fmInTopList = top10.filter(isFmStation);
  const bestRank = fmInTopList.length
    ? Math.min(...fmInTopList.map((s) => ranked.findIndex((x) => x.id === s.id) + 1))
    : null;
  const bestShare = fmInTopList.length ? Math.max(...fmInTopList.map((s) => shareOf(s, snap))) : 0;
  return {
    year,
    fmSharePct: totalShare > 0 ? (fmShare / totalShare) * 100 : 0,
    fmInTop,
    bestRank: bestRank ?? 11,
    bestSharePct: bestShare * 100,
  };
}

const agg = {};
for (let y = 1970; y <= 1980; y++) {
  agg[y] = { fmSharePct: [], fmInTop: [], bestRank: [], bestSharePct: [] };
}

for (let r = 0; r < runs; r++) {
  vm.runInContext(
    `
    (function(){
      var s = ${seed} + ${r} * 99991;
      Math.random = function(){
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    })();
    G = genMarket('under');
    while (!(G.year === 1981 && G.period === 1)) { advTurn(); }
    globalThis.__fmBench = { h: G.rankerHistory, stations: G.stations };
    `,
    ctx
  );

  const { h, stations } = ctx.__fmBench || { h: [], stations: [] };
  for (let y = 1970; y <= 1980; y++) {
    const snap = h.filter((x) => x.year === y && x.period === 2).pop();
    if (!snap) continue;
    const st = statsForYear(stations, y, snap);
    agg[y].fmSharePct.push(st.fmSharePct);
    agg[y].fmInTop.push(st.fmInTop);
    agg[y].bestRank.push(st.bestRank);
    agg[y].bestSharePct.push(st.bestSharePct);
  }
}

const fmp1980 = vm.runInContext('fmpForYear(1980)', ctx);

function mean(a) {
  if (!a.length) return 0;
  return a.reduce((x, y) => x + y, 0) / a.length;
}

console.log(JSON.stringify({ runs, seed, fmp1980 }, null, 0));
for (let y = 1970; y <= 1980; y++) {
  const a = agg[y];
  if (!a.fmSharePct.length) {
    console.log(y, 'no data');
    continue;
  }
  console.log(
    [
      y,
      'fmTot%',
      mean(a.fmSharePct).toFixed(2),
      'fmTop10',
      mean(a.fmInTop).toFixed(2),
      'bestRank',
      mean(a.bestRank).toFixed(2),
      'bestFm%',
      mean(a.bestSharePct).toFixed(2),
    ].join(' ')
  );
}
