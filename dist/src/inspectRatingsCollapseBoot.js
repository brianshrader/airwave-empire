/**
 * Dev: headless stress for market-wide ratings collapse — inspect-ratings-collapse.html
 *
 * Query: ?quick=1  fewer seeds (faster)
 *        ?seed=12345  base RNG seed
 *        ?era=1970 | 1978 | 1985  genMarketMP era (default 1970; use 1985 for shorter span to 2010s)
 */
(function () {
  function run() {
    var el = document.getElementById('inspect-report');
    try {
      if (typeof runRatingsCollapseAudit !== 'function') {
        throw new Error('runRatingsCollapseAudit not found — load marketSimHarness.js after legacy.js');
      }
      var qs = new URLSearchParams(window.location.search || '');
      var opts = { verbose: false };
      if (qs.get('quick') === '1') opts.quick = true;
      var era = qs.get('era');
      if (era === '1970' || era === '1978' || era === '1985') opts.eraKey = era;
      var seed = qs.get('seed');
      if (seed != null && seed !== '') opts.seed = parseInt(seed, 10);
      var out = runRatingsCollapseAudit(opts);
      var text = out.plainEnglish;
      if (el) el.textContent = text;
      window.__RATINGS_COLLAPSE_AUDIT_DONE__ = true;
      window.__RATINGS_COLLAPSE_AUDIT_TEXT__ = text;
      window.__RATINGS_COLLAPSE_AUDIT_JSON__ = {
        ok: out.ok,
        incidents: out.incidents,
        stitchEvents: out.stitchEvents,
        totalAdvTurns: out.totalAdvTurns,
        options: out.options,
      };
      window.__RATINGS_COLLAPSE_AUDIT_ERROR__ = out.ok ? null : 'collapse or integrity incident (see JSON)';
    } catch (e) {
      var msg = (e && e.stack) || String(e);
      if (el) el.textContent = 'Error:\n' + msg;
      window.__RATINGS_COLLAPSE_AUDIT_ERROR__ = msg;
      window.__RATINGS_COLLAPSE_AUDIT_DONE__ = true;
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
