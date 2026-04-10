#!/usr/bin/env node
/**
 * Top 40 / CHR unified lineage diagnostic.
 * Mirrors formulas in src/legacy.js (search: FA_HITS_LATE, hitsLineageAxisBlendT, migrateHitsLineage).
 *
 *   node scripts/diag-top40-chr-evolution.mjs
 *   npm run diag:top40-chr
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LEGACY_PATH = join(ROOT, 'src', 'legacy.js');

// ── Mirror legacy.js (keep in sync) ─────────────────────────────────
function _clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function _smoothstep(a, b, x) {
  const t = _clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

const FA_TOP40 = {
  '12-17': 0.9,
  '18-24': 0.8,
  '25-34': 0.45,
  '35-49': 0.18,
  '50-64': 0.06,
  '65+': 0.03,
};
const FA_HITS_LATE = {
  '12-17': 0.88,
  '18-24': 0.82,
  '25-34': 0.5,
  '35-49': 0.2,
  '50-64': 0.07,
  '65+': 0.02,
};

const FM_TOP40 = { l: 'Top 40', cpm: 1.08, sp: 14, unlock: 1970 };
const STRAF_TOP40 = 0.91;

const FADJ_TOP40 = ['SOUL_RNB', 'ALBUM_ROCK', 'URBAN_CONTEMP', 'RHYTHMIC'];
const FMT_COMP_TOP40 = ['TOP40', 'SOUL_RNB', 'ALBUM_ROCK', 'RHYTHMIC', 'HOT_AC', 'URBAN_CONTEMP'];

function hitsLineageAxisBlendT(year) {
  return _smoothstep(1978, 1992, year || 1970);
}

function hitsFormatSurfaceLabel(year) {
  const t = hitsLineageAxisBlendT(year || 1970);
  if (t < 0.28) return 'Top 40';
  if (t < 0.72) return 'Hit Radio';
  if (t < 0.72) return 'Hit Radio';
  return 'CHR';
}

function fmtLabel(fmt, yearOpt) {
  if (!fmt) return '';
  if (fmt === 'TOP40' || fmt === 'CHR') {
    const y = yearOpt != null ? yearOpt : 1970;
    return hitsFormatSurfaceLabel(y);
  }
  return FM_TOP40.l || fmt;
}

function hitsDriftPolesForYear(year) {
  const y = year || 1970;
  if (y >= 1989) {
    return {
      poleA: { name: 'Pure Pop Hits', desc: 'Maximum mainstream appeal, 12–24 focus. Peak CHR ceiling.' },
      poleB: { name: 'Rhythmic Edge', desc: 'Hip-hop and R&B-influenced pop; holds better through trend shocks.' },
    };
  }
  if (y >= 1983) {
    return {
      poleA: { name: 'Pop Hits', desc: 'Mass-appeal chart pop and MTV-era hits; still fighting rock for 18–34 ears.' },
      poleB: { name: 'Rock / Rhythmic Edge', desc: 'Guitar-driven hits and album-rock credibility; R&B and crossover starting to thread in — rhythmic is emerging, not dominant.' },
    };
  }
  return {
    poleA: { name: 'Bubblegum Pop', desc: 'Pure hits, youngest demos; broad, personality-heavy Top 40.' },
    poleB: { name: 'Rock Edge', desc: 'Credibility with 18–34; holds better when rock surges.' },
  };
}

function hitsTop40DemoEffect(drift, coh, year) {
  const lean = _clamp01(drift / 100);
  const y = year || 1970;
  const early = {
    '12-17': (1 - lean) * 0.22 + lean * 0.02,
    '18-24': (1 - lean) * 0.1 + lean * 0.14,
    '25-34': (1 - lean) * 0.03 + lean * 0.1,
    '35-49': lean * 0.04,
  };
  const trans = {
    '12-17': (1 - lean) * 0.18 + lean * 0.05,
    '18-24': (1 - lean) * 0.08 + lean * 0.12,
    '25-34': (1 - lean) * 0.04 + lean * 0.1,
    '35-49': (1 - lean) * 0.02 + lean * 0.06,
  };
  const late = {
    '12-17': (1 - lean) * 0.18,
    '18-24': lean * 0.12,
    '25-34': lean * 0.1,
    '35-49': (1 - lean) * 0.04,
  };
  let bonus = 0;
  if (y < 1982) {
    bonus = early[coh] || 0;
  } else if (y < 1989) {
    const bt = _smoothstep(1982, 1984, y);
    bonus = (early[coh] || 0) * (1 - bt) + (trans[coh] || 0) * bt;
  } else {
    const t = hitsLineageAxisBlendT(y);
    bonus = (trans[coh] || 0) * (1 - t) + (late[coh] || 0) * t;
  }
  return Math.max(0.5, 1 + bonus);
}

function blendedBaseAffTop40(coh, year) {
  const t = hitsLineageAxisBlendT(year);
  return (FA_TOP40[coh] || 0.1) * (1 - t) + (FA_HITS_LATE[coh] || 0.1) * t;
}

function hitsLineageEraMult(year, sigType) {
  const t = hitsLineageAxisBlendT(year);
  const broadTight = 1 + 0.14 * _smoothstep(1972, 1982, year) * (1 - 0.55 * t);
  const fmYouth = sigType === 'FM' ? 1 + 0.07 * t * _smoothstep(1983, 1996, year) : 1;
  return broadTight * fmYouth;
}

function sliderPositionLabel(val, poles) {
  if (val < 20) return `${poles.poleA.name} (strong)`;
  if (val < 40) return poles.poleA.name;
  if (val < 60) return 'Neutral / Balanced';
  if (val < 80) return poles.poleB.name;
  return `${poles.poleB.name} (strong)`;
}

/** Copy of migrateHitsLineage(G) from legacy.js — must stay aligned. */
function migrateHitsLineage(G) {
  if (!G) return;
  (G.stations || []).forEach((s) => {
    if (!s || s._bpSlotDeferred) return;
    if (s.format === 'CHR') s.format = 'TOP40';
    if (s.drift) {
      if (s.drift.CHR !== undefined && s.drift.TOP40 === undefined) s.drift.TOP40 = s.drift.CHR;
      delete s.drift.CHR;
    }
    if (s.driftHistory && s.driftHistory.CHR) {
      if (!s.driftHistory.TOP40) s.driftHistory.TOP40 = s.driftHistory.CHR;
      delete s.driftHistory.CHR;
    }
  });
  if (Array.isArray(G.unlockedFormats)) G.unlockedFormats = G.unlockedFormats.filter((f) => f !== 'CHR');
  const mergeTalentFit = (ff) => {
    if (!ff || typeof ff !== 'object') return;
    if (ff.CHR != null && ff.TOP40 == null) ff.TOP40 = ff.CHR;
    delete ff.CHR;
  };
  (G.talentBench || []).forEach((ent) => mergeTalentFit(ent?.talent?.formatFit));
  (G.stations || []).forEach((s) => {
    if (!s?.prog) return;
    Object.values(s.prog).forEach((sd) => mergeTalentFit(sd?.talent?.formatFit));
  });
}

function section(title) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

function part1() {
  section('1. ERA PRESENTATION SNAPSHOTS');
  const years = [1970, 1980, 1985, 1990, 2000];
  for (const y of years) {
    const t = hitsLineageAxisBlendT(y);
    const poles = hitsDriftPolesForYear(y);
    console.log(`\n--- Year ${y} (axisBlendT=${t.toFixed(4)}) ---`);
    console.log(`  internal format ID:     TOP40`);
    console.log(`  displayed label:        ${hitsFormatSurfaceLabel(y)}`);
    console.log(`  slider LEFT (pole A):   ${poles.poleA.name}`);
    console.log(`    desc: ${poles.poleA.desc}`);
    console.log(`  slider RIGHT (pole B):  ${poles.poleB.name}`);
    console.log(`    desc: ${poles.poleB.desc}`);
    console.log(`  DRIFT modal label:      Format Positioning (from DRIFT.TOP40.label in game)`);
    console.log(`  demo base (12-17):      ${blendedBaseAffTop40('12-17', y).toFixed(3)} (lerp early↔late FA)`);
    console.log(`  demo base (18-24):      ${blendedBaseAffTop40('18-24', y).toFixed(3)}`);
    console.log(`  demo base (35-49):      ${blendedBaseAffTop40('35-49', y).toFixed(3)}`);
    console.log(`  FADJ[TOP40]:            ${FADJ_TOP40.join(', ')}`);
    console.log(`  FMT_COMPETITION[TOP40]: ${FMT_COMP_TOP40.join(', ')}`);
    console.log(`  FM.cpm / sp / unlock:   ${FM_TOP40.cpm} / ${FM_TOP40.sp} / ${FM_TOP40.unlock}`);
    console.log(`  STRAF[TOP40]:           ${STRAF_TOP40}`);
    console.log(`  hitsLineageEraMult AM:  ${hitsLineageEraMult(y, 'AM').toFixed(4)}`);
    console.log(`  hitsLineageEraMult FM:  ${hitsLineageEraMult(y, 'FM').toFixed(4)}`);
  }
}

function part2() {
  section('2. SLIDER SPOT CHECKS (driftMod = hitsTop40DemoEffect × cohort)');
  const years = [1970, 1980, 1985, 1990, 2000];
  const sliders = [0, 25, 50, 75, 100];
  const cohorts = ['12-17', '18-24', '25-34', '35-49'];
  for (const y of years) {
    const poles = hitsDriftPolesForYear(y);
    console.log(`\n--- Year ${y} | poles: ${poles.poleA.name} ↔ ${poles.poleB.name} ---`);
    for (const v of sliders) {
      const pos = sliderPositionLabel(v, poles);
      const parts = cohorts.map((c) => `${c}:${hitsTop40DemoEffect(v, c, y).toFixed(3)}`);
      console.log(`  slider ${String(v).padStart(3)} → ${pos}`);
      console.log(`    driftMod: ${parts.join('  ')}`);
    }
  }
  console.log('\n  Note: 0 = toward pole A (left); 100 = toward pole B (right). Early era: A=bubblegum, B=rock. Late: A=pop, B=rhythmic.');
}

function part3() {
  section('3. SAVE / MIGRATION CHECKS');
  const mkStation = (id, format, driftVal) => ({
    id,
    format,
    drift: driftVal != null ? { [format === 'CHR' ? 'CHR' : 'TOP40']: driftVal } : {},
    driftHistory: format === 'CHR' ? { CHR: { commitYear: 1985 } } : { TOP40: { commitYear: 1975 } },
    prog: {
      morningDrive: { talent: { formatFit: { TOP40: 0.8, CHR: 0.9 } } },
    },
  });

  const cases = [
    {
      name: 'Old TOP40 only',
      G: {
        year: 1990,
        stations: [mkStation('a', 'TOP40', 55)],
        unlockedFormats: ['TOP40', 'COUNTRY'],
        talentBench: [],
      },
    },
    {
      name: 'Old CHR only',
      G: {
        year: 1990,
        stations: [mkStation('b', 'CHR', 60)],
        unlockedFormats: ['TOP40', 'CHR'],
        talentBench: [],
      },
    },
    {
      name: 'Mixed TOP40 + CHR + unlocked CHR',
      G: {
        year: 2000,
        stations: [mkStation('c', 'TOP40', 40), mkStation('d', 'CHR', 70)],
        unlockedFormats: ['CHR', 'TOP40', 'RHYTHMIC'],
        talentBench: [{ talent: { formatFit: { CHR: 0.5 } } }],
      },
    },
  ];

  for (const { name, G } of cases) {
    migrateHitsLineage(G);
    console.log(`\nCase: ${name}`);
    console.log(`  after migration:`);
    for (const s of G.stations || []) {
      const driftKey = s.drift && Object.keys(s.drift).join(',');
      const label = fmtLabel(s.format, G.year);
      console.log(`    ${s.id}: format=${s.format}  fmtLabel(@${G.year})=${label}  drift keys/vals=${JSON.stringify(s.drift || {})}`);
      console.log(`      driftHistory keys: ${Object.keys(s.driftHistory || {}).join(',') || '(none)'}`);
    }
    console.log(`  unlockedFormats: ${JSON.stringify(G.unlockedFormats)}`);
    const bench = G.talentBench?.[0]?.talent?.formatFit;
    if (bench) console.log(`  bench formatFit: ${JSON.stringify(bench)}`);
    const morningFit = G.stations[0]?.prog?.morningDrive?.talent?.formatFit;
    if (morningFit) console.log(`  first station morning formatFit: ${JSON.stringify(morningFit)}`);
    // CHR key must not survive on format or drift
    const bad =
      G.stations.some((s) => s.format === 'CHR' || s.drift?.CHR != null) ||
      G.unlockedFormats.includes('CHR');
    console.log(`  migration OK (no CHR format/drift/unlock): ${!bad ? 'YES' : 'NO'}`);
    if (bad) console.log('  *** FAILURE: legacy CHR leaked ***');
  }
}

function part4() {
  section('4. CROSS-ERA STATION EXAMPLES (synthetic TOP40)');
  const grid = [
    [1970, [20, 50, 80]],
    [1985, [20, 50, 80]],
    [1995, [20, 50, 80]],
    [2000, [20, 50, 80]],
  ];
  for (const [y, vals] of grid) {
    const poles = hitsDriftPolesForYear(y);
    console.log(`\nYear ${y} — display: "${hitsFormatSurfaceLabel(y)}" — ${poles.poleA.name} ↔ ${poles.poleB.name}`);
    for (const v of vals) {
      const mean =
        (hitsTop40DemoEffect(v, '12-17', y) +
          hitsTop40DemoEffect(v, '18-24', y) +
          hitsTop40DemoEffect(v, '25-34', y)) /
        3;
      const tilt =
        v < 40 ? 'skew pole A / younger-mass' : v > 60 ? 'skew pole B / edge lane' : 'balanced';
      console.log(`  slider ${v}: ${sliderPositionLabel(v, poles)}`);
      console.log(`    style hint: ${tilt} | mean driftMod(12-17..25-34): ${mean.toFixed(3)}`);
    }
  }
}

function part5() {
  section('5. CODE CONSISTENCY SCAN (src/legacy.js heuristics)');
  let src;
  try {
    src = readFileSync(LEGACY_PATH, 'utf8');
  } catch (e) {
    console.log('Could not read', LEGACY_PATH);
    return;
  }
  const lines = src.split('\n');

  const findings = {
    risky: [],
    flavor: [],
    structural: [],
  };

  const reChrKey = /\bCHR\s*:/;
  const reFmChr = /FM\s*\.\s*CHR|FM\[['"]CHR['"]\]/;
  const reDriftChr = /DRIFT\s*\.\s*CHR|DRIFT\[['"]CHR['"]\]/;

  lines.forEach((line, i) => {
    if (reFmChr.test(line) || reDriftChr.test(line)) findings.risky.push({ line: i + 1, text: line.trim().slice(0, 120) });
    if (reChrKey.test(line) && !line.includes('fmt===') && !line.includes("format==='CHR'") && !line.includes('canonical') && !line.includes('isHits'))
      if (/^\s*CHR\s*:\s*\{/.test(line)) findings.risky.push({ line: i + 1, text: line.trim().slice(0, 120) });
    if (/Contemporary Hit|unlock-CHR|rival-CHR/i.test(line) && !line.includes('//')) findings.flavor.push({ line: i + 1, text: line.trim().slice(0, 100) });
  });

  // Expected safe patterns
  const hasMigrate = src.includes('function migrateHitsLineage');
  const hasHitsLabel = src.includes('function hitsFormatSurfaceLabel');
  const hasFmtLabel = src.includes('function fmtLabel');
  findings.structural.push({ line: 0, text: `migrateHitsLineage: ${hasMigrate ? 'present' : 'MISSING'}` });
  findings.structural.push({ line: 0, text: `hitsFormatSurfaceLabel: ${hasHitsLabel ? 'present' : 'MISSING'}` });
  findings.structural.push({ line: 0, text: `fmtLabel: ${hasFmtLabel ? 'present' : 'MISSING'}` });

  const chrCount = (src.match(/\bCHR\b/g) || []).length;
  findings.structural.push({ line: 0, text: `approximate CHR token occurrences in legacy.js: ${chrCount} (many are comments, strings, migrate, or Rhythmic CHR)` });

  console.log('\nStructural:');
  findings.structural.forEach((f) => console.log(`  ${f.text}`));

  console.log('\nPotentially inconsistent (manual review):');
  if (findings.risky.length === 0) console.log('  (none matched FM.CHR / DRIFT.CHR / bare CHR: object key patterns)');
  else findings.risky.slice(0, 25).forEach((f) => console.log(`  L${f.line}: ${f.text}`));
  if (findings.risky.length > 25) console.log(`  ... +${findings.risky.length - 25} more`);

  console.log('\nFlavor / narrative CHR mentions (sample, may be OK):');
  findings.flavor.slice(0, 15).forEach((f) => console.log(`  L${f.line}: ${f.text}`));
  if (findings.flavor.length > 15) console.log(`  ... +${findings.flavor.length - 15} more`);

  const uiFiles = ['play.html', 'airwave-empire-ui.html', 'index.html'];
  console.log('\nUI / entry HTML (lines with Top 40, CHR, or drift pole strings):');
  for (const rel of uiFiles) {
    const p = join(ROOT, rel);
    let text;
    try {
      text = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    const L = text.split('\n');
    const hits = [];
    const reUi = /\b(Top\s*40|CHR|Bubblegum|Rhythmic\s+Edge|Rock\s+Edge|Pure\s+Pop|Hit\s+Radio)\b/i;
    L.forEach((line, i) => {
      if (reUi.test(line)) hits.push({ line: i + 1, text: line.trim().slice(0, 100) });
    });
    if (hits.length) {
      console.log(`  ${rel}: ${hits.length} line(s)`);
      hits.slice(0, 8).forEach((h) => console.log(`    L${h.line}: ${h.text}`));
      if (hits.length > 8) console.log(`    ... +${hits.length - 8} more`);
    } else console.log(`  ${rel}: (no direct pole/label strings — likely bundled from legacy.js)`);
  }
  console.log(
    '\nNote: play.html loads /src/legacy.js (canonical). airwave-empire-ui.html is a redirect stub (monolith removed).'
  );
}

function summary() {
  section('C. SUMMARY (diagnostic answers)');
  const y1970 = hitsFormatSurfaceLabel(1970);
  const y2000 = hitsFormatSurfaceLabel(2000);
  const p1970 = hitsDriftPolesForYear(1970);
  const p2000 = hitsDriftPolesForYear(2000);
  console.log(`
Era labels: 1970="${y1970}" 2000="${y2000}" → ${y1970 === 'Top 40' && y2000 === 'CHR' ? 'PASS (1970 not CHR, 2000 is CHR)' : 'REVIEW'}

Slider poles: 1970 ${p1970.poleB.name} vs 2000 ${p2000.poleB.name} → ${
    p1970.poleB.name.includes('Rock') && p2000.poleB.name.includes('Rhythmic')
      ? 'PASS (rock early → rhythmic late)'
      : 'REVIEW'
  }

Migration: synthetic saves map CHR→TOP40, drift CHR→TOP40, unlock strip — see section 3.

Repo scan: section 5 lists structural checks and any risky CHR object references.

For full UI parity, run the game and open Format Positioning on a TOP40 station in 1970 vs 2000.
`.trim());
}

function main() {
  console.log('Airwave Empire — diag-top40-chr-evolution.mjs');
  console.log('Formulas mirrored from src/legacy.js — re-run after changing hits* / migrateHitsLineage.');
  part1();
  part2();
  part3();
  part4();
  part5();
  summary();
}

main();
