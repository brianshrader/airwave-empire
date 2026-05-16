#!/usr/bin/env node
/**
 * Targeted validation: Seattle integration + public-radio (PUBLIC_NEWS / PUBLIC_CLASSICAL / PUBLIC_ECLECTIC) tuning.
 *
 *   node scripts/validate-seattle-and-public.mjs
 *   node scripts/validate-seattle-and-public.mjs --mode=tuned
 *   node scripts/validate-seattle-and-public.mjs --mode=baseline
 *   node scripts/validate-seattle-and-public.mjs --mode=compare
 *
 * Requires: src/legacy.js + src/marketSimHarness.js (no Playwright).
 * Optional JSON: tmp/public_radio_validation.json
 *
 * Tuning modes use `window.__PUBLIC_RADIO_TUNING__` in legacy.js (`baseline` vs full `tuned` behavior).
 *
 * Env: VALIDATION_QUIET=0 — show legacy console.log inside the VM (default: quiet).
 */
/* eslint-disable no-console */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import vm from 'vm';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { ALL_PLAYABLE_MARKET_IDS, DEV_BENCHMARK_MEGA_MARKET_IDS } from './market-ids.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'public_radio_validation.json');

const require = createRequire(import.meta.url);

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function loadLegacySrc() {
  let src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  return injectHeadlessMegaFragNewsGuard(src);
}

function stubEl() {
  return {
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
    closest() {
      return null;
    },
  };
}

const documentStub = {
  body: { innerHTML: '' },
  head: { appendChild() {} },
  createElement() {
    return { href: '', download: '', click() {} };
  },
  getElementById() {
    return stubEl();
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext(quiet) {
  const noop = () => {};
  const ctx = vm.createContext({
    console: quiet
      ? { log: noop, warn: noop, error: console.error, table: noop }
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
    setInterval() {
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class {
      constructor() {}
    },
    FileReader: class {
      readAsText() {}
    },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) {
          typedArray[i] = Math.floor(Math.random() * 256);
        }
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
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

function parseArgs(argv) {
  let mode = 'tuned';
  let runsPerCell = 4;
  let jsonOutPath = outJson;
  for (const a of argv) {
    if (a.startsWith('--mode=')) mode = a.slice('--mode='.length).toLowerCase();
    else if (a.startsWith('--runs=')) runsPerCell = Math.max(1, parseInt(a.slice('--runs='.length), 10) || 4);
    else if (a.startsWith('--json=')) jsonOutPath = a.slice('--json='.length);
  }
  if (!['tuned', 'baseline', 'compare'].includes(mode)) mode = 'tuned';
  return { mode, runsPerCell, jsonOutPath };
}

const PEER_MARKETS = ['chicago', 'atlanta', 'losangeles', 'nashville'];
const PUBLIC_MARKETS = ALL_PLAYABLE_MARKET_IDS;
const ERAS = [1985, 1995, 2005, 2015, 2025];

function installValidationSampler(ctx) {
  const code = `
(function () {
  window.__validationSample = function (marketId, targetYear, seed, tuningMode) {
    window.__PUBLIC_RADIO_TUNING__ = tuningMode === 'baseline' ? 'baseline' : 'tuned';
    var origR = Math.random;
    var s = seed;
    Math.random = function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    try {
      var ui = window._harnessPatchTimersAndUi();
      try {
        ACTIVE_MARKET = marketId;
        syncMarketPopToMarket(marketId);
        G = genMarketMP('1985');
        MP.mode = 'solo';
        MP.isHost = false;
        if (MP.players) MP.players = [];
        var adv = advanceGToYearPeriod(targetYear, 2, 950);
        if (!adv.ok) {
          return {
            ok: false,
            marketId: marketId,
            targetYear: targetYear,
            error: adv.error,
            at: adv.at,
            steps: adv.steps,
          };
        }
        var mh = marketHealthSnapshot(G);
        var snap = snapshotFormatEcologyOnePeriod(G);
        var comm = snap.commercial;
        var spokenSum = 0;
        var topNewsTalk = 0;
        var rockSum = 0;
        var countrySum = 0;
        var viable = 0;
        var chrV = 0;
        var acV = 0;
        var rockV = 0;
        var i;
        for (i = 0; i < comm.length; i++) {
          var c = comm[i];
          var sh = c.share || 0;
          if (c.bucket === 'news_talk') {
            spokenSum += sh;
            if (sh > topNewsTalk) topNewsTalk = sh;
          }
          if (c.bucket === 'rock_alt') rockSum += sh;
          if (c.bucket === 'country') countrySum += sh;
          if (c.health !== 'weak') viable++;
          if (c.bucket === 'top40_pop' && c.health !== 'weak') chrV++;
          if ((c.bucket === 'ac_hits_oldies' || c.bucket === 'beautiful_standards_easy') && c.health !== 'weak') acV++;
          if (c.bucket === 'rock_alt' && c.health !== 'weak') rockV++;
        }
        var pubNews = null;
        var pubClass = null;
        var pubEclectic = null;
        for (i = 0; i < snap.public.length; i++) {
          var p = snap.public[i];
          if (p.format === 'PUBLIC_NEWS') pubNews = p.share;
          if (p.format === 'PUBLIC_CLASSICAL') pubClass = p.share;
          if (p.format === 'PUBLIC_ECLECTIC') pubEclectic = p.share;
        }
        var sy = G.scenario && G.scenario.startYear != null ? G.scenario.startYear : 1985;
        var targetPub = typeof computePublicStationTargetCount === 'function' ? computePublicStationTargetCount(marketId, sy) : null;
        return {
          ok: true,
          marketId: marketId,
          targetYear: targetYear,
          steps: adv.steps,
          commercial: mh.commercial,
          active: mh.active,
          publicStations: mh.public,
          targetPublicCount: targetPub,
          spokenWordLaneShare: spokenSum,
          topCommercialNewsTalkShare: topNewsTalk,
          rockLaneShareSum: rockSum,
          countryLaneShareSum: countrySum,
          viableCommercial: viable,
          viableChr: chrV,
          viableAc: acV,
          viableRock: rockV,
          publicNewsShare: pubNews,
          publicClassicalShare: pubClass,
          publicEclecticShare: pubEclectic,
        };
      } finally {
        ui.restore();
      }
    } finally {
      Math.random = origR;
    }
  };
})();
`;
  vm.runInContext(code, ctx);
}

function loadSim(ctx) {
  injectMarketEcologyIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  installValidationSampler(ctx);
}

function runSample(ctx, marketId, year, seed, tuningMode) {
  return vm.runInContext(`__validationSample(${JSON.stringify(marketId)}, ${year}, ${seed}, ${JSON.stringify(tuningMode)})`, ctx);
}

function statsShares(shares) {
  const xs = shares.filter((x) => x != null && Number.isFinite(x)).map((x) => Number(x));
  const n = xs.length;
  if (!n) return { n: 0, mean: null, median: null, min: null, max: null, lt2: 0, ge2: 0, ge4: 0, ge6: 0 };
  xs.sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
  let lt2 = 0,
    ge2 = 0,
    ge4 = 0,
    ge6 = 0;
  for (const v of xs) {
    const p = v * 100;
    if (p < 2) lt2++;
    if (p >= 2) ge2++;
    if (p >= 4) ge4++;
    if (p >= 6) ge6++;
  }
  return {
    n,
    mean,
    median,
    min: xs[0],
    max: xs[n - 1],
    lt2,
    ge2,
    ge4,
    ge6,
  };
}

function meanArr(nums) {
  const xs = nums.filter((x) => x != null && Number.isFinite(x));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function seattleBrandingCheck() {
  const b = require(path.join(root, 'server', 'rivalStationBranding.js'));
  const re = /^K[A-Z]{2,4}$/;
  const hooksOk = [];
  let bad = 0;
  for (let i = 0; i < 24; i++) {
    const r = b.generateRivalStationBrand({
      marketId: 'seattle',
      format: i % 2 === 0 ? 'rock' : 'news_talk',
      seed: 88000 + i * 131,
      usedPositioningLines: new Set(),
      usedShortBrands: new Set(),
      usedLegalStyles: new Set(),
      usedFmRoundedInMarket: new Set(),
    });
    if (!re.test(String(r.callLetters || '').replace(/-FM$/i, '').split('-')[0] || '')) bad++;
    if (r.localHook) hooksOk.push(r.localHook);
  }
  const marketOk = b.MARKETS && b.MARKETS.seattle && b.MARKETS.seattle.side === 'west';
  return { samples: 24, kCallViolations: bad, marketSideWest: marketOk, hookSample: hooksOk.slice(0, 5) };
}

function printTable(rows, cols) {
  const cw = cols.map((c) => Math.max(c.label.length, ...rows.map((r) => String(r[c.key] ?? '').length)));
  const head = cols.map((c, i) => c.label.padEnd(cw[i])).join('  ');
  console.log(head);
  console.log(cols.map((_, i) => '-'.repeat(cw[i])).join('  '));
  for (const r of rows) {
    console.log(cols.map((c, i) => String(r[c.key] ?? '').padEnd(cw[i])).join('  '));
  }
}

function main() {
  const { mode, runsPerCell, jsonOutPath } = parseArgs(process.argv.slice(2));
  const quietVm = process.env.VALIDATION_QUIET !== '0' && process.env.VALIDATION_QUIET !== 'false';
  const ctx = createVmContext(quietVm);
  loadSim(ctx);

  const hasSeattle = vm.runInContext(`typeof MARKETS !== 'undefined' && MARKETS.seattle && MARKETS.seattle.id==='seattle'`, ctx);
  const phase1 = vm.runInContext(`typeof PHASE1_MARKET_IDS !== 'undefined' && PHASE1_MARKET_IDS.indexOf('seattle') >= 0`, ctx);

  const branding = seattleBrandingCheck();

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    runsPerCell,
    seattle: { marketObject: !!hasSeattle, phase1: !!phase1, branding },
    ecologyPeer: {},
    publicByMarketEra: {},
    compare: null,
    spillover: [],
    warnings: [],
    publicStationScale: null,
  };

  report.publicStationScale = vm.runInContext(
    `(function(){
      function genCount(mid){
        ACTIVE_MARKET = mid;
        syncMarketPopToMarket(mid);
        G = genMarketMP('1985');
        var sy = (G.scenario && G.scenario.startYear != null) ? G.scenario.startYear : 1985;
        var tgt = computePublicStationTargetCount(mid, sy);
        var n = 0, ec = false;
        for (var i = 0; i < G.stations.length; i++) {
          var s = G.stations[i];
          if (!s || s._bpSlotDeferred || !s.isPublic) continue;
          n++;
          if (s.format === 'PUBLIC_ECLECTIC') ec = true;
        }
        return { market: mid, scenarioStart: sy, target: tgt, count: n, eclectic: ec, countMatchesTarget: n === tgt };
      }
      return [genCount('wichita'), genCount('newyork'), genCount('losangeles'), genCount('nashville'), genCount('seattle')];
    })()`,
    ctx
  );

  function runGrid(tuningLabel) {
    const grid = {};
    for (const mkt of PUBLIC_MARKETS) {
      grid[mkt] = {};
      for (const yr of ERAS) {
        const sharesNews = [];
        const sharesClass = [];
        const sharesEclectic = [];
        const spill = [];
        for (let r = 0; r < runsPerCell; r++) {
          const seed = 424200 + PUBLIC_MARKETS.indexOf(mkt) * 997 + ERAS.indexOf(yr) * 13 + r * 7919;
          const o = runSample(ctx, mkt, yr, seed, tuningLabel);
          if (!o.ok) {
            report.warnings.push(`${mkt} ${yr} run${r}: ${o.error}`);
            continue;
          }
          if (o.publicNewsShare != null) sharesNews.push(o.publicNewsShare);
          if (o.publicClassicalShare != null) sharesClass.push(o.publicClassicalShare);
          if (o.publicEclecticShare != null) sharesEclectic.push(o.publicEclecticShare);
          spill.push({
            spokenWordLaneShare: o.spokenWordLaneShare,
            topCommercialNewsTalkShare: o.topCommercialNewsTalkShare,
            viableCommercial: o.viableCommercial,
            viableChr: o.viableChr,
            viableAc: o.viableAc,
            viableRock: o.viableRock,
          });
        }
        grid[mkt][yr] = {
          PUBLIC_NEWS: statsShares(sharesNews),
          PUBLIC_CLASSICAL: statsShares(sharesClass),
          PUBLIC_ECLECTIC: statsShares(sharesEclectic),
          spill: {
            spokenWordLaneShare: meanArr(spill.map((x) => x.spokenWordLaneShare)),
            topCommercialNewsTalkShare: meanArr(spill.map((x) => x.topCommercialNewsTalkShare)),
            viableCommercial: meanArr(spill.map((x) => x.viableCommercial)),
            viableChr: meanArr(spill.map((x) => x.viableChr)),
            viableAc: meanArr(spill.map((x) => x.viableAc)),
            viableRock: meanArr(spill.map((x) => x.viableRock)),
          },
        };
      }
    }
    return grid;
  }

  // ── Seattle vs peers (2005 / 2015 / 2025 fall, tuned mode unless compare) ──
  const ecoMarkets = ['seattle', ...PEER_MARKETS];
  const ecoYears = [2005, 2015, 2025];
  const tuningForEco = mode === 'baseline' ? 'baseline' : 'tuned';
  for (const mkt of ecoMarkets) {
    const byY = {};
    for (const yr of ecoYears) {
      const runs = [];
      for (let r = 0; r < Math.min(3, runsPerCell); r++) {
        const seed = 313370 + ecoMarkets.indexOf(mkt) * 401 + yr + r * 503;
        const o = runSample(ctx, mkt, yr, seed, tuningForEco);
        if (o.ok) runs.push(o);
      }
      byY[yr] = {
        meanCommercial: meanArr(runs.map((x) => x.commercial)),
        meanActive: meanArr(runs.map((x) => x.active)),
        meanSpokenLane: meanArr(runs.map((x) => x.spokenWordLaneShare)),
        meanRockLane: meanArr(runs.map((x) => x.rockLaneShareSum)),
        meanCountryLane: meanArr(runs.map((x) => x.countryLaneShareSum)),
        meanViable: meanArr(runs.map((x) => x.viableCommercial)),
        runs: runs.length,
      };
    }
    report.ecologyPeer[mkt] = byY;
  }

  // Outlier warnings: Seattle vs peer means (2015)
  const s15 = report.ecologyPeer.seattle && report.ecologyPeer.seattle[2015];
  if (s15) {
    const peers = PEER_MARKETS.map((m) => report.ecologyPeer[m] && report.ecologyPeer[m][2015]).filter(Boolean);
    const pm = (k) => meanArr(peers.map((p) => p[k]));
    if (s15.meanViable != null && pm('meanViable') != null && s15.meanViable < pm('meanViable') * 0.55) {
      report.warnings.push('Seattle mean viable commercial count looks very low vs peer large markets (2015 sample).');
    }
    if (s15.meanSpokenLane != null && pm('meanSpokenLane') != null && s15.meanSpokenLane > pm('meanSpokenLane') * 1.55) {
      report.warnings.push('Seattle aggregate news_talk lane share much higher than peers — check ecology mapping.');
    }
  }

  if (mode === 'compare') {
    const tuned = runGrid('tuned');
    const baseline = runGrid('baseline');
    report.publicByMarketEra = { tuned, baseline };
    const deltas = [];
    for (const mkt of PUBLIC_MARKETS) {
      for (const yr of ERAS) {
        for (const fmt of ['PUBLIC_NEWS', 'PUBLIC_CLASSICAL', 'PUBLIC_ECLECTIC']) {
          const a = tuned[mkt][yr][fmt].mean;
          const b = baseline[mkt][yr][fmt].mean;
          if (a != null && b != null) {
            deltas.push({
              market: mkt,
              year: yr,
              format: fmt,
              tunedMeanShare: a,
              baselineMeanShare: b,
              delta: a - b,
            });
          }
        }
      }
    }
    report.compare = deltas;
    // Spillover: tuned vs baseline commercial stress (same seeds implicit in grid construction — approximate by re-run means)
    for (const mkt of PUBLIC_MARKETS) {
      for (const yr of [2005, 2015, 2025]) {
        const t = tuned[mkt][yr].spill;
        const bl = baseline[mkt][yr].spill;
        const dTop = (t.topCommercialNewsTalkShare || 0) - (bl.topCommercialNewsTalkShare || 0);
        const dVia = (t.viableCommercial || 0) - (bl.viableCommercial || 0);
        if (Math.abs(dTop) > 0.025 || Math.abs(dVia) > 2.5) {
          report.spillover.push({
            market: mkt,
            year: yr,
            deltaTopNewsTalkShare: Number(dTop.toFixed(4)),
            deltaViableCommercial: Number(dVia.toFixed(2)),
            note:
              Math.abs(dVia) > 2.5 && (t.viableCommercial || 0) < (bl.viableCommercial || 0) * 0.85
                ? 'possible collateral damage to commercial viability'
                : 'within noise for this sample',
          });
        }
      }
    }
  } else {
    const tun = mode === 'baseline' ? 'baseline' : 'tuned';
    report.publicByMarketEra[tun] = runGrid(tun);
  }

  // Interpretive flags (public)
  const grid = mode === 'compare' ? report.publicByMarketEra.tuned : report.publicByMarketEra[mode === 'baseline' ? 'baseline' : 'tuned'];
  if (grid) {
    for (const mkt of [...DEV_BENCHMARK_MEGA_MARKET_IDS, 'seattle']) {
      for (const yr of [2005, 2015, 2025]) {
        const cell = grid[mkt] && grid[mkt][yr];
        if (!cell) continue;
        const pn = cell.PUBLIC_NEWS;
        if (pn && pn.n >= 3 && yr >= 2000 && mkt !== 'nashville' && pn.mean != null && pn.mean * 100 < 2 && pn.lt2 / pn.n > 0.7) {
          report.warnings.push(`PUBLIC_NEWS mean still <2% in most runs: ${mkt} ${yr} (${(pn.mean * 100).toFixed(2)}% mean)`);
        }
        if (pn && pn.n >= 3 && pn.mean != null && pn.mean * 100 >= 12) {
          report.warnings.push(`PUBLIC_NEWS very high mean share (${(pn.mean * 100).toFixed(1)}%): ${mkt} ${yr} — check for overshoot`);
        }
      }
    }
    for (const mkt of PUBLIC_MARKETS) {
      const c2015 = grid[mkt] && grid[mkt][2015] && grid[mkt][2015].PUBLIC_CLASSICAL;
      if (c2015 && c2015.n >= 3 && c2015.mean != null && c2015.mean * 100 < 0.35 && c2015.max * 100 < 1.5) {
        report.warnings.push(`CLASSICAL still nearly invisible in ${mkt} (2015 sample mean ${(c2015.mean * 100).toFixed(2)}%)`);
      }
    }
  }

  mkdirSync(path.dirname(jsonOutPath), { recursive: true });
  writeFileSync(jsonOutPath, JSON.stringify(report, null, 2), 'utf8');

  // ── Console report ──
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  VALIDATE: Seattle + Public radio (PUBLIC_NEWS / PUBLIC_CLASSICAL / PUBLIC_ECLECTIC)');
  console.log(`  Mode: ${mode}  ·  runs/cell: ${runsPerCell}  ·  JSON: ${jsonOutPath}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  console.log('1) Seattle smoke summary');
  console.log(`   MARKETS.seattle: ${hasSeattle ? 'OK' : 'MISSING'}`);
  console.log(`   PHASE1_MARKET_IDS includes seattle: ${phase1 ? 'OK' : 'MISSING'}`);
  console.log(`   Rival branding: side west=${branding.marketSideWest}  K-call violations=${branding.kCallViolations}/24`);
  console.log(`   Hook samples: ${branding.hookSample.join(' | ')}\n`);

  console.log('1b) Public station count vs target (genMarketMP 1985 / chrwar)');
  console.log(JSON.stringify(report.publicStationScale, null, 2));
  console.log('');
  const ecoRows = [];
  for (const mkt of ecoMarkets) {
    const row = { market: mkt };
    for (const yr of ecoYears) {
      const e = report.ecologyPeer[mkt] && report.ecologyPeer[mkt][yr];
      row[`${yr}_comm`] = e && e.meanCommercial != null ? e.meanCommercial.toFixed(1) : '—';
      row[`${yr}_via`] = e && e.meanViable != null ? e.meanViable.toFixed(1) : '—';
      row[`${yr}_sw`] = e && e.meanSpokenLane != null ? e.meanSpokenLane.toFixed(3) : '—';
    }
    ecoRows.push(row);
  }
  printTable(ecoRows, [
    { key: 'market', label: 'market' },
    { key: '2005_comm', label: '05 comm' },
    { key: '2005_via', label: '05 viable' },
    { key: '2005_sw', label: '05 swLane' },
    { key: '2015_comm', label: '15 comm' },
    { key: '2015_via', label: '15 viable' },
    { key: '2015_sw', label: '15 swLane' },
    { key: '2025_comm', label: '25 comm' },
    { key: '2025_via', label: '25 viable' },
    { key: '2025_sw', label: '25 swLane' },
  ]);
  console.log('');

  console.log('3) Public radio summary (share = decimal ARP; % = ×100)\n');
  const g = grid;
  if (g) {
    for (const fmt of ['PUBLIC_NEWS', 'PUBLIC_CLASSICAL', 'PUBLIC_ECLECTIC']) {
      console.log(`   --- ${fmt} (mean % · median % · n runs) ---`);
      const rows = [];
      for (const mkt of PUBLIC_MARKETS) {
        const r = { market: mkt };
        for (const yr of ERAS) {
          const st = g[mkt] && g[mkt][yr] && g[mkt][yr][fmt];
          if (!st || !st.n) r[`y${yr}`] = '—';
          else
            r[`y${yr}`] =
              `${(st.mean * 100).toFixed(2)} / ${(st.median * 100).toFixed(2)} · n=${st.n} · <2:${st.lt2} ≥2:${st.ge2} ≥4:${st.ge4} ≥6:${st.ge6}`;
        }
        rows.push(r);
      }
      printTable(rows, [
        { key: 'market', label: 'mkt' },
        { key: 'y1985', label: '1985' },
        { key: 'y1995', label: '1995' },
        { key: 'y2005', label: '2005' },
        { key: 'y2015', label: '2015' },
        { key: 'y2025', label: '2025' },
      ]);
      console.log('');
    }
  }

  if (mode === 'compare' && report.compare && report.compare.length) {
    console.log('4) Baseline vs tuned — mean share delta (tuned − baseline)\n');
    for (const fmt of ['PUBLIC_NEWS', 'PUBLIC_CLASSICAL', 'PUBLIC_ECLECTIC']) {
      console.log(`   ${fmt} (Δ mean share decimal)`);
      const rows = [];
      for (const mkt of PUBLIC_MARKETS) {
        const row = { mkt };
        for (const yr of ERAS) {
          const d = report.compare.find((x) => x.market === mkt && x.year === yr && x.format === fmt);
          row[`y${yr}`] = d ? (d.delta >= 0 ? '+' : '') + d.delta.toFixed(4) : '—';
        }
        rows.push(row);
      }
      printTable(rows, [
        { key: 'mkt', label: 'mkt' },
        { key: 'y1985', label: '1985' },
        { key: 'y1995', label: '1995' },
        { key: 'y2005', label: '2005' },
        { key: 'y2015', label: '2015' },
        { key: 'y2025', label: '2025' },
      ]);
      console.log('');
    }
    if (report.spillover.length) {
      console.log('   Spillover watch (tuned − baseline, 2005–2025):');
      for (const s of report.spillover.slice(0, 20)) {
        console.log(
          `   ${s.market} ${s.year}: ΔtopNewsTalk=${s.deltaTopNewsTalkShare} ΔviableComm=${s.deltaViableCommercial} (${s.note})`
        );
      }
    } else console.log('   No large spillover flags in this sample (threshold: |ΔtopNewsTalk|>0.025 or |Δviable|>2.5).\n');
  } else {
    console.log('4) Before/after deltas: use --mode=compare\n');
  }

  console.log('5) Warnings / verdict');
  if (report.warnings.length) {
    for (const w of report.warnings) console.log(`   ⚠ ${w}`);
  } else console.log('   No automated warning flags.');
  console.log(
    `\n   Verdict: Seattle data ${hasSeattle && phase1 ? 'present in engine' : 'INCOMPLETE'}; branding K-prefix ${branding.kCallViolations === 0 ? 'clean' : 'CHECK FAILURES'}.`
  );
  console.log(`   Full JSON: ${jsonOutPath}\n`);

  if (!hasSeattle || !phase1 || branding.kCallViolations > 0) process.exitCode = 1;
}

main();
