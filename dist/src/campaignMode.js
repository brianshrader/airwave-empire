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
   * cashMult is never below 1 on promotion — larger markets get bigger grants so one bad book does not zero the wallet.
   * T4: softer margin + lower survival bar + modest promotion bar — elite pressure without firing cliff.
   * T5: slightly softer than pre-pass (see git history) so flagship wins are possible but uncommon; batch still shows laterals + occasional demotions.
   */
  /**
   * Campaign tier templates — `marketPool` picks the city; tier row holds rules/tuning only.
   * Do not add diag-only markets (Phoenix, Portland) until promoted to ALL_PLAYABLE_MARKET_IDS.
   */
  var LADDER = [
    {
      id: 'c0_starter',
      tier: 0,
      marketPool: ['wichita'],
      scenarioId: 'gm_under',
      ownerArchetype: 'turnaround',
      titleTemplate: 'General Manager — Small-market starter',
      contractLengthPeriods: 12,
      successThreshold: 53,
      survivalThreshold: 38,
      failureThreshold: 31,
      /** Scenario cash × mult + grant: starter runway so Tier 0 can reach assignment-end reviews (still far leaner than T1+ packages). */
      cashMult: 1.15,
      corporateCashGrant: 500000,
      corporateCommitmentNote:
        'Corporate front-loaded working capital for your first chair — enough to survive a bad opening book in a small market, not a major-market war chest.',
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 84 },
      flavor:
        'Your first real General Manager chair: a modest Plains market with real P&L and real competition — lower stakes than a major, but every decision still counts.',
    },
    {
      id: 'c1_regional',
      tier: 1,
      marketPool: ['nashville'],
      scenarioId: 'gm_under',
      ownerArchetype: 'turnaround',
      titleTemplate: 'General Manager — Regional turnaround',
      contractLengthPeriods: 14,
      successThreshold: 56,
      survivalThreshold: 40,
      failureThreshold: 33,
      /** Promotion tier: lift scenario cash (mult ≥1) + large grant — never shrink bankroll vs a fresh gen in this market. */
      cashMult: 1.08,
      corporateCashGrant: 560000,
      evaluationGraceReviews: 1,
      corporateCommitmentNote:
        'Corporate approved a one-time rebuild purse for this posting — you were promoted because they trust you, not to starve the cluster of cash on day one.',
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 82 },
      flavor:
        'Ownership needs a steady hand in a medium-sized southern market. They funded bridge capital so you can run lean and still have room to fix what is broken.',
    },
    {
      id: 'c2_large',
      tier: 2,
      marketPool: ['atlanta', 'dallas', 'houston'],
      scenarioId: 'gm_under',
      ownerArchetype: 'turnaround',
      titleTemplate: 'General Manager — Large-market rebuild',
      contractLengthPeriods: 14,
      successThreshold: 54,
      survivalThreshold: 44,
      failureThreshold: 32,
      cashMult: 1.08,
      /** Atlanta large-market P&L is punishing vs Wichita/Nashville; grant scales for one bad period without game over. */
      corporateCashGrant: 520000,
      evaluationGraceReviews: 1,
      corporateCommitmentNote:
        'Ownership backed this promotion with a one-time operating budget — large-market salvage needs more than good intentions; you get enough cash to survive early losses while you execute.',
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 80 },
      flavorTemplate:
        '{city}: a large market with real revenue on the table — and real scrutiny — but corporate put money behind the seat so a turnaround is playable, not a few rounds to bankruptcy.',
    },
    {
      id: 'c3_growth',
      tier: 3,
      marketPool: ['seattle', 'sanfrancisco'],
      scenarioId: 'gm_under',
      ownerArchetype: 'prestige',
      titleTemplate: 'General Manager — Competitive large market',
      contractLengthPeriods: 18,
      /** Tier 3 is a step-up: promotion bar is tighter than Tier 2; survival still achievable with the turnaround package below. */
      successThreshold: 58,
      survivalThreshold: 42,
      failureThreshold: 33,
      cashMult: 1.1,
      /** Tier 3 + 18-period contract: larger-market burn — mult + grant so one ugly book does not end the arc. */
      corporateCashGrant: 580000,
      /**
       * First N formal GM reviews use turnaround patience (see gmMode.js): trajectory and spend are judged more like a rebuild,
       * not like a mature cash cow. After N reviews, standard corporate discipline applies.
       */
      evaluationGraceReviews: 1,
      /** Short line for in-game campaign UI (gmMode campaign callout). */
      corporateCommitmentNote:
        'Corporate backed this posting with meaningful bridge capital — your first formal review still emphasizes measurable progress over instant profit, but you are not expected to run the cluster on fumes from day one.',
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 78, minFranchiseAvg: 0.5 },
      flavorTemplate:
        '{city}: brand and ratings momentum matter as much as margin. Corporate funded real runway for a rebuild — enough to absorb a bad period — plus one early review cycle where they judge direction before holding you to steady-state standards.',
    },
    {
      id: 'c4_operator',
      tier: 4,
      marketPool: ['chicago'],
      scenarioId: 'gm_under',
      ownerArchetype: 'cash_first',
      titleTemplate: 'General Manager — Major-market operator',
      contractLengthPeriods: 22,
      successThreshold: 55,
      survivalThreshold: 40,
      failureThreshold: 35,
      cashMult: 1.1,
      /** Tier 4 + 22 periods: major-market ops scale — higher grant for mega-class burn. */
      corporateCashGrant: 640000,
      evaluationGraceReviews: 1,
      corporateCommitmentNote:
        'Promotion to a major-market chair included limited bridge funding — corporate expects discipline, but they will not pretend an underfunded General Manager can fix a broken cluster overnight.',
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 79, minMarginPct: 8 },
      flavorTemplate:
        '{city}: big payroll, big expectations — cash discipline matters as much as ratings — with enough corporate runway that the opening quarters reward direction, not only the bottom line.',
    },
    {
      id: 'c5_flagship',
      tier: 5,
      marketPool: ['newyork', 'losangeles'],
      scenarioId: 'gm_under',
      ownerArchetype: 'heritage',
      titleTemplate: 'General Manager — Top-market spotlight',
      contractLengthPeriods: 22,
      successThreshold: 57,
      survivalThreshold: 43,
      failureThreshold: 37,
      cashMult: 1.12,
      /** Tier 5 flagship: top-market economics need a credible opening bankroll (campaign-only). */
      corporateCashGrant: 750000,
      evaluationGraceReviews: 1,
      corporateCommitmentNote:
        'Even at the flagship, the group funded transition support — you are here to win, not to run out of cash before the first books settle.',
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 74, minFranchiseAvg: 0.52 },
      flavorTemplate:
        '{city}: the flagship chair — maximum revenue, maximum pressure — with enough opening support that the assignment is a credible shot, not a kamikaze posting.',
    },
  ];

  /** Legacy fixed cities for saves that predate market pools (repair without reroll). */
  var LEGACY_DEFAULT_MARKET_BY_TIER = ['wichita', 'nashville', 'atlanta', 'seattle', 'chicago', 'newyork'];

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
      /** Monotonic serial for deterministic market picks — persisted across saves. */
      assignmentPickSerial: 0,
      /** Active posting city — repair uses this instead of re-rolling the pool. */
      currentAssignmentMarketId: null,
      /** Pick serial bound to the active posting (must match for forced restore). */
      currentAssignmentPickSerial: null,
      /** Last market left at assignment end — excluded from the immediate next pick when pool > 1. */
      lastEndedMarketId: null,
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
    if (typeof global.wlClerkPlanAllowsGmCampaign === 'function' && !global.wlClerkPlanAllowsGmCampaign()) {
      if (typeof global.wlLockedGmCampaignToast === 'function') global.wlLockedGmCampaignToast();
      else if (typeof global.showToast === 'function')
        global.showToast(
          'The full General Manager career unlocks on Pro or during your signup free trial. Open Account to subscribe.',
          'warn',
          8200,
        );
      return;
    }
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

  function campaignMarketLabel(marketId) {
    var mid = String(marketId || '').trim();
    if (!mid) return '';
    var m = typeof global !== 'undefined' && global.MARKETS ? global.MARKETS[mid] : null;
    return (m && m.label) || mid;
  }

  function resolvedMarketPool(row) {
    if (!row) return [];
    var raw = Array.isArray(row.marketPool) && row.marketPool.length ? row.marketPool.slice() : [];
    if (!raw.length && row.marketId) raw.push(row.marketId);
    return raw.filter(function (mid) {
      return mid && (!global.MARKETS || global.MARKETS[mid]);
    });
  }

  function legacyDefaultMarketForTier(tier) {
    var t = Math.max(0, Math.min(5, tier | 0));
    return LEGACY_DEFAULT_MARKET_BY_TIER[t] || 'wichita';
  }

  /**
   * Deterministic market pick from a tier pool.
   * @param {object} st career state
   * @param {number} tier
   * @param {object} [opts]
   * @param {string} [opts.forceMarketId] pinned city (load repair / headless)
   * @param {number} [opts.pickSerial] hash input — defaults to st.assignmentPickSerial
   * @param {string} [opts.excludeMarketId] skip immediate repeat when pool allows
   * @param {string} [opts.outcomeKind] promoted|lateral|demoted|fired — mixed into hash
   */
  function pickMarketFromPool(st, tier, opts) {
    opts = opts || {};
    var row = ladderRowForTier(tier);
    var pool = resolvedMarketPool(row);
    if (!pool.length) pool = [legacyDefaultMarketForTier(tier)];

    var force = opts.forceMarketId ? String(opts.forceMarketId).trim() : '';
    if (force && pool.indexOf(force) >= 0) return force;

    var exclude = opts.excludeMarketId != null ? String(opts.excludeMarketId).trim() : '';
    if (!exclude && st && st.lastEndedMarketId) exclude = String(st.lastEndedMarketId).trim();

    var candidates = pool.slice();
    if (exclude && candidates.length > 1) {
      candidates = candidates.filter(function (mid) {
        return mid !== exclude;
      });
    }
    if (!candidates.length) candidates = pool.slice();

    var serial =
      opts.pickSerial != null
        ? opts.pickSerial | 0
        : st && st.assignmentPickSerial != null
          ? st.assignmentPickSerial | 0
          : 0;
    var kind = opts.outcomeKind || 'assign';
    var hashInput = [
      'pool_v1',
      serial,
      'tier',
      tier | 0,
      'kind',
      kind,
      'completed',
      st && st.completedAssignments != null ? st.completedAssignments | 0 : 0,
      'pool',
      candidates.slice().sort().join(','),
    ].join('|');
    var h = campaignMandateHash32(hashInput);
    return candidates[h % candidates.length];
  }

  function applyAssignmentCopyTemplates(row, marketId) {
    var city = campaignMarketLabel(marketId);
    var titleBase = row.titleTemplate || row.title || 'General Manager';
    var title = titleBase.indexOf(city) >= 0 ? titleBase : titleBase + ' · ' + city;
    var flavorRaw = row.flavorTemplate || row.flavor || '';
    var flavor = flavorRaw.replace(/\{city\}/g, city).replace(/\{market\}/g, city);
    if (!flavor && city) flavor = 'Your next posting is ' + city + '.';
    return { title: title, flavor: flavor };
  }

  /**
   * Build a concrete assignment for a tier + city (rules from ladder row, city from pool pick).
   */
  function materializeAssignment(tier, st, opts) {
    opts = opts || {};
    var row = ladderRowForTier(tier);
    var mid = pickMarketFromPool(st, tier, opts);
    var copy = applyAssignmentCopyTemplates(row, mid);
    return Object.assign({}, row, {
      marketId: mid,
      title: copy.title,
      flavor: copy.flavor,
      pickSerial: opts.pickSerial != null ? opts.pickSerial | 0 : null,
    });
  }

  function reserveAssignmentPick(st, outcomeKind) {
    var serial = (st.assignmentPickSerial | 0) + 1;
    st.assignmentPickSerial = serial;
    return serial;
  }

  function pickAssignmentForTier(tier, st, opts) {
    opts = opts || {};
    st = st || ensureState();
    var t = Math.max(0, Math.min(5, tier | 0));

    if (opts.forceMarketId) {
      return materializeAssignment(t, st, {
        forceMarketId: opts.forceMarketId,
        pickSerial: opts.pickSerial != null ? opts.pickSerial : st.currentAssignmentPickSerial,
      });
    }

    if (!opts.allowReroll && st.currentAssignmentMarketId && (st.currentTier | 0) === t) {
      return materializeAssignment(t, st, {
        forceMarketId: st.currentAssignmentMarketId,
        pickSerial: st.currentAssignmentPickSerial,
      });
    }

    if (!opts.allowReroll && !st.currentAssignmentMarketId && !opts.outcomeKind) {
      return materializeAssignment(t, st, {
        forceMarketId: legacyDefaultMarketForTier(t),
      });
    }

    var serial =
      opts.pickSerial != null ? opts.pickSerial | 0 : reserveAssignmentPick(st, opts.outcomeKind || 'assign');
    return materializeAssignment(t, st, {
      pickSerial: serial,
      excludeMarketId: opts.excludeMarketId,
      outcomeKind: opts.outcomeKind,
    });
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

  /** Stations with a numeric AQH `rat.share` — same pool used for mandate rank / top-half. */
  function campaignMandateCommercialShareRows(G) {
    var stations = (G && G.stations) || [];
    var rows = [];
    for (var i = 0; i < stations.length; i++) {
      var s = stations[i];
      if (!s) continue;
      var sh = s.rat && typeof s.rat.share === 'number' ? s.rat.share : null;
      if (sh == null || !Number.isFinite(sh)) continue;
      rows.push({ id: s.id, share: sh });
    }
    rows.sort(function (a, b) {
      if (b.share !== a.share) return b.share - a.share;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    return rows;
  }

  function campaignMandateShareSnapshot(G, stationId) {
    var rows = campaignMandateCommercialShareRows(G);
    var count = rows.length;
    var rank = count + 1;
    var share = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === stationId) {
        rank = i + 1;
        share = rows[i].share;
        break;
      }
    }
    return { share: share, rank: rank, count: count };
  }

  /** Meaningful point gain vs mandate start (AQH share). */
  var MANDATE_IMPROVE_DELTA_PP = 0.015;
  /** Below this start share, relative-growth path is disabled (avoids pass from near-zero). */
  var MANDATE_GROWTH_START_MIN = 0.013;
  var MANDATE_GROWTH_FACTOR = 1.35;
  /** Need enough stations for “top half” to mean something. */
  var MANDATE_RANK_TOP_HALF_MIN_STATIONS = 3;

  /**
   * Hybrid mandate success vs AQH share: absolute target OR vetted improvement / rank.
   * @param {number} endShare
   * @param {{ minShare?: number }} man
   * @param {{ startShare?: number|null, startRank?: number|null, endRank?: number, commercialStationCount?: number }} ctx
   */
  function corporateMandateHybridMet(endShare, man, ctx) {
    ctx = ctx || {};
    var minShare = Number(man && man.minShare) || 0;
    var startShare =
      ctx.startShare != null && Number.isFinite(Number(ctx.startShare)) ? Number(ctx.startShare) : 0;
    var startRank = ctx.startRank != null ? ctx.startRank | 0 : 999;
    var endRank = ctx.endRank != null ? ctx.endRank | 0 : 999;
    var n = ctx.commercialStationCount != null ? ctx.commercialStationCount | 0 : 0;
    var es = Number(endShare);
    if (!Number.isFinite(es)) es = 0;

    var deltaMinEnd = Math.max(0.027, minShare * 0.68);
    var growthMinEnd = Math.max(0.025, minShare * 0.65);
    var rankHalfMinEnd = Math.max(0.022, minShare * 0.6);
    var rankJumpMinEnd = Math.max(0.022, minShare * 0.58);

    var paths = {};
    paths.absolute = es >= minShare;
    paths.delta = es >= startShare + MANDATE_IMPROVE_DELTA_PP && es >= deltaMinEnd;
    paths.growth =
      startShare >= MANDATE_GROWTH_START_MIN &&
      es >= startShare * MANDATE_GROWTH_FACTOR &&
      es >= growthMinEnd;
    paths.rankHalf =
      n >= MANDATE_RANK_TOP_HALF_MIN_STATIONS &&
      endRank <= Math.ceil(n / 2) &&
      es >= rankHalfMinEnd;
    paths.rankJump =
      n >= 2 &&
      startRank - endRank >= 2 &&
      endRank < startRank &&
      es >= rankJumpMinEnd;

    var ok =
      !!paths.absolute ||
      !!paths.delta ||
      !!paths.growth ||
      !!paths.rankHalf ||
      !!paths.rankJump;
    var primary = paths.absolute
      ? 'absolute'
      : paths.growth
        ? 'growth'
        : paths.delta
          ? 'delta'
          : paths.rankHalf
            ? 'rank_half'
            : paths.rankJump
              ? 'rank_jump'
              : null;
    return { ok: ok, paths: paths, primary: primary };
  }

  function campaignCreateMandateProgress() {
    return {
      everAtTargetFormat: false,
      brokeredForbiddenObserved: false,
      firstGoodClosedPeriod: null,
      bestShareWhileTarget: 0,
      lastShare: null,
      shareTrend: 'flat',
      startShare: null,
      startRank: null,
      commercialCount: 0,
      startShareRecorded: false,
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
    var progInit = G.campaignAssignment.corporateMandateProgress;
    var snapInit = campaignMandateShareSnapshot(G, st.id);
    progInit.startShare = snapInit.share;
    progInit.startRank = snapInit.rank;
    progInit.commercialCount = snapInit.count;
    progInit.startShareRecorded = true;
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
    if (!prog.startShareRecorded) {
      var snapM = campaignMandateShareSnapshot(G, man.stationId);
      prog.startShare = snapM.share;
      prog.startRank = snapM.rank;
      prog.commercialCount = snapM.count;
      prog.startShareRecorded = true;
    }
    var share = st.rat && typeof st.rat.share === 'number' ? st.rat.share : 0;
    if (st.format === man.targetFormat) {
      prog.everAtTargetFormat = true;
      if (share > prog.bestShareWhileTarget) prog.bestShareWhileTarget = share;
      var snapR = campaignMandateShareSnapshot(G, man.stationId);
      var hyTick = corporateMandateHybridMet(share, man, {
        startShare: prog.startShare,
        startRank: prog.startRank,
        endRank: snapR.rank,
        commercialStationCount: snapR.count,
      });
      if (hyTick.ok && prog.firstGoodClosedPeriod == null) prog.firstGoodClosedPeriod = closed;
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
    var out = {
      delta: 0,
      outcome: null,
      detail: null,
      successPath: null,
      endShare: null,
      shareDelta: null,
      shareGrowthPct: null,
      endRank: null,
    };
    if (!G || !asg || !asg.corporateMandate || asg.corporateMandate.type !== 'make_format_work') return out;
    tickCorporateMandateProgress(G);
    var man = asg.corporateMandate;
    var prog = asg.corporateMandateProgress;
    if (!prog) return out;
    var st = campaignFindStationById(G, man.stationId);
    var share = st && st.rat && typeof st.rat.share === 'number' ? st.rat.share : 0;
    var snapEnd = campaignMandateShareSnapshot(G, man.stationId);
    var hyEnd = corporateMandateHybridMet(share, man, {
      startShare: prog.startShare,
      startRank: prog.startRank,
      endRank: snapEnd.rank,
      commercialStationCount: snapEnd.count,
    });
    var endOk = !!(st && st.format === man.targetFormat && hyEnd.ok);
    var metByDeadline =
      prog.firstGoodClosedPeriod != null && (prog.firstGoodClosedPeriod | 0) <= (man.deadlinePeriods | 0);
    var startS =
      prog.startShare != null && Number.isFinite(Number(prog.startShare)) ? Number(prog.startShare) : 0;
    out.endShare = share;
    out.endRank = snapEnd.rank;
    out.shareDelta = share - startS;
    out.shareGrowthPct = startS > 1e-6 ? ((share - startS) / startS) * 100 : null;
    out.successPath = hyEnd.primary;

    if (man.noBrokered && prog.brokeredForbiddenObserved) {
      out.delta = -6;
      out.outcome = 'ignored';
      out.detail = 'brokered_forbidden';
      out.successPath = null;
      return out;
    }
    if (!prog.everAtTargetFormat) {
      out.delta = -5;
      out.outcome = 'ignored';
      out.detail = 'never_switched';
      out.successPath = null;
      return out;
    }
    if (endOk && metByDeadline) {
      out.delta = 3;
      out.outcome = 'success';
      out.detail = hyEnd.paths && hyEnd.paths.absolute ? 'met_target_on_time' : 'met_alternate_on_time';
      return out;
    }
    out.delta = -2;
    out.outcome = 'failure';
    out.successPath = null;
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

    if (kind === 'fired') {
      try {
        G._wlGmFiredFromCampaign = true;
      } catch (_e) {}
    }

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

    var nextAsg = campaignWin
      ? null
      : pickAssignmentForTier(nextTier, st, {
          excludeMarketId: asg.marketId,
          outcomeKind: kind,
          allowReroll: true,
        });

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

    st.lastEndedMarketId = asg.marketId;

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

  /** After `tryAttachCorporateMandate`; keeps mandate announcement in one place. */
  function pushCorporateMandateNewsIfAny(G) {
    if (!G || !G.campaignAssignment || !G.campaignAssignment.corporateMandate || !G.news) return;
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
        ' — reach at least ' +
        pct +
        '% AQH share or show meaningful ratings improvement (share gain, relative growth, or market rank) within ' +
        (cm.deadlinePeriods | 0) +
        ' operating periods (still on format at contract end).' +
        brk,
      y: G.year,
      p: G.period,
      iy: true,
    });
  }

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.deferCorporateMandate] — if true, skip mandate roll + news (run after campaign ownership variety).
   */
  function applyAssignmentToGame(G, asg, opts) {
    opts = opts || {};
    if (!G || !G.sc) return;
    G._campaignOutcomeRecorded = false;
    G.careerCampaign = true;
    G.campaignAssignment = {
      id: asg.id,
      tier: asg.tier,
      marketId: asg.marketId,
      pickSerial: asg.pickSerial != null ? asg.pickSerial | 0 : null,
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
    if (!opts.deferCorporateMandate) {
      tryAttachCorporateMandate(G, asg);
      pushCorporateMandateNewsIfAny(G);
    }
    var st = ensureState();
    if (st.active) st.currentTier = asg.tier | 0;
    if (asg.marketId) {
      st.currentAssignmentMarketId = asg.marketId;
      st.currentAssignmentPickSerial = asg.pickSerial != null ? asg.pickSerial | 0 : st.assignmentPickSerial | 0;
    }
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
      if (G.campaignAssignment.marketId) {
        st.currentAssignmentMarketId = G.campaignAssignment.marketId;
        if (G.campaignAssignment.pickSerial != null) {
          st.currentAssignmentPickSerial = G.campaignAssignment.pickSerial | 0;
        }
      }
    }
    if (G.campaignAssignment || G.careerCampaign) {
      if (st.playerName) G.campaignPlayerName = String(st.playerName).trim();
      if (st.ownerCompanyName) G.campaignOwnerCompany = String(st.ownerCompanyName).trim();
    }
  }

  /**
   * Rebuild `G.campaignAssignment` + `G.careerCampaign` when browser autosave has persistent `campaign` state
   * but `G` lost those fields (refresh / ordering / older saves). Without them, `wlCampaignOnPeriodClose` never
   * runs assignment-end → no ladder promotion despite strong job security.
   * Does not touch cash or `gmConfig` — only the envelope ownership expects on `G`.
   */
  function repairCareerFlagsOnGFromPersistentState(G) {
    if (!G || !G.sc || G.sc.id !== 'gm_under' || !G.sc.gmMode) return false;
    if (G.careerCampaign && G.campaignAssignment) return false;
    var st = ensureState();
    if (st.awaitingLaunch && st.awaitingLaunch.ended) return false;
    if (st.campaignWon) return false;
    var looksCareer =
      st.active === true ||
      (st.completedAssignments | 0) > 0 ||
      (st.history && st.history.length);
    if (!looksCareer) return false;
    var tier = st.currentTier != null ? st.currentTier | 0 : 0;
    var forceMid = st.currentAssignmentMarketId || (G.marketId && String(G.marketId)) || null;
    var asg = pickAssignmentForTier(
      tier,
      st,
      forceMid ? { forceMarketId: forceMid, pickSerial: st.currentAssignmentPickSerial } : {},
    );
    if (!asg) return false;
    G.careerCampaign = true;
    G.campaignAssignment = {
      id: asg.id,
      tier: asg.tier,
      marketId: asg.marketId,
      pickSerial: asg.pickSerial != null ? asg.pickSerial | 0 : null,
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
    G._campaignOutcomeRecorded = false;
    try {
      delete G._campaignAssignmentEnded;
    } catch (_e) {}
    if (typeof global.console !== 'undefined' && console.warn) {
      console.warn(
        '[wlCampaign] Restored G.careerCampaign + G.campaignAssignment from saved career state (tier ' +
          (asg.tier | 0) +
          ', ' +
          (asg.marketId || '') +
          ').',
      );
    }
    return true;
  }

  /**
   * If assignment ended but the end modal never ran (e.g. mobile refresh before `afterRenderAll`), persisted
   * `st.awaitingLaunch.ended` holds the payload — replay so the player can continue the ladder.
   */
  function attachPendingAssignmentEndForAfterRender(G) {
    var st = ensureState();
    var al = st.awaitingLaunch;
    if (!al || !al.ended) return false;
    try {
      /**
       * Do not set `G._campaignAssignmentEnded` here. `ensurePendingCareerEndModalAfterRender` (first
       * `renderAll` after load) must set that flag and call `wlCampaignAfterRenderAll`; if it is
       * already set, ensurePending returns early and the ASSIGNMENT COMPLETE modal never opens.
       */
      // Saves taken mid–assignment-end can have outcome=true with no `campaignAssignment`; clear so
      // `wlCampaignOnPeriodClose` / repairs are not blocked after the player dismisses the modal.
      G._campaignOutcomeRecorded = false;
    } catch (_e) {
      return false;
    }
    return true;
  }

  /** Call after `wlCampaignLoadFromSave` + assigning `G` from disk, before `renderAll`. */
  function handleLoadedGameState(G) {
    if (global.MP && global.MP.mode === 'live') return;
    if (!G) return;
    restoreAwaitingLaunchFromGameMirror(G);
    if (attachPendingAssignmentEndForAfterRender(G)) return;
    repairCareerFlagsOnGFromPersistentState(G);
  }

  /** Serialize pending assignment-end onto `G` so a single autosave blob cannot lose it vs `campaign` only. */
  function mirrorAwaitingLaunchOntoGame(G, ev, nextAssignment, careerEndedHard) {
    if (!G || !ev) return;
    try {
      G._wlCampaignPendingEndV1 = {
        v: 1,
        ended: JSON.parse(JSON.stringify(ev)),
        nextAssignment: nextAssignment ? JSON.parse(JSON.stringify(nextAssignment)) : null,
        careerEndedHard: !!careerEndedHard,
      };
    } catch (_e) {
      G._wlCampaignPendingEndV1 = { v: 1, ended: ev, nextAssignment: nextAssignment || null, careerEndedHard: !!careerEndedHard };
    }
  }

  function clearCareerPendingMirrorOnGame(G) {
    if (!G) return;
    try {
      delete G._wlCampaignPendingEndV1;
    } catch (_e) {}
  }

  /** If `campaign.awaitingLaunch` was lost but `G` still has the mirror, restore session state. */
  function restoreAwaitingLaunchFromGameMirror(G) {
    var d = G && G._wlCampaignPendingEndV1;
    if (!d || d.v !== 1 || !d.ended) return false;
    var st = ensureState();
    if (st.awaitingLaunch && st.awaitingLaunch.ended) return false;
    st.awaitingLaunch = {
      ended: d.ended,
      nextAssignment: d.nextAssignment,
      careerEndedHard: !!d.careerEndedHard,
    };
    return true;
  }

  var _wlCampaignEndModalKickAt = 0;
  /**
   * If a posting ended but the assignment-end modal never opened (e.g. overlay queue / refresh), re-arm
   * `wlCampaignAfterRenderAll` from persistent `awaitingLaunch`. Throttled to avoid double-scheduling.
   */
  function ensurePendingCareerEndModalAfterRender(G) {
    if (global.MP && global.MP.mode === 'live') return;
    if (!G) return;
    var st = ensureState();
    var al = st.awaitingLaunch;
    if (!al || !al.ended) return;
    var m = typeof document !== 'undefined' ? document.getElementById('m-campaign-end') : null;
    if (m && m.classList.contains('on')) return;
    if (G._campaignAssignmentEnded) return;
    var now = Date.now();
    if (now - _wlCampaignEndModalKickAt < 700) return;
    _wlCampaignEndModalKickAt = now;
    try {
      G._campaignAssignmentEnded = al.ended;
      G._campaignOutcomeRecorded = false;
    } catch (_e) {}
    setTimeout(function () {
      if (typeof global.wlCampaignAfterRenderAll === 'function') global.wlCampaignAfterRenderAll(G);
    }, 0);
  }

  /** Open the assignment-end modal immediately when the player is blocked (e.g. hit Next Period first). */
  function ensureEndModalVisible(G) {
    if (global.MP && global.MP.mode === 'live') return;
    var m = typeof document !== 'undefined' ? document.getElementById('m-campaign-end') : null;
    if (m && m.classList.contains('on')) return;
    var st = ensureState();
    var al = st && st.awaitingLaunch;
    if (!al || !al.ended) return;
    fillCampaignEndModal(al.ended);
    if (typeof global.om === 'function') global.om('m-campaign-end');
  }

  /** Drop orphaned career close-out flags on classic franchise scenarios (Underdog, etc.). */
  function scrubPendingCareerEndForNonCareerGame(G) {
    if (!G) return;
    if (G.careerCampaign || G.campaignAssignment) return;
    if (G.sc && G.sc.gmMode) return;
    try {
      delete G._wlCampaignPendingEndV1;
      delete G._campaignAssignmentEnded;
      G._campaignOutcomeRecorded = false;
    } catch (_e) {}
    if (state) state.awaitingLaunch = null;
  }

  /** True when a posting ended and the player still owes the assignment close-out modal. */
  function hasPendingAssignmentEnd(G) {
    if (!G) return false;
    if (global.MP && global.MP.mode === 'live') return false;
    if (!G.careerCampaign && !G.campaignAssignment && !(G.sc && G.sc.gmMode)) {
      scrubPendingCareerEndForNonCareerGame(G);
      return false;
    }
    var st = ensureState();
    var al = st && st.awaitingLaunch;
    if (al && al.ended) return true;
    var d = G._wlCampaignPendingEndV1;
    return !!(d && d.v === 1 && d.ended);
  }

  /** Block advancing another sim period until the career close-out modal is dismissed (prevents orphaned play). */
  function shouldBlockAdvTurnForPendingCareerEnd(G) {
    if (!G) return null;
    if (global.MP && global.MP.mode === 'live') return null;
    if (!hasPendingAssignmentEnd(G)) return null;
    var m = typeof document !== 'undefined' ? document.getElementById('m-campaign-end') : null;
    if (m && m.classList.contains('on')) return null;
    var sum = typeof document !== 'undefined' ? document.getElementById('m-sum') : null;
    if (sum && sum.classList.contains('on')) {
      return 'Close the period summary first — your assignment review opens next.';
    }
    return 'Your posting ended — open the assignment review to continue your career.';
  }

  function onPeriodClose(G, wasYear, wasPeriod) {
    if (global.MP && global.MP.mode === 'live') return;
    if (!G || !G.careerCampaign || !G.campaignAssignment) return;
    var asg = G.campaignAssignment;
    var ev = evaluateAssignmentEnd(G, asg);
    if (!ev) return;
    G._campaignAssignmentEnded = ev;
    /**
     * `legacy.js` calls `autoSave` in `advTurn` *before* `wlCampaignAfterRenderAll`, so the campaign
     * `state` must include `awaitingLaunch` in the same turn as the assignment end — otherwise
     * browser autosave can miss the next market / career outcome until a later `autoSave` (e.g. after
     * closing a modal the user may never see if they leave the page).
     */
    var st = ensureState();
    st.awaitingLaunch = {
      ended: ev,
      nextAssignment: ev.nextAssignment,
      careerEndedHard: ev.careerEndedHard,
    };
    mirrorAwaitingLaunchOntoGame(G, ev, ev.nextAssignment, ev.careerEndedHard);
    if (global.__WL_HEADLESS__) {
      _diagLastAssignmentEndPayload = ev;
      try {
        delete G._campaignAssignmentEnded;
      } catch (_e2) {}
    }
    try {
      if (typeof global.autoSave === 'function') global.autoSave();
    } catch (_e) {}
  }

  function afterRenderAll(G) {
    if (global.MP && global.MP.mode === 'live') return;
    if (!G || !G._campaignAssignmentEnded) return;
    var payload = G._campaignAssignmentEnded;
    delete G._campaignAssignmentEnded;
    _diagLastAssignmentEndPayload = payload;

    var showWhenClear = function () {
      var open = document.querySelectorAll('.ov.on');
      if (open.length) {
        setTimeout(showWhenClear, 120);
        return;
      }
      fillCampaignEndModal(payload);
      if (typeof global.wlMaybeFinalizeSignupTrialFromCampaign === 'function') {
        global.wlMaybeFinalizeSignupTrialFromCampaign(payload);
      }
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
            ? 'Reassigned — demotion / easier market'
            : 'Dismissed — fired (contract ended; job is gone)';

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
        ', you have cleared the General Manager career ladder for ' +
        oName +
        '. Start a new career anytime from scenario select.'
      : payload.careerEndedHard
        ? pName + ', your General Manager career path has ended after repeated setbacks at the bottom of the ladder.'
        : payload.kind === 'fired'
          ? (next
              ? 'When you continue, you will open your next corporate posting (this is a new seat after dismissal, not a promotion from the contract that just ended): ' +
                oName +
                ' routes you to ' +
                (next.title ? next.title : 'a General Manager role') +
                (nextCity ? ' in ' + nextCity : '') +
                ' (Tier ' +
                next.tier +
                ').'
              : 'When you continue, you will leave this summary and either pick up a recovery posting or return to the menu — follow the button label below.')
          : oName +
            ' is assigning you to ' +
            (next && next.title ? next.title : 'a General Manager role') +
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
      if (me.outcome === 'success')
        mandLine =
          'Corporate mandate: success (+' +
          (me.delta | 0) +
          ' confidence at close-out)' +
          (me.detail === 'met_alternate_on_time'
            ? ' — met via ratings improvement / rank (not the headline share floor alone)'
            : '') +
          '.';
      else if (me.outcome === 'failure') mandLine = 'Corporate mandate: missed (' + (me.delta | 0) + ' confidence at close-out).';
      else mandLine = 'Corporate mandate: ignored / declined (' + (me.delta | 0) + ' confidence at close-out).';
    }

    var lateEraBlock = '';
    try {
      if (typeof global.buildLateEraCampaignEndHtml === 'function' && global.G) {
        lateEraBlock = global.buildLateEraCampaignEndHtml(global.G, { forCareerAssignmentModal: true }) || '';
      }
    } catch (_e) {
      lateEraBlock = '';
    }

    var mhEl = document.querySelector('#m-campaign-end .mh span');
    if (mhEl) {
      if (payload.kind === 'fired') mhEl.textContent = 'CONTRACT ENDED — DISMISSED';
      else if (payload.campaignWin) mhEl.textContent = 'CAMPAIGN COMPLETE';
      else mhEl.textContent = 'ASSIGNMENT COMPLETE';
    }

    var firedBanner =
      payload.kind === 'fired'
        ? '<div class="ibox" style="margin-bottom:14px;border-color:rgba(255,82,82,.55);background:rgba(255,82,82,.1)"><strong style="color:var(--red);font-size:16px">You were fired.</strong><span style="display:block;margin-top:8px;font-size:14px;line-height:1.55;color:var(--off)">Corporate ended your General Manager contract. What follows is the formal readout; when you continue you will leave this posting.</span></div>'
        : '';
    var demoteBanner =
      payload.kind === 'demoted' && !payload.careerEndedHard
        ? '<div class="ibox" style="margin-bottom:14px;border-color:rgba(245,166,35,.45);background:rgba(245,166,35,.08)"><strong style="color:var(--amb)">Reassigned to an easier market.</strong><span style="display:block;margin-top:8px;font-size:14px;line-height:1.55;color:var(--off)">This is a demotion / fallback move — you are still employed on the ladder unless the text below says your career path has ended.</span></div>'
        : '';

    b.innerHTML =
      firedBanner +
      demoteBanner +
      '<div class="ms2">' +
      '<div class="msh">ASSIGNMENT RESULT</div>' +
      '<div class="sr"><span class="lb">General Manager</span><span class="vl">' +
      esc(pName) +
      '</span></div>' +
      '<div class="sr"><span class="lb">Employer</span><span class="vl">' +
      esc(oName) +
      '</span></div>' +
      '<div class="sr"><span class="lb">Outcome</span><span class="vl">' +
      esc(resultLabel) +
      '</span></div>' +
      '<p class="di" style="margin:12px 0 0;font-size:15px;line-height:1.55;color:var(--off)">' +
      esc(payload.why) +
      '</p>' +
      (mandLine
        ? '<div class="sr" style="margin-top:12px"><span class="lb">Mandate</span><span class="vl" style="font-size:14px;line-height:1.45">' +
          esc(mandLine) +
          '</span></div>'
        : '') +
      '<div class="sr" style="margin-top:12px"><span class="lb">Career standing</span><span class="vl">' +
      esc(standing) +
      ' · Rep ' +
      (st.reputation | 0) +
      '/100</span></div>' +
      (payload.campaignWin || payload.careerEndedHard
        ? '<p class="di" style="margin:14px 0 0;font-size:15px;line-height:1.55;color:var(--off)">' +
          esc(nextLine) +
          '</p>'
        : '<p class="di" style="margin:14px 0 0;font-size:15px;line-height:1.55;color:var(--off)"><strong>' +
          (payload.kind === 'fired' ? 'What happens next.' : 'Next assignment.') +
          '</strong> ' +
          esc(nextLine) +
          '</p>') +
      lateEraBlock +
      '</div>';

    var btn = document.getElementById('campaign-end-continue');
    if (btn) {
      if (payload.campaignWin || payload.careerEndedHard) {
        btn.textContent = 'BACK TO MENU';
        btn.onclick = function () {
          try {
            if (global.G && payload.kind === 'fired') global.G._wlGmFiredFromCampaign = false;
          } catch (_e) {}
          if (typeof global.cm === 'function') global.cm('m-campaign-end');
          st.awaitingLaunch = null;
          clearCareerPendingMirrorOnGame(global.G);
          try {
            if (typeof global.autoSave === 'function') global.autoSave();
          } catch (_e) {}
          if (payload.kind === 'fired' && typeof global.wlShowGmFiredDismissToast === 'function') {
            global.wlShowGmFiredDismissToast(global.G);
          } else if (typeof global.openScenSelect === 'function') {
            global.openScenSelect(typeof global.getLocalSave === 'function' ? global.getLocalSave() : null);
          }
        };
      } else {
        btn.textContent = 'CONTINUE CAREER →';
        btn.onclick = function () {
          try {
            if (global.G) global.G._wlGmFiredFromCampaign = false;
          } catch (_e) {}
          if (typeof global.cm === 'function') global.cm('m-campaign-end');
          /* Pass next assignment explicitly — mobile/session edge cases can lose `st.awaitingLaunch` sync. */
          if (typeof global.wlCampaignStartNextAssignment === 'function')
            global.wlCampaignStartNextAssignment(payload.nextAssignment || null);
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
    /* Default: random ownership variety — do not lock BP slot 1 to a fixed format. */
    if (!asg || asg.randomOwnership !== false) {
      delete globalThis.__WL_GM_UNDER_PLAYER_BP_PATCH__;
      return;
    }
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
            ' as your next General Manager assignment.',
          y: global.G.year,
          p: global.G.period,
          iy: true,
        });
      }
    }
    global.G.companyName = companyName;
    applyAssignmentToGame(global.G, asg, restored ? {} : { deferCorporateMandate: true });
    if (
      !restored &&
      global.G.careerCampaign &&
      typeof global.wlApplyCampaignLadderOwnershipVariety === 'function'
    ) {
      global.wlApplyCampaignLadderOwnershipVariety(global.G, asg);
    }
    if (!restored) {
      tryAttachCorporateMandate(global.G, asg);
      pushCorporateMandateNewsIfAny(global.G);
    }
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
    if (!restored && typeof global.syncOpeningEconomicsForGame === 'function')
      global.syncOpeningEconomicsForGame(global.G);
    else if (typeof global.reconcileBookDisplaySnapToLastCompletedRankerBook === 'function')
      global.reconcileBookDisplaySnapToLastCompletedRankerBook(global.G);
    else if (typeof global.snapMarketRankBookDisplay === 'function')
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

  /**
   * @param {object|null|undefined} nextAssignmentOverride — from assignment-end modal closure; avoids relying
   * only on `st.awaitingLaunch` (can desync on mobile if autosave/state ordering differs).
   */
  function startNextAssignment(nextAssignmentOverride) {
    if (global.MP && global.MP.mode === 'live') return;
    var st = ensureState();
    var al = st.awaitingLaunch;
    var asg =
      nextAssignmentOverride ||
      (al && al.nextAssignment) ||
      (_diagLastAssignmentEndPayload && _diagLastAssignmentEndPayload.nextAssignment) ||
      null;
    if (!asg) return;
    st.awaitingLaunch = null;
    clearCareerPendingMirrorOnGame(global.G);
    st.currentAssignmentMarketId = asg.marketId;
    st.currentAssignmentPickSerial =
      asg.pickSerial != null ? asg.pickSerial | 0 : st.assignmentPickSerial | 0;
    global._wlCampaignStarting = true;
    try {
      if (typeof global.genMarket === 'function') {
        var h = hydrateCampaignWorldForAssignment(asg, st, {});
        var restored = h.restored;
        var mid = h.mid;
        /** Defer paint so Safari/mobile clears modal scroll-lock (`body.position=fixed`) before drawing the play shell. */
        var finishUi = function () {
          try {
            try {
              if (typeof global.syncModalBodyScrollLock === 'function') global.syncModalBodyScrollLock();
            } catch (_e) {}
            if (typeof global.cm === 'function') global.cm('m-scen');
            // Restored markets: skip renderAll here — it can re-fire year-based events after calendar
            // advance and inject extra rival stations, breaking lineup continuity.
            if (typeof global.renderAll === 'function' && !restored && !global.__WL_HEADLESS__)
              global.renderAll();
            try {
              if (typeof global.syncModalBodyScrollLock === 'function') global.syncModalBodyScrollLock();
            } catch (_e2) {}
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
          } finally {
            try {
              delete global._wlCampaignStarting;
            } catch (_e3) {}
          }
        };
        if (global.__WL_HEADLESS__) {
          finishUi();
        } else if (typeof global.requestAnimationFrame === 'function') {
          global.requestAnimationFrame(function () {
            global.requestAnimationFrame(finishUi);
          });
        } else {
          setTimeout(finishUi, 0);
        }
      } else {
        try {
          delete global._wlCampaignStarting;
        } catch (_e4) {}
      }
    } catch (err) {
      try {
        delete global._wlCampaignStarting;
      } catch (_e5) {}
      if (typeof global.showError === 'function') global.showError(String(err && err.message ? err.message : err), '');
    }
  }

  function beginCareerWithIdentity(playerName, ownerCompanyName) {
    if (global.MP && global.MP.mode === 'live') {
      if (typeof global.showToast === 'function')
        global.showToast('General Manager career is available in solo play only.', 'info');
      return;
    }
    if (typeof global.wlClerkPlanAllowsGmCampaign === 'function' && !global.wlClerkPlanAllowsGmCampaign()) {
      if (typeof global.wlLockedGmCampaignToast === 'function') global.wlLockedGmCampaignToast();
      return;
    }

    function runBeginCareerStart() {
      state = defaultState();
      state.active = true;
      state.playerName = playerName || 'Manager';
      state.ownerCompanyName = ownerCompanyName || generateOwnerCompanyName(CAREER_ENTRY_MARKET_ID);
      var asg = pickAssignmentForTier(0, state, { allowReroll: true });
      state.currentAssignmentMarketId = asg.marketId;
      state.currentAssignmentPickSerial = asg.pickSerial != null ? asg.pickSerial | 0 : 1;
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
          applyAssignmentToGame(global.G, asg, { deferCorporateMandate: true });
          if (
            global.G.careerCampaign &&
            typeof global.wlApplyCampaignLadderOwnershipVariety === 'function'
          ) {
            global.wlApplyCampaignLadderOwnershipVariety(global.G, asg);
          }
          tryAttachCorporateMandate(global.G, asg);
          pushCorporateMandateNewsIfAny(global.G);
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
          if (typeof global.syncOpeningEconomicsForGame === 'function')
            global.syncOpeningEconomicsForGame(global.G);
          syncLegacyGameRef(global.G);
          if (typeof global.cm === 'function') global.cm('m-scen');
          if (typeof global.renderAll === 'function' && !global.__WL_HEADLESS__) global.renderAll();
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
        if (typeof global.showError === 'function')
          global.showError(String(err && err.message ? err.message : err), '');
      } finally {
        delete global._wlCampaignStarting;
      }
    }

    if (global.__WL_HEADLESS__) {
      runBeginCareerStart();
      return;
    }

    void (async function () {
      if (typeof global.wlEnsureTrialLockBeforeCampaignStart === 'function') {
        var ok = await global.wlEnsureTrialLockBeforeCampaignStart();
        if (!ok) return;
      }
      runBeginCareerStart();
    })();
  }

  function renderCampaignModal() {
    var body = document.getElementById('campaign-careerb');
    if (!body) return;
    var st = ensureState();
    if (st.campaignWon) {
      body.innerHTML =
        '<p class="di" style="margin-top:0">You have completed the General Manager career ladder. Start a new run with <strong>START GENERAL MANAGER CAREER</strong> on the scenario screen anytime.</p>';
      return;
    }
    if (!st.active && !(st.history && st.history.length)) {
      body.innerHTML =
        '<p class="di" style="margin-top:0">No General Manager career data yet. Choose <strong>START GENERAL MANAGER CAREER</strong> on the scenario screen.</p>';
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
          ? '<p class="di" style="margin-top:0">General Manager <strong>' +
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
      '<div class="sr"><span class="lb">General Manager</span><span class="vl">' +
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
      var pool = resolvedMarketPool(LADDER[i]);
      if (pool.indexOf(marketId) >= 0) {
        asg = materializeAssignment(LADDER[i].tier | 0, st, { forceMarketId: marketId });
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
    LEGACY_DEFAULT_MARKET_BY_TIER: LEGACY_DEFAULT_MARKET_BY_TIER,
    CAREER_ENTRY_MARKET_ID: CAREER_ENTRY_MARKET_ID,
    CAMPAIGN_FULL_ARC_ASSIGNMENTS: CAMPAIGN_FULL_ARC_ASSIGNMENTS,
    CAMPAIGN_SHORT_ARC_ASSIGNMENTS: CAMPAIGN_SHORT_ARC_ASSIGNMENTS,
    ensureState: ensureState,
    pickAssignmentForTier: pickAssignmentForTier,
    pickMarketFromPool: pickMarketFromPool,
    materializeAssignment: materializeAssignment,
    resolvedMarketPool: resolvedMarketPool,
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
  global.wlCampaignHandleLoadedGame = handleLoadedGameState;
  global.wlCampaignEnsurePendingEndModalAfterRender = ensurePendingCareerEndModalAfterRender;
  global.wlCampaignEnsureEndModalVisible = ensureEndModalVisible;
  global.wlCampaignShouldBlockAdvTurn = shouldBlockAdvTurnForPendingCareerEnd;
  global.wlCampaignHasPendingAssignmentEnd = hasPendingAssignmentEnd;
  global.wlCampaignScrubPendingEndForNonCareerGame = scrubPendingCareerEndForNonCareerGame;
})(typeof window !== 'undefined' ? window : globalThis);
