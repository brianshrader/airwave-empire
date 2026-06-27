#!/usr/bin/env node
/**
 * Phoenix Spanish trajectory autopsy — answers format/station/supply questions at peak lane.
 *
 *   node scripts/diag-phoenix-spanish-trajectory-autopsy.mjs
 *   node scripts/diag-phoenix-spanish-trajectory-autopsy.mjs --seed=8 --compare=houston
 *
 * Output: tmp/phoenix_spanish_trajectory_autopsy.md + .json
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outMd = path.join(root, 'tmp', 'phoenix_spanish_trajectory_autopsy.md');
const outJson = path.join(root, 'tmp', 'phoenix_spanish_trajectory_autopsy.json');

const GEN_ERA = '1985';
const TARGET_YEAR = 2026;
const MAX_STEPS = 120;
const SPANISH_KEYS = ['SPANISH', 'REGIONAL_MEXICAN', 'SPANISH_CONTEMPORARY', 'SPANISH_TROPICAL', 'SPANISH_ADULT_HITS'];

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
    __WL_REALISM_SPANISH_COMPOSITION_POC: true,
    globalThis: null, window: null, document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '?proto=share+sac+spanish', href: 'http://127.0.0.1/' },
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

function pct(x) {
  return `${((x || 0) * 100).toFixed(2)}%`;
}

function parseArgs(argv) {
  const o = { seed: 1, compare: 'houston', compareSeed: 5 };
  for (const a of argv) {
    if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || 1;
    if (a.startsWith('--compare=')) o.compare = a.slice(10);
    if (a.startsWith('--compare-seed=')) o.compareSeed = parseInt(a.slice(15), 10) || 3;
  }
  return o;
}

function loadCtx() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(injectHeadlessMegaFragNewsGuard(readFileSync(path.join(root, 'src', 'legacy.js'), 'utf8')), ctx);
  const spanishPath = path.join(root, 'src', 'realismSpanishComposition.js');
  if (existsSync(spanishPath)) vm.runInContext(readFileSync(spanishPath, 'utf8'), ctx);
  vm.runInContext(readFileSync(path.join(root, 'src', 'marketSimHarness.js'), 'utf8'), ctx);
  return ctx;
}

function runAutopsy(ctx, marketId, seed) {
  const inner = `
  (function(){
    var MARKET=${JSON.stringify(marketId)};
    var TARGET=${TARGET_YEAR};
    var GEN_ERA=${JSON.stringify(GEN_ERA)};
    var MAX_STEPS=${MAX_STEPS};
    var SPAN_KEYS=${JSON.stringify(SPANISH_KEYS)};
    function isSpan(fmt){
      var f=String(fmt||'');
      if(SPAN_KEYS.indexOf(f)>=0)return true;
      if(typeof spanishCompositionIsSpanishLaneFmt==='function'&&spanishCompositionIsSpanishLaneFmt(f))return true;
      return f.indexOf('SPANISH_')===0;
    }
    function sortBook(G){
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
    function bookSnapshot(G){
      var book=sortBook(G);
      var lane=0,byFmt={},spanSt=[],top5Span=0;
      book.forEach(function(st,idx){
        if(!isSpan(st.format))return;
        var sh=Number(st.rat.share)||0;
        lane+=sh;
        var f=String(st.format);
        byFmt[f]=(byFmt[f]||0)+sh;
        if(idx<5)top5Span++;
        spanSt.push({rank:idx+1,call:st.callLetters,format:f,band:(st.sig&&st.sig.type)||'?',share:sh,str:String(st.str||''),oq:st.oq|0});
      });
      var dialSpan=(G.stations||[]).filter(function(s){
        return s&&!s._bpSlotDeferred&&isSpan(s.format);
      }).length;
      return {year:G.year,period:G.period,lane:lane,byFmt:byFmt,spanSt:spanSt,top5Span:top5Span,dialSpan:dialSpan,nBook:book.length};
    }
    function runOne(seed){
      ACTIVE_MARKET=MARKET;
      syncMarketPopToMarket(MARKET);
      G=genMarketMP(GEN_ERA);
      G._wlShareCalib={leaderCaps:false,publicFloor:true};
      MP.mode='solo';
      var s=seed, origR=Math.random;
      Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
      try{
        var series=[];
        if(G.period===1)series.push(bookSnapshot(G));
        var steps=0;
        while(steps<MAX_STEPS){
          if(G.year===TARGET&&G.period===1)break;
          if(G.year>TARGET)return {ok:false,err:'overshoot',seed:seed};
          var ui=window._harnessPatchTimersAndUi();
          try{ advTurn(); }finally{ ui.restore(); }
          steps++;
          if(G.period===1){
            series.push(bookSnapshot(G));
            if(G.year===TARGET)break;
          }
        }
        var mkt=MARKETS[MARKET]||{};
        var peak=series[0];
        series.forEach(function(snap){ if(snap.lane>peak.lane)peak=snap; });
        var terminal=series[series.length-1];
        var launchSched=(mkt.spanishLaunches||[]).length+(mkt.fragmentationLaunches||[]).filter(function(x){return x.bp&&x.bp.fmt==='SPANISH';}).length;
        return {
          ok:true, seed:seed, marketId:MARKET, steps:steps,
          market:{
            archetypeId:mkt.archetypeId,
            rankTier:mkt.rankTier,
            hispPop1970:mkt.hispPop1970,
            hispPop2000:mkt.hispPop2000,
            hispPop2020:mkt.hispPop2020,
            cultureSpanish:(mkt.culture&&mkt.culture.spanish)||0,
            spanishLaunches:(mkt.spanishLaunches||[]).length,
            fragSpanish:(mkt.fragmentationLaunches||[]).filter(function(x){return x.bp&&x.bp.fmt==='SPANISH';}).length,
            scheduledSpanishInjections:launchSched,
            fmDial:(mkt.fmFreqs||[]).length,
            amDial:(mkt.amFreqs||[]).length,
          },
          peak:peak,
          terminal:terminal,
          series:series,
        };
      }catch(e){
        return {ok:false,err:String(e&&e.message||e),seed:seed};
      }finally{ Math.random=origR; }
    }
    return runOne;
  })();
  `;
  const run = vm.runInContext(inner, ctx);
  return run(seed);
}

function fmtByFmtTable(byFmt) {
  return Object.entries(byFmt || {})
    .sort((a, b) => b[1] - a[1])
    .map(([f, sh]) => `- **${f}**: ${pct(sh)}`)
    .join('\n') || '_none_';
}

function stationTable(rows) {
  if (!rows?.length) return '_No Spanish stations in book._\n';
  const lines = ['| Rank | Call | Format | Band | Share |', '|-----:|------|--------|------|------:|'];
  for (const r of rows) lines.push(`| ${r.rank} | ${r.call} | ${r.format} | ${r.band} | ${pct(r.share)} |`);
  return `${lines.join('\n')}\n`;
}

function buildMd(opts, phx, cmp) {
  const lines = [
    '# Phoenix Spanish trajectory autopsy',
    '',
    `**Generated:** ${new Date().toISOString().slice(0, 10)}`,
    '**Ticket:** Phoenix-specific realism — no global Spanish changes',
    '',
    '## Executive summary',
    '',
  ];

  if (!phx.ok) {
    lines.push(`Phoenix run failed: ${phx.err}`);
    return lines.join('\n');
  }

  lines.push(
    `Phoenix seed **${phx.seed}** peaks at **${pct(phx.peak.lane)}** (Spring ${phx.peak.year}), terminal **${pct(phx.terminal.lane)}** @ ${TARGET_YEAR}.`,
    `Compare ${cmp?.marketId || 'houston'} seed **${cmp?.seed}**: peak **${pct(cmp?.peak?.lane)}**, terminal **${pct(cmp?.terminal?.lane)}**.`,
    '',
    '---',
    '',
    '## Q1 — What formats produce the lane mass?',
    '',
    `### At peak (Spring ${phx.peak.year})`,
    fmtByFmtTable(phx.peak.byFmt),
    '',
    stationTable(phx.peak.spanSt),
    '',
    `### At terminal (Spring ${TARGET_YEAR})`,
    fmtByFmtTable(phx.terminal.byFmt),
    '',
    stationTable(phx.terminal.spanSt),
    '',
    '## Q2 — How many stations? Monster vs distributed?',
    '',
    `| Snapshot | Lane share | Spanish in book | Spanish on dial | In top 5 |`,
    `|----------|----------:|----------------:|----------------:|---------:|`,
    `| Peak ${phx.peak.year} | ${pct(phx.peak.lane)} | ${phx.peak.spanSt.length} | ${phx.peak.dialSpan} | ${phx.peak.top5Span} |`,
    `| Terminal ${TARGET_YEAR} | ${pct(phx.terminal.lane)} | ${phx.terminal.spanSt.length} | ${phx.terminal.dialSpan} | ${phx.terminal.top5Span} |`,
    '',
  );

  if (cmp?.ok) {
    lines.push(
      `**Houston compare (seed ${cmp.seed}):** peak ${pct(cmp.peak.lane)} (${cmp.peak.spanSt.length} in book / ${cmp.peak.dialSpan} dial), terminal ${pct(cmp.terminal.lane)}.`,
      '',
    );
  }

  lines.push(
    '## Q3 — Hispanic population assumptions (MARKETS)',
    '',
    '| Market | hispPop1970 | hispPop2000 | hispPop2020 | culture.spanish |',
    '|--------|------------:|------------:|------------:|----------------:|',
    `| Phoenix | ${pct(phx.market.hispPop1970)} | ${pct(phx.market.hispPop2000)} | ${pct(phx.market.hispPop2020)} | ${phx.market.cultureSpanish} |`,
  );
  if (cmp?.ok) {
    lines.push(
      `| ${cmp.marketId} | ${pct(cmp.market.hispPop1970)} | ${pct(cmp.market.hispPop2000)} | ${pct(cmp.market.hispPop2020)} | ${cmp.market.cultureSpanish} |`,
    );
  }
  lines.push(
    '',
    'Phoenix is **30.1% Hispanic @2020** — lower than Houston (38%) yet sim lane share is **~2× Houston** on worst seeds.',
    '',
    '## Q4 — Scheduled Spanish supply injections',
    '',
    '| Market | spanishLaunches | fragmentation SPANISH | Total scheduled | FM dial slots |',
    '|--------|----------------:|----------------------:|----------------:|--------------:|',
    `| Phoenix | ${phx.market.spanishLaunches} | ${phx.market.fragSpanish} | **${phx.market.scheduledSpanishInjections}** | ${phx.market.fmDial} |`,
  );
  if (cmp?.ok) {
    lines.push(
      `| ${cmp.marketId} | ${cmp.market.spanishLaunches} | ${cmp.market.fragSpanish} | **${cmp.market.scheduledSpanishInjections}** | ${cmp.market.fmDial} |`,
    );
  }
  lines.push(
    '',
    'Phoenix comment in MARKETS targets **16–20% leadership @2026** — isolated cold sims still overshoot on several seeds (see trajectory harness). Scheduled supply + sunbelt composition sequence are the first suspects.',
    '',
    '## Q5 — Lane build timeline (Spring checkpoints)',
    '',
    '| Year | Lane | Dial | Top-5 | Leader format mix |',
    '|------|-----:|-----:|------:|-------------------|',
  );

  for (const snap of phx.series) {
    if (snap.year % 5 !== 0 && snap.year !== phx.peak.year && snap.year !== TARGET_YEAR) continue;
    const mix = Object.entries(snap.byFmt).map(([f, sh]) => `${f} ${pct(sh)}`).join('; ') || '—';
    lines.push(`| ${snap.year} | ${pct(snap.lane)} | ${snap.dialSpan} | ${snap.top5Span} | ${mix} |`);
  }

  lines.push(
    '',
    '## Recommended ticket scope (Phoenix-only)',
    '',
    '1. Reconcile `spanishLaunches` + `fragmentationLaunches` count vs MARKETS comment (16–20% target).',
    '2. Audit `realismSpanishComposition` sunbelt sequence on `sunbelt_diversified` — RM/SC stacking.',
    '3. Check Phoenix `phoenixDiag*` appeal multipliers — may under-trim non-Spanish competition.',
    '4. **Do not** change global Spanish demand or Houston ecology.',
    '5. Supply project remains separate — thin dial may amplify concentration but does not explain persistent 25%+ terminal alone.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = loadCtx();
  const phx = runAutopsy(ctx, 'phoenix', opts.seed);
  const cmp = opts.compare ? runAutopsy(ctx, opts.compare, opts.compareSeed) : null;
  mkdirSync(path.dirname(outMd), { recursive: true });
  const md = buildMd(opts, phx, cmp);
  writeFileSync(outMd, md, 'utf8');
  writeFileSync(outJson, `${JSON.stringify({ opts, phoenix: phx, compare: cmp }, null, 2)}\n`, 'utf8');
  console.log(md);
  console.log(`\nWrote ${outMd}`);
}

main();
