#!/usr/bin/env node
/**
 * Observable checks for AM/FM non-duplication (mirrors src/legacy.js logic).
 * Run: node scripts/fm-nondup-validation.mjs
 */

const MARKET_TIERS = {
  newyork: 1,
  chicago: 1,
  losangeles: 1,
  atlanta: 2,
  nashville: 3,
};

function getMaxSimulcastPct(year, fccTier) {
  const y = year || 1970;
  const t = fccTier < 2 ? 1 : fccTier > 2 ? 3 : Math.round(fccTier);
  if (y >= 1996) return 100;
  if (y >= 1986) {
    if (t === 1) return 80;
    return 100;
  }
  if (y >= 1979) {
    if (t === 1) return 60;
    if (t === 2) return 75;
    return 100;
  }
  if (t === 1) return 50;
  if (t === 2) return 60;
  return 80;
}

function aiDupRoll(tier, maxPct) {
  const rt = tier;
  const lo = rt === 1 ? Math.round(maxPct * 0.55) : rt === 2 ? Math.round(maxPct * 0.65) : Math.round(maxPct * 0.75);
  return Math.max(0, Math.min(maxPct, Math.round(lo + Math.random() * (maxPct - lo))));
}

/** FM keys 1970-unlocked, non-public — matches legacy FM{} unlock<=1970 */
const FM_1970 = new Set([
  'TOP40',
  'COUNTRY',
  'SOUL_RNB',
  'MOR',
  'NEWS_TALK',
  'ALBUM_ROCK',
  'BEAUTIFUL_MUSIC',
  'GOSPEL',
  'ALL_NEWS',
]);

/** Mirror src/legacy.js FM_REMAINDER_CANDIDATES_BY_AM + defaultFmRemainderFormat (1970 pool). */
const FM_REMAINDER_CANDIDATES_BY_AM = {
  TOP40: ['ALBUM_ROCK', 'BEAUTIFUL_MUSIC', 'SOUL_RNB', 'COUNTRY', 'MOR', 'GOSPEL'],
  MOR: ['ALBUM_ROCK', 'BEAUTIFUL_MUSIC', 'COUNTRY', 'TOP40', 'SOUL_RNB', 'GOSPEL'],
  COUNTRY: ['ALBUM_ROCK', 'TOP40', 'MOR', 'BEAUTIFUL_MUSIC', 'SOUL_RNB', 'GOSPEL'],
  SOUL_RNB: ['ALBUM_ROCK', 'TOP40', 'MOR', 'COUNTRY', 'BEAUTIFUL_MUSIC', 'GOSPEL'],
  NEWS_TALK: ['ALBUM_ROCK', 'MOR', 'BEAUTIFUL_MUSIC', 'TOP40', 'COUNTRY', 'SOUL_RNB'],
  ALL_NEWS: ['ALBUM_ROCK', 'MOR', 'BEAUTIFUL_MUSIC', 'TOP40', 'COUNTRY', 'SOUL_RNB'],
  SPORTS_TALK: ['ALBUM_ROCK', 'TOP40', 'MOR', 'COUNTRY', 'BEAUTIFUL_MUSIC', 'SOUL_RNB'],
  GOSPEL: ['SOUL_RNB', 'COUNTRY', 'MOR', 'ALBUM_ROCK', 'TOP40', 'BEAUTIFUL_MUSIC'],
  ADULT_STANDARDS: ['ALBUM_ROCK', 'BEAUTIFUL_MUSIC', 'MOR', 'COUNTRY', 'TOP40', 'SOUL_RNB'],
  BEAUTIFUL_MUSIC: ['ALBUM_ROCK', 'MOR', 'TOP40', 'COUNTRY', 'SOUL_RNB', 'GOSPEL'],
};
const FM_REMAINDER_DEFAULT_FALLBACK = ['ALBUM_ROCK', 'BEAUTIFUL_MUSIC', 'SOUL_RNB', 'COUNTRY', 'MOR', 'TOP40', 'GOSPEL'];

function fmRemainderStableHash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

function defaultFmRemainderFormatNew(amFmt, mkt, fmStationId) {
  const pool = [...FM_1970].filter((f) => f !== amFmt);
  if (!pool.length) return 'ALBUM_ROCK';
  const preferred = FM_REMAINDER_CANDIDATES_BY_AM[amFmt] || FM_REMAINDER_DEFAULT_FALLBACK;
  let ordered = preferred.filter((f) => pool.includes(f));
  if (!ordered.length) ordered = [...pool].sort((a, b) => a.localeCompare(b));
  const seed = `${fmStationId || 'na'}|${mkt}|${amFmt || ''}`;
  const idx = fmRemainderStableHash(seed) % ordered.length;
  return ordered[idx];
}

/** Old logic: first hit in global PREFER list (clustered on ALBUM_ROCK). */
const PREFER_OLD = ['ALBUM_ROCK', 'ADULT_CONTEMP', 'CLASSIC_ROCK', 'OLDIES', 'SOUL_RNB', 'COUNTRY', 'MOR'];
function defaultFmRemainderFormatOld1970(amFmt) {
  const pool = [...FM_1970].filter((f) => f !== amFmt);
  for (const p of PREFER_OLD) {
    if (pool.includes(p)) return p;
  }
  return pool[0] || 'ALBUM_ROCK';
}

function pickAlternateAiRemainder1970(amFmt) {
  const pool = [...FM_1970].filter((f) => f !== amFmt);
  if (!pool.length) return defaultFmRemainderFormatNew(amFmt, 'atlanta', '');
  return pool[Math.floor(Math.random() * pool.length)];
}

function sampleAiRemainderHistogram(amFmt, n = 8000) {
  const counts = {};
  for (let i = 0; i < n; i++) {
    const f = pickAlternateAiRemainder1970(amFmt);
    counts[f] = (counts[f] || 0) + 1;
  }
  return counts;
}

function main() {
  const years = [1970, 1979, 1986, 1990, 1995, 1996, 2000];
  const markets = [
    ['newyork', 1],
    ['chicago', 1],
    ['atlanta', 2],
    ['nashville', 3],
  ];

  console.log('=== Max AM duplication % on FM (by year × FCC tier) ===\n');
  console.log('Year\tT1(mega)\tT2(large)\tT3(medium)');
  for (const y of years) {
    console.log(
      `${y}\t${getMaxSimulcastPct(y, 1)}%\t\t${getMaxSimulcastPct(y, 2)}%\t\t${getMaxSimulcastPct(y, 3)}%`,
    );
  }

  console.log('\n=== AI first-roll duplication % (10k samples per cell, uniform in [lo,max]) ===\n');
  for (const m of markets) {
    const [id, tier] = m;
    console.log(`Market ${id} (tier ${tier})`);
    for (const y of [1970, 1979, 1986, 1990, 1995]) {
      const maxP = getMaxSimulcastPct(y, tier);
      if (maxP >= 100) {
        console.log(`  ${y}: cap 100% — AI non-dup block skipped (full simulcast)`);
        continue;
      }
      let sum = 0;
      let min = 999;
      let max = 0;
      const hist = {};
      for (let i = 0; i < 10000; i++) {
        const d = aiDupRoll(tier, maxP);
        sum += d;
        min = Math.min(min, d);
        max = Math.max(max, d);
        hist[d] = (hist[d] || 0) + 1;
      }
      const mean = sum / 10000;
      const lo = tier === 1 ? Math.round(maxP * 0.55) : tier === 2 ? Math.round(maxP * 0.65) : Math.round(maxP * 0.75);
      console.log(`  ${y}: max=${maxP}%  AI range [${lo},${maxP}]  observed [${min},${max}]  mean=${mean.toFixed(2)}%`);
    }
    console.log('');
  }

  console.log('=== Patch 1 — default remainder diversity (1970 pool, 12 synthetic FM ids per cell) ===\n');
  const mkts = ['newyork', 'atlanta', 'nashville'];
  const ams = ['MOR', 'TOP40', 'COUNTRY', 'NEWS_TALK'];
  for (const mkt of mkts) {
    console.log(`Market ${mkt}:`);
    for (const am of ams) {
      const counts = {};
      for (let i = 0; i < 12; i++) {
        const id = `synth-fm-${mkt}-${i}`;
        const f = defaultFmRemainderFormatNew(am, mkt, id);
        counts[f] = (counts[f] || 0) + 1;
      }
      const oldF = defaultFmRemainderFormatOld1970(am);
      const dist = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}×${v}`)
        .join(', ');
      console.log(`  AM ${am}: OLD always ${oldF} · NEW [${dist}]`);
    }
    console.log('');
  }

  console.log('\n=== AI pickAlternateAiRemainder distribution (1970 pool, 8k rolls) ===\n');
  for (const am of ['MOR', 'NEWS_TALK']) {
    const h = sampleAiRemainderHistogram(am, 8000);
    const top = Object.entries(h)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `${k}:${((100 * v) / 8000).toFixed(1)}%`)
      .join('  ');
    console.log(`  AM ${am} → ${top}`);
  }

  console.log('\n=== Post-1996 blend shortcut ===');
  console.log('  fmAmNonDupBlendForRecalc returns null when maxPct>=100 → FM appeal uses s.format only; remainder not blended.');
  console.log('  enforceFmNonDupConstraints sets fmRemainderFormat to AM format when max>=100 (cosmetic if blend off).');

  console.log('\n=== Patch 2 — AI duplication drift (mean dup % after each cap era, 5000 Monte Carlo paths) ===\n');
  function aiTierLo(tier, maxPct) {
    return tier === 1 ? Math.round(maxPct * 0.55) : tier === 2 ? Math.round(maxPct * 0.65) : Math.round(maxPct * 0.75);
  }
  function enforceStep(dup, seen, maxPct, tier) {
    dup = Math.max(0, Math.min(maxPct, dup));
    if (maxPct >= 100) return { dup: Math.min(100, dup), seen: 100 };
    const lo = aiTierLo(tier, maxPct);
    let nextSeen = seen;
    if (seen == null || seen === undefined) {
      dup = Math.max(0, Math.min(maxPct, Math.round(lo + Math.random() * (maxPct - lo))));
      nextSeen = maxPct;
    } else if (maxPct > seen) {
      const headroom = maxPct - dup;
      if (headroom > 0.5) {
        const take = Math.random() < 0.72 ? 0.17 + Math.random() * 0.63 : 0.04 + Math.random() * 0.22;
        dup = Math.max(lo, Math.min(maxPct, Math.round(dup + headroom * take)));
      }
      nextSeen = maxPct;
    }
    return { dup, seen: nextSeen };
  }
  function runDriftTrial(tier) {
    const capSeq =
      tier === 1
        ? [
            [1970, 50],
            [1979, 60],
            [1986, 80],
            [1996, 100],
          ]
        : tier === 2
          ? [
              [1970, 60],
              [1979, 75],
              [1986, 100],
              [1996, 100],
            ]
          : [
              [1970, 80],
              [1979, 100],
              [1996, 100],
            ];
    let dup = 0;
    let seen = null;
    const snap = {};
    for (const [yr, maxPct] of capSeq) {
      const r = enforceStep(dup, seen, maxPct, tier);
      dup = r.dup;
      seen = r.seen;
      snap[yr] = dup;
    }
    return snap;
  }
  for (const tier of [1, 2, 3]) {
    const n = 5000;
    const sum = {};
    for (let i = 0; i < n; i++) {
      const s = runDriftTrial(tier);
      Object.keys(s).forEach((k) => {
        sum[k] = (sum[k] || 0) + s[k];
      });
    }
    const label = tier === 1 ? 'Tier1 mega' : tier === 2 ? 'Tier2 large' : 'Tier3 medium';
    const m = (y) => ((sum[y] || 0) / n).toFixed(2);
    if (tier === 3) {
      console.log(`  ${label}: 1970 mean ${m(1970)}% → 1979 ${m(1979)}% → 1996 ${m(1996)}% (cap already 100 before 1996)`);
    } else if (tier === 2) {
      console.log(`  ${label}: 1970 mean ${m(1970)}% → 1979 ${m(1979)}% → 1986 ${m(1986)}% → 1996 ${m(1996)}%`);
    } else {
      console.log(`  ${label}: 1970 mean ${m(1970)}% → 1979 ${m(1979)}% → 1986 ${m(1986)}% → 1996 ${m(1996)}%`);
    }
  }

  console.log('\n=== Longitudinal note (code inspection) ===');
  console.log('  enforceFmNonDupConstraints runs on new game + load + MP fm_dup apply — NOT each advTurn.');
  console.log('  Patch 2: when maxPct rises, AI nudges fmSimulcastDupPct upward (partial headroom); _aiFmDupMaxCapSeen tracks last cap.');
}

main();
