/**
 * GM Mode — pure evaluation layer (read-only vs core sim math).
 *
 * Subscribes to existing exports only: company finHistory, station fin / talentFranchise on player stations.
 * Does not modify economy, ratings, franchise formulas, or talent-performance math.
 *
 * Career failure ("fired") is tracked only here — separate from cash/bankruptcy (checkPressure).
 * See legacy.js: wlGmCareerEnded gates the alert bar message.
 */
(function (global) {
  'use strict';

  /** @typedef {'cash_first'|'prestige'|'turnaround'|'heritage'|'strip_miner'} GmOwnerArchetype */

  /**
   * Owner archetypes: weights (profit / revenue / franchise) sum ~1; tune expectations.
   * All numeric thresholds are scenario-overridable via gmConfig on the scenario object.
   */
  var GM_OWNER_ARCHETYPES = {
    cash_first: {
      wProfit: 0.45,
      wRevenue: 0.3,
      wFranchise: 0.25,
      minMarginPct: 10,
      minFranchiseAvg: 0.42,
      revenueDeclineStress: 0.55,
    },
    prestige: {
      wProfit: 0.28,
      wRevenue: 0.27,
      wFranchise: 0.45,
      minMarginPct: 6,
      minFranchiseAvg: 0.52,
      revenueDeclineStress: 0.75,
    },
    turnaround: {
      wProfit: 0.38,
      wRevenue: 0.34,
      wFranchise: 0.28,
      minMarginPct: 5,
      minFranchiseAvg: 0.48,
      revenueDeclineStress: 0.7,
    },
    heritage: {
      wProfit: 0.33,
      wRevenue: 0.22,
      wFranchise: 0.45,
      minMarginPct: 7,
      minFranchiseAvg: 0.55,
      revenueDeclineStress: 0.8,
    },
    strip_miner: {
      wProfit: 0.52,
      wRevenue: 0.38,
      wFranchise: 0.1,
      minMarginPct: 14,
      minFranchiseAvg: 0.35,
      revenueDeclineStress: 0.35,
    },
  };

  /** Display-only owner labels (presentation). */
  var OWNER_TYPE_LABEL = {
    cash_first: 'Cash-First',
    prestige: 'Prestige',
    turnaround: 'Turnaround',
    heritage: 'Heritage',
    strip_miner: 'Cost-First',
  };

  var DEFAULT_GM = {
    reviewIntervalPeriods: 4,
    trailingPeriods: 4,
    startConfidence: 78,
    /** Tuned so confidence is not a one-way climb toward 100. */
    goodReviewBonus: 8,
    badReviewPenalty: 16,
    repeatBadExtra: 9,
    marginSoftBand: 4,
    /** Weight of spend-discipline stress in the composite (remainder stays on margin / revenue / franchise). */
    efficiencyWeight: 0.2,
    /** How much efficiency stress amplifies the core stress term: composite uses core * (1 + this * se). */
    efficiencyCoreAmplify: 0.2,
  };

  var GM_ONBOARD_HTML =
    '<p style="margin-top:0">You are the General Manager. The license owner evaluates your results on a fixed schedule — separate from day-to-day cash stress or bankruptcy risk.</p>' +
    '<p style="margin:12px 0 0"><strong>Tip:</strong> Open <strong>Corporate expectations</strong> anytime for the full performance brief.</p>';

  /** Long-form explainer — corporate memo tone (modal: m-gm-explain). */
  var GM_EXPLAIN_MEMO_HTML =
    '<p style="margin-top:0;font-style:italic;color:var(--mut);font-size:14px">Internal — General Manager performance standards</p>' +
    '<h4 style="font-family:var(--fd);font-size:13px;letter-spacing:2px;color:var(--amb);margin:16px 0 8px">What this mode is</h4>' +
    '<p>GM oversight is a <strong>read-only evaluation</strong> on top of the simulation. It does not change ratings, formats, or economy math — it only measures how your company is doing against ownership’s expectations.</p>' +
    '<h4 style="font-family:var(--fd);font-size:13px;letter-spacing:2px;color:var(--amb);margin:16px 0 8px">What ownership evaluates</h4>' +
    '<p>Each formal review looks at recent company results, weighted by your owner’s style:</p>' +
    '<ul style="margin:8px 0;padding-left:20px;line-height:1.6">' +
    '<li><strong>Profitability</strong> — margins and sustainable earnings</li>' +
    '<li><strong>Revenue trajectory</strong> — whether billing is growing, flat, or sliding</li>' +
    '<li><strong>Long-term station strength</strong> — talent, brand, and competitiveness (not one lucky book)</li>' +
    '<li><strong>Spend discipline</strong> — whether marketing and programming investment is producing enough business result (especially in larger markets)</li>' +
    '</ul>' +
    '<h4 style="font-family:var(--fd);font-size:13px;letter-spacing:2px;color:var(--amb);margin:16px 0 8px">Review timing</h4>' +
    '<p>Formal <strong>corporate performance reviews</strong> occur on a fixed schedule (every several periods — roughly every few years in game time). The status panel shows when the next review falls due. This is <strong>not</strong> a contract extension or license renewal; it is a job-performance checkpoint.</p>' +
    '<h4 style="font-family:var(--fd);font-size:13px;letter-spacing:2px;color:var(--amb);margin:16px 0 8px">Status labels</h4>' +
    '<ul style="margin:8px 0;padding-left:20px;line-height:1.6">' +
    '<li><strong>Secure</strong> — ownership is comfortable with your leadership</li>' +
    '<li><strong>Concern</strong> — results are acceptable but trending the wrong way</li>' +
    '<li><strong>Warning</strong> — you need a visible turnaround</li>' +
    '<li><strong>Probation</strong> — one more weak review can end your tenure</li>' +
    '<li><strong>Dismissed</strong> — ownership has replaced you as GM</li>' +
    '</ul>' +
    '<h4 style="font-family:var(--fd);font-size:13px;letter-spacing:2px;color:var(--amb);margin:16px 0 8px">Termination</h4>' +
    '<p>You can be dismissed if job security falls to zero, or if you are already on probation and deliver another clearly failed review. That is <strong>separate from bankruptcy</strong>: you can be fired while the company still has cash, or keep your job through a tight cash quarter if ownership likes the trend.</p>' +
    '<h4 style="font-family:var(--fd);font-size:13px;letter-spacing:2px;color:var(--amb);margin:16px 0 8px">Cash and credit vs. reviews</h4>' +
    '<p><strong>Financial distress</strong> (low cash, loans, bankruptcy warnings) is a balance-sheet problem. <strong>GM reviews</strong> are a leadership scorecard. Fix cash with financing and costs; fix reviews with margins, revenue growth, and building the station for the long run.</p>';

  function gmScenarioActive(G) {
    var mp = typeof MP !== 'undefined' ? MP : null;
    return !!(G && G.sc && G.sc.gmMode && mp && mp.mode !== 'live');
  }

  function gmPlayerFinHistory(G) {
    return G.finHistory || [];
  }

  function playerStationsForGm(G) {
    if (typeof global.myPS === 'function') return global.myPS();
    return (G.ps || []).filter(function (s) {
      return s && s.isPlayer;
    });
  }

  /** Promo + programming spend as a share of player revenue — efficiency / ROI signal (read-only). */
  function computeDiscretionarySpendRatio(G) {
    var ps = playerStationsForGm(G);
    var tr = 0;
    var td = 0;
    for (var i = 0; i < ps.length; i++) {
      var s = ps[i];
      var rev = s.fin && s.fin.rev ? s.fin.rev : 0;
      var op = s.ops || {};
      td += (op.promo || 0) + (op.progBudget || 0);
      tr += rev;
    }
    return tr > 0 ? td / tr : 0;
  }

  /** Campaign assignment tier sharpens corporate scrutiny (GM + campaign); defaults when not in a career assignment. */
  function getCampaignTierPressure(G) {
    var raw =
      G && G.campaignAssignment && G.campaignAssignment.tier != null
        ? G.campaignAssignment.tier | 0
        : 2;
    var tier = Math.max(0, Math.min(5, raw));
    /** T0: entry scrutiny; T1–2: modest; T3–5: step-ups — flat trends and efficiency hurt more. */
    var pressure = tier <= 0 ? 0.94 : tier <= 2 ? 1.0 : tier === 3 ? 1.06 : tier === 4 ? 1.2 : 1.3;
    return { tier: tier, pressure: pressure };
  }

  /**
   * Campaign-only: first N formal reviews after assignment may use "turnaround patience" (see LADDER tier 3).
   * Counts reviews already completed this assignment; the current evaluation uses the count *before* this review.
   */
  function getAssignmentTurnaroundPatience(G, kpis) {
    var ca = G && G.campaignAssignment;
    var gm = G && G._gm;
    var cap = ca && ca.evaluationGraceReviews != null ? ca.evaluationGraceReviews | 0 : 0;
    if (!ca || cap <= 0) {
      return {
        active: false,
        crisisMode: false,
        reviewsRemaining: 0,
        reviewsCompleted: 0,
      };
    }
    var done = gm && gm.formalReviewsCompletedThisAssignment != null ? gm.formalReviewsCompletedThisAssignment | 0 : 0;
    if (done >= cap) {
      return { active: false, crisisMode: false, reviewsRemaining: 0, reviewsCompleted: done };
    }
    var crisis =
      kpis && kpis.revenueTrend === 'declining' && kpis && kpis.franchiseTrend === 'declining';
    return {
      active: true,
      crisisMode: !!crisis,
      reviewsRemaining: cap - done,
      reviewsCompleted: done,
    };
  }

  function weightedPlayerFranchise(G) {
    var ps = playerStationsForGm(G);
    if (!ps.length) return { avg: 0.88, stations: 0 };
    var sumW = 0;
    var sum = 0;
    for (var i = 0; i < ps.length; i++) {
      var s = ps[i];
      var rev = s.fin && s.fin.rev ? s.fin.rev : 0;
      var w = Math.max(1, rev);
      var fr = typeof s.talentFranchise === 'number' && !isNaN(s.talentFranchise) ? s.talentFranchise : 0.88;
      sum += fr * w;
      sumW += w;
    }
    return { avg: sumW > 0 ? sum / sumW : 0.88, stations: ps.length };
  }

  function classifyTrend(values, eps) {
    var e = eps == null ? 0.012 : eps;
    if (values.length < 2) return 'flat';
    var mid = Math.floor(values.length / 2);
    var a = 0,
      b = 0;
    for (var i = 0; i < mid; i++) a += values[i];
    a /= Math.max(1, mid);
    for (var j = mid; j < values.length; j++) b += values[j];
    b /= Math.max(1, values.length - mid);
    var denom = Math.max(Math.abs(a), Math.abs(b), 1);
    var rel = (b - a) / denom;
    if (rel > e) return 'rising';
    if (rel < -e) return 'declining';
    return 'flat';
  }

  function stressMargin(avgMargin, cfg) {
    if (avgMargin >= cfg.minMarginPct) return 0;
    if (avgMargin >= cfg.minMarginPct - (DEFAULT_GM.marginSoftBand || 4)) return 0.35;
    return Math.min(1, (cfg.minMarginPct - avgMargin) / 18);
  }

  function stressRevenue(trend, cfg, tierPressure) {
    var tp = tierPressure != null ? tierPressure : 1;
    if (trend === 'rising') return 0;
    if (trend === 'flat') return 0.18 * (1 + (tp - 1) * 0.65);
    return cfg.revenueDeclineStress * (1 + (tp - 1) * 0.22);
  }

  function stressFranchise(avgFr, trend, cfg, tierPressure) {
    var tp = tierPressure != null ? tierPressure : 1;
    var s = 0;
    if (avgFr < cfg.minFranchiseAvg) s += 0.55;
    if (trend === 'declining') s += 0.45;
    else if (trend === 'flat' && avgFr < cfg.minFranchiseAvg + 0.04) s += 0.15 * (1 + (tp - 1) * 0.85);
    return Math.min(1, s);
  }

  /**
   * Spend discipline: high promo + programming vs revenue while margins are soft or trends flat
   * reads as "overspending for results" — not a new economy layer, uses existing ops + fin history.
   */
  function stressEfficiency(kpis, cfg, discRatio, tierPressure, tier) {
    var r = discRatio;
    var m = kpis.marginAvg;
    var minM = cfg.minMarginPct;
    var revUp = kpis.revenueTrend === 'rising';
    var frUp = kpis.franchiseTrend === 'rising';
    var tp = tierPressure != null ? tierPressure : 1;
    var s = 0;
    if (r >= 0.11 && m < minM + 2) s += 0.28;
    if (r >= 0.15 && m < minM + 4 && !revUp) s += 0.22;
    if (r >= 0.18 && (kpis.revenueTrend === 'flat' || kpis.franchiseTrend === 'flat') && m < minM + 5) s += 0.18;
    if (r >= 0.22 && !revUp && m < minM + 6) s += 0.2;
    if (r <= 0.065 && m >= minM - 0.5) s -= 0.1;
    s *= tp;
    if (tier >= 4) s *= 1.08;
    if (tier >= 5) s *= 1.12;
    return Math.max(0, Math.min(1, s));
  }

  function resolveGmConfig(G) {
    var sc = G.sc || {};
    var arch = sc.gmOwnerArchetype || 'turnaround';
    var base = GM_OWNER_ARCHETYPES[arch] || GM_OWNER_ARCHETYPES.turnaround;
    var o = sc.gmConfig && typeof sc.gmConfig === 'object' ? sc.gmConfig : {};
    return {
      archetype: arch,
      wProfit: o.wProfit != null ? o.wProfit : base.wProfit,
      wRevenue: o.wRevenue != null ? o.wRevenue : base.wRevenue,
      wFranchise: o.wFranchise != null ? o.wFranchise : base.wFranchise,
      minMarginPct: o.minMarginPct != null ? o.minMarginPct : base.minMarginPct,
      minFranchiseAvg: o.minFranchiseAvg != null ? o.minFranchiseAvg : base.minFranchiseAvg,
      revenueDeclineStress: o.revenueDeclineStress != null ? o.revenueDeclineStress : base.revenueDeclineStress,
      reviewIntervalPeriods: o.reviewIntervalPeriods != null ? o.reviewIntervalPeriods : DEFAULT_GM.reviewIntervalPeriods,
      trailingPeriods: o.trailingPeriods != null ? o.trailingPeriods : DEFAULT_GM.trailingPeriods,
      startConfidence: o.startConfidence != null ? o.startConfidence : DEFAULT_GM.startConfidence,
    };
  }

  /**
   * @returns {{ marginAvg: number, revenueTrend: string, franchiseAvg: number, franchiseTrend: string, sampleN: number, reasons: string[] }}
   */
  function computeGmKpis(G, cfg) {
    var reasons = [];
    var T = Math.max(2, Math.min(12, cfg.trailingPeriods | 0));
    var hist = gmPlayerFinHistory(G).slice(-T);
    var margins = hist.map(function (h) {
      return typeof h.margin === 'number' ? h.margin : 0;
    });
    var revs = hist.map(function (h) {
      return typeof h.revenue === 'number' ? h.revenue : 0;
    });
    var marginAvg = margins.length ? margins.reduce(function (a, b) {
      return a + b;
    }, 0) / margins.length : 0;

    var revenueTrend = classifyTrend(revs, 0.013);
    var snap = (G._gm && G._gm.franchiseSnapshots) || [];
    var frVals = snap.slice(-T).map(function (x) {
      return x.avg;
    });
    var franchiseAvg = frVals.length ? frVals.reduce(function (a, b) {
      return a + b;
    }, 0) / frVals.length : weightedPlayerFranchise(G).avg;
    var franchiseTrend = frVals.length >= 2 ? classifyTrend(frVals, 0.007) : 'flat';

    if (marginAvg < cfg.minMarginPct) reasons.push('Profitability is below expectations');
    if (revenueTrend === 'declining') reasons.push('Revenue has been declining');
    if (franchiseTrend === 'declining') reasons.push('Long-term station strength is declining');
    if (franchiseAvg < cfg.minFranchiseAvg) reasons.push('Long-term competitiveness is below what ownership expects');

    var tp = getCampaignTierPressure(G);
    var discRatio = computeDiscretionarySpendRatio(G);
    var sePrev = stressEfficiency(
      {
        marginAvg: Math.round(marginAvg * 10) / 10,
        revenueTrend: revenueTrend,
        franchiseTrend: franchiseTrend,
      },
      cfg,
      discRatio,
      tp.pressure,
      tp.tier
    );
    if (sePrev >= 0.22 && discRatio >= 0.12) {
      reasons.push('Marketing and programming spend are elevated versus results ownership expects for that level of investment');
    }

    var patPre = getAssignmentTurnaroundPatience(G, {
      revenueTrend: revenueTrend,
      franchiseTrend: franchiseTrend,
      marginAvg: marginAvg,
    });
    if (patPre.active && !patPre.crisisMode) {
      reasons.push(
        'Corporate is still giving you turnaround runway on this assignment — they want clear direction and improvement, not a perfect quarter.'
      );
    }

    return {
      marginAvg: Math.round(marginAvg * 10) / 10,
      revenueTrend: revenueTrend,
      franchiseAvg: Math.round(franchiseAvg * 1000) / 1000,
      franchiseTrend: franchiseTrend,
      sampleN: hist.length,
      reasons: reasons,
      discretionaryRatio: Math.round(discRatio * 1000) / 1000,
      campaignTier: tp.tier,
      tierPressure: tp.pressure,
      turnaroundPatienceActive: patPre.active,
      turnaroundPatienceCrisis: patPre.crisisMode,
      turnaroundReviewsRemaining: patPre.reviewsRemaining,
    };
  }

  function getGmStatusLabel(confidence, fired) {
    if (fired) return 'fired';
    if (confidence >= 62) return 'secure';
    if (confidence >= 48) return 'concern';
    if (confidence >= 32) return 'warning';
    if (confidence >= 18) return 'probation';
    return 'probation';
  }

  /** Revenue and franchise both stalled (not rising) — "no meaningful progress" for flagship tiers. */
  function gmNoProgressTrends(kpis) {
    var r = kpis.revenueTrend;
    var f = kpis.franchiseTrend;
    var revStalled = r === 'flat' || r === 'declining';
    var frStalled = f === 'flat' || f === 'declining';
    return revStalled && frStalled;
  }

  /** Mediocre base drift: -1 at all tiers (Tier 5 uses softer streak/no-progress/spend + review bands, not a harsher base). */
  function gmMediocreBaseDelta(tier, patienceApplied) {
    var d = -1;
    if (patienceApplied) d = Math.round(d * 0.92);
    return d;
  }

  /** Extra negative delta for consecutive mediocre reviews — stepwise slope, capped (T5 uses a gentler cap + scale). */
  function gmMediocreStreakExtra(consecutiveMediocreCount, patienceApplied, tier) {
    var n = consecutiveMediocreCount | 0;
    if (n < 2) return 0;
    var t = tier | 0;
    var cap = t >= 5 ? 3 : 5;
    var extra = -Math.min(cap, n - 1);
    if (patienceApplied) extra = Math.round(extra * 0.72);
    if (t >= 5) extra = Math.round(extra * 0.88);
    return extra;
  }

  /**
   * Tier 5 only, after sustained mediocrity: both trends stalled — extra drift so coasting cannot stabilize.
   * Tier 5 used to require 3 consecutive; split the difference at 3 so “mixed” books do not always stack.
   */
  function gmNoProgressConfidencePenalty(kpis, tier, patienceApplied, consecutiveMediocre) {
    var needStreak = tier >= 5 ? 3 : 2;
    if (tier < 5 || (consecutiveMediocre | 0) < needStreak || !gmNoProgressTrends(kpis)) return 0;
    var p = -1;
    if (patienceApplied) p = Math.round(p * 0.65);
    if (tier >= 5) p = Math.round(p * 0.82);
    return p;
  }

  /** Mediocre + elevated spend vs payoff — extra erosion (capped); Tier 5 scales down so spend pressure stays real but not automatic demotion. */
  function gmSpendMediocreDrift(evalRes, kpis, cfg, tier) {
    var disc = evalRes.disc != null ? evalRes.disc : 0;
    var se = evalRes.se != null ? evalRes.se : 0;
    if (disc < 0.13) return 0;
    var drift = -1;
    if (disc >= 0.15 && se >= 0.18) drift -= 1;
    drift = Math.max(-2, drift);
    if ((tier | 0) >= 5) drift = Math.round(drift * 0.82);
    return drift;
  }

  function evaluateGmReview(G, kpis, cfg) {
    var tp = kpis.tierPressure != null ? kpis.tierPressure : getCampaignTierPressure(G).pressure;
    var tier = kpis.campaignTier != null ? kpis.campaignTier : getCampaignTierPressure(G).tier;
    var pat = getAssignmentTurnaroundPatience(G, kpis);
    var effCfg = cfg;
    var tpEval = tp;
    if (pat.active && !pat.crisisMode) {
      effCfg = Object.assign({}, cfg, { minMarginPct: cfg.minMarginPct - 2 });
      tpEval = tp * 0.9;
    } else if (pat.active && pat.crisisMode) {
      tpEval = tp * 0.96;
    }
    var sm = stressMargin(kpis.marginAvg, effCfg);
    var sr = stressRevenue(kpis.revenueTrend, cfg, tpEval);
    var sf = stressFranchise(kpis.franchiseAvg, kpis.franchiseTrend, cfg, tpEval);
    var disc = kpis.discretionaryRatio != null ? kpis.discretionaryRatio : computeDiscretionarySpendRatio(G);
    var se = stressEfficiency(kpis, cfg, disc, tpEval, tier);
    if (pat.active) {
      if (pat.crisisMode) se *= 0.88;
      else se *= 0.58;
    }
    var ew = DEFAULT_GM.efficiencyWeight != null ? DEFAULT_GM.efficiencyWeight : 0.2;
    var eAmp = DEFAULT_GM.efficiencyCoreAmplify != null ? DEFAULT_GM.efficiencyCoreAmplify : 0.2;
    var core = cfg.wProfit * sm + cfg.wRevenue * sr + cfg.wFranchise * sf;
    /** Tier 5 only: slightly damp efficiency amplification so strong ops can register “good” without a global bonus change. */
    var seComp = tier >= 5 ? se * 0.87 : se;
    var composite = Math.min(1, core * (1 + eAmp * seComp) + ew * seComp);
    /** Tier 5: tiny calibration vs other tiers — slightly easier “good” (rare wins), slightly sharper “bad” (demotion lane). */
    var goodCut = tier >= 5 ? 0.161 : tier >= 4 ? 0.185 : tier === 3 ? 0.21 : 0.22;
    var badCut = tier >= 5 ? 0.496 : tier >= 4 ? 0.52 : tier === 3 ? 0.53 : 0.52;
    var good = composite < goodCut;
    var bad = composite > badCut;
    /**
     * Tier 5 only: finer bands so nearby composites do not share one confidence ladder.
     * Outward good/bad booleans unchanged (UI, firing); confidence uses band in applyGmConfidenceUpdate.
     */
    var t5Classification = null;
    if ((tier | 0) >= 5) {
      var t5MarginalBadSpan = 0.14;
      var t5MarginalBadCeiling = badCut + t5MarginalBadSpan;
      var t5MediocreMid = (goodCut + badCut) / 2;
      if (good) {
        t5Classification = { band: 'good' };
      } else if (bad) {
        if (composite <= t5MarginalBadCeiling) {
          t5Classification = { band: 'marginal_bad', marginalBadCeiling: t5MarginalBadCeiling };
        } else {
          t5Classification = { band: 'severe_bad' };
        }
      } else {
        if (composite >= t5MediocreMid) {
          t5Classification = { band: 'mediocre_upper', mediocreMid: t5MediocreMid };
        } else {
          t5Classification = { band: 'mediocre_lower' };
        }
      }
    }
    var patienceNote = '';
    if (pat.active) {
      patienceNote = pat.crisisMode
        ? 'Ownership is still honoring your turnaround budget, but revenue and station strength are both sliding — patience is limited.'
        : 'This cycle used turnaround patience: corporate weighted progress and investment discipline over a single-period profit score.';
    }
    return {
      sm: sm,
      sr: sr,
      sf: sf,
      se: se,
      core: core,
      composite: composite,
      good: good,
      bad: bad,
      disc: disc,
      tier: tier,
      t5Classification: t5Classification,
      turnaroundPatienceApplied: pat.active,
      turnaroundPatienceCrisis: pat.crisisMode,
      turnaroundPatienceNote: patienceNote,
    };
  }

  function applyGmConfidenceUpdate(G, evalRes, kpis, reasonsOut) {
    var gm = G._gm;
    var cfg = gm.config;
    var delta = 0;
    var confidenceBeforeReview = gm.confidence;
    var tierAny = evalRes.tier != null ? evalRes.tier : 2;
    var comp = {
      goodReviewBonus: 0,
      badReviewPenalty: 0,
      badStreakPenalty: 0,
      repeatBadExtra: 0,
      baseMediocre: 0,
      stagnationStreakExtra: 0,
      noProgressPenalty: 0,
      spendMediocreDrift: 0,
      closingStretchPenalty: 0,
      closingStretchBracket: null,
      closingStretchEntered: false,
      closingStretchEligible: false,
      stalledTrends: false,
      weakMediocreStreak: false,
    };
    if (evalRes.good) {
      delta = DEFAULT_GM.goodReviewBonus;
      comp.goodReviewBonus = DEFAULT_GM.goodReviewBonus;
      gm.consecutiveBadReviews = 0;
      gm.consecutiveMediocreReviews = 0;
    } else if (evalRes.bad) {
      var prevBad = gm.consecutiveBadReviews || 0;
      var badPenaltyPts = DEFAULT_GM.badReviewPenalty;
      if (
        tierAny >= 5 &&
        evalRes.t5Classification &&
        evalRes.t5Classification.band === 'marginal_bad'
      ) {
        badPenaltyPts = 13;
      }
      comp.badReviewPenalty = -badPenaltyPts;
      comp.badStreakPenalty = -prevBad * 3;
      delta = -badPenaltyPts - prevBad * 3;
      gm.consecutiveBadReviews = prevBad + 1;
      if ((gm.consecutiveBadReviews || 0) >= 2) {
        delta -= DEFAULT_GM.repeatBadExtra;
        comp.repeatBadExtra = -DEFAULT_GM.repeatBadExtra;
      }
      gm.consecutiveMediocreReviews = 0;
    } else {
      gm.consecutiveBadReviews = 0;
      gm.consecutiveMediocreReviews = (gm.consecutiveMediocreReviews || 0) + 1;
      var tierM = evalRes.tier != null ? evalRes.tier : 2;
      var patM = !!evalRes.turnaroundPatienceApplied;
      var baseMediocre = gmMediocreBaseDelta(tierM, patM);
      var streakExtra = gmMediocreStreakExtra(gm.consecutiveMediocreReviews, patM, tierM);
      var noProg = gmNoProgressConfidencePenalty(kpis, tierM, patM, gm.consecutiveMediocreReviews);
      var spendDrift = gmSpendMediocreDrift(evalRes, kpis, cfg, tierM);
      comp.baseMediocre = baseMediocre;
      comp.stagnationStreakExtra = streakExtra;
      comp.noProgressPenalty = noProg;
      comp.spendMediocreDrift = spendDrift;
      delta = baseMediocre + streakExtra + noProg + spendDrift;
      /**
       * Tier 5 closing stretch (mediocre branch only): period 17+; enter when lukewarm is stacking, both trends stalled,
       * or period 20+ on a 22-period flagship (so a single lukewarm review still qualifies — streak can be 1).
       * Closing penalty by pre-review confidence: below 44 → −2, 44–52 → −1, above 52 → 0. If revenue and franchise are both
       * flat/declining OR lukewarm has stacked 2+, bump the closing penalty one step (cap −2) so “no progress” and weak
       * streaks bite harder than a uniform −1 late run.
       */
      comp.closingStretchEligible =
        tierM >= 5 &&
        delta < 0 &&
        (gm.closedPeriods | 0) >= 17 &&
        ((gm.consecutiveMediocreReviews | 0) >= 2 ||
          gmNoProgressTrends(kpis) ||
          ((gm.closedPeriods | 0) >= 20 && (gm.consecutiveMediocreReviews | 0) >= 1));
      if (comp.closingStretchEligible) {
        var confBefore = gm.confidence | 0;
        var stalledTrends = gmNoProgressTrends(kpis);
        var weakMediocreStreak = (gm.consecutiveMediocreReviews | 0) >= 2;
        comp.stalledTrends = stalledTrends;
        comp.weakMediocreStreak = weakMediocreStreak;
        var closingPen = confBefore < 44 ? 2 : confBefore <= 52 ? 1 : 0;
        comp.closingStretchBracket = confBefore < 44 ? 'below44' : confBefore <= 52 ? '44to52' : 'above52';
        if (
          closingPen > 0 &&
          (stalledTrends || weakMediocreStreak) &&
          closingPen < 2
        ) {
          closingPen = Math.min(2, closingPen + 1);
        }
        if (closingPen > 0) {
          comp.closingStretchEntered = true;
          comp.closingStretchPenalty = -closingPen;
          delta -= closingPen;
          reasonsOut.push(
            stalledTrends
              ? 'Late in this flagship assignment, mixed results on a shorter runway — flat revenue and flat station strength leave little room for coasting.'
              : 'Late in this flagship assignment, mixed results are being judged on a shorter runway — especially with momentum slipping or stuck trends.'
          );
        }
      }
      if (gm.consecutiveMediocreReviews >= 2) {
        reasonsOut.push(
          'Repeated lukewarm reviews are wearing down corporate confidence — they need to see improvement, not more of the same.'
        );
      }
      if (noProg < 0) {
        reasonsOut.push(
          'Corporate sees too little progress — flat revenue and flat station strength are a growing concern in a flagship market.'
        );
      }
      if (spendDrift < 0) {
        reasonsOut.push(
          'Marketing and programming spend is high for the results you are delivering this cycle.'
        );
      }
      if (streakExtra < -1 && gm.consecutiveMediocreReviews >= 3) {
        reasonsOut.push('Flat results are becoming a liability — ownership expects a credible plan and visible movement.');
      }
      if (tierM >= 5 && evalRes.t5Classification) {
        if (evalRes.t5Classification.band === 'mediocre_upper') {
          delta += 1;
          comp.t5MediocreFine = 1;
        } else if (evalRes.t5Classification.band === 'mediocre_lower') {
          delta -= 1;
          comp.t5MediocreFine = -1;
        }
      }
    }
    var deltaBeforeClamp = delta;
    var rawUnclamped = (gm.confidence || 0) + deltaBeforeClamp;
    gm.confidence = Math.max(0, Math.min(100, rawUnclamped));

    if (gm.tier5ConfidenceDiag && Array.isArray(gm.tier5ConfidenceDiag)) {
      var outcome = evalRes.good ? 'good' : evalRes.bad ? 'bad' : 'mediocre';
      if (evalRes.t5Classification && evalRes.t5Classification.band) {
        outcome = evalRes.t5Classification.band;
      }
      gm.tier5ConfidenceDiag.push({
        closedPeriodsAtReview: gm.closedPeriods | 0,
        confidenceBefore: confidenceBeforeReview,
        outcome: outcome,
        composite: evalRes.composite != null ? evalRes.composite : null,
        tier: tierAny,
        deltaRaw: deltaBeforeClamp,
        components: comp,
        rawUnclamped: rawUnclamped,
        clampHitLow: rawUnclamped < 0,
        clampHitHigh: rawUnclamped > 100,
        confidenceAfter: gm.confidence,
      });
    }

    reasonsOut.push(
      'This review weighed profitability, revenue trend, station strength, spend discipline, and (at higher levels) corporate expectations.'
    );
    if (evalRes.se != null && evalRes.se >= 0.18) {
      reasonsOut.push(
        'Ownership is scrutinizing whether marketing and programming spend are justified by the business results.'
      );
    }

    var prev = gm.status;
    if (gm.confidence <= 0 || (prev === 'probation' && evalRes.bad)) {
      gm.fired = true;
      gm.status = 'fired';
      reasonsOut.push('Ownership has dismissed you as General Manager.');
      G._gmCareerEnded = true;
      return;
    }
    gm.status = getGmStatusLabel(gm.confidence, false);
  }

  /** Human-readable: periods → years (2 periods = 1 calendar year in sim). */
  function formatPeriodsAsTime(periods) {
    var n = Math.max(0, Math.floor(periods));
    if (n === 0) return 'this period';
    var years = n / 2;
    var yLabel = years === 1 ? '1 year' : years % 1 === 0 ? years + ' years' : years.toFixed(1) + ' years';
    return n + ' periods (~' + yLabel + ')';
  }

  function periodsUntilNextReview(gm) {
    return gm.nextReviewAt != null && gm.closedPeriods != null ? Math.max(0, gm.nextReviewAt - gm.closedPeriods) : 0;
  }

  /**
   * Full sentence for UI — formal corporate review timing in plain language.
   * Not a contract extension; wording avoids implying license renewal.
   */
  function nextReviewPhrase(G, gm) {
    var nextN = periodsUntilNextReview(gm);
    if (nextN <= 0) {
      return 'Formal corporate performance review: due when you close this period.';
    }
    if (nextN === 1) {
      return 'Next ownership review after one more period (~half a year).';
    }
    if (nextN === 2) {
      return 'Next corporate review in about one year (2 periods).';
    }
    var years = nextN / 2;
    var yPart =
      nextN % 2 === 0
        ? years === 1
          ? 'about one year'
          : 'about ' + years + ' years'
        : 'about ' + years.toFixed(1) + ' years';
    return 'Next corporate review in ' + yPart + ' (' + nextN + ' periods).';
  }

  /** Shorter line for dense layouts (no leading “Next…” duplication). */
  function nextReviewShortLine(gm) {
    var nextN = periodsUntilNextReview(gm);
    if (nextN <= 0) return 'Due when this period closes';
    if (nextN === 1) return 'After 1 more period (~half a year)';
    if (nextN === 2) return 'In ~1 year (2 periods)';
    var years = nextN / 2;
    var yPart = nextN % 2 === 0 ? String(years) + ' years' : '~' + years.toFixed(1) + ' years';
    return 'In ~' + yPart + ' (' + nextN + ' periods)';
  }

  function ownerTypeLabel(arch) {
    return OWNER_TYPE_LABEL[arch] || arch || '—';
  }

  /** Plain-English ownership priority — one sentence. */
  function ownershipPrioritySentence(cfg) {
    var a = [
      { k: 'profit', w: cfg.wProfit },
      { k: 'revenue', w: cfg.wRevenue },
      { k: 'strength', w: cfg.wFranchise },
    ].sort(function (x, y) {
      return y.w - x.w;
    });
    var top = a[0].k;
    if (top === 'profit') {
      return 'Ownership weighs sustainable profits and margins most heavily.';
    }
    if (top === 'revenue') {
      return 'Ownership weighs revenue growth and billing momentum most heavily.';
    }
    return 'Ownership weighs long-term station strength (brand, talent, staying competitive) most heavily.';
  }

  /** Efficiency stress adjusted for turnaround patience — matches formal review weighting for UI. */
  function efficiencyStressForUi(kpis, cfg) {
    var tp = kpis.tierPressure != null ? kpis.tierPressure : 1;
    var tier = kpis.campaignTier != null ? kpis.campaignTier : 2;
    var disc = kpis.discretionaryRatio != null ? kpis.discretionaryRatio : 0;
    var se = stressEfficiency(kpis, cfg, disc, tp, tier);
    if (kpis.turnaroundPatienceActive) {
      if (kpis.turnaroundPatienceCrisis) se *= 0.88;
      else se *= 0.58;
    }
    return se;
  }

  /** One plain sentence — pick dominant stress among margin / revenue / franchise / spend efficiency (interpretation only). */
  function biggestIssueSentence(kpis, cfg) {
    var tp = kpis.tierPressure != null ? kpis.tierPressure : 1;
    var tier = kpis.campaignTier != null ? kpis.campaignTier : 2;
    var sm = stressMargin(kpis.marginAvg, cfg);
    var sr = stressRevenue(kpis.revenueTrend, cfg, tp);
    var sf = stressFranchise(kpis.franchiseAvg, kpis.franchiseTrend, cfg, tp);
    var se = efficiencyStressForUi(kpis, cfg);
    var maxS = Math.max(sm, sr, sf, se);
    if (maxS < 0.08) {
      if (tier >= 4 && gmNoProgressTrends(kpis)) {
        return 'Flat revenue and flat station strength are not enough at this level — ownership expects clear progress.';
      }
      return 'No single issue is dominating — keep execution steady.';
    }
    if (se >= sm && se >= sr && se >= sf && se > 0.1) {
      if (kpis.turnaroundPatienceActive && !kpis.turnaroundPatienceCrisis) {
        return 'Spend is elevated, but ownership is still treating this as a rebuild — show measurable audience or revenue direction before the grace period ends.';
      }
      return 'Ownership is concerned that marketing and programming spend are high for the revenue and margin you are delivering — tighten cost discipline or show clearer payoff.';
    }
    if (sm >= sr && sm >= sf && sm >= se && sm > 0.08) return 'Margins are below what ownership expects — profitability needs attention.';
    if (sr >= sm && sr >= sf && sr >= se && sr > 0.08) return 'Revenue has been sliding — ownership will want to see billing stabilize or grow.';
    if (kpis.franchiseAvg < cfg.minFranchiseAvg && kpis.franchiseTrend === 'declining') {
      return 'Your station’s long-term strength is slipping — ownership is worried about future competitiveness.';
    }
    if (kpis.franchiseAvg < cfg.minFranchiseAvg) {
      return 'Ownership is worried the station is weaker competitively than they want.';
    }
    if (kpis.franchiseTrend === 'declining') {
      return 'Long-term station strength is trending down — invest in brand and talent before it becomes a crisis.';
    }
    return 'Your station’s long-term strength needs reinforcement to match ownership’s expectations.';
  }

  /**
   * At-a-glance lines for main screen / campaign — answers: safe? main risk? what to fix first?
   */
  function gmAtGlanceSummary(G) {
    if (!G || !G._gm) return '';
    var gm = G._gm;
    var cfg = gm.config || resolveGmConfig(G);
    if (gm.fired) {
      return 'Ownership has dismissed you as General Manager. Start a new run to try again.';
    }
    var st = gm.status;
    var kpis = computeGmKpis(G, cfg);
    var issue = biggestIssueSentence(kpis, cfg);
    var conf = Math.round(gm.confidence);

    if (st === 'secure') {
      if (maxStress(kpis, cfg) < 0.12) {
        return 'You are in solid standing (' + conf + '% job security). Keep margins, revenue, and station strength aligned.';
      }
      if (issue.indexOf('No single issue') === 0) {
        return 'You are secure (' + conf + '% job security). No single problem dominates — keep execution steady.';
      }
      return (
        'You are secure (' +
        conf +
        '% job security), but ' +
        issue.charAt(0).toLowerCase() +
        issue.slice(1)
      );
    }
    if (st === 'concern') {
      return 'Ownership is concerned (' + conf + '% job security). Priority: ' + issue;
    }
    if (st === 'warning') {
      return 'You are on warning (' + conf + '% job security). Another weak review could escalate this — address: ' + issue;
    }
    if (st === 'probation') {
      return 'You are on probation (' + conf + '% job security). The next formal review is high-stakes — focus on: ' + issue;
    }
    return issue;
  }

  function maxStress(kpis, cfg) {
    var tp = kpis.tierPressure != null ? kpis.tierPressure : 1;
    var sm = stressMargin(kpis.marginAvg, cfg);
    var sr = stressRevenue(kpis.revenueTrend, cfg, tp);
    var sf = stressFranchise(kpis.franchiseAvg, kpis.franchiseTrend, cfg, tp);
    var se = efficiencyStressForUi(kpis, cfg);
    return Math.max(sm, sr, sf, se);
  }

  function reviewOutcomeLabel(ev) {
    if (!ev) return 'Mixed results';
    if (ev.good) return 'Exceeded expectations';
    if (ev.bad) return 'Below expectations';
    return 'Mixed results';
  }

  function securityClass(st) {
    if (st === 'secure') return 'wl-gm--secure';
    if (st === 'concern') return 'wl-gm--concern';
    if (st === 'warning') return 'wl-gm--warning';
    if (st === 'probation') return 'wl-gm--probation';
    if (st === 'fired') return 'wl-gm--fired';
    return 'wl-gm--concern';
  }

  function statusDisplayLabel(st) {
    var label = {
      secure: 'Secure',
      concern: 'Concern',
      warning: 'Warning',
      probation: 'Probation',
      fired: 'Fired',
    }[st] || st;
    return label;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function goodBullets(kpis, ev, cfg) {
    var out = [];
    var tp = kpis.tierPressure != null ? kpis.tierPressure : 1;
    var tier = kpis.campaignTier != null ? kpis.campaignTier : 2;
    var disc = kpis.discretionaryRatio != null ? kpis.discretionaryRatio : 0;
    var se = stressEfficiency(kpis, cfg, disc, tp, tier);
    if (kpis.revenueTrend === 'rising') out.push('Revenue is trending up.');
    if (kpis.marginAvg >= cfg.minMarginPct) out.push('Profit margins are in line with ownership targets.');
    if (kpis.franchiseTrend !== 'declining' && kpis.franchiseAvg >= cfg.minFranchiseAvg - 0.03)
      out.push('Long-term station strength is holding.');
    if (disc <= 0.08 && se < 0.12) out.push('Operating spend on promotion and programming looks disciplined for the results.');
    if (ev.good) out.push('Corporate sees this cycle as meeting expectations.');
    if (out.length === 0) out.push('No major wins this cycle — steady operations.');
    return out.slice(0, 3);
  }

  function needsImprovementBullets(kpis, cfg) {
    var out = [];
    var tp = kpis.tierPressure != null ? kpis.tierPressure : 1;
    var tier = kpis.campaignTier != null ? kpis.campaignTier : 2;
    var disc = kpis.discretionaryRatio != null ? kpis.discretionaryRatio : 0;
    var se = stressEfficiency(kpis, cfg, disc, tp, tier);
    if (kpis.revenueTrend === 'declining') out.push('Revenue trend needs to turn around.');
    if (kpis.marginAvg < cfg.minMarginPct) out.push('Profitability is below expectations.');
    if (kpis.franchiseTrend === 'declining') out.push('Long-term station strength is declining.');
    if (kpis.franchiseAvg < cfg.minFranchiseAvg) out.push('Competitive position is weaker than ownership wants.');
    if (se >= 0.18) out.push('Spend on marketing and programming is hard to justify against current margins and trends.');
    if (out.length === 0) out.push('Growth and consistency need more focus.');
    return out.slice(0, 3);
  }

  function outcomeNarrative(entry, cfg) {
    if (entry.fired) return 'Termination — ownership has replaced you as General Manager.';
    var st = entry.status;
    var ev = entry.eval || {};
    if (st === 'secure') {
      return ev.good
        ? 'No disciplinary action — your job is secure and confidence improved.'
        : 'No disciplinary action — you remain in good standing.';
    }
    if (st === 'concern') return 'You remain employed, but corporate has raised a formal concern — improve results and show that spending is justified.';
    if (st === 'warning') return 'You remain employed, but you are now under warning — ownership expects clearer progress, not just activity.';
    if (st === 'probation') return 'You remain employed on probation — the next review is critical; coasting is no longer acceptable.';
    return '—';
  }

  function fillGmReviewModal(entry, G) {
    var body = document.getElementById('gm-reviewb');
    if (!body || !entry) return;
    var mh = document.getElementById('gm-review-mh-title');
    if (mh) mh.textContent = 'FORMAL PERFORMANCE REVIEW';
    var cfg = (G && G._gm && G._gm.config) || resolveGmConfig(G || { sc: {} });
    var kpis = entry.kpis || {};
    var ev = entry.eval || { good: false, bad: false };
    var arch = cfg.archetype || 'turnaround';
    var good = goodBullets(kpis, ev, cfg);
    var bad = needsImprovementBullets(kpis, cfg);
    var season = entry.period === 2 ? 'Fall' : 'Spring';
    var sub =
      '<p style="margin:0 0 12px;font-size:13px;color:var(--mut)">' +
      escapeHtml(season + ' ' + entry.year + ' · Owner type: ' + ownerTypeLabel(arch)) +
      '</p>';
    var delta =
      entry.confidenceBefore != null && entry.confidenceAfter != null
        ? '<div class="wl-gm-sec"><h3>Job security</h3><p style="margin:0">' +
          escapeHtml(
            'Confidence moved from ' +
              Math.round(entry.confidenceBefore) +
              '% to ' +
              Math.round(entry.confidenceAfter) +
              '% (' +
              (entry.confidenceAfter >= entry.confidenceBefore ? '+' : '') +
              (Math.round(entry.confidenceAfter) - Math.round(entry.confidenceBefore)) +
              ').'
          ) +
          '</p></div>'
        : '';
    var statusLine =
      '<div class="wl-gm-sec"><h3>Standing after review</h3><p style="margin:0">' +
      escapeHtml(statusDisplayLabel(entry.fired ? 'fired' : entry.status)) +
      ' · ' +
      escapeHtml(reviewOutcomeLabel(ev)) +
      '</p></div>';
    var well =
      '<div class="wl-gm-sec"><h3>Main positives</h3><ul>' +
      good.map(function (x) {
        return '<li>' + escapeHtml(x) + '</li>';
      }).join('') +
      '</ul></div>';
    var imp =
      '<div class="wl-gm-sec"><h3>Main weaknesses</h3><ul>' +
      bad.map(function (x) {
        return '<li>' + escapeHtml(x) + '</li>';
      }).join('') +
      '</ul></div>';
    var wants =
      '<div class="wl-gm-sec"><h3>What ownership wants improved</h3><p style="margin:0">' +
      escapeHtml(bad[0] || 'Consistency across profitability, revenue, and long-term station strength.') +
      '</p></div>';
    var patienceBlock = '';
    if (entry.eval && entry.eval.turnaroundPatienceApplied && entry.eval.turnaroundPatienceNote) {
      patienceBlock =
        '<div class="wl-gm-sec"><h3>Turnaround commitment</h3><p style="margin:0">' +
        escapeHtml(entry.eval.turnaroundPatienceNote) +
        '</p></div>';
    }
    var out =
      '<div class="wl-gm-sec"><h3>Corporate note</h3><p style="margin:0">' + escapeHtml(outcomeNarrative(entry, cfg)) + '</p></div>';
    var gm = G && G._gm;
    var nextRev = gm ? nextReviewPhrase(G, gm) : '';
    var nextHtml =
      '<div class="wl-gm-sec"><h3>Next formal review</h3><p style="margin:0">' + escapeHtml(nextRev) + '</p></div>';
    body.innerHTML = sub + delta + statusLine + well + imp + wants + patienceBlock + out + nextHtml;
  }

  function fillGmCurrentStandingModal(G) {
    var body = document.getElementById('gm-reviewb');
    if (!body || !G || !G._gm) return;
    var mh = document.getElementById('gm-review-mh-title');
    if (mh) mh.textContent = 'CURRENT STANDING';
    var gm = G._gm;
    var cfg = gm.config || resolveGmConfig(G);
    var arch = cfg.archetype || 'turnaround';
    var kpisNow = computeGmKpis(G, cfg);
    var hist = gm.reviewHistory || [];

    if (gm.fired) {
      body.innerHTML =
        '<p style="margin:0 0 12px;font-size:14px;color:var(--off)">Ownership has ended your tenure as General Manager. Financial trouble and GM job security are separate — you can be dismissed even when the company is solvent.</p>' +
        '<div class="wl-gm-sec"><h3>Last formal review</h3><p style="margin:0">See the news feed for the dismissal notice.</p></div>';
      return;
    }

    if (!hist.length) {
      body.innerHTML =
        '<p style="margin:0 0 14px;font-size:14px;color:var(--mut)">Owner type: ' +
        escapeHtml(ownerTypeLabel(arch)) +
        '. ' +
        escapeHtml(ownershipPrioritySentence(cfg)) +
        '</p>' +
        '<div class="wl-gm-sec"><h3>Before the first review</h3><p style="margin:0">' +
        'No formal corporate review has run yet. When it does, ownership will judge your recent <strong>profitability</strong>, <strong>revenue trajectory</strong>, and <strong>long-term station strength</strong> (brand, talent, competitiveness) — weighted toward what this owner cares about most.</p></div>' +
        '<div class="wl-gm-sec"><h3>When</h3><p style="margin:0">' +
        escapeHtml(nextReviewPhrase(G, gm)) +
        '</p></div>' +
        '<div class="wl-gm-sec"><h3>Snapshot right now</h3><p style="margin:0">' +
        escapeHtml(biggestIssueSentence(kpisNow, cfg)) +
        '</p></div>' +
        '<div class="wl-gm-sec"><h3>Reminder</h3><p style="margin:0;font-size:14px;color:var(--mut)">Cash crunch and bankruptcy warnings are financial problems. GM reviews measure leadership results — both can pressure you, but they are not the same system.</p></div>';
      return;
    }

    var entry = hist[hist.length - 1];
    var kpis = entry.kpis || {};
    var ev = entry.eval || { good: false, bad: false };
    var good = goodBullets(kpis, ev, cfg);
    var bad = needsImprovementBullets(kpis, cfg);
    var season = entry.period === 2 ? 'Fall' : 'Spring';
    var delta =
      entry.confidenceBefore != null && entry.confidenceAfter != null
        ? '<div class="wl-gm-sec"><h3>Last review — job security</h3><p style="margin:0">' +
          escapeHtml(
            'After that review, confidence moved from ' +
              Math.round(entry.confidenceBefore) +
              '% to ' +
              Math.round(entry.confidenceAfter) +
              '% (' +
              (entry.confidenceAfter >= entry.confidenceBefore ? '+' : '') +
              (Math.round(entry.confidenceAfter) - Math.round(entry.confidenceBefore)) +
              '). You are now at ' +
              Math.round(gm.confidence) +
              '%.'
          ) +
          '</p></div>'
        : '<div class="wl-gm-sec"><h3>Job security now</h3><p style="margin:0">' +
          escapeHtml(String(Math.round(gm.confidence))) +
          '% — ' +
          escapeHtml(statusDisplayLabel(gm.status)) +
          '</p></div>';

    body.innerHTML =
      '<p style="margin:0 0 12px;font-size:13px;color:var(--mut)">Last formal review: ' +
      escapeHtml(season + ' ' + entry.year) +
      ' · ' +
      escapeHtml(reviewOutcomeLabel(ev)) +
      '</p>' +
      delta +
      '<div class="wl-gm-sec"><h3>Main positives (that cycle)</h3><ul>' +
      good
        .map(function (x) {
          return '<li>' + escapeHtml(x) + '</li>';
        })
        .join('') +
      '</ul></div>' +
      '<div class="wl-gm-sec"><h3>Main weaknesses (that cycle)</h3><ul>' +
      bad
        .map(function (x) {
          return '<li>' + escapeHtml(x) + '</li>';
        })
        .join('') +
      '</ul></div>' +
      '<div class="wl-gm-sec"><h3>What ownership wants improved</h3><p style="margin:0">' +
      escapeHtml(bad[0] || 'Sustained performance across margins, revenue, and station strength.') +
      '</p></div>' +
      '<div class="wl-gm-sec"><h3>Today’s priority</h3><p style="margin:0">' +
      escapeHtml(biggestIssueSentence(kpisNow, cfg)) +
      '</p></div>' +
      '<div class="wl-gm-sec"><h3>Next formal review</h3><p style="margin:0">' +
      escapeHtml(nextReviewPhrase(G, gm)) +
      '</p></div>';
  }

  function fillGmExplainerModal() {
    var body = document.getElementById('gm-explainb');
    if (body) body.innerHTML = GM_EXPLAIN_MEMO_HTML;
  }

  function buildCampaignGmSummaryHtml(G) {
    if (!gmScenarioActive(G) || !G._gm) return '';
    var gm = G._gm;
    var cfg = gm.config || resolveGmConfig(G);
    var st = gm.fired ? 'fired' : gm.status;
    var glance = escapeHtml(gmAtGlanceSummary(G));
    var label = escapeHtml(statusDisplayLabel(st));
    var conf = Math.round(gm.confidence);
    var ca = G.campaignAssignment || {};
    var note = ca.corporateCommitmentNote ? String(ca.corporateCommitmentNote).trim() : '';
    var graceN = ca.evaluationGraceReviews | 0;
    var doneRv = gm.formalReviewsCompletedThisAssignment | 0;
    var graceLine = '';
    if (graceN > 0 && doneRv < graceN) {
      graceLine =
        '<p style="margin:10px 0 0;font-size:13px;color:var(--mut);line-height:1.5"><strong style="color:var(--off)">Turnaround runway:</strong> ' +
        (graceN - doneRv) +
        ' formal review' +
        (graceN - doneRv === 1 ? '' : 's') +
        ' left where corporate emphasizes progress over instant profit.</p>';
    }
    var noteBlock = note
      ? '<p style="margin:10px 0 0;font-size:13px;color:var(--off);line-height:1.5">' + escapeHtml(note) + '</p>'
      : '';
    return (
      '<div class="wl-gm-campaign-callout" style="margin-top:14px;padding:14px 16px;background:rgba(0,0,0,.28);border:1px solid rgba(245,166,35,.28);border-radius:4px;font-size:14px;line-height:1.55;color:var(--off)">' +
      '<div style="font-size:11px;letter-spacing:2px;color:var(--amb);margin-bottom:8px">CORPORATE REVIEW (THIS ASSIGNMENT)</div>' +
      '<p style="margin:0 0 6px"><strong style="color:var(--wht)">' +
      label +
      '</strong> · Job security ' +
      conf +
      '%</p>' +
      '<p style="margin:0">' +
      glance +
      '</p>' +
      noteBlock +
      graceLine +
      '</div>'
    );
  }

  function initGmStateForGame(G) {
    if (!gmScenarioActive(G)) {
      delete G._gm;
      return;
    }
    var cfg = resolveGmConfig(G);
    G._gm = {
      config: cfg,
      confidence: cfg.startConfidence != null ? cfg.startConfidence : DEFAULT_GM.startConfidence,
      status: 'secure',
      fired: false,
      closedPeriods: 0,
      nextReviewAt: cfg.reviewIntervalPeriods,
      reviewHistory: [],
      franchiseSnapshots: [],
      consecutiveBadReviews: 0,
      consecutiveMediocreReviews: 0,
      formalReviewsCompletedThisAssignment: 0,
      pendingGmOnboarding: true,
      gmOnboardingSeen: false,
    };
    /** Headless Tier 5 shelf diagnostic — populated only when G._gmTier5ShelfDiag and tier ≥ 5 assignment. */
    if (G._gmTier5ShelfDiag && G.campaignAssignment && (G.campaignAssignment.tier | 0) >= 5) {
      G._gm.tier5ConfidenceDiag = [];
    }
  }

  function snapshotFranchisePeriod(G, wasYear, wasPeriod) {
    if (!gmScenarioActive(G) || !G._gm) return;
    var w = weightedPlayerFranchise(G);
    G._gm.franchiseSnapshots.push({
      year: wasYear,
      period: wasPeriod,
      avg: w.avg,
    });
    if (G._gm.franchiseSnapshots.length > 64) G._gm.franchiseSnapshots = G._gm.franchiseSnapshots.slice(-64);
  }

  function maybeRunGmReview(G) {
    if (!gmScenarioActive(G) || !G._gm || G._gm.fired) return;
    // Sandbox / post-2020 gates exist for standard franchise play. GM career uses the same G.score flags
    // but must still close periods (legacy sets score.isSandbox at 2020 decade end; that would freeze contracts).
    var gmPlay = !!(G.sc && G.sc.gmMode);
    if (G.tutorialMode || (G.score.isSandbox && !gmPlay) || (G.year > 2020 && !G.continuesBeyondEnd && !gmPlay)) {
      return;
    }
    var gm = G._gm;
    var cfg = gm.config;
    gm.closedPeriods = (gm.closedPeriods || 0) + 1;
    if (gm.closedPeriods < gm.nextReviewAt) return;
    if (gmPlayerFinHistory(G).length < 2) {
      gm.nextReviewAt = gm.closedPeriods + cfg.reviewIntervalPeriods;
      return;
    }

    var kpis = computeGmKpis(G, cfg);
    if (kpis.sampleN < 2) {
      gm.nextReviewAt = gm.closedPeriods + cfg.reviewIntervalPeriods;
      return;
    }

    var confBefore = gm.confidence;
    var ev = evaluateGmReview(G, kpis, cfg);
    var reasons = kpis.reasons ? kpis.reasons.slice() : [];
    applyGmConfidenceUpdate(G, ev, kpis, reasons);

    gm.formalReviewsCompletedThisAssignment = (gm.formalReviewsCompletedThisAssignment | 0) + 1;

    var entry = {
      year: G.year,
      period: G.period,
      kpis: kpis,
      eval: {
        composite: ev.composite,
        core: ev.core,
        good: ev.good,
        bad: ev.bad,
        se: ev.se,
        tier: ev.tier,
        t5Classification: ev.t5Classification || null,
        turnaroundPatienceApplied: !!ev.turnaroundPatienceApplied,
        turnaroundPatienceNote: ev.turnaroundPatienceNote || '',
      },
      confidenceBefore: confBefore,
      confidenceAfter: gm.confidence,
      status: gm.status,
      fired: !!gm.fired,
    };
    gm.reviewHistory.push(entry);
    if (gm.reviewHistory.length > 24) gm.reviewHistory = gm.reviewHistory.slice(-24);

    gm.nextReviewAt = gm.closedPeriods + cfg.reviewIntervalPeriods;

    G._gm.pendingReviewModal = entry;

    if (G.news && gm.fired) {
      G.news.unshift({
        v: 'HIGH',
        t: '📋 General Manager: You have been dismissed. Ownership cites sustained underperformance vs expectations.',
        y: G.year,
        p: G.period,
        iy: true,
      });
    } else if (G.news && (ev.bad || ev.good)) {
      var et = ev.tier != null ? ev.tier | 0 : 0;
      var tag;
      if (ev.good && et >= 5) {
        tag =
          'Corporate review: flagship-level results — ownership sees leadership hitting the numbers that matter. Job security improved.';
      } else if (ev.good) {
        tag = 'Corporate review: results met expectations — job security improved.';
      } else if (!ev.good && et >= 5) {
        tag =
          'Corporate review: results missed flagship expectations — job security took a serious hit.';
      } else {
        tag = 'Corporate review: results missed expectations — job security took a hit.';
      }
      G.news.unshift({ v: 'MEDIUM', t: '📋 ' + tag, y: G.year, p: G.period, iy: true });
    } else if (G.news && !ev.good && !ev.bad) {
      var evTier = ev.tier != null ? ev.tier | 0 : 0;
      var confN = gm.confidence != null ? gm.confidence | 0 : 0;
      var midFlagship =
        evTier >= 5 &&
        confN >= 44 &&
        confN < 62;
      var slipFlagship = evTier >= 5 && confN < 44;
      var tMed = midFlagship
        ? '📋 Corporate review: flagship expectations are demanding — this cycle was mixed. Ownership is keeping you in the role for now, but they want clearer proof next time.'
        : slipFlagship
          ? '📋 Corporate review: flagship results are slipping — job security is in the danger zone unless the next book turns clearly upward.'
          : evTier >= 5
            ? '📋 Corporate review: flagship expectations are high — middling results are putting real pressure on job security.'
            : '📋 Corporate review: middling results — lukewarm performance is slowly eroding job security.';
      G.news.unshift({
        v: 'MEDIUM',
        t: tMed,
        y: G.year,
        p: G.period,
        iy: true,
      });
    }
  }

  /** After finHistory + station history for the closed period */
  function onPeriodClose(G, wasYear, wasPeriod) {
    if (!gmScenarioActive(G)) return;
    if (!G._gm) initGmStateForGame(G);
    snapshotFranchisePeriod(G, wasYear, wasPeriod);
    maybeRunGmReview(G);
  }

  function migrateGmOnboardingFlags(G) {
    var gm = G._gm;
    if (!gm) return;
    if (gm.pendingGmOnboarding === undefined && gm.gmOnboardingSeen === undefined) gm.gmOnboardingSeen = true;
    if (
      gm.formalReviewsCompletedThisAssignment == null &&
      G &&
      G.campaignAssignment &&
      gm.reviewHistory &&
      gm.reviewHistory.length
    ) {
      gm.formalReviewsCompletedThisAssignment = gm.reviewHistory.length;
    }
  }

  function renderGmHeader(G) {
    var el = document.getElementById('wl-gm-panel');
    if (!el) return;
    if (!gmScenarioActive(G) || !G._gm || G.tutorialMode) {
      el.className = '';
      el.innerHTML = '';
      return;
    }
    migrateGmOnboardingFlags(G);
    var gm = G._gm;
    var cfg = gm.config || resolveGmConfig(G);
    var st = gm.fired ? 'fired' : gm.status;
    var kpis = computeGmKpis(G, cfg);
    var issue = biggestIssueSentence(kpis, cfg);
    var label = statusDisplayLabel(st);
    var nextShort = nextReviewShortLine(gm);
    var nextFull = nextReviewPhrase(G, gm);
    var priority = ownershipPrioritySentence(cfg);
    var owner = ownerTypeLabel(cfg.archetype);
    var glance = gmAtGlanceSummary(G);
    var pct = Math.max(0, Math.min(100, Math.round(gm.confidence)));

    el.className = 'wl-gm-panel--on wl-gm-panel--corp ' + securityClass(st);
    el.innerHTML =
      '<div class="wl-gm-panel-inner">' +
      '<div class="wl-gm-panel-hero">' +
      '<div class="wl-gm-panel-hero-main">' +
      '<div class="wl-gm-panel-eyebrow">Corporate oversight — General Manager</div>' +
      '<div class="wl-gm-panel-headline">' +
      '<span class="wl-gm-panel-pct">' +
      pct +
      '%</span>' +
      '<span class="wl-gm-panel-statuspill">' +
      escapeHtml(label.toUpperCase()) +
      '</span>' +
      '</div>' +
      '<div class="wl-gm-panel-meter" role="progressbar" aria-valuenow="' +
      pct +
      '" aria-valuemin="0" aria-valuemax="100" aria-label="Job security">' +
      '<div class="wl-gm-panel-meter-fill" style="width:' +
      pct +
      '%"></div>' +
      '</div>' +
      '<p class="wl-gm-panel-glance">' +
      escapeHtml(glance) +
      '</p>' +
      '</div>' +
      '<div class="wl-gm-panel-hero-side">' +
      '<div class="wl-gm-panel-grid wl-gm-panel-grid--compact">' +
      '<div><div class="wl-gm-panel-k">Next formal review</div><div class="wl-gm-panel-v wl-gm-panel-v--sm">' +
      escapeHtml(nextShort) +
      '</div></div>' +
      '<div><div class="wl-gm-panel-k">Owner type</div><div class="wl-gm-panel-v wl-gm-panel-v--sm">' +
      escapeHtml(owner) +
      '</div></div>' +
      '<div class="wl-gm-panel-grid-span2"><div class="wl-gm-panel-k">Ownership priority</div><p class="wl-gm-panel-priority">' +
      escapeHtml(priority) +
      '</p></div>' +
      '<div class="wl-gm-panel-grid-span2"><div class="wl-gm-panel-k">Biggest risk right now</div><p class="wl-gm-panel-issue wl-gm-panel-issue--tight">' +
      escapeHtml(issue) +
      '</p></div>' +
      '</div></div></div>' +
      '<div class="wl-gm-panel-reviewline">' +
      escapeHtml(nextFull) +
      '</div>' +
      '<div class="wl-gm-panel-actions">' +
      '<button type="button" class="wl-gm-panel-btn-primary" onclick="wlGmExplainReviews()">Corporate expectations</button>' +
      '<button type="button" onclick="wlGmOpenCurrentStanding()">Current standing</button>' +
      '</div></div>';

    if (gm.pendingReviewModal) {
      var payload = gm.pendingReviewModal;
      delete gm.pendingReviewModal;
      requestAnimationFrame(function () {
        fillGmReviewModal(payload, G);
        if (typeof global.om === 'function') global.om('m-gm-review');
      });
    }

    if (gm.pendingGmOnboarding === true && !gm.gmOnboardingSeen) {
      gm.pendingGmOnboarding = false;
      requestAnimationFrame(function () {
        var ob = document.getElementById('gm-onboardb');
        if (ob) ob.innerHTML = GM_ONBOARD_HTML;
        if (typeof global.om === 'function') global.om('m-gm-onboard');
      });
    }
  }

  /**
   * Headless diagnostics — read-only snapshot of GM state (Node harness / validate scripts).
   * Does not change formulas; surfaces the same fields the UI would read from G._gm.
   */
  function getDiagnosticsSnapshot(G) {
    if (!G || !G._gm) return null;
    var gm = G._gm;
    var cfg = gm.config || resolveGmConfig(G);
    var kpis = computeGmKpis(G, cfg);
    var periodsUntil =
      gm.nextReviewAt != null && gm.closedPeriods != null
        ? Math.max(0, gm.nextReviewAt - gm.closedPeriods)
        : null;
    var hist = gm.reviewHistory || [];
    var lastReview = hist.length ? hist[hist.length - 1] : null;
    return {
      confidence: Math.round(gm.confidence),
      status: gm.fired ? 'fired' : gm.status,
      closedPeriods: gm.closedPeriods,
      nextReviewAt: gm.nextReviewAt,
      periodsUntilReview: periodsUntil,
      reviewCount: hist.length,
      consecutiveMediocreReviews: gm.consecutiveMediocreReviews | 0,
      formalReviewsCompletedThisAssignment: gm.formalReviewsCompletedThisAssignment | 0,
      fired: !!gm.fired,
      lastReview: lastReview
        ? {
            year: lastReview.year,
            period: lastReview.period,
            good: !!(lastReview.eval && lastReview.eval.good),
            bad: !!(lastReview.eval && lastReview.eval.bad),
            efficiencyStress: lastReview.eval && lastReview.eval.se != null ? Math.round(lastReview.eval.se * 1000) / 1000 : null,
            confidenceBefore: lastReview.confidenceBefore,
            confidenceAfter: lastReview.confidenceAfter,
          }
        : null,
      biggestIssue: biggestIssueSentence(kpis, cfg),
      glanceSummary: gmAtGlanceSummary(G),
    };
  }

  /**
   * Deterministic self-test (no live G): validates KPI math and confidence moves.
   * Returns a plain object for console / harness.
   */
  function runSelfTest() {
    var G = {
      sc: { gmMode: true, gmOwnerArchetype: 'turnaround', gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4 } },
      year: 1971,
      period: 2,
      finHistory: [
        { year: 1970, period: 2, revenue: 100000, margin: 8 },
        { year: 1971, period: 1, revenue: 98000, margin: 7 },
        { year: 1971, period: 2, revenue: 96000, margin: 6 },
      ],
      ps: [
        {
          isPlayer: true,
          fin: { rev: 96000 },
          ops: { promo: 4000, progBudget: 3500 },
          talentFranchise: 0.5,
        },
      ],
      stations: [],
      news: [],
      score: {},
    };
    global.MP = { mode: 'solo' };
    try {
      initGmStateForGame(G);
      G._gm.pendingGmOnboarding = false;
      G._gm.gmOnboardingSeen = true;
      G._gm.franchiseSnapshots = [
        { year: 1970, period: 2, avg: 0.62 },
        { year: 1971, period: 1, avg: 0.58 },
        { year: 1971, period: 2, avg: 0.52 },
      ];
      G._gm.closedPeriods = 3;
      G._gm.nextReviewAt = 4;
      maybeRunGmReview(G);
      return {
        ok: true,
        confidence: G._gm.confidence,
        status: G._gm.status,
        fired: G._gm.fired,
        reviews: G._gm.reviewHistory.length,
      };
    } finally {
      try {
        delete global.MP;
      } catch (_e) {}
    }
  }

  global.wlGmDismissOnboarding = function () {
    if (typeof global.G !== 'undefined' && global.G && global.G._gm) {
      global.G._gm.gmOnboardingSeen = true;
      global.G._gm.pendingGmOnboarding = false;
    }
    if (typeof global.cm === 'function') global.cm('m-gm-onboard');
  };

  global.wlGmExplainReviews = function () {
    fillGmExplainerModal();
    if (typeof global.om === 'function') global.om('m-gm-explain');
  };

  global.wlGmOpenCurrentStanding = function () {
    var G = global.G;
    if (!G || !G._gm) return;
    fillGmCurrentStandingModal(G);
    if (typeof global.om === 'function') global.om('m-gm-review');
  };

  /** @deprecated use wlGmOpenCurrentStanding */
  global.wlGmOpenLastReview = global.wlGmOpenCurrentStanding;

  global.wlGmMode = {
    gmScenarioActive: gmScenarioActive,
    initGmStateForGame: initGmStateForGame,
    onPeriodClose: onPeriodClose,
    renderGmHeader: renderGmHeader,
    computeGmKpis: computeGmKpis,
    evaluateGmReview: evaluateGmReview,
    resolveGmConfig: resolveGmConfig,
    getGmStatusLabel: getGmStatusLabel,
    runSelfTest: runSelfTest,
    gmAtGlanceSummary: gmAtGlanceSummary,
    buildCampaignGmSummaryHtml: buildCampaignGmSummaryHtml,
    nextReviewPhrase: nextReviewPhrase,
    getDiagnosticsSnapshot: getDiagnosticsSnapshot,
  };
})(typeof window !== 'undefined' ? window : globalThis);
