/**
 * VM hooks — simulcast revenue A/B Variant D (Variant A uses production applySimulcastClusterRevenueAllocation).
 */
(function () {
  'use strict';

  function variant() {
    return globalThis.__wlSimulcastRevenueAbVariant || 'CURRENT';
  }

  globalThis.wlSimulcastRevenueAbSkipFmDedupe = function wlSimulcastRevenueAbSkipFmDedupe(fm, G) {
    if (variant() !== 'D') return false;
    return typeof isSimulcastProgrammingReceiver === 'function'
      && isSimulcastProgrammingReceiver(fm, G);
  };
})();
