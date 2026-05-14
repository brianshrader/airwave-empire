#!/usr/bin/env node
/**
 * Read-only audit: cold snapshot 2026 (under) for Seattle + New York vs career @2026.
 * Does not modify legacy.js. Uses same VM bootstrap as validate-public-nce-tier.mjs.
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function loadLegacySrc() {
  let src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  return injectHeadlessMegaFragNewsGuard(src);
}

function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    closest() { return null; },
  };
}

const documentStub = {
  body: { innerHTML: '' },
  head: { appendChild() {} },
  createElement() { return { href: '', download: '', click() {} }; },
  getElementById() { return stubEl(); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function createVmContext() {
  const noop = () => {};
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error, table: noop },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = Math.floor(Math.random() * 256);
        return typedArray;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      },
    },
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
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

const AUDIT_BOOT = `
(function () {
  var _origApply = applyModernColdStartCommercialIncumbentConcentration;
  applyModernColdStartCommercialIncumbentConcentration = function (stations, startYear, marketId, mockGCtx) {
    window.__auditLastIncumbentPick = null;
    _origApply(stations, startYear, marketId, mockGCtx);
    window.__auditLastIncumbentPick = (stations || [])
      .filter(function (s) { return s && s._modernColdIncumbentSeedW; })
      .map(function (s) {
        return { id: s.id, call: s.callLetters, format: s.format, str: s.str, w: s._modernColdIncumbentSeedW };
      });
  };

  window.__auditColdSnapshot2026 = function (marketId, seed) {
    window.__PUBLIC_RADIO_TUNING__ = 'tuned';
    var origR = Math.random;
    var s = seed >>> 0;
    Math.random = function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    var ui = window._harnessPatchTimersAndUi();
    try {
      ACTIVE_MARKET = marketId;
      syncMarketPopToMarket(marketId);
      var scU = SC.find(function (x) { return x.id === 'under'; });
      if (!scU) return { ok: false, error: 'no under scenario' };
      var prevSY = scU.startYear;
      var prevIdx = scU.idx;
      scU.startYear = 2026;
      var Glocal = genMarket('under');
      scU.startYear = prevSY;
      scU.idx = prevIdx;
      var G = Glocal;
      var news = null;
      for (var i = 0; i < G.stations.length; i++) {
        var st = G.stations[i];
        if (st && st.isPublic && st.format === 'PUBLIC_NEWS') news = st;
      }
      var rk = rankStationsByShareCompetition(G.stations);
      var list = G.stations
        .filter(function (x) { return x && !x._bpSlotDeferred && x.rat; })
        .map(function (x) {
          return {
            fmt: x.isPublic ? 'PUBLIC:' + x.format : x.format,
            sh: x.rat.share || 0,
            id: x.id,
            call: x.callLetters,
          };
        })
        .sort(function (a, b) { return b.sh - a.sh; });
      var top5 = list.slice(0, 5);
      var comm = G.stations.filter(function (x) {
        return x && !x._bpSlotDeferred && !stationIsNoncommercialInstitutional(x) && !x.isPublic;
      });
      var leader = null;
      var mx = 0;
      for (var j = 0; j < comm.length; j++) {
        var c = comm[j];
        var shc = (c.rat && c.rat.share) || 0;
        if (shc > mx) {
          mx = shc;
          leader = c;
        }
      }
      var pubSt = G.stations.filter(function (x) { return x && x.isPublic && !x._bpSlotDeferred; });
      var pubFormats = pubSt.map(function (x) { return x.format; });
      var totPub = pubSt.reduce(function (a, x) { return a + ((x.rat && x.rat.share) || 0); }, 0);
      var Gmini = { year: 2026, marketId: marketId, stations: G.stations, period: 1, turn: G.turn };
      var habit = news ? publicNewsHabitEngageMult(news, Gmini) : null;
      var eduM = news ? publicEduAudienceMultiplier(news, Gmini) : null;
      var insul = news ? publicNewsCompetitionInsulationFactor(news, Gmini) : null;
      var hiEdu = news ? publicNewsHighEduBreakoutMult(news, Gmini) : null;
      var mkt = MARKETS[marketId] || {};
      var tgtPub = computePublicStationTargetCount(marketId, 2026);
      return {
        ok: true,
        marketId: marketId,
        seed: seed,
        eduIndex: mkt.eduIndex,
        publicCivicIndex: mkt.publicCivicIndex,
        rankTier: mkt.rankTier,
        newsTierStored: news ? news._nceTier : null,
        newsTierEffect: news ? publicNceTierEffect(news) : null,
        targetPublicCount2026: tgtPub,
        publicStationCount: pubSt.length,
        publicFormats: pubFormats,
        newsShare: news ? news.rat.share : null,
        newsRank: news ? rk.rankById[news.id] : null,
        totPub: totPub,
        habit: habit,
        eduM: eduM,
        insul: insul,
        hiEdu: hiEdu,
        top5: top5,
        leaderFmt: leader ? leader.format : null,
        leaderShare: leader ? leader.rat.share : null,
        leaderCall: leader ? leader.callLetters : null,
        incumbentPick: window.__auditLastIncumbentPick || [],
      };
    } finally {
      Math.random = origR;
      ui.restore();
    }
  };

  window.__auditCareer2026 = function (marketId, seed) {
    window.__PUBLIC_RADIO_TUNING__ = 'tuned';
    var origR = Math.random;
    var s = seed >>> 0;
    Math.random = function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    var ui = window._harnessPatchTimersAndUi();
    try {
      ACTIVE_MARKET = marketId;
      syncMarketPopToMarket(marketId);
      G = genMarketMP('1970');
      MP.mode = 'solo';
      MP.isHost = false;
      var adv = advanceGToYearPeriod(2026, 2, 22000);
      if (!adv.ok) return { ok: false, error: 'advance', at: adv.at, steps: adv.steps };
      var news = null;
      for (var i = 0; i < G.stations.length; i++) {
        var st = G.stations[i];
        if (st && st.isPublic && st.format === 'PUBLIC_NEWS') news = st;
      }
      if (news) assignPublicNceTierToStation(news, marketId, 2026);
      recalc(G.stations, G);
      var rk = rankStationsByShareCompetition(G.stations);
      var comm = G.stations.filter(function (x) {
        return x && !x._bpSlotDeferred && !stationIsNoncommercialInstitutional(x) && !x.isPublic;
      });
      var leader = null;
      var mx = 0;
      for (var j = 0; j < comm.length; j++) {
        var c = comm[j];
        var shc = (c.rat && c.rat.share) || 0;
        if (shc > mx) {
          mx = shc;
          leader = c;
        }
      }
      return {
        ok: true,
        marketId: marketId,
        seed: seed,
        newsShare: news ? news.rat.share : null,
        newsRank: news ? rk.rankById[news.id] : null,
        leaderFmt: leader ? leader.format : null,
        leaderShare: leader ? leader.rat.share : null,
        leaderCall: leader ? leader.callLetters : null,
        leaderStr: leader ? leader.str : null,
      };
    } finally {
      Math.random = origR;
      ui.restore();
    }
  };
})();
`;

function seedFor(mktIndex, r) {
  return (900000 + mktIndex * 104729 + r * 7919) >>> 0;
}

const MARKETS_AUDIT = ['seattle', 'newyork'];
/** Same order as validate-public-nce-tier.mjs DEFAULT_MARKETS for seedFor parity */
const MKT_INDEX = { seattle: 0, newyork: 1 };

function main() {
  const ctx = createVmContext();
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  vm.runInContext(AUDIT_BOOT, ctx);

  const nSeeds = 12;
  console.log('=== Market static (MARKETS) — Seattle vs New York ===\n');
  for (const mid of MARKETS_AUDIT) {
    const m = vm.runInContext(`MARKETS[${JSON.stringify(mid)}]`, ctx);
    console.log(mid, {
      rankTier: m.rankTier,
      eduIndex: m.eduIndex,
      publicCivicIndex: m.publicCivicIndex,
    });
  }

  console.log('\n=== Q1 — Public signal snapshot @ cold gen (PUBLIC_NEWS station, Gmini year=2026) ===');
  console.log('(Same multipliers apply in recalc; shown once per market using seed 0 row.)\n');

  for (const mid of MARKETS_AUDIT) {
    const ix = MKT_INDEX[mid];
    const d = vm.runInContext(`__auditColdSnapshot2026(${JSON.stringify(mid)}, ${seedFor(ix, 0)})`, ctx);
    console.log(mid, {
      eduIndex: d.eduIndex,
      publicCivicIndex: d.publicCivicIndex,
      newsTierStored: d.newsTierStored,
      newsTierEffect: d.newsTierEffect,
      targetPublicCount2026: d.targetPublicCount2026,
      publicStationCount: d.publicStationCount,
      publicFormats: d.publicFormats,
      publicNewsHabitEngageMult: d.habit,
      publicEduAudienceMultiplier: d.eduM,
      publicNewsCompetitionInsulationFactor: d.insul,
      publicNewsHighEduBreakoutMult: d.hiEdu,
    });
  }

  console.log('\n=== Q2 — Cold snapshot 2026 detail (' + nSeeds + ' seeds / market, tuned, normal under) ===\n');
  for (const mid of MARKETS_AUDIT) {
    const ix = MKT_INDEX[mid];
    const rows = [];
    for (let r = 0; r < nSeeds; r++) {
      rows.push(vm.runInContext(`__auditColdSnapshot2026(${JSON.stringify(mid)}, ${seedFor(ix, r)})`, ctx));
    }
    const newsR1 = rows.filter((x) => x.newsRank === 1).length;
    const fmtCount = {};
    const incFmt = {};
    for (const row of rows) {
      fmtCount[row.leaderFmt] = (fmtCount[row.leaderFmt] || 0) + 1;
      for (const p of row.incumbentPick || []) {
        const k = p.format;
        incFmt[k] = (incFmt[k] || 0) + 1;
      }
    }
    console.log('---', mid, '---');
    console.log('PUBLIC_NEWS rank #1 rate:', ((100 * newsR1) / nSeeds).toFixed(1) + '%');
    console.log('Commercial leader format histogram:', fmtCount);
    console.log('Incumbent-pick format histogram (slots × seeds):', incFmt);
    console.log('Sample row (seed 0):', JSON.stringify(rows[0], null, 2));
  }

  console.log('\n=== Q3 — Career @2026 (same seeds, tuned) ===\n');
  for (const mid of MARKETS_AUDIT) {
    const ix = MKT_INDEX[mid];
    const rows = [];
    for (let r = 0; r < nSeeds; r++) {
      rows.push(vm.runInContext(`__auditCareer2026(${JSON.stringify(mid)}, ${seedFor(ix, r)})`, ctx));
    }
    const fmtCount = {};
    for (const row of rows) {
      if (row.leaderFmt) fmtCount[row.leaderFmt] = (fmtCount[row.leaderFmt] || 0) + 1;
    }
    console.log('---', mid, '---');
    console.log('Commercial leader format histogram @ career 2026:', fmtCount);
    console.log('Sample career row (seed 0):', JSON.stringify(rows[0], null, 2));
  }

  console.log('\n=== Interpretation (read-only) ===');
  console.log(
    '- New York has the highest eduIndex (1.22) and publicCivicIndex (1.08) in this audit set; Seattle is also high (1.12 / 1.07).',
  );
  console.log(
    '- Compare computed publicEduAudienceMultiplier + habit + high-edu breakout on the printed rows vs Chicago/LA from prior harness: larger edu/civic ⇒ stronger public audience math (no formula edits in this audit).',
  );
  console.log(
    '- Incumbent histogram vs commercial-leader histogram shows whether boosts land on the eventual #1 commercial station or on a different format.',
  );
}

main();
