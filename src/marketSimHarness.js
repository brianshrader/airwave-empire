/**
 * Market simulation batch harness — read-only analysis (does not change game rules).
 * DEV-ONLY: loaded from play.html in `vite dev`; stripped from production HTML and not copied to dist (see vite.config.js).
 *
 * Requires legacy.js loaded (genMarketMP, advTurn, G, ACTIVE_MARKET, FM, TALK_FMTS, syncMarketPopToMarket, MP).
 *
 * Usage (browser console after loading the game):
 *   runMarketSimulationBatch({ marketId: 'atlanta', endYear: 2000, numRuns: 20 })
 *   // Heavy: 60+ periods × N runs — start with numRuns: 5–10
 */
(function () {
  'use strict';

  var TALK_FMTS = ['NEWS_TALK', 'SPORTS_TALK', 'PODCAST_TALK', 'ALL_NEWS'];

  /** Rough ordinal strength for AM/FM power tokens (higher = stronger). */
  function signalStrengthScore(st) {
    if (!st || !st.sig) return 0;
    if (st.fmBooster) return 0.3;
    var pw = st.sig.pw || '';
    var map = { '100kw': 6, '50kw': 5, '25kw': 4, '10kw': 3, '5kw': 2.5, '1kw': 1.5, DA: 2, translator: 0.5 };
    var base = map[pw] != null ? map[pw] : 1;
    if (st.sig.type === 'FM') base += 0.15;
    return base;
  }

  function isAmMusic(st) {
    return st && st.sig && st.sig.type === 'AM' && !TALK_FMTS.includes(st.format);
  }

  function eraBucket(year) {
    if (year >= 1970 && year <= 1979) return '1970s';
    if (year >= 1980 && year <= 1989) return '1980s';
    if (year >= 1990 && year <= 1999) return '1990s';
    return 'other';
  }

  function commercialStations(G) {
    return (G.stations || []).filter(function (s) {
      return s && !s._bpSlotDeferred && !s.isPublic;
    });
  }

  function pearsonCorr(xs, ys) {
    var n = Math.min(xs.length, ys.length);
    if (n < 2) return null;
    var mx = 0,
      my = 0;
    for (var i = 0; i < n; i++) {
      mx += xs[i];
      my += ys[i];
    }
    mx /= n;
    my /= n;
    var num = 0,
      dx = 0,
      dy = 0;
    for (var j = 0; j < n; j++) {
      var vx = xs[j] - mx;
      var vy = ys[j] - my;
      num += vx * vy;
      dx += vx * vx;
      dy += vy * vy;
    }
    if (dx < 1e-12 || dy < 1e-12) return null;
    return num / Math.sqrt(dx * dy);
  }

  function rankCorrShareRev(comm) {
    var byShare = comm.slice().sort(function (a, b) {
      return (b.rat && b.rat.share) - (a.rat && a.rat.share);
    });
    var byRev = comm.slice().sort(function (a, b) {
      return (b.fin && b.fin.rev || 0) - (a.fin && a.fin.rev || 0);
    });
    var shareRank = new Map();
    var revRank = new Map();
    byShare.forEach(function (s, i) {
      shareRank.set(s.id, i + 1);
    });
    byRev.forEach(function (s, i) {
      revRank.set(s.id, i + 1);
    });
    var xs = [];
    var ys = [];
    comm.forEach(function (s) {
      xs.push(shareRank.get(s.id));
      ys.push(revRank.get(s.id));
    });
    return pearsonCorr(xs, ys);
  }

  function topN(arr, n, keyFn) {
    return arr
      .slice()
      .sort(function (a, b) {
        return keyFn(b) - keyFn(a);
      })
      .slice(0, n);
  }

  function snapshotPeriod(G, periodYear, periodNum) {
    var comm = commercialStations(G);
    var byShare = topN(
      comm,
      comm.length,
      function (s) {
        return s.rat && s.rat.share ? s.rat.share : 0;
      }
    );
    var byRev = topN(comm, comm.length, function (s) {
      return s.fin && s.fin.rev ? s.fin.rev : 0;
    });
    var top5Share = byShare.slice(0, 5).map(stationRow);
    var top5Rev = byRev.slice(0, 5).map(stationRow);
    var ratios = comm.map(function (s) {
      var sh = s.rat && s.rat.share ? s.rat.share : 0;
      var rev = s.fin && s.fin.rev ? s.fin.rev : 0;
      return {
        id: s.id,
        callLetters: s.callLetters,
        format: s.format,
        share: sh,
        rev: rev,
        revPerSharePoint: sh > 0.001 ? rev / (sh * 100) : null,
      };
    });
    var fmtTopRev = {};
    byRev.slice(0, 5).forEach(function (s) {
      fmtTopRev[s.format] = (fmtTopRev[s.format] || 0) + 1;
    });
    var sigVsRev = byRev.slice(0, 10).map(function (s) {
      return {
        call: s.callLetters,
        format: s.format,
        pw: s.sig && s.sig.pw,
        sigType: s.sig && s.sig.type,
        strength: signalStrengthScore(s),
        share: s.rat && s.rat.share,
        rev: s.fin && s.fin.rev,
      };
    });
    return {
      year: periodYear,
      period: periodNum,
      label: periodYear + ' ' + (periodNum === 1 ? 'SPR' : 'FAL'),
      top5ByShare: top5Share,
      top5ByRev: top5Rev,
      shareRevRatios: ratios,
      formatCountsTop5Rev: fmtTopRev,
      signalVsRevTop: sigVsRev,
      rankCorrelation: rankCorrShareRev(comm),
    };
  }

  function stationRow(s) {
    return {
      callLetters: s.callLetters,
      format: s.format,
      share: s.rat && s.rat.share,
      rev: s.fin && s.fin.rev,
      pw: s.sig && s.sig.pw,
      sig: s.sig && s.sig.type,
      strength: signalStrengthScore(s),
    };
  }

  function patchTimersAndUi() {
    var origSetTimeout = window.setTimeout;
    var origSetInterval = window.setInterval;
    window.setTimeout = function (fn, t) {
      if (typeof fn === 'function') fn();
      return 0;
    };
    window.setInterval = function () {
      return 0;
    };
    var origGetElementById = document.getElementById;
    document.getElementById = function (id) {
      if (id === 'abtn') {
        return { disabled: false, textContent: '', style: {} };
      }
      return origGetElementById.call(document, id);
    };
    var noop = function () {};
    var saved = {};
    ['renderAll', 'showSum', 'showGrade', 'autoSave', 'showToast', 'injectTradeNewsForeshadow', 'queuePlayerTalentPortraits', 'queueAutoLogosForPlayerStations', 'flushMilestones'].forEach(function (name) {
      if (typeof window[name] === 'function') {
        saved[name] = window[name];
        window[name] = noop;
      }
    });
    if (window.MP && typeof MP.renderStatus === 'function') {
      saved._mpRenderStatus = MP.renderStatus;
      MP.renderStatus = noop;
    }
    return {
      restore: function () {
        window.setTimeout = origSetTimeout;
        window.setInterval = origSetInterval;
        document.getElementById = origGetElementById;
        Object.keys(saved).forEach(function (k) {
          if (k === '_mpRenderStatus') {
            if (window.MP) MP.renderStatus = saved[k];
          } else {
            window[k] = saved[k];
          }
        });
      },
    };
  }

  function eraForGenMarketMP(startYear) {
    if (startYear <= 1970) return '1970';
    if (startYear <= 1978) return '1978';
    return '1985';
  }

  /**
   * @param {object} opts
   * @param {string} [opts.marketId='atlanta']
   * @param {number} [opts.startYear=1970]
   * @param {number} [opts.endYear=2000]
   * @param {number} [opts.endPeriod=2] 1=spring 2=fall — last simulated period
   * @param {number} [opts.numRuns=30]
   * @param {number} [opts.seed] — LCG seed for Math.random
   * @param {boolean} [opts.verbose=true] console.log tables
   */
  function runMarketSimulationBatch(opts) {
    opts = opts || {};
    var marketId = opts.marketId || (typeof ACTIVE_MARKET !== 'undefined' && ACTIVE_MARKET) || 'atlanta';
    var startYear = opts.startYear != null ? opts.startYear : 1970;
    var endYear = opts.endYear != null ? opts.endYear : 2000;
    var endPeriod = opts.endPeriod != null ? opts.endPeriod : 2;
    var numRuns = opts.numRuns != null ? opts.numRuns : 30;
    var verbose = opts.verbose !== false;
    var maxStepsPerRun = opts.maxStepsPerRun != null ? opts.maxStepsPerRun : 140;

    if (typeof genMarketMP !== 'function') throw new Error('genMarketMP not found — load legacy.js first');
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedMPMode = window.MP && MP.mode;
    var origRandom = Math.random;

    var runs = [];
    var aggregateByEraFormat = { '1970s': {}, '1980s': {}, '1990s': {} };
    var gap12Samples = [];
    var corrSamples = [];
    var diagnostics = { lowCpmDominant1990s: [], amMusicTopAfter1990: [], weakBeatsStrong: [] };

    var seed = opts.seed != null ? opts.seed : Date.now() & 0xffffffff;

    try {
      for (var run = 0; run < numRuns; run++) {
        (function (seedRun) {
          var s = seedRun;
          Math.random = function () {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
          };
        })(seed + run * 9973);

        ACTIVE_MARKET = marketId;
        syncMarketPopToMarket(marketId);

        var eraKey = eraForGenMarketMP(startYear);
        G = genMarketMP(eraKey);

        if (G.year !== startYear && startYear === 1970) {
          /* genMarketMP('1970') opens at 1970 */
        }
        MP.mode = 'solo';
        MP.isHost = false;
        if (MP.players) MP.players = [];

        var periodSnapshots = [];
        var ui = patchTimersAndUi();
        var steps = 0;

        try {
          while (steps < maxStepsPerRun) {
            var y0 = G.year;
            var p0 = G.period;
            if (y0 > endYear || (y0 === endYear && p0 > endPeriod)) break;

            advTurn();
            steps++;

            var snap = snapshotPeriod(G, y0, p0);
            periodSnapshots.push(snap);

            var eb = eraBucket(y0);
            if (aggregateByEraFormat[eb]) {
              commercialStations(G).forEach(function (st) {
                var f = st.format;
                if (!aggregateByEraFormat[eb][f]) aggregateByEraFormat[eb][f] = { sum: 0, n: 0 };
                aggregateByEraFormat[eb][f].sum += st.fin && st.fin.rev ? st.fin.rev : 0;
                aggregateByEraFormat[eb][f].n += 1;
              });
            }

            if (snap.top5ByRev && snap.top5ByRev.length >= 2) {
              var r1 = snap.top5ByRev[0].rev || 0;
              var r2 = snap.top5ByRev[1].rev || 0;
              if (r2 > 0) gap12Samples.push({ year: y0, period: p0, ratio: r1 / r2, run: run });
            }
            if (snap.rankCorrelation != null) {
              corrSamples.push({ year: y0, period: p0, rho: snap.rankCorrelation, run: run });
            }

            /* Diagnostics */
            if (y0 >= 1990 && y0 <= 1999) {
              var lowCpmTop = snap.top5ByRev.filter(function (row) {
                var fd = FM && FM[row.format];
                return fd && typeof fd.cpm === 'number' && fd.cpm < 0.92;
              }).length;
              if (lowCpmTop >= 3 && diagnostics.lowCpmDominant1990s.length < 40) {
                diagnostics.lowCpmDominant1990s.push({
                  run: run,
                  year: y0,
                  lowCpmCountInTop5: lowCpmTop,
                  formats: snap.top5ByRev.map(function (r) {
                    return r.format;
                  }),
                });
              }
            }
            if (y0 > 1990 && snap.top5ByRev && snap.top5ByRev[0]) {
              var tr = snap.top5ByRev[0];
              var stTop = commercialStations(G).find(function (x) {
                return x.callLetters === tr.callLetters;
              });
              if (stTop && isAmMusic(stTop)) {
                diagnostics.amMusicTopAfter1990.push({ run: run, year: y0, station: tr.callLetters, format: tr.format });
              }
            }
            var comm = commercialStations(G);
            for (var i = 0; i < comm.length; i++) {
              for (var j = i + 1; j < comm.length; j++) {
                var a = comm[i],
                  b = comm[j];
                var sa = a.rat && a.rat.share ? a.rat.share : 0;
                var sb = b.rat && b.rat.share ? b.rat.share : 0;
                if (Math.abs(sa - sb) > 0.035) continue;
                var ra = a.fin && a.fin.rev ? a.fin.rev : 0;
                var rb = b.fin && b.fin.rev ? b.fin.rev : 0;
                if (
                  signalStrengthScore(a) < signalStrengthScore(b) - 0.5 &&
                  ra > rb * 1.2 &&
                  sa >= sb - 0.01 &&
                  diagnostics.weakBeatsStrong.length < 80
                ) {
                  diagnostics.weakBeatsStrong.push({
                    run: run,
                    year: y0,
                    weak: a.callLetters,
                    strong: b.callLetters,
                    sa: sa,
                    sb: sb,
                    ra: ra,
                    rb: rb,
                  });
                }
              }
            }
          }
        } finally {
          ui.restore();
        }

        runs.push({ runIndex: run, seed: seed + run * 9973, steps: steps, periodSnapshots: periodSnapshots });
      }
    } finally {
      Math.random = origRandom;
      G = savedG;
      if (typeof ACTIVE_MARKET !== 'undefined' && savedActive != null) ACTIVE_MARKET = savedActive;
      if (window.MP && savedMPMode !== undefined) MP.mode = savedMPMode;
    }

    /* Aggregate averages */
    var avgRevByFormatEra = {};
    Object.keys(aggregateByEraFormat).forEach(function (er) {
      avgRevByFormatEra[er] = {};
      Object.keys(aggregateByEraFormat[er]).forEach(function (fmt) {
        var o = aggregateByEraFormat[er][fmt];
        avgRevByFormatEra[er][fmt] = o.n > 0 ? o.sum / o.n : 0;
      });
    });

    var avgGap12 =
      gap12Samples.length > 0 ? gap12Samples.reduce(function (s, x) { return s + x.ratio; }, 0) / gap12Samples.length : null;
    var avgCorr =
      corrSamples.length > 0 ? corrSamples.reduce(function (s, x) { return s + x.rho; }, 0) / corrSamples.length : null;

    var summary = {
      options: { marketId: marketId, startYear: startYear, endYear: endYear, endPeriod: endPeriod, numRuns: numRuns, seed: seed },
      avgRevenueByFormatPerEra: avgRevByFormatEra,
      avgRevenueGapTop1Vs2: avgGap12,
      avgShareRevRankCorrelation: avgCorr,
      diagnostics: {
        lowCpmDominant1990sCount: diagnostics.lowCpmDominant1990s.length,
        amMusicTopEarnerAfter1990Count: diagnostics.amMusicTopAfter1990.length,
        weakSignalOutperformsStrongCount: diagnostics.weakBeatsStrong.length,
        samples: diagnostics,
      },
      runs: runs.map(function (r) {
        return { runIndex: r.runIndex, steps: r.steps, periodsRecorded: r.periodSnapshots.length };
      }),
    };

    if (verbose && typeof console !== 'undefined') {
      console.log('══ Market simulation batch ══');
      console.table(
        Object.keys(avgRevByFormatEra['1970s'] || {})
          .concat(Object.keys(avgRevByFormatEra['1980s'] || {}))
          .concat(Object.keys(avgRevByFormatEra['1990s'] || {}))
          .filter(function (v, i, a) {
            return a.indexOf(v) === i;
          })
          .map(function (fmt) {
            return {
              format: fmt,
              avgRev1970s: (avgRevByFormatEra['1970s'] && avgRevByFormatEra['1970s'][fmt]) || '—',
              avgRev1980s: (avgRevByFormatEra['1980s'] && avgRevByFormatEra['1980s'][fmt]) || '—',
              avgRev1990s: (avgRevByFormatEra['1990s'] && avgRevByFormatEra['1990s'][fmt]) || '—',
            };
          })
      );
      console.log('Avg #1/#2 revenue ratio (when top5 available):', avgGap12 != null ? avgGap12.toFixed(3) : 'n/a');
      console.log('Avg share-rank vs revenue-rank correlation (Pearson on ranks):', avgCorr != null ? avgCorr.toFixed(3) : 'n/a');
      console.log('Diagnostic flags:', summary.diagnostics);
      console.log('Full summary JSON (also return value):', summary);
    }

    return summary;
  }

  window.runMarketSimulationBatch = runMarketSimulationBatch;
  window.MarketSimHarness = {
    runBatch: runMarketSimulationBatch,
    signalStrengthScore: signalStrengthScore,
  };
})();
