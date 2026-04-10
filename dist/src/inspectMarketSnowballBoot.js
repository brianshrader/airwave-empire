/**
 * inspect-market-snowball.html — per-period snowball / exploit trace.
 * Query: endYear=2026 &endPeriod=2 &scen=under &market=atlanta &seed=505050 &policy=aggressive &easy=0 &passive=0
 * passive=1 disables the benchmark bot (still logs economy / AI deltas).
 */
(function () {
  function run() {
    var el = document.getElementById('inspect-report');
    try {
      window.__SNOWBALL_TRACE_DONE__ = false;
      try {
        delete window.__SNOWBALL_TRACE_ERROR__;
      } catch (e0) {}
      window.__SNOWBALL_TRACE_JSON__ = undefined;
      window.__SNOWBALL_TRACE_TEXT__ = undefined;
      if (typeof runMarketSnowballTrace !== 'function') {
        throw new Error('runMarketSnowballTrace not found — load marketSimHarness.js after legacy.js');
      }
      var qs = new URLSearchParams(window.location.search || '');
      var endYear = Math.max(1972, Math.min(2030, parseInt(qs.get('endYear') || '2026', 10) || 2026));
      var endPeriod = qs.get('endPeriod') === '1' ? 1 : 2;
      var scen = (qs.get('scen') || 'under').replace(/[^a-z0-9_]/gi, '') || 'under';
      var marketId = (qs.get('market') || 'atlanta').replace(/[^a-z0-9_]/gi, '') || 'atlanta';
      var seedRaw = qs.get('seed');
      var seedNum = seedRaw != null && seedRaw !== '' ? parseInt(seedRaw, 10) : 505050;
      var policyRaw = (qs.get('policy') || 'aggressive').toLowerCase();
      var playerPolicy = policyRaw === 'conservative' ? 'conservative' : 'aggressive';
      var easyAi = qs.get('easy') === '1' || qs.get('easy') === 'true';
      var passive = qs.get('passive') === '1' || qs.get('passive') === 'true';

      var out = runMarketSnowballTrace({
        endYear: endYear,
        endPeriod: endPeriod,
        marketId: marketId,
        scenId: scen,
        seed: isNaN(seedNum) ? 505050 : seedNum,
        easyAi: easyAi,
        activePlayer: !passive,
        playerPolicy: playerPolicy,
      });

      var head = out.plainEnglish + '\n\n──────── SAMPLE (first 3 periods, condensed) ────────\n';
      var sample = out.diary.slice(0, 3).map(function (row) {
        return (
          row.year +
          ' P' +
          row.period +
          ' | cash ' +
          Math.round(row.cashStart) +
          '→' +
          Math.round(row.cashEnd) +
          ' | Δ$' +
          Math.round(row.cashDelta) +
          ' | clus ' +
          row.clusterShare +
          ' | topSh ' +
          row.topShare +
          ' | acq ' +
          (row.actions.acquisitions.length || 0) +
          ' ref ' +
          (row.actions.reformats.length || 0) +
          ' hire ' +
          (row.actions.talentHires.length || 0) +
          ' | AI rf/cp/po ' +
          row.aiDelta.rivalReformatsTotal +
          '/' +
          row.aiDelta.counterPromoVsPlayer +
          '/' +
          row.aiDelta.poachPlayerAttempts
        );
      });
      var text = head + sample.join('\n') + '\n\n… see JSON export for trace-market-snowball.mjs.';
      if (el) el.textContent = text;
      window.__SNOWBALL_TRACE_DONE__ = true;
      window.__SNOWBALL_TRACE_JSON__ = out;
      window.__SNOWBALL_TRACE_TEXT__ = out.plainEnglish;
    } catch (e) {
      var msg = (e && e.stack) || String(e);
      if (el) el.textContent = 'Error:\n' + msg;
      window.__SNOWBALL_TRACE_ERROR__ = msg;
      window.__SNOWBALL_TRACE_DONE__ = true;
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
