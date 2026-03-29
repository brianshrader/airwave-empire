/**
 * Cosmetic talent headshots — local radio personality, not glamour photography.
 * No on-image text (handled in constraints).
 */

const WARDROBE_DESC = {
  casual: 'simple everyday clothing, relaxed local radio studio look, unpretentious',
  semiPro:
    'blazer or sport coat with collared shirt, neat but slightly stiff small-market broadcaster look',
  oddball:
    'slightly mismatched, dated, or eccentric wardrobe — believable and human, not cartoonish or costume-like',
};

const EXPRESSION_DESC = {
  forcedSmile: 'a polite broadcaster smile that feels a little forced or tired',
  serious: 'straight-faced, focused, slightly intense',
  smug: 'faint self-satisfied smirk, harmless',
  tired: 'mildly worn-out, long-shift energy',
  awkward: 'slightly uncomfortable in front of the camera, endearing',
  neutral: 'plain neutral expression, unremarkable promo face',
};

const SETTING_DESC = {
  radioStudio:
    'broadcast radio studio: visible studio microphone and/or broadcast headphones, acoustic treatment — no readable text or logos on equipment',
  plainBackdrop:
    'plain painted wall or paper backdrop, institutional portrait setup; still in a radio studio with a studio mic and/or headphones visible',
  officeCorner:
    'small office corner opening into a radio studio feel — studio microphone and/or headphones visible, beige workplace lighting',
};

const ERA_STYLE = {
  '1970s':
    'simpler styling, flatter lighting, older local promo-photo feel, slightly muted colors',
  '1980s':
    'bigger hair, louder or slightly tacky professional polish, saturated film snapshot',
  '1990s':
    'cleaner but still dated station promo look, early digital snapshot softness',
  '2000s+': 'more modern casual workplace or studio snapshot, believable small-market radio',
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
 *   variationSeed?: string
 * }} p
 */
function buildPortraitPrompt(p) {
  const era = ERA_STYLE[p.eraBucket] || ERA_STYLE['2000s+'];
  const wd = WARDROBE_DESC[p.wardrobeType] || WARDROBE_DESC.casual;
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

  const lead = [
    `Head-and-shoulders portrait of one specific ${who}, apparently in their ${age}, with ${bodyArticle} ${bodyPhrase}.`,
    `Their face reads as ${face}, with ${detail} — visibly different from a generic headshot; not a model template.`,
    `Hair: ${hair}. On-camera presence: ${vibe}; ${look} overall presentation.`,
    `Small-market ${eraLabel} station promo realism — ${era}.`,
  ].join(' ');

  const gameLine = p.gameplayNotes ? `Light character note (do not erase unique face): ${p.gameplayNotes}.` : '';
  const seedLine = p.variationSeed
    ? `Likeness anchor ${p.variationSeed} — this person must read as a distinct individual.`
    : '';

  return [
    lead,
    genderLine,
    'Avoid identical “same face” results: distinctive features, natural asymmetry, believable skin texture; not airbrushed, not symmetry-perfect.',
    'Setting: a working radio studio — professional studio microphone and/or on-air headphones visible (broadcast gear, not a concert stage).',
    `Environment framing: ${st}`,
    'Believable awkward station snapshot or promo still — one real person, not stock photography.',
    `Wardrobe: ${wd}`,
    `Secondary micro-mood (subtle): ${ex}`,
    gameLine,
    seedLine,
    'No caricature, no costume stereotypes, no exaggerated comedy face; subtle human imperfection is good.',
    'CRITICAL: The image must show only the person and environment — absolutely no text, no letters, no numbers, no logos, no captions, no name tags, no station call signs, no watermarks.',
  ]
    .filter(Boolean)
    .join(' ');
}

module.exports = { buildPortraitPrompt, WARDROBE_DESC, EXPRESSION_DESC, SETTING_DESC, ERA_STYLE };
