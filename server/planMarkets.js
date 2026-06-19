'use strict';

const { CLERK_PLAN } = require('./aiEntitlements');

/** Same order as src/billingEntitlements.js / legacy.js scenario picker. */
const ALL_PLAYABLE_MARKET_IDS_ORDERED = Object.freeze([
  'newyork',
  'losangeles',
  'chicago',
  'seattle',
  'sanfrancisco',
  'atlanta',
  'nashville',
  'wichita',
  'phoenix',
]);

/** Starter: five major markets (no Pro-only cities). */
const STARTER_MARKET_IDS = Object.freeze(['newyork', 'losangeles', 'chicago', 'atlanta', 'nashville']);
const FREE_USER_MARKET_IDS = Object.freeze(['atlanta']);
/** Pro plan only — keep in sync with src/billingEntitlements.js */
const PRO_ONLY_MARKET_IDS = Object.freeze(['seattle', 'sanfrancisco', 'wichita', 'phoenix']);
const PRO_ONLY_SET = new Set(PRO_ONLY_MARKET_IDS);

/** @param {string} [slug] */
function marketIdsForPlanSlug(slug) {
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

module.exports = {
  marketIdsForPlanSlug,
  ALL_PLAYABLE_MARKET_IDS_ORDERED,
  STARTER_MARKET_IDS,
  PRO_ONLY_MARKET_IDS,
};

