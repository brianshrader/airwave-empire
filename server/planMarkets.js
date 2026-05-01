'use strict';

const { CLERK_PLAN } = require('./aiEntitlements');

/** Same order as src/billingEntitlements.js / legacy.js scenario picker. */
const ALL_PLAYABLE_MARKET_IDS_ORDERED = Object.freeze([
  'newyork',
  'losangeles',
  'chicago',
  'seattle',
  'atlanta',
  'nashville',
  'wichita',
]);

/** Starter: five major markets (no Seattle/Wichita). */
const STARTER_MARKET_IDS = Object.freeze(['newyork', 'losangeles', 'chicago', 'atlanta', 'nashville']);
const FREE_USER_MARKET_IDS = Object.freeze(['atlanta']);

/** @param {string} [slug] */
function marketIdsForPlanSlug(slug) {
  const s = String(slug || '').trim();
  if (s === CLERK_PLAN.PRO || s === CLERK_PLAN.TRIAL) return [...ALL_PLAYABLE_MARKET_IDS_ORDERED];
  if (s === CLERK_PLAN.STARTER) {
    return [...STARTER_MARKET_IDS];
  }
  return [...FREE_USER_MARKET_IDS];
}

module.exports = { marketIdsForPlanSlug, ALL_PLAYABLE_MARKET_IDS_ORDERED, STARTER_MARKET_IDS };

