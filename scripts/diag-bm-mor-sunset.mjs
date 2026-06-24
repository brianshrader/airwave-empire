#!/usr/bin/env node
/**
 * BM/MOR top-5 persistence audit — cold sim from era 1970 to target years.
 *   node scripts/diag-bm-mor-sunset.mjs
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

const MARKETS = ['atlanta', 'nashville', 'chicago', 'newyork', 'wichita', 'phoenix'];
const YEARS = [1988, 1990, 1992, 1994, 1996];
const RUNS = 12;
const SEED = 20260530;

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
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

function createVmContext() {
  const noop = () => {};
  const ctx = vm.createContext({
    console,
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: {
      body: { innerHTML: '', appendChild() {}, contains() { return false; } },
      head: { appendChild() {} },
      createElement: () => stubEl(),
      getElementById: () => stubEl(),
      querySelectorAll: () => [],
      querySelector: () => null,
      readyState: 'complete',
      addEventListener: noop,
      removeEventListener: noop,
    },
    localStorage: { getItem() { return null; }, setItem: noop, removeItem: noop },
    location: { reload: noop, search: '', href: 'http://127.0.0.1/' },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval: () => 0,
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert: noop,
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(typedArray) {
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
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Symbol,
    Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    Int8Array, Uint8Array, Buffer, Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus: noop };
  return ctx;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function main() {
  let src = readFileSync(legacyPath, 'utf8');
  src = injectHeadlessMegaFragNewsGuard(src);
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(src, ctx);

  const salts = Object.fromEntries(MARKETS.map((m) => [m, marketSalt(m)]));

  const inner = `
(function(){
  var SALTS = ${JSON.stringify(salts)};
  var MARKETS = ${JSON.stringify(MARKETS)};
  var YEARS = ${JSON.stringify(YEARS)};
  var RUNS = ${RUNS};
  var SEED = ${SEED};
  var DYING = new Set(['BEAUTIFUL_MUSIC','MOR','ADULT_STANDARDS']);

  function sortBook(stations){
    var list=stations.slice();
    list.sort(function(a,b){
      var sa=a.rat&&a.rat.share||0,sb=b.rat&&b.rat.share||0;
      if(Math.abs(sb-sa)>1e-9)return sb-sa;
      return String(a.id).localeCompare(String(b.id));
    });
    return list;
  }

  function runTo(marketId, era, targetYear, runIdx){
    ACTIVE_MARKET=marketId;
    syncMarketPopToMarket(marketId);
    G=genMarketMP(era);
    MP.mode='solo';
    var steps=0;
    while(steps<400){
      if(G.year===targetYear&&G.period===1)break;
      if(G.year>targetYear)break;
      advTurn();
      steps++;
    }
    var comm=(G.stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&!s.isPlayer&&!stationIsNoncommercialInstitutional(s)&&s.rat;
    });
    var book=sortBook(comm);
    var top5=book.slice(0,5);
    var dyingTop5=top5.filter(function(s){return DYING.has(s.format);});
    var bmMor=comm.filter(function(s){return s.format==='BEAUTIFUL_MUSIC'||s.format==='MOR';});
    return {
      year:G.year,
      dyingTop5:dyingTop5.map(function(s){
        return {fmt:s.format,call:s.callLetters,share:+(s.rat.share*100).toFixed(2),rank:book.indexOf(s)+1};
      }),
      bmMorShares:bmMor.map(function(s){
        return {fmt:s.format,call:s.callLetters,share:+(s.rat.share*100).toFixed(2),rank:book.indexOf(s)+1,lowP:s._lowSharePeriods||0};
      }),
      top10:top5.map(function(s,i){
        return (i+1)+'. '+s.callLetters+' '+s.format+' '+((s.rat.share*100).toFixed(1))+'%';
      })
    };
  }

  for(var mi=0;mi<MARKETS.length;mi++){
    var mkt=MARKETS[mi];
    for(var yi=0;yi<YEARS.length;yi++){
      var yr=YEARS[yi];
      var hits=0,bmMorTop5=0,bmMorOnDial=0;
      for(var r=0;r<RUNS;r++){
        var res=runTo(mkt,'1970',yr,r+SEED+SALTS[mkt]);
        if(res.dyingTop5.length)hits++;
        var bm5=res.dyingTop5.filter(function(x){return x.fmt==='BEAUTIFUL_MUSIC'||x.fmt==='MOR';});
        if(bm5.length)bmMorTop5++;
        bmMorOnDial+=res.bmMorShares.length;
        if(r===0&&yr===1996)console.log('\\n'+mkt+' '+yr+' top5: '+res.top10.join(' | '));
      }
      console.log(mkt+' '+yr+': dying-in-top5 '+hits+'/'+RUNS+' | BM/MOR-in-top5 '+bmMorTop5+'/'+RUNS+' | avg BM+MOR on dial '+(bmMorOnDial/RUNS).toFixed(2));
    }
  }
})();
`;

  vm.runInContext(inner, ctx);
}

main();
