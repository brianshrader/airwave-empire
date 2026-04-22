/**
 * Executed in vm after src/legacy.js + ACTIVE_MARKET set.
 * Sets globalThis.__wlDigitalHarnessReport (string).
 *
 * Assumptions (synthetic, comparative — not full sim):
 * - Scenario `wsb`, market from ACTIVE_MARKET (default nashville): mid-tier revScale, typical rival mix.
 * - One commercial lab station per row (non-player FM for music / AM for talk when available).
 * - Injected ~7.2% share (AQH from share × cohort pops × AQH_ENGAGE) unless a group overrides (weak ~3.6%, strong ~8.8%).
 * - Same daypart talent template each time; tiers map to quality / formatFit / superstar per harness rules.
 * - Calendar: G.year/period/turn + streamDrag + cumulative ad index (matches genMarket pipe-split ad fragments) + fmp.
 * - Before each scenario: reset digital.maturity to a stable baseline from launch year (calcRev still adds one step — comparable across rows).
 *
 * Digital listening share (harness-only, no production changes):
 *   terrAqh = sum of cohort AQH in s.rat.cur (same inputs as calcRev’s local `aqh` before stream penetration).
 *   streamAqh = s.stream.aqh after calcRev.
 *   digitalListenPct = streamAqh / (terrAqh + streamAqh)  (Nielsen-style “share of combined listening”).
 */
(function () {
  'use strict';

  function pad(s, w) {
    var t = String(s);
    while (t.length < w) t += ' ';
    return t.slice(0, w);
  }

  function fmt$(n) {
    if (n == null || !isFinite(n)) return '—';
    return String(Math.round(n));
  }

  /** x is fraction 0..1 */
  function fmtPct01(x) {
    if (x == null || !isFinite(x)) return '—';
    return (Math.round(x * 1000) / 10) + '%';
  }

  function fmtFloat(x, d) {
    if (x == null || !isFinite(x)) return '—';
    var p = Math.pow(10, d | 0);
    return String(Math.round(x * p) / p);
  }

  /** Fraction 0..1 → percentage with one decimal (listening share). */
  function fmtListen1(f) {
    if (f == null || !isFinite(f)) return '—';
    return (Math.round(f * 1000) / 10).toFixed(1) + '%';
  }

  /** Terrestrial AQH = production calcRev cohort sum; stream from s.stream.aqh. */
  function digitalListenMetrics(st) {
    var terrAqh = COH.reduce(function (sum, c) {
      var cell = st.rat && st.rat.cur ? st.rat.cur[c] : null;
      return sum + (cell && cell.aqh != null ? cell.aqh : 0);
    }, 0);
    var streamAqh = st.stream && st.stream.active && (G.year >= 2005) ? st.stream.aqh || 0 : 0;
    var den = terrAqh + streamAqh;
    var digitalListenPct = den > 0 ? streamAqh / den : 0;
    return { terrAqh: terrAqh, streamAqh: streamAqh, digitalListenPct: digitalListenPct };
  }

  function row(cols, widths) {
    var out = [];
    for (var i = 0; i < cols.length; i++) {
      out.push(pad(cols[i], widths[i] || 8));
    }
    return out.join(' | ');
  }

  /** Cumulative ad market index through (year, period), same spirit as genMarket pre-apply. */
  function cumulativeAdxModThrough(y, p) {
    var adxMod = 1.0;
    for (var i = 0; i < EVDATA.length; i++) {
      var ev = EVDATA[i];
      if (!ev || ev.y == null || !ev.e) continue;
      if (ev.y > y) continue;
      if (ev.y === y && (ev.p || 1) > (p || 1)) continue;
      var parts = String(ev.e).split('|');
      for (var j = 0; j < parts.length; j++) {
        var part = parts[j];
        if (part.indexOf('ad+') === 0 || part.indexOf('ad-') === 0) {
          var delta = parseFloat(part.replace('ad', ''));
          if (isFinite(delta)) adxMod = Math.max(0.5, Math.min(2.0, adxMod * (1 + delta)));
        }
      }
    }
    return adxMod;
  }

  function streamDragThroughYear(y) {
    var n = 0;
    for (var i = 0; i < EVDATA.length; i++) {
      var ev = EVDATA[i];
      if (ev && ev.e === 'stream+' && ev.y < y) n++;
    }
    return Math.min(0.6, n * 0.06);
  }

  function applyCalendar(G, y, p) {
    G.year = y;
    G.period = p || 1;
    G.turn = (y - 1970) * 2 + (G.period === 2 ? 1 : 0);
    G.streamDrag = streamDragThroughYear(y);
    var adxMod = cumulativeAdxModThrough(y, G.period);
    var mkt = MARKETS[G.marketId || ACTIVE_MARKET] || MARKETS.atlanta;
    G.adx = adxMod * (1.0 + (mkt.adxBonus || 0));
    G.fmp = effectiveFmpForMarket(y, G.marketId || ACTIVE_MARKET);
    G.satDrag = G.satDrag || 0;
  }

  function injectShare(st, shareDec) {
    COH.forEach(function (coh) {
      var pop = (POP.cohorts[coh].t || 0) * effUniverse(st);
      var engage = AQH_ENGAGE[coh] || 0.06;
      if (!st.rat.cur[coh]) st.rat.cur[coh] = { share: 0, aqh: 0 };
      st.rat.cur[coh].share = shareDec;
      st.rat.cur[coh].aqh = Math.round(shareDec * pop * engage);
    });
    var ewp = COH.reduce(function (acc, c) {
      var pop = POP.cohorts[c].t || 0;
      var eng = AQH_ENGAGE[c] || 0.06;
      return acc + pop * eng;
    }, 0);
    st.rat.aqh = COH.reduce(function (sum, c) {
      return sum + (st.rat.cur[c].aqh || 0);
    }, 0);
    st.rat.share = COH.reduce(function (sum, c) {
      var pop = POP.cohorts[c].t || 0;
      var engage = AQH_ENGAGE[c] || 0.06;
      return sum + (st.rat.cur[c].share || 0) * ((pop * engage) / Math.max(ewp, 1));
    }, 0);
  }

  function makeFormatFit(fmt, mainFit) {
    var o = {};
    Object.keys(FM).forEach(function (k) {
      o[k] = k === fmt ? mainFit : Math.max(0.08, Math.min(0.5, mainFit * 0.45 + 0.04));
    });
    return o;
  }

  function makeTalent(slot, fmt, tier) {
    var q = tier === 'weak' ? 34 : tier === 'average' ? 56 : tier === 'strong' ? 80 : 76;
    var mainFit = tier === 'weak' ? 0.36 : tier === 'average' ? 0.58 : tier === 'strong' ? 0.82 : 0.74;
    var sup = tier === 'superstar';
    return {
      id: 'dig-t-' + slot + '-' + tier,
      name: 'Harness ' + slot,
      gender: 'male',
      slot: slot,
      quality: q,
      formatFit: makeFormatFit(fmt, mainFit),
      salary: tier === 'weak' ? 42000 : tier === 'average' ? 95000 : tier === 'strong' ? 220000 : 280000,
      cyr: 1.5,
      morale: 68,
      superstar: sup,
      _hireYear: G.year,
      _careerStartYear: G.year - 12,
    };
  }

  function applyTalentTier(st, fmt, tier) {
    ['morningDrive', 'midday', 'afternoonDrive', 'evening'].forEach(function (sl) {
      var t = st.prog[sl];
      if (!t) return;
      t.talent = makeTalent(sl, fmt, tier);
      t.quality = Math.round(t.talent.quality + (sl === 'midday' ? -6 : sl === 'evening' ? -10 : 0));
      t.quality = Math.max(12, Math.min(100, t.quality));
    });
    refreshStationOQ(st, G);
  }

  function pickLabStation(fmt) {
    var talk = ['NEWS_TALK', 'SPORTS_TALK', 'ALL_NEWS'].indexOf(fmt) >= 0;
    var cands = (G.stations || []).filter(function (s) {
      return s && !s.isPublic && !s._bpSlotDeferred && !s.isPlayer;
    });
    if (!cands.length) {
      cands = (G.stations || []).filter(function (s) {
        return s && !s.isPublic && !s._bpSlotDeferred;
      });
    }
    var s = talk
      ? cands.find(function (x) {
          return x.sig && x.sig.type === 'AM';
        }) || cands[0]
      : cands.find(function (x) {
          return x.sig && x.sig.type === 'FM';
        }) || cands[0];
    return s;
  }

  function resetStreamDigital(st, digitalOn, launchYear) {
    ensureStationDigitalState(st);
    st.digital.breakoutCooldown = 0;
    if (digitalOn) {
      st.stream.active = true;
      st.stream.launchYear = launchYear != null ? launchYear : G.year;
      st.digital.enabled = true;
    } else {
      st.stream.active = false;
      st.stream.launchYear = 0;
      st.stream.aqh = 0;
      st.stream.rev = 0;
      st.stream.upkeep = 0;
      st.stream.dragOffset = 0;
      st.digital.enabled = false;
      st.digital.maturity = 0;
      st.digital.strength = 0;
      st.digital.trend = 0;
      st.digital.lastRev = 0;
    }
  }

  /** Baseline maturity so scenarios do not drift from repeated calcRev maturity += 0.042. */
  function setDigitalMaturityBaseline(st, cfg) {
    ensureStationDigitalState(st);
    if (!cfg.digitalOn) {
      st.digital.maturity = 0;
      return;
    }
    if (cfg.maturityOverride != null) {
      st.digital.maturity = cfg.maturityOverride;
      return;
    }
    var ly = cfg.launchYear != null ? cfg.launchYear : 2008;
    var y0 = Math.max(2005, ly);
    var span = Math.max(0, cfg.year - y0);
    st.digital.maturity = Math.min(0.94, 0.1 + span * 0.038);
  }

  function runScenario(st, cfg) {
    if (!formatAllowedInMarket(cfg.format, G.marketId || ACTIVE_MARKET, cfg.year)) {
      return {
        skip: true,
        skipReason: 'format not allowed in market/year',
      };
    }
    applyCalendar(G, cfg.year, cfg.period || 1);
    st.format = cfg.format;
    var taken = collectBrandIdentityKeysFromStationList(G.stations, st.id);
    st.brand = gb(cfg.format, st.freq, G.city, G.marketId || ACTIVE_MARKET, taken, st.callLetters);
    injectShare(st, cfg.share != null ? cfg.share : 0.072);
    st.ops.spots = FM[cfg.format] && FM[cfg.format].sp ? FM[cfg.format].sp : 14;
    st.ops.sell = 0.86;
    st.ops.promo = promoBudgetCapForPeriod(G);
    st.ops.progBudget = progBudgetCapForPeriod(G);
    applyTalentTier(st, cfg.format, cfg.talent || 'average');
    resetStreamDigital(st, !!cfg.digitalOn, cfg.launchYear);
    setDigitalMaturityBaseline(st, cfg);
    if (cfg.volatilitySeed != null) {
      ensureStationDigitalState(st);
      st.digital.volatilitySeed = cfg.volatilitySeed | 0;
      st.digital.breakoutCooldown = 0;
    }
    G.stations.forEach(function (x) {
      if (x && !x._bpSlotDeferred && !x.isPublic) calcRev(x, G);
    });
    seedRev(G.stations, G);
    var terrMult = stationDigitalTerrestrialDrag(st, G);
    var digStr = stationDigitalStrength(st, G);
    var vol = stationDigitalVolatilityMult(st, G);
    var ter = st.fin.terRev != null ? st.fin.terRev : Math.round((st.fin.rev || 0) - (st.fin.digitalRev || 0));
    var dig = st.fin.digitalRev || 0;
    var tot = st.fin.rev || 0;
    var share = tot > 0 ? dig / tot : 0;
    var ps0 = G.ps;
    var scDig = 0;
    try {
      G.ps = [st];
      var sc = scoreCalc(G);
      scDig = sc.streamScore || 0;
    } catch (e0) {
      scDig = 0;
    }
    G.ps = ps0;
    var lm = digitalListenMetrics(st);
    return {
      skip: false,
      totalRev: tot,
      terRev: ter,
      digitalRev: dig,
      digitalShare: share,
      ebitda: st.fin.ebitda || 0,
      digStrength: st.fin.digitalStrength != null ? st.fin.digitalStrength : digStr,
      terrMult: terrMult,
      terrDragLossPct: (1 - terrMult) * 100,
      volMult: vol,
      scoreDigital: scDig,
      streamAqh: lm.streamAqh,
      terrAqh: lm.terrAqh,
      digitalListenPct: lm.digitalListenPct,
    };
  }

  function safePctDelta(num, den) {
    if (!den || !isFinite(den) || den === 0) return null;
    return ((num - den) / den) * 100;
  }

  var lines = [];
  var flags = [];

  function flag(msg) {
    flags.push(msg);
  }

  ACTIVE_MARKET = typeof ACTIVE_MARKET !== 'undefined' ? ACTIVE_MARKET : 'nashville';
  G = genMarket('wsb');
  G.marketId = ACTIVE_MARKET;
  G._wlHarnessDeterministic = true;

  lines.push('Digital outcome harness — production calcRev / seedRev / Digital helpers');
  lines.push('Market: ' + ACTIVE_MARKET + ' · scenario wsb · synthetic share inject (see file header).');
  lines.push('');

  var years = [2008, 2012, 2016, 2020, 2024];
  var formatsA = ['TOP40', 'HOT_AC', 'COUNTRY', 'CLASSIC_HITS', 'NEWS_TALK', 'SPORTS_TALK', 'ALL_NEWS'];
  var W = [5, 12, 9, 8, 10, 10, 10, 9, 9, 8, 8, 8, 8, 8, 9, 9, 9];
  var listenOnByYear = {};
  var listen2024ByFmt = {};
  years.forEach(function (yy) {
    listenOnByYear[yy] = [];
  });

  /* --- Group A --- */
  lines.push('=== GROUP A: BASELINE ADOPTION EFFECT (talent=average) ===');
  lines.push(
    row(
      [
        'year',
        'format',
        'talent',
        'digital',
        'totalRev',
        'terRev',
        'digRev',
        'digShr',
        'EBITDA',
        'digStr',
        'terrM',
        'terrLoss',
        'dTot%',
        'dAvg%',
        'strmAqh',
        'terrAqh',
        'digLtn%',
      ],
      W
    )
  );
  years.forEach(function (y) {
    formatsA.forEach(function (fmt) {
      var st = pickLabStation(fmt);
      var off = runScenario(st, { year: y, format: fmt, talent: 'average', digitalOn: false });
      if (off.skip) return;
      var on = runScenario(pickLabStation(fmt), {
        year: y,
        format: fmt,
        talent: 'average',
        digitalOn: true,
        launchYear: Math.min(2008, y),
      });
      if (on.skip) return;
      var dTot = safePctDelta(on.totalRev, off.totalRev);
      if (on.digitalShare > 0.35 && y <= 2016)
        flag('digShare>' + fmtPct01(0.35) + ' in ' + y + ' ' + fmt + ' (avg digital on) [A]');
      if (on.digitalShare > 0.45 && y >= 2020)
        flag('digShare>' + fmtPct01(0.45) + ' in ' + y + ' ' + fmt + ' [A]');
      if (dTot != null && dTot > 20 && y >= 2008)
        flag('Digital on totalRev uplift >20% vs off: ' + fmt + ' ' + y + ' (' + fmtFloat(dTot, 1) + '%) [A]');
      listenOnByYear[y].push(on.digitalListenPct);
      if (y === 2024) {
        listen2024ByFmt[fmt] = {
          streamAqh: on.streamAqh,
          terrAqh: on.terrAqh,
          digitalListenPct: on.digitalListenPct,
        };
      }
      lines.push(
        row(
          [
            String(y),
            fmt,
            'avg',
            'off',
            fmt$(off.totalRev),
            fmt$(off.terRev),
            fmt$(off.digitalRev),
            fmtPct01(off.digitalShare),
            fmt$(off.ebitda),
            fmtFloat(off.digStrength, 3),
            fmtFloat(off.terrMult, 3),
            fmtFloat(off.terrDragLossPct, 1) + '%',
            '—',
            '—',
            fmt$(off.streamAqh),
            fmt$(off.terrAqh),
            fmtListen1(off.digitalListenPct),
          ],
          W
        )
      );
      lines.push(
        row(
          [
            String(y),
            fmt,
            'avg',
            'on',
            fmt$(on.totalRev),
            fmt$(on.terRev),
            fmt$(on.digitalRev),
            fmtPct01(on.digitalShare),
            fmt$(on.ebitda),
            fmtFloat(on.digStrength, 3),
            fmtFloat(on.terrMult, 3),
            fmtFloat(on.terrDragLossPct, 1) + '%',
            dTot == null ? '—' : fmtFloat(dTot, 1) + '%',
            '0.0%',
            fmt$(on.streamAqh),
            fmt$(on.terrAqh),
            fmtListen1(on.digitalListenPct),
          ],
          W
        )
      );
    });
  });
  lines.push('');

  /* --- Group B --- */
  lines.push('=== GROUP B: TALENT SENSITIVITY (Digital on, launch 2008) ===');
  lines.push(
    row(
      [
        'year',
        'format',
        'talent',
        'totalRev',
        'digRev',
        'digShr',
        'digStr',
        'scDig',
        'dVsAvg%',
        'strmAqh',
        'terrAqh',
        'digLtn%',
      ],
      [5, 12, 10, 10, 10, 9, 8, 8, 10, 9, 9, 9]
    )
  );
  var tiers = ['weak', 'average', 'strong', 'superstar'];
  var fmtB = ['TOP40', 'NEWS_TALK', 'SPORTS_TALK', 'CLASSIC_HITS'];
  var listenWeakSupDiff2024 = {};
  [2012, 2016, 2020, 2024].forEach(function (y) {
    fmtB.forEach(function (fmt) {
      var avgProbe = runScenario(pickLabStation(fmt), {
        year: y,
        format: fmt,
        talent: 'average',
        digitalOn: true,
        launchYear: 2008,
      });
      if (avgProbe.skip) return;
      var avgTot = avgProbe.totalRev;
      tiers.forEach(function (tier) {
        var st = pickLabStation(fmt);
        var r = runScenario(st, { year: y, format: fmt, talent: tier, digitalOn: true, launchYear: 2008 });
        if (r.skip) return;
        var dAvg = tier === 'average' ? 0 : safePctDelta(r.totalRev, avgTot);
        lines.push(
          row(
            [
              String(y),
              fmt,
              tier,
              fmt$(r.totalRev),
              fmt$(r.digitalRev),
              fmtPct01(r.digitalShare),
              fmtFloat(r.digStrength, 3),
              String(r.scoreDigital),
              dAvg == null ? '—' : fmtFloat(dAvg, 1) + '%',
              fmt$(r.streamAqh),
              fmt$(r.terrAqh),
              fmtListen1(r.digitalListenPct),
            ],
            [5, 12, 10, 10, 10, 9, 8, 8, 10, 9, 9, 9]
          )
        );
      });
      var w = runScenario(pickLabStation(fmt), { year: y, format: fmt, talent: 'weak', digitalOn: true, launchYear: 2008 });
      var sup = runScenario(pickLabStation(fmt), {
        year: y,
        format: fmt,
        talent: 'superstar',
        digitalOn: true,
        launchYear: 2008,
      });
      if (y === 2024 && !w.skip && !sup.skip) {
        listenWeakSupDiff2024[fmt] = (sup.digitalListenPct - w.digitalListenPct) * 100;
      }
      if (!w.skip && !sup.skip && sup.digitalRev > 0 && w.digitalRev > 0 && y >= 2016) {
        var ratio = sup.digitalRev / w.digitalRev;
        if (ratio < 1.12) flag('weak vs superstar digitalRev ratio <1.12: ' + fmt + ' ' + y + ' [B]');
      }
    });
  });
  lines.push('');

  /* --- Group C --- */
  lines.push('=== GROUP C: EARLY vs LATE MOVER (strong talent; maturity forced) ===');
  lines.push(
    row(
      [
        'year',
        'format',
        'case',
        'totalRev',
        'digRev',
        'digShr',
        'digStr',
        'liftTot%',
        'liftDig%',
        'strmAqh',
        'terrAqh',
        'digLtn%',
      ],
      [5, 12, 10, 10, 10, 9, 9, 10, 10, 9, 9, 9]
    )
  );
  [2016, 2020, 2024].forEach(function (y) {
    ['TOP40', 'NEWS_TALK', 'SPORTS_TALK', 'COUNTRY'].forEach(function (fmt) {
      var st0 = pickLabStation(fmt);
      var off = runScenario(st0, { year: y, format: fmt, talent: 'strong', digitalOn: false });
      if (off.skip) return;
      var early = runScenario(pickLabStation(fmt), {
        year: y,
        format: fmt,
        talent: 'strong',
        digitalOn: true,
        launchYear: 2008,
        maturityOverride: 0.88,
      });
      var lateY = Math.min(2018, y - 1);
      var late = runScenario(pickLabStation(fmt), {
        year: y,
        format: fmt,
        talent: 'strong',
        digitalOn: true,
        launchYear: lateY,
        maturityOverride: 0.22,
      });
      if (early.skip || late.skip) return;
      var liftE = safePctDelta(early.totalRev, off.totalRev);
      var liftL = safePctDelta(late.totalRev, off.totalRev);
      var liftDigE = safePctDelta(early.digitalRev, off.digitalRev);
      var liftDigL = safePctDelta(late.digitalRev, off.digitalRev);
      lines.push(
        row(
          [
            String(y),
            fmt,
            'off',
            fmt$(off.totalRev),
            fmt$(off.digitalRev),
            fmtPct01(off.digitalShare),
            fmtFloat(off.digStrength, 3),
            '—',
            '—',
            fmt$(off.streamAqh),
            fmt$(off.terrAqh),
            fmtListen1(off.digitalListenPct),
          ],
          [5, 12, 10, 10, 10, 9, 9, 10, 10, 9, 9, 9]
        )
      );
      lines.push(
        row(
          [
            String(y),
            fmt,
            'early08',
            fmt$(early.totalRev),
            fmt$(early.digitalRev),
            fmtPct01(early.digitalShare),
            fmtFloat(early.digStrength, 3),
            liftE == null ? '—' : fmtFloat(liftE, 1) + '%',
            liftDigE == null ? '—' : fmtFloat(liftDigE, 1) + '%',
            fmt$(early.streamAqh),
            fmt$(early.terrAqh),
            fmtListen1(early.digitalListenPct),
          ],
          [5, 12, 10, 10, 10, 9, 9, 10, 10, 9, 9, 9]
        )
      );
      lines.push(
        row(
          [
            String(y),
            fmt,
            'late18',
            fmt$(late.totalRev),
            fmt$(late.digitalRev),
            fmtPct01(late.digitalShare),
            fmtFloat(late.digStrength, 3),
            liftL == null ? '—' : fmtFloat(liftL, 1) + '%',
            liftDigL == null ? '—' : fmtFloat(liftDigL, 1) + '%',
            fmt$(late.streamAqh),
            fmt$(late.terrAqh),
            fmtListen1(late.digitalListenPct),
          ],
          [5, 12, 10, 10, 10, 9, 9, 10, 10, 9, 9, 9]
        )
      );
      if (liftDigE != null && liftDigL != null && off.digitalRev + late.digitalRev > 0) {
        var benE = (early.digitalRev || 0) - (off.digitalRev || 0);
        var benL = (late.digitalRev || 0) - (off.digitalRev || 0);
        if (benL > 0 && benE > benL * 2 && benE > 8000) {
          flag('Early mover digitalRev gain >2× late vs off: ' + fmt + ' ' + y + ' [C]');
        }
      }
    });
  });
  lines.push('');

  /* --- Group D --- */
  lines.push('=== GROUP D: WEAK STATION (weak talent, ~3.6% share) ===');
  lines.push(
    row(
      ['year', 'fmt', 'digital', 'totalRev', 'digRev', 'digShr', 'dTot%', 'strmAqh', 'terrAqh', 'digLtn%', 'note'],
      [5, 14, 8, 10, 10, 9, 8, 9, 9, 9, 16]
    )
  );
  [2016, 2020, 2024].forEach(function (y) {
    ['TOP40', 'COUNTRY', 'CLASSIC_HITS', 'NEWS_TALK'].forEach(function (fmt) {
      var off = runScenario(pickLabStation(fmt), {
        year: y,
        format: fmt,
        talent: 'weak',
        share: 0.036,
        digitalOn: false,
      });
      var on = runScenario(pickLabStation(fmt), {
        year: y,
        format: fmt,
        talent: 'weak',
        share: 0.036,
        digitalOn: true,
        launchYear: 2010,
      });
      if (off.skip || on.skip) return;
      var dTot = safePctDelta(on.totalRev, off.totalRev);
      if (dTot != null && dTot > 20) flag('Weak-station digital totalRev uplift >20%: ' + fmt + ' ' + y + ' (' + fmtFloat(dTot, 1) + '%) [D]');
      if ((fmt === 'CLASSIC_HITS' || fmt === 'COUNTRY') && dTot != null && dTot > 14) {
        flag('CLASSIC_HITS/COUNTRY weak rescue suspicious (>14% tot): ' + fmt + ' ' + y + ' [D]');
      }
      lines.push(
        row(
          [
            String(y),
            fmt,
            'off',
            fmt$(off.totalRev),
            fmt$(off.digitalRev),
            fmtPct01(off.digitalShare),
            '—',
            fmt$(off.streamAqh),
            fmt$(off.terrAqh),
            fmtListen1(off.digitalListenPct),
            'weak/lowShare',
          ],
          [5, 14, 8, 10, 10, 9, 8, 9, 9, 9, 16]
        )
      );
      lines.push(
        row(
          [
            String(y),
            fmt,
            'on',
            fmt$(on.totalRev),
            fmt$(on.digitalRev),
            fmtPct01(on.digitalShare),
            dTot == null ? '—' : fmtFloat(dTot, 1) + '%',
            fmt$(on.streamAqh),
            fmt$(on.terrAqh),
            fmtListen1(on.digitalListenPct),
            'weak/lowShare',
          ],
          [5, 14, 8, 10, 10, 9, 8, 9, 9, 9, 16]
        )
      );
    });
  });
  lines.push('');

  /* --- Group E --- */
  lines.push('=== GROUP E: 2024 STRONG — no-Digital penalty (share ~8.8%) ===');
  lines.push(
    row(
      ['format', 'digital', 'totalRev', 'digRev', 'digShr', 'penTot%', 'strmAqh', 'terrAqh', 'digLtn%'],
      [14, 8, 10, 10, 9, 10, 9, 9, 9]
    )
  );
  var y2024 = 2024;
  ['TOP40', 'NEWS_TALK', 'CLASSIC_HITS', 'SPORTS_TALK'].forEach(function (fmt) {
    var off = runScenario(pickLabStation(fmt), {
      year: y2024,
      format: fmt,
      talent: 'strong',
      share: 0.088,
      digitalOn: false,
    });
    var on = runScenario(pickLabStation(fmt), {
      year: y2024,
      format: fmt,
      talent: 'strong',
      share: 0.088,
      digitalOn: true,
      launchYear: 2008,
    });
    if (off.skip || on.skip) return;
    var pen = safePctDelta(on.totalRev, off.totalRev);
    if (pen != null && pen < 5 && fmt !== 'NEWS_TALK') {
      flag('2024 no-Digital penalty <5% vs on (strong ' + fmt + '): ' + fmtFloat(pen, 1) + '% [E]');
    }
    lines.push(
      row(
        [
          fmt,
          'off',
          fmt$(off.totalRev),
          fmt$(off.digitalRev),
          fmtPct01(off.digitalShare),
          '—',
          fmt$(off.streamAqh),
          fmt$(off.terrAqh),
          fmtListen1(off.digitalListenPct),
        ],
        [14, 8, 10, 10, 9, 10, 9, 9, 9]
      )
    );
    lines.push(
      row(
        [
          fmt,
          'on',
          fmt$(on.totalRev),
          fmt$(on.digitalRev),
          fmtPct01(on.digitalShare),
          pen == null ? '—' : fmtFloat(pen, 1) + '%',
          fmt$(on.streamAqh),
          fmt$(on.terrAqh),
          fmtListen1(on.digitalListenPct),
        ],
        [14, 8, 10, 10, 9, 10, 9, 9, 9]
      )
    );
  });
  lines.push('');

  /* --- Digital listening summary (Group A “digital on”, avg talent) --- */
  lines.push('=== DIGITAL LISTENING SHARE SUMMARY ===');
  lines.push('(Uses streamAqh / (terrAqh + streamAqh); terrAqh = sum of cohort AQH as in calcRev.)');
  lines.push(row(['year', 'avgDigListen%', 'min', 'max'], [5, 16, 12, 12]));
  var listenAvgByYear = {};
  years.forEach(function (y) {
    var arr = listenOnByYear[y];
    if (!arr.length) return;
    var sum = 0;
    var mn = arr[0];
    var mx = arr[0];
    for (var li = 0; li < arr.length; li++) {
      sum += arr[li];
      if (arr[li] < mn) mn = arr[li];
      if (arr[li] > mx) mx = arr[li];
    }
    var av = sum / arr.length;
    listenAvgByYear[y] = av;
    lines.push(row([String(y), fmtListen1(av), fmtListen1(mn), fmtListen1(mx)], [5, 16, 12, 12]));
  });
  lines.push('');

  lines.push('=== DIGITAL LISTENING BY FORMAT (2024, avg talent) ===');
  lines.push(row(['format', 'digLtn%', 'streamAqh', 'terrAqh'], [14, 12, 11, 11]));
  formatsA.forEach(function (fmt) {
    var L = listen2024ByFmt[fmt];
    if (!L) return;
    lines.push(row([fmt, fmtListen1(L.digitalListenPct), fmt$(L.streamAqh), fmt$(L.terrAqh)], [14, 12, 11, 11]));
  });
  lines.push('');

  /* Listening heuristics (append to flags) */
  var avg2024 = listenAvgByYear[2024];
  if (avg2024 != null && avg2024 < 0.08) flag('2024 avg Digital listening <8% (vs ~12% Nielsen-style benchmark) [L]');
  if (avg2024 != null && avg2024 > 0.18) flag('2024 avg Digital listening >18% [L]');
  var avg2012 = listenAvgByYear[2012];
  if (avg2012 != null && avg2012 > 0.05) flag('2012 avg Digital listening >5% (early era may be hot) [L]');
  var maxWeakSupDiff = -1;
  for (var fk in listenWeakSupDiff2024) {
    if (Object.prototype.hasOwnProperty.call(listenWeakSupDiff2024, fk)) {
      var dpp = listenWeakSupDiff2024[fk];
      if (dpp > maxWeakSupDiff) maxWeakSupDiff = dpp;
    }
  }
  if (maxWeakSupDiff >= 0 && maxWeakSupDiff < 2) {
    flag('2024 weak vs superstar Digital listen spread <2 pp (max across formats=' + fmtFloat(maxWeakSupDiff, 2) + ' pp) [L]');
  }
  var t40 = listen2024ByFmt.TOP40;
  var ch = listen2024ByFmt.CLASSIC_HITS;
  if (t40 && ch && Math.abs(t40.digitalListenPct - ch.digitalListenPct) <= 0.01) {
    flag('TOP40 vs CLASSIC_HITS Digital listen within 1 pp in 2024 [L]');
  }

  var realismLabel =
    avg2024 == null
      ? 'Unknown (no 2024 data)'
      : avg2024 < 0.08
        ? 'Below expected (~12%)'
        : avg2024 > 0.18
          ? 'Above expected'
          : 'Within expected range';
  lines.push('DIGITAL REALISM CHECK: ' + realismLabel + ' (2024 cross-format avg = ' + fmtListen1(avg2024) + ')');
  lines.push('');

  /* Optional volatility */
  lines.push('=== OPTIONAL: VOLATILITY (TOP40 2020 strong, 5 volatility seeds) ===');
  var seeds = [1010101, 2020202, 3030303, 4040404, 5050505];
  var vols = [];
  for (var si = 0; si < seeds.length; si++) {
    var st = pickLabStation('TOP40');
    var r = runScenario(st, {
      year: 2020,
      format: 'TOP40',
      talent: 'strong',
      digitalOn: true,
      launchYear: 2008,
      volatilitySeed: seeds[si],
    });
    if (!r.skip) vols.push(r.digitalRev);
  }
  if (vols.length) {
    var vmin = Math.min.apply(null, vols);
    var vmax = Math.max.apply(null, vols);
    lines.push('digitalRev min=' + vmin + ' max=' + vmax + ' spread=' + (vmax - vmin));
    if (vmin > 0 && vmax > vmin * 1.45) flag('Volatility spread >45% on digitalRev min/max (optional)');
  }

  lines.push('');
  lines.push('=== HEURISTIC FLAGS (' + flags.length + ') ===');
  if (!flags.length) lines.push('(none)');
  else for (var fi = 0; fi < flags.length; fi++) lines.push('· ' + flags[fi]);

  lines.push('');
  lines.push('=== DIGITAL LISTENING REALISM NOTE ===');
  (function printListenNote() {
    var a08 = listenAvgByYear[2008];
    var a12 = listenAvgByYear[2012];
    var a16 = listenAvgByYear[2016];
    var a20 = listenAvgByYear[2020];
    var a24 = listenAvgByYear[2024];
    var bench = '~12% of combined listening (early 2020s broadcast + digital analog)';
    lines.push(
      '· Benchmark: cross-format avg Digital listening in 2024 is ' +
        fmtListen1(a24) +
        ' vs common industry ballpark ' +
        bench +
        '.'
    );
    var riseEarly =
      a08 != null && a12 != null && a08 > 0.0001
        ? ((a12 - a08) / a08) * 100
        : null;
    var riseMid = a12 != null && a16 != null && a12 > 0.0001 ? ((a16 - a12) / a12) * 100 : null;
    var riseLate = a16 != null && a24 != null && a16 > 0.0001 ? ((a24 - a16) / a16) * 100 : null;
    lines.push(
      '· Trajectory (avg Digital on, Group A): 2008 ' +
        fmtListen1(a08) +
        ' → 2012 ' +
        fmtListen1(a12) +
        ' → 2016 ' +
        fmtListen1(a16) +
        ' → 2020 ' +
        fmtListen1(a20) +
        ' → 2024 ' +
        fmtListen1(a24) +
        '.'
    );
    if (riseEarly != null && riseLate != null) {
      lines.push(
        '  Relative step-up: 2008→2012 ' +
          fmtFloat(riseEarly, 0) +
          '% vs 2016→2024 ' +
          fmtFloat(riseLate, 0) +
          '% (higher early % = faster initial ramp).'
      );
    }
    var fmtSpread = [];
    ['TOP40', 'NEWS_TALK', 'COUNTRY', 'CLASSIC_HITS'].forEach(function (k) {
      if (listen2024ByFmt[k]) fmtSpread.push(k + ' ' + fmtListen1(listen2024ByFmt[k].digitalListenPct));
    });
    lines.push('· 2024 format spread (avg talent, digital on): ' + (fmtSpread.length ? fmtSpread.join(' · ') : '—'));
  })();

  globalThis.__wlDigitalHarnessReport = lines.join('\n');
})();
