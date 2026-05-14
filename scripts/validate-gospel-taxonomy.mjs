#!/usr/bin/env node
/**
 * Headless sanity: commercial GOSPEL vs market composition + RELIGIOUS_NETWORK coexistence.
 *
 * Usage:
 *   node scripts/validate-gospel-taxonomy.mjs --runs=2 --full
 *   VALIDATION_QUIET=1 node scripts/validate-gospel-taxonomy.mjs --runs=2 --full
 *   node scripts/validate-gospel-taxonomy.mjs --smoke
 *   node scripts/validate-gospel-taxonomy.mjs --verbose
 *
 * Progress: default is one summary line at end; step logs need --verbose or GOSPEL_VALIDATE_VERBOSE=1.
 *
 * Env:
 *   VALIDATION_QUIET=1 — stub VM console.log only; does not control harness progress lines
 *   GOSPEL_VALIDATE_VERBOSE=1 — argv, vm load phases, per-harness lines, vm tick JSON
 *   GOSPEL_VALIDATE_RUN_TIMEOUT_MS — per-harness VM call cap (default full 20m, smoke 3m)
 *   GOSPEL_VALIDATE_LEGACY_TIMEOUT_MS — legacy.js compile+run in VM (default 25m)
 *
 * Output: tmp/gospel_taxonomy_validation.csv (full) or tmp/gospel_taxonomy_validation_smoke.csv (--smoke)
 *
 * Row contract: exactly markets×runs×checkpoints data rows. Column dataValid=1 means metrics from a
 * successful advance+recalc for that checkpoint; dataValid=0 rows are placeholders (harness timeout,
 * thrown error, or advance failure — see harnessError). Partial progress before an advance failure
 * still emits dataValid=1 rows for completed checkpoints.
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
const outCsvDefault = path.join(root, 'tmp', 'gospel_taxonomy_validation.csv');
const outCsvSmoke = path.join(root, 'tmp', 'gospel_taxonomy_validation_smoke.csv');

const CHECKPOINTS_FULL = [1990, 2000, 2010, 2020, 2026];
const CHECKPOINTS_SMOKE = [2010];
const DEFAULT_MARKETS = ['atlanta', 'nashville', 'chicago', 'newyork', 'seattle', 'wichita', 'losangeles'];
const SMOKE_MARKETS = ['atlanta'];
const CAREER_MAX_STEPS_FULL = 28000;
const CAREER_MAX_STEPS_SMOKE = 8000;

function envInt(name, def) {
  const v = process.env[name];
  if (v == null || v === '') return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

/** Default: only `always` lines (final summary + errors). Use --verbose for full step logs. */
function progress(msg, opts) {
  const always = opts && opts.always;
  if (!always && !progress.verbose) return;
  process.stdout.write(`[gospel-taxonomy] ${msg}\n`);
}

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

function installGospelHarness(ctx, checkpoints, maxSteps) {
  const checkpointsJson = JSON.stringify(checkpoints);
  const maxS = maxSteps;
  const code = `
(function () {
  var CHECKPOINTS = ${checkpointsJson};
  var CAREER_MAX_STEPS = ${maxS};

  function __harnessEcologySnap(G) {
    var counts = {};
    var shareSum = {};
    var totalC = 0;
    var activeC = 0;
    var znC = 0;
    var profC = 0;
    var sumRev = 0;
    var sumEbit = 0;
    var relNet = 0;
    var bucket = { gospel: 0, newsTalk: 0, classicalPublic: 0, jazz: 0, brokered: 0, christianish: 0, otherReligious: 0 };
    var i;
    var st;
    var fmt;
    var sh;
    var eb;
    var isComm = typeof stationIsNoncommercialInstitutional === 'function' ? stationIsNoncommercialInstitutional : function () { return false; };
    for (i = 0; i < G.stations.length; i++) {
      st = G.stations[i];
      if (!st || st._bpSlotDeferred) continue;
      if (st.format === 'RELIGIOUS_NETWORK' || st.isReligiousNetwork) relNet++;
      if (isComm(st)) continue;
      fmt = st.format || 'UNKNOWN';
      counts[fmt] = (counts[fmt] || 0) + 1;
      sh = st.rat && typeof st.rat.share === 'number' ? st.rat.share : 0;
      shareSum[fmt] = (shareSum[fmt] || 0) + sh;
      totalC++;
      if (st.isZombie || st.isNicheSurvival) znC++;
      else activeC++;
      eb = st.fin && typeof st.fin.ebitda === 'number' ? st.fin.ebitda : null;
      if (eb != null && eb > 0) profC++;
      if (st.fin && typeof st.fin.rev === 'number') sumRev += st.fin.rev;
      if (st.fin && typeof st.fin.ebitda === 'number') sumEbit += st.fin.ebitda;
      if (fmt === 'GOSPEL') bucket.gospel++;
      if (fmt === 'NEWS_TALK' || fmt === 'ALL_NEWS' || fmt === 'SPORTS_TALK' || fmt === 'PERSONALITY_TALK') bucket.newsTalk++;
      if (fmt === 'PUBLIC_CLASSICAL' || fmt === 'BEAUTIFUL_MUSIC' || fmt === 'ADULT_STANDARDS') bucket.classicalPublic++;
      if (/JAZZ/i.test(fmt)) bucket.jazz++;
      if (fmt === 'BROKERED_PROGRAMMING') bucket.brokered++;
      if (/CHRISTIAN|CCM|INSPIRATIONAL|WORSHIP/i.test(fmt)) bucket.christianish++;
      if (fmt === 'RELIGIOUS_NETWORK' || st.isReligiousNetwork) bucket.otherReligious++;
    }
    var uniq = Object.keys(counts).length;
    var H = 0;
    if (totalC > 0) {
      for (var k in counts) {
        var p = counts[k] / totalC;
        H -= p * Math.log(p + 1e-15) / Math.log(2);
      }
    }
    return {
      simYear: G.year,
      totalCommercial: totalC,
      activeCommercial: activeC,
      marginalZombieNiche: znC,
      profitableEbitdaPositive: profC,
      sumCommercialRev: sumRev,
      sumCommercialEbitda: sumEbit,
      relNetCount: relNet,
      formatCounts: counts,
      formatShareSum: shareSum,
      uniqueFormats: uniq,
      shannonBits: H,
      buckets: bucket,
    };
  }

  window.__gospelTaxonomyHarnessRun = function (marketId, seed) {
    var origR = Math.random;
    var s = seed >>> 0;
    Math.random = function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    function tick(phase, detail) {
      try {
        if (typeof __gospelHarnessTick === 'function') __gospelHarnessTick(phase, detail || {});
      } catch (_e) {}
    }
    try {
      var ui = window._harnessPatchTimersAndUi ? window._harnessPatchTimersAndUi() : { restore: function () {} };
      try {
        var rows = [];
        var ecology1970 = null;
        var ecologyByCheckpoint = [];
        tick('begin', { marketId: marketId, seed: seed });
        ACTIVE_MARKET = marketId;
        syncMarketPopToMarket(marketId);
        tick('before_genMarketMP', { marketId: marketId });
        G = genMarketMP('1970');
        G.marketId = marketId;
        G.news = G.news || [];
        MP.mode = 'solo';
        MP.isHost = false;
        if (MP.players) MP.players = [];
        tick('after_genMarketMP', { marketId: marketId, year: G.year, stations: G.stations ? G.stations.length : 0 });
        migrateSave(G);
        tick('after_migrateSave', { marketId: marketId });
        ecology1970 = __harnessEcologySnap(G);
        var ci;
        for (ci = 0; ci < CHECKPOINTS.length; ci++) {
          var ty = CHECKPOINTS[ci];
          tick('advance_start', { marketId: marketId, targetYear: ty, targetPeriod: 2, maxSteps: CAREER_MAX_STEPS });
          var adv = advanceGToYearPeriod(ty, 2, CAREER_MAX_STEPS);
          tick('advance_done', { marketId: marketId, targetYear: ty, ok: adv.ok, steps: adv.steps, atYear: G.year, atPeriod: G.period });
          if (!adv.ok) {
            return {
              ok: false,
              marketId: marketId,
              seed: seed,
              error: 'advance_' + ty,
              at: adv.at,
              steps: adv.steps,
              partialRows: rows,
              ecology1970: ecology1970,
              ecologyByCheckpoint: ecologyByCheckpoint,
            };
          }
          migrateSave(G);
          tick('before_recalc', { marketId: marketId, year: G.year });
          recalc(G.stations, G);
          tick('after_recalc', { marketId: marketId, year: G.year });
          var rk = rankStationsByShareCompetition(G.stations);
          var gStations = [];
          var gi;
          var sumShare = 0;
          var relCount = 0;
          for (gi = 0; gi < G.stations.length; gi++) {
            var st = G.stations[gi];
            if (!st || st._bpSlotDeferred) continue;
            if (st.format === 'RELIGIOUS_NETWORK' || st.isReligiousNetwork) relCount++;
            if (st.format === 'GOSPEL') {
              var sh = st.rat && typeof st.rat.share === 'number' ? st.rat.share : 0;
              sumShare += sh;
              var rk1 = rk.rankById ? rk.rankById[st.id] : null;
              gStations.push({ share: sh, rank: rk1, call: st.callLetters || '', am: st.sig && st.sig.type === 'AM' });
            }
          }
          var nG = gStations.length;
          var meanShare = nG ? sumShare / nG : 0;
          var maxShare = 0;
          var bestRank = null;
          for (gi = 0; gi < gStations.length; gi++) {
            if (gStations[gi].share > maxShare) maxShare = gStations[gi].share;
            var rnk = gStations[gi].rank;
            if (rnk != null && (bestRank == null || rnk < bestRank)) bestRank = rnk;
          }
          var reformatsToGospel = 0;
          if (G.news && G.news.length) {
            for (var ni = 0; ni < G.news.length; ni++) {
              var t = (G.news[ni] && G.news[ni].t) || '';
              if (/Gospel/i.test(t) && (/relaunches as|→ .*Gospel|→ Gospel|as Gospel/i.test(t))) reformatsToGospel++;
            }
          }
          rows.push({
            checkpointYear: ty,
            simYear: G.year,
            gospelCount: nG,
            gospelMeanShare: meanShare,
            gospelMaxShare: maxShare,
            gospelBestRank: bestRank,
            relNetCount: relCount,
            reformatsToGospel: reformatsToGospel,
            advanceSteps: adv.steps,
          });
          ecologyByCheckpoint.push(__harnessEcologySnap(G));
        }
        tick('harness_complete', { marketId: marketId, seed: seed, rowCount: rows.length });
        return { ok: true, marketId: marketId, seed: seed, rows: rows, ecology1970: ecology1970, ecologyByCheckpoint: ecologyByCheckpoint };
      } catch (e) {
        tick('harness_throw', { marketId: marketId, err: String(e && e.message ? e.message : e) });
        return {
          ok: false,
          marketId: marketId,
          seed: seed,
          error: String(e && e.message ? e.message : e),
          partialRows: rows,
          ecology1970: ecology1970,
          ecologyByCheckpoint: ecologyByCheckpoint,
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

function loadSim(ctx, checkpoints, maxSteps, legacyTimeoutMs) {
  const legacySrc = loadLegacySrc();
  progress(`vm: compiling+executing legacy.js (${Math.round(legacySrc.length / 1024)}kb) — this can take minutes; timeout ${Math.round(legacyTimeoutMs / 60000)}m`);
  vm.runInContext(legacySrc, ctx, { filename: 'legacy.js', timeout: legacyTimeoutMs });
  progress('vm: legacy.js loaded; loading marketSimHarness.js');
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx, { filename: 'marketSimHarness.js', timeout: legacyTimeoutMs });
  progress('vm: installing gospel harness');
  installGospelHarness(ctx, checkpoints, maxSteps);
  progress('vm: loadSim complete');
}

function parseArgs(argv) {
  let runs = 6;
  let smoke = false;
  let verbose = false;
  for (const a of argv) {
    if (a === '--smoke') smoke = true;
    else if (a === '--verbose') verbose = true;
    else if (a.startsWith('--runs=')) runs = Math.max(1, parseInt(a.slice('--runs='.length), 10) || 6);
  }
  if (process.env.GOSPEL_VALIDATE_VERBOSE === '1') verbose = true;
  if (smoke) {
    return {
      smoke: true,
      runs: 1,
      markets: SMOKE_MARKETS.slice(),
      checkpoints: CHECKPOINTS_SMOKE.slice(),
      maxSteps: CAREER_MAX_STEPS_SMOKE,
      outCsv: outCsvSmoke,
      verbose,
    };
  }
  return {
    smoke: false,
    runs,
    markets: DEFAULT_MARKETS.slice(),
    checkpoints: CHECKPOINTS_FULL.slice(),
    maxSteps: CAREER_MAX_STEPS_FULL,
    outCsv: outCsvDefault,
    verbose,
  };
}

function csvEscape(s) {
  const t = String(s ?? '');
  if (/[",\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

/** One CSV line: metrics + dataValid (0|1) + harnessError + runHarnessOk (1 = full run OK). */
function formatGospelRow(mkt, runIdx, seed, row, dataValid, harnessError, runHarnessOk) {
  const err = harnessError == null ? '' : String(harnessError);
  return [
    csvEscape(mkt),
    runIdx,
    seed,
    row.checkpointYear,
    row.gospelCount,
    row.gospelMeanShare.toFixed(5),
    row.gospelMaxShare.toFixed(5),
    row.gospelBestRank == null ? '' : row.gospelBestRank,
    row.relNetCount,
    row.reformatsToGospel,
    row.advanceSteps,
    dataValid,
    csvEscape(err),
    runHarnessOk,
  ].join(',');
}

function placeholderCheckpointRow(mkt, runIdx, seed, checkpointYear, harnessError, runHarnessOk) {
  return [
    csvEscape(mkt),
    runIdx,
    seed,
    checkpointYear,
    0,
    '0.00000',
    '0.00000',
    '',
    0,
    0,
    0,
    0,
    csvEscape(harnessError || ''),
    runHarnessOk,
  ].join(',');
}

function seedFor(markets, mkt, r) {
  return (920000 + markets.indexOf(mkt) * 104729 + r * 7919) >>> 0;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else if (c === '"') {
      inQ = true;
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Printed with `{ always: true }` so VALIDATION_QUIET still shows the digest. */
function printGospelAggregateReport(lines, expectedDataRows, failures, runsPerMarket, opts) {
  const dataLines = lines.slice(1);
  const I = {
    mkt: 0,
    run: 1,
    cp: 3,
    gCount: 4,
    gMax: 6,
    rel: 8,
    dValid: 11,
    rOk: 13,
  };
  /** key `${mkt}\t${cp}\t${run}` -> one snapshot */
  const cell = new Map();
  const runHarnessFullOk = new Map();

  for (const line of dataLines) {
    if (!line.trim()) continue;
    const c = parseCsvLine(line);
    if (c.length < 14) continue;
    const mkt = c[I.mkt];
    const run = c[I.run];
    const cp = c[I.cp];
    const dValid = c[I.dValid] === '1';
    const rOk = c[I.rOk] === '1';
    const rk = `${mkt}\t${run}`;
    if (rOk) runHarnessFullOk.set(rk, true);
    if (!dValid) continue;
    const key = `${mkt}\t${cp}\t${run}`;
    const gc = parseInt(c[I.gCount], 10) || 0;
    const gmx = parseFloat(c[I.gMax]);
    const rel = parseInt(c[I.rel], 10) || 0;
    cell.set(key, {
      gCount: gc,
      gMax: Number.isFinite(gmx) ? gmx : 0,
      rel,
    });
  }

  const mk = (msg) => progress(msg, opts);
  const markets = [...new Set(dataLines.map((ln) => parseCsvLine(ln)[0]).filter(Boolean))].sort();

  mk(`report: csv data lines=${dataLines.length} expected=${expectedDataRows}`);
  mk(`report: failed harnesses=${failures.length}`);
  if (failures.length) {
    for (const f of failures.slice(0, 25)) {
      mk(`report:   fail ${f.marketId} run=${f.run} seed=${f.seed} ${f.error}`);
    }
    if (failures.length > 25) mk(`report:   … and ${failures.length - 25} more`);
  }

  for (const mkt of markets) {
    let okR = 0;
    for (let r = 0; r < runsPerMarket; r++) {
      if (runHarnessFullOk.has(`${mkt}\t${r}`)) okR++;
    }
    mk(`report: ${mkt} full harness ok ${okR}/${runsPerMarket}`);
  }

  const cps = [...new Set(dataLines.map((ln) => parseCsvLine(ln)[I.cp]).filter(Boolean))].sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10)
  );
  mk('report: by market × checkpoint (valid rows only): mean gospelCount/run, %runs gospel>0, mean maxShare, mean relNet');
  for (const mkt of markets) {
    for (const cp of cps) {
      const vals = [];
      for (let r = 0; r < runsPerMarket; r++) {
        const o = cell.get(`${mkt}\t${cp}\t${r}`);
        if (o) vals.push(o);
      }
      if (!vals.length) {
        mk(`report:   ${mkt} ${cp}: no valid rows`);
        continue;
      }
      const meanCnt = vals.reduce((a, v) => a + v.gCount, 0) / vals.length;
      const pctRuns = (100 * vals.filter((v) => v.gCount > 0).length) / vals.length;
      const meanMax = vals.reduce((a, v) => a + v.gMax, 0) / vals.length;
      const meanRel = vals.reduce((a, v) => a + v.rel, 0) / vals.length;
      mk(
        `report:   ${mkt} ${cp}: meanGospelStations≈${meanCnt.toFixed(2)} pctRunsGospel>0=${pctRuns.toFixed(1)}% meanMaxShare≈${(meanMax * 100).toFixed(3)}% meanRelNet≈${meanRel.toFixed(2)} (nRuns=${vals.length})`
      );
    }
  }
}

/** Aggregate ecology snapshots (host-side only; not in CSV). */
function printEcosystemSanityReports(ecologyRuns, checkpoints, markets, runsPerMarket, opts) {
  const mk = (msg) => progress(msg, opts);
  const totalRuns = markets.length * runsPerMarket;
  const label1970 = '1970';

  function snapshotsFor(mkt, label) {
    const out = [];
    for (const er of ecologyRuns) {
      if (er.marketId !== mkt) continue;
      if (label === label1970) {
        if (er.ecology1970) out.push(er.ecology1970);
      } else {
        const y = parseInt(label, 10);
        const idx = checkpoints.indexOf(y);
        if (idx >= 0 && er.ecologyByCheckpoint && er.ecologyByCheckpoint[idx]) out.push(er.ecologyByCheckpoint[idx]);
      }
    }
    return out;
  }

  function meanTopFormats(snips, byShare, topN) {
    const fmtSet = new Set();
    for (const s of snips) {
      const src = byShare ? s.formatShareSum : s.formatCounts;
      Object.keys(src || {}).forEach((k) => fmtSet.add(k));
    }
    const rows = [...fmtSet].map((fmt) => {
      const mean =
        snips.reduce((a, s) => {
          const o = byShare ? s.formatShareSum : s.formatCounts;
          return a + (o && o[fmt] != null ? Number(o[fmt]) : 0);
        }, 0) / Math.max(1, snips.length);
      return { fmt, mean };
    });
    rows.sort((a, b) => b.mean - a.mean);
    return rows.slice(0, topN);
  }

  mk('eco: --- ecosystem sanity (dataValid CSV rows only for gospel table above; ecology uses harness snapshots incl. partial runs) ---');
  mk(`eco: total harness attempts=${totalRuns} ecology records kept=${ecologyRuns.length}`);
  mk('eco: 1985 snapshot n/a (not in advance checkpoint ladder; add CHECKPOINTS if needed)');
  const yearLabels = [label1970, ...checkpoints.map(String)];
  for (const mkt of markets) {
    mk(`eco: market=${mkt}`);
    for (const lab of yearLabels) {
      const sn = snapshotsFor(mkt, lab);
      if (!sn.length) {
        mk(`eco:   [${lab}] no snapshots`);
        continue;
      }
      const mt = sn.reduce((a, s) => a + s.totalCommercial, 0) / sn.length;
      const ma = sn.reduce((a, s) => a + s.activeCommercial, 0) / sn.length;
      const mz = sn.reduce((a, s) => a + s.marginalZombieNiche, 0) / sn.length;
      const mp = sn.reduce((a, s) => a + s.profitableEbitdaPositive, 0) / sn.length;
      const mrev = sn.reduce((a, s) => a + s.sumCommercialRev, 0) / sn.length;
      const mebit = sn.reduce((a, s) => a + s.sumCommercialEbitda, 0) / sn.length;
      const poolRev = sn.reduce((a, s) => a + s.sumCommercialRev, 0);
      const poolEb = sn.reduce((a, s) => a + s.sumCommercialEbitda, 0);
      const margin = poolRev > 1e-6 ? poolEb / poolRev : null;
      const mu = sn.reduce((a, s) => a + s.uniqueFormats, 0) / sn.length;
      const mH = sn.reduce((a, s) => a + s.shannonBits, 0) / sn.length;
      mk(
        `eco:   [${lab}] n=${sn.length} meanComm=${mt.toFixed(2)} meanActive=${ma.toFixed(2)} meanZombieNiche=${mz.toFixed(2)} meanEbitda>0stns=${mp.toFixed(2)} bankruptOffAir=n/a`
      );
      mk(
        `eco:        meanΣcommercialRev/run=${mrev.toFixed(0)} meanΣcommercialEbitda/run=${mebit.toFixed(0)} pooledEbitdaMargin=${margin == null ? 'n/a' : (100 * margin).toFixed(2) + '%'}`
      );
      mk(`eco:        meanUniqueFormats=${mu.toFixed(2)} meanShannonH(bits)=${mH.toFixed(3)}`);
      const topC = meanTopFormats(sn, false, 10);
      const topS = meanTopFormats(sn, true, 10);
      mk(
        `eco:        topFormatsByMeanStationCount: ${topC.map((x) => `${x.fmt}:${x.mean.toFixed(2)}`).join(' | ')}`
      );
      mk(
        `eco:        topFormatsByMeanTotalShare: ${topS.map((x) => `${x.fmt}:${(100 * x.mean).toFixed(3)}%`).join(' | ')}`
      );
      const relSn = sn.filter((s) => s.relNetCount > 0);
      if (!relSn.length) {
        mk('eco:        RNcoexist: no snapshots with relNetCount>0 in this bucket');
      } else {
        const g = relSn.reduce((a, s) => a + s.buckets.gospel, 0) / relSn.length;
        const nt = relSn.reduce((a, s) => a + s.buckets.newsTalk, 0) / relSn.length;
        const cl = relSn.reduce((a, s) => a + s.buckets.classicalPublic, 0) / relSn.length;
        const jz = relSn.reduce((a, s) => a + s.buckets.jazz, 0) / relSn.length;
        const br = relSn.reduce((a, s) => a + s.buckets.brokered, 0) / relSn.length;
        const ch = relSn.reduce((a, s) => a + s.buckets.christianish, 0) / relSn.length;
        const or = relSn.reduce((a, s) => a + s.buckets.otherReligious, 0) / relSn.length;
        mk(
          `eco:        RNcoexist(relNet>0 n=${relSn.length}): meanStns gospel=${g.toFixed(3)} newsTalk=${nt.toFixed(3)} classicalPublic=${cl.toFixed(3)} jazz=${jz.toFixed(3)} brokered=${br.toFixed(3)} christianishFmt=${ch.toFixed(3)} relNetworkFmt=${or.toFixed(3)}`
        );
      }
      if (lab === '2026' || lab === String(checkpoints[checkpoints.length - 1])) {
        if (mH < 1.45 && mu < 5.5) {
          mk(`eco:   !! redFlag [${lab}] low diversity (H=${mH.toFixed(2)} uniq=${mu.toFixed(1)}) — possible format collapse`);
        }
        if (margin != null && margin < -0.05) {
          mk(`eco:   !! redFlag [${lab}] very negative pooled EBITDA margin ${(100 * margin).toFixed(1)}%`);
        }
      }
    }
  }
}

function main() {
  const argv = process.argv.slice(2);
  const quiet = process.env.VALIDATION_QUIET === '1';
  const cfg = parseArgs(argv);
  const { runs, markets, checkpoints, maxSteps, outCsv, smoke, verbose } = cfg;
  progress.verbose = verbose;

  progress(`argv: ${JSON.stringify(argv)}`);
  progress(
    `parsed: smoke=${smoke} runs=${runs} markets=[${markets.join(',')}] checkpoints=[${checkpoints.join(',')}] advanceMaxSteps=${maxSteps} quiet=${quiet} verbose=${verbose}`
  );

  const legacyTimeoutMs = envInt('GOSPEL_VALIDATE_LEGACY_TIMEOUT_MS', smoke ? 5 * 60 * 1000 : 25 * 60 * 1000);
  const runTimeoutMs = envInt('GOSPEL_VALIDATE_RUN_TIMEOUT_MS', smoke ? 3 * 60 * 1000 : 20 * 60 * 1000);

  const t0 = Date.now();
  progress(
    `start mode=${smoke ? 'smoke' : 'full'} markets=${markets.length} runs=${runs} checkpoints=${checkpoints.join(',')} advanceMaxSteps=${maxSteps} -> ${path.basename(outCsv)}`
  );

  const ctx = createVmContext(quiet);
  if (verbose) {
    ctx.__gospelHarnessTick = (phase, detail) => {
      const d = detail && typeof detail === 'object' ? JSON.stringify(detail) : String(detail);
      progress(`vm tick ${phase} ${d}`);
    };
  } else {
    ctx.__gospelHarnessTick = () => {};
  }

  loadSim(ctx, checkpoints, maxSteps, legacyTimeoutMs);

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const headerCols = [
    'marketId',
    'run',
    'seed',
    'checkpointYear',
    'gospelCount',
    'gospelMeanShare',
    'gospelMaxShare',
    'gospelBestRank',
    'relNetCount',
    'reformatsToGospel',
    'advanceSteps',
    'dataValid',
    'harnessError',
    'runHarnessOk',
  ];
  const lines = [headerCols.join(',')];

  const expectedHarnesses = markets.length * runs;
  const expectedDataRows = expectedHarnesses * checkpoints.length;
  const failures = [];
  const ecologyRuns = [];
  let done = 0;
  let completedHarness = 0;

  for (const mkt of markets) {
    for (let r = 0; r < runs; r++) {
      const seed = seedFor(markets, mkt, r);
      progress(`host: harness ${done + 1}/${expectedHarnesses} market=${mkt} runIndex=${r} seed=${seed} starting (vm timeout ${Math.round(runTimeoutMs / 60000)}m)`);
      const runStart = Date.now();
      let res;
      let hostErr = '';
      try {
        res = vm.runInContext(`__gospelTaxonomyHarnessRun(${JSON.stringify(mkt)}, ${seed})`, ctx, { timeout: runTimeoutMs });
      } catch (e) {
        hostErr = e && e.message ? e.message : String(e);
        progress(`host: TIMEOUT or VM error market=${mkt} run=${r} seed=${seed} after ${Date.now() - runStart}ms — ${hostErr}`, { always: true });
      }
      const elapsed = Date.now() - runStart;
      done++;

      const errMsg = hostErr || (res && !res.ok && (res.error || 'unknown')) || '';
      const runOk = !!(res && res.ok && Array.isArray(res.rows) && res.rows.length === checkpoints.length);
      const runHarnessOk = runOk ? 1 : 0;

      if (runOk) {
        completedHarness++;
        for (const row of res.rows) {
          lines.push(formatGospelRow(mkt, r, seed, row, 1, '', 1));
        }
        ecologyRuns.push({
          marketId: mkt,
          run: r,
          seed,
          fullHarness: true,
          ecology1970: res.ecology1970,
          ecologyByCheckpoint: res.ecologyByCheckpoint || [],
        });
        progress(`host: OK market=${mkt} run=${r} seed=${seed} completedHarness=${completedHarness}/${expectedHarnesses} (${elapsed}ms)`);
      } else {
        const detail = errMsg || (res && res.error) || '?';
        failures.push({ marketId: mkt, run: r, seed, error: detail });
        ecologyRuns.push({
          marketId: mkt,
          run: r,
          seed,
          fullHarness: false,
          ecology1970: res && res.ecology1970,
          ecologyByCheckpoint: (res && res.ecologyByCheckpoint) || [],
        });
        progress(`host: FAIL market=${mkt} run=${r} seed=${seed} err=${detail} (${elapsed}ms)`, { always: true });
        if (!quiet) console.error('Harness failed', mkt, seed, detail);

        const partial = (res && Array.isArray(res.partialRows) && res.partialRows) || [];
        const byYear = new Map(partial.map((row) => [row.checkpointYear, row]));
        for (const ty of checkpoints) {
          const pr = byYear.get(ty);
          if (pr) {
            lines.push(formatGospelRow(mkt, r, seed, pr, 1, '', 0));
          } else {
            lines.push(placeholderCheckpointRow(mkt, r, seed, ty, detail, 0));
          }
        }
      }
    }
  }

  const dataRows = lines.length - 1;
  if (dataRows !== expectedDataRows) {
    progress(`host: INTERNAL row mismatch dataRows=${dataRows} expected=${expectedDataRows}`, { always: true });
  }

  progress('host: writing CSV…');
  writeFileSync(outCsv, lines.join('\n'), 'utf8');
  const elapsedMs = Date.now() - t0;
  progress(
    `done out=${outCsv} dataRows=${dataRows} expectedRows=${expectedDataRows} completedHarness=${completedHarness}/${expectedHarnesses} failedHarness=${failures.length} elapsedMs=${elapsedMs} smoke=${smoke}`,
    { always: true }
  );
  if (failures.length) {
    progress(`failures_json: ${JSON.stringify(failures)}`, { always: true });
  }

  printGospelAggregateReport(lines, expectedDataRows, failures, runs, { always: true });
  printEcosystemSanityReports(ecologyRuns, checkpoints, markets, runs, { always: true });
}

main();
