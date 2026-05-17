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
  raw._scaffold = {
    version: 2,
    template: templateKey,
    status: 'draft',
    generatedAt: new Date().toISOString(),
    dialReviewed: false,
    dataReviewed: false,
    ecologyRegressionRecorded: false,
    warnings: [
      'PLACEHOLDER — template copy; not sourced from Census/Nielsen/FCC.',
      'Dial lists (amFreqs/fmFreqs/fmFacilityByFreq) require human review before merge.',
      'Set _scaffold.dialReviewed=true after FCC-sourced dial is verified.',
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

## Revenue assumptions (draft)

| Field | Value | Note |
|-------|-------|------|
| rankTier | ${raw.rankTier} | Drives dial depth targets |
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
  };
}

function writeDerivedOutputs(raw, derived, paths, checkSummary = null, { writeRaw = true } = {}) {
  if (writeRaw) writeFileSync(paths.rawPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  writeFileSync(paths.derivedPath, `${JSON.stringify(derived, null, 2)}\n`, 'utf8');
  writeFileSync(paths.rowPath, `${emitSuggestedMarketsRow(raw)}\n`, 'utf8');
  writeFileSync(paths.notesPath, emitDiagnosticsNotes(raw, derived, checkSummary), 'utf8');
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

  if (codes.has('dial_unreviewed') || codes.has('select_blurb_todo') || codes.has('teams_todo') || codes.has('data_unreviewed')) {
    return 'PLAYTEST_READY';
  }

  const mergeBlockers = [
    'dial_placeholder',
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
