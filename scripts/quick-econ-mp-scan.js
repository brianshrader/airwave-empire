#!/usr/bin/env node
/**
 * Multiplayer-style econ sanity: genMarketMP (no scenario player slot), then 3 random
 * commercial stations assigned as draft players (isPlayer, _mpOwner), then seedRev.
 * Optionally advances with advTurn() (headless + MP.mode=live) to snapshot margins over time.
 * Same margin stats as quick-econ-scan.js for the full commercial dial at each step.
 * Usage: node scripts/quick-econ-mp-scan.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MARKETS = [
  { id: 'atlanta', label: 'ATLANTA' },
  { id: 'nashville', label: 'NASHVILLE' },
  { id: 'newyork', label: 'NEW YORK' },
  { id: 'chicago', label: 'CHICAGO' },
  { id: 'losangeles', label: 'LOS ANGELES' },
  { id: 'seattle', label: 'SEATTLE' },
];

const SEED = 424242;
const MP_ERA = '1970';
const NUM_PLAYERS = 3;
/** advTurn() calls after the opening snapshot (5 periods ≈ 2½ years from 1970 Spring). */
const NUM_ADV_TURNS = 5;
const LARGE_MARKET_IDS = new Set(['chicago', 'losangeles', 'newyork']);

function makeLegacySrc(marketId) {
  const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
  let legacySrc = fs.readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error("Expected ACTIVE_MARKET line not found");
  }
  const mid = marketId === 'atlanta' ? 'atlanta' : marketId;
  return legacySrc.replace(
    /let ACTIVE_MARKET='atlanta'/,
    `let ACTIVE_MARKET='${mid}'`
  );
}

function stubEl() {
  return {
    disabled: false, textContent: '', innerHTML: '', value: '',
    style: {}, classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {}, querySelector() { return null; }, focus() {}, click() {},
    addEventListener() {}, removeEventListener() {},
  };
}
const documentStub = {
  body: { innerHTML: '' },
  head: { appendChild() {} },
  createElement() { return { href: '', download: '', click() {} }; },
  getElementById() { return stubEl(); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
};

function runMpOne(marketId) {
  const legacySrc = makeLegacySrc(marketId);
  const ctx = vm.createContext({
    console: { log() {}, error: console.error },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {} },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearTimeout() {}, clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
    Symbol, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    Int8Array, Uint8Array, Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInContext(legacySrc, ctx);

  vm.runInContext(
    `
    (function(){
      var s = ${SEED};
      Math.random = function(){
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    })();
    (function(){
      var ERA = ${JSON.stringify(MP_ERA)};
      var N = ${NUM_PLAYERS};
      G = genMarketMP(ERA);
      var comm = G.stations.filter(function(st){
        return st && !st._bpSlotDeferred && !st.isPublic;
      });
      for (var i = comm.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = comm[i]; comm[i] = comm[j]; comm[j] = t;
      }
      var picks = comm.slice(0, N);
      if (picks.length < N) throw new Error('Not enough commercial stations for ' + N + ' players');
      var cash = DRAFT_CASH[ERA] || 800000;
      var colors = ['#f5a623','#60a5fa','#34d399','#f87171'];
      G._playerCash = {};
      G._draftStartCash = {};
      G._underdogVP = {};
      for (var pi = 0; pi < picks.length; pi++) {
        var st = picks[pi];
        st.isPlayer = true;
        st._mpOwner = pi;
        st.color = colors[pi % colors.length];
        applyDefaultBrandToPlayerStation(st);
        var vp = underdogVP(st);
        if (vp > 0) G._underdogVP[pi] = (G._underdogVP[pi] || 0) + vp;
        G._playerCash[pi] = cash;
        G._draftStartCash[pi] = cash;
      }
      G.cash = cash;
      G.ps = G.stations.filter(function(st) { return st.isPlayer; });
      seedRev(G.stations, G);
      MP.mode = 'live';
      MP.playerId = 0;
      MP.isHost = false;
      MP.players = [
        { playerId: 0, name: 'P1' },
        { playerId: 1, name: 'P2' },
        { playerId: 2, name: 'P3' },
      ];
    })();
    __mpPicks = G.stations.filter(function(st){
      return st && st.isPlayer && st._mpOwner != null;
    }).sort(function(a,b){ return (a._mpOwner||0) - (b._mpOwner||0); }).map(function(s){
      return { playerId: s._mpOwner, callLetters: s.callLetters, format: s.format };
    });
    __mpSnapshots = [];
    (function(){
      function snap(){
        var comm = G.stations.filter(function(s){
          return s && !s._bpSlotDeferred && !s.isPublic;
        });
        var rows = comm.map(function(s){
          var rev = (s.fin && s.fin.rev) || 0;
          var cost = (s.fin && s.fin.cost) || 0;
          var ebitda = (s.fin && s.fin.ebitda);
          if (ebitda == null) ebitda = rev - cost;
          var marginPct = rev > 0 ? (ebitda / rev) * 100 : null;
          return {
            callLetters: s.callLetters,
            isPlayer: !!s.isPlayer,
            playerId: s._mpOwner,
            share: s.rat && s.rat.share,
            format: s.format,
            revenue: rev,
            totalCost: cost,
            ebitda: ebitda,
            marginPct: marginPct,
          };
        });
        var pc = {};
        if (G._playerCash) {
          for (var k in G._playerCash) {
            if (Object.prototype.hasOwnProperty.call(G._playerCash, k)) {
              pc[k] = G._playerCash[k];
            }
          }
        }
        var perLabel = (G.period === 1 ? 'Spring' : 'Fall');
        return {
          year: G.year,
          period: G.period,
          periodLabel: perLabel,
          turnIndex: G.turn == null ? 0 : G.turn,
          playerCash: pc,
          rows: rows,
        };
      }
      __mpSnapshots.push(snap());
      for (var step = 0; step < ${NUM_ADV_TURNS}; step++) {
        advTurn();
        __mpSnapshots.push(snap());
      }
    })();
    `,
    ctx
  );

  const picks = vm.runInContext('__mpPicks', ctx);
  const snapshots = vm.runInContext('__mpSnapshots', ctx);
  const rows = snapshots.length ? snapshots[0].rows : [];
  return { rows, picks, snapshots };
}

function median(sortedArr) {
  const n = sortedArr.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  if (n % 2) return sortedArr[mid];
  return (sortedArr[mid - 1] + sortedArr[mid]) / 2;
}

function bucketMargins(marginPcts) {
  const b = {
    high60: 0,
    strong40to60: 0,
    normal20to40: 0,
    weak0to20: 0,
    negative: 0,
  };
  for (const m of marginPcts) {
    if (m >= 60) b.high60++;
    else if (m >= 40) b.strong40to60++;
    else if (m >= 20) b.normal20to40++;
    else if (m >= 0) b.weak0to20++;
    else b.negative++;
  }
  return b;
}

function analyzeRun(rows) {
  const withMargin = rows.filter((r) => r.marginPct != null);
  const margins = withMargin.map((r) => r.marginPct);
  const sorted = margins.slice().sort((a, b) => a - b);
  const avg = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null;
  const med = median(sorted);
  const min = sorted.length ? sorted[0] : null;
  const max = sorted.length ? sorted[sorted.length - 1] : null;
  const negCount = margins.filter((m) => m < 0).length;
  const negShare = margins.length ? negCount / margins.length : 0;
  const over70 = rows.filter((r) => r.marginPct != null && r.marginPct > 70).length;
  const belowNeg150 = rows.filter((r) => r.marginPct != null && r.marginPct < -150).length;
  const buckets = bucketMargins(margins);
  return {
    avg,
    med,
    min,
    max,
    buckets,
    warnings: [],
    counts: { total: rows.length, withRev: withMargin.length, negCount, negShare, over70, belowNeg150 },
  };
}

function pushWarnings(a, marketId) {
  const w = [];
  if (a.counts.over70 > 0) {
    w.push(`${a.counts.over70} station${a.counts.over70 === 1 ? '' : 's'} above 70%`);
  }
  if (a.counts.belowNeg150 > 0) {
    w.push(`${a.counts.belowNeg150} station${a.counts.belowNeg150 === 1 ? '' : 's'} below -150%`);
  }
  if (a.counts.negShare > 0.5) {
    w.push(`more than 50% of stations negative (${(a.counts.negShare * 100).toFixed(0)}%)`);
  }
  if (LARGE_MARKET_IDS.has(marketId) && a.avg != null && a.avg > 50) {
    w.push(`average margin ${a.avg.toFixed(0)}% > 50% in large market`);
  }
  a.warnings = w;
}

function pctFmt(n) {
  if (n == null || Number.isNaN(n)) return 'n/a';
  return `${Math.round(n)}%`;
}

function playerLines(rows) {
  const playerRows = rows.filter((r) => r.isPlayer);
  return playerRows
    .sort((x, y) => (x.playerId ?? 0) - (y.playerId ?? 0))
    .map((pr) => {
      const sh = ((pr.share || 0) * 100).toFixed(1);
      return `P${(pr.playerId ?? 0) + 1} ${pr.callLetters}: ${pctFmt(pr.marginPct)} · sh ${sh}%`;
    })
    .join('  |  ');
}

function cashLine(pc) {
  if (!pc || typeof pc !== 'object') return '';
  const parts = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    if (pc[i] != null) parts.push(`P${i + 1} $${Math.round(pc[i]).toLocaleString()}`);
  }
  return parts.length ? `Cash: ${parts.join(' · ')}` : '';
}

function main() {
  console.log(
    `quick-econ-mp-scan — genMarketMP('${MP_ERA}'), ${NUM_PLAYERS} random draft picks, ` +
      `${NUM_ADV_TURNS} advTurn() steps, seed ${SEED}\n`
  );
  for (const market of MARKETS) {
    const { rows, picks, snapshots } = runMpOne(market.id);
    const a = analyzeRun(rows);
    pushWarnings(a, market.id);

    console.log(`=== ${market.label} — MULTIPLAYER (${MP_ERA}) ===`);
    console.log(
      `Draft simulation: ${NUM_PLAYERS} stations chosen at random (shuffle after genMarketMP).`
    );
    console.log(
      'Picks: ' +
        picks
          .map(function (p) {
            return `P${p.playerId + 1} ${p.callLetters} (${p.format})`;
          })
          .join(' · ')
    );
    console.log('');
    console.log('— Opening (after seedRev) —');
    console.log(`Commercial stations: ${rows.length} (${a.counts.withRev} with revenue > 0 for margin %)`);
    if (a.avg != null) {
      console.log(`Avg margin: ${pctFmt(a.avg)}`);
      console.log(`Median: ${pctFmt(a.med)}`);
      console.log(`Range: ${pctFmt(a.min)} → ${pctFmt(a.max)}`);
    } else {
      console.log('No stations with revenue > 0 (cannot compute margins).');
    }
    console.log('');
    console.log('Buckets:');
    console.log('');
    console.log(`60%: ${a.buckets.high60}`);
    console.log(`40–60%: ${a.buckets.strong40to60}`);
    console.log(`20–40%: ${a.buckets.normal20to40}`);
    console.log(`0–20%: ${a.buckets.weak0to20}`);
    console.log(`<0%: ${a.buckets.negative}`);
    console.log('');
    if (rows.filter((r) => r.isPlayer).length) {
      console.log('Player stations:');
      console.log(`  ${playerLines(rows)}`);
      console.log('');
    }
    if (a.warnings.length) {
      console.log('Warnings:');
      for (const line of a.warnings) {
        console.log(`\t• ${line}`);
      }
    } else {
      console.log('Warnings: (none)');
    }
    console.log('');
    console.log(`— After each advTurn() (×${NUM_ADV_TURNS}) —`);
    for (let i = 1; i < snapshots.length; i++) {
      const sn = snapshots[i];
      const ar = analyzeRun(sn.rows);
      const label = `${sn.year} ${sn.periodLabel} (G.turn=${sn.turnIndex})`;
      console.log(`  [${i}/${NUM_ADV_TURNS}] ${label}`);
      console.log(
        `      Market: median ${pctFmt(ar.med)} · avg ${pctFmt(ar.avg)} · neg stations ${ar.counts.negCount}/${ar.counts.total}`
      );
      console.log(`      ${playerLines(sn.rows)}`);
      console.log(`      ${cashLine(sn.playerCash)}`);
    }
    console.log('');
  }
}

main();
