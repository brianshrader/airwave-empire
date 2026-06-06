#!/usr/bin/env node
/**
 * Tutorial scenario outcome diagnostic — read-only sim analysis (no gameplay changes).
 *
 *   npm run diag:tutorial-outcome
 *   npm run diag:tutorial-outcome -- --runs=50 --seed=20260605
 *
 * Artifacts:
 *   tmp/tutorial_outcome_analysis.json
 *   tmp/tutorial_outcome_analysis.md
 *   tmp/tutorial_funnel_audit.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const runnerPath = path.join(root, 'scripts', 'diag-tutorial-outcome-runner.vm.js');
const outJson = path.join(root, 'tmp', 'tutorial_outcome_analysis.json');
const outMd = path.join(root, 'tmp', 'tutorial_outcome_analysis.md');
const funnelMd = path.join(root, 'tmp', 'tutorial_funnel_audit.md');

const DEFAULT_RUNS = 40;
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
    classList: {
      contains() {
        return false;
      },
      add() {},
      remove() {},
    },
    appendChild() {},
    querySelector() {
      return null;
    },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    getAttribute() {
      return null;
    },
    setAttribute() {},
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() {
    return stubEl();
  },
  getElementById() {
    return stubEl();
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
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
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() {
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class {
      constructor() {}
    },
    FileReader: class {
      readAsText() {}
    },
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
    /* optional */
  }
  const src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(
    'showToast=function(){}; showToastWithSubscribeCta=function(){}; om=function(){}; cm=function(){}; renderAll=function(){}; openProgramming=function(){}; openContract=function(){}; renderManageTalentStation=function(){};',
    ctx,
  );
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx, { filename: 'marketSimHarness.js', timeout: 300_000 });
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, {
    filename: 'diag-tutorial-outcome-runner.vm.js',
    timeout: 300_000,
  });
  if (typeof ctx.__wlRunTutorialOutcomeTrace !== 'function') {
    throw new Error('__wlRunTutorialOutcomeTrace not registered');
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

function fmtNum(x, digits = 2) {
  if (x == null || Number.isNaN(x)) return '—';
  return x.toFixed(digits);
}

function aggregateField(rows, pick, digits = 2) {
  const xs = rows.map(pick).filter((x) => x != null && !Number.isNaN(x));
  if (!xs.length) return { mean: null, median: null, min: null, max: null, n: 0 };
  return {
    mean: mean(xs),
    median: median(xs),
    min: Math.min(...xs),
    max: Math.max(...xs),
    n: xs.length,
  };
}

function buildFunnelAuditMd() {
  return `# Tutorial funnel audit (diagnostic pass)

Generated: ${new Date().toISOString()}

## Checkpoint events in PostHog vs local source

| Event | In PostHog schema | In \`src/legacy.js\` | In \`dist/\` |
|-------|-------------------|----------------------|-------------|
| \`tutorial_checkpoint_first_advance_clicked\` | Yes | **No** | **No** |
| \`tutorial_checkpoint_format_prompt_seen\` | Yes | **No** | **No** |
| \`tutorial_checkpoint_format_changed\` | Yes | **No** | **No** |
| \`tutorial_checkpoint_talent_prompt_seen\` | Yes | **No** | **No** |
| \`tutorial_checkpoint_talent_hired\` | Yes | **No** | **No** |
| \`tutorial_checkpoint_first_summary_seen\` | Yes | **No** | **No** |
| \`tutorial_checkpoint_second_advance_clicked\` | Yes | **No** | **No** |
| \`tutorial_checkpoint_second_summary_seen\` | Yes | **No** | **No** |
| \`tutorial_checkpoint_promotion_section_reached\` | Yes | **No** | **No** |

**Finding:** Checkpoint events exist in the live PostHog project and began firing on **2026-06-02** (first \`first_advance\` on 06-02; bulk checkpoint volume on 06-03). They are **not present in this repository** (\`src/legacy.js\`, \`dist/\`, or \`analyticsClient.js\`). Production analytics and local source are **out of sync** until checkpoint instrumentation is merged here.

## Events wired in local source (tutorial funnel)

| Event | Fire location | Trigger |
|-------|---------------|---------|
| \`guest_tutorial_entered\` | \`tryGuestTutorialAutostart\` (~23917) | Guest lands on tutorial autostart URL |
| \`tutorial_started\` | \`startPlayAsync\` (~24641) | \`genMarket('tutorial_turnaround')\` completes |
| \`tutorial_guide_hidden\` | \`wlTutorialCoachEmergencyDismiss\` (~20926) | User clicks **Continue without guide**; prop \`tutorial_act\` |
| \`tutorial_first_payoff_seen\` | \`tutorialTurnaroundMaybeAdvanceFromAct5\` (~23494) | Act 5→6 after **two** period-summary dismissals |
| \`tutorial_completed\` | \`wlEmitTutorialCompleted\` (~8556) | Act 8 first advance completes (gameplay end) |
| \`tutorial_finished\` | \`wlEmitTutorialFinished\` (~8531) | Grad modal **Now It's Up to You** opens |
| \`tutorial_new_scenario_clicked\` | \`tutorialTurnaroundGradNewScenario\` (~23451) | Grad modal → scenario picker |

## Intended act → checkpoint mapping (from QA doc + coach gates)

| Act | Intended checkpoint (PostHog name) | Expected trigger in code | Local source |
|-----|-----------------------------------|--------------------------|--------------|
| 1 | \`tutorial_checkpoint_first_advance_clicked\` | First \`advTurn\` / Next Period (act 1→2) | **Missing** |
| 2 | (none named) | Research flow | — |
| 3 | \`tutorial_checkpoint_format_prompt_seen\` | Act 3 programming coach / format modal | **Missing** |
| 3 | \`tutorial_checkpoint_format_changed\` | \`tutorialTurnaroundOnFormatChanged\` | **Missing** |
| 4 | \`tutorial_checkpoint_talent_prompt_seen\` | Talent / Replace coach on midday | **Missing** |
| 4 | \`tutorial_checkpoint_talent_hired\` | \`tutorialTurnaroundOnTalentAdjusted\` | **Missing** |
| 5 | \`tutorial_checkpoint_first_summary_seen\` | First act-5 summary dismissed | **Missing** |
| 5 | \`tutorial_checkpoint_second_advance_clicked\` | Second Next Period in act 5 | **Missing** |
| 5 | \`tutorial_checkpoint_second_summary_seen\` | Second act-5 summary dismissed | **Missing** |
| 6 | \`tutorial_checkpoint_promotion_section_reached\` | Act 5→6 promotion intro | **Missing** |
| — | \`tutorial_first_payoff_seen\` | Same beat as promotion handoff (act 5→6) | **Present** |

## Duplicate firing risks (local events)

| Event | Dedup guard | Duplicate risk |
|-------|-------------|----------------|
| \`tutorial_started\` | \`G._wlTutorialStartedCaptured\` | Low — once per game |
| \`tutorial_first_payoff_seen\` | \`G._wlTutorialFirstPayoffCaptured\` | Low |
| \`tutorial_completed\` | \`G._wlTutorialCompletedAnalyticsSent\` | Low |
| \`tutorial_finished\` | \`G._wlTutorialFinishedAnalyticsSent\` | Low |
| \`tutorial_guide_hidden\` | None | **High** — fires on every dismiss click |

## Act 1 abandonment instrumentation

| Step | Instrumented? | Event / signal |
|------|---------------|----------------|
| Intro modal shown | No dedicated event | Only infer via time-to-\`tutorial_guide_hidden\` at act 1 |
| Intro modal dismissed (OK — SHOW ME) | No | \`G._tutorialIntroDone=true\`; no analytics |
| First coach / spotlight on Next Period | No | — |
| First Next Period click | **Checkpoint only (not in repo)** | \`tutorial_checkpoint_first_advance_clicked\` in prod |
| Guide dismissed at act 1 | Partial | \`tutorial_guide_hidden\` + \`tutorial_act:1\` |

**PostHog (last 90d):** \`tutorial_started\` 145 users → \`tutorial_first_payoff_seen\` 25 (17%) → \`tutorial_completed\` 8 (5.5%). \`tutorial_guide_hidden\` clusters at acts **1, 3, 4** (heavy act 1 on high-traffic days).

### Minimal instrumentation recommended (not implemented this pass)

1. \`tutorial_intro_dismissed\` — intro modal OK (\`tutorialTurnaroundOnTutorialModalClosed\`)
2. \`tutorial_first_next_period_clicked\` — act 1 advance (mirror prod checkpoint in source)
3. Merge all \`tutorial_checkpoint_*\` from production into \`src/legacy.js\` with act-level dedupe flags
4. \`tutorial_guide_hidden\` session dedupe OR add \`tutorial_guide_hidden_once\` for funnel cleanliness

`;
}

function buildOutcomeMd(summary, runs) {
  const s = summary;
  const lines = [];
  lines.push('# Tutorial scenario outcome analysis');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('- Scenario: `tutorial_turnaround` (Atlanta 1970), headless VM');
  lines.push('- Path: **TOP 40** format (`doFmt`) → advance → best midday replace → focus midday → advance → advance');
  lines.push('- Does **not** include act 1 pre-research advance or act 2 research (isolates format/talent payoff)');
  lines.push(`- Seeds: ${runs.length} runs, base seed ${summary.options.seed}`);
  lines.push('');
  lines.push('## Starting position (avg / med)');
  lines.push('');
  lines.push(`| Metric | Mean | Median | Min | Max |`);
  lines.push(`|--------|------|--------|-----|-----|`);
  lines.push(
    `| Share % | ${fmtNum(s.start.sharePct.mean, 1)} | ${fmtNum(s.start.sharePct.median, 1)} | ${fmtNum(s.start.sharePct.min, 1)} | ${fmtNum(s.start.sharePct.max, 1)} |`,
  );
  lines.push(
    `| Rank | ${fmtNum(s.start.rank.mean, 1)} | ${fmtNum(s.start.rank.median, 0)} | ${s.start.rank.min} | ${s.start.rank.max} |`,
  );
  lines.push(
    `| Revenue / period | $${Math.round(s.start.revenue.mean || 0).toLocaleString()} | $${Math.round(s.start.revenue.median || 0).toLocaleString()} | $${Math.round(s.start.revenue.min || 0).toLocaleString()} | $${Math.round(s.start.revenue.max || 0).toLocaleString()} |`,
  );
  lines.push('');
  lines.push('## Cumulative change from start');
  lines.push('');
  lines.push('### After format only (no advance)');
  lines.push(renderDeltaRow(s.afterFormat));
  lines.push('');
  lines.push('### After first advance post-format');
  lines.push(renderDeltaRow(s.afterFirstAdvance));
  lines.push('');
  lines.push('### After talent + focus (before act-5 books)');
  lines.push(renderDeltaRow(s.afterTalent));
  lines.push('');
  lines.push('### After second advance (≈ first act-5 book)');
  lines.push(renderDeltaRow(s.afterSecondAdvance));
  lines.push('');
  lines.push('### After third advance (≈ second act-5 book — **first payoff gate**)');
  lines.push(renderDeltaRow(s.afterThirdAdvance));
  lines.push('');
  lines.push('## Reward frequency (heuristics)');
  lines.push('');
  lines.push('| Threshold | After 1st advance | After 2nd advance | After 3rd advance |');
  lines.push('|-----------|-------------------|-------------------|-------------------|');
  lines.push(
    `| Meaningful (+0.5pp share OR +2 rank OR +10% rev) | ${pct(s.flags.meaningfulAfterFirstAdvance.count, runs.length)} | ${pct(s.flags.meaningfulAfterSecondAdvance.count, runs.length)} | ${pct(s.flags.meaningfulAfterThirdAdvance.count, runs.length)} |`,
  );
  lines.push(
    `| Obvious win (+1.5pp share OR +3 rank OR +18% rev) | — | ${pct(s.flags.obviousWinAfterSecondAdvance.count, runs.length)} | ${pct(s.flags.obviousWinAfterThirdAdvance.count, runs.length)} |`,
  );
  lines.push('');
  lines.push('> **Note:** Share is unchanged immediately after `doFmt` until the next `advTurn` recalc. Revenue can drop right after format flip (`calcRev` on TOP 40) while audience share is still on the old book — matching the in-game “soft book” coach.');
  lines.push('');
  lines.push('## Answers');
  lines.push('');
  lines.push(`1. **Obvious visible improvement?** ${s.answers.obviousImprovement}`);
  lines.push(`2. **Meaningful ratings growth often?** ${s.answers.meaningfulGrowthOften}`);
  lines.push(`3. **Large enough to feel rewarding?** ${s.answers.feelRewarding}`);
  lines.push('');
  lines.push('## Diagnostic conclusions (A–D)');
  lines.push('');
  lines.push('See `tmp/tutorial_funnel_audit.md` for checkpoint / Act 1 instrumentation detail.');
  lines.push('');
  return lines.join('\n');
}

function renderDeltaRow(block) {
  return `| Δ Share (pp) | ${fmtNum(block.shareDeltaPp.mean, 2)} avg / ${fmtNum(block.shareDeltaPp.median, 2)} med | range ${fmtNum(block.shareDeltaPp.min, 2)} – ${fmtNum(block.shareDeltaPp.max, 2)} |
| Δ Rank | ${fmtNum(block.rankDelta.mean, 2)} avg / ${fmtNum(block.rankDelta.median, 0)} med | range ${block.rankDelta.min} – ${block.rankDelta.max} |
| Δ Revenue % | ${fmtNum(block.revenueDeltaPct.mean, 1)} avg / ${fmtNum(block.revenueDeltaPct.median, 1)} med | range ${fmtNum(block.revenueDeltaPct.min, 1)} – ${fmtNum(block.revenueDeltaPct.max, 1)} |`;
}

function summarizeRuns(runs, options) {
  const pick = (fn) => runs.map(fn);
  const fromStart = (key) =>
    aggregateField(runs, (r) => r.milestones[`deltaFromStartAfter${key}`]?.shareDeltaPp);
  const fromStartRank = (key) =>
    aggregateField(runs, (r) => r.milestones[`deltaFromStartAfter${key}`]?.rankDelta);
  const fromStartRev = (key) =>
    aggregateField(runs, (r) => r.milestones[`deltaFromStartAfter${key}`]?.revenueDeltaPct);

  const flags = {
    meaningfulAfterFirstAdvance: {
      count: runs.filter((r) => r.flags.meaningfulAfterFirstAdvance).length,
    },
    meaningfulAfterSecondAdvance: {
      count: runs.filter((r) => r.flags.meaningfulAfterSecondAdvance).length,
    },
    meaningfulAfterThirdAdvance: {
      count: runs.filter((r) => r.flags.meaningfulAfterThirdAdvance).length,
    },
    obviousWinAfterSecondAdvance: {
      count: runs.filter((r) => r.flags.obviousWinAfterSecondAdvance).length,
    },
    obviousWinAfterThirdAdvance: {
      count: runs.filter((r) => r.flags.obviousWinAfterThirdAdvance).length,
    },
  };

  const thirdObvious = flags.obviousWinAfterThirdAdvance.count / runs.length;
  const thirdMeaningful = flags.meaningfulAfterThirdAdvance.count / runs.length;

  let obviousImprovement = 'Mixed';
  if (thirdObvious >= 0.6) obviousImprovement = 'Yes — most seeds show a dramatic move by the second act-5 book';
  else if (thirdObvious >= 0.35) obviousImprovement = 'Sometimes — noticeable in a minority of seeds';
  else obviousImprovement = 'No — rarely produces a “whoa” moment even with optimal picks';

  let meaningfulGrowthOften = `${pct(flags.meaningfulAfterThirdAdvance.count, runs.length)} of runs at payoff gate`;
  let feelRewarding = 'Borderline';
  if (thirdMeaningful >= 0.7 && (fromStart('ThirdAdvance').median || 0) >= 0.8) {
    feelRewarding = 'Yes at payoff gate, but timing is late';
  } else if (thirdMeaningful < 0.4) {
    feelRewarding = 'No — gains too small or inconsistent';
  } else {
    feelRewarding = 'Weak — modest bumps, easy to miss on a busy summary screen';
  }

  return {
    options,
    start: {
      sharePct: aggregateField(runs, (r) => r.milestones.start.sharePct),
      rank: aggregateField(runs, (r) => r.milestones.start.rank),
      revenue: aggregateField(runs, (r) => r.milestones.start.revenue),
    },
    afterFormat: {
      shareDeltaPp: aggregateField(runs, (r) => r.milestones.deltaAfterFormat?.shareDeltaPp),
      rankDelta: aggregateField(runs, (r) => r.milestones.deltaAfterFormat?.rankDelta),
      revenueDeltaPct: aggregateField(runs, (r) => r.milestones.deltaAfterFormat?.revenueDeltaPct),
    },
    afterFirstAdvance: {
      shareDeltaPp: fromStart('FirstAdvance'),
      rankDelta: fromStartRank('FirstAdvance'),
      revenueDeltaPct: fromStartRev('FirstAdvance'),
    },
    afterTalent: {
      shareDeltaPp: aggregateField(runs, (r) => {
        const a = r.milestones.afterTalent;
        const b = r.milestones.start;
        return a && b ? a.sharePct - b.sharePct : null;
      }),
      rankDelta: aggregateField(runs, (r) => {
        const a = r.milestones.afterTalent;
        const b = r.milestones.start;
        return a && b && a.rank != null && b.rank != null ? b.rank - a.rank : null;
      }),
      revenueDeltaPct: aggregateField(runs, (r) => r.milestones.deltaFromStartAfterFirstAdvance?.revenueDeltaPct),
    },
    afterSecondAdvance: {
      shareDeltaPp: fromStart('SecondAdvance'),
      rankDelta: fromStartRank('SecondAdvance'),
      revenueDeltaPct: fromStartRev('SecondAdvance'),
    },
    afterThirdAdvance: {
      shareDeltaPp: fromStart('ThirdAdvance'),
      rankDelta: fromStartRank('ThirdAdvance'),
      revenueDeltaPct: fromStartRev('ThirdAdvance'),
    },
    flags,
    answers: {
      obviousImprovement,
      meaningfulGrowthOften,
      feelRewarding,
    },
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const ctx = loadCtx();
  const runs = [];
  for (let i = 0; i < opts.runs; i++) {
    const seed = opts.seed + i * 9973;
    try {
      const row = ctx.__wlRunTutorialOutcomeTrace({ seed, marketId: 'atlanta' });
      runs.push(row);
    } catch (err) {
      console.error(`Run seed ${seed} failed:`, err.message);
    }
  }
  if (!runs.length) {
    console.error('All runs failed');
    process.exit(1);
  }

  const summary = summarizeRuns(runs, opts);
  const payload = {
    generatedAt: new Date().toISOString(),
    options: opts,
    summary,
    runs,
    posthogFunnelNote: {
      period: 'last 90 days',
      tutorial_started: 145,
      tutorial_first_payoff_seen: 25,
      tutorial_completed: 8,
      payoffConversionPct: 17.2,
      completionConversionPct: 5.5,
    },
  };

  writeFileSync(outJson, JSON.stringify(payload, null, 2));
  writeFileSync(outMd, buildOutcomeMd(summary, runs));
  writeFileSync(funnelMd, buildFunnelAuditMd());

  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${funnelMd}`);
  console.log('');
  console.log(buildOutcomeMd(summary, runs));
}

main();
