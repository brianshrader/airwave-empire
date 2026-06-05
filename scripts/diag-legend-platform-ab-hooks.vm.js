/**
 * Gate 2 platform A/B hooks (diagnostic only). Variants A,E,F,G,H,I,J,K.
 */
(function () {
  'use strict';

  const TALK_FMTS = new Set([
    'NEWS_TALK',
    'PERSONALITY_TALK',
    'ALL_NEWS',
    'TALK',
    'SPORTS_TALK',
  ]);
  const HITS_FMTS = new Set(['TOP40', 'CHR', 'AC', 'HOT_AC', 'URBAN', 'COUNTRY']);
  const DRIVE_SLOTS = new Set(['morningDrive', 'afternoonDrive']);

  const GEN_RATE = {
    mild: { small: 0.002, medium: 0.0035, large: 0.006, mega: 0.009 },
    strong: { small: 0.0035, medium: 0.006, large: 0.01, mega: 0.015 },
  };
  const BREAK_RATE = { mild: 0.028, strong: 0.048 };
  const BREAK_DELTA = { mild: [0.4, 0.85], strong: [0.65, 1.25] };

  globalThis.WL_LEGEND_PLATFORM = { variant: 'A' };

  function flags() {
    const v = WL_LEGEND_PLATFORM.variant || 'A';
    return {
      variant: v,
      generation: v !== 'A',
      generationStrong: v === 'E' || v === 'F' || v === 'G' || v === 'H' || v === 'I' || v === 'J' || v === 'K',
      driveBias: v === 'F' || v === 'J' || v === 'K',
      platformBias: v === 'G' || v === 'J' || v === 'K',
      retention: v === 'H' || v === 'J' || v === 'K',
      retentionModest: v === 'J',
      upwardPoach: v === 'I' || v === 'K',
      breakout: v === 'E' || v === 'J' || v === 'K',
    };
  }

  globalThis.wlLegendAbSetVariant = function wlLegendAbSetVariant(variant) {
    WL_LEGEND_PLATFORM.variant = variant || 'A';
  };

  function diag(Gref) {
    if (!Gref) return { retentionSaves: 0, renewalBoosts: 0, upwardPoaches: 0, upwardPoachOffers: 0, highQBorn: 0, highQDriveBorn: 0, highQSkippedNonDrive: 0, lastUpwardPoachTurn: -999 };
    if (!Gref._wlPlatformDiag) {
      Gref._wlPlatformDiag = {
        retentionSaves: 0,
        renewalBoosts: 0,
        upwardPoaches: 0,
        upwardPoachOffers: 0,
        highQBorn: 0,
        highQDriveBorn: 0,
        highQSkippedNonDrive: 0,
        lastUpwardPoachTurn: -999,
      };
    }
    return Gref._wlPlatformDiag;
  }

  function stationRank(s, Gref) {
    try {
      if (typeof rankStationsByShareCompetition === 'function') {
        const rr = rankStationsByShareCompetition(Gref.stations || []);
        return rr.rankById?.[s.id] ?? null;
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  }

  function slotFmtBias(slot, fmt) {
    let mult = 1;
    if (DRIVE_SLOTS.has(slot)) mult *= 2.4;
    if (TALK_FMTS.has(fmt)) mult *= 1.85;
    if (HITS_FMTS.has(fmt)) mult *= 1.35;
    return mult;
  }

  function platformRankMult(rank) {
    if (rank == null) return 1;
    if (rank <= 5) return 2.6;
    if (rank <= 10) return 1.15;
    if (rank <= 15) return 0.65;
    return 0.28;
  }

  function isHighQGoodPlatform(s, sl, t, Gref) {
    if (!t) return false;
    const tq =
      typeof talentTrueQuality === 'function' ? talentTrueQuality(t) : t._trueQuality || 0;
    if (tq < 85) return false;
    if (!DRIVE_SLOTS.has(sl)) return false;
    if ((s.rat?.share || 0) < 0.06) return false;
    const rk = stationRank(s, Gref);
    if (rk == null || rk > 5) return false;
    if ((t.morale | 0) < 52) return false;
    return true;
  }

  globalThis.wlLegendAbMkTalAdjust = function wlLegendAbMkTalAdjust(tal, slot, fmt, tier, marketId, Gref) {
    const f = flags();
    if (!f.generation || !tal) return;

    const hireSt = Gref && Gref._wlDiagHireSt ? Gref._wlDiagHireSt : null;
    const rk = hireSt ? stationRank(hireSt, Gref) : null;
    const rankTier = ((typeof MARKETS !== 'undefined' && MARKETS[marketId]) || {}).rankTier || 'medium';
    const rates = GEN_RATE[f.generationStrong ? 'strong' : 'mild'];
    const base = rates[rankTier] || rates.medium;
    let p = base * slotFmtBias(slot, fmt);
    if (f.platformBias) p *= platformRankMult(rk);

    if (f.driveBias && !DRIVE_SLOTS.has(slot)) {
      p *= 0.22;
    }

    if (Math.random() >= p) return;

    if (f.driveBias && !DRIVE_SLOTS.has(slot)) {
      diag(Gref).highQSkippedNonDrive += 1;
      return;
    }

    const hq = Math.round(85 + Math.random() * 7);
    tal._trueQuality = hq;
    tal._legendAbHighCeiling = true;
    tal.quality = Math.min(97, Math.max(tal.quality | 0, Math.round(hq + (Math.random() * 8 - 4))));
    if (hq >= 88 && tier !== 'star') {
      tal.salary = Math.min(
        Math.round(tal.salary * 1.14 / 500) * 500,
        Math.round(tal.salary * (1.04 + Math.random() * 0.08) / 500) * 500,
      );
    }
    const d = diag(Gref);
    d.highQBorn += 1;
    if (DRIVE_SLOTS.has(slot)) d.highQDriveBorn += 1;
  };

  globalThis.wlLegendAbFallBreakoutStep = function wlLegendAbFallBreakoutStep(s, sl, t, Gref) {
    const f = flags();
    if (!f.breakout || !t || !s) return;
    if ((Gref.period | 0) !== 2) return;
    const tq =
      typeof talentTrueQuality === 'function' ? talentTrueQuality(t) : t._trueQuality || t.quality | 0;
    if (tq < 70 || tq > 82 || t._legendAbHighCeiling) return;
    const tenure = Math.max(0, (Gref.year | 0) - (t._hireYear != null ? t._hireYear : Gref.year));
    if (tenure < 5 || (t.morale | 0) < 65) return;
    if ((s.rat?.share || 0) < 0.06) return;
    const rank = stationRank(s, Gref);
    if (rank == null || rank > 5) return;
    const rate = BREAK_RATE.strong * (DRIVE_SLOTS.has(sl) ? 1.35 : 1);
    if (Math.random() >= rate) return;
    const [lo, hi] = BREAK_DELTA.strong;
    const delta = lo + Math.random() * (hi - lo);
    if (typeof t._trueQuality === 'number') {
      t._trueQuality = Math.min(94, Math.round(t._trueQuality + delta));
    } else {
      t._trueQuality = Math.min(94, Math.round(tq + delta));
    }
    t.quality = Math.min(100, Math.max(t.quality | 0, Math.round(t.quality + delta * 0.45)));
    t._legendAbBreakoutSteps = (t._legendAbBreakoutSteps || 0) + 1;
  };

  globalThis.wlLegendPlatformRenewCut = function wlLegendPlatformRenewCut(s, sl, t, Gref, renewCut) {
    const f = flags();
    if (!f.retention || !isHighQGoodPlatform(s, sl, t, Gref)) return renewCut;
    diag(Gref).renewalBoosts += 1;
    return Math.min(0.97, renewCut + (f.retentionModest ? 0.1 : 0.16));
  };

  globalThis.wlLegendPlatformBlockContractExit = function wlLegendPlatformBlockContractExit(s, sl, t, Gref) {
    const f = flags();
    if (!f.retention || !isHighQGoodPlatform(s, sl, t, Gref)) return false;
    const p = f.retentionModest ? 0.5 : 0.68;
    if (Math.random() < p) {
      diag(Gref).retentionSaves += 1;
      return true;
    }
    return false;
  };

  globalThis.wlLegendPlatformUpwardPoachStep = function wlLegendPlatformUpwardPoachStep(Gref, acts) {
    const f = flags();
    if (!f.upwardPoach || !Gref) return;
    const d = diag(Gref);
    const turn = Gref.turn | 0;
    if (turn < d.lastUpwardPoachTurn + 6) return;

    const mktId = Gref.marketId || ACTIVE_MARKET || 'atlanta';
    const tier = ((typeof MARKETS !== 'undefined' && MARKETS[mktId]) || {}).rankTier || 'medium';
    const tierMult = tier === 'mega' ? 1.35 : tier === 'large' ? 1.15 : tier === 'medium' ? 0.85 : 0.55;
    if (Math.random() > 0.14 * tierMult) return;

    const candidates = [];
    (Gref.stations || []).forEach((st) => {
      if (!st || st._bpSlotDeferred || st.isPublic) return;
      const rk = stationRank(st, Gref);
      if (rk == null || rk <= 8) return;
      const share = st.rat?.share || 0;
      if (share >= 0.05) return;
      ['morningDrive', 'afternoonDrive', 'midday', 'evening'].forEach((sl) => {
        const t = st.prog?.[sl]?.talent;
        if (!t || !(t.salary > 0)) return;
        const tq =
          typeof talentTrueQuality === 'function' ? talentTrueQuality(t) : t._trueQuality || 0;
        if (tq < 85) return;
        const tenure = Math.max(0, (Gref.year | 0) - (t._hireYear != null ? t._hireYear : Gref.year));
        if (tenure < 3) return;
        candidates.push({ st, sl, t, tq, rk, share, tenure });
      });
    });
    if (!candidates.length) return;

    const buyers = [];
    (Gref.stations || []).forEach((st) => {
      if (!st || st._bpSlotDeferred || st.isPublic) return;
      const rk = stationRank(st, Gref);
      if (rk == null || rk > 5) return;
      if ((st.rat?.share || 0) < 0.06) return;
      buyers.push(st);
    });
    if (!buyers.length) return;

    candidates.sort((a, b) => b.tq - a.tq || a.rk - b.rk);
    const pick = candidates[0];
    const buyer = buyers[Math.floor(Math.random() * buyers.length)];
    const targetSl = DRIVE_SLOTS.has(pick.sl)
      ? pick.sl
      : buyer.prog?.morningDrive?.talent
        ? 'afternoonDrive'
        : 'morningDrive';
    const bsd = buyer.prog?.[targetSl];
    if (!bsd) return;

    if (buyer.isPlayer && !buyer._rivalPoachPending) {
      const newSal = Math.round(pick.t.salary * (1.32 + Math.random() * 0.28) / 500) * 500;
      buyer._rivalPoachPending = {
        rivalId: pick.st.id,
        slot: targetSl,
        offerSalary: newSal,
        talentId: pick.t.id,
        announcedY: Gref.year,
        announcedP: Gref.period,
        matched: false,
        _wlPlatformUpward: true,
      };
      d.upwardPoachOffers += 1;
      d.lastUpwardPoachTurn = turn;
      if (acts) {
        acts.push({
          v: 'HIGH',
          t: `📻 ${buyer.callLetters} eyes ${pick.t.name} at ${pick.st.callLetters} (${typeof f$ === 'function' ? f$(newSal) : newSal}/yr) — upward platform move.`,
          iy: true,
        });
      }
      return;
    }

    if (bsd.talent && (bsd.talent.quality | 0) >= (pick.t.quality | 0) + 8) return;

    const nm = pick.t.name;
    const src = pick.st;
    if (typeof wlMorningNoteSlotClear === 'function') wlMorningNoteSlotClear(src, pick.sl);
    src.prog[pick.sl].talent = null;
    src.prog[pick.sl].quality = Math.round((src.prog[pick.sl].quality || 20) * 0.72);
    const newSal = Math.round(pick.t.salary * (1.28 + Math.random() * 0.22) / 500) * 500;
    bsd.talent = { ...pick.t, salary: newSal, slot: targetSl, _hireYear: Gref.year };
    bsd.quality = Math.min(100, Math.round((bsd.quality || 30) + pick.tq * 0.35));
    d.upwardPoaches += 1;
    d.lastUpwardPoachTurn = turn;
    if (acts) {
      acts.push({
        v: 'MEDIUM',
        t: `${buyer.callLetters} pulls ${nm} up from ${src.callLetters} (${typeof f$ === 'function' ? f$(newSal) : newSal}/yr).`,
      });
    }
  };
})();
