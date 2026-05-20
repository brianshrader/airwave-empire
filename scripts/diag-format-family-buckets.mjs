#!/usr/bin/env node
/**
 * Format-family book-share diagnostics (read-only).
 * Rolls up simulated market books by formatFamilies.v1.json families.
 *
 *   npm run diag:format-family-buckets
 *   npm run diag:format-family-buckets -- --markets=wichita,newyork,phoenix,portland --years=1995,2026 --runs=4
 *
 * @see docs/FORMAT_FAMILY_ARCHITECTURE.md
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectFormatLifecycleIife } from './vmInjectFormatLifecycleIife.mjs';
import {
  aggregateFmtSumToFamilyShares,
  canonicalDisplayLabel,
  canonicalFormatId,
  familyForFormat,
  familyLabelForFormat,
  FAMILY_DISPLAY_ORDER,
  loadFormatFamiliesCatalog,
} from './formatFamilyHelpers.mjs';
import { aggregateMeansToLeadershipBuckets } from './expectedFormatLeadershipProfile.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS, DIAG_ONLY_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'format_family_buckets.json');

const DEFAULT_MARKETS = ['wichita', 'newyork', 'phoenix', 'portland'];
const DEFAULT_YEARS = [1995, 2026];
const VALID_GEN_ERAS = ['1970', '1978', '1985'];
const DEFAULT_MAX_STEPS_BY_ERA = { '1970': 340, '1978': 300, '1985': 240 };

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function loadLegacySrc() {
  let src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  return injectHeadlessMegaFragNewsGuard(src);
}

function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
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
  body: { innerHTML: '', classList: { toggle() {} }, appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  documentElement: { style: {}, dataset: {} },
  createElement() {
    return stubEl();
  },
  getElementById() {
    return stubEl();
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
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
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval: () => 0,
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    Blob: class {
      constructor() {}
    },
    FileReader: class {
      readAsText() {}
    },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
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
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray?.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = Math.floor(Math.random() * 256);
        return typedArray;
      },
    },
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function parseCsvList(s, fallback) {
  if (!s || !String(s).trim()) return fallback.slice();
  return String(s)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  let maxStepsExplicit = false;
  const o = {
    markets: DEFAULT_MARKETS,
    years: DEFAULT_YEARS,
    period: 1,
    runs: 4,
    seed: 20260518,
    maxSteps: null,
    era: '1985',
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) o.markets = parseCsvList(a.slice(10), DEFAULT_MARKETS);
    else if (a.startsWith('--years=')) {
      o.years = parseCsvList(a.slice(8), DEFAULT_YEARS)
        .map((x) => parseInt(x, 10))
        .filter((n) => !Number.isNaN(n));
    } else if (a.startsWith('--period=')) o.period = parseInt(a.slice(9), 10) || 1;
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || 4);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--maxSteps=')) {
      maxStepsExplicit = true;
      o.maxSteps = Math.max(40, parseInt(a.slice(11), 10) || 240);
    } else if (a.startsWith('--era=')) o.era = String(a.slice(6)).trim();
  }
  if (!VALID_GEN_ERAS.includes(o.era)) {
    throw new Error(`--era must be one of ${VALID_GEN_ERAS.join(', ')}`);
  }
  if (o.maxSteps == null || !maxStepsExplicit) {
    o.maxSteps = maxStepsExplicit ? o.maxSteps : DEFAULT_MAX_STEPS_BY_ERA[o.era] ?? 240;
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

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function assertDiagnosticMarkets(ctx, marketIds) {
  const MARKETS = vm.runInContext('typeof MARKETS !== "undefined" ? MARKETS : null', ctx);
  if (!MARKETS) throw new Error('MARKETS missing after legacy load');
  const playable = new Set(ALL_PLAYABLE_MARKET_IDS);
  const diagOnly = new Set(DIAG_ONLY_MARKET_IDS);
  for (const mid of marketIds) {
    if (!MARKETS[mid]) {
      throw new Error(`Unknown market "${mid}" — add MARKETS row or use a known id.`);
    }
    if (!playable.has(mid) && !diagOnly.has(mid)) {
      console.warn(`[diag] "${mid}" is not playable/diag-only — harness only.`);
    }
  }
}

function runSimulation(ctx, opts) {
  const salts = {};
  for (const m of opts.markets) salts[m] = marketSalt(m);

  const inner = `
  (function(){
    var SALTS = ${JSON.stringify(salts)};
    var GEN_ERA = ${JSON.stringify(opts.era)};
    function eligibleBookStations(G){
      return (G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
      });
    }
    function fmtKey(fmt){
      return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
    }
    function sortBook(stations){
      var list=stations.slice();
      if(typeof sanitizeStationShareForRanking==='function'){
        for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
      }
      list.sort(function(a,b){
        var sa=a.rat&&a.rat.share||0,sb=b.rat&&b.rat.share||0;
        if(Math.abs(sb-sa)>1e-9)return sb-sa;
        return String(a.id).localeCompare(String(b.id));
      });
      return list;
    }
    function isChrLineageFmt(fmt){
      var raw=String(fmt||'');
      if(raw==='RHYTHMIC'||raw==='HOT_AC'||raw==='CHR')return true;
      return fmtKey(fmt)==='TOP40';
    }
    function chrLaneShare(st){
      if(!isChrLineageFmt(st.format))return 0;
      return Number(st.rat&&st.rat.share)||0;
    }
    function sampleOneRun(marketId,targetYear,targetPeriod,maxSteps){
      ACTIVE_MARKET=marketId;
      syncMarketPopToMarket(marketId);
      G=genMarketMP(GEN_ERA);
      MP.mode='solo';
      MP.isHost=false;
      if(MP.players)MP.players=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===targetYear&&G.period===targetPeriod)break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>targetPeriod))
          return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==targetPeriod)return {ok:false,err:'miss'};
      var book=sortBook(eligibleBookStations(G));
      var fmtSum={};
      var chr=0;
      var top5=[];
      for(var j=0;j<book.length;j++){
        var st=book[j];
        var sh=Number(st.rat&&st.rat.share)||0;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        chr+=chrLaneShare(st);
      }
      for(var t=0;t<Math.min(5,book.length);t++){
        var b=book[t];
        top5.push({
          format:String(b.format),
          fmtKey:fmtKey(b.format),
          share:Number(b.rat&&b.rat.share)||0,
          callLetters:b.callLetters||'',
        });
      }
      var lead=book[0]||null;
      return {
        ok:true,
        fmtSum:fmtSum,
        chrLineageShare:chr,
        leaderFmtRaw:lead?String(lead.format):'',
        leaderFmtKey:lead?fmtKey(lead.format):'',
        leaderShare:lead?Number(lead.rat.share)||0:0,
        top5:top5,
        nBook:book.length,
      };
    }
    return function runAll(markets,years,targetPeriod,numRuns,baseSeed,maxSteps){
      var rows=[];
      var origR=Math.random;
      for(var mi=0;mi<markets.length;mi++){
        var mid=markets[mi];
        var salt=SALTS[mid]||0;
        for(var yi=0;yi<years.length;yi++){
          var y=years[yi];
          for(var run=0;run<numRuns;run++){
            var s0=baseSeed+salt*17+y*10007+run*9973;
            (function(seedVal){
              var s=seedVal;
              Math.random=function(){
                s=(s*9301+49297)%233280;
                return s/233280;
              };
            })(s0);
            var r;
            try{ r=sampleOneRun(mid,y,targetPeriod,maxSteps); }
            catch(e){ r={ok:false,err:String(e&&e.message||e)}; }
            finally{ Math.random=origR; }
            rows.push({marketId:mid,year:y,period:targetPeriod,run:run,result:r});
          }
        }
      }
      return rows;
    };
  })();
  `;

  return vm.runInContext(inner, ctx)(opts.markets, opts.years, opts.period, opts.runs, opts.seed, opts.maxSteps);
}

function histogram(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join('  ');
}

function summarizeCell(okRows, catalog, year) {
  const fmtAgg = {};
  const familyAgg = Object.fromEntries(FAMILY_DISPLAY_ORDER.map((f) => [f, 0]));
  const leaderFamHist = {};
  const unmappedAll = new Set();
  let chrMean = 0;

  for (const row of okRows) {
    const r = row.result;
    chrMean += r.chrLineageShare || 0;
    for (const [fmt, sh] of Object.entries(r.fmtSum || {})) {
      const k = canonicalFormatId(fmt, catalog);
      fmtAgg[k] = (fmtAgg[k] || 0) + (Number(sh) || 0);
    }
    const { familyShares, unmappedFormats } = aggregateFmtSumToFamilyShares(r.fmtSum, catalog);
    for (const fam of FAMILY_DISPLAY_ORDER) {
      familyAgg[fam] += familyShares[fam] || 0;
    }
    for (const u of unmappedFormats) unmappedAll.add(u);

    const leadFam = familyForFormat(r.leaderFmtRaw, catalog) || 'UNMAPPED';
    leaderFamHist[leadFam] = (leaderFamHist[leadFam] || 0) + 1;
  }

  const n = okRows.length;
  const fmtMean = Object.entries(fmtAgg)
    .map(([k, v]) => ({ k, m: v / n }))
    .sort((a, b) => b.m - a.m);
  const famMean = {};
  for (const fam of FAMILY_DISPLAY_ORDER) {
    famMean[fam] = (familyAgg[fam] || 0) / n;
  }

  const leadership = aggregateMeansToLeadershipBuckets(fmtMean);

  const topFormats = fmtMean.slice(0, 8).map((row) => {
    const fam = familyForFormat(row.k, catalog) || 'UNMAPPED';
    return {
      format: row.k,
      share: row.m,
      family: fam,
      familyLabel: familyLabelForFormat(row.k, catalog),
      displayLabel: canonicalDisplayLabel(row.k, year, catalog),
    };
  });

  const sampleLeader = okRows[Math.floor(okRows.length / 2)]?.result;

  return {
    runs: n,
    familySharesMean: famMean,
    chrLineageShareMean: chrMean / n,
    hitsFamilyShareMean: famMean.HITS || 0,
    hotAcInAdultNotHits: (fmtMean.find((x) => x.k === 'HOT_AC')?.m || 0),
    leaderFamilyHistogram: leaderFamHist,
    topFormats,
    leadershipBuckets: leadership.buckets,
    leadershipSerialized: leadership.serialized,
    unmappedFormats: [...unmappedAll],
    sampleLeader: sampleLeader
      ? {
          format: sampleLeader.leaderFmtKey,
          share: sampleLeader.leaderShare,
          family: familyForFormat(sampleLeader.leaderFmtRaw, catalog),
        }
      : null,
  };
}

function printReport(summaries, catalog, opts) {
  console.log('Format family buckets — diagnostic only (not gameplay book targets)');
  console.log(`Catalog: data/formatFamilies.v1.json (v${catalog.version})`);
  console.log(`Markets: ${opts.markets.join(', ')} | Years: ${opts.years.join(', ')} | Runs/cell: ${opts.runs} | Gen era: ${opts.era}`);
  console.log('');

  for (const block of summaries) {
    const { marketId, year, summary, failCount } = block;
    const mktLabel = marketId;
    console.log(`=== ${mktLabel} @ ${year} (${summary.runs} ok runs, ${failCount} failed) ===`);

    if (!summary.runs) {
      console.log('  (no successful runs)\n');
      continue;
    }

    const famLine = FAMILY_DISPLAY_ORDER.filter((f) => (summary.familySharesMean[f] || 0) > 0.001)
      .map((f) => `${f} ${pct(summary.familySharesMean[f])}`)
      .join(' | ');
    console.log(`  Book share by family (mean): ${famLine || '(none)'}`);

    console.log(`  #1 station family (histogram): ${histogram(summary.leaderFamilyHistogram)}`);

    if (summary.unmappedFormats.length) {
      console.log(`  Unmapped format IDs: ${summary.unmappedFormats.join(', ')}`);
    }

    console.log('  Top formats (mean share):');
    for (const t of summary.topFormats) {
      console.log(
        `    ${t.format} ${pct(t.share)} — ${t.family} (${t.familyLabel}) · display: ${t.displayLabel}`,
      );
    }

    console.log(`  Legacy CHR-lineage share (TOP40+CHR+RHYTHMIC+HOT_AC gameplay): ${pct(summary.chrLineageShareMean)}`);
    console.log(`  Taxonomy HITS family share (excludes HOT_AC → ADULT): ${pct(summary.hitsFamilyShareMean)}`);
    if (summary.hotAcInAdultNotHits > 0.01) {
      console.log(
        `  Note: HOT_AC mean ${pct(summary.hotAcInAdultNotHits)} is in ADULT family but counts toward CHR-lineage gameplay bucket.`,
      );
    }

    console.log(`  Leadership buckets (format-level QA): ${summary.leadershipSerialized}`);
    const lb = summary.leadershipBuckets;
    const famSpoken = (summary.familySharesMean.SPOKEN || 0) + (summary.familySharesMean.PUBLIC || 0);
    const lbTalk = (lb.NEWS_TALK_SPORTS || 0) + (lb.PUBLIC_RADIO || 0);
    if (Math.abs(famSpoken - lbTalk) > 0.12) {
      console.log(
        `  Compare: SPOKEN+PUBLIC families ${pct(famSpoken)} vs NEWS_TALK_SPORTS+PUBLIC_RADIO buckets ${pct(lbTalk)}`,
      );
    }

    console.log('');
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const catalog = loadFormatFamiliesCatalog();

  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  assertDiagnosticMarkets(ctx, opts.markets);

  const rawRows = runSimulation(ctx, opts);
  const summaries = [];
  const allUnmapped = new Set();

  for (const mid of opts.markets) {
    for (const y of opts.years) {
      const cell = rawRows.filter((r) => r.marketId === mid && r.year === y);
      const ok = cell.filter((r) => r.result?.ok);
      const failCount = cell.length - ok.length;
      const summary = summarizeCell(ok, catalog, y);
      for (const u of summary.unmappedFormats) allUnmapped.add(u);
      summaries.push({ marketId: mid, year: y, summary, failCount });
    }
  }

  printReport(summaries, catalog, opts);

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        opts,
        catalogVersion: catalog.version,
        summaries,
        allUnmappedFormats: [...allUnmapped],
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${outJson}`);

  if (allUnmapped.size) {
    console.warn(`\nUnmapped formats across run: ${[...allUnmapped].join(', ')}`);
    process.exitCode = 1;
  }
}

main();
