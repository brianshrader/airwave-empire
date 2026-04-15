'use strict';

/**
 * ShortAPI Suno v5.5 custom mode:
 * - `lyrics` = only words that should be sung/spoken on-air (Suno often vocalizes all of `lyrics`).
 * - `tags` = era, format, length, mix, anti-crowd, VO-read hints — never put production notes into `lyrics`.
 *
 * Identity is the player's **brand** (on-air name), not legal call letters.
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

/** FM MHz as announcer would say it (tags only). */
function fmMhzToRadioVerbal(freqStr) {
  const s = String(freqStr || '')
    .trim()
    .replace(/\s/g, '');
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return '';
  const intPart = m[1];
  const decPart = m[2] || '';
  let intWords;
  if (intPart.length === 3 && intPart[0] === '1') {
    intWords = intPart
      .split('')
      .map((d) => DIGIT_WORDS[parseInt(d, 10)])
      .join(' ')
      .replace(/\bzero\b/g, 'oh');
  } else if (intPart.length <= 2) {
    intWords = spellUnder100(parseInt(intPart, 10));
  } else {
    intWords = intPart
      .split('')
      .map((d) => DIGIT_WORDS[parseInt(d, 10)])
      .join(' ')
      .replace(/\bzero\b/g, 'oh');
  }
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
};

/** Formats where the global “radio jingle era” defaults (brass, punchy VO) fight the intended sound. */
const SOFT_IMAGERY_FORMATS = new Set(['BEAUTIFUL_MUSIC', 'MOR', 'ADULT_STANDARDS', 'PUBLIC_CLASSICAL']);
/** Guitar-forward formats — avoid decade ladder that assumes “top 40 brass sting” in the 60s–80s. */
const ROCK_IMAGERY_FORMATS = new Set(['ALBUM_ROCK', 'CLASSIC_ROCK', 'ALT_ROCK']);
/** Rhythmic pop / R&B — short ID can use groove; different from soft AC or news VO. */
const RHYTHMIC_POP_FORMATS = new Set(['URBAN_CONTEMP', 'RHYTHMIC', 'SOUL_RNB', 'HOT_AC']);
/** Formats that should sound like a sung hook / melodic ID, not a spoken announcer read. */
const SPOKEN_FORWARD_FORMATS = new Set([
  'NEWS_TALK',
  'SPORTS_TALK',
  'ALL_NEWS',
  'PODCAST_TALK',
  'PUBLIC_NEWS',
]);

/**
 * Vocal / delivery hint for tags — default was VO-style for all formats, which Suno often read as spoken word.
 * @param {boolean} [hasTagline] when true on soft formats, do not ask for “wordless pad” (conflicts with sung tagline → gibberish).
 */
function vocalDeliveryTag(fmtKey, hasTagline) {
  if (SPOKEN_FORWARD_FORMATS.has(fmtKey)) {
    return 'VO delivery: spaced letters for call letters; numbers spoken as words not digits';
  }
  if (SOFT_IMAGERY_FORMATS.has(fmtKey)) {
    if (hasTagline) {
      return 'soft sung vocal; sing the lyrics field exactly as standard English words; clear consonants; no wordless pad; no humming; no scat; no invented syllables or gibberish; gentle melodic line; minimal percussion';
    }
    return 'soft melodic sung line or light wordless pad; gentle floating vocal; not spoken-word announcer; minimal percussion';
  }
  if (fmtKey === 'GOSPEL') {
    return 'gospel uplift: choir stab or solo; reverent sung line; not news-talk dry read';
  }
  if (ROCK_IMAGERY_FORMATS.has(fmtKey)) {
    return 'sung hook or guitar-led sting; rock energy; not spoken-word announcer; keep ID short';
  }
  if (fmtKey === 'COUNTRY') {
    return 'country melodic sung ID; warm twang ok; not spoken-word dry VO only';
  }
  if (fmtKey === 'SPANISH') {
    return 'Latin pop melodic hook; Spanish-language sung line ok; not monotone spoken English VO';
  }
  if (fmtKey === 'TOP40') {
    if (hasTagline) {
      return 'CHR sung jingle: melodic lead with clear pitch; sing tagline and station name as pop vocal lines; no spoken-word announcer; no DJ talkover; no monotone narration';
    }
    return 'CHR sung station ID: punchy melodic lead vocal; fully sung not spoken; not dry VO; short sting keep drums controlled';
  }
  if (RHYTHMIC_POP_FORMATS.has(fmtKey)) {
    return 'sung melodic hook; contemporary rhythmic pop groove ok for a short sting; not monotone spoken word';
  }
  return 'sung melodic station-ID hook; not spoken-word dry read; keep drums light for IDs';
}

/**
 * Year-based imaging defaults; for soft formats use a dedicated bed so era does not override format.
 */
function eraTagsForYearAndFormat(yr, fmtKey) {
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

function buildSunoJingleArgs(p) {
  const brand = String(p.brand || 'Station').trim().slice(0, 100) || 'Station';
  const yr = Math.floor(Number(p.year) || 1970);
  const fmtLabel = String(p.format || 'Radio').trim().slice(0, 80);
  const fmtKey = normalizeJingleFormatId(p.formatId);
  const tag = typeof p.tagline === 'string' ? p.tagline.trim().slice(0, 60) : '';
  const band = String(p.band || '').toUpperCase() === 'FM' ? 'FM' : String(p.band || '').toUpperCase() === 'AM' ? 'AM' : '';
  const dialHint = dialVerbalForTags(p.frequency, band);

  const formatHint = FORMAT_SUNO[fmtKey] || 'mainstream music radio';

  const audienceHint = typeof p.audienceHint === 'string' ? p.audienceHint.trim().slice(0, 100) : '';
  const positionHint = typeof p.positionHint === 'string' ? p.positionHint.trim().slice(0, 140) : '';

  const { eraTag, eraAnti } = eraTagsForYearAndFormat(yr, fmtKey);

  // Singable lines ONLY — no brackets, no “say…”, no production notes (those go to tags).
  // Replace dial numerals in brand/tagline so TTS doesn’t garble (e.g. "103.5" → "one hundred three five").
  const tagForLyrics = tag ? verbalizeDialInText(tag, p.frequency, band) : '';
  const brandForLyrics = verbalizeDialInText(brand, p.frequency, band);
  // Slogan/tagline first, then on-air brand (typical jingle: hook line, then station ID).
  const lyricLines = [];
  if (tagForLyrics) lyricLines.push(tagForLyrics);
  lyricLines.push(brandForLyrics);
  const lyrics = lyricLines.join('\n').slice(0, 1200);

  const tagParts = [
    `commissioned for calendar year ${yr} only`,
    // Anti-crowd early — `tags` sliced to 1000 chars; `dial` placed soon so it survives long hints.
    'studio ID sting; hard-stop end; dry silence after last note; no tail swell; broadcast booth or production room only; no large-venue room tone or event-hall wash',
    dialHint ? `dial ${dialHint}` : '',
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
  amKhzToRadioVerbal,
  fmMhzToRadioVerbal,
  verbalizeDialInText,
};
