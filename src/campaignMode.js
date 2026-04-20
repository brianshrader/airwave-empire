/**
 * GM Career Campaign — lightweight progression on top of GM Mode (gmMode.js).
 * Does not alter economy/ratings formulas; only scenario/gmConfig overlays + career metadata.
 */
(function (global) {
  'use strict';

  var CAMPAIGN_STATE_KEY = 'wl_campaign_v1';

  /** @type {object|null} */
  var state = null;

  /** Last assignment-end payload from afterRenderAll — for headless diagnostics (consumed by getLastAssignmentEndPayload). */
  var _diagLastAssignmentEndPayload = null;

  /** First assignment market — used for generated employer name at career start. */
  var CAREER_ENTRY_MARKET_ID = 'wichita';

  /**
   * Design: full ladder arc is meant to be playable in roughly this many completed assignments
   * (not a hard engine cap — documentation / expectations). Validator default profile matches.
   */
  var CAMPAIGN_FULL_ARC_ASSIGNMENTS = 9;
  /** Optional shorter arc label for tooling (e.g. headless --profile=short); not a separate game mode. */
  var CAMPAIGN_SHORT_ARC_ASSIGNMENTS = 6;

  /**
   * Ladder tuning (campaign layer only): early tiers more forgiving / upwardly mobile; high tiers tougher.
   * T1: wide survival–success band → real lateral lane (not pure promote/demote).
   * Promotions (T1+): each step includes a one-time corporate purse + at least one formal review of “turnaround patience”
   * so a trusted GM is not dropped into gm_under with no cash runway (see corporateCashGrant / evaluationGraceReviews).
   * T4: softer margin + lower survival bar + modest promotion bar — elite pressure without firing cliff.
   * T5: slightly softer than pre-pass (see git history) so flagship wins are possible but uncommon; batch still shows laterals + occasional demotions.
   */
  var LADDER = [
    {
      id: 'c0_wichita',
      tier: 0,
      marketId: 'wichita',
      scenarioId: 'gm_under',
      ownerArchetype: 'turnaround',
      title: 'GM — Small-market starter',
      contractLengthPeriods: 12,
      successThreshold: 53,
      survivalThreshold: 38,
      failureThreshold: 31,
      /** Scenario cash × mult + grant: starter runway so Tier 0 can reach assignment-end reviews (still far leaner than T1+ packages). */
      cashMult: 1.15,
      corporateCashGrant: 420000,
      corporateCommitmentNote:
        'Corporate front-loaded working capital for your first chair — enough to survive a bad opening book in a small market, not a major-market war chest.',
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 84 },
      /** AM dial; merged onto BP idx 1 instead of default AM Top 40 — variety for GM career only. */
      starterPlayerBpPatch: { type: 'AM', fmt: 'COUNTRY', pw: 'DA', str: 'moderate' },
      flavor:
        'Your first real GM chair: a modest Plains market with real P&L and real competition — lower stakes than a major, but not a sandbox.',
    },
    {
      id: 'c1_nashville',
      tier: 1,
      marketId: 'nashville',
      scenarioId: 'gm_under',
      ownerArchetype: 'turnaround',
      title: 'GM — Regional turnaround',
      contractLengthPeriods: 14,
      successThreshold: 56,
      survivalThreshold: 40,
      failureThreshold: 33,
      /** Promotion tier: scenario cash + grant + modest mult — corporate backs a proven GM with real runway. */
      cashMult: 0.95,
      corporateCashGrant: 100000,
      evaluationGraceReviews: 1,
      corporateCommitmentNote:
        'Corporate approved a one-time rebuild purse for this posting — you were promoted because they trust you, not to starve the cluster of cash on day one.',
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 82 },
      flavor:
        'Ownership needs a steady hand in a medium-sized southern market. They funded bridge capital so you can run lean and still have room to fix what is broken.',
    },
    {
      id: 'c2_atlanta',
      tier: 2,
      marketId: 'atlanta',
      scenarioId: 'gm_under',
      ownerArchetype: 'turnaround',
      title: 'GM — Large market rebuild',
      contractLengthPeriods: 14,
      successThreshold: 54,
      survivalThreshold: 44,
      failureThreshold: 32,
      cashMult: 1.0,
      corporateCashGrant: 200000,
      evaluationGraceReviews: 1,
      corporateCommitmentNote:
        'Ownership backed this promotion with a one-time operating budget — large-market salvage needs more than good intentions; you get enough cash to survive early losses while you execute.',
      starterPlayerBpPatch: { type: 'AM', fmt: 'SOUL_RNB', pw: '10kw', str: 'strong' },
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 80 },
      flavor:
        'A Sunbelt major market: more revenue on the table — and more scrutiny — but corporate put money behind the seat so a turnaround is playable, not a few rounds to bankruptcy.',
    },
    {
      id: 'c3_seattle',
      tier: 3,
      marketId: 'seattle',
      scenarioId: 'gm_under',
      ownerArchetype: 'prestige',
      title: 'GM — Northwest growth market',
      contractLengthPeriods: 18,
      /** Tier 3 is a step-up: promotion bar is tighter than Tier 2; survival still achievable with the turnaround package below. */
      successThreshold: 58,
      survivalThreshold: 42,
      failureThreshold: 33,
      /** Scenario starting cash only (no mult bump); corporate grant is the main one-time runway (see applyAssignmentToGame). */
      cashMult: 1.0,
      /** One-time corporate funding for rebuild / format work — GM layer only; does not change core station economy. */
      corporateCashGrant: 100000,
      /**
       * First N formal GM reviews use turnaround patience (see gmMode.js): trajectory and spend are judged more like a rebuild,
       * not like a mature cash cow. After N reviews, standard corporate discipline applies.
       */
      evaluationGraceReviews: 1,
      /** Short line for in-game campaign UI (gmMode campaign callout). */
      corporateCommitmentNote:
        'Corporate approved a limited rebuild budget for this assignment. Your first formal review emphasizes measurable progress over instant profit — after that, expectations match a normal major-market GM scorecard.',
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 78, minFranchiseAvg: 0.5 },
      starterPlayerBpPatch: { type: 'AM', fmt: 'NEWS_TALK', pw: '50kw', str: 'emerging' },
      flavor:
        'A competitive major market where brand and ratings momentum matter as much as margin. Corporate funded modest runway — enough to maneuver, not a comfort cushion — and one early review cycle where they judge direction before holding you to steady-state standards.',
    },
    {
      id: 'c4_chicago',
      tier: 4,
      marketId: 'chicago',
      scenarioId: 'gm_under',
      ownerArchetype: 'cash_first',
      title: 'GM — Major market operator',
      contractLengthPeriods: 22,
      successThreshold: 55,
      survivalThreshold: 40,
      failureThreshold: 35,
      cashMult: 1.05,
      corporateCashGrant: 110000,
      evaluationGraceReviews: 1,
      corporateCommitmentNote:
        'Promotion to a major-market chair included limited bridge funding — corporate expects discipline, but they will not pretend an underfunded GM can fix a broken cluster overnight.',
      starterPlayerBpPatch: { type: 'AM', fmt: 'NEWS_TALK', pw: '50kw', str: 'emerging' },
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 79, minMarginPct: 8 },
      flavor:
        'Big payroll, big expectations — cash discipline matters as much as ratings — with enough corporate runway that the opening quarters reward direction, not only the bottom line.',
    },
    {
      id: 'c5_top',
      tier: 5,
      marketId: 'newyork',
      scenarioId: 'gm_under',
      ownerArchetype: 'heritage',
      title: 'GM — Top-market spotlight',
      contractLengthPeriods: 22,
      successThreshold: 57,
      survivalThreshold: 43,
      failureThreshold: 37,
      cashMult: 1.08,
      corporateCashGrant: 125000,
      evaluationGraceReviews: 1,
      corporateCommitmentNote:
        'Even at the flagship, the group funded transition support — you are here to win, not to run out of cash before the first books settle.',
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 74, minFranchiseAvg: 0.52 },
      flavor:
        'The flagship job: maximum revenue, maximum pressure — with enough opening support that the assignment is a credible shot, not a kamikaze posting.',
    },
  ];

  function defaultState() {
    return {
      v: 1,
      active: false,
      /** Player display name (GM). */
      playerName: '',
      /** Owning company — employer; also `G.companyName` during campaign. */
      ownerCompanyName: '',
      reputation: 50,
      currentTier: 0,
      promotionCount: 0,
      firingCount: 0,
      lateralCount: 0,
      demotionCount: 0,
      completedAssignments: 0,
      highestTierCompleted: 0,
      campaignWon: false,
      history: [],
      awaitingLaunch: null,
      /** Serialized world state per market id — resume on revisit (campaign-only bookkeeping). */
      marketArchives: {},
      /** Monotonic counter each time we archive at assignment end (diagnostics / time-skip). */
      careerAssignmentTick: 0,
      /** Times we resumed from marketArchives instead of fresh genMarket (diagnostics). */
      archiveRestoreCount: 0,
      /** Last assignment-end sim clock — promotions use this so the career does not reset to 1970. */
      careerSimYear: null,
      careerSimPeriod: null,
    };
  }

  /**
   * Generates a plausible broadcast-group name for the market (employer / license holder).
   * No city prefix — keeps names like "Summit Broadcasting" instead of "Nashville Summit Broadcasting".
   */
  function generateOwnerCompanyName(marketId) {
    void marketId;
    var a = ['Heritage', 'Summit', 'Riverbend', 'Civic', 'Piedmont', 'Signal', 'Crown', 'Union'];
    var s = ['Media', 'Radio', 'Broadcasting', 'Communications'];
    var ai = Math.floor(Math.random() * a.length);
    var si = Math.floor(Math.random() * s.length);
    return a[ai] + ' ' + s[si];
  }

  function displayPlayerName(st) {
    var n = st && st.playerName ? String(st.playerName).trim() : '';
    return n || 'Manager';
  }

  function openStartModal() {
    var ownerInp = document.getElementById('campaign-start-owner');
    var playerInp = document.getElementById('campaign-start-player');
    if (ownerInp) ownerInp.value = generateOwnerCompanyName(CAREER_ENTRY_MARKET_ID);
    if (playerInp) playerInp.value = '';
    if (typeof global.om === 'function') global.om('m-campaign-start');
    setTimeout(function () {
      if (playerInp) {
        playerInp.focus();
        playerInp.select();
      }
    }, 80);
  }

  function regenerateOwnerField() {
    var ownerInp = document.getElementById('campaign-start-owner');
    if (ownerInp) ownerInp.value = generateOwnerCompanyName(CAREER_ENTRY_MARKET_ID);
  }

  function commitStart() {
    var playerInp = document.getElementById('campaign-start-player');
    var ownerInp = document.getElementById('campaign-start-owner');
    var pn = (playerInp && playerInp.value ? String(playerInp.value) : '').trim();
    var oc = (ownerInp && ownerInp.value ? String(ownerInp.value) : '').trim();
    if (!pn) pn = 'Manager';
    if (pn.length > 48) pn = pn.slice(0, 48);
    if (!oc) oc = generateOwnerCompanyName(CAREER_ENTRY_MARKET_ID);
    if (oc.length > 56) oc = oc.slice(0, 56);
    if (typeof global.cm === 'function') global.cm('m-campaign-start');
    beginCareerWithIdentity(pn, oc);
  }

  function ensureState() {
    if (!state) state = defaultState();
    return state;
  }

  function ladderRowForTier(tier) {
    var t = Math.max(0, Math.min(5, tier | 0));
    return LADDER[t] || LADDER[0];
  }

  /** Alternate NY / LA for tier-5 replays for variety */
  function resolveTier5Market(st) {
    var row = ladderRowForTier(5);
    var useLa = (st.completedAssignments & 1) === 1;
    var mid = useLa ? 'losangeles' : 'newyork';
    var out = Object.assign({}, row, { marketId: mid, id: useLa ? 'c5_la' : 'c5_ny' });
    return out;
  }

  function pickAssignmentForTier(tier, st) {
    if (tier >= 5) return resolveTier5Market(st);
    return Object.assign({}, ladderRowForTier(tier));
  }

  /**
   * @param {'promoted'|'lateral'|'demoted'|'fired'} kind
   * @param {number} tierBefore
   * @param {number} rep
   */
  function nextTierAfter(kind, tierBefore, rep) {
    var t = tierBefore;
    if (kind === 'promoted') return Math.min(5, t + 1);
    if (kind === 'lateral') return t;
    if (kind === 'demoted') return Math.max(0, t - 1);
    if (kind === 'fired') {
      if (t <= 0) return 0;
      if (t <= 1) return 1;
      if (rep < 38) return Math.max(0, t - 1);
      return t;
    }
    return t;
  }

  function careerStandingLabel(kind, repDelta) {
    if (kind === 'promoted' || repDelta >= 8) return 'rising';
    if (kind === 'fired' || repDelta <= -12) return 'damaged';
    return 'stable';
  }

  function cloneGameStateForArchive(G) {
    try {
      var o = JSON.parse(JSON.stringify(G));
      delete o._campaignAssignmentEnded;
      delete o.campaignAssignment;
      o.careerCampaign = false;
      return o;
    } catch (_e) {
      return null;
    }
  }

  /**
   * Persists a JSON snapshot of the live market so a later revisit can resume the same competitive
   * landscape instead of genMarket rerolling the world. Calendar is advanced separately (lightweight V1).
   */
  function archiveMarketAtAssignmentEnd(G, marketId) {
    if (!G || !marketId) return;
    var st = ensureState();
    var copy = cloneGameStateForArchive(G);
    if (!copy) return;
    copy.marketId = marketId;
    st.marketArchives[marketId] = {
      v: 1,
      g: copy,
      leftHistoryLen: st.history ? st.history.length : 0,
      leftYear: G.year,
      leftPeriod: G.period,
    };
    st.careerSimYear = G.year;
    st.careerSimPeriod = G.period;
    st.careerAssignmentTick = (st.careerAssignmentTick | 0) + 1;
  }

  function estimateHalfYearsAway(arch, st) {
    if (!arch || !st) return 4;
    var away = Math.max(0, (st.history ? st.history.length : 0) - (arch.leftHistoryLen | 0));
    return Math.min(48, away * 8);
  }

  /** Move sim calendar forward while the GM was on assignments elsewhere (bounded, no full off-screen sim). */
  function advanceCalendarForTimeAway(G, halfYears) {
    var h = Math.max(0, Math.floor(halfYears));
    var y = G.year;
    var p = G.period;
    for (var i = 0; i < h; i++) {
      if (p === 1) p = 2;
      else {
        p = 1;
        y++;
      }
      if (y > 2025) {
        y = 2025;
        break;
      }
    }
    G.year = y;
    G.period = p;
    if (typeof G.turn === 'number') G.turn = (y - 1970) * 2 + (p === 2 ? 1 : 0);
  }

  function rehydrateGameFromMarketArchive(arch) {
    return JSON.parse(JSON.stringify(arch.g));
  }

  /**
   * Light random drift on restored market numbers so a return is not bitwise-identical to the archive.
   * Campaign bookkeeping only — does not change identities, station count, or core sim formulas.
   * Smaller-tier assignments get a touch more oscillation; longer time away widens the band slightly.
   */
  function applyCampaignReturnStateJitter(G, assignmentTier, halfYearsAway) {
    if (!G) return;
    var tier = Math.max(0, Math.min(5, assignmentTier | 0));
    var tierScale = 1.12 - tier * 0.06;
    var away = Math.max(1, Math.min(48, halfYearsAway | 0));
    var basePct = 0.022 + Math.min(0.045, away * 0.0012);
    var pct = basePct * tierScale;

    function wobble(x) {
      if (typeof x !== 'number' || !isFinite(x)) return x;
      var m = 1 + (Math.random() * 2 - 1) * pct;
      var y = x * m;
      return Math.abs(x) < 1 && x !== 0 ? Math.round(y * 10000) / 10000 : Math.round(y);
    }

    if (typeof G.cash === 'number') G.cash = Math.max(0, wobble(G.cash));

    var stations = G.stations || [];
    for (var i = 0; i < stations.length; i++) {
      var s = stations[i];
      if (!s || s._bpSlotDeferred) continue;
      if (s.fin && typeof s.fin === 'object') {
        if (typeof s.fin.rev === 'number') s.fin.rev = Math.max(0, wobble(s.fin.rev));
        if (typeof s.fin.cost === 'number') s.fin.cost = Math.max(0, wobble(s.fin.cost));
        if (typeof s.fin.ebitda === 'number') s.fin.ebitda = wobble(s.fin.ebitda);
      }
      if (typeof s.oq === 'number') s.oq = Math.max(0, Math.min(100, Math.round(wobble(s.oq))));
      if (s.prog && typeof s.prog === 'object') {
        var slots = Object.keys(s.prog);
        for (var j = 0; j < slots.length; j++) {
          var sd = s.prog[slots[j]];
          if (sd && sd.talent && typeof sd.talent.morale === 'number') {
            sd.talent.morale = Math.max(
              0,
              Math.min(100, Math.round(wobble(sd.talent.morale)))
            );
          }
        }
      }
    }
  }

  function campaignPlayerBrokeredEconomicsActive(G) {
    var ps =
      typeof global !== 'undefined' && typeof global.myPS === 'function'
        ? global.myPS()
        : (G.ps || []).filter(function (s) {
            return s && s.isPlayer;
          });
    var fn =
      typeof global !== 'undefined' && typeof global.stationBrokeredEconomicsActive === 'function'
        ? global.stationBrokeredEconomicsActive
        : null;
    for (var i = 0; i < ps.length; i++) {
      var st = ps[i];
      if (!st) continue;
      if (fn) {
        if (fn(st, G)) return true;
      } else if (st.format === 'BROKERED_PROGRAMMING') return true;
    }
    return false;
  }

  /** FNV-1a 32-bit — deterministic mandate rolls (no runtime RNG after assignment start). */
  function campaignMandateHash32(str) {
    var h = 2166136261 >>> 0;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function campaignPlayerStationsForMandate(G) {
    if (typeof global !== 'undefined' && typeof global.myPS === 'function') return global.myPS();
    return (G.ps || []).filter(function (s) {
      return s && s.isPlayer;
    });
  }

  function campaignFindStationById(G, stationId) {
    var stations = G.stations || [];
    for (var i = 0; i < stations.length; i++) {
      if (stations[i] && stations[i].id === stationId) return stations[i];
    }
    return null;
  }

  function formatAllowedInMarketSafe(fmt, marketId, year) {
    if (typeof global !== 'undefined' && typeof global.formatAllowedInMarket === 'function') {
      return !!global.formatAllowedInMarket(fmt, marketId, year);
    }
    return false;
  }

  function formatUnlockedForYearSafe(fmt, G) {
    if (typeof global !== 'undefined' && typeof global.formatUnlockedForYear === 'function') {
      return !!global.formatUnlockedForYear(fmt, G);
    }
    return true;
  }

  function campaignMandateMinShareHint(marketId, hash) {
    var m =
      typeof global !== 'undefined' && global.MARKETS && global.MARKETS[marketId || '']
        ? global.MARKETS[marketId || '']
        : null;
    var tier = m && m.rankTier === 'small' ? 0 : m && m.rankTier === 'large' ? 2 : 1;
    var lo = tier === 0 ? 0.026 : tier === 2 ? 0.042 : 0.032;
    var hi = tier === 0 ? 0.048 : tier === 2 ? 0.072 : 0.058;
    var span = hi - lo;
    var t = (hash % 1000) / 1000;
    return Math.round((lo + span * t) * 10000) / 10000;
  }

  function campaignCreateMandateProgress() {
    return {
      everAtTargetFormat: false,
      brokeredForbiddenObserved: false,
      firstGoodClosedPeriod: null,
      bestShareWhileTarget: 0,
      lastShare: null,
      shareTrend: 'flat',
    };
  }

  /**
   * V1 corporate mandate (GM / campaign only): one optional `make_format_work` directive per assignment.
   * Roll uses assignment + world fingerprint only — deterministic.
   */
  function tryAttachCorporateMandate(G, asg) {
    if (!G || !asg || !G.campaignAssignment) return;
    var tier = asg.tier | 0;
    var rollPct = tier <= 0 ? 35 : tier <= 2 ? 50 : tier === 3 ? 66 : 68;
    var ps = campaignPlayerStationsForMandate(G);
    if (!ps.length) return;
    var sidParts = ps
      .map(function (s) {
        return String(s.id || '') + ':' + String(s.format || '');
      })
      .sort();
    var seedRoll =
      String(asg.id || '') +
      '|' +
      String(asg.marketId || '') +
      '|' +
      String(tier) +
      '|' +
      String(G.year | 0) +
      '|' +
      String(G.period | 0) +
      '|' +
      String(G.marketId || '') +
      '|' +
      sidParts.join(';');
    var hRoll = campaignMandateHash32(seedRoll + '|roll');
    if (hRoll % 100 >= rollPct) return;

    var hPick = campaignMandateHash32(seedRoll + '|pick');
    var sorted = ps.slice().sort(function (a, b) {
      var sa = a && a.rat && typeof a.rat.share === 'number' ? a.rat.share : 0;
      var sb = b && b.rat && typeof b.rat.share === 'number' ? b.rat.share : 0;
      if (sa !== sb) return sa - sb;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    var preferN = Math.max(1, Math.ceil(sorted.length * 0.58));
    var st = sorted[hPick % preferN];
    if (!st || !st.id) return;

    var curFmt = st.format || '';
    var mkt = asg.marketId || G.marketId || '';
    var y = G.year != null ? G.year | 0 : 1970;
    var FMg = typeof global !== 'undefined' && global.FM ? global.FM : null;
    var fmKeys = FMg ? Object.keys(FMg) : [];
    var candidates = [];
    for (var fi = 0; fi < fmKeys.length; fi++) {
      var f = fmKeys[fi];
      if (!f || f === curFmt) continue;
      if (!formatAllowedInMarketSafe(f, mkt, y)) continue;
      if (!formatUnlockedForYearSafe(f, G)) continue;
      var fd = FMg[f];
      if (!fd || fd.public) continue;
      candidates.push(f);
    }
    candidates.sort();
    if (!candidates.length) return;
    var targetFormat = candidates[hPick % candidates.length];
    var deadlinePeriods = 4 + ((hPick >>> 3) % 5);
    var minShare = campaignMandateMinShareHint(mkt, hPick ^ (hRoll << 1));
    var noBrokered = ((hPick >>> 7) % 3) === 0;

    G.campaignAssignment.corporateMandate = {
      type: 'make_format_work',
      stationId: st.id,
      targetFormat: targetFormat,
      minShare: minShare,
      deadlinePeriods: deadlinePeriods,
      noBrokered: noBrokered,
    };
    G.campaignAssignment.corporateMandateProgress = campaignCreateMandateProgress();
  }

  /** Each sim period after GM bookkeeping — updates mandate progress (read-only on sim). */
  function tickCorporateMandateProgress(G) {
    if (!G || !G.careerCampaign || !G.campaignAssignment) return;
    var man = G.campaignAssignment.corporateMandate;
    if (!man || man.type !== 'make_format_work') return;
    var prog = G.campaignAssignment.corporateMandateProgress;
    if (!prog) prog = G.campaignAssignment.corporateMandateProgress = campaignCreateMandateProgress();
    if (man.noBrokered && campaignPlayerBrokeredEconomicsActive(G)) prog.brokeredForbiddenObserved = true;
    var gm = G._gm;
    var closed = gm && gm.closedPeriods != null ? gm.closedPeriods | 0 : 0;
    var st = campaignFindStationById(G, man.stationId);
    if (!st) return;
    var share = st.rat && typeof st.rat.share === 'number' ? st.rat.share : 0;
    if (st.format === man.targetFormat) {
      prog.everAtTargetFormat = true;
      if (share > prog.bestShareWhileTarget) prog.bestShareWhileTarget = share;
      if (share >= man.minShare && prog.firstGoodClosedPeriod == null) prog.firstGoodClosedPeriod = closed;
    }
    if (prog.lastShare != null && typeof prog.lastShare === 'number') {
      if (share > prog.lastShare + 0.0005) prog.shareTrend = 'rising';
      else if (share < prog.lastShare - 0.0005) prog.shareTrend = 'declining';
      else prog.shareTrend = 'flat';
    } else {
      prog.shareTrend = 'flat';
    }
    prog.lastShare = share;
  }

  /**
   * Assignment-end modifier only — does not replace ladder / brokered bar logic.
   * Returns { delta, outcome, detail } for diagnostics and UI.
   */
  function evaluateCorporateMandateAtAssignmentEnd(G, asg) {
    var out = { delta: 0, outcome: null, detail: null };
    if (!G || !asg || !asg.corporateMandate || asg.corporateMandate.type !== 'make_format_work') return out;
    tickCorporateMandateProgress(G);
    var man = asg.corporateMandate;
    var prog = asg.corporateMandateProgress;
    if (!prog) return out;
    var st = campaignFindStationById(G, man.stationId);
    var share = st && st.rat && typeof st.rat.share === 'number' ? st.rat.share : 0;
    var endOk = !!(st && st.format === man.targetFormat && share >= man.minShare);
    var metByDeadline =
      prog.firstGoodClosedPeriod != null && (prog.firstGoodClosedPeriod | 0) <= (man.deadlinePeriods | 0);

    if (man.noBrokered && prog.brokeredForbiddenObserved) {
      out.delta = -6;
      out.outcome = 'ignored';
      out.detail = 'brokered_forbidden';
      return out;
    }
    if (!prog.everAtTargetFormat) {
      out.delta = -5;
      out.outcome = 'ignored';
      out.detail = 'never_switched';
      return out;
    }
    if (endOk && metByDeadline) {
      out.delta = 3;
      out.outcome = 'success';
      out.detail = 'met_target_on_time';
      return out;
    }
    out.delta = -2;
    out.outcome = 'failure';
    out.detail = endOk && !metByDeadline ? 'late_or_slipped' : 'missed_share_or_format';
    return out;
  }

  /** Assignment-end promotion bar lift when brokered is active (deterministic; tier-scaled). */
  function campaignBrokeredSuccessThresholdBump(tier, G) {
    if (!campaignPlayerBrokeredEconomicsActive(G)) return 0;
    var t = tier | 0;
    if (t <= 0) return 2;
    if (t <= 2) return 3;
    if (t <= 4) return 4;
    return 6;
  }

  function summarizeWhy(G, asg, outcome, playerName, ownerCompanyName, effSuccessThr) {
    var gm = G && G._gm;
    var who = playerName ? playerName + ', ' : '';
    var own = ownerCompanyName || 'ownership';
    if (!gm) return who + 'your file was processed by ' + own + '.';
    if (outcome.kind === 'fired' || gm.fired)
      return who + own + ' dismissed you — job security hit zero or probation ended badly.';
    var conf = gm.confidence != null ? Math.round(gm.confidence) : 0;
    var promoBar = effSuccessThr != null ? effSuccessThr | 0 : asg.successThreshold | 0;
    if (outcome.kind === 'promoted')
      return (
        who +
        'you finished the contract at ' +
        conf +
        '% confidence — above the promotion bar (' +
        promoBar +
        ') with a sustainable review pattern. ' +
        own +
        ' is ready to move you up.'
      );
    if (outcome.kind === 'lateral')
      return (
        who +
        'you met expectations through the contract (' +
        conf +
        '%) — above survival (' +
        asg.survivalThreshold +
        ') but not enough for a step up. ' +
        own +
        ' will reassign you sideways.'
      );
    return (
      who +
      'your contract ended at ' +
      conf +
      '% — below the survival threshold (' +
      asg.survivalThreshold +
      ') without termination, so ' +
      own +
      ' is moving you to an easier role.'
    );
  }

  function evaluateAssignmentEnd(G, asg) {
    if (!G || G._campaignOutcomeRecorded) return null;
    var gm = G && G._gm;
    var fired = !!(gm && gm.fired);
    var contractDone = gm && gm.closedPeriods != null && gm.closedPeriods >= (asg.contractLengthPeriods || 16);

    if (!fired && !contractDone) return null;

    var mandateEval = evaluateCorporateMandateAtAssignmentEnd(G, asg);
    if (gm && mandateEval && mandateEval.delta && contractDone && !fired) {
      var nc = (gm.confidence || 0) + mandateEval.delta;
      gm.confidence = Math.max(0, Math.min(100, Math.round(nc)));
    }
    var conf = gm && gm.confidence != null ? gm.confidence : 0;

    var tierBefore = asg.tier | 0;
    var brokeredBarBump = campaignBrokeredSuccessThresholdBump(tierBefore, G);
    var succThr = (asg.successThreshold | 0) + brokeredBarBump;

    var kind;
    if (fired) {
      kind = 'fired';
    } else if (conf >= succThr) {
      kind = 'promoted';
    } else if (conf >= asg.survivalThreshold) {
      kind = 'lateral';
    } else {
      kind = 'demoted';
    }

    var st = ensureState();
    var repBefore = st.reputation;
    var repDelta = 0;
    if (kind === 'promoted') {
      repDelta = 12;
      st.promotionCount++;
    } else if (kind === 'lateral') {
      repDelta = 6;
      st.lateralCount++;
    } else if (kind === 'demoted') {
      repDelta = -4;
      st.demotionCount++;
    } else {
      repDelta = -12;
      st.firingCount++;
    }
    st.reputation = Math.max(0, Math.min(100, repBefore + repDelta));
    st.completedAssignments++;

    var campaignWin = tierBefore === 5 && !fired && contractDone && conf >= succThr;

    if (campaignWin) {
      st.campaignWon = true;
      st.active = false;
      kind = 'promoted';
    }

    var nextTier = campaignWin ? 5 : nextTierAfter(kind, tierBefore, st.reputation);
    st.currentTier = campaignWin ? 5 : nextTier;

    if (tierBefore > st.highestTierCompleted && (kind === 'promoted' || kind === 'lateral')) {
      st.highestTierCompleted = Math.max(st.highestTierCompleted, tierBefore);
    }

    var nextAsg = campaignWin ? null : pickAssignmentForTier(nextTier, st);

    if (kind === 'fired' && tierBefore <= 0 && st.firingCount >= 2 && st.reputation < 28) {
      st.active = false;
    }

    var periodsClosed = gm && gm.closedPeriods != null ? gm.closedPeriods | 0 : null;
    var entry = {
      tier: tierBefore,
      marketId: asg.marketId,
      assignmentId: asg.id,
      result: campaignWin ? 'won' : kind,
      confidence: Math.round(conf),
      year: G.year,
      period: G.period,
      reputationAfter: st.reputation,
      periodsClosed: periodsClosed,
    };
    st.history.push(entry);
    if (st.history.length > 24) st.history = st.history.slice(-24);

    archiveMarketAtAssignmentEnd(G, asg.marketId);

    var standing = careerStandingLabel(kind, repDelta);

    var tier5ShelfDiag =
      tierBefore === 5 && gm && gm.tier5ConfidenceDiag && gm.tier5ConfidenceDiag.length
        ? gm.tier5ConfidenceDiag.slice()
        : null;

    G._campaignOutcomeRecorded = true;
    delete G.campaignAssignment;
    G.careerCampaign = false;

    var pn = displayPlayerName(st);
    var oc = st.ownerCompanyName ? String(st.ownerCompanyName).trim() : '';
    var whyText = campaignWin
      ? pn +
        ', you finished your top-market contract at ' +
        Math.round(conf) +
        '% confidence — ' +
        (oc || 'Ownership') +
        ' recognizes you as a major-market GM. Career ladder complete.'
      : summarizeWhy(G, asg, { kind: kind }, pn, oc, succThr);
    if (mandateEval && mandateEval.outcome && contractDone && !fired) {
      if (mandateEval.outcome === 'success') {
        whyText += ' Corporate format mandate: hit the brief on time — that helped the close-out read.';
      } else if (mandateEval.outcome === 'failure') {
        whyText += ' Corporate format mandate: missed the agreed target — that hurt the close-out read.';
      } else if (mandateEval.outcome === 'ignored') {
        whyText += ' Corporate format mandate: treated as ignored or declined — that weighed heavily on the close-out read.';
      }
    }

    return {
      kind: kind,
      campaignWin: campaignWin,
      repDelta: repDelta,
      reputation: st.reputation,
      standing: standing,
      why: whyText,
      tierBefore: tierBefore,
      nextTier: nextTier,
      nextAssignment: nextAsg,
      careerEndedHard: st.active === false && !campaignWin,
      playerName: pn,
      ownerCompanyName: oc,
      assignmentId: asg.id,
      marketId: asg.marketId,
      periodsClosed: periodsClosed,
      tier5ConfidenceShelfDiag: tier5ShelfDiag,
      successThreshold: asg.successThreshold,
      successThresholdEffective: succThr,
      brokeredPromotionBarBump: brokeredBarBump,
      survivalThreshold: asg.survivalThreshold,
      finalConfidenceBeforeClassification: conf,
      corporateMandateEvaluation: mandateEval && mandateEval.outcome ? mandateEval : null,
    };
  }

  function applyAssignmentToGame(G, asg) {
    if (!G || !G.sc) return;
    G._campaignOutcomeRecorded = false;
    G.careerCampaign = true;
    G.campaignAssignment = {
      id: asg.id,
      tier: asg.tier,
      marketId: asg.marketId,
      scenarioId: asg.scenarioId || 'gm_under',
      ownerArchetype: asg.ownerArchetype,
      title: asg.title,
      contractLengthPeriods: asg.contractLengthPeriods,
      successThreshold: asg.successThreshold,
      survivalThreshold: asg.survivalThreshold,
      failureThreshold: asg.failureThreshold,
      flavor: asg.flavor || '',
      evaluationGraceReviews: asg.evaluationGraceReviews | 0,
      corporateCashGrant: asg.corporateCashGrant | 0,
      corporateCommitmentNote: asg.corporateCommitmentNote || '',
    };
    G.sc.gmMode = true;
    G.sc.gmOwnerArchetype = asg.ownerArchetype;
    var base = (G.sc.gmConfig && typeof G.sc.gmConfig === 'object' ? G.sc.gmConfig : {}) || {};
    G.sc.gmConfig = Object.assign({}, base, asg.gmConfig || {});
    var cm = asg.cashMult != null ? asg.cashMult : 1;
    if (typeof G.cash === 'number') G.cash = Math.max(0, Math.round(G.cash * cm));
    var grant = asg.corporateCashGrant | 0;
    if (grant > 0 && typeof G.cash === 'number') G.cash = Math.max(0, G.cash + grant);
    /** Headless: Tier 5 confidence shelf trace (formal reviews only; no gameplay effect beyond logging). */
    G._gmTier5ShelfDiag = !!(
      typeof globalThis !== 'undefined' &&
      globalThis.__WL_TIER5_SHELF_DIAG__ &&
      (asg.tier | 0) >= 5
    );
    if (typeof wlGmMode !== 'undefined' && wlGmMode.initGmStateForGame) wlGmMode.initGmStateForGame(G);
    tryAttachCorporateMandate(G, asg);
    if (G.campaignAssignment.corporateMandate && G.news) {
      var cm = G.campaignAssignment.corporateMandate;
      var stM = campaignFindStationById(G, cm.stationId);
      var callM = (stM && (stM.callLetters || stM.brand || stM.name)) || 'the station';
      var fmtHuman =
        typeof global !== 'undefined' && typeof global.fmtLabel === 'function'
          ? global.fmtLabel(cm.targetFormat, G.year)
          : cm.targetFormat;
      var pct = Math.round((cm.minShare || 0) * 1000) / 10;
      var brk = cm.noBrokered ? ' Paid-programming (brokered) economics will be read as declining the mandate.' : '';
      G.news.unshift({
        v: 'HIGH',
        t:
          '📋 Corporate mandate: flip ' +
          callM +
          ' to ' +
          fmtHuman +
          ' and reach at least ' +
          pct +
          '% share within ' +
          (cm.deadlinePeriods | 0) +
          ' operating periods.' +
          brk,
        y: G.year,
        p: G.period,
        iy: true,
      });
    }
    var st = ensureState();
    if (st.active) st.currentTier = asg.tier | 0;
    if (st.playerName) G.campaignPlayerName = String(st.playerName).trim();
    if (st.ownerCompanyName) G.campaignOwnerCompany = String(st.ownerCompanyName).trim();
  }

  function deactivateCampaign() {
    state = null;
  }

  function getPayloadForSave() {
    var st = state;
    if (!st || st.v !== 1) return null;
    if (
      st.active ||
      st.campaignWon ||
      (st.completedAssignments | 0) > 0 ||
      (st.firingCount | 0) > 0 ||
      (st.playerName && String(st.playerName).trim())
    ) {
      return JSON.parse(JSON.stringify(st));
    }
    return null;
  }

  function loadPayloadFromSave(c) {
    if (!c || c.v !== 1) {
      state = null;
      return;
    }
    state = Object.assign(defaultState(), c);
  }

  function syncFromGame(G) {
    if (!G) return;
    var st = ensureState();
    if (G.campaignAssignment) {
      st.active = true;
      st.currentTier = G.campaignAssignment.tier | 0;
    }
    if (G.campaignAssignment || G.careerCampaign) {
      if (st.playerName) G.campaignPlayerName = String(st.playerName).trim();
      if (st.ownerCompanyName) G.campaignOwnerCompany = String(st.ownerCompanyName).trim();
    }
  }

  function onPeriodClose(G, wasYear, wasPeriod) {
    if (global.MP && global.MP.mode === 'live') return;
    if (!G || !G.careerCampaign || !G.campaignAssignment) return;
    var asg = G.campaignAssignment;
    var ev = evaluateAssignmentEnd(G, asg);
    if (!ev) return;
    G._campaignAssignmentEnded = ev;
  }

  function afterRenderAll(G) {
    if (global.MP && global.MP.mode === 'live') return;
    if (!G || !G._campaignAssignmentEnded) return;
    var payload = G._campaignAssignmentEnded;
    delete G._campaignAssignmentEnded;
    _diagLastAssignmentEndPayload = payload;

    var st = ensureState();
    st.awaitingLaunch = {
      ended: payload,
      nextAssignment: payload.nextAssignment,
      careerEndedHard: payload.careerEndedHard,
    };

    var showWhenClear = function () {
      var open = document.querySelectorAll('.ov.on');
      if (open.length) {
        setTimeout(showWhenClear, 120);
        return;
      }
      fillCampaignEndModal(payload);
      if (typeof global.om === 'function') global.om('m-campaign-end');
      try {
        if (typeof global.autoSave === 'function') global.autoSave();
      } catch (_e) {}
    };
    setTimeout(showWhenClear, 350);
  }

  function fillCampaignEndModal(payload) {
    var b = document.getElementById('campaign-endb');
    if (!b) return;
    var st = ensureState();
    var next = payload.nextAssignment;
    var resultLabel =
      payload.kind === 'promoted'
        ? 'Promoted'
        : payload.kind === 'lateral'
          ? 'Retained — lateral move'
          : payload.kind === 'demoted'
            ? 'Reassigned — demotion / fallback'
            : 'Fired — career setback';

    if (payload.campaignWin) resultLabel = 'Campaign complete — top-market success';

    var pName = payload.playerName || displayPlayerName(st);
    var oName = payload.ownerCompanyName || st.ownerCompanyName || 'your broadcast group';
    var nextCity =
      next && global.MARKETS && global.MARKETS[next.marketId]
        ? global.MARKETS[next.marketId].label
        : next && next.marketId
          ? next.marketId
          : '';

    var nextLine = payload.campaignWin
      ? pName +
        ', you have cleared the GM career ladder for ' +
        oName +
        '. Start a new career anytime from scenario select.'
      : payload.careerEndedHard
        ? pName + ', your GM career path has ended after repeated setbacks at the bottom of the ladder.'
        : 'Next: ' +
          oName +
          ' is assigning you to ' +
          (next && next.title ? next.title : 'a GM role') +
          (nextCity ? ' in ' + nextCity : '') +
          (next ? ' (Tier ' + next.tier + ').' : '.');

    var standing =
      payload.standing === 'rising'
        ? 'Rising'
        : payload.standing === 'damaged'
          ? 'Damaged'
          : 'Stable';

    var mandLine = '';
    var me = payload.corporateMandateEvaluation;
    if (me && me.outcome) {
      if (me.outcome === 'success') mandLine = 'Corporate mandate: success (+' + (me.delta | 0) + ' confidence at close-out).';
      else if (me.outcome === 'failure') mandLine = 'Corporate mandate: missed (' + (me.delta | 0) + ' confidence at close-out).';
      else mandLine = 'Corporate mandate: ignored / declined (' + (me.delta | 0) + ' confidence at close-out).';
    }

    b.innerHTML =
      '<div class="ms2">' +
      '<div class="msh">ASSIGNMENT RESULT</div>' +
      '<div class="sr"><span class="lb">GM</span><span class="vl">' +
      esc(pName) +
      '</span></div>' +
      '<div class="sr"><span class="lb">Employer</span><span class="vl">' +
      esc(oName) +
      '</span></div>' +
      '<div class="sr"><span class="lb">Outcome</span><span class="vl">' +
      esc(resultLabel) +
      '</span></div>' +
      '<div class="sr"><span class="lb">Why</span><span class="vl" style="font-size:15px;line-height:1.45">' +
      esc(payload.why) +
      '</span></div>' +
      (mandLine
        ? '<div class="sr"><span class="lb">Mandate</span><span class="vl" style="font-size:14px;line-height:1.45">' +
          esc(mandLine) +
          '</span></div>'
        : '') +
      '<div class="sr"><span class="lb">Career standing</span><span class="vl">' +
      esc(standing) +
      ' · Rep ' +
      (st.reputation | 0) +
      '/100</span></div>' +
      '<div class="sr"><span class="lb">Next role</span><span class="vl" style="font-size:15px;line-height:1.45">' +
      esc(nextLine) +
      '</span></div>' +
      '</div>';

    var btn = document.getElementById('campaign-end-continue');
    if (btn) {
      if (payload.campaignWin || payload.careerEndedHard) {
        btn.textContent = 'BACK TO MENU';
        btn.onclick = function () {
          if (typeof global.cm === 'function') global.cm('m-campaign-end');
          st.awaitingLaunch = null;
          try {
            if (typeof global.autoSave === 'function') global.autoSave();
          } catch (_e) {}
          if (typeof global.openScenSelect === 'function') global.openScenSelect(typeof global.getLocalSave === 'function' ? global.getLocalSave() : null);
        };
      } else {
        btn.textContent = 'CONTINUE CAREER →';
        btn.onclick = function () {
          if (typeof global.cm === 'function') global.cm('m-campaign-end');
          if (typeof global.wlCampaignStartNextAssignment === 'function') global.wlCampaignStartNextAssignment();
        };
      }
    }
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** legacy.js keeps sim state in a lexical `G`; assigning `window.G` alone does not update it. */
  function syncLegacyGameRef(g) {
    if (g && typeof global.wlBindGameState === 'function') global.wlBindGameState(g);
  }

  /** Partial blueprint merge for Underdog player slot (BP idx 1); see legacy `effectiveBpForMarket`. Only set around genMarket. */
  function applyCampaignStarterBpPatch(asg) {
    if (typeof globalThis === 'undefined') return;
    var p = asg && asg.starterPlayerBpPatch;
    if (p && typeof p === 'object') globalThis.__WL_GM_UNDER_PLAYER_BP_PATCH__ = p;
    else delete globalThis.__WL_GM_UNDER_PLAYER_BP_PATCH__;
  }

  function clearCampaignStarterBpPatch() {
    if (typeof globalThis !== 'undefined') delete globalThis.__WL_GM_UNDER_PLAYER_BP_PATCH__;
  }

  /**
   * Build/regenerate `global.G` for a campaign assignment. Call `syncLegacyGameRef` immediately
   * after assigning `global.G` so legacy’s lexical `G` matches before any init (autoSave serializes lexical `G`).
   */
  function hydrateCampaignWorldForAssignment(asg, st, opts) {
    opts = opts || {};
    var mid = asg.marketId;
    if (typeof global.wlSetActiveMarket === 'function') global.wlSetActiveMarket(mid);
    else {
      global.ACTIVE_MARKET = mid;
      global._selectedMarket = mid;
      if (typeof global.syncMarketPopToMarket === 'function') global.syncMarketPopToMarket(mid);
    }
    var mktLbl =
      global.MARKETS && global.MARKETS[mid] ? global.MARKETS[mid].label : mid;
    var companyName =
      st.ownerCompanyName && String(st.ownerCompanyName).trim()
        ? String(st.ownerCompanyName).trim()
        : mktLbl + ' Broadcasting Group';
    if (typeof global.genMarket !== 'function') return { restored: false, mid: mid, companyName: companyName };
    var arch = st.marketArchives && st.marketArchives[mid];
    var restored = !!(arch && arch.v === 1 && arch.g);
    if (restored) {
      global.G = rehydrateGameFromMarketArchive(arch);
      global.G.marketId = mid;
      syncLegacyGameRef(global.G);
      var halfAway = estimateHalfYearsAway(arch, st);
      advanceCalendarForTimeAway(global.G, halfAway);
      applyCampaignReturnStateJitter(global.G, asg.tier | 0, halfAway);
      global.G._campaignRestoredFromArchive = true;
      st.archiveRestoreCount = (st.archiveRestoreCount | 0) + 1;
      if (global.G.news && !opts.suppressNews) {
        global.G.news.unshift({
          v: 'MEDIUM',
          t:
            '📋 Campaign: Returning to ' +
            mktLbl +
            ' — same market, but ratings and billing have shifted a little while you were away.',
          y: global.G.year,
          p: global.G.period,
          iy: true,
        });
      }
    } else {
      var cy = st.careerSimYear;
      var cp = st.careerSimPeriod;
      applyCampaignStarterBpPatch(asg);
      try {
        if (
          cy != null &&
          cp != null &&
          typeof global.wlGenMarketGmUnderAtCareerTime === 'function'
        ) {
          global.G = global.wlGenMarketGmUnderAtCareerTime(cy, cp);
        } else {
          global.G = global.genMarket('gm_under');
        }
      } finally {
        clearCampaignStarterBpPatch();
      }
      syncLegacyGameRef(global.G);
      global.G._campaignRestoredFromArchive = false;
      if (global.G.news && !opts.suppressNews) {
        global.G.news.unshift({
          v: 'HIGH',
          t:
            '📋 ' +
            displayPlayerName(st) +
            ' — ' +
            companyName +
            ' is moving you to ' +
            mktLbl +
            ' as your next GM assignment.',
          y: global.G.year,
          p: global.G.period,
          iy: true,
        });
      }
    }
    global.G.companyName = companyName;
    applyAssignmentToGame(global.G, asg);
    global.G.ps = (global.G.stations || []).filter(function (s) {
      return s && s.isPlayer;
    });
    global.G._portraitSessionId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + '-' + Math.random().toString(36).slice(2, 11);
    if (typeof global.initSportsRights === 'function') global.initSportsRights(global.G);
    if (typeof global.initFranchiseRights === 'function') global.initFranchiseRights(global.G);
    if (typeof global.normalizeSimulcastLinksInPlace === 'function')
      global.normalizeSimulcastLinksInPlace(global.G);
    if (typeof global.enforceFmNonDupConstraints === 'function')
      global.enforceFmNonDupConstraints(global.G);
    if (typeof global.refreshAllStationOQ === 'function') global.refreshAllStationOQ(global.G);
    if (typeof global.snapMarketRankBookDisplay === 'function')
      global.snapMarketRankBookDisplay(global.G);
    syncLegacyGameRef(global.G);
    return { restored: restored, mid: mid, companyName: companyName };
  }

  /** If a save has career metadata pointing at a different market than `G`, rebuild the world (fixes split-brain autosaves). */
  function repairLoadedGameIfCampaignMarketMismatch(G0) {
    if (!G0 || !G0.campaignAssignment || !G0.careerCampaign) return;
    var asg = G0.campaignAssignment;
    var mid = asg.marketId;
    if (!mid || G0.marketId === mid) return;
    var st = ensureState();
    hydrateCampaignWorldForAssignment(asg, st, { suppressNews: true });
    if (global.G && global.G.news) {
      var lbl =
        global.MARKETS && global.MARKETS[mid] ? global.MARKETS[mid].label : mid;
      global.G.news.unshift({
        v: 'HIGH',
        t:
          '📋 Campaign: Your save listed ' +
          lbl +
          ' as the current assignment — the world state is now aligned with that market.',
        y: global.G.year,
        p: global.G.period,
        iy: true,
      });
    }
  }

  function startNextAssignment() {
    if (global.MP && global.MP.mode === 'live') return;
    var st = ensureState();
    var al = st.awaitingLaunch;
    if (!al || !al.nextAssignment) return;
    var asg = al.nextAssignment;
    st.awaitingLaunch = null;
    global._wlCampaignStarting = true;
    try {
      if (typeof global.genMarket === 'function') {
        var h = hydrateCampaignWorldForAssignment(asg, st, {});
        var restored = h.restored;
        var mid = h.mid;
        if (typeof global.cm === 'function') global.cm('m-scen');
        // Restored markets: skip renderAll here — it can re-fire year-based events after calendar
        // advance and inject extra rival stations, breaking lineup continuity.
        if (typeof global.renderAll === 'function' && !restored) global.renderAll();
        if (typeof global.queuePlayerTalentPortraits === 'function')
          global.queuePlayerTalentPortraits();
        if (typeof global.queueAutoLogosForPlayerStations === 'function')
          global.queueAutoLogosForPlayerStations();
        if (typeof global.wlTrackSoloSession === 'function')
          global.wlTrackSoloSession({
            source: 'campaign_next',
            scenarioId: 'gm_under',
            marketId: mid,
          });
        if (typeof global.autoSave === 'function') global.autoSave();
      }
    } catch (err) {
      if (typeof global.showError === 'function') global.showError(String(err && err.message ? err.message : err), '');
    } finally {
      delete global._wlCampaignStarting;
    }
  }

  function beginCareerWithIdentity(playerName, ownerCompanyName) {
    if (global.MP && global.MP.mode === 'live') {
      if (typeof global.showToast === 'function') global.showToast('GM Career is available in solo play only.', 'info');
      return;
    }
    state = defaultState();
    state.active = true;
    state.playerName = playerName || 'Manager';
    state.ownerCompanyName = ownerCompanyName || generateOwnerCompanyName(CAREER_ENTRY_MARKET_ID);
    var asg = pickAssignmentForTier(0, state);
    state.awaitingLaunch = null;
    global._wlCampaignStarting = true;
    try {
      if (typeof global.wlSetActiveMarket === 'function') global.wlSetActiveMarket(asg.marketId);
      else {
        global.ACTIVE_MARKET = asg.marketId;
        global._selectedMarket = asg.marketId;
        if (typeof global.syncMarketPopToMarket === 'function') global.syncMarketPopToMarket(asg.marketId);
      }
      var mktLbl =
        global.MARKETS && global.MARKETS[asg.marketId]
          ? global.MARKETS[asg.marketId].label
          : asg.marketId;
      var companyName = state.ownerCompanyName;
      if (typeof global.genMarket === 'function') {
        applyCampaignStarterBpPatch(asg);
        try {
          global.G = global.genMarket('gm_under');
        } finally {
          clearCampaignStarterBpPatch();
        }
        syncLegacyGameRef(global.G);
        global.G._campaignRestoredFromArchive = false;
        global.G.companyName = companyName;
        applyAssignmentToGame(global.G, asg);
        global.G.ps = (global.G.stations || []).filter(function (s) {
          return s && s.isPlayer;
        });
        global.G._portraitSessionId =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now() + '-' + Math.random().toString(36).slice(2, 11);
        if (global.G.news) {
          global.G.news.unshift({
            v: 'HIGH',
            t:
              '📋 ' +
              displayPlayerName(state) +
              ' — ' +
              state.ownerCompanyName +
              ' has placed you as General Manager in ' +
              mktLbl +
              '.',
            y: global.G.year,
            p: global.G.period,
            iy: true,
          });
        }
        if (typeof global.initSportsRights === 'function') global.initSportsRights(global.G);
        if (typeof global.initFranchiseRights === 'function') global.initFranchiseRights(global.G);
        if (typeof global.normalizeSimulcastLinksInPlace === 'function')
          global.normalizeSimulcastLinksInPlace(global.G);
        if (typeof global.enforceFmNonDupConstraints === 'function')
          global.enforceFmNonDupConstraints(global.G);
        if (typeof global.refreshAllStationOQ === 'function') global.refreshAllStationOQ(global.G);
        if (typeof global.snapMarketRankBookDisplay === 'function')
          global.snapMarketRankBookDisplay(global.G);
        syncLegacyGameRef(global.G);
        if (typeof global.cm === 'function') global.cm('m-scen');
        if (typeof global.renderAll === 'function') global.renderAll();
        if (typeof global.queuePlayerTalentPortraits === 'function')
          global.queuePlayerTalentPortraits();
        if (typeof global.queueAutoLogosForPlayerStations === 'function')
          global.queueAutoLogosForPlayerStations();
        if (typeof global.wlTrackSoloSession === 'function')
          global.wlTrackSoloSession({
            source: 'campaign_new',
            scenarioId: 'gm_under',
            marketId: asg.marketId,
          });
        if (typeof global.autoSave === 'function') global.autoSave();
      }
    } catch (err) {
      if (typeof global.showError === 'function') global.showError(String(err && err.message ? err.message : err), '');
    } finally {
      delete global._wlCampaignStarting;
    }
  }

  function renderCampaignModal() {
    var body = document.getElementById('campaign-careerb');
    if (!body) return;
    var st = ensureState();
    if (st.campaignWon) {
      body.innerHTML =
        '<p class="di" style="margin-top:0">You have completed the GM career ladder. Start a new run with <strong>START GM CAREER</strong> on the scenario screen anytime.</p>';
      return;
    }
    if (!st.active && !(st.history && st.history.length)) {
      body.innerHTML =
        '<p class="di" style="margin-top:0">No GM career data yet. Choose <strong>START GM CAREER</strong> on the scenario screen.</p>';
      return;
    }
    var inProgress = global.G && global.G.campaignAssignment;
    if (!st.active && !inProgress && st.history && st.history.length) {
      var hlines = st.history
        .slice(-8)
        .map(function (h) {
          var mk =
            global.MARKETS && h.marketId && global.MARKETS[h.marketId]
              ? global.MARKETS[h.marketId].label
              : h.marketId || '—';
          return (
            '<div style="font-size:14px;color:var(--off);margin-bottom:6px">' +
            esc(mk) +
            ' · T' +
            h.tier +
            ' · <span style="color:var(--amb)">' +
            esc(h.result) +
            '</span></div>'
          );
        })
        .join('');
      body.innerHTML =
        (st.playerName
          ? '<p class="di" style="margin-top:0">GM <strong>' +
            esc(displayPlayerName(st)) +
            '</strong>' +
            (st.ownerCompanyName ? ' · ' + esc(st.ownerCompanyName) : '') +
            '</p>'
          : '') +
        '<p class="di" style="margin-top:0">This saved career has ended or was retired. History:</p>' +
        '<div style="margin-top:10px">' +
        hlines +
        '</div>' +
        '<p class="di" style="margin-top:12px">Reputation ' +
        (st.reputation | 0) +
        '/100 · Promotions ' +
        (st.promotionCount | 0) +
        ' · Firings ' +
        (st.firingCount | 0) +
        '</p>';
      return;
    }
    var asg =
      (global.G && global.G.campaignAssignment) || pickAssignmentForTier(st.currentTier != null ? st.currentTier : 0, st);
    var gm = global.G && global.G._gm;
    var conf = gm && gm.confidence != null ? Math.round(gm.confidence) : '—';
    var periods = gm && gm.closedPeriods != null ? gm.closedPeriods : '—';
    var total = asg.contractLengthPeriods || 16;
    var mname =
      global.MARKETS && asg.marketId && global.MARKETS[asg.marketId]
        ? global.MARKETS[asg.marketId].label
        : asg.marketId;
    var lines = (st.history || [])
      .slice(-6)
      .map(function (h) {
        var mk =
          global.MARKETS && h.marketId && global.MARKETS[h.marketId]
            ? global.MARKETS[h.marketId].label
            : h.marketId || '—';
        return (
          '<div style="font-size:14px;color:var(--off);margin-bottom:6px">' +
          esc(mk) +
          ' · T' +
          h.tier +
          ' · <span style="color:var(--amb)">' +
          esc(h.result) +
          '</span> · rep ' +
          (h.reputationAfter != null ? h.reputationAfter : '—') +
          '</div>'
        );
      })
      .join('');
    body.innerHTML =
      '<div class="ms2">' +
      '<div class="msh">CURRENT ASSIGNMENT</div>' +
      '<div class="sr"><span class="lb">GM</span><span class="vl">' +
      esc(displayPlayerName(st)) +
      '</span></div>' +
      '<div class="sr"><span class="lb">Owning company</span><span class="vl">' +
      esc(st.ownerCompanyName || '—') +
      '</span></div>' +
      '<div class="sr"><span class="lb">Role</span><span class="vl">' +
      esc(asg.title) +
      '</span></div>' +
      '<div class="sr"><span class="lb">Market</span><span class="vl">' +
      esc(mname) +
      '</span></div>' +
      '<div class="sr"><span class="lb">Tier</span><span class="vl">' +
      (asg.tier | 0) +
      ' / 5</span></div>' +
      '<div class="sr"><span class="lb">Contract</span><span class="vl">' +
      periods +
      ' / ' +
      total +
      ' periods</span></div>' +
      '<div class="sr"><span class="lb">Job security</span><span class="vl">' +
      conf +
      '%</span></div>' +
      (typeof global.wlGmMode !== 'undefined' && global.wlGmMode.buildCampaignGmSummaryHtml
        ? global.wlGmMode.buildCampaignGmSummaryHtml(global.G)
        : '') +
      '<div class="sr"><span class="lb">Career reputation</span><span class="vl">' +
      (st.reputation | 0) +
      '/100 · Promotions ' +
      (st.promotionCount | 0) +
      ' · Firings ' +
      (st.firingCount | 0) +
      '</span></div>' +
      '</div>' +
      (asg.flavor
        ? '<p class="di" style="margin-top:12px;line-height:1.5">' + esc(asg.flavor) + '</p>'
        : '') +
      '<div style="margin-top:14px"><div class="msh" style="margin-bottom:6px">RECENT HISTORY</div>' +
      (lines || '<div style="color:var(--mut);font-size:14px">No completed assignments yet.</div>') +
      '</div>';
  }

  function getLastAssignmentEndPayload() {
    var p = _diagLastAssignmentEndPayload;
    _diagLastAssignmentEndPayload = null;
    return p;
  }

  function stationFingerprintFromG(G) {
    if (!G || !G.stations) return '';
    return G.stations
      .map(function (s) {
        return s && (s.callLetters || s.call);
      })
      .filter(Boolean)
      .sort()
      .join('|');
  }

  /** Calls signs fingerprint (sorted) for a persisted market archive — headless / diagnostics. */
  function getMarketArchiveFingerprint(marketId) {
    var st = ensureState();
    var a = st.marketArchives && st.marketArchives[marketId];
    if (!a || !a.g) return null;
    return stationFingerprintFromG(a.g);
  }

  /** Replace queued next assignment (after an end) so tests can simulate demotion back to a market. */
  function headlessReplaceAwaitingLaunchWithMarket(marketId) {
    if (!global.__WL_HEADLESS__) return false;
    var st = ensureState();
    if (!st.awaitingLaunch || !st.awaitingLaunch.nextAssignment) return false;
    var asg = null;
    for (var i = 0; i < LADDER.length; i++) {
      if (LADDER[i].marketId === marketId) {
        asg = LADDER[i];
        break;
      }
    }
    if (!asg) return false;
    st.awaitingLaunch.nextAssignment = asg;
    return true;
  }

  function getCampaignPersistenceDiagnostics() {
    var st = ensureState();
    return {
      archiveKeys: Object.keys(st.marketArchives || {}),
      archiveRestoreCount: st.archiveRestoreCount | 0,
      careerAssignmentTick: st.careerAssignmentTick | 0,
    };
  }

  global.wlCampaign = {
    LADDER: LADDER,
    CAREER_ENTRY_MARKET_ID: CAREER_ENTRY_MARKET_ID,
    CAMPAIGN_FULL_ARC_ASSIGNMENTS: CAMPAIGN_FULL_ARC_ASSIGNMENTS,
    CAMPAIGN_SHORT_ARC_ASSIGNMENTS: CAMPAIGN_SHORT_ARC_ASSIGNMENTS,
    ensureState: ensureState,
    pickAssignmentForTier: pickAssignmentForTier,
    applyAssignmentToGame: applyAssignmentToGame,
    tickCorporateMandateProgress: tickCorporateMandateProgress,
    deactivateCampaign: deactivateCampaign,
    getPayloadForSave: getPayloadForSave,
    loadPayloadFromSave: loadPayloadFromSave,
    onPeriodClose: onPeriodClose,
    afterRenderAll: afterRenderAll,
    openStartModal: openStartModal,
    beginCareerWithIdentity: beginCareerWithIdentity,
    generateOwnerCompanyName: generateOwnerCompanyName,
    startNextAssignment: startNextAssignment,
    renderCampaignModal: renderCampaignModal,
    evaluateAssignmentEnd: evaluateAssignmentEnd,
    syncFromGame: syncFromGame,
    getLastAssignmentEndPayload: getLastAssignmentEndPayload,
    getMarketArchiveFingerprint: getMarketArchiveFingerprint,
    headlessReplaceAwaitingLaunchWithMarket: headlessReplaceAwaitingLaunchWithMarket,
    getCampaignPersistenceDiagnostics: getCampaignPersistenceDiagnostics,
  };

  global.wlCampaignStartNextAssignment = startNextAssignment;
  global.wlCampaignGetPayloadForSave = getPayloadForSave;
  global.wlCampaignLoadFromSave = loadPayloadFromSave;
  global.wlCampaignSyncFromGame = syncFromGame;
  global.wlCampaignDeactivate = deactivateCampaign;
  global.wlCampaignAfterRenderAll = afterRenderAll;
  global.wlCampaignOnPeriodClose = onPeriodClose;
  global.wlCampaignOpenStartModal = openStartModal;
  global.wlCampaignCommitStart = commitStart;
  global.wlCampaignRegenerateOwnerName = regenerateOwnerField;
  global.wlCampaignGetLastAssignmentEndPayload = getLastAssignmentEndPayload;
  global.wlCampaignRepairLoadedGameIfMarketMismatch = repairLoadedGameIfCampaignMarketMismatch;
})(typeof window !== 'undefined' ? window : globalThis);
