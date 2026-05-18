/**
 * Canonical Spanish-language format IDs for QA / ecology regression diagnostics.
 * Gameplay `FM{}` currently exposes only `SPANISH`; tropical/regional/bilingual lanes
 * are sub-axes on that format until split formats ship.
 */

/** Exact format keys that count as Spanish-language listening in diagnostics. */
export const SPANISH_LANGUAGE_FORMAT_IDS = Object.freeze([
  'SPANISH',
  // Planned / taxonomy extensions (include before split formats land):
  'SALSA_TROPICAL',
  'BILINGUAL_AC',
  'SPANISH_NEWS_TALK',
  'SPANISH_CHR',
  'SPANISH_HOT_AC',
  'SPANISH_GOSPEL',
  'SPANISH_RELIGIOUS',
  'SPANISH_SPORTS_TALK',
  'SPANISH_BROKERED',
]);

/** Prefixes for future `SPANISH_*` format family (e.g. SPANISH_NEWS_TALK). */
export const SPANISH_LANGUAGE_FORMAT_PREFIXES = Object.freeze(['SPANISH_']);

const _exact = new Set(SPANISH_LANGUAGE_FORMAT_IDS);

/**
 * @param {string} fmt — raw station.format (pre- or post-canonical)
 * @returns {boolean}
 */
export function isSpanishLanguageFormat(fmt) {
  const raw = String(fmt || '').trim().toUpperCase();
  if (!raw) return false;
  if (_exact.has(raw)) return true;
  for (const p of SPANISH_LANGUAGE_FORMAT_PREFIXES) {
    if (raw.startsWith(p)) return true;
  }
  return false;
}

/** @param {string} fmt */
export function canonicalSpanishLanguageFormatKey(fmt) {
  return isSpanishLanguageFormat(fmt) ? 'SPANISH_LANGUAGE' : null;
}

/** Human-readable bucket definition for diag headers. */
export function describeSpanishLanguageBucket() {
  return [
    'SPANISH_LANGUAGE bucket = exact IDs:',
    SPANISH_LANGUAGE_FORMAT_IDS.join(', '),
    `+ any format starting with ${SPANISH_LANGUAGE_FORMAT_PREFIXES.join(' or ')}`,
    '(Legacy diag counted SPANISH only.)',
  ].join(' ');
}
