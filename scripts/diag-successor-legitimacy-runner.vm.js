/**
 * VM runner — successor legitimacy study (replacement type + J1/P variants).
 * Exposes: globalThis.__wlRunSuccessorLegitimacy(config)
 */
(function () {
  'use strict';

  const SCENARIO_BY_START = {
    1970: 'under',
    1985: 'chrwar',
    2000: 'harness2000',
  };

  const BUCKET_ORDER = ['lt50', '50-59', '60-69', '70-79', '80-89', '90-94', '95-99'];
  const DAYPARTS = ['morningDrive', 'afternoonDrive', 'midday', 'evening', 'overnight'];

  function ensureHarnessScenarios() {
    if (typeof SC === 'undefined' || !Array.isArray(SC)) return;
    if (!SC.some((s) => s.id === 'harness2000')) {
      SC.push({
        id: 'harness2000',
        l: 'Harness 2000',
        d: 'Diagnostic cold start at 2000.',
        startYear: 2000,
        idx: [9],
        cash: 2200000,
        diff: 'MEDIUM',
        oqBoost: 0,
      });
    }
  }

  function seededRandom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function isCommercial(st) {
    return (
      st &&
      !st._bpSlotDeferred &&
      typeof stationIsNoncommercialInstitutional === 'function' &&
      !stationIsNoncommercialInstitutional(st)
    );
  }

  function commercialStations(G) {
    return (G.stations || []).filter(isCommercial);
  }

  function ownershipType(st) {
    if (st.isPlayer) return 'player';
    if (st.corpOwner) return 'corporate';
    return 'independent';
  }

  function periodIndex(y, p) {
    return (y | 0) * 2 + ((p | 0) === 2 ? 1 : 0);
  }

  function yearsBetween(fromY, fromP, toY, toP) {
    return (periodIndex(toY, toP) - periodIndex(fromY, fromP)) / 2;
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

  function emptyBucketCounts() {
    const o = {};
    BUCKET_ORDER.forEach((b) => {
      o[b] = 0;
    });
    return o;
  }

  function snapMorning(st) {
    const sd = st.prog?.morningDrive;
    if (!sd) return null;
    return {
      talentId: sd.talent?.id != null ? String(sd.talent.id) : null,
      talentName: sd.talent?.name || '',
      talentQ: sd.talent ? sd.talent.quality | 0 : null,
      talentSuperstar: sd.talent?.superstar === true,
      slotQ: Math.round(sd.quality || 0),
      tenurePeriods: sd.talent ? sd.talent.periodsAtStation | 0 : 0,
      rev: Math.round(st.fin?.rev || 0),
      share: st.rat?.share || 0,
    };
  }

  function snapStationTalents(st) {
    const map = new Map();
    for (const sl of DAYPARTS) {
      const sd = st.prog?.[sl];
      if (!sd?.talent || sd.talent.id == null) continue;
      const id = String(sd.talent.id);
      map.set(id, {
        slot: sl,
        slotQ: Math.round(sd.quality || 0),
        tenure: sd.talent.periodsAtStation | 0,
        talentQ: sd.talent.quality | 0,
        talentName: sd.talent.name || '',
      });
    }
    return map;
  }

  function buildClusterTalentIndex(G) {
    const byOwner = new Map();
    for (const st of commercialStations(G)) {
      const owner = st.corpOwner ? String(st.corpOwner) : null;
      if (!owner) continue;
      if (!byOwner.has(owner)) byOwner.set(owner, new Map());
      const ownerMap = byOwner.get(owner);
      for (const sl of DAYPARTS) {
        const sd = st.prog?.[sl];
        if (!sd?.talent || sd.talent.id == null) continue;
        ownerMap.set(String(sd.talent.id), {
          stationId: st.id,
          call: st.callLetters || '',
          slot: sl,
          slotQ: Math.round(sd.quality || 0),
          tenure: sd.talent.periodsAtStation | 0,
          talentQ: sd.talent.quality | 0,
        });
      }
    }
    return byOwner;
  }

  function computeBenchStrength(priorInfo, st) {
    if (!priorInfo) return 0;
    const t = Math.min(1, (priorInfo.tenure || 0) / 20);
    const sq = Math.min(1, (priorInfo.slotQ || 0) / 95);
    const tq = Math.min(1, (priorInfo.talentQ || 0) / 90);
    const id = Math.min(1, (st.identity || 0) / 80);
    return Math.max(0, Math.min(1, t * 0.38 + sq * 0.34 + tq * 0.18 + id * 0.1));
  }

  function assessBenchDepthFromMap(stationTalents, departingMorningId) {
    let strongCandidates = 0;
    let bestBenchSlotQ = 0;
    if (!stationTalents) {
      return { strongCandidates: 0, bestBenchSlotQ: 0, depth: 'thin' };
    }
    for (const [tid, info] of stationTalents) {
      if (info.slot === 'morningDrive' && tid === departingMorningId) continue;
      if (info.slot === 'morningDrive') continue;
      const sq = info.slotQ | 0;
      const tq = info.talentQ | 0;
      if (sq >= 75 || tq >= 70) strongCandidates += 1;
      if (sq > bestBenchSlotQ) bestBenchSlotQ = sq;
    }
    let depth = 'thin';
    if (strongCandidates >= 2 || bestBenchSlotQ >= 85) depth = 'deep';
    else if (strongCandidates >= 1 || bestBenchSlotQ >= 72) depth = 'moderate';
    return { strongCandidates, bestBenchSlotQ, depth };
  }

  function classifyReplacement(st, curTalentId, stationTalentsBefore, clusterIdx) {
    if (!curTalentId) {
      return { replacementType: 'vacant', benchStrength: 0, priorSlot: null };
    }
    const onStation = stationTalentsBefore.get(curTalentId);
    if (onStation && onStation.slot !== 'morningDrive') {
      const benchStrength = computeBenchStrength(onStation, st);
      return {
        replacementType: 'internal',
        priorSlot: onStation.slot,
        priorSlotQ: onStation.slotQ,
        priorTalentQ: onStation.talentQ,
        priorTenure: onStation.tenure,
        benchStrength,
        classificationSource: 'native',
      };
    }
    const corp = st.corpOwner ? String(st.corpOwner) : null;
    if (corp && clusterIdx.has(corp)) {
      const elsewhere = clusterIdx.get(corp).get(curTalentId);
      if (elsewhere && elsewhere.stationId !== st.id) {
        const benchStrength = computeBenchStrength(elsewhere, st);
        return {
          replacementType: 'cluster',
          priorSlot: elsewhere.slot,
          priorSlotQ: elsewhere.slotQ,
          priorTalentQ: elsewhere.talentQ,
          priorTenure: elsewhere.tenure,
          fromStationId: elsewhere.stationId,
          fromCall: elsewhere.call,
          benchStrength,
          classificationSource: 'native',
        };
      }
    }
    return {
      replacementType: 'external',
      benchStrength: 0,
      priorSlot: null,
      classificationSource: 'native',
    };
  }

  function diagRoll(stationId, periodIdx, seed, salt) {
    let h = (seed >>> 0) ^ (periodIdx * 997) ^ (salt * 131);
    for (let i = 0; i < stationId.length; i++) h = (h ^ stationId.charCodeAt(i)) >>> 0;
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  }

  function bestBenchCandidate(stationTalents) {
    let best = null;
    for (const [tid, info] of stationTalents) {
      if (info.slot === 'morningDrive') continue;
      const score = info.slotQ * 0.68 + info.talentQ * 0.32;
      if (!best || score > best.score) best = { tid, ...info, score };
    }
    return best;
  }

  function bestClusterCandidate(st, clusterIdx) {
    const corp = st.corpOwner ? String(st.corpOwner) : null;
    if (!corp || !clusterIdx.has(corp)) return null;
    let best = null;
    for (const [tid, info] of clusterIdx.get(corp)) {
      if (info.stationId === st.id) continue;
      const score = info.slotQ * 0.62 + info.talentQ * 0.38;
      if (score < 66) continue;
      if (!best || score > best.score) best = { tid, ...info, score };
    }
    return best;
  }

  function internalPromotionProb(benchDepth) {
    if (benchDepth.depth === 'deep') return 0.68;
    if (benchDepth.depth === 'moderate') return 0.44;
    if (benchDepth.bestBenchSlotQ >= 65) return 0.14;
    return 0;
  }

  function clusterTransferProb(candidate, benchDepth) {
    if (!candidate) return 0;
    const score = candidate.score || 0;
    if (score >= 82) return 0.42;
    if (score >= 74) return 0.3;
    if (benchDepth.depth === 'thin' && score >= 68) return 0.22;
    return 0.16;
  }

  function applyInternalPromotion(st, sourceSlot, Gopt) {
    const src = st.prog?.[sourceSlot];
    const md = st.prog?.morningDrive;
    if (!src?.talent || !md) return false;
    const t = src.talent;
    const sourceQ = src.quality | 0;
    md.talent = t;
    md.quality = Math.min(100, Math.max(md.quality | 0, Math.round(sourceQ * 0.9)));
    src.talent = null;
    src.quality = Math.max(12, Math.round(sourceQ * 0.58));
    if (typeof refreshStationOQ === 'function') refreshStationOQ(st, Gopt);
    return true;
  }

  function applyClusterTransfer(st, candidate, Gopt) {
    const sister = (Gopt.stations || []).find((s) => s.id === candidate.stationId);
    const src = sister?.prog?.[candidate.slot];
    const md = st.prog?.morningDrive;
    if (!sister || !src?.talent || !md) return false;
    const t = src.talent;
    const sourceQ = src.quality | 0;
    src.talent = null;
    src.quality = Math.max(12, Math.round(sourceQ * 0.6));
    md.talent = t;
    md.quality = Math.min(100, Math.max(md.quality | 0, Math.round(sourceQ * 0.84)));
    if (typeof refreshStationOQ === 'function') {
      refreshStationOQ(st, Gopt);
      refreshStationOQ(sister, Gopt);
    }
    return true;
  }

  /**
   * Passive AI always external-hires into empty morning slots. For this diagnostic,
   * rewrite a subset of external successor hires into internal/cluster moves using
   * pre-turn bench/cluster maps (deterministic per station/period/seed).
   */
  function applyDiagnosticSuccessionReplacement(
    st,
    prev,
    stationTalentsBefore,
    clusterIdx,
    benchDepth,
    periodIdx,
    seed,
  ) {
    if (!G._wlSuccessorLegitimacyDiag) return null;

    const stationTalents = stationTalentsBefore || new Map();
    const curId = st.prog?.morningDrive?.talent?.id;
    const curIdStr = curId != null ? String(curId) : null;
    const native = classifyReplacement(st, curIdStr, stationTalents, clusterIdx);
    if (native.replacementType === 'internal' || native.replacementType === 'cluster') {
      return native;
    }

    const bench = bestBenchCandidate(stationTalents);
    const cluster = bestClusterCandidate(st, clusterIdx);
    const intP = internalPromotionProb(benchDepth);
    const rollInt = diagRoll(st.id, periodIdx, seed, 1);
    const rollCl = diagRoll(st.id, periodIdx, seed, 2);

    if (
      bench &&
      bench.slotQ >= 70 &&
      intP > 0 &&
      rollInt < intP
    ) {
      if (applyInternalPromotion(st, bench.slot, G)) {
        return {
          replacementType: 'internal',
          priorSlot: bench.slot,
          priorSlotQ: bench.slotQ,
          priorTalentQ: bench.talentQ,
          priorTenure: bench.tenure,
          benchStrength: computeBenchStrength(bench, st),
          classificationSource: 'diagnostic_bench_promotion',
        };
      }
    }

    const clP = clusterTransferProb(cluster, benchDepth);
    if (cluster && rollCl < clP && applyClusterTransfer(st, cluster, G)) {
      return {
        replacementType: 'cluster',
        priorSlot: cluster.slot,
        priorSlotQ: cluster.slotQ,
        priorTalentQ: cluster.talentQ,
        priorTenure: cluster.tenure,
        fromStationId: cluster.stationId,
        fromCall: cluster.call,
        benchStrength: computeBenchStrength(cluster, st),
        classificationSource: 'diagnostic_cluster_transfer',
      };
    }

    return {
      ...native,
      classificationSource: 'diagnostic_external_retained',
    };
  }

  function isSuccessorDeparture(st, prev, variant) {
    if (!prev) return false;
    if (variant === 'PROD') {
      const slotQ = prev.slotQ | 0;
      const tenure = prev.tenurePeriods | 0;
      if (slotQ >= 90) return true;
      if (slotQ >= 85 && tenure >= 12) return true;
      if (prev.talentSuperstar === true) return true;
      return false;
    }
    if (typeof wlMorningRecoverySuccessorCeilingTriggers === 'function') {
      return wlMorningRecoverySuccessorCeilingTriggers(prev);
    }
    return false;
  }

  function initGame(marketId, startYear, variant) {
    ensureHarnessScenarios();
    const scenId = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
    ACTIVE_MARKET = marketId;
    _selectedMarket = marketId;
    if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
    G = genMarket(scenId);
    G.marketId = marketId;
    G.tutorialMode = false;
    G._wlSuccessorLegitimacyDiag = variant !== 'PROD';
    if (variant !== 'PROD') G._wlMorningRecoveryVariant = variant || 'J1';
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  function collect2020Snapshot(G, marketId, tier) {
    const buckets = emptyBucketCounts();
    let sumOq = 0;
    let n = 0;
    let above90 = 0;
    let bucket9599 = 0;
    let lowShareSpiral = 0;
    let zombieLike = 0;

    commercialStations(G).forEach((st) => {
      const oq = Math.round(st.oq || 0);
      const share = st.rat?.share || 0;
      if (share < 0.015 && oq < 50) lowShareSpiral += 1;
      if (st.isZombie || st.isNicheSurvival || share < 0.008) zombieLike += 1;
      const b = oqBucket(oq);
      buckets[b] += 1;
      sumOq += oq;
      n += 1;
      if (oq >= 90) above90 += 1;
      if (oq >= 95 && oq <= 99) bucket9599 += 1;
    });

    return {
      commercialCount: n,
      meanOq: n ? Math.round((sumOq / n) * 100) / 100 : null,
      pctAbove90: n ? Math.round((100 * above90) / n * 100) / 100 : 0,
      pct9599: n ? Math.round((100 * bucket9599) / n * 100) / 100 : 0,
      buckets,
      lowShareSpiral,
      zombieLike,
    };
  }

  function runLegitimacySim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear;
    const endYear = config.endYear || 2020;
    const seed = config.seed >>> 0;
    const variant = config.variant || 'J1';
    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const tier = (MARKETS[marketId] || {}).rankTier || 'medium';
    const helpers = globalThis.__wlSuccessorRecoveryHelpers;
    const snapFull = helpers ? helpers.snapMorningFull : snapMorning;
    const tracker = helpers
      ? helpers.createSuccessorDepartureTracker({ marketId, startYear, seed })
      : null;
    const active = new Map();
    const events = [];
    let eventSeq = 0;

    function finalizeEvent(ev, endIdx) {
      if (ev._finalized) return;
      ev._finalized = true;
      if (!ev.recoveredQuality) ev.yearsToRecoverQuality = null;
      if (!ev.recoveredRevenue) ev.yearsToRecoverRevenue = null;
      if (!ev.exceededQuality) ev.yearsToExceedQuality = null;
      ev.observationPeriods = endIdx - ev.departPeriodIdx;
      events.push(ev);
    }

    function updateActiveTrackers(st, cur, idx) {
      const list = active.get(st.id);
      if (!list?.length) return;
      for (let i = list.length - 1; i >= 0; i--) {
        const ev = list[i];
        if (ev._finalized) continue;
        if (!ev.recoveredQuality && cur.slotQ >= (ev.originalPriorSlotQ ?? ev.departingSlotQ)) {
          ev.recoveredQuality = true;
          ev.yearsToRecoverQuality = yearsBetween(
            ev.departYear,
            ev.departPeriod,
            G.year,
            G.period,
          );
        }
        if (!ev.exceededQuality && cur.slotQ > ev.departingSlotQ) {
          ev.exceededQuality = true;
          ev.yearsToExceedQuality = yearsBetween(
            ev.departYear,
            ev.departPeriod,
            G.year,
            G.period,
          );
        }
        const revFloor = Math.max(0, Math.round(ev.preDepartureRev * 0.98));
        if (!ev.recoveredRevenue && ev.preDepartureRev > 0 && cur.rev >= revFloor) {
          ev.recoveredRevenue = true;
          ev.yearsToRecoverRevenue = yearsBetween(
            ev.departYear,
            ev.departPeriod,
            G.year,
            G.period,
          );
        }
        if (idx - ev.departPeriodIdx >= 40) finalizeEvent(ev, idx);
      }
      active.set(
        st.id,
        list.filter((ev) => !ev._finalized),
      );
    }

    function recordDeparture(st, prev, cur, idx, meta, benchDepth, trackerEv) {
      const isSuccessor = isSuccessorDeparture(st, prev, variant);
      if (!isSuccessor) return;

      eventSeq += 1;
      const ev = trackerEv || {
        eventId: `${marketId}:${startYear}:${seed}:${eventSeq}`,
        variant,
        marketId,
        rankTier: tier,
        ownership: ownershipType(st),
        stationId: st.id,
        call: st.callLetters || '',
        format: st.format || '',
        departYear: G.year,
        departPeriod: G.period,
        departPeriodIdx: idx,
        originalPriorSlotQ: prev.slotQ,
        departingSlotQ: prev.slotQ,
        departingTalentQ: prev.talentQ,
        departingTenure: prev.tenurePeriods || 0,
        isSuccessorDeparture: true,
        replacementType: meta.replacementType || 'external',
        replacementSlotQ: cur.slotQ,
        replacementSlotQAtFill: cur.slotQ,
        replacementTalentQ: cur.talentQ,
        priorSlot: meta.priorSlot || null,
        benchStrength: meta.benchStrength || 0,
        classificationSource: meta.classificationSource || 'native',
        benchDepth: benchDepth.depth,
        strongCandidates: benchDepth.strongCandidates,
        bestBenchSlotQ: benchDepth.bestBenchSlotQ,
        slotQDeltaImmediate: cur.slotQ - prev.slotQ,
        preDepartureRev: prev.rev,
        postDepartureRevImmediate: cur.rev,
        isEliteLoss: (prev.slotQ | 0) >= 90,
        isSuperEliteLoss: (prev.slotQ | 0) >= 95,
        fillTiming: trackerEv?.fillTiming || null,
        hasCeilingAfterFill: cur.hasCeiling,
        ceilingAtFill: cur.ceiling,
        immediateRecoverTPlus1: trackerEv?.immediateRecoverTPlus1 ?? false,
        immediateRecoverEndOfFill: trackerEv?.immediateRecoverEndOfFill ?? cur.slotQ >= prev.slotQ,
        integrityFlagged: trackerEv?.integrityFlagged ?? false,
        integrityFlags: trackerEv?.integrityFlags || [],
        recoveredQuality: trackerEv?.recoveredQuality ?? cur.slotQ >= prev.slotQ,
        exceededQuality: cur.slotQ > prev.slotQ,
        yearsToRecoverQuality:
          trackerEv?.yearsToRecoverQuality ??
          (cur.slotQ >= prev.slotQ ? yearsBetween(G.year, G.period, G.year, G.period) : null),
        yearsToExceedQuality:
          cur.slotQ > prev.slotQ ? yearsBetween(G.year, G.period, G.year, G.period) : null,
        recoveredRevenue: prev.rev > 0 && cur.rev >= Math.round(prev.rev * 0.98),
        yearsToRecoverRevenue:
          prev.rev > 0 && cur.rev >= Math.round(prev.rev * 0.98)
            ? yearsBetween(G.year, G.period, G.year, G.period)
            : null,
        _finalized: false,
      };

      if (!trackerEv) eventSeq -= 0;

      if (!ev.recoveredQuality || !ev.recoveredRevenue || !ev.exceededQuality) {
        if (!active.has(st.id)) active.set(st.id, []);
        active.get(st.id).push(ev);
      } else {
        ev.observationPeriods = 0;
        ev._finalized = true;
        events.push(ev);
      }
    }

    try {
      initGame(marketId, startYear, variant);
      const endPeriods = (endYear - startYear) * 2;

      for (let step = 0; step < endPeriods && G.year < endYear; step++) {
        const beforeMorning = new Map();
        const beforeStationTalents = new Map();
        const clusterIdx = buildClusterTalentIndex(G);

        commercialStations(G).forEach((st) => {
          const s = snapFull(st);
          if (s) {
            beforeMorning.set(st.id, s);
            if (tracker) tracker.processTurnStart(st, s);
          }
          beforeStationTalents.set(st.id, snapStationTalents(st));
        });

        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;

        const idx = periodIndex(G.year, G.period);

        commercialStations(G).forEach((st) => {
          const prev = beforeMorning.get(st.id);
          let cur = snapFull(st);
          if (!cur) return;

          const stationTalents = beforeStationTalents.get(st.id) || new Map();

          if (tracker) {
            const delayedEv = tracker.onDelayedFill(
              st,
              prev,
              cur,
              idx,
              tracker.classifyReplacement(st, cur.talentId, stationTalents, clusterIdx),
              { variant },
            );
            if (delayedEv && isSuccessorDeparture(st, { slotQ: delayedEv.originalPriorSlotQ, tenurePeriods: delayedEv.departingTenure, talentSuperstar: false }, variant)) {
              const meta = classifyReplacement(st, cur.talentId, stationTalents, clusterIdx);
              const benchDepth = assessBenchDepthFromMap(stationTalents, null);
              delayedEv.classificationSource = meta.classificationSource || 'native';
              recordDeparture(
                st,
                { slotQ: delayedEv.originalPriorSlotQ, talentQ: delayedEv.departingTalentQ, rev: delayedEv.preDepartureRev, tenurePeriods: delayedEv.departingTenure },
                cur,
                idx,
                meta,
                benchDepth,
                delayedEv,
              );
            }
          }

          if (prev && prev.talentId && prev.talentId !== cur.talentId) {
            const benchDepth = assessBenchDepthFromMap(stationTalents, prev.talentId);
            const isSuccessor = isSuccessorDeparture(st, prev, variant);

            let meta;
            if (isSuccessor) {
              if (variant === 'PROD') {
                meta = classifyReplacement(st, cur.talentId, stationTalents, clusterIdx);
              } else {
                meta = applyDiagnosticSuccessionReplacement(
                  st,
                  prev,
                  stationTalents,
                  clusterIdx,
                  benchDepth,
                  idx,
                  seed,
                );
                cur = snapFull(st);
              }
            } else {
              meta = classifyReplacement(st, cur.talentId, stationTalents, clusterIdx);
            }

            if (typeof wlMorningRecoveryApplyOnDeparture === 'function') {
              wlMorningRecoveryApplyOnDeparture(st, prev, G, meta);
              cur = snapFull(st);
            }

            let trackerEv = null;
            if (isSuccessor && tracker) {
              const repType = meta.replacementType || 'external';
              trackerEv = tracker.onSuccessorDeparture(st, prev, cur, idx, repType, {
                variant,
                classificationSource: meta.classificationSource,
              });
              if (trackerEv) {
                cur = snapFull(st);
                trackerEv.classificationSource = meta.classificationSource;
                trackerEv.priorSlot = meta.priorSlot;
                trackerEv.benchStrength = meta.benchStrength;
              }
            }

            updateActiveTrackers(st, cur, idx);
            recordDeparture(st, prev, cur, idx, meta, benchDepth, trackerEv);
          } else {
            updateActiveTrackers(st, cur, idx);
            if (tracker) tracker.processTurnEnd(st, cur, idx);
          }
        });
      }

      while (G.year < endYear) {
        advTurn();
        if ((G.cash || 0) < 150000) G.cash = 400000;
        const idx = periodIndex(G.year, G.period);
        commercialStations(G).forEach((st) => {
          const cur = snapFull(st);
          if (!cur) return;
          if (tracker) tracker.processTurnStart(st, cur);
          updateActiveTrackers(st, cur, idx);
          if (tracker) tracker.processTurnEnd(st, cur, idx);
        });
      }

      const finalIdx = periodIndex(G.year, G.period);
      if (tracker) tracker.finalizeAll(finalIdx);
      tracker?.events?.forEach((tev) => {
        if (!events.some((e) => e.eventId === tev.eventId)) events.push(tev);
      });
      active.forEach((list) => {
        list.forEach((ev) => finalizeEvent(ev, finalIdx));
      });

      return {
        ok: true,
        variant,
        marketId,
        rankTier: tier,
        startYear,
        seed,
        endYear: G.year,
        eventCount: events.length,
        events,
        snapshot2020: collect2020Snapshot(G, marketId, tier),
      };
    } catch (err) {
      return {
        ok: false,
        variant,
        marketId,
        rankTier: tier,
        startYear,
        seed,
        error: String(err && err.message ? err.message : err),
        eventCount: 0,
        events: [],
        snapshot2020: null,
      };
    } finally {
      Math.random = origRand;
    }
  }

  globalThis.__wlRunSuccessorLegitimacy = function runBatch(config) {
    const markets = config.markets || [];
    const startYears = config.startYears || [1970, 1985, 2000];
    const runs = config.runs || 2;
    const variant = config.variant || 'J1';
    const baseSeed = (config.seed >>> 0) || 20260601;
    const results = [];

    for (const marketId of markets) {
      for (const startYear of startYears) {
        for (let r = 0; r < runs; r++) {
          const seed = (baseSeed + r * 104729 + startYear * 997 + marketId.length * 31) >>> 0;
          results.push(
            runLegitimacySim({ marketId, startYear, seed, variant, endYear: config.endYear }),
          );
        }
      }
    }
    return results;
  };
})();
