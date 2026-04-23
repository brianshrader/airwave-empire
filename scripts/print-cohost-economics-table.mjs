#!/usr/bin/env node
/**
 * Deterministic co-host / chemistry harness — no market sim, no AI, no chemistry rolls.
 * Compares solo morning-drive slot quality vs the same slot with a forced pairing chemistry,
 * using the same formulas as src/legacy.js (loaded in a VM).
 *
 * Run: node scripts/print-cohost-economics-table.mjs
 *      node scripts/print-cohost-economics-table.mjs --talk   # second table: NEWS_TALK
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');

const HOST_QS = [40, 65, 85];
const COH_QS = [40, 65, 85];
/** Table "Chem" is 0–1 (bad → great); mapped to in-game swing axis via chemGame = (u - 0.5) * 2. */
const CHEM_U = [0.2, 0.5, 0.75, 0.9];

const BASE_SLOT = 45;
const YEAR = 2015;
const SLOT = 'morningDrive';

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

function chemUToGame(u) {
  return (u - 0.5) * 2;
}

/** Annual co-host salary above solo; used for marginal $/quality when dQ > 0. */
const QUESTIONABLE_DOLLARS_PER_POINT = 12_000;

function verdict(deltaQ, deltaSal) {
  const dq = deltaQ;
  if (dq <= -1.5) return 'WORSE';
  if (dq >= 1.5) {
    const perPt = deltaSal / dq;
    if (deltaSal > 0 && perPt >= QUESTIONABLE_DOLLARS_PER_POINT) return 'QUESTIONABLE';
    return 'BETTER';
  }
  return 'NEUTRAL';
}

function pad(n, w) {
  return String(n).padEnd(w, ' ');
}

function runTable(L, Gstub, label, fmt, scoutFit) {
  const { coHostSlotQualityDeltaPts, talentScoutFormatFit01, adjustCohostSalaryForRole, SAL, salInfl } = L;

  function makeTalent(q, tag) {
    const fit = scoutFit;
    const t = {
      id: `syn_${fmt}_${tag}_${q}`,
      name: `${tag}_${q}`,
      quality: q,
      _trueQuality: q,
      formatFit: { [fmt]: fit },
      _trueFormatFit: { [fmt]: fit },
      slot: SLOT,
      salary: 0,
      cyr: 2,
      morale: 70,
    };
    const tier = q < 52 ? 'entry' : q < 72 ? 'mid' : 'star';
    const sr = SAL[SLOT][tier];
    const mid = (sr[0] + sr[1]) / 2;
    t.salary = Math.round(salInfl(mid, YEAR) / 500) * 500;
    return t;
  }

  function soloSlotQ(primary) {
    const fit = talentScoutFormatFit01(primary, fmt);
    return Math.min(100, Math.round(BASE_SLOT + (primary.quality / 100) * fit * 35));
  }

  function cohostAnnualSalary(primary, cohost) {
    const c = { ...cohost, formatFit: { ...cohost.formatFit }, _trueFormatFit: { ...cohost._trueFormatFit } };
    adjustCohostSalaryForRole(c, SLOT, Gstub);
    return c.salary;
  }

  console.log('');
  console.log(label);
  console.log(
    `${pad('HostQ', 6)}${pad('CoHQ', 6)}${pad('Chem', 6)}${pad('SoloQ', 7)}${pad('DuoQ', 7)}${pad('dQ', 6)}${pad('Pri$', 9)}${pad('Coh$', 9)}${pad('dSal', 9)}${pad('$/dQ', 8)}${pad('Verdict', 14)}`,
  );
  console.log(`${'-'.repeat(6)}${'-'.repeat(6)}${'-'.repeat(6)}${'-'.repeat(7)}${'-'.repeat(7)}${'-'.repeat(6)}${'-'.repeat(9)}${'-'.repeat(9)}${'-'.repeat(9)}${'-'.repeat(8)}${'-'.repeat(14)}`);

  let maxDuo = 0;
  let maxDQ = -999;
  const verdictCounts = { BETTER: 0, QUESTIONABLE: 0, WORSE: 0, NEUTRAL: 0 };
  for (const hq of HOST_QS) {
    for (const cq of COH_QS) {
      const p = makeTalent(hq, 'H');
      const c = makeTalent(cq, 'C');
      const solo = soloSlotQ(p);
      const priSal = p.salary;
      const cohSal = cohostAnnualSalary(p, c);
      const dSal = cohSal;

      for (const chemU of CHEM_U) {
        const chemG = chemUToGame(chemU);
        const dPts = coHostSlotQualityDeltaPts(p, c, fmt, SLOT, chemG);
        const duo = Math.min(100, Math.round(solo + dPts));
        const dQ = duo - solo;
        maxDuo = Math.max(maxDuo, duo);
        maxDQ = Math.max(maxDQ, dQ);
        const v = verdict(dQ, dSal);
        verdictCounts[v] = (verdictCounts[v] || 0) + 1;
        const perPt = dQ > 0.25 ? Math.round(dSal / dQ) : dQ < -0.25 ? Math.round(dSal / -dQ) : '—';
        console.log(
          `${pad(hq, 6)}${pad(cq, 6)}${pad(chemU.toFixed(2), 6)}${pad(solo, 7)}${pad(duo, 7)}${pad((dQ >= 0 ? '+' : '') + dQ, 6)}${pad(priSal, 9)}${pad(cohSal, 9)}${pad('+' + dSal, 9)}${pad(perPt, 8)}${pad(v, 14)}`,
        );
      }
    }
  }
  console.log(`(max DuoQ ${maxDuo}, max dQ ${maxDQ >= 0 ? '+' : ''}${maxDQ})`);
  console.log(
    `Summary: BETTER ${verdictCounts.BETTER} · QUESTIONABLE ${verdictCounts.QUESTIONABLE} · WORSE ${verdictCounts.WORSE}`,
  );
}

function main() {
  const talk = process.argv.includes('--talk');
  const ctx = makeCtx();
  ctx.globalThis = ctx;
  ctx.window = ctx;
  const legacySrc = readFileSync(legacyPath, 'utf8');
  const _log = console.log;
  console.log = () => {};
  vm.runInContext(legacySrc, ctx);
  console.log = _log;

  vm.runInContext(
    `globalThis.G = { year: ${YEAR}, period: 1, turn: 0, marketId: 'atlanta', stations: [], talentBench: [] };`,
    ctx,
  );
  const Gstub = vm.runInContext('globalThis.G', ctx);
  if (!Gstub || typeof Gstub.year !== 'number') {
    throw new Error('VM global G not initialized');
  }

  const L = vm.runInContext(
    `({
      coHostSlotQualityDeltaPts,
      talentScoutFormatFit01,
      adjustCohostSalaryForRole,
      salInfl,
      SAL
    })`,
    ctx,
  );
  if (typeof L.coHostSlotQualityDeltaPts !== 'function') {
    throw new Error('coHostSlotQualityDeltaPts not found in VM');
  }

  console.log('Co-host economics harness (deterministic, VM-loaded legacy.js)');
  console.log(`Fixed: ${YEAR} · ${SLOT} · base slot ${BASE_SLOT} · solo lift = base + (hostQ/100)*scoutFit*35 (hire-style)`);
  console.log('Chem column: 0–1 label; internally chemGame = (Chem - 0.5)*2 for coHostSlotQualityDeltaPts.');
  console.log('Coh$ = annual salary after adjustCohostSalaryForRole (game co-host pay curve).');
  console.log(
    `Verdict: WORSE / NEUTRAL / BETTER on dQ bands; QUESTIONABLE = dQ ≥ +1.5 but co-host marginal $/dQ ≥ ${QUESTIONABLE_DOLLARS_PER_POINT.toLocaleString()} (cheap solo lift can still read BETTER).`,
  );

  runTable(L, Gstub, 'Scenario A — FM CHR · scoutFit 0.72 (music / personality-light)', 'CHR', 0.72);

  if (talk) {
    runTable(L, Gstub, 'Scenario B — NEWS_TALK · scoutFit 0.68 (spoken-word / stronger co-host model)', 'NEWS_TALK', 0.68);
  }
}

main();
