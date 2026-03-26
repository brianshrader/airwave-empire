#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// FM Dominance Test Harness
// Runs the Wavelength simulation headlessly 1970→1980, N times,
// and reports FM vs AM market-share statistics per year.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const RUNS        = parseInt(process.env.RUNS || '50', 10);
const START_YEAR  = 1970;
const END_YEAR    = 1980;

// ── DOM / browser stubs ──────────────────────────────────────────
function makeBrowserStubs() {
  const noopEl = new Proxy({}, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'style') return new Proxy({}, { get() { return ''; }, set() { return true; } });
      if (prop === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      if (prop === 'dataset') return {};
      if (prop === 'children' || prop === 'childNodes') return [];
      if (prop === 'innerHTML' || prop === 'innerText' || prop === 'textContent' || prop === 'value' || prop === 'className') return '';
      if (prop === 'disabled' || prop === 'checked') return false;
      if (prop === 'parentElement' || prop === 'parentNode' || prop === 'firstChild' || prop === 'lastChild' || prop === 'nextSibling' || prop === 'previousSibling') return null;
      if (prop === 'offsetWidth' || prop === 'offsetHeight') return 0;
      if (typeof prop === 'string' && (prop.startsWith('get') || prop.startsWith('set') || prop.startsWith('query') || prop.startsWith('add') || prop.startsWith('remove') || prop.startsWith('append') || prop.startsWith('replace') || prop.startsWith('insert') || prop.startsWith('scroll') || prop.startsWith('focus') || prop.startsWith('blur') || prop.startsWith('click') || prop.startsWith('dispatch') || prop.startsWith('closest') || prop.startsWith('matches') || prop.startsWith('contains') || prop.startsWith('clone') || prop === 'remove' || prop === 'forEach')) {
        return function() { return noopEl; };
      }
      return noopEl;
    },
    set() { return true; },
  });

  const doc = {
    getElementById() { return noopEl; },
    querySelector() { return noopEl; },
    querySelectorAll() { return { forEach(){}, length: 0, [Symbol.iterator]: function*(){} }; },
    createElement() { return noopEl; },
    createTextNode() { return noopEl; },
    createDocumentFragment() { return noopEl; },
    body: noopEl,
    head: noopEl,
    documentElement: noopEl,
    readyState: 'complete',
    addEventListener() {},
    removeEventListener() {},
    cookie: '',
    title: '',
  };

  const win = {
    document: doc,
    navigator: { userAgent: 'node' },
    location: { href: 'http://localhost:3000', hostname: 'localhost', port: '3000', protocol: 'http:', origin: 'http://localhost:3000', search: '', hash: '', pathname: '/' },
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){}, clear(){} },
    sessionStorage: { getItem(){ return null; }, setItem(){}, removeItem(){}, clear(){} },
    setTimeout(fn, ms) { if (ms <= 500) fn(); return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame(fn) { fn(0); return 0; },
    cancelAnimationFrame() {},
    innerWidth: 1280,
    innerHeight: 800,
    scrollTo() {},
    scrollBy() {},
    getComputedStyle() { return new Proxy({}, { get() { return ''; } }); },
    matchMedia() { return { matches: false, addEventListener(){}, removeEventListener(){} }; },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    alert() {},
    confirm() { return false; },
    prompt() { return null; },
    fetch() { return Promise.resolve({ ok: true, json() { return Promise.resolve({}); } }); },
    performance: { now() { return Date.now(); } },
    history: { pushState(){}, replaceState(){}, back(){}, forward(){} },
    crypto: require('crypto'),
    URL: URL,
    URLSearchParams: URLSearchParams,
    console,
    Math,
    Date,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    undefined,
    NaN,
    Infinity,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Symbol,
    Proxy,
    Reflect,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };

  win.window = win;
  win.self = win;
  win.globalThis = win;
  win.document = doc;

  return win;
}

// ── Load game engine into a VM sandbox ───────────────────────────
function createSandbox() {
  const win = makeBrowserStubs();
  // Suppress noisy console.log from init() but keep errors
  const origLog = console.log;
  console.log = () => {};
  const ctx = vm.createContext(win);
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'legacy.js', timeout: 30000 });
  console.log = origLog;
  return ctx;
}

// ── Run one headless simulation from 1970 to END_YEAR ────────────
function runSimulation(ctx) {
  // Generate the market and assign to G
  vm.runInContext(`G = genMarket('under');`, ctx, { timeout: 10000 });

  const snapshots = [];
  let maxTurns = (END_YEAR - START_YEAR + 1) * 2 + 2; // safety limit

  for (let turn = 0; turn < maxTurns; turn++) {
    // Collect snapshot
    const snap = vm.runInContext(`
      (function() {
        var stations = (G.stations || []).filter(function(s) { return s && !s._bpSlotDeferred && !s.isPublic; });
        var ranked = stations.slice().sort(function(a,b) { return (b.rat ? b.rat.share : 0) - (a.rat ? a.rat.share : 0); });
        var am = stations.filter(function(s) { return s.sig && s.sig.type === 'AM'; });
        var fm = stations.filter(function(s) { return s.sig && s.sig.type === 'FM'; });
        var totalShare = stations.reduce(function(s,st) { return s + (st.rat ? st.rat.share : 0); }, 0);
        var amShare = am.reduce(function(s,st) { return s + (st.rat ? st.rat.share : 0); }, 0);
        var fmShare = fm.reduce(function(s,st) { return s + (st.rat ? st.rat.share : 0); }, 0);
        var top10 = ranked.slice(0, 10);
        var fmInTop10 = top10.filter(function(s) { return s.sig && s.sig.type === 'FM'; }).length;
        var amInTop10 = top10.filter(function(s) { return s.sig && s.sig.type === 'AM'; }).length;
        var bestFMRank = -1;
        for (var ri = 0; ri < ranked.length; ri++) {
          if (ranked[ri].sig && ranked[ri].sig.type === 'FM') { bestFMRank = ri + 1; break; }
        }
        if (bestFMRank === -1) bestFMRank = ranked.length + 1;
        var bestFM = fm.length > 0 ? fm.slice().sort(function(a,b) { return (b.rat ? b.rat.share : 0) - (a.rat ? a.rat.share : 0); })[0] : null;
        return {
          year: G.year, period: G.period,
          totalShare: totalShare,
          amShare: amShare, fmShare: fmShare,
          amPct: totalShare > 0 ? amShare / totalShare : 0,
          fmPct: totalShare > 0 ? fmShare / totalShare : 0,
          fmInTop10: fmInTop10, amInTop10: amInTop10,
          bestFMRank: bestFMRank,
          bestFMCall: bestFM ? bestFM.callLetters : '?',
          bestFMShare: bestFM ? (bestFM.rat ? bestFM.rat.share : 0) : 0,
          bestFMFormat: bestFM ? bestFM.format : '?',
          fmCount: fm.length, amCount: am.length,
          fmp: G.fmp || 0,
        };
      })();
    `, ctx, { timeout: 10000 });
    snapshots.push(snap);

    // Check if we're done
    if (snap.year > END_YEAR) break;
    if (snap.year === END_YEAR && snap.period === 2) break;

    // Run one headless turn
    vm.runInContext(`
      (function() {
        try {
          processAtlanta1970DeferredLaunches(G);
          var ev = chkEv(G).concat(applyDriftInflections(G)).concat(pledgeDriveCheck(G)).concat(runConsolidation(G)).concat(runMarketAttrition(G));
          corporateDecay(G);
          runCorpLMAOffers(G);
          talentEvents(G);
          triggerTalentTrouble(G);
          if (typeof triggerFranchiseTrouble === 'function') triggerFranchiseTrouble(G);
          rivalReformat(G);
          if (typeof runSportsEvents === 'function') runSportsEvents(G);
          if (typeof runFranchiseEvents === 'function') runFranchiseEvents(G);
          recalc(G.stations, G);
          if (typeof checkRankMilestones === 'function') checkRankMilestones(G);
          runAI(G);
          seedRev(G.stations, G);
          if (typeof processLMAFees === 'function') processLMAFees(G);
          var profit = G.ps.reduce(function(s,st) { return s + st.fin.ebitda; }, 0);
          G.cash += profit;
          G.stations.forEach(function(s) { decay(s, G.year, G.period); });
          if (typeof updateSuperstars === 'function') updateSuperstars(G);
          // applyLoanInterest references G directly
          if (typeof applyLoanInterest === 'function') applyLoanInterest();
          // Advance clock
          if (G.period === 1) { G.period = 2; }
          else { G.period = 1; G.year++; }
          G.turn = (G.turn || 0) + 1;
          processAtlanta1970DeferredLaunches(G);
          G.fmp = fmpForYear(G.year);
          if (G.news && G.news.length > 50) G.news = G.news.slice(0, 50);
        } catch(e) {
          // Swallow non-critical errors (DOM rendering etc)
        }
      })();
    `, ctx, { timeout: 10000 });
  }

  return snapshots;
}

// ── Aggregate results across runs ────────────────────────────────
function aggregate(allRuns) {
  const yearMap = {};
  for (let runIdx = 0; runIdx < allRuns.length; runIdx++) {
    const run = allRuns[runIdx];
    for (const snap of run) {
      const key = `${snap.year}_${snap.period}`;
      if (!yearMap[key]) yearMap[key] = [];
      yearMap[key].push(snap);
    }
  }

  // Use fall snapshots (period=2) for each year, or spring if no fall
  const results = [];
  for (let year = START_YEAR; year <= END_YEAR; year++) {
    const snaps = yearMap[`${year}_2`] || yearMap[`${year}_1`] || [];
    if (snaps.length === 0) continue;
    const n = snaps.length;
    const avg = (fn) => snaps.reduce((s, x) => s + fn(x), 0) / n;

    results.push({
      year,
      n,
      avgFMPct:      avg(s => s.fmPct),
      avgAMPct:      avg(s => s.amPct),
      avgFmInTop10:  avg(s => s.fmInTop10),
      avgAmInTop10:  avg(s => s.amInTop10),
      avgBestFMRank: avg(s => s.bestFMRank),
      avgBestFMShare:avg(s => s.bestFMShare),
      avgFMP:        avg(s => s.fmp || 0),
      fmTop10Pct:    snaps.filter(s => s.fmInTop10 >= 1).length / n,
    });
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────────
(function main() {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  FM DOMINANCE TEST — ${RUNS} simulations, ${START_YEAR}–${END_YEAR}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const allRuns = [];
  const t0 = Date.now();

  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`  Run ${(i + 1).toString().padStart(3)}/${RUNS}...\r`);
    try {
      const ctx = createSandbox();
      const snapshots = runSimulation(ctx);
      allRuns.push(snapshots);
    } catch (err) {
      console.error(`  Run ${i + 1} FAILED: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  Completed ${allRuns.length}/${RUNS} runs in ${elapsed}s\n`);

  if (allRuns.length === 0) {
    console.error('No successful runs. Check error messages above.');
    process.exit(1);
  }

  const results = aggregate(allRuns);

  // Print table
  console.log('  YEAR │ FM%     AM%   │ FM Top10  AM Top10 │ Best FM Rank │ Best FM Shr │ FMP  │ % w/ FM in T10');
  console.log('  ─────┼───────────────┼────────────────────┼─────────────┼─────────────┼──────┼───────────────');
  for (const r of results) {
    const fmPct = (r.avgFMPct * 100).toFixed(1).padStart(5);
    const amPct = (r.avgAMPct * 100).toFixed(1).padStart(5);
    const fmT10 = r.avgFmInTop10.toFixed(1).padStart(4);
    const amT10 = r.avgAmInTop10.toFixed(1).padStart(4);
    const bestR = r.avgBestFMRank.toFixed(1).padStart(5);
    const bestS = (r.avgBestFMShare * 100).toFixed(2).padStart(5);
    const fmp   = (r.avgFMP * 100).toFixed(0).padStart(3);
    const pct10 = (r.fmTop10Pct * 100).toFixed(0).padStart(4);
    console.log(`  ${r.year} │${fmPct}%${amPct}% │  ${fmT10}      ${amT10} │     ${bestR}   │     ${bestS}% │ ${fmp}% │          ${pct10}%`);
  }

  // Summary verdicts
  console.log('\n  ── VERDICT ──────────────────────────────────────────────');
  const r78 = results.find(r => r.year === 1978);
  const r79 = results.find(r => r.year === 1979);
  const r80 = results.find(r => r.year === 1980);
  if (r78) {
    const pass78 = r78.fmTop10Pct >= 0.80;
    console.log(`  1978: FM in Top 10 in ${(r78.fmTop10Pct * 100).toFixed(0)}% of runs (avg ${r78.avgFmInTop10.toFixed(1)} FM in Top 10) — ${pass78 ? '✅ PASS' : '❌ NEEDS TUNING'}`);
  }
  if (r79) {
    const pass79 = r79.fmTop10Pct >= 0.95;
    console.log(`  1979: FM in Top 10 in ${(r79.fmTop10Pct * 100).toFixed(0)}% of runs (avg ${r79.avgFmInTop10.toFixed(1)} FM in Top 10) — ${pass79 ? '✅ PASS' : '❌ NEEDS TUNING'}`);
  }
  if (r80) {
    console.log(`  1980: FM in Top 10 in ${(r80.fmTop10Pct * 100).toFixed(0)}% of runs (avg ${r80.avgFmInTop10.toFixed(1)} FM in Top 10)`);
  }
  console.log('');
})();
