#!/usr/bin/env node
/**
 * Headless ratings-collapse audit (stdout). Requires: npm run build, playwright.
 *
 *   npm run sim:ratings-collapse
 *
 * Or open inspect-ratings-collapse.html after npm run client:dev or npm run preview.
 * URL: add ?era=1985 for a shorter 1985→2015 span (default era is 1970 in the harness).
 */
/* eslint-disable no-console */

import { spawn } from 'child_process';
import http from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = 4179;
const INSPECT_PATH = '/inspect-ratings-collapse.html';

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
    await page.waitForFunction(() => window.__RATINGS_COLLAPSE_AUDIT_DONE__ === true, null, { timeout: 600000 });
    const text =
      (await page.evaluate(() => window.__RATINGS_COLLAPSE_AUDIT_TEXT__)) ||
      (await page.textContent('#inspect-report')) ||
      '';
    console.log(text);
    const err = await page.evaluate(() => window.__RATINGS_COLLAPSE_AUDIT_ERROR__);
    if (err) {
      process.exitCode = 1;
    }
    await browser.close();
  } catch (e) {
    if (String(e.message || e).includes('Cannot find package') || /playwright/i.test(String(e))) {
      console.error(
        'Playwright is required for npm run sim:ratings-collapse.\n' +
          '  npm i -D playwright\n' +
          '  npx playwright install chromium\n\n' +
          'Or open inspect-ratings-collapse.html in the browser after npm run client:dev or npm run preview.'
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
