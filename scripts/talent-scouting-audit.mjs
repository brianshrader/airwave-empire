#!/usr/bin/env node
/**
 * Statistical audit for talent scouting vs true performance (keep in sync with src/legacy.js mkTal / mkPool).
 * Run: node scripts/talent-scouting-audit.mjs
 */
const QRG = { entry: [26, 48], mid: [40, 62], star: [54, 78] };

function rnd(a, b) {
  return a + Math.random() * (b - a);
}

function clampTalentFit01(v) {
  return Math.max(0.08, Math.min(0.98, typeof v === 'number' && !Number.isNaN(v) ? v : 0.3));
}

function sampleTal(fmt, tier) {
  const qr = QRG[tier] || QRG.mid;
  const trueQ = Math.round(rnd(qr[0], qr[1]));
  const trueFf = {};
  const scoutFf = {};
  const formats = ['top40_pop', 'rock_alt', 'country', 'news_talk'];
  formats.forEach((f) => {
    trueFf[f] = f === fmt ? rnd(0.52, 0.88) : rnd(0.1, 0.48);
    const noise = f === fmt ? rnd(-0.07, 0.07) : rnd(-0.11, 0.11);
    scoutFf[f] = clampTalentFit01(trueFf[f] + noise);
  });
  let scoutQ = Math.round(trueQ + rnd(-11, 11));
  scoutQ = Math.max(18, Math.min(97, scoutQ));
  return { fmt, tier, scoutQ, trueQ, scoutFf, trueFf };
}

function mkPoolSample(fmt) {
  const tiers = ['entry', 'mid', 'mid', Math.random() < 0.22 ? 'star' : 'mid'];
  return tiers.map((t) => sampleTal(fmt, t));
}

function hireContrib(t, fmt) {
  const sq = t.scoutQ;
  const tq = t.trueQ;
  const sf = clampTalentFit01(t.scoutFf[fmt]);
  const tf = clampTalentFit01(t.trueFf[fmt]);
  return {
    scout: Math.round((sq / 100) * sf * 35),
    true: Math.round((tq / 100) * tf * 35),
  };
}

function rank(arr, key) {
  const sorted = [...arr].sort((a, b) => b[key] - a[key]);
  const m = new Map();
  sorted.forEach((x, i) => m.set(x, i));
  return m;
}

const N = 8000;
let slamScout = 0;
let slamTrue = 0;
let sumGapQ = 0;
let rankAgree = 0;
let rankTopMatch = 0;
const examples = [];

for (let i = 0; i < N; i++) {
  const fmt = ['top40_pop', 'rock_alt', 'country', 'news_talk'][i % 4];
  const pool = mkPoolSample(fmt);
  for (const t of pool) {
    sumGapQ += t.scoutQ - t.trueQ;
    if (t.scoutQ >= 72) slamScout++;
    if (t.trueQ >= 72) slamTrue++;
  }
  const rS = rank(pool, 'scoutQ');
  const rT = rank(pool, 'trueQ');
  let agree = 0;
  for (const t of pool) {
    if (rS.get(t) === rT.get(t)) agree++;
  }
  if (agree === 4) rankAgree++;
  const topS = pool.reduce((a, b) => (a.scoutQ >= b.scoutQ ? a : b));
  const topT = pool.reduce((a, b) => (a.trueQ >= b.trueQ ? a : b));
  if (topS === topT) rankTopMatch++;

  if (examples.length < 12) {
    const sortedS = [...pool].sort((a, b) => b.scoutQ - a.scoutQ);
    const sortedT = [...pool].sort((a, b) => b.trueQ - a.trueQ);
    const topScout = sortedS[0];
    const topTrue = sortedT[0];
    if (topScout !== topTrue && examples.filter((e) => e.tag === 'rank_flip').length < 5) {
      const cS = hireContrib(topScout, fmt);
      const cT = hireContrib(topTrue, fmt);
      examples.push({
        tag: 'rank_flip',
        fmt,
        line: `Top by scout Q${topScout.scoutQ} (true ${topScout.trueQ}) vs top by true Q${topTrue.trueQ} (scout ${topTrue.scoutQ}) — hire-bump reveal Δ ${cS.true - cS.scout} vs ${cT.true - cT.scout} slot pts (spread over 8 periods)`,
      });
    }
    for (const t of pool) {
      const c = hireContrib(t, fmt);
      const d = c.true - c.scout;
      if (t.scoutQ >= 58 && t.trueQ <= t.scoutQ - 6 && examples.filter((e) => e.tag === 'overrated').length < 2) {
        examples.push({ tag: 'overrated', fmt, line: `Looked solid scout Q${t.scoutQ} but true Q${t.trueQ}; format fit scout ${Math.round(t.scoutFf[fmt] * 100)}% vs true ${Math.round(t.trueFf[fmt] * 100)}% · reveal Δ ${d} slot pts` });
      }
      if (t.scoutQ <= 50 && t.trueQ >= t.scoutQ + 6 && examples.filter((e) => e.tag === 'underrated').length < 2) {
        examples.push({ tag: 'underrated', fmt, line: `Looked average scout Q${t.scoutQ} but true Q${t.trueQ}; reveal Δ ${d} slot pts` });
      }
    }
  }
}

const totalTal = N * 4;
console.log('Talent scouting audit (' + N + ' pools × 4 candidates, ~' + totalTal + ' talents)\n');
console.log('Share with scoutQ ≥ 72: ' + ((100 * slamScout) / totalTal).toFixed(2) + '%');
console.log('Share with trueQ ≥ 72: ' + ((100 * slamTrue) / totalTal).toFixed(2) + '%');
console.log('Mean(scoutQ − trueQ): ' + (sumGapQ / totalTal).toFixed(3));
console.log('Pools where all 4 have identical scout/true rank order: ' + ((100 * rankAgree) / N).toFixed(2) + '%');
console.log('Pools where top scout is also top true: ' + ((100 * rankTopMatch) / N).toFixed(2) + '%');
console.log('\nExample pools (scout rank ≠ true rank):');
for (const ex of examples) {
  console.log('  [' + ex.fmt + '] ' + ex.line);
}
