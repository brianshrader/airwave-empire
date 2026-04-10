#!/usr/bin/env node
/**
 * Multi-seed format-ecology rollup (headless). One preview server, several seeds.
 *
 *   npm run sim:format-ecology:batch
 *
 * Env:
 *   FORMAT_ECOLOGY_PATH  — base path+query (default: quick + newyork,chicago,atlanta)
 *   FORMAT_ECOLOGY_SEEDS — comma-separated integers (default: 5 seeds)
 *
 * Requires: npm run build, playwright, Chromium.
 */
/* eslint-disable no-console */

import { spawn } from 'child_process';
import http from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = 4175;

const DEFAULT_BASE =
  process.env.FORMAT_ECOLOGY_PATH ||
  '/inspect-format-ecology.html?quick=1&markets=newyork,chicago,atlanta';

const DEFAULT_SEEDS = [20260406, 20260407, 20260408, 20260409, 20260410];

function parseSeeds() {
  const raw = process.env.FORMAT_ECOLOGY_SEEDS;
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }
  return DEFAULT_SEEDS;
}

function pathWithSeed(base, seed) {
  const rel = base.startsWith('/') ? base : '/' + base;
  const u = new URL(rel, 'http://127.0.0.1');
  u.searchParams.set('seed', String(seed));
  return u.pathname + u.search;
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
        if (Date.now() - t0 > maxMs) {
          return reject(new Error('Timed out waiting for http://127.0.0.1:' + PORT + path));
        }
        setTimeout(tryOnce, 300);
      }
    }
    tryOnce();
  });
}

function bucketStats(bmd, market, decade, bucket) {
  const key = `${market}|${decade}`;
  const block = bmd[key];
  if (!block || !block.buckets || !block.buckets[bucket]) {
    return { st: NaN, sh: NaN, weak: NaN, healthy: NaN };
  }
  const b = block.buckets[bucket];
  const h = b.health || {};
  return {
    st: b.meanStationCount,
    sh: (b.meanShare || 0) * 100,
    weak: h.weak != null ? h.weak : NaN,
    healthy: h.healthy != null ? h.healthy : NaN,
  };
}

function fmt(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return typeof n === 'number' ? n.toFixed(d) : String(n);
}

async function main() {
  const seeds = parseSeeds();
  if (!seeds.length) {
    console.error('No seeds — set FORMAT_ECOLOGY_SEEDS or use defaults.');
    process.exitCode = 1;
    return;
  }

  let preview;
  try {
    const { chromium } = await import('playwright');
    const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
    preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
      cwd: root,
      stdio: 'inherit',
    });

    await waitForOk('/', 120000);

    const browser = await chromium.launch();
    const page = await browser.newPage();

    function colPair(st, wk, w = 13) {
      return `${fmt(st, 2)}/${fmt(wk, 2)}`.padEnd(w);
    }
    function colRock(st, hl, w = 13) {
      return `${fmt(st, 2)}/${fmt(hl, 2)}`.padEnd(w);
    }

    const rows = [];
    for (const seed of seeds) {
      const path = pathWithSeed(DEFAULT_BASE, seed);
      await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.__FORMAT_ECOLOGY_SIM_DONE__ === true, null, { timeout: 420000 });
      const err = await page.evaluate(() => window.__FORMAT_ECOLOGY_SIM_ERROR__);
      if (err) {
        console.error(`seed ${seed} error:`, err);
        process.exitCode = 1;
        continue;
      }
      const res = await page.evaluate(() => window.__FORMAT_ECOLOGY_RESULT__);
      const bmd = (res && res.byMarketDecade) || {};

      const ny80t = bucketStats(bmd, 'newyork', '1980s', 'top40_pop');
      const ny10n = bucketStats(bmd, 'newyork', '2010s', 'news_talk');
      const chi80n = bucketStats(bmd, 'chicago', '1980s', 'news_talk');
      const chi90n = bucketStats(bmd, 'chicago', '1990s', 'news_talk');
      const ny80r = bucketStats(bmd, 'newyork', '1980s', 'rock_alt');

      rows.push({
        seed,
        ny80t_st: ny80t.st,
        ny80t_wk: ny80t.weak,
        ny10n_st: ny10n.st,
        ny10n_wk: ny10n.weak,
        chi80n_st: chi80n.st,
        chi80n_wk: chi80n.weak,
        chi90n_st: chi90n.st,
        chi90n_wk: chi90n.weak,
        ny80r_st: ny80r.st,
        ny80r_hl: ny80r.healthy,
      });
    }

    await browser.close();

    function avg(arr) {
      const v = arr.filter((x) => !Number.isNaN(x));
      if (!v.length) return NaN;
      return v.reduce((a, b) => a + b, 0) / v.length;
    }

    console.log('');
    console.log('Format ecology batch — base:', DEFAULT_BASE);
    console.log('Seeds:', seeds.join(', '));
    console.log('');
    const hdr =
      'seed      NY80_t40(s/w) NY10_NT(s/w) CHI80_NT(s/w) CHI90_NT(s/w) NY80_rock(s/hl)';
    console.log(hdr);
    console.log('-'.repeat(hdr.length));
    for (const r of rows) {
      console.log(
        `${String(r.seed).padEnd(9)}` +
          colPair(r.ny80t_st, r.ny80t_wk) +
          colPair(r.ny10n_st, r.ny10n_wk) +
          colPair(r.chi80n_st, r.chi80n_wk) +
          colPair(r.chi90n_st, r.chi90n_wk) +
          colRock(r.ny80r_st, r.ny80r_hl)
      );
    }
    console.log('-'.repeat(hdr.length));
    console.log(
      `${'mean'.padEnd(9)}` +
        colPair(avg(rows.map((x) => x.ny80t_st)), avg(rows.map((x) => x.ny80t_wk))) +
        colPair(avg(rows.map((x) => x.ny10n_st)), avg(rows.map((x) => x.ny10n_wk))) +
        colPair(avg(rows.map((x) => x.chi80n_st)), avg(rows.map((x) => x.chi80n_wk))) +
        colPair(avg(rows.map((x) => x.chi90n_st)), avg(rows.map((x) => x.chi90n_wk))) +
        colRock(avg(rows.map((x) => x.ny80r_st)), avg(rows.map((x) => x.ny80r_hl)))
    );
    console.log('');
    console.log('Legend: st = mean stations in bucket · wk = mean weak count · hl = mean healthy (rock_alt)');
    console.log('');
  } catch (e) {
    if (String(e.message || e).includes('Cannot find package') || /playwright/i.test(String(e))) {
      console.error(
        'Playwright required:\n  npm i -D playwright && npx playwright install chromium\n\n' +
          'Or run inspect-format-ecology.html in the browser with ?seed= on each load.'
      );
    }
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (preview && !preview.killed) {
      preview.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

main();
