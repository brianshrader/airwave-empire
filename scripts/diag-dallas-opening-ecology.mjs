#!/usr/bin/env node
/**
 * Dallas–Fort Worth opening ecology audit — multi-era book comparison.
 *
 *   node scripts/diag-dallas-opening-ecology.mjs
 *   node scripts/diag-dallas-opening-ecology.mjs --runs=60 --years=1970,1985,2000,2020
 *
 * Artifacts: tmp/dallas_opening_ecology.json, tmp/dallas_opening_ecology.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  aggregateFmtSumToFamilyShares,
  loadFormatFamiliesCatalog,
} from './formatFamilyHelpers.mjs';
import {
  aggregateMeansToLeadershipBuckets,
} from './expectedFormatLeadershipProfile.mjs';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS, DIAG_ONLY_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'dallas_opening_ecology.json');
const outMd = path.join(root, 'tmp', 'dallas_opening_ecology.md');

const FOCUS_MARKET = 'dallas';
const COMPARE_MARKETS = ['atlanta', 'chicago', 'sanfrancisco', 'nashville'];
const AUDIT_MARKETS = [FOCUS_MARKET, ...COMPARE_MARKETS];

const DEFAULT_RUNS = 60;
const DEFAULT_SEED = 20260605;
const DEFAULT_YEARS = [1970, 1985, 2000, 2020];

const ROCK_FMTS = ['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK', 'AAA', 'CLASSIC_HITS', 'OLDIES'];
const SPOKEN_FMTS = ['NEWS_TALK', 'SPORTS_TALK', 'ALL_NEWS'];

const MAX_STEPS_BY_YEAR = {
  1970: 0,
  1975: 0,
  1985: 260,
  2000: 320,
  2020: 320,
};

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

function loadCtx() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  const src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED, years: [...DEFAULT_YEARS] };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(10, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--years=')) {
      o.years = a.slice(8).split(',').map((s) => parseInt(s.trim(), 10)).filter((y) => !Number.isNaN(y));
    }
  }
  return o;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const idx = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[idx] : (s[idx] + s[idx + 1]) / 2;
}

function pct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

const RUN_IIFE = `
(function(){
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
  function ecologyOne(marketId, year, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      if(year<=1975){
        var sc=SC.find(function(x){return x.id==='under';});
        var oi=sc.idx; sc.idx=[];
        G=genMarket('under');
        sc.idx=oi;
      } else {
        var sc2=SC.find(function(x){return x.id==='chrwar';});
        var oi2=sc2.idx; sc2.idx=[];
        G=genMarket('chrwar');
        sc2.idx=oi2;
      }
      G.stations.forEach(function(st){st.isPlayer=false;});
      G.ps=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===year&&G.period===1)break;
        if(G.year>year||(G.year===year&&G.period>1)) return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==year||G.period!==1) return {ok:false,err:'miss'};
      var book=sortBook(G.stations);
      var fmtSum={}, fmtPresent={};
      var commercialAm=0, commercialFm=0;
      for(var k=0;k<G.stations.length;k++){
        var st=G.stations[k];
        if(!st||st._bpSlotDeferred) continue;
        var sig=st.sig||{};
        var pub=isPublicFmt(st.format);
        if(sig.type==='AM'){ if(!pub) commercialAm++; }
        else if(sig.type==='FM'){ if(!pub) commercialFm++; }
      }
      var topShares=[], hhi=0;
      for(var j=0;j<book.length;j++){
        var sh=book[j].rat.share||0;
        topShares.push(sh);
        hhi+=sh*sh;
        var fk=fmtKey(book[j].format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        fmtPresent[fk]=true;
      }
      var top3=0, top5=0;
      for(var t=0;t<Math.min(3,topShares.length);t++) top3+=topShares[t];
      for(var u=0;u<Math.min(5,topShares.length);u++) top5+=topShares[u];
      var rockShare=0, rockPresent=false;
      var rockKeys=['ALBUM_ROCK','CLASSIC_ROCK','ALT_ROCK','AAA','CLASSIC_HITS','OLDIES'];
      for(var r=0;r<rockKeys.length;r++){
        var rk=rockKeys[r];
        if(fmtPresent[rk]) rockPresent=true;
        rockShare+=(fmtSum[rk]||0);
      }
      var countryShare=(fmtSum.COUNTRY||0);
      var spanishShare=(fmtSum.SPANISH||0);
      var spokenShare=0;
      var spokenKeys=['NEWS_TALK','SPORTS_TALK','ALL_NEWS'];
      for(var sp=0;sp<spokenKeys.length;sp++) spokenShare+=(fmtSum[spokenKeys[sp]]||0);
      var fmTotal=commercialAm+commercialFm;
      return {
        ok:true,
        gYear:G.year,
        fmtSum:fmtSum,
        top3Share:top3,
        top5Share:top5,
        rockShare:rockShare,
        rockPresent:rockPresent,
        countryShare:countryShare,
        spanishShare:spanishShare,
        spokenShare:spokenShare,
        commercialAm:commercialAm,
        commercialFm:commercialFm,
        fmAdoption: fmTotal>0 ? commercialFm/fmTotal : 0,
        stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length,
        hhi:hhi*10000,
        leaderFmt: book[0]?fmtKey(book[0].format):'',
        leaderShare: book[0]?(book[0].rat.share||0):0,
        hasBpPatch: !!(MARKET_BP_PATCH&&MARKET_BP_PATCH[marketId]&&Object.keys(MARKET_BP_PATCH[marketId]).length)
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { ecologyOne: ecologyOne };
})();
`;

function aggregateRuns(okRows) {
  return {
    nRuns: okRows.length,
    top3ShareMedian: median(okRows.map((r) => r.top3Share)),
    top5ShareMedian: median(okRows.map((r) => r.top5Share)),
    fmAdoptionMedian: median(okRows.map((r) => r.fmAdoption)),
    rockMeanShare: mean(okRows.map((r) => r.rockShare)),
    countryMeanShare: mean(okRows.map((r) => r.countryShare)),
    spanishMeanShare: mean(okRows.map((r) => r.spanishShare)),
    spokenMeanShare: mean(okRows.map((r) => r.spokenShare)),
    hhiMedian: median(okRows.map((r) => r.hhi)),
    stationCountMedian: median(okRows.map((r) => r.stationCount)),
    commercialAmMedian: median(okRows.map((r) => r.commercialAm)),
    commercialFmMedian: median(okRows.map((r) => r.commercialFm)),
    leaderFmtMode: mode(okRows.map((r) => r.leaderFmt)),
    leaderShareMedian: median(okRows.map((r) => r.leaderShare)),
    hasBpPatch: okRows[0]?.hasBpPatch ?? false,
    meanFmtSum: meanFmtSum(okRows),
  };
}

function mode(arr) {
  const c = {};
  for (const x of arr) c[x] = (c[x] || 0) + 1;
  let best = '';
  let n = 0;
  for (const [k, v] of Object.entries(c)) {
    if (v > n) { n = v; best = k; }
  }
  return best;
}

function meanFmtSum(rows) {
  const acc = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.fmtSum || {})) {
      acc[k] = (acc[k] || 0) + v;
    }
  }
  const n = rows.length || 1;
  for (const k of Object.keys(acc)) acc[k] /= n;
  return acc;
}

function peerMedian(byMarketYear, marketIds, year, pick) {
  const vals = marketIds.map((id) => pick(byMarketYear[id]?.[year])).filter((v) => v != null && !Number.isNaN(v));
  return median(vals);
}

function distinctivenessScore(dallas, peers, year) {
  const metrics = [
    ['top3ShareMedian', 0.03],
    ['fmAdoptionMedian', 0.04],
    ['countryMeanShare', 0.025],
    ['spanishMeanShare', 0.025],
    ['spokenMeanShare', 0.025],
    ['rockMeanShare', 0.025],
    ['hhiMedian', 50],
  ];
  let score = 0;
  const notes = [];
  const d = dallas[year];
  if (!d) return { score: 0, notes: ['no data'] };

  for (const [key, threshold] of metrics) {
    const dVal = d[key];
    const peerVals = peers.map((p) => p[year]?.[key]).filter((v) => v != null);
    if (dVal == null || !peerVals.length) continue;
    const closest = peerVals.reduce((best, v) => {
      const dist = Math.abs(dVal - v);
      return dist < best.dist ? { dist, v } : best;
    }, { dist: Infinity, v: null });
    if (closest.dist < threshold) {
      notes.push(`${key}: Dallas ${key.includes('hhi') ? dVal.toFixed(0) : pct(dVal)} within ${key.includes('hhi') ? closest.dist.toFixed(0) : pct(closest.dist)} of nearest peer`);
      score += 1;
    }
  }
  return { score, notes };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const ctx = loadCtx();
  const MARKETS = vm.runInContext('typeof MARKETS!=="undefined"?MARKETS:{}', ctx);
  const api = vm.runInContext(RUN_IIFE, ctx);
  const origR = Math.random;

  const byMarketYear = {};

  for (const marketId of AUDIT_MARKETS) {
    byMarketYear[marketId] = {};
    for (const year of opts.years) {
      const maxSteps = MAX_STEPS_BY_YEAR[year] ?? 320;
      const rows = [];
      for (let run = 0; run < opts.runs; run++) {
        const s0 = opts.seed + marketSalt(marketId) * 17 + year * 10007 + run * 9973;
        try {
          rows.push(api.ecologyOne(marketId, year, s0, maxSteps));
        } catch (e) {
          rows.push({ ok: false, err: String(e?.message || e) });
        } finally {
          Math.random = origR;
        }
      }
      const okRows = rows.filter((r) => r.ok);
      byMarketYear[marketId][year] = {
        label: MARKETS[marketId]?.label || marketId,
        rankTier: MARKETS[marketId]?.rankTier || '?',
        archetypeId: MARKETS[marketId]?.archetypeId || '?',
        failCount: rows.length - okRows.length,
        ...aggregateRuns(okRows),
      };
    }
  }

  const dallas = byMarketYear[FOCUS_MARKET];
  const peers = COMPARE_MARKETS.map((id) => byMarketYear[id]);

  const eraComparisons = {};
  for (const year of opts.years) {
    eraComparisons[year] = {
      dallas: dallas[year],
      peerMedians: {
        top3Share: peerMedian(byMarketYear, COMPARE_MARKETS, year, (m) => m?.top3ShareMedian),
        top5Share: peerMedian(byMarketYear, COMPARE_MARKETS, year, (m) => m?.top5ShareMedian),
        fmAdoption: peerMedian(byMarketYear, COMPARE_MARKETS, year, (m) => m?.fmAdoptionMedian),
        rockShare: peerMedian(byMarketYear, COMPARE_MARKETS, year, (m) => m?.rockMeanShare),
        countryShare: peerMedian(byMarketYear, COMPARE_MARKETS, year, (m) => m?.countryMeanShare),
        spanishShare: peerMedian(byMarketYear, COMPARE_MARKETS, year, (m) => m?.spanishMeanShare),
        spokenShare: peerMedian(byMarketYear, COMPARE_MARKETS, year, (m) => m?.spokenMeanShare),
        hhi: peerMedian(byMarketYear, COMPARE_MARKETS, year, (m) => m?.hhiMedian),
        stationCount: peerMedian(byMarketYear, COMPARE_MARKETS, year, (m) => m?.stationCountMedian),
      },
      vsAtlanta: byMarketYear.atlanta?.[year],
      vsNashville: byMarketYear.nashville?.[year],
      vsChicago: byMarketYear.chicago?.[year],
      vsSanFrancisco: byMarketYear.sanfrancisco?.[year],
      distinctiveness: distinctivenessScore(dallas, peers, year),
    };
  }

  const lines = [];
  lines.push('# Dallas–Fort Worth Opening Ecology Audit');
  lines.push('');
  lines.push(`Recorded: ${new Date().toISOString()} · ${opts.runs} runs/market · seed ${opts.seed}`);
  lines.push(`Years: ${opts.years.join(', ')} · Focus: **${MARKETS.dallas?.label || 'Dallas'}** (\`texas_sunbelt\`)`);
  lines.push('');
  lines.push('## Market blueprint (scaffold)');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| rankTier | ${MARKETS.dallas?.rankTier} |`);
  lines.push(`| revScale | ${MARKETS.dallas?.revScale} |`);
  lines.push(`| archetypeId | \`${MARKETS.dallas?.archetypeId}\` |`);
  lines.push(`| hispPop1970/2000/2020 | ${pct(MARKETS.dallas?.hispPop1970)} / ${pct(MARKETS.dallas?.hispPop2000)} / ${pct(MARKETS.dallas?.hispPop2020)} |`);
  lines.push(`| countryBonus | ${MARKETS.dallas?.countryBonus} |`);
  lines.push(`| culture.country | ${MARKETS.dallas?.culture?.country} |`);
  lines.push(`| AM freqs | ${(MARKETS.dallas?.amFreqs || []).length} |`);
  lines.push(`| FM freqs | ${(MARKETS.dallas?.fmFreqs || []).length} |`);
  lines.push(`| MARKET_BP_PATCH | ${dallas[opts.years[0]]?.hasBpPatch ? 'yes' : 'no'} |`);
  lines.push('');
  lines.push('### New archetype traits (`texas_sunbelt`)');
  lines.push('');
  lines.push('- **sunbelt_growth** — matches sunbelt ecology regex (fragmentation, tier scaling)');
  lines.push('- **country_heritage** — elevated `countryBonus` + ecology `+0.08` countryStrength');
  lines.push('- **conservative_talk_strength** — high `newsTalk` culture + `spokenWordAmResilience` + ecology `+0.05` spokenWord');
  lines.push('- **spanish_growth** — Hispanic trajectory 7%→21%→29%; `culture.spanish` 0.14');
  lines.push('- **commercial_radio_culture** — gospel/black music trimmed vs Atlanta; AM heritage holdouts');
  lines.push('');

  for (const year of opts.years) {
    const ec = eraComparisons[year];
    const d = ec.dallas;
    const pm = ec.peerMedians;
    lines.push(`## ${year} book ecology`);
    lines.push('');
    lines.push('| Metric | Dallas | Peer median | Atlanta | Nashville | Chicago | SF |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    lines.push(`| Top-3 share | ${pct(d.top3ShareMedian)} | ${pct(pm.top3Share)} | ${pct(ec.vsAtlanta?.top3ShareMedian)} | ${pct(ec.vsNashville?.top3ShareMedian)} | ${pct(ec.vsChicago?.top3ShareMedian)} | ${pct(ec.vsSanFrancisco?.top3ShareMedian)} |`);
    lines.push(`| Top-5 share | ${pct(d.top5ShareMedian)} | ${pct(pm.top5Share)} | ${pct(ec.vsAtlanta?.top5ShareMedian)} | ${pct(ec.vsNashville?.top5ShareMedian)} | ${pct(ec.vsChicago?.top5ShareMedian)} | ${pct(ec.vsSanFrancisco?.top5ShareMedian)} |`);
    lines.push(`| FM adoption | ${pct(d.fmAdoptionMedian)} | ${pct(pm.fmAdoption)} | ${pct(ec.vsAtlanta?.fmAdoptionMedian)} | ${pct(ec.vsNashville?.fmAdoptionMedian)} | ${pct(ec.vsChicago?.fmAdoptionMedian)} | ${pct(ec.vsSanFrancisco?.fmAdoptionMedian)} |`);
    lines.push(`| Station count | ${d.stationCountMedian ?? '—'} | ${pm.stationCount ?? '—'} | ${ec.vsAtlanta?.stationCountMedian ?? '—'} | ${ec.vsNashville?.stationCountMedian ?? '—'} | ${ec.vsChicago?.stationCountMedian ?? '—'} | ${ec.vsSanFrancisco?.stationCountMedian ?? '—'} |`);
    lines.push(`| Rock share | ${pct(d.rockMeanShare)} | ${pct(pm.rockShare)} | ${pct(ec.vsAtlanta?.rockMeanShare)} | ${pct(ec.vsNashville?.rockMeanShare)} | ${pct(ec.vsChicago?.rockMeanShare)} | ${pct(ec.vsSanFrancisco?.rockMeanShare)} |`);
    lines.push(`| Country share | ${pct(d.countryMeanShare)} | ${pct(pm.countryShare)} | ${pct(ec.vsAtlanta?.countryMeanShare)} | ${pct(ec.vsNashville?.countryMeanShare)} | ${pct(ec.vsChicago?.countryMeanShare)} | ${pct(ec.vsSanFrancisco?.countryMeanShare)} |`);
    lines.push(`| Spanish share | ${pct(d.spanishMeanShare)} | ${pct(pm.spanishShare)} | ${pct(ec.vsAtlanta?.spanishMeanShare)} | ${pct(ec.vsNashville?.spanishMeanShare)} | ${pct(ec.vsChicago?.spanishMeanShare)} | ${pct(ec.vsSanFrancisco?.spanishMeanShare)} |`);
    lines.push(`| Spoken-word share | ${pct(d.spokenMeanShare)} | ${pct(pm.spokenShare)} | ${pct(ec.vsAtlanta?.spokenMeanShare)} | ${pct(ec.vsNashville?.spokenMeanShare)} | ${pct(ec.vsChicago?.spokenMeanShare)} | ${pct(ec.vsSanFrancisco?.spokenMeanShare)} |`);
    lines.push(`| HHI | ${d.hhiMedian?.toFixed(0) ?? '—'} | ${pm.hhi?.toFixed(0) ?? '—'} | ${ec.vsAtlanta?.hhiMedian?.toFixed(0) ?? '—'} | ${ec.vsNashville?.hhiMedian?.toFixed(0) ?? '—'} | ${ec.vsChicago?.hhiMedian?.toFixed(0) ?? '—'} | ${ec.vsSanFrancisco?.hhiMedian?.toFixed(0) ?? '—'} |`);
    lines.push(`| Typical #1 | ${d.leaderFmtMode} (${pct(d.leaderShareMedian)}) | — | ${ec.vsAtlanta?.leaderFmtMode} | ${ec.vsNashville?.leaderFmtMode} | ${ec.vsChicago?.leaderFmtMode} | ${ec.vsSanFrancisco?.leaderFmtMode} |`);
    lines.push('');
    if (ec.distinctiveness.notes.length) {
      lines.push('**Near-peer flags:**');
      for (const n of ec.distinctiveness.notes) lines.push(`- ${n}`);
      lines.push('');
    }
  }

  lines.push('## Recommendation summary');
  lines.push('');
  const totalDistinct = opts.years.reduce((s, y) => s + (eraComparisons[y].distinctiveness.score || 0), 0);
  if (totalDistinct === 0) {
    lines.push('Dallas shows **clear separation** from comparison peers on headline ecology metrics across audited years.');
  } else if (totalDistinct <= 4) {
    lines.push(`Dallas shows **moderate differentiation** (${totalDistinct} near-peer flags). Archetype scaffold is working; monitor Spanish launch timing before playable merge.`);
  } else {
    lines.push(`Dallas may still read **too close to peers** (${totalDistinct} near-peer flags). Consider ecology row tuning or era-specific launches only if certification confirms gaps.`);
  }
  lines.push('');
  lines.push('No global balance changes or Dallas-specific BP patches applied in this scaffold phase.');

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const artifact = {
    recordedAt: new Date().toISOString(),
    config: { runs: opts.runs, seed: opts.seed, years: opts.years, focus: FOCUS_MARKET, compare: COMPARE_MARKETS },
    marketBlueprint: MARKETS.dallas,
    archetypeTraits: ['sunbelt_growth', 'country_heritage', 'conservative_talk_strength', 'spanish_growth', 'commercial_radio_culture'],
    byMarketYear,
    eraComparisons,
    timingMs: Date.now() - t0,
  };
  writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(outMd, `${lines.join('\n')}\n`);

  console.log(lines.join('\n'));
  console.log(`\nWrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
