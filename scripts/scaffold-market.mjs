#!/usr/bin/env node
/**
 * Market scaffold v2 — draft MARKETS rows, derive ecology, readiness gates.
 *
 *   npm run scaffold:market -- --city=phoenix --template=sunbelt
 *   npm run scaffold:market -- --city=phoenix --derive
 *   npm run scaffold:market -- --city=phoenix --check
 */
/* eslint-disable no-console */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deriveMarketEcology } from '../src/marketEcology.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ECOLOGY_YEARS = [1970, 1985, 1995, 2005, 2015, 2026];
const READINESS_LEVELS = ['DRAFT', 'DATA_READY', 'ECOLOGY_READY', 'PLAYTEST_READY', 'MERGE_READY'];
const TEMPLATE_KEYS = [
  'sunbelt',
  'northeast_mega',
  'west_fm_fragmented',
  'southern_country',
  'midwest_legacy',
  'coastal_secular',
  'plains_small',
];
const VALID_RANK_TIERS = new Set(['mega', 'large', 'medium', 'small']);
const VALID_CALL_PREFIX = new Set(['K', 'W']);
const AM_SIGNAL_TIERS = ['big', 'medium', 'small'];
const FM_SIGNAL_TIERS = ['major', 'medium', 'rimshot'];
/** AM graveyard/local channels (kHz) — local/small tier only in gameplay scaffold. */
const AM_GRAVEYARD_KHZ = new Set([1230, 1240, 1340, 1400, 1450, 1490]);
const FM_NCE_MHZ_MIN = 87.9;
const FM_NCE_MHZ_MAX = 91.9;
const FM_COMMERCIAL_MHZ_MIN = 92.1;
const FM_COMMERCIAL_MHZ_MAX = 107.9;
const AM_GRAVEYARD_MAX_KW = 1;
const AM_TIER_VOCABULARY = {
  big: 'clear / big-stick',
  medium: 'regional',
  small: 'local',
};
const AM_CLASS_TO_TIER = { clear: 'big', regional: 'medium', local: 'small' };
const VALID_AM_CLASS_HINT = new Set(['clear', 'regional', 'local', 'unknown']);
const VALID_FM_CLASS_HINT = new Set(['C', 'C0', 'C1', 'C2', 'C3', 'A', 'B', 'B1', 'unknown']);
const NCE_FORMAT_HINTS = new Set([
  'CCM',
  'RELIGIOUS_NETWORK',
  'PUBLIC_NEWS',
  'PUBLIC_ECLECTIC',
  'PUBLIC_JAZZ',
  'NPR',
  'NCE',
]);
/** Minimum profile+dial signal counts by rankTier (gameplay depth hints). */
const SIGNAL_DEPTH_HINTS = {
  mega: { am: 10, fm: 22 },
  large: { am: 8, fm: 16 },
  medium: { am: 5, fm: 10 },
  small: { am: 3, fm: 6 },
};

/**
 * Era inventory targets by rankTier (full-power competitive signals — not FCC-perfect).
 * `viable1983` ≈ stations that could matter in the early-1980s; `measurable2026` ≈ book-measurable count today.
 */
const SIGNAL_INVENTORY_TARGETS = {
  small: { viable1983: [10, 14], measurable2026: [16, 24] },
  medium: { viable1983: [14, 18], measurable2026: [24, 32] },
  large: { viable1983: [18, 26], measurable2026: [32, 42] },
  mega: { viable1983: [28, 35], measurable2026: [45, 55] },
};

/** Rough real-market anchors for scaffold sanity checks (documentation / comparison only). */
const SIGNAL_INVENTORY_ANCHORS = {
  wichita: { rankTier: 'small', viable1983: 12, measurable2026: 20 },
  phoenix: { rankTier: 'large', viable1983: 22, measurable2026: 38 },
  newyork: {
    rankTier: 'mega',
    viable1983: 30,
    measurable2026: 48,
    inventory1975: { am1975: 11, fm1975: 9, total1975: 20, viable1975: 20 },
  },
  neworleans: {
    rankTier: 'large',
    inventory1975: { am1975: 9, fm1975: 7, total1975: 16, viable1975: 16 },
    total1985: 20,
    measurable2026: 20,
  },
};

const INVENTORY_1975_FIELDS = ['am1975', 'fm1975', 'viable1975', 'total1975'];

function parseInventoryInt(inv, key) {
  if (inv[key] == null || Number.isNaN(Number(inv[key]))) return null;
  return Math.round(Number(inv[key]));
}

/**
 * Optional 1975 historical dial anchors — 1970s starts should not assume modern dial depth.
 * @returns {{ block: object, warnings: object[], reviewFailures: object[] }}
 */
function assessInventory1975(inv, primary, measurable2026, inventoryExplained) {
  const am1975 = parseInventoryInt(inv, 'am1975');
  const fm1975 = parseInventoryInt(inv, 'fm1975');
  const viable1975 = parseInventoryInt(inv, 'viable1975');
  const total1975 = parseInventoryInt(inv, 'total1975');
  const warnings = [];
  const reviewFailures = [];
  const modernDial = primary.total;

  const hasAny1975 = INVENTORY_1975_FIELDS.some((k) => parseInventoryInt(inv, k) != null);
  const hasBandTotals = am1975 != null && fm1975 != null && total1975 != null;
  const sumBands = am1975 != null && fm1975 != null ? am1975 + fm1975 : null;

  const explicit = Object.fromEntries(INVENTORY_1975_FIELDS.map((k) => [k, parseInventoryInt(inv, k) != null]));

  if (!hasAny1975) {
    if (modernDial > 0) {
      warnings.push({
        code: 'inventory_1975_modern_dial_assumed',
        level: 'warn',
        message: `No 1975 inventory (am1975/fm1975/total1975) — 1970s-era starts should use historical AM/FM availability, not modern dial size (${modernDial} full-power listed)`,
      });
    }
  } else {
    if (!hasBandTotals) {
      const missing = ['am1975', 'fm1975', 'total1975'].filter((k) => parseInventoryInt(inv, k) == null);
      if (missing.length > 0 && missing.length < 3) {
        warnings.push({
          code: 'inventory_1975_incomplete',
          level: 'warn',
          message: `1975 inventory incomplete (missing ${missing.join(', ')}) — set am1975, fm1975, and total1975 together when documenting historical dial`,
        });
      }
    }

    if (hasBandTotals && total1975 !== sumBands) {
      const msg = `signalInventory.total1975 (${total1975}) must equal am1975 (${am1975}) + fm1975 (${fm1975}) = ${sumBands}`;
      reviewFailures.push({ code: 'inventory_1975_total_mismatch', message: msg });
    }

    if (viable1975 != null && total1975 != null && viable1975 > total1975) {
      warnings.push({
        code: 'inventory_1975_viable_above_total',
        level: 'warn',
        message: `viable1975 (${viable1975}) exceeds total1975 (${total1975})`,
      });
    }

    if (hasBandTotals && modernDial > 0 && !inventoryExplained) {
      if (Math.abs(modernDial - total1975) <= 1 && measurable2026 > total1975 + 4) {
        warnings.push({
          code: 'inventory_1975_equals_modern_dial',
          level: 'warn',
          message: `Modern dial (${modernDial}) ≈ total1975 (${total1975}) but measurable2026 (${measurable2026}) is much higher — confirm 1975 anchors are historical, not copied from the 2026 dial list`,
        });
      } else if (modernDial >= total1975 + 6) {
        warnings.push({
          code: 'inventory_1975_growth_documented',
          level: 'info',
          message: `1975 total ${total1975} vs modern dial ${modernDial} — FM expansion / fragmentation expected between 1975 and 2026`,
        });
      }
    }
  }

  return {
    block: {
      am1975,
      fm1975,
      viable1975,
      total1975,
      sumBands,
      explicit,
      hasAny1975,
      hasBandTotals,
      eraNote:
        '1970s market starts should use historical AM/FM availability at scenario start — not the full modern 2026 dial list.',
    },
    warnings,
    reviewFailures,
  };
}
const POP_KEYS = ['12-17', '18-24', '25-34', '35-49', '50-64', '65+'];
const ECOLOGY_TRAIT_KEYS = [
  'publicRadioStrength',
  'spanishLanguageStrength',
  'blackMusicStrength',
  'urbanContemporaryStrength',
  'gospelStrength',
  'ccmStrength',
  'countryStrength',
  'aaaAlternativeStrength',
  'spokenWordStrength',
  'sportsStrength',
  'chrResistance',
  'marketFragmentation',
  'amResilience',
  'modernMusicSubstitution',
];

/** Expected geography for common scaffold cities (readiness only). */
const CITY_GEOGRAPHY = {
  phoenix: { region: 'Southwest', timezone: 'America/Phoenix', callPrefix: 'K' },
  portland: { region: 'West Coast', timezone: 'America/Los_Angeles', callPrefix: 'K' },
  dallas: { region: 'Southwest', timezone: 'America/Chicago', callPrefix: 'K' },
  denver: { region: 'Mountain West', timezone: 'America/Denver', callPrefix: 'K' },
  boston: { region: 'Northeast', timezone: 'America/New_York', callPrefix: 'W' },
  miami: { region: 'Southeast', timezone: 'America/New_York', callPrefix: 'W' },
};

/** Template → comparison markets (diagnostics text only). */
const TEMPLATE_COMPARISONS = {
  sunbelt: {
    label: 'sunbelt',
    compareMarkets: ['atlanta', 'nashville'],
    notes:
      'Sunbelt growth: soul/R&B, Top 40, gospel lanes. Compare Hispanic share to Dallas/Phoenix-type desert metros (often higher than Atlanta).',
  },
  west_fm_fragmented: {
    label: 'west_fm_fragmented',
    compareMarkets: ['seattle', 'sanfrancisco'],
    notes:
      'Pacific NW / West FM fragmentation: rock/alt/AAA heritage, educated public radio, lower gospel cluster. Portland-type markets sit between Seattle and SF on Spanish share.',
  },
  northeast_mega: {
    label: 'large_coastal (mega)',
    compareMarkets: ['newyork', 'losangeles'],
    notes:
      'Large coastal / mega: fragmented dial, talk-heavy, high revenue. Use northeast_mega template only when Nielsen rank justifies mega tier and revScale.',
  },
  coastal_secular: {
    label: 'large_coastal (large)',
    compareMarkets: ['sanfrancisco', 'seattle'],
    notes:
      'Coastal secular large: high edu/public, modest religious institutional dial — not Sunbelt gospel shape.',
  },
  southern_country: {
    label: 'southern_country',
    compareMarkets: ['nashville', 'atlanta'],
    notes: 'Country heritage + CCM/gospel institutional tone; weaker coastal secular public curve.',
  },
  midwest_legacy: {
    label: 'midwest',
    compareMarkets: ['chicago', 'wichita'],
    notes: 'Midwest legacy: country/classic rock, AM holdouts fading; medium markets use Wichita scale, large use Chicago.',
  },
  plains_small: {
    label: 'plains_small',
    compareMarkets: ['wichita'],
    notes: 'Small plains: AC/country, thin dial, low revScale — verify tier is small not medium.',
  },
};

function parseArgs(argv) {
  const out = {
    city: null,
    template: 'sunbelt',
    outDir: null,
    derive: false,
    check: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--city=')) out.city = arg.slice(7).trim();
    else if (arg.startsWith('--template=')) out.template = arg.slice(11).trim();
    else if (arg.startsWith('--out=')) out.outDir = arg.slice(6).trim();
    else if (arg === '--derive') out.derive = true;
    else if (arg === '--check') out.check = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function slugifyCity(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function titleCase(slug) {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function dialFingerprint(amFreqs, fmFreqs) {
  return JSON.stringify({
    am: [...(amFreqs || [])].sort(),
    fm: [...(fmFreqs || [])].sort(),
  });
}

function signalTierTotal(profile, band, tiers) {
  if (!profile?.[band] || typeof profile[band] !== 'object') return 0;
  return tiers.reduce((sum, tier) => sum + Math.max(0, Number(profile[band][tier]) || 0), 0);
}

/** Per-frequency metadata: exclude translators/HD-fed unless explicitly marked primary. */
function isExcludedFromPrimaryInventory(meta) {
  if (!meta || typeof meta !== 'object') return false;
  if (meta.includeInPrimaryInventory === true || meta.primaryInventory === true) return false;
  if (meta.excludeFromPrimaryInventory === true) return true;
  if (meta.translatorFed === true || meta.translator === true) return true;
  if (meta.hdSubchannel === true || meta.hdFed === true) return true;
  return false;
}

function countPrimaryFullPowerSignals(raw) {
  const amMeta = raw.amSignalByFreq && typeof raw.amSignalByFreq === 'object' ? raw.amSignalByFreq : {};
  const fmMeta = raw.fmSignalByFreq && typeof raw.fmSignalByFreq === 'object' ? raw.fmSignalByFreq : {};
  const amListed = raw.amFreqs || [];
  const fmListed = raw.fmFreqs || [];
  let am = 0;
  let fm = 0;
  let excluded = 0;
  const excludedFreqs = [];
  for (const freq of amListed) {
    if (isExcludedFromPrimaryInventory(amMeta[freq])) {
      excluded += 1;
      excludedFreqs.push(freq);
    } else am += 1;
  }
  for (const freq of fmListed) {
    if (isExcludedFromPrimaryInventory(fmMeta[freq])) {
      excluded += 1;
      excludedFreqs.push(freq);
    } else fm += 1;
  }
  return {
    am,
    fm,
    total: am + fm,
    excluded,
    excludedFreqs,
    dialListed: amListed.length + fmListed.length,
  };
}

/**
 * Tier-based viable (1983) / measurable (2026) inventory sanity check.
 * @returns {object} inventory block for signal_allocation.json + readiness warnings
 */
function assessSignalInventory(raw) {
  const rankTier = String(raw.rankTier || '').trim() || 'medium';
  const targets = SIGNAL_INVENTORY_TARGETS[rankTier] || null;
  const inv =
    raw.signalInventory && typeof raw.signalInventory === 'object' ? raw.signalInventory : {};
  const primary = countPrimaryFullPowerSignals(raw);
  const profile = raw.signalProfile;
  const profileGrandTotal = profile
    ? signalTierTotal(profile, 'am', AM_SIGNAL_TIERS) + signalTierTotal(profile, 'fm', FM_SIGNAL_TIERS)
    : 0;
  const dialListedTotal = primary.dialListed;

  const hasExplicitViable = inv.viable1983 != null && !Number.isNaN(Number(inv.viable1983));
  const hasExplicitMeasurable = inv.measurable2026 != null && !Number.isNaN(Number(inv.measurable2026));
  const sources = {};
  let viable1983 = hasExplicitViable ? Math.round(Number(inv.viable1983)) : null;
  let measurable2026 = hasExplicitMeasurable ? Math.round(Number(inv.measurable2026)) : null;

  if (viable1983 == null) {
    viable1983 = primary.total;
    sources.viable1983 = 'primary_dial_proxy';
  }
  if (measurable2026 == null) {
    measurable2026 = Math.max(primary.total, profileGrandTotal || 0);
    sources.measurable2026 =
      profileGrandTotal > primary.total ? 'profile_or_dial_proxy' : 'primary_dial_proxy';
  }

  const inventoryExplained =
    inv.inventoryExplained === true || (typeof inv.notes === 'string' && inv.notes.trim().length > 0);
  const warnings = [];

  if (!hasExplicitViable || !hasExplicitMeasurable) {
    warnings.push({
      code: 'inventory_not_explicit',
      level: 'warn',
      message: `Add signalInventory.viable1983 and measurable2026 in raw_market_data.json (rankTier=${rankTier} targets in signal_allocation.json)`,
    });
  }

  const identicalProxy =
    viable1983 === measurable2026 &&
    viable1983 === dialListedTotal &&
    viable1983 === primary.total &&
    measurable2026 === primary.total;

  if (identicalProxy && !inventoryExplained) {
    warnings.push({
      code: 'inventory_identical_proxy',
      level: 'warn',
      message:
        'viable1983, measurable2026, and dial primary count are identical without signalInventory.inventoryExplained or notes — set explicit era counts or document why',
    });
  } else if (viable1983 === measurable2026 && !inventoryExplained && !identicalProxy) {
    warnings.push({
      code: 'inventory_viable_measurable_same',
      level: 'warn',
      message:
        'viable1983 equals measurable2026 without inventoryExplained/notes — modern markets usually have more measurable than viable full-power signals',
    });
  }

  if (primary.excluded > 0) {
    warnings.push({
      code: 'inventory_translator_excluded',
      level: 'info',
      message: `${primary.excluded} dial row(s) excluded from primary full-power count (translator/HD metadata): ${primary.excludedFreqs.join(', ')}`,
    });
  }

  if (targets) {
    const checkRange = (eraLabel, value, range, codeLow, codeHigh) => {
      if (value < range[0]) {
        warnings.push({
          code: codeLow,
          level: 'warn',
          message: `${eraLabel} inventory ${value} is below ${rankTier}-tier target ${range[0]}–${range[1]} (rough anchors only)`,
        });
      } else if (value > range[1]) {
        warnings.push({
          code: codeHigh,
          level: 'warn',
          message: `${eraLabel} inventory ${value} is above ${rankTier}-tier target ${range[0]}–${range[1]} (rough anchors only)`,
        });
      }
    };
    checkRange(
      '1983 viable',
      viable1983,
      targets.viable1983,
      'inventory_viable_below_tier',
      'inventory_viable_above_tier',
    );
    checkRange(
      '2026 measurable',
      measurable2026,
      targets.measurable2026,
      'inventory_measurable_below_tier',
      'inventory_measurable_above_tier',
    );
  } else {
    warnings.push({
      code: 'inventory_tier_unknown',
      level: 'warn',
      message: `No signal inventory targets for rankTier=${rankTier}`,
    });
  }

  const anchor = SIGNAL_INVENTORY_ANCHORS[raw.id];
  let anchorNote = null;
  if (anchor) {
    const parts = [`Anchor ${raw.id} (${anchor.rankTier})`];
    if (anchor.inventory1975) {
      const i = anchor.inventory1975;
      parts.push(`1975: ${i.am1975} AM / ${i.fm1975} FM / ${i.total1975} total`);
    }
    if (anchor.viable1983 != null) parts.push(`~${anchor.viable1983} viable (1983)`);
    if (anchor.total1985 != null) parts.push(`~${anchor.total1985} total (1985)`);
    if (anchor.measurable2026 != null) parts.push(`~${anchor.measurable2026} measurable (2026)`);
    anchorNote = parts.join('; ');
  }

  const inv1975 = assessInventory1975(inv, primary, measurable2026, inventoryExplained);
  warnings.push(...inv1975.warnings);

  return {
    schemaVersion: 2,
    rankTier,
    targets: targets
      ? { viable1983: targets.viable1983, measurable2026: targets.measurable2026 }
      : null,
    anchors: SIGNAL_INVENTORY_ANCHORS,
    anchorNote,
    primaryFullPower: primary,
    dialListedTotal,
    profileGrandTotal,
    viable1983,
    measurable2026,
    inventory1975: inv1975.block,
    sources,
    explicit: {
      viable1983: hasExplicitViable,
      measurable2026: hasExplicitMeasurable,
      ...inv1975.block.explicit,
    },
    inventoryExplained,
    notes: typeof inv.notes === 'string' ? inv.notes : null,
    warnings,
    reviewFailures1975: inv1975.reviewFailures,
    missingExplicit: { viable1983: !hasExplicitViable, measurable2026: !hasExplicitMeasurable },
    inventoryNote:
      'Primary full-power count excludes translatorFed/hdSubchannel/hdFed dial rows unless includeInPrimaryInventory is set. Not FCC-perfect.',
    inventory1975Note:
      '1970s starts: document signalInventory.am1975, fm1975, total1975 (and optional viable1975) from historical dial — not modern 2026 amFreqs/fmFreqs length.',
  };
}

/**
 * Draft signalProfile from dial list lengths (template / new markets).
 * Not FCC-sourced — human signalReviewed required before merge.
 */
function buildDefaultSignalProfile(amCount, fmCount) {
  const am = Math.max(0, amCount);
  const fm = Math.max(0, fmCount);
  if (am === 0 && fm === 0) {
    return {
      am: { big: 0, medium: 0, small: 0 },
      fm: { major: 0, medium: 0, rimshot: 0 },
    };
  }
  const amBig = am ? Math.max(1, Math.round(am * 0.25)) : 0;
  const amMed = am ? Math.max(1, Math.round(am * 0.42)) : 0;
  const amSmall = Math.max(0, am - amBig - amMed);

  const fmMajor = fm ? Math.max(1, Math.round(fm * 0.35)) : 0;
  const fmMed = fm ? Math.max(1, Math.round(fm * 0.45)) : 0;
  const fmRim = Math.max(0, fm - fmMajor - fmMed);

  return {
    am: { big: amBig, medium: amMed, small: amSmall },
    fm: { major: fmMajor, medium: fmMed, rimshot: fmRim },
  };
}

function isValidSignalProfile(profile) {
  if (!profile || typeof profile !== 'object') return false;
  for (const tier of AM_SIGNAL_TIERS) {
    const v = profile.am?.[tier];
    if (v != null && (typeof v !== 'number' || Number.isNaN(v) || v < 0)) return false;
  }
  for (const tier of FM_SIGNAL_TIERS) {
    const v = profile.fm?.[tier];
    if (v != null && (typeof v !== 'number' || Number.isNaN(v) || v < 0)) return false;
  }
  return Boolean(profile.am && profile.fm);
}

function parseAmKhz(freqToken) {
  const m = String(freqToken || '').match(/(\d{3,4})\s*AM/i);
  return m ? Number(m[1]) : null;
}

function parseFmMhz(freqToken) {
  const m = String(freqToken || '').match(/(\d{2,3}(?:\.\d)?)\s*FM/i);
  return m ? Number(m[1]) : null;
}

function parseKwToken(token) {
  if (token == null) return null;
  if (typeof token === 'number' && !Number.isNaN(token)) return token;
  const m = String(token).match(/([\d.]+)\s*kw/i);
  return m ? Number(m[1]) : null;
}

function effectiveAmSignalTier(meta) {
  if (!meta || typeof meta !== 'object') return null;
  if (meta.signalTier && AM_SIGNAL_TIERS.includes(meta.signalTier)) return meta.signalTier;
  const hint = String(meta.amClassHint || '').toLowerCase();
  return AM_CLASS_TO_TIER[hint] || null;
}

function isGraveyardAmKhz(khz) {
  return khz != null && AM_GRAVEYARD_KHZ.has(khz);
}

function fmBandZone(mhz) {
  if (mhz == null || Number.isNaN(mhz)) return 'unknown';
  if (mhz >= FM_NCE_MHZ_MIN && mhz <= FM_NCE_MHZ_MAX) return 'nce_reserved';
  if (mhz >= FM_COMMERCIAL_MHZ_MIN && mhz <= FM_COMMERCIAL_MHZ_MAX) return 'commercial';
  return 'out_of_band';
}

/** Ecology likely needs 87.9–91.9 MHz capacity (not a fixed station count). */
function ecologyExpectsReservedBandCapacity(raw) {
  const religion = Number(raw.culture?.religion) || 0;
  const publicIdx = Number(raw.publicCivicIndex) || 0;
  const edu = Number(raw.eduIndex) || 0;
  return religion >= 0.08 || publicIdx >= 0.92 || edu >= 1.05;
}

/**
 * Reserved-band capacity checks (slots are capacity; occupants vary by market).
 * public / university / jazz / classical / CCM / religious / ethnic NCE compete for these frequencies.
 */
function assessReservedBandCapacity(raw, reservedCount) {
  const warnings = [];
  const info = [];
  const expects = ecologyExpectsReservedBandCapacity(raw);
  const tier = String(raw.rankTier || '').trim();
  const isLargePlus = tier === 'large' || tier === 'mega';

  if (expects && reservedCount === 0) {
    warnings.push({
      code: 'nce_reserved_capacity_missing',
      level: 'warn',
      message:
        'Ecology expects reserved-band (87.9–91.9 MHz) capacity but dial lists none — add slots for NCE/public/CCM mix, not fixed format assignments',
    });
  } else if (isLargePlus && reservedCount === 1) {
    warnings.push({
      code: 'nce_reserved_capacity_low',
      level: 'warn',
      message: `Large market lists only ${reservedCount} reserved-band slot; typical capacity is 2–6 (public, university, jazz, classical, CCM, religious, ethnic NCE)`,
    });
  } else if (reservedCount > 6) {
    info.push({
      code: 'nce_reserved_capacity_high',
      level: 'info',
      message: `${reservedCount} reserved-band slots listed — above typical 2–6 capacity (informational only)`,
    });
  }

  let assessment = 'ok';
  if (reservedCount >= 2 && reservedCount <= 6) assessment = 'plausible';
  else if (expects && reservedCount === 0) assessment = 'missing';
  else if (isLargePlus && reservedCount === 1) assessment = 'low';
  else if (reservedCount > 6) assessment = 'high';

  return { warnings, info, expects, plausible: reservedCount >= 2 && reservedCount <= 6, assessment };
}

/**
 * Band constraint validation (signal allocation v2).
 * @returns {object} constraints payload for signal_allocation.json + readiness
 */
function runSignalBandConstraints(raw) {
  const amMetaByFreq = raw.amSignalByFreq && typeof raw.amSignalByFreq === 'object' ? raw.amSignalByFreq : {};
  const fmMetaByFreq = raw.fmSignalByFreq && typeof raw.fmSignalByFreq === 'object' ? raw.fmSignalByFreq : {};
  const fmFacilityByFreq = raw.fmFacilityByFreq && typeof raw.fmFacilityByFreq === 'object' ? raw.fmFacilityByFreq : {};

  const constraintFailures = [];
  const constraintWarnings = [];
  const constraintInfo = [];
  const fail = (code, message, freq = null) => {
    constraintFailures.push({ code, level: 'error', message, freq });
  };
  const warn = (code, message, freq = null) => {
    constraintWarnings.push({ code, level: 'warn', message, freq });
  };
  const info = (code, message, freq = null) => {
    constraintInfo.push({ code, level: 'info', message, freq });
  };

  const counts = {
    amClear: 0,
    amRegional: 0,
    amLocal: 0,
    amGraveyard: 0,
    amGraveyardOnDial: 0,
    fmReservedBand: 0,
    fmCommercialBand: 0,
    fmOutOfBand: 0,
    fmMajor: 0,
    fmMedium: 0,
    fmRimshot: 0,
    nceFormatOnCommercial: 0,
  };

  const amFrequencies = [];
  for (const freq of raw.amFreqs || []) {
    const khz = parseAmKhz(freq);
    const meta = amMetaByFreq[freq] || {};
    const graveyard = isGraveyardAmKhz(khz);
    const tier = effectiveAmSignalTier(meta);
    const amClassHint = meta.amClassHint ? String(meta.amClassHint).toLowerCase() : graveyard ? 'local' : 'unknown';
    const dayKw = meta.dayPowerKw != null ? Number(meta.dayPowerKw) : null;
    const nightKw = meta.nightPowerKw != null ? Number(meta.nightPowerKw) : null;
    const powerKw = Math.max(dayKw ?? 0, nightKw ?? 0) || null;
    const override = meta.graveyardOverride === true;

    if (graveyard) counts.amGraveyardOnDial += 1;

    if (tier === 'big' || amClassHint === 'clear') {
      counts.amClear += 1;
    } else if (tier === 'medium' || amClassHint === 'regional') {
      counts.amRegional += 1;
    } else if (tier === 'small' || amClassHint === 'local') {
      counts.amLocal += 1;
    }

    if (graveyard) {
      counts.amGraveyard += 1;
      if (tier === 'big' || amClassHint === 'clear') {
        fail('graveyard_am_big', `${freq} is a graveyard/local AM channel — cannot be clear/big-stick tier`, freq);
      }
      if ((tier === 'medium' || amClassHint === 'regional') && !override) {
        fail(
          'graveyard_am_regional',
          `${freq} graveyard channel cannot be regional/medium without graveyardOverride`,
          freq,
        );
      }
      if (powerKw != null && powerKw > AM_GRAVEYARD_MAX_KW && !override) {
        fail(
          'graveyard_am_power',
          `${freq} graveyard AM power ${powerKw}kW exceeds ${AM_GRAVEYARD_MAX_KW}kW without graveyardOverride`,
          freq,
        );
      }
      if (!meta || Object.keys(meta).length === 0) {
        warn(
          'graveyard_am_unassigned',
          `${freq} is graveyard/local — add amSignalByFreq with local/small tier and ≤${AM_GRAVEYARD_MAX_KW}kW`,
          freq,
        );
      }
    } else if (powerKw != null && powerKw > 50 && tier === 'small') {
      warn('am_power_tier_mismatch', `${freq} reports ${powerKw}kW but signalTier is small/local`, freq);
    }

    if (meta.amClassHint && !VALID_AM_CLASS_HINT.has(amClassHint)) {
      warn('am_class_hint_invalid', `${freq} amClassHint "${meta.amClassHint}" not in clear|regional|local|unknown`, freq);
    }

    amFrequencies.push({
      freq,
      khz,
      graveyard,
      band: 'am',
      tierVocabulary: tier ? AM_TIER_VOCABULARY[tier] : null,
      signalTier: tier,
      amClassHint,
      dayPowerKw: dayKw,
      nightPowerKw: nightKw,
      directionalDay: meta.directionalDay ?? null,
      directionalNight: meta.directionalNight ?? null,
      graveyardOverride: override,
    });
  }

  const fmFrequencies = [];
  for (const freq of raw.fmFreqs || []) {
    const mhz = parseFmMhz(freq);
    const meta = fmMetaByFreq[freq] || {};
    const zone = fmBandZone(mhz);
    const reservedBand =
      meta.reservedBand === true || (meta.nceEligible === true && meta.reservedBand !== false);
    const nceEligible = reservedBand || zone === 'nce_reserved' || meta.nceEligible === true;
    const erpKw = meta.erpKw != null ? Number(meta.erpKw) : parseKwToken(fmFacilityByFreq[freq]);
    const signalTier = meta.signalTier && FM_SIGNAL_TIERS.includes(meta.signalTier) ? meta.signalTier : null;
    const formatHint = meta.formatHint ? String(meta.formatHint).toUpperCase() : null;
    const commercialOverride = meta.commercialOverride === true || meta.translatorHdOverride === true;

    if (zone === 'nce_reserved') counts.fmReservedBand += 1;
    else if (zone === 'commercial') counts.fmCommercialBand += 1;
    else counts.fmOutOfBand += 1;

    if (signalTier === 'major') counts.fmMajor += 1;
    else if (signalTier === 'medium') counts.fmMedium += 1;
    else if (signalTier === 'rimshot') counts.fmRimshot += 1;

    if (zone === 'commercial' && nceEligible && !commercialOverride) {
      warn(
        'fm_nce_on_commercial',
        `${freq} is in commercial FM band but marked nceEligible/reserved — use 87.9–91.9 MHz or commercialOverride`,
        freq,
      );
    }

    if (zone === 'commercial' && formatHint && NCE_FORMAT_HINTS.has(formatHint) && !commercialOverride) {
      counts.nceFormatOnCommercial += 1;
      warn(
        'fm_nce_format_commercial',
        `${freq} formatHint ${formatHint} on commercial band — prefer reserved NCE band (HD/translator layer deferred)`,
        freq,
      );
    }

    if (zone === 'nce_reserved' && formatHint && !NCE_FORMAT_HINTS.has(formatHint) && formatHint !== 'UNKNOWN') {
      warn(
        'fm_commercial_on_nce',
        `${freq} in NCE reserved band with non-NCE formatHint ${formatHint}`,
        freq,
      );
    }

    if (meta.classHint && !VALID_FM_CLASS_HINT.has(String(meta.classHint))) {
      warn('fm_class_hint_invalid', `${freq} classHint "${meta.classHint}" not recognized`, freq);
    }

    fmFrequencies.push({
      freq,
      mhz,
      band: 'fm',
      bandZone: zone,
      nceEligible,
      reservedBand: zone === 'nce_reserved' || reservedBand,
      commercialBand: zone === 'commercial',
      signalTier,
      classHint: meta.classHint ?? 'unknown',
      erpKw,
      haatM: meta.haatM != null ? Number(meta.haatM) : null,
      formatHint,
      commercialOverride,
    });
  }

  const reservedListed = fmFrequencies.filter((f) => f.bandZone === 'nce_reserved').length;
  const reservedCapacity = assessReservedBandCapacity(raw, reservedListed);
  for (const w of reservedCapacity.warnings) {
    warn(w.code, w.message);
  }
  for (const i of reservedCapacity.info) {
    info(i.code, i.message);
  }

  const profile = raw.signalProfile;
  if (profile) {
    const graveyardProfileSmall = Number(profile.am?.small) || 0;
    if (counts.amGraveyardOnDial > graveyardProfileSmall) {
      warn(
        'graveyard_profile_small',
        `${counts.amGraveyardOnDial} graveyard AM channel(s) on dial but signalProfile.am.small=${graveyardProfileSmall}`,
      );
    }
  }

  return {
    constraintSchemaVersion: 2,
    amFrequencies,
    fmFrequencies,
    counts,
    constraintFailures,
    constraintWarnings,
    constraintInfo,
    reservedBandCapacity: {
      listed: reservedListed,
      ecologyExpectsCapacity: reservedCapacity.expects,
      plausibleRange: [2, 6],
      assessment: reservedCapacity.assessment,
    },
    hasConstraintFailures: constraintFailures.length > 0,
    tierVocabularyNote:
      'AM tiers map to gameplay vocabulary: big=clear/big-stick, medium=regional, small=local. Not exact FCC class modeling.',
    nceCapacityNote:
      'Reserved-band (87.9–91.9 MHz) entries are capacity slots; public, university, jazz, classical, CCM, religious, and ethnic NCE formats compete for them — no fixed occupant count.',
    ccmHdNote:
      'Commercial-band CCM/K-Love/Air1 via HD-fed translators is deferred until the HD radio/subchannel layer exists.',
  };
}

function buildSuggestedDialTierPlaceholders(raw, profile) {
  const placeholders = [];
  if (!profile) return placeholders;

  const amDial = (raw.amFreqs || []).length;
  const fmDial = (raw.fmFreqs || []).length;
  const amProfileTotal = signalTierTotal(profile, 'am', AM_SIGNAL_TIERS);
  const fmProfileTotal = signalTierTotal(profile, 'fm', FM_SIGNAL_TIERS);

  if (amProfileTotal > amDial) {
    const gap = amProfileTotal - amDial;
    placeholders.push({
      band: 'am',
      tier: '(any)',
      needed: gap,
      note: `Profile expects ${amProfileTotal} AM signals but dial lists ${amDial}; add ${gap} frequency placeholder(s) or lower tier counts.`,
    });
    for (const tier of AM_SIGNAL_TIERS) {
      const count = Number(profile.am[tier]) || 0;
      for (let i = 0; i < count && placeholders.length < amProfileTotal + 4; i += 1) {
        placeholders.push({
          band: 'am',
          tier,
          placeholder: `TBD ${tier} AM slot ${i + 1}`,
          note: 'Assign to amFreqs after FCC / market guide review',
        });
      }
    }
  }

  if (fmProfileTotal > fmDial) {
    const gap = fmProfileTotal - fmDial;
    placeholders.push({
      band: 'fm',
      tier: '(any)',
      needed: gap,
      note: `Profile expects ${fmProfileTotal} FM signals but dial lists ${fmDial}; add ${gap} frequency placeholder(s) or lower tier counts.`,
    });
    for (const tier of FM_SIGNAL_TIERS) {
      const count = Number(profile.fm[tier]) || 0;
      for (let i = 0; i < count && placeholders.filter((p) => p.band === 'fm').length < fmProfileTotal + 4; i += 1) {
        placeholders.push({
          band: 'fm',
          tier,
          placeholder: `TBD ${tier} FM slot ${i + 1}`,
          note: 'Assign to fmFreqs after FCC / market guide review',
        });
      }
    }
  }

  return placeholders;
}

/**
 * @returns {object} signal_allocation.json payload
 */
function buildSignalAllocation(raw) {
  const profile = raw.signalProfile;
  const amDial = (raw.amFreqs || []).length;
  const fmDial = (raw.fmFreqs || []).length;
  const amProfileTotal = profile ? signalTierTotal(profile, 'am', AM_SIGNAL_TIERS) : 0;
  const fmProfileTotal = profile ? signalTierTotal(profile, 'fm', FM_SIGNAL_TIERS) : 0;
  const signalReviewed = raw._scaffold?.signalReviewed === true;
  const warnings = [];

  if (!profile) {
    warnings.push({
      code: 'signal_profile_missing',
      level: 'error',
      message: 'signalProfile missing from raw_market_data.json',
    });
  } else if (!isValidSignalProfile(profile)) {
    warnings.push({
      code: 'signal_profile_invalid',
      level: 'error',
      message: 'signalProfile structure invalid (need am.{big,medium,small} and fm.{major,medium,rimshot} with non-negative numbers)',
    });
  } else {
    if (amDial > 0 && amProfileTotal !== amDial) {
      warnings.push({
        code: 'am_profile_dial_mismatch',
        level: 'warn',
        message: `AM profile tiers sum to ${amProfileTotal} but amFreqs has ${amDial} entries`,
      });
    }
    if (fmDial > 0 && fmProfileTotal !== fmDial) {
      warnings.push({
        code: 'fm_profile_dial_mismatch',
        level: 'warn',
        message: `FM profile tiers sum to ${fmProfileTotal} but fmFreqs has ${fmDial} entries`,
      });
    }
    const hints = SIGNAL_DEPTH_HINTS[raw.rankTier];
    if (hints) {
      if (amProfileTotal > 0 && amProfileTotal < hints.am) {
        warnings.push({
          code: 'am_depth_low',
          level: 'warn',
          message: `AM profile total ${amProfileTotal} is low for rankTier=${raw.rankTier} (hint ≥${hints.am})`,
        });
      }
      if (fmProfileTotal > 0 && fmProfileTotal < hints.fm) {
        warnings.push({
          code: 'fm_depth_low',
          level: 'warn',
          message: `FM profile total ${fmProfileTotal} is low for rankTier=${raw.rankTier} (hint ≥${hints.fm})`,
        });
      }
    }
    if (amProfileTotal === 0 && fmProfileTotal === 0) {
      warnings.push({
        code: 'signal_profile_empty',
        level: 'warn',
        message: 'signalProfile tier counts are all zero',
      });
    }
  }

  if (!signalReviewed) {
    warnings.push({
      code: 'signal_unreviewed',
      level: 'warn',
      message: '_scaffold.signalReviewed is not true — human signal-tier review required before merge',
    });
  }

  if (raw._scaffold?.dialReviewed === true && !signalReviewed) {
    warnings.push({
      code: 'dial_before_signal',
      level: 'error',
      message: '_scaffold.dialReviewed is true but signalReviewed is false (invalid order)',
    });
  }

  const signalInventory = assessSignalInventory(raw);
  for (const w of signalInventory.warnings) {
    warnings.push(w);
  }

  const bandConstraints = runSignalBandConstraints(raw);
  for (const c of bandConstraints.constraintFailures) {
    warnings.push(c);
  }
  for (const c of bandConstraints.constraintWarnings) {
    warnings.push(c);
  }
  for (const c of bandConstraints.constraintInfo || []) {
    warnings.push(c);
  }

  if (raw._scaffold?.dialReviewed === true && bandConstraints.hasConstraintFailures) {
    warnings.push({
      code: 'dial_constraint_fail',
      level: 'error',
      message: 'dialReviewed is true but band constraint validation has FAIL items',
    });
  }
  if (signalReviewed && bandConstraints.hasConstraintFailures) {
    warnings.push({
      code: 'signal_constraint_fail',
      level: 'error',
      message: 'signalReviewed is true but band constraint validation has FAIL items',
    });
  }

  return {
    marketId: raw.id,
    generatedAt: new Date().toISOString(),
    constraintSchemaVersion: bandConstraints.constraintSchemaVersion,
    signalProfile: profile ?? null,
    summary: {
      am: profile
        ? {
            ...Object.fromEntries(AM_SIGNAL_TIERS.map((t) => [t, Number(profile.am[t]) || 0])),
            profileTotal: amProfileTotal,
            dialListed: amDial,
            clear: bandConstraints.counts.amClear,
            regional: bandConstraints.counts.amRegional,
            local: bandConstraints.counts.amLocal,
            graveyard: bandConstraints.counts.amGraveyardOnDial,
          }
        : { profileTotal: 0, dialListed: amDial, graveyard: bandConstraints.counts.amGraveyardOnDial },
      fm: profile
        ? {
            ...Object.fromEntries(FM_SIGNAL_TIERS.map((t) => [t, Number(profile.fm[t]) || 0])),
            profileTotal: fmProfileTotal,
            dialListed: fmDial,
            reservedBand: bandConstraints.counts.fmReservedBand,
            commercialBand: bandConstraints.counts.fmCommercialBand,
            major: bandConstraints.counts.fmMajor,
            medium: bandConstraints.counts.fmMedium,
            rimshot: bandConstraints.counts.fmRimshot,
          }
        : {
            profileTotal: 0,
            dialListed: fmDial,
            reservedBand: bandConstraints.counts.fmReservedBand,
            commercialBand: bandConstraints.counts.fmCommercialBand,
          },
      totalAmSignals: amProfileTotal,
      totalFmSignals: fmProfileTotal,
      grandTotal: amProfileTotal + fmProfileTotal,
    },
    bandClassification: {
      am: bandConstraints.amFrequencies,
      fm: bandConstraints.fmFrequencies,
    },
    bandConstraintCounts: bandConstraints.counts,
    constraintFailures: bandConstraints.constraintFailures,
    constraintWarnings: bandConstraints.constraintWarnings,
    constraintInfo: bandConstraints.constraintInfo,
    reservedBandCapacity: bandConstraints.reservedBandCapacity,
    hasConstraintFailures: bandConstraints.hasConstraintFailures,
    signalReviewed,
    warnings,
    suggestedDialTierPlaceholders: buildSuggestedDialTierPlaceholders(raw, profile),
    tierVocabularyNote: bandConstraints.tierVocabularyNote,
    nceCapacityNote: bandConstraints.nceCapacityNote,
    ccmHdNote: bandConstraints.ccmHdNote,
    signalInventory,
    note: 'signalProfile is a gameplay abstraction for competitive signal strength — not FCC engineering data.',
  };
}

function hasTodoText(val) {
  return /\bTODO\b/i.test(String(val || ''));
}

function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  const s = tz.trim();
  if (hasTodoText(s)) return false;
  return /^[A-Za-z_]+\/[A-Za-z_]+$/.test(s) || /^[A-Za-z_]+$/.test(s);
}

/** @returns {Record<string, object>} */
function buildTemplates() {
  const am12 = [
    '590 AM', '640 AM', '750 AM', '860 AM', '920 AM', '1010 AM', '1090 AM', '1160 AM',
    '1230 AM', '1340 AM', '680 AM', '1000 AM',
  ];
  const fm20 = [
    '92.1 FM', '92.5 FM', '93.3 FM', '93.7 FM', '94.1 FM', '94.9 FM', '95.7 FM', '96.7 FM',
    '97.3 FM', '98.1 FM', '98.9 FM', '100.1 FM', '101.5 FM', '102.3 FM', '103.3 FM',
    '104.5 FM', '105.3 FM', '106.7 FM', '107.1 FM', '107.9 FM',
  ];
  const fmFac = (list, kw = '50kw') =>
    Object.fromEntries(list.map((f) => [f, kw]));

  const templates = {
    sunbelt: {
      archetypeId: 'sunbelt_diversified',
      region: 'Southeast',
      callPrefix: 'W',
      rankTier: 'large',
      revScale: 1.0,
      adxBonus: 0.02,
      timezone: null,
      pop: { '12-17': 180, '18-24': 195, '25-34': 210, '35-49': 265, '50-64': 220, '65+': 130 },
      blackPop: 0.32,
      hispPop1970: 0.02,
      hispPop2000: 0.1,
      hispPop2020: 0.18,
      churchGoing: 0.52,
      countryBonus: 0.02,
      urbanBonus: 0.06,
      culture: { country: 0.06, urban: 0.07, newsTalk: 0.05, religion: 0.1, spanish: 0.06 },
      eduIndex: 0.98,
      publicCivicIndex: 0.98,
      fmPenBias: 0,
      fmMusicFragMult: 1.0,
      spokenWordAmResilience: 1.02,
      heritageAmResilience: 1.02,
      countryAmHoldout: 1.0,
      amFreqs: am12,
      fmFreqs: fm20,
      fmFacilityByFreq: { ...fmFac(fm20, '50kw'), '96.1 FM': '100kw', '102.3 FM': '100kw' },
      teams: [
        { id: 'pro_baseball', name: 'TODO Pro Baseball', sport: 'PRO_BASEBALL', introduced: 1970, baseFee: 95000, baseBonus: 0.012, contractYrs: 3 },
        { id: 'pro_football', name: 'TODO Pro Football', sport: 'PRO_FOOTBALL', introduced: 1970, baseFee: 420000, baseBonus: 0.025, contractYrs: 4 },
      ],
      selectBlurb: 'TODO: Sunbelt growth market — soul/R&B, Top 40, gospel lanes; FM specialization accelerates.',
      sourceNotes: { default: 'Template: sunbelt (Atlanta-shaped). Replace all TODO fields.' },
    },
    northeast_mega: {
      archetypeId: 'northeast_mega',
      region: 'Northeast',
      callPrefix: 'W',
      rankTier: 'mega',
      revScale: 6.8,
      adxBonus: 0.05,
      timezone: null,
      pop: { '12-17': 1050, '18-24': 1000, '25-34': 1100, '35-49': 1400, '50-64': 1200, '65+': 750 },
      blackPop: 0.21,
      hispPop1970: 0.12,
      hispPop2000: 0.22,
      hispPop2020: 0.26,
      churchGoing: 0.42,
      countryBonus: 0,
      urbanBonus: 0.14,
      culture: { country: 0.008, urban: 0.16, newsTalk: 0.12, religion: 0.06, spanish: 0.14 },
      eduIndex: 1.22,
      publicCivicIndex: 1.08,
      fmPenBias: 0.055,
      fmMusicFragMult: 1.06,
      spokenWordAmResilience: 1.11,
      heritageAmResilience: 1.08,
      countryAmHoldout: 0.76,
      amFreqs: ['660 AM', '710 AM', '770 AM', '880 AM', '1000 AM', '1010 AM', '1050 AM', '1130 AM', '1200 AM', '1280 AM', '1380 AM', '1500 AM'],
      fmFreqs: [
        '92.1 FM', '92.3 FM', '92.5 FM', '93.1 FM', '93.5 FM', '93.9 FM', '94.1 FM', '94.7 FM', '95.1 FM', '95.5 FM',
        '96.3 FM', '97.1 FM', '97.5 FM', '98.1 FM', '98.7 FM', '99.1 FM', '100.3 FM', '101.1 FM', '102.7 FM', '103.5 FM',
        '104.3 FM', '105.1 FM', '106.7 FM', '107.1 FM', '107.9 FM',
      ],
      fmFacilityByFreq: fmFac(
        ['92.1 FM', '93.1 FM', '95.1 FM', '96.3 FM', '97.1 FM', '98.7 FM', '100.3 FM', '101.1 FM', '102.7 FM', '104.3 FM'],
        '100kw',
      ),
      teams: [
        { id: 'pro_baseball', name: 'TODO MLB', sport: 'PRO_BASEBALL', introduced: 1970, baseFee: 520000, baseBonus: 0.03, contractYrs: 4 },
        { id: 'pro_football', name: 'TODO NFL', sport: 'PRO_FOOTBALL', introduced: 1970, baseFee: 580000, baseBonus: 0.032, contractYrs: 4 },
      ],
      selectBlurb: 'TODO: Mega Northeast — fragmented dial, talk-heavy, high revenue competition.',
      sourceNotes: { default: 'Template: northeast_mega (New York-shaped). Scale down revScale if not true mega.' },
    },
    west_fm_fragmented: {
      archetypeId: 'west_fm_fragmented',
      region: 'West Coast',
      callPrefix: 'K',
      rankTier: 'large',
      revScale: 1.55,
      adxBonus: 0.025,
      timezone: null,
      pop: { '12-17': 320, '18-24': 340, '25-34': 380, '35-49': 480, '50-64': 400, '65+': 240 },
      blackPop: 0.09,
      hispPop1970: 0.03,
      hispPop2000: 0.09,
      hispPop2020: 0.14,
      churchGoing: 0.38,
      countryBonus: 0.1,
      urbanBonus: 0.06,
      culture: { country: 0.12, urban: 0.07, newsTalk: 0.09, religion: 0.05, spanish: 0.08 },
      eduIndex: 1.12,
      publicCivicIndex: 1.07,
      fmPenBias: 0.042,
      fmMusicFragMult: 1.04,
      spokenWordAmResilience: 1.05,
      heritageAmResilience: 1.0,
      countryAmHoldout: 0.95,
      amFreqs: ['570 AM', '800 AM', '1000 AM', '1090 AM', '1150 AM', '1180 AM', '1250 AM', '1300 AM', '1420 AM', '1500 AM'],
      fmFreqs: [
        '92.5 FM', '93.3 FM', '93.7 FM', '94.1 FM', '94.9 FM', '95.7 FM', '96.5 FM', '96.9 FM', '97.1 FM', '98.9 FM',
        '99.1 FM', '100.3 FM', '101.1 FM', '102.5 FM', '103.3 FM', '104.5 FM', '105.9 FM', '106.1 FM', '107.7 FM',
      ],
      fmFacilityByFreq: fmFac(
        ['92.5 FM', '93.7 FM', '94.1 FM', '96.5 FM', '97.1 FM', '98.9 FM', '100.3 FM', '104.5 FM'],
        '100kw',
      ),
      teams: [
        { id: 'pro_baseball', name: 'TODO MLB', sport: 'PRO_BASEBALL', introduced: 1977, baseFee: 200000, baseBonus: 0.018, contractYrs: 3 },
        { id: 'pro_football', name: 'TODO NFL', sport: 'PRO_FOOTBALL', introduced: 1976, baseFee: 380000, baseBonus: 0.027, contractYrs: 4 },
      ],
      selectBlurb: 'TODO: West FM-fragmented — rock/alt heritage, educated listeners, competitive news.',
      sourceNotes: { default: 'Template: west_fm_fragmented (Seattle-shaped).' },
    },
    southern_country: {
      archetypeId: 'southern_country',
      region: 'South',
      callPrefix: 'W',
      rankTier: 'medium',
      revScale: 0.5,
      adxBonus: 0.03,
      timezone: null,
      pop: { '12-17': 95, '18-24': 110, '25-34': 120, '35-49': 150, '50-64': 125, '65+': 75 },
      blackPop: 0.18,
      hispPop1970: 0.008,
      hispPop2000: 0.045,
      hispPop2020: 0.095,
      churchGoing: 0.58,
      countryBonus: 0.18,
      urbanBonus: 0.02,
      culture: { country: 0.26, urban: 0.03, newsTalk: 0.04, religion: 0.1, spanish: 0.02 },
      eduIndex: 0.88,
      publicCivicIndex: 0.96,
      fmPenBias: -0.058,
      fmMusicFragMult: 0.96,
      spokenWordAmResilience: 1.0,
      heritageAmResilience: 1.06,
      countryAmHoldout: 1.2,
      amFreqs: ['650 AM', '760 AM', '800 AM', '1000 AM', '1040 AM', '1160 AM', '1240 AM', '1300 AM'],
      fmFreqs: ['93.1 FM', '94.1 FM', '96.3 FM', '97.9 FM', '100.1 FM', '102.9 FM', '104.5 FM', '105.1 FM', '107.5 FM'],
      fmFacilityByFreq: fmFac(['93.1 FM', '94.1 FM', '97.9 FM', '102.9 FM'], '100kw'),
      teams: [
        { id: 'pro_hockey', name: 'TODO NHL', sport: 'PRO_HOCKEY', introduced: 1998, baseFee: 115000, baseBonus: 0.014, contractYrs: 3 },
      ],
      selectBlurb: 'TODO: Southern country heritage — deep country loyalty, gospel/CCM institutional tone.',
      sourceNotes: { default: 'Template: southern_country (Nashville-shaped).' },
    },
    midwest_legacy: {
      archetypeId: 'midwest_legacy',
      region: 'Midwest',
      callPrefix: 'K',
      rankTier: 'medium',
      revScale: 0.55,
      adxBonus: 0.025,
      timezone: null,
      pop: { '12-17': 80, '18-24': 95, '25-34': 105, '35-49': 130, '50-64': 110, '65+': 68 },
      blackPop: 0.14,
      hispPop1970: 0.02,
      hispPop2000: 0.08,
      hispPop2020: 0.14,
      churchGoing: 0.5,
      countryBonus: 0.12,
      urbanBonus: 0.03,
      culture: { country: 0.14, urban: 0.04, newsTalk: 0.06, religion: 0.08, spanish: 0.04 },
      eduIndex: 0.92,
      publicCivicIndex: 0.95,
      fmPenBias: -0.04,
      fmMusicFragMult: 0.98,
      spokenWordAmResilience: 1.02,
      heritageAmResilience: 1.04,
      countryAmHoldout: 1.05,
      amFreqs: ['900 AM', '1070 AM', '1240 AM', '1330 AM', '1410 AM', '1520 AM'],
      fmFreqs: ['92.3 FM', '93.9 FM', '94.5 FM', '95.1 FM', '96.7 FM', '97.3 FM', '98.1 FM', '99.9 FM', '100.1 FM', '101.9 FM', '104.5 FM', '105.3 FM'],
      fmFacilityByFreq: fmFac(['95.1 FM', '99.9 FM'], '100kw'),
      teams: [
        { id: 'pro_baseball', name: 'TODO MiLB/MLB', sport: 'PRO_BASEBALL', introduced: 1970, baseFee: 35000, baseBonus: 0.006, contractYrs: 3 },
      ],
      selectBlurb: 'TODO: Midwest legacy — country/classic rock, AM heritage fading into FM.',
      sourceNotes: { default: 'Template: midwest_legacy (Wichita-shaped, medium scale).' },
    },
    coastal_secular: {
      archetypeId: 'coastal_secular',
      region: 'West Coast',
      callPrefix: 'K',
      rankTier: 'large',
      revScale: 1.45,
      adxBonus: 0.028,
      timezone: null,
      pop: { '12-17': 280, '18-24': 310, '25-34': 360, '35-49': 420, '50-64': 340, '65+': 200 },
      blackPop: 0.08,
      hispPop1970: 0.06,
      hispPop2000: 0.16,
      hispPop2020: 0.2,
      churchGoing: 0.27,
      countryBonus: 0.04,
      urbanBonus: 0.1,
      culture: { country: 0.05, urban: 0.14, newsTalk: 0.08, religion: 0.034, spanish: 0.12 },
      eduIndex: 1.16,
      publicCivicIndex: 1.05,
      fmPenBias: 0.048,
      fmMusicFragMult: 1.06,
      spokenWordAmResilience: 1.04,
      heritageAmResilience: 0.98,
      countryAmHoldout: 0.92,
      amFreqs: ['560 AM', '610 AM', '680 AM', '740 AM', '810 AM', '910 AM', '1010 AM', '1030 AM', '1100 AM'],
      fmFreqs: fm20,
      fmFacilityByFreq: fmFac(fm20, '50kw'),
      teams: [
        { id: 'pro_baseball', name: 'TODO MLB', sport: 'PRO_BASEBALL', introduced: 1970, baseFee: 420000, baseBonus: 0.024, contractYrs: 3 },
      ],
      selectBlurb: 'TODO: Coastal secular — educated, fragmented FM, modest religious institutional dial.',
      sourceNotes: { default: 'Template: coastal_secular (San Francisco-shaped).' },
    },
    plains_small: {
      archetypeId: 'plains_small',
      region: 'Midwest',
      callPrefix: 'K',
      rankTier: 'small',
      revScale: 0.32,
      adxBonus: 0.025,
      timezone: null,
      pop: { '12-17': 52, '18-24': 60, '25-34': 66, '35-49': 82, '50-64': 68, '65+': 42 },
      blackPop: 0.11,
      hispPop1970: 0.02,
      hispPop2000: 0.08,
      hispPop2020: 0.16,
      churchGoing: 0.52,
      countryBonus: 0.1,
      urbanBonus: 0.03,
      culture: { country: 0.14, urban: 0.04, newsTalk: 0.05, religion: 0.09, spanish: 0.04 },
      eduIndex: 0.9,
      publicCivicIndex: 0.94,
      fmPenBias: -0.04,
      fmMusicFragMult: 0.98,
      spokenWordAmResilience: 1.02,
      heritageAmResilience: 1.04,
      countryAmHoldout: 1.05,
      amFreqs: ['900 AM', '1070 AM', '1240 AM', '1330 AM', '1410 AM'],
      fmFreqs: ['92.3 FM', '93.9 FM', '94.5 FM', '95.1 FM', '96.7 FM', '97.3 FM', '98.1 FM', '99.9 FM', '100.1 FM', '101.9 FM', '104.5 FM', '105.3 FM'],
      fmFacilityByFreq: fmFac(['95.1 FM', '99.9 FM'], '100kw'),
      teams: [
        { id: 'pro_baseball', name: 'TODO MiLB', sport: 'PRO_BASEBALL', introduced: 1970, baseFee: 12000, baseBonus: 0.004, contractYrs: 3 },
      ],
      selectBlurb: 'TODO: Small plains market — country and AC dominate; limited dial depth.',
      sourceNotes: { default: 'Template: plains_small (Wichita-shaped).' },
    },
  };

  for (const [key, t] of Object.entries(templates)) {
    t._dialFingerprint = dialFingerprint(t.amFreqs, t.fmFreqs);
    t._templateKey = key;
  }
  return templates;
}

function getTemplateFingerprints(templates) {
  const fp = {};
  for (const key of TEMPLATE_KEYS) {
    fp[key] = templates[key]._dialFingerprint;
  }
  return fp;
}

function buildRawMarketData(cityId, label, templateKey, templates) {
  const base = templates[templateKey];
  if (!base) throw new Error(`Unknown template: ${templateKey}`);
  const raw = JSON.parse(JSON.stringify(base));
  raw.id = cityId;
  raw.label = label;
  const geo = CITY_GEOGRAPHY[cityId];
  if (geo?.timezone && !raw.timezone) raw.timezone = geo.timezone;
  raw.signalProfile = buildDefaultSignalProfile(
    (raw.amFreqs || []).length,
    (raw.fmFreqs || []).length,
  );
  raw._scaffold = {
    version: 2,
    template: templateKey,
    status: 'draft',
    generatedAt: new Date().toISOString(),
    dialReviewed: false,
    signalReviewed: false,
    dataReviewed: false,
    ecologyRegressionRecorded: false,
    warnings: [
      'PLACEHOLDER — template copy; not sourced from Census/Nielsen/FCC.',
      'signalProfile is a gameplay tier draft — set _scaffold.signalReviewed after human signal review.',
      'Dial lists (amFreqs/fmFreqs/fmFacilityByFreq) require human review before merge.',
      'Set _scaffold.dialReviewed=true only after signalReviewed and FCC-sourced dial verified.',
      'teams names/fees are TODO stubs.',
      'Do not add this market to playable lists until readiness is MERGE_READY.',
    ],
  };
  return raw;
}

function loadRawJson(rawPath) {
  if (!existsSync(rawPath)) throw new Error(`Missing ${rawPath}`);
  return JSON.parse(readFileSync(rawPath, 'utf8'));
}

function deriveEcologySeries(raw) {
  const byYear = {};
  for (const year of ECOLOGY_YEARS) {
    byYear[year] = deriveMarketEcology(raw, raw.id, year, null);
  }
  return {
    marketId: raw.id,
    archetypeId: raw.archetypeId,
    years: ECOLOGY_YEARS,
    byYear,
    latest: byYear[2026],
    derivedAt: new Date().toISOString(),
  };
}

function fmtNum(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

function jsString(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function emitPop(pop) {
  return POP_KEYS.map((k) => `${jsString(k)}:${pop[k]}`).join(',');
}

function emitCulture(c) {
  return `country:${c.country},urban:${c.urban},newsTalk:${c.newsTalk},religion:${c.religion},spanish:${c.spanish}`;
}

function emitTeams(teams) {
  return teams
    .map(
      (t) =>
        `      {id:${jsString(t.id)},name:${jsString(t.name)},sport:${jsString(t.sport)},introduced:${t.introduced},baseFee:${t.baseFee},baseBonus:${t.baseBonus},contractYrs:${t.contractYrs}}`,
    )
    .join(',\n');
}

function emitFmFacility(map) {
  const entries = Object.entries(map || {});
  if (!entries.length) return '{}';
  const lines = entries.map(([f, pw]) => `      ${jsString(f)}:${jsString(pw)}`);
  return `{\n${lines.join(',\n')},\n    }`;
}

function emitSuggestedMarketsRow(raw) {
  const amList = raw.amFreqs.map(jsString).join(',');
  const fmList = raw.fmFreqs.map(jsString).join(',');
  const tzComment = raw.timezone
    ? `\n    // timezone:${jsString(raw.timezone)} — add to MARKETS when gameplay supports it`
    : '\n    // timezone: REQUIRED before merge — set in raw_market_data.json';
  return `/**
 * Suggested MARKETS row — scaffold v2 (DO NOT merge without human review)
 * City: ${raw.label} (${raw.id}) | template: ${raw._scaffold?.template ?? '?'}
 *
 * WARNING:
 * - amFreqs / fmFreqs / fmFacilityByFreq must be FCC-sourced (not template copy).
 * - revScale / adxBonus / teams fees need Nielsen and league research.
 * - Verify callPrefix, region, and timezone with real market geography.
 * - Run: npm run scaffold:market -- --city=${raw.id} --check
 */
  ${raw.id}:{
    id:${jsString(raw.id)}, callPrefix:${jsString(raw.callPrefix)}, label:${jsString(raw.label)}, region:${jsString(raw.region)}, rankTier:${jsString(raw.rankTier)}, archetypeId:${jsString(raw.archetypeId)},
    pop:{${emitPop(raw.pop)}},
    revScale:${fmtNum(raw.revScale)}, adxBonus:${fmtNum(raw.adxBonus)},${tzComment}
    amFreqs:[${amList}],
    fmFreqs:[${fmList}],
    fmFacilityByFreq:${emitFmFacility(raw.fmFacilityByFreq)},
    blackPop:${fmtNum(raw.blackPop)},hispPop1970:${fmtNum(raw.hispPop1970)},hispPop2000:${fmtNum(raw.hispPop2000)},hispPop2020:${fmtNum(raw.hispPop2020)},churchGoing:${fmtNum(raw.churchGoing)},countryBonus:${fmtNum(raw.countryBonus)},urbanBonus:${fmtNum(raw.urbanBonus)},
    culture:{${emitCulture(raw.culture)}},
    selectBlurb:${jsString(raw.selectBlurb)},
    fmPenBias:${fmtNum(raw.fmPenBias)}, fmMusicFragMult:${fmtNum(raw.fmMusicFragMult)}, spokenWordAmResilience:${fmtNum(raw.spokenWordAmResilience)}, heritageAmResilience:${fmtNum(raw.heritageAmResilience)}, countryAmHoldout:${fmtNum(raw.countryAmHoldout)},
    eduIndex:${fmtNum(raw.eduIndex)},
    publicCivicIndex:${fmtNum(raw.publicCivicIndex)},
    teams:[
${emitTeams(raw.teams)}
    ],
  },
`;
}

const FORMAT_HINTS = [
  { keys: ['countryStrength'], formats: 'COUNTRY', threshold: 0.45 },
  { keys: ['gospelStrength', 'ccmStrength'], formats: 'GOSPEL / CCM / RELIGIOUS_NETWORK', threshold: 0.42 },
  { keys: ['aaaAlternativeStrength'], formats: 'AAA / ALT_ROCK / ALBUM_ROCK', threshold: 0.5 },
  { keys: ['spanishLanguageStrength'], formats: 'SPANISH', threshold: 0.35 },
  { keys: ['urbanContemporaryStrength', 'blackMusicStrength'], formats: 'URBAN_CONTEMP / SOUL_RNB / RHYTHMIC', threshold: 0.4 },
  { keys: ['spokenWordStrength'], formats: 'NEWS_TALK / SPORTS_TALK / ALL_NEWS', threshold: 0.45 },
  { keys: ['publicRadioStrength'], formats: 'PUBLIC_NEWS / PUBLIC_ECLECTIC / PUBLIC_JAZZ', threshold: 0.55 },
  { keys: ['sportsStrength'], formats: 'SPORTS_TALK', threshold: 0.5 },
  { keys: ['chrResistance'], formats: 'TOP40 / HOT_AC (era-dependent)', threshold: 0.55, weakWhen: ['modernMusicSubstitution', 0.55] },
  { keys: ['modernMusicSubstitution'], formats: 'streaming substitution pressure on CHR', threshold: 0.5 },
];

function ecologyFormatHints(eco) {
  const strong = [];
  const weak = [];
  for (const h of FORMAT_HINTS) {
    const v = h.keys.reduce((a, k) => a + (Number(eco[k]) || 0) / h.keys.length, 0);
    if (v >= h.threshold) strong.push(`- **${h.formats}** (${(v * 100).toFixed(0)}% trait proxy)`);
    else if (h.weakWhen) {
      const [wk, th] = h.weakWhen;
      if ((Number(eco[wk]) || 0) >= th) weak.push(`- **${h.formats}** dampened by ${wk}`);
    } else if (v < h.threshold * 0.55) {
      weak.push(`- **${h.formats}** (low ${h.keys.join('/')})`);
    }
  }
  return { strong, weak };
}

function templateComparisonBlock(templateKey) {
  const c = TEMPLATE_COMPARISONS[templateKey];
  if (!c) return '- (no comparison notes for this template)';
  return [
    `**Template:** \`${c.label}\``,
    `**Compare to playable markets:** ${c.compareMarkets.map((m) => `\`${m}\``).join(', ')}`,
    c.notes,
  ].join('\n');
}

function emitDiagnosticsNotes(raw, derived, checkSummary) {
  const eco = derived.latest;
  const inventory = assessSignalInventory(raw);
  const { strong, weak } = ecologyFormatHints(eco);
  const traitLines = Object.entries(eco)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `| ${k} | ${v.toFixed(3)} |`);

  const yearTable = ECOLOGY_YEARS.map((y) => {
    const e = derived.byYear[y];
    return `| ${y} | ${e.chrResistance?.toFixed(2)} | ${e.marketFragmentation?.toFixed(2)} | ${e.modernMusicSubstitution?.toFixed(2)} | ${e.countryStrength?.toFixed(2)} | ${e.publicRadioStrength?.toFixed(2)} |`;
  }).join('\n');

  const readinessSection = checkSummary
    ? `## Readiness (last check)

**State:** \`${checkSummary.readiness}\`  
**Checked:** ${checkSummary.checkedAt}

| Result | Count |
|--------|-------|
| PASS | ${checkSummary.counts.PASS} |
| WARN | ${checkSummary.counts.WARN} |
| FAIL | ${checkSummary.counts.FAIL} |

\`\`\`
${checkSummary.lines.join('\n')}
\`\`\`
`
    : '';

  return `# Diagnostics notes — ${raw.label} (\`${raw.id}\`)

**Scaffold template:** \`${raw._scaffold?.template}\`  
**Scaffold status:** \`${raw._scaffold?.status ?? 'draft'}\` — not in playable markets

${readinessSection}
## Template comparison (diagnostic only)

${templateComparisonBlock(raw._scaffold?.template)}

## Trait summary (2026)

| Trait | Value |
|-------|-------|
${traitLines.join('\n')}

## Ecology by year

| Year | chrResistance | marketFragmentation | modernMusicSubstitution | countryStrength | publicRadioStrength |
|------|---------------|---------------------|-------------------------|-----------------|---------------------|
${yearTable}

## Likely strong formats (heuristic from 2026 traits)

${strong.length ? strong.join('\n') : '- (none above threshold — review raw demographics)'}

## Likely weak / pressured formats

${weak.length ? weak.join('\n') : '- (none flagged)'}

## Signal inventory (tier targets)

| Era | Value | ${raw.rankTier}-tier target | Source |
|-----|-------|-----------------------------|--------|
| 1975 historical | ${
  inventory.inventory1975?.hasBandTotals
    ? `${inventory.inventory1975.am1975} AM / ${inventory.inventory1975.fm1975} FM / ${inventory.inventory1975.total1975} total`
    : inventory.inventory1975?.hasAny1975
      ? '(incomplete — set am1975, fm1975, total1975)'
      : '— (not set)'
} | historical dial | ${inventory.inventory1975?.hasBandTotals ? 'explicit' : 'missing'} |
| 1983 viable | ${inventory.viable1983} | ${inventory.targets ? `${inventory.targets.viable1983[0]}–${inventory.targets.viable1983[1]}` : '—'} | ${inventory.sources.viable1983 || 'explicit'} |
| 2026 measurable | ${inventory.measurable2026} | ${inventory.targets ? `${inventory.targets.measurable2026[0]}–${inventory.targets.measurable2026[1]}` : '—'} | ${inventory.sources.measurable2026 || 'explicit'} |

Primary full-power on dial: **${inventory.primaryFullPower.total}** (${inventory.primaryFullPower.am} AM + ${inventory.primaryFullPower.fm} FM; ${inventory.primaryFullPower.excluded} excluded translator/HD). Dial listed: ${inventory.dialListedTotal}. Profile grand total: ${inventory.profileGrandTotal}. ${
  !inventory.inventory1975?.hasAny1975
    ? '**1970s starts:** add `signalInventory.am1975` / `fm1975` / `total1975` — do not use modern dial size as the 1975 inventory.'
    : ''
}

${inventory.anchorNote ? `${inventory.anchorNote}\n` : ''}${inventory.notes ? `Notes: ${inventory.notes}\n` : ''}

## Revenue assumptions (draft)

| Field | Value | Note |
|-------|-------|------|
| rankTier | ${raw.rankTier} | Drives dial depth + inventory targets |
| revScale | ${raw.revScale} | Compare Nielsen revenue rank |
| adxBonus | ${raw.adxBonus} | Template default until sourced |
| timezone | ${raw.timezone ?? '(missing)'} | Required for merge readiness |
| teams | ${raw.teams.length} | Replace TODO team names/fees |

## Workflow commands

\`\`\`bash
# After editing raw_market_data.json:
npm run scaffold:market -- --city=${raw.id} --derive
npm run scaffold:market -- --city=${raw.id} --check

# After MARKETS merge + market-ids.cjs:
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=${raw.id} --runs=8
# Then save summary to ecology_regression_record.json and re-run --check
\`\`\`

## Scaffold warnings

${(raw._scaffold?.warnings || []).map((w) => `- ${w}`).join('\n')}
`;
}

function scaffoldPaths(cityId, outDirOpt) {
  const outDir = path.resolve(ROOT, outDirOpt || path.join('tmp', 'market_scaffold', cityId));
  return {
    outDir,
    rawPath: path.join(outDir, 'raw_market_data.json'),
    derivedPath: path.join(outDir, 'derived_ecology.json'),
    rowPath: path.join(outDir, 'suggested_MARKETS_row.js'),
    notesPath: path.join(outDir, 'diagnostics_notes.md'),
    readinessPath: path.join(outDir, 'readiness.json'),
    regressionPath: path.join(outDir, 'ecology_regression_record.json'),
    signalAllocationPath: path.join(outDir, 'signal_allocation.json'),
  };
}

function writeSignalAllocation(raw, paths) {
  const allocation = buildSignalAllocation(raw);
  writeFileSync(paths.signalAllocationPath, `${JSON.stringify(allocation, null, 2)}\n`, 'utf8');
  return allocation;
}

function writeDerivedOutputs(raw, derived, paths, checkSummary = null, { writeRaw = true } = {}) {
  if (writeRaw) writeFileSync(paths.rawPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  writeFileSync(paths.derivedPath, `${JSON.stringify(derived, null, 2)}\n`, 'utf8');
  writeFileSync(paths.rowPath, `${emitSuggestedMarketsRow(raw)}\n`, 'utf8');
  writeFileSync(paths.notesPath, emitDiagnosticsNotes(raw, derived, checkSummary), 'utf8');
  writeSignalAllocation(raw, paths);
}

/**
 * @returns {{ items: Array<{level:string,code:string,message:string}>, lines: string[], counts: Record<string,number> }}
 */
function runReadinessChecks(raw, derived, paths, templates) {
  const items = [];
  const add = (level, code, message) => items.push({ level, code, message });

  if (!existsSync(paths.rawPath)) add('FAIL', 'missing_raw', 'raw_market_data.json missing');
  if (!existsSync(paths.derivedPath)) add('FAIL', 'missing_derived', 'derived_ecology.json missing');
  if (!existsSync(paths.rowPath)) add('FAIL', 'missing_row', 'suggested_MARKETS_row.js missing');
  if (!existsSync(paths.notesPath)) add('FAIL', 'missing_notes', 'diagnostics_notes.md missing');

  if (!raw?.id) add('FAIL', 'missing_id', 'raw.id is required');
  if (!raw?.label || hasTodoText(raw.label)) add('FAIL', 'missing_label', 'label missing or contains TODO');

  const cp = String(raw?.callPrefix || '').trim();
  if (!cp || hasTodoText(cp)) add('FAIL', 'call_prefix', 'callPrefix missing or placeholder');
  else if (!VALID_CALL_PREFIX.has(cp)) add('FAIL', 'call_prefix_invalid', `callPrefix must be K or W (got ${cp})`);
  else add('PASS', 'call_prefix', `callPrefix=${cp}`);

  const tier = String(raw?.rankTier || '').trim();
  if (!tier) add('FAIL', 'rank_tier', 'rankTier missing');
  else if (!VALID_RANK_TIERS.has(tier)) add('FAIL', 'rank_tier_invalid', `invalid rankTier: ${tier}`);
  else add('PASS', 'rank_tier', `rankTier=${tier}`);

  const rs = raw?.revScale;
  if (rs == null || Number.isNaN(Number(rs)) || Number(rs) <= 0) {
    add('FAIL', 'rev_scale', 'revScale missing or non-positive');
  } else if (hasTodoText(raw.sourceNotes?.revScale)) {
    add('FAIL', 'rev_scale_todo', 'revScale sourceNotes still contain TODO');
  } else {
    add('PASS', 'rev_scale', `revScale=${rs}`);
  }

  if (!isValidTimezone(raw?.timezone)) {
    add('FAIL', 'timezone', 'timezone missing or invalid (use IANA e.g. America/Phoenix)');
  } else add('PASS', 'timezone', `timezone=${raw.timezone}`);

  const geo = CITY_GEOGRAPHY[raw.id];
  if (geo && raw.region && raw.region !== geo.region) {
    add('FAIL', 'region_mismatch', `region "${raw.region}" does not match expected "${geo.region}" for ${raw.id}`);
  } else if (geo) {
    add('PASS', 'region_geo', `region matches geography hint (${geo.region})`);
  } else if (hasTodoText(raw.region)) {
    add('WARN', 'region_todo', 'region contains TODO — verify manually');
  } else {
    add('PASS', 'region', `region=${raw.region}`);
  }

  const templateKey = raw._scaffold?.template;
  const fingerprints = getTemplateFingerprints(templates);
  const rawFp = dialFingerprint(raw.amFreqs, raw.fmFreqs);
  const dialReviewed = raw._scaffold?.dialReviewed === true;

  if (!Array.isArray(raw.amFreqs) || raw.amFreqs.length < 3) {
    add('FAIL', 'dial_am', 'amFreqs too short or missing');
  }
  if (!Array.isArray(raw.fmFreqs) || raw.fmFreqs.length < 5) {
    add('FAIL', 'dial_fm', 'fmFreqs too short or missing');
  }

  if (templateKey && fingerprints[templateKey] === rawFp && !dialReviewed) {
    add('FAIL', 'dial_placeholder', `Dial lists match untouched template fingerprint (${templateKey}) — FCC review required`);
  } else if (!dialReviewed) {
    add('WARN', 'dial_unreviewed', '_scaffold.dialReviewed is not true — confirm dial is sourced');
  } else {
    add('PASS', 'dial_reviewed', 'Dial marked reviewed (_scaffold.dialReviewed=true)');
  }

  if (!raw.pop || POP_KEYS.some((k) => raw.pop[k] == null)) {
    add('FAIL', 'pop_cohorts', 'pop cohort object incomplete');
  } else add('PASS', 'pop_cohorts', 'pop cohorts present');

  if (!raw.culture || typeof raw.culture !== 'object') {
    add('FAIL', 'culture', 'culture object missing');
  } else add('PASS', 'culture', 'culture fields present');

  if (hasTodoText(raw.selectBlurb)) add('WARN', 'select_blurb_todo', 'selectBlurb still contains TODO');
  else add('PASS', 'select_blurb', 'selectBlurb present');

  if ((raw.teams || []).some((t) => hasTodoText(t.name))) {
    add('WARN', 'teams_todo', 'One or more teams still have TODO names');
  } else add('PASS', 'teams', `teams count=${(raw.teams || []).length}`);

  if (!derived?.latest) {
    add('FAIL', 'ecology_missing', 'derived ecology (2026) missing — run --derive');
  } else {
    let ecoFail = false;
    for (const key of ECOLOGY_TRAIT_KEYS) {
      const v = derived.latest[key];
      if (typeof v !== 'number' || Number.isNaN(v)) {
        add('FAIL', 'ecology_trait', `ecology trait missing: ${key}`);
        ecoFail = true;
      }
    }
    if (!ecoFail) add('PASS', 'ecology_traits', 'All core ecology traits present (2026)');
  }

  const hasRegressionFile = existsSync(paths.regressionPath);
  const regressionFlag = raw._scaffold?.ecologyRegressionRecorded === true;
  if (hasRegressionFile) {
    try {
      const rec = JSON.parse(readFileSync(paths.regressionPath, 'utf8'));
      if (rec.marketId && rec.marketId !== raw.id) {
        add('WARN', 'regression_id', `ecology_regression_record.json marketId=${rec.marketId} != ${raw.id}`);
      } else {
        add('PASS', 'regression_file', 'ecology_regression_record.json present');
      }
    } catch {
      add('FAIL', 'regression_parse', 'ecology_regression_record.json invalid JSON');
    }
  } else if (regressionFlag) {
    add('WARN', 'regression_flag_only', 'ecologyRegressionRecorded flag set but ecology_regression_record.json missing');
  } else {
    add('WARN', 'regression_missing', 'No ecology regression record — run diag after MARKETS merge, save ecology_regression_record.json');
  }

  if (raw._scaffold?.dataReviewed !== true) {
    add('WARN', 'data_unreviewed', '_scaffold.dataReviewed is not true');
  }

  const signalReviewed = raw._scaffold?.signalReviewed === true;
  const dialReviewedFlag = raw._scaffold?.dialReviewed === true;
  const hasDerivedEcology = Boolean(derived?.latest);
  const profile = raw.signalProfile;

  if (!profile) {
    if (hasDerivedEcology) {
      add('FAIL', 'signal_profile_missing', 'signalProfile missing (required once ecology is derived)');
    } else {
      add('WARN', 'signal_profile_missing', 'signalProfile missing — add tier counts before playtest');
    }
  } else if (!isValidSignalProfile(profile)) {
    add('FAIL', 'signal_profile_invalid', 'signalProfile invalid — need am/fm tier objects with non-negative counts');
  } else {
    const amPt = signalTierTotal(profile, 'am', AM_SIGNAL_TIERS);
    const fmPt = signalTierTotal(profile, 'fm', FM_SIGNAL_TIERS);
    add('PASS', 'signal_profile', `signalProfile present (AM=${amPt}, FM=${fmPt})`);
    const amDial = (raw.amFreqs || []).length;
    const fmDial = (raw.fmFreqs || []).length;
    if (amDial > 0 && amPt !== amDial) {
      add('WARN', 'am_profile_dial_mismatch', `AM profile total ${amPt} ≠ amFreqs length ${amDial}`);
    }
    if (fmDial > 0 && fmPt !== fmDial) {
      add('WARN', 'fm_profile_dial_mismatch', `FM profile total ${fmPt} ≠ fmFreqs length ${fmDial}`);
    }
    const hints = SIGNAL_DEPTH_HINTS[raw.rankTier];
    if (hints && (amPt < hints.am || fmPt < hints.fm)) {
      add('WARN', 'signal_depth_low', `Signal depth may be low for rankTier=${raw.rankTier}`);
    }
  }

  if (dialReviewedFlag && !signalReviewed) {
    add('FAIL', 'dial_before_signal', 'dialReviewed cannot be true unless signalReviewed is true');
  }

  if (!signalReviewed) {
    add('WARN', 'signal_unreviewed', '_scaffold.signalReviewed is not true — human signal-tier review required');
  } else {
    add('PASS', 'signal_reviewed', 'Signal tiers marked reviewed (_scaffold.signalReviewed=true)');
  }

  const bandConstraints = runSignalBandConstraints(raw);
  for (const c of bandConstraints.constraintFailures) {
    add('FAIL', c.code, c.message);
  }
  for (const c of bandConstraints.constraintWarnings) {
    add('WARN', c.code, c.message);
  }
  if (bandConstraints.hasConstraintFailures) {
    add('FAIL', 'signal_constraints', `${bandConstraints.constraintFailures.length} band constraint failure(s)`);
  } else if (bandConstraints.constraintWarnings.length > 0) {
    add('PASS', 'signal_constraints_ok', `Band constraints OK (${bandConstraints.constraintWarnings.length} warning(s))`);
  } else {
    add('PASS', 'signal_constraints_ok', 'Band constraints OK');
  }

  if (dialReviewedFlag && bandConstraints.hasConstraintFailures) {
    add('FAIL', 'dial_constraint_fail', 'dialReviewed is true but band constraint validation failed');
  }
  if (signalReviewed && bandConstraints.hasConstraintFailures) {
    add('FAIL', 'signal_constraint_fail', 'signalReviewed is true but band constraint validation failed');
  }

  const signalInventory = assessSignalInventory(raw);
  if (signalInventory.missingExplicit.viable1983 || signalInventory.missingExplicit.measurable2026) {
    if (signalReviewed) {
      add(
        'FAIL',
        'inventory_missing',
        'signalInventory.viable1983 and/or measurable2026 required after _scaffold.signalReviewed=true',
      );
    } else {
      add(
        'WARN',
        'inventory_missing',
        'Add signalInventory.viable1983 and measurable2026 (tier targets in signal_allocation.json)',
      );
    }
  } else {
    add(
      'PASS',
      'inventory_explicit',
      `signalInventory explicit (viable1983=${signalInventory.viable1983}, measurable2026=${signalInventory.measurable2026})`,
    );
  }
  for (const w of signalInventory.warnings) {
    if (w.level === 'info') continue;
    add('WARN', w.code || 'inventory_warn', w.message);
  }
  for (const f of signalInventory.reviewFailures1975 || []) {
    if (signalReviewed) add('FAIL', f.code, f.message);
    else add('WARN', f.code, f.message);
  }
  if (signalInventory.inventory1975?.hasBandTotals) {
    const i = signalInventory.inventory1975;
    add(
      'PASS',
      'inventory_1975',
      `1975 inventory: ${i.am1975} AM + ${i.fm1975} FM = ${i.total1975} total` +
        (i.viable1975 != null ? ` (viable ${i.viable1975})` : ''),
    );
  }
  if (signalInventory.targets) {
    const [vLo, vHi] = signalInventory.targets.viable1983;
    const [mLo, mHi] = signalInventory.targets.measurable2026;
    const inViable =
      signalInventory.viable1983 >= vLo && signalInventory.viable1983 <= vHi ? 'in' : 'outside';
    const inMeas =
      signalInventory.measurable2026 >= mLo && signalInventory.measurable2026 <= mHi ? 'in' : 'outside';
    add(
      'PASS',
      'inventory_tier_targets',
      `${signalInventory.rankTier}-tier targets: viable ${vLo}–${vHi} (${inViable}), measurable ${mLo}–${mHi} (${inMeas})`,
    );
  }

  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const it of items) counts[it.level] = (counts[it.level] || 0) + 1;

  const lines = items.map((it) => `[${it.level}] ${it.message}`);
  return { items, lines, counts };
}

function computeReadiness(readinessItems) {
  const hasFail = readinessItems.some((i) => i.level === 'FAIL');
  const codes = new Set(readinessItems.map((i) => i.code));

  if (hasFail) return 'DRAFT';

  const dataBlockers = ['missing_raw', 'missing_id', 'missing_label', 'call_prefix', 'call_prefix_invalid', 'rank_tier', 'rank_tier_invalid', 'rev_scale', 'timezone', 'pop_cohorts', 'culture', 'dial_am', 'dial_fm'];
  if (dataBlockers.some((c) => codes.has(c) && readinessItems.find((i) => i.code === c)?.level === 'FAIL')) {
    return 'DRAFT';
  }

  const dataReady = !['call_prefix', 'rank_tier', 'rev_scale', 'timezone', 'pop_cohorts', 'culture'].some(
    (c) => codes.has(c) && readinessItems.find((i) => i.code === c)?.level === 'FAIL',
  );
  if (!dataReady) return 'DRAFT';

  if (codes.has('dial_placeholder') || codes.has('region_mismatch')) return 'DATA_READY';

  if (codes.has('ecology_missing') || codes.has('ecology_trait')) return 'DATA_READY';

  const ecologyReady =
    codes.has('ecology_traits') &&
    !readinessItems.some((i) => i.code.startsWith('ecology_') && i.level === 'FAIL');
  if (!ecologyReady) return 'DATA_READY';

  if (codes.has('regression_missing') || codes.has('regression_flag_only') || codes.has('regression_parse')) {
    return 'ECOLOGY_READY';
  }

  if (
    codes.has('dial_unreviewed') ||
    codes.has('signal_unreviewed') ||
    codes.has('signal_profile_missing') ||
    codes.has('select_blurb_todo') ||
    codes.has('teams_todo') ||
    codes.has('data_unreviewed')
  ) {
    return 'PLAYTEST_READY';
  }

  const mergeBlockers = [
    'dial_placeholder',
    'dial_before_signal',
    'dial_constraint_fail',
    'signal_constraint_fail',
    'signal_constraints',
    'graveyard_am_big',
    'graveyard_am_regional',
    'graveyard_am_power',
    'region_mismatch',
    'call_prefix',
    'rev_scale',
    'timezone',
    'rank_tier',
    'ecology_missing',
    'missing_derived',
    'missing_notes',
    'missing_row',
    'regression_missing',
    'regression_parse',
    'signal_profile_missing',
    'signal_profile_invalid',
    'signal_unreviewed',
    'inventory_missing',
    'inventory_1975_total_mismatch',
  ];
  if (mergeBlockers.some((c) => codes.has(c))) return 'PLAYTEST_READY';

  return 'MERGE_READY';
}

function runCheck(cityId, outDirOpt, templates) {
  const paths = scaffoldPaths(cityId, outDirOpt);
  let raw;
  let derived;
  try {
    raw = loadRawJson(paths.rawPath);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (existsSync(paths.derivedPath)) {
    try {
      derived = JSON.parse(readFileSync(paths.derivedPath, 'utf8'));
    } catch {
      derived = null;
    }
  }
  if (!derived?.latest && raw) {
    derived = deriveEcologySeries(raw);
  }

  const { items, lines, counts } = runReadinessChecks(raw, derived, paths, templates);
  const readiness = computeReadiness(items);
  const checkedAt = new Date().toISOString();

  const summary = { readiness, checkedAt, counts, lines, items };
  writeFileSync(paths.readinessPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeSignalAllocation(raw, paths);

  if (derived) {
    writeFileSync(paths.notesPath, emitDiagnosticsNotes(raw, derived, summary), 'utf8');
  }

  console.log(`Market scaffold check: ${raw.label} (${cityId})`);
  console.log(`Folder: ${paths.outDir}`);
  console.log('');
  for (const line of lines) console.log(line);
  console.log('');
  console.log(`Summary: PASS=${counts.PASS} WARN=${counts.WARN} FAIL=${counts.FAIL}`);
  console.log('');
  console.log(`Readiness: ${readiness}`);
  console.log(`(written ${paths.readinessPath})`);

  process.exit(readiness === 'MERGE_READY' ? 0 : readiness === 'DRAFT' ? 2 : 1);
}

function runDerive(cityId, outDirOpt) {
  const paths = scaffoldPaths(cityId, outDirOpt);
  mkdirSync(paths.outDir, { recursive: true });
  const raw = loadRawJson(paths.rawPath);
  const derived = deriveEcologySeries(raw);
  let checkSummary = null;
  if (existsSync(paths.readinessPath)) {
    try {
      checkSummary = JSON.parse(readFileSync(paths.readinessPath, 'utf8'));
    } catch {
      checkSummary = null;
    }
  }
  writeDerivedOutputs(raw, derived, paths, checkSummary, { writeRaw: false });
  console.log(`Derived outputs refreshed: ${paths.outDir}/`);
  console.log('  derived_ecology.json');
  console.log('  suggested_MARKETS_row.js');
  console.log('  diagnostics_notes.md');
  console.log('  signal_allocation.json');
  console.log('  (raw_market_data.json preserved)');
}

function runCreate(cityId, templateKey, outDirOpt, templates) {
  const label = titleCase(cityId);
  const paths = scaffoldPaths(cityId, outDirOpt);
  mkdirSync(paths.outDir, { recursive: true });

  const raw = buildRawMarketData(cityId, label, templateKey, templates);
  const derived = deriveEcologySeries(raw);
  writeDerivedOutputs(raw, derived, paths, null);

  console.log(`Scaffold written: ${paths.outDir}/`);
  console.log('  raw_market_data.json');
  console.log('  derived_ecology.json');
  console.log('  suggested_MARKETS_row.js');
  console.log('  diagnostics_notes.md');
  console.log('  signal_allocation.json');
  console.log('');
  console.log(`Market: ${label} (${cityId}) | template: ${templateKey}`);
  const e = derived.latest;
  console.log(
    `2026 traits: chrResistance=${e.chrResistance?.toFixed(2)} fragmentation=${e.marketFragmentation?.toFixed(2)} country=${e.countryStrength?.toFixed(2)} public=${e.publicRadioStrength?.toFixed(2)}`,
  );
  console.log('');
  console.log(`Next: edit raw_market_data.json, then npm run scaffold:market -- --city=${cityId} --derive`);
  console.log(`      npm run scaffold:market -- --city=${cityId} --check`);
}

function printUsage() {
  console.log(`Usage:
  npm run scaffold:market -- --city=<slug> [--template=<name>] [--out=<dir>]
  npm run scaffold:market -- --city=<slug> --derive
  npm run scaffold:market -- --city=<slug> --check

Templates: ${TEMPLATE_KEYS.join(', ')}

Readiness: ${READINESS_LEVELS.join(' → ')}

Examples:
  npm run scaffold:market -- --city=phoenix --template=sunbelt
  npm run scaffold:market -- --city=phoenix --derive
  npm run scaffold:market -- --city=phoenix --check
`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    process.exit(0);
  }
  if (!opts.city) {
    printUsage();
    process.exit(1);
  }

  const cityId = slugifyCity(opts.city);
  if (!cityId) {
    console.error('Invalid --city');
    process.exit(1);
  }

  const templates = buildTemplates();

  if (opts.check) {
    runCheck(cityId, opts.outDir, templates);
    return;
  }

  if (opts.derive) {
    runDerive(cityId, opts.outDir);
    return;
  }

  const templateKey = opts.template;
  if (!templates[templateKey]) {
    console.error(`Unknown template "${templateKey}". Choose: ${TEMPLATE_KEYS.join(', ')}`);
    process.exit(1);
  }

  runCreate(cityId, templateKey, opts.outDir, templates);
}

main();
