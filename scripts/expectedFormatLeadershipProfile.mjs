/**
 * QA-only: maps `deriveMarketEcology` traits → plausible *#1 leadership* priors (normalized weights).
 * Not used by gameplay. For regression / scaffold diagnostics.
 */

import { isSpanishLanguageFormat } from './spanishLanguageFormats.mjs';

export const LEADERSHIP_BUCKET_KEYS = [
  'TOP40_CHR',
  'AC_HOT_AC',
  'ROCK_ALT_AAA',
  'COUNTRY',
  'NEWS_TALK_SPORTS',
  'PUBLIC_RADIO',
  'URBAN_RHYTHMIC',
  'SPANISH',
  'GOSPEL_CCM',
];

function clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / Math.max(1e-9, b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Map canonical book format keys (post-`canonicalHitsFormatKey`) to leadership buckets.
 * @param {string} fmtKey
 * @returns {string|null} bucket id or null if unmapped
 */
export function mapCanonicalFmtKeyToLeadershipBucket(fmtKey) {
  const k = String(fmtKey || '').trim().toUpperCase();
  if (!k) return null;
  if (k === 'TOP40' || k === 'CHR' || k === 'RHYTHMIC') return 'TOP40_CHR';
  if (k === 'HOT_AC' || k === 'ADULT_CONTEMP') return 'AC_HOT_AC';
  if (
    k === 'CLASSIC_ROCK' ||
    k === 'ALBUM_ROCK' ||
    k === 'ALT_ROCK' ||
    k === 'AAA' ||
    k === 'ACTIVE_ROCK' ||
    k === 'CLASSIC_HITS' ||
    k === 'OLDIES'
  ) {
    return 'ROCK_ALT_AAA';
  }
  if (k === 'COUNTRY') return 'COUNTRY';
  if (k === 'NEWS_TALK' || k === 'SPORTS_TALK' || k === 'PERSONALITY_TALK' || k === 'ALL_NEWS') {
    return 'NEWS_TALK_SPORTS';
  }
  if (k.startsWith('PUBLIC_')) return 'PUBLIC_RADIO';
  if (k === 'URBAN_CONTEMP' || k === 'SOUL_RNB') return 'URBAN_RHYTHMIC';
  if (isSpanishLanguageFormat(k)) return 'SPANISH';
  if (k === 'GOSPEL' || k === 'RELIGIOUS_NETWORK') return 'GOSPEL_CCM';
  return null;
}

/**
 * Collapse mean format-share rows into leadership buckets + optional OTHER mass.
 * @param {Array<{k:string,m:number}>} fmtAggSorted
 * @returns {{ buckets: Record<string, number>, other: number, serialized: string }}
 */
export function aggregateMeansToLeadershipBuckets(fmtAggSorted) {
  const raw = Object.fromEntries(LEADERSHIP_BUCKET_KEYS.map((id) => [id, 0]));
  let other = 0;
  for (const row of fmtAggSorted || []) {
    const b = mapCanonicalFmtKeyToLeadershipBucket(row.k);
    const m = Math.max(0, Number(row.m) || 0);
    if (b) raw[b] += m;
    else other += m;
  }
  const sumNine = LEADERSHIP_BUCKET_KEYS.reduce((s, id) => s + raw[id], 0);
  const tot = sumNine + other;
  const buckets = {};
  if (tot <= 0) {
    for (const id of LEADERSHIP_BUCKET_KEYS) buckets[id] = 1 / LEADERSHIP_BUCKET_KEYS.length;
    return { buckets, other: 0, serialized: serializeBucketRecord(buckets) };
  }
  for (const id of LEADERSHIP_BUCKET_KEYS) buckets[id] = raw[id] / tot;
  const otherN = other / tot;
  return { buckets, other: otherN, serialized: serializeBucketRecord(buckets, otherN) };
}

function serializeBucketRecord(buckets, other) {
  const parts = LEADERSHIP_BUCKET_KEYS.map((id) => `${id}:${(buckets[id] ?? 0).toFixed(4)}`);
  if (other != null && other > 0.0005) parts.push(`OTHER:${other.toFixed(4)}`);
  return parts.join('|');
}

/**
 * @param {object} ecology — output of `deriveMarketEcology` (partial objects tolerated)
 * @param {number} year
 * @returns {{
 *   year: number,
 *   buckets: Record<string, number>,
 *   top40ChrWeight: number,
 *   serialized: string,
 * }}
 */
export function expectedFormatLeadershipProfile(ecology, year) {
  const y = Math.max(1970, Math.min(2060, Number(year) || 1970));
  const e = ecology && typeof ecology === 'object' ? ecology : {};

  const chrR = clamp01(e.chrResistance);
  const modSub = clamp01(e.modernMusicSubstitution);
  const pubS = clamp01(e.publicRadioStrength);
  const aaa = clamp01(e.aaaAlternativeStrength);
  const ctry = clamp01(e.countryStrength);
  const spw = clamp01(e.spokenWordStrength);
  const sprt = clamp01(e.sportsStrength);
  const span = clamp01(e.spanishLanguageStrength);
  const blk = clamp01(e.blackMusicStrength);
  const urb = clamp01(e.urbanContemporaryStrength);
  const gos = clamp01(e.gospelStrength);
  const ccm = clamp01(e.ccmStrength);
  const frag = clamp01(e.marketFragmentation);

  const post2005 = y >= 2005 ? 1 : smoothstep(1998, 2006, y);
  const youthShape = smoothstep(1992, 2008, y) * (1 - 0.35 * smoothstep(2016, 2026, y));

  /** Base CHR / hits-lineage *#1* prior before trait multipliers (tuned for QA, not ratings). */
  let top40chr =
    0.17 +
    0.12 * youthShape +
    0.045 * (1 - frag) -
    0.035 * smoothstep(2012, 2026, y);
  top40chr = Math.max(0.035, top40chr);
  top40chr *= 1 - 0.62 * chrR;
  top40chr *= 1 - 0.68 * modSub * post2005;
  top40chr *= 1 - 0.14 * aaa;
  top40chr *= 1 - 0.1 * pubS;
  top40chr *= 1 + 0.06 * urb;

  let ac = 0.075 + 0.14 * frag + 0.09 * (1 - chrR) * post2005 + 0.05 * modSub;

  let rock = 0.055 + 0.52 * aaa + 0.11 * frag + 0.05 * pubS;

  let country = 0.045 + 0.55 * ctry;

  let nts = 0.055 + 0.4 * spw + 0.34 * sprt + 0.05 * frag;

  let pub = 0.035 + 0.5 * pubS;

  let urban = 0.045 + 0.36 * urb + 0.26 * blk;

  let sp = 0.028 + 0.44 * span;

  const relStrong = Math.max(gos, ccm) >= 0.58 && (ctry >= 0.55 || gos + ccm >= 1.02);
  const gCap = relStrong ? 1 : 0.45;
  const cCap = relStrong ? 1 : 0.42;
  let gospel = 0.035 + 0.5 * gos * gCap + 0.34 * ccm * cCap;

  const raw = {
    TOP40_CHR: top40chr,
    AC_HOT_AC: ac,
    ROCK_ALT_AAA: rock,
    COUNTRY: country,
    NEWS_TALK_SPORTS: nts,
    PUBLIC_RADIO: pub,
    URBAN_RHYTHMIC: urban,
    SPANISH: sp,
    GOSPEL_CCM: gospel,
  };

  let sum = 0;
  for (const id of LEADERSHIP_BUCKET_KEYS) sum += Math.max(0, raw[id]);
  const buckets = {};
  if (sum <= 0) {
    for (const id of LEADERSHIP_BUCKET_KEYS) buckets[id] = 1 / LEADERSHIP_BUCKET_KEYS.length;
  } else {
    for (const id of LEADERSHIP_BUCKET_KEYS) buckets[id] = Math.max(0, raw[id]) / sum;
  }

  return {
    year: y,
    buckets,
    top40ChrWeight: buckets.TOP40_CHR,
    serialized: serializeBucketRecord(buckets),
  };
}

/**
 * @param {number} actualTop40WinRate — fraction of runs where #1 canonical key is TOP40
 * @param {number} expectedTop40Weight — from `expectedFormatLeadershipProfile`
 * @returns {''|'MODERATE'|'SEVERE'}
 */
export function classifyTop40Mismatch(actualTop40WinRate, expectedTop40Weight) {
  const a = clamp01(actualTop40WinRate);
  const e = clamp01(expectedTop40Weight);
  if (a > 0.7 && e < 0.35) return 'SEVERE';
  if (a - e > 0.2 && a > 0.45) return 'MODERATE';
  return '';
}
