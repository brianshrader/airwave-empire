#!/usr/bin/env node
/**
 * Prints plain-English share calibration results to stdout (no browser console).
 * Requires: npm run build first (serves dist/ via vite preview) and devDependency playwright.
 *
 *   npm run inspect:shares
 *
 * Uses a fast sample (?quick=1). For a fuller sample, open inspect-shares.html in the browser
 * without ?quick=1 after npm run client:dev or npm run preview.
 */
/* eslint-disable no-console */

import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = 4173;
const INSPECT_PATH = '/inspect-shares.html?quick=1';

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

async function main() {
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
    await page.goto(`http://127.0.0.1:${PORT}${INSPECT_PATH}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__INSPECT_SHARE_DONE__ === true, null, { timeout: 420000 });
    const text =
      (await page.evaluate(() => window.__INSPECT_SHARE_TEXT__)) ||
      (await page.textContent('#inspect-report')) ||
      '';
    console.log(text);
    if (await page.evaluate(() => window.__INSPECT_SHARE_ERROR__)) {
      process.exitCode = 1;
    }
    await browser.close();
  } catch (e) {
    if (String(e.message || e).includes('Cannot find package') || /playwright/i.test(String(e))) {
      console.error(
        'Playwright is required for npm run inspect:shares.\n' +
          '  npm i -D playwright\n' +
          '  npx playwright install chromium\n\n' +
          'Or open inspect-shares.html in the browser (after npm run client:dev or npm run preview) and read the page.'
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
