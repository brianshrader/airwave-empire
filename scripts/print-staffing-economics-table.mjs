#!/usr/bin/env node
/**
 * Controlled half-period economics vs staffing posture (live / voice-track / full automation).
 * Loads src/legacy.js in a VM, runs calcRev per row, prints tab-separated + human summary.
 *
 * Run: node scripts/print-staffing-economics-table.mjs
 *
 * Daypart bit order (matches DAYPART_SLOTS): morningDrive=0, midday=1, afternoonDrive=2,
 * evening=3, overnight=4 → bit i = 1<<i in vacMask / lightMask.
 *
 * Rows 5–6: vacant midday + evening + overnight (both drives still live).
 * Rows 7–8: same plus afternoon drive vacant (MD still live) — steeper automation / payroll trade.
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');

const SLOTS = ['morningDrive', 'midday', 'afternoonDrive', 'evening', 'overnight'];

function makeCtx() {
  const noop = () => {};
  const stubEl = () => ({
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
  });
  const documentStub = {
    body: { innerHTML: '', classList: { toggle() {} } },
    head: { appendChild() {} },
    createElement() {
      return { href: '', download: '', click() {}, style: {}, classList: { toggle() {} } };
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
  return vm.createContext({
    console,
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
    document: documentStub,
    localStorage: { getItem: () => null, setItem: noop },
    location: { href: 'http://127.0.0.1/' },
    setTimeout: noop,
    setInterval: noop,
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame: () => 0,
    alert: noop,
    crypto: {
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = i % 256;
        return a;
      },
    },
    MP: { mode: 'solo', playerId: 0, isHost: true, players: [], action: noop },
    addEventListener: noop,
    removeEventListener: noop,
  });
}

/** Apply vacMask / lightMask to station prog (music: `light` = voice-track; spoken-word ignores light — syndicated default). */
function applyStaffingMask(s, vacMask, lightMask) {
  for (let i = 0; i < SLOTS.length; i++) {
    const sl = SLOTS[i];
    const bit = 1 << i;
    delete s.prog[sl].staffingMode;
    if ((vacMask & bit) === 0) {
      s.prog[sl].talent = {
        name: `Host_${sl}`,
        quality: 62,
        formatFit: { [s.format]: 0.72 },
        salary: 44_000,
        cyr: 3,
        morale: 72,
      };
    } else {
      s.prog[sl].talent = null;
      if (lightMask & bit) s.prog[sl].staffingMode = 'light';
    }
  }
}

const STAFFING_ROWS = [
  { key: 'all_live', label: '1. All live', vac: 0, light: 0 },
  { key: 'ovn_vt', label: '2. Overnight voice-track', vac: 1 << 4, light: 1 << 4 },
  { key: 'ovn_eve_vt', label: '3. Overnight + evening VT', vac: (1 << 3) | (1 << 4), light: (1 << 3) | (1 << 4) },
  { key: 'ovn_eve_auto', label: '4. Overnight + evening automated', vac: (1 << 3) | (1 << 4), light: 0 },
  { key: 'oem_vt', label: '5. Ovn + eve + midday VT', vac: (1 << 1) | (1 << 3) | (1 << 4), light: (1 << 1) | (1 << 3) | (1 << 4) },
  { key: 'oem_auto', label: '6. Ovn + eve + midday automated', vac: (1 << 1) | (1 << 3) | (1 << 4), light: 0 },
  {
    key: 'nondrive_vt',
    label: '7. Non-drive + AMD VT (mid·AMD·eve·ovn; MD live)',
    vac: (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4),
    light: (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4),
  },
  {
    key: 'nondrive_auto',
    label: '8. Non-drive + AMD automated',
    vac: (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4),
    light: 0,
  },
];

const FORMAT_SCENARIOS = [
  {
    label: 'FM CHR · 2015 · large market (Atlanta)',
    format: 'CHR',
    sigType: 'FM',
    sigPw: '100kw',
    year: 2015,
    marketId: 'atlanta',
    share: 0.052,
  },
  {
    label: 'FM Country · 1995 · medium (Nashville)',
    format: 'COUNTRY',
    sigType: 'FM',
    sigPw: '100kw',
    year: 1995,
    marketId: 'nashville',
    share: 0.068,
  },
  {
    label: 'FM Hot AC · 2005 · medium (Nashville)',
    format: 'HOT_AC',
    sigType: 'FM',
    sigPw: '100kw',
    year: 2005,
    marketId: 'nashville',
    share: 0.048,
  },
  {
    label: 'AM Oldies · 1990 · small (Wichita)',
    format: 'OLDIES',
    sigType: 'AM',
    sigPw: '50kw',
    year: 1990,
    marketId: 'wichita',
    share: 0.059,
  },
];

let legacySrc = readFileSync(legacyPath, 'utf8');
if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
  throw new Error('ACTIVE_MARKET anchor missing');
}
legacySrc = legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, "let ACTIVE_MARKET='wichita'");
const ctx = makeCtx();
ctx.globalThis = ctx;
ctx.window = ctx;
const _saveLog = console.log;
console.log = () => {};
vm.runInContext(legacySrc, ctx);
console.log = _saveLog;

/** Const bindings from legacy.js live in VM scope — pull via one evaluated object. */
const L = vm.runInContext(
  `({
    FM, COH, FA, calcRev, canonicalHitsFormatKey,
    staffingAutomationDiagnosticBundle, talentFranchiseRatingsEffect,
    stationAutomationScore, stationStaffingAutomationLabel
  })`,
  ctx,
);

const {
  COH,
  FM,
  FA,
  canonicalHitsFormatKey,
  calcRev,
  staffingAutomationDiagnosticBundle,
  talentFranchiseRatingsEffect,
  stationAutomationScore,
  stationStaffingAutomationLabel,
} = L;

if (typeof calcRev !== 'function') throw new Error('calcRev not exposed from VM');
if (typeof staffingAutomationDiagnosticBundle !== 'function') {
  throw new Error('staffingAutomationDiagnosticBundle missing');
}
if (typeof talentFranchiseRatingsEffect !== 'function') {
  throw new Error('talentFranchiseRatingsEffect missing');
}

function fmtKeyForStation(format) {
  return canonicalHitsFormatKey(format);
}

function buildStation(sc) {
  const fmtKey = fmtKeyForStation(sc.format);
  const fmd = FM[fmtKey] || FM.COUNTRY;
  const demo = FA[fmtKey] || FA.COUNTRY;
  const cur = {};
  let wSum = 0;
  for (const c of COH) {
    wSum += demo[c] || 0.15;
  }
  const targetTotalAqh = 5200 + Math.round(sc.share * 62_000);
  const prog = {};
  for (const sl of SLOTS) {
    prog[sl] = { talent: null, quality: 58 };
  }
  for (const c of COH) {
    const w = (demo[c] || 0.15) / wSum;
    cur[c] = { aqh: Math.max(1, Math.round(targetTotalAqh * w)) };
  }
  const spots = fmd.sp || 14;
  return {
    id: `bench_${sc.marketId}_${sc.format}_${sc.year}`,
    callLetters: 'TEST',
    format: sc.format,
    sig: { type: sc.sigType, pw: sc.sigPw, reach: sc.sigType === 'AM' ? 0.82 : 0.72 },
    prog,
    oq: 74,
    isPlayer: false,
    isPublic: false,
    fmBooster: false,
    _bpSlotDeferred: false,
    corpOwner: null,
    identity: 38,
    identityBudget: 0,
    programmingFocus: 'balanced',
    salesForce: { level: 0 },
    rat: { cur, hist: [], share: sc.share, aqh: targetTotalAqh, margin: sc.sigType === 'AM' ? 0.012 : 0.018 },
    ops: { spots, sell: 0.68, promo: 0, progBudget: 0 },
    stream: { active: false, aqh: 0, rev: 0, upkeep: 0, dragOffset: 0, launchYear: 0 },
    fin: { rev: 0, cost: 0, ebitda: 0, tal: 0, fix: 0 },
    talentFranchise: 0.88,
  };
}

function money(n) {
  if (n == null || !Number.isFinite(n)) return '';
  return Math.round(n).toLocaleString('en-US');
}

function fixed(n, d = 4) {
  if (n == null || !Number.isFinite(n)) return '';
  return Number(n).toFixed(d);
}

function runRow(s, G) {
  calcRev(s, G);
  const bundle = staffingAutomationDiagnosticBundle(s, G);
  const tf = talentFranchiseRatingsEffect(s, G);
  const auto = stationAutomationScore(s);
  const label = stationStaffingAutomationLabel(s);
  const appeal = Number(bundle.appeal);
  const identity = Number(bundle.identity);
  const tfCombined = tf.combined;
  const monStack = appeal * identity * tfCombined;
  return {
    auto,
    label,
    tal: s.fin.tal,
    cost: s.fin.cost,
    rev: s.fin.rev,
    ebitda: s.fin.ebitda,
    appeal,
    identity,
    tfCombined,
    tfCeiling: tf.ceilingMult,
    tfSpdGain: tf.spdGainMult,
    tfSpdLoss: tf.spdLossMult,
    franchise: tf.franchise,
    monStack,
  };
}

function printTable(sc, G, rows) {
  const baseline = rows[0];
  const bStack = baseline.monStack || 1;
  const sep = '\t';
  console.log(`\n${'='.repeat(100)}`);
  console.log(sc.label);
  console.log(
    [
      'setup',
      'auto',
      'label',
      'talent$',
      'totalCost$',
      'rev$',
      'appeal×',
      'identity×',
      'frScore',
      'tfCombined',
      'monStack×',
      'ΔmonStack%',
      'ebitda$',
      'Δebitda$',
    ].join(sep),
  );
  for (const r of rows) {
    const dE = r.ebitda - baseline.ebitda;
    const dStackPct = bStack > 0 ? ((r.monStack / bStack - 1) * 100) : 0;
    console.log(
      [
        r.setupLabel,
        fixed(r.auto, 4),
        r.label,
        money(r.tal),
        money(r.cost),
        money(r.rev),
        fixed(r.appeal, 4),
        fixed(r.identity, 4),
        fixed(r.franchise, 3),
        fixed(r.tfCombined, 4),
        fixed(r.monStack, 4),
        (dStackPct >= 0 ? '+' : '') + fixed(dStackPct, 2),
        money(r.ebitda),
        (dE >= 0 ? '+' : '') + money(dE),
      ].join(sep),
    );
  }
}

console.log('Staffing economics table — half-period $ from calcRev; multipliers from staffing + talent franchise.');
console.log('Δebitda vs row 1 (all live). Rev is from calcRev with frozen AQH/share (no ratings feedback loop in this harness).');
console.log('monStack× = appeal× × identity× × tfCombined (directional audience/ratings quality vs baseline).\n');

for (const sc of FORMAT_SCENARIOS) {
  const G = {
    year: sc.year,
    marketId: sc.marketId,
    period: 1,
    turn: 48,
    adx: 1.0,
    streamDrag: 0.12,
    ps: [],
  };
  const rows = [];
  for (const def of STAFFING_ROWS) {
    const s = buildStation(sc);
    applyStaffingMask(s, def.vac, def.light);
    const r = runRow(s, G);
    rows.push({ setupLabel: def.label, ...r });
  }
  printTable(sc, G, rows);
}

console.log(`\n${'='.repeat(100)}`);
console.log('Notes:');
console.log('- Voice-track = vacant slot with staffingMode "light" (music formats only). Talent$ = on-air payroll half-period.');
console.log('- frScore = getTalentFranchiseScore (default 0.88); tfCombined = talentFranchiseRatingsEffect.combined.');
console.log('- Rows 7–8 add afternoon drive vacant to the row-5/6 roster (mid·AMD·eve·ovn) so you can compare “non-drive only” vs “non-drive + AMD”.');
console.log('- For revenue sensitivity to staffing, run recalc() gameplay path or extend harness to multiply rev by monStack× / baseline.');
