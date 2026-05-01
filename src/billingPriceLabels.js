/**
 * Customer-facing price strings (must match Stripe Dashboard for each price id).
 * Env vars VITE_ACCOUNT_PRICE_* override these for deploys without a rebuild.
 */
export const BILLING_PRICE_LABELS = Object.freeze({
  starter_monthly: '$4.99/mo',
  starter_annual: '$49.99/yr',
  pro_monthly: '$9.99/mo',
  pro_annual: '$99.99/yr',
});

/**
 * @param {string} key — e.g. starter_monthly
 * @param {string | undefined} envValue — import.meta.env.VITE_ACCOUNT_PRICE_…
 */
export function effectivePriceLabelForKey(key, envValue) {
  const t = envValue != null && String(envValue).trim();
  if (t) return String(envValue).trim();
  return BILLING_PRICE_LABELS[key] || '';
}

/** In-game / marketing one-liner; also exposed on window in main.js for legacy.js */
export const BILLING_PRICE_SUMMARY_LINE =
  'Starter $4.99/mo or $49.99/yr · Pro $9.99/mo or $99.99/yr';
