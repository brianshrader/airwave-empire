#!/usr/bin/env node
/**
 * Large-market 1970 scaffold A/B — diagnostic only (no gameplay changes).
 *
 * Varies LARGE_MARKET_TOTAL_STATIONS_ANCHORS[1975] count: 10, 14, 16, 18.
 * Markets: Seattle, San Francisco, Atlanta (+ mega reference at baseline).
 *
 *   node scripts/diag-large-market-scaffold-ab.mjs
 *   node scripts/diag-large-market-scaffold-ab.mjs --runs=40
 *
 * Artifacts: tmp/large_market_scaffold_ab.json, tmp/large_market_scaffold_ab.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { DEV_BENCHMARK_MEGA_MARKET_IDS } from './market-ids.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'large_market_scaffold_ab.json');
const outMd = path.join(root, 'tmp', 'large_market_scaffold_ab.md');

const LARGE_MARKETS = ['seattle', 'sanfrancisco', 'atlanta'];
const ANCHOR_VARIANTS = [10, 14, 16, 18];
const SNAPSHOT_YEARS = [1980, 1990, 2000];
const ROCK_KEYS = ['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK', 'AAA', 'CLASSIC_HITS', 'OLDIES', 'BEAUTIFUL_MUSIC'];

const DEFAULT_RUNS = 50;
const DEFAULT_SEED = 20260603;

const MAX_STEPS = { 1980: 220, 1990: 300, 2000: 340 };

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
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(10, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
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

const RUN_IIFE = `
(function(){
  var ROCK_KEYS=${JSON.stringify(ROCK_KEYS)};
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isPublicFmt(fmt){ return String(fmt||'').indexOf('PUBLIC_')===0; }
  function sortBook(stations){
    var list=stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    return list;
  }
  function shannonDiversity(fmtSum){
    var ents=[], sum=0;
    for(var k in fmtSum){ if(fmtSum[k]>0.0001) ents.push(fmtSum[k]); sum+=fmtSum[k]; }
    if(!ents.length||sum<=0) return 0;
    var h=0;
    for(var i=0;i<ents.length;i++){ var p=ents[i]/sum; h-=p*Math.log(p); }
    return Math.exp(h);
  }
  function rockShare(fmtSum){
    var t=0; for(var i=0;i<ROCK_KEYS.length;i++) t+=(fmtSum[ROCK_KEYS[i]]||0); return t;
  }
  function rockPresent(fmtSum){
    for(var i=0;i<ROCK_KEYS.length;i++){ if((fmtSum[ROCK_KEYS[i]]||0)>0.0005) return true; }
    return false;
  }
  function measureBook(G){
    var book=sortBook(G.stations);
    var fmtSum={}, topShares=[];
    var commercialAm=0, commercialFm=0;
    for(var j=0;j<book.length;j++){
      var sh=book[j].rat.share||0;
      topShares.push(sh);
      var fk=fmtKey(book[j].format);
      fmtSum[fk]=(fmtSum[fk]||0)+sh;
    }
    for(var k=0;k<G.stations.length;k++){
      var st=G.stations[k];
      if(!st||st._bpSlotDeferred) continue;
      var sig=st.sig||{};
      var pub=isPublicFmt(st.format);
      if(sig.type==='AM'){ if(!pub) commercialAm++; }
      else if(sig.type==='FM'){ if(!pub) commercialFm++; }
    }
    var top3=0, top5=0;
    for(var t=0;t<Math.min(3,topShares.length);t++) top3+=topShares[t];
    for(var u=0;u<Math.min(5,topShares.length);u++) top5+=topShares[u];
    var fmTot=commercialAm+commercialFm;
    var h=typeof marketHealthSnapshot==='function'?marketHealthSnapshot(G):{zombie:0,nicheSurvival:0};
    var spiral=0, sumOq=0, nComm=0;
    var comm=(G.stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&!s.isPublic&&String(s.format||'').indexOf('PUBLIC_')!==0;
    });
    for(var c=0;c<comm.length;c++){
      var st2=comm[c];
      var oq=Math.round(st2.oq||0);
      var sh2=st2.rat&&st2.rat.share?st2.rat.share:0;
      if(sh2<0.015&&oq<50) spiral++;
      sumOq+=oq;
      nComm++;
    }
    return {
      top3Share:top3,
      top5Share:top5,
      commercialFm:commercialFm,
      commercialAm:commercialAm,
      fmAdoption: fmTot>0?commercialFm/fmTot:0,
      rockShare:rockShare(fmtSum),
      rockPresent:rockPresent(fmtSum),
      formatDiversity:shannonDiversity(fmtSum),
      stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length,
      hhi:(function(){ var s=0; for(var j=0;j<book.length;j++){ var x=book[j].rat.share||0; s+=x*x; } return s*10000; })(),
      zombie:h.zombie||0,
      nicheSurvival:h.nicheSurvival||0,
      spiralSnapshots:spiral,
      meanStationOq: nComm?sumOq/nComm:null,
      removedCumulative:G._attritionRemovedCumulative||0,
      fmtSum:fmtSum
    };
  }
  function runOne(marketId, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      var sc=SC.find(function(x){return x.id==='under';});
      var oi=sc.idx; sc.idx=[];
      G=genMarket('under');
      sc.idx=oi;
      G.stations.forEach(function(st){st.isPlayer=false;});
      G.ps=[];
      if(targetYear>1970){
        var steps=0;
        while(steps<maxSteps){
          if(G.year===targetYear&&G.period===1)break;
          if(G.year>targetYear||(G.year===targetYear&&G.period>1)) return {ok:false,err:'overshoot'};
          var ui=window._harnessPatchTimersAndUi();
          try{ advTurn(); }finally{ ui.restore(); }
          steps++;
        }
        if(G.year!==targetYear||G.period!==1) return {ok:false,err:'miss'};
      }
      var m=measureBook(G);
      m.ok=true;
      m.gYear=G.year;
      m.gPeriod=G.period;
      return m;
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { runOne: runOne };
})();
`;

function aggregateRows(okRows) {
  const pick = (fn) => median(okRows.map(fn));
  const rate = (fn) => okRows.filter(fn).length / okRows.length;
  return {
    n: okRows.length,
    top3Share: pick((r) => r.top3Share),
    top5Share: pick((r) => r.top5Share),
    commercialFm: pick((r) => r.commercialFm),
    fmAdoption: pick((r) => r.fmAdoption),
    rockShare: mean(okRows.map((r) => r.rockShare)),
    rockPresenceRate: rate((r) => r.rockPresent),
    formatDiversity: pick((r) => r.formatDiversity),
    stationCount: pick((r) => r.stationCount),
    hhi: pick((r) => r.hhi),
    zombie: pick((r) => r.zombie),
    nicheSurvival: pick((r) => r.nicheSurvival),
    spiralSnapshots: pick((r) => r.spiralSnapshots),
    meanStationOq: pick((r) => r.meanStationOq),
    removedCumulative: pick((r) => r.removedCumulative),
  };
}

function parseArgsMain() {
  return parseArgs(process.argv.slice(2));
}

function main() {
  const opts = parseArgsMain();
  const t0 = Date.now();
  const results = { anchorVariants: {}, megaBaseline: {}, meta: { runs: opts.runs, seed: opts.seed } };

  for (const anchor of ANCHOR_VARIANTS) {
    console.log(`\n=== Anchor 1975 count: ${anchor} ===`);
    const ctx = loadCtx(anchor);
    const api = vm.runInContext(RUN_IIFE, ctx);
    const origR = Math.random;
    results.anchorVariants[anchor] = {};

    for (const marketId of LARGE_MARKETS) {
      const opening = [];
      const byYear = {};
      for (const y of SNAPSHOT_YEARS) byYear[y] = [];

      for (let run = 0; run < opts.runs; run++) {
        const s0 = opts.seed + anchor * 1000 + marketSalt(marketId) * 17 + run * 9973;
        let r0;
        try {
          r0 = api.runOne(marketId, 1970, s0, 0);
        } finally {
          Math.random = origR;
        }
        opening.push(r0);

        for (const y of SNAPSHOT_YEARS) {
          const sy = opts.seed + anchor * 1000 + marketSalt(marketId) * 17 + y * 10007 + run * 9973;
          let ry;
          try {
            ry = api.runOne(marketId, y, sy, MAX_STEPS[y] ?? 320);
          } finally {
            Math.random = origR;
          }
          byYear[y].push(ry);
        }
      }

      const okOpen = opening.filter((r) => r.ok);
      const agg = {
        opening: aggregateRows(okOpen),
        snapshots: {},
      };
      for (const y of SNAPSHOT_YEARS) {
        agg.snapshots[y] = aggregateRows(byYear[y].filter((r) => r.ok));
      }
      results.anchorVariants[anchor][marketId] = agg;
      const o = agg.opening;
      console.log(
        `  ${marketId}: stations=${o.stationCount} top3=${pct(o.top3Share)} FM=${o.commercialFm} rock%=${pct(o.rockPresenceRate, 0)} div=${o.formatDiversity?.toFixed(2)}`,
      );
    }
  }

  console.log('\n=== Mega reference (production anchors, 1970 open + 2000) ===');
  const megaCtx = loadCtx(10);
  const megaApi = vm.runInContext(RUN_IIFE, megaCtx);
  const origR2 = Math.random;
  for (const marketId of DEV_BENCHMARK_MEGA_MARKET_IDS) {
    const opening = [];
    const y2000 = [];
    for (let run = 0; run < opts.runs; run++) {
      const s0 = opts.seed + marketSalt(marketId) * 17 + run * 9973;
      try {
        opening.push(megaApi.runOne(marketId, 1970, s0, 0));
        y2000.push(megaApi.runOne(marketId, 2000, opts.seed + marketSalt(marketId) * 17 + 20000 + run * 9973, 340));
      } finally {
        Math.random = origR2;
      }
    }
    results.megaBaseline[marketId] = {
      opening: aggregateRows(opening.filter((r) => r.ok)),
      snapshots: { 2000: aggregateRows(y2000.filter((r) => r.ok)) },
    };
  }

  const megaOpenMed = {
    top3: median(DEV_BENCHMARK_MEGA_MARKET_IDS.map((id) => results.megaBaseline[id].opening.top3Share)),
    top5: median(DEV_BENCHMARK_MEGA_MARKET_IDS.map((id) => results.megaBaseline[id].opening.top5Share)),
    fmAdoption: median(DEV_BENCHMARK_MEGA_MARKET_IDS.map((id) => results.megaBaseline[id].opening.fmAdoption)),
    rockPresence: mean(DEV_BENCHMARK_MEGA_MARKET_IDS.map((id) => results.megaBaseline[id].opening.rockPresenceRate)),
  };

  function largeClusterAt(anchor, field, snapYear = null) {
    const vals = LARGE_MARKETS.map((id) => {
      const node = results.anchorVariants[anchor][id];
      return snapYear ? node.snapshots[snapYear]?.[field] : node.opening[field];
    });
    return { median: median(vals), spread: Math.max(...vals) - Math.min(...vals) };
  }

  const answers = {};
  const a18open = results.anchorVariants[18];
  const b10open = results.anchorVariants[10];

  answers.q1_rock_fm_from_anchor =
    b10open.seattle.opening.rockPresenceRate === 0 &&
    a18open.seattle.opening.rockPresenceRate > 0.5;

  answers.q2_concentration_vs_mega =
    a18open.sanfrancisco.opening.top3Share < megaOpenMed.top3 + 0.05;

  const sf18 = a18open.sanfrancisco.opening;
  const sf10 = b10open.sanfrancisco.opening;
  answers.q3_sf_still_wrong_at_18 = {
    rockStillLow: sf18.rockPresenceRate < 0.85,
    fmStillLow: sf18.fmAdoption < megaOpenMed.fmAdoption - 0.15,
    vsSeattle: Math.abs(sf18.top3Share - a18open.seattle.opening.top3Share) < 0.04,
  };

  answers.q4_sf_gap_at_18 = {
    rockPresence: sf18.rockPresenceRate,
    fmAdoption: sf18.fmAdoption,
    diversity: sf18.formatDiversity,
    megaRockPresence: megaOpenMed.rockPresence,
    deltaTop3VsMega: sf18.top3Share - megaOpenMed.top3,
  };

  const improvements = [];
  for (const anchor of [14, 16, 18]) {
    const cl = largeClusterAt(anchor, 'rockPresenceRate');
    const conc = largeClusterAt(anchor, 'top3Share');
    const fm = largeClusterAt(anchor, 'fmAdoption');
    const score =
      (cl.median ?? 0) * 2 +
      (fm.median ?? 0) +
      Math.max(0, 0.65 - (conc.median ?? 1));
    improvements.push({ anchor, score, rockPresence: cl.median, top3: conc.median, fm: fm.median });
  }
  improvements.sort((a, b) => b.score - a.score);
  answers.q5_best_anchor = improvements[0];

  let recommendation = 'A';
  const best = improvements[0];
  if (best.anchor >= 16 && best.rockPresence >= 0.9 && best.top3 <= 0.5) recommendation = 'A';
  else if (best.rockPresence >= 0.85 && best.fm < 0.35) recommendation = 'B';
  else if (answers.q3_sf_still_wrong_at_18.vsSeattle && answers.q3_sf_still_wrong_at_18.rockStillLow)
    recommendation = 'C';
  else recommendation = 'D';

  results.analysis = { megaOpenMed, answers, improvements, recommendation };

  const lines = [];
  lines.push('# Large-market 1970 scaffold A/B (diagnostic)');
  lines.push('');
  lines.push(`Runs/market/variant: ${opts.runs} · seed ${opts.seed}`);
  lines.push('Patch: `LARGE_MARKET_TOTAL_STATIONS_ANCHORS[1975]` only — mega anchors unchanged.');
  lines.push('');

  lines.push('## Opening book (1970) by anchor variant');
  lines.push('');
  lines.push('| Anchor | Market | Stations | Top-3 | Top-5 | Comm FM | FM adopt | Rock present | Rock share | Diversity |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const anchor of ANCHOR_VARIANTS) {
    for (const mid of LARGE_MARKETS) {
      const o = results.anchorVariants[anchor][mid].opening;
      lines.push(
        `| ${anchor} | ${mid} | ${o.stationCount} | ${pct(o.top3Share)} | ${pct(o.top5Share)} | ${o.commercialFm} | ${pct(o.fmAdoption)} | ${pct(o.rockPresenceRate, 0)} | ${pct(o.rockShare)} | ${o.formatDiversity?.toFixed(2)} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Mega reference (production scaffold)');
  lines.push('');
  lines.push(`| Market | Stations | Top-3 | Top-5 | FM adopt | Rock present |`);
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const id of DEV_BENCHMARK_MEGA_MARKET_IDS) {
    const o = results.megaBaseline[id].opening;
    lines.push(`| ${id} | ${o.stationCount} | ${pct(o.top3Share)} | ${pct(o.top5Share)} | ${pct(o.fmAdoption)} | ${pct(o.rockPresenceRate, 0)} |`);
  }
  lines.push(`| **Mega median** | — | ${pct(megaOpenMed.top3)} | ${pct(megaOpenMed.top5)} | ${pct(megaOpenMed.fmAdoption)} | ${pct(megaOpenMed.rockPresence * 100, 0)} |`);

  lines.push('');
  lines.push('## Long-run snapshots (median across markets)');
  lines.push('');
  for (const y of SNAPSHOT_YEARS) {
    lines.push(`### ${y}`);
    lines.push('| Anchor | Top-3 μ | Top-5 μ | FM adopt μ | Rock present μ | HHI μ | Zombie μ | Spiral μ | Removed μ | OQ μ |');
    lines.push('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const anchor of ANCHOR_VARIANTS) {
      const t3 = largeClusterAt(anchor, 'top3Share', y).median;
      const t5 = largeClusterAt(anchor, 'top5Share', y).median;
      const fm = largeClusterAt(anchor, 'fmAdoption', y).median;
      const rock = largeClusterAt(anchor, 'rockPresenceRate', y).median;
      const hhi = largeClusterAt(anchor, 'hhi', y).median;
      const z = largeClusterAt(anchor, 'zombie', y).median;
      const sp = largeClusterAt(anchor, 'spiralSnapshots', y).median;
      const rem = largeClusterAt(anchor, 'removedCumulative', y).median;
      const oq = largeClusterAt(anchor, 'meanStationOq', y).median;
      lines.push(
        `| ${anchor} | ${pct(t3)} | ${pct(t5)} | ${pct(fm)} | ${pct(rock, 0)} | ${hhi?.toFixed(0)} | ${z} | ${sp} | ${rem} | ${oq?.toFixed(1)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Cluster cohesion (Seattle ≈ Atlanta ≈ SF?)');
  lines.push('');
  for (const anchor of ANCHOR_VARIANTS) {
    const sp = largeClusterAt(anchor, 'top3Share').spread;
    const rk = largeClusterAt(anchor, 'rockPresenceRate').spread;
    lines.push(`- Anchor **${anchor}**: top-3 spread ${pct(sp)} · rock-presence spread ${pct(rk, 0)}`);
  }

  lines.push('');
  lines.push('## Answers');
  lines.push('');
  lines.push(`1. **Rock/FM from anchor alone?** ${answers.q1_rock_fm_from_anchor ? 'Mostly yes at anchor≥14' : 'Weak — anchor bump alone insufficient'}`);
  lines.push(`2. **Concentration → mega at anchor 18?** SF top-3 ${pct(sf18.top3Share)} vs mega med ${pct(megaOpenMed.top3)} — ${answers.q2_concentration_vs_mega ? 'yes' : 'partial/no'}`);
  lines.push(`3. **SF still wrong at 18?** rock present ${pct(sf18.rockPresenceRate, 0)}, FM ${pct(sf18.fmAdoption)}, still tracks Seattle (${answers.q3_sf_still_wrong_at_18.vsSeattle})`);
  lines.push(`4. **SF gap at 18:** ${JSON.stringify(answers.q4_sf_gap_at_18)}`);
  lines.push(`5. **Best anchor tradeoff:** ${JSON.stringify(answers.q5_best_anchor)}`);
  lines.push('');
  lines.push(`## Recommendation hierarchy: **${recommendation}**`);
  lines.push('');
  const recText = {
    A: 'Fix **large-market 1970 station anchor** (and keep tier interpolation) — ecology gaps are shared scaffold, not SF-only.',
    B: 'Scaffold fix plus review **FM slot allocation / deferral** in tier gen — FM adoption lags even after anchor bump.',
    C: 'After scaffold/FM work, **SF-specific patch** still needed (coastal_secular vs west_fm_fragmented divergence).',
    D: 'Mixed — see per-metric table; may need blueprint/ecology layer beyond anchor count.',
  };
  lines.push(recText[recommendation] || '');

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  results.recordedAt = new Date().toISOString();
  results.timingMs = Date.now() - t0;
  writeFileSync(outJson, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(outMd, `${lines.join('\n')}\n`);

  console.log('\n' + lines.slice(lines.indexOf('## Answers')).join('\n'));
  console.log(`\nWrote ${outJson}`);
  console.log(`Wall time: ${(results.timingMs / 1000).toFixed(1)}s`);
}

main();
