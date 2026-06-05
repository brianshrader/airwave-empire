#!/usr/bin/env node
/**
 * Houston opening ecology Monte Carlo (read-only scaffold QA).
 *
 *   node scripts/diag-houston-opening-ecology.mjs
 *   node scripts/diag-houston-opening-ecology.mjs --runs=40
 *
 * Artifacts: tmp/houston_opening_ecology.{json,md}
 */
/* eslint-disable no-console */

import { writeFileSync } from 'fs';
import path from 'path';

import {
  FOCUS,
  PEER_COMPARE,
  MEGA_COMPARE,
  OPENING_YEARS,
  loadDiagApi,
  parseDiagArgs,
  readMarketMeta,
  runMonteCarloOpening,
  pct,
  root,
} from './houstonScaffoldDiagHarness.mjs';

const outJson = path.join(root, 'tmp', 'houston_opening_ecology.json');
const outMd = path.join(root, 'tmp', 'houston_opening_ecology.md');

function renderMarkdown(artifact) {
  const lines = [];
  lines.push('# Houston Opening Ecology');
  lines.push('');
  lines.push(`Recorded: ${artifact.recordedAt}`);
  lines.push(`Runs: ${artifact.config.runs} · Seed: ${artifact.config.seed}`);
  lines.push(`Focus: **${artifact.marketMeta.label}** (\`${artifact.marketMeta.archetypeId}\`, ${artifact.marketMeta.rankTier}, revScale ${artifact.marketMeta.revScale})`);
  lines.push('');
  lines.push('## Snapshot table (mean unless noted)');
  lines.push('');
  lines.push('| Year | Market | HHI med | Top-3 med | FM adopt med | Stns med | Country μ | Spanish μ | Spoken μ | Urban/R&B μ | CHR μ |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const year of OPENING_YEARS) {
    for (const mid of [FOCUS, ...PEER_COMPARE, ...MEGA_COMPARE]) {
      const y = artifact.openingEcology[mid]?.[year];
      if (!y) continue;
      lines.push(`| ${year} | ${mid} | ${y.hhi.median?.toFixed(0) ?? '—'} | ${pct(y.top3Share.median)} | ${pct(y.fmAdoption.median)} | ${y.stationCount.median ?? '—'} | ${pct(y.countryShare.mean)} | ${pct(y.spanishShare.mean)} | ${pct(y.spokenShare.mean)} | ${pct(y.urbanRnbShare.mean)} | ${pct(y.chrShare.mean)} |`);
    }
  }
  lines.push('');
  lines.push('## Houston vs Dallas @2026 (opening snapshot)');
  lines.push('');
  const h26 = artifact.openingEcology.houston?.[2026];
  const d26 = artifact.openingEcology.dallas?.[2026];
  if (h26 && d26) {
    lines.push('| Metric | Houston | Dallas | Δ (H−D) |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const [label, pick] of [
      ['Country', (y) => y.countryShare.mean],
      ['Spanish', (y) => y.spanishShare.mean],
      ['Spoken', (y) => y.spokenShare.mean],
      ['Urban/R&B', (y) => y.urbanRnbShare.mean],
      ['CHR', (y) => y.chrShare.mean],
      ['HHI (median)', (y) => y.hhi.median],
      ['Top-3 (median)', (y) => y.top3Share.median],
      ['FM adoption (median)', (y) => y.fmAdoption.median],
      ['Stations (median)', (y) => y.stationCount.median],
    ]) {
      const hv = pick(h26);
      const dv = pick(d26);
      const delta = hv != null && dv != null ? hv - dv : null;
      const fmt = label.includes('HHI') || label.includes('Stations')
        ? (v) => (v == null ? '—' : label.includes('HHI') ? v.toFixed(0) : String(Math.round(v)))
        : pct;
      lines.push(`| ${label} | ${fmt(hv)} | ${fmt(dv)} | ${label.includes('HHI') || label.includes('Stations') ? (delta == null ? '—' : delta.toFixed(label.includes('HHI') ? 0 : 1)) : pct(delta)} |`);
    }
  }
  lines.push('');
  lines.push('## Mega-tier comparison @2026 (station count / fragmentation)');
  lines.push('');
  lines.push('| Market | Tier | Stns med | FM adopt med | HHI med | Top-3 med | Format diversity μ |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const mid of [FOCUS, ...MEGA_COMPARE]) {
    const y = artifact.openingEcology[mid]?.[2026];
    const meta = artifact.markets[mid];
    if (!y || !meta) continue;
    lines.push(`| ${mid} | ${meta.rankTier} | ${y.stationCount.median ?? '—'} | ${pct(y.fmAdoption.median)} | ${y.hhi.median?.toFixed(0) ?? '—'} | ${pct(y.top3Share.median)} | ${y.formatDiversity.mean?.toFixed(1) ?? '—'} |`);
  }
  lines.push('');
  lines.push('*Diagnostics only — no gameplay or billing changes.*');
  return lines.join('\n');
}

function main() {
  const opts = parseDiagArgs(process.argv.slice(2));
  const t0 = Date.now();
  console.log('Houston opening ecology\n');
  console.log(`Runs: ${opts.runs} · Seed: ${opts.seed}\n`);

  const { ctx, api } = loadDiagApi();
  const origR = Math.random;
  const markets = [...new Set([FOCUS, ...PEER_COMPARE, ...MEGA_COMPARE])];
  const openingEcology = {};
  for (const mid of markets) {
    process.stdout.write(`  ${mid}…`);
    openingEcology[mid] = runMonteCarloOpening(api, mid, OPENING_YEARS, opts.runs, opts.seed, origR);
    console.log(' done');
  }

  const artifact = {
    recordedAt: new Date().toISOString(),
    config: opts,
    marketMeta: readMarketMeta(ctx, FOCUS),
    markets: Object.fromEntries(markets.map((mid) => [mid, readMarketMeta(ctx, mid)])),
    openingEcology,
    timingMs: Date.now() - t0,
  };

  writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(outMd, `${renderMarkdown(artifact)}\n`);
  console.log(`\nWrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
