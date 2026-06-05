/**
 * Diagnostic-only legacy patches for Gate 2 platform A/B.
 */

import { patchLegacySource as patchLegendAbSource } from './diag-legend-pipeline-ab-patches.mjs';

export const VARIANTS = ['A', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

export const VARIANT_DEFS = {
  A: 'Baseline — current production',
  E: 'Gate 1 — rare high-ceiling generation (strong)',
  F: 'E + drive-slot bias (high-Q on drive only)',
  G: 'E + platform placement bias (top-5 stations favored)',
  H: 'E + retention / lock-in on strong platform',
  I: 'E + upward poach from weak to top-5 stations',
  J: 'E + F + G + modest retention',
  K: 'E + F + G + full retention + upward poach',
};

const HIRE_MK_TAL = 'const tNew=mkTal(sl,s.format,tier,G.year);';
const HIRE_MK_TAL_CTX =
  'if(G)G._wlDiagHireSt=s;const tNew=mkTal(sl,s.format,tier,G.year);if(G)G._wlDiagHireSt=null;';

const HIRE_ENTRY = "sd.talent=mkTal(sl,s.format,'entry',G.year);";
const HIRE_ENTRY_CTX =
  "if(G)G._wlDiagHireSt=s;sd.talent=mkTal(sl,s.format,'entry',G.year);if(G)G._wlDiagHireSt=null;";

const RENEW_ANCHOR =
  '        const renewCut=fmMusicAi?Math.min(0.94,p.tr+(y>=1978?0.12:0.08)):p.tr;\n        if(Math.random()<renewCut){';
const RENEW_HOOK =
  '        let renewCut=fmMusicAi?Math.min(0.94,p.tr+(y>=1978?0.12:0.08)):p.tr;\n        if(typeof wlLegendPlatformRenewCut===\'function\')renewCut=wlLegendPlatformRenewCut(s,sl,sd.talent,G,renewCut);\n        if(Math.random()<renewCut){';

const EXIT_ANCHOR =
  '        } else {\n          const nm=sd.talent.name;\n          clearCoHostPairingState(sd);';
const EXIT_HOOK =
  '        } else if(typeof wlLegendPlatformBlockContractExit===\'function\'&&wlLegendPlatformBlockContractExit(s,sl,sd.talent,G)){sd.talent.cyr=1;}\n        else {\n          const nm=sd.talent.name;\n          clearCoHostPairingState(sd);';

const RUNAI_ANCHOR =
  '  });\n  aiRivalPublishDebug(G);\n  return acts;\n}';
const RUNAI_HOOK =
  '  });\n  if(typeof wlLegendPlatformUpwardPoachStep===\'function\')wlLegendPlatformUpwardPoachStep(G,acts);\n  aiRivalPublishDebug(G);\n  return acts;\n}';

/** @param {string} legacySrc */
export function patchLegacySource(legacySrc) {
  let src = patchLegendAbSource(legacySrc);

  if (!src.includes('G._wlDiagHireSt=s') && src.includes(HIRE_MK_TAL)) {
    src = src.replace(HIRE_MK_TAL, HIRE_MK_TAL_CTX);
  }
  if (!src.includes(HIRE_ENTRY_CTX) && src.includes(HIRE_ENTRY)) {
    src = src.replace(HIRE_ENTRY, HIRE_ENTRY_CTX);
  }
  if (!src.includes('wlLegendPlatformRenewCut')) {
    if (!src.includes(RENEW_ANCHOR)) throw new Error('platform AB: renew anchor missing');
    src = src.replace(RENEW_ANCHOR, RENEW_HOOK);
  }
  if (!src.includes('wlLegendPlatformBlockContractExit')) {
    if (!src.includes(EXIT_ANCHOR)) throw new Error('platform AB: contract exit anchor missing');
    src = src.replace(EXIT_ANCHOR, EXIT_HOOK);
  }
  if (!src.includes('wlLegendPlatformUpwardPoachStep')) {
    if (!src.includes(RUNAI_ANCHOR)) throw new Error('platform AB: runAI anchor missing');
    src = src.replace(RUNAI_ANCHOR, RUNAI_HOOK);
  }

  return src;
}
