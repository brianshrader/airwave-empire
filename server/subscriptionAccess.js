/**
 * Cloud saves and other subscriber-only features.
 * Paid Starter/Pro, or the one-time signup trial (trial_user), qualify when STRIPE_SECRET_KEY is set,
 * unless CLOUD_SAVE_REQUIRE_SUBSCRIPTION=0 (local testing).
 */
const { CLERK_PLAN } = require('./aiEntitlements');
const { resolveStripePlanForUser } = require('./stripePlanResolve');

function subscriptionCheckEnabled() {
  if (process.env.CLOUD_SAVE_REQUIRE_SUBSCRIPTION === '0') return false;
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * @returns {Promise<boolean>}
 */
async function userHasActiveSubscription(clerkUserId) {
  if (!subscriptionCheckEnabled()) return true;
  try {
    const r = await resolveStripePlanForUser(clerkUserId);
    const p = r.planSlug;
    return p === CLERK_PLAN.STARTER || p === CLERK_PLAN.PRO || p === CLERK_PLAN.TRIAL;
  } catch (e) {
    console.warn('[SUB] plan resolve failed:', e.message || e);
    return false;
  }
}

/** Rolling cloud autosave — paid Starter/Pro only (not signup trial). */
async function userCloudAutosaveEligible(clerkUserId) {
  if (!subscriptionCheckEnabled()) return true;
  try {
    const r = await resolveStripePlanForUser(clerkUserId);
    const p = r.planSlug;
    return p === CLERK_PLAN.STARTER || p === CLERK_PLAN.PRO;
  } catch (e) {
    console.warn('[SUB] cloud autosave plan resolve failed:', e.message || e);
    return false;
  }
}

module.exports = {
  subscriptionCheckEnabled,
  userHasActiveSubscription,
  userCloudAutosaveEligible,
};
