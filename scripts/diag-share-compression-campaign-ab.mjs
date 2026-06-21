#!/usr/bin/env node
/**
 * Dynamic campaign A/B — baseline vs share compression Phase 1 only (no rivalry).
 *
 * Paired RNG: same seed, two VM contexts. Cold-start chrwar → target year → post-run
 * ecology window. Answers whether compression holds in long-run equilibrium, not just
 * on frozen books.
 *
 *   npm run diag:share-compression-campaign
 *   node scripts/diag-share-compression-campaign-ab.mjs --quick
 *   node scripts/diag-share-compression-campaign-ab.mjs --runs=30 --post-periods=24
 *
 * Artifacts: tmp/share_compression_campaign_ab.json, .md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectHeadlessLaunchNewsGuard } from './diag-share-decomposition-lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const phase1Path = path.join(root, 'src', 'shareCompressionPhase1.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const outJson = path.join(root, 'tmp', 'share_compression_campaign_ab.json');
const outMd = path.join(root, 'tmp', 'share_compression_campaign_ab.md');

const DEFAULT_RUNS = 24;
const DEFAULT_SEED = 20260621;
const DEFAULT_POST_PERIODS = 24; // 12 years @ 2 periods/year
const MAX_ADVANCE_STEPS = 420;
const SCENARIO = 'chrwar';

const CELLS = [
  { marketId: 'nashville', targetYear: 2003 },
  { marketId: 'newyork', targetYear: 2010 },
  { marketId: 'phoenix', targetYear: 2026 },
  { marketId: 'wichita', targetYear: 2010 },
];

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

function createVmContext(sharePhase1) {
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, info: () => {}, error: console.error, table: () => {} },
    __WL_HEADLESS__: true,
    __WL_SHARE_COMPRESSION_PHASE1: sharePhase1,
    __WL_RIVALRY_PROTOTYPE: false,
    globalThis: null, window: null, document: documentStub,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { reload: () => {}, search: '', href: '' },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0; },
    setInterval: () => 0, clearTimeout: () => {}, clearInterval: () => {},
    requestAnimationFrame: (fn) => { if (typeof fn === 'function') fn(); },
    alert: () => {}, fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    crypto: {
      getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; },
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
    },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
    parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined, Int8Array, Uint8Array, Buffer, Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function loadCtx(sharePhase1) {
  const ctx = createVmContext(sharePhase1);
  injectMarketEcologyIife(ctx);
  const src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { filename: 'talentRetention.js', timeout: 300_000 });
  if (sharePhase1) {
    vm.runInContext(readFileSync(phase1Path, 'utf8'), ctx, { filename: 'shareCompressionPhase1.js' });
  }
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  vm.runInContext('showToast=function(){}; showToastWithSubscribeCta=function(){};', ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED, postPeriods: DEFAULT_POST_PERIODS, quick: false };
  for (const a of argv) {
    if (a === '--quick') { o.quick = true; o.runs = 6; o.postPeriods = 12; }
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
    else if (a.startsWith('--post-periods=')) o.postPeriods = Math.max(1, parseInt(a.slice(15), 10) || DEFAULT_POST_PERIODS);
  }
  return o;
}

function mean(xs) {
  const v = xs.filter((x) => x != null && !Number.isNaN(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function pct(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(d)}%`;
}

function ptDelta(a, b) {
  if (a == null || b == null) return '—';
  const d = (b - a) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)} pt`;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

const RUN_IIFE = `
(function(MAX_STEPS, POST_PERIODS, SCENARIO){
  function commercialBook(stations,G){
    var comm=(stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'
        &&!stationIsNoncommercialInstitutional(s)&&s.rat&&typeof s.rat.share==='number';
    });
    var shares=comm.map(function(s){return Number(s.rat.share)||0;}).filter(function(x){return x>=0;});
    shares.sort(function(a,b){return b-a;});
    var sh1=shares[0]||0,top3=0,hhi=0,ge15=0,ge20=0,i;
    for(i=0;i<shares.length;i++){
      if(i<3)top3+=shares[i];
      hhi+=shares[i]*shares[i];
      if(shares[i]>=0.15)ge15++;
      if(shares[i]>=0.20)ge20++;
    }
    return {
      nComm:comm.length,share1:sh1,top3:top3,hhi:Math.round(hhi*10000),
      ge15:ge15,ge20:ge20,bookSum:shares.reduce(function(a,b){return a+b;},0),
    };
  }
  function econSnapshot(G){
    var comm=(G.stations||[]).filter(function(s){return s&&!s._bpSlotDeferred&&!s.isPublic&&s.fin;});
    var rev=0,ebitda=0,weak=0,zombie=0,distress=0,bankruptLike=0;
    comm.forEach(function(s){
      rev+=(s.fin.rev||0);
      ebitda+=(s.fin.ebitda||0);
      var h=typeof classifyCommercialHealthDiagnostic==='function'?classifyCommercialHealthDiagnostic(s):'';
      if(h==='weak')weak++;
      if(h==='zombie'){zombie++;bankruptLike++;}
      if(s.isZombie||s.isNicheSurvival){distress++;if(s.isZombie)bankruptLike++;}
    });
    var cashVals=comm.map(function(s){return Number(s.pers&&s.pers.cash)||0;}).filter(function(x){return isFinite(x);});
    var avgCash=cashVals.length?cashVals.reduce(function(a,b){return a+b;},0)/cashVals.length:0;
    return {
      commRev:rev,commEbitda:ebitda,meanStationEbitda:comm.length?ebitda/comm.length:0,
      weak:weak,zombie:zombie,distress:distress,bankruptLike:bankruptLike,avgOwnerCash:avgCash,
    };
  }
  function playerSnapshot(G){
    var ps=(G.ps||[]).filter(function(s){return s&&s.isPlayer&&s.rat;});
    var pShare=ps.reduce(function(a,s){return a+(s.rat.share||0);},0);
    var comm=(G.stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&!s.isPublic&&s.rat;
    });
    var sh1=0;
    comm.forEach(function(s){if((s.rat.share||0)>sh1)sh1=s.rat.share||0;});
    var midBand=0,canChallenge=0;
    comm.forEach(function(s){
      var sh=s.rat.share||0;
      if(sh>=0.03&&sh<=0.06)midBand++;
      if(sh>=0.03&&sh<=0.06&&(sh1-sh)<=0.12)canChallenge++;
    });
    return {playerShare:pShare,leaderShare:sh1,midBand3to6:midBand,canChallengeFromMidBand:canChallenge,playerStations:ps.length};
  }
  function scanNews(news){
    var flips=0,launches=0;
    (news||[]).forEach(function(n){
      var t=String(n&&n.t||'');
      if(/flips|→|reformat/i.test(t))flips++;
      if(/signs on|debuts| launches |new .* station|📻.*AM |📻.*FM /i.test(t))launches++;
    });
    return {flips:flips,launches:launches};
  }
  function laneLeaderThresholds(stations){
    var byFmt={};
    (stations||[]).filter(function(s){return s&&!s._bpSlotDeferred&&!s.isPublic&&s.rat;}).forEach(function(s){
      var f=String(s.format||'');
      var sh=s.rat.share||0;
      if(!byFmt[f]||sh>byFmt[f])byFmt[f]=sh;
    });
    var ge12=0,ge15=0,ge18=0;
    Object.keys(byFmt).forEach(function(f){
      var sh=byFmt[f];
      if(sh>=0.12)ge12++;
      if(sh>=0.15)ge15++;
      if(sh>=0.18)ge18++;
    });
    return {laneLeadersGe12:ge12,laneLeadersGe15:ge15,laneLeadersGe18:ge18};
  }
  function snap(G){
    var book=commercialBook(G.stations,G);
    return {
      year:G.year,period:G.period,
      book:book,
      econ:econSnapshot(G),
      player:playerSnapshot(G),
      lanes:laneLeaderThresholds(G.stations),
    };
  }
  function advanceToYear(y){
    var steps=0;
    while(steps<MAX_STEPS){
      if(G.year===y&&G.period===1) return {ok:true,steps:steps};
      if(G.year>y) return {ok:false,reason:'overshot',steps:steps};
      var ui=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui.restore();}
      steps++;
    }
    return {ok:false,reason:'max_steps',steps:steps};
  }
  function runCampaign(marketId,targetYear,seedVal){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    var sc=SC.find(function(x){return x.id===SCENARIO;});
    var oi=sc.idx; sc.idx=[];
    G=genMarket(SCENARIO);
    sc.idx=oi;
    G.marketId=marketId;
    G.stations.forEach(function(st){st.isPlayer=false;});
    var top40=G.stations.filter(function(st){return st&&!st.isPublic&&st.format==='TOP40';});
    if(top40.length){top40[0].isPlayer=true; G.ps=[top40[0]];} else G.ps=[];
    var newsStart=(G.news||[]).length;
    var adv=advanceToYear(targetYear);
    if(!adv.ok) return {ok:false,reason:adv.reason||'advance_failed',seed:seedVal};
    var entry=snap(G);
    var peakShare1=entry.book.share1;
    var peakGe20=entry.book.ge20;
    var ecology={flips:0,launches:0,rivalWatchPeriods:0,laneTrigger12:0};
    var trail=[];
    for(var t=0;t<POST_PERIODS;t++){
      var y0=G.year,p0=G.period;
      var ui2=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui2.restore();}
      var cur=snap(G);
      if(cur.book.share1>peakShare1)peakShare1=cur.book.share1;
      if(cur.book.ge20>peakGe20)peakGe20=cur.book.ge20;
      var newsDelta=(G.news||[]).slice(newsStart);
      var ns=scanNews(newsDelta);
      ecology.flips+=ns.flips;
      ecology.launches+=ns.launches;
      newsStart=(G.news||[]).length;
      ecology.laneTrigger12=Math.max(ecology.laneTrigger12,cur.lanes.laneLeadersGe12);
      if(typeof buildPeriodRivalWatchItems==='function'){
        var rw=buildPeriodRivalWatchItems(G,[]);
        if(rw&&rw.length)ecology.rivalWatchPeriods++;
      }
      if(t%4===3||t===POST_PERIODS-1){
        trail.push({turn:t+1,year:cur.year,period:cur.period,share1:cur.book.share1,top3:cur.book.top3,ge20:cur.book.ge20});
      }
    }
    var exit=snap(G);
    return {
      ok:true,seed:seedVal,marketId:marketId,targetYear:targetYear,
      advanceSteps:adv.steps,postPeriods:POST_PERIODS,
      entry:entry,exit:exit,peakShare1:peakShare1,peakGe20:peakGe20,ecology:ecology,trail:trail,
    };
  }
  return {runCampaign:runCampaign};
})(${MAX_ADVANCE_STEPS}, POST_PERIODS_PLACEHOLDER, ${JSON.stringify(SCENARIO)})
`;

function aggregateRuns(runs) {
  const pick = (fn) => mean(runs.map(fn));
  return {
    n: runs.length,
    entryShare1: pick((r) => r.entry.book.share1),
    exitShare1: pick((r) => r.exit.book.share1),
    peakShare1: pick((r) => r.peakShare1),
    entryTop3: pick((r) => r.entry.book.top3),
    exitTop3: pick((r) => r.exit.book.top3),
    exitHhi: pick((r) => r.exit.book.hhi),
    exitGe15: pick((r) => r.exit.book.ge15),
    exitGe20: pick((r) => r.exit.book.ge20),
    peakGe20: pick((r) => r.peakGe20),
    exitNComm: pick((r) => r.exit.book.nComm),
    ecologyFlips: pick((r) => r.ecology.flips),
    ecologyLaunches: pick((r) => r.ecology.launches),
    rivalWatchPeriods: pick((r) => r.ecology.rivalWatchPeriods),
    laneLeadersGe12: pick((r) => r.exit.lanes.laneLeadersGe12),
    laneLeadersGe15: pick((r) => r.exit.lanes.laneLeadersGe15),
    meanStationEbitda: pick((r) => r.exit.econ.meanStationEbitda),
    distress: pick((r) => r.exit.econ.distress),
    zombie: pick((r) => r.exit.econ.zombie),
    bankruptLike: pick((r) => r.exit.econ.bankruptLike),
    avgOwnerCash: pick((r) => r.exit.econ.avgOwnerCash),
    playerShare: pick((r) => r.exit.player.playerShare),
    midBand3to6: pick((r) => r.exit.player.midBand3to6),
    canChallenge: pick((r) => r.exit.player.canChallengeFromMidBand),
  };
}

function buildMarkdown(report) {
  const lines = [
    '# Share Compression Phase 1 — Dynamic Campaign A/B',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Paired RNG · **baseline vs Phase 1 only** (rivalry off) · chrwar cold start → target year → post window.',
    '',
    `Runs per cell: **${report.runs}** · Post-target periods: **${report.postPeriods}** (${report.postPeriods / 2} years)`,
    '',
    '## Exit-state share concentration (mean across runs)',
    '',
    '| Market | Year | Baseline #1 | Phase1 #1 | Δ#1 | Baseline ≥20% st | Phase1 ≥20% st | Δ≥20% | Peak #1 (P1) |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const cell of report.cells) {
    const b = cell.baseline;
    const p = cell.phase1;
    lines.push(
      `| ${cell.marketId} | ${cell.targetYear} | ${pct(b.exitShare1)} | ${pct(p.exitShare1)} | ${ptDelta(b.exitShare1, p.exitShare1)} | ${b.exitGe20?.toFixed(1) ?? '—'} | ${p.exitGe20?.toFixed(1) ?? '—'} | ${p.exitGe20 != null && b.exitGe20 != null ? (p.exitGe20 - b.exitGe20).toFixed(1) : '—'} | ${pct(p.peakShare1)} |`,
    );
  }
  lines.push('', '## Ecology & economics (exit means)', '');
  lines.push('| Market | Year | Δ flips | Δ launches | Δ distress | Δ zombie | Δ EBITDA/st | Δ player sh | Δ canChallenge |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const cell of report.cells) {
    const b = cell.baseline;
    const p = cell.phase1;
    const d = (a, bv, pv) => (bv != null && pv != null ? (pv - bv).toFixed(1) : '—');
    lines.push(
      `| ${cell.marketId} | ${cell.targetYear} | ${d('f', b.ecologyFlips, p.ecologyFlips)} | ${d('l', b.ecologyLaunches, p.ecologyLaunches)} | ${d('d', b.distress, p.distress)} | ${d('z', b.zombie, p.zombie)} | ${b.meanStationEbitda != null && p.meanStationEbitda != null ? Math.round(p.meanStationEbitda - b.meanStationEbitda).toLocaleString() : '—'} | ${ptDelta(b.playerShare, p.playerShare)} | ${d('c', b.canChallenge, p.canChallenge)} |`,
    );
  }
  lines.push('', '## Interpretation', '', report.interpretation);
  return lines.join('\n');
}

function interpretCell(cell) {
  const b = cell.baseline;
  const p = cell.phase1;
  const d1 = p.exitShare1 != null && b.exitShare1 != null ? (p.exitShare1 - b.exitShare1) * 100 : null;
  const peakAboveExit = p.peakShare1 != null && p.exitShare1 != null ? (p.peakShare1 - p.exitShare1) * 100 : null;
  const parts = [];
  if (d1 != null) {
    if (d1 <= -2) parts.push(`Exit #1 lower by ${Math.abs(d1).toFixed(1)} pt — compression holds at equilibrium.`);
    else if (d1 >= 2) parts.push(`Exit #1 higher by ${d1.toFixed(1)} pt — ecology may be rebuilding kings.`);
    else parts.push(`Exit #1 ~flat (${d1 >= 0 ? '+' : ''}${d1.toFixed(1)} pt) — limited long-run effect.`);
  }
  if (peakAboveExit != null && peakAboveExit >= 2) {
    parts.push(`Peak #1 ran ${peakAboveExit.toFixed(1)} pt above exit (re-concentration within window).`);
  }
  if (p.exitGe20 != null && b.exitGe20 != null && p.exitGe20 < b.exitGe20 - 0.3) {
    parts.push(`Fewer ≥20% stations (${(b.exitGe20 - p.exitGe20).toFixed(1)} mean).`);
  }
  return parts.join(' ');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  const baselineCtx = loadCtx(false);
  const phase1Ctx = loadCtx(true);
  const iife = RUN_IIFE.replace('POST_PERIODS_PLACEHOLDER', String(args.postPeriods));
  vm.runInContext(`window.__campAB=${iife}`, baselineCtx);
  vm.runInContext(`window.__campAB=${iife}`, phase1Ctx);

  if (typeof phase1Ctx.applyShareCompressionTierMassScale !== 'function') {
    console.warn('WARN: Phase 1 hooks not loaded in phase1 context');
  }

  const cells = [];
  for (const cell of CELLS) {
    console.log(`==> ${cell.marketId} ${cell.targetYear}`);
    const baselineRuns = [];
    const phase1Runs = [];
    for (let r = 0; r < args.runs; r++) {
      const seed = args.seed + marketSalt(cell.marketId) + cell.targetYear * 31 + r * 997;
      const b = baselineCtx.__campAB.runCampaign(cell.marketId, cell.targetYear, seed);
      const p = phase1Ctx.__campAB.runCampaign(cell.marketId, cell.targetYear, seed);
      if (b?.ok) baselineRuns.push(b);
      if (p?.ok) phase1Runs.push(p);
      if ((r + 1) % Math.max(1, Math.floor(args.runs / 4)) === 0) {
        process.stdout.write(`  ${r + 1}/${args.runs} runs\r`);
      }
    }
    console.log(`  done ${baselineRuns.length}/${args.runs} paired`);
    const row = {
      ...cell,
      baseline: aggregateRuns(baselineRuns),
      phase1: aggregateRuns(phase1Runs),
      note: '',
    };
    row.note = interpretCell(row);
    cells.push(row);
    console.log(
      `  exit #1 ${pct(row.baseline.exitShare1)} → ${pct(row.phase1.exitShare1)} (${ptDelta(row.baseline.exitShare1, row.phase1.exitShare1)}) · ≥20% st ${row.baseline.exitGe20?.toFixed(1)} → ${row.phase1.exitGe20?.toFixed(1)}`,
    );
  }

  const promising = cells.filter((c) =>
    c.phase1.exitShare1 != null && c.baseline.exitShare1 != null
    && (c.baseline.exitShare1 - c.phase1.exitShare1) >= 0.015
    && (c.baseline.exitGe20 - c.phase1.exitGe20) >= 0.2,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    branch: 'prototype/share-compression-phase1',
    mode: 'dynamic_campaign_ab',
    rivalryEnabled: false,
    runs: args.runs,
    postPeriods: args.postPeriods,
    postYears: args.postPeriods / 2,
    seed: args.seed,
    cells,
    interpretation: promising.length
      ? `${promising.length}/${cells.length} cells show meaningful exit compression (≥1.5 pt #1 and fewer ≥20% stations). Worth manual playtest on those markets.`
      : 'No cell cleared both #1 compression and ≥20% station reduction at exit — Phase 1 may be display-layer only or ecology rebuilds leaders. Manual playtest still useful for feel, but long-run equilibrium shift is weak.',
  };

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  writeFileSync(outMd, buildMarkdown(report));
  console.log(`\nWrote ${outMd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
