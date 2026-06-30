#!/usr/bin/env node
/**
 * Reference panel snapshot — canonical market/year tables for historical review.
 *
 *   npm run diag:reference-panel
 *   npm run diag:reference-panel -- --seed=42
 *   npm run diag:reference-panel -- --markets=houston,phoenix
 */
/* eslint-disable no-console */

import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import {
  REFERENCE_PANEL_MARKETS,
  REFERENCE_PANEL_YEARS,
  DEFAULT_EDITORIAL_SEED,
  paths,
} from './editorial/config.mjs';
import { runReferencePanel } from './editorial/simSnapshot.mjs';

function parseArgs(argv) {
  const o = { seed: DEFAULT_EDITORIAL_SEED, markets: [...REFERENCE_PANEL_MARKETS], years: [...REFERENCE_PANEL_YEARS] };
  for (const a of argv) {
    if (a.startsWith('--seed=')) o.seed = parseInt(a.slice(7), 10) || DEFAULT_EDITORIAL_SEED;
    else if (a.startsWith('--markets=')) o.markets = a.slice(10).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    else if (a.startsWith('--years=')) o.years = a.slice(8).split(',').map((x) => parseInt(x.trim(), 10)).filter(Boolean);
  }
  return o;
}

function formatMd(panel) {
  const lines = [
    '# Reference panel snapshot',
    '',
    `**Generated:** ${panel.meta.generatedAt}`,
    `**Seed:** ${panel.meta.seed}`,
    `**Markets:** ${panel.meta.markets.join(', ')}`,
    `**Years:** ${panel.meta.years.join(', ')}`,
    '',
  ];

  for (const cell of panel.cells) {
    lines.push(`## ${cell.marketId.toUpperCase()} — ${cell.year}`);
    if (!cell.ok) {
      lines.push(`**ERROR:** ${cell.err}`);
      lines.push('');
      continue;
    }
    lines.push(`Commercial dial: **${cell.nCommDial}** · Book: **${cell.nBook}** · Spanish lane: **${(cell.spanishLaneShare * 100).toFixed(1)}%**`);
    lines.push(`Leader: **${cell.ranker?.[0]?.format}** ${(cell.topShare * 100).toFixed(1)}% · HHI: **${Math.round(cell.hhi)}** · Mid-tier competitors: **${cell.midTierCompetitors}**`);
    lines.push('');
    lines.push('| # | Call | Format | Band | Share |');
    lines.push('|---|------|--------|------|-------|');
    for (const r of cell.ranker || []) {
      lines.push(`| ${r.rank} | ${r.call} | ${r.format} | ${r.band} | ${(r.share * 100).toFixed(1)}% |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Reference panel (${opts.markets.length} markets × ${opts.years.length} years, seed ${opts.seed})…`);

  const panel = runReferencePanel(opts);
  const outDir = path.dirname(paths.referencePanelOut);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(paths.referencePanelOut, `${JSON.stringify(panel, null, 2)}\n`);
  writeFileSync(path.join(outDir, 'reference_panel.md'), formatMd(panel));

  const ok = panel.cells.filter((c) => c.ok).length;
  console.log(`Done: ${ok}/${panel.cells.length} cells OK`);
  console.log(`Wrote ${paths.referencePanelOut}`);
}

main();
