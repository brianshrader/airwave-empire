/**
 * Dev: Chicago + King of the Dial (wsb) through 1985 Fall by default.
 * Query: market=chicago scenario=wsb stopYear=1985 stopPeriod=2 seed=123
 */
(function () {
  function run() {
    var el = document.getElementById('inspect-report');
    try {
      if (typeof runScenarioSoloCashProbe !== 'function') {
        throw new Error('runScenarioSoloCashProbe not found — load marketSimHarness.js after legacy.js');
      }
      var qs = new URLSearchParams(window.location.search || '');
      var marketId = qs.get('market') || 'chicago';
      var scenarioId = qs.get('scenario') || 'wsb';
      var stopYear = qs.has('stopYear') ? parseInt(qs.get('stopYear'), 10) : 1985;
      var stopPeriod = qs.has('stopPeriod') ? parseInt(qs.get('stopPeriod'), 10) : 2;
      var seed = qs.has('seed') ? parseInt(qs.get('seed'), 10) : 202604071;
      var maxSteps = qs.has('maxSteps') ? parseInt(qs.get('maxSteps'), 10) : 120;
      var out = runScenarioSoloCashProbe({
        marketId: marketId,
        scenarioId: scenarioId,
        stopYear: stopYear,
        stopPeriod: stopPeriod,
        seed: seed,
        maxSteps: maxSteps,
        verbose: false,
      });
      var text = out.plainEnglish;
      if (el) el.textContent = text;
      window.__SCENARIO_PROBE_DONE__ = true;
      window.__SCENARIO_PROBE_OK__ = out.ok;
      window.__SCENARIO_PROBE_JSON__ = JSON.stringify(out, null, 2);
    } catch (e) {
      var msg = (e && e.stack) || String(e);
      if (el) el.textContent = 'Error:\n' + msg;
      window.__SCENARIO_PROBE_ERROR__ = msg;
      window.__SCENARIO_PROBE_DONE__ = true;
      window.__SCENARIO_PROBE_OK__ = false;
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
