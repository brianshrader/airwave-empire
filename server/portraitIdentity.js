/**
 * Talent portrait identity: stable key from name + first hire year,
 * deterministic wardrobe / expression / setting from that key.
 */

const crypto = require('crypto');

const WARDROBE_TYPES = ['casual', 'semiPro', 'oddball'];
/** Strong non-smile — image models default to grins; these are weighted heavily in pickExpressionFromHash. */
const EXPRESSION_TYPES_NO_SMILE_STRONG = ['restingFace', 'deadpan', 'serious', 'stern'];
const EXPRESSION_TYPES_NO_SMILE_SOFT = ['tired', 'neutral', 'preoccupied'];
const EXPRESSION_TYPES_MIXED = ['smug', 'awkward'];
const EXPRESSION_TYPES_SMILE = ['forcedSmile'];
/** Union for API / docs — not a flat rotation (see weighted picker). */
const EXPRESSION_TYPES = [
  ...EXPRESSION_TYPES_NO_SMILE_STRONG,
  ...EXPRESSION_TYPES_NO_SMILE_SOFT,
  ...EXPRESSION_TYPES_MIXED,
  ...EXPRESSION_TYPES_SMILE,
];
const SETTING_TYPES = ['radioStudio', 'plainBackdrop', 'officeCorner'];

/** Bump when appearance logic changes — forces new deterministic picks vs older cached portrait metadata. */
const APPEARANCE_HASH_VERSION = 'appearance-v7';

/** Deterministic appearance vocabulary — indices chosen from hash (not gameplay). */
const APPEARANCE_AGE = ['early 20s', 'late 20s', '30s', '40s', '50s', '60s'];
const APPEARANCE_BODY = ['slim', 'average', 'stocky', 'heavyset', 'broad-shouldered'];
const APPEARANCE_FACE = ['round', 'square jaw', 'long', 'sharp angular features', 'soft oval'];
/** Visible face structure — stronger than face shape alone. */
const APPEARANCE_FACIAL_DETAIL = [
  'prominent nose',
  'wide-set eyes',
  'deep-set eyes',
  'high forehead',
  'strong brow',
  'full cheeks',
  'lean face',
  'plain unremarkable features',
  'forgettable everyday face — not camera-friendly',
  'asymmetric features',
  'noticeable ears',
  'weak chin',
  'heavy eyelids',
  'lines and creases',
  'soft, ordinary features (not delicate or doll-like)',
  'rugged features',
  'slightly uneven skin tone and texture',
  'bland resting face — would not cast as “the attractive one”',
];
/** Pushed into every AI prompt so models stop defaulting to catalog-beautiful faces. */
const APPEARANCE_ATTRACTIVENESS_ANCHOR = [
  'Facial attractiveness strictly average — would not stand out in a grocery line.',
  'Looks like a real coworker, not someone hired for their face — ordinary appeal only.',
  'Neither conventionally pretty nor ugly — the forgettable face in a staff directory.',
  'Plain looks: if this were stock art, the label would be “generic adult,” not “model.”',
  'Unremarkable symmetry and proportions — avoid glow, glamour lighting, or “camera-ready” skin.',
  'Middle-of-the-bell-curve looks: the opposite of a headshot for an actor or influencer.',
  'Slightly awkward or bland bone structure — believable small-market radio, not TV.',
];
/**
 * Rotating roster — 10 slots so fair / olive / brown / deep tones all appear often in the hash cycle.
 * Each prompt names expected skin *range* so image models don’t collapse unrelated heritages into one brown shade.
 * No costumes or caricature.
 */
const APPEARANCE_HERITAGE = [
  {
    id: 'whiteEuroAmerican',
    prompt:
      'white European-American radio host — fair to lightly sun-tanned skin, ordinary US white appearance',
  },
  {
    id: 'africanAmerican',
    prompt:
      'African American radio personality — Black features with natural brown to deep brown skin',
  },
  {
    id: 'latino',
    prompt:
      'Latino or Latina US radio host — authentic range from fair to medium-brown skin (not one default shade)',
  },
  {
    id: 'eastAsian',
    prompt: 'East Asian American radio professional — East Asian features; skin often fair to light',
  },
  {
    id: 'southAsian',
    prompt: 'South Asian American radio host — South Asian features with natural light brown to brown skin',
  },
  {
    id: 'whiteEthnicRegional',
    prompt:
      'white American with Irish, Italian, Polish, or Scandinavian roots — fair or ruddy skin, unremarkable regional look',
  },
  {
    id: 'southeastAsian',
    prompt:
      'Southeast Asian American broadcaster — natural golden to medium-brown skin, Southeast Asian features',
  },
  {
    id: 'middleEasternSwana',
    prompt:
      'Middle Eastern or North African American host — olive to medium-brown skin, authentic SWANA features',
  },
  {
    id: 'pacificIslander',
    prompt:
      'Pacific Islander or Native Hawaiian radio host — natural Polynesian features and skin tones',
  },
  {
    id: 'multiracial',
    prompt:
      'multiracial or mixed-heritage American radio host — believable blended features and natural skin tone',
  },
];
/** On-camera demeanor (distinct from wardrobe micro-expression in portraitPrompt). */
const APPEARANCE_DEMEANOR = [
  'serious, deadpan expression',
  'unpracticed, slightly awkward tension — mouth may be tight, not necessarily smiling',
  'harmless goofy energy in the eyes',
  'tired, endearing “long shift” face',
  'relaxed, unpolished demeanor',
  'slightly weary but genuine expression',
  'guarded, reserved expression',
  'distracted, mid-thought look',
  'nervous polite expression',
  'resting confused-but-friendly face',
];
/** Male-presenting hair — may include age-typical male-pattern thinning (not used for women). */
const APPEARANCE_HAIR_MALE = [
  'slightly messy natural hair',
  'receding hairline',
  'thinning at the crown',
  'thick curly hair',
  'tightly coiled natural hair',
  'unkempt but believable hair',
  'side-parted neat hair',
  'short neat hair',
  'long straight hair',
  'wavy shoulder-length hair',
  'straight hair tucked behind the ears',
  'natural afro-textured hair',
  'soft waves with natural volume',
];
/** Feminine hairstyles only — no male-pattern hairline or balding cues. */
const APPEARANCE_HAIR_FEMALE = [
  'slightly messy natural hair',
  'soft layered hair with natural movement',
  'thick curly hair',
  'tightly coiled natural hair',
  'unkempt but believable hair',
  'side-parted neat hair',
  'practical plain cut (feminine, not glamorous)',
  'long straight hair',
  'wavy shoulder-length hair',
  'straight hair tucked behind the ears',
  'natural afro-textured hair',
  'soft waves with natural volume',
  'fine hair with soft body and volume',
  'practical on-air hairstyle (clipped or pulled back, clearly feminine)',
  'collar-length cut with natural body',
];
/** When gender unknown — avoid male-pattern loss so the model does not default to masculine balding. */
const APPEARANCE_HAIR_NEUTRAL = APPEARANCE_HAIR_FEMALE;
const APPEARANCE_HAIR_1970S_MALE = [
  'feathered 1970s-style hair',
  'side-parted 1970s station-photo hair',
  'slightly shaggy period-appropriate hair',
];
const APPEARANCE_HAIR_1970S_FEMALE = [
  'soft feathered 1970s women’s station-photo hairstyle',
  '1970s collar-length cut with natural body',
  'period-appropriate 1970s feminine hairstyle',
];
const APPEARANCE_HAIR_1980S_MALE = [
  'fuller 1980s volume hair',
  '1980s station promo hairstyle',
  'layered 1980s cut',
];
const APPEARANCE_HAIR_1980S_FEMALE = [
  'fuller 1980s volume (feminine station promo style)',
  'layered 1980s women’s cut',
  '1980s professional women’s on-air hairstyle',
];
const APPEARANCE_HAIR_1990S_MALE = [
  'early-1990s casual hair',
  'short neat 1990s cut',
  'soft layered 1990s style',
];
const APPEARANCE_HAIR_1990S_FEMALE = [
  'early-1990s casual women’s hairstyle',
  'short neat 1990s women’s cut',
  'soft layered 1990s women’s style',
];
const APPEARANCE_STYLE = ['plain', 'slightly disheveled', 'casual', 'conservative', 'eccentric', 'clean-cut', 'flashy'];

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
 * Deterministic filename body: sanitized-name-firsthireyear[-sessionslug]
 * @param {string} name
 * @param {number} firstHireYear
 * @param {string} [gamePortraitSession] — per-game id so new games don’t reuse prior flat files; omit for legacy
 */
function portraitFileBase(name, firstHireYear, gamePortraitSession) {
  const y = Math.floor(Number(firstHireYear) || 1970);
  let base = `${slugPart(name, 36)}-${y}`;
  const sess =
    gamePortraitSession != null && String(gamePortraitSession).trim()
      ? slugPart(String(gamePortraitSession).trim(), 24)
      : '';
  if (sess) base = `${base}-${sess}`;
  return base;
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

/**
 * Weighted toward non-smiling faces (~70% clear no-smile, ~15% smirk/awkward, ~15% broadcast smile).
 * @param {Buffer} hashBytes — sha256 digest
 */
function pickExpressionFromHash(hashBytes) {
  const r = hashBytes[2] % 100;
  if (r < 38) {
    const pool = EXPRESSION_TYPES_NO_SMILE_STRONG;
    return pool[hashBytes[4] % pool.length];
  }
  if (r < 68) {
    const pool = EXPRESSION_TYPES_NO_SMILE_SOFT;
    return pool[hashBytes[5] % pool.length];
  }
  if (r < 85) {
    const pool = EXPRESSION_TYPES_MIXED;
    return pool[hashBytes[6] % pool.length];
  }
  return EXPRESSION_TYPES_SMILE[0];
}

function pickSettingFromHash(hashBytes) {
  return SETTING_TYPES[hashBytes[3] % SETTING_TYPES.length];
}

/** Stable key for hashing — include talentId when present so two hosts never share the same face. */
function portraitHashKey(identitySlug, talentId) {
  const base = String(identitySlug || '').trim();
  if (talentId != null && String(talentId).trim() !== '') {
    return `${base}|id:${String(talentId).trim()}`;
  }
  return base;
}

/**
 * Full deterministic profile for an identity slug (same slug → same picks).
 * @param {string} identitySlug — e.g. jane-doe-1978
 * @param {string} [talentId] — game talent id; varies hash when name+year collide
 */
function derivePortraitProfile(identitySlug, talentId) {
  const key = portraitHashKey(identitySlug, talentId);
  const h = crypto.createHash('sha256').update(key, 'utf8').digest();
  return {
    wardrobeType: pickWardrobeFromHash(h),
    expressionType: pickExpressionFromHash(h),
    settingType: pickSettingFromHash(h),
  };
}

/**
 * Era-appropriate hair nudge — subset of picks get period styling (deterministic).
 * @param {string} eraBucket
 * @param {Buffer} h
 * @param {'male'|'female'|null|undefined} gender
 */
function pickHairWithEra(eraBucket, h, gender) {
  const pool =
    gender === 'female'
      ? APPEARANCE_HAIR_FEMALE
      : gender === 'male'
        ? APPEARANCE_HAIR_MALE
        : APPEARANCE_HAIR_NEUTRAL;
  let hair = pool[h[3] % pool.length];
  const roll = h[10] % 10;
  // Unknown gender: use women’s era styling so period nudges never imply male-pattern looks
  const useFemEra = gender !== 'male';
  if (eraBucket === '1970s' && roll < 3) {
    const eraPool = useFemEra ? APPEARANCE_HAIR_1970S_FEMALE : APPEARANCE_HAIR_1970S_MALE;
    hair = eraPool[h[11] % eraPool.length];
  } else if (eraBucket === '1980s' && roll < 3) {
    const eraPool = useFemEra ? APPEARANCE_HAIR_1980S_FEMALE : APPEARANCE_HAIR_1980S_MALE;
    hair = eraPool[h[11] % eraPool.length];
  } else if (eraBucket === '1990s' && roll < 2) {
    const eraPool = useFemEra ? APPEARANCE_HAIR_1990S_FEMALE : APPEARANCE_HAIR_1990S_MALE;
    hair = eraPool[h[12] % eraPool.length];
  }
  return hair;
}

/**
 * Structured look variation — deterministic from hashKey, nudged by optional gameplay stats.
 * Gameplay nudges age / polish / fatigue only; heritage, demeanor, facial detail, hair come from hash.
 * @param {string} hashKey — portraitHashKey(...)
 * @param {{ yearsExperience?: number, morale?: number, quality?: number, eraBucket?: string, gender?: 'male'|'female'|null }} [opts]
 */
function deriveAppearanceTraits(hashKey, opts = {}) {
  const h = crypto.createHash('sha256').update(`${hashKey}|${APPEARANCE_HASH_VERSION}`, 'utf8').digest();
  const eraBucket = opts.eraBucket || '2000s+';
  const gender = opts.gender === 'female' || opts.gender === 'male' ? opts.gender : null;

  let ageIdx = h[0] % APPEARANCE_AGE.length;
  const ye = Number(opts.yearsExperience);
  if (Number.isFinite(ye) && ye > 0) {
    ageIdx = Math.min(APPEARANCE_AGE.length - 1, ageIdx + Math.min(3, Math.floor(ye / 10)));
  }

  let personalStyle = APPEARANCE_STYLE[h[4] % APPEARANCE_STYLE.length];
  const q = Number(opts.quality);
  if (Number.isFinite(q) && q >= 78 && h[5] % 3 !== 0) {
    personalStyle = 'eccentric';
  }

  const heritage = APPEARANCE_HERITAGE[h[6] % APPEARANCE_HERITAGE.length];
  let facialDetail = APPEARANCE_FACIAL_DETAIL[h[7] % APPEARANCE_FACIAL_DETAIL.length];
  if (gender === 'female' && facialDetail === 'rugged features') {
    facialDetail = 'strong bone structure without glamor — weathered or plain, not delicate or model-pretty';
  }
  const demeanor = APPEARANCE_DEMEANOR[h[8] % APPEARANCE_DEMEANOR.length];
  let hairStyle = pickHairWithEra(eraBucket, h, gender);

  const gameplayNotes = [];
  if (Number.isFinite(q) && q >= 75) {
    gameplayNotes.push(
      'seasoned on-air presence — competence reads from demeanor, not from being unusually good-looking'
    );
  }
  const morale = Number(opts.morale);
  if (Number.isFinite(morale) && morale < 42) {
    gameplayNotes.push('tired eyes, slightly disheveled');
  } else if (Number.isFinite(morale) && morale < 52) {
    gameplayNotes.push('subtle fatigue');
  }

  const variationSeed = crypto
    .createHash('sha256')
    .update(`${hashKey}|portrait-seed-v3`, 'utf8')
    .digest('hex')
    .slice(0, 16);

  const attractivenessAnchor =
    APPEARANCE_ATTRACTIVENESS_ANCHOR[h[9] % APPEARANCE_ATTRACTIVENESS_ANCHOR.length];

  return {
    heritageId: heritage.id,
    heritagePrompt: heritage.prompt,
    attractivenessAnchor,
    facialDetail,
    demeanor,
    ageRange: APPEARANCE_AGE[ageIdx],
    bodyType: APPEARANCE_BODY[h[1] % APPEARANCE_BODY.length],
    faceShape: APPEARANCE_FACE[h[2] % APPEARANCE_FACE.length],
    hairStyle,
    personalStyle,
    gameplayNotes: gameplayNotes.length ? gameplayNotes.join('; ') : '',
    variationSeed,
  };
}

module.exports = {
  portraitIdentityKey,
  portraitFileBase,
  eraBucketFromYear,
  derivePortraitProfile,
  deriveAppearanceTraits,
  portraitHashKey,
  normalizeNameKey,
  slugPart,
  APPEARANCE_HASH_VERSION,
  APPEARANCE_HERITAGE,
  APPEARANCE_ATTRACTIVENESS_ANCHOR,
  WARDROBE_TYPES,
  EXPRESSION_TYPES,
  SETTING_TYPES,
};
