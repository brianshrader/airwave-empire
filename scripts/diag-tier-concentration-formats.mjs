#!/usr/bin/env node
/**
 * Upper-tier market concentration — format mix + HHI (read-only diagnostic).
 * Same cold-start harness as diag-share-concentration.mjs: genMarketMP(era) → advTurn to target book.
 *
 * Default: mega/large focus markets, years 1995–2020, Spring (period 1), 20 runs/cell, era 1985.
 *
 *   node scripts/diag-tier-concentration-formats.mjs
 *   npm run diag:tier-concentration-formats
 *
 * CSV: tmp/tier_market_format_concentration.csv
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outCsv = path.join(root, 'tmp', 'tier_market_format_concentration.csv');

const DEFAULT_MARKETS = ['newyork', 'losangeles', 'chicago', 'sanfrancisco', 'seattle'];
const DEFAULT_YEARS = [1995, 2000, 2006, 2010, 2020];

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
    seed: 20260515,
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

function escCsv(s) {
  const t = String(s ?? '');
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
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
    function fmtKey(fmt){
      return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
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
    function chrLaneShare(s){
      var raw=String(s.format||'');
      var sh=Number(s.rat&&s.rat.share)||0;
      if(raw==='RHYTHMIC'||raw==='HOT_AC'||raw==='CHR')return sh;
      if(fmtKey(s.format)==='TOP40')return sh;
      return 0;
    }
    function acHotAcShare(s){
      var raw=String(s.format||'');
      var sh=Number(s.rat&&s.rat.share)||0;
      if(raw==='ADULT_CONTEMP'||raw==='HOT_AC')return sh;
      return 0;
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
      var fmtSum={};
      var chr=0, acHot=0, ctry=0, talk=0;
      var hhi=0;
      for(var j=0;j<book.length;j++){
        var st=book[j];
        var sh=Number(st.rat&&st.rat.share)||0;
        hhi+=sh*sh;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        chr+=chrLaneShare(st);
        acHot+=acHotAcShare(st);
        if(String(st.format)==='COUNTRY')ctry+=sh;
        var rf=String(st.format||'');
        if(rf==='NEWS_TALK'||rf==='SPORTS_TALK'||rf==='PERSONALITY_TALK'||rf==='ALL_NEWS')talk+=sh;
      }
      var lead=book[0]||null;
      var sh1=lead?Number(lead.rat.share)||0:0;
      var sh2=book.length>1?Number(book[1].rat.share)||0:0;
      var sh5=book.length>4?Number(book[4].rat.share)||0:0;
      return {
        ok:true,
        steps:steps,
        nBook:book.length,
        fmtSum:fmtSum,
        chrTotal:chr,
        acHotAc:acHot,
        country:ctry,
        newsTalk:talk,
        hhi_x10000:hhi*10000,
        gap12:sh1-sh2,
        gap15:sh1-sh5,
        leaderFmtRaw:lead?String(lead.format):'',
        leaderFmtKey:lead?fmtKey(lead.format):'',
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
              fmtSum:r.fmtSum,
              chrTotal:r.chrTotal,
              acHotAc:r.acHotAc,
              country:r.country,
              newsTalk:r.newsTalk,
              hhi_x10000:r.hhi_x10000,
              gap12:r.gap12,
              gap15:r.gap15,
              leaderFmtRaw:r.leaderFmtRaw,
              leaderFmtKey:r.leaderFmtKey,
              nBook:r.nBook,
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
      throw new Error(`All ${rows.length} samples failed — check maxSteps or era`);
    }
  }

  const okRows = rows.filter((r) => r.ok);

  const CSV_HEADER = [
    'genEra',
    'marketId',
    'year',
    'period',
    'nRuns',
    'mean_hhi_x10000',
    'mean_gap12',
    'mean_gap15',
    'mean_chr_total_share',
    'mean_ac_hotac_share',
    'mean_country_share',
    'mean_news_talk_share',
    'mean_nBook',
    'top10_formats_by_mean_share',
    'num1_format_key_histogram',
    'num1_format_raw_histogram',
  ].join(',');

  const csvLines = [CSV_HEADER];
  const summary = [
    'Tier format concentration (cold genMarketMP → Spring book)',
    `genEra=${opts.era} maxSteps=${opts.maxSteps} runs/cell=${opts.runs} seed=${opts.seed}`,
    'CHR lane = TOP40 (canonical) + CHR + RHYTHMIC + HOT_AC station formats.',
    'AC/Hot AC = ADULT_CONTEMP + HOT_AC (HOT_AC overlaps CHR lane total).',
    'News/Talk = NEWS_TALK + SPORTS_TALK + PERSONALITY_TALK + ALL_NEWS.',
    'Format sums use canonicalHitsFormatKey (fmtSum / #1 key); raw histogram uses station.format.',
    'HHI = sum(share^2)*10000 over all book stations (share decimal 0–1).',
    '',
  ];

  for (const mid of opts.markets) {
    for (const y of opts.years) {
      const list = okRows.filter((r) => r.marketId === mid && r.year === y);
      if (!list.length) continue;
      const n = list.length;
      const hhis = list.map((r) => r.hhi_x10000);
      const gap12s = list.map((r) => r.gap12);
      const gap15s = list.map((r) => r.gap15);
      const chrs = list.map((r) => r.chrTotal);
      const acs = list.map((r) => r.acHotAc);
      const cts = list.map((r) => r.country);
      const nts = list.map((r) => r.newsTalk);
      const nbs = list.map((r) => r.nBook);

      const fmtMeans = new Map();
      for (const r of list) {
        const o = r.fmtSum || {};
        for (const k of Object.keys(o)) {
          if (!fmtMeans.has(k)) fmtMeans.set(k, []);
          fmtMeans.get(k).push(o[k]);
        }
      }
      const fmtAgg = [];
      for (const [k, arr] of fmtMeans) {
        fmtAgg.push({ k, m: mean(arr) });
      }
      fmtAgg.sort((a, b) => b.m - a.m);
      const top10 = fmtAgg.slice(0, 10);
      const top10Str = top10.map((x) => `${x.k}:${x.m.toFixed(4)}`).join('|');

      const histKey = {};
      const histRaw = {};
      for (const r of list) {
        const k = r.leaderFmtKey || '?';
        const raw = r.leaderFmtRaw || '?';
        histKey[k] = (histKey[k] || 0) + 1;
        histRaw[raw] = (histRaw[raw] || 0) + 1;
      }
      const histKeyStr = Object.keys(histKey)
        .sort((a, b) => histKey[b] - histKey[a])
        .map((k) => `${k}:${histKey[k]}`)
        .join('|');
      const histRawStr = Object.keys(histRaw)
        .sort((a, b) => histRaw[b] - histRaw[a])
        .map((k) => `${k}:${histRaw[k]}`)
        .join('|');

      const row = {
        genEra: opts.era,
        marketId: mid,
        year: y,
        period: opts.period,
        nRuns: n,
        mean_hhi_x10000: mean(hhis),
        mean_gap12: mean(gap12s),
        mean_gap15: mean(gap15s),
        mean_chr_total_share: mean(chrs),
        mean_ac_hotac_share: mean(acs),
        mean_country_share: mean(cts),
        mean_news_talk_share: mean(nts),
        mean_nBook: mean(nbs),
        top10_formats_by_mean_share: top10Str,
        num1_format_key_histogram: histKeyStr,
        num1_format_raw_histogram: histRawStr,
      };

      csvLines.push(
        [
          row.genEra,
          row.marketId,
          row.year,
          row.period,
          row.nRuns,
          row.mean_hhi_x10000.toFixed(2),
          row.mean_gap12.toFixed(4),
          row.mean_gap15.toFixed(4),
          row.mean_chr_total_share.toFixed(4),
          row.mean_ac_hotac_share.toFixed(4),
          row.mean_country_share.toFixed(4),
          row.mean_news_talk_share.toFixed(4),
          row.mean_nBook.toFixed(2),
          escCsv(row.top10_formats_by_mean_share),
          escCsv(row.num1_format_key_histogram),
          escCsv(row.num1_format_raw_histogram),
        ].join(',')
      );

      summary.push(
        `${mid} ${y}: HHI≈${row.mean_hhi_x10000.toFixed(0)} gap1-2=${(row.mean_gap12 * 100).toFixed(2)}pp chr=${(row.mean_chr_total_share * 100).toFixed(1)}% ac+hot=${(row.mean_ac_hotac_share * 100).toFixed(1)}% ctry=${(row.mean_country_share * 100).toFixed(1)}% talk=${(row.mean_news_talk_share * 100).toFixed(1)}% | #1 keys ${histKeyStr}`
      );
    }
  }

  mkdirSync(path.dirname(outCsv), { recursive: true });
  writeFileSync(outCsv, csvLines.join('\n') + '\n', 'utf8');
  console.log(summary.join('\n'));
  console.log(`\nWrote ${outCsv} (${csvLines.length - 1} rows)`);
  if (bad.length) console.log(`\nNote: ${bad.length} failed samples (excluded from aggregates)`);
}

main();
