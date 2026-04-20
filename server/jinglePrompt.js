'use strict';

/**
 * ShortAPI Suno v5.5 custom mode:
 * - `lyrics` = on-air words only (tagline once, then brand; spoken formats add calls/dial only when not redundant).
 * - **Music formats:** prompts ask for **sung tagline and sung brand** (melodic vocal for all lyric lines).
 * - **News/talk-style formats:** VO / announcer delivery (not sung).
 * - `tags` = era, format, length, mix — avoid stuffing contradictory delivery cues into one giant string.
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

/** Brand string for jingle lyrics: player text only, with dial numerals verbalized for singing. */
function brandTextForJingleLyrics(brand, frequency, band) {
  let t = verbalizeDialInText(brand, frequency, band);
  t = verbalizeLetterPlusDialDigits(t, frequency, band);
  t = verbalizeIsolatedTwoDigitBrandNumbers(t);
  return t;
}

/** Internal format id → short sonic hint for Suno tags (avoid “arena/party” wording — models map it to crowd tails). */
const FORMAT_SUNO = {
  TOP40: 'bright hit-radio, tight punchy vocals, studio imaging',
  NEWS_TALK: 'authoritative news-talk imaging, serious but punchy',
  SPORTS_TALK: 'sports radio energy, bold imaging, dry studio beds',
  PODCAST_TALK: 'modern spoken-word-adjacent, conversational polish',
  ALL_NEWS: 'all-news urgency, credible network tone',
  COUNTRY: 'country radio warmth, twang-friendly hook',
  ALBUM_ROCK: 'album-oriented rock, guitar-forward',
  CLASSIC_ROCK: 'classic rock swagger, big guitars',
  ALT_ROCK: 'alternative rock edge, younger-leaning',
  MOR: 'middle-of-the-road polish, smooth adult appeal',
  OLDIES: 'oldies / gold hits nostalgia, retro bounce',
  ADULT_CONTEMP: 'adult contemporary sheen, warm and melodic',
  HOT_AC: 'hot adult contemporary, rhythmic polish',
  URBAN_CONTEMP: 'urban contemporary, rhythmic R&B pop',
  RHYTHMIC: 'rhythmic CHR, club-adjacent brightness',
  SOUL_RNB: 'R&B soul warmth, groove-led',
  SPANISH: 'Latin / Spanish-language radio heat',
  GOSPEL: 'gospel-inspired uplift, choir-friendly',
  CLASSIC_HITS: 'classic hits hook energy, singalong-friendly, tight dry close',
  BEAUTIFUL_MUSIC: 'easy listening / beautiful music, soft beds, light orchestral or electric piano pad',
  ADULT_STANDARDS: 'standards / nostalgia elegance',
  PUBLIC_NEWS: 'public radio credibility, measured',
  PUBLIC_CLASSICAL: 'classical refinement, restrained',
  PUBLIC_ECLECTIC: 'eclectic noncomm warmth',
  RELIGIOUS_TEACHING: 'faith teaching tone, respectful',
  INDIETRONICA: 'indie electronic texture',
  JAZZ: 'smooth jazz warmth, brushed rhythm, melodic instrument hook',
};

/** Formats where the global “radio jingle era” defaults (brass, punchy VO) fight the intended sound. */
const SOFT_IMAGERY_FORMATS = new Set(['BEAUTIFUL_MUSIC', 'MOR', 'ADULT_STANDARDS', 'PUBLIC_CLASSICAL']);
/** Guitar-forward formats — avoid decade ladder that assumes “top 40 brass sting” in the 60s–80s. */
const ROCK_IMAGERY_FORMATS = new Set(['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK']);
/** Rhythmic pop / R&B — short ID can use groove; different from soft AC or news VO. */
const RHYTHMIC_POP_FORMATS = new Set(['URBAN_CONTEMP', 'RHYTHMIC', 'SOUL_RNB', 'HOT_AC']);
/** Oldies / classic hits — avoid generic decade “top-40 brass” ladder. */
const OLDIES_IMAGERY_FORMATS = new Set(['OLDIES', 'CLASSIC_HITS']);
/** Formats that should sound like a spoken / VO-forward ID (no sung/spoken split). */
const SPOKEN_FORWARD_FORMATS = new Set([
  'NEWS_TALK',
  'SPORTS_TALK',
  'ALL_NEWS',
  'PODCAST_TALK',
  'PUBLIC_NEWS',
]);

/** Core ask for every music-format jingle: melodic singing for slogan and brand, not VO. */
const SUNG_TAGLINE_AND_BRAND =
  'sung jingle: melodic lead vocal — sing tagline and station brand lines; sing dial and frequency as sung phrases (not dry spoken announcer); clear pitch; no monotone narration';

/**
 * Vocal / delivery hint for tags.
 * @param {boolean} [hasTagline] when true on soft formats, do not ask for “wordless pad” (conflicts with sung tagline → gibberish).
 */
function vocalDeliveryTag(fmtKey, hasTagline) {
  if (SPOKEN_FORWARD_FORMATS.has(fmtKey)) {
    return 'VO delivery: speak call letters as separate letters only (not as a word); use the exact dial wording from tags; numbers as spoken words not digit strings; do not invent a different frequency';
  }
  if (SOFT_IMAGERY_FORMATS.has(fmtKey)) {
    if (hasTagline) {
      return `soft sung vocal; ${SUNG_TAGLINE_AND_BRAND}; clear consonants; no wordless pad; no humming; no scat; no invented syllables or gibberish; gentle melodic line; minimal percussion`;
    }
    return 'soft melodic sung line or light wordless pad; gentle floating vocal; minimal percussion';
  }
  if (fmtKey === 'GOSPEL') {
    return `gospel uplift; choir or solo; ${SUNG_TAGLINE_AND_BRAND}; reverent tone`;
  }
  if (ROCK_IMAGERY_FORMATS.has(fmtKey)) {
    return `rock radio sting; guitar-forward; ${SUNG_TAGLINE_AND_BRAND}`;
  }
  if (fmtKey === 'COUNTRY') {
    return `country melodic vocal; warm twang ok; ${SUNG_TAGLINE_AND_BRAND}; country radio bed only — not disco funk or pop brass`;
  }
  if (fmtKey === 'SPANISH') {
    return `Latin melodic hook; ${SUNG_TAGLINE_AND_BRAND}; Spanish-language sung line ok`;
  }
  if (fmtKey === 'TOP40') {
    if (hasTagline) {
      return `CHR pop vocal; ${SUNG_TAGLINE_AND_BRAND}; no DJ talkover`;
    }
    return `CHR sung station ID; punchy melodic lead; ${SUNG_TAGLINE_AND_BRAND}; short sting keep drums controlled`;
  }
  if (RHYTHMIC_POP_FORMATS.has(fmtKey)) {
    return `contemporary R&B-pop melodic hook; ${SUNG_TAGLINE_AND_BRAND}`;
  }
  if (fmtKey === 'ADULT_CONTEMP') {
    return `warm adult-contemporary melodic vocal; ${SUNG_TAGLINE_AND_BRAND}; smooth not shouty`;
  }
  if (OLDIES_IMAGERY_FORMATS.has(fmtKey)) {
    return `retro gold / classic hits vocal; clear enunciation; ${SUNG_TAGLINE_AND_BRAND}; nostalgic not brass parade`;
  }
  if (fmtKey === 'JAZZ') {
    return `smooth jazz station vocal; light melodic line; ${SUNG_TAGLINE_AND_BRAND}; no CHR shout`;
  }
  if (fmtKey === 'RELIGIOUS_TEACHING') {
    return `respectful teaching delivery; ${SUNG_TAGLINE_AND_BRAND}; calm clarity`;
  }
  if (fmtKey === 'PUBLIC_ECLECTIC') {
    return `warm noncommercial melodic vocal; intimate; ${SUNG_TAGLINE_AND_BRAND}`;
  }
  if (fmtKey === 'INDIETRONICA') {
    return `indie electronic vocal texture; ${SUNG_TAGLINE_AND_BRAND}; intimate not arena`;
  }
  return SUNG_TAGLINE_AND_BRAND;
}

/**
 * Year-based imaging defaults; for soft formats use a dedicated bed so era does not override format.
 */
function eraTagsForYearAndFormat(yr, fmtKey) {
  if (fmtKey === 'COUNTRY') {
    let eraTag =
      'country radio station imaging: acoustic guitar or pedal steel intro, fiddle hook, warm twang, tight dry studio';
    let eraAnti =
      'not disco not funk not 1970s urban pop brass not R&B groove not CHR synthpop not four-on-the-floor dance drums';
    if (yr < 1980) {
      eraTag += ', analog tape, countrypolitan or outlaw-era energy';
      eraAnti += ' not top-40 brass fanfare not ARP synth brass sting';
    } else if (yr < 2000) {
      eraTag += ', 1980s–1990s country radio polish';
      eraAnti += ' not boy-band pop or new jack swing drums';
    } else {
      eraTag += ', modern country radio without hip-hop trap drums';
    }
    return { eraTag, eraAnti };
  }

  if (fmtKey === 'GOSPEL') {
    let eraTag = 'gospel radio imaging: uplifting pad, organ or piano, optional choir swell on the hook';
    let eraAnti = 'not trap 808 not club EDM not spoken-word news tone';
    if (yr < 1990) {
      eraTag += ', analog warmth';
      eraAnti += ' not glossy 2000s pop';
    } else {
      eraTag += ', modern worship-adjacent polish without dance drops';
    }
    return { eraTag, eraAnti };
  }

  if (ROCK_IMAGERY_FORMATS.has(fmtKey)) {
    let eraTag = 'rock radio imaging: electric guitar forward, tight band sting, no big-band brass';
    let eraAnti = 'not top-40 brass fanfare not disco four-on-the-floor not news VO dry read';
    if (yr < 1980) {
      eraTag += ', analog tape grit, plate reverb';
      eraAnti += ' not 1990s nü-metal';
    } else if (yr < 2000) {
      eraTag += ', 80s–90s rock radio polish';
      eraAnti += ' not EDM supersaws';
    } else {
      eraTag += ', loudness-normalized rock punch';
      eraAnti += ' not dubstep';
    }
    return { eraTag, eraAnti };
  }

  if (SOFT_IMAGERY_FORMATS.has(fmtKey)) {
    let eraTag = 'easy listening / beautiful music radio imaging: soft strings or electric piano, brushed light texture';
    let eraAnti = 'not trap hi-hats not urban club bounce not punchy CHR drums not spoken-word VO dry read';
    if (yr < 1980) {
      eraTag += ', analog tape warmth, gentle shimmer';
      eraAnti += ' not disco four-on-the-floor';
    } else if (yr < 2000) {
      eraTag += ', digital reverb sheen still soft level';
      eraAnti += ' not 1990s R&B swing drums';
    } else {
      eraTag += ', clean wide polish without aggression';
      eraAnti += ' not EDM drops';
    }
    return { eraTag, eraAnti };
  }

  if (SPOKEN_FORWARD_FORMATS.has(fmtKey)) {
    let eraTag =
      fmtKey === 'SPORTS_TALK'
        ? 'sports talk radio imaging: bold transient punch, dry studio energy; stadium crowd samples not dominant'
        : fmtKey === 'ALL_NEWS'
          ? 'all-news radio imaging: urgent credible sting; network tone without music-video sheen'
          : fmtKey === 'PODCAST_TALK'
            ? 'podcast-forward radio imaging: intimate close-mic room; minimal neutral underscore only'
            : fmtKey === 'PUBLIC_NEWS'
              ? 'public radio news imaging: measured, credible; understated bed optional'
              : 'news / talk radio imaging: authoritative booth sting; tight broadcast dynamics; subtle low pad ok';
    let eraAnti =
      'not sung CHR pop jingle not brass fanfare sting not country fiddle not four-on-the-floor dance';
    if (yr < 1990) {
      eraTag += ', analog-console era chain';
      eraAnti += ' not glossy 2000s brickwall';
    } else if (yr < 2010) {
      eraTag += ', digital broadcast clarity';
    } else {
      eraTag += ', loudness-normalized talk production';
      eraAnti += ' not hyperpop not EDM festival';
    }
    return { eraTag, eraAnti };
  }

  if (fmtKey === 'TOP40') {
    let eraTag =
      'CHR / hit-radio imaging: bright synth or guitar hook, punchy controlled drums, mainstream pop energy';
    let eraAnti =
      'not 1970s brass station-ID fanfare not ARP analog brass sting not news talk dry VO not orchestral film trailer';
    if (yr < 1980) {
      eraTag += ', late-70s FM CHR brightness without big-band brass';
      eraAnti += ' not disco orchestra hit as sole bed';
    } else if (yr < 2000) {
      eraTag += ', 1980s–1990s CHR polish';
      eraAnti += ' not grunge rock slab';
    } else {
      eraTag += ', modern CHR imaging sheen';
      eraAnti += ' not dubstep';
    }
    return { eraTag, eraAnti };
  }

  if (RHYTHMIC_POP_FORMATS.has(fmtKey)) {
    let eraTag =
      'rhythmic pop / urban radio imaging: groove-led sting, warm bass, snappy drums; melodic hooks';
    let eraAnti = 'not brass top-40 fanfare not country twang not spoken news VO';
    if (yr < 1990) {
      eraTag += ', late-80s swing and new-jack flavor ok if tight';
    } else if (yr < 2010) {
      eraTag += ', Y2K rhythmic polish';
    } else {
      eraTag += ', contemporary urban-pop production';
      eraAnti += ' not trap 808 as only texture';
    }
    return { eraTag, eraAnti };
  }

  if (fmtKey === 'SPANISH') {
    let eraTag =
      'Latin / Spanish-language radio imaging: percussive bounce, bright hooks, regional heat without cliché mariachi parody';
    let eraAnti = 'not US English news brass sting not Nashville country not dry NPR read';
    if (yr < 2000) {
      eraTag += ', analog warmth ok';
    } else {
      eraTag += ', modern Latin-pop radio polish';
    }
    return { eraTag, eraAnti };
  }

  if (OLDIES_IMAGERY_FORMATS.has(fmtKey)) {
    let eraTag =
      'gold / classic hits radio imaging: retro guitar or electric piano hook, nostalgic bounce, tight dry close';
    let eraAnti = 'not modern CHR supersaws not news VO not big-band brass parade';
    if (yr < 1980) {
      eraTag += ', 50s–60s rock-n-roll or soul flavor ok';
    } else if (yr < 2000) {
      eraTag += ', 70s–90s gold-era radio energy';
    } else {
      eraTag += ', recall-based classic hits without EDM drops';
    }
    return { eraTag, eraAnti };
  }

  if (fmtKey === 'ADULT_CONTEMP') {
    let eraTag =
      'adult contemporary radio imaging: warm pad, soft drums, melodic sheen, romantic lift without shout';
    let eraAnti = 'not brass fanfare not sports talk punch not trap bounce';
    if (yr < 1990) {
      eraTag += ', soft-rock AC warmth';
    } else if (yr < 2010) {
      eraTag += ', polished AC radio sheen';
    } else {
      eraTag += ', wide modern AC without EDM aggression';
    }
    return { eraTag, eraAnti };
  }

  if (fmtKey === 'JAZZ') {
    let eraTag =
      'smooth jazz radio imaging: brushed rhythm, warm electric piano or sax hook, late-night polish';
    let eraAnti = 'not CHR brass sting not rock distortion not news VO';
    return { eraTag, eraAnti };
  }

  if (fmtKey === 'RELIGIOUS_TEACHING') {
    let eraTag =
      'faith teaching radio imaging: gentle organ or acoustic pad, reverent, calm dynamics';
    let eraAnti = 'not club EDM not CHR pop brass not sports hype';
    return { eraTag, eraAnti };
  }

  if (fmtKey === 'PUBLIC_ECLECTIC') {
    let eraTag =
      'noncommercial eclectic imaging: warm acoustic or light electronic texture; intimate not flashy';
    let eraAnti = 'not commercial CHR hype not brass fanfare';
    return { eraTag, eraAnti };
  }

  if (fmtKey === 'INDIETRONICA') {
    let eraTag =
      'indie electronic radio imaging: synth texture, dry punchy drums, quirky hook not arena';
    let eraAnti = 'not 1970s brass jingle not dubstep drop not orchestral trailer';
    return { eraTag, eraAnti };
  }

  let eraTag = 'contemporary radio imaging';
  let eraAnti = '';
  if (yr < 1960) {
    eraTag = '1950s radio, tube warmth, small studio band sting (broadcast booth not stage)';
    eraAnti = 'not 1970s rock stomp not 1990s sampler swing not loud 2000s brickwall master';
  } else if (yr < 1970) {
    eraTag = '1960s top-40 radio, punchy brass, plate reverb, mono-friendly';
    eraAnti = 'not 1980s gated snare wall not 1990s hip-hop drum loops not modern EDM';
  } else if (yr < 1980) {
    eraTag =
      '1970s US radio jingle: analog tape, brass stabs or ARP-style analog synth brass, warm plate reverb, tight dry mix, no drum machine patterns that sound like 1990s R&B or house';
    eraAnti =
      'strictly not 1990s production: no swing shuffle snares no glossy digital sheen no TR-808 dance kicks no Mariah-era pop mix width';
  } else if (yr < 1990) {
    eraTag = '1980s FM imaging, gated snare acceptable, DX7 or brass stabs, still analog-console era';
    eraAnti = 'not early-1990s new jack swing drums not 2000s brickwall limiting';
  } else if (yr < 2000) {
    eraTag = '1990s radio, polished digital sheen, punchy melodic vocals';
    eraAnti = 'not 2010s EDM drops not 2020s hyperpop';
  } else if (yr < 2010) {
    eraTag = '2000s radio, clean multiband loudness, modern beds';
    eraAnti = 'not 1970s lo-fi tape';
  } else if (yr < 2020) {
    eraTag = '2010s radio imaging, tight and bright';
  } else {
    eraTag = '2020s radio imaging, loudness-normalized, crisp';
  }
  return { eraTag, eraAnti };
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

  const audienceHint = typeof p.audienceHint === 'string' ? p.audienceHint.trim().slice(0, 100) : '';
  const positionHint = typeof p.positionHint === 'string' ? p.positionHint.trim().slice(0, 140) : '';

  const { eraTag, eraAnti } = eraTagsForYearAndFormat(yr, fmtKey);

  // On-air words only — tagline + brand as the player wrote them; verbalize digits for singability.
  const tagForLyrics = tag ? brandTextForJingleLyrics(tag, p.frequency, band) : '';
  const brandForLyrics = brandTextForJingleLyrics(brand, p.frequency, band);
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

  const tagParts = [
    `commissioned for calendar year ${yr} only`,
    // Anti-crowd early — `tags` sliced to 1000 chars; `dial` placed soon so it survives long hints.
    'studio ID sting; hard-stop end; dry silence after last note; no tail swell; broadcast booth or production room only; no large-venue room tone or event-hall wash',
    dialHint ? `dial ${dialHint}` : '',
    callSpaced && callsInBrand
      ? spoken
        ? `station call letters: speak as separate letters ${callSpaced}`
        : `call letters: sing as melodic vocal syllables ${callSpaced}`
      : '',
    callSpaced && !callsInBrand && spoken
      ? `station call letters: speak as separate letters ${callSpaced}; do not read call letters as one invented word`
      : '',
    tagIsShort
      ? 'short slogan line: pronounce every word clearly in standard English; do not invent syllables or scat; no gibberish'
      : '',
    eraTag,
    eraAnti,
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
};
