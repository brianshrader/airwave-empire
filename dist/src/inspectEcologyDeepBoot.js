/**
 * Dev-only boot for inspect-ecology-deep.html — runs compareMegaMarketEcologyInputs + runMarketEcologyDeepDiagnostic.
 */
(function () {
  function run() {
    var out = document.getElementById('out');
    try {
      if (typeof compareMegaMarketEcologyInputs !== 'function' || typeof runMarketEcologyDeepDiagnostic !== 'function') {
        throw new Error('marketSimHarness.js not loaded after legacy.js');
      }
      var cmp = compareMegaMarketEcologyInputs(['newyork', 'losangeles', 'chicago']);
      var deep = runMarketEcologyDeepDiagnostic({ quick: false, verbose: false });
      window.__ECOLOGY_RESULT__ = { compareInputs: cmp, deep: deep };
      window.__ECOLOGY_DONE__ = true;
      var subset = {
        summary2020sPerMarket: deep.summary2020sPerMarket,
        perRunDecade_2020s_ny_la_chi: (deep.perRunDecade || []).filter(function (r) {
          return r.decade === '2020s' && ['chicago', 'newyork', 'losangeles'].indexOf(r.marketId) >= 0;
        }),
        aggregateByMarketDecadeFormats_ny_la_chi: (deep.aggregateByMarketDecadeFormats || []).filter(function (a) {
          return ['chicago', 'newyork', 'losangeles'].indexOf(a.marketId) >= 0;
        }),
      };
      if (out) out.textContent = JSON.stringify(subset, null, 2);
      window.__ECOLOGY_SUBSET_JSON__ = subset;
    } catch (e) {
      window.__ECOLOGY_ERROR__ = (e && e.stack) || String(e);
      window.__ECOLOGY_DONE__ = true;
      if (out) out.textContent = 'Error:\n' + window.__ECOLOGY_ERROR__;
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(run, 0);
    });
  } else {
    setTimeout(run, 0);
  }
})();
