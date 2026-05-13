'use strict';

/**
 * Resolve Stripe Customer id from a Clerk user id using Customer metadata search.
 * Tries `clerk_user_id` first (canonical in this app), then `user_id` (legacy / manual Dashboard).
 *
 * @param {import('stripe').Stripe} stripe
 * @param {string} clerkUserId
 * @returns {Promise<string|null>}
 */
async function findCustomerIdByClerkUserId(stripe, clerkUserId) {
  const uid = String(clerkUserId || '').trim();
  if (!uid) return null;
  for (const key of ['clerk_user_id', 'user_id']) {
    const found = await stripe.customers.search({
      query: `metadata['${key}']:'${uid}'`,
      limit: 1,
    });
    if (found.data?.length) return found.data[0].id;
  }
  return null;
}

/**
 * @param {Record<string, string>|null|undefined} metadata
 * @returns {string|null}
 */
function clerkUserIdFromCustomerMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const a = metadata.clerk_user_id;
  const b = metadata.user_id;
  if (typeof a === 'string' && a.trim()) return a.trim();
  if (typeof b === 'string' && b.trim()) return b.trim();
  return null;
}

/**
 * Resolve Clerk user id from a Checkout Session (client_reference_id first, then metadata).
 * @param {object|null|undefined} session
 * @returns {string|null}
 */
function clerkUserIdFromCheckoutSession(session) {
  if (!session || typeof session !== 'object') return null;
  const cr = session.client_reference_id;
  if (typeof cr === 'string' && cr.trim()) {
    const id = cr.trim();
    if (id.startsWith('user_')) return id;
  }
  const m = session.metadata;
  if (m && typeof m === 'object') {
    if (typeof m.clerk_user_id === 'string' && m.clerk_user_id.trim()) return m.clerk_user_id.trim();
    if (typeof m.clerkUserId === 'string' && m.clerkUserId.trim()) return m.clerkUserId.trim();
  }
  return null;
}

module.exports = {
  findCustomerIdByClerkUserId,
  clerkUserIdFromCustomerMetadata,
  clerkUserIdFromCheckoutSession,
};
