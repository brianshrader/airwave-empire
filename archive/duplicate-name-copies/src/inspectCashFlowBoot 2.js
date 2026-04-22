/**
 * Dev-only: solo cash identity check (inspect-cash-flow.html).
 * Query: ?quick=1 — one market, fewer periods.
 */
(function () {
  function run() {
    var el = document.getElementById('inspect-report');
    try {
      if (typeof runCashFlowIntegrityDiagnostic !== 'function') {
        throw new Error('runCashFlowIntegrityDiagnostic not found — load marketSimHarness.js after legacy.js');
      }
      var qs = new URLSearchParams(window.location.search || '');
      var quick = qs.get('quick') === '1';
      var out = runCashFlowIntegrityDiagnostic({
        quick: quick,
        verbose: false,
      });
      var text = out.plainEnglish;
      if (el) el.textContent = text;
      window.__CASH_AUDIT_DONE__ = true;
      window.__CASH_AUDIT_OK__ = out.ok;
      window.__CASH_AUDIT_TEXT__ = text;
    } catch (e) {
      var msg = (e && e.stack) || String(e);
      if (el) el.textContent = 'Error:\n' + msg;
      window.__CASH_AUDIT_ERROR__ = msg;
      window.__CASH_AUDIT_DONE__ = true;
      window.__CASH_AUDIT_OK__ = false;
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
