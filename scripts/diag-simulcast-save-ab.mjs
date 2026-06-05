#!/usr/bin/env node
/**
 * Simulcast cluster allocation — save-specific before/after (production vs baseline).
 *
 *   npm run diag:simulcast-save-ab -- --file=/path/to/save.json
 *   npm run diag:simulcast-save-ab -- --station=WVDQ
 *
 * If no save is available, runs synthetic Chicago 1971 WVDQ/WEVX proxy (pinned shares).
 *
 * Output: tmp/simulcast_save_ab.json, tmp/simulcast_save_ab.md
 */
/* eslint-disable no-console */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const outJson = path.join(root, 'tmp', 'simulcast_save_ab.json');
const outMd = path.join(root, 'tmp', 'simulcast_save_ab.md');

function parseArgs() {
  const args = process.argv.slice(2);
  let file = null;
  let station = null;
  for (const a of args) {
    if (a.startsWith('--file=')) file = a.slice(7);
    if (a.startsWith('--station=')) station = a.slice(10).toUpperCase();
  }
  return { file, station };
}

function stubEl() {
  return {
    disabled: false, textContent: '', innerHTML: '', value: '', style: {}, dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {}, querySelector() { return null; }, focus() {}, click() {},
    addEventListener() {}, removeEventListener() {},
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, dataset: {} },
  head: { appendChild() {} },
  documentElement: { dataset: {} },
  createElement() { return stubEl(); },
  getElementById: () => stubEl(),
  querySelectorAll: () => [],
  querySelector: () => null,
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext() {
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: console.error },
    __WL_HEADLESS__: true,
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
    parseInt, parseFloat, Infinity, NaN, undefined, Int8Array, Uint8Array, Buffer, Promise,
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval: () => 0, clearTimeout: () => {}, clearInterval: () => {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.document = documentStub;
  ctx.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  ctx.location = { reload: () => {}, search: '', href: 'http://127.0.0.1/' };
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus: () => {}, action: () => {}, emit: () => {} };
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.btoa = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  ctx.atob = (s) => Buffer.from(String(s), 'base64').toString('utf8');
  return ctx;
}

function loadSaveGame(filePath) {
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  return raw.G || raw;
}

function finRow(am, fm) {
  const amRev = am.fin?.rev || 0;
  const fmRev = fm.fin?.rev || 0;
  return {
    amCall: am.callLetters,
    fmCall: fm.callLetters,
    amSharePct: Math.round((am.rat?.share || 0) * 1000) / 10,
    fmSharePct: Math.round((fm.rat?.share || 0) * 1000) / 10,
    amRev,
    fmRev,
    amCost: am.fin?.cost || 0,
    fmCost: fm.fin?.cost || 0,
    amEbitda: am.fin?.ebitda || 0,
    fmEbitda: fm.fin?.ebitda || 0,
    combinedEbitda: (am.fin?.ebitda || 0) + (fm.fin?.ebitda || 0),
    fmRevPctOfAm: amRev > 0 ? Math.round((fmRev / amRev) * 1000) / 10 : null,
    fmCostPctOfAm: am.fin?.cost > 0 ? Math.round(((fm.fin?.cost || 0) / am.fin.cost) * 1000) / 10 : null,
    simulcastAllocatedRev: fm.fin?.simulcastAllocatedRev || 0,
  };
}

const harnessJs = `
(function () {
  function finRow(am, fm) {
    var amRev = am.fin && am.fin.rev || 0;
    var fmRev = fm.fin && fm.fin.rev || 0;
    return {
      amCall: am.callLetters, fmCall: fm.callLetters,
      amSharePct: Math.round((am.rat && am.rat.share || 0) * 1000) / 10,
      fmSharePct: Math.round((fm.rat && fm.rat.share || 0) * 1000) / 10,
      amRev: amRev, fmRev: fmRev,
      amCost: am.fin && am.fin.cost || 0, fmCost: fm.fin && fm.fin.cost || 0,
      amEbitda: am.fin && am.fin.ebitda || 0, fmEbitda: fm.fin && fm.fin.ebitda || 0,
      combinedEbitda: (am.fin && am.fin.ebitda || 0) + (fm.fin && fm.fin.ebitda || 0),
      fmRevPctOfAm: amRev > 0 ? Math.round(fmRev / amRev * 1000) / 10 : null,
      fmCostPctOfAm: am.fin && am.fin.cost > 0 ? Math.round((fm.fin && fm.fin.cost || 0) / am.fin.cost * 1000) / 10 : null,
      simulcastAllocatedRev: fm.fin && fm.fin.simulcastAllocatedRev || 0,
    };
  }

  function findPlayerSimulcastPair(G, stationHint) {
    var comm = (G.stations || []).filter(function (s) {
      return s && !s._bpSlotDeferred && typeof stationIsNoncommercialInstitutional === 'function'
        && !stationIsNoncommercialInstitutional(s);
    });
    var hint = stationHint ? String(stationHint).toUpperCase() : '';
    for (var i = 0; i < comm.length; i++) {
      var s = comm[i];
      if (!s.isPlayer) continue;
      if (hint && s.callLetters !== hint && s.callLetters !== hint.replace('-FM', '').replace('-AM', '')) {
        var partner = typeof simulcastPartnerStation === 'function' ? simulcastPartnerStation(s) : null;
        if (!partner || (partner.callLetters !== hint && s.callLetters !== hint)) continue;
      }
      var am = null, fm = null;
      if (s._simulcastSource === true) {
        am = s;
        fm = (typeof simulcastGroupReceivers === 'function' ? simulcastGroupReceivers(s.id, G) : [])[0] || null;
      } else if (s.simulcastSourceStationId) {
        fm = s;
        am = G.stations.find(function (st) { return st && st.id === s.simulcastSourceStationId; }) || null;
      } else {
        var p = typeof simulcastPartnerStation === 'function' ? simulcastPartnerStation(s) : null;
        if (!p) continue;
        if (s.sig && s.sig.type === 'AM' && !s.fmBooster) { am = s; fm = p; }
        else if (p.sig && p.sig.type === 'AM' && !p.fmBooster) { am = p; fm = s; }
      }
      if (am && fm && isSimulcastProgrammingReceiver(fm, G)) return { am: am, fm: fm };
    }
    return null;
  }

  function runPipeline(G, disableCluster) {
    if (disableCluster) G._wlDisableSimulcastClusterAlloc = true;
    else delete G._wlDisableSimulcastClusterAlloc;
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
  }

  function runSyntheticWvdqProxy() {
    ACTIVE_MARKET = 'chicago';
    if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket('chicago');
    G = genMarketMP('1970');
    G.marketId = 'chicago';
    G.year = 1971;
    G.period = 2;
    G.turn = 3;
    var comm = (G.stations || []).filter(function (s) {
      return s && !s._bpSlotDeferred && !stationIsNoncommercialInstitutional(s);
    });
    var am = comm.find(function (s) { return s.sig && s.sig.type === 'AM' && !s.fmBooster; });
    var fm = comm.find(function (s) { return s.sig && s.sig.type === 'FM' && !s.fmBooster && am && s.id !== am.id; });
    comm.forEach(function (s) { if (s) s.isPlayer = false; });
    am.isPlayer = true; fm.isPlayer = true; G.ps = [am, fm];
    am.callLetters = 'WVDQ'; fm.callLetters = 'WEVX';
    breakSimulcast(G, am.id); breakSimulcast(G, fm.id);
    function pinShare(st, sh) {
      st.rat = st.rat || {}; st.rat.share = sh;
      var cur = {}; (COH || []).forEach(function (c) { cur[c] = { aqh: Math.round(sh * 50000), share: sh }; });
      st.rat.cur = cur;
      st.rat.aqh = (COH || []).reduce(function (sum, c) { return sum + (cur[c] ? cur[c].aqh : 0); }, 0);
    }
    pinShare(am, 0.039); pinShare(fm, 0.012);
    if (!am.ops) am.ops = { spots: 14, sell: 0.62, promo: 12000, progBudget: 8000 };
    if (!fm.ops) fm.ops = { spots: 14, sell: 0.45, promo: 8000, progBudget: 5000 };
    applySimulcastPair(am.id, fm.id, { suppressNews: true });
    (G.stations || []).forEach(function (s) { if (s) calcRev(s, G); });
    return { am: am, fm: fm, synthetic: true, label: 'Chicago 1971 Fall proxy (AM 3.9% / FM 1.2%)' };
  }

  globalThis.__wlRunSimulcastSaveAb = function (opts) {
    opts = opts || {};
    var meta = { source: 'save', saveLabel: null, marketId: null, year: null, period: null };
    var initFn = null;

    if (opts.game) {
      initFn = function () {
        G = JSON.parse(JSON.stringify(opts.game));
        wlBindGameState(G);
        ACTIVE_MARKET = G.marketId || 'atlanta';
        meta.marketId = G.marketId;
        meta.year = G.year;
        meta.period = G.period;
        meta.saveLabel = opts.saveLabel || null;
        return findPlayerSimulcastPair(G, opts.stationHint);
      };
    } else {
      initFn = function () {
        var p = runSyntheticWvdqProxy();
        meta.source = 'synthetic_proxy';
        meta.label = p.label;
        meta.marketId = 'chicago';
        meta.year = 1971;
        meta.period = 2;
        return { am: p.am, fm: p.fm };
      };
    }

    var pair0 = initFn();
    if (!pair0) return { error: 'no_simulcast_pair', meta: meta };

    runPipeline(G, true);
    var baseline = finRow(pair0.am, pair0.fm);
    var amOnlyEbitda = pair0.am.fin.ebitda;

    pair0 = initFn();
    runPipeline(G, false);
    var production = finRow(pair0.am, pair0.fm);

    return {
      meta: meta,
      baseline: baseline,
      production: production,
      amOnlyEbitda: amOnlyEbitda,
      delta: {
        fmRevPctOfAm: (production.fmRevPctOfAm || 0) - (baseline.fmRevPctOfAm || 0),
        fmEbitda: production.fmEbitda - baseline.fmEbitda,
        combinedEbitda: production.combinedEbitda - baseline.combinedEbitda,
        vsAmOnly: production.combinedEbitda - amOnlyEbitda,
      },
    };
  };
})();
`;

function fmtK(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.round(Math.abs(n) / 1000) + 'K';
}

function main() {
  const { file, station } = parseArgs();
  let game = null;
  let saveLabel = null;
  if (file && existsSync(file)) {
    game = loadSaveGame(file);
    saveLabel = JSON.parse(readFileSync(file, 'utf8')).label || file;
  }

  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(readFileSync(legacyPath, 'utf8'), ctx);
  vm.runInContext(harnessJs, ctx);

  const out = vm.runInContext(`__wlRunSimulcastSaveAb(${JSON.stringify({
    game,
    saveLabel,
    stationHint: station || 'WVDQ',
  })})`, ctx);

  const md = [];
  md.push('# Simulcast cluster allocation — save A/B');
  md.push('');
  if (out.meta.source === 'synthetic_proxy') {
    md.push('**No WVDQ/WEVX save found** — using synthetic Chicago 1971 proxy (AM 3.9% / FM 1.2%).');
  } else {
    md.push(`Save: **${out.meta.saveLabel || file}** · ${out.meta.marketId} ${out.meta.year} period ${out.meta.period}`);
  }
  md.push('');
  md.push(`Pair: **${out.production.amCall}** (AM) / **${out.production.fmCall}** (FM)`);
  md.push('');
  md.push('| | Baseline (no alloc) | Production (Variant A) |');
  md.push('|--|---------------------|-------------------------|');
  md.push(`| FM rev % of AM | ${out.baseline.fmRevPctOfAm}% | **${out.production.fmRevPctOfAm}%** |`);
  md.push(`| FM cost % of AM | ${out.baseline.fmCostPctOfAm}% | ${out.production.fmCostPctOfAm}% |`);
  md.push(`| FM EBITDA | ${fmtK(out.baseline.fmEbitda)} | **${fmtK(out.production.fmEbitda)}** |`);
  md.push(`| Combined EBITDA | ${fmtK(out.baseline.combinedEbitda)} | **${fmtK(out.production.combinedEbitda)}** |`);
  md.push(`| FM allocated rev | — | ${fmtK(out.production.simulcastAllocatedRev)} |`);
  md.push('');
  md.push(`Combined vs AM-only: baseline ${fmtK(out.baseline.combinedEbitda - out.amOnlyEbitda)}, production ${fmtK(out.delta.vsAmOnly)}`);
  md.push('');

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(out, null, 2));
  writeFileSync(outMd, md.join('\n'));

  console.log(JSON.stringify({
    source: out.meta.source,
    pair: `${out.production.amCall}/${out.production.fmCall}`,
    baselineFmRevPct: out.baseline.fmRevPctOfAm,
    productionFmRevPct: out.production.fmRevPctOfAm,
    productionFmEbitda: out.production.fmEbitda,
    productionCombinedEbitda: out.production.combinedEbitda,
  }, null, 2));
  console.error('Wrote', outMd);
}

main();
