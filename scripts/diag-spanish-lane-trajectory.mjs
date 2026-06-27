#!/usr/bin/env node
/**
 * Spanish lane trajectory — continuous cold sim with Spring book snapshots.
 * Records peak lane share, persistence above thresholds, and full Spring series.
 *
 *   node scripts/diag-spanish-lane-trajectory.mjs
 *   node scripts/diag-spanish-lane-trajectory.mjs --market=houston --runs=16
 *   node scripts/diag-spanish-lane-trajectory.mjs --markets=houston,phoenix,miami --seeds=1,2,3,4,5,6,7,8
 *
 * Output: tmp/spanish_lane_trajectory.json + tmp/spanish_lane_trajectory.md
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const spanishCompPath = path.join(root, 'src', 'realismSpanishComposition.js');
const outMd = path.join(root, 'tmp', 'spanish_lane_trajectory.md');
const outJson = path.join(root, 'tmp', 'spanish_lane_trajectory.json');

const GEN_ERA = '1985';
const TARGET_YEAR = 2026;
const MAX_STEPS = 120;
const DEFAULT_RUNS = 8;
const DEFAULT_SEED = 20260628;
const DEFAULT_MARKETS = ['houston'];
const DEFAULT_THRESHOLDS = [0.15, 0.2, 0.25];

const SPANISH_PILLARS = [
  'SPANISH',
  'REGIONAL_MEXICAN',
  'SPANISH_CONTEMPORARY',
  'SPANISH_TROPICAL',
  'SPANISH_ADULT_HITS',
];

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
        if (!typedArray?.length) return typedArray;
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

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  const m = Math.floor(n / 2);
  return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pct(x) {
  return x == null ? '—' : `${(x * 100).toFixed(2)}%`;
}

function parseArgs(argv) {
  const o = {
    runs: DEFAULT_RUNS,
    seed: DEFAULT_SEED,
    seeds: null,
    markets: DEFAULT_MARKETS,
    targetYear: TARGET_YEAR,
    thresholds: DEFAULT_THRESHOLDS,
    skipSpanishComp: false,
  };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
    else if (a.startsWith('--seeds=')) {
      o.seeds = a.slice(8).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
    } else if (a.startsWith('--market=')) o.markets = [a.slice(9).trim()].filter(Boolean);
    else if (a.startsWith('--markets=')) {
      o.markets = a.slice(10).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--target-year=')) o.targetYear = parseInt(a.slice(14), 10) || TARGET_YEAR;
    else if (a.startsWith('--thresholds=')) {
      o.thresholds = a.slice(13).split(',').map((s) => parseFloat(s.trim())).filter((n) => Number.isFinite(n));
    } else if (a === '--skip-spanish-comp') o.skipSpanishComp = true;
  }
  return o;
}

function loadCtx(skipSpanishComp) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(injectHeadlessMegaFragNewsGuard(readFileSync(legacyPath, 'utf8')), ctx);
  if (!skipSpanishComp && existsSync(spanishCompPath)) {
    vm.runInContext(readFileSync(spanishCompPath, 'utf8'), ctx);
  }
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function analyzeTrajectory(trajectory, thresholds, targetYear) {
  if (!trajectory?.length) {
    return { peak: null, terminal: null, persistence: {}, springs: 0 };
  }
  let peak = trajectory[0];
  for (const pt of trajectory) {
    if (pt.share > peak.share) peak = pt;
  }
  const terminal = trajectory.find((p) => p.year === targetYear) || trajectory[trajectory.length - 1];
  const persistence = {};
  for (const th of thresholds) {
    const above = trajectory.filter((p) => p.share >= th);
    let longest = 0;
    let streak = 0;
    for (const p of trajectory) {
      if (p.share >= th) {
        streak += 1;
        longest = Math.max(longest, streak);
      } else {
        streak = 0;
      }
    }
    persistence[String(th)] = {
      threshold: th,
      springsAbove: above.length,
      longestStreakSprings: longest,
      firstYear: above[0]?.year ?? null,
      lastYear: above[above.length - 1]?.year ?? null,
      stillAboveAtTerminal: (terminal?.share ?? 0) >= th,
    };
  }
  return {
    peak: { share: peak.share, year: peak.year, spanTop5: peak.spanTop5, spanCount: peak.spanCount },
    terminal: { share: terminal.share, year: terminal.year, spanTop5: terminal.spanTop5, spanCount: terminal.spanCount },
    peakMinusTerminal: peak.share - terminal.share,
    persistence,
    springs: trajectory.length,
  };
}

function runTrajectories(ctx, marketId, seedList, targetYear) {
  const inner = `
  (function(){
    var MARKET=${JSON.stringify(marketId)};
    var TARGET_YEAR=${targetYear};
    var GEN_ERA=${JSON.stringify(GEN_ERA)};
    var MAX_STEPS=${MAX_STEPS};
    var PILLARS=${JSON.stringify(SPANISH_PILLARS)};
    function isSpanFmt(fmt){
      var f=String(fmt||'');
      if(PILLARS.indexOf(f)>=0)return true;
      if(typeof spanishCompositionIsSpanishLaneFmt==='function'&&spanishCompositionIsSpanishLaneFmt(f))return true;
      return f.indexOf('SPANISH_')===0;
    }
    function springSnapshot(G){
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
      var lane=0, spanTop5=0, spanCount=0;
      list.forEach(function(st,idx){
        if(!isSpanFmt(st.format))return;
        var sh=Number(st.rat.share)||0;
        lane+=sh;
        spanCount++;
        if(idx<5)spanTop5++;
      });
      return {year:G.year,period:G.period,share:lane,spanTop5:spanTop5,spanCount:spanCount};
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
        var trajectory=[];
        if(G.period===1)trajectory.push(springSnapshot(G));
        var steps=0;
        while(steps<MAX_STEPS){
          if(G.year===TARGET_YEAR&&G.period===1)break;
          if(G.year>TARGET_YEAR)return {ok:false,err:'overshoot',seed:seed};
          var ui=window._harnessPatchTimersAndUi();
          try{ advTurn(); }finally{ ui.restore(); }
          steps++;
          if(G.period===1){
            var snap=springSnapshot(G);
            trajectory.push(snap);
            if(G.year===TARGET_YEAR)break;
          }
        }
        if(G.year!==TARGET_YEAR||G.period!==1)return {ok:false,err:'miss',seed:seed,atYear:G.year};
        var compOn=typeof spanishCompositionEnabled==='function'&&spanishCompositionEnabled();
        return {ok:true,seed:seed,marketId:MARKET,steps:steps,trajectory:trajectory,compositionEnabled:compOn};
      }catch(e){
        return {ok:false,err:String(e&&e.message||e),seed:seed};
      }finally{ Math.random=origR; }
    }
    return function(seeds){ return seeds.map(runOne); };
  })();
  `;
  const runAll = vm.runInContext(inner, ctx);
  return runAll(seedList);
}

function summarizeMarketRuns(marketId, rows, thresholds, targetYear) {
  const ok = rows.filter((r) => r.ok);
  const analyzed = ok.map((r) => ({
    ...r,
    stats: analyzeTrajectory(r.trajectory, thresholds, targetYear),
  }));
  const peakShares = analyzed.map((r) => r.stats.peak?.share ?? 0);
  const termShares = analyzed.map((r) => r.stats.terminal?.share ?? 0);
  const peakYears = analyzed.map((r) => r.stats.peak?.year ?? null);

  const byPeak = [...analyzed].sort((a, b) => (b.stats.peak?.share ?? 0) - (a.stats.peak?.share ?? 0));

  const persistenceAgg = {};
  for (const th of thresholds) {
    const key = String(th);
    const streaks = analyzed.map((r) => r.stats.persistence[key]?.longestStreakSprings ?? 0);
    const springsAbove = analyzed.map((r) => r.stats.persistence[key]?.springsAbove ?? 0);
    persistenceAgg[key] = {
      threshold: th,
      longestStreakSprings: { median: median(streaks), max: Math.max(...streaks, 0) },
      springsAbove: { median: median(springsAbove), max: Math.max(...springsAbove, 0) },
    };
  }

  return {
    marketId,
    n: ok.length,
    failures: rows.filter((r) => !r.ok),
    compositionEnabled: ok[0]?.compositionEnabled ?? null,
    peakShare: { median: median(peakShares), max: Math.max(...peakShares, 0) },
    terminalShare: { median: median(termShares), max: Math.max(...termShares, 0) },
    peakYear: { median: median(peakYears.filter((y) => y != null)), min: Math.min(...peakYears.filter((y) => y != null), Infinity), max: Math.max(...peakYears.filter((y) => y != null), 0) },
    persistenceAgg,
    runs: analyzed,
    heaviestPeak: byPeak[0] ?? null,
    heaviestTerminal: [...analyzed].sort((a, b) => (b.stats.terminal?.share ?? 0) - (a.stats.terminal?.share ?? 0))[0] ?? null,
  };
}

function formatTrajectorySparkline(trajectory, width = 20) {
  if (!trajectory?.length) return '';
  const shares = trajectory.map((p) => p.share);
  const min = Math.min(...shares);
  const max = Math.max(...shares);
  const span = max - min || 1;
  const blocks = '▁▂▃▄▅▆▇█';
  return shares
    .filter((_, i) => i % Math.max(1, Math.floor(trajectory.length / width)) === 0 || i === trajectory.length - 1)
    .map((s) => blocks[Math.min(7, Math.floor(((s - min) / span) * 7))])
    .join('');
}

function buildMarkdown(opts, markets) {
  const lines = [
    '# Spanish lane trajectory audit',
    '',
    `**Generated:** ${new Date().toISOString().slice(0, 10)}`,
    `**Markets:** ${opts.markets.join(', ')}`,
    `**Path:** genMarketMP(${GEN_ERA}) → continuous sim → Spring snapshots → ${opts.targetYear}`,
    `**Seeds:** ${opts.seeds?.length ? opts.seeds.join(', ') : `${opts.runs} from ${opts.seed}`}`,
    `**Thresholds (persistence):** ${opts.thresholds.map((t) => pct(t)).join(', ')}`,
    `**Spanish Composition:** ${opts.skipSpanishComp ? 'off' : 'on'}`,
    '',
    'Peak = max Spanish lane book share at **any Spring** within the run. Terminal = Spring ' + opts.targetYear + '.',
    '',
  ];

  for (const m of markets) {
    lines.push(`## ${m.marketId.toUpperCase()}`, '');
    lines.push(
      '| Metric | Median | Max |',
      '|--------|-------:|----:|',
      `| **Peak lane share** | ${pct(m.peakShare.median)} | ${pct(m.peakShare.max)} |`,
      `| **Terminal lane share** | ${pct(m.terminalShare.median)} | ${pct(m.terminalShare.max)} |`,
      `| **Peak year** | ${m.peakYear.median ?? '—'} | ${m.peakYear.min === Infinity ? '—' : `${m.peakYear.min}–${m.peakYear.max}`} |`,
      '',
    );

    lines.push('### Persistence (Spring observations)', '');
    lines.push('| Threshold | Longest streak (med / max) | Springs above (med / max) |');
    lines.push('|-----------|---------------------------:|----------------------------:|');
    for (const th of opts.thresholds) {
      const p = m.persistenceAgg[String(th)];
      lines.push(
        `| ≥ ${pct(th)} | ${p.longestStreakSprings.median?.toFixed(0) ?? '—'} / ${p.longestStreakSprings.max} | ${p.springsAbove.median?.toFixed(0) ?? '—'} / ${p.springsAbove.max} |`,
      );
    }
    lines.push('');

    const hp = m.heaviestPeak;
    if (hp) {
      lines.push('### Heaviest peak run', '');
      lines.push(
        `Seed **${hp.seed}** · peak **${pct(hp.stats.peak.share)}** @ Spring **${hp.stats.peak.year}** · terminal **${pct(hp.stats.terminal.share)}** @ ${opts.targetYear} · Δ peak→terminal **${pct(hp.stats.peakMinusTerminal)}**`,
      );
      lines.push('');
      lines.push('Spring series (share):');
      lines.push('');
      lines.push('| Year | Lane | Top-5 Spanish | # Spanish |');
      lines.push('|------|-----:|--------------:|----------:|');
      for (const pt of hp.trajectory) {
        if (pt.year % 5 !== 0 && pt.year !== opts.targetYear && pt.year !== hp.stats.peak.year) continue;
        lines.push(`| ${pt.year} | ${pct(pt.share)} | ${pt.spanTop5} | ${pt.spanCount} |`);
      }
      lines.push('');
      lines.push(`Sparkline (downsampled): \`${formatTrajectorySparkline(hp.trajectory)}\``, '');
      for (const th of opts.thresholds) {
        const p = hp.stats.persistence[String(th)];
        if (!p.springsAbove) continue;
        lines.push(
          `- ≥ ${pct(th)}: **${p.longestStreakSprings}** consecutive Springs (first ${p.firstYear}, last ${p.lastYear}, ${p.springsAbove} total)`,
        );
      }
      lines.push('');
    }

    lines.push('### All runs (peak vs terminal)', '');
    lines.push('| Seed | Peak | @ year | Terminal | Peak−Term | ≥20% streak |');
    lines.push('|-----:|-----:|-------:|---------:|----------:|------------:|');
    for (const r of m.runs.sort((a, b) => (b.stats.peak?.share ?? 0) - (a.stats.peak?.share ?? 0))) {
      const p20 = r.stats.persistence['0.2'] || r.stats.persistence['0.20'];
      lines.push(
        `| ${r.seed} | ${pct(r.stats.peak?.share)} | ${r.stats.peak?.year ?? '—'} | ${pct(r.stats.terminal?.share)} | ${pct(r.stats.peakMinusTerminal)} | ${p20?.longestStreakSprings ?? 0} |`,
      );
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const seedList = opts.seeds?.length
    ? opts.seeds
    : Array.from({ length: opts.runs }, (_, i) => opts.seed + i * 9973);

  const markets = opts.markets.map((marketId) => {
    const rows = seedList.map((seed) => {
      const ctx = loadCtx(opts.skipSpanishComp);
      return runTrajectories(ctx, marketId, [seed], opts.targetYear)[0];
    });
    return summarizeMarketRuns(marketId, rows, opts.thresholds, opts.targetYear);
  });

  mkdirSync(path.dirname(outMd), { recursive: true });
  const md = buildMarkdown(opts, markets);
  writeFileSync(outMd, md, 'utf8');
  writeFileSync(
    outJson,
    `${JSON.stringify({ opts, markets: markets.map((m) => ({ ...m, runs: m.runs.map((r) => ({ seed: r.seed, stats: r.stats, trajectory: r.trajectory })) })) }, null, 2)}\n`,
    'utf8',
  );
  console.log(md);
  console.log(`\nWrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
}

main();
