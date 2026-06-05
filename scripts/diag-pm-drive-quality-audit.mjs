#!/usr/bin/env node
/**
 * PM Drive (afternoonDrive) quality inflation audit (diagnostic only — no tuning changes).
 *
 * Outputs:
 *   tmp/pm_drive_quality_audit.json
 *   tmp/pm_drive_quality_audit.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const hooksPath = path.join(root, 'scripts', 'diag-pm-drive-quality-audit-hooks.vm.js');
const runnerPath = path.join(root, 'scripts', 'diag-pm-drive-quality-audit-runner.vm.js');
const outJson = path.join(root, 'tmp', 'pm_drive_quality_audit.json');
const outMd = path.join(root, 'tmp', 'pm_drive_quality_audit.md');

function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    removeChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    getAttribute() { return null; },
    setAttribute() {},
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
  getElementById() { return stubEl(); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext() {
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: console.error },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {} },
    location: { reload() {}, href: 'http://127.0.0.1/' },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() { return 0; },
    clearTimeout() {},
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    crypto: {
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        return a;
      },
    },
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    parseInt,
    parseFloat,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, renderStatus() {} };
  return ctx;
}

function loadVm(marketId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(legacyPath, 'utf8'), ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext('showToast=function(){};', ctx);
  vm.runInContext(readFileSync(hooksPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  // ensure harness2000 exists
  vm.runInContext(
    `if(typeof SC!=='undefined'&&Array.isArray(SC)&&!SC.some(s=>s.id==='harness2000')){SC.push({id:'harness2000',l:'Harness 2000',d:'Diagnostic cold start at 2000.',startYear:2000,idx:[9],cash:2200000,diff:'MEDIUM',oqBoost:0});}`,
    ctx,
    { timeout: 600_000 },
  );
  // allow the runner to be called
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 6,
    seed: 20260604,
    markets: [...ALL_PLAYABLE_MARKET_IDS],
    startYear: 1970,
    endYear: 2021,
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || o.runs);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--start-year=')) o.startYear = parseInt(a.slice(13), 10) || o.startYear;
    else if (a.startsWith('--end-year=')) o.endYear = parseInt(a.slice(11), 10) || o.endYear;
    else if (a.startsWith('--markets=')) o.markets = a.slice(10).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  }
  return o;
}

function median(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function summarizeEvents(allEvents) {
  // Focus on afternoonDrive increases
  const inc = allEvents.filter((e) => e.type === 'slot_delta' && e.slot === 'afternoonDrive' && e.dq > 0);
  const bySource = {};
  for (const e of inc) {
    const k = e.source || 'unknown';
    if (!bySource[k]) bySource[k] = { n: 0, sumDq: 0, jumped98: 0, jumped99: 0, jumped100: 0 };
    bySource[k].n += 1;
    bySource[k].sumDq += e.dq;
    if (e.jumpedExact98) bySource[k].jumped98 += 1;
    if (e.jumpedExact99) bySource[k].jumped99 += 1;
    if (e.jumpedExact100) bySource[k].jumped100 += 1;
  }
  const sources = Object.entries(bySource)
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.sumDq - a.sumDq);

  // Compare per-event delta distribution between PM vs morning/midday
  const dist = {};
  ['decay', 'runAI', 'advTurn_net'].forEach((src) => {
    const ev = allEvents.filter((e) => e.type === 'slot_delta' && e.source === src);
    const pick = (slot) => ev.filter((e) => e.slot === slot).map((e) => e.dq);
    dist[src] = {
      morningDrive: { n: pick('morningDrive').length, medDq: median(pick('morningDrive')) },
      midday: { n: pick('midday').length, medDq: median(pick('midday')) },
      afternoonDrive: { n: pick('afternoonDrive').length, medDq: median(pick('afternoonDrive')) },
    };
  });

  const exact98 = allEvents.filter((e) => e.type === 'slot_delta' && e.slot === 'afternoonDrive' && e.q1r === 98).length;
  const exact99 = allEvents.filter((e) => e.type === 'slot_delta' && e.slot === 'afternoonDrive' && e.q1r === 99).length;
  const exact100 = allEvents.filter((e) => e.type === 'slot_delta' && e.slot === 'afternoonDrive' && e.q1r === 100).length;

  return {
    pmIncreaseEvents: inc.length,
    topSources: sources.slice(0, 15),
    deltaMediansBySource: dist,
    pmExact: { q98: exact98, q99: exact99, q100: exact100 },
  };
}

function renderMd(report) {
  const lines = [];
  lines.push('# PM Drive Quality Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Config');
  lines.push('');
  lines.push(`- Runs: ${report.config.runs}`);
  lines.push(`- Markets: ${report.config.markets.join(', ')}`);
  lines.push(`- Window: ${report.config.startYear} → ${report.config.endYear}`);
  lines.push('');
  lines.push('## Top causes of PM (afternoonDrive) increases');
  lines.push('');
  lines.push('| Source tag | # inc events | ΣΔQ | jump→98 | jump→99 | jump→100 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const r of report.summary.topSources.slice(0, 10)) {
    lines.push(`| ${r.source} | ${r.n} | ${Math.round(r.sumDq * 100) / 100} | ${r.jumped98} | ${r.jumped99} | ${r.jumped100} |`);
  }
  lines.push('');
  lines.push('## PM exact elite hits');
  lines.push('');
  lines.push(`- PM ending at exactly 98: ${report.summary.pmExact.q98}`);
  lines.push(`- PM ending at exactly 99: ${report.summary.pmExact.q99}`);
  lines.push(`- PM ending at exactly 100: ${report.summary.pmExact.q100}`);
  lines.push('');
  lines.push('## Median ΔQ per-period by source (PM vs Morning vs Midday)');
  lines.push('');
  for (const [src, v] of Object.entries(report.summary.deltaMediansBySource)) {
    lines.push(`### ${src}`);
    lines.push(`- morning: n=${v.morningDrive.n} medΔ=${v.morningDrive.medDq}`);
    lines.push(`- midday: n=${v.midday.n} medΔ=${v.midday.medDq}`);
    lines.push(`- pm: n=${v.afternoonDrive.n} medΔ=${v.afternoonDrive.medDq}`);
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  console.log('[diag:pm-drive-quality-audit]', config);

  const ctx = loadVm(config.markets[0] || 'nashville');
  const runResults = [];
  const allEvents = [];

  for (const marketId of config.markets) {
    for (let r = 0; r < config.runs; r++) {
      const seed = (config.seed + r * 104729 + marketId.length * 31) >>> 0;
      const res = ctx.__wlRunPmDriveQualityAudit({
        marketId,
        startYear: config.startYear,
        endYear: config.endYear,
        seed,
      });
      runResults.push(res);

      // Pull per-run detailed logs from VM global `G`? Not accessible here.
      // Instead, the hooks store is inside the VM; export it by executing a string in the VM.
      const packed = vm.runInContext(
        `JSON.stringify({events:(G&&G._wlPmDriveAudit&&G._wlPmDriveAudit.events)||[], crossings:(G&&G._wlPmDriveAudit&&G._wlPmDriveAudit.crossings)||{}})`,
        ctx,
        { timeout: 600_000 },
      );
      const parsed = JSON.parse(packed);
      (parsed.events || []).forEach((e) => allEvents.push(e));
    }
  }

  const summary = summarizeEvents(allEvents);

  const report = {
    generatedAt: new Date().toISOString(),
    config,
    runs: {
      total: runResults.length,
      ok: runResults.filter((r) => r.ok).length,
    },
    summary,
    eventsSample: allEvents.slice(0, 5000), // cap for file size; full attribution is in summary
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, renderMd(report));
  console.log('[diag:pm-drive-quality-audit] wrote', outJson);
}

main();

