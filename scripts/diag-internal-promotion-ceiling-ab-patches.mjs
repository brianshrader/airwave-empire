/**
 * Diagnostic-only patches for internal promotion ceiling A/B/C/D comparison.
 * Does not modify shipped src/ — applied only when loading legacy into VM.
 */

const TRY_INTERNAL_FN = `function wlMorningTryAiInternalPromotion(s){
  if(typeof wlMorningSuccessor==='undefined')return null;
  try{return wlMorningSuccessor.tryAiInternalMorningPromotion(s,G);}catch(_e){return null;}
}`;

const TRY_INTERNAL_WITH_WRAPPER = `function wlMorningTryAiInternalPromotion(s){
  if(typeof wlMorningSuccessor==='undefined')return null;
  try{
    const promoted=wlMorningSuccessor.tryAiInternalMorningPromotion(s,G);
    if(!promoted)return null;
    wlMorningSetFillPath('ai_internal_promotion');
    wlMorningOnSlotFill(s,'morningDrive',{priorSlot:promoted.slot,replacementType:'internal'});
    return promoted;
  }catch(_e){return null;}
}`;

export const VARIANTS = ['A', 'B', 'C', 'D'];

export const VARIANT_DEFS = {
  A: 'Current production — internalPromotionDirect, no wrapper ceiling/trust',
  B: 'Original design — 25% trust transfer + J1 cap 88 / 6 periods / +1 rise via wrapper',
  C: 'Internal-friendly — 25% trust + cap 89 (internal only) / 6 / +1 via wrapper',
  D: 'Legacy handoff — 35% trust + cap 88 / 6 / +1 via wrapper',
};

/** @param {string} ceilingSrc @param {string} variant */
export function patchCeilingSource(ceilingSrc, variant) {
  if (variant === 'C') {
    return ceilingSrc
      .replace(
        '    st.morningSuccessorCeiling = {\n      priorSlotQ,\n      fixedCap: FIXED_CAP,',
        '    const initCap = replacementType === \'internal\' ? 89 : FIXED_CAP;\n    st.morningSuccessorCeiling = {\n      priorSlotQ,\n      fixedCap: initCap,',
      )
      .replace('      ceiling: FIXED_CAP,', '      ceiling: initCap,')
      .replace(
        '    sd.quality = Math.min(sd.quality | 0, FIXED_CAP);',
        '    sd.quality = Math.min(sd.quality | 0, initCap);',
      )
      .replace('        ceiling: FIXED_CAP,', '        ceiling: initCap,');
  }
  if (variant === 'D') {
    return ceilingSrc.replace(
      'const TRUST_TRANSFER_PCT = 0.25;',
      'const TRUST_TRANSFER_PCT = 0.35;',
    );
  }
  return ceilingSrc;
}

/** @param {string} legacySrc @param {string} variant */
export function patchLegacySource(legacySrc, variant) {
  if (variant === 'A') return legacySrc;
  if (!legacySrc.includes(TRY_INTERNAL_FN)) {
    throw new Error('legacy wlMorningTryAiInternalPromotion anchor not found');
  }
  return legacySrc.replace(TRY_INTERNAL_FN, TRY_INTERNAL_WITH_WRAPPER);
}
