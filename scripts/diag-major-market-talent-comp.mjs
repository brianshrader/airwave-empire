#!/usr/bin/env node
/**
 * Focused compensation diagnostic for major-market talent pay (rank-tier caps, Fall COLA/perf,
 * renewal leverage + contract modal economics). Does not tune constants — reports only.
 *
 *   node scripts/diag-major-market-talent-comp.mjs
 *
 * Output: stdout + tmp/diag_major_market_talent_comp.txt
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const outTxt = path.join(root, 'tmp', 'diag_major_market_talent_comp.txt');

function loadLegacySrc() {
  const src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  return src;
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
    getAttribute() {
      return null;
    },
    setAttribute() {},
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
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

const SCENARIOS = [
  {
    id: 1,
    label: 'Wichita weak station, average midday talent, 2006',
    marketId: 'wichita',
    year: 2006,
    slot: 'midday',
    share: 0.028,
    bookRank: '~#6 / weak book',
    revAnnualM: 1.9,
    ebitdaAnnualM: 0.15,
    trueQ: 56,
    dispQ: 56,
    salary: 24500,
    morale: 68,
    cyr: 2,
    superstar: false,
    rngSeed: 0x51a00101,
  },
  {
    id: 2,
    label: 'Wichita #1 station, strong morning talent, 2006',
    marketId: 'wichita',
    year: 2006,
    slot: 'morningDrive',
    share: 0.135,
    bookRank: '#1',
    revAnnualM: 5.2,
    ebitdaAnnualM: 2.1,
    trueQ: 84,
    dispQ: 83,
    salary: 92000,
    morale: 78,
    cyr: 2,
    superstar: false,
    rngSeed: 0x51a00202,
  },
  {
    id: 3,
    label: 'Nashville strong station, strong morning talent, 2010',
    marketId: 'nashville',
    year: 2010,
    slot: 'morningDrive',
    share: 0.102,
    bookRank: '#2 / strong',
    revAnnualM: 14.5,
    ebitdaAnnualM: 5.8,
    trueQ: 88,
    dispQ: 87,
    salary: 108000,
    morale: 80,
    cyr: 2,
    superstar: false,
    rngSeed: 0x51a00303,
  },
  {
    id: 4,
    label: 'San Francisco top-5 station, strong afternoon talent, 2010',
    marketId: 'sanfrancisco',
    year: 2010,
    slot: 'afternoonDrive',
    share: 0.092,
    bookRank: '#4 / top-5',
    revAnnualM: 19.5,
    ebitdaAnnualM: 9.2,
    trueQ: 87,
    dispQ: 90,
    salary: 98500,
    morale: 76,
    cyr: 2,
    superstar: false,
    rngSeed: 0x51a00404,
  },
  {
    id: 5,
    label: 'New York top-3 station, elite morning talent, 2010',
    marketId: 'newyork',
    year: 2010,
    slot: 'morningDrive',
    share: 0.118,
    bookRank: '#2 / top-3',
    revAnnualM: 42,
    ebitdaAnnualM: 18.5,
    trueQ: 96,
    dispQ: 95,
    salary: 185000,
    morale: 82,
    cyr: 2,
    superstar: false,
    rngSeed: 0x51a00505,
  },
  {
    id: 6,
    label: 'New York mid-pack station, average talent, 2010',
    marketId: 'newyork',
    year: 2010,
    slot: 'morningDrive',
    share: 0.051,
    bookRank: '~#9 / mid-pack',
    revAnnualM: 8.2,
    ebitdaAnnualM: 2.4,
    trueQ: 61,
    dispQ: 60,
    salary: 54000,
    morale: 66,
    cyr: 2,
    superstar: false,
    rngSeed: 0x51a00606,
  },
];

const RUNNER_JS = `
(function(scenarios){
  function oldFallBaseInfl(y){
    return y<=1980?0.012:y<=1990?0.018:y<=2000?0.015:y<=2010?0.010:0.008;
  }
  function oldFallPerfShare(sh){
    return sh>0.12?0.008:sh>0.08?0.004:sh>0.05?0.002:0;
  }
  function fmtMoney(n){
    if(typeof f$==='function')return f$(n);
    var x=Number(n);
    if(!Number.isFinite(x))return '$—';
    if(Math.abs(x)>=1e6)return '$'+(Math.round(x/1e5)/10)+'M';
    if(Math.abs(x)>=1e3)return '$'+(Math.round(x/100)/10)+'K';
    return '$'+Math.round(x);
  }
  function pct(x){
    return (Math.round(x*10000)/100).toFixed(2)+'%';
  }
  var out=[];
  out.push('Major-market talent compensation diagnostic');
  out.push('Generated by scripts/diag-major-market-talent-comp.mjs (read-only; no tuning)');
  out.push('');
  if(!G)G={news:[],stations:[],ps:[],cash:0,year:1970,marketId:'atlanta',period:1,tutorialMode:false};
  if(!G.news)G.news=[];
  scenarios.forEach(function(sc){
    G.marketId=sc.marketId;
    G.year=sc.year;
    G.period=2;
    G.cash=8e7;
    G.tutorialMode=false;
    var slot=sc.slot;
    var stShare=sc.share;
    var hireY=G.year-8;
    var t={
      id:'diag-tal-'+sc.id,
      name:'Synthetic Host',
      quality:sc.dispQ,
      _trueQuality:sc.trueQ,
      salary:sc.salary,
      cyr:sc.cyr!=null?sc.cyr:2,
      morale:sc.morale!=null?sc.morale:70,
      slot:slot,
      superstar:!!sc.superstar,
      periodsAtStation:16,
      _hireYear:hireY,
    };
    var s={
      id:'diag-st-'+sc.id,
      callLetters:'KZZZ',
      format:'CHR',
      isPlayer:true,
      rat:{share:stShare},
      prog:{},
    };
    s.prog[slot]={talent:t,quality:Math.min(100,sc.dispQ+4)};
    G.stations=[s];
    G.ps=[s];

    var mkt=MARKETS[sc.marketId]||{};
    var rankTier=mkt.rankTier||'medium';

    var tenureYrsForCap=G.year-hireY;
    var tenureCapMult=1.00+Math.min(0.18, Math.max(0,tenureYrsForCap-12)*0.012);
    var capPair=eliteTalentIncumbentPremiumMults(t,slot,stShare);
    var capEl=capPair[0];
    var baseSlot=slotStarMaxBaseForDaypart(slot);
    var rankM=marketRankTierOnAirPayMult(sc.marketId);
    var slotBx=Math.round(baseSlot*rankM);
    var oldCap=Math.round(salInfl(baseSlot,G.year)*tenureCapMult*capEl/500)*500;
    var newCap=Math.round(salInfl(slotBx,G.year)*tenureCapMult*capEl/500)*500;

    var newCola=talentFallBaseInflationForMarket(G.year,sc.marketId);
    var newPerf=talentFallPerfPressureFromShare(stShare,sc.marketId);
    var oldCola=oldFallBaseInfl(G.year);
    var oldPerf=oldFallPerfShare(stShare);
    var tqMerit=talentTrueQuality(t);
    var merit=tqMerit>85?0.008:tqMerit>72?0.004:0.001;
    var moraleMod=t.morale<50?0.004:t.morale>80?-0.002:0;
    var vtSal=0;
    var fallMultNew=1+newCola+merit+newPerf+moraleMod+vtSal;
    var fallMultOld=1+oldCola+merit+oldPerf+moraleMod+vtSal;

    var lev=talentRenewalLeverage01(s,slot,t,false);
    var eliteQ=!!eliteCompQualifiesForPremium(t,slot);
    var renewAnch=eliteRenewalAnchorAnnual(s,slot,t);

    var saved=Math.random;
    var seed=(sc.rngSeed>>>0)||1;
    Math.random=function(){
      seed=(seed*1664525+1013904223)>>>0;
      return seed/4294967296;
    };
    var ce;
    try{ ce=buildContractEconObject(s,slot,t,false,t); }
    catch(e){ ce={err:String(e&&e.message||e)}; }
    Math.random=saved;

    var ext3=ce&&ce.ext3Annual!=null?fmtMoney(ce.ext3Annual):'—';
    var ext2=ce&&ce.ext2Annual!=null?fmtMoney(ce.ext2Annual):'—';
    var ext1=ce&&ce.ext1Annual!=null?fmtMoney(ce.ext1Annual):'—';

    out.push('=== Case '+sc.id+': '+sc.label+' ===');
    out.push('Market: '+sc.marketId+'  rankTier: '+rankTier+'  year: '+G.year+'  daypart: '+slot);
    out.push('Book: '+sc.bookRank+'  share: '+pct(stShare)+'  (synthetic rev ~$'+sc.revAnnualM+'M/yr, EBITDA ~$'+sc.ebitdaAnnualM+'M/yr — narrative only, not full sim)');
    out.push('Talent: trueQ '+sc.trueQ+'  dispQ '+sc.dispQ+'  morale '+t.morale+'  salary '+fmtMoney(t.salary)+'/yr  tenureYrs@station~'+(tenureYrsForCap));
    out.push('Elite premium (qualifies): '+(eliteQ?'YES':'no')+'  eliteRenewalAnchor: '+(renewAnch!=null?fmtMoney(renewAnch):'—'));
    out.push('Incumbent cap anchor: baseSlot '+fmtMoney(baseSlot)+' (1970-scale) × rankMult '+rankM.toFixed(3)+' → inflated slotBx '+fmtMoney(slotBx));
    out.push('Salary cap (old formula, no rank on anchor): '+fmtMoney(oldCap)+'  |  new cap: '+fmtMoney(newCap));
    out.push('Fall (half-year) mult — OLD: '+fallMultOld.toFixed(5)+' (cola '+oldCola+' + perf '+Number(oldPerf).toFixed(5)+' + merit '+merit+' + mor '+moraleMod+')');
    out.push('Fall (half-year) mult — NEW: '+fallMultNew.toFixed(5)+' (cola '+newCola+' + perf '+Number(newPerf).toFixed(5)+' + merit '+merit+' + mor '+moraleMod+')');
    out.push('Renewal leverage01: '+lev.toFixed(3)+(lev>=0.28?'  (≥0.28 → short-deal premium in contract UI)':''));
    out.push('Renewal offers (deterministic seed '+('0000000'+((sc.rngSeed>>>0).toString(16))).slice(-8)+'): 1yr '+ext1+'  |  2yr '+ext2+'  |  3yr '+ext3);
    if(ce&&ce.err)out.push('Contract econ error: '+ce.err);
    out.push('');
  });

  out.push('--- Success criteria (manual) ---');
  out.push('• Small-market average (case 1): Fall mult / caps / renewals should stay modest vs big-market.');
  out.push('• Big-market average mid-pack (case 6): offers should not explode vs case 1.');
  out.push('• Strong/elite drive in SF/NY (cases 4–5): newCap and/or renewals should allow $100K+ where talent is strong.');
  out.push('• Top-market renewals (cases 3–5): leverage ≥0.28 more often; 1yr > 3yr annual in several rows.');
  out.push('• No runaway: compare 1yr offers across cases — NY elite should lead, Wichita weak trail.');
  return out.join('\\n');
})
`;

function main() {
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx);
  const text = vm.runInContext(`${RUNNER_JS}(${JSON.stringify(SCENARIOS)})`, ctx);
  console.log(text);
  writeFileSync(outTxt, `${text}\n`, 'utf8');
  console.log(`\nWrote ${outTxt}`);
}

main();
