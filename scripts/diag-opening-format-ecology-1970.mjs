#!/usr/bin/env node
/**
 * Opening-book (1970 gen-only) format ecology audit — all playable markets.
 *
 *   node scripts/diag-opening-format-ecology-1970.mjs
 *   node scripts/diag-opening-format-ecology-1970.mjs --runs=80 --focus=sanfrancisco
 *
 * Artifacts: tmp/opening_format_ecology_1970.json, tmp/opening_format_ecology_1970.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import { ALL_PLAYABLE_MARKET_IDS } from './market-ids.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'opening_format_ecology_1970.json');
const outMd = path.join(root, 'tmp', 'opening_format_ecology_1970.md');

const DEFAULT_RUNS = 80;
const DEFAULT_SEED = 20260603;
const YEAR = 1970;

const ROCK_FMTS = ['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK', 'AAA', 'CLASSIC_HITS', 'OLDIES'];

function injectHeadlessLaunchNewsGuard(src) {
  let out = src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  return out;
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
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        return a;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      },
    },
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    Symbol,
    Proxy,
    Reflect,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Int8Array,
    Uint8Array,
    Buffer,
    Promise,
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
  const src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED, focus: 'sanfrancisco' };
  for (const a of argv) {
    if (a.startsWith('--runs=')) o.runs = Math.max(10, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    else if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || o.seed;
    else if (a.startsWith('--focus=')) o.focus = a.slice(8).trim().toLowerCase();
  }
  return o;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs) {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const idx = Math.floor((s.length - 1) / 2);
  return s.length % 2 ? s[idx] : (s[idx] + s[idx + 1]) / 2;
}

function pct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isPublicFmt(fmt){ return String(fmt||'').indexOf('PUBLIC_')===0; }
  function sortBook(stations){
    var list=stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    return list;
  }
  function openingEcologyOne(marketId, seedVal){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      var sc=SC.find(function(x){return x.id==='under';})||SC[0];
      var origIdx=sc.idx; sc.idx=[];
      G=genMarket('under');
      sc.idx=origIdx;
      var book=sortBook(G.stations);
      var fmtSum={}, fmtPresent={};
      var commercialAm=0, commercialFm=0, nceCount=0;
      for(var k=0;k<G.stations.length;k++){
        var st=G.stations[k];
        if(!st||st._bpSlotDeferred) continue;
        var sig=st.sig||{};
        var pub=isPublicFmt(st.format);
        if(sig.type==='AM'){ if(!pub) commercialAm++; }
        else if(sig.type==='FM'){ if(pub) nceCount++; else commercialFm++; }
      }
      var topShares=[];
      for(var j=0;j<book.length;j++){
        var sh=book[j].rat.share||0;
        topShares.push(sh);
        var fk=fmtKey(book[j].format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        fmtPresent[fk]=true;
      }
      var top3=0, top5=0;
      for(var t=0;t<Math.min(3,topShares.length);t++) top3+=topShares[t];
      for(var u=0;u<Math.min(5,topShares.length);u++) top5+=topShares[u];
      var rockShare=0, rockPresent=false;
      var rockKeys=['ALBUM_ROCK','CLASSIC_ROCK','ALT_ROCK','AAA','CLASSIC_HITS','OLDIES'];
      for(var r=0;r<rockKeys.length;r++){
        var rk=rockKeys[r];
        if(fmtPresent[rk]) rockPresent=true;
        rockShare+=(fmtSum[rk]||0);
      }
      var fmTotal=commercialAm+commercialFm;
      return {
        ok:true,
        gYear:G.year,
        fmtSum:fmtSum,
        fmtPresent:fmtPresent,
        top3Share:top3,
        top5Share:top5,
        rockShare:rockShare,
        rockPresent:rockPresent,
        commercialAm:commercialAm,
        commercialFm:commercialFm,
        fmAdoption: fmTotal>0 ? commercialFm/fmTotal : 0,
        nceCount:nceCount,
        stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length,
        leaderFmt: book[0]?fmtKey(book[0].format):'',
        hasBpPatch: !!(MARKET_BP_PATCH&&MARKET_BP_PATCH[marketId]&&Object.keys(MARKET_BP_PATCH[marketId]).length)
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { openingEcologyOne: openingEcologyOne };
})();
`;

function aggregateMarket(okRows) {
  const fmtKeys = new Set();
  for (const r of okRows) {
    for (const k of Object.keys(r.fmtSum || {})) fmtKeys.add(k);
  }

  const meanShareByFormat = {};
  const presenceRateByFormat = {};
  for (const fmt of fmtKeys) {
    meanShareByFormat[fmt] = mean(okRows.map((row) => row.fmtSum?.[fmt] ?? 0));
    presenceRateByFormat[fmt] =
      okRows.filter((row) => (row.fmtSum?.[fmt] ?? 0) > 0.0005).length / okRows.length;
  }

  const top10ByMeanShare = Object.entries(meanShareByFormat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([fmt, share]) => ({ fmt, meanShare: share, presenceRate: presenceRateByFormat[fmt] ?? 0 }));

  const rockPresenceRate = okRows.filter((r) => r.rockPresent).length / okRows.length;
  const rockMeanShare = mean(okRows.map((r) => r.rockShare ?? 0));

  return {
    nRuns: okRows.length,
    meanShareByFormat,
    presenceRateByFormat,
    top10ByMeanShare,
    rockPresenceRate,
    rockMeanShare,
    top3ShareMedian: median(okRows.map((r) => r.top3Share)),
    top5ShareMedian: median(okRows.map((r) => r.top5Share)),
    fmAdoptionMedian: median(okRows.map((r) => r.fmAdoption)),
    commercialAmMedian: median(okRows.map((r) => r.commercialAm)),
    commercialFmMedian: median(okRows.map((r) => r.commercialFm)),
    stationCountMedian: median(okRows.map((r) => r.stationCount)),
    leaderFmtMode: mode(okRows.map((r) => r.leaderFmt)),
    hasBpPatch: okRows[0]?.hasBpPatch ?? false,
  };
}

function mode(arr) {
  const c = {};
  for (const x of arr) c[x] = (c[x] || 0) + 1;
  let best = '';
  let n = 0;
  for (const [k, v] of Object.entries(c)) {
    if (v > n) {
      n = v;
      best = k;
    }
  }
  return best;
}

function tierGroup(markets, marketId) {
  const rt = (markets[marketId]?.rankTier || 'medium').toLowerCase();
  if (rt === 'mega') return 'mega';
  if (rt === 'large') return 'large';
  if (rt === 'small') return 'small';
  return 'medium';
}

function peerMedian(byMarket, ids, pick) {
  const vals = ids.map((id) => pick(byMarket[id])).filter((v) => v != null && !Number.isNaN(v));
  return median(vals);
}

function distanceFromPeers(focus, peerIds, byMarket, metricFn) {
  let sum = 0;
  let n = 0;
  const peerMed = peerMedian(byMarket, peerIds, metricFn);
  const fVal = metricFn(focus);
  if (peerMed != null && fVal != null) {
    return Math.abs(fVal - peerMed);
  }
  return null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const ctx = loadCtx();
  const MARKETS = vm.runInContext('typeof MARKETS!=="undefined"?MARKETS:{}', ctx);
  const api = vm.runInContext(RUN_IIFE, ctx);
  const origR = Math.random;

  const byMarket = {};

  for (const marketId of ALL_PLAYABLE_MARKET_IDS) {
    const rows = [];
    for (let run = 0; run < opts.runs; run++) {
      const s0 = opts.seed + marketSalt(marketId) * 17 + YEAR * 10007 + run * 9973;
      try {
        rows.push(api.openingEcologyOne(marketId, s0));
      } catch (e) {
        rows.push({ ok: false, err: String(e?.message || e) });
      } finally {
        Math.random = origR;
      }
    }
    const okRows = rows.filter((r) => r.ok);
    byMarket[marketId] = {
      label: MARKETS[marketId]?.label || marketId,
      rankTier: MARKETS[marketId]?.rankTier || '?',
      archetypeId: MARKETS[marketId]?.archetypeId || '?',
      failCount: rows.length - okRows.length,
      ...aggregateMarket(okRows),
    };
  }

  const focusId = opts.focus;
  const focus = byMarket[focusId];
  const others = ALL_PLAYABLE_MARKET_IDS.filter((id) => id !== focusId);
  const mediumPeers = others.filter((id) => tierGroup(MARKETS, id) === 'medium');
  const largePeers = others.filter((id) => tierGroup(MARKETS, id) === 'large');
  const allOthers = others;

  const comparison = {
    vsAllOthersMedian: {
      top3Share: peerMedian(byMarket, allOthers, (m) => m.top3ShareMedian),
      top5Share: peerMedian(byMarket, allOthers, (m) => m.top5ShareMedian),
      fmAdoption: peerMedian(byMarket, allOthers, (m) => m.fmAdoptionMedian),
      rockMeanShare: peerMedian(byMarket, allOthers, (m) => m.rockMeanShare),
      rockPresenceRate: peerMedian(byMarket, allOthers, (m) => m.rockPresenceRate),
    },
    vsMediumTierMedian: {
      top3Share: peerMedian(byMarket, mediumPeers, (m) => m.top3ShareMedian),
      top5Share: peerMedian(byMarket, mediumPeers, (m) => m.top5ShareMedian),
      fmAdoption: peerMedian(byMarket, mediumPeers, (m) => m.fmAdoptionMedian),
      rockMeanShare: peerMedian(byMarket, mediumPeers, (m) => m.rockMeanShare),
      rockPresenceRate: peerMedian(byMarket, mediumPeers, (m) => m.rockPresenceRate),
    },
    vsLargeTierMedian: {
      top3Share: peerMedian(byMarket, largePeers, (m) => m.top3ShareMedian),
      top5Share: peerMedian(byMarket, largePeers, (m) => m.top5ShareMedian),
      fmAdoption: peerMedian(byMarket, largePeers, (m) => m.fmAdoptionMedian),
      rockMeanShare: peerMedian(byMarket, largePeers, (m) => m.rockMeanShare),
      rockPresenceRate: peerMedian(byMarket, largePeers, (m) => m.rockPresenceRate),
    },
  };

  const top10PeerMedians = {};
  for (const { fmt } of focus.top10ByMeanShare) {
    top10PeerMedians[fmt] = peerMedian(byMarket, allOthers, (m) => m.meanShareByFormat?.[fmt] ?? 0);
  }

  let genericTemplateScore = 0;
  const signals = [];
  const addSignal = (w, msg) => {
    genericTemplateScore += w;
    signals.push(msg);
  };

  if (!focus.hasBpPatch) {
    addSignal(
      1,
      'No MARKET_BP_PATCH — opening book uses national blueprint + tier/archetype ecology only (same structural path as unpatched medium markets).',
    );
  }
  const medRock = comparison.vsMediumTierMedian.rockMeanShare;
  if (medRock != null && Math.abs(focus.rockMeanShare - medRock) < 0.012) {
    addSignal(2, `Rock share (${pct(focus.rockMeanShare)}) within 1.2pp of medium-tier median (${pct(medRock)}).`);
  }
  const medFm = comparison.vsMediumTierMedian.fmAdoption;
  if (medFm != null && Math.abs(focus.fmAdoptionMedian - medFm) < 0.04) {
    addSignal(1, `FM adoption (${pct(focus.fmAdoptionMedian)}) within 4pp of medium-tier median (${pct(medFm)}).`);
  }
  const sea = byMarket.seattle;
  if (sea && focus.archetypeId === sea.archetypeId) {
    const fmtOverlap = focus.top10ByMeanShare.filter(({ fmt, meanShare }) => {
      const seaShare = sea.meanShareByFormat?.[fmt] ?? 0;
      return Math.abs(meanShare - seaShare) < 0.025 && meanShare > 0.02;
    }).length;
    if (fmtOverlap >= 6) {
      addSignal(
        2,
        `${fmtOverlap}/10 top formats within 2.5pp mean share of Seattle (both coastal_secular large) — dial shape tracks peer more than mega markets.`,
      );
    }
  }
  const megaMedRock = peerMedian(
    byMarket,
    others.filter((id) => tierGroup(MARKETS, id) === 'mega'),
    (m) => m.rockMeanShare,
  );
  if (megaMedRock != null && focus.rockMeanShare < megaMedRock - 0.02) {
    addSignal(
      1,
      `Rock share below mega-market median (${pct(megaMedRock)}) — expected for coastal_secular, but confirms SF is not mega-rock skew.`,
    );
  }

  const verdict =
    genericTemplateScore >= 5
      ? 'likely_generic_template'
      : genericTemplateScore >= 3
        ? 'mixed'
        : 'market_specific';

  const lines = [];
  lines.push(`# San Francisco 1970 opening-book format ecology audit`);
  lines.push('');
  lines.push(`Recorded: ${new Date().toISOString()} · ${opts.runs} runs/market · seed ${opts.seed} · gen-only (scenario \`under\`)`);
  lines.push('');
  lines.push('## San Francisco summary');
  lines.push('');
  lines.push(`| Metric | SF | All-other median | Medium-tier median | Large-tier median |`);
  lines.push(`| --- | ---: | ---: | ---: | ---: |`);
  lines.push(
    `| Top-3 share | ${pct(focus.top3ShareMedian)} | ${pct(comparison.vsAllOthersMedian.top3Share)} | ${pct(comparison.vsMediumTierMedian.top3Share)} | ${pct(comparison.vsLargeTierMedian.top3Share)} |`,
  );
  lines.push(
    `| Top-5 share | ${pct(focus.top5ShareMedian)} | ${pct(comparison.vsAllOthersMedian.top5Share)} | ${pct(comparison.vsMediumTierMedian.top5Share)} | ${pct(comparison.vsLargeTierMedian.top5Share)} |`,
  );
  lines.push(
    `| FM adoption (comm FM / comm AM+FM) | ${pct(focus.fmAdoptionMedian)} | ${pct(comparison.vsAllOthersMedian.fmAdoption)} | ${pct(comparison.vsMediumTierMedian.fmAdoption)} | ${pct(comparison.vsLargeTierMedian.fmAdoption)} |`,
  );
  lines.push(
    `| Rock present (any rock fmt) | ${pct(focus.rockPresenceRate)} | ${pct(comparison.vsAllOthersMedian.rockPresenceRate)} | ${pct(comparison.vsMediumTierMedian.rockPresenceRate)} | ${pct(comparison.vsLargeTierMedian.rockPresenceRate)} |`,
  );
  lines.push(
    `| Combined rock share | ${pct(focus.rockMeanShare)} | ${pct(comparison.vsAllOthersMedian.rockMeanShare)} | ${pct(comparison.vsMediumTierMedian.rockMeanShare)} | ${pct(comparison.vsLargeTierMedian.rockMeanShare)} |`,
  );
  lines.push('');
  lines.push(`Archetype: \`${focus.archetypeId}\` · rank: \`${focus.rankTier}\` · MARKET_BP_PATCH: ${focus.hasBpPatch ? 'yes' : 'no'}`);
  lines.push(`Typical #1: **${focus.leaderFmtMode}** · stations (median): ${focus.stationCountMedian} (AM ${focus.commercialAmMedian} / FM ${focus.commercialFmMedian})`);
  lines.push('');
  lines.push('### SF top-10 formats (mean share · presence rate)');
  lines.push('');
  for (const row of focus.top10ByMeanShare) {
    const peer = top10PeerMedians[row.fmt];
    const delta = peer != null ? row.meanShare - peer : null;
    const deltaStr = delta != null ? ` (${delta >= 0 ? '+' : ''}${pct(delta, 1)} vs others median)` : '';
    lines.push(`- **${row.fmt}**: ${pct(row.meanShare)} mean · ${pct(row.presenceRate)} present${deltaStr}`);
  }
  lines.push('');
  lines.push('## All playable markets (1970 opening book)');
  lines.push('');
  lines.push('| Market | Tier | Archetype | Top-3 | Top-5 | FM adopt | Rock share | Rock present | #1 | BP patch |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const id of ALL_PLAYABLE_MARKET_IDS) {
    const m = byMarket[id];
    lines.push(
      `| ${m.label} | ${m.rankTier} | ${m.archetypeId} | ${pct(m.top3ShareMedian)} | ${pct(m.top5ShareMedian)} | ${pct(m.fmAdoptionMedian)} | ${pct(m.rockMeanShare)} | ${pct(m.rockPresenceRate)} | ${m.leaderFmtMode} | ${m.hasBpPatch ? 'yes' : '—'} |`,
    );
  }
  lines.push('');
  lines.push('## Seeding verdict');
  lines.push('');
  lines.push(`**${verdict.replace(/_/g, ' ')}** (heuristic score ${genericTemplateScore}/7)`);
  lines.push('');
  for (const s of signals) lines.push(`- ${s}`);
  lines.push('');
  if (verdict === 'likely_generic_template') {
    lines.push(
      'San Francisco reads closer to the **national 1970 blueprint + large-tier ecology modifiers** than to a bespoke opening dial. It lacks `MARKET_BP_PATCH`, and its rock/FM/concentration profile sits near **medium-market medians** more than mega-market or distinct coastal-outlier targets.',
    );
  } else if (verdict === 'mixed') {
    lines.push(
      'San Francisco shows **some coastal_secular signals** (public/NCE, FM fragmentation vs mega concentration) but **no dedicated BP patch**; several headline metrics still track medium-tier or Seattle-peer medians.',
    );
  } else {
    lines.push(
      'San Francisco opening book diverges enough from medium-tier and generic national medians to treat **coastal_secular + large-tier ecology** as doing real market-specific work despite no BP patch.',
    );
  }

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const artifact = {
    recordedAt: new Date().toISOString(),
    year: YEAR,
    runs: opts.runs,
    seed: opts.seed,
    focusMarketId: focusId,
    markets: MARKETS,
    byMarket,
    comparison,
    top10PeerMedians,
    seedingVerdict: { verdict, score: genericTemplateScore, signals },
    timingMs: Date.now() - t0,
  };
  writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(outMd, `${lines.join('\n')}\n`);

  console.log(lines.join('\n'));
  console.log(`\nWrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
