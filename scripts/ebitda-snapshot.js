#!/usr/bin/env node
/**
 * Headless: player wsb station as NEWS/TALK AM, inject strong cohort shares, then calcRev + seedRev.
 * Usage: node scripts/ebitda-snapshot.js <year> <period>
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

const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
vm.runInContext(fs.readFileSync(legacyPath, 'utf8'), ctx);

const year = parseInt(process.argv[2] || '1980', 10);
const period = parseInt(process.argv[3] || '2', 10);

vm.runInContext(
  `
  (function(){
    var s = 424242;
    Math.random = function(){
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  })();
  G = genMarket('wsb');
  var p = G.stations.find(function(st){ return st.isPlayer; });
  p.format = 'NEWS_TALK';
  p.brand = gb('NEWS_TALK');
  while (!(G.year === ${year} && G.period === ${period})) { advTurn(); }
  // Strong incumbent: ~same cohort pull across demos (top-billing news AM)
  var sh = ${year} <= 1985 ? 0.124 : 0.118;
  COH.forEach(function(coh){
    var pop = (POP.cohorts[coh].t || 0) * effUniverse(p);
    var engage = AQH_ENGAGE[coh] || 0.06;
    if (!p.rat.cur[coh]) p.rat.cur[coh] = { share: 0, aqh: 0 };
    p.rat.cur[coh].share = sh;
    p.rat.cur[coh].aqh = Math.round(sh * pop * engage);
  });
  var ewp = COH.reduce(function(acc, c) {
    var pop = POP.cohorts[c].t || 0;
    var eng = AQH_ENGAGE[c] || 0.06;
    return acc + pop * eng;
  }, 0);
  p.rat.aqh = COH.reduce(function(sum, c) { return sum + (p.rat.cur[c].aqh || 0); }, 0);
  p.rat.share = COH.reduce(function(sum, c) {
    var pop = POP.cohorts[c].t || 0;
    var engage = AQH_ENGAGE[c] || 0.06;
    return sum + (p.rat.cur[c].share || 0) * (pop * engage) / Math.max(ewp, 1);
  }, 0);
  p.ops.spots = 14;
  p.ops.sell = 0.88;
  p.ops.promo = promoBudgetCapForPeriod(G);
  p.ops.progBudget = progBudgetCapForPeriod(G);
  G.stations.forEach(function(s) {
    if (s && !s._bpSlotDeferred && !s.isPublic) calcRev(s, G);
  });
  seedRev(G.stations, G);
  globalThis.__ebd = {
    rev: p.fin.rev,
    salesAdmin: p.fin.salesAdmin,
    opsFloor: p.fin.opsFloor,
    cost: p.fin.cost,
    ebitda: p.fin.ebitda,
    share: p.rat.share,
    callLetters: p.callLetters
  };
  `,
  ctx
);

const o = ctx.__ebd;
const m = o.rev ? (o.ebitda / o.rev) * 100 : 0;
console.log(JSON.stringify({ ...o, ebitdaMarginPct: Math.round(m * 10) / 10 }, null, 2));
