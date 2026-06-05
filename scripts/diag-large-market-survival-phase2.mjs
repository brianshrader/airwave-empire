#!/usr/bin/env node
/**
 * Large-Market Survival Audit — Phase 2
 * Anchor 10 vs 16 · Seattle / SF / Atlanta 1970 · aggressive benchmark bot
 * Variants A–D separate bot exit vs economics (diagnostic only).
 *
 *   node scripts/diag-large-market-survival-phase2.mjs
 *   PHASE2_RUNS=18 node scripts/diag-large-market-survival-phase2.mjs
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
const outJson = path.join(root, 'tmp', 'large_market_survival_phase2.json');
const outMd = path.join(root, 'tmp', 'large_market_survival_phase2.md');

const MARKETS = ['seattle', 'sanfrancisco', 'atlanta'];
const ANCHORS = [10, 16];
const VARIANTS = ['A', 'B', 'C', 'D'];
const DEFAULT_RUNS = 18;
const DEFAULT_SEED = 20260606;

const BENCH_REENTRY_INJECT = `
  function __benchDiagPickCheapest(G, useGameReentryThreshold) {
    var avail = (G.stations || []).filter(function (x) {
      return x && !x._bpSlotDeferred && !x.isPlayer && !x.isPublic;
    });
    var candidates = avail
      .map(function (x) {
        var pr =
          typeof window !== 'undefined' && typeof window.playerAcqAsk === 'function'
            ? window.playerAcqAsk(x, G)
            : typeof acqPrice === 'function'
              ? acqPrice(x, G)
              : 1e12;
        if (pr == null || !Number.isFinite(pr)) return null;
        if ((G.cash || 0) < pr) return null;
        if (!useGameReentryThreshold) {
          var agg = true;
          var reserve = Math.max(26000, Math.min(220000, (G.cash || 0) * 0.038));
          var acqPad = 28000;
          if ((G.cash || 0) < pr + reserve + acqPad) return null;
        }
        return { s: x, price: pr };
      })
      .filter(Boolean);
    candidates.sort(function (a, b) {
      return a.price - b.price;
    });
    return candidates.length ? candidates[0].s : null;
  }
  function __benchDiagAttemptReentry(G, playerPolicy) {
    if (G._soloBankrupt) return false;
    var n = (G.ps && G.ps.length) || 0;
    if (n > 0) return false;
    if (typeof soloPlayerCanAffordReentry === 'function' && !soloPlayerCanAffordReentry(G)) return false;
    var pick = __benchDiagPickCheapest(G, true);
    if (!pick) return false;
    var sig = pick.sig && pick.sig.type === 'FM' && !pick.fmBooster ? 'FM' : 'AM';
    if (typeof fccCanAcquire === 'function' && !fccCanAcquire('player', sig, G)) return false;
    var acqFn = window.benchmarkSoloAcquireStation;
    if (!acqFn(G, pick)) return false;
    G._benchReentryCount = (G._benchReentryCount || 0) + 1;
    var v = typeof window !== 'undefined' ? window.__benchDiagVariant : 'A';
    if (v === 'C') G._benchDistressGraceRemaining = 10;
    return true;
  }
  var __runAirwaveBenchmarkPlayerBotTurnOrig = runAirwaveBenchmarkPlayerBotTurn;
  runAirwaveBenchmarkPlayerBotTurn = function (G, playerPolicy) {
    var v = typeof window !== 'undefined' && window.__benchDiagVariant ? window.__benchDiagVariant : 'A';
    if (v === 'D') __benchDiagAttemptReentry(G, playerPolicy);
    __runAirwaveBenchmarkPlayerBotTurnOrig(G, playerPolicy);
    if (v !== 'A') __benchDiagAttemptReentry(G, playerPolicy);
  };
`;

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

function patchSnowballForVariant(src, variant) {
  let sb = src;
  sb = sb.replace(
    '      var summary = snowballBuildSummary(diary, optionsOut);',
    '      window.__lastSnowballG = G;\n      var summary = snowballBuildSummary(diary, optionsOut);',
  );
  if (variant !== 'A') {
    sb = sb.replace(
      '        if (!pSt.length) break;',
      "        if (!pSt.length && (!window.__benchDiagVariant || window.__benchDiagVariant === 'A')) break;",
    );
    sb = sb.replace(
      '  }\n\n  function snowballBenchCopy(b) {',
      `  }\n${BENCH_REENTRY_INJECT}\n\n  function snowballBenchCopy(b) {`,
    );
    sb = sb.replace(
      '          advTurn();\n          steps++;',
      '          advTurn();\n          if (useActiveBot && window.__benchDiagVariant && window.__benchDiagVariant !== "A") {\n            __benchDiagAttemptReentry(G, playerPolicy);\n          }\n          steps++;',
    );
    sb = sb.replace(
      '          diary.push(row);',
      '          diary.push(row);\n          if (G._benchDistressGraceRemaining > 0 && pm.nStations > 0) G._benchDistressGraceRemaining--;',
    );
  }
  return sb;
}

function patchLegacyDistressGrace(src) {
  return src.replace(
    '  if(_cashCountsSoloDistress){\n    G.debtWarningQ=(G.debtWarningQ||0)+1;',
    '  if(typeof G._benchDistressGraceRemaining===\'number\'&&G._benchDistressGraceRemaining>0){\n    G.debtWarningQ=0;\n  }else if(_cashCountsSoloDistress){\n    G.debtWarningQ=(G.debtWarningQ||0)+1;',
  );
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

function loadCtx(anchor, variant) {
  const key = `${anchor}:${variant}`;
  if (ctxCache.has(key)) return ctxCache.get(key);
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let legacy = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  legacy = patchLargeAnchor1975(legacy, anchor);
  if (variant === 'C') legacy = patchLegacyDistressGrace(legacy);
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  let sb = patchSnowballForVariant(readFileSync(snowballPath, 'utf8'), variant);
  vm.runInContext(sb, ctx);
  ctxCache.set(key, ctx);
  return ctx;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[m] : (s[m] + s[m + 1]) / 2;
}

function pct(n, d) {
  if (!d) return null;
  return n / d;
}

const RUNNER_IIFE = `
(function(){
  function analyzePhase2(trace, variant){
    var diary=trace.diary||[];
    var end=diary.length?diary[diary.length-1]:{};
    var operating=diary.filter(function(d){return d.nStations>=1;});
    var zeroPeriods=diary.filter(function(d){return d.nStations===0;}).length;
    var peakShare=0, distressSales=0, reentriesFromDiary=0, prevN=-1;
    var revPerSt=[], ebPerSt=[], acqTotal=0, saleTotal=0;
    for(var i=0;i<diary.length;i++){
      var d=diary[i];
      if(d.nStations>=1){
        var sh=d.topShare||0;
        if(sh>peakShare) peakShare=sh;
        if(d.totalRev>0&&d.nStations>0) revPerSt.push(d.totalRev/d.nStations);
        if(d.nStations>0) ebPerSt.push(d.totalEbitda/d.nStations);
      }
      if(d.distressSaleCashThisPeriod||d.hasPressureCash) distressSales++;
      if(d.actions){
        acqTotal+=(d.actions.acquisitions||[]).length;
        saleTotal+=(d.actions.stationSales||[]).length;
      }
      if(prevN===0&&d.nStations>=1) reentriesFromDiary++;
      prevN=d.nStations;
    }
    var gEnd=typeof window!=='undefined'&&window.__lastSnowballG?window.__lastSnowballG:null;
    var benchReentries=gEnd&&gEnd._benchReentryCount?gEnd._benchReentryCount:0;
    var reentries=Math.max(benchReentries,reentriesFromDiary);
    var survived2000=end.nStations>=1&&!end.soloBankrupt;
    var observerEnd=end.nStations===0&&!end.soloBankrupt;
    var canRe=gEnd&&typeof soloPlayerCanAffordReentry==='function'?soloPlayerCanAffordReentry(gEnd):false;
    var botGapObserver=variant==='A'&&observerEnd&&canRe&&distressSales>=1;
    return {
      variant:variant,
      survived2000:!!survived2000,
      observerEnd:!!observerEnd,
      botGapObserver:!!botGapObserver,
      distressSales:distressSales,
      reentries:reentries,
      stations2000:end.nStations||0,
      acqTotal:acqTotal,
      peakShare:Math.round(peakShare*10000)/10000,
      revPerStationMed:median(revPerSt),
      ebitdaPerStationMed:median(ebPerSt),
      cash2000:Math.round(end.cashEnd||0),
      zeroStationPeriods:zeroPeriods,
      operatingPeriods:operating.length,
      soloBankruptEnd:!!end.soloBankrupt,
      saleTotal:saleTotal
    };
  }
  function median(arr){
    var s=arr.filter(function(x){return x!=null&&!isNaN(x);}).sort(function(a,b){return a-b;});
    if(!s.length) return null;
    var m=Math.floor((s.length-1)/2);
    return s.length%2?s[m]:(s[m]+s[m+1])/2;
  }
  function runPhase2(opts){
    window.__benchDiagVariant=opts.variant||'A';
    var out=runMarketSnowballTrace(opts);
    out.metrics=analyzePhase2(out,opts.variant||'A');
    return out;
  }
  return { runPhase2:runPhase2 };
})();
`;

function aggregateMetrics(rows) {
  const n = rows.length;
  const survived = rows.filter((r) => r.survived2000).length;
  const botGap = rows.filter((r) => r.botGapObserver).length;
  return {
    n,
    survivalRate: pct(survived, n),
    survived,
    botGapObserverRuns: botGap,
    botGapObserverRate: pct(botGap, n),
    distressSalesMed: median(rows.map((r) => r.distressSales)),
    reentriesMed: median(rows.map((r) => r.reentries)),
    reentriesTotal: rows.reduce((a, r) => a + (r.reentries || 0), 0),
    stations2000Med: median(rows.map((r) => r.stations2000)),
    acqTotalMed: median(rows.map((r) => r.acqTotal)),
    peakShareMed: median(rows.map((r) => r.peakShare)),
    revPerStationMed: median(rows.map((r) => r.revPerStationMed)),
    ebitdaPerStationMed: median(rows.map((r) => r.ebitdaPerStationMed)),
    cash2000Med: median(rows.map((r) => r.cash2000)),
    zeroStationPeriodsMed: median(rows.map((r) => r.zeroStationPeriods)),
    observerEnd: rows.filter((r) => r.observerEnd).length,
    bankruptEnd: rows.filter((r) => r.soloBankruptEnd).length,
  };
}

function pairedAttribution(rowsA, rowsD) {
  const n = Math.min(rowsA.length, rowsD.length);
  let failA = 0;
  let botRecoverable = 0;
  let economicFailDespiteD = 0;
  let failA_surviveD = 0;
  for (let i = 0; i < n; i++) {
    const a = rowsA[i];
    const d = rowsD[i];
    if (!a.survived2000) failA++;
    if (!a.survived2000 && a.botGapObserver) botRecoverable++;
    if (!a.survived2000 && d.survived2000) failA_surviveD++;
    if (!d.survived2000) economicFailDespiteD++;
  }
  return {
    n,
    failA,
    botRecoverable,
    botRecoverablePctOfFailA: failA ? botRecoverable / failA : null,
    botRecoverablePctOfAllA: botRecoverable / n,
    failA_surviveD,
    failA_surviveDPct: failA ? failA_surviveD / failA : null,
    economicFailDespiteD,
    economicFailDespiteDPct: n ? economicFailDespiteD / n : null,
    survivalA: rowsA.filter((r) => r.survived2000).length / n,
    survivalD: rowsD.filter((r) => r.survived2000).length / n,
  };
}

function buildAttributionSummary(allResults) {
  const anchor16 = { markets: {}, pooled: null };
  const rowsPooledA = [];
  const rowsPooledB = [];
  const rowsPooledC = [];
  const rowsPooledD = [];
  for (const marketId of MARKETS) {
    const aRuns = allResults.anchors[16][marketId].variants.A.runs;
    const bRuns = allResults.anchors[16][marketId].variants.B.runs;
    const cRuns = allResults.anchors[16][marketId].variants.C.runs;
    const dRuns = allResults.anchors[16][marketId].variants.D.runs;
    rowsPooledA.push(...aRuns);
    rowsPooledB.push(...bRuns);
    rowsPooledC.push(...cRuns);
    rowsPooledD.push(...dRuns);
    anchor16.markets[marketId] = {
      A: aggregateMetrics(aRuns),
      B: aggregateMetrics(bRuns),
      D: aggregateMetrics(dRuns),
      paired_A_vs_D: pairedAttribution(aRuns, dRuns),
      paired_A_vs_B: pairedAttribution(aRuns, bRuns),
    };
  }
  anchor16.pooled = {
    A: aggregateMetrics(rowsPooledA),
    B: aggregateMetrics(rowsPooledB),
    C: aggregateMetrics(rowsPooledC),
    D: aggregateMetrics(rowsPooledD),
    paired_A_vs_D: pairedAttribution(rowsPooledA, rowsPooledD),
    paired_A_vs_B: pairedAttribution(rowsPooledA, rowsPooledB),
  };

  const p = anchor16.pooled.paired_A_vs_D;
  const failA = p.failA;
  const n = p.n;
  const botFix = p.failA_surviveD;
  const stillFailD = p.economicFailDespiteD;

  const interpretation = {
    anchor16_failures_total: failA,
    pct_failures_bot_exit_pattern_among_A:
      p.botRecoverablePctOfFailA != null ? p.botRecoverablePctOfFailA : null,
    pct_all_A_runs_bot_gap_observer: p.botRecoverablePctOfAllA,
    pct_failures_fixed_by_D_among_A_failures: p.failA_surviveDPct,
    pct_all_runs_still_fail_under_D: p.economicFailDespiteDPct,
    survival_rate_A: p.survivalA,
    survival_rate_B: anchor16.pooled.B.survivalRate,
    survival_rate_C: anchor16.pooled.C.survivalRate,
    survival_rate_D: p.survivalD,
    anchor16_reasonably_survivable_with_reentry:
      (anchor16.pooled.B.survivalRate ?? 0) >= 0.5 ? 'likely_yes' : (anchor16.pooled.B.survivalRate ?? 0) >= 0.35 ? 'partial' : 'no',
    economics_still_need_tuning_after_D: (anchor16.pooled.D.survivalRate ?? 0) < (allResults.anchors[10]?.pooled?.A?.survivalRate ?? 0.7),
  };
  interpretation.survival_rate_B = anchor16.pooled.B.survivalRate;

  return { anchor16, interpretation };
}

function main() {
  const runs = parseInt(process.env.PHASE2_RUNS || String(DEFAULT_RUNS), 10) || DEFAULT_RUNS;
  const seed = parseInt(process.env.PHASE2_SEED || String(DEFAULT_SEED), 10) || DEFAULT_SEED;
  const t0 = Date.now();
  const results = { anchors: {}, meta: { runs, seed, variants: VARIANTS, markets: MARKETS } };

  const runnerCache = new Map();

  for (const anchor of ANCHORS) {
    console.log(`\n=== Anchor ${anchor} ===`);
    results.anchors[anchor] = {};
    for (const marketId of MARKETS) {
      results.anchors[anchor][marketId] = { variants: {} };
      for (const variant of VARIANTS) {
        const ctx = loadCtx(anchor, variant);
        if (!runnerCache.has(`${anchor}:${variant}`)) {
          runnerCache.set(`${anchor}:${variant}`, vm.runInContext(RUNNER_IIFE, ctx));
        }
        const runner = runnerCache.get(`${anchor}:${variant}`);
        const metricRows = [];
        for (let run = 0; run < runs; run++) {
          const s0 = seed + anchor * 1000 + marketSalt(marketId) * 17 + run * 9973;
          try {
            const trace = runner.runPhase2({
              marketId,
              scenId: 'under',
              seed: s0,
              endYear: 2000,
              endPeriod: 2,
              playerPolicy: 'aggressive',
              activePlayer: true,
              maxSteps: 340,
              variant,
            });
            metricRows.push(trace.metrics);
          } catch (e) {
            metricRows.push({
              variant,
              simError: String(e?.message || e),
              survived2000: false,
              botGapObserver: false,
            });
          }
        }
        results.anchors[anchor][marketId].variants[variant] = {
          runs: metricRows,
          aggregate: aggregateMetrics(metricRows),
        };
      }
      const aggA = results.anchors[anchor][marketId].variants.A.aggregate;
      const aggB = results.anchors[anchor][marketId].variants.B.aggregate;
      const aggD = results.anchors[anchor][marketId].variants.D.aggregate;
      console.log(
        `  ${marketId}: A surv ${(aggA.survivalRate * 100).toFixed(0)}% · B ${(aggB.survivalRate * 100).toFixed(0)}% · D ${(aggD.survivalRate * 100).toFixed(0)}% · bot-gap A ${(aggA.botGapObserverRate * 100).toFixed(0)}%`,
      );
    }
  }

  const rows10A = [];
  const rows16A = [];
  for (const marketId of MARKETS) {
    rows10A.push(...results.anchors[10][marketId].variants.A.runs);
    rows16A.push(...results.anchors[16][marketId].variants.A.runs);
  }
  results.anchors[10].pooled = { A: aggregateMetrics(rows10A) };
  results.attribution = buildAttributionSummary(results);

  const lines = [];
  lines.push('# Large-Market Survival Audit — Phase 2');
  lines.push('');
  lines.push(`Markets: ${MARKETS.join(', ')} · anchors 10 & 16 · aggressive bot · ${runs} paired runs/market/variant · seed ${seed}`);
  lines.push('');
  lines.push('## Variants');
  lines.push('- **A** — production bot (control)');
  lines.push('- **B** — re-enter after liquidation when cash allows cheapest station');
  lines.push('- **C** — B + 10 operating periods distress grace after re-entry');
  lines.push('- **D** — B + force re-entry start/end of turn + acq loop when empty');
  lines.push('');
  lines.push('## Survival to 2000 (fraction with ≥1 station, not solo bankrupt)');
  lines.push('| Anchor | Market | A | B | C | D |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: |');
  for (const anchor of ANCHORS) {
    for (const mid of MARKETS) {
      const v = results.anchors[anchor][mid].variants;
      lines.push(
        `| ${anchor} | ${mid} | ${pctStr(v.A.aggregate.survivalRate)} | ${pctStr(v.B.aggregate.survivalRate)} | ${pctStr(v.C.aggregate.survivalRate)} | ${pctStr(v.D.aggregate.survivalRate)} |`,
      );
    }
  }
  const p10 = results.anchors[10].pooled.A.survivalRate;
  const p16 = results.attribution.anchor16.pooled;
  lines.push(
    `| 10 | **pooled** | ${pctStr(p10)} | — | — | — |`,
  );
  lines.push(
    `| 16 | **pooled** | ${pctStr(p16.A.survivalRate)} | ${pctStr(p16.B.survivalRate)} | ${pctStr(p16.C.survivalRate)} | ${pctStr(p16.D.survivalRate)} |`,
  );

  lines.push('');
  lines.push('## Median metrics @ anchor 16 (pooled)');
  lines.push('| Variant | Rev/st | EBITDA/st | Peak share | Acq | Distress periods | Re-entries | Zero-st periods | Cash @2000 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const v of VARIANTS) {
    const a = p16[v];
    lines.push(
      `| ${v} | $${fmt(a.revPerStationMed)} | $${fmt(a.ebitdaPerStationMed)} | ${fmtPct(a.peakShareMed)} | ${a.acqTotalMed ?? '—'} | ${a.distressSalesMed ?? '—'} | ${a.reentriesMed ?? '—'} | ${a.zeroStationPeriodsMed ?? '—'} | $${fmt(a.cash2000Med)} |`,
    );
  }

  const interp = results.attribution.interpretation;
  lines.push('');
  lines.push('## Attribution (anchor 16, pooled, paired seeds)');
  lines.push('');
  lines.push(`- Control **A** survival: **${pctStr(interp.survival_rate_A)}** (${p16.A.survived}/${p16.A.n})`);
  lines.push(`- **B** (re-entry) survival: **${pctStr(interp.survival_rate_B)}**`);
  lines.push(`- **D** (max bot assist) survival: **${pctStr(interp.survival_rate_D)}**`);
  lines.push(`- Anchor **10** control survival: **${pctStr(p10)}**`);
  lines.push('');
  lines.push('### Answers');
  lines.push('');
  lines.push(
    `1. **Economics share of Anchor 16 failures (control):** Among A failures, **${pctStr(interp.pct_failures_bot_exit_pattern_among_A)}** match the bot-gap observer pattern (distress sale → cash-rich, zero stations, can re-enter). **${pctStr(interp.pct_all_runs_still_fail_under_D)}** of all A runs still fail even under **D** → persistent economic failure floor.`,
  );
  lines.push(
    `2. **Benchmark bot share:** **${pctStr(interp.pct_failures_fixed_by_D_among_A_failures)}** of control failures recover under **D** on the same seed (bot + forced re-entry). **${pctStr(interp.pct_all_A_runs_bot_gap_observer)}** of all control runs are bot-gap observers.`,
  );
  lines.push(
    `3. **Anchor 16 after re-entry:** ${interp.anchor16_reasonably_survivable_with_reentry === 'likely_yes' ? 'Re-entry variants materially improve survival.' : interp.anchor16_reasonably_survivable_with_reentry === 'partial' ? 'Partial improvement — not fully survivable.' : 'Re-entry does not make anchor 16 reasonably survivable.'} Economics tuning still indicated if **D** survival (**${pctStr(interp.survival_rate_D)}**) stays below anchor **10** control (**${pctStr(p10)}**): ${interp.economics_still_need_tuning_after_D ? 'yes' : 'marginal / no'}.`,
  );

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  results.timingMs = Date.now() - t0;
  writeFileSync(outJson, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(outMd, `${lines.join('\n')}\n`);
  console.log(`\nWrote ${outJson} (${(results.timingMs / 1000).toFixed(0)}s)`);
  console.log(`Attribution: A16 surv ${(interp.survival_rate_A * 100).toFixed(0)}% → B ${(interp.survival_rate_B * 100).toFixed(0)}% → D ${(interp.survival_rate_D * 100).toFixed(0)}% (A10 ${(p10 * 100).toFixed(0)}%)`);
}

function pctStr(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString();
}

function fmtPct(x) {
  if (x == null) return '—';
  return `${(x * 100).toFixed(2)}%`;
}

main();
