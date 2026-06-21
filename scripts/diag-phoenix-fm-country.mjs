#!/usr/bin/env node
/**
 * Phoenix FM country presence audit — FM vs AM country station counts and share by year.
 *   node scripts/diag-phoenix-fm-country.mjs
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

const YEARS = [1978, 1985, 1993, 1995, 2000, 2005, 2010, 2015, 2020, 2026];
const RUNS = Number(process.env.RUNS || process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] || 50);
const SEED = 20260619;
const MAX_STEPS = 360;

function injectNewsGuard(src) {
  return src
    .replace(
      'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    )
    .replace(
      'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
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
    addEventListener() {},
    removeEventListener() {},
    getAttribute() { return null; },
    setAttribute() {},
  };
}

function createCtx() {
  const noop = () => {};
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: {
      body: { innerHTML: '', appendChild() {}, contains() { return false; } },
      head: { appendChild() {} },
      createElement() { return stubEl(); },
      getElementById() { return stubEl(); },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      readyState: 'complete',
      addEventListener: noop,
      removeEventListener: noop,
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/', hostname: 'localhost' },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() { return 0; },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    undefined,
    NaN,
    Infinity,
    Buffer,
    Uint8Array,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.window.addEventListener = noop;
  ctx.window.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

const AUDIT_VM = `
(function(){
  function countryBandStats(stations){
    var fmCount=0, amCount=0, fmShare=0, amShare=0, totalShare=0;
    for(var i=0;i<(stations||[]).length;i++){
      var s=stations[i];
      if(!s||s._bpSlotDeferred||s.format!=='COUNTRY') continue;
      var sh=Number(s.rat&&s.rat.share)||0;
      totalShare+=sh;
      if(s.sig&&s.sig.type==='FM'){ fmCount++; fmShare+=sh; }
      else if(s.sig&&s.sig.type==='AM'){ amCount++; amShare+=sh; }
    }
    return {fmCount:fmCount,amCount:amCount,fmShare:fmShare,amShare:amShare,totalShare:totalShare};
  }
  function genUnder(){
    var sc=SC.find(function(x){return x.id==='under';});
    var oi=sc.idx; sc.idx=[];
    G=genMarket('under');
    sc.idx=oi;
    G.stations.forEach(function(st){st.isPlayer=false;});
    G.ps=[];
  }
  function simToYear(marketId, targetYear, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function') syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      genUnder();
      var steps=0;
      while(steps<maxSteps){
        if(G.year===targetYear&&G.period===1) break;
        if(G.year>targetYear||(G.year===targetYear&&G.period>1)) return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==targetYear||G.period!==1) return {ok:false,err:'miss'};
      return {ok:true, stats:countryBandStats(G.stations)};
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { simToYear: simToYear };
})();
`;

function main() {
  const ctx = createCtx();
  injectMarketEcologyIife(ctx);
  vm.runInContext(injectNewsGuard(readFileSync(legacyPath, 'utf8')), ctx, {
    filename: 'legacy.js',
    timeout: 300000,
  });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  const audit = vm.runInContext(AUDIT_VM, ctx);

  console.log(`Phoenix FM country audit (${RUNS} runs, same seed per run across years)\n`);
  const byYear = {};
  /** @type {Array<{run:number,seed:number,byYear:Record<number,{fmCount:number,amCount:number,totalShare:number}>}>} */
  const cohort = [];

  for (let r = 0; r < RUNS; r++) {
    const seed = SEED + r * 997;
    const runRow = { run: r, seed, byYear: {} };
    for (const year of YEARS) {
      const row = audit.simToYear('phoenix', year, seed, MAX_STEPS);
      if (row?.ok && row.stats) {
        runRow.byYear[year] = {
          fmCount: row.stats.fmCount || 0,
          amCount: row.stats.amCount || 0,
          totalShare: row.stats.totalShare || 0,
        };
      }
    }
    cohort.push(runRow);
  }

  for (const year of YEARS) {
    const rows = cohort.map((c) => c.byYear[year]).filter(Boolean);
    const n = Math.max(1, rows.length);
    const mean = (k) => rows.reduce((a, x) => a + (x[k] || 0), 0) / n;
    const zeroFm = rows.filter((x) => (x.fmCount || 0) === 0).length;
    byYear[year] = {
      runs: rows.length,
      fmCount: mean('fmCount'),
      amCount: mean('amCount'),
      countryShare: mean('totalShare'),
      zeroFmRate: zeroFm / n,
      zeroFmCount: zeroFm,
    };
    const m = byYear[year];
    console.log(
      `${year}: FM μ=${m.fmCount.toFixed(2)} stn | AM μ=${m.amCount.toFixed(2)} | ` +
        `country ${(m.countryShare * 100).toFixed(1)}% | zero-FM ${zeroFm}/${n} (${(m.zeroFmRate * 100).toFixed(1)}%)`,
    );
  }

  const zeroAt1995 = cohort.filter((c) => (c.byYear[1995]?.fmCount || 0) === 0);
  const stillZeroAt2000 = zeroAt1995.filter((c) => (c.byYear[2000]?.fmCount || 0) === 0);
  const recoveredBy2000 = zeroAt1995.length - stillZeroAt2000.length;
  const neverFmBy2026 = stillZeroAt2000.filter((c) => (c.byYear[2026]?.fmCount || 0) === 0);
  const lateFirstArrival = zeroAt1995.filter((c) => (c.byYear[1993]?.fmCount || 0) === 0);
  const lostAfter1993 = zeroAt1995.filter((c) => (c.byYear[1993]?.fmCount || 0) > 0);

  console.log('\n── 1995 zero-FM cohort persistence ──');
  console.log(`Runs with 0 FM country @1995: ${zeroAt1995.length}/${RUNS} (${((zeroAt1995.length / RUNS) * 100).toFixed(1)}%)`);
  console.log(
    `  Never had FM by 1993 (late first arrival): ${lateFirstArrival.length} | ` +
      `Had FM @1993, gone by 1995 (churn): ${lostAfter1993.length}`,
  );
  if (zeroAt1995.length) {
    console.log(
      `  Recovered FM country by 2000: ${recoveredBy2000}/${zeroAt1995.length} ` +
        `(${((recoveredBy2000 / zeroAt1995.length) * 100).toFixed(1)}% of cohort)`,
    );
    console.log(
      `  Still 0 FM @2000: ${stillZeroAt2000.length}/${zeroAt1995.length} ` +
        `(${((stillZeroAt2000.length / RUNS) * 100).toFixed(1)}% of all runs)`,
    );
    console.log(
      `  Never FM country through 2026: ${neverFmBy2026.length}/${zeroAt1995.length} ` +
        `(${((neverFmBy2026.length / RUNS) * 100).toFixed(1)}% of all runs)`,
    );
    if (stillZeroAt2000.length) {
      console.log('  Still-zero @2000 run seeds:', stillZeroAt2000.map((c) => c.seed).join(', '));
      for (const c of stillZeroAt2000) {
        const snap = [2000, 2005, 2010, 2015, 2020, 2026]
          .map((y) => `${y}:${c.byYear[y]?.fmCount ?? '?'}`)
          .join(' → ');
        console.log(`    seed ${c.seed}: ${snap}`);
      }
    }
    if (neverFmBy2026.length) {
      console.log('  Never-FM run seeds:', neverFmBy2026.map((c) => c.seed).join(', '));
    }
  }

  const y93 = byYear[1993];
  const pass = y93 && y93.fmCount >= 0.9 && y93.zeroFmRate <= 0.15;
  const cohortOk = stillZeroAt2000.length / RUNS <= 0.04;
  console.log(`\nGate @1993: mean FM country ≥1 & ≤15% zero-FM → ${pass ? 'PASS' : 'WARN'}`);
  console.log(
    `Cohort @2000: ≤4% of all runs still zero-FM after 1995 miss → ${cohortOk ? 'PASS' : 'WARN'} ` +
      `(${(stillZeroAt2000.length / RUNS * 100).toFixed(1)}%)`,
  );
  process.exit(pass && cohortOk ? 0 : 1);
}

main();
