'use strict';

const { resolveStripePlanForUser } = require('./stripePlanResolve');
const { marketIdsForPlanSlug } = require('./planMarkets');

function normalizeMarketId(marketId) {
  return String(marketId ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Resolve Stripe/account plan and allowed solo market ids for a Clerk user.
 * @param {string} clerkUserId
 * @returns {Promise<{ planSlug: string, allowedMarketIds: Set<string> }>}
 */
async function allowedMarketIdsForUser(clerkUserId) {
  const resolved = await resolveStripePlanForUser(clerkUserId);
  const planSlug = resolved.planSlug;
  return {
    planSlug,
    allowedMarketIds: new Set(marketIdsForPlanSlug(planSlug)),
  };
}

/**
 * @param {string} clerkUserId
 * @param {unknown} marketId — typically body.G.marketId
 * @returns {Promise<
 *   | { ok: true, planSlug: string, marketId: string }
 *   | { ok: false, planSlug: string, marketId: string | null }
 * >}
 */
async function checkMarketAllowedForUserPlan(clerkUserId, marketId) {
  const { planSlug, allowedMarketIds } = await allowedMarketIdsForUser(clerkUserId);
  const mid = normalizeMarketId(marketId);
  if (!mid || !allowedMarketIds.has(mid)) {
    return { ok: false, planSlug, marketId: mid || null };
  }
  return { ok: true, planSlug, marketId: mid };
}

/**
 * Cloud save write guard — 403 when market is outside plan entitlements.
 * @param {import('express').Response} res
 * @param {string} clerkUserId
 * @param {unknown} marketId
 * @returns {Promise<boolean>} true when write may proceed
 */
async function assertCloudSaveMarketAllowedForPlan(res, clerkUserId, marketId) {
  let check;
  try {
    check = await checkMarketAllowedForUserPlan(clerkUserId, marketId);
  } catch (e) {
    console.warn('[planMarketAccess] plan resolve failed:', e.message || e);
    res.status(503).json({
      error: 'plan_unavailable',
      code: 'plan_unavailable',
      message: 'Could not verify your subscription. Try again in a moment.',
    });
    return false;
  }
  if (check.ok) return true;
  res.status(403).json({
    error: 'market_not_allowed_for_plan',
    code: 'market_not_allowed_for_plan',
    message: 'This market is not included in your subscription plan.',
    marketId: check.marketId,
    plan: check.planSlug,
  });
  return false;
}

module.exports = {
  normalizeMarketId,
  allowedMarketIdsForUser,
  checkMarketAllowedForUserPlan,
  assertCloudSaveMarketAllowedForPlan,
};
