/**
 * Dev grid: deterministic logo samples (format × era × band).
 * Open inspect-logo-templates.html via Vite or dist after build.
 */
(function () {
  function row(label, svg) {
    var scaled = String(svg || '')
      .replace('width="512"', 'width="240"')
      .replace('height="512"', 'height="240"');
    return (
      '<div style="break-inside:avoid;margin-bottom:28px">' +
      '<div style="font-size:13px;color:#9ca3af;margin-bottom:8px;line-height:1.4">' +
      label +
      '</div>' +
      '<div style="background:#141414;padding:16px;border-radius:12px;border:1px solid #2a2a2a;display:inline-block;line-height:0">' +
      scaled +
      '</div></div>'
    );
  }

  function run() {
    var root = document.getElementById('root');
    var build = typeof window !== 'undefined' && window.wlStationLogoSvg && window.wlStationLogoSvg.build;
    if (typeof build !== 'function') {
      if (root) root.innerHTML = '<p>wlStationLogoSvg.build not available.</p>';
      return;
    }

    function sample(o) {
      return build({
        id: o.id || 'demo',
        callDisplay: o.callDisplay || 'WKRP-FM',
        brand: o.brand || 'The Station',
        formatKey: o.formatKey || 'ADULT_CONTEMP',
        formatLabel: o.formatLabel || 'Adult Contemporary',
        dial: o.dial || '98.7',
        band: o.band || 'FM',
        year: o.year || 1985,
        variantBump: o.variantBump != null ? o.variantBump : 0,
        defaultBrand: o.defaultBrand || 'The Station',
        licenseCity: o.licenseCity || '',
        layoutMode: 'brandHero',
      });
    }

    var cases = [
      {
        label: 'AM news/talk · 1977 · template pool (numeric / freq strip / masthead)',
        formatKey: 'NEWS_TALK',
        band: 'AM',
        dial: '1010',
        callDisplay: 'WINS-AM',
        brand: 'NewsRadio Ten Ten',
        licenseCity: 'New York',
        year: 1977,
        variantBump: 0,
      },
      {
        label: 'AM news/talk · 1995',
        formatKey: 'NEWS_TALK',
        band: 'AM',
        dial: '770',
        callDisplay: 'WABC-AM',
        brand: 'Talk 770',
        licenseCity: 'New York',
        year: 1995,
        variantBump: 2,
      },
      {
        label: 'FM CHR · 1987 · FM pool (freq titan / diagonal / strike)',
        formatKey: 'CHR',
        band: 'FM',
        dial: '102.5',
        callDisplay: 'WKSS-FM',
        brand: 'Kiss 102',
        licenseCity: 'Philadelphia',
        year: 1987,
        variantBump: 1,
      },
      {
        label: 'FM AC · 2008',
        formatKey: 'ADULT_CONTEMP',
        band: 'FM',
        dial: '98.7',
        callDisplay: 'WXYZ-FM',
        brand: 'Soft Hits',
        licenseCity: 'Detroit',
        year: 2008,
        variantBump: 0,
      },
      {
        label: 'FM album rock · 1982',
        formatKey: 'ALBUM_ROCK',
        band: 'FM',
        dial: '96.5',
        callDisplay: 'WZLX-FM',
        brand: 'The Rock',
        licenseCity: 'Boston',
        year: 1982,
        variantBump: 3,
      },
      {
        label: 'FM classic rock (oldies template family) · 2015',
        formatKey: 'CLASSIC_ROCK',
        band: 'FM',
        dial: '104.3',
        callDisplay: 'WAXQ-FM',
        brand: 'Classic Q',
        licenseCity: 'New York',
        year: 2015,
        variantBump: 0,
      },
      {
        label: 'FM country · 1999',
        formatKey: 'COUNTRY',
        band: 'FM',
        dial: '94.7',
        callDisplay: 'WXTU-FM',
        brand: 'The Bull',
        licenseCity: 'Philadelphia',
        year: 1999,
        variantBump: 1,
      },
      {
        label: 'Sports talk · 2012',
        formatKey: 'SPORTS_TALK',
        band: 'AM',
        dial: '950',
        callDisplay: 'WADO-AM',
        brand: 'Sports Nine Fifty',
        licenseCity: 'New York',
        year: 2012,
        variantBump: 2,
      },
    ];

    var html = '<div style="max-width:1000px;margin:0 auto">';
    html +=
      '<h1 style="font-size:22px;font-weight:600;margin:0 0 8px">Station logo template samples</h1>';
    html +=
      '<p style="color:#9ca3af;font-size:14px;line-height:1.55;margin:0 0 20px">Deterministic SVG lockups (hero modal size). Same inputs always match. See <code style="background:#1f1f1f;padding:2px 6px;border-radius:4px">docs/station-logo-templates.md</code>.</p>';
    html += '<div style="column-count:2;column-gap:28px">';
    cases.forEach(function (c) {
      var label = c.label;
      var copy = {};
      var k;
      for (k in c) {
        if (Object.prototype.hasOwnProperty.call(c, k) && k !== 'label') copy[k] = c[k];
      }
      var svg = sample(copy) || '<p style="color:#f87171">(empty)</p>';
      html += row(label, svg);
    });
    html += '</div></div>';
    if (root) root.innerHTML = html;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
