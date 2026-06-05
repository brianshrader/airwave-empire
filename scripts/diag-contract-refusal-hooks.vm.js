/**
 * Diagnostic-only hooks for contract refusal auditing (VM load after legacy.js).
 */
(function () {
  'use strict';

  function log(type, detail) {
    if (typeof G === 'undefined' || !G || !G._wlRefusalDiag) return;
    if (!G._wlRefusalEvents) G._wlRefusalEvents = [];
    G._wlRefusalEvents.push({
      type,
      year: G.year,
      period: G.period,
      marketId: G.marketId || null,
      ...(detail || {}),
    });
  }

  function snapPlayerTalents(Gopt) {
    const out = new Map();
    (Gopt.ps || []).forEach((s) => {
      if (!s?.isPlayer) return;
      Object.entries(s.prog || {}).forEach(([slot, sd]) => {
        if (!sd) return;
        const host = sd.talent;
        if (host?.id) {
          out.set(String(host.id), {
            stationId: s.id,
            call: s.callLetters || '',
            slot,
            isCoHost: false,
            cyr: host.cyr || 0,
            wantsExit: !!host._wantsExit,
            wantsExitReason: host._wantsExitReason || '',
            satisfaction: host._satisfaction | 0,
            morale: host.morale | 0,
            letExpire: !!host._letExpire,
          });
        }
        const ch = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
        if (ch?.id) {
          out.set(String(ch.id), {
            stationId: s.id,
            call: s.callLetters || '',
            slot,
            isCoHost: true,
            cyr: ch.cyr || 0,
            wantsExit: !!ch._wantsExit,
            wantsExitReason: ch._wantsExitReason || '',
            satisfaction: ch._satisfaction | 0,
            morale: ch.morale | 0,
            letExpire: !!ch._letExpire,
          });
        }
      });
    });
    return out;
  }

  if (typeof wlTalentRetention !== 'undefined' && wlTalentRetention.runPeriod) {
    const _origRunPeriod = wlTalentRetention.runPeriod.bind(wlTalentRetention);
    wlTalentRetention.runPeriod = function runPeriodWrapped(Gopt) {
      const before = snapPlayerTalents(Gopt);
      _origRunPeriod(Gopt);
      const after = snapPlayerTalents(Gopt);
      for (const [id, a] of after) {
        const b = before.get(id);
        if (!b) continue;
        if (!b.wantsExit && a.wantsExit) {
          log('exit_intent_set', {
            talentId: id,
            stationId: a.stationId,
            call: a.call,
            slot: a.slot,
            isCoHost: a.isCoHost,
            reason: a.wantsExitReason,
            satisfaction: a.satisfaction,
            morale: a.morale,
          });
        }
      }
    };
  }

  if (typeof wlTalentRetention !== 'undefined' && wlTalentRetention.contractModifiers) {
    const _origMods = wlTalentRetention.contractModifiers.bind(wlTalentRetention);
    wlTalentRetention.contractModifiers = function contractModifiersWrapped(s, t, isCoHost) {
      const rm = _origMods(s, t, isCoHost);
      log('contract_modifiers', {
        stationId: s?.id,
        call: s?.callLetters || '',
        isCoHost: !!isCoHost,
        satisfaction: rm.satisfaction,
        refuse3yr: !!rm.refuse3yr,
        wantsExit: !!t?._wantsExit,
        maxYears: rm.maxYears,
      });
      return rm;
    };
  }

  if (typeof doExtend === 'function') {
    const _origExtend = doExtend;
    globalThis.doExtend = function doExtendWrapped(sid, slot, years, newSalary, talentRole, fromManageTalent) {
      const s = G?.stations?.find((st) => st.id === sid);
      const sd = s?.prog?.[slot];
      const role = talentRole === 'cohost' ? 'cohost' : 'host';
      const t = role === 'cohost' && sd && typeof slotTalentB === 'function' ? slotTalentB(sd) : sd?.talent;
      const refused = t && typeof wlTalentHasExitIntent === 'function' && wlTalentHasExitIntent(t);
      log('extend_attempt', {
        stationId: sid,
        call: s?.callLetters || '',
        slot,
        years,
        newSalary,
        talentRole: role,
        refused: !!refused,
        wantsExitReason: t?._wantsExitReason || '',
        satisfaction: t?._satisfaction | 0,
        cyr: t?.cyr || 0,
      });
      return _origExtend(sid, slot, years, newSalary, talentRole, fromManageTalent);
    };
  }

  globalThis.__wlRefusalSnapPlayerTalents = snapPlayerTalents;
  globalThis.__wlRefusalLog = log;
})();
