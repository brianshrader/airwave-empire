/**
 * Billing entitlements — plan → playable market ids.
 * Source of truth for *who paid*: server-side Stripe subscription (resolved via /api/entitlements).
 */

export const CLERK_PLAN = {
  FREE: 'free_user',
  TRIAL: 'trial_user',
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

/** Starter: NYC, LA, Chicago, Atlanta, Nashville — matches server/planMarkets.js */
const STARTER_MARKET_IDS = Object.freeze(['newyork', 'losangeles', 'chicago', 'atlanta', 'nashville']);

/** Free / default: one market (Atlanta). */
const FREE_USER_MARKET_IDS = Object.freeze(['atlanta']);

/**
 * @param {string} [slug] — Clerk plan `slug` (Dashboard "Plan key"); defaults to free.
 * @returns {string[]}
 */
export function marketIdsForClerkPlanSlug(slug) {
  const s = String(slug || '').trim();
  if (s === CLERK_PLAN.PRO || s === CLERK_PLAN.TRIAL) return [...ALL_PLAYABLE_MARKET_IDS_ORDERED];
  if (s === CLERK_PLAN.STARTER) {
    return [...STARTER_MARKET_IDS];
  }
  return [...FREE_USER_MARKET_IDS];
}

/**
 * @param {import('@clerk/clerk-js').Clerk | null} clerk
 * @returns {Promise<string>}
 */
export async function fetchServerPlanSlug(clerk) {
  if (!clerk?.isSignedIn) return CLERK_PLAN.FREE;
  try {
    const token = await clerk.session?.getToken?.();
    if (!token) return CLERK_PLAN.FREE;
    let origin =
      (typeof window !== 'undefined' && window.__WL_GAME_SERVER_URL && String(window.__WL_GAME_SERVER_URL).trim()) ||
      '';
    if (origin && typeof window !== 'undefined' && window.location?.port === '5173') {
      try {
        const ou = new URL(origin.replace(/\/$/, ''));
        if (ou.origin !== window.location.origin) origin = '';
      } catch (_e) {
        origin = '';
      }
    }
    const url = origin ? `${origin.replace(/\/$/, '')}/api/entitlements` : '/api/entitlements';
    const r = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json().catch(() => ({}));
    const slug = typeof j.plan === 'string' ? j.plan.trim() : '';
    if (!r.ok || !j.ok) return CLERK_PLAN.FREE;
    if (
      slug === CLERK_PLAN.STARTER ||
      slug === CLERK_PLAN.PRO ||
      slug === CLERK_PLAN.FREE ||
      slug === CLERK_PLAN.TRIAL
    )
      return slug;
  } catch (e) {
    console.warn('[entitlements] plan fetch failed:', String(e?.message || e || ''));
  }
  return CLERK_PLAN.FREE;
}

/**
 * Sets `window.__WL_CLERK_PLAN_SLUG` and `window.__WL_PLAN_MARKET_IDS`.
 * @param {import('@clerk/clerk-js').Clerk | null} clerk
 */
export async function syncPlanMarkets(clerk) {
  const slug = await fetchServerPlanSlug(clerk);
  const marketIds = marketIdsForClerkPlanSlug(slug);
  if (typeof window !== 'undefined') {
    window.__WL_CLERK_PLAN_SLUG = slug;
    window.__WL_PLAN_MARKET_IDS = marketIds;
  }
  return { slug, marketIds };
}
