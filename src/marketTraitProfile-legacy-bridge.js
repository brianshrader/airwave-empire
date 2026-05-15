/**
 * Optional browser hook: attaches `window.marketTraitProfile(marketId, year)` using `window.MARKETS`.
 * Not loaded by play.html / play-guest.html — diagnostics use `scripts/report-market-traits.mjs`.
 * For a future inspect/debug page: add a deferred `type="module"` script after `legacy.js` pointing here.
 */
import { marketTraitProfile } from './marketTraitProfile.js';

function attach() {
  const mk = typeof window !== 'undefined' ? window.MARKETS : null;
  if (!mk) return false;
  const fn = (marketId, year) => marketTraitProfile(mk, marketId, year);
  window.marketTraitProfile = fn;
  if (typeof globalThis !== 'undefined') globalThis.marketTraitProfile = fn;
  return true;
}

if (!attach()) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const iv = setInterval(() => {
    if (attach() || (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 > 8000) {
      clearInterval(iv);
    }
  }, 16);
}
