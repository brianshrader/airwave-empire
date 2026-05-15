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
  if (callLetters) t = spellCallLettersInBrandForLyrics(t, callLetters);
  return t;
}

/** Internal format id → short sonic hint for Suno tags (avoid “arena/party” wording — models map it to crowd tails). */
/** Short sonic anchors — pairing with imaging line + vocals; trim helps stay under tags cap */
const FORMAT_SUNO = {
  TOP40: 'bright CHR pop, tight vocals',
  NEWS_TALK: 'authoritative news-talk booth',
  SPORTS_TALK: 'bold sports imaging, dry room',
  PERSONALITY_TALK: 'FM talk-show booth, punchy VO bed',
  ALL_NEWS: 'urgent credible network sting',
  COUNTRY: 'warm twang, hooky guitar',
  ALBUM_ROCK: 'AOR guitars, roomy mix',
  CLASSIC_ROCK: 'classic-rock swagger sting',
  ALT_ROCK: 'alt-rock grit, edgy hook',
  AAA: 'adult-discovery melodic lift, tasteful guitar',
  MOR: 'smooth MOR glide',
  OLDIES: 'gold-era bounce',
  ADULT_CONTEMP: 'warm AC melodic lift',
  HOT_AC: 'rhythmic adult pop sparkle',
  URBAN_CONTEMP: 'urban rhythmic pop shimmer',
  RHYTHMIC: 'rhythm-pop dancefloor brightness',
  SOUL_RNB: 'groove-heavy R&B soul',
  SPANISH: 'Latin-radio bounce',
  GOSPEL: 'urban gospel lift, choir or solo, rhythmic inspirational',
  CLASSIC_HITS: 'singalong hooks, tight close',
  BEAUTIFUL_MUSIC: 'soft beds, orchestral pad',
  ADULT_STANDARDS: 'standards-era elegance',
  PUBLIC_NEWS: 'measured public-radio tone',
  PUBLIC_CLASSICAL: 'refined classical restraint',
  PUBLIC_ECLECTIC: 'warm eclectic noncomm',
  PUBLIC_JAZZ: 'public jazz: straight-ahead swing, cultured metro noncomm (not smooth jazz)',
  RELIGIOUS_TEACHING: 'teaching-floor calm reverence',
  INDIETRONICA: 'quirky indie electronic',
  JAZZ: 'smooth jazz melodic hook',
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
const SUNG_TAGLINE_AND_BRAND =
  'melodic sung ID — sing every lyric line with pitch and clarity including dial phrases';

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
    return `gospel lift; choir or solo; ${SUNG_TAGLINE_AND_BRAND}; reverent`;
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
    if (yr < 1980) {
      return { eraTag: 'Country station ID: acoustic guitar or pedal steel, fiddle hook, tape-era warmth, dry mix.' };
    }
    if (yr < 2000) {
      return { eraTag: 'Country station ID: 1980s–90s Nashville polish, bright guitar hook, crisp studio.' };
    }
    return { eraTag: 'Country station ID: modern cluster energy, acoustic-driven pocket, airy master.' };
  }

  if (fmtKey === 'GOSPEL') {
    if (yr < 1990) {
      return { eraTag: 'Gospel station ID: organ or piano uplift, choir swell optional, reverent analog warmth.' };
    }
    return { eraTag: 'Gospel station ID: worship-stage polish, pad + piano, restrained dynamics.' };
  }

  if (fmtKey === 'AAA') {
    if (yr < 1992) {
      return { eraTag: 'AAA station ID: warm adult melodic lift, thoughtful guitar colors, polished FM vocal.' };
    }
    if (yr < 2012) {
      return { eraTag: 'AAA station ID: discovery-friendly melancholy hook, tasteful mix-forward guitars.' };
    }
    return { eraTag: 'AAA station ID: modern adult-discovery polish, warm lead vocal, restrained drums.' };
  }

  if (ROCK_IMAGERY_FORMATS.has(fmtKey)) {
    if (yr < 1980) {
      return { eraTag: 'Rock station ID: guitars forward, analog grit, plate reverb, tight band sting.' };
    }
    if (yr < 2000) {
      return { eraTag: 'Rock station ID: anthemic guitar hooks, gated-friendly drums, polished FM edge.' };
    }
    return { eraTag: 'Rock station ID: loud-ready guitars, punchy close mix, stadium-adjacent energy.' };
  }

  if (SOFT_IMAGERY_FORMATS.has(fmtKey)) {
    if (yr < 1980) {
      return {
        eraTag: 'Easy-listening station ID: soft strings or electric piano, brushed texture, whisper-level drums.',
      };
    }
    if (yr < 2000) {
      return { eraTag: 'Beautiful music ID: shimmering pads, restrained percussion, dreamy hall.' };
    }
    return { eraTag: 'Soft AC imaging: wide gentle mix, silky highs, feather drums.' };
  }

  if (SPOKEN_FORWARD_FORMATS.has(fmtKey)) {
    const bases = {
      SPORTS_TALK: 'Sports talk ID: impactful transients, dry VO booth, light crowd punctuation',
      ALL_NEWS: 'All-news ID: urgent ticker energy, authoritative bed, credible network tone',
      PERSONALITY_TALK: 'FM personality-talk ID: close-mic host energy, light rock or AC-adjacent sting under VO',
      PUBLIC_NEWS: 'Public radio news ID: measured dynamics, woody room, understated strings optional',
      NEWS_TALK: 'News-talk ID: booth authority, subtle low shelf pad, razor dynamics',
    };
    let eraTag =
      bases[fmtKey] || bases.NEWS_TALK;
    if (yr < 1990) eraTag += ', analog-console chain.';
    else if (yr < 2010) eraTag += ', digital broadcast clarity.';
    else eraTag += ', normalized modern talk master.';
    return { eraTag };
  }

  if (fmtKey === 'TOP40') {
    if (yr < 1980) {
      return { eraTag: 'CHR station ID: late-70s brightness, guitar or synth lead, disco-adjacent punch, dry close.' };
    }
    if (yr < 2000) {
      return { eraTag: 'CHR station ID: anthemic synths, gated snare, glossy hook.' };
    }
    return { eraTag: 'CHR station ID: modern pop sheen, tight low end, sparkly top.' };
  }

  if (RHYTHMIC_POP_FORMATS.has(fmtKey)) {
    if (yr < 1990) {
      return { eraTag: 'Rhythmic pop ID: swing-pocket drums, slap bass pops, melodic stack vocals.' };
    }
    if (yr < 2010) {
      return { eraTag: 'Rhythmic pop ID: Y2K sheen, warm bass, snappy snares, hook stacks.' };
    }
    return { eraTag: 'Urban-pop ID: wide low end, airy pads, melodic rap-sung blend ready.' };
  }

  if (fmtKey === 'SPANISH') {
    if (yr < 2000) {
      return { eraTag: 'Latin radio ID: live percussion sparkle, horn stabs optional, festive punch.' };
    }
    return { eraTag: 'Latin-pop station ID: Latin-rhythm brightness, polished festival-stage energy.' };
  }

  if (OLDIES_IMAGERY_FORMATS.has(fmtKey)) {
    if (yr < 1980) {
      return { eraTag: 'Gold hits ID: rock-and-roll sparkle, slapback echo, playful brass stabs OK.' };
    }
    if (yr < 2000) {
      return { eraTag: 'Classic hits ID: nostalgic guitar or EP hook, buoyant groove, mono-friendly gleam.' };
    }
    return { eraTag: 'Classic hits ID: recall-era polish, shimmering guitars, upbeat master.' };
  }

  if (fmtKey === 'ADULT_CONTEMP') {
    if (yr < 1990) {
      return { eraTag: 'AC station ID: soft-rock warmth, mellow drums, heartfelt pad.' };
    }
    if (yr < 2010) {
      return { eraTag: 'AC station ID: polished emotional lift, shimmering keys, buttery vocal space.' };
    }
    return { eraTag: 'AC station ID: modern wide mix, dreamy pads, restrained rhythm.' };
  }

  if (fmtKey === 'JAZZ') {
    return { eraTag: 'Smooth jazz ID: brushed hats, smoky sax or piano lead, velvet night tone.' };
  }

  if (fmtKey === 'RELIGIOUS_TEACHING') {
    return { eraTag: 'Faith teaching ID: soft organ swell, serene guitar, pastoral calm.' };
  }

  if (fmtKey === 'PUBLIC_ECLECTIC') {
    return { eraTag: 'Eclectic noncomm ID: fingerpicked warmth, mellow synth dust, campfire closeness.' };
  }

  if (fmtKey === 'PUBLIC_JAZZ') {
    return { eraTag: 'Public jazz ID: upright bass warmth, brushed ride, cozy-venue horn stabs, university-radio polish.' };
  }

  if (fmtKey === 'INDIETRONICA') {
    return { eraTag: 'Indie-electronic ID: quirky synth arps, dry punchy percussion, headphone-close detail.' };
  }

  if (yr < 1960) {
    return { eraTag: '1950s booth sting: ribbon-mic warmth, light live combo, velvet tube saturation.' };
  }
  if (yr < 1970) {
    return { eraTag: '1960s hit-radio sting: upbeat brass punches, mono plate reverb, sock-hop bounce.' };
  }
  if (yr < 1980) {
    return {
      eraTag: '1970s jingle sting: brass or analog synth bloom, buttery tape slap, disco-ready drums.',
    };
  }
  if (yr < 1990) {
    return { eraTag: '1980s FM sting: Simmons or Linndrum zest, gated snare slap, glossy DX colors.' };
  }
  if (yr < 2000) {
    return { eraTag: '1990s imaging sting: wide digital chorus, sparkly vocals, MPC swing pocket.' };
  }
  if (yr < 2010) {
    return { eraTag: '2000s cluster sting: multiband loudness, shimmering beds, kinetic motion.' };
  }
  if (yr < 2020) {
    return { eraTag: '2010s imaging sting: EDM-informed lift, airy supersaws, tight vocal doubles.' };
  }
  return { eraTag: '2020s station sting: streaming-loud compliant, holographic highs, sculpted lows.' };
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

  const audienceHint = sanitizeTunesContentHints(
    typeof p.audienceHint === 'string' ? p.audienceHint.trim().slice(0, 100) : '',
  );
  const positionHint = sanitizeTunesContentHints(
    typeof p.positionHint === 'string' ? p.positionHint.trim().slice(0, 140) : '',
  );

  const { eraTag } = eraTagsForYearAndFormat(yr, fmtKey);

  // On-air words only — tagline + brand as the player wrote them; verbalize digits for singability.
  const cl = typeof p.callLetters === 'string' ? p.callLetters : '';
  const tagForLyrics = tag ? brandTextForJingleLyrics(tag, p.frequency, band, cl) : '';
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
    `commissioned for calendar year ${yr} only`,
    'lyrics fidelity: verbatim words from lyrics box only — no new lines or ad-libs; hard stop after last word',
    'studio ID sting, tight fade, dry booth close-mic proximity',
    dialHint ? `dial ${dialHint}` : '',
    callSpaced && callsInBrand
      ? spoken
        ? `station call letters: speak as separate letters ${callSpaced}`
        : `call letters: sing as melodic vocal syllables ${callSpaced}`
      : '',
    callSpaced && !callsInBrand && spoken
      ? `station call letters: speak as separate letters ${callSpaced}; do not read call letters as one invented word`
      : '',
    tagIsShort ? 'clear enunciation on short slogan — real dictionary words only' : '',
    numberClarityTag,
    eraTag,
    vocalDeliveryTag(fmtKey, !!tag),
    fmtLabel,
    formatHint,
    audienceHint,
    positionHint,
    'short radio station ID',
    'six to twelve seconds',
    'clean studio radio mix',
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
};
