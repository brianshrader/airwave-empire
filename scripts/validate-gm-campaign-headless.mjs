#!/usr/bin/env node
/**
 * Headless GM + Campaign diagnostics — runs real legacy.js + gmMode.js + campaignMode.js in a VM.
 * Does not reimplement scoring; observes engine state via wlGmMode.getDiagnosticsSnapshot and
 * campaign assignment-end payloads.
 *
 * Usage:
 *   node scripts/validate-gm-campaign-headless.mjs
 *   node scripts/validate-gm-campaign-headless.mjs --mode=gm
 *   node scripts/validate-gm-campaign-headless.mjs --mode=campaign
 *   node scripts/validate-gm-campaign-headless.mjs --mode=batch --runs=8 --seed=424242
 *   node scripts/validate-gm-campaign-headless.mjs --market=atlanta --seed=1 --json=tmp/gm-campaign-diag.json
 *
 * Options:
 *   --mode=gm|campaign|batch   (default: batch)
 *   --seed=N                   PRNG seed (default: 1337)
 *   --runs=N                   batch: number of seeds to run (default: 3)
 *   --market=ID                playable market id (default: atlanta)
 *   --max-periods-gm=N         GM mode advTurn cap (default: 48)
 *   --max-periods-campaign=N   campaign advTurn cap per career attempt (default: 160)
 *   --max-assignments=N        campaign: stop after N assignment results (default: 8)
 *   --json=path                write full report JSON
 *
 * npm: npm run validate:gm-campaign
 *
 * Warnings (heuristic — use --strict to fail the process if any fire):
 *   GM: too few formal reviews vs. turns; confidence/status never moves; fired with no reviews;
 *        job-security countdown jumps oddly; confidence outside 0–100.
 *   Campaign: no assignment-end payloads (stuck career); missing outcome kind; reputation out of bounds;
 *        hard end without payload details.
 *   --revisit-test             (batch) after tallies, run Nashville→tier2→forced return to Nashville persistence check
 *   --compare-profiles         (batch) run campaign with profiles default(8) + extended(10) [+ long(12) with --compare-include-long]
 *   --compare-include-long     with --compare-profiles, also run max-assignments=12 (long profile)
 *   --profile=default|extended|long|short  (batch) named cap: 8 / 10 / 12 / 6 instead of --max-assignments
 *   --tier5-diagnostic       (batch) extended (10) + long (12) only: Tier 5 entrant quality, confidence shelf trace, KPI/composite convergence (reviewHistory + evaluateGmReview; no engine edits)
 *   --tier3-diagnostic       (batch) Tier 3 (c3_seattle) entry conditions, grace-period reviews, outcomes & softness heuristic
 * Exit code: 0 by default; use --strict for non-zero exit when warnings exist.
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const gmModePath = path.join(root, 'src', 'gmMode.js');
const campaignModePath = path.join(root, 'src', 'campaignMode.js');

/** Standard campaign-length profiles for ladder vs window diagnostics (assignment-end count cap per career). */
const CAMPAIGN_PROFILE_MAX = {
  /** Normal playable arc — matches campaignMode CAMPAIGN_FULL_ARC_ASSIGNMENTS. */
  default: 8,
  extended: 10,
  long: 12,
  /** Optional short window for stress / old-baseline comparison (previous default was 6). */
  short: 6,
};

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function makeLegacySrc(marketId) {
  let legacySrc = readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  }
  legacySrc = legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
  return injectHeadlessMegaFragNewsGuard(legacySrc);
}

function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
  };
}

const documentStub = {
  body: { innerHTML: '' },
  head: { appendChild() {} },
  createElement() {
    return { href: '', download: '', click() {} };
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

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createHeadlessContext(quiet) {
  const noop = () => {};
  const ctx = vm.createContext({
    console: quiet
      ? { log: noop, warn: noop, error: console.error, table: noop, info: noop }
      : console,
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() {}, setItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn, _ms) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() {
      return 0;
    },
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert: noop,
    fetch: null,
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('utf8'),
    Blob: class BlobStub {
      constructor() {}
    },
    FileReader: class FileReaderStub {
      readAsText() {}
    },
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
  ctx.MP = { mode: 'solo', playerId: 0, isHost: true, players: [], renderStatus: noop };
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

function loadEngine(ctx, marketId) {
  const campaignSrc = readFileSync(campaignModePath, 'utf8');
  const gmSrc = readFileSync(gmModePath, 'utf8');
  const legacySrc = makeLegacySrc(marketId);
  vm.runInContext(campaignSrc, ctx);
  vm.runInContext(gmSrc, ctx);
  vm.runInContext(legacySrc, ctx);
}

function parseArgs(argv) {
  const out = {
    mode: 'batch',
    seed: 1337,
    runs: 3,
    market: 'atlanta',
    json: null,
    maxPeriodsGm: 48,
    maxPeriodsCampaign: 160,
    maxAssignments: 8,
    quiet: false,
    strict: false,
    revisitTest: false,
    compareProfiles: false,
    compareIncludeLong: false,
    profile: null,
    tier5Diagnostic: false,
    tier3Diagnostic: false,
  };
  for (const a of argv) {
    if (a.startsWith('--mode=')) out.mode = a.slice(7);
    else if (a.startsWith('--seed=')) out.seed = parseInt(a.slice(7), 10) || 0;
    else if (a.startsWith('--runs=')) out.runs = Math.max(1, parseInt(a.slice(7), 10) || 1);
    else if (a.startsWith('--market=')) out.market = a.slice(9).trim() || 'atlanta';
    else if (a.startsWith('--json=')) out.json = a.slice(7).trim() || null;
    else if (a.startsWith('--max-periods-gm=')) out.maxPeriodsGm = Math.max(4, parseInt(a.slice(17), 10) || 48);
    else if (a.startsWith('--max-periods-campaign='))
      out.maxPeriodsCampaign = Math.max(8, parseInt(a.slice(23), 10) || 160);
    else if (a.startsWith('--max-assignments='))
      out.maxAssignments = Math.max(1, parseInt(a.slice(18), 10) || 8);
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--revisit-test') out.revisitTest = true;
    else if (a === '--compare-profiles') out.compareProfiles = true;
    else if (a === '--compare-include-long') out.compareIncludeLong = true;
    else if (a.startsWith('--profile=')) out.profile = a.slice(10).trim().toLowerCase() || null;
    else if (a === '--tier5-diagnostic') out.tier5Diagnostic = true;
    else if (a === '--tier3-diagnostic') out.tier3Diagnostic = true;
  }
  if (!['gm', 'campaign', 'batch'].includes(out.mode)) out.mode = 'batch';
  if (out.profile && CAMPAIGN_PROFILE_MAX[out.profile] != null) {
    out.maxAssignments = CAMPAIGN_PROFILE_MAX[out.profile];
  }
  return out;
}

function analyzeGmTimeline(timeline, initialConf) {
  const warnings = [];
  let reviewEvents = 0;
  let confChanged = false;
  let statusChanged = false;
  const firstStatus = timeline[0] && timeline[0].snap ? timeline[0].snap.status : null;
  let lastStatus = firstStatus;
  let lastUntil = timeline[0] && timeline[0].snap ? timeline[0].snap.periodsUntilReview : null;
  let firedNoReviews = false;

  for (const row of timeline) {
    if (row.formalReview) reviewEvents++;
    const s = row.snap;
    if (!s) continue;
    if (initialConf != null && s.confidence !== initialConf) confChanged = true;
    if (lastStatus && s.status !== lastStatus) statusChanged = true;
    lastStatus = s.status;
    if (s.fired && reviewEvents === 0 && row.turn > 4) {
      /* allow early edge cases */
    }
    if (s.periodsUntilReview != null && lastUntil != null) {
      const jumpedUp = s.periodsUntilReview - lastUntil > 3;
      if (jumpedUp && !row.formalReview && row.turn > 2) {
        warnings.push(
          `Turn ${row.turn}: periods-until jumped (${lastUntil}→${s.periodsUntilReview}) without a logged formal review — possible countdown glitch.`
        );
      }
    }
    lastUntil = s.periodsUntilReview;
  }

  const last = timeline[timeline.length - 1];
  const lastSnap = last && last.snap;
  if (lastSnap && lastSnap.fired && lastSnap.reviewCount === 0) {
    firedNoReviews = true;
    warnings.push('Fired with empty reviewHistory — unexpected unless confidence hit 0 without a formal review.');
  }

  if (timeline.length >= 12 && reviewEvents < 2) {
    warnings.push(
      `Only ${reviewEvents} formal review(s) logged in ${timeline.length} turns — expected at least 2 for a healthy GM pipeline (may defer until enough fin history).`
    );
  }

  if (timeline.length >= 8 && !confChanged && !lastSnap?.fired) {
    warnings.push('Confidence never changed over many turns — possible stuck GM updates.');
  }

  if (timeline.length >= 8 && !statusChanged && firstStatus === 'secure' && !lastSnap?.fired) {
    warnings.push('Status label never changed — may be normal if performance is flat.');
  }

  for (const row of timeline) {
    const c = row.snap && row.snap.confidence;
    if (c != null && (c < 0 || c > 100)) warnings.push(`Turn ${row.turn}: confidence ${c} out of 0–100.`);
  }

  return { warnings, reviewEvents, confChanged, statusChanged, firedNoReviews };
}

function runGmOnce(ctx, opts) {
  const { seed, marketId, maxPeriods } = opts;
  return vm.runInContext(
    `
    (function(){
      var rng = (${mulberry32.toString()})(${seed >>> 0});
      Math.random = function(){ return rng(); };
      ACTIVE_MARKET = ${JSON.stringify(marketId)};
      _selectedMarket = ${JSON.stringify(marketId)};
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(${JSON.stringify(marketId)});
      G = genMarket('gm_under');
      G.marketId = ${JSON.stringify(marketId)};
      G.ps = (G.stations || []).filter(function(s){ return s && s.isPlayer; });
      if (typeof wlGmMode !== 'undefined' && wlGmMode.initGmStateForGame) wlGmMode.initGmStateForGame(G);
      var initialConf = G._gm ? G._gm.confidence : null;
      var timeline = [];
      var prevRc = 0;
      var maxP = ${maxPeriods | 0};
      for (var t = 0; t < maxP; t++) {
        if (G._gm && G._gm.fired) break;
        advTurn();
        var snap = wlGmMode.getDiagnosticsSnapshot(G);
        var formal = snap && snap.reviewCount > prevRc;
        prevRc = snap ? snap.reviewCount : prevRc;
        timeline.push({
          turn: t + 1,
          year: G.year,
          period: G.period,
          snap: snap,
          formalReview: formal
        });
        if (G._gm && G._gm.fired) break;
      }
      return { initialConf: initialConf, timeline: timeline };
    })()
    `,
    ctx
  );
}

function runCampaignOnce(ctx, opts) {
  const { seed, marketId, maxPeriods, maxAssignments, tier5ShelfDiag } = opts;
  const shelfOn = tier5ShelfDiag ? 'true' : 'false';
  return vm.runInContext(
    `
    (function(){
      var rng = (${mulberry32.toString()})(${seed >>> 0});
      Math.random = function(){ return rng(); };
      if (typeof wlCampaignDeactivate === 'function') wlCampaignDeactivate();
      ACTIVE_MARKET = ${JSON.stringify(marketId)};
      _selectedMarket = ${JSON.stringify(marketId)};
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(${JSON.stringify(marketId)});

      globalThis.__WL_TIER5_SHELF_DIAG__ = ${shelfOn};

      wlCampaign.beginCareerWithIdentity('Headless GM', 'Diagnostic Broadcasting Group');
      // legacy.js uses top-level let G; campaign only assigns globalThis.G — sync for headless VM
      if (globalThis.G) G = globalThis.G;

      var assignmentResults = [];
      /** Tier 5 only: formal-review KPI rows (re-eval via exported evaluateGmReview + reviewHistory snapshots). */
      var tier5KpiReviewTrace = [];
      var turns = 0;
      var maxP = ${maxPeriods | 0};
      var maxA = ${maxAssignments | 0};
      var st = wlCampaign.ensureState();
      var repStart = st.reputation;

      while (assignmentResults.length < maxA && turns < maxP) {
        if (!G || !G.campaignAssignment) {
          assignmentResults.push({ error: 'missing_campaign_assignment', turns: turns });
          break;
        }
        var prevHistLen = G._gm && G._gm.reviewHistory ? G._gm.reviewHistory.length : 0;
        advTurn();
        turns++;

        if (
          ${shelfOn} &&
          wlGmMode &&
          typeof wlGmMode.evaluateGmReview === 'function' &&
          G &&
          G.campaignAssignment &&
          (G.campaignAssignment.tier | 0) >= 5 &&
          G._gm &&
          G._gm.reviewHistory
        ) {
          var hist = G._gm.reviewHistory;
          for (var hi = prevHistLen; hi < hist.length; hi++) {
            var ent = hist[hi];
            var kpis = ent.kpis;
            var cfg = G._gm.config;
            var ev = wlGmMode.evaluateGmReview(G, kpis, cfg);
            var tEv = ev.tier != null ? ev.tier | 0 : 2;
            var goodCut =
              tEv >= 5 ? 0.161 : tEv >= 4 ? 0.185 : tEv === 3 ? 0.21 : 0.22;
            var badCut = tEv >= 5 ? 0.496 : tEv >= 4 ? 0.52 : tEv === 3 ? 0.53 : 0.52;
            var cat = ev.good ? 'good' : ev.bad ? 'bad' : 'mediocre';
            if (ev.t5Classification && ev.t5Classification.band) {
              cat = ev.t5Classification.band;
            }
            var noProg =
              kpis &&
              (kpis.revenueTrend === 'flat' || kpis.revenueTrend === 'declining') &&
              (kpis.franchiseTrend === 'flat' || kpis.franchiseTrend === 'declining');
            var storedC = ent.eval && ent.eval.composite != null ? ent.eval.composite : null;
            tier5KpiReviewTrace.push({
              reviewIndex: hi + 1,
              year: ent.year,
              period: ent.period,
              confidenceBefore: ent.confidenceBefore,
              confidenceAfter: ent.confidenceAfter,
              confidenceDelta:
                ent.confidenceAfter != null && ent.confidenceBefore != null
                  ? ent.confidenceAfter - ent.confidenceBefore
                  : null,
              tierPressure: kpis.tierPressure,
              campaignTier: kpis.campaignTier,
              discretionaryRatio: kpis.discretionaryRatio,
              revenueTrend: kpis.revenueTrend,
              franchiseTrend: kpis.franchiseTrend,
              marginAvg: kpis.marginAvg,
              franchiseAvg: kpis.franchiseAvg,
              turnaroundPatienceKpis: !!kpis.turnaroundPatienceActive,
              turnaroundPatienceEval: !!ev.turnaroundPatienceApplied,
              noProgressTrends: !!noProg,
              stressMargin: ev.sm,
              stressRevenue: ev.sr,
              stressFranchise: ev.sf,
              stressEfficiency: ev.se,
              core: ev.core,
              composite: ev.composite,
              discretionaryEval: ev.disc,
              goodCut: goodCut,
              badCut: badCut,
              good: ev.good,
              bad: ev.bad,
              category: cat,
              storedEvalComposite: storedC,
              compositeReevalMinusStored:
                storedC != null && ev.composite != null ? ev.composite - storedC : null,
            });
          }
        }

        var endPayload = typeof wlCampaignGetLastAssignmentEndPayload === 'function'
          ? wlCampaignGetLastAssignmentEndPayload()
          : (wlCampaign.getLastAssignmentEndPayload ? wlCampaign.getLastAssignmentEndPayload() : null);

        if (endPayload) {
          assignmentResults.push({
            turnsAtEnd: turns,
            year: G.year,
            period: G.period,
            kind: endPayload.kind,
            campaignWin: !!endPayload.campaignWin,
            careerEndedHard: !!endPayload.careerEndedHard,
            reputation: endPayload.reputation,
            repDelta: endPayload.repDelta,
            tierBefore: endPayload.tierBefore,
            nextTier: endPayload.nextTier,
            nextAssignmentId: endPayload.nextAssignment && endPayload.nextAssignment.id,
            nextMarketId: endPayload.nextAssignment && endPayload.nextAssignment.marketId,
            standing: endPayload.standing,
            gmFired: G._gm && G._gm.fired,
            gmConfidence: G._gm ? Math.round(G._gm.confidence) : null,
            assignmentId: endPayload.assignmentId,
            marketId: endPayload.marketId,
            periodsClosed: endPayload.periodsClosed,
            tier5ConfidenceShelfDiag: endPayload.tier5ConfidenceShelfDiag != null ? endPayload.tier5ConfidenceShelfDiag : null,
            finalConfidenceBeforeClassification: endPayload.finalConfidenceBeforeClassification != null ? endPayload.finalConfidenceBeforeClassification : null,
            successThreshold: endPayload.successThreshold != null ? endPayload.successThreshold : null,
            survivalThreshold: endPayload.survivalThreshold != null ? endPayload.survivalThreshold : null,
            tier5KpiReviewTrace: endPayload.tierBefore === 5 ? tier5KpiReviewTrace.slice() : null,
          });

          if (endPayload.tierBefore === 5) {
            tier5KpiReviewTrace = [];
          }

          if (endPayload.campaignWin || endPayload.careerEndedHard) break;

          if (typeof wlCampaignStartNextAssignment === 'function') wlCampaignStartNextAssignment();
          if (globalThis.G) G = globalThis.G;
          if (!G.campaignAssignment && !endPayload.careerEndedHard) {
            assignmentResults.push({ error: 'next_assignment_failed', turns: turns });
            break;
          }
        }
      }

      var stEnd = wlCampaign.ensureState();
      var persist =
        typeof wlCampaign.getCampaignPersistenceDiagnostics === 'function'
          ? wlCampaign.getCampaignPersistenceDiagnostics()
          : null;
      var tier5LadderRow = null;
      if (wlCampaign && wlCampaign.LADDER && wlCampaign.LADDER[4]) {
        var r5 = wlCampaign.LADDER[4];
        tier5LadderRow = {
          id: r5.id,
          tier: r5.tier,
          successThreshold: r5.successThreshold,
          survivalThreshold: r5.survivalThreshold,
          contractLengthPeriods: r5.contractLengthPeriods,
          gmConfig: r5.gmConfig
            ? {
                startConfidence: r5.gmConfig.startConfidence,
                minFranchiseAvg: r5.gmConfig.minFranchiseAvg,
                minMarginPct: r5.gmConfig.minMarginPct,
              }
            : {},
        };
      }
      return {
        turns: turns,
        reputationStart: repStart,
        reputationEnd: stEnd.reputation,
        assignmentResults: assignmentResults,
        campaignWon: !!stEnd.campaignWon,
        active: stEnd.active,
        history: stEnd.history ? stEnd.history.slice() : [],
        persistence: persist,
        restoredFromArchiveFlag: G && G._campaignRestoredFromArchive,
        tier5LadderRow: tier5LadderRow
      };
    })()
    `,
    ctx
  );
}

/**
 * Campaign batch with Tier 3 (Seattle) snapshots: entry cash/metrics, first N grace reviews, exit outcome.
 * Does not change engine code — observes G + reviewHistory only.
 */
function runCampaignTier3DiagnosticOnce(ctx, opts) {
  const { seed, marketId, maxPeriods, maxAssignments } = opts;
  return vm.runInContext(
    `
    (function(){
      var rng = (${mulberry32.toString()})(${seed >>> 0});
      Math.random = function(){ return rng(); };
      if (typeof wlCampaignDeactivate === 'function') wlCampaignDeactivate();
      ACTIVE_MARKET = ${JSON.stringify(marketId)};
      _selectedMarket = ${JSON.stringify(marketId)};
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(${JSON.stringify(marketId)});

      function captureTier3Entry(G) {
        var ps = (G.ps || []).filter(function(s){ return s && s.isPlayer; });
        var totalRev = 0;
        var tr = 0, td = 0;
        for (var i = 0; i < ps.length; i++) {
          var s = ps[i];
          var rev = s.fin && s.fin.rev ? s.fin.rev : 0;
          totalRev += rev;
          var op = s.ops || {};
          td += (op.promo || 0) + (op.progBudget || 0);
          tr += rev;
        }
        var discRatio = tr > 0 ? td / tr : 0;
        var hist = G.finHistory || [];
        var margins = [];
        for (var h = 0; h < hist.length; h++) {
          if (typeof hist[h].margin === 'number') margins.push(hist[h].margin);
        }
        var marginAvg = margins.length ? margins.reduce(function(a,b){ return a+b; }, 0) / margins.length : null;
        var sumW = 0, sumF = 0;
        for (var j = 0; j < ps.length; j++) {
          var w = Math.max(1, ps[j].fin && ps[j].fin.rev ? ps[j].fin.rev : 1);
          var fr = typeof ps[j].talentFranchise === 'number' ? ps[j].talentFranchise : 0.88;
          sumF += fr * w; sumW += w;
        }
        var wFr = sumW > 0 ? sumF / sumW : null;
        var cash = typeof G.cash === 'number' ? G.cash : 0;
        var cashDanger = cash < 150000;
        var marginDanger = marginAvg != null && marginAvg < 0;
        var pressureAlerts = 0;
        try {
          if (typeof checkPressure === 'function') {
            var al = checkPressure(G);
            pressureAlerts = al && al.length ? al.length : 0;
          }
        } catch (_e) {}
        var nearBankrupt = cash < 0 || marginDanger || (pressureAlerts > 0 && cash < 50000);
        var ca = G.campaignAssignment || {};
        return {
          cash: Math.round(cash),
          startingRevenue: Math.round(totalRev),
          marginAvg: marginAvg != null ? Math.round(marginAvg * 10) / 10 : null,
          discretionaryRatio: Math.round(discRatio * 1000) / 1000,
          weightedFranchise: wFr != null ? Math.round(wFr * 1000) / 1000 : null,
          stationCount: ps.length,
          nearBankruptcyHeuristic: !!nearBankrupt,
          nearBankruptcyFlags: {
            cashUnder150k: cashDanger,
            negativeMargin: marginDanger,
            cashNegative: cash < 0,
            pressureAlertCount: pressureAlerts,
          },
          assignmentId: ca.id || null,
          evaluationGraceReviews: ca.evaluationGraceReviews != null ? ca.evaluationGraceReviews | 0 : 0,
        };
      }

      function minConfInReviews(rh) {
        if (!rh || !rh.length) return null;
        var m = 100;
        for (var i = 0; i < rh.length; i++) {
          var e = rh[i];
          if (e.confidenceBefore != null) m = Math.min(m, e.confidenceBefore);
          if (e.confidenceAfter != null) m = Math.min(m, e.confidenceAfter);
        }
        return m;
      }

      function graceDetailFromHistory(rh, graceN) {
        var out = [];
        var n = Math.min(graceN || 2, rh ? rh.length : 0);
        for (var i = 0; i < n; i++) {
          var e = rh[i];
          var ev = e.eval || {};
          var kp = e.kpis || {};
          var outcome = ev.good ? 'good' : (ev.bad ? 'bad' : 'mediocre');
          var delta = (e.confidenceAfter != null && e.confidenceBefore != null)
            ? (e.confidenceAfter - e.confidenceBefore) : null;
          out.push({
            index: i,
            outcome: outcome,
            confidenceDelta: delta,
            turnaroundPatienceApplied: !!ev.turnaroundPatienceApplied,
            efficiencySuppressed: !!ev.turnaroundPatienceApplied,
            revenueTrend: kp.revenueTrend || null,
            efficiencyStress: ev.se != null ? Math.round(ev.se * 1000) / 1000 : null,
          });
        }
        return out;
      }

      wlCampaign.beginCareerWithIdentity('Headless GM', 'Diagnostic Broadcasting Group');
      if (globalThis.G) G = globalThis.G;

      var assignmentResults = [];
      var tier3Assignments = [];
      var pendingTier3Entry = null;
      var turns = 0;
      var maxP = ${maxPeriods | 0};
      var maxA = ${maxAssignments | 0};
      var st = wlCampaign.ensureState();
      var repStart = st.reputation;

      if (G.campaignAssignment && G.campaignAssignment.tier === 3) {
        pendingTier3Entry = captureTier3Entry(G);
      }

      while (assignmentResults.length < maxA && turns < maxP) {
        if (!G || !G.campaignAssignment) {
          assignmentResults.push({ error: 'missing_campaign_assignment', turns: turns });
          break;
        }
        advTurn();
        turns++;

        var endPayload = typeof wlCampaignGetLastAssignmentEndPayload === 'function'
          ? wlCampaignGetLastAssignmentEndPayload()
          : (wlCampaign.getLastAssignmentEndPayload ? wlCampaign.getLastAssignmentEndPayload() : null);

        if (endPayload) {
          var rhClone = null;
          if ((endPayload.tierBefore | 0) === 3 && G._gm && G._gm.reviewHistory) {
            try { rhClone = JSON.parse(JSON.stringify(G._gm.reviewHistory)); } catch (_e) { rhClone = []; }
          }

          assignmentResults.push({
            turnsAtEnd: turns,
            year: G.year,
            period: G.period,
            kind: endPayload.kind,
            campaignWin: !!endPayload.campaignWin,
            careerEndedHard: !!endPayload.careerEndedHard,
            reputation: endPayload.reputation,
            repDelta: endPayload.repDelta,
            tierBefore: endPayload.tierBefore,
            nextTier: endPayload.nextTier,
            nextAssignmentId: endPayload.nextAssignment && endPayload.nextAssignment.id,
            nextMarketId: endPayload.nextAssignment && endPayload.nextAssignment.marketId,
            standing: endPayload.standing,
            gmFired: G._gm && G._gm.fired,
            gmConfidence: G._gm ? Math.round(G._gm.confidence) : null,
            assignmentId: endPayload.assignmentId,
            marketId: endPayload.marketId,
            periodsClosed: endPayload.periodsClosed
          });

          if ((endPayload.tierBefore | 0) === 3) {
            var graceN = 2;
            if (G.campaignAssignment && G.campaignAssignment.evaluationGraceReviews != null) {
              graceN = G.campaignAssignment.evaluationGraceReviews | 0;
            } else if (wlCampaign && wlCampaign.LADDER && wlCampaign.LADDER[2] && wlCampaign.LADDER[2].evaluationGraceReviews != null) {
              graceN = wlCampaign.LADDER[2].evaluationGraceReviews | 0;
            }
            var minC = minConfInReviews(rhClone);
            tier3Assignments.push({
              entry: pendingTier3Entry,
              exit: {
                kind: endPayload.kind,
                gmConfidence: G._gm ? Math.round(G._gm.confidence) : null,
                periodsClosed: endPayload.periodsClosed,
                gmFired: !!(G._gm && G._gm.fired),
                reviewCount: rhClone ? rhClone.length : 0,
                graceReviewsDetail: graceDetailFromHistory(rhClone, graceN),
                minConfidenceInReviews: minC,
                dippedBelow50: minC != null && minC < 50,
                dippedBelow40: minC != null && minC < 40,
              },
            });
            pendingTier3Entry = null;
          }

          if (endPayload.campaignWin || endPayload.careerEndedHard) break;

          if (typeof wlCampaignStartNextAssignment === 'function') wlCampaignStartNextAssignment();
          if (globalThis.G) G = globalThis.G;
          if (!G.campaignAssignment && !endPayload.careerEndedHard) {
            assignmentResults.push({ error: 'next_assignment_failed', turns: turns });
            break;
          }
          if (G.campaignAssignment && (G.campaignAssignment.tier | 0) === 3) {
            pendingTier3Entry = captureTier3Entry(G);
          }
        }
      }

      var stEnd = wlCampaign.ensureState();
      var persist =
        typeof wlCampaign.getCampaignPersistenceDiagnostics === 'function'
          ? wlCampaign.getCampaignPersistenceDiagnostics()
          : null;

      var tier3LadderRow = null;
      if (wlCampaign && wlCampaign.LADDER && wlCampaign.LADDER[2]) {
        var r3 = wlCampaign.LADDER[2];
        tier3LadderRow = {
          id: r3.id,
          tier: r3.tier,
          marketId: r3.marketId,
          cashMult: r3.cashMult,
          corporateCashGrant: r3.corporateCashGrant,
          evaluationGraceReviews: r3.evaluationGraceReviews,
          successThreshold: r3.successThreshold,
          survivalThreshold: r3.survivalThreshold,
          failureThreshold: r3.failureThreshold,
          contractLengthPeriods: r3.contractLengthPeriods,
        };
      }

      return {
        turns: turns,
        reputationStart: repStart,
        reputationEnd: stEnd.reputation,
        assignmentResults: assignmentResults,
        campaignWon: !!stEnd.campaignWon,
        active: stEnd.active,
        history: stEnd.history ? stEnd.history.slice() : [],
        persistence: persist,
        restoredFromArchiveFlag: G && G._campaignRestoredFromArchive,
        tier3LadderRow: tier3LadderRow,
        tier3Assignments: tier3Assignments,
      };
    })()
    `,
    ctx
  );
}

function analyzeCampaign(result) {
  const warnings = [];
  const ar = result.assignmentResults || [];
  if (result.turns >= 8 && ar.length === 0) {
    warnings.push('No assignment-end payload captured — career may not be progressing (evaluateAssignmentEnd never fired).');
  }
  for (const a of ar) {
    if (a.error) warnings.push(a.error + (a.turns != null ? ` at turn ${a.turns}` : ''));
    if (a.kind == null && !a.error && !a.campaignWin) warnings.push('Assignment chunk missing outcome kind.');
    if (a.reputation != null && (a.reputation < 0 || a.reputation > 100)) warnings.push('Reputation out of 0–100.');
  }
  const last = ar[ar.length - 1];
  if (last && last.careerEndedHard && !last.kind) warnings.push('Hard career end without kind on last payload.');
  return warnings;
}

function meanNum(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function medianNum(arr) {
  if (!arr || !arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function buildTier3Assessment(o) {
  const {
    promotionRate,
    firingRate,
    demotionRate,
    graceGoodPct,
    graceMediocrePct,
    graceBadPct,
    avgGraceDelta,
    harmlessGrace,
    n,
  } = o;
  const signals = [];

  if (!n) {
    return {
      code: 'NO_DATA',
      summary:
        'No Tier 3 assignment completed in this batch — increase --max-assignments (need ≥3 completed assignments to finish a Tier 3 contract) or run more seeds.',
      signals: ['zero Tier 3 rows'],
    };
  }

  if (promotionRate > 0.7 && firingRate < 0.02 && demotionRate < 0.12 && harmlessGrace) {
    signals.push('promotion rate >70% with near-zero firings');
    signals.push('grace-period reviews rarely “bad” and average confidence change is mild');
    return {
      code: 'TOO_SOFT',
      summary:
        'Tier 3 looks easy to clear: promotions dominate, firings are rare, and grace-period reviews inflict little downside.',
      signals,
    };
  }

  if (firingRate > 0.15 || (promotionRate < 0.25 && demotionRate + firingRate > 0.35)) {
    signals.push('elevated failure or demotion share');
    return {
      code: 'TOO_HARD',
      summary:
        'Tier 3 outcomes are harsh relative to a turnaround brief — many demotions or firings vs promotions.',
      signals,
    };
  }

  signals.push('mixed outcomes; grace window does not fully immunize reviews');
  return {
    code: 'BALANCED',
    summary:
      'Tier 3 shows a plausible turnaround arc: early grace helps, but outcomes and confidence swings still vary.',
    signals,
  };
}

/**
 * Pool Tier 3 rows across seeds; grace shares use all first-N grace reviews in aggregate.
 */
function aggregateTier3Diagnostic(runs, tier3LadderRow) {
  const allTier3 = [];
  for (const run of runs) {
    const seed = run.seed;
    for (const t of run.tier3Assignments || []) {
      allTier3.push({ seed, entry: t.entry, exit: t.exit });
    }
  }
  const cash = allTier3.map((x) => x.entry && x.entry.cash).filter((c) => c != null);
  const dangerStarts = allTier3.filter((x) => x.entry && x.entry.nearBankruptcyHeuristic).length;
  const graceRows = [];
  for (const t of allTier3) {
    const gd = t.exit && t.exit.graceReviewsDetail;
    if (!gd) continue;
    for (const r of gd) graceRows.push(r);
  }
  const gGood = graceRows.filter((r) => r.outcome === 'good').length;
  const gMed = graceRows.filter((r) => r.outcome === 'mediocre').length;
  const gBad = graceRows.filter((r) => r.outcome === 'bad').length;
  const gracePool = graceRows.length;
  const graceDeltas = graceRows.map((r) => r.confidenceDelta).filter((d) => d != null);
  const suppressed = graceRows.filter((r) => r.efficiencySuppressed).length;

  const promoted = allTier3.filter((x) => x.exit && x.exit.kind === 'promoted').length;
  const lateral = allTier3.filter((x) => x.exit && x.exit.kind === 'lateral').length;
  const demoted = allTier3.filter((x) => x.exit && x.exit.kind === 'demoted').length;
  const fired = allTier3.filter((x) => x.exit && x.exit.kind === 'fired').length;
  const n = allTier3.length;
  const endingConf = allTier3.map((x) => x.exit && x.exit.gmConfidence).filter((c) => c != null);
  const dipped50 = allTier3.filter((x) => x.exit && x.exit.dippedBelow50).length;
  const dipped40 = allTier3.filter((x) => x.exit && x.exit.dippedBelow40).length;

  const promotionRate = n ? promoted / n : 0;
  const demotionRate = n ? demoted / n : 0;
  const firingRate = n ? fired / n : 0;
  const lateralRate = n ? lateral / n : 0;

  const graceGoodPct = gracePool ? gGood / gracePool : 0;
  const graceMediocrePct = gracePool ? gMed / gracePool : 0;
  const graceBadPct = gracePool ? gBad / gracePool : 0;
  const avgGraceDelta = graceDeltas.length ? meanNum(graceDeltas) : null;

  const harmlessGrace =
    gracePool > 0 &&
    graceBadPct < 0.08 &&
    graceGoodPct + graceMediocrePct > 0.85 &&
    (avgGraceDelta == null || avgGraceDelta > -3);

  const assessment = buildTier3Assessment({
    promotionRate,
    firingRate,
    demotionRate,
    graceGoodPct,
    graceMediocrePct,
    graceBadPct,
    avgGraceDelta,
    harmlessGrace,
    n,
  });

  return {
    tier3AssignmentCount: n,
    runsWithTier3Completion: runs.filter((r) => (r.tier3Assignments || []).length > 0).length,
    totalRuns: runs.length,
    startingConditions: {
      meanCash: cash.length ? meanNum(cash) : null,
      medianCash: cash.length ? medianNum(cash) : null,
      minCash: cash.length ? Math.min(...cash) : null,
      maxCash: cash.length ? Math.max(...cash) : null,
      pctStartsUnderDangerHeuristic: n ? dangerStarts / n : 0,
    },
    gracePeriod: {
      graceReviewCount: gracePool,
      outcomeShares: {
        good: graceGoodPct,
        mediocre: graceMediocrePct,
        bad: graceBadPct,
      },
      avgConfidenceDeltaDuringGrace: avgGraceDelta,
      pctEfficiencySuppressedInGrace: gracePool ? suppressed / gracePool : null,
    },
    outcomes: {
      promoted,
      lateral,
      demoted,
      fired,
      promotionRate,
      lateralRate,
      demotionRate,
      firingRate,
      avgEndingConfidence: endingConf.length ? meanNum(endingConf) : null,
      pctDippedBelow50: n ? dipped50 / n : 0,
      pctDippedBelow40: n ? dipped40 / n : 0,
    },
    tier3Assessment: assessment,
    ladderRow: tier3LadderRow || null,
  };
}

/** Non-consecutive repeat of the same tier index in career history (e.g. T1→T2→T1). */
function countTierRevisitEvents(hist) {
  if (!hist || hist.length < 3) return 0;
  let c = 0;
  for (let i = 2; i < hist.length; i++) {
    const ti = hist[i].tier;
    for (let j = 0; j < i - 1; j++) {
      if (hist[j].tier === ti) {
        c++;
        break;
      }
    }
  }
  return c;
}

/** Counts i where tier[i]===tier[i-2] and tier[i]!==tier[i-1] (ABAB-style churn). */
function countTwoTierOscillationEvents(hist) {
  const t = (hist || []).map((h) => h.tier);
  let osc = 0;
  for (let i = 3; i < t.length; i++) {
    if (t[i] === t[i - 2] && t[i] !== t[i - 1]) osc++;
  }
  return osc;
}

function aggregateCampaignBatchDeep(campaignRuns) {
  const byTier = {};
  const byAssignmentId = {};
  for (let tier = 1; tier <= 5; tier++) {
    byTier[tier] = {
      n: 0,
      promoted: 0,
      lateral: 0,
      demoted: 0,
      fired: 0,
      won: 0,
      sumConfidence: 0,
      sumRepDelta: 0,
      sumPeriods: 0,
      periodsN: 0,
    };
  }

  let totalRevisits = 0;
  let totalOsc = 0;
  let runsWithOsc2 = 0;
  let maxCareerLen = 0;
  let maxCareerLenWin = 0;
  let maxCareerLenHard = 0;
  let runsReachedT5 = 0;
  const trapTierScores = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const run of campaignRuns) {
    const ar = run.assignmentResults || [];
    const hist = run.history || [];
    totalRevisits += countTierRevisitEvents(hist);
    const osc = countTwoTierOscillationEvents(hist);
    totalOsc += osc;
    if (osc >= 2) runsWithOsc2++;

    maxCareerLen = Math.max(maxCareerLen, hist.length);
    if (run.campaignWon) maxCareerLenWin = Math.max(maxCareerLenWin, hist.length);
    if (ar.some((a) => a.careerEndedHard)) maxCareerLenHard = Math.max(maxCareerLenHard, hist.length);

    const tiersSeen = hist.map((h) => h.tier | 0);
    if (tiersSeen.some((t) => t >= 5)) runsReachedT5++;

    for (const a of ar) {
      if (a.error) continue;
      const tier = a.tierBefore | 0;
      if (tier < 1 || tier > 5) continue;
      const bucket = byTier[tier];
      bucket.n++;
      const k = a.campaignWin ? 'won' : a.kind;
      if (k && bucket[k] != null) bucket[k]++;
      if (a.gmConfidence != null) bucket.sumConfidence += a.gmConfidence;
      if (a.repDelta != null) bucket.sumRepDelta += a.repDelta;
      if (a.periodsClosed != null) {
        bucket.sumPeriods += a.periodsClosed;
        bucket.periodsN++;
      }

      const aid = a.assignmentId || 'unknown';
      if (!byAssignmentId[aid]) {
        byAssignmentId[aid] = {
          n: 0,
          promoted: 0,
          lateral: 0,
          demoted: 0,
          fired: 0,
          won: 0,
        };
      }
      const ab = byAssignmentId[aid];
      ab.n++;
      if (k && ab[k] != null) ab[k]++;
    }

    for (let t = 1; t <= 5; t++) {
      const sub = hist.filter((h) => (h.tier | 0) === t);
      if (sub.length < 2) continue;
      let bad = 0;
      let good = 0;
      for (const h of sub) {
        const r = h.result;
        if (r === 'demoted' || r === 'fired') bad++;
        if (r === 'promoted' || r === 'lateral' || r === 'won') good++;
      }
      if (bad > good) trapTierScores[t]++;
    }
  }

  const tierSummary = {};
  for (let tier = 1; tier <= 5; tier++) {
    const b = byTier[tier];
    tierSummary[tier] = {
      ...b,
      avgEndingConfidence: b.n ? b.sumConfidence / b.n : null,
      avgRepDelta: b.n ? b.sumRepDelta / b.n : null,
      avgPeriodsClosed: b.periodsN ? b.sumPeriods / b.periodsN : null,
    };
  }

  const nRuns = campaignRuns.length;
  const trapTiers = Object.entries(trapTierScores)
    .filter(([, v]) => v >= Math.max(1, Math.ceil(nRuns * 0.25)))
    .map(([tier]) => Number(tier));

  return {
    byTier: tierSummary,
    byAssignmentId,
    tierRevisitEvents: totalRevisits,
    twoTierOscillationEvents: totalOsc,
    runsWithOscillationAtLeast2: runsWithOsc2,
    longestCareerAssignments: maxCareerLen,
    longestCareerBeforeWin: maxCareerLenWin || null,
    longestCareerBeforeHardEnd: maxCareerLenHard || null,
    runsThatReachedTier5: runsReachedT5,
    totalRuns: nRuns,
    trapTierHeuristic: trapTiers,
    topTierReachRate: nRuns ? runsReachedT5 / nRuns : 0,
  };
}

/**
 * Per-profile aggregate for compare-profiles JSON (slim run list optional).
 */
function buildProfileSummary(campaignRuns, maxAssignments, profileKey) {
  const deep = aggregateCampaignBatchDeep(campaignRuns);
  const kinds = { promoted: 0, lateral: 0, demoted: 0, fired: 0, won: 0 };
  let sumRepEnd = 0;
  let sumAssignLen = 0;
  let sumLastConf = 0;
  let nLastConf = 0;
  const slimRuns = [];

  for (const run of campaignRuns) {
    sumRepEnd += run.reputationEnd != null ? run.reputationEnd : 0;
    const ar = run.assignmentResults || [];
    const valid = ar.filter((a) => !a.error);
    sumAssignLen += valid.length;
    const last = valid.length ? valid[valid.length - 1] : null;
    if (last && last.gmConfidence != null) {
      sumLastConf += last.gmConfidence;
      nLastConf++;
    }
    for (const a of ar) {
      if (a.error) continue;
      if (a.campaignWin) kinds.won++;
      else if (a.kind && kinds[a.kind] != null) kinds[a.kind]++;
    }
    slimRuns.push({
      seed: run.seed,
      assignmentCount: valid.length,
      campaignWon: !!run.campaignWon,
      reputationEnd: run.reputationEnd,
    });
  }

  const n = campaignRuns.length || 1;
  const t4 = deep.byTier[4];
  const t5 = deep.byTier[5];
  const tier4FiringRate = t4 && t4.n ? t4.fired / t4.n : null;
  const tier5FiringRate = t5 && t5.n ? t5.fired / t5.n : null;
  const round4 = (x) => (x != null && typeof x === 'number' ? Math.round(x * 10000) / 10000 : x);

  return {
    profileKey,
    maxAssignments,
    kindTallies: kinds,
    winCount: kinds.won,
    winRate: n ? kinds.won / n : 0,
    topTierReachRate: deep.topTierReachRate,
    longestCareerAssignments: deep.longestCareerAssignments,
    avgAssignmentsCompleted: sumAssignLen / n,
    avgEndingReputation: sumRepEnd / n,
    avgEndingGmConfidence: nLastConf ? sumLastConf / nLastConf : null,
    tier4: t4
      ? {
          n: t4.n,
          promoted: t4.promoted,
          lateral: t4.lateral,
          demoted: t4.demoted,
          fired: t4.fired,
          won: t4.won,
          avgEndingConfidence: t4.avgEndingConfidence != null ? round4(t4.avgEndingConfidence) : null,
          firingRateAmongTier4Outcomes: tier4FiringRate != null ? round4(tier4FiringRate) : null,
        }
      : null,
    tier5: t5
      ? {
          n: t5.n,
          promoted: t5.promoted,
          lateral: t5.lateral,
          demoted: t5.demoted,
          fired: t5.fired,
          won: t5.won,
          avgEndingConfidence: t5.avgEndingConfidence != null ? round4(t5.avgEndingConfidence) : null,
          firingRateAmongTier5Outcomes: tier5FiringRate != null ? round4(tier5FiringRate) : null,
        }
      : null,
    tierRevisitEvents: deep.tierRevisitEvents,
    twoTierOscillationEvents: deep.twoTierOscillationEvents,
    runsWithOscillationAtLeast2: deep.runsWithOscillationAtLeast2,
    campaignDeep: deep,
    campaignRunsSummary: slimRuns,
  };
}

/**
 * Evidence-based interpretation: cap/window vs ladder (esp. T4/T5). Not statistical certainty.
 */
function buildProfileInterpretation(profiles) {
  const def = profiles.default;
  const ext = profiles.extended;
  const lng = profiles.long;
  if (!def || !ext) {
    return {
      code: 'INSUFFICIENT_DATA',
      summary:
        'Need both default and extended profile summaries to compare career length vs ladder shape.',
      bullets: [],
    };
  }

  const bullets = [];
  let code = 'MIXED';

  const dWon = def.winCount;
  const eWon = ext.winCount;
  const lWon = lng ? lng.winCount : 0;

  const dReach = def.topTierReachRate;
  const eReach = ext.topTierReachRate;
  const lReach = lng ? lng.topTierReachRate : null;

  const reachDelta = eReach - dReach;
  const winsAppearWithLength = eWon > dWon || (lng && lWon > eWon);

  if (dWon === 0 && eWon > 0) {
    bullets.push(
      'Wins appeared only (or first) in the extended window: the default assignment cap likely hid achievable campaign victories.'
    );
    code = 'CAP_WINDOW_WIN';
  } else if (dWon === 0 && lWon > 0 && eWon === 0) {
    bullets.push(
      'Wins required the long profile: very late-tier outcomes need more assignment slots than default–extended to surface in batch.'
    );
    code = 'CAP_WINDOW_WIN';
  }

  if (reachDelta >= 0.08) {
    bullets.push(
      'Top-tier reach rises materially with a longer career window — many runs never reach Tier 5 within eight assignment results.'
    );
    if (code === 'MIXED') code = 'CAP_WINDOW_REACH';
  } else if (reachDelta >= 0.03) {
    bullets.push('Top-tier reach improves modestly with more assignment slots.');
  }

  const t4d = def.tier4;
  const t4e = ext.tier4;
  if (t4d && t4e && t4d.n >= 5 && t4e.n >= 5) {
    const frD = t4d.firingRateAmongTier4Outcomes;
    const frE = t4e.firingRateAmongTier4Outcomes;
    if (frE != null && frD != null && frE < frD - 0.05) {
      bullets.push(
        'Tier 4 firing rate is lower with more assignment slots in this batch (and more Tier 4 observations); short caps can overstate how “cliffy” Tier 4 feels.'
      );
    }
    if (frE != null && frE >= 0.22 && (frE >= frD - 0.05 || frD == null)) {
      bullets.push(
        'Tier 4 still shows a substantial firing share in extended runs — elite-market pressure remains a real barrier, not only the validation window.'
      );
      if (code.startsWith('CAP_WINDOW')) code = 'MIXED';
      else if (code === 'MIXED') code = 'LADDER_T4';
    }
    if (t4e.lateral > t4d.lateral && t4e.n > t4d.n * 0.5) {
      bullets.push('Tier 4 lateral outcomes increase with longer careers (more Tier 4 observations).');
    }
  }

  if (eWon === 0 && (lng ? lWon === 0 : true) && eReach < 0.08) {
    bullets.push(
      'Even with extended (and possibly long) profiles, wins stay at zero and top-tier reach stays low — ladder difficulty at Tier 4–5 may still be the binding limit, not only the validation window.'
    );
    if (code === 'MIXED') code = 'LADDER_T5';
  }

  if (bullets.length === 0) {
    bullets.push(
      'Compare default vs extended reach and wins above; pattern is ambiguous — use tier breakdowns and rerun with more seeds if needed.'
    );
    code = 'INSUFFICIENT_DATA';
  }

  const primary =
    code === 'CAP_WINDOW_WIN' || code === 'CAP_WINDOW_REACH'
      ? 'The current ladder may be win-capable, but the default eight-assignment window is often too short to surface wins and Tier 5 in batch.'
      : code === 'LADDER_T4' || code === 'LADDER_T5'
        ? 'Evidence still points to Tier 4–5 ladder pressure; extending careers alone may not fix zero wins / low reach.'
        : code === 'MIXED'
          ? 'Mixed signals: some improvement with longer windows, but Tier 4 harshness may still cap outcomes.'
          : bullets.join(' ');

  return {
    code,
    summary: primary,
    bullets,
  };
}

function buildProfileComparisonObject(profiles) {
  const def = profiles.default;
  const ext = profiles.extended;
  const lng = profiles.long;
  const out = {
    winsDeltaExtendedVsDefault: ext && def ? ext.winCount - def.winCount : null,
    topTierReachDeltaExtendedVsDefault:
      ext && def ? ext.topTierReachRate - def.topTierReachRate : null,
    avgAssignmentsDeltaExtendedVsDefault:
      ext && def ? ext.avgAssignmentsCompleted - def.avgAssignmentsCompleted : null,
    tier4: {},
  };
  if (def && ext && def.tier4 && ext.tier4) {
    out.tier4 = {
      nDelta: ext.tier4.n - def.tier4.n,
      promotedDelta: ext.tier4.promoted - def.tier4.promoted,
      lateralDelta: ext.tier4.lateral - def.tier4.lateral,
      demotedDelta: ext.tier4.demoted - def.tier4.demoted,
      firedDelta: ext.tier4.fired - def.tier4.fired,
      firingRateExtended: ext.tier4.firingRateAmongTier4Outcomes,
      firingRateDefault: def.tier4.firingRateAmongTier4Outcomes,
    };
  }
  if (lng && ext) {
    out.winsDeltaLongVsExtended = lng.winCount - ext.winCount;
    out.topTierReachDeltaLongVsExtended = lng.topTierReachRate - ext.topTierReachRate;
  }
  out.interpretation = buildProfileInterpretation(profiles);
  return out;
}

function meanTier5(arr) {
  const v = arr.filter((x) => typeof x === 'number' && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * Tier 5 entrant quality & outcomes for campaign win diagnosis (validation-only).
 */
function analyzeTier5Entrants(campaignRuns, maxAssignments, profileKey) {
  const ladderTier5 = campaignRuns.find((r) => r.tier5LadderRow)?.tier5LadderRow || null;
  const entrants = [];
  const tier5Rows = [];

  for (const run of campaignRuns) {
    const ar = run.assignmentResults || [];
    const idx = ar.findIndex((a) => !a.error && a.tierBefore === 5);
    if (idx === -1) continue;

    const prior = idx > 0 ? ar[idx - 1] : null;
    const repEnter = prior ? prior.reputation : run.reputationStart;
    const confEndPrior = prior ? prior.gmConfidence : null;
    const slotsRemaining = maxAssignments - idx;

    let prom = 0;
    let lat = 0;
    let dem = 0;
    let fire = 0;
    for (let j = 0; j < idx; j++) {
      const a = ar[j];
      if (a.error || a.campaignWin) continue;
      if (a.kind === 'promoted') prom++;
      else if (a.kind === 'lateral') lat++;
      else if (a.kind === 'demoted') dem++;
      else if (a.kind === 'fired') fire++;
    }

    let pathLabel = 'mixed';
    if (fire > 0 || dem >= 2) pathLabel = 'recovery_or_lossy';
    else if (prom >= 3 && dem === 0 && fire === 0) pathLabel = 'promotion_streak';
    else if (lat >= 3) pathLabel = 'lateral_heavy';

    entrants.push({
      seed: run.seed,
      assignmentIndexFirstT5: idx,
      assignmentsCompletedBeforeT5: idx,
      slotsRemainingAtT5Entry: slotsRemaining,
      reputationAtT5Entry: repEnter,
      confidenceEndOfPriorAssignment: confEndPrior,
      priorPromotions: prom,
      priorLaterals: lat,
      priorDemotions: dem,
      priorFirings: fire,
      pathLabel,
      campaignWonThisRun: !!run.campaignWon,
    });

    const startConf =
      ladderTier5?.gmConfig?.startConfidence ??
      run.tier5LadderRow?.gmConfig?.startConfidence ??
      null;

    for (let j = idx; j < ar.length; j++) {
      const a = ar[j];
      if (a.error || a.tierBefore !== 5) continue;
      const outcome = a.campaignWin ? 'won' : a.kind;
      const confDelta =
        a.gmConfidence != null && startConf != null ? a.gmConfidence - startConf : null;
      tier5Rows.push({
        seed: run.seed,
        outcome,
        gmConfidenceEnd: a.gmConfidence,
        confidenceDeltaVsTier5Start: confDelta,
        repDelta: a.repDelta,
        reputationAfter: a.reputation,
      });
    }
  }

  const nReach = entrants.length;
  const nTotal = campaignRuns.length;
  const oneLeft = entrants.filter((e) => e.slotsRemainingAtT5Entry === 1).length;
  const twoPlus = entrants.filter((e) => e.slotsRemainingAtT5Entry >= 2).length;

  const priorTotals = {
    promotions: entrants.reduce((s, e) => s + e.priorPromotions, 0),
    laterals: entrants.reduce((s, e) => s + e.priorLaterals, 0),
    demotions: entrants.reduce((s, e) => s + e.priorDemotions, 0),
    firings: entrants.reduce((s, e) => s + e.priorFirings, 0),
  };

  const dist = { won: 0, promoted: 0, lateral: 0, demoted: 0, fired: 0 };
  for (const t of tier5Rows) {
    if (dist[t.outcome] != null) dist[t.outcome]++;
  }
  const wins = dist.won;

  const pathLabelCounts = entrants.reduce((acc, e) => {
    acc[e.pathLabel] = (acc[e.pathLabel] || 0) + 1;
    return acc;
  }, {});

  const reachersWhoWon = entrants.filter((e) => e.campaignWonThisRun).length;

  return {
    profileKey,
    maxAssignments,
    ladderTier5,
    totalRuns: nTotal,
    runsReachingTier5: nReach,
    tier5ReachRate: nTotal ? nReach / nTotal : 0,
    entrantAverages: {
      avgConfidenceEndOfPriorAssignment: meanTier5(entrants.map((e) => e.confidenceEndOfPriorAssignment)),
      avgReputationAtT5Entry: meanTier5(entrants.map((e) => e.reputationAtT5Entry)),
      avgSlotsRemainingAtT5Entry: meanTier5(entrants.map((e) => e.slotsRemainingAtT5Entry)),
      avgPriorDemotions: meanTier5(entrants.map((e) => e.priorDemotions)),
      avgPriorFirings: meanTier5(entrants.map((e) => e.priorFirings)),
    },
    slotsRemainingDistribution: {
      exactlyOneAssignmentLeft: oneLeft,
      twoOrMoreAssignmentsLeft: twoPlus,
      amongTier5Reachers: nReach,
    },
    priorOutcomeTotalsAcrossEntrants: priorTotals,
    pathLabelCounts,
    entrants,
    tier5OutcomeDistribution: dist,
    tier5AssignmentCount: tier5Rows.length,
    avgEndingConfidenceTier5: meanTier5(tier5Rows.map((t) => t.gmConfidenceEnd)),
    avgConfidenceDeltaDuringTier5: meanTier5(tier5Rows.map((t) => t.confidenceDeltaVsTier5Start)),
    avgReputationDeltaDuringTier5: meanTier5(tier5Rows.map((t) => t.repDelta)),
    winCount: wins,
    winRateAmongTier5Assignments: tier5Rows.length ? wins / tier5Rows.length : 0,
    runsReachingT5WhoWonCampaign: reachersWhoWon,
    winRateAmongTier5ReachingRuns: nReach ? reachersWhoWon / nReach : 0,
  };
}

/**
 * Per-run formal-review trace from gmMode (Tier 5 shelf diagnostic). Explains point-mass confidence endings vs thresholds.
 */
function analyzeTier5ShelfConvergence(campaignRuns, profileKey) {
  const rows = [];
  for (const run of campaignRuns) {
    const ar = run.assignmentResults || [];
    const t5 = ar.find((a) => !a.error && a.tierBefore === 5);
    if (!t5) continue;
    const steps = t5.tier5ConfidenceShelfDiag;
    rows.push({
      seed: run.seed,
      steps: Array.isArray(steps) ? steps : [],
      finalRounded: t5.gmConfidence,
      finalRaw: t5.finalConfidenceBeforeClassification,
      survivalThreshold: t5.survivalThreshold,
      successThreshold: t5.successThreshold,
    });
  }

  const simplifySteps = (steps) =>
    (steps || []).map((s) => ({
      outcome: s.outcome,
      deltaRaw: s.deltaRaw,
      confidenceAfter: s.confidenceAfter,
      closingBracket: s.components && s.components.closingStretchBracket,
      closingStretchPenalty: s.components && s.components.closingStretchPenalty,
      closingEligible: !!(s.components && s.components.closingStretchEligible),
      clampHitLow: !!s.clampHitLow,
      clampHitHigh: !!s.clampHitHigh,
    }));

  const fingerprints = rows.map((r) => JSON.stringify(simplifySteps(r.steps)));
  const uniq = new Set(fingerprints);
  const lastRaw = rows.map((r) => r.finalRaw).filter((x) => x != null);
  const uniqueLast = [...new Set(lastRaw.map((x) => Math.round(x)))].sort((a, b) => a - b);

  let clampLow = 0;
  let clampHigh = 0;
  let closingIn44to52 = 0;
  let closingBelow44 = 0;
  let reviewsTotal = 0;
  let mediocreCount = 0;
  let goodCount = 0;
  let badCount = 0;
  for (const r of rows) {
    for (const s of r.steps) {
      reviewsTotal++;
      if (s.clampHitLow) clampLow++;
      if (s.clampHitHigh) clampHigh++;
      if (s.outcome === 'mediocre') mediocreCount++;
      if (s.outcome === 'good') goodCount++;
      if (s.outcome === 'bad') badCount++;
      const b = s.components && s.components.closingStretchBracket;
      if (b === '44to52') closingIn44to52++;
      if (b === 'below44') closingBelow44++;
    }
  }

  const roundingMismatch = rows.filter(
    (r) =>
      r.finalRaw != null &&
      r.finalRounded != null &&
      Math.round(r.finalRaw) !== r.finalRounded
  ).length;

  const sample = rows[0];

  return {
    profileKey,
    tier5RunsWithTrace: rows.length,
    uniqueFormalReviewFingerprintCount: uniq.size,
    allFormalReviewSequencesIdentical: uniq.size <= 1 && rows.length > 1,
    uniqueFinalConfidenceValues: uniqueLast,
    totalFormalReviewsAcrossTier5Runs: reviewsTotal,
    outcomeTallyAcrossReviewSteps: { good: goodCount, mediocre: mediocreCount, bad: badCount },
    clampHitLowAcrossSteps: clampLow,
    clampHitHighAcrossSteps: clampHigh,
    closingStretchStepsWithBracket44to52: closingIn44to52,
    closingStretchStepsWithBracketBelow44: closingBelow44,
    runsWhereFinalGmRoundDiffersFromRoundOfRaw: roundingMismatch,
    narrative: {
      roundingVsAssignmentEnd:
        roundingMismatch === 0
          ? 'Final GM confidence matches Math.round(final raw) — assignment-end classification is not introducing a separate floor.'
          : 'Some runs: gmConfidence round differs from round(final raw) — inspect assignment-end vs G._gm.confidence.',
      fingerprintRepeat:
        uniq.size <= 1 && rows.length > 1
          ? 'Every Tier 5 run produced the same formal-review delta sequence — deterministic convergence across seeds.'
          : 'Formal review sequences differ across seeds — not a single identical replay.',
      shelfAt44:
        uniqueLast.length === 1 && uniqueLast[0] === 44
          ? 'All traced Tier 5 runs end at final confidence 44 — point mass from engine, not campaign survivalThreshold.'
          : 'Final confidence varies across runs — not a single shelf at 44 in this sample.',
    },
    sampleSeed: sample ? sample.seed : null,
    sampleStepsSimplified: sample ? simplifySteps(sample.steps) : null,
  };
}

function round6(x) {
  if (typeof x !== 'number' || isNaN(x)) return x;
  return Math.round(x * 1e6) / 1e6;
}

/**
 * KPI/composite convergence: uses tier5KpiReviewTrace from headless (evaluateGmReview re-call + stored kpis).
 */
function analyzeTier5KpiConvergence(campaignRuns, profileKey) {
  const sequencesByRun = [];
  const allSteps = [];
  for (const run of campaignRuns) {
    const ar = run.assignmentResults || [];
    const t5 = ar.find((a) => !a.error && a.tierBefore === 5);
    if (!t5 || !Array.isArray(t5.tier5KpiReviewTrace) || !t5.tier5KpiReviewTrace.length) continue;
    sequencesByRun.push({ seed: run.seed, steps: t5.tier5KpiReviewTrace });
    for (const step of t5.tier5KpiReviewTrace) {
      allSteps.push({ seed: run.seed, ...step });
    }
  }

  const nRuns = sequencesByRun.length;
  const n = allSteps.length;
  if (!n || !nRuns) {
    return {
      profileKey,
      tier5RunsWithKpiTrace: 0,
      totalFormalReviewSteps: 0,
      uniqueKpiFingerprints: 0,
      uniqueCompositeSequences: 0,
      uniqueCategorySequences: 0,
      uniqueCompositeToCategoryMappings: 0,
      componentStats: { allFormalReviewStepsPooled: {}, byReviewIndexAcrossSeeds: {} },
      compositeReevalMismatchSteps: 0,
      firstPointOfConvergence: 'no_data',
      interpretation: 'No Tier 5 KPI trace — enable tier5ShelfDiag (Tier 5 diagnostic batch).',
      terminalLine: 'No Tier 5 KPI trace captured.',
    };
  }

  const fpStep = (s) =>
    JSON.stringify({
      sm: round6(s.stressMargin),
      sr: round6(s.stressRevenue),
      sf: round6(s.stressFranchise),
      se: round6(s.stressEfficiency),
      composite: round6(s.composite),
      disc: round6(s.discretionaryEval),
    });

  const kpiSeqKeys = sequencesByRun.map((sr) => JSON.stringify(sr.steps.map((s) => fpStep(s))));
  const uniqKpi = new Set(kpiSeqKeys);

  const compSeqKeys = sequencesByRun.map((sr) =>
    JSON.stringify(sr.steps.map((s) => round6(s.composite)))
  );
  const uniqComp = new Set(compSeqKeys);

  const catSeqKeys = sequencesByRun.map((sr) => JSON.stringify(sr.steps.map((s) => s.category)));
  const uniqCat = new Set(catSeqKeys);

  const mappingKeys = allSteps.map(
    (s) => `${round6(s.composite)}|${s.category}|${round6(s.goodCut)}|${round6(s.badCut)}`
  );
  const uniqMapping = new Set(mappingKeys);

  const components = [
    'stressMargin',
    'stressRevenue',
    'stressFranchise',
    'stressEfficiency',
    'composite',
    'core',
    'discretionaryEval',
  ];
  /** Pooled across every formal-review step (all slots mixed — wide spread is expected). */
  const componentStatsAllStepsPooled = {};
  for (const c of components) {
    const vals = allSteps.map((s) => s[c]).filter((x) => typeof x === 'number' && !isNaN(x));
    if (vals.length) {
      const mn = Math.min(...vals);
      const mx = Math.max(...vals);
      componentStatsAllStepsPooled[c] = {
        min: mn,
        max: mx,
        mean: vals.reduce((a, b) => a + b, 0) / vals.length,
        count: vals.length,
        spread: mx - mn,
        literallyIdenticalAcrossAllSteps: mn === mx,
      };
    }
  }

  /** Same formal-review slot across seeds only (answers: do entrants hit identical KPIs at review 1, 2, …?). */
  const byReviewIndex = {};
  for (const sr of sequencesByRun) {
    for (const step of sr.steps) {
      const idx = step.reviewIndex | 0;
      if (!byReviewIndex[idx]) byReviewIndex[idx] = [];
      byReviewIndex[idx].push(step);
    }
  }
  const perReviewIndexAcrossSeeds = {};
  for (const idx of Object.keys(byReviewIndex).sort((a, b) => Number(a) - Number(b))) {
    const steps = byReviewIndex[idx];
    const entry = { n: steps.length };
    for (const c of components) {
      const vals = steps.map((s) => s[c]).filter((x) => typeof x === 'number' && !isNaN(x));
      if (!vals.length) continue;
      const mn = Math.min(...vals);
      const mx = Math.max(...vals);
      const uniq = [...new Set(vals.map((v) => round6(v)))];
      entry[c] = {
        min: mn,
        max: mx,
        mean: vals.reduce((a, b) => a + b, 0) / vals.length,
        spreadAcrossSeeds: mx - mn,
        uniqueRoundedValues: uniq.length,
        literallyIdenticalAcrossSeeds: mn === mx,
      };
    }
    const cats = steps.map((s) => s.category);
    const uniqCat = [...new Set(cats)];
    entry.category = {
      unique: uniqCat,
      allSameAcrossSeeds: uniqCat.length === 1,
    };
    entry.note =
      'Per review #, one row per seed; spreadAcrossSeeds 0 ⇒ identical composite/stress at that slot across runs.';
    perReviewIndexAcrossSeeds[idx] = entry;
  }

  const reevalMismatch = allSteps.filter(
    (s) =>
      s.compositeReevalMinusStored != null &&
      Math.abs(s.compositeReevalMinusStored) > 1e-8
  ).length;

  const kpiIdenticalAcrossSeeds = nRuns > 1 && uniqKpi.size === 1;
  const catIdenticalAcrossSeeds = nRuns > 1 && uniqCat.size === 1;
  const compIdenticalAcrossSeeds = nRuns > 1 && uniqComp.size === 1;
  const kpiVaries = uniqKpi.size > 1;

  const maxCompositeSpreadAcrossSeeds = Math.max(
    0,
    ...Object.keys(perReviewIndexAcrossSeeds).map((idx) => {
      const c = perReviewIndexAcrossSeeds[idx].composite;
      return c && typeof c.spreadAcrossSeeds === 'number' ? c.spreadAcrossSeeds : 0;
    })
  );
  const allReviewSlotsCompositeIdenticalAcrossSeeds = Object.keys(perReviewIndexAcrossSeeds).every(
    (idx) => perReviewIndexAcrossSeeds[idx].composite && perReviewIndexAcrossSeeds[idx].composite.literallyIdenticalAcrossSeeds
  );

  let firstPointOfConvergence = 'mixed';
  let interpretation = '';
  let terminalLine = '';

  if (kpiIdenticalAcrossSeeds || allReviewSlotsCompositeIdenticalAcrossSeeds) {
    firstPointOfConvergence = 'kpi_and_composite_inputs';
    interpretation =
      'At each formal review index, stress/composite inputs from evaluateGmReview match across seeds (same KPI snapshots at review time). Classification then follows the same good/mediocre/bad bands — convergence starts at KPI/composite inputs, not at applyGmConfidenceUpdate.';
    terminalLine =
      'Tier 5 KPI inputs are identical across seeds at each formal review (per-slot composite spread 0).';
  } else if (catIdenticalAcrossSeeds && kpiVaries && maxCompositeSpreadAcrossSeeds < 1e-6) {
    firstPointOfConvergence = 'floating_or_fingerprint_noise';
    interpretation =
      'Full-sequence KPI fingerprints differ in string form but per-review-slot composite spread is negligible — likely floating-point or serialization noise; categories still identical.';
    terminalLine =
      'KPI fingerprints differ only numerically at epsilon; categories identical — not meaningful input divergence.';
  } else if (catIdenticalAcrossSeeds && kpiVaries) {
    firstPointOfConvergence = 'classification_or_rounding';
    interpretation =
      'Per-slot KPI variance exists but category sequences match — evaluateGmReview good/bad cuts may map nearby composites to the same ladder; see perReviewIndexAcrossSeeds.';
    terminalLine =
      'KPI inputs vary slightly at some review slots; review categories still collapse to one sequence.';
  } else if (compIdenticalAcrossSeeds && kpiVaries) {
    firstPointOfConvergence = 'composite_only';
    interpretation =
      'Composite sequence matches across seeds but full KPI fingerprints differ — subcomponents may offset while composite matches.';
    terminalLine = 'Composite matches across seeds; full stress tuple may still differ.';
  } else if (catIdenticalAcrossSeeds && !kpiVaries) {
    firstPointOfConvergence = 'kpi_inputs';
    interpretation =
      'Same KPIs and same categories each step — applyGmConfidenceUpdate follows one deterministic ladder.';
    terminalLine = 'KPI inputs and categories match — confidence update is the replay of one ladder.';
  } else {
    firstPointOfConvergence = 'divergent_or_sparse';
    interpretation =
      'KPI and/or category sequences differ materially across seeds — no single convergence fingerprint in this sample.';
    terminalLine = 'Tier 5 KPI or category sequences differ across seeds.';
  }

  return {
    profileKey,
    tier5RunsWithKpiTrace: nRuns,
    totalFormalReviewSteps: n,
    uniqueKpiFingerprints: uniqKpi.size,
    uniqueCompositeSequences: uniqComp.size,
    uniqueCategorySequences: uniqCat.size,
    uniqueCompositeToCategoryMappings: uniqMapping.size,
    allKpiSequencesIdenticalAcrossSeeds: kpiIdenticalAcrossSeeds,
    allCategorySequencesIdenticalAcrossSeeds: catIdenticalAcrossSeeds,
    allCompositeSequencesIdenticalAcrossSeeds: compIdenticalAcrossSeeds,
    componentStats: {
      allFormalReviewStepsPooled: componentStatsAllStepsPooled,
      byReviewIndexAcrossSeeds: perReviewIndexAcrossSeeds,
    },
    maxCompositeSpreadAcrossSeeds,
    allReviewSlotsCompositeIdenticalAcrossSeeds,
    compositeReevalMismatchSteps: reevalMismatch,
    firstPointOfConvergence,
    interpretation,
    terminalLine,
    sequencesByRunSample: sequencesByRun[0] || null,
  };
}

function buildTier5InterpretationPair(ext, longAnalysis) {
  const bullets = [];
  let code = 'MIXED';
  let summary = '';

  if (!ext || ext.runsReachingTier5 === 0) {
    return {
      code: 'NO_T5_IN_EXTENDED',
      summary:
        `No runs reached Tier 5 in the extended (${CAMPAIGN_PROFILE_MAX.extended}) profile for this sample — widen seeds or check reach conditions.`,
      bullets: [],
    };
  }

  const th = ext.ladderTier5 && ext.ladderTier5.successThreshold;
  const avgEnd = ext.avgEndingConfidenceTier5;
  const oneE = ext.slotsRemainingDistribution.exactlyOneAssignmentLeft;
  const twoE = ext.slotsRemainingDistribution.twoOrMoreAssignmentsLeft;

  if (oneE > twoE) {
    bullets.push(
      'More Tier 5 entrants had only one assignment slot left under the cap than had two or more — late entry often leaves no room for a full flagship contract in the validator.'
    );
    code = 'CAP_LATE';
  }

  if (avgEnd != null && th != null && avgEnd < th - 3) {
    bullets.push(
      'Mean ending confidence on Tier 5 assignments is meaningfully below the promotion (win) threshold — the bar may still be the binding constraint.'
    );
    if (code === 'CAP_LATE') code = 'BOTH_CAP_AND_T5';
    else code = 'T5_STRICT';
  }

  if (avgEnd != null && th != null && avgEnd >= th - 2 && ext.winCount === 0) {
    bullets.push(
      'Average Tier 5 ending confidence is near the promotion bar but wins are still zero — variance, contract length inside Tier 5, or too few Tier 5 completions in sample.'
    );
  }

  const avgDem = ext.entrantAverages.avgPriorDemotions;
  const avgFire = ext.entrantAverages.avgPriorFirings;
  if ((avgDem != null && avgDem > 0.35) || (avgFire != null && avgFire > 0.15)) {
    bullets.push(
      'Entrants show non-trivial prior demotions or firings — momentum lost before Tier 5 may matter as much as the Tier 5 bar.'
    );
    if (code === 'MIXED') code = 'T4_DAMAGE';
  }

  if (longAnalysis && longAnalysis.runsReachingTier5 > 0) {
    if (longAnalysis.winCount > ext.winCount) {
      bullets.push(
        `Long profile (${CAMPAIGN_PROFILE_MAX.long}) produced more campaign wins than extended (${CAMPAIGN_PROFILE_MAX.extended}) — a longer window can be necessary for wins to appear in batch.`
      );
      code = 'CAP_WINDOW_WIN';
      summary =
        'Wins scale with assignment cap in this comparison; Tier 5 may be win-capable but hidden by short careers.';
    } else if (longAnalysis.winCount === 0 && ext.winCount === 0) {
      bullets.push(
        'Wins remain zero in both extended and long profiles among runs that reach Tier 5 — threshold strictness and/or Tier 4 carryover remain suspects.'
      );
      if (code === 'MIXED' || code === 'CAP_LATE' || code === 'BOTH_CAP_AND_T5') code = 'T5_OR_CARRYOVER';
      summary =
        'Reaching Tier 5 is not enough in this sample; players still fail to convert — investigate Tier 5 bar and earlier-tier damage.';
    }
  }

  if (!summary) {
    if (code === 'CAP_LATE')
      summary =
        'Late Tier 5 entry under the assignment cap is a major theme; consider longer careers before lowering thresholds.';
    else if (code === 'T5_STRICT')
      summary =
        'Ending confidence on Tier 5 runs cool relative to the promotion bar — the next tuning pass may focus on Tier 5 thresholds.';
    else if (code === 'T4_DAMAGE' || code === 'T5_OR_CARRYOVER')
      summary =
        'Both carryover weakness from earlier tiers and Tier 5 strictness appear plausible from this batch.';
    else summary = bullets.length ? bullets.join(' ') : 'See tier5EntrantAnalysis tables.';
  }

  return { code, summary, bullets };
}

function runCampaignRevisitTest(ctx, seed) {
  return vm.runInContext(
    `
    (function(){
      var rng = (${mulberry32.toString()})(${seed >>> 0});
      Math.random = function(){ return rng(); };
      if (typeof wlCampaignDeactivate === 'function') wlCampaignDeactivate();
      ACTIVE_MARKET = 'atlanta';
      _selectedMarket = 'atlanta';
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket('atlanta');
      wlCampaign.beginCareerWithIdentity('Headless GM', 'Revisit Test Broadcasting');
      if (globalThis.G) G = globalThis.G;
      var warnings = [];
      var fpNash = null;
      var fpExpectedAtReturn = null;
      var turns = 0;
      var maxP = 600;
      var ends = 0;
      while (turns < maxP && G && G.campaignAssignment) {
        advTurn();
        turns++;
        var endPayload = typeof wlCampaignGetLastAssignmentEndPayload === 'function'
          ? wlCampaignGetLastAssignmentEndPayload()
          : null;
        if (endPayload) {
          ends++;
          if (ends === 1) {
            fpNash = wlCampaign.getMarketArchiveFingerprint('nashville');
            if (fpNash == null || fpNash === '') warnings.push('missing_archive_after_first_assignment');
            if (typeof wlCampaignStartNextAssignment === 'function') wlCampaignStartNextAssignment();
            if (globalThis.G) G = globalThis.G;
          } else if (ends === 2) {
            fpExpectedAtReturn = wlCampaign.getMarketArchiveFingerprint('nashville');
            if (fpExpectedAtReturn == null || fpExpectedAtReturn === '')
              warnings.push('missing_nashville_archive_before_forced_return');
            var ok = wlCampaign.headlessReplaceAwaitingLaunchWithMarket('nashville');
            if (!ok) warnings.push('could_not_replace_awaiting_launch');
            if (typeof wlCampaignStartNextAssignment === 'function') wlCampaignStartNextAssignment();
            if (globalThis.G) G = globalThis.G;
            break;
          }
        }
      }
      var restored = !!(G && G._campaignRestoredFromArchive);
      var fpLive = '';
      if (G && G.stations) {
        fpLive = G.stations.map(function(s){ return s && (s.callLetters || s.call); }).filter(Boolean).sort().join('|');
      }
      var match = !!(fpExpectedAtReturn && fpLive && fpExpectedAtReturn === fpLive);
      if (!restored) warnings.push('restore_flag_false_expected_archive_restore');
      if (fpExpectedAtReturn && fpLive && !match) warnings.push('station_fingerprint_mismatch_after_restore');
      var st = wlCampaign.ensureState();
      var archStations =
        st.marketArchives &&
        st.marketArchives.nashville &&
        st.marketArchives.nashville.g &&
        st.marketArchives.nashville.g.stations
          ? st.marketArchives.nashville.g.stations.length
          : -1;
      var liveStationCount = G.stations ? G.stations.length : -1;
      var nashVisits = 0;
      if (st.history) {
        for (var hi = 0; hi < st.history.length; hi++) {
          if (st.history[hi].marketId === 'nashville') nashVisits++;
        }
      }
      if (nashVisits >= 2 && !restored) warnings.push('duplicate_market_visit_without_restore');
      if (ends < 2) warnings.push('incomplete_two_assignment_ends');
      var persist = wlCampaign.getCampaignPersistenceDiagnostics ? wlCampaign.getCampaignPersistenceDiagnostics() : null;
      return {
        seed: ${seed >>> 0},
        turns: turns,
        assignmentEndsSeen: ends,
        fpArchiveAfterFirstAssignment: fpNash,
        fpArchiveImmediatelyBeforeReturn: fpExpectedAtReturn,
        fpLiveStations: fpLive,
        fpLenArchive: fpNash ? fpNash.length : 0,
        fpLenLive: fpLive ? fpLive.length : 0,
        fingerprintMatch: match,
        restoredFromArchive: restored,
        warnings: warnings,
        persistence: persist,
        archivedNashvilleStationCount: archStations,
        liveStationCount: liveStationCount
      };
    })()
    `,
    ctx
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const quiet = args.quiet;
  const report = {
    meta: {
      mode: args.mode,
      seed: args.seed,
      runs: args.runs,
      market: args.market,
      note:
        'GM mode uses genMarket(gm_under) with ACTIVE_MARKET patched to --market. Campaign career start uses ladder tier-1 market from campaignMode.js (typically Nashville), overriding the patched constant when beginCareer runs.',
      maxPeriodsGm: args.maxPeriodsGm,
      maxPeriodsCampaign: args.maxPeriodsCampaign,
      maxAssignments: args.maxAssignments,
      revisitTest: args.revisitTest,
      compareProfiles: !!args.compareProfiles,
      compareIncludeLong: !!args.compareIncludeLong,
      campaignProfiles: args.compareProfiles
        ? [
            { key: 'default', maxAssignments: CAMPAIGN_PROFILE_MAX.default },
            { key: 'extended', maxAssignments: CAMPAIGN_PROFILE_MAX.extended },
            ...(args.compareIncludeLong ? [{ key: 'long', maxAssignments: CAMPAIGN_PROFILE_MAX.long }] : []),
          ]
        : null,
    },
    gm: null,
    campaign: null,
    batch: null,
    profiles: null,
    profileComparison: null,
    interpretation: null,
    tier5EntrantAnalysis: null,
    tier3Diagnostic: null,
  };

  if (args.mode === 'gm') {
    const ctx = createHeadlessContext(true);
    loadEngine(ctx, args.market);
    const gmRes = runGmOnce(ctx, {
      seed: args.seed,
      marketId: args.market,
      maxPeriods: args.maxPeriodsGm,
    });
    const analysis = analyzeGmTimeline(gmRes.timeline, gmRes.initialConf);
    report.gm = {
      seed: args.seed,
      market: args.market,
      initialConfidence: gmRes.initialConf,
      timeline: gmRes.timeline,
      analysis,
    };
    if (!quiet) {
      console.log('=== GM headless (' + args.market + ', seed ' + args.seed + ') ===');
      console.log('Formal reviews logged:', analysis.reviewEvents);
      console.log('Confidence changed:', analysis.confChanged);
      console.log('Warnings:', analysis.warnings.length ? analysis.warnings : '(none)');
    }
  } else if (args.mode === 'campaign') {
    const ctx = createHeadlessContext(true);
    loadEngine(ctx, args.market);
    const campRes = runCampaignOnce(ctx, {
      seed: args.seed,
      marketId: args.market,
      maxPeriods: args.maxPeriodsCampaign,
      maxAssignments: args.maxAssignments,
    });
    const cw = analyzeCampaign(campRes);
    report.campaign = {
      seed: args.seed,
      market: args.market,
      result: campRes,
      warnings: cw,
      campaignDeep: aggregateCampaignBatchDeep([{ seed: args.seed, ...campRes }]),
    };
    if (!quiet) {
      console.log('=== Campaign headless (legacy market patch: ' + args.market + ', seed ' + args.seed + ') ===');
      console.log('Turns:', campRes.turns, 'assignments:', (campRes.assignmentResults || []).length);
      console.log('Rep', campRes.reputationStart, '→', campRes.reputationEnd, 'campaignWon:', campRes.campaignWon);
      console.log('Warnings:', cw.length ? cw : '(none)');
    }
  } else if (args.mode === 'batch' && args.tier3Diagnostic) {
    const agg = {
      tier3Diagnostic: true,
      gmReviewCounts: [],
      gmFired: 0,
      gmConfidenceDeltas: [],
      batchWarnings: [],
    };
    const tier3Runs = [];
    for (let i = 0; i < args.runs; i++) {
      const seed = (args.seed + i) >>> 0;
      const ctxG = createHeadlessContext(true);
      loadEngine(ctxG, args.market);
      const gmr = runGmOnce(ctxG, { seed, marketId: args.market, maxPeriods: args.maxPeriodsGm });
      const an = analyzeGmTimeline(gmr.timeline, gmr.initialConf);
      agg.gmReviewCounts.push(an.reviewEvents);
      const lastSnap = gmr.timeline.length && gmr.timeline[gmr.timeline.length - 1].snap;
      if (lastSnap && lastSnap.fired) agg.gmFired++;
      const first = gmr.initialConf;
      const lastC = lastSnap ? lastSnap.confidence : null;
      if (first != null && lastC != null) agg.gmConfidenceDeltas.push(lastC - first);

      const ctxC = createHeadlessContext(true);
      loadEngine(ctxC, args.market);
      const cr = runCampaignTier3DiagnosticOnce(ctxC, {
        seed,
        marketId: args.market,
        maxPeriods: args.maxPeriodsCampaign,
        maxAssignments: args.maxAssignments,
      });
      tier3Runs.push({ seed, ...cr });
      agg.batchWarnings.push(...analyzeCampaign(cr).map((w) => `seed ${seed}: ${w}`));
    }
    const tier3LadderRow = tier3Runs.find((r) => r.tier3LadderRow)?.tier3LadderRow || null;
    const aggregated = aggregateTier3Diagnostic(tier3Runs, tier3LadderRow);
    if (aggregated.tier3AssignmentCount === 0) {
      agg.batchWarnings.push(
        'No Tier 3 assignment completed — ensure --max-assignments>=3 (default 8) so the ladder reaches Seattle (Tier 3).'
      );
    }
    report.tier3Diagnostic = {
      aggregated,
      runs: tier3Runs.map((r) => ({
        seed: r.seed,
        turns: r.turns,
        campaignWon: r.campaignWon,
        reputationEnd: r.reputationEnd,
        tier3LadderRow: r.tier3LadderRow,
        tier3Assignments: r.tier3Assignments,
        assignmentResultCount: (r.assignmentResults || []).length,
      })),
    };
    report.meta.tier3Diagnostic = true;
    report.batch = agg;

    if (!quiet) {
      console.log('\n=== TIER 3 (SEATTLE) DIAGNOSTIC (' + args.runs + ' seeds from ' + args.seed + ') ===');
      console.log(
        'Tier 3 completions:',
        aggregated.tier3AssignmentCount,
        'rows across',
        aggregated.runsWithTier3Completion,
        'runs /',
        aggregated.totalRuns,
        'total seeds'
      );
      const sc = aggregated.startingConditions;
      if (sc.meanCash != null) {
        console.log(
          'Starting cash (after cashMult + corporateCashGrant): mean',
          Math.round(sc.meanCash),
          'median',
          Math.round(sc.medianCash),
          'min',
          sc.minCash,
          'max',
          sc.maxCash
        );
        console.log('% starts under danger heuristic:', (sc.pctStartsUnderDangerHeuristic * 100).toFixed(1) + '%');
      }
      const gp = aggregated.gracePeriod;
      console.log(
        'Grace reviews (pooled, first N per assignment):',
        gp.graceReviewCount,
        '| outcome shares good / med / bad:',
        (gp.outcomeShares.good * 100).toFixed(0) +
          ' / ' +
          (gp.outcomeShares.mediocre * 100).toFixed(0) +
          ' / ' +
          (gp.outcomeShares.bad * 100).toFixed(0) +
          '%'
      );
      console.log(
        'Avg Δ confidence (grace):',
        gp.avgConfidenceDeltaDuringGrace != null ? gp.avgConfidenceDeltaDuringGrace.toFixed(2) : 'n/a'
      );
      console.log(
        '% grace with turnaround patience (efficiency suppressed):',
        gp.pctEfficiencySuppressedInGrace != null ? (gp.pctEfficiencySuppressedInGrace * 100).toFixed(1) + '%' : 'n/a'
      );
      const oc = aggregated.outcomes;
      console.log(
        'Tier 3 outcomes — promoted:',
        oc.promoted,
        'lateral:',
        oc.lateral,
        'demoted:',
        oc.demoted,
        'fired:',
        oc.fired
      );
      console.log(
        'Rates — promotion:',
        (oc.promotionRate * 100).toFixed(1) + '%',
        'demotion:',
        (oc.demotionRate * 100).toFixed(1) + '%',
        'firing:',
        (oc.firingRate * 100).toFixed(1) + '%'
      );
      console.log('Avg ending confidence (Tier 3):', oc.avgEndingConfidence != null ? oc.avgEndingConfidence.toFixed(1) : 'n/a');
      console.log(
        'Dipped below 50 / 40 during Tier 3 (review snapshots):',
        (oc.pctDippedBelow50 * 100).toFixed(1) + '%',
        '/',
        (oc.pctDippedBelow40 * 100).toFixed(1) + '%'
      );
      console.log('\n--- tier3Assessment ---');
      console.log('Code:', aggregated.tier3Assessment.code);
      console.log(aggregated.tier3Assessment.summary);
      for (const s of aggregated.tier3Assessment.signals) console.log(' •', s);
      if (agg.batchWarnings.length) console.log('Warnings:\n', agg.batchWarnings.join('\n'));
    }
  } else if (args.mode === 'batch' && args.tier5Diagnostic) {
    const extMax = CAMPAIGN_PROFILE_MAX.extended;
    const longMax = CAMPAIGN_PROFILE_MAX.long;
    const byExt = [];
    const byLong = [];
    const agg = {
      tier5Diagnostic: true,
      gmReviewCounts: [],
      gmFired: 0,
      gmConfidenceDeltas: [],
      batchWarnings: [],
    };

    for (let i = 0; i < args.runs; i++) {
      const seed = (args.seed + i) >>> 0;
      const ctxG = createHeadlessContext(true);
      loadEngine(ctxG, args.market);
      const gmr = runGmOnce(ctxG, { seed, marketId: args.market, maxPeriods: args.maxPeriodsGm });
      const an = analyzeGmTimeline(gmr.timeline, gmr.initialConf);
      agg.gmReviewCounts.push(an.reviewEvents);
      const lastSnap = gmr.timeline.length && gmr.timeline[gmr.timeline.length - 1].snap;
      if (lastSnap && lastSnap.fired) agg.gmFired++;
      const first = gmr.initialConf;
      const lastC = lastSnap ? lastSnap.confidence : null;
      if (first != null && lastC != null) agg.gmConfidenceDeltas.push(lastC - first);

      const ctxE = createHeadlessContext(true);
      loadEngine(ctxE, args.market);
      const crE = runCampaignOnce(ctxE, {
        seed,
        marketId: args.market,
        maxPeriods: args.maxPeriodsCampaign,
        maxAssignments: extMax,
        tier5ShelfDiag: true,
      });
      byExt.push({ seed, ...crE });
      agg.batchWarnings.push(
        ...analyzeCampaign(crE).map((w) => `seed ${seed} profile extended: ${w}`)
      );

      const ctxL = createHeadlessContext(true);
      loadEngine(ctxL, args.market);
      const crL = runCampaignOnce(ctxL, {
        seed,
        marketId: args.market,
        maxPeriods: args.maxPeriodsCampaign,
        maxAssignments: longMax,
        tier5ShelfDiag: true,
      });
      byLong.push({ seed, ...crL });
      agg.batchWarnings.push(
        ...analyzeCampaign(crL).map((w) => `seed ${seed} profile long: ${w}`)
      );
    }

    const extAnalysis = analyzeTier5Entrants(byExt, extMax, 'extended');
    const longAnalysis = analyzeTier5Entrants(byLong, longMax, 'long');
    const interpretation = buildTier5InterpretationPair(extAnalysis, longAnalysis);
    const shelfExt = analyzeTier5ShelfConvergence(byExt, 'extended');
    const shelfLong = analyzeTier5ShelfConvergence(byLong, 'long');
    const kpiExt = analyzeTier5KpiConvergence(byExt, 'extended');
    const kpiLong = analyzeTier5KpiConvergence(byLong, 'long');

    report.tier5EntrantAnalysis = {
      extended: extAnalysis,
      long: longAnalysis,
      extendedVsLong: {
        winCountDelta: longAnalysis.winCount - extAnalysis.winCount,
        tier5ReachRateDelta: longAnalysis.tier5ReachRate - extAnalysis.tier5ReachRate,
        runsReachingTier5Delta: longAnalysis.runsReachingTier5 - extAnalysis.runsReachingTier5,
        campaignWinDelta: longAnalysis.runsReachingT5WhoWonCampaign - extAnalysis.runsReachingT5WhoWonCampaign,
      },
      interpretation,
      shelfConvergence: { extended: shelfExt, long: shelfLong },
      kpiConvergence: { extended: kpiExt, long: kpiLong },
    };
    report.meta.tier5Diagnostic = true;
    report.batch = agg;

    if (!quiet) {
      console.log('\n=== TIER 5 ENTRANT DIAGNOSTIC (' + args.runs + ' seeds from ' + args.seed + ') ===');
      console.log('Profiles: extended (max ' + extMax + '), long (max ' + longMax + ')');
      console.log('GM avg confidence delta:', agg.gmConfidenceDeltas.length
        ? (agg.gmConfidenceDeltas.reduce((a, b) => a + b, 0) / agg.gmConfidenceDeltas.length).toFixed(2)
        : 'n/a');
      const printProf = (label, a) => {
        console.log('\n--- ' + label + ' ---');
        console.log('Runs reaching Tier 5:', a.runsReachingTier5, '/', a.totalRuns, '(' + (a.tier5ReachRate * 100).toFixed(1) + '%)');
        console.log('Avg confidence end of assignment before T5:', a.entrantAverages.avgConfidenceEndOfPriorAssignment);
        console.log('Avg reputation at T5 entry:', a.entrantAverages.avgReputationAtT5Entry);
        console.log('Avg slots remaining at first T5:', a.entrantAverages.avgSlotsRemainingAtT5Entry);
        console.log('Slots @ T5: 1 left:', a.slotsRemainingDistribution.exactlyOneAssignmentLeft, '  2+ left:', a.slotsRemainingDistribution.twoOrMoreAssignmentsLeft);
        console.log('Prior outcomes (sum over entrants):', a.priorOutcomeTotalsAcrossEntrants);
        console.log('Path labels:', a.pathLabelCounts);
        console.log('Tier 5 outcome distribution:', a.tier5OutcomeDistribution);
        console.log('Campaign wins (assignment-level):', a.winCount, ' win rate among T5 rows:', (a.winRateAmongTier5Assignments * 100).toFixed(1) + '%');
        console.log('Runs reaching T5 who won campaign:', a.runsReachingT5WhoWonCampaign, '/', a.runsReachingTier5);
        console.log('Avg ending confidence (Tier 5 rows):', a.avgEndingConfidenceTier5);
        console.log('Avg Δ confidence vs Tier 5 start:', a.avgConfidenceDeltaDuringTier5);
        console.log('Avg rep Δ during Tier 5:', a.avgReputationDeltaDuringTier5);
        console.log('Ladder T5 successThreshold:', a.ladderTier5 && a.ladderTier5.successThreshold);
      };
      printProf('EXTENDED (' + extMax + ')', extAnalysis);
      printProf('LONG (' + longMax + ')', longAnalysis);
      const printShelf = (label, s) => {
        console.log('\n--- Tier 5 confidence shelf trace (' + label + ') ---');
        console.log('Runs with trace:', s.tier5RunsWithTrace);
        console.log('Unique formal-review fingerprints:', s.uniqueFormalReviewFingerprintCount, ' all identical?', s.allFormalReviewSequencesIdentical);
        console.log('Unique final confidence values:', JSON.stringify(s.uniqueFinalConfidenceValues));
        console.log('Review-step outcomes (good/med/bad):', s.outcomeTallyAcrossReviewSteps);
        console.log('Clamp low / high (steps):', s.clampHitLowAcrossSteps, '/', s.clampHitHighAcrossSteps);
        console.log('Closing-stretch bracket counts — below44 / 44to52:', s.closingStretchStepsWithBracketBelow44, '/', s.closingStretchStepsWithBracket44to52);
        console.log('Narrative:', s.narrative);
        if (s.sampleStepsSimplified && s.sampleStepsSimplified.length) {
          console.log('Sample (seed ' + s.sampleSeed + ') simplified steps:', JSON.stringify(s.sampleStepsSimplified));
        }
      };
      printShelf('extended', shelfExt);
      printShelf('long', shelfLong);
      console.log('\n--- Tier 5 KPI / composite convergence ---');
      console.log('[extended]', kpiExt.terminalLine);
      console.log('  unique KPI seq fingerprints:', kpiExt.uniqueKpiFingerprints, ' unique category seq:', kpiExt.uniqueCategorySequences, ' first convergence:', kpiExt.firstPointOfConvergence);
      console.log('  max composite spread across seeds (per review slot):', kpiExt.maxCompositeSpreadAcrossSeeds);
      if (kpiExt.compositeReevalMismatchSteps)
        console.log('  WARNING: composite re-eval vs stored eval mismatches:', kpiExt.compositeReevalMismatchSteps);
      console.log('[long]', kpiLong.terminalLine);
      console.log('  unique KPI seq fingerprints:', kpiLong.uniqueKpiFingerprints, ' unique category seq:', kpiLong.uniqueCategorySequences, ' first convergence:', kpiLong.firstPointOfConvergence);
      console.log('  max composite spread across seeds (per review slot):', kpiLong.maxCompositeSpreadAcrossSeeds);
      if (kpiLong.compositeReevalMismatchSteps)
        console.log('  WARNING: composite re-eval vs stored eval mismatches:', kpiLong.compositeReevalMismatchSteps);
      console.log('\n--- Interpretation ---');
      console.log('Code:', interpretation.code);
      console.log(interpretation.summary);
      for (const b of interpretation.bullets) console.log(' •', b);
      if (agg.batchWarnings.length) console.log('Warnings:\n', agg.batchWarnings.join('\n'));
    }
  } else if (args.mode === 'batch' && args.compareProfiles) {
    const profileList = [
      { key: 'default', maxAssignments: CAMPAIGN_PROFILE_MAX.default },
      { key: 'extended', maxAssignments: CAMPAIGN_PROFILE_MAX.extended },
      ...(args.compareIncludeLong ? [{ key: 'long', maxAssignments: CAMPAIGN_PROFILE_MAX.long }] : []),
    ];
    const byKey = {};
    for (const p of profileList) byKey[p.key] = [];

    const agg = {
      compareProfiles: true,
      profileList,
      gmReviewCounts: [],
      gmFired: 0,
      gmConfidenceDeltas: [],
      batchWarnings: [],
      revisitTest: null,
    };

    for (let i = 0; i < args.runs; i++) {
      const seed = (args.seed + i) >>> 0;
      const ctxG = createHeadlessContext(true);
      loadEngine(ctxG, args.market);
      const gmr = runGmOnce(ctxG, { seed, marketId: args.market, maxPeriods: args.maxPeriodsGm });
      const an = analyzeGmTimeline(gmr.timeline, gmr.initialConf);
      agg.gmReviewCounts.push(an.reviewEvents);
      const lastSnap = gmr.timeline.length && gmr.timeline[gmr.timeline.length - 1].snap;
      if (lastSnap && lastSnap.fired) agg.gmFired++;
      const first = gmr.initialConf;
      const lastC = lastSnap ? lastSnap.confidence : null;
      if (first != null && lastC != null) agg.gmConfidenceDeltas.push(lastC - first);

      for (const p of profileList) {
        const ctxC = createHeadlessContext(true);
        loadEngine(ctxC, args.market);
        const cr = runCampaignOnce(ctxC, {
          seed,
          marketId: args.market,
          maxPeriods: args.maxPeriodsCampaign,
          maxAssignments: p.maxAssignments,
        });
        byKey[p.key].push({ seed, ...cr });
        const cw = analyzeCampaign(cr);
        if (cr.turns >= args.maxPeriodsCampaign - 2 && (cr.assignmentResults || []).length === 0) {
          agg.batchWarnings.push(
            `seed ${seed} profile ${p.key}: campaign produced no assignment end in ${cr.turns} turns`
          );
        }
        agg.batchWarnings.push(...cw.map((w) => `seed ${seed} profile ${p.key}: ${w}`));
      }
    }

    const profiles = {};
    for (const p of profileList) {
      profiles[p.key] = buildProfileSummary(byKey[p.key], p.maxAssignments, p.key);
    }
    const profileComparison = buildProfileComparisonObject(profiles);

    report.profiles = profiles;
    report.profileComparison = profileComparison;
    report.interpretation = profileComparison.interpretation;
    report.batch = agg;

    if (args.revisitTest) {
      const ctxR = createHeadlessContext(true);
      loadEngine(ctxR, args.market);
      const rev = runCampaignRevisitTest(ctxR, args.seed);
      agg.revisitTest = rev;
      if (rev.warnings && rev.warnings.length) {
        agg.batchWarnings.push(...rev.warnings.map((w) => `revisit: ${w}`));
      } else if (!rev.restoredFromArchive || !rev.fingerprintMatch) {
        agg.batchWarnings.push(
          `revisit: persistence check failed (restored=${rev.restoredFromArchive}, fingerprintMatch=${rev.fingerprintMatch})`
        );
      }
    }

    if (!quiet) {
      console.log('\n=== BATCH: PROFILE COMPARE (' + args.runs + ' seeds from ' + args.seed + ') ===');
      console.log('GM review counts:', agg.gmReviewCounts.join(', '));
      console.log('GM fired count:', agg.gmFired);
      console.log(
        'Avg confidence delta:',
        agg.gmConfidenceDeltas.length
          ? (agg.gmConfidenceDeltas.reduce((a, b) => a + b, 0) / agg.gmConfidenceDeltas.length).toFixed(2)
          : 'n/a'
      );
      for (const p of profileList) {
        const pr = profiles[p.key];
        console.log('\n--- Profile: ' + p.key + ' (max assignments = ' + p.maxAssignments + ') ---');
        console.log('Kind tallies:', pr.kindTallies);
        console.log('Wins:', pr.winCount, ' win rate:', (pr.winRate * 100).toFixed(1) + '%');
        console.log('Top-tier reach:', (pr.topTierReachRate * 100).toFixed(1) + '%');
        console.log('Longest career (assignments):', pr.longestCareerAssignments);
        console.log('Avg assignments completed:', pr.avgAssignmentsCompleted.toFixed(2));
        console.log('Avg ending reputation:', pr.avgEndingReputation.toFixed(1));
        console.log(
          'Avg ending GM confidence (last assignment):',
          pr.avgEndingGmConfidence != null ? pr.avgEndingGmConfidence.toFixed(1) : 'n/a'
        );
        if (pr.tier4) console.log('Tier 4:', pr.tier4);
        if (pr.tier5 && pr.tier5.n) console.log('Tier 5:', pr.tier5);
      }
      console.log('\n--- Profile comparison (extended vs default) ---');
      console.log('Wins Δ:', profileComparison.winsDeltaExtendedVsDefault);
      console.log('Top-tier reach Δ:', profileComparison.topTierReachDeltaExtendedVsDefault);
      console.log('Avg assignments completed Δ:', profileComparison.avgAssignmentsDeltaExtendedVsDefault);
      console.log('Tier 4 deltas (n, prom, lat, dem, fire):', profileComparison.tier4);
      if (profileComparison.winsDeltaLongVsExtended != null) {
        console.log('Long vs extended — wins Δ:', profileComparison.winsDeltaLongVsExtended);
        console.log('Long vs extended — top-tier reach Δ:', profileComparison.topTierReachDeltaLongVsExtended);
      }
      console.log('\n--- Interpretation ---');
      console.log('Code:', profileComparison.interpretation.code);
      console.log(profileComparison.interpretation.summary);
      for (const b of profileComparison.interpretation.bullets) {
        console.log(' •', b);
      }
      if (agg.revisitTest) {
        console.log('\n--- Revisit persistence test ---');
        console.log(
          'restored:',
          agg.revisitTest.restoredFromArchive,
          'fingerprintMatch:',
          agg.revisitTest.fingerprintMatch
        );
      }
      if (agg.batchWarnings.length) console.log('Batch warnings:\n', agg.batchWarnings.join('\n'));
    }
  } else if (args.mode === 'batch') {
    const agg = {
      gmReviewCounts: [],
      gmFired: 0,
      gmConfidenceDeltas: [],
      campaignKinds: { promoted: 0, lateral: 0, demoted: 0, fired: 0, won: 0 },
      hardEnds: 0,
      batchWarnings: [],
      campaignDeep: null,
      campaignRuns: [],
      revisitTest: null,
    };
    const campaignRuns = [];
    for (let i = 0; i < args.runs; i++) {
      const seed = (args.seed + i) >>> 0;
      const ctxG = createHeadlessContext(true);
      loadEngine(ctxG, args.market);
      const gmr = runGmOnce(ctxG, { seed, marketId: args.market, maxPeriods: args.maxPeriodsGm });
      const an = analyzeGmTimeline(gmr.timeline, gmr.initialConf);
      agg.gmReviewCounts.push(an.reviewEvents);
      const lastSnap = gmr.timeline.length && gmr.timeline[gmr.timeline.length - 1].snap;
      if (lastSnap && lastSnap.fired) agg.gmFired++;
      const first = gmr.initialConf;
      const lastC = lastSnap ? lastSnap.confidence : null;
      if (first != null && lastC != null) agg.gmConfidenceDeltas.push(lastC - first);

      const ctxC = createHeadlessContext(true);
      loadEngine(ctxC, args.market);
      const cr = runCampaignOnce(ctxC, {
        seed,
        marketId: args.market,
        maxPeriods: args.maxPeriodsCampaign,
        maxAssignments: args.maxAssignments,
      });
      campaignRuns.push({ seed, ...cr });
      for (const a of cr.assignmentResults || []) {
        if (a.campaignWin) agg.campaignKinds.won++;
        else if (a.kind && agg.campaignKinds[a.kind] != null) agg.campaignKinds[a.kind]++;
        if (a.careerEndedHard) agg.hardEnds++;
      }
      const cw = analyzeCampaign(cr);
      if (cr.turns >= args.maxPeriodsCampaign - 2 && (cr.assignmentResults || []).length === 0) {
        agg.batchWarnings.push(`seed ${seed}: campaign produced no assignment end in ${cr.turns} turns`);
      }
      agg.batchWarnings.push(...cw.map((w) => `seed ${seed}: ${w}`));
    }
    agg.campaignDeep = aggregateCampaignBatchDeep(campaignRuns);
    agg.campaignRuns = campaignRuns;

    if (args.revisitTest) {
      const ctxR = createHeadlessContext(true);
      loadEngine(ctxR, args.market);
      const rev = runCampaignRevisitTest(ctxR, args.seed);
      agg.revisitTest = rev;
      if (rev.warnings && rev.warnings.length) {
        agg.batchWarnings.push(...rev.warnings.map((w) => `revisit: ${w}`));
      } else if (!rev.restoredFromArchive || !rev.fingerprintMatch) {
        agg.batchWarnings.push(
          `revisit: persistence check failed (restored=${rev.restoredFromArchive}, fingerprintMatch=${rev.fingerprintMatch})`
        );
      }
    }

    report.batch = agg;
    if (!quiet) {
      console.log('\n=== BATCH (' + args.runs + ' seeds from ' + args.seed + ') ===');
      console.log('GM review counts:', agg.gmReviewCounts.join(', '));
      console.log('GM fired count:', agg.gmFired);
      console.log(
        'Avg confidence delta:',
        agg.gmConfidenceDeltas.length
          ? (agg.gmConfidenceDeltas.reduce((a, b) => a + b, 0) / agg.gmConfidenceDeltas.length).toFixed(2)
          : 'n/a'
      );
      console.log('Campaign kind tallies:', agg.campaignKinds);
      console.log('Hard ends:', agg.hardEnds);
      const d = agg.campaignDeep;
      if (d) {
        console.log('\n--- Campaign deep (by tier) ---');
        for (let t = 1; t <= 5; t++) {
          const row = d.byTier[t];
          if (!row || !row.n) continue;
          console.log(
            `  T${t}: n=${row.n} prom=${row.promoted} lat=${row.lateral} dem=${row.demoted} fire=${row.fired} win=${row.won} avgConf=${row.avgEndingConfidence != null ? row.avgEndingConfidence.toFixed(1) : 'n/a'} avgRepΔ=${row.avgRepDelta != null ? row.avgRepDelta.toFixed(2) : 'n/a'} avgPeriods=${row.avgPeriodsClosed != null ? row.avgPeriodsClosed.toFixed(1) : 'n/a'}`
          );
        }
        console.log('Tier revisit events (non-consecutive repeat):', d.tierRevisitEvents);
        console.log('ABAB oscillation events:', d.twoTierOscillationEvents);
        console.log('Longest career (assignments):', d.longestCareerAssignments);
        console.log('Top-tier reach rate:', (d.topTierReachRate * 100).toFixed(0) + '%');
        console.log('Trap-tier heuristic (runs):', d.trapTierHeuristic.length ? d.trapTierHeuristic.join(', ') : '(none)');
        console.log('By assignment id:', d.byAssignmentId);
      }
      if (agg.revisitTest) {
        console.log('\n--- Revisit persistence test ---');
        console.log(
          'restored:',
          agg.revisitTest.restoredFromArchive,
          'fingerprintMatch:',
          agg.revisitTest.fingerprintMatch,
          'archiveRestoreCount:',
          agg.revisitTest.persistence && agg.revisitTest.persistence.archiveRestoreCount
        );
        if (agg.revisitTest.warnings && agg.revisitTest.warnings.length) {
          console.log('Revisit warnings:', agg.revisitTest.warnings.join('; '));
        }
      }
      if (agg.batchWarnings.length) console.log('Batch warnings:\n', agg.batchWarnings.join('\n'));
    }
  }

  if (args.json) {
    const dir = path.dirname(args.json);
    try {
      mkdirSync(dir, { recursive: true });
    } catch (_e) {}
    writeFileSync(args.json, JSON.stringify(report, null, 2), 'utf8');
    if (!quiet) console.log('\nWrote JSON:', args.json);
  }

  if (args.strict) {
    const hasBad =
      (report.gm && report.gm.analysis && report.gm.analysis.warnings.length) ||
      (report.campaign && report.campaign.warnings.length) ||
      (report.batch && report.batch.batchWarnings.length);
    process.exitCode = hasBad ? 1 : 0;
  } else {
    process.exitCode = 0;
  }
}

main();
