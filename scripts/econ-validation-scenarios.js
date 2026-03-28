#!/usr/bin/env node
/**
 * VM-loads src/legacy.js, runs genMarket + seedRev per scenario, prints JSON rows.
 * Usage: node scripts/econ-validation-scenarios.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCENARIOS = [
  { market: 'losangeles', scen: 'under', label: 'LA — Underdog' },
  { market: 'chicago', scen: 'under', label: 'Chicago — Underdog' },
  { market: 'atlanta', scen: 'under', label: 'Atlanta — Underdog' },
  { market: 'losangeles', scen: 'stack', label: 'LA — Stack' },
];

function makeLegacySrc(marketId) {
  const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
  let legacySrc = fs.readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error("Expected ACTIVE_MARKET line not found");
  }
  const mid = marketId === 'atlanta' ? 'atlanta' : marketId;
  return legacySrc.replace(
    /let ACTIVE_MARKET='atlanta'/,
    `let ACTIVE_MARKET='${mid}'`
  );
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

function runOne(marketId, scenId, seed, label) {
  const legacySrc = makeLegacySrc(marketId);
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
    __LABEL = ${JSON.stringify(label)};
    (function(){
      var s = ${seed};
      Math.random = function(){
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    })();
    G = genMarket(${JSON.stringify(scenId)});
    seedRev(G.stations, G);
    `,
    ctx
  );

  const rows = vm.runInContext(
    `
    (function(){
      var mkt = G.marketId || ACTIVE_MARKET;
      var mktFixMult = marketFixedCostScaleMultiplier(mkt);
      var comm = G.stations.filter(function(s){ return s && !s._bpSlotDeferred && !s.isPublic; });
      var sorted = comm.slice().sort(function(a,b){ return (b.rat && b.rat.share || 0) - (a.rat && a.rat.share || 0); });
      var n = sorted.length;
      var players = G.stations.filter(function(s){ return s && s.isPlayer; });
      return players.map(function(p){
        var rankIdx = -1;
        for (var i = 0; i < sorted.length; i++) {
          if (sorted[i].id === p.id) { rankIdx = i; break; }
        }
        var eff = stationRevenueMonetizationEfficiency(rankIdx, n, mkt);
        var mt = p.prog && p.prog.morningDrive && p.prog.morningDrive.talent;
        var rev = p.fin && p.fin.rev || 0;
        var ebitda = p.fin && p.fin.ebitda;
        return {
          scenarioLabel: __LABEL,
          market: mkt,
          scenarioId: G.sc && G.sc.id,
          callLetters: p.callLetters,
          format: p.format,
          share: p.rat && p.rat.share,
          revenue: rev,
          totalCost: p.fin && p.fin.cost,
          ebitda: ebitda,
          ebitdaMarginPct: rev > 0 ? (ebitda / rev) * 100 : null,
          mktFixMult: mktFixMult,
          monetizationEff: eff,
          morningTalentQuality: mt ? mt.quality : null,
          morningSalaryAnnual: mt ? mt.salary : null,
          fixedSubtotalScaled: p.fin && p.fin.fix,
          opsFloorScaled: p.fin && p.fin.opsFloor,
        };
      });
    })()
    `,
    ctx
  );
  return rows;
}

const SEED = 424242;
const all = [];
for (const { market, scen, label } of SCENARIOS) {
  const rows = runOne(market, scen, SEED, label);
  all.push(...rows);
}
console.log(JSON.stringify(all, null, 2));
