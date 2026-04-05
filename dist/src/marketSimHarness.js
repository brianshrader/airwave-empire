/**
 * Market simulation batch harness — read-only analysis (does not change game rules).
 * DEV-ONLY: loaded from play.html in `vite dev`; stripped from production HTML and not copied to dist (see vite.config.js).
 *
 * Requires legacy.js loaded (genMarketMP, advTurn, G, ACTIVE_MARKET, FM, TALK_FMTS, syncMarketPopToMarket, MP).
 *
 * Usage (browser console after loading the game):
 *   runMarketSimulationBatch({ marketId: 'atlanta', endYear: 2000, numRuns: 20 })
 *   // Heavy: 60+ periods × N runs — start with numRuns: 5–10
 *
 * Share calibration (other audio / fragmentation) — plain-English batch report:
 *   runShareCalibrationInspection({ quick: true })  // or npm run inspect:shares (see inspect-shares.html)
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

  /**
   * Requires legacy.js: prints `otherAudioShareFraction(year, marketId)` grid (structural dilution model).
   */
  function otherAudioDilutionTable() {
    if (typeof window.otherAudioShareFraction !== 'function') {
      console.warn('otherAudioDilutionTable: load legacy.js first (otherAudioShareFraction).');
      return null;
    }
    var markets = ['newyork', 'losangeles', 'chicago', 'atlanta', 'nashville'];
    var years = [1975, 1985, 1995, 2000, 2010, 2020, 2025];
    var rows = [];
    years.forEach(function (y) {
      markets.forEach(function (mid) {
        var f = window.otherAudioShareFraction(y, mid);
        rows.push({ year: y, market: mid, otherAudio: f, modeledField: 1 - f });
      });
    });
    console.table(rows);
    return rows;
  }

  function decadeForShareCalibration(y) {
    if (y >= 2020) return '2020s';
    if (y >= 2010) return '2010s';
    if (y >= 2000) return '2000s';
    return null;
  }

  function formatShareCalibrationPlainEnglish(agg, sampleCount, opts) {
    var lines = [];
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('  SHARE CALIBRATION CHECK (other audio / fragmentation)');
    lines.push('  Uses the real advTurn → recalc pipeline (same as gameplay).');
    lines.push('══════════════════════════════════════════════════════════════');
    if (opts && opts.quick) {
      lines.push('Note: Quick mode (fewer markets/runs). For a fuller sample, open inspect-shares.html');
      lines.push('without ?quick=1, or run runShareCalibrationInspection({ quick: false }) in the console.');
    }
    lines.push('');

    function pct(x) {
      return (Math.round(x * 10) / 10) + '%';
    }

    var keys = Object.keys(agg).sort();
    keys.forEach(function (k) {
      var o = agg[k];
      if (!o || o.n < 1) return;
      var avg1 = (o.sumTop1 / o.n) * 100;
      var avg2 = (o.sumTop2 / o.n) * 100;
      var p10 = (o.n_top1_ge_10 / o.n) * 100;
      var p2 = (o.n_ge2_stations_ge_10 / o.n) * 100;
      var p3 = (o.n_ge3_stations_ge_10 / o.n) * 100;
      var parts = k.split('|');
      lines.push('— ' + parts[0] + ' · tier ' + parts[1] + ' — (' + o.n + ' sampled periods)');
      lines.push('  · Average #1 share: ~' + avg1.toFixed(1) + '% · Average #2: ~' + avg2.toFixed(1) + '%');
      lines.push('  · Periods where the leader had 10+ share: ' + pct(p10) + ' of samples.');
      lines.push('  · Periods with 2+ stations at 10+ share: ' + pct(p2) + '.');
      lines.push('  · Periods with 3+ stations at 10+ share: ' + pct(p3) + '.');
      lines.push('');
    });

    lines.push('──────────────────────────────────────────────────────────────');
    lines.push('QUESTIONS (plain answers)');
    lines.push('──────────────────────────────────────────────────────────────');

    var a2020Large = agg['2020s|large'];
    var a2020Mega = agg['2020s|mega'];
    var a2020Med = agg['2020s|medium'];
    var a2000Mega = agg['2000s|mega'];
    var a2010Mega = agg['2010s|mega'];
    var anyMegaModern10 =
      (a2000Mega && a2000Mega.n_top1_ge_10 > 0) ||
      (a2010Mega && a2010Mega.n_top1_ge_10 > 0) ||
      (a2020Mega && a2020Mega.n_top1_ge_10 > 0);

    if (a2020Mega && a2020Mega.n > 0) {
      lines.push(
        '1) In the 2020s, are 10+ share stations still possible (mega markets)? ' +
          (a2020Mega.n_top1_ge_10 > 0
            ? 'Yes — in this sample, a leader at 10+ occurred in ' +
                pct((a2020Mega.n_top1_ge_10 / a2020Mega.n) * 100) +
                ' of mega-market 2020s periods.'
            : anyMegaModern10
              ? 'Not in the 2020s mega bucket in this draw, but other modern mega buckets (2000s/2010s) did show 10+ leaders — breakouts are still in play; try more runs for 2020s specifically.'
              : 'In this sample, no mega period hit a 10+ leader — try more runs.')
      );
    } else {
      lines.push('1) In the 2020s, are 10+ share stations still possible? (No mega-tier 2020s aggregate in this run — widen markets or runs.)');
    }

    if ((a2020Large && a2020Large.n > 0) || (a2020Mega && a2020Mega.n > 0)) {
      var bits = [];
      if (a2020Large && a2020Large.n > 0) {
        bits.push(
          'Large tier: two or more stations at 10+ in ' + pct((a2020Large.n_ge2_stations_ge_10 / a2020Large.n) * 100) + ' of periods'
        );
      }
      if (a2020Mega && a2020Mega.n > 0) {
        bits.push(
          'Mega tier: two or more stations at 10+ in ' + pct((a2020Mega.n_ge2_stations_ge_10 / a2020Mega.n) * 100) + ' of periods'
        );
      }
      lines.push('2) After 2000, how often do 2+ stations exceed 10 share (large / mega)? ' + bits.join(' · ') + '.');
    } else {
      lines.push('2) Two+ stations above 10 in large/mega: insufficient 2020s samples in this run.');
    }

    lines.push('3) Believable range (leaders often ~5–8%, occasional breakouts)?');
    if (a2020Large && a2020Large.n > 0) {
      var m1 = (a2020Large.sumTop1 / a2020Large.n) * 100;
      lines.push('   Large-market average #1 share (2020s, this run): ~' + m1.toFixed(1) + '%.');
    }
    if (a2020Mega && a2020Mega.n > 0) {
      var m1b = (a2020Mega.sumTop1 / a2020Mega.n) * 100;
      lines.push('   Mega-market average #1 share (2020s, this run): ~' + m1b.toFixed(1) + '%.');
    }
    if (a2020Med && a2020Med.n > 0) {
      var m1c = (a2020Med.sumTop1 / a2020Med.n) * 100;
      lines.push('   Medium-market average #1 share (2020s, this run): ~' + m1c.toFixed(1) + '%.');
    }

    var saw2020s10 = false;
    var sawModern10 = false;
    keys.forEach(function (k) {
      if (k.indexOf('2020s') === 0 && agg[k] && agg[k].n_top1_ge_10 > 0) saw2020s10 = true;
      if ((k.indexOf('2000s') === 0 || k.indexOf('2010s') === 0 || k.indexOf('2020s') === 0) && agg[k] && agg[k].n_top1_ge_10 > 0) {
        sawModern10 = true;
      }
    });
    lines.push(
      '4) Over-flattening? ' +
        (sampleCount > 30 && !sawModern10
          ? 'Possible: no 10+ leader in any 2000s-era bucket in this sample — try increasing numRunsPerMarket or check calibration.'
          : sawModern10
            ? 'No strong sign of total flattening: at least some modern periods still show a 10+ leader.'
            : 'Inconclusive on flattening — increase sample size for firmer conclusions.')
    );

    lines.push('');
    lines.push('──────────────────────────────────────────────────────────────');
    lines.push('FLAGS');
    lines.push('──────────────────────────────────────────────────────────────');
    if (a2020Large && a2020Large.n > 15 && a2020Large.n_ge2_stations_ge_10 / a2020Large.n > 0.2) {
      lines.push('⚠ Large 2020s: 2+ stations at 10%+ in a high share of periods — compare to real PPM expectations.');
    }
    if (a2020Mega && a2020Mega.n > 15 && a2020Mega.n_ge2_stations_ge_10 / a2020Mega.n > 0.15) {
      lines.push('⚠ Mega 2020s: multiple double-digit stations fairly often — may be hot vs typical fragmented markets.');
    }
    if (a2020Large && a2020Large.n > 40 && a2020Large.n_top1_ge_10 / a2020Large.n < 0.05) {
      lines.push('⚠ Large 2020s: very rare 10+ leaders — possible over-flattening.');
    }

    lines.push('');
    lines.push('Total sampled periods (year ≥ ' + (opts && opts.minRecordYear != null ? opts.minRecordYear : 2000) + '): ' + sampleCount);
    return lines.join('\n');
  }

  /**
   * Batch-run advTurn across markets and aggregate rating shares (post–other-audio dilution).
   * @param {object} [opts]
   * @param {string[]} [opts.markets] — default five: Nashville, Atlanta, NY, LA, Chicago
   * @param {boolean} [opts.quick] — fewer markets and runs (faster smoke test)
   * @param {number} [opts.numRunsPerMarket] — default 4 (or 2 when quick)
   * @param {number} [opts.startYear] — scenario era for genMarketMP (1985 = fewer steps to 2000s)
   * @param {number} [opts.endYear] default 2025
   * @param {number} [opts.minRecordYear] default 2000 — only aggregate snapshots at or after this year
   * @param {boolean} [opts.verbose] default true — console.log summary
   */
  function runShareCalibrationInspection(opts) {
    opts = opts || {};
    var markets = opts.markets;
    if (!markets || !markets.length) {
      markets = opts.quick ? ['nashville', 'atlanta', 'newyork'] : ['nashville', 'atlanta', 'newyork', 'losangeles', 'chicago'];
    }
    var numRunsPerMarket = opts.numRunsPerMarket != null ? opts.numRunsPerMarket : opts.quick ? 2 : 4;
    var endYear = opts.endYear != null ? opts.endYear : 2025;
    var endPeriod = opts.endPeriod != null ? opts.endPeriod : 2;
    var minRecordYear = opts.minRecordYear != null ? opts.minRecordYear : 2000;
    var maxStepsPerRun = opts.maxStepsPerRun != null ? opts.maxStepsPerRun : 220;
    var seed = opts.seed != null ? opts.seed : 20250402;
    var verbose = opts.verbose !== false;

    if (typeof genMarketMP !== 'function') throw new Error('genMarketMP not found — load legacy.js first');
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');
    if (typeof MARKETS === 'undefined') throw new Error('MARKETS not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedMPMode = window.MP && MP.mode;
    var origRandom = Math.random;

    var samples = [];
    var agg = {};

    function ensureAgg(key) {
      if (!agg[key]) {
        agg[key] = {
          key: key,
          n: 0,
          sumTop1: 0,
          sumTop2: 0,
          n_top1_ge_10: 0,
          n_ge2_stations_ge_10: 0,
          n_ge3_stations_ge_10: 0,
          n_ge1_stations_ge_12: 0,
        };
      }
      return agg[key];
    }

    try {
      for (var mi = 0; mi < markets.length; mi++) {
        var marketId = markets[mi];
        for (var run = 0; run < numRunsPerMarket; run++) {
          (function (seedRun) {
            var s = seedRun;
            Math.random = function () {
              s = (s * 9301 + 49297) % 233280;
              return s / 233280;
            };
          })(seed + mi * 7919 + run * 9973);

          ACTIVE_MARKET = marketId;
          syncMarketPopToMarket(marketId);
          G = genMarketMP('1985');
          MP.mode = 'solo';
          MP.isHost = false;
          if (MP.players) MP.players = [];

          var ui = patchTimersAndUi();
          var steps = 0;
          try {
            while (steps < maxStepsPerRun) {
              var y0 = G.year;
              var p0 = G.period;
              if (y0 > endYear || (y0 === endYear && p0 > endPeriod)) break;

              advTurn();
              steps++;

              var y = G.year;
              if (y < minRecordYear) continue;

              var dec = decadeForShareCalibration(y);
              if (!dec) continue;

              var comm = commercialStations(G);
              var sorted = comm.slice().sort(function (a, b) {
                return (b.rat && b.rat.share ? b.rat.share : 0) - (a.rat && a.rat.share ? a.rat.share : 0);
              });
              var top1 = sorted[0] && sorted[0].rat ? sorted[0].rat.share : 0;
              var top2 = sorted[1] && sorted[1].rat ? sorted[1].rat.share : 0;
              var n10 = comm.filter(function (s) {
                return s.rat && s.rat.share >= 0.1;
              }).length;
              var n12 = comm.filter(function (s) {
                return s.rat && s.rat.share >= 0.12;
              }).length;

              var m = MARKETS[marketId] || {};
              var tier = m.rankTier || 'medium';

              var o = ensureAgg(dec + '|' + tier);
              o.n++;
              o.sumTop1 += top1;
              o.sumTop2 += top2;
              if (top1 >= 0.1) o.n_top1_ge_10++;
              if (n10 >= 2) o.n_ge2_stations_ge_10++;
              if (n10 >= 3) o.n_ge3_stations_ge_10++;
              if (n12 >= 1) o.n_ge1_stations_ge_12++;

              samples.push({
                marketId: marketId,
                tier: tier,
                decade: dec,
                year: y,
                period: G.period,
                top1: top1,
                top2: top2,
                n10: n10,
                n12: n12,
                run: run,
              });
            }
          } catch (e) {
            samples.push({ error: String(e && e.message ? e.message : e), marketId: marketId, run: run });
          } finally {
            ui.restore();
          }
        }
      }
    } finally {
      Math.random = origRandom;
      G = savedG;
      if (typeof ACTIVE_MARKET !== 'undefined' && savedActive != null) ACTIVE_MARKET = savedActive;
      if (window.MP && savedMPMode !== undefined) MP.mode = savedMPMode;
    }

    var tableRows = [];
    Object.keys(agg)
      .sort()
      .forEach(function (k) {
        var o = agg[k];
        if (o.n === 0) return;
        tableRows.push({
          group: k,
          samples: o.n,
          avgTop1_pct: Math.round((o.sumTop1 / o.n) * 10000) / 100,
          avgTop2_pct: Math.round((o.sumTop2 / o.n) * 10000) / 100,
          pct_periods_top1_ge_10: Math.round((o.n_top1_ge_10 / o.n) * 10000) / 100,
          pct_periods_2plus_ge_10: Math.round((o.n_ge2_stations_ge_10 / o.n) * 10000) / 100,
          pct_periods_3plus_ge_10: Math.round((o.n_ge3_stations_ge_10 / o.n) * 10000) / 100,
          pct_periods_any_ge_12: Math.round((o.n_ge1_stations_ge_12 / o.n) * 10000) / 100,
        });
      });

    var plainEnglish = formatShareCalibrationPlainEnglish(agg, samples.length, opts);
    var out = { plainEnglish: plainEnglish, tableRows: tableRows, samples: samples, aggregate: agg, options: opts };
    if (verbose && typeof console !== 'undefined') {
      console.log(plainEnglish);
      if (console.table) console.table(tableRows);
    }
    return out;
  }

  window.runMarketSimulationBatch = runMarketSimulationBatch;
  window.runShareCalibrationInspection = runShareCalibrationInspection;
  window.MarketSimHarness = {
    runBatch: runMarketSimulationBatch,
    runShareCalibrationInspection: runShareCalibrationInspection,
    signalStrengthScore: signalStrengthScore,
    otherAudioDilutionTable: otherAudioDilutionTable,
  };

  if (typeof document !== 'undefined' && /[?&]dev=1(?:&|$)/.test(location.search || '')) {
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Run share calibration check';
      b.setAttribute('aria-label', 'Run share calibration check');
      b.style.cssText =
        'position:fixed;bottom:10px;right:10px;z-index:99998;font-size:13px;padding:10px 14px;cursor:pointer;font-family:system-ui,sans-serif;border-radius:6px;border:1px solid #555;background:#1a1a1a;color:#eee;box-shadow:0 2px 12px rgba(0,0,0,.4)';
      b.onclick = function () {
        b.disabled = true;
        b.textContent = 'Running…';
        setTimeout(function () {
          try {
            var out = runShareCalibrationInspection({ quick: true, verbose: false });
            var pre = document.createElement('pre');
            pre.style.cssText =
              'position:fixed;left:16px;right:16px;bottom:56px;top:56px;overflow:auto;background:#0d0d0d;color:#e8e8e8;padding:18px;z-index:99999;font-size:13px;line-height:1.45;white-space:pre-wrap;border:1px solid #333;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.5)';
            pre.textContent = out.plainEnglish + '\n\n--- Table (JSON) ---\n' + JSON.stringify(out.tableRows, null, 2);
            var close = document.createElement('button');
            close.type = 'button';
            close.textContent = 'Close';
            close.style.cssText =
              'position:fixed;top:16px;right:16px;z-index:100000;font-size:14px;padding:8px 16px;cursor:pointer;border-radius:6px;border:1px solid #555;background:#222;color:#eee';
            close.onclick = function () {
              pre.remove();
              close.remove();
            };
            document.body.appendChild(pre);
            document.body.appendChild(close);
          } catch (err) {
            alert('Share calibration check failed: ' + (err && err.message ? err.message : err));
          } finally {
            b.disabled = false;
            b.textContent = 'Run share calibration check';
          }
        }, 30);
      };
      document.body.appendChild(b);
    });
  }
})();
