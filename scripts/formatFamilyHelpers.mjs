/**
 * Format family registry helpers (read-only metadata).
 * Loads data/formatFamilies.v1.json — not used by gameplay.
 *
 * @see docs/FORMAT_FAMILY_ARCHITECTURE.md
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FORMAT_FAMILIES_PATH = path.join(__dirname, '..', 'data', 'formatFamilies.v1.json');

let _cachedCatalog = null;
let _cachedPath = null;

function smoothstep(a, b, y) {
  const t = Math.max(0, Math.min(1, (Number(y) - a) / Math.max(1e-9, b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * @param {string} [catalogPath]
 * @returns {object}
 */
export function loadFormatFamiliesCatalog(catalogPath = DEFAULT_FORMAT_FAMILIES_PATH) {
  if (_cachedCatalog && catalogPath === _cachedPath) return _cachedCatalog;
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  if (catalogPath === DEFAULT_FORMAT_FAMILIES_PATH) {
    _cachedCatalog = catalog;
    _cachedPath = catalogPath;
  }
  return catalog;
}

/**
 * @param {string} formatId
 * @param {object} catalog
 * @returns {string}
 */
export function canonicalFormatId(formatId, catalog = loadFormatFamiliesCatalog()) {
  const id = String(formatId || '').trim().toUpperCase();
  if (!id) return '';
  return catalog.saveAliases?.[id] || id;
}

/**
 * @param {string} formatId
 * @param {object} [catalog]
 * @returns {string|null} family id (e.g. HITS, ADULT) or null if unmapped
 */
export function familyForFormat(formatId, catalog = loadFormatFamiliesCatalog()) {
  const key = canonicalFormatId(formatId, catalog);
  if (!key) return null;
  return catalog.legacyIdMap?.[key]?.family ?? null;
}

/**
 * @param {string} formatId
 * @param {object} [catalog]
 * @returns {string}
 */
export function familyLabelForFormat(formatId, catalog = loadFormatFamiliesCatalog()) {
  const fam = familyForFormat(formatId, catalog);
  if (!fam) return 'Unmapped';
  return catalog.families?.[fam]?.label ?? fam;
}

/**
 * @param {string} formatId
 * @param {object} [catalog]
 * @returns {boolean}
 */
export function isMetaFormat(formatId, catalog = loadFormatFamiliesCatalog()) {
  const fam = familyForFormat(formatId, catalog);
  if (!fam) return false;
  const meta = catalog.families?.[fam]?.meta;
  const entry = catalog.legacyIdMap?.[canonicalFormatId(formatId, catalog)];
  return !!(meta || entry?.metaClassification === 'remnant_inventory' || fam === 'REMNANT');
}

/**
 * @param {string} formatId
 * @param {object} [catalog]
 * @returns {boolean}
 */
export function isInstitutionalFormat(formatId, catalog = loadFormatFamiliesCatalog()) {
  const key = canonicalFormatId(formatId, catalog);
  const entry = catalog.legacyIdMap?.[key];
  if (entry?.institutional) return true;
  return familyForFormat(formatId, catalog) === 'INSTITUTIONAL';
}

/**
 * Player-facing / spec display label (metadata only; gameplay fmtLabel unchanged).
 * @param {string} formatId
 * @param {number} [year]
 * @param {object} [catalog]
 * @returns {string}
 */
export function canonicalDisplayLabel(formatId, year, catalog = loadFormatFamiliesCatalog()) {
  const key = canonicalFormatId(formatId, catalog);
  if (!key) return String(formatId || '');

  const entry = catalog.legacyIdMap?.[key];
  if (!entry) return key;

  const y = Math.round(Number(year)) || 1970;
  const rules = catalog.displayLabelRules?.[key];

  if (rules?.type === 'hits_lineage' && Array.isArray(rules.rules)) {
    const earlyRule = rules.rules.find((r) => r.untilYear != null && !r.blend);
    const blendRule = rules.rules.find((r) => r.blend);
    if (blendRule?.blend) {
      const from = blendRule.blend.fromYear ?? 1978;
      const to = blendRule.blend.toYear ?? 1992;
      const t = smoothstep(from, to, y);
      if (t < 0.28) return earlyRule?.label ?? 'Top 40';
      if (t > 0.72) return blendRule.label ?? 'CHR';
      return 'Top 40 / CHR';
    }
  }

  if (rules?.type === 'era_tranche' && Array.isArray(rules.rules)) {
    for (const r of rules.rules) {
      if (r.untilYear != null && y < r.untilYear) return r.label;
    }
    const last = rules.rules[rules.rules.length - 1];
    return last?.label ?? entry.displayDefault ?? key;
  }

  if (rules?.type === 'static_override') {
    return rules.specLabel ?? entry.displayDefault ?? key;
  }

  return entry.displaySpecLabel || entry.displayDefault || key;
}

/**
 * @param {{ format?: string }} station
 * @param {number} [year]
 * @param {object} [catalog]
 */
export function familyBucketForStation(station, year, catalog = loadFormatFamiliesCatalog()) {
  const raw = station?.format;
  const formatId = canonicalFormatId(raw, catalog);
  const family = familyForFormat(raw, catalog);
  return {
    formatId,
    rawFormatId: raw,
    family,
    familyLabel: family ? (catalog.families?.[family]?.label ?? family) : 'Unmapped',
    displayLabel: canonicalDisplayLabel(raw, year, catalog),
    meta: isMetaFormat(raw, catalog),
    institutional: isInstitutionalFormat(raw, catalog),
  };
}

/** Stable sort order for family share tables. */
export const FAMILY_DISPLAY_ORDER = [
  'HITS',
  'ROCK',
  'ADULT',
  'COUNTRY',
  'URBAN',
  'SPOKEN',
  'CHRISTIAN',
  'SPANISH',
  'PUBLIC',
  'REMNANT',
  'INSTITUTIONAL',
  'UNMAPPED',
];

/**
 * Roll up format-keyed book shares to family totals.
 * @param {Record<string, number>} fmtSum
 * @param {object} [catalog]
 * @returns {{ familyShares: Record<string, number>, unmappedShare: number, unmappedFormats: string[] }}
 */
export function aggregateFmtSumToFamilyShares(fmtSum, catalog = loadFormatFamiliesCatalog()) {
  const familyShares = Object.fromEntries(FAMILY_DISPLAY_ORDER.map((f) => [f, 0]));
  const unmappedFormats = [];
  let unmappedShare = 0;

  for (const [fmt, sh] of Object.entries(fmtSum || {})) {
    const share = Math.max(0, Number(sh) || 0);
    if (share <= 0) continue;
    const fam = familyForFormat(fmt, catalog);
    if (!fam) {
      familyShares.UNMAPPED = (familyShares.UNMAPPED || 0) + share;
      unmappedShare += share;
      unmappedFormats.push(String(fmt));
    } else {
      familyShares[fam] = (familyShares[fam] || 0) + share;
    }
  }

  return { familyShares, unmappedShare, unmappedFormats };
}

/**
 * List all family ids from catalog (excludes UNMAPPED pseudo-family).
 * @param {object} [catalog]
 * @returns {string[]}
 */
export function listFamilyIds(catalog = loadFormatFamiliesCatalog()) {
  return Object.keys(catalog.families || {});
}
