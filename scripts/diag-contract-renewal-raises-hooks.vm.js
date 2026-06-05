/**
 * Logs contract renewals (player doExtend + AI rival expiry renewals). Fall COLA is not logged.
 */
(function () {
  'use strict';

  function trueQ(t) {
    if (typeof talentTrueQuality === 'function') return talentTrueQuality(t);
    return t && typeof t._trueQuality === 'number' ? t._trueQuality : t?.quality || 30;
  }

  function qualityBucket(tq) {
    if (tq >= 85) return 'elite_85+';
    if (tq >= 72) return 'strong_72-84';
    if (tq >= 42) return 'mid_42-71';
    return 'entry_<42';
  }

  function profitabilityBucket(s) {
    const rev = s?.fin?.rev || 0;
    const ebitda = typeof s?.fin?.ebitda === 'number' ? s.fin.ebitda : rev - (s?.fin?.cost || 0);
    if (rev <= 0) return 'no_rev';
    const margin = ebitda / rev;
    if (margin < 0) return 'loss';
    if (margin < 0.15) return 'low_0-15pct';
    if (margin < 0.35) return 'mid_15-35pct';
    return 'high_35pct+';
  }

  function stationRankBucket(rank, nStations) {
    if (!rank || rank < 1) return 'unknown';
    if (rank <= 3) return 'top3';
    if (rank <= 5) return 'top4-5';
    if (rank <= 10) return 'rank6-10';
    if (nStations && rank > Math.max(10, Math.ceil(nStations * 0.66))) return 'bottom_third';
    return 'mid_pack';
  }

  function tenureMilestone(tenureYrs) {
    if (tenureYrs >= 19 && tenureYrs <= 21) return '20yr';
    if (tenureYrs >= 9 && tenureYrs <= 11) return '10yr';
    if (tenureYrs >= 4 && tenureYrs <= 6) return '5yr';
    return null;
  }

  function snapStationContext(s, Gopt) {
    const mktId = Gopt?.marketId || ACTIVE_MARKET || 'atlanta';
    const mkt = (typeof MARKETS !== 'undefined' && MARKETS[mktId]) || {};
    const rankTier = mkt.rankTier || 'medium';
    let bookRank = null;
    let nBook = 0;
    if (typeof rankStationsByShareCompetition === 'function') {
      const rr = rankStationsByShareCompetition(Gopt?.stations || []);
      nBook = rr.n || 0;
      bookRank = rr.rankById?.[s?.id] ?? null;
    }
    const rev = s?.fin?.rev || 0;
    const ebitda =
      typeof s?.fin?.ebitda === 'number' ? s.fin.ebitda : rev - (s?.fin?.cost || 0);
    const marginPct = rev > 0 ? Math.round((ebitda / rev) * 1000) / 10 : null;
    return {
      marketId: mktId,
      rankTier,
      bookRank,
      nBook,
      share: s?.rat?.share || 0,
      rev,
      ebitda,
      marginPct,
      profitability: profitabilityBucket(s),
      rankBucket: stationRankBucket(bookRank, nBook),
    };
  }

  globalThis.__wlLogContractRenewal = function logRenewal(kind, detail) {
    if (typeof G === 'undefined' || !G || !G._wlRenewalRaisesDiag) return;
    if (!G._wlRenewalEvents) G._wlRenewalEvents = [];
    const d = detail || {};
    const s = d.station;
    const t = d.talent;
    if (!t) return;
    const prevSal = Number(d.prevSal);
    const newSal = Number(d.newSal != null ? d.newSal : t.salary);
    if (!Number.isFinite(prevSal) || prevSal <= 0 || !Number.isFinite(newSal)) return;
    const raisePct = Math.round(((newSal / prevSal - 1) * 100) * 100) / 100;
    const hireY = t._hireYear != null ? t._hireYear : G.year;
    const tenureYrs = Math.max(0, (G.year || 1970) - hireY);
    const periodsAtStation = t.periodsAtStation | 0;
    const tq = Math.round(trueQ(t) * 10) / 10;
    const stCtx = s ? snapStationContext(s, G) : {};
    G._wlRenewalEvents.push({
      kind,
      year: G.year,
      period: G.period,
      contractYears: d.contractYears != null ? d.contractYears : t.cyr,
      prevSal,
      newSal,
      raisePct,
      tenureYrs,
      periodsAtStation,
      tenureMilestone: tenureMilestone(tenureYrs),
      trueQ: tq,
      qualityBucket: qualityBucket(tq),
      slot: d.slot || t.slot || null,
      isCoHost: !!d.isCoHost,
      isPlayerStation: !!(s && s.isPlayer),
      stationId: s?.id || null,
      call: s?.callLetters || '',
      talentId: t.id || null,
      talentName: t.name || '',
      ...stCtx,
    });
  };

  if (typeof doExtend === 'function') {
    const _origDoExtend = doExtend;
    globalThis.doExtend = function wrappedDoExtend(sid, slot, years, newSalary, talentRole, fromManageTalent) {
      const s = G?.stations?.find((st) => st.id === sid);
      const sd = s?.prog?.[slot];
      const role = talentRole === 'cohost' ? 'cohost' : 'host';
      const t =
        role === 'cohost' && typeof slotTalentB === 'function'
          ? slotTalentB(sd)
          : sd?.talent;
      const prevSal = t ? Number(t.salary) || 0 : 0;
      _origDoExtend(sid, slot, years, newSalary, talentRole, fromManageTalent);
      if (t && prevSal > 0) {
        __wlLogContractRenewal('player_extend', {
          station: s,
          slot,
          talent: t,
          prevSal,
          newSal: Number(t.salary) || newSalary,
          contractYears: years,
          isCoHost: role === 'cohost',
        });
      }
    };
  }
})();
