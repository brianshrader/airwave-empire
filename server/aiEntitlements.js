'use strict';

/**
 * AI monthly quotas (UTC calendar month) — same numbers as docs/ENTITLEMENTS.md.
 * Plan slugs: Clerk Dashboard plan keys.
 */
const CLERK_PLAN = {
  FREE: 'free_user',
  /** One-time signup trial — full markets; AI caps enforced in trialQuotaStore + aiQuotaHttp (not monthly LIMITS). */
  TRIAL: 'trial_user',
  STARTER: 'starter',
  PRO: 'pro',
};

const LIMITS = {
  [CLERK_PLAN.FREE]: { logo: 5, jingle: 2, van: 3 },
  [CLERK_PLAN.STARTER]: { logo: 40, jingle: 15, van: 20 },
  [CLERK_PLAN.PRO]: { logo: 200, jingle: 80, van: 100 },
};

/** @param {string} slug */
function defaultLimitsForUnknownSlug(slug) {
  const s = String(slug || '').trim();
  if (s === CLERK_PLAN.STARTER || s === CLERK_PLAN.PRO) return { ...LIMITS[s] };
  if (s === CLERK_PLAN.TRIAL) return { ...LIMITS[CLERK_PLAN.FREE] }; /* not used — trial uses lifetime caps */
  if (s === CLERK_PLAN.FREE) return { ...LIMITS[CLERK_PLAN.FREE] };
  if (!s) return { ...LIMITS[CLERK_PLAN.FREE] };
  return { ...LIMITS[CLERK_PLAN.FREE] };
}

/**
 * @param {string} slug
 * @param {'logo' | 'jingle' | 'van'} kind
 */
function monthlyLimitForPlan(slug, kind) {
  return defaultLimitsForUnknownSlug(slug)[kind];
}

module.exports = {
  CLERK_PLAN,
  LIMITS,
  defaultLimitsForUnknownSlug,
  monthlyLimitForPlan,
};
