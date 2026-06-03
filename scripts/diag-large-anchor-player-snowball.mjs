#!/usr/bin/env node
/**
 * Player-style snowball A/B: large-market 1970 anchor 10 vs 16 vs 18.
 * Markets: seattle, sanfrancisco, atlanta · aggressive benchmark bot · diagnostic only.
 *
 *   node scripts/diag-large-anchor-player-snowball.mjs
 *   node scripts/diag-large-anchor-player-snowball.mjs --runs=15
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
const outJson = path.join(root, 'tmp', 'large_anchor_player_snowball.json');
const outMd = path.join(root, 'tmp', 'large_anchor_player_snowball.md');

const LARGE_MARKETS = ['seattle', 'sanfrancisco', 'atlanta'];
const ANCHORS = [10, 16, 18];
const DEFAULT_RUNS = 18;
const DEFAULT_SEED = 20260604;

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

function loadCtx(anchor1975) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  src = patchLargeAnchor1975(src, anchor1975);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 600_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  vm.runInContext(readFileSync(snowballPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(6, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
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
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[m] : (s[m] + s[m + 1]) / 2;
}

function pct(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(d)}%`;
}

const ANALYZE_IIFE = `
(function(){
  function periodIndex(year, period){ return (year-1970)*2+(period-1); }
  function pickDecadeRow(diary, targetYear){
    var rows=diary.filter(function(d){ return d.year<=targetYear&&d.nStations>=1&&d.totalRev>0; });
    if(!rows.length) return null;
    var best=null;
    for(var i=0;i<rows.length;i++){
      if(rows[i].year===targetYear&&rows[i].period===1) return rows[i];
      if(rows[i].year<=targetYear&&(!best||rows[i].year>best.year||(rows[i].year===best.year&&rows[i].period>=best.period))) best=rows[i];
    }
    return best;
  }
  function marketTop3(row){
    if(!row||!row.top10Market) return null;
    var s=0;
    for(var i=0;i<Math.min(3,row.top10Market.length);i++) s+=(row.top10Market[i].share||0);
    return s;
  }
  function viableCompetitors(row){
    if(!row||!row.top10Market) return 0;
    var n=0;
    for(var i=0;i<row.top10Market.length;i++){
      var t=row.top10Market[i];
      if(!t.isPlayer&&(t.share||0)>=0.02) n++;
    }
    return n;
  }
  function acqCount(diary){
    var n=0;
    for(var i=0;i<diary.length;i++){
      var a=diary[i].actions&&diary[i].actions.acquisitions;
      if(a) n+=a.length;
    }
    return n;
  }
  function aiChurn(diary){
    var rf=0, po=0, cp=0;
    for(var i=0;i<diary.length;i++){
      var d=diary[i].aiDelta||{};
      rf+=(d.rivalReformatsTotal||0);
      po+=(d.poachPlayerAttempts||0);
      cp+=(d.counterPromoVsPlayer||0);
    }
    return { rivalReformats:rf, poachAttempts:po, counterPromo:cp };
  }
  function endMarketState(G){
    if(!G) return {};
    var comm=(G.stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&!s.isPublic&&String(s.format||'').indexOf('PUBLIC_')!==0;
    });
    var zombie=0, removed=G._attritionRemovedCumulative||0;
    for(var i=0;i<comm.length;i++){
      if(comm[i].isZombie) zombie++;
    }
    var avail=0;
    for(var j=0;j<comm.length;j++){
      if(!comm[j].isPlayer) avail++;
    }
    return { commercialActive:comm.length, aiStationsAvailAcq:avail, zombie:zombie, removedCumulative:removed };
  }
  function analyzeTrace(out){
    var diary=out.diary||[];
    var summary=out.summary||{};
    var firstOp=null;
    for(var i=0;i<diary.length;i++){
      if(diary[i].nStations>=1&&diary[i].totalRev>0){ firstOp=diary[i]; break; }
    }
    var decadeRows=diary.filter(function(d){ return d.year<=1980; });
    var peakShare=0;
    for(var p=0;p<decadeRows.length;p++){
      if(decadeRows[p].topShare>peakShare) peakShare=decadeRows[p].topShare;
    }
    var r80=pickDecadeRow(diary,1980)||{};
    var r00=diary.length?diary[diary.length-1]:{};
    for(var k=diary.length-1;k>=0;k--){
      if(diary[k].year<=2000){ r00=diary[k]; break; }
    }
    var timeToRank1=null;
    if(summary.firstYearPeriodRank1){
      timeToRank1=periodIndex(summary.firstYearPeriodRank1.year,summary.firstYearPeriodRank1.period);
    }
    var rev0=firstOp?firstOp.totalRev:0;
    var rev80=r80.totalRev||0;
    var eb80=r80.totalEbitda||0;
    var cash0=firstOp?firstOp.cashEnd:0;
    var cash80=r80.cashEnd||0;
    var churn=aiChurn(diary);
    return {
      bankrupt:!!r00.soloBankrupt,
      timeToRank1HalfYears:timeToRank1,
      firstAcquisition:summary.firstAcquisition,
      peakShare1980:peakShare,
      revGrowth1980: rev0>0?(rev80/rev0):null,
      ebitda1980:eb80,
      cashEnd1980:cash80,
      cashGrowth1980:cash80-cash0,
      viableCompetitors1980:viableCompetitors(r80),
      marketTop31980:marketTop3(r80),
      playerStations2000:r00.nStations||0,
      playerTopShare2000:r00.topShare||0,
      playerCluster2000:r00.clusterShare||0,
      marketTop32000:marketTop3(r00),
      cashEnd2000:r00.cashEnd||0,
      ebitda2000:r00.totalEbitda||0,
      rev2000:r00.totalRev||0,
      acquisitionsTotal:acqCount(diary),
      nTop102000:r00.nTop10||0,
      aiChurn:churn,
      periodsLogged:diary.length,
      neverRank1:timeToRank1==null
    };
  }
  return { analyzeTrace:analyzeTrace, endMarketState:endMarketState };
})();
`;

function aggregateRuns(rows) {
  const pick = (k) => median(rows.map((r) => r[k]));
  const pickFn = (fn) => median(rows.map(fn));
  const rate = (fn) => rows.filter(fn).length / Math.max(1, rows.length);
  return {
    n: rows.length,
    bankruptRate: rate((r) => r.bankrupt),
    timeToRank1: pick((r) => r.timeToRank1HalfYears),
    neverRank1Rate: rate((r) => r.neverRank1),
    peakShare1980: pick((r) => r.peakShare1980),
    revGrowth1980: pick((r) => r.revGrowth1980),
    ebitda1980: pick((r) => r.ebitda1980),
    cashEnd1980: pick((r) => r.cashEnd1980),
    cashGrowth1980: pick((r) => r.cashGrowth1980),
    viableCompetitors1980: pick((r) => r.viableCompetitors1980),
    marketTop31980: pick((r) => r.marketTop31980),
    playerStations2000: pick((r) => r.playerStations2000),
    playerTopShare2000: pick((r) => r.playerTopShare2000),
    playerCluster2000: pick((r) => r.playerCluster2000),
    marketTop32000: pick((r) => r.marketTop32000),
    cashEnd2000: pick((r) => r.cashEnd2000),
    ebitda2000: pick((r) => r.ebitda2000),
    rev2000: pick((r) => r.rev2000),
    acquisitionsTotal: pick((r) => r.acquisitionsTotal),
    rivalReformats: pickFn((r) => r.aiChurn?.rivalReformats),
    poachAttempts: pickFn((r) => r.aiChurn?.poachAttempts),
    zombieEnd: pick((r) => r.endMarket?.zombie),
    removedEnd: pick((r) => r.endMarket?.removedCumulative),
    commercialActive2000: pick((r) => r.endMarket?.commercialActive),
    acqPool2000: pick((r) => r.endMarket?.aiStationsAvailAcq),
  };
}

function difficultyScore(agg, anchorBaseline) {
  if (!agg || agg.bankruptRate > 0.25) return 9;
  const t1 = agg.timeToRank1 ?? 40;
  const baseT1 = anchorBaseline?.timeToRank1 ?? t1;
  let score = 5;
  score += Math.min(2, (t1 - baseT1) / 8);
  score -= Math.min(1.5, (agg.peakShare1980 ?? 0) - (anchorBaseline?.peakShare1980 ?? 0)) * 8;
  score += Math.min(1.5, ((agg.marketTop32000 ?? 0.5) - 0.42) * 4);
  if (agg.neverRank1Rate > 0.15) score += 2;
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const results = { anchors: {}, meta: { runs: opts.runs, seed: opts.seed, policy: 'aggressive', endYear: 2000 } };

  for (const anchor of ANCHORS) {
    console.log(`\n=== Anchor ${anchor} · aggressive player bot ===`);
    const ctx = loadCtx(anchor);
    const analyze = vm.runInContext(ANALYZE_IIFE, ctx);
    if (!ctx.runMarketSnowballTrace) {
      console.error('runMarketSnowballTrace missing');
      process.exitCode = 1;
      return;
    }

    results.anchors[anchor] = {};

    for (const marketId of LARGE_MARKETS) {
      const runRows = [];
      for (let run = 0; run < opts.runs; run++) {
        const seed = opts.seed + anchor * 1000 + marketSalt(marketId) * 17 + run * 9973;
        let trace;
        try {
          trace = ctx.runMarketSnowballTrace({
            marketId,
            scenId: 'under',
            seed,
            endYear: 2000,
            endPeriod: 2,
            playerPolicy: 'aggressive',
            activePlayer: true,
            easyAi: false,
            maxSteps: 340,
          });
        } catch (e) {
          runRows.push({ error: String(e?.message || e), bankrupt: true, neverRank1: true });
          continue;
        }
        const m = analyze.analyzeTrace(trace);
        m.seed = seed;
        runRows.push(m);
      }
      results.anchors[anchor][marketId] = { runs: runRows, aggregate: aggregateRuns(runRows.filter((r) => !r.error)) };
      const a = results.anchors[anchor][marketId].aggregate;
      console.log(
        `  ${marketId}: rank1@${a.timeToRank1 ?? '—'}hy · peak80 ${pct(a.peakShare1980)} · st2000 ${a.playerStations2000} · acq ${a.acquisitionsTotal} · top3mkt ${pct(a.marketTop32000)} · bust ${pct(a.bankruptRate, 0)}`,
      );
    }
  }

  const baseline = results.anchors[10];
  const rec = { scores: {} };
  for (const anchor of ANCHORS) {
    let score = 0;
    for (const mid of LARGE_MARKETS) {
      const a = results.anchors[anchor][mid].aggregate;
      const b = baseline[mid].aggregate;
      if (a.bankruptRate < b.bankruptRate) score += 2;
      if ((a.timeToRank1 ?? 99) < (b.timeToRank1 ?? 99)) score += 1;
      if ((a.viableCompetitors1980 ?? 0) > (b.viableCompetitors1980 ?? 0)) score += 2;
      if ((a.peakShare1980 ?? 0) > (b.peakShare1980 ?? 0) * 0.95 && (a.peakShare1980 ?? 0) < 0.22) score += 1;
      if (Math.abs((a.marketTop32000 ?? 0) - 0.45) < Math.abs((b.marketTop32000 ?? 0) - 0.45)) score += 1;
      if ((a.acquisitionsTotal ?? 0) >= (b.acquisitionsTotal ?? 0)) score += 1;
      if ((a.rivalReformats ?? 0) < (b.rivalReformats ?? 0) * 1.35) score += 0.5;
      a.difficulty = difficultyScore(a, b);
    }
    rec.scores[anchor] = score;
  }

  const clusterSpread = (anchor) => {
    const t3 = LARGE_MARKETS.map((m) => results.anchors[anchor][m].aggregate.marketTop32000);
    return Math.max(...t3) - Math.min(...t3);
  };

  let ship = 10;
  const s16 = rec.scores[16];
  const s18 = rec.scores[18];
  if (s18 >= s16 + 2 && clusterSpread(18) <= clusterSpread(16) + 0.02) ship = 18;
  else if (s16 > s18) ship = 16;
  else if (s18 > s16) ship = 18;
  else ship = 16;

  results.recommendation = { shipAnchor: ship, scores: rec.scores, clusterSpread };

  const lines = [];
  lines.push('# Large-market anchor player snowball A/B');
  lines.push('');
  lines.push(`Policy: **aggressive** benchmark bot (acquire · hire · promo/prog · leadership chase) · ${opts.runs} runs/cell · to **2000**`);
  lines.push('');

  lines.push('## Opening decade (1970–1980) — median');
  lines.push('| Anchor | Market | Yrs to #1 | Peak share | Rev growth | EBITDA ’80 | Cash ’80 | Viable rivals (≥2% sh) | Mkt top-3 |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const anchor of ANCHORS) {
    for (const mid of LARGE_MARKETS) {
      const a = results.anchors[anchor][mid].aggregate;
      lines.push(
        `| ${anchor} | ${mid} | ${a.timeToRank1 != null ? (a.timeToRank1 / 2).toFixed(1) : '—'} | ${pct(a.peakShare1980)} | ${a.revGrowth1980 != null ? a.revGrowth1980.toFixed(2) + '×' : '—'} | $${Math.round(a.ebitda1980 || 0).toLocaleString()} | $${Math.round(a.cashEnd1980 || 0).toLocaleString()} | ${a.viableCompetitors1980} | ${pct(a.marketTop31980)} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Long run (2000) — median');
  lines.push('| Anchor | Market | Player st | Top sh | Cluster | Mkt top-3 | Acquisitions | Cash | EBITDA | Bust% | AI reformats | Zombies |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const anchor of ANCHORS) {
    for (const mid of LARGE_MARKETS) {
      const a = results.anchors[anchor][mid].aggregate;
      lines.push(
        `| ${anchor} | ${mid} | ${a.playerStations2000} | ${pct(a.playerTopShare2000)} | ${pct(a.playerCluster2000)} | ${pct(a.marketTop32000)} | ${a.acquisitionsTotal} | $${Math.round(a.cashEnd2000 || 0).toLocaleString()} | $${Math.round(a.ebitda2000 || 0).toLocaleString()} | ${pct(a.bankruptRate, 0)} | ${a.rivalReformats?.toFixed(0)} | ${a.zombieEnd} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Relative difficulty (1=easy … 10=brutal, vs anchor-10 baseline)');
  for (const anchor of ANCHORS) {
    lines.push(`### Anchor ${anchor}`);
    for (const mid of LARGE_MARKETS) {
      const a = results.anchors[anchor][mid].aggregate;
      lines.push(`- ${mid}: **${a.difficulty}**`);
    }
  }

  lines.push('');
  lines.push(`## Ship recommendation: **anchor ${ship}** (scored ${JSON.stringify(rec.scores)})`);
  lines.push('');
  const verdict = {
    10: 'Keep 10 — only if you want fastest, most concentrated duopoly fantasy (weak rival field).',
    16: 'Ship 16 — balanced lift in rivals + acquisitions without max dial noise.',
    18: 'Ship 18 — deepest opening / most FM targets; best mega-like concentration if churn acceptable.',
  };
  lines.push(verdict[ship] || '');

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  results.timingMs = Date.now() - t0;
  writeFileSync(outJson, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(outMd, `${lines.join('\n')}\n`);
  console.log('\n' + lines.slice(-12).join('\n'));
  console.log(`\nWrote ${outJson} (${(results.timingMs / 1000).toFixed(0)}s)`);
}

main();
