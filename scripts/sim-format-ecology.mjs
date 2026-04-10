#!/usr/bin/env node
/**
 * Headless format-ecology diagnostic (stdout). Requires: npm run build, playwright.
 *
 *   npm run sim:format-ecology
 *
 * Uses ?quick=1 by default. For full sample (five markets × 4 runs), edit INSPECT_PATH or open inspect-format-ecology.html.
 *
 *   FORMAT_ECOLOGY_PATH='/inspect-format-ecology.html?quick=1&markets=chicago' node scripts/sim-format-ecology.mjs
 */
/* eslint-disable no-console */

import { spawn } from 'child_process';
import http from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = 4175;
const INSPECT_PATH = process.env.FORMAT_ECOLOGY_PATH || '/inspect-format-ecology.html?quick=1';

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
    await page.waitForFunction(() => window.__FORMAT_ECOLOGY_SIM_DONE__ === true, null, { timeout: 420000 });
    const text =
      (await page.evaluate(() => window.__FORMAT_ECOLOGY_SIM_TEXT__)) ||
      (await page.textContent('#inspect-report')) ||
      '';
    console.log(text);
    if (await page.evaluate(() => window.__FORMAT_ECOLOGY_SIM_ERROR__)) {
      process.exitCode = 1;
    }
    await browser.close();
  } catch (e) {
    if (String(e.message || e).includes('Cannot find package') || /playwright/i.test(String(e))) {
      console.error(
        'Playwright is required for npm run sim:format-ecology.\n' +
          '  npm i -D playwright\n' +
          '  npx playwright install chromium\n\n' +
          'Or open inspect-format-ecology.html in the browser after npm run client:dev or npm run preview.'
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
