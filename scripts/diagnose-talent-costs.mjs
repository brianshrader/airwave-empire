#!/usr/bin/env node
/**
 * Talent cost diagnostics — measurement only (no balance changes).
 *
 *   node scripts/diagnose-talent-costs.mjs
 *   node scripts/diagnose-talent-costs.mjs --mode=full
 *   node scripts/diagnose-talent-costs.mjs --mode=breakdown
 *   node scripts/diagnose-talent-costs.mjs --mode=sensitivity
 *   node scripts/diagnose-talent-costs.mjs --mode=bundle
 *   node scripts/diagnose-talent-costs.mjs --json=tmp/talent_cost_diagnostic.json
 *   node scripts/diagnose-talent-costs.mjs --markets=newyork,losangeles --years=2005,2015
 *
 * Modes:
 *   breakdown   — Part 1: expense mix by station / market / era / format
 *   sensitivity — Part 2: cost-only shocks to talent (margin / health)
 *   tiers       — Part 3: aggregate by market rankTier
 *   formats     — Part 4: aggregate by format bucket
 *   bundle      — Part 6: hypothetical talent “bundle” multiplier on top of salary (diagnostic only)
 *   verdicts    — Part 5: interpretive labels from observed sensitivity
 *   full        — all of the above (default)
 *
 * Verdict thresholds (documented — margin swing vs baseline when talent cost is halved):
 *   negligible  < 1.0 percentage points of margin
 *   modest      1.0–3.0 pp
 *   meaningful  3.0–8.0 pp
 *   dominant    ≥ 8.0 pp
 *
 * Env: VALIDATION_QUIET=0 — show legacy console.log inside the VM
 */
/* eslint-disable no-console */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const defaultJsonOut = path.join(root, 'tmp', 'talent_cost_diagnostic.json');

const DEFAULT_MARKETS = ['newyork', 'losangeles', 'chicago', 'atlanta', 'nashville', 'seattle'];
const DEFAULT_YEARS = [1975, 1985, 1995, 2005, 2015, 2025];

/** Keys → ordered list of legacy format ids to try (first match wins). */
const FORMAT_PICK = {
  top40_chr: ['TOP40', 'CHR'],
  album_rock: ['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK'],
  news_talk: ['NEWS_TALK', 'ALL_NEWS', 'SPORTS_TALK'],
  country: ['COUNTRY'],
  ac_easy: ['ADULT_CONTEMP', 'HOT_AC', 'MOR'],
  oldies_mor: ['OLDIES', 'MOR', 'ADULT_STANDARDS'],
  public_news: ['PUBLIC_NEWS'],
};

const FORMAT_LABEL = {
  top40_chr: 'Top 40 / CHR',
  album_rock: 'Album / classic / alt rock',
  news_talk: 'News / talk (incl. all-news / sports talk)',
  country: 'Country',
  ac_easy: 'AC / Hot AC / MOR',
  oldies_mor: 'Oldies / standards / MOR',
  public_news: 'Public news (non-commercial)',
};

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function loadLegacySrc() {
  let src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  return injectHeadlessMegaFragNewsGuard(src);
}

function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
  };
}

const documentStub = {
  body: { innerHTML: '' },
  head: { appendChild() {} },
  createElement() {
    return { href: '', download: '', click() {} };
  },
  getElementById() {
    return stubEl();
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
  readyState: 'complete',
};

function createVmContext(quiet) {
  const noop = () => {};
  const ctx = vm.createContext({
    console: quiet
      ? { log: noop, warn: noop, error: console.error, table: noop }
      : console,
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() {
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class {
      constructor() {}
    },
    FileReader: class {
      readAsText() {}
    },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) {
          typedArray[i] = Math.floor(Math.random() * 256);
        }
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

function loadSim(ctx) {
  vm.runInContext(loadLegacySrc(), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
}

function installRunner(ctx) {
  const code = `
(function () {
  var FORMAT_PICK = ${JSON.stringify(FORMAT_PICK)};
  var FORMAT_KEYS = ${JSON.stringify(Object.keys(FORMAT_PICK))};

  function sanitizeShare(s) {
    var sh = s && s.rat && s.rat.share;
    if (!isFinite(sh) || sh < 0) return 0;
    return sh;
  }

  /** Mirrors classifyCommercialHealthDiagnostic but allows EBITDA override (cost shocks). */
  function healthWithEbitda(s, ebitdaOverride) {
    if (!s) return 'weak';
    if (s.isZombie) return 'zombie';
    if (s.isNicheSurvival) return 'niche_survivor';
    var share = sanitizeShare(s);
    var rev = Math.max(s.fin && s.fin.rev ? s.fin.rev : 0, 1);
    var ebitda = ebitdaOverride != null ? ebitdaOverride : (s.fin && isFinite(s.fin.ebitda) ? s.fin.ebitda : 0);
    var stress = ebitda < -0.28 * rev;
    if (share >= 0.045 && !stress) return 'healthy';
    if (share >= 0.022 && ebitda >= -0.22 * rev) return 'viable';
    if (share >= 0.012 && ebitda >= -0.38 * rev) return 'viable';
    return 'weak';
  }

  function marginAt(s, talMult) {
    var fin = s.fin || {};
    var rev = fin.rev || 0;
    var cost = fin.cost || 0;
    var tal = fin.tal || 0;
    var newCost = cost + tal * (talMult - 1);
    var ebitda = rev - newCost;
    var margin = rev > 0 ? ebitda / rev : null;
    return { rev: rev, cost: newCost, tal: Math.round(tal * talMult), ebitda: ebitda, margin: margin };
  }

  function pickStation(G, formatKey) {
    var targets = FORMAT_PICK[formatKey];
    if (!targets || !targets.length) return null;
    var list = (G.stations || []).filter(function (st) {
      return st && !st._bpSlotDeferred;
    });
    if (formatKey === 'public_news') {
      var pubs = list.filter(function (st) {
        return st.isPublic && targets.indexOf(st.format) >= 0;
      });
      pubs.sort(function (a, b) {
        return (b.rat && b.rat.share ? b.rat.share : 0) - (a.rat && a.rat.share ? a.rat.share : 0);
      });
      return pubs[0] || null;
    }
    var comm = list.filter(function (st) {
      return !st.isPublic;
    });
    comm.sort(function (a, b) {
      return (b.rat && b.rat.share ? b.rat.share : 0) - (a.rat && a.rat.share ? a.rat.share : 0);
    });
    var ti, j;
    for (ti = 0; ti < targets.length; ti++) {
      var want = targets[ti];
      for (j = 0; j < comm.length; j++) {
        if (comm[j].format === want) return comm[j];
      }
    }
    return null;
  }

  function commercialRank(s, G) {
    var comm = (G.stations || [])
      .filter(function (st) {
        return st && !st._bpSlotDeferred && !st.isPublic;
      })
      .sort(function (a, b) {
        return (b.rat && b.rat.share ? b.rat.share : 0) - (a.rat && a.rat.share ? a.rat.share : 0);
      });
    var idx = comm.findIndex(function (st) {
      return st.id === s.id;
    });
    return idx < 0 ? null : idx + 1;
  }

  function expenseBuckets(s, totalCost) {
    var fin = s.fin || {};
    var fix = fin.fix || 0;
    var tal = fin.tal || 0;
    var sa = fin.salesAdmin || 0;
    var ops = fin.opsFloor || 0;
    var promo = fin.effPromo || 0;
    var prog = fin.effProg || 0;
    var stream = fin.streamUpkeep || 0;
    var synd = fin.syndicationRights || 0;
    var simf = fin.simulcastProgFee || 0;
    var amHits = fin.amHitsContestOpex || 0;
    var ident = s.identityBudget || 0;
    var ai = fin.aiLoanInterest || 0;
    var sum =
      fix +
      tal +
      sa +
      ops +
      promo +
      prog +
      stream +
      synd +
      simf +
      amHits +
      ident +
      ai;
    var other = Math.max(0, (totalCost || 0) - sum);
    return {
      fix: fix,
      talent: tal,
      salesAdmin: sa,
      opsFloor: ops,
      promo: promo,
      prog: prog,
      streamUpkeep: stream,
      syndicationRights: synd,
      simulcastProgFee: simf,
      amHitsContestOpex: amHits,
      identityBudget: ident,
      aiLoanInterest: ai,
      otherUnallocated: other,
    };
  }

  function scenarioPack(s) {
    var mults = [1, 0.75, 0.5, 1.25, 1.5, 2, 3];
    var out = {};
    var base = marginAt(s, 1);
    var i, m, mo, hb, ha;
    for (i = 0; i < mults.length; i++) {
      m = mults[i];
      mo = marginAt(s, m);
      hb = healthWithEbitda(s, mo.ebitda);
      ha = base.ebitda != null ? mo.ebitda - base.ebitda : 0;
      out['talentMult_' + String(m).replace('.', '_')] = {
        talentMultiplier: m,
        halfPeriodProfit: mo.ebitda,
        margin: mo.margin,
        marginPct: mo.margin != null ? mo.margin * 100 : null,
        profitDeltaVsBaseline: ha,
        marginDeltaVsBaselinePct: base.margin != null && mo.margin != null ? (mo.margin - base.margin) * 100 : null,
        health: hb,
        healthVsBaseline: hb !== healthWithEbitda(s, base.ebitda) ? 'changed' : 'same',
      };
    }
    return { baseline: out.talentMult_1, scenarios: out };
  }

  function bundlePack(s) {
    var bundles = [1, 1.5, 2, 3];
    var out = {};
    var base = marginAt(s, 1);
    var i, b, mo;
    for (i = 0; i < bundles.length; i++) {
      b = bundles[i];
      mo = marginAt(s, b);
      out['bundle_' + String(b).replace('.', '_')] = {
        effectiveTalentMultiplierVsSalaryLine: b,
        halfPeriodProfit: mo.ebitda,
        marginPct: mo.margin != null ? mo.margin * 100 : null,
        profitDeltaVsBaseline: mo.ebitda - base.ebitda,
        health: healthWithEbitda(s, mo.ebitda),
      };
    }
    return out;
  }

  function extractRow(G, formatKey) {
    var s = pickStation(G, formatKey);
    if (!s) {
      return { formatKey: formatKey, stationFound: false };
    }
    var fin = s.fin || {};
    var rev = fin.rev || 0;
    var cost = fin.cost || 0;
    var tal = fin.tal || 0;
    var ebitda = fin.ebitda;
    var margin = rev > 0 ? ebitda / rev : null;
    var tier = (MARKETS[G.marketId || ACTIVE_MARKET] || {}).rankTier || 'unknown';
    var band = s.sig && s.sig.type ? s.sig.type : null;
    var buckets = expenseBuckets(s, cost);
    var pk = scenarioPack(s);
    return {
      formatKey: formatKey,
      stationFound: true,
      callLetters: s.callLetters,
      internalFormat: s.format,
      marketId: G.marketId || ACTIVE_MARKET,
      marketTier: tier,
      year: G.year,
      period: G.period,
      band: band,
      commercialRankByShare: s.isPublic ? null : commercialRank(s, G),
      rev: rev,
      cost: cost,
      ebitda: ebitda,
      margin: margin,
      marginPct: margin != null ? margin * 100 : null,
      talent: tal,
      talentPctOfExpense: cost > 0 ? (tal / cost) * 100 : null,
      talentPctOfRevenue: rev > 0 ? (tal / rev) * 100 : null,
      expenseBuckets: buckets,
      health: typeof classifyCommercialHealthDiagnostic === 'function' ? classifyCommercialHealthDiagnostic(s) : healthWithEbitda(s, null),
      sensitivity: pk,
      bundle: bundlePack(s),
      diagnosticNote:
        s.isPublic && rev === 0
          ? 'Non-commercial station: fin.rev/talent may be zero in this P&L snapshot — use public-radio tooling for underwriting-style economics.'
          : null,
    };
  }

  window.__talentDiag_runCell = function (marketId, targetYear, seed) {
    var origR = Math.random;
    var s = seed;
    Math.random = function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    var ui = typeof window._harnessPatchTimersAndUi === 'function' ? window._harnessPatchTimersAndUi() : { restore: function () {} };
    try {
      ACTIVE_MARKET = marketId;
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(marketId);
      var eraKey = targetYear < 1985 ? '1970' : '1985';
      G = genMarketMP(eraKey);
      MP.mode = 'solo';
      MP.isHost = false;
      if (MP.players) MP.players = [];
      var adv = advanceGToYearPeriod(targetYear, 2, 950);
      if (!adv.ok) {
        return {
          ok: false,
          marketId: marketId,
          targetYear: targetYear,
          error: adv.error || 'advance failed',
          at: adv.at,
          steps: adv.steps,
        };
      }
      var tier = (MARKETS[marketId] || {}).rankTier || 'unknown';
      var rows = [];
      var k;
      for (k = 0; k < FORMAT_KEYS.length; k++) {
        rows.push(extractRow(G, FORMAT_KEYS[k]));
      }
      return {
        ok: true,
        marketId: marketId,
        targetYear: targetYear,
        marketTier: tier,
        advSteps: adv.steps,
        calendarYear: G.year,
        calendarPeriod: G.period,
        rows: rows,
      };
    } finally {
      ui.restore();
      Math.random = origR;
    }
  };
})();
`;
  vm.runInContext(code, ctx);
}

function parseArgs(argv) {
  let mode = 'full';
  let jsonOut = null;
  let jsonFlag = false;
  const markets = [];
  const years = [];
  let listFormats = null;
  for (const a of argv) {
    if (a.startsWith('--mode=')) mode = a.slice('--mode='.length).toLowerCase();
    else if (a === '--json') {
      jsonFlag = true;
      jsonOut = defaultJsonOut;
    } else if (a.startsWith('--json=')) {
      jsonFlag = true;
      jsonOut = a.slice('--json='.length);
    } else if (a.startsWith('--markets=')) {
      markets.push(...a.slice('--markets='.length).split(',').map((x) => x.trim()).filter(Boolean));
    } else if (a.startsWith('--years=')) {
      years.push(
        ...a
          .slice('--years='.length)
          .split(',')
          .map((x) => parseInt(x.trim(), 10))
          .filter((n) => Number.isFinite(n))
      );
    } else if (a.startsWith('--formats=')) {
      listFormats = a
        .slice('--formats='.length)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }
  const useMarkets = markets.length ? markets : DEFAULT_MARKETS;
  const useYears = years.length ? years : DEFAULT_YEARS;
  const useFormats = listFormats && listFormats.length ? listFormats : Object.keys(FORMAT_PICK);
  for (const f of useFormats) {
    if (!FORMAT_PICK[f]) console.warn('Unknown format key (skipped):', f);
  }
  const fmtFiltered = useFormats.filter((f) => FORMAT_PICK[f]);
  return { mode, jsonOut: jsonFlag ? jsonOut || defaultJsonOut : null, markets: useMarkets, years: useYears, formats: fmtFiltered };
}

function verdictFromHalvingMarginDelta(deltaPp, r) {
  if (deltaPp == null || !isFinite(deltaPp)) return 'unknown';
  if (r && r.stationFound && (r.talent <= 0 || r.rev <= 0)) return 'not_applicable';
  if (r && r.stationFound && r.marginPct != null && (Math.abs(r.marginPct) > 120 || Math.abs(r.rev) < 80000)) {
    return 'not_classified_extreme_margin';
  }
  const a = Math.abs(deltaPp);
  if (a < 1) return 'negligible';
  if (a < 3) return 'modest';
  if (a < 8) return 'meaningful';
  return 'dominant';
}

function mean(xs) {
  const v = xs.filter((x) => x != null && isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function topOutliers(rows, n, scoreFn) {
  return [...rows]
    .map((r) => ({ r, sc: scoreFn(r) }))
    .filter((x) => x.sc != null && isFinite(x.sc))
    .sort((a, b) => Math.abs(b.sc) - Math.abs(a.sc))
    .slice(0, n)
    .map((x) => ({ row: x.r, score: x.sc }));
}

function runCell(ctx, marketId, targetYear, seed) {
  return vm.runInContext(`__talentDiag_runCell(${JSON.stringify(marketId)}, ${targetYear}, ${seed})`, ctx);
}

function filterRowsByFormats(cell, formats) {
  if (!cell || !cell.rows) return [];
  return cell.rows.filter((r) => formats.includes(r.formatKey));
}

function attachVerdicts(rows) {
  for (const r of rows) {
    if (!r.stationFound || !r.sensitivity || !r.sensitivity.scenarios) continue;
    const half = r.sensitivity.scenarios.talentMult_0_5;
    const base = r.sensitivity.scenarios.talentMult_1;
    const d = half && base ? half.marginDeltaVsBaselinePct : null;
    r.verdict = {
      halvingMarginDeltaPctPoints: d,
      halvingVerdict: verdictFromHalvingMarginDelta(d, r),
      note:
        'Ratings and revenue are held fixed; only station cost line responds. Syndication/simulcast fees tied to source talent in live code are not re-modeled here.',
    };
  }
}

function printSection(title) {
  console.log('');
  console.log('═'.repeat(Math.min(72, title.length + 4)));
  console.log('  ' + title);
  console.log('═'.repeat(Math.min(72, title.length + 4)));
}

function main() {
  const quietVm = process.env.VALIDATION_QUIET !== '0' && process.env.VALIDATION_QUIET !== 'false';
  const { mode, jsonOut, markets, years, formats } = parseArgs(process.argv.slice(2));
  const ctx = createVmContext(quietVm);
  loadSim(ctx);
  installRunner(ctx);

  const cells = [];
  let seedBase = 771000;
  for (let mi = 0; mi < markets.length; mi++) {
    for (let yi = 0; yi < years.length; yi++) {
      const mkt = markets[mi];
      const yr = years[yi];
      const seed = seedBase + mi * 9029 + yi * 313;
      const cell = runCell(ctx, mkt, yr, seed);
      cells.push({ marketId: mkt, targetYear: yr, seed, cell });
    }
  }

  const flatRows = [];
  for (const { marketId, targetYear, seed, cell } of cells) {
    if (!cell.ok) {
      console.warn('Cell failed:', marketId, targetYear, cell.error, cell.at);
      continue;
    }
    const rows = filterRowsByFormats(cell, formats);
    for (const r of rows) {
      const row = {
        marketId,
        targetYear,
        seed,
        marketTier: cell.marketTier,
        advSteps: cell.advSteps,
        ...r,
      };
      flatRows.push(row);
    }
  }

  attachVerdicts(flatRows);

  const wantBreakdown = mode === 'full' || mode === 'breakdown';
  const wantSensitivity = mode === 'full' || mode === 'sensitivity';
  const wantTiers = mode === 'full' || mode === 'tiers';
  const wantFormats = mode === 'full' || mode === 'formats';
  const wantVerdicts = mode === 'full' || mode === 'verdicts' || mode === 'sensitivity';
  const wantBundle = mode === 'full' || mode === 'bundle';

  if (wantBreakdown) {
    printSection('1. Expense breakdown (talent vs other modeled lines)');
    console.log(
      'Per station sample: one simulation per market×year; first station matching each format bucket (see FORMAT_PICK in script).'
    );
    for (const r of flatRows) {
      if (!r.stationFound) {
        console.log(`- ${r.marketId} ${r.targetYear} [${r.formatKey}]: no matching station`);
        continue;
      }
      if (r.diagnosticNote) console.log(`  (${r.diagnosticNote})`);
      const b = r.expenseBuckets || {};
      console.log(
        `• ${r.marketId} ${r.targetYear} | ${FORMAT_LABEL[r.formatKey] || r.formatKey} | ${r.callLetters} (${r.internalFormat}) ` +
          `${r.band} rank#${r.commercialRankByShare ?? 'n/a'}`
      );
      console.log(
        `    rev $${Math.round(r.rev)}  cost $${Math.round(r.cost)}  EBITDA $${Math.round(r.ebitda)}  margin ${r.marginPct != null ? r.marginPct.toFixed(2) : 'n/a'}%`
      );
      console.log(
        `    talent $${Math.round(r.talent)}  (${r.talentPctOfExpense != null ? r.talentPctOfExpense.toFixed(1) : '?'}% of cost, ` +
          `${r.talentPctOfRevenue != null ? r.talentPctOfRevenue.toFixed(1) : '?'}% of rev)`
      );
      console.log(
        `    buckets (half-period $): fix ${Math.round(b.fix)} | salesAdmin ${Math.round(b.salesAdmin)} | ops ${Math.round(b.opsFloor)} | promo ${Math.round(
          b.promo
        )} | prog ${Math.round(b.prog)} | stream ${Math.round(b.streamUpkeep)} | synd ${Math.round(b.syndicationRights)} | simulcastFee ${Math.round(
          b.simulcastProgFee
        )} | otherΔ ${Math.round(b.otherUnallocated || 0)}`
      );
    }
  }

  if (wantSensitivity) {
    printSection('2. Talent cost sensitivity (algebraic shocks; revenue unchanged)');
    for (const r of flatRows) {
      if (!r.stationFound) continue;
      const sc = r.sensitivity && r.sensitivity.scenarios;
      if (!sc) continue;
      console.log(`• ${r.marketId} ${r.targetYear} ${r.formatKey} ${r.callLetters} (${r.internalFormat})`);
      const keys = ['talentMult_0_5', 'talentMult_0_75', 'talentMult_1', 'talentMult_1_25', 'talentMult_1_5', 'talentMult_2', 'talentMult_3'];
      for (const k of keys) {
        const o = sc[k];
        if (!o) continue;
        console.log(
          `    ${k}: margin ${o.marginPct != null ? o.marginPct.toFixed(2) : 'n/a'}%  Δmargin ${o.marginDeltaVsBaselinePct != null ? o.marginDeltaVsBaselinePct.toFixed(2) : 'n/a'} pp  ΔEBITDA $${Math.round(
            o.profitDeltaVsBaseline || 0
          )}  health ${o.health}`
        );
      }
    }
  }

  if (wantTiers) {
    printSection('3. Market tier aggregates');
    const byTier = {};
    for (const r of flatRows) {
      if (!r.stationFound) continue;
      const t = r.marketTier || 'unknown';
      if (!byTier[t]) byTier[t] = [];
      byTier[t].push(r);
    }
    for (const [t, arr] of Object.entries(byTier)) {
      const talPct = mean(arr.map((x) => x.talentPctOfExpense));
      const halvingAbs = mean(
        arr.map((x) => {
          const v =
            x.sensitivity && x.sensitivity.scenarios && x.sensitivity.scenarios.talentMult_0_5
              ? x.sensitivity.scenarios.talentMult_0_5.marginDeltaVsBaselinePct
              : null;
          return v != null && isFinite(v) ? Math.abs(v) : null;
        })
      );
      console.log(
        `Tier ${t}: n=${arr.length}  mean talent % of expense=${talPct != null ? talPct.toFixed(2) : 'n/a'}  mean |Δmargin| halving=${halvingAbs != null ? halvingAbs.toFixed(2) : 'n/a'} pp`
      );
    }
  }

  if (wantFormats) {
    printSection('4. Format aggregates');
    const byFmt = {};
    for (const r of flatRows) {
      if (!r.stationFound) continue;
      const f = r.formatKey;
      if (!byFmt[f]) byFmt[f] = [];
      byFmt[f].push(r);
    }
    for (const f of Object.keys(FORMAT_PICK)) {
      const arr = byFmt[f];
      if (!arr || !arr.length) continue;
      const talPct = mean(arr.map((x) => x.talentPctOfExpense));
      const halvingAbs = mean(
        arr.map((x) => {
          const v =
            x.sensitivity && x.sensitivity.scenarios && x.sensitivity.scenarios.talentMult_0_5
              ? x.sensitivity.scenarios.talentMult_0_5.marginDeltaVsBaselinePct
              : null;
          return v != null && isFinite(v) ? Math.abs(v) : null;
        })
      );
      console.log(
        `${FORMAT_LABEL[f] || f}: n=${arr.length}  mean talent % of expense=${talPct != null ? talPct.toFixed(2) : 'n/a'}  mean |Δmargin| if talent halved=${halvingAbs != null ? halvingAbs.toFixed(2) : 'n/a'} pp`
      );
    }
    const outs = topOutliers(
      flatRows.filter((r) => r.stationFound),
      8,
      (r) => (r.sensitivity && r.sensitivity.scenarios && r.sensitivity.scenarios.talentMult_0_5 ? r.sensitivity.scenarios.talentMult_0_5.marginDeltaVsBaselinePct : null)
    );
    if (outs.length) {
      console.log('Top outliers by |Δmargin| (halving talent):');
      for (const o of outs) {
        const r = o.row;
        console.log(
          `  ${o.score != null ? o.score.toFixed(2) : ''} pp  ${r.marketId} ${r.targetYear} ${r.formatKey} ${r.callLetters} (${r.internalFormat})`
        );
      }
    }
  }

  if (wantVerdicts) {
    printSection('5. Interpretive verdicts (thresholds in file header)');
    for (const r of flatRows) {
      if (!r.stationFound) continue;
      console.log(
        `• ${r.marketId} ${r.targetYear} ${r.formatKey} ${r.callLetters}: ${r.verdict ? r.verdict.halvingVerdict : 'unknown'} ` +
          `(Δmargin halving ${r.verdict && r.verdict.halvingMarginDeltaPctPoints != null ? r.verdict.halvingMarginDeltaPctPoints.toFixed(2) : 'n/a'} pp)`
      );
    }
  }

  if (wantBundle) {
    printSection('6. Optional “talent bundle” experiment (multiplies salary-line talent $ only; diagnostic)');
    console.log('If real-world talent = salary + support + production + promo overhead, total burden might track a multiple of modeled talent $.');
    for (const r of flatRows) {
      if (!r.stationFound || !r.bundle) continue;
      console.log(`• ${r.marketId} ${r.targetYear} ${r.formatKey} ${r.callLetters}`);
      for (const [k, v] of Object.entries(r.bundle)) {
        console.log(
          `    ${k}: margin ${v.marginPct != null ? v.marginPct.toFixed(2) : 'n/a'}%  ΔEBITDA vs baseline $${Math.round(v.profitDeltaVsBaseline || 0)}  health ${v.health}`
        );
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    markets,
    years,
    formats,
    interpretation: {
      talentLine:
        'fin.tal is the modeled on-air talent salary total for the period (from legacy calcRev). It is one additive line inside fin.cost.',
      sensitivityMethod:
        'Scenarios scale only the talent dollar line; revenue, ratings, and all non-talent costs are held fixed (algebraic counterfactual — advTurn is not re-run). Simulcast program fees derived from source-station talent in live code are not re-derived here.',
      eraStarts:
        'genMarketMP("1970") for target years before 1985; genMarketMP("1985") for 1985+; advanceGToYearPeriod(targetYear, 2, maxSteps).',
      publicNews:
        'PUBLIC_NEWS may show fin.rev=0 in this commercial P&L path — exclude from “talent share” conclusions or use sim:public-radio style tools.',
    },
    thresholds: {
      verdictHalvingMarginSwingPP: { negligible: '<1', modest: '1–3', meaningful: '3–8', dominant: '≥8' },
      note: 'Verdict uses absolute margin change (percentage points) when talent cost is multiplied by 0.5, holding revenue and non-talent costs fixed.',
    },
    cells: cells.map(({ marketId, targetYear, seed, cell }) => ({
      marketId,
      targetYear,
      seed,
      ok: cell.ok,
      error: cell.ok ? undefined : cell.error,
      advSteps: cell.advSteps,
      marketTier: cell.marketTier,
    })),
    samples: flatRows,
  };

  if (jsonOut) {
    const dir = path.dirname(jsonOut);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');
    console.log('');
    console.log('Wrote JSON:', jsonOut);
  }
}

main();
