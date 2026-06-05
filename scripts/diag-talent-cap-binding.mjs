#!/usr/bin/env node
/**
 * Cap-binding diagnostic — is the salary cap suppressing "radio legend" pay?
 *
 *   npm run diag:talent-cap-binding
 *   node scripts/diag-talent-cap-binding.mjs --markets=sanfrancisco,newyork --years=32
 *
 * Output: tmp/talent_cap_binding.json, tmp/talent_cap_binding.md
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
const runnerPath = path.join(__dirname, 'diag-talent-cap-binding-runner.vm.js');
const outJson = path.join(root, 'tmp', 'talent_cap_binding.json');
const outMd = path.join(root, 'tmp', 'talent_cap_binding.md');

function injectHeadlessLaunchNewsGuard(src) {
  let out = src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  return out;
}

function patchActiveMarket(src, marketId) {
  return src.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
}

function stubEl() {
  return {
    disabled: false,
    appendChild() {},
    addEventListener() {},
    removeEventListener() {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    style: { setProperty() {} },
    dataset: {},
    setAttribute() {},
    getAttribute() { return null; },
    contains() { return false; },
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
  getElementById(id) {
    const el = stubEl();
    if (id === 'abtn') el.disabled = false;
    return el;
  },
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
    },
    setInterval() { return 0; },
    clearTimeout() {},
    alert() {},
    fetch: null,
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
  vm.runInContext(
    injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
    ctx,
    { filename: 'legacy.js', timeout: 600_000 },
  );
  vm.runInContext(
    'showToast=function(){};renderAll=function(){};openContract=function(){};',
    ctx,
  );
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    markets: ['wichita', 'nashville', 'chicago', 'sanfrancisco', 'newyork', 'losangeles'],
    years: 32,
    startYear: 1970,
    seeds: 2,
    seed: 20260606,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) {
      o.markets = a
        .slice(10)
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith('--years=')) o.years = parseInt(a.slice(8), 10) || o.years;
    else if (a.startsWith('--start-year=')) o.startYear = parseInt(a.slice(13), 10) || o.startYear;
    else if (a.startsWith('--seeds=')) o.seeds = Math.max(1, parseInt(a.slice(8), 10) || 2);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a === '--all-markets') o.markets = [...ALL_PLAYABLE_MARKET_IDS];
  }
  return o;
}

function median(nums) {
  const x = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!x.length) return null;
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : Math.round((x[m - 1] + x[m]) / 2);
}

function summarizeTalents(talents, label) {
  const n = talents.length;
  if (!n) return { label, n: 0 };
  const atCap = talents.filter((t) => t.lastAtCap);
  const aboveCap = talents.filter((t) => t.aboveCap);
  const pinning = talents.filter((t) => t.capPinning);
  const suppressed = talents.filter((t) => t.suppressedByCap);
  const suppress5 = talents.filter((t) => t.suppressedByCap && t.suppressPct1Fall >= 5);
  const suppress20 = talents.filter((t) => t.suppressedByCap && t.suppressPct1Fall >= 20);
  const gaps1 = atCap.map((t) => t.gapToUncapped1).filter((g) => g > 0);
  const legends = talents.filter((t) => t.legendCandidate);
  const dominant = talents.filter((t) => t.dominantAnchor);
  return {
    label,
    n,
    pctAtCapNow: Math.round((atCap.length / n) * 1000) / 10,
    pctAboveCap: Math.round((aboveCap.length / n) * 1000) / 10,
    pctCapPinning: Math.round((pinning.length / n) * 1000) / 10,
    pctSuppressedByCap: Math.round((suppressed.length / n) * 1000) / 10,
    pctWouldRise5PlusIfUncapped: Math.round((suppress5.length / n) * 1000) / 10,
    pctWouldRise20PlusIfUncapped: Math.round((suppress20.length / n) * 1000) / 10,
    medianCapBoundShare: median(atCap.map((t) => t.capBoundShare)),
    medianSuppress1AmongCap: median(atCap.map((t) => t.suppressPct1Fall)),
    medianGapUncapped1AmongCap: median(gaps1),
    medianGapAboveCap: median(
      aboveCap.map((t) => (t.lastCap > 0 ? t.lastSalary - t.lastCap : 0)).filter((g) => g > 0),
    ),
    pctDominantAnchor: Math.round((dominant.length / n) * 1000) / 10,
    pctLegendCandidate: Math.round((legends.length / n) * 1000) / 10,
    topLegends: legends
      .sort((a, b) => b.gapToUncapped3 - a.gapToUncapped3)
      .slice(0, 12)
      .map((t) => ({
        salary: t.lastSalary,
        cap: t.lastCap,
        uncapped3Fall: t.lastUncapped3Fall,
        gap3: t.gapToUncapped3,
        capBoundShare: t.capBoundShare,
        tenureYrs: t.lastTenureYrs,
        rank: t.lastBookRank,
        share: Math.round((t.lastShare || 0) * 1000) / 10,
        slot: t.slot,
        call: t.lastCall,
        marketId: t.marketId,
      })),
    salaryLadder: (() => {
      const top = [...talents].sort((a, b) => b.lastSalary - a.lastSalary).slice(0, 15);
      const byRank = {};
      for (const t of top) {
        const rk = t.lastBookRank != null ? `#${t.lastBookRank}` : '?';
        if (!byRank[rk]) byRank[rk] = [];
        byRank[rk].push(t);
      }
      return top.map((t) => ({
        salary: t.lastSalary,
        cap: t.lastCap,
        uncapped1: t.lastUncapped1Fall,
        atCap: t.lastAtCap,
        rank: t.lastBookRank,
        call: t.lastCall,
        slot: t.slot,
        share: Math.round((t.lastShare || 0) * 1000) / 10,
      }));
    })(),
  };
}

function buildReport(runs, config) {
  const talents = runs.filter((r) => r.ok).flatMap((r) => r.talents);
  const report = {
    generatedAt: new Date().toISOString(),
    config,
    methodology: {
      atCap: 'salary >= 98% of estSalaryCap (slot star max × market mult × tenure × elite premium)',
      uncappedProjection:
        'Apply Fall COLA+merit+perf+leverage raise and floor, but skip mktCap clamp (1 or 3 Fall steps from end state)',
      atCapDefinition: 'Salary within ±2% of est Fall mktCap (pinned band)',
      aboveCap: 'Salary > 102% of est cap — often renewals/poaches (doExtend does not clamp to mktCap)',
      capPinning: 'Pinned at cap AND uncapped 1-Fall would exceed cap by >2%',
      suppressedByCap: 'Same as capPinning — counterfactual next Fall without clamp',
      capBoundShare: 'Share of Fall snapshots where talent was at cap',
      legendCandidate:
        'Tenure ≥10yr, book rank ≤5, share ≥8%, cap-bound ≥8 Fall periods (≥4 years), ≥12 Fall snapshots',
      note: 'Cold-start sims (genMarket), not player saves. Uncapped projection is counterfactual one-off, not full career re-sim.',
    },
    runs: { total: runs.length, ok: runs.filter((r) => r.ok).length },
    talentRows: talents.length,
    global: summarizeTalents(talents, 'all markets pooled'),
    byMarket: {},
    byRankTier: {},
    verdict: {},
  };

  for (const mkt of [...new Set(talents.map((t) => t.marketId))]) {
    report.byMarket[mkt] = summarizeTalents(
      talents.filter((t) => t.marketId === mkt),
      mkt,
    );
  }
  for (const tier of ['small', 'medium', 'large', 'mega']) {
    const sub = talents.filter((t) => t.rankTier === tier);
    if (sub.length) report.byRankTier[tier] = summarizeTalents(sub, tier);
  }

  const g = report.global;
  report.verdict = {
    capIsPrimaryLimiter:
      g.pctCapPinning >= 8 ||
      g.medianSuppress1AmongCap >= 8 ||
      (g.pctAtCapNow >= 15 && g.pctAtCapWouldRise5Plus >= 5),
    summary:
      g.pctCapPinning >= 8
        ? 'Caps are actively pinning a meaningful slice of talent — uncapped Fall projection exceeds current salary by 5%+ while at cap.'
        : g.pctAtCapNow >= 15 && g.pctAtCapWouldRise5Plus < 3
          ? 'Many talents sit at cap, but few would jump materially on the next uncapped Fall — cap may be binding without suppressing legends much.'
          : 'Mixed — review per-market tables and legend candidates.',
    chatgptFranchiseQuestion:
      g.pctLegendCandidate < 2
        ? `Only ${g.pctLegendCandidate}% of talent rows match "dominant station anchor, cap-bound for years" — franchise-defining careers are rare in sim.`
        : `${g.pctLegendCandidate}% legend-candidate rows — some long-run anchors exist but check topLegends table for $ levels.`,
  };

  return report;
}

function renderMd(report) {
  const lines = [];
  const g = report.global;
  lines.push('# Talent salary cap-binding audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Question');
  lines.push('');
  lines.push(
    'If caps disappeared, would pay rise enough to create **radio legends**? Who spends **years cap-bound** while dominating a book?',
  );
  lines.push('');
  lines.push('## Global summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | ---: |');
  lines.push(`| Talent career-rows tracked | ${g.n} |`);
  lines.push(`| **Pinned at cap** (±2% of est mktCap) | **${g.pctAtCapNow}%** |`);
  lines.push(`| **Above cap** (renewal/poach bypass — doExtend uncapped) | **${g.pctAboveCap}%** |`);
  lines.push(`| **Suppressed by cap** (pinned + next Fall would exceed cap) | **${g.pctSuppressedByCap}%** |`);
  lines.push(`| Would rise ≥5% next Fall if uncapped | ${g.pctWouldRise5PlusIfUncapped}% |`);
  lines.push(`| Median salary − cap (above-cap rows) | $${g.medianGapAboveCap?.toLocaleString() || '—'} |`);
  lines.push(`| Median % of Fall periods spent at cap (among cap now) | ${g.medianCapBoundShare ?? '—'}% |`);
  lines.push(`| Median 1-Fall uncapped lift while at cap | ${g.medianSuppress1AmongCap ?? '—'}% |`);
  lines.push(`| **Dominant anchor** (10yr+, top5 book, ≥8% share) | ${g.pctDominantAnchor}% |`);
  lines.push(`| **Legend candidate** (anchor + cap-bound 4+ yrs) | ${g.pctLegendCandidate}% |`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(report.verdict.summary);
  lines.push('');
  lines.push(report.verdict.chatgptFranchiseQuestion);
  lines.push('');
  lines.push('## Salary ladder (top 15 earners, end state)');
  lines.push('');
  lines.push('| Salary | Cap | Uncapped +1 Fall | At cap | Rank | Station | Slot | Share |');
  lines.push('| ---: | ---: | ---: | :---: | ---: | --- | --- | ---: |');
  for (const t of g.salaryLadder || []) {
    lines.push(
      `| $${t.salary.toLocaleString()} | $${t.cap?.toLocaleString() || '—'} | $${t.uncapped1?.toLocaleString() || '—'} | ${t.atCap ? 'Y' : ''} | #${t.rank ?? '?'} | ${t.call} | ${t.slot} | ${t.share}% |`,
    );
  }
  lines.push('');
  if (g.topLegends?.length) {
    lines.push('## Legend candidates (dominant + years at cap)');
    lines.push('');
    lines.push('| Salary | Cap | +3 Fall uncapped | Gap | Cap-bound % of Falls | Tenure | Rank |');
    lines.push('| ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const t of g.topLegends) {
      lines.push(
        `| $${t.salary.toLocaleString()} | $${t.cap?.toLocaleString() || '—'} | $${t.uncapped3Fall?.toLocaleString()} | +$${t.gap3.toLocaleString()} | ${t.capBoundShare}% | ${t.tenureYrs}y | #${t.rank} |`,
      );
    }
    lines.push('');
  }
  lines.push('## By market');
  lines.push('');
  for (const [mkt, s] of Object.entries(report.byMarket)) {
    lines.push(
      `**${mkt}** — pinned ${s.pctAtCapNow}%, above cap ${s.pctAboveCap}%, suppressed ${s.pctSuppressedByCap}%, legends ${s.pctLegendCandidate}%`,
    );
  }
  lines.push('');
  lines.push('## By market tier');
  lines.push('');
  for (const [tier, s] of Object.entries(report.byRankTier)) {
    lines.push(
      `**${tier}** — at cap ${s.pctAtCapNow}%, pinning ${s.pctCapPinning}%, median suppress-at-cap ${s.medianSuppress1AmongCap ?? '—'}%`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const vmCache = new Map();
  const runs = [];
  let idx = 0;

  for (const marketId of config.markets) {
    if (!vmCache.has(marketId)) vmCache.set(marketId, loadVm(marketId));
    const ctx = vmCache.get(marketId);
    for (let s = 0; s < config.seeds; s++) {
      const seed = (config.seed + idx * 9973) >>> 0;
      idx += 1;
      const run = vm.runInContext(
        `__wlRunCapBindingSim(${JSON.stringify({
          marketId,
          startYear: config.startYear,
          years: config.years,
          seed,
        })})`,
        ctx,
      );
      runs.push(run);
      if (!run.ok) console.error(`FAIL ${marketId} seed=${seed}: ${run.error}`);
    }
  }

  const report = buildReport(runs, config);
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(outMd, `${renderMd(report)}\n`, 'utf8');
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  const g = report.global;
  console.log(
    `Pinned ${g.pctAtCapNow}% · above cap ${g.pctAboveCap}% · suppressed ${g.pctSuppressedByCap}% · legends ${g.pctLegendCandidate}%`,
  );
}

main();
