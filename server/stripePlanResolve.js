'use strict';

const accountStore = require('./accountStore');
const { CLERK_PLAN } = require('./aiEntitlements');
const { planFromStripeSubscription } = require('./stripePlan');
const { fetchClerkBillingPlanSlug } = require('./clerkBillingPlan');
const { findCustomerIdByClerkUserId } = require('./stripeCustomerLookup');

/** When unset/falsy, Clerk Billing API is never called (Stripe + accountStore only). */
function clerkBillingMergeEnabled() {
  return String(process.env.WL_USE_CLERK_BILLING || '')
    .trim()
    .toLowerCase() === '1';
}

let clerkBillingHttp403Logged = false;

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

/** Higher rank = stronger entitlement (merge Stripe vs Clerk Billing). */
function planRank(slug) {
  const s = String(slug || '').trim();
  if (s === CLERK_PLAN.PRO) return 3;
  if (s === CLERK_PLAN.STARTER) return 2;
  if (s === CLERK_PLAN.TRIAL) return 1;
  if (s === CLERK_PLAN.FREE) return 0;
  return 0;
}

/**
 * Optional: Clerk Billing (Dashboard plans) when WL_USE_CLERK_BILLING=1. Otherwise unused — Stripe + accountStore only.
 */
async function mergeClerkBillingIfStronger(clerkUserId, resolved) {
  if (!clerkBillingMergeEnabled()) {
    return resolved;
  }
  if (resolved.planSlug === CLERK_PLAN.PRO) {
    return resolved;
  }
  try {
    const clerkSlug = await fetchClerkBillingPlanSlug(clerkUserId);
    const best =
      planRank(clerkSlug) > planRank(resolved.planSlug) ? clerkSlug : resolved.planSlug;
    if (best === resolved.planSlug) {
      return resolved;
    }
    if (best === CLERK_PLAN.STARTER || best === CLERK_PLAN.PRO) {
      accountStore.setSubscriptionState(clerkUserId, {
        active: true,
        status: 'active',
        subscriptionId: accountStore.getSubscriptionId(clerkUserId),
        priceId: accountStore.getSubscriptionPriceId(clerkUserId),
        planSlug: best,
        currentPeriodEnd: accountStore.getSubscriptionCurrentPeriodEnd(clerkUserId),
        cancelAtPeriodEnd: accountStore.getSubscriptionCancelAtPeriodEnd(clerkUserId),
      });
    }
    return {
      planSlug: best,
      source: 'clerk_billing',
      billing: billingSnapshotFromCache(clerkUserId),
    };
  } catch (e) {
    if (e && e.code === 'CLERK_BILLING_AUTH' && e.status === 403) {
      if (!clerkBillingHttp403Logged) {
        clerkBillingHttp403Logged = true;
        console.warn(
          '[stripePlanResolve] Clerk Billing API returned 403 (feature not enabled for this instance).',
          'Unset WL_USE_CLERK_BILLING or enable Clerk Billing in Dashboard.',
        );
      }
      return resolved;
    }
    const msg = e && e.message ? String(e.message) : String(e);
    console.warn('[stripePlanResolve] Clerk billing merge skipped:', msg);
    return resolved;
  }
}

/**
 * Best-effort: paid plans from Stripe cache/API; unpaid → signup trial (until Fall 2020 completed) or free tier.
 * When WL_USE_CLERK_BILLING=1, optional Clerk Billing plan can be merged; default is Stripe + accountStore only.
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
    const fromCache = { planSlug: cachedSlug, source: 'cache', billing: billingSnapshotFromCache(clerkUserId) };
    return mergeClerkBillingIfStronger(clerkUserId, fromCache);
  }

  const secret = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) {
    const r = await mergeClerkBillingIfStronger(clerkUserId, trialOrFree(clerkUserId, 'free'));
    return r;
  }
  const stripe = require('stripe')(secret);

  let customerId = accountStore.getStripeCustomerId(clerkUserId);
  if (!customerId) {
    customerId = await findCustomerIdByClerkUserId(stripe, clerkUserId);
    if (customerId) {
      accountStore.setStripeCustomerId(clerkUserId, customerId);
    }
  }
  if (!customerId) {
    return mergeClerkBillingIfStronger(clerkUserId, trialOrFree(clerkUserId, 'stripe'));
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
    return mergeClerkBillingIfStronger(clerkUserId, trialOrFree(clerkUserId, 'stripe'));
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
  const fromStripe = { planSlug, source: 'stripe', billing: billingSnapshotFromCache(clerkUserId) };
  return mergeClerkBillingIfStronger(clerkUserId, fromStripe);
}

module.exports = { resolveStripePlanForUser };
