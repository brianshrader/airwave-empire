/**
 * Cloud saves and other subscriber-only features.
 * When STRIPE_SECRET_KEY is set, require an active/trialing Stripe subscription unless
 * CLOUD_SAVE_REQUIRE_SUBSCRIPTION=0 (local testing).
 */
const accountStore = require('./accountStore');

function subscriptionCheckEnabled() {
  if (process.env.CLOUD_SAVE_REQUIRE_SUBSCRIPTION === '0') return false;
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * @returns {Promise<boolean>}
 */
async function userHasActiveSubscription(clerkUserId) {
  if (!subscriptionCheckEnabled()) return true;

  if (accountStore.getSubscriptionActive(clerkUserId)) return true;

  const secret = process.env.STRIPE_SECRET_KEY;
  const stripe = require('stripe')(secret);

  let customerId = accountStore.getStripeCustomerId(clerkUserId);
  if (!customerId) {
    try {
      const found = await stripe.customers.search({
        query: `metadata['clerk_user_id']:'${clerkUserId}'`,
        limit: 1,
      });
      if (found.data.length) {
        customerId = found.data[0].id;
        accountStore.setStripeCustomerId(clerkUserId, customerId);
      }
    } catch (e) {
      console.warn('[SUB] customer search failed:', e.message);
    }
  }
  if (!customerId) return false;

  const active = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  });
  if (active.data.length) {
    const s = active.data[0];
    accountStore.setSubscriptionState(clerkUserId, {
      active: true,
      status: s.status,
      subscriptionId: s.id,
    });
    return true;
  }
  const trialing = await stripe.subscriptions.list({
    customer: customerId,
    status: 'trialing',
    limit: 1,
  });
  if (trialing.data.length) {
    const s = trialing.data[0];
    accountStore.setSubscriptionState(clerkUserId, {
      active: true,
      status: s.status,
      subscriptionId: s.id,
    });
    return true;
  }

  accountStore.setSubscriptionState(clerkUserId, {
    active: false,
    status: 'none',
    subscriptionId: null,
  });
  return false;
}

module.exports = {
  subscriptionCheckEnabled,
  userHasActiveSubscription,
};
