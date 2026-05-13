/**
 * Snowball trace + benchmark player bot (loaded after marketSimHarness.js + legacy.js).
 * Uses window._harnessPatchTimersAndUi from marketSimHarness.js.
 */
(function () {
  'use strict';

  function patchTimersAndUi() {
    if (typeof window._harnessPatchTimersAndUi === 'function') return window._harnessPatchTimersAndUi();
    return { restore: function () {} };
  }

  /**
   * Benchmark bot: playerPolicy 'conservative' | 'aggressive'
   */
  function runAirwaveBenchmarkPlayerBotTurn(G, playerPolicy) {
    if (!G || G._soloBankrupt) return;
    var agg = playerPolicy === 'aggressive';
    var acqFn = typeof window !== 'undefined' && window.benchmarkSoloAcquireStation;
    var fmtFn = typeof window !== 'undefined' && window.benchmarkSoloPlayerReformat;
    var mk = typeof mkTal === 'function' ? mkTal : typeof window !== 'undefined' && window.mkTal;
    var refOQ = typeof refreshStationOQ === 'function' ? refreshStationOQ : null;
    var fmtOk =
      typeof formatUnlockedForYear === 'function' && typeof formatAllowedInMarket === 'function' && typeof FM !== 'undefined';
    var basePromoFn = typeof promoBudgetCapForPeriod === 'function' ? promoBudgetCapForPeriod : null;
    var baseProgFn = typeof progBudgetCapForPeriod === 'function' ? progBudgetCapForPeriod : null;
    var baselinePP =
      typeof playerCompetitiveBaselinePromoProg === 'function' ? playerCompetitiveBaselinePromoProg : null;

    var comm = (G.stations || [])
      .filter(function (s) {
        return s && !s._bpSlotDeferred && !s.isPublic;
      })
      .sort(function (a, b) {
        return (b.rat && b.rat.share ? b.rat.share : 0) - (a.rat && a.rat.share ? a.rat.share : 0);
      });

    function refreshPlayerStations() {
      var list = (G.ps && G.ps.length ? G.ps : (G.stations || []).filter(function (s) {
        return s && s.isPlayer;
      })).slice();
      list.sort(function (a, b) {
        return (b.rat && b.rat.share ? b.rat.share : 0) - (a.rat && a.rat.share ? a.rat.share : 0);
      });
      return list;
    }

    var pSt = refreshPlayerStations();

    var reserve = agg
      ? Math.max(26000, Math.min(220000, (G.cash || 0) * 0.038))
      : Math.max(45000, Math.min(350000, (G.cash || 0) * 0.08));

    function stationRank(st) {
      var ix = comm.findIndex(function (c) {
        return c.id === st.id;
      });
      return ix < 0 ? 999 : ix + 1;
    }

    function pickReformatTarget(st) {
      if (!fmtOk || !fmtFn) return null;
      var y = G.year || 1970;
      var keys = Object.keys(FM).filter(function (f) {
        return (
          FM[f] &&
          !FM[f].public &&
          f !== st.format &&
          formatUnlockedForYear(f, G) &&
          formatAllowedInMarket(f, G.marketId || 'atlanta', y)
        );
      });
      if (!keys.length) return null;
      var sh = st.rat && st.rat.share != null ? st.rat.share : 0;
      var newsFrom = agg ? 1984 : 1986;
      if (y >= newsFrom && ['TOP40', 'MOR', 'FULL_SERVICE'].indexOf(st.format) >= 0 && keys.indexOf('NEWS_TALK') >= 0)
        return 'NEWS_TALK';
      if (agg) {
        if (sh < 0.032 && keys.indexOf('HOT_AC') >= 0) return 'HOT_AC';
        if (sh < 0.034 && keys.indexOf('ADULT_CONTEMP') >= 0) return 'ADULT_CONTEMP';
        if (sh < 0.036 && keys.indexOf('COUNTRY') >= 0) return 'COUNTRY';
      } else {
        if (sh < 0.028 && keys.indexOf('ADULT_CONTEMP') >= 0) return 'ADULT_CONTEMP';
        if (sh < 0.035 && keys.indexOf('COUNTRY') >= 0) return 'COUNTRY';
      }
      if (keys.indexOf('HOT_AC') >= 0) return 'HOT_AC';
      return keys[0];
    }

    var weakThSh = agg ? 0.042 : 0.036;
    var weakThRk = agg ? 11 : 14;
    var recSh = agg ? 0.053 : 0.05;
    var recRk = agg ? 11 : 10;
    var weakNeed = agg ? 3 : 5;
    var reformCapSh = agg ? 0.052 : 0.045;
    var reformBlockSh = agg ? 0.088 : 0.09;

    for (var si = 0; si < pSt.length; si++) {
      var s = pSt[si];
      if (!s || !s.prog) continue;
      var rk = stationRank(s);
      var sh = s.rat && s.rat.share != null ? s.rat.share : 0;
      if (!s._benchBotWeak) s._benchBotWeak = 0;
      if (sh < weakThSh && rk > weakThRk) s._benchBotWeak++;
      else if (sh > recSh || rk < recRk) s._benchBotWeak = Math.max(0, (s._benchBotWeak || 0) - 1);

      if (s._benchBotWeak >= weakNeed && sh < reformCapSh && !(s.rat && s.rat.share > reformBlockSh)) {
        var nf = pickReformatTarget(s);
        if (nf && fmtFn(G, s, nf)) {
          s._benchBotWeak = 0;
          comm = (G.stations || [])
            .filter(function (x) {
              return x && !x._bpSlotDeferred && !x.isPublic;
            })
            .sort(function (a, b) {
              return (b.rat && b.rat.share ? b.rat.share : 0) - (a.rat && a.rat.share ? a.rat.share : 0);
            });
        }
      }
    }

    pSt = refreshPlayerStations();
    var hireOrder = ['morningDrive', 'afternoonDrive', 'midday', 'evening'];
    var hireCap = agg ? 2 : 1;
    var hiresDone = 0;
    for (var hj = 0; hj < pSt.length && hiresDone < hireCap; hj++) {
      var hs = pSt[hj];
      var minHireCash = reserve + (agg ? 11000 : 15000);
      if (!hs || !hs.prog || (G.cash || 0) < minHireCash) continue;
      for (var hi = 0; hi < hireOrder.length; hi++) {
        var sl = hireOrder[hi];
        var sd = hs.prog[sl];
        if (!sd || sd.talent || !mk) continue;
        var hRk = stationRank(hs);
        var hShare = hs.rat && hs.rat.share != null ? hs.rat.share : 0;
        var tier = 'entry';
        if (agg) {
          if (hRk <= 4 || hShare >= 0.082) tier = sl === 'morningDrive' ? 'star' : 'mid';
          else if (hRk <= 8 || hShare >= 0.056) tier = 'mid';
        } else {
          tier = hShare >= 0.055 ? 'mid' : 'entry';
          if (sl === 'morningDrive' && hShare >= 0.07) tier = 'mid';
        }
        if (tier === 'star' && (G.cash || 0) < reserve + 220000) tier = 'mid';
        var tNew = mk(sl, hs.format, tier, G.year);
        if (!tNew) continue;
        sd.talent = tNew;
        sd.quality = Math.min(100, Math.round((sd.quality || 28) * 0.55 + tNew.quality * 0.45));
        if (refOQ) refOQ(hs, G);
        hiresDone++;
        break;
      }
    }

    pSt = refreshPlayerStations();
    if (basePromoFn && baseProgFn) {
      var pc = basePromoFn(G);
      var pgc = baseProgFn(G);
      var loSh = agg ? 0.038 : 0.045;
      var pLo = agg ? 0.041 : 0.035;
      var gLo = agg ? 0.033 : 0.028;
      var pHi = agg ? 0.072 : 0.055;
      var gHi = agg ? 0.058 : 0.045;
      var hiSh = agg ? 0.068 : 0.075;
      var bumpSh = agg ? 0.06 : 0.07;
      var bumpCash = agg ? 65000 : 120000;
      var bumpMax = agg ? 175000 : 95000;
      var bumpFrac = agg ? 0.092 : 0.06;
      for (var pi = 0; pi < pSt.length; pi++) {
        var ps = pSt[pi];
        if (!ps.ops) ps.ops = { spots: 14, sell: 0.65, promo: 0, progBudget: 0 };
        var rev = ps.fin && ps.fin.rev ? ps.fin.rev : 0;
        var psh = ps.rat && ps.rat.share != null ? ps.rat.share : 0;
        var bp = baselinePP ? baselinePP(ps, G, rev, pc, pgc) : { promo: 0, prog: 0 };
        var tgtP = Math.min(pc, Math.max(ps.ops.promo || 0, bp.promo));
        var tgtG = Math.min(pgc, Math.max(ps.ops.progBudget || 0, bp.prog));
        if (psh >= loSh) {
          tgtP = Math.min(pc, Math.max(tgtP, Math.round(rev * pLo)));
          tgtG = Math.min(pgc, Math.max(tgtG, Math.round(rev * gLo)));
        }
        if (psh >= hiSh) {
          tgtP = Math.min(pc, Math.max(tgtP, Math.round(rev * pHi)));
          tgtG = Math.min(pgc, Math.max(tgtG, Math.round(rev * gHi)));
        }
        ps.ops.promo = tgtP;
        ps.ops.progBudget = tgtG;
        if (psh >= bumpSh && (G.cash || 0) > reserve + bumpCash) {
          var bump = Math.min(bumpMax, Math.round((G.cash - reserve) * bumpFrac));
          ps.progInvestment = (ps.progInvestment || 0) + bump;
        }
      }
    }

    if (acqFn) {
      pSt = refreshPlayerStations();
      var acqPad = agg ? 28000 : 80000;
      var maxAcq = agg ? 2 : 1;
      for (var ax = 0; ax < maxAcq; ax++) {
        pSt = refreshPlayerStations();
        if (!pSt.length) break;
        var onlyAm = pSt.every(function (st) {
          return st && st.sig && st.sig.type === 'AM' && !st.fmBooster;
        });
        var avail = (G.stations || []).filter(function (x) {
          return x && !x._bpSlotDeferred && !x.isPlayer && !x.isPublic;
        });
        var candidates = avail
          .map(function (x) {
            var pr =
              typeof window !== 'undefined' && typeof window.playerAcqAsk === 'function'
                ? window.playerAcqAsk(x, G)
                : typeof acqPrice === 'function'
                  ? acqPrice(x, G)
                  : 1e12;
            if (pr == null || !Number.isFinite(pr)) return false;
            var isFm = x.sig && x.sig.type === 'FM' && !x.fmBooster;
            return { s: x, price: pr, isFm: isFm };
          })
          .filter(function (o) {
            return (G.cash || 0) >= o.price + reserve + acqPad;
          });
        candidates.sort(function (a, b) {
          if (onlyAm && a.isFm !== b.isFm) return a.isFm ? -1 : 1;
          if (agg) {
            var sa = a.s.rat && a.s.rat.share != null ? a.s.rat.share : 0;
            var sb = b.s.rat && b.s.rat.share != null ? b.s.rat.share : 0;
            if (Math.abs(sb - sa) > 0.002) return sb - sa;
          }
          return a.price - b.price;
        });
        if (!candidates.length) break;
        var pick = candidates[0].s;
        var sig = pick.sig && pick.sig.type === 'FM' && !pick.fmBooster ? 'FM' : 'AM';
        if (typeof fccCanAcquire === 'function' && fccCanAcquire('player', sig, G)) {
          acqFn(G, pick);
        } else break;
        if (!agg) break;
        if ((G.cash || 0) < reserve * 3 + 520000) break;
      }
    }
  }

  function snowballBenchCopy(b) {
    b = b || {};
    return {
      counterPromoVsPlayer: b.counterPromoVsPlayer || 0,
      poachPlayerAttempts: b.poachPlayerAttempts || 0,
      rivalReformatsTotal: b.rivalReformatsTotal || 0,
      rivalReformatsHighPlayerPressure: b.rivalReformatsHighPlayerPressure || 0,
      rivalReformatsVsPlayerLane: b.rivalReformatsVsPlayerLane || 0,
    };
  }

  function snowballBenchDelta(a, b) {
    return {
      counterPromoVsPlayer: (b.counterPromoVsPlayer || 0) - (a.counterPromoVsPlayer || 0),
      poachPlayerAttempts: (b.poachPlayerAttempts || 0) - (a.poachPlayerAttempts || 0),
      rivalReformatsTotal: (b.rivalReformatsTotal || 0) - (a.rivalReformatsTotal || 0),
      rivalReformatsHighPlayerPressure: (b.rivalReformatsHighPlayerPressure || 0) - (a.rivalReformatsHighPlayerPressure || 0),
      rivalReformatsVsPlayerLane: (b.rivalReformatsVsPlayerLane || 0) - (a.rivalReformatsVsPlayerLane || 0),
    };
  }

  function snowballPlayerList(G) {
    if (G.ps && G.ps.length) {
      return G.ps.filter(function (x) {
        return x;
      });
    }
    return (G.stations || []).filter(function (s) {
      return s && s.isPlayer;
    });
  }

  function snowballCommercial(G) {
    return (G.stations || [])
      .filter(function (s) {
        return s && !s._bpSlotDeferred && !s.isPublic;
      })
      .sort(function (a, b) {
        return (b.rat && b.rat.share ? b.rat.share : 0) - (a.rat && a.rat.share ? a.rat.share : 0);
      });
  }

  function snowballTalentSig(sd) {
    if (!sd || !sd.talent) return '';
    var t = sd.talent;
    return String((t.lastName || '') + '|' + (t.firstName || '') + '|' + (t.quality || 0));
  }

  function snowballStationFp(st) {
    if (!st) return null;
    var prog = st.prog || {};
    var slots = {};
    ['morningDrive', 'afternoonDrive', 'midday', 'evening', 'overnight'].forEach(function (sl) {
      slots[sl] = prog[sl] ? snowballTalentSig(prog[sl]) : '';
    });
    var sig = st.sig || {};
    return {
      id: st.id,
      callLetters: st.callLetters,
      format: st.format,
      sigType: sig.type || '',
      fmBooster: !!st.fmBooster,
      slots: slots,
    };
  }

  function snowballDebt(G) {
    try {
      if (typeof debtPrincipalForPid === 'function') return debtPrincipalForPid(G, 0);
    } catch (e) {}
    var arr = G.loans || [];
    if (typeof loanPrincipalFromEntry === 'function') {
      return arr.reduce(function (s, l) {
        return s + loanPrincipalFromEntry(l);
      }, 0);
    }
    return 0;
  }

  function snowballDetectBotActions(preList, postList, preOps, postOps) {
    var preMap = {};
    preList.forEach(function (p) {
      preMap[p.id] = p;
    });
    var postMap = {};
    postList.forEach(function (p) {
      postMap[p.id] = p;
    });
    var acquisitions = [];
    var sales = [];
    var reformats = [];
    var hires = [];
    var talentChanges = [];
    var promoProgBumps = [];
    postList.forEach(function (b) {
      if (!preMap[b.id]) {
        acquisitions.push({
          id: b.id,
          call: b.callLetters,
          format: b.format,
          isFm: b.sigType === 'FM' && !b.fmBooster,
        });
      }
    });
    preList.forEach(function (a) {
      if (!postMap[a.id]) sales.push({ id: a.id, call: a.callLetters });
    });
    Object.keys(postMap).forEach(function (id) {
      var a = preMap[id];
      var b = postMap[id];
      if (!a || !b) return;
      if (a.format !== b.format) {
        reformats.push({ id: id, call: b.callLetters, fromFormat: a.format, toFormat: b.format });
      }
      ['morningDrive', 'afternoonDrive', 'midday', 'evening', 'overnight'].forEach(function (sl) {
        if (!a.slots[sl] && b.slots[sl]) hires.push({ stationId: id, call: b.callLetters, slot: sl });
        else if (a.slots[sl] && b.slots[sl] && a.slots[sl] !== b.slots[sl]) {
          talentChanges.push({ stationId: id, call: b.callLetters, slot: sl, was: a.slots[sl], now: b.slots[sl] });
        }
      });
    });
    Object.keys(postOps || {}).forEach(function (id) {
      var po = preOps[id] || { promo: 0, progBudget: 0 };
      var qo = postOps[id] || po;
      var dp = (qo.promo || 0) - (po.promo || 0);
      var dg = (qo.progBudget || 0) - (po.progBudget || 0);
      if (dp >= 8000 || dg >= 8000) {
        promoProgBumps.push({ stationId: id, promoDelta: dp, progBudgetDelta: dg });
      }
    });
    return {
      acquisitions: acquisitions,
      stationSales: sales,
      reformats: reformats,
      talentHires: hires,
      talentChanges: talentChanges,
      promoProgBumps: promoProgBumps,
    };
  }

  function snowballPortfolioMetrics(G) {
    var comm = snowballCommercial(G);
    var pSt = snowballPlayerList(G);
    var nAm = 0;
    var nFm = 0;
    var nTranslator = 0;
    var ranks = [];
    var topShare = 0;
    var cluster = 0;
    var byFmt = {};
    pSt.forEach(function (s) {
      var sig = s.sig || {};
      if (s.fmBooster) nTranslator++;
      else if (sig.type === 'FM') nFm++;
      else if (sig.type === 'AM') nAm++;
      var sh = s.rat && s.rat.share != null ? s.rat.share : 0;
      if (sh > topShare) topShare = sh;
      cluster += sh;
      var ix = comm.findIndex(function (c) {
        return c.id === s.id;
      });
      ranks.push(ix < 0 ? 999 : ix + 1);
      var f = s.format || 'UNK';
      byFmt[f] = (byFmt[f] || 0) + sh;
    });
    ranks.sort(function (a, b) {
      return a - b;
    });
    var nTop10 = ranks.filter(function (r) {
      return r <= 10;
    }).length;
    var nTop5 = ranks.filter(function (r) {
      return r <= 5;
    }).length;
    var rank1 = comm[0] && comm[0].isPlayer;
    var rank2player = comm[1] && comm[1].isPlayer;
    var laneMax = 0;
    Object.keys(byFmt).forEach(function (f) {
      if (byFmt[f] > laneMax) laneMax = byFmt[f];
    });
    var laneConcentration = cluster > 0.001 ? laneMax / cluster : 0;
    var top10Market = comm.slice(0, 10).map(function (c) {
      return {
        call: c.callLetters,
        share: Math.round((c.rat && c.rat.share != null ? c.rat.share : 0) * 10000) / 10000,
        format: c.format,
        isPlayer: !!c.isPlayer,
      };
    });
    var rev = 0;
    var ebitda = 0;
    var tal = 0;
    var fix = 0;
    var effPromo = 0;
    var effProg = 0;
    var synd = 0;
    pSt.forEach(function (s) {
      var fin = s.fin || {};
      rev += fin.rev || 0;
      ebitda += fin.ebitda || 0;
      tal += fin.tal || 0;
      fix += fin.fix || 0;
      effPromo += fin.effPromo || 0;
      effProg += fin.effProg || 0;
      synd += fin.syndicationRights || 0;
    });
    return {
      nStations: pSt.length,
      nAm: nAm,
      nFm: nFm,
      nTranslator: nTranslator,
      ranks: ranks,
      topShare: Math.round(topShare * 10000) / 10000,
      clusterShare: Math.round(cluster * 10000) / 10000,
      nTop10: nTop10,
      nTop5: nTop5,
      holdsRank1: !!rank1,
      holdsRank1And2: !!(rank1 && rank2player),
      laneConcentration: Math.round(laneConcentration * 1000) / 1000,
      top10Market: top10Market,
      totalRev: rev,
      totalEbitda: ebitda,
      totalTalentCost: tal,
      totalFixedCost: fix,
      totalEffPromo: effPromo,
      totalEffProg: effProg,
      totalSyndication: synd,
    };
  }

  function snowballBuildSummary(diary, optionsOut) {
    var firstRank1 = null;
    var firstAcq = null;
    var firstFmPeriod = null;
    var firstTwoStations = null;
    var firstTop10Pair = null;
    var maxCashJump = { delta: -1e18, year: null, period: null, step: null };
    var maxShareJump = { delta: 0, year: null, period: null, step: null, topShare: 0 };
    var runaway = null;
    var prevTop = 0;
    for (var i = 0; i < diary.length; i++) {
      var d = diary[i];
      if (d.holdsRank1 && firstRank1 == null) firstRank1 = { year: d.year, period: d.period, step: d.step };
      if (d.actions && d.actions.acquisitions && d.actions.acquisitions.length && firstAcq == null) {
        firstAcq = { year: d.year, period: d.period, step: d.step, detail: d.actions.acquisitions };
      }
      if (firstFmPeriod == null && d.nFm > 0) firstFmPeriod = { year: d.year, period: d.period, step: d.step };
      if (
        firstFmPeriod == null &&
        d.actions &&
        d.actions.acquisitions &&
        d.actions.acquisitions.some(function (x) {
          return x.isFm;
        })
      ) {
        firstFmPeriod = { year: d.year, period: d.period, step: d.step, viaAcquisition: true };
      }
      if (firstTwoStations == null && d.nStations >= 2) firstTwoStations = { year: d.year, period: d.period, step: d.step };
      if (firstTop10Pair == null && d.nTop10 >= 2) firstTop10Pair = { year: d.year, period: d.period, step: d.step };
      var cd = d.cashDelta || 0;
      if (cd > maxCashJump.delta) maxCashJump = { delta: cd, year: d.year, period: d.period, step: d.step };
      var sh = d.topShare || 0;
      var sj = sh - prevTop;
      if (i > 0 && sj > maxShareJump.delta) maxShareJump = { delta: sj, year: d.year, period: d.period, step: d.step, topShare: sh };
      prevTop = sh;
      if (runaway == null && d.clusterShare >= 0.22 && d.cashEnd >= 15000000) {
        runaway = { year: d.year, period: d.period, step: d.step, clusterShare: d.clusterShare, cashEnd: d.cashEnd };
      }
    }
    if (maxCashJump.delta === -1e18) maxCashJump = { delta: 0, year: null, period: null, step: null };
    var lastOperating = null;
    for (var j = 0; j < diary.length; j++) {
      if (diary[j].nStations > 0) lastOperating = diary[j];
    }
    return {
      scenario: optionsOut.scenId,
      market: optionsOut.marketId,
      difficulty: optionsOut.difficulty,
      seed: optionsOut.seed,
      endYear: optionsOut.endYear,
      playerPolicy: optionsOut.playerPolicy,
      activePlayer: optionsOut.activePlayer,
      periodsLogged: diary.length,
      firstYearPeriodRank1: firstRank1,
      firstAcquisition: firstAcq,
      firstFmOwned: firstFmPeriod,
      firstTwoStationCluster: firstTwoStations,
      firstTwoInTop10: firstTop10Pair,
      biggestCashJump: maxCashJump,
      biggestTopShareJump: maxShareJump,
      runawayGrowthSuspected: runaway,
      lastPeriodWithStations: lastOperating
        ? {
            year: lastOperating.year,
            period: lastOperating.period,
            step: lastOperating.step,
            nStations: lastOperating.nStations,
            cashEnd: lastOperating.cashEnd,
            clusterShare: lastOperating.clusterShare,
            topShare: lastOperating.topShare,
            nTop10: lastOperating.nTop10,
          }
        : null,
    };
  }

  function runMarketSnowballTrace(opts) {
    opts = opts || {};
    var endYear = opts.endYear != null ? opts.endYear : 2026;
    var endPeriod = opts.endPeriod != null ? opts.endPeriod : 2;
    var marketId = opts.marketId || (typeof ACTIVE_MARKET !== 'undefined' && ACTIVE_MARKET) || 'atlanta';
    var scenId = opts.scenId || 'under';
    var seed = opts.seed != null ? opts.seed : 505050;
    var easyAi = opts.easyAi === true;
    var useActiveBot = opts.activePlayer !== false;
    var playerPolicy = opts.playerPolicy === 'conservative' ? 'conservative' : 'aggressive';
    var maxStepsOverride = opts.maxSteps != null ? opts.maxSteps : null;
    var difficulty = easyAi ? 'EASY' : 'HARD';

    if (typeof window === 'undefined' || typeof window.genMarket !== 'function') {
      throw new Error('window.genMarket missing — load legacy.js first');
    }
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedMPMode = window.MP && MP.mode;
    var origRandom = Math.random;
    var rngHarness =
      typeof window._harnessInstallSeededBenchmarkRng === 'function' ? window._harnessInstallSeededBenchmarkRng(seed) : null;
    var st = seed;
    if (!rngHarness) {
      Math.random = function () {
        st = (st * 9301 + 49297) % 233280;
        return st / 233280;
      };
    }
    var storageQuiet =
      typeof window._harnessQuietWebStorageForBenchmark === 'function' ? window._harnessQuietWebStorageForBenchmark() : null;
    var diary = [];
    var optionsOut = {
      endYear: endYear,
      endPeriod: endPeriod,
      marketId: marketId,
      scenId: scenId,
      seed: seed,
      difficulty: difficulty,
      activePlayer: useActiveBot,
      playerPolicy: useActiveBot ? playerPolicy : 'n/a',
    };

    try {
      ACTIVE_MARKET = marketId;
      syncMarketPopToMarket(marketId);
      G = window.genMarket(scenId);
      if (G.sc) G.sc = Object.assign({}, G.sc, { diff: difficulty });
      if (typeof MP !== 'undefined' && MP) {
        MP.mode = 'solo';
        MP.isHost = false;
        if (MP.players) MP.players = [];
      }
      G._aiBench = {
        counterPromoVsPlayer: 0,
        poachPlayerAttempts: 0,
        rivalReformatsTotal: 0,
        rivalReformatsHighPlayerPressure: 0,
        rivalReformatsVsPlayerLane: 0,
      };
      G._traceCashBridge = true;

      var startY = G.year || 1970;
      var stepLimit =
        maxStepsOverride != null ? maxStepsOverride : Math.min(320, Math.max(24, (endYear - startY) * 2 + endPeriod + 12));
      var ui = patchTimersAndUi();
      var steps = 0;
      try {
        while (steps < stepLimit) {
          var y0 = G.year;
          var p0 = G.period;
          if (y0 > endYear || (y0 === endYear && p0 > endPeriod)) break;

          var cashStart = G.cash || 0;
          var debtStart = snowballDebt(G);
          var benchBefore = snowballBenchCopy(G._aiBench);

          var pListBefore = snowballPlayerList(G).map(snowballStationFp);
          var preOps = {};
          snowballPlayerList(G).forEach(function (stn) {
            var op = stn.ops || {};
            preOps[stn.id] = { promo: op.promo || 0, progBudget: op.progBudget || 0 };
          });

          if (useActiveBot) runAirwaveBenchmarkPlayerBotTurn(G, playerPolicy);

          var pListAfterBot = snowballPlayerList(G).map(snowballStationFp);
          var postOps = {};
          snowballPlayerList(G).forEach(function (stn) {
            var op = stn.ops || {};
            postOps[stn.id] = { promo: op.promo || 0, progBudget: op.progBudget || 0 };
          });
          var actions = snowballDetectBotActions(pListBefore, pListAfterBot, preOps, postOps);

          var cashAfterBot = G.cash || 0;
          advTurn();
          steps++;

          var cashEnd = G.cash || 0;
          var debtEnd = snowballDebt(G);
          var benchAfter = snowballBenchCopy(G._aiBench);
          var aiDelta = snowballBenchDelta(benchBefore, benchAfter);
          var pm = snowballPortfolioMetrics(G);

          var row = {
            step: steps,
            simTurn: G.turn,
            year: y0,
            period: p0,
            afterTurnYear: G.year,
            afterTurnPeriod: G.period,
            marketId: marketId,
            scenId: scenId,
            difficulty: difficulty,
            cashStart: cashStart,
            cashEnd: cashEnd,
            cashDelta: cashEnd - cashStart,
            cashAfterBot: cashAfterBot,
            botCashDelta: cashAfterBot - cashStart,
            advTurnCashDelta: cashEnd - cashAfterBot,
            debtStart: debtStart,
            debtEnd: debtEnd,
            debtDelta: debtEnd - debtStart,
            soloBankrupt: !!G._soloBankrupt,
            actions: actions,
            aiDelta: aiDelta,
            aiBenchCumulative: benchAfter,
          };
          var br = G._lastSoloCashBridge || null;
          row.cashBridge = br;
          var _pnc = br != null ? Number(br.pressure_net_cash_delta) || 0 : null;
          row.pressureNetCashDelta = _pnc;
          row.hasPressureCash = _pnc != null && _pnc > 0;
          row.distressSaleCashThisPeriod = row.hasPressureCash;
          if (br && typeof br.cash_before_advance === 'number') {
            row.traceAdvTurnCashStartVsBridge = cashAfterBot - br.cash_before_advance;
            var advExpl =
              typeof br.cash_after_all_rollover_steps === 'number'
                ? br.cash_after_all_rollover_steps - br.cash_before_advance
                : row.advTurnCashDelta;
            row.traceFullPeriodResidual =
              cashEnd - cashStart - (cashAfterBot - cashStart) - advExpl;
          } else {
            row.traceAdvTurnCashStartVsBridge = null;
            row.traceFullPeriodResidual = null;
          }
          for (var k in pm) {
            if (Object.prototype.hasOwnProperty.call(pm, k)) row[k] = pm[k];
          }
          var pListFmt = snowballPlayerList(G);
          row.playerPrimaryFormat = null;
          row.playerBand = null;
          if (pListFmt.length === 1) {
            var s0 = pListFmt[0];
            row.playerPrimaryFormat = s0.format || 'UNK';
            if (s0.fmBooster) row.playerBand = 'TRANSLATOR';
            else if ((s0.sig || {}).type === 'FM') row.playerBand = 'FM';
            else if ((s0.sig || {}).type === 'AM') row.playerBand = 'AM';
            else row.playerBand = 'OTHER';
          }
          diary.push(row);
        }
      } finally {
        ui.restore();
        if (G) {
          G._traceCashBridge = false;
          try {
            delete G._lastSoloCashBridge;
          } catch (e2) {}
        }
      }

      var summary = snowballBuildSummary(diary, optionsOut);
      var lines = [];
      lines.push('AIRWAVE EMPIRE — MARKET SNOWBALL TRACE (diagnosis)');
      lines.push(
        'Setup: ' +
          scenId +
          ' · ' +
          marketId +
          ' · ' +
          difficulty +
          ' · seed ' +
          seed +
          ' · bot ' +
          (useActiveBot ? playerPolicy : 'passive')
      );
      lines.push('Periods logged: ' + diary.length);
      lines.push('');
      lines.push('Milestones:');
      lines.push('  First #1 station: ' + (summary.firstYearPeriodRank1 ? summary.firstYearPeriodRank1.year + ' P' + summary.firstYearPeriodRank1.period : 'never'));
      lines.push('  First acquisition: ' + (summary.firstAcquisition ? summary.firstAcquisition.year + ' P' + summary.firstAcquisition.period : 'none'));
      lines.push('  First FM in portfolio: ' + (summary.firstFmOwned ? summary.firstFmOwned.year + ' P' + summary.firstFmOwned.period : 'never'));
      lines.push('  First 2+ stations: ' + (summary.firstTwoStationCluster ? summary.firstTwoStationCluster.year + ' P' + summary.firstTwoStationCluster.period : 'never'));
      lines.push('  First 2+ in top-10: ' + (summary.firstTwoInTop10 ? summary.firstTwoInTop10.year + ' P' + summary.firstTwoInTop10.period : 'never'));
      lines.push('  Largest cash delta (one period): $' + Math.round(summary.biggestCashJump.delta) + (summary.biggestCashJump.year ? ' @ ' + summary.biggestCashJump.year + ' P' + summary.biggestCashJump.period : ''));
      lines.push(
        '  Largest top-station share jump: +' +
          (Math.round(summary.biggestTopShareJump.delta * 10000) / 10000) +
          (summary.biggestTopShareJump.year ? ' @ ' + summary.biggestTopShareJump.year + ' P' + summary.biggestTopShareJump.period : '')
      );
      lines.push(
        '  Runaway heuristic (cluster≥0.22 & cash≥$15M): ' +
          (summary.runawayGrowthSuspected ? summary.runawayGrowthSuspected.year + ' P' + summary.runawayGrowthSuspected.period : 'none flagged')
      );
      lines.push(
        '  Last period with ≥1 station: ' +
          (summary.lastPeriodWithStations
            ? summary.lastPeriodWithStations.year +
              ' P' +
              summary.lastPeriodWithStations.period +
              ' · ' +
              summary.lastPeriodWithStations.nStations +
              ' st · cash $' +
              Math.round(summary.lastPeriodWithStations.cashEnd) +
              ' · cluster ' +
              summary.lastPeriodWithStations.clusterShare
            : 'never')
      );
      lines.push('');
      lines.push('Final period snapshot (calendar last row):');
      if (diary.length) {
        var L = diary[diary.length - 1];
        lines.push(
          '  cash $' +
            Math.round(L.cashEnd) +
            ' · debt $' +
            Math.round(L.debtEnd) +
            ' · stations ' +
            L.nStations +
            ' (AM ' +
            L.nAm +
            ' FM ' +
            L.nFm +
            ' xlat ' +
            L.nTranslator +
            ') · bankrupt flag ' +
            (L.soloBankrupt ? 'yes' : 'no') +
            ' · cluster share ' +
            L.clusterShare +
            ' · top share ' +
            L.topShare +
            ' · top10 count ' +
            L.nTop10
        );
        if (L.nStations === 0 && summary.lastPeriodWithStations) {
          lines.push('  (Portfolio empty at end — use “last period with stations” + JSON diary for last operating economics.)');
        }
      }
      lines.push('');
      lines.push('Full diary: JSON export (trace / analyze scripts).');

      return {
        summary: summary,
        diary: diary,
        plainEnglish: lines.join('\n'),
        options: optionsOut,
      };
    } finally {
      if (storageQuiet) storageQuiet.restore();
      if (rngHarness) rngHarness.restore();
      else Math.random = origRandom;
      G = savedG;
      if (typeof ACTIVE_MARKET !== 'undefined' && savedActive != null) ACTIVE_MARKET = savedActive;
      if (typeof MP !== 'undefined' && MP && savedMPMode !== undefined) MP.mode = savedMPMode;
    }
  }

  window.runAirwaveBenchmarkPlayerBotTurn = runAirwaveBenchmarkPlayerBotTurn;
  window.runMarketSnowballTrace = runMarketSnowballTrace;
})();
