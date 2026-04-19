'use strict';

/**
 * 1970s-era rival FM/AM station brand generator for simulation use.
 * Style-only: does not copy real slogans, nicknames, or famous identities.
 *
 * 1970s dial realism (see `generateFrequency`, `resolveBandForEra`):
 * - AM 540–1600 kHz only (no extended band); spoken-word formats skew AM.
 * - Commercial FM rivals use 92.1–107.9 MHz (skip 88–92 reserved/educational slice).
 * - Music formats (CHR, rock, AC) skew FM; news/talk strongly skews AM.
 *
 * @module server/rivalStationBranding
 */

const path = require('path');
const { ALL_PLAYABLE_MARKET_IDS } = require(path.join(__dirname, '../scripts/market-ids.cjs'));

/** @typedef {'top40_chr'|'rock'|'ac_easy'|'country'|'news_talk'|'oldies_mor'} RivalFormatKey */

/** @typedef {'1970s'|'1980s'|'1990s'|'2000s'} BrandEra */

/**
 * Major markets with Mississippi rule for W/K.
 * `side`: east → calls begin with W; west → K.
 */
const MARKETS = {
  newyork: {
    displayName: 'New York',
    cityLabel: 'New York',
    side: 'east',
    localHooks: [
      'the city and suburbs',
      'the tri-state area',
      'metro New York',
      'the five boroughs',
      'listeners at home and work',
    ],
  },
  chicago: {
    displayName: 'Chicago',
    cityLabel: 'Chicago',
    side: 'east',
    localHooks: ['Chicagoland', 'the city and suburbs', 'downtown to the suburbs', 'northern Illinois', 'countywide'],
  },
  atlanta: {
    displayName: 'Atlanta',
    cityLabel: 'Atlanta',
    side: 'east',
    localHooks: ['all over Atlanta', 'metro Atlanta', 'north Georgia', 'the city and suburbs', 'listeners across Georgia'],
  },
  nashville: {
    displayName: 'Nashville',
    cityLabel: 'Nashville',
    side: 'east',
    localHooks: ['around Music City', 'middle Tennessee', 'the city and suburbs', 'countywide', 'listeners statewide'],
  },
  losangeles: {
    displayName: 'Los Angeles',
    cityLabel: 'Los Angeles',
    side: 'west',
    localHooks: [
      'across Southern California',
      'the city and suburbs',
      'the Southland',
      'L.A. and the Valley',
      'listeners coast to inland',
    ],
  },
  seattle: {
    displayName: 'Seattle',
    cityLabel: 'Seattle',
    side: 'west',
    localHooks: [
      'Seattle',
      'Puget Sound',
      'the Sound',
      'Seattle-Tacoma',
      'the city and suburbs',
      'around western Washington',
      'across the I-5 corridor',
    ],
  },
  wichita: {
    displayName: 'Wichita',
    cityLabel: 'Wichita',
    side: 'west',
    localHooks: [
      'south-central Kansas',
      'the city and suburbs',
      'Sedgwick County',
      'listeners across the Plains',
      'the Air Capital',
    ],
  },
};

/** Extra positioning lines for Seattle — stronger rock/alt voice; country reads Pacific Northwest, not Southern. */
const SEATTLE_POSITIONING_EXTRAS = {
  rock: [
    "{city}'s album-rock home",
    'FM rock built for the Northwest',
    'the rock sound of Puget Sound',
    'album rock for western Washington',
    'progressive stereo FM {city}',
  ],
  country: [
    'Pacific Northwest country',
    'country radio for Puget Sound',
    'Northwest country favorites',
    'local country from Seattle to the foothills',
    'country hits for western Washington',
  ],
};

/**
 * @param {string} marketId
 * @param {RivalFormatKey} formatKey
 * @param {'fm'|'am'} band
 * @param {{ legalStyle: string[], shortBrand: string[], positioning: string[] }} templates
 */
function mergeSeattleBrandTemplateExtras(marketId, formatKey, band, templates) {
  if (marketId !== 'seattle') return templates;
  const extra = SEATTLE_POSITIONING_EXTRAS[formatKey];
  if (!extra || !extra.length) return templates;
  const extraPos = band === 'am' ? extra.filter((t) => !isAmIncompatibleTemplate(t)) : extra;
  if (!extraPos.length) return templates;
  return {
    legalStyle: templates.legalStyle,
    shortBrand: templates.shortBrand,
    positioning: templates.positioning.concat(extraPos),
  };
}

/** Generic fallbacks — short, speakable. */
const DEFAULT_LOCAL_HOOKS = ['the metro area', 'the city and suburbs', 'countywide', 'listeners countywide'];

/**
 * Vocabulary banks: generic 1970s radio diction per format (safe, non-proprietary).
 */
const VOCABULARY_BANKS = {
  top40_chr: {
    energy: ['hit radio', 'top hits', 'big hits', 'power music', 'favorite music', 'music center', 'sound', 'chart action'],
    motion: ['non-stop', 'around the clock', 'all day', 'all night', 'citywide', 'drive time to midnight'],
    leadership: ['first with hits', 'your hit station', "the city's music leader", 'where the hits live', 'the winning hit list'],
    promoTone: ['more music fewer talk breaks', 'prizes on the air', 'the survey station', 'request lines open', 'hit after hit'],
    spark: ['favorite hits', 'hometown hits', 'city hits city style', 'music machine', 'tight bright radio'],
  },
  rock: {
    core: ['rock', 'FM rock', 'album rock', 'stereo rock', 'hard rock', 'progressive sound', 'real rock', 'underground sound'],
    stance: ['turn it up', 'album cuts', 'the long players', 'no fluff', 'straight rock', 'side two energy'],
    stereoSell: ['full stereo separation', 'headphone hours', 'FM album room', 'wide FM sound'],
    spark: ['rock radio', 'real albums real city', 'loud clear stereo', 'guitar city FM'],
  },
  ac_easy: {
    core: ['beautiful music', 'easy listening', 'stereo favorites', 'gentle music', 'good music', 'relaxing favorites', 'light favorites'],
    mood: ['easy', 'smooth', 'warm', 'pleasant', 'all day easy', 'office to evening'],
    stereoSell: ['FM easy chair', 'stereo without the shout', 'soft FM blanket'],
    spark: ['easy favorites', 'soft sound steady day', 'gentle gold', 'coffee-break music'],
  },
  country: {
    core: ['country', 'western', 'honky-tonk', 'country music', 'down-home', 'tradition', 'two-step radio'],
    place: ['home', 'heartland', 'hometown', 'local', 'back-road listeners'],
    spark: ['country connection', 'hometown country', 'western welcome', 'steel and fiddle town'],
  },
  news_talk: {
    core: ['news', 'talk', 'information', 'reports', 'weather', 'newsline', 'radio news', 'telephone talk'],
    trust: ['authority', 'coverage', 'updates', 'when it counts', 'the adult conversation'],
    spark: ['news you need', 'facts first', 'city desk radio', 'wake up wired in'],
  },
  oldies_mor: {
    core: ['good music', 'great songs', 'gold', 'favorites', 'standards', 'memories', 'timeless', 'memory lane'],
    comfort: ['the songs you know', 'yesterday and today', 'all-time favorites', 'mom and dad knew these'],
    spark: ['golden memories', 'favorite songs forever', "yesterday's hits today", 'turntable ghosts in stereo'],
  },
};

/** Terse FM cues for legal IDs only (not wall-to-wall ad copy). */
const FM_BAND_FLAVOR = ['stereo FM', 'FM stereo', 'full FM stereo', 'wide FM'];

/** Terse AM cues for legal IDs. */
const AM_BAND_FLAVOR = ['full-power AM', 'AM radio', 'clear-channel AM', 'big-signal AM'];

/**
 * Structural templates: legal lines use `{freqLegal}` (exact channel); short/on-air use `{brandDial}` (dial-friendly).
 * `{freqWords}` aliases legal frequency wording for legacy IDs.
 */
const BRAND_TEMPLATES = {
  top40_chr: {
    legalStyle: [
      '{call}, {freqWords}, {city}',
      '{call} {freqLegal}, licensed to serve {city}',
      '{city}: {call} {freqLegal}, commercial broadcast',
      '{call} {freqLegal}, {bandFlavor}, {city}',
      '{call} {freqLegal}, serving listeners in {local}',
    ],
    shortBrand: [
      '{call} {brandDial}',
      '{call} {brandDial}',
      '{call} {brandDial}',
      '{brandDial} {call}',
      '{brandDial} {call}',
      '{brandDial} {call}',
      '{brandDial} {call} hits',
      '{call} {brandDial} hits',
    ],
    positioning: [
      "{city}'s home for big hits",
      'non-stop hits all day',
      'your hit station',
      'big hits around the clock',
      'the sound of {city}',
      'hits first',
      'hit radio all day',
      'the hits you want',
      'music around the clock',
      'top hits for {city}',
      'chart hits all day',
    ],
  },
  rock: {
    legalStyle: [
      '{callLegal}, {freqWords}, {city} rock radio',
      '{call} {freqLegal}, stereo rock for {city}',
      '{city}: {call} {freqLegal}, album-oriented rock',
      '{call} {freqLegal}, {bandFlavor}, {city}',
      '{call} {freqLegal}, {local}',
    ],
    shortBrand: [
      '{callLegal} {brandDial}',
      '{callLegal} {brandDial}',
      '{brandDial} {call}',
      '{brandDial} {call}',
      '{brandDial} {call}, rock',
      '{brandDial} {call} rock',
      '{call} {brandDial} rock',
      '{brandDial} {call} rock radio',
    ],
    positioning: [
      "{city}'s home for rock",
      'real rock, real albums',
      'album rock all day',
      'turn it up',
      'rock around the clock',
      'the rock sound of {city}',
      'hard rock clear signal',
      'rock radio all day',
      'album cuts all day',
      'FM rock for {city}',
      'progressive rock {city}',
    ],
  },
  ac_easy: {
    legalStyle: [
      '{callLegal}, {freqWords}, beautiful music, {city}',
      '{call} {freqLegal}, easy listening, {city}',
      '{city}: {call} {freqLegal}, easy favorites',
      '{call} {freqLegal}, {bandFlavor}, easy {city}',
      '{call} {freqLegal}, serving {local}',
    ],
    shortBrand: [
      'Easy {brandDial} {call}',
      '{callLegal} {brandDial} easy',
      '{callLegal} {brandDial} easy',
      '{brandDial} {call}',
      '{brandDial} {call}',
      '{brandDial} {call}, easy listening',
      '{brandDial} {call} easy listening',
      '{call} {brandDial} easy listening',
    ],
    positioning: [
      'easy favorites all day',
      'beautiful music all day',
      'relaxing sound for {city}',
      'good music warm and clear',
      'easy listening for {city}',
      'soft favorites all day',
      'your easy music station',
      'gentle music all day',
      'beautiful music {city}',
      'stereo favorites all day',
      'easy sounds around the clock',
    ],
  },
  country: {
    legalStyle: [
      '{call}, {freqWords}, {city} country radio',
      '{call} {freqLegal}, country music, {city}',
      '{city}: {call} {freqLegal}, country broadcast',
      '{call} {freqLegal}, {bandFlavor}, {city}',
      '{call} {freqLegal}, serving {local}',
    ],
    shortBrand: [
      'Country {brandDial} {call}',
      '{call} {brandDial}',
      '{call} {brandDial}',
      '{call} {brandDial} country',
      '{brandDial} {call} country',
      '{brandDial} {call}, country',
      '{call} {brandDial} country',
    ],
    positioning: [
      'country you can count on',
      'home for country in {city}',
      'honest country all day',
      'your country station',
      'western music all day',
      'country radio for {city}',
      'down-home country hits',
      'the country sound of {city}',
      'country favorites all day',
    ],
  },
  news_talk: {
    legalStyle: [
      '{call}, {freqWords}, {city} news and information',
      '{call} {freqLegal}, news and talk, {city}',
      '{city}: {call} {freqLegal}, news-talk radio',
      '{call} {freqLegal}, {bandFlavor}, {city}',
      '{call} {freqLegal}, serving {local}',
    ],
    shortBrand: [
      'Newsradio {brandDial}',
      '{call} news {brandDial}',
      '{call} news {brandDial}',
      '{brandDial} {call} news',
      '{brandDial} {call} news',
      '{brandDial} {call}',
      '{call} {brandDial} news talk',
      '{call} {brandDial} news',
    ],
    positioning: [
      'news when it matters',
      "{city}'s news source",
      'information you can use',
      'weather and straight talk',
      'where {city} gets the news',
      'facts first on the dial',
      'news you need',
      'talk and reports all day',
      'your news station',
    ],
  },
  oldies_mor: {
    legalStyle: [
      '{call}, {freqWords}, {city} good music',
      '{call} {freqLegal}, standards and favorites, {city}',
      '{city}: {call} {freqLegal}, good music radio',
      '{call} {freqLegal}, {bandFlavor}, {city}',
      '{call} {freqLegal}, serving {local}',
    ],
    shortBrand: [
      '{call} {brandDial}',
      '{call} {brandDial}',
      '{brandDial} {call}',
      '{brandDial} {call}, good music',
      '{brandDial} {call} gold',
      '{call} {brandDial} good music',
      '{call} {brandDial} favorites',
    ],
    positioning: [
      'songs you know',
      'gold favorites all day',
      'yesterday and today',
      'great songs never fade',
      'good music for {city}',
      'standards all day',
      'memories on the radio',
      'the hits you grew up with',
      'timeless favorites',
    ],
  },
};

/** Famous / high-risk call signs to avoid outright (substring match, case-insensitive). */
const FORBIDDEN_CALL_SUBSTRINGS = [
  'WABC',
  'WCBS',
  'WINS',
  'WNEW',
  'WLS',
  'WLUP',
  'WCFL',
  'WYNY',
  'WEEI',
  'WGN',
  'WSB',
  'WBAP',
  'WHAS',
  'WTOP',
  'WJR',
  'WCCO',
  'KMOX',
  'WTAM',
  'WBT',
  'WRAL',
  'WPRO',
  'WBAL',
  'WHP',
  'KROQ',
  'KMET',
  'KHJ',
  'KFI',
  'KLOS',
  'KNX',
  'KFWB',
  'KCBS',
  'KYW',
  'WBZ',
  'WMMS',
  'WRKO',
  'KDAY',
  'KAAY',
  'KCBQ',
  'KRLA',
  'WOR',
  'WMAL',
  'WIP',
  'KABC',
  'KGO',
  'KDWB',
  'KQV',
  'WFIL',
  'WSM',
  'WWJ',
  'WXYZ',
  'WAKY',
];

/**
 * Red-flag phrases: normalized (lowercase, collapsed spaces).
 * Matches substring after normalization on full output strings.
 */
const RED_FLAG_PHRASES = [
  'musicradio',
  'music radio 77',
  'boss radio',
  'bossradio',
  'quixie in dixie',
  'the mighty met',
  'mighty met',
  'you give us 22 minutes',
  '22 minutes we give you',
  'make believe ballroom',
  'the big 89',
  'the big 68',
  'all news',
  'all-news 88',
  'fly jock',
  'the real don',
  // User-listed patterns
  'musicradio 77',
];

/** Modern/corporate words that read wrong in 1970s primary mode. */
const ERA_MODERN_WORDS = /\b(vibe|pulse|jamz|jams\b|podcast|streaming|tiktok|viral|dot com|\.com)\b/i;

const MODERN_NICKNAMES = /\b(the vibe|the pulse|star fm|now fm|mix fm)\b/i;

/** Optional nicknames — short list of plausible on-air handles; use sparingly. */
const NICKNAME_POOLS = {
  top40_chr: ['The Hot Channel', 'Hit Parade', 'Big Dial', 'City Beat', 'Top Shelf Radio'],
  rock: ['The Rock Line', 'Album Alley', 'Heavy Channel', 'Stereocast', 'The Loud Dial'],
  ac_easy: ['The Soft Spot', 'Easy Chair', 'Gentle Side', 'Stereo Haven', 'The Quiet Dial'],
  country: ['The Barn Door', 'Haystack', 'Front Porch', 'Dusty Boot', 'Rodeo Radio'],
  news_talk: ['City Desk', 'Morning Report', 'Metro Wire', 'Town Crier', 'Fact Line'],
  oldies_mor: ['Memory Lane', 'Gold Shelf', "Yesterday's Best", 'Song Chest', 'Standard Time'],
};

/** Reject nicknames that read synthetic or “marketing deck.” */
const WEAK_NICKNAME = /\b(velvet|slow glow|crown jewel|golden drawer|rewind loft|cranked|survey spot|request central|wire service|bulletin board)\b/i;

function isWeakNickname(name) {
  return !name || WEAK_NICKNAME.test(name);
}

const NICKNAME_BASE_CHANCE = 0.12;

/**
 * @returns {string} often empty — prefer no nickname over a weak one.
 */
function pickNickname(rand, formatKey, call, includeNickname) {
  if (!includeNickname || rand() >= NICKNAME_BASE_CHANCE) return '';
  const pool = [...NICKNAME_POOLS[formatKey]];
  shuffleInPlace(rand, pool);
  let nick = '';
  for (const candidate of pool) {
    if (!isWeakNickname(candidate)) {
      nick = candidate;
      break;
    }
  }
  if (!nick) return '';
  if (rand() < 0.04) {
    const phon = maybePhoneticNickname(rand, call, formatKey);
    if (phon) nick = `${nick} (${phon})`;
  }
  return nick;
}

const TONE_TAGS_BY_FORMAT = {
  top40_chr: ['high-energy', 'competitive', 'youth-leaning', 'chart-driven'],
  rock: ['tough', 'album-oriented', 'stereo-first', 'progressive-leaning'],
  ac_easy: ['warm', 'broad', 'daytime-friendly', 'lifestyle'],
  country: ['heritage', 'regional', 'plain-spoken', 'familiar'],
  news_talk: ['utility', 'credible', 'adult', 'information-first'],
  oldies_mor: ['nostalgic', 'comfort', 'broad-appeal', 'familiar-tunes'],
};

// --- Seeded PRNG (mulberry32) -------------------------------------------------

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function shuffleInPlace(rand, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- Call letters & frequencies ---------------------------------------------

const LETTER_BAG = 'ABCDEFGHJKLMNPRSTUVWXYZ'.split(''); // omit I,O,Q for readability on-air

function randomCallLetters(rand, prefix) {
  const a = pick(rand, LETTER_BAG);
  const b = pick(rand, LETTER_BAG);
  const c = pick(rand, LETTER_BAG);
  return `${prefix}${a}${b}${c}`;
}

function isForbiddenCall(call) {
  const u = String(call || '').toUpperCase();
  return FORBIDDEN_CALL_SUBSTRINGS.some((f) => u.includes(f));
}

/**
 * Generate a plausible 4-letter call (W/K + 3) not in the forbidden list.
 */
function generateCallLetters(rand, side) {
  const prefix = side === 'west' ? 'K' : 'W';
  for (let attempt = 0; attempt < 80; attempt++) {
    const c = randomCallLetters(rand, prefix);
    if (!isForbiddenCall(c)) return c;
  }
  return `${prefix}ZZZ`;
}

/**
 * 1970s: AM only 540–1600 (no extended band); FM commercial rivals 92.1–107.9 (skip sub-92 reserved/educational slice).
 * Later eras: AM to 1700; FM full 88.1–107.9.
 */
function resolveBandForEra(formatKey, rand, era) {
  const r = rand();
  if (era !== '1970s') {
    if (formatKey === 'news_talk') return r < 0.78 ? 'am' : 'fm';
    if (formatKey === 'country' || formatKey === 'oldies_mor') return r < 0.55 ? 'fm' : 'am';
    return r < 0.72 ? 'fm' : 'am';
  }
  switch (formatKey) {
    case 'news_talk':
      return r < 0.88 ? 'am' : 'fm';
    case 'top40_chr':
    case 'rock':
    case 'ac_easy':
      return r < 0.92 ? 'fm' : 'am';
    case 'country':
      return r < 0.55 ? 'fm' : 'am';
    case 'oldies_mor':
      return r < 0.5 ? 'fm' : 'am';
    default:
      return 'fm';
  }
}

/** @param {'fm'|'am'} band @param {BrandEra} [era='1970s'] */
function generateFrequency(rand, band, era = '1970s') {
  if (band === 'am') {
    const minK = 540;
    const maxK = era === '1970s' ? 1600 : 1700;
    const steps = Math.floor((maxK - minK) / 10) + 1;
    const khz = minK + Math.floor(rand() * steps) * 10;
    return {
      /** Human-facing label (no kHz/MHz); demo / brand evaluation. */
      display: String(khz),
      band: 'am',
      mhz: null,
      khz,
      dialPlan: era === '1970s' ? 'am-540-1600' : 'am-540-1700',
    };
  }
  const minMhz = era === '1970s' ? 92.1 : 88.1;
  const maxMhz = 107.9;
  const slotCount = Math.floor((maxMhz - minMhz) / 0.2) + 1;
  const idx = Math.floor(rand() * slotCount);
  const mhz = (minMhz + idx * 0.2).toFixed(1);
  return {
    display: `${mhz} FM`,
    band: 'fm',
    mhz,
    khz: null,
    dialPlan: era === '1970s' ? 'fm-commercial-92.1-107.9' : 'fm-88.1-107.9',
  };
}

/** Reject AM dial shorthand that is “valid” but not brandable on-air. */
function amShorthandSpeakable(khz, shorthandStr) {
  if (shorthandStr === String(khz)) return true;
  const n = parseInt(shorthandStr, 10);
  if (!Number.isFinite(n)) return false;
  if ([69, 666, 404, 911].includes(n)) return false;
  if (shorthandStr.length === 1 && khz >= 100) return false;
  if (khz === 800 && shorthandStr === '8') return false;
  if (khz === 900 && shorthandStr === '9') return false;
  if (khz === 700 && shorthandStr === '7') return false;
  return true;
}

/** Reject FM whole-number branding when the slot is “radio-unfriendly”. */
function fmWholeSpeakable(whole) {
  if ([69, 666, 404].includes(whole)) return false;
  return true;
}

/** Legal ID frequency text: exact channel, no “AM” on AM (dial cards often showed digits only). */
function legalFrequencyDisplayFromDetail(freqObj) {
  if (freqObj.band === 'am') {
    return String(freqObj.khz);
  }
  return `${freqObj.mhz} FM`;
}

/** @deprecated Use `legalFrequencyDisplayFromDetail`; kept for internal template alias. */
function frequencyToWords(freqObj) {
  return legalFrequencyDisplayFromDetail(freqObj);
}

/**
 * 1970s-style public dial branding vs technical/legal frequencies.
 * @param {object} opts
 * @param {Set<string>} [opts.usedFmRoundedInMarket] — whole-number FM dial keys (e.g. "94") to avoid duplicate rounded identities
 */
function computePublicDialBranding(freqObj, band, rand, opts = {}) {
  const notes = [];
  const usedFmSet = opts.usedFmRoundedInMarket;

  if (band === 'am' || freqObj.band === 'am') {
    const k = freqObj.khz;
    const legal = String(k);
    let brandDial = legal;
    let usedAmShorthand = false;

    const r = rand();
    const roundThousand = [1100, 1200, 1300, 1400, 1500];
    if (roundThousand.includes(k) && r < 0.2) {
      const cand = String(k / 100);
      if (amShorthandSpeakable(k, cand)) {
        brandDial = cand;
        usedAmShorthand = true;
        notes.push('AM round-thousand dial shortened (e.g. 1200→12) for analog-era branding');
      } else {
        notes.push('AM round-thousand shorthand skipped (speakability)');
      }
    } else if (k >= 1000 && k <= 1600 && k % 10 === 0 && !roundThousand.includes(k) && r < 0.48) {
      const cand = String(k / 10);
      if (amShorthandSpeakable(k, cand)) {
        brandDial = cand;
        usedAmShorthand = true;
        notes.push('AM four-digit dial dropped final zero (e.g. 1360→136)');
      } else {
        notes.push('AM four-digit shorthand skipped (speakability)');
      }
    } else if (k >= 540 && k < 1000 && k % 10 === 0 && r < 0.55) {
      const cand = String(k / 10);
      if (amShorthandSpeakable(k, cand)) {
        brandDial = cand;
        usedAmShorthand = true;
        notes.push('AM three-digit dial dropped final zero (e.g. 770→77)');
      } else {
        notes.push('AM three-digit shorthand skipped (speakability)');
      }
    } else {
      notes.push('Public dial uses full kHz figure (no trailing-zero shorthand)');
    }

    return {
      frequencyHuman: String(k),
      technicalFrequencyDisplay: `${k} kHz`,
      /** @deprecated use `technicalFrequencyDisplay` */
      actualFrequencyDisplay: `${k} kHz`,
      legalFrequencyDisplay: legal,
      publicBrandDial: brandDial,
      fmWhole: null,
      fmExactMhz: null,
      usedAmShorthand,
      usedFmRounding: false,
      fmRoundedCollisionAvoided: false,
      dialBrandingNotes: notes,
    };
  }

  const m = parseFloat(freqObj.mhz);
  const whole = Math.floor(m);
  const tenths = Math.round((m - whole) * 10);
  const legal = `${freqObj.mhz} FM`;
  const roundKey = String(whole);

  let brandDial;
  let usedFmRounding = false;
  let collisionAvoided = false;

  const wantRound = rand() < 0.48 && fmWholeSpeakable(whole);
  const blocked = Boolean(usedFmSet && usedFmSet.has(roundKey));
  if (wantRound && blocked) {
    collisionAvoided = true;
    notes.push('FM kept exact/less rounded dial to avoid collision with another station’s rounded position in market');
  }

  const doRound = wantRound && !blocked && fmWholeSpeakable(whole);

  if (doRound) {
    if (tenths !== 0) {
      usedFmRounding = true;
    }
    const style = rand();
    if (style < 0.42) {
      brandDial = `${whole} FM`;
    } else if (style < 0.72) {
      brandDial = `FM ${whole}`;
    } else if (style < 0.88) {
      brandDial = `Stereo ${whole}`;
    } else {
      brandDial = `${whole} stereo`;
    }
    if (usedFmSet) {
      usedFmSet.add(roundKey);
    }
    if (tenths !== 0) {
      notes.push(`FM public brand rounded to whole dial (${freqObj.mhz} MHz → ${brandDial})`);
    } else {
      notes.push('FM whole-number dial branding');
    }
  } else {
    brandDial = tenths ? `${freqObj.mhz} FM` : `${whole} FM`;
    if (!collisionAvoided) {
      notes.push('FM exact frequency in public brand (no whole-number rounding)');
    }
  }

  return {
    frequencyHuman: `${freqObj.mhz} FM`,
    technicalFrequencyDisplay: `${freqObj.mhz} MHz`,
    actualFrequencyDisplay: `${freqObj.mhz} MHz`,
    legalFrequencyDisplay: legal,
    publicBrandDial: brandDial,
    fmWhole: whole,
    fmExactMhz: freqObj.mhz,
    usedAmShorthand: false,
    usedFmRounding,
    fmRoundedCollisionAvoided: collisionAvoided,
    dialBrandingNotes: notes,
  };
}

/**
 * Hard reject obvious machine-format / unspeakable short brands (scoring handles the rest).
 * @param {'fm'|'am'} band
 */
function speakabilityHardReject(s, band, _formatKey) {
  const t = String(s || '').trim();
  if (!t) return true;
  const fmCount = (t.match(/\bFM\b/gi) || []).length;
  if (fmCount >= 2) return true;
  if (/-FM/i.test(t) && /\bFM\b/i.test(t)) return true;
  if (/FM\s+FM/i.test(t)) return true;
  const stereoCount = (t.match(/\bstereo\b/gi) || []).length;
  if (stereoCount >= 2) return true;
  if (/[WK][A-Z]{2,4}\s+news\s+\d+\s*$/i.test(t)) return true;
  if (/\bFM\b.*\bstereo\b|\bstereo\b.*\bFM\b/i.test(t)) return true;
  return false;
}

/** Major markets: stronger “heritage authority” weight for AM Radio [freq] patterns. */
const MAJOR_HERITAGE_MARKET_IDS = new Set(ALL_PLAYABLE_MARKET_IDS);

function isHeritageAmFormat(formatKey) {
  return (
    formatKey === 'news_talk' ||
    formatKey === 'oldies_mor' ||
    formatKey === 'country' ||
    formatKey === 'ac_easy'
  );
}

/**
 * Score a short on-air brand string (0–100). Higher = more human / chantable / clear.
 * @param {object} dial — result of `computePublicDialBranding`
 * @param {object} [opts]
 * @param {string} [opts.marketId]
 * @param {object} [opts.freqObj]
 */
function scoreShortBrandSyntax(s, formatKey, band, call, dial, opts = {}) {
  let sc = 52;
  const reasons = [];
  const t = String(s || '').trim();
  const wc = wordCount(t);
  const heritageAm = band === 'am' && isHeritageAmFormat(formatKey);
  const youthMusicAm = band === 'am' && (formatKey === 'top40_chr' || formatKey === 'rock');
  const majorHeritage = heritageAm && opts.marketId && MAJOR_HERITAGE_MARKET_IDS.has(opts.marketId);
  const amKhz = opts.freqObj && opts.freqObj.band === 'am' ? opts.freqObj.khz : null;

  if (band === 'am') {
    const hasRadioFreqBranding = /\bRadio\s+\d|\bNewsradio\s+\d/i.test(t);

    // 1970s authority: WSB Radio 75 / Radio 67 WPZD / Newsradio 67 (similar tier so dither + dedupe vary winners)
    if (/^[WK][A-Z]{2,4}\s+Radio\s+\d+$/i.test(t)) {
      sc += heritageAm ? 21 : youthMusicAm ? 8 : 14;
      reasons.push('call_radio_freq');
      if (heritageAm) {
        sc += 6;
        reasons.push('heritage_call_radio_authority');
      }
      if (majorHeritage) {
        sc += 5;
        reasons.push('major_market_heritage');
      }
    }
    if (/^Radio\s+\d+\s+[WK][A-Z]{2,4}$/i.test(t)) {
      sc += heritageAm ? 21 : youthMusicAm ? 8 : 12;
      reasons.push('radio_freq_call');
      if (heritageAm) {
        sc += 7;
        reasons.push('heritage_radio_then_call');
      }
      if (majorHeritage) {
        sc += 5;
        reasons.push('major_market_heritage');
      }
    }
    if (/^Newsradio\s+\d+$/i.test(t)) {
      sc += formatKey === 'news_talk' ? 22 : heritageAm ? 18 : 10;
      reasons.push('newsradio_dial');
      if (formatKey === 'news_talk') {
        sc += 7;
        reasons.push('newsradio_news_format');
      }
      if (heritageAm && formatKey !== 'news_talk') {
        sc += 4;
        reasons.push('newsradio_heritage_spoken_word');
      }
      if (majorHeritage) {
        sc += 5;
        reasons.push('major_market_heritage');
      }
      // Two-word ID: slight offset vs longer “Radio …” forms that hit speakable_length
      sc += 3;
      reasons.push('newsradio_compact_authority');
    }

    // Frequency-first news authority: 1200 WBYM news
    if (/^\d+\s+[WK][A-Z]{2,4}\s+news$/i.test(t)) {
      sc += 18;
      reasons.push('authority_digit_first_news');
      if (formatKey === 'news_talk') {
        sc += 8;
        reasons.push('news_talk_digit_first');
      }
    } else if (/^\d+\s+[WK][A-Z]{2,4}$/i.test(t)) {
      sc += 14;
      reasons.push('am_digit_first_clean');
    }

    // Round-hundred kHz often reads as “heritage dial” with Radio wording
    if (heritageAm && amKhz != null && amKhz % 100 === 0 && amKhz >= 600 && hasRadioFreqBranding) {
      sc += 6;
      reasons.push('heritage_round_hundred_dial');
    }

    if (/^[WK][A-Z]{2,4}\s+\d+$/i.test(t)) {
      sc -= 12;
      reasons.push('am_call_first_number_only');
    }
    if (/^[WK][A-Z]{2,4}\s+\d+\s+news$/i.test(t)) {
      sc -= 22;
      reasons.push('am_call_number_news_clunky');
    }
    if (/[WK][A-Z]{2,4}\s+news\s+\d+/i.test(t)) {
      sc -= 38;
      reasons.push('call_news_dial_split');
    }
    // Youth-oriented AM music: downweight “Radio [freq]” so it stays uncommon
    if (youthMusicAm && /\bRadio\b/i.test(t) && /\d/.test(t)) {
      sc -= 14;
      reasons.push('youth_am_radio_pattern_downweight');
    }

    // Deterministic spread so heritage patterns (CALL Radio / Radio dial CALL / Newsradio) don’t always tie-break the same way
    if (heritageAm) {
      let h = 0;
      for (let i = 0; i < t.length; i++) {
        h = (h * 31 + t.charCodeAt(i)) >>> 0;
      }
      sc += (h % 11) - 5;
      reasons.push('heritage_syntax_dither');
    }
  } else {
    if (/\bFM\b|\bStereo\b/i.test(t)) {
      sc += 9;
      reasons.push('fm_band_word');
    }
    if (/^\d+\s+FM\s+[WK]/i.test(t) || /^\d+\s+fm\s+[WK]/i.test(t)) {
      sc += 8;
      reasons.push('fm_digit_fm_call');
    }
    if (/^Stereo\s+\d+\s+[WK]/i.test(t)) {
      sc += 7;
      reasons.push('fm_stereo_first');
    }
    if (/^FM\s+\d+\s+[WK]/i.test(t)) {
      sc += 8;
      reasons.push('fm_fm_prefix');
    }
    if (/^[WK][A-Z]{2,4}-FM(\s|$)/i.test(t) && !/\bFM\b.*\bFM\b/i.test(t)) {
      sc += 5;
      reasons.push('fm_suffix_call');
    }
    if (/^[WK][A-Z]{2,4}\s+\d+\s+stereo$/i.test(t)) {
      sc -= 18;
      reasons.push('fm_call_number_stereo_tail');
    }
    if (/^[WK][A-Z]{2,4}\s+\d+\s+news/i.test(t)) {
      sc -= 25;
      reasons.push('fm_call_number_news');
    }
  }

  if (wc >= 3 && wc <= 5) {
    sc += 6;
    reasons.push('speakable_length');
  } else if (wc > 6) {
    sc -= (wc - 6) * 5;
    reasons.push('long_winded');
  }

  if (t.length <= 32) {
    sc += 4;
  } else {
    sc -= 8;
  }

  return { score: Math.max(0, Math.min(100, Math.round(sc))), reasons };
}

function pushDedupe(arr, item) {
  if (!arr.includes(item)) arr.push(item);
}

/**
 * Build competing short-brand wordings; `pickBestShortBrand` scores them.
 * AM heritage formats get a larger candidate set (incl. “Radio [frequency]” family).
 * @param {string} [_marketId] reserved for future market-weighted variety
 */
function buildShortBrandCandidates(formatKey, band, call, dial, freqObj, rand, _marketId) {
  const out = [];
  const r = rand;
  const n = dial.publicBrandDial;
  const w = dial.fmWhole != null ? dial.fmWhole : (freqObj.mhz ? Math.floor(parseFloat(freqObj.mhz)) : 0);
  const stereoInDial = /\bstereo\b/i.test(n);
  const fmInDial = /\bFM\b/i.test(n);
  const fmStarts = /^FM\s/i.test(n);

  const heritageAmFormat = isHeritageAmFormat(formatKey);
  const youthAmFormat = formatKey === 'top40_chr' || formatKey === 'rock';

  if (band === 'am') {
    const fullDial = String(freqObj.khz);
    const pushRadioFrequencySuite = () => {
      pushDedupe(out, `${call} Radio ${n}`);
      pushDedupe(out, `Radio ${n} ${call}`);
      pushDedupe(out, `Newsradio ${n}`);
      if (fullDial !== n) {
        pushDedupe(out, `${call} Radio ${fullDial}`);
        pushDedupe(out, `Radio ${fullDial} ${call}`);
        pushDedupe(out, `Newsradio ${fullDial}`);
      }
    };

    if (heritageAmFormat) {
      pushRadioFrequencySuite();
    } else if (youthAmFormat && r() < 0.5) {
      pushRadioFrequencySuite();
    }

    if (formatKey === 'news_talk') {
      pushDedupe(out, `${n} ${call} news`);
      if (r() < 0.12) {
        pushDedupe(out, `${call} news ${n}`);
      }
      if (r() < 0.18) {
        pushDedupe(out, `Radio ${call} ${n}`);
      }
    } else {
      pushDedupe(out, `${n} ${call}`);
      pushDedupe(out, `${call} ${n}`);
      if (formatKey === 'country' && r() < 0.35) {
        pushDedupe(out, `${n} ${call} country`);
      }
      if (formatKey === 'oldies_mor' && r() < 0.22) {
        pushDedupe(out, `Radio ${call} ${n}`);
      }
    }
  } else {
    pushDedupe(out, `${n} ${call}`);
    pushDedupe(out, `${call} ${n}`);
    if (!stereoInDial && r() < 0.42) {
      pushDedupe(out, `Stereo ${w} ${call}`);
    }
    if (!fmStarts && r() < 0.38) {
      pushDedupe(out, `FM ${w} ${call}`);
    }
    if (r() < 0.35) {
      pushDedupe(out, `${call}-FM ${w}`);
      pushDedupe(out, `${w} ${call}-FM`);
    }
    if (formatKey === 'ac_easy' && r() < 0.4) {
      pushDedupe(out, `Easy ${n} ${call}`);
      pushDedupe(out, `${n} ${call} easy`);
    }
    if (formatKey === 'rock' && r() < 0.35) {
      pushDedupe(out, `${n} ${call} rock`);
      pushDedupe(out, `${call} ${n} rock`);
    }
    if (formatKey === 'country' && r() < 0.35) {
      pushDedupe(out, `${n} ${call} country`);
    }
    if (formatKey === 'top40_chr' && r() < 0.25) {
      pushDedupe(out, `${n} ${call} hits`);
    }
    if (!fmInDial && !stereoInDial && r() < 0.2) {
      pushDedupe(out, `${w} stereo ${call}`);
    }
  }

  return out;
}

function pickBestShortBrand(opts) {
  const { formatKey, band, call, dial, freqObj, rand, usedShortBrands, marketId } = opts;
  const raw = buildShortBrandCandidates(formatKey, band, call, dial, freqObj, rand, marketId);
  const scoreOpts = { marketId, freqObj };
  const scored = [];
  for (const s of raw) {
    if (speakabilityHardReject(s, band, formatKey)) continue;
    const { score, reasons } = scoreShortBrandSyntax(s, formatKey, band, call, dial, scoreOpts);
    scored.push({ s, score, reasons });
  }
  scored.sort((a, b) => b.score - a.score);

  const fallback =
    band === 'am' ? `${dial.publicBrandDial} ${call}` : `${dial.publicBrandDial} ${call}`;
  if (!scored.length) {
    const fp = lineFingerprint(fallback);
    if (usedShortBrands) usedShortBrands.add(fp);
    return {
      text: fallback,
      score: 35,
      reasons: ['fallback_no_candidates'],
      syntaxReasons: [],
      candidateCount: 0,
    };
  }

  for (const row of scored) {
    const fp = lineFingerprint(row.s);
    if (!usedShortBrands || !usedShortBrands.has(fp)) {
      if (usedShortBrands) usedShortBrands.add(fp);
      return {
        text: row.s,
        score: row.score,
        reasons: row.reasons,
        syntaxReasons: row.reasons,
        candidateCount: scored.length,
      };
    }
  }
  const best = scored[0];
  const fp = lineFingerprint(best.s);
  if (usedShortBrands) usedShortBrands.add(fp);
  return {
    text: best.s,
    score: best.score,
    reasons: best.reasons,
    syntaxReasons: best.reasons,
    candidateCount: scored.length,
  };
}

// --- Template fill ------------------------------------------------------------

function applyTemplate(str, ctx) {
  return str.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] !== undefined ? ctx[k] : `{${k}}`));
}

function lineFingerprint(s) {
  return normalizeSafetyText(s).slice(0, 160);
}

/**
 * Prefer a template whose filled string is not already in `usedSet` (normalized fingerprint).
 */
function pickTemplateDeduped(rand, templateList, ctx, usedSet) {
  if (!usedSet) return pick(rand, templateList);
  const shuffled = shuffleInPlace(rand, [...templateList]);
  for (const t of shuffled) {
    const applied = applyTemplate(t, ctx);
    const fp = lineFingerprint(applied);
    if (!usedSet.has(fp)) {
      usedSet.add(fp);
      return t;
    }
  }
  const t = shuffled[0];
  usedSet.add(lineFingerprint(applyTemplate(t, ctx)));
  return t;
}

/** AM music/talk brands should not borrow FM stereo sell-copy. */
function isAmIncompatibleTemplate(templateStr) {
  const l = templateStr.toLowerCase();
  if (
    l.includes('fm stereo') ||
    l.includes('wide fm') ||
    l.includes('fm built') ||
    l.includes('full stereo fm') ||
    l.includes('two-channel') ||
    l.includes('fm dial') ||
    l.includes('quiet fm') ||
    l.includes('album fm') ||
    l.includes('soft fm') ||
    l.includes('stereo fm') ||
    l.includes('stereo rock') ||
    l.includes('stereo favorites') ||
    l.includes('stereo without') ||
    l.includes('fm album') ||
    l.includes('turntable favorites in stereo')
  ) {
    return true;
  }
  return false;
}

function bandAwareTemplates(formatKey, band) {
  const raw = BRAND_TEMPLATES[formatKey];
  if (band === 'fm') return raw;
  const filterArr = (arr) => {
    const f = arr.filter((t) => !isAmIncompatibleTemplate(t));
    return f.length ? f : arr;
  };
  return {
    legalStyle: filterArr(raw.legalStyle),
    shortBrand: filterArr(raw.shortBrand),
    positioning: filterArr(raw.positioning),
  };
}

/**
 * Rare phonetic nickname: only if middle letters suggest a clean two-letter shorthand.
 */
function maybePhoneticNickname(rand, call, formatKey) {
  if (rand() > 0.07) return '';
  const letters = call.slice(1, 4);
  if (/^[AEIOU]/.test(letters)) return '';
  const pair = letters.slice(0, 2);
  if (pair[0] === pair[1]) return '';
  return `"${pair}" on the dial`;
}

// --- Safety ------------------------------------------------------------------

function normalizeSafetyText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns issues; empty array means pass (or only warnings).
 * @param {object} parts — strings to scan together
 * @param {BrandEra} era
 */
function redFlagScan(parts, era = '1970s') {
  const combined = normalizeSafetyText(Object.values(parts).join(' '));
  const issues = [];

  for (const phrase of RED_FLAG_PHRASES) {
    const p = normalizeSafetyText(phrase);
    if (p.length >= 4 && combined.includes(p)) {
      issues.push({ type: 'phrase', detail: `Contains blocked phrase pattern: "${phrase}"` });
    }
  }

  if (ERA_MODERN_WORDS.test(combined) && era === '1970s') {
    issues.push({ type: 'modern', detail: 'Contains wording that reads post-1970s for primary era' });
  }
  if (MODERN_NICKNAMES.test(combined)) {
    issues.push({ type: 'modern_nick', detail: 'Nickname pattern too close to late-era branding clichés' });
  }

  // Call + infamous combo heuristics (not exhaustive; blocks obvious evocations)
  const call = (parts.callLetters || '').toUpperCase();
  if (call.startsWith('W') && combined.includes('musicradio') && combined.includes('77')) {
    issues.push({ type: 'combo', detail: 'W + musicradio + 77 evokes a famous identity' });
  }

  return issues;
}

/**
 * @returns {{ ok: boolean, issues: object[], rewriteHints: string[] }}
 */
function runRedFlagFilter(brandRecord, era = '1970s') {
  const parts = {
    legal: brandRecord.fullLegalBrand,
    short: brandRecord.publicShortBrand,
    nick: brandRecord.nickname || '',
    line: brandRecord.positioningLine,
    callLetters: brandRecord.callLetters,
  };
  const issues = redFlagScan(parts, era);
  return {
    ok: issues.length === 0,
    issues,
    rewriteHints: issues.length
      ? ['Swap positioning line from template pool', 'Regenerate call letters', 'Remove optional nickname', 'Pick alternate frequency wording']
      : [],
  };
}

// --- Scoring (0–100 heuristics) -----------------------------------------------

function scoreWordSmoothness(s) {
  const t = normalizeSafetyText(s);
  const words = t.split(' ').filter(Boolean);
  if (words.length < 3) return 55;
  let score = 70;
  const vowelStart = words.filter((w) => /^[aeiou]/i.test(w)).length;
  score += Math.min(15, vowelStart * 3);
  if (/[^a-z]{3,}/i.test(s)) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function wordCount(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Penalize overwritten, ad-copy, or strained phrasing. */
const OVERWRITTEN_MARKERS =
  /\b(wired into|babysitting|survey-friendly|whole house|mom-and-dad|mainstream dial|underground heart|wired up|synergy|leverage)\b/i;

function scoreRestraint(brandRecord) {
  const line = brandRecord.positioningLine || '';
  const short = brandRecord.publicShortBrand || '';
  const wc = wordCount(line);
  const shortLen = short.length;
  let r = 72;
  const reasons = [];

  if (wc >= 3 && wc <= 7) {
    r += 14;
    reasons.push('positioning_in_sweet_spot');
  } else if (wc === 8) {
    r += 4;
  } else if (wc > 8) {
    r -= Math.min(28, (wc - 8) * 7);
    reasons.push('positioning_too_long');
  } else if (wc < 3) {
    r -= 8;
  }

  if (shortLen <= 28) {
    r += 10;
    reasons.push('short_brand_tight');
  } else if (shortLen <= 40) {
    r += 4;
  } else {
    r -= Math.min(22, Math.floor((shortLen - 40) / 4));
    reasons.push('short_brand_long');
  }

  const commas = (line.match(/,/g) || []).length;
  if (commas >= 2) {
    r -= 10;
    reasons.push('stacked_commas');
  }

  if (OVERWRITTEN_MARKERS.test(`${line} ${short}`)) {
    r -= 18;
    reasons.push('overwritten_tone');
  }

  if (!brandRecord.nickname) {
    r += 6;
    reasons.push('no_nickname_restraint');
  }

  return { restraint: Math.max(0, Math.min(100, r)), reasons };
}

/** 1970s dial-card realism: AM shorthand, FM rounding, avoid technical suffixes on-air. */
function scoreDialPresentation(record) {
  const short = record.publicShortBrand || '';
  const d = record.dialBranding || {};
  let s = 70;
  const reasons = [];

  if (record.band === 'am' && /\bAM\b|\bkHz\b|\bMHz\b/i.test(short)) {
    s -= 14;
    reasons.push('penalty_public_AM_or_engineering_units');
  }
  if (record.band === 'fm' && /\bMHz\b|\bkHz\b/i.test(short)) {
    s -= 12;
    reasons.push('penalty_public_engineering_units');
  }
  if (d.usedAmShorthand) {
    s += 11;
    reasons.push('bonus_era_am_dial_shorthand');
  }
  if (d.usedFmRounding) {
    s += 9;
    reasons.push('bonus_era_fm_whole_dial');
  }
  if (d.fmRoundedCollisionAvoided) {
    s += 7;
    reasons.push('bonus_fm_collision_avoided');
  }
  if (record.band === 'fm' && /\bFM\b|Stereo|stereo/i.test(short)) {
    s += 6;
    reasons.push('bonus_fm_stereo_identity');
  }
  const syn = record.dialBranding?.shortBrandSyntax;
  if (syn && typeof syn.score === 'number') {
    if (syn.score >= 74) {
      s += 10;
      reasons.push('bonus_short_brand_syntax');
    } else if (syn.score >= 62) {
      s += 4;
    }
  }
  if (wordCount(short) <= 5 && short.length <= 32) {
    s += 5;
    reasons.push('bonus_speakable_short_brand');
  }

  return { dial: Math.max(0, Math.min(100, s)), reasons };
}

/**
 * @returns {{ historicalPlausibility, memorability, originality, phoneticSmoothness, legalSafety, restraint, restraintReasons, dialAuthenticity, dialReasons, overall }}
 */
function scoreBrand(brandRecord, redResult, era = '1970s') {
  const line = brandRecord.positioningLine || '';
  const wc = wordCount(line);

  let historical = era === '1970s' ? 85 : 75;
  if (ERA_MODERN_WORDS.test(line)) historical -= 25;

  let memorability = 58;
  if (wc >= 3 && wc <= 7) memorability += 16;
  else if (wc <= 8) memorability += 8;
  const words = line.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  const allit = words.some(
    (w, i) => i > 0 && w[0] && words[i - 1][0] && w[0] === words[i - 1][0],
  );
  if (allit) memorability += 8;

  const originality = redResult.ok ? 78 : 40;

  const phoneticSmoothness = scoreWordSmoothness(
    `${brandRecord.publicShortBrand} ${brandRecord.positioningLine}`,
  );

  const legalSafety = redResult.ok ? 92 : 45;

  const { restraint, reasons: restraintReasons } = scoreRestraint(brandRecord);
  const { dial: dialAuthenticity, reasons: dialReasons } = scoreDialPresentation(brandRecord);

  const overall = Math.round(
    historical * 0.18 +
      memorability * 0.14 +
      originality * 0.14 +
      phoneticSmoothness * 0.12 +
      legalSafety * 0.1 +
      restraint * 0.18 +
      dialAuthenticity * 0.14,
  );

  return {
    historicalPlausibility: Math.round(historical),
    memorability: Math.round(memorability),
    originality: Math.round(originality),
    phoneticSmoothness: Math.round(phoneticSmoothness),
    legalSafety: Math.round(legalSafety),
    restraint: Math.round(restraint),
    restraintReasons,
    dialAuthenticity: Math.round(dialAuthenticity),
    dialReasons,
    overall,
  };
}

// --- Main generator -----------------------------------------------------------

/**
 * @param {object} opts
 * @param {keyof typeof MARKETS} opts.marketId
 * @param {RivalFormatKey} opts.format
 * @param {number} [opts.seed]
 * @param {'fm'|'am'} [opts.band] — if omitted, band follows era + format heuristics (1970s: news/talk → AM-heavy, music → FM-heavy)
 * @param {BrandEra} [opts.era='1970s']
 * @param {boolean} [opts.includeNickname=true]
 * @param {string} [opts.localHook] — override local phrase (else random from market hooks)
 * @param {Set<string>} [opts.usedPositioningLines] — normalized fingerprints; avoids repeat liners in a batch
 * @param {Set<string>} [opts.usedShortBrands]
 * @param {Set<string>} [opts.usedLegalStyles]
 * @param {Set<string>} [opts.usedFmRoundedInMarket] — whole-number FM dial keys consumed for rounded public brands (collision avoidance within a market)
 */
function generateRivalStationBrand(opts) {
  const marketId = opts.marketId || 'chicago';
  const market = MARKETS[marketId];
  if (!market) throw new Error(`Unknown marketId: ${marketId}`);

  const formatKey = opts.format || 'top40_chr';
  if (!BRAND_TEMPLATES[formatKey]) throw new Error(`Unknown format: ${formatKey}`);

  const seed = Number.isFinite(opts.seed) ? opts.seed : Date.now() % 2147483647;
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const era = opts.era || '1970s';
  const includeNickname = opts.includeNickname !== false;

  const band =
    opts.band === 'am' || opts.band === 'fm' ? opts.band : resolveBandForEra(formatKey, rand, era);
  let templates = bandAwareTemplates(formatKey, band);
  templates = mergeSeattleBrandTemplateExtras(marketId, formatKey, band, templates);

  const side = market.side;
  const call = generateCallLetters(rand, side);
  const freqObj = generateFrequency(rand, band, era);
  const city = market.cityLabel;

  const dial = computePublicDialBranding(freqObj, band, rand, {
    usedFmRoundedInMarket: opts.usedFmRoundedInMarket,
  });
  const freqLegal = dial.legalFrequencyDisplay;
  const brandDial = dial.publicBrandDial;
  const freqWords = freqLegal;

  const callLegal = band === 'fm' ? `${call}-FM` : call;

  const localSource = market.localHooks || DEFAULT_LOCAL_HOOKS;
  const local = opts.localHook || pick(rand, localSource);
  const bandFlavor = band === 'fm' ? pick(rand, FM_BAND_FLAVOR) : pick(rand, AM_BAND_FLAVOR);
  const dialShout =
    freqObj.band === 'fm' && freqObj.mhz
      ? freqObj.mhz.replace('.', '-')
      : String(freqObj.khz != null ? freqObj.khz : '');

  const nickname = pickNickname(rand, formatKey, call, includeNickname);

  const ctx = {
    call,
    callLegal,
    freq: brandDial,
    brandDial,
    freqLegal,
    freqWords,
    freqActual: dial.technicalFrequencyDisplay,
    city,
    nick: nickname,
    local,
    bandFlavor,
    dialShout,
  };

  const legalStyle = pickTemplateDeduped(rand, templates.legalStyle, ctx, opts.usedLegalStyles);
  const shortPick = pickBestShortBrand({
    formatKey,
    band,
    call,
    dial,
    freqObj,
    rand,
    usedShortBrands: opts.usedShortBrands,
    marketId,
  });
  let positioning = pickTemplateDeduped(rand, templates.positioning, ctx, opts.usedPositioningLines);

  let fullLegalBrand = applyTemplate(legalStyle, ctx);
  let publicShortBrand = shortPick.text;
  let positioningLine = applyTemplate(positioning, ctx);

  const record = {
    market: market.displayName,
    marketId,
    format: formatKey,
    band,
    callLetters: call,
    /** FM: `CALL-FM`; AM: same as `callLetters` (no `-FM` suffix). */
    legalCallSign: callLegal,
    /** Human dial label for demos (AM digits only; FM like `94.7 FM`). */
    frequency: dial.frequencyHuman,
    /** Engineering-style dial (kHz / MHz) for internal metadata. */
    technicalFrequencyDisplay: dial.technicalFrequencyDisplay,
    frequencyDetail: freqObj,
    legalFrequencyDisplay: dial.legalFrequencyDisplay,
    publicBrandDial: dial.publicBrandDial,
    dialBranding: {
      usedAmShorthand: dial.usedAmShorthand,
      usedFmRounding: dial.usedFmRounding,
      fmRoundedCollisionAvoided: dial.fmRoundedCollisionAvoided,
      notes: dial.dialBrandingNotes,
      shortBrandSyntax: {
        score: shortPick.score,
        candidateCount: shortPick.candidateCount,
        reasons: shortPick.syntaxReasons || [],
      },
    },
    dialPlan: freqObj.dialPlan,
    fullLegalBrand,
    publicShortBrand,
    nickname: nickname || undefined,
    positioningLine,
    localHook: local,
    toneTags: TONE_TAGS_BY_FORMAT[formatKey],
    era,
    safetyNote:
      'Generated original composite text for simulation; not copied from any known real station slogan, jingle, or trademarked identity.',
  };

  let red = runRedFlagFilter(record, era);
  let scores = scoreBrand(record, red, era);

  // Auto-rewrite once if failed (random pick — may duplicate a batch fingerprint)
  if (!red.ok) {
    positioning = pick(rand, templates.positioning);
    positioningLine = applyTemplate(positioning, ctx);
    record.positioningLine = positioningLine;
    red = runRedFlagFilter(record, era);
    scores = scoreBrand(record, red, era);
  }

  record.redFlag = red;
  record.scores = scores;

  return record;
}

/**
 * Deterministic batch: `count` brands per format for QA tables.
 * @param {number} count default 20
 */
function generateFormatSampleGrid(count = 20) {
  /** @type {RivalFormatKey[]} */
  const formats = ['top40_chr', 'rock', 'ac_easy', 'country', 'news_talk', 'oldies_mor'];
  const usedFmRoundedInMarket = new Set();
  const out = {};
  for (const f of formats) {
    const usedPositioningLines = new Set();
    const usedShortBrands = new Set();
    const usedLegalStyles = new Set();
    out[f] = [];
    for (let i = 0; i < count; i++) {
      const seed = 10000 + f.length * 997 + i * 1315423911;
      out[f].push(
        generateRivalStationBrand({
          marketId: 'chicago',
          format: f,
          seed,
          usedPositioningLines,
          usedShortBrands,
          usedLegalStyles,
          usedFmRoundedInMarket,
        }),
      );
    }
  }
  return out;
}

/**
 * Several formats per major market — W/K rule comes from `MARKETS[marketId].side`.
 * Seeds are fixed for stable demo output in tests/scripts.
 */
function generateMultiMarketSamples() {
  const plan = {
    newyork: ['top40_chr', 'rock', 'news_talk'],
    chicago: ['ac_easy', 'country', 'oldies_mor'],
    atlanta: ['top40_chr', 'country', 'news_talk'],
    nashville: ['country', 'oldies_mor', 'ac_easy'],
    losangeles: ['rock', 'top40_chr', 'ac_easy'],
    seattle: ['rock', 'news_talk', 'ac_easy'],
  };
  let seed = 70001;
  const out = {};
  for (const [mid, formats] of Object.entries(plan)) {
    const usedPositioningLines = new Set();
    const usedShortBrands = new Set();
    const usedLegalStyles = new Set();
    const usedFmRoundedInMarket = new Set();
    out[mid] = formats.map((fmt) =>
      generateRivalStationBrand({
        marketId: mid,
        format: fmt,
        seed: seed++,
        usedPositioningLines,
        usedShortBrands,
        usedLegalStyles,
        usedFmRoundedInMarket,
      }),
    );
  }
  return out;
}

/**
 * Re-seed until `runRedFlagFilter` passes (or `maxAttempts` reached).
 * Use when you must guarantee `redFlag.ok` for a given market/format.
 */
function generateUntilSafe(opts, maxAttempts = 12) {
  const base = Number.isFinite(opts.seed) ? opts.seed : 1;
  let last;
  for (let i = 0; i < maxAttempts; i++) {
    last = generateRivalStationBrand({ ...opts, seed: base + i * 7919 });
    if (last.redFlag.ok) return { record: last, attempts: i + 1, accepted: true };
  }
  return { record: last, attempts: maxAttempts, accepted: false };
}

module.exports = {
  MARKETS,
  DEFAULT_LOCAL_HOOKS,
  VOCABULARY_BANKS,
  FM_BAND_FLAVOR,
  AM_BAND_FLAVOR,
  BRAND_TEMPLATES,
  RED_FLAG_PHRASES,
  FORBIDDEN_CALL_SUBSTRINGS,
  generateRivalStationBrand,
  runRedFlagFilter,
  redFlagScan,
  scoreBrand,
  pickTemplateDeduped,
  generateFormatSampleGrid,
  generateMultiMarketSamples,
  generateUntilSafe,
  frequencyToWords,
  resolveBandForEra,
  generateFrequency,
  computePublicDialBranding,
  legalFrequencyDisplayFromDetail,
  scoreShortBrandSyntax,
  speakabilityHardReject,
  buildShortBrandCandidates,
  pickBestShortBrand,
  scoreRestraint,
  scoreDialPresentation,
  wordCount,
  amShorthandSpeakable,
  isHeritageAmFormat,
  MAJOR_HERITAGE_MARKET_IDS,
  // Extension: pass `opts.era` (`1980s`+) to relax `ERA_MODERN_WORDS` or swap template pools later.
};
