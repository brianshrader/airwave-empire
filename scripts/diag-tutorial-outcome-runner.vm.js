/**
 * Headless tutorial_turnaround outcome trace.
 * Exposes: globalThis.__wlRunTutorialOutcomeTrace(config)
 *
 * Simulates the coached decision path (no UI):
 *   start → TOP 40 format → advance → best midday replace → focus midday → advance → advance
 */
(function () {
  'use strict';

  function playerStation(G) {
    return (G.ps && G.ps[0]) || (G.stations || []).find(function (s) {
      return s && s.isPlayer;
    });
  }

  function stationMetrics(G, sid) {
    var s = G.stations.find(function (st) {
      return st.id === sid;
    });
    if (!s) return null;
    var rk =
      typeof rankStationsByShareCompetition === 'function'
        ? rankStationsByShareCompetition(G.stations)
        : { n: 0, rankById: {} };
    var share = typeof s.rat?.share === 'number' ? s.rat.share : 0;
    var rev = s.fin && typeof s.fin.rev === 'number' ? s.fin.rev : 0;
    return {
      share: share,
      sharePct: Math.round(share * 1000) / 10,
      rank: rk.rankById[sid] != null ? rk.rankById[sid] : null,
      marketStations: rk.n || 0,
      revenue: rev,
      format: s.format,
      year: G.year,
      period: G.period,
      oq: s.oq,
      middayTalentQ: s.prog?.midday?.talent ? Math.round(s.prog.midday.talent.quality) : null,
    };
  }

  function deltaMetrics(before, after) {
    if (!before || !after) return null;
    return {
      shareDelta: after.share - before.share,
      shareDeltaPp: Math.round((after.share - before.share) * 1000) / 10,
      rankDelta: before.rank != null && after.rank != null ? before.rank - after.rank : null,
      revenueDelta: after.revenue - before.revenue,
      revenueDeltaPct:
        before.revenue > 0
          ? Math.round(((after.revenue - before.revenue) / before.revenue) * 1000) / 10
          : null,
    };
  }

  function pickBestPoolIndex(pool, format) {
    var best = 0;
    var bestScore = -1;
    for (var i = 0; i < pool.length; i++) {
      var t = pool[i];
      var fit =
        typeof talentScoutFormatFit01 === 'function' ? talentScoutFormatFit01(t, format) : 0.5;
      var score = (t.quality || 0) * fit;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return { index: best, score: bestScore, talent: pool[best] };
  }

  function applyTutorialFormatTop40(s) {
    if (typeof FS === 'undefined') throw new Error('FS not defined');
    FS.sid = s.id;
    FS.chosen = 'TOP40';
    if (typeof doFmt !== 'function') throw new Error('doFmt not found');
    doFmt();
  }

  function replaceMiddayBestTalent(s) {
    if (typeof getOrCreateFreeAgentPool !== 'function') throw new Error('getOrCreateFreeAgentPool missing');
    var pool = getOrCreateFreeAgentPool(s, 'midday', 'replace');
    var pick = pickBestPoolIndex(pool, s.format);
    HS = {
      sid: s.id,
      slot: 'midday',
      pool: pool,
      sel: pick.index,
      poachRivalId: null,
      _embed: 'manage',
      _hireKind: 'replace',
      _chair: null,
    };
    if (typeof doHire !== 'function') throw new Error('doHire missing');
    doHire();
    return {
      pickedTalentQ: pick.talent ? Math.round(pick.talent.quality) : null,
      pickedFitPct:
        pick.talent && typeof talentScoutFormatFit01 === 'function'
          ? Math.round(talentScoutFormatFit01(pick.talent, s.format) * 100)
          : null,
    };
  }

  function syncAdvance() {
    if (typeof advTurn !== 'function') throw new Error('advTurn missing');
    advTurn();
  }

  function meaningfulPayoff(delta, startRank) {
    if (!delta) return false;
    var shareUp = delta.shareDeltaPp >= 0.5;
    var rankUp = delta.rankDelta != null && delta.rankDelta >= 2;
    var revUp = delta.revenueDeltaPct != null && delta.revenueDeltaPct >= 10;
    return shareUp || rankUp || revUp;
  }

  function obviousWin(delta, startRank) {
    if (!delta) return false;
    var shareUp = delta.shareDeltaPp >= 1.5;
    var rankUp = delta.rankDelta != null && delta.rankDelta >= 3;
    var revUp = delta.revenueDeltaPct != null && delta.revenueDeltaPct >= 18;
    return shareUp || rankUp || revUp;
  }

  globalThis.__wlRunTutorialOutcomeTrace = function (config) {
    config = config || {};
    var seed = config.seed != null ? Number(config.seed) : 424242;
    var marketId = config.marketId || 'atlanta';

    var installRng =
      typeof installSeededBenchmarkRng === 'function'
        ? installSeededBenchmarkRng
        : typeof _harnessInstallSeededBenchmarkRng === 'function'
          ? _harnessInstallSeededBenchmarkRng
          : null;
    if (installRng) {
      var rng = installRng(seed);
      try {
        return runOnce(seed, marketId);
      } finally {
        if (rng && rng.restore) rng.restore();
      }
    }
    return runOnce(seed, marketId);
  };

  function runOnce(seed, marketId) {
    if (typeof ACTIVE_MARKET !== 'undefined') ACTIVE_MARKET = marketId;
    if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
    if (typeof MP !== 'undefined') {
      MP.mode = 'solo';
      MP.isHost = false;
    }

    G = genMarket('tutorial_turnaround');
    if (!G || !G.sc || G.sc.id !== 'tutorial_turnaround') {
      throw new Error('genMarket tutorial_turnaround failed');
    }
    G.tutorialMode = true;
    G._wlHarnessDeterministic = true;
    G.ps = (G.stations || []).filter(function (s) {
      return s && s.isPlayer;
    });
    if (typeof recalc === 'function') recalc(G.stations, G);
    if (typeof seedRev === 'function') seedRev(G.stations, G);

    if (typeof snapMarketRankBookDisplay === 'function') snapMarketRankBookDisplay(G);

    var s = playerStation(G);
    if (!s) throw new Error('no player station');

    var start = stationMetrics(G, s.id);
    var milestones = { start: start };

    applyTutorialFormatTop40(s);
    milestones.afterFormat = stationMetrics(G, s.id);
    milestones.deltaAfterFormat = deltaMetrics(start, milestones.afterFormat);

    syncAdvance();
    milestones.afterFirstAdvance = stationMetrics(G, s.id);
    milestones.deltaAfterFirstAdvance = deltaMetrics(milestones.afterFormat, milestones.afterFirstAdvance);
    milestones.deltaFromStartAfterFirstAdvance = deltaMetrics(start, milestones.afterFirstAdvance);

    var hireMeta = replaceMiddayBestTalent(s);
    milestones.hireMeta = hireMeta;
    if (typeof setStationProgrammingFocus === 'function') {
      setStationProgrammingFocus(s.id, 'midday');
    }

    milestones.afterTalent = stationMetrics(G, s.id);
    milestones.deltaAfterTalent = deltaMetrics(milestones.afterFirstAdvance, milestones.afterTalent);

    syncAdvance();
    milestones.afterSecondAdvance = stationMetrics(G, s.id);
    milestones.deltaAfterSecondAdvance = deltaMetrics(milestones.afterTalent, milestones.afterSecondAdvance);
    milestones.deltaFromStartAfterSecondAdvance = deltaMetrics(start, milestones.afterSecondAdvance);

    syncAdvance();
    milestones.afterThirdAdvance = stationMetrics(G, s.id);
    milestones.deltaAfterThirdAdvance = deltaMetrics(milestones.afterSecondAdvance, milestones.afterThirdAdvance);
    milestones.deltaFromStartAfterThirdAdvance = deltaMetrics(start, milestones.afterThirdAdvance);

    var payoffSecond = milestones.deltaFromStartAfterSecondAdvance;
    var payoffThird = milestones.deltaFromStartAfterThirdAdvance;

    return {
      seed: seed,
      marketId: marketId,
      callLetters: s.callLetters,
      startFormat: start.format,
      milestones: milestones,
      flags: {
        meaningfulAfterFirstAdvance: meaningfulPayoff(milestones.deltaFromStartAfterFirstAdvance, start.rank),
        meaningfulAfterSecondAdvance: meaningfulPayoff(payoffSecond, start.rank),
        meaningfulAfterThirdAdvance: meaningfulPayoff(payoffThird, start.rank),
        obviousWinAfterSecondAdvance: obviousWin(payoffSecond, start.rank),
        obviousWinAfterThirdAdvance: obviousWin(payoffThird, start.rank),
        shareGain1ppBySecondAdvance: payoffSecond && payoffSecond.shareDeltaPp >= 1,
        rankGain3BySecondAdvance: payoffSecond && payoffSecond.rankDelta != null && payoffSecond.rankDelta >= 3,
      },
    };
  }
})();
