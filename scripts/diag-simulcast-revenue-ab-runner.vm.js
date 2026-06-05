/**
 * VM runner — simulcast revenue A/B (CURRENT vs A vs D).
 * Exposes: globalThis.__wlRunSimulcastRevenueAb(config)
 */
(function () {
  'use strict';

  const VARIANTS = ['CURRENT', 'A', 'D'];

  function isCommercial(st) {
    return (
      st &&
      !st._bpSlotDeferred &&
      typeof stationIsNoncommercialInstitutional === 'function' &&
      !stationIsNoncommercialInstitutional(st)
    );
  }

  function pinShare(st, sh) {
    st.rat = st.rat || {};
    st.rat.share = sh;
    const cur = {};
    const cohorts = COH || [];
    for (let i = 0; i < cohorts.length; i++) {
      const c = cohorts[i];
      cur[c] = { aqh: Math.round(sh * 50000), share: sh };
    }
    st.rat.cur = cur;
    st.rat.aqh = cohorts.reduce((sum, c) => sum + (cur[c]?.aqh || 0), 0);
  }

  function finSnapshot(am, fm, G) {
    const combinedRev = (am.fin?.rev || 0) + (fm.fin?.rev || 0);
    const combinedCost = (am.fin?.cost || 0) + (fm.fin?.cost || 0);
    const combinedEbitda = (am.fin?.ebitda || 0) + (fm.fin?.ebitda || 0);
    const amRev = am.fin?.rev || 0;
    const fmRev = fm.fin?.rev || 0;
    return {
      amRev,
      fmRev,
      amEbitda: am.fin?.ebitda || 0,
      fmEbitda: fm.fin?.ebitda || 0,
      combinedRev,
      combinedCost,
      combinedEbitda,
      fmRevPctOfAm: amRev > 0 ? Math.round((fmRev / amRev) * 1000) / 10 : null,
      fmCostPctOfAm: (am.fin?.cost || 0) > 0
        ? Math.round(((fm.fin?.cost || 0) / am.fin.cost) * 1000) / 10
        : null,
      combinedSharePct: Math.round(
        (typeof stationCardSimulcastCombinedShare01 === 'function'
          ? stationCardSimulcastCombinedShare01(am, fm)
          : (am.rat?.share || 0) + (fm.rat?.share || 0)) * 1000,
      ) / 10,
      dupFrac: typeof fmAmCoownedDuplicateClockFraction01 === 'function'
        ? Math.round(fmAmCoownedDuplicateClockFraction01(fm, G) * 1000) / 10
        : null,
    };
  }

  function seededRandom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function withSeededRandom(seed, fn) {
    const prev = Math.random;
    Math.random = seededRandom(seed);
    try {
      return fn();
    } finally {
      Math.random = prev;
    }
  }

  function pickAmFm(G) {
    const comm = (G.stations || []).filter(isCommercial);
    const am = comm.find((s) => s.sig?.type === 'AM' && !s.fmBooster);
    const fm = comm.find((s) => s.sig?.type === 'FM' && !s.fmBooster && am && s.id !== am.id);
    if (!am || !fm) throw new Error('harness: need AM+FM commercial stations');
    return { am, fm, comm };
  }

  function setupPinnedPair(marketId, year, period, amSh, fmSh) {
    return withSeededRandom(wlHash32(`${marketId}|${year}|${period}|pinned`), () => {
      ACTIVE_MARKET = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      G = genMarketMP('1970');
      G.marketId = marketId;
      G.year = year;
      G.period = period;
      G.turn = (year - 1970) * 2 + (period === 2 ? 1 : 0);

      const { am, fm, comm } = pickAmFm(G);
      comm.forEach((s) => { if (s) s.isPlayer = false; });
      am.isPlayer = true;
      fm.isPlayer = true;
      am._mpOwner = 0;
      fm._mpOwner = 0;
      G.ps = [am, fm];

      breakSimulcast(G, am.id);
      breakSimulcast(G, fm.id);
      pinShare(am, amSh);
      pinShare(fm, fmSh);
      if (!am.ops) am.ops = { spots: 14, sell: 0.62, promo: 12000, progBudget: 8000 };
      if (!fm.ops) fm.ops = { spots: 14, sell: 0.45, promo: 8000, progBudget: 5000 };

      applySimulcastPair(am.id, fm.id, { suppressNews: true });
      comm.forEach((s) => calcRev(s, G));
      return { am, fm, comm };
    });
  }

  function runPinnedScenario(marketId, year, period, amSh, fmSh, variant) {
    globalThis.__wlSimulcastRevenueAbVariant = variant;
    const { am, fm } = setupPinnedPair(marketId, year, period, amSh, fmSh);
    if (variant === 'CURRENT' || variant === 'D') G._wlDisableSimulcastClusterAlloc = true;
    else delete G._wlDisableSimulcastClusterAlloc;
    seedRev(G.stations, G);
    return {
      marketId,
      year,
      period: period === 2 ? 'FALL' : 'SPRING',
      variant,
      amCall: am.callLetters,
      fmCall: fm.callLetters,
      amSharePct: Math.round((am.rat?.share || 0) * 1000) / 10,
      fmSharePct: Math.round((fm.rat?.share || 0) * 1000) / 10,
      maxDupPct: typeof getMaxSimulcastPctForMarket === 'function'
        ? getMaxSimulcastPctForMarket(year, marketId)
        : null,
      ...finSnapshot(am, fm, G),
    };
  }

  function ownershipKey(st) {
    if (!st || st.isPlayer) return 'player';
    if (st.corpOwner) return 'corp:' + st.corpOwner;
    if (st.aiLicenseeKey) return 'lic:' + st.aiLicenseeKey;
    return 'solo:' + st.id;
  }

  function findCoOwnedAmFmPairs(G) {
    const comm = (G.stations || []).filter(isCommercial);
    const byKey = new Map();
    comm.forEach((st) => {
      if (st.isPlayer) return;
      const k = ownershipKey(st);
      if (k.startsWith('solo:')) return;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(st);
    });
    const pairs = [];
    byKey.forEach((list, k) => {
      const ams = list.filter((s) => s.sig?.type === 'AM' && !s.fmBooster);
      const fms = list.filter((s) => s.sig?.type === 'FM' && !s.fmBooster);
      if (!ams.length || !fms.length) return;
      ams.sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
      fms.sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
      pairs.push({
        key: k,
        am: ams[0],
        fm: fms[0],
        amShare: ams[0].rat?.share || 0,
        fmShare: fms[0].rat?.share || 0,
      });
    });
    return pairs;
  }

  function cloneFin(st) {
    return {
      rev: st.fin?.rev || 0,
      cost: st.fin?.cost || 0,
      ebitda: st.fin?.ebitda || 0,
    };
  }

  function linkExplicitSimulcast(am, fm) {
    const wasPlayer = { am: am.isPlayer, fm: fm.isPlayer };
    am.isPlayer = true;
    fm.isPlayer = true;
    breakSimulcast(G, am.id);
    breakSimulcast(G, fm.id);
    const linked = applySimulcastPair(am.id, fm.id, { suppressNews: true });
    if (!linked) {
      am._simulcastSource = true;
      fm.simulcastSourceStationId = am.id;
      fm._simulcastSource = false;
      fm.simulcastWith = null;
      if (typeof initFmNonDupAfterPair === 'function') initFmNonDupAfterPair(am, fm, G);
    }
    am.isPlayer = wasPlayer.am;
    fm.isPlayer = wasPlayer.fm;
    return linked || fm.simulcastSourceStationId === am.id;
  }

  function evaluatePairModes(am, fm, G, variant) {
    globalThis.__wlSimulcastRevenueAbVariant = variant;
    if (variant === 'CURRENT' || variant === 'D') G._wlDisableSimulcastClusterAlloc = true;
    else delete G._wlDisableSimulcastClusterAlloc;

    breakSimulcast(G, am.id);
    breakSimulcast(G, fm.id);
    G.stations.forEach((s) => { if (s && (s.id === am.id || s.id === fm.id)) calcRev(s, G); });
    seedRev(G.stations, G);
    const separateAm = cloneFin(am);
    const separateFm = cloneFin(fm);
    const separateCombined = separateAm.ebitda + separateFm.ebitda;

    linkExplicitSimulcast(am, fm);
    G.stations.forEach((s) => { if (s && (s.id === am.id || s.id === fm.id)) calcRev(s, G); });
    seedRev(G.stations, G);
    const sim = finSnapshot(am, fm, G);

    const amOnlyEbitda = separateAm.ebitda;
    const simUplift = sim.combinedEbitda - separateCombined;
    const vsAmOnly = sim.combinedEbitda - amOnlyEbitda;
    const attractive = simUplift > 5000 && vsAmOnly > -35000;
    const mandatory = simUplift > 25000 && vsAmOnly > 5000;

    return {
      separateCombinedEbitda: separateCombined,
      amOnlyEbitda,
      simCombinedEbitda: sim.combinedEbitda,
      simUplift,
      vsAmOnly,
      fmRevPctOfAm: sim.fmRevPctOfAm,
      attractive,
      mandatory,
    };
  }

  function runAdoptionSurvey(marketId, year, variant) {
    return withSeededRandom(wlHash32(`${marketId}|${year}|adopt`), () => {
      ACTIVE_MARKET = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      G = genMarketMP('1970');
      G.marketId = marketId;
      G.year = year;
      G.period = 2;
      G.turn = (year - 1970) * 2 + 1;
      if (typeof recalc === 'function') recalc(G.stations, G);

      const pairs = findCoOwnedAmFmPairs(G);
      const legacyLinked = (G.stations || []).filter(isCommercial).filter((s) => {
        const q = fmAmNonDupQualifiedPair(s, G);
        return !!q;
      }).length;

      const results = pairs.slice(0, 12).map((p) => ({
        key: p.key,
        amCall: p.am.callLetters,
        fmCall: p.fm.callLetters,
        amSharePct: Math.round(p.amShare * 1000) / 10,
        fmSharePct: Math.round(p.fmShare * 1000) / 10,
        ...evaluatePairModes(p.am, p.fm, G, variant),
      }));

      const n = results.length;
      const attractiveN = results.filter((r) => r.attractive).length;
      const mandatoryN = results.filter((r) => r.mandatory).length;
      const medianFmRevPct = n
        ? results.map((r) => r.fmRevPctOfAm).sort((a, b) => a - b)[Math.floor(n / 2)]
        : null;

      return {
        marketId,
        year,
        variant,
        coOwnedPairCandidates: pairs.length,
        legacyFmAmPairsInMarket: legacyLinked,
        pairsEvaluated: n,
        pctAttractive: n ? Math.round((attractiveN / n) * 1000) / 10 : null,
        pctMandatory: n ? Math.round((mandatoryN / n) * 1000) / 10 : null,
        medianFmRevPctOfAm: medianFmRevPct,
        pairs: results,
      };
    });
  }

  globalThis.__wlRunSimulcastRevenueAb = function __wlRunSimulcastRevenueAb(config) {
    config = config || {};
    const markets = config.markets || ['chicago', 'atlanta', 'dallas'];
    const pinned = config.pinned || [
      { marketId: 'chicago', year: 1971, period: 2, amSh: 0.039, fmSh: 0.012, label: 'chicago_1971_fall_user_shares' },
      { marketId: 'chicago', year: 1971, period: 1, amSh: 0.046, fmSh: 0.011, label: 'chicago_1971_spring' },
      { marketId: 'chicago', year: 1970, period: 2, amSh: 0.049, fmSh: 0.011, label: 'chicago_1970_fall' },
    ];
    const adoptionYears = config.adoptionYears || [1971, 1975, 1980];

    const byVariant = {};
    VARIANTS.forEach((v) => {
      byVariant[v] = {
        pinned: {},
        adoption: {},
      };
    });

    VARIANTS.forEach((variant) => {
      pinned.forEach((sc) => {
        const row = runPinnedScenario(
          sc.marketId,
          sc.year,
          sc.period,
          sc.amSh,
          sc.fmSh,
          variant,
        );
        byVariant[variant].pinned[sc.label || `${sc.marketId}_${sc.year}_${sc.period}`] = row;
      });

      markets.forEach((mkt) => {
        adoptionYears.forEach((yr) => {
          const key = mkt + '_' + yr;
          byVariant[variant].adoption[key] = runAdoptionSurvey(mkt, yr, variant);
        });
      });
    });

    const baseline = byVariant.CURRENT.pinned.chicago_1971_fall_user_shares;
    const deltas = {};
    ['A', 'D'].forEach((v) => {
      const cur = byVariant[v].pinned.chicago_1971_fall_user_shares;
      if (!baseline || !cur) return;
      deltas[v] = {
        fmRevPctOfAmDelta: cur.fmRevPctOfAm - baseline.fmRevPctOfAm,
        fmEbitdaDelta: cur.fmEbitda - baseline.fmEbitda,
        combinedEbitdaDelta: cur.combinedEbitda - baseline.combinedEbitda,
        pctProblemFixedFmEbitda: baseline.fmEbitda < 0 && cur.fmEbitda > baseline.fmEbitda
          ? Math.round(
            Math.min(
              100,
              ((cur.fmEbitda - baseline.fmEbitda) / Math.abs(baseline.fmEbitda)) * 100,
            ),
          )
          : null,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      variants: VARIANTS,
      byVariant,
      chicago1971FallDeltasVsCurrent: deltas,
      notes: [
        'Pinned scenarios: explicit star-model simulcast, shares fixed, full seedRev path.',
        'Variant A uses production applySimulcastClusterRevenueAllocation (CURRENT/D disable via G._wlDisableSimulcastClusterAlloc).',
        'Variant D: skip FM revenue dedupe for explicit programming receivers only.',
        'Adoption survey: co-owned AI AM+FM pairs (corp or indie licensee); simulcast vs separate EBITDA.',
        'attractive = simulcast uplift > $5K and not worse than AM-only by > $35K; mandatory = uplift > $25K and beats AM-only by > $5K.',
      ],
    };
  };
})();
