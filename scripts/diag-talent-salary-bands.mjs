#!/usr/bin/env node
/**
 * Talent salary band diagnostic (read-only). Mirrors mkTal + Fall incumbent caps/floors.
 *
 *   node scripts/diag-talent-salary-bands.mjs
 *   node scripts/diag-talent-salary-bands.mjs --market=wichita --year=2012
 *   node scripts/diag-talent-salary-bands.mjs --proposed
 *   node scripts/diag-talent-salary-bands.mjs --regression
 *   node scripts/diag-talent-salary-bands.mjs --matrix
 *   node scripts/diag-talent-salary-bands.mjs --matrix-compare
 *   node scripts/diag-talent-salary-bands.mjs --legacy
 *   node scripts/diag-talent-salary-bands.mjs --proposed
 *   node scripts/diag-talent-salary-bands.mjs --proposed-v2
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

function stubEl() {
  return {
    disabled: false,
    addEventListener() {},
    click() {},
  };
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
  const markets = cfg.markets;
  const years = cfg.years;
  const fmt = cfg.fmt || 'ADULT_CONTEMP';
  const share = cfg.share != null ? cfg.share : 0.105;
  const tenureYears = cfg.tenureYears != null ? cfg.tenureYears : 8;
  const useLegacyFloor = !!cfg.useLegacyFloor;
  const FLOOR_VARIANTS = ['legacy', 'v1', 'v2a', 'v2b', 'v2c'];
  const activeVariants = cfg.matrixCompare ? FLOOR_VARIANTS : (cfg.floorVariant ? [cfg.floorVariant] : ['legacy', 'v1']);

  function floorCore(slot, marketId, year, trueQ, st, variant){
    const tq = Math.round(trueQ);
    if(variant === 'legacy'){
      const tier = tq < 42 ? 'entry' : tq < 68 ? 'mid' : 'star';
      const flBoost = 1 + (marketRankTierOnAirPayMult(marketId) - 1) * 0.58;
      return Math.round(salInfl((SAL[slot]?.[tier]?.[0] || 5000), year) * 0.60 * flBoost / 500) * 500;
    }
    return incumbentSalaryFloorAnnual(slot, tq, marketId, year, st, { variant: variant === 'v1' ? 'v1' : variant });
  }

  function applyFloorVariant(slot, marketId, share01, st, t, hireY, y, sal, variant){
    const baseInfl = talentFallBaseInflationForMarket(y, marketId);
    const tq = talentTrueQuality(t);
    const merit = tq > 85 ? 0.008 : tq > 72 ? 0.004 : 0.001;
    const perf = talentFallPerfPressureFromShare(share01, marketId);
    sal = Math.round(sal * (1 + baseInfl + merit + perf) / 500) * 500;
    const tenY = y - hireY;
    const tenPrem = Math.min(0.10, Math.max(0, tenY - 10) * 0.01);
    const [_capEl, floorEl] = eliteTalentIncumbentPremiumMults(t, slot, share01);
    const flCore = floorCore(slot, marketId, y, tq, st, variant);
    const floor = Math.round(flCore * (1 + tenPrem) * floorEl / 500) * 500;
    if(sal < floor) sal = floor;
    const slotBx = Math.round(slotStarMaxBaseForDaypart(slot) * marketRankTierOnAirPayMult(marketId));
    const tenCapMult = 1 + Math.min(0.18, Math.max(0, (y - hireY - 12) * 0.012));
    const mktCap = Math.round(salInfl(slotBx, y) * tenCapMult * _capEl / 500) * 500;
    if(sal > mktCap) sal = mktCap;
    return sal;
  }

  function simulateSalaryPath(slot, marketId, year, trueQ, share01, tenureYears, pinLow, variant){
    const tier = trueQ < 42 ? 'entry' : trueQ < 68 ? 'mid' : 'star';
    G = { marketId, year, period: 2, turn: 120, stations: [], ps: [], news: [] };
    const st = { id: 'diag-st', format: fmt, isPlayer: true, rat: { share: share01 } };
    G.stations = [st];
    const t = mkTal(slot, fmt, tier, year, { usedLastNames: new Set(), usedFullNames: new Set() }, {
      stationBookPayMult: stationBookStrengthPayMult(st, slot),
    });
    if(!t) return null;
    t._trueQuality = trueQ;
    t.quality = Math.min(97, trueQ + rnd(-2, 4));
    const hireY = year - tenureYears;
    t._hireYear = hireY;
    t.periodsAtStation = tenureYears * 2;
    st.prog = { [slot]: { talent: t, quality: 90 } };
    let sal = pinLow ? Math.min(t.salary, 18500) : t.salary;
    for(let y = hireY + 1; y <= year; y++){
      G.year = y;
      G.period = 2;
      sal = applyFloorVariant(slot, marketId, share01, st, t, hireY, y, sal, variant);
    }
    const tenYrs2 = year - hireY;
    const tenPrem2 = Math.min(0.10, Math.max(0, tenYrs2 - 10) * 0.01);
    const [_ceh, floorElHard] = eliteTalentIncumbentPremiumMults(t, slot, share01);
    const tqF = talentTrueQuality(t);
    const flCoreEnd = floorCore(slot, marketId, year, tqF, st, variant);
    const floorEnd = Math.round(flCoreEnd * (1 + tenPrem2) * floorElHard / 500) * 500;
    return { floorCore: flCoreEnd, floor: floorEnd, actual: sal };
  }

  function clusterPayrollForMarketVariant(marketId, year, variant, tenureYears){
    const stations = [
      { share: 0.105, lineup: [['morningDrive', 90], ['midday', 78], ['afternoonDrive', 62], ['overnight', 45]] },
      { share: 0.06, lineup: [['morningDrive', 78], ['midday', 62], ['afternoonDrive', 55]] },
      { share: 0.04, lineup: [['morningDrive', 62], ['midday', 55], ['overnight', 45]] },
    ];
    let total = 0;
    const hireY = year - tenureYears;
    stations.forEach(function(spec, si){
      G = { marketId, year, period: 2, stations: [], ps: [], news: [] };
      const st = { id: 'cl-' + si, format: fmt, isPlayer: true, rat: { share: spec.share } };
      G.stations = [st];
      st.prog = {};
      spec.lineup.forEach(function([slot, trueQ]){
        const tier = trueQ < 42 ? 'entry' : trueQ < 68 ? 'mid' : 'star';
        const t = mkTal(slot, fmt, tier, year, { usedLastNames: new Set(), usedFullNames: new Set() }, {
          stationBookPayMult: stationBookStrengthPayMult(st, slot),
        });
        if(!t) return;
        t._trueQuality = trueQ;
        t._hireYear = hireY;
        t.periodsAtStation = tenureYears * 2;
        t.salary = Math.min(Number(t.salary) || 0, 18500);
        let sal = t.salary;
        for(let y = hireY + 1; y <= year; y++){
          G.year = y;
          G.period = 2;
          sal = applyFloorVariant(slot, marketId, spec.share, st, t, hireY, y, sal, variant);
        }
        total += sal;
      });
    });
    return { total, perStation: Math.round(total / 3) };
  }

  function simulateDualTrack(slot, marketId, year, trueQ, share01, tenureYears, pinLow){
    const variant = cfg.floorVariant || 'v2c';
    const leg = simulateSalaryPath(slot, marketId, year, trueQ, share01, tenureYears, !!pinLow, 'legacy');
    const neu = simulateSalaryPath(slot, marketId, year, trueQ, share01, tenureYears, !!pinLow, variant);
    if(!leg || !neu) return null;
    return {
      legacyFloor: leg.floor,
      newFloor: neu.floor,
      legacyActual: leg.actual,
      newActual: neu.actual,
      hireSal: neu.actual,
    };
  }

  const compareMatrix = [];
  if(cfg.matrixCompare){
    const matrixMarkets = cfg.markets;
    const matrixYears = cfg.years;
    const profiles = [
      { label: 'overnight Q45', slot: 'overnight', trueQ: 45 },
      { label: 'midday Q62', slot: 'midday', trueQ: 62 },
      { label: 'midday Q78', slot: 'midday', trueQ: 78 },
      { label: 'morning Q90', slot: 'morningDrive', trueQ: 90 },
    ];
    matrixMarkets.forEach(function(marketId){
      matrixYears.forEach(function(year){
        profiles.forEach(function(p){
          const row = { marketId, year, profile: p.label, slot: p.slot, trueQ: p.trueQ, variants: {} };
          FLOOR_VARIANTS.forEach(function(v){
            const normal = simulateSalaryPath(p.slot, marketId, year, p.trueQ, share, tenureYears, false, v);
            const stressed = simulateSalaryPath(p.slot, marketId, year, p.trueQ, share, tenureYears, true, v);
            row.variants[v] = {
              floorCore: normal ? normal.floorCore : null,
              floor: normal ? normal.floor : null,
              actual: normal ? normal.actual : null,
              stressedActual: stressed ? stressed.actual : null,
            };
          });
          compareMatrix.push(row);
        });
        const clusterRow = { marketId, year, profile: '__cluster__', variants: {} };
        FLOOR_VARIANTS.forEach(function(v){
          const cl = clusterPayrollForMarketVariant(marketId, year, v, tenureYears);
          clusterRow.variants[v] = { total: cl.total, perStation: cl.perStation };
        });
        compareMatrix.push(clusterRow);
      });
    });
  }

  function applyFloor(slot, marketId, year, trueQ, share01, st, t, hireY, y, sal, useLegacy){
    return applyFloorVariant(slot, marketId, share01, st, t, hireY, y, sal, useLegacy ? 'legacy' : (cfg.floorVariant || 'v2c'));
  }

  function simulateIncumbent(slot, marketId, year, trueQ, tier, share01, useLegacy){
    G = { marketId, year, period: 2, turn: 120, stations: [], ps: [], news: [] };
    const st = { id: 'diag-st', format: fmt, isPlayer: true, rat: { share: share01 } };
    G.stations = [st];
    G.ps = [st];
    const t = mkTal(slot, fmt, tier, year, { usedLastNames: new Set(), usedFullNames: new Set() }, {
      stationBookPayMult: stationBookStrengthPayMult(st, slot),
    });
    if(!t) return null;
    t._trueQuality = trueQ;
    t.quality = Math.min(97, trueQ + rnd(-2, 4));
    const hireSal = t.salary;
    const hireY = year - tenureYears;
    t._hireYear = hireY;
    t.periodsAtStation = tenureYears * 2;
    st.prog = { [slot]: { talent: t, quality: 90 } };
    let sal = hireSal;
    for(let y = hireY + 1; y <= year; y++){
      G.year = y;
      G.period = 2;
      sal = applyFloor(slot, marketId, year, trueQ, share01, st, t, hireY, y, sal, useLegacy);
    }
    t.salary = sal;
    const tqF = talentTrueQuality(t);
    const tenYrs2 = year - hireY;
    const tenPrem2 = Math.min(0.10, Math.max(0, tenYrs2 - 10) * 0.01);
    const [_ceh, floorElHard] = eliteTalentIncumbentPremiumMults(t, slot, share01);
    const flCoreEnd = useLegacy
      ? floorCore(slot, marketId, year, tqF, st, 'legacy')
      : floorCore(slot, marketId, year, tqF, st, cfg.floorVariant || 'v2c');
    const hardFloor = Math.round(flCoreEnd * (1 + tenPrem2) * floorElHard / 500) * 500;
    const legacyFlCore = floorCore(slot, marketId, year, tqF, st, 'legacy');
    const proposedFlCore = floorCore(slot, marketId, year, tqF, st, cfg.floorVariant || 'v2c');
    const v2FlCore = typeof incumbentSalaryFloorAnnual_v2 === 'function'
      ? incumbentSalaryFloorAnnual_v2(slot, tqF, marketId, year, st)
      : floorCore(slot, marketId, year, tqF, st, 'v2c');
    return {
      hireSal,
      afterTenure: sal,
      hardFloor,
      legacyFloor: Math.round(legacyFlCore * (1 + tenPrem2) * floorElHard / 500) * 500,
      proposedFloor: Math.round(proposedFlCore * (1 + tenPrem2) * floorElHard / 500) * 500,
      floorCore: proposedFlCore,
      legacyFloorCore: legacyFlCore,
      v2FloorCore: v2FlCore,
      trueQ: talentTrueQuality(t),
      displayQ: Math.round(t.quality),
      elitePremium: eliteCompQualifiesForPremium(t, slot),
    };
  }

  function floorOnly(slot, marketId, year, trueQ, share01){
    G = { marketId, year, period: 2, stations: [], ps: [], news: [] };
    const st = { id: 'diag-st', format: fmt, isPlayer: true, rat: { share: share01 } };
  G.stations = [st];
    const legacyFl = floorCore(slot, marketId, year, trueQ, st, 'legacy');
    const newFl = floorCore(slot, marketId, year, trueQ, st, cfg.floorVariant || 'v2c');
    const v1Fl = floorCore(slot, marketId, year, trueQ, st, 'v1');
    const v2Fl = floorCore(slot, marketId, year, trueQ, st, 'v2c');
    return { legacyFl, newFl, v1Fl, v2Fl };
  }

  const slots = ['morningDrive', 'midday', 'afternoonDrive', 'evening', 'overnight'];
  const trueQs = [45, 62, 78, 90, 96];
  const rows = [];
  markets.forEach(function(marketId){
    years.forEach(function(year){
      slots.forEach(function(slot){
        trueQs.forEach(function(trueQ){
          const tier = trueQ < 42 ? 'entry' : trueQ < 68 ? 'mid' : 'star';
          const r = simulateIncumbent(slot, marketId, year, trueQ, tier, share, useLegacyFloor);
          if(r) rows.push({ marketId, year, slot, tier, share, tenureYears, ...r });
        });
      });
    });
  });

  const floorSamples = [];
  const spotlight = [
    ['wichita', 2012, 'midday', [45, 62, 78, 90]],
    ['wichita', 2012, 'morningDrive', [45, 62, 78, 90]],
    ['atlanta', 2012, 'midday', [62, 78, 90]],
    ['wichita', 2012, 'overnight', [45, 62]],
    ['wichita', 1985, 'midday', [62, 90]],
    ['wichita', 1985, 'morningDrive', [62, 90]],
    ['wichita', 2020, 'midday', [62, 90]],
    ['wichita', 2020, 'morningDrive', [62, 90]],
  ];
  spotlight.forEach(function([marketId, year, slot, qs]){
    qs.forEach(function(trueQ){
      const f = floorOnly(slot, marketId, year, trueQ, share);
      const tier = trueQ < 42 ? 'entry' : trueQ < 68 ? 'mid' : 'star';
      const rNew = simulateIncumbent(slot, marketId, year, trueQ, tier, share, false);
      const rLeg = simulateIncumbent(slot, marketId, year, trueQ, tier, share, true);
      floorSamples.push({
        marketId, year, slot, trueQ,
        legacyFloorCore: f.legacyFl,
        newFloorCore: f.newFl,
        v2FloorCore: f.v2Fl,
        legacyAfterTenure: rLeg ? rLeg.afterTenure : null,
        newAfterTenure: rNew ? rNew.afterTenure : null,
        newHire: rNew ? rNew.hireSal : null,
      });
    });
  });

  let clusterPayroll = 0;
  if(cfg.clusterPayroll){
    G = { marketId: 'wichita', year: 2012, period: 2, stations: [], ps: [], news: [] };
    const shares = [0.105, 0.06, 0.04];
    for(let i = 0; i < 3; i++){
      const st = { id: 'cl-' + i, format: fmt, isPlayer: true, rat: { share: shares[i] } };
      G.stations.push(st);
      const dayparts = ['morningDrive', 'midday', 'afternoonDrive'];
      const tqs = [78, 62, 55];
      st.prog = {};
      dayparts.forEach(function(sl, j){
        const tq = tqs[j];
        const tier = tq >= 65 ? 'mid' : 'entry';
        const t = mkTal(sl, fmt, tier, 2012, { usedLastNames: new Set(), usedFullNames: new Set() }, {
          stationBookPayMult: stationBookStrengthPayMult(st, sl),
        });
        if(t){
          t._trueQuality = tq;
          t.salary = Math.min(t.salary, 18500);
          t._hireYear = 2004;
          const fl = incumbentSalaryFloorAnnual_v2(sl, tq, 'wichita', 2012, st);
          const [_c, fel] = eliteTalentIncumbentPremiumMults(t, sl, shares[i]);
          t.salary = Math.max(t.salary, Math.round(fl * fel / 500) * 500);
          st.prog[sl] = { talent: t };
          clusterPayroll += t.salary;
        }
      });
    }
  }

  const matrix = [];
  if(cfg.matrix){
    const matrixMarkets = cfg.markets;
    const matrixYears = cfg.years;
    const profiles = [
      { label: 'overnight Q45', slot: 'overnight', trueQ: 45 },
      { label: 'midday Q62', slot: 'midday', trueQ: 62 },
      { label: 'midday Q78', slot: 'midday', trueQ: 78 },
      { label: 'morning Q90', slot: 'morningDrive', trueQ: 90 },
    ];
    matrixMarkets.forEach(function(marketId){
      matrixYears.forEach(function(year){
        profiles.forEach(function(p){
          const d = simulateDualTrack(p.slot, marketId, year, p.trueQ, share, tenureYears);
          if(d){
            matrix.push({
              marketId,
              year,
              profile: p.label,
              slot: p.slot,
              trueQ: p.trueQ,
              ...d,
            });
          }
          if(cfg.matrixStressed){
            const ds = simulateDualTrack(p.slot, marketId, year, p.trueQ, share, tenureYears, true);
            if(ds){
              matrix.push({
                marketId,
                year,
                profile: p.label + ' (≤$18.5K start)',
                slot: p.slot,
                trueQ: p.trueQ,
                stressed: true,
                ...ds,
              });
            }
          }
        });
        const legCl = clusterPayrollForMarketVariant(marketId, year, 'legacy', tenureYears);
        const newCl = clusterPayrollForMarketVariant(marketId, year, cfg.floorVariant || 'v2c', tenureYears);
        matrix.push({
          marketId,
          year,
          profile: '__cluster__',
          legacyFloor: null,
          newFloor: null,
          legacyActual: legCl.total,
          newActual: newCl.total,
          legacyPerStation: legCl.perStation,
          newPerStation: newCl.perStation,
        });
      });
    });
  }

  return { rows, floorSamples, clusterPayroll, matrix, compareMatrix };
})
`;

function parseArgs() {
  const out = {
    markets: ['wichita', 'atlanta', 'chicago', 'newyork'],
    years: [1980, 1995, 2012, 2020],
    json: null,
    proposed: false,
    regression: false,
    useLegacyFloor: false,
    clusterPayroll: false,
    matrix: false,
    matrixCompare: false,
    floorVariant: 'v2c',
    mode: null,
  };
  for (const a of process.argv.slice(2)) {
    if (a === '--legacy') out.mode = 'legacy';
    else if (a === '--proposed') out.mode = 'proposed';
    else if (a === '--proposed-v2') { out.mode = 'proposed-v2'; out.floorVariant = 'v2c'; }
    else if (a === '--matrix-compare') out.matrixCompare = true;
    else if (a === '--regression') out.regression = true;
    else if (a === '--matrix') out.matrix = true;
    else if (a.startsWith('--market=')) out.markets = [a.split('=')[1]];
    else if (a.startsWith('--year=')) out.years = [Number(a.split('=')[1])];
    else if (a.startsWith('--json=')) out.json = a.split('=')[1];
  }
  if (out.regression) {
    out.markets = ['wichita', 'atlanta'];
    out.years = [1985, 2012, 2020];
    out.clusterPayroll = true;
  }
  if (out.matrixCompare) {
    out.markets = ['wichita', 'atlanta', 'newyork'];
    out.years = [1972, 1980, 1985, 1995, 2012, 2020];
    out.share = 0.105;
    out.tenureYears = 8;
  }
  if (out.matrix) {
    out.markets = ['wichita', 'atlanta', 'newyork'];
    out.years = [1972, 1980, 1985, 1995, 2012, 2020];
    out.share = 0.105;
    out.tenureYears = 8;
    out.matrixStressed = true;
  }
  if (out.mode === 'proposed') out.proposed = true;
  if (out.mode === 'proposed-v2') {
    out.proposed = true;
    out.compareV2 = true;
  }
  return out;
}

const VARIANT_LABEL = {
  legacy: 'legacy',
  v1: 'v1 (prod)',
  v2a: 'v2-A factors',
  v2b: 'v2-B band',
  v2c: 'v2-C both',
};

function printCompareMatrix(compareMatrix) {
  const markets = ['wichita', 'atlanta', 'newyork'];
  const years = [1972, 1980, 1985, 1995, 2012, 2020];
  const profiles = ['overnight Q45', 'midday Q62', 'midday Q78', 'morning Q90'];
  const variants = ['legacy', 'v1', 'v2a', 'v2b', 'v2c'];

  console.log('Incumbent floor calibration comparison');
  console.log('v1=production · v2a=factor cut · v2b=band cut · v2c=A+B · 8yr tenure · 10.5% share\n');

  markets.forEach((mkt) => {
    console.log('═'.repeat(88));
    console.log(MARKET_LABEL[mkt] || mkt);
    console.log('═'.repeat(88));
    years.forEach((year) => {
      console.log(`\n  ${year}`);
      console.log('  ' + 'Profile'.padEnd(14) + variants.map((v) => VARIANT_LABEL[v].padStart(11)).join(''));
      console.log('  ' + '─'.repeat(14 + variants.length * 11));
      profiles.forEach((prof) => {
        const row = compareMatrix.find((x) => x.marketId === mkt && x.year === year && x.profile === prof);
        if (!row) return;
        const floors = variants.map((v) => fmtK(row.variants[v]?.floorCore).padStart(11)).join('');
        console.log('  ' + ('floor ' + prof).slice(0, 14).padEnd(14) + floors);
        const actuals = variants.map((v) => fmtK(row.variants[v]?.actual).padStart(11)).join('');
        console.log('  ' + 'actual'.padEnd(14) + actuals);
        const stressed = variants.map((v) => fmtK(row.variants[v]?.stressedActual).padStart(11)).join('');
        console.log('  ' + 'stressed'.padEnd(14) + stressed);
      });
      const cl = compareMatrix.find((x) => x.marketId === mkt && x.year === year && x.profile === '__cluster__');
      if (cl) {
        console.log('  ' + '─'.repeat(14 + variants.length * 11));
        const totals = variants.map((v) => fmtK(cl.variants[v]?.total).padStart(11)).join('');
        console.log('  ' + 'cluster tot'.padEnd(14) + totals);
        const avgs = variants.map((v) => fmtK(cl.variants[v]?.perStation).padStart(11)).join('');
        console.log('  ' + 'avg / stn'.padEnd(14) + avgs);
      }
    });
    console.log('');
  });

  console.log('Wichita 2012 targets: MD62 floor $32–36K · MD78 $50–60K · AM90 $105–125K · cluster $500–575K');
  const w12 = compareMatrix.filter((x) => x.marketId === 'wichita' && x.year === 2012);
  const md62 = w12.find((x) => x.profile === 'midday Q62');
  const md78 = w12.find((x) => x.profile === 'midday Q78');
  const am90 = w12.find((x) => x.profile === 'morning Q90');
  const cl = w12.find((x) => x.profile === '__cluster__');
  if (md62 && md78 && am90 && cl) {
    console.log('\nWichita 2012 summary (floor core / cluster):');
    variants.forEach((v) => {
      console.log(
        `  ${VARIANT_LABEL[v].padEnd(12)} MD62=${fmtK(md62.variants[v]?.floorCore)} MD78=${fmtK(md78.variants[v]?.floorCore)} AM90=${fmtK(am90.variants[v]?.floorCore)} cluster=${fmtK(cl.variants[v]?.total)}`,
      );
    });
  }
}

const MARKET_LABEL = { wichita: 'Wichita (small)', atlanta: 'Atlanta (large)', newyork: 'New York (mega)' };

function fmtK(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function printMatrix(matrix) {
  const markets = ['wichita', 'atlanta', 'newyork'];
  const years = [1972, 1980, 1985, 1995, 2012, 2020];
  const profiles = ['overnight Q45', 'midday Q62', 'midday Q78', 'morning Q90'];

  console.log('Talent salary: LEGACY floor (60% band min) vs production (v2-C)');
  console.log('Dual-track simulation · same hire · 8yr tenure · #1-station share 10.5% · ADULT_CONTEMP');
  const stressed = matrix.some((x) => x.stressed);
  if (stressed) console.log('Includes stressed rows: hire pay capped at $18,500 before tenure sim.\n');
  else console.log('');

  markets.forEach((mkt) => {
    console.log('═'.repeat(72));
    console.log(MARKET_LABEL[mkt] || mkt);
    console.log('═'.repeat(72));
    years.forEach((year) => {
      console.log(`\n  ── ${year} ──`);
      console.log(
        '  ' +
          'Profile'.padEnd(14) +
          '│ ' +
          'Floor (before → after)'.padEnd(28) +
          '│ ' +
          'Actual salary (before → after)'.padEnd(32),
      );
      console.log('  ' + '─'.repeat(78));
      profiles.forEach((prof) => {
        const r = matrix.find((x) => x.marketId === mkt && x.year === year && x.profile === prof && !x.stressed);
        if (!r) return;
        const fl = `${fmtK(r.legacyFloor)} → ${fmtK(r.newFloor)}`;
        const ac = `${fmtK(r.legacyActual)} → ${fmtK(r.newActual)}`;
        const ch = r.legacyActual !== r.newActual ? ' *' : '';
        console.log('  ' + prof.padEnd(14) + '│ ' + fl.padEnd(28) + '│ ' + ac + ch);
        const rs = matrix.find((x) => x.marketId === mkt && x.year === year && x.stressed && x.profile.startsWith(prof));
        if (rs) {
          const acs = `${fmtK(rs.legacyActual)} → ${fmtK(rs.newActual)}`;
          console.log('  ' + '(stressed)'.padEnd(14) + '│ ' + '—'.padEnd(28) + '│ ' + acs);
        }
      });
      const cl = matrix.find((x) => x.marketId === mkt && x.year === year && x.profile === '__cluster__');
      if (cl) {
        console.log('  ' + '─'.repeat(78));
        console.log(
          '  ' +
            '3-stn cluster'.padEnd(14) +
            '│ ' +
            `(payroll ${fmtK(cl.legacyActual)} → ${fmtK(cl.newActual)})`.padEnd(28) +
            '│ ' +
            `(avg/stn ${fmtK(cl.legacyPerStation)} → ${fmtK(cl.newPerStation)})`,
        );
      }
    });
    console.log('');
  });

  console.log('Cluster model: 3 stations @ shares 10.5% / 6% / 4%; hosts depressed to ≤$18.5K then tenure sim.');
  console.log('  Stn1: AM90, MD78, PM62, OV45 · Stn2: AM78, MD62, PM55 · Stn3: AM62, MD55, OV45');
}

function runVm(cfg) {
  const ctx = createCtx();
  injectMarketEcologyIife(ctx);
  vm.runInContext(fs.readFileSync(legacyPath, 'utf8'), ctx);
  return vm.runInContext(`${RUNNER}(${JSON.stringify(cfg)})`, ctx);
}

function printSpotlight(floorSamples) {
  console.log('=== Floor core & after-tenure (legacy vs new) ===');
  console.log('market       yr  slot            tQ  legFl  newFl  leg$   new$   hire$');
  floorSamples.forEach((r) => {
    console.log(
      `${r.marketId.padEnd(12)} ${r.year}  ${r.slot.padEnd(15)} ${String(r.trueQ).padStart(2)}  ` +
        `${String(r.legacyFloorCore).padStart(5)}  ${String(r.newFloorCore).padStart(5)}  ` +
        `${String(r.legacyAfterTenure ?? '-').padStart(5)}  ${String(r.newAfterTenure ?? '-').padStart(5)}  ` +
        `${String(r.newHire ?? '-').padStart(5)}`,
    );
  });
}

function runRegression(result) {
  const { rows, floorSamples, clusterPayroll } = result;
  let failed = 0;
  const fail = (msg) => {
    console.error('FAIL:', msg);
    failed++;
  };
  const pass = (msg) => console.log('PASS:', msg);

  const wMid62 = floorSamples.find(
    (r) => r.marketId === 'wichita' && r.year === 2012 && r.slot === 'midday' && r.trueQ === 62,
  );
  if (!wMid62) fail('missing wichita 2012 midday tQ62 sample');
  else {
    if (wMid62.newFloorCore === 18500) fail('wichita 2012 midday tQ62 floor still $18.5K');
    else if (wMid62.newFloorCore < 32000 || wMid62.newFloorCore > 36000)
      fail(`wichita 2012 midday tQ62 floor ${wMid62.newFloorCore} outside $32–36K band (v2-C)`);
    else pass(`wichita 2012 midday tQ62 floor $${wMid62.newFloorCore} (was legacy $${wMid62.legacyFloorCore})`);
  }

  const wMid78Fl = floorSamples.find(
    (r) => r.marketId === 'wichita' && r.year === 2012 && r.slot === 'midday' && r.trueQ === 78,
  );
  if (wMid78Fl) {
    if (wMid78Fl.newFloorCore < 50000 || wMid78Fl.newFloorCore > 60000)
      fail(`midday tQ78 floor ${wMid78Fl.newFloorCore} outside $50–60K band`);
    else pass(`wichita 2012 midday tQ78 floor $${wMid78Fl.newFloorCore}`);
  }

  const wMor90Fl = floorSamples.find(
    (r) => r.marketId === 'wichita' && r.year === 2012 && r.slot === 'morningDrive' && r.trueQ === 90,
  );
  if (wMor90Fl) {
    if (wMor90Fl.newFloorCore < 105000 || wMor90Fl.newFloorCore > 125000)
      fail(`morning tQ90 floor ${wMor90Fl.newFloorCore} outside $105–125K band`);
    else pass(`wichita 2012 morning tQ90 floor $${wMor90Fl.newFloorCore}`);
  }

  const wMid90 = rows.find(
    (r) => r.marketId === 'wichita' && r.year === 2012 && r.slot === 'midday' && r.trueQ === 90,
  );
  if (!wMid90) fail('missing wichita 2012 midday tQ90 row');
  else {
    if (wMid90.afterTenure < 70000) fail(`midday tQ90 after tenure too low: ${wMid90.afterTenure}`);
    else if (wMid90.afterTenure > 95000) fail(`midday tQ90 after tenure jumped too high: ${wMid90.afterTenure}`);
    else pass(`wichita 2012 midday tQ90 after tenure $${wMid90.afterTenure}`);
  }

  const wOv45 = floorSamples.find(
    (r) => r.marketId === 'wichita' && r.year === 2012 && r.slot === 'overnight' && r.trueQ === 45,
  );
  if (wOv45 && wOv45.newFloorCore > 30000) fail(`overnight tQ45 floor too high: ${wOv45.newFloorCore}`);
  else if (wOv45) pass(`overnight tQ45 floor $${wOv45.newFloorCore}`);

  const wMor62Fl = floorSamples.find(
    (r) => r.marketId === 'wichita' && r.year === 2012 && r.slot === 'morningDrive' && r.trueQ === 62,
  );
  if (wMor62Fl) {
    if (wMor62Fl.newFloorCore < 45000 || wMor62Fl.newFloorCore > 62000)
      fail(`morning tQ62 floor ${wMor62Fl.newFloorCore} outside ~45–62K band`);
    else pass(`wichita 2012 morning tQ62 floor $${wMor62Fl.newFloorCore}`);
  }

  const wMor90 = rows.find(
    (r) => r.marketId === 'wichita' && r.year === 2012 && r.slot === 'morningDrive' && r.trueQ === 90,
  );
  if (wMor90) {
    if (wMor90.afterTenure < 150000) fail(`morning tQ90 too low: ${wMor90.afterTenure}`);
    else pass(`wichita 2012 morning tQ90 after tenure $${wMor90.afterTenure}`);
  }

  if (clusterPayroll > 580000) fail(`3-station cluster payroll too high: $${clusterPayroll}`);
  else if (clusterPayroll < 500000) fail(`3-station cluster payroll too low: $${clusterPayroll}`);
  else pass(`3-station wichita cluster payroll (v2-C floors) $${clusterPayroll}`);

  if (failed > 0) {
    console.error(`\n${failed} regression check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll regression checks passed.');
}

function main() {
  const cfg = parseArgs();

  if (cfg.matrixCompare) {
    const result = runVm(cfg);
    printCompareMatrix(result.compareMatrix || []);
    if (cfg.json) {
      const p = path.isAbsolute(cfg.json) ? cfg.json : path.join(root, cfg.json);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(
        p,
        JSON.stringify({ generated: new Date().toISOString(), cfg, compareMatrix: result.compareMatrix }, null, 2),
      );
      console.log('\nWrote', p);
    }
    return;
  }

  if (cfg.matrix) {
    const result = runVm(cfg);
    printMatrix(result.matrix || []);
    if (cfg.json) {
      const p = path.isAbsolute(cfg.json) ? cfg.json : path.join(root, cfg.json);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(
        p,
        JSON.stringify({ generated: new Date().toISOString(), cfg, matrix: result.matrix }, null, 2),
      );
      console.log('\nWrote', p);
    }
    return;
  }

  if (cfg.proposed) {
    const leg = runVm({ ...cfg, useLegacyFloor: true, floorVariant: 'v1' });
    const neu = runVm({ ...cfg, useLegacyFloor: false, floorVariant: cfg.compareV2 ? 'v2c' : 'v1' });
    const v2 = runVm({ ...cfg, useLegacyFloor: false, floorVariant: 'v2c' });
    const title = cfg.compareV2
      ? 'Talent salary floors: LEGACY vs v1 (production) vs v2-C (softer A+B)'
      : 'Talent salary floors: LEGACY vs v1 (incumbentSalaryFloorAnnual)';
    console.log(title);
    console.log('Share', cfg.share ?? 0.105, '· tenure', cfg.tenureYears ?? 8, 'yr\n');
    console.log('=== Floor cores ===');
    console.log('market       yr  slot            tQ  legacy   v1      v2c');
    neu.floorSamples.forEach((r) => {
      const v2r = v2.floorSamples.find(
        (x) => x.marketId === r.marketId && x.year === r.year && x.slot === r.slot && x.trueQ === r.trueQ,
      );
      console.log(
        `${r.marketId.padEnd(12)} ${r.year}  ${r.slot.padEnd(15)} ${String(r.trueQ).padStart(2)}  ` +
          `${String(r.legacyFloorCore).padStart(6)}  ${String(r.newFloorCore).padStart(6)}  ${String(v2r?.newFloorCore ?? r.v2FloorCore ?? '-').padStart(6)}`,
      );
    });
    printSpotlight(neu.floorSamples);
    return;
  }

  if (cfg.regression) {
    runRegression(runVm(cfg));
    return;
  }

  const result = runVm(cfg);
  const rows = result.rows;
  const w2012 = rows.filter((r) => r.marketId === 'wichita' && r.year === 2012);

  console.log('Talent salary bands (mkTal hire +', cfg.tenureYears ?? 8, 'yr Fall tenure @ share', cfg.share ?? 0.105, ')');
  console.log('Floors: incumbentSalaryFloorAnnual_v2 (v2-C production) · Format: ADULT_CONTEMP');
  console.log('markets:', cfg.markets.join(', '), '· years:', cfg.years.join(', '));
  console.log('');
  console.log('=== Wichita 2012 ===');
  console.log('slot             tQ  hire$    afterTenure$  floorCore$  elite');
  w2012.forEach((r) => {
    console.log(
      `${r.slot.padEnd(16)} ${String(r.trueQ).padStart(2)}  ${String(r.hireSal).padStart(6)}  ${String(r.afterTenure).padStart(11)}  ${String(r.floorCore).padStart(10)}  ${r.elitePremium ? 'Y' : 'n'}`,
    );
  });
  console.log('');
  printSpotlight(result.floorSamples);

  if (cfg.json) {
    const p = path.isAbsolute(cfg.json) ? cfg.json : path.join(root, cfg.json);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ generated: new Date().toISOString(), cfg, ...result }, null, 2));
    console.log('\nWrote', p);
  }
}

main();
