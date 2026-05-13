#!/usr/bin/env node
/**
 * Report: station seller disposition distribution (cold acquisition vs LMA buyout).
 * Run: node scripts/report-acquisition-sellers.mjs
 *
 * Logic is imported from acquisitionSellerDisposition.mjs (SYNC with src/legacy.js).
 */
/* eslint-disable no-console */

import {
  acqPrice,
  sellerDisposition,
  playerAcqAsk,
  playerAcqFairValue,
  stationIsNoncommercialInstitutional,
} from './acquisitionSellerDisposition.mjs';

function st(id, share, rev, ebitda, corp) {
  return {
    id,
    isPlayer: false,
    corpOwner: corp || null,
    str: 'moderate',
    oq: 50,
    format: 'COUNTRY',
    freq: '99.7 FM',
    sig: { type: 'FM', pw: '50kw' },
    fin: { rev, ebitda: ebitda ?? 0 },
    rat: { share },
  };
}

function summarize(G, label) {
  const comm = (G.stations || [])
    .filter((s) => s && !s.isPlayer && !stationIsNoncommercialInstitutional(s) && !s._bpSlotDeferred)
    .sort((a, b) => (b.rat?.share || 0) - (a.rat?.share || 0));
  const counts = {
    not_for_sale: 0,
    reluctant: 0,
    normal: 0,
    eager: 0,
    distressed: 0,
  };
  let purchCold = 0;
  let purchLma = 0;
  const rows = [];
  for (const s of comm) {
    const d = sellerDisposition(s, G, {});
    counts[d.tier] = (counts[d.tier] || 0) + 1;
    const ask = playerAcqAsk(s, G, {});
    const askL = playerAcqAsk(s, G, { lmaBuyout: true });
    if (ask != null) purchCold++;
    if (askL != null) purchLma++;
    const fair = playerAcqFairValue(s, G);
    rows.push({
      id: s.id,
      rk: comm.findIndex((x) => x.id === s.id) + 1,
      tier: d.tier,
      ask,
      fair,
      askL,
    });
  }
  console.log('\n=== ' + label + ' ===');
  console.log('Commercial rivals:', comm.length);
  console.log('Tiers (cold):', JSON.stringify(counts));
  console.log('Purchasable cold:', purchCold + '/' + comm.length, '· LMA buyout path:', purchLma + '/' + comm.length);
  const top3 = rows.filter((r) => r.rk <= 3);
  const topRel = top3.filter((r) => r.tier === 'reluctant' || r.tier === 'not_for_sale').length;
  console.log('Top 3 reluctant or NFS:', topRel + '/' + top3.length);
  const weak = rows.filter((r) => r.rk >= Math.ceil(comm.length * 0.65));
  const weakMot = weak.filter((r) => r.tier === 'eager' || r.tier === 'distressed').length;
  console.log('Bottom ~35% eager/distressed:', weakMot + '/' + weak.length);
  const ex = rows.slice(0, 3).concat(rows.slice(-2));
  console.log(
    'Sample:',
    ex
      .map((r) => `${r.id}#${r.rk} ${r.tier} fair=${r.fair} ask=${r.ask == null ? 'NFS' : r.ask} lmaAsk=${r.askL}`)
      .join(' | ')
  );
}

// Deep market 2000: leader NFS, tail deals
const deep = {
  year: 2000,
  period: 2,
  turn: 10,
  marketId: 'atlanta',
  stations: [
    st('r1', 0.072, 90000, 95000, null),
    st('r2', 0.055, 70000, 45000, 'clearwave'),
    st('r3', 0.048, 55000, 22000, null),
    st('r4', 0.04, 48000, 8000, null),
    st('r5', 0.035, 42000, -5000, null),
    st('r6', 0.028, 38000, -12000, null),
    st('r7', 0.022, 32000, -18000, null),
    st('r8', 0.018, 28000, -24000, null),
  ],
};

// Pre-96 thin market: no crown NFS tier
const thin = {
  year: 1992,
  period: 1,
  turn: 1,
  marketId: 'atlanta',
  stations: [st('a', 0.06, 60000, 20000, null), st('b', 0.04, 50000, 5000, null), st('c', 0.025, 40000, -8000, null)],
};

// Late-game cash: compare fair vs ask for #1
const leader = deep.stations.find((s) => s.id === 'r1');
const fair1 = playerAcqFairValue(leader, deep);
const ask1 = playerAcqAsk(leader, deep, {});

summarize(deep, '2000 deep market (8 rivals)');
summarize(thin, '1992 thin market (3 rivals)');
console.log('\n=== Snowball check (#1 station) ===');
console.log('Fair:', fair1, 'Cold ask:', ask1 === null ? 'NFS' : ask1, 'Ratio:', ask1 ? (ask1 / fair1).toFixed(2) : '—');
