#!/usr/bin/env node
/**
 * Sanity checks for solo bankruptcy re-entry:
 * soloCheapestAcquisitionPrice / soloPlayerCanAffordReentry (and _soloBankrupt = !canReenter).
 *
 * Uses scripts/acquisitionSellerDisposition.mjs (SYNC with src/legacy.js seller tiers + playerAcqAsk).
 */
/* eslint-disable no-console */

import { acqPrice, playerAcqAsk, stationIsNoncommercialInstitutional } from './acquisitionSellerDisposition.mjs';

const MP = { mode: 'solo', playerId: 0 };

// ── FCC (mirror legacy.js ~104–157) ─────────────────────────────────────────
const FCC_PRE96 = [
  { year: 1970, am: 1, fm: 1 },
  { year: 1992, am: 2, fm: 2 },
  { year: 1994, am: 3, fm: 3 },
];
const FCC_96_TIERS = [
  { minSignals: 45, total: 8, perService: 5, label: '8 stations (45+ signals)' },
  { minSignals: 30, total: 7, perService: 4, label: '7 stations (30–44 signals)' },
  { minSignals: 15, total: 6, perService: 4, label: '6 stations (15–29 signals)' },
  { minSignals: 0, total: 5, perService: 3, label: '5 stations (≤14 signals)' },
];

function fccLimits(year, totalSignals) {
  totalSignals = totalSignals || 10;
  if (year < 1996) {
    let r = FCC_PRE96[0];
    for (const l of FCC_PRE96) {
      if (year >= l.year) r = l;
    }
    return { mode: 'pre96', am: r.am, fm: r.fm, total: r.am + r.fm, label: `${r.am} AM + ${r.fm} FM` };
  }
  let tier = FCC_96_TIERS[FCC_96_TIERS.length - 1];
  for (const t of FCC_96_TIERS) {
    if (totalSignals >= t.minSignals) {
      tier = t;
      break;
    }
  }
  return { mode: '96', total: tier.total, perService: tier.perService, label: tier.label, signals: totalSignals };
}

function fccOwned(entity, G) {
  const mine =
    entity === 'player'
      ? G.stations.filter((s) => s.isPlayer && (MP.mode !== 'live' || s._mpOwner === MP.playerId))
      : G.stations.filter((s) => s.corpOwner === entity && !s.isPlayer);
  const am = mine.filter((s) => s.sig.type === 'AM').length;
  const fm = mine.filter((s) => s.sig.type === 'FM' || s.fmBooster).length;
  return { total: mine.length, am, fm };
}

function fccCanAcquire(entity, sigType, G) {
  const lim = fccLimits(G.year, G.stations.length);
  const owned = fccOwned(entity, G);
  if (lim.mode === 'pre96') {
    if (sigType === 'AM') return owned.am < lim.am;
    return owned.fm < lim.fm;
  }
  if (owned.total >= lim.total) return false;
  const serviceCount = sigType === 'AM' ? owned.am : owned.fm;
  return serviceCount < lim.perService;
}

function soloCheapestAcquisitionPrice(G) {
  if (!G?.stations) return null;
  const avail = G.stations.filter(
    (s) => s && !s._bpSlotDeferred && !s.isPlayer && !stationIsNoncommercialInstitutional(s)
  );
  let best = null;
  avail.forEach((s) => {
    const sigType = s.sig.type === 'AM' || s.fmBooster ? 'AM' : 'FM';
    if (!fccCanAcquire('player', sigType, G)) return;
    const price = playerAcqAsk(s, G);
    if (price == null || !Number.isFinite(price)) return;
    if (best == null || price < best) best = price;
  });
  return best;
}

function soloPlayerCanAffordReentry(G) {
  if (MP.mode === 'live') return false;
  const minP = soloCheapestAcquisitionPrice(G);
  if (minP == null || !Number.isFinite(minP)) return false;
  return (G.cash || 0) >= minP;
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function stn(opts) {
  return {
    id: opts.id || 'r1',
    isPlayer: !!opts.isPlayer,
    isPublic: !!opts.isPublic,
    _bpSlotDeferred: opts._bpSlotDeferred,
    fmBooster: !!opts.fmBooster,
    corpOwner: opts.corpOwner ?? null,
    str: opts.str ?? 'moderate',
    oq: opts.oq ?? 50,
    format: opts.format ?? 'COUNTRY',
    freq: opts.freq ?? '99.7 FM',
    sig: opts.sig ?? { type: 'FM', pw: '100kw' },
    fin: { rev: opts.rev ?? 50000, ebitda: opts.ebitda ?? 0 },
    rat: { share: opts.share ?? 0.05 },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

// 1) acqPrice matches hand check (same formula as legacy)
const manual = stn({ id: 'm1' });
const pManual = acqPrice(manual, { year: 2000, stations: [] });
assert(pManual === 1200000, `acqPrice expected 1_200_000, got ${pManual}`);

// 2) Cheapest rival + affordability threshold (two commercial rivals so #1 is not “whole market” crown)
const G2 = {
  year: 2000,
  cash: 0,
  stations: [
    stn({ id: 'rivTop', isPlayer: false, share: 0.09, rev: 55000 }),
    stn({ id: 'riv1', isPlayer: false, share: 0.05, rev: 50000 }),
    ...Array.from({ length: 17 }, (_, i) => stn({ id: `pad${i}`, isPlayer: false, isPublic: true })),
  ],
};
const min2 = soloCheapestAcquisitionPrice(G2);
assert(min2 === 1200000, `cheapest expected 1_200_000, got ${min2}`);
G2.cash = min2 - 1;
assert(soloPlayerCanAffordReentry(G2) === false, 'cash min-1 should not afford reentry');
G2.cash = min2;
assert(soloPlayerCanAffordReentry(G2) === true, 'cash at min should afford reentry');

// 3) No commercial rivals → null → cannot re-enter
const G3 = { year: 2000, cash: 1e9, stations: [stn({ id: 'you', isPlayer: true })] };
assert(soloCheapestAcquisitionPrice(G3) === null, 'no rivals → null');
assert(soloPlayerCanAffordReentry(G3) === false, 'no targets → cannot afford reentry');

// 4) Only public / deferred filtered out
const G4 = {
  year: 2000,
  cash: 1e9,
  stations: [
    stn({ id: 'pub', isPlayer: false, isPublic: true }),
    stn({ id: 'def', isPlayer: false, _bpSlotDeferred: true }),
  ],
};
assert(soloCheapestAcquisitionPrice(G4) === null, 'only public/deferred → null');

// 5) Post-96: at FM sub-cap, pick cheaper purchasable signal (playerAcqAsk, not raw acqPrice)
const G5 = {
  year: 2000,
  stations: [
    ...Array.from({ length: 4 }, (_, i) => stn({ id: `pfm${i}`, isPlayer: true, sig: { type: 'FM', pw: '50kw' } })),
    stn({
      id: 'cheapAm',
      isPlayer: false,
      sig: { type: 'AM', pw: '5kw' },
      freq: '680 AM',
      share: 0.02,
      rev: 40000,
      str: 'weak',
    }),
    stn({
      id: 'rivFm',
      isPlayer: false,
      share: 0.015,
      rev: 30000,
      str: 'niche',
    }),
  ],
};
assert(fccCanAcquire('player', 'FM', G5) === false, 'FM slot should be full');
assert(fccCanAcquire('player', 'AM', G5) === true, 'AM slot should be open');
const min5 = soloCheapestAcquisitionPrice(G5);
const cheapAm = G5.stations.find((s) => s.id === 'cheapAm');
assert(min5 === playerAcqAsk(cheapAm, G5), `expected cheapest AM playerAcqAsk ${playerAcqAsk(cheapAm, G5)}, got ${min5}`);

// 6) Multiplayer mode: never "solo re-entry"
MP.mode = 'live';
assert(soloPlayerCanAffordReentry({ year: 2000, cash: 1e12, stations: G2.stations }) === false, 'MP live → false');
MP.mode = 'solo';

console.log('ok — solo re-entry checks passed (6 cases).');
