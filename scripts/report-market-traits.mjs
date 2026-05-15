#!/usr/bin/env node
/**
 * Static report: derived market trait profiles (diagnostic only; no sim / no gameplay changes).
 *
 * Usage:
 *   node scripts/report-market-traits.mjs
 *   node scripts/report-market-traits.mjs --years=1970,2000
 *
 * Output:
 *   Console: year-sensitivity note, wide trait table, semantic warnings
 *   tmp/market_traits_report.csv (includes urbanDensityAffinity, blackMusicAffinity, rhythmicDiversityAffinity, …)
 */
/* eslint-disable no-console */

import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { marketTraitProfile } from '../src/marketTraitProfile.js';

const require = createRequire(import.meta.url);
const { ALL_PLAYABLE_MARKET_IDS } = require('./market-ids.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const outCsv = path.join(root, 'tmp', 'market_traits_report.csv');

const DEFAULT_YEARS = [1970, 1990, 2010, 2026];

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
    dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() {
      return null;
    },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    closest() {
      return null;
    },
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
  ctx.__WL_SHARE_INSPECT_ONLY = true;
  return ctx;
}

function parseYears(argv) {
  for (const a of argv) {
    if (a.startsWith('--years=')) {
      return a
        .slice('--years='.length)
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
    }
  }
  return DEFAULT_YEARS.slice();
}

function loadMarketsFromLegacyVm() {
  const ctx = createVmContext();
  vm.runInContext(loadLegacySrc(), ctx);
  const M = vm.runInContext('typeof MARKETS !== "undefined" ? MARKETS : null', ctx);
  if (!M || typeof M !== 'object') throw new Error('Could not read MARKETS from legacy VM');
  return M;
}

/** Column order for CSV (stable for diffing). */
const CSV_COLUMNS = [
  'marketId',
  'year',
  'marketScale',
  'fragmentationAffinity',
  'educationAffinity',
  'publicMediaAffinity',
  'civicAffinity',
  'blackAffinity',
  'hispanicAffinity',
  'urbanMusicAffinity',
  'urbanDensityAffinity',
  'urbanFormatAffinity',
  'blackMusicAffinity',
  'rhythmicDiversityAffinity',
  'countryAffinity',
  'religiousAffinity',
  'gospelAffinity',
  'ccmAffinity',
  'spanishLanguageAffinity',
  'wealthAdAffinity',
  'adMarketStrength',
  'amResilience',
  'fmAdoptionBias',
  'heritageInertia',
  'rankTier',
  'archetypeId',
];

function rowToCsv(r) {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return CSV_COLUMNS.map((k) => esc(r[k])).join(',');
}

function printYearSensitivityNote(years) {
  console.log('=== Year sensitivity (diagnostic module) ===');
  console.log(
    'Scalars that change with the `year` argument (MARKETS demographic trend hooks):\n' +
      '  • hispanicAffinity — hispPop1970 → 2000 → 2020 interpolation\n' +
      '  • rhythmicDiversityAffinity — includes hispanicAffinity in its blend\n' +
      'All other exported columns are static for a given marketId (repeated year rows mirror the same MARKETS row).\n' +
      `This run uses years: ${years.join(', ')} — if you only need static traits, pass e.g. --years=2026 once.\n`
  );
}

/**
 * @param {object[]} rows
 * @returns {string[]}
 */
function collectSemanticWarnings(rows) {
  const warnings = [];
  const seen = new Set();

  const push = (msg) => {
    if (seen.has(msg)) return;
    seen.add(msg);
    warnings.push(msg);
  };

  const byMarket = new Map();
  for (const r of rows) {
    if (!byMarket.has(r.marketId)) byMarket.set(r.marketId, []);
    byMarket.get(r.marketId).push(r);
  }

  for (const [mid, rs] of byMarket) {
    const r0 = rs[0];

    if (mid === 'seattle' && rs.some((r) => r.countryAffinity > 0.4)) {
      const ex = rs.find((r) => r.countryAffinity > 0.4);
      push(
        `[seattle] countryAffinity=${ex.countryAffinity.toFixed(3)} (>0.40), archetype=${r0.archetypeId} — ` +
          'MARKETS culture.country + countryBonus (“country-adjacent culture”), not Nielsen country share; plausible for PNW heritage + touring acts.'
      );
    } else if (
      mid !== 'seattle' &&
      r0.countryAffinity > 0.35 &&
      /coastal|northeast_mega|west_fm_fragmented|secular/i.test(String(r0.archetypeId || '')) &&
      !/southern|sunbelt|country|prairie|plains|heartland|bible/i.test(String(r0.archetypeId || ''))
    ) {
      push(
        `[${mid}] countryAffinity=${r0.countryAffinity.toFixed(3)} with archetype=${r0.archetypeId} — ` +
          '“country” is MARKETS culture.country / countryBonus, not a forecast of terrestrial country share.'
      );
    }

    if (mid === 'sanfrancisco' && rs.some((r) => r.urbanMusicAffinity > 0.65)) {
      const ex = rs.find((r) => r.urbanMusicAffinity > 0.65);
      const es = ex.spanishLanguageAffinity.toFixed(3);
      push(
        `[sanfrancisco] urbanMusicAffinity=${ex.urbanMusicAffinity.toFixed(3)} (>0.65), spanishLanguageAffinity=${es} — ` +
          'urbanMusicAffinity is urbanBonus + culture.urban only (no secular discount). Legacy `appl` also routes Spanish into Urban/Rhythmic/Spanish — use urbDen/urbFmt vs rhythmicDiversityAffinity.'
      );
    }

    if (r0.urbanMusicAffinity > 0.52 && r0.spanishLanguageAffinity > 0.38 && mid !== 'sanfrancisco') {
      push(
        `[${mid}] urbanMusicAffinity=${r0.urbanMusicAffinity.toFixed(3)} & spanishLanguageAffinity=${r0.spanishLanguageAffinity.toFixed(3)} — ` +
          'legacy `appl` feeds culture.spanish into Urban/Rhythmic/Spanish; this report splits spanishLanguage vs urban* columns — compare rhythmicDiversityAffinity.'
      );
    }

    if (r0.gospelAffinity < 0.12 && r0.religiousAffinity > 0.45) {
      push(
        `[${mid}] gospelAffinity=${r0.gospelAffinity.toFixed(3)} vs religiousAffinity=${r0.religiousAffinity.toFixed(3)} — ` +
          'gospelAffinity is a structural commercial-gospel proxy, not church attendance; CCM/religious-network use separate columns.'
      );
    }
  }

  return warnings;
}

function main() {
  const years = parseYears(process.argv);
  const MARKETS = loadMarketsFromLegacyVm();
  const markets = ALL_PLAYABLE_MARKET_IDS;

  const rows = [];
  for (const mid of markets) {
    for (const y of years) {
      const r = marketTraitProfile(MARKETS, mid, y);
      rows.push(r);
    }
  }

  mkdirSync(path.dirname(outCsv), { recursive: true });
  const header = CSV_COLUMNS.join(',');
  const lines = [header, ...rows.map(rowToCsv)];
  writeFileSync(outCsv, `${lines.join('\n')}\n`, 'utf8');

  const print = rows.map((r) => ({
    market: r.marketId,
    year: r.year,
    scale: r.marketScale.toFixed(3),
    frag: r.fragmentationAffinity.toFixed(3),
    edu: r.educationAffinity.toFixed(3),
    pub: r.publicMediaAffinity.toFixed(3),
    blk: r.blackAffinity.toFixed(3),
    hisp: r.hispanicAffinity.toFixed(3),
    rel: r.religiousAffinity.toFixed(3),
    ccm: r.ccmAffinity.toFixed(3),
    es: r.spanishLanguageAffinity.toFixed(3),
    fmBias: r.fmAdoptionBias.toFixed(3),
    amRes: r.amResilience.toFixed(3),
    herit: r.heritageInertia.toFixed(3),
    urbanMix: r.urbanMusicAffinity.toFixed(3),
    urbDen: r.urbanDensityAffinity.toFixed(3),
    urbFmt: r.urbanFormatAffinity.toFixed(3),
    blkMus: r.blackMusicAffinity.toFixed(3),
    rhyDiv: r.rhythmicDiversityAffinity.toFixed(3),
    ctry: r.countryAffinity.toFixed(3),
    gos: r.gospelAffinity.toFixed(3),
    wealth: r.wealthAdAffinity.toFixed(3),
    adMkt: r.adMarketStrength.toFixed(3),
    tier: r.rankTier,
  }));
  console.log(`Wrote ${outCsv} (${rows.length} rows)\n`);
  printYearSensitivityNote(years);
  console.table(print);

  const warns = collectSemanticWarnings(rows);
  if (warns.length) {
    console.log('\n=== Semantic / interpretability warnings ===');
    warns.forEach((w) => console.log(`• ${w}`));
  } else {
    console.log('\n(No threshold-based semantic warnings for this run.)');
  }
}

main();
