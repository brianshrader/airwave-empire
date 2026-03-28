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
 *   gender?: 'male'|'female'|null
 * }} p
 */
function buildPortraitPrompt(p) {
  const era = ERA_STYLE[p.eraBucket] || ERA_STYLE['2000s+'];
  const wd = WARDROBE_DESC[p.wardrobeType] || WARDROBE_DESC.casual;
  const ex = EXPRESSION_DESC[p.expressionType] || EXPRESSION_DESC.neutral;
  const st = SETTING_DESC[p.settingType] || SETTING_DESC.plainBackdrop;
  const genderLine =
    p.gender === 'female'
      ? 'Subject is a woman; appearance must read clearly as female.'
      : p.gender === 'male'
        ? 'Subject is a man; appearance must read clearly as male.'
        : 'Subject is an adult; natural, believable gender presentation.';

  return [
    'Head-and-shoulders portrait of a single fictional local American radio personality.',
    genderLine,
    'Setting: a working radio studio — include a professional studio microphone and/or on-air headphones (broadcast gear, not a concert stage).',
    'Diverse, natural-looking adult; believable small-market media promo photo or awkward studio snapshot.',
    'Slightly imperfect lighting and composition — not fashion photography, not glamorous, not celebrity-like, not influencer-style.',
    `Era is only visual styling: ${era}`,
    `Wardrobe (visual only): ${wd}`,
    `Expression: ${ex}`,
    `Setting: ${st}`,
    'Subtle human oddness is welcome; avoid grotesque distortion, exaggerated comedy faces, and beauty-retouch glamour.',
    'CRITICAL: The image must show only the person and environment — absolutely no text, no letters, no numbers, no logos, no captions, no name tags, no station call signs, no watermarks.',
  ].join(' ');
}

module.exports = { buildPortraitPrompt, WARDROBE_DESC, EXPRESSION_DESC, SETTING_DESC, ERA_STYLE };
