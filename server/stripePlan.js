'use strict';

const { CLERK_PLAN } = require('./aiEntitlements');

function stripePriceToPlanSlug(priceId) {
  const p = String(priceId || '').trim();
  if (!p) return null;

  // Airwave Empire plan mapping (Stripe Price IDs — test + live)
  // Starter (test)
  if (p === 'price_1TRQJwRV8iDbXZazDvpdWgYP') return CLERK_PLAN.STARTER; // Starter Monthly
  if (p === 'price_1TRQKoRV8iDbXZazT8YmH2Ji') return CLERK_PLAN.STARTER; // Starter Annual
  // Pro (test)
  if (p === 'price_1TRQLSRV8iDbXZazQogqgaob') return CLERK_PLAN.PRO; // Pro Monthly
  if (p === 'price_1TRQMVRV8iDbXZazPuSlJnNM') return CLERK_PLAN.PRO; // Pro Annual
  // Starter (live)
  if (p === 'price_1TRyFcDzppoc0lYSpTb6qpdp') return CLERK_PLAN.STARTER;
  if (p === 'price_1TRyFZDzppoc0lYSq0qumGzR') return CLERK_PLAN.STARTER;
  // Pro (live)
  if (p === 'price_1TRyFXDzppoc0lYSjEcp9t97') return CLERK_PLAN.PRO;
  if (p === 'price_1TRyFUDzppoc0lYSNeXZ1gPH') return CLERK_PLAN.PRO;

  return null;
}

/**
 * @param {any} sub Stripe subscription object (webhook or API)
 * @returns {{ planSlug: string, priceId: string|null }}
 */
function planFromStripeSubscription(sub) {
  const items = sub?.items?.data;
  if (!Array.isArray(items) || !items.length) {
    return { planSlug: CLERK_PLAN.FREE, priceId: null };
  }
  // Prefer active item if present.
  const active = items.find((it) => (it?.price?.active === true) || it?.plan?.active === true) || items[0];
  const priceId = active?.price?.id || active?.plan?.id || null;
  const slug = stripePriceToPlanSlug(priceId) || CLERK_PLAN.FREE;
  return { planSlug: slug, priceId: priceId ? String(priceId) : null };
}

module.exports = { stripePriceToPlanSlug, planFromStripeSubscription };

