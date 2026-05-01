/**
 * Stripe subscription Price IDs — test vs live differ; map both on the server (stripePlan.js).
 * Client picks a set via VITE_STRIPE_PRICE_MODE or Vite production build defaults.
 */
export const STRIPE_PRICES_TEST = Object.freeze({
  starter_monthly: 'price_1TRQJwRV8iDbXZazDvpdWgYP',
  starter_annual: 'price_1TRQKoRV8iDbXZazT8YmH2Ji',
  pro_monthly: 'price_1TRQLSRV8iDbXZazQogqgaob',
  pro_annual: 'price_1TRQMVRV8iDbXZazPuSlJnNM',
});

/** Live mode (production dashboard) — pair with sk_live_ and pk_live_. */
export const STRIPE_PRICES_LIVE = Object.freeze({
  starter_monthly: 'price_1TRyFcDzppoc0lYSpTb6qpdp',
  starter_annual: 'price_1TRyFZDzppoc0lYSq0qumGzR',
  pro_monthly: 'price_1TRyFXDzppoc0lYSjEcp9t97',
  pro_annual: 'price_1TRyFUDzppoc0lYSNeXZ1gPH',
});

function stripePriceMode() {
  const raw = String(import.meta.env?.VITE_STRIPE_PRICE_MODE || '').trim().toLowerCase();
  if (raw === 'live' || raw === 'production') return 'live';
  if (raw === 'test') return 'test';
  return import.meta.env.PROD ? 'live' : 'test';
}

/** Price IDs sent to POST /api/billing/create-checkout-session (must match server STRIPE_SECRET_KEY mode). */
export function effectiveStripePrices() {
  return stripePriceMode() === 'live' ? STRIPE_PRICES_LIVE : STRIPE_PRICES_TEST;
}

/** Human cadence from Stripe price id (never show raw price_* to users). Recognizes test + live IDs. */
export function billingCadenceFromStripePriceId(priceId) {
  if (!priceId) return '';
  const pid = String(priceId).trim();
  const keys = ['starter_monthly', 'starter_annual', 'pro_monthly', 'pro_annual'];
  for (const key of keys) {
    if (STRIPE_PRICES_TEST[key] === pid || STRIPE_PRICES_LIVE[key] === pid) {
      if (key.endsWith('_monthly')) return 'Monthly';
      if (key.endsWith('_annual')) return 'Annual';
    }
  }
  return '';
}
