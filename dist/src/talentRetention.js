/**
 * Talent retention — dissatisfaction vs life/career departures, satisfaction,
 * structural morale, station employer reputation, market ambition.
 * Loaded before legacy.js; uses global game symbols (G, SL, FM, MARKETS, …).
 */
(function (global) {
  'use strict';

  const PERSONALITIES = [
    'ambitious',
    'careerist',
    'local_favorite',
    'loyal',
    'family_oriented',
    'lifestyle',
  ];

  const MARKET_TIER_RANK = { small: 0, medium: 1, large: 2, mega: 3 };

  const LIFE_REASONS = [
    { id: 'relocation', line: 'family relocation' },
    { id: 'spouse_job', line: 'a spouse\'s job transfer' },
    { id: 'career_change', line: 'a career change outside radio' },
    { id: 'health', line: 'health concerns' },
    { id: 'burnout', line: 'burnout — stepping away from the air' },
    { id: 'education', line: 'an education opportunity' },
    { id: 'lifestyle', line: 'a lifestyle change' },
  ];

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function marketTierRank(marketId) {
    const t = (MARKETS[marketId || 'atlanta'] || {}).rankTier || 'medium';
    return MARKET_TIER_RANK[t] != null ? MARKET_TIER_RANK[t] : 1;
  }

  function ensureEmployerRep(s) {
    if (!s._employerRep) {
      s._employerRep = {
        stable: 52,
        winner: 48,
        innovative: 45,
        turnover: 12,
        declining: 10,
        talentFactory: 8,
        tag: 'stable_employer',
      };
    }
    return s._employerRep;
  }

  function repTagFromScores(rep) {
    if (rep.turnover >= 58) return 'high_turnover';
    if (rep.declining >= 62) return 'declining_station';
    if (rep.talentFactory >= 55 && rep.turnover >= 38) return 'talent_factory';
    if (rep.winner >= 62 && rep.stable >= 50) return 'winning_station';
    if (rep.stable >= 62 && rep.turnover < 28) return 'stable_employer';
    if (rep.innovative >= 58) return 'innovative';
    if (rep.turnover >= 42) return 'budget_operation';
    return 'stable_employer';
  }

  function personalityLabel(p) {
    const m = {
      ambitious: 'Ambitious',
      careerist: 'Careerist',
      local_favorite: 'Local favorite',
      loyal: 'Loyal',
      family_oriented: 'Family-oriented',
      lifestyle: 'Lifestyle-first',
    };
    return m[p] || '';
  }

  function ensurePersonality(t, G) {
    if (!t || t._personality) return;
    const mkt = G?.marketId || 'atlanta';
    const tier = marketTierRank(mkt);
    const roll = Math.random();
    if (tier <= 0 && roll < 0.14) t._personality = 'local_favorite';
    else if (roll < 0.1) t._personality = 'loyal';
    else if (roll < 0.2) t._personality = 'ambitious';
    else if (roll < 0.3) t._personality = 'careerist';
    else if (roll < 0.42) t._personality = 'family_oriented';
    else if (roll < 0.52) t._personality = 'lifestyle';
    else t._personality = pick(['loyal', 'local_favorite', 'ambitious']);
    if (typeof t._structMorale !== 'number') t._structMorale = Math.round(rnd(58, 78));
    if (typeof t._satisfaction !== 'number') t._satisfaction = Math.round(rnd(62, 82));
  }

  function syncMoraleFromStructural(t) {
    if (!t) return;
    const st = typeof t._structMorale === 'number' ? t._structMorale : 65;
    const shortM = typeof t.morale === 'number' ? t.morale : 65;
    let cap = st + 18;
    const Gopt = typeof G !== 'undefined' ? G : null;
    if (
      Gopt &&
      t._moraleBonusAccrualY === Gopt.year &&
      t._moraleBonusAccrualP === Gopt.period &&
      typeof t._moraleBonusLift === 'number' &&
      t._moraleBonusLift > 0
    ) {
      cap += t._moraleBonusLift;
    }
    t.morale = Math.round(clamp(Math.min(shortM, cap), 20, 100));
  }

  function stationContext(s, G) {
    const rep = ensureEmployerRep(s);
    const combinedRows =
      typeof buildCommercialCombinedRankRows === 'function'
        ? buildCommercialCombinedRankRows(G)
        : [];
    const rank =
      typeof combinedMarketRankForStation === 'function'
        ? combinedMarketRankForStation(s, combinedRows)
        : null;
    const prev = s._prevRank;
    const rankDeclined =
      rank != null && prev != null && Number.isFinite(prev) && rank > prev;
    if (rankDeclined) {
      s._rankDeclineStreak = (s._rankDeclineStreak | 0) + 1;
    } else if (rank != null && prev != null && rank <= prev) {
      s._rankDeclineStreak = Math.max(0, (s._rankDeclineStreak | 0) - 1);
    }
    const share = s.rat?.share || 0;
    const fmtNorm = FM[canonicalHitsFormatKey(s.format)]?.sp || 14;
    const bs = s.budgetStress || 0;
    const fmtAge = s._formatAge | 0;
    let coworkerCount = 0;
    let lowMoralePeers = 0;
    DAYPART_SLOTS.forEach((sl) => {
      const sd = s.prog?.[sl];
      if (!sd?.talent) return;
      coworkerCount++;
      const eff =
        typeof effectiveTalentMorale === 'function'
          ? effectiveTalentMorale(sd.talent)
          : sd.talent.morale || 50;
      if (eff < 48) lowMoralePeers++;
      const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
      if (ch) {
        coworkerCount++;
        const eff2 =
          typeof effectiveTalentMorale === 'function' ? effectiveTalentMorale(ch) : ch.morale || 50;
        if (eff2 < 48) lowMoralePeers++;
      }
    });
    return {
      rep,
      rank,
      prevRank: prev,
      rankDeclineStreak: s._rankDeclineStreak | 0,
      share,
      budgetStress: bs,
      formatUnstable: fmtAge < 6,
      formatAge: fmtAge,
      identity: s.identity || 0,
      departuresRecent: s._departuresRecent | 0,
      coworkerCount,
      lowMoralePeers,
      marketTier: marketTierRank(G.marketId),
    };
  }

  function computeSatisfaction(t, s, slot, G, ctx) {
    let sat = 58;
    const effMor =
      typeof effectiveTalentMorale === 'function' ? effectiveTalentMorale(t) : t.morale || 50;
    sat += (effMor - 50) * 0.42;
    sat += ((t._structMorale | 0) - 50) * 0.38;
    if (ctx.share >= 0.12) sat += 10;
    else if (ctx.share >= 0.08) sat += 5;
    else if (ctx.share < 0.035) sat -= 13;
    else if (ctx.share < 0.055) sat -= 7;
    if (ctx.rank != null && ctx.rank <= 3) sat += 6;
    if (ctx.rankDeclineStreak >= 2) sat -= 9 + Math.min(12, ctx.rankDeclineStreak * 2.5);
    if (ctx.formatUnstable) sat -= 10;
    if (ctx.budgetStress > 0.4) sat -= 11 * ctx.budgetStress;
    if (ctx.departuresRecent >= 2) sat -= 5 + ctx.departuresRecent;
    if (ctx.lowMoralePeers >= 2) sat -= 6;
    if ((s.identity || 0) > 40) sat += 4;
    if (ctx.rep.stable > 58) sat += 4;
    if (ctx.rep.turnover > 46) sat -= 7;
    if (ctx.rep.declining > 50) sat -= 9;
    if (t._underpaidInRole || t._slotPromotionPendingRenewal) sat -= 10;
    if (t._budgetHire) sat -= 8;
    if ((t.periodsAtStation | 0) >= 16 && effMor > 55) sat += 4;
    const p = t._personality;
    if (p === 'loyal') sat += 6;
    if (p === 'local_favorite') sat += 5;
    if (p === 'ambitious' || p === 'careerist') sat -= 3;
    if (p === 'lifestyle' && ctx.budgetStress > 0.35) sat -= 4;
    if ((t.cyr || 0) <= 0) sat -= 14;
    else if ((t.cyr || 0) <= 0.5) sat -= 5;
    if (t._failedRenewals | 0) sat -= 4 * Math.min(3, t._failedRenewals | 0);
    return clamp(Math.round(sat), 8, 98);
  }

  function updateStructuralMorale(t, s, G, ctx, sat) {
    let st = typeof t._structMorale === 'number' ? t._structMorale : 65;
    const target = sat;
    const pull = ctx.budgetStress > 0.4 || ctx.rankDeclineStreak >= 3 ? 0.06 : 0.11;
    st = st + (target - st) * pull;
    if (ctx.rankDeclineStreak >= 2) st -= 1.5 * ctx.rankDeclineStreak;
    if (ctx.formatUnstable) st -= 1.8;
    if (ctx.departuresRecent >= 1) st -= 2.2 * Math.min(4, ctx.departuresRecent);
    if (ctx.rep.declining > 52) st -= 1.6;
    if (ctx.share >= 0.1 && ctx.rank != null && ctx.rank <= 5) st += 0.8;
    t._structMorale = clamp(Math.round(st), 15, 100);
    syncMoraleFromStructural(t);
  }

  function updateStationReputation(s, G, ctx) {
    const rep = ensureEmployerRep(s);
    const ema = 0.14;
    const bump = (cur, tgt) => Math.round(cur * (1 - ema) + tgt * ema);
    rep.stable = bump(rep.stable, ctx.budgetStress < 0.35 && ctx.departuresRecent < 2 ? 62 : 42);
    rep.winner = bump(
      rep.winner,
      ctx.rank != null && ctx.rank <= 3 && ctx.share >= 0.08 ? 72 : ctx.share < 0.04 ? 32 : 48
    );
    rep.innovative = bump(rep.innovative, ctx.formatUnstable ? 58 : 44);
    rep.turnover = bump(
      rep.turnover,
      clamp(12 + ctx.departuresRecent * 14 + (s._departuresYear | 0) * 2, 8, 92)
    );
    rep.declining = bump(
      rep.declining,
      clamp(10 + ctx.rankDeclineStreak * 12 + (ctx.share < 0.04 ? 18 : 0), 5, 90)
    );
    const tenureTalent = Object.values(s.prog || {}).filter((sd) => (sd?.talent?.periodsAtStation | 0) >= 12)
      .length;
    rep.talentFactory = bump(
      rep.talentFactory,
      clamp((s._departuresYear | 0) * 8 + tenureTalent * 4, 5, 85)
    );
    rep.tag = repTagFromScores(rep);
    if (ctx.departuresRecent > 0) {
      s._departuresRecent = Math.max(0, (s._departuresRecent | 0) - 1);
    }
    if (G.period === 2) {
      s._departuresYear = Math.max(0, Math.round((s._departuresYear | 0) * 0.55));
    }
  }

  function recordDeparture(s, kind) {
    s._departuresRecent = (s._departuresRecent | 0) + 1;
    s._departuresYear = (s._departuresYear | 0) + 1;
    const rep = ensureEmployerRep(s);
    rep.turnover = clamp(rep.turnover + 8, 0, 100);
    if (kind === 'dissatisfaction') rep.declining = clamp(rep.declining + 4, 0, 100);
  }

  function applyCoworkerMoraleHit(s, G, severity) {
    const hit = severity === 'severe' ? -5 : -3;
    DAYPART_SLOTS.forEach((sl) => {
      const sd = s.prog?.[sl];
      if (!sd) return;
      [sd.talent, typeof slotTalentB === 'function' ? slotTalentB(sd) : null].forEach((tal) => {
        if (!tal) return;
        tal._structMorale = clamp((tal._structMorale | 0) + hit, 15, 100);
        syncMoraleFromStructural(tal);
      });
    });
    if (severity === 'severe' && !s._staffMoraleWarned) {
      s._staffMoraleWarned = true;
      G.news.unshift({
        v: 'MEDIUM',
        t: `Staff morale at ${s.callLetters} is deteriorating after a prominent departure.`,
        y: G.year,
        p: G.period,
        iy: true,
      });
    }
  }

  function hasExitIntent(t) {
    if (!t) return false;
    if (t._wantsExit) return true;
    if (t._lifeExitPending) return true;
    return false;
  }

  function lifeExitNews(t, s, slot, pending) {
    const nm = t.name || 'Talent';
    const sl = SL[slot] || slot;
    const call = s.callLetters || 'station';
    const reason = pending.reasonLine || 'personal reasons';
    if (pending.kind === 'bigger_market') {
      const dest = pending.destLabel || 'a larger market';
      return `📋 ${nm} at ${call} ${sl} is exploring opportunities in ${dest} — not about ratings slumps, just career ambition.`;
    }
    return `📋 ${nm} at ${call} ${sl} plans to leave (${reason}) when the current deal ends — this isn't about your programming calls.`;
  }

  function maybeRollMarketAmbition(t, s, slot, G, ctx) {
    if (!t || t._wantsExit || t._lifeExitPending || t._letExpire || (t._suspended | 0) > 0) return;
    const p = t._personality || '';
    if (p !== 'ambitious' && p !== 'careerist') return;
    if (ctx.marketTier >= 3) return;
    const qual = t.quality | 0;
    const tenure = t.periodsAtStation | 0;
    const share = ctx.share || 0;
    const rank = ctx.rank;
    const winning =
      (rank != null && rank <= 6) ||
      share >= 0.075 ||
      (qual >= 74 && tenure >= 10 && share >= 0.055);
    if (!winning) return;
    let chance = 0.004;
    if (ctx.marketTier <= 0) chance += 0.012;
    else if (ctx.marketTier === 1) chance += 0.010;
    else chance += 0.006;
    if (qual >= 78) chance += 0.014;
    else if (qual >= 68) chance += 0.007;
    if (share >= 0.11) chance += 0.010;
    else if (share >= 0.085) chance += 0.006;
    if (rank != null && rank <= 3) chance += 0.012;
    else if (rank != null && rank <= 6) chance += 0.005;
    if (tenure >= 20) chance += 0.008;
    else if (tenure >= 12) chance += 0.005;
    if (p === 'careerist') chance *= 1.4;
    if (ctx.rep.winner > 55) chance += 0.005;
    if (t._ambitionRollCooldown | 0) {
      t._ambitionRollCooldown--;
      return;
    }
    if (Math.random() > chance) return;
    const targets = Object.values(MARKETS).filter(
      (m) => MARKET_TIER_RANK[m.rankTier] > ctx.marketTier
    );
    const destLabel = targets.length ? pick(targets).label : 'a larger market';
    t._lifeExitPending = {
      kind: 'bigger_market',
      reasonId: 'bigger_market',
      reasonLine: `opportunities in ${destLabel}`,
      destLabel,
      announcedY: G.year,
      announcedP: G.period,
    };
    t._wantsExit = true;
    t._wantsExitReason = 'bigger_market';
    t._ambitionRollCooldown = 8;
    if (!t._wantsExitWarned) {
      t._wantsExitWarned = true;
      G.news.unshift({
        v: 'HIGH',
        t: lifeExitNews(t, s, slot, t._lifeExitPending),
        y: G.year,
        p: G.period,
        iy: true,
      });
    }
  }

  function maybeRollLifeExit(t, s, slot, G, ctx) {
    if (!t || t._wantsExit || t._lifeExitPending || t._letExpire || (t._suspended | 0) > 0) return;
    const p = t._personality || '';
    let chance = 0.003;
    if (p === 'family_oriented') chance += 0.012;
    if (p === 'lifestyle') chance += 0.009;
    if ((t.periodsAtStation | 0) >= 24) chance += 0.006;
    if (Math.random() > chance) return;
    const lr = pick(LIFE_REASONS);
    t._lifeExitPending = {
      kind: 'life',
      reasonId: lr.id,
      reasonLine: lr.line,
      destLabel: '',
      announcedY: G.year,
      announcedP: G.period,
    };
    t._wantsExit = true;
    t._wantsExitReason = 'life';
    if (!t._wantsExitWarned) {
      t._wantsExitWarned = true;
      G.news.unshift({
        v: 'HIGH',
        t: lifeExitNews(t, s, slot, t._lifeExitPending),
        y: G.year,
        p: G.period,
        iy: true,
      });
    }
  }

  function dissatisfactionWarning(t, s, slot, G, sat) {
    if (t._dissatisfactionWarned || t._wantsExit) return;
    if (sat > 52) return;
    t._dissatisfactionWarned = true;
    const nm = t.name || 'Talent';
    const call = s.callLetters || 'the station';
    let line = `${nm} is frustrated with the station's direction at ${call}.`;
    if (sat < 32) line = `${nm} is deeply unhappy at ${call} — renewal talks will be difficult.`;
    else if ((s._rankDeclineStreak | 0) >= 2)
      line = `${nm} is concerned about ${call}'s ratings slide and what it means for the staff.`;
    G.news.unshift({ v: 'MEDIUM', t: `📋 ${line}`, y: G.year, p: G.period, iy: true });
  }

  function maybeSetDissatisfactionExit(t, s, slot, G, ctx, sat) {
    if (t._wantsExit || t._letExpire) return;
    if (ctx.rank != null && ctx.rank <= 3 && sat >= 55 && (t._personality === 'loyal' || t._personality === 'local_favorite')) {
      return;
    }
    wlTalentTickExpiredLimp(t);
    if (t._wantsExit && !t._wantsExitWarned) {
      t._wantsExitWarned = true;
      const role = '';
      G.news.unshift({
        v: 'HIGH',
        t: wlTalentExitIntentNewsLine(t, s, slot, role),
        y: G.year,
        p: G.period,
        iy: true,
      });
      return;
    }
    dissatisfactionWarning(t, s, slot, G, sat);
    if (sat >= 40) return;
    let sc = (40 - sat) / 40;
    if (ctx.rep.turnover > 48) sc += 0.09;
    if (ctx.rep.declining > 52) sc += 0.07;
    if (ctx.rankDeclineStreak >= 2) sc += 0.12;
    if ((t._structMorale | 0) < 45) sc += 0.08;
    if (ctx.share < 0.04) sc += 0.07;
    if (ctx.formatUnstable) sc += 0.05;
    if (t._personality === 'loyal' || t._personality === 'local_favorite') sc *= 0.7;
    if (ctx.rank != null && ctx.rank <= 3 && sat >= 38) sc *= 0.5;
    if (Math.random() > sc * 0.26) return;
    t._wantsExit = true;
    t._wantsExitReason = sat < 28 ? 'unhappy' : wlTalentPickExitReason(t, s, G);
    if (!t._wantsExitWarned) {
      t._wantsExitWarned = true;
      G.news.unshift({
        v: 'HIGH',
        t: `${t.name} intends to leave ${s.callLetters} ${SL[slot]} — they do not want a new contract here.`,
        y: G.year,
        p: G.period,
        iy: true,
      });
    }
  }

  function removeTalent(G, s, slot, sd, t, isCoHost, newsText, kind, severe) {
    const nm = t.name || 'Talent';
    if (isCoHost) {
      clearCoHostPairingState(sd);
      setSlotTalentB(sd, null);
      refreshStationOQ(s, G);
    } else if (typeof clearPrimaryHostPreservingCoHost === 'function') {
      clearPrimaryHostPreservingCoHost(sd, slot, s, G);
    } else {
      sd.talent = null;
      if (typeof clearPairingChemistryOnly === 'function') clearPairingChemistryOnly(sd);
      refreshStationOQ(s, G);
    }
    recordDeparture(s, kind);
    if (severe) applyCoworkerMoraleHit(s, G, 'severe');
    else if (kind === 'dissatisfaction') applyCoworkerMoraleHit(s, G, 'mild');
    G.news.unshift({ v: 'HIGH', t: newsText, y: G.year, p: G.period, iy: true });
  }

  function maybeDepart(t, s, slot, sd, G, isCoHost) {
    if (!t || t._letExpire) return false;
    if (t._wantsExit || t._lifeExitPending) {
      const cyr = t.cyr || 0;
      const mor = t.morale | 0;
      const life = !!t._lifeExitPending;
      const earlyWalk = !life && cyr > 0 && mor < 28 && Math.random() < 0.08;
      if (!earlyWalk && cyr > 0) return false;
      const role = isCoHost ? ' (co-host)' : '';
      let text;
      if (life && t._lifeExitPending) {
        const r = t._lifeExitPending.reasonLine || 'personal reasons';
        text = earlyWalk
          ? `${nm(t)}${role} leaves ${s.callLetters} ${SL[slot]} early — ${r}.`
          : `${nm(t)}${role} leaves ${s.callLetters} ${SL[slot]} — ${r} (not a programming dispute).`;
      } else {
        text = earlyWalk
          ? `${nm(t)}${role} walks away from ${s.callLetters} ${SL[slot]} — refused to re-sign.`
          : `${nm(t)}${role} leaves ${s.callLetters} ${SL[slot]} — declined a new contract.`;
      }
      removeTalent(
        G,
        s,
        slot,
        sd,
        t,
        isCoHost,
        text,
        life ? 'life' : 'dissatisfaction',
        (t._satisfaction | 0) < 30
      );
      return true;
    }
    return false;
  }

  function nm(t) {
    return t.name || 'Talent';
  }

  function processChair(G, s, slot, sd, t, isCoHost) {
    if (!t || !s || !G) return false;
    ensurePersonality(t, G);
    const ctx = stationContext(s, G);
    const sat = computeSatisfaction(t, s, slot, G, ctx);
    t._satisfaction = sat;
    updateStructuralMorale(t, s, G, ctx, sat);
    maybeRollMarketAmbition(t, s, slot, G, ctx);
    maybeRollLifeExit(t, s, slot, G, ctx);
    maybeSetDissatisfactionExit(t, s, slot, G, ctx, sat);
    return maybeDepart(t, s, slot, sd, G, isCoHost);
  }

  function stationPulseNews(G, s, ctx) {
    if (s._retentionPulseWarned) return;
    const unhappy = [];
    DAYPART_SLOTS.forEach((sl) => {
      const sd = s.prog?.[sl];
      if (!sd?.talent) return;
      if ((sd.talent._satisfaction | 0) < 38) unhappy.push(sd.talent.name);
      const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
      if (ch && (ch._satisfaction | 0) < 38) unhappy.push(ch.name);
    });
    if (unhappy.length >= 2) {
      s._retentionPulseWarned = true;
      G.news.unshift({
        v: 'MEDIUM',
        t: `Several employees at ${s.callLetters} are concerned about the station's future.`,
        y: G.year,
        p: G.period,
      });
      return;
    }
    if (ctx.rankDeclineStreak >= 3 && !s._ratingsMoraleWarned) {
      s._ratingsMoraleWarned = true;
      G.news.unshift({
        v: 'MEDIUM',
        t: `Three books of ratings pressure at ${s.callLetters} — staff morale is slipping.`,
        y: G.year,
        p: G.period,
      });
    }
  }

  /** Per-period retention (legacy talentEvents calls this; letExpire / retirement stay in legacy). */
  function runPeriod(G) {
    if (!G || !G.ps) return;
    G.ps.forEach((s) => {
      if (!s.isPlayer || s.isPublic) return;
      const ctx = stationContext(s, G);
      updateStationReputation(s, G, ctx);
      stationPulseNews(G, s, ctx);
      Object.entries(s.prog || {}).forEach(([slot, sd]) => {
        if (!sd?.talent) return;
        const b0 = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
        if (b0 && !b0._letExpire && processChair(G, s, slot, sd, b0, true)) return;
        const t = sd.talent;
        if (!t || t._letExpire) return;
        processChair(G, s, slot, sd, t, false);
      });
    });
  }

  function applyDecayMorale(s, sd, sl, G) {
    const t = sd?.talent;
    if (!t || !s?.isPlayer) return;
    ensurePersonality(t, G);
    syncMoraleFromStructural(t);
    const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
    if (ch) {
      ensurePersonality(ch, G);
      syncMoraleFromStructural(ch);
    }
  }

  function applyBonus(t, boost) {
    if (!t) return;
    const st = t._structMorale | 0;
    const gap = Math.max(0, 62 - st);
    t._structMorale = clamp(Math.round(st + gap * rnd(0.22, 0.42)), 15, 100);
    t._moraleBonusLift = boost;
    t.morale = clamp(Math.round((t.morale | 0) + boost), 20, 100);
    syncMoraleFromStructural(t);
  }

  function contractModifiers(s, t, isCoHost) {
    const sat = t._satisfaction | 0;
    const refuse3yr = sat < 52 || t._wantsExit;
    const demandMult = sat < 40 ? 1.1 : sat < 50 ? 1.05 : sat > 72 ? 0.97 : 1;
    const maxYears = refuse3yr ? 2 : 3;
    return { refuse3yr, demandMult, maxYears, satisfaction: sat };
  }

  function onFormatFlip(s) {
    if (!s?.isPlayer) return;
    s._rankDeclineStreak = (s._rankDeclineStreak | 0) + 1;
    const rep = ensureEmployerRep(s);
    rep.innovative = clamp(rep.innovative + 6, 0, 100);
    rep.stable = clamp(rep.stable - 4, 0, 100);
  }

  function contractUiExtras(t, s, slot) {
    const Gopt = typeof G !== 'undefined' ? G : null;
    if (Gopt) ensurePersonality(t, Gopt);
    let sat =
      typeof t._satisfaction === 'number' && !Number.isNaN(t._satisfaction) ? Math.round(t._satisfaction) : null;
    let st =
      typeof t._structMorale === 'number' && !Number.isNaN(t._structMorale) ? Math.round(t._structMorale) : null;
    if (Gopt && slot && sat == null) {
      const ctx = stationContext(s, Gopt);
      sat = computeSatisfaction(t, s, slot, Gopt, ctx);
    }
    if (st == null) st = typeof t._structMorale === 'number' ? Math.round(t._structMorale) : null;
    const p = t._personality;
    const rep = s?._employerRep;
    let html = '';
    const showWarn = (sat != null && sat < 55) || t._wantsExit || t._lifeExitPending;
    if (showWarn) {
      const satLabel = sat != null ? `${sat}/100` : 'pending';
      const stLabel = st != null ? `${st}/100` : 'pending';
      html += `<div class="ibox" style="margin-bottom:12px;border-color:rgba(240,88,88,.3);font-size:14px;line-height:1.55;color:var(--off)">`;
      html += `<strong style="color:var(--red)">Unhappy at this station</strong>`;
      html += `<p style="margin:8px 0 0;font-size:13px;line-height:1.5"><strong>Satisfaction ${satLabel}</strong> — how they feel about working <em>here</em> right now (ratings, budget, turnover, contract status, station reputation). `;
      html += `<strong>Structural morale ${stLabel}</strong> — longer-term wear; drifts down when problems persist. The <strong>Morale</strong> row below is day-to-day mood (bonus-sensitive) but cannot stay high if structural morale is low.</p>`;
      if (t._lifeExitPending) {
        html += `<p style="margin:8px 0 0;font-size:13px">Planning to leave when the deal ends (${t._lifeExitPending.reasonLine || 'personal reasons'}) — not a programming dispute.</p>`;
      } else if (t._wantsExit) {
        html += `<p style="margin:8px 0 0;font-size:13px;color:var(--red)">They do not want a new contract here.</p>`;
      } else if (sat != null && sat < 40) {
        html += `<p style="margin:8px 0 0;font-size:13px">Renewals will be harder and salary demands may rise. Fix station-wide issues (book, budget stress, staff turnover) — a morale bonus helps temporarily but does not replace that.</p>`;
      } else {
        html += `<p style="margin:8px 0 0;font-size:13px">A morale bonus can lift mood for a while, but lasting improvement usually needs a stronger book, stable staffing, and manageable budget pressure.</p>`;
      }
      html += `<p style="margin:8px 0 0;font-size:12px;color:var(--mut)"><button type="button" class="abt" style="padding:2px 8px;font-size:11px;vertical-align:middle" onclick="openTalentMetricsHelp('satisfaction')">Explain satisfaction &amp; morale</button></p>`;
      html += `</div>`;
    }
    if (p) {
      html += `<p class="di" style="margin:0 0 10px;font-size:13px;color:var(--mut)">Disposition: <strong>${personalityLabel(p)}</strong>${rep?.tag ? ` · Station known as <strong>${rep.tag.replace(/_/g, ' ')}</strong>` : ''}</p>`;
    }
    return html;
  }

  function effectiveMorale(t) {
    if (!t) return 50;
    syncMoraleFromStructural(t);
    return t.morale | 0;
  }

  // ── Legacy exit-intent helpers (used across legacy.js) ──
  function wlTalentTickExpiredLimp(t) {
    if (!t) return;
    if ((t.cyr || 0) <= 0) {
      t._expiredBooks = (t._expiredBooks | 0) + 1;
      if ((t._expiredBooks | 0) >= 2 && !t._wantsExit) {
        t._wantsExit = true;
        t._wantsExitReason = 'deal_lapsed';
      }
    } else {
      t._expiredBooks = 0;
    }
  }

  function wlTalentPickExitReason(t, s, G) {
    const mor = t.morale | 0;
    if ((t.cyr || 0) <= 0 && (t._expiredBooks | 0) >= 2) return 'deal_lapsed';
    if (mor < 38) return 'unhappy';
    if (t._budgetHire || t._underpaidInRole) return 'underpaid';
    const careerStart = Math.min(t._careerStartYear || t._hireYear || G.year, t._hireYear || G.year);
    if (G.year - careerStart >= 30) return 'wind_down';
    if ((t.periodsAtStation | 0) >= 24) return 'restless';
    return 'new_chapter';
  }

  function wlTalentExitIntentNewsLine(t, s, slot, roleSuffix) {
    const sl = SL[slot] || slot;
    const call = s.callLetters || 'the station';
    const r = String(t._wantsExitReason || '');
    if (r === 'deal_lapsed') {
      return `📋 ${t.name}${roleSuffix} at ${call} ${sl} — deal lapsed with no renewal. They won't sign a new contract and plan to leave.`;
    }
    if (r === 'bigger_market' && t._lifeExitPending?.destLabel) {
      return `📋 ${t.name}${roleSuffix} at ${call} ${sl} — exploring ${t._lifeExitPending.destLabel}. Won't commit long-term here.`;
    }
    if (r === 'life' && t._lifeExitPending) {
      return lifeExitNews(t, s, slot, t._lifeExitPending);
    }
    if (r === 'unhappy') {
      return `📋 ${t.name}${roleSuffix} at ${call} ${sl} — morale is shot. They're not interested in a new deal.`;
    }
    if (r === 'underpaid') {
      return `📋 ${t.name}${roleSuffix} at ${call} ${sl} — feels underpaid and wants out. Extension offers will be declined.`;
    }
    return `📋 ${t.name}${roleSuffix} at ${call} ${sl} — wants a fresh start elsewhere. Won't take a new deal here.`;
  }

  global.wlTalentRetention = {
    ensurePersonality,
    runPeriod,
    applyDecayMorale,
    applyBonus,
    contractModifiers,
    contractUiExtras,
    onFormatFlip,
    hasExitIntent,
    effectiveMorale,
    wlTalentTickExpiredLimp,
    wlTalentPickExitReason,
    wlTalentExitIntentNewsLine,
  };

  global.wlTalentHasExitIntent = hasExitIntent;
  global.effectiveTalentMorale = effectiveMorale;
  global.wlTalentTickExpiredLimp = wlTalentTickExpiredLimp;
  global.wlTalentPickExitReason = wlTalentPickExitReason;
  global.wlTalentExitIntentNewsLine = wlTalentExitIntentNewsLine;
})(typeof window !== 'undefined' ? window : globalThis);
