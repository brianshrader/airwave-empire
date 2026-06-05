#!/usr/bin/env node
/**
 * Average annual raise at contract renewal by market rank, station rank, quality, profitability, tenure.
 * Compares renewals near 5 / 10 / 20 years after hire. Excludes Fall COLA (not a renewal).
 *
 *   npm run diag:contract-renewal-raises
 *   npm run diag:contract-renewal-raises -- --markets=nashville,sanfrancisco --runs=4 --years=35
 *
 * Output: tmp/contract_renewal_raises.json, tmp/contract_renewal_raises.md
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
const hooksPath = path.join(__dirname, 'diag-contract-renewal-raises-hooks.vm.js');
const runnerPath = path.join(__dirname, 'diag-contract-renewal-raises-runner.vm.js');
const outJson = path.join(root, 'tmp', 'contract_renewal_raises.json');
const outMd = path.join(root, 'tmp', 'contract_renewal_raises.md');

const AI_RENEWAL_NEEDLE = `if(Math.random()<renewCut){
          sd.talent.salary=Math.round(sd.talent.salary*rnd(1.08,1.22)/500)*500;
          sd.talent.cyr=ri(1,2);`;

const AI_RENEWAL_PATCH = `if(Math.random()<renewCut){
          var __wlPrevSalAi=sd.talent.salary;
          sd.talent.salary=Math.round(sd.talent.salary*rnd(1.08,1.22)/500)*500;
          sd.talent.cyr=ri(1,2);
          if(typeof __wlLogContractRenewal==='function')__wlLogContractRenewal('ai_rival',{station:s,slot:sl,talent:sd.talent,prevSal:__wlPrevSalAi,newSal:sd.talent.salary,contractYears:sd.talent.cyr});`;

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

function injectAiRenewalLogger(src) {
  if (!src.includes(AI_RENEWAL_NEEDLE)) {
    throw new Error('AI rival renewal anchor missing in legacy.js — update diag-contract-renewal-raises.mjs needle');
  }
  return src.replace(AI_RENEWAL_NEEDLE, AI_RENEWAL_PATCH);
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
  let legacySrc = injectHeadlessLaunchNewsGuard(
    injectAiRenewalLogger(patchActiveMarket(readFileSync(legacyPath, 'utf8'), marketId)),
  );
  vm.runInContext(legacySrc, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(
    `showToast=function(){};renderAll=function(){};openContract=function(){};renderManageTalentStation=function(){};`,
    ctx,
  );
  vm.runInContext(readFileSync(hooksPath, 'utf8'), ctx, { timeout: 600_000 });
  vm.runInContext(readFileSync(runnerPath, 'utf8'), ctx, { timeout: 600_000 });
  return ctx;
}

function parseArgs(argv) {
  const o = {
    runs: 4,
    seed: 20260604,
    markets: ['wichita', 'nashville', 'chicago', 'sanfrancisco', 'newyork'],
    startYears: [1970, 1985, 2000],
    years: 35,
    simulateRenewals: true,
    playerOnly: false,
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || o.runs);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--years=')) o.years = Math.max(10, parseInt(a.slice(8), 10) || o.years);
    else if (a.startsWith('--markets=')) {
      o.markets = a
        .slice(10)
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith('--start-years=')) {
      o.startYears = a
        .slice(14)
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter(Number.isFinite);
    } else if (a === '--no-simulate-renewals') o.simulateRenewals = false;
    else if (a === '--player-only') o.playerOnly = true;
    else if (a === '--all-markets') o.markets = [...ALL_PLAYABLE_MARKET_IDS];
  }
  return o;
}

function mean(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
}

function bucketStats(events, keyFn) {
  const buckets = {};
  for (const e of events) {
    const k = keyFn(e);
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push(e.raisePct);
  }
  const out = {};
  for (const [k, vals] of Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b))) {
    out[k] = { n: vals.length, meanRaisePct: mean(vals), medianRaisePct: median(vals) };
  }
  return out;
}

function filterEvents(events, opts) {
  let list = events;
  if (opts.playerOnly) list = list.filter((e) => e.kind === 'player_extend');
  else if (opts.kind) list = list.filter((e) => e.kind === opts.kind);
  return list;
}

function renderBucketTable(title, stats) {
  const lines = [];
  lines.push(`### ${title}`);
  lines.push('');
  lines.push('| Bucket | N | Mean raise % | Median raise % |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const [k, v] of Object.entries(stats)) {
    lines.push(
      `| ${k} | ${v.n} | ${v.meanRaisePct != null ? v.meanRaisePct : '—'} | ${v.medianRaisePct != null ? v.medianRaisePct : '—'} |`,
    );
  }
  lines.push('');
  return lines;
}

function buildReport(allEvents, config) {
  const playerEvents = filterEvents(allEvents, { playerOnly: true });
  const aiEvents = allEvents.filter((e) => e.kind === 'ai_rival');
  const report = {
    generatedAt: new Date().toISOString(),
    config,
    definition: {
      renewalRaisePct: '(newAnnualSalary / prevAnnualSalary - 1) * 100 at sign/extend moment',
      excludes: 'Fall COLA / merit bumps (period===2 salary inflation in advTurn)',
      playerRenewal: 'doExtend via buildContractEconObject (1/2/3 yr offers)',
      aiRenewal: 'rival cyr<=0 branch: salary * rnd(1.08, 1.22)',
      tenureYears: 'G.year - talent._hireYear at renewal',
      tenureMilestones: '5yr: tenure 4–6, 10yr: 9–11, 20yr: 19–21 calendar years',
      stationProfitability: 'fin.ebitda / fin.rev buckets',
      stationRank: 'rankStationsByShareCompetition book rank',
    },
    counts: {
      totalRenewals: allEvents.length,
      playerExtend: playerEvents.length,
      aiRival: aiEvents.length,
    },
    overall: {
      all: { meanRaisePct: mean(allEvents.map((e) => e.raisePct)), n: allEvents.length },
      player: { meanRaisePct: mean(playerEvents.map((e) => e.raisePct)), n: playerEvents.length },
      ai: { meanRaisePct: mean(aiEvents.map((e) => e.raisePct)), n: aiEvents.length },
    },
    byDimension: {},
    tenureMilestones: {},
  };

  const dims = [
    ['marketSize_rankTier', (e) => e.rankTier || 'unknown'],
    ['stationRank_bookShare', (e) => e.rankBucket || 'unknown'],
    ['talentQuality_trueQ', (e) => e.qualityBucket || 'unknown'],
    ['stationProfitability_ebitdaMargin', (e) => e.profitability || 'unknown'],
    ['tenureYearsAtRenewal', (e) => {
      const y = e.tenureYrs | 0;
      if (y < 2) return '0-1yr';
      if (y < 5) return '2-4yr';
      if (y < 10) return '5-9yr';
      if (y < 15) return '10-14yr';
      if (y < 20) return '15-19yr';
      return '20yr+';
    }],
  ];

  for (const [name, fn] of dims) {
    report.byDimension[name] = {
      all: bucketStats(allEvents, fn),
      player: bucketStats(playerEvents, fn),
    };
  }

  for (const milestone of ['5yr', '10yr', '20yr']) {
    const cohortAll = allEvents.filter((e) => e.tenureMilestone === milestone);
    const cohortPlayer = playerEvents.filter((e) => e.tenureMilestone === milestone);
    report.tenureMilestones[milestone] = {
      all: {
        n: cohortAll.length,
        meanRaisePct: mean(cohortAll.map((e) => e.raisePct)),
        medianRaisePct: median(cohortAll.map((e) => e.raisePct)),
        byMarketTier: bucketStats(cohortAll, (e) => e.rankTier || 'unknown'),
        byQuality: bucketStats(cohortAll, (e) => e.qualityBucket || 'unknown'),
        byProfitability: bucketStats(cohortAll, (e) => e.profitability || 'unknown'),
      },
      player: {
        n: cohortPlayer.length,
        meanRaisePct: mean(cohortPlayer.map((e) => e.raisePct)),
        medianRaisePct: median(cohortPlayer.map((e) => e.raisePct)),
        byMarketTier: bucketStats(cohortPlayer, (e) => e.rankTier || 'unknown'),
        byQuality: bucketStats(cohortPlayer, (e) => e.qualityBucket || 'unknown'),
        byProfitability: bucketStats(cohortPlayer, (e) => e.profitability || 'unknown'),
      },
    };
  }

  return report;
}

function renderMd(report) {
  const lines = [];
  lines.push('# Contract renewal raises (diagnostic)');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Definition');
  lines.push('');
  lines.push(
    '- **Renewal raise** = percent change in **annual salary** when a contract is extended (`doExtend` for player; AI uses `salary × U(1.08, 1.22)`).',
  );
  lines.push('- **Not included:** automatic **Fall COLA** / share-pressure bumps each half-year (`advTurn` period 2).');
  lines.push('- Player offers come from `buildContractEconObject` (demand, leverage, elite anchor, retention modifiers).');
  lines.push('');
  lines.push('## Sample');
  lines.push('');
  lines.push(`| Source | N | Mean raise % |`);
  lines.push(`| --- | ---: | ---: |`);
  lines.push(`| All renewals | ${report.counts.totalRenewals} | ${report.overall.all.meanRaisePct ?? '—'} |`);
  lines.push(`| Player extend | ${report.counts.playerExtend} | ${report.overall.player.meanRaisePct ?? '—'} |`);
  lines.push(`| AI rival | ${report.counts.aiRival} | ${report.overall.ai.meanRaisePct ?? '—'} |`);
  lines.push('');
  lines.push('## By dimension (all renewals)');
  lines.push('');
  for (const [name, data] of Object.entries(report.byDimension)) {
    lines.push(...renderBucketTable(name, data.all));
  }
  lines.push('## By dimension (player extends only)');
  lines.push('');
  for (const [name, data] of Object.entries(report.byDimension)) {
    lines.push(...renderBucketTable(name, data.player));
  }
  lines.push('## Tenure milestones (years after hire at renewal)');
  lines.push('');
  for (const [ms, data] of Object.entries(report.tenureMilestones)) {
    lines.push(`### ${ms} after hire`);
    lines.push('');
    lines.push('| Cohort | N | Mean % | Median % |');
    lines.push('| --- | ---: | ---: | ---: |');
    lines.push(
      `| All renewals | ${data.all.n} | ${data.all.meanRaisePct ?? '—'} | ${data.all.medianRaisePct ?? '—'} |`,
    );
    lines.push(
      `| Player only | ${data.player.n} | ${data.player.meanRaisePct ?? '—'} | ${data.player.medianRaisePct ?? '—'} |`,
    );
    lines.push('');
    if (data.player.n > 0) {
      lines.push(...renderBucketTable(`${ms} — player — market tier`, data.player.byMarketTier));
      lines.push(...renderBucketTable(`${ms} — player — quality`, data.player.byQuality));
      lines.push(...renderBucketTable(`${ms} — player — station profitability`, data.player.byProfitability));
    }
  }
  return lines.join('\n');
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const results = [];
  let runIdx = 0;
  const vmCache = new Map();

  for (const marketId of config.markets) {
    if (!vmCache.has(marketId)) vmCache.set(marketId, loadVm(marketId));
    const ctx = vmCache.get(marketId);

    for (const startYear of config.startYears) {
      for (let r = 0; r < config.runs; r++) {
        const seed = (config.seed + runIdx * 9973) >>> 0;
        runIdx += 1;
        const sim = vm.runInContext(
          `__wlRunContractRenewalRaisesSim(${JSON.stringify({
            marketId,
            startYear,
            seed,
            years: config.years,
            simulateRenewals: config.simulateRenewals,
          })})`,
          ctx,
        );
        results.push(sim);
        if (!sim.ok) console.error(`FAIL ${marketId} ${startYear} seed=${seed}: ${sim.error}`);
      }
    }
  }

  const allEvents = results.flatMap((r) => (r.ok ? r.events : []));
  const report = buildReport(allEvents, config);
  report.runs = { total: results.length, ok: results.filter((r) => r.ok).length };
  report.simDiagnostics = {
    renewalOpportunities: results.reduce((s, r) => s + (r.renewalOpportunities || 0), 0),
    simulatedExtendAttempts: results.reduce((s, r) => s + (r.simulatedExtendAttempts || 0), 0),
    simulatedExtendErrors: results.reduce((s, r) => s + (r.simulatedExtendErrors || 0), 0),
    lastSimErrors: [...new Set(results.map((r) => r.lastSimError).filter(Boolean))].slice(0, 5),
  };
  report.sampleConfig = config;

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(outMd, `${renderMd(report)}\n`, 'utf8');
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(
    `Renewals: ${report.counts.totalRenewals} (player ${report.counts.playerExtend}, AI ${report.counts.aiRival}) — player mean raise ${report.overall.player.meanRaisePct}%`,
  );
}

main();
