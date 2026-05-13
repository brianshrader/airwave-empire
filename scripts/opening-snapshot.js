#!/usr/bin/env node
/**
 * Opening market snapshots: country count/share, 50kW AMs, format families, FM share.
 * Usage: node scripts/opening-snapshot.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
let legacySrc = fs.readFileSync(legacyPath, 'utf8');

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
  let src = legacySrc;
  src = src.replace(/let ACTIVE_MARKET='[^']+'/, `let ACTIVE_MARKET='${marketId}'`);
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

function pct(x) {
  return Math.round(x * 10000) / 100;
}

function snapshot(ctx, label, scenId) {
  vm.runInContext(`Math.random = function(){ return 0.42; };`, ctx);
  const G = vm.runInContext(`genMarket('${scenId}')`, ctx);
  ctx.G = G;
  const comm = G.stations.filter((s) => s && !s._bpSlotDeferred && !s.isPublic);
  const country = comm.filter((s) => s.format === 'COUNTRY');
  const countrySh = country.reduce((a, s) => a + (s.rat.share || 0), 0);
  const totalSh = comm.reduce((a, s) => a + (s.rat.share || 0), 0);
  const am50 = comm.filter((s) => s.sig?.type === 'AM' && s.sig.pw === '50kw').length;
  const fm = comm.filter((s) => s.sig?.type === 'FM' || s.fmBooster);
  const fmSh = fm.reduce((a, s) => a + (s.rat.share || 0), 0);

  const family = (fmt) => {
    if (['TOP40', 'CHR', 'RHYTHMIC', 'HOT_AC', 'CLASSIC_HITS'].includes(fmt)) return 'chr_top40_hotac';
    if (['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK', 'AAA'].includes(fmt)) return 'aor_rock';
    if (['NEWS_TALK', 'SPORTS_TALK', 'ALL_NEWS', 'PERSONALITY_TALK'].includes(fmt)) return 'talk_news';
    if (['BEAUTIFUL_MUSIC', 'MOR', 'ADULT_CONTEMP', 'ADULT_STANDARDS'].includes(fmt)) return 'ac_mor_bm';
    if (fmt === 'COUNTRY') return 'country';
    if (['SOUL_RNB', 'URBAN_CONTEMP'].includes(fmt)) return 'urban_soul';
    if (fmt === 'SPANISH') return 'spanish';
    return 'other';
  };
  const byFam = {};
  comm.forEach((s) => {
    const f = family(s.format);
    byFam[f] = (byFam[f] || 0) + (s.rat.share || 0);
  });
  const famPct = Object.fromEntries(
    Object.entries(byFam)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, pct(totalSh > 0 ? v / totalSh : 0)])
  );

  return {
    label,
    market: G.marketId,
    year: G.year,
    scen: scenId,
    countryStations: country.length,
    countryCombinedSharePct: pct(countrySh),
    am50kwCount: am50,
    fmTotalSharePct: pct(totalSh > 0 ? fmSh / totalSh : 0),
    familiesPct: famPct,
  };
}

const runs = [
  ['New York 1970', 'newyork', 'wsb'],
  ['New York 1978', 'newyork', 'fmrev'],
  ['Atlanta 1970', 'atlanta', 'wsb'],
  ['Nashville 1970', 'nashville', 'wsb'],
  ['Los Angeles 1970', 'losangeles', 'wsb'],
  ['Chicago 1970', 'chicago', 'wsb'],
  ['Seattle 1970', 'seattle', 'wsb'],
];

console.log(JSON.stringify(runs.map(([label, mid, scen]) => {
  const ctx = makeCtx(mid);
  return snapshot(ctx, label, scen);
}), null, 2));
