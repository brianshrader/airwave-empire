#!/usr/bin/env node
/**
 * Run validation suite for a market (default: atlanta).
 * Usage: node scripts/market-validation.js nashville
 *
 * Patches ACTIVE_MARKET in legacy.js at load time (headless only).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const marketId = (process.argv[2] || 'atlanta').toLowerCase();
const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
let legacySrc = fs.readFileSync(legacyPath, 'utf8');
if (!legacySrc.includes("const ACTIVE_MARKET='atlanta'")) {
  console.error('Expected ACTIVE_MARKET line not found; abort.');
  process.exit(1);
}
legacySrc = legacySrc.replace(
  /const ACTIVE_MARKET='atlanta'/,
  `const ACTIVE_MARKET='${marketId === 'atlanta' ? 'atlanta' : marketId}'`
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

function makeCtx() {
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
  vm.runInContext(legacySrc, ctx);
  return ctx;
}

console.log(`\n=== Market validation: ${marketId} ===\n`);

// ── 1) King of the Dial ×25 ─────────────────────────────────────
{
  const ctx = makeCtx();
  const runs = 25;
  const baseSeed = 20260326;
  vm.runInContext('globalThis.__kodRows = [];', ctx);
  for (let r = 0; r < runs; r++) {
    ctx.__r = r;
    ctx.__baseSeed = baseSeed;
    vm.runInContext(
      `
      (function(){
        var s = __baseSeed + __r * 131071;
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
      globalThis.__kodRows.push({ openSh: openSh, openOq: openOq, firstBookSh: p2.rat.share, totOpen: totOpen });
      `,
      ctx
    );
  }
  const rows2 = ctx.__kodRows;
  function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  const pct = (x) => Math.round(x * 10000) / 100;
  console.log('1) King of the Dial (25 runs)');
  console.log(JSON.stringify({
    openingSharePlayerPct: {
      min: pct(Math.min(...rows2.map((r) => r.openSh))),
      max: pct(Math.max(...rows2.map((r) => r.openSh))),
      avg: pct(mean(rows2.map((r) => r.openSh))),
    },
    openingOQ: {
      min: Math.min(...rows2.map((r) => r.openOq)),
      max: Math.max(...rows2.map((r) => r.openOq)),
      avg: Math.round(mean(rows2.map((r) => r.openOq)) * 10) / 10,
    },
    firstBookSharePlayerPct: {
      min: pct(Math.min(...rows2.map((r) => r.firstBookSh))),
      max: pct(Math.max(...rows2.map((r) => r.firstBookSh))),
      avg: pct(mean(rows2.map((r) => r.firstBookSh))),
    },
    openingTotalShareSum: {
      min: Math.min(...rows2.map((r) => r.totOpen)),
      max: Math.max(...rows2.map((r) => r.totOpen)),
      avg: mean(rows2.map((r) => r.totOpen)),
    },
  }, null, 2));
}

// ── 2) FM benchmark 100 ─────────────────────────────────────────
{
  const ctx = makeCtx();
  const runs = 100;
  const seed = 42;
  const isFmStation = (s) =>
    s && !s._bpSlotDeferred && !s.isPublic && (s.sig?.type === 'FM' || s.fmBooster);
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
  function mean(a) {
    if (!a.length) return 0;
    return a.reduce((x, y) => x + y, 0) / a.length;
  }
  console.log('\n2) FM benchmark (100 runs, seed 42)');
  [1978, 1979, 1980].forEach((y) => {
    const a = agg[y];
    if (!a.fmSharePct.length) {
      console.log(y, 'no data');
      return;
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
  });
}

// ── 3) Caps (uses marketAnnualBilling × revScale) ───────────────
{
  const ctx = makeCtx();
  const caps = vm.runInContext(
    `
    ({
      y1981: { promo: promoBudgetCapForPeriod({ year: 1981, marketId: '${marketId}' }), prog: progBudgetCapForPeriod({ year: 1981, marketId: '${marketId}' }) },
      y1989: { promo: promoBudgetCapForPeriod({ year: 1989, marketId: '${marketId}' }), prog: progBudgetCapForPeriod({ year: 1989, marketId: '${marketId}' }) }
    })
    `,
    ctx
  );
  console.log('\n3) Budget caps (promo/prog half-period)');
  console.log(JSON.stringify(caps, null, 2));
}

// ── 4) EBITDA snapshot NEWS_TALK wsb 1980p2 & 1989p2 ────────────
function ebitdaFor(ctx, year, period) {
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
      callLetters: p.callLetters,
      city: G.city,
      marketId: G.marketId
    };
    `,
    ctx
  );
  const o = ctx.__ebd;
  const m = o.rev ? (o.ebitda / o.rev) * 100 : 0;
  return { ...o, ebitdaMarginPct: Math.round(m * 10) / 10 };
}

{
  const ctx = makeCtx();
  console.log('\n4) Top AM News/Talk sample (1980 p2)');
  console.log(JSON.stringify(ebitdaFor(ctx, 1980, 2), null, 2));
}
{
  const ctx = makeCtx();
  console.log('\n4) Top AM News/Talk sample (1989 p2)');
  console.log(JSON.stringify(ebitdaFor(ctx, 1989, 2), null, 2));
}

console.log(`\nDone (${marketId}).\n`);
