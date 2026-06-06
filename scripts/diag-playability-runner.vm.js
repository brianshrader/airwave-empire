/**
 * VM runner — solo snowball playability batch (aggressive benchmark bot, HARD AI).
 * Exposes: globalThis.__wlRunPlayabilityTrace(config)
 */
(function () {
  'use strict';

  var SCENARIO_BY_START = {
    1970: 'under',
    1985: 'chrwar',
    2000: 'harness2000',
  };

  function ensureHarnessScenarios() {
    if (typeof SC === 'undefined' || !Array.isArray(SC)) return;
    if (!SC.some(function (s) {
      return s.id === 'harness2000';
    })) {
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

  function lastOperatingRow(diary) {
    var last = null;
    for (var i = 0; i < diary.length; i++) {
      if ((diary[i].nStations || 0) > 0) last = diary[i];
    }
    return last;
  }

  function firstMilestoneYear(diary, pred) {
    for (var i = 0; i < diary.length; i++) {
      var d = diary[i];
      if (d.soloBankrupt) return null;
      if (pred(d)) return d.year;
    }
    return null;
  }

  function playerDominantFormat(row) {
    if (!row) return null;
    if ((row.nStations || 0) === 1 && row.playerPrimaryFormat) return row.playerPrimaryFormat;
    var top10 = row.top10Market || [];
    var byFmt = {};
    var total = 0;
    for (var i = 0; i < top10.length; i++) {
      var t = top10[i];
      if (!t || !t.isPlayer) continue;
      var sh = t.share || 0;
      if (sh <= 0) continue;
      var f = t.format || 'UNK';
      byFmt[f] = (byFmt[f] || 0) + sh;
      total += sh;
    }
    if (total <= 0) return row.playerPrimaryFormat || null;
    var best = null;
    var bestSh = -1;
    for (var fk in byFmt) {
      if (byFmt[fk] > bestSh) {
        bestSh = byFmt[fk];
        best = fk;
      }
    }
    return best;
  }

  function playerUsesSpanish(diary, lastOp) {
    for (var i = 0; i < diary.length; i++) {
      var acts = diary[i].actions || {};
      var acq = acts.acquisitions || [];
      for (var j = 0; j < acq.length; j++) {
        if (acq[j].format === 'SPANISH' || acq[j].toFormat === 'SPANISH') return true;
      }
      var ref = acts.reformats || [];
      for (var k = 0; k < ref.length; k++) {
        if (ref[k].toFormat === 'SPANISH') return true;
      }
    }
    if (!lastOp) return false;
    var fmt = playerDominantFormat(lastOp);
    if (fmt === 'SPANISH') return true;
    var top10 = lastOp.top10Market || [];
    for (var t = 0; t < top10.length; t++) {
      if (top10[t].isPlayer && top10[t].format === 'SPANISH') return true;
    }
    return false;
  }

  function bestRank(row) {
    if (!row || !row.ranks || !row.ranks.length) return null;
    var best = row.ranks[0];
    for (var i = 1; i < row.ranks.length; i++) {
      if (row.ranks[i] < best) best = row.ranks[i];
    }
    return best;
  }

  function extractPlayabilityMetrics(out) {
    var diary = out.diary || [];
    var summary = out.summary || {};
    var bankrupt = false;
    for (var i = 0; i < diary.length; i++) {
      if (diary[i].soloBankrupt) {
        bankrupt = true;
        break;
      }
    }
    var lastOp = lastOperatingRow(diary);
    var last = diary.length ? diary[diary.length - 1] : null;
    var survived = !bankrupt && !!lastOp && (lastOp.nStations || 0) > 0;
    var firstProfit = firstMilestoneYear(diary, function (d) {
      return (d.nStations || 0) > 0 && (d.totalEbitda || 0) > 0;
    });
    var firstRank1 = summary.firstYearPeriodRank1 ? summary.firstYearPeriodRank1.year : null;
    var firstAcq = summary.firstAcquisition ? summary.firstAcquisition.year : null;
    var finalRank = survived ? bestRank(lastOp) : null;
    var finalClusterShare = survived ? lastOp.clusterShare || 0 : null;
    var finalTopShare = survived ? lastOp.topShare || 0 : null;
    var dominantFormat = survived ? playerDominantFormat(lastOp) : null;
    var spanishTouch = survived ? playerUsesSpanish(diary, lastOp) : false;
    var everRank1 = firstRank1 != null;
    var winning =
      survived &&
      (everRank1 || (finalRank != null && finalRank <= 3) || (finalClusterShare != null && finalClusterShare >= 0.1));
    return {
      seed: out.options && out.options.seed,
      marketId: out.options && out.options.marketId,
      startYear: out.options && out.options.startYear,
      scenId: out.options && out.options.scenId,
      survived: survived,
      bankrupt: bankrupt,
      winning: winning,
      firstProfitableYear: firstProfit,
      firstRank1Year: firstRank1,
      firstAcquisitionYear: firstAcq,
      finalBestRank: finalRank,
      finalClusterShare: finalClusterShare,
      finalTopShare: finalTopShare,
      dominantFormat: dominantFormat,
      spanishTouched: spanishTouch,
      nStationsEnd: lastOp ? lastOp.nStations || 0 : 0,
      cashEnd: last ? last.cashEnd : null,
      periodsLogged: diary.length,
    };
  }

  function runPlayabilityTrace(config) {
    config = config || {};
    ensureHarnessScenarios();
    var startYear = config.startYear | 0;
    var marketId = config.marketId || 'houston';
    var seed = config.seed != null ? config.seed : 505050;
    var endYear = config.endYear != null ? config.endYear : 2026;
    var scenId = SCENARIO_BY_START[startYear] || SCENARIO_BY_START[1970];
    if (typeof runMarketSnowballTrace !== 'function') {
      throw new Error('runMarketSnowballTrace missing — load marketSimHarnessSnowball.js after legacy.js');
    }
    var out = runMarketSnowballTrace({
      marketId: marketId,
      scenId: scenId,
      seed: seed,
      endYear: endYear,
      endPeriod: 2,
      playerPolicy: config.playerPolicy === 'conservative' ? 'conservative' : 'aggressive',
      easyAi: false,
      activePlayer: true,
    });
    if (out.options) {
      out.options.startYear = startYear;
      out.options.scenId = scenId;
    }
    return extractPlayabilityMetrics(out);
  }

  globalThis.__wlRunPlayabilityTrace = runPlayabilityTrace;
})();
