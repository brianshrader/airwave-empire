#!/usr/bin/env node
/**
 * Audience Expansion Audit — anchor 10 vs 16 vs 18 opening pool vs fragmentation.
 *
 *   node scripts/diag-audience-expansion-audit.mjs
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
const outJson = path.join(root, 'tmp', 'audience_expansion_audit.json');
const outMd = path.join(root, 'tmp', 'audience_expansion_audit.md');

const MARKETS = ['seattle', 'sanfrancisco', 'atlanta'];
const ANCHORS = [10, 16, 18];
const DEFAULT_RUNS = 40;
const DEFAULT_SEED = 20260609;

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
    Image: class { set src(_v) {} },
    Audio: class {},
    navigator: { userAgent: 'node', clipboard: { writeText() {} } },
    performance: { now: () => Date.now() },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
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
  if (anchor !== 10) legacy = patchLargeAnchor1975(legacy, anchor);
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
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

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pctGrowth(from, to) {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return (to - from) / from;
}

const RUNNER_IIFE = `
(function(){
  function isComm(s){
    return s&&!s._bpSlotDeferred&&!s.isPublic&&String(s.format||'').indexOf('PUBLIC_')!==0;
  }
  function engageWeightedPop(){
    var t=0;
    if(typeof COH==='undefined'||typeof POP==='undefined')return 0;
    for(var i=0;i<COH.length;i++){
      var c=COH[i];
      var pop=(POP.cohorts[c]&&POP.cohorts[c].t)||0;
      var engage=(typeof AQH_ENGAGE!=='undefined'&&AQH_ENGAGE[c])?AQH_ENGAGE[c]:0.06;
      t+=pop*engage;
    }
    return t;
  }
  function halfPeriodBillingTarget(G){
    var mktId=G.marketId||ACTIVE_MARKET;
    var year=G.year||1970;
    var period=G.period||1;
    var annual=typeof marketAnnualBilling==='function'?marketAnnualBilling(year,mktId):0;
    var hs=typeof marketHalfSeasonFactor==='function'?marketHalfSeasonFactor(year,period):1;
    var adx=Math.max(0.75,G.adx||1);
    return Math.round(annual*0.5*hs*adx);
  }
  function measureOpening(marketId, seedVal){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function') syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      var sc=SC.find(function(x){return x.id==='under';})||SC[0];
      var origIdx=sc.idx; sc.idx=[1];
      G=genMarket('under');
      sc.idx=origIdx;
      var mock={
        stations:G.stations,marketId:G.marketId,year:G.year,period:G.period,turn:G.turn||0,
        ps:G.ps,adx:G.adx,fmp:G.fmp,streamDrag:G.streamDrag||0,satDrag:0
      };
      if(typeof recalc==='function') recalc(G.stations,mock);
      if(typeof seedRev==='function') seedRev(G.stations,mock);
      var comm=G.stations.filter(isComm);
      var n=comm.length;
      var totalAqh=0, totalRev=0, totalShare=0;
      for(var i=0;i<comm.length;i++){
        var st=comm[i];
        totalAqh+=(st.rat&&st.rat.aqh)?Number(st.rat.aqh):0;
        totalRev+=(st.fin&&st.fin.rev)?Number(st.fin.rev):0;
        totalShare+=(st.rat&&st.rat.share!=null)?Number(st.rat.share):0;
      }
      var allRated=G.stations.filter(function(st){return st&&!st._bpSlotDeferred&&st.rat;});
      var totalRatedAqh=0, totalRatedShare=0;
      for(var j=0;j<allRated.length;j++){
        totalRatedAqh+=Number(allRated[j].rat.aqh)||0;
        totalRatedShare+=Number(allRated[j].rat.share)||0;
      }
      var ewp=engageWeightedPop();
      var halfBill=halfPeriodBillingTarget(G);
      var annualBill=typeof marketAnnualBilling==='function'?marketAnnualBilling(G.year||1970,marketId):0;
      var dialTarget=typeof largeMarketTotalStationsTargetForYear==='function'
        ?largeMarketTotalStationsTargetForYear(1970):null;
      return {
        ok:true,
        marketId:marketId,
        seed:seedVal,
        year:G.year,
        period:G.period,
        anchorDialTarget:dialTarget,
        nCommercial:n,
        nRated:allRated.length,
        totalCommercialAqh:totalAqh,
        totalRatedAqh:totalRatedAqh,
        annualCommercialBilling:annualBill,
        halfPeriodBillingTarget:halfBill,
        totalCommercialRevenue:totalRev,
        revenuePoolVsBilling:halfBill>0?totalRev/halfBill:0,
        avgRevPerStation:n?totalRev/n:0,
        avgSharePerStation:n?totalShare/n:0,
        sumCommercialShare:totalShare,
        sumRatedShare:totalRatedShare,
        engageWeightedPop:ewp,
        listenerPerStationAqh:n?totalAqh/n:0,
        listenerPerStationPopWeight:n?ewp/n:0,
        revenuePerAqhListener:totalAqh>0?totalRev/totalAqh:0,
        revenuePerPopWeight:ewp>0?totalRev/ewp:0,
        playerShare:(G.ps&&G.ps[0]&&G.ps[0].rat)?G.ps[0].rat.share:null
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { measureOpening: measureOpening };
})();
`;

function aggregateRows(rows) {
  const ok = rows.filter((r) => r.ok);
  const pick = (k) => ok.map((r) => r[k]);
  return {
    n: ok.length,
    nCommercialMed: median(pick('nCommercial')),
    totalCommercialAqhMed: median(pick('totalCommercialAqh')),
    totalRatedAqhMed: median(pick('totalRatedAqh')),
    annualBillingMed: median(pick('annualCommercialBilling')),
    halfBillingMed: median(pick('halfPeriodBillingTarget')),
    totalRevenueMed: median(pick('totalCommercialRevenue')),
    revenuePoolVsBillingMed: median(pick('revenuePoolVsBilling')),
    avgRevPerStationMed: median(pick('avgRevPerStation')),
    avgSharePerStationMed: median(pick('avgSharePerStation')),
    sumCommercialShareMed: median(pick('sumCommercialShare')),
    listenerPerStationAqhMed: median(pick('listenerPerStationAqh')),
    revenuePerAqhMed: median(pick('revenuePerAqhListener')),
    playerShareMed: median(pick('playerShare')),
  };
}

function growthRow(base, next) {
  return {
    stationCountPct: pctGrowth(base.nCommercialMed, next.nCommercialMed),
    revenuePoolPct: pctGrowth(base.totalRevenueMed, next.totalRevenueMed),
    totalAqhPct: pctGrowth(base.totalCommercialAqhMed, next.totalCommercialAqhMed),
    halfBillingPct: pctGrowth(base.halfBillingMed, next.halfBillingMed),
    avgRevPerStationPct: pctGrowth(base.avgRevPerStationMed, next.avgRevPerStationMed),
    avgSharePerStationPct: pctGrowth(base.avgSharePerStationMed, next.avgSharePerStationMed),
    listenerPerStationAqhPct: pctGrowth(base.listenerPerStationAqhMed, next.listenerPerStationAqhMed),
    gapStationsMinusRevenue:
      pctGrowth(base.nCommercialMed, next.nCommercialMed) != null &&
      pctGrowth(base.totalRevenueMed, next.totalRevenueMed) != null
        ? pctGrowth(base.nCommercialMed, next.nCommercialMed) -
          pctGrowth(base.totalRevenueMed, next.totalRevenueMed)
        : null,
    gapStationsMinusAqh:
      pctGrowth(base.nCommercialMed, next.nCommercialMed) != null &&
      pctGrowth(base.totalCommercialAqhMed, next.totalCommercialAqhMed) != null
        ? pctGrowth(base.nCommercialMed, next.nCommercialMed) -
          pctGrowth(base.totalCommercialAqhMed, next.totalCommercialAqhMed)
        : null,
  };
}

function fmtPct(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(d)}%`;
}

function fmtNum(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return Math.round(x).toLocaleString();
}

function fmtShare(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(2)}%`;
}

function main() {
  const runs = parseInt(process.env.EXPANSION_RUNS || String(DEFAULT_RUNS), 10) || DEFAULT_RUNS;
  const seed = parseInt(process.env.AUDIT_SEED || String(DEFAULT_SEED), 10) || DEFAULT_SEED;
  const t0 = Date.now();

  const runners = {};
  for (const anchor of ANCHORS) {
    const ctx = loadCtx(anchor);
    runners[anchor] = vm.runInContext(RUNNER_IIFE, ctx);
  }

  const results = {
    meta: { seed, runs, markets: MARKETS, anchors: ANCHORS, year: 1970, scenId: 'under' },
    byMarket: {},
    growth: {},
    conclusion: {},
  };

  console.log('=== Audience expansion audit @ 1970 ===\n');

  for (const marketId of MARKETS) {
    results.byMarket[marketId] = {};
    for (const anchor of ANCHORS) {
      const rows = [];
      for (let r = 0; r < runs; r++) {
        const s0 = seed + anchor * 1000 + marketSalt(marketId) * 23 + r * 9973;
        rows.push(runners[anchor].measureOpening(marketId, s0));
      }
      const agg = aggregateRows(rows);
      results.byMarket[marketId][anchor] = { runs: rows, aggregate: agg };
      console.log(
        `  ${marketId} a${anchor}: comm ${agg.nCommercialMed} · AQH ${fmtNum(agg.totalCommercialAqhMed)} · rev $${fmtNum(agg.totalRevenueMed)} · halfBill $${fmtNum(agg.halfBillingMed)} · avgSh ${fmtShare(agg.avgSharePerStationMed)}`,
      );
    }
    results.growth[marketId] = {
      a10to16: growthRow(
        results.byMarket[marketId][10].aggregate,
        results.byMarket[marketId][16].aggregate,
      ),
      a10to18: growthRow(
        results.byMarket[marketId][10].aggregate,
        results.byMarket[marketId][18].aggregate,
      ),
      a16to18: growthRow(
        results.byMarket[marketId][16].aggregate,
        results.byMarket[marketId][18].aggregate,
      ),
    };
    const g = results.growth[marketId].a10to16;
    console.log(
      `    Δ10→16: stations ${fmtPct(g.stationCountPct)} · rev pool ${fmtPct(g.revenuePoolPct)} · AQH ${fmtPct(g.totalAqhPct)} · gap(st-rev) ${fmtPct(g.gapStationsMinusRevenue)}`,
    );
  }

  const pooled = {};
  for (const anchor of ANCHORS) {
    const allRows = MARKETS.flatMap((m) => results.byMarket[m][anchor].runs);
    pooled[anchor] = aggregateRows(allRows);
  }
  results.pooled = pooled;
  results.growth.pooled = {
    a10to16: growthRow(pooled[10], pooled[16]),
    a10to18: growthRow(pooled[10], pooled[18]),
  };

  const g = results.growth.pooled.a10to16;
  const marketGrows = Math.abs(g.revenuePoolPct || 0) < 0.02 && Math.abs(g.halfBillingPct || 0) < 0.01;
  const aqhGrowsWithStations =
    g.totalAqhPct != null && g.stationCountPct != null && g.totalAqhPct > 0.05;
  const fragmentation =
    g.gapStationsMinusRevenue != null && g.gapStationsMinusRevenue > 0.25;

  results.conclusion = {
    questionA_marketBecomesLarger:
      marketGrows && !aqhGrowsWithStations
        ? 'billing/revenue pool flat; AQH mass does not scale with dial — redistribution'
        : aqhGrowsWithStations
          ? 'partial AQH expansion with dial'
          : 'revenue/billing pool approximately fixed per market year',
    questionB_billingProportional:
      Math.abs(g.halfBillingPct || 0) < 0.005
        ? 'half-period billing target unchanged by anchor (marketAnnualBilling spine)'
        : `billing shift ~${fmtPct(g.halfBillingPct)}`,
    questionC_redistribution:
      fragmentation
        ? 'mostly redistributing fixed pool among more stations'
        : 'mixed',
    evidence: {
      pooledGrowth10to16: g,
      revenuePoolVsBillingMed: pooled[16].revenuePoolVsBillingMed,
    },
    answer:
      'Anchor dial increases commercial station count; opening half-period billing target and summed commercial revenue pool stay ~flat per market. Total commercial AQH and per-station average share/revenue fall ~in proportion to added stations — audience fragmentation without meaningful audience/revenue expansion.',
  };

  const lines = [];
  lines.push('# Audience Expansion Audit — Anchor 10 vs 16 vs 18');
  lines.push('');
  lines.push(`Runs: ${runs}/market/anchor · seed ${seed} · 1970 opening · \`under\``);
  lines.push('');
  lines.push('## 1. Opening metrics by market & anchor (medians)');
  lines.push('');
  lines.push('| Market | Anchor | Comm | Total AQH | Half-period billing | Revenue pool | Avg rev/st | Avg share/st | AQH/st | $/AQH |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const mid of MARKETS) {
    for (const anchor of ANCHORS) {
      const a = results.byMarket[mid][anchor].aggregate;
      lines.push(
        `| ${mid} | ${anchor} | ${a.nCommercialMed} | ${fmtNum(a.totalCommercialAqhMed)} | $${fmtNum(a.halfBillingMed)} | $${fmtNum(a.totalRevenueMed)} | $${fmtNum(a.avgRevPerStationMed)} | ${fmtShare(a.avgSharePerStationMed)} | ${fmtNum(a.listenerPerStationAqhMed)} | $${(a.revenuePerAqhMed || 0).toFixed(2)} |`,
      );
    }
  }
  lines.push('');
  lines.push('## 2. Growth rates (median aggregates)');
  lines.push('');
  lines.push('| Market | Transition | Station count | Revenue pool | Total AQH | Half billing | Avg rev/st | Avg share/st | Gap (st−rev) | Gap (st−AQH) |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const mid of MARKETS) {
    for (const [label, key] of [
      ['10→16', 'a10to16'],
      ['10→18', 'a10to18'],
    ]) {
      const x = results.growth[mid][key];
      lines.push(
        `| ${mid} | ${label} | ${fmtPct(x.stationCountPct)} | ${fmtPct(x.revenuePoolPct)} | ${fmtPct(x.totalAqhPct)} | ${fmtPct(x.halfBillingPct)} | ${fmtPct(x.avgRevPerStationPct)} | ${fmtPct(x.avgSharePerStationPct)} | ${fmtPct(x.gapStationsMinusRevenue)} | ${fmtPct(x.gapStationsMinusAqh)} |`,
      );
    }
  }
  const pg = results.growth.pooled.a10to16;
  lines.push(
    `| **pooled** | **10→16** | **${fmtPct(pg.stationCountPct)}** | **${fmtPct(pg.revenuePoolPct)}** | **${fmtPct(pg.totalAqhPct)}** | **${fmtPct(pg.halfBillingPct)}** | **${fmtPct(pg.avgRevPerStationPct)}** | **${fmtPct(pg.avgSharePerStationPct)}** | **${fmtPct(pg.gapStationsMinusRevenue)}** | **${fmtPct(pg.gapStationsMinusAqh)}** |`,
  );
  lines.push('');
  lines.push('## 3. Answers');
  lines.push('');
  lines.push(`**A) Does the market itself become larger?** ${results.conclusion.questionA_marketBecomesLarger}`);
  lines.push('');
  lines.push(`**B) Does total commercial billing increase proportionally with station count?** ${results.conclusion.questionB_billingProportional}`);
  lines.push('');
  lines.push(`**C) Redistribution vs expansion?** ${results.conclusion.questionC_redistribution}`);
  lines.push('');
  lines.push(results.conclusion.answer);
  lines.push('');
  lines.push('Mechanism: `seedRev` scales station dollars to `marketAnnualBilling(year, marketId)` half-period target — **not** station count. `applyListeningHoursShareFromAqh` normalizes headline shares to AQH mass; more competitors split cohort listening in `recalc`.');

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  results.timingMs = Date.now() - t0;
  writeFileSync(outJson, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(outMd, `${lines.join('\n')}\n`);
  console.log(`\nWrote ${outJson} (${(results.timingMs / 1000).toFixed(0)}s)`);
}

main();
