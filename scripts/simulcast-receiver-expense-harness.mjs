#!/usr/bin/env node
/**
 * Simulcast programming receiver expense harness (read-only scenarios on genMarketMP).
 * Uses calcRev on all stations (no seedRev pool normalization) so follower vs standalone % is comparable.
 *
 *   node scripts/simulcast-receiver-expense-harness.mjs
 */
/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

const noop = () => {};
function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    style: {},
    addEventListener: noop,
    removeEventListener: noop,
    click: noop,
  };
}
const documentStub = {
  readyState: 'complete',
  getElementById(id) {
    if (id === 'abtn') return stubEl();
    return null;
  },
  querySelectorAll: () => [],
  body: { innerHTML: '', appendChild: noop, contains: () => false },
  head: { appendChild: noop },
  addEventListener: noop,
  removeEventListener: noop,
  createElement() {
    return stubEl();
  },
};

function loadLegacySrc() {
  let src = fs.readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  return src;
}

function createCtx() {
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error },
    __WL_HEADLESS__: true,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    Symbol,
    Proxy,
    Reflect,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Int8Array,
    Uint8Array,
    Buffer,
    Promise,
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval: () => 0,
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.document = documentStub;
  ctx.localStorage = { getItem() { return null; }, setItem: noop, removeItem: noop };
  ctx.sessionStorage = { getItem: noop, setItem: noop };
  ctx.location = { reload: noop, search: '', href: 'http://127.0.0.1/' };
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus: noop, action: noop, emit: noop };
  ctx.alert = noop;
  ctx.fetch = null;
  ctx.btoa = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  ctx.atob = (s) => Buffer.from(String(s), 'base64').toString('utf8');
  return ctx;
}

const harnessJs = `
(function () {
  function pickAmFm(G) {
    var comm = (G.stations || []).filter(function (s) {
      return s && !s._bpSlotDeferred && !stationIsNoncommercialInstitutional(s);
    });
    var am = comm.find(function (s) {
      return s.sig && s.sig.type === 'AM' && !s.fmBooster;
    });
    var fm = comm.find(function (s) {
      return s.sig && s.sig.type === 'FM' && !s.fmBooster && am && s.id !== am.id;
    });
    if (!am || !fm) throw new Error('harness: need one AM and one FM commercial station');
    return { am: am, fm: fm, comm: comm };
  }

  function resetPlayers(G, am, fm) {
    (G.stations || []).forEach(function (s) {
      if (s) s.isPlayer = false;
    });
    am.isPlayer = true;
    fm.isPlayer = true;
    am._mpOwner = 0;
    fm._mpOwner = 0;
    G.ps = [am, fm];
  }

  function clearSimulcastLinks(am, fm) {
    breakSimulcast(G, am.id);
    breakSimulcast(G, fm.id);
    am.simulcastWith = null;
    fm.simulcastWith = null;
    delete am.simulcastSourceStationId;
    delete fm.simulcastSourceStationId;
    delete am._simulcastSource;
    delete fm._simulcastSource;
  }

  function pinShare(st, sh) {
    st.rat = st.rat || {};
    st.rat.share = sh;
    var cur = {};
    var cohorts = COH || ['m2554'];
    for (var i = 0; i < cohorts.length; i++) {
      var c = cohorts[i];
      cur[c] = { aqh: Math.round(sh * 50000), share: sh };
    }
    st.rat.cur = cur;
    st.rat.aqh = cohorts.reduce(function (sum, c) {
      return sum + (cur[c] && cur[c].aqh ? cur[c].aqh : 0);
    }, 0);
  }

  function ensureOps(st) {
    if (!st.ops) st.ops = { spots: 14, sell: 0.62, promo: 12000, progBudget: 8000 };
  }

  function finRow(st, G) {
    var f = st.fin || {};
    return {
      call: st.callLetters,
      sig: (st.sig && st.sig.type) + ' ' + (st.sig && st.sig.pw),
      isProgRcv: isSimulcastProgrammingReceiver(st, G),
      rev: f.rev,
      cost: f.cost,
      ebitda: f.ebitda,
      fix: f.fix,
      tal: f.tal,
      salesAdmin: f.salesAdmin,
      opsFloor: f.opsFloor,
      effPromo: f.effPromo,
      effProg: f.effProg,
      syndicationRights: f.syndicationRights,
      identityStored: st.identityBudget || 0,
      identityPnl: stationIdentityBudgetPnlContribution(st, G),
    };
  }

  /** calcRev-only cost if follower were not an explicit programming receiver (same G.ps cluster). */
  function syntheticStandaloneCalcRevCost(follower, G) {
    var sid = follower.simulcastSourceStationId;
    delete follower.simulcastSourceStationId;
    delete follower._simulcastSource;
    calcRev(follower, G);
    var c = follower.fin.cost;
    follower.simulcastSourceStationId = sid;
    follower._simulcastSource = false;
    calcRev(follower, G);
    return c;
  }

  function runCase(name, linkFn) {
    G = genMarketMP('1970');
    if (typeof window !== 'undefined') window.__WL_SHARE_INSPECT_ONLY = true;
    var picked = pickAmFm(G);
    var am = picked.am;
    var fm = picked.fm;
    resetPlayers(G, am, fm);
    clearSimulcastLinks(am, fm);
    pinShare(am, 0.072);
    pinShare(fm, 0.048);
    ensureOps(am);
    ensureOps(fm);
    fm.identityBudget = 40000;
    am.identityBudget = 0;
    var role = linkFn(am, fm);
    (G.stations || []).forEach(function (s) {
      if (s && !s._bpSlotDeferred) calcRev(s, G);
    });
    var srcLeg = role.src;
    var folLeg = role.fol;
    var pct = null;
    if (folLeg && isSimulcastProgrammingReceiver(folLeg, G)) {
      var linkedCost = folLeg.fin.cost;
      var stand = syntheticStandaloneCalcRevCost(folLeg, G);
      (G.stations || []).forEach(function (s) {
        if (s && !s._bpSlotDeferred) calcRev(s, G);
      });
      pct = stand > 0 ? Math.round((linkedCost / stand) * 1000) / 10 : null;
    }
    var row = {
      name: name,
      simulcastPolicyOnFollower: folLeg ? simulcastReceiverExpensePolicy(folLeg, G) : null,
      followerCostPctOfStandalone_calcRevOnly: pct,
    };
    if (name.indexOf('3_') === 0 || name.indexOf('4_') === 0) {
      row.stationA = finRow(am, G);
      row.stationB = finRow(fm, G);
    } else {
      row.source = finRow(srcLeg, G);
      row.follower = finRow(folLeg, G);
    }
    return row;
  }

  var out = [];
  out.push(
    runCase('1_am_source_fm_receiver', function (am, fm) {
      applySimulcastPair(am.id, fm.id, { suppressNews: true });
      return { src: am, fol: fm };
    })
  );
  out.push(
    runCase('2_fm_source_am_receiver', function (am, fm) {
      applySimulcastPair(fm.id, am.id, { suppressNews: true });
      return { src: fm, fol: am };
    })
  );
  out.push(
    runCase('3_two_station_cluster_no_simulcast', function (am, fm) {
      clearSimulcastLinks(am, fm);
      return { src: am, fol: fm };
    })
  );
  out.push(
    runCase('4_legacy_mutual_simulcastWith_unflagged', function (am, fm) {
      clearSimulcastLinks(am, fm);
      am.simulcastWith = fm.id;
      fm.simulcastWith = am.id;
      delete am._simulcastSource;
      delete fm._simulcastSource;
      delete am.simulcastSourceStationId;
      delete fm.simulcastSourceStationId;
      return { src: am, fol: fm };
    })
  );

  return out;
})()
`;

function main() {
  const ctx = createCtx();
  injectMarketEcologyIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx);
  const rows = vm.runInContext(harnessJs, ctx);
  console.log(JSON.stringify(rows, null, 2));
}

main();
