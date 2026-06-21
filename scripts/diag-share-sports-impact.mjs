#!/usr/bin/env node
/**
 * Sports rights impact on tier-scaled share books — diagnostic only.
 *
 * Compares corrected L1 (tier mass scale) vs final with/without sports pass.
 * Measures how often sports adds 1+/2+/3+ pts to the pre-sports #1 station.
 *
 *   node scripts/diag-share-sports-impact.mjs
 *   node scripts/diag-share-sports-impact.mjs --quick
 *
 * Artifacts: tmp/share_sports_impact.json, tmp/share_sports_impact.md
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
  DUNCAN_AQH_ENVELOPES,
  envelopeFor,
  pct,
  mean,
  marketSalt,
} from './diag-share-decomposition-lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'share_sports_impact.json');
const outMd = path.join(root, 'tmp', 'share_sports_impact.md');

const MAX_STEPS = 340;
const DEFAULT_MARKETS = ['newyork', 'nashville'];
const DEFAULT_YEARS = [1995, 2003, 2010];
const DEFAULT_RUNS = 6;
const DEFAULT_SEED = 20260625;

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
  const o = { markets: DEFAULT_MARKETS, years: DEFAULT_YEARS, runs: DEFAULT_RUNS, seed: DEFAULT_SEED };
  for (const a of argv) {
    if (a === '--quick') {
      o.markets = ['newyork', 'nashville'];
      o.years = [2003, 2010];
      o.runs = 4;
    } else if (a.startsWith('--markets=')) {
      o.markets = a.slice(10).split(',').map((x) => x.trim()).filter(Boolean);
    } else if (a.startsWith('--years=')) {
      o.years = a.slice(8).split(',').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
    } else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_SEED;
  }
  return o;
}

function pt(x) {
  if (x == null || Number.isNaN(x)) return null;
  return x * 100;
}

function buildMarkdown(report) {
  const lines = [
    '# Sports Rights Share Impact',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Tier-scaled commercial mass (corrected two-pass denom) · full post-L1 pipeline except sports toggled.',
    '',
  ];

  for (const cell of report.cells) {
    const env = cell.envelope;
    lines.push(`## ${cell.marketId} · ${cell.year}`);
    if (env?.note) lines.push(`Duncan: ${env.note}`);
    if (env?.share1) lines.push(`#1 band: ${env.share1[0]}–${env.share1[1]}%`);
    lines.push('');
    lines.push('| Metric | Mean |');
    lines.push('| --- | ---: |');
    lines.push(`| Corrected L1 #1 | ${pct(cell.summary.l1Share1)} |`);
    lines.push(`| Final **with** sports | ${pct(cell.summary.finalWithSports)} |`);
    lines.push(`| Final **without** sports | ${pct(cell.summary.finalNoSports)} |`);
    lines.push(`| Sports Δ on pre-sports #1 (all runs) | ${cell.summary.sportsDeltaPts != null ? `${cell.summary.sportsDeltaPts >= 0 ? '+' : ''}${cell.summary.sportsDeltaPts.toFixed(2)} pts` : '—'} |`);
    if (env?.share1) {
      const lo = env.share1[0] / 100;
      const hi = env.share1[1] / 100;
      const inBand = cell.summary.finalNoSports != null && cell.summary.finalNoSports >= lo && cell.summary.finalNoSports <= hi;
      lines.push(`| Final no-sports in Duncan #1 band? | ${inBand ? 'yes' : 'no'} |`);
    }
    lines.push('');
    lines.push('**Pre-sports #1 sports boost (all runs)**');
    lines.push('');
    lines.push(`- ≥1.0 pt: ${cell.summary.ge1}/${cell.runs.length} (${pct(cell.summary.ge1Rate, 0)})`);
    lines.push(`- ≥2.0 pt: ${cell.summary.ge2}/${cell.runs.length} (${pct(cell.summary.ge2Rate, 0)})`);
    lines.push(`- ≥3.0 pt: ${cell.summary.ge3}/${cell.runs.length} (${pct(cell.summary.ge3Rate, 0)})`);
    lines.push(`- Pre-sports #1 holds any rights: ${cell.summary.holderRuns}/${cell.runs.length}`);
    lines.push('');
    lines.push('**When pre-sports #1 holds sports rights**');
    lines.push('');
    if (cell.summary.holderRuns) {
      lines.push(`- Mean sports Δ on that leader: ${cell.summary.holderDeltaPts != null ? `${cell.summary.holderDeltaPts >= 0 ? '+' : ''}${cell.summary.holderDeltaPts.toFixed(2)} pts` : '—'}`);
      lines.push(`- ≥1.0 pt: ${cell.summary.holderGe1}/${cell.summary.holderRuns} (${pct(cell.summary.holderGe1Rate, 0)})`);
      lines.push(`- ≥2.0 pt: ${cell.summary.holderGe2}/${cell.summary.holderRuns} (${pct(cell.summary.holderGe2Rate, 0)})`);
      lines.push(`- ≥3.0 pt: ${cell.summary.holderGe3}/${cell.summary.holderRuns} (${pct(cell.summary.holderGe3Rate, 0)})`);
    } else {
      lines.push('- No runs where pre-sports #1 held rights');
    }
    lines.push('');

    if (cell.exampleRun) {
      const ex = cell.exampleRun;
      lines.push('**Example run (median sports Δ, all leaders)**');
      lines.push('');
      lines.push(`- Pre-sports #1: **${ex.preSportsLeader.call}** (${ex.preSportsLeader.format}) ${pct(ex.preSportsLeader.share)}`);
      lines.push(`- Post-sports same station: ${pct(ex.postSportsLeader.share)} (rank ${ex.postSportsLeader.rank}, Δ ${ex.sportsDeltaPts >= 0 ? '+' : ''}${ex.sportsDeltaPts.toFixed(2)} pts)`);
      lines.push(`- Final no-sports: ${pct(ex.finalNoSports)} · final with sports: ${pct(ex.finalWithSports)}`);
      if (ex.rightsHolders.length) {
        lines.push('- Rights holders:');
        for (const h of ex.rightsHolders.slice(0, 5)) {
          lines.push(`  - **${h.call}** (${h.format}): ${h.teams.join(', ')} · bonus ${(h.bonus * 100).toFixed(2)} pts`);
        }
      } else {
        lines.push('- Rights holders: none');
      }
      lines.push('');
    }

    if (cell.summary.holderExample) {
      const ex = cell.summary.holderExample;
      lines.push('**Example run (pre-sports #1 holds rights)**');
      lines.push('');
      lines.push(`- Pre-sports #1: **${ex.preSportsLeader.call}** (${ex.preSportsLeader.format}) ${pct(ex.preSportsLeader.share)}`);
      lines.push(`- Post-sports same station: ${pct(ex.postSportsLeader.share)} (Δ ${ex.sportsDeltaPts >= 0 ? '+' : ''}${ex.sportsDeltaPts.toFixed(2)} pts)`);
      const held = ex.rightsHolders.find((h) => h.id === ex.preSportsLeader.id);
      if (held) {
        lines.push(`- Holds: ${held.teams.join(', ')} · bonus ${(held.bonus * 100).toFixed(2)} pts`);
      }
      lines.push('');
    }
  }

  lines.push('## Global sports boost on pre-sports #1');
  lines.push('');
  lines.push(`Runs: ${report.global.totalRuns}`);
  lines.push(`≥1 pt (all): ${report.global.ge1} (${pct(report.global.ge1Rate, 0)}) · ≥2 pt: ${report.global.ge2} (${pct(report.global.ge2Rate, 0)}) · ≥3 pt: ${report.global.ge3} (${pct(report.global.ge3Rate, 0)})`);
  lines.push(`≥1 pt (leader holds rights): ${report.global.holderGe1}/${report.global.holderRuns} (${pct(report.global.holderGe1Rate, 0)})`);
  lines.push(`≥2 pt (leader holds rights): ${report.global.holderGe2}/${report.global.holderRuns} (${pct(report.global.holderGe2Rate, 0)})`);
  lines.push(`Post-sports market #1 ≥10%: ${report.global.finalGe10} · no-sports ≥10%: ${report.global.noSportsGe10}`);
  lines.push('');

  return lines.join('\n');
}

const RUN_IIFE = `
(function(MAX_STEPS){
  function commercialLeader(stations){
    var comm=(stations||[]).filter(function(s){
      return s&&!s._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'
        &&!stationIsNoncommercialInstitutional(s)&&s.rat;
    });
    comm.sort(function(a,b){return (Number(b.rat.share)||0)-(Number(a.rat.share)||0);});
    return comm[0]||null;
  }
  function sportsRightsReport(stations,G){
    var out=[];
    (stations||[]).forEach(function(s){
      if(!s||!s.rat||stationIsNoncommercialInstitutional(s))return;
      var bonus=getSportsBonus(s,G);
      if(bonus<=1e-6)return;
      var teams=[];
      var mkt=MARKETS[G.marketId||'atlanta']||MARKETS.atlanta;
      (mkt.teams||[]).forEach(function(team){
        if(G.year<team.introduced)return;
        var rights=G.sportsRights&&G.sportsRights[team.id];
        if(!rights||rights.holderId!==s.id)return;
        teams.push(team.name||team.id);
      });
      out.push({id:s.id,call:String(s.callLetters||''),format:String(s.format||''),bonus:bonus,teams:teams});
    });
    out.sort(function(a,b){return b.bonus-a.bonus;});
    return out;
  }
  function simToYear(marketId,y,seedVal){
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
      if(G.year===y&&G.period===1)break;
      if(G.year>y)return {ok:false};
      var ui=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui.restore();}
      steps++;
    }
    if(G.year!==y)return {ok:false};
    return {ok:true,frozen:JSON.parse(JSON.stringify(G.stations)),Gsnap:JSON.parse(JSON.stringify({sportsRights:G.sportsRights,teamRecords:G.teamRecords,year:G.year,period:G.period,marketId:G.marketId}))};
  }
  function applyTierFlags(extra){
    G._diagCommercialMassScale=undefined;
    G._diagCommercialMassScaleTier=true;
    G._diagSkipSports=false;
    if(extra) Object.keys(extra).forEach(function(k){G[k]=extra[k];});
  }
  function runRecalc(frozen,marketId,y,extra){
    var stations=JSON.parse(JSON.stringify(frozen));
    G.stations=stations; G.marketId=marketId; G.year=y; G.period=1;
    G._shareDecompActive=true; G._shareLedgerActive=true;
    G._shareDecompLayers=[]; G._shareLedgerRows=[];
    G._shareLedgerStationId=null;
    applyTierFlags(extra||{});
    recalc(stations,G);
    var l1=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L1_postCohort';});
    var fin=(G._shareDecompLayers||[]).find(function(l){return l.layer==='L8_final';});
    var pre=(G._shareLedgerRows||[]).find(function(r){return r.tag==='postHabitReconcile2';});
    var post=(G._shareLedgerRows||[]).find(function(r){return r.tag==='postAfterSportsHabit';});
    var sportsDelta=(pre&&post)?post.headlineShare-pre.headlineShare:null;
    return {
      scaleApplied:G._diagCommercialMassScaleApplied,
      l1Share1:l1?l1.share1:null,
      finalShare1:fin?fin.share1:null,
      preSportsLeader:pre?{id:pre.stationId,call:pre.callLetters,format:pre.format,share:pre.headlineShare}:null,
      postSportsLeader:post?{id:post.stationId,call:post.callLetters,format:post.format,share:post.headlineShare,rank:post.rank}:null,
      sportsDelta:sportsDelta,
      rightsHolders:sportsRightsReport(stations,G),
      ledger:G._shareLedgerRows,
    };
  }
  return {simToYear:simToYear,runRecalc:runRecalc};
})(${MAX_STEPS})
`;

function summarizeRuns(runs) {
  const deltas = runs.map((r) => r.sportsDeltaPts).filter((x) => x != null);
  const holderRunsList = runs.filter((r) => r.preSportsLeaderHoldsRights);
  const holderDeltas = holderRunsList.map((r) => r.sportsDeltaPts).filter((x) => x != null);
  const ge1 = runs.filter((r) => r.sportsDeltaPts != null && r.sportsDeltaPts >= 1).length;
  const ge2 = runs.filter((r) => r.sportsDeltaPts != null && r.sportsDeltaPts >= 2).length;
  const ge3 = runs.filter((r) => r.sportsDeltaPts != null && r.sportsDeltaPts >= 3).length;
  const hGe1 = holderRunsList.filter((r) => r.sportsDeltaPts != null && r.sportsDeltaPts >= 1).length;
  const hGe2 = holderRunsList.filter((r) => r.sportsDeltaPts != null && r.sportsDeltaPts >= 2).length;
  const hGe3 = holderRunsList.filter((r) => r.sportsDeltaPts != null && r.sportsDeltaPts >= 3).length;
  let exampleRun = null;
  let holderExample = null;
  if (deltas.length) {
    const sorted = [...runs].sort((a, b) => (a.sportsDeltaPts ?? -1) - (b.sportsDeltaPts ?? -1));
    exampleRun = sorted[Math.floor(sorted.length / 2)];
  }
  const positiveHolder = holderRunsList.filter((r) => (r.sportsDeltaPts ?? 0) > 0.05);
  if (positiveHolder.length) {
    holderExample = positiveHolder.sort((a, b) => (b.sportsDeltaPts ?? 0) - (a.sportsDeltaPts ?? 0))[0];
  } else if (holderRunsList.length) {
    holderExample = holderRunsList[0];
  }
  return {
    l1Share1: mean(runs.map((r) => r.l1Share1)),
    finalWithSports: mean(runs.map((r) => r.finalWithSports)),
    finalNoSports: mean(runs.map((r) => r.finalNoSports)),
    sportsDeltaPts: mean(deltas),
    ge1,
    ge2,
    ge3,
    ge1Rate: ge1 / runs.length,
    ge2Rate: ge2 / runs.length,
    ge3Rate: ge3 / runs.length,
    holderRuns: holderRunsList.length,
    holderDeltaPts: mean(holderDeltas),
    holderGe1: hGe1,
    holderGe2: hGe2,
    holderGe3: hGe3,
    holderGe1Rate: holderRunsList.length ? hGe1 / holderRunsList.length : 0,
    holderGe2Rate: holderRunsList.length ? hGe2 / holderRunsList.length : 0,
    holderGe3Rate: holderRunsList.length ? hGe3 / holderRunsList.length : 0,
    exampleRun,
    holderExample,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  console.log('Loading legacy + tier scale / sports skip hooks…');
  const ctx = loadCtx();
  const api = vm.runInContext(RUN_IIFE, ctx);
  const cells = [];
  const allRuns = [];

  for (const marketId of opts.markets) {
    for (const year of opts.years) {
      console.log(`==> ${marketId} ${year}`);
      const runs = [];

      for (let run = 0; run < opts.runs; run++) {
        const seed = opts.seed + marketSalt(marketId) * 17 + year * 10007 + run * 9973;
        const sim = api.simToYear(marketId, year, seed);
        if (!sim.ok) continue;

        const withSports = api.runRecalc(sim.frozen, marketId, year, {});
        const noSports = api.runRecalc(sim.frozen, marketId, year, { _diagSkipSports: true });

        const rightsIds = new Set(withSports.rightsHolders.map((h) => h.id));
        const preId = withSports.preSportsLeader?.id;
        const sportsDeltaPts = withSports.sportsDelta != null ? pt(withSports.sportsDelta) : null;

        const row = {
          run,
          seed,
          l1Share1: withSports.l1Share1,
          finalWithSports: withSports.finalShare1,
          finalNoSports: noSports.finalShare1,
          sportsDeltaPts,
          preSportsLeader: withSports.preSportsLeader,
          postSportsLeader: withSports.postSportsLeader,
          preSportsLeaderHoldsRights: preId ? rightsIds.has(preId) : false,
          rightsHolders: withSports.rightsHolders,
          scaleApplied: withSports.scaleApplied,
        };
        runs.push(row);
        allRuns.push(row);
      }

      cells.push({
        marketId,
        year,
        envelope: envelopeFor(marketId, year),
        runs,
        summary: summarizeRuns(runs),
      });
    }
  }

  const global = {
    totalRuns: allRuns.length,
    ge1: allRuns.filter((r) => r.sportsDeltaPts != null && r.sportsDeltaPts >= 1).length,
    ge2: allRuns.filter((r) => r.sportsDeltaPts != null && r.sportsDeltaPts >= 2).length,
    ge3: allRuns.filter((r) => r.sportsDeltaPts != null && r.sportsDeltaPts >= 3).length,
    ge1Rate: 0,
    ge2Rate: 0,
    ge3Rate: 0,
    holderRuns: allRuns.filter((r) => r.preSportsLeaderHoldsRights).length,
    holderGe1: allRuns.filter((r) => r.preSportsLeaderHoldsRights && r.sportsDeltaPts != null && r.sportsDeltaPts >= 1).length,
    holderGe2: allRuns.filter((r) => r.preSportsLeaderHoldsRights && r.sportsDeltaPts != null && r.sportsDeltaPts >= 2).length,
    holderGe3: allRuns.filter((r) => r.preSportsLeaderHoldsRights && r.sportsDeltaPts != null && r.sportsDeltaPts >= 3).length,
    holderGe1Rate: 0,
    holderGe2Rate: 0,
    finalGe10: allRuns.filter((r) => (r.finalWithSports || 0) >= 0.1).length,
    noSportsGe10: allRuns.filter((r) => (r.finalNoSports || 0) >= 0.1).length,
  };
  if (global.totalRuns) {
    global.ge1Rate = global.ge1 / global.totalRuns;
    global.ge2Rate = global.ge2 / global.totalRuns;
    global.ge3Rate = global.ge3 / global.totalRuns;
  }
  if (global.holderRuns) {
    global.holderGe1Rate = global.holderGe1 / global.holderRuns;
    global.holderGe2Rate = global.holderGe2 / global.holderRuns;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: opts,
    duncanEnvelopes: DUNCAN_AQH_ENVELOPES,
    cells,
    global,
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outMd, `${buildMarkdown(report)}\n`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);

  for (const cell of cells) {
    const s = cell.summary;
    console.log(
      `  ${cell.marketId} ${cell.year}: L1=${pct(s.l1Share1)} final±sports ${pct(s.finalNoSports)}/${pct(s.finalWithSports)} Δ#1=${s.sportsDeltaPts != null ? s.sportsDeltaPts.toFixed(1) + 'pt' : '—'} ge2=${s.ge2}/${cell.runs.length}`,
    );
  }
}

main();
