/**
 * Format lifecycle profile → runtime appeal bridge (catalog-driven, no fs).
 * @see data/formatLifecycle.v1.json marketProfiles
 * @see docs/FORMAT_LIFECYCLE_LAYER_V1.md
 */

function _clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}

function _smoothstep(a, b, x) {
  const t = _clamp01((x - a) / Math.max(1e-9, b - a));
  return t * t * (3 - 2 * t);
}

/**
 * National COUNTRY decline-phase multiplier from market profile modernRetention.
 * Portland-only in v1; damp-only when profile retention < national.
 *
 * @param {string} marketId
 * @param {number} year
 * @param {object} catalog formatLifecycle.v1.json
 * @returns {number} mktFmt multiplier (typically 0.72–1.0)
 */
export function profileCountryLifecycleMktFmtMult(marketId, year, catalog) {
  if (marketId !== 'portland') return 1;
  const profileMod = catalog?.marketProfiles?.portland?.formatModifiers?.COUNTRY;
  const nationalSpec = catalog?.nationalFormats?.COUNTRY;
  if (!profileMod || !nationalSpec) return 1;

  const profileRetention = Number(profileMod.modernRetention);
  const nationalRetention = Number(nationalSpec.modernRetention ?? 0.8);
  if (!Number.isFinite(profileRetention) || profileRetention >= nationalRetention) return 1;

  const y = Math.round(Number(year)) || 1970;
  const peak = nationalSpec.peak ?? 2005;
  const plateauEnd = nationalSpec.plateauEnd ?? 2015;
  const declineEnd = nationalSpec.declineEnd ?? 2026;

  let nationalDecline = 0;
  if (y > plateauEnd) {
    nationalDecline = _smoothstep(plateauEnd, declineEnd, y);
  } else if (y > peak) {
    nationalDecline = _smoothstep(peak, plateauEnd, y) * 0.35;
  }
  if (nationalDecline < 0.02) return 1;

  const retentionRatio = profileRetention / Math.max(0.12, nationalRetention);
  const damp = 1 - 0.48 * nationalDecline * (1 - retentionRatio);
  return Math.max(0.72, Math.min(1.06, damp));
}
