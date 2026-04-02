/**
 * Cosmetic talent headshots — local radio personality, not glamour photography.
 * No on-image text (handled in constraints).
 */

const WARDROBE_DESC = {
  casual: 'simple everyday clothing, relaxed local radio studio look, unpretentious',
  semiPro:
    'neat on-air look: collared shirt or blouse with cardigan, sweater, or light jacket — small-market broadcaster, not corporate head office; avoid a default blazer unless era styling clearly calls for it',
  /** Used when semiPro + female — reduces samey “woman in blazer” promos. */
  semiProFemale:
    'polished but not corporate: neat blouse, knit top, cardigan, sweater, or station polo; if a jacket appears, make it casual or era-appropriate — not a generic business blazer unless the period clearly demands it',
  oddball:
    'slightly mismatched, dated, or eccentric wardrobe — believable and human, not cartoonish or costume-like',
};

/** These get an extra “not smiling” lock line — models still default to grins without it. */
const STRICT_NON_SMILE_EXPRESSIONS = new Set([
  'restingFace',
  'deadpan',
  'serious',
  'stern',
  'tired',
  'neutral',
  'preoccupied',
]);

const EXPRESSION_DESC = {
  restingFace:
    'face at rest — mouth relaxed closed, NOT smiling, no teeth, no polite grin (DMV / employee-ID energy)',
  deadpan:
    'deliberately flat mouth line, unsmiling — no upturned corners, no cheer',
  serious: 'straight-faced, focused, slightly intense — not smiling',
  stern: 'slight frown or concentration, mouth closed — not smiling',
  tired: 'mildly worn-out, long-shift energy — mouth neutral or slack, not a smile',
  neutral: 'plain neutral mouth and eyes — unremarkable, not smiling',
  preoccupied: 'mid-thought or distracted look, mouth closed neutral — not smiling',
  smug: 'faint self-satisfied smirk only — not a broad smile, ideally no teeth',
  awkward:
    'uncomfortable in front of the camera — tense closed mouth preferred; if any smile, small and awkward, not a big grin',
  forcedSmile: 'a polite broadcaster smile that feels a little forced or tired',
};

const SETTING_DESC = {
  radioStudio:
    'on-air broadcast booth or radio studio: acoustic foam or panels, equipment rack or mixer edge, typical station clutter — headphones optional but at least one large broadcast microphone on a stand or boom clearly in frame',
  plainBackdrop:
    'studio promo portrait against a simple wall inside a real radio station — still show a broadcast microphone on stand or boom in frame plus clear studio/booth context (foam, rack, or console), not a seamless paper sweep with only headphones',
  officeCorner:
    'small station office that opens into an on-air area — visible broadcast microphone (desk or boom) and cues of a working radio facility (console corner, rack, or booth doorway), not just headphones on a person',
};

const ERA_STYLE = {
  '1970s':
    'simpler styling, flat ugly fluorescent or flash, older local promo-photo feel, slightly muted colors — not flattering',
  '1980s':
    'bigger hair, loud dated station energy, saturated film snapshot — still unflattering lighting, not glossy magazine',
  '1990s':
    'dated station promo or early digital snapshot — flat office light, not glamour retouching',
  '2000s+':
    'modern casual workplace snapshot, believable small-market radio — flat or harsh light, not a LinkedIn glow-up',
};

/**
 * @param {{
 *   eraBucket: string,
 *   wardrobeType: string,
 *   expressionType: string,
 *   settingType: string,
 *   gender?: 'male'|'female'|null,
 *   heritagePrompt?: string,
 *   facialDetail?: string,
 *   demeanor?: string,
 *   ageRange?: string,
 *   bodyType?: string,
 *   faceShape?: string,
 *   hairStyle?: string,
 *   personalStyle?: string,
 *   gameplayNotes?: string,
 *   variationSeed?: string,
 *   attractivenessAnchor?: string
 * }} p
 */
function buildPortraitPrompt(p) {
  const era = ERA_STYLE[p.eraBucket] || ERA_STYLE['2000s+'];
  let wd = WARDROBE_DESC[p.wardrobeType] || WARDROBE_DESC.casual;
  if (p.wardrobeType === 'semiPro' && p.gender === 'female') {
    wd = WARDROBE_DESC.semiProFemale;
  }
  const ex = EXPRESSION_DESC[p.expressionType] || EXPRESSION_DESC.neutral;
  const st = SETTING_DESC[p.settingType] || SETTING_DESC.plainBackdrop;
  const genderLine =
    p.gender === 'female'
      ? 'Subject is a woman; appearance must read clearly as female. Use a feminine hairstyle and a natural feminine hairline — no male-pattern baldness, no receding hairline in the male-typical sense, and no other cues that read as a man’s hair loss.'
      : p.gender === 'male'
        ? 'Subject is a man; appearance must read clearly as male. Hairstyle and hairline may be masculine, including age-typical receding or thinning if it matches the described hair and era.'
        : 'Subject is an adult; natural, believable gender presentation — avoid male-pattern balding or a receding male hairline unless the described hair explicitly calls for it.';

  const age = p.ageRange || 'adult';
  const bodyPhrase = p.bodyType ? `${p.bodyType} build` : 'average build';
  const bodyArticle = /^[aeiou]/i.test(bodyPhrase) ? 'an' : 'a';
  const face = p.faceShape || 'distinctive';
  const detail = p.facialDetail || 'individual facial character';
  const hair = p.hairStyle || 'natural hair';
  const look = p.personalStyle || 'casual';
  const eraLabel = p.eraBucket || '2000s+';
  const who = p.heritagePrompt || 'local radio professional';
  const vibe = p.demeanor || 'natural, relaxed expression';

  const anchor =
    p.attractivenessAnchor ||
    'Facial attractiveness must read as strictly ordinary — not pretty, not “leading role.”';

  const lead = [
    `NOT a model, actor headshot, dating-app photo, Instagram face, or luxury-brand ad. NOT “Hollywood handsome” or “conventionally stunning.”`,
    `Head-and-shoulders portrait of one specific ${who}, apparently in their ${age}, with ${bodyArticle} ${bodyPhrase}.`,
    `Their face reads as ${face}, with ${detail} — a memorable, ordinary person; visibly not a model, influencer, or network-TV anchor look.`,
    `MANDATORY LOOKS TARGET: ${anchor}`,
    `Hair: ${hair}. On-camera presence: ${vibe}; ${look} overall presentation.`,
    `Lighting: flat, harsh, or cheap — office fluorescent, on-camera flash snap, or dull station lighting. No ring light, no beauty dish, no golden-hour glow, no soft glam.`,
    `Small-market ${eraLabel} station promo realism — ${era}.`,
  ].join(' ');

  const gameLine = p.gameplayNotes ? `Light character note (do not erase unique face): ${p.gameplayNotes}.` : '';
  const seedLine = p.variationSeed
    ? `Likeness anchor ${p.variationSeed} — this person must read as a distinct individual.`
    : '';

  return [
    lead,
    genderLine,
    'DIVERSITY LOCK: Follow the exact heritage and skin-tone cues in the subject line above — this portrait is one station employee in a varied staff. Do not reuse one default skin color or ethnicity across images; render natural variation (fair, olive, brown, deep) as described.',
    'CASTING: local radio personality energy — goofy, average, or slightly odd-looking is ideal; conventionally handsome or pretty is wrong for this image. Think character actor, morning zoo crew, DMV photo energy, or awkward community booster — not a catalog model.',
    'Avoid identical “same face” results: distinctive features, natural asymmetry, believable skin texture; not airbrushed, not symmetry-perfect, not glamour lighting.',
    'STUDIO GEAR (mandatory): At least one large broadcast / studio microphone must be clearly visible (desk stand, boom arm, or side-address studio mic). Headphones alone are not enough — do not output only headphones with no microphone.',
    'STUDIO SETTING (mandatory): The scene must read as a radio on-air studio or booth — acoustic treatment, equipment rack, mixer/console edge, broadcast furniture, or typical station interior. Not a blank void, not a generic office with zero broadcast gear besides headphones.',
    `Environment framing: ${st}`,
    'Believable awkward station snapshot or promo still — one real person, not stock photography, not dating-app headshots, not aspirational beauty casting.',
    `Wardrobe: ${wd}`,
    `Secondary micro-mood (subtle): ${ex}`,
    STRICT_NON_SMILE_EXPRESSIONS.has(p.expressionType)
      ? 'Expression (mandatory): subject is not smiling — closed or neutral mouth, no visible teeth, no broadcast grin.'
      : '',
    gameLine,
    seedLine,
    'No caricature, no costume stereotypes, no exaggerated comedy face; subtle human imperfection is good.',
    'CRITICAL: The image must show only the person and environment — absolutely no text, no letters, no numbers, no logos, no captions, no name tags, no station call signs, no watermarks.',
  ]
    .filter(Boolean)
    .join(' ');
}

module.exports = {
  buildPortraitPrompt,
  WARDROBE_DESC,
  EXPRESSION_DESC,
  SETTING_DESC,
  ERA_STYLE,
  STRICT_NON_SMILE_EXPRESSIONS,
};
