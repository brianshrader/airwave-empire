#!/usr/bin/env node
/**
 * Post-L1 layer sweep — diagnostic only.
 * On frozen books, toggles skip flags for long-tail / otherAudio / listeningHours / trim.
 *
 *   node scripts/diag-share-post-l1-sweep.mjs --quick
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  injectHeadlessLaunchNewsGuard,
  patchLegacyForShareDecomp,
  patchPostL1Skips,
  DUNCAN_AQH_ENVELOPES,
  envelopeFor,
  pct,
  inBand,
  mean,
  marketSalt,
} from './diag-share-decomposition-lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'share_post_l1_sweep.json');
const outMd = path.join(root, 'tmp', 'share_post_l1_sweep.md');

const MAX_STEPS = 340;
const VARIANTS = {
  baseline: { label: 'Full pipeline', flags: {} },
  noLongTail: { label: 'Skip long-tail smooth', flags: { _diagSkipLongTail: true } },
  noOtherAudio: { label: 'Skip otherAudio dilution', flags: { _diagSkipOtherAudio: true } },
  noListeningHours: { label: 'Skip listeningHours AQH remap', flags: { _diagSkipListeningHours: true } },
  noTrimBoost: { label: 'Skip Top40/Spanish trim boost', flags: { _diagSkipTrimBoost: true } },
  l1Only: {
    label: 'Skip all post-L1 layers',
    flags: { _diagSkipLongTail: true, _diagSkipOtherAudio: true, _diagSkipListeningHours: true, _diagSkipTrimBoost: true },
  },
};

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
    __WL_HEADLESS__: true, globalThis: null, window: null, document: documentStub,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { reload: () => {}, search: '', href: '' },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0; },
    setInterval: () => 0, clearTimeout: () => {}, clearInterval: () => {},
    requestAnimationFrame: (fn) => { if (typeof fn === 'function') fn(); },
    alert: () => {}, fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; }, randomUUID: () => '00000000-0000-4000-8000-000000000000' },
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

function loadCtx() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  let src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  src = patchLegacyForShareDecomp(patchPostL1Skips(src));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

const RUN_IIFE = `
(function(MAX_STEPS){
  function simToYear(marketId,y,seedVal){
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
      if(G.year===y&&G.period===1)break;
      if(G.year>y)return {ok:false};
      var ui=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui.restore();}
      steps++;
    }
    if(G.year!==y)return {ok:false};
    return {ok:true,frozen:JSON.parse(JSON.stringify(G.stations))};
  }
  function runVariant(frozen,marketId,y,flags){
    var stations=JSON.parse(JSON.stringify(frozen));
    G.stations=stations; G.marketId=marketId; G.year=y; G.period=1;
    G._shareDecompActive=true; G._shareDecompLayers=[];
    G._diagSkipLongTail=false; G._diagSkipOtherAudio=false;
    G._diagSkipListeningHours=false; G._diagSkipTrimBoost=false;
    if(flags)Object.keys(flags).forEach(function(k){G[k]=flags[k];});
    recalc(stations,G);
    var l1=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L1_postCohort';});
    var fin=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L8_final';});
    return {l1:l1,final:fin};
  }
  return {simToYear:simToYear,runVariant:runVariant};
})(${MAX_STEPS})
`;

function main() {
  const quick = process.argv.includes('--quick');
  const markets = ['newyork', 'nashville'];
  const years = quick ? [2003, 2010] : [1995, 2003, 2010];
  const runs = quick ? 4 : 6;
  const seed = 20260623;

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const ctx = loadCtx();
  const api = vm.runInContext(RUN_IIFE, ctx);
  const cells = [];

  for (const marketId of markets) {
    for (const year of years) {
      const byVariant = {};
      for (const key of Object.keys(VARIANTS)) byVariant[key] = { l1: [], final: [] };

      for (let run = 0; run < runs; run++) {
        const sim = api.simToYear(marketId, year, seed + marketSalt(marketId) * 17 + year * 10007 + run * 9973);
        if (!sim.ok) continue;
        for (const [vkey, vdef] of Object.entries(VARIANTS)) {
          const r = api.runVariant(sim.frozen, marketId, year, vdef.flags);
          if (r.l1) byVariant[vkey].l1.push(r.l1);
          if (r.final) byVariant[vkey].final.push(r.final);
        }
      }

      const rows = Object.entries(VARIANTS).map(([vkey, vdef]) => ({
        variant: vkey,
        label: vdef.label,
        l1Share1: mean(byVariant[vkey].l1.map((x) => x.share1)),
        finalShare1: mean(byVariant[vkey].final.map((x) => x.share1)),
        finalTop3: mean(byVariant[vkey].final.map((x) => x.top3)),
        finalGe10: mean(byVariant[vkey].final.map((x) => x.ge10)),
      }));

      cells.push({ marketId, year, envelope: envelopeFor(marketId, year), rows });
    }
  }

  const md = ['# Post-L1 Layer Sweep', '', `Generated: ${new Date().toISOString()}`, ''];
  for (const cell of cells) {
    md.push(`## ${cell.marketId} · ${cell.year}`);
    md.push(`Duncan #1 band: ${cell.envelope?.share1?.join('–')}%`);
    md.push('');
    md.push('| Variant | L1 #1 | Final #1 | Δ final vs baseline | top-3 | ≥10% |');
    md.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    const base = cell.rows.find((r) => r.variant === 'baseline');
    for (const row of cell.rows) {
      const d = base && row.variant !== 'baseline' ? row.finalShare1 - base.finalShare1 : 0;
      md.push(`| ${row.label} | ${pct(row.l1Share1)} | ${pct(row.finalShare1)} | ${row.variant === 'baseline' ? '—' : `${d >= 0 ? '+' : ''}${pct(d, 2)}`} | ${pct(row.finalTop3)} | ${row.finalGe10?.toFixed(1) ?? '—'} |`);
    }
    md.push('');
  }

  writeFileSync(outJson, `${JSON.stringify({ cells, variants: VARIANTS, duncanEnvelopes: DUNCAN_AQH_ENVELOPES }, null, 2)}\n`);
  writeFileSync(outMd, `${md.join('\n')}\n`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
}

main();
