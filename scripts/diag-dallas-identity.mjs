#!/usr/bin/env node
/**
 * Dallas–Fort Worth identity + competitive ecology audit.
 *
 *   node scripts/diag-dallas-identity.mjs
 *   node scripts/diag-dallas-identity.mjs --runs=50 --years=1970,1985,2000,2020
 *
 * Artifacts: tmp/dallas_identity_audit.json, tmp/dallas_identity_audit.md
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
} from './formatFamilyHelpers.mjs';
import {
  aggregateMeansToLeadershipBuckets,
  LEADERSHIP_BUCKET_KEYS,
} from './expectedFormatLeadershipProfile.mjs';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'dallas_identity_audit.json');
const outMd = path.join(root, 'tmp', 'dallas_identity_audit.md');

const FOCUS_MARKET = 'dallas';
const IDENTITY_COMPARE = ['atlanta', 'nashville', 'chicago'];
const AUDIT_MARKETS = [FOCUS_MARKET, ...IDENTITY_COMPARE];

const DEFAULT_RUNS = 50;
const DEFAULT_SEED = 20260605;
const DEFAULT_YEARS = [1970, 1985, 2000, 2020];
const PROXIMITY_PP = 0.03;

const MAX_STEPS_BY_YEAR = {
  1970: 0,
  1985: 260,
  2000: 320,
  2020: 320,
};

const IDENTITY_METRICS = [
  { key: 'countryShare', label: 'Country share' },
  { key: 'spanishShare', label: 'Spanish share' },
  { key: 'spokenShare', label: 'Spoken-word share' },
  { key: 'rockShare', label: 'Rock share' },
  { key: 'chrShare', label: 'CHR share' },
  { key: 'fmAdoption', label: 'FM adoption' },
  { key: 'top3Share', label: 'Top-3 concentration' },
  { key: 'hhi', label: 'HHI' },
  { key: 'formatDiversity', label: 'Format diversity (≥2%)' },
];

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
    disabled: false, textContent: '', innerHTML: '', value: '', style: {}, dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {}, querySelector() { return null; }, focus() {}, click() {},
    addEventListener() {}, removeEventListener() {}, getAttribute() { return null; }, setAttribute() {},
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
    globalThis: null, window: null, document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; }, clearTimeout() {}, clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {}, fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} }, FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      },
    },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error,
    Map, Set, Symbol, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite,
    Infinity, NaN, undefined, Int8Array, Uint8Array, Buffer, Promise,
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
  function identityOne(marketId, year, seedVal, maxSteps){
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
      var fmtSum={}, hhi=0;
      var commercialAm=0, commercialFm=0;
      var viableCompetitors=0, acquisitionTargets=0;
      for(var k=0;k<G.stations.length;k++){
        var st=G.stations[k];
        if(!st||st._bpSlotDeferred) continue;
        var sig=st.sig||{};
        var pub=isPublicFmt(st.format);
        if(sig.type==='AM'){ if(!pub) commercialAm++; }
        else if(sig.type==='FM'){ if(!pub) commercialFm++; }
      }
      for(var j=0;j<book.length;j++){
        var sh=book[j].rat.share||0;
        var fk=fmtKey(book[j].format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        hhi+=sh*sh;
        if(sh>=0.03) viableCompetitors++;
        if(sh>=0.02&&sh<=0.12&&!book[j].isPlayer) acquisitionTargets++;
      }
      var top3=0;
      for(var t=0;t<Math.min(3,book.length);t++) top3+=(book[t].rat.share||0);
      var formatDiversity=0;
      for(var fk2 in fmtSum){ if(fmtSum[fk2]>=0.02) formatDiversity++; }
      var fmTotal=commercialAm+commercialFm;
      var countryShare=(fmtSum.COUNTRY||0);
      var spanishShare=(fmtSum.SPANISH||0);
      var spokenShare=(fmtSum.NEWS_TALK||0)+(fmtSum.SPORTS_TALK||0)+(fmtSum.ALL_NEWS||0);
      var rockShare=0;
      var rockKeys=['ALBUM_ROCK','CLASSIC_ROCK','ALT_ROCK','AAA','CLASSIC_HITS','OLDIES'];
      for(var r=0;r<rockKeys.length;r++) rockShare+=(fmtSum[rockKeys[r]]||0);
      var chrShare=(fmtSum.TOP40||0)+(fmtSum.HOT_AC||0)+(fmtSum.RHYTHMIC||0);
      var clusterCount=0;
      var fam={};
      for(var fk3 in fmtSum){
        var fsh=fmtSum[fk3];
        if(fsh<0.08) continue;
        var famKey=fk3;
        if(['TOP40','HOT_AC','RHYTHMIC'].indexOf(fk3)>=0) famKey='CHR';
        else if(['NEWS_TALK','SPORTS_TALK','ALL_NEWS'].indexOf(fk3)>=0) famKey='SPOKEN';
        else if(rockKeys.indexOf(fk3)>=0) famKey='ROCK';
        fam[famKey]=(fam[famKey]||0)+fsh;
      }
      for(var ck in fam){ if(fam[ck]>=0.10) clusterCount++; }
      return {
        ok:true,
        fmtSum:fmtSum,
        top3Share:top3,
        hhi:hhi*10000,
        fmAdoption: fmTotal>0 ? commercialFm/fmTotal : 0,
        countryShare:countryShare,
        spanishShare:spanishShare,
        spokenShare:spokenShare,
        rockShare:rockShare,
        chrShare:chrShare,
        formatDiversity:formatDiversity,
        viableCompetitors:viableCompetitors,
        acquisitionTargets:acquisitionTargets,
        clusterCount:clusterCount,
        leaderShare: book[0]?(book[0].rat.share||0):0,
        stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length,
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { identityOne: identityOne };
})();
`;

function aggregateRuns(okRows) {
  return {
    nRuns: okRows.length,
    top3Share: median(okRows.map((r) => r.top3Share)),
    hhi: median(okRows.map((r) => r.hhi)),
    fmAdoption: median(okRows.map((r) => r.fmAdoption)),
    countryShare: mean(okRows.map((r) => r.countryShare)),
    spanishShare: mean(okRows.map((r) => r.spanishShare)),
    spokenShare: mean(okRows.map((r) => r.spokenShare)),
    rockShare: mean(okRows.map((r) => r.rockShare)),
    chrShare: mean(okRows.map((r) => r.chrShare)),
    formatDiversity: median(okRows.map((r) => r.formatDiversity)),
    viableCompetitors: median(okRows.map((r) => r.viableCompetitors)),
    acquisitionTargets: median(okRows.map((r) => r.acquisitionTargets)),
    clusterCount: median(okRows.map((r) => r.clusterCount)),
    leaderShare: median(okRows.map((r) => r.leaderShare)),
    stationCount: median(okRows.map((r) => r.stationCount)),
  };
}

function metricThreshold(key) {
  if (key === 'hhi') return 60;
  if (key === 'formatDiversity') return 1.5;
  return PROXIMITY_PP;
}

function findProximityFlags(byMarketYear, years) {
  const flags = [];
  for (const { key, label } of IDENTITY_METRICS) {
    const dallasByYear = years.map((y) => ({ year: y, val: byMarketYear.dallas?.[y]?.[key] }));
    for (const peer of IDENTITY_COMPARE) {
      let allDecadesClose = true;
      const decadeDetails = [];
      for (const { year, val: dVal } of dallasByYear) {
        const pVal = byMarketYear[peer]?.[year]?.[key];
        if (dVal == null || pVal == null) { allDecadesClose = false; break; }
        const thresh = metricThreshold(key);
        const dist = Math.abs(dVal - pVal);
        decadeDetails.push({ year, dVal, pVal, dist });
        if (dist > thresh) allDecadesClose = false;
      }
      if (allDecadesClose && decadeDetails.length === years.length) {
        flags.push({
          metric: key,
          label,
          peer,
          decades: decadeDetails,
          severity: key === 'countryShare' && peer === 'nashville' ? 'expected_risk' : 'identity_collapse',
        });
      }
    }
  }
  return flags;
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
          rows.push(api.identityOne(marketId, year, s0, maxSteps));
        } catch (e) {
          rows.push({ ok: false, err: String(e?.message || e) });
        } finally {
          Math.random = origR;
        }
      }
      const okRows = rows.filter((r) => r.ok);
      byMarketYear[marketId][year] = {
        label: MARKETS[marketId]?.label || marketId,
        archetypeId: MARKETS[marketId]?.archetypeId || '?',
        failCount: rows.length - okRows.length,
        ...aggregateRuns(okRows),
      };
    }
  }

  const proximityFlags = findProximityFlags(byMarketYear, opts.years);

  const competitiveEcology = {};
  for (const year of opts.years) {
    competitiveEcology[year] = {
      dallas: {
        viableCompetitors: byMarketYear.dallas[year].viableCompetitors,
        leaderShare: byMarketYear.dallas[year].leaderShare,
        formatDiversity: byMarketYear.dallas[year].formatDiversity,
        clusterCount: byMarketYear.dallas[year].clusterCount,
        acquisitionTargets: byMarketYear.dallas[year].acquisitionTargets,
      },
      peers: Object.fromEntries(
        IDENTITY_COMPARE.map((id) => [id, {
          viableCompetitors: byMarketYear[id][year].viableCompetitors,
          leaderShare: byMarketYear[id][year].leaderShare,
          formatDiversity: byMarketYear[id][year].formatDiversity,
          clusterCount: byMarketYear[id][year].clusterCount,
          acquisitionTargets: byMarketYear[id][year].acquisitionTargets,
        }]),
      ),
    };
  }

  const lines = [];
  lines.push('# Dallas–Fort Worth Identity & Competitive Ecology Audit');
  lines.push('');
  lines.push(`Recorded: ${new Date().toISOString()} · ${opts.runs} runs/market · seed ${opts.seed}`);
  lines.push(`Compare set: Atlanta, Nashville, Chicago · Proximity threshold: ${pct(PROXIMITY_PP)} (HHI ±60, format diversity ±1.5)`);
  lines.push('');

  lines.push('## Identity matrix (Dallas vs peers)');
  lines.push('');
  for (const year of opts.years) {
    const d = byMarketYear.dallas[year];
    lines.push(`### ${year}`);
    lines.push('');
    lines.push('| Metric | Dallas | Atlanta | Nashville | Chicago |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const { key, label } of IDENTITY_METRICS) {
      const fmtVal = (v) => {
        if (v == null || Number.isNaN(v)) return '—';
        if (key === 'hhi') return v.toFixed(0);
        if (key === 'formatDiversity') return String(v);
        return pct(v);
      };
      lines.push(`| ${label} | ${fmtVal(d[key])} | ${fmtVal(byMarketYear.atlanta[year][key])} | ${fmtVal(byMarketYear.nashville[year][key])} | ${fmtVal(byMarketYear.chicago[year][key])} |`);
    }
    lines.push('');
  }

  lines.push('## Proximity flags (within threshold across ALL decades)');
  lines.push('');
  if (!proximityFlags.length) {
    lines.push('No metrics where Dallas tracks a peer within 2–3pp (or equivalent) across every audited decade.');
  } else {
    for (const f of proximityFlags) {
      const decadeStr = f.decades.map((d) => {
        const delta =
          f.metric === 'hhi' ? d.dist.toFixed(0)
            : f.metric === 'formatDiversity' ? d.dist.toFixed(1)
              : pct(d.dist);
        return `${d.year}: Δ${delta}`;
      }).join(', ');
      lines.push(`- **${f.label}** vs **${f.peer}** (${f.severity}): ${decadeStr}`);
    }
  }
  lines.push('');

  lines.push('## Competitive ecology');
  lines.push('');
  lines.push('| Year | Viable rivals (≥3%) | Leader share | Format diversity | Cluster families (≥10%) | Acquisition targets (2–12%) |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const year of opts.years) {
    const c = competitiveEcology[year].dallas;
    lines.push(`| ${year} | ${c.viableCompetitors ?? '—'} | ${pct(c.leaderShare)} | ${c.formatDiversity ?? '—'} | ${c.clusterCount ?? '—'} | ${c.acquisitionTargets ?? '—'} |`);
  }
  lines.push('');
  lines.push('Peer medians for competitive ecology:');
  for (const year of opts.years) {
    const peers = IDENTITY_COMPARE.map((id) => competitiveEcology[year].peers[id]);
    lines.push(`- **${year}**: viable rivals ${median(peers.map((p) => p.viableCompetitors))}, clusters ${median(peers.map((p) => p.clusterCount))}, acquisitions ${median(peers.map((p) => p.acquisitionTargets))}`);
  }
  lines.push('');

  lines.push('## Final questions');
  lines.push('');
  const identityCollapse = proximityFlags.filter((f) => f.severity === 'identity_collapse');
  const d2020 = byMarketYear.dallas[2020] || byMarketYear.dallas[opts.years[opts.years.length - 1]];
  const atl2020 = byMarketYear.atlanta[2020] || byMarketYear.atlanta[opts.years[opts.years.length - 1]];
  const nash2020 = byMarketYear.nashville[2020] || byMarketYear.nashville[opts.years[opts.years.length - 1]];

  lines.push(`1. **Unique identity?** ${identityCollapse.length ? `Partial — ${identityCollapse.length} metric(s) collapse toward peer(s).` : 'Yes — no all-decade proximity collapse vs Atlanta/Nashville/Chicago.'}`);
  lines.push(`2. **Scaffold weaknesses?** ${d2020?.spanishShare < 0.06 ? 'Spanish book may be thin at 2020 without scheduled launches.' : 'Spanish trajectory plausible.'} ${d2020?.countryShare > (atl2020?.countryShare || 0) + 0.02 ? 'Country differentiation vs Atlanta holds.' : 'Country lane needs monitoring.'}`);
  lines.push('3. **New archetype traits required?** `texas_sunbelt` introduced; no further traits needed unless proximity flags persist post-certification.');
  lines.push(`4. **Playable ready?** ${identityCollapse.length >= 2 ? 'Not yet — run market certification + Spanish launch audit first.' : 'Diag-ready — proceed to certification harness before billing merge.'}`);
  lines.push('5. **Next market after Dallas?** Houston (Texas cluster, higher Hispanic share) or Miami (Southeast Spanish + talk) — both extend archetype coverage without duplicating Sunbelt templates.');

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const artifact = {
    recordedAt: new Date().toISOString(),
    config: { runs: opts.runs, seed: opts.seed, years: opts.years, proximityThreshold: PROXIMITY_PP },
    byMarketYear,
    proximityFlags,
    competitiveEcology,
    recommendations: {
      uniqueIdentity: identityCollapse.length === 0,
      playableReady: identityCollapse.length < 2,
      nextMarketCandidates: ['houston', 'miami'],
    },
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
