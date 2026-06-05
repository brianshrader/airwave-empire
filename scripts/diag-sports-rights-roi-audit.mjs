#!/usr/bin/env node
/**
 * Sports rights ROI audit (read-only regression).
 *
 * Mirrors openSports() fee / est. revenue lift / estimated annual value math,
 * compares to realized calcRev sports premium, and flags early-era fee inflation.
 *
 *   node scripts/diag-sports-rights-roi-audit.mjs
 *   npm run diag:sports-rights-roi
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
const outJson = path.join(root, 'tmp', 'sports_rights_roi_audit.json');

const MARKETS = ['chicago', 'newyork', 'losangeles', 'dallas', 'atlanta', 'wichita'];
const YEARS = [1970, 1980, 1990, 2000, 2010, 2020];
const FORMATS = ['SPORTS_TALK', 'NEWS_TALK', 'MOR', 'ADULT_CONTEMP'];
const CHICAGO_SPOTLIGHT = [1970, 1980, 2000, 2020];

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
    body: { classList: { toggle() {}, add() {}, remove() {} } },
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
  const MARKET_IDS = cfg.markets;
  const YEARS = cfg.years;
  const FORMATS = cfg.formats;
  const TIER = 'competitive';
  const TIER_REC = 62;
  const qualMult = 1.0;

  function sportsUiMetrics(team, year, marketId, format, holderFee){
    const mkt = MARKETS[marketId] || MARKETS.atlanta;
    if(year < team.introduced) return null;
    const season = SPORT_SEASONS[team.sport] || { p1: 0.5, p2: 0.5 };
    const fmtFit = SPORTS_FORMAT_FIT[format] || 0.3;
    const estShareGain = team.baseBonus * qualMult * fmtFit * (season.p1 + season.p2);
    const annualBilling = marketAnnualBilling(year, marketId);
    const estRevLift = Math.round(annualBilling * estShareGain / 2 / 1000) * 1000;
    const estAnnualValue = Math.round(estRevLift * 0.85 / 1000) * 1000;
    const eraScaledFee = eraScaledSportsFee(team, year, marketId);
    const initFee = Math.round(eraScaledFee * 0.85 / 1000) * 1000;
    const fee = holderFee != null ? holderFee : initFee;
    const billing2020 = marketAnnualBilling(2020, marketId);
    const billing1970 = marketAnnualBilling(1970, marketId);
    const fullBillingScaledFee = Math.round(team.baseFee * (annualBilling / Math.max(billing2020, 1)) / 1000) * 1000;
    const eraFrom1970Fee = Math.round(team.baseFee * (annualBilling / Math.max(billing1970, 1)) / 1000) * 1000;
    return {
      baseFee: team.baseFee,
      holderFee: fee,
      estRevLift,
      estAnnualValue,
      estShareGain: Math.round(estShareGain * 10000) / 10000,
      annualBilling,
      fmtFit,
      feeVsValue: fee / Math.max(estAnnualValue, 1),
      feeVsLift: fee / Math.max(estRevLift, 1),
      eraScaledFee,
      eraFrom1970Fee,
      fullBillingScaledFee,
      feeVsEraScaled: fee / Math.max(eraScaledFee, 1),
      feeVsFullBillingScaled: fee / Math.max(fullBillingScaledFee, 1),
    };
  }

  function buildProbeMarket(team, year, marketId, format, share){
    ACTIVE_MARKET = marketId;
    syncMarketPopToMarket(marketId);
    const Glocal = {
      marketId,
      year,
      period: 2,
      stations: [],
      ps: [],
      news: [],
      adx: 1,
      streamDrag: 1,
      turn: 24,
      _wlHarnessDeterministic: true,
    };
    const st = {
      id: 'probe',
      callLetters: 'WPROBE',
      format,
      isPlayer: true,
      isPublic: false,
      _bpSlotDeferred: false,
      sig: { type: 'FM', pw: '100kw', reach: 1, universe: 1 },
      rat: { share, aqh: Math.round(share * 800000), cur: {} },
      mom: {},
      ops: { sell: 0.62, spots: 13, promo: 32000, progBudget: 14000 },
      salesForce: { level: 2 },
      prog: {
        morningDrive: { talent: null, quality: 55 },
        midday: { talent: null, quality: 50 },
        afternoonDrive: { talent: null, quality: 48 },
        evening: { talent: null, quality: 45 },
        overnight: { talent: null, quality: 40 },
      },
      oq: 60,
      fin: { rev: 0, cost: 0, ebitda: 0 },
    };
    COH.forEach(function(c){
      const per = share / COH.length;
      st.rat.cur[c] = { share: per, aqh: Math.round(per * 50000) };
      st.mom[c] = { cur: per, tgt: per };
    });
    const peers = [0.11, 0.09, 0.075, 0.06, 0.05, 0.042, 0.036, 0.03].map(function(sh, i){
      const p = {
        id: 'peer-' + i,
        callLetters: 'PEER' + i,
        format: 'ADULT_CONTEMP',
        isPlayer: false,
        isPublic: false,
        _bpSlotDeferred: false,
        sig: { type: 'FM', pw: '50kw' },
        rat: { share: sh, aqh: Math.round(sh * 500000), cur: {} },
        mom: {},
        ops: { sell: 0.55, spots: 12, promo: 12000, progBudget: 6000 },
        prog: {
          morningDrive: { quality: 40 },
          midday: { quality: 38 },
          afternoonDrive: { quality: 38 },
          evening: { quality: 35 },
          overnight: { quality: 30 },
        },
        fin: { rev: 0, cost: 0, ebitda: 0 },
      };
      COH.forEach(function(c){
        const per = sh / COH.length;
        p.rat.cur[c] = { share: per, aqh: Math.round(per * 40000) };
        p.mom[c] = { cur: per, tgt: per };
      });
      return p;
    });
    Glocal.stations = [st].concat(peers);
    Glocal.ps = [st];
    Glocal.teamRecords = {};
    Glocal.teamRecords[team.id] = { record: TIER_REC, trend: 0, lastEvent: 0 };
    Glocal.sportsRights = {};
    initSportsRights(Glocal);
    const mkt = MARKETS[marketId] || MARKETS.atlanta;
    (mkt.teams || []).forEach(function(t){
      const rights = Glocal.sportsRights[t.id];
      if(rights){
        rights.holderId = null;
        rights.holderName = '—';
      }
    });
    const engageWeightedPop = COH.reduce(function(sum, c){
      const pop = POP.cohorts[c]?.t || 0;
      const engage = AQH_ENGAGE[c] || 0.060;
      return sum + pop * engage;
    }, 0);
    return { Glocal, st, engageWeightedPop };
  }

  function measureProbeRev(team, year, marketId, format, share, holderRights){
    const { Glocal, st } = buildProbeMarket(team, year, marketId, format, share);
    G = Glocal;
    if(holderRights){
      Glocal.sportsRights[team.id] = holderRights;
    }
    recalc(Glocal.stations, Glocal);
    seedRev(Glocal.stations, Glocal);
    return {
      rev: st.fin.rev || 0,
      shareAfter: st.rat.share || 0,
      bonus: getSportsBonus(st, Glocal),
    };
  }

  function simulateHolderRevPremium(team, year, marketId, format, share){
    const ui = sportsUiMetrics(team, year, marketId, format, null);
    const holderRights = {
      holderId: 'probe',
      holderName: 'WPROBE',
      fee: eraScaledSportsFee(team, year, marketId),
      contractEnd: year + team.contractYrs,
      relationship: { probe: 40 },
      bids: {},
      auctionOpen: false,
      auctionCloses: null,
    };
    const without = measureProbeRev(team, year, marketId, format, share, null);
    const withRights = measureProbeRev(team, year, marketId, format, share, holderRights);
    const halfPeriodLift = withRights.rev - without.rev;
    const annualizedLift = halfPeriodLift * 2;
    const probeAnnualRev = without.rev * 2;
    const feePctProbeRev = probeAnnualRev > 0 ? ui.holderFee / probeAnnualRev : null;
    const feePctMarketBilling = ui.holderFee / Math.max(ui.annualBilling, 1);

    return {
      share,
      shareGain: Math.round((withRights.shareAfter - without.shareAfter) * 10000) / 10000,
      sportsBonus: Math.round(withRights.bonus * 10000) / 10000,
      revHalfWithout: Math.round(without.rev),
      revHalfWith: Math.round(withRights.rev),
      probeAnnualRev: Math.round(probeAnnualRev),
      feePctProbeRev: feePctProbeRev != null ? Math.round(feePctProbeRev * 1000) / 1000 : null,
      feePctMarketBilling: Math.round(feePctMarketBilling * 10000) / 10000,
      halfPeriodLift: Math.round(halfPeriodLift),
      annualizedLift: Math.round(annualizedLift),
      uiEstRevLift: ui.estRevLift,
      uiEstShareGain: ui.estShareGain,
      liftCapture: annualizedLift / Math.max(ui.estRevLift, 1),
      feeVsRealizedLift: ui.holderFee / Math.max(annualizedLift, 1),
    };
  }

  const staticRows = [];
  MARKET_IDS.forEach(function(marketId){
    const mkt = MARKETS[marketId];
    if(!mkt || !mkt.teams) return;
    YEARS.forEach(function(year){
      mkt.teams.forEach(function(team){
        FORMATS.forEach(function(format){
          const m = sportsUiMetrics(team, year, marketId, format, null);
          if(!m) return;
          staticRows.push({
            marketId,
            year,
            teamId: team.id,
            teamName: team.name,
            sport: team.sport,
            format,
            tier: TIER,
            ...m,
          });
        });
      });
    });
  });

  const simRows = [];
  const simSpecs = [
    { marketId: 'chicago', years: [1970, 1980, 2000, 2020], teamId: 'bears', format: 'SPORTS_TALK', share: 0.08 },
    { marketId: 'chicago', years: [1970], teamId: 'bears', format: 'MOR', share: 0.065 },
    { marketId: 'dallas', years: [1970, 1990, 2020], teamId: 'cowboys', format: 'SPORTS_TALK', share: 0.09 },
    { marketId: 'wichita', years: [1970, 2000], teamId: 'wingnuts', format: 'SPORTS_TALK', share: 0.07 },
  ];
  simSpecs.forEach(function(spec){
    const mkt = MARKETS[spec.marketId]; // global market table from legacy.js
    const team = (mkt.teams || []).find(function(t){ return t.id === spec.teamId; });
    if(!team) return;
    spec.years.forEach(function(year){
      if(year < team.introduced) return;
      const row = simulateHolderRevPremium(team, year, spec.marketId, spec.format, spec.share);
      simRows.push({
        marketId: spec.marketId,
        year,
        teamId: team.id,
        teamName: team.name,
        sport: team.sport,
        format: spec.format,
        ...row,
      });
    });
  });

  return { staticRows, simRows };
})
`;

function fmtK(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function pct(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return (n * 100).toFixed(1) + '%';
}

function runAudit() {
  const ctx = createCtx();
  injectMarketEcologyIife(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'src', 'talentRetention.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(legacyPath, 'utf8'), ctx);
  return vm.runInContext(
    `${RUNNER}(${JSON.stringify({ markets: MARKETS, years: YEARS, formats: FORMATS })})`,
    ctx,
  );
}

function evaluateChecks(rows, simRows) {
  const checks = [];
  const pass = (id, msg) => checks.push({ id, pass: true, msg });
  const fail = (id, msg) => checks.push({ id, pass: false, msg });

  const chicago1970Nfl = rows.filter(
    (r) =>
      r.marketId === 'chicago' &&
      r.year === 1970 &&
      r.sport === 'PRO_FOOTBALL' &&
      r.format === 'NEWS_TALK',
  );
  if (chicago1970Nfl.length) {
    const b = chicago1970Nfl[0];
    if (b.feeVsValue <= 2.0)
      pass('chi1970-nfl-fee-value', `Chicago 1970 NFL NEWS_TALK fee/value ${b.feeVsValue.toFixed(2)}× (≤2.0)`);
    else
      fail(
        'chi1970-nfl-fee-value',
        `Chicago 1970 NFL fee ${fmtK(b.holderFee)} vs est. value ${fmtK(b.estAnnualValue)} = ${b.feeVsValue.toFixed(2)}× (>2.0)`,
      );
  }

  const earlyMegaNfl = rows.filter(
    (r) =>
      r.year <= 1980 &&
      r.sport === 'PRO_FOOTBALL' &&
      ['chicago', 'newyork', 'losangeles', 'dallas'].includes(r.marketId) &&
      r.format === 'SPORTS_TALK' &&
      r.feeVsValue > 2.5,
  );
  if (earlyMegaNfl.length === 0)
    pass('early-mega-nfl', 'No 1970–1980 mega-market NFL SPORTS_TALK row exceeds 2.5× fee/value');
  else
    fail(
      'early-mega-nfl',
      `${earlyMegaNfl.length} early mega NFL rows exceed 2.5× fee/value (worst ${earlyMegaNfl[0].marketId} ${earlyMegaNfl[0].year} ${earlyMegaNfl[0].feeVsValue.toFixed(2)}×)`,
    );

  const eraDrift = rows.filter((r) => r.format === 'SPORTS_TALK' && r.feeVsEraScaled > 1.15 && r.year <= 1980);
  if (eraDrift.length === 0)
    pass('era-drift', 'Production eraScaledSportsFee tracks ≤1980 SPORTS_TALK fees (fee/eraScaled ≤1.15)');
  else
    fail('era-drift', `${eraDrift.length} ≤1980 rows still exceed era-scaled fee by >15% (stale save or drift)`);

  const simBad = simRows.filter(
    (r) => r.format === 'SPORTS_TALK' && r.liftCapture < 0.15 && r.uiEstRevLift > 100000,
  );
  if (simBad.length === 0)
    pass('lift-capture', 'SPORTS_TALK sims realize ≥15% of UI est. lift where UI lift >$100K');
  else
    fail(
      'lift-capture',
      `${simBad.length} SPORTS_TALK sims realize <15% of UI revenue lift (e.g. ${simBad[0].marketId} ${simBad[0].year} ${simBad[0].teamId} capture ${pct(simBad[0].liftCapture)})`,
    );

  const chi1970NflFeePct = simRows.find(
    (r) => r.marketId === 'chicago' && r.year === 1970 && r.teamId === 'bears' && r.format === 'SPORTS_TALK',
  );
  if (chi1970NflFeePct?.feePctProbeRev != null && chi1970NflFeePct.feePctProbeRev > 0.85)
    fail(
      'chi1970-fee-burden',
      `Chicago 1970 NFL fee is ${pct(chi1970NflFeePct.feePctProbeRev)} of probe station annual revenue (>${pct(0.85)})`,
    );
  else if (chi1970NflFeePct)
    pass(
      'chi1970-fee-burden',
      `Chicago 1970 NFL fee is ${pct(chi1970NflFeePct.feePctProbeRev)} of probe annual rev, ${pct(chi1970NflFeePct.feePctMarketBilling)} of market billing`,
    );

  return checks;
}

function printChicagoSpotlight(rows) {
  console.log('\n=== Chicago · NEWS_TALK · competitive tier (mirrors openSports UI) ===');
  console.log('year  team              fee      est lift   est value  fee/value  fee/lift');
  console.log('─'.repeat(78));
  rows
    .filter(
      (r) =>
        r.marketId === 'chicago' &&
        r.format === 'NEWS_TALK' &&
        CHICAGO_SPOTLIGHT.includes(r.year),
    )
    .sort((a, b) => a.year - b.year || a.teamName.localeCompare(b.teamName))
    .forEach((r) => {
      console.log(
        `${r.year}  ${r.teamName.slice(0, 16).padEnd(16)} ${fmtK(r.holderFee).padStart(9)} ${fmtK(r.estRevLift).padStart(10)} ` +
          `${fmtK(r.estAnnualValue).padStart(10)} ${String(r.feeVsValue.toFixed(2) + '×').padStart(9)} ${String(r.feeVsLift.toFixed(2) + '×').padStart(8)}`,
      );
    });
}

function printNflCrossEra(rows) {
  console.log('\n=== NFL rights · SPORTS_TALK · fee vs era-scaled fee (billing-indexed from 2020) ===');
  console.log('market       year   baseFee   holder~fee  eraScaled  fee/eraSc  estValue  fee/value');
  console.log('─'.repeat(88));
  ['chicago', 'dallas', 'newyork'].forEach((mkt) => {
    YEARS.forEach((year) => {
      const r = rows.find(
        (x) => x.marketId === mkt && x.year === year && x.sport === 'PRO_FOOTBALL' && x.format === 'SPORTS_TALK',
      );
      if (!r) return;
      console.log(
        `${mkt.padEnd(12)} ${year}  ${fmtK(r.baseFee).padStart(9)} ${fmtK(r.holderFee).padStart(10)} ${fmtK(r.eraScaledFee).padStart(10)} ` +
          `${String(r.feeVsEraScaled.toFixed(2) + '×').padStart(9)} ${fmtK(r.estAnnualValue).padStart(9)} ${String(r.feeVsValue.toFixed(2) + '×').padStart(9)}`,
      );
    });
  });
}

function printSimTable(simRows) {
  console.log('\n=== Simulated holder · realized revenue lift vs UI estimate ===');
  console.log('market    year  team        format       UI lift   realized/yr  capture  fee/probeRev  fee/lift');
  console.log('─'.repeat(98));
  simRows.forEach((r) => {
    console.log(
      `${r.marketId.padEnd(9)} ${r.year}  ${r.teamId.padEnd(10)} ${r.format.padEnd(12)} ${fmtK(r.uiEstRevLift).padStart(9)} ` +
        `${fmtK(r.annualizedLift).padStart(12)} ${pct(r.liftCapture).padStart(8)} ` +
        `${pct(r.feePctProbeRev).padStart(12)} ${String((r.feeVsRealizedLift || 0).toFixed(2) + '×').padStart(8)}`,
    );
  });
}

function printChicagoNflFeeBurden(rows, simRows) {
  console.log('\n=== Chicago NFL · fee burden vs market (your sanity-check table) ===');
  console.log('year  holderFee   estValue   fee/value  eraScaled  fee/eraSc  fee % mkt billing');
  console.log('─'.repeat(82));
  [1970, 1980, 2000, 2020].forEach((year) => {
    const r = rows.find(
      (x) => x.marketId === 'chicago' && x.year === year && x.teamId === 'bears' && x.format === 'MOR',
    ) || rows.find(
      (x) => x.marketId === 'chicago' && x.year === year && x.sport === 'PRO_FOOTBALL' && x.format === 'NEWS_TALK',
    );
    const sim = simRows.find(
      (x) => x.marketId === 'chicago' && x.year === year && x.teamId === 'bears' && x.format === 'SPORTS_TALK',
    );
    if (!r) return;
    const feePctMkt = r.holderFee / Math.max(r.annualBilling, 1);
    console.log(
      `${year}  ${fmtK(r.holderFee).padStart(9)} ${fmtK(r.estAnnualValue).padStart(10)} ${String(r.feeVsValue.toFixed(2) + '×').padStart(9)} ` +
        `${fmtK(r.eraScaledFee).padStart(10)} ${String(r.feeVsEraScaled.toFixed(2) + '×').padStart(9)} ${pct(feePctMkt).padStart(8)}` +
        (sim ? `  (probe rev ${fmtK(sim.probeAnnualRev)}/yr)` : ''),
    );
  });
}

function main() {
  console.log('Sports rights ROI audit (read-only)');
  const { staticRows, simRows } = runAudit();
  const checks = evaluateChecks(staticRows, simRows);

  printChicagoSpotlight(staticRows);
  printNflCrossEra(staticRows);
  printChicagoNflFeeBurden(staticRows, simRows);
  printSimTable(simRows);

  console.log('\n=== PASS / FAIL ===');
  let failed = 0;
  checks.forEach((c) => {
    console.log(`${c.pass ? 'PASS' : 'FAIL'}: ${c.msg}`);
    if (!c.pass) failed++;
  });

  const payload = {
    generated: new Date().toISOString(),
    note:
      'holderFee uses eraScaledSportsFee×0.85 (typical init, Variant F piecewise). estRevLift uses marketAnnualBilling(year)×estShareGain/2; realized lift = recalc sports share gain + calcRev premium, then seedRev pool split.',
    markets: MARKETS,
    years: YEARS,
    formats: FORMATS,
    checks,
    staticRows,
    simRows,
  };
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${outJson}`);

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed — audit documents mis-calibration; no production changes applied.`);
    process.exit(1);
  }
  console.log('\nAll sports rights ROI checks passed.');
}

main();
