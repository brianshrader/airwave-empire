#!/usr/bin/env node
/**
 * Headless: Chicago + King of the Dial (wsb) cash / finHistory probe through 1985 Fall.
 *
 *   npm run sim:scenario-probe
 */
/* eslint-disable no-console */

import { spawn } from 'child_process';
import http from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = 4181;
const INSPECT_PATH = '/inspect-scenario-probe.html';

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
    await page.waitForFunction(() => window.__SCENARIO_PROBE_DONE__ === true, null, { timeout: 600000 });
    const jsonStr = await page.evaluate(() => window.__SCENARIO_PROBE_JSON__ || '');
    const preText = await page.textContent('#inspect-report');
    if (jsonStr) {
      try {
        const o = JSON.parse(jsonStr);
        console.log(o.plainEnglish || preText || jsonStr);
      } catch {
        console.log(preText || jsonStr);
      }
    } else {
      console.log(preText || '');
    }
    const ok = await page.evaluate(() => window.__SCENARIO_PROBE_OK__ === true);
    if (!ok || (await page.evaluate(() => window.__SCENARIO_PROBE_ERROR__))) {
      process.exitCode = 1;
    }
    await browser.close();
  } catch (e) {
    if (String(e.message || e).includes('Cannot find package') || /playwright/i.test(String(e))) {
      console.error(
        'Playwright is required.\n' +
          '  npm i -D playwright\n' +
          '  npx playwright install chromium\n\n' +
          'Or open inspect-scenario-probe.html after npm run client:dev or npm run preview.'
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
