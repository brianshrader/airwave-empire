#!/usr/bin/env node
/**
 * PM Drive elite-quality inflation A/B (diagnostic only — no shipped gameplay changes).
 *
 *   npm run diag:pm-drive-quality-ab
 *   npm run diag:pm-drive-quality-ab -- --runs=2 --variants=A,B,F
 *
 * Outputs:
 *   tmp/pm_drive_quality_ab.json
 *   tmp/pm_drive_quality_ab.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { VARIANTS, VARIANT_DEFS, patchLegacySource } from './diag-pm-drive-quality-ab-patches.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const hooksPath = path.join(root, 'scripts', 'diag-pm-drive-quality-audit-hooks.vm.js');
const runnerPath = path.join(root, 'scripts', 'diag-pm-drive-quality-ab-runner.vm.js');
const outJson = path.join(root, 'tmp', 'pm_drive_quality_ab.json');
const outMd = path.join(root, 'tmp', 'pm_drive_quality_ab.md');

const PRIME = ['morningDrive', 'midday', 'afternoonDrive'];
const PM = 'afternoonDrive';
const DECADE_KEYS = ['1980', '1990', '2000', '2010', '2020'];

const TARGETS = {
  pm98PlusPct: { hi: 10, ideal: 5 },
  pm95PlusPct: { hi: 25, ideal: 18 },
  lowTalentElitePm: { hi: 3 },
  meanOq: { lo: 60, hi: 68 },
  pct9599: { lo: 6, hi: 14 },
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

function loadVm(marketId, variant) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  try {
    vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { timeout: 600_000 });
  } catch (_e) {
    /* optional */
  }
  let legacySrc = patchLegacySource(
    injectHeadlessLaunchNewsGuard(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
    variant,
  );
  vm.runInContext(legacySrc, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext('showToast=function(){};', ctx);
  vm.runInContext(readFileSync(hooksPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 6,
    seed: 20260605,
    markets: [...ALL_PLAYABLE_MARKET_IDS],
    startYear: 1970,
    endYear: 2021,
    variants: [...VARIANTS],
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || o.runs);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--start-year=')) o.startYear = parseInt(a.slice(13), 10) || o.startYear;
    else if (a.startsWith('--end-year=')) o.endYear = parseInt(a.slice(11), 10) || o.endYear;
    else if (a.startsWith('--markets=')) {
      o.markets = a.slice(10).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    } else if (a.startsWith('--variants=')) {
      o.variants = a
        .slice(11)
        .split(',')
        .map((x) => x.trim().toUpperCase())
        .filter((v) => VARIANTS.includes(v));
    }
  }
  return o;
}

function mean(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x));
  if (!a.length) return null;
  return Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 100) / 100;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((100 * n) / d * 100) / 100;
}

function aggregateVariant(variant, results) {
  const ok = results.filter((r) => r.ok);

  const decadeAgg = {};
  for (const y of DECADE_KEYS) {
    decadeAgg[y] = { bySlot: {}, lowTalentElitePm: 0, commercialWeighted: 0 };
    PRIME.forEach((sl) => {
      decadeAgg[y].bySlot[sl] = { ge90: 0, ge95: 0, ge98: 0, denom: 0 };
    });
  }

  let auditPm98 = 0;
  let auditPm99 = 0;
  let auditPm100 = 0;
  let runAiInc = 0;
  let runAi100 = 0;
  let lowTalentElite2020 = 0;
  let commercial2020 = 0;
  let meanOqSum = 0;
  let meanOqRuns = 0;
  let pct9599Weighted = 0;
  let zombieTotal = 0;
  let spiralTotal = 0;
  let certWeighted = 0;
  let playerPmGe95 = 0;
  let playerPmCount = 0;

  for (const r of ok) {
    for (const y of DECADE_KEYS) {
      const snap = r.decades?.[y];
      if (!snap) continue;
      const w = snap.commercialCount || 0;
      decadeAgg[y].commercialWeighted += w;
      decadeAgg[y].lowTalentElitePm += snap.lowTalentElitePm || 0;
      PRIME.forEach((sl) => {
        const bs = snap.bySlot?.[sl];
        if (!bs) return;
        const agg = decadeAgg[y].bySlot[sl];
        agg.ge90 += bs.ge90 || 0;
        agg.ge95 += bs.ge95 || 0;
        agg.ge98 += bs.ge98 || 0;
        agg.denom += bs.denom || 0;
      });
    }

    const aud = r.audit || {};
    auditPm98 += aud.pmExact98 || 0;
    auditPm99 += aud.pmExact99 || 0;
    auditPm100 += aud.pmExact100 || 0;
    runAiInc += aud.runAiIncreases || 0;
    runAi100 += aud.runAiTo100 || 0;

    const eco = r.ecology2020 || {};
    const n = eco.commercialCount || 0;
    commercial2020 += n;
    if (eco.meanOq != null) {
      meanOqSum += eco.meanOq;
      meanOqRuns += 1;
    }
    pct9599Weighted += ((eco.pct9599 || 0) / 100) * n;
    zombieTotal += eco.zombieLike || 0;
    spiralTotal += eco.lowShareSpiral || 0;
    certWeighted += ((eco.certProxyOkPct || 0) / 100) * n;

    const snap2020 = r.decades?.['2020'];
    if (snap2020) lowTalentElite2020 += snap2020.lowTalentElitePm || 0;
    if (snap2020) {
      playerPmGe95 += snap2020.playerPmGe95 || 0;
      playerPmCount += snap2020.playerPmCount || 0;
    }
  }

  const byDecade = {};
  for (const y of DECADE_KEYS) {
    const agg = decadeAgg[y];
    const pm = agg.bySlot[PM] || { denom: 0, ge90: 0, ge95: 0, ge98: 0 };
    const row = { pm: {}, morning: {}, midday: {} };
    PRIME.forEach((sl) => {
      const s = agg.bySlot[sl] || { denom: 0, ge90: 0, ge95: 0, ge98: 0 };
      const key = sl === 'morningDrive' ? 'morning' : sl === 'midday' ? 'midday' : 'pm';
      row[key] = {
        pct90Plus: pct(s.ge90, s.denom),
        pct95Plus: pct(s.ge95, s.denom),
        pct98Plus: pct(s.ge98, s.denom),
        denom: s.denom,
      };
    });
    row.lowTalentElitePm = agg.lowTalentElitePm;
    byDecade[y] = row;
  }

  const pm2020 = byDecade['2020']?.pm || {};

  return {
    variant,
    definition: VARIANT_DEFS[variant],
    runsOk: ok.length,
    runsTotal: results.length,
    byDecade,
    pm2020Pct98Plus: pm2020.pct98Plus ?? null,
    pm2020Pct95Plus: pm2020.pct95Plus ?? null,
    pm2020Pct90Plus: pm2020.pct90Plus ?? null,
    lowTalentElitePm2020: lowTalentElite2020,
    auditExact: { q98: auditPm98, q99: auditPm99, q100: auditPm100 },
    runAi: { increases: runAiInc, to100: runAi100 },
    ecology2020: {
      meanOq: meanOqRuns ? Math.round((meanOqSum / meanOqRuns) * 100) / 100 : null,
      pct9599: commercial2020 ? Math.round((100 * pct9599Weighted) / commercial2020 * 100) / 100 : 0,
      zombieLike: zombieTotal,
      lowShareSpiral: spiralTotal,
      certProxyOkPct: commercial2020 ? Math.round((100 * certWeighted) / commercial2020 * 100) / 100 : 0,
    },
    playerPmGe95,
    playerPmCount,
    hitsPm98Target: (pm2020.pct98Plus ?? 99) <= TARGETS.pm98PlusPct.hi,
    hitsMeanOqBand:
      (() => {
        const m = meanOqRuns ? meanOqSum / meanOqRuns : null;
        return m != null && m >= TARGETS.meanOq.lo && m <= TARGETS.meanOq.hi;
      })(),
  };
}

function scoreVariant(row, baseline) {
  let score = 0;
  const pm98 = row.pm2020Pct98Plus ?? 99;
  const base98 = baseline?.pm2020Pct98Plus ?? 99;
  if (pm98 <= TARGETS.pm98PlusPct.hi) score += 30;
  else if (pm98 < base98 * 0.5) score += 20;
  else if (pm98 < base98 * 0.75) score += 10;

  const pm95 = row.pm2020Pct95Plus ?? 99;
  if (pm95 <= TARGETS.pm95PlusPct.hi) score += 15;
  if (row.lowTalentElitePm2020 <= TARGETS.lowTalentElitePm.hi * okRunsScale(row)) score += 15;

  if (row.hitsMeanOqBand) score += 20;
  if (row.ecology2020.zombieLike <= (baseline?.ecology2020?.zombieLike ?? 999)) score += 10;
  if ((row.runAi?.to100 ?? 999) < (baseline?.runAi?.to100 ?? 999) * 0.25) score += 10;

  return score;
}

function okRunsScale(row) {
  return Math.max(1, row.runsOk || 1);
}

function recommend(rows) {
  const baseline = rows.find((r) => r.variant === 'A');
  const scored = rows
    .map((r) => ({ variant: r.variant, score: scoreVariant(r, baseline), row: r }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const b = rows.find((r) => r.variant === 'B');
  const e = rows.find((r) => r.variant === 'E');
  const f = rows.find((r) => r.variant === 'F');

  let recommended = 'E';
  let patch = 'Variant E (B soft ceiling + PM decay 0.035): smallest combined fix if it hits PM 98+ target without ecology drift.';
  if (f && (f.pm2020Pct98Plus ?? 99) <= TARGETS.pm98PlusPct.hi && f.hitsMeanOqBand) {
    recommended = 'F';
    patch =
      'Variant F (B + decay 0.040) if E still leaves PM 98+ elevated; decay-only (C) is insufficient alone per measurements.';
  } else if (b && (b.pm2020Pct98Plus ?? 99) <= TARGETS.pm98PlusPct.hi && b.hitsMeanOqBand) {
    recommended = 'B';
    patch = 'Variant B alone (AI PM soft ceiling) — minimal production surface: wrap runAI maintenance bump for non-player afternoonDrive only.';
  } else if (e && e.hitsPm98Target && e.hitsMeanOqBand) {
    recommended = 'E';
  }

  return {
    recommendedVariant: recommended,
    rationale: patch,
    rootCauseConfirmed:
      baseline &&
      (baseline.runAi?.to100 ?? 0) > 1000 &&
      (baseline.pm2020Pct98Plus ?? 0) > TARGETS.pm98PlusPct.hi,
    rootCauseSummary:
      'runAI() maintenance bumps (p.ms → +1..4, cap 100) on AI stations saturate afternoonDrive at 100; lower PM decay (0.030 vs 0.035/0.040) and cohost/reveal additive gains sustain 98–99 band. Morning/Midday share runAI bumps but lack PM cohost strength and have equal/higher decay — inflation is PM-specific at 98+.',
    morningMiddayLikelyAffected:
      'Morning/Midday receive the same runAI maintenance bump; audit shows far lower 98+ rates because decay is higher (midday) and PM-only cohost/reveal mechanics are absent. Soft ceiling could be generalized later but is not required for Morning/Midday 98+ saturation today.',
    codeLocations: [
      { file: 'src/legacy.js', line: '~18031', mechanism: 'runAI maintenance bump: if(Math.random()<p.ms) sd.quality=Math.min(100, sd.quality+rnd(1,4))' },
      { file: 'src/legacy.js', line: '~16723', mechanism: 'decay rates: afternoonDrive 0.030 vs morning 0.035 vs midday 0.040' },
      { file: 'src/legacy.js', line: '~3616', mechanism: 'COHOST_SLOT_STRENGTH afternoonDrive 0.42 (midday 0)' },
      { file: 'src/legacy.js', line: '~3796-3811', mechanism: 'applyCoHostChemistryRevealDecayStep adds slot Q' },
    ],
    productionPatch: {
      variant: recommended,
      description:
        'Ship wlDiagAiPmSupportCeiling logic (or production-named equivalent) gating only non-player runAI afternoonDrive bumps; optionally pair with afternoonDrive decay 0.035–0.040. Do not gate decay, reveals, or player stations.',
    },
    scored: scored.map((s) => ({ variant: s.variant, score: s.score })),
  };
}

function renderMd(report) {
  const lines = [];
  lines.push('# PM Drive Quality A/B');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`**Recommendation:** variant **${report.recommendation.recommendedVariant}**`);
  lines.push('');
  lines.push(report.recommendation.rationale);
  lines.push('');
  lines.push('## Root cause');
  lines.push('');
  lines.push(report.recommendation.rootCauseSummary);
  lines.push('');
  lines.push(`Root cause confirmed by measurement: **${report.recommendation.rootCauseConfirmed ? 'yes' : 'no'}**`);
  lines.push('');
  lines.push('## Variant definitions');
  lines.push('');
  for (const [k, v] of Object.entries(VARIANT_DEFS)) {
    lines.push(`- **${k}**: ${v}`);
  }
  lines.push('');
  lines.push('## Comparison (2020 snapshot, pooled across markets/runs)');
  lines.push('');
  lines.push(
    '| Var | PM 90+ | PM 95+ | PM 98+ | Low-talent PM≥95 | runAI→100 | exact 98/99/100 | Mean OQ | 95–99 OQ | Zombies | Spirals | Cert proxy |',
  );
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const r of report.variants) {
    const ex = r.auditExact;
    lines.push(
      `| ${r.variant} | ${r.pm2020Pct90Plus}% | ${r.pm2020Pct95Plus}% | ${r.pm2020Pct98Plus}% | ${r.lowTalentElitePm2020} | ${r.runAi.to100} | ${ex.q98}/${ex.q99}/${ex.q100} | ${r.ecology2020.meanOq ?? '—'} | ${r.ecology2020.pct9599}% | ${r.ecology2020.zombieLike} | ${r.ecology2020.lowShareSpiral} | ${r.ecology2020.certProxyOkPct}% |`,
    );
  }
  lines.push('');
  lines.push('## PM 98+ by decade (pooled)');
  lines.push('');
  lines.push('| Var | 1980 | 1990 | 2000 | 2010 | 2020 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const r of report.variants) {
    const cells = DECADE_KEYS.map((y) => `${r.byDecade[y]?.pm?.pct98Plus ?? '—'}%`);
    lines.push(`| ${r.variant} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push('## Prime daypart 98+ at 2020');
  lines.push('');
  lines.push('| Var | Morning | Midday | PM |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const r of report.variants) {
    const d = r.byDecade['2020'] || {};
    lines.push(
      `| ${r.variant} | ${d.morning?.pct98Plus ?? '—'}% | ${d.midday?.pct98Plus ?? '—'}% | ${d.pm?.pct98Plus ?? '—'}% |`,
    );
  }
  lines.push('');
  lines.push('## Production patch locations');
  lines.push('');
  for (const loc of report.recommendation.codeLocations) {
    lines.push(`- \`${loc.file}\` ~${loc.line}: ${loc.mechanism}`);
  }
  lines.push('');
  lines.push('## Morning/Midday');
  lines.push('');
  lines.push(report.recommendation.morningMiddayLikelyAffected);
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  console.log('[diag:pm-drive-quality-ab]', config);

  const summaries = [];

  for (const variant of config.variants) {
    const t0 = Date.now();
    console.log(`[diag:pm-drive-quality-ab] variant ${variant}…`);
    const results = [];

    for (const marketId of config.markets) {
      const ctx = loadVm(marketId, variant);
      for (let r = 0; r < config.runs; r++) {
        const seed = (config.seed + r * 104729 + marketId.length * 31 + variant.charCodeAt(0) * 17) >>> 0;
        const res = ctx.__wlRunPmDriveQualityAb({
          marketId,
          startYear: config.startYear,
          endYear: config.endYear,
          seed,
          variant,
        });
        results.push(res);
      }
    }

    const summary = aggregateVariant(variant, results);
    summaries.push(summary);
    console.log(
      `[diag:pm-drive-quality-ab] ${variant} done ${((Date.now() - t0) / 1000).toFixed(1)}s — PM 98+@2020=${summary.pm2020Pct98Plus}% meanOQ=${summary.ecology2020.meanOq}`,
    );
  }

  const recommendation = recommend(summaries);
  const report = {
    generatedAt: new Date().toISOString(),
    config,
    targets: TARGETS,
    variants: summaries,
    recommendation,
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, renderMd(report));
  console.log('[diag:pm-drive-quality-ab] wrote', outJson);
  console.table(
    summaries.map((r) => ({
      Var: r.variant,
      'PM 98+': r.pm2020Pct98Plus,
      'PM 95+': r.pm2020Pct95Plus,
      'Low-tal PM': r.lowTalentElitePm2020,
      runAI100: r.runAi.to100,
      meanOQ: r.ecology2020.meanOq,
      '95-99%': r.ecology2020.pct9599,
      zombies: r.ecology2020.zombieLike,
    })),
  );
  console.log('Recommendation:', recommendation.recommendedVariant, '—', recommendation.rationale);
}

main();
