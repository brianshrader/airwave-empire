#!/usr/bin/env node
/**
 * Headless 1970 opening snapshot per market (genMarket 'under') — personality validation.
 * Usage: node scripts/personality-snapshot.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MARKETS = ['atlanta', 'nashville', 'newyork', 'losangeles', 'chicago'];
const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
let legacySrc = fs.readFileSync(legacyPath, 'utf8');
if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
  console.error('Expected ACTIVE_MARKET line');
  process.exit(1);
}

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

function makeCtx(marketId) {
  const src = legacySrc.replace(
    /let ACTIVE_MARKET='atlanta'/,
    `let ACTIVE_MARKET='${marketId}'`
  );
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
  vm.runInContext(src, ctx);
  return ctx;
}

function sumFmtShare(G, pred) {
  return G.stations
    .filter((s) => s && !s._bpSlotDeferred && !s.isPublic && pred(s))
    .reduce((a, s) => a + (s.rat.share || 0), 0);
}

function snapshot(ctx, seed, mid) {
  const G = vm.runInContext(
    `
    (function(){
      var s = ${seed};
      Math.random = function(){
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    })();
    genMarket('under');
    `,
    ctx
  );
  const comm = G.stations.filter((s) => s && !s._bpSlotDeferred && !s.isPublic);
  const country = sumFmtShare(G, (s) => s.format === 'COUNTRY');
  const fmTot = sumFmtShare(G, (s) => s.sig && s.sig.type === 'FM');
  const amTot = sumFmtShare(G, (s) => s.sig && s.sig.type === 'AM');
  const news = sumFmtShare(G, (s) => s.format === 'NEWS_TALK');
  const mor = sumFmtShare(G, (s) => s.format === 'MOR');
  const soul = sumFmtShare(G, (s) => s.format === 'SOUL_RNB');
  const spanish = sumFmtShare(G, (s) => s.format === 'SPANISH');
  const fmp70 = vm.runInContext(`effectiveFmpForMarket(1970, '${mid}')`, ctx);
  const fmp85 = vm.runInContext(`effectiveFmpForMarket(1985, '${mid}')`, ctx);
  return { country, fmTot, amTot, news, mor, soul, spanish, fmp70, fmp85, n: comm.length };
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function pct(x) {
  return Math.round(x * 10000) / 100;
}

console.log('1970 opening — genMarket("under") — 20 seeded runs per market\n');
console.log(
  'market      | country% | FM%   | AM%   | NEWS% | MOR%  | soul% | fmp70 | fmp85'
);
console.log(
  '------------+----------+-------+-------+-------+-------+-------+-------+------'
);

const rows = {};
for (const mid of MARKETS) {
  const ctx = makeCtx(mid);
  const runs = [];
  for (let r = 0; r < 20; r++) {
    runs.push(snapshot(ctx, 100000 + r * 99991 + mid.length * 17, mid));
  }
  const avg = (k) => mean(runs.map((x) => x[k]));
  rows[mid] = runs;
  console.log(
    `${mid.padEnd(12)}| ${pct(avg('country')).toFixed(2).padStart(7)} | ${pct(avg('fmTot')).toFixed(2).padStart(5)} | ${pct(avg('amTot')).toFixed(2).padStart(5)} | ${pct(avg('news')).toFixed(2).padStart(5)} | ${pct(avg('mor')).toFixed(2).padStart(5)} | ${pct(avg('soul')).toFixed(2).padStart(5)} | ${avg('fmp70').toFixed(4)} | ${avg('fmp85').toFixed(4)}`
  );
}
