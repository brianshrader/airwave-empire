/**
 * Headless market/year snapshot for editorial reference panel.
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import { injectMarketEcologyIife } from '../vmInjectMarketEcologyIife.mjs';
import { injectFormatLifecycleIife } from '../vmInjectFormatLifecycleIife.mjs';
import { injectHeadlessMegaFragNewsGuard } from '../marketStabilityHarness.mjs';
import {
  paths,
  GEN_ERA,
  MAX_SIM_STEPS,
  TARGET_PERIOD,
  SPANISH_PILLARS,
} from './config.mjs';

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
    __WL_REALISM_SPANISH_COMPOSITION_POC: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '?proto=share+sac+spanish', href: 'http://127.0.0.1/' },
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
      getRandomValues(typedArray) {
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = Math.floor(Math.random() * 256);
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (r & 0x3) | 0x8;
        });
      },
    },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Symbol,
    Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    Int8Array, Uint8Array, Buffer, Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

export function loadSimContext(seed) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(injectHeadlessMegaFragNewsGuard(readFileSync(paths.legacy, 'utf8')), ctx);
  vm.runInContext(readFileSync(paths.spanish, 'utf8'), ctx);
  vm.runInContext(
    `if(typeof spanishCompositionInstallFmFa==='function')spanishCompositionInstallFmFa();`,
    ctx,
  );
  vm.runInContext(readFileSync(paths.harness, 'utf8'), ctx);
  vm.runInContext(`var AUDIT_SEED=${seed};`, ctx);
  return ctx;
}

export function runMarketYearSnapshot(ctx, marketId, targetYear, seed) {
  const salt = marketSalt(marketId);
  const s0 = seed + salt * 17 + targetYear * 10007;
  const origR = Math.random;
  let s = s0;
  Math.random = function auditRng() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  try {
    return vm.runInContext(
      `(function(){
        ACTIVE_MARKET=${JSON.stringify(marketId)};
        syncMarketPopToMarket(ACTIVE_MARKET);
        GEN_ERA=${JSON.stringify(GEN_ERA)};
        G=genMarketMP(GEN_ERA);
        MP.mode='solo';
        MP.isHost=false;
        if(MP.players)MP.players=[];
        var steps=0;
        var maxSteps=${MAX_SIM_STEPS};
        var targetYear=${targetYear};
        var targetPeriod=${TARGET_PERIOD};
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

        function eligibleBook(stations){
          var list=(stations||[]).filter(function(s){
            return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
          });
          for(var i=0;i<list.length;i++){
            if(typeof sanitizeStationShareForRanking==='function')sanitizeStationShareForRanking(list[i]);
          }
          list.sort(function(a,b){
            var sa=a.rat&&a.rat.share||0,sb=b.rat&&b.rat.share||0;
            if(Math.abs(sb-sa)>1e-9)return sb-sa;
            return String(a.id).localeCompare(String(b.id));
          });
          return list;
        }
        function isComm(s){
          return s&&!s._bpSlotDeferred&&!s.isPlayer&&typeof stationIsNoncommercialInstitutional==='function'&&!stationIsNoncommercialInstitutional(s);
        }
        function isSpanFmt(fmt){
          if(typeof spanishCompositionIsSpanishLaneFmt==='function'&&spanishCompositionIsSpanishLaneFmt(fmt))return true;
          return ${JSON.stringify(SPANISH_PILLARS)}.indexOf(String(fmt||''))>=0;
        }

        var book=eligibleBook(G.stations);
        var comm=(G.stations||[]).filter(isComm);
        var inst=(G.stations||[]).filter(function(s){
          return s&&!s._bpSlotDeferred&&(s.format==='RELIGIOUS_NETWORK'||s.isReligiousNetwork||s.isPublic);
        });
        var fmtCounts={};
        var fmtBookCounts={};
        var fmtShare={};
        var amComm=0, fmComm=0;
        comm.forEach(function(st){
          var f=String(st.format||'?');
          fmtCounts[f]=(fmtCounts[f]||0)+1;
          var band=(st.sig&&st.sig.type)||'';
          if(band==='AM')amComm++;
          else if(band==='FM')fmComm++;
        });
        book.forEach(function(st){
          var f=String(st.format||'?');
          fmtBookCounts[f]=(fmtBookCounts[f]||0)+1;
          var sh=Number(st.rat&&st.rat.share)||0;
          fmtShare[f]=(fmtShare[f]||0)+sh;
        });

        var ranker=book.slice(0,10).map(function(st,idx){
          return {
            rank:idx+1,
            call:String(st.callLetters||'?'),
            format:String(st.format||'?'),
            band:(st.sig&&st.sig.type)||'?',
            share:Number(st.rat&&st.rat.share)||0,
          };
        });

        var spanish={};
        ${JSON.stringify(SPANISH_PILLARS)}.forEach(function(f){
          spanish[f]={dialCount:fmtCounts[f]||0,bookCount:fmtBookCounts[f]||0};
        });

        var spanishLaneShare=0;
        book.forEach(function(st){
          if(isSpanFmt(st.format))spanishLaneShare+=Number(st.rat&&st.rat.share)||0;
        });

        var topShare=book.length?Number(book[0].rat&&book[0].rat.share)||0:0;
        var top5Share=0;
        for(var ti=0;ti<Math.min(5,book.length);ti++)top5Share+=Number(book[ti].rat&&book[ti].rat.share)||0;
        var midTier=0;
        book.forEach(function(st){
          var sh=Number(st.rat&&st.rat.share)||0;
          if(sh>=0.005&&sh<=0.035)midTier++;
        });
        var hhi=0;
        book.forEach(function(st){
          var sh=Number(st.rat&&st.rat.share)||0;
          hhi+=sh*sh*10000;
        });

        var topFormats=Object.keys(fmtShare).sort(function(a,b){return fmtShare[b]-fmtShare[a];}).slice(0,5).map(function(f){
          return {format:f, share:fmtShare[f]};
        });

        return {
          ok:true,
          steps:steps,
          year:G.year,
          period:G.period,
          nBook:book.length,
          nCommDial:comm.length,
          nInst:inst.length,
          amCommercial:amComm,
          fmCommercial:fmComm,
          fmtCounts:fmtCounts,
          spanish:spanish,
          spanishLaneShare:spanishLaneShare,
          topShare:topShare,
          top5Share:top5Share,
          hhi:hhi,
          midTierCompetitors:midTier,
          topFormats:topFormats,
          ranker:ranker,
          relNet:inst.filter(function(s){return s.format==='RELIGIOUS_NETWORK'||s.isReligiousNetwork;}).length,
        };
      })()`,
      ctx,
    );
  } finally {
    Math.random = origR;
  }
}

export function runReferencePanel({ markets, years, seed }) {
  const ctx = loadSimContext(seed);
  const cells = [];
  for (const marketId of markets) {
    for (const year of years) {
      const snap = runMarketYearSnapshot(ctx, marketId, year, seed);
      cells.push({ marketId, year, ...snap });
    }
  }
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      seed,
      markets,
      years,
      genEra: GEN_ERA,
    },
    cells,
  };
}
