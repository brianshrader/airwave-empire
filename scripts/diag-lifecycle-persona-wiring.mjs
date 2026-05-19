#!/usr/bin/env node
/**
 * Lifecycle persona wiring — COUNTRY modernRetention from formatLifecycle.v1.json marketProfiles.
 * In-vm only; no shipped legacy.js changes. No TOP40 trim or public leader nudge.
 *
 *   A  Baseline
 *   B  Portland profile COUNTRY.modernRetention (0.38) → appl() mktFmt
 *   C  All markets with lifecycle marketProfiles (portland, nashville, phoenix)
 *   D  Same as B (lifecycle only; confirms no leader trims)
 *
 *   npm run diag:lifecycle-persona-wiring
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectFormatLifecycleIife } from './vmInjectFormatLifecycleIife.mjs';
import {
  aggregateFmtSumToFamilyShares,
  canonicalFormatId,
  familyForFormat,
  FAMILY_DISPLAY_ORDER,
  loadFormatFamiliesCatalog,
} from './formatFamilyHelpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const lifecyclePath = path.join(root, 'data', 'formatLifecycle.v1.json');
const outJson = path.join(root, 'tmp', 'lifecycle_persona_wiring_ab.json');

const MARKETS = ['portland', 'seattle', 'phoenix', 'atlanta', 'nashville', 'wichita'];
const YEARS = [1995, 2005, 2026];
const RUNS = 12;
const SEED = 20260519;
const ERA = '1970';
const MAX_STEPS = 340;
const PERIOD = 1;

/** mode: off | portland | all_profiles */
const VARIANT_MODE = { A: 'off', B: 'portland', C: 'all_profiles', D: 'portland' };

function loadCountryProfilesFromCatalog() {
  const catalog = JSON.parse(readFileSync(lifecyclePath, 'utf8'));
  const national = catalog.nationalFormats?.COUNTRY || {};
  const out = { national };
  for (const [marketId, prof] of Object.entries(catalog.marketProfiles || {})) {
    const c = prof.formatModifiers?.COUNTRY;
    if (c?.modernRetention != null) {
      out[marketId] = { modernRetention: c.modernRetention };
    }
  }
  return out;
}

function buildLifecyclePrelude(profileBundle) {
  return `
globalThis.__WL_LIFECYCLE_WIRE_MODE__=globalThis.__WL_LIFECYCLE_WIRE_MODE__||'off';
globalThis.__WL_LIFECYCLE_COUNTRY__=${JSON.stringify(profileBundle)};

/** Profile COUNTRY.modernRetention → appl mktFmt multiplier (modern-era damp only). */
function __wlLifecycleProfileCountryMktFmt(marketId,year){
  const mode=globalThis.__WL_LIFECYCLE_WIRE_MODE__;
  if(!mode||mode==='off')return 1;
  const bundle=globalThis.__WL_LIFECYCLE_COUNTRY__||{};
  const prof=bundle[marketId];
  if(!prof||prof.modernRetention==null)return 1;
  if(mode==='portland'&&marketId!=='portland')return 1;

  const nat=bundle.national||{};
  const peak=nat.peak!=null?nat.peak:2005;
  const plateauEnd=nat.plateauEnd!=null?nat.plateauEnd:2015;
  const declineEnd=nat.declineEnd!=null?nat.declineEnd:2026;
  const nationalRetention=nat.modernRetention!=null?nat.modernRetention:0.8;
  const modernRetention=Number(prof.modernRetention);
  const y=Math.round(Number(year))||1970;

  let nationalDecline=0;
  if(y>plateauEnd)nationalDecline=_smoothstep(plateauEnd,declineEnd,y);
  else if(y>peak)nationalDecline=_smoothstep(peak,plateauEnd,y)*0.35;

  if(nationalDecline<0.02)return 1;

  const retentionRatio=modernRetention/Math.max(0.12,nationalRetention);
  const damp=1-0.48*nationalDecline*(1-retentionRatio);
  return Math.max(0.72,Math.min(1.06,damp));
}
`;
}

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

/** Variant C only — diag harness for all marketProfiles (not shipped in legacy.js). */
function patchLegacyForAllProfilesWiring(src, profileBundle) {
  let out = buildLifecyclePrelude(profileBundle) + injectHeadlessMegaFragNewsGuard(src);
  const countryBlock = `  if(s.format==='COUNTRY'){
    mktFmt+=(mkt.countryBonus||0)*0.38+(cult.country||0)*0.38;
    if(marketId==='losangeles')mktFmt-=0.17;
    if(marketId==='newyork')mktFmt-=0.125;
    if(marketId==='chicago')mktFmt-=0.035;
    mktFmt*=profileCountryLifecycleMktFmtMult(marketId,year);
  }`;
  const countryBlockPatched = `  if(s.format==='COUNTRY'){
    mktFmt+=(mkt.countryBonus||0)*0.38+(cult.country||0)*0.38;
    if(marketId==='losangeles')mktFmt-=0.17;
    if(marketId==='newyork')mktFmt-=0.125;
    if(marketId==='chicago')mktFmt-=0.035;
    if(typeof __wlLifecycleProfileCountryMktFmt==='function')mktFmt*=__wlLifecycleProfileCountryMktFmt(marketId,year);
  }`;
  if (!out.includes('mktFmt*=__wlLifecycleProfileCountryMktFmt')) {
    out = out.replace(countryBlock, countryBlockPatched);
  }
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
  body: { innerHTML: '', classList: { toggle() {} }, appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  documentElement: { style: {}, dataset: {} },
  createElement() { return stubEl(); },
  getElementById() { return stubEl(); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext(mode) {
  const noop = () => {};
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error, table: noop },
    __WL_HEADLESS__: true,
    __WL_LIFECYCLE_WIRE_MODE__: mode,
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
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
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

function loadCtx(mode, profileBundle) {
  const ctx = createVmContext(mode);
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  let src = injectHeadlessMegaFragNewsGuard(readFileSync(legacyPath, 'utf8'));
  if (mode === 'all_profiles') {
    src = patchLegacyForAllProfilesWiring(src, profileBundle);
  }
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 180_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  if (mode === 'off') {
    vm.runInContext('globalThis.__wlProfileCountryLifecycleMktFmtMult=function(){return 1;};', ctx);
  } else if (mode === 'all_profiles') {
    vm.runInContext(`globalThis.__WL_LIFECYCLE_WIRE_MODE__='all_profiles';`, ctx);
  }
  return ctx;
}

function runSimulation(ctx) {
  const salts = Object.fromEntries(MARKETS.map((m) => [m, marketSalt(m)]));
  const inner = `
  (function(){
    var SALTS = ${JSON.stringify(salts)};
    var GEN_ERA = ${JSON.stringify(ERA)};
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
    function sampleOneRun(marketId,targetYear,targetPeriod,maxSteps){
      ACTIVE_MARKET=marketId;
      syncMarketPopToMarket(marketId);
      G=genMarketMP(GEN_ERA);
      MP.mode='solo'; MP.isHost=false; if(MP.players)MP.players=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===targetYear&&G.period===targetPeriod)break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>targetPeriod)) return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==targetPeriod) return {ok:false,err:'miss'};
      var book=sortBook(eligibleBookStations(G));
      var fmtSum={}, hhi=0, ctry=0;
      for(var j=0;j<book.length;j++){
        var st=book[j];
        var sh=Number(st.rat&&st.rat.share)||0;
        hhi+=sh*sh;
        var fk=fmtKey(st.format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        if(String(st.format||'')==='COUNTRY')ctry+=sh;
      }
      var lead=book[0]||null;
      return {
        ok:true, fmtSum:fmtSum, hhi_x10000:hhi*10000, country:ctry,
        leaderFmtRaw:lead?String(lead.format):'',
        leaderFmtKey:lead?fmtKey(lead.format):'',
      };
    }
    return function runAll(markets,years,targetPeriod,numRuns,baseSeed,maxSteps){
      var rows=[], origR=Math.random;
      for(var mi=0;mi<markets.length;mi++){
        var mktId=markets[mi], salt=SALTS[mktId]||0;
        for(var yi=0;yi<years.length;yi++){
          var y=years[yi];
          for(var run=0;run<numRuns;run++){
            var s0=baseSeed+salt*17+y*10007+run*9973;
            (function(seedVal){
              var s=seedVal;
              Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
            })(s0);
            var r;
            try{ r=sampleOneRun(mktId,y,targetPeriod,maxSteps); }
            catch(e){ r={ok:false,err:String(e&&e.message||e)}; }
            finally{ Math.random=origR; }
            rows.push({marketId:mktId,year:y,run:run,result:r});
          }
        }
      }
      return rows;
    };
  })();
  `;
  return vm.runInContext(inner, ctx)(MARKETS, YEARS, PERIOD, RUNS, SEED, MAX_STEPS);
}

function summarizeCell(rows, marketId, year, catalog) {
  const ok = rows.filter((r) => r.result?.ok && r.marketId === marketId && r.year === year);
  if (!ok.length) return null;
  const n = ok.length;
  const fmtHist = {};
  const famHist = {};
  const fmtAgg = {};

  for (const row of ok) {
    const r = row.result;
    fmtHist[r.leaderFmtKey || '?'] = (fmtHist[r.leaderFmtKey || '?'] || 0) + 1;
    const fam = familyForFormat(r.leaderFmtRaw, catalog) || 'UNMAPPED';
    famHist[fam] = (famHist[fam] || 0) + 1;
    for (const [fmt, sh] of Object.entries(r.fmtSum || {})) {
      const cid = canonicalFormatId(fmt, catalog);
      fmtAgg[cid] = (fmtAgg[cid] || 0) + (Number(sh) || 0);
    }
  }

  const fmtMean = Object.fromEntries(Object.entries(fmtAgg).map(([k, v]) => [k, v / n]));
  const { familyShares } = aggregateFmtSumToFamilyShares(fmtMean, catalog);

  return {
    runs: n,
    hhi: mean(ok.map((r) => r.result.hhi_x10000)),
    countryPct: mean(ok.map((r) => r.result.country)) * 100,
    countryNum1Wins: ok.filter((r) => r.result.leaderFmtKey === 'COUNTRY').length,
    familyShares,
    leaderFmtHistogram: fmtHist,
    leaderFamilyHistogram: famHist,
  };
}

function histStr(h) {
  return Object.entries(h)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join(' ');
}

function famLine(fam) {
  return FAMILY_DISPLAY_ORDER.filter((f) => (fam[f] || 0) > 0.001)
    .map((f) => `${f} ${((fam[f] || 0) * 100).toFixed(1)}%`)
    .join(' | ');
}

function printRow(label, s) {
  if (!s) return;
  console.log(
    `${label} | HHI ${s.hhi.toFixed(0)} | CTRY ${s.countryPct.toFixed(1)}% | #1CTRY ${s.countryNum1Wins}/${s.runs} | #1fmt ${histStr(s.leaderFmtHistogram)} | #1fam ${histStr(s.leaderFamilyHistogram)}`,
  );
  console.log(`         families: ${famLine(s.familyShares)}`);
}

function main() {
  const profileBundle = loadCountryProfilesFromCatalog();
  const profileMarkets = Object.keys(profileBundle).filter((k) => k !== 'national');

  console.log(
    'Lifecycle persona wiring — COUNTRY modernRetention (B/D use shipped legacy + formatLifecycleProfileRuntime.iife.js)',
  );
  console.log(`Catalog profiles: ${profileMarkets.join(', ')} (from formatLifecycle.v1.json)`);
  console.log(`Markets: ${MARKETS.join(', ')} | Years: ${YEARS.join(', ')} | ${RUNS} runs | era=${ERA}\n`);

  const all = {};
  let bEqualsD = true;

  for (const [vid, mode] of Object.entries(VARIANT_MODE)) {
    const labels = {
      A: 'Baseline',
      B: 'Portland profile COUNTRY.modernRetention only',
      C: 'All lifecycle marketProfiles (portland, nashville, phoenix)',
      D: 'B confirmed (lifecycle only, no leader trims)',
    };
    console.log(`\n========== Variant ${vid}: ${labels[vid]} (mode=${mode}) ==========\n`);
    const ctx = loadCtx(mode, profileBundle);
    const rows = runSimulation(ctx);
    const fails = rows.filter((r) => !r.result?.ok);
    if (fails.length) console.warn(`  ${fails.length} failed runs`);

    all[vid] = {};
    for (const mid of MARKETS) {
      all[vid][mid] = {};
      for (const y of YEARS) {
        const catalog = loadFormatFamiliesCatalog();
        all[vid][mid][y] = summarizeCell(rows, mid, y, catalog);
      }
    }

    for (const y of YEARS) {
      const s = all[vid].portland[y];
      if (s) printRow(`  portland ${y}`, s);
    }
  }

  if (all.B && all.D) {
    for (const y of YEARS) {
      const b = all.B.portland[y];
      const d = all.D.portland[y];
      if (
        b &&
        d &&
        (b.countryNum1Wins !== d.countryNum1Wins ||
          Math.abs(b.countryPct - d.countryPct) > 0.05 ||
          b.hhi !== d.hhi)
      ) {
        bEqualsD = false;
      }
    }
  }
  console.log(`\n  Variant B vs D identical on Portland: ${bEqualsD ? 'YES' : 'NO'}`);

  console.log('\n========== Portland: A vs B vs C @ key years ==========\n');
  console.log('Var | Year | CTRY% | #1CTRY | HHI | #1 format');
  for (const y of YEARS) {
    for (const vid of ['A', 'B', 'C']) {
      const s = all[vid]?.portland?.[y];
      if (!s) continue;
      console.log(
        `${vid} | ${y} | ${s.countryPct.toFixed(1)} | ${s.countryNum1Wins}/${s.runs} | ${s.hhi.toFixed(0)} | ${histStr(s.leaderFmtHistogram)}`,
      );
    }
  }

  console.log('\n========== Control drift: A → B (Portland-only wire) ==========\n');
  for (const mid of ['seattle', 'phoenix', 'atlanta', 'nashville', 'wichita']) {
    for (const y of YEARS) {
      const a = all.A?.[mid]?.[y];
      const b = all.B?.[mid]?.[y];
      if (!a || !b) continue;
      const ctryDrift = Math.abs(a.countryPct - b.countryPct);
      const hhiDrift = Math.abs(a.hhi - b.hhi);
      const winsDrift = Math.abs(a.countryNum1Wins - b.countryNum1Wins);
      if (ctryDrift < 0.15 && hhiDrift < 3 && winsDrift === 0) continue;
      console.log(
        `  ${mid} ${y}: CTRY ${a.countryPct.toFixed(1)}→${b.countryPct.toFixed(1)}% | #1CTRY ${a.countryNum1Wins}→${b.countryNum1Wins} | HHI ${a.hhi.toFixed(0)}→${b.hhi.toFixed(0)}`,
      );
    }
  }

  console.log('\n========== Profile markets: A → C (all_profiles wire) ==========\n');
  for (const mid of ['portland', 'nashville', 'phoenix']) {
    for (const y of YEARS) {
      const a = all.A?.[mid]?.[y];
      const c = all.C?.[mid]?.[y];
      if (!a || !c) continue;
      console.log(
        `  ${mid} ${y}: CTRY ${a.countryPct.toFixed(1)}→${c.countryPct.toFixed(1)}% | #1CTRY ${a.countryNum1Wins}→${c.countryNum1Wins} | HHI ${a.hhi.toFixed(0)}→${c.hhi.toFixed(0)}`,
      );
    }
  }

  console.log('\n========== Controls under C (should be unchanged) ==========\n');
  for (const mid of ['seattle', 'atlanta', 'wichita']) {
    for (const y of YEARS) {
      const a = all.A?.[mid]?.[y];
      const c = all.C?.[mid]?.[y];
      if (!a || !c) continue;
      const drift =
        Math.abs(a.countryPct - c.countryPct) > 0.15 ||
        a.countryNum1Wins !== c.countryNum1Wins ||
        Math.abs(a.hhi - c.hhi) > 3;
      if (drift) {
        console.log(`  UNEXPECTED ${mid} ${y}: CTRY ${a.countryPct.toFixed(1)} vs ${c.countryPct.toFixed(1)}`);
      }
    }
  }
  console.log('  (no lines = seattle/atlanta/wichita unchanged under C)');

  const p26a = all.A?.portland?.[2026];
  const p26b = all.B?.portland?.[2026];
  console.log('\n========== Answer ==========\n');
  if (p26a && p26b) {
    console.log(
      `Portland 2026 (B vs A): COUNTRY share ${p26a.countryPct.toFixed(1)}%→${p26b.countryPct.toFixed(1)}%; #1 COUNTRY ${p26a.countryNum1Wins}→${p26b.countryNum1Wins}/12; HHI ${p26a.hhi.toFixed(0)}→${p26b.hhi.toFixed(0)}.`,
    );
    const ok =
      p26b.countryNum1Wins < p26a.countryNum1Wins &&
      p26b.countryPct < p26a.countryPct - 2 &&
      p26b.hhi < p26a.hhi;
    console.log(
      ok
        ? 'Lifecycle COUNTRY modernRetention wiring reduces modern country dominance without requiring leader trims.'
        : 'Effect present but review magnitude / side effects before shipping.',
    );
  }

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(
    outJson,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        profileBundle,
        markets: MARKETS,
        years: YEARS,
        runs: RUNS,
        seed: SEED,
        era: ERA,
        variants: VARIANT_MODE,
        results: all,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nWrote ${outJson}`);
}

main();
