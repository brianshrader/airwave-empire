#!/usr/bin/env node
/**
 * Headless validation: format BROKERED_PROGRAMMING vs normal / lean / AM talk.
 * Loads src/legacy.js + src/gmMode.js in a VM (real calcRev / appl / GM review math).
 *
 * Usage:
 *   node scripts/validate-brokered-mode.mjs
 *   node scripts/validate-brokered-mode.mjs --year=1985 --share=0.028
 *   node scripts/validate-brokered-mode.mjs --json=tmp/brokered_validation.json
 *
 * Promotion bar bump must stay aligned with campaignMode.js `campaignBrokeredSuccessThresholdBump`.
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const gmModePath = path.join(root, 'src', 'gmMode.js');

const DEFAULT_MARKETS = ['wichita', 'nashville', 'atlanta'];

/** Keep in sync with src/campaignMode.js — campaignBrokeredSuccessThresholdBump */
function campaignBrokeredSuccessThresholdBump(tier, brokeredActive) {
  if (!brokeredActive) return 0;
  const t = tier | 0;
  if (t <= 0) return 2;
  if (t <= 2) return 3;
  if (t <= 4) return 4;
  return 6;
}

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
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = (i * 17 + 3) % 256;
        return typedArray;
      },
      randomUUID() {
        return '00000000-0000-4000-8000-000000000001';
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

function loadGmMode(ctx) {
  vm.runInContext(readFileSync(gmModePath, 'utf8'), ctx);
}

function parseArgs(argv) {
  const out = {
    year: 1985,
    period: 1,
    share: 0.028,
    markets: [...DEFAULT_MARKETS],
    json: null,
  };
  for (const a of argv) {
    if (a.startsWith('--year=')) out.year = Math.max(1970, parseInt(a.slice(7), 10) || 1985);
    else if (a.startsWith('--period=')) out.period = a.slice(9) === '2' ? 2 : 1;
    else if (a.startsWith('--share=')) out.share = Math.min(0.2, Math.max(0.008, parseFloat(a.slice(8)) || 0.028));
    else if (a.startsWith('--markets=')) {
      out.markets = a
        .slice(10)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith('--json=')) out.json = a.slice(7).trim() || null;
  }
  return out;
}

function runMarketEconomics(ctx, opts, marketId) {
  const shareJson = JSON.stringify(opts.share);
  const year = opts.year | 0;
  const period = opts.period === 2 ? 2 : 1;
  return vm.runInContext(
    `
    (function(){
      var marketId = ${JSON.stringify(marketId)};
      var y0 = ${year}, p0 = ${period};
      var TARGET_SHARE = ${shareJson};

      function snapStation(s) {
        if (!s || !s.fin) return null;
        return {
          callLetters: s.callLetters,
          format: s.format,
          rev: s.fin.rev,
          cost: s.fin.cost,
          ebitda: s.fin.ebitda,
          sell: s.ops && s.ops.sell,
          share: s.rat && s.rat.share,
        };
      }

      function findPlayerAmBench(stations) {
        for (var i = 0; i < stations.length; i++) {
          var s = stations[i];
          if (!s || !s.isPlayer) continue;
          if (s.sig && s.sig.type === 'AM' && !s.fmBooster) return s;
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

      function findStrongestAmTalk(stations) {
        var best = null, bestSh = -1;
        for (var j = 0; j < stations.length; j++) {
          var t = stations[j];
          if (!t || t.isPublic || t._bpSlotDeferred) continue;
          if (!t.sig || t.sig.type !== 'AM' || t.fmBooster) continue;
          if (t.format !== 'NEWS_TALK' && t.format !== 'SPORTS_TALK' && t.format !== 'ALL_NEWS') continue;
          var sh = t.rat && t.rat.share != null ? t.rat.share : 0;
          if (sh > bestSh) { bestSh = sh; best = t; }
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

      wlBindGameState(wlGenMarketGmUnderAtCareerTime(y0, p0));
      G.marketId = marketId;

      var am = findPlayerAmBench(G.stations);
      if (!am) {
        var cand = G.ps && G.ps[0];
        if (cand && cand.sig && cand.sig.type === 'AM' && !cand.fmBooster) {
          cand.format = 'OLDIES';
          am = cand;
        }
      }
      if (!am || am.sig.type !== 'AM' || am.fmBooster) {
        return { ok: false, market: marketId, error: 'No player AM station for brokered format bench.' };
      }
      am.operatingMode = 'normal';
      var _talkBench = ['NEWS_TALK', 'ALL_NEWS', 'SPORTS_TALK', 'PODCAST_TALK', 'BROKERED_PROGRAMMING'];
      if (_talkBench.indexOf(am.format) >= 0) {
        am.format = 'OLDIES';
      } else {
        am.format = 'TOP40';
      }
      var baseFmt = am.format;

      refreshAll();
      var ratBase = JSON.parse(JSON.stringify(am.rat));
      am.rat = JSON.parse(JSON.stringify(ratBase));
      forceStationTargetHeadlineShare(am, G, TARGET_SHARE);

      var opsFrozen = snapOpsState(G.stations);
      refreshAll();

      var talkNear = findAmTalkComparable(G.stations, am.rat && am.rat.share != null ? am.rat.share : 0.03);
      var talkStrong = findStrongestAmTalk(G.stations);

      function applyBench(mode) {
        am.operatingMode = 'normal';
        am.format = mode === 'brokered' ? 'BROKERED_PROGRAMMING' : baseFmt;
        restoreOpsState(G.stations, opsFrozen);
        refreshAll();
        return snapStation(am);
      }

      var normalSnap = applyBench('normal');
      var leanSnap = (function () {
        var progBk = JSON.stringify(am.prog);
        if (am.prog) {
          ['morningDrive', 'afternoonDrive', 'midday', 'evening', 'overnight'].forEach(function (sl) {
            if (am.prog[sl]) am.prog[sl].talent = null;
          });
        }
        am.format = baseFmt;
        am.operatingMode = 'normal';
        restoreOpsState(G.stations, opsFrozen);
        refreshAll();
        var sn = snapStation(am);
        am.prog = JSON.parse(progBk);
        am.format = baseFmt;
        am.operatingMode = 'normal';
        restoreOpsState(G.stations, opsFrozen);
        refreshAll();
        return sn;
      })();
      var brokeredSnap = applyBench('brokered');

      am.format = baseFmt;
      am.operatingMode = 'normal';
      restoreOpsState(G.stations, opsFrozen);
      refreshAll();

      var coh = '25-34';
      var applNormal = appl(am, coh, G);
      am.format = 'BROKERED_PROGRAMMING';
      am.operatingMode = 'normal';
      var applBrokered = appl(am, coh, G);
      am.format = baseFmt;
      restoreOpsState(G.stations, opsFrozen);
      refreshAll();

      var frN = franchiseDemoMult(am, coh, G);
      am.format = 'BROKERED_PROGRAMMING';
      var frB = franchiseDemoMult(am, coh, G);
      am.format = baseFmt;
      restoreOpsState(G.stations, opsFrozen);
      refreshAll();

      var talkNearSnap = talkNear ? snapStation(talkNear) : null;
      var talkStrongSnap = talkStrong ? snapStation(talkStrong) : null;

      return {
        ok: true,
        market: marketId,
        year: G.year,
        period: G.period,
        forcedHeadlineShareTarget: TARGET_SHARE,
        headlineShareMusic: am.rat && am.rat.share,
        formats: { amMusic: am.format },
        normal: normalSnap,
        lean: leanSnap,
        brokered: brokeredSnap,
        talkNear: talkNearSnap,
        talkStrong: talkStrongSnap,
        appeal: {
          cohort: coh,
          applNormal: applNormal,
          applBrokered: applBrokered,
          ratioBrokeredToNormal: applNormal > 1e-12 ? applBrokered / applNormal : null,
        },
        franchiseDemoMult: {
          cohort: coh,
          normal: frN,
          brokered: frB,
          ratioBrokeredToNormal: frN > 1e-12 ? frB / frN : null,
        },
      };
    })()
    `,
    ctx
  );
}

function runGmBrokeredPenalty(ctx) {
  return vm.runInContext(
    `
    (function(){
      if (typeof wlGmMode === 'undefined' || !wlGmMode.resolveGmConfig) {
        return { ok: false, error: 'wlGmMode missing' };
      }
      var marketId = 'wichita';
      ACTIVE_MARKET = marketId;
      _selectedMarket = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      wlBindGameState(wlGenMarketGmUnderAtCareerTime(1985, 1));
      G.marketId = marketId;
      G.sc = G.sc || {};
      G.sc.gmMode = true;
      G.sc.gmOwnerArchetype = 'turnaround';
      G.campaignAssignment = { tier: 3, successThreshold: 54, survivalThreshold: 40, contractLengthPeriods: 16 };

      var am = null;
      for (var i = 0; i < G.stations.length; i++) {
        var s = G.stations[i];
        if (s && s.isPlayer && s.sig && s.sig.type === 'AM' && !s.fmBooster) {
          am = s;
          break;
        }
      }
      if (!am) return { ok: false, error: 'No player AM for GM probe' };
      am.operatingMode = 'normal';
      var _talkBench2 = ['NEWS_TALK', 'ALL_NEWS', 'SPORTS_TALK', 'PODCAST_TALK', 'BROKERED_PROGRAMMING'];
      if (_talkBench2.indexOf(am.format) >= 0) am.format = 'OLDIES';
      else am.format = 'TOP40';
      var baseFmtProbe = am.format;

      (G.stations || []).forEach(function (st) {
        if (st && !st._bpSlotDeferred && !st.isPublic) calcRev(st, G);
      });
      seedRev(G.stations, G);

      wlGmMode.initGmStateForGame(G);
      G._gm.pendingGmOnboarding = false;
      G._gm.gmOnboardingSeen = true;
      G._gm.confidence = 58;
      G._gm.closedPeriods = 6;
      G._gm.nextReviewAt = 8;
      G._gm.formalReviewsCompletedThisAssignment = 1;
      G._gm.franchiseSnapshots = [
        { year: 1984, period: 2, avg: 0.55 },
        { year: 1985, period: 1, avg: 0.52 },
      ];
      G.finHistory = [
        { year: 1984, period: 2, revenue: 120000, margin: 6 },
        { year: 1985, period: 1, revenue: 118000, margin: 5 },
      ];

      var cfg = wlGmMode.resolveGmConfig(G);

      function runOnce(brokered) {
        am.format = brokered ? 'BROKERED_PROGRAMMING' : baseFmtProbe;
        am.operatingMode = 'normal';
        var kpis = wlGmMode.computeGmKpis(G, cfg);
        var ev = wlGmMode.evaluateGmReview(G, kpis, cfg);
        return {
          brokered: !!brokered,
          composite: ev.composite,
          good: ev.good,
          bad: ev.bad,
          sm: ev.sm,
          sr: ev.sr,
          sf: ev.sf,
          kpiReasonsSample: (kpis.reasons || []).slice(0, 4),
        };
      }

      function confidenceAfterMediocreReview(brokered) {
        am.format = brokered ? 'BROKERED_PROGRAMMING' : baseFmtProbe;
        am.operatingMode = 'normal';
        wlGmMode.initGmStateForGame(G);
        G._gm.pendingGmOnboarding = false;
        G._gm.gmOnboardingSeen = true;
        G._gm.confidence = 58;
        G._gm.closedPeriods = 6;
        G._gm.nextReviewAt = 8;
        G._gm.formalReviewsCompletedThisAssignment = 1;
        G._gm.franchiseSnapshots = [
          { year: 1984, period: 2, avg: 0.55 },
          { year: 1985, period: 1, avg: 0.52 },
        ];
        G.finHistory = [
          { year: 1984, period: 2, revenue: 120000, margin: 6 },
          { year: 1985, period: 1, revenue: 118000, margin: 5 },
        ];
        var cfg2 = wlGmMode.resolveGmConfig(G);
        var kpis2 = wlGmMode.computeGmKpis(G, cfg2);
        var ev2 = wlGmMode.evaluateGmReview(G, kpis2, cfg2);
        var reasons2 = [];
        var before = G._gm.confidence;
        wlGmMode.applyGmConfidenceUpdate(G, ev2, kpis2, reasons2);
        return {
          confidenceBefore: before,
          confidenceAfter: G._gm.confidence,
          delta: G._gm.confidence - before,
          brokeredLinePresent: reasons2.some(function (r) {
            return String(r).indexOf('Brokered') >= 0;
          }),
        };
      }

      var a = runOnce(false);
      var b = runOnce(true);
      var confN = confidenceAfterMediocreReview(false);
      var confB = confidenceAfterMediocreReview(true);
      return {
        ok: true,
        tier: G.campaignAssignment.tier,
        baseSuccessThreshold: G.campaignAssignment.successThreshold,
        promotionBarBumpIfBrokeredAtAssignmentEnd_tier3: 4,
        normal: a,
        brokered: b,
        compositeDeltaBrokeredMinusNormal: Math.round((b.composite - a.composite) * 10000) / 10000,
        mediocreReviewConfidenceDelta: { normal: confN, brokered: confB },
        confidenceExtraLossFromBrokered: Math.round((confB.delta - confN.delta) * 100) / 100,
      };
    })()
    `,
    ctx
  );
}

function summarizeAnswers(payload) {
  const mets = payload.markets || [];
  let ebitdaImproved = 0;
  let brokeredBeatsStrongTalk = 0;
  let appealRatioOk = 0;
  for (const row of mets) {
    if (!row || !row.ok) continue;
    const n = row.normal && row.normal.ebitda;
    const b = row.brokered && row.brokered.ebitda;
    if (typeof n === 'number' && typeof b === 'number' && b > n) ebitdaImproved++;
    const ts = row.talkStrong && row.talkStrong.rev;
    const br = row.brokered && row.brokered.rev;
    if (typeof ts === 'number' && typeof br === 'number' && br >= ts) brokeredBeatsStrongTalk++;
    const r = row.appeal && row.appeal.ratioBrokeredToNormal;
    if (typeof r === 'number' && r < 0.92) appealRatioOk++;
  }
  const gm = payload.gmPenaltyProbe;
  const compD = gm && gm.ok ? gm.compositeDeltaBrokeredMinusNormal : 0;

  return {
    q1_brokeredImprovesEbitdaVsDyingNormal: ebitdaImproved >= 2 ? 'yes (' + ebitdaImproved + '/' + mets.length + ' markets)' : 'mixed (' + ebitdaImproved + '/' + mets.length + ')',
    q2_brokeredUnderperformsStrongTalkRev: brokeredBeatsStrongTalk === 0 ? 'yes (0/' + mets.length + ' brokered rev >= strongest AM talk rev)' : 'check (' + brokeredBeatsStrongTalk + ' anomalies)',
    q3_appealFranchiseSuppressed: appealRatioOk >= 2 ? 'yes (appl ratio <0.92 in ' + appealRatioOk + '/' + mets.length + ')' : 'check',
    q4_gmCompositeWorsensWhenBrokered: gm && gm.ok && compD > 0 ? 'yes (Δcomposite +' + compD + ')' : gm && gm.ok ? 'flat (' + compD + ')' : 'n/a',
    q5_surviveButDisappoint: ebitdaImproved >= 2 && compD > 0 ? 'yes pattern (EBITDA up in weak-share test + GM composite worsens)' : 'partial',
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = makeCtx();
  loadLegacy(ctx, 'wichita');
  loadGmMode(ctx);

  const payload = {
    ok: true,
    meta: { year: opts.year, period: opts.period, forcedShare: opts.share, markets: opts.markets },
    markets: [],
    gmPenaltyProbe: null,
    answers: {},
  };

  for (const mid of opts.markets) {
    const row = runMarketEconomics(ctx, opts, mid);
    payload.markets.push(row);
    if (!row || !row.ok) payload.ok = false;
  }

  payload.gmPenaltyProbe = runGmBrokeredPenalty(ctx);
  if (!payload.gmPenaltyProbe || !payload.gmPenaltyProbe.ok) {
    console.warn('GM penalty probe failed:', payload.gmPenaltyProbe);
  }

  payload.answers = summarizeAnswers(payload);
  payload.promotionBarNote = {
    syncTo: 'src/campaignMode.js campaignBrokeredSuccessThresholdBump',
    examples: [0, 3, 5].map((tier) => ({
      tier,
      bumpWhenBrokeredAtAssignmentEnd: campaignBrokeredSuccessThresholdBump(tier, true),
    })),
  };

  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify(payload, null, 2), 'utf8');
    console.log('Wrote', opts.json);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }

  console.log('\n--- Required questions (from this run) ---');
  console.log(JSON.stringify(payload.answers, null, 2));

  if (!payload.ok) {
    console.error('validate-brokered-mode: one or more markets failed.');
    process.exit(1);
  }
  process.exit(0);
}

main();
