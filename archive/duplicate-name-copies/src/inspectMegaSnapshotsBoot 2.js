/**
 * Dev: mega-market snapshots (LA / NYC / Chicago) at 2000 & 2019 — inspect-mega-snapshots.html
 *
 * Query: ?seed=12345  optional RNG seed (default in harness)
 */
(function () {
  function run() {
    var el = document.getElementById('inspect-report');
    try {
      if (typeof runMegaMarketSnapshotsDiagnostic !== 'function') {
        throw new Error('runMegaMarketSnapshotsDiagnostic not found — load marketSimHarness.js after legacy.js');
      }
      var qs = new URLSearchParams(window.location.search || '');
      var seed = qs.get('seed');
      var opts = {
        markets: ['losangeles', 'newyork', 'chicago'],
        years: [2000, 2019],
        endPeriod: 2,
        eraKey: '1970',
        maxStepsPerRun: 420,
        verbose: false,
      };
      if (seed != null && seed !== '') opts.seed = parseInt(seed, 10);
      var out = runMegaMarketSnapshotsDiagnostic(opts);
      var text = out.plainEnglish;
      if (el) el.textContent = text;
      window.__MEGA_SNAPSHOTS_DONE__ = true;
      window.__MEGA_SNAPSHOTS_TEXT__ = text;
      window.__MEGA_SNAPSHOTS_JSON__ = out.rows;
    } catch (e) {
      var msg = (e && e.stack) || String(e);
      if (el) el.textContent = 'Error:\n' + msg;
      window.__MEGA_SNAPSHOTS_ERROR__ = msg;
      window.__MEGA_SNAPSHOTS_DONE__ = true;
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
