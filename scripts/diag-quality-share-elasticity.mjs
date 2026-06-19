#!/usr/bin/env node
/**
 * Quality → share elasticity audit — diagnostic only (no production changes).
 *
 * Freezes 2026 spring books per market, compresses elite tail (OQ/slot quality above 94),
 * re-runs recalc only. Separates:
 *   Hypothesis A — too many elite stations (prevalence)
 *   Hypothesis B — steep appeal mapping (if compression barely moves shares)
 *
 *   node scripts/diag-quality-share-elasticity.mjs
 *   node scripts/diag-quality-share-elasticity.mjs --markets=phoenix,atlanta,newyork --runs=8
 *   node scripts/diag-quality-share-elasticity.mjs --quick
 *
 * Artifacts:
 *   tmp/quality_share_elasticity.json
 *   tmp/quality_share_elasticity.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'quality_share_elasticity.json');
const outMd = path.join(root, 'tmp', 'quality_share_elasticity.md');

const DEFAULT_MARKETS = ['phoenix', 'atlanta', 'newyork'];
const TARGET_YEAR = 2026;
const DEFAULT_RUNS = 8;
const DEFAULT_SEED = 20260620;
const MAX_STEPS = 340;
const ALL_VARIANTS = ['A', 'B', 'C', 'D'];

/** Fraction of OQ excess above 94 removed (0 = baseline). */
const VARIANT_COMPRESSION = {
  A: 0,
  B: 0.25,
  C: 0.5,
  D: 0.75,
};

const VARIANT_LABELS = {
  A: 'baseline (no compression)',
  B: 'elite tail compressed 25%',
  C: 'elite tail compressed 50%',
  D: 'elite tail compressed 75%',
};

const ELITE_FLOOR = 94;

function injectHeadlessLaunchNewsGuard(src) {
  return src
    .replace(
      'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    )
    .replace(
      'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    )
    .replace(
      'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
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
  vm.runInContext(injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8')), ctx, {
    filename: 'legacy.js',
    timeout: 360_000,
  });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

const RUN_IIFE = `
(function(){
  var ELITE_FLOOR=${ELITE_FLOOR};
  var VARIANT_COMPRESSION=${JSON.stringify(VARIANT_COMPRESSION)};

  function isCommercial(s){
    return s&&!s._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'&&!stationIsNoncommercialInstitutional(s);
  }

  function oqBucket(oq){
    var o=oq|0;
    if(o>=95)return 'gte95';
    if(o>=85)return 'b85_94';
    if(o>=75)return 'b75_84';
    if(o>=65)return 'b65_74';
    return 'lt65';
  }

  function sortBook(stations){
    var list=stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    return list;
  }

  function pctGte95Commercial(stations){
    var comm=stations.filter(isCommercial);
    if(!comm.length)return 0;
    var n=0;
    for(var i=0;i<comm.length;i++)if((comm[i].oq|0)>=95)n++;
    return n/comm.length;
  }

  function compressSlotQuality(q,compression){
    if(typeof q!=='number'||!Number.isFinite(q))return q;
    if(q<=ELITE_FLOOR)return q;
    return Math.round(ELITE_FLOOR+(q-ELITE_FLOOR)*(1-compression));
  }

  function applyEliteCompression(stations,G,compression){
    if(!compression)return {slotsAdjusted:0};
    var slotsAdjusted=0;
    for(var i=0;i<stations.length;i++){
      var s=stations[i];
      if(!s||s._bpSlotDeferred||!isCommercial(s))continue;
      if(s.prog){
        var slots=Object.keys(s.prog);
        for(var j=0;j<slots.length;j++){
          var sd=s.prog[slots[j]];
          if(!sd||typeof sd.quality!=='number')continue;
          var nq=compressSlotQuality(sd.quality,compression);
          if(nq!==sd.quality){sd.quality=nq;slotsAdjusted++;}
        }
      }
      if(typeof refreshStationOQ==='function')refreshStationOQ(s,G);
      else if((s.oq|0)>ELITE_FLOOR)s.oq=compressSlotQuality(s.oq|0,compression);
    }
    return {slotsAdjusted:slotsAdjusted};
  }

  function bucketShares(stations){
    var buckets={
      gte95:{n:0,shareSum:0,shares:[]},
      b85_94:{n:0,shareSum:0,shares:[]},
      b75_84:{n:0,shareSum:0,shares:[]},
      b65_74:{n:0,shareSum:0,shares:[]},
      lt65:{n:0,shareSum:0,shares:[]}
    };
    var comm=stations.filter(isCommercial);
    for(var i=0;i<comm.length;i++){
      var s=comm[i];
      var sh=s.rat&&typeof s.rat.share==='number'?s.rat.share:0;
      var b=oqBucket(s.oq|0);
      buckets[b].n++;
      buckets[b].shareSum+=sh;
      buckets[b].shares.push(sh);
    }
    var out={};
    Object.keys(buckets).forEach(function(k){
      var row=buckets[k];
      out[k]={
        n:row.n,
        avgShare:row.n?row.shareSum/row.n:0,
        totalShare:row.shareSum,
        medianShare:row.shares.length?row.shares.slice().sort(function(a,b){return a-b;})[Math.floor(row.shares.length/2)]:0
      };
    });
    return out;
  }

  function concentration(book){
    var sh1=book.length?book[0].rat.share||0:0;
    var sh2=book.length>1?book[1].rat.share||0:0;
    var sh3=book.length>2?book[2].rat.share||0:0;
    var sh5=book.length>4?book[4].rat.share||0:0;
    var top3=sh1+sh2+(book.length>2?book[2].rat.share||0:0);
    var top5=0;
    for(var i=0;i<Math.min(5,book.length);i++)top5+=book[i].rat.share||0;
    var hhi=0;
    for(var j=0;j<book.length;j++){
      var sh=book[j].rat.share||0;
      hhi+=sh*sh;
    }
    return {
      share1:sh1,share2:sh2,share3:sh3,top3:top3,top5:top5,hhi:hhi*10000,
      margin12:sh1-sh2,
      margin23:sh2-sh3,
      margin35:sh3-sh5,
      active:book.length
    };
  }

  function simToTargetYear(marketId,targetYear,seedVal){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    var sc=SC.find(function(x){return x.id==='chrwar';});
    var oi=sc.idx; sc.idx=[];
    G=genMarket('chrwar');
    sc.idx=oi;
    G.stations.forEach(function(st){st.isPlayer=false;});
    G.ps=[];
    var steps=0;
    while(steps<${MAX_STEPS}){
      if(G.year===targetYear&&G.period===1)break;
      if(G.year>targetYear||(G.year===targetYear&&G.period>1))return {ok:false,err:'overshoot',atYear:G.year};
      var ui=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui.restore();}
      steps++;
    }
    if(G.year!==targetYear||G.period!==1)return {ok:false,err:'miss',atYear:G.year,atPeriod:G.period};
    return {ok:true,steps:steps,frozenStations:JSON.parse(JSON.stringify(G.stations))};
  }

  function runVariantsOnFrozen(frozenStations,marketId,targetYear,variants){
    var results=[];
    var baselinePct=null;
    for(var vi=0;vi<variants.length;vi++){
      var variant=variants[vi];
      var compression=VARIANT_COMPRESSION[variant]||0;
      var stations=JSON.parse(JSON.stringify(frozenStations));
      G.stations=stations;
      G.marketId=marketId;
      G.year=targetYear;
      G.period=1;
      var pctBefore=pctGte95Commercial(stations);
      if(variant==='A')baselinePct=pctBefore;
      var adj=applyEliteCompression(stations,G,compression);
      var pctAfter=pctGte95Commercial(stations);
      var meanOq=0,commN=0;
      stations.filter(isCommercial).forEach(function(st){
        meanOq+=(st.oq|0);commN++;
      });
      meanOq=commN?meanOq/commN:0;
      if(typeof recalc==='function')recalc(stations,G);
      if(typeof snapMarketRankBookDisplay==='function')snapMarketRankBookDisplay(G);
      var book=sortBook(stations);
      var conc=concentration(book);
      results.push(Object.assign({
        variant:variant,
        compression:compression,
        pctGte95Before:pctBefore,
        pctGte95After:pctAfter,
        meanOqCommercial:meanOq,
        commercialCount:commN,
        slotsAdjusted:adj.slotsAdjusted|0,
        oqBuckets:bucketShares(stations)
      },conc));
    }
    return {results:results,baselinePctGte95:baselinePct};
  }

  return function(config){
    var marketId=config.marketId;
    var targetYear=config.targetYear||${TARGET_YEAR};
    var seed=config.seed>>>0;
    var variants=config.variants||['A','B','C','D'];
    var sim=simToTargetYear(marketId,targetYear,seed);
    if(!sim.ok)return Object.assign({ok:false,marketId:marketId,seed:seed},sim);
    var pack=runVariantsOnFrozen(sim.frozenStations,marketId,targetYear,variants);
    return {
      ok:true,
      marketId:marketId,
      targetYear:targetYear,
      seed:seed,
      steps:sim.steps,
      baselinePctGte95:pack.baselinePctGte95,
      variants:pack.results
    };
  };
})();
`;

function parseCsvList(s, fallback) {
  if (!s || !String(s).trim()) return fallback.slice();
  return String(s)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const o = {
    markets: DEFAULT_MARKETS,
    runs: DEFAULT_RUNS,
    seed: DEFAULT_SEED,
    variants: ALL_VARIANTS,
    quick: false,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) o.markets = parseCsvList(a.slice(10), DEFAULT_MARKETS);
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--variants=')) {
      o.variants = parseCsvList(a.slice(11), ALL_VARIANTS).map((v) => v.toUpperCase());
    } else if (a === '--quick') o.quick = true;
  }
  if (o.quick) {
    o.runs = Math.min(o.runs, 4);
    o.markets = ['phoenix', 'atlanta'];
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

function pct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

function summarizeVariantRows(rows, variant) {
  const list = rows.filter((r) => r.variant === variant);
  if (!list.length) return null;
  const pick = (k) => mean(list.map((r) => r[k]));
  const buckets = ['gte95', 'b85_94', 'b75_84', 'b65_74', 'lt65'];
  const oqBuckets = {};
  for (const b of buckets) {
    oqBuckets[b] = {
      n: mean(list.map((r) => r.oqBuckets?.[b]?.n ?? 0)),
      avgShare: mean(list.map((r) => r.oqBuckets?.[b]?.avgShare ?? 0)),
    };
  }
  return {
    nRuns: list.length,
    share1: pick('share1'),
    share2: pick('share2'),
    top3: pick('top3'),
    top5: pick('top5'),
    hhi: pick('hhi'),
    margin12: pick('margin12'),
    margin23: pick('margin23'),
    margin35: pick('margin35'),
    pctGte95After: mean(list.map((r) => r.pctGte95After ?? 0)),
    meanOqCommercial: pick('meanOqCommercial'),
    oqBuckets,
  };
}

function deltaVsA(summaries, variant) {
  const a = summaries.A;
  const v = summaries[variant];
  if (!a || !v) return null;
  return {
    share1: v.share1 - a.share1,
    top3: v.top3 - a.top3,
    top5: v.top5 - a.top5,
    hhi: v.hhi - a.hhi,
    margin12: v.margin12 - a.margin12,
    pctGte95After: v.pctGte95After - a.pctGte95After,
  };
}

function synthesizeVerdict(marketSummaries) {
  const lines = [];
  for (const [mid, sums] of Object.entries(marketSummaries)) {
    const d = deltaVsA(sums, 'D');
    if (!d) continue;
    const sh1Drop = -(d.share1 || 0);
    if (sh1Drop >= 0.02) {
      lines.push(`${mid}: strong elasticity — #1 fell ~${pct(sh1Drop)} under D (prevalence likely matters).`);
    } else if (sh1Drop >= 0.008) {
      lines.push(`${mid}: moderate elasticity — #1 fell ~${pct(sh1Drop)} under D.`);
    } else {
      lines.push(`${mid}: flat elasticity — #1 Δ ${pct(d.share1, 2)} under D (steepness / recalc suspect).`);
    }
  }
  return lines;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Quality → Share Elasticity Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Markets: ${report.markets.join(', ')} | Year: ${report.targetYear} | Runs/market: ${report.runs}`);
  lines.push('');
  lines.push('## Variants');
  for (const v of report.variants) {
    lines.push(`- **${v}** — ${VARIANT_LABELS[v]}`);
  }
  lines.push('');
  lines.push('Compression: for commercial stations, slot quality and OQ excess above 94 scaled by `(1 − compression)`; then `recalc()` only.');
  lines.push('');

  for (const mid of report.markets) {
    const ms = report.summaries[mid];
    if (!ms) continue;
    lines.push(`### ${mid}`);
    lines.push('');
    lines.push('| Variant | OQ≥95% | #1 | top-3 | top-5 | HHI | #1−#2 |');
    lines.push('|---------|--------|-----|-------|-------|-----|--------|');
    for (const v of report.variants) {
      const s = ms[v];
      if (!s) continue;
      lines.push(
        `| ${v} | ${pct(s.pctGte95After)} | ${pct(s.share1)} | ${pct(s.top3)} | ${pct(s.top5)} | ${Math.round(s.hhi)} | ${pct(s.margin12)} |`,
      );
    }
    lines.push('');
    lines.push('**Share by OQ bucket (commercial, avg share)**');
    lines.push('');
    lines.push('| Variant | OQ 95+ | 85–94 | 75–84 | 65–74 | <65 |');
    lines.push('|---------|--------|-------|-------|-------|-----|');
    for (const v of report.variants) {
      const s = ms[v];
      if (!s) continue;
      const b = s.oqBuckets;
      lines.push(
        `| ${v} | ${pct(b.gte95?.avgShare)} (n≈${Math.round(b.gte95?.n || 0)}) | ${pct(b.b85_94?.avgShare)} | ${pct(b.b75_84?.avgShare)} | ${pct(b.b65_74?.avgShare)} | ${pct(b.lt65?.avgShare)} |`,
      );
    }
    lines.push('');
    const d = report.deltas[mid]?.D;
    if (d) {
      lines.push(`Δ vs A (D): #1 ${pct(d.share1, 2)}, top-3 ${pct(d.top3, 2)}, HHI ${d.hhi > 0 ? '+' : ''}${Math.round(d.hhi)}`);
      lines.push('');
    }
  }

  lines.push('## Interpretation');
  for (const ln of report.verdict) lines.push(`- ${ln}`);
  lines.push('');
  lines.push('If D barely moves concentration while OQ≥95% falls sharply → **Hypothesis B** (appeal steepness in `recalc`).');
  lines.push('If D moves concentration in proportion to elite compression → **Hypothesis A** (elite prevalence).');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  console.log('[quality-share-elasticity] loading VM…');
  const ctx = loadCtx();
  const runOne = vm.runInContext(RUN_IIFE, ctx);

  const raw = [];
  let failures = 0;

  for (const marketId of args.markets) {
    for (let run = 0; run < args.runs; run++) {
      const seed = (args.seed + marketSalt(marketId) * 17 + run * 9973) >>> 0;
      process.stdout.write(`  ${marketId} run ${run + 1}/${args.runs}…`);
      try {
        const r = runOne({
          marketId,
          targetYear: TARGET_YEAR,
          seed,
          variants: args.variants,
        });
        if (!r.ok) {
          failures++;
          raw.push({ marketId, run, seed, ok: false, err: r.err });
          console.log(` FAIL (${r.err})`);
        } else {
          for (const v of r.variants) {
            raw.push({ marketId, run, seed, ok: true, ...v });
          }
          console.log(` ok (#1 A=${pct(r.variants.find((x) => x.variant === 'A')?.share1)})`);
        }
      } catch (e) {
        failures++;
        raw.push({ marketId, run, seed, ok: false, err: String(e?.message || e) });
        console.log(` ERR ${e?.message || e}`);
      }
    }
  }

  const summaries = {};
  const deltas = {};
  for (const mid of args.markets) {
    const okRows = raw.filter((r) => r.ok && r.marketId === mid);
    summaries[mid] = {};
    for (const v of args.variants) {
      summaries[mid][v] = summarizeVariantRows(okRows, v);
    }
    deltas[mid] = {};
    for (const v of args.variants) {
      if (v === 'A') continue;
      deltas[mid][v] = deltaVsA(summaries[mid], v);
    }
  }

  const aggregate = {};
  for (const v of args.variants) {
    const rows = raw.filter((r) => r.ok && r.variant === v);
    aggregate[v] = summarizeVariantRows(rows, v);
  }
  const aggregateDelta = {};
  for (const v of args.variants) {
    if (v === 'A') continue;
    aggregateDelta[v] = deltaVsA(aggregate, v);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    markets: args.markets,
    targetYear: TARGET_YEAR,
    runs: args.runs,
    seed: args.seed,
    variants: args.variants,
    variantLabels: VARIANT_LABELS,
    compression: VARIANT_COMPRESSION,
    eliteFloor: ELITE_FLOOR,
    rawRowCount: raw.length,
    failureCount: failures,
    summaries,
    deltas,
    aggregate,
    aggregateDelta,
    verdict: synthesizeVerdict(summaries),
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outMd, `${buildMarkdown(report)}\n`);

  console.log(`\nWrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  if (aggregateDelta.D) {
    console.log(
      `Aggregate D vs A: Δ#1=${pct(aggregateDelta.D.share1, 2)} Δtop-3=${pct(aggregateDelta.D.top3, 2)} ΔHHI=${Math.round(aggregateDelta.D.hhi)}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
