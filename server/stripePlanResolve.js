'use strict';

const accountStore = require('./accountStore');
const { CLERK_PLAN } = require('./aiEntitlements');
const { planFromStripeSubscription } = require('./stripePlan');

function billingSnapshotFromCache(clerkUserId) {
  let subscriptionActive = accountStore.getSubscriptionActive(clerkUserId);
  const subscriptionStatus = accountStore.getSubscriptionStatus(clerkUserId);
  if (!subscriptionActive && (subscriptionStatus === 'active' || subscriptionStatus === 'trialing')) {
    subscriptionActive = true;
  }
  return {
    stripeCustomerId: accountStore.getStripeCustomerId(clerkUserId),
    subscriptionActive,
    subscriptionStatus,
    subscriptionId: accountStore.getSubscriptionId(clerkUserId),
    subscriptionPriceId: accountStore.getSubscriptionPriceId(clerkUserId),
    subscriptionCurrentPeriodEnd: accountStore.getSubscriptionCurrentPeriodEnd(clerkUserId),
    subscriptionCancelAtPeriodEnd: accountStore.getSubscriptionCancelAtPeriodEnd(clerkUserId),
  };
}

/** Paid slug but inactive flag and no webhook status — re-fetch from Stripe to refresh JSON cache. */
function paidSlugNeedsStripeRefresh(clerkUserId, cachedSlug) {
  if (cachedSlug !== CLERK_PLAN.STARTER && cachedSlug !== CLERK_PLAN.PRO) return false;
  if (accountStore.getSubscriptionActive(clerkUserId)) return false;
  const st = accountStore.getSubscriptionStatus(clerkUserId);
  if (st === 'active' || st === 'trialing') return false;
  if (st && st !== 'none') return false;
  return true;
}

function trialOrFree(clerkUserId, source) {
  const billing = billingSnapshotFromCache(clerkUserId);
  if (accountStore.getEverHadPaidSubscription(clerkUserId)) {
    return { planSlug: CLERK_PLAN.FREE, source, billing };
  }
  if (accountStore.getTrialGameCompleted(clerkUserId)) {
    return { planSlug: CLERK_PLAN.FREE, source, billing };
  }
  return { planSlug: CLERK_PLAN.TRIAL, source: 'trial', billing };
}

/**
 * Best-effort: paid plans from Stripe cache/API; unpaid → signup trial (until Fall 2020 completed) or free tier.
 *
 * @param {string} clerkUserId
 * @returns {Promise<{ planSlug: string, source: string, billing?: object }>}
 */
async function resolveStripePlanForUser(clerkUserId) {
  accountStore.repairSubscriptionActiveIfStatusSaysSo(clerkUserId);

  const cachedSlug = accountStore.getSubscriptionPlanSlug(clerkUserId);
  if (
    (cachedSlug === CLERK_PLAN.STARTER || cachedSlug === CLERK_PLAN.PRO) &&
    !paidSlugNeedsStripeRefresh(clerkUserId, cachedSlug)
  ) {
    return { planSlug: cachedSlug, source: 'cache', billing: billingSnapshotFromCache(clerkUserId) };
  }

  const secret = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) {
    return trialOrFree(clerkUserId, 'free');
  }
  const stripe = require('stripe')(secret);

  let customerId = accountStore.getStripeCustomerId(clerkUserId);
  if (!customerId) {
    const found = await stripe.customers.search({
      query: `metadata['clerk_user_id']:'${clerkUserId}'`,
      limit: 1,
    });
    if (found.data.length) {
      customerId = found.data[0].id;
      accountStore.setStripeCustomerId(clerkUserId, customerId);
    }
  }
  if (!customerId) {
    return trialOrFree(clerkUserId, 'stripe');
  }

  const pick = async (status) => {
    const r = await stripe.subscriptions.list({ customer: customerId, status, limit: 1 });
    return r.data && r.data.length ? r.data[0] : null;
  };
  const sub = (await pick('active')) || (await pick('trialing'));
  if (!sub) {
    accountStore.setSubscriptionState(clerkUserId, {
      active: false,
      status: 'none',
      subscriptionId: null,
      priceId: null,
      planSlug: CLERK_PLAN.FREE,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: null,
    });
    return trialOrFree(clerkUserId, 'stripe');
  }

  const { planSlug, priceId } = planFromStripeSubscription(sub);
  accountStore.setSubscriptionState(clerkUserId, {
    active: ['active', 'trialing'].includes(sub.status),
    status: sub.status,
    subscriptionId: sub.id,
    priceId,
    planSlug,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  });
  if (planSlug === CLERK_PLAN.STARTER || planSlug === CLERK_PLAN.PRO) {
    accountStore.setEverHadPaidSubscription(clerkUserId, true);
  }
  return { planSlug, source: 'stripe', billing: billingSnapshotFromCache(clerkUserId) };
}

module.exports = { resolveStripePlanForUser };
