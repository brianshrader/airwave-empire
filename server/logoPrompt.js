/**
 * Builds a tightly controlled image prompt from station metadata.
 * Goal: print-era / broadcast-sticker authenticity — no glossy modern branding.
 * Format, year, era, band, tone are style direction only; they must not become logo text.
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

  // frequency omitted from prompt to avoid dial numbers being painted as logo text

  return [
    'The only text that may appear in the logo is the stationName string exactly as provided. Do not add call letters, format names, years, era labels, slogans, subtitles, frequencies, or extra descriptive text unless they are already part of stationName.',
    `Render this exact string as the logo wordmark (only these words, no additions): "${stationName}".`,
    `Use visual styling inspired by ${year} American ${bandStyle} radio broadcast branding and by ${eraLabel} American ${format}-format station graphic design — color, weight, ornament, and composition only; do not paint the format name, year digits, era labels, or band letters as readable text.`,
    tone ? `Mood and attitude for the art direction only (not as on-image text): ${tone}.` : '',
    `Graphic vocabulary (invisible cues — not words to render): ${fmtNotes}`,
    `Period surface treatment (invisible cues — not words to render): ${eraNotes}`,
    'Layout: bold retro typography for the station name string only; print-era radio feel; limited color palette (2–4 colors); flat or lightly airbrushed; bumper-sticker or van-decal composition.',
    'Readability (mandatory): the wordmark must be legible at small size. Use strong contrast — never pale pastel, ice blue, blush pink, or washed-out tints on white or off-white. Never put yellow, cream, gold, or light lime on white or near-white (those combinations are illegible). If the background is light, use deep navy, black, dark red, forest green, or other saturated dark ink for the letters; if the letters are light, place them on a solid mid or dark band, badge, or field — not on white. Prefer either a solid colored or mid-gray background behind the name, or a dark outline / heavy stroke / crisp drop shadow around the letters so they separate clearly from the background.',
    'Background: transparent or plain flat field. If the field is white or very light, the station name must still read clearly (outline, shadow, or dark letters as above). Hard constraints: no modern glossy effects, no esports or gaming aesthetic, no photorealism, no stock-photo collage, no fake 3D chrome, no smartphone-app icon style.',
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
    return 'Use a 1980s–early-90s white fleet van or box truck typical of radio remotes — not wood-paneled consumer vans unless clearly era-specific.';
  }
  if (y < 2005) {
    return 'Use a late-90s / early-2000s broadcast remote van: white fleet full-size van or small box truck with mast — professional news-radio look.';
  }
  if (y < 2015) {
    return 'Use a 2000s–early-2010s remote vehicle: Mercedes Sprinter, Ford E-Series, or similar white fleet van with roof mast — NOT a 1970s wood-grain consumer van.';
  }
  return 'Use a current-era professional remote broadcast vehicle: Mercedes-Benz Sprinter, Ford Transit, Ram ProMaster, or Chevrolet Express–class white fleet van with roof mast and cables — modern news-radio fleet look. Do NOT depict a vintage 1970s–80s wood-paneled personal van unless the game year is in that decade.';
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
    'The attached reference image is the official station logo artwork. Treat the van as if it were painted and designed as a cohesive custom livery: the logo lockup (same colors, shapes, and lettering as the reference) is the centerpiece of a full-body paint scheme — not a rectangle slapped on the door. Extend the logo palette into accent stripes, color blocks, or subtle two-tone panels that wrap naturally around corners and wheel wells so branding feels intentional and factory-custom. Do not invent different call letters or a new logo.',
    'Logo integration (critical): the artwork must read as automotive paint and clearcoat — same lighting, specular highlights, and panel curvature as the rest of the van; perspective-correct across doors and seams; no magnetic panel edge, no obvious sticker outline, no vinyl wrap seam cutting across the graphic. The logo must NOT look like a flat UI overlay, a pasted decal with a thick white halo, or a layer separate from the metal. No duplicate logos on every surface unless it fits the livery design.',
    `Station identity (scene context only — do not add extra readable text beyond the logo): "${stationName}", ${format} format, calendar year ${year}, ${bandNote}.`,
    tone ? `Mood for the scene (not as on-image text): ${tone}.` : '',
    vehicleNotes,
    `Photorealistic wide 3/4 view (${eraLabel} American setting) of one radio remote broadcast van parked at a live event: street fair, concert gate, stadium lot, or county fair — pick one. Include extendable mast antenna, coiled cables, sandbags or folding chairs; optional engineer silhouette. Show the integrated paint livery prominently on the side — logo and supporting colors flowing together.`,
    'Lighting: natural daylight, documentary news photography, shallow depth of field, mild film grain OK. No CGI sheen, no holograms, no neon cyberpunk, no futuristic HUD.',
  ]
    .filter(Boolean)
    .join(' ');
}

module.exports = { buildLogoPrompt, buildRemoteVanPrompt, eraBucket, formatStyleNotes };
