/**
 * Talent portrait identity: stable key from name + first hire year,
 * deterministic wardrobe / expression / setting from that key.
 */

const crypto = require('crypto');

const WARDROBE_TYPES = ['casual', 'semiPro', 'oddball'];
const EXPRESSION_TYPES = ['forcedSmile', 'serious', 'smug', 'tired', 'awkward', 'neutral'];
const SETTING_TYPES = ['radioStudio', 'plainBackdrop', 'officeCorner'];

/** @param {string} name */
function normalizeNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Logical identity for registry + filenames (not filesystem path alone).
 * @param {string} name
 * @param {number} firstHireYear
 */
function portraitIdentityKey(name, firstHireYear) {
  return `${normalizeNameKey(name)}|${Math.floor(Number(firstHireYear) || 1970)}`;
}

/** @param {string} s @param {number} max */
function slugPart(s, max = 48) {
  const t = String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return t || 'talent';
}

/**
 * Deterministic filename body: sanitized-name-firsthireyear
 * @param {string} name
 * @param {number} firstHireYear
 */
function portraitFileBase(name, firstHireYear) {
  const y = Math.floor(Number(firstHireYear) || 1970);
  return `${slugPart(name, 40)}-${y}`;
}

/**
 * Era buckets: 1970s | 1980s | 1990s | 2000s+
 * @param {number} firstHireYear
 */
function eraBucketFromYear(firstHireYear) {
  const y = Math.floor(Number(firstHireYear) || 1970);
  if (y < 1980) return '1970s';
  if (y < 1990) return '1980s';
  if (y < 2000) return '1990s';
  return '2000s+';
}

/**
 * Weighted wardrobe: casual 40%, semiPro 35%, oddball 25%
 * @param {Buffer} hashBytes — first bytes from sha256(identitySlug)
 */
function pickWardrobeFromHash(hashBytes) {
  const n = hashBytes.readUInt16BE(0) % 10000;
  if (n < 4000) return 'casual';
  if (n < 7500) return 'semiPro';
  return 'oddball';
}

function pickExpressionFromHash(hashBytes) {
  return EXPRESSION_TYPES[hashBytes[2] % EXPRESSION_TYPES.length];
}

function pickSettingFromHash(hashBytes) {
  return SETTING_TYPES[hashBytes[3] % SETTING_TYPES.length];
}

/**
 * Full deterministic profile for an identity slug (same slug → same picks).
 * @param {string} identitySlug — e.g. jane-doe-1978
 */
function derivePortraitProfile(identitySlug) {
  const h = crypto.createHash('sha256').update(identitySlug, 'utf8').digest();
  return {
    wardrobeType: pickWardrobeFromHash(h),
    expressionType: pickExpressionFromHash(h),
    settingType: pickSettingFromHash(h),
  };
}

module.exports = {
  portraitIdentityKey,
  portraitFileBase,
  eraBucketFromYear,
  derivePortraitProfile,
  normalizeNameKey,
  slugPart,
  WARDROBE_TYPES,
  EXPRESSION_TYPES,
  SETTING_TYPES,
};
