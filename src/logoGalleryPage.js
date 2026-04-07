/**
 * Internal logo audit gallery — loaded by logo-gallery.html only.
 * Uses window.wlStationLogoSvg (same generator as the game).
 */
(function () {
  'use strict';

  /** Primary sample matrix: diverse formats, brands, dials, years baked into each row. */
  var MATRIX = [
    { id: 'm-chr-95', formatKey: 'TOP40', formatLabel: 'CHR (TOP40)', callDisplay: 'WZMX-FM', dial: '99.5 FM', band: 'FM', brand: 'Hot 99.5', year: 1995 },
    { id: 'm-top40-78', formatKey: 'TOP40', formatLabel: 'Top 40', callDisplay: 'WABC-AM', dial: '770 AM', band: 'AM', brand: '77 WABC', year: 1978 },
    { id: 'm-news-88', formatKey: 'NEWS_TALK', formatLabel: 'News/Talk', callDisplay: 'WINS-AM', dial: '1010 AM', band: 'AM', brand: 'NewsRadio 1010', year: 1988 },
    { id: 'm-news-15', formatKey: 'NEWS_TALK', formatLabel: 'News/Talk', callDisplay: 'WKRP-FM', dial: '92.5 FM', band: 'FM', brand: '92.5 The News', year: 2015 },
    { id: 'm-allnews-92', formatKey: 'ALL_NEWS', formatLabel: 'All News', callDisplay: 'WCBS-FM', dial: '101.1 FM', band: 'FM', brand: '101.1 All News', year: 1992 },
    { id: 'm-sports-05', formatKey: 'SPORTS_TALK', formatLabel: 'Sports Talk', callDisplay: 'WFAN-AM', dial: '660 AM', band: 'AM', brand: 'The Fan', year: 2005 },
    { id: 'm-sports-18', formatKey: 'SPORTS_TALK', formatLabel: 'Sports Talk', callDisplay: 'WZNF-FM', dial: '104.5 FM', band: 'FM', brand: '104.5 The Game', year: 2018 },
    { id: 'm-country-82', formatKey: 'COUNTRY', formatLabel: 'Country', callDisplay: 'WYCD-FM', dial: '99.5 FM', band: 'FM', brand: 'Y-99', year: 1982 },
    { id: 'm-country-10', formatKey: 'COUNTRY', formatLabel: 'Country', callDisplay: 'WXTU-FM', dial: '92.5 FM', band: 'FM', brand: '92.5 The Bull', year: 2010 },
    { id: 'm-rock-79', formatKey: 'ALBUM_ROCK', formatLabel: 'Album Rock', callDisplay: 'WZLX-FM', dial: '100.7 FM', band: 'FM', brand: 'The Rock', year: 1979 },
    { id: 'm-classic-99', formatKey: 'CLASSIC_ROCK', formatLabel: 'Classic Rock', callDisplay: 'WAXQ-FM', dial: '104.3 FM', band: 'FM', brand: 'Q104', year: 1999 },
    { id: 'm-alt-94', formatKey: 'ALT_ROCK', formatLabel: 'Alt Rock', callDisplay: 'WKQX-FM', dial: '101.1 FM', band: 'FM', brand: 'X101', year: 1994 },
    { id: 'm-ac-87', formatKey: 'ADULT_CONTEMP', formatLabel: 'Adult Contemporary', callDisplay: 'WLIT-FM', dial: '93.9 FM', band: 'FM', brand: 'Lite 94', year: 1987 },
    { id: 'm-mor-73', formatKey: 'MOR', formatLabel: 'MOR', callDisplay: 'WMOR-AM', dial: '840 AM', band: 'AM', brand: 'Melody 840', year: 1973 },
    { id: 'm-beauty-76', formatKey: 'BEAUTIFUL_MUSIC', formatLabel: 'Beautiful Music', callDisplay: 'WBBM-FM', dial: '96.3 FM', band: 'FM', brand: 'Easy 96', year: 1976 },
    { id: 'm-hotac-02', formatKey: 'HOT_AC', formatLabel: 'Hot AC', callDisplay: 'WVMV-FM', dial: '98.7 FM', band: 'FM', brand: 'Mix 98.7', year: 2002 },
    { id: 'm-oldies-91', formatKey: 'OLDIES', formatLabel: 'Oldies', callDisplay: 'WOGL-FM', dial: '98.1 FM', band: 'FM', brand: 'Oldies 98', year: 1991 },
    { id: 'm-classichits-08', formatKey: 'CLASSIC_HITS', formatLabel: 'Classic Hits', callDisplay: 'WRIT-FM', dial: '100.3 FM', band: 'FM', brand: 'The Vault', year: 2008 },
    { id: 'm-urban-96', formatKey: 'URBAN_CONTEMP', formatLabel: 'Urban', callDisplay: 'WBLS-FM', dial: '107.5 FM', band: 'FM', brand: 'Power 107', year: 1996 },
    { id: 'm-soul-81', formatKey: 'SOUL_RNB', formatLabel: 'Soul/R&B', callDisplay: 'WVKL-FM', dial: '95.7 FM', band: 'FM', brand: 'Groove 95', year: 1981 },
    { id: 'm-rhy-12', formatKey: 'RHYTHMIC', formatLabel: 'Rhythmic CHR', callDisplay: 'WPTY-FM', dial: '102.7 FM', band: 'FM', brand: 'Party 102', year: 2012 },
    { id: 'm-span-05', formatKey: 'SPANISH', formatLabel: 'Spanish', callDisplay: 'WLEY-FM', dial: '107.9 FM', band: 'FM', brand: 'La Mega', year: 2005 },
    { id: 'm-gospel-89', formatKey: 'GOSPEL', formatLabel: 'Gospel', callDisplay: 'WGOS-FM', dial: '102.3 FM', band: 'FM', brand: 'Praise 102', year: 1989 },
    { id: 'm-pod-16', formatKey: 'PODCAST_TALK', formatLabel: 'Podcast Talk', callDisplay: 'WPNC-AM', dial: '680 AM', band: 'AM', brand: 'The Feed 680', year: 2016 },
    { id: 'm-longbrand', formatKey: 'TOP40', formatLabel: 'CHR (TOP40)', callDisplay: 'WMMS-FM', dial: '100.7 FM', band: 'FM', brand: 'The Buzz — Today\'s Hits & Throwbacks', year: 2007 },
    { id: 'm-shortcall', formatKey: 'NEWS_TALK', formatLabel: 'News/Talk', callDisplay: 'WJR-AM', dial: '760 AM', band: 'AM', brand: 'NewsTalk 760', year: 1984 },
    { id: 'm-plainfreq', formatKey: 'ADULT_CONTEMP', formatLabel: 'AC', callDisplay: 'WLTW-FM', dial: '106.7 FM', band: 'FM', brand: '106.7 Lite FM', year: 1993 },
  ];

  var ERA_DRIFT_BASE = {
    id: 'audit-era-wsb',
    formatKey: 'NEWS_TALK',
    formatLabel: 'News/Talk',
    callDisplay: 'WSB-AM',
    dial: '750 AM',
    band: 'AM',
    brand: 'News 750',
    variantBump: 0,
  };

  var BUMP_BASE = {
    id: 'audit-bump-chr',
    formatKey: 'TOP40',
    formatLabel: 'CHR (TOP40)',
    callDisplay: 'WKSC-FM',
    dial: '103.5 FM',
    band: 'FM',
    brand: 'Kiss 103.5',
    year: 2000,
  };

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function buildInput(row, layoutMode) {
    return {
      id: row.id,
      callDisplay: row.callDisplay,
      brand: row.brand,
      formatKey: row.formatKey,
      formatLabel: row.formatLabel,
      dial: row.dial,
      band: row.band,
      year: row.year != null ? row.year : 2000,
      variantBump: row.variantBump != null ? row.variantBump : 0,
      defaultBrand: row.defaultBrand || '',
      layoutMode: layoutMode || 'brandHero',
    };
  }

  function familyOf(row) {
    return wlStationLogoSvg.formatToFamily(row.formatKey);
  }

  function eraOfYear(y) {
    return wlStationLogoSvg.eraBucket(y);
  }

  function tileHtml(spec, svg, input) {
    var pal = spec.palette;
    var f = spec.fonts;
    var cap = el('div', 'lg-cap');
    cap.innerHTML =
      '<div class="lg-cap-line"><strong>' +
      esc(spec.callDisplay) +
      '</strong> · ' +
      esc(spec.dial) +
      '</div>' +
      '<div class="lg-cap-line">' +
      esc(spec.formatLabel) +
      ' · ' +
      spec.year +
      ' · ' +
      spec.era +
      '</div>' +
      '<div class="lg-cap-line lg-cap-meta">family <code>' +
      esc(spec.family) +
      '</code> · fonts ' +
      esc(f.primary) +
      ' + ' +
      esc(f.secondary) +
      '</div>' +
      '<div class="lg-cap-line lg-cap-meta">palette #' +
      spec.paletteIndex +
      '/' +
      spec.paletteCount +
      ' · pair #' +
      spec.fontPairIndex +
      '/' +
      spec.fontPairCount +
      ' · bump ' +
      spec.variantBump +
      '</div>' +
      (spec.typography
        ? '<div class="lg-cap-line lg-cap-meta">typo align <code>' +
          esc(spec.typography.heroAlignEffective || '') +
          '</code> · hierarchy <code>' +
          esc(spec.typography.hierarchyBias || '') +
          '</code> · trk ' +
          Number(spec.typography.trackingPrimaryEm || 0).toFixed(3) +
          '/' +
          Number(spec.typography.trackingSecondaryEm || 0).toFixed(3) +
          (spec.typography.italicPrimary || spec.typography.italicSecondary ? ' · italic' : '') +
          '</div>'
        : '') +
      (spec.layoutArchetype
        ? '<div class="lg-cap-line lg-cap-meta">layout <code>' +
          esc(spec.layoutArchetype) +
          '</code>' +
          (spec.layoutStructure && spec.layoutStructure.shapeAccent
            ? ' · structure <code>' + esc(spec.layoutStructure.shapeAccent) + '</code>'
            : '') +
          (spec.layoutStructure && spec.layoutStructure.frameLayers != null
            ? ' · layers ' + spec.layoutStructure.frameLayers
            : '') +
          '</div>'
        : '') +
      '<div class="lg-cap-line lg-cap-meta">seed <code>' +
      spec.seed +
      '</code> · var ' +
      spec.variant +
      '</div>' +
      '<div class="lg-cap-swatches" title="bg / fg / ac / ac2">' +
      '<span style="background:' +
      pal.bg +
      '"></span><span style="background:' +
      pal.fg +
      '"></span><span style="background:' +
      pal.ac +
      '"></span><span style="background:' +
      pal.ac2 +
      '"></span></div>';
    var wrap = el('div', 'lg-tile', '');
    wrap.tabIndex = 0;
    wrap.dataset.debug = JSON.stringify({ input: input, spec: spec }, null, 2);
    var svgHost = el('div', 'lg-svg');
    svgHost.innerHTML = svg;
    wrap.appendChild(svgHost);
    wrap.appendChild(cap);
    wrap.addEventListener('click', function () {
      try {
        navigator.clipboard.writeText(wrap.dataset.debug);
        wrap.classList.add('lg-tile--copied');
        setTimeout(function () {
          wrap.classList.remove('lg-tile--copied');
        }, 600);
      } catch (err) {
        window.prompt('Copy debug JSON:', wrap.dataset.debug);
      }
    });
    return wrap;
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderOne(row, layoutMode) {
    var input = buildInput(row, layoutMode);
    var spec = wlStationLogoSvg.generateStationLogoSpec(input);
    var svg = wlStationLogoSvg.renderStationLogoSvg(spec);
    return tileHtml(spec, svg, input);
  }

  function passesFilters(row, fFamily, fEra, fBand) {
    if (fFamily && fFamily !== 'all' && familyOf(row) !== fFamily) return false;
    if (fEra && fEra !== 'all' && eraOfYear(row.year) !== fEra) return false;
    if (fBand && fBand !== 'all' && row.band !== fBand) return false;
    return true;
  }

  function render() {
    var grid = document.getElementById('lg-grid');
    var eraRow = document.getElementById('lg-era-row');
    var bumpRow = document.getElementById('lg-bump-row');
    if (!grid || !wlStationLogoSvg) return;

    var layoutMode = document.getElementById('lg-layout') && document.getElementById('lg-layout').value;
    var fFam = document.getElementById('lg-f-family') && document.getElementById('lg-f-family').value;
    var fEra = document.getElementById('lg-f-era') && document.getElementById('lg-f-era').value;
    var fBand = document.getElementById('lg-f-band') && document.getElementById('lg-f-band').value;

    grid.innerHTML = '';
    MATRIX.forEach(function (row) {
      if (!passesFilters(row, fFam, fEra, fBand)) return;
      grid.appendChild(renderOne(row, layoutMode));
    });

    eraRow.innerHTML = '';
    [1975, 1985, 1995, 2005, 2015].forEach(function (yr) {
      var r = Object.assign({}, ERA_DRIFT_BASE, { year: yr });
      eraRow.appendChild(renderOne(r, layoutMode));
    });

    bumpRow.innerHTML = '';
    [0, 1, 2].forEach(function (b) {
      var r = Object.assign({}, BUMP_BASE, { variantBump: b });
      bumpRow.appendChild(renderOne(r, layoutMode));
    });
  }

  function init() {
    if (typeof wlStationLogoSvg === 'undefined' || typeof wlStationLogoSvg.build !== 'function') {
      document.body.innerHTML =
        '<p style="padding:24px;font-family:system-ui">wlStationLogoSvg not loaded. Open this page via the dev server (e.g. <code>http://localhost:5173/logo-gallery.html</code>) so <code>/src/stationLogoSvg.js</code> resolves.</p>';
      return;
    }

    document.getElementById('lg-refresh').addEventListener('click', render);
    ['lg-f-family', 'lg-f-era', 'lg-f-band', 'lg-layout'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.addEventListener('change', render);
    });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
