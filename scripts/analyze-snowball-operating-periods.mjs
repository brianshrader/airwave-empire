#!/usr/bin/env node
/**
 * Collect snowball traces for multiple seeds, then analyze operating periods only.
 *
 *   npm run analyze:snowball-ops
 *
 * Env:
 *   OPS_SEEDS=505050,717171,919191
 *   OPS_TOP_N=25          rows in JSON topRows
 *   OPS_CONSOLE_TOP=10    print first N in console
 *   OPS_REQUIRE_CLUSTER=0   set 1 to require clusterShare > 0
 *   OPS_END_YEAR=2026
 *   OPS_SCEN=under
 *   OPS_MARKET=atlanta
 *   OPS_POLICY=aggressive
 *   OPS_EASY=0            set 1 for EASY AI
 *   OPS_PASSIVE=0         set 1 for no bot
 *   OPS_SUSPICIOUS_CASH=150000
 *   OPS_PORT=4191
 *   OPS_PURE_REQUIRE_BRIDGE=1   if 0, treat missing cashBridge as no pressure (not recommended)
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
  const raw = process.env.OPS_SEEDS || '505050,717171,919191';
  return raw
    .split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 0);
}

const seeds = parseSeeds();
const topN = Math.max(1, Math.min(500, parseInt(process.env.OPS_TOP_N || '25', 10)));
const consoleTop = Math.max(1, Math.min(topN, parseInt(process.env.OPS_CONSOLE_TOP || '10', 10)));
const requireCluster = process.env.OPS_REQUIRE_CLUSTER === '1' || process.env.OPS_REQUIRE_CLUSTER === 'true';
const endYear = Math.max(1972, Math.min(2030, parseInt(process.env.OPS_END_YEAR || '2026', 10)));
const scen = /^[a-z0-9_]+$/i.test(process.env.OPS_SCEN || '') ? process.env.OPS_SCEN : 'under';
const market = /^[a-z0-9_]+$/i.test(process.env.OPS_MARKET || '') ? process.env.OPS_MARKET : 'atlanta';
const policy = (process.env.OPS_POLICY || 'aggressive').toLowerCase() === 'conservative' ? 'conservative' : 'aggressive';
const easy = process.env.OPS_EASY === '1' || process.env.OPS_EASY === 'true';
const passive = process.env.OPS_PASSIVE === '1' || process.env.OPS_PASSIVE === 'true';
const suspiciousCashFloor = Math.max(0, parseInt(process.env.OPS_SUSPICIOUS_CASH || '150000', 10));
const PORT = parseInt(process.env.OPS_PORT || process.env.TRACE_PORT || '4191', 10);
const pureRequireBridge = process.env.OPS_PURE_REQUIRE_BRIDGE !== '0' && process.env.OPS_PURE_REQUIRE_BRIDGE !== 'false';

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
    endYear: String(endYear),
    scen,
    market,
    seed: String(seed),
    policy,
  });
  if (easy) qs.set('easy', '1');
  if (passive) qs.set('passive', '1');
  return '/inspect-market-snowball.html?' + qs.toString();
}

function isOperatingRow(r) {
  if (!r || r.nStations < 1) return false;
  if ((r.totalRev || 0) <= 0) return false;
  if (r.soloBankrupt) return false;
  if (requireCluster && (!(r.clusterShare > 0))) return false;
  return true;
}

/** Operating period with no distress / pressure cash (advTurn pressure_net_cash_delta must be 0). */
function pressureDeltaFromRawDiaryRow(r) {
  if (r.pressureNetCashDelta != null && Number.isFinite(r.pressureNetCashDelta)) return r.pressureNetCashDelta;
  const b = r.cashBridge;
  if (b && typeof b.pressure_net_cash_delta === 'number') return b.pressure_net_cash_delta;
  if (b && b.pressure_net_cash_delta != null) return Number(b.pressure_net_cash_delta) || 0;
  return null;
}

function isPureOperatingRaw(r) {
  if (!isOperatingRow(r)) return false;
  const p = pressureDeltaFromRawDiaryRow(r);
  if (p == null) return !pureRequireBridge;
  return !(p > 0);
}

function isPureOperatingSerial(sr) {
  if (!sr || sr.nStations < 1) return false;
  if ((sr.totalRev || 0) <= 0) return false;
  const p = sr.pressureNetCashDelta != null ? sr.pressureNetCashDelta : pressureDeltaFromSerial(sr);
  if (p == null) return !pureRequireBridge;
  return !(p > 0);
}

function pressureDeltaFromSerial(sr) {
  if (sr.pressureNetCashDelta != null && Number.isFinite(sr.pressureNetCashDelta)) return sr.pressureNetCashDelta;
  const b = sr.cashBridge;
  if (b && b.pressure_net_cash_delta != null) return Number(b.pressure_net_cash_delta) || 0;
  return null;
}

function serialRow(r, seed) {
  const a = r.actions || {};
  const ai = r.aiDelta || {};
  const br = r.cashBridge || null;
  const pRaw = r.pressureNetCashDelta != null ? r.pressureNetCashDelta : pressureDeltaFromRawDiaryRow(r);
  const hasP = !!(pRaw != null && pRaw > 0);
  return {
    seed,
    year: r.year,
    period: r.period,
    step: r.step,
    cashStart: r.cashStart,
    cashDelta: r.cashDelta,
    cashEnd: r.cashEnd,
    cashAfterBot: r.cashAfterBot,
    botCashDelta: r.botCashDelta,
    advTurnCashDelta: r.advTurnCashDelta,
    traceAdvTurnCashStartVsBridge: r.traceAdvTurnCashStartVsBridge,
    traceFullPeriodResidual: r.traceFullPeriodResidual,
    pressureNetCashDelta: pRaw != null ? pRaw : null,
    hasPressureCash: r.hasPressureCash != null ? r.hasPressureCash : hasP,
    distressSaleCashThisPeriod: r.distressSaleCashThisPeriod != null ? r.distressSaleCashThisPeriod : hasP,
    cashBridge: br,
    nStations: r.nStations,
    clusterShare: r.clusterShare,
    topShare: r.topShare,
    nTop10: r.nTop10,
    nTop5: r.nTop5,
    acquisitions_json: a.acquisitions || [],
    reformats_json: a.reformats || [],
    promoProgBumps_json: a.promoProgBumps || [],
    totalRev: r.totalRev,
    totalEbitda: r.totalEbitda,
    ai_counterPromo: ai.counterPromoVsPlayer,
    ai_reformats: ai.rivalReformatsTotal,
    ai_poach: ai.poachPlayerAttempts,
  };
}

function firstClusterAtLeast(diary, threshold, rowPredicate) {
  const pred = rowPredicate || (() => true);
  for (const r of diary) {
    if (!pred(r)) continue;
    if ((r.clusterShare || 0) >= threshold) {
      return { year: r.year, period: r.period, step: r.step, clusterShare: r.clusterShare };
    }
  }
  return null;
}

function firstSustainedPositiveCash(diary, need = 3, rowPredicate) {
  const pred = rowPredicate || (() => true);
  for (let i = 0; i <= diary.length - need; i++) {
    let ok = true;
    for (let j = 0; j < need; j++) {
      const row = diary[i + j];
      if (!pred(row) || !((row.cashDelta || 0) > 0)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return {
        startYear: diary[i].year,
        startPeriod: diary[i].period,
        startStep: diary[i].step,
      };
    }
  }
  return null;
}

function firstTopShareAtLeast(diary, threshold, rowPredicate) {
  const pred = rowPredicate || (() => true);
  for (const r of diary) {
    if (!pred(r)) continue;
    if ((r.topShare || 0) >= threshold) {
      return { year: r.year, period: r.period, step: r.step, topShare: r.topShare };
    }
  }
  return null;
}

function analyzeTopRows(rows) {
  if (!rows.length) {
    return {
      count: 0,
      avgNStations: null,
      avgClusterShare: null,
      avgTopShare: null,
      pctWithAcquisitions: null,
      pctWithReformats: null,
      pctWithPromoBumps: null,
      avgEbitdaMargin: null,
      avgAiCounterPromo: null,
      avgAiReformats: null,
      avgAiPoach: null,
    };
  }
  const n = rows.length;
  let sumSt = 0;
  let sumCl = 0;
  let sumTop = 0;
  let acq = 0;
  let ref = 0;
  let bump = 0;
  let sumMargin = 0;
  let marginCount = 0;
  let sumCp = 0;
  let sumRf = 0;
  let sumPo = 0;
  const formatAcq = {};
  for (const row of rows) {
    sumSt += row.nStations;
    sumCl += row.clusterShare || 0;
    sumTop += row.topShare || 0;
    if (row.acquisitions_json && row.acquisitions_json.length) {
      acq++;
      for (const x of row.acquisitions_json) {
        const f = x.format || 'UNK';
        formatAcq[f] = (formatAcq[f] || 0) + 1;
      }
    }
    if (row.reformats_json && row.reformats_json.length) ref++;
    if (row.promoProgBumps_json && row.promoProgBumps_json.length) bump++;
    const rev = row.totalRev || 0;
    const eb = row.totalEbitda || 0;
    if (rev > 0) {
      sumMargin += eb / rev;
      marginCount++;
    }
    sumCp += row.ai_counterPromo || 0;
    sumRf += row.ai_reformats || 0;
    sumPo += row.ai_poach || 0;
  }
  return {
    count: n,
    avgNStations: sumSt / n,
    avgClusterShare: sumCl / n,
    avgTopShare: sumTop / n,
    pctWithAcquisitions: (acq / n) * 100,
    pctWithReformats: (ref / n) * 100,
    pctWithPromoBumps: (bump / n) * 100,
    avgEbitdaMargin: marginCount ? sumMargin / marginCount : null,
    avgAiCounterPromo: sumCp / n,
    avgAiReformats: sumRf / n,
    avgAiPoach: sumPo / n,
    acquisitionFormatsInTop: formatAcq,
  };
}

function cashBridgeHighlights(sr) {
  const b = sr.cashBridge;
  if (!b || typeof b !== 'object') return null;
  return {
    early_pipeline_cash_delta: b.early_pipeline_cash_delta,
    lma_net: b.lma_net,
    loan_interest_cash_out: b.loan_interest_cash_out ?? b.loan_interest,
    pressure_net_cash_delta: b.pressure_net_cash_delta,
    debt_principal_delta: b.debt_principal_delta,
  };
}

function enrichPureTopRow(sr) {
  const rev = sr.totalRev || 0;
  return {
    ...sr,
    ebitdaMargin: rev > 0 ? sr.totalEbitda / rev : null,
    cashBridgeHighlights: cashBridgeHighlights(sr),
  };
}

function buildPureConclusion(aggregates, topRows) {
  if (!topRows.length || !aggregates.count) {
    return 'No pure-operating rows met filters (check cash bridge / OPS_PURE_REQUIRE_BRIDGE).';
  }
  const lines = [];
  const st = aggregates.avgNStations;
  const cl = aggregates.avgClusterShare;
  const acq = aggregates.pctWithAcquisitions;
  const margin = aggregates.avgEbitdaMargin;
  lines.push(
    `Top ${aggregates.count} pure-op cash-growth rows average ~${st.toFixed(2)} stations, ~${(cl * 100).toFixed(1)}% cluster share, ~${((aggregates.avgTopShare || 0) * 100).toFixed(1)}% top share.`
  );
  lines.push(
    acq < 1
      ? 'Acquisitions are effectively absent from this set — largest organic cash jumps are not “buy the market” timing in these seeds.'
      : `${acq.toFixed(0)}% of top pure-op rows include an acquisition — still check formats and margins before inferring a scale story.`
  );
  lines.push(
    margin != null
      ? `Mean EBITDA margin (EBITDA/rev) in this top slice is ~${(margin * 100).toFixed(1)}% — format/revenue efficiency dominates the “operating” story more than cluster % in this sample.`
      : 'EBITDA margin could not be averaged (missing rev).'
  );
  lines.push(
    st < 1.5
      ? 'Compounding signals in pure-op rows still sit in the single-station / low-cluster band: “takeoff” in cash terms is not waiting on multi-station share in this trace.'
      : 'Several stations appear in some top rows — cluster scale plays a role for part of the slice.'
  );
  lines.push(
    'Lever to investigate next: early-station revenue vs cost (margin), then format choices; cluster thresholds matter less in this pure-op top list than operating margin.'
  );
  return lines.join(' ');
}

function findSuspicious(validRowsAllSeeds, topRows) {
  const suspicious = [];
  const seen = new Set();
  function key(r) {
    return `${r.seed}|${r.year}|${r.period}|${r.step}`;
  }
  const pool = [...topRows, ...validRowsAllSeeds];
  for (const row of pool) {
    const k = key(row);
    if (seen.has(k)) continue;
    seen.add(k);
    const cd = row.cashDelta || 0;
    const eb = row.totalEbitda || 0;
    const rev = row.totalRev || 0;
    const hasAcq = row.acquisitions_json && row.acquisitions_json.length;
    const hasRef = row.reformats_json && row.reformats_json.length;
    const hasBump = row.promoProgBumps_json && row.promoProgBumps_json.length;
    const reasons = [];
    if (rev > 0 && eb > 0 && cd > eb * 1.5) reasons.push('cashDelta_gt_1.5x_ebitda');
    if (eb <= 0 && cd > suspiciousCashFloor) reasons.push('positive_cash_large_but_nonpositive_ebitda');
    if (cd >= suspiciousCashFloor && !hasAcq && !hasRef && !hasBump) reasons.push('large_cash_no_visible_bot_actions');
    if (reasons.length) {
      suspicious.push({ ...row, reasons });
    }
  }
  return suspicious;
}

async function fetchTraces() {
  await assertPortFreeForPreview(PORT, 'OPS_PORT / TRACE_PORT');
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
    'Snowball operating-period analysis\n  seeds: ' +
      seeds.join(', ') +
      '\n  filter: nStations>=1, totalRev>0, !soloBankrupt' +
      (requireCluster ? ', clusterShare>0' : '') +
      '\n  scenario: ' +
      scen +
      ' · ' +
      market +
      ' · ' +
      (easy ? 'EASY' : 'HARD') +
      ' · policy ' +
      policy +
      (passive ? ' · passive' : '') +
      '\n'
  );

  const runs = await fetchTraces();
  const validAll = [];
  const pureValidAll = [];
  const timelines = [];
  const pureTimelines = [];

  for (const { seed, out } of runs) {
    const diary = out.diary || [];
    const valid = diary.filter(isOperatingRow).map((r) => serialRow(r, seed));
    valid.forEach((r) => validAll.push(r));
    const pureValid = valid.filter(isPureOperatingSerial);
    pureValid.forEach((r) => pureValidAll.push(r));

    timelines.push({
      seed,
      clusterGte0_10: firstClusterAtLeast(diary, 0.1),
      clusterGte0_15: firstClusterAtLeast(diary, 0.15),
      sustainedPositiveCash3: firstSustainedPositiveCash(diary, 3),
      periodsLogged: diary.length,
      operatingRows: valid.length,
    });

    pureTimelines.push({
      seed,
      clusterGte0_10_pureOp: firstClusterAtLeast(diary, 0.1, isPureOperatingRaw),
      clusterGte0_15_pureOp: firstClusterAtLeast(diary, 0.15, isPureOperatingRaw),
      sustainedPositiveCash3_pureOp: firstSustainedPositiveCash(diary, 3, isPureOperatingRaw),
      topShareGte0_08_pureOp: firstTopShareAtLeast(diary, 0.08, isPureOperatingRaw),
      topShareGte0_10_pureOp: firstTopShareAtLeast(diary, 0.1, isPureOperatingRaw),
      periodsLogged: diary.length,
      pureOperatingRows: diary.filter(isPureOperatingRaw).length,
      operatingRows: valid.length,
    });
  }

  const sorted = [...validAll].sort((a, b) => (b.cashDelta || 0) - (a.cashDelta || 0));
  const topRows = sorted.slice(0, topN);
  const aggregates = analyzeTopRows(topRows);
  const suspiciousRows = findSuspicious(validAll, topRows);

  const sortedPure = [...pureValidAll].sort((a, b) => (b.cashDelta || 0) - (a.cashDelta || 0));
  const pureTopRows = sortedPure.slice(0, topN).map(enrichPureTopRow);
  const pureAggregates = analyzeTopRows(sortedPure.slice(0, topN));
  const pureConclusion = buildPureConclusion(pureAggregates, pureTopRows);

  const payload = {
    generated: new Date().toISOString(),
    config: {
      seeds,
      endYear,
      scen,
      market,
      difficulty: easy ? 'EASY' : 'HARD',
      playerPolicy: passive ? 'passive' : policy,
      filter: {
        nStationsGte1: true,
        totalRevGt0: true,
        notSoloBankrupt: true,
        clusterShareGt0: requireCluster,
      },
      topN,
    },
    topRows,
    aggregates,
    timelines,
    suspiciousRows,
    stats: {
      totalOperatingRowsAcrossSeeds: validAll.length,
      totalPureOperatingRowsAcrossSeeds: pureValidAll.length,
    },
  };

  const purePayload = {
    generated: new Date().toISOString(),
    config: {
      seeds,
      endYear,
      scen,
      market,
      difficulty: easy ? 'EASY' : 'HARD',
      playerPolicy: passive ? 'passive' : policy,
      filter: {
        nStationsGte1: true,
        totalRevGt0: true,
        notSoloBankrupt: true,
        clusterShareGt0: requireCluster,
        pressureNetCashDeltaEq0: true,
        noDistressSaleCash: true,
        pureRequireBridge,
      },
      topN,
    },
    topRows: pureTopRows,
    aggregates: pureAggregates,
    timelines: pureTimelines,
    conclusion: pureConclusion,
    stats: {
      totalPureOperatingRowsAcrossSeeds: pureValidAll.length,
    },
  };

  const outPath = join(outDir, 'snowball-operating-analysis.json');
  const pureOutPath = join(outDir, 'snowball-pure-operating-analysis.json');
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  writeFileSync(pureOutPath, JSON.stringify(purePayload, null, 2), 'utf8');

  function bridgeOneLiner(r) {
    const b = r.cashBridge;
    if (!b || typeof b !== 'object') return '  (no cashBridge on row — legacy build?)';
    const parts = [
      'cashAdvStart ' + Math.round(b.cash_before_advance || 0),
      'earlyPipeΔ ' + Math.round(b.early_pipeline_cash_delta || 0),
      'lmaNet ' + Math.round(b.lma_net || 0),
      'ebitdaCred ' + Math.round(b.total_station_ebitda || 0),
      'intOut ' + Math.round(b.loan_interest_cash_out || b.loan_interest || 0),
      'pressureΔ ' + Math.round(b.pressure_net_cash_delta || 0),
      'cashAfter ' + Math.round(b.cash_after_all_rollover_steps || 0),
      'bridgeRes ' + Math.round(b.cash_bridge_residual != null ? b.cash_bridge_residual : b.delta || 0),
      'debtΔ ' + Math.round(b.debt_principal_delta || 0),
    ];
    return '  ' + parts.join(' · ');
  }

  function bridgeHighlightsOneLine(h) {
    if (!h || typeof h !== 'object') return '';
    return (
      'bridge: earlyPipe ' +
      Math.round(h.early_pipeline_cash_delta || 0) +
      ' · lma ' +
      Math.round(h.lma_net || 0) +
      ' · int ' +
      Math.round(h.loan_interest_cash_out || 0) +
      ' · press ' +
      Math.round(h.pressure_net_cash_delta || 0) +
      ' · debtΔ ' +
      Math.round(h.debt_principal_delta || 0)
    );
  }

  console.log('\n════════ PURE OPERATING GROWTH (excludes distress / pressure cash) ════════');
  console.log(
    'Filter: operating rows + pressure_net_cash_delta === 0 · pureRequireBridge=' +
      pureRequireBridge +
      ' · pure-op rows (all seeds): ' +
      pureValidAll.length
  );

  console.log('\n1) Top pure operating growth periods (first ' + consoleTop + ')');
  if (!pureTopRows.length) console.log('  (none)');
  else {
    pureTopRows.slice(0, consoleTop).forEach((r, i) => {
      const rev = r.totalRev || 0;
      const m = rev > 0 ? r.totalEbitda / rev : null;
      console.log(
        String(i + 1).padStart(2) +
          '. seed ' +
          r.seed +
          ' · ' +
          r.year +
          ' P' +
          r.period +
          ' · cashΔ ' +
          Math.round(r.cashDelta) +
          ' · cashEnd ' +
          Math.round(r.cashEnd) +
          ' · nSt ' +
          r.nStations +
          ' · clus ' +
          r.clusterShare +
          ' · topSh ' +
          r.topShare +
          ' · nTop10/nTop5 ' +
          r.nTop10 +
          '/' +
          r.nTop5 +
          ' · rev ' +
          Math.round(r.totalRev) +
          ' · ebitda ' +
          Math.round(r.totalEbitda) +
          (m != null ? ' · margin ' + (m * 100).toFixed(1) + '%' : '') +
          ' · acq/ref/bump ' +
          (r.acquisitions_json?.length || 0) +
          '/' +
          (r.reformats_json?.length || 0) +
          '/' +
          (r.promoProgBumps_json?.length || 0) +
          ' · AI cp/rf/po ' +
          r.ai_counterPromo +
          '/' +
          r.ai_reformats +
          '/' +
          r.ai_poach
      );
      const hl = bridgeHighlightsOneLine(r.cashBridgeHighlights);
      if (hl) console.log('    ' + hl);
    });
  }

  console.log('\n2) Aggregate patterns (top ' + topN + ' pure-op rows by cashΔ)');
  console.log(JSON.stringify(pureAggregates, null, 2));

  console.log('\n3) Per-seed pure-op timeline');
  for (const t of pureTimelines) {
    console.log('Seed ' + t.seed + ':');
    console.log('  pure-op rows: ' + t.pureOperatingRows + ' (of ' + t.operatingRows + ' operating)');
    console.log('  cluster ≥ 0.10 (pure): ' + (t.clusterGte0_10_pureOp ? JSON.stringify(t.clusterGte0_10_pureOp) : 'never'));
    console.log('  cluster ≥ 0.15 (pure): ' + (t.clusterGte0_15_pureOp ? JSON.stringify(t.clusterGte0_15_pureOp) : 'never'));
    console.log('  3+ consecutive pure-op cashΔ>0: ' + (t.sustainedPositiveCash3_pureOp ? JSON.stringify(t.sustainedPositiveCash3_pureOp) : 'never'));
    console.log('  topShare ≥ 0.08 (pure): ' + (t.topShareGte0_08_pureOp ? JSON.stringify(t.topShareGte0_08_pureOp) : 'never'));
    console.log('  topShare ≥ 0.10 (pure): ' + (t.topShareGte0_10_pureOp ? JSON.stringify(t.topShareGte0_10_pureOp) : 'never'));
  }

  console.log('\n4) Conclusion (pure operating growth)');
  console.log(pureConclusion);

  console.log('\n──────── Baseline: all operating rows (may include distress-sale cash) ────────');

  console.log('\nB1) Top growth periods (operating only), first ' + consoleTop);
  topRows.slice(0, consoleTop).forEach((r, i) => {
    console.log(
      String(i + 1).padStart(2) +
        '. seed ' +
        r.seed +
        ' · ' +
        r.year +
        ' P' +
        r.period +
        ' · cashΔ ' +
        Math.round(r.cashDelta) +
        ' · cashEnd ' +
        Math.round(r.cashEnd) +
        ' · nSt ' +
        r.nStations +
        ' · clus ' +
        r.clusterShare +
        ' · topSh ' +
        r.topShare +
        ' · rev ' +
        Math.round(r.totalRev) +
        ' · ebitda ' +
        Math.round(r.totalEbitda) +
        ' · acq ' +
        (r.acquisitions_json?.length || 0) +
        ' ref ' +
        (r.reformats_json?.length || 0) +
        ' bump ' +
        (r.promoProgBumps_json?.length || 0) +
        ' · AI cp/rf/po ' +
        r.ai_counterPromo +
        '/' +
        r.ai_reformats +
        '/' +
        r.ai_poach
    );
  });

  console.log('\nB2) Aggregate patterns (top ' + topN + ' operating rows by cashΔ)');
  console.log(JSON.stringify(aggregates, null, 2));

  console.log('\nB3) Per-seed growth timeline (all operating)');
  for (const t of timelines) {
    console.log('Seed ' + t.seed + ':');
    console.log('  cluster ≥ 0.10: ' + (t.clusterGte0_10 ? JSON.stringify(t.clusterGte0_10) : 'never'));
    console.log('  cluster ≥ 0.15: ' + (t.clusterGte0_15 ? JSON.stringify(t.clusterGte0_15) : 'never'));
    console.log('  3+ consecutive cashΔ>0: ' + (t.sustainedPositiveCash3 ? JSON.stringify(t.sustainedPositiveCash3) : 'never'));
    console.log('  diary rows: ' + t.periodsLogged + ' · operating rows: ' + t.operatingRows);
  }

  console.log('\nB4) Suspicious rows (deduped)');
  if (!suspiciousRows.length) console.log('  (none)');
  else {
    suspiciousRows.slice(0, 15).forEach((r, i) => {
      console.log(
        '  ' +
          (i + 1) +
          '. seed ' +
          r.seed +
          ' ' +
          r.year +
          ' P' +
          r.period +
          ' · cashΔ ' +
          Math.round(r.cashDelta) +
          ' · ebitda ' +
          Math.round(r.totalEbitda) +
          ' · ' +
          r.reasons.join(', ')
      );
    });
    if (suspiciousRows.length > 15) console.log('  … +' + (suspiciousRows.length - 15) + ' more in JSON');
  }

  console.log('\nB5) Cash bridge (advTurn) — suspicious rows, first 5');
  const sus5 = suspiciousRows.slice(0, 5);
  if (!sus5.length) console.log('  (none)');
  else {
    for (const r of sus5) {
      console.log(
        '  seed ' + r.seed + ' · ' + r.year + ' P' + r.period + ' · botΔ ' + Math.round(r.botCashDelta || 0) + ' · advTurnΔ ' + Math.round(r.advTurnCashDelta || 0)
      );
      console.log(bridgeOneLiner(r));
    }
  }

  console.log('\nWrote ' + outPath);
  console.log('Wrote ' + pureOutPath);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
