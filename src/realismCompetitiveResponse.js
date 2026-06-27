/**
 * Realism Competitive Response — contestability + response quality POC.
 * Leader-share-triggered attacks across six lane families.
 * actionMode "adjacent_first" (Quality A): diverse attacks before same-family clones.
 * Wraps Success Attracts Competition when enabled — does not modify rivalReformat <3% gate.
 */
(function realismCompetitiveResponse(global) {
  'use strict';

  const ALL_FAMILIES = ['Spanish', 'News/Talk', 'Sports Talk', 'CHR', 'Country', 'Rock'];

  const SPOKEN = ['NEWS_TALK', 'CONSERVATIVE_TALK', 'SPORTS_TALK', 'ALL_NEWS', 'PERSONALITY_TALK'];

  const ROCK_FMTS = [
    'CLASSIC_ROCK', 'ALBUM_ROCK', 'ALT_ROCK', 'AAA', 'ACTIVE_ROCK', 'CLASSIC_HITS', 'ADULT_HITS', 'OLDIES',
  ];

  const CHR_FMTS = ['TOP40', 'CHR', 'RHYTHMIC', 'HOT_AC'];

  const FAMILY_LAUNCH_FMT = {
    Spanish: 'SPANISH',
    'News/Talk': 'NEWS_TALK',
    'Sports Talk': 'SPORTS_TALK',
    CHR: 'TOP40',
    Country: 'COUNTRY',
    Rock: 'CLASSIC_ROCK',
  };

  const CHALLENGER_ADJACENT = {
    Spanish: ['URBAN_CONTEMP', 'RHYTHMIC', 'ADULT_CONTEMP', 'OLDIES', 'BROKERED_PROGRAMMING'],
    'News/Talk': ['CONSERVATIVE_TALK', 'PERSONALITY_TALK', 'ALL_NEWS', 'SPORTS_TALK', 'ADULT_CONTEMP', 'BROKERED_PROGRAMMING'],
    'Sports Talk': ['NEWS_TALK', 'PERSONALITY_TALK', 'ALL_NEWS', 'BROKERED_PROGRAMMING'],
    CHR: ['HOT_AC', 'ADULT_CONTEMP', 'RHYTHMIC', 'URBAN_CONTEMP'],
    Country: ['ADULT_CONTEMP', 'OLDIES', 'CLASSIC_HITS', 'ADULT_HITS', 'HOT_AC', 'MOR'],
    Rock: ['ADULT_CONTEMP', 'AAA', 'ALT_ROCK', 'CLASSIC_HITS', 'ADULT_HITS', 'HOT_AC'],
  };

  function crConfig() {
    return global.__REALISM_COMPETITIVE_RESPONSE_V1__ || {};
  }

  function crEnabled() {
    if (global.__WL_REALISM_COMPETITIVE_RESPONSE_POC === false) return false;
    const cfg = crConfig();
    return cfg.enabled !== false && typeof cfg.leaderShareThreshold === 'number';
  }

  function cfgNum(key, fallback) {
    const cfg = crConfig();
    const v = cfg[key];
    return typeof v === 'number' ? v : fallback;
  }

  function cfgStr(key, fallback) {
    const cfg = crConfig();
    const v = cfg[key];
    return typeof v === 'string' ? v : fallback;
  }

  function actionMode() {
    return cfgStr('actionMode', 'clone_first');
  }

  function sameFamilyFallbackProb() {
    return cfgNum('sameFamilyFallbackProb', 0.35);
  }

  function isComm(s) {
    return (
      s
      && !s._bpSlotDeferred
      && typeof stationIsNoncommercialInstitutional === 'function'
      && !stationIsNoncommercialInstitutional(s)
      && s.rat
    );
  }

  function laneFamily(fmt) {
    const k = String(fmt || '').trim().toUpperCase();
    if (typeof spanishCompositionIsSpanishLaneFmt === 'function' && spanishCompositionIsSpanishLaneFmt(k)) {
      return 'Spanish';
    }
    if (k === 'SPANISH' || k.indexOf('SPANISH_') === 0) return 'Spanish';
    if (k === 'SPORTS_TALK') return 'Sports Talk';
    if (SPOKEN.indexOf(k) >= 0) return 'News/Talk';
    if (CHR_FMTS.indexOf(k) >= 0) return 'CHR';
    if (k === 'COUNTRY' || k === 'NEW_COUNTRY') return 'Country';
    if (ROCK_FMTS.indexOf(k) >= 0) return 'Rock';
    return null;
  }

  function familyMetrics(G, family) {
    const strongShare = cfgNum('strongShare', 0.02);
    const lane = (G.stations || []).filter((s) => isComm(s) && laneFamily(s.format) === family);
    lane.sort((a, b) => (b.rat.share || 0) - (a.rat.share || 0));
    const total = lane.reduce((a, s) => a + (Number(s.rat.share) || 0), 0);
    const lead = lane[0] || null;
    const leadSh = lead ? Number(lead.rat.share) || 0 : 0;
    return {
      nTotal: lane.length,
      nStrong: lane.filter((s) => (Number(s.rat.share) || 0) >= strongShare).length,
      laneTotal: total,
      leaderShare: leadSh,
      leaderId: lead ? lead.id : null,
      leaderCapture: total > 1e-8 ? leadSh / total : 0,
    };
  }

  function ensureCrState(G) {
    if (!G._crState) {
      G._crState = {
        families: {},
        stats: {
          clusterFlips: 0,
          midPackFlips: 0,
          challengerFlips: 0,
          signOns: 0,
          scoreBoosts: 0,
          flipAttackerShareLt3: 0,
          flipAttackerShareGe3: 0,
          adjacentFlips: 0,
          adjacentSignOns: 0,
          cloneFlips: 0,
          cloneSignOns: 0,
          adjacentFlipShareGe3: 0,
        },
      };
    }
    return G._crState;
  }

  function isHotLeader(G, family) {
    if (!crEnabled()) return false;
    return !!ensureCrState(G).families[family]?.hotLeader;
  }

  function strongDeficit(G, family) {
    const strongTarget = cfgNum('strongTarget', 3);
    const m = ensureCrState(G).families[family]?.lastMetrics || familyMetrics(G, family);
    return Math.max(0, strongTarget - (m.nStrong || 0));
  }

  function getHotLeaderFmt(G, family) {
    const m = ensureCrState(G).families[family]?.lastMetrics;
    if (m?.leaderId) {
      const st = (G.stations || []).find((s) => s.id === m.leaderId);
      if (st) return String(st.format);
    }
    const lane = (G.stations || []).filter((s) => isComm(s) && laneFamily(s.format) === family);
    lane.sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
    return lane[0] ? String(lane[0].format) : null;
  }

  function formatSaturation(G, fmt) {
    return (G.stations || []).filter((s) => isComm(s) && String(s.format) === fmt).length;
  }

  function adjacentCandidates(hotFamily, G, leaderFmt) {
    const base = [...(CHALLENGER_ADJACENT[hotFamily] || [])];
    if (leaderFmt && typeof FADJ !== 'undefined' && FADJ[leaderFmt]) {
      FADJ[leaderFmt].forEach((f) => {
        if (base.indexOf(f) < 0) base.push(f);
      });
    }
    const marketId = G.marketId || ACTIVE_MARKET;
    const year = G.year || 1970;
    return base.filter((f) => FM[f] && formatAllowedInMarket(f, marketId, year));
  }

  function pickAdjacentAttackFormat(hotFamily, G, leaderFmt) {
    let cands = adjacentCandidates(hotFamily, G, leaderFmt);
    if (!cands.length) return null;
    if (hotFamily === 'News/Talk') {
      const comm = (G.stations || []).filter(isComm).sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
      const top5Fmt = new Set(comm.slice(0, 5).map((s) => String(s.format)));
      const alt = cands.filter((f) => !top5Fmt.has(f));
      if (alt.length) cands = alt;
    }
    cands.sort((a, b) => formatSaturation(G, a) - formatSaturation(G, b));
    return cands[0];
  }

  function isAdjacentToHotFamily(hotFamily, targetFmt, leaderFmt) {
    const f = String(targetFmt || '');
    if (laneFamily(f) === hotFamily) return false;
    if ((CHALLENGER_ADJACENT[hotFamily] || []).indexOf(f) >= 0) return true;
    const lf = leaderFmt || null;
    if (lf && typeof FADJ !== 'undefined' && (FADJ[lf] || []).indexOf(f) >= 0) return true;
    return false;
  }

  function pickLaunchFormat(family, G) {
    if (family === 'News/Talk') {
      const counts = {};
      (G.stations || []).filter(isComm).forEach((s) => {
        const f = String(s.format || '');
        if (SPOKEN.indexOf(f) >= 0) counts[f] = (counts[f] || 0) + 1;
      });
      const order = ['NEWS_TALK', 'CONSERVATIVE_TALK', 'ALL_NEWS', 'PERSONALITY_TALK'];
      order.sort((a, b) => (counts[a] || 0) - (counts[b] || 0));
      for (const f of order) {
        if (formatAllowedInMarket(f, G.marketId || ACTIVE_MARKET, G.year)) return f;
      }
      return 'NEWS_TALK';
    }
    if (family === 'Spanish') {
      if (typeof spanishCompositionPickCrCloneFormat === 'function') {
        const clone = spanishCompositionPickCrCloneFormat(G);
        if (clone && FM[clone] && formatAllowedInMarket(clone, G.marketId || ACTIVE_MARKET, G.year)) return clone;
      }
      if (typeof spanishCompositionPickCrFormat === 'function') {
        const f = spanishCompositionPickCrFormat(G);
        if (f && FM[f] && formatAllowedInMarket(f, G.marketId || ACTIVE_MARKET, G.year)) return f;
      }
    }
    return FAMILY_LAUNCH_FMT[family] || null;
  }

  function recordFlipStats(stats, newFmt, hotFamily, attackerShare, adjacent) {
    if (adjacent) {
      stats.adjacentFlips++;
      if (typeof attackerShare === 'number' && attackerShare >= 0.03) stats.adjacentFlipShareGe3++;
    } else {
      stats.cloneFlips++;
    }
    if (typeof attackerShare === 'number') {
      if (attackerShare < 0.03) stats.flipAttackerShareLt3++;
      else stats.flipAttackerShareGe3++;
    }
  }

  function applyCrFlip(st, G, newFmt, reason, attackerShare, hotFamily, adjacent) {
    const oldFmt = st.format;
    const oldLbl = fmtLabel(oldFmt);
    st.format = newFmt;
    st._aiLastMajorReason = `cr:${reason}:${fmtLabel(newFmt)}`;
    st._lowSharePeriods = 0;
    if (!st.drift) st.drift = {};
    st.drift[newFmt] = DRIFT[newFmt]?.default || 40;
    Object.keys(st.mom || {}).forEach((c) => { st.mom[c] = { tgt: 0.01, cur: 0.01 }; });
    st.str = 'emerging';
    st.launchPeriod = G.turn || 0;
    st._crEntrant = true;
    const stats = ensureCrState(G).stats;
    recordFlipStats(stats, newFmt, hotFamily, attackerShare, adjacent);
    if (!G.news) G.news = [];
    G.news.unshift({
      v: 'MEDIUM',
      t: `📻 ${st.callLetters} flips ${oldLbl} → ${fmtLabel(newFmt)} — leader-share competition.`,
      y: G.year,
      p: G.period,
    });
    if (typeof applyStationFormatBrandRefresh === 'function') {
      applyStationFormatBrandRefresh(st, oldFmt, G, {
        formatMsg: `Reformatted: ${oldLbl} → ${fmtLabel(newFmt)} (competition response)`,
      });
    } else if (typeof logHistory === 'function') {
      logHistory(st, 'FORMAT', `Reformatted: ${oldLbl} → ${fmtLabel(newFmt)} (competition response)`, G);
    }
    calcRev(st, G);
  }

  function tryCrSignOn(G, family, fmtOverride, adjacent) {
    const fmt = fmtOverride || pickLaunchFormat(family, G);
    if (!fmt || !FM[fmt] || !formatAllowedInMarket(fmt, G.marketId || ACTIVE_MARKET, G.year)) return false;
    if (typeof countMegaFragmentationEligibleCommercial !== 'function') return false;
    if (countMegaFragmentationEligibleCommercial(G.stations) >= countUsableCommercialDialSlots(G.marketId || ACTIVE_MARKET)) {
      return false;
    }
    const band = family === 'Sports Talk' || (FM[fmt]?.amOnly) ? 'AM' : 'FM';
    const freq = nextUnusedCommercialFreq(G, band);
    if (!freq) return false;
    const bp = { type: band, fmt, pw: band === 'FM' ? '50kw' : '10kw', str: 'moderate' };
    const s = mkStn(bp, freq, G.year);
    s.color = CLR[(G.stations?.length || 0) % CLR.length];
    s.entryTurn = { year: G.year, period: G.period };
    s.launchPeriod = G.turn || 0;
    s._crLaunch = true;
    s._crLaneFamily = family;
    if (band === 'FM') {
      s.oq = Math.min(90, Math.round(s.oq + 4));
      Object.values(s.prog || {}).forEach((sd) => {
        if (sd && sd.quality != null) sd.quality = Math.min(93, Math.round(sd.quality + 3));
      });
      refreshStationOQ(s, G);
    }
    G.stations.push(s);
    seedNewEntry(s, G);
    calcRev(s, G);
    if (!G.news) G.news = [];
    G.news.unshift({
      v: 'MEDIUM',
      t: `📡 ${s.callLetters} signs on — ${fmtLabel(fmt)} (${band} ${freq}). Leader-share entrant (${family}).`,
      y: G.year,
      p: G.period,
    });
    if (typeof logHistory === 'function') {
      logHistory(s, 'LAUNCH', `Signed on — ${fmtLabel(fmt)} (${band} ${freq})`, G);
    }
    const stats = ensureCrState(G).stats;
    if (adjacent) stats.adjacentSignOns++;
    else {
      stats.signOns++;
      stats.cloneSignOns++;
    }
    return true;
  }

  function tryCrClusterFlip(G, family, fmtOverride, adjacent) {
    const fmt = fmtOverride || pickLaunchFormat(family, G);
    if (!fmt) return false;
    const comm = (G.stations || []).filter(isComm).sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
    for (const leader of comm) {
      if (laneFamily(leader.format) !== family) continue;
      const group = typeof getRivalPortfolioStations === 'function' ? getRivalPortfolioStations(leader, G) : [leader];
      if (group.length < 2) continue;
      const siblings = group.filter((s) => s.id !== leader.id && laneFamily(s.format) !== family);
      siblings.sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
      const pick = siblings.find((s) => {
        const sh = s.rat?.share || 0;
        const rank = comm.findIndex((x) => x.id === s.id) + 1;
        return rank >= 4 && rank <= 20 && sh <= 0.085 && sh >= 0.004;
      });
      if (!pick) continue;
      if (FM[fmt]?.amOnly && pick.sig?.type !== 'AM') continue;
      applyCrFlip(pick, G, fmt, adjacent ? 'adj-cluster' : 'cluster', pick.rat?.share || 0, family, adjacent);
      if (!adjacent) ensureCrState(G).stats.clusterFlips++;
      return true;
    }
    return false;
  }

  function tryCrMidPackFlip(G, family, fmtOverride, adjacent) {
    const fmt = fmtOverride || pickLaunchFormat(family, G);
    if (!fmt) return false;
    const comm = (G.stations || []).filter(isComm).sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
    const candidates = [];
    for (let i = 0; i < comm.length; i++) {
      const st = comm[i];
      if (laneFamily(st.format) === family) continue;
      const rank = i + 1;
      const sh = st.rat?.share || 0;
      if (rank < 4 || rank > 20) continue;
      if (sh > 0.085 || sh < 0.004) continue;
      candidates.push(st);
    }
    if (!candidates.length) return false;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (FM[fmt]?.amOnly && pick.sig?.type !== 'AM') return false;
    applyCrFlip(pick, G, fmt, adjacent ? 'adj-midpack' : 'midpack', pick.rat?.share || 0, family, adjacent);
    if (!adjacent) ensureCrState(G).stats.midPackFlips++;
    return true;
  }

  function tryCrAdjacentMidPackFlip(G, family) {
    const leaderFmt = getHotLeaderFmt(G, family);
    const fmt = pickAdjacentAttackFormat(family, G, leaderFmt);
    if (!fmt) return false;
    return tryCrMidPackFlip(G, family, fmt, true);
  }

  function tryCrAdjacentClusterFlip(G, family) {
    const leaderFmt = getHotLeaderFmt(G, family);
    const fmt = pickAdjacentAttackFormat(family, G, leaderFmt);
    if (!fmt) return false;
    return tryCrClusterFlip(G, family, fmt, true);
  }

  function tryCrAdjacentSignOn(G, family) {
    const leaderFmt = getHotLeaderFmt(G, family);
    const fmt = pickAdjacentAttackFormat(family, G, leaderFmt);
    if (!fmt) return false;
    return tryCrSignOn(G, family, fmt, true);
  }

  function runCloneFirstActions(G, family) {
    let acted = false;
    if (Math.random() < 0.42) acted = tryCrClusterFlip(G, family);
    if (!acted && Math.random() < 0.58) acted = tryCrMidPackFlip(G, family);
    if (!acted && Math.random() < 0.48) {
      const fmt = pickLaunchFormat(family, G);
      const adjacent = CHALLENGER_ADJACENT[family] || [];
      const comm = (G.stations || []).filter(isComm).sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
      const candidates = [];
      for (let i = 0; i < comm.length; i++) {
        const st = comm[i];
        const f = String(st.format || '');
        if (laneFamily(f) === family) continue;
        if (adjacent.indexOf(f) < 0) continue;
        const rank = i + 1;
        const sh = st.rat?.share || 0;
        if (rank < 4 || rank > 20 || sh > 0.085 || sh < 0.004) continue;
        candidates.push(st);
      }
      if (candidates.length && fmt) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        if (!(FM[fmt]?.amOnly && pick.sig?.type !== 'AM')) {
          applyCrFlip(pick, G, fmt, 'challenger', pick.rat?.share || 0, family, false);
          ensureCrState(G).stats.challengerFlips++;
          acted = true;
        }
      }
    }
    if (!acted && Math.random() < 0.32) acted = tryCrSignOn(G, family);
    return acted;
  }

  function tryCrPillarCloneActions(G, family) {
    if (family !== 'Spanish' || typeof spanishCompositionPickCrCloneFormat !== 'function') return false;
    const cloneFmt = spanishCompositionPickCrCloneFormat(G);
    if (!cloneFmt) return false;
    let acted = tryCrMidPackFlip(G, family, cloneFmt, false);
    if (!acted) acted = tryCrClusterFlip(G, family, cloneFmt, false);
    if (!acted) acted = tryCrSignOn(G, family, cloneFmt, false);
    return acted;
  }

  function runAdjacentFirstActions(G, family) {
    let acted = tryCrPillarCloneActions(G, family);
    if (!acted) acted = tryCrAdjacentMidPackFlip(G, family);
    if (!acted) acted = tryCrAdjacentClusterFlip(G, family);
    if (!acted) acted = tryCrAdjacentSignOn(G, family);
    if (!acted && Math.random() < sameFamilyFallbackProb()) {
      acted = tryCrClusterFlip(G, family);
      if (!acted) acted = tryCrMidPackFlip(G, family);
      if (!acted) acted = tryCrSignOn(G, family);
    }
    return acted;
  }

  function actionProb(deficit) {
    return Math.min(0.78, 0.22 + deficit * 0.16);
  }

  function crRecordBook(G) {
    if (!crEnabled() || !G || (G.year || 0) < 1986) return;
    const thresh = cfgNum('leaderShareThreshold', 0.08);
    const booksReq = cfgNum('booksRequired', 2);
    const strongTarget = cfgNum('strongTarget', 3);
    const st = ensureCrState(G);
    for (const family of ALL_FAMILIES) {
      const m = familyMetrics(G, family);
      const famSt = st.families[family] || { leaderStreak: 0, hotLeader: false };
      if (m.leaderShare >= thresh && m.nTotal > 0) {
        famSt.leaderStreak = (famSt.leaderStreak || 0) + 1;
      } else {
        famSt.leaderStreak = 0;
      }
      famSt.hotLeader = (famSt.leaderStreak || 0) >= booksReq && (m.nStrong || 0) < strongTarget;
      famSt.lastMetrics = m;
      st.families[family] = famSt;
    }
  }

  function crPostTurnActions(G) {
    if (!crEnabled() || !G || (G.year || 0) < 1986) return;
    const st = ensureCrState(G);
    const turn = G.turn || 0;
    const cooldown = cfgNum('actionCooldownTurns', 2);
    const mode = actionMode();

    for (const family of ALL_FAMILIES) {
      if (!isHotLeader(G, family)) continue;
      const deficit = strongDeficit(G, family);
      if (deficit <= 0) continue;
      const famSt = st.families[family] || {};
      if (famSt.lastActionTurn != null && turn - famSt.lastActionTurn < cooldown) continue;

      const p = actionProb(deficit);
      if (Math.random() > p) continue;

      const acted = mode === 'adjacent_first'
        ? runAdjacentFirstActions(G, family)
        : runCloneFirstActions(G, family);

      if (acted) {
        famSt.lastActionTurn = turn;
        st.families[family] = famSt;
      }
    }
  }

  function crReformatScoreMult(G, targetFmt, station) {
    if (!crEnabled() || !G) return 1;
    const mode = actionMode();
    for (const family of ALL_FAMILIES) {
      if (!isHotLeader(G, family)) continue;
      const deficit = strongDeficit(G, family);
      if (deficit <= 0) continue;
      const targetFam = laneFamily(targetFmt);
      const leaderFmt = getHotLeaderFmt(G, family);
      if (mode === 'adjacent_first') {
        if (targetFam === family) return 1;
        if (!isAdjacentToHotFamily(family, targetFmt, leaderFmt)) return 1;
      } else {
        if (targetFam !== family) continue;
        if (laneFamily(station?.format) === family) continue;
      }
      ensureCrState(G).stats.scoreBoosts++;
      return 1 + Math.min(3.0, 0.5 + deficit * 0.6);
    }
    return 1;
  }

  function wrapSacHooks() {
    if (global.__crSacWrapped) return;
    global.__crSacWrapped = true;

    const origRecord = global.successAttractsCompetitionRecordBook;
    const origPost = global.successAttractsCompetitionPostTurn;
    const origMult = global.successAttractsCompetitionReformatScoreMult;

    global.successAttractsCompetitionRecordBook = function competitiveResponseRecordBook(G) {
      if (typeof origRecord === 'function') origRecord(G);
      crRecordBook(G);
    };

    global.successAttractsCompetitionPostTurn = function competitiveResponsePostTurn(G) {
      if (typeof origPost === 'function') origPost(G);
      crPostTurnActions(G);
    };

    global.successAttractsCompetitionReformatScoreMult = function competitiveResponseReformatScoreMult(G, targetFmt, station) {
      let m = 1;
      if (typeof origMult === 'function') m *= origMult(G, targetFmt, station);
      m *= crReformatScoreMult(G, targetFmt, station);
      return m;
    };
  }

  global.realismCompetitiveResponseConfig = crConfig;
  global.realismCompetitiveResponseEnabled = crEnabled;
  global.realismCompetitiveResponseStats = function (G) {
    return G && G._crState ? G._crState.stats : null;
  };

  if (crEnabled()) wrapSacHooks();
})(typeof window !== 'undefined' ? window : globalThis);
