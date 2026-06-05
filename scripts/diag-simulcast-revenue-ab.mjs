#!/usr/bin/env node
/**
 * Simulcast revenue A/B harness (VM-only — no gameplay changes shipped).
 *
 *   npm run diag:simulcast-revenue-ab
 *
 * Compares:
 *   CURRENT — production behavior
 *   A       — post-seedRev cluster billing allocation to FM
 *   D       — no FM revenue dedupe for explicit programming receivers
 *
 * Output:
 *   tmp/simulcast_revenue_ab.json
 *   tmp/simulcast_revenue_ab.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectSimulcastRevenueAbHooks } from './diag-simulcast-revenue-ab-patches.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const hooksPath = path.join(root, 'scripts/diag-simulcast-revenue-ab-hooks.vm.js');
const runnerPath = path.join(root, 'scripts/diag-simulcast-revenue-ab-runner.vm.js');
const outJson = path.join(root, 'tmp', 'simulcast_revenue_ab.json');
const outMd = path.join(root, 'tmp', 'simulcast_revenue_ab.md');

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
  body: { innerHTML: '', appendChild() {}, contains() { return false; }, dataset: {} },
  head: { appendChild() {} },
  documentElement: { dataset: {} },
  createElement() { return stubEl(); },
  getElementById(id) {
    if (id === 'abtn') return stubEl();
    return stubEl();
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext() {
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: console.error, table: () => {} },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() { return 0; },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
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
    Infinity,
    NaN,
    undefined,
    Int8Array,
    Uint8Array,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = {
    mode: 'solo',
    playerId: 0,
    isHost: false,
    players: [],
    renderStatus() {},
    action() {},
    emit() {},
  };
  ctx.alert = () => {};
  ctx.fetch = null;
  ctx.btoa = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  ctx.atob = (s) => Buffer.from(String(s), 'base64').toString('utf8');
  return ctx;
}

function fmtK(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return '$' + Math.round(n / 1000) + 'K';
}

function buildMarkdown(out) {
  const lines = [];
  lines.push('# Simulcast revenue A/B harness');
  lines.push('');
  lines.push('VM-only patches — **not shipped** to production.');
  lines.push('');
  lines.push('| Variant | Description |');
  lines.push('|---------|-------------|');
  lines.push('| **CURRENT** | Production (FM dedupe + per-leg billing) |');
  lines.push('| **A** | Post-`seedRev` cluster allocation — FM target ≈ (20% + era×15%) of AM billings |');
  lines.push('| **D** | Skip `applySimulcastCoownedFmRevenueDedupe` for explicit programming receivers |');
  lines.push('');

  const pinnedLabels = Object.keys(out.byVariant.CURRENT.pinned);
  lines.push('## Pinned Chicago scenarios (explicit AM/FM simulcast)');
  lines.push('');
  lines.push('| Scenario | Variant | FM rev % AM | FM EBITDA | Combined EBITDA | AM EBITDA |');
  lines.push('|----------|---------|-------------|-----------|-----------------|-----------|');
  for (const label of pinnedLabels) {
    for (const v of out.variants) {
      const r = out.byVariant[v].pinned[label];
      if (!r) continue;
      lines.push(
        `| ${label} | ${v} | ${r.fmRevPctOfAm}% | ${fmtK(r.fmEbitda)} | ${fmtK(r.combinedEbitda)} | ${fmtK(r.amEbitda)} |`,
      );
    }
  }
  lines.push('');

  if (out.chicago1971FallDeltasVsCurrent) {
    lines.push('## Chicago Fall 1971 — delta vs CURRENT');
    lines.push('');
    for (const v of ['A', 'D']) {
      const d = out.chicago1971FallDeltasVsCurrent[v];
      if (!d) continue;
      lines.push(`### Variant ${v}`);
      lines.push('');
      lines.push(`- FM rev as % of AM: **${d.fmRevPctOfAmDelta >= 0 ? '+' : ''}${d.fmRevPctOfAmDelta} pp**`);
      lines.push(`- FM EBITDA: **${fmtK(d.fmEbitdaDelta)}** (${d.pctProblemFixedFmEbitda != null ? d.pctProblemFixedFmEbitda + '% of FM deficit closed' : 'n/a'})`);
      lines.push(`- Combined EBITDA: **${fmtK(d.combinedEbitdaDelta)}**`);
      lines.push('');
    }
  }

  lines.push('## AI co-owned pair adoption survey');
  lines.push('');
  lines.push('Co-owned AM+FM clusters (corp or indie licensee). Compares explicit simulcast vs separate programming EBITDA.');
  lines.push('');
  lines.push('| Market / Year | Variant | Pairs | % attractive | % mandatory | Median FM rev % AM |');
  lines.push('|---------------|---------|-------|--------------|-------------|-------------------|');
  const adoptionKeys = Object.keys(out.byVariant.CURRENT.adoption);
  for (const key of adoptionKeys) {
    for (const v of out.variants) {
      const a = out.byVariant[v].adoption[key];
      if (!a) continue;
      lines.push(
        `| ${key} | ${v} | ${a.pairsEvaluated}/${a.coOwnedPairCandidates} | ${a.pctAttractive ?? '—'}% | ${a.pctMandatory ?? '—'}% | ${a.medianFmRevPctOfAm ?? '—'}% |`,
      );
    }
  }
  lines.push('');

  lines.push('## Interpretation notes');
  lines.push('');
  out.notes.forEach((n) => lines.push(`- ${n}`));
  lines.push('');
  lines.push('**Design targets (1971 simulcast):** FM rev ~15–25% of AM; FM cost ~15–22% of AM; combined EBITDA within ~$50K of AM-only in Fall 1971.');
  lines.push('');

  return lines.join('\n');
}

function main() {
  let legacySrc = readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  }
  legacySrc = injectSimulcastRevenueAbHooks(legacySrc);

  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(legacySrc, ctx);
  vm.runInContext(readFileSync(hooksPath, 'utf8'), ctx);
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx);

  const out = vm.runInContext('__wlRunSimulcastRevenueAb({})', ctx);

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, JSON.stringify(out, null, 2));
  writeFileSync(outMd, buildMarkdown(out));

  const cur = out.byVariant.CURRENT.pinned.chicago_1971_fall_user_shares;
  const d = out.byVariant.D.pinned.chicago_1971_fall_user_shares;
  const a = out.byVariant.A.pinned.chicago_1971_fall_user_shares;
  console.log('Chicago 1971 Fall (pinned shares):');
  console.log('  CURRENT  FM rev', cur.fmRevPctOfAm + '% of AM  FM EBITDA', fmtK(cur.fmEbitda), ' combined', fmtK(cur.combinedEbitda));
  console.log('  D        FM rev', d.fmRevPctOfAm + '% of AM  FM EBITDA', fmtK(d.fmEbitda), ' combined', fmtK(d.combinedEbitda));
  console.log('  A        FM rev', a.fmRevPctOfAm + '% of AM  FM EBITDA', fmtK(a.fmEbitda), ' combined', fmtK(a.combinedEbitda));
  if (out.chicago1971FallDeltasVsCurrent?.D?.pctProblemFixedFmEbitda != null) {
    console.log('  D closes ~' + out.chicago1971FallDeltasVsCurrent.D.pctProblemFixedFmEbitda + '% of FM EBITDA deficit vs CURRENT');
  }
  console.error('\nWrote', outMd);
}

main();
