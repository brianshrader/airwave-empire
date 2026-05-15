#!/usr/bin/env node
/**
 * Share concentration audit — cold starts only (genMarketMP(era) → advTurn to target book).
 * Read-only: does not change legacy rules; reports distributions vs thresholds.
 *
 *   npm run diag:share-concentration
 *   node scripts/diag-share-concentration.mjs --era=1970
 *   node scripts/diag-share-concentration.mjs --runs=24 --period=1 --era=1985
 *   node scripts/diag-share-concentration.mjs --markets=sanfrancisco,seattle --years=2006,2010
 *
 * genMarketMP era keys (legacy.js): 1970 → under, 1978 → fmrev, 1985 → chrwar.
 *
 * CSV: tmp/share_concentration_audit.csv
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outCsv = path.join(root, 'tmp', 'share_concentration_audit.csv');

const DEFAULT_MARKETS = [
  'sanfrancisco',
  'seattle',
  'losangeles',
  'newyork',
  'chicago',
  'atlanta',
  'nashville',
  'wichita',
];
const DEFAULT_YEARS = [1995, 2000, 2006, 2010, 2020, 2026];

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
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
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() {
      return null;
    },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    getAttribute() {
      return null;
    },
    setAttribute() {},
  };
}

const documentStub = {
  body: {
    innerHTML: '',
    appendChild() {},
    contains() {
      return false;
    },
  },
  head: { appendChild() {} },
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
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() {
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class {
      constructor() {}
    },
    FileReader: class {
      readAsText() {}
    },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) {
          typedArray[i] = Math.floor(Math.random() * 256);
        }
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
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

function parseCsvList(s, fallback) {
  if (!s || !String(s).trim()) return fallback.slice();
  return String(s)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const VALID_GEN_ERAS = ['1970', '1978', '1985'];
const DEFAULT_MAX_STEPS_BY_ERA = { '1970': 340, '1978': 300, '1985': 240 };

function parseArgs(argv) {
  let maxStepsExplicit = false;
  const o = {
    markets: DEFAULT_MARKETS,
    years: DEFAULT_YEARS,
    period: 1,
    runs: 20,
    seed: 20260513,
    maxSteps: null,
    era: '1985',
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) o.markets = parseCsvList(a.slice('--markets='.length), DEFAULT_MARKETS);
    else if (a.startsWith('--years=')) o.years = parseCsvList(a.slice('--years='.length), DEFAULT_YEARS).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
    else if (a.startsWith('--period=')) o.period = parseInt(a.slice('--period='.length), 10) || 1;
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice('--runs='.length), 10) || 20);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice('--seed='.length), 10) || o.seed;
    else if (a.startsWith('--maxSteps=')) {
      maxStepsExplicit = true;
      o.maxSteps = Math.max(40, parseInt(a.slice('--maxSteps='.length), 10) || 240);
    } else if (a.startsWith('--era=')) {
      o.era = String(a.slice('--era='.length)).trim();
    }
  }
  const e = String(o.era || '').trim();
  if (!VALID_GEN_ERAS.includes(e)) {
    throw new Error(`--era must be one of ${VALID_GEN_ERAS.join(', ')} (got ${JSON.stringify(o.era)})`);
  }
  o.era = e;
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
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function medianSorted(sortedAsc) {
  const n = sortedAsc.length;
  if (!n) return null;
  const m = Math.floor(n / 2);
  return n % 2 ? sortedAsc[m] : (sortedAsc[m - 1] + sortedAsc[m]) / 2;
}

function percentileSorted(sortedAsc, p) {
  const n = sortedAsc.length;
  if (!n) return null;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sortedAsc[idx];
}

function sortNum(xs) {
  return xs.slice().sort((a, b) => a - b);
}

function escCsv(s) {
  const t = String(s ?? '');
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = createVmContext();
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);

  const salts = {};
  for (const m of opts.markets) salts[m] = marketSalt(m);

  const innerFixed = `
  (function(){
    var SALTS = ${JSON.stringify(salts)};
    var GEN_ERA = ${JSON.stringify(opts.era)};
    function eligibleBookStations(G){
      return (G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
      });
    }
    function commercialBookStations(G){
      return (G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&!s.isPublic&&s.rat&&typeof s.rat.share==='number';
      });
    }
    function sortBook(stations){
      var list=stations.slice();
      for (var i=0;i<list.length;i++){
        if(typeof sanitizeStationShareForRanking==='function')sanitizeStationShareForRanking(list[i]);
      }
      list.sort(function(a,b){
        var sa=a.rat&&a.rat.share||0,sb=b.rat&&b.rat.share||0;
        if(Math.abs(sb-sa)>1e-9)return sb-sa;
        return String(a.id).localeCompare(String(b.id));
      });
      return list;
    }
    function isChrFmt(fmt){
      var f=typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):fmt;
      return f==='TOP40'||fmt==='RHYTHMIC'||fmt==='HOT_AC'||fmt==='CHR';
    }
    function leaderKind(s){
      if(!s)return 'unknown';
      if(stationIsNoncommercialInstitutional(s)){
        if(s.isPublic)return 'public';
        if(s.isReligiousNetwork||s.format==='RELIGIOUS_NETWORK')return 'religious-network';
        return 'institutional';
      }
      return 'commercial';
    }
    function sumTopShares(book,n){
      var t=0;
      for(var i=0;i<n&&i<book.length;i++)t+=book[i].rat.share||0;
      return t;
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
          return {ok:false,err:'overshoot',atYear:G.year,atPeriod:G.period,steps:steps};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==targetPeriod)
        return {ok:false,err:'miss',atYear:G.year,atPeriod:G.period,steps:steps};
      var book=sortBook(eligibleBookStations(G));
      var lead=book[0]||null;
      var sh1=lead?Number(lead.rat.share)||0:0;
      var sh2=book.length>1?Number(book[1].rat.share)||0:0;
      var pubSum=0, instSum=0;
      for(var j=0;j<book.length;j++){
        var st=book[j];
        if(st.isPublic)pubSum+=Number(st.rat.share)||0;
        if(stationIsNoncommercialInstitutional(st))instSum+=Number(st.rat.share)||0;
      }
      return {
        ok:true,
        steps:steps,
        nBook:book.length,
        nComm:commercialBookStations(G).length,
        share1:sh1,
        share2:sh2,
        top3:sumTopShares(book,3),
        top5:sumTopShares(book,5),
        top10:sumTopShares(book,10),
        sharePublic:pubSum,
        shareInstitutional:instSum,
        leadFormat:lead?String(lead.format):'',
        leadKind:leaderKind(lead),
        isChrLead:!!(lead&&isChrFmt(lead.format)),
      };
    }
    return function runAll(markets,years,targetPeriod,numRuns,baseSeed,maxSteps){
      var rows=[];
      var mi,yi,run,salt,s0,r,origR;
      origR=Math.random;
      for(mi=0;mi<markets.length;mi++){
        var mid=markets[mi];
        salt=SALTS[mid]||0;
        for(yi=0;yi<years.length;yi++){
          var y=years[yi];
          for(run=0;run<numRuns;run++){
            s0=baseSeed+salt*17+y*10007+run*9973;
            (function(seedVal){
              var s=seedVal;
              Math.random=function(){
                s=(s*9301+49297)%233280;
                return s/233280;
              };
            })(s0);
            try{
              r=sampleOneRun(mid,y,targetPeriod,maxSteps);
            }catch(e){
              r={ok:false,err:String(e&&e.message||e)};
            }finally{
              Math.random=origR;
            }
            rows.push({
              marketId:mid,
              year:y,
              period:targetPeriod,
              run:run,
              ok:r.ok,
              err:r.err||'',
              steps:r.steps|0,
              nBook:r.nBook,
              nComm:r.nComm,
              share1:r.share1,
              share2:r.share2,
              top3:r.top3,
              top5:r.top5,
              top10:r.top10,
              sharePublic:r.sharePublic,
              shareInstitutional:r.shareInstitutional,
              leadFormat:r.leadFormat,
              leadKind:r.leadKind,
              isChrLead:r.isChrLead,
            });
          }
        }
      }
      return rows;
    };
  })();
  `;

  const runAll = vm.runInContext(innerFixed, ctx);
  const rows = runAll(opts.markets, opts.years, opts.period, opts.runs, opts.seed, opts.maxSteps);

  const bad = rows.filter((r) => !r.ok);
  if (bad.length) {
    console.error('Sample failures (first 8):', bad.slice(0, 8));
    if (bad.length === rows.length) {
      throw new Error(`All ${rows.length} samples failed — check maxSteps or era (genMarketMP ${opts.era})`);
    }
  }

  const okRows = rows.filter((r) => r.ok);
  const key = (m, y) => `${m}\t${y}\t${opts.era}`;
  const buckets = new Map();
  for (const r of okRows) {
    const k = key(r.marketId, r.year);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }

  const CSV_HEADER = [
    'genEra',
    'marketId',
    'year',
    'period',
    'nRuns',
    'share1_mean',
    'share1_median',
    'share1_p90',
    'share1_max',
    'share2_mean',
    'top3_mean',
    'top5_mean',
    'top10_mean',
    'nBook_mean',
    'nComm_mean',
    'sharePublic_mean',
    'shareInst_mean',
    'pct_share1_gt_0.10',
    'pct_share1_gt_0.12',
    'pct_top5_gt_0.40',
    'pct_top10_gt_0.65',
    'chr_lead_pct',
    'chr_lead_mean_share1',
    'histo_lead_format',
    'histo_lead_kind',
  ].join(',');

  const csvLines = [CSV_HEADER];
  const aggregateRows = [];
  const summaryLines = [
    `Share concentration audit (cold genMarketMP(${opts.era}) → target book; maxSteps=${opts.maxSteps})`,
    `period=${opts.period === 1 ? 'Spring (1)' : 'Fall (2)'} · runs/market/year=${opts.runs} · seed=${opts.seed}`,
    'Book = all non-deferred stations with rat.share; rank by share (legacy sanitize + tie-break id).',
    'CHR lane = TOP40|CHR|RHYTHMIC|HOT_AC (canonicalHitsFormatKey).',
    'Scope: not GM career — each row is an independent cold start.',
    '',
  ];

  for (const mid of opts.markets) {
    for (const y of opts.years) {
      const list = buckets.get(key(mid, y)) || [];
      if (!list.length) continue;
      const s1 = sortNum(list.map((r) => r.share1));
      const s2 = list.map((r) => r.share2);
      const t3 = list.map((r) => r.top3);
      const t5 = list.map((r) => r.top5);
      const t10 = list.map((r) => r.top10);
      const nb = list.map((r) => r.nBook);
      const nc = list.map((r) => r.nComm);
      const sp = list.map((r) => r.sharePublic);
      const si = list.map((r) => r.shareInstitutional);
      const n = list.length;
      const pct = (pred) => list.filter(pred).length / n;
      const chrRuns = list.filter((r) => r.isChrLead);
      const chrPct = chrRuns.length / n;
      const chrMean1 = chrRuns.length ? mean(chrRuns.map((r) => r.share1)) : null;

      const fmtHist = {};
      const kindHist = {};
      for (const r of list) {
        const f = r.leadFormat || '?';
        fmtHist[f] = (fmtHist[f] || 0) + 1;
        const k = r.leadKind || '?';
        kindHist[k] = (kindHist[k] || 0) + 1;
      }
      const histFmt = Object.keys(fmtHist)
        .sort((a, b) => fmtHist[b] - fmtHist[a])
        .map((k) => `${k}:${fmtHist[k]}`)
        .join('|');
      const histKind = Object.keys(kindHist)
        .sort((a, b) => kindHist[b] - kindHist[a])
        .map((k) => `${k}:${kindHist[k]}`)
        .join('|');

      const row = {
        genEra: opts.era,
        marketId: mid,
        year: y,
        period: opts.period,
        nRuns: n,
        share1_mean: mean(s1),
        share1_median: medianSorted(s1),
        share1_p90: percentileSorted(s1, 0.9),
        share1_max: s1[s1.length - 1],
        share2_mean: mean(s2),
        top3_mean: mean(t3),
        top5_mean: mean(t5),
        top10_mean: mean(t10),
        nBook_mean: mean(nb),
        nComm_mean: mean(nc),
        sharePublic_mean: mean(sp),
        shareInst_mean: mean(si),
        pct_gt10: pct((r) => r.share1 > 0.1),
        pct_gt12: pct((r) => r.share1 > 0.12),
        pct_top5_gt40: pct((r) => r.top5 > 0.4),
        pct_top10_gt65: pct((r) => r.top10 > 0.65),
        chr_lead_pct: chrPct,
        chr_lead_mean_share1: chrMean1,
        histo_lead_format: histFmt,
        histo_lead_kind: histKind,
      };
      aggregateRows.push(row);

      csvLines.push(
        [
          row.genEra,
          row.marketId,
          row.year,
          row.period,
          row.nRuns,
          row.share1_mean.toFixed(4),
          row.share1_median.toFixed(4),
          row.share1_p90.toFixed(4),
          row.share1_max.toFixed(4),
          row.share2_mean.toFixed(4),
          row.top3_mean.toFixed(4),
          row.top5_mean.toFixed(4),
          row.top10_mean.toFixed(4),
          row.nBook_mean.toFixed(2),
          row.nComm_mean.toFixed(2),
          row.sharePublic_mean.toFixed(4),
          row.shareInst_mean.toFixed(4),
          row.pct_gt10.toFixed(3),
          row.pct_gt12.toFixed(3),
          row.pct_top5_gt40.toFixed(3),
          row.pct_top10_gt65.toFixed(3),
          row.chr_lead_pct.toFixed(3),
          row.chr_lead_mean_share1 == null ? '' : row.chr_lead_mean_share1.toFixed(4),
          escCsv(row.histo_lead_format),
          escCsv(row.histo_lead_kind),
        ].join(',')
      );

      summaryLines.push(
        `${mid} ${y} p${opts.period}: #1 mean=${(row.share1_mean * 100).toFixed(2)}% med=${(row.share1_median * 100).toFixed(2)}% p90=${(row.share1_p90 * 100).toFixed(2)}% max=${(row.share1_max * 100).toFixed(2)}% | top5=${(row.top5_mean * 100).toFixed(2)}% | nBook≈${row.nBook_mean.toFixed(1)} comm≈${row.nComm_mean.toFixed(1)} | pub=${(row.sharePublic_mean * 100).toFixed(2)}% inst=${(row.shareInst_mean * 100).toFixed(2)}% | >10%:${(row.pct_gt10 * 100).toFixed(0)}% >12%:${(row.pct_gt12 * 100).toFixed(0)}% | CHR lead ${(row.chr_lead_pct * 100).toFixed(0)}%`
      );
    }
  }

  mkdirSync(path.dirname(outCsv), { recursive: true });
  writeFileSync(outCsv, csvLines.join('\n') + '\n', 'utf8');

  console.log(summaryLines.join('\n'));
  console.log(`\nWrote ${outCsv} (${csvLines.length - 1} aggregate rows)`);
  if (bad.length) console.log(`\nNote: ${bad.length} failed samples (see stderr)`);

  /** Cross-cut: same calendar year, #1 mean share across markets. */
  for (const y of [2006, 2010]) {
    const slice = aggregateRows
      .filter((r) => r.year === y)
      .sort((a, b) => b.share1_mean - a.share1_mean);
    if (!slice.length) continue;
    console.log(`\n--- ${y} Spring: #1 mean share rank (high → low) ---`);
    slice.forEach((r, i) => {
      console.log(
        `  ${i + 1}. ${r.marketId}: #1=${(r.share1_mean * 100).toFixed(2)}% top5=${(r.top5_mean * 100).toFixed(2)}% nBook≈${r.nBook_mean.toFixed(1)} CHR-lead=${(r.chr_lead_pct * 100).toFixed(0)}%`
      );
    });
  }
}

main();
