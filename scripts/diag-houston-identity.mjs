#!/usr/bin/env node
/**
 * Houston identity audit — passive long-run arc + scaffold recommendation (read-only).
 *
 *   node scripts/diag-houston-identity.mjs
 *   node scripts/diag-houston-identity.mjs --runs=40
 *
 * Artifacts: tmp/houston_identity_audit.{json,md}
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

import {
  FOCUS,
  PEER_COMPARE,
  MEGA_COMPARE,
  IDENTITY_DECADES,
  loadDiagApi,
  parseDiagArgs,
  readMarketMeta,
  runPassiveArcs,
  pct,
  root,
} from './houstonScaffoldDiagHarness.mjs';

const outJson = path.join(root, 'tmp', 'houston_identity_audit.json');
const outMd = path.join(root, 'tmp', 'houston_identity_audit.md');
const openingJson = path.join(root, 'tmp', 'houston_opening_ecology.json');

function deriveRecommendation(artifact) {
  const arc = artifact.passiveArcs.houston?.['1970_to_2026'];
  const id26 = arc?.identityByDecade?.[2026] || {};
  const dallas = artifact.passiveArcs.dallas?.['1970_to_2026']?.identityByDecade?.[2026] || {};
  const opening = artifact.openingEcology?.houston?.[2026] || {};
  const openingDallas = artifact.openingEcology?.dallas?.[2026] || {};
  const megaChicago = artifact.openingEcology?.chicago?.[2026] || {};

  const h = {
    country: id26.countryShare?.mean ?? null,
    spanish: id26.spanishShare?.mean ?? null,
    spoken: id26.spokenShare?.mean ?? null,
    urban: id26.urbanRnbShare?.mean ?? null,
    chr: id26.chrShare?.mean ?? null,
  };
  const d = {
    country: dallas.countryShare?.mean ?? null,
    spanish: dallas.spanishShare?.mean ?? null,
    spoken: dallas.spokenShare?.mean ?? null,
    urban: dallas.urbanRnbShare?.mean ?? null,
    chr: dallas.chrShare?.mean ?? null,
  };

  const hisp2020 = artifact.marketMeta.hispPop2020 ?? 0.38;
  const spanishWeak = h.spanish != null && h.spanish < 0.08 && hisp2020 >= 0.25;
  const spanishVeryWeak = h.spanish != null && h.spanish < 0.05;
  const spanishBelowDallas = h.spanish != null && d.spanish != null && h.spanish < d.spanish - 0.02;
  const countryAboveDallas = h.country != null && d.country != null && h.country > d.country + 0.02;
  const urbanBelowDallas = h.urban != null && d.urban != null && h.urban <= d.urban;
  const spokenThin = h.spoken != null && h.spoken < 0.07;
  const archetypeCountryProblem = countryAboveDallas && (artifact.marketMeta.countryBonus ?? 0.08) < 0.11;
  const megaGap = opening.stationCount?.median != null && megaChicago.stationCount?.median != null
    && megaChicago.stationCount.median - opening.stationCount.median >= 10;

  const q1_distinct = !countryAboveDallas && (h.spanish ?? 0) >= (d.spanish ?? 0) - 0.03;
  const q2_spanishStronger = !spanishBelowDallas && !spanishVeryWeak;
  const q3_archetypeWeak = countryAboveDallas || urbanBelowDallas;
  const q4_texasShape = !countryAboveDallas && (h.spanish ?? 0) > (d.spanish ?? 0) - 0.01
    && (h.urban ?? 0) > (d.urban ?? 0) && !spokenThin;
  const q5_mega = megaGap && opening.stationCount?.median != null && opening.stationCount.median <= 32;

  const answers = {
    q1_distinctIdentity: q1_distinct,
    q2_spanishStrongerThanDallas: q2_spanishStronger,
    q2_spanishWeakWithoutLaunches: spanishWeak || spanishVeryWeak,
    q2_spanishBelowDallas: spanishBelowDallas,
    q3_texasSunbeltWeakness: q3_archetypeWeak,
    q3_archetypeCountryBoostSuspect: archetypeCountryProblem,
    q4_texasMarketShape: q4_texasShape,
    q5_megaTierGap: q5_mega,
    passiveStable: (arc?.failRate ?? 1) <= 0.05,
  };

  let recommendation = 'A';
  let recommendationLabel = 'Houston works under texas_sunbelt';
  const notes = [];

  if (spanishVeryWeak || spanishBelowDallas) {
    recommendation = 'D';
    recommendationLabel = 'Houston requires Spanish-launch support';
    notes.push('Passive/opening Spanish share trails Dallas or high-Hispanic floor despite stronger Hispanic meta.');
  } else if (q3_archetypeWeak && countryAboveDallas) {
    recommendation = 'B';
    recommendationLabel = 'Houston needs texas_sunbelt extension';
    notes.push('texas_sunbelt country/spoken uplift may be overriding Houston-specific metadata (country still ≥ Dallas).');
  } else if (urbanBelowDallas && !spanishWeak) {
    recommendation = 'B';
    recommendationLabel = 'Houston needs texas_sunbelt extension';
    notes.push('Urban/R&B footprint does not exceed Dallas — consider archetype extension for Gulf Coast urban lean.');
  } else if (q5_mega && !q4_texasShape) {
    recommendation = 'E';
    recommendationLabel = 'Houston requires mega-market treatment';
    notes.push('Station-count and fragmentation profile materially below Chicago/NY/LA mega anchors.');
  } else if (!q1_distinct && !q4_texasShape) {
    recommendation = 'C';
    recommendationLabel = 'Houston needs a new archetype';
    notes.push('Identity collapses toward Dallas/Atlanta shape under current archetype + metadata.');
  } else if (spanishWeak) {
    recommendation = 'D';
    recommendationLabel = 'Houston requires Spanish-launch support';
    notes.push('Spanish book below 8% with Hispanic meta ≥25% — launch scheduling likely required in follow-up.');
  }

  return {
    recommendation,
    recommendationLabel,
    notes,
    answers,
    metrics2026: h,
    dallas2026: d,
    opening2026: {
      houstonStations: opening.stationCount?.median ?? null,
      dallasStations: openingDallas.stationCount?.median ?? null,
      chicagoStations: megaChicago.stationCount?.median ?? null,
    },
  };
}

function renderMarkdown(artifact) {
  const { summary } = artifact;
  const lines = [];
  lines.push('# Houston Identity Audit');
  lines.push('');
  lines.push(`Recorded: ${artifact.recordedAt}`);
  lines.push(`Runs: ${artifact.config.runs} · Seed: ${artifact.config.seed}`);
  lines.push(`Focus: **${artifact.marketMeta.label}** (\`${artifact.marketMeta.archetypeId}\`, ${artifact.marketMeta.rankTier})`);
  lines.push('');
  lines.push(`## Recommendation: **${summary.recommendation}. ${summary.recommendationLabel}**`);
  lines.push('');
  if (summary.notes.length) {
    lines.push('**Rationale:**');
    for (const n of summary.notes) lines.push(`- ${n}`);
    lines.push('');
  }

  lines.push('## Question checklist');
  lines.push('');
  lines.push('| # | Question | Answer |');
  lines.push('| --- | --- | --- |');
  lines.push(`| 1 | Distinct identity vs Dallas/Atlanta/Phoenix/Chicago? | ${summary.answers.q1_distinctIdentity ? 'Yes — country not dominating vs Dallas; Spanish competitive.' : 'Partial — review peer table.'} |`);
  lines.push(`| 2 | Stronger Spanish than Dallas without launches? | ${summary.answers.q2_spanishStrongerThanDallas ? 'Yes / comparable' : 'No — gap vs Dallas'} |`);
  lines.push(`| 3 | texas_sunbelt weaknesses exposed? | ${summary.answers.q3_texasSunbeltWeakness ? 'Yes — country/urban shape issues' : 'No major archetype failure in Phase 1'} |`);
  lines.push(`| 4 | Texas market shape (less country, more Spanish/urban, talk present)? | ${summary.answers.q4_texasMarketShape ? 'Yes' : 'No — metadata/archetype mismatch'} |`);
  lines.push(`| 5 | Mega-tier treatment justified? | ${summary.answers.q5_megaTierGap ? 'Possibly — large gap vs mega station counts' : 'No — large-tier anchors adequate'} |`);
  lines.push('');

  lines.push('## Identity by decade — passive 1970→2026 (Houston vs peers, mean share)');
  lines.push('');
  lines.push('| Year | Market | Country | Spanish | Spoken | Urban/R&B | CHR |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const year of IDENTITY_DECADES) {
    for (const mid of [FOCUS, ...PEER_COMPARE]) {
      const id = artifact.passiveArcs[mid]?.['1970_to_2026']?.identityByDecade?.[year];
      if (!id) continue;
      lines.push(`| ${year} | ${mid} | ${pct(id.countryShare?.mean)} | ${pct(id.spanishShare?.mean)} | ${pct(id.spokenShare?.mean)} | ${pct(id.urbanRnbShare?.mean)} | ${pct(id.chrShare?.mean)} |`);
    }
  }
  lines.push('');

  lines.push('## Houston vs Dallas @2026 (passive arc)');
  lines.push('');
  lines.push('| Metric | Houston | Dallas |');
  lines.push('| --- | ---: | ---: |');
  lines.push(`| Country | ${pct(summary.metrics2026.country)} | ${pct(summary.dallas2026.country)} |`);
  lines.push(`| Spanish | ${pct(summary.metrics2026.spanish)} | ${pct(summary.dallas2026.spanish)} |`);
  lines.push(`| Spoken | ${pct(summary.metrics2026.spoken)} | ${pct(summary.dallas2026.spoken)} |`);
  lines.push(`| Urban/R&B | ${pct(summary.metrics2026.urban)} | ${pct(summary.dallas2026.urban)} |`);
  lines.push(`| CHR | ${pct(summary.metrics2026.chr)} | ${pct(summary.dallas2026.chr)} |`);
  lines.push('');

  lines.push('## Stability @2026 (passive arc terminal)');
  lines.push('');
  const t = artifact.passiveArcs.houston?.['1970_to_2026']?.terminal;
  if (t) {
    lines.push(`| HHI med | ${t.hhi.median?.toFixed(0) ?? '—'} |`);
    lines.push(`| Top-3 med | ${pct(t.top3Share.median)} |`);
    lines.push(`| FM adoption med | ${pct(t.fmAdoption.median)} |`);
    lines.push(`| Stations med | ${t.stationCount.median ?? '—'} |`);
    lines.push(`| Fail rate | ${((artifact.passiveArcs.houston['1970_to_2026'].failRate || 0) * 100).toFixed(1)}% |`);
    lines.push(`| Solo bankrupt rate | ${pct(t.soloBankruptRate)} |`);
  }
  lines.push('');
  lines.push('*Phase 1 scaffold only — no playable promotion, billing, or Spanish launches.*');
  return lines.join('\n');
}

function main() {
  const opts = parseDiagArgs(process.argv.slice(2));
  const t0 = Date.now();
  console.log('Houston identity audit\n');
  console.log(`Runs: ${opts.runs} · Seed: ${opts.seed}\n`);

  const { ctx, api } = loadDiagApi();
  const origR = Math.random;
  const passiveMarkets = [FOCUS, ...PEER_COMPARE];
  const passiveArcs = {};
  for (const mid of passiveMarkets) {
    process.stdout.write(`  passive ${mid}…`);
    passiveArcs[mid] = runPassiveArcs(api, mid, opts.runs, opts.seed, origR);
    console.log(' done');
  }

  let openingEcology = null;
  if (existsSync(openingJson)) {
    openingEcology = JSON.parse(readFileSync(openingJson, 'utf8')).openingEcology;
  }

  const artifact = {
    recordedAt: new Date().toISOString(),
    config: opts,
    marketMeta: readMarketMeta(ctx, FOCUS),
    passiveArcs,
    openingEcology,
    timingMs: Date.now() - t0,
  };
  artifact.summary = deriveRecommendation(artifact);

  writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(outMd, `${renderMarkdown(artifact)}\n`);
  console.log(`\nRecommendation: ${artifact.summary.recommendation}. ${artifact.summary.recommendationLabel}`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log(`Wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
