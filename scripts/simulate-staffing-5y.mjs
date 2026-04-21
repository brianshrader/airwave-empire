#!/usr/bin/env node
/**
 * 5 in-game years × 3 staffing variants — real advTurn / recalc / seedRev path (not calcRev-only table).
 *
 *   node scripts/simulate-staffing-5y.mjs
 *   node scripts/simulate-staffing-5y.mjs --seed=90210
 *   node scripts/simulate-staffing-5y.mjs --years=5 --market=nashville
 *
 * One scenario: FM Country in Nashville, clock start Spring 1995 (after genMarketMP 1985 → advance).
 * Variants share the same JSON baseline; each run replays from that state with the same RNG seed so
 * divergence is driven mainly by the subject station’s staffing (rivals follow the same draws each period).
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const harnessPath = path.join(root, 'src', 'marketSimHarness.js');

const DEFAULT_MARKET = 'nashville';
const DEFAULT_SEED = 90210;
const PERIODS_5Y = 10; // 5 calendar years × 2 half-periods

function parseArgs(argv) {
  const out = { seed: DEFAULT_SEED, market: DEFAULT_MARKET, years: 5 };
  for (const a of argv) {
    if (a.startsWith('--seed=')) out.seed = Number(a.slice(7)) || DEFAULT_SEED;
    else if (a.startsWith('--market=')) out.market = a.slice(9) || DEFAULT_MARKET;
    else if (a.startsWith('--years=')) out.years = Math.max(1, Math.min(20, Number(a.slice(8)) || 5));
  }
  return out;
}

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
}

function makeLegacySrc(marketId) {
  let src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  src = src.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
  return injectHeadlessMegaFragNewsGuard(src);
}

function createVmContext(quiet) {
  const noop = () => {};
  const btnStub = () => ({
    disabled: false,
    textContent: '',
    style: {},
    addEventListener: noop,
    removeEventListener: noop,
  });
  const stubEl = () => ({
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
    addEventListener: noop,
    removeEventListener: noop,
  });
  const documentStub = {
    body: { innerHTML: '', classList: { toggle() {} } },
    head: { appendChild() {} },
    createElement() {
      return { href: '', download: '', click() {}, style: {}, classList: { toggle() {} } };
    },
    getElementById(id) {
      if (id === 'mp-era') return { value: '1985' };
      if (id === 'abtn') return btnStub();
      return stubEl();
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    readyState: 'complete',
    addEventListener: noop,
    removeEventListener: noop,
  };
  const log = quiet
    ? { log: noop, warn: noop, error: console.error, table: noop }
    : console;
  return vm.createContext({
    console: log,
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
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert: noop,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class {},
    FileReader: class {
      readAsText() {}
    },
    crypto: {
      getRandomValues(typedArray) {
        if (!typedArray || !typedArray.length) return typedArray;
        for (let i = 0; i < typedArray.length; i++) typedArray[i] = i % 256;
        return typedArray;
      },
      randomUUID() {
        return '00000000-0000-4000-8000-000000000001';
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
    MP: { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus: noop },
    addEventListener: noop,
    removeEventListener: noop,
  });
}

function loadEngine(ctx, marketId) {
  const _log = console.log;
  console.log = () => {};
  vm.runInContext(makeLegacySrc(marketId), ctx);
  vm.runInContext(readFileSync(harnessPath, 'utf8'), ctx);
  console.log = _log;
}

function installRunner(ctx) {
  const code = `
(function () {
  var SLOTS = ['morningDrive', 'midday', 'afternoonDrive', 'evening', 'overnight'];
  function talentBlock(name) {
    return {
      name: name,
      quality: 62,
      formatFit: { COUNTRY: 0.74 },
      salary: 44000,
      cyr: 3,
      morale: 70,
      superstar: false,
    };
  }
  function applySubjectStaffing(subject, mode, G) {
    var i, sl;
    for (i = 0; i < SLOTS.length; i++) {
      sl = SLOTS[i];
      if (subject.prog[sl]) delete subject.prog[sl].staffingMode;
    }
    if (mode === 'live') {
      for (i = 0; i < SLOTS.length; i++) {
        sl = SLOTS[i];
        subject.prog[sl].talent = talentBlock('Host ' + sl);
        if (subject.prog[sl].quality == null) subject.prog[sl].quality = 58;
      }
    } else if (mode === 'vt') {
      subject.prog.morningDrive.talent = talentBlock('MD Host');
      subject.prog.afternoonDrive.talent = talentBlock('PM Host');
      ['midday', 'evening', 'overnight'].forEach(function (x) {
        subject.prog[x].talent = null;
        subject.prog[x].staffingMode = 'light';
        subject.prog[x].quality = Math.max(10, Math.round(subject.prog[x].quality || 55));
      });
    } else {
      subject.prog.morningDrive.talent = talentBlock('MD Host');
      subject.prog.afternoonDrive.talent = talentBlock('PM Host');
      ['midday', 'evening', 'overnight'].forEach(function (x) {
        subject.prog[x].talent = null;
        subject.prog[x].quality = Math.max(10, Math.round(subject.prog[x].quality || 52));
      });
    }
    refreshStationOQ(subject, G);
  }
  function snap(subject, G) {
    return {
      year: G.year,
      period: G.period,
      turn: G.turn,
      share: subject.rat ? subject.rat.share : 0,
      rev: subject.fin ? subject.fin.rev : 0,
      ebitda: subject.fin ? subject.fin.ebitda : 0,
      identity: subject.identity,
      oq: subject.oq,
      auto: stationAutomationScore(subject),
      label: stationStaffingAutomationLabel(subject),
      franchise: subject.talentFranchise,
    };
  }
  /**
   * @param {string} baselineJson
   * @param {string} subjectId
   * @param {'live'|'vt'|'auto'} mode
   * @param {number} periods
   */
  globalThis.__staffing5yRun = function (baselineJson, subjectId, mode, periods) {
    G = JSON.parse(baselineJson);
    migrateSave(G);
    var subject = (G.stations || []).find(function (s) {
      return s && String(s.id) === String(subjectId);
    });
    if (!subject) throw new Error('Subject station id not in G: ' + subjectId);
    applySubjectStaffing(subject, mode, G);
    recalc(G.stations, G);
    var snaps = [];
    var totalRev = 0;
    var totalEbitda = 0;
    var shareSum = 0;
    var ui = window._harnessPatchTimersAndUi();
    try {
      for (var step = 0; step < periods; step++) {
        advTurn();
        var r = subject.fin ? subject.fin.rev : 0;
        var e = subject.fin ? subject.fin.ebitda : 0;
        var sh = subject.rat ? subject.rat.share : 0;
        totalRev += r;
        totalEbitda += e;
        shareSum += sh;
        snaps.push(snap(subject, G));
      }
    } finally {
      ui.restore();
    }
    return {
      snaps: snaps,
      totalRev: totalRev,
      totalEbitda: totalEbitda,
      avgShare: periods > 0 ? shareSum / periods : 0,
      finalShare: subject.rat ? subject.rat.share : 0,
      finalIdentity: subject.identity,
      finalOq: subject.oq,
      finalAuto: stationAutomationScore(subject),
      finalLabel: stationStaffingAutomationLabel(subject),
      finalFranchise: subject.talentFranchise,
    };
  };
})();
`;
  vm.runInContext(code, ctx);
}

function buildBaseline(ctx, marketId, targetYear, targetPeriod) {
  vm.runInContext(
    `
    ACTIVE_MARKET = ${JSON.stringify(marketId)};
    syncMarketPopToMarket(${JSON.stringify(marketId)});
    G = genMarketMP('1985');
    MP.mode = 'solo';
    MP.isHost = false;
    if (MP.players) MP.players = [];
    var ui = window._harnessPatchTimersAndUi();
    var adv;
    try {
      adv = advanceGToYearPeriod(${targetYear}, ${targetPeriod}, 500);
    } finally {
      ui.restore();
    }
    if (!adv.ok) throw new Error('advanceGToYearPeriod failed: ' + (adv.error || '') + ' @' + JSON.stringify(adv.at || {}));
    var subject = (G.stations || []).find(function (s) {
      return s && !s._bpSlotDeferred && !s.isPublic && s.format === 'COUNTRY' && s.sig && s.sig.type === 'FM';
    });
    if (!subject) {
      subject = (G.stations || []).find(function (s) {
        return s && !s._bpSlotDeferred && !s.isPublic && s.format === 'COUNTRY';
      });
    }
    if (!subject) throw new Error('No COUNTRY station found in market snapshot');
    __baselineSubjectId = subject.id;
    __baselineSubjectCall = subject.callLetters;
    __baselineJson = JSON.stringify(G);
    `,
    ctx,
  );
  return {
    baselineJson: ctx.__baselineJson,
    subjectId: ctx.__baselineSubjectId,
    subjectCall: ctx.__baselineSubjectCall,
  };
}

function money(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

function pct(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  return (x * 100).toFixed(2) + '%';
}

/** Roll half-period rows into calendar-year buckets (2 periods per year after first slice). */
function yearlyFromSnaps(snaps) {
  const by = new Map();
  for (const r of snaps) {
    const y = r.year;
    if (!by.has(y)) by.set(y, { year: y, rev: 0, ebitda: 0, periods: 0, lastShare: r.share, lastOq: r.oq, lastAuto: r.auto, lastLabel: r.label });
    const b = by.get(y);
    b.rev += r.rev || 0;
    b.ebitda += r.ebitda || 0;
    b.periods++;
    b.lastShare = r.share;
    b.lastOq = r.oq;
    b.lastAuto = r.auto;
    b.lastLabel = r.label;
  }
  return [...by.values()].sort((a, b) => a.year - b.year);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const periods = args.years * 2;
  const ctx = createVmContext(true);
  ctx.globalThis = ctx;
  ctx.window = ctx;

  loadEngine(ctx, args.market);
  installRunner(ctx);

  const rngBaseline = ctx._harnessInstallSeededBenchmarkRng(args.seed);
  let baseline;
  try {
    baseline = buildBaseline(ctx, args.market, 1995, 1);
  } finally {
    rngBaseline.restore();
  }
  const variants = [
    { key: 'live', label: 'All live (5 local hosts)', mode: 'live' },
    { key: 'vt', label: 'VT-heavy (drives live; mid·eve·ovn voice-track)', mode: 'vt' },
    { key: 'auto', label: 'Automation-heavy (drives live; mid·eve·ovn bare automation)', mode: 'auto' },
  ];

  console.log('Staffing 5y harness — advTurn + recalc + seedRev path');
  console.log(`Market: ${args.market} · Start: Spring ${1995} (after advance from genMarketMP 1985)`);
  console.log(`Subject: ${baseline.subjectCall} (id ${baseline.subjectId}) · FM Country`);
  console.log(`RNG: seeded LCG via _harnessInstallSeededBenchmarkRng(${args.seed}) reset before each variant`);
  console.log(`Horizon: ${args.years} years = ${periods} half-periods\n`);

  const results = [];

  for (const v of variants) {
    const rngH = ctx._harnessInstallSeededBenchmarkRng(args.seed);
    try {
      const out = vm.runInContext(
        `__staffing5yRun(${JSON.stringify(baseline.baselineJson)}, ${JSON.stringify(String(baseline.subjectId))}, ${JSON.stringify(v.mode)}, ${periods})`,
        ctx,
      );
      results.push({ variant: v, out });
    } finally {
      rngH.restore();
    }
  }

  const sep = '\t';
  console.log('══ Summary (per variant) ══');
  console.log(
    [
      'variant',
      'finalShare',
      'avgShare',
      'totalRev',
      'totalEBITDA',
      'finalIdentity',
      'finalOQ',
      'franchise',
      'autoScore',
      'staffLabel',
    ].join(sep),
  );
  for (const { variant, out } of results) {
    console.log(
      [
        variant.key,
        pct(out.finalShare),
        pct(out.avgShare),
        money(out.totalRev),
        money(out.totalEbitda),
        out.finalIdentity != null ? String(Math.round(out.finalIdentity * 10) / 10) : '—',
        out.finalOq != null ? String(out.finalOq) : '—',
        out.finalFranchise != null && Number.isFinite(out.finalFranchise)
          ? out.finalFranchise.toFixed(3)
          : '—',
        out.finalAuto != null ? out.finalAuto.toFixed(4) : '—',
        out.finalLabel || '—',
      ].join(sep),
    );
  }

  for (const { variant, out } of results) {
    console.log(`\n── ${variant.label} (${variant.key}) — by calendar year (sum rev/EBITDA both half-periods) ──`);
    const years = yearlyFromSnaps(out.snaps);
    console.log(['year', 'rev(sum)', 'ebitda(sum)', 'endShare', 'endOQ', 'endAuto', 'endLabel'].join(sep));
    for (const y of years) {
      console.log(
        [
          y.year,
          money(y.rev),
          money(y.ebitda),
          pct(y.lastShare),
          y.lastOq != null ? String(y.lastOq) : '—',
          y.lastAuto != null ? y.lastAuto.toFixed(4) : '—',
          y.lastLabel || '—',
        ].join(sep),
      );
    }
    console.log(`── ${variant.key} — every half-period (same engine order as in-game) ──`);
    console.log(['#', 'year', 'P', 'share', 'rev', 'ebitda', 'identity', 'oq', 'auto', 'label'].join(sep));
    out.snaps.forEach((row, idx) => {
      console.log(
        [
          idx + 1,
          row.year,
          row.period,
          pct(row.share),
          money(row.rev),
          money(row.ebitda),
          row.identity != null ? String(Math.round(row.identity * 10) / 10) : '—',
          row.oq != null ? String(row.oq) : '—',
          row.auto != null ? row.auto.toFixed(4) : '—',
          row.label || '—',
        ].join(sep),
      );
    });
  }

  console.log('\nNotes:');
  console.log('- Identity often stays 0 here: growth hooks are player-/campaign-weighted; OQ + franchise still move.');
  console.log('- Same baseline JSON + same RNG seed per variant: rival random sequence starts aligned; subject staffing still bends ratings/rev through recalc.');
}

main();
