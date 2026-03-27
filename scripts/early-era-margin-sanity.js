#!/usr/bin/env node
/**
 * NYC 1971 p1: two representative stations (AM News/Talk, FM AC), fixed shares, calcRev+seedRev.
 * Usage: LEGACY_PATH=path/to/legacy.js node scripts/early-era-margin-sanity.js
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

function run(legacyPath) {
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
    ACTIVE_MARKET = 'newyork';
    G = genMarket('wsb');
    while (!(G.year === 1971 && G.period === 1)) { advTurn(); }
    var comm = G.stations.filter(function(st){ return st && !st._bpSlotDeferred && !st.isPublic; });
    var amNt = comm.find(function(st){ return st.sig && st.sig.type === 'AM'; });
    var fmAc = comm.find(function(st){ return st.sig && st.sig.type === 'FM'; });
    if (!amNt || !fmAc) { throw new Error('need one AM and one FM commercial station'); }
    amNt.format = 'NEWS_TALK';
    amNt.brand = gb('NEWS_TALK');
    fmAc.format = 'ADULT_CONTEMP';
    fmAc.brand = gb('ADULT_CONTEMP');
    function injectStation(p, sh) {
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
    }
    injectStation(amNt, 0.044);
    injectStation(fmAc, 0.024);
    G.stations.forEach(function(s) {
      if (s && !s._bpSlotDeferred && !s.isPublic) calcRev(s, G);
    });
    seedRev(G.stations, G);
    function marginPct(st) {
      var r = st.fin.rev || 0;
      if (!r) return 0;
      return Math.round((st.fin.ebitda / r) * 1000) / 10;
    }
    globalThis.__out = {
      market: ACTIVE_MARKET,
      year: G.year,
      period: G.period,
      newsTalk: { call: amNt.callLetters, share: Math.round(amNt.rat.share * 1000) / 10, marginPct: marginPct(amNt) },
      fmAc: { call: fmAc.callLetters, share: Math.round(fmAc.rat.share * 1000) / 10, marginPct: marginPct(fmAc) },
    };
    `,
    ctx
  );
  return ctx.__out;
}

const legacyPath = process.env.LEGACY_PATH || path.join(__dirname, '..', 'src', 'legacy.js');
const out = run(legacyPath);
console.log(JSON.stringify(out, null, 2));
