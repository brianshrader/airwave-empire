'use strict';

const { planFromStripeSubscription } = require('./stripePlan');
const { CLERK_PLAN } = require('./aiEntitlements');

/** Higher rank = stronger entitlement. */
function planRank(slug) {
  const s = String(slug || '').trim();
  if (s === CLERK_PLAN.PRO) return 3;
  if (s === CLERK_PLAN.STARTER) return 2;
  if (s === CLERK_PLAN.TRIAL) return 1;
  if (s === CLERK_PLAN.FREE) return 0;
  return 0;
}

/**
 * Any subscription that should block a new Checkout (avoid duplicate active subs).
 * @param {import('stripe').Stripe} stripe
 * @param {string} customerId
 * @returns {Promise<object|null>}
 */
async function findOpenSubscriptionForCustomer(stripe, customerId) {
  for (const status of ['active', 'trialing', 'past_due']) {
    const r = await stripe.subscriptions.list({ customer: customerId, status, limit: 1 });
    if (r.data?.[0]) return r.data[0];
  }
  return null;
}

/**
 * When a customer has multiple active/trialing subs, pick the highest tier for entitlements.
 * @param {import('stripe').Stripe} stripe
 * @param {string} customerId
 * @returns {Promise<object|null>}
 */
async function pickBestActiveSubscription(stripe, customerId) {
  const subs = [];
  for (const status of ['active', 'trialing']) {
    const r = await stripe.subscriptions.list({ customer: customerId, status, limit: 100 });
    if (r.data?.length) subs.push(...r.data);
  }
  if (!subs.length) return null;
  let best = subs[0];
  let bestRank = planRank(planFromStripeSubscription(best).planSlug);
  for (let i = 1; i < subs.length; i++) {
    const rank = planRank(planFromStripeSubscription(subs[i]).planSlug);
    if (rank > bestRank) {
      best = subs[i];
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Portal session for plan changes (never a second Checkout subscription).
 * @param {import('stripe').Stripe} stripe
 * @param {{ customerId: string, returnUrl: string, requestedPriceId?: string, existingSub: object }} opts
 */
async function createPortalSessionForExistingSubscriber(stripe, opts) {
  const { customerId, returnUrl, requestedPriceId, existingSub } = opts;
  const base = { customer: customerId, return_url: returnUrl };

  let sub = existingSub;
  const firstItem = sub.items?.data?.[0];
  if (!firstItem?.price?.id && !firstItem?.plan?.id) {
    sub = await stripe.subscriptions.retrieve(existingSub.id, { expand: ['items.data.price'] });
  }
  const item = sub.items?.data?.[0];
  const currentPriceId = item?.price?.id || item?.plan?.id || null;

  if (
    requestedPriceId &&
    item?.id &&
    currentPriceId &&
    requestedPriceId !== currentPriceId
  ) {
    try {
      return await stripe.billingPortal.sessions.create({
        ...base,
        flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: sub.id,
            items: [{ id: item.id, price: requestedPriceId, quantity: 1 }],
          },
        },
      });
    } catch (e) {
      const msg = e && e.message ? String(e.message) : String(e);
      console.warn(
        '[STRIPE] subscription_update_confirm portal flow failed, using default portal:',
        msg,
      );
    }
  }

  return stripe.billingPortal.sessions.create(base);
}

module.exports = {
  findOpenSubscriptionForCustomer,
  pickBestActiveSubscription,
  createPortalSessionForExistingSubscriber,
  planRank,
};
