#!/usr/bin/env node
/**
 * Frozen-turn audit — GM scenario, period-by-period advTurn.
 * Detects calendar advance while commercial shares/revenues stay flat (stale book).
 *
 *   node scripts/diag-sanfrancisco-frozen-turn.mjs
 *   node scripts/diag-sanfrancisco-frozen-turn.mjs --markets=sanfrancisco,losangeles --runs=25 --startYear=2010 --endYear=2022
 *
 * Artifact: tmp/sanfrancisco_frozen_turn_audit.json
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const gmModePath = path.join(root, 'src', 'gmMode.js');
const outJson = path.join(root, 'tmp', 'sanfrancisco_frozen_turn_audit.json');

const DEFAULT_MARKETS = ['sanfrancisco', 'losangeles', 'seattle'];
const ALL_CONTROL_MARKETS = ['losangeles', 'seattle', 'newyork', 'atlanta'];

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function makeLegacySrc(marketId) {
  let legacySrc = readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  }
  legacySrc = legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
  return injectHeadlessMegaFragNewsGuard(legacySrc);
}

function stubEl(id) {
  const el = {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    getAttribute() { return null; },
    setAttribute() {},
  };
  if (id) el.id = id;
  return el;
}

const documentStub = {
  documentElement: { style: {}, dataset: {} },
  body: { innerHTML: '', appendChild() {} },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
  getElementById(id) {
    if (id === 'm-contract' || id === 'wl-toast-stack' || id === 'abtn') return stubEl(id);
    return stubEl();
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener() {},
};

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createHeadlessContext(quiet) {
  const noop = () => {};
  const ctx = vm.createContext({
    console: quiet
      ? { log: noop, warn: noop, error: console.error, table: noop, info: noop }
      : console,
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() { return 0; },
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert: noop,
    fetch: null,
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray?.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = Math.floor(Math.random() * 256);
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return c === 'x' ? r : (r & 0x3) | 0x8;
        });
      },
    },
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
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function parseCsvList(s, fallback) {
  if (!s || !String(s).trim()) return fallback.slice();
  return String(s)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const o = {
    markets: DEFAULT_MARKETS,
    runs: 25,
    startYear: 2010,
    endYear: 2022,
    seed: 20260530,
    includeControls: false,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) o.markets = parseCsvList(a.slice('--markets='.length), DEFAULT_MARKETS);
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice('--runs='.length), 10) || 25);
    else if (a.startsWith('--startYear=')) o.startYear = parseInt(a.slice('--startYear='.length), 10) || 2010;
    else if (a.startsWith('--endYear=')) o.endYear = parseInt(a.slice('--endYear='.length), 10) || 2022;
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice('--seed='.length), 10) || o.seed;
    else if (a === '--all-controls') o.includeControls = true;
  }
  if (o.includeControls) {
    const set = new Set([...o.markets, ...ALL_CONTROL_MARKETS]);
    o.markets = [...set];
  }
  return o;
}

function periodIdx(y, p) {
  return y * 2 + (p === 2 ? 1 : 0);
}

function loadCtxForMarket(marketId, quiet) {
  const ctx = createHeadlessContext(quiet);
  injectMarketEcologyIife(ctx);
  vm.runInContext(makeLegacySrc(marketId), ctx);
  vm.runInContext(readFileSync(gmModePath, 'utf8'), ctx);
  const toastStack = stubEl('wl-toast-stack');
  toastStack.children = [];
  toastStack.removeChild = () => {};
  vm.runInContext(
    `
    showToast = function(){};
    showToastWithSubscribeCta = function(){};
    var _ts = document.getElementById('wl-toast-stack');
    if (_ts && !_ts.children) _ts.children = [];
    if (typeof showSum === 'function') {
      var _showSum = showSum;
      showSum = function(){ try { return _showSum.apply(this, arguments); } catch(e) {} };
    }
    `,
    ctx
  );
  return ctx;
}

function runFrozenTurnAudit(ctx, opts) {
  const { marketId, seed, startYear, endYear } = opts;
  const endIdx = periodIdx(endYear, 2);
  return vm.runInContext(
    `
    (function(){
      var rng = (${mulberry32.toString()})(${seed >>> 0});
      Math.random = function(){ return rng(); };
      ACTIVE_MARKET = ${JSON.stringify(marketId)};
      _selectedMarket = ${JSON.stringify(marketId)};
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(${JSON.stringify(marketId)});
      var startY = ${startYear | 0};
      var endIdx = ${endIdx | 0};
      G = typeof wlGenMarketGmUnderAtCareerTime === 'function'
        ? wlGenMarketGmUnderAtCareerTime(startY, 1)
        : genMarket('gm_under');
      G.marketId = ${JSON.stringify(marketId)};
      G._wlHarnessDeterministic = true;
      G.ps = (G.stations || []).filter(function(s){ return s && s.isPlayer; });
      if (typeof wlGmMode !== 'undefined' && wlGmMode.initGmStateForGame) wlGmMode.initGmStateForGame(G);
      var events = [];
      var streakEvents = [];
      var turns = 0;
      var advTurnErrors = 0;
      var frozenShareTurns = 0;
      var frozenRevTurns = 0;
      var snapStaleTurns = 0;
      var snapMultiLagTurns = 0;
      var nanTurns = 0;
      var maxStreak = 0;
      var streak = 0;
      var lastSig = null;
      while (wlSimCalendarPeriodIndex(G.year, G.period) < endIdx && turns < 400) {
        var beforeY = G.year, beforeP = G.period;
        var advErr = false;
        try { advTurn(); } catch (e) { advErr = true; advTurnErrors++; }
        turns++;
        var afterY = G.year, afterP = G.period;
        var calAdv = afterY > beforeY || (afterY === beforeY && afterP !== beforeP);
        if (!calAdv) {
          events.push({ kind: 'clock_stuck', beforeY: beforeY, beforeP: beforeP, afterY: afterY, afterP: afterP, turn: turns, advErr: advErr });
          break;
        }
        var closedSig = wlBookStaleClosedPeriodSignature(beforeY, beforeP);
        var prev = lastSig;
        lastSig = closedSig;
        if (!prev) continue;
        var cmp = wlBookStaleProbeSharesRevsUnchanged(prev.fp, closedSig.fp);
        var snapY = closedSig.snapYear, snapP = closedSig.snapPeriod;
        var closedIdx = wlSimCalendarPeriodIndex(beforeY, beforeP);
        var snapIdx = snapY != null ? wlSimCalendarPeriodIndex(snapY, snapP) : null;
        var gIdx = wlSimCalendarPeriodIndex(afterY, afterP);
        var snapLag = snapIdx != null ? gIdx - snapIdx : null;
        var snapBehind = snapIdx != null && snapIdx < closedIdx;
        var snapMulti = snapLag != null && snapLag >= 2;
        var shareSigMatch = prev.shareSig && prev.shareSig === closedSig.shareSig;
        var revSigMatch = prev.revN >= 3 && prev.revSum === closedSig.revSum && prev.revSum > 0;
        var shFrozen = cmp.nCompared >= 3 && cmp.sharesUnchanged >= 0.98;
        var revFrozen = cmp.nCompared >= 3 && cmp.revsUnchanged >= 0.98 && prev.revSum > 0 && closedSig.revSum > 0;
        if (shFrozen || shareSigMatch) frozenShareTurns++;
        if (revFrozen || revSigMatch) frozenRevTurns++;
        if (snapBehind) snapStaleTurns++;
        if (snapMulti) snapMultiLagTurns++;
        if (cmp.nanOrUndef > 0) nanTurns++;
        var staleTurn = shFrozen || revFrozen || snapBehind || snapMulti || shareSigMatch || revSigMatch;
        streak = staleTurn ? streak + 1 : 0;
        if (streak > maxStreak) maxStreak = streak;
        if (staleTurn) {
          events.push({
            kind: 'frozen_turn',
            seed: ${seed | 0},
            market: ${JSON.stringify(marketId)},
            turn: turns,
            beforeY: prev.closedYear, beforeP: prev.closedPeriod,
            afterY: afterY, afterP: afterP,
            closedY: beforeY, closedP: beforeP,
            snapY: snapY, snapP: snapP,
            snapLag: snapLag,
            streak: streak,
            shareSigMatch: shareSigMatch,
            revSigMatch: revSigMatch,
            sharesUnchangedPct: cmp.sharesUnchanged,
            revsUnchangedPct: cmp.revsUnchanged,
            shFrozen: shFrozen, revFrozen: revFrozen,
            snapBehind: snapBehind, snapMulti: snapMulti,
            advErr: advErr,
            nanOrUndef: cmp.nanOrUndef,
            topBefore: (prev.fp.stations || []).slice(0, 5),
            topAfter: (closedSig.fp.stations || []).slice(0, 5),
          });
        }
        if (streak >= 3) {
          streakEvents.push({
            kind: 'frozen_streak',
            seed: ${seed | 0},
            market: ${JSON.stringify(marketId)},
            streak: streak,
            closedY: beforeY,
            closedP: beforeP,
            afterY: afterY,
            afterP: afterP,
            turn: turns,
          });
        }
      }
      return {
        marketId: ${JSON.stringify(marketId)},
        seed: ${seed | 0},
        startYear: startY,
        endYear: ${endYear | 0},
        finalYear: G.year,
        finalPeriod: G.period,
        turns: turns,
        advTurnErrors: advTurnErrors,
        frozenShareTurns: frozenShareTurns,
        frozenRevTurns: frozenRevTurns,
        snapStaleTurns: snapStaleTurns,
        snapMultiLagTurns: snapMultiLagTurns,
        nanTurns: nanTurns,
        maxStaleStreak: maxStreak,
        streakEvents: streakEvents,
        events: events,
      };
    })()
    `,
    ctx
  );
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const byMarket = {};
  const allEvents = [];
  let totalFrozenShare = 0;
  let totalFrozenRev = 0;
  let totalRuns = 0;

  for (const marketId of opts.markets) {
    const ctx = loadCtxForMarket(marketId, true);
    byMarket[marketId] = { runs: [] };
    for (let r = 0; r < opts.runs; r++) {
      const seed = (opts.seed + r * 9973 + marketId.length * 131) >>> 0;
      const row = runFrozenTurnAudit(ctx, {
        marketId,
        seed,
        startYear: opts.startYear,
        endYear: opts.endYear,
      });
      byMarket[marketId].runs.push(row);
      totalRuns++;
      totalFrozenShare += row.frozenShareTurns;
      totalFrozenRev += row.frozenRevTurns;
      for (const ev of row.events) {
        if (ev.kind === 'frozen_turn') allEvents.push(ev);
      }
    }
    const mFrozen = byMarket[marketId].runs.reduce((s, x) => s + x.frozenShareTurns, 0);
    const mRev = byMarket[marketId].runs.reduce((s, x) => s + x.frozenRevTurns, 0);
    byMarket[marketId].summary = {
      runs: opts.runs,
      totalFrozenShareTurns: mFrozen,
      totalFrozenRevTurns: mRev,
      runsWithAnyFrozen: byMarket[marketId].runs.filter((x) => x.events.length > 0).length,
    };
  }

  const sf = byMarket.sanfrancisco;
  const sfEvents = allEvents.filter((e) => e.market === 'sanfrancisco');
  const sfStreaks = [];
  for (const m of opts.markets) {
    for (const r of byMarket[m]?.runs || []) {
      for (const se of r.streakEvents || []) {
        if (se.market === 'sanfrancisco') sfStreaks.push(se);
      }
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    options: opts,
    repro: {
      sanFranciscoFrozenTurnsObserved: sfEvents.length > 0,
      sanFranciscoMultiPeriodStreaks: sfStreaks.length,
      sanFranciscoFrozenShareTurns: sf?.summary?.totalFrozenShareTurns ?? 0,
      sanFranciscoFrozenRevTurns: sf?.summary?.totalFrozenRevTurns ?? 0,
      maxStaleStreakByMarket: Object.fromEntries(
        opts.markets.map((m) => [
          m,
          Math.max(0, ...(byMarket[m]?.runs || []).map((r) => r.maxStaleStreak || 0)),
        ])
      ),
      sampleEvents: sfEvents.slice(0, 20),
      sampleStreaks: sfStreaks.slice(0, 10),
      interpretation:
        sfStreaks.length > 0
          ? 'Multi-period identical closed book in SF GM headless — aligns with player frozen-book report (2018–2021).'
          : sfEvents.length > 0
            ? 'Occasional single-period flat book in SF; controls similar — likely not SF-specific engine freeze.'
            : 'No frozen-turn pattern in GM headless sweep for San Francisco 2010–2022; bug may need UI path, save resume, or MP.',
    },
    totals: {
      runs: totalRuns,
      frozenShareTurns: totalFrozenShare,
      frozenRevTurns: totalFrozenRev,
      eventsLogged: allEvents.length,
    },
    byMarket,
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log('Wrote', outJson);
  console.log('SF repro:', report.repro.sanFranciscoFrozenTurnsObserved);
  console.log('SF frozen share turns:', report.repro.sanFranciscoFrozenShareTurns);
  console.log('SF frozen rev turns:', report.repro.sanFranciscoFrozenRevTurns);
  console.log('All markets frozen share turns:', totalFrozenShare);
  if (sfEvents.length) {
    const e0 = sfEvents[0];
    console.log('First SF event:', e0.beforeY, 'P' + e0.beforeP, '→', e0.afterY, 'P' + e0.afterP, 'seed', e0.seed);
  }
}

main();
