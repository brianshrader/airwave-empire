/**
 * Builds compact image prompts from station metadata.
 * Goal: print-era broadcast wordmark + readable contrast; style hints stay off the canvas as extra text.
 */

/** @param {number} year */
function eraBucket(year) {
  const y = Math.floor(Number(year) || 1970);
  if (y < 1980) return { key: '1970s', label: '1970s' };
  if (y < 1990) return { key: '1980s', label: '1980s' };
  if (y < 2000) return { key: '1990s', label: '1990s' };
  if (y < 2010) return { key: '2000s', label: '2000s' };
  return { key: '2010s_plus', label: '2010s and later' };
}

/**
 * Map free-text format (from game FM labels or API) to aesthetic notes.
 * @param {string} formatRaw
 */
function formatStyleNotes(formatRaw) {
  const f = String(formatRaw || '').toLowerCase();
  if (/rock|album|classic rock|alternative|grunge|aor/.test(f)) {
    return 'Bold slab-serif or heavy grotesk energy, guitar-era rock feel, stadium / album-art influence, slightly gritty ink or screen-print texture.';
  }
  if (/country|western|americana/.test(f)) {
    return 'Western slab or script accents, rural highway / rodeo poster feel, warm earth tones, honest small-market typography feel.';
  }
  if (/news|talk|sports talk|public|podcast|all news/.test(f)) {
    return 'Authoritative newsroom weight, strong masthead or network-affiliate vibe, minimal ornament, serious broadcast credibility.';
  }
  if (/top\s*40|chr|pop|rhythmic|hit(s)?\s*radio/.test(f)) {
    return 'Bright chart-radio energy, bubble letters or playful condensed sans, disco-to-MTV era billboard feel without digital chrome.';
  }
  if (/adult contemp|hot ac|soft ac|ac\b|beautiful|easy/.test(f)) {
    return 'Soft rounded letterforms, lifestyle magazine calm, upscale but still analog — airbrush or soft gradient only if contrast stays strong (no whisper-pale pastels on white), not glassy.';
  }
  if (/oldies|classic hits|nostalgia|standards|golden/.test(f)) {
    return 'Nostalgic marquee or jukebox feel, heritage “greatest hits” mood, warm retro palette, celebration of the back catalog.';
  }
  return 'Authentic American broadcast-station branding mood — readable at small sizes, radio-appropriate.';
}

/**
 * Era-specific visual guardrails (additive, style-only).
 * @param {string} eraKey
 */
function eraStyleNotes(eraKey) {
  switch (eraKey) {
    case '1970s':
      return '1970s print and bumper-sticker feel: Letraset / phototype texture, limited spot colors, slight paper grain, no neon cyber look.';
    case '1980s':
      return '1980s broadcast promo art: chrome-free airbrush or flat color blocks, MTV-adjacent bold shapes but still print-native, no 3D bevels.';
    case '1990s':
      return '1990s radio promo art: chunky sans, sticker and van-wrap energy, still pre-digital-gloss — matte vinyl or screen print.';
    case '2000s':
      return 'Early 2000s station imaging: clean vector-friendly shapes but analog finish, no iOS-flat / app-icon minimalism.';
    case '2010s_plus':
      return 'Contemporary heritage redesign language: simplified retro lockup that could live on a T-shirt or van, still matte print finish.';
    default:
      return '';
  }
}

/**
 * @param {{
 *   stationName: string,
 *   format: string,
 *   year: number,
 *   tone?: string,
 *   frequency?: string,
 *   band?: string
 * }} meta
 */
function buildLogoPrompt(meta) {
  const stationName = String(meta.stationName || 'Station').trim();
  const format = String(meta.format || 'Radio').trim();
  const year = Math.floor(Number(meta.year) || 1970);
  const tone = String(meta.tone || '').trim();
  const band = String(meta.band || '').trim().toUpperCase();

  const { label: eraLabel, key: eraKey } = eraBucket(year);
  const fmtNotes = formatStyleNotes(format);
  const eraNotes = eraStyleNotes(eraKey);

  const bandStyle =
    band === 'AM' ? 'AM' : band === 'FM' ? 'FM' : 'AM/FM';

  // frequency omitted — avoids painting dial numbers as extra logo text

  return [
    `Wordmark only (exact string, no added words): "${stationName}".`,
    `Style like ${year} ${eraLabel} US ${bandStyle} ${format} station art — color, weight, shape, texture only; no extra readable words beyond the wordmark.`,
    tone ? `Scene mood (style only, not text): ${tone}.` : '',
    `Look & feel: ${fmtNotes} ${eraNotes}`.trim(),
    'Composition: bold retro type, 2–4 spot colors, matte print or light airbrush, bumper-sticker / van-decal layout.',
    'Contrast: small-size legible; saturated ink on light fields OR light letters on mid/dark band; optional heavy stroke or shadow; avoid washed pastels on white.',
    'Background: transparent or flat field. Matte print-era finish — vector-sticker or screen-print, not photo collage, 3D chrome, app icon, or esports gloss.',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Vehicle body style by game year so remote vans look like contemporary fleet trucks when the sim is modern,
 * not always a vintage 1970s wood-paneled van.
 * @param {number} year
 */
function remoteVanVehicleNotes(year) {
  const y = Math.floor(Number(year) || 1970);
  if (y < 1980) {
    return 'Use a period-accurate 1970s American step van or full-size van (e.g. Ford Econoline era) with ladder rack — believable for the decade.';
  }
  if (y < 1995) {
    return 'White 1980s–early-90s fleet van or small box truck, radio-remote spec, roof mast credible for the era.';
  }
  if (y < 2005) {
    return 'Late-90s / early-2000s white broadcast remote: full-size fleet van or box truck, professional news-radio layout.';
  }
  if (y < 2015) {
    return '2000s–early-2010s Sprinter / E-Series–class white fleet van, roof mast, cables, professional cluster vehicle.';
  }
  return 'Current-era white fleet remote: Sprinter, Transit, ProMaster, or Express class, roof mast and cables, modern news-radio fleet.';
}

/**
 * Prompt for Grok image *edit*: reference must be the station logo; output is a remote van scene.
 * @param {{
 *   stationName: string,
 *   format: string,
 *   year: number,
 *   tone?: string,
 *   band?: string
 * }} meta
 */
function buildRemoteVanPrompt(meta) {
  const stationName = String(meta.stationName || 'Station').trim();
  const format = String(meta.format || 'Radio').trim();
  const year = Math.floor(Number(meta.year) || 1970);
  const tone = String(meta.tone || '').trim();
  const band = String(meta.band || '').trim().toUpperCase();
  const { label: eraLabel } = eraBucket(year);
  const bandNote = band === 'AM' ? 'AM heritage' : band === 'FM' ? 'FM broadcast' : 'radio';
  const vehicleNotes = remoteVanVehicleNotes(year);

  return [
    'Reference image = official station logo. Full-body custom livery: match reference colors, shapes, and lettering; wrap stripes and color blocks around panels and wheel wells like factory paint — same lockup, no invented callsign.',
    'Paint reads as real clearcoat: logo follows door curvature and light; one cohesive vehicle surface (no floating graphic, no sticker halo, no UI paste).',
    `Context (no extra on-image text beyond the logo): "${stationName}", ${format}, year ${year}, ${bandNote}.`,
    tone ? `Scene mood (not text): ${tone}.` : '',
    vehicleNotes,
    `Photoreal three-quarter side view, ${eraLabel} US setting, one remote van at a fair, stadium lot, or street event — mast, cables, sandbags or chairs; optional engineer silhouette. Livery hero on the side.`,
    'Camera: ~50mm documentary, rectilinear, square pixels, natural fleet-van proportions; wheels circular; roof height and wheelbase like a real parked Sprinter / E-Series / Transit class.',
    'Light: daylight, shallow DOF, light grain. Credible news-remote photograph.',
  ]
    .filter(Boolean)
    .join(' ');
}

module.exports = { buildLogoPrompt, buildRemoteVanPrompt, eraBucket, formatStyleNotes };
