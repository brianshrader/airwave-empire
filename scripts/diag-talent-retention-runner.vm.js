/**
 * VM runner for talent retention diagnostics (loaded after legacy.js + talentRetention.js).
 * Exposes: globalThis.__wlRunTalentRetentionSim(config)
 */
(function () {
  'use strict';

  const SCENARIO_BY_START = {
    1970: 'under',
    1985: 'chrwar',
    2000: 'harness2000',
  };

  function ensureHarnessScenario() {
    if (typeof SC === 'undefined' || !Array.isArray(SC)) return;
    if (SC.some((s) => s.id === 'harness2000')) return;
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

  function seededRandom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function snapshotTalent(t, isCoHost) {
    return {
      id: t.id,
      name: t.name || '',
      quality: t.quality | 0,
      salary: t.salary | 0,
      morale: t.morale | 0,
      structMorale: typeof t._structMorale === 'number' ? t._structMorale : null,
      satisfaction: typeof t._satisfaction === 'number' ? t._satisfaction : null,
      effectiveMorale:
        typeof effectiveTalentMorale === 'function' ? effectiveTalentMorale(t) : t.morale | 0,
      personality: t._personality || '',
      cyr: t.cyr || 0,
      periodsAtStation: t.periodsAtStation | 0,
      wantsExit: !!t._wantsExit,
      wantsExitReason: t._wantsExitReason || '',
      letExpire: !!t._letExpire,
      lifeExitPending: t._lifeExitPending
        ? {
            kind: t._lifeExitPending.kind || '',
            reasonLine: t._lifeExitPending.reasonLine || '',
            destLabel: t._lifeExitPending.destLabel || '',
          }
        : null,
      isCoHost: !!isCoHost,
    };
  }

  function stationRank(s, G) {
    try {
      const rows =
        typeof buildCommercialCombinedRankRows === 'function'
          ? buildCommercialCombinedRankRows(G)
          : [];
      return typeof combinedMarketRankForStation === 'function'
        ? combinedMarketRankForStation(s, rows)
        : null;
    } catch (_e) {
      return null;
    }
  }

  function snapshotStation(s, G) {
    const rep = s._employerRep || {};
    const rank = stationRank(s, G);
    return {
      stationId: s.id,
      callLetters: s.callLetters || '',
      share: s.rat?.share || 0,
      rank,
      prevRank: s._prevRank != null ? s._prevRank : null,
      rankDeclineStreak: s._rankDeclineStreak | 0,
      cash: G.cash | 0,
      ebitda: s.fin?.ebitda | 0,
      revenue: s.fin?.rev | 0,
      avgSlotQuality: (() => {
        const qs = Object.values(s.prog || {})
          .map((sd) => sd?.quality | 0)
          .filter((q) => q > 0);
        return qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : 0;
      })(),
      repStable: rep.stable | 0,
      repWinner: rep.winner | 0,
      repTurnover: rep.turnover | 0,
      repDeclining: rep.declining | 0,
      repTag: rep.tag || '',
    };
  }

  function capturePlayerTalents(G) {
    const map = new Map();
    (G.ps || []).forEach((s) => {
      if (!s || !s.isPlayer) return;
      Object.entries(s.prog || {}).forEach(([slot, sd]) => {
        if (!sd) return;
        const stSnap = snapshotStation(s, G);
        const host = sd.talent;
        if (host && host.id) {
          map.set(host.id, {
            talent: snapshotTalent(host, false),
            slot,
            station: stSnap,
          });
        }
        const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
        if (ch && ch.id) {
          map.set(ch.id, {
            talent: snapshotTalent(ch, true),
            slot,
            station: stSnap,
          });
        }
      });
    });
    return map;
  }

  function newsForTurn(news, year, period) {
    return (news || []).filter((n) => n && n.y === year && n.p === period);
  }

  function classifyExit(talentSnap, turnNews) {
    const text = turnNews.map((n) => String(n.t || '')).join(' ').toLowerCase();
    const t = talentSnap;
    if (text.includes('forced sale') || (text.includes('sold for') && text.includes('license continues'))) {
      return 'station_disposition';
    }
    if (t.letExpire) return 'let_expire';
    if (t.lifeExitPending?.kind === 'bigger_market') return 'market_ambition';
    if (
      t.lifeExitPending ||
      t.wantsExitReason === 'life' ||
      text.includes('not a programming dispute') ||
      text.includes('not about your programming')
    ) {
      return 'life_career';
    }
    if (text.includes('retire')) return 'retirement';
    if (text.includes('legendary run')) return 'retirement';
    if (text.includes('morale collapse') || (text.includes('quits') && text.includes('morale'))) {
      return 'burnout';
    }
    if (text.includes('quits')) return 'burnout';
    if (
      text.includes('poach') ||
      text.includes('courting') ||
      text.includes('rival') && text.includes('leave')
    ) {
      return 'poaching';
    }
    if (
      t.wantsExit ||
      text.includes("won't sign") ||
      text.includes('won\u2019t sign') ||
      text.includes('declined a new contract') ||
      text.includes('refused to re-sign') ||
      text.includes('not interested in a new deal')
    ) {
      return 'dissatisfaction';
    }
    if (text.includes('contract not renewed')) return 'let_expire';
    return 'unknown';
  }

  function initGame(marketId, startYear) {
    ensureHarnessScenario();
    const scenId = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
    G = genMarket(scenId);
    G.marketId = marketId;
    G.tutorialMode = false;
    G._wlRetentionDiag = true;
    G.cash = Math.max(G.cash || 0, 3500000);
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);
    return G;
  }

  function avgRemainingMorale(G, stationId) {
    const s = G.stations.find((st) => st.id === stationId);
    if (!s) return null;
    const m = [];
    Object.values(s.prog || {}).forEach((sd) => {
      if (sd?.talent) m.push(sd.talent.morale | 0);
      const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
      if (ch) m.push(ch.morale | 0);
    });
    return m.length ? m.reduce((a, b) => a + b, 0) / m.length : null;
  }

  globalThis.__wlRunTalentRetentionSim = function runSim(config) {
    const marketId = config.marketId;
    const startYear = config.startYear;
    const seed = config.seed >>> 0;
    const years = config.years || 25;
    const periods = years * 2;
    const runId = config.runId || 0;

    const origRand = Math.random;
    Math.random = seededRandom(seed);

    const exits = [];
    const stationTimeline = [];
    const spiralEvents = [];
    let playerStationCount = 0;

    try {
      initGame(marketId, startYear);
      playerStationCount = (G.ps || []).filter((s) => s?.isPlayer).length;
      const stationYears = playerStationCount * years;
      const endYear = startYear + years;

      for (let step = 0; step < periods && G.year < endYear; step++) {
        const wasYear = G.year;
        const wasPeriod = G.period;
        const before = capturePlayerTalents(G);

        (G.ps || []).forEach((s) => {
          if (!s?.isPlayer) return;
          stationTimeline.push({
            year: wasYear,
            period: wasPeriod,
            stationId: s.id,
            share: s.rat?.share || 0,
            rank: stationRank(s, G),
            avgMorale: avgRemainingMorale(G, s.id),
            avgQuality: snapshotStation(s, G).avgSlotQuality,
          });
        });

        advTurn();
        if (G._wlRetentionDiag && (G.cash || 0) < 150000) G.cash = 400000;

        const turnNews = newsForTurn(G.news, wasYear, wasPeriod);
        const after = capturePlayerTalents(G);

        before.forEach((entry, tid) => {
          if (after.has(tid)) return;
          const cause = classifyExit(entry.talent, turnNews);
          const st = entry.station;
          const rank = st.rank;
          const tier = (MARKETS[marketId] || {}).rankTier || 'medium';
          exits.push({
            runId,
            marketId,
            startYear,
            seed,
            exitYear: wasYear,
            exitPeriod: wasPeriod,
            cause,
            talentId: tid,
            talentName: entry.talent.name,
            slot: entry.slot,
            isCoHost: entry.talent.isCoHost,
            stationId: st.stationId,
            stationCall: st.callLetters,
            stationRank: rank,
            stationShare: st.share,
            prevRank: st.prevRank,
            rankDeclineStreak: st.rankDeclineStreak,
            stationCash: st.cash,
            stationEbitda: st.ebitda,
            stationRevenue: st.revenue,
            repStable: st.repStable,
            repWinner: st.repWinner,
            repTurnover: st.repTurnover,
            repDeclining: st.repDeclining,
            repTag: st.repTag,
            structMorale: entry.talent.structMorale,
            morale: entry.talent.morale,
            effectiveMorale: entry.talent.effectiveMorale,
            satisfaction: entry.talent.satisfaction,
            quality: entry.talent.quality,
            salary: entry.talent.salary,
            tenurePeriods: entry.talent.periodsAtStation,
            personality: entry.talent.personality,
            cyrRemaining: entry.talent.cyr,
            wantsExitReason: entry.talent.wantsExitReason,
            lifeReason: entry.talent.lifeExitPending?.reasonLine || '',
            lifeDest: entry.talent.lifeExitPending?.destLabel || '',
            marketTier: tier,
            top3Station: rank != null && rank <= 3,
            rank1Station: rank === 1,
            bottomHalf: rank != null && rank > Math.ceil((G.stations.filter((x) => x && !x.isPublic && !x._bpSlotDeferred).length || 12) / 2),
            highMorale: (entry.talent.effectiveMorale | 0) >= 60,
            highSat: (entry.talent.satisfaction | 0) >= 62,
            newsSample: turnNews
              .slice(0, 2)
              .map((n) => String(n.t || '').slice(0, 120))
              .join(' | '),
          });
        });
      }

      // Death spiral detection per player station (retention exits only)
      const retentionOnly = exits.filter(
        (e) =>
          e.cause !== 'station_disposition' &&
          e.cause !== 'unknown',
      );
      const byStation = {};
      retentionOnly.forEach((ex) => {
        if (!byStation[ex.stationId]) byStation[ex.stationId] = [];
        byStation[ex.stationId].push(ex);
      });
      Object.entries(byStation).forEach(([sid, evs]) => {
        evs.sort((a, b) => a.exitYear - b.exitYear || a.exitPeriod - b.exitPeriod);
        for (let i = 0; i < evs.length; i++) {
          const window = evs.filter((e) => {
            const dy = (e.exitYear - evs[i].exitYear) * 2 + (e.exitPeriod - evs[i].exitPeriod);
            return dy >= 0 && dy <= 4;
          });
          if (window.length < 2) continue;
          const first = window[0];
          const preShare = first.stationShare;
          const postExits = stationTimeline.filter(
            (t) => t.stationId === sid && (t.year > first.exitYear || (t.year === first.exitYear && t.period >= first.exitPeriod)),
          );
          const minShare = preShare;
          let recovered = false;
          for (let j = 0; j < Math.min(16, postExits.length); j++) {
            const pt = postExits[j];
            if (pt.share >= preShare * 0.9 && (pt.avgMorale | 0) >= 50) {
              recovered = true;
              break;
            }
          }
          const lowMorale = window.some((e) => (e.effectiveMorale | 0) < 45);
          spiralEvents.push({
            stationId: sid,
            marketId,
            startYear,
            runId,
            triggerYear: first.exitYear,
            exitCount: window.length,
            shareAtTrigger: preShare,
            recovered,
            lowMorale,
          });
          break;
        }
      });

      return {
        ok: true,
        marketId,
        startYear,
        seed,
        runId,
        endYear: G.year,
        periodsRun: periods,
        stationYears,
        playerStationCount,
        exitCount: exits.length,
        retentionExitCount: retentionOnly.length,
        exits,
        spirals: spiralEvents,
      };
    } catch (err) {
      return {
        ok: false,
        marketId,
        startYear,
        seed,
        runId,
        error: String(err && err.message ? err.message : err),
        exits,
        spirals: [],
      };
    } finally {
      Math.random = origRand;
    }
  };
})();
