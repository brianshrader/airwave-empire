/**
 * Dev-only: solo cash-flow bridge audit (inspect-cash-bridge-audit.html).
 * Query: ?quick=1 — fewer scenarios and periods.
 */
(function () {
  function run() {
    var el = document.getElementById('inspect-report');
    try {
      if (typeof runCashBridgeAudit !== 'function') {
        throw new Error('runCashBridgeAudit not found — load marketSimHarness.js after legacy.js');
      }
      var qs = new URLSearchParams(window.location.search || '');
      var quick = qs.get('quick') === '1';
      var out = runCashBridgeAudit({ quick: quick, verbose: false });
      var text = out.plainEnglish + '\n\n--- CSV (first 4000 chars) ---\n' + (out.csv || '').slice(0, 4000);
      if (el) el.textContent = text;
      window.__CASH_BRIDGE_AUDIT_DONE__ = true;
      window.__CASH_BRIDGE_AUDIT_ROWS__ = out.rows;
      window.__CASH_BRIDGE_AUDIT_ANOMALIES__ = out.anomalies;
      window.__CASH_BRIDGE_AUDIT_CSV__ = out.csv;
      window.__CASH_BRIDGE_AUDIT_JSON__ = out.json;
    } catch (e) {
      var msg = (e && e.stack) || String(e);
      if (el) el.textContent = 'Error:\n' + msg;
      window.__CASH_BRIDGE_AUDIT_ERROR__ = msg;
      window.__CASH_BRIDGE_AUDIT_DONE__ = true;
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
