#!/usr/bin/env node
/**
 * Headless ecology deep diagnostic (stdout JSON subset). Requires: npm run build, playwright.
 *
 *   npm run sim:ecology-deep
 */
/* eslint-disable no-console */

import { spawn } from 'child_process';
import http from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = 4175;
const PATH_Q = '/inspect-ecology-deep.html';

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

    await waitForOk(PATH_Q, 120000);

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}${PATH_Q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__ECOLOGY_DONE__ === true, null, { timeout: 900000 });
    const err = await page.evaluate(() => window.__ECOLOGY_ERROR__);
    const subset = await page.evaluate(() => window.__ECOLOGY_SUBSET_JSON__);
    if (err) {
      console.error(err);
      process.exitCode = 1;
    }
    if (subset) {
      console.log(JSON.stringify(subset, null, 2));
    }
    await browser.close();
  } catch (e) {
    if (String(e.message || e).includes('Executable doesn') || /playwright/i.test(String(e))) {
      console.error(
        'Playwright is required.\n' +
          '  npm i -D playwright\n' +
          '  npx playwright install chromium\n\n' +
          'Or open inspect-ecology-deep.html after npm run client:dev or npm run preview.'
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
