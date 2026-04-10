#!/usr/bin/env node
/**
 * Early single-station economics by format / band / share bucket (snowball trace, diagnosis only).
 *
 *   npm run analyze:early-single-station
 *
 * Env:
 *   EARLY_SEEDS=505050,717171,919191
 *   EARLY_MAX_YEAR=1985        filter analyzed rows (year <= this)
 *   EARLY_TRACE_END_YEAR=1985  vite snowball trace stops here (faster)
 *   EARLY_TOP_ROWS=20
 *   EARLY_CONSOLE_TOP=10
 *   EARLY_SCEN=under  EARLY_MARKET=atlanta  EARLY_POLICY=aggressive  EARLY_EASY=0  EARLY_PASSIVE=0
 *   EARLY_PURE_REQUIRE_BRIDGE=1
 *   EARLY_PORT=4191
 */
/* eslint-disable no-console */

import { mkdirSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import http from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { assertPortFreeForPreview, logPreviewEarlyExit } from './benchmark-trace-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'trace-output');

function parseSeeds() {
  const raw = process.env.EARLY_SEEDS || process.env.OPS_SEEDS || '505050,717171,919191';
  return raw
    .split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 0);
}

const seeds = parseSeeds();
const maxYear = Math.max(1970, Math.min(2010, parseInt(process.env.EARLY_MAX_YEAR || '1985', 10)));
const traceEndYear = Math.max(maxYear, Math.min(2030, parseInt(process.env.EARLY_TRACE_END_YEAR || String(maxYear), 10)));
const topRowsOut = Math.max(1, Math.min(200, parseInt(process.env.EARLY_TOP_ROWS || '20', 10)));
const consoleTop = Math.max(1, Math.min(topRowsOut, parseInt(process.env.EARLY_CONSOLE_TOP || '10', 10)));
const scen = /^[a-z0-9_]+$/i.test(process.env.EARLY_SCEN || process.env.OPS_SCEN || '') ? process.env.EARLY_SCEN || process.env.OPS_SCEN : 'under';
const market = /^[a-z0-9_]+$/i.test(process.env.EARLY_MARKET || process.env.OPS_MARKET || '')
  ? process.env.EARLY_MARKET || process.env.OPS_MARKET
  : 'atlanta';
const policy =
  (process.env.EARLY_POLICY || process.env.OPS_POLICY || 'aggressive').toLowerCase() === 'conservative'
    ? 'conservative'
    : 'aggressive';
const easy = process.env.EARLY_EASY === '1' || process.env.EARLY_EASY === 'true' || process.env.OPS_EASY === '1';
const passive = process.env.EARLY_PASSIVE === '1' || process.env.EARLY_PASSIVE === 'true' || process.env.OPS_PASSIVE === '1';
const pureRequireBridge =
  process.env.EARLY_PURE_REQUIRE_BRIDGE !== '0' &&
  process.env.EARLY_PURE_REQUIRE_BRIDGE !== 'false' &&
  process.env.OPS_PURE_REQUIRE_BRIDGE !== '0' &&
  process.env.OPS_PURE_REQUIRE_BRIDGE !== 'false';
const PORT = parseInt(process.env.EARLY_PORT || process.env.OPS_PORT || '4191', 10);

function waitForOk(path, maxMs) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    function tryOnce() {
      const req = http.get(`http://127.0.0.1:${PORT}${path}`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      function retry() {
        if (Date.now() - t0 > maxMs) reject(new Error('timeout ' + path));
        else setTimeout(tryOnce, 250);
      }
    }
    tryOnce();
  });
}

function inspectUrl(seed) {
  const qs = new URLSearchParams({
    endYear: String(traceEndYear),
    scen,
    market,
    seed: String(seed),
    policy,
  });
  if (easy) qs.set('easy', '1');
  if (passive) qs.set('passive', '1');
  return '/inspect-market-snowball.html?' + qs.toString();
}

function pressureDelta(r) {
  if (r.pressureNetCashDelta != null && Number.isFinite(r.pressureNetCashDelta)) return r.pressureNetCashDelta;
  const b = r.cashBridge;
  if (b && b.pressure_net_cash_delta != null) return Number(b.pressure_net_cash_delta) || 0;
  return null;
}

function isPurePressure(r) {
  const p = pressureDelta(r);
  if (p == null) return !pureRequireBridge;
  return !(p > 0);
}

function isEarlySingleStationRow(r) {
  if (!r || r.soloBankrupt) return false;
  if ((r.nStations || 0) !== 1) return false;
  const nAm = r.nAm || 0;
  const nFm = r.nFm || 0;
  if (nAm + nFm < 1) return false;
  if ((r.totalRev || 0) <= 0) return false;
  if ((r.year || 0) > maxYear) return false;
  if (!isPurePressure(r)) return false;
  return true;
}

function rowFormat(r) {
  return r.playerPrimaryFormat && r.playerPrimaryFormat !== 'null' ? r.playerPrimaryFormat : 'UNKNOWN';
}

function rowBand(r) {
  if (r.playerBand) return r.playerBand;
  if ((r.nTranslator || 0) >= 1 && !r.nAm && !r.nFm) return 'TRANSLATOR';
  if ((r.nFm || 0) >= 1) return 'FM';
  if ((r.nAm || 0) >= 1) return 'AM';
  return 'OTHER';
}

function shareBucketLabel(topShare) {
  const s = topShare == null ? 0 : Number(topShare);
  const edges = [
    [0, 0.03, '0.00-0.03'],
    [0.03, 0.05, '0.03-0.05'],
    [0.05, 0.07, '0.05-0.07'],
    [0.07, 0.09, '0.07-0.09'],
    [0.09, 0.11, '0.09-0.11'],
  ];
  for (const [lo, hi, lab] of edges) {
    if (s >= lo && s < hi) return lab;
  }
  return '0.11+';
}

function sum(xs) {
  return xs.reduce((a, b) => a + b, 0);
}

function aggregateMetrics(arr) {
  if (!arr.length) return null;
  const n = arr.length;
  const cashSorted = arr.map((r) => r.cashDelta || 0).sort((a, b) => a - b);
  const rev = arr.map((r) => r.totalRev || 0);
  const eb = arr.map((r) => r.totalEbitda || 0);
  const margins = arr.filter((r) => (r.totalRev || 0) > 0).map((r) => r.totalEbitda / r.totalRev);
  const shar = arr.map((r) => r.topShare || 0);
  const mid = cashSorted.length % 2
    ? cashSorted[(cashSorted.length - 1) / 2]
    : (cashSorted[cashSorted.length / 2 - 1] + cashSorted[cashSorted.length / 2]) / 2;
  return {
    rowCount: n,
    avgCashDelta: sum(cashSorted) / n,
    medianCashDelta: mid,
    avgTotalRev: sum(rev) / n,
    avgTotalEbitda: sum(eb) / n,
    avgEbitdaMargin: margins.length ? sum(margins) / margins.length : null,
    avgTopShare: sum(shar) / n,
    pctPositiveCashDelta: (100 * arr.filter((r) => (r.cashDelta || 0) > 0).length) / n,
    pctPositiveEbitda: (100 * arr.filter((r) => (r.totalEbitda || 0) > 0).length) / n,
  };
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const r of arr) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

function summarizeGroups(arr, keyFn) {
  const m = groupBy(arr, keyFn);
  const out = {};
  for (const [k, rows] of m) {
    out[k] = aggregateMetrics(rows);
  }
  return out;
}

function buildShareBucketTable(arr) {
  const byBucket = summarizeGroups(arr, (r) => shareBucketLabel(r.topShare));
  const combo = [];
  const m2 = groupBy(arr, (r) => shareBucketLabel(r.topShare) + '\t' + rowFormat(r));
  for (const [key, rows] of m2) {
    const [bucket, format] = key.split('\t');
    const met = aggregateMetrics(rows);
    if (met) combo.push({ shareBucket: bucket, format, ...met });
  }
  combo.sort((a, b) => {
    const order = ['0.00-0.03', '0.03-0.05', '0.05-0.07', '0.07-0.09', '0.09-0.11', '0.11+'];
    const ib = order.indexOf(a.shareBucket) - order.indexOf(b.shareBucket);
    if (ib !== 0) return ib;
    return a.format.localeCompare(b.format);
  });
  return { byShareBucket: byBucket, byShareBucketByFormat: combo };
}

function serialTopRow(r, seed) {
  const a = r.actions || {};
  const ai = r.aiDelta || {};
  const rev = r.totalRev || 0;
  return {
    seed,
    year: r.year,
    period: r.period,
    step: r.step,
    format: rowFormat(r),
    band: rowBand(r),
    topShare: r.topShare,
    clusterShare: r.clusterShare,
    cashDelta: r.cashDelta,
    cashEnd: r.cashEnd,
    totalRev: r.totalRev,
    totalEbitda: r.totalEbitda,
    ebitdaMargin: rev > 0 ? r.totalEbitda / rev : null,
    nTop10: r.nTop10,
    nTop5: r.nTop5,
    acquisitions_json: a.acquisitions || [],
    reformats_json: a.reformats || [],
    promoProgBumps_json: a.promoProgBumps || [],
    talentHires: a.talentHires || [],
    ai_counterPromo: ai.counterPromoVsPlayer,
    ai_reformats: ai.rivalReformatsTotal,
    ai_poach: ai.poachPlayerAttempts,
    pressureNetCashDelta: pressureDelta(r),
  };
}

/** TOP40 + AM, single-station, pure-pressure, year window — ordered diary slice for streak math. */
function top40AmPureRowsFromDiary(diary) {
  return (diary || [])
    .filter(
      (r) =>
        r &&
        !r.soloBankrupt &&
        (r.nStations || 0) === 1 &&
        (r.totalRev || 0) > 0 &&
        (r.year || 0) >= 1970 &&
        (r.year || 0) <= maxYear &&
        isPurePressure(r)
    )
    .filter((r) => rowFormat(r) === 'TOP40' && rowBand(r) === 'AM')
    .sort((a, b) => (a.step || 0) - (b.step || 0));
}

function streakFromStartFor(rows, pred) {
  let n = 0;
  for (const r of rows) {
    if (pred(r)) n++;
    else break;
  }
  return n;
}

function maxStreakFor(rows, pred) {
  let cur = 0;
  let max = 0;
  for (const r of rows) {
    if (pred(r)) {
      cur++;
      max = Math.max(max, cur);
    } else cur = 0;
  }
  return max;
}

/** Portfolio cash (broad), operating EBITDA, and advTurn-only cash (narrows harness effects). */
function streakStatsForSeed(rows) {
  const predCash = (r) => (r.cashDelta || 0) > 0;
  const predEbitda = (r) => (r.totalEbitda || 0) > 0;
  const predAdv = (r) => {
    const a =
      r.advTurnCashDelta != null ? r.advTurnCashDelta : (r.cashEnd || 0) - (r.cashAfterBot || 0);
    return a > 0;
  };

  const streakFromStart_cash = streakFromStartFor(rows, predCash);
  const maxStreak_cash = maxStreakFor(rows, predCash);
  const streakFromStart_ebitda = streakFromStartFor(rows, predEbitda);
  const maxStreak_ebitda = maxStreakFor(rows, predEbitda);
  const streakFromStart_advTurn = streakFromStartFor(rows, predAdv);
  const maxStreak_advTurn = maxStreakFor(rows, predAdv);

  const first6 = rows.slice(0, 6).map((r) => {
    const adv = r.advTurnCashDelta != null ? r.advTurnCashDelta : (r.cashEnd || 0) - (r.cashAfterBot || 0);
    return {
      y: r.year,
      p: r.period,
      cashD: r.cashDelta,
      ebitda: r.totalEbitda,
      advTurnD: adv,
      sh: r.topShare,
    };
  });

  return {
    streakFromStart_cash,
    maxStreak_cash,
    streakFromStart_ebitda,
    maxStreak_ebitda,
    streakFromStart_advTurn,
    maxStreak_advTurn,
    first6,
  };
}

function aggregateShareBand69(rows) {
  const band = rows.filter((r) => {
    const sh = r.topShare == null ? 0 : Number(r.topShare);
    return sh >= 0.06 && sh < 0.09;
  });
  return aggregateMetrics(band);
}

function buildRiskSummary(byFormat, filteredRows) {
  const lines = [];
  const formats = Object.entries(byFormat).sort((a, b) => (b[1].rowCount || 0) - (a[1].rowCount || 0));
  for (const [fmt, met] of formats) {
    if (!met || met.rowCount < 3) continue;
    if (met.avgEbitdaMargin != null && met.avgEbitdaMargin >= 0.22) {
      lines.push(
        `${fmt}: high average EBITDA margin (~${(met.avgEbitdaMargin * 100).toFixed(1)}%) across ${met.rowCount} early pure-op single-station rows.`
      );
    }
    if (met.pctPositiveCashDelta >= 82) {
      lines.push(
        `${fmt}: cash-positive in ${met.pctPositiveCashDelta.toFixed(0)}% of those periods — unusually stable cash generation for the sample.`
      );
    }
    if (met.avgTopShare != null && met.avgTopShare < 0.07 && met.avgCashDelta > 40000) {
      lines.push(
        `${fmt}: strong avg cashΔ (~${Math.round(met.avgCashDelta)}) at modest mean topShare (~${(met.avgTopShare * 100).toFixed(1)}%) — share bar for “good” periods may be low.`
      );
    }
  }
  const byBand = summarizeGroups(filteredRows, rowBand);
  for (const [b, met] of Object.entries(byBand)) {
    if (!met || met.rowCount < 5) continue;
    if (b === 'FM' && met.avgCashDelta > (byBand.AM?.avgCashDelta || 0) * 1.15 && met.rowCount >= 5) {
      lines.push(
        `Band FM: mean cashΔ ~${Math.round(met.avgCashDelta)} vs AM ~${Math.round(byBand.AM?.avgCashDelta || 0)} on comparable counts — check FM early revenue curve.`
      );
      break;
    }
  }
  if (!lines.length) {
    lines.push('No strong single-format “smoking gun” in thresholds used — review byShareBucket and top rows for nuance.');
  }
  return lines;
}

async function fetchTraces() {
  await assertPortFreeForPreview(PORT, 'EARLY_PORT / OPS_PORT');
  const { chromium } = await import('playwright');
  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: 'inherit',
  });
  logPreviewEarlyExit(preview);
  try {
    await waitForOk('/', 120000);
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const runs = [];
    for (const seed of seeds) {
      const url = `http://127.0.0.1:${PORT}${inspectUrl(seed)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.__SNOWBALL_TRACE_DONE__ === true, null, { timeout: 600000 });
      const err = await page.evaluate(() => window.__SNOWBALL_TRACE_ERROR__);
      if (err) throw new Error('Seed ' + seed + ': ' + err);
      const json = await page.evaluate(() => window.__SNOWBALL_TRACE_JSON__);
      runs.push({ seed, out: json });
    }
    await browser.close();
    return runs;
  } finally {
    if (preview && !preview.killed) preview.kill('SIGTERM');
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  console.log(
    'Early single-station economics (pure-op, no pressure cash)\n' +
      '  seeds: ' +
      seeds.join(', ') +
      '\n  trace endYear: ' +
      traceEndYear +
      ' · analyze year <= ' +
      maxYear +
      '\n  ' +
      scen +
      ' · ' +
      market +
      ' · ' +
      (easy ? 'EASY' : 'HARD') +
      ' · ' +
      policy +
      (passive ? ' · passive' : '') +
      '\n'
  );

  const runs = await fetchTraces();
  const streakBySeed = [];
  for (const { seed, out } of runs) {
    const tRows = top40AmPureRowsFromDiary(out.diary);
    streakBySeed.push({ seed, periodCount: tRows.length, ...streakStatsForSeed(tRows) });
  }
  const filtered = [];
  for (const { seed, out } of runs) {
    for (const r of out.diary || []) {
      if (!isEarlySingleStationRow(r)) continue;
      filtered.push({ ...r, _seed: seed });
    }
  }

  const byFormat = summarizeGroups(filtered, rowFormat);
  const byBand = summarizeGroups(filtered, rowBand);
  const sharePart = buildShareBucketTable(filtered);
  const sortedTop = [...filtered].sort((a, b) => (b.cashDelta || 0) - (a.cashDelta || 0));
  const topRows = sortedTop.slice(0, topRowsOut).map((r) => serialTopRow(r, r._seed));
  const riskLines = buildRiskSummary(byFormat, filtered);
  const top40AmOnly = filtered.filter((r) => rowFormat(r) === 'TOP40' && rowBand(r) === 'AM');
  const band69 = aggregateShareBand69(top40AmOnly);
  const seedsStreak3PlusCash = streakBySeed.filter((s) => s.streakFromStart_cash >= 3).length;
  const seedsStreak3PlusEbitda = streakBySeed.filter((s) => s.streakFromStart_ebitda >= 3).length;

  const payload = {
    generated: new Date().toISOString(),
    config: {
      seeds,
      traceEndYear,
      maxYearInclusive: maxYear,
      scen,
      market,
      difficulty: easy ? 'EASY' : 'HARD',
      playerPolicy: passive ? 'passive' : policy,
      filters: {
        nStationsEq1: true,
        nAmPlusNFmGte1: true,
        totalRevGt0: true,
        notSoloBankrupt: true,
        pressureNetCashDeltaEq0: true,
        yearLte: maxYear,
        pureRequireBridge,
      },
    },
    stats: { matchingRows: filtered.length },
    byFormat,
    byBand,
    byShareBucket: sharePart.byShareBucket,
    byShareBucketByFormat: sharePart.byShareBucketByFormat,
    topRows,
    riskSummary: riskLines,
    streakTop40AmPure: {
      bySeed: streakBySeed,
      seedsWithStreakFromStartGte3: seedsStreak3PlusCash,
      seedsWithStreakFromStartGte3_cash: seedsStreak3PlusCash,
      seedsWithStreakFromStartGte3_ebitda: seedsStreak3PlusEbitda,
      seedCount: streakBySeed.length,
      note:
        'streakFromStart_* / maxStreak_*: portfolio cashΔ vs totalEbitda>0 vs advTurnCashDelta>0 on same TOP40·AM·pure-op diary rows.',
    },
    top40AmShare06to09: band69,
  };

  const outPath = join(outDir, 'early-single-station-economics.json');
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  function printMetricsTable(title, obj) {
    console.log('\n' + title);
    const keys = Object.keys(obj).sort((a, b) => (obj[b]?.rowCount || 0) - (obj[a]?.rowCount || 0));
    if (!keys.length) console.log('  (no rows)');
    for (const k of keys) {
      const m = obj[k];
      if (!m) continue;
      console.log(
        '  ' +
          k +
          ' · n=' +
          m.rowCount +
          ' · med cashΔ ' +
          Math.round(m.medianCashDelta) +
          ' · avg cashΔ ' +
          Math.round(m.avgCashDelta) +
          ' · avgRev ' +
          Math.round(m.avgTotalRev) +
          ' · avgEBITDA ' +
          Math.round(m.avgTotalEbitda) +
          ' · margin ' +
          (m.avgEbitdaMargin != null ? (m.avgEbitdaMargin * 100).toFixed(1) + '%' : 'n/a') +
          ' · avgTopSh ' +
          (m.avgTopShare * 100).toFixed(2) +
          '% · +cash% ' +
          m.pctPositiveCashDelta.toFixed(0) +
          ' · +ebitda% ' +
          m.pctPositiveEbitda.toFixed(0)
      );
    }
  }

  console.log('Matching rows: ' + filtered.length);

  printMetricsTable('1) By format', byFormat);
  printMetricsTable('2) By band', byBand);

  console.log('\n3) Share bucket (all formats)');
  const bucketOrder = ['0.00-0.03', '0.03-0.05', '0.05-0.07', '0.07-0.09', '0.09-0.11', '0.11+'];
  for (const b of bucketOrder) {
    const m = sharePart.byShareBucket[b];
    if (!m) continue;
    console.log(
      '  ' +
        b +
        ' · n=' +
        m.rowCount +
        ' · avg cashΔ ' +
        Math.round(m.avgCashDelta) +
        ' · avg EBITDA ' +
        Math.round(m.avgTotalEbitda) +
        ' · margin ' +
        (m.avgEbitdaMargin != null ? (m.avgEbitdaMargin * 100).toFixed(1) + '%' : 'n/a') +
        ' · +cash% ' +
        m.pctPositiveCashDelta.toFixed(0) +
        ' · +ebitda% ' +
        m.pctPositiveEbitda.toFixed(0)
    );
  }

  console.log('\n  (detail: byShareBucketByFormat in JSON)');

  console.log('\n4) Top single-station rows by cashΔ (first ' + consoleTop + ')');
  topRows.slice(0, consoleTop).forEach((r, i) => {
    console.log(
      String(i + 1).padStart(2) +
        '. ' +
        r.seed +
        ' · ' +
        r.year +
        ' P' +
        r.period +
        ' · ' +
        r.format +
        ' · ' +
        r.band +
        ' · topSh ' +
        (r.topShare * 100).toFixed(2) +
        '% · cashΔ ' +
        Math.round(r.cashDelta) +
        ' · rev ' +
        Math.round(r.totalRev) +
        ' · ebitda ' +
        Math.round(r.totalEbitda) +
        (r.ebitdaMargin != null ? ' · m ' + (r.ebitdaMargin * 100).toFixed(1) + '%' : '') +
        ' · AI ' +
        r.ai_counterPromo +
        '/' +
        r.ai_reformats +
        '/' +
        r.ai_poach +
        ' · ref/bump ' +
        (r.reformats_json?.length || 0) +
        '/' +
        (r.promoProgBumps_json?.length || 0)
    );
  });

  console.log('\n5) Risk / interpretation');
  riskLines.forEach((line) => console.log('  · ' + line));

  console.log('\n6) Opening streaks (TOP40 · AM · pure-op · ordered diary from 1970)');
  console.log(
    '  Seeds with ≥3 consecutive positive periods from first row — cashΔ: ' +
      seedsStreak3PlusCash +
      ' / ' +
      streakBySeed.length +
      ' · EBITDA>0: ' +
      seedsStreak3PlusEbitda +
      ' / ' +
      streakBySeed.length
  );
  streakBySeed.forEach((s) => {
    console.log(
      '  seed ' +
        s.seed +
        ' · cash  streakFromStart=' +
        s.streakFromStart_cash +
        ' max=' +
        s.maxStreak_cash +
        ' · ebitda streakFromStart=' +
        s.streakFromStart_ebitda +
        ' max=' +
        s.maxStreak_ebitda +
        ' · advTurn streakFromStart=' +
        s.streakFromStart_advTurn +
        ' max=' +
        s.maxStreak_advTurn +
        ' · periods=' +
        s.periodCount
    );
    if (s.first6 && s.first6.length) {
      console.log(
        '    first halves (cash / EBITDA / advTurn): ' +
          s.first6
            .map((x) => {
              const c = (x.cashD || 0) > 0 ? '+' : '≤0';
              const e = (x.ebitda || 0) > 0 ? '+' : '≤0';
              const a = (x.advTurnD || 0) > 0 ? '+' : '≤0';
              return x.y + 'P' + x.p + ':c' + c + '/e' + e + '/a' + a + ' sh~' + ((x.sh || 0) * 100).toFixed(1) + '%';
            })
            .join(' | ')
      );
    }
  });

  if (band69 && band69.rowCount) {
    console.log('\n7) TOP40 · AM · share 6–9% (all pure-op single-station rows)');
    console.log(
      '  n=' +
        band69.rowCount +
        ' · +cash% ' +
        band69.pctPositiveCashDelta.toFixed(0) +
        ' · avg margin ' +
        (band69.avgEbitdaMargin != null ? (band69.avgEbitdaMargin * 100).toFixed(1) + '%' : 'n/a')
    );
  } else {
    console.log('\n7) TOP40 · AM · share 6–9%: (no rows)');
  }

  console.log('\nWrote ' + outPath);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
