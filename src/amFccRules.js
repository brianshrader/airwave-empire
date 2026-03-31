/**
 * Contiguous-U.S. AM dial rules (game simplification — not a full FCC propagation model).
 * Single source of truth for frequency ↔ channel class ↔ plausible power.
 */

/** FCC-style local channels (Class C–style in this sim): normal max 1 kW daytime in lower 48. */
export const AM_LOCAL_KHZ = new Set([1230, 1240, 1340, 1400, 1450, 1490]);

/**
 * Regional channels: moderate power only (no 50 kW “blowtorches”).
 * Explicit denylist — everything else on standard 10 kHz AM steps (540–1700) is treated as clear-style for max power.
 */
export const AM_REGIONAL_KHZ = new Set([
  570, 590, 710, 790, 980, 1390, 1430, 1470, 1510, 1580, 1590,
]);

/** Numeric licensed power for comparison (DA handled separately). */
const PW_KW = { '50kw': 50, '10kw': 10, '5kw': 5, '1kw': 1 };

/** @returns {'clear'|'regional'|'local'|null} */
export function getAmChannelKind(khz) {
  if (khz == null || Number.isNaN(khz)) return null;
  if (khz < 540 || khz > 1700 || khz % 10 !== 0) return null;
  if (AM_LOCAL_KHZ.has(khz)) return 'local';
  if (AM_REGIONAL_KHZ.has(khz)) return 'regional';
  return 'clear';
}

/** kHz from strings like "1230 AM" or "1230". */
export function parseAmFreqKhz(freq) {
  if (freq == null || typeof freq !== 'string') return null;
  const m = String(freq).match(/(\d{3,4})\s*AM/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n)) return null;
  return n;
}

export function isStandardAmFrequencyString(freq) {
  return parseAmFreqKhz(freq) != null;
}

export function isClearChannelFreq(freq) {
  const k = parseAmFreqKhz(freq);
  if (k == null) return false;
  return getAmChannelKind(k) === 'clear';
}

export function isLocalChannelFreq(freq) {
  const k = parseAmFreqKhz(freq);
  if (k == null) return false;
  return getAmChannelKind(k) === 'local';
}

/** Max non-daytimer power tier for channel kind (DA handled separately). */
export function maxAmPwTierForKind(kind) {
  if (kind === 'local') return '1kw';
  if (kind === 'regional') return '10kw';
  if (kind === 'clear') return '50kw';
  return '10kw';
}

function maxKwForKind(kind) {
  if (kind === 'local') return 1;
  if (kind === 'regional') return 10;
  if (kind === 'clear') return 50;
  return 10;
}

/**
 * Return a legal power token for this AM frequency.
 * - Local: 1 kW or DA only (no 5/10/50 kW “facilities”).
 * - Regional: up to 10 kW (50 kW → 10 kW).
 * - Clear: up to 50 kW.
 */
export function normalizeAmPw(freq, pw) {
  if (pw == null) return '1kw';
  const khz = parseAmFreqKhz(freq);
  if (khz == null) return pw;
  const kind = getAmChannelKind(khz);
  if (!kind) return pw;

  if (pw === 'DA') return 'DA';

  const maxKw = maxKwForKind(kind);
  const v = PW_KW[pw];
  if (v == null) return maxKw >= 50 ? '50kw' : maxKw >= 10 ? '10kw' : '1kw';
  if (v <= maxKw) return pw;

  if (maxKw >= 50) return '50kw';
  if (maxKw >= 10) return '10kw';
  return '1kw';
}

export function amComboPassesRules(freq, pw) {
  return normalizeAmPw(freq, pw) === pw;
}

/**
 * Row for audit / debug: channel type, caps, notes.
 */
export function describeAmChannel(freq) {
  const khz = parseAmFreqKhz(freq);
  if (khz == null) {
    return { khz: null, channelType: 'unknown', allowedClasses: [], maxPower: '', notes: 'Not parsed as AM' };
  }
  const kind = getAmChannelKind(khz);
  const maxTier = maxAmPwTierForKind(kind);
  let channelType = kind || 'unknown';
  let notes = '';
  if (kind === 'local') {
    notes = 'Lower-48 local channel; Class C–style — cap 1 kW (DA daytimer allowed).';
  } else if (kind === 'regional') {
    notes = 'Regional in this sim — no 50 kW; max 10 kW.';
  } else {
    notes = 'Clear-style in this sim — up to 50 kW subject to market density caps.';
  }
  return {
    khz,
    channelType,
    allowedClasses: kind === 'local' ? ['local', 'Class C (sim)', 'DA'] : kind === 'regional' ? ['regional', 'B (sim)'] : ['clear', 'A (sim)'],
    maxPower: maxTier,
    notes,
  };
}

export function formatAmAuditLine(station) {
  if (!station?.sig || station.sig.type !== 'AM' || station.fmBooster) return null;
  const call = station.callLetters || station.id || '?';
  const freq = station.freq || '';
  const pw = station.sig.pw || '';
  const desc = describeAmChannel(freq);
  const ok = amComboPassesRules(freq, pw);
  return `${call}\t${freq}\t${desc.channelType}\t${pw}\t${ok ? 'PASS' : 'FAIL'}`;
}

if (typeof window !== 'undefined') {
  window.AMFCC = {
    AM_LOCAL_KHZ,
    AM_REGIONAL_KHZ,
    getAmChannelKind,
    parseAmFreqKhz,
    isClearChannelFreq,
    isLocalChannelFreq,
    normalizeAmPw,
    amComboPassesRules,
    describeAmChannel,
    formatAmAuditLine,
    maxAmPwTierForKind,
  };
}
