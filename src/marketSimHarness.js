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
 *
 * Market structure by decade (station counts; consolidation / deferred slots):
 *   marketHealthSnapshot(G)  // one-shot when G is loaded
 *   runMarketHealthByDecadeDiagnostic({ quick: true })  // or npm run sim:market-health (inspect-market-health.html)
 *
 * Ecology deep-dive (niche/zombie formats, per-run decade rollups, Chicago vs peers — dev console):
 *   marketEcologyInputSnapshot('chicago')
 *   compareMegaMarketEcologyInputs(['newyork','losangeles','chicago'])
 *   runMarketEcologyDeepDiagnostic({ quick: true })
 *
 * Format mix by decade (commercial buckets, health, share — dev diagnostic):
 *   runFormatEcologyInspection({ quick: true })  // or inspect-format-ecology.html
 *
 * Solo cash identity (finHistory vs EBITDA − interest + LMA net):
 *   runCashFlowIntegrityDiagnostic({ quick: true })  // or npm run sim:cash-audit
 *
 * Solo cash bridge (advTurn step labels + modal-equivalent fields + CSV):
 *   runCashBridgeAudit({ quick: true })  // or npm run sim:cash-bridge-audit
 *
 * Mega markets (LA / NYC / Chicago) snapshot table — station counts, shares, revenue spread:
 *   runMegaMarketSnapshotsDiagnostic({ years: [2000, 2019] })  // or npm run sim:mega-snapshots
 */
(function () {
  'use strict';

  var TALK_FMTS = ['NEWS_TALK', 'SPORTS_TALK', 'PERSONALITY_TALK', 'ALL_NEWS'];

  /** Defaults mirror ALL_PLAYABLE_MARKET_IDS / DEV_BENCHMARK_MEGA_MARKET_IDS in legacy.js (fallback if harness loads first). */
  function getPlayableMarketIds() {
    return typeof ALL_PLAYABLE_MARKET_IDS !== 'undefined'
      ? ALL_PLAYABLE_MARKET_IDS
      : ['newyork', 'losangeles', 'chicago', 'seattle', 'sanfrancisco', 'atlanta', 'nashville', 'wichita'];
  }
  function getMegaBenchmarkMarketIds() {
    return typeof DEV_BENCHMARK_MEGA_MARKET_IDS !== 'undefined'
      ? DEV_BENCHMARK_MEGA_MARKET_IDS
      : ['newyork', 'losangeles', 'chicago'];
  }

  /** Broad format buckets for inspect-format-ecology (reporting only). */
  var FORMAT_ECOLOGY_COMMERCIAL_BUCKETS = [
    'top40_pop',
    'rock_alt',
    'ac_hits_oldies',
    'country',
    'urban_rnb',
    'news_talk',
    'religious_gospel',
    'spanish',
    'beautiful_standards_easy',
    'other_niche',
    'unmapped',
  ];
  /** Spoken-word / mass-appeal music lanes used for “mainstream competition” view (2010s/2020s). */
  var FORMAT_ECOLOGY_MAINSTREAM_BUCKETS = ['top40_pop', 'rock_alt', 'ac_hits_oldies', 'country', 'urban_rnb', 'news_talk'];

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

  if (typeof window !== 'undefined') {
    window._harnessPatchTimersAndUi = patchTimersAndUi;
  }

  /**
   * Replace Math.random and (when available) crypto.getRandomValues / crypto.randomUUID with the same
   * LCG stream used by snowball trace (9301 / 49297 / 233280). Call restore() after the benchmark run.
   * Typed-array fills use byte-sized draws so getRandomValues matches Web Crypto expectations.
   */
  function installSeededBenchmarkRng(seed) {
    var st = seed != null ? Number(seed) : 505050;
    if (!isFinite(st)) st = 505050;
    st = Math.floor(st);
    var origRandom = Math.random;
    var c = typeof crypto !== 'undefined' ? crypto : null;
    var origGetRandomValues = c && typeof c.getRandomValues === 'function' ? c.getRandomValues.bind(c) : null;
    var origRandomUUID = c && typeof c.randomUUID === 'function' ? c.randomUUID.bind(c) : null;

    function lcgStep() {
      st = (st * 9301 + 49297) % 233280;
      return st;
    }

    function nextUnit() {
      return lcgStep() / 233280;
    }

    Math.random = function () {
      return nextUnit();
    };

    if (c && origGetRandomValues) {
      c.getRandomValues = function (typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        var u8 = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
        for (var i = 0; i < u8.length; i++) {
          u8[i] = Math.min(255, Math.floor(nextUnit() * 256));
        }
        return typedArray;
      };
    }

    if (c && origRandomUUID) {
      c.randomUUID = function () {
        var bytes = new Uint8Array(16);
        c.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        var hex = [];
        for (var j = 0; j < 16; j++) {
          var h = bytes[j].toString(16);
          hex.push(h.length === 1 ? '0' + h : h);
        }
        return (
          hex.slice(0, 4).join('') +
          '-' +
          hex.slice(4, 6).join('') +
          '-' +
          hex.slice(6, 8).join('') +
          '-' +
          hex.slice(8, 10).join('') +
          '-' +
          hex.slice(10, 16).join('')
        );
      };
    }

    return {
      restore: function () {
        Math.random = origRandom;
        if (c && origGetRandomValues) c.getRandomValues = origGetRandomValues;
        if (c && origRandomUUID) c.randomUUID = origRandomUUID;
      },
    };
  }

  /** Block storage writes during headless traces so autosave/session noise cannot affect the next run. */
  function quietWebStorageForBenchmark() {
    if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') {
      return { restore: function () {} };
    }
    var lsSet = localStorage.setItem.bind(localStorage);
    var ssSet = sessionStorage.setItem.bind(sessionStorage);
    var noop = function () {};
    localStorage.setItem = noop;
    sessionStorage.setItem = noop;
    return {
      restore: function () {
        localStorage.setItem = lsSet;
        sessionStorage.setItem = ssSet;
      },
    };
  }

  if (typeof window !== 'undefined') {
    window._harnessInstallSeededBenchmarkRng = installSeededBenchmarkRng;
    window._harnessQuietWebStorageForBenchmark = quietWebStorageForBenchmark;
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

    var runs = [];
    var aggregateByEraFormat = { '1970s': {}, '1980s': {}, '1990s': {} };
    var gap12Samples = [];
    var corrSamples = [];
    var diagnostics = { lowCpmDominant1990s: [], amMusicTopAfter1990: [], weakBeatsStrong: [] };

    var seed = opts.seed != null ? opts.seed : Date.now() & 0xffffffff;

    try {
      for (var run = 0; run < numRuns; run++) {
        var perRunSeed = seed + run * 9973;
        var rngH = installSeededBenchmarkRng(perRunSeed);
        var stQ = quietWebStorageForBenchmark();
        try {
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

        runs.push({ runIndex: run, seed: perRunSeed, steps: steps, periodSnapshots: periodSnapshots });
        } finally {
          stQ.restore();
          rngH.restore();
        }
      }
    } finally {
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
    var markets = getPlayableMarketIds();
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
   * @param {string[]} [opts.markets] — default six: Nashville, Atlanta, NY, LA, Chicago, Seattle
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
      markets = opts.quick ? ['nashville', 'atlanta', 'newyork'] : ['nashville', 'atlanta', 'newyork', 'losangeles', 'chicago', 'seattle'];
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

  function decadeLabelPub(y) {
    if (y < 1980) return '1970s';
    if (y < 1990) return '1980s';
    if (y < 2000) return '1990s';
    if (y < 2010) return '2000s';
    if (y < 2020) return '2010s';
    return '2020s';
  }

  /** AM (non-translator) with relatively weak facility vs 50kw FM — ecology vulnerability proxy. */
  function isWeakSignalAmStation(st) {
    if (!st || !st.sig) return false;
    if (st.fmBooster) return false;
    if (st.sig.type !== 'AM') return false;
    return signalStrengthScore(st) < 2.65;
  }

  /** Last attrition-driven niche reinvention from `flog` (legacy runMarketAttrition). */
  function attritionNicheReinventionFromFlog(s) {
    var fl = s && s.flog;
    if (!Array.isArray(fl) || !fl.length) return null;
    for (var i = fl.length - 1; i >= 0; i--) {
      var e = fl[i];
      if (e && e._attritionNiche && e.from && e.to) {
        return { from: e.from, to: e.to, fromZombie: !!e._fromZombie, y: e.y, p: e.p };
      }
    }
    return null;
  }

  /** Commercial ranked by share — top1 and 5th-place share (cutoff for "top 5"). */
  function commercialShareTop1AndTop5Cutoff(G) {
    var comm = commercialStations(G);
    var shares = comm
      .map(function (s) {
        return s && s.rat && typeof s.rat.share === 'number' ? s.rat.share : 0;
      })
      .filter(function (x) {
        return x >= 0;
      });
    shares.sort(function (a, b) {
      return b - a;
    });
    var top1 = shares.length ? shares[0] : 0;
    var top5Cut = shares.length >= 5 ? shares[4] : shares.length ? shares[shares.length - 1] : 0;
    return { top1Share: top1, top5CutoffShare: top5Cut, nRanked: shares.length };
  }

  function countFormats(stations, pred) {
    var o = {};
    for (var i = 0; i < stations.length; i++) {
      var s = stations[i];
      if (!s || !pred(s)) continue;
      var f = s.format || '?';
      o[f] = (o[f] || 0) + 1;
    }
    return o;
  }

  /**
   * Static inventory + market params at game start (1985 solo gen) — compare Chicago vs NY/LA drivers.
   * Exposed on `window.marketEcologyInputSnapshot`.
   */
  function marketEcologyInputSnapshot(marketId) {
    if (typeof genMarketMP !== 'function') throw new Error('genMarketMP not found — load legacy.js first');
    if (typeof MARKETS === 'undefined' || !MARKETS[marketId || '']) {
      console.warn('marketEcologyInputSnapshot: unknown market', marketId);
      return null;
    }
    var mid = marketId;
    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    try {
      ACTIVE_MARKET = mid;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(mid);
      G = genMarketMP('1985');
      var arr = G.stations || [];
      var comm = commercialStations(G);
      var am = 0;
      var fm = 0;
      var weakAm = 0;
      var fmtMix = {};
      for (var i = 0; i < comm.length; i++) {
        var s = comm[i];
        if (!s || !s.sig) continue;
        var f = s.format || '?';
        fmtMix[f] = (fmtMix[f] || 0) + 1;
        if (s.sig.type === 'AM' && !s.fmBooster) {
          am++;
          if (isWeakSignalAmStation(s)) weakAm++;
        } else if (s.sig.type === 'FM' || s.fmBooster) fm++;
      }
      var m = MARKETS[mid];
      var active = 0;
      var pubC = 0;
      for (var j = 0; j < arr.length; j++) {
        var st = arr[j];
        if (st && !st._bpSlotDeferred) {
          active++;
          if (st.isPublic) pubC++;
        }
      }
      return {
        marketId: mid,
        label: m.label || mid,
        rankTier: m.rankTier,
        revScale: m.revScale,
        adxBonus: m.adxBonus,
        fmMusicFragMult: m.fmMusicFragMult,
        spokenWordAmResilience: m.spokenWordAmResilience,
        heritageAmResilience: m.heritageAmResilience,
        countryAmHoldout: m.countryAmHoldout,
        eduIndex: m.eduIndex,
        startingTotalSlots: arr.length,
        startingActive: active,
        startingCommercial: comm.length,
        startingPublic: pubC,
        amCount: am,
        fmCount: fm,
        weakSignalAmCount: weakAm,
        formatMix: fmtMix,
      };
    } finally {
      G = savedG;
      if (typeof ACTIVE_MARKET !== 'undefined' && savedActive != null) ACTIVE_MARKET = savedActive;
    }
  }

  /**
   * Side-by-side table: mega markets (and optional others) — starting inventory vs revenue drivers.
   */
  function compareMegaMarketEcologyInputs(marketIds) {
    var ids =
      marketIds && marketIds.length
        ? marketIds
        : getPlayableMarketIds();
    var rows = ids.map(function (mid) {
      return marketEcologyInputSnapshot(mid);
    });
    if (typeof console !== 'undefined' && console.table) {
      console.table(
        rows.map(function (r) {
          if (!r) return {};
          return {
            market: r.marketId,
            tier: r.rankTier,
            revScale: r.revScale,
            adxBonus: r.adxBonus,
            commercial: r.startingCommercial,
            AM: r.amCount,
            FM: r.fmCount,
            weakAM: r.weakSignalAmCount,
            fmFrag: r.fmMusicFragMult,
          };
        })
      );
    }
    return { markets: ids, rows: rows };
  }

  /**
   * Deep ecology diagnostic: niche/zombie formats, per-run decade rollups, input comparison.
   * Does not change gameplay — uses same advTurn loop as runMarketHealthByDecadeDiagnostic.
   *
   * @param {object} [opts]
   * @param {string[]} [opts.markets]
   * @param {number} [opts.numRunsPerMarket]
   * @param {number} [opts.endYear=2025]
   * @param {number} [opts.minRecordYear=1985]
   * @param {boolean} [opts.verbose=true]
   */
  function runMarketEcologyDeepDiagnostic(opts) {
    opts = opts || {};
    var markets =
      opts.markets && opts.markets.length
        ? opts.markets
        : opts.quick
          ? getMegaBenchmarkMarketIds()
          : getPlayableMarketIds();
    var numRunsPerMarket = opts.numRunsPerMarket != null ? opts.numRunsPerMarket : opts.quick ? 2 : 4;
    var endYear = opts.endYear != null ? opts.endYear : 2025;
    var endPeriod = opts.endPeriod != null ? opts.endPeriod : 2;
    var minRecordYear = opts.minRecordYear != null ? opts.minRecordYear : 1985;
    var maxStepsPerRun = opts.maxStepsPerRun != null ? opts.maxStepsPerRun : 240;
    var seed = opts.seed != null ? opts.seed : 20260406;
    var verbose = opts.verbose !== false;

    if (typeof genMarketMP !== 'function') throw new Error('genMarketMP not found');
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedMPMode = window.MP && MP.mode;
    var origRandom = Math.random;

    var periodSamples = [];
    var inputRows = {};
    for (var ii = 0; ii < markets.length; ii++) {
      inputRows[markets[ii]] = marketEcologyInputSnapshot(markets[ii]);
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
          var prevRemoved = G._attritionRemovedCumulative || 0;
          var prevNicheFlips = G._attritionNicheFlipsCumulative || 0;

          try {
            while (steps < maxStepsPerRun) {
              var y0 = G.year;
              var p0 = G.period;
              if (y0 > endYear || (y0 === endYear && p0 > endPeriod)) break;

              advTurn();
              steps++;
              if (G.year > endYear || (G.year === endYear && G.period > endPeriod)) break;

              var y = G.year;
              if (y < minRecordYear) {
                prevRemoved = G._attritionRemovedCumulative || 0;
                prevNicheFlips = G._attritionNicheFlipsCumulative || 0;
                continue;
              }

              var dec = decadeLabelPub(y);
              var h = marketHealthSnapshot(G);
              var sh = commercialShareTop1AndTop5Cutoff(G);
              var removed = G._attritionRemovedCumulative || 0;
              var nicheFlips = G._attritionNicheFlipsCumulative || 0;

              var commList = commercialStations(G);
              var nicheStations = commList.filter(function (s) {
                return s && s.isNicheSurvival;
              });
              var zombieStations = commList.filter(function (s) {
                return s && s.isZombie;
              });

              var nicheByFmt = countFormats(nicheStations, function () {
                return true;
              });
              var zombieByFmt = countFormats(zombieStations, function () {
                return true;
              });

              var nicheShares = [];
              var nicheRevs = [];
              var reinventionFromTo = {};
              for (var ni = 0; ni < nicheStations.length; ni++) {
                var ns = nicheStations[ni];
                var shr = ns.rat && typeof ns.rat.share === 'number' ? ns.rat.share : 0;
                var rv = ns.fin && typeof ns.fin.rev === 'number' ? ns.fin.rev : 0;
                nicheShares.push(shr);
                nicheRevs.push(rv);
                var rein = attritionNicheReinventionFromFlog(ns);
                if (rein) {
                  var key = rein.from + '→' + rein.to;
                  reinventionFromTo[key] = (reinventionFromTo[key] || 0) + 1;
                }
              }

              function avg(arr) {
                if (!arr.length) return 0;
                var t = 0;
                for (var a = 0; a < arr.length; a++) t += arr[a];
                return t / arr.length;
              }

              periodSamples.push({
                marketId: marketId,
                run: run,
                year: y,
                period: G.period,
                decade: dec,
                total: h.total,
                active: h.active,
                commercial: h.commercial,
                public: h.public,
                zombie: h.zombie,
                nicheSurvival: h.nicheSurvival,
                removedCumulative: removed,
                removedDelta: removed - prevRemoved,
                nicheFlipsCumulative: nicheFlips,
                nicheFlipsDelta: nicheFlips - prevNicheFlips,
                top1Share: sh.top1Share,
                top5CutoffShare: sh.top5CutoffShare,
                nicheByFormat: nicheByFmt,
                zombieByFormat: zombieByFmt,
                nicheAvgShare: avg(nicheShares),
                nicheAvgRev: avg(nicheRevs),
                reinventionFromTo: reinventionFromTo,
              });

              prevRemoved = removed;
              prevNicheFlips = nicheFlips;
            }
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

    function rollupPerRunDecade(samples) {
      var groups = {};
      for (var i = 0; i < samples.length; i++) {
        var r = samples[i];
        var k = r.marketId + '|' + r.run + '|' + r.decade;
        if (!groups[k]) {
          groups[k] = {
            marketId: r.marketId,
            run: r.run,
            decade: r.decade,
            years: [],
            commercial: [],
            zombie: [],
            niche: [],
            removedEnd: [],
            top1: [],
            top5: [],
            removalsInDecade: 0,
            nicheFlipsInDecade: 0,
          };
        }
        var g = groups[k];
        g.years.push(r.year);
        g.commercial.push(r.commercial);
        g.zombie.push(r.zombie);
        g.niche.push(r.nicheSurvival);
        g.removedEnd.push(r.removedCumulative);
        g.top1.push(r.top1Share);
        g.top5.push(r.top5CutoffShare);
        g.removalsInDecade += r.removedDelta > 0 ? r.removedDelta : 0;
        g.nicheFlipsInDecade += r.nicheFlipsDelta > 0 ? r.nicheFlipsDelta : 0;
      }
      function mean(arr) {
        if (!arr.length) return null;
        var s = 0;
        for (var j = 0; j < arr.length; j++) s += arr[j];
        return s / arr.length;
      }
      function minA(arr) {
        if (!arr.length) return null;
        var m = arr[0];
        for (var j = 1; j < arr.length; j++) {
          if (arr[j] < m) m = arr[j];
        }
        return m;
      }
      function maxA(arr) {
        if (!arr.length) return null;
        var m = arr[0];
        for (var j = 1; j < arr.length; j++) {
          if (arr[j] > m) m = arr[j];
        }
        return m;
      }
      var rows = [];
      Object.keys(groups).forEach(function (k) {
        var g = groups[k];
        var lastRem = g.removedEnd.length ? g.removedEnd[g.removedEnd.length - 1] : 0;
        rows.push({
          marketId: g.marketId,
          run: g.run,
          decade: g.decade,
          nPeriods: g.commercial.length,
          commercialMean: mean(g.commercial),
          commercialMin: minA(g.commercial),
          commercialMax: maxA(g.commercial),
          zombieMean: mean(g.zombie),
          nicheMean: mean(g.niche),
          removedCumulativeEnd: lastRem,
          removalsInDecade: g.removalsInDecade,
          nicheReinventionsInDecade: g.nicheFlipsInDecade,
          top1ShareMean: mean(g.top1),
          top5CutoffMean: mean(g.top5),
        });
      });
      rows.sort(function (a, b) {
        if (a.marketId !== b.marketId) return String(a.marketId).localeCompare(String(b.marketId));
        if (a.decade !== b.decade) return String(a.decade).localeCompare(String(b.decade));
        return a.run - b.run;
      });
      return rows;
    }

    function aggregateNicheZombieFormats(samples) {
      var byKey = {};
      for (var i = 0; i < samples.length; i++) {
        var r = samples[i];
        var key = r.marketId + '|' + r.decade;
        if (!byKey[key]) {
          byKey[key] = {
            marketId: r.marketId,
            decade: r.decade,
            nicheFormatSum: {},
            zombieFormatSum: {},
            reinventionPairSum: {},
            sumNicheShareWeighted: 0,
            sumNicheRevWeighted: 0,
            nicheStationPeriods: 0,
          };
        }
        var b = byKey[key];
        mergeFmt(b.nicheFormatSum, r.nicheByFormat);
        mergeFmt(b.zombieFormatSum, r.zombieByFormat);
        mergeFmt(b.reinventionPairSum, r.reinventionFromTo);
        var nz = r.nicheSurvival || 0;
        if (nz > 0) {
          b.sumNicheShareWeighted += r.nicheAvgShare * nz;
          b.sumNicheRevWeighted += r.nicheAvgRev * nz;
          b.nicheStationPeriods += nz;
        }
      }
      function mergeFmt(dst, src) {
        if (!src) return;
        Object.keys(src).forEach(function (f) {
          dst[f] = (dst[f] || 0) + src[f];
        });
      }
      var out = [];
      Object.keys(byKey).forEach(function (k) {
        var b = byKey[k];
        out.push({
          marketId: b.marketId,
          decade: b.decade,
          nicheSurvivorsByFormat: b.nicheFormatSum,
          zombieSurvivorsByFormat: b.zombieFormatSum,
          reinventionsFromToCounts: b.reinventionPairSum,
          avgShareOfNicheSurvivors_weighted:
            b.nicheStationPeriods > 0 ? b.sumNicheShareWeighted / b.nicheStationPeriods : 0,
          avgRevOfNicheSurvivors_weighted:
            b.nicheStationPeriods > 0 ? b.sumNicheRevWeighted / b.nicheStationPeriods : 0,
        });
      });
      out.sort(function (a, b) {
        if (a.marketId !== b.marketId) return String(a.marketId).localeCompare(String(b.marketId));
        return String(a.decade).localeCompare(String(b.decade));
      });
      return out;
    }

    var perRunDecade = rollupPerRunDecade(periodSamples);
    var formatByDecade = aggregateNicheZombieFormats(periodSamples);

    function summarize2020sPerMarket(rows) {
      var byM = {};
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.decade !== '2020s') continue;
        if (!byM[r.marketId]) {
          byM[r.marketId] = { commercialMean: [], zombieMean: [], nicheMean: [], removedEnd: [], top1: [] };
        }
        var b = byM[r.marketId];
        b.commercialMean.push(r.commercialMean);
        b.zombieMean.push(r.zombieMean);
        b.nicheMean.push(r.nicheMean);
        b.removedEnd.push(r.removedCumulativeEnd);
        b.top1.push(r.top1ShareMean);
      }
      function avg(a) {
        if (!a || !a.length) return null;
        var s = 0;
        for (var j = 0; j < a.length; j++) s += a[j];
        return s / a.length;
      }
      var o = {};
      Object.keys(byM).forEach(function (mid) {
        var x = byM[mid];
        o[mid] = {
          runsSampled: x.commercialMean.length,
          avgCommercialMean: avg(x.commercialMean),
          avgZombieMean: avg(x.zombieMean),
          avgNicheMean: avg(x.nicheMean),
          avgRemovedCumulativeEnd: avg(x.removedEnd),
          avgTop1ShareMean: avg(x.top1),
        };
      });
      return o;
    }

    var summary2020s = summarize2020sPerMarket(perRunDecade);

    var lines = [];
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('  MARKET ECOLOGY — DEEP DIAGNOSTIC (dev)');
    lines.push('  Markets: ' + markets.join(', ') + ' · runs/market: ' + numRunsPerMarket + ' · end ' + endYear);
    lines.push('  Per-run decade table: use to spot outlier runs (Chicago vs NY/LA).');
    lines.push('  reinventionsFromToCounts: flog _attritionNiche from→to (when recorded).');
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push('--- 2020s cross-market summary (per-run decade means, then averaged across runs) ---');
    lines.push(JSON.stringify(summary2020s, null, 2));
    lines.push('');
    lines.push('--- Starting inventory & params (1985 genMarketMP) ---');
    lines.push(JSON.stringify(inputRows, null, 2));
    lines.push('');
    lines.push('--- Aggregate: niche/zombie formats by market × decade (summed over period samples) ---');
    lines.push(JSON.stringify(formatByDecade, null, 2));
    lines.push('');
    lines.push('--- Per run × decade (means within decade; removedCumulativeEnd = last value) ---');
    lines.push(JSON.stringify(perRunDecade, null, 2));

    var plainEnglish = lines.join('\n');
    var outObj = {
      plainEnglish: plainEnglish,
      marketInputs: inputRows,
      compareInputs: compareMegaMarketEcologyInputs(markets),
      summary2020sPerMarket: summary2020s,
      periodSamples: periodSamples,
      perRunDecade: perRunDecade,
      aggregateByMarketDecadeFormats: formatByDecade,
      options: {
        markets: markets,
        numRunsPerMarket: numRunsPerMarket,
        endYear: endYear,
        minRecordYear: minRecordYear,
        seed: seed,
      },
    };
    if (verbose && typeof console !== 'undefined') {
      console.log(outObj.plainEnglish);
    }
    return outObj;
  }

  /**
   * Delegates to legacy `rankStationsByShareCompetition` when present (competition ties).
   * Fallback keeps harness runnable if legacy loads late.
   */
  function rankAmongAllStations(G) {
    if (typeof window.rankStationsByShareCompetition === 'function') {
      return window.rankStationsByShareCompetition(G.stations);
    }
    var list = (G.stations || []).filter(function (s) {
      return s && !s._bpSlotDeferred && s.rat;
    });
    var n = list.length;
    if (n === 0) return { n: 0, rankById: {} };
    list.forEach(function (s) {
      var sh = s.rat.share;
      if (!isFinite(sh) || sh < 0) s.rat.share = 0;
    });
    var sumShare = list.reduce(function (a, s) {
      return a + (s.rat.share || 0);
    }, 0);
    var rankById = {};
    if (sumShare <= 0) {
      list.forEach(function (s) {
        rankById[s.id] = n;
      });
      return { n: n, rankById: rankById };
    }
    var EPS = 1e-10;
    list.sort(function (a, b) {
      var sa = a.rat.share || 0;
      var sb = b.rat.share || 0;
      if (Math.abs(sb - sa) > EPS) return sb - sa;
      return String(a.id).localeCompare(String(b.id));
    });
    var i = 0;
    while (i < n) {
      var sh = list[i].rat.share || 0;
      var j = i + 1;
      while (j < n && Math.abs((list[j].rat.share || 0) - sh) < EPS) j++;
      var rank = i + 1;
      for (var k = i; k < j; k++) rankById[list[k].id] = rank;
      i = j;
    }
    return { n: n, rankById: rankById };
  }

  function publicRadioSnapshot(G) {
    var r = rankAmongAllStations(G);
    var news = (G.stations || []).find(function (s) {
      return s && s.isPublic && s.format === 'PUBLIC_NEWS';
    });
    var klass = (G.stations || []).find(function (s) {
      return s && s.isPublic && s.format === 'PUBLIC_CLASSICAL';
    });
    var eclectic = (G.stations || []).find(function (s) {
      return s && s.isPublic && s.format === 'PUBLIC_ECLECTIC';
    });
    var jazz = (G.stations || []).find(function (s) {
      return s && s.isPublic && s.format === 'PUBLIC_JAZZ';
    });
    function row(st) {
      if (!st || !st.rat) return null;
      var sh = st.rat.share;
      if (!isFinite(sh) || sh < 0) sh = 0;
      return {
        callLetters: st.callLetters,
        share: sh,
        rank: r.rankById[st.id] != null ? r.rankById[st.id] : null,
      };
    }
    return {
      nStations: r.n,
      PUBLIC_NEWS: row(news),
      PUBLIC_CLASSICAL: row(klass),
      PUBLIC_ECLECTIC: row(eclectic),
      PUBLIC_JAZZ: row(jazz),
    };
  }

  /**
   * Headless-friendly batch: advTurn through endYear, track public station share & rank vs all stations.
   * @param {object} [opts]
   * @param {string[]} [opts.markets]
   * @param {number} [opts.numRunsPerMarket=4]
   * @param {number} [opts.endYear=2025]
   * @param {number} [opts.minRecordYear=1985] — skip snapshots before (warmup)
   * @param {number} [opts.maxStepsPerRun=240]
   * @param {number} [opts.seed]
   * @param {boolean} [opts.verbose]
   */
  function runPublicRadioSimulation(opts) {
    opts = opts || {};
    var markets =
      opts.markets && opts.markets.length
        ? opts.markets
        : opts.quick
          ? ['nashville', 'atlanta', 'newyork']
          : ['nashville', 'atlanta', 'newyork', 'losangeles', 'chicago', 'seattle'];
    var numRunsPerMarket = opts.numRunsPerMarket != null ? opts.numRunsPerMarket : opts.quick ? 2 : 4;
    var endYear = opts.endYear != null ? opts.endYear : 2025;
    var endPeriod = opts.endPeriod != null ? opts.endPeriod : 2;
    var minRecordYear = opts.minRecordYear != null ? opts.minRecordYear : 1985;
    var maxStepsPerRun = opts.maxStepsPerRun != null ? opts.maxStepsPerRun : 240;
    var seed = opts.seed != null ? opts.seed : 20260202;
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
    var timeSeriesLastRun = [];

    try {
      for (var mi = 0; mi < markets.length; mi++) {
        var marketId = markets[mi];
        var mkt = MARKETS[marketId] || {};
        var eduIndex = mkt.eduIndex != null && !Number.isNaN(Number(mkt.eduIndex)) ? Number(mkt.eduIndex) : 1;

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
          var isLastRun = mi === markets.length - 1 && run === numRunsPerMarket - 1;

          try {
            while (steps < maxStepsPerRun) {
              var y0 = G.year;
              var p0 = G.period;
              if (y0 > endYear || (y0 === endYear && p0 > endPeriod)) break;

              advTurn();
              steps++;
              if (G.year > endYear || (G.year === endYear && G.period > endPeriod)) break;

              var y = G.year;
              if (y < minRecordYear) continue;

              var snap = publicRadioSnapshot(G);
              var rec = {
                marketId: marketId,
                eduIndex: eduIndex,
                run: run,
                year: y,
                period: G.period,
                nStations: snap.nStations,
                newsShare: snap.PUBLIC_NEWS && snap.PUBLIC_NEWS.share,
                newsRank: snap.PUBLIC_NEWS && snap.PUBLIC_NEWS.rank,
                classShare: snap.PUBLIC_CLASSICAL && snap.PUBLIC_CLASSICAL.share,
                classRank: snap.PUBLIC_CLASSICAL && snap.PUBLIC_CLASSICAL.rank,
                eclecticShare: snap.PUBLIC_ECLECTIC && snap.PUBLIC_ECLECTIC.share,
                eclecticRank: snap.PUBLIC_ECLECTIC && snap.PUBLIC_ECLECTIC.rank,
                jazzShare: snap.PUBLIC_JAZZ && snap.PUBLIC_JAZZ.share,
                jazzRank: snap.PUBLIC_JAZZ && snap.PUBLIC_JAZZ.rank,
                decade: decadeLabelPub(y),
              };
              samples.push(rec);
              if (isLastRun) timeSeriesLastRun.push(rec);
            }
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

    function summarize(fmtKey) {
      var shareKey =
        fmtKey === 'PUBLIC_NEWS'
          ? 'newsShare'
          : fmtKey === 'PUBLIC_CLASSICAL'
            ? 'classShare'
            : fmtKey === 'PUBLIC_ECLECTIC'
              ? 'eclecticShare'
              : 'jazzShare';
      var rankKey =
        fmtKey === 'PUBLIC_NEWS'
          ? 'newsRank'
          : fmtKey === 'PUBLIC_CLASSICAL'
            ? 'classRank'
            : fmtKey === 'PUBLIC_ECLECTIC'
              ? 'eclecticRank'
              : 'jazzRank';
      var byMarket = {};
      samples.forEach(function (r) {
        if (r[shareKey] == null || r[rankKey] == null) return;
        var mk = r.marketId;
        if (!byMarket[mk]) {
          byMarket[mk] = {
            marketId: mk,
            eduIndex: r.eduIndex,
            n: 0,
            sumShare: 0,
            sumRank: 0,
            top5: 0,
            top10: 0,
            byDecade: {},
          };
        }
        var o = byMarket[mk];
        o.n++;
        o.sumShare += r[shareKey];
        o.sumRank += r[rankKey];
        if (r[rankKey] <= 5) o.top5++;
        if (r[rankKey] <= 10) o.top10++;
        var dec = r.decade;
        if (!o.byDecade[dec]) {
          o.byDecade[dec] = { n: 0, sumShare: 0, sumRank: 0, top5: 0, top10: 0 };
        }
        var d = o.byDecade[dec];
        d.n++;
        d.sumShare += r[shareKey];
        d.sumRank += r[rankKey];
        if (r[rankKey] <= 5) d.top5++;
        if (r[rankKey] <= 10) d.top10++;
      });
      var rows = [];
      Object.keys(byMarket).forEach(function (mk) {
        var o = byMarket[mk];
        if (o.n === 0) return;
        rows.push({
          market: mk,
          eduIndex: o.eduIndex,
          n: o.n,
          meanShare_pct: Math.round((o.sumShare / o.n) * 10000) / 100,
          meanRank: Math.round((o.sumRank / o.n) * 100) / 100,
          pctPeriods_rankLe5: Math.round((o.top5 / o.n) * 10000) / 100,
          pctPeriods_rankLe10: Math.round((o.top10 / o.n) * 10000) / 100,
        });
      });
      return { byMarket: byMarket, rows: rows };
    }

    var newsSum = summarize('PUBLIC_NEWS');
    var classSum = summarize('PUBLIC_CLASSICAL');
    var eclecticSum = summarize('PUBLIC_ECLECTIC');
    var jazzSum = summarize('PUBLIC_JAZZ');

    var lines = [];
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('  PUBLIC RADIO SIMULATION (share & rank vs all stations)');
    lines.push('  Markets: ' + markets.join(', '));
    lines.push('  Runs/market: ' + numRunsPerMarket + ' · Record year ≥ ' + minRecordYear + ' · End ' + endYear);
    lines.push('  Rank uses competition-style ties (equal shares → same rank). nStations can fall over time');
    lines.push('  when weak AM stations are removed (ghost / consolidation) — expected, not a sim bug.');
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push('PUBLIC NEWS / TALK — mean share & rank (all sampled periods)');
    if (console.table && verbose) console.table(newsSum.rows);
    lines.push(JSON.stringify(newsSum.rows, null, 2));
    lines.push('');
    lines.push('PUBLIC CLASSICAL — mean share & rank');
    lines.push(JSON.stringify(classSum.rows, null, 2));
    lines.push('');
    lines.push('PUBLIC ECLECTIC — mean share & rank (when present)');
    lines.push(JSON.stringify(eclecticSum.rows, null, 2));
    lines.push('');
    lines.push('PUBLIC JAZZ — mean share & rank (when present)');
    lines.push(JSON.stringify(jazzSum.rows, null, 2));
    lines.push('');
    lines.push('--- By decade + market (PUBLIC_NEWS): mean share %, mean rank, % periods rank≤5 / ≤10 ---');
    Object.keys(newsSum.byMarket).forEach(function (mk) {
      var o = newsSum.byMarket[mk];
      lines.push('Market ' + mk + ' (eduIndex ' + o.eduIndex + ')');
      Object.keys(o.byDecade)
        .sort()
        .forEach(function (dec) {
          var d = o.byDecade[dec];
          if (!d || d.n === 0) return;
          lines.push(
            '  ' +
              dec +
              ': n=' +
              d.n +
              ' meanShare=' +
              ((d.sumShare / d.n) * 100).toFixed(2) +
              '% meanRank=' +
              (d.sumRank / d.n).toFixed(2) +
              ' rank≤5 ' +
              ((d.top5 / d.n) * 100).toFixed(1) +
              '% rank≤10 ' +
              ((d.top10 / d.n) * 100).toFixed(1) +
              '%'
          );
        });
    });
    lines.push('');
    lines.push('--- Last run time series (one sample per period, ' + timeSeriesLastRun.length + ' rows) — tail:');
    var tail = timeSeriesLastRun.slice(-24);
    lines.push(JSON.stringify(tail, null, 2));

    var plainEnglish = lines.join('\n');
    var out = {
      plainEnglish: plainEnglish,
      samples: samples,
      newsSummary: newsSum,
      classicalSummary: classSum,
      timeSeriesLastRun: timeSeriesLastRun,
      options: {
        markets: markets,
        numRunsPerMarket: numRunsPerMarket,
        endYear: endYear,
        minRecordYear: minRecordYear,
        seed: seed,
      },
    };
    if (verbose && typeof console !== 'undefined') {
      console.log(out.plainEnglish);
    }
    return out;
  }

  /**
   * Single-frame counts for market structure (player + AI stations in G.stations).
   * - total: array length (slots)
   * - emptySlots: null/undefined entries (unusual)
   * - deferred: _bpSlotDeferred (blueprint / not yet on-air for ratings)
   * - active: on-air for sim purposes (!deferred)
   * - commercial / public: active subsets
   * - simulcast: stations in any simulcast group (legacy pair or star source/receiver legs)
   */
  function marketHealthSnapshot(G) {
    var arr = G.stations || [];
    var total = arr.length;
    var emptySlots = 0;
    var deferred = 0;
    var active = 0;
    var commercial = 0;
    var publicC = 0;
    var simulcast = 0;
    var zombie = 0;
    var nicheSurvival = 0;
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (!s) {
        emptySlots++;
        continue;
      }
      if (s._bpSlotDeferred) {
        deferred++;
        continue;
      }
      active++;
      if (s.isZombie) zombie++;
      if (s.isNicheSurvival) nicheSurvival++;
      if (s.isPublic) publicC++;
      else commercial++;
      if (s.simulcastWith || s.simulcastSourceStationId || s._simulcastSource === true) simulcast++;
    }
    return {
      total: total,
      emptySlots: emptySlots,
      active: active,
      commercial: commercial,
      public: publicC,
      simulcast: simulcast,
      deferred: deferred,
      zombie: zombie,
      nicheSurvival: nicheSurvival,
    };
  }

  /**
   * Advance global G until calendar (endYear, endPeriod), or error. One advTurn() = one half-year period.
   */
  function advanceGToYearPeriod(endYear, endPeriod, maxSteps) {
    var steps = 0;
    while (steps < maxSteps) {
      if (G.year === endYear && G.period === endPeriod) {
        return { ok: true, steps: steps };
      }
      if (G.year > endYear || (G.year === endYear && G.period > endPeriod)) {
        return { ok: false, steps: steps, error: 'overshot', at: { year: G.year, period: G.period } };
      }
      advTurn();
      steps++;
    }
    return { ok: false, steps: steps, error: 'maxSteps', at: { year: G.year, period: G.period } };
  }

  /** Single-frame metrics for mega-market snapshot reports (inspect-mega-snapshots.html). */
  function megaSnapshotMetrics(G) {
    var comm = commercialStations(G);
    var mh = marketHealthSnapshot(G);
    var byShare = topN(comm, comm.length, function (s) {
      return s.rat && s.rat.share ? s.rat.share : 0;
    });
    var byRev = topN(comm, comm.length, function (s) {
      return s.fin && s.fin.rev ? s.fin.rev : 0;
    });
    var top5 = byShare.slice(0, 5).map(function (s) {
      return {
        call: s.callLetters,
        fmt: s.format,
        share_pct: Math.round((s.rat.share || 0) * 10000) / 100,
        rev: Math.round(s.fin && s.fin.rev ? s.fin.rev : 0),
      };
    });
    var over5 = 0;
    var over8 = 0;
    comm.forEach(function (s) {
      var sh = s.rat && s.rat.share ? s.rat.share : 0;
      if (sh > 0.05) over5++;
      if (sh > 0.08) over8++;
    });
    var top10rev = byRev.slice(0, 10);
    var revs = top10rev.map(function (s) {
      return s.fin && s.fin.rev ? s.fin.rev : 0;
    });
    var rmax = revs.length ? Math.max.apply(null, revs) : 0;
    var rmin = revs.length ? Math.min.apply(null, revs) : 0;
    var spread = rmax - rmin;
    return {
      marketId: G.marketId,
      year: G.year,
      period: G.period,
      stationCountCommercial: mh.commercial,
      stationCountActive: mh.active,
      publicStations: mh.public,
      top5Shares: top5,
      countShareOver5pct: over5,
      countShareOver8pct: over8,
      top10Revenue: top10rev.map(function (s) {
        return { call: s.callLetters, fmt: s.format, rev: Math.round(s.fin && s.fin.rev ? s.fin.rev : 0) };
      }),
      top10RevSpread: Math.round(spread),
      top10RevMax: Math.round(rmax),
      top10RevMin: Math.round(rmin),
    };
  }

  /**
   * Headless / inspect page: mega markets (NYC, LA, Chicago — DEV_BENCHMARK_MEGA_MARKET_IDS) at configured years (default 2000 & 2019, fall).
   * Uses genMarketMP + advTurn with UI/timer patches (same pattern as runMarketSimulationBatch).
   */
  function runMegaMarketSnapshotsDiagnostic(opts) {
    opts = opts || {};
    var markets = opts.markets || getMegaBenchmarkMarketIds();
    var years = opts.years || [2000, 2019];
    var endPeriod = opts.endPeriod != null ? opts.endPeriod : 2;
    var seed = opts.seed != null ? opts.seed : 20260407;
    var maxSteps = opts.maxStepsPerRun != null ? opts.maxStepsPerRun : 420;
    var eraKey = opts.eraKey || '1970';
    var verbose = opts.verbose !== false;

    if (typeof genMarketMP !== 'function') throw new Error('genMarketMP not found — load legacy.js first');
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedMPMode = window.MP && MP.mode;
    var origRandom = Math.random;

    var rows = [];
    var lines = [];
    lines.push('Mega market snapshots — genMarketMP(' + eraKey + ') → end of target year period ' + endPeriod + ' (fall)');
    lines.push('Markets: ' + markets.join(', '));
    lines.push('Years: ' + years.join(', '));
    lines.push('RNG seed: ' + seed);
    lines.push('');

    try {
      for (var mi = 0; mi < markets.length; mi++) {
        for (var yi = 0; yi < years.length; yi++) {
          (function (seedRun) {
            var s = seedRun;
            Math.random = function () {
              s = (s * 9301 + 49297) % 233280;
              return s / 233280;
            };
          })(seed + mi * 10007 + yi * 9001);

          var marketId = markets[mi];
          var targetYear = years[yi];
          ACTIVE_MARKET = marketId;
          syncMarketPopToMarket(marketId);
          G = genMarketMP(eraKey);
          MP.mode = 'solo';
          MP.isHost = false;
          if (MP.players) MP.players = [];

          var ui = patchTimersAndUi();
          var adv;
          try {
            adv = advanceGToYearPeriod(targetYear, endPeriod, maxSteps);
          } finally {
            ui.restore();
          }

          if (!adv.ok) {
            rows.push({
              marketId: marketId,
              targetYear: targetYear,
              error: adv.error || 'advance failed',
              at: adv.at,
            });
            lines.push('--- ' + marketId + ' ' + targetYear + ' — FAIL (' + (adv.error || '') + ') — ' + JSON.stringify(adv.at || {}));
            lines.push('');
            continue;
          }

          var m = megaSnapshotMetrics(G);
          m.targetYear = targetYear;
          m.advSteps = adv.steps;
          rows.push(m);

          lines.push('=== ' + String(marketId).toUpperCase() + ' — end of ' + targetYear + ' P' + endPeriod + ' ===');
          lines.push(
            'Commercial stations: ' +
              m.stationCountCommercial +
              ' | on-air active: ' +
              m.stationCountActive +
              ' | public: ' +
              m.publicStations +
              ' | advTurns from start: ' +
              adv.steps
          );
          lines.push('Top 5 shares (% of market):');
          m.top5Shares.forEach(function (r, i) {
            lines.push('  ' + (i + 1) + '. ' + r.call + '  ' + r.fmt + '  ' + r.share_pct + '%  rev≈$' + r.rev);
          });
          lines.push('Stations with share > 5%: ' + m.countShareOver5pct);
          lines.push('Stations with share > 8%: ' + m.countShareOver8pct);
          lines.push(
            'Top 10 revenue spread (max−min among top 10 by rev): $' +
              m.top10RevSpread +
              '  (max $' +
              m.top10RevMax +
              ', min $' +
              m.top10RevMin +
              ')'
          );
          lines.push('Top 10 by revenue: ' + m.top10Revenue.map(function (x) { return x.call + ' $' + x.rev; }).join(' | '));
          lines.push('');
        }
      }
    } finally {
      Math.random = origRandom;
      if (savedG !== null) G = savedG;
      if (savedActive !== null) ACTIVE_MARKET = savedActive;
      if (window.MP && savedMPMode !== undefined) MP.mode = savedMPMode;
    }

    var plainEnglish = lines.join('\n');
    var out = { rows: rows, plainEnglish: plainEnglish, options: { markets: markets, years: years, seed: seed, eraKey: eraKey, endPeriod: endPeriod } };
    if (verbose && typeof console !== 'undefined') {
      console.log(out.plainEnglish);
    }
    return out;
  }

  /**
   * Headless-friendly: advTurn through endYear, aggregate mean/min/max station counts by decade.
   * Same loop driver as runPublicRadioSimulation.
   */
  function runMarketHealthByDecadeDiagnostic(opts) {
    opts = opts || {};
    var markets =
      opts.markets && opts.markets.length
        ? opts.markets
        : opts.quick
          ? ['nashville', 'atlanta', 'newyork']
          : ['nashville', 'atlanta', 'newyork', 'losangeles', 'chicago', 'seattle'];
    var numRunsPerMarket = opts.numRunsPerMarket != null ? opts.numRunsPerMarket : opts.quick ? 2 : 4;
    var endYear = opts.endYear != null ? opts.endYear : 2025;
    var endPeriod = opts.endPeriod != null ? opts.endPeriod : 2;
    var minRecordYear = opts.minRecordYear != null ? opts.minRecordYear : 1985;
    var maxStepsPerRun = opts.maxStepsPerRun != null ? opts.maxStepsPerRun : 240;
    var seed = opts.seed != null ? opts.seed : 20260202;
    var verbose = opts.verbose !== false;

    if (typeof genMarketMP !== 'function') throw new Error('genMarketMP not found — load legacy.js first');
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedMPMode = window.MP && MP.mode;
    var origRandom = Math.random;

    var samples = [];

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
              if (G.year > endYear || (G.year === endYear && G.period > endPeriod)) break;

              var y = G.year;
              if (y < minRecordYear) continue;

              var dec = decadeLabelPub(y);
              var h = marketHealthSnapshot(G);
              samples.push({
                marketId: marketId,
                run: run,
                year: y,
                period: G.period,
                decade: dec,
                total: h.total,
                emptySlots: h.emptySlots,
                active: h.active,
                commercial: h.commercial,
                public: h.public,
                simulcast: h.simulcast,
                deferred: h.deferred,
                zombie: h.zombie,
                nicheSurvival: h.nicheSurvival,
                removedCumulative: G._attritionRemovedCumulative || 0,
              });
            }
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

    var key = function (mk, dec) {
      return mk + '|' + dec;
    };
    var buckets = {};
    samples.forEach(function (r) {
      var k = key(r.marketId, r.decade);
      if (!buckets[k]) {
        buckets[k] = {
          marketId: r.marketId,
          decade: r.decade,
          n: 0,
          total: [],
          active: [],
          commercial: [],
          public: [],
          simulcast: [],
          deferred: [],
          emptySlots: [],
          zombie: [],
          nicheSurvival: [],
          removedCumulative: [],
        };
      }
      var b = buckets[k];
      b.n++;
      b.total.push(r.total);
      b.active.push(r.active);
      b.commercial.push(r.commercial);
      b.public.push(r.public);
      b.simulcast.push(r.simulcast);
      b.deferred.push(r.deferred);
      b.emptySlots.push(r.emptySlots);
      b.zombie.push(r.zombie);
      b.nicheSurvival.push(r.nicheSurvival);
      b.removedCumulative.push(r.removedCumulative);
    });

    function stats(arr) {
      if (!arr.length) return { mean: null, min: null, max: null };
      var sum = 0;
      var mn = arr[0];
      var mx = arr[0];
      for (var i = 0; i < arr.length; i++) {
        sum += arr[i];
        if (arr[i] < mn) mn = arr[i];
        if (arr[i] > mx) mx = arr[i];
      }
      return { mean: sum / arr.length, min: mn, max: mx };
    }

    var lines = [];
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('  MARKET HEALTH BY DECADE (station counts; dev diagnostic)');
    lines.push('  Markets: ' + markets.join(', '));
    lines.push('  Runs/market: ' + numRunsPerMarket + ' · Record year ≥ ' + minRecordYear + ' · End ' + endYear);
    lines.push('  simulcast = stations in any simulcast group (each leg counted)');
    lines.push('  deferred = _bpSlotDeferred (off-air / blueprint slots)');
    lines.push('  zombie / nicheSurvival = AM survival ecology (legacy runMarketAttrition)');
    lines.push('  removedCumulative = G._attritionRemovedCumulative (true station removals)');
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('');

    var marketOrder = markets.slice();
    var decadeOrder = ['1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

    marketOrder.forEach(function (mk) {
      lines.push('--- ' + mk + ' ---');
      decadeOrder.forEach(function (dec) {
        var bk = key(mk, dec);
        var b = buckets[bk];
        if (!b || b.n === 0) return;
        var st = {
          total: stats(b.total),
          active: stats(b.active),
          commercial: stats(b.commercial),
          public: stats(b.public),
          simulcast: stats(b.simulcast),
          deferred: stats(b.deferred),
          emptySlots: stats(b.emptySlots),
          zombie: stats(b.zombie),
          nicheSurvival: stats(b.nicheSurvival),
          removedCumulative: stats(b.removedCumulative),
        };
        lines.push(
          dec +
            ': n=' +
            b.n +
            ' periods sampled | total mean=' +
            st.total.mean.toFixed(2) +
            ' (min ' +
            st.total.min +
            ' max ' +
            st.total.max +
            ') | active mean=' +
            st.active.mean.toFixed(2) +
            ' (' +
            st.active.min +
            '–' +
            st.active.max +
            ') | commercial mean=' +
            st.commercial.mean.toFixed(2) +
            ' | public mean=' +
            st.public.mean.toFixed(2) +
            ' | simulcast mean=' +
            st.simulcast.mean.toFixed(2) +
            ' | deferred mean=' +
            st.deferred.mean.toFixed(2) +
            ' | zombie mean=' +
            st.zombie.mean.toFixed(2) +
            ' | niche mean=' +
            st.nicheSurvival.mean.toFixed(2) +
            ' | removedCum mean=' +
            st.removedCumulative.mean.toFixed(1) +
            (st.emptySlots.max > 0 ? ' | emptySlots max=' + st.emptySlots.max : '')
        );
      });
      lines.push('');
    });

    lines.push('--- JSON (by decade bucket) ---');
    var jsonOut = {};
    Object.keys(buckets).forEach(function (k) {
      var b = buckets[k];
      jsonOut[k] = {
        marketId: b.marketId,
        decade: b.decade,
        n: b.n,
        total: stats(b.total),
        active: stats(b.active),
        commercial: stats(b.commercial),
        public: stats(b.public),
        simulcast: stats(b.simulcast),
        deferred: stats(b.deferred),
        emptySlots: stats(b.emptySlots),
        zombie: stats(b.zombie),
        nicheSurvival: stats(b.nicheSurvival),
        removedCumulative: stats(b.removedCumulative),
      };
    });
    lines.push(JSON.stringify(jsonOut, null, 2));

    var plainEnglish = lines.join('\n');
    var out = {
      plainEnglish: plainEnglish,
      samples: samples,
      buckets: jsonOut,
      options: {
        markets: markets,
        numRunsPerMarket: numRunsPerMarket,
        endYear: endYear,
        minRecordYear: minRecordYear,
        seed: seed,
      },
    };
    if (verbose && typeof console !== 'undefined') {
      console.log(out.plainEnglish);
    }
    return out;
  }

  /**
   * Map legacy `s.format` to a broad ecology bucket. Public formats resolve to `public` (use publicKind).
   * Unknown strings (not in legacy `FM`) → `unmapped` for a visible mapping safety check.
   */
  function mapFormatToEcologyBucket(fmt) {
    if (fmt == null || fmt === '') return { bucket: 'unmapped', publicKind: null, knownInFM: false };
    var inFm = typeof FM !== 'undefined' && FM && FM[fmt];
    if (!inFm) return { bucket: 'unmapped', publicKind: null, knownInFM: false };
    if (fmt === 'PUBLIC_NEWS') return { bucket: 'public', publicKind: 'news', knownInFM: true };
    if (fmt === 'PUBLIC_CLASSICAL') return { bucket: 'public', publicKind: 'classical', knownInFM: true };
    if (fmt === 'PUBLIC_ECLECTIC') return { bucket: 'public', publicKind: 'eclectic', knownInFM: true };
    if (fmt === 'PUBLIC_JAZZ') return { bucket: 'public', publicKind: 'jazz', knownInFM: true };
    var map = {
      TOP40: 'top40_pop',
      CHR: 'top40_pop',
      HOT_AC: 'top40_pop',
      RHYTHMIC: 'top40_pop',
      ALBUM_ROCK: 'rock_alt',
      CLASSIC_ROCK: 'rock_alt',
      ALT_ROCK: 'rock_alt',
      AAA: 'rock_alt',
      ADULT_CONTEMP: 'ac_hits_oldies',
      CLASSIC_HITS: 'ac_hits_oldies',
      OLDIES: 'ac_hits_oldies',
      MOR: 'ac_hits_oldies',
      COUNTRY: 'country',
      URBAN_CONTEMP: 'urban_rnb',
      SOUL_RNB: 'urban_rnb',
      NEWS_TALK: 'news_talk',
      ALL_NEWS: 'news_talk',
      SPORTS_TALK: 'news_talk',
      PERSONALITY_TALK: 'news_talk',
      GOSPEL: 'religious_gospel',
      SPANISH: 'spanish',
      BEAUTIFUL_MUSIC: 'beautiful_standards_easy',
      ADULT_STANDARDS: 'beautiful_standards_easy',
    };
    if (map[fmt]) return { bucket: map[fmt], publicKind: null, knownInFM: true };
    return { bucket: 'other_niche', publicKind: null, knownInFM: true };
  }

  function sanitizeShareDiagnostic(s) {
    var sh = s && s.rat && s.rat.share;
    if (!isFinite(sh) || sh < 0) return 0;
    return sh;
  }

  /**
   * Diagnostic-only health label (does not affect gameplay).
   * Order: zombie / niche_survivor from legacy ecology flags first, then share + EBITDA vs revenue stress.
   */
  function classifyCommercialHealthDiagnostic(s) {
    if (!s) return 'weak';
    if (s.isZombie) return 'zombie';
    if (s.isNicheSurvival) return 'niche_survivor';
    var share = sanitizeShareDiagnostic(s);
    var rev = Math.max(s.fin && s.fin.rev ? s.fin.rev : 0, 1);
    var ebitda = s.fin && isFinite(s.fin.ebitda) ? s.fin.ebitda : 0;
    var stress = ebitda < -0.28 * rev;
    if (share >= 0.045 && !stress) return 'healthy';
    if (share >= 0.022 && ebitda >= -0.22 * rev) return 'viable';
    if (share >= 0.012 && ebitda >= -0.38 * rev) return 'viable';
    return 'weak';
  }

  function snapshotFormatEcologyOnePeriod(G) {
    var stations = G.stations || [];
    var commercial = [];
    var pub = [];
    var unmapped = [];
    for (var i = 0; i < stations.length; i++) {
      var s = stations[i];
      if (!s || s._bpSlotDeferred) continue;
      var fmt = s.format;
      var m = mapFormatToEcologyBucket(fmt);
      var share = sanitizeShareDiagnostic(s);
      if (s.isPublic) {
        pub.push({
          format: fmt,
          bucket: m.bucket,
          publicKind: m.publicKind,
          share: share,
        });
        continue;
      }
      var bucket = m.bucket === 'public' ? 'unmapped' : m.bucket;
      if (FORMAT_ECOLOGY_COMMERCIAL_BUCKETS.indexOf(bucket) < 0) bucket = 'other_niche';
      commercial.push({
        format: fmt,
        bucket: bucket,
        health: classifyCommercialHealthDiagnostic(s),
        share: share,
      });
      if (!m.knownInFM) unmapped.push(String(fmt));
    }
    return {
      commercial: commercial,
      public: pub,
      unmappedSample: unmapped,
      marketStructure: marketHealthSnapshot(G),
    };
  }

  function meanArr(a) {
    if (!a || !a.length) return 0;
    var t = 0;
    for (var i = 0; i < a.length; i++) t += a[i];
    return t / a.length;
  }

  function runFormatEcologyInspection(opts) {
    opts = opts || {};
    var markets =
      opts.markets && opts.markets.length
        ? opts.markets
        : opts.quick
          ? ['nashville', 'atlanta', 'newyork']
          : ['nashville', 'atlanta', 'newyork', 'losangeles', 'chicago', 'seattle'];
    var numRunsPerMarket = opts.numRunsPerMarket != null ? opts.numRunsPerMarket : opts.quick ? 2 : 4;
    var endYear = opts.endYear != null ? opts.endYear : 2025;
    var endPeriod = opts.endPeriod != null ? opts.endPeriod : 2;
    var minRecordYear = opts.minRecordYear != null ? opts.minRecordYear : 1985;
    var maxStepsPerRun = opts.maxStepsPerRun != null ? opts.maxStepsPerRun : 240;
    var seed = opts.seed != null ? opts.seed : 20260406;
    var verbose = opts.verbose !== false;

    if (typeof genMarketMP !== 'function') throw new Error('genMarketMP not found — load legacy.js first');
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedMPMode = window.MP && MP.mode;
    var origRandom = Math.random;

    var samples = [];
    var allUnmapped = {};

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
              if (G.year > endYear || (G.year === endYear && G.period > endPeriod)) break;

              var y = G.year;
              if (y < minRecordYear) continue;

              var dec = decadeLabelPub(y);
              var snap = snapshotFormatEcologyOnePeriod(G);
              for (var u = 0; u < snap.unmappedSample.length; u++) {
                allUnmapped[snap.unmappedSample[u]] = (allUnmapped[snap.unmappedSample[u]] || 0) + 1;
              }
              samples.push({
                marketId: marketId,
                run: run,
                year: y,
                period: G.period,
                decade: dec,
                commercial: snap.commercial,
                public: snap.public,
                marketStructure: snap.marketStructure,
              });
            }
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

    var healthKeys = ['healthy', 'viable', 'weak', 'zombie', 'niche_survivor'];

    function emptyBucketRollup() {
      var o = {};
      FORMAT_ECOLOGY_COMMERCIAL_BUCKETS.forEach(function (b) {
        o[b] = { stationCount: [], shareSum: [], health: {} };
        healthKeys.forEach(function (h) {
          o[b].health[h] = [];
        });
      });
      return o;
    }

    var byKey = {};

    function ensureKey(marketId, decade) {
      var k = marketId + '|' + decade;
      if (!byKey[k]) {
        byKey[k] = {
          marketId: marketId,
          decade: decade,
          n: 0,
          commercialMean: [],
          activeMean: [],
          bucket: emptyBucketRollup(),
          publicStations: [],
          publicShareSum: [],
          publicNewsStations: [],
          publicClassicalStations: [],
          rawFormat: {},
          remnantByBucket: {},
        };
        FORMAT_ECOLOGY_COMMERCIAL_BUCKETS.forEach(function (b) {
          byKey[k].remnantByBucket[b] = [];
        });
      }
      return byKey[k];
    }

    samples.forEach(function (row) {
      var agg = ensureKey(row.marketId, row.decade);
      agg.n++;
      var ms = row.marketStructure;
      agg.commercialMean.push(ms.commercial);
      agg.activeMean.push(ms.active);

      var bucketCounts = {};
      var bucketShares = {};
      FORMAT_ECOLOGY_COMMERCIAL_BUCKETS.forEach(function (b) {
        bucketCounts[b] = 0;
        bucketShares[b] = 0;
      });

      var remnantPerBucket = {};
      FORMAT_ECOLOGY_COMMERCIAL_BUCKETS.forEach(function (b) {
        remnantPerBucket[b] = 0;
      });

      var rfTally = {};
      for (var i = 0; i < row.commercial.length; i++) {
        var c = row.commercial[i];
        var b = c.bucket;
        bucketCounts[b]++;
        bucketShares[b] += c.share;

        var rf = c.format || '?';
        if (!rfTally[rf]) rfTally[rf] = { n: 0, share: 0, weak: 0 };
        rfTally[rf].n++;
        rfTally[rf].share += c.share;
        if (c.health === 'weak' || c.health === 'zombie' || c.health === 'niche_survivor') {
          rfTally[rf].weak++;
          if (remnantPerBucket[b] !== undefined) remnantPerBucket[b]++;
        }
      }
      for (var rfKey in rfTally) {
        if (!agg.rawFormat[rfKey]) agg.rawFormat[rfKey] = { count: [], shareSum: [], weakCount: [] };
        var rt = rfTally[rfKey];
        agg.rawFormat[rfKey].count.push(rt.n);
        agg.rawFormat[rfKey].shareSum.push(rt.share);
        agg.rawFormat[rfKey].weakCount.push(rt.weak);
      }

      FORMAT_ECOLOGY_COMMERCIAL_BUCKETS.forEach(function (b) {
        agg.bucket[b].stationCount.push(bucketCounts[b]);
        agg.bucket[b].shareSum.push(bucketShares[b]);
        agg.remnantByBucket[b].push(remnantPerBucket[b]);
        healthKeys.forEach(function (h) {
          var n = 0;
          for (var j = 0; j < row.commercial.length; j++) {
            if (row.commercial[j].bucket === b && row.commercial[j].health === h) n++;
          }
          agg.bucket[b].health[h].push(n);
        });
      });

      var pCount = row.public.length;
      var pShare = 0;
      var pn = 0,
        pc = 0;
      for (var p = 0; p < row.public.length; p++) {
        pShare += row.public[p].share;
        if (row.public[p].publicKind === 'news') pn++;
        if (row.public[p].publicKind === 'classical') pc++;
      }
      agg.publicStations.push(pCount);
      agg.publicShareSum.push(pShare);
      agg.publicNewsStations.push(pn);
      agg.publicClassicalStations.push(pc);
    });

    var decadeOrder = ['1980s', '1990s', '2000s', '2010s', '2020s'];
    var lines = [];
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('  FORMAT ECOLOGY / FORMAT ECONOMY (dev diagnostic)');
    lines.push('  Commercial stations: broad buckets + share + health (not gameplay).');
    lines.push('  Public (PUBLIC_NEWS / PUBLIC_CLASSICAL / PUBLIC_ECLECTIC / PUBLIC_JAZZ) reported separately from commercial counts.');
    lines.push('  Deferred slots (_bpSlotDeferred) excluded; simulcast legs each count as one station.');
    lines.push('  Markets: ' + markets.join(', '));
    lines.push('  Runs/market: ' + numRunsPerMarket + ' · Record year ≥ ' + minRecordYear + ' · End ' + endYear);
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('');

    lines.push('--- 1. Market + decade summary ---');
    markets.forEach(function (mk) {
      lines.push('Market: ' + mk);
      decadeOrder.forEach(function (dec) {
        var bk = mk + '|' + dec;
        var b = byKey[bk];
        if (!b || !b.n) return;
        lines.push('  ' + dec + ' (n=' + b.n + ' period samples)');
        lines.push(
          '    Mean commercial stations (active non-public): ' + meanArr(b.commercialMean).toFixed(2) + ' | mean active (incl. public): ' + meanArr(b.activeMean).toFixed(2)
        );
        lines.push('    Public: mean stations=' + meanArr(b.publicStations).toFixed(2) + ' | mean total public share=' + (meanArr(b.publicShareSum) * 100).toFixed(2) + ' pts | mean NEWS=' + meanArr(b.publicNewsStations).toFixed(2) + ' CLASSICAL=' + meanArr(b.publicClassicalStations).toFixed(2));
        lines.push('    Commercial buckets (mean stations / mean share pts / mean counts by health):');
        FORMAT_ECOLOGY_COMMERCIAL_BUCKETS.forEach(function (bucket) {
          var br = b.bucket[bucket];
          if (!br) return;
          var mc = meanArr(br.stationCount);
          var ms = meanArr(br.shareSum);
          if (mc < 0.01 && ms < 1e-6) return;
          var hp = [];
          healthKeys.forEach(function (h) {
            var mh = meanArr(br.health[h]);
            if (mh > 0.01) hp.push(h + '=' + mh.toFixed(2));
          });
          lines.push(
            '      ' +
              bucket +
              ': stations≈' +
              mc.toFixed(2) +
              ' | share≈' +
              (ms * 100).toFixed(2) +
              ' pts' +
              (hp.length ? ' | ' + hp.join(', ') : '')
          );
        });
      });
      lines.push('');
    });

    lines.push('--- 2. Modern mainstream competition (2010s + 2020s, commercial only) ---');
    var modBuckets = { _perSample: {} };

    samples.forEach(function (row) {
      if (row.decade !== '2010s' && row.decade !== '2020s') return;
      var mainstreamStations = 0;
      var mainstreamHealthy = 0;
      var mainstreamShare = 0;
      for (var i = 0; i < row.commercial.length; i++) {
        var c = row.commercial[i];
        if (FORMAT_ECOLOGY_MAINSTREAM_BUCKETS.indexOf(c.bucket) < 0) continue;
        mainstreamStations++;
        mainstreamShare += c.share;
        if (c.health === 'healthy') mainstreamHealthy++;
      }
      var k = row.marketId + '|' + row.decade;
      if (!modBuckets._perSample[k]) modBuckets._perSample[k] = { stations: [], healthy: [], share: [] };
      modBuckets._perSample[k].stations.push(mainstreamStations);
      modBuckets._perSample[k].healthy.push(mainstreamHealthy);
      modBuckets._perSample[k].share.push(mainstreamShare);
    });

    Object.keys(modBuckets._perSample || {}).forEach(function (k) {
      var o = modBuckets._perSample[k];
      lines.push('  ' + k + ': mean mainstream stations=' + meanArr(o.stations).toFixed(2) + ' | mean healthy (mainstream)=' + meanArr(o.healthy).toFixed(2) + ' | mean mainstream share pts=' + (meanArr(o.share) * 100).toFixed(2));
    });
    lines.push('');

    lines.push('--- 3. Niche residue (weak + zombie + niche_survivor), by bucket ---');
    markets.forEach(function (mk) {
      decadeOrder.forEach(function (dec) {
        var b = byKey[mk + '|' + dec];
        if (!b || !b.n) return;
        var rem = [];
        FORMAT_ECOLOGY_COMMERCIAL_BUCKETS.forEach(function (bucket) {
          var mr = meanArr(b.remnantByBucket[bucket]);
          if (mr > 0.02) rem.push(bucket + '=' + mr.toFixed(2));
        });
        if (rem.length) lines.push('  ' + mk + ' ' + dec + ': mean remnant stations per bucket → ' + rem.join(', '));
      });
    });
    var globalRemnant = {};
    samples.forEach(function (row) {
      for (var i = 0; i < row.commercial.length; i++) {
        var c = row.commercial[i];
        if (c.health !== 'weak' && c.health !== 'zombie' && c.health !== 'niche_survivor') continue;
        globalRemnant[c.format] = (globalRemnant[c.format] || 0) + 1;
      }
    });
    var topRem = Object.keys(globalRemnant)
      .sort(function (a, b) {
        return globalRemnant[b] - globalRemnant[a];
      })
      .slice(0, 24);
    lines.push('  Top raw formats among residue observations (global, all markets/decades): ' + topRem.map(function (f) {
      return f + '×' + globalRemnant[f];
    }).join(', '));
    lines.push('');

    lines.push('--- 4. Raw format appendix (mean count per period & mean share pts) ---');
    markets.forEach(function (mk) {
      decadeOrder.forEach(function (dec) {
        var b = byKey[mk + '|' + dec];
        if (!b || !b.n || !b.rawFormat) return;
        var rfs = Object.keys(b.rawFormat).sort();
        if (!rfs.length) return;
        lines.push('  ' + mk + ' · ' + dec + ' (n=' + b.n + '):');
        rfs.forEach(function (rf) {
          var o = b.rawFormat[rf];
          var mw = o.weakCount && o.weakCount.length ? meanArr(o.weakCount) : 0;
          lines.push(
            '    ' +
              rf +
              ': meanStations=' +
              meanArr(o.count).toFixed(2) +
              ' meanWeak=' +
              mw.toFixed(2) +
              ' meanSharePts=' +
              (meanArr(o.shareSum) * 100).toFixed(3)
          );
        });
      });
    });
    lines.push('');

    lines.push('--- 5. Unmapped / unknown format strings (safety check) ---');
    var umKeys = Object.keys(allUnmapped).sort();
    if (!umKeys.length) lines.push('  (none — every sampled format key exists in legacy FM or mapping.)');
    else
      umKeys.forEach(function (k) {
        lines.push('  ' + k + ': ' + allUnmapped[k] + ' row(s) in samples');
      });
    lines.push('');

    lines.push('--- JSON (structured) ---');
    var jsonOut = {
      options: {
        markets: markets,
        numRunsPerMarket: numRunsPerMarket,
        endYear: endYear,
        minRecordYear: minRecordYear,
        seed: seed,
      },
      byMarketDecade: {},
      unmappedFormats: allUnmapped,
      mainstream2010s2020s: modBuckets._perSample || {},
      globalRemnantRawFormatCounts: globalRemnant,
      helpers: {
        mapFormatToEcologyBucket: 'see window.mapFormatToEcologyBucket',
        classifyCommercialHealthDiagnostic: 'see window.classifyCommercialHealthDiagnostic',
      },
    };
    Object.keys(byKey).forEach(function (k) {
      var b = byKey[k];
      var entry = {
        n: b.n,
        meanCommercialStations: meanArr(b.commercialMean),
        meanActiveStations: meanArr(b.activeMean),
        meanPublicStations: meanArr(b.publicStations),
        meanPublicShare: meanArr(b.publicShareSum),
        meanPublicNews: meanArr(b.publicNewsStations),
        meanPublicClassical: meanArr(b.publicClassicalStations),
        meanRemnantByBucket: {},
        buckets: {},
        rawFormat: {},
      };
      FORMAT_ECOLOGY_COMMERCIAL_BUCKETS.forEach(function (bucket) {
        entry.meanRemnantByBucket[bucket] = meanArr(b.remnantByBucket[bucket]);
      });
      FORMAT_ECOLOGY_COMMERCIAL_BUCKETS.forEach(function (bucket) {
        var br = b.bucket[bucket];
        entry.buckets[bucket] = {
          meanStationCount: meanArr(br.stationCount),
          meanShare: meanArr(br.shareSum),
          health: {},
        };
        healthKeys.forEach(function (h) {
          entry.buckets[bucket].health[h] = meanArr(br.health[h]);
        });
      });
      for (var rf2 in b.rawFormat) {
        var rfo = b.rawFormat[rf2];
        entry.rawFormat[rf2] = {
          meanCount: meanArr(rfo.count),
          meanShareSum: meanArr(rfo.shareSum),
          meanWeak: rfo.weakCount && rfo.weakCount.length ? meanArr(rfo.weakCount) : 0,
        };
      }
      jsonOut.byMarketDecade[k] = entry;
    });
    lines.push(JSON.stringify(jsonOut, null, 2));

    var plainEnglish = lines.join('\n');
    var out = {
      plainEnglish: plainEnglish,
      samples: samples,
      byMarketDecade: jsonOut.byMarketDecade,
      unmappedFormats: allUnmapped,
      options: jsonOut.options,
    };
    if (verbose && typeof console !== 'undefined') {
      console.log(out.plainEnglish);
    }
    return out;
  }

  /**
   * Verify: each finHistory row satisfies
   *   cash[i] - cash[i-1] === earlyPipelineNet[i] + ebitda[i] - loanInterest[i] + lmaNet[i] + pressureNet[i]
   * earlyPipelineNet = wallet delta after events/franchise/sports (pre-seedRev) through start of LMA step (solo).
   * pressureNet = cash after checkPressure(distress / solo bankruptcy clamp) minus cash before.
   * Optionally injects LMA lessee/lessor mid-run.
   */
  function verifySoloFinHistoryChain(fh, initialCash) {
    var violations = [];
    if (!fh || !fh.length) return violations;
    var prevCash = initialCash;
    for (var i = 0; i < fh.length; i++) {
      var row = fh[i];
      var delta = row.cash - prevCash;
      var early =
        row.earlyPipelineNet != null && row.earlyPipelineNet !== undefined ? row.earlyPipelineNet : 0;
      var lma = row.lmaNet != null && row.lmaNet !== undefined ? row.lmaNet : 0;
      var pressure = row.pressureNet != null && row.pressureNet !== undefined ? row.pressureNet : 0;
      var expected = early + row.ebitda - (row.loanInterest || 0) + lma + pressure;
      if (delta !== expected) {
        violations.push({
          index: i,
          year: row.year,
          period: row.period,
          deltaCash: delta,
          expectedDelta: expected,
          earlyPipelineNet: early,
          ebitda: row.ebitda,
          loanInterest: row.loanInterest,
          lmaNet: lma,
          prevCash: prevCash,
          cash: row.cash,
        });
      }
      prevCash = row.cash;
    }
    return violations;
  }

  function injectLmaLesseeProbe(G) {
    var ai = (G.stations || []).find(function (s) {
      return s && !s.isPlayer && !s._bpSlotDeferred && !s.isPublic;
    });
    if (!ai) return false;
    ai.isPlayer = true;
    ai.lmaLesseeId = 'player';
    ai._lmaStation = true;
    ai.lmaLicensorName = 'AUDIT LICENSOR';
    if (typeof applyDefaultBrandToPlayerStation === 'function') applyDefaultBrandToPlayerStation(ai);
    G.ps = G.stations.filter(function (st) {
      return st.isPlayer;
    });
    return true;
  }

  function injectLmaLessorProbe(G) {
    var owned = (G.ps || []).filter(function (s) {
      return s && !s._lmaStation && !s.lmaLessorId;
    });
    if (owned.length < 2) return false;
    var s = owned[owned.length - 1];
    s.lmaLessorId = 'ai_operator';
    s._lmaStartPeriod = G.turn || 0;
    s._lmaDuration = 99;
    s.lmaOperatorName = 'Audit OpCo';
    return true;
  }

  /** Escape a cell for CSV (matches wlCsvEscapeCell in legacy when available). */
  function cashBridgeCsvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /**
   * Solo automated cash-flow bridge audit: multiple scenarios, step labels on G.cash in advTurn, modal-equivalent fields.
   * Does not change game rules — only sets globalThis.__WL_CASH_BRIDGE_AUDIT__ for logging.
   */
  function runCashBridgeAudit(opts) {
    opts = opts || {};
    var quick = !!opts.quick;
    var startCash = opts.startCash != null ? opts.startCash : 5000000;
    var seed = opts.seed != null ? opts.seed : 20260406;
    var maxStepsPerRun = opts.maxStepsPerRun != null ? opts.maxStepsPerRun : 220;
    var scenarios =
      opts.scenarios && opts.scenarios.length
        ? opts.scenarios
        : quick
          ? [
              { id: 'atl_quick', marketId: 'atlanta', era: '1985', periods: 12, injectLesseeAfter: 6, injectLessorAfter: -1 },
              { id: 'nash_quick', marketId: 'nashville', era: '1985', periods: 12, injectLesseeAfter: 6, injectLessorAfter: -1 },
              { id: 'chi_quick', marketId: 'chicago', era: '1985', periods: 12, injectLesseeAfter: 6, injectLessorAfter: -1 },
            ]
          : [
              {
                id: 'atlanta_1985_LMA',
                marketId: 'atlanta',
                era: '1985',
                periods: 44,
                injectLesseeAfter: 18,
                injectLessorAfter: 30,
              },
              {
                id: 'nashville_1985_LMA',
                marketId: 'nashville',
                era: '1985',
                periods: 44,
                injectLesseeAfter: 18,
                injectLessorAfter: 30,
              },
              {
                id: 'chicago_1985_LMA',
                marketId: 'chicago',
                era: '1985',
                periods: 44,
                injectLesseeAfter: 18,
                injectLessorAfter: 30,
              },
              {
                id: 'atlanta_1978_era',
                marketId: 'atlanta',
                era: '1978',
                periods: 40,
                injectLesseeAfter: 20,
                injectLessorAfter: -1,
              },
              {
                id: 'nashville_1990s_cluster_window',
                marketId: 'nashville',
                era: '1985',
                periods: 52,
                injectLesseeAfter: 14,
                injectLessorAfter: 26,
              },
            ];

    if (typeof genMarketMP !== 'function') throw new Error('genMarketMP not found — load legacy.js first');
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedMPMode = typeof MP !== 'undefined' && MP ? MP.mode : undefined;
    var savedMPHost = typeof MP !== 'undefined' && MP ? MP.isHost : undefined;
    var savedMPPlayers = typeof MP !== 'undefined' && MP ? MP.players : undefined;
    var savedMPPid = typeof MP !== 'undefined' && MP ? MP.playerId : undefined;
    var savedHeadless = typeof globalThis !== 'undefined' ? globalThis.__WL_HEADLESS__ : undefined;
    var savedBridge = typeof globalThis !== 'undefined' ? globalThis.__WL_CASH_BRIDGE_AUDIT__ : undefined;
    var origRandom = Math.random;

    var probeLog = [];

    try {
      if (typeof globalThis !== 'undefined') {
        globalThis.__WL_HEADLESS__ = true;
        globalThis.__WL_CASH_BRIDGE_AUDIT__ = true;
        globalThis.__WL_CASH_BRIDGE_AUDIT_ROWS__ = [];
      }
      if (typeof MP === 'undefined') throw new Error('MP not defined — legacy multiplayer bootstrap missing');

      for (var si = 0; si < scenarios.length; si++) {
        (function (seedRun) {
          var s = seedRun;
          Math.random = function () {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
          };
        })(seed + si * 10007);

        var sc = scenarios[si];
        var marketId = sc.marketId || 'atlanta';
        var era = sc.era || '1985';
        var periods = sc.periods != null ? sc.periods : 40;
        var injL = sc.injectLesseeAfter != null ? sc.injectLesseeAfter : -1;
        var injLo = sc.injectLessorAfter != null ? sc.injectLessorAfter : -1;

        ACTIVE_MARKET = marketId;
        syncMarketPopToMarket(marketId);
        G = genMarketMP(era);
        if (typeof migrateSave === 'function') migrateSave(G);

        MP.mode = 'solo';
        MP.isHost = false;
        MP.players = [];
        MP.playerId = 0;
        G.loans = [];
        G.finHistory = [];

        var pool = (G.stations || []).filter(function (s) {
          return s && !s._bpSlotDeferred && !s.isPublic && !s.isPlayer;
        });
        var take = Math.min(3, pool.length);
        for (var t = 0; t < take; t++) {
          pool[t].isPlayer = true;
          if (typeof applyDefaultBrandToPlayerStation === 'function') applyDefaultBrandToPlayerStation(pool[t]);
        }
        G.ps = G.stations.filter(function (st) {
          return st.isPlayer;
        });
        G.cash = startCash;
        if (!G.sc) G.sc = {};
        G.sc.cash = startCash;
        G._cashBridgeScenarioId = sc.id || 'scenario_' + si;

        var ui = patchTimersAndUi();
        var step = 0;
        try {
          while (step < periods && step < maxStepsPerRun) {
            var y0 = G.year;
            var p0 = G.period;
            if (y0 > 2030 || (y0 === 2030 && p0 > 2)) break;

            if (injL >= 0 && step === injL) {
              probeLog.push({ scenario: sc.id, kind: 'lessee', ok: injectLmaLesseeProbe(G) });
            }
            if (injLo >= 0 && step === injLo) {
              probeLog.push({ scenario: sc.id, kind: 'lessor', ok: injectLmaLessorProbe(G) });
            }

            advTurn();
            step++;
            if (G.year > 2030) break;
          }
        } finally {
          ui.restore();
        }
      }
    } finally {
      Math.random = origRandom;
      if (typeof globalThis !== 'undefined') {
        globalThis.__WL_CASH_BRIDGE_AUDIT__ = savedBridge;
        globalThis.__WL_HEADLESS__ = savedHeadless;
      }
      G = savedG;
      if (typeof ACTIVE_MARKET !== 'undefined' && savedActive != null) ACTIVE_MARKET = savedActive;
      if (typeof MP !== 'undefined' && MP) {
        if (savedMPMode !== undefined) MP.mode = savedMPMode;
        if (savedMPHost !== undefined) MP.isHost = savedMPHost;
        MP.players = savedMPPlayers;
        if (savedMPPid !== undefined) MP.playerId = savedMPPid;
      }
    }

    var rows = (typeof globalThis !== 'undefined' && globalThis.__WL_CASH_BRIDGE_AUDIT_ROWS__) || [];
    var anomalies = rows.filter(function (r) {
      return (
        r.anomaly_large_delta ||
        r.anomaly_modal_cash_mismatch ||
        r.anomaly_modal_ebitda_mismatch ||
        r.anomaly_reconcile_fail
      );
    });

    var csvCols = [
      'scenarioId',
      'marketId',
      'year',
      'period',
      'season',
      'cash_before_advance',
      'early_pipeline_cash_delta',
      'total_station_revenue',
      'total_station_operating_cost',
      'total_station_ebitda',
      'lma_cash_in',
      'lma_cash_out',
      'lma_net',
      'loan_interest',
      'pressure_net_cash_delta',
      'cash_after_all_rollover_steps',
      'cash_after_clock_advance',
      'computed_expected_cash_after',
      'delta',
      'modal_net_ebitda',
      'modal_cash_on_hand',
      'modal_loan_interest',
      'modal_debt_principal_outstanding',
      'anomaly_large_delta',
      'anomaly_modal_cash_mismatch',
      'anomaly_reconcile_fail',
    ];
    var csvLines = [csvCols.join(',')];
    for (var ri = 0; ri < rows.length; ri++) {
      var rr = rows[ri];
      csvLines.push(
        csvCols
          .map(function (k) {
            return cashBridgeCsvCell(rr[k]);
          })
          .join(',')
      );
    }
    var csv = csvLines.join('\n');

    var lines = [];
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('  CASH FLOW BRIDGE AUDIT (solo — advTurn step log + modal fields)');
    lines.push('  Rows: ' + rows.length + ' · Anomalies flagged: ' + anomalies.length);
    lines.push('  LMA/debt probes: ' + JSON.stringify(probeLog));
    lines.push('══════════════════════════════════════════════════════════════');
    if (anomalies.length) {
      lines.push('--- Anomaly sample (first 12) ---');
      lines.push(JSON.stringify(anomalies.slice(0, 12), null, 2));
    } else {
      lines.push('No anomaly flags (threshold abs(delta)<=1, modal cash matches rollover cash).');
    }
    lines.push('--- Full rows: use .rows, .csv, or JSON file from npm run sim:cash-bridge-audit ---');

    var plainEnglish = lines.join('\n');
    return {
      rows: rows,
      anomalies: anomalies,
      anomalyCount: anomalies.length,
      csv: csv,
      json: JSON.stringify(rows, null, 2),
      probeLog: probeLog,
      plainEnglish: plainEnglish,
      options: { startCash: startCash, seed: seed, quick: quick },
    };
  }

  /**
   * Solo: load a real scenario preset (e.g. King of the Dial `wsb` in Chicago) and advance the clock
   * with deterministic RNG. Summarizes cash bridge components + finHistory chain integrity.
   *
   * @param {object} [opts]
   * @param {string} [opts.marketId] default 'chicago'
   * @param {string} [opts.scenarioId] default 'wsb' (King of the Dial — BP idx 4 AM MOR dominant)
   * @param {number} [opts.seed] LCG seed for Math.random patch
   * @param {number} [opts.maxSteps] safety cap (default 200)
   * @param {number} [opts.stopYear] with stopPeriod: exit loop once G.year/G.period passes that slot (after advTurn)
   * @param {number} [opts.stopPeriod] 1=spring 2=fall
   */
  function runScenarioSoloCashProbe(opts) {
    opts = opts || {};
    var marketId = opts.marketId || 'chicago';
    var scenarioId = opts.scenarioId || 'wsb';
    var maxSteps = opts.maxSteps != null ? opts.maxSteps : 200;
    var stopYear = opts.stopYear;
    var stopPeriod = opts.stopPeriod;
    var seed = opts.seed != null ? opts.seed : 202604071;
    var verbose = opts.verbose !== false;

    if (typeof genMarket !== 'function') throw new Error('genMarket not found — load legacy.js first');
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedSel = typeof _selectedMarket !== 'undefined' ? _selectedMarket : null;
    var savedMPMode = typeof MP !== 'undefined' && MP ? MP.mode : undefined;
    var savedMPPlayers = typeof MP !== 'undefined' && MP ? MP.players : undefined;
    var savedMPPid = typeof MP !== 'undefined' && MP ? MP.playerId : undefined;
    var savedHeadless = typeof globalThis !== 'undefined' ? globalThis.__WL_HEADLESS__ : undefined;
    var origRandom = Math.random;

    var lines = [];
    var steps = 0;
    var minCash = 0;
    var maxAbsEarly = 0;
    var sumEbitda = 0;
    var sumInterest = 0;
    var sumLma = 0;
    var sumPressure = 0;
    var chainViolations = [];

    try {
      if (typeof globalThis !== 'undefined') globalThis.__WL_HEADLESS__ = true;
      if (typeof MP === 'undefined') throw new Error('MP not defined');
      MP.mode = 'solo';
      MP.players = [];
      MP.playerId = 0;
      ACTIVE_MARKET = marketId;
      if (typeof _selectedMarket !== 'undefined') _selectedMarket = marketId;
      syncMarketPopToMarket(marketId);

      var s = seed;
      Math.random = function () {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };

      G = genMarket(scenarioId);
      if (typeof migrateSave === 'function') migrateSave(G);

      var startCash = G.cash || 0;
      minCash = startCash;
      var ps = G.ps || [];
      var st0 = ps[0];
      var scRow = typeof SC !== 'undefined' && SC ? SC.find(function (x) { return x.id === scenarioId; }) : null;
      var baseScenarioCash = scRow && scRow.cash != null ? scRow.cash : null;

      lines.push('══════════════════════════════════════════════════════════════');
      lines.push('  SCENARIO SOLO CASH PROBE');
      lines.push('  Market: ' + marketId + ' · Scenario: ' + scenarioId + (scRow && scRow.l ? ' (' + scRow.l + ')' : ''));
      lines.push('  RNG seed: ' + seed);
      lines.push('══════════════════════════════════════════════════════════════');
      if (baseScenarioCash != null) {
        lines.push('Scenario base cash (SC table): ' + baseScenarioCash);
        lines.push('G.cash after genMarket (scaled for market): ' + startCash);
      } else {
        lines.push('G.cash after genMarket: ' + startCash);
      }
      if (st0) {
        lines.push(
          'Player station: ' +
            st0.callLetters +
            ' · ' +
            st0.format +
            ' · OQ ' +
            (st0.oq != null ? st0.oq : '—') +
            ' · share ' +
            (st0.rat && st0.rat.share != null ? (st0.rat.share * 100).toFixed(2) + '%' : '—')
        );
        if (scRow && scRow.heritageIncumbent) lines.push('Scenario heritageIncumbent: true (OQ/slot-quality boost at gen)');
      } else {
        lines.push('WARNING: no player station in G.ps');
      }
      lines.push('Start clock: ' + G.year + ' period ' + G.period + ' (1=SPR 2=FAL)');

      var ui = patchTimersAndUi();
      var doneByStop = false;
      try {
        while (steps < maxSteps) {
          if (stopYear != null && stopPeriod != null) {
            if (G.year > stopYear || (G.year === stopYear && G.period > stopPeriod)) {
              doneByStop = true;
              break;
            }
          }
          advTurn();
          steps++;
          var c = G.cash || 0;
          if (c < minCash) minCash = c;
          var fh = G.finHistory || [];
          var last = fh.length ? fh[fh.length - 1] : null;
          if (last) {
            sumEbitda += last.ebitda || 0;
            sumInterest += last.loanInterest || 0;
            sumLma += last.lmaNet || 0;
            sumPressure += last.pressureNet || 0;
            var ep = last.earlyPipelineNet;
            if (ep != null && Math.abs(ep) > Math.abs(maxAbsEarly)) maxAbsEarly = ep;
          }
          if (stopYear != null && stopPeriod != null) {
            if (G.year > stopYear || (G.year === stopYear && G.period > stopPeriod)) {
              doneByStop = true;
              break;
            }
          }
          if (G.year > 2030) break;
        }
      } finally {
        ui.restore();
      }

      chainViolations = verifySoloFinHistoryChain(G.finHistory || [], startCash);
      var endCash = G.cash || 0;
      var st1 = (G.ps && G.ps[0]) || null;

      lines.push('--- After ' + steps + ' advTurn() ---');
      lines.push('Clock now: ' + G.year + ' period ' + G.period + (doneByStop ? ' (stopped after target period processed)' : ''));
      lines.push('Cash: end ' + endCash + ' · min over run ' + minCash + ' · Δcash ' + (endCash - startCash));
      lines.push(
        'finHistory sums: ΣEBITDA ' +
          sumEbitda +
          ' · ΣloanInt ' +
          sumInterest +
          ' · ΣlmaNet ' +
          sumLma +
          ' · Σpressure ' +
          sumPressure +
          ' · max|earlyPipeline| ' +
          maxAbsEarly
      );
      lines.push('finHistory chain violations: ' + chainViolations.length);
      if (st1) {
        lines.push(
          'Player station now: ' +
            st1.callLetters +
            ' · ' +
            st1.format +
            ' · OQ ' +
            (st1.oq != null ? st1.oq : '—') +
            ' · share ' +
            (st1.rat && st1.rat.share != null ? (st1.rat.share * 100).toFixed(2) + '%' : '—')
        );
        if (st1.fin) {
          lines.push(
            'Last card fin: rev ' +
              (st1.fin.rev || 0) +
              ' · cost ' +
              (st1.fin.cost || 0) +
              ' · ebitda ' +
              (st1.fin.ebitda || 0)
          );
        }
      }
      if (chainViolations.length) {
        lines.push('--- Chain violations (first 6) ---');
        lines.push(JSON.stringify(chainViolations.slice(0, 6), null, 2));
      }
      lines.push('--- Design notes (this scenario) ---');
      lines.push(
        'wsb = BP idx 4: AM MOR 50kW dominant. Chicago MARKET_BP_PATCH: idx2 NEWS_TALK emerging, idx16 FM TOP40 emerging (Chicago does not defer idx16 in 1970).'
      );
      lines.push(
        'Starting cash = SC.cash × marketStartingCashMultiplier (Chicago mega + revScale 2.8). Heritage incumbent boosts OQ and slot qualities.'
      );
      lines.push(
        '1985 Fall in UI = after processing that half-year; mega fragmentation adds FM competitors from 1983 onward — expect more share pressure vs a 1970s-only dial.'
      );

      var plainEnglish = lines.join('\n');
      if (verbose && typeof console !== 'undefined') console.log(plainEnglish);

      return {
        ok: chainViolations.length === 0,
        plainEnglish: plainEnglish,
        marketId: marketId,
        scenarioId: scenarioId,
        steps: steps,
        startCash: startCash,
        endCash: endCash,
        minCash: minCash,
        sumEbitda: sumEbitda,
        sumInterest: sumInterest,
        sumLmaNet: sumLma,
        sumPressure: sumPressure,
        maxAbsEarlyPipeline: maxAbsEarly,
        chainViolations: chainViolations,
        openingStation: st0
          ? { callLetters: st0.callLetters, format: st0.format, oq: st0.oq, share: st0.rat && st0.rat.share }
          : null,
        endingStation: st1
          ? { callLetters: st1.callLetters, format: st1.format, oq: st1.oq, share: st1.rat && st1.rat.share }
          : null,
        year: G.year,
        period: G.period,
      };
    } finally {
      Math.random = origRandom;
      if (typeof globalThis !== 'undefined') globalThis.__WL_HEADLESS__ = savedHeadless;
      G = savedG;
      if (typeof ACTIVE_MARKET !== 'undefined' && savedActive != null) ACTIVE_MARKET = savedActive;
      if (typeof _selectedMarket !== 'undefined' && savedSel != null) _selectedMarket = savedSel;
      if (typeof MP !== 'undefined' && MP) {
        if (savedMPMode !== undefined) MP.mode = savedMPMode;
        MP.players = savedMPPlayers;
        if (savedMPPid !== undefined) MP.playerId = savedMPPid;
      }
    }
  }

  function runCashFlowIntegrityDiagnostic(opts) {
    opts = opts || {};
    var markets =
      opts.markets && opts.markets.length
        ? opts.markets
        : opts.quick
          ? ['atlanta']
          : ['atlanta', 'nashville', 'chicago', 'seattle'];
    var periodsPerMarket = opts.periodsPerMarket != null ? opts.periodsPerMarket : opts.quick ? 36 : 56;
    var maxStepsPerRun = opts.maxStepsPerRun != null ? opts.maxStepsPerRun : 200;
    var injectLesseeAfter = opts.injectLesseeAfter != null ? opts.injectLesseeAfter : 18;
    var injectLessorAfter = opts.injectLessorAfter != null ? opts.injectLessorAfter : -1;
    var startCash = opts.startCash != null ? opts.startCash : 5000000;
    var seed = opts.seed != null ? opts.seed : 20260407;
    var verbose = opts.verbose !== false;

    if (typeof genMarketMP !== 'function') throw new Error('genMarketMP not found — load legacy.js first');
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedMPMode = typeof MP !== 'undefined' && MP ? MP.mode : undefined;
    var savedMPHost = typeof MP !== 'undefined' && MP ? MP.isHost : undefined;
    var savedMPPlayers = typeof MP !== 'undefined' && MP ? MP.players : undefined;
    var savedMPPid = typeof MP !== 'undefined' && MP ? MP.playerId : undefined;
    var savedHeadless = typeof globalThis !== 'undefined' ? globalThis.__WL_HEADLESS__ : undefined;
    var origRandom = Math.random;

    var allViolations = [];
    var summaries = [];
    var lesseeOk = [];
    var lessorOk = [];

    try {
      if (typeof globalThis !== 'undefined') globalThis.__WL_HEADLESS__ = true;
      if (typeof MP === 'undefined') throw new Error('MP not defined — legacy multiplayer bootstrap missing');
      for (var mi = 0; mi < markets.length; mi++) {
        (function (seedRun) {
          var s = seedRun;
          Math.random = function () {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
          };
        })(seed + mi * 9991);

        var marketId = markets[mi];
        ACTIVE_MARKET = marketId;
        syncMarketPopToMarket(marketId);
        G = genMarketMP('1985');
        if (typeof migrateSave === 'function') migrateSave(G);

        MP.mode = 'solo';
        MP.isHost = false;
        MP.players = [];
        MP.playerId = 0;
        G.loans = [];
        G.finHistory = [];

        var pool = (G.stations || []).filter(function (s) {
          return s && !s._bpSlotDeferred && !s.isPublic && !s.isPlayer;
        });
        var take = Math.min(3, pool.length);
        for (var t = 0; t < take; t++) {
          pool[t].isPlayer = true;
          if (typeof applyDefaultBrandToPlayerStation === 'function') applyDefaultBrandToPlayerStation(pool[t]);
        }
        G.ps = G.stations.filter(function (st) {
          return st.isPlayer;
        });
        G.cash = startCash;
        if (!G.sc) G.sc = {};
        G.sc.cash = startCash;

        var cashBeforeRun = G.cash;
        var steps = 0;
        var ui = patchTimersAndUi();
        try {
          while (steps < periodsPerMarket && steps < maxStepsPerRun) {
            if (injectLesseeAfter >= 0 && steps === injectLesseeAfter) {
              lesseeOk.push({ marketId: marketId, ok: injectLmaLesseeProbe(G) });
            }
            if (injectLessorAfter >= 0 && steps === injectLessorAfter) {
              lessorOk.push({ marketId: marketId, ok: injectLmaLessorProbe(G) });
            }
            var y0 = G.year;
            var p0 = G.period;
            if (y0 > 2030 || (y0 === 2030 && p0 > 2)) break;

            advTurn();
            steps++;
            if (G.year > 2030) break;
          }
        } finally {
          ui.restore();
        }

        var fh = G.finHistory || [];
        var viol = verifySoloFinHistoryChain(fh, cashBeforeRun);
        for (var v = 0; v < viol.length; v++) {
          viol[v].marketId = marketId;
        }
        allViolations = allViolations.concat(viol);
        summaries.push({
          marketId: marketId,
          periodsSimulated: fh.length,
          violationCount: viol.length,
          endingCash: G.cash,
          finHistoryTail: fh.slice(-3),
        });
      }
    } finally {
      Math.random = origRandom;
      if (typeof globalThis !== 'undefined') globalThis.__WL_HEADLESS__ = savedHeadless;
      G = savedG;
      if (typeof ACTIVE_MARKET !== 'undefined' && savedActive != null) ACTIVE_MARKET = savedActive;
      if (typeof MP !== 'undefined' && MP) {
        if (savedMPMode !== undefined) MP.mode = savedMPMode;
        if (savedMPHost !== undefined) MP.isHost = savedMPHost;
        MP.players = savedMPPlayers;
        if (savedMPPid !== undefined) MP.playerId = savedMPPid;
      }
    }

    var lines = [];
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('  CASH FLOW INTEGRITY (solo headless)');
    lines.push('  Identity: Δcash === earlyPipeline + ebitda − loanInterest + lmaNet + pressureNet  (solo; see G.finHistory)');
    lines.push('  Markets: ' + markets.join(', '));
    lines.push('  Periods/market (cap): ' + periodsPerMarket + ' · startCash ' + startCash);
    lines.push(
      '  LMA probes: lessee @ period ' +
        (injectLesseeAfter >= 0 ? injectLesseeAfter : 'off') +
        ' · lessor @ ' +
        (injectLessorAfter >= 0 ? injectLessorAfter : 'off')
    );
    lines.push('══════════════════════════════════════════════════════════════');
    if (allViolations.length === 0) {
      lines.push('OK — no chain violations across ' + summaries.length + ' market run(s).');
    } else {
      lines.push('FAIL — ' + allViolations.length + ' violation(s):');
      lines.push(JSON.stringify(allViolations, null, 2));
    }
    if (lesseeOk.length) lines.push('Lessee inject: ' + JSON.stringify(lesseeOk));
    if (lessorOk.length) lines.push('Lessor inject: ' + JSON.stringify(lessorOk));
    lines.push('--- Summaries ---');
    lines.push(JSON.stringify(summaries, null, 2));

    var plainEnglish = lines.join('\n');
    var out = {
      ok: allViolations.length === 0,
      violations: allViolations,
      summaries: summaries,
      lesseeInject: lesseeOk,
      lessorInject: lessorOk,
      plainEnglish: plainEnglish,
      options: {
        markets: markets,
        periodsPerMarket: periodsPerMarket,
        startCash: startCash,
        seed: seed,
      },
    };
    if (verbose && typeof console !== 'undefined') {
      console.log(out.plainEnglish);
    }
    return out;
  }

  /**
   * Headless stress: many advTurn() steps × markets × RNG seeds; detect market-wide ratings collapse
   * (sum of rat.share ~0, NaN shares, bad OQ) and ranker snapshot rows that sum to ~0.
   * If legacy stitch runs, records rescued:true (post-fix builds self-heal).
   *
   * @param {object} [opts]
   * @param {string[]} [opts.markets] default LA, NYC, Chicago, Atlanta
   * @param {string} [opts.eraKey] default '1970' (solo / Stack path; more periods through fragmentation).
   *   Use '1985' for fewer advTurns to the 2010s or parity with mid-80s megamarket CSV-style saves.
   * @param {number} [opts.endYear] default 2015
   * @param {number} [opts.endPeriod] default 2
   * @param {number} [opts.numSeeds] default 24 (8 when opts.quick)
   * @param {number} [opts.seed] base LCG seed
   * @param {number} [opts.maxSteps] cap per run (default 320; 1970→2015 needs ~92 half-years per seed)
   * @param {boolean} [opts.verbose]
   */
  function runRatingsCollapseAudit(opts) {
    opts = opts || {};
    /* Fixed order for RNG reproducibility — mega + Atlanta + Seattle (excludes Nashville). Not the full playable list. */
    var markets = opts.markets || ['losangeles', 'newyork', 'chicago', 'atlanta', 'seattle'];
    var eraKey = opts.eraKey != null ? opts.eraKey : '1970';
    var endYear = opts.endYear != null ? opts.endYear : 2015;
    var endPeriod = opts.endPeriod != null ? opts.endPeriod : 2;
    var numSeeds = opts.numSeeds != null ? opts.numSeeds : opts.quick ? 8 : 24;
    var baseSeed = opts.seed != null ? opts.seed : 202604071;
    var maxSteps = opts.maxSteps != null ? opts.maxSteps : 320;
    var verbose = opts.verbose !== false;
    var COLLAPSE = 1e-5;

    if (typeof genMarketMP !== 'function') throw new Error('genMarketMP not found — load legacy.js first');
    if (typeof advTurn !== 'function') throw new Error('advTurn not found');
    if (typeof syncMarketPopToMarket !== 'function') throw new Error('syncMarketPopToMarket not found');

    var savedG = typeof G !== 'undefined' ? G : null;
    var savedActive = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : null;
    var savedMPMode = window.MP && MP.mode;
    var origRandom = Math.random;

    var incidents = [];
    var stitchEvents = [];
    var totalAdvTurns = 0;

    function inspectAfterTurn(G) {
      var active = (G.stations || []).filter(function (s) {
        return s && !s._bpSlotDeferred && s.rat;
      });
      var sumLive = 0;
      var maxLive = 0;
      var badSh = 0;
      var badOq = 0;
      for (var i = 0; i < active.length; i++) {
        var st = active[i];
        var sh = Number(st.rat.share);
        if (!Number.isFinite(sh)) badSh++;
        else {
          sumLive += sh;
          if (sh > maxLive) maxLive = sh;
        }
        if (typeof st.oq !== 'number' || !Number.isFinite(st.oq)) badOq++;
      }
      var snapSum = null;
      var snapY = null;
      var snapP = null;
      var rh = G.rankerHistory;
      if (rh && rh.length) {
        var last = rh[rh.length - 1];
        if (last && last.shares && typeof last.shares === 'object') {
          snapY = last.year;
          snapP = last.period;
          snapSum = 0;
          for (var id in last.shares) {
            if (Object.prototype.hasOwnProperty.call(last.shares, id)) {
              snapSum += Number(last.shares[id]) || 0;
            }
          }
        }
      }
      return {
        nActive: active.length,
        sumLive: sumLive,
        maxLive: maxLive,
        badSh: badSh,
        badOq: badOq,
        snapSum: snapSum,
        snapYear: snapY,
        snapPeriod: snapP,
      };
    }

    try {
      for (var mi = 0; mi < markets.length; mi++) {
        var marketId = markets[mi];
        for (var si = 0; si < numSeeds; si++) {
          (function (seedRun) {
            var s = seedRun;
            Math.random = function () {
              s = (s * 9301 + 49297) % 233280;
              return s / 233280;
            };
          })(baseSeed + mi * 7919 + si * 9973);

          ACTIVE_MARKET = marketId;
          syncMarketPopToMarket(marketId);
          G = genMarketMP(eraKey);
          MP.mode = 'solo';
          MP.isHost = false;
          if (MP.players) MP.players = [];

          var ui = patchTimersAndUi();
          var steps = 0;
          try {
            while (steps < maxSteps) {
              var y0 = G.year;
              var p0 = G.period;
              if (y0 > endYear || (y0 === endYear && p0 > endPeriod)) break;

              var stitchBefore = G._wlRatingsStitchUsed || 0;
              advTurn();
              steps++;
              totalAdvTurns++;
              var stitched = (G._wlRatingsStitchUsed || 0) > stitchBefore;

              var m = inspectAfterTurn(G);
              var snapBad = m.snapSum != null && m.snapSum < COLLAPSE && m.nActive >= 4;
              var liveBad = m.sumLive < COLLAPSE && m.nActive >= 4;
              var integrityBad = m.badSh > 0 || m.badOq > 0;

              if (stitched) {
                stitchEvents.push({
                  marketId: marketId,
                  seedIndex: si,
                  year: m.snapYear,
                  period: m.snapPeriod,
                  sumLive: m.sumLive,
                  snapSum: m.snapSum,
                });
              }

              if (snapBad || liveBad || integrityBad) {
                incidents.push({
                  marketId: marketId,
                  seedIndex: si,
                  step: steps,
                  at: { year: G.year, period: G.period },
                  snapBook: { year: m.snapYear, period: m.snapPeriod },
                  sumLive: m.sumLive,
                  maxLive: m.maxLive,
                  snapSum: m.snapSum,
                  badSh: m.badSh,
                  badOq: m.badOq,
                  nActive: m.nActive,
                  snapBad: snapBad,
                  liveBad: liveBad,
                  integrityBad: integrityBad,
                  rescued: stitched,
                });
              }
            }
          } finally {
            ui.restore();
          }
        }
      }
    } finally {
      Math.random = origRandom;
      G = savedG;
      if (typeof ACTIVE_MARKET !== 'undefined' && savedActive != null) ACTIVE_MARKET = savedActive;
      if (typeof MP !== 'undefined' && MP && savedMPMode !== undefined) MP.mode = savedMPMode;
    }

    var lines = [];
    lines.push('══════════════════════════════════════════════════════════════');
    lines.push('  RATINGS COLLAPSE AUDIT (headless advTurn × markets × seeds)');
    lines.push('  Markets: ' + markets.join(', ') + ' · era genMarketMP("' + eraKey + '")');
    lines.push('  Target calendar: through ' + endYear + ' period ' + endPeriod + ' · seeds/market: ' + numSeeds);
    lines.push('  Total advTurn calls: ' + totalAdvTurns);
    lines.push('  Stitch rescues (G._wlRatingsStitchUsed): ' + stitchEvents.length);
    lines.push('  Incidents (snapΣ<' + COLLAPSE + ' or liveΣ<' + COLLAPSE + ' or NaN): ' + incidents.length);
    lines.push('  Note: incidents = bad state still visible after advTurn. Stitch often repairs same-turn,');
    lines.push('        so many rescues with 0 incidents means the self-heal path is working as intended.');
    lines.push('══════════════════════════════════════════════════════════════');
    if (incidents.length) {
      lines.push(JSON.stringify(incidents, null, 2));
    } else {
      lines.push('OK — no collapse or integrity flags in this sample.');
    }
    if (stitchEvents.length && verbose) {
      lines.push('--- stitch events (sample up to 12) ---');
      lines.push(JSON.stringify(stitchEvents.slice(0, 12), null, 2));
    }

    var plainEnglish = lines.join('\n');
    var hardFail = incidents.some(function (i) {
      return (
        i.integrityBad ||
        ((i.snapBad || i.liveBad) && !i.rescued)
      );
    });
    var out = {
      ok: !hardFail,
      incidents: incidents,
      stitchEvents: stitchEvents,
      totalAdvTurns: totalAdvTurns,
      plainEnglish: plainEnglish,
      options: {
        markets: markets,
        eraKey: eraKey,
        endYear: endYear,
        endPeriod: endPeriod,
        numSeeds: numSeeds,
        seed: baseSeed,
        maxSteps: maxSteps,
      },
    };
    if (verbose && typeof console !== 'undefined') {
      console.log(out.plainEnglish);
    }
    return out;
  }

  window.runMarketSimulationBatch = runMarketSimulationBatch;
  window.runShareCalibrationInspection = runShareCalibrationInspection;
  window.runPublicRadioSimulation = runPublicRadioSimulation;
  window.marketHealthSnapshot = marketHealthSnapshot;
  window.runMarketHealthByDecadeDiagnostic = runMarketHealthByDecadeDiagnostic;
  window.marketEcologyInputSnapshot = marketEcologyInputSnapshot;
  window.compareMegaMarketEcologyInputs = compareMegaMarketEcologyInputs;
  window.runMarketEcologyDeepDiagnostic = runMarketEcologyDeepDiagnostic;
  window.runFormatEcologyInspection = runFormatEcologyInspection;
  window.runCashFlowIntegrityDiagnostic = runCashFlowIntegrityDiagnostic;
  window.runCashBridgeAudit = runCashBridgeAudit;
  window.runScenarioSoloCashProbe = runScenarioSoloCashProbe;
  window.runMegaMarketSnapshotsDiagnostic = runMegaMarketSnapshotsDiagnostic;
  window.runRatingsCollapseAudit = runRatingsCollapseAudit;
  window.megaSnapshotMetrics = megaSnapshotMetrics;
  window.advanceGToYearPeriod = advanceGToYearPeriod;
  window.mapFormatToEcologyBucket = mapFormatToEcologyBucket;
  window.classifyCommercialHealthDiagnostic = classifyCommercialHealthDiagnostic;
  window.snapshotFormatEcologyOnePeriod = snapshotFormatEcologyOnePeriod;
  window.FORMAT_ECOLOGY_COMMERCIAL_BUCKETS = FORMAT_ECOLOGY_COMMERCIAL_BUCKETS;
  window.FORMAT_ECOLOGY_MAINSTREAM_BUCKETS = FORMAT_ECOLOGY_MAINSTREAM_BUCKETS;
  window.MarketSimHarness = {
    runBatch: runMarketSimulationBatch,
    runShareCalibrationInspection: runShareCalibrationInspection,
    runPublicRadioSimulation: runPublicRadioSimulation,
    marketHealthSnapshot: marketHealthSnapshot,
    runMarketHealthByDecadeDiagnostic: runMarketHealthByDecadeDiagnostic,
    marketEcologyInputSnapshot: marketEcologyInputSnapshot,
    compareMegaMarketEcologyInputs: compareMegaMarketEcologyInputs,
    runMarketEcologyDeepDiagnostic: runMarketEcologyDeepDiagnostic,
    runFormatEcologyInspection: runFormatEcologyInspection,
    runCashFlowIntegrityDiagnostic: runCashFlowIntegrityDiagnostic,
    runCashBridgeAudit: runCashBridgeAudit,
    runScenarioSoloCashProbe: runScenarioSoloCashProbe,
    runMegaMarketSnapshotsDiagnostic: runMegaMarketSnapshotsDiagnostic,
    runRatingsCollapseAudit: runRatingsCollapseAudit,
    megaSnapshotMetrics: megaSnapshotMetrics,
    advanceGToYearPeriod: advanceGToYearPeriod,
    mapFormatToEcologyBucket: mapFormatToEcologyBucket,
    classifyCommercialHealthDiagnostic: classifyCommercialHealthDiagnostic,
    snapshotFormatEcologyOnePeriod: snapshotFormatEcologyOnePeriod,
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
