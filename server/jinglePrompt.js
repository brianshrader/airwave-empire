'use strict';

/**
 * ShortAPI Suno v5.5 custom mode:
 * - `lyrics` = on-air words only (tagline once, then brand; spoken formats add calls/dial only when not redundant).
 * - **Music formats:** prompts ask for **sung tagline and sung brand** (melodic vocal for all lyric lines).
 * - **News/talk-style formats:** VO / announcer delivery (not sung).
 * - `tags` = era + imaging focus + delivery — kept short (~1k cap); positive phrasing beats long “do not” lists.
 *
 * **Call letters** from the station record are **not** merged in as an extra lyric line. Only `tagline` + `brand`
 * text go to `lyrics`. Spaced-letter *tags* are added only when that call sign’s letters appear as a run in `brand`.
 *
 * **Brand is the source of truth:** lyrics follow the player’s `brand` string. Numerals are verbalized for singing:
 * full dial in text (e.g. `96.1` → words), and letter+dial forms like `Q96` → `Q ninety six` using the station frequency’s MHz/kHz integer.
 */

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/**
 * @param {number} n 0–99
 */
function spellUnder100(n) {
  const x = Math.floor(Math.abs(n));
  if (x < 10) return DIGIT_WORDS[x];
  if (x < 20) {
    const teens = [
      'ten',
      'eleven',
      'twelve',
      'thirteen',
      'fourteen',
      'fifteen',
      'sixteen',
      'seventeen',
      'eighteen',
      'nineteen',
    ];
    return teens[x - 10];
  }
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const t = Math.floor(x / 10);
  const o = x % 10;
  if (o === 0) return tens[t];
  return `${tens[t]} ${DIGIT_WORDS[o]}`;
}

/** AM kHz as announcer would say it (context hint for tags only). */
function amKhzToRadioVerbal(khz) {
  const n = Math.round(Number(khz));
  if (!Number.isFinite(n) || n <= 0) return '';
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo === 0) return `${spellUnder100(hi)} hundred`;
  return `${spellUnder100(hi)} ${spellUnder100(lo)}`;
}

/** FM MHz integer part only, as spoken words (e.g. 96 → ninety six; 101+ → one oh one). */
function fmMhzIntPartStringToWords(intPart) {
  if (!intPart) return '';
  const intNum = parseInt(intPart, 10);
  if (!Number.isFinite(intNum)) return intPart;
  if (intNum === 100) return 'one hundred';
  // 101 MHz and up: US FM “one oh four” digit style. Below that: ninety eight, ninety nine, one hundred.
  if (intPart.length === 3 && intPart[0] === '1' && intNum >= 101) {
    return intPart
      .split('')
      .map((d) => DIGIT_WORDS[parseInt(d, 10)])
      .join(' ')
      .replace(/\bzero\b/g, 'oh');
  }
  if (intPart.length <= 2) {
    return spellUnder100(intNum);
  }
  return intPart
    .split('')
    .map((d) => DIGIT_WORDS[parseInt(d, 10)])
    .join(' ')
    .replace(/\bzero\b/g, 'oh');
}

/** FM MHz as announcer would say it (tags only). */
function fmMhzToRadioVerbal(freqStr) {
  const s = String(freqStr || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/FM$/i, '');
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return '';
  const intPart = m[1];
  const decPart = m[2] || '';
  const intWords = fmMhzIntPartStringToWords(intPart);
  if (!decPart) return intWords;
  const decWords = decPart
    .split('')
    .map((d) => DIGIT_WORDS[parseInt(d, 10)])
    .join(' ');
  return `${intWords} point ${decWords}`;
}

function dialVerbalForTags(frequency, band) {
  const b = String(band || '').toUpperCase();
  const f = String(frequency || '').trim();
  if (!f) return '';
  if (b === 'FM' || f.includes('.')) return fmMhzToRadioVerbal(f);
  const k = parseInt(f.replace(/\D/g, ''), 10);
  return amKhzToRadioVerbal(k);
}

/**
 * Replace raw dial digits in singable text with the same words we use in tags.
 * Models often misread "103.5" as "one hundred three five" if left as numerals in lyrics.
 */
/** e.g. KNWN → "K N W N" for tags / lyrics hints (Suno reads letter clusters poorly). */
function spacedCallLettersForSuno(callLetters) {
  const base = String(callLetters || '')
    .replace(/-?(AM|FM)$/i, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  if (base.length < 3 || base.length > 6) return '';
  return base.split('').join(' ');
}

/** Letters-only call base appears in brand — only then add call-letter cues (lyrics are brand + tagline only). */
function callLettersAppearInBrand(brand, callLetters) {
  const base = String(callLetters || '')
    .replace(/-?(AM|FM)$/i, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  if (base.length < 3) return false;
  const b = String(brand || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  return b.includes(base);
}

/** True if dial is already spoken in brand line (skip extra “You’re listening at …” line). */
function dialHintRedundantWithBrand(brandLyrics, dialHint) {
  const b = String(brandLyrics || '').toLowerCase();
  const d = String(dialHint || '').trim().toLowerCase();
  if (!b || !d) return false;
  if (b.includes(d)) return true;
  const parts = d.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every((w) => b.includes(w));
}

function verbalizeDialInText(text, frequency, band) {
  const dialWords = dialVerbalForTags(frequency, band);
  if (!dialWords || text == null || String(text).trim() === '') return String(text);
  const compact = String(frequency)
    .trim()
    .replace(/\s/g, '')
    .replace(/(AM|FM)$/i, '');
  if (!compact || !/\d/.test(compact)) return String(text);
  const dot = compact.indexOf('.');
  let pattern;
  if (dot >= 0) {
    const intP = compact.slice(0, dot);
    const decP = compact.slice(dot + 1);
    if (!intP || decP === undefined) return String(text);
    const i = intP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const d = String(decP).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(`${i}\\s*\\.\\s*${d}`, 'gi');
  } else {
    pattern = new RegExp(compact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  }
  return String(text).replace(pattern, (match, offset, str) => {
    const before = offset > 0 ? str[offset - 1] : '';
    const pad = before && /[A-Za-z0-9]/.test(before) ? ' ' : '';
    return pad + dialWords;
  });
}

/**
 * `{digits}` + `{words}` from station frequency for embedding in brand (e.g. Q96 → ninety six on FM 96.1).
 */
function dialIntegerDigitsAndWordsForBrand(frequency, band) {
  const b = String(band || '').toUpperCase();
  const f = String(frequency || '').trim();
  if (!f || !/\d/.test(f)) return null;
  const compact = f.replace(/\s/g, '').replace(/(AM|FM)$/i, '');
  if (!compact) return null;
  if (b === 'FM' || f.includes('.')) {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(compact);
    if (!m) return null;
    const intPart = m[1];
    return { digits: intPart, words: fmMhzIntPartStringToWords(intPart) };
  }
  const k = parseInt(compact.replace(/\D/g, ''), 10);
  if (!Number.isFinite(k) || k <= 0) return null;
  return { digits: String(k), words: amKhzToRadioVerbal(k) };
}

/**
 * After full-dial replacement: `Q96` / `Z100` style (letter + dial integer) → `Q ninety six` using station frequency.
 */
function verbalizeLetterPlusDialDigits(text, frequency, band) {
  const info = dialIntegerDigitsAndWordsForBrand(frequency, band);
  if (!info || !info.digits || !info.words) return String(text);
  const { digits, words } = info;
  if (digits.length < 1) return String(text);
  const escaped = digits.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`([A-Za-z])(${escaped})(?![0-9])`, 'g');
  return String(text).replace(re, (_m, letter) => `${letter} ${words}`);
}

/**
 * Isolated 10–99 in brand lines → tens words (“seventy six”) so singers don’t read digit-by-digit.
 * Skips “40” in “Top 40” (format name, not a dial).
 */
function verbalizeIsolatedTwoDigitBrandNumbers(text) {
  if (text == null || String(text).trim() === '') return String(text);
  const str = String(text);
  return str.replace(/\b([1-9][0-9])\b/g, (m) => {
    if (m === '40' && /\btop\s*40\b/i.test(str)) return m;
    const n = parseInt(m, 10);
    if (n < 10 || n > 99) return m;
    return spellUnder100(n);
  });
}

/**
 * If the station call letters appear as a word in the player’s line, expand to letter-by-letter
 * (e.g. `WWHS` → `W W H S`) so TTS/sung models don’t read them as a nonsense word like “Wesh”.
 */
function spellCallLettersInBrandForLyrics(brandLyrics, callLetters) {
  const spaced = spacedCallLettersForSuno(callLetters);
  if (!spaced) return brandLyrics;
  const base = String(callLetters || '')
    .replace(/-?(AM|FM)$/i, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  if (base.length < 3 || base.length > 6) return brandLyrics;
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = String(brandLyrics);
  out = out.replace(new RegExp(`\\b${esc}-(AM|FM)\\b`, 'gi'), (_m, suf) => `${spaced} ${String(suf).toUpperCase()}`);
  out = out.replace(new RegExp(`\\b${esc}\\b`, 'gi'), spaced);
  return out;
}

/** Brand string for jingle lyrics: player text only, with dial numerals verbalized for singing. */
function brandTextForJingleLyrics(brand, frequency, band, callLetters) {
  let t = verbalizeDialInText(brand, frequency, band);
  t = verbalizeLetterPlusDialDigits(t, frequency, band);
  t = verbalizeIsolatedTwoDigitBrandNumbers(t);
  t = verbalizeLosAngelesAbbrevInLyrics(t);
  if (callLetters) t = spellCallLettersInBrandForLyrics(t, callLetters);
  return t;
}

/** Short sonic anchors — dry booth language; avoid lift/stacks/choir/arena priors (Suno maps them to crowd tails). */
const FORMAT_SUNO = {
  TOP40: 'bright CHR pop, dry vocal',
  NEWS_TALK: 'authoritative news-talk booth',
  SPORTS_TALK: 'sports imaging, dry VO booth',
  PERSONALITY_TALK: 'FM talk-show booth, dry VO bed',
  ALL_NEWS: 'urgent credible network sting',
  COUNTRY: 'warm twang, acoustic guitar',
  ALBUM_ROCK: 'AOR guitars, dry room',
  CLASSIC_ROCK: 'classic-rock guitar sting',
  ALT_ROCK: 'alt-rock grit, dry vocal',
  AAA: 'adult melodic guitar, tasteful vocal',
  MOR: 'smooth MOR glide',
  OLDIES: 'gold-era vocal hook',
  ADULT_CONTEMP: 'warm AC vocal, soft bed',
  HOT_AC: 'rhythmic adult pop, dry vocal',
  URBAN_CONTEMP: 'urban rhythmic pop, close-mic',
  RHYTHMIC: 'rhythm-pop groove, dry vocal',
  SOUL_RNB: 'R&B groove, solo vocal',
  SPANISH: 'Latin-radio rhythm, dry vocal',
  GOSPEL: 'solo gospel vocal, organ pad',
  CLASSIC_HITS: 'classic hits vocal hook',
  BEAUTIFUL_MUSIC: 'soft beds, orchestral pad',
  ADULT_STANDARDS: 'standards-era elegance',
  PUBLIC_NEWS: 'measured public-radio tone',
  PUBLIC_CLASSICAL: 'refined classical restraint',
  PUBLIC_ECLECTIC: 'warm eclectic noncomm',
  PUBLIC_JAZZ: 'public jazz swing, brushed ride',
  RELIGIOUS_TEACHING: 'teaching-floor calm reverence',
  INDIETRONICA: 'quirky indie electronic',
  JAZZ: 'smooth jazz melodic phrase',
};

/** Formats where the global “radio jingle era” defaults (brass, punchy VO) fight the intended sound. */
const SOFT_IMAGERY_FORMATS = new Set(['BEAUTIFUL_MUSIC', 'MOR', 'ADULT_STANDARDS', 'PUBLIC_CLASSICAL', 'PUBLIC_JAZZ']);
/** Guitar-forward formats — avoid decade ladder that assumes “top 40 brass sting” in the 60s–80s. */
const ROCK_IMAGERY_FORMATS = new Set(['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK']);
/** Rhythmic pop / R&B — short ID can use groove; different from soft AC or news VO. */
const RHYTHMIC_POP_FORMATS = new Set(['URBAN_CONTEMP', 'RHYTHMIC', 'SOUL_RNB', 'HOT_AC', 'GOSPEL']);
/** Oldies / classic hits — avoid generic decade “top-40 brass” ladder. */
const OLDIES_IMAGERY_FORMATS = new Set(['OLDIES', 'CLASSIC_HITS']);
/** Formats that should sound like a spoken / VO-forward ID (no sung/spoken split). */
const SPOKEN_FORWARD_FORMATS = new Set([
  'NEWS_TALK',
  'SPORTS_TALK',
  'ALL_NEWS',
  'PERSONALITY_TALK',
  'PUBLIC_NEWS',
]);

/** Core ask for music-format jingles: sung melodic ID (lyrics as written). */
const SUNG_TAGLINE_AND_BRAND = 'sung booth ID, one lead vocal, crisp diction';

/** Positive-only outro — never name crowd/applause (negatives prime Suno toward them). */
const STUDIO_OUTRO = 'dry studio outro, instrumental fade after last word, booth room tone';

/**
 * Vocal / delivery hint for tags.
 * @param {boolean} [hasTagline] when true on soft formats, prefer real words over pad-only bed.
 */
function vocalDeliveryTag(fmtKey, hasTagline) {
  if (SPOKEN_FORWARD_FORMATS.has(fmtKey)) {
    return 'VO imaging: spell call letters letter-by-letter; dial exactly as tagged; spoken number words matching lyrics';
  }
  if (SOFT_IMAGERY_FORMATS.has(fmtKey)) {
    if (hasTagline) {
      return `soft melodic lead vocal; ${SUNG_TAGLINE_AND_BRAND}; clear words; airy bed; featherweight drums`;
    }
    return 'soft melodic vocal or humming pad; minimal drums';
  }
  if (fmtKey === 'GOSPEL') {
    return `solo gospel vocal; organ pad; ${SUNG_TAGLINE_AND_BRAND}; reverent`;
  }
  if (ROCK_IMAGERY_FORMATS.has(fmtKey)) {
    return `rock sting; guitars up front; ${SUNG_TAGLINE_AND_BRAND}`;
  }
  if (fmtKey === 'COUNTRY') {
    return `country melodic vocal; warm twang; ${SUNG_TAGLINE_AND_BRAND}; acoustic-forward band`;
  }
  if (fmtKey === 'SPANISH') {
    return `Latin hook; ${SUNG_TAGLINE_AND_BRAND}; Spanish lyric line ok`;
  }
  if (fmtKey === 'TOP40') {
    if (hasTagline) {
      return `CHR vocal; ${SUNG_TAGLINE_AND_BRAND}; tight mix`;
    }
    return `CHR sting; punchy melodic lead; ${SUNG_TAGLINE_AND_BRAND}; controlled drums`;
  }
  if (RHYTHMIC_POP_FORMATS.has(fmtKey)) {
    return `R&B-pop melodic hook; groove-led; ${SUNG_TAGLINE_AND_BRAND}`;
  }
  if (fmtKey === 'ADULT_CONTEMP') {
    return `warm AC vocal; ${SUNG_TAGLINE_AND_BRAND}; smooth close-mic mix`;
  }
  if (OLDIES_IMAGERY_FORMATS.has(fmtKey)) {
    return `gold-era vocal; crisp words; ${SUNG_TAGLINE_AND_BRAND}; guitar or piano hook`;
  }
  if (fmtKey === 'JAZZ') {
    return `smooth jazz vocal; light melodic phrase; ${SUNG_TAGLINE_AND_BRAND}`;
  }
  if (fmtKey === 'RELIGIOUS_TEACHING') {
    return `calm teaching tone; ${SUNG_TAGLINE_AND_BRAND}`;
  }
  if (fmtKey === 'PUBLIC_ECLECTIC') {
    return `noncomm warmth; warm upfront vocal; ${SUNG_TAGLINE_AND_BRAND}`;
  }
  if (fmtKey === 'PUBLIC_JAZZ') {
    return `public jazz ID; swing pocket or walking bass hint; brushed or light ride; ${SUNG_TAGLINE_AND_BRAND}; not smooth jazz`;
  }
  if (fmtKey === 'AAA') {
    return `AAA adult melodic lead; tasteful discovery guitars; ${SUNG_TAGLINE_AND_BRAND}; warm not teenage`;
  }
  if (fmtKey === 'INDIETRONICA') {
    return `indie electronic vocal; dry close-mic mix; ${SUNG_TAGLINE_AND_BRAND}`;
  }
  return SUNG_TAGLINE_AND_BRAND;
}

/**
 * Year + format → one compact imaging clause (positive; keeps headroom under Suno tag limits).
 */
function eraTagsForYearAndFormat(yr, fmtKey) {
  if (fmtKey === 'COUNTRY') {
    if (yr < 1980) return { eraTag: '1970s country booth ID: acoustic guitar, steel, dry vocal, tape warmth' };
    if (yr < 2000) return { eraTag: '1980s country booth ID: Nashville guitar, crisp drums, close-mic vocal' };
    return { eraTag: 'modern country booth ID: acoustic pocket, tight vocal, clean master' };
  }

  if (fmtKey === 'GOSPEL') {
    if (yr < 1990) return { eraTag: 'gospel booth ID: organ pad, solo lead vocal, reverent dry mix' };
    return { eraTag: 'gospel booth ID: piano pad, solo vocal, restrained dynamics' };
  }

  if (fmtKey === 'AAA') {
    if (yr < 1992) return { eraTag: 'AAA booth ID: warm guitar colors, solo vocal, polished FM mix' };
    if (yr < 2012) return { eraTag: 'AAA booth ID: tasteful guitars, melancholy hook, dry vocal' };
    return { eraTag: 'AAA booth ID: warm lead vocal, restrained drums, clean imaging' };
  }

  if (ROCK_IMAGERY_FORMATS.has(fmtKey)) {
    if (yr < 1980) return { eraTag: '1970s rock booth ID: guitars forward, plate reverb, dry band sting' };
    if (yr < 2000) return { eraTag: '1980s rock booth ID: guitar hook, gated snare, close-mic vocal' };
    return { eraTag: 'modern rock booth ID: loud guitars, punchy close mix, dry studio sting' };
  }

  if (SOFT_IMAGERY_FORMATS.has(fmtKey)) {
    if (yr < 1980) {
      return { eraTag: 'easy-listening booth ID: soft strings, brushed texture, whisper drums' };
    }
    if (yr < 2000) return { eraTag: 'beautiful music booth ID: warm pads, restrained percussion, dry vocal' };
    return { eraTag: 'soft AC booth ID: gentle mix, silky highs, feather drums' };
  }

  if (SPOKEN_FORWARD_FORMATS.has(fmtKey)) {
    const bases = {
      SPORTS_TALK: 'sports talk booth ID: dry VO, subtle impact hits, studio transients',
      ALL_NEWS: 'all-news booth ID: urgent bed, authoritative VO, network tone',
      PERSONALITY_TALK: 'talk booth ID: close-mic host, light sting under VO',
      PUBLIC_NEWS: 'public news booth ID: measured dynamics, woody room',
      NEWS_TALK: 'news-talk booth ID: booth authority, low shelf pad, dry dynamics',
    };
    let eraTag = bases[fmtKey] || bases.NEWS_TALK;
    if (yr < 1990) eraTag += ', analog console';
    else if (yr < 2010) eraTag += ', digital clarity';
    else eraTag += ', modern talk master';
    return { eraTag };
  }

  if (fmtKey === 'TOP40') {
    if (yr < 1980) return { eraTag: '1970s CHR booth ID: synth or guitar lead, dry close-mic vocal' };
    if (yr < 2000) return { eraTag: '1980s CHR booth ID: bright synths, gated snare, dry vocal, tight fade' };
    return { eraTag: 'modern CHR booth ID: pop sheen, tight low end, dry vocal' };
  }

  if (RHYTHMIC_POP_FORMATS.has(fmtKey)) {
    if (yr < 1990) return { eraTag: 'rhythmic booth ID: swing drums, slap bass, solo vocal' };
    if (yr < 2010) return { eraTag: 'Y2K rhythmic booth ID: warm bass, snappy snare, solo vocal' };
    return { eraTag: 'urban-pop booth ID: wide low end, airy pad, solo vocal' };
  }

  if (fmtKey === 'SPANISH') {
    if (yr < 2000) return { eraTag: 'Latin booth ID: percussion sparkle, horn stab optional, dry vocal' };
    return { eraTag: 'Latin-pop booth ID: bright rhythm, close-mic vocal, clean master' };
  }

  if (OLDIES_IMAGERY_FORMATS.has(fmtKey)) {
    if (yr < 1980) return { eraTag: 'gold hits booth ID: rock sparkle, slapback echo, brass stab' };
    if (yr < 2000) return { eraTag: 'classic hits booth ID: guitar hook, dry groove, mono gleam' };
    return { eraTag: 'classic hits booth ID: shimmering guitar, upbeat master, dry vocal' };
  }

  if (fmtKey === 'ADULT_CONTEMP') {
    if (yr < 1990) return { eraTag: 'AC booth ID: soft-rock warmth, mellow drums, heartfelt pad' };
    if (yr < 2010) return { eraTag: 'AC booth ID: warm keys, buttery vocal space, dry mix' };
    return { eraTag: 'AC booth ID: wide gentle mix, dreamy pads, restrained rhythm' };
  }

  if (fmtKey === 'JAZZ') {
    return { eraTag: 'smooth jazz booth ID: brushed hats, sax or piano lead, velvet tone' };
  }

  if (fmtKey === 'RELIGIOUS_TEACHING') {
    return { eraTag: 'faith teaching booth ID: soft organ, serene guitar, pastoral calm' };
  }

  if (fmtKey === 'PUBLIC_ECLECTIC') {
    return { eraTag: 'eclectic booth ID: fingerpicked warmth, mellow synth, intimate dry mix' };
  }

  if (fmtKey === 'PUBLIC_JAZZ') {
    return { eraTag: 'public jazz booth ID: upright bass, brushed ride, dry horn stab' };
  }

  if (fmtKey === 'INDIETRONICA') {
    return { eraTag: 'indie-electronic booth ID: synth arps, dry percussion, close detail' };
  }

  if (yr < 1960) return { eraTag: '1950s booth ID: ribbon mic, light combo, tube warmth' };
  if (yr < 1970) return { eraTag: '1960s booth ID: brass stab, mono plate, dry combo' };
  if (yr < 1980) return { eraTag: '1970s booth ID: brass or synth, tape slap, dry drums' };
  if (yr < 1990) return { eraTag: '1980s booth ID: drum machine, gated snare, glossy synth' };
  if (yr < 2000) return { eraTag: '1990s booth ID: digital chorus, dry vocal, swing pocket' };
  if (yr < 2010) return { eraTag: '2000s booth ID: shimmering bed, tight vocal, clean master' };
  if (yr < 2020) return { eraTag: '2010s booth ID: airy synth, solo vocal, dry imaging' };
  return { eraTag: '2020s booth ID: sculpted lows, holographic highs, dry vocal' };
}

/**
 * @param {{ brand: string, format: string, year: number, tagline?: string, frequency?: string, band?: string, formatId?: string, audienceHint?: string, positionHint?: string }} p
 */
function normalizeJingleFormatId(raw) {
  const k = String(raw || '')
    .trim()
    .toUpperCase();
  if (k === 'CHR') return 'TOP40';
  return k;
}

/**
 * Previously a one-line “Suno prompt confidence” note for the player UI; no longer shown or returned from the API.
 * @param {{ brand?: string, tagline?: string, frequency?: string, band?: string, formatId?: string }} _p
 * @returns {string}
 */
function sunoJinglePromptConfidenceMessage(_p) {
  return '';
}

/**
 * Los Angeles “LA” in singable text — Suno reads “LA's” as “la”; letter-space like call signs.
 * @param {string} text
 */
function verbalizeLosAngelesAbbrevInLyrics(text) {
  let t = String(text || '');
  if (!t) return t;
  t = t.replace(/\bL\s*\.?\s*A\s*\.?\s*'s\b/gi, "L A's");
  t = t.replace(/\bL\s*\.?\s*A\s*\.?(?!')\b/gi, 'L A');
  return t;
}

/**
 * Tagline lyrics: keep player words singable without brand-style dial surgery.
 * @param {string} tag
 * @param {string} [callLetters]
 */
function sanitizeTaglineForJingleLyrics(tag, callLetters) {
  let t = String(tag || '').trim().slice(0, 60);
  if (!t) return '';
  t = t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  t = t.replace(/[—–]/g, ' ').replace(/[;|]+/g, ',');
  t = verbalizeLosAngelesAbbrevInLyrics(t);
  t = t.replace(/#\s*1\b/gi, 'number one');
  t = t.replace(/\bno\.?\s*1\b/gi, 'number one');
  t = t.replace(/\bnumber\s+one\b/gi, 'number one');
  t = t.replace(/\b1st\b/gi, 'first');
  t = t.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, (m) => {
    const map = {
      '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth',
      '6th': 'sixth', '7th': 'seventh', '8th': 'eighth', '9th': 'ninth', '10th': 'tenth',
      '11th': 'eleventh', '12th': 'twelfth',
    };
    return map[m.toLowerCase()] || m;
  });
  t = t.replace(/&/g, ' and ');
  t = t.replace(/[^A-Za-z0-9'.,\-\s]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (callLetters && callLettersAppearInBrand(t, callLetters)) {
    t = spellCallLettersInBrandForLyrics(t, callLetters);
  }
  return t;
}

/**
 * Light pass on player-supplied sonic hints — some providers auto-reject prompts containing
 * common false-positive substrings (e.g. "intimate", "club") in music safety review.
 * @param {string} raw
 * @returns {string}
 */
function sanitizeTunesContentHints(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/\bstrip\s+clubs?\b/gi, 'nightlife venues');
  s = s.replace(/\badult\s+clubs?\b/gi, 'late-night venues');
  s = s.replace(/\bintimacy\b/gi, 'warmth');
  s = s.replace(/\bintimate\w*\b/gi, (m) => (/intimacy/i.test(m) ? 'warmth' : 'close-mic'));
  s = s.replace(/\bclubs\b/gi, 'venues');
  s = s.replace(/\bclub\b/gi, 'venue');
  return s.replace(/\s+/g, ' ').trim();
}

function buildSunoJingleArgs(p) {
  const brand = String(p.brand || 'Station').trim().slice(0, 100) || 'Station';
  const yr = Math.floor(Number(p.year) || 1970);
  const fmtLabel = String(p.format || 'Radio').trim().slice(0, 80);
  const fmtKey = normalizeJingleFormatId(p.formatId);
  const tag = typeof p.tagline === 'string' ? p.tagline.trim().slice(0, 60) : '';
  const band = String(p.band || '').toUpperCase() === 'FM' ? 'FM' : String(p.band || '').toUpperCase() === 'AM' ? 'AM' : '';
  const dialHint = dialVerbalForTags(p.frequency, band);
  const callSpaced = spacedCallLettersForSuno(typeof p.callLetters === 'string' ? p.callLetters : '');
  const callsInBrand = callLettersAppearInBrand(brand, typeof p.callLetters === 'string' ? p.callLetters : '');

  const formatHint = FORMAT_SUNO[fmtKey] || 'mainstream music radio';

  const { eraTag } = eraTagsForYearAndFormat(yr, fmtKey);

  const cl = typeof p.callLetters === 'string' ? p.callLetters : '';
  const tagForLyrics = tag ? sanitizeTaglineForJingleLyrics(tag, cl) : '';
  const brandForLyrics = brandTextForJingleLyrics(brand, p.frequency, band, cl);
  const tagIsShort = tagForLyrics.length > 0 && tagForLyrics.length <= 36;

  const spoken = SPOKEN_FORWARD_FORMATS.has(fmtKey);
  // One line per idea — repeating short taglines caused “Depend on it. Depend on it.” and model babble.
  const lyricLines = [];
  if (tagForLyrics) lyricLines.push(tagForLyrics);
  lyricLines.push(brandForLyrics);
  if (spoken) {
    if (callSpaced && !callsInBrand) lyricLines.push(callSpaced);
    if (dialHint && !dialHintRedundantWithBrand(brandForLyrics, dialHint)) {
      lyricLines.push(`You're listening at ${dialHint}`);
    }
  }
  const lyrics = lyricLines.join('\n').slice(0, 1200);

  // Numbers + enunciation guardrails:
  // When brand contains spelled numbers and the dial hint also contains number words, models may merge them into
  // nonsense or invent extra words. Keep this general to avoid overfitting to one phrase.
  const _brandNums = (brandForLyrics.toLowerCase().match(/\b(?:ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g) || []).slice(0, 4);
  const _dialTokens = dialHint ? dialHint.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6) : [];
  const _dialHasDigitWord = _dialTokens.some((w) => w === 'oh' || DIGIT_WORDS.includes(w));
  const _dialConflictRisk = _dialHasDigitWord && _brandNums.length > 0;
  const numberClarityTag = _dialConflictRisk
    ? 'numbers: separate brand phrases from dial words; pronounce exactly as scripted'
    : 'numbers: read exactly from lyrics';

  const tagParts = [
    `year ${yr} radio booth ID`,
    STUDIO_OUTRO,
    'sing lyrics once, hard stop, crisp diction',
    tagForLyrics && !spoken ? 'slogan then station name, dictionary words' : '',
    eraTag,
    vocalDeliveryTag(fmtKey, !!tag),
    formatHint,
    dialHint ? `dial ${dialHint}` : '',
    callSpaced && callsInBrand
      ? spoken
        ? `call letters speak ${callSpaced}`
        : `call letters sing ${callSpaced}`
      : '',
    callSpaced && !callsInBrand && spoken ? `call letters speak ${callSpaced}` : '',
    tagIsShort ? 'short slogan, clear consonants' : '',
    numberClarityTag,
    'six to ten seconds',
    band || '',
  ].filter(Boolean);

  const tags = tagParts.join('; ').slice(0, 1000);

  const sunoTitle = `${brand} — ${yr} (studio ID)`.slice(0, 100);

  return {
    mode: 'custom',
    title: sunoTitle,
    tags,
    lyrics,
  };
}

module.exports = {
  buildSunoJingleArgs,
  sunoJinglePromptConfidenceMessage,
  amKhzToRadioVerbal,
  fmMhzToRadioVerbal,
  verbalizeDialInText,
  brandTextForJingleLyrics,
  verbalizeLetterPlusDialDigits,
  verbalizeIsolatedTwoDigitBrandNumbers,
  spacedCallLettersForSuno,
  callLettersAppearInBrand,
  spellCallLettersInBrandForLyrics,
  sanitizeTaglineForJingleLyrics,
  verbalizeLosAngelesAbbrevInLyrics,
  STUDIO_OUTRO,
};
