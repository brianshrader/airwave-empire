#!/usr/bin/env node
/**
 * Side-by-side Phase 1 A/B @ 2026 across archived seed JSON files.
 *   node scripts/summarize-supply-phase1-seeds.mjs
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const seeds = ['20260627', '20260628', '20260629'];
const markets = ['houston', 'phoenix', 'dallas', 'atlanta', 'seattle', 'chicago'];

function load(seed) {
  const p = path.join(root, 'tmp', `supply_phase1_ab_seed${seed}.json`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function ecologyVerdict(dLeader, dTop5) {
  const leaderImproves = dLeader <= -0.005;
  const top5Improves = dTop5 <= -0.01;
  const leaderWorse = dLeader >= 0.005;
  const top5Worse = dTop5 >= 0.01;
  if (leaderImproves && top5Improves) return 'Improves';
  if (leaderWorse && top5Worse) return 'Worse';
  return 'Mixed';
}

const bySeed = {};
for (const seed of seeds) {
  bySeed[seed] = load(seed);
}

const rows = [];
for (const mkt of markets) {
  const seedRows = seeds.map((seed) => {
    const e = bySeed[seed].markets.find((x) => x.marketId === mkt);
    const b = e.baseline2026;
    const p = e.phase1_2026;
    const dComm = p.commercial - b.commercial;
    const dLeader = p.leaderShare - b.leaderShare;
    const dTop5 = p.top5ShareMass - b.top5ShareMass;
    const fam = e.replenishFamilies;
    const nt = fam.pct.news_talk != null ? (fam.pct.news_talk * 100).toFixed(0) + '%' : '—';
    return { seed, dComm, dLeader, dTop5, verdict: ecologyVerdict(dLeader, dTop5), newsTalk: nt };
  });
  const verdicts = seedRows.map((r) => r.verdict);
  const improves = verdicts.filter((v) => v === 'Improves').length;
  const mixed = verdicts.filter((v) => v === 'Mixed').length;
  const worse = verdicts.filter((v) => v === 'Worse').length;
  let pattern = 'Mixed';
  if (improves >= 2 && mixed + improves === 3) pattern = improves === 3 ? 'Consistent Improves' : 'Mostly Improves';
  if (worse >= 2) pattern = 'Mostly Worse';
  rows.push({ mkt, seedRows, pattern });
}

const md = [];
md.push('# Supply Phase 1 — Three-seed comparison @ 2026');
md.push('');
md.push('Seeds: 20260627, 20260628, 20260629 · 12 runs/market/arm · diversified replenishment pool');
md.push('');
md.push('**Ecology verdict:** Improves = #1 share ↓ ≥0.5 pp AND top-5 ↓ ≥1.0 pp; Mixed = otherwise; Worse = both ↑');
md.push('');
md.push('| Market | Pattern | Seed | Δ Commercial | Δ #1 (pp) | Δ Top-5 (pp) | Ecology | News/Talk replen |');
md.push('|--------|---------|------|--------------|-----------|--------------|---------|------------------|');
for (const { mkt, seedRows, pattern } of rows) {
  seedRows.forEach((r, i) => {
    md.push(
      `| ${i === 0 ? mkt : ''} | ${i === 0 ? pattern : ''} | ${r.seed} | +${r.dComm.toFixed(1)} | ${(r.dLeader * 100).toFixed(2)} | ${(r.dTop5 * 100).toFixed(2)} | ${r.verdict} | ${r.newsTalk} |`,
    );
  });
}

md.push('');
md.push('## Cross-seed summary');
md.push('');
for (const { mkt, seedRows, pattern } of rows) {
  const comm = seedRows.map((r) => `+${r.dComm.toFixed(1)}`).join(', ');
  const eco = seedRows.map((r) => r.verdict).join(' / ');
  md.push(`- **${mkt}** (${pattern}): commercial [${comm}]; ecology [${eco}]`);
}

const invWins = rows.every((r) => r.seedRows.every((s) => s.dComm >= 2.5));
const coreImproves = ['houston', 'dallas', 'seattle', 'chicago'].every((m) => {
  const row = rows.find((r) => r.mkt === m);
  return row.seedRows.filter((s) => s.verdict === 'Improves').length >= 2;
});
const borderline = ['phoenix', 'atlanta'].every((m) => {
  const row = rows.find((r) => r.mkt === m);
  return row.seedRows.every((s) => s.verdict !== 'Worse');
});

md.push('');
md.push('## Read-through');
md.push('');
md.push(`- **Inventory:** ${invWins ? 'All 6 markets +2.5–6 commercial on all 3 seeds' : 'See per-market deltas'}`);
md.push(`- **Core four (HOU/DAL/SEA/CHI):** ${coreImproves ? '≥2/3 seeds show Improves ecology' : 'Not consistent across seeds'}`);
md.push(`- **Borderline (PHX/ATL):** ${borderline ? 'No seed shows Worse ecology; mixed/improves only' : 'At least one Worse seed'}`);
md.push('');
md.push('**Recommendation gate:** Staging playtesting (still opt-in) is reasonable if core-four pattern holds and replenishment family caps stay <40% on all seeds.');

const out = path.join(root, 'tmp', 'supply_phase1_ab_three_seed_comparison.md');
writeFileSync(out, md.join('\n'), 'utf8');
console.log(`Wrote ${out}`);
console.log('');
console.log(md.join('\n'));
