'use strict';

/**
 * ShortAPI Suno v5.5 custom mode:
 * - `lyrics` = only words that should be sung/spoken on-air (Suno often vocalizes all of `lyrics`).
 * - `tags` = era, format, length, mix — never put those into `lyrics`.
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

/** Internal format id → short sonic hint for Suno tags */
const FORMAT_SUNO = {
  TOP40: 'bright hit-radio, high energy, tight vocals',
  NEWS_TALK: 'authoritative news-talk imaging, serious but punchy',
  SPORTS_TALK: 'sports radio energy, bold and stadium-adjacent',
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
  CLASSIC_HITS: 'classic hits party energy, singalong',
  BEAUTIFUL_MUSIC: 'easy listening / beautiful music, soft beds',
  ADULT_STANDARDS: 'standards / nostalgia elegance',
  PUBLIC_NEWS: 'public radio credibility, measured',
  PUBLIC_CLASSICAL: 'classical refinement, restrained',
  PUBLIC_ECLECTIC: 'eclectic noncomm warmth',
  RELIGIOUS_TEACHING: 'faith teaching tone, respectful',
  INDIETRONICA: 'indie electronic texture',
};

/**
 * @param {{ brand: string, format: string, year: number, tagline?: string, frequency?: string, band?: string, formatId?: string }} p
 */
function buildSunoJingleArgs(p) {
  const brand = String(p.brand || 'Station').trim().slice(0, 100) || 'Station';
  const yr = Math.floor(Number(p.year) || 1970);
  const fmtLabel = String(p.format || 'Radio').trim().slice(0, 80);
  const fmtKey = String(p.formatId || '')
    .trim()
    .toUpperCase();
  const tag = typeof p.tagline === 'string' ? p.tagline.trim().slice(0, 60) : '';
  const band = String(p.band || '').toUpperCase() === 'FM' ? 'FM' : String(p.band || '').toUpperCase() === 'AM' ? 'AM' : '';
  const dialHint = dialVerbalForTags(p.frequency, band);

  const formatHint = FORMAT_SUNO[fmtKey] || 'mainstream music radio';

  let eraTag = 'contemporary radio imaging';
  /** Pull arrangement away from wrong decade (models often default to 90s–200s polish). */
  let eraAnti = '';
  if (yr < 1960) {
    eraTag = '1950s radio, tube warmth, live-room band sting';
    eraAnti = 'not 1970s rock stomp not 1990s sampler swing not loud 2000s brickwall master';
  } else if (yr < 1970) {
    eraTag = '1960s top-40 radio, punchy brass, plate reverb, mono-friendly';
    eraAnti = 'not 1980s gated snare wall not 1990s hip-hop drum loops not modern EDM';
  } else if (yr < 1980) {
    eraTag =
      '1970s US radio jingle: analog tape, live horn punches or ARP-style analog synth brass, warm plate reverb, tight dry announcer, no drum machine patterns that sound like 1990s R&B or house';
    eraAnti =
      'strictly not 1990s production: no swing shuffle snares no glossy digital sheen no TR-808 dance kicks no Mariah-era pop mix width';
  } else if (yr < 1990) {
    eraTag = '1980s FM imaging, gated snare acceptable, DX7 or brass stabs, still analog-console era';
    eraAnti = 'not early-1990s new jack swing drums not 2000s brickwall limiting';
  } else if (yr < 2000) {
    eraTag = '1990s radio, polished digital sheen, punchy VO';
    eraAnti = 'not 2010s EDM drops not 2020s hyperpop';
  } else if (yr < 2010) {
    eraTag = '2000s radio, clean multiband loudness, modern beds';
    eraAnti = 'not 1970s lo-fi tape';
  } else if (yr < 2020) {
    eraTag = '2010s radio imaging, tight and bright';
  } else {
    eraTag = '2020s radio imaging, loudness-normalized, crisp';
  }

  // Singable lines ONLY — no brackets, no “say…”, no production notes (those go to tags).
  const lyricLines = [brand];
  if (tag) lyricLines.push(tag);
  const lyrics = lyricLines.join('\n').slice(0, 1200);

  const tagParts = [
    `commissioned for calendar year ${yr} only`,
    eraTag,
    eraAnti,
    fmtLabel,
    formatHint,
    'short radio station ID',
    'six to twelve seconds',
    'broadcast jingle mix',
    band || '',
    dialHint ? `dial ${dialHint}` : '',
  ].filter(Boolean);

  const tags = tagParts.join('; ').slice(0, 1000);

  const sunoTitle = `${brand} — ${yr}`.slice(0, 100);

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
};
