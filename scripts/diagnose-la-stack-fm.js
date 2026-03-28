#!/usr/bin/env node
/**
 * Diagnostic: LA Stack FM station — revenue/cost breakdown and sensitivity (no legacy edits).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SEED = 424242;
const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
let legacySrc = fs.readFileSync(legacyPath, 'utf8');
legacySrc = legacySrc.replace(
  /let ACTIVE_MARKET='atlanta'/,
  `let ACTIVE_MARKET='losangeles'`
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

vm.runInContext(
  `
  (function(){
    var s = ${SEED};
    Math.random = function(){
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  })();
  G = genMarket('stack');
  var fm = G.stations.find(function(st){ return st && st.isPlayer && st.sig && st.sig.type === 'FM'; });
  var commIds = G.stations.filter(function(st){ return st && !st._bpSlotDeferred && !st.isPublic; }).map(function(st){ return st.id; });
  G._econDebugIds = commIds;
  seedRev(G.stations, G);
  `,
  ctx
);

const out = vm.runInContext(
  `
  (function(){
    var fm = G.stations.find(function(st){ return st && st.isPlayer && st.sig && st.sig.type === 'FM'; });
    if (!fm) return { error: 'no FM player' };
    var row = (G._econDebugLog && G._econDebugLog.find(function(r){ return r.id === fm.id; })) || null;
    var mkt = G.marketId || ACTIVE_MARKET;
    var comm = G.stations.filter(function(s){ return s && !s._bpSlotDeferred && !s.isPublic; });
    var sorted = comm.slice().sort(function(a,b){ return (b.rat && b.rat.share || 0) - (a.rat && a.rat.share || 0); });
    var n = sorted.length;
    var rankIdx = -1;
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i].id === fm.id) { rankIdx = i; break; }
    }
    var eff = stationRevenueMonetizationEfficiency(rankIdx, n, mkt);
    var rawRev = row ? row.totalRev : null;
    var rawById = {};
    if (G._econDebugLog) {
      G._econDebugLog.forEach(function(r){ rawById[r.id] = r.totalRev; });
    }
    var sumAdj = 0;
    comm.forEach(function(s){
      var raw = rawById[s.id];
      if (raw == null) return;
      var e = stationRevenueMonetizationEfficiency(
        sorted.findIndex(function(st){ return st.id === s.id; }),
        n,
        mkt
      );
      sumAdj += raw * e;
    });
    var annualTarget = marketAnnualBilling(G.year, mkt);
    var halfTarget = Math.round(annualTarget * 0.5 * marketHalfSeasonFactor(G.year, G.period || 1) * Math.max(0.75, G.adx || 1));
    var scale = sumAdj > 0 && halfTarget > 0 ? halfTarget / sumAdj : 1;
    var fin = fm.fin;
    var otherCost = fin.cost - fin.fix - (fin.tal || 0) - (fin.salesAdmin || 0) - (fin.opsFloor || 0);
    return {
      callLetters: fm.callLetters,
      format: fm.format,
      share: fm.rat && fm.rat.share,
      row: row,
      monetizationEff: eff,
      scale: scale,
      sumAdj: sumAdj,
      halfTarget: halfTarget,
      rawRevAfterCalcRev: rawRev,
      finalRev: fin.rev,
      finalCost: fin.cost,
      ebitda: fin.ebitda,
      fix: fin.fix,
      tal: fin.tal,
      salesAdmin: fin.salesAdmin,
      opsFloor: fin.opsFloor,
      salesAdminRate: fin.salesAdminRate,
      otherCost: otherCost,
      syndicationRights: fin.syndicationRights || 0,
      simulcastProgFee: fin.simulcastProgFee || 0,
      streamUpkeep: fin.streamUpkeep || 0,
    };
  })()
  `,
  ctx
);

function marginPct(rev, ebitda) {
  if (!rev || rev <= 0) return null;
  return (ebitda / rev) * 100;
}

const f = out;
const rev = f.finalRev;
const cost = f.finalCost;
const ops = f.opsFloor;
const fix = f.fix;
const tal = f.tal;
const sa = f.salesAdmin;

// Sensitivity on post–seedRev totals (algebraic; salesAdmin scales ~ with rev in model)
const ebitda = f.ebitda;

function case1() {
  const newCost = cost - ops * 0.5;
  const newEbit = rev - newCost;
  return marginPct(rev, newEbit);
}
function case2() {
  const newCost = cost - fix * 0.25;
  const newEbit = rev - newCost;
  return marginPct(rev, newEbit);
}
function case3() {
  const newRev = Math.round(rev * 1.5);
  const newSa = Math.round(sa * 1.5);
  const newCost = cost - sa + newSa;
  const newEbit = newRev - newCost;
  return marginPct(newRev, newEbit);
}

// % of total cost by component (use actual fin fields)
const parts = [
  ['fixed (staff+fac+reg+sf)', fix],
  ['talent', tal],
  ['salesAdmin', sa],
  ['opsFloor', ops],
  ['other (promo+prog+identity+synd+simulcast+stream)', f.otherCost],
];
const pct = parts.map(([name, v]) => [name, v, cost > 0 ? (v / cost) * 100 : 0]);

console.log(JSON.stringify({ diagnostic: f, costPct: pct, sensitivity: {
  case1_opsFloorHalf: case1(),
  case2_fixedMinus25: case2(),
  case3_revPlus50: case3(),
}}, null, 2));
