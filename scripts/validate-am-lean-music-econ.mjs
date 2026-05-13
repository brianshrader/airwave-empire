#!/usr/bin/env node
/**
 * Headless A/B for AM lean/automated operating mode (1980s+ AM music survival lane).
 * Loads src/legacy.js in a VM — exercises real calcRev + seedRev, not a reimplementation.
 *
 * Usage:
 *   node scripts/validate-am-lean-music-econ.mjs
 *   node scripts/validate-am-lean-music-econ.mjs --market=wichita --year=1985
 *
 * Diagnostic sweep (share × market × format; fully staffed vs high daypart automation):
 *   node scripts/validate-am-lean-music-econ.mjs --sweep
 *   node scripts/validate-am-lean-music-econ.mjs --sweep --markets=wichita,nashville,atlanta --year=1985
 *   node scripts/validate-am-lean-music-econ.mjs --sweep --json=tmp/am_lean_viability.json
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

const DEFAULT_SWEEP_SHARES = [
  0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06,
];
const DEFAULT_MARKETS = ['wichita', 'nashville', 'atlanta'];
const DEFAULT_FORMATS = ['TOP40', 'COUNTRY', 'ADULT_STANDARDS'];
const NEAR_BREAKEVEN_EBITDA = -25000;

function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
  };
}

const documentStub = {
  body: { innerHTML: '', classList: { toggle() {} } },
  head: { appendChild() {} },
  createElement() {
    return { href: '', download: '', click() {}, style: {}, classList: { toggle() {} } };
  },
  getElementById() {
    return stubEl();
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
  readyState: 'complete',
};

function makeCtx() {
  const noop = () => {};
  const ctx = vm.createContext({
    __WL_HEADLESS__: true,
    console,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() {}, setItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    setTimeout() {
      return 0;
    },
    setInterval() {
      return 0;
    },
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame() {
      return 0;
    },
    alert: noop,
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) {
          typedArray[i] = Math.floor(Math.random() * 256);
        }
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
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
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: true, players: [], renderStatus: noop, action: noop };
  ctx.cm = noop;
  ctx.om = noop;
  ctx.showToast = noop;
  ctx.showError = noop;
  ctx.autoSave = noop;
  ctx.wlTrackSoloSession = noop;
  ctx.getLocalSave = () => null;
  ctx.openScenSelect = noop;
  return ctx;
}

function loadLegacy(ctx, marketId) {
  let legacySrc = readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  }
  legacySrc = legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
  vm.runInContext(legacySrc, ctx);
}

function parseArgs(argv) {
  const out = {
    market: 'wichita',
    year: 1985,
    period: 1,
    sweep: false,
    markets: [...DEFAULT_MARKETS],
    formats: [...DEFAULT_FORMATS],
    shares: [...DEFAULT_SWEEP_SHARES],
    json: null,
  };
  for (const a of argv) {
    if (a === '--sweep') out.sweep = true;
    else if (a.startsWith('--market=')) out.market = a.slice(9).trim() || 'wichita';
    else if (a.startsWith('--markets=')) {
      out.markets = a
        .slice(10)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith('--formats=')) {
      out.formats = a
        .slice(10)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (a.startsWith('--shares=')) {
      out.shares = a
        .slice(9)
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => Number.isFinite(n));
    } else if (a.startsWith('--year=')) out.year = Math.max(1970, parseInt(a.slice(7), 10) || 1985);
    else if (a.startsWith('--period=')) out.period = a.slice(9) === '2' ? 2 : 1;
    else if (a.startsWith('--json=')) out.json = a.slice(7).trim() || null;
  }
  return out;
}

/** Linear interpolate first share where values cross zero (from negative toward non-negative). */
function interpolateBreakevenShare(shares, ebitdas) {
  for (let i = 1; i < shares.length; i++) {
    const a = ebitdas[i - 1];
    const b = ebitdas[i];
    const sa = shares[i - 1];
    const sb = shares[i];
    if (a < 0 && b >= 0 && b !== a) {
      const t = a / (a - b);
      return sa + t * (sb - sa);
    }
    if (a < 0 && b === 0) return sb;
  }
  return null;
}

function firstShareAtOrAbove(shares, ebitdas, floorEbitda) {
  for (let i = 0; i < shares.length; i++) {
    if (ebitdas[i] >= floorEbitda) return shares[i];
  }
  return null;
}

function runSingleShot(ctx, opts) {
  return vm.runInContext(
    `
    (function(){
      globalThis.__WL_HEADLESS__ = true;
      ACTIVE_MARKET = ${JSON.stringify(opts.market)};
      _selectedMarket = ${JSON.stringify(opts.market)};
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(${JSON.stringify(opts.market)});

      var y0 = ${opts.year | 0}, p0 = ${opts.period === 2 ? 2 : 1};
      var G = wlGenMarketGmUnderAtCareerTime(y0, p0);
      G.marketId = ${JSON.stringify(opts.market)};

      function snapStation(s) {
        if (!s || !s.fin) return null;
        return {
          callLetters: s.callLetters,
          format: s.format,
          sigType: s.sig && s.sig.type,
          share: s.rat && s.rat.share,
          rev: s.fin.rev,
          cost: s.fin.cost,
          ebitda: s.fin.ebitda,
          fix: s.fin.fix,
          opsFloor: s.fin.opsFloor,
          salesAdmin: s.fin.salesAdmin,
          tal: s.fin.tal,
        };
      }

      function isPlayerAmMusicStation(s, G) {
        if (!s || !s.isPlayer || !s.sig || s.sig.type !== 'AM' || s.fmBooster) return false;
        var fmt = s.format;
        if (fmt === 'ALL_NEWS' || fmt === 'BROKERED_PROGRAMMING') return false;
        if (['NEWS_TALK', 'SPORTS_TALK', 'PERSONALITY_TALK'].indexOf(fmt) >= 0) return false;
        return true;
      }

      function findPlayerAmMusic(stations) {
        for (var i = 0; i < stations.length; i++) {
          var s = stations[i];
          if (!s || !s.isPlayer) continue;
          if (s.sig && s.sig.type === 'AM' && !s.fmBooster && isPlayerAmMusicStation(s, G)) return s;
        }
        return null;
      }

      function findAmTalkComparable(stations, shareHint) {
        var best = null, bestD = 999;
        for (var j = 0; j < stations.length; j++) {
          var t = stations[j];
          if (!t || t.isPublic || t._bpSlotDeferred) continue;
          if (!t.sig || t.sig.type !== 'AM' || t.fmBooster) continue;
          if (t.format !== 'NEWS_TALK' && t.format !== 'SPORTS_TALK' && t.format !== 'ALL_NEWS') continue;
          var sh = t.rat && t.rat.share != null ? t.rat.share : 0;
          var d = Math.abs(sh - shareHint);
          if (d < bestD) { bestD = d; best = t; }
        }
        return best;
      }

      var am = findPlayerAmMusic(G.stations);
      if (!am) {
        var cand = G.ps && G.ps[0];
        if (cand && cand.sig && cand.sig.type === 'AM' && !cand.fmBooster) {
          cand.format = 'OLDIES';
          am = cand;
        }
      }
      if (!am || !isPlayerAmMusicStation(am, G)) {
        return { ok: false, error: 'No qualifying AM music player station in this market/year.' };
      }

      var sh0 = am.rat && am.rat.share != null ? am.rat.share : 0.04;
      var talk = findAmTalkComparable(G.stations, sh0);

      function snapOpsState(stations) {
        var o = {};
        stations.forEach(function (st) {
          if (!st || !st.ops) return;
          o[st.id] = {
            sell: st.ops.sell,
            spots: st.ops.spots,
            promo: st.ops.promo,
            progBudget: st.ops.progBudget,
          };
        });
        return o;
      }
      function restoreOpsState(stations, o) {
        stations.forEach(function (st) {
          if (!st || !st.ops || !o[st.id]) return;
          st.ops.sell = o[st.id].sell;
          st.ops.spots = o[st.id].spots;
          st.ops.promo = o[st.id].promo;
          st.ops.progBudget = o[st.id].progBudget;
        });
      }

      function refreshAll() {
        (G.stations || []).forEach(function (st) {
          if (st && !st._bpSlotDeferred && !st.isPublic) calcRev(st, G);
        });
        seedRev(G.stations, G);
        if (typeof updateAllStationsBudgetStress === 'function') updateAllStationsBudgetStress(G);
      }

      refreshAll();
      var opsFrozen = snapOpsState(G.stations);

      am.operatingMode = 'normal';
      restoreOpsState(G.stations, opsFrozen);
      refreshAll();
      var normalSnap = snapStation(am);

      var progBkLean = JSON.stringify(am.prog);
      if (am.prog) {
        ['morningDrive', 'midday', 'afternoonDrive', 'evening', 'overnight'].forEach(function (sl) {
          if (am.prog[sl]) am.prog[sl].talent = null;
        });
      }
      restoreOpsState(G.stations, opsFrozen);
      refreshAll();
      var leanSnap = snapStation(am);
      am.prog = JSON.parse(progBkLean);

      am.operatingMode = 'normal';
      restoreOpsState(G.stations, opsFrozen);
      refreshAll();

      var talkSnap = talk ? snapStation(talk) : null;

      var costDropPct =
        normalSnap && normalSnap.cost > 0
          ? Math.round((100 * (normalSnap.cost - leanSnap.cost)) / normalSnap.cost)
          : null;

      return {
        ok: true,
        market: G.marketId,
        year: G.year,
        period: G.period,
        formats: {
          amMusic: { format: am.format, share: sh0 },
          talkCompare: talk
            ? { callLetters: talk.callLetters, format: talk.format, share: talk.rat && talk.rat.share }
            : null,
        },
        leanVsNormalMusic: {
          normal: normalSnap,
          lean: leanSnap,
          costDropPct: costDropPct,
          ebitdaDelta: leanSnap.ebitda - normalSnap.ebitda,
          leanProfitable: leanSnap.ebitda > 0,
        },
        talkUpsideHint: talkSnap
          ? {
              talkEbitda: talkSnap.ebitda,
              talkRev: talkSnap.rev,
              musicLeanEbitda: leanSnap.ebitda,
            }
          : null,
      };
    })()
    `,
    ctx
  );
}

function runSweep(ctx, opts, marketId) {
  const sharesJson = JSON.stringify(opts.shares);
  const formatsJson = JSON.stringify(opts.formats);
  const year = opts.year | 0;
  const period = opts.period === 2 ? 2 : 1;

  return vm.runInContext(
    `
    (function(){
      globalThis.__WL_HEADLESS__ = true;
      var SHARES = ${sharesJson};
      var FORMATS = ${formatsJson};
      var y0 = ${year}, p0 = ${period};
      var marketId = ${JSON.stringify(marketId)};

      function snapStation(s) {
        if (!s || !s.fin) return null;
        return {
          callLetters: s.callLetters,
          format: s.format,
          rev: s.fin.rev,
          cost: s.fin.cost,
          ebitda: s.fin.ebitda,
        };
      }

      function isPlayerAmMusicStation(s, G) {
        if (!s || !s.isPlayer || !s.sig || s.sig.type !== 'AM' || s.fmBooster) return false;
        var fmt = s.format;
        if (fmt === 'ALL_NEWS' || fmt === 'BROKERED_PROGRAMMING') return false;
        if (['NEWS_TALK', 'SPORTS_TALK', 'PERSONALITY_TALK'].indexOf(fmt) >= 0) return false;
        return true;
      }

      function findPlayerAmMusic(stations) {
        for (var i = 0; i < stations.length; i++) {
          var s = stations[i];
          if (!s || !s.isPlayer) continue;
          if (s.sig && s.sig.type === 'AM' && !s.fmBooster && isPlayerAmMusicStation(s, G)) return s;
        }
        return null;
      }

      function findAmTalkComparable(stations, shareHint) {
        var best = null, bestD = 999;
        for (var j = 0; j < stations.length; j++) {
          var t = stations[j];
          if (!t || t.isPublic || t._bpSlotDeferred) continue;
          if (!t.sig || t.sig.type !== 'AM' || t.fmBooster) continue;
          if (t.format !== 'NEWS_TALK' && t.format !== 'SPORTS_TALK' && t.format !== 'ALL_NEWS') continue;
          var sh = t.rat && t.rat.share != null ? t.rat.share : 0;
          var d = Math.abs(sh - shareHint);
          if (d < bestD) { bestD = d; best = t; }
        }
        return best;
      }

      function snapOpsState(stations) {
        var o = {};
        stations.forEach(function (st) {
          if (!st || !st.ops) return;
          o[st.id] = {
            sell: st.ops.sell,
            spots: st.ops.spots,
            promo: st.ops.promo,
            progBudget: st.ops.progBudget,
          };
        });
        return o;
      }
      function restoreOpsState(stations, o) {
        stations.forEach(function (st) {
          if (!st || !st.ops || !o[st.id]) return;
          st.ops.sell = o[st.id].sell;
          st.ops.spots = o[st.id].spots;
          st.ops.promo = o[st.id].promo;
          st.ops.progBudget = o[st.id].progBudget;
        });
      }

      function refreshAll() {
        (G.stations || []).forEach(function (st) {
          if (st && !st._bpSlotDeferred && !st.isPublic) calcRev(st, G);
        });
        seedRev(G.stations, G);
        if (typeof updateAllStationsBudgetStress === 'function') updateAllStationsBudgetStress(G);
      }

      function stationWeightedSum(s, G) {
        var H = publicNewsHabitEngageMult(s, G);
        return COH.reduce(function (sum, c) {
          var pop = POP.cohorts[c] && POP.cohorts[c].t || 0;
          var engage = (AQH_ENGAGE[c] || 0.060) * H;
          return sum + ((s.rat.cur[c] && s.rat.cur[c].share) || 0) * pop * engage;
        }, 0);
      }

      function applyShareScaleToStation(s, G, k) {
        var H = publicNewsHabitEngageMult(s, G);
        COH.forEach(function (coh) {
          var cur = s.rat.cur[coh];
          if (!cur) return;
          var pop = (POP.cohorts[coh] && POP.cohorts[coh].t || 0) * effUniverse(s);
          var engage = (AQH_ENGAGE[coh] || 0.060) * H;
          cur.share = Math.round(cur.share * k * 1e8) / 1e8;
          cur.aqh = Math.round(cur.share * pop * engage);
          if (s.mom[coh]) s.mom[coh].cur = cur.share;
        });
        s.rat.aqh = COH.reduce(function (sum, coh) {
          return sum + ((s.rat.cur[coh] && s.rat.cur[coh].aqh) || 0);
        }, 0);
      }

      function recomputeAllHeadlineShares(G) {
        var d2 = publicRadioWeightedListeningDenominator(G.stations, G);
        G.stations.forEach(function (st) {
          if (!st || st._bpSlotDeferred || !st.rat) return;
          var H = publicNewsHabitEngageMult(st, G);
          var num = COH.reduce(function (sum, c) {
            var pop = POP.cohorts[c] && POP.cohorts[c].t || 0;
            var engage = (AQH_ENGAGE[c] || 0.060) * H;
            return sum + ((st.rat.cur[c] && st.rat.cur[c].share) || 0) * pop * engage;
          }, 0);
          st.rat.share = Math.round((num / Math.max(d2, 1e-12)) * 1e8) / 1e8;
        });
      }

      /**
       * Set headline share for one station to target T (fraction 0–1) by scaling cohort rows; renormalize all stations.
       * Uses k = T*(M-S)/(S*(1-T)) with M = market weighted mass, S = station weighted sum (pre-scale).
       */
      function forceStationTargetHeadlineShare(s, G, targetShare) {
        var M = publicRadioWeightedListeningDenominator(G.stations, G);
        var S = stationWeightedSum(s, G);
        if (S < 1e-16) return false;
        var T = Math.max(1e-6, Math.min(0.999, targetShare));
        if (T >= 1 - 1e-9) return false;
        var k = (T * (M - S)) / (S * (1 - T));
        applyShareScaleToStation(s, G, k);
        recomputeAllHeadlineShares(G);
        return true;
      }

      ACTIVE_MARKET = marketId;
      _selectedMarket = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);

      var G = wlGenMarketGmUnderAtCareerTime(y0, p0);
      G.marketId = marketId;

      var formatResults = [];

      for (var fi = 0; fi < FORMATS.length; fi++) {
        var fmt = FORMATS[fi];
        var am = findPlayerAmMusic(G.stations);
        if (!am) {
          var cand = G.ps && G.ps[0];
          if (cand && cand.sig && cand.sig.type === 'AM' && !cand.fmBooster) {
            cand.format = fmt;
            am = cand;
          }
        } else {
          am.format = fmt;
        }
        if (!am || !isPlayerAmMusicStation(am, G)) {
          formatResults.push({
            format: fmt,
            ok: false,
            error: 'No qualifying AM music player for format ' + fmt,
            rows: [],
          });
          continue;
        }

        refreshAll();
        var opsFrozen = snapOpsState(G.stations);
        var ratBase = JSON.parse(JSON.stringify(am.rat));
        var talkRef = findAmTalkComparable(G.stations, am.rat && am.rat.share != null ? am.rat.share : 0.03);

        var rows = [];
        for (var si = 0; si < SHARES.length; si++) {
          var target = SHARES[si];
          am.rat = JSON.parse(JSON.stringify(ratBase));

          forceStationTargetHeadlineShare(am, G, target);
          restoreOpsState(G.stations, opsFrozen);

          am.operatingMode = 'normal';
          refreshAll();
          var n = snapStation(am);
          var talkSnap = talkRef ? snapStation(talkRef) : null;

          restoreOpsState(G.stations, opsFrozen);
          var progBkL = JSON.stringify(am.prog);
          if (am.prog) {
            ['morningDrive', 'midday', 'afternoonDrive', 'evening', 'overnight'].forEach(function (sl) {
              if (am.prog[sl]) am.prog[sl].talent = null;
            });
          }
          refreshAll();
          var l = snapStation(am);
          am.prog = JSON.parse(progBkL);

          am.operatingMode = 'normal';
          restoreOpsState(G.stations, opsFrozen);
          refreshAll();

          rows.push({
            share: target,
            headlineShareAfter: am.rat && am.rat.share,
            normal: {
              rev: n && n.rev,
              cost: n && n.cost,
              ebitda: n && n.ebitda,
              profitable: !!(n && n.ebitda > 0),
            },
            lean: {
              rev: l && l.rev,
              cost: l && l.cost,
              ebitda: l && l.ebitda,
              profitable: !!(l && l.ebitda > 0),
            },
            ebitdaDeltaLeanVsNormal: (l && l.ebitda != null && n && n.ebitda != null) ? l.ebitda - n.ebitda : null,
            talkComparable: talkSnap
              ? {
                  format: talkRef.format,
                  share: talkRef.rat && talkRef.rat.share,
                  rev: talkSnap.rev,
                  ebitda: talkSnap.ebitda,
                  profitable: talkSnap.ebitda > 0,
                }
              : null,
          });
        }

        formatResults.push({
          format: fmt,
          ok: true,
          callLetters: am.callLetters,
          rows: rows,
        });
      }

      return {
        ok: true,
        market: marketId,
        year: G.year,
        period: G.period,
        formats: formatResults,
      };
    })()
    `,
    ctx
  );
}

function printSweepSummary(payload, nearBreakeven) {
  if (!payload || !payload.markets) return;
  console.log('\n=== AM LEAN MUSIC VIABILITY SWEEP (diagnostic) ===\n');

  for (const m of payload.markets) {
    console.log('— Market:', m.market, '| year', m.year, 'P' + m.period);
    for (const fr of m.formats) {
      if (!fr.ok) {
        console.log('  ', fr.format, ':', fr.error || 'skip');
        continue;
      }
      const rows = fr.rows || [];
      const normalEbit = rows.map((r) => r.normal.ebitda);
      const leanEbit = rows.map((r) => r.lean.ebitda);
      const shares = rows.map((r) => r.share);
      const beN = interpolateBreakevenShare(shares, normalEbit);
      const beL = interpolateBreakevenShare(shares, leanEbit);
      const survN = firstShareAtOrAbove(shares, normalEbit, nearBreakeven);
      const survL = firstShareAtOrAbove(shares, leanEbit, nearBreakeven);

      console.log('  Format:', fr.format, '(' + (fr.callLetters || '?') + ')');
      console.log(
        '    EBITDA≥0 share (interp):  normal ~',
        beN != null ? (beN * 100).toFixed(2) + '%' : '—',
        ' | lean ~',
        beL != null ? (beL * 100).toFixed(2) + '%' : '—'
      );
      console.log(
        '    "Near break-even" (EBITDA ≥ $' +
          nearBreakeven.toLocaleString() +
          ') first share in grid:  normal ≥',
        survN != null ? (survN * 100).toFixed(1) + '%' : '—',
        ' | lean ≥',
        survL != null ? (survL * 100).toFixed(1) + '%' : '—'
      );

      console.log('    share   normalEBITDA  leanEBITDA   Δlean  talkEBITDA (talk shr)');
      for (const r of rows) {
        const tc = r.talkComparable;
        const line =
          '    ' +
          (r.share * 100).toFixed(1).padStart(4) +
          '%' +
          String(Math.round(r.normal.ebitda || 0)).padStart(12) +
          String(Math.round(r.lean.ebitda || 0)).padStart(12) +
          String(Math.round(r.ebitdaDeltaLeanVsNormal || 0)).padStart(8) +
          (tc
            ? String(Math.round(tc.ebitda)).padStart(12) + '  (' + ((tc.share || 0) * 100).toFixed(2) + '%)'
            : '        —');
        console.log(line);
      }

      const talkDom = rows.some((r) => r.talkComparable && r.talkComparable.ebitda > (r.lean.ebitda || 0));
      console.log(
        '    Talk EBITDA higher than lean music (same row)?',
        talkDom ? 'yes (at least one row)' : 'no'
      );
    }
    console.log('');
  }

  console.log('=== Interpretation (heuristic) ===');
  for (const m of payload.markets) {
    const parts = [];
    for (const fr of m.formats) {
      if (!fr.ok || !fr.rows.length) continue;
      const leanEbit = fr.rows.map((r) => r.lean.ebitda);
      const shares = fr.rows.map((r) => r.share);
      const beL = interpolateBreakevenShare(shares, leanEbit);
      const survL = firstShareAtOrAbove(shares, leanEbit, nearBreakeven);
      if (beL != null || survL != null) {
        parts.push(
          fr.format +
            ': lean viable ~' +
            (beL != null ? (beL * 100).toFixed(1) + '% (EBITDA≥0)' : '') +
            (beL != null && survL != null ? ', ' : '') +
            (survL != null ? '≥' + (survL * 100).toFixed(1) + '% (≥ threshold)' : '')
        );
      }
    }
    if (parts.length) {
      console.log(m.market + ':', parts.join(' | '));
    } else {
      console.log(m.market + ': no clear lean viability band in this share grid (see JSON).');
    }
  }
  console.log(
    '\nSanity: compare `talkComparable` (natural share after your station is scaled) vs forced music share — talk "dominance" is format economics, not identical headline share.\n'
  );
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.sweep) {
    const sweepPayload = { ok: true, meta: { year: opts.year, period: opts.period, nearBreakevenEbitda: NEAR_BREAKEVEN_EBITDA }, markets: [] };
    for (const marketId of opts.markets) {
      const sweepCtx = makeCtx();
      loadLegacy(sweepCtx, marketId);
      const partial = runSweep(sweepCtx, opts, marketId);
      if (!partial || !partial.ok) {
        console.error('validate-am-lean-music-econ: sweep failed for', marketId);
        process.exit(1);
      }
      sweepPayload.markets.push(partial);
    }
    if (opts.json) {
      writeFileSync(opts.json, JSON.stringify(sweepPayload, null, 2), 'utf8');
      console.log('Wrote', opts.json);
    } else {
      console.log(JSON.stringify(sweepPayload, null, 2));
    }
    printSweepSummary(sweepPayload, NEAR_BREAKEVEN_EBITDA);
    return;
  }

  const ctx = makeCtx();
  loadLegacy(ctx, opts.market);
  const report = runSingleShot(ctx, opts);

  console.log(JSON.stringify(report, null, 2));
  if (!report || !report.ok) {
    console.error('validate-am-lean-music-econ: failed —', report && report.error);
    process.exit(1);
  }
  const m = report.leanVsNormalMusic;
  if (!m || !m.normal || !m.lean) {
    process.exit(1);
  }
  if ((m.costDropPct || 0) < 25) {
    console.warn(
      'validate-am-lean-music-econ: warning — expected lean cost drop ~28–40% vs full-service, got',
      m.costDropPct
    );
  }
  console.log(
    'validate-am-lean-music-econ: ok — cost drop',
    m.costDropPct + '%',
    'EBITDA delta',
    m.ebitdaDelta,
    'lean profitable?',
    m.leanProfitable
  );
}

main();
