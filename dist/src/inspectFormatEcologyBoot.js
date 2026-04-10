/**
 * Dev-only: format mix / ecology by decade (inspect-format-ecology.html).
 * Query: ?quick=1 — fewer markets/runs. Omit for five markets × 4 runs.
 * Query: ?markets=chicago,newyork — comma-separated market ids (overrides default market list).
 * Query: ?seed=20260407 — PRNG seed for runFormatEcologyInspection (batch / regression compares).
 */
(function () {
  function run() {
    var el = document.getElementById('inspect-report');
    try {
      if (typeof runFormatEcologyInspection !== 'function') {
        throw new Error('runFormatEcologyInspection not found — load marketSimHarness.js after legacy.js');
      }
      var qs = new URLSearchParams(window.location.search || '');
      var quick = qs.get('quick') === '1';
      var mParam = qs.get('markets');
      var markets = null;
      if (mParam && mParam.trim()) {
        markets = mParam.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      }
      var seedStr = qs.get('seed');
      var seedNum = seedStr != null && seedStr !== '' ? parseInt(seedStr, 10) : NaN;
      var opts = {
        quick: quick,
        numRunsPerMarket: quick ? 2 : 4,
        verbose: false,
      };
      if (markets && markets.length) opts.markets = markets;
      if (!isNaN(seedNum)) opts.seed = seedNum;
      var out = runFormatEcologyInspection(opts);
      var text = out.plainEnglish;
      if (el) el.textContent = text;
      window.__FORMAT_ECOLOGY_SIM_DONE__ = true;
      window.__FORMAT_ECOLOGY_SIM_TEXT__ = text;
      window.__FORMAT_ECOLOGY_SIM_ERROR__ = null;
      window.__FORMAT_ECOLOGY_RESULT__ = {
        options: out.options || {},
        byMarketDecade: out.byMarketDecade || {},
      };
    } catch (e) {
      var msg = (e && e.stack) || String(e);
      if (el) el.textContent = 'Error:\n' + msg;
      window.__FORMAT_ECOLOGY_SIM_ERROR__ = msg;
      window.__FORMAT_ECOLOGY_SIM_DONE__ = true;
      window.__FORMAT_ECOLOGY_RESULT__ = null;
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
