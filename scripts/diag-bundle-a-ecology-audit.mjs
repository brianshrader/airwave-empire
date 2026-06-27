#!/usr/bin/env node
/**
 * Bundle A multi-market ecology smoke test — station counts + Spring rankers.
 * No HHI, concentration scoring, or tuning recommendations.
 *
 *   node scripts/diag-bundle-a-ecology-audit.mjs
 *   node scripts/diag-bundle-a-ecology-audit.mjs --seed=42
 *   node scripts/diag-bundle-a-ecology-audit.mjs --seeds=42,99,137,271,314,528,777,1337
 *
 * Artifacts: tmp/bundle_a_ecology_audit.md, tmp/bundle_a_ecology_audit.json
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { injectFormatLifecycleIife } from './vmInjectFormatLifecycleIife.mjs';
import { isSpanishLanguageFormat } from './spanishLanguageFormats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const spanishPath = path.join(root, 'src', 'realismSpanishComposition.js');
const outMd = path.join(root, 'tmp', 'bundle_a_ecology_audit.md');
const outJson = path.join(root, 'tmp', 'bundle_a_ecology_audit.json');
const outMatrixMd = path.join(root, 'tmp', 'bundle_a_ecology_matrix.md');
const outMatrixJson = path.join(root, 'tmp', 'bundle_a_ecology_matrix.json');
const DEFAULT_MATRIX_SEEDS = [42, 99, 137, 271, 314, 528, 777, 1337];

const MARKETS = ['phoenix', 'houston', 'dallas', 'atlanta', 'newyork'];
const YEARS = [1995, 2000, 2010, 2026];
const BUNDLE_A_FMTS = ['ADULT_HITS', 'CONSERVATIVE_TALK', 'CHRISTIAN'];
const SPANISH_PILLARS = [
  'REGIONAL_MEXICAN',
  'SPANISH_CONTEMPORARY',
  'SPANISH_TROPICAL',
  'SPANISH_ADULT_HITS',
  'SPANISH',
];
const GEN_ERA = '1985';
const MAX_STEPS = 300;
const PERIOD = 1;

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

function pct(sh) {
  return `${(Number(sh) * 100).toFixed(1)}%`;
}

function loadCtx(seed) {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  injectFormatLifecycleIife(ctx);
  vm.runInContext(injectHeadlessMegaFragNewsGuard(readFileSync(legacyPath, 'utf8')), ctx);
  vm.runInContext(readFileSync(spanishPath, 'utf8'), ctx);
  vm.runInContext(
    `if(typeof spanishCompositionInstallFmFa==='function')spanishCompositionInstallFmFa();`,
    ctx,
  );
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  vm.runInContext(`var AUDIT_SEED=${seed};`, ctx);
  return ctx;
}

function runSnapshot(ctx, marketId, targetYear, seed) {
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
        var maxSteps=${MAX_STEPS};
        var targetYear=${targetYear};
        var targetPeriod=${PERIOD};
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

        function fmtKey(fmt){
          return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
        }
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
        comm.forEach(function(st){
          var f=String(st.format||'?');
          fmtCounts[f]=(fmtCounts[f]||0)+1;
        });
        book.forEach(function(st){
          var f=String(st.format||'?');
          fmtBookCounts[f]=(fmtBookCounts[f]||0)+1;
        });

        var ranker=book.slice(0,20).map(function(st,idx){
          return {
            rank:idx+1,
            call:String(st.callLetters||'?'),
            brand:String(st.brand||'').slice(0,32),
            format:String(st.format||'?'),
            band:(st.sig&&st.sig.type)||'?',
            share:Number(st.rat&&st.rat.share)||0,
            str:String(st.str||''),
          };
        });

        var bundleA={};
        ${JSON.stringify(BUNDLE_A_FMTS)}.forEach(function(f){
          bundleA[f]={dialCount:fmtCounts[f]||0,bookCount:fmtBookCounts[f]||0,ranks:[]};
        });
        var spanish={};
        ${JSON.stringify(SPANISH_PILLARS)}.forEach(function(f){
          spanish[f]={dialCount:fmtCounts[f]||0,bookCount:fmtBookCounts[f]||0,ranks:[]};
        });
        book.forEach(function(st,idx){
          var f=String(st.format||'');
          if(bundleA[f])bundleA[f].ranks.push(idx+1);
          if(spanish[f])spanish[f].ranks.push(idx+1);
        });

        var spanishLaneShare=0;
        book.forEach(function(st){
          if(isSpanFmt(st.format))spanishLaneShare+=Number(st.rat&&st.rat.share)||0;
        });

        return {
          ok:true,
          steps:steps,
          year:G.year,
          period:G.period,
          nBook:book.length,
          nCommDial:comm.length,
          nInst:inst.length,
          fmtCounts:fmtCounts,
          bundleA:bundleA,
          spanish:spanish,
          spanishLaneShare:spanishLaneShare,
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

function formatRankerTable(ranker) {
  if (!ranker?.length) return '_No stations in book._\n';
  const lines = ['| # | Call | Format | Band | Share |', '|---|------|--------|------|-------|'];
  for (const r of ranker) {
    lines.push(`| ${r.rank} | ${r.call} | ${r.format} | ${r.band} | ${pct(r.share)} |`);
  }
  return `${lines.join('\n')}\n`;
}

function bundleASummary(bundleA, spanish, relNet) {
  const lines = [];
  lines.push('**Bundle A formats (dial / in book):**');
  for (const f of BUNDLE_A_FMTS) {
    const b = bundleA[f] || {};
    const ranks = (b.ranks || []).length ? `ranks ${b.ranks.join(', ')}` : 'not in ranker';
    lines.push(`- ${f}: ${b.dialCount ?? 0} dial · ${b.bookCount ?? 0} book · ${ranks}`);
  }
  lines.push('');
  lines.push('**Spanish lane (dial / in book):**');
  for (const f of SPANISH_PILLARS) {
    const s = spanish[f] || {};
    if ((s.dialCount || 0) === 0 && (s.bookCount || 0) === 0) continue;
    const ranks = (s.ranks || []).length ? `ranks ${s.ranks.join(', ')}` : 'not in ranker';
    lines.push(`- ${f}: ${s.dialCount ?? 0} dial · ${s.bookCount ?? 0} book · ${ranks}`);
  }
  lines.push(`- RELIGIOUS_NETWORK (institutional): ${relNet} on dial`);
  return lines.join('\n');
}

function parseArgs(argv) {
  let seed = 20260626;
  let seeds = null;
  for (const a of argv) {
    if (a.startsWith('--seed=')) seed = parseInt(a.slice(7), 10) || seed;
    if (a.startsWith('--seeds=')) {
      seeds = a
        .slice(8)
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
    }
  }
  return { seed, seeds };
}

function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function runAllCells(seed) {
  const ctx = loadCtx(seed);
  const results = [];
  for (const mid of MARKETS) {
    for (const year of YEARS) {
      const snap = runSnapshot(ctx, mid, year, seed);
      results.push({ marketId: mid, year, seed, ...snap });
    }
  }
  return results;
}

function presenceMatrix(allRuns) {
  const trackFmts = [...BUNDLE_A_FMTS, ...SPANISH_PILLARS.filter((f) => f !== 'SPANISH')];
  const cells = [];
  for (const mid of MARKETS) {
    for (const year of YEARS) {
      const rows = allRuns.filter((r) => r.marketId === mid && r.year === year && r.ok);
      const nSeeds = rows.length;
      const presence = {};
      for (const f of trackFmts) {
        const hits = rows.filter((r) => (r.bundleA?.[f]?.dialCount || r.spanish?.[f]?.dialCount || 0) > 0).length;
        presence[f] = { onDial: hits, of: nSeeds };
      }
      const spanShares = rows.map((r) => r.spanishLaneShare || 0);
      const bookCounts = rows.map((r) => r.nBook || 0);
      const dialCounts = rows.map((r) => r.nCommDial || 0);
      cells.push({
        marketId: mid,
        year,
        nSeeds,
        presence,
        spanishLaneShare: {
          min: spanShares.length ? Math.min(...spanShares) : 0,
          median: median(spanShares),
          max: spanShares.length ? Math.max(...spanShares) : 0,
        },
        nBook: { min: Math.min(...bookCounts), max: Math.max(...bookCounts) },
        nCommDial: { min: Math.min(...dialCounts), max: Math.max(...dialCounts) },
      });
    }
  }
  return cells;
}

function formatMatrixMd(seeds, cells) {
  const lines = [
    '# Bundle A — Post-Promotion Ecology Matrix',
    '',
    `**Generated:** ${new Date().toISOString().slice(0, 10)}`,
    `**Markets:** ${MARKETS.join(', ')}`,
    `**Years:** Spring ${YEARS.join(', ')}`,
    `**Seeds (${seeds.length}):** ${seeds.join(', ')}`,
    '**Architecture:** native FM pillars + `realismSpanishComposition.js`',
    '',
    'Presence = seeds with ≥1 commercial dial signal. Diagnostic only — no tuning.',
    '',
  ];

  for (const mid of MARKETS) {
    lines.push(`## ${mid.toUpperCase()}`);
    lines.push('');
    for (const year of YEARS) {
      const cell = cells.find((c) => c.marketId === mid && c.year === year);
      if (!cell) continue;
      lines.push(`### ${year} Spring`);
      lines.push(
        `**Stations in book:** ${cell.nBook.min}–${cell.nBook.max} · **commercial dial:** ${cell.nCommDial.min}–${cell.nCommDial.max}`,
      );
      lines.push(
        `**Spanish lane book share:** ${pct(cell.spanishLaneShare.min)} – ${pct(cell.spanishLaneShare.median)} (median) – ${pct(cell.spanishLaneShare.max)}`,
      );
      lines.push('');
      lines.push('| Format | On dial (of seeds) |');
      lines.push('|--------|-------------------|');
      for (const f of [...BUNDLE_A_FMTS, ...SPANISH_PILLARS.filter((x) => x !== 'SPANISH')]) {
        const p = cell.presence[f];
        if (!p) continue;
        lines.push(`| ${f} | ${p.onDial}/${p.of} |`);
      }
      lines.push('');
    }
  }

  lines.push('## Cross-market presence summary (2026 Spring)');
  lines.push('');
  lines.push('| Format | Phoenix | Houston | Dallas | Atlanta | NYC |');
  lines.push('|--------|---------|---------|--------|---------|-----|');
  const y2026 = YEARS[YEARS.length - 1];
  const trackFmts = [...BUNDLE_A_FMTS, ...SPANISH_PILLARS.filter((f) => f !== 'SPANISH')];
  for (const f of trackFmts) {
    const cols = MARKETS.map((mid) => {
      const cell = cells.find((c) => c.marketId === mid && c.year === y2026);
      const p = cell?.presence[f];
      return p ? `${p.onDial}/${p.of}` : '—';
    });
    lines.push(`| ${f} | ${cols.join(' | ')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function mainSingleSeed(seed) {
  const opts = { seed };
  const ctx = loadCtx(opts.seed);
  const results = [];
  const md = [
    '# Bundle A — Multi-Market Ecology Smoke Test',
    '',
    `**Generated:** ${new Date().toISOString().slice(0, 10)}`,
    `**Markets:** ${MARKETS.join(', ')}`,
    `**Years:** Spring ${YEARS.join(', ')}`,
    `**Cold start:** genMarketMP(\`${GEN_ERA}\`) → advTurn to target`,
    `**Spanish Composition:** foundation (\`realismSpanishComposition.js\` + native FM pillars)`,
    `**Seed:** ${opts.seed}`,
    '',
    'Diagnostic only — no HHI, concentration scoring, or tuning recommendations.',
    '',
  ];

  for (const mid of MARKETS) {
    md.push(`## ${mid.toUpperCase()}`);
    md.push('');
    for (const year of YEARS) {
      const snap = runSnapshot(ctx, mid, year, opts.seed);
      results.push({ marketId: mid, year, ...snap });
      md.push(`### ${year} Spring`);
      if (!snap.ok) {
        md.push(`**ERROR:** ${snap.err} (stopped ${snap.atYear} P${snap.atPeriod}, ${snap.steps} steps)`);
        md.push('');
        continue;
      }
      md.push(
        `**Stations:** ${snap.nBook} in book · ${snap.nCommDial} commercial on dial · ${snap.nInst} institutional/NCE · ${snap.relNet} RELIGIOUS_NETWORK`,
      );
      md.push(`**Spanish lane book share:** ${pct(snap.spanishLaneShare)}`);
      md.push('');
      md.push(bundleASummary(snap.bundleA, snap.spanish, snap.relNet));
      md.push('');
      md.push('**Ranker (top 20):**');
      md.push('');
      md.push(formatRankerTable(snap.ranker));
    }
  }

  md.push('## Format dial inventory (all markets, last cell)');
  md.push('');
  const last = results.filter((r) => r.ok && r.year === 2026);
  for (const r of last) {
    const fmts = Object.entries(r.fmtCounts || {}).sort((a, b) => b[1] - a[1]);
    md.push(`**${r.marketId}:** ${fmts.map(([f, n]) => `${f}×${n}`).join(', ') || '(none)'}`);
  }

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(outMd, `${md.join('\n')}\n`);
  writeFileSync(outJson, JSON.stringify({ meta: { seed: opts.seed, markets: MARKETS, years: YEARS }, results }, null, 2));
  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
}

function mainMatrix(seeds) {
  const allRuns = [];
  for (const seed of seeds) {
    console.log(`seed ${seed}…`);
    allRuns.push(...runAllCells(seed));
  }
  const cells = presenceMatrix(allRuns);
  const md = formatMatrixMd(seeds, cells);
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(outMatrixMd, md);
  writeFileSync(
    outMatrixJson,
    JSON.stringify({ meta: { seeds, markets: MARKETS, years: YEARS }, cells, runs: allRuns }, null, 2),
  );
  console.log(`Wrote ${outMatrixMd}`);
  console.log(`Wrote ${outMatrixJson}`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.seeds?.length > 1) {
    mainMatrix(opts.seeds);
    return;
  }
  if (opts.seeds?.length === 1) {
    mainSingleSeed(opts.seeds[0]);
    return;
  }
  mainSingleSeed(opts.seed);
}

main();
