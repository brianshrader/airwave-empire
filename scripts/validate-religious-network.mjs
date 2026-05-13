#!/usr/bin/env node
/**
 * Phase 2 — RELIGIOUS_NETWORK validation (ratings / spawn / regional affinity only).
 *
 * For each market + seed: genMarketMP('1970'), advance to fall of checkpoint years,
 * recalc, snapshot RELIGIOUS_NETWORK (spawned?, rank, share) and commercial GOSPEL viability (max Gospel share).
 *
 * Checkpoints: 1975, 1980, 1990, 2000, 2010, 2020, 2026
 *
 * Usage:
 *   node scripts/validate-religious-network.mjs
 *   node scripts/validate-religious-network.mjs --runs=12
 *
 * Env:
 *   RELIGIOUS_NETWORK_HARNESS_MARKETS=atlanta,seattle,...
 *   VALIDATION_QUIET=1
 *
 * Output: tmp/religious_network_validation.csv + console summary / Q&A
 *
 * Requires: src/legacy.js + src/marketSimHarness.js (advanceGToYearPeriod, _harnessPatchTimersAndUi)
 */
/* eslint-disable no-console */

import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outCsv = path.join(root, 'tmp', 'religious_network_validation.csv');

const CHECKPOINTS = [1975, 1980, 1990, 2000, 2010, 2020, 2026];
const DEFAULT_MARKETS = ['sanfrancisco', 'seattle', 'atlanta', 'nashville', 'wichita', 'newyork', 'chicago', 'losangeles'];
const CAREER_MAX_STEPS = 28000;

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
    querySelector() {
      return null;
    },
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

function installReligiousHarness(ctx) {
  const checkpointsJson = JSON.stringify(CHECKPOINTS);
  const maxS = CAREER_MAX_STEPS;
  const code = `
(function () {
  var CHECKPOINTS = ${checkpointsJson};
  var CAREER_MAX_STEPS = ${maxS};

  window.__religiousNetworkHarnessRun = function (marketId, seed) {
    var origR = Math.random;
    var s = seed >>> 0;
    Math.random = function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    try {
      var ui = window._harnessPatchTimersAndUi ? window._harnessPatchTimersAndUi() : { restore: function () {} };
      try {
        ACTIVE_MARKET = marketId;
        syncMarketPopToMarket(marketId);
        G = genMarketMP('1970');
        G.marketId = marketId;
        MP.mode = 'solo';
        MP.isHost = false;
        if (MP.players) MP.players = [];
        migrateSave(G);
        var aff0 = religiousNetworkMarketAffinity01(marketId);
        var rows = [];
        var ci;
        for (ci = 0; ci < CHECKPOINTS.length; ci++) {
          var ty = CHECKPOINTS[ci];
          var adv = advanceGToYearPeriod(ty, 2, CAREER_MAX_STEPS);
          if (!adv.ok) {
            return {
              ok: false,
              marketId: marketId,
              seed: seed,
              affinity: aff0,
              error: 'advance_' + ty,
              at: adv.at,
              steps: adv.steps,
              partialRows: rows,
            };
          }
          migrateSave(G);
          recalc(G.stations, G);
          var rels = [];
          var gi;
          for (gi = 0; gi < G.stations.length; gi++) {
            var st = G.stations[gi];
            if (!st || st._bpSlotDeferred) continue;
            if (st.format === 'RELIGIOUS_NETWORK' || st.isReligiousNetwork) rels.push(st);
          }
          var rk = rankStationsByShareCompetition(G.stations);
          var nTot = rk.n || 0;
          var gMax = 0;
          var gCalls = '';
          for (gi = 0; gi < G.stations.length; gi++) {
            var gst = G.stations[gi];
            if (!gst || gst._bpSlotDeferred || gst.format !== 'GOSPEL') continue;
            var shg = gst.rat && typeof gst.rat.share === 'number' ? gst.rat.share : 0;
            if (shg > gMax) {
              gMax = shg;
              gCalls = gst.callLetters || '';
            }
          }
          var relCount = rels.length;
          var tierParts = [];
          var ti;
          for (ti = 0; ti < rels.length; ti++) {
            var tr = rels[ti]._religiousNetworkTier || 'typical';
            tierParts.push(tr);
          }
          tierParts.sort();
          var tierMix = tierParts.join('+');
          var combShare = 0;
          var bestRank = null;
          var bestShare = null;
          for (ti = 0; ti < rels.length; ti++) {
            var rs = rels[ti].rat && typeof rels[ti].rat.share === 'number' ? rels[ti].rat.share : 0;
            combShare += rs;
            if (bestShare == null || rs > bestShare) bestShare = rs;
            var rk1 = rk.rankById ? rk.rankById[rels[ti].id] : null;
            if (rk1 != null && (bestRank == null || rk1 < bestRank)) bestRank = rk1;
          }
          if (rels.length === 0) {
            combShare = null;
            bestShare = null;
            bestRank = null;
            tierMix = '';
          }
          rows.push({
            checkpointYear: ty,
            simYear: G.year,
            simPeriod: G.period,
            advanceStepsThisLeg: adv.steps,
            spawned: relCount > 0,
            relNetCount: relCount,
            relNetTierMix: tierMix,
            relNetCombinedShare: combShare,
            affinity: aff0,
            share: bestShare,
            rank: bestRank,
            nStations: nTot,
            top15: bestRank != null && bestRank <= 15,
            top10: bestRank != null && bestRank <= 10,
            top5: bestRank != null && bestRank <= 5,
            top3: bestRank != null && bestRank <= 3,
            rank1: bestRank === 1,
            gospelMaxShare: gMax,
            gospelLeadCall: gCalls,
          });
        }
        return { ok: true, marketId: marketId, seed: seed, affinity: aff0, rows: rows };
      } catch (e) {
        return { ok: false, marketId: marketId, seed: seed, error: String(e && e.message ? e.message : e) };
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
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  installReligiousHarness(ctx);
}

function parseArgs(argv) {
  let runs = 8;
  for (const a of argv) {
    if (a.startsWith('--runs=')) runs = Math.max(1, parseInt(a.slice('--runs='.length), 10) || 8);
  }
  return { runs };
}

function parseMarketsFromEnv() {
  const raw = process.env.RELIGIOUS_NETWORK_HARNESS_MARKETS;
  if (!raw || !String(raw).trim()) return DEFAULT_MARKETS.slice();
  return String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function seedFor(markets, mkt, r) {
  return (810000 + markets.indexOf(mkt) * 104729 + r * 7919) >>> 0;
}

function csvEscape(s) {
  const t = String(s ?? '');
  if (/[",\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = xs[i] - mx;
    const vy = ys[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;
}

function main() {
  const quiet = process.env.VALIDATION_QUIET === '1';
  const { runs } = parseArgs(process.argv.slice(2));
  const markets = parseMarketsFromEnv();
  const ctx = createVmContext(quiet);
  loadSim(ctx);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const csvRows = [];
  const snap2026 = [];

  csvRows.push(
    [
      'marketId',
      'run',
      'seed',
      'checkpointYear',
      'spawned',
      'relNetCount',
      'relNetTierMix',
      'relNetCombinedShare',
      'affinity',
      'shareBestInstitutional',
      'rankBestInstitutional',
      'nStations',
      'top15',
      'top10',
      'top5',
      'top3',
      'rank1',
      'gospelMaxShare',
      'gospelLeadCall',
      'advanceSteps',
    ].join(',')
  );

  const byCp = new Map();
  for (const y of CHECKPOINTS) {
    byCp.set(y, {
      n: 0,
      spawned: 0,
      sumRelCount: 0,
      top15: 0,
      top10: 0,
      top5: 0,
      top3: 0,
      rk1: 0,
      sumShare: 0,
      shareN: 0,
      gMax: [],
    });
  }

  for (const mkt of markets) {
    for (let r = 0; r < runs; r++) {
      const seed = seedFor(markets, mkt, r);
      const res = vm.runInContext(`__religiousNetworkHarnessRun(${JSON.stringify(mkt)}, ${seed})`, ctx);
      if (!res || !res.ok) {
        console.error('Harness failed', mkt, seed, res && res.error, res && res.at);
        continue;
      }
      for (const row of res.rows || []) {
        const ck = row.checkpointYear;
        const agg = byCp.get(ck);
        if (agg) {
          agg.n++;
          if (row.spawned) agg.spawned++;
          agg.sumRelCount += row.relNetCount != null ? row.relNetCount : 0;
          if (row.top15) agg.top15++;
          if (row.top10) agg.top10++;
          if (row.top5) agg.top5++;
          if (row.top3) agg.top3++;
          if (row.rank1) agg.rk1++;
          if (row.share != null) {
            agg.sumShare += row.share;
            agg.shareN++;
          }
          agg.gMax.push(row.gospelMaxShare || 0);
        }
        if (ck === 2026 && row.affinity != null) {
          snap2026.push({
            aff: row.affinity,
            cnt: row.relNetCount || 0,
            bestSh: row.share != null ? row.share : 0,
          });
        }
        csvRows.push(
          [
            csvEscape(mkt),
            r,
            seed,
            ck,
            row.spawned ? 1 : 0,
            row.relNetCount != null ? row.relNetCount : '',
            csvEscape(row.relNetTierMix || ''),
            row.relNetCombinedShare != null ? Number(row.relNetCombinedShare).toFixed(6) : '',
            row.affinity != null ? row.affinity.toFixed(4) : '',
            row.share != null ? row.share.toFixed(6) : '',
            row.rank != null ? row.rank : '',
            row.nStations != null ? row.nStations : '',
            row.top15 ? 1 : 0,
            row.top10 ? 1 : 0,
            row.top5 ? 1 : 0,
            row.top3 ? 1 : 0,
            row.rank1 ? 1 : 0,
            row.gospelMaxShare != null ? row.gospelMaxShare.toFixed(6) : '',
            csvEscape(row.gospelLeadCall || ''),
            row.advanceStepsThisLeg != null ? row.advanceStepsThisLeg : '',
          ].join(',')
        );
      }
    }
  }

  writeFileSync(outCsv, csvRows.join('\n'), 'utf8');
  console.log('Wrote', outCsv);

  console.log('\n--- By checkpoint (aggregated over markets × runs) ---');
  for (const y of CHECKPOINTS) {
    const a = byCp.get(y);
    if (!a || !a.n) continue;
    const pct = (x) => ((100 * x) / a.n).toFixed(1) + '%';
    const meanSh = a.shareN ? (a.sumShare / a.shareN).toFixed(4) : '—';
    const gSorted = a.gMax.slice().sort((p, q) => p - q);
    const gMed = gSorted.length ? gSorted[Math.floor(gSorted.length / 2)] : 0;
    const meanCnt = a.n ? (a.sumRelCount / a.n).toFixed(2) : '—';
    console.log(
      `${y}: samples=${a.n} cells_with_any_institutional=${pct(a.spawned)} mean_institutional_stations=${meanCnt} top15(best)=${pct(
        a.top15
      )} top10=${pct(a.top10)} top5=${pct(a.top5)} top3=${pct(a.top3)} #1=${pct(a.rk1)} mean_best_inst_share(when any)=${meanSh} gospelShare_median=${gMed.toFixed(4)}`
    );
  }

  if (snap2026.length >= 2) {
    const affs = snap2026.map((s) => s.aff);
    const cnts = snap2026.map((s) => s.cnt);
    const rAffCnt = pearson(affs, cnts);
    const withInst = snap2026.filter((s) => s.cnt > 0);
    let rAffBest = null;
    if (withInst.length >= 2) {
      rAffBest = pearson(
        withInst.map((s) => s.aff),
        withInst.map((s) => s.bestSh)
      );
    }
    console.log('\n--- 2026 correlation (market×run cells) ---');
    console.log('Pearson(affinity, relNetCount):', rAffCnt != null ? rAffCnt.toFixed(4) : 'n/a', `n=${snap2026.length}`);
    console.log(
      'Pearson(affinity, best institutional share) spawned cells only:',
      rAffBest != null ? rAffBest.toFixed(4) : 'n/a',
      `n=${withInst.length}`
    );
  }

  const y2026 = byCp.get(2026);

  console.log('\n--- Validation questions (read aggregated rows + spot-check CSV) ---');
  console.log(
    '1) Too early? Expect essentially no spawn / negligible rank before ~1995–2000; check 1975/1980/1990 spawned% in CSV.'
  );
  console.log(
    `2) Too weak? At 2026 spawned=${y2026 ? ((100 * y2026.spawned) / y2026.n).toFixed(1) : '—'}% across runs — if near 0, raise spawn p or ratings multiplier.`
  );
  console.log(
    `3) Too dominant? At 2026 #1 rate=${y2026 ? ((100 * y2026.rk1) / y2026.n).toFixed(1) : '—'}% — should not routine #1 in Sunbelt pilots.`
  );
  console.log('4) Regional? Compare atlanta/nashville vs seattle/newyork columns for spawned/top10 at 2010–2026.');
  console.log(
    `5) Gospel viable? Median max-Gospel-share at 2026 across cells ≈ ${y2026 && y2026.gMax.length ? y2026.gMax.sort((a, b) => a - b)[Math.floor(y2026.gMax.length / 2)].toFixed(4) : '—'} — should stay >0 in most markets (commercial GOSPEL unchanged in code).`
  );
}

main();
