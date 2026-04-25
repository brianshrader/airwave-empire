/**
 * Clerk Billing (B2C) — plan → playable market ids.
 * Source of truth for *who paid*: Clerk (`clerk.billing.getSubscription()`).
 * This module only maps plan slugs to entitlements; server enforcement comes later.
 */

export const CLERK_PLAN = {
  FREE: 'free_user',
  STARTER: 'starter',
  PRO: 'pro',
};

/** Same order as ALL_PLAYABLE_MARKET_IDS in legacy.js (scenario button order). */
export const ALL_PLAYABLE_MARKET_IDS_ORDERED = Object.freeze([
  'newyork',
  'losangeles',
  'chicago',
  'seattle',
  'atlanta',
  'nashville',
  'wichita',
]);

const STARTER_EXCLUDED = 'seattle';

/** Free / default: one market (Atlanta). */
const FREE_USER_MARKET_IDS = Object.freeze(['atlanta']);

/**
 * @param {string} [slug] — Clerk plan `slug` (Dashboard "Plan key"); defaults to free.
 * @returns {string[]}
 */
export function marketIdsForClerkPlanSlug(slug) {
  const s = String(slug || '').trim();
  if (s === CLERK_PLAN.PRO) return [...ALL_PLAYABLE_MARKET_IDS_ORDERED];
  if (s === CLERK_PLAN.STARTER) {
    return ALL_PLAYABLE_MARKET_IDS_ORDERED.filter((id) => id !== STARTER_EXCLUDED);
  }
  return [...FREE_USER_MARKET_IDS];
}

/**
 * @param {import('@clerk/clerk-js').Clerk | null} clerk
 * @returns {Promise<string>}
 */
export async function fetchClerkPlanSlug(clerk) {
  if (!clerk?.isSignedIn) return CLERK_PLAN.FREE;
  const billing = clerk.billing;
  if (!billing || typeof billing.getSubscription !== 'function') return CLERK_PLAN.FREE;
  try {
    const sub = await billing.getSubscription({});
    if (!sub?.subscriptionItems?.length) return CLERK_PLAN.FREE;
    const active = sub.subscriptionItems.filter((i) => i.status === 'active');
    const item = active[0] || sub.subscriptionItems[0];
    const plan = item?.plan;
    const slug = (plan?.slug && String(plan.slug).trim()) || '';
    if (slug === CLERK_PLAN.STARTER || slug === CLERK_PLAN.PRO || slug === CLERK_PLAN.FREE) return slug;
    if (slug) return slug;
  } catch (e) {
    const msg = String(e?.message || e || '');
    console.warn('[Clerk billing] getSubscription failed:', msg);
    if (/payee is not active/i.test(msg)) {
      console.warn(
        '[Clerk billing] "Payee is not active" means Stripe (via Clerk Billing) is not fully connected or the Connect account cannot charge yet. In Clerk Dashboard open Billing / Stripe, finish Connect onboarding and use Test mode until payouts are set up. Until then, the app falls back to the free plan for markets.',
      );
    }
  }
  return CLERK_PLAN.FREE;
}

/**
 * Sets `window.__WL_CLERK_PLAN_SLUG` and `window.__WL_PLAN_MARKET_IDS`.
 * @param {import('@clerk/clerk-js').Clerk | null} clerk
 */
export async function syncClerkPlanMarkets(clerk) {
  const slug = await fetchClerkPlanSlug(clerk);
  const marketIds = marketIdsForClerkPlanSlug(slug);
  if (typeof window !== 'undefined') {
    window.__WL_CLERK_PLAN_SLUG = slug;
    window.__WL_PLAN_MARKET_IDS = marketIds;
  }
  return { slug, marketIds };
}
