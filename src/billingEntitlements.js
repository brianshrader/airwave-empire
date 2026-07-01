/**
 * Billing entitlements — plan → playable market ids.
 * Server `/api/entitlements` resolves Stripe subscriptions (+ accountStore). Optional Clerk Billing merge only when WL_USE_CLERK_BILLING=1 on the server.
 */

import { captureEvent } from './analyticsClient.js';
import { applyPlaytestPlanOverrideAfterEntitlementsSync } from './playtestUrlFlags.js';

export const CLERK_PLAN = {
  FREE: 'free_user',
  TRIAL: 'trial_user',
  STARTER: 'starter',
  PRO: 'pro',
};

/** Same order as ALL_PLAYABLE_MARKET_IDS in legacy.js (Nielsen DMA rank). */
export const ALL_PLAYABLE_MARKET_IDS_ORDERED = Object.freeze([
  'newyork',
  'losangeles',
  'chicago',
  'sanfrancisco',
  'dallas',
  'houston',
  'atlanta',
  'seattle',
  'phoenix',
  'nashville',
  'wichita',
]);

/** Starter: NYC, LA, Chicago, Atlanta, Nashville — matches server/planMarkets.js */
const STARTER_MARKET_IDS = Object.freeze(['newyork', 'losangeles', 'chicago', 'atlanta', 'nashville']);

/** Free / default: one market (Atlanta). */
const FREE_USER_MARKET_IDS = Object.freeze(['atlanta']);

/** Pro plan only — keep in sync with server/planMarkets.js */
export const PRO_ONLY_MARKET_IDS = Object.freeze(['seattle', 'sanfrancisco', 'wichita', 'phoenix', 'dallas', 'houston']);

const PRO_ONLY_SET = new Set(PRO_ONLY_MARKET_IDS);

/**
 * @param {string} [slug] — Clerk plan `slug` (Dashboard "Plan key"); defaults to free.
 * @returns {string[]}
 */
export function marketIdsForClerkPlanSlug(slug) {
  const s = String(slug || '').trim();
  if (s === CLERK_PLAN.PRO) return [...ALL_PLAYABLE_MARKET_IDS_ORDERED];
  if (s === CLERK_PLAN.TRIAL) {
    return ALL_PLAYABLE_MARKET_IDS_ORDERED.filter((id) => !PRO_ONLY_SET.has(id));
  }
  if (s === CLERK_PLAN.STARTER) {
    return [...STARTER_MARKET_IDS];
  }
  return [...FREE_USER_MARKET_IDS];
}

/** @param {string} marketId */
export function isProOnlyMarketId(marketId) {
  return PRO_ONLY_SET.has(String(marketId || '').trim());
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
    try {
      captureEvent('api_error', { endpoint_group: 'entitlements', status: 0, context: 'fetch_failed' });
    } catch (_e) {}
  }
  return CLERK_PLAN.FREE;
}

function gameApiBaseUrl() {
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
  return origin ? `${origin.replace(/\/$/, '')}` : '';
}

/**
 * Sets plan globals plus `window.__WL_TRIAL_LOCK_KIND` / `window.__WL_TRIAL_LOCKED_MARKET_ID` on signup trial.
 * @param {import('@clerk/clerk-js').Clerk | null} clerk
 */
export async function syncPlanMarkets(clerk) {
  const slug = await fetchServerPlanSlug(clerk);
  const marketIds = marketIdsForClerkPlanSlug(slug);
  if (typeof window !== 'undefined') {
    window.__WL_CLERK_PLAN_SLUG = slug;
    window.__WL_PLAN_MARKET_IDS = marketIds;
    window.__WL_PRO_ONLY_MARKET_IDS = [...PRO_ONLY_MARKET_IDS];

    if (slug === CLERK_PLAN.TRIAL && clerk?.isSignedIn) {
      try {
        const token = await clerk.session?.getToken?.();
        if (token) {
          const base = gameApiBaseUrl();
          const url = base ? `${base}/api/trial/quota` : '/api/trial/quota';
          const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          const j = await r.json().catch(() => ({}));
          const tk = typeof j.trialLockKind === 'string' ? j.trialLockKind.trim() : '';
          const lm = typeof j.lockedMarketId === 'string' ? j.lockedMarketId.trim() : '';
          window.__WL_TRIAL_LOCK_KIND = r.ok && j.ok && j.trial && tk ? tk : '';
          window.__WL_TRIAL_LOCKED_MARKET_ID = r.ok && j.ok && j.trial && lm ? lm : '';
        } else {
          window.__WL_TRIAL_LOCK_KIND = '';
          window.__WL_TRIAL_LOCKED_MARKET_ID = '';
        }
      } catch (_e) {
        window.__WL_TRIAL_LOCK_KIND = '';
        window.__WL_TRIAL_LOCKED_MARKET_ID = '';
      }
    } else {
      window.__WL_TRIAL_LOCK_KIND = '';
      window.__WL_TRIAL_LOCKED_MARKET_ID = '';
    }
  }
  try {
    const prev = typeof window !== 'undefined' ? window.__WL_ANALYTICS_ENTITLEMENT_SLUG : '';
    if (typeof window !== 'undefined' && prev !== slug) {
      window.__WL_ANALYTICS_ENTITLEMENT_SLUG = slug;
      const plan =
        slug === CLERK_PLAN.STARTER
          ? 'starter'
          : slug === CLERK_PLAN.PRO
            ? 'pro'
            : slug === CLERK_PLAN.TRIAL
              ? 'trial'
              : 'free';
      captureEvent('subscription_access_detected', {
        plan,
        selected_plan: plan,
        status: 'unknown',
        source: 'entitlement_refresh',
      });
    }
  } catch (_e) {}
  const playtestOverride = applyPlaytestPlanOverrideAfterEntitlementsSync();
  if (playtestOverride && typeof window !== 'undefined') {
    return {
      slug: playtestOverride,
      marketIds: window.__WL_PLAN_MARKET_IDS || marketIdsForClerkPlanSlug(playtestOverride),
    };
  }
  return { slug, marketIds };
}
