#!/usr/bin/env node
/**
 * Chicago, early 1970s, player share pinned ~7.5%, deterministic world (no AI/events).
 *
 * A) revMult=1.0 — strong books at that share; austerity never arms (PRE === POST).
 * B) revMult≈0.76 — synthetic “middling billing” at the same share; austerity can arm.
 *
 * Run: node scripts/chicago-austerity-harness.mjs
 */
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

const noop = () => {};
const documentStub = {
  getElementById(id) {
    if (id === 'abtn')
      return { disabled: false, textContent: '', style: {}, addEventListener: noop };
    return null;
  },
  querySelectorAll: () => [],
  body: {},
};

function makeLegacySrc(marketId) {
  let legacySrc = fs.readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('Expected ACTIVE_MARKET anchor not found');
  }
  return legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
}

function createCtx() {
  const ctx = vm.createContext({
    console,
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
  ctx.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  ctx.sessionStorage = { getItem() {}, setItem() {} };
  ctx.location = { reload: noop };
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus: noop };
  ctx.alert = noop;
  ctx.fetch = null;
  ctx.btoa = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  ctx.atob = (s) => Buffer.from(String(s), 'base64').toString('utf8');
  return ctx;
}

function loadLegacy(ctx, src) {
  vm.runInContext(src, ctx);
}

function runVariant(ctx, austerityOff, periods, pinShare, prngSeed, revMult, startingCash) {
  const cash0 = startingCash ?? 5_000_000;
  return vm.runInContext(
    `
    (function(){
      var seed = ${prngSeed};
      Math.random = function(){
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      G = genMarket('under');
      G.marketId = 'chicago';
      G.ps = G.stations.filter(function(s){ return s && s.isPlayer; });
      if (G.ps.length !== 1) throw new Error('expected 1 player');
      G._wlHarnessPinPlayerShare = ${pinShare};
      G._wlHarnessDeterministic = true;
      G._wlBudgetAusterityDisabled = ${austerityOff ? 'true' : 'false'};
      G._wlHarnessPlayerRevMult = ${revMult == null ? 'null' : revMult};
      G.cash = ${cash0};
      // Match browser inspect harnesses: solo distress/bankruptcy would strip isPlayer and break G.ps[0].
      if (typeof window !== 'undefined') window.__WL_SHARE_INSPECT_ONLY = true;

      var rows = [];
      var cumEbitda = 0;
      var negPeriods = 0;
      var deepNegMarginPeriods = 0;
      var minCash = G.cash;
      for (var i = 0; i < ${periods}; i++) {
        advTurn();
        var s = G.ps[0];
        var st = s.budgetStress || 0;
        var moraleSum = 0, moraleN = 0;
        Object.values(s.prog || {}).forEach(function(sd){
          if (sd && sd.talent && typeof sd.talent.morale === 'number') {
            moraleSum += sd.talent.morale;
            moraleN++;
          }
        });
        var avgMor = moraleN ? Math.round(moraleSum / moraleN * 10) / 10 : null;
        var progEff = 1 - 0.38 * st;
        var moralePull = Math.max(0.045, 0.08 - 0.03 * st);
        var eb = (s.fin && s.fin.ebitda) || 0;
        var rv = (s.fin && s.fin.rev) || 0;
        var marginPct = rv > 500 ? Math.round((eb / rv) * 1000) / 10 : null;
        if (eb < 0) negPeriods++;
        if (marginPct != null && marginPct <= -10 && marginPct >= -25) deepNegMarginPeriods++;
        cumEbitda += eb;
        if (G.cash < minCash) minCash = G.cash;
        rows.push({
          period: i + 1,
          year: G.year,
          p: G.period,
          sharePct: Math.round((s.rat && s.rat.share || 0) * 1000) / 10,
          rev: rv,
          cost: s.fin && s.fin.cost,
          ebitda: eb,
          marginPct: marginPct,
          budgetStress: Math.round(st * 1000) / 1000,
          avgMorale: avgMor,
          programmingEffMult: Math.round(progEff * 1000) / 1000,
          moralePullVs080: Math.round(moralePull * 1000) / 1000,
          cash: G.cash,
          cumEbitda: cumEbitda
        });
      }
      return {
        rows: rows,
        startCash: ${cash0},
        endCash: G.cash,
        minCash: minCash,
        cumEbitda: cumEbitda,
        negPeriods: negPeriods,
        deepNegMarginPeriods: deepNegMarginPeriods
      };
    })()
    `,
    ctx
  );
}

function printCompare(title, pre, post, periods, verbose) {
  console.log('\n' + '='.repeat(88));
  console.log(title);
  console.log('='.repeat(88));
  for (let i = 0; i < periods; i++) {
    const a = pre.rows[i];
    const b = post.rows[i];
    const dEb = b.ebitda - a.ebitda;
    const mPre = a.marginPct == null ? 'n/a' : `${a.marginPct}%`;
    const mPost = b.marginPct == null ? 'n/a' : `${b.marginPct}%`;
    if (verbose) {
      console.log(
        `P${String(a.period).padStart(2)} ${a.year}-${a.p} sh%${a.sharePct} | ` +
          `PRE  R${a.rev} C${a.cost} m${mPre} E${a.ebitda} cash${a.cash} σ${a.budgetStress} M${a.avgMorale} prog×${a.programmingEffMult} pull${a.moralePullVs080}`
      );
      console.log(
        `         | POST R${b.rev} C${b.cost} m${mPost} E${b.ebitda} cash${b.cash} σ${b.budgetStress} M${b.avgMorale} prog×${b.programmingEffMult} pull${b.moralePullVs080} ΔE${dEb}`
      );
    } else {
      console.log(
        `P${String(a.period).padStart(2)} ${a.year}-${a.p} sh%${a.sharePct} | ` +
          `PRE m${mPre} E${a.ebitda} $${a.cash} σ${a.budgetStress} M${a.avgMorale} prog×${a.programmingEffMult} | ` +
          `POST m${mPost} E${b.ebitda} $${b.cash} σ${b.budgetStress} M${b.avgMorale} prog×${b.programmingEffMult} | ΔE${dEb}`
      );
    }
  }
  console.log('\nSummary:', {
    startCash: pre.startCash,
    pre: {
      cumEbitda: pre.cumEbitda,
      negPeriods: pre.negPeriods,
      periodsMarginNeg10to20: pre.deepNegMarginPeriods,
      endCash: pre.endCash,
      minCash: pre.minCash,
    },
    post: {
      cumEbitda: post.cumEbitda,
      negPeriods: post.negPeriods,
      periodsMarginNeg10to20: post.deepNegMarginPeriods,
      endCash: post.endCash,
      minCash: post.minCash,
    },
    deltaCumEbitda: post.cumEbitda - pre.cumEbitda,
    deltaNegPeriods: post.negPeriods - pre.negPeriods,
    deltaEndCash: post.endCash - pre.endCash,
    deltaMinCash: post.minCash - pre.minCash,
  });
}

const PIN = 0.075;
const SEED = 90210;
const src = makeLegacySrc('chicago');

function dualRunFull(opts) {
  const {
    revMult,
    startingCash,
    periods,
    title,
    verbose = false,
  } = {
    periods: 16,
    startingCash: 5_000_000,
    verbose: false,
    ...opts,
  };
  const preCtx = createCtx();
  loadLegacy(preCtx, src);
  const pre = runVariant(preCtx, true, periods, PIN, SEED, revMult, startingCash);

  const postCtx = createCtx();
  loadLegacy(postCtx, src);
  const post = runVariant(postCtx, false, periods, PIN, SEED, revMult, startingCash);

  printCompare(title, pre, post, periods, verbose);
  return { pre, post };
}

const argv = process.argv.slice(2);
const stressOnly = argv.includes('--stress-only');

if (!stressOnly) {
  console.log(
    'Chicago Underdog · share pin 7.5% · deterministic advTurn\n' +
      'PRE = G._wlBudgetAusterityDisabled · POST = austerity on\n' +
      'marginPct = EBITDA / rev · programmingEffMult = 1 − 0.38×σ'
  );

  dualRunFull({
    revMult: 1.0,
    startingCash: 5_000_000,
    periods: 16,
    title: 'A) revMult 1.0 · $5M start — comfortable mid-pack books',
  });

  dualRunFull({
    revMult: 0.76,
    startingCash: 5_000_000,
    periods: 16,
    title: 'B) revMult 0.76 · $5M start — weaker billing (original stress case)',
  });
}

// C) Tuned: thin cash + deeper haircut → PRE repeatedly ~ -10% to -20% margin, cash bleeds; POST mitigates.
const STRESS = {
  revMult: 0.585,
  startingCash: 340_000,
  periods: 22,
};

dualRunFull({
  ...STRESS,
  title:
    'C) STRESS CASE — revMult 0.585 · start cash $340k · 22 periods · share pin ~7.5%\n' +
    '    Target: PRE deep negative margins + endangered cash; POST smaller losses / σ drag story',
  verbose: true,
});

console.log(
  '\nTip: `node scripts/chicago-austerity-harness.mjs --stress-only` runs only scenario C.'
);
