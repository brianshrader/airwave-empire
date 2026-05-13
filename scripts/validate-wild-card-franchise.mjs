#!/usr/bin/env node
/**
 * Quick sanity check: Wild Card franchise eligibility + fit weights (post–PERSONALITY_TALK).
 *
 *   node scripts/validate-wild-card-franchise.mjs
 */
/* eslint-disable no-console */

import path from 'path';
import { readFileSync } from 'fs';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function loadLegacySrc() {
  const src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  return injectHeadlessMegaFragNewsGuard(src);
}

function createVmContext() {
  const noop = () => {};
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error },
    __WL_HEADLESS__: true,
    document: {
      body: {},
      getElementById() {
        return null;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
      removeEventListener() {},
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { href: '' },
    window: null,
    setTimeout() {
      return 0;
    },
    setInterval() {
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame() {
      return 0;
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
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.window = ctx;
  return ctx;
}

function main() {
  const ctx = createVmContext();
  vm.runInContext(loadLegacySrc(), ctx, { filename: 'legacy.js' });

  vm.runInContext(
    `
  var _wcWild = NATIONAL_FRANCHISES.find(function (f) { return f.id === 'wild_card'; });
  globalThis.__wildCardFit = function (fmt, driftVal) {
    var s = { format: fmt };
    if (driftVal != null) s.drift = { PERSONALITY_TALK: driftVal };
    return franchiseFormatFit(_wcWild, fmt, s);
  };
`,
    ctx
  );

  const wc = vm.runInContext('_wcWild', ctx);
  if (!wc) throw new Error('wild_card franchise missing');

  const fit = (fmt, drift) => Number(ctx.__wildCardFit(fmt, drift));

  const rows = [
    { format: 'PERSONALITY_TALK', drift: 25, note: 'edgy drift' },
    { format: 'PERSONALITY_TALK', drift: 70, note: 'lifestyle drift' },
    { format: 'PERSONALITY_TALK', drift: null, note: 'no drift' },
    { format: 'ALT_ROCK', drift: null, note: '' },
    { format: 'ALBUM_ROCK', drift: null, note: '' },
    { format: 'CLASSIC_ROCK', drift: null, note: '' },
    { format: 'TOP40', drift: null, note: '' },
    { format: 'HOT_AC', drift: null, note: '' },
    { format: 'NEWS_TALK', drift: null, note: 'should be ineligible' },
    { format: 'SPORTS_TALK', drift: null, note: 'should be ineligible' },
    { format: 'PUBLIC_NEWS', drift: null, note: 'not in formats' },
  ].map((r) => {
    const v = fit(r.format, r.drift);
    const elig = wc.formats.includes(r.format);
    return { ...r, eligible: elig, fit: Number(v.toFixed(4)) };
  });

  console.log('Wild Card franchise validation');
  console.log('formats:', wc.formats.join(', '));
  console.table(rows);

  const persEdgy = rows.find((x) => x.format === 'PERSONALITY_TALK' && x.drift === 25).fit;
  const persLife = rows.find((x) => x.format === 'PERSONALITY_TALK' && x.drift === 70).fit;
  const newsFit = rows.find((x) => x.format === 'NEWS_TALK').fit;

  const ok =
    wc.formats.includes('PERSONALITY_TALK') &&
    persEdgy > persLife &&
    persEdgy > rows.find((x) => x.format === 'TOP40').fit &&
    newsFit === 0;

  console.log(ok ? 'PASS: PERSONALITY_TALK eligible + edgy>lifestyle>CHR; news/sports fit 0.' : 'FAIL: check table.');
  process.exit(ok ? 0 : 1);
}

main();
