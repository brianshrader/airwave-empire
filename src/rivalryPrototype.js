/**
 * Prototype: dominance-triggered in-lane rivalry (NOT production-ready).
 *
 * Enable: window.__WL_RIVALRY_PROTOTYPE = true (set in play.html on this branch).
 *
 * When a lane leader crosses 15/18/20% share, portfolio owners pick an existing
 * in-lane competitor (#2/#3 in the lane), fund it aggressively for 5 years, and
 * generate visible news. Goal: recognizable enemies and narrative — not harness metrics.
 */
(function rivalryPrototype(global) {
  'use strict';

  const ENABLED = global.__WL_RIVALRY_PROTOTYPE === true;
  if (!ENABLED) return;

  const COMMITMENT_YEARS = 5;
  const SCORE_MIN = 3.0;

  function canonFmt(fmt) {
    const f = String(fmt || '').trim().toUpperCase();
    return f === 'CHR' ? 'TOP40' : f;
  }

  function rivalryLaneId(fmt) {
    const f = canonFmt(fmt);
    if (f === 'TOP40' || f === 'RHYTHMIC') return 'lane_chr';
    if (f === 'HOT_AC' || f === 'ADULT_CONTEMP' || f === 'MOR' || f === 'BEAUTIFUL_MUSIC' || f === 'ADULT_STANDARDS') return 'lane_ac';
    if (f === 'COUNTRY') return 'lane_country';
    if (f === 'CLASSIC_ROCK') return 'lane_classic_rock';
    if (f === 'ALBUM_ROCK' || f === 'ALT_ROCK' || f === 'AAA' || f === 'ACTIVE_ROCK') return 'lane_album_rock';
    if (f === 'URBAN_CONTEMP' || f === 'SOUL_RNB') return 'lane_urban';
    if (typeof isSpanishLanguageFormat === 'function' && isSpanishLanguageFormat(f)) return 'lane_spanish';
    if (f.indexOf('SPANISH_') === 0) return 'lane_spanish';
    if (f === 'NEWS_TALK' || f === 'ALL_NEWS') return 'lane_news_talk';
    return `lane_fmt_${f}`;
  }

  function ownerInCrisis(s, G) {
    const p = s.pers;
    if (!p) return true;
    if (p.d2 < -p.pt) return true;
    const group = getRivalPortfolioStations(s, G);
    const portE = group.reduce((a, st) => a + (st.fin && st.fin.ebitda || 0), 0);
    return portE < -55000;
  }

  function marketTierMult(G) {
    const t = (MARKETS[G.marketId || ACTIVE_MARKET] || {}).rankTier || 'medium';
    if (t === 'mega') return 1.38;
    if (t === 'large') return 1.16;
    if (t === 'medium') return 1.0;
    if (t === 'small') return 0.76;
    return 1.0;
  }

  function tierMult(tier) {
    if (tier >= 0.2) return 1.45;
    if (tier >= 0.18) return 1.22;
    return 1.0;
  }

  function updateThreats(G) {
    G._domThreats = G._domThreats || {};
    const laneLeaders = {};
    (G.stations || []).forEach((st) => {
      if (!st || st._bpSlotDeferred || stationIsNoncommercialInstitutional(st)) return;
      const sh = st.rat && st.rat.share || 0;
      const lid = rivalryLaneId(st.format);
      if (!laneLeaders[lid] || sh > laneLeaders[lid].share) {
        laneLeaders[lid] = { share: sh, id: st.id, format: String(st.format), call: st.callLetters };
      }
    });
    Object.keys(laneLeaders).forEach((lid) => {
      const L = laneLeaders[lid];
      let tier = 0;
      if (L.share >= 0.2) tier = 0.2;
      else if (L.share >= 0.18) tier = 0.18;
      else if (L.share >= 0.15) tier = 0.15;
      if (tier <= 0) {
        delete G._domThreats[lid];
        return;
      }
      const prev = G._domThreats[lid];
      if (!prev || tier > prev.tier || L.share > prev.leaderShare + 0.008) {
        G._domThreats[lid] = {
          laneId: lid,
          leaderId: L.id,
          leaderCall: L.call,
          leaderShare: L.share,
          leaderFmt: L.format,
          tier,
          sinceYear: G.year || 0,
        };
      }
    });
  }

  /** In-lane challengers only — no cross-format reformats. */
  function scoreInLaneAttacker(s, G, th) {
    if (s.id === th.leaderId) return 0;
    if (ownerInCrisis(s, G)) return 0;
    if (rivalryLaneId(s.format) !== th.laneId) return 0;

    const sh = s.rat && s.rat.share || 0;
    if (sh > 0.095 || sh < 0.004) return 0;

    let score = 2.5 + th.leaderShare * 22;
    score += Math.min(3, Math.max(0, (Number(s.oq) || 0) - 36) * 0.08);
    score += Math.min(2.5, sh * 95);
    if (s.sig && s.sig.type === 'FM') score += 1.2;
    if (sh >= 0.012 && sh <= 0.06) score += 1.4;

    return score * tierMult(th.tier);
  }

  function laneMargin(s, G) {
    const myLane = rivalryLaneId(s.format);
    const mySh = s.rat && s.rat.share || 0;
    let leaderSh = 0;
    (G.stations || []).forEach((st) => {
      if (!st || st._bpSlotDeferred || stationIsNoncommercialInstitutional(st)) return;
      if (rivalryLaneId(st.format) !== myLane) return;
      const sh = st.rat && st.rat.share || 0;
      if (sh > leaderSh) leaderSh = sh;
    });
    if (leaderSh <= mySh + 0.0005) return null;
    return leaderSh - mySh;
  }

  function isSelected(s, G) {
    const pk = rivalPortfolioDebtKey(s);
    if (!pk || !G._rivalryPick || G._rivalryPick[pk] !== s.id) return false;
    return true;
  }

  function commitmentActive(s, G) {
    if (!isSelected(s, G)) return false;
    const pk = rivalPortfolioDebtKey(s);
    const until = G._rivalryPickUntil && G._rivalryPickUntil[pk];
    return until != null && (G.year || 0) < until;
  }

  function portfolioCommitActive(s, G) {
    const pk = rivalPortfolioDebtKey(s);
    if (!pk || !G._rivalryPick || !G._rivalryPick[pk]) return false;
    const st = (G.stations || []).find((x) => x.id === G._rivalryPick[pk]);
    return st ? commitmentActive(st, G) : false;
  }

  function dominantTargetForStation(s, G) {
    if (!commitmentActive(s, G)) return null;
    const lid = rivalryLaneId(s.format);
    const th = (G._domThreats || {})[lid];
    if (!th || th.leaderId === s.id) return null;
    return th;
  }

  function queueNews(G, item) {
    G._rivalryNewsQueue = G._rivalryNewsQueue || [];
    G._rivalryNewsQueue.push(item);
  }

  function refreshMap(G) {
    updateThreats(G);
    if (!Object.keys(G._domThreats || {}).length) return;

    G._rivalryPick = G._rivalryPick || {};
    G._rivalryPickScore = G._rivalryPickScore || {};
    G._rivalryPickUntil = G._rivalryPickUntil || {};
    G._rivalryPickStart = G._rivalryPickStart || {};
    G._rivalryNewsSeen = G._rivalryNewsSeen || {};

    const picks = {};
    (G.stations || []).forEach((s) => {
      if (!s || s._bpSlotDeferred || s.isPlayer || stationIsNoncommercialInstitutional(s)) return;
      let best = 0;
      let bestTh = null;
      Object.keys(G._domThreats).forEach((lid) => {
        const sc = scoreInLaneAttacker(s, G, G._domThreats[lid]);
        if (sc > best) {
          best = sc;
          bestTh = G._domThreats[lid];
        }
      });
      if (best <= 0 || !bestTh) return;
      const pk = rivalPortfolioDebtKey(s);
      if (!pk) return;
      if (!picks[pk] || best > picks[pk].score) {
        picks[pk] = { id: s.id, score: best, th: bestTh };
      }
    });

    Object.keys(picks).forEach((pk) => {
      const p = picks[pk];
      if (G._rivalryPick[pk] && G._rivalryPickUntil[pk] > (G.year || 0) && G._rivalryPickScore[pk] >= p.score - 0.5) return;
      if (p.score < SCORE_MIN) return;

      const prevId = G._rivalryPick[pk];
      G._rivalryPick[pk] = p.id;
      G._rivalryPickScore[pk] = p.score;
      if (!G._rivalryPickStart[pk] || prevId !== p.id) G._rivalryPickStart[pk] = G.year || 0;
      G._rivalryPickUntil[pk] = (G.year || 0) + COMMITMENT_YEARS;

      const st = (G.stations || []).find((x) => x.id === p.id);
      if (!st) return;
      st._rivalryChallenger = true;
      st._chStratPick = true;
      st._challengerGraceUntil = (G.year || 0) + COMMITMENT_YEARS;
      st._challengerDomShare = p.th.leaderShare;

      const newsKey = `${pk}:${p.id}:${p.th.leaderId}`;
      if (!G._rivalryNewsSeen[newsKey]) {
        G._rivalryNewsSeen[newsKey] = true;
        queueNews(G, {
          v: 'HIGH',
          iy: true,
          t: `🎯 ${st.callLetters} is gunning for ${p.th.leaderCall} — cluster backing a ${COMMITMENT_YEARS}-year push in the lane (${Math.round(p.th.leaderShare * 100)}% king).`,
        });
      }
    });
  }

  function drainNewsQueue(G, acts) {
    const q = G._rivalryNewsQueue;
    if (!q || !q.length || !acts) return;
    while (q.length) acts.push(q.shift());
  }

  function adjustAiBeh(s, G, beh) {
    const out = {
      role: beh.role,
      spendMult: beh.spendMult,
      hireMult: beh.hireMult,
      skipPoach: beh.skipPoach,
      distress: beh.distress,
      portE: beh.portE,
      _aiState: beh._aiState,
    };
    if (commitmentActive(s, G)) {
      if (beh.role === 'hopeless') out.role = 'weak_turn';
      out.spendMult = Math.min(1.55, (beh.spendMult || 1) * 1.55);
      out.hireMult = Math.min(1.65, (beh.hireMult || 1) * 1.58);
      out.skipPoach = false;
      const margin = laneMargin(s, G);
      if (margin != null && margin <= 0.05) {
        out.spendMult = Math.min(1.65, out.spendMult * 1.22);
        out.hireMult = Math.min(1.72, out.hireMult * 1.18);
      }
    }
    if (portfolioCommitActive(s, G) && beh.role === 'anchor' && (s.rat && s.rat.share || 0) >= 0.042) {
      out.spendMult = Math.min(out.spendMult || beh.spendMult || 1, 0.78);
      out.hireMult = Math.min(out.hireMult || beh.hireMult || 1, 0.85);
    }
    return out;
  }

  function applyPromoBoost(s, G, promoCap, crisis) {
    if (crisis || !commitmentActive(s, G)) return;
    if (!s.ops) s.ops = {};
    const tier = marketTierMult(G);
    s.ops.promo = Math.min(promoCap, Math.round((s.ops.promo || 0) * 1.58));
    s.ops.promo = Math.min(promoCap, (s.ops.promo || 0) + Math.round(28000 * tier));
    const margin = laneMargin(s, G);
    if (margin != null && margin <= 0.03) {
      s.ops.promo = Math.min(promoCap, (s.ops.promo || 0) + Math.round(12000 * tier));
    }
  }

  function applyProgBoost(s, G, crisis) {
    if (crisis || !commitmentActive(s, G)) return;
    const tier = marketTierMult(G);
    s.progInvestment = Math.round((s.progInvestment || 0) * (2.0 * tier * 0.92));
  }

  function hireMult(s, G, crisis) {
    if (crisis || !commitmentActive(s, G)) return 1;
    const margin = laneMargin(s, G);
    if (margin != null && margin <= 0.03) return 1.75;
    return 1.62;
  }

  function poachMult(s, G) {
    return commitmentActive(s, G) ? 1.85 : 1;
  }

  /** Prefer poaching the dominant lane leader's morning show when in a rivalry push. */
  function tryPoachDominantLeader(s, G, acts) {
    const th = dominantTargetForStation(s, G);
    if (!th || !acts) return false;
    if (s._poachCooldown > 0) return false;
    const p = s.pers;
    if (!p || p.ag < 0.52) return false;

    const leader = (G.stations || []).find((st) => st.id === th.leaderId);
    if (!leader || leader._bpSlotDeferred) return false;
    const mt = leader.prog && leader.prog.morningDrive;
    const tal = mt && mt.talent;
    if (!tal || tal.quality < 58) return false;
    if (leader.isPlayer && leader._rivalPoachPending) return false;
    if (!wlTalentCanReceivePoachCourtingThisTurn(tal, G)) return false;
    if (!wlTalentMidContractPoachSeriousOfferRolls(tal)) return false;
    if (Math.random() > 0.38) return false;

    const newSal = Math.round(tal.salary * rnd(1.45, 1.92) / 500) * 500;

    if (leader.isPlayer) {
      leader._rivalPoachPending = {
        rivalId: s.id,
        slot: 'morningDrive',
        offerSalary: newSal,
        talentId: tal.id,
        announcedY: G.year,
        announcedP: G.period,
        matched: false,
      };
      wlMarkTalentPoachCourtingTurn(tal, G);
      s._poachCooldown = WL_TALENT_POACH.AI_RIVAL_POACH_COOLDOWN_PERIODS;
      acts.push({
        v: 'HIGH',
        iy: true,
        t: `⚔️ ${s.callLetters} makes a run at ${tal.name} on ${leader.callLetters} — part of the war for the lane.`,
      });
      return true;
    }

    mt.talent = null;
    mt.quality = Math.max(10, Math.round((mt.quality || 30) * 0.68));
    const inbound = { ...tal, salary: newSal, periodsAtStation: 0 };
    const rolls = wlApplyPoachedTalentArrival(s, 'morningDrive', inbound, G, { fromCall: leader.callLetters, news: false });
    s._poachCooldown = WL_TALENT_POACH.AI_RIVAL_POACH_COOLDOWN_PERIODS;
    acts.push({
      v: 'HIGH',
      iy: true,
      t: `⚔️ ${s.callLetters} poaches ${tal.name} from ${leader.callLetters} — off-air ~${rolls.bench} period${rolls.bench !== 1 ? 's' : ''}, then ramping.`,
    });
    return true;
  }

  global.rivalryPrototypeEnabled = () => true;
  global.rivalryProtoRefreshMap = refreshMap;
  global.rivalryProtoDrainNewsQueue = drainNewsQueue;
  global.rivalryProtoAdjustAiBeh = adjustAiBeh;
  global.rivalryProtoApplyPromoBoost = applyPromoBoost;
  global.rivalryProtoApplyProgBoost = applyProgBoost;
  global.rivalryProtoHireMult = hireMult;
  global.rivalryProtoPoachMult = poachMult;
  global.rivalryProtoTryPoachDominantLeader = tryPoachDominantLeader;
  global.rivalryProtoCommitmentActive = commitmentActive;

  console.info('[rivalry prototype] In-lane dominance rivalry ENABLED — playtest branch, not balanced.');

  function showBanner() {
    if (!global.document || !global.document.body) return;
    if (global.document.getElementById('wl-rivalry-prototype-banner')) return;
    const b = global.document.createElement('div');
    b.id = 'wl-rivalry-prototype-banner';
    b.textContent = 'RIVALRY PROTOTYPE — in-lane challengers vs dominant stations (playtest branch)';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:6px 12px;text-align:center;font:600 12px/1.3 system-ui,sans-serif;background:#7c2d12;color:#fff;border-bottom:2px solid #f97316;pointer-events:none;';
    global.document.body.prepend(b);
  }

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
}(typeof window !== 'undefined' ? window : globalThis));
