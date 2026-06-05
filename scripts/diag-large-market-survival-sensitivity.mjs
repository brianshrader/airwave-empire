#!/usr/bin/env node
/**
 * Large-Market Survival Sensitivity — anchor 16 only
 * Independent lever tests A–I vs anchor-10 control reference.
 *
 *   node scripts/diag-large-market-survival-sensitivity.mjs
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
const snowballPath = path.join(root, 'src', 'marketSimHarnessSnowball.js');
const outJson = path.join(root, 'tmp', 'large_market_survival_sensitivity.json');
const outMd = path.join(root, 'tmp', 'large_market_survival_sensitivity.md');

const MARKETS = ['seattle', 'sanfrancisco', 'atlanta'];
const ANCHOR = 16;
const ANCHOR_REF = 10;
const DEFAULT_RUNS = 18;
const DEFAULT_SEED = 20260607;

/** Independent interventions (one lever each except I). */
const INTERVENTIONS = [
  { id: 'baseline', letter: '—', label: 'Anchor 16 control (no lever)' },
  { id: 'cash_25', letter: 'A', label: '+25% starting cash', spec: { cashMult: 1.25 } },
  { id: 'cash_50', letter: 'B', label: '+50% starting cash', spec: { cashMult: 1.5 } },
  { id: 'cash_100', letter: 'C', label: '+100% starting cash', spec: { cashMult: 2 } },
  { id: 'share_2', letter: 'D', label: 'Starter +2 share points', spec: { shareDelta: 0.02 } },
  { id: 'share_4', letter: 'E', label: 'Starter +4 share points', spec: { shareDelta: 0.04 } },
  { id: 'opex_15', letter: 'F', label: '−15% player operating expenses', spec: { opexMult: 0.85 } },
  { id: 'opex_25', letter: 'G', label: '−25% player operating expenses', spec: { opexMult: 0.75 } },
  { id: 'distress_2x', letter: 'H', label: 'Distress grace doubled (2→4 periods)', spec: { distressQ: 4 } },
  {
    id: 'combo',
    letter: 'I',
    label: 'Combo: +50% cash, +2 share, −15% opex',
    spec: { cashMult: 1.5, shareDelta: 0.02, opexMult: 0.85 },
  },
];

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

function patchLargeAnchor1975(src, count) {
  return src.replace(
    /const LARGE_MARKET_TOTAL_STATIONS_ANCHORS=\[\s*\[1975,\d+\]/,
    `const LARGE_MARKET_TOTAL_STATIONS_ANCHORS=[\n  [1975,${count}]`,
  );
}

function patchLegacySensitivity(src) {
  let out = src;
  out = out.replace(
    '  const _soloDistressExitQ=_tier0StarterCampaign?5:2;',
    '  const _soloDistressExitQ=_tier0StarterCampaign?5:(typeof G._wlSensitivityDistressQ===\'number\'?G._wlSensitivityDistressQ:2);',
  );
  out = out.replace(
    '  s.fin.cost=fixedCost+talCost+salesAdminCost+opsFloor+effPromo+effProg+stationIdentityBudgetPnlContribution(s,G)+streamUpkeep+simulcastProgFee+rightsHalfPeriod+aiLoanInt+amHitsContestOpex;\n  s.fin.ebitda=s.fin.rev-s.fin.cost;',
    '  s.fin.cost=fixedCost+talCost+salesAdminCost+opsFloor+effPromo+effProg+stationIdentityBudgetPnlContribution(s,G)+streamUpkeep+simulcastProgFee+rightsHalfPeriod+aiLoanInt+amHitsContestOpex;\n  if(s.isPlayer&&G&&typeof G._wlSensitivityOpexMult===\'number\'&&G._wlSensitivityOpexMult>0&&G._wlSensitivityOpexMult<1){s.fin.cost=Math.round(s.fin.cost*G._wlSensitivityOpexMult);}\n  s.fin.ebitda=s.fin.rev-s.fin.cost;',
  );
  return out;
}

function patchSnowballSensitivity(src) {
  let sb = src;
  sb = sb.replace(
    '      var summary = snowballBuildSummary(diary, optionsOut);',
    '      window.__lastSnowballG = G;\n      var summary = snowballBuildSummary(diary, optionsOut);',
  );
  sb = sb.replace(
    '      G = window.genMarket(scenId);',
    '      G = window.genMarket(scenId);\n      if (typeof window.__wlApplySensitivity === "function") window.__wlApplySensitivity(G);',
  );
  return sb;
}

const SENSITIVITY_HOOK = `
window.__wlSensitivitySpec = null;
window.__wlApplySensitivity = function (G) {
  var spec = window.__wlSensitivitySpec;
  if (!spec || !G) return;
  if (spec.cashMult && spec.cashMult !== 1) G.cash = Math.round((G.cash || 0) * spec.cashMult);
  if (spec.distressQ) G._wlSensitivityDistressQ = spec.distressQ;
  if (spec.opexMult) G._wlSensitivityOpexMult = spec.opexMult;
  if (spec.shareDelta && G.ps && G.ps.length) {
    var p0 = G.ps[0];
    var cur = p0 && p0.rat && p0.rat.share != null ? p0.rat.share : 0.045;
    G._wlHarnessPinPlayerShare = Math.min(0.38, cur + spec.shareDelta);
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
  }
};
`;

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
    console: { log: noop, warn: noop, error: noop, table: noop },
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

const ctxCache = new Map();

function loadCtx(anchor) {
  const key = String(anchor);
  if (ctxCache.has(key)) return ctxCache.get(key);
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let legacy = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  legacy = patchLargeAnchor1975(legacy, anchor);
  legacy = patchLegacySensitivity(legacy);
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  let sb = patchSnowballSensitivity(readFileSync(snowballPath, 'utf8'));
  vm.runInContext(sb, ctx);
  vm.runInContext(SENSITIVITY_HOOK, ctx);
  ctxCache.set(key, ctx);
  return ctx;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function interventionSalt(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[m] : (s[m] + s[m + 1]) / 2;
}

const RUNNER_IIFE = `
(function(){
  function analyze(trace){
    var diary=trace.diary||[];
    var end=diary.length?diary[diary.length-1]:{};
    var operating=diary.filter(function(d){return d.nStations>=1;});
    var peakShare=0, distressSales=0, acqTotal=0, revPerSt=[], ebPerSt=[];
    for(var i=0;i<diary.length;i++){
      var d=diary[i];
      if(d.nStations>=1){
        if((d.topShare||0)>peakShare) peakShare=d.topShare||0;
        if(d.totalRev>0) revPerSt.push(d.totalRev/d.nStations);
        ebPerSt.push(d.totalEbitda/d.nStations);
      }
      if(d.distressSaleCashThisPeriod||d.hasPressureCash) distressSales++;
      if(d.actions) acqTotal+=(d.actions.acquisitions||[]).length;
    }
    var open=diary[0]||{};
    return {
      survived2000:end.nStations>=1&&!end.soloBankrupt,
      stations2000:end.nStations||0,
      distressSales:distressSales,
      peakShare:Math.round(peakShare*10000)/10000,
      openShare:open.topShare!=null?Math.round(open.topShare*10000)/10000:null,
      openCash:open.cashEnd!=null?Math.round(open.cashEnd):null,
      revPerStationMed:median(revPerSt),
      ebitdaPerStationMed:median(ebPerSt),
      acqTotal:acqTotal,
      cash2000:Math.round(end.cashEnd||0),
      observerEnd:end.nStations===0&&!end.soloBankrupt,
      soloBankruptEnd:!!end.soloBankrupt
    };
  }
  function median(arr){
    var s=arr.filter(function(x){return x!=null&&!isNaN(x);}).sort(function(a,b){return a-b;});
    if(!s.length) return null;
    var m=Math.floor((s.length-1)/2);
    return s.length%2?s[m]:(s[m]+s[m+1])/2;
  }
  function runOne(opts){
    window.__wlSensitivitySpec=opts.sensitivity||null;
    var out=runMarketSnowballTrace(opts);
    out.metrics=analyze(out);
    return out.metrics;
  }
  return { runOne:runOne };
})();
`;

function aggregate(rows) {
  const n = rows.length;
  const survived = rows.filter((r) => r.survived2000).length;
  return {
    n,
    survivalRate: n ? survived / n : null,
    survived,
    stations2000Med: median(rows.map((r) => r.stations2000)),
    distressSalesMed: median(rows.map((r) => r.distressSales)),
    peakShareMed: median(rows.map((r) => r.peakShare)),
    openShareMed: median(rows.map((r) => r.openShare)),
    revPerStationMed: median(rows.map((r) => r.revPerStationMed)),
    ebitdaPerStationMed: median(rows.map((r) => r.ebitdaPerStationMed)),
    acqTotalMed: median(rows.map((r) => r.acqTotal)),
    cash2000Med: median(rows.map((r) => r.cash2000)),
    observerEnd: rows.filter((r) => r.observerEnd).length,
    bankruptEnd: rows.filter((r) => r.soloBankruptEnd).length,
  };
}

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString();
}

function rankLevers(pooledById, refSurvival) {
  const rows = INTERVENTIONS.filter((x) => x.id !== 'baseline')
    .map((iv) => {
      const a = pooledById[iv.id];
      return {
        letter: iv.letter,
        id: iv.id,
        label: iv.label,
        survival: a?.survivalRate ?? 0,
        delta: (a?.survivalRate ?? 0) - (pooledById.baseline?.survivalRate ?? 0),
        vsRef: (a?.survivalRate ?? 0) - refSurvival,
      };
    })
    .sort((a, b) => b.survival - a.survival || b.delta - a.delta);
  return rows;
}

function main() {
  const runs = parseInt(process.env.SENSITIVITY_RUNS || String(DEFAULT_RUNS), 10) || DEFAULT_RUNS;
  const seed = parseInt(process.env.SENSITIVITY_SEED || String(DEFAULT_SEED), 10) || DEFAULT_SEED;
  const t0 = Date.now();

  const ctx16 = loadCtx(ANCHOR);
  const ctx10 = loadCtx(ANCHOR_REF);
  const runner16 = vm.runInContext(RUNNER_IIFE, ctx16);
  const runner10 = vm.runInContext(RUNNER_IIFE, ctx10);

  const results = {
    meta: { anchor: ANCHOR, anchorRef: ANCHOR_REF, runs, seed, markets: MARKETS },
    interventions: {},
    anchor10Control: {},
  };

  for (const iv of INTERVENTIONS) {
    results.interventions[iv.id] = { letter: iv.letter, label: iv.label, spec: iv.spec || null, markets: {} };
    console.log(`\n=== ${iv.letter} ${iv.label} ===`);
    for (const marketId of MARKETS) {
      const rows = [];
      for (let run = 0; run < runs; run++) {
        const s0 = seed + marketSalt(marketId) * 17 + run * 9973 + interventionSalt(iv.id);
        try {
          rows.push(
            runner16.runOne({
              marketId,
              scenId: 'under',
              seed: s0,
              endYear: 2000,
              endPeriod: 2,
              playerPolicy: 'aggressive',
              activePlayer: true,
              maxSteps: 340,
              sensitivity: iv.spec || null,
            }),
          );
        } catch (e) {
          rows.push({ simError: String(e?.message || e), survived2000: false });
        }
      }
      const agg = aggregate(rows);
      results.interventions[iv.id].markets[marketId] = { runs: rows, aggregate: agg };
      console.log(`  ${marketId}: surv ${pct(agg.survivalRate)} · peak ${pct(agg.peakShareMed)} · rev/st $${fmt(agg.revPerStationMed)}`);
    }
    const pooled = [];
    for (const mid of MARKETS) pooled.push(...results.interventions[iv.id].markets[mid].runs);
    results.interventions[iv.id].pooled = aggregate(pooled);
  }

  console.log('\n=== Anchor 10 reference (control) ===');
  for (const marketId of MARKETS) {
    const rows = [];
    for (let run = 0; run < runs; run++) {
      const s0 = seed + marketSalt(marketId) * 17 + run * 9973;
      try {
        rows.push(
          runner10.runOne({
            marketId,
            scenId: 'under',
            seed: s0,
            endYear: 2000,
            endPeriod: 2,
            playerPolicy: 'aggressive',
            activePlayer: true,
            maxSteps: 340,
            sensitivity: null,
          }),
        );
      } catch (e) {
        rows.push({ survived2000: false });
      }
    }
    results.anchor10Control[marketId] = { aggregate: aggregate(rows) };
    console.log(`  ${marketId}: surv ${pct(aggregate(rows).survivalRate)}`);
  }
  const refRows = [];
  for (const mid of MARKETS) {
    for (let run = 0; run < runs; run++) {
      const s0 = seed + marketSalt(mid) * 17 + run * 9973;
      try {
        refRows.push(
          runner10.runOne({
            marketId: mid,
            scenId: 'under',
            seed: s0,
            endYear: 2000,
            endPeriod: 2,
            playerPolicy: 'aggressive',
            activePlayer: true,
            maxSteps: 340,
            sensitivity: null,
          }),
        );
      } catch (e) {
        refRows.push({ survived2000: false });
      }
    }
  }
  results.anchor10Control.pooled = aggregate(refRows);

  const pooledById = {};
  for (const iv of INTERVENTIONS) pooledById[iv.id] = results.interventions[iv.id].pooled;
  const refSurv = results.anchor10Control.pooled.survivalRate ?? 0;
  const leverRank = rankLevers(pooledById, refSurv);
  results.leverRanking = leverRank;
  results.summary = {
    anchor16BaselineSurvival: pooledById.baseline?.survivalRate,
    anchor10ControlSurvival: refSurv,
    bestSingleLever: leverRank[0] || null,
    comboSurvival: pooledById.combo?.survivalRate,
  };

  const lines = [];
  lines.push('# Large-Market Survival Sensitivity (anchor 16)');
  lines.push('');
  lines.push(`Aggressive production bot · ${runs} runs/market · seed ${seed}`);
  lines.push(`**Reference:** anchor 10 control survival (pooled) = **${pct(refSurv)}**`);
  lines.push('');
  lines.push('## Pooled survival to 2000');
  lines.push('| ID | Lever | Survival | Δ vs A16 baseline | Δ vs A10 ref |');
  lines.push('| --- | --- | ---: | ---: | ---: |');
  const baseSurv = pooledById.baseline?.survivalRate ?? 0;
  for (const iv of INTERVENTIONS) {
    const a = pooledById[iv.id];
    const sur = a?.survivalRate ?? 0;
    lines.push(
      `| ${iv.letter} | ${iv.label} | ${pct(sur)} | ${pct(sur - baseSurv)} | ${pct(sur - refSurv)} |`,
    );
  }
  lines.push('');
  lines.push('## Pooled metrics (median)');
  lines.push('| ID | Rev/st | EBITDA/st | Peak share | Open share | Distress | Acq | St @2000 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const iv of INTERVENTIONS) {
    const a = pooledById[iv.id];
    lines.push(
      `| ${iv.letter} | $${fmt(a.revPerStationMed)} | $${fmt(a.ebitdaPerStationMed)} | ${pct(a.peakShareMed)} | ${pct(a.openShareMed)} | ${a.distressSalesMed ?? '—'} | ${a.acqTotalMed ?? '—'} | ${a.stations2000Med ?? '—'} |`,
    );
  }
  lines.push('');
  lines.push('## Lever effect ranking (single interventions)');
  for (const r of leverRank) {
    lines.push(`- **${r.letter}** ${r.label}: survival **${pct(r.survival)}** (${pct(r.delta)} vs baseline)`);
  }
  lines.push('');
  lines.push('## Findings (diagnostic only)');
  const best = leverRank[0];
  const combo = pooledById.combo;
  lines.push(
    `- Anchor 16 baseline survival: **${pct(baseSurv)}** (${pooledById.baseline?.observerEnd ?? 0}/${pooledById.baseline?.n ?? 0} observer, ${pooledById.baseline?.bankruptEnd ?? 0} bankrupt).`,
  );
  if (best) {
    lines.push(
      `- Largest single-lever lift: **${best.letter}** (${best.label}) → **${pct(best.survival)}** (${pct(best.delta)} vs baseline).`,
    );
  }
  lines.push(
    `- Combo **I**: **${pct(combo?.survivalRate)}** vs baseline **${pct(baseSurv)}** — ${(combo?.survivalRate ?? 0) >= refSurv * 0.5 ? 'material' : 'still well below'} anchor-10 levels.`,
  );

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  results.timingMs = Date.now() - t0;
  writeFileSync(outJson, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(outMd, `${lines.join('\n')}\n`);
  console.log(`\nWrote ${outJson} (${(results.timingMs / 1000).toFixed(0)}s)`);
  console.log(`A16 baseline ${pct(baseSurv)} · A10 ref ${pct(refSurv)} · best ${best?.letter} ${pct(best?.survival)} · combo ${pct(combo?.survivalRate)}`);
}

main();
