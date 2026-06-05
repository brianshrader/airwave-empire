#!/usr/bin/env node
/**
 * Audit successor recovery timing — internal vs external artifact diagnosis.
 *
 *   npm run diag:successor-recovery-timing
 *   npm run diag:successor-recovery-timing -- --runs=2
 *
 * Output: tmp/successor_recovery_timing_audit.json, tmp/successor_recovery_timing_audit.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { buildRecoveryReport } from './successorRecoveryMetrics.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const ceilingPath = path.join(root, 'src', 'morningSuccessorCeiling.js');
const helpersPath = path.join(root, 'scripts/successorRecoveryRunnerHelpers.vm.js');
const runnerPath = path.join(root, 'scripts/diag-successor-recovery-timing-runner.vm.js');
const outJson = path.join(root, 'tmp', 'successor_recovery_timing_audit.json');
const outMd = path.join(root, 'tmp', 'successor_recovery_timing_audit.md');

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

function makeToastStackStub() {
  const children = [];
  return {
    appendChild(el) {
      children.push(el);
    },
    removeChild(el) {
      const i = children.indexOf(el);
      if (i >= 0) children.splice(i, 1);
    },
    get children() {
      return children;
    },
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
  getElementById(id) {
    if (id === 'wl-toast-stack') return makeToastStackStub();
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
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
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

function loadVm(marketId) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  try {
    vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  } catch (_e) {
    /* optional */
  }
  vm.runInContext(readFileSync(ceilingPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(helpersPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(
    injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
    ctx,
    { filename: 'legacy.js', timeout: 600_000 },
  );
  vm.runInContext('showToast=function(){};', ctx);
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 2,
    seed: 20260601,
    markets: [...ALL_PLAYABLE_MARKET_IDS],
    startYears: [1970, 1985, 2000],
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || o.runs);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--markets=')) {
      o.markets = a
        .slice(10)
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return o;
}

function mean(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x));
  if (!a.length) return null;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function median(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((100 * n) / d * 100) / 100;
}

function bucketTiming(ev) {
  if (ev.finalStatus === 'vacancy_still_open' || ev.fillTiming === 'vacancy_opened') {
    return ev.filled ? 'delayed_fill' : 'vacancy_still_open';
  }
  if (ev.fillTiming === 'same_turn_fill') return 'same_turn_fill';
  if (ev.fillTiming === 'delayed_fill') return 'delayed_fill';
  return 'other';
}

function summarizeGroup(events, label) {
  const n = events.length;
  const filled = events.filter((e) => e.filled);
  return {
    label,
    count: n,
    filled: filled.length,
    pctRecoveredOriginal: pct(
      events.filter((e) => e.recoveredOriginal).length,
      n,
    ),
    pctRecoveredHarness: pct(events.filter((e) => e.recoveredHarness).length, n),
    medianYearsOriginal: median(
      events.map((e) => e.yearsToRecoverOriginal).filter((y) => y != null),
    ),
    medianYearsHarness: median(
      events.map((e) => e.yearsToRecoverHarness).filter((y) => y != null),
    ),
    pctImmediateRecoverOriginal: pct(
      events.filter((e) => e.immediateRecoverOriginal).length,
      n,
    ),
    pctImmediateRecoverHarness: pct(
      events.filter((e) => e.immediateRecoverHarness).length,
      n,
    ),
    avgOriginalPriorSlotQ: mean(events.map((e) => e.originalPriorSlotQ)),
    avgHarnessTarget: mean(events.map((e) => e.harnessRecoveryTarget)),
    avgReplacementSlotQAtFill: mean(
      filled.map((e) => e.replacementSlotQAtFill).filter((x) => x != null),
    ),
    avgCeilingAtFill: mean(filled.map((e) => e.ceilingAtFill).filter((x) => x != null)),
    pctPriorSlotQLowered: pct(
      events.filter((e) => e.priorSlotQLoweredDuringVacancy).length,
      n,
    ),
    avgVacancyPeriodsBeforeFill: mean(
      filled
        .filter((e) => e.fillTiming === 'delayed_fill')
        .map((e) => e.periodsVacantBeforeFill),
    ),
    avgMinVacancySlotQ: mean(
      events.map((e) => e.minVacancySlotQ).filter((x) => x != null),
    ),
  };
}

function aggregate(results) {
  const events = results.filter((r) => r.ok).flatMap((r) => r.events || []);

  const byTiming = {
    same_turn_fill: summarizeGroup(
      events.filter((e) => bucketTiming(e) === 'same_turn_fill'),
      'same_turn_fill',
    ),
    delayed_fill: summarizeGroup(
      events.filter((e) => bucketTiming(e) === 'delayed_fill'),
      'delayed_fill',
    ),
    vacancy_still_open: summarizeGroup(
      events.filter((e) => bucketTiming(e) === 'vacancy_still_open'),
      'vacancy_still_open',
    ),
  };

  const REPLACEMENT_TYPES = ['internal', 'external', 'cluster'];
  const byTypeAndTiming = {};
  for (const t of REPLACEMENT_TYPES) {
    byTypeAndTiming[t] = {
      all: summarizeGroup(
        events.filter((e) => e.replacementType === t && e.filled),
        t,
      ),
      same_turn: summarizeGroup(
        events.filter(
          (e) => e.replacementType === t && e.fillTiming === 'same_turn_fill',
        ),
        `${t}_same_turn`,
      ),
      delayed: summarizeGroup(
        events.filter(
          (e) => e.replacementType === t && e.fillTiming === 'delayed_fill',
        ),
        `${t}_delayed`,
      ),
    };
  }

  const sameTurnComparable = events.filter(
    (e) =>
      e.fillTiming === 'same_turn_fill' &&
      (e.replacementType === 'internal' || e.replacementType === 'external') &&
      (e.originalPriorSlotQ | 0) >= 90 &&
      (e.originalPriorSlotQ | 0) <= 98,
  );

  const applesInternal = summarizeGroup(
    sameTurnComparable.filter((e) => e.replacementType === 'internal'),
    'apples_internal',
  );
  const applesExternal = summarizeGroup(
    sameTurnComparable.filter((e) => e.replacementType === 'external'),
    'apples_external',
  );

  const harnessVsOriginal = {
    eventsWhereHarnessEasier: events.filter(
      (e) => (e.harnessRecoveryTarget | 0) < (e.originalPriorSlotQ | 0),
    ).length,
    eventsWhereHarnessTargetUsed: events.filter((e) => e.fillTiming === 'delayed_fill').length,
    pctRecoverOriginal: pct(
      events.filter((e) => e.recoveredOriginal).length,
      events.length,
    ),
    pctRecoverHarness: pct(
      events.filter((e) => e.recoveredHarness).length,
      events.length,
    ),
    medianYearsOriginal: median(
      events.map((e) => e.yearsToRecoverOriginal).filter((y) => y != null),
    ),
    medianYearsHarness: median(
      events.map((e) => e.yearsToRecoverHarness).filter((y) => y != null),
    ),
    externalMedianHarness0: median(
      events
        .filter((e) => e.replacementType === 'external' && e.filled)
        .map((e) => e.yearsToRecoverHarness)
        .filter((y) => y != null),
    ),
    externalPctImmediateHarness: pct(
      events.filter((e) => e.replacementType === 'external' && e.immediateRecoverHarness)
        .length,
      events.filter((e) => e.replacementType === 'external' && e.filled).length,
    ),
    externalImmediateDueToLoweredTarget: events.filter(
      (e) =>
        e.replacementType === 'external' &&
        e.immediateRecoverHarness &&
        !e.immediateRecoverOriginal,
    ).length,
  };

  const typeMix = {
    same_turn: {
      internal: events.filter(
        (e) => e.fillTiming === 'same_turn_fill' && e.replacementType === 'internal',
      ).length,
      external: events.filter(
        (e) => e.fillTiming === 'same_turn_fill' && e.replacementType === 'external',
      ).length,
      cluster: events.filter(
        (e) => e.fillTiming === 'same_turn_fill' && e.replacementType === 'cluster',
      ).length,
    },
    delayed: {
      internal: events.filter(
        (e) => e.fillTiming === 'delayed_fill' && e.replacementType === 'internal',
      ).length,
      external: events.filter(
        (e) => e.fillTiming === 'delayed_fill' && e.replacementType === 'external',
      ).length,
      cluster: events.filter(
        (e) => e.fillTiming === 'delayed_fill' && e.replacementType === 'cluster',
      ).length,
    },
    still_open: events.filter((e) => e.finalStatus === 'vacancy_still_open').length,
  };

  const extSameTurn = events.filter(
    (e) => e.replacementType === 'external' && e.fillTiming === 'same_turn_fill',
  );
  const extImmediate = extSameTurn.filter((e) => e.immediateRecoverOriginal);
  const extImmediateImpossible = extImmediate.filter(
    (e) =>
      (e.originalPriorSlotQ | 0) > (e.replacementSlotQAtFill | 0) + 1 &&
      (e.originalPriorSlotQ | 0) >= 90,
  );
  const intSameTurn = events.filter(
    (e) => e.replacementType === 'internal' && e.fillTiming === 'same_turn_fill',
  );

  const immediateRecoverAnalysis = {
    externalSameTurn: extSameTurn.length,
    externalImmediateCount: extImmediate.length,
    externalImmediatePct: pct(extImmediate.length, extSameTurn.length),
    externalImmediateWithPriorGTE90: extImmediate.filter((e) => e.originalPriorSlotQ >= 90)
      .length,
    externalImmediateImpossibleCount: extImmediateImpossible.length,
    externalImmediateAvgPrior: mean(extImmediate.map((e) => e.originalPriorSlotQ)),
    externalImmediateAvgRepl: mean(
      extImmediate.map((e) => e.replacementSlotQAtFill).filter((x) => x != null),
    ),
    internalSameTurn: intSameTurn.length,
    internalImmediateCount: intSameTurn.filter((e) => e.immediateRecoverOriginal).length,
    internalImmediateAvgPrior: mean(
      intSameTurn.filter((e) => e.immediateRecoverOriginal).map((e) => e.originalPriorSlotQ),
    ),
    internalImmediateAvgRepl: mean(
      intSameTurn
        .filter((e) => e.immediateRecoverOriginal)
        .map((e) => e.replacementSlotQAtFill)
        .filter((x) => x != null),
    ),
  };

  const priorBucket = (q) => {
    const n = q | 0;
    if (n < 90) return '85-89';
    if (n < 94) return '90-93';
    return '94+';
  };

  const sameTurnByPriorBucket = {};
  for (const bucket of ['85-89', '90-93', '94+']) {
    for (const t of ['internal', 'external']) {
      const key = `${t}_${bucket}`;
      sameTurnByPriorBucket[key] = summarizeGroup(
        events.filter(
          (e) =>
            e.fillTiming === 'same_turn_fill' &&
            e.replacementType === t &&
            priorBucket(e.originalPriorSlotQ) === bucket,
        ),
        key,
      );
    }
  }

  let verdict = 'measurement_artifact';
  let verdictDetail = '';
  const intSame = applesInternal;
  const extSame = applesExternal;
  if (intSame.count >= 20 && extSame.count >= 20) {
    if (
      (intSame.medianYearsOriginal ?? 99) <= (extSame.medianYearsOriginal ?? 0) ||
      intSame.pctRecoveredOriginal >= extSame.pctRecoveredOriginal
    ) {
      verdict = 'internal_helps_same_turn';
      verdictDetail =
        'On same-turn fills with comparable priorSlotQ 90–98, internal matches or beats external using original departure Q.';
    } else {
      verdict = 'mixed';
      verdictDetail =
        'Same-turn apples-to-apples: external recovers faster despite similar starting slot Q — likely cohort mix within 90–98 band, not vacancy artifact.';
    }
  }
  if (harnessVsOriginal.eventsWhereHarnessEasier > 0) {
    verdictDetail += ` Delayed fills (${harnessVsOriginal.eventsWhereHarnessTargetUsed}): vacancy degrades slot Q before fill; if metrics used fill-time slot Q as target, external would look ${Math.round(harnessVsOriginal.pctRecoverHarness - harnessVsOriginal.pctRecoverOriginal)}pp faster (${harnessVsOriginal.pctRecoverHarness}% vs ${harnessVsOriginal.pctRecoverOriginal}%).`;
  }
  if (immediateRecoverAnalysis.externalImmediateImpossibleCount > 0) {
    verdictDetail += ` Audit flag: ${immediateRecoverAnalysis.externalImmediateImpossibleCount} external same-turn events marked immediate recover while replacement Q < prior Q (possible snap/ordering bug).`;
  }

  return {
    totalSuccessorDepartures: events.length,
    events,
    byTiming,
    byTypeAndTiming,
    typeMix,
    applesToApplesSameTurn: {
      filter: 'same_turn_fill, priorSlotQ 90–98, internal vs external',
      internal: applesInternal,
      external: applesExternal,
      internalAdvantageOriginal:
        (applesInternal.pctRecoveredOriginal || 0) - (applesExternal.pctRecoveredOriginal || 0),
      internalAdvantageMedianYears:
        (applesExternal.medianYearsOriginal ?? 0) - (applesInternal.medianYearsOriginal ?? 0),
    },
    harnessVsOriginal,
    immediateRecoverAnalysis,
    sameTurnByPriorBucket,
    verdict,
    verdictDetail,
    metricRecommendation:
      harnessVsOriginal.eventsWhereHarnessEasier > 0
        ? 'Track recovery against originalPriorSlotQ at successor departure (stored in morningSuccessorCeiling.priorSlotQ), never against post-vacancy degraded slot Q. Split reporting by fillTiming: same_turn vs delayed.'
        : 'Current harness target appears aligned with original priorSlotQ; investigate same-turn cohort separately.',
    gameplayRecommendation:
      verdict === 'gameplay_issue'
        ? 'Consider small internal-only trust bump or +1 initial ceiling for internal only (not full P2 tiered caps).'
        : 'No gameplay change needed until metrics use original priorSlotQ and separate fill timing buckets.',
  };
}

function renderMd(report) {
  const lines = [];
  lines.push('# Successor Recovery Timing Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`**Verdict:** ${report.verdict}`);
  lines.push('');
  lines.push(report.verdictDetail);
  lines.push('');
  lines.push('## Replacement-type × timing');
  lines.push('');
  lines.push('| Timing | Count | Filled | Recover (orig) | Med yrs (orig) | Immediate (orig) | Avg prior Q | Avg repl Q |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const key of ['same_turn_fill', 'delayed_fill', 'vacancy_still_open']) {
    const b = report.byTiming[key];
    lines.push(
      `| ${key} | ${b.count} | ${b.filled} | ${b.pctRecoveredOriginal}% | ${b.medianYearsOriginal ?? '—'} | ${b.pctImmediateRecoverOriginal}% | ${b.avgOriginalPriorSlotQ?.toFixed(1) ?? '—'} | ${b.avgReplacementSlotQAtFill?.toFixed(1) ?? '—'} |`,
    );
  }
  lines.push('');
  lines.push('## Same-turn apples-to-apples (prior Q 90–98)');
  lines.push('');
  const a = report.applesToApplesSameTurn;
  lines.push('| Type | Count | Recover (orig) | Med yrs (orig) | Avg repl Q | Avg ceiling | Immediate |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const t of ['internal', 'external']) {
    const row = a[t];
    lines.push(
      `| ${t} | ${row.count} | ${row.pctRecoveredOriginal}% | ${row.medianYearsOriginal ?? '—'} | ${row.avgReplacementSlotQAtFill?.toFixed(1) ?? '—'} | ${row.avgCeilingAtFill?.toFixed(1) ?? '—'} | ${row.pctImmediateRecoverOriginal}% |`,
    );
  }
  lines.push('');
  lines.push('## Harness vs original target');
  lines.push('');
  lines.push(JSON.stringify(report.harnessVsOriginal, null, 2));
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  lines.push(`- **Metrics:** ${report.metricRecommendation}`);
  lines.push(`- **Gameplay:** ${report.gameplayRecommendation}`);
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log('[diag:successor-recovery-timing]', config);
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const ctx = loadVm(config.markets[0]);
  const results = ctx.__wlRunSuccessorRecoveryTiming(config);
  const aggregated = aggregate(results);
  const events = aggregated.events || [];
  delete aggregated.events;

  const report = {
    generatedAt: new Date().toISOString(),
    config,
    ...aggregated,
    recoveryReportClean: buildRecoveryReport(events),
    sampleEvents: {
      externalImmediateImpossible: events
        .filter(
          (e) =>
            e.replacementType === 'external' &&
            e.immediateRecoverOriginal &&
            (e.originalPriorSlotQ | 0) >= 90 &&
            (e.replacementSlotQAtFill | 0) < (e.originalPriorSlotQ | 0),
        )
        .slice(0, 8)
        .map((e) => ({
          eventId: e.eventId,
          originalPriorSlotQ: e.originalPriorSlotQ,
          replacementSlotQAtFill: e.replacementSlotQAtFill,
          ceilingAtFill: e.ceilingAtFill,
          departingTalentName: e.departingTalentName,
        })),
    },
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, renderMd(report));

  console.log('[diag:successor-recovery-timing] wrote', outJson);
  console.log('Verdict:', report.verdict);
  console.log(JSON.stringify(report.byTiming, null, 2));
  console.log('Apples-to-apples:', JSON.stringify(report.applesToApplesSameTurn, null, 2));
}

main();
