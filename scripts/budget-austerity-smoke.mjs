#!/usr/bin/env node
/**
 * Smoke test: Chicago + Underdog AM Top 40 — budget stress / austerity trajectory over early periods.
 * Run: node scripts/budget-austerity-smoke.mjs
 */
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

function makeLegacySrc(marketId) {
  let legacySrc = fs.readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('Expected ACTIVE_MARKET anchor not found');
  }
  return legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
}

const noop = () => {};
const documentStub = {
  getElementById(id) {
    if (id === 'abtn')
      return {
        disabled: false,
        textContent: '',
        style: {},
        addEventListener: noop,
      };
    return null;
  },
  querySelectorAll: () => [],
  body: {},
};

function createCtx() {
  const ctx = vm.createContext({
    console,
    __WL_HEADLESS__: true,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    Symbol,
    Proxy,
    Reflect,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Int8Array,
    Uint8Array,
    Buffer,
    Promise,
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval: () => 0,
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.document = documentStub;
  ctx.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  ctx.sessionStorage = { getItem() {}, setItem() {} };
  ctx.location = { reload: noop };
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus: noop };
  ctx.alert = noop;
  ctx.fetch = null;
  ctx.btoa = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  ctx.atob = (s) => Buffer.from(String(s), 'base64').toString('utf8');
  return ctx;
}

function loadLegacy(ctx, src) {
  vm.runInContext(src, ctx);
}

function runChicagoUnderdog(ctx, periods) {
  return vm.runInContext(
    `
    (function(){
      var seed = 90210;
      Math.random = function(){
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      G = genMarket('under');
      G.marketId = 'chicago';
      G.ps = G.stations.filter(function(s){ return s && s.isPlayer; });
      if (G.ps.length !== 1) throw new Error('expected 1 player station');
      var rows = [];
      for (var i = 0; i < ${periods}; i++) {
        advTurn();
        var s = G.ps[0];
        rows.push({
          i: i + 1,
          year: G.year,
          period: G.period,
          sharePct: Math.round((s.rat && s.rat.share || 0) * 1000) / 10,
          rev: s.fin && s.fin.rev,
          cost: s.fin && s.fin.cost,
          ebitda: s.fin && s.fin.ebitda,
          budgetStress: s.budgetStress,
          austerityFin: s.fin && s.fin.austerityStress,
          fix: s.fin && s.fin.fix,
          opsFloor: s.fin && s.fin.opsFloor,
          tal: s.fin && s.fin.tal,
          salesAdmin: s.fin && s.fin.salesAdmin,
          effProg: s.fin && s.fin.effProg,
          cash: G.cash
        });
      }
      return rows;
    })()
    `,
    ctx
  );
}

const src = makeLegacySrc('chicago');
const ctx = createCtx();
loadLegacy(ctx, src);
const rows = runChicagoUnderdog(ctx, 14);
console.log('Chicago Underdog AM Top 40 — first 14 periods (deterministic PRNG seed 90210)');
console.table(rows);
const last = rows[rows.length - 1];
console.log('\nSummary last period:', {
  sharePct: last.sharePct,
  ebitda: last.ebitda,
  budgetStress: last.budgetStress,
  cash: last.cash,
});
