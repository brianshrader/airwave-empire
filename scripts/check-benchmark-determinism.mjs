#!/usr/bin/env node
/**
 * Repeatability check: same inspect URL twice in one Playwright session; compare diary signatures.
 *
 *   npm run build && node scripts/check-benchmark-determinism.mjs
 *
 * Env:
 *   DET_PORT=4191
 *   DET_SEED=505050
 *   DET_END_YEAR=1985
 *   DET_SCEN=under
 *   DET_MARKET=atlanta
 *   DET_POLICY=aggressive   (or conservative)
 *   DET_EASY=0  DET_PASSIVE=0
 */
/* eslint-disable no-console */

import { spawn } from 'child_process';
import http from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { assertPortFreeForPreview, logPreviewEarlyExit } from './benchmark-trace-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PORT = parseInt(process.env.DET_PORT || process.env.EARLY_PORT || '4191', 10);
const seed = parseInt(process.env.DET_SEED || '505050', 10);
const endYear = Math.max(1972, Math.min(2030, parseInt(process.env.DET_END_YEAR || '1985', 10)));
const scen = /^[a-z0-9_]+$/i.test(process.env.DET_SCEN || '') ? process.env.DET_SCEN : 'under';
const market = /^[a-z0-9_]+$/i.test(process.env.DET_MARKET || '') ? process.env.DET_MARKET : 'atlanta';
const policy =
  (process.env.DET_POLICY || 'aggressive').toLowerCase() === 'conservative' ? 'conservative' : 'aggressive';
const easy = process.env.DET_EASY === '1' || process.env.DET_EASY === 'true';
const passive = process.env.DET_PASSIVE === '1' || process.env.DET_PASSIVE === 'true';

function inspectUrl() {
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

function diarySignature(out) {
  const d = out && out.diary ? out.diary : [];
  const first = d[0];
  const last = d[d.length - 1];
  const rowKey = (r) =>
    r
      ? `${r.step}|${r.year}|${r.period}|${Math.round(r.cashEnd || 0)}|${Math.round(r.cashDelta || 0)}|${r.nStations}|${r.topShare}`
      : '';
  let sumCashDelta = 0;
  let sumEbitda = 0;
  let posCash = 0;
  for (const r of d) {
    sumCashDelta += r.cashDelta || 0;
    sumEbitda += r.totalEbitda || 0;
    if ((r.cashDelta || 0) > 0) posCash++;
  }
  const s = out && out.summary ? out.summary : {};
  return {
    diaryLen: d.length,
    firstRow: rowKey(first),
    lastRow: rowKey(last),
    sumCashDeltaRounded: Math.round(sumCashDelta),
    sumEbitdaRounded: Math.round(sumEbitda),
    positiveCashPeriods: posCash,
    lastOperatingStep: s.lastPeriodWithStations ? s.lastPeriodWithStations.step : null,
  };
}

function sigEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function runOnce(page) {
  const url = `http://127.0.0.1:${PORT}${inspectUrl()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__SNOWBALL_TRACE_DONE__ === true, null, { timeout: 600000 });
  const err = await page.evaluate(() => window.__SNOWBALL_TRACE_ERROR__);
  if (err) throw new Error(err);
  return page.evaluate(() => window.__SNOWBALL_TRACE_JSON__);
}

async function main() {
  await assertPortFreeForPreview(PORT, 'DET_PORT / EARLY_PORT');

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
    const context = await browser.newContext();
    const page = await context.newPage();

    const a = diarySignature(await runOnce(page));
    const b = diarySignature(await runOnce(page));

    await browser.close();

    const match = sigEqual(a, b);
    console.log('Benchmark determinism check (two navigations, same URL)');
    console.log('  URL seed:', seed, 'endYear:', endYear, scen, market, policy, easy ? 'EASY' : 'HARD', passive ? 'passive' : 'bot');
    console.log('  Run A:', JSON.stringify(a));
    console.log('  Run B:', JSON.stringify(b));
    console.log(match ? 'RESULT: signatures MATCH' : 'RESULT: signatures DIFFER (still drifting)');
    process.exit(match ? 0 : 1);
  } finally {
    if (preview && !preview.killed) preview.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
