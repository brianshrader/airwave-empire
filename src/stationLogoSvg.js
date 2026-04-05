/**
 * Deterministic template-based station logos (SVG). Google Fonts + simple geometry.
 * Exposes window.wlStationLogoSvg for legacy.js — build() wraps spec + render.
 * Depends on stationLogoConfig.js (STATION_LOGO_CONFIG); falls back if missing.
 */
(function (global) {
  'use strict';

  function getConfig() {
    var c = global.STATION_LOGO_CONFIG;
    if (c && c.palettes && c.fontPairs && c.formatToFamily) return c;
    return FALLBACK_CONFIG;
  }

  /** Minimal inline fallback if stationLogoConfig.js fails to load. */
  var FALLBACK_CONFIG = {
    formatToFamily: {
      TOP40: 'hit',
      CHR: 'hit',
      RHYTHMIC: 'rhythmic',
      GOSPEL: 'gospel',
      COUNTRY: 'country',
      NEWS_TALK: 'news',
      ADULT_CONTEMP: 'ac',
    },
    familyLabels: {
      hit: 'CHR',
      rhythmic: 'Rhythmic',
      gospel: 'Gospel',
      news: 'News',
      country: 'Country',
      ac: 'AC',
      rock: 'Rock',
      oldies: 'Oldies',
      urban: 'Urban',
      sports: 'Sports',
    },
    palettes: {
      ac: [{ bg: '#263238', fg: '#eceff1', ac: '#80cbc4', ac2: '#b0bec5' }],
      hit: [{ bg: '#1a0a2e', fg: '#fff7f0', ac: '#ff2d6b', ac2: '#ffd93d' }],
      news: [{ bg: '#0d1117', fg: '#f0f6fc', ac: '#58a6ff', ac2: '#8b949e' }],
      country: [{ bg: '#3d2914', fg: '#fdf6e3', ac: '#d4a574', ac2: '#8b4513' }],
      rock: [{ bg: '#0a0a0a', fg: '#ececec', ac: '#c62828', ac2: '#424242' }],
      oldies: [{ bg: '#3d2314', fg: '#fff3e0', ac: '#ff9100', ac2: '#5d4037' }],
      urban: [{ bg: '#0d0221', fg: '#f3e5f5', ac: '#e040fb', ac2: '#00e5ff' }],
      sports: [{ bg: '#0a1628', fg: '#ffffff', ac: '#ffb300', ac2: '#1565c0' }],
      rhythmic: [{ bg: '#061018', fg: '#e8f4fc', ac: '#00b8d4', ac2: '#ec407a' }],
      gospel: [{ bg: '#1a0d28', fg: '#fffef5', ac: '#ffd54f', ac2: '#7e57c2' }],
    },
    fontPairs: {
      ac: [{ primary: 'Lora', secondary: 'Inter', wp: 600, ws: 500 }],
      hit: [{ primary: 'Anton', secondary: 'Oswald', wp: 400, ws: 600 }],
      news: [{ primary: 'Roboto Slab', secondary: 'Inter', wp: 700, ws: 600 }],
      country: [{ primary: 'Merriweather', secondary: 'Oswald', wp: 700, ws: 600 }],
      rock: [{ primary: 'Oswald', secondary: 'Anton', wp: 700, ws: 400 }],
      oldies: [{ primary: 'Libre Baskerville', secondary: 'Lora', wp: 700, ws: 600 }],
      urban: [{ primary: 'Oswald', secondary: 'Inter', wp: 700, ws: 600 }],
      sports: [{ primary: 'Oswald', secondary: 'Roboto Slab', wp: 700, ws: 700 }],
      rhythmic: [{ primary: 'Oswald', secondary: 'Archivo Narrow', wp: 700, ws: 600 }],
      gospel: [{ primary: 'Merriweather', secondary: 'Lora', wp: 700, ws: 600 }],
    },
    layoutArchetypesByFamily: {
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
    },
    eraLayoutStructure: {
      '1970s': { frameLayers: 0, asymmetry: 0.1, hierarchyGapLayoutMult: 0.9, archetypeEraOffset: 0, shapeAccent: 'minimal' },
      '1980s': { frameLayers: 2, asymmetry: 0.22, hierarchyGapLayoutMult: 1.14, archetypeEraOffset: 1, shapeAccent: 'bold' },
      '1990s': { frameLayers: 1, asymmetry: 0.38, hierarchyGapLayoutMult: 1.1, archetypeEraOffset: 2, shapeAccent: 'sharp' },
      '2000s': { frameLayers: 3, asymmetry: 0.28, hierarchyGapLayoutMult: 1.06, archetypeEraOffset: 3, shapeAccent: 'layered' },
      '2010s+': { frameLayers: 0, asymmetry: 0.32, hierarchyGapLayoutMult: 0.96, archetypeEraOffset: 4, shapeAccent: 'flat' },
    },
    eraModifiers: {
      '1970s': { r: 14, rule: 5, glow: 0, tag: 'CLASSIC', letterMult: 1.08, freqScale: 0.96 },
      '1980s': { r: 6, rule: 6, glow: 0.15, tag: 'STEREO', letterMult: 1.05, freqScale: 1.0 },
      '1990s': { r: 4, rule: 5, glow: 0, tag: 'LIVE', letterMult: 1.0, freqScale: 1.02 },
      '2000s': { r: 10, rule: 4, glow: 0.22, tag: 'HD RADIO', letterMult: 0.98, freqScale: 1.04 },
      '2010s+': { r: 8, rule: 3, glow: 0.08, tag: 'LIVE', letterMult: 0.94, freqScale: 1.06 },
    },
    typographyByFamily: {
      hit: {
        trackingPrimaryEm: -0.05,
        trackingSecondaryEm: -0.038,
        weightPrimaryDelta: 120,
        weightSecondaryDelta: 80,
        italicPrimaryMax: 34,
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
        italicPrimaryMax: 0,
        hierarchyBias: 'brand',
        primaryLineScale: 0.9,
        secondaryLineScale: 1.16,
        singleScale: 1.2,
        hierarchyGap: 1.1,
        heroAlign: 'left',
        casing: 'title',
        thumbBrandScale: 1.06,
        thumbCallScale: 0.94,
        thumbFreqScale: 0.98,
      },
      ac: {
        trackingPrimaryEm: 0.02,
        trackingSecondaryEm: 0.014,
        italicPrimaryMax: 0,
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
      rhythmic: {
        trackingPrimaryEm: -0.042,
        trackingSecondaryEm: -0.034,
        italicPrimaryMax: 28,
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
        italicPrimaryMax: 0,
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
    },
    typographyByEra: {
      '1970s': { trackingEm: 0.03, weightPrimaryDelta: -75, italicInfluence: 0.32, letterMultBoost: 0.045, hierarchyGapMult: 0.85 },
      '1980s': { trackingEm: -0.018, weightPrimaryDelta: 120, italicInfluence: 0.95, letterMultBoost: 0.025, hierarchyGapMult: 1.22 },
      '1990s': { trackingEm: -0.025, weightPrimaryDelta: 65, italicInfluence: 0.78, hierarchyGapMult: 1.15 },
      '2000s': { trackingEm: -0.012, weightPrimaryDelta: 45, italicInfluence: 0.58, hierarchyGapMult: 1.08 },
      '2010s+': { trackingEm: 0.01, italicInfluence: 0.38, hierarchyGapMult: 0.93, letterMultBoost: -0.045 },
    },
  };

  function escXml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function fnv1a(str) {
    var h = 2166136261;
    var i;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Tiny deterministic px nudge for thumb text/shape positions (±5). */
  function thumbMicroShift(seed, slot) {
    return (fnv1a('tms|' + seed + '|' + slot) % 11) - 5;
  }

  /**
   * News/Talk: decade-specific cap on eraLayoutExtras so 70s/10s stay flat,
   * 2000s less crosshair-heavy, 80s–90s keep full layering when frameLayers allows.
   */
  function refineFlExtrasForTaste(flExtras, family, era) {
    if (family !== 'news') return flExtras;
    if (era === '1970s' || era === '2010s+') return Math.min(flExtras, 0);
    if (era === '2000s') return Math.min(flExtras, 1);
    return flExtras;
  }

  /**
   * Deterministic italic role: none | primary | secondary.
   * News stays mostly roman; sports/CHR/rock get energy; AC/gospel/country stay none.
   */
  function resolveItalicMode(family, arch, seed, variant) {
    if (family === 'ac' || family === 'gospel' || family === 'country') return 'none';
    if (arch === 'broadcastSans' && family === 'news') {
      return seed % 97 === 0 ? 'primary' : 'none';
    }
    if (family === 'news') return 'none';
    if (arch === 'broadcastSans' && family === 'sports') {
      var sp = (seed >>> 2) % 5;
      if (sp < 2) return 'secondary';
      if (sp === 2) return 'primary';
      return 'none';
    }
    if (family === 'sports') {
      var s2 = (seed >>> 3) % 5;
      if (s2 < 2) return 'primary';
      if (s2 === 2) return 'secondary';
      return 'none';
    }
    if (family === 'rock') {
      var rk = (seed >>> 5) % 5;
      if (rk < 2) return 'primary';
      if (rk === 2) return 'secondary';
      return 'none';
    }
    if (family === 'hit' || family === 'rhythmic') {
      return (seed >>> 6) % 4 < 2 ? 'primary' : 'none';
    }
    if (family === 'urban') {
      return (seed >>> 7) % 6 < 2 ? 'primary' : 'none';
    }
    return 'none';
  }

  /** Inter / Oswald / Anton / Archivo Narrow only — heavy weights for modern broadcast sans lockups. */
  function broadcastSansFontPair(family, seed) {
    if (family === 'news' || family === 'sports') {
      var tri = (seed >>> 8) % 3;
      return {
        primary: tri === 0 ? 'Anton' : tri === 1 ? 'Oswald' : 'Inter',
        secondary: 'Inter',
        wp: 800,
        ws: 700,
      };
    }
    return {
      primary: (seed >>> 8) % 2 === 0 ? 'Anton' : 'Oswald',
      secondary: (seed >>> 9) % 2 === 0 ? 'Archivo Narrow' : 'Inter',
      wp: 800,
      ws: 700,
    };
  }

  /** Archetypes that skip heavy framed “card” era extras (crosshair / double frame). */
  function isOpenLayoutArchetype(arch) {
    var a = String(arch || '');
    return (
      a === 'freqHero' ||
      a === 'textOnlyStrike' ||
      a === 'freqTitan' ||
      a === 'plainMast' ||
      a === 'numericLed' ||
      a === 'openWordmark' ||
      a === 'stackHeritage' ||
      a === 'softHeritage' ||
      a === 'slabMinimal' ||
      a === 'freqWall' ||
      a === 'calmMinimal' ||
      a === 'freqWhisper' ||
      a === 'plainStack' ||
      a === 'freqNostalgia' ||
      a === 'freqMinimal' ||
      a === 'broadcastSans'
    );
  }

  function eraBucket(year) {
    var y = Math.floor(Number(year) || 1970);
    if (y < 1980) return '1970s';
    if (y < 1990) return '1980s';
    if (y < 2000) return '1990s';
    if (y < 2010) return '2000s';
    return '2010s+';
  }

  function formatToFamily(formatKey) {
    var cfg = getConfig();
    var k = String(formatKey || '').toUpperCase();
    return cfg.formatToFamily[k] || cfg.formatToFamily[formatKey] || 'ac';
  }

  function getEraModifiers(era) {
    var cfg = getConfig();
    var em = cfg.eraModifiers && cfg.eraModifiers[era];
    if (em) return em;
    return { r: 8, rule: 4, glow: 0, tag: 'LIVE', letterMult: 1, freqScale: 1, decoration: 'flat' };
  }

  function pickPalette(family, seed) {
    var cfg = getConfig();
    var list = cfg.palettes[family] || cfg.palettes.ac;
    return list[seed % list.length];
  }

  function pickFontPair(family, seed) {
    var cfg = getConfig();
    var list = cfg.fontPairs[family] || cfg.fontPairs.ac;
    return list[seed % list.length];
  }

  /** CSS font-family stack for SVG (max 2 distinct families per logo via primary/secondary). */
  function fontStack(face) {
    var f = String(face || 'Inter');
    if (f === 'Pacifico') return "'Pacifico', cursive";
    var serifish = ['Merriweather', 'Libre Baskerville', 'Roboto Slab', 'Playfair Display', 'Lora', 'Abril Fatface'].indexOf(f) >= 0;
    return serifish ? "'" + f + "', Georgia, 'Times New Roman', serif" : "'" + f + "', 'Helvetica Neue', Helvetica, Arial, sans-serif";
  }

  function fitBrandFontSize(brand, base, min, mult) {
    mult = mult == null ? 1 : mult;
    var len = Math.max(brand.length, 4);
    return Math.max(min, Math.min(base, (280 / len) * 1.8 * mult));
  }

  function fitHeroSingle(str, base, min, mult) {
    mult = mult == null ? 1 : mult;
    var len = Math.max(String(str || '').length, 3);
    return Math.max(min, Math.min(base, (340 / len) * 2.15 * mult));
  }

  function fitHeroLine(str, base, min, mult) {
    mult = mult == null ? 1 : mult;
    var len = Math.max(String(str || '').length, 2);
    return Math.max(min, Math.min(base, (380 / len) * 2.05 * mult));
  }

  function stripCallDisplay(cd) {
    return String(cd || '')
      .replace(/-(AM|FM)$/i, '')
      .trim();
  }

  function isDialStr(t) {
    return /^\d+(\.\d+)?$/.test(String(t || '').trim());
  }

  function isCallStr(t) {
    return /^[WK][A-Z]{2,3}$/i.test(String(t || '').trim());
  }

  function normBrandKey(s) {
    return String(s ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function resolveHeroLines(brand, dial, callDisplay, defaultBrand) {
    var dMeta = String(dial || '')
      .replace(/\s*(AM|FM)\s*$/i, '')
      .trim();
    var callsMeta = stripCallDisplay(callDisplay);
    var callsUp = callsMeta ? callsMeta.toUpperCase() : '';

    var b = String(brand || '').trim();
    var tokens = b.split(/\s+/).filter(Boolean);

    var defNorm = normBrandKey(defaultBrand);
    var brandNorm = normBrandKey(b);
    var brandIsCustom = defNorm.length > 0 && brandNorm.length > 0 && brandNorm !== defNorm;

    function pair(a, b0) {
      if (isDialStr(a) && isCallStr(b0)) return { stack: true, line1: String(a).trim(), line2: String(b0).trim().toUpperCase() };
      if (isCallStr(a) && isDialStr(b0)) return { stack: true, line1: String(b0).trim(), line2: String(a).trim().toUpperCase() };
      return null;
    }

    if (tokens.length >= 3) return { stack: false, single: b };

    if (tokens.length === 2) {
      var p = pair(tokens[0], tokens[1]);
      if (p) return p;
      if (isDialStr(tokens[0]) && !isCallStr(tokens[1])) {
        return { stack: true, line1: tokens[0].trim(), line2: tokens.slice(1).join(' ') };
      }
      if (!isDialStr(tokens[0]) && !isCallStr(tokens[0]) && !isDialStr(tokens[1]) && !isCallStr(tokens[1]))
        return { stack: false, single: b };
    }

    if (tokens.length === 1) {
      var t = tokens[0];
      if (!brandIsCustom && isDialStr(t) && callsUp) return { stack: true, line1: t, line2: callsUp };
      if (!brandIsCustom && isCallStr(t) && dMeta) return { stack: true, line1: dMeta, line2: t.toUpperCase() };
    }

    if (dMeta && callsUp && !brandIsCustom) return { stack: true, line1: dMeta, line2: callsUp };

    return { stack: false, single: b || callsUp || dMeta || 'ON AIR' };
  }

  function freqLine(dial, band) {
    var d = String(dial || '').trim();
    var b = String(band || '').toUpperCase();
    if (d && b) return d + ' ' + b;
    if (d) return d;
    return b || 'ON AIR';
  }

  var TYPO_FALLBACK = {
    trackingPrimaryEm: 0,
    trackingSecondaryEm: 0,
    weightPrimaryDelta: 0,
    weightSecondaryDelta: 0,
    italicPrimaryMax: 0,
    hierarchyBias: 'brand',
    primaryLineScale: 1,
    secondaryLineScale: 0.8,
    singleScale: 1,
    hierarchyGap: 1.2,
    heroAlign: 'center',
    casing: 'mixed',
    thumbBrandScale: 1,
    thumbCallScale: 1,
    thumbFreqScale: 1,
  };

  function clampW(w) {
    return Math.max(100, Math.min(900, Math.round(w)));
  }

  function applyTextCase(str, casing) {
    if (str == null || str === '') return str;
    if (casing === 'upper') return String(str).toUpperCase();
    if (casing === 'title') {
      return String(str).replace(/\S+/g, function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      });
    }
    return String(str);
  }

  /** Title/upper without mangling call letters like WINS. */
  function applyCasingLine(line, casing) {
    var t = String(line || '').trim();
    var compact = t.replace(/\s+/g, '');
    if (/^[WK][A-Z]{2,3}$/i.test(compact)) return compact.toUpperCase();
    return applyTextCase(t, casing);
  }

  function dominantLineKey(resolved, bias) {
    if (!resolved || !resolved.stack) return 'single';
    var a = String(resolved.line1 || '').trim();
    var b = String(resolved.line2 || '').trim();
    if (bias === 'freq') {
      if (/^\d/.test(a) || a.indexOf('.') >= 0) return 'line1';
      if (/^\d/.test(b) || b.indexOf('.') >= 0) return 'line2';
      return 'line1';
    }
    if (bias === 'calls') {
      if (/^[WK][A-Z]{2,3}$/i.test(b.replace(/\s/g, ''))) return 'line2';
      if (/^[WK][A-Z]{2,3}$/i.test(a.replace(/\s/g, ''))) return 'line1';
      return 'line2';
    }
    if (bias === 'brand') {
      if (b.length > a.length + 4) return 'line2';
      return 'line1';
    }
    return 'line1';
  }

  function mergeTypographyRules(cfg, family, era, seed, variant, wp0, ws0, fp) {
    var F = (cfg.typographyByFamily && cfg.typographyByFamily[family]) || TYPO_FALLBACK;
    var E = (cfg.typographyByEra && cfg.typographyByEra[era]) || {};
    var te = E.trackingEm != null ? E.trackingEm : 0;
    var trackingPrimaryEm = (F.trackingPrimaryEm || 0) + te;
    var trackingSecondaryEm = (F.trackingSecondaryEm || 0) + te;
    var inf = E.italicInfluence != null ? E.italicInfluence : 1;
    var italicMax = Math.round((F.italicPrimaryMax != null ? F.italicPrimaryMax : 0) * inf);
    var italicPrimary = (seed >>> 9) % 100 < italicMax;
    var italicSecMax = Math.round((F.italicSecondaryMax != null ? F.italicSecondaryMax : 0) * inf);
    var italicSecondary = (seed >>> 11) % 100 < italicSecMax;
    if (F.italicPrimaryMax != null && F.italicPrimaryMax === 0) italicPrimary = false;
    if (italicMax === 0) italicPrimary = false;
    if (F.italicSecondaryMax != null && F.italicSecondaryMax === 0) italicSecondary = false;

    var weightPrimary = clampW(wp0 + (F.weightPrimaryDelta || 0) + (E.weightPrimaryDelta || 0));
    var weightSecondary = clampW(ws0 + (F.weightSecondaryDelta || 0) + (E.weightSecondaryDelta || 0));
    var hgap = (F.hierarchyGap != null ? F.hierarchyGap : 1.2) * (E.hierarchyGapMult != null ? E.hierarchyGapMult : 1);
    var EL = cfg.eraLayoutStructure && cfg.eraLayoutStructure[era];
    if (EL && EL.hierarchyGapLayoutMult != null) hgap *= EL.hierarchyGapLayoutMult;
    var primaryScale = (F.primaryLineScale != null ? F.primaryLineScale : 1) * (E.primaryScaleMult != null ? E.primaryScaleMult : 1);
    var secondaryScale = (F.secondaryLineScale != null ? F.secondaryLineScale : 0.78) * (E.secondaryScaleMult != null ? E.secondaryScaleMult : 1);
    var singleScale = (F.singleScale != null ? F.singleScale : 1) * (E.singleScaleMult != null ? E.singleScaleMult : 1);

    var modes = [F.heroAlign || 'center'];
    if (F.heroAlignRotate) modes.push(F.heroAlignRotate);
    if (modes.length === 1) modes.push('center');
    var effectiveHeroAlign = modes[variant % modes.length];

    return {
      trackingPrimaryEm: trackingPrimaryEm,
      trackingSecondaryEm: trackingSecondaryEm,
      weightPrimary: weightPrimary,
      weightSecondary: weightSecondary,
      hierarchyBias: F.hierarchyBias || 'freq',
      hierarchyGap: hgap,
      primaryLineScale: primaryScale,
      secondaryLineScale: secondaryScale,
      singleScale: singleScale,
      heroAlignEffective: effectiveHeroAlign,
      casing: F.casing || 'mixed',
      italicPrimary: italicPrimary,
      italicSecondary: italicSecondary,
      thumbBrandScale: F.thumbBrandScale != null ? F.thumbBrandScale : 1,
      thumbCallScale: F.thumbCallScale != null ? F.thumbCallScale : 1,
      thumbFreqScale: F.thumbFreqScale != null ? F.thumbFreqScale : 1,
      letterMultBoost: E.letterMultBoost != null ? E.letterMultBoost : 0,
    };
  }

  function heroAlignCoords(effectiveAlign) {
    if (effectiveAlign === 'left') {
      return { x1: 52, a1: 'start', x2: 52, a2: 'start', xs: 52, as: 'start' };
    }
    if (effectiveAlign === 'asym') {
      return { x1: 256, a1: 'middle', x2: 56, a2: 'start', xs: 256, as: 'middle' };
    }
    if (effectiveAlign === 'right') {
      return { x1: 460, a1: 'end', x2: 460, a2: 'end', xs: 460, as: 'end' };
    }
    return { x1: 256, a1: 'middle', x2: 256, a2: 'middle', xs: 256, as: 'middle' };
  }

  function resolveLayoutArchetype(cfg, family, era, seed, variant, variantBump, formatKey, band) {
    var lists = cfg.layoutArchetypesByFamily;
    var list = (lists && lists[family]) || ['default'];
    if (!list.length) list = ['default'];
    var els = (cfg.eraLayoutStructure && cfg.eraLayoutStructure[era]) || {};
    var off = els.archetypeEraOffset != null ? els.archetypeEraOffset : 0;
    var h = fnv1a('layout|' + seed + '|' + variant + '|' + variantBump + '|' + formatKey);
    var idx = (off + h + variant * 7) % list.length;
    var fk = String(formatKey || '').toUpperCase();
    var bandU = String(band).toUpperCase();
    if (family === 'news' && bandU === 'AM') {
      var fm = list.indexOf('freqMinimal');
      var nl = list.indexOf('numericLed');
      var sub = h % 7;
      if (nl >= 0 && sub < 2) idx = nl;
      else if (fm >= 0 && sub >= 2 && sub < 5) idx = fm;
    }
    if (family === 'news' && fk.indexOf('PODCAST') >= 0) {
      var mh = list.indexOf('masthead');
      if (mh >= 0 && h % 4 < 2) idx = mh;
    }
    if ((family === 'hit' || family === 'rhythmic') && bandU === 'FM') {
      var ft = list.indexOf('freqTitan');
      var ts = list.indexOf('textOnlyStrike');
      var roll = (h + variant * 11) % 9;
      if (ft >= 0 && roll < 3) idx = ft;
      else if (ts >= 0 && roll === 3) idx = ts;
    }
    if (family === 'rock' && bandU === 'FM') {
      var fw = list.indexOf('freqWall');
      if (fw >= 0 && (h >>> 4) % 6 < 2) idx = fw;
    }
    var bs = list.indexOf('broadcastSans');
    if (bs >= 0 && family === 'news' && (era === '2000s' || era === '2010s+')) {
      if ((h >>> 1) % 5 < 2) idx = bs;
    }
    if (bs >= 0 && family === 'sports' && (h >>> 2) % 5 < 2) idx = bs;
    if (bs >= 0 && (family === 'hit' || family === 'rhythmic') && bandU === 'FM' && (h + variant * 5) % 13 === 3) idx = bs;
    var arch = list[idx];
    return {
      archetype: arch,
      eraStructure: Object.assign({}, els, { archetype: arch }),
    };
  }

  function heroCoordsForArchetype(typo, arch, family) {
    var eff = typo.heroAlignEffective || 'center';
    if (family === 'news' && arch === 'masthead') return heroAlignCoords('left');
    if (family === 'news' && arch === 'freqMinimal') return heroAlignCoords('left');
    if (family === 'news' && (arch === 'plainMast' || arch === 'numericLed')) return heroAlignCoords('left');
    if ((family === 'hit' || family === 'rhythmic') && (arch === 'textOnlyStrike' || arch === 'freqTitan')) return heroAlignCoords('left');
    if ((family === 'country' || family === 'gospel') && arch === 'horizontalWord') return heroAlignCoords('left');
    if (family === 'country' && arch === 'openWordmark') return heroAlignCoords('left');
    if (family === 'country' && arch === 'stackHeritage') return heroAlignCoords('center');
    if (family === 'rock' && arch === 'freqWall') return heroAlignCoords('left');
    if (family === 'rock' && arch === 'slabMinimal') return heroAlignCoords('asym');
    if (family === 'ac' && arch === 'softWordmark') return heroAlignCoords('left');
    if (family === 'ac' && arch === 'freqWhisper') return heroAlignCoords('left');
    if (family === 'oldies' && arch === 'freqNostalgia') return heroAlignCoords('left');
    if (family === 'urban' && arch === 'blockContrast') return heroAlignCoords('asym');
    if (arch === 'broadcastSans' && (family === 'news' || family === 'sports' || family === 'hit' || family === 'rhythmic'))
      return heroAlignCoords('left');
    return heroAlignCoords(eff);
  }

  function skewHeroCoords(coords, eraStruct, seed, family) {
    var a = eraStruct && eraStruct.asymmetry != null ? eraStruct.asymmetry : 0;
    if (a < 0.22) return coords;
    var roll = ((seed >>> 6) % 100) / 100;
    if (roll > a) return coords;
    var chaotic = family === 'hit' || family === 'rhythmic' || family === 'rock' || family === 'urban' || family === 'sports';
    if (!chaotic && roll < 0.4) return coords;
    var dx = ((seed >>> 14) % 2 === 0 ? -1 : 1) * (18 + (seed % 28));
    return {
      x1: coords.x1 + dx,
      x2: coords.x2 + dx,
      xs: coords.xs + dx,
      a1: coords.a1,
      a2: coords.a2,
      as: coords.as,
    };
  }

  function eraLayoutExtras(fl, r, ac, ac2) {
    var extra = '';
    if (fl >= 2) {
      extra +=
        '<rect x="44" y="44" width="424" height="424" rx="' +
        (r + 6) +
        '" fill="none" stroke="' +
        ac2 +
        '" stroke-width="2" opacity="0.45"/>';
    }
    if (fl >= 3) {
      extra +=
        '<line x1="0" y1="256" x2="512" y2="256" stroke="' +
        ac +
        '" stroke-width="1" opacity="0.12"/>\n  <line x1="256" y1="0" x2="256" y2="512" stroke="' +
        ac2 +
        '" stroke-width="1" opacity="0.1"/>';
    }
    return extra;
  }

  function applyHeroHierarchySizes(fs1, fs2, fsSingle, resolved, typo) {
    var bias = typo.hierarchyBias || 'freq';
    var gap = typo.hierarchyGap != null ? typo.hierarchyGap : 1.25;
    var p = typo.primaryLineScale != null ? typo.primaryLineScale : 1;
    var s = typo.secondaryLineScale != null ? typo.secondaryLineScale : 0.78;
    var sg = typo.singleScale != null ? typo.singleScale : 1;
    if (!resolved.stack) {
      return { fs1: fs1, fs2: fs2, fs: fsSingle * sg };
    }
    var dom = dominantLineKey(resolved, bias);
    if (dom === 'line1') {
      return { fs1: fs1 * p * gap, fs2: fs2 * s, fs: fsSingle };
    }
    if (dom === 'line2') {
      return { fs1: fs1 * s, fs2: fs2 * p * gap, fs: fsSingle };
    }
    return { fs1: fs1 * p, fs2: fs2 * s, fs: fsSingle };
  }

  function letterSpacingAttr(em) {
    if (em == null || Math.abs(em) < 0.0001) return '';
    return ' letter-spacing="' + Number(em).toFixed(4) + 'em"';
  }

  var LOGO_VIEW = { w: 512, h: 512, pad: 36 };

  function charWidthFactorForFace(face) {
    var f = String(face || 'Inter');
    if (f === 'Anton') return 0.47;
    if (f === 'Oswald') return 0.46;
    if (f === 'Archivo Narrow') return 0.44;
    if (f === 'Pacifico') return 0.58;
    var serifish =
      ['Merriweather', 'Libre Baskerville', 'Roboto Slab', 'Playfair Display', 'Lora', 'Abril Fatface'].indexOf(f) >= 0;
    return serifish ? 0.52 : 0.54;
  }

  function italicWidthBump(itAttr) {
    return itAttr && String(itAttr).indexOf('italic') >= 0 ? 1.04 : 1;
  }

  /** Deterministic rough width of SVG <text> in px. */
  function estimateTextWidthPx(fontSize, text, trackingEm, face, itAttr) {
    var s = String(text || '');
    var n = Math.max(s.length, 1);
    var cf = charWidthFactorForFace(face);
    if (s.length > 2 && s === s.toUpperCase() && /[A-Z]/.test(s)) cf *= 1.045;
    var base = n * fontSize * cf * italicWidthBump(itAttr);
    var te = Number(trackingEm) || 0;
    var gaps = Math.max(0, n - 1);
    return base + gaps * te * fontSize;
  }

  function clampFitTrackingEm(em, arch) {
    var lo = arch === 'broadcastSans' ? -0.055 : -0.048;
    var hi = 0.115;
    return Math.max(lo, Math.min(hi, em));
  }

  function maxTextWidthForAnchor(anchor, x) {
    var vw = LOGO_VIEW.w;
    var pad = LOGO_VIEW.pad;
    if (anchor === 'start' || anchor === 'left') return Math.max(160, vw - pad - x);
    if (anchor === 'end' || anchor === 'right') return Math.max(160, x - pad);
    return Math.max(200, 2 * Math.min(x - pad, vw - pad - x));
  }

  function maxTextWidthThumb(anchor, x, arch) {
    var w = maxTextWidthForAnchor(anchor, x);
    var mul =
      arch === 'broadcastSans'
        ? 0.93
        : arch === 'freqTitan' || arch === 'textOnlyStrike'
          ? 0.9
          : arch === 'freqHero'
            ? 0.91
            : arch === 'brandHero'
              ? 0.88
              : 0.95;
    return Math.floor(w * mul);
  }

  function maxTextWidthHero(anchor, x, arch) {
    var w = maxTextWidthForAnchor(anchor, x);
    var mul =
      arch === 'broadcastSans'
        ? 0.92
        : arch === 'freqTitan' || arch === 'textOnlyStrike'
          ? 0.88
          : arch === 'brandHero'
            ? 0.9
            : 0.91;
    return Math.floor(w * mul);
  }

  /**
   * Priority: shrink font; then tighten tracking within clamp (more negative).
   * @returns {{ fontSize: number, trackingEm: number }}
   */
  function fitTextToMaxWidth(plainText, desiredFs, maxW, minFs, maxFs, trackEm, face, itAttr, arch) {
    var lo = arch === 'broadcastSans' ? -0.055 : -0.048;
    var te = clampFitTrackingEm(trackEm, arch);
    var fs = Math.min(maxFs, Math.max(minFs, desiredFs));
    var i;
    for (i = 0; i < 42; i++) {
      if (estimateTextWidthPx(fs, plainText, te, face, itAttr) <= maxW) break;
      fs = Math.max(minFs, fs - 2);
    }
    if (estimateTextWidthPx(fs, plainText, te, face, itAttr) > maxW) {
      for (i = 0; i < 16; i++) {
        te = Math.max(lo, te - 0.005);
        if (estimateTextWidthPx(fs, plainText, te, face, itAttr) <= maxW) break;
      }
    }
    if (estimateTextWidthPx(fs, plainText, te, face, itAttr) > maxW) {
      fs = Math.max(minFs, fs - 4);
      te = clampFitTrackingEm(te, arch);
    }
    return { fontSize: Math.round(fs), trackingEm: te };
  }

  /** Format / tertiary: shorten or drop (empty string) before escaping. */
  function fitTertiaryPlainText(fmtPlain, maxW, baseFs, face, trackEm, arch, itAttr) {
    var s = String(fmtPlain || '').trim();
    if (!s) return '';
    var te = clampFitTrackingEm(trackEm, arch);
    var fit = fitTextToMaxWidth(s, baseFs, maxW, 9, baseFs + 2, te, face, itAttr, arch);
    var fs = fit.fontSize;
    te = fit.trackingEm;
    if (estimateTextWidthPx(fs, s, te, face, itAttr) > maxW) {
      s = s.length > 20 ? s.slice(0, 18) + '…' : s;
      fit = fitTextToMaxWidth(s, fs, maxW, 9, fs, te, face, itAttr, arch);
      fs = fit.fontSize;
      te = fit.trackingEm;
    }
    if (estimateTextWidthPx(fs, s, te, face, itAttr) > maxW) return '';
    return s;
  }

  /**
   * If one line will not fit, split on space into two lines (same y step ~44).
   * @returns {{ lines: string[], fontSize: number, trackingEm: number }}
   */
  function splitPlainTwoLinesIfNeeded(plain, maxW, desiredFs, trackEm, face, itAttr, arch) {
    var te0 = clampFitTrackingEm(trackEm, arch);
    var one = fitTextToMaxWidth(plain, desiredFs, maxW, Math.max(14, desiredFs - 36), desiredFs + 6, te0, face, itAttr, arch);
    if (estimateTextWidthPx(one.fontSize, plain, one.trackingEm, face, itAttr) <= maxW) {
      return { lines: [plain], fontSize: one.fontSize, trackingEm: one.trackingEm };
    }
    var sp = plain.lastIndexOf(' ', Math.floor(plain.length * 0.58));
    if (sp < 2) sp = plain.indexOf(' ');
    if (sp < 2) return { lines: [plain], fontSize: one.fontSize, trackingEm: one.trackingEm };
    var a = plain.slice(0, sp).trim();
    var b = plain.slice(sp + 1).trim();
    if (!b) return { lines: [plain], fontSize: one.fontSize, trackingEm: one.trackingEm };
    var fa = fitTextToMaxWidth(a, desiredFs, maxW, Math.max(14, desiredFs - 22), desiredFs + 4, te0, face, itAttr, arch);
    var fb = fitTextToMaxWidth(b, desiredFs, maxW, Math.max(12, desiredFs - 26), desiredFs + 2, te0, face, itAttr, arch);
    var fs = Math.min(fa.fontSize, fb.fontSize);
    return { lines: [a, b], fontSize: fs, trackingEm: clampFitTrackingEm((fa.trackingEm + fb.trackingEm) / 2, arch) };
  }

  function svgTextEl(x, y, anchor, fontStackStr, fontSize, fontWeight, trackEm, itAttr, fill, opacity, contentEsc) {
    var ls = letterSpacingAttr(trackEm);
    var op = opacity != null && opacity !== 1 ? ' opacity="' + opacity + '"' : '';
    return (
      '<text x="' +
      x +
      '" y="' +
      y +
      '" text-anchor="' +
      anchor +
      '" font-family="' +
      fontStackStr +
      '" font-size="' +
      fontSize +
      '" font-weight="' +
      fontWeight +
      '"' +
      ls +
      (itAttr || '') +
      ' fill="' +
      fill +
      '"' +
      op +
      '>' +
      contentEsc +
      '</text>'
    );
  }

  function thumbTrackEm(typo, role, arch) {
    var base;
    if (role === 'brand') base = typo.trackingPrimaryEm || 0;
    else if (role === 'fmt') base = (typo.trackingSecondaryEm || 0) * 0.55 + 0.008;
    else base = typo.trackingSecondaryEm || 0;
    if (arch === 'broadcastSans') {
      base -= role === 'fmt' ? 0.014 : 0.024;
    }
    return clampFitTrackingEm(base, arch);
  }

  /**
   * Minimal shapes for broadcast sans thumb: optional hairline only.
   * @returns {{ shapes: string, textBlock: string }}
   */
  function buildBroadcastSansThumb(o) {
    var spec = o.spec;
    var seed = spec.seed;
    var pat = (seed >>> 4) % 3;
    var ms = thumbMicroShift(seed, 30);
    var ms2 = thumbMicroShift(seed, 31);
    var fg = o.fg;
    var ac = o.ac;
    var ac2 = o.ac2;
    var fsP = o.fsP;
    var fsS = o.fsS;
    var wp = o.wp;
    var ws = o.ws;
    var tbx = o.tbx;
    var tba = o.tba;
    var it1 = o.itFirst;
    var it2 = o.itSecond;
    var brandE = o.brandE;
    var freq = o.freq;
    var callE = o.callE;
    var fsBrand = o.fsBrand;
    var fsCall = o.fsCall;
    var fsSmall = o.fsSmall;
    var typoF = spec.typography || {};
    var archF = 'broadcastSans';
    var fpF = (spec.fonts && spec.fonts.primary) || 'Inter';
    var fsF = (spec.fonts && spec.fonts.secondary) || 'Inter';
    function teR(role) {
      return thumbTrackEm(typoF, role, archF);
    }
    var w800 = Math.min(900, wp + 18);
    var w700 = Math.min(900, ws + 28);
    var tx = tba === 'start' ? 48 + ms : tbx;
    var maxW = maxTextWidthThumb(tba, tx, archF);
    var shapes = (seed >>> 6) % 6 === 0 ? '<line x1="44" y1="62" x2="468" y2="62" stroke="' + ac + '" stroke-width="2" opacity="0.18"/>' : '';
    var fontAnton = fontStack('Anton');
    var fam = o.family;
    var freqPl = freqLine(spec.dial, spec.band);
    var callPl = String(spec.callDisplay || '').replace(/-/g, ' ');
    var brandPl = String(spec.brand || '');
    var fmtPl = String(spec.formatLabel || '');
    var fsAntonFreq0 = Math.min(104, Math.round(fsSmall * 3.12));
    var fsCallTiny0 = Math.max(20, Math.round(fsCall * 0.48));

    if (fam === 'news' || fam === 'sports') {
      if (pat === 0) {
        var f1n = fitTextToMaxWidth(freqPl, fsAntonFreq0, maxW, 24, 104, teR('freq'), 'Anton', it1, archF);
        var f2n = fitTextToMaxWidth(callPl, fsCallTiny0, maxW, 15, fsCallTiny0 + 10, teR('call'), fsF, it2, archF);
        var tbN0 =
          svgTextEl(tx, 178 + ms2, tba, fontAnton, f1n.fontSize, '400', f1n.trackingEm, it1, fg, 1, freq) +
          '\n  ' +
          svgTextEl(tx, 268 + ms, tba, fsS, f2n.fontSize, String(w700), f2n.trackingEm, it2, ac2, 1, callE);
        var fmtN0 = fitTertiaryPlainText(fmtPl, maxW, 13, fsF, teR('fmt'), archF, '');
        if (fmtN0) {
          var fFmtN0 = fitTextToMaxWidth(fmtN0, 13, maxW, 9, 15, teR('fmt'), fsF, '', archF);
          tbN0 += '\n  ' + svgTextEl(tx, 352 + ms2, tba, fsS, fFmtN0.fontSize, '700', fFmtN0.trackingEm, '', ac, 0.78, escXml(fmtN0));
        }
        return { shapes: shapes, textBlock: tbN0 };
      }
      if (pat === 1) {
        var inlPl = String(freqPl + ' ' + callPl).trim().slice(0, 28);
        var split1 = splitPlainTwoLinesIfNeeded(inlPl, maxW, Math.min(56, Math.round(fsBrand * 1.14)), teR('brand'), fpF, it1, archF);
        var parts1 = '';
        if (split1.lines.length === 1) {
          parts1 =
            svgTextEl(tx, 258 + ms, tba, fsP, split1.fontSize, String(w800), split1.trackingEm, it1, fg, 1, escXml(split1.lines[0])) +
            '\n  ';
        } else {
          parts1 =
            svgTextEl(tx, 238 + ms, tba, fsP, split1.fontSize, String(w800), split1.trackingEm, it1, fg, 1, escXml(split1.lines[0])) +
            '\n  ' +
            svgTextEl(tx, 288 + ms2, tba, fsP, Math.max(split1.fontSize - 4, 14), String(w700), split1.trackingEm, it1, fg, 1, escXml(split1.lines[1])) +
            '\n  ';
        }
        var fmtN1 = fitTertiaryPlainText(fmtPl, maxW, 14, fsF, teR('fmt'), archF, it2);
        if (fmtN1) {
          var fFmtN1 = fitTextToMaxWidth(fmtN1, 14, maxW, 9, 16, teR('fmt'), fsF, it2, archF);
          parts1 += svgTextEl(tx, split1.lines.length === 1 ? 334 + ms2 : 348 + ms2, tba, fsS, fFmtN1.fontSize, '700', fFmtN1.trackingEm, it2, ac, 0.72, escXml(fmtN1));
        }
        return { shapes: shapes, textBlock: parts1 };
      }
      var fA = fitTextToMaxWidth(freqPl, Math.min(96, fsAntonFreq0 + 2), maxW, 22, 98, teR('freq'), 'Anton', it1, archF);
      var fB = fitTextToMaxWidth(callPl, fsCallTiny0, maxW, 14, fsCallTiny0 + 8, teR('call'), fpF, it2, archF);
      var fBr = fitTextToMaxWidth(brandPl, 20, maxW, 14, 24, teR('brand'), fsF, '', archF);
      var tbN2 =
        svgTextEl(tx, 194 + ms, tba, fontAnton, fA.fontSize, '400', fA.trackingEm, it1, fg, 1, freq) +
        '\n  ' +
        svgTextEl(tx, 264 + ms2, tba, fsP, fB.fontSize, String(w700), fB.trackingEm, it2, ac2, 1, callE) +
        '\n  ' +
        svgTextEl(tx, 318 + ms, tba, fsS, fBr.fontSize, '800', fBr.trackingEm, '', ac, 1, brandE);
      var fmtN2 = fitTertiaryPlainText(fmtPl, maxW, 12, fsF, teR('fmt'), archF, '');
      if (fmtN2) {
        var fFmtN2 = fitTextToMaxWidth(fmtN2, 12, maxW, 9, 14, teR('fmt'), fsF, '', archF);
        tbN2 += '\n  ' + svgTextEl(tx, 384 + ms2, tba, fsS, fFmtN2.fontSize, '600', fFmtN2.trackingEm, '', fg, 0.66, escXml(fmtN2));
      }
      return { shapes: shapes, textBlock: tbN2 };
    }

    var domFreq = (seed >>> 3) % 2 === 0;
    if (pat === 0 || (pat === 2 && domFreq)) {
      var fHz = fitTextToMaxWidth(freqPl, fsAntonFreq0, maxW, 24, 104, teR('freq'), 'Anton', it1, archF);
      var fBrand = fitTextToMaxWidth(brandPl, Math.round(fsBrand * 0.56), maxW, 16, Math.round(fsBrand * 0.62) + 4, teR('brand'), fsF, it2, archF);
      var fCall = fitTextToMaxWidth(callPl, fsCallTiny0, maxW, 14, fsCallTiny0 + 6, teR('call'), fsF, '', archF);
      var tbC0 =
        svgTextEl(tx, 184 + ms2, tba, fontAnton, fHz.fontSize, '400', fHz.trackingEm, it1, fg, 1, freq) +
        '\n  ' +
        svgTextEl(tx, 274 + ms, tba, fsS, fBrand.fontSize, String(w700), fBrand.trackingEm, it2, ac2, 1, brandE) +
        '\n  ' +
        svgTextEl(tx, 346 + ms2, tba, fsS, fCall.fontSize, String(ws), fCall.trackingEm, '', ac, 1, callE);
      var fmtC0 = fitTertiaryPlainText(fmtPl, maxW, 14, fsF, teR('fmt'), archF, '');
      if (fmtC0) {
        var fFmtC0 = fitTextToMaxWidth(fmtC0, 14, maxW, 9, 16, teR('fmt'), fsF, '', archF);
        tbC0 += '\n  ' + svgTextEl(tx, 408 + ms, tba, fsS, fFmtC0.fontSize, String(ws), fFmtC0.trackingEm, '', fg, 0.74, escXml(fmtC0));
      }
      return { shapes: shapes, textBlock: tbC0 };
    }
    if (pat === 1) {
      var inlPl2 = String(freqPl + ' ' + brandPl).trim().slice(0, 30);
      var split2 = splitPlainTwoLinesIfNeeded(inlPl2, maxW, Math.min(58, Math.round(fsBrand * 1.2)), teR('brand'), fpF, it1, archF);
      var parts2 = '';
      if (split2.lines.length === 1) {
        parts2 =
          svgTextEl(tx, 262 + ms, tba, fsP, split2.fontSize, String(w800), split2.trackingEm, it1, fg, 1, escXml(split2.lines[0])) +
          '\n  ';
      } else {
        parts2 =
          svgTextEl(tx, 242 + ms, tba, fsP, split2.fontSize, String(w800), split2.trackingEm, it1, fg, 1, escXml(split2.lines[0])) +
          '\n  ' +
          svgTextEl(tx, 292 + ms2, tba, fsP, Math.max(split2.fontSize - 4, 14), String(w700), split2.trackingEm, it1, fg, 1, escXml(split2.lines[1])) +
          '\n  ';
      }
      var fmtC1 = fitTertiaryPlainText(fmtPl, maxW, 15, fsF, teR('fmt'), archF, it2);
      if (fmtC1) {
        var fFmtC1 = fitTextToMaxWidth(fmtC1, 15, maxW, 9, 17, teR('fmt'), fsF, it2, archF);
        parts2 += svgTextEl(tx, split2.lines.length === 1 ? 342 + ms2 : 348 + ms2, tba, fsS, fFmtC1.fontSize, String(ws), fFmtC1.trackingEm, it2, ac, 1, escXml(fmtC1));
      }
      return { shapes: shapes, textBlock: parts2 };
    }
    var fBr2 = fitTextToMaxWidth(brandPl, Math.min(58, Math.round(fsBrand * 1.22)), maxW, 16, 62, teR('brand'), fpF, it1, archF);
    var fFq = fitTextToMaxWidth(freqPl, Math.min(84, fsAntonFreq0 - 6), maxW, 22, 90, teR('freq'), 'Anton', it2, archF);
    var fCl = fitTextToMaxWidth(callPl, fsCallTiny0, maxW, 13, fsCallTiny0 + 4, teR('call'), fsF, '', archF);
    var tbC2 =
      svgTextEl(tx, 206 + ms, tba, fsP, fBr2.fontSize, String(w800), fBr2.trackingEm, it1, fg, 1, brandE) +
      '\n  ' +
      svgTextEl(tx, 286 + ms2, tba, fontAnton, fFq.fontSize, '400', fFq.trackingEm, it2, ac2, 1, freq) +
      '\n  ' +
      svgTextEl(tx, 364 + ms, tba, fsS, fCl.fontSize, String(ws), fCl.trackingEm, '', ac, 1, callE);
    var fmtC2 = fitTertiaryPlainText(fmtPl, maxW, 13, fsF, teR('fmt'), archF, '');
    if (fmtC2) {
      var fFmtC2 = fitTextToMaxWidth(fmtC2, 13, maxW, 9, 15, teR('fmt'), fsF, '', archF);
      tbC2 += '\n  ' + svgTextEl(tx, 424 + ms2, tba, fsS, fFmtC2.fontSize, String(ws), fFmtC2.trackingEm, '', fg, 0.7, escXml(fmtC2));
    }
    return { shapes: shapes, textBlock: tbC2 };
  }

  function buildBroadcastSansHeroText(o) {
    var spec = o.spec;
    var seed = spec.seed;
    var pat = (seed >>> 4) % 3;
    var ms = thumbMicroShift(seed, 40);
    var ms2 = thumbMicroShift(seed, 41);
    var resolved = o.resolved;
    var typo = o.typo;
    var casingBrand = spec.brandPreserveCasing ? 'mixed' : typo.casing;
    var coords = o.coords;
    var fg = o.fg;
    var ac = o.ac;
    var ac2 = o.ac2;
    var fsP = o.fsPrimary;
    var fsS = o.fsSecondary;
    var wp = o.wp;
    var ws = o.ws;
    var lm = o.lm;
    var family = o.family;
    var dial = spec.dial;
    var band = spec.band;
    var fmtLab = spec.formatLabel || '';
    var fmtE = escXml(fmtLab.length > 24 ? fmtLab.slice(0, 22) + '…' : fmtLab);
    var freqRaw = applyCasingLine(freqLine(dial, band), typo.casing);
    var freqE = escXml(freqRaw);
    var callRaw = applyCasingLine(String(spec.callDisplay || '').replace(/-/g, ' '), typo.casing);
    var callE = escXml(callRaw);
    var brandRaw = applyCasingLine(String(spec.brand || ''), casingBrand);
    var brandE = escXml(brandRaw);
    var it1 = o.it1;
    var it2 = o.it2;
    var fontAnton = fontStack('Anton');
    var xa = coords.xs;
    var ta = coords.as;
    var yBase = 256;
    var w800 = Math.min(900, wp + 15);
    var w700 = Math.min(900, ws + 25);
    var archH = 'broadcastSans';
    var maxWx = maxTextWidthHero(ta, xa, archH);
    var fpH = spec.fonts.primary || 'Inter';
    var fsH = spec.fonts.secondary || 'Inter';
    function teH(role) {
      if (role === 'brand') return clampFitTrackingEm(typo.trackingPrimaryEm || 0, archH);
      if (role === 'fmt') return clampFitTrackingEm((typo.trackingSecondaryEm || 0) * 0.55 + 0.008, archH);
      return clampFitTrackingEm(typo.trackingSecondaryEm || 0, archH);
    }

    if (!resolved.stack) {
      var single0 = String(resolved.single || '');
      var fs0 = fitHeroSingle(single0, 132, 40, lm);
      var fsBig = Math.min(128, Math.round(fs0 * 1.08));
      var fitSg = fitTextToMaxWidth(single0, fsBig, maxWx, 34, fsBig + 10, teH('brand'), fpH, it1, archH);
      var fmtHS = fitTertiaryPlainText(fmtLab, maxWx, 15, fsH, teH('fmt'), archH, it2);
      var outS =
        svgTextEl(xa, yBase + ms, ta, fsP, fitSg.fontSize, String(w800), fitSg.trackingEm, it1, fg, 1, escXml(applyCasingLine(single0, casingBrand)));
      if (fmtHS) {
        var fitFmtS = fitTextToMaxWidth(fmtHS, 15, maxWx, 10, 17, teH('fmt'), fsH, it2, archH);
        outS +=
          '\n  ' +
          svgTextEl(xa, yBase + 72 + ms2, ta, fsS, fitFmtS.fontSize, String(w700), fitFmtS.trackingEm, it2, ac, 0.75, escXml(fmtHS));
      }
      return outS;
    }

    var fs1b = fitHeroLine(resolved.line1, 122, 48, lm);
    var fs2b = fitHeroLine(resolved.line2, 104, 42, lm);
    var fsAnton = Math.min(118, Math.round(fs1b * (pat === 0 ? 2.35 : pat === 2 ? 2.05 : 1.65)));
    var fsSub = Math.max(34, Math.round(fs2b * (pat === 0 ? 0.62 : pat === 2 ? 0.58 : 0.72)));
    var fsTiny = Math.max(13, Math.round(fs2b * 0.36));

    if (family === 'news' || family === 'sports') {
      if (pat === 0) {
        var ffN0 = fitTextToMaxWidth(freqRaw, fsAnton, maxWx, 26, 120, teH('freq'), 'Anton', it1, archH);
        var fcN0 = fitTextToMaxWidth(callRaw, fsSub, maxWx, 22, fsSub + 14, teH('call'), fsH, it2, archH);
        var fmtN0 = fitTertiaryPlainText(fmtLab, maxWx, fsTiny, fsH, teH('fmt'), archH, '');
        var outN0 =
          svgTextEl(xa, 198 + ms, ta, fontAnton, ffN0.fontSize, '400', ffN0.trackingEm, it1, fg, 1, freqE) +
          '\n  ' +
          svgTextEl(xa, 288 + ms2, ta, fsS, fcN0.fontSize, String(w700), fcN0.trackingEm, it2, ac2, 1, callE);
        if (fmtN0) {
          var fFmtN0 = fitTextToMaxWidth(fmtN0, fsTiny, maxWx, 10, fsTiny + 4, teH('fmt'), fsH, '', archH);
          outN0 += '\n  ' + svgTextEl(xa, 358 + ms, ta, fsS, fFmtN0.fontSize, '600', fFmtN0.trackingEm, '', ac, 0.78, escXml(fmtN0));
        }
        return outN0;
      }
      if (pat === 1) {
        var inlPlainH = String(freqRaw + ' ' + callRaw).trim().slice(0, 32);
        var fsIn0 = Math.min(62, Math.round((fs1b + fs2b) * 0.48));
        var spH = splitPlainTwoLinesIfNeeded(inlPlainH, maxWx, fsIn0, teH('brand'), fpH, it1, archH);
        var outN1 = '';
        if (spH.lines.length === 1) {
          outN1 =
            svgTextEl(xa, 268 + ms, ta, fsP, spH.fontSize, String(w800), spH.trackingEm, it1, fg, 1, escXml(spH.lines[0])) + '\n  ';
        } else {
          outN1 =
            svgTextEl(xa, 248 + ms, ta, fsP, spH.fontSize, String(w800), spH.trackingEm, it1, fg, 1, escXml(spH.lines[0])) +
            '\n  ' +
            svgTextEl(xa, 298 + ms2, ta, fsP, Math.max(spH.fontSize - 4, 16), String(w700), spH.trackingEm, it1, fg, 1, escXml(spH.lines[1])) +
            '\n  ';
        }
        var fmtN1 = fitTertiaryPlainText(fmtLab, maxWx, 14, fsH, teH('fmt'), archH, it2);
        if (fmtN1) {
          var fFmtN1 = fitTextToMaxWidth(fmtN1, 14, maxWx, 10, 16, teH('fmt'), fsH, it2, archH);
          outN1 += svgTextEl(xa, spH.lines.length === 1 ? 338 + ms2 : 358 + ms2, ta, fsS, fFmtN1.fontSize, '700', fFmtN1.trackingEm, it2, ac, 0.72, escXml(fmtN1));
        }
        return outN1;
      }
      var ffN2 = fitTextToMaxWidth(freqRaw, Math.min(108, fsAnton + 6), maxWx, 24, 112, teH('freq'), 'Anton', it1, archH);
      var fcN2 = fitTextToMaxWidth(callRaw, fsSub, maxWx, 20, fsSub + 10, teH('call'), fpH, it2, archH);
      var fbN2 = fitTextToMaxWidth(brandRaw, 22, maxWx, 14, 26, teH('brand'), fsH, '', archH);
      var outN2 =
        svgTextEl(xa, 210 + ms, ta, fontAnton, ffN2.fontSize, '400', ffN2.trackingEm, it1, fg, 1, freqE) +
        '\n  ' +
        svgTextEl(xa, 278 + ms2, ta, fsP, fcN2.fontSize, String(w700), fcN2.trackingEm, it2, ac2, 1, callE) +
        '\n  ' +
        svgTextEl(xa, 328 + ms, ta, fsS, fbN2.fontSize, '800', fbN2.trackingEm, '', ac, 1, brandE);
      var fmtN2 = fitTertiaryPlainText(fmtLab, maxWx, fsTiny, fsH, teH('fmt'), archH, '');
      if (fmtN2) {
        var fFmtN2 = fitTextToMaxWidth(fmtN2, fsTiny, maxWx, 10, fsTiny + 4, teH('fmt'), fsH, '', archH);
        outN2 += '\n  ' + svgTextEl(xa, 388 + ms2, ta, fsS, fFmtN2.fontSize, '600', fFmtN2.trackingEm, '', fg, 0.65, escXml(fmtN2));
      }
      return outN2;
    }

    var domBrand = (seed >>> 3) % 2 === 0;
    if (pat === 0 || (pat === 2 && !domBrand)) {
      var ffC0 = fitTextToMaxWidth(freqRaw, fsAnton, maxWx, 26, 118, teH('freq'), 'Anton', it1, archH);
      var fbC0 = fitTextToMaxWidth(brandRaw, Math.round(fs1b * 0.72), maxWx, 18, Math.round(fs1b * 0.78) + 4, teH('brand'), fsH, it2, archH);
      var fcC0 = fitTextToMaxWidth(callRaw, fsSub, maxWx, 18, fsSub + 8, teH('call'), fsH, '', archH);
      var outC0 =
        svgTextEl(xa, 192 + ms, ta, fontAnton, ffC0.fontSize, '400', ffC0.trackingEm, it1, fg, 1, freqE) +
        '\n  ' +
        svgTextEl(xa, 282 + ms2, ta, fsS, fbC0.fontSize, String(w700), fbC0.trackingEm, it2, ac2, 1, brandE) +
        '\n  ' +
        svgTextEl(xa, 352 + ms, ta, fsS, fcC0.fontSize, String(ws), fcC0.trackingEm, '', ac, 1, callE);
      var fmtC0 = fitTertiaryPlainText(fmtLab, maxWx, 14, fsH, teH('fmt'), archH, '');
      if (fmtC0) {
        var fFmtC0 = fitTextToMaxWidth(fmtC0, 14, maxWx, 10, 16, teH('fmt'), fsH, '', archH);
        outC0 += '\n  ' + svgTextEl(xa, 414 + ms2, ta, fsS, fFmtC0.fontSize, String(ws), fFmtC0.trackingEm, '', fg, 0.72, escXml(fmtC0));
      }
      return outC0;
    }
    if (pat === 1) {
      var inlPlainC = String(freqRaw + ' ' + brandRaw).trim().slice(0, 30);
      var fsInC = Math.min(64, Math.round(fs1b * 1.05));
      var spC = splitPlainTwoLinesIfNeeded(inlPlainC, maxWx, fsInC, teH('brand'), fpH, it1, archH);
      var outC1 = '';
      if (spC.lines.length === 1) {
        outC1 =
          svgTextEl(xa, 262 + ms, ta, fsP, spC.fontSize, String(w800), spC.trackingEm, it1, fg, 1, escXml(spC.lines[0])) + '\n  ';
      } else {
        outC1 =
          svgTextEl(xa, 242 + ms, ta, fsP, spC.fontSize, String(w800), spC.trackingEm, it1, fg, 1, escXml(spC.lines[0])) +
          '\n  ' +
          svgTextEl(xa, 292 + ms2, ta, fsP, Math.max(spC.fontSize - 4, 16), String(w700), spC.trackingEm, it1, fg, 1, escXml(spC.lines[1])) +
          '\n  ';
      }
      var fmtC1 = fitTertiaryPlainText(fmtLab, maxWx, 15, fsH, teH('fmt'), archH, it2);
      if (fmtC1) {
        var fFmtC1 = fitTextToMaxWidth(fmtC1, 15, maxWx, 10, 17, teH('fmt'), fsH, it2, archH);
        outC1 += svgTextEl(xa, spC.lines.length === 1 ? 340 + ms2 : 352 + ms2, ta, fsS, fFmtC1.fontSize, String(ws), fFmtC1.trackingEm, it2, ac, 1, escXml(fmtC1));
      }
      return outC1;
    }
    var fbL = fitTextToMaxWidth(brandRaw, Math.min(66, Math.round(fs1b * 1.12)), maxWx, 18, 68, teH('brand'), fpH, it1, archH);
    var ffL = fitTextToMaxWidth(freqRaw, Math.min(100, fsAnton), maxWx, 24, 102, teH('freq'), 'Anton', it2, archH);
    var fcL = fitTextToMaxWidth(callRaw, fsSub, maxWx, 16, fsSub + 6, teH('call'), fsH, '', archH);
    var outL =
      svgTextEl(xa, 214 + ms, ta, fsP, fbL.fontSize, String(w800), fbL.trackingEm, it1, fg, 1, brandE) +
      '\n  ' +
      svgTextEl(xa, 292 + ms2, ta, fontAnton, ffL.fontSize, '400', ffL.trackingEm, it2, ac2, 1, freqE) +
      '\n  ' +
      svgTextEl(xa, 364 + ms, ta, fsS, fcL.fontSize, String(ws), fcL.trackingEm, '', ac, 1, callE);
    var fmtL = fitTertiaryPlainText(fmtLab, maxWx, 13, fsH, teH('fmt'), archH, '');
    if (fmtL) {
      var fFmtL = fitTextToMaxWidth(fmtL, 13, maxWx, 9, 15, teH('fmt'), fsH, '', archH);
      outL += '\n  ' + svgTextEl(xa, 424 + ms2, ta, fsS, fFmtL.fontSize, String(ws), fFmtL.trackingEm, '', fg, 0.68, escXml(fmtL));
    }
    return outL;
  }

  /**
   * @param {object} input — same shape as legacy wlBuildProceduralLogoInput output
   * @returns {object} spec for renderStationLogoSvg
   */
  function generateStationLogoSpec(input) {
    if (!input) return null;
    var cfg = getConfig();
    var id = String(input.id || 'stn');
    var callDisplay = String(input.callDisplay || 'WXXX-AM').trim();
    var brandRaw = String(input.brand || callDisplay).trim() || callDisplay;
    var layoutMode = String(input.layoutMode || 'brandHero');
    var variantBump = Math.max(0, Math.floor(Number(input.variantBump) || 0));
    var brandMax = layoutMode === 'brandHero' ? 52 : 28;
    var brand = brandRaw.length > brandMax ? brandRaw.slice(0, brandMax - 1) + '…' : brandRaw;
    var formatKey = String(input.formatKey || 'AC');
    var formatLabel = String(input.formatLabel || 'Radio').trim();
    var dial = String(input.dial || '').trim();
    var band = String(input.band || 'AM').toUpperCase() === 'FM' ? 'FM' : 'AM';
    var year = Math.floor(Number(input.year) || 1970);
    var defaultBrand = String(input.defaultBrand ?? '').trim();
    /** User-edited brand: skip title/upper casing so call letters & mixed-case names stay as typed. */
    var brandPreserveCasing =
      brandRaw.length > 0 && normBrandKey(brandRaw) !== normBrandKey(defaultBrand);

    var family = formatToFamily(formatKey);
    var era = eraBucket(year);
    var seed = fnv1a(id + '|' + formatKey + '|' + era + '|' + callDisplay + '|' + variantBump + '|' + brandRaw);
    var variant = seed % 3;
    var palList = (cfg.palettes && cfg.palettes[family]) || cfg.palettes.ac;
    var paletteIndex = palList.length ? ((seed >>> 3) % palList.length) : 0;
    var pal = pickPalette(family, seed >>> 3);
    var es = getEraModifiers(era);
    var fpList = (cfg.fontPairs && cfg.fontPairs[family]) || cfg.fontPairs.ac;
    var fontPairIndex = fpList.length ? ((seed >>> 7) % fpList.length) : 0;
    var fp = pickFontPair(family, seed >>> 7);
    var layoutPick = resolveLayoutArchetype(cfg, family, era, seed, variant, variantBump, formatKey, band);
    var arch0 = layoutPick.archetype;
    var fpUse = fp;
    if (arch0 === 'broadcastSans') {
      fpUse = broadcastSansFontPair(family, seed);
    }
    var weightPrimary = fpUse.wp != null ? fpUse.wp : 700;
    var weightSecondary = fpUse.ws != null ? fpUse.ws : 600;
    var typo = mergeTypographyRules(cfg, family, era, seed, variant, weightPrimary, weightSecondary, fpUse);
    if (arch0 === 'broadcastSans') {
      typo = Object.assign({}, typo, {
        trackingPrimaryEm: typo.trackingPrimaryEm - 0.022,
        trackingSecondaryEm: typo.trackingSecondaryEm - 0.018,
      });
    }
    var italicMode = resolveItalicMode(family, arch0, seed, variant);
    var fonts = {
      primary: fpUse.primary,
      secondary: fpUse.secondary,
      weightPrimary: Math.min(900, typo.weightPrimary),
      weightSecondary: Math.min(900, typo.weightSecondary),
      italicPrimary: typo.italicPrimary,
      italicSecondary: typo.italicSecondary,
      primaryStack: fontStack(fpUse.primary),
      secondaryStack: fontStack(fpUse.secondary),
    };

    return {
      version: 1,
      id: id,
      family: family,
      familyLabel: (cfg.familyLabels && cfg.familyLabels[family]) || family,
      formatKey: formatKey,
      formatLabel: formatLabel,
      era: era,
      year: year,
      dial: dial,
      band: band,
      callDisplay: callDisplay,
      brand: brand,
      brandRaw: brandRaw,
      defaultBrand: defaultBrand,
      brandPreserveCasing: brandPreserveCasing,
      layoutMode: layoutMode,
      variant: variant,
      variantBump: variantBump,
      seed: seed,
      paletteIndex: paletteIndex,
      paletteCount: palList.length,
      fontPairIndex: fontPairIndex,
      fontPairCount: fpList.length,
      palette: pal,
      eraStyle: es,
      fonts: fonts,
      typography: typo,
      layoutArchetype: layoutPick.archetype,
      layoutStructure: layoutPick.eraStructure,
      accent: (seed >>> 5) % 4,
      italicMode: italicMode,
    };
  }

  function buildBrandHeroLayout(spec) {
    var family = spec.family;
    var variant = spec.variant;
    var es = spec.eraStyle;
    var brand = spec.brand;
    var fg = spec.palette.fg;
    var bg = spec.palette.bg;
    var ac = spec.palette.ac;
    var ac2 = spec.palette.ac2;
    var era = spec.era;
    var dial = spec.dial;
    var callDisplay = spec.callDisplay;
    var defaultBrand = spec.defaultBrand;
    var typo = spec.typography;
    if (!typo) {
      typo = mergeTypographyRules(getConfig(), spec.family, spec.era, spec.seed, spec.variant, spec.fonts.weightPrimary, spec.fonts.weightSecondary, {});
    }
    var lm = (es.letterMult != null ? es.letterMult : 1) * (1 + (typo.letterMultBoost || 0));
    var fsPrimary = spec.fonts.primaryStack;
    var fsSecondary = spec.fonts.secondaryStack;
    var wp = spec.fonts.weightPrimary;
    var ws = spec.fonts.weightSecondary;

    var resolvedRaw = resolveHeroLines(brand, dial, callDisplay, defaultBrand);
    var casingHero = spec.brandPreserveCasing ? 'mixed' : typo.casing;
    var resolved;
    if (resolvedRaw.stack) {
      resolved = {
        stack: true,
        line1: applyCasingLine(resolvedRaw.line1, casingHero),
        line2: applyCasingLine(resolvedRaw.line2, casingHero),
      };
    } else {
      resolved = { stack: false, single: applyCasingLine(resolvedRaw.single, casingHero) };
    }
    var gloss =
      es.glow > 0
        ? '<ellipse cx="256" cy="128" rx="220" ry="100" fill="url(#wlGlossBh)" opacity="' + es.glow * 0.85 + '"/>'
        : '';
    var defs = '<defs>\n  <linearGradient id="wlGlossBh" x1="0%" y1="0%" x2="0%" y2="100%">\n    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>\n    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>\n  </linearGradient>\n</defs>';
    var shapes = '';
    var y1 = 228;
    var y2 = 348;
    var r = es.r != null ? es.r : 8;
    var rule = es.rule != null ? es.rule : 4;
    var arch = spec.layoutArchetype || 'default';
    var ls = spec.layoutStructure || {};
    var fl = ls.frameLayers != null ? ls.frameLayers : 0;

    switch (family) {
      case 'hit':
      case 'rhythmic': {
        if (arch === 'broadcastSans') {
          shapes =
            (spec.seed >>> 6) % 6 === 0
              ? '<line x1="48" y1="70" x2="464" y2="70" stroke="' + ac + '" stroke-width="2" opacity="0.16"/>'
              : '';
          y1 = 218;
          y2 = 338;
          break;
        }
        var chrBx = (spec.seed >>> 11) % 5 - 2;
        if (arch === 'brandHero') {
          shapes =
            '<rect x="' +
            (40 + chrBx) +
            '" y="' +
            (38 + ((spec.seed >>> 13) % 3)) +
            '" width="432" height="432" rx="' +
            (r + 4) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="' +
            Math.max(4, rule) +
            '"/>\n  <polygon points="0,0 140,0 90,512 0,512" fill="' +
            ac +
            '" opacity="0.28"/>';
          y1 = 230;
          y2 = 350;
        } else if (arch === 'diagonalBlock') {
          shapes =
            '<polygon points="0,512 512,0 512,512 0,512" fill="' +
            ac2 +
            '" opacity="0.28"/>\n  <polygon points="0,0 200,0 0,280" fill="' +
            ac +
            '" opacity="0.78"/>\n  <line x1="0" y1="180" x2="512" y2="340" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 8) +
            '" opacity="0.48"/>';
          y1 = 224;
          y2 = 344;
        } else if (arch === 'textBar') {
          shapes =
            '<rect x="0" y="0" width="512" height="58" fill="' +
            ac +
            '"/>\n  <rect x="0" y="454" width="512" height="58" fill="' +
            ac2 +
            '" opacity="0.82"/>\n  <line x1="28" y1="102" x2="484" y2="102" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 2) +
            '"/>';
          y1 = 236;
          y2 = 356;
        } else if (arch === 'sleekStrip' && family === 'rhythmic') {
          shapes =
            '<rect x="20" y="88" width="472" height="10" fill="' +
            ac +
            '"/>\n  <rect x="20" y="414" width="472" height="8" fill="' +
            ac2 +
            '"/>\n  <line x1="40" y1="256" x2="472" y2="256" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.3"/>\n  <rect x="400" y="120" width="72" height="272" fill="none" stroke="' +
            ac2 +
            '" stroke-width="3" opacity="0.5"/>';
          y1 = 228;
          y2 = 348;
        } else if (arch === 'freqHero') {
          shapes =
            '<rect x="0" y="468" width="512" height="44" fill="' +
            ac +
            '" opacity="0.8"/>\n  <line x1="0" y1="118" x2="168" y2="0" stroke="' +
            ac2 +
            '" stroke-width="4" opacity="0.36"/>';
          y1 = 224;
          y2 = 344;
        } else if (arch === 'textOnlyStrike') {
          shapes =
            '<line x1="56" y1="96" x2="420" y2="96" stroke="' +
            ac +
            '" stroke-width="5" opacity="0.48"/>\n  <line x1="72" y1="408" x2="480" y2="408" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.34"/>';
          y1 = 232;
          y2 = 348;
        } else if (arch === 'freqTitan') {
          shapes =
            '<line x1="48" y1="72" x2="464" y2="72" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 10) +
            '"/>\n  <line x1="48" y1="92" x2="320" y2="92" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.45"/>';
          y1 = 218;
          y2 = 332;
        } else {
          shapes =
            '<polygon points="0,0 160,0 110,512 0,512" fill="' +
            ac +
            '" opacity="0.95"/>\n  <polygon points="512,0 512,200 360,0" fill="' +
            ac2 +
            '" opacity="0.78"/>';
        }
        break;
      }
      case 'country':
        if (arch === 'horizontalWord') {
          shapes =
            '<rect x="32" y="200" width="448" height="120" rx="' +
            (r + 6) +
            '" fill="' +
            ac +
            '" opacity="0.2"/>\n  <line x1="40" y1="198" x2="472" y2="198" stroke="' +
            ac2 +
            '" stroke-width="4"/>';
          y1 = 248;
          y2 = 318;
        } else if (arch === 'openWordmark') {
          shapes =
            '<line x1="52" y1="246" x2="460" y2="246" stroke="' +
            ac2 +
            '" stroke-width="4"/>\n  <line x1="52" y1="252" x2="300" y2="252" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.5"/>';
          y1 = 234;
          y2 = 326;
        } else if (arch === 'stackHeritage') {
          shapes =
            '<path d="M 52 372 Q 256 432 460 372" fill="none" stroke="' +
            ac +
            '" stroke-width="6" opacity="0.32"/>\n  <line x1="68" y1="118" x2="128" y2="118" stroke="' +
            ac2 +
            '" stroke-width="3"/>';
          y1 = 238;
          y2 = 334;
        } else if (arch === 'badgeSeal') {
          shapes =
            '<circle cx="256" cy="256" r="232" fill="none" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 6) +
            '"/>\n  <circle cx="256" cy="256" r="188" fill="none" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.5"/>';
          y1 = 236;
          y2 = 348;
        } else {
          shapes =
            '<circle cx="256" cy="256" r="228" fill="none" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 2) +
            '"/>\n  <circle cx="256" cy="256" r="200" fill="none" stroke="' +
            ac2 +
            '" stroke-width="3" opacity="0.6"/>';
          y1 = 232;
          y2 = 352;
        }
        break;
      case 'gospel':
        if (arch === 'horizontalWord') {
          shapes =
            '<rect x="36" y="210" width="440" height="112" rx="' +
            (r + 8) +
            '" fill="' +
            ac +
            '" opacity="0.18"/>\n  <line x1="48" y1="208" x2="464" y2="208" stroke="' +
            ac2 +
            '" stroke-width="3"/>';
          y1 = 252;
          y2 = 322;
        } else if (arch === 'softCard') {
          shapes =
            '<rect x="44" y="44" width="424" height="424" rx="' +
            (r + 14) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="3" opacity="0.55"/>\n  <line x1="80" y1="400" x2="432" y2="400" stroke="' +
            ac2 +
            '" stroke-width="' +
            rule +
            '" opacity="0.45"/>';
          y1 = 230;
          y2 = 350;
        } else if (arch === 'softHeritage') {
          shapes =
            '<line x1="256" y1="52" x2="256" y2="96" stroke="' +
            ac2 +
            '" stroke-width="3" opacity="0.48"/>\n  <line x1="48" y1="404" x2="464" y2="404" stroke="' +
            ac +
            '" stroke-width="' +
            rule +
            '" opacity="0.38"/>';
          y1 = 234;
          y2 = 344;
        } else {
          shapes =
            '<line x1="256" y1="48" x2="256" y2="112" stroke="' +
            ac2 +
            '" stroke-width="4" opacity="0.45"/>\n  <line x1="200" y1="80" x2="312" y2="80" stroke="' +
            ac2 +
            '" stroke-width="4" opacity="0.45"/>\n  <rect x="36" y="36" width="440" height="440" rx="' +
            (r + 10) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="3" opacity="0.5"/>';
          y1 = 232;
          y2 = 352;
        }
        break;
      case 'news': {
        var nw70 = era === '1970s';
        var nw8090 = era === '1980s' || era === '1990s';
        var nw2000 = era === '2000s';
        var nw10 = era === '2010s+';
        var nwBlock = nw8090 || nw2000;
        if (arch === 'broadcastSans') {
          shapes =
            (spec.seed >>> 6) % 5 === 0
              ? '<line x1="44" y1="66" x2="468" y2="66" stroke="' + ac + '" stroke-width="2" opacity="0.14"/>'
              : '';
          y1 = 216;
          y2 = 336;
          break;
        }
        if (arch === 'masthead') {
          if (nw70) {
            shapes =
              '<line x1="0" y1="74" x2="512" y2="74" stroke="' +
              ac +
              '" stroke-width="2" opacity="0.88"/>\n  <line x1="40" y1="402" x2="472" y2="402" stroke="' +
              ac2 +
              '" stroke-width="' +
              Math.max(2, rule - 1) +
              '"/>\n  <line x1="40" y1="422" x2="268" y2="422" stroke="' +
              ac +
              '" stroke-width="1" opacity="0.52"/>';
            y1 = 252;
            y2 = 336;
          } else if (nw10) {
            shapes =
              '<rect x="0" y="0" width="512" height="46" fill="' +
              ac +
              '" opacity="0.94"/>\n  <line x1="40" y1="404" x2="472" y2="404" stroke="' +
              ac2 +
              '" stroke-width="2" opacity="0.42"/>';
            y1 = 246;
            y2 = 334;
          } else {
            shapes =
              '<rect x="0" y="0" width="512" height="' +
              (nw8090 ? 86 : 76) +
              '" fill="' +
              ac +
              '"/>\n  <line x1="40" y1="400" x2="472" y2="400" stroke="' +
              ac2 +
              '" stroke-width="' +
              (nw8090 ? rule + 2 : rule) +
              '"/>\n  <line x1="40" y1="422" x2="' +
              (nw8090 ? '320' : '280') +
              '" y2="422" stroke="' +
              ac +
              '" stroke-width="' +
              (nw8090 ? '4' : '2') +
              '" opacity="0.62"/>';
            y1 = nw8090 ? 254 : 248;
            y2 = 338;
          }
        } else if (arch === 'freqMinimal') {
          shapes =
            '<line x1="48" y1="112" x2="464" y2="112" stroke="' +
            ac +
            '" stroke-width="' +
            (nw70 ? Math.max(2, rule - 1) : nw8090 ? Math.max(6, rule + 2) : Math.max(4, rule)) +
            '"/>\n  <line x1="48" y1="128" x2="' +
            (nw8090 ? '420' : '360') +
            '" y2="128" stroke="' +
            ac2 +
            '" stroke-width="' +
            (nw70 ? '1' : '2') +
            '" opacity="' +
            (nw70 ? '0.4' : nw10 ? '0.38' : '0.5') +
            '"/>';
          y1 = 252;
          y2 = 342;
        } else if (arch === 'plainMast') {
          shapes =
            '<line x1="48" y1="92" x2="' +
            (nw70 ? '360' : '392') +
            '" y2="92" stroke="' +
            ac +
            '" stroke-width="' +
            (nw70 ? '2' : '3') +
            '"/>\n  <line x1="48" y1="108" x2="248" y2="108" stroke="' +
            ac2 +
            '" stroke-width="' +
            (nw70 ? '1' : '2') +
            '" opacity="' +
            (nw70 ? '0.4' : '0.48') +
            '"/>\n  <line x1="48" y1="404" x2="352" y2="404" stroke="' +
            ac2 +
            '" stroke-width="' +
            (nwBlock ? rule + 1 : rule) +
            '"/>';
          y1 = 246;
          y2 = 332;
        } else if (arch === 'numericLed') {
          shapes =
            '<line x1="48" y1="84" x2="464" y2="84" stroke="' +
            ac +
            '" stroke-width="' +
            (nw70
              ? Math.max(4, rule)
              : nw8090
                ? Math.max(8, rule + 4)
                : Math.max(5, rule + 2)) +
            '"/>\n  <line x1="48" y1="104" x2="' +
            (nw8090 ? '380' : '340') +
            '" y2="104" stroke="' +
            ac2 +
            '" stroke-width="' +
            (nw70 ? '1' : '2') +
            '" opacity="' +
            (nw10 ? '0.38' : '0.46') +
            '"/>';
          y1 = 250;
          y2 = 326;
        } else {
          var tag2010 = nw10 && (spec.seed >>> 3) % 4 !== 0;
          if (nw70) {
            shapes =
              '<rect x="28" y="28" width="456" height="456" rx="' +
              r +
              '" fill="none" stroke="' +
              ac +
              '" stroke-width="' +
              Math.max(2, rule - 1) +
              '" opacity="0.72"/>\n  <line x1="48" y1="88" x2="464" y2="88" stroke="' +
              ac2 +
              '" stroke-width="' +
              Math.max(2, rule - 1) +
              '"/>';
          } else if (nw10) {
            shapes =
              '<rect x="32" y="32" width="448" height="448" rx="' +
              Math.max(4, r - 2) +
              '" fill="none" stroke="' +
              ac +
              '" stroke-width="2" opacity="0.52"/>\n  <line x1="48" y1="88" x2="464" y2="88" stroke="' +
              ac2 +
              '" stroke-width="2" opacity="0.48"/>' +
              (tag2010
                ? '\n  <rect x="48" y="48" width="120" height="36" fill="' +
                  ac +
                  '"/>\n  <text x="108" y="73" text-anchor="middle" font-family="' +
                  fsSecondary +
                  '" font-size="14" font-weight="' +
                  ws +
                  '" fill="' +
                  bg +
                  '">' +
                  escXml(es.tag || 'LIVE') +
                  '</text>'
                : '');
          } else {
            shapes =
              '<rect x="28" y="28" width="456" height="456" rx="' +
              r +
              '" fill="none" stroke="' +
              ac +
              '" stroke-width="' +
              Math.max(3, rule) +
              '"/>\n  <line x1="48" y1="88" x2="464" y2="88" stroke="' +
              ac2 +
              '" stroke-width="' +
              rule +
              '"/>';
            if (nwBlock) {
              shapes +=
                '\n  <rect x="48" y="48" width="120" height="36" fill="' +
                ac +
                '"/>\n  <text x="108" y="73" text-anchor="middle" font-family="' +
                fsSecondary +
                '" font-size="14" font-weight="' +
                ws +
                '" fill="' +
                bg +
                '">' +
                escXml(es.tag || 'LIVE') +
                '</text>';
            }
          }
          y1 = 238;
          y2 = 358;
        }
        break;
      }
      case 'sports': {
        if (arch === 'broadcastSans') {
          shapes =
            (spec.seed >>> 6) % 7 === 0
              ? '<line x1="46" y1="68" x2="466" y2="68" stroke="' + ac2 + '" stroke-width="2" opacity="0.15"/>'
              : '';
          y1 = 218;
          y2 = 338;
          break;
        }
        var sportsRadioPanelBh = arch === 'shieldBadge' && (spec.seed >>> 9) % 5 < 2;
        if (sportsRadioPanelBh) {
          shapes =
            '<rect x="22" y="96" width="468" height="320" rx="' +
            Math.max(8, r) +
            '" fill="' +
            bg +
            '" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 5) +
            '"/>\n  <line x1="36" y1="138" x2="476" y2="138" stroke="' +
            ac2 +
            '" stroke-width="3" opacity="0.36"/>';
          y1 = 238;
          y2 = 342;
        } else {
          var shieldPath =
            arch === 'bannerStack'
              ? 'M 32 120 L 480 120 L 448 400 L 64 400 Z'
              : arch === 'angularLockup'
                ? 'M 256 36 L 472 140 L 420 472 L 92 472 L 40 140 Z'
                : variant % 2 === 0
                  ? 'M 256 48 L 432 125 L 395 448 L 117 448 L 80 125 Z'
                  : 'M 256 56 L 448 170 L 372 464 L 140 464 L 64 170 Z';
          shapes =
            '<path d="' +
            shieldPath +
            '" fill="' +
            bg +
            '" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 3) +
            '"/>';
          if (arch === 'bannerStack') {
            shapes +=
              '\n  <rect x="48" y="140" width="416" height="36" fill="' + ac + '" opacity="0.35"/>';
          }
          y1 = arch === 'bannerStack' ? 240 : 234;
          y2 = arch === 'bannerStack' ? 340 : 354;
        }
        break;
      }
      case 'rock':
        if (arch === 'stackedSlab') {
          shapes =
            '<rect x="0" y="100" width="512" height="44" fill="' +
            ac +
            '" opacity="0.55"/>\n  <rect x="0" y="360" width="512" height="52" fill="' +
            ac2 +
            '" opacity="0.4"/>\n  <polygon points="0,0 512,0 512,220 0,160" fill="' +
            ac2 +
            '" opacity="0.2"/>';
          y1 = 228;
          y2 = 338;
        } else if (arch === 'minimalDark') {
          shapes =
            '<line x1="48" y1="420" x2="464" y2="420" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 4) +
            '"/>\n  <line x1="48" y1="404" x2="200" y2="404" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.5"/>';
          y1 = 218;
          y2 = 328;
        } else if (arch === 'slabMinimal') {
          shapes =
            '<rect x="0" y="428" width="512" height="42" fill="' +
            ac +
            '" opacity="0.5"/>';
          y1 = 224;
          y2 = 334;
        } else if (arch === 'freqWall') {
          shapes =
            '<rect x="36" y="96" width="12" height="320" fill="' +
            ac +
            '" opacity="0.62"/>\n  <line x1="64" y1="432" x2="464" y2="432" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.36"/>';
          y1 = 222;
          y2 = 338;
        } else {
          shapes =
            '<polygon points="0,0 512,0 512,512 200,512 0,220" fill="' +
            ac2 +
            '" opacity="0.22"/>\n  <line x1="0" y1="140" x2="512" y2="380" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 6) +
            '" opacity="0.4"/>';
          y1 = 220;
          y2 = 340;
        }
        break;
      case 'oldies': {
        if (arch === 'plainStack' || arch === 'freqNostalgia') {
          shapes =
            '<line x1="64" y1="112" x2="448" y2="112" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.36"/>\n  <line x1="64" y1="400" x2="448" y2="400" stroke="' +
            ac +
            '" stroke-width="3" opacity="0.3"/>';
          if (arch === 'freqNostalgia') {
            shapes +=
              '\n  <line x1="72" y1="128" x2="208" y2="128" stroke="' + ac2 + '" stroke-width="2" opacity="0.4"/>';
          }
          y1 = arch === 'freqNostalgia' ? 226 : 232;
          y2 = arch === 'freqNostalgia' ? 336 : 352;
        } else {
        var rays2 = '';
        var rayCount = arch === 'nostalgicFrame' ? 14 : arch === 'classicWordmark' ? 6 : 10;
        var i2;
        for (i2 = 0; i2 < rayCount; i2++) {
          var a3 = (i2 / rayCount) * Math.PI * 2;
          var xr = 256 + Math.cos(a3) * (arch === 'classicWordmark' ? 180 : 210);
          var yr = 256 + Math.sin(a3) * (arch === 'classicWordmark' ? 180 : 210);
          rays2 +=
            '<line x1="256" y1="256" x2="' +
            xr.toFixed(0) +
            '" y2="' +
            yr.toFixed(0) +
            '" stroke="' +
            ac +
            '" stroke-width="' +
            (arch === 'nostalgicFrame' ? '2' : '2') +
            '" opacity="' +
            (arch === 'classicWordmark' ? '0.2' : '0.22') +
            '"/>';
        }
        if (arch === 'classicWordmark') {
          shapes =
            '<path d="M 64 160 L 448 140 L 472 200 L 40 200 Z" fill="' +
            ac2 +
            '" opacity="0.34"/>\n  <circle cx="256" cy="256" r="220" fill="none" stroke="' +
            ac +
            '" stroke-width="6"/>' +
            rays2;
        } else {
          shapes =
            '<circle cx="256" cy="256" r="236" fill="none" stroke="' +
            ac2 +
            '" stroke-width="5" opacity="0.35"/>' +
            rays2;
        }
        if (arch === 'nostalgicFrame') {
          shapes +=
            '\n  <rect x="32" y="32" width="448" height="448" rx="8" fill="none" stroke="' +
            ac2 +
            '" stroke-width="3" opacity="0.4"/>';
        }
        y1 = 232;
        y2 = 352;
        }
        break;
      }
      case 'urban':
        if (arch === 'blockContrast') {
          shapes =
            '<rect x="24" y="120" width="220" height="280" fill="' +
            ac +
            '" opacity="0.35"/>\n  <rect x="268" y="60" width="220" height="392" fill="none" stroke="' +
            ac2 +
            '" stroke-width="8"/>\n  <rect x="288" y="80" width="180" height="80" fill="' +
            ac2 +
            '" opacity="0.25"/>';
          y1 = 240;
          y2 = 340;
        } else if (arch === 'diagonalUrban') {
          shapes =
            '<polygon points="0,0 512,0 320,512 0,512" fill="' +
            ac +
            '" opacity="0.4"/>\n  <polygon points="512,0 512,512 200,512 512,160" fill="' +
            ac2 +
            '" opacity="0.28"/>';
          y1 = 232;
          y2 = 348;
        } else {
          shapes =
            '<rect x="40" y="40" width="432" height="432" rx="' +
            Math.max(6, r) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="6"/>\n  <rect x="56" y="56" width="400" height="400" rx="' +
            Math.max(4, r - 2) +
            '" fill="none" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.75"/>';
          y1 = 230;
          y2 = 350;
        }
        break;
      case 'ac':
      default:
        if (arch === 'calmMinimal') {
          shapes =
            '<line x1="60" y1="102" x2="452" y2="102" stroke="' +
            ac2 +
            '" stroke-width="1" opacity="0.36"/>\n  <line x1="60" y1="410" x2="452" y2="410" stroke="' +
            ac2 +
            '" stroke-width="1" opacity="0.36"/>';
          y1 = 232;
          y2 = 348;
        } else if (arch === 'freqWhisper') {
          shapes =
            '<line x1="52" y1="90" x2="384" y2="90" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.4"/>\n  <line x1="52" y1="422" x2="460" y2="422" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.34"/>';
          y1 = 228;
          y2 = 340;
        } else if (arch === 'softWordmark') {
          shapes =
            '<line x1="56" y1="96" x2="456" y2="96" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.4"/>\n  <line x1="56" y1="416" x2="456" y2="416" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.4"/>\n  <rect x="48" y="48" width="416" height="416" rx="' +
            (r + 16) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.45"/>';
          y1 = 232;
          y2 = 352;
        } else if (arch === 'serifLockup') {
          shapes =
            '<path d="M 48 48 L 88 48 L 88 88 M 424 48 L 464 48 L 464 88 M 48 424 L 88 424 L 88 464 M 424 424 L 464 424 L 464 464" stroke="' +
            ac2 +
            '" stroke-width="4" fill="none" opacity="0.55"/>\n  <rect x="56" y="56" width="400" height="400" rx="' +
            (r + 8) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="3" opacity="0.6"/>';
          y1 = 230;
          y2 = 350;
        } else {
          shapes =
            '<rect x="36" y="36" width="440" height="440" rx="' +
            (r + 10) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="4" opacity="0.65"/>\n  <line x1="72" y1="420" x2="440" y2="420" stroke="' +
            ac2 +
            '" stroke-width="' +
            rule +
            '" opacity="0.55"/>';
          y1 = 228;
          y2 = 348;
        }
        break;
    }

    var flExtrasBh = isOpenLayoutArchetype(arch) ? Math.min(fl, 1) : fl;
    shapes += eraLayoutExtras(refineFlExtrasForTaste(flExtrasBh, family, era), r, ac, ac2);

    var coords = skewHeroCoords(heroCoordsForArchetype(typo, arch, family), ls, spec.seed, family);
    var ls1 = letterSpacingAttr(clampFitTrackingEm(typo.trackingPrimaryEm || 0, arch));
    var ls2 = letterSpacingAttr(clampFitTrackingEm(typo.trackingSecondaryEm || 0, arch));
    var italicModeBh = spec.italicMode != null ? spec.italicMode : 'none';
    var it1 =
      italicModeBh === 'primary'
        ? ' font-style="italic"'
        : italicModeBh === 'none' && typo.italicPrimary
          ? ' font-style="italic"'
          : '';
    var it2 =
      italicModeBh === 'secondary'
        ? ' font-style="italic"'
        : italicModeBh === 'none' && typo.italicSecondary
          ? ' font-style="italic"'
          : '';

    var text = '';
    if (
      arch === 'broadcastSans' &&
      (family === 'news' || family === 'sports' || family === 'hit' || family === 'rhythmic')
    ) {
      text = buildBroadcastSansHeroText({
        spec: spec,
        resolved: resolved,
        typo: typo,
        coords: coords,
        fg: fg,
        ac: ac,
        ac2: ac2,
        fsPrimary: fsPrimary,
        fsSecondary: fsSecondary,
        wp: wp,
        ws: ws,
        lm: lm,
        family: family,
        it1: it1,
        it2: it2,
      });
    } else if (resolved.stack) {
      var raw1 = resolved.line1;
      var raw2 = resolved.line2;
      var fs1b = fitHeroLine(raw1, 118, 52, lm);
      var fs2b = fitHeroLine(raw2, 100, 46, lm);
      var hz = applyHeroHierarchySizes(fs1b, fs2b, 100, resolved, typo);
      var faceBh1 = spec.fonts.primary || 'Inter';
      var faceBh2 = spec.fonts.secondary || 'Inter';
      var maxBh1 = maxTextWidthHero(coords.a1, coords.x1, arch);
      var maxBh2 = maxTextWidthHero(coords.a2, coords.x2, arch);
      var trBh1 = clampFitTrackingEm(typo.trackingPrimaryEm || 0, arch);
      var trBh2 = clampFitTrackingEm(typo.trackingSecondaryEm || 0, arch);
      var fitBh1 = fitTextToMaxWidth(
        raw1,
        hz.fs1,
        maxBh1,
        Math.max(28, Math.round(hz.fs1 * 0.42)),
        Math.round(hz.fs1 * 1.12),
        trBh1,
        faceBh1,
        it1,
        arch
      );
      var fitBh2 = fitTextToMaxWidth(
        raw2,
        hz.fs2,
        maxBh2,
        Math.max(24, Math.round(hz.fs2 * 0.42)),
        Math.round(hz.fs2 * 1.1),
        trBh2,
        faceBh2,
        it2,
        arch
      );
      var ls1Fit = letterSpacingAttr(fitBh1.trackingEm);
      var ls2Fit = letterSpacingAttr(fitBh2.trackingEm);
      var l1 = escXml(raw1);
      var l2 = escXml(raw2);
      text =
        '<text x="' +
        coords.x1 +
        '" y="' +
        y1 +
        '" text-anchor="' +
        coords.a1 +
        '" font-family="' +
        fsPrimary +
        '" font-size="' +
        fitBh1.fontSize +
        '" font-weight="' +
        wp +
        '"' +
        ls1Fit +
        it1 +
        ' fill="' +
        fg +
        '">' +
        l1 +
        '</text>\n  <text x="' +
        coords.x2 +
        '" y="' +
        y2 +
        '" text-anchor="' +
        coords.a2 +
        '" font-family="' +
        fsSecondary +
        '" font-size="' +
        fitBh2.fontSize +
        '" font-weight="' +
        ws +
        '"' +
        ls2Fit +
        it2 +
        ' fill="' +
        ac2 +
        '">' +
        l2 +
        '</text>';
    } else {
      var single = String(resolved.single || '');
      var fs0 = fitHeroSingle(single, 128, 42, lm);
      var hz2 = applyHeroHierarchySizes(0, 0, fs0, resolved, typo);
      var yMid = Math.round((y1 + y2) / 2) + 8;
      var maxBhs = maxTextWidthHero(coords.as, coords.xs, arch);
      var trBhs = clampFitTrackingEm(typo.trackingPrimaryEm || 0, arch);
      var faceBhs = spec.fonts.primary || 'Inter';
      var fitBhs = fitTextToMaxWidth(
        single,
        hz2.fs,
        maxBhs,
        Math.max(30, Math.round(hz2.fs * 0.36)),
        Math.round(hz2.fs * 1.08),
        trBhs,
        faceBhs,
        it1,
        arch
      );
      var ls1Single = letterSpacingAttr(fitBhs.trackingEm);
      text =
        '<text x="' +
        coords.xs +
        '" y="' +
        yMid +
        '" text-anchor="' +
        coords.as +
        '" font-family="' +
        fsPrimary +
        '" font-size="' +
        fitBhs.fontSize +
        '" font-weight="' +
        wp +
        '"' +
        ls1Single +
        it1 +
        ' fill="' +
        fg +
        '">' +
        escXml(single) +
        '</text>';
    }

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Station name logo">\n' +
      defs +
      '\n  <rect width="512" height="512" rx="' +
      r +
      '" fill="' +
      bg +
      '"/>\n  ' +
      gloss +
      '\n  ' +
      shapes +
      '\n  ' +
      text +
      '\n</svg>'
    );
  }

  function renderThumbLayout(spec) {
    var family = spec.family;
    var variant = spec.variant;
    var es = spec.eraStyle;
    var brand = spec.brand;
    var fg = spec.palette.fg;
    var bg = spec.palette.bg;
    var ac = spec.palette.ac;
    var ac2 = spec.palette.ac2;
    var era = spec.era;
    var dial = spec.dial;
    var band = spec.band;
    var callDisplay = spec.callDisplay;
    var formatLabel = spec.formatLabel;
    var year = spec.year;
    var typo = spec.typography;
    if (!typo) {
      typo = mergeTypographyRules(getConfig(), spec.family, spec.era, spec.seed, spec.variant, spec.fonts.weightPrimary, spec.fonts.weightSecondary, {});
    }
    var lm = (es.letterMult != null ? es.letterMult : 1) * (1 + (typo.letterMultBoost || 0));
    var freqSc = es.freqScale != null ? es.freqScale : 1;
    var fsP = spec.fonts.primaryStack;
    var fsS = spec.fonts.secondaryStack;
    var wp = spec.fonts.weightPrimary;
    var ws = spec.fonts.weightSecondary;
    var arch = spec.layoutArchetype || 'default';
    var italicMode = spec.italicMode != null ? spec.italicMode : 'none';
    var itFirst =
      italicMode === 'primary'
        ? ' font-style="italic"'
        : italicMode === 'none' && typo.italicPrimary
          ? ' font-style="italic"'
          : '';
    var itSecond =
      italicMode === 'secondary'
        ? ' font-style="italic"'
        : italicMode === 'none' && typo.italicSecondary
          ? ' font-style="italic"'
          : '';
    var itBrand = itFirst;
    var itSec = itSecond;

    var brandE = escXml(brand);
    var freq = escXml(freqLine(dial, band));
    var callE = escXml(callDisplay.replace(/-/g, '‑'));
    var fmtE = escXml(formatLabel.length > 22 ? formatLabel.slice(0, 20) + '…' : formatLabel);
    var tagE = escXml(es.tag || 'LIVE');
    var yrE = escXml(String(year));

    var fsBrand = fitBrandFontSize(brand, 56, 28, lm) * (typo.thumbBrandScale != null ? typo.thumbBrandScale : 1);
    var fsCall = Math.round(34 * lm * (typo.thumbCallScale != null ? typo.thumbCallScale : 1));
    var fsSmall =
      (era === '2010s+' ? Math.round(20 * freqSc) : Math.round(22 * freqSc)) *
      (typo.thumbFreqScale != null ? typo.thumbFreqScale : 1);

    var lsB = letterSpacingAttr(thumbTrackEm(typo, 'brand', arch));
    var lsC = letterSpacingAttr(thumbTrackEm(typo, 'call', arch));
    var lsF = letterSpacingAttr(thumbTrackEm(typo, 'freq', arch));
    var lsFmt = letterSpacingAttr(thumbTrackEm(typo, 'fmt', arch));

    var gloss =
      es.glow > 0
        ? '<ellipse cx="256" cy="120" rx="220" ry="100" fill="url(#wlGloss)" opacity="' + es.glow + '"/>'
        : '';
    var defs =
      '<defs>\n  <linearGradient id="wlGloss" x1="0%" y1="0%" x2="0%" y2="100%">\n    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>\n    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>\n  </linearGradient>\n</defs>';

    var r = es.r != null ? es.r : 8;
    var rule = es.rule != null ? es.rule : 4;
    var ls = spec.layoutStructure || {};
    var fl = ls.frameLayers != null ? ls.frameLayers : 0;
    var tAnch = skewHeroCoords(heroCoordsForArchetype(typo, arch, family), ls, spec.seed, family);
    var tbx = tAnch.xs;
    var tba = tAnch.as;

    var shapes = '';
    var textBlock = '';

    switch (family) {
      case 'hit':
      case 'rhythmic': {
        if (arch === 'broadcastSans') {
          var inlChr = escXml(
            String(freqLine(dial, band) + ' ' + callDisplay.replace(/-/g, ' ')).trim().slice(0, 28)
          );
          var bsChr = buildBroadcastSansThumb({
            spec: spec,
            family: family,
            fg: fg,
            ac: ac,
            ac2: ac2,
            fsP: fsP,
            fsS: fsS,
            wp: wp,
            ws: ws,
            tbx: tbx,
            tba: tba,
            lsB: lsB,
            lsC: lsC,
            lsF: lsF,
            lsFmt: lsFmt,
            itFirst: itFirst,
            itSecond: itSecond,
            brandE: brandE,
            freq: freq,
            callE: callE,
            fmtE: fmtE,
            fsBrand: fsBrand,
            fsCall: fsCall,
            fsSmall: fsSmall,
            inlineEsc: inlChr,
          });
          shapes = bsChr.shapes;
          textBlock = bsChr.textBlock;
          break;
        }
        var chrTx = (spec.seed >>> 11) % 5 - 2;
        if (arch === 'brandHero') {
          shapes =
            '<rect x="' +
            (36 + chrTx) +
            '" y="' +
            (34 + ((spec.seed >>> 13) % 3)) +
            '" width="440" height="440" rx="' +
            (r + 4) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="' +
            Math.max(3, rule) +
            '"/>\n  <polygon points="0,0 130,0 85,512 0,512" fill="' +
            ac +
            '" opacity="0.32"/>';
        } else if (arch === 'diagonalBlock') {
          shapes =
            '<polygon points="0,512 512,40 512,512" fill="' +
            ac2 +
            '" opacity="0.28"/>\n  <polygon points="0,0 190,0 0,260" fill="' +
            ac +
            '" opacity="0.76"/>';
        } else if (arch === 'textBar') {
          shapes =
            '<rect x="0" y="0" width="512" height="24" fill="' +
            ac +
            '"/>\n  <rect x="0" y="488" width="512" height="24" fill="' +
            ac2 +
            '"/>\n  <line x1="18" y1="78" x2="494" y2="78" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 3) +
            '"/>';
        } else if (arch === 'sleekStrip' && family === 'rhythmic') {
          shapes =
            '<rect x="16" y="92" width="480" height="8" fill="' +
            ac +
            '"/>\n  <rect x="16" y="412" width="480" height="6" fill="' +
            ac2 +
            '"/>\n  <line x1="32" y1="256" x2="480" y2="256" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.28"/>';
        } else if (arch === 'freqHero') {
          shapes =
            '<rect x="0" y="478" width="512" height="34" fill="' +
            ac +
            '" opacity="0.82"/>\n  <line x1="0" y1="104" x2="148" y2="0" stroke="' +
            ac2 +
            '" stroke-width="3" opacity="0.32"/>';
        } else if (arch === 'textOnlyStrike') {
          shapes =
            '<line x1="40" y1="86" x2="396" y2="86" stroke="' +
            ac +
            '" stroke-width="4" opacity="0.42"/>\n  <line x1="52" y1="414" x2="488" y2="414" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.3"/>';
        } else if (arch === 'freqTitan') {
          shapes =
            '<line x1="40" y1="58" x2="472" y2="58" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 8) +
            '"/>\n  <line x1="40" y1="78" x2="296" y2="78" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.36"/>';
        } else {
          var cut = variant % 2 === 0;
          shapes = cut
            ? '<polygon points="0,0 140,0 100,512 0,512" fill="' +
              ac +
              '"/>\n  <polygon points="512,0 512,180 380,0" fill="' +
              ac2 +
              '" opacity="0.78"/>'
            : '<rect x="0" y="0" width="512" height="18" fill="' +
              ac +
              '"/>\n  <rect x="0" y="494" width="512" height="18" fill="' +
              ac2 +
              '"/>\n  <line x1="24" y1="80" x2="488" y2="80" stroke="' +
              ac +
              '" stroke-width="' +
              (rule + 4) +
              '"/>';
        }
        var ms0 = thumbMicroShift(spec.seed, 0);
        var ms1 = thumbMicroShift(spec.seed, 1);
        var ms2 = thumbMicroShift(spec.seed, 2);
        if (arch === 'textOnlyStrike' || arch === 'freqTitan') {
          var txL = tba === 'start' ? 48 + ms0 : tbx;
          if (arch === 'freqTitan') {
            var fTit = Math.min(88, Math.round(fsSmall * 2.36));
            var bSmall = Math.round(fsBrand * 0.5);
            var maxWT = maxTextWidthThumb(tba, txL, arch);
            var fpThumb = spec.fonts.primary || 'Inter';
            var fsThumb = spec.fonts.secondary || 'Inter';
            var teTf = thumbTrackEm(typo, 'freq', arch);
            var teTb = thumbTrackEm(typo, 'brand', arch);
            var teTc = thumbTrackEm(typo, 'call', arch);
            var teTm = thumbTrackEm(typo, 'fmt', arch);
            var dialStrT = freqLine(dial, band);
            var callStrT = String(callDisplay || '').replace(/-/g, ' ');
            fTit = fitTextToMaxWidth(dialStrT, fTit, maxWT, 22, 88, teTf, fpThumb, '', arch).fontSize;
            bSmall = fitTextToMaxWidth(brand, bSmall, maxWT, 12, bSmall + 10, teTb, fpThumb, itBrand, arch).fontSize;
            var fsCallTit = fitTextToMaxWidth(
              callStrT,
              Math.round(fsCall * 0.82),
              maxWT,
              11,
              Math.round(fsCall * 0.9),
              teTc,
              fsThumb,
              itSec,
              arch
            ).fontSize;
            var fmtShortTit = fitTertiaryPlainText(formatLabel, maxWT, 15, fsThumb, teTm, arch, itSec);
            textBlock =
              '<text x="' +
              txL +
              '" y="' +
              (194 + ms1) +
              '" text-anchor="' +
              tba +
              '" font-family="' +
              fsP +
              '" font-size="' +
              fTit +
              '" font-weight="' +
              wp +
              '"' +
              lsF +
              ' fill="' +
              fg +
              '">' +
              freq +
              '</text>\n  <text x="' +
              txL +
              '" y="' +
              (276 + ms2) +
              '" text-anchor="' +
              tba +
              '" font-family="' +
              fsS +
              '" font-size="' +
              bSmall +
              '" font-weight="' +
              ws +
              '"' +
              lsB +
              itBrand +
              ' fill="' +
              ac2 +
              '">' +
              brandE +
              '</text>\n  <text x="' +
              txL +
              '" y="' +
              (330 + ms1) +
              '" text-anchor="' +
              tba +
              '" font-family="' +
              fsS +
              '" font-size="' +
              fsCallTit +
              '" font-weight="' +
              ws +
              '"' +
              lsC +
              itSec +
              ' fill="' +
              ac +
              '">' +
              callE +
              '</text>';
            if (fmtShortTit) {
              textBlock +=
                '\n  <text x="' +
                txL +
                '" y="' +
                (392 + ms2) +
                '" text-anchor="' +
                tba +
                '" font-family="' +
                fsS +
                '" font-size="' +
                fitTextToMaxWidth(fmtShortTit, 15, maxWT, 10, 16, teTm, fsThumb, itSec, arch).fontSize +
                '" fill="' +
                fg +
                '"' +
                lsFmt +
                ' opacity="0.82">' +
                escXml(fmtShortTit) +
                '</text>';
            }
          } else {
            var maxWOS = maxTextWidthThumb(tba, txL, arch);
            var fpOS = spec.fonts.primary || 'Inter';
            var fsOS = spec.fonts.secondary || 'Inter';
            var teOb = thumbTrackEm(typo, 'brand', arch);
            var teOc = thumbTrackEm(typo, 'call', arch);
            var teOf = thumbTrackEm(typo, 'freq', arch);
            var teOm = thumbTrackEm(typo, 'fmt', arch);
            var callStrOS = String(callDisplay || '').replace(/-/g, ' ');
            var dialStrOS = freqLine(dial, band);
            var fsBrandOS = fitTextToMaxWidth(brand, Math.min(fsBrand, 52), maxWOS, 16, 54, teOb, fpOS, itBrand, arch).fontSize;
            var fsCallOS = fitTextToMaxWidth(callStrOS, fsCall, maxWOS, 12, fsCall + 6, teOc, fsOS, itSec, arch).fontSize;
            var fsFreqOS = fitTextToMaxWidth(
              dialStrOS,
              Math.round(fsSmall * 1.12),
              maxWOS,
              14,
              Math.round(fsSmall * 1.2),
              teOf,
              fsOS,
              '',
              arch
            ).fontSize;
            var fmtShortOS = fitTertiaryPlainText(formatLabel, maxWOS, 15, fsOS, teOm, arch, itSec);
            textBlock =
              '<text x="' +
              txL +
              '" y="' +
              (206 + ms1) +
              '" text-anchor="' +
              tba +
              '" font-family="' +
              fsP +
              '" font-size="' +
              fsBrandOS +
              '" font-weight="' +
              wp +
              '"' +
              lsB +
              itBrand +
              ' fill="' +
              fg +
              '">' +
              brandE +
              '</text>\n  <text x="' +
              txL +
              '" y="' +
              (270 + ms2) +
              '" text-anchor="' +
              tba +
              '" font-family="' +
              fsS +
              '" font-size="' +
              fsCallOS +
              '" font-weight="' +
              ws +
              '"' +
              lsC +
              itSec +
              ' fill="' +
              ac2 +
              '">' +
              callE +
              '</text>\n  <text x="' +
              txL +
              '" y="' +
              (326 + ms1) +
              '" text-anchor="' +
              tba +
              '" font-family="' +
              fsS +
              '" font-size="' +
              fsFreqOS +
              '" font-weight="' +
              wp +
              '"' +
              lsF +
              ' fill="' +
              ac +
              '">' +
              freq +
              '</text>';
            if (fmtShortOS) {
              textBlock +=
                '\n  <text x="' +
                txL +
                '" y="' +
                (398 + ms2) +
                '" text-anchor="' +
                tba +
                '" font-family="' +
                fsS +
                '" font-size="' +
                fitTextToMaxWidth(fmtShortOS, 15, maxWOS, 10, 16, teOm, fsOS, itSec, arch).fontSize +
                '" fill="' +
                fg +
                '"' +
                lsFmt +
                ' opacity="0.78">' +
                escXml(fmtShortOS) +
                '</text>';
            }
          }
        } else {
          var freqRectX = tba === 'start' ? 56 + ms0 : 156;
          var freqRectW = tba === 'start' ? 400 : 200;
          var fsFreqUse = arch === 'freqHero' ? Math.min(84, Math.round(fsSmall * 1.58)) : fsSmall;
          var yBrand = arch === 'freqHero' ? 212 + variant * 3 + ms1 : 220 + variant * 4 + ms1;
          var yCall = arch === 'freqHero' ? 292 + ms2 : 300 + ms2;
          var yFreq = arch === 'freqHero' ? 358 + ms1 : 362 + ms1;
          var yFmt = arch === 'freqHero' ? 424 + ms2 : 430 + ms2;
          var maxWR = maxTextWidthThumb(tba, tbx, arch);
          var fpR = spec.fonts.primary || 'Inter';
          var fsR = spec.fonts.secondary || 'Inter';
          var teRb = thumbTrackEm(typo, 'brand', arch);
          var teRc = thumbTrackEm(typo, 'call', arch);
          var teRf = thumbTrackEm(typo, 'freq', arch);
          var teRm = thumbTrackEm(typo, 'fmt', arch);
          var callStrR = String(callDisplay || '').replace(/-/g, ' ');
          var dialStrR = freqLine(dial, band);
          var fsBrandFit = fitTextToMaxWidth(brand, fsBrand, maxWR, 18, fsBrand + 6, teRb, fpR, itBrand, arch).fontSize;
          var fsCallFit = fitTextToMaxWidth(callStrR, fsCall, maxWR, 14, fsCall + 8, teRc, fsR, itSec, arch).fontSize;
          var maxWFreq = Math.min(maxWR, freqRectW * 0.88);
          fsFreqUse = fitTextToMaxWidth(dialStrR, fsFreqUse, maxWFreq, 11, fsFreqUse + 10, teRf, fsR, '', arch).fontSize;
          var fmtShortR = fitTertiaryPlainText(formatLabel, maxWR, 16, fsR, teRm, arch, itSec);
          textBlock =
            '<text x="' +
            tbx +
            '" y="' +
            yBrand +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            fsBrandFit +
            '" font-weight="' +
            wp +
            '"' +
            lsB +
            itBrand +
            ' fill="' +
            fg +
            '">' +
            brandE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            yCall +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="' +
            fsCallFit +
            '" font-weight="' +
            ws +
            '"' +
            lsC +
            itSec +
            ' fill="' +
            ac2 +
            '">' +
            callE +
            '</text>\n  <rect x="' +
            freqRectX +
            '" y="' +
            (arch === 'freqHero' ? 324 + ms0 : 330 + ms0) +
            '" rx="' +
            r +
            '" width="' +
            freqRectW +
            '" height="44" fill="' +
            ac +
            '" opacity="0.92"/>\n  <text x="' +
            tbx +
            '" y="' +
            yFreq +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="' +
            fsFreqUse +
            '" font-weight="' +
            ws +
            '"' +
            lsF +
            ' fill="' +
            bg +
            '">' +
            freq +
            '</text>';
          if (fmtShortR) {
            textBlock +=
              '\n  <text x="' +
              tbx +
              '" y="' +
              yFmt +
              '" text-anchor="' +
              tba +
              '" font-family="' +
              fsS +
              '" font-size="' +
              fitTextToMaxWidth(fmtShortR, 16, maxWR, 10, 18, teRm, fsR, itSec, arch).fontSize +
              '" fill="' +
              ac +
              '"' +
              lsFmt +
              ' opacity="0.85">' +
              escXml(fmtShortR) +
              '</text>';
          }
        }
        break;
      }
      case 'country': {
        if (arch === 'horizontalWord') {
          shapes =
            '<rect x="28" y="188" width="456" height="132" rx="' +
            (r + 8) +
            '" fill="' +
            ac +
            '" opacity="0.15"/>\n  <line x1="36" y1="186" x2="476" y2="186" stroke="' +
            ac2 +
            '" stroke-width="4"/>';
        } else if (arch === 'openWordmark') {
          shapes =
            '<line x1="48" y1="242" x2="464" y2="242" stroke="' +
            ac2 +
            '" stroke-width="3"/>\n  <line x1="48" y1="248" x2="292" y2="248" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.48"/>';
        } else if (arch === 'stackHeritage') {
          shapes =
            '<path d="M 48 368 Q 256 428 464 368" fill="none" stroke="' +
            ac +
            '" stroke-width="5" opacity="0.28"/>\n  <line x1="64" y1="114" x2="120" y2="114" stroke="' +
            ac2 +
            '" stroke-width="2"/>';
        } else if (arch === 'badgeSeal') {
          shapes =
            '<circle cx="256" cy="256" r="236" fill="none" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 4) +
            '"/>\n  <circle cx="256" cy="256" r="196" fill="none" stroke="' +
            ac2 +
            '" stroke-width="2"/>';
        } else {
          shapes =
            '<circle cx="256" cy="256" r="232" fill="none" stroke="' +
            ac +
            '" stroke-width="' +
            rule +
            '"/>\n  <circle cx="256" cy="256" r="210" fill="' +
            bg +
            '" stroke="' +
            ac2 +
            '" stroke-width="4"/>' +
            (variant === 0
              ? '<path d="M 40 380 Q 256 440 472 380" fill="none" stroke="' + ac + '" stroke-width="8" opacity="0.5"/>'
              : '');
        }
        textBlock =
          '<text x="' +
          tbx +
          '" y="200" text-anchor="' +
          tba +
          '" font-family="' +
          fsP +
          '" font-size="' +
          Math.min(fsBrand, 48) +
          '" font-weight="' +
          wp +
          '"' +
          lsB +
          itBrand +
          ' fill="' +
          fg +
          '">' +
          brandE +
          '</text>\n  <text x="' +
          tbx +
          '" y="258" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="' +
          fsCall +
          '" font-weight="' +
          ws +
          '"' +
          lsC +
          itSec +
          ' fill="' +
          ac +
          '">' +
          callE +
          '</text>\n  <text x="' +
          tbx +
          '" y="312" text-anchor="' +
          tba +
          '" font-family="' +
          fsP +
          '" font-size="' +
          fsSmall +
          '"' +
          lsF +
          ' fill="' +
          ac2 +
          '">' +
          freq +
          '</text>\n  <text x="' +
          tbx +
          '" y="360" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="15" fill="' +
          fg +
          '"' +
          lsFmt +
          ' opacity="0.75">' +
          fmtE +
          '</text>';
        break;
      }
      case 'gospel': {
        if (arch === 'horizontalWord') {
          shapes =
            '<rect x="32" y="196" width="448" height="124" rx="' +
            (r + 10) +
            '" fill="' +
            ac +
            '" opacity="0.12"/>\n  <line x1="40" y1="194" x2="472" y2="194" stroke="' +
            ac2 +
            '" stroke-width="3"/>';
        } else if (arch === 'softCard') {
          shapes =
            '<rect x="40" y="40" width="432" height="432" rx="' +
            (r + 14) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.5"/>\n  <line x1="72" y1="404" x2="440" y2="404" stroke="' +
            ac2 +
            '" stroke-width="' +
            rule +
            '" opacity="0.4"/>';
        } else if (arch === 'softHeritage') {
          shapes =
            '<line x1="256" y1="44" x2="256" y2="84" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.45"/>\n  <line x1="44" y1="408" x2="468" y2="408" stroke="' +
            ac +
            '" stroke-width="' +
            rule +
            '" opacity="0.34"/>';
        } else {
          shapes =
            '<line x1="256" y1="40" x2="256" y2="88" stroke="' +
            ac2 +
            '" stroke-width="3" opacity="0.5"/>\n  <line x1="216" y1="64" x2="296" y2="64" stroke="' +
            ac2 +
            '" stroke-width="3" opacity="0.5"/>\n  <rect x="36" y="36" width="440" height="440" rx="' +
            (r + 12) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="3" opacity="0.45"/>';
        }
        textBlock =
          '<text x="' +
          tbx +
          '" y="204" text-anchor="' +
          tba +
          '" font-family="' +
          fsP +
          '" font-size="' +
          Math.min(fsBrand, 46) +
          '" font-weight="' +
          wp +
          '"' +
          lsB +
          itBrand +
          ' fill="' +
          fg +
          '">' +
          brandE +
          '</text>\n  <text x="' +
          tbx +
          '" y="262" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="' +
          fsCall +
          '" font-weight="' +
          ws +
          '"' +
          lsC +
          itSec +
          ' fill="' +
          ac +
          '">' +
          callE +
          '</text>\n  <text x="' +
          tbx +
          '" y="318" text-anchor="' +
          tba +
          '" font-family="' +
          fsP +
          '" font-size="' +
          fsSmall +
          '"' +
          lsF +
          ' fill="' +
          ac2 +
          '">' +
          freq +
          '</text>\n  <text x="' +
          tbx +
          '" y="368" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="15" fill="' +
          fg +
          '"' +
          lsFmt +
          ' opacity="0.78">' +
          fmtE +
          '</text>';
        break;
      }
      case 'news': {
        var nw70 = era === '1970s';
        var nw8090 = era === '1980s' || era === '1990s';
        var nw2000 = era === '2000s';
        var nw10 = era === '2010s+';
        var nwBlock = nw8090 || nw2000;
        if (arch === 'broadcastSans') {
          var inlNw = escXml(
            String(freqLine(dial, band) + ' ' + callDisplay.replace(/-/g, ' ')).trim().slice(0, 28)
          );
          var bsNw = buildBroadcastSansThumb({
            spec: spec,
            family: 'news',
            fg: fg,
            ac: ac,
            ac2: ac2,
            fsP: fsP,
            fsS: fsS,
            wp: wp,
            ws: ws,
            tbx: tbx,
            tba: tba,
            lsB: lsB,
            lsC: lsC,
            lsF: lsF,
            lsFmt: lsFmt,
            itFirst: itFirst,
            itSecond: itSecond,
            brandE: brandE,
            freq: freq,
            callE: callE,
            fmtE: fmtE,
            fsBrand: fsBrand,
            fsCall: fsCall,
            fsSmall: fsSmall,
            inlineEsc: inlNw,
          });
          shapes = bsNw.shapes;
          textBlock = bsNw.textBlock;
          break;
        }
        if (arch === 'masthead') {
          if (nw70) {
            shapes =
              '<line x1="0" y1="70" x2="512" y2="70" stroke="' +
              ac +
              '" stroke-width="2" opacity="0.88"/>\n  <line x1="36" y1="394" x2="476" y2="394" stroke="' +
              ac2 +
              '" stroke-width="' +
              Math.max(2, rule - 1) +
              '"/>';
          } else if (nw10) {
            shapes =
              '<rect x="0" y="0" width="512" height="42" fill="' +
              ac +
              '" opacity="0.94"/>\n  <line x1="36" y1="396" x2="476" y2="396" stroke="' +
              ac2 +
              '" stroke-width="2" opacity="0.4"/>';
          } else {
            shapes =
              '<rect x="0" y="0" width="512" height="' +
              (nw8090 ? 68 : 64) +
              '" fill="' +
              ac +
              '"/>\n  <line x1="36" y1="392" x2="476" y2="392" stroke="' +
              ac2 +
              '" stroke-width="' +
              (nw8090 ? rule + 2 : rule) +
              '"/>';
          }
        } else if (arch === 'freqMinimal') {
          shapes =
            '<line x1="40" y1="104" x2="472" y2="104" stroke="' +
            ac +
            '" stroke-width="' +
            (nw70 ? Math.max(2, rule - 1) : nw8090 ? Math.max(6, rule + 2) : Math.max(4, rule)) +
            '"/>\n  <line x1="40" y1="118" x2="' +
            (nw8090 ? '400' : '320') +
            '" y2="118" stroke="' +
            ac2 +
            '" stroke-width="' +
            (nw70 ? '1' : '2') +
            '" opacity="' +
            (nw70 ? '0.4' : nw10 ? '0.36' : '0.45') +
            '"/>';
        } else if (arch === 'plainMast') {
          shapes =
            '<line x1="44" y1="86" x2="' +
            (nw70 ? '340' : '376') +
            '" y2="86" stroke="' +
            ac +
            '" stroke-width="' +
            (nw70 ? '2' : '2') +
            '"/>\n  <line x1="44" y1="406" x2="352" y2="406" stroke="' +
            ac2 +
            '" stroke-width="' +
            (nwBlock ? rule + 1 : rule) +
            '"/>';
        } else if (arch === 'numericLed') {
          shapes =
            '<line x1="40" y1="78" x2="472" y2="78" stroke="' +
            ac +
            '" stroke-width="' +
            (nw70
              ? Math.max(4, rule)
              : nw8090
                ? Math.max(8, rule + 4)
                : Math.max(5, rule + 2)) +
            '"/>\n  <line x1="40" y1="96" x2="' +
            (nw8090 ? '360' : '328') +
            '" y2="96" stroke="' +
            ac2 +
            '" stroke-width="' +
            (nw70 ? '1' : '2') +
            '" opacity="' +
            (nw10 ? '0.36' : '0.42') +
            '"/>';
        } else {
          var tag2010T = nw10 && (spec.seed >>> 3) % 4 !== 0;
          if (nw70) {
            shapes =
              '<rect x="32" y="32" width="448" height="448" rx="' +
              r +
              '" fill="none" stroke="' +
              ac +
              '" stroke-width="' +
              Math.max(2, rule - 1) +
              '" opacity="0.7"/>\n  <line x1="48" y1="88" x2="464" y2="88" stroke="' +
              ac2 +
              '" stroke-width="' +
              Math.max(2, rule - 1) +
              '"/>';
          } else if (nw10) {
            shapes =
              '<rect x="32" y="32" width="448" height="448" rx="' +
              Math.max(4, r - 2) +
              '" fill="none" stroke="' +
              ac +
              '" stroke-width="2" opacity="0.5"/>\n  <line x1="48" y1="88" x2="464" y2="88" stroke="' +
              ac2 +
              '" stroke-width="2" opacity="0.46"/>' +
              (tag2010T
                ? '\n  <rect x="48" y="48" width="120" height="36" fill="' +
                  ac +
                  '"/>\n  <text x="108" y="73" text-anchor="middle" font-family="' +
                  fsS +
                  '" font-size="14" font-weight="' +
                  ws +
                  '" fill="' +
                  bg +
                  '">' +
                  tagE +
                  '</text>'
                : '');
          } else {
            shapes =
              '<rect x="32" y="32" width="448" height="448" rx="' +
              r +
              '" fill="none" stroke="' +
              ac +
              '" stroke-width="' +
              Math.max(3, rule - 1) +
              '"/>\n  <line x1="48" y1="88" x2="464" y2="88" stroke="' +
              ac2 +
              '" stroke-width="' +
              rule +
              '"/>';
            if (nwBlock) {
              shapes +=
                '\n  <rect x="48" y="48" width="120" height="36" fill="' +
                ac +
                '"/>\n  <text x="108" y="73" text-anchor="middle" font-family="' +
                fsS +
                '" font-size="14" font-weight="' +
                ws +
                '" fill="' +
                bg +
                '">' +
                tagE +
                '</text>';
            }
          }
        }
        var nMs = thumbMicroShift(spec.seed, 4);
        var nM2 = thumbMicroShift(spec.seed, 5);
        if (arch === 'numericLed') {
          var fNews = Math.min(
            82,
            Math.round(fsSmall * (nw8090 ? 2.22 : nw70 ? 1.96 : nw10 ? 2.08 : 2.12))
          );
          textBlock =
            '<text x="' +
            tbx +
            '" y="' +
            (184 + nMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            fNews +
            '" font-weight="' +
            wp +
            '"' +
            lsF +
            ' fill="' +
            fg +
            '">' +
            freq +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (258 + nM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            Math.round(fsBrand * 0.72) +
            '" font-weight="' +
            wp +
            '"' +
            lsB +
            ' fill="' +
            ac2 +
            '">' +
            brandE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (302 + nMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="17" font-weight="' +
            ws +
            '"' +
            lsC +
            ' fill="' +
            ac +
            '">' +
            callE +
            '</text>\n  <line x1="' +
            (88 + nM2) +
            '" y1="328" x2="' +
            (424 + nMs) +
            '" y2="328" stroke="' +
            ac2 +
            '" stroke-width="' +
            Math.max(2, rule - 1) +
            '"/>\n  <text x="' +
            tbx +
            '" y="' +
            (378 + nM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="15" fill="' +
            ac +
            '"' +
            lsFmt +
            ' opacity="0.78">' +
            fmtE +
            '</text>';
        } else if (arch === 'plainMast') {
          textBlock =
            '<text x="' +
            tbx +
            '" y="' +
            (198 + nMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            Math.round(fsBrand * 0.92) +
            '" font-weight="' +
            wp +
            '"' +
            lsB +
            ' fill="' +
            fg +
            '">' +
            brandE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (248 + nM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="17" font-weight="' +
            ws +
            '"' +
            lsC +
            ' fill="' +
            ac +
            '">' +
            callE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (308 + nMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="' +
            fsSmall +
            '" font-weight="' +
            ws +
            '"' +
            lsF +
            ' fill="' +
            fg +
            '">' +
            freq +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (372 + nM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="15" fill="' +
            ac +
            '"' +
            lsFmt +
            ' opacity="0.72">' +
            fmtE +
            '</text>';
        } else {
          textBlock =
            '<text x="' +
            tbx +
            '" y="' +
            (200 + nMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            fsBrand +
            '" font-weight="' +
            wp +
            '"' +
            lsB +
            ' fill="' +
            fg +
            '">' +
            brandE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (250 + nM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="18" font-weight="' +
            ws +
            '"' +
            lsC +
            ' fill="' +
            ac +
            '">' +
            callE +
            '</text>\n  <line x1="' +
            (96 + nMs) +
            '" y1="278" x2="' +
            (416 + nM2) +
            '" y2="278" stroke="' +
            ac2 +
            '" stroke-width="' +
            rule +
            '"/>\n  <text x="' +
            tbx +
            '" y="' +
            (330 + nMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="' +
            fsSmall +
            '" font-weight="' +
            ws +
            '"' +
            lsF +
            ' fill="' +
            fg +
            '">' +
            freq +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (390 + nM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="15" fill="' +
            ac +
            '"' +
            lsFmt +
            ' opacity="0.8">' +
            fmtE +
            '</text>';
        }
        break;
      }
      case 'sports': {
        if (arch === 'broadcastSans') {
          var inlSp = escXml(
            String(freqLine(dial, band) + ' ' + callDisplay.replace(/-/g, ' ')).trim().slice(0, 28)
          );
          var bsSp = buildBroadcastSansThumb({
            spec: spec,
            family: 'sports',
            fg: fg,
            ac: ac,
            ac2: ac2,
            fsP: fsP,
            fsS: fsS,
            wp: wp,
            ws: ws,
            tbx: tbx,
            tba: tba,
            lsB: lsB,
            lsC: lsC,
            lsF: lsF,
            lsFmt: lsFmt,
            itFirst: itFirst,
            itSecond: itSecond,
            brandE: brandE,
            freq: freq,
            callE: callE,
            fmtE: fmtE,
            fsBrand: fsBrand,
            fsCall: fsCall,
            fsSmall: fsSmall,
            inlineEsc: inlSp,
          });
          shapes = bsSp.shapes;
          textBlock = bsSp.textBlock;
          break;
        }
        var sportsRadioPanelT = arch === 'shieldBadge' && (spec.seed >>> 9) % 5 < 2;
        if (sportsRadioPanelT) {
          shapes =
            '<rect x="20" y="104" width="472" height="304" rx="' +
            Math.max(6, r) +
            '" fill="' +
            bg +
            '" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 4) +
            '"/>\n  <line x1="32" y1="148" x2="480" y2="148" stroke="' +
            ac2 +
            '" stroke-width="3" opacity="0.34"/>';
        } else {
          var sh =
            arch === 'bannerStack'
              ? 'M 32 128 L 480 128 L 452 420 L 60 420 Z'
              : arch === 'angularLockup'
                ? 'M 256 36 L 468 150 L 412 468 L 100 468 L 44 150 Z'
                : variant === 0
                  ? 'M 256 40 L 440 120 L 400 420 L 112 420 L 72 120 Z'
                  : 'M 256 48 L 452 160 L 380 452 L 132 452 L 60 160 Z';
          shapes =
            '<path d="' +
            sh +
            '" fill="' +
            bg +
            '" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 2) +
            '"/>\n  <path d="M 256 100 L 380 200 L 340 380 L 172 380 L 132 200 Z" fill="' +
            ac +
            '" opacity="0.1"/>' +
            (arch === 'bannerStack'
              ? '<rect x="48" y="144" width="416" height="32" fill="' + ac + '" opacity="0.3"/>'
              : '');
        }
        textBlock =
          '<text x="' +
          tbx +
          '" y="220" text-anchor="' +
          tba +
          '" font-family="' +
          fsP +
          '" font-size="' +
          fsBrand +
          '" font-weight="' +
          wp +
          '"' +
          lsB +
          itBrand +
          ' fill="' +
          fg +
          '">' +
          brandE +
          '</text>\n  <text x="' +
          tbx +
          '" y="290" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="' +
          fsCall +
          '" font-weight="' +
          ws +
          '"' +
          lsC +
          itSec +
          ' fill="' +
          ac +
          '">' +
          callE +
          '</text>\n  <text x="' +
          tbx +
          '" y="350" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="' +
          fsSmall +
          '" font-weight="' +
          ws +
          '"' +
          lsF +
          ' fill="' +
          ac2 +
          '">' +
          freq +
          '</text>\n  <text x="' +
          tbx +
          '" y="410" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="14" fill="' +
          fg +
          '"' +
          lsFmt +
          ' opacity="0.7">' +
          fmtE +
          '</text>';
        break;
      }
      case 'rock': {
        if (arch === 'stackedSlab') {
          shapes =
            '<rect x="0" y="96" width="512" height="40" fill="' +
            ac +
            '" opacity="0.5"/>\n  <rect x="0" y="376" width="512" height="48" fill="' +
            ac2 +
            '" opacity="0.35"/>';
        } else if (arch === 'minimalDark') {
          shapes =
            '<line x1="48" y1="428" x2="464" y2="428" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 6) +
            '"/>';
        } else if (arch === 'slabMinimal') {
          shapes =
            '<rect x="0" y="432" width="512" height="38" fill="' +
            ac +
            '" opacity="0.48"/>';
        } else if (arch === 'freqWall') {
          shapes =
            '<rect x="32" y="92" width="10" height="328" fill="' +
            ac +
            '" opacity="0.58"/>\n  <line x1="56" y1="436" x2="468" y2="436" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.34"/>';
        } else {
          shapes =
            '<polygon points="0,0 512,0 512,512 180,512 0,200" fill="' +
            ac2 +
            '" opacity="0.25"/>\n  <line x1="0" y1="120" x2="512" y2="400" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 4) +
            '" opacity="0.35"/>';
        }
        var rMs = thumbMicroShift(spec.seed, 6);
        var rM2 = thumbMicroShift(spec.seed, 7);
        if (arch === 'freqWall') {
          var fRock = Math.min(78, Math.round(fsSmall * 1.92));
          textBlock =
            '<text x="' +
            tbx +
            '" y="' +
            (196 + rMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            fRock +
            '" font-weight="' +
            wp +
            '"' +
            lsF +
            ' fill="' +
            fg +
            '">' +
            freq +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (278 + rM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            (fsBrand + 2) +
            '" font-weight="' +
            wp +
            '"' +
            lsB +
            itBrand +
            ' fill="' +
            ac2 +
            '">' +
            brandE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (338 + rMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="' +
            fsCall +
            '" font-weight="' +
            ws +
            '"' +
            lsC +
            itSec +
            ' fill="' +
            ac +
            '">' +
            callE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (408 + rM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="15" fill="' +
            fg +
            '"' +
            lsFmt +
            ' opacity="0.52">' +
            fmtE +
            '</text>';
        } else {
          textBlock =
            '<text x="' +
            tbx +
            '" y="' +
            (210 + rMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            (fsBrand + 4) +
            '" font-weight="' +
            wp +
            '"' +
            lsB +
            itBrand +
            ' fill="' +
            fg +
            '">' +
            brandE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (285 + rM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="' +
            fsCall +
            '" font-weight="' +
            ws +
            '"' +
            lsC +
            itSec +
            ' fill="' +
            ac +
            '">' +
            callE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (350 + rMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            fsSmall +
            '" font-weight="' +
            wp +
            '"' +
            lsF +
            ' fill="' +
            ac2 +
            '">' +
            freq +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (420 + rM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="15" fill="' +
            fg +
            '"' +
            lsFmt +
            ' opacity="0.55">' +
            fmtE +
            '</text>';
        }
        break;
      }
      case 'oldies': {
        var oMs = thumbMicroShift(spec.seed, 8);
        var oM2 = thumbMicroShift(spec.seed, 9);
        if (arch === 'plainStack' || arch === 'freqNostalgia') {
          shapes =
            '<line x1="60" y1="108" x2="452" y2="108" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.3"/>\n  <line x1="60" y1="404" x2="452" y2="404" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.26"/>';
          if (arch === 'freqNostalgia') {
            shapes +=
              '\n  <line x1="68" y1="124" x2="200" y2="124" stroke="' + ac2 + '" stroke-width="2" opacity="0.34"/>';
          }
        } else {
          var rays = arch === 'classicWordmark' ? 6 : 8;
          var raysSvg = '';
          var j;
          for (j = 0; j < rays; j++) {
            var a2 = (j / rays) * Math.PI * 2;
            var rad = arch === 'nostalgicFrame' ? 220 : 200;
            var x3 = 256 + Math.cos(a2) * rad;
            var y3 = 256 + Math.sin(a2) * rad;
            raysSvg +=
              '<line x1="256" y1="256" x2="' +
              x3.toFixed(0) +
              '" y2="' +
              y3.toFixed(0) +
              '" stroke="' +
              ac +
              '" stroke-width="3" opacity="' +
            (arch === 'classicWordmark' ? '0.2' : '0.24') +
            '"/>';
        }
        if (arch === 'classicWordmark') {
          shapes =
            '<path d="M 56 148 L 456 132 L 468 188 L 44 188 Z" fill="' +
            ac2 +
            '" opacity="0.36"/>\n  <circle cx="256" cy="256" r="216" fill="none" stroke="' +
            ac +
            '" stroke-width="6"/>\n  ' +
            raysSvg;
          } else {
            shapes =
              '<circle cx="256" cy="256" r="230" fill="none" stroke="' +
              ac2 +
              '" stroke-width="6" opacity="0.4"/>\n  ' +
              raysSvg +
              (arch === 'nostalgicFrame'
                ? '<rect x="28" y="28" width="456" height="456" rx="10" fill="none" stroke="' +
                  ac2 +
                  '" stroke-width="3" opacity="0.35"/>'
                : '');
          }
        }
        if (arch === 'freqNostalgia') {
          var fOld = Math.min(76, Math.round(fsSmall * 1.86));
          textBlock =
            '<text x="' +
            tbx +
            '" y="' +
            (192 + oMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            fOld +
            '" font-weight="' +
            wp +
            '"' +
            lsF +
            ' fill="' +
            fg +
            '">' +
            freq +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (268 + oM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            Math.min(fsBrand, 38) +
            '" font-weight="' +
            wp +
            '"' +
            lsB +
            (itBrand || ' font-style="italic"') +
            ' fill="' +
            ac2 +
            '">' +
            brandE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (318 + oMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="' +
            fsCall +
            '" font-weight="' +
            ws +
            '"' +
            lsC +
            itSec +
            ' fill="' +
            ac +
            '">' +
            callE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (388 + oM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="15" fill="' +
            fg +
            '"' +
            lsFmt +
            ' opacity="0.62">' +
            fmtE +
            '</text>';
        } else if (arch === 'plainStack') {
          textBlock =
            '<text x="' +
            tbx +
            '" y="' +
            (202 + oMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            Math.min(fsBrand, 42) +
            '" font-weight="' +
            wp +
            '"' +
            lsB +
            (itBrand || ' font-style="italic"') +
            ' fill="' +
            fg +
            '">' +
            brandE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (262 + oM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="' +
            fsCall +
            '" font-weight="' +
            ws +
            '"' +
            lsC +
            itSec +
            ' fill="' +
            ac +
            '">' +
            callE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (318 + oMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            fsSmall +
            '"' +
            lsF +
            ' fill="' +
            ac2 +
            '">' +
            freq +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (384 + oM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="15" fill="' +
            fg +
            '"' +
            lsFmt +
            ' opacity="0.6">' +
            fmtE +
            '</text>';
        } else {
          textBlock =
            '<text x="' +
            tbx +
            '" y="' +
            (200 + oMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            Math.min(fsBrand, 46) +
            '" font-weight="' +
            wp +
            '"' +
            lsB +
            (itBrand || ' font-style="italic"') +
            ' fill="' +
            fg +
            '">' +
            brandE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (265 + oM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="' +
            fsCall +
            '" font-weight="' +
            ws +
            '"' +
            lsC +
            itSec +
            ' fill="' +
            ac +
            '">' +
            callE +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (320 + oMs) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsP +
            '" font-size="' +
            fsSmall +
            '"' +
            lsF +
            ' fill="' +
            ac2 +
            '">' +
            freq +
            '</text>\n  <text x="' +
            tbx +
            '" y="' +
            (390 + oM2) +
            '" text-anchor="' +
            tba +
            '" font-family="' +
            fsS +
            '" font-size="15" fill="' +
            fg +
            '"' +
            lsFmt +
            ' opacity="0.65">' +
            fmtE +
            '</text>';
        }
        break;
      }
      case 'urban': {
        if (arch === 'blockContrast') {
          shapes =
            '<rect x="20" y="112" width="232" height="288" fill="' +
            ac +
            '" opacity="0.38"/>\n  <rect x="268" y="52" width="224" height="408" fill="none" stroke="' +
            ac2 +
            '" stroke-width="7"/>\n  <rect x="288" y="72" width="176" height="72" fill="' +
            ac2 +
            '" opacity="0.22"/>';
        } else if (arch === 'diagonalUrban') {
          shapes =
            '<polygon points="0,0 512,0 300,512 0,512" fill="' +
            ac +
            '" opacity="0.42"/>\n  <polygon points="512,0 512,512 180,512 512,140" fill="' +
            ac2 +
            '" opacity="0.28"/>';
        } else {
          shapes =
            '<rect x="36" y="36" width="440" height="440" rx="' +
            Math.max(4, r / 2) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="5"/>\n  <rect x="52" y="52" width="408" height="408" rx="' +
            Math.max(2, r / 3) +
            '" fill="none" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.7"/>' +
            (variant === 1
              ? '<circle cx="420" cy="92" r="8" fill="' +
                ac2 +
                '"/><circle cx="92" cy="420" r="8" fill="' +
                ac +
                '"/>'
              : '');
        }
        textBlock =
          '<text x="' +
          tbx +
          '" y="215" text-anchor="' +
          tba +
          '" font-family="' +
          fsP +
          '" font-size="' +
          fsBrand +
          '" font-weight="' +
          wp +
          '"' +
          lsB +
          itBrand +
          ' fill="' +
          fg +
          '">' +
          brandE +
          '</text>\n  <text x="' +
          tbx +
          '" y="285" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="' +
          fsCall +
          '" font-weight="' +
          ws +
          '"' +
          lsC +
          itSec +
          ' fill="' +
          ac +
          '">' +
          callE +
          '</text>\n  <text x="' +
          tbx +
          '" y="345" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="' +
          fsSmall +
          '" font-weight="' +
          ws +
          '"' +
          lsF +
          ' fill="' +
          ac2 +
          '">' +
          freq +
          '</text>\n  <text x="' +
          tbx +
          '" y="410" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="14" fill="' +
          fg +
          '"' +
          lsFmt +
          ' opacity="0.75">' +
          fmtE +
          '</text>';
        break;
      }
      case 'ac':
      default: {
        if (arch === 'calmMinimal') {
          shapes =
            '<line x1="58" y1="100" x2="454" y2="100" stroke="' +
            ac2 +
            '" stroke-width="1" opacity="0.32"/>\n  <line x1="58" y1="412" x2="454" y2="412" stroke="' +
            ac2 +
            '" stroke-width="1" opacity="0.32"/>';
        } else if (arch === 'freqWhisper') {
          shapes =
            '<line x1="50" y1="86" x2="392" y2="86" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.36"/>\n  <line x1="50" y1="426" x2="462" y2="426" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.3"/>';
        } else if (arch === 'softWordmark') {
          shapes =
            '<line x1="52" y1="88" x2="460" y2="88" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.35"/>\n  <line x1="52" y1="424" x2="460" y2="424" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.35"/>\n  <rect x="44" y="44" width="424" height="424" rx="' +
            (r + 14) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.4"/>';
        } else if (arch === 'serifLockup') {
          shapes =
            '<path d="M 44 44 L 76 44 L 76 76 M 436 44 L 468 44 L 468 76 M 44 436 L 76 436 L 76 468 M 436 436 L 468 436 L 468 468" stroke="' +
            ac2 +
            '" stroke-width="3" fill="none" opacity="0.5"/>\n  <rect x="52" y="52" width="408" height="408" rx="' +
            (r + 6) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.55"/>';
        } else {
          shapes =
            '<rect x="40" y="40" width="432" height="432" rx="' +
            (r + 8) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="3" opacity="0.55"/>\n  <line x1="64" y1="420" x2="448" y2="420" stroke="' +
            ac2 +
            '" stroke-width="' +
            rule +
            '" opacity="0.6"/>';
        }
        var aMs = thumbMicroShift(spec.seed, 10);
        var aM2 = thumbMicroShift(spec.seed, 11);
        var fsSmallAc = arch === 'freqWhisper' ? Math.round(fsSmall * 1.08) : fsSmall;
        textBlock =
          '<text x="' +
          tbx +
          '" y="' +
          (205 + aMs) +
          '" text-anchor="' +
          tba +
          '" font-family="' +
          fsP +
          '" font-size="' +
          Math.min(fsBrand, 50) +
          '" font-weight="' +
          wp +
          '"' +
          lsB +
          itBrand +
          ' fill="' +
          fg +
          '">' +
          brandE +
          '</text>\n  <text x="' +
          tbx +
          '" y="' +
          (275 + aM2) +
          '" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="' +
          (fsCall - 2) +
          '" font-weight="' +
          ws +
          '"' +
          lsC +
          itSec +
          ' fill="' +
          ac +
          '">' +
          callE +
          '</text>\n  <text x="' +
          tbx +
          '" y="' +
          (335 + aMs) +
          '" text-anchor="' +
          tba +
          '" font-family="' +
          fsP +
          '" font-size="' +
          fsSmallAc +
          '"' +
          lsF +
          ' fill="' +
          ac2 +
          '">' +
          freq +
          '</text>\n  <text x="' +
          tbx +
          '" y="' +
          (395 + aM2) +
          '" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="15" fill="' +
          fg +
          '"' +
          lsFmt +
          ' opacity="0.65">' +
          fmtE +
          '</text>';
        break;
      }
    }

    var flExtras = isOpenLayoutArchetype(arch) ? Math.min(fl, 1) : fl;
    shapes += eraLayoutExtras(refineFlExtrasForTaste(flExtras, family, era), r, ac, ac2);

    var subY = 472;
    var sub =
      '<text x="' +
      tbx +
      '" y="' +
      subY +
      '" text-anchor="' +
      tba +
      '" font-family="' +
      fsS +
      '" font-size="13" fill="' +
      fg +
      '" opacity="0.45">' +
      yrE +
      ' · ' +
      escXml(era) +
      '</text>';

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Station logo">\n' +
      defs +
      '\n  <rect width="512" height="512" rx="' +
      r +
      '" fill="' +
      bg +
      '"/>\n  ' +
      gloss +
      '\n  ' +
      shapes +
      '\n  ' +
      textBlock +
      '\n  ' +
      sub +
      '\n</svg>'
    );
  }

  /**
   * @param {object} spec — from generateStationLogoSpec
   * @returns {string} SVG markup
   */
  function renderStationLogoSvg(spec) {
    if (!spec || !spec.palette) return '';
    if (spec.layoutMode === 'brandHero') return buildBrandHeroLayout(spec);
    return renderThumbLayout(spec);
  }

  /**
   * @param {object} input — wlBuildProceduralLogoInput shape
   */
  function build(input) {
    var spec = generateStationLogoSpec(input);
    if (!spec) return '';
    return renderStationLogoSvg(spec) || '';
  }

  global.wlStationLogoSvg = {
    build: build,
    generateStationLogoSpec: generateStationLogoSpec,
    renderStationLogoSvg: renderStationLogoSvg,
    formatToFamily: formatToFamily,
    eraBucket: eraBucket,
    fnv1a: fnv1a,
    getConfig: getConfig,
  };
})(typeof window !== 'undefined' ? window : globalThis);
