#!/usr/bin/env node
/**
 * Monte Carlo market certification — headless multi-run sim audit (read-only).
 *
 *   npm run diag:market-certification
 *   npm run diag:market-certification -- --markets=phoenix,portland --runs=25
 *   npm run diag:market-certification -- --markets=phoenix --years=1995,2026 --runs=50 --json
 *
 * Artifacts: tmp/market_certification/<market>.json
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';
import {
  aggregateFmtSumToFamilyShares,
  familyForFormat,
  FAMILY_DISPLAY_ORDER,
  loadFormatFamiliesCatalog,
} from './formatFamilyHelpers.mjs';
import {
  aggregateMeansToLeadershipBuckets,
  LEADERSHIP_BUCKET_KEYS,
} from './expectedFormatLeadershipProfile.mjs';
import { TRUTH_AUDIT_SPANISH_BOOK_SNIPPET } from './spanishSubtypeHelpers.mjs';
import {
  enrichSpanishSubtypeOnRows,
  meanSpanishSubtypeAcrossRuns,
} from './spanishSubtypeDiagnostics.mjs';

const require = createRequire(import.meta.url);
const {
  ALL_PLAYABLE_MARKET_IDS,
  DIAG_ONLY_MARKET_IDS,
} = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');
const certDir = path.join(root, 'tmp', 'market_certification');

const DEFAULT_MARKETS = ['phoenix'];
const DEFAULT_YEARS = [1985, 1995, 2005, 2026];
const DEFAULT_RUNS = 100;

const MAX_STEPS_BY_YEAR = {
  1975: 340,
  1985: 260,
  1995: 320,
  2005: 320,
  2026: 320,
};

/** Families reported in certification tables (OTHER = UNMAPPED + REMNANT). */
const CERT_FAMILY_KEYS = [
  'HITS',
  'ROCK',
  'ADULT',
  'COUNTRY',
  'URBAN',
  'SPOKEN',
  'SPANISH',
  'PUBLIC',
  'CHRISTIAN',
  'INSTITUTIONAL',
  'OTHER',
];

const KEY_FORMATS = [
  'TOP40',
  'HOT_AC',
  'ADULT_CONTEMP',
  'COUNTRY',
  'CLASSIC_ROCK',
  'ALBUM_ROCK',
  'ALT_ROCK',
  'AAA',
  'NEWS_TALK',
  'SPORTS_TALK',
  'SPANISH',
  'RELIGIOUS_NETWORK',
  'GOSPEL',
  'URBAN_CONTEMP',
  'SOUL_RNB',
  'MOR',
  'OLDIES',
  'CLASSIC_HITS',
];

const ROCK_FMTS = new Set(['CLASSIC_ROCK', 'ALBUM_ROCK', 'ALT_ROCK', 'AAA', 'CLASSIC_HITS', 'OLDIES']);

function injectHeadlessLaunchNewsGuard(src) {
  let out = src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  return out;
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
    getAttribute() { return null; },
    setAttribute() {},
  };
}

const documentStub = {
  body: { innerHTML: '', appendChild() {}, contains() { return false; } },
  head: { appendChild() {} },
  createElement() { return stubEl(); },
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
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        return a;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
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

function loadCtx() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  const src = injectHeadlessLaunchNewsGuard(readFileSync(legacyPath, 'utf8'));
  vm.runInContext(src, ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  return ctx;
}

function parseArgs(argv) {
  const o = {
    markets: [...DEFAULT_MARKETS],
    years: [...DEFAULT_YEARS],
    runs: DEFAULT_RUNS,
    seed: 20260522,
    json: false,
  };
  for (const a of argv) {
    if (a.startsWith('--markets=')) {
      o.markets = a
        .slice(10)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (a.startsWith('--years=')) {
      o.years = a
        .slice(8)
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((y) => !Number.isNaN(y));
    } else if (a.startsWith('--runs=')) {
      o.runs = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_RUNS);
    } else if (a.startsWith('--seed=')) {
      o.seed = parseInt(a.slice(7), 10) || o.seed;
    } else if (a === '--json') {
      o.json = true;
    }
  }
  return o;
}

function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function distributionStats(values) {
  const xs = values.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return {
    p10: percentile(xs, 0.1),
    median: percentile(xs, 0.5),
    p90: percentile(xs, 0.9),
    mean: m,
    stdev: Math.sqrt(variance),
    n: xs.length,
  };
}

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function check(level, code, message, detail = {}) {
  return { level, code, message, detail, category: detail.category || 'general' };
}

function certFamilyShares(rawFamilies) {
  const out = {};
  for (const k of CERT_FAMILY_KEYS) out[k] = 0;
  for (const [fid, sh] of Object.entries(rawFamilies || {})) {
    if (fid === 'UNMAPPED' || fid === 'REMNANT') out.OTHER = (out.OTHER || 0) + sh;
    else if (CERT_FAMILY_KEYS.includes(fid)) out[fid] = (out[fid] || 0) + sh;
    else out.OTHER = (out.OTHER || 0) + sh;
  }
  return out;
}

function histCount(runs, key) {
  const hist = {};
  for (const r of runs) {
    const k = r[key] || '?';
    hist[k] = (hist[k] || 0) + 1;
  }
  return hist;
}

function enrichRunRow(row) {
  if (!row.ok) return row;
  const { familyShares } = aggregateFmtSumToFamilyShares(row.fmtSum);
  const certFam = certFamilyShares(familyShares);
  const agg = Object.entries(row.fmtSum || {}).map(([k, m]) => ({ k, m }));
  const buckets = aggregateMeansToLeadershipBuckets(agg).buckets;
  const maxFmt = Object.entries(row.fmtSum || {}).reduce(
    (best, [fmt, sh]) => (sh > (best?.sh ?? -1) ? { fmt, sh } : best),
    null,
  );
  row.leaderFamilyId = familyForFormat(row.leaderFmtKey) || 'OTHER';
  row.familyShares = certFam;
  row.leadershipBuckets = buckets;
  row.maxFormatShare = maxFmt?.sh ?? 0;
  row.maxFormatKey = maxFmt?.fmt ?? '';
  row.spokenShare = (buckets.NEWS_TALK_SPORTS ?? 0) + (certFam.SPOKEN || 0) * 0; // bucket is primary
  row.spokenBucket = buckets.NEWS_TALK_SPORTS ?? 0;
  row.chrShare = buckets.TOP40_CHR ?? 0;
  row.publicShare = buckets.PUBLIC_RADIO ?? 0;
  row.spanishShare = buckets.SPANISH ?? 0;
  row.rockFamilyShare = certFam.ROCK ?? 0;
  row.countryShare = buckets.COUNTRY ?? 0;
  row.institutionalShare = certFam.INSTITUTIONAL ?? 0;
  row.christianShare = certFam.CHRISTIAN ?? 0;
  row.urbanShare = buckets.URBAN_RHYTHMIC ?? 0;
  return row;
}

function detectOutliers(run, marketId, year) {
  const flags = [];
  if (run.maxFormatShare > 0.35) flags.push('format_dominance');
  if (run.hhi > 700) flags.push('high_hhi');
  if (run.leaderGap12 > 0.15) flags.push('wide_leader_gap');
  if (run.chrShare < 0.02 && year >= 1995) flags.push('chr_missing');
  if (run.spokenBucket > 0.35) flags.push('spoken_dominance');
  if (run.publicShare > 0.2) flags.push('public_dominance');
  if (run.institutionalShare > 0.15) flags.push('institutional_high');
  if (run.christianShare > 0.25) flags.push('religious_high');

  const prof = MARKET_IDENTITY[marketId];
  if (prof?.highHispanic && year >= 2005 && run.spanishShare < 0.08) flags.push('spanish_missing');
  if (prof?.highHispanic && year >= 2020 && run.spanishShare < 0.14) flags.push('spanish_thin');
  if (prof?.expectCountry && year >= 1995 && run.countryShare < 0.03) flags.push('country_missing');
  if (prof?.weakSpanish && year >= 2020 && run.spanishShare > 0.18) flags.push('spanish_high');

  return flags;
}

const MARKET_IDENTITY = {
  phoenix: {
    label: 'Phoenix',
    highHispanic: true,
    expectCountry: true,
    rankTier: 'large',
  },
  portland: {
    label: 'Portland',
    publicStrong: true,
    weakSpanish: true,
    weakUrban: true,
    rankTier: 'large',
  },
  miami: {
    label: 'Miami',
    highHispanic: true,
    tropicalSpanish: true,
    lowCountry: true,
    rankTier: 'large',
  },
  houston: {
    label: 'Houston',
    highHispanic: true,
    regionalMexican: true,
    expectCountry: true,
    rankTier: 'large',
  },
};

function evaluateTimeline(marketId, byYear, years) {
  const checks = [];
  const sorted = [...years].sort((a, b) => a - b);
  const y0 = sorted[0];
  const yN = sorted[sorted.length - 1];
  const first = byYear[y0];
  const last = byYear[yN];
  if (!first || !last) return checks;

  const prof = MARKET_IDENTITY[marketId] || {};

  const delta = (key) => (last.means?.[key] ?? 0) - (first.means?.[key] ?? 0);

  if (prof.highHispanic) {
    const d = delta('spanishShare');
    if (d >= 0.04) checks.push(check('pass', 'tl_spanish_rise', `Spanish ${pct(first.means.spanishShare)}→${pct(last.means.spanishShare)}`, { category: 'timeline' }));
    else if (d >= 0) checks.push(check('warn', 'tl_spanish_flat', `Spanish rise weak ${pct(first.means.spanishShare)}→${pct(last.means.spanishShare)}`, { category: 'timeline' }));
    else checks.push(check('fail', 'tl_spanish_fall', `Spanish fell ${pct(first.means.spanishShare)}→${pct(last.means.spanishShare)}`, { category: 'timeline' }));
  }

  if (!prof.publicStrong) {
    const pubMid = sorted.map((y) => byYear[y]?.means?.publicShare).filter((x) => x != null);
    const pubMin = pubMid.length ? Math.min(...pubMid) : 0;
    if (pubMin >= 0.015) checks.push(check('pass', 'tl_public_persists', `Public floor ${pct(pubMin)}`, { category: 'timeline' }));
    else checks.push(check('warn', 'tl_public_vanish', 'Public radio nearly absent mid-timeline', { category: 'timeline' }));
  }

  const rockD = delta('rockFamilyShare');
  if (rockD <= -0.02) checks.push(check('pass', 'tl_rock_decline', `Rock ${pct(first.means.rockFamilyShare)}→${pct(last.means.rockFamilyShare)}`, { category: 'timeline' }));
  else if (rockD <= 0.03) checks.push(check('warn', 'tl_rock_flat', `Rock flat ${pct(first.means.rockFamilyShare)}→${pct(last.means.rockFamilyShare)}`, { category: 'timeline' }));
  else checks.push(check('warn', 'tl_rock_rise', `Rock rose ${pct(first.means.rockFamilyShare)}→${pct(last.means.rockFamilyShare)}`, { category: 'timeline' }));

  const chrLast = last.means?.chrShare ?? 0;
  if (chrLast >= 0.04 && chrLast <= 0.22) checks.push(check('pass', 'tl_chr_viable', `CHR ${pct(chrLast)} @${yN}`, { category: 'timeline' }));
  else if (chrLast < 0.04) checks.push(check('warn', 'tl_chr_thin', `CHR ${pct(chrLast)} @${yN}`, { category: 'timeline' }));
  else checks.push(check('warn', 'tl_chr_high', `CHR ${pct(chrLast)} high @${yN}`, { category: 'timeline' }));

  const ctryD = delta('countryShare');
  if (prof.lowCountry && ctryD > 0.05) checks.push(check('warn', 'tl_country_rise', `Country rose in low-country market`, { category: 'timeline' }));
  else if (!prof.lowCountry && ctryD > 0.12) checks.push(check('warn', 'tl_country_explode', `Country +${pct(ctryD)} over arc`, { category: 'timeline' }));
  else checks.push(check('pass', 'tl_country_stable', `Country arc OK`, { category: 'timeline' }));

  if (prof.publicStrong) {
    const pubD = delta('publicShare');
    if (pubD >= -0.01) checks.push(check('pass', 'tl_public_strong', `Public ${pct(first.means.publicShare)}→${pct(last.means.publicShare)}`, { category: 'timeline' }));
    else checks.push(check('warn', 'tl_public_fade', `Public faded ${pct(first.means.publicShare)}→${pct(last.means.publicShare)}`, { category: 'timeline' }));
  }

  return checks;
}

function evaluateIdentity(marketId, marketMeta, byYear) {
  const checks = [];
  const prof = MARKET_IDENTITY[marketId];
  const y26 = byYear[2026] || byYear[Math.max(...Object.keys(byYear).map(Number))];
  if (!y26) {
    checks.push(check('fail', 'no_modern_year', 'No terminal-year stats', { category: 'identity' }));
    return checks;
  }
  const m = y26.means;

  if (marketId === 'phoenix') {
    if (m.spanishShare >= 0.18 && m.spanishShare <= 0.32) checks.push(check('pass', 'phx_spanish', `Spanish ${pct(m.spanishShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'phx_spanish', `Spanish ${pct(m.spanishShare)}`, { category: 'identity' }));
    if (m.rockFamilyShare <= 0.2) checks.push(check('pass', 'phx_rock', `Rock ${pct(m.rockFamilyShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'phx_rock', `Rock ${pct(m.rockFamilyShare)}`, { category: 'identity' }));
    if (m.chrShare >= 0.05) checks.push(check('pass', 'phx_chr', `CHR ${pct(m.chrShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'phx_chr', `CHR thin`, { category: 'identity' }));
    if (m.spokenBucket <= 0.22) checks.push(check('pass', 'phx_spoken', 'Not NYC spoken profile', { category: 'identity' }));
    else checks.push(check('warn', 'phx_spoken', `Spoken ${pct(m.spokenBucket)}`, { category: 'identity' }));
    const rm = y26.spanishSubtype?.meanSubtypeSharePct?.REGIONAL_MEXICAN;
    if (rm != null && rm >= 50) checks.push(check('pass', 'phx_rm', `RM ${rm.toFixed(0)}%`, { category: 'identity' }));
    else checks.push(check('warn', 'phx_rm', 'Regional Mexican not dominant', { category: 'identity' }));
  } else if (marketId === 'portland') {
    if (m.publicShare >= 0.06) checks.push(check('pass', 'pdx_public', `Public ${pct(m.publicShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'pdx_public', `Public ${pct(m.publicShare)}`, { category: 'identity' }));
    const altRock = (y26.formatStats?.ALT_ROCK?.mean ?? 0) + (y26.formatStats?.AAA?.mean ?? 0) + (y26.formatStats?.ALBUM_ROCK?.mean ?? 0);
    if (altRock >= 0.06) checks.push(check('pass', 'pdx_alt', `AAA/alt/AR ${pct(altRock)}`, { category: 'identity' }));
    else checks.push(check('warn', 'pdx_alt', 'AAA/alt lane thin', { category: 'identity' }));
    if (m.urbanShare <= 0.12) checks.push(check('pass', 'pdx_urban', `Urban ${pct(m.urbanShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'pdx_urban', `Urban ${pct(m.urbanShare)} high`, { category: 'identity' }));
    if (m.spanishShare <= 0.1) checks.push(check('pass', 'pdx_spanish', `Spanish ${pct(m.spanishShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'pdx_spanish', `Spanish ${pct(m.spanishShare)}`, { category: 'identity' }));
  } else if (marketId === 'miami') {
    if (m.spanishShare >= 0.2) checks.push(check('pass', 'mia_spanish', `Spanish ${pct(m.spanishShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'mia_spanish', `Spanish ${pct(m.spanishShare)}`, { category: 'identity' }));
    if (m.countryShare <= 0.1) checks.push(check('pass', 'mia_country', `Country ${pct(m.countryShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'mia_country', `Country ${pct(m.countryShare)}`, { category: 'identity' }));
    if (m.rockFamilyShare <= 0.22) checks.push(check('pass', 'mia_rock', `Rock ${pct(m.rockFamilyShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'mia_rock', `Rock ${pct(m.rockFamilyShare)}`, { category: 'identity' }));
  } else if (marketId === 'houston') {
    if (m.spanishShare >= 0.15) checks.push(check('pass', 'hou_spanish', `Spanish ${pct(m.spanishShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'hou_spanish', `Spanish ${pct(m.spanishShare)}`, { category: 'identity' }));
    if (m.countryShare >= 0.06) checks.push(check('pass', 'hou_country', `Country ${pct(m.countryShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'hou_country', `Country ${pct(m.countryShare)}`, { category: 'identity' }));
    if (m.urbanShare >= 0.05) checks.push(check('pass', 'hou_urban', `Urban ${pct(m.urbanShare)}`, { category: 'identity' }));
    else checks.push(check('warn', 'hou_urban', `Urban thin`, { category: 'identity' }));
  } else if (prof) {
    checks.push(check('warn', 'identity_generic', `No bespoke identity rubric for ${marketId}`, { category: 'identity' }));
  } else {
    const hisp = marketMeta?.hispPop2020 ?? 0;
    if (hisp >= 0.2 && m.spanishShare < 0.1) checks.push(check('warn', 'identity_hisp', `High Hispanic meta but Spanish ${pct(m.spanishShare)}`, { category: 'identity' }));
    else checks.push(check('pass', 'identity_default', 'Generic identity OK', { category: 'identity' }));
  }

  return checks;
}

function evaluateStructural(byYear, years, failRate, outlierRate) {
  const checks = [];
  const yN = Math.max(...years);
  const last = byYear[yN];
  if (!last) {
    checks.push(check('fail', 'struct_no_data', 'No terminal-year data', { category: 'structural' }));
    return checks;
  }

  const st = last.structure?.stationCount;
  if (st?.median >= 14 && st.median <= 38) checks.push(check('pass', 'struct_stations', `Stations median ${st.median.toFixed(1)}`, { category: 'structural' }));
  else checks.push(check('warn', 'struct_stations', `Stations median ${st?.median?.toFixed(1) ?? '?'}`, { category: 'structural' }));

  const hhi = last.structure?.hhi;
  if (hhi?.median <= 650) checks.push(check('pass', 'struct_hhi', `HHI median ${hhi.median.toFixed(0)}`, { category: 'structural' }));
  else if (hhi?.median <= 800) checks.push(check('warn', 'struct_hhi', `HHI median ${hhi.median.toFixed(0)}`, { category: 'structural' }));
  else checks.push(check('fail', 'struct_hhi', `HHI median ${hhi?.median?.toFixed(0)} high`, { category: 'structural' }));

  if (failRate <= 0.01) checks.push(check('pass', 'struct_sim_ok', `Sim failure rate ${(failRate * 100).toFixed(1)}%`, { category: 'structural' }));
  else if (failRate <= 0.05) checks.push(check('warn', 'struct_sim_ok', `Sim failures ${(failRate * 100).toFixed(1)}%`, { category: 'structural' }));
  else checks.push(check('fail', 'struct_sim_ok', `Sim failures ${(failRate * 100).toFixed(1)}%`, { category: 'structural' }));

  if (outlierRate <= 0.1) checks.push(check('pass', 'struct_outliers', `Outlier rate ${(outlierRate * 100).toFixed(1)}%`, { category: 'structural' }));
  else if (outlierRate <= 0.2) checks.push(check('warn', 'struct_outliers', `Outlier rate ${(outlierRate * 100).toFixed(1)}%`, { category: 'structural' }));
  else checks.push(check('fail', 'struct_outliers', `Outlier rate ${(outlierRate * 100).toFixed(1)}%`, { category: 'structural' }));

  return checks;
}

function categoryVerdict(checks, category) {
  const subset = checks.filter((c) => c.category === category);
  if (subset.some((c) => c.level === 'fail')) return 'fail';
  if (subset.some((c) => c.level === 'warn')) return 'warn';
  if (subset.length) return 'pass';
  return 'n/a';
}

function buildYearStats(runs, year) {
  const list = runs.filter((r) => r.ok && r.year === year);
  if (!list.length) return null;

  const pick = (fn) => distributionStats(list.map(fn));

  const familyStats = {};
  for (const fam of CERT_FAMILY_KEYS) {
    familyStats[fam] = distributionStats(list.map((r) => r.familyShares?.[fam] ?? 0));
  }

  const formatStats = {};
  for (const fmt of KEY_FORMATS) {
    formatStats[fmt] = distributionStats(list.map((r) => r.fmtSum?.[fmt] ?? 0));
  }

  const topFmtMean = {};
  for (const r of list) {
    for (const [fmt, sh] of Object.entries(r.fmtSum || {})) {
      topFmtMean[fmt] = (topFmtMean[fmt] || 0) + sh;
    }
  }
  const topFormatsMean = Object.entries(topFmtMean)
    .map(([fmt, total]) => ({ fmt, share: total / list.length }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 10);

  const means = {
    stationCount: mean(list.map((r) => r.stationCount)),
    commercialAm: mean(list.map((r) => r.commercialAm)),
    commercialFm: mean(list.map((r) => r.commercialFm)),
    nceCount: mean(list.map((r) => r.nceCount)),
    hhi: mean(list.map((r) => r.hhi)),
    leaderGap12: mean(list.map((r) => r.leaderGap12)),
    spanishShare: mean(list.map((r) => r.spanishShare)),
    rockFamilyShare: mean(list.map((r) => r.rockFamilyShare)),
    chrShare: mean(list.map((r) => r.chrShare)),
    countryShare: mean(list.map((r) => r.countryShare)),
    publicShare: mean(list.map((r) => r.publicShare)),
    urbanShare: mean(list.map((r) => r.leadershipBuckets?.URBAN_RHYTHMIC ?? 0)),
    spokenBucket: mean(list.map((r) => r.spokenBucket)),
  };

  return {
    nRuns: list.length,
    structure: {
      stationCount: pick((r) => r.stationCount),
      commercialAm: pick((r) => r.commercialAm),
      commercialFm: pick((r) => r.commercialFm),
      nceCount: pick((r) => r.nceCount),
      hhi: pick((r) => r.hhi),
      leaderGap12: pick((r) => r.leaderGap12),
    },
    means,
    families: familyStats,
    formatStats,
    topFormatsMean,
    histograms: {
      leaderFmt: histCount(list, 'leaderFmtKey'),
      leaderFamily: histCount(list, 'leaderFamilyId'),
    },
    spanishSubtype: meanSpanishSubtypeAcrossRuns(list),
  };
}

function finalizeVerdict(allChecks, marketId, inPlayable, inDiagOnly, categories) {
  const fail = allChecks.filter((c) => c.level === 'fail').length;
  const warn = allChecks.filter((c) => c.level === 'warn').length;

  const catFail = Object.values(categories).filter((v) => v === 'fail').length;
  const internalReady = fail === 0 && catFail === 0;
  const publicCandidate = internalReady && inPlayable && !inDiagOnly;

  let confidence = 'medium';
  if (fail > 0 || catFail >= 2) confidence = 'low';
  else if (warn <= 4 && catFail === 0) confidence = 'high';
  else if (warn > 10) confidence = 'low';

  return {
    internalReady,
    publicCandidate,
    confidence,
    overall: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
    counts: { pass: allChecks.filter((c) => c.level === 'pass').length, warn, fail },
  };
}

const RUN_IIFE = `
(function(){
  function fmtKey(fmt){
    return typeof canonicalHitsFormatKey==='function'?canonicalHitsFormatKey(fmt):String(fmt||'');
  }
  function isPublicFmt(fmt){
    var f=String(fmt||'');
    return f.indexOf('PUBLIC_')===0;
  }
  function sortBook(stations){
    var list=stations.filter(function(s){return s&&!s._bpSlotDeferred&&s.rat&&typeof s.rat.share==='number';});
    if(typeof sanitizeStationShareForRanking==='function'){
      for(var i=0;i<list.length;i++)sanitizeStationShareForRanking(list[i]);
    }
    list.sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
    return list;
  }
  function sampleOne(marketId, year, seedVal, maxSteps){
    ACTIVE_MARKET=marketId;
    if(typeof syncMarketPopToMarket==='function')syncMarketPopToMarket(marketId);
    var s=seedVal;
    Math.random=function(){ s=(s*9301+49297)%233280; return s/233280; };
    try{
      if(year<=1975){
        var sc=SC.find(function(x){return x.id==='under';});
        var oi=sc.idx; sc.idx=[];
        G=genMarket('under');
        sc.idx=oi;
      } else {
        var sc2=SC.find(function(x){return x.id==='chrwar';});
        var oi2=sc2.idx; sc2.idx=[];
        G=genMarket('chrwar');
        sc2.idx=oi2;
      }
      G.stations.forEach(function(st){st.isPlayer=false;});
      G.ps=[];
      var steps=0;
      while(steps<maxSteps){
        if(G.year===year&&G.period===1)break;
        if(G.year>year||(G.year===year&&G.period>1)) return {ok:false,err:'overshoot'};
        var ui=window._harnessPatchTimersAndUi();
        try{ advTurn(); }finally{ ui.restore(); }
        steps++;
      }
      if(G.year!==year||G.period!==1) return {ok:false,err:'miss'};
      var book=sortBook(G.stations);
      var fmtSum={}, hhi=0;
      var commercialAm=0, commercialFm=0, nceCount=0;
      for(var j=0;j<book.length;j++){
        var sh=book[j].rat.share||0;
        var fk=fmtKey(book[j].format);
        fmtSum[fk]=(fmtSum[fk]||0)+sh;
        hhi+=sh*sh;
      }
      for(var k=0;k<G.stations.length;k++){
        var st=G.stations[k];
        if(!st||st._bpSlotDeferred) continue;
        var sig=st.sig||{};
        var pub=isPublicFmt(st.format);
        if(sig.type==='AM'){
          if(!pub) commercialAm++;
        } else if(sig.type==='FM'){
          if(pub) nceCount++;
          else commercialFm++;
        }
      }
      var lead=book[0]||null;
      var second=book[1]||null;
      var leadSh=lead?(lead.rat.share||0):0;
      var secondSh=second?(second.rat.share||0):0;
      ${TRUTH_AUDIT_SPANISH_BOOK_SNIPPET}
      return {
        ok:true,
        fmtSum:fmtSum,
        hhi:hhi*10000,
        stationCount:G.stations.filter(function(s){return s&&!s._bpSlotDeferred;}).length,
        commercialAm:commercialAm,
        commercialFm:commercialFm,
        nceCount:nceCount,
        leaderFmtKey:lead?fmtKey(lead.format):'',
        leaderShare:leadSh,
        leaderGap12:leadSh-secondSh,
        spanishStationCount:spanishBookStations.length,
        spanishBookStations:spanishBookStations
      };
    }catch(e){ return {ok:false,err:String(e&&e.message||e)}; }
  }
  return { sampleOne: sampleOne };
})();
`;

function certifyMarket(marketId, opts, ctx, api, MARKETS) {
  const t0 = Date.now();
  const years = opts.years;
  const runs = opts.runs;
  const rows = [];
  const origR = Math.random;
  let done = 0;
  const total = years.length * runs;

  for (const year of years) {
    const maxSteps = MAX_STEPS_BY_YEAR[year] ?? 320;
    for (let run = 0; run < runs; run++) {
      const s0 = opts.seed + marketSalt(marketId) * 17 + year * 10007 + run * 9973;
      let r;
      try {
        r = api.sampleOne(marketId, year, s0, maxSteps);
      } catch (e) {
        r = { ok: false, err: String(e?.message || e) };
      } finally {
        Math.random = origR;
      }
      rows.push(enrichRunRow({ marketId, year, run, ...r }));
      done++;
      if (!opts.json && done % Math.max(1, Math.floor(total / 10)) === 0) {
        process.stdout.write(`  ${marketId} ${done}/${total}\r`);
      }
    }
  }
  if (!opts.json) process.stdout.write('\n');

  enrichSpanishSubtypeOnRows(rows.filter((r) => r.ok), ctx, { [marketId]: MARKETS[marketId] });

  const byYear = {};
  for (const year of years) {
    byYear[year] = buildYearStats(rows, year);
  }

  const okRuns = rows.filter((r) => r.ok);
  const failRate = 1 - okRuns.length / Math.max(1, rows.length);

  const outlierRuns = [];
  for (const r of okRuns) {
    const flags = detectOutliers(r, marketId, r.year);
    if (flags.length) outlierRuns.push({ run: r.run, year: r.year, flags, leaderFmt: r.leaderFmtKey, hhi: r.hhi });
  }
  const outlierRate = outlierRuns.length / Math.max(1, okRuns.length);

  const inPlayable = ALL_PLAYABLE_MARKET_IDS.includes(marketId);
  const inDiagOnly = DIAG_ONLY_MARKET_IDS.includes(marketId);
  const marketMeta = MARKETS[marketId] || {};

  const checks = [];
  checks.push(...evaluateStructural(byYear, years, failRate, outlierRate));
  checks.push(...evaluateTimeline(marketId, byYear, years));
  checks.push(...evaluateIdentity(marketId, marketMeta, byYear));

  if (!MARKETS[marketId]) {
    checks.unshift(check('fail', 'market_missing', `${marketId} not in MARKETS — cannot certify`, { category: 'structural' }));
  }

  const categories = {
    structural: categoryVerdict(checks, 'structural'),
    identity: categoryVerdict(checks, 'identity'),
    stability: failRate <= 0.01 ? 'pass' : failRate <= 0.05 ? 'warn' : 'fail',
    outlierFrequency: outlierRate <= 0.1 ? 'pass' : outlierRate <= 0.2 ? 'warn' : 'fail',
    timeline: categoryVerdict(checks, 'timeline'),
  };

  const verdict = finalizeVerdict(checks, marketId, inPlayable, inDiagOnly, categories);

  return {
    marketId,
    label: MARKETS[marketId]?.label || marketId,
    timingMs: Date.now() - t0,
    config: { runs, years, seed: opts.seed },
    exposure: { inPlayable, inDiagOnly },
    marketMeta: {
      rankTier: marketMeta.rankTier,
      archetypeId: marketMeta.archetypeId,
      region: marketMeta.region,
      hispPop2020: marketMeta.hispPop2020,
      blackPop: marketMeta.blackPop,
    },
    byYear,
    outliers: {
      count: outlierRuns.length,
      rate: outlierRate,
      samples: outlierRuns.slice(0, 12),
    },
    categories,
    checks,
    verdict,
  };
}

function printMarketReport(report, opts) {
  const { marketId, byYear, verdict, categories, outliers } = report;
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`${report.label} (${marketId}) — ${report.timingMs}ms`);
  console.log(`${'─'.repeat(72)}`);
  console.log(
    `Exposure: playable=${report.exposure.inPlayable ? 'yes' : 'no'} diagOnly=${report.exposure.inDiagOnly ? 'yes' : 'no'}`,
  );

  for (const year of report.config.years) {
    const y = byYear[year];
    if (!y) {
      console.log(`  ${year}: no data`);
      continue;
    }
    const m = y.means;
    console.log(
      `\n  ${year} (n=${y.nRuns})  stations μ=${m.stationCount?.toFixed(1)}  AM=${m.commercialAm?.toFixed(1)} FM=${m.commercialFm?.toFixed(1)} NCE=${m.nceCount?.toFixed(1)}  HHI μ=${m.hhi?.toFixed(0)}`,
    );
    console.log(
      `    shares μ: SPAN ${pct(m.spanishShare)} ROCK ${pct(m.rockFamilyShare)} CHR ${pct(m.chrShare)} CTRY ${pct(m.countryShare)} PUB ${pct(m.publicShare)}`,
    );
    console.log(`    #1 family: ${JSON.stringify(y.histograms.leaderFamily)}`);
    if (!opts.json) {
      const top = y.topFormatsMean.slice(0, 5).map((t) => `${t.fmt}:${pct(t.share)}`).join(' ');
      console.log(`    top formats: ${top}`);
    }
  }

  console.log(`\n  Categories: ${Object.entries(categories).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`  Outliers: ${outliers.count} (${(outliers.rate * 100).toFixed(1)}%)`);
  console.log(
    `  VERDICT: ${verdict.overall.toUpperCase()} | INTERNAL_READY=${verdict.internalReady ? 'yes' : 'no'} PUBLIC_CANDIDATE=${verdict.publicCandidate ? 'yes' : 'no'} CONFIDENCE=${verdict.confidence}`,
  );
}

function printRubric() {
  console.log(`
Scoring rubric (per market):
  structural realism   — station count band, HHI median ≤650 (warn ≤800), sim failure ≤1% (warn ≤5%)
  identity realism     — market-specific @2026 (+ RM for Phoenix); generic Hispanic meta fallback
  stability            — same as sim failure rate
  outlier frequency    — pathological run share ≤10% (warn ≤20%): format>35%, HHI>700, gap>15pp, etc.
  timeline plausibility — Spanish rise (Hispanic markets), rock decline, CHR viable, public persists

  INTERNAL_READY: no FAIL checks and no category=fail
  PUBLIC_CANDIDATE: INTERNAL_READY + market ∈ ALL_PLAYABLE (not DIAG_ONLY-only)
  CONFIDENCE: high ≤4 warns; medium default; low on fails or >10 warns
`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  loadFormatFamiliesCatalog();

  const t0 = Date.now();
  console.log('Market certification (Monte Carlo, read-only)\n');
  console.log(`Markets: ${opts.markets.join(', ')}`);
  console.log(`Years: ${opts.years.join(', ')} | runs: ${opts.runs} | seed: ${opts.seed}`);

  const ctx = loadCtx();
  const MARKETS = vm.runInContext('typeof MARKETS!=="undefined"?MARKETS:{}', ctx);
  const api = vm.runInContext(RUN_IIFE, ctx);

  mkdirSync(certDir, { recursive: true });

  const reports = [];
  const missing = opts.markets.filter((m) => !MARKETS[m]);

  if (missing.length) {
    console.warn(`\nWARN: No MARKETS row for: ${missing.join(', ')} (will emit fail stub)`);
  }

  for (const marketId of opts.markets) {
    if (!opts.json) console.log(`\nCertifying ${marketId}…`);
    let report;
    if (!MARKETS[marketId]) {
      report = {
        marketId,
        label: marketId,
        timingMs: 0,
        config: { runs: opts.runs, years: opts.years, seed: opts.seed },
        exposure: {
          inPlayable: ALL_PLAYABLE_MARKET_IDS.includes(marketId),
          inDiagOnly: DIAG_ONLY_MARKET_IDS.includes(marketId),
        },
        error: 'MARKET_NOT_IN_LEGACY',
        categories: {
          structural: 'fail',
          identity: 'fail',
          stability: 'fail',
          outlierFrequency: 'n/a',
          timeline: 'n/a',
        },
        verdict: {
          internalReady: false,
          publicCandidate: false,
          confidence: 'low',
          overall: 'fail',
          counts: { pass: 0, warn: 0, fail: 1 },
        },
        checks: [check('fail', 'market_missing', `${marketId} not in MARKETS`, { category: 'structural' })],
      };
    } else {
      report = certifyMarket(marketId, opts, ctx, api, MARKETS);
    }
    reports.push(report);
    const outPath = path.join(certDir, `${marketId}.json`);
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!opts.json) printMarketReport(report, opts);
  }

  const indexPath = path.join(certDir, '_index.json');
  writeFileSync(
    indexPath,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        timingMs: Date.now() - t0,
        config: opts,
        markets: reports.map((r) => ({
          marketId: r.marketId,
          overall: r.verdict?.overall,
          internalReady: r.verdict?.internalReady,
          publicCandidate: r.verdict?.publicCandidate,
          confidence: r.verdict?.confidence,
          timingMs: r.timingMs,
        })),
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n${'═'.repeat(72)}`);
  console.log('Summary');
  for (const r of reports) {
    console.log(
      `  ${r.marketId.padEnd(14)} ${(r.verdict?.overall || 'fail').toUpperCase().padEnd(5)} INTERNAL=${r.verdict?.internalReady ? 'yes' : 'no '} PUBLIC=${r.verdict?.publicCandidate ? 'yes' : 'no '} conf=${r.verdict?.confidence} (${r.timingMs}ms)`,
    );
  }
  console.log(`\nWrote ${certDir}/<market>.json and ${indexPath}`);
  console.log(`Total wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!opts.json) printRubric();

  if (reports.some((r) => r.verdict?.overall === 'fail')) process.exitCode = 1;
}

main();
