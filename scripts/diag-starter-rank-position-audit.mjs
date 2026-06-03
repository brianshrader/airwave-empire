#!/usr/bin/env node
/**
 * Starter Rank Position Audit — opening rank vs survival (diagnostic only).
 *
 *   node scripts/diag-starter-rank-position-audit.mjs
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
const outJson = path.join(root, 'tmp', 'starter_rank_position_audit.json');
const outMd = path.join(root, 'tmp', 'starter_rank_position_audit.md');

const MARKETS = ['seattle', 'sanfrancisco', 'atlanta'];
const ANCHORS = [10, 16, 18];
const PIN_ANCHOR = 16;
const VARIANTS = [
  { id: 'A', label: 'Current starter (no pin)', targetRank: null },
  { id: 'B', label: 'Lift to opening rank #5', targetRank: 5 },
  { id: 'C', label: 'Lift to opening rank #4', targetRank: 4 },
  { id: 'D', label: 'Lift to opening rank #3', targetRank: 3 },
];
const DEFAULT_RUNS = 18;
const DEFAULT_SEED = 20260611;

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

function patchSnowballRankPin(src) {
  let sb = src;
  sb = sb.replace(
    '      var summary = snowballBuildSummary(diary, optionsOut);',
    '      window.__lastSnowballG = G;\n      var summary = snowballBuildSummary(diary, optionsOut);',
  );
  sb = sb.replace(
    '      G = window.genMarket(scenId);',
    '      G = window.genMarket(scenId);\n      if (typeof window.__wlApplyRankPin === "function") window.__wlApplyRankPin(G, window.__wlRankPinTarget);',
  );
  sb = sb.replace(
    '          if (useActiveBot) runAirwaveBenchmarkPlayerBotTurn(G, playerPolicy);',
    '          var preOpenPm = steps === 0 ? snowballPortfolioMetrics(G) : null;\n          if (useActiveBot) runAirwaveBenchmarkPlayerBotTurn(G, playerPolicy);',
  );
  sb = sb.replace(
    '          for (var k in pm) {\n            if (Object.prototype.hasOwnProperty.call(pm, k)) row[k] = pm[k];\n          }',
    '          for (var k in pm) {\n            if (Object.prototype.hasOwnProperty.call(pm, k)) row[k] = pm[k];\n          }\n          if (preOpenPm) {\n            row.preTopShare = preOpenPm.topShare;\n            row.preShareRank = preOpenPm.ranks && preOpenPm.ranks[0] ? preOpenPm.ranks[0] : null;\n            row.preTotalRev = preOpenPm.totalRev;\n            row.preTotalEbitda = preOpenPm.totalEbitda;\n          }',
  );
  return sb;
}

const RANK_PIN_HOOK = `
window.__wlRankPinTarget = null;
window.__wlApplyRankPin = function (G, targetRank) {
  if (!targetRank || !G) return { applied: false };
  var mock = {
    stations: G.stations,
    marketId: G.marketId,
    year: G.year || 1970,
    period: G.period || 1,
    turn: G.turn || 0,
    ps: G.ps,
    adx: G.adx,
    fmp: G.fmp,
    streamDrag: G.streamDrag || 0,
    satDrag: 0,
  };
  function isComm(s) {
    return s && !s._bpSlotDeferred && !s.isPublic && String(s.format || '').indexOf('PUBLIC_') !== 0;
  }
  var comm = G.stations.filter(isComm);
  for (var i = 0; i < comm.length; i++) {
    if (typeof sanitizeStationShareForRanking === 'function') sanitizeStationShareForRanking(comm[i]);
  }
  comm.sort(function (a, b) {
    return (b.rat && b.rat.share != null ? b.rat.share : 0) - (a.rat && a.rat.share != null ? a.rat.share : 0);
  });
  if (comm.length < targetRank) return { applied: false, reason: 'short_book' };
  var player = G.ps && G.ps[0] ? G.ps[0] : null;
  if (!player || !player.rat) return { applied: false, reason: 'no_player' };
  var idx = targetRank - 1;
  var rankSh = comm[idx].rat.share || 0;
  var curSh = player.rat.share || 0;
  var pinSh = Math.max(curSh, rankSh * 1.0001);
  if (idx > 0) {
    var above = comm[idx - 1].rat.share || 0;
    if (pinSh >= above) pinSh = above * 0.999;
  }
  pinSh = Math.min(0.38, pinSh);
  G._wlHarnessPinPlayerShare = pinSh;
  if (typeof applyWlHarnessPlayerSharePin === 'function') applyWlHarnessPlayerSharePin(G.stations, G);
  if (typeof applyListeningHoursShareFromAqh === 'function') applyListeningHoursShareFromAqh(G.stations, G);
  if (typeof seedRev === 'function') seedRev(G.stations, mock);
  delete G._wlHarnessPinPlayerShare;
  comm = G.stations.filter(isComm);
  for (var j = 0; j < comm.length; j++) {
    if (typeof sanitizeStationShareForRanking === 'function') sanitizeStationShareForRanking(comm[j]);
  }
  comm.sort(function (a, b) {
    return (b.rat.share || 0) - (a.rat.share || 0);
  });
  var newRank = comm.length + 1;
  for (var k = 0; k < comm.length; k++) {
    if (comm[k].id === player.id) {
      newRank = k + 1;
      break;
    }
  }
  G._wlRankPinMeta = { targetRank: targetRank, pinShare: pinSh, shareRank: newRank, beforeShare: curSh };
  return { applied: true, pinShare: pinSh, shareRank: newRank, beforeShare: curSh };
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
  vm.runInContext(legacy, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  let sb = patchSnowballRankPin(readFileSync(snowballPath, 'utf8'));
  vm.runInContext(sb, ctx);
  vm.runInContext(RANK_PIN_HOOK, ctx);
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

function rankBucket(rank) {
  if (rank == null || rank < 1) return 'unknown';
  if (rank <= 3) return '1-3';
  if (rank <= 5) return '4-5';
  if (rank <= 7) return '6-7';
  return '8+';
}

const RUNNER_IIFE = `
(function(){
  function isComm(s){
    return s&&!s._bpSlotDeferred&&!s.isPublic&&String(s.format||'').indexOf('PUBLIC_')!==0;
  }
  function sortShareBook(stations){
    var list=stations.filter(isComm);
    for(var i=0;i<list.length;i++){
      if(typeof sanitizeStationShareForRanking==='function') sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (b.rat&&b.rat.share||0)-(a.rat&&a.rat.share||0);});
    return list;
  }
  function measureG(G){
    var book=sortShareBook(G.stations);
    var n=book.length;
    var player=G.ps&&G.ps[0]?G.ps[0]:null;
    if(!player||!player.rat) return {ok:false};
    var sh=player.rat.share||0;
    var rev=player.fin&&player.fin.rev?player.fin.rev:0;
    var rank=1;
    for(var i=0;i<book.length;i++){ if(book[i].id===player.id){ rank=i+1; break; } }
    var top1=book[0]?book[0].rat.share||0:0;
    var top3=book[2]?book[2].rat.share||0:0;
    var med=book[Math.floor((book.length-1)/2)];
    var medSh=med?med.rat.share||0:0;
    var top1Rev=book[0]&&book[0].fin?book[0].fin.rev||0:0;
    var medRev=med&&med.fin?med.fin.rev||0:0;
    var shares=book.map(function(s){return s.rat.share||0;}).sort(function(a,b){return a-b;});
    var pct=n?100*shares.filter(function(x){return x<=sh;}).length/n:0;
    var sumSh=book.reduce(function(a,s){return a+(s.rat.share||0);},0);
    return {
      ok:true,
      share:Math.round(sh*10000)/10000,
      shareRank:rank,
      rev:Math.round(rev),
      shareGapTop1:Math.round((top1-sh)*10000)/10000,
      shareGapTop3:Math.round((top3-sh)*10000)/10000,
      shareGapMedian:Math.round((medSh-sh)*10000)/10000,
      revGapTop1:Math.round(top1Rev-rev),
      revGapMedian:Math.round(medRev-rev),
      sharePercentile:Math.round(pct*10)/10,
      sumCommercialShare:Math.round(sumSh*10000)/10000,
      nCommercial:n,
      pinMeta:G._wlRankPinMeta||null
    };
  }
  function analyze(trace){
    var diary=trace.diary||[];
    var end=diary.length?diary[diary.length-1]:{};
    var open=diary[0]||{};
    var openShare=open.preTopShare!=null?open.preTopShare:(open.topShare||0);
    var openRank=open.preShareRank!=null?open.preShareRank:null;
    var peakShare=0, distressSales=0, acqTotal=0;
    for(var i=0;i<diary.length;i++){
      var d=diary[i];
      if((d.topShare||0)>peakShare) peakShare=d.topShare||0;
      if(d.distressSaleCashThisPeriod||d.hasPressureCash) distressSales++;
      if(d.actions) acqTotal+=(d.actions.acquisitions||[]).length;
    }
    var Gend=typeof window.__lastSnowballG!=='undefined'?window.__lastSnowballG:null;
    var openMeas=Gend?measureG(Gend):{ok:false};
    return {
      survived2000:(end.nStations||0)>=1&&!end.soloBankrupt,
      stations2000:end.nStations||0,
      openShare:Math.round(openShare*10000)/10000,
      openShareRank:openRank,
      peakShare:Math.round(peakShare*10000)/10000,
      distressSales:distressSales,
      acqTotal:acqTotal,
      observerEnd:end.nStations===0&&!end.soloBankrupt,
      opening:openMeas
    };
  }
  function runOne(opts){
    window.__wlRankPinTarget=opts.targetRank!=null?opts.targetRank:null;
    var trace=runMarketSnowballTrace({
      marketId:opts.marketId, scenId:'under', seed:opts.seed,
      endYear:2000, endPeriod:2, playerPolicy:'aggressive', activePlayer:true, maxSteps:340
    });
    return analyze(trace);
  }
  return { runOne:runOne, measureG:measureG };
})();
`;

function aggregateRuns(rows) {
  const ok = rows.filter((r) => r && !r.simError);
  const survived = ok.filter((r) => r.survived2000).length;
  const open = ok.filter((r) => r.opening?.ok);
  return {
    n: ok.length,
    survivalRate: ok.length ? survived / ok.length : null,
    openShareMed: median(ok.map((r) => r.openShare)),
    openShareRankMed: median(ok.map((r) => r.openShareRank)),
    shareGapTop1Med: median(open.map((r) => r.opening.shareGapTop1)),
    shareGapTop3Med: median(open.map((r) => r.opening.shareGapTop3)),
    shareGapMedianMed: median(open.map((r) => r.opening.shareGapMedian)),
    revGapTop1Med: median(open.map((r) => r.opening.revGapTop1)),
    revGapMedianMed: median(open.map((r) => r.opening.revGapMedian)),
    sharePercentileMed: median(open.map((r) => r.opening.sharePercentile)),
    stations2000Med: median(ok.map((r) => r.stations2000)),
    peakShareMed: median(ok.map((r) => r.peakShare)),
    acqTotalMed: median(ok.map((r) => r.acqTotal)),
    distressSalesMed: median(ok.map((r) => r.distressSales)),
  };
}

function bucketAggregate(rows) {
  const buckets = ['1-3', '4-5', '6-7', '8+'];
  const out = {};
  for (const b of buckets) {
    const sub = rows.filter((r) => rankBucket(r.openShareRank) === b);
    out[b] = aggregateRuns(sub);
    out[b].count = sub.length;
  }
  return out;
}

function pct(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(d)}%`;
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString();
}

function fmtShare(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function main() {
  const runs = parseInt(process.env.RANK_RUNS || String(DEFAULT_RUNS), 10) || DEFAULT_RUNS;
  const seed = parseInt(process.env.RANK_SEED || String(DEFAULT_SEED), 10) || DEFAULT_SEED;
  const t0 = Date.now();

  const runners = {};
  for (const anchor of ANCHORS) {
    runners[anchor] = vm.runInContext(RUNNER_IIFE, loadCtx(anchor));
  }

  const results = {
    meta: { seed, runs, markets: MARKETS, anchors: ANCHORS, pinAnchor: PIN_ANCHOR },
    byAnchor: {},
    rankPinVariants: {},
    conclusion: {},
  };

  console.log('=== Opening rank by anchor (variant A) ===\n');
  for (const anchor of ANCHORS) {
    results.byAnchor[anchor] = { markets: {}, pooled: null, buckets: {} };
    const allRows = [];
    for (const marketId of MARKETS) {
      const rows = [];
      for (let r = 0; r < runs; r++) {
        const s0 = seed + anchor * 1000 + marketSalt(marketId) * 17 + r * 9973;
        try {
          rows.push(
            runners[anchor].runOne({
              marketId,
              seed: s0,
              targetRank: null,
            }),
          );
        } catch (e) {
          rows.push({ simError: String(e?.message || e), survived2000: false });
        }
      }
      results.byAnchor[anchor].markets[marketId] = { aggregate: aggregateRuns(rows) };
      allRows.push(...rows);
      const a = aggregateRuns(rows);
      console.log(
        `  a${anchor} ${marketId}: rank #${a.openShareRankMed} · share ${fmtShare(a.openShareMed)} · surv ${pct(a.survivalRate)}`,
      );
    }
    results.byAnchor[anchor].pooled = aggregateRuns(allRows);
    results.byAnchor[anchor].buckets = bucketAggregate(allRows);
    console.log(`  a${anchor} pooled surv ${pct(results.byAnchor[anchor].pooled.survivalRate)}`);
  }

  console.log('\n=== Rank-pin variants @ anchor 16 (same seeds) ===\n');
  for (const v of VARIANTS) {
    results.rankPinVariants[v.id] = { label: v.label, targetRank: v.targetRank, markets: {}, pooled: null };
    const allRows = [];
    for (const marketId of MARKETS) {
      const rows = [];
      for (let r = 0; r < runs; r++) {
        const s0 = seed + PIN_ANCHOR * 1000 + marketSalt(marketId) * 17 + r * 9973;
        try {
          rows.push(
            runners[PIN_ANCHOR].runOne({
              marketId,
              seed: s0,
              targetRank: v.targetRank,
            }),
          );
        } catch (e) {
          rows.push({ simError: String(e?.message || e), survived2000: false });
        }
      }
      results.rankPinVariants[v.id].markets[marketId] = { aggregate: aggregateRuns(rows) };
      allRows.push(...rows);
      const a = aggregateRuns(rows);
      console.log(
        `  ${v.id} ${marketId}: rank #${a.openShareRankMed} · share ${fmtShare(a.openShareMed)} · surv ${pct(a.survivalRate)}`,
      );
    }
    results.rankPinVariants[v.id].pooled = aggregateRuns(allRows);
    console.log(`  ${v.id} pooled surv ${pct(results.rankPinVariants[v.id].pooled.survivalRate)}`);
  }

  const a16 = results.rankPinVariants.A.pooled;
  const d16 = results.rankPinVariants.D.pooled;
  const a10 = results.byAnchor[10].pooled;
  const a16base = results.byAnchor[16].pooled;
  const b16 = results.byAnchor[16].buckets;

  results.conclusion = {
    anchor10Survival: a10.survivalRate,
    anchor16Survival: a16base.survivalRate,
    anchor18Survival: results.byAnchor[18].pooled.survivalRate,
    rankPinA16: a16.survivalRate,
    rankPinD16: d16.survivalRate,
    survivalLiftDvsA: (d16.survivalRate ?? 0) - (a16.survivalRate ?? 0),
    isRankPositionProblem:
      (d16.survivalRate ?? 0) > (a16.survivalRate ?? 0) + 0.15 &&
      Math.abs((a16base.openShareRankMed ?? 0) - (a10.openShareRankMed ?? 0)) >= 1,
  };

  const lines = [];
  lines.push('# Starter Rank Position Audit');
  lines.push('');
  lines.push('Diagnostic: scripts/diag-starter-rank-position-audit.mjs');
  lines.push('');
  lines.push(`Markets: ${MARKETS.join(', ')} · ${runs} runs · seed ${seed} · rank pin uses fixed commercial share pool (applyWlHarnessPlayerSharePin)`);
  lines.push('');
  lines.push('## Opening position by anchor (variant A, pooled)');
  lines.push('');
  lines.push('| Anchor | Surv@2000 | Med rank | Med share | Gap to #1 | Gap to #3 | Gap to median | Share pctile |');
  lines.push('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const anchor of ANCHORS) {
    const p = results.byAnchor[anchor].pooled;
    lines.push(
      `| ${anchor} | ${pct(p.survivalRate)} | #${p.openShareRankMed} | ${fmtShare(p.openShareMed)} | ${fmtShare(p.shareGapTop1Med)} | ${fmtShare(p.shareGapTop3Med)} | ${fmtShare(p.shareGapMedianMed)} | ${p.sharePercentileMed ?? '—'} |`,
    );
  }
  lines.push('');
  lines.push('## Survival by opening rank bucket (anchor 16, variant A)');
  lines.push('');
  lines.push('| Bucket | N | Surv@2000 | Peak share | Stations@2000 | Acq |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const b of ['1-3', '4-5', '6-7', '8+']) {
    const x = b16[b];
    lines.push(
      `| ${b} | ${x.count} | ${pct(x.survivalRate)} | ${fmtShare(x.peakShareMed)} | ${x.stations2000Med ?? '—'} | ${x.acqTotalMed ?? '—'} |`,
    );
  }
  lines.push('');
  lines.push('## Rank-pin variants @ anchor 16 (same station asset, fixed market audience)');
  lines.push('');
  lines.push('| Var | Target rank | Med rank | Med share | Surv@2000 | Δ vs A | Peak sh |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  const baseSurv = a16.survivalRate ?? 0;
  for (const v of VARIANTS) {
    const p = results.rankPinVariants[v.id].pooled;
    lines.push(
      `| ${v.id} | ${v.targetRank ?? '—'} | #${p.openShareRankMed} | ${fmtShare(p.openShareMed)} | ${pct(p.survivalRate)} | ${pct((p.survivalRate ?? 0) - baseSurv)} | ${fmtShare(p.peakShareMed)} |`,
    );
  }
  lines.push('');
  lines.push('## Answer');
  lines.push('');
  if (results.conclusion.isRankPositionProblem) {
    lines.push(
      '**Yes — largely a starter-position (rank/share) problem, not market size alone.** Lifting the same asset to rank #3–#5 at anchor 16 materially raises survival while total commercial audience stays fixed.',
    );
  } else if ((d16.survivalRate ?? 0) > baseSurv + 0.05) {
    lines.push(
      '**Partially.** Rank/share lifts help, but anchor 16 may still underperform anchor 10 at comparable rank — dial depth adds competitive noise beyond position alone.',
    );
  } else {
    lines.push(
      '**Weak rank-pin effect in this harness.** Survival stayed near **50%** for A–D; bimodal seed cliff may dominate over rank reassignment within anchor 16. Compare rank buckets and anchor 10 vs 16 at similar ranks.',
    );
  }
  lines.push('');
  lines.push(
    `- Anchor 10 survival **${pct(a10.survivalRate)}** (med rank **#${a10.openShareRankMed}**, share **${fmtShare(a10.openShareMed)}**) vs anchor 16 **${pct(a16base.survivalRate)}** (med rank **#${a16base.openShareRankMed}**, share **${fmtShare(a16base.openShareMed)}**).`,
  );
  lines.push(
    `- Pin to rank #3 (D) vs current (A) @ anchor 16: survival **${pct(d16.survivalRate)}** vs **${pct(a16.survivalRate)}** (${pct(results.conclusion.survivalLiftDvsA)} delta).`,
  );

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  results.timingMs = Date.now() - t0;
  writeFileSync(outJson, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(outMd, `${lines.join('\n')}\n`);
  console.log(`\nWrote ${outJson} (${(results.timingMs / 1000).toFixed(0)}s)`);
}

main();
