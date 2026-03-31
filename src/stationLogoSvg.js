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
      oldies: [{ bg: '#4e342e', fg: '#fff8e1', ac: '#ffb74d', ac2: '#6d4c41' }],
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
      hit: ['freqHero', 'brandHero', 'diagonalBlock', 'textBar'],
      rhythmic: ['sleekStrip', 'freqHero', 'brandHero', 'diagonalBlock'],
      news: ['broadcastBox', 'masthead', 'freqMinimal'],
      country: ['badgeSeal', 'horizontalWord', 'ringMedallion'],
      gospel: ['crossInspire', 'horizontalWord', 'softCard'],
      rock: ['diagonalAggro', 'stackedSlab', 'minimalDark'],
      ac: ['framedCard', 'softWordmark', 'serifLockup'],
      oldies: ['retroBadge', 'classicWordmark', 'nostalgicFrame'],
      urban: ['blockContrast', 'sleekStrip', 'diagonalUrban'],
      sports: ['shieldBadge', 'bannerStack', 'angularLockup'],
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
    if (family === 'news' && String(band).toUpperCase() === 'AM') {
      var fm = list.indexOf('freqMinimal');
      if (fm >= 0 && h % 5 < 3) idx = fm;
    }
    if (family === 'news' && fk.indexOf('PODCAST') >= 0) {
      var mh = list.indexOf('masthead');
      if (mh >= 0 && h % 4 < 2) idx = mh;
    }
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
    if ((family === 'country' || family === 'gospel') && arch === 'horizontalWord') return heroAlignCoords('left');
    if (family === 'ac' && arch === 'softWordmark') return heroAlignCoords('left');
    if (family === 'urban' && arch === 'blockContrast') return heroAlignCoords('asym');
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

  function thumbTrackEm(typo, role) {
    if (role === 'brand') return typo.trackingPrimaryEm || 0;
    if (role === 'fmt') return (typo.trackingSecondaryEm || 0) * 0.55 + 0.008;
    return typo.trackingSecondaryEm || 0;
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
    var weightPrimary = fp.wp != null ? fp.wp : 700;
    var weightSecondary = fp.ws != null ? fp.ws : 600;
    var typo = mergeTypographyRules(cfg, family, era, seed, variant, weightPrimary, weightSecondary, fp);
    var layoutPick = resolveLayoutArchetype(cfg, family, era, seed, variant, variantBump, formatKey, band);
    var fonts = {
      primary: fp.primary,
      secondary: fp.secondary,
      weightPrimary: typo.weightPrimary,
      weightSecondary: typo.weightSecondary,
      italicPrimary: typo.italicPrimary,
      italicSecondary: typo.italicSecondary,
      primaryStack: fontStack(fp.primary),
      secondaryStack: fontStack(fp.secondary),
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
    var resolved;
    if (resolvedRaw.stack) {
      resolved = {
        stack: true,
        line1: applyCasingLine(resolvedRaw.line1, typo.casing),
        line2: applyCasingLine(resolvedRaw.line2, typo.casing),
      };
    } else {
      resolved = { stack: false, single: applyCasingLine(resolvedRaw.single, typo.casing) };
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
      case 'rhythmic':
        if (arch === 'brandHero') {
          shapes =
            '<rect x="40" y="40" width="432" height="432" rx="' +
            (r + 4) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="' +
            Math.max(4, rule) +
            '"/>\n  <polygon points="0,0 140,0 90,512 0,512" fill="' +
            ac +
            '" opacity="0.35"/>';
          y1 = 230;
          y2 = 350;
        } else if (arch === 'diagonalBlock') {
          shapes =
            '<polygon points="0,512 512,0 512,512 0,512" fill="' +
            ac2 +
            '" opacity="0.35"/>\n  <polygon points="0,0 200,0 0,280" fill="' +
            ac +
            '" opacity="0.9"/>\n  <line x1="0" y1="180" x2="512" y2="340" stroke="' +
            ac +
            '" stroke-width="' +
            (rule + 8) +
            '" opacity="0.55"/>';
          y1 = 224;
          y2 = 344;
        } else if (arch === 'textBar') {
          shapes =
            '<rect x="0" y="0" width="512" height="56" fill="' +
            ac +
            '"/>\n  <rect x="0" y="456" width="512" height="56" fill="' +
            ac2 +
            '" opacity="0.85"/>\n  <line x1="32" y1="100" x2="480" y2="100" stroke="' +
            ac +
            '" stroke-width="' +
            rule +
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
        } else {
          shapes =
            '<polygon points="0,0 160,0 110,512 0,512" fill="' +
            ac +
            '" opacity="0.95"/>\n  <polygon points="512,0 512,200 360,0" fill="' +
            ac2 +
            '" opacity="0.85"/>';
        }
        break;
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
      case 'news':
        if (arch === 'masthead') {
          shapes =
            '<rect x="0" y="0" width="512" height="76" fill="' +
            ac +
            '"/>\n  <line x1="40" y1="400" x2="472" y2="400" stroke="' +
            ac2 +
            '" stroke-width="' +
            rule +
            '"/>\n  <line x1="40" y1="420" x2="280" y2="420" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.6"/>';
          y1 = 248;
          y2 = 338;
        } else if (arch === 'freqMinimal') {
          shapes =
            '<line x1="48" y1="112" x2="464" y2="112" stroke="' +
            ac +
            '" stroke-width="' +
            Math.max(4, rule) +
            '"/>\n  <line x1="48" y1="128" x2="360" y2="128" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.5"/>';
          y1 = 252;
          y2 = 342;
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
          y1 = 238;
          y2 = 358;
        }
        break;
      case 'sports': {
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
            (arch === 'classicWordmark' ? '0.12' : '0.18') +
            '"/>';
        }
        if (arch === 'classicWordmark') {
          shapes =
            '<path d="M 64 160 L 448 140 L 472 200 L 40 200 Z" fill="' +
            ac2 +
            '" opacity="0.25"/>\n  <circle cx="256" cy="256" r="220" fill="none" stroke="' +
            ac +
            '" stroke-width="5"/>' +
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
        if (arch === 'softWordmark') {
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

    shapes += eraLayoutExtras(fl, r, ac, ac2);

    var coords = skewHeroCoords(heroCoordsForArchetype(typo, arch, family), ls, spec.seed, family);
    var ls1 = letterSpacingAttr(typo.trackingPrimaryEm);
    var ls2 = letterSpacingAttr(typo.trackingSecondaryEm);
    var it1 = typo.italicPrimary ? ' font-style="italic"' : '';
    var it2 = typo.italicSecondary ? ' font-style="italic"' : '';

    var text = '';
    if (resolved.stack) {
      var raw1 = resolved.line1;
      var raw2 = resolved.line2;
      var fs1b = fitHeroLine(raw1, 118, 52, lm);
      var fs2b = fitHeroLine(raw2, 100, 46, lm);
      var hz = applyHeroHierarchySizes(fs1b, fs2b, 100, resolved, typo, arch);
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
        hz.fs1 +
        '" font-weight="' +
        wp +
        '"' +
        ls1 +
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
        hz.fs2 +
        '" font-weight="' +
        ws +
        '"' +
        ls2 +
        it2 +
        ' fill="' +
        ac2 +
        '">' +
        l2 +
        '</text>';
    } else {
      var single = String(resolved.single || '');
      var fs0 = fitHeroSingle(single, 128, 42, lm);
      var hz2 = applyHeroHierarchySizes(0, 0, fs0, resolved, typo, arch);
      var yMid = Math.round((y1 + y2) / 2) + 8;
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
        hz2.fs +
        '" font-weight="' +
        wp +
        '"' +
        ls1 +
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
    var itBrand = typo.italicPrimary ? ' font-style="italic"' : '';
    var itSec = typo.italicSecondary ? ' font-style="italic"' : '';

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

    var lsB = letterSpacingAttr(thumbTrackEm(typo, 'brand'));
    var lsC = letterSpacingAttr(thumbTrackEm(typo, 'call'));
    var lsF = letterSpacingAttr(thumbTrackEm(typo, 'freq'));
    var lsFmt = letterSpacingAttr(thumbTrackEm(typo, 'fmt'));

    var gloss =
      es.glow > 0
        ? '<ellipse cx="256" cy="120" rx="220" ry="100" fill="url(#wlGloss)" opacity="' + es.glow + '"/>'
        : '';
    var defs =
      '<defs>\n  <linearGradient id="wlGloss" x1="0%" y1="0%" x2="0%" y2="100%">\n    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>\n    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>\n  </linearGradient>\n</defs>';

    var r = es.r != null ? es.r : 8;
    var rule = es.rule != null ? es.rule : 4;
    var arch = spec.layoutArchetype || 'default';
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
        if (arch === 'brandHero') {
          shapes =
            '<rect x="36" y="36" width="440" height="440" rx="' +
            (r + 4) +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="' +
            Math.max(3, rule) +
            '"/>\n  <polygon points="0,0 130,0 85,512 0,512" fill="' +
            ac +
            '" opacity="0.4"/>';
        } else if (arch === 'diagonalBlock') {
          shapes =
            '<polygon points="0,512 512,40 512,512" fill="' +
            ac2 +
            '" opacity="0.35"/>\n  <polygon points="0,0 190,0 0,260" fill="' +
            ac +
            '" opacity="0.85"/>';
        } else if (arch === 'textBar') {
          shapes =
            '<rect x="0" y="0" width="512" height="22" fill="' +
            ac +
            '"/>\n  <rect x="0" y="490" width="512" height="22" fill="' +
            ac2 +
            '"/>\n  <line x1="20" y1="78" x2="492" y2="78" stroke="' +
            ac +
            '" stroke-width="5"/>';
        } else if (arch === 'sleekStrip' && family === 'rhythmic') {
          shapes =
            '<rect x="16" y="92" width="480" height="8" fill="' +
            ac +
            '"/>\n  <rect x="16" y="412" width="480" height="6" fill="' +
            ac2 +
            '"/>\n  <line x1="32" y1="256" x2="480" y2="256" stroke="' +
            ac +
            '" stroke-width="2" opacity="0.28"/>';
        } else {
          var cut = variant % 2 === 0;
          shapes = cut
            ? '<polygon points="0,0 140,0 100,512 0,512" fill="' +
              ac +
              '"/>\n  <polygon points="512,0 512,180 380,0" fill="' +
              ac2 +
              '" opacity="0.9"/>'
            : '<rect x="0" y="0" width="512" height="18" fill="' +
              ac +
              '"/>\n  <rect x="0" y="494" width="512" height="18" fill="' +
              ac2 +
              '"/>\n  <line x1="24" y1="80" x2="488" y2="80" stroke="' +
              ac +
              '" stroke-width="6"/>';
        }
        var freqRectX = tba === 'start' ? 56 : 156;
        var freqRectW = tba === 'start' ? 400 : 200;
        textBlock =
          '<text x="' +
          tbx +
          '" y="' +
          (220 + variant * 4) +
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
          itBrand +
          ' fill="' +
          fg +
          '">' +
          brandE +
          '</text>\n  <text x="' +
          tbx +
          '" y="300" text-anchor="' +
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
          ac2 +
          '">' +
          callE +
          '</text>\n  <rect x="' +
          freqRectX +
          '" y="330" rx="' +
          r +
          '" width="' +
          freqRectW +
          '" height="44" fill="' +
          ac +
          '" opacity="0.92"/>\n  <text x="' +
          tbx +
          '" y="362" text-anchor="' +
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
          bg +
          '">' +
          freq +
          '</text>\n  <text x="' +
          tbx +
          '" y="430" text-anchor="' +
          tba +
          '" font-family="' +
          fsS +
          '" font-size="16" fill="' +
          ac +
          '"' +
          lsFmt +
          ' opacity="0.85">' +
          fmtE +
          '</text>';
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
        if (arch === 'masthead') {
          shapes =
            '<rect x="0" y="0" width="512" height="64" fill="' +
            ac +
            '"/>\n  <line x1="36" y1="392" x2="476" y2="392" stroke="' +
            ac2 +
            '" stroke-width="' +
            rule +
            '"/>';
        } else if (arch === 'freqMinimal') {
          shapes =
            '<line x1="40" y1="104" x2="472" y2="104" stroke="' +
            ac +
            '" stroke-width="' +
            Math.max(4, rule) +
            '"/>\n  <line x1="40" y1="118" x2="320" y2="118" stroke="' +
            ac2 +
            '" stroke-width="2" opacity="0.45"/>';
        } else {
          shapes =
            '<rect x="32" y="32" width="448" height="448" rx="' +
            r +
            '" fill="none" stroke="' +
            ac +
            '" stroke-width="' +
            Math.max(3, rule - 1) +
            '"/>\n  <rect x="48" y="48" width="120" height="36" fill="' +
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
        textBlock =
          '<text x="' +
          tbx +
          '" y="200" text-anchor="' +
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
          '" y="250" text-anchor="' +
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
          '</text>\n  <line x1="96" y1="278" x2="416" y2="278" stroke="' +
          ac2 +
          '" stroke-width="' +
          rule +
          '"/>\n  <text x="' +
          tbx +
          '" y="330" text-anchor="' +
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
          '" y="390" text-anchor="' +
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
        break;
      }
      case 'sports': {
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
          '" opacity="0.15"/>' +
          (arch === 'bannerStack'
            ? '<rect x="48" y="144" width="416" height="32" fill="' + ac + '" opacity="0.3"/>'
            : '');
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
        textBlock =
          '<text x="' +
          tbx +
          '" y="210" text-anchor="' +
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
          '" y="350" text-anchor="' +
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
          '" y="420" text-anchor="' +
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
        break;
      }
      case 'oldies': {
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
            (arch === 'classicWordmark' ? '0.14' : '0.2') +
            '"/>';
        }
        if (arch === 'classicWordmark') {
          shapes =
            '<path d="M 56 148 L 456 132 L 468 188 L 44 188 Z" fill="' +
            ac2 +
            '" opacity="0.3"/>\n  <circle cx="256" cy="256" r="216" fill="none" stroke="' +
            ac +
            '" stroke-width="5"/>\n  ' +
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
        textBlock =
          '<text x="' +
          tbx +
          '" y="200" text-anchor="' +
          tba +
          '" font-family="' +
          fsP +
          '" font-size="' +
          Math.min(fsBrand, 44) +
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
          '" y="265" text-anchor="' +
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
          '" y="320" text-anchor="' +
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
          '" y="390" text-anchor="' +
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
        if (arch === 'softWordmark') {
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
        textBlock =
          '<text x="' +
          tbx +
          '" y="205" text-anchor="' +
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
          '" y="275" text-anchor="' +
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
          '" y="335" text-anchor="' +
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
          '" y="395" text-anchor="' +
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

    shapes += eraLayoutExtras(fl, r, ac, ac2);

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
