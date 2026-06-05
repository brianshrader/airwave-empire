/**
 * Diagnostic-only patches for PM Drive quality inflation A/B (variants A–F).
 * Production ships variant E — patches adjust legacy for baseline/comparison runs only.
 */

export const VARIANTS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const VARIANT_DEFS = {
  A: 'Baseline — revert production E (decay .030, uncapped runAI bump)',
  B: 'Ceiling only — production ceiling with decay reverted to .030',
  C: 'Decay .040 only — revert ceiling, no cohost change',
  D: 'Remove PM cohost strength — revert production E mechanics',
  E: 'Production — talent-supported AI PM ceiling + afternoonDrive decay .035',
  F: 'Stronger decay — production ceiling + afternoonDrive decay .040',
};

const AI_MS_PROD = 'if(Math.random()<p.ms)aiApplyMaintenanceQualityBump(s,sl,sd);';
const AI_MS_BASELINE = 'if(Math.random()<p.ms)sd.quality=Math.min(100,sd.quality+rnd(1,4));';
const DECAY_PROD = 'afternoonDrive:.035';
const DECAY_BASELINE = 'afternoonDrive:.030';
const DECAY_STRONG = 'afternoonDrive:.040';

function revertToBaseline(src) {
  let out = src;
  if (out.includes(DECAY_PROD)) out = out.replace(DECAY_PROD, DECAY_BASELINE);
  if (out.includes(AI_MS_PROD)) out = out.replace(AI_MS_PROD, AI_MS_BASELINE);
  return out;
}

/** @param {string} legacySrc @param {string} variant */
export function patchLegacySource(legacySrc, variant) {
  let src = legacySrc;

  switch (variant) {
    case 'A':
      return revertToBaseline(src);
    case 'B':
      return src.replace(DECAY_PROD, DECAY_BASELINE);
    case 'C':
      src = revertToBaseline(src);
      return src.replace(DECAY_BASELINE, DECAY_STRONG);
    case 'D':
      src = revertToBaseline(src);
      if (!src.includes('afternoonDrive:0.42')) {
        throw new Error('legacy COHOST_SLOT_STRENGTH afternoonDrive anchor not found');
      }
      return src.replace('afternoonDrive:0.42', 'afternoonDrive:0');
    case 'E':
      return src;
    case 'F':
      if (!src.includes(DECAY_PROD)) {
        throw new Error('legacy afternoonDrive decay .035 anchor not found (expected production E)');
      }
      return src.replace(DECAY_PROD, DECAY_STRONG);
    default:
      return src;
  }
}
