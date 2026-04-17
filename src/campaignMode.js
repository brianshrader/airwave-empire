/**
 * GM Career Campaign — lightweight progression on top of GM Mode (gmMode.js).
 * Does not alter economy/ratings formulas; only scenario/gmConfig overlays + career metadata.
 */
(function (global) {
  'use strict';

  var CAMPAIGN_STATE_KEY = 'wl_campaign_v1';

  /** @type {object|null} */
  var state = null;

  var LADDER = [
    {
      id: 'c1_nashville',
      tier: 1,
      marketId: 'nashville',
      scenarioId: 'gm_under',
      ownerArchetype: 'turnaround',
      title: 'GM — Regional turnaround',
      contractLengthPeriods: 16,
      successThreshold: 58,
      survivalThreshold: 42,
      failureThreshold: 34,
      cashMult: 0.88,
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 82 },
      flavor: 'Ownership needs a steady hand in a medium-sized southern market. Prove you can run lean and still grow.',
    },
    {
      id: 'c2_atlanta',
      tier: 2,
      marketId: 'atlanta',
      scenarioId: 'gm_under',
      ownerArchetype: 'turnaround',
      title: 'GM — Large market rebuild',
      contractLengthPeriods: 16,
      successThreshold: 56,
      survivalThreshold: 40,
      failureThreshold: 32,
      cashMult: 0.95,
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 78 },
      flavor: 'A Sunbelt major market: more revenue on the table — and more scrutiny.',
    },
    {
      id: 'c3_seattle',
      tier: 3,
      marketId: 'seattle',
      scenarioId: 'gm_under',
      ownerArchetype: 'prestige',
      title: 'GM — Northwest growth market',
      contractLengthPeriods: 20,
      successThreshold: 56,
      survivalThreshold: 42,
      failureThreshold: 34,
      cashMult: 1.0,
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 76, minFranchiseAvg: 0.5 },
      flavor: 'Ownership wants brand strength, not just quarterly margin.',
    },
    {
      id: 'c4_chicago',
      tier: 4,
      marketId: 'chicago',
      scenarioId: 'gm_under',
      ownerArchetype: 'cash_first',
      title: 'GM — Major market operator',
      contractLengthPeriods: 20,
      successThreshold: 58,
      survivalThreshold: 44,
      failureThreshold: 36,
      cashMult: 1.05,
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 74, minMarginPct: 11 },
      flavor: 'Big payroll, big expectations — cash discipline matters as much as ratings.',
    },
    {
      id: 'c5_top',
      tier: 5,
      marketId: 'newyork',
      scenarioId: 'gm_under',
      ownerArchetype: 'heritage',
      title: 'GM — Top-market spotlight',
      contractLengthPeriods: 24,
      successThreshold: 60,
      survivalThreshold: 46,
      failureThreshold: 38,
      cashMult: 1.08,
      gmConfig: { reviewIntervalPeriods: 4, trailingPeriods: 4, startConfidence: 72, minFranchiseAvg: 0.54 },
      flavor: 'The flagship job: maximum revenue, maximum pressure.',
    },
  ];

  function defaultState() {
    return {
      v: 1,
      active: false,
      reputation: 50,
      currentTier: 1,
      promotionCount: 0,
      firingCount: 0,
      lateralCount: 0,
      demotionCount: 0,
      completedAssignments: 0,
      highestTierCompleted: 0,
      campaignWon: false,
      history: [],
      awaitingLaunch: null,
    };
  }

  function ensureState() {
    if (!state) state = defaultState();
    return state;
  }

  function ladderRowForTier(tier) {
    var t = Math.max(1, Math.min(5, tier | 0));
    return LADDER[t - 1] || LADDER[0];
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
    if (kind === 'demoted') return Math.max(1, t - 1);
    if (kind === 'fired') {
      if (t <= 1) return 1;
      if (rep < 38) return Math.max(1, t - 1);
      return t;
    }
    return t;
  }

  function careerStandingLabel(kind, repDelta) {
    if (kind === 'promoted' || repDelta >= 8) return 'rising';
    if (kind === 'fired' || repDelta <= -12) return 'damaged';
    return 'stable';
  }

  function summarizeWhy(G, asg, outcome) {
    var gm = G && G._gm;
    if (!gm) return 'Career office processed your file.';
    if (outcome.kind === 'fired' || gm.fired) return 'Ownership dismissed you — job security hit zero or probation ended badly.';
    var conf = gm.confidence != null ? Math.round(gm.confidence) : 0;
    if (outcome.kind === 'promoted')
      return (
        'Finished the contract at ' +
        conf +
        '% confidence — above the promotion bar (' +
        asg.successThreshold +
        ') with a sustainable review pattern.'
      );
    if (outcome.kind === 'lateral')
      return (
        'Met expectations through the contract (' +
        conf +
        '%) — above survival (' +
        asg.survivalThreshold +
        ') but not enough for a step up.'
      );
    return (
      'Contract ended at ' +
      conf +
      '% — below the survival threshold (' +
      asg.survivalThreshold +
      ') without termination, so you are reassigned downward.'
    );
  }

  function evaluateAssignmentEnd(G, asg) {
    if (!G || G._campaignOutcomeRecorded) return null;
    var gm = G && G._gm;
    var fired = !!(gm && gm.fired);
    var conf = gm && gm.confidence != null ? gm.confidence : 0;
    var contractDone = gm && gm.closedPeriods != null && gm.closedPeriods >= (asg.contractLengthPeriods || 16);

    if (!fired && !contractDone) return null;

    var kind;
    if (fired) {
      kind = 'fired';
    } else if (conf >= asg.successThreshold) {
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
      repDelta = 14;
      st.promotionCount++;
    } else if (kind === 'lateral') {
      repDelta = 4;
      st.lateralCount++;
    } else if (kind === 'demoted') {
      repDelta = -6;
      st.demotionCount++;
    } else {
      repDelta = -14;
      st.firingCount++;
    }
    st.reputation = Math.max(0, Math.min(100, repBefore + repDelta));
    st.completedAssignments++;

    var tierBefore = asg.tier | 0;
    var campaignWin = tierBefore === 5 && !fired && contractDone && conf >= asg.successThreshold;

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

    if (kind === 'fired' && tierBefore <= 1 && st.firingCount >= 2 && st.reputation < 28) {
      st.active = false;
    }

    var entry = {
      tier: tierBefore,
      marketId: asg.marketId,
      assignmentId: asg.id,
      result: campaignWin ? 'won' : kind,
      confidence: Math.round(conf),
      year: G.year,
      period: G.period,
      reputationAfter: st.reputation,
    };
    st.history.push(entry);
    if (st.history.length > 24) st.history = st.history.slice(-24);

    var standing = careerStandingLabel(kind, repDelta);

    G._campaignOutcomeRecorded = true;
    delete G.campaignAssignment;
    G.careerCampaign = false;

    return {
      kind: kind,
      campaignWin: campaignWin,
      repDelta: repDelta,
      reputation: st.reputation,
      standing: standing,
      why: summarizeWhy(G, asg, { kind: kind }),
      tierBefore: tierBefore,
      nextTier: nextTier,
      nextAssignment: nextAsg,
      careerEndedHard: st.active === false && !campaignWin,
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
    };
    G.sc.gmMode = true;
    G.sc.gmOwnerArchetype = asg.ownerArchetype;
    var base = (G.sc.gmConfig && typeof G.sc.gmConfig === 'object' ? G.sc.gmConfig : {}) || {};
    G.sc.gmConfig = Object.assign({}, base, asg.gmConfig || {});
    var cm = asg.cashMult != null ? asg.cashMult : 1;
    if (typeof G.cash === 'number') G.cash = Math.max(0, Math.round(G.cash * cm));
    if (typeof wlGmMode !== 'undefined' && wlGmMode.initGmStateForGame) wlGmMode.initGmStateForGame(G);
    var st = ensureState();
    if (st.active) st.currentTier = asg.tier | 0;
  }

  function deactivateCampaign() {
    state = null;
  }

  function getPayloadForSave() {
    var st = state;
    if (!st || st.v !== 1) return null;
    if (st.active || st.campaignWon || (st.completedAssignments | 0) > 0 || (st.firingCount | 0) > 0) {
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
    if (!G || !G.campaignAssignment) return;
    var st = ensureState();
    st.active = true;
    st.currentTier = G.campaignAssignment.tier | 0;
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

    var nextLine = payload.campaignWin
      ? 'You have cleared the GM career ladder. Start a new career anytime from scenario select.'
      : payload.careerEndedHard
        ? 'Career mode ended after repeated setbacks at the bottom of the ladder.'
        : 'Next: ' +
          (next && next.title ? next.title : 'GM') +
          ' in ' +
          (global.MARKETS && global.MARKETS[next.marketId] ? global.MARKETS[next.marketId].label : next.marketId) +
          ' (Tier ' +
          next.tier +
          ').';

    var standing =
      payload.standing === 'rising'
        ? 'Rising'
        : payload.standing === 'damaged'
          ? 'Damaged'
          : 'Stable';

    b.innerHTML =
      '<div class="ms2">' +
      '<div class="msh">ASSIGNMENT RESULT</div>' +
      '<div class="sr"><span class="lb">Outcome</span><span class="vl">' +
      esc(resultLabel) +
      '</span></div>' +
      '<div class="sr"><span class="lb">Why</span><span class="vl" style="font-size:15px;line-height:1.45">' +
      esc(payload.why) +
      '</span></div>' +
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

  function startNextAssignment() {
    if (global.MP && global.MP.mode === 'live') return;
    var st = ensureState();
    var al = st.awaitingLaunch;
    if (!al || !al.nextAssignment) return;
    var asg = al.nextAssignment;
    st.awaitingLaunch = null;
    global._wlCampaignStarting = true;
    try {
      var mid = asg.marketId;
      global.ACTIVE_MARKET = mid;
      global._selectedMarket = mid;
      if (typeof global.syncMarketPopToMarket === 'function') global.syncMarketPopToMarket(mid);
      var companyName = '';
      var mktLbl =
        global.MARKETS && global.MARKETS[mid] ? global.MARKETS[mid].label : mid;
      companyName = mktLbl + ' Broadcasting Group';
      if (typeof global.genMarket === 'function') {
        global.G = global.genMarket('gm_under');
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
        if (typeof global.renderAll === 'function') global.renderAll();
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

  function startNewCareer() {
    if (global.MP && global.MP.mode === 'live') {
      if (typeof global.showToast === 'function') global.showToast('GM Career is available in solo play only.', 'info');
      return;
    }
    state = defaultState();
    state.active = true;
    var asg = pickAssignmentForTier(1, state);
    state.awaitingLaunch = null;
    global._wlCampaignStarting = true;
    try {
      global.ACTIVE_MARKET = asg.marketId;
      global._selectedMarket = asg.marketId;
      if (typeof global.syncMarketPopToMarket === 'function') global.syncMarketPopToMarket(asg.marketId);
      var mktLbl =
        global.MARKETS && global.MARKETS[asg.marketId]
          ? global.MARKETS[asg.marketId].label
          : asg.marketId;
      var companyName = mktLbl + ' Broadcasting Group';
      if (typeof global.genMarket === 'function') {
        global.G = global.genMarket('gm_under');
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
        if (typeof global.renderAll === 'function') global.renderAll();
        if (typeof global.queuePlayerTalentPortraits === 'function')
          global.queuePlayerTalentPortraits();
        if (typeof global.queueAutoLogosForPlayerStations === 'function')
          global.queueAutoLogosForPlayerStations();
        if (typeof global.cm === 'function') global.cm('m-scen');
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
      (global.G && global.G.campaignAssignment) || pickAssignmentForTier(st.currentTier || 1, st);
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

  global.wlCampaign = {
    LADDER: LADDER,
    ensureState: ensureState,
    pickAssignmentForTier: pickAssignmentForTier,
    applyAssignmentToGame: applyAssignmentToGame,
    deactivateCampaign: deactivateCampaign,
    getPayloadForSave: getPayloadForSave,
    loadPayloadFromSave: loadPayloadFromSave,
    onPeriodClose: onPeriodClose,
    afterRenderAll: afterRenderAll,
    startNewCareer: startNewCareer,
    startNextAssignment: startNextAssignment,
    renderCampaignModal: renderCampaignModal,
    evaluateAssignmentEnd: evaluateAssignmentEnd,
    syncFromGame: syncFromGame,
  };

  global.wlCampaignStartNextAssignment = startNextAssignment;
  global.wlCampaignGetPayloadForSave = getPayloadForSave;
  global.wlCampaignLoadFromSave = loadPayloadFromSave;
  global.wlCampaignSyncFromGame = syncFromGame;
  global.wlCampaignDeactivate = deactivateCampaign;
  global.wlCampaignAfterRenderAll = afterRenderAll;
  global.wlCampaignOnPeriodClose = onPeriodClose;
})(typeof window !== 'undefined' ? window : globalThis);
