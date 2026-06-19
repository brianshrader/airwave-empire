#!/usr/bin/env node
/**
 * Appeal quality exponent A/B — diagnostic only.
 *
 * Freezes cold-start books, varies (OQ/65)^p in appl(), re-runs full recalc.
 * Tests whether appeal curvature (not station count) can land on Duncan AQH bands.
 *
 *   node scripts/diag-share-appeal-exponent-ab.mjs
 *   node scripts/diag-share-appeal-exponent-ab.mjs --quick
 *
 * Artifacts: tmp/share_appeal_exponent_ab.json, tmp/share_appeal_exponent_ab.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { patchLegacyForShareDecomp, DUNCAN_AQH_ENVELOPES, envelopeFor, pct, inBand } from './diag-share-decomposition-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'share_appeal_exponent_ab.json');
const outMd = path.join(root, 'tmp', 'share_appeal_exponent_ab.md');

const DEFAULT_MARKETS = ['newyork', 'nashville'];
const DEFAULT_YEARS = [1995, 2003, 2010];
const DEFAULT_RUNS = 6;
const DEFAULT_SEED = 20260622;
const MAX_STEPS = 340;
const EXPONENTS = [1.0, 1.15, 1.25, 1.35, 1.5];

function injectHeadlessLaunchNewsGuard(src) {
  return src
    .replace(
      'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    )
    .replace(
      'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    )
    .replace(
      'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    );
}

function patchAppealExponent(src) {
  if (src.includes('G._diagAppealQExponent')) return src;
  return src.replace(
    'const q=s.oq/65;',
    'const _qBase=Math.max(0,s.oq/65);const _qExp=(G&&typeof G._diagAppealQExponent===\'number\')?G._diagAppealQExponent:1;const q=_qExp===1?_qBase:Math.pow(_qBase,_qExp);',
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
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: console.error, table: () => {} },
    __WL_HEADLESS__: true,
    globalThis: null, window: null, document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
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
      getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      },
    },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
    parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    Int8Array, Uint8Array, Buffer, Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function loadCtx() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  src = patchAppealExponent(src);
  src = patchLegacyForShareDecomp(src);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { markets: DEFAULT_MARKETS, years: DEFAULT_YEARS, runs: DEFAULT_RUNS, seed: DEFAULT_SEED };
  for (const a of argv) {
    if (a === '--quick') { o.markets = ['newyork', 'nashville']; o.years = [2003, 2010]; o.runs = 4; }
    else if (a.startsWith('--markets=')) o.markets = a.slice(10).split(',').map((x) => x.trim()).filter(Boolean);
    else if (a.startsWith('--years=')) o.years = a.slice(8).split(',').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
    else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
  }
  return o;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function buildMarkdown(report) {
  const lines = [
    '# Appeal Quality Exponent A/B',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Tests `(OQ/65)^p` in `appl()` on frozen books; full `recalc()` pipeline.',
    '',
    `Exponents: ${report.exponents.join(', ')}`,
    '',
  ];

  for (const cell of report.cells) {
    lines.push(`## ${cell.marketId} · ${cell.year}`);
    if (cell.envelope?.note) lines.push(`Duncan: ${cell.envelope.note}`);
    lines.push('');
    lines.push('| p | L1 #1 | Final #1 | top-3 | ≥10% | In Duncan #1 band? |');
    lines.push('| ---: | ---: | ---: | ---: | ---: | --- |');
    for (const row of cell.byExponent) {
      const ok = inBand(row.final.share1 * 100, cell.envelope?.share1);
      lines.push(
        `| ${row.exponent.toFixed(2)} | ${pct(row.l1?.share1)} | ${pct(row.final.share1)} | ${pct(row.final.top3)} | ${row.final.ge10?.toFixed(1) ?? '—'} | ${ok ? 'yes' : 'no'} |`,
      );
    }
    lines.push('');
    const best = cell.bestExponent;
    if (best) {
      lines.push(`**Closest to Duncan #1 mid-band:** p=${best.exponent} → final #1 ${pct(best.final.share1)} (target ${cell.envelope?.share1?.join('–')}%)`);
      lines.push('');
    }
  }

  lines.push('## Interpretation');
  lines.push('- If high p (1.35–1.5) lands NYC in band but Nashville falls below → tier-specific exponents may be needed.');
  lines.push('- If no p fixes both markets → appeal curvature alone is insufficient; post-L1 layers still matter.');
  lines.push('');
  return lines.join('\n');
}

const RUN_IIFE = `
(function(MAX_STEPS,EXPONENTS){
  function commercialMetrics(stations){
    var comm=(stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'
        &&!stationIsNoncommercialInstitutional(s)&&s.rat;
    });
    var shares=comm.map(function(s){return Number(s.rat.share)||0;}).sort(function(a,b){return b-a;});
    var top3=0,i;for(i=0;i<3&&i<shares.length;i++)top3+=shares[i];
    var ge10=0;for(i=0;i<shares.length;i++)if(shares[i]>=0.10)ge10++;
    return {share1:shares[0]||0,top3:top3,ge10:ge10,nComm:comm.length};
  }
  function simToYear(marketId,targetYear,seedVal){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    var sc=SC.find(function(x){return x.id==='chrwar';});
    var oi=sc.idx; sc.idx=[];
    G=genMarket('chrwar');
    sc.idx=oi;
    G.stations.forEach(function(st){st.isPlayer=false;});
    G.ps=[];
    var steps=0;
    while(steps<MAX_STEPS){
      if(G.year===targetYear&&G.period===1)break;
      if(G.year>targetYear)return {ok:false,err:'overshoot'};
      var ui=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui.restore();}
      steps++;
    }
    if(G.year!==targetYear)return {ok:false,err:'miss'};
    return {ok:true,frozen:JSON.parse(JSON.stringify(G.stations))};
  }
  function runExponent(frozenStations,marketId,year,exp){
    var stations=JSON.parse(JSON.stringify(frozenStations));
    G.stations=stations;
    G.marketId=marketId;
    G.year=year;
    G.period=1;
    G._diagAppealQExponent=exp;
    G._shareDecompActive=true;
    G._shareDecompLayers=[];
    if(typeof recalc==='function')recalc(stations,G);
    var l1=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L1_postCohort';});
    var fin=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L8_final';});
    return {
      exponent:exp,
      l1:l1||null,
      final:fin?{share1:fin.share1,top3:fin.top3,ge10:fin.ge10,hhi:fin.hhi}:commercialMetrics(stations)
    };
  }
  return {simToYear:simToYear,runExponent:runExponent};
})
`;

function pickBestExponent(byExponent, envelope) {
  if (!envelope?.share1) return null;
  const target = (envelope.share1[0] + envelope.share1[1]) / 2 / 100;
  let best = null;
  let bestDist = Infinity;
  for (const row of byExponent) {
    const d = Math.abs(row.final.share1 - target);
    if (d < bestDist) {
      bestDist = d;
      best = row;
    }
  }
  return best;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  console.log('Loading legacy + appeal exponent + decomposition hooks…');
  const ctx = loadCtx();
  const api = vm.runInContext(`${RUN_IIFE}(${MAX_STEPS},${JSON.stringify(EXPONENTS)})`, ctx);

  const cells = [];
  const failures = [];

  for (const marketId of opts.markets) {
    for (const year of opts.years) {
      console.log(`==> ${marketId} ${year}`);
      const byExponentAgg = EXPONENTS.map((exp) => ({ exponent: exp, l1: [], final: [] }));
      let runsOk = 0;

      for (let run = 0; run < opts.runs; run++) {
        const seedVal = opts.seed + marketSalt(marketId) * 17 + year * 10007 + run * 9973;
        let frozen;
        try {
          const sim = api.simToYear(marketId, year, seedVal);
          if (!sim.ok) {
            failures.push({ marketId, year, run, ...sim });
            continue;
          }
          frozen = sim.frozen;
        } catch (e) {
          failures.push({ marketId, year, run, err: String(e?.message || e) });
          continue;
        }
        runsOk++;
        for (const exp of EXPONENTS) {
          try {
            const r = api.runExponent(frozen, marketId, year, exp);
            const slot = byExponentAgg.find((x) => x.exponent === exp);
            if (r.l1) slot.l1.push(r.l1);
            slot.final.push(r.final);
          } catch (e) {
            failures.push({ marketId, year, run, exp, err: String(e?.message || e) });
          }
        }
      }

      const envelope = envelopeFor(marketId, year);
      const byExponent = byExponentAgg.map((slot) => ({
        exponent: slot.exponent,
        l1: {
          share1: mean(slot.l1.map((x) => x.share1)),
          top3: mean(slot.l1.map((x) => x.top3)),
        },
        final: {
          share1: mean(slot.final.map((x) => x.share1)),
          top3: mean(slot.final.map((x) => x.top3)),
          ge10: mean(slot.final.map((x) => x.ge10)),
          hhi: mean(slot.final.map((x) => x.hhi)),
        },
      }));

      cells.push({
        marketId,
        year,
        envelope,
        runsOk,
        byExponent,
        bestExponent: pickBestExponent(byExponent, envelope),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: opts,
    exponents: EXPONENTS,
    cells,
    failures,
    duncanEnvelopes: DUNCAN_AQH_ENVELOPES,
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outMd, `${buildMarkdown(report)}\n`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);

  for (const cell of cells) {
    const b = cell.bestExponent;
    if (!b) continue;
    console.log(
      `  ${cell.marketId} ${cell.year}: best p=${b.exponent} → #1 ${pct(b.final.share1)} (Duncan ${cell.envelope?.share1?.join('–')}%)`,
    );
  }
}

main();
