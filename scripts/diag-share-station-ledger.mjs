#!/usr/bin/env node
/**
 * Audited per-station share ledger — traces one leader from L1 target through final display.
 *
 *   node scripts/diag-share-station-ledger.mjs
 *   node scripts/diag-share-station-ledger.mjs --market=newyork --year=2003 --variant=I
 *
 * Artifacts: tmp/share_station_ledger.json, tmp/share_station_ledger.md
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
  patchShareLedgerHooks,
  patchPostL1Skips,
  patchAppealExponent,
  pct,
  marketSalt,
} from './diag-share-decomposition-lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'share_station_ledger.json');
const outMd = path.join(root, 'tmp', 'share_station_ledger.md');

const MAX_STEPS = 340;
const DEFAULT_SEED = 20260624;

const VARIANTS = {
  baseline: { label: 'Baseline (full pipeline)', flags: {} },
  tierSkipLH: {
    label: 'Tier + skip listeningHours',
    flags: { _diagCommercialMassScaleTier: true, _diagSkipListeningHours: true },
  },
  tierL1Only: {
    label: 'Tier + skip all post-L1 + endgame',
    flags: {
      _diagCommercialMassScaleTier: true,
      _diagSkipLongTail: true,
      _diagSkipOtherAudio: true,
      _diagSkipListeningHours: true,
      _diagSkipTrimBoost: true,
      _diagSkipEndgameRepairs: true,
    },
  },
  tierL1NoSports: {
    label: 'Tier + skip all post-L1 + endgame + sports',
    flags: {
      _diagCommercialMassScaleTier: true,
      _diagSkipLongTail: true,
      _diagSkipOtherAudio: true,
      _diagSkipListeningHours: true,
      _diagSkipTrimBoost: true,
      _diagSkipEndgameRepairs: true,
      _diagSkipSports: true,
    },
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
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; }, clearTimeout() {}, clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {}, fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} }, FileReader: class { readAsText() {} },
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
  src = patchShareLedgerHooks(patchAppealExponent(patchLegacyForShareDecomp(patchPostL1Skips(src))));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { market: 'newyork', year: 2003, variant: 'tierL1Only', seed: DEFAULT_SEED };
  for (const a of argv) {
    if (a.startsWith('--market=')) o.market = a.slice(9).trim();
    else if (a.startsWith('--year=')) o.year = parseInt(a.slice(7), 10);
    else if (a.startsWith('--variant=')) o.variant = a.slice(10).trim();
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
  }
  return o;
}

function sh(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(2)}%`;
}

function buildMarkdown(report) {
  const lines = [
    '# Share Station Ledger Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `**Market:** ${report.marketId} · **Year:** ${report.year} · **Variant:** ${report.variantLabel}`,
    '',
    'Traces the L1 #1 station (pinned by id after first L1 capture) through every checkpoint.',
    '',
  ];

  if (report.rankHandoff) {
    lines.push('## Rank handoff warning');
    lines.push('');
    lines.push(report.rankHandoff);
    lines.push('');
  }

  if (report.pinnedStation) {
    lines.push('## Pinned station (L1 #1)');
    lines.push('');
    lines.push(`- **${report.pinnedStation.callLetters}** (${report.pinnedStation.format}) · id \`${report.pinnedStation.stationId}\``);
    lines.push('');
  }

  lines.push('## Ledger checkpoints');
  lines.push('');
  lines.push('| Checkpoint | Rank | #1 on book | Headline | Cohort-wtd | Desync? | AQH/total | Δ headline | hist[-1] | comm sum |');
  lines.push('| --- | ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |');

  let prev = null;
  for (const row of report.ledger) {
    const delta = prev != null ? row.headlineShare - prev : null;
    const deltaStr = delta == null ? '—' : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(2)}%`;
    const desync = Math.abs((row.headlineShare || 0) - (row.cohortWeightedShare || 0)) > 0.002 ? 'YES' : '—';
    const rank1 = row.rank1Call !== row.callLetters
      ? `${row.rank1Call} ${sh(row.rank1Share)}`
      : `${row.rank1Call} ${sh(row.rank1Share)} ✓`;
    lines.push(
      `| ${row.tag} | ${row.rank} | ${rank1} | ${sh(row.headlineShare)} | ${sh(row.cohortWeightedShare)} | ${desync} | ${sh(row.aqhShare)} | ${deltaStr} | ${row.histLastShare != null ? sh(row.histLastShare) : '—'} | ${sh(row.commBookSum)} |`,
    );
    prev = row.headlineShare;
  }

  lines.push('');
  lines.push('## Interpretation keys');
  lines.push('');
  lines.push('- **Headline** = `rat.share` (displayed book %).');
  lines.push('- **Cohort-wtd** = recomputed from `rat.cur[*].share` × pop × engage / habitDenom (should match headline unless desynced).');
  lines.push('- **AQH/total** = `rat.aqh` / sum(all rated AQH) — what listeningHours remap would produce.');
  lines.push('- **hist[-1]** = prior period book share from frozen `rat.hist` (repair paths read this).');
  lines.push('');

  if (report.marketRank1Trail?.length) {
    lines.push('## Market #1 at each checkpoint (may differ from pinned station)');
    lines.push('');
    for (const row of report.marketRank1Trail) {
      lines.push(`- **${row.tag}:** ${row.rank1Call} ${sh(row.rank1Share)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

const RUN_IIFE = `
(function(MAX_STEPS, marketId, year, seedVal, flags){
  ACTIVE_MARKET=marketId;
  if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
  var s=seedVal;
  Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
  var sc=SC.find(function(x){return x.id==='chrwar';});
  var oi=sc.idx; sc.idx=[]; G=genMarket('chrwar'); sc.idx=oi;
  G.stations.forEach(function(st){st.isPlayer=false;});
  G.ps=[];
  var steps=0;
  while(steps<MAX_STEPS){
    if(G.year===year&&G.period===1)break;
    if(G.year>year)return {ok:false,reason:'overshot'};
    var ui=window._harnessPatchTimersAndUi();
    try{advTurn();}finally{ui.restore();}
    steps++;
  }
  if(G.year!==year)return {ok:false,reason:'no_reach'};
  var frozen=JSON.parse(JSON.stringify(G.stations));

  function applyFlags(){
    G._diagCommercialMassScale=undefined;
    G._diagCommercialMassScaleTier=false;
    G._diagAppealQExponent=undefined;
    G._diagSkipLongTail=false;
    G._diagSkipOtherAudio=false;
    G._diagSkipListeningHours=false;
    G._diagSkipTrimBoost=false;
    G._diagSkipEndgameRepairs=false;
    Object.keys(flags||{}).forEach(function(k){G[k]=flags[k];});
  }

  function runLedger(){
    var stations=JSON.parse(JSON.stringify(frozen));
    G.stations=stations; G.marketId=marketId; G.year=year; G.period=1;
    G._shareDecompActive=true; G._shareLedgerActive=true;
    G._shareDecompLayers=[]; G._shareLedgerRows=[];
    G._shareLedgerStationId=null;
    applyFlags();
    recalc(stations,G);

    var rows=G._shareLedgerRows||[];
    var l1=rows.find(function(r){return r.tag==='L1_postMassScale';});
    if(l1&&l1.stationId){
      G._shareLedgerStationId=l1.stationId;
      G._shareLedgerRows=[];
      G._shareDecompLayers=[];
      stations=JSON.parse(JSON.stringify(frozen));
      G.stations=stations;
      applyFlags();
      recalc(stations,G);
      rows=G._shareLedgerRows||[];
    }

    var layers=G._shareDecompLayers||[];
    var l1Layer=layers.find(function(l){return l.layer==='L1_postCohort';});
    var l8Layer=layers.find(function(l){return l.layer==='L8_final';});
    var rank1Trail=rows.map(function(r){
      return {tag:r.tag,rank1Call:r.rank1Call,rank1Share:r.rank1Share,rank1Id:r.rank1Id};
    });
    var pinned=rows.find(function(r){return r.tag==='L1_postMassScale';})||rows[0];
    var finalRow=rows.find(function(r){return r.tag==='L8_final';})||rows[rows.length-1];
    var handoff=null;
    if(pinned&&finalRow&&pinned.stationId!==finalRow.rank1Id){
      handoff='L1 pinned #1 '+pinned.callLetters+' ('+pinned.stationId+') but final market #1 is '
        +finalRow.rank1Call+' ('+finalRow.rank1Id+'). Aggregate L1 vs final #1 compares different stations.';
    } else if(pinned&&finalRow&&Math.abs(pinned.headlineShare-finalRow.headlineShare)>0.005){
      handoff='Same station '+pinned.callLetters+' but headline moved '
        +(pinned.headlineShare*100).toFixed(2)+'% → '+(finalRow.headlineShare*100).toFixed(2)+'%.';
    }
    return {
      ledger:rows,
      decomp:{l1Share1:l1Layer?l1Layer.share1:null,finalShare1:l8Layer?l8Layer.share1:null},
      pinnedStation:pinned?{stationId:pinned.stationId,callLetters:pinned.callLetters,format:pinned.format}:null,
      rankHandoff:handoff,
      marketRank1Trail:rank1Trail,
      scaleApplied:G._diagCommercialMassScaleApplied,
    };
  }

  return {ok:true,result:runLedger(),frozenLeader:(function(){
    var st=JSON.parse(JSON.stringify(frozen));
    var comm=st.filter(function(s){return s&&s.rat&&!s.isPublic;});
    comm.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    var lead=comm[0];
    return lead?{callLetters:lead.callLetters,share:lead.rat.share,histLast:lead.rat.hist?.length?lead.rat.hist[lead.rat.hist.length-1].share:null}:null;
  })()};
})(${MAX_STEPS}, __MARKET__, __YEAR__, __SEED__, __FLAGS__)
`;

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const vdef = VARIANTS[opts.variant] || VARIANTS.tierL1Only;
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  console.log(`Loading legacy + ledger hooks…`);
  const ctx = loadCtx();
  const code = RUN_IIFE
    .replace('__MARKET__', JSON.stringify(opts.market))
    .replace('__YEAR__', String(opts.year))
    .replace('__SEED__', String(opts.seed + marketSalt(opts.market) * 17 + opts.year * 10007))
    .replace('__FLAGS__', JSON.stringify(vdef.flags));

  const out = vm.runInContext(code, ctx);
  if (!out.ok) {
    console.error('Sim failed:', out.reason);
    process.exit(1);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    marketId: opts.market,
    year: opts.year,
    variant: opts.variant,
    variantLabel: vdef.label,
    flags: vdef.flags,
    frozenLeader: out.frozenLeader,
    scaleApplied: out.result.scaleApplied,
    decomp: out.result.decomp,
    pinnedStation: out.result.pinnedStation,
    rankHandoff: out.result.rankHandoff,
    ledger: out.result.ledger,
    marketRank1Trail: out.result.marketRank1Trail,
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outMd, `${buildMarkdown(report)}\n`);

  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Frozen-book leader: ${out.frozenLeader?.callLetters} ${pct(out.frozenLeader?.share)} (hist ${pct(out.frozenLeader?.histLast)})`);
  console.log(`Decomp L1 #1: ${pct(report.decomp.l1Share1)} → final #1: ${pct(report.decomp.finalShare1)} (scale ${report.scaleApplied})`);
  if (report.pinnedStation) {
    const pin = report.ledger.find((r) => r.tag === 'L1_postMassScale');
    const fin = report.ledger.find((r) => r.tag === 'L8_final');
    if (pin && fin) {
      console.log(`Pinned ${report.pinnedStation.callLetters}: ${pct(pin.headlineShare)} → ${pct(fin.headlineShare)}`);
    }
  }
  if (report.rankHandoff) console.log(`NOTE: ${report.rankHandoff}`);
}

main();
