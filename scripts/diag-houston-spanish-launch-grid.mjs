#!/usr/bin/env node
/**
 * Quick grid for Houston spanishLaunches variants (read-only).
 *   node scripts/diag-houston-spanish-launch-grid.mjs --runs=20
 */
/* eslint-disable no-console */

import {
  FOCUS,
  loadDiagApi,
  parseDiagArgs,
  runPassiveArcs,
  pct,
} from './houstonScaffoldDiagHarness.mjs';

const VARIANTS = {
  A_dallas_like: [
    { id: 'houston_spanish_1988_fm', y: 1988, p: 2, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
    { id: 'houston_spanish_1994_fm', y: 1994, p: 1, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
  ],
  B_three_stronger: [
    { id: 'houston_spanish_1988_fm', y: 1988, p: 2, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
    { id: 'houston_spanish_1994_fm', y: 1994, p: 1, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'strong' } },
    { id: 'houston_spanish_2002_fm', y: 2002, p: 2, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
  ],
  C_early_two: [
    { id: 'houston_spanish_1985_fm', y: 1985, p: 2, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
    { id: 'houston_spanish_1994_fm', y: 1994, p: 1, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
  ],
  D_three_soft: [
    { id: 'houston_spanish_1988_fm', y: 1988, p: 2, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
    { id: 'houston_spanish_1994_fm', y: 1994, p: 1, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
    { id: 'houston_spanish_2002_fm', y: 2002, p: 2, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
  ],
  E_two_one_strong: [
    { id: 'houston_spanish_1988_fm', y: 1988, p: 2, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
    { id: 'houston_spanish_1994_fm', y: 1994, p: 1, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'strong' } },
  ],
  F_three_2002_strong: [
    { id: 'houston_spanish_1988_fm', y: 1988, p: 2, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
    { id: 'houston_spanish_1994_fm', y: 1994, p: 1, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'moderate' } },
    { id: 'houston_spanish_2002_fm', y: 2002, p: 2, bp: { type: 'FM', fmt: 'SPANISH', pw: '50kw', str: 'strong' } },
  ],
};

function row(id, arc, dallasArc) {
  const id26 = arc?.identityByDecade?.[2026] || {};
  const d26 = dallasArc?.identityByDecade?.[2026] || {};
  const t = arc?.terminal || {};
  return {
    id,
    span2000: arc?.identityByDecade?.[2000]?.spanishShare?.mean,
    span2026: id26.spanishShare?.mean,
    country2026: id26.countryShare?.mean,
    dallasSpan2026: d26.spanishShare?.mean,
    dallasCountry2026: d26.countryShare?.mean,
    spoken2026: id26.spokenShare?.mean,
    urban2026: id26.urbanRnbShare?.mean,
    dallasUrban2026: d26.urbanRnbShare?.mean,
    hhi: t.hhi?.median,
    stns: t.stationCount?.median,
    spirals: t.spiralCount?.median,
    failRate: arc?.failRate,
  };
}

function main() {
  const opts = parseDiagArgs(process.argv.slice(2));
  const origR = Math.random;
  const { ctx, api } = loadDiagApi();
  console.log(`Houston spanishLaunches grid · runs=${opts.runs}\n`);
  console.log('variant | span@2000 | span@2026 | country@2026 | dallas span | spoken | urban | dallas urb | HHI | stns');
  console.log('---|---|---|---|---|---|---|---|---|---');

  let dallasArc = null;
  for (const [id, launches] of Object.entries(VARIANTS)) {
    ctx.MARKETS.houston.spanishLaunches = launches.map((e) => ({ ...e, bp: { ...e.bp } }));
    const houston = runPassiveArcs(api, FOCUS, opts.runs, opts.seed, origR);
    const dallas = runPassiveArcs(api, 'dallas', opts.runs, opts.seed + 999, origR);
    dallasArc = dallas['1970_to_2026'];
    const r = row(id, houston['1970_to_2026'], dallasArc);
    console.log(
      `${id} | ${pct(r.span2000)} | ${pct(r.span2026)} | ${pct(r.country2026)} | ${pct(r.dallasSpan2026)} | ${pct(r.spoken2026)} | ${pct(r.urban2026)} | ${pct(r.dallasUrban2026)} | ${r.hhi?.toFixed(0) ?? '—'} | ${r.stns ?? '—'}`,
    );
  }
}

main();
