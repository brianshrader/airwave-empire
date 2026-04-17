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
    goodReviewBonus: 11,
    badReviewPenalty: 14,
    repeatBadExtra: 9,
    marginSoftBand: 4,
  };

  var GM_ONBOARD_HTML =
    '<p style="margin-top:0">You are a General Manager working under ownership expectations.</p>' +
    '<p>You will be reviewed regularly based on:</p>' +
    '<ul style="margin:8px 0;padding-left:20px;line-height:1.55">' +
    '<li><strong>Profitability</strong></li>' +
    '<li><strong>Revenue performance</strong></li>' +
    '<li><strong>Long-term station strength</strong> (talent &amp; franchise health)</li>' +
    '</ul>' +
    '<p>Short-term gains can come at long-term cost. If performance declines, you can move from concern → warning → probation → termination.</p>';

  function gmScenarioActive(G) {
    var mp = typeof MP !== 'undefined' ? MP : null;
    return !!(G && G.sc && G.sc.gmMode && mp && mp.mode !== 'live');
  }

  function gmPlayerFinHistory(G) {
    return G.finHistory || [];
  }

  function weightedPlayerFranchise(G) {
    var ps =
      typeof global.myPS === 'function'
        ? global.myPS()
        : (G.ps || []).filter(function (s) {
            return s && s.isPlayer;
          });
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

    var revenueTrend = classifyTrend(revs, 0.015);
    var snap = (G._gm && G._gm.franchiseSnapshots) || [];
    var frVals = snap.slice(-T).map(function (x) {
      return x.avg;
    });
    var franchiseAvg = frVals.length ? frVals.reduce(function (a, b) {
      return a + b;
    }, 0) / frVals.length : weightedPlayerFranchise(G).avg;
    var franchiseTrend = frVals.length >= 2 ? classifyTrend(frVals, 0.008) : 'flat';

    if (marginAvg < cfg.minMarginPct) reasons.push('Profitability is below expectations');
    if (revenueTrend === 'declining') reasons.push('Revenue has been declining');
    if (franchiseTrend === 'declining') reasons.push('Long-term station strength is declining');
    if (franchiseAvg < cfg.minFranchiseAvg) reasons.push('Long-term competitiveness is below what ownership expects');

    return {
      marginAvg: Math.round(marginAvg * 10) / 10,
      revenueTrend: revenueTrend,
      franchiseAvg: Math.round(franchiseAvg * 1000) / 1000,
      franchiseTrend: franchiseTrend,
      sampleN: hist.length,
      reasons: reasons,
    };
  }

  function stressMargin(avgMargin, cfg) {
    if (avgMargin >= cfg.minMarginPct) return 0;
    if (avgMargin >= cfg.minMarginPct - (DEFAULT_GM.marginSoftBand || 4)) return 0.35;
    return Math.min(1, (cfg.minMarginPct - avgMargin) / 18);
  }

  function stressRevenue(trend, cfg) {
    if (trend === 'rising') return 0;
    if (trend === 'flat') return 0.18;
    return cfg.revenueDeclineStress;
  }

  function stressFranchise(avgFr, trend, cfg) {
    var s = 0;
    if (avgFr < cfg.minFranchiseAvg) s += 0.55;
    if (trend === 'declining') s += 0.45;
    else if (trend === 'flat' && avgFr < cfg.minFranchiseAvg + 0.04) s += 0.15;
    return Math.min(1, s);
  }

  function getGmStatusLabel(confidence, fired) {
    if (fired) return 'fired';
    if (confidence >= 62) return 'secure';
    if (confidence >= 48) return 'concern';
    if (confidence >= 32) return 'warning';
    if (confidence >= 18) return 'probation';
    return 'probation';
  }

  function evaluateGmReview(G, kpis, cfg) {
    var sm = stressMargin(kpis.marginAvg, cfg);
    var sr = stressRevenue(kpis.revenueTrend, cfg);
    var sf = stressFranchise(kpis.franchiseAvg, kpis.franchiseTrend, cfg);
    var composite = cfg.wProfit * sm + cfg.wRevenue * sr + cfg.wFranchise * sf;
    var good = composite < 0.22;
    var bad = composite > 0.52;
    return { sm: sm, sr: sr, sf: sf, composite: composite, good: good, bad: bad };
  }

  function applyGmConfidenceUpdate(G, evalRes, kpis, reasonsOut) {
    var gm = G._gm;
    var cfg = gm.config;
    var delta = 0;
    if (evalRes.good) {
      delta = DEFAULT_GM.goodReviewBonus;
      gm.consecutiveBadReviews = 0;
    } else if (evalRes.bad) {
      delta = -DEFAULT_GM.badReviewPenalty - (gm.consecutiveBadReviews || 0) * 3;
      gm.consecutiveBadReviews = (gm.consecutiveBadReviews || 0) + 1;
      if ((gm.consecutiveBadReviews || 0) >= 2) delta -= DEFAULT_GM.repeatBadExtra;
    } else {
      delta = evalRes.composite < 0.38 ? 4 : -4;
      gm.consecutiveBadReviews = 0;
    }
    gm.confidence = Math.max(0, Math.min(100, (gm.confidence || 0) + delta));
    reasonsOut.push('This review added pressure on profit, revenue trend, and long-term station strength.');

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

  function nextReviewPhrase(G, gm) {
    var nextN =
      gm.nextReviewAt != null && gm.closedPeriods != null ? Math.max(0, gm.nextReviewAt - gm.closedPeriods) : 0;
    if (nextN <= 0) return 'Next corporate review: due now (end of this period).';
    var years = nextN / 2;
    if (nextN % 2 === 0 && years >= 1) {
      return 'Next corporate review: in ' + (years === 1 ? '1 year' : years + ' years') + ' (' + nextN + ' periods).';
    }
    return 'Next corporate review: in ' + formatPeriodsAsTime(nextN) + '.';
  }

  function ownerTypeLabel(arch) {
    return OWNER_TYPE_LABEL[arch] || arch || '—';
  }

  function primaryFocusLabel(cfg) {
    var a = [
      { k: 'profit', w: cfg.wProfit },
      { k: 'revenue', w: cfg.wRevenue },
      { k: 'strength', w: cfg.wFranchise },
    ].sort(function (x, y) {
      return y.w - x.w;
    });
    if (a[0].k === 'profit') return 'Profit';
    if (a[0].k === 'revenue') return 'Revenue';
    return 'Long-term strength';
  }

  /** One plain sentence — pick dominant stress among margin / revenue / franchise (interpretation only). */
  function biggestIssueSentence(kpis, cfg) {
    var sm = stressMargin(kpis.marginAvg, cfg);
    var sr = stressRevenue(kpis.revenueTrend, cfg);
    var sf = stressFranchise(kpis.franchiseAvg, kpis.franchiseTrend, cfg);
    var maxS = Math.max(sm, sr, sf);
    if (maxS < 0.08) return 'No single issue is dominating — keep execution steady.';
    if (sm >= sr && sm >= sf && sm > 0.08) return 'Profitability is below expectations.';
    if (sr >= sm && sr >= sf && sr > 0.08) return 'Revenue has been declining.';
    return 'Long-term station strength is slipping.';
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
      fired: 'Dismissed',
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
    if (kpis.revenueTrend === 'rising') out.push('Revenue is trending up.');
    if (kpis.marginAvg >= cfg.minMarginPct) out.push('Profit margins are in line with ownership targets.');
    if (kpis.franchiseTrend !== 'declining' && kpis.franchiseAvg >= cfg.minFranchiseAvg - 0.03)
      out.push('Long-term station strength is holding.');
    if (ev.good) out.push('Corporate sees this cycle as meeting expectations.');
    if (out.length === 0) out.push('No major wins this cycle — steady operations.');
    return out.slice(0, 2);
  }

  function needsImprovementBullets(kpis, cfg) {
    var out = [];
    if (kpis.revenueTrend === 'declining') out.push('Revenue trend needs to turn around.');
    if (kpis.marginAvg < cfg.minMarginPct) out.push('Profitability is below expectations.');
    if (kpis.franchiseTrend === 'declining') out.push('Long-term station strength is declining.');
    if (kpis.franchiseAvg < cfg.minFranchiseAvg) out.push('Competitive position is weaker than ownership wants.');
    if (out.length === 0) out.push('Growth and consistency need more focus.');
    return out.slice(0, 2);
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
    if (st === 'concern') return 'You remain employed, but corporate has raised a formal concern — improve results.';
    if (st === 'warning') return 'You remain employed, but you are now under warning.';
    if (st === 'probation') return 'You remain employed on probation — the next review is critical.';
    return '—';
  }

  function fillGmReviewModal(entry, G) {
    var body = document.getElementById('gm-reviewb');
    if (!body || !entry) return;
    var cfg = (G && G._gm && G._gm.config) || resolveGmConfig(G || { sc: {} });
    var kpis = entry.kpis || {};
    var ev = entry.eval || { good: false, bad: false };
    var arch = cfg.archetype || 'turnaround';
    var good = goodBullets(kpis, ev, cfg);
    var bad = needsImprovementBullets(kpis, cfg);
    var season = entry.period === 2 ? 'Fall' : 'Spring';
    var sub =
      '<p style="margin:0 0 12px;font-size:13px;color:var(--mut)">' +
      escapeHtml(season + ' ' + entry.year + ' · Owner: ' + ownerTypeLabel(arch)) +
      '</p>';
    var statusLine = '<div class="wl-gm-sec"><h3>Status</h3><p style="margin:0">' + escapeHtml(statusDisplayLabel(entry.fired ? 'fired' : entry.status)) + '</p></div>';
    var well =
      '<div class="wl-gm-sec"><h3>What’s going well</h3><ul>' +
      good.map(function (x) {
        return '<li>' + escapeHtml(x) + '</li>';
      }).join('') +
      '</ul></div>';
    var imp =
      '<div class="wl-gm-sec"><h3>What needs improvement</h3><ul>' +
      bad.map(function (x) {
        return '<li>' + escapeHtml(x) + '</li>';
      }).join('') +
      '</ul></div>';
    var out = '<div class="wl-gm-sec"><h3>Outcome</h3><p style="margin:0">' + escapeHtml(outcomeNarrative(entry, cfg)) + '</p></div>';
    var gm = G && G._gm;
    var nextRev = gm ? nextReviewPhrase(G, gm) : '';
    var nextHtml =
      '<div class="wl-gm-sec"><h3>Next review</h3><p style="margin:0">' + escapeHtml(nextRev) + '</p></div>';
    body.innerHTML = sub + statusLine + well + imp + out + nextHtml;
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
      pendingGmOnboarding: true,
      gmOnboardingSeen: false,
    };
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
    if (G.tutorialMode || G.score.isSandbox || (G.year > 2020 && !G.continuesBeyondEnd)) return;
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

    var entry = {
      year: G.year,
      period: G.period,
      kpis: kpis,
      eval: { composite: ev.composite, good: ev.good, bad: ev.bad },
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
      var tag = ev.good
        ? 'Corporate review: results met expectations — job security improved.'
        : 'Corporate review: results missed expectations — job security took a hit.';
      G.news.unshift({ v: 'MEDIUM', t: '📋 ' + tag, y: G.year, p: G.period, iy: true });
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
    var nextLine = nextReviewPhrase(G, gm);
    var focus = primaryFocusLabel(cfg);
    var owner = ownerTypeLabel(cfg.archetype);

    el.className = 'wl-gm-panel--on ' + securityClass(st);
    el.innerHTML =
      '<div class="wl-gm-panel-title">GM STATUS</div>' +
      '<div class="wl-gm-panel-grid">' +
      '<div><div class="wl-gm-panel-k">Job security</div><div class="wl-gm-panel-v" style="color:var(--wht)">' +
      escapeHtml(label) +
      ' · ' +
      Math.round(gm.confidence) +
      '%</div></div>' +
      '<div><div class="wl-gm-panel-k">Next review</div><div class="wl-gm-panel-v" style="font-size:14px;font-weight:500">' +
      escapeHtml(nextLine.replace(/^Next corporate review:\s*/i, '')) +
      '</div></div>' +
      '<div><div class="wl-gm-panel-k">Owner type</div><div class="wl-gm-panel-v" style="font-size:15px">' +
      escapeHtml(owner) +
      '</div></div>' +
      '<div><div class="wl-gm-panel-k">Primary focus</div><div class="wl-gm-panel-v" style="font-size:15px">' +
      escapeHtml(focus) +
      '</div></div>' +
      '</div>' +
      '<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)"><div class="wl-gm-panel-k">Biggest issue</div>' +
      '<p class="wl-gm-panel-issue">' +
      escapeHtml(issue) +
      '</p></div>' +
      '<div class="wl-gm-panel-actions">' +
      '<button type="button" onclick="wlGmExplainReviews()">How reviews work</button>' +
      '<button type="button" onclick="wlGmOpenLastReview()">Last review</button>' +
      '</div>';

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
      ps: [{ isPlayer: true, fin: { rev: 96000 }, talentFranchise: 0.5 }],
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
    var ob = document.getElementById('gm-onboardb');
    if (ob) ob.innerHTML = GM_ONBOARD_HTML;
    if (typeof global.om === 'function') global.om('m-gm-onboard');
  };

  global.wlGmOpenLastReview = function () {
    var G = global.G;
    if (!G || !G._gm || !G._gm.reviewHistory || !G._gm.reviewHistory.length) {
      if (typeof global.showToast === 'function') global.showToast('No corporate review yet this game.', 'info');
      return;
    }
    var entry = G._gm.reviewHistory[G._gm.reviewHistory.length - 1];
    fillGmReviewModal(entry, G);
    if (typeof global.om === 'function') global.om('m-gm-review');
  };

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
  };
})(typeof window !== 'undefined' ? window : globalThis);
