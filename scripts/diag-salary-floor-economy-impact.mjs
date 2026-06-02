#!/usr/bin/env node
/**
 * Salary floor v2-C economy impact harness (read-only regression).
 *
 *   node scripts/diag-salary-floor-economy-impact.mjs
 *   npm run diag:salary-floor-economy
 *
 * Compares legacy / v1 / v2-C floor variants on representative station clusters,
 * models depressed incumbent saves, and simulates cash after period closes.
 */
/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const outJson = path.join(root, 'tmp', 'salary_floor_economy_impact.json');

function stubEl() {
  return { disabled: false, addEventListener() {}, click() {} };
}

function createCtx() {
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error: console.error },
    __WL_HEADLESS__: true,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Buffer,
    Promise,
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval: () => 0,
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.document = {
    readyState: 'complete',
    getElementById(id) {
      return id === 'abtn' ? stubEl() : null;
    },
    querySelectorAll: () => [],
    body: {},
    head: {},
    addEventListener() {},
  };
  ctx.localStorage = { getItem: () => null, setItem() {} };
  ctx.MP = { mode: 'solo', playerId: 0, action() {}, emit() {} };
  ctx.addEventListener = () => {};
  return ctx;
}

const RUNNER = `
(function(cfg){
  const VARIANTS = ['legacy', 'v1', 'v2c'];
  const MARKET_YEARS = cfg.marketYears;
  const SCENARIO_DEFS = cfg.scenarios;
  const DEPRESSION_DEFS = cfg.depressions;
  const CASH_PERIODS = [1, 2, 4, 8];
  const DANGER_CASH_FRAC = 0.22;

  const LINEUPS = {
    leader: [
      ['morningDrive', 90], ['midday', 78], ['afternoonDrive', 62], ['overnight', 45],
    ],
    middle: [
      ['morningDrive', 72], ['midday', 62], ['afternoonDrive', 55],
    ],
    weak: [
      ['morningDrive', 58], ['midday', 52], ['afternoonDrive', 48], ['overnight', 42],
    ],
  };

  function makeRatFromShare(totalShare){
    const cur = {};
    const mom = {};
    const per = totalShare / COH.length;
    COH.forEach(function(c){
      cur[c] = { share: per, aqh: Math.round(per * 120000) };
      mom[c] = { cur: per, tgt: per };
    });
    return {
      share: totalShare,
      aqh: Math.round(totalShare * 800000),
      cur: cur,
      mom: mom,
    };
  }

  function floorCore(slot, tq, marketId, year, st, variant){
    const tier = tq < 42 ? 'entry' : tq < 68 ? 'mid' : 'star';
    const flBoost = 1 + (marketRankTierOnAirPayMult(marketId) - 1) * 0.58;
    if(variant === 'legacy'){
      return Math.round(salInfl((SAL[slot]?.[tier]?.[0] || 5000), year) * 0.60 * flBoost / 500) * 500;
    }
    const v = variant === 'v1' ? 'v1' : 'v2c';
    return incumbentSalaryFloorAnnual(slot, tq, marketId, year, st, { variant: v });
  }

  function applyFloorsToStation(st, G, variant){
    const vtLd = 0;
    Object.entries(st.prog || {}).forEach(function([sl, sd]){
      if(!sd?.talent) return;
      if(G.period === 2){
        const stShare = st.rat?.share || 0;
        const baseInfl = talentFallBaseInflationForMarket(G.year, G.marketId || ACTIVE_MARKET);
        const tqMerit = talentTrueQuality(sd.talent);
        const merit = tqMerit > 85 ? 0.008 : tqMerit > 72 ? 0.004 : 0.001;
        const perf = talentFallPerfPressureFromShare(stShare, G.marketId || ACTIVE_MARKET);
        const levHost = talentRenewalLeverage01(st, sl, sd.talent, false);
        const levSal = levHost >= 0.44 ? 0.0052 : levHost >= 0.36 ? 0.0036 : levHost >= 0.30 ? 0.0022 : levHost >= 0.26 ? 0.0011 : 0;
        const moraleMod = sd.talent.morale < 50 ? 0.004 : sd.talent.morale > 80 ? -0.002 : 0;
        const vtSal = Math.min(0.028, vtLd * 0.021);
        sd.talent.salary = Math.round(sd.talent.salary * (1 + baseInfl + merit + perf + moraleMod + vtSal + levSal) / 500) * 500;
        const [capElHost, floorElHost] = eliteTalentIncumbentPremiumMults(sd.talent, sl, stShare);
        const tenureYrs = G.year - (sd.talent._hireYear || G.year);
        const tenurePrem = Math.min(0.10, Math.max(0, tenureYrs - 10) * 0.01);
        const flCore = floorCore(sl, tqMerit, G.marketId || ACTIVE_MARKET, G.year, st, variant);
        const floor = Math.round(flCore * (1 + tenurePrem) * floorElHost / 500) * 500;
        if(sd.talent.salary < floor) sd.talent.salary = floor;
        const slotBx = Math.round(slotStarMaxBaseForDaypart(sd.talent.slot || sl) * marketRankTierOnAirPayMult(G.marketId || ACTIVE_MARKET));
        const tenureCapMult = 1.00 + Math.min(0.18, Math.max(0, tenureYrs - 12) * 0.012);
        const mktCap = Math.round(salInfl(slotBx, G.year) * tenureCapMult * capElHost / 500) * 500;
        if(sd.talent.salary > mktCap) sd.talent.salary = mktCap;
      }
      const tqFloor = talentTrueQuality(sd.talent);
      const tenYrs2 = G.year - (sd.talent._hireYear || G.year);
      const tenPrem2 = Math.min(0.10, Math.max(0, tenYrs2 - 10) * 0.01);
      const [_ceh, floorElHard] = eliteTalentIncumbentPremiumMults(sd.talent, sl, st.rat?.share || 0);
      const flCore2 = floorCore(sl, tqFloor, G.marketId || ACTIVE_MARKET, G.year, st, variant);
      const hardFloor = Math.round(flCore2 * (1 + tenPrem2) * floorElHard / 500) * 500;
      if(sd.talent.salary < hardFloor) sd.talent.salary = hardFloor;
    });
  }

  function annualTalentPayroll(st){
    let tot = 0;
    Object.values(st.prog || {}).forEach(function(sd){
      if(sd?.talent){
        const v = Number(sd.talent.salary);
        if(Number.isFinite(v)) tot += v;
      }
      const b = typeof slotTalentB === 'function' ? slotTalentB(sd) : null;
      if(b){
        const v2 = Number(b.salary);
        if(Number.isFinite(v2)) tot += v2;
      }
    });
    return tot;
  }

  function halfPeriodTalentPayroll(st){
    return Object.values(st.prog || {}).filter(function(sl){ return sl?.talent; })
      .reduce(function(sum, sl){ return sum + payrollHalfPeriodForDaypartSlot(sl); }, 0);
  }

  function makePeerStation(id, share){
    const rat = makeRatFromShare(share);
    return {
      id: id,
      callLetters: 'PEER' + id,
      format: 'ADULT_CONTEMP',
      isPlayer: false,
      isPublic: false,
      _bpSlotDeferred: false,
      sig: { type: 'FM', pw: '50kw' },
      rat: rat,
      mom: rat.mom,
      ops: { sell: 0.55, spots: 12, promo: 18000, progBudget: 8000 },
      salesForce: { level: 1 },
      prog: {
        morningDrive: { talent: null, quality: 45 },
        midday: { talent: null, quality: 40 },
        afternoonDrive: { talent: null, quality: 40 },
        evening: { talent: null, quality: 35 },
        overnight: { talent: null, quality: 30 },
      },
      oq: 55,
      fin: { rev: 0, cost: 0, ebitda: 0, tal: 0 },
    };
  }

  function makePlayerStation(id, share, lineupKey, marketId, year, depression){
    const lineup = LINEUPS[lineupKey] || LINEUPS.leader;
    const ratPack = makeRatFromShare(share);
    const st = {
      id: id,
      callLetters: 'P' + id,
      format: 'ADULT_CONTEMP',
      isPlayer: true,
      isPublic: false,
      _bpSlotDeferred: false,
      fmBooster: false,
      sig: { type: 'FM', pw: '100kw', reach: 1, universe: 1 },
      rat: ratPack,
      mom: ratPack.mom,
      ops: { sell: 0.62, spots: 13, promo: 42000, progBudget: 18000 },
      salesForce: { level: 2 },
      prog: {},
      oq: 78,
      pers: { pt: 0.05, rs: 0.08, tr: 0.5, ms: 0.04, ag: 0.05 },
      cp: { dq: 0 },
      fin: { rev: 0, cost: 0, ebitda: 0, tal: 0 },
      _hireYearBase: year - 8,
    };
    const usedNames = { usedLastNames: new Set(), usedFullNames: new Set() };
    lineup.forEach(function([slot, trueQ]){
      const tier = trueQ < 42 ? 'entry' : trueQ < 68 ? 'mid' : 'star';
      const t = mkTal(slot, 'ADULT_CONTEMP', tier, year, usedNames, {
        stationBookPayMult: typeof stationBookStrengthPayMult === 'function' ? stationBookStrengthPayMult(st, slot) : 1,
      });
      if(!t) return;
      t._trueQuality = trueQ;
      t.quality = Math.min(97, trueQ + 2);
      t._hireYear = year - 8;
      t.periodsAtStation = 16;
      t.morale = 62;
      t.cyr = 2;
      applyDepressionSalary(t, slot, trueQ, marketId, year, st, depression);
      st.prog[slot] = { talent: t, quality: Math.min(95, trueQ + 5) };
    });
    return st;
  }

  function applyDepressionSalary(t, slot, trueQ, marketId, year, st, depression){
    const tq = trueQ;
    const legFl = floorCore(slot, tq, marketId, year, st, 'legacy');
    if(depression === 'all18500'){
      t.salary = Math.min(Number(t.salary) || 0, 18500);
    }else if(depression === 'legacy60'){
      t.salary = Math.min(Number(t.salary) || 0, Math.round(legFl * 0.60 / 500) * 500);
    }else if(depression === 'mixed'){
      const slotDep = slot === 'midday' || slot === 'overnight' ? 'all18500' : 'legacy60';
      applyDepressionSalary(t, slot, trueQ, marketId, year, st, slotDep);
    }
  }

  function buildMarketG(marketId, year, playerStations){
    ACTIVE_MARKET = marketId;
    syncMarketPopToMarket(marketId);
    const startCash = scaledScenarioCash(450000, marketId, year);
    G = {
      marketId: marketId,
      year: year,
      period: 2,
      turn: 96,
      stations: [],
      ps: playerStations,
      news: [],
      adx: 1.0,
      streamDrag: 1.0,
      cash: startCash,
      _wlHarnessDeterministic: true,
      score: { isSandbox: true },
    };
    const peerShares = [0.112, 0.098, 0.088, 0.076, 0.068, 0.059, 0.051, 0.044, 0.039, 0.033];
    peerShares.forEach(function(sh, i){
      G.stations.push(makePeerStation('peer-' + marketId + '-' + i, sh));
    });
    playerStations.forEach(function(s){
      s.isPlayer = true;
      G.stations.push(s);
    });
    return G;
  }

  function refreshEconomics(G){
    seedRev(G.stations, G);
    G.stations.forEach(function(s){
      if(s && !s._bpSlotDeferred) calcRev(s, G);
    });
  }

  function snapshotCluster(playerStns, G){
    let rev = 0, ebitda = 0, talAnnual = 0, talHalf = 0, neg = 0;
    playerStns.forEach(function(s){
      rev += s.fin?.rev || 0;
      ebitda += s.fin?.ebitda || 0;
      talAnnual += annualTalentPayroll(s);
      talHalf += halfPeriodTalentPayroll(s);
      if((s.fin?.ebitda || 0) < 0) neg++;
    });
    const payPct = rev > 0 ? talAnnual / (rev * 2) : null;
    return {
      rev: Math.round(rev),
      ebitda: Math.round(ebitda),
      talAnnual: Math.round(talAnnual),
      talHalfPeriod: Math.round(talHalf),
      payPctRev: payPct != null ? Math.round(payPct * 1000) / 1000 : null,
      negStations: neg,
    };
  }

  function simulateCashHorizon(G, playerStns, variant, maxPeriod){
    const startCash = G.cash;
    const cashByPeriod = { 0: startCash };
    let negCount = 0;
    let dangerCount = 0;
    const g = G;
    const stClone = playerStns;
    for(let step = 1; step <= maxPeriod; step++){
      refreshEconomics(g);
      const profit = stClone.reduce(function(a, s){ return a + (s.fin?.ebitda || 0); }, 0);
      g.cash += profit;
      stClone.forEach(function(s){ applyFloorsToStation(s, g, variant); });
      refreshEconomics(g);
      cashByPeriod[step] = Math.round(g.cash);
      const clusterRev = stClone.reduce(function(a, s){ return a + (s.fin?.rev || 0); }, 0);
      const dangerLine = Math.max(50000, clusterRev * DANGER_CASH_FRAC);
      if(g.cash < 0) negCount++;
      if(g.cash < dangerLine) dangerCount++;
      if(g.period === 1){ g.period = 2; }else{ g.period = 1; g.year++; }
      g.turn++;
    }
    return { cashByPeriod, negPeriods: negCount, dangerPeriods: dangerCount, startCash: startCash };
  }

  function cloneTalentForVariant(orig){
    if(!orig) return null;
    const t = Object.assign(Object.create(Object.getPrototypeOf(orig) || null), orig);
    t.salary = Number(orig.salary) || 0;
    return t;
  }

  function runCase(marketId, year, scenDef, depression){
    const playerStns = scenDef.shares.map(function(sh, i){
      const lineupKey = (scenDef.lineupKeys && scenDef.lineupKeys[i])
        || scenDef.lineupKey
        || (sh >= 0.09 ? 'leader' : sh >= 0.055 ? 'middle' : 'weak');
      return makePlayerStation(
        scenDef.id + '-' + i,
        sh,
        lineupKey,
        marketId,
        year,
        depression,
      );
    });
    const baseG = buildMarketG(marketId, year, playerStns);
    refreshEconomics(baseG);
    const before = snapshotCluster(playerStns, baseG);
    const variantResults = {};
    VARIANTS.forEach(function(variant){
      const stCopy = playerStns.map(function(s){
        return JSON.parse(JSON.stringify(s));
      });
      stCopy.forEach(function(s, idx){
        Object.keys(s.prog || {}).forEach(function(sl){
          const orig = playerStns[idx].prog[sl]?.talent;
          if(orig && s.prog[sl]?.talent){
            s.prog[sl].talent = cloneTalentForVariant(orig);
          }
        });
      });
      const g = buildMarketG(marketId, year, stCopy);
      refreshEconomics(g);
      const preFloor = snapshotCluster(stCopy, g);
      stCopy.forEach(function(s){ applyFloorsToStation(s, g, variant); });
      refreshEconomics(g);
      const postFloor = snapshotCluster(stCopy, g);
      const cashSim = simulateCashHorizon(g, stCopy, variant, 8);
      variantResults[variant] = {
        preFloor: preFloor,
        postFloor: postFloor,
        payrollDelta: postFloor.talAnnual - preFloor.talAnnual,
        ebitdaDelta: postFloor.ebitda - preFloor.ebitda,
        cash: cashSim.cashByPeriod,
        negPeriods: cashSim.negPeriods,
        dangerPeriods: cashSim.dangerPeriods,
      };
    });
    return {
      marketId,
      year,
      scenario: scenDef.id,
      depression,
      beforeDepressionFloor: before,
      variants: variantResults,
    };
  }

  const results = [];
  Object.keys(MARKET_YEARS).forEach(function(marketId){
    MARKET_YEARS[marketId].forEach(function(year){
      SCENARIO_DEFS.forEach(function(scen){
        DEPRESSION_DEFS.forEach(function(dep){
          if(scen.id === 'acquired_legacy' && dep === 'none') return;
          results.push(runCase(marketId, year, scen, dep));
        });
      });
    });
  });

  const wichita2012LeaderMixed = results.find(function(r){
    return r.marketId === 'wichita' && r.year === 2012 && r.scenario === 'leader' && r.depression === 'mixed';
  });
  let md62FloorV2 = null;
  if(wichita2012LeaderMixed){
    const st = makePlayerStation('probe', 0.105, 'leader', 'wichita', 2012, 'mixed');
    md62FloorV2 = floorCore('midday', 62, 'wichita', 2012, st, 'v2c');
  }

  return { results, md62FloorV2, variants: VARIANTS };
})
`;

const SCENARIOS = [
  { id: 'weak', shares: [0.038], lineupKey: 'weak' },
  { id: 'middle', shares: [0.065], lineupKey: 'middle' },
  { id: 'leader', shares: [0.105], lineupKey: 'leader' },
  { id: 'cluster2', shares: [0.105, 0.055], lineupKeys: ['leader', 'middle'] },
  { id: 'cluster3', shares: [0.105, 0.06, 0.04], lineupKeys: ['leader', 'middle', 'weak'] },
  { id: 'acquired_legacy', shares: [0.085], lineupKey: 'middle' },
];

const DEPRESSIONS = ['none', 'all18500', 'legacy60', 'mixed'];

const MARKET_YEARS = {
  wichita: [1985, 1995, 2012, 2020],
  atlanta: [1995, 2012, 2020],
  newyork: [1995, 2012, 2020],
  nashville: [1995, 2012, 2020],
};

function fmtK(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function pct(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return (n * 100).toFixed(1) + '%';
}

function runHarness() {
  const ctx = createCtx();
  injectMarketEcologyIife(ctx);
  vm.runInContext(fs.readFileSync(legacyPath, 'utf8'), ctx);
  return vm.runInContext(
    `${RUNNER}(${JSON.stringify({ marketYears: MARKET_YEARS, scenarios: SCENARIOS, depressions: DEPRESSIONS })})`,
    ctx,
  );
}

function flattenForRankings(results) {
  const rows = [];
  for (const r of results) {
    for (const v of ['legacy', 'v1', 'v2c']) {
      const vr = r.variants[v];
      if (!vr) continue;
      rows.push({
        key: `${r.marketId}|${r.year}|${r.scenario}|${r.depression}|${v}`,
        marketId: r.marketId,
        year: r.year,
        scenario: r.scenario,
        depression: r.depression,
        variant: v,
        payrollDelta: vr.payrollDelta,
        ebitdaDelta: vr.ebitdaDelta,
        postPayroll: vr.postFloor.talAnnual,
        postEbitda: vr.postFloor.ebitda,
        postPayPct: vr.postFloor.payPctRev,
        cashP1: vr.cash[1],
        cashP8: vr.cash[8],
        negPeriods: vr.negPeriods,
        dangerPeriods: vr.dangerPeriods,
        preEbitda: vr.preFloor.ebitda,
      });
    }
  }
  return rows;
}

function evaluateChecks(harness, rows) {
  const checks = [];
  const pass = (id, msg) => checks.push({ id, pass: true, msg });
  const fail = (id, msg) => checks.push({ id, pass: false, msg });

  if (harness.md62FloorV2 === 18500) fail('no-18500', 'Wichita 2012 MD Q62 v2-C floor still $18.5K');
  else if (harness.md62FloorV2 >= 32000 && harness.md62FloorV2 <= 36000)
    pass('no-18500', `Wichita 2012 MD Q62 v2-C floor ${fmtK(harness.md62FloorV2)}`);
  else fail('no-18500', `MD Q62 floor ${fmtK(harness.md62FloorV2)} outside $32–36K`);

  const w12c3 = rows.find(
    (r) =>
      r.marketId === 'wichita' &&
      r.year === 2012 &&
      r.scenario === 'cluster3' &&
      r.depression === 'all18500' &&
      r.variant === 'v2c',
  );
  const w12c3v1 = rows.find(
    (r) =>
      r.marketId === 'wichita' &&
      r.year === 2012 &&
      r.scenario === 'cluster3' &&
      r.depression === 'all18500' &&
      r.variant === 'v1',
  );
  if (w12c3 && w12c3v1) {
    if (w12c3.postPayroll < w12c3v1.postPayroll) pass('v2-lighter', `v2-C cluster payroll ${fmtK(w12c3.postPayroll)} < v1 ${fmtK(w12c3v1.postPayroll)}`);
    else fail('v2-lighter', `v2-C not lighter than v1 on stressed cluster3 (${fmtK(w12c3.postPayroll)} vs ${fmtK(w12c3v1.postPayroll)})`);
    if (w12c3.postPayroll >= 500000 && w12c3.postPayroll <= 580000)
      pass('cluster-band', `Wichita 2012 stressed cluster3 v2-C payroll ${fmtK(w12c3.postPayroll)} in ~$500–580K band`);
    else if (w12c3.postPayroll <= 600000)
      pass('cluster-band', `Wichita 2012 stressed cluster3 v2-C payroll ${fmtK(w12c3.postPayroll)} (within extended tolerance)`);
    else fail('cluster-band', `Stressed cluster3 v2-C payroll ${fmtK(w12c3.postPayroll)} too high`);
  }

  const leaderCases = rows.filter(
    (r) => r.scenario === 'leader' && r.depression === 'all18500' && r.variant === 'v2c' && r.preEbitda > 0,
  );
  const leaderCashFail = leaderCases.filter((r) => r.cashP1 < 0);
  if (leaderCashFail.length === 0)
    pass('leader-cash', `No #1 depressed leader with pre-floor EBITDA>0 went cash-negative after 1 period (n=${leaderCases.length})`);
  else
    fail('leader-cash', `${leaderCashFail.length} healthy #1 leaders cash-negative after 1 period: ${leaderCashFail.map((r) => r.key).join(', ')}`);

  const clusterPos = rows.filter(
    (r) =>
      (r.scenario === 'cluster2' || r.scenario === 'cluster3') &&
      r.depression !== 'none' &&
      r.variant === 'v2c' &&
      r.preEbitda > 0,
  );
  const structBad = clusterPos.filter((r) => r.postEbitda < r.preEbitda * 0.55);
  if (structBad.length === 0)
    pass('cluster-ebitda', `No positive-EBITDA cluster lost >45% EBITDA from v2-C floors (n=${clusterPos.length})`);
  else fail('cluster-ebitda', `${structBad.length} clusters lost >45% EBITDA: ${structBad.slice(0, 3).map((r) => r.key).join('; ')}`);

  const highPay = rows.filter(
    (r) => r.variant === 'v2c' && r.scenario !== 'weak' && r.postPayPct != null && r.postPayPct > 0.52,
  );
  if (highPay.length === 0)
    pass('pay-ratio', 'No non-weak v2-C case exceeds 52% payroll/revenue');
  else if (highPay.length <= 3)
    pass('pay-ratio', `Only ${highPay.length} non-weak v2-C cases with payroll/rev >52% (${highPay.map((r) => r.key).join(', ')})`);
  else fail('pay-ratio', `${highPay.length} non-weak v2-C cases exceed 52% payroll/revenue ratio`);

  return checks;
}

function printSummaryTable(rows) {
  console.log('\n=== Summary: Wichita / Atlanta / New York / Nashville · v2-C · depressed saves (all18500 or mixed) ===');
  console.log(
    'market       year  scenario        dep       payroll   EBITDA    pay/rev  cash@1   cash@8   danger',
  );
  console.log('─'.repeat(95));
  const filtered = rows.filter(
    (r) =>
      r.variant === 'v2c' &&
      (r.depression === 'all18500' || r.depression === 'mixed') &&
      ['wichita', 'atlanta', 'newyork'].includes(r.marketId),
  );
  filtered
    .sort((a, b) => a.marketId.localeCompare(b.marketId) || a.year - b.year || a.scenario.localeCompare(b.scenario))
    .forEach((r) => {
      console.log(
        `${r.marketId.padEnd(12)} ${r.year}  ${r.scenario.padEnd(15)} ${r.depression.padEnd(8)} ` +
          `${fmtK(r.postPayroll).padStart(9)} ${fmtK(r.postEbitda).padStart(9)} ${pct(r.postPayPct).padStart(7)} ` +
          `${fmtK(r.cashP1).padStart(8)} ${fmtK(r.cashP8).padStart(8)} ${String(r.dangerPeriods).padStart(6)}`,
      );
    });
}

function printVariantCompare(rows) {
  console.log('\n=== Wichita 2012 · cluster3 · all18500 · variant compare ===');
  ['legacy', 'v1', 'v2c'].forEach((v) => {
    const r = rows.find(
      (x) => x.marketId === 'wichita' && x.year === 2012 && x.scenario === 'cluster3' && x.depression === 'all18500' && x.variant === v,
    );
    if (!r) return;
    console.log(
      `  ${v.padEnd(6)} payroll ${fmtK(r.postPayroll)}  Δpay ${fmtK(r.payrollDelta)}  EBITDA ${fmtK(r.postEbitda)}  ΔEBITDA ${fmtK(r.ebitdaDelta)}  cash@8 ${fmtK(r.cashP8)}`,
    );
  });
}

function printWorst(title, rows, key, n = 10) {
  console.log(`\n=== Worst ${n}: ${title} ===`);
  rows
    .filter((r) => r.variant === 'v2c')
    .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
    .slice(0, n)
    .forEach((r, i) => {
      console.log(
        `  ${i + 1}. ${r.marketId} ${r.year} ${r.scenario} ${r.depression} — ${key}=${key.includes('Delta') ? fmtK(r[key]) : r[key]}`,
      );
    });
}

function main() {
  console.log('Salary floor economy impact harness (legacy / v1 / v2-C)');
  const harness = runHarness();
  const rows = flattenForRankings(harness.results);
  const checks = evaluateChecks(harness, rows);

  printSummaryTable(rows);
  printVariantCompare(rows);
  printWorst('payroll increase (v2-C)', rows, 'payrollDelta');
  printWorst('EBITDA deterioration (v2-C)', rows, 'ebitdaDelta', 10);
  printWorst('danger-period count (v2-C)', rows, 'dangerPeriods', 10);

  console.log('\n=== PASS / FAIL ===');
  let failed = 0;
  checks.forEach((c) => {
    console.log(`${c.pass ? 'PASS' : 'FAIL'}: ${c.msg}`);
    if (!c.pass) failed++;
  });

  const payload = {
    generated: new Date().toISOString(),
    marketYears: MARKET_YEARS,
    scenarios: SCENARIOS.map((s) => s.id),
    depressions: DEPRESSIONS,
    md62FloorV2: harness.md62FloorV2,
    checks,
    results: harness.results,
    flat: rows,
  };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${outJson}`);

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll economy impact checks passed.');
}

main();
