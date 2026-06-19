#!/usr/bin/env node
/**
 * Share decomposition audit — diagnostic only (no production changes).
 *
 * Runs cold-start sim to target year, then one instrumented `recalc()` pass that
 * snapshots commercial AQH-share concentration after each major pipeline layer.
 * Compares to Duncan 12+ metro share envelopes (NYC mega, Nashville medium).
 *
 *   node scripts/diag-share-decomposition.mjs
 *   node scripts/diag-share-decomposition.mjs --markets=newyork,nashville --years=2005,2010
 *   node scripts/diag-share-decomposition.mjs --quick
 *
 * Artifacts:
 *   tmp/share_decomposition.json
 *   tmp/share_decomposition.md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const outJson = path.join(root, 'tmp', 'share_decomposition.json');
const outMd = path.join(root, 'tmp', 'share_decomposition.md');

const DEFAULT_MARKETS = ['newyork', 'nashville'];
const DEFAULT_YEARS = [1995, 2003, 2005, 2010, 2020];
const DEFAULT_RUNS = 8;
const DEFAULT_SEED = 20260621;
const MAX_STEPS = 340;

/** Duncan 12+ metro AQH share envelopes — [lo, hi] inclusive-ish bands. */
const DUNCAN_AQH_ENVELOPES = {
  newyork: {
    1995: {
      share1: [5, 7.5],
      top3: [13, 18],
      ge10: [0, 0],
      ge6: [2, 4],
      note: 'Fragmented mega; Z100/WLTW era ~5–6 leaders',
    },
    2003: {
      share1: [5.5, 7],
      top3: [14, 19],
      ge10: [0, 0],
      ge6: [2, 5],
      note: 'WLTW 6.6 #1; WINS/WQHT ~4–5',
    },
    2005: {
      share1: [5.5, 7.5],
      top3: [14, 20],
      ge10: [0, 0],
      ge6: [2, 5],
      note: 'Proxy from Duncan 2000–03 mega fragmentation',
    },
    2010: {
      share1: [5.5, 7.5],
      top3: [14, 20],
      ge10: [0, 0],
      ge6: [2, 5],
      note: 'Duncan ends 2003; extrapolated mega envelope',
    },
    2020: {
      share1: [5, 7],
      top3: [13, 18],
      ge10: [0, 0],
      ge6: [2, 4],
      note: 'Post-Duncan extrapolation — tight mega ceiling ~8 historical max',
    },
  },
  nashville: {
    1995: {
      share1: [12, 16],
      top3: [28, 38],
      ge10: [2, 4],
      ge6: [4, 8],
      note: 'WSIX 14.5; WRVW 12.0 — country peak era',
    },
    2003: {
      share1: [7, 9],
      top3: [18, 24],
      ge10: [0, 1],
      ge6: [3, 6],
      note: 'WRVW 7.9 #1; fragmented medium market',
    },
    2005: {
      share1: [7, 10],
      top3: [18, 26],
      ge10: [0, 1],
      ge6: [3, 6],
      note: 'Post-peak country; Duncan 2003-shaped',
    },
    2010: {
      share1: [7, 10],
      top3: [18, 26],
      ge10: [0, 2],
      ge6: [3, 6],
      note: 'Medium market allows higher than mega but not 1995 peaks',
    },
    2020: {
      share1: [6, 9],
      top3: [16, 24],
      ge10: [0, 1],
      ge6: [2, 5],
      note: 'Further fragmentation expected',
    },
  },
};

const LAYER_LABELS = {
  L1_postCohort: 'After cohort appeal + bleed + cap + momentum',
  L2_postLongTail: 'After commercial long-tail smoothing',
  L3_postHabitReconcile: 'After public habit denominator reconcile',
  L4_postOtherAudio: 'After otherAudio dilution (leader relief applied here)',
  L5_postListeningHours: 'After applyListeningHoursShareFromAqh',
  L6_postTrimBoost: 'After Top40 trim + Spanish leader boost',
  L7_postSanitize: 'After commercial outlier sanitize',
  L8_final: 'Final recalc output (pre daypart)',
};

const DECOMP_SNIPPET = `
function diagShareDecompCommercialMetrics(stations,G){
  var comm=(stations||[]).filter(function(s){
    return s&&!s._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'
      &&!stationIsNoncommercialInstitutional(s)&&s.rat&&typeof s.rat.share==='number';
  });
  var shares=comm.map(function(s){return Number(s.rat.share)||0;}).filter(function(x){return x>=0;});
  shares.sort(function(a,b){return b-a;});
  var sh1=shares[0]||0,sh2=shares[1]||0,sh3=shares[2]||0;
  var top3=0,top5=0,hhi=0,ge6=0,ge8=0,ge10=0,i;
  for(i=0;i<shares.length;i++){
    if(i<3)top3+=shares[i];
    if(i<5)top5+=shares[i];
    hhi+=shares[i]*shares[i];
    if(shares[i]>=0.06)ge6++;
    if(shares[i]>=0.08)ge8++;
    if(shares[i]>=0.10)ge10++;
  }
  var med=0;
  if(shares.length){
    var mid=Math.floor(shares.length/2);
    med=shares.length%2?shares[mid]:(shares[mid-1]+shares[mid])/2;
  }
  return {
    nComm:comm.length,
    share1:sh1,
    share2:sh2,
    share3:sh3,
    top3:top3,
    top5:top5,
    hhi:Math.round(hhi*10000),
    ge6:ge6,
    ge8:ge8,
    ge10:ge10,
    median:med,
    bookSum:shares.reduce(function(a,b){return a+b;},0),
    leadFormat:(function(){
      if(!comm.length)return '';
      var sorted=comm.slice().sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
      return String(sorted[0].format||'');
    })(),
  };
}
function diagShareDecompCapture(G,layer){
  if(!G._shareDecompActive)return;
  if(!G._shareDecompLayers)G._shareDecompLayers=[];
  var m=diagShareDecompCommercialMetrics(G.stations,G);
  m.layer=layer;
  m.otherAudioF=G._otherAudioShareLast;
  m.otherAudioLeaderRelief=G._otherAudioLeaderReliefLast;
  m.otherAudioNonLeaderBoost=G._otherAudioNonLeaderBoostLast;
  G._shareDecompLayers.push(m);
}
`;

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

function patchLegacyForShareDecomp(src) {
  if (!src.includes('function diagShareDecompCapture(G,layer)')) {
    src = src.replace(
      'function recalc(stations,G){\n  ensurePublicNceTiersForGame(G);',
      `${DECOMP_SNIPPET}\nfunction recalc(stations,G){\n  if(G._shareDecompActive)G._shareDecompLayers=[];\n  ensurePublicNceTiersForGame(G);`,
    );
  }

  const hooks = [
    [
      "wlCommercialMassProbe(stations,G,'recalc:postCohort');",
      "wlCommercialMassProbe(stations,G,'recalc:postCohort');\n  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L1_postCohort');",
    ],
    [
      '  // Reconcile overall rat.share with PUBLIC_NEWS habit weighting after commercial long-tail (if any).',
      "  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L2_postLongTail');\n  // Reconcile overall rat.share with PUBLIC_NEWS habit weighting after commercial long-tail (if any).",
    ],
    [
      '  // Sports rights: scale cohort shares + AQH + mom so weighted share matches getSportsBonus (internal consistency)',
      "  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L3_postHabitReconcile');\n  // Sports rights: scale cohort shares + AQH + mom so weighted share matches getSportsBonus (internal consistency)",
    ],
    [
      '  applyOtherAudioListeningDilution(stations,G,engageWeightedPop);',
      "  applyOtherAudioListeningDilution(stations,G,engageWeightedPop);\n  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L4_postOtherAudio');",
    ],
    [
      '  applyListeningHoursShareFromAqh(stations,G);\n  wlCommercialMassProbe(stations,G,\'recalc:postAqh1\');',
      "  applyListeningHoursShareFromAqh(stations,G);\n  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L5_postListeningHours');\n  wlCommercialMassProbe(stations,G,'recalc:postAqh1');",
    ],
    [
      '    wlEnsureCommercialRatingsHaveAqhMass(stations,G);\n  }',
      "    wlEnsureCommercialRatingsHaveAqhMass(stations,G);\n  }\n  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L6_postTrimBoost');",
    ],
    [
      '  wlSanitizeCommercialBookShareOutliers(stations,G);',
      "  wlSanitizeCommercialBookShareOutliers(stations,G);\n  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L7_postSanitize');",
    ],
    [
      '  recalcDaypartAudience(stations,G);\n}',
      "  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L8_final');\n  recalcDaypartAudience(stations,G);\n}",
    ],
  ];

  for (const [needle, repl] of hooks) {
    if (!src.includes(repl) && src.includes(needle)) {
      src = src.replace(needle, repl);
    }
  }

  return src;
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
  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: console.error, table: () => {} },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
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
  let src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  src = patchLegacyForShareDecomp(src);
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 360_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseCsvList(s, fallback) {
  if (!s || !String(s).trim()) return fallback.slice();
  return String(s).split(',').map((x) => x.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const o = {
    markets: DEFAULT_MARKETS,
    years: DEFAULT_YEARS,
    runs: DEFAULT_RUNS,
    seed: DEFAULT_SEED,
  };
  for (const a of argv) {
    if (a === '--quick') {
      o.markets = ['newyork', 'nashville'];
      o.years = [2003, 2010];
      o.runs = 4;
    } else if (a.startsWith('--markets=')) o.markets = parseCsvList(a.slice(10), DEFAULT_MARKETS);
    else if (a.startsWith('--years=')) {
      o.years = parseCsvList(a.slice(8), DEFAULT_YEARS).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
    } else if (a.startsWith('--runs=')) o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
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

function pct(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(d)}%`;
}

function inBand(val, band) {
  if (val == null || !band) return null;
  return val >= band[0] && val <= band[1];
}

function envelopeFor(marketId, year) {
  const m = DUNCAN_AQH_ENVELOPES[marketId];
  if (!m) return null;
  if (m[year]) return m[year];
  const keys = Object.keys(m).map(Number).sort((a, b) => a - b);
  let best = keys[0];
  for (const k of keys) {
    if (k <= year) best = k;
  }
  return m[best] || null;
}

function layerDelta(layers, fromKey, toKey, field) {
  const a = layers.find((x) => x.layer === fromKey);
  const b = layers.find((x) => x.layer === toKey);
  if (!a || !b) return null;
  return (b[field] ?? 0) - (a[field] ?? 0);
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Share Decomposition Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('Diagnostic-only — instruments `recalc()` layers vs Duncan 12+ metro AQH share envelopes.');
  lines.push('');
  lines.push(`Markets: ${report.config.markets.join(', ')}`);
  lines.push(`Years: ${report.config.years.join(', ')}`);
  lines.push(`Runs/cell: ${report.config.runs} · seed ${report.config.seed}`);
  lines.push('');

  for (const cell of report.cells) {
    lines.push(`## ${cell.marketId} · ${cell.year}`);
    if (cell.envelope?.note) lines.push(`Duncan envelope: ${cell.envelope.note}`);
    lines.push('');

    if (cell.failures?.length) {
      lines.push(`**Failures:** ${cell.failures.length} run(s)`);
      lines.push('');
    }

    const agg = cell.aggregated;
    if (!agg?.layers?.length) {
      lines.push('_No layer data._');
      lines.push('');
      continue;
    }

    lines.push('| Layer | #1 | top-3 | ≥6% | ≥10% | HHI | Δ#1 vs L1 |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    const l1Share1 = agg.layers.find((l) => l.layer === 'L1_postCohort')?.share1 ?? null;
    for (const row of agg.layers) {
      const d1 = l1Share1 != null ? row.share1 - l1Share1 : null;
      lines.push(
        `| ${LAYER_LABELS[row.layer] || row.layer} | ${pct(row.share1)} | ${pct(row.top3)} | ${row.ge6?.toFixed(1) ?? '—'} | ${row.ge10?.toFixed(1) ?? '—'} | ${row.hhi ?? '—'} | ${d1 != null ? `${d1 >= 0 ? '+' : ''}${pct(d1, 2)}` : '—'} |`,
      );
    }
    lines.push('');

    const final = agg.layers.find((l) => l.layer === 'L8_final') || agg.layers[agg.layers.length - 1];
    const env = cell.envelope;
    if (final && env) {
      lines.push('**Final vs Duncan envelope**');
      lines.push('');
      lines.push(`| Metric | Sim | Duncan band | In band? |`);
      lines.push(`| --- | ---: | ---: | --- |`);
      const rows = [
        ['#1 share', pct(final.share1), `${env.share1[0]}–${env.share1[1]}%`, inBand(final.share1 * 100, env.share1)],
        ['top-3', pct(final.top3), `${env.top3[0]}–${env.top3[1]}%`, inBand(final.top3 * 100, env.top3)],
        ['stations ≥10%', final.ge10, `${env.ge10[0]}–${env.ge10[1]}`, inBand(final.ge10, env.ge10)],
        ['stations ≥6%', final.ge6, `${env.ge6[0]}–${env.ge6[1]}`, inBand(final.ge6, env.ge6)],
      ];
      for (const [label, sim, band, ok] of rows) {
        lines.push(`| ${label} | ${sim} | ${band} | ${ok == null ? '—' : ok ? 'yes' : 'no'} |`);
      }
      lines.push('');
    }

    if (agg.otherAudio) {
      lines.push('**otherAudio (mean at L4)**');
      lines.push(`- fBase: ${pct(agg.otherAudio.f, 2)}`);
      lines.push(`- leaderRelief: ${pct(agg.otherAudio.leaderRelief, 1)}`);
      lines.push(`- nonLeaderBoost: ${pct(agg.otherAudio.nonLeaderBoost, 2)}`);
      lines.push('');
    }

    const inflators = [];
    const dLt = layerDelta(agg.layers, 'L1_postCohort', 'L2_postLongTail', 'share1');
    const dOa = layerDelta(agg.layers, 'L3_postHabitReconcile', 'L4_postOtherAudio', 'share1');
    const dLh = layerDelta(agg.layers, 'L4_postOtherAudio', 'L5_postListeningHours', 'share1');
    const dSn = layerDelta(agg.layers, 'L1_postCohort', 'L7_postSanitize', 'share1');
    if (dLt != null && Math.abs(dLt) >= 0.003) inflators.push(`long-tail Δ#1 ${pct(dLt, 2)}`);
    if (dOa != null && Math.abs(dOa) >= 0.003) inflators.push(`otherAudio Δ#1 ${pct(dOa, 2)} (leader relief reduces dilution on #1)`);
    if (dLh != null && Math.abs(dLh) >= 0.003) inflators.push(`listeningHours Δ#1 ${pct(dLh, 2)}`);
    if (dSn != null && Math.abs(dSn) >= 0.005) inflators.push(`L1→sanitize Δ#1 ${pct(dSn, 2)}`);

    if (inflators.length) {
      lines.push('**Largest #1 movers (mean)**');
      for (const t of inflators) lines.push(`- ${t}`);
    } else {
      lines.push('_Most inflation already present at L1 (cohort appeal physics)._');
    }
    lines.push('');
  }

  lines.push('## Layer key');
  for (const [k, v] of Object.entries(LAYER_LABELS)) {
    lines.push(`- **${k}**: ${v}`);
  }
  lines.push('');
  return lines.join('\n');
}

const RUN_IIFE = `
(function(opts){
  var MAX_STEPS=${MAX_STEPS};
  function simAndDecompose(marketId,targetYear,seedVal){
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
      if(G.year>targetYear||(G.year===targetYear&&G.period>1))
        return {ok:false,err:'overshoot',atYear:G.year};
      var ui=window._harnessPatchTimersAndUi();
      try{advTurn();}finally{ui.restore();}
      steps++;
    }
    if(G.year!==targetYear||G.period!==1)return {ok:false,err:'miss',atYear:G.year};
    G._shareDecompActive=true;
    G._shareDecompLayers=[];
    if(typeof recalc==='function')recalc(G.stations,G);
    if(typeof snapMarketRankBookDisplay==='function')snapMarketRankBookDisplay(G);
    return {ok:true,steps:steps,layers:(G._shareDecompLayers||[]).slice()};
  }
  return simAndDecompose;
})
`;

function aggregateLayers(runs) {
  const layerKeys = Object.keys(LAYER_LABELS);
  const out = [];
  for (const key of layerKeys) {
    const rows = runs.map((r) => r.layers?.find((l) => l.layer === key)).filter(Boolean);
    if (!rows.length) continue;
    const fields = ['share1', 'share2', 'share3', 'top3', 'top5', 'hhi', 'ge6', 'ge8', 'ge10', 'median', 'bookSum', 'nComm'];
    const agg = { layer: key, n: rows.length };
    for (const f of fields) {
      agg[f] = mean(rows.map((r) => r[f]));
    }
    out.push(agg);
  }
  const l4 = runs.map((r) => r.layers?.find((l) => l.layer === 'L4_postOtherAudio')).filter(Boolean);
  const otherAudio = l4.length
    ? {
        f: mean(l4.map((r) => r.otherAudioF)),
        leaderRelief: mean(l4.map((r) => r.otherAudioLeaderRelief)),
        nonLeaderBoost: mean(l4.map((r) => r.otherAudioNonLeaderBoost)),
      }
    : null;
  return { layers: out, otherAudio };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(path.join(root, 'tmp'), { recursive: true });

  console.log('Loading legacy + decomposition hooks…');
  const ctx = loadCtx();

  if (!ctx.diagShareDecompCapture) {
    console.warn('Warning: diagShareDecompCapture not found — patch may have failed');
  }

  const simFn = vm.runInContext(`${RUN_IIFE}(${JSON.stringify(opts)})`, ctx);
  const cells = [];
  const failures = [];

  for (const marketId of opts.markets) {
    for (const year of opts.years) {
      const runs = [];
      const cellFailures = [];
      console.log(`==> ${marketId} ${year} (${opts.runs} runs)`);
      for (let run = 0; run < opts.runs; run++) {
        const seedVal = opts.seed + marketSalt(marketId) * 17 + year * 10007 + run * 9973;
        try {
          const r = simFn(marketId, year, seedVal);
          if (!r.ok) {
            cellFailures.push({ run, ...r });
            failures.push({ marketId, year, run, ...r });
            continue;
          }
          runs.push(r);
        } catch (e) {
          cellFailures.push({ run, err: String(e?.message || e) });
          failures.push({ marketId, year, run, err: String(e?.message || e) });
        }
      }
      cells.push({
        marketId,
        year,
        envelope: envelopeFor(marketId, year),
        runs,
        failures: cellFailures,
        aggregated: aggregateLayers(runs),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: opts,
    duncanEnvelopes: DUNCAN_AQH_ENVELOPES,
    layerLabels: LAYER_LABELS,
    cells,
    failures,
  };

  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outMd, `${buildMarkdown(report)}\n`);

  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);

  for (const cell of cells) {
    const fin = cell.aggregated?.layers?.find((l) => l.layer === 'L8_final');
    const env = cell.envelope;
    if (!fin || !env) continue;
    const ok1 = inBand(fin.share1 * 100, env.share1);
    console.log(
      `  ${cell.marketId} ${cell.year}: final #1 ${pct(fin.share1)} (Duncan ${env.share1[0]}–${env.share1[1]}%) ${ok1 ? 'OK' : 'HIGH'}`,
    );
  }
}

main();
