#!/usr/bin/env node
/**
 * Multi-seed format-ecology rollup (headless). One preview server, several seeds.
 *
 *   npm run sim:format-ecology:batch
 *
 * Env:
 *   FORMAT_ECOLOGY_PATH  — base path+query (default: quick + newyork,chicago,atlanta)
 *   FORMAT_ECOLOGY_SEEDS — comma-separated integers (default: 1–10)
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

const DEFAULT_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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

/** Per-period means from inspect rawFormat (CHR lineage reports as TOP40 after normalize). */
function rawFmtStats(bmd, market, decade, formatKey) {
  const key = `${market}|${decade}`;
  const block = bmd[key];
  const r = block && block.rawFormat && block.rawFormat[formatKey];
  if (!r) return { st: NaN, wk: NaN };
  return {
    st: r.meanCount,
    wk: r.meanWeak != null ? r.meanWeak : NaN,
  };
}

function sumRaw(bmd, market, decade, keys) {
  let st = 0;
  let wk = 0;
  let any = false;
  for (const k of keys) {
    const x = rawFmtStats(bmd, market, decade, k);
    if (!Number.isNaN(x.st)) {
      any = true;
      st += x.st;
    }
    if (!Number.isNaN(x.wk)) wk += x.wk;
  }
  return { st: any ? st : NaN, wk: any ? wk : NaN };
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

      const ny80_hot = rawFmtStats(bmd, 'newyork', '1980s', 'HOT_AC');
      const ny80_ac = rawFmtStats(bmd, 'newyork', '1980s', 'ADULT_CONTEMP');
      const ny80_co = rawFmtStats(bmd, 'newyork', '1980s', 'COUNTRY');
      const ny80_top40 = rawFmtStats(bmd, 'newyork', '1980s', 'TOP40');
      const ny80_rhy = rawFmtStats(bmd, 'newyork', '1980s', 'RHYTHMIC');
      const ny80_urb = rawFmtStats(bmd, 'newyork', '1980s', 'URBAN_CONTEMP');
      const ny80_mor = rawFmtStats(bmd, 'newyork', '1980s', 'MOR');
      const ny80_rock = sumRaw(bmd, 'newyork', '1980s', ['ALBUM_ROCK', 'ALT_ROCK', 'CLASSIC_ROCK']);

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
        ny80_hot_st: ny80_hot.st,
        ny80_hot_wk: ny80_hot.wk,
        ny80_ac_st: ny80_ac.st,
        ny80_ac_wk: ny80_ac.wk,
        ny80_co_st: ny80_co.st,
        ny80_co_wk: ny80_co.wk,
        ny80_top40_st: ny80_top40.st,
        ny80_top40_wk: ny80_top40.wk,
        ny80_rhy_st: ny80_rhy.st,
        ny80_rhy_wk: ny80_rhy.wk,
        ny80_urb_st: ny80_urb.st,
        ny80_urb_wk: ny80_urb.wk,
        ny80_mor_st: ny80_mor.st,
        ny80_mor_wk: ny80_mor.wk,
        ny80_rock_sum_st: ny80_rock.st,
        ny80_rock_sum_wk: ny80_rock.wk,
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
    console.log('Legend: st = mean stations in bucket · wk = mean weak count · hl = mean healthy (rock_alt bucket)');
    console.log('');

    const hdr2 =
      'seed      HOT_AC(s/w) ADULT_CONTEMP(s/w) COUNTRY(s/w) TOP40(s/w) RHYTHMIC(s/w) URBAN(s/w) MOR(s/w) rockΣ3(s/w)';
    console.log('NY 1980s — raw formats (mean stations / mean weak); TOP40 = CHR lineage after normalize');
    console.log(hdr2);
    console.log('-'.repeat(hdr2.length));
    for (const r of rows) {
      console.log(
        `${String(r.seed).padEnd(9)}` +
          colPair(r.ny80_hot_st, r.ny80_hot_wk) +
          colPair(r.ny80_ac_st, r.ny80_ac_wk) +
          colPair(r.ny80_co_st, r.ny80_co_wk) +
          colPair(r.ny80_top40_st, r.ny80_top40_wk) +
          colPair(r.ny80_rhy_st, r.ny80_rhy_wk) +
          colPair(r.ny80_urb_st, r.ny80_urb_wk) +
          colPair(r.ny80_mor_st, r.ny80_mor_wk) +
          colPair(r.ny80_rock_sum_st, r.ny80_rock_sum_wk)
      );
    }
    console.log('-'.repeat(hdr2.length));
    console.log(
      `${'mean'.padEnd(9)}` +
        colPair(avg(rows.map((x) => x.ny80_hot_st)), avg(rows.map((x) => x.ny80_hot_wk))) +
        colPair(avg(rows.map((x) => x.ny80_ac_st)), avg(rows.map((x) => x.ny80_ac_wk))) +
        colPair(avg(rows.map((x) => x.ny80_co_st)), avg(rows.map((x) => x.ny80_co_wk))) +
        colPair(avg(rows.map((x) => x.ny80_top40_st)), avg(rows.map((x) => x.ny80_top40_wk))) +
        colPair(avg(rows.map((x) => x.ny80_rhy_st)), avg(rows.map((x) => x.ny80_rhy_wk))) +
        colPair(avg(rows.map((x) => x.ny80_urb_st)), avg(rows.map((x) => x.ny80_urb_wk))) +
        colPair(avg(rows.map((x) => x.ny80_mor_st)), avg(rows.map((x) => x.ny80_mor_wk))) +
        colPair(avg(rows.map((x) => x.ny80_rock_sum_st)), avg(rows.map((x) => x.ny80_rock_sum_wk)))
    );
    console.log('');

    function nz(x) {
      return Number.isFinite(x) ? x : 0;
    }
    const meanHot = avg(rows.map((x) => x.ny80_hot_st));
    console.log('--- NY 1980s “absorption pool” mix (mean stations; shares of labeled subtotals) ---');
    const mRock = avg(rows.map((x) => x.ny80_rock_sum_st));
    const mHits = avg(rows.map((x) => nz(x.ny80_top40_st) + nz(x.ny80_rhy_st) + nz(x.ny80_urb_st)));
    const mAc = avg(rows.map((x) => nz(x.ny80_ac_st) + nz(x.ny80_mor_st)));
    const mCo = avg(rows.map((x) => nz(x.ny80_co_st)));
    const mHot = Number.isFinite(meanHot) ? meanHot : 0;
    const pool = nz(mRock) + nz(mHits) + nz(mAc) + nz(mCo) + nz(mHot);
    if (pool > 0) {
      const p = (x) => ((100 * x) / pool).toFixed(1);
      console.log(
        `Mean subtotals (stations/period): rockΣ=${mRock.toFixed(2)} · hits_adj=${mHits.toFixed(2)} · AC=${mAc.toFixed(2)} · COUNTRY=${mCo.toFixed(2)} · HOT_AC=${mHot.toFixed(2)} · POOL=${pool.toFixed(2)}`
      );
      console.log(
        `Shares of pool: rock=${p(mRock)}% · hits_adj=${p(mHits)}% · AC=${p(mAc)}% · country=${p(mCo)}% · hot_ac=${p(mHot)}%`
      );
      const rockDominant = mRock / pool >= 0.45;
      const diversified = mRock / pool <= 0.35 && mHits / pool >= 0.2;
      console.log(
        rockDominant
          ? 'Rollup: rock is the largest single lane in this pool (check for overflow).'
          : diversified
            ? 'Rollup: mix looks spread across rock / hits-adjacent / AC / country / hot AC — no single dump lane.'
            : 'Rollup: intermediate — rock is material but not sole sink; see per-seed table.'
      );
    } else {
      console.log('(Could not compute pool — missing rawFormat.)');
    }
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
