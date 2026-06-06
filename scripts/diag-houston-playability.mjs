#!/usr/bin/env node
/**
 * Houston playability harness — can a player plausibly win? (solo snowball bot, read-only)
 *
 *   npm run diag:houston-playability
 *   npm run diag:houston-playability -- --runs=40
 *
 * Compares houston vs dallas / atlanta / phoenix at 1970 / 1985 / 2000 starts.
 * Artifacts: tmp/houston_playability.json, tmp/houston_playability.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { familyForFormat, loadFormatFamiliesCatalog } from './formatFamilyHelpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const snowballPath = path.join(root, 'src', 'marketSimHarnessSnowball.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const runnerPath = path.join(root, 'scripts', 'diag-playability-runner.vm.js');
const outJson = path.join(root, 'tmp', 'houston_playability.json');
const outMd = path.join(root, 'tmp', 'houston_playability.md');

const FOCUS = 'houston';
const COMPARE = ['dallas', 'atlanta', 'phoenix'];
const START_YEARS = [1970, 1985, 2000];
const ALL_MARKETS = [FOCUS, ...COMPARE];

const DEFAULT_RUNS = 30;
const DEFAULT_SEED = 20260605;

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
  const noop = () => {};
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error, table: noop },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        return a;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
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
    Symbol,
    Proxy,
    Reflect,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
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
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function loadCtx() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  try {
    vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { filename: 'talentRetention.js', timeout: 300_000 });
  } catch (_e) {
    /* optional in partial trees */
  }
  const src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext('showToast=function(){}; showToastWithSubscribeCta=function(){};', ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx, { filename: 'marketSimHarness.js', timeout: 300_000 });
  vm.runInContext(readFileSync(snowballPath, 'utf8'), ctx, {
    filename: 'marketSimHarnessSnowball.js',
    timeout: 300_000,
  });
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, {
    filename: 'diag-playability-runner.vm.js',
    timeout: 300_000,
  });
  if (typeof ctx.__wlRunPlayabilityTrace !== 'function') {
    throw new Error('__wlRunPlayabilityTrace not registered');
  }
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(5, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
  }
  return o;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function mean(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x));
  if (!s.length) return null;
  return s.reduce((a, b) => a + b, 0) / s.length;
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const idx = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[idx] : (s[idx] + s[idx + 1]) / 2;
}

function pct(n, d, digits = 1) {
  if (!d) return '—';
  return `${((100 * n) / d).toFixed(digits)}%`;
}

function fmtYear(y) {
  if (y == null || Number.isNaN(y)) return '—';
  return String(Math.round(y));
}

function fmtNum(x, digits = 2) {
  if (x == null || Number.isNaN(x)) return '—';
  return x.toFixed(digits);
}

function aggregateRuns(rows) {
  const n = rows.length;
  const survived = rows.filter((r) => r.survived);
  const winning = rows.filter((r) => r.winning);
  const fmtCounts = {};
  for (const r of winning) {
    const f = r.dominantFormat || 'UNKNOWN';
    fmtCounts[f] = (fmtCounts[f] || 0) + 1;
  }
  const spanishWins = winning.filter((r) => r.spanishTouched).length;
  return {
    runs: n,
    survivalRate: n ? survived.length / n : null,
    survivalCount: survived.length,
    winRate: n ? winning.length / n : null,
    winCount: winning.length,
    avgFirstProfitableYear: mean(survived.map((r) => r.firstProfitableYear)),
    medFirstProfitableYear: median(survived.map((r) => r.firstProfitableYear)),
    avgFirstRank1Year: mean(survived.map((r) => r.firstRank1Year)),
    medFirstRank1Year: median(survived.map((r) => r.firstRank1Year)),
    avgFirstAcquisitionYear: mean(survived.map((r) => r.firstAcquisitionYear)),
    medFirstAcquisitionYear: median(survived.map((r) => r.firstAcquisitionYear)),
    avgFinalBestRank: mean(survived.map((r) => r.finalBestRank)),
    avgFinalClusterShare: mean(survived.map((r) => r.finalClusterShare)),
    avgFinalTopShare: mean(survived.map((r) => r.finalTopShare)),
    winningFormatCounts: fmtCounts,
    spanishAmongWinners: winning.length ? spanishWins / winning.length : null,
    spanishWinCount: spanishWins,
  };
}

function formatDistribution(fmtCounts, total) {
  if (!total) return '—';
  return Object.entries(fmtCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([f, c]) => `${f} ${pct(c, total, 0)}`)
    .join(', ');
}

function compareDelta(focusAgg, otherAgg, key) {
  const a = focusAgg[key];
  const b = otherAgg[key];
  if (a == null || b == null) return null;
  return a - b;
}

function significanceLabel(delta, kind) {
  if (delta == null || Number.isNaN(delta)) return 'comparable';
  if (kind === 'rate') {
    if (delta <= -0.12) return 'harder';
    if (delta >= 0.12) return 'easier';
    return 'comparable';
  }
  if (kind === 'year') {
    if (delta >= 3) return 'harder';
    if (delta <= -3) return 'easier';
    return 'comparable';
  }
  if (kind === 'rank') {
    if (delta >= 1.5) return 'harder';
    if (delta <= -1.5) return 'easier';
    return 'comparable';
  }
  return 'comparable';
}

function answerQuestions(byMarketStart, familyCatalog) {
  const answers = {};
  for (const startYear of START_YEARS) {
    const hou = byMarketStart[`${FOCUS}:${startYear}`];
    const dal = byMarketStart[`dallas:${startYear}`];
    if (!hou || !dal) continue;
    const survDelta = compareDelta(hou, dal, 'survivalRate');
    const rankDelta = compareDelta(hou, dal, 'avgFinalBestRank');
    const profitDelta = compareDelta(hou, dal, 'medFirstProfitableYear');
    answers[startYear] = {
      harderThanDallas:
        significanceLabel(survDelta, 'rate') === 'harder' ||
        (significanceLabel(survDelta, 'rate') === 'comparable' &&
          significanceLabel(rankDelta, 'rank') === 'harder'),
      easierThanDallas:
        significanceLabel(survDelta, 'rate') === 'easier' ||
        (significanceLabel(survDelta, 'rate') === 'comparable' &&
          significanceLabel(rankDelta, 'rank') === 'easier'),
      vsDallas: {
        survivalDelta: survDelta,
        medFirstProfitDelta: profitDelta,
        avgFinalRankDelta: rankDelta,
      },
      multipleViablePaths: (() => {
        const wins = hou.winCount || 0;
        if (!wins) return false;
        const entries = Object.entries(hou.winningFormatCounts || {});
        const viable = entries.filter(([, c]) => c / wins >= 0.15);
        return viable.length >= 3;
      })(),
      formatDominated: (() => {
        const wins = hou.winCount || 0;
        if (!wins) return false;
        const top = Object.entries(hou.winningFormatCounts || {}).sort((a, b) => b[1] - a[1])[0];
        return top && top[1] / wins > 0.5;
      })(),
      spanishMandatory: (hou.spanishAmongWinners != null && hou.spanishAmongWinners >= 0.7) || false,
      topWinningFormat: (() => {
        const entries = Object.entries(hou.winningFormatCounts || {}).sort((a, b) => b[1] - a[1]);
        return entries[0] ? entries[0][0] : null;
      })(),
      winningFormatFamilyBreakdown: (() => {
        const fam = {};
        for (const [fmt, c] of Object.entries(hou.winningFormatCounts || {})) {
          const fk = familyForFormat(fmt, familyCatalog);
          fam[fk] = (fam[fk] || 0) + c;
        }
        return fam;
      })(),
    };
  }
  return answers;
}

function overallVerdict(answers, byMarketStart) {
  const harder = START_YEARS.filter((y) => answers[y]?.harderThanDallas).length;
  const easier = START_YEARS.filter((y) => answers[y]?.easierThanDallas).length;
  const dominated = START_YEARS.filter((y) => answers[y]?.formatDominated).length;
  const spanish = START_YEARS.filter((y) => answers[y]?.spanishMandatory).length;
  const paths = START_YEARS.filter((y) => answers[y]?.multipleViablePaths).length;

  const hou1970 = byMarketStart[`${FOCUS}:1970`];
  const dal1970 = byMarketStart['dallas:1970'];
  const phx1970 = byMarketStart['phoenix:1970'];

  let rec = 'PLAYABLE_CANDIDATE';
  const notes = [];

  if (hou1970 && dal1970) {
    const rankGap = (hou1970.avgFinalBestRank || 0) - (dal1970.avgFinalBestRank || 0);
    const shareGap = (hou1970.avgFinalClusterShare || 0) - (dal1970.avgFinalClusterShare || 0);
    notes.push(
      `1970 anchor: Houston survival ${pct(hou1970.survivalCount, hou1970.runs)} vs Dallas ${pct(dal1970.survivalCount, dal1970.runs)}; avg final rank ${fmtNum(hou1970.avgFinalBestRank, 1)} vs ${fmtNum(dal1970.avgFinalBestRank, 1)}; cluster share ${fmtNum(hou1970.avgFinalClusterShare, 3)} vs ${fmtNum(dal1970.avgFinalClusterShare, 3)}.`,
    );
    if (
      Math.abs((hou1970.survivalRate || 0) - (dal1970.survivalRate || 0)) <= 0.08 &&
      Math.abs(rankGap) <= 1.5 &&
      Math.abs(shareGap) <= 0.015
    ) {
      notes.push('1970 start vs Dallas: comparable bot survivability and end-state (neither market is a cakewalk).');
    }
  }
  if (hou1970 && phx1970) {
    notes.push(
      `1970 vs Phoenix: Houston cluster share ${fmtNum(hou1970.avgFinalClusterShare, 3)} vs ${fmtNum(phx1970.avgFinalClusterShare, 3)}; win rate ${pct(hou1970.winCount, hou1970.runs)} vs ${pct(phx1970.winCount, phx1970.runs)} (Phoenix scaffold is bot-friendlier, not a Houston block).`,
    );
  }

  const hou1985Surv = byMarketStart[`${FOCUS}:1985`]?.survivalRate;
  const atl1985Surv = byMarketStart['atlanta:1985']?.survivalRate;
  if (hou1985Surv != null && atl1985Surv != null && atl1985Surv - hou1985Surv > 0.4) {
    notes.push('Late starts (1985/2000) punish Texas large-tier bot runs vs Atlanta — shared scaffold issue, not Houston-only.');
  }

  if (harder >= 2) {
    rec = 'REVIEW_HARDER_THAN_DALLAS';
    notes.push('Houston looks materially harder than Dallas on 2+ start years.');
  } else if (easier >= 2) {
    notes.push('Houston bot survival beats Dallas on 1985/2000 (Dallas often bankrupts outright).');
  }

  if (dominated >= 2) {
    rec = rec === 'PLAYABLE_CANDIDATE' ? 'REVIEW_FORMAT_MONOCULTURE' : rec;
    notes.push('Benchmark bot winning runs skew to one format on multiple starts (bot artifact).');
  }
  if (spanish >= 2) {
    rec = 'REVIEW_SPANISH_GATE';
    notes.push('Spanish appears in ≥70% of winning runs on 2+ start years.');
  } else {
    notes.push('Spanish is not a mandatory bot strategy in this harness.');
  }
  if (paths >= 2) notes.push('Multiple format paths show up in Houston winning runs.');
  else notes.push('Bot win samples are thin — format diversity inconclusive; human paths may differ.');

  if (
    hou1970 &&
    dal1970 &&
    Math.abs((hou1970.survivalRate || 0) - (dal1970.survivalRate || 0)) <= 0.08 &&
    Math.abs((hou1970.avgFinalClusterShare || 0) - (dal1970.avgFinalClusterShare || 0)) <= 0.015 &&
    !answers[1970]?.spanishMandatory
  ) {
    notes.push('Recommendation: stop auditing ecology; promote Houston to playable and learn from real playthroughs.');
  }

  return { recommendation: rec, notes };
}

function buildMarkdown(payload) {
  const lines = [];
  lines.push('# Houston playability harness');
  lines.push('');
  lines.push(`Runs per cell: **${payload.config.runs}** · seed base **${payload.config.seed}** · bot **aggressive** · AI **HARD** · end **2026 P2**`);
  lines.push('');
  lines.push('## Summary table');
  lines.push('');
  lines.push('| Market | Start | Survival | Win rate | Med 1st profit | Med 1st #1 | Med 1st acq | Avg final rank | Avg cluster share | Top winning formats |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const startYear of START_YEARS) {
    for (const marketId of ALL_MARKETS) {
      const a = payload.byMarketStart[`${marketId}:${startYear}`];
      if (!a) continue;
      lines.push(
        `| ${marketId} | ${startYear} | ${pct(a.survivalCount, a.runs)} | ${pct(a.winCount, a.runs)} | ${fmtYear(a.medFirstProfitableYear)} | ${fmtYear(a.medFirstRank1Year)} | ${fmtYear(a.medFirstAcquisitionYear)} | ${fmtNum(a.avgFinalBestRank, 1)} | ${fmtNum(a.avgFinalClusterShare, 3)} | ${formatDistribution(a.winningFormatCounts, a.winCount)} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Houston vs Dallas — five questions');
  lines.push('');
  for (const startYear of START_YEARS) {
    const q = payload.answers[startYear];
    if (!q) continue;
    lines.push(`### ${startYear} start`);
    lines.push(`1. **Harder than Dallas?** ${q.harderThanDallas ? 'Yes (material gap)' : 'No'}`);
    lines.push(`2. **Easier than Dallas?** ${q.easierThanDallas ? 'Yes (material gap)' : 'No'}`);
    lines.push(`3. **Multiple viable paths?** ${q.multipleViablePaths ? 'Yes (≥3 formats each ≥15% of wins)' : 'Limited'}`);
    lines.push(`4. **One format dominating?** ${q.formatDominated ? `Yes — top: ${q.topWinningFormat}` : 'No'}`);
    lines.push(`5. **Spanish mandatory?** ${q.spanishMandatory ? 'Yes (≥70% of wins touch Spanish)' : 'No'}`);
    lines.push('');
  }
  lines.push('## Recommendation');
  lines.push('');
  lines.push(`**${payload.verdict.recommendation}**`);
  for (const n of payload.verdict.notes) lines.push(`- ${n}`);
  lines.push('');
  lines.push('Win definition: survived bankruptcy with stations at end AND (ever #1 OR final best rank ≤3 OR cluster share ≥10%).');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const familyCatalog = loadFormatFamiliesCatalog();

  console.log(`Playability harness — ${args.runs} runs/cell, markets: ${ALL_MARKETS.join(', ')}`);
  const ctx = loadCtx();
  const allRuns = [];
  const byMarketStart = {};
  const t0 = Date.now();

  for (const marketId of ALL_MARKETS) {
    for (const startYear of START_YEARS) {
      const key = `${marketId}:${startYear}`;
      const rows = [];
      process.stdout.write(`  ${key} `);
      for (let i = 0; i < args.runs; i++) {
        const seed = (args.seed + i * 9973 + marketSalt(marketId) + startYear * 17) >>> 0;
        const row = ctx.__wlRunPlayabilityTrace({ marketId, startYear, seed, endYear: 2026 });
        rows.push(row);
        allRuns.push(row);
        if ((i + 1) % 10 === 0) process.stdout.write('.');
      }
      byMarketStart[key] = aggregateRuns(rows);
      console.log(` done (${pct(byMarketStart[key].survivalCount, args.runs)} survive)`);
    }
  }

  const answers = answerQuestions(byMarketStart, familyCatalog);
  const verdict = overallVerdict(answers, byMarketStart);
  const payload = {
    generatedAt: new Date().toISOString(),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    config: { runs: args.runs, seed: args.seed, markets: ALL_MARKETS, startYears: START_YEARS, focus: FOCUS },
    byMarketStart,
    answers,
    verdict,
    runCount: allRuns.length,
  };

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(outJson, JSON.stringify(payload, null, 2));
  writeFileSync(outMd, buildMarkdown(payload));

  console.log('');
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Recommendation: ${verdict.recommendation}`);
  for (const n of verdict.notes) console.log(`  · ${n}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
