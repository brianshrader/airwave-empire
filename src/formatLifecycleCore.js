/**
 * Format Lifecycle Layer v1 — diagnostic math + narrow runtime bridge (Portland COUNTRY mktFmt).
 *
 * Three layers:
 *   A) nationalLifecycle(format, year)     — data/formatLifecycle.v1.json
 *   B) deriveMarketFormatModifiers(...)    — ecology traits + optional market profile
 *   C) eraMarketInteraction(...)           — lane rules (coastal, edu, HD era, …)
 *
 * @see docs/FORMAT_LIFECYCLE_LAYER_V1.md
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deriveMarketEcology } from './marketEcology.js';
import { profileCountryLifecycleMktFmtMult as profileCountryLifecycleMktFmtMultCore } from './formatLifecycleProfileRuntime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = path.join(__dirname, '..', 'data', 'formatLifecycle.v1.json');

function _clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}

function _smoothstep(a, b, x) {
  const t = _clamp01((x - a) / Math.max(1e-9, b - a));
  return t * t * (3 - 2 * t);
}

function _interpLifecycleViability(year, spec) {
  const y = Math.round(Number(year)) || 1970;
  const emergence = spec.emergence ?? 1970;
  const peak = spec.peak ?? emergence + 10;
  const plateauEnd = spec.plateauEnd != null ? spec.plateauEnd : peak;
  const declineEnd = spec.declineEnd ?? peak + 20;
  const floor = spec.floor ?? 0.06;
  const retention = _clamp01(spec.modernRetention ?? 0.5);
  const steep = _clamp01(spec.declineSteepness ?? 0.5);

  if (y < emergence) return floor * 0.5;
  if (y <= peak) {
    const ramp = _smoothstep(emergence, peak, y);
    return floor + (1 - floor) * ramp;
  }
  if (y <= plateauEnd) return 1;

  const declinePhase = _smoothstep(plateauEnd, declineEnd, y);
  const tail = retention + (1 - retention) * (1 - declinePhase);
  const curved = 1 - steep * declinePhase * (1 - retention);
  return Math.max(floor, Math.min(1, curved * tail));
}

let _cachedCatalog = null;

/**
 * @param {string} [catalogPath]
 * @returns {object}
 */
export function loadFormatLifecycleCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  if (_cachedCatalog && catalogPath === DEFAULT_CATALOG_PATH) return _cachedCatalog;
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8'));
  if (catalogPath === DEFAULT_CATALOG_PATH) _cachedCatalog = raw;
  return raw;
}

/**
 * Layer A — national format viability 0–1.
 * @param {string} formatKey — e.g. TOP40, COUNTRY
 * @param {number} year
 * @param {object} [catalog]
 */
export function nationalLifecycle(formatKey, year, catalog = loadFormatLifecycleCatalog()) {
  const spec = catalog.nationalFormats?.[formatKey];
  if (!spec) return null;
  return _interpLifecycleViability(year, spec);
}

/**
 * Layer B — per-format market modifiers from ecology + optional profile overrides.
 * @param {object} market — MARKETS row
 * @param {string} marketId
 * @param {number} year
 * @param {object} [catalog]
 * @param {object} [G]
 * @returns {Record<string, { historicStrength: number, modernRetention: number, traitBoost: number }>}
 */
export function deriveMarketFormatModifiers(market, marketId, year, catalog = loadFormatLifecycleCatalog(), G = null) {
  const eco = deriveMarketEcology(market, marketId, year, G);
  const arch = String(market?.archetypeId || eco.archetypeId || '');
  const coastal = /coastal_secular|west_fm_fragmented|northeast_mega/i.test(arch) ? 0.72 : 0.35;
  const sunbelt = /sunbelt|southern|prairie|plains|heartland|country|bible|legacy|midwest_legacy/i.test(arch)
    ? 0.78
    : 0.45;

  const modifiers = {};
  const formats = Object.keys(catalog.nationalFormats || {});

  for (const fmt of formats) {
    let historicStrength = 0.45;
    let modernRetention = 0.55;

    const lane = catalog.nationalFormats[fmt]?.lane || '';
    if (lane === 'country') {
      historicStrength = _clamp01(0.35 + 0.55 * eco.countryStrength);
      modernRetention = _clamp01(0.4 + 0.45 * eco.countryStrength * sunbelt + 0.15 * (1 - coastal));
    } else if (lane === 'public') {
      historicStrength = _clamp01(0.3 + 0.5 * eco.publicRadioStrength);
      modernRetention = _clamp01(0.5 + 0.4 * eco.publicRadioStrength);
    } else if (lane === 'aaa') {
      historicStrength = _clamp01(0.25 + 0.55 * eco.aaaAlternativeStrength);
      modernRetention = _clamp01(0.45 + 0.45 * eco.aaaAlternativeStrength);
    } else if (lane === 'ethnic') {
      historicStrength = _clamp01(0.3 + 0.5 * eco.spanishLanguageStrength);
      modernRetention = _clamp01(0.55 + 0.4 * eco.spanishLanguageStrength);
    } else if (lane === 'spoken') {
      historicStrength = _clamp01(0.35 + 0.45 * eco.spokenWordStrength);
      modernRetention = _clamp01(0.55 + 0.35 * eco.spokenWordStrength);
    } else if (lane === 'hits') {
      historicStrength = _clamp01(0.5 + 0.25 * (1 - eco.chrResistance));
      modernRetention = _clamp01(0.35 + 0.35 * (1 - eco.modernMusicSubstitution));
    } else if (lane === 'urban') {
      historicStrength = _clamp01(0.4 + 0.45 * eco.urbanContemporaryStrength);
      modernRetention = _clamp01(0.45 + 0.35 * eco.urbanContemporaryStrength);
    } else if (lane === 'religious') {
      historicStrength = _clamp01(0.35 + 0.35 * eco.gospelStrength + 0.2 * eco.ccmStrength);
      modernRetention = _clamp01(0.5 + 0.3 * eco.ccmStrength);
    } else if (lane === 'rock') {
      historicStrength = _clamp01(0.4 + 0.25 * eco.marketFragmentation);
      modernRetention = _clamp01(0.55 + 0.2 * eco.marketFragmentation);
    }

    let traitBoost = 0;
    const boosts = catalog.traitToModifierBoost || {};
    for (const [traitKey, fmtMap] of Object.entries(boosts)) {
      const delta = fmtMap[fmt];
      if (delta == null) continue;
      const traitVal = eco[traitKey];
      if (typeof traitVal === 'number') traitBoost += delta * traitVal;
    }
    traitBoost = Math.max(-0.2, Math.min(0.25, traitBoost));

    modifiers[fmt] = { historicStrength, modernRetention, traitBoost };
  }

  const profile = catalog.marketProfiles?.[marketId]?.formatModifiers;
  if (profile) {
    for (const [fmt, over] of Object.entries(profile)) {
      if (!modifiers[fmt]) modifiers[fmt] = { historicStrength: 0.5, modernRetention: 0.5, traitBoost: 0 };
      if (over.historicStrength != null) modifiers[fmt].historicStrength = _clamp01(over.historicStrength);
      if (over.modernRetention != null) modifiers[fmt].modernRetention = _clamp01(over.modernRetention);
    }
  }

  return modifiers;
}

/**
 * Layer C — era × market interaction multiplier.
 * @param {string} formatKey
 * @param {number} year
 * @param {object} eco — deriveMarketEcology output
 * @param {object} catalog
 */
export function eraMarketInteraction(formatKey, year, eco, catalog = loadFormatLifecycleCatalog()) {
  const spec = catalog.nationalFormats?.[formatKey];
  if (!spec) return 1;
  const lane = spec.lane || '';
  const rules = catalog.laneInteraction?.[lane] || {};
  const y = Math.round(Number(year)) || 1970;
  let mult = 1;

  const national = nationalLifecycle(formatKey, year, catalog) ?? 0.5;
  const nationalDeclinePhase = _clamp01(1 - national);

  if (lane === 'country' && rules.coastalResistanceTraitWeight) {
    const arch = String(eco.archetypeId || '');
    const coastal = /coastal_secular|west_fm_fragmented/i.test(arch) ? 1 : 0.4;
    mult *= 1 - rules.coastalResistanceTraitWeight * nationalDeclinePhase * coastal * 0.35;
  }

  if ((lane === 'public' || lane === 'aaa') && rules.educationBoostTraitWeight) {
    const eduRamp = _smoothstep(1990, 2015, y);
    mult *= 1 + rules.educationBoostTraitWeight * eduRamp * _clamp01((eco.publicRadioStrength || 0.5) - 0.4);
  }

  if (lane === 'ethnic' && rules.spanishGrowthTraitWeight) {
    const growthRamp = _smoothstep(1985, 2020, y);
    mult *= 1 + rules.spanishGrowthTraitWeight * growthRamp * (eco.spanishLanguageStrength || 0);
  }

  if (lane === 'hits' && rules.eduAccelDeclinePost2005) {
    const sub = _smoothstep(2005, 2020, y) * (eco.modernMusicSubstitution || 0);
    mult *= 1 - rules.eduAccelDeclinePost2005 * sub;
  }

  if (lane === 'religious' && rules.hdTranslatorBoostAfter != null) {
    const hd = _smoothstep(rules.hdTranslatorBoostAfter, rules.hdTranslatorBoostAfter + 8, y);
    mult *= 1 + (rules.hdTranslatorBoostMax || 0.08) * hd * (eco.ccmStrength || 0);
  }

  if (lane === 'spoken' && rules.spokenWordTraitWeight) {
    mult *= 1 + rules.spokenWordTraitWeight * 0.15 * ((eco.spokenWordStrength || 0) - 0.45);
  }

  return Math.max(0.65, Math.min(1.35, mult));
}

/** CHR-lane formats for combined diagnostic index (not additive book share). */
export const HITS_LANE_FORMAT_KEYS = ['TOP40', 'HOT_AC', 'RHYTHMIC'];

/**
 * Combined directional weight (layers A × B × C), clamped 0–1.
 * Diagnostic only — a **relative directional index**, not book share or probability.
 */
export function formatLifecyclePrior(formatKey, market, marketId, year, catalog = loadFormatLifecycleCatalog(), G = null) {
  const national = nationalLifecycle(formatKey, year, catalog);
  if (national == null) {
    return { prior: null, national: null, marketAffinity: 0, interaction: 1 };
  }

  const eco = deriveMarketEcology(market, marketId, year, G);
  const mods = deriveMarketFormatModifiers(market, marketId, year, catalog, G);
  const mod = mods[formatKey] || { historicStrength: 0.5, modernRetention: 0.5, traitBoost: 0 };

  const y = Math.round(Number(year)) || 1970;
  const spec = catalog.nationalFormats[formatKey];
  const declineEnd = spec.declineEnd ?? 2026;
  const postPeak = y > (spec.peak ?? 1980);
  const retentionCurve = postPeak
    ? mod.modernRetention + (1 - mod.modernRetention) * (1 - _smoothstep(spec.peak ?? 1980, declineEnd, y))
    : mod.historicStrength + (1 - mod.historicStrength) * _smoothstep(spec.emergence ?? 1970, spec.peak ?? 1980, y);

  const marketAffinity = _clamp01(retentionCurve * mod.historicStrength + mod.traitBoost + 0.15);
  const interaction = eraMarketInteraction(formatKey, year, eco, catalog);
  const prior = _clamp01(national * marketAffinity * interaction);

  return {
    prior,
    directionalWeight: prior,
    national,
    marketAffinity,
    interaction,
  };
}

/** Display cap: diagnostic indices are shown on 0–100 scale, never above 100. */
export function diagnosticDisplayIndex(weight01) {
  if (weight01 == null || Number.isNaN(weight01)) return null;
  return Math.min(100, Math.round(_clamp01(weight01) * 1000) / 10);
}

/**
 * Per-market / year snapshot for harness output (no gameplay).
 * @returns {{
 *   formats: Array<{ format: string, directionalWeight: number, displayIndex: number, relativeToLeader: number, national: number|null, marketAffinity: number, interaction: number }>,
 *   hitsLaneIndex: number,
 *   hitsLaneDisplay: number,
 *   leaderFormat: string|null,
 * }}
 */
export function computeMarketYearDiagnosticWeights(market, marketId, year, catalog = loadFormatLifecycleCatalog(), G = null) {
  const formats = [];
  for (const fmt of Object.keys(catalog.nationalFormats || {})) {
    const r = formatLifecyclePrior(fmt, market, marketId, year, catalog, G);
    if (r.directionalWeight == null) continue;
    formats.push({
      format: fmt,
      directionalWeight: r.directionalWeight,
      national: r.national,
      marketAffinity: r.marketAffinity,
      interaction: r.interaction,
    });
  }
  formats.sort((a, b) => b.directionalWeight - a.directionalWeight);
  const leaderW = formats[0]?.directionalWeight || 0;
  for (const row of formats) {
    row.displayIndex = diagnosticDisplayIndex(row.directionalWeight);
    row.relativeToLeader =
      leaderW > 0 ? Math.min(100, Math.round((row.directionalWeight / leaderW) * 1000) / 10) : 0;
  }
  const hitsLaneIndex = Math.min(
    1,
    formats
      .filter((r) => HITS_LANE_FORMAT_KEYS.includes(r.format))
      .reduce((s, r) => s + r.directionalWeight, 0),
  );
  return {
    formats,
    hitsLaneIndex,
    hitsLaneDisplay: diagnosticDisplayIndex(hitsLaneIndex),
    leaderFormat: formats[0]?.format ?? null,
  };
}

/**
 * QA warnings for implausible diagnostic indices (design review, not auto-tuning).
 * @returns {Array<{ id: string, message: string }>}
 */
export function assessDiagnosticPlausibility(marketId, market, year, snapshot) {
  const warnings = [];
  const mid = String(marketId || '');
  const y = Math.round(Number(year)) || 1970;
  const arch = String(market?.archetypeId || '');
  const byFmt = Object.fromEntries(snapshot.formats.map((r) => [r.format, r]));

  const w = (fmt) => byFmt[fmt]?.directionalWeight ?? 0;
  const idx = (fmt) => byFmt[fmt]?.displayIndex ?? 0;

  if (mid === 'portland' && idx('SPANISH') >= 55) {
    warnings.push({
      id: 'portland_spanish_high',
      message: `${mid} ${y}: Spanish directional index ${idx('SPANISH')} is high for a low-Hispanic coastal market — check ethnic lane interaction.`,
    });
  }
  if (mid === 'portland' && idx('URBAN_CONTEMP') >= 60) {
    warnings.push({
      id: 'portland_urban_high',
      message: `${mid} ${y}: Urban directional index ${idx('URBAN_CONTEMP')} is high — expected thinner urban lane vs Sunbelt.`,
    });
  }
  const sunbeltPublic =
    /sunbelt|southern|prairie|plains|heartland|country|bible|legacy|midwest_legacy/i.test(arch) &&
    !/coastal_secular|west_fm_fragmented|northeast_mega/i.test(arch);
  if (sunbeltPublic && idx('PUBLIC') >= 65 && y >= 2000) {
    warnings.push({
      id: 'sunbelt_public_high',
      message: `${mid} ${y}: Public directional index ${idx('PUBLIC')} is high for Sunbelt archetype — public growth may be overstated in interaction layer.`,
    });
  }
  if (w('PUBLIC') > 0.95 && y < 2000) {
    warnings.push({
      id: 'public_pre2000_saturated',
      message: `${mid} ${y}: Public directional weight at cap (${idx('PUBLIC')}) before 2000 — national PUBLIC curve may read as share.`,
    });
  }
  if (snapshot.hitsLaneDisplay >= 100) {
    warnings.push({
      id: 'hits_lane_sum_capped',
      message: `${mid} ${y}: Hits-lane combined index hit 100 cap (sum of TOP40+HOT_AC+RHYTHMIC) — use hits-lane index, not sum of displayed format lines.`,
    });
  }

  return warnings;
}

/**
 * Portland-only COUNTRY mktFmt multiplier from marketProfiles (Node / tests).
 * Browser gameplay uses `formatLifecycleProfileRuntime.iife.js` global hook.
 */
export function profileCountryLifecycleMktFmtMult(marketId, year, catalog = loadFormatLifecycleCatalog()) {
  return profileCountryLifecycleMktFmtMultCore(marketId, year, catalog);
}

/**
 * @param {object} market
 * @param {string} marketId
 * @param {number[]} years
 * @param {string[]|null} [formatKeys]
 * @param {object} [catalog]
 */
export function formatLifecyclePriorGrid(market, marketId, years, formatKeys = null, catalog = loadFormatLifecycleCatalog()) {
  const formats = formatKeys || Object.keys(catalog.nationalFormats || {});
  const grid = {};
  for (const y of years) {
    grid[y] = {};
    for (const fmt of formats) {
      grid[y][fmt] = formatLifecyclePrior(fmt, market, marketId, y, catalog);
    }
  }
  return grid;
}
