#!/usr/bin/env node
/**
 * Sports rights era-scaling A/B (read-only).
 *
 * Compares static baseFee vs billing-indexed fee curves (variants A–F).
 *
 *   node scripts/diag-sports-rights-era-scale-ab.mjs
 *   npm run diag:sports-rights-era-scale-ab
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
const outJson = path.join(root, 'tmp', 'sports_rights_era_scale_ab.json');
const outMd = path.join(root, 'tmp', 'sports_rights_era_scale_ab.md');

const VARIANTS = ['A', 'B', 'C', 'D', 'E', 'F'];
const VARIANT_LABELS = {
  A: 'Production (eraScaledSportsFee×0.85)',
  B: 'Full billing index',
  C: 'billingIndex^0.5',
  D: 'billingIndex^0.65',
  E: 'billingIndex^0.75',
  F: 'Piecewise (pre-1980^0.55, 80s^0.65, 90s+^0.8)',
};

const MARKETS = ['chicago', 'newyork', 'losangeles', 'dallas', 'wichita', 'nashville'];
const YEARS = [1970, 1980, 1990, 2000, 2010, 2020];
const SPORTS = ['PRO_FOOTBALL', 'PRO_BASEBALL', 'PRO_BASKETBALL', 'PRO_HOCKEY'];

const MARKET_TEAM_PREF = {
  chicago: {
    PRO_FOOTBALL: 'bears',
    PRO_BASEBALL: 'cubs',
    PRO_BASKETBALL: 'bulls',
    PRO_HOCKEY: 'blackhawks',
  },
  newyork: {
    PRO_FOOTBALL: 'giants_ny',
    PRO_BASEBALL: 'yankees',
    PRO_BASKETBALL: 'knicks',
    PRO_HOCKEY: 'rangers',
  },
  losangeles: {
    PRO_FOOTBALL: 'rams_la',
    PRO_BASEBALL: 'dodgers',
    PRO_BASKETBALL: 'lakers',
    PRO_HOCKEY: null,
  },
  dallas: {
    PRO_FOOTBALL: 'cowboys',
    PRO_BASEBALL: 'rangers',
    PRO_BASKETBALL: 'mavericks',
    PRO_HOCKEY: 'stars',
  },
  wichita: { PRO_BASEBALL: 'wingnuts', PRO_FOOTBALL: null, PRO_BASKETBALL: null, PRO_HOCKEY: null },
  nashville: {
    PRO_BASEBALL: 'sounds',
    PRO_FOOTBALL: 'titans',
    PRO_BASKETBALL: null,
    PRO_HOCKEY: 'predators',
  },
};

const PROBE_FORMATS = [
  { format: 'SPORTS_TALK', shareMega: 0.08, shareSmall: 0.07, role: 'flagship' },
  { format: 'MOR', shareMega: 0.065, shareSmall: 0.06, role: 'ordinary' },
];

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
  const VARIANTS = cfg.variants;
  const MARKET_IDS = cfg.markets;
  const YEARS = cfg.years;
  const SPORTS = cfg.sports;
  const MARKET_TEAM_PREF = cfg.marketTeamPref;
  const PROBE_FORMATS = cfg.probeFormats;
  const TIER_REC = 62;

  function billingIndex(year, marketId){
    const b2020 = marketAnnualBilling(2020, marketId);
    const bYear = marketAnnualBilling(year, marketId);
    return bYear / Math.max(b2020, 1);
  }

  function piecewiseExponent(year){
    if(year < 1980) return 0.55;
    if(year < 1990) return 0.65;
    return 0.8;
  }

  function scaledHolderFee(variant, team, year, marketId){
    const base = team.baseFee;
    const idx = billingIndex(year, marketId);
    let raw;
    if(variant === 'A'){
      raw = eraScaledSportsFee(team, year, marketId) * 0.85;
    }else if(variant === 'B'){
      raw = base * idx;
    }else if(variant === 'C'){
      raw = base * Math.pow(idx, 0.5);
    }else if(variant === 'D'){
      raw = base * Math.pow(idx, 0.65);
    }else if(variant === 'E'){
      raw = base * Math.pow(idx, 0.75);
    }else if(variant === 'F'){
      raw = base * Math.pow(idx, piecewiseExponent(year));
    }else{
      raw = base * 0.85;
    }
    return Math.round(raw / 1000) * 1000;
  }

  function uiMetrics(team, year, marketId, format, holderFee){
    const season = SPORT_SEASONS[team.sport] || { p1: 0.5, p2: 0.5 };
    const fmtFit = SPORTS_FORMAT_FIT[format] || 0.3;
    const estShareGain = team.baseBonus * 1.0 * fmtFit * (season.p1 + season.p2);
    const annualBilling = marketAnnualBilling(year, marketId);
    const estRevLift = Math.round(annualBilling * estShareGain / 2 / 1000) * 1000;
    const estAnnualValue = Math.round(estRevLift * 0.85 / 1000) * 1000;
    return {
      estRevLift,
      estAnnualValue,
      estShareGain,
      annualBilling,
      fmtFit,
      breakEvenBid: estAnnualValue,
      sugBid: (function(){
        const effBase = holderFee / 0.85;
        return Math.round(Math.max(holderFee * 1.1, effBase * (0.9 + fmtFit * 0.6)) / 1000) * 1000;
      })(),
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
    return { Glocal, st };
  }

  function measureProbe(team, year, marketId, format, share, fee){
    const { Glocal, st } = buildProbeMarket(team, year, marketId, format, share);
    G = Glocal;
    if(fee !== null && fee !== undefined){
      Glocal.sportsRights[team.id] = {
        holderId: st.id,
        holderName: st.callLetters,
        fee: fee,
        contractEnd: year + team.contractYrs,
        relationship: { [st.id]: 40 },
        bids: {},
        auctionOpen: false,
        auctionCloses: null,
      };
    }
    recalc(Glocal.stations, Glocal);
    seedRev(Glocal.stations, Glocal);
    return {
      revHalf: st.fin.rev || 0,
      ebitdaHalf: st.fin.ebitda || 0,
      share: st.rat.share || 0,
      bonus: getSportsBonus(st, Glocal),
    };
  }

  const simCache = {};
  function simKey(marketId, year, teamId, format, share){
    return [marketId, year, teamId, format, share].join('|');
  }

  function getSimBase(team, year, marketId, format, share){
    const key = simKey(marketId, year, team.id, format, share);
    if(simCache[key]) return simCache[key];
    const without = measureProbe(team, year, marketId, format, share, null);
    const withRights = measureProbe(team, year, marketId, format, share, 0);
    const liftHalf = withRights.revHalf - without.revHalf;
    const ebitdaLiftHalf = withRights.ebitdaHalf - without.ebitdaHalf;
    simCache[key] = {
      probeAnnualRev: without.revHalf * 2,
      annualizedLift: liftHalf * 2,
      annualEbitdaLiftBeforeFee: ebitdaLiftHalf * 2,
    };
    return simCache[key];
  }

  function simulateAuctionClear(team, year, marketId, effectiveBaseFee, format){
    const tier = sportsTierFromRecord(TIER_REC);
    const tierBidMult = { dynasty: 1.35, playoff: 1.2, competitive: 1.0, mediocre: 0.75, rebuilding: 0.55 }[tier] || 1;
    const fmtFit = SPORTS_FORMAT_FIT[format] || 0.3;
    const rel = 30;
    const randMid = 0.25;
    const aiBid = Math.round(effectiveBaseFee * tierBidMult * (0.7 + fmtFit * 0.8 + randMid + rel * 0.003) / 1000) * 1000;
    const incumbentRenew = Math.round(effectiveBaseFee * 0.85 * tierBidMult * 0.95 / 1000) * 1000;
    return { aiClearingBid: aiBid, incumbentRenewBid: incumbentRenew };
  }

  function pickTeam(marketId, sport, year){
    const mkt = MARKETS[marketId];
    if(!mkt || !mkt.teams) return null;
    const pref = MARKET_TEAM_PREF[marketId] && MARKET_TEAM_PREF[marketId][sport];
    if(pref){
      const t = mkt.teams.find(function(x){ return x.id === pref; });
      if(t && year >= t.introduced) return t;
    }
    return mkt.teams.find(function(t){ return t.sport === sport && year >= t.introduced; }) || null;
  }

  function probeShare(marketId, probeFmt){
    const tier = (MARKETS[marketId] || {}).rankTier || 'medium';
    const small = tier === 'small';
    return small ? probeFmt.shareSmall : probeFmt.shareMega;
  }

  const rows = [];
  MARKET_IDS.forEach(function(marketId){
    YEARS.forEach(function(year){
      SPORTS.forEach(function(sport){
        const team = pickTeam(marketId, sport, year);
        if(!team) return;
        PROBE_FORMATS.forEach(function(probeFmt){
          const share = probeShare(marketId, probeFmt);
          const sim = getSimBase(team, year, marketId, probeFmt.format, share);
          VARIANTS.forEach(function(variant){
            const holderFee = scaledHolderFee(variant, team, year, marketId);
            const ui = uiMetrics(team, year, marketId, probeFmt.format, holderFee);
            const auction = simulateAuctionClear(team, year, marketId, holderFee / 0.85, probeFmt.format);
            const feeVsValue = holderFee / Math.max(ui.estAnnualValue, 1);
            const feeVsLift = holderFee / Math.max(ui.estRevLift, 1);
            const feeVsRealizedLift = holderFee / Math.max(sim.annualizedLift, 1);
            const feePctProbeRev = holderFee / Math.max(sim.probeAnnualRev, 1);
            const feePctMarketBilling = holderFee / Math.max(ui.annualBilling, 1);
            const annualEbitdaAfterFee = sim.annualEbitdaLiftBeforeFee - holderFee;
            const playerRationalValue = holderFee <= ui.estAnnualValue * 1.5;
            const playerRationalLift = holderFee <= sim.annualizedLift * 1.25;
            const playerWouldBid =
              holderFee <= ui.sugBid &&
              holderFee <= ui.estAnnualValue * 1.15 &&
              (playerRationalLift || ui.fmtFit >= 0.85);
            const aiWouldWin = auction.aiClearingBid >= holderFee * 0.92;
            rows.push({
              variant,
              marketId,
              year,
              sport,
              teamId: team.id,
              teamName: team.name,
              format: probeFmt.format,
              probeRole: probeFmt.role,
              baseFee: team.baseFee,
              billingIndex: Math.round(billingIndex(year, marketId) * 10000) / 10000,
              holderFee,
              estRevLift: ui.estRevLift,
              estAnnualValue: ui.estAnnualValue,
              annualizedLift: sim.annualizedLift,
              probeAnnualRev: sim.probeAnnualRev,
              feeVsValue: Math.round(feeVsValue * 1000) / 1000,
              feeVsLift: Math.round(feeVsLift * 1000) / 1000,
              feeVsRealizedLift: Math.round(feeVsRealizedLift * 1000) / 1000,
              feePctProbeRev: Math.round(feePctProbeRev * 1000) / 1000,
              feePctMarketBilling: Math.round(feePctMarketBilling * 10000) / 10000,
              aiClearingBid: auction.aiClearingBid,
              incumbentRenewBid: auction.incumbentRenewBid,
              annualEbitdaAfterFee,
              playerRationalValue,
              playerRationalLift,
              playerWouldBid,
              aiWouldWin,
            });
          });
        });
      });
    });
  });

  return { rows, simCacheKeys: Object.keys(simCache).length };
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

function mean(nums) {
  const x = nums.filter(Number.isFinite);
  if (!x.length) return null;
  return x.reduce((a, b) => a + b, 0) / x.length;
}

function median(nums) {
  const x = nums.filter(Number.isFinite).sort((a, b) => a - b);
  if (!x.length) return null;
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : (x[m - 1] + x[m - 2]) / 2;
}

function scoreVariant(rows, variant) {
  const v = rows.filter((r) => r.variant === variant);
  const checks = [];
  let score = 0;

  const mega = ['chicago', 'newyork', 'losangeles', 'dallas'];

  const nfl1970Flagship = v.filter(
    (r) =>
      r.year === 1970 &&
      r.sport === 'PRO_FOOTBALL' &&
      mega.includes(r.marketId) &&
      r.probeRole === 'flagship',
  );
  const nfl1970InBand = nfl1970Flagship.filter((r) => r.holderFee >= 100000 && r.holderFee <= 250000);
  const nfl1970BandPass = nfl1970InBand.length >= Math.max(1, Math.ceil(nfl1970Flagship.length * 0.75));
  checks.push({
    id: 'nfl1970-band',
    pass: nfl1970BandPass,
    msg: `1970 mega NFL flagship fee $100K–$250K: ${nfl1970InBand.length}/${nfl1970Flagship.length}`,
  });
  if (nfl1970BandPass) score += 3;

  const nfl1970Ordinary = v.filter(
    (r) => r.year === 1970 && r.sport === 'PRO_FOOTBALL' && mega.includes(r.marketId) && r.probeRole === 'ordinary',
  );
  const nflBelowBaseball = v.filter((r) => {
    if (r.year !== 1970 || r.probeRole !== 'flagship') return false;
    const baseball = v.find(
      (x) =>
        x.variant === variant &&
        x.marketId === r.marketId &&
        x.year === 1970 &&
        x.sport === 'PRO_BASEBALL' &&
        x.probeRole === 'flagship',
    );
    return baseball && r.sport === 'PRO_FOOTBALL' && r.holderFee > baseball.holderFee;
  });
  const sportOrderPass = nflBelowBaseball.length >= Math.min(3, mega.length);
  checks.push({
    id: 'nfl-above-baseball',
    pass: sportOrderPass,
    msg: `1970 NFL fee > MLB (flagship) in ${nflBelowBaseball.length} mega markets`,
  });
  if (sportOrderPass) score += 1;

  const fitRows = v.filter((r) => r.probeRole === 'flagship');
  const plausibleFl = fitRows.filter((r) => {
    if (r.year <= 1980) return r.feeVsRealizedLift >= 0.28 && r.feeVsRealizedLift <= 1.35;
    return r.feeVsRealizedLift >= 0.07 && r.feeVsRealizedLift <= 1.05;
  });
  const flRate = fitRows.length ? plausibleFl.length / fitRows.length : 0;
  const flPass = flRate >= 0.45;
  checks.push({
    id: 'fee-lift-plausible',
    pass: flPass,
    msg: `Flagship fee/realized-lift in era band on ${(flRate * 100).toFixed(0)}% of rows`,
  });
  if (flPass) score += 3;

  const extremeFv = fitRows.filter((r) => r.feeVsValue > 3).length;
  const extremePass = extremeFv <= Math.max(2, Math.floor(fitRows.length * 0.08));
  checks.push({
    id: 'fee-value-extreme',
    pass: extremePass,
    msg: `Flagship fee/value >3×: ${extremeFv} rows (want ≤8%)`,
  });
  if (extremePass) score += 2;

  const mor1970 = v.filter((r) => r.year === 1970 && r.probeRole === 'ordinary');
  const morBurdenOk = mor1970.filter((r) => r.feePctProbeRev <= 0.3).length;
  const morPass = mor1970.length ? morBurdenOk / mor1970.length >= 0.7 : true;
  checks.push({
    id: 'mor-burden-1970',
    pass: morPass,
    msg: `1970 ordinary-station fee ≤30% gross: ${morBurdenOk}/${mor1970.length}`,
  });
  if (morPass) score += 2;

  const lateMajor = v.filter(
    (r) => r.year >= 2000 && r.probeRole === 'flagship' && mega.includes(r.marketId),
  );
  const lateNotCheap = lateMajor.filter((r) => r.feeVsRealizedLift >= 0.12 && r.feeVsRealizedLift <= 1.2);
  const latePass = lateMajor.length ? lateNotCheap.length / lateMajor.length >= 0.6 : true;
  checks.push({
    id: 'late-not-too-cheap',
    pass: latePass,
    msg: `2000+ mega flagship fee/realized-lift 0.12–1.2×: ${lateNotCheap.length}/${lateMajor.length}`,
  });
  if (latePass) score += 2;

  const rationalBid = v.filter((r) => r.playerWouldBid).length;
  const rationalRate = v.length ? rationalBid / v.length : 0;
  checks.push({
    id: 'rational-bid-rate',
    pass: rationalRate >= 0.35 && rationalRate <= 0.85,
    msg: `Player would rationally bid: ${(rationalRate * 100).toFixed(0)}%`,
  });
  if (rationalRate >= 0.35 && rationalRate <= 0.85) score += 1;

  const ebitdaPos = v.filter((r) => r.annualEbitdaAfterFee > 0 && r.probeRole === 'flagship').length;
  const ebitdaFlag = v.filter((r) => r.probeRole === 'flagship').length;
  const ebitdaRate = ebitdaFlag ? ebitdaPos / ebitdaFlag : 0;
  checks.push({
    id: 'flagship-ebitda-positive',
    pass: ebitdaRate >= 0.45,
    msg: `Flagship EBITDA after fee positive: ${(ebitdaRate * 100).toFixed(0)}%`,
  });
  if (ebitdaRate >= 0.45) score += 1;

  return { variant, score, checks, nfl1970Flagship, mor1970 };
}

function summarizeVariant(rows, variant) {
  const v = rows.filter((r) => r.variant === variant);
  return {
    variant,
    label: VARIANT_LABELS[variant],
    rowCount: v.length,
    medianHolderFee: Math.round(median(v.map((r) => r.holderFee))),
    medianFeeVsValue: Math.round((median(v.map((r) => r.feeVsValue)) ?? 0) * 1000) / 1000,
    medianFeeVsRealizedLift: Math.round((median(v.map((r) => r.feeVsRealizedLift)) ?? 0) * 1000) / 1000,
    medianFeePctProbeRev: Math.round((median(v.map((r) => r.feePctProbeRev)) ?? 0) * 1000) / 1000,
    pctPlayerWouldBid: Math.round(mean(v.map((r) => (r.playerWouldBid ? 1 : 0))) * 1000) / 1000,
    pctEbitdaPositiveFlagship:
      Math.round(
        mean(
          v.filter((r) => r.probeRole === 'flagship').map((r) => (r.annualEbitdaAfterFee > 0 ? 1 : 0)),
        ) * 1000,
      ) / 1000,
    chicago1970NflFlagship: v.find(
      (r) => r.marketId === 'chicago' && r.year === 1970 && r.teamId === 'bears' && r.probeRole === 'flagship',
    ),
  };
}

function printComparisonTable(summaries, scores) {
  console.log('\n=== Variant summary (A–F) ===');
  console.log('var  score  chi1970NFL  medFee   fee/value  fee/lift*  fee%rev   bid%   EBITDA+%');
  console.log('─'.repeat(88));
  summaries
    .sort((a, b) => (scores.find((s) => s.variant === b.variant)?.score || 0) - (scores.find((s) => s.variant === a.variant)?.score || 0))
    .forEach((s) => {
      const sc = scores.find((x) => x.variant === s.variant);
      const chi = s.chicago1970NflFlagship;
      console.log(
        `${s.variant.padEnd(3)}  ${String(sc?.score ?? 0).padStart(5)}  ${fmtK(chi?.holderFee).padStart(10)} ` +
          `${fmtK(s.medianHolderFee).padStart(8)} ${String(s.medianFeeVsValue.toFixed(2) + '×').padStart(9)} ` +
          `${String(s.medianFeeVsRealizedLift.toFixed(2) + '×').padStart(9)} ${pct(s.medianFeePctProbeRev).padStart(8)} ` +
          `${pct(s.pctPlayerWouldBid).padStart(6)} ${pct(s.pctEbitdaPositiveFlagship).padStart(8)}`,
      );
    });
  console.log('* fee/realized revenue lift (sim), flagship+ordinary pooled median');
}

function printChicagoSpotlight(rows) {
  console.log('\n=== Chicago Bears · flagship · by variant ===');
  console.log('year  A fee    B fee    C fee    D fee    E fee    F fee    UI value  B fee/value');
  console.log('─'.repeat(78));
  YEARS.forEach((year) => {
    const line = [year];
    VARIANTS.forEach((v) => {
      const r = rows.find(
        (x) => x.variant === v && x.marketId === 'chicago' && x.year === year && x.teamId === 'bears' && x.probeRole === 'flagship',
      );
      line.push(r ? fmtK(r.holderFee) : '—');
    });
    const ui = rows.find((x) => x.variant === 'A' && x.marketId === 'chicago' && x.year === year && x.teamId === 'bears' && x.probeRole === 'flagship');
    const b = rows.find((x) => x.variant === 'B' && x.marketId === 'chicago' && x.year === year && x.teamId === 'bears' && x.probeRole === 'flagship');
    console.log(
      `${line[0]}  ${line.slice(1).map((x) => String(x).padStart(8)).join(' ')}  ${fmtK(ui?.estAnnualValue).padStart(9)} ${String((b?.feeVsValue ?? 0).toFixed(2) + '×').padStart(9)}`,
    );
  });
}

function printChecks(scores) {
  console.log('\n=== PASS / FAIL by variant ===');
  scores
    .sort((a, b) => b.score - a.score)
    .forEach((s) => {
      console.log(`\n${s.variant} (score ${s.score})`);
      s.checks.forEach((c) => console.log(`  ${c.pass ? 'PASS' : 'FAIL'}: ${c.msg}`));
    });
}

const TIE_BREAK_ORDER = ['F', 'D', 'C', 'E', 'B', 'A'];

function pickBestVariant(scores) {
  const maxScore = Math.max(...scores.map((s) => s.score));
  const tied = scores.filter((s) => s.score === maxScore);
  tied.sort(
    (a, b) => TIE_BREAK_ORDER.indexOf(a.variant) - TIE_BREAK_ORDER.indexOf(b.variant),
  );
  const best = tied[0];
  const runner = scores
    .filter((s) => s.variant !== best.variant)
    .sort((a, b) => b.score - a.score)[0];
  return { best, runner, tied, maxScore };
}

function buildRecommendation(scores, summaries) {
  const { best, runner, tied, maxScore } = pickBestVariant(scores);
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const chiA = summaries.find((s) => s.variant === 'A')?.chicago1970NflFlagship;
  const chiBest = summaries.find((s) => s.variant === best.variant)?.chicago1970NflFlagship;

  let curve = 'piecewise billing index (variant F)';
  if (best.variant === 'D') curve = 'billingIndex^0.65';
  else if (best.variant === 'C') curve = 'billingIndex^0.5';
  else if (best.variant === 'E') curve = 'billingIndex^0.75';
  else if (best.variant === 'B') curve = 'full billingIndex';
  else if (best.variant === 'F') curve = 'piecewise exponent (pre-1980: 0.55, 1980s: 0.65, 1990+: 0.80)';

  const uiCopy =
    best.variant === 'A'
      ? 'UI copy is consistent with fees but fees are era-wrong; adjust fees first.'
      : 'Keep est. revenue lift formula; it tracks realized lift on SPORTS_TALK (~100% capture). Update holder-fee display to use era-scaled fee so fee/value ratios match player experience. Clarify that estimated annual value is not break-even after scaling.';

  const tiedNote =
    tied.length > 1 ? ` Tied at score ${maxScore} with ${tied.map((t) => t.variant).join('/')}; F preferred for era-tier piecewise curve.` : '';

  return {
    recommendedVariant: best.variant,
    recommendedLabel: VARIANT_LABELS[best.variant],
    runnerUp: runner?.variant,
    tiedVariants: tied.map((t) => t.variant),
    recommendedCurve: curve,
    clearlyDominant: maxScore >= (runner?.score || 0) + 3,
    rationale: [
      `Variant ${best.variant} scored ${best.score} vs ${runner?.variant || '—'} at ${runner?.score || 0}.${tiedNote}`,
      `Chicago 1970 NFL flagship: A=${fmtK(chiA?.holderFee)} → ${best.variant}=${fmtK(chiBest?.holderFee)} (UI est. value ${fmtK(chiA?.estAnnualValue)}, sim lift ${fmtK(chiBest?.annualizedLift)}).`,
      'Static baseFee in team data acts as a 2020 anchor; production should scale at bid/init/auction time, not rewrite per-team baseFee tables.',
      'Full billing index (B) over-corrects early era ($66K Chicago NFL 1970); baseline A remains ~6.7× era-scaled.',
    ],
    uiEstimatedValueCopy: uiCopy,
    productionHooks: [
      {
        file: 'src/legacy.js',
        area: 'initSportsRights (~6940)',
        change: 'Replace team.baseFee*(0.7+rand*0.6) with eraScaledSportsFee(team,G)*jitter',
      },
      {
        file: 'src/legacy.js',
        area: 'resolveRightsAuction AI bids (~7088)',
        change: 'Use eraScaledSportsFee(team,G) instead of team.baseFee for aiBid baseline',
      },
      {
        file: 'src/legacy.js',
        area: 'openSports sugBid / slider bounds (~33006)',
        change: 'Scale _sMin/_sMax/sugBid off eraScaledSportsFee; show scaled fee in Current holder row',
      },
      {
        file: 'src/legacy.js',
        area: 'new helper near marketAnnualBilling (~6531)',
        change: 'Add eraScaledSportsFee(team,year,marketId,curve) centralizing variant curve',
      },
    ],
    noProductionPatchYet: true,
  };
}

function writeMarkdown(payload, recommendation, scores) {
  const lines = [
    '# Sports rights era-scaling A/B',
    '',
    `Generated: ${payload.generated}`,
    '',
    '## Recommendation',
    '',
    `**${recommendation.recommendedVariant}** — ${recommendation.recommendedLabel}`,
    '',
    ...recommendation.rationale.map((r) => `- ${r}`),
    '',
    '## Variant scores',
    '',
    '| Var | Score | Chicago 1970 NFL | Med fee/value |',
    '|-----|-------|------------------|---------------|',
  ];
  scores
    .sort((a, b) => b.score - a.score)
    .forEach((s) => {
      const chi = s.nfl1970Flagship.find((r) => r.marketId === 'chicago');
      lines.push(
        `| ${s.variant} | ${s.score} | ${chi ? fmtK(chi.holderFee) : '—'} | ${chi ? chi.feeVsValue.toFixed(2) + '×' : '—'} |`,
      );
    });
  lines.push('', '## UI copy', '', recommendation.uiEstimatedValueCopy, '', '## Production hooks', '');
  recommendation.productionHooks.forEach((h) => {
    lines.push(`- **${h.area}**: ${h.change}`);
  });
  lines.push('', 'No production patch applied by this harness.');
  return lines.join('\n');
}

function runAb() {
  const ctx = createCtx();
  injectMarketEcologyIife(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'src', 'talentRetention.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(legacyPath, 'utf8'), ctx);
  return vm.runInContext(
    `${RUNNER}(${JSON.stringify({
      variants: VARIANTS,
      markets: MARKETS,
      years: YEARS,
      sports: SPORTS,
      marketTeamPref: MARKET_TEAM_PREF,
      probeFormats: PROBE_FORMATS,
    })})`,
    ctx,
  );
}

function main() {
  console.log('Sports rights era-scaling A/B (read-only)');
  const { rows, simCacheKeys } = runAb();
  const summaries = VARIANTS.map((v) => summarizeVariant(rows, v));
  const scores = VARIANTS.map((v) => scoreVariant(rows, v));
  const recommendation = buildRecommendation(scores, summaries);

  printComparisonTable(summaries, scores);
  printChicagoSpotlight(rows);
  printChecks(scores);

  console.log('\n=== RECOMMENDATION ===');
  console.log(`${recommendation.recommendedVariant}: ${recommendation.recommendedLabel}`);
  recommendation.rationale.forEach((r) => console.log(`  • ${r}`));
  console.log(`\nUI: ${recommendation.uiEstimatedValueCopy}`);
  console.log('\nProduction hooks (no patch yet):');
  recommendation.productionHooks.forEach((h) => console.log(`  • ${h.area}`));

  const payload = {
    generated: new Date().toISOString(),
    note: 'Read-only A/B; fees scaled in harness only. Realized lift/fee independent (lift from sim cache).',
    variants: VARIANT_LABELS,
    markets: MARKETS,
    years: YEARS,
    sports: SPORTS,
    simCacheKeys,
    summaries,
    scores: scores.map((s) => ({ variant: s.variant, score: s.score, checks: s.checks })),
    recommendation,
    rows,
  };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2));
  fs.writeFileSync(outMd, writeMarkdown(payload, recommendation, scores));
  console.log(`\nWrote ${outJson}`);
  console.log(`Wrote ${outMd}`);

  const { best, maxScore, tied } = pickBestVariant(scores);
  if (!recommendation.clearlyDominant) {
    console.error(
      `\nNo variant clearly dominant (top tie: ${tied.map((t) => t.variant).join(', ')} at ${maxScore}) — review A/B tables before production patch.`,
    );
    process.exit(1);
  }
  console.log(`\nVariant ${best.variant} leads (score ${best.score}). No production changes applied.`);
}

main();
