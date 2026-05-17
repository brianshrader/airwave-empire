#!/usr/bin/env node
/**
 * Before/after ALL_NEWS revenue calibration (surgical constants only).
 * Usage: node scripts/all-news-rev-calibration-check.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LEGACY_PATH = path.join(__dirname, '..', 'src', 'legacy.js');

function readLegacyBase() {
  const headPath = '/tmp/legacy-head.js';
  if (fs.existsSync(headPath)) return fs.readFileSync(headPath, 'utf8');
  return fs.readFileSync(LEGACY_PATH, 'utf8');
}
const MARKETS = ['newyork', 'chicago', 'losangeles', 'sanfrancisco', 'seattle'];
const SHARES = [0.04, 0.06, 0.08];
const YEAR = 2022;
const PERIOD = 2;

function stubEl() {
  return {
    disabled: false, textContent: '', innerHTML: '', value: '',
    style: {}, dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {}, querySelector() { return null; }, focus() {}, click() {},
    addEventListener() {}, removeEventListener() {},
  };
}
const documentStub = {
  body: { innerHTML: '', dataset: {} },
  head: { appendChild() {} },
  createElement() { return { href: '', download: '', click() {}, dataset: {} }; },
  getElementById() { return stubEl(); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
};

function legacySourceForMode(after) {
  let src = readLegacyBase();
  if (after) {
    src = src.replace(
      "ALL_NEWS:       {l:'All-News',           cpm:1.72,sp:8,",
      "ALL_NEWS:       {l:'All-News',           cpm:1.72,sp:12,"
    );
    src = src.replace(
      'NEWS_TALK:1.05,SPORTS_TALK:1.04,',
      'NEWS_TALK:1.05,SPORTS_TALK:1.04,ALL_NEWS:1.10,'
    );
    src = src.replace(
      'SPANISH:1.08,NEWS_TALK:0.95,URBAN_CONTEMP:0.94,',
      'SPANISH:1.08,NEWS_TALK:0.95,ALL_NEWS:1.08,URBAN_CONTEMP:0.94,'
    );
    src = src.replace(
      'NEWS_TALK:1.08,SPORTS_TALK:1.06,URBAN_CONTEMP:0.95,RHYTHMIC:0.96,',
      'NEWS_TALK:1.08,SPORTS_TALK:1.06,ALL_NEWS:1.10,URBAN_CONTEMP:0.95,RHYTHMIC:0.96,'
    );
    src = src.replace(
      'NEWS_TALK:1.04,SPANISH:0.88,SPORTS_TALK:1.03,',
      'NEWS_TALK:1.04,ALL_NEWS:1.04,SPANISH:0.88,SPORTS_TALK:1.03,'
    );
    src = src.replace(
      'AAA:1.05,ALT_ROCK:1.04,',
      'AAA:1.05,ALT_ROCK:1.04,ALL_NEWS:1.08,'
    );
    src = src.replace(
      `const sigMult=s.sig.type==='AM'
      ?(['NEWS_TALK','SPORTS_TALK','PERSONALITY_TALK','ALL_NEWS'].includes(s.format)?0.88:0.72)
      :1.0;`,
      `const sigMult=s.sig.type==='AM'
      ?(s.format==='ALL_NEWS'?0.92
        :['NEWS_TALK','SPORTS_TALK','PERSONALITY_TALK'].includes(s.format)?0.88:0.72)
      :1.0;`
    );
    return src;
  }
  return src;
}

function makeCtx(after) {
  const ctx = vm.createContext({
    console,
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    addEventListener() {},
    removeEventListener() {},
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {} },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearTimeout() {}, clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
    Symbol, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    Int8Array, Uint8Array, Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInContext(legacySourceForMode(after), ctx);
  return ctx;
}

function runPass(after) {
  const ctx = makeCtx(after);
  return vm.runInContext(
    `
    (function(){
      var s = 424242;
      Math.random = function(){ s = (s * 9301 + 49297) % 233280; return s / 233280; };
      var markets = ${JSON.stringify(MARKETS)};
      var shares = ${JSON.stringify(SHARES)};
      var year = ${YEAR};
      var period = ${PERIOD};
      var rows = [];

      function injectShare(st, sh) {
        COH.forEach(function(coh){
          var pop = (POP.cohorts[coh].t || 0) * effUniverse(st);
          var engage = AQH_ENGAGE[coh] || 0.06;
          if (!st.rat.cur[coh]) st.rat.cur[coh] = { share: 0, aqh: 0 };
          st.rat.cur[coh].share = sh;
          st.rat.cur[coh].aqh = Math.round(sh * pop * engage);
        });
        var ewp = COH.reduce(function(acc, c) {
          return acc + (POP.cohorts[c].t || 0) * (AQH_ENGAGE[c] || 0.06);
        }, 0);
        st.rat.aqh = COH.reduce(function(sum, c) { return sum + (st.rat.cur[c].aqh || 0); }, 0);
        st.rat.share = COH.reduce(function(sum, c) {
          var pop = POP.cohorts[c].t || 0;
          var engage = AQH_ENGAGE[c] || 0.06;
          return sum + (st.rat.cur[c].share || 0) * (pop * engage) / Math.max(ewp, 1);
        }, 0);
      }

      function makeLab(fmt, sigType, pw) {
        var fmd = FM[canonicalHitsFormatKey(fmt)] || {};
        var id = 'lab_' + fmt + '_' + sigType;
        return {
          id: id,
          callLetters: 'LAB' + id.slice(-4).toUpperCase(),
          format: fmt,
          brand: gb(fmt),
          sig: { type: sigType, pw: pw, reach: UNIVERSE[sigType + '_' + pw] || 0.65, universe: UNIVERSE[sigType + '_' + pw] || 0.65 },
          isPlayer: true,
          rat: { cur: {}, hist: [], share: 0, aqh: 0 },
          ops: { spots: fmd.sp || 14, sell: 0.82, promo: 0, progBudget: 0 },
          stream: { active: false, aqh: 0, rev: 0, upkeep: 0, dragOffset: 0, launchYear: 0 },
          prog: {
            morningDrive: { talent: null, quality: 70 },
            midday: { talent: null, quality: 65 },
            afternoonDrive: { talent: null, quality: 68 },
            evening: { talent: null, quality: 60 },
            overnight: { talent: null, quality: 55 },
          },
          salesForce: { level: 2, periodsHeld: 4 },
          fin: {},
        };
      }

      markets.forEach(function(mktId) {
        ACTIVE_MARKET = mktId;
        syncMarketPopToMarket(mktId);
        G = genMarket('wsb');
        while (G.year < year || (G.year === year && G.period < period)) advTurn();
        G.streamDrag = 0.38;
        G.adx = 1.0 + (MARKETS[mktId].adxBonus || 0);

        shares.forEach(function(sh) {
          [
            { fmt: 'ALL_NEWS', sig: 'AM', pw: '50kw' },
            { fmt: 'NEWS_TALK', sig: 'AM', pw: '50kw' },
            { fmt: 'ADULT_CONTEMP', sig: 'FM', pw: '100kw' },
            { fmt: 'TOP40', sig: 'FM', pw: '100kw' },
          ].forEach(function(spec) {
            var st = makeLab(spec.fmt, spec.sig, spec.pw);
            G.stations = [st];
            injectShare(st, sh);
            st.ops.spots = (FM[canonicalHitsFormatKey(spec.fmt)] || {}).sp || 14;
            st.ops.sell = 0.82;
            calcRev(st, G);
            const rawRev = st.fin.rev || 0;
            const rawEbitda = st.fin.ebitda || 0;
            rows.push({
              market: mktId,
              sharePct: Math.round(sh * 1000) / 10,
              format: spec.fmt,
              band: spec.sig,
              spotsNorm: (FM[canonicalHitsFormatKey(spec.fmt)] || {}).sp,
              mktFmt: marketFormatMonMult(mktId, spec.fmt),
              rev: rawRev,
              ebitda: rawEbitda,
              marginPct: rawRev ? Math.round((rawEbitda / rawRev) * 1000) / 10 : 0,
            });
          });
        });
      });
      return rows;
    })();
    `,
    ctx
  );
}

const before = runPass(false);
const after = runPass(true);

function key(r) {
  return `${r.market}|${r.sharePct}|${r.format}`;
}
const beforeMap = new Map(before.map((r) => [key(r), r]));

console.log('\n=== ALL_NEWS calibration (2022 Fall, no stream, SF L2, isolated lab station) ===\n');
console.log(
  ['Market', 'Share', 'SpB→A', 'MktB→A', 'BeforeRev', 'AfterRev', 'Δ%', 'vs NEWS_TALK', 'vs AC'].join('\t')
);
console.log('-'.repeat(100));

for (const a of after.filter((r) => r.format === 'ALL_NEWS')) {
  const b = beforeMap.get(key(a)) || { rev: 0 };
  const pct = b.rev ? Math.round(((a.rev - b.rev) / b.rev) * 1000) / 10 : null;
  const nt = after.find((x) => x.market === a.market && x.sharePct === a.sharePct && x.format === 'NEWS_TALK');
  const ac = after.find((x) => x.market === a.market && x.sharePct === a.sharePct && x.format === 'ADULT_CONTEMP');
  console.log(
    [
      a.market,
      a.sharePct + '%',
      `${b.spotsNorm}→${a.spotsNorm}`,
      `${b.mktFmt}→${a.mktFmt}`,
      b.rev,
      a.rev,
      pct != null ? pct + '%' : '—',
      nt ? Math.round((a.rev / nt.rev) * 100) + '%' : '—',
      ac ? Math.round((a.rev / ac.rev) * 100) + '%' : '—',
    ].join('\t')
  );
}

console.log('\n=== After — peer row at 6.0% share ===\n');
for (const m of MARKETS) {
  const row = after.filter((r) => r.market === m && r.sharePct === 6);
  console.log(m + ':');
  row.forEach((r) => {
    console.log(`  ${r.format.padEnd(14)} ${r.band}  rev=$${r.rev.toLocaleString()}  margin=${r.marginPct}%  spNorm=${r.spotsNorm}  mktFmt=${r.mktFmt}`);
  });
}
