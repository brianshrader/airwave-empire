#!/usr/bin/env node
/**
 * Multi-market PUBLIC_NEWS spot-check @ Spring 2026 (40-year cold sims).
 * Validates edu-scaled floor/cap — not calibrated to Houston alone.
 *
 *   npm run diag:public-news-spotcheck
 *   node scripts/diag-public-news-spotcheck.mjs --runs=20
 *
 * Output: tmp/public_news_spotcheck.md
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
const outMd = path.join(root, 'tmp', 'public_news_spotcheck.md');

const DEFAULT_MARKETS = [
  'houston',
  'dallas',
  'phoenix',
  'atlanta',
  'seattle',
  'sanfrancisco',
  'newyork',
  'chicago',
];
const TARGET_YEAR = 2026;
const GEN_ERA = '1985';
const MAX_STEPS = 100;
const DEFAULT_RUNS = 16;
const SEED = 20260627;

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
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
    setInterval() { return 0; },
    clearTimeout() {}, clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {}, fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray?.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = Math.floor(Math.random() * 256);
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      },
    },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Symbol, Proxy, Reflect,
    parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined, Int8Array, Uint8Array, Buffer, Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function pct(x) {
  return x == null ? '—' : `${(x * 100).toFixed(2)}%`;
}

function main() {
  let runs = DEFAULT_RUNS;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--runs=')) runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
  }

  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(injectHeadlessMegaFragNewsGuard(readFileSync(legacyPath, 'utf8')), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);

  const inner = `
  (function(){
    var TARGET_YEAR=${TARGET_YEAR};
    var GEN_ERA=${JSON.stringify(GEN_ERA)};
    var MAX_STEPS=${MAX_STEPS};
    function publicNewsMetrics(G){
      var news=[], sum=0;
      (G.stations||[]).forEach(function(s){
        if(!s||s._bpSlotDeferred||!s.isPublic||s.format!=='PUBLIC_NEWS')return;
        var sh=Number(s.rat.share)||0;
        sum+=sh;
        news.push({call:s.callLetters,sh:sh,tier:s._nceTier||'?'});
      });
      news.sort(function(a,b){return b.sh-a.sh;});
      var mkt=MARKETS[G.marketId||ACTIVE_MARKET]||{};
      return {
        sum:sum,
        top:news[0]?news[0].sh:0,
        topCall:news[0]?news[0].call:'',
        nNews:news.length,
        cap:expectedPublicNewsBookCap01(G),
        floor:expectedPublicNewsBookFloor01(G),
        strength:publicNewsMarketStrength01(G),
        edu:marketEduIndex(G.marketId),
        civic:publicCivicIndexForMarket(G.marketId),
        tier:mkt.rankTier||'?',
      };
    }
    function runOne(marketId,seed){
      ACTIVE_MARKET=marketId;
      syncMarketPopToMarket(marketId);
      G=genMarketMP(GEN_ERA);
      G._wlShareCalib={leaderCaps:false,publicFloor:true};
      MP.mode='solo';
      var s=seed, origR=Math.random;
      Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
      try{
        var steps=0;
        while(steps<MAX_STEPS){
          if(G.year===TARGET_YEAR&&G.period===1)break;
          if(G.year>TARGET_YEAR) return {ok:false,err:'overshoot'};
          var ui=window._harnessPatchTimersAndUi();
          try{ advTurn(); }finally{ ui.restore(); }
          steps++;
        }
        var m=publicNewsMetrics(G);
        var book=(G.stations||[]).filter(function(st){return st&&!st._bpSlotDeferred&&st.rat;});
        book.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
        m.leadFormat=book[0]?book[0].format:'';
        m.leadShare=book[0]?Number(book[0].rat.share)||0:0;
        m.nprIsLeader=m.leadFormat==='PUBLIC_NEWS';
        m.capBinding=m.sum>m.cap-0.008;
        m.ok=true;
        return m;
      }catch(e){
        return {ok:false,err:String(e&&e.message||e)};
      }finally{ Math.random=origR; }
    }
    return function(markets,runs,baseSeed){
      var out=[];
      for(var i=0;i<markets.length;i++){
        var mid=markets[i];
        for(var r=0;r<runs;r++){
          out.push(Object.assign({marketId:mid,run:r,seed:baseSeed+r*9973},runOne(mid,baseSeed+r*9973)));
        }
      }
      return out;
    };
  })();
  `;

  const runAll = vm.runInContext(inner, ctx);
  const rows = runAll(DEFAULT_MARKETS, runs, SEED);
  const ok = rows.filter((r) => r.ok);
  const bad = rows.filter((r) => !r.ok);

  const lines = [
    '# PUBLIC_NEWS multi-market spot-check',
    '',
    `Spring ${TARGET_YEAR} · genMarketMP(${GEN_ERA}) · ${runs} runs/market · edu-scaled floor/cap`,
    '',
    'Note: Boston, Minneapolis, and Washington DC are not playable markets; Seattle, San Francisco, and New York proxy high-edu NPR markets.',
    '',
    '| Market | edu | cap | floor | NPR sum mean | NPR sum max | top NPR mean | cap hit % | NPR #1 % |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const mid of DEFAULT_MARKETS) {
    const list = ok.filter((r) => r.marketId === mid);
    if (!list.length) continue;
    const cap = list[0].cap;
    const floor = list[0].floor;
    const edu = list[0].edu;
    const sums = list.map((r) => r.sum);
    const tops = list.map((r) => r.top);
    const capHits = list.filter((r) => r.capBinding).length;
    const nprLeads = list.filter((r) => r.nprIsLeader).length;
    lines.push(
      `| ${mid} | ${edu.toFixed(2)} | ${pct(cap)} | ${pct(floor)} | ${pct(mean(sums))} | ${pct(Math.max(...sums))} | ${pct(mean(tops))} | ${((capHits / list.length) * 100).toFixed(0)}% | ${((nprLeads / list.length) * 100).toFixed(0)}% |`,
    );
  }

  lines.push('', '## Expected bands (real-world guide)', '');
  lines.push('| Market | Typical NPR combined |');
  lines.push('| houston, dallas, phoenix, atlanta | ~2–5% |');
  lines.push('| seattle, sanfrancisco, chicago, newyork | ~3–8% (strong flagship can approach cap) |');
  lines.push('', '**Cap hit %** = runs where combined NPR landed within ~0.8pp of edu-scaled cap (may indicate trimming). **NPR #1 %** = PUBLIC_NEWS led the book (should be rare).', '');

  const runaway = ok.filter((r) => r.sum > 0.12 || r.top > 0.12);
  if (runaway.length) {
    lines.push('## ⚠ Runaway samples (>12%)', '');
    runaway.slice(0, 8).forEach((r) => {
      lines.push(`- ${r.marketId} run ${r.run}: sum ${pct(r.sum)} top ${r.topCall} ${pct(r.top)} cap ${pct(r.cap)}`);
    });
    lines.push('');
  } else {
    lines.push('No runaway NPR samples above 12%.', '');
  }

  mkdirSync(path.dirname(outMd), { recursive: true });
  writeFileSync(outMd, lines.join('\n') + '\n', 'utf8');
  console.log(lines.join('\n'));
  console.log(`\nWrote ${outMd}`);
  if (bad.length) console.log(`Note: ${bad.length} failed runs`);
}

main();
