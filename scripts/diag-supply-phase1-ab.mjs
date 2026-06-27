#!/usr/bin/env node
/**
 * Station Supply Phase 1 A/B — baseline vs anchor+replenishment POC.
 *
 *   npm run diag:supply-phase1-ab
 *   node scripts/diag-supply-phase1-ab.mjs --runs=12 --quick=0
 *
 * Artifacts: tmp/supply_phase1_ab_summary.md, .json, .csv
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
const outMd = path.join(root, 'tmp', 'supply_phase1_ab_summary.md');
const outJson = path.join(root, 'tmp', 'supply_phase1_ab_summary.json');
const outCsv = path.join(root, 'tmp', 'supply_phase1_ab_per_market.csv');

const DEFAULT_MARKETS = ['houston', 'phoenix', 'dallas', 'atlanta', 'seattle', 'chicago'];
const CHECKPOINTS = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2026];
const END_YEAR = 2026;
const END_PERIOD = 2;
const MAX_STEPS = 100;
const DEFAULT_RUNS = 8;
const DEFAULT_SEED = 20260627;

const REPLENISH_FAMILY_FAIL = ['spanish', 'brokered', 'religious'];
const REPLENISH_FAMILY_FAIL_PCT = 0.5;
const REPLENISH_FAMILY_MAX_PCT = 0.40;
const REPLENISH_FAMILY_MIN_LAUNCHES = 5;

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
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
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = Math.floor(Math.random() * 256);
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

function parseArgs(argv) {
  const o = {
    markets: DEFAULT_MARKETS.slice(),
    runs: DEFAULT_RUNS,
    seed: DEFAULT_SEED,
    quick: true,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) {
      o.markets = String(a.slice('--markets='.length)).split(',').map((x) => x.trim()).filter(Boolean);
    } else if (a.startsWith('--runs=')) {
      o.runs = Math.max(1, parseInt(a.slice('--runs='.length), 10) || DEFAULT_RUNS);
    } else if (a.startsWith('--seed=')) {
      o.seed = parseInt(a.slice('--seed='.length), 10) || DEFAULT_SEED;
    } else if (a === '--quick=0' || a === '--quick=false') {
      o.quick = false;
    }
  }
  if (o.quick) o.runs = Math.min(o.runs, 4);
  return o;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pct(x, digits = 2) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(injectHeadlessMegaFragNewsGuard(readFileSync(legacyPath, 'utf8')), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);

  const inner = `
  (function(){
    var MARKETS_RUN=${JSON.stringify(opts.markets)};
    var RUNS=${opts.runs};
    var SEED=${opts.seed};
    var CHECKPOINTS=${JSON.stringify(CHECKPOINTS)};
    var END_YEAR=${END_YEAR};
    var END_PERIOD=${END_PERIOD};
    var MAX_STEPS=${MAX_STEPS};
    var REPLENISH_FAMILY_FAIL=${JSON.stringify(REPLENISH_FAMILY_FAIL)};
    var REPLENISH_FAMILY_FAIL_PCT=${REPLENISH_FAMILY_FAIL_PCT};
    var REPLENISH_FAMILY_MAX_PCT=${REPLENISH_FAMILY_MAX_PCT};
    var REPLENISH_FAMILY_MIN_LAUNCHES=${REPLENISH_FAMILY_MIN_LAUNCHES};

    function commercialStations(G){
      return (G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&!s.isPublic;
      });
    }
    function isSpanishFmt(fmt){
      return typeof spanishCompositionIsSpanishLaneFmt==='function'&&spanishCompositionIsSpanishLaneFmt(fmt);
    }
    function formatFamilies(G){
      var set={};
      commercialStations(G).forEach(function(s){
        if(s&&s.format)set[s.format]=true;
      });
      return Object.keys(set).length;
    }
    function spanishLaneShare(G){
      var sum=0;
      commercialStations(G).forEach(function(s){
        if(s&&isSpanishFmt(s.format))sum+=Number(s.rat&&s.rat.share)||0;
      });
      return sum;
    }
    function shareStats(G){
      var comm=commercialStations(G);
      var shares=comm.map(function(s){return Number(s.rat&&s.rat.share)||0;}).sort(function(a,b){return b-a;});
      var top1=shares.length?shares[0]:0;
      var top5=shares.slice(0,5).reduce(function(a,b){return a+b;},0);
      var over15=shares.filter(function(x){return x>=0.15;}).length;
      var over8=shares.filter(function(x){return x>=0.08;}).length;
      return {top1:top1,top5:top5,over15:over15,over8:over8,nRanked:shares.length};
    }
    function lfpCap(mktId){
      return typeof countUsableCommercialDialSlots==='function'?countUsableCommercialDialSlots(mktId):99;
    }
    function snapshot(G, mktId){
      var h=typeof marketHealthSnapshot==='function'?marketHealthSnapshot(G):{commercial:0};
      var sh=shareStats(G);
      var removed=G._attritionRemovedCumulative||0;
      var replen=G._attritionReplenishLaunchedCumulative||0;
      return {
        commercial:h.commercial,
        active:h.active,
        public:h.public,
        zombie:h.zombie,
        nicheSurvival:h.nicheSurvival,
        removedCumulative:removed,
        replenishedCumulative:replen,
        netShrink:removed-replen,
        leaderShare:sh.top1,
        top5ShareMass:sh.top5,
        countShareOver8pct:sh.over8,
        countShareOver15pct:sh.over15,
        formatFamilies:formatFamilies(G),
        spanishLaneShare:spanishLaneShare(G),
        lfpCap:lfpCap(mktId),
        replenishByFamily:G._attritionReplenishLaunchedByFamily?JSON.parse(JSON.stringify(G._attritionReplenishLaunchedByFamily||{})):{},
        queueLen:(G._attritionReplenishQueue||[]).length,
      };
    }
    function runOne(marketId, runIdx, arm){
      var phase1=arm==='phase1';
      var s=SEED+runIdx*9973+(phase1?500000:0)+MARKETS_RUN.indexOf(marketId)*7919;
      Math.random=function(){
        s=(s*9301+49297)%233280;
        return s/233280;
      };
      var rows=[];
      var finalSnap=null;
      ACTIVE_MARKET=marketId;
      syncMarketPopToMarket(marketId);
      G=genMarketMP('1985',{supplyPhase1Enabled:phase1});
      G._supplyPhase1Enabled=phase1;
      MP.mode='solo';
      var steps=0;
      try{
        while(steps<MAX_STEPS){
          if(G.year>END_YEAR||(G.year===END_YEAR&&G.period>END_PERIOD))break;
          var ui=window._harnessPatchTimersAndUi();
          try{ advTurn(); }finally{ ui.restore(); }
          steps++;
          if(G.year>END_YEAR||(G.year===END_YEAR&&G.period>END_PERIOD))break;
          if(CHECKPOINTS.indexOf(G.year)>=0&&G.period===2){
            var snap=snapshot(G,marketId);
            snap.year=G.year;
            snap.arm=arm;
            snap.marketId=marketId;
            snap.run=runIdx;
            rows.push(snap);
          }
        }
        finalSnap=snapshot(G,marketId);
        finalSnap.year=G.year;
        finalSnap.arm=arm;
        finalSnap.marketId=marketId;
        finalSnap.run=runIdx;
      } catch(e) {
        finalSnap={error:String(e&&e.message||e),marketId:marketId,arm:arm,run:runIdx};
      }
      return {rows:rows,final:finalSnap};
    }

    var allRows=[];
    var finals=[];
    for(var mi=0;mi<MARKETS_RUN.length;mi++){
      var mkt=MARKETS_RUN[mi];
      for(var r=0;r<RUNS;r++){
        ['baseline','phase1'].forEach(function(arm){
          var out=runOne(mkt,r,arm);
          allRows=allRows.concat(out.rows);
          finals.push(out.final);
        });
      }
    }

    function agg(rows, year, arm, mkt){
      var sel=rows.filter(function(x){
        return x.year===year&&x.arm===arm&&x.marketId===mkt;
      });
      if(!sel.length)return null;
      var keys=['commercial','leaderShare','top5ShareMass','formatFamilies','spanishLaneShare','removedCumulative','replenishedCumulative','netShrink','countShareOver15pct','nicheSurvival'];
      var o={n:sel.length};
      keys.forEach(function(k){
        o[k]=sel.reduce(function(a,x){return a+(x[k]||0);},0)/sel.length;
      });
      return o;
    }

    function replenishFamilyPct(finals, arm, mkt){
      var totals={};
      var n=0;
      finals.filter(function(x){return x.arm===arm&&x.marketId===mkt;}).forEach(function(x){
        var fam=x.replenishByFamily||{};
        Object.keys(fam).forEach(function(k){
          totals[k]=(totals[k]||0)+fam[k];
          n+=fam[k];
        });
      });
      var pct={};
      Object.keys(totals).forEach(function(k){pct[k]=n>0?totals[k]/n:0;});
      return {totals:totals,totalLaunches:n,pct:pct};
    }

    var report={markets:[],pass:null,failReasons:[]};
    var csvLines=['market,arm,year,commercial,leaderShare,top5ShareMass,formatFamilies,spanishLaneShare,removedCumulative,replenishedCumulative,netShrink'];

    MARKETS_RUN.forEach(function(mkt){
      var entry={
        marketId:mkt,
        baseline2000:agg(allRows,2000,'baseline',mkt),
        phase1_2000:agg(allRows,2000,'phase1',mkt),
        baseline2026:agg(allRows,2026,'baseline',mkt),
        phase1_2026:agg(allRows,2026,'phase1',mkt),
        replenishFamilies:replenishFamilyPct(finals,'phase1',mkt),
        lfpCap:typeof countUsableCommercialDialSlots==='function'?countUsableCommercialDialSlots(mkt):null,
      };
      report.markets.push(entry);
      allRows.filter(function(x){return x.marketId===mkt;}).forEach(function(x){
        csvLines.push([
          x.marketId,x.arm,x.year,
          x.commercial.toFixed(2),
          (x.leaderShare*100).toFixed(2),
          (x.top5ShareMass*100).toFixed(2),
          x.formatFamilies,
          (x.spanishLaneShare*100).toFixed(2),
          x.removedCumulative,
          x.replenishedCumulative,
          x.netShrink,
        ].join(','));
      });
    });

    var invPass=0;
    var ecoPass=0;
    report.markets.forEach(function(e){
      var b26=e.baseline2026, p26=e.phase1_2026, b00=e.baseline2000, p00=e.phase1_2000;
      if(!b26||!p26||!b00||!p00)return;
      if(p26.commercial>=b26.commercial&&p26.commercial>=p00.commercial)invPass++;
      if(p26.leaderShare<=b26.leaderShare-0.015||p26.top5ShareMass<=b26.top5ShareMass-0.03)ecoPass++;
      if(e.marketId==='houston'&&p26.commercial>=30&&p26.commercial<=e.lfpCap)invPass+=0.5;
      if(p26.commercial>e.lfpCap-0.5){
        report.failReasons.push(e.marketId+': commercial exceeds LFP cap @ 2026');
      }
      var fam=e.replenishFamilies;
      if(fam.totalLaunches>=REPLENISH_FAMILY_MIN_LAUNCHES){
        Object.keys(fam.pct).forEach(function(fk){
          if((fam.pct[fk]||0)>=REPLENISH_FAMILY_MAX_PCT){
            report.failReasons.push(e.marketId+': replenishment '+fk+' '+Math.round(fam.pct[fk]*100)+'% exceeds '+Math.round(REPLENISH_FAMILY_MAX_PCT*100)+'% cap');
          }
        });
      }
      if(fam.totalLaunches>=3){
        REPLENISH_FAMILY_FAIL.forEach(function(fk){
          if((fam.pct[fk]||0)>=REPLENISH_FAMILY_FAIL_PCT){
            report.failReasons.push(e.marketId+': replenishment '+fk+' '+Math.round(fam.pct[fk]*100)+'%');
          }
        });
      }
    });

    report.pass=report.failReasons.length===0&&invPass>=4&&ecoPass>=3;
    report.scorecard={inventoryPassMarkets:invPass,ecologyPassMarkets:ecoPass};
    report.runErrors=finals.filter(function(x){return x&&x.error;}).map(function(x){
      return {marketId:x.marketId,arm:x.arm,run:x.run,error:x.error};
    });
    report.rowCount=allRows.length;

    return {report:report,csv:csvLines.join('\\n'),rows:allRows.length,finals:finals};
  })();
  `;

  const result = vm.runInContext(inner, ctx);
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const md = [];
  md.push('# Station Supply Phase 1 A/B Summary');
  md.push('');
  md.push(`Markets: ${opts.markets.join(', ')} · runs/market/arm: ${opts.runs} · seed: ${opts.seed}`);
  md.push('');
  md.push(`**Overall:** ${result.report.pass ? 'PASS' : 'FAIL'}`);
  if (result.report.failReasons.length) {
    md.push('');
    md.push('**Fail triggers:**');
    result.report.failReasons.forEach((r) => md.push(`- ${r}`));
  }
  md.push('');
  md.push('| Market | B comm @2000 | P1 comm @2000 | B comm @2026 | P1 comm @2026 | B #1 | P1 #1 | B top5 | P1 top5 | Replen fam |');
  md.push('|--------|-------------|--------------|-------------|--------------|------|-------|--------|---------|------------|');
  for (const e of result.report.markets) {
    const b0 = e.baseline2000;
    const p0 = e.phase1_2000;
    const b6 = e.baseline2026;
    const p6 = e.phase1_2026;
    const fam = e.replenishFamilies;
    const famStr = fam.totalLaunches
      ? Object.entries(fam.pct).map(([k, v]) => `${k}:${pct(v, 0)}`).join(' ')
      : '—';
    md.push(
      `| ${e.marketId} | ${b0 ? b0.commercial.toFixed(1) : '—'} | ${p0 ? p0.commercial.toFixed(1) : '—'} | ${b6 ? b6.commercial.toFixed(1) : '—'} | ${p6 ? p6.commercial.toFixed(1) : '—'} | ${b6 ? pct(b6.leaderShare) : '—'} | ${p6 ? pct(p6.leaderShare) : '—'} | ${b6 ? pct(b6.top5ShareMass) : '—'} | ${p6 ? pct(p6.top5ShareMass) : '—'} | ${famStr} |`,
    );
  }
  md.push('');
  md.push('## Replacement format-family distribution (phase1 arm, run totals)');
  for (const e of result.report.markets) {
    const fam = e.replenishFamilies;
    md.push(`- **${e.marketId}**: ${fam.totalLaunches} launches — ${JSON.stringify(fam.pct)}`);
  }

  md.push('');
  md.push('## Scorecard @ 2026 (means, baseline → phase1 → delta)');
  md.push('');
  md.push('| Market | Metric | Baseline | Phase 1 | Delta |');
  md.push('|--------|--------|----------|---------|-------|');
  const scoreMetrics = [
    ['Commercial stations', 'commercial', (v) => v.toFixed(1)],
    ['Removed cumulative', 'removedCumulative', (v) => v.toFixed(1)],
    ['Replenished cumulative', 'replenishedCumulative', (v) => v.toFixed(1)],
    ['#1 share', 'leaderShare', (v) => pct(v)],
    ['Top-5 mass', 'top5ShareMass', (v) => pct(v)],
    ['Spanish lane share', 'spanishLaneShare', (v) => pct(v)],
    ['Format-family count', 'formatFamilies', (v) => v.toFixed(1)],
    ['Niche count', 'nicheSurvival', (v) => v.toFixed(1)],
  ];
  for (const e of result.report.markets) {
    const b = e.baseline2026;
    const p = e.phase1_2026;
    for (const [label, key, fmt] of scoreMetrics) {
      const bv = b ? b[key] : null;
      const pv = p ? p[key] : null;
      let delta = '—';
      if (bv != null && pv != null && typeof bv === 'number' && typeof pv === 'number') {
        if (key === 'leaderShare' || key === 'top5ShareMass' || key === 'spanishLaneShare') {
          delta = `${((pv - bv) * 100).toFixed(2)} pp`;
        } else {
          delta = (pv - bv).toFixed(1);
        }
      }
      md.push(
        `| ${e.marketId} | ${label} | ${bv != null ? fmt(bv) : '—'} | ${pv != null ? fmt(pv) : '—'} | ${delta} |`,
      );
    }
  }

  const outScorecard = path.join(root, 'tmp', 'supply_phase1_ab_scorecard.md');
  writeFileSync(outScorecard, md.slice(md.indexOf('## Scorecard')).join('\n'), 'utf8');

  writeFileSync(outMd, md.join('\n'), 'utf8');
  writeFileSync(outJson, JSON.stringify(result.report, null, 2), 'utf8');
  writeFileSync(outCsv, result.csv, 'utf8');

  console.log(`Supply Phase 1 A/B · ${result.report.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outCsv}`);
  console.log(`Wrote ${outScorecard}`);
  console.log('');
  console.log(md.join('\n'));
}

main();
