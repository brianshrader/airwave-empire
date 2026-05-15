/**
 * Diagnostic-only derived market traits from existing `MARKETS` rows.
 * Does not affect gameplay — read-only normalization for Node reports (`scripts/report-market-traits.mjs`)
 * and optional future inspect tooling (not wired into play.html).
 *
 * Trait definitions (all derived from MARKETS fields only; **year** varies `hispanicAffinity` and therefore `rhythmicDiversityAffinity`):
 * - **marketScale** — log-scaled `revScale` vs ~Wichita..NY band → 0–1 “wallet / metro weight”.
 * - **fragmentationAffinity** — blend of `rankTier` dial depth, `fmMusicFragMult`, `urbanBonus`.
 * - **educationAffinity** — raw `eduIndex` linear map 0.82–1.26 → 0–1 (parallel to public edu weighting).
 * - **publicMediaAffinity** — `0.48*eduN + 0.52*civN` with eduN/civN same normalization as `computePublicStationTargetCount` in legacy.
 * - **civicAffinity** — `civN` alone from `publicCivicIndex`.
 * - **blackAffinity** — `blackPop` clamped 0–1.
 * - **hispanicAffinity** — interpolated Hispanic share from hispPop1970/2000/2020 by `year` (**only year-varying scalar in this module**).
 * - **urbanMusicAffinity** — blended “metro urban chart” proxy: `urbanBonus` + `culture.urban` (ambiguous vs gameplay `appl`, which also mixes Spanish into Urban/Rhythmic). Prefer **urbanDensityAffinity** + **urbanFormatAffinity** for splits.
 * - **urbanDensityAffinity** — `urbanBonus` only → 0–1 (allotment-style metro weight).
 * - **urbanFormatAffinity** — `culture.urban` only → 0–1 (cultural urban axis).
 * - **blackMusicAffinity** — Black-listening / Soul-R&B / Gospel *addressable pool* proxy: `blackPop` + light church/urban weights (not duplicate gameplay demo math).
 * - **rhythmicDiversityAffinity** — crossover / rhythmic milieu proxy: blends interpolated Hispanic share, `culture.spanish`, `urbanBonus`, `blackPop` (diagnostic only).
 * - **countryAffinity** — `countryBonus` + `culture.country`.
 * - **religiousAffinity** — `churchGoing` + `culture.religion` blend.
 * - **gospelAffinity** — simplified structural 0–1 from Black/church/urban/religion/arch + city/arch offsets; floor 0.02 (not `gospelCommercialMarketFit01`).
 * - **ccmAffinity** — structural CCM lane proxy (archetype/region/church/religion); floor 0.02.
 * - **spanishLanguageAffinity** — `culture.spanish` / 0.24 cap 1 (not full “Latin format” addressable market).
 * - **wealthAdAffinity** — same numeric value as `marketScale` here (revScale proxy only).
 * - **adMarketStrength** — `adxBonus` linear map ~0.008–0.055 → 0–1.
 * - **amResilience** — mean of AM resilience trio normalized to 0–1.
 * - **fmAdoptionBias** — `fmPenBias` shifted/scaled to 0–1 (faster FM uptake = higher).
 * - **heritageInertia** — mean of `heritageAmResilience` + `countryAmHoldout` normalized 0–1.
 * - **archetypeId**, **rankTier** — passthrough from MARKETS.
 *
 * @param {Record<string, object>} markets — same shape as `MARKETS` in legacy.js
 * @param {string} marketId
 * @param {number} [year=1970] — calendar year (drives Hispanic interpolation only)
 * @returns {Record<string, number|string>}
 */
function _clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function _rankTierFragmentationNorm(rankTier) {
  const rt = String(rankTier || 'medium');
  if (rt === 'mega') return 1;
  if (rt === 'large') return 0.8;
  if (rt === 'medium') return 0.5;
  if (rt === 'small') return 0.28;
  return 0.5;
}

function _hispanicShare01(m, year) {
  const yr = Math.max(1970, Math.min(2060, Number(year) || 1970));
  const hisp1970 = m.hispPop1970 ?? 0.01;
  const hisp2000 = m.hispPop2000 ?? 0.08;
  const hisp2020 = m.hispPop2020 ?? 0.115;
  if (yr <= 2000) {
    return _clamp01(hisp1970 + Math.max(0, yr - 1970) / 30 * (hisp2000 - hisp1970));
  }
  return _clamp01(Math.min(hisp2020, hisp2000 + ((yr - 2000) / 20) * (hisp2020 - hisp2000)));
}

function _eduNFromRaw(edu) {
  if (edu == null || Number.isNaN(Number(edu))) return 0.5;
  return _clamp01((Number(edu) - 0.88) / (1.24 - 0.88));
}

function _civNFromRaw(civic) {
  if (civic == null || Number.isNaN(Number(civic))) return 0.5;
  return _clamp01((Number(civic) - 0.92) / (1.12 - 0.92));
}

/** Same spirit as `religiousNetworkCcmCoreMarket` — 0–1 structural CCM lane strength (not ratings). */
function _ccmStructural01(m, marketId) {
  const arch = String(m.archetypeId || '');
  const reg = String(m.region || '').toLowerCase();
  const ch = typeof m.churchGoing === 'number' ? m.churchGoing : 0.45;
  const rel = typeof m.culture?.religion === 'number' ? m.culture.religion : 0.06;
  let s = 0.35 * _clamp01((ch - 0.22) / (0.55 - 0.22)) + 0.35 * _clamp01(rel / 0.14);
  if (/sunbelt|southern|bible|country|evangelical|prairie|legacy|plains|heartland/i.test(arch)) s += 0.22;
  if (reg.includes('south') && !reg.includes('australia')) s += 0.12;
  if (/coastal_secular|northeast_mega|west_fm_fragmented/i.test(arch)) s -= 0.18;
  if (reg.includes('northeast')) s -= 0.05;
  if (String(marketId) === 'nashville') s += 0.06;
  return Math.max(0.02, _clamp01(s));
}

/** Loose 0–1 mirror of gospel commercial “fit” inputs (not identical to legacy gospelCommercialMarketFit01). */
function _gospelStructural01(m, marketId) {
  const cult = m.culture || {};
  const bp = typeof m.blackPop === 'number' ? m.blackPop : 0.2;
  const ch = typeof m.churchGoing === 'number' ? m.churchGoing : 0.45;
  const ub = typeof m.urbanBonus === 'number' ? m.urbanBonus : 0;
  const rel = typeof cult.religion === 'number' ? cult.religion : 0.06;
  const arch = String(m.archetypeId || '');
  let f = bp * 0.68 + (ch - 0.42) * 0.52 + ub * 0.36 + rel * 4.0;
  if (/sunbelt|southern|country|legacy|prairie|plains|heartland/i.test(arch)) f += 0.048;
  if (/coastal_secular/i.test(arch)) f -= 0.11;
  if (String(marketId) === 'seattle' || String(marketId) === 'sanfrancisco') f -= 0.08;
  return Math.max(0.02, _clamp01((f - 0.02) / 1.15));
}

function _meanAmResilience01(m) {
  const a = typeof m.spokenWordAmResilience === 'number' ? m.spokenWordAmResilience : 1;
  const b = typeof m.heritageAmResilience === 'number' ? m.heritageAmResilience : 1;
  const c = typeof m.countryAmHoldout === 'number' ? m.countryAmHoldout : 1;
  const avg = (a + b + c) / 3;
  return _clamp01((avg - 0.72) / (1.22 - 0.72));
}

function _heritageInertia01(m) {
  const h = typeof m.heritageAmResilience === 'number' ? m.heritageAmResilience : 1;
  const co = typeof m.countryAmHoldout === 'number' ? m.countryAmHoldout : 1;
  const avg = (h + co) / 2;
  return _clamp01((avg - 0.74) / (1.25 - 0.74));
}

export function marketTraitProfile(markets, marketId, year) {
  const y = Number(year);
  const yr = Number.isFinite(y) ? y : 1970;
  const mid = String(marketId || '').trim() || 'atlanta';
  const m = (markets && markets[mid]) || {};
  const revScale = typeof m.revScale === 'number' && !Number.isNaN(m.revScale) ? m.revScale : 1;
  const rankTier = String(m.rankTier || 'medium');
  const eduRaw = typeof m.eduIndex === 'number' && !Number.isNaN(m.eduIndex) ? m.eduIndex : 1;
  const civicRaw = typeof m.publicCivicIndex === 'number' && !Number.isNaN(m.publicCivicIndex) ? m.publicCivicIndex : 1;
  const eduN = _eduNFromRaw(eduRaw);
  const civN = _civNFromRaw(civicRaw);
  const blackPop = typeof m.blackPop === 'number' ? _clamp01(m.blackPop) : 0.2;
  const hisp01 = _hispanicShare01(m, yr);
  const urbanBonus = typeof m.urbanBonus === 'number' ? m.urbanBonus : 0;
  const countryBonus = typeof m.countryBonus === 'number' ? m.countryBonus : 0;
  const cult = m.culture || {};
  const cultUrban = typeof cult.urban === 'number' ? cult.urban : 0;
  const cultCountry = typeof cult.country === 'number' ? cult.country : 0;
  const cultSpanish = typeof cult.spanish === 'number' ? cult.spanish : 0;
  const cultRel = typeof cult.religion === 'number' ? cult.religion : 0.06;
  const churchGoing = typeof m.churchGoing === 'number' ? m.churchGoing : 0.45;
  const fmFrag = typeof m.fmMusicFragMult === 'number' && !Number.isNaN(m.fmMusicFragMult) ? m.fmMusicFragMult : 1;
  const fmPen = typeof m.fmPenBias === 'number' && !Number.isNaN(m.fmPenBias) ? m.fmPenBias : 0;
  const adxB = typeof m.adxBonus === 'number' && !Number.isNaN(m.adxBonus) ? m.adxBonus : 0.02;

  const marketScale = _clamp01((Math.log(Math.max(0.22, revScale)) - Math.log(0.22)) / (Math.log(7.5) - Math.log(0.22)));
  const fragTier = _rankTierFragmentationNorm(rankTier);
  const fragDial = _clamp01((fmFrag - 0.92) / (1.14 - 0.92));
  const fragUrban = _clamp01(urbanBonus / 0.16);
  const fragmentationAffinity = _clamp01(0.52 * fragTier + 0.28 * fragDial + 0.2 * fragUrban);

  const educationAffinity = _clamp01((eduRaw - 0.82) / (1.26 - 0.82));
  const publicMediaAffinity = _clamp01(0.48 * eduN + 0.52 * civN);
  const civicAffinity = civN;

  const urbanDensityAffinity = _clamp01(urbanBonus / 0.16);
  const urbanFormatAffinity = _clamp01(cultUrban / 0.18);
  const urbanMusicAffinity = _clamp01(0.55 * _clamp01(urbanBonus / 0.15) + 0.45 * _clamp01(cultUrban / 0.18));
  const blackMusicAffinity = _clamp01(
    0.62 * blackPop + 0.22 * _clamp01((churchGoing - 0.22) / (0.62 - 0.22)) + 0.16 * urbanDensityAffinity
  );
  const spanishLanguageAffinity = _clamp01(cultSpanish / 0.24);
  const rhythmicDiversityAffinity = _clamp01(
    0.32 * hisp01 + 0.28 * spanishLanguageAffinity + 0.22 * urbanDensityAffinity + 0.18 * blackPop
  );
  const countryAffinity = _clamp01(0.55 * _clamp01(countryBonus / 0.22) + 0.45 * _clamp01(cultCountry / 0.28));

  const religiousAffinity = _clamp01(
    0.55 * _clamp01((churchGoing - 0.22) / (0.62 - 0.22)) + 0.45 * _clamp01(cultRel / 0.14)
  );

  const gospelAffinity = _gospelStructural01(m, mid);
  const ccmAffinity = _ccmStructural01(m, mid);

  const wealthAdAffinity = marketScale;
  const adMarketStrength = _clamp01((adxB - 0.008) / (0.055 - 0.008));

  const amResilience = _meanAmResilience01(m);
  const fmAdoptionBias = _clamp01((fmPen + 0.07) / 0.14);
  const heritageInertia = _heritageInertia01(m);

  const archetypeId = m.archetypeId != null ? String(m.archetypeId) : '';

  return {
    marketId: mid,
    year: yr,
    marketScale,
    fragmentationAffinity,
    educationAffinity,
    publicMediaAffinity,
    civicAffinity,
    blackAffinity: blackPop,
    hispanicAffinity: hisp01,
    urbanMusicAffinity,
    countryAffinity,
    religiousAffinity,
    gospelAffinity,
    ccmAffinity,
    spanishLanguageAffinity,
    wealthAdAffinity,
    adMarketStrength,
    amResilience,
    fmAdoptionBias,
    heritageInertia,
    urbanDensityAffinity,
    urbanFormatAffinity,
    blackMusicAffinity,
    rhythmicDiversityAffinity,
    archetypeId,
    rankTier,
  };
}
