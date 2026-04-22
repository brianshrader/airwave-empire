/**
 * Executed in vm after src/legacy.js + ACTIVE_MARKET set.
 * Headless campaign sweep: 2008 Spring → through Fall 2024 (same number of advTurns as production clock).
 * Sets globalThis.__wlDigitalCampaignReport (string).
 *
 * Start: wlGenMarketGmUnderAtCareerTime(2008, 1) — gm_under / Nashville-style market from ACTIVE_MARKET.
 * Deterministic: each campaign run resets Math.random to mulberry32(seed) so the same seed →
 * same initial market; strategies diverge only from rule differences.
 *
 * Strategy rules (analysis only — not AI):
 * - Digital: portfolio-level applyDigitalToPortfolio (sort player stations by rat.aqh desc, deterministic ties).
 * - Discretionary spend: progBudget / promo from trailing rev (same spirit as validate-gm-campaign-headless Wichita profiles).
 * - Talent-Forward / Cost Cutter: light nudges to existing roster (quality / salary), then refreshStationOQ + calcRev.
 */
(function () {
  'use strict';

  var STRATEGIES = [
    { id: 'legacy', label: 'Legacy Operator', spend: 'balanced', talent: 'neutral' },
    { id: 'late', label: 'Late Adapter', spend: 'balanced', talent: 'neutral' },
    { id: 'early', label: 'Early Adapter', spend: 'balanced', talent: 'neutral' },
    { id: 'talent', label: 'Talent-Forward', spend: 'aggressive', talent: 'star' },
    { id: 'cutter', label: 'Cost Cutter', spend: 'conservative', talent: 'cheap' },
  ];

  var RUNS = (globalThis.__wlCampaignRuns | 0) || 30;
  var BASE_SEED = (globalThis.__wlCampaignBaseSeed | 0) >>> 0;

  function pad(s, w) {
    var t = String(s);
    while (t.length < w) t += ' ';
    return t.slice(0, w);
  }

  function fmtInt(n) {
    if (n == null || !isFinite(n)) return '—';
    return String(Math.round(n));
  }

  function fmtPct01(x) {
    if (x == null || !isFinite(x)) return '—';
    return Math.round(x * 1000) / 10 + '%';
  }

  function fmtFloat(x, d) {
    if (x == null || !isFinite(x)) return '—';
    var p = Math.pow(10, d | 0);
    return String(Math.round(x * p) / p);
  }

  function mulberry32(a) {
    return function () {
      var t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function bindGame(g) {
    if (typeof wlBindGameState === 'function') wlBindGameState(g);
    else {
      try {
        G = g;
      } catch (_e) {}
    }
    globalThis.G = g;
  }

  function playerStations() {
    var g = typeof G !== 'undefined' ? G : globalThis.G;
    if (!g || !g.stations) return [];
    return g.stations.filter(function (s) {
      return s && s.isPlayer && !s.isPublic && !s._bpSlotDeferred;
    });
  }

  function stationAqh(st) {
    return st && st.rat && st.rat.aqh != null ? st.rat.aqh : 0;
  }

  /**
   * Portfolio-level streaming: deterministic share of player stations (by AQH rank).
   * @param {Array} stations player portfolio
   * @param {"none"|"partial"|"majority"|"all"} mode
   * @param {number} year calendar year for launchYear when activating
   */
  function applyDigitalToPortfolio(stations, mode, year) {
    var y = year | 0;
    if (!stations || !stations.length || mode === 'none') return;
    var n = stations.length;
    var k = 0;
    if (mode === 'partial') k = Math.ceil(n * 0.4);
    else if (mode === 'majority') k = Math.ceil(n * 0.7);
    else if (mode === 'all') k = n;
    if (k <= 0) return;
    var sorted = stations.slice().sort(function (a, b) {
      var da = stationAqh(a);
      var db = stationAqh(b);
      if (db !== da) return db - da;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    var i;
    var cap = Math.min(k, sorted.length);
    for (i = 0; i < cap; i++) {
      var st = sorted[i];
      if (!st.stream) st.stream = { active: false, aqh: 0, rev: 0, upkeep: 0, dragOffset: 0, launchYear: 0 };
      st.stream.active = true;
      st.stream.launchYear = y;
    }
  }

  /** Calendar-year portfolio Digital mode per strategy (harness only). */
  function portfolioModeForStrategy(stratId, year) {
    var y = year | 0;
    if (stratId === 'legacy') return 'none';
    if (stratId === 'cutter') return y < 2020 ? 'none' : 'partial';
    if (stratId === 'late') {
      if (y < 2016) return 'none';
      if (y < 2020) return 'partial';
      return 'majority';
    }
    if (stratId === 'early') {
      if (y < 2008) return 'none';
      if (y >= 2020) return 'all';
      if (y >= 2014) return 'majority';
      return 'partial';
    }
    if (stratId === 'talent') {
      if (y < 2012) return 'none';
      if (y >= 2016) return 'all';
      return 'majority';
    }
    return 'none';
  }

  function applySpendProfile(st, spendKey) {
    var progCap = typeof progBudgetCapForPeriod === 'function' ? progBudgetCapForPeriod(G) : 80000;
    var promoCap = typeof promoBudgetCapForPeriod === 'function' ? promoBudgetCapForPeriod(G) : 50000;
    var piFrac = 0.062;
    var pmFrac = 0.037;
    if (spendKey === 'aggressive') {
      piFrac = 0.105;
      pmFrac = 0.062;
    } else if (spendKey === 'conservative') {
      piFrac = 0.026;
      pmFrac = 0.013;
    }
    if (!st.ops) st.ops = { spots: 14, sell: 0.55, promo: 0, progBudget: 0 };
    var r = st.fin && st.fin.rev ? st.fin.rev : 0;
    if (r < 500) r = 500;
    st.ops.progBudget = Math.round(Math.min(progCap, Math.max(150, r * piFrac)));
    st.ops.promo = Math.round(Math.min(promoCap, Math.max(80, r * pmFrac)));
  }

  function applyDigitalAndSpend(strat) {
    var ps = playerStations();
    var y = G.year | 0;
    var i;
    for (i = 0; i < ps.length; i++) {
      var st = ps[i];
      if (!st.stream) st.stream = { active: false, aqh: 0, rev: 0, upkeep: 0, dragOffset: 0, launchYear: 0 };
      st.stream.active = false;
      st.stream.launchYear = 0;
    }
    var mode = portfolioModeForStrategy(strat.id, y);
    applyDigitalToPortfolio(ps, mode, y);
    for (i = 0; i < ps.length; i++) {
      st = ps[i];
      applySpendProfile(st, strat.spend);
      if (typeof calcRev === 'function') calcRev(st, G);
    }
  }

  function applyTalentNudge(strat) {
    if (strat.talent === 'neutral') return;
    var ps = playerStations();
    for (var i = 0; i < ps.length; i++) {
      var st = ps[i];
      if (!st.prog) continue;
      Object.keys(st.prog).forEach(function (slot) {
        var sd = st.prog[slot];
        if (!sd || !sd.talent) return;
        var t = sd.talent;
        if (strat.talent === 'star') {
          t.quality = Math.min(93, Math.round((t.quality || 40) + 1));
          t.morale = Math.min(100, Math.round((t.morale || 65) + 1));
        } else if (strat.talent === 'cheap') {
          t.salary = Math.max(15000, Math.round((t.salary || 40000) * 0.985));
          t.quality = Math.max(18, Math.round((t.quality || 40) - 1));
        }
      });
      if (typeof refreshStationOQ === 'function') refreshStationOQ(st, G);
      if (typeof calcRev === 'function') calcRev(st, G);
    }
  }

  /** advTurn count from 2008 Spring through inclusive Fall 2024 (clock lands on 2025 Spring after last turn). */
  function turnsThroughFall2024() {
    return 34;
  }

  function sumFinHistoryByYearRange(hist, y0, y1) {
    var rev = 0;
    var ebit = 0;
    var h;
    for (h = 0; h < (hist || []).length; h++) {
      var row = hist[h];
      if (!row || row.year == null) continue;
      if (row.year >= y0 && row.year <= y1) {
        rev += row.revenue || 0;
        ebit += row.ebitda || 0;
      }
    }
    return { rev: rev, ebitda: ebit };
  }

  function endpointScoreVp() {
    try {
      if (typeof scoreCalc !== 'function') return { total: null, vp: null };
      var sc = scoreCalc(G);
      if (!sc) return { total: null, vp: null };
      return {
        total: sc.total != null && isFinite(sc.total) ? sc.total : null,
        vp: sc.vp != null && isFinite(sc.vp) ? sc.vp : null,
      };
    } catch (_e) {
      return { total: null, vp: null };
    }
  }

  function avgDigitalStrengthPlayer() {
    var ps = playerStations();
    if (!ps.length) return 0;
    var sum = 0;
    var i;
    for (i = 0; i < ps.length; i++) {
      var st = ps[i];
      var v = st.fin && st.fin.digitalStrength != null ? st.fin.digitalStrength : st.digital && st.digital.strength != null ? st.digital.strength : 0;
      sum += v;
    }
    return sum / ps.length;
  }

  function pickWinnerId(row, metricKey, tieKey) {
    var best = null;
    var bestPri = -Infinity;
    var bestTie = -Infinity;
    var i;
    for (i = 0; i < STRATEGIES.length; i++) {
      var id = STRATEGIES[i].id;
      var m = row[id];
      if (!m) continue;
      var pri = m[metricKey];
      var tie = tieKey ? m[tieKey] : 0;
      if (pri == null || !isFinite(pri)) continue;
      if (pri > bestPri || (pri === bestPri && tie > bestTie)) {
        bestPri = pri;
        bestTie = tie;
        best = id;
      }
    }
    return best;
  }

  /** Per-seed min–max normalize to 0..1; all equal or no finite → 0.5. */
  function normalizeStrategyValues(row, valueOf) {
    var pairs = STRATEGIES.map(function (s) {
      return { id: s.id, v: valueOf(row[s.id]) };
    });
    var finite = pairs.filter(function (p) {
      return p.v != null && isFinite(p.v);
    });
    var out = {};
    var fi;
    if (!finite.length) {
      STRATEGIES.forEach(function (s) {
        out[s.id] = 0.5;
      });
      return out;
    }
    var min = finite[0].v;
    var max = finite[0].v;
    for (fi = 1; fi < finite.length; fi++) {
      if (finite[fi].v < min) min = finite[fi].v;
      if (finite[fi].v > max) max = finite[fi].v;
    }
    if (max === min) {
      STRATEGIES.forEach(function (s) {
        out[s.id] = 0.5;
      });
    } else {
      for (fi = 0; fi < pairs.length; fi++) {
        var p = pairs[fi];
        var v = p.v;
        if (v == null || !isFinite(v)) out[p.id] = 0.5;
        else out[p.id] = (v - min) / (max - min);
      }
    }
    return out;
  }

  function computeCompositeModern(row) {
    var nFull = normalizeStrategyValues(row, function (m) {
      return m.cumEbitda;
    });
    var n16 = normalizeStrategyValues(row, function (m) {
      return m.cumEbitda2016;
    });
    var n20 = normalizeStrategyValues(row, function (m) {
      return m.cumEbitda2020;
    });
    var nE24 = normalizeStrategyValues(row, function (m) {
      return m.ebitda2024;
    });
    var nR24 = normalizeStrategyValues(row, function (m) {
      return m.rev2024;
    });
    var nDig = normalizeStrategyValues(row, function (m) {
      return m.digShare2024;
    });
    var nSc = normalizeStrategyValues(row, function (m) {
      return m.endScoreTotal;
    });
    var composite = {};
    STRATEGIES.forEach(function (s) {
      var id = s.id;
      composite[id] =
        0.2 * nFull[id] +
        0.2 * n16[id] +
        0.15 * n20[id] +
        0.15 * nR24[id] +
        0.1 * nE24[id] +
        0.1 * nDig[id] +
        0.1 * nSc[id];
    });
    return composite;
  }

  /** MODERN-ENDGAME composite: late-era + endpoint + digital + score weighted higher than full-period EBITDA. */
  function computeModernEndgameComposite(row) {
    var nFull = normalizeStrategyValues(row, function (m) {
      return m.cumEbitda;
    });
    var n16 = normalizeStrategyValues(row, function (m) {
      return m.cumEbitda2016;
    });
    var n20 = normalizeStrategyValues(row, function (m) {
      return m.cumEbitda2020;
    });
    var nE24 = normalizeStrategyValues(row, function (m) {
      return m.ebitda2024;
    });
    var nR24 = normalizeStrategyValues(row, function (m) {
      return m.rev2024;
    });
    var nDig = normalizeStrategyValues(row, function (m) {
      return m.digShare2024;
    });
    var nSc = normalizeStrategyValues(row, function (m) {
      return m.endScoreTotal;
    });
    var composite = {};
    STRATEGIES.forEach(function (s) {
      var id = s.id;
      composite[id] =
        0.05 * nFull[id] +
        0.1 * n16[id] +
        0.15 * n20[id] +
        0.1 * nE24[id] +
        0.2 * nR24[id] +
        0.2 * nDig[id] +
        0.2 * nSc[id];
    });
    return composite;
  }

  function bestCompositeId(row, composite) {
    var bestId = null;
    var bestC = -Infinity;
    var bestTie = -Infinity;
    STRATEGIES.forEach(function (s) {
      var id = s.id;
      var c = composite[id];
      var m = row[id];
      if (c == null || !isFinite(c)) return;
      var tie = (m.rev2024 || 0) * 1e-9 + (m.cumRev || 0) * 1e-12;
      if (c > bestC || (c === bestC && tie > bestTie)) {
        bestC = c;
        bestTie = tie;
        bestId = id;
      }
    });
    return bestId;
  }

  function runOneCampaign(strat, seed) {
    Math.random = mulberry32(seed >>> 0);
    var g = wlGenMarketGmUnderAtCareerTime(2008, 1);
    bindGame(g);
    g._wlHarnessDeterministic = true;
    g.marketId = ACTIVE_MARKET || g.marketId || 'nashville';

    var turns = turnsThroughFall2024();
    var sumDigFracPeriods = 0;
    var t;
    for (t = 0; t < turns; t++) {
      applyDigitalAndSpend(strat);
      var psPre = playerStations();
      var nPre = psPre.length;
      var actPre = 0;
      var u;
      for (u = 0; u < psPre.length; u++) {
        if (psPre[u].stream && psPre[u].stream.active) actPre++;
      }
      sumDigFracPeriods += nPre > 0 ? actPre / nPre : 0;
      applyTalentNudge(strat);
      advTurn();
    }

    var hist = G.finHistory || [];
    var cumRev = 0;
    var cumEbitda = 0;
    var rev2024 = 0;
    var ebitda2024 = 0;
    for (var h = 0; h < hist.length; h++) {
      var row = hist[h];
      if (!row) continue;
      cumRev += row.revenue || 0;
      cumEbitda += row.ebitda || 0;
      if (row.year === 2024) {
        rev2024 += row.revenue || 0;
        ebitda2024 += row.ebitda || 0;
      }
    }

    var r16 = sumFinHistoryByYearRange(hist, 2016, 2024);
    var r20 = sumFinHistoryByYearRange(hist, 2020, 2024);

    var rollup = typeof companyFinanceRollup === 'function' ? companyFinanceRollup() : null;
    var digShare2024 =
      rollup && rollup.digitalSharePct != null ? Math.max(0, rollup.digitalSharePct) / 100 : 0;

    var ps = playerStations();
    var nSt = ps.length;
    var digStations = ps.filter(function (s) {
      return s.stream && s.stream.active;
    }).length;
    var digStationFrac = turns > 0 ? sumDigFracPeriods / turns : 0;
    var pctStationsDigitalEnd = nSt > 0 ? digStations / nSt : 0;
    var cashEnd = typeof G.cash === 'number' ? G.cash : 0;
    var avgDigStr = avgDigitalStrengthPlayer();
    var epSc = endpointScoreVp();

    return {
      cumRev: cumRev,
      cumEbitda: cumEbitda,
      cumEbitda2016: r16.ebitda,
      cumRev2016: r16.rev,
      cumEbitda2020: r20.ebitda,
      cumRev2020: r20.rev,
      finalRev: rollup ? rollup.revenue : 0,
      finalEbitda: rollup ? rollup.ebitda : 0,
      rev2024: rev2024,
      ebitda2024: ebitda2024,
      digShare2024: digShare2024,
      digStations: digStations,
      digStationFrac: digStationFrac,
      pctStationsDigitalEnd: pctStationsDigitalEnd,
      cashEnd: cashEnd,
      avgDigStr2024: avgDigStr,
      endScoreTotal: epSc.total,
      endScoreVp: epSc.vp,
    };
  }

  var agg = {};
  STRATEGIES.forEach(function (s) {
    agg[s.id] = {
      sumCumRev: 0,
      sumCumEbitda: 0,
      sumDigShare: 0,
      sumDigStationFrac: 0,
      sumCumEbitda2016: 0,
      sumCumEbitda2020: 0,
      sumRev2024: 0,
      sumEbitda2024: 0,
      sumCashEnd: 0,
      sumAvgDigStr: 0,
      sumPctStationsDigitalEnd: 0,
      winsFull: 0,
      winsE16: 0,
      winsE20: 0,
      winsEndEbit2024: 0,
      winsEndRev2024: 0,
      winsEndScore: 0,
      winsCompositeModern: 0,
      sumCompositeModern: 0,
      winsModernEndgame: 0,
      sumModernEndgame: 0,
    };
  });

  var runsWithScore = 0;
  var r;
  for (r = 0; r < RUNS; r++) {
    var seed = (BASE_SEED + r * 0x9e3779b9) >>> 0;
    var row = {};
    STRATEGIES.forEach(function (s) {
      row[s.id] = runOneCampaign(s, seed);
    });
    var bestFull = pickWinnerId(row, 'cumEbitda', 'cumRev');
    var bestE16 = pickWinnerId(row, 'cumEbitda2016', 'cumRev2016');
    var bestE20 = pickWinnerId(row, 'cumEbitda2020', 'cumRev2020');
    var bestEndE = pickWinnerId(row, 'ebitda2024', 'rev2024');
    var bestEndR = pickWinnerId(row, 'rev2024', 'ebitda2024');
    var hasScore = STRATEGIES.some(function (st) {
      var x = row[st.id].endScoreTotal;
      return x != null && isFinite(x);
    });
    var bestEndS = null;
    if (hasScore) {
      var bestPri = -Infinity;
      var bestTie = -Infinity;
      STRATEGIES.forEach(function (st) {
        var m = row[st.id];
        var pri = m.endScoreTotal;
        var tie = m.endScoreVp != null ? m.endScoreVp : 0;
        if (pri == null || !isFinite(pri)) return;
        if (pri > bestPri || (pri === bestPri && tie > bestTie)) {
          bestPri = pri;
          bestTie = tie;
          bestEndS = st.id;
        }
      });
    }
    var compositeModern = computeCompositeModern(row);
    var bestComp = bestCompositeId(row, compositeModern);
    var modernEndgame = computeModernEndgameComposite(row);
    var bestME = bestCompositeId(row, modernEndgame);
    STRATEGIES.forEach(function (s) {
      var a = agg[s.id];
      var m = row[s.id];
      a.sumCumRev += m.cumRev;
      a.sumCumEbitda += m.cumEbitda;
      a.sumDigShare += m.digShare2024;
      a.sumDigStationFrac += m.digStationFrac;
      a.sumCumEbitda2016 += m.cumEbitda2016;
      a.sumCumEbitda2020 += m.cumEbitda2020;
      a.sumRev2024 += m.rev2024;
      a.sumEbitda2024 += m.ebitda2024;
      a.sumCashEnd += m.cashEnd;
      a.sumAvgDigStr += m.avgDigStr2024;
      a.sumPctStationsDigitalEnd += m.pctStationsDigitalEnd;
      a.sumCompositeModern += compositeModern[s.id];
      a.sumModernEndgame += modernEndgame[s.id];
      if (s.id === bestFull) a.winsFull++;
      if (s.id === bestE16) a.winsE16++;
      if (s.id === bestE20) a.winsE20++;
      if (s.id === bestEndE) a.winsEndEbit2024++;
      if (s.id === bestEndR) a.winsEndRev2024++;
      if (bestEndS && s.id === bestEndS) a.winsEndScore++;
      if (bestComp && s.id === bestComp) a.winsCompositeModern++;
      if (bestME && s.id === bestME) a.winsModernEndgame++;
    });
    if (hasScore) runsWithScore++;
  }

  var lines = [];
  lines.push('=== CAMPAIGN SUMMARY ===');
  lines.push(
    'Market: ' +
      String(ACTIVE_MARKET || 'nashville') +
      ' | Scenario: gm_under @ 2008–2024 | Runs/strategy: ' +
      RUNS +
      ' | Seeds: base ' +
      BASE_SEED
  );
  lines.push('');
  var w1 = 22;
  var w2 = 14;
  var w3 = 14;
  var w4 = 8;
  var w5 = 16;
  lines.push(
    pad('Strategy', w1) +
      ' | ' +
      pad('avgTotalRev', w2) +
      ' | ' +
      pad('avgEBITDA', w3) +
      ' | ' +
      pad('winRate', w4) +
      ' | ' +
      pad('avgDigShare2024', w5)
  );
  lines.push(
      pad('----------------------', w1) +
      ' | ' +
      pad('--------------', w2) +
      ' | ' +
      pad('--------------', w3) +
      ' | ' +
      pad('--------', w4) +
      ' | ' +
      pad('----------------', w5)
  );

  STRATEGIES.forEach(function (s) {
    var a = agg[s.id];
    var avgRev = a.sumCumRev / RUNS;
    var avgEbit = a.sumCumEbitda / RUNS;
    var winRate = RUNS ? a.winsFull / RUNS : 0;
    var avgDig = a.sumDigShare / RUNS;
    lines.push(
      pad(s.label, w1) +
        ' | ' +
        pad(fmtInt(avgRev), w2) +
        ' | ' +
        pad(fmtInt(avgEbit), w3) +
        ' | ' +
        pad(fmtPct01(winRate), w4) +
        ' | ' +
        pad(fmtPct01(avgDig), w5)
    );
  });

  lines.push('');
  lines.push(
    'Notes: avgTotalRev / avgEBITDA = cumulative company rollup from finHistory (all periods). ' +
      'winRate = wins on full 2008–2024 cumulative EBITDA (same tiebreak: + tiny cumulative revenue weight). ' +
      'avgDigShare2024 = companyFinanceRollup() digital revenue % after the last simulated period (post–Fall 2024 clock). ' +
      'Avg % stations with Digital (mean over periods of stream.active count / player station count): ' +
      STRATEGIES.map(function (s) {
        return s.label + ' ' + fmtPct01(agg[s.id].sumDigStationFrac / RUNS);
      }).join(' · ')
  );

  var wsb = 12;
  lines.push('');
  lines.push('=== WIN RATE BY SCOREBOARD ===');
  lines.push(
    '(Each column = % of seeds where that strategy ranks #1 on that metric; ties split by secondary where noted.)'
  );
  lines.push(
    pad('Strategy', w1) +
      ' | ' +
      pad('fullEBITDA', wsb) +
      ' | ' +
      pad('ebitda16p', wsb) +
      ' | ' +
      pad('ebitda20p', wsb) +
      ' | ' +
      pad('end24EBITDA', wsb) +
      ' | ' +
      pad('end24Rev', wsb) +
      ' | ' +
      pad('end24Score', wsb)
  );
  lines.push(
    pad('----------------------', w1) +
      ' | ' +
      pad('------------', wsb) +
      ' | ' +
      pad('-----------', wsb) +
      ' | ' +
      pad('-----------', wsb) +
      ' | ' +
      pad('-------------', wsb) +
      ' | ' +
      pad('----------', wsb) +
      ' | ' +
      pad('------------', wsb)
  );
  STRATEGIES.forEach(function (s) {
    var a = agg[s.id];
    var colScore = runsWithScore > 0 ? fmtPct01(a.winsEndScore / RUNS) : 'n/a';
    lines.push(
      pad(s.label, w1) +
        ' | ' +
        pad(fmtPct01(a.winsFull / RUNS), wsb) +
        ' | ' +
        pad(fmtPct01(a.winsE16 / RUNS), wsb) +
        ' | ' +
        pad(fmtPct01(a.winsE20 / RUNS), wsb) +
        ' | ' +
        pad(fmtPct01(a.winsEndEbit2024 / RUNS), wsb) +
        ' | ' +
        pad(fmtPct01(a.winsEndRev2024 / RUNS), wsb) +
        ' | ' +
        pad(colScore, wsb)
    );
  });
  lines.push(
    'Scoreboard keys: fullEBITDA = finHistory Σ EBITDA 2008–2024; ebitda16p = Σ 2016–2024; ebitda20p = Σ 2020–2024; ' +
      'end24EBITDA / end24Rev = finHistory rows calendar year 2024 only (Spring+Fall); end24Score = scoreCalc(G).total at sim end (calendar may read 2025 — see limitations).'
  );

  lines.push('');
  lines.push('=== 2024 ENDPOINT SUMMARY ===');
  lines.push(
    '(Averages per strategy across seeds: calendar 2024 from finHistory for rev/EBITDA; cash/strength from game state after last advTurn.)'
  );
  var wE1 = 22;
  var wE2 = 12;
  var wE3 = 14;
  var wE4 = 10;
  var wE5 = 12;
  var wE6 = 14;
  lines.push(
    pad('Strategy', wE1) +
      ' | ' +
      pad('avg2024Rev', wE2) +
      ' | ' +
      pad('avg2024EBITDA', wE3) +
      ' | ' +
      pad('avgCashEnd', wE4) +
      ' | ' +
      pad('avgDigShr24', wE5) +
      ' | ' +
      pad('avgPctStnDig', wE6)
  );
  lines.push(
    pad('----------------------', wE1) +
      ' | ' +
      pad('------------', wE2) +
      ' | ' +
      pad('--------------', wE3) +
      ' | ' +
      pad('----------', wE4) +
      ' | ' +
      pad('------------', wE5) +
      ' | ' +
      pad('--------------', wE6)
  );
  STRATEGIES.forEach(function (s) {
    var a = agg[s.id];
    lines.push(
      pad(s.label, wE1) +
        ' | ' +
        pad(fmtInt(a.sumRev2024 / RUNS), wE2) +
        ' | ' +
        pad(fmtInt(a.sumEbitda2024 / RUNS), wE3) +
        ' | ' +
        pad(fmtInt(a.sumCashEnd / RUNS), wE4) +
        ' | ' +
        pad(fmtPct01(a.sumDigShare / RUNS), wE5) +
        ' | ' +
        pad(fmtPct01(a.sumPctStationsDigitalEnd / RUNS), wE6)
    );
  });
  lines.push(
    'avgDigShr24 = companyFinanceRollup digital % (post–Fall 2024 clock). avgPctStnDig = share of player stations with stream.active at sim end.'
  );
  lines.push(
    'Avg portfolio Digital strength at sim end (0–1, mean of station fin.digitalStrength / digital.strength): ' +
      STRATEGIES.map(function (s) {
        return s.label + ' ' + fmtFloat(agg[s.id].sumAvgDigStr / RUNS, 2);
      }).join(' · ')
  );

  var earlyAvg16 = agg.early.sumCumEbitda2016 / RUNS;
  var legAvg16 = agg.legacy.sumCumEbitda2016 / RUNS;
  var talAvg20 = agg.talent.sumCumEbitda2020 / RUNS;
  var earlyAvg20 = agg.early.sumCumEbitda2020 / RUNS;
  var talEndE = agg.talent.sumEbitda2024 / RUNS;
  var earlyEndE = agg.early.sumEbitda2024 / RUNS;

  function winLeaderLabels(boardKey) {
    var maxv = -1;
    STRATEGIES.forEach(function (s) {
      var v = agg[s.id][boardKey] / RUNS;
      if (v > maxv) maxv = v;
    });
    if (maxv <= 0) return { text: 'none', rate: 0 };
    var names = [];
    STRATEGIES.forEach(function (s) {
      if (Math.abs(agg[s.id][boardKey] / RUNS - maxv) < 1e-12) names.push(s.label);
    });
    return { text: names.join(' + '), rate: maxv };
  }

  var bFull = winLeaderLabels('winsFull');
  var b16 = winLeaderLabels('winsE16');
  var b20 = winLeaderLabels('winsE20');
  var bEE = winLeaderLabels('winsEndEbit2024');
  var bER = winLeaderLabels('winsEndRev2024');
  var bSc = winLeaderLabels('winsEndScore');

  lines.push('');
  lines.push('=== LATE-ERA DIGITAL CHECK ===');
  lines.push(
    '- Early Adapter vs Legacy (avg cumulative EBITDA 2016–2024): ' +
      (earlyAvg16 > legAvg16 ? 'Early Adapter ahead' : 'Legacy ahead') +
      ' (Early ' +
      fmtInt(earlyAvg16) +
      ' vs Legacy ' +
      fmtInt(legAvg16) +
      ').'
  );
  lines.push(
    '- Talent-Forward vs Early Adapter (avg cumulative EBITDA 2020–2024): ' +
      (talAvg20 > earlyAvg20 ? 'Talent-Forward ahead' : 'Early Adapter ahead') +
      ' (Talent ' +
      fmtInt(talAvg20) +
      ' vs Early ' +
      fmtInt(earlyAvg20) +
      ').'
  );
  lines.push(
    '- Talent-Forward vs Early Adapter (avg calendar-2024 EBITDA from finHistory): ' +
      (talEndE > earlyEndE ? 'Talent-Forward ahead' : 'Early Adapter ahead') +
      ' (Talent ' +
      fmtInt(talEndE) +
      ' vs Early ' +
      fmtInt(earlyEndE) +
      ').'
  );
  lines.push(
    '- Win-rate leaders by scoreboard: full-period EBITDA → ' +
      bFull.text +
      ' (' +
      fmtPct01(bFull.rate) +
      '); 2016–24 cumulative EBITDA → ' +
      b16.text +
      ' (' +
      fmtPct01(b16.rate) +
      '); 2020–24 cumulative EBITDA → ' +
      b20.text +
      ' (' +
      fmtPct01(b20.rate) +
      '); 2024 calendar EBITDA (finHistory) → ' +
      bEE.text +
      ' (' +
      fmtPct01(bEE.rate) +
      '); 2024 calendar revenue → ' +
      bER.text +
      ' (' +
      fmtPct01(bER.rate) +
      '); scoreCalc total at sim end → ' +
      bSc.text +
      ' (' +
      fmtPct01(bSc.rate) +
      ').'
  );
  if (runsWithScore === 0) {
    lines.push(
      '- end24Score: scoreCalc(G) was unavailable or produced no finite totals in this VM batch — column shows n/a.'
    );
  } else {
    lines.push(
      '- end24Score caveat: G.year may be 2025 after the clock step; scoreCalc uses that year for decade weights / VP — useful for relative strategy comparison on the same harness, not a literal “Fall 2024 grade screen”.'
    );
  }

  var wc1 = 22;
  var wc2 = 10;
  var wc3 = 14;
  lines.push('');
  lines.push('=== COMPOSITE MODERN WINNER ===');
  lines.push(
    'Per seed: min–max normalize each metric across the five strategies (0–1; flat → 0.5), then weighted sum: ' +
      '0.20·full EBITDA + 0.20·ΣEBITDA(2016–24) + 0.15·ΣEBITDA(2020–24) + 0.15·2024 rev + 0.10·2024 EBITDA + ' +
      '0.10·digShare2024 + 0.10·scoreCalc total. Winner = max composite; tiebreak + (2024 rev×1e-9 + cumRev×1e-12).'
  );
  lines.push(
    pad('Strategy', wc1) + ' | ' + pad('winRate', wc2) + ' | ' + pad('avgComposite', wc3)
  );
  lines.push(
    pad('----------------------', wc1) + ' | ' + pad('----------', wc2) + ' | ' + pad('--------------', wc3)
  );
  var topCompLabel = STRATEGIES[0].label;
  var topCompAvg = -Infinity;
  STRATEGIES.forEach(function (s) {
    var a = agg[s.id];
    var avgC = a.sumCompositeModern / RUNS;
    if (avgC > topCompAvg) {
      topCompAvg = avgC;
      topCompLabel = s.label;
    }
    lines.push(
      pad(s.label, wc1) +
        ' | ' +
        pad(fmtPct01(a.winsCompositeModern / RUNS), wc2) +
        ' | ' +
        pad(fmtFloat(avgC, 3), wc3)
    );
  });
  lines.push('Top strategy by average composite score: ' + topCompLabel + ' (' + fmtFloat(topCompAvg, 3) + ').');

  var bComp = winLeaderLabels('winsCompositeModern');
  var cutterCompRate = agg.cutter.winsCompositeModern / RUNS;
  var cutterFullRate = agg.cutter.winsFull / RUNS;
  var earlyCompRate = agg.early.winsCompositeModern / RUNS;
  var talentCompRate = agg.talent.winsCompositeModern / RUNS;
  var lateCompRate = agg.late.winsCompositeModern / RUNS;
  var legCompRate = agg.legacy.winsCompositeModern / RUNS;

  lines.push('');
  lines.push('=== COMPOSITE INTERPRETATION ===');
  lines.push(
    '- Profit headline (full-period cumulative EBITDA) vs modern headline (composite): full-EBITDA wins ' +
      fmtPct01(cutterFullRate) +
      ' Cost Cutter; composite win-rate leader ' +
      bComp.text +
      ' at ' +
      fmtPct01(bComp.rate) +
      ' (Cost Cutter composite share ' +
      fmtPct01(cutterCompRate) +
      ').'
  );
  lines.push(
    '- Digital-forward competitiveness: Early Adapter composite wins ' +
      fmtPct01(earlyCompRate) +
      '; Talent-Forward ' +
      fmtPct01(talentCompRate) +
      '; Late Adapter ' +
      fmtPct01(lateCompRate) +
      '; Legacy ' +
      fmtPct01(legCompRate) +
      '. ' +
      (earlyCompRate + talentCompRate > cutterCompRate
        ? 'Early + Talent combined composite-win share exceeds Cost Cutter on this batch.'
        : 'Cost Cutter still holds the plurality or majority of composite wins on this batch.')
  );
  lines.push(
    '- Alignment: the composite down-weights “decades of austerity” vs a single EBITDA sum and up-weights late windows, 2024 revenue, digital share, and scoreCalc — closer to a “modern operator” read than raw cumulative EBITDA alone.'
  );
  if (cutterCompRate >= 0.5 && cutterFullRate >= 0.5 && bComp.text.indexOf('Cost Cutter') >= 0) {
    lines.push(
      '- Batch note: when one strategy wins most within-seed EBITDA norms (55% of the composite), composite wins can still track EBITDA — try different seeds/markets or adjust harness weights (not production) if you need more separation.'
    );
  }

  lines.push('');
  lines.push('=== MODERN-ENDGAME WINNER ===');
  lines.push(
    'Per seed: same min–max normalization as the original composite, then weighted sum: ' +
      '0.05·full EBITDA + 0.10·ΣEBITDA(2016–24) + 0.15·ΣEBITDA(2020–24) + 0.10·2024 EBITDA + 0.20·2024 rev + ' +
      '0.20·digShare2024 + 0.20·scoreCalc total. Winner = max; same tiebreak (2024 rev×1e-9 + cumRev×1e-12).'
  );
  lines.push(
    pad('Strategy', wc1) + ' | ' + pad('winRate', wc2) + ' | ' + pad('avgComposite', wc3)
  );
  lines.push(
    pad('----------------------', wc1) + ' | ' + pad('----------', wc2) + ' | ' + pad('--------------', wc3)
  );
  var topMELabel = STRATEGIES[0].label;
  var topMEAvg = -Infinity;
  STRATEGIES.forEach(function (s) {
    var a = agg[s.id];
    var avgME = a.sumModernEndgame / RUNS;
    if (avgME > topMEAvg) {
      topMEAvg = avgME;
      topMELabel = s.label;
    }
    lines.push(
      pad(s.label, wc1) +
        ' | ' +
        pad(fmtPct01(a.winsModernEndgame / RUNS), wc2) +
        ' | ' +
        pad(fmtFloat(avgME, 3), wc3)
    );
  });
  lines.push('Top strategy by average MODERN-ENDGAME composite: ' + topMELabel + ' (' + fmtFloat(topMEAvg, 3) + ').');

  var bME = winLeaderLabels('winsModernEndgame');
  var bProfit = winLeaderLabels('winsFull');

  lines.push('');
  lines.push('=== THREE-WAY HEADLINE (profit vs composites) ===');
  lines.push(
    '- Full-period cumulative EBITDA (CAMPAIGN SUMMARY winRate): leader ' +
      bProfit.text +
      ' at ' +
      fmtPct01(bProfit.rate) +
      '.'
  );
  lines.push(
    '- Original composite (COMPOSITE MODERN WINNER weights): leader ' + bComp.text + ' at ' + fmtPct01(bComp.rate) + '.'
  );
  lines.push(
    '- MODERN-ENDGAME composite (endpoint/digital/score–heavy): leader ' + bME.text + ' at ' + fmtPct01(bME.rate) + '.'
  );
  if (bProfit.text === bComp.text && bComp.text === bME.text) {
    lines.push(
      '- All three agree on this batch — EBITDA-heavy and late-era metrics still rank the same strategy #1 in most seeds.'
    );
  } else if (bME.text !== bProfit.text || bME.text !== bComp.text) {
    lines.push(
      '- MODERN-ENDGAME diverges from profit and/or the original composite when late 2024 revenue, digital share, and scoreCalc pull a different strategy to the top within each seed.'
    );
  } else {
    lines.push(
      '- Profit and original composite align; MODERN-ENDGAME matches or partially overlaps — check per-strategy winRate columns above for detail.'
    );
  }

  globalThis.__wlDigitalCampaignReport = lines.join('\n');
})();
