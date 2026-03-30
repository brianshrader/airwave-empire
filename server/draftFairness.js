/**
 * Multiplayer draft viability — mirrors `stationDifficulty` in src/legacy.js
 * (same share thresholds). Tier 3 = ★★★ HARD = weak for anchor rules.
 */

function draftStationTier(station) {
  const share = station?.rat?.share || 0;
  if (share > 0.1) return 1;
  if (share > 0.05) return 2;
  return 3;
}

function isWeakDraftStation(station) {
  return draftStationTier(station) === 3;
}

module.exports = { draftStationTier, isWeakDraftStation };
