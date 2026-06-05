/**
 * Diagnostic-only legacy.js patches for legend pipeline A/B (variants A–E).
 */

export const VARIANTS = ['A', 'B', 'C', 'D', 'E'];

export const VARIANT_DEFS = {
  A: 'Baseline — current production behavior',
  B: 'Rare high-ceiling generation — trueQ 85–92 at hire, market-tier scaled',
  C: 'Career breakout path — gradual trueQ lift after tenure + station success',
  D: 'B mild + C mild combined',
  E: 'B strong + C strong combined',
};

const MK_TAL_ANCHOR =
  "try{if(typeof wlTalentRetention!=='undefined'&&typeof G!=='undefined'&&G)wlTalentRetention.ensurePersonality(tal,G);}catch(_e){}\n  return tal;";

const MK_TAL_HOOK =
  "try{if(typeof wlTalentRetention!=='undefined'&&typeof G!=='undefined'&&G)wlTalentRetention.ensurePersonality(tal,G);}catch(_e){}\n  if(typeof wlLegendAbMkTalAdjust==='function')wlLegendAbMkTalAdjust(tal,slot,fmt,tier,marketId,G);\n  return tal;";

const BREAKOUT_ANCHOR = '        if(sd.talent.salary>mktCap)sd.talent.salary=mktCap;\n      }';

const BREAKOUT_HOOK =
  '        if(sd.talent.salary>mktCap)sd.talent.salary=mktCap;\n        if(typeof wlLegendAbFallBreakoutStep===\'function\')wlLegendAbFallBreakoutStep(s,sl,sd.talent,G);\n      }';

/** @param {string} legacySrc @param {string} [_variant] */
export function patchLegacySource(legacySrc, _variant = 'A') {
  let src = legacySrc;

  if (!src.includes('wlLegendAbMkTalAdjust')) {
    if (!src.includes(MK_TAL_ANCHOR)) {
      throw new Error('legend AB: mkTal return anchor not found');
    }
    src = src.replace(MK_TAL_ANCHOR, MK_TAL_HOOK);
  }

  if (!src.includes('wlLegendAbFallBreakoutStep')) {
    if (!src.includes(BREAKOUT_ANCHOR)) {
      throw new Error('legend AB: Fall mktCap anchor not found');
    }
    src = src.replace(BREAKOUT_ANCHOR, BREAKOUT_HOOK);
  }

  return src;
}
