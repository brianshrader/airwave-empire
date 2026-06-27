#!/usr/bin/env node
/**
 * Long-run market ecology — 40-year cold sims with decade checkpoints.
 *
 * Answers: "What does Houston look like after 40 years of simulation?" — not cold-start only.
 * Flags share monsters (default ≥15%) and records autopsy context (franchises, lane peers, format age).
 *
 *   npm run diag:longrun-ecology
 *   node scripts/diag-longrun-market-ecology.mjs --markets=houston --runs=12
 *   node scripts/diag-longrun-market-ecology.mjs --monster=0.12 --runs=20
 *
 * Artifacts: tmp/longrun_market_ecology.md, .json, .csv
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
const outMd = path.join(root, 'tmp', 'longrun_market_ecology.md');
const outJson = path.join(root, 'tmp', 'longrun_market_ecology.json');
const outCsv = path.join(root, 'tmp', 'longrun_market_ecology.csv');

const DEFAULT_MARKETS = ['houston'];
const CHECKPOINTS = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025, 2026];
const GEN_ERA = '1985';
const TARGET_YEAR = 2026;
const TARGET_PERIOD = 1;
const MAX_STEPS = 100;
const DEFAULT_RUNS = 10;
const DEFAULT_SEED = 20260626;
const MONSTER_THRESHOLD = 0.15;

const SPOKEN_FMTS = [
  'NEWS_TALK',
  'CONSERVATIVE_TALK',
  'SPORTS_TALK',
  'PERSONALITY_TALK',
  'ALL_NEWS',
];

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

function parseCsvList(s, fallback) {
  if (!s || !String(s).trim()) return fallback.slice();
  return String(s).split(',').map((x) => x.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const o = {
    markets: DEFAULT_MARKETS,
    runs: DEFAULT_RUNS,
    seed: DEFAULT_SEED,
    monster: MONSTER_THRESHOLD,
    era: GEN_ERA,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) o.markets = parseCsvList(a.slice('--markets='.length), DEFAULT_MARKETS);
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice('--runs='.length), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice('--seed='.length), 10) || DEFAULT_SEED;
    else if (a.startsWith('--monster=')) o.monster = parseFloat(a.slice('--monster='.length)) || MONSTER_THRESHOLD;
    else if (a.startsWith('--era=')) o.era = String(a.slice('--era='.length)).trim();
  }
  return o;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(2)}%`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(injectHeadlessMegaFragNewsGuard(readFileSync(legacyPath, 'utf8')), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);

  const inner = `
  (function(){
    var CHECKPOINTS=${JSON.stringify(CHECKPOINTS)};
    var TARGET_YEAR=${TARGET_YEAR};
    var TARGET_PERIOD=${TARGET_PERIOD};
    var GEN_ERA=${JSON.stringify(opts.era)};
    var MAX_STEPS=${MAX_STEPS};
    var MONSTER=${opts.monster};
    var SPOKEN=${JSON.stringify(SPOKEN_FMTS)};
    function spokenFmt(fmt){ return SPOKEN.indexOf(fmt)>=0; }
    function eligibleBook(G){
      var list=(G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';
      });
      for(var i=0;i<list.length;i++){
        if(typeof sanitizeStationShareForRanking==='function')sanitizeStationShareForRanking(list[i]);
      }
      list.sort(function(a,b){
        var sa=a.rat.share||0,sb=b.rat.share||0;
        if(Math.abs(sb-sa)>1e-9)return sb-sa;
        return String(a.id).localeCompare(String(b.id));
      });
      return list;
    }
    function spokenDetail(G){
      var sum=0,leader=null,leaderSh=0,cnt=0;
      (G.stations||[]).forEach(function(s){
        if(!s||s._bpSlotDeferred||stationIsNoncommercialInstitutional(s))return;
        if(!spokenFmt(s.format))return;
        cnt++;
        var sh=Number(s.rat.share)||0;
        sum+=sh;
        if(sh>leaderSh){leaderSh=sh;leader=s;}
      });
      return {sum:sum,leader:leader,leaderSh:leaderSh,count:cnt,
        leaderPct:sum>1e-9?leaderSh/sum:0};
    }
    function publicNewsSum(G){
      var p=0;
      (G.stations||[]).forEach(function(s){
        if(s&&s.isPublic&&s.format==='PUBLIC_NEWS'&&!s._bpSlotDeferred)p+=Number(s.rat.share)||0;
      });
      return p;
    }
    function franchiseInfo(s,G){
      var list=typeof franchiseRightsOnStation==='function'?franchiseRightsOnStation(s,G):[];
      return {
        count:list.length,
        names:list.map(function(x){return x.franchise&&x.franchise.name;}).filter(Boolean),
      };
    }
    function lanePeers(s,G){
      if(!s||typeof formatEcologyLaneCommercialPeers!=='function')return null;
      try{return formatEcologyLaneCommercialPeers(G,formatEcologyLaneId(s.format)).length;}catch(e){return null;}
    }
    function formatTenurePeriods(s,G){
      if(!s)return 0;
      var fa=Number(s._formatAge);
      if(Number.isFinite(fa)&&fa>=0)return fa|0;
      var flog=s.flog;
      if(Array.isArray(flog)&&flog.length){
        var last=flog[flog.length-1];
        if(last&&last.to===s.format&&(G.year||1970)>(last.y||0))
          return ((G.year||1970)-(last.y||0))*2+((G.period||1)-(last.p||1));
      }
      return 0;
    }
    function spokenCompetitorCount(G,excludeId){
      var n=0;
      (G.stations||[]).forEach(function(st){
        if(!st||st._bpSlotDeferred||stationIsNoncommercialInstitutional(st))return;
        if(st.id===excludeId)return;
        if(spokenFmt(st.format))n++;
      });
      return n;
    }
    function snapshot(G,year,ctx){
      ctx=ctx||{};
      var book=eligibleBook(G);
      var lead=book[0]||null;
      var sh1=lead?Number(lead.rat.share)||0:0;
      var spoken=spokenDetail(G);
      var fi=lead?franchiseInfo(lead,G):{count:0,names:[]};
      var buckets=typeof wlMarketListeningBucketShares01==='function'?wlMarketListeningBucketShares01(G):null;
      var gt8=0,gt12=0;
      for(var i=0;i<book.length;i++){
        var sh=Number(book[i].rat.share)||0;
        if(sh>0.08)gt8++;
        if(sh>0.12)gt12++;
      }
      return {
        year:year,
        share1:sh1,
        leadId:lead?String(lead.id):'',
        leadCall:lead?String(lead.callLetters||''):'',
        leadFormat:lead?String(lead.format):'',
        leadFormatAge:formatTenurePeriods(lead,G),
        leadFlogLen:lead&&Array.isArray(lead.flog)?lead.flog.length:0,
        leadOq:lead?Number(lead.oq)||0:0,
        leadFranchises:fi.count,
        leadFranchiseNames:fi.names,
        leadLanePeers:lead?lanePeers(lead,G):null,
        leadSpokenCompetitors:lead?spokenCompetitorCount(G,lead.id):null,
        yearsAsLeader:ctx.yearsAsLeader||0,
        leaderShareDelta:ctx.leaderShareDelta,
        leaderPersisted:!!ctx.leaderPersisted,
        leadCorp:lead&&lead.corpOwner?String(lead.corpOwner):'',
        spokenSum:spoken.sum,
        topSpoken:spoken.leaderSh,
        spokenLeaderCall:spoken.leader?String(spoken.leader.callLetters||''):'',
        spokenLeaderPct:spoken.leaderPct,
        spokenCount:spoken.count,
        publicNews:publicNewsSum(G),
        bucketSpoken:buckets?buckets.spoken:0,
        nBook:book.length,
        gt8:gt8,
        gt12:gt12,
        isMonster:sh1>=MONSTER,
        maxPublicNews:publicNewsSum(G),
      };
    }
    function runOne(marketId,seed){
      ACTIVE_MARKET=marketId;
      syncMarketPopToMarket(marketId);
      G=genMarketMP(GEN_ERA);
      G._wlShareCalib={leaderCaps:false,publicFloor:true};
      MP.mode='solo';
      var s=seed;
      var origR=Math.random;
      Math.random=function(){
        s=(s*9301+49297)%233280;
        return s/233280;
      };
      var snaps=[];
      var steps=0;
      var prevLeadId=null,prevShare1=null,yearsAsLeader=0;
      try{
        while(steps<MAX_STEPS){
          if(CHECKPOINTS.indexOf(G.year)>=0&&G.period===TARGET_PERIOD){
            var book=eligibleBook(G);
            var lead=book[0]||null;
            var lid=lead?String(lead.id):'';
            if(lid&&lid===prevLeadId)yearsAsLeader++;
            else yearsAsLeader=lid?1:0;
            var snap=snapshot(G,G.year,{
              yearsAsLeader:yearsAsLeader,
              leaderPersisted:!!(lid&&lid===prevLeadId),
              leaderShareDelta:prevShare1!=null&&lid===prevLeadId?(Number(lead.rat.share)||0)-prevShare1:null,
            });
            snaps.push(snap);
            prevLeadId=lid;
            prevShare1=snap.share1;
          }
          if(G.year===TARGET_YEAR&&G.period===TARGET_PERIOD)break;
          if(G.year>TARGET_YEAR||(G.year===TARGET_YEAR&&G.period>TARGET_PERIOD))
            return {ok:false,err:'overshoot',marketId:marketId,steps:steps};
          var ui=window._harnessPatchTimersAndUi();
          try{ advTurn(); }finally{ ui.restore(); }
          steps++;
        }
        if(G.year!==TARGET_YEAR||G.period!==TARGET_PERIOD)
          return {ok:false,err:'miss',marketId:marketId,atYear:G.year,steps:steps};
        var monsters=snaps.filter(function(x){return x.isMonster;});
        return {ok:true,marketId:marketId,steps:steps,checkpoints:snaps,monsters:monsters};
      }catch(e){
        return {ok:false,err:String(e&&e.message||e),marketId:marketId};
      }finally{
        Math.random=origR;
      }
    }
    return function runAll(markets,runs,baseSeed){
      var rows=[];
      for(var mi=0;mi<markets.length;mi++){
        var mid=markets[mi];
        for(var r=0;r<runs;r++){
          rows.push(Object.assign({run:r,seed:baseSeed+r*9973},runOne(mid,baseSeed+r*9973)));
        }
      }
      return rows;
    };
  })();
  `;

  const runAll = vm.runInContext(inner, ctx);
  const rows = runAll(opts.markets, opts.runs, opts.seed);
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) console.warn('Failures (first 5):', bad.slice(0, 5));

  const okRows = rows.filter((r) => r.ok);
  const csvLines = [
    'marketId,run,seed,year,share1,leadCall,leadFormat,leadFranchises,topSpoken,spokenSum,publicNews,gt8,gt12,isMonster',
  ];
  const autopsies = [];

  for (const r of okRows) {
    for (const snap of r.checkpoints || []) {
      csvLines.push(
        [
          r.marketId,
          r.run,
          r.seed,
          snap.year,
          snap.share1.toFixed(4),
          snap.leadCall,
          snap.leadFormat,
          snap.leadFranchises,
          snap.topSpoken.toFixed(4),
          snap.spokenSum.toFixed(4),
          snap.publicNews.toFixed(4),
          snap.gt8,
          snap.gt12,
          snap.isMonster ? 1 : 0,
        ].join(','),
      );
      if (snap.isMonster) {
        autopsies.push({
          marketId: r.marketId,
          run: r.run,
          seed: r.seed,
          ...snap,
        });
      }
    }
  }

  const md = [
    '# Long-run market ecology',
    '',
    `genMarketMP(${opts.era}) → Spring ${TARGET_YEAR} · checkpoints: ${CHECKPOINTS.join(', ')}`,
    `markets=${opts.markets.join(', ')} · runs=${opts.runs} · seed=${opts.seed} · monster≥${(opts.monster * 100).toFixed(0)}%`,
    `shareCalib: leaderCaps=false publicFloor=true (production default)`,
    '',
  ];

  for (const mid of opts.markets) {
    const marketRows = okRows.filter((r) => r.marketId === mid);
    md.push(`## ${mid}`, '');
    for (const y of CHECKPOINTS) {
      const snaps = marketRows.flatMap((r) => (r.checkpoints || []).filter((s) => s.year === y));
      if (!snaps.length) continue;
      const s1 = snaps.map((s) => s.share1);
      const ts = snaps.map((s) => s.topSpoken);
      const monsters = snaps.filter((s) => s.isMonster).length;
      const maxPub = Math.max(...snaps.map((s) => s.maxPublicNews || s.publicNews || 0));
      md.push(
        `- **${y}**: #1 mean ${pct(mean(s1))} max ${pct(Math.max(...s1))} | spoken top mean ${pct(mean(ts))} | public news mean ${pct(mean(snaps.map((s) => s.publicNews)))} max ${pct(maxPub)} | monsters ${monsters}/${snaps.length}`,
      );
    }
    const allMonsters = marketRows.reduce((n, r) => n + (r.monsters?.length || 0), 0);
    const runsWithMonster = marketRows.filter((r) => (r.monsters?.length || 0) > 0).length;
    md.push(`- Runs with ≥1 monster checkpoint: **${runsWithMonster}/${marketRows.length}** (total monster events: ${allMonsters})`, '');
  }

  if (autopsies.length) {
    md.push('## Monster autopsies (≥' + (opts.monster * 100).toFixed(0) + '% #1)', '');
    for (const a of autopsies.slice(0, 24)) {
      md.push(
        `### ${a.marketId} run ${a.run} · ${a.year} · ${a.leadCall} ${a.leadFormat} ${pct(a.share1)}`,
        `- Franchises on leader: **${a.leadFranchises}**${a.leadFranchiseNames?.length ? ` (${a.leadFranchiseNames.join(', ')})` : ''}`,
        `- Tenure: ${a.yearsAsLeader} checkpoint(s) as #1 · format tenure ~${a.leadFormatAge} periods · flog entries: ${a.leadFlogLen} · OQ: ${a.leadOq}`,
        `- Lane peers: ${a.leadLanePeers ?? '—'} · spoken competitors: ${a.leadSpokenCompetitors ?? '—'} · corp: ${a.leadCorp || 'indie'}`,
        `- Spoken bucket: top ${pct(a.topSpoken)} / sum ${pct(a.spokenSum)} (${a.spokenCount} stations) · public news max ${pct(a.maxPublicNews)}`,
        `- Leader persisted: ${a.leaderPersisted ? 'yes' : 'no'}${a.leaderShareDelta != null ? ` · share Δ ${(a.leaderShareDelta * 100).toFixed(2)}pp` : ''}`,
        '',
      );
    }
    if (autopsies.length > 24) md.push(`_…and ${autopsies.length - 24} more (see JSON)._`, '');
  } else {
    md.push('## Monster autopsies', '', '_No checkpoints exceeded monster threshold in this sample._', '');
  }

  md.push(
    '## How to use',
    '',
    '- Compare decade rows: does the same `leadId` persist with rising share (compounding) or rotate naturally?',
    '- Monsters with high `leadFranchises` + old format age → franchise stacking hypothesis.',
    '- Monsters with low spoken competition + high spoken sum → lane monopoly.',
    '- Re-run with `--monster=0.12` to catch borderline cases.',
  );

  mkdirSync(path.dirname(outMd), { recursive: true });
  writeFileSync(outMd, md.join('\n') + '\n', 'utf8');
  writeFileSync(outJson, JSON.stringify({ opts, rows: okRows, autopsies, failures: bad }, null, 2) + '\n', 'utf8');
  writeFileSync(outCsv, csvLines.join('\n') + '\n', 'utf8');

  console.log(md.join('\n'));
  console.log(`\nWrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outCsv}`);
  if (bad.length) console.log(`Note: ${bad.length} failed runs`);
}

main();
