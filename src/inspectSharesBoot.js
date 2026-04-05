/**
 * Dev-only: batch-runs share calibration inspection when opening /inspect-shares.html.
 * Query: ?quick=1 — fewer markets/runs (fast). Omit for full default (longer).
 * Loaded from inspect-shares.html only (not play.html).
 */
(function () {
  function run() {
    var el = document.getElementById('inspect-report');
    try {
      if (typeof runShareCalibrationInspection !== 'function') {
        throw new Error('runShareCalibrationInspection not found — load marketSimHarness.js after legacy.js');
      }
      var qs = new URLSearchParams(window.location.search || '');
      var quick = qs.get('quick') === '1';
      var out = runShareCalibrationInspection({
        quick: quick,
        numRunsPerMarket: quick ? 2 : 4,
        verbose: false,
      });
      var text =
        out.plainEnglish +
        '\n\n--- Compact table (JSON) ---\n' +
        JSON.stringify(out.tableRows, null, 2);
      if (el) el.textContent = text;
      window.__INSPECT_SHARE_DONE__ = true;
      window.__INSPECT_SHARE_TEXT__ = text;
    } catch (e) {
      var msg = (e && e.stack) || String(e);
      if (el) el.textContent = 'Error:\n' + msg;
      window.__INSPECT_SHARE_ERROR__ = msg;
      window.__INSPECT_SHARE_DONE__ = true;
    }
  }
  // May load dynamically after DOMContentLoaded (inspect-shares.html); don’t rely on that event only.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(run, 0);
    });
  } else {
    setTimeout(run, 0);
  }
})();
