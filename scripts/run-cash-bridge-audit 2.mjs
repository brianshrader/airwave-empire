#!/usr/bin/env node
/**
 * Headless solo cash-flow bridge audit (Playwright + vite preview).
 *
 *   npm run sim:cash-bridge-audit
 *   npm run sim:cash-bridge-audit -- --quick
 *
 * Writes audit-output/cash-bridge-audit.json, .csv, cash-bridge-anomalies-only.json
 */
/* eslint-disable no-console */

import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = 4179;
const INSPECT_PATH = '/inspect-cash-bridge-audit.html';

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
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const path = `${INSPECT_PATH}${quick ? '?quick=1' : ''}`;

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
    await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__CASH_BRIDGE_AUDIT_DONE__ === true, null, { timeout: 600000 });

    const err = await page.evaluate(() => window.__CASH_BRIDGE_AUDIT_ERROR__);
    const text =
      (await page.textContent('#inspect-report')) || '';
    const csv = await page.evaluate(() => window.__CASH_BRIDGE_AUDIT_CSV__ || '');
    const jsonStr = await page.evaluate(() => window.__CASH_BRIDGE_AUDIT_JSON__ || '[]');
    const anomalies = await page.evaluate(() => window.__CASH_BRIDGE_AUDIT_ANOMALIES__ || []);

    const outDir = join(root, 'audit-output');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(join(outDir, 'cash-bridge-audit.csv'), csv, 'utf8');
    fs.writeFileSync(join(outDir, 'cash-bridge-audit.json'), jsonStr, 'utf8');
    fs.writeFileSync(join(outDir, 'cash-bridge-anomalies-only.json'), JSON.stringify(anomalies, null, 2), 'utf8');

    console.log(text);
    console.log('\n--- Files written ---');
    console.log(join(outDir, 'cash-bridge-audit.csv'));
    console.log(join(outDir, 'cash-bridge-audit.json'));
    console.log(join(outDir, 'cash-bridge-anomalies-only.json'));
    console.log('Anomaly count:', anomalies.length);

    if (err) {
      process.exitCode = 1;
    }

    await browser.close();
  } catch (e) {
    if (String(e.message || e).includes('Cannot find package') || /playwright/i.test(String(e))) {
      console.error(
        'Playwright is required.\n' +
          '  npm i -D playwright\n' +
          '  npx playwright install chromium\n\n' +
          'Or open inspect-cash-bridge-audit.html after npm run client:dev or npm run preview.'
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
