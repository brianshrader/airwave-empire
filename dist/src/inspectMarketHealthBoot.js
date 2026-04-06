/**
 * Dev-only: batch market health by decade (inspect-market-health.html).
 * Query: ?quick=1 — fewer markets/runs. Omit for full five markets × 4 runs.
 */
(function () {
  function run() {
    var el = document.getElementById('inspect-report');
    try {
      if (typeof runMarketHealthByDecadeDiagnostic !== 'function') {
        throw new Error('runMarketHealthByDecadeDiagnostic not found — load marketSimHarness.js after legacy.js');
      }
      var qs = new URLSearchParams(window.location.search || '');
      var quick = qs.get('quick') === '1';
      var out = runMarketHealthByDecadeDiagnostic({
        quick: quick,
        numRunsPerMarket: quick ? 2 : 4,
        verbose: false,
      });
      var text = out.plainEnglish;
      if (el) el.textContent = text;
      window.__MARKET_HEALTH_SIM_DONE__ = true;
      window.__MARKET_HEALTH_SIM_TEXT__ = text;
    } catch (e) {
      var msg = (e && e.stack) || String(e);
      if (el) el.textContent = 'Error:\n' + msg;
      window.__MARKET_HEALTH_SIM_ERROR__ = msg;
      window.__MARKET_HEALTH_SIM_DONE__ = true;
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
