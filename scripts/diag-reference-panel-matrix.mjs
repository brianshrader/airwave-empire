#!/usr/bin/env node
/**
 * Multi-seed reference panel matrix — HHI, mid-tier, Spanish, dial (Wichita/Nashville focus).
 *
 *   node scripts/diag-reference-panel-matrix.mjs
 *   node scripts/diag-reference-panel-matrix.mjs --seeds=42,99,137,271,314,528,777,1337
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  REFERENCE_PANEL_MARKETS,
  REFERENCE_PANEL_YEARS,
  DEFAULT_EDITORIAL_SEED,
  root,
} from './editorial/config.mjs';
import { runReferencePanel } from './editorial/simSnapshot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEEDS = [42, 99, 137, 271, 314, 528, 777, 1337];
const outJson = path.join(root, 'tmp', 'reference_panel', 'reference_panel_matrix.json');
const outMd = path.join(root, 'tmp', 'reference_panel', 'reference_panel_matrix.md');

function parseArgs(argv) {
  let seeds = [...DEFAULT_SEEDS];
  for (const a of argv) {
    if (a.startsWith('--seeds=')) {
      seeds = a.slice(8).split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
    }
  }
  return { seeds };
}

function mean(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function stats(nums) {
  if (!nums.length) return { mean: 0, min: 0, max: 0, n: 0 };
  return {
    mean: mean(nums),
    min: Math.min(...nums),
    max: Math.max(...nums),
    n: nums.length,
  };
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function main() {
  const { seeds } = parseArgs(process.argv.slice(2));
  const allRuns = [];

  for (const seed of seeds) {
    console.log(`seed ${seed}…`);
    const panel = runReferencePanel({
      markets: REFERENCE_PANEL_MARKETS,
      years: REFERENCE_PANEL_YEARS,
      seed,
    });
    for (const cell of panel.cells) {
      if (!cell.ok) continue;
      allRuns.push({
        seed,
        marketId: cell.marketId,
        year: cell.year,
        nCommDial: cell.nCommDial,
        nBook: cell.nBook,
        spanishLaneShare: cell.spanishLaneShare,
        topShare: cell.topShare,
        top5Share: cell.top5Share,
        hhi: cell.hhi,
        midTierCompetitors: cell.midTierCompetitors,
      });
    }
  }

  const cells = [];
  for (const marketId of REFERENCE_PANEL_MARKETS) {
    for (const year of REFERENCE_PANEL_YEARS) {
      const rows = allRuns.filter((r) => r.marketId === marketId && r.year === year);
      cells.push({
        marketId,
        year,
        nSeeds: rows.length,
        nCommDial: stats(rows.map((r) => r.nCommDial)),
        spanishLaneShare: stats(rows.map((r) => r.spanishLaneShare)),
        hhi: stats(rows.map((r) => r.hhi)),
        midTierCompetitors: stats(rows.map((r) => r.midTierCompetitors)),
        topShare: stats(rows.map((r) => r.topShare)),
      });
    }
  }

  const md = [
    '# Reference panel — multi-seed matrix',
    '',
    `**Seeds (${seeds.length}):** ${seeds.join(', ')}`,
    `**Markets:** ${REFERENCE_PANEL_MARKETS.join(', ')}`,
    '',
    '| Market | Year | Spanish (min/med/max) | Dial (min–max) | HHI (mean) | Mid-tier (min–max) |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const c of cells) {
    const sp = c.spanishLaneShare;
    const spStr = `${pct(sp.min)} / ${pct(sp.mean)} / ${pct(sp.max)}`;
    md.push(
      `| ${c.marketId} | ${c.year} | ${spStr} | ${c.nCommDial.min}–${c.nCommDial.max} | ${c.hhi.mean.toFixed(0)} | ${c.midTierCompetitors.min}–${c.midTierCompetitors.max} |`,
    );
  }

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify({ meta: { seeds, markets: REFERENCE_PANEL_MARKETS, years: REFERENCE_PANEL_YEARS }, cells, runs: allRuns }, null, 2)}\n`);
  writeFileSync(outMd, `${md.join('\n')}\n`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
}

main();
