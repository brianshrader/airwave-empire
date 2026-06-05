#!/usr/bin/env node
/**
 * Salary concentration audit — tail vs market median, daypart spread, winners vs losers.
 * Read-only diagnostic (no balance changes).
 *
 *   npm run diag:talent-salary-concentration
 *   node scripts/diag-talent-salary-concentration.mjs --markets=sanfrancisco,newyork --years=1981,2010
 *
 * Output: tmp/talent_salary_concentration.json, tmp/talent_salary_concentration.md
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
const runnerPath = path.join(__dirname, 'diag-talent-salary-concentration-runner.vm.js');
const outJson = path.join(root, 'tmp', 'talent_salary_concentration.json');
const outMd = path.join(root, 'tmp', 'talent_salary_concentration.md');

const SLOT_ORDER = ['morningDrive', 'afternoonDrive', 'midday', 'evening', 'overnight'];
const SLOT_LABEL = {
  morningDrive: 'Morning',
  afternoonDrive: 'PM drive',
  midday: 'Midday',
  evening: 'Evening',
  overnight: 'Overnight',
};

/** Rough CPI index (1981 = 1.0) for optional nominal comparison — BLS-ish, not gameplay. */
const CPI_1981 = 1.0;
const CPI_BY_YEAR = {
  1975: 0.72,
  1981: 1.0,
  1985: 1.15,
  1995: 1.52,
  2005: 1.95,
  2010: 2.12,
  2015: 2.24,
  2020: 2.45,
  2025: 2.68,
};

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
    years: [1981, 1985, 1995, 2005, 2015],
    startYearFor: (y) => (y >= 2000 ? 2000 : y >= 1985 ? 1985 : 1970),
    seeds: 2,
    seed: 20260605,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) {
      o.markets = a
        .slice(10)
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith('--years=')) {
      o.years = a
        .slice(8)
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter(Number.isFinite);
    } else if (a.startsWith('--seeds=')) o.seeds = Math.max(1, parseInt(a.slice(8), 10) || 2);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a === '--all-markets') o.markets = [...ALL_PLAYABLE_MARKET_IDS];
  }
  return o;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const x = [...sorted].sort((a, b) => a - b);
  const idx = (x.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return x[lo];
  return Math.round(x[lo] + (x[hi] - x[lo]) * (idx - lo));
}

function median(nums) {
  return percentile(nums, 0.5);
}

function summarizePool(talents, label) {
  const salaries = talents.map((t) => t.salary).filter((n) => n > 0);
  if (!salaries.length) {
    return { label, n: 0 };
  }
  const med = median(salaries);
  const p90 = percentile(salaries, 0.9);
  const p95 = percentile(salaries, 0.95);
  const p99 = percentile(salaries, 0.99);
  const max = Math.max(...salaries);
  const countMult = (m) => salaries.filter((s) => s >= med * m).length;
  const n = salaries.length;
  return {
    label,
    n,
    median: med,
    p90,
    p95,
    p99,
    max,
    maxOverMedian: med > 0 ? Math.round((max / med) * 100) / 100 : null,
    pctAt2x: Math.round((countMult(2) / n) * 1000) / 10,
    pctAt3x: Math.round((countMult(3) / n) * 1000) / 10,
    pctAt5x: Math.round((countMult(5) / n) * 1000) / 10,
    pctAt10x: Math.round((countMult(10) / n) * 1000) / 10,
    countAt2x: countMult(2),
    countAt3x: countMult(3),
    countAt5x: countMult(5),
    countAt10x: countMult(10),
    pctAtCap: Math.round((talents.filter((t) => t.atCap).length / n) * 1000) / 10,
    pctSuperstar: Math.round((talents.filter((t) => t.superstar).length / n) * 1000) / 10,
    pctTrueQ85: Math.round((talents.filter((t) => t.trueQ >= 85).length / n) * 1000) / 10,
  };
}

function bySlotSummary(talents) {
  const out = {};
  for (const sl of SLOT_ORDER) {
    const sub = talents.filter((t) => t.slot === sl);
    if (sub.length) out[sl] = summarizePool(sub, SLOT_LABEL[sl] || sl);
  }
  return out;
}

function compareWinnersLosers(talents) {
  const winners = talents.filter((t) => t.rankBucket === 'top3' || t.rankBucket === 'top4_5');
  const mid = talents.filter((t) => t.rankBucket === 'rank6_10' || t.rankBucket === 'mid_pack');
  const losers = talents.filter((t) => t.rankBucket === 'bottom_third');
  return {
    top5: summarizePool(winners, 'stations rank 1–5'),
    rank6_10_mid: summarizePool(mid, 'stations rank 6–10 / mid'),
    bottom_third: summarizePool(losers, 'bottom third'),
  };
}

function deflated1981(salary, year) {
  const cpi = CPI_BY_YEAR[year] || CPI_1981;
  return Math.round(salary / cpi);
}

function buildReport(snaps, config) {
  const allTalents = snaps.filter((s) => s.ok).flatMap((s) =>
    s.talents.map((t) => ({
      ...t,
      snapYear: s.calendarYear,
      targetYear: s.targetYear,
      seed: s.seed,
    })),
  );

  const byMarketYear = {};
  for (const snap of snaps) {
    if (!snap.ok) continue;
    const key = `${snap.marketId}:${snap.targetYear}`;
    if (!byMarketYear[key]) {
      byMarketYear[key] = { marketId: snap.marketId, targetYear: snap.targetYear, talents: [] };
    }
    byMarketYear[key].talents.push(...snap.talents);
  }

  const marketYearStats = Object.values(byMarketYear).map((my) => {
    const med = median(my.talents.map((t) => t.salary));
    const mega = my.talents
      .filter((t) => t.slot === 'morningDrive')
      .sort((a, b) => b.salary - a.salary)[0];
    const eve = my.talents
      .filter((t) => t.slot === 'evening')
      .sort((a, b) => b.salary - a.salary)[0];
    const pm = my.talents
      .filter((t) => t.slot === 'afternoonDrive')
      .sort((a, b) => b.salary - a.salary)[0];
    return {
      marketId: my.marketId,
      year: my.targetYear,
      rankTier: my.talents[0]?.rankTier || 'unknown',
      pool: summarizePool(my.talents, `${my.marketId} ${my.targetYear}`),
      bySlot: bySlotSummary(my.talents),
      winnersLosers: compareWinnersLosers(my.talents),
      morningVsEveningTop: mega && eve
        ? {
            morningMax: mega.salary,
            eveningMax: eve.salary,
            ratio: Math.round((mega.salary / eve.salary) * 100) / 100,
            morningCall: mega.call,
            eveningCall: eve.call,
          }
        : null,
      afternoonTop: pm ? { max: pm.salary, call: pm.call } : null,
      topEarners: [...my.talents]
        .sort((a, b) => b.salary - a.salary)
        .slice(0, 8)
        .map((t) => ({
          salary: t.salary,
          salary1981$: deflated1981(t.salary, my.targetYear),
          slot: t.slot,
          call: t.call,
          trueQ: t.trueQ,
          superstar: t.superstar,
          rank: t.bookRank,
          share: Math.round(t.share * 1000) / 10,
          atCap: t.atCap,
          isPlayer: t.isPlayer,
        })),
    };
  });

  const sf1981 = marketYearStats.find((r) => r.marketId === 'sanfrancisco' && r.year === 1981);

  return {
    generatedAt: new Date().toISOString(),
    config,
    snapCount: snaps.length,
    okSnaps: snaps.filter((s) => s.ok).length,
    totalTalentRows: allTalents.length,
    globalPool: summarizePool(allTalents, 'all markets/years pooled'),
    globalBySlot: bySlotSummary(allTalents),
    globalWinnersLosers: compareWinnersLosers(allTalents),
    marketYearStats: marketYearStats.sort(
      (a, b) => a.year - b.year || a.marketId.localeCompare(b.marketId),
    ),
    sanFrancisco1981: sf1981 || null,
    interpretation: {
      chatgptAuditFocus:
        'Tail concentration (2×/5×/10× market median), morning vs evening spread, top-book vs bottom-book pay, cap-hit rate for franchise-tier hosts.',
      nominalNote:
        'salary1981$ uses rough CPI deflator for cross-era intuition only — game uses nominal $ for that calendar year.',
      realismHypothesis:
        'If pctAt5x and morning/evening ratios are low and pctAtCap is high, stars may not feel like franchise assets despite share/tenure hooks.',
    },
  };
}

function renderMd(report) {
  const lines = [];
  lines.push('# Talent salary concentration audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Global pool (all snapshots pooled)');
  lines.push('');
  const g = report.globalPool;
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| On-air talent rows | ${g.n} |`);
  lines.push(`| Median salary | $${(g.median || 0).toLocaleString()}/yr |`);
  lines.push(`| P90 / P95 / P99 | $${g.p90?.toLocaleString() || '—'} / $${g.p95?.toLocaleString() || '—'} / $${g.p99?.toLocaleString() || '—'} |`);
  lines.push(`| Max (max/median) | $${g.max?.toLocaleString() || '—'} (${g.maxOverMedian || '—'}×) |`);
  lines.push(`| Share ≥2× median | ${g.pctAt2x}% (${g.countAt2x}) |`);
  lines.push(`| Share ≥3× median | ${g.pctAt3x}% (${g.countAt3x}) |`);
  lines.push(`| Share ≥5× median | ${g.pctAt5x}% (${g.countAt5x}) |`);
  lines.push(`| Share ≥10× median | ${g.pctAt10x}% (${g.countAt10x}) |`);
  lines.push(`| At estimated cap | ${g.pctAtCap}% |`);
  lines.push(`| Superstar flag | ${g.pctSuperstar}% |`);
  lines.push(`| True Q ≥85 | ${g.pctTrueQ85}% |`);
  lines.push('');
  lines.push('## By daypart (global)');
  lines.push('');
  lines.push('| Daypart | N | Median | P99 | Max | ≥3× med | ≥5× med |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const sl of SLOT_ORDER) {
    const b = report.globalBySlot[sl];
    if (!b || !b.n) continue;
    lines.push(
      `| ${SLOT_LABEL[sl] || sl} | ${b.n} | $${b.median.toLocaleString()} | $${b.p99?.toLocaleString() || '—'} | $${b.max.toLocaleString()} | ${b.pctAt3x}% | ${b.pctAt5x}% |`,
    );
  }
  lines.push('');
  lines.push('## Winning vs losing stations (global)');
  lines.push('');
  for (const [k, v] of Object.entries(report.globalWinnersLosers)) {
    if (!v.n) continue;
    lines.push(`**${v.label}** — median $${v.median.toLocaleString()}, max $${v.max.toLocaleString()} (${v.maxOverMedian}× med), ≥5×: ${v.pctAt5x}%`);
  }
  lines.push('');
  lines.push('## By market × target year');
  lines.push('');
  for (const row of report.marketYearStats) {
    const p = row.pool;
    lines.push(`### ${row.marketId} · ${row.year} (${row.rankTier})`);
    lines.push('');
    lines.push(
      `Median **$${p.median.toLocaleString()}** · P99 **$${p.p99?.toLocaleString()}** · Max **$${p.max.toLocaleString()}** (${p.maxOverMedian}×) · ≥5× median: **${p.pctAt5x}%** · at cap: **${p.pctAtCap}%**`,
    );
    if (row.morningVsEveningTop) {
      const m = row.morningVsEveningTop;
      lines.push(
        `Morning max **$${m.morningMax.toLocaleString()}** (${m.morningCall}) vs evening max **$${m.eveningMax.toLocaleString()}** (${m.eveningCall}) → **${m.ratio}×**`,
      );
    }
    const top = row.topEarners?.[0];
    if (top) {
      lines.push(
        `Top earner: **$${top.salary.toLocaleString()}** (~$${top.salary1981$?.toLocaleString()} in 1981$) · ${top.slot} · ${top.call} · Q${top.trueQ}${top.superstar ? ' ★' : ''}${top.atCap ? ' (at cap)' : ''}`,
      );
    }
    lines.push('');
  }
  if (report.sanFrancisco1981) {
    lines.push('## San Francisco 1981 (ChatGPT evening-host check)');
    lines.push('');
    const sf = report.sanFrancisco1981;
    lines.push('Top earners:');
    lines.push('');
    lines.push('| Salary | ~1981$ | Slot | Station | Q | Rank |');
    lines.push('| ---: | ---: | --- | --- | ---: | ---: |');
    for (const t of sf.topEarners || []) {
      lines.push(
        `| $${t.salary.toLocaleString()} | $${t.salary1981$?.toLocaleString()} | ${t.slot} | ${t.call} | ${t.trueQ} | #${t.rank || '?'} |`,
      );
    }
    lines.push('');
  }
  lines.push('## Verdict vs ChatGPT audit');
  lines.push('');
  lines.push(report.interpretation.realismHypothesis);
  lines.push('');
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const vmCache = new Map();
  const snaps = [];
  let idx = 0;

  for (const marketId of config.markets) {
    if (!vmCache.has(marketId)) vmCache.set(marketId, loadVm(marketId));
    const ctx = vmCache.get(marketId);

    for (const targetYear of config.years) {
      const startYear = config.startYearFor(targetYear);
      for (let s = 0; s < config.seeds; s++) {
        const seed = (config.seed + idx * 9913) >>> 0;
        idx += 1;
        const snap = vm.runInContext(
          `__wlRunSalaryConcentrationSnap(${JSON.stringify({
            marketId,
            startYear,
            targetYear,
            seed,
          })})`,
          ctx,
        );
        snaps.push(snap);
        if (!snap.ok) console.error(`FAIL ${marketId} ${targetYear}: ${snap.error}`);
      }
    }
  }

  const report = buildReport(snaps, config);
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(outMd, `${renderMd(report)}\n`, 'utf8');
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  const g = report.globalPool;
  console.log(
    `Global: median $${g.median?.toLocaleString()} max ${g.maxOverMedian}× median · ≥5×: ${g.pctAt5x}% · at cap: ${g.pctAtCap}%`,
  );
}

main();
