/**
 * Dev-only: batch-run public radio share/rank simulation (inspect-public-radio.html).
 * Query: ?quick=1 — fewer markets/runs. Omit for full five markets × 4 runs.
 */
(function () {
  function run() {
    var el = document.getElementById('inspect-report');
    try {
      if (typeof runPublicRadioSimulation !== 'function') {
        throw new Error('runPublicRadioSimulation not found — load marketSimHarness.js after legacy.js');
      }
      var qs = new URLSearchParams(window.location.search || '');
      var quick = qs.get('quick') === '1';
      var out = runPublicRadioSimulation({
        quick: quick,
        numRunsPerMarket: quick ? 2 : 4,
        verbose: false,
      });
      var text = out.plainEnglish;
      if (el) el.textContent = text;
      window.__PUBLIC_RADIO_SIM_DONE__ = true;
      window.__PUBLIC_RADIO_SIM_TEXT__ = text;
    } catch (e) {
      var msg = (e && e.stack) || String(e);
      if (el) el.textContent = 'Error:\n' + msg;
      window.__PUBLIC_RADIO_SIM_ERROR__ = msg;
      window.__PUBLIC_RADIO_SIM_DONE__ = true;
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
