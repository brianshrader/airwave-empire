/**
 * Longitudinal legend-pipeline audit — tier progression, cap/poach, bottlenecks.
 * globalThis.__wlRunLegendPipelineSim(config)
 */
(function () {
  'use strict';

  const SCENARIO_BY_START = { 1970: 'under', 1985: 'chrwar', 2000: 'harness2000' };
  const DRIVE_SLOTS = new Set(['morningDrive', 'afternoonDrive']);

  function ensureHarnessScenario() {
    if (typeof SC === 'undefined' || !Array.isArray(SC)) return;
    if (SC.some((s) => s.id === 'harness2000')) return;
    SC.push({
      id: 'harness2000',
      l: 'Harness 2000',
      d: 'Legend pipeline diagnostic',
      startYear: 2000,
      idx: [9],
      cash: 2200000,
      diff: 'MEDIUM',
      oqBoost: 0,
    });
  }

  function seededRandom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function stationBookRank(s, G) {
    try {
      if (typeof rankStationsByShareCompetition === 'function') {
        const rr = rankStationsByShareCompetition(G.stations || []);
        return rr.rankById?.[s.id] ?? null;
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  }

  function estSalaryCap(s, slot, t, G) {
    const mktId = G.marketId || ACTIVE_MARKET || 'atlanta';
    const share = s.rat?.share || 0;
    const sl = t.slot || slot;
    const hireY = t._hireYear != null ? t._hireYear : G.year;
    const tenureYrsForCap = Math.max(0, (G.year | 0) - hireY);
    const tenureCapMult = 1 + Math.min(0.18, Math.max(0, tenureYrsForCap - 12) * 0.012);
    const [capEl] =
      typeof eliteTalentIncumbentPremiumMults === 'function'
        ? eliteTalentIncumbentPremiumMults(t, sl, share)
        : [1, 1];
    const slotBx =
      typeof slotStarMaxBaseForDaypart === 'function' &&
      typeof marketRankTierOnAirPayMult === 'function'
        ? Math.round(slotStarMaxBaseForDaypart(sl) * marketRankTierOnAirPayMult(mktId))
        : 0;
    if (slotBx <= 0 || typeof salInfl !== 'function') return null;
    return Math.round(salInfl(slotBx, G.year) * tenureCapMult * capEl * 500) / 500;
  }

  function projectFallSalaryUncapped(s, slot, t, G) {
    const sl = t.slot || slot;
    const mktId = G.marketId || ACTIVE_MARKET || 'atlanta';
    const year = G.year | 0;
    const stShare = s.rat?.share || 0;
    let sal = t.salary | 0;
    if (sal <= 0) return sal;
    const baseInflation =
      typeof talentFallBaseInflationForMarket === 'function'
        ? talentFallBaseInflationForMarket(year, mktId)
        : 0.01;
    const tqMerit =
      typeof talentTrueQuality === 'function' ? talentTrueQuality(t) : t.quality | 0;
    const merit = tqMerit > 85 ? 0.008 : tqMerit > 72 ? 0.004 : 0.001;
    const perfPressure =
      typeof talentFallPerfPressureFromShare === 'function'
        ? talentFallPerfPressureFromShare(stShare, mktId)
        : 0;
    const levHost =
      typeof talentRenewalLeverage01 === 'function'
        ? talentRenewalLeverage01(s, sl, t, false)
        : 0;
    const levSal =
      levHost >= 0.44
        ? 0.0052
        : levHost >= 0.36
          ? 0.0036
          : levHost >= 0.3
            ? 0.0022
            : levHost >= 0.26
              ? 0.0011
              : 0;
    const moraleMod = (t.morale | 0) < 50 ? 0.004 : (t.morale | 0) > 80 ? -0.002 : 0;
    sal = Math.round(sal * (1 + baseInflation + merit + perfPressure + moraleMod + levSal) * 500) / 500;
    const [, floorElHost] =
      typeof eliteTalentIncumbentPremiumMults === 'function'
        ? eliteTalentIncumbentPremiumMults(t, sl, stShare)
        : [1, 1];
    const tenureYrs = Math.max(0, year - (t._hireYear != null ? t._hireYear : year));
    const tenurePrem = Math.min(0.1, Math.max(0, tenureYrs - 10) * 0.01);
    if (typeof incumbentSalaryFloorAnnual_v2 === 'function') {
      const flCore = incumbentSalaryFloorAnnual_v2(sl, tqMerit, mktId, year, s);
      const floor = Math.round(flCore * (1 + tenurePrem) * floorElHost * 500) / 500;
      if (sal < floor) sal = floor;
    }
    return sal;
  }

  function talentKey(t, s, slot) {
    if (t.id != null) return `id:${t.id}`;
    return `anon:${s.id}:${slot}:${t.name || ''}:${t._hireYear || 0}`;
  }

  function trueQ(t) {
    return typeof talentTrueQuality === 'function'
      ? talentTrueQuality(t)
      : typeof t._trueQuality === 'number'
        ? t._trueQuality
        : t.quality | 0;
  }

  function tenureYrsAtStation(t, year) {
    const hireY = t._hireYear != null ? t._hireYear : year;
    return Math.max(0, (year | 0) - hireY);
  }

  function marketQualityThreshold(G) {
    const qs = [];
    (G.stations || []).forEach((s) => {
      if (!s || s._bpSlotDeferred || s.isPublic) return;
      if (typeof stationIsNoncommercialInstitutional === 'function' && stationIsNoncommercialInstitutional(s)) {
        return;
      }
      Object.values(s.prog || {}).forEach((sd) => {
        if (!sd) return;
        const visit = (t) => {
          if (!t || !(t.salary > 0)) return;
          qs.push(trueQ(t));
        };
        if (sd.talent) visit(sd.talent);
        const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
        if (ch) visit(ch);
      });
    });
    if (qs.length < 5) return 75;
    qs.sort((a, b) => a - b);
    const idx = Math.floor(qs.length * 0.9);
    return qs[Math.min(idx, qs.length - 1)];
  }

  function marketSalaryMedian(G) {
    const sal = [];
    (G.stations || []).forEach((s) => {
      if (!s || s._bpSlotDeferred || s.isPublic) return;
      if (typeof stationIsNoncommercialInstitutional === 'function' && stationIsNoncommercialInstitutional(s)) {
        return;
      }
      Object.values(s.prog || {}).forEach((sd) => {
        if (!sd) return;
        const visit = (t) => {
          if (t && t.salary > 0) sal.push(t.salary);
        };
        if (sd.talent) visit(sd.talent);
        const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
        if (ch) visit(ch);
      });
    });
    if (!sal.length) return null;
    sal.sort((a, b) => a - b);
    const m = Math.floor(sal.length / 2);
    return sal.length % 2 ? sal[m] : Math.round((sal[m - 1] + sal[m]) / 2);
  }

  function stationSalaryMedian(s) {
    const sal = [];
    Object.values(s.prog || {}).forEach((sd) => {
      if (!sd) return;
      const visit = (t) => {
        if (t && t.salary > 0) sal.push(t.salary);
      };
      if (sd.talent) visit(sd.talent);
      const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
      if (ch) visit(ch);
    });
    if (!sal.length) return null;
    sal.sort((a, b) => a - b);
    const m = Math.floor(sal.length / 2);
    return sal.length % 2 ? sal[m] : Math.round((sal[m - 1] + sal[m]) / 2);
  }

  function isStar(tq, q90) {
    return tq >= 75 || tq >= q90;
  }

  function isEliteSnap(tq, slot, rank) {
    return tq >= 85 && DRIVE_SLOTS.has(slot) && rank != null && rank <= 5;
  }

  function isLegendCandSnap(tq, tenure, rank, share) {
    return tenure >= 10 && rank != null && rank <= 3 && share >= 0.08 && tq >= 85;
  }

  function isFranchiseSnap(rec, tq, tenure, rank, share) {
    const top3Yrs = (rec.periodsTop3 || 0) / 2;
    const poachOrCap = (rec.poachCoursings || 0) >= 2 || (rec.periodsAtCap || 0) >= 8;
    return (
      tenure >= 15 &&
      top3Yrs >= 10 &&
      (rec.maxShare || 0) >= 0.1 &&
      share >= 0.1 &&
      poachOrCap &&
      tq >= 90
    );
  }

  function newCareer(key, t, s, slot, year, mktId, rankTier) {
    return {
      key,
      talentId: t.id || null,
      name: t.name || '',
      marketId: mktId,
      rankTier,
      hireYear: year,
      firstStationId: s.id,
      everStar: false,
      everElite: false,
      everLegendCand: false,
      everFranchise: false,
      firstYearStar: null,
      firstYearElite: null,
      firstYearLegendCand: null,
      firstYearFranchise: null,
      fallSnapshots: 0,
      periodsTop3: 0,
      periodsTop5: 0,
      periodsRank1: 0,
      periodsTop3WhileTenure10: 0,
      maxTrueQ: 0,
      maxDisplayQ: 0,
      maxShare: 0,
      bestRank: null,
      maxTenureYrs: 0,
      maxSalary: 0,
      periodsAtCap: 0,
      periodsAboveCap: 0,
      everAtCap: false,
      everAboveCap: false,
      poachCoursings: 0,
      poachOfferPremiums: [],
      poachAttemptsPending: 0,
      stationMoves: 0,
      successfulPoachesOut: 0,
      declinedPoaches: 0,
      exitYear: null,
      exitReason: null,
      lastYear: year,
      lastSalary: 0,
      lastSlot: slot,
      lastStationId: s.id,
      lastBookRank: null,
      lastShare: 0,
      lastTenureYrs: 0,
      lastTrueQ: 0,
      lastMktSalMedian: null,
      lastStnSalMedian: null,
      lastUncappedFall: 0,
      _lastPoachCourtingTurn: t._poachLastCourtingTurn,
      _lastStationId: s.id,
      _pendingSeen: false,
      snapshots: [],
      startSlot: null,
      startCall: null,
      startRank: null,
      startShare: null,
      startDrive: null,
      startFormat: null,
      bornHighCeiling: false,
      firstYearTrueQ85: null,
      periodsAsHighQ: 0,
      periodsWeakPlatform: 0,
      periodsOutsideTop5: 0,
      periodsNonDrive: 0,
      periodsLegendPlatform: 0,
      fallsWhileStationTop3: 0,
      stationIdSet: {},
      maxBreakoutSteps: 0,
      departedBefore10yr: false,
      activeAtEnd: true,
    };
  }

  function classifyHighQLegendFailure(rec) {
    if (rec.everFranchise) return 'achieved_franchise';
    if (rec.everLegendCand) return 'achieved_legend_candidate';
    if (rec.exitYear != null && rec.maxTenureYrs < 10) {
      if ((rec.stationMoves || 0) > 0) return 'churned_before_10yr_poach_or_move';
      return 'churned_before_10yr';
    }
    if (rec.exitYear == null && rec.maxTenureYrs < 10) return 'still_active_under_10yr';
    const highQFalls = rec.periodsAsHighQ || 0;
    if (highQFalls > 0 && (rec.periodsNonDrive || 0) / highQFalls > 0.55) {
      return 'wrong_daypart_mostly_non_drive';
    }
    if (highQFalls > 0 && (rec.periodsWeakPlatform || 0) / highQFalls > 0.5) {
      return 'trapped_on_weak_station';
    }
    if ((rec.fallsWhileStationTop3 || 0) < 4) return 'station_never_top3_platform';
    if ((rec.maxShare || 0) < 0.08) return 'audience_share_gate';
    if ((rec.bestRank || 99) > 3) return 'station_rank_gate';
    if (rec.maxTenureYrs < 10) return 'tenure_gate';
    if ((rec.periodsTop3 || 0) / 2 < 10 && rec.maxTenureYrs >= 15) {
      return 'insufficient_years_top3';
    }
    if ((rec.poachCoursings || 0) >= 2 && (rec.stationMoves || 0) >= 1) {
      return 'poach_mobility_interrupt';
    }
    return classifyFirstLimiter(rec) || 'other';
  }

  function summarizeHighQCohort(tracker, totalCareers) {
    const rows = [...tracker.values()].filter((r) => (r.maxTrueQ || 0) >= 85);
    const n = rows.length;
    if (!n) {
      return { cohortSize: 0, pctOfAllCareers: 0, failureRanked: [], samples: [] };
    }
    const failureCounts = {};
    for (const r of rows) {
      const f = classifyHighQLegendFailure(r);
      failureCounts[f] = (failureCounts[f] || 0) + 1;
    }
    const failureRanked = Object.entries(failureCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([factor, count]) => ({
        factor,
        count,
        pctOfCohort: Math.round((count / n) * 1000) / 10,
      }));

    const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);
    const med = (arr) => {
      const x = arr.filter(Number.isFinite).sort((a, b) => a - b);
      if (!x.length) return null;
      const m = Math.floor(x.length / 2);
      return x.length % 2 ? x[m] : Math.round((x[m - 1] + x[m]) / 2);
    };

    const platformAligned = rows.filter(
      (r) =>
        r.startDrive &&
        (r.bestRank || 99) <= 5 &&
        (r.maxShare || 0) >= 0.06 &&
        r.maxTenureYrs >= 8,
    );

    const stationCounts = {};
    rows.forEach((r) => {
      const k = r.lastCall || r.startCall || '?';
      stationCounts[k] = (stationCounts[k] || 0) + 1;
    });
    const perStation = Object.values(stationCounts);
    const maxOnOneStation = perStation.length ? Math.max(...perStation) : 0;

    return {
      cohortSize: n,
      pctOfAllCareers: pct(n, totalCareers),
      startingPlatform: {
        pctStartDrive: pct(rows.filter((r) => r.startDrive).length, n),
        pctStartTop5: pct(rows.filter((r) => r.startRank != null && r.startRank <= 5).length, n),
        pctStartTop10: pct(rows.filter((r) => r.startRank != null && r.startRank <= 10).length, n),
        medianStartSharePct: med(rows.map((r) => Math.round((r.startShare || 0) * 1000) / 10)),
        pctBornHighCeiling: pct(rows.filter((r) => r.bornHighCeiling).length, n),
        pctBornBreakoutOnly: pct(
          rows.filter((r) => !r.bornHighCeiling && (r.maxBreakoutSteps || 0) > 0).length,
          n,
        ),
      },
      careerTrajectory: {
        medianCareerSpanYrs: med(rows.map((r) => (r.lastYear || r.hireYear) - r.hireYear)),
        pctActiveAtEnd: pct(rows.filter((r) => r.activeAtEnd).length, n),
        pctDepartedBefore10yr: pct(rows.filter((r) => r.departedBefore10yr).length, n),
        pctTenure5Plus: pct(rows.filter((r) => r.maxTenureYrs >= 5).length, n),
        pctTenure10Plus: pct(rows.filter((r) => r.maxTenureYrs >= 10).length, n),
        pctTenure15Plus: pct(rows.filter((r) => r.maxTenureYrs >= 15).length, n),
        pctWrongDaypartHighQ: pct(
          rows.filter(
            (r) =>
              (r.periodsAsHighQ || 0) > 0 &&
              (r.periodsNonDrive || 0) / Math.max(1, r.fallSnapshots || 1) > 0.55,
          ).length,
          n,
        ),
        pctEverTop3Station: pct(rows.filter((r) => (r.fallsWhileStationTop3 || 0) > 0).length, n),
        pctEverLegendPlatform: pct(rows.filter((r) => (r.periodsLegendPlatform || 0) > 0).length, n),
        medianStationMoves: med(rows.map((r) => r.stationMoves || 0)),
        medianPoachCoursings: med(rows.map((r) => r.poachCoursings || 0)),
        pctEverElite: pct(rows.filter((r) => r.everElite).length, n),
        pctEverLegendCand: pct(rows.filter((r) => r.everLegendCand).length, n),
        pctEverFranchise: pct(rows.filter((r) => r.everFranchise).length, n),
      },
      platformAlignment: {
        pctWithStrongPlatform: pct(platformAligned.length, n),
        pctScatteredWeak: pct(
          rows.filter(
            (r) =>
              (r.periodsAsHighQ || 0) > 0 &&
              (r.periodsWeakPlatform || 0) / r.periodsAsHighQ > 0.5,
          ).length,
          n,
        ),
        maxHighQOnOneStationLabel: maxOnOneStation,
        medianStationsWorked: med(
          rows.map((r) => Object.keys(r.stationIdSet || {}).length),
        ),
      },
      failureRanked,
      samples: rows
        .sort((a, b) => b.maxTrueQ - a.maxTrueQ || b.maxTenureYrs - a.maxTenureYrs)
        .slice(0, 20)
        .map((r) => ({
          name: r.name,
          maxTrueQ: Math.round(r.maxTrueQ * 10) / 10,
          startCall: r.startCall,
          startSlot: r.startSlot,
          startRank: r.startRank,
          bestRank: r.bestRank,
          maxSharePct: Math.round((r.maxShare || 0) * 1000) / 10,
          maxTenureYrs: r.maxTenureYrs,
          stationMoves: r.stationMoves || 0,
          everLegendCand: r.everLegendCand,
          legendFailure: classifyHighQLegendFailure(r),
          activeAtEnd: r.activeAtEnd,
        })),
    };
  }

  function classifyFirstLimiter(rec) {
    if (rec.everLegendCand) return null;
    const maxQ = rec.maxTrueQ || 0;
    const maxTen = rec.maxTenureYrs || 0;
    if (maxQ < 85) return 'quality_trueQ_below_85';
    if (maxTen < 10) {
      if (rec.exitReason === 'poaching_departure') return 'poaching_departure';
      if (rec.exitReason === 'retirement' || rec.exitReason === 'departed') return 'retirement';
      return 'tenure';
    }
    for (const snap of rec.snapshots || []) {
      if (snap.tq < 85 || snap.tenure < 10) continue;
      if (snap.rank != null && snap.rank <= 3 && snap.share >= 0.08) return null;
      if (snap.rank == null || snap.rank > 3) return 'station_rank';
      if (snap.share < 0.08) return 'audience_share';
      if (snap.atCap && snap.suppressed) return 'salary_cap';
      return 'station_rank';
    }
    if (rec.exitReason === 'poaching_departure') return 'poaching_departure';
    if (rec.exitReason === 'retirement' || rec.exitReason === 'departed') return 'retirement';
    if ((rec.bestRank || 99) > 3) return 'station_rank';
    if ((rec.maxShare || 0) < 0.08) return 'audience_share';
    if (rec.everAtCap && rec.periodsAtCap >= 4) return 'salary_cap';
    if (rec.rankTier === 'small' || rec.rankTier === 'medium') return 'market_size';
    return 'station_rank';
  }

  function oqBucket(oq) {
    const q = Math.round(Number(oq) || 0);
    if (q < 50) return 'lt50';
    if (q < 60) return '50-59';
    if (q < 70) return '60-69';
    if (q < 80) return '70-79';
    if (q < 90) return '80-89';
    if (q < 95) return '90-94';
    return '95-99';
  }

  function isCommercialStation(st) {
    return (
      st &&
      !st._bpSlotDeferred &&
      !st.isPublic &&
      typeof stationIsNoncommercialInstitutional === 'function' &&
      !stationIsNoncommercialInstitutional(st)
    );
  }

  function snapshotEconomy(Gopt) {
    const buckets = {};
    let n = 0;
    let sumOq = 0;
    let zombieLike = 0;
    let spiralLike = 0;
    const margins = [];
    const shares = [];
    let playerStations = 0;
    let playerZombie = 0;
    (Gopt.stations || []).forEach((st) => {
      if (!isCommercialStation(st)) return;
      const oq = Math.round(st.oq || 0);
      const share = st.rat?.share || 0;
      const b = oqBucket(oq);
      buckets[b] = (buckets[b] || 0) + 1;
      n += 1;
      sumOq += oq;
      shares.push(share);
      if (st.isZombie || st.isNicheSurvival || share < 0.008) zombieLike += 1;
      if (share < 0.015 && oq < 50) spiralLike += 1;
      const rev = st.fin?.rev || 0;
      const ebitda =
        typeof st.fin?.ebitda === 'number' ? st.fin.ebitda : rev - (st.fin?.cost || 0);
      if (rev > 0) margins.push(ebitda / rev);
      if (st.isPlayer) {
        playerStations += 1;
        if (st.isZombie || st.isNicheSurvival) playerZombie += 1;
      }
    });
    const hhi = shares.reduce((a, sh) => a + sh * sh, 0) * 10000;
    return {
      commercialCount: n,
      meanOq: n ? Math.round((sumOq / n) * 100) / 100 : null,
      pct9599: n ? Math.round(((buckets['95-99'] || 0) / n) * 10000) / 100 : 0,
      medianEbitdaMargin: (() => {
        const m = margins.map((x) => Math.round(x * 1000) / 10).sort((a, b) => a - b);
        if (!m.length) return null;
        const i = Math.floor(m.length / 2);
        return m.length % 2 ? m[i] : Math.round((m[i - 1] + m[i]) / 2);
      })(),
      hhi: Math.round(hhi),
      zombieLike,
      spiralLike,
      soloBankrupt: !!(Gopt._soloBankrupt),
      playerStations,
      playerZombie,
    };
  }

  function scanFall(G, tracker, prevPlacement, stationTracker, pendingHighQExit, cohortMode) {
    const mktId = G.marketId || ACTIVE_MARKET || 'atlanta';
    const mkt = (typeof MARKETS !== 'undefined' && MARKETS[mktId]) || {};
    const rankTier = mkt.rankTier || 'medium';
    const year = G.year | 0;
    const q90 = marketQualityThreshold(G);
    const mktMed = marketSalaryMedian(G);
    const placementNow = new Map();
    let rankById = {};
    try {
      if (typeof rankStationsByShareCompetition === 'function') {
        const rr = rankStationsByShareCompetition(G.stations || []);
        rankById = rr.rankById || {};
      }
    } catch (_e) {
      rankById = {};
    }

    const fallHighQByStation = new Map();

    (G.stations || []).forEach((s) => {
      if (!s || s._bpSlotDeferred) return;
      if (typeof stationIsNoncommercialInstitutional === 'function' && stationIsNoncommercialInstitutional(s)) {
        return;
      }
      if (s.isPublic) return;
      const bookRank = rankById[s.id] ?? stationBookRank(s, G);
      const share = s.rat?.share || 0;
      const stnMed = stationSalaryMedian(s);
      const pending = s._rivalPoachPending;
      let stationHasHighQ = false;

      function visit(t, slot, isCoHost) {
        if (!t || !(t.salary > 0)) return;
        const key = talentKey(t, s, slot);
        const tq = trueQ(t);
        if (tq >= 85) stationHasHighQ = true;
        const tenure = tenureYrsAtStation(t, year);
        const isDrive = DRIVE_SLOTS.has(slot);
        const cap = estSalaryCap(s, slot, t, G);
        const atCap = cap != null && t.salary >= cap * 0.98 && t.salary <= cap * 1.02;
        const aboveCap = cap != null && t.salary > cap * 1.02;
        const uncapped = projectFallSalaryUncapped(s, slot, t, G);
        const suppressed = atCap && uncapped > (cap || 0) * 1.02;

        let rec = tracker.get(key);
        if (!rec) {
          rec = newCareer(key, t, s, slot, year, mktId, rankTier);
          tracker.set(key, rec);
        }
        rec.fallSnapshots += 1;
        rec.lastYear = year;
        rec.lastSalary = t.salary | 0;
        rec.lastSlot = t.slot || slot;
        rec.lastStationId = s.id;
        rec.lastBookRank = bookRank;
        rec.lastShare = share;
        rec.lastTenureYrs = tenure;
        rec.lastTrueQ = Math.round(tq * 10) / 10;
        rec.lastMktSalMedian = mktMed;
        rec.lastStnSalMedian = stnMed;
        rec.lastUncappedFall = uncapped;
        const dispQ = t.quality | 0;
        rec.maxTrueQ = Math.max(rec.maxTrueQ, tq);
        rec.maxDisplayQ = Math.max(rec.maxDisplayQ, dispQ);
        rec.maxShare = Math.max(rec.maxShare, share);
        rec.maxTenureYrs = Math.max(rec.maxTenureYrs, tenure);
        rec.maxSalary = Math.max(rec.maxSalary, t.salary | 0);
        if (bookRank != null) {
          rec.bestRank = rec.bestRank == null ? bookRank : Math.min(rec.bestRank, bookRank);
          if (bookRank <= 3) rec.periodsTop3 += 1;
          if (bookRank <= 5) rec.periodsTop5 += 1;
          if (bookRank === 1) rec.periodsRank1 += 1;
          if (bookRank <= 3 && tenure >= 10) rec.periodsTop3WhileTenure10 += 1;
        }
        if (atCap) {
          rec.periodsAtCap += 1;
          rec.everAtCap = true;
        }
        if (aboveCap) {
          rec.periodsAboveCap += 1;
          rec.everAboveCap = true;
        }

        const prev = prevPlacement.get(key);
        if (prev && prev.stationId !== s.id) {
          rec.stationMoves += 1;
          if (t.salary > (prev.salary || 0) * 1.15) rec.successfulPoachesOut += 1;
        }

        if (
          pending &&
          pending.talentId != null &&
          t.id != null &&
          String(pending.talentId) === String(t.id)
        ) {
          rec.poachAttemptsPending += 1;
          if (!rec._pendingSeen) {
            rec.poachCoursings += 1;
            rec._pendingSeen = true;
          }
          if (pending.offerSalary > 0 && t.salary > 0) {
            rec.poachOfferPremiums.push(
              Math.round(((pending.offerSalary / t.salary - 1) * 100) * 10) / 10,
            );
          }
        } else {
          rec._pendingSeen = false;
        }

        const courtingTurn = t._poachLastCourtingTurn;
        if (
          Number.isFinite(courtingTurn) &&
          courtingTurn !== rec._lastPoachCourtingTurn &&
          (G.turn | 0) === courtingTurn
        ) {
          rec.poachCoursings += 1;
        }
        rec._lastPoachCourtingTurn = courtingTurn;

        const star = isStar(tq, q90);
        const elite = isEliteSnap(tq, slot, bookRank);
        const legend = isLegendCandSnap(tq, tenure, bookRank, share);
        if (star && !rec.everStar) {
          rec.everStar = true;
          rec.firstYearStar = year;
        }
        if (elite && !rec.everElite) {
          rec.everElite = true;
          rec.firstYearElite = year;
        }
        if (legend && !rec.everLegendCand) {
          rec.everLegendCand = true;
          rec.firstYearLegendCand = year;
        }
        if (isFranchiseSnap(rec, tq, tenure, bookRank, share) && !rec.everFranchise) {
          rec.everFranchise = true;
          rec.firstYearFranchise = year;
        }

        if (cohortMode) {
          if (rec.startSlot == null) {
            rec.startSlot = slot;
            rec.startCall = s.callLetters || '';
            rec.startRank = bookRank;
            rec.startShare = share;
            rec.startDrive = isDrive;
            rec.startFormat = s.format || null;
            rec.bornHighCeiling = !!t._legendAbHighCeiling;
          }
          rec.stationIdSet[s.id] = (rec.stationIdSet[s.id] || 0) + 1;
          if (bookRank != null && bookRank <= 3) rec.fallsWhileStationTop3 += 1;
          if (bookRank == null || bookRank > 10 || share < 0.03) rec.periodsWeakPlatform += 1;
          if (bookRank == null || bookRank > 5) rec.periodsOutsideTop5 += 1;
          if (!isDrive) rec.periodsNonDrive += 1;
          if (tq >= 85) {
            rec.periodsAsHighQ += 1;
            if (rec.firstYearTrueQ85 == null) rec.firstYearTrueQ85 = year;
            if (bookRank != null && bookRank <= 3 && share >= 0.08) {
              rec.periodsLegendPlatform += 1;
            }
          }
          rec.maxBreakoutSteps = Math.max(rec.maxBreakoutSteps || 0, t._legendAbBreakoutSteps || 0);
          if (!rec.bornHighCeiling && t._legendAbHighCeiling) rec.bornHighCeiling = true;
        }

        if ((rec.snapshots || []).length < 80) {
          rec.snapshots.push({
            year,
            tq,
            tenure,
            rank: bookRank,
            share,
            atCap,
            suppressed,
          });
        }

        placementNow.set(key, {
          stationId: s.id,
          slot,
          salary: t.salary,
          call: s.callLetters || '',
        });
      }

      Object.entries(s.prog || {}).forEach(([slot, sd]) => {
        if (!sd) return;
        if (sd.talent) visit(sd.talent, slot, false);
        const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
        if (ch) visit(ch, slot, true);
      });

      if (stationTracker) {
        fallHighQByStation.set(s.id, stationHasHighQ);
        let st = stationTracker.get(s.id);
        if (!st) {
          st = { withHigh: [], withoutHigh: [], identityPeaks: [] };
          stationTracker.set(s.id, st);
        }
        if (stationHasHighQ) st.withHigh.push(share);
        else st.withoutHigh.push(share);
        if (typeof s.identity === 'number') st.identityPeaks.push(s.identity);
        if (typeof s._identityPeak === 'number') st.identityPeaks.push(s._identityPeak);
      }
    });

    if (pendingHighQExit && pendingHighQExit.length) {
      for (let i = 0; i < pendingHighQExit.length; i++) {
        const ev = pendingHighQExit[i];
        if (ev.resolved) continue;
        const sh =
          (G.stations || []).find((x) => x.id === ev.stationId)?.rat?.share || 0;
        ev.shareAfter = sh;
        ev.drop = Math.round((ev.shareBefore - sh) * 1000) / 10;
        ev.resolved = true;
      }
    }

    prevPlacement.forEach((prev, key) => {
      if (placementNow.has(key)) return;
      const rec = tracker.get(key);
      if (!rec || rec.exitYear != null) return;
      rec.exitYear = year;
      rec.activeAtEnd = false;
      if ((rec.stationMoves || 0) > 0) rec.exitReason = 'poached_or_moved';
      else rec.exitReason = 'departed';
      if (rec.maxTenureYrs < 10) rec.departedBefore10yr = true;
      if (pendingHighQExit && rec.maxTrueQ >= 85) {
        pendingHighQExit.push({
          stationId: rec.lastStationId,
          shareBefore: rec.lastShare || 0,
          year,
          resolved: false,
        });
      }
    });

    return placementNow;
  }

  globalThis.__wlRunLegendPipelineSim = function runSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear || 1970;
    const years = config.years || 32;
    const seed = config.seed >>> 0;
    const endYear = startYear + years;
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const cohortMode = !!config.cohortMode;
    const summary = {
      marketId,
      startYear,
      endYear,
      seed,
      variant: config.variant || 'A',
      ok: false,
      periods: 0,
      careers: [],
    };

    try {
      if (typeof wlLegendAbSetVariant === 'function') {
        wlLegendAbSetVariant(config.variant || 'A');
      }
      ensureHarnessScenario();
      ACTIVE_MARKET = marketId;
      _selectedMarket = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      const scen = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
      G = genMarket(scen);
      G.marketId = marketId;
      G.tutorialMode = false;
      G.cash = Math.max(G.cash || 0, 8000000);
      if (typeof recalc === 'function') recalc(G.stations, G);
      if (typeof seedRev === 'function') seedRev(G.stations, G);

      const tracker = new Map();
      const stationTracker = new Map();
      const pendingHighQExit = [];
      let prevPlacement = new Map();
      const maxSteps = years * 2 + 4;

      for (let step = 0; step < maxSteps && G.year < endYear; step++) {
        advTurn();
        if ((G.cash || 0) < 200000) G.cash = 8000000;
        if ((G.period | 0) === 2) {
          prevPlacement = scanFall(
            G,
            tracker,
            prevPlacement,
            stationTracker,
            pendingHighQExit,
            cohortMode,
          );
        }
        summary.periods += 1;
      }

      const shareLifts = [];
      const identityPeaks = [];
      stationTracker.forEach((st) => {
        if (st.withHigh.length && st.withoutHigh.length) {
          const wh =
            st.withHigh.reduce((a, b) => a + b, 0) / st.withHigh.length;
          const wo =
            st.withoutHigh.reduce((a, b) => a + b, 0) / st.withoutHigh.length;
          shareLifts.push(wh - wo);
        }
        if (st.identityPeaks.length) {
          identityPeaks.push(Math.max(...st.identityPeaks));
        }
      });
      const departureDrops = pendingHighQExit
        .filter((e) => e.drop != null && e.drop > 0)
        .map((e) => e.drop);
      summary.stationImpact = {
        avgShareLiftHighQ:
          shareLifts.length
            ? Math.round((shareLifts.reduce((a, b) => a + b, 0) / shareLifts.length) * 1000) /
              10
            : null,
        avgReplacementShareDrop: (() => {
          if (!departureDrops.length) return null;
          departureDrops.sort((a, b) => a - b);
          const m = Math.floor(departureDrops.length / 2);
          return departureDrops.length % 2
            ? departureDrops[m]
            : Math.round((departureDrops[m - 1] + departureDrops[m]) / 2);
        })(),
        highQDepartures: pendingHighQExit.length,
        avgIdentityPeakHighQ: (() => {
          if (!identityPeaks.length) return null;
          identityPeaks.sort((a, b) => a - b);
          const m = Math.floor(identityPeaks.length / 2);
          return identityPeaks.length % 2
            ? identityPeaks[m]
            : Math.round((identityPeaks[m - 1] + identityPeaks[m]) / 2);
        })(),
      };
      summary.endEconomy = snapshotEconomy(G);

      summary.careers = [...tracker.values()].map((rec) => {
        const hireY = rec.hireYear;
        const yearsTo = (fy) => (fy != null ? fy - hireY : null);
        const avgPoachPrem =
          rec.poachOfferPremiums.length > 0
            ? Math.round(
                (rec.poachOfferPremiums.reduce((a, b) => a + b, 0) / rec.poachOfferPremiums.length) *
                  10,
              ) / 10
            : null;
        const mktMed = rec.lastMktSalMedian || 1;
        const stnMed = rec.lastStnSalMedian || 1;
        const sal = rec.lastSalary || 0;
        const capBoundYrs = Math.round((rec.periodsAtCap || 0) / 2);
        const firstLimiter = classifyFirstLimiter(rec);
        const franchiseBlockers = [];
        if (rec.everLegendCand && !rec.everFranchise) {
          if (rec.maxTenureYrs < 15) franchiseBlockers.push('tenure_lt_15');
          if ((rec.periodsTop3 || 0) / 2 < 10) franchiseBlockers.push('top3_years_lt_10');
          if ((rec.maxShare || 0) < 0.1) franchiseBlockers.push('share_lt_10');
          if ((rec.maxTrueQ || 0) < 90) franchiseBlockers.push('trueQ_lt_90');
          if ((rec.poachCoursings || 0) < 2 && (rec.periodsAtCap || 0) < 8) {
            franchiseBlockers.push('no_poach_or_cap_history');
          }
        }
        return {
          key: rec.key,
          talentId: rec.talentId,
          name: rec.name,
          marketId: rec.marketId,
          rankTier: rec.rankTier,
          hireYear: hireY,
          careerSpanYrs: (rec.lastYear || hireY) - hireY,
          fallSnapshots: rec.fallSnapshots,
          everStar: rec.everStar,
          everElite: rec.everElite,
          everLegendCand: rec.everLegendCand,
          everFranchise: rec.everFranchise,
          yearsToStar: yearsTo(rec.firstYearStar),
          yearsToElite: yearsTo(rec.firstYearElite),
          yearsToLegendCand: yearsTo(rec.firstYearLegendCand),
          yearsToFranchise: yearsTo(rec.firstYearFranchise),
          maxTrueQ: Math.round(rec.maxTrueQ * 10) / 10,
          maxDisplayQ: rec.maxDisplayQ | 0,
          maxSharePct: Math.round((rec.maxShare || 0) * 1000) / 10,
          bestRank: rec.bestRank,
          maxTenureYrs: rec.maxTenureYrs,
          periodsTop3: rec.periodsTop3,
          periodsRank1: rec.periodsRank1,
          yearsTop3: Math.round((rec.periodsTop3 || 0) / 2),
          yearsAtRank1: Math.round((rec.periodsRank1 || 0) / 2),
          maxSalary: rec.maxSalary,
          lastSalary: sal,
          salaryMultMktMedian: mktMed > 0 ? Math.round((sal / mktMed) * 100) / 100 : null,
          salaryMultStnMedian: stnMed > 0 ? Math.round((sal / stnMed) * 100) / 100 : null,
          everAtCap: rec.everAtCap,
          everAboveCap: rec.everAboveCap,
          periodsAtCap: rec.periodsAtCap,
          capBoundYears: capBoundYrs,
          lastUncappedFall: rec.lastUncappedFall,
          poachCoursings: rec.poachCoursings,
          poachAttemptsPending: rec.poachAttemptsPending,
          avgPoachOfferPremiumPct: avgPoachPrem,
          stationMoves: rec.stationMoves,
          successfulPoachesOut: rec.successfulPoachesOut,
          exitYear: rec.exitYear,
          exitReason: rec.exitReason,
          lastBookRank: rec.lastBookRank,
          lastSharePct: Math.round((rec.lastShare || 0) * 1000) / 10,
          lastTenureYrs: rec.lastTenureYrs,
          lastSlot: rec.lastSlot,
          firstLimiter,
          franchiseBlockers,
        };
      });
      const maxTrueQs = summary.careers.map((c) => c.maxTrueQ).filter(Number.isFinite);
      maxTrueQs.sort((a, b) => a - b);
      summary.trueQCeiling = {
        maxObserved: maxTrueQs.length ? maxTrueQs[maxTrueQs.length - 1] : null,
        p90: maxTrueQs.length ? maxTrueQs[Math.floor(maxTrueQs.length * 0.9)] : null,
        pctReach75: maxTrueQs.length
          ? Math.round((maxTrueQs.filter((q) => q >= 75).length / maxTrueQs.length) * 1000) / 10
          : 0,
        pctReach85: maxTrueQs.length
          ? Math.round((maxTrueQs.filter((q) => q >= 85).length / maxTrueQs.length) * 1000) / 10
          : 0,
        pctReach90: maxTrueQs.length
          ? Math.round((maxTrueQs.filter((q) => q >= 90).length / maxTrueQs.length) * 1000) / 10
          : 0,
        note: 'QRG hire bands cap initial _trueQuality (star tier ≤82); Fall growth caps at 94 but churn/decay limits observed max in cold sims.',
      };
      summary.careerCount = summary.careers.length;
      if (cohortMode) {
        summary.highQCohort = summarizeHighQCohort(tracker, summary.careerCount);
      }
      if (G && G._wlPlatformDiag) {
        summary.platformDiag = { ...G._wlPlatformDiag };
      }
      summary.ok = true;
      summary.endYear = G.year;
    } catch (e) {
      summary.error = String(e && e.message ? e.message : e);
    } finally {
      Math.random = origRand;
    }
    return summary;
  };
})();
