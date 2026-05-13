/**
 * Station logo — centralized config (format → family, palettes, font pairs, era modifiers).
 * Template variants: see docs/station-logo-templates.md (format + AM/FM + era drive layout pick).
 * Loaded before stationLogoSvg.js. Safe to edit for tuning without touching render logic.
 */
(function (global) {
  'use strict';

  /** Curated Google Fonts (loaded via index.html <link>). CSS font-family names must match. */
  var GOOGLE_FONT_IDS = [
    'Anton',
    'Oswald',
    'Archivo Narrow',
    'Merriweather',
    'Libre Baskerville',
    'Roboto Slab',
    'Playfair Display',
    'Lora',
    'Pacifico',
    'Abril Fatface',
    'Inter',
  ];

  /**
   * Game format key → internal template family key.
   * Families: hit (CHR), rhythmic, news, country, gospel, rock, ac, oldies, urban, sports.
   */
  var FORMAT_TO_FAMILY = {
    TOP40: 'hit',
    CHR: 'hit',
    RHYTHMIC: 'rhythmic',
    COUNTRY: 'country',
    GOSPEL: 'gospel',
    NEWS_TALK: 'news',
    PODCAST_TALK: 'news',
    ALL_NEWS: 'news',
    PUBLIC_NEWS: 'news',
    PUBLIC_ECLECTIC: 'rock',
    SPORTS_TALK: 'sports',
    ALBUM_ROCK: 'rock',
    /** Classic-rock / classic-hits station marks — badge, sunburst, heritage lockups (not album-rock aggression). */
    CLASSIC_ROCK: 'oldies',
    ALT_ROCK: 'rock',
    ADULT_CONTEMP: 'ac',
    HOT_AC: 'ac',
    BEAUTIFUL_MUSIC: 'ac',
    MOR: 'ac',
    ADULT_STANDARDS: 'ac',
    PUBLIC_CLASSICAL: 'ac',
    OLDIES: 'oldies',
    CLASSIC_HITS: 'oldies',
    SOUL_RNB: 'urban',
    URBAN_CONTEMP: 'urban',
    SPANISH: 'urban',
  };

  /** Human labels for the ~6 primary “feel” groups (sports/urban are extra variants). */
  var FAMILY_LABELS = {
    hit: 'Contemporary / CHR',
    rhythmic: 'Rhythmic CHR',
    news: 'News / Talk',
    country: 'Country',
    gospel: 'Gospel',
    rock: 'Rock',
    ac: 'AC / Soft / MOR',
    oldies: 'Oldies / Classic Hits',
    sports: 'Sports talk',
    urban: 'Urban / Spanish',
  };

  /**
   * Per-family palettes (bg, fg, ac, ac2). Picked deterministically from seed.
   */
  var PALETTES = {
    hit: [
      { bg: '#1a0a2e', fg: '#fff7f0', ac: '#ff2d6b', ac2: '#ffd93d' },
      { bg: '#0d1b2a', fg: '#e0f7ff', ac: '#00d4ff', ac2: '#ff6b9d' },
      { bg: '#2b0a18', fg: '#ffffff', ac: '#ff3366', ac2: '#ffe566' },
      { bg: '#051923', fg: '#fdfffc', ac: '#ffc857', ac2: '#c86bfa' },
    ],
    country: [
      { bg: '#3d2914', fg: '#fdf6e3', ac: '#d4a574', ac2: '#8b4513' },
      { bg: '#2a1f12', fg: '#fff8e7', ac: '#c9a227', ac2: '#6b4423' },
      { bg: '#1e2a1a', fg: '#f0ead6', ac: '#a3c86c', ac2: '#5c4033' },
      { bg: '#3e2723', fg: '#ffecb3', ac: '#ff8f00', ac2: '#5d4037' },
    ],
    news: [
      { bg: '#0d1117', fg: '#f0f6fc', ac: '#58a6ff', ac2: '#8b949e' },
      { bg: '#121212', fg: '#ffffff', ac: '#e53935', ac2: '#bdbdbd' },
      { bg: '#1a237e', fg: '#e8eaf6', ac: '#ffab40', ac2: '#90caf9' },
      { bg: '#263238', fg: '#eceff1', ac: '#26c6da', ac2: '#78909c' },
    ],
    sports: [
      { bg: '#0a1628', fg: '#ffffff', ac: '#ffb300', ac2: '#1565c0' },
      { bg: '#1b1b1b', fg: '#fafafa', ac: '#43a047', ac2: '#fdd835' },
      { bg: '#1a237e', fg: '#ffffff', ac: '#ff5722', ac2: '#ffc107' },
      { bg: '#004d40', fg: '#e0f2f1', ac: '#ffab00', ac2: '#80cbc4' },
    ],
    rock: [
      { bg: '#0a0a0a', fg: '#ececec', ac: '#c62828', ac2: '#424242' },
      { bg: '#1a0505', fg: '#ffebee', ac: '#b71c1c', ac2: '#757575' },
      { bg: '#121212', fg: '#cfd8dc', ac: '#ff6f00', ac2: '#37474f' },
      { bg: '#1b1b1f', fg: '#e1e1e6', ac: '#7c4dff', ac2: '#536dfe' },
    ],
    ac: [
      { bg: '#263238', fg: '#eceff1', ac: '#80cbc4', ac2: '#b0bec5' },
      { bg: '#37474f', fg: '#ffffff', ac: '#aed581', ac2: '#90a4ae' },
      { bg: '#1e3a4f', fg: '#f5f5f5', ac: '#81d4fa', ac2: '#b3e5fc' },
      { bg: '#2e2a28', fg: '#fff5f5', ac: '#f8bbd9', ac2: '#ce93d8' },
    ],
    oldies: [
      { bg: '#3d2314', fg: '#fff3e0', ac: '#ff9100', ac2: '#5d4037' },
      { bg: '#4a2c1a', fg: '#ffecb3', ac: '#ffb300', ac2: '#6d4c41' },
      { bg: '#1c1410', fg: '#ffe0b2', ac: '#ff6f00', ac2: '#4e342e' },
      { bg: '#5d4037', fg: '#fff8e1', ac: '#f57c00', ac2: '#3e2723' },
    ],
    urban: [
      { bg: '#0d0221', fg: '#f3e5f5', ac: '#e040fb', ac2: '#00e5ff' },
      { bg: '#120a0f', fg: '#ffffff', ac: '#ff4081', ac2: '#7c4dff' },
      { bg: '#1a1a2e', fg: '#eaeaea', ac: '#00ffc6', ac2: '#ff0055' },
      { bg: '#000000', fg: '#f5f5f5', ac: '#ffeb3b', ac2: '#9c27b0' },
    ],
    /** Sleek pop — distinct from hit (cooler, more strip/club). */
    rhythmic: [
      { bg: '#061018', fg: '#e8f4fc', ac: '#00b8d4', ac2: '#ec407a' },
      { bg: '#0d1b2a', fg: '#f1f8ff', ac: '#26c6da', ac2: '#f48fb1' },
      { bg: '#1a1a2e', fg: '#ffffff', ac: '#00e5ff', ac2: '#ab47bc' },
      { bg: '#12091a', fg: '#fafafa', ac: '#7c4dff', ac2: '#69f0ae' },
    ],
    /** Inspirational — not country; deep jewel + gold. */
    gospel: [
      { bg: '#1a0d28', fg: '#fffef5', ac: '#ffd54f', ac2: '#7e57c2' },
      { bg: '#0d1f1a', fg: '#f1f8e9', ac: '#aed581', ac2: '#5e35b1' },
      { bg: '#1e1a14', fg: '#fff8e1', ac: '#ffb300', ac2: '#3949ab' },
      { bg: '#1a237e', fg: '#e8eaf6', ac: '#ffab40', ac2: '#9575cd' },
    ],
  };

  /**
   * Max two faces per logo: primary (headlines / calls) + secondary (freq, tags).
   * Weights are CSS font-weight numbers where applicable.
   */
  var FONT_PAIRS = {
    hit: [
      { primary: 'Anton', secondary: 'Oswald', wp: 400, ws: 600 },
      { primary: 'Oswald', secondary: 'Archivo Narrow', wp: 700, ws: 700 },
    ],
    news: [
      { primary: 'Roboto Slab', secondary: 'Archivo Narrow', wp: 700, ws: 600 },
      { primary: 'Merriweather', secondary: 'Inter', wp: 700, ws: 600 },
    ],
    sports: [
      { primary: 'Oswald', secondary: 'Roboto Slab', wp: 700, ws: 700 },
      { primary: 'Anton', secondary: 'Inter', wp: 400, ws: 700 },
    ],
    country: [
      { primary: 'Merriweather', secondary: 'Oswald', wp: 700, ws: 600 },
      { primary: 'Lora', secondary: 'Archivo Narrow', wp: 700, ws: 600 },
    ],
    rock: [
      { primary: 'Oswald', secondary: 'Anton', wp: 700, ws: 400 },
      { primary: 'Anton', secondary: 'Archivo Narrow', wp: 400, ws: 700 },
    ],
    ac: [
      { primary: 'Lora', secondary: 'Playfair Display', wp: 600, ws: 400 },
      { primary: 'Merriweather', secondary: 'Inter', wp: 700, ws: 500 },
    ],
    oldies: [
      { primary: 'Libre Baskerville', secondary: 'Abril Fatface', wp: 700, ws: 400 },
      { primary: 'Playfair Display', secondary: 'Lora', wp: 700, ws: 600 },
    ],
    urban: [
      { primary: 'Oswald', secondary: 'Inter', wp: 700, ws: 600 },
      { primary: 'Anton', secondary: 'Inter', wp: 400, ws: 500 },
    ],
    rhythmic: [
      { primary: 'Oswald', secondary: 'Archivo Narrow', wp: 700, ws: 600 },
      { primary: 'Anton', secondary: 'Inter', wp: 400, ws: 600 },
    ],
    gospel: [
      { primary: 'Merriweather', secondary: 'Lora', wp: 700, ws: 600 },
      { primary: 'Playfair Display', secondary: 'Oswald', wp: 700, ws: 600 },
    ],
  };

  /**
   * Deterministic layout archetypes per family (index chosen from seed + era offset).
   * Names are semantic for renderers — not all imply different geometry in every mode.
   */
  /**
   * Full palette for player layout overrides & tooling. Runtime template pick uses
   * LOGO_TEMPLATE_VARIANTS_BY_BAND (2–3 variants per band).
   */
  var LAYOUT_ARCHETYPES_BY_FAMILY = {
    hit: ['freqHero', 'brandHero', 'diagonalBlock', 'textBar', 'textOnlyStrike', 'freqTitan', 'broadcastSans'],
    rhythmic: ['sleekStrip', 'freqHero', 'brandHero', 'diagonalBlock', 'textOnlyStrike', 'freqTitan', 'broadcastSans'],
    news: ['broadcastBox', 'masthead', 'freqMinimal', 'plainMast', 'numericLed', 'broadcastSans'],
    country: ['badgeSeal', 'horizontalWord', 'ringMedallion', 'openWordmark', 'stackHeritage'],
    gospel: ['crossInspire', 'horizontalWord', 'softCard', 'softHeritage'],
    rock: ['diagonalAggro', 'stackedSlab', 'minimalDark', 'slabMinimal', 'freqWall'],
    ac: ['framedCard', 'softWordmark', 'serifLockup', 'calmMinimal', 'freqWhisper'],
    oldies: ['retroBadge', 'classicWordmark', 'nostalgicFrame', 'plainStack', 'freqNostalgia'],
    urban: ['blockContrast', 'sleekStrip', 'diagonalUrban'],
    sports: ['shieldBadge', 'bannerStack', 'angularLockup', 'broadcastSans'],
  };

  /**
   * Deterministic template pool: format family × AM/FM → at most three layout archetypes.
   * Indices rotate with era offset + seed (see resolveLayoutArchetype in stationLogoSvg.js).
   */
  var LOGO_TEMPLATE_VARIANTS_BY_BAND = {
    news: {
      AM: ['numericLed', 'freqMinimal', 'masthead'],
      FM: ['masthead', 'broadcastSans', 'freqMinimal'],
    },
    hit: {
      AM: ['textBar', 'freqHero', 'brandHero'],
      FM: ['freqTitan', 'diagonalBlock', 'textOnlyStrike'],
    },
    rhythmic: {
      AM: ['textBar', 'sleekStrip', 'brandHero'],
      FM: ['freqTitan', 'sleekStrip', 'textOnlyStrike'],
    },
    ac: {
      AM: ['serifLockup', 'softWordmark', 'freqWhisper'],
      FM: ['calmMinimal', 'softWordmark', 'framedCard'],
    },
    rock: {
      AM: ['stackedSlab', 'minimalDark', 'diagonalAggro'],
      FM: ['freqWall', 'slabMinimal', 'diagonalAggro'],
    },
    oldies: {
      AM: ['freqNostalgia', 'classicWordmark', 'plainStack'],
      FM: ['retroBadge', 'classicWordmark', 'nostalgicFrame'],
    },
    country: {
      AM: ['badgeSeal', 'horizontalWord', 'stackHeritage'],
      FM: ['openWordmark', 'horizontalWord', 'badgeSeal'],
    },
    sports: {
      AM: ['shieldBadge', 'bannerStack', 'angularLockup'],
      FM: ['angularLockup', 'shieldBadge', 'broadcastSans'],
    },
    gospel: {
      AM: ['softHeritage', 'horizontalWord', 'softCard'],
      FM: ['crossInspire', 'horizontalWord', 'softCard'],
    },
    urban: {
      AM: ['blockContrast', 'diagonalUrban', 'sleekStrip'],
      FM: ['diagonalUrban', 'sleekStrip', 'blockContrast'],
    },
  };

  /**
   * Era drives structural feel: framing density, asymmetry tendency, hierarchy emphasis.
   * Merged into spec.layoutStructure; augments typography hierarchy gap.
   */
  var ERA_LAYOUT_STRUCTURE = {
    '1970s': {
      frameLayers: 0,
      asymmetry: 0.1,
      hierarchyGapLayoutMult: 0.9,
      archetypeEraOffset: 0,
      shapeAccent: 'minimal',
    },
    '1980s': {
      frameLayers: 2,
      asymmetry: 0.22,
      hierarchyGapLayoutMult: 1.14,
      archetypeEraOffset: 1,
      shapeAccent: 'bold',
    },
    '1990s': {
      frameLayers: 1,
      asymmetry: 0.38,
      hierarchyGapLayoutMult: 1.1,
      archetypeEraOffset: 2,
      shapeAccent: 'sharp',
    },
    '2000s': {
      frameLayers: 3,
      asymmetry: 0.28,
      hierarchyGapLayoutMult: 1.06,
      archetypeEraOffset: 3,
      shapeAccent: 'layered',
    },
    '2010s+': {
      frameLayers: 0,
      asymmetry: 0.32,
      hierarchyGapLayoutMult: 0.96,
      archetypeEraOffset: 4,
      shapeAccent: 'flat',
    },
  };

  /**
   * Era bucket key → layout/typography modifiers (merged into render; not historical simulation).
   */
  /**
   * Typography rules per template family (tracking in em, weights added to pair weights).
   * hierarchyBias: which stacked line feels dominant — freq | brand | calls
   * heroAlign: default; heroAlignRotate adds an alternate alignment rotated by layout variant.
   */
  var TYPOGRAPHY_BY_FAMILY = {
    hit: {
      trackingPrimaryEm: -0.056,
      trackingSecondaryEm: -0.042,
      weightPrimaryDelta: 120,
      weightSecondaryDelta: 80,
      italicPrimaryMax: 34,
      italicSecondaryMax: 0,
      hierarchyBias: 'freq',
      primaryLineScale: 1.3,
      secondaryLineScale: 0.68,
      singleScale: 1.12,
      hierarchyGap: 1.34,
      heroAlign: 'center',
      heroAlignRotate: 'asym',
      casing: 'upper',
      thumbBrandScale: 1.14,
      thumbCallScale: 0.86,
      thumbFreqScale: 1.06,
    },
    news: {
      trackingPrimaryEm: -0.022,
      trackingSecondaryEm: -0.015,
      weightPrimaryDelta: 40,
      weightSecondaryDelta: 20,
      italicPrimaryMax: 0,
      italicSecondaryMax: 0,
      hierarchyBias: 'brand',
      primaryLineScale: 1.02,
      secondaryLineScale: 0.88,
      singleScale: 1.12,
      hierarchyGap: 1.22,
      heroAlign: 'left',
      casing: 'title',
      thumbBrandScale: 1.06,
      thumbCallScale: 0.94,
      thumbFreqScale: 0.98,
    },
    sports: {
      trackingPrimaryEm: -0.046,
      trackingSecondaryEm: -0.036,
      weightPrimaryDelta: 100,
      weightSecondaryDelta: 60,
      italicPrimaryMax: 24,
      italicSecondaryMax: 0,
      hierarchyBias: 'brand',
      primaryLineScale: 1.22,
      secondaryLineScale: 0.76,
      singleScale: 1.1,
      hierarchyGap: 1.3,
      heroAlign: 'center',
      heroAlignRotate: 'left',
      casing: 'upper',
      thumbBrandScale: 1.1,
      thumbCallScale: 0.9,
      thumbFreqScale: 1.02,
    },
    country: {
      trackingPrimaryEm: 0.014,
      trackingSecondaryEm: 0.008,
      weightPrimaryDelta: 20,
      weightSecondaryDelta: 40,
      italicPrimaryMax: 0,
      italicSecondaryMax: 0,
      hierarchyBias: 'brand',
      primaryLineScale: 1.2,
      secondaryLineScale: 0.84,
      singleScale: 1.24,
      hierarchyGap: 1.14,
      heroAlign: 'center',
      casing: 'title',
      thumbBrandScale: 1.2,
      thumbCallScale: 0.84,
      thumbFreqScale: 0.95,
    },
    rock: {
      trackingPrimaryEm: -0.045,
      trackingSecondaryEm: -0.036,
      weightPrimaryDelta: 100,
      weightSecondaryDelta: 100,
      italicPrimaryMax: 30,
      italicSecondaryMax: 10,
      hierarchyBias: 'freq',
      primaryLineScale: 1.26,
      secondaryLineScale: 0.7,
      singleScale: 1.08,
      hierarchyGap: 1.36,
      heroAlign: 'asym',
      casing: 'upper',
      thumbBrandScale: 1.1,
      thumbCallScale: 0.85,
      thumbFreqScale: 1.05,
    },
    ac: {
      trackingPrimaryEm: 0.02,
      trackingSecondaryEm: 0.014,
      weightPrimaryDelta: -20,
      weightSecondaryDelta: -10,
      italicPrimaryMax: 0,
      italicSecondaryMax: 0,
      hierarchyBias: 'brand',
      primaryLineScale: 1.14,
      secondaryLineScale: 0.9,
      singleScale: 1.22,
      hierarchyGap: 1.05,
      heroAlign: 'center',
      casing: 'title',
      thumbBrandScale: 1.15,
      thumbCallScale: 0.92,
      thumbFreqScale: 0.93,
    },
    oldies: {
      trackingPrimaryEm: 0.038,
      trackingSecondaryEm: 0.024,
      weightPrimaryDelta: 52,
      weightSecondaryDelta: 0,
      italicPrimaryMax: 26,
      italicSecondaryMax: 0,
      hierarchyBias: 'calls',
      primaryLineScale: 1.12,
      secondaryLineScale: 1.1,
      singleScale: 1.16,
      hierarchyGap: 1.16,
      heroAlign: 'center',
      heroAlignRotate: 'left',
      casing: 'upper',
      thumbBrandScale: 1.12,
      thumbCallScale: 0.98,
      thumbFreqScale: 1.07,
    },
    urban: {
      trackingPrimaryEm: -0.036,
      trackingSecondaryEm: -0.028,
      weightPrimaryDelta: 80,
      weightSecondaryDelta: 40,
      italicPrimaryMax: 22,
      italicSecondaryMax: 0,
      hierarchyBias: 'freq',
      primaryLineScale: 1.24,
      secondaryLineScale: 0.74,
      singleScale: 1.1,
      hierarchyGap: 1.32,
      heroAlign: 'asym',
      casing: 'mixed',
      thumbBrandScale: 1.08,
      thumbCallScale: 0.89,
      thumbFreqScale: 1.07,
    },
    /** Sleeker than CHR — attitude without full urban contrast. */
    rhythmic: {
      trackingPrimaryEm: -0.048,
      trackingSecondaryEm: -0.038,
      weightPrimaryDelta: 100,
      weightSecondaryDelta: 70,
      italicPrimaryMax: 28,
      italicSecondaryMax: 0,
      hierarchyBias: 'brand',
      primaryLineScale: 1.22,
      secondaryLineScale: 0.72,
      singleScale: 1.1,
      hierarchyGap: 1.28,
      heroAlign: 'center',
      heroAlignRotate: 'asym',
      casing: 'upper',
      thumbBrandScale: 1.12,
      thumbCallScale: 0.84,
      thumbFreqScale: 1.04,
    },
    gospel: {
      trackingPrimaryEm: 0.01,
      trackingSecondaryEm: 0.006,
      weightPrimaryDelta: 30,
      weightSecondaryDelta: 30,
      italicPrimaryMax: 0,
      italicSecondaryMax: 0,
      hierarchyBias: 'brand',
      primaryLineScale: 1.18,
      secondaryLineScale: 0.88,
      singleScale: 1.2,
      hierarchyGap: 1.1,
      heroAlign: 'center',
      casing: 'title',
      thumbBrandScale: 1.14,
      thumbCallScale: 0.9,
      thumbFreqScale: 0.94,
    },
  };

  /** Era overlays for typography (merged with family + font pair). */
  var TYPOGRAPHY_BY_ERA = {
    '1970s': {
      trackingEm: 0.03,
      weightPrimaryDelta: -75,
      weightSecondaryDelta: -35,
      hierarchyGapMult: 0.85,
      primaryScaleMult: 1.06,
      secondaryScaleMult: 1.05,
      singleScaleMult: 1.05,
      italicInfluence: 0.32,
      letterMultBoost: 0.045,
    },
    '1980s': {
      trackingEm: -0.018,
      weightPrimaryDelta: 120,
      weightSecondaryDelta: 45,
      hierarchyGapMult: 1.22,
      primaryScaleMult: 1.1,
      secondaryScaleMult: 0.92,
      singleScaleMult: 1.08,
      italicInfluence: 0.95,
      letterMultBoost: 0.025,
    },
    '1990s': {
      trackingEm: -0.025,
      weightPrimaryDelta: 65,
      weightSecondaryDelta: 25,
      hierarchyGapMult: 1.15,
      primaryScaleMult: 1.05,
      secondaryScaleMult: 0.95,
      singleScaleMult: 1.04,
      italicInfluence: 0.78,
      letterMultBoost: 0,
    },
    '2000s': {
      trackingEm: -0.012,
      weightPrimaryDelta: 45,
      weightSecondaryDelta: 12,
      hierarchyGapMult: 1.08,
      primaryScaleMult: 1.04,
      secondaryScaleMult: 0.98,
      singleScaleMult: 1.03,
      italicInfluence: 0.58,
      letterMultBoost: -0.02,
    },
    '2010s+': {
      trackingEm: 0.01,
      weightPrimaryDelta: 0,
      weightSecondaryDelta: 0,
      hierarchyGapMult: 0.93,
      primaryScaleMult: 0.97,
      secondaryScaleMult: 1.03,
      singleScaleMult: 1.0,
      italicInfluence: 0.38,
      letterMultBoost: -0.045,
    },
  };

  var ERA_MODIFIERS = {
    '1970s': {
      r: 14,
      rule: 5,
      glow: 0,
      tag: 'STEREO',
      letterMult: 1.08,
      freqScale: 0.96,
      decoration: 'warm',
    },
    '1980s': {
      r: 6,
      rule: 6,
      glow: 0.15,
      tag: 'STEREO',
      letterMult: 1.05,
      freqScale: 1.0,
      decoration: 'neon',
    },
    '1990s': {
      r: 4,
      rule: 5,
      glow: 0,
      tag: 'LIVE',
      letterMult: 1.0,
      freqScale: 1.02,
      decoration: 'minimal',
    },
    '2000s': {
      r: 10,
      rule: 4,
      glow: 0.22,
      tag: 'HD RADIO',
      letterMult: 0.98,
      freqScale: 1.04,
      decoration: 'gloss',
    },
    '2010s+': {
      r: 8,
      rule: 3,
      glow: 0.08,
      tag: 'LIVE',
      letterMult: 0.94,
      freqScale: 1.06,
      decoration: 'flat',
    },
  };

  global.STATION_LOGO_CONFIG = {
    googleFontIds: GOOGLE_FONT_IDS,
    formatToFamily: FORMAT_TO_FAMILY,
    familyLabels: FAMILY_LABELS,
    palettes: PALETTES,
    fontPairs: FONT_PAIRS,
    eraModifiers: ERA_MODIFIERS,
    typographyByFamily: TYPOGRAPHY_BY_FAMILY,
    typographyByEra: TYPOGRAPHY_BY_ERA,
    layoutArchetypesByFamily: LAYOUT_ARCHETYPES_BY_FAMILY,
    logoTemplateVariantsByFamilyBand: LOGO_TEMPLATE_VARIANTS_BY_BAND,
    eraLayoutStructure: ERA_LAYOUT_STRUCTURE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
