'use strict';

/**
 * Multiplayer host market entitlements — server-side enforcement.
 *
 * Enforcement model:
 * 1. **Initial set** — `start_draft` (primary client path) and legacy `start_game` validate the
 *    host's plan via `mpAllowedMarketIdsForHostSocket`, then pin `room.mpMarketId`.
 * 2. **Subsequent G writes** — `draft_complete`, `state_update`, and host `player_action` snapshots
 *    cannot change `G.marketId`; it is forced back to the pinned value.
 * 3. **Joiners** — not checked here; a free-tier guest may play in a host's entitled city.
 *
 * Local dev: sockets without `clerkUserId` (WL_ALLOW_MP_AUTH_BYPASS / no Clerk key) allow all
 * Phase-1 markets — unchanged from prior behavior.
 */

const { resolveStripePlanForUser } = require('./stripePlanResolve');
const { marketIdsForPlanSlug, ALL_PLAYABLE_MARKET_IDS_ORDERED } = require('./planMarkets');
const { normalizeMarketId } = require('./planMarketAccess');

const MP_MARKET_NOT_ALLOWED_MSG =
  'Your plan only allows hosting multiplayer in certain markets. Free tier: Atlanta only. Upgrade to Starter or Pro in Account to host in more cities.';

/**
 * @param {import('socket.io').Socket} socket
 * @returns {Promise<Set<string>>}
 */
async function mpAllowedMarketIdsForHostSocket(socket) {
  const uid = socket.data?.clerkUserId || null;
  if (!uid) {
    return new Set([...ALL_PLAYABLE_MARKET_IDS_ORDERED]);
  }
  try {
    const r = await resolveStripePlanForUser(uid);
    return new Set(marketIdsForPlanSlug(r.planSlug));
  } catch (e) {
    console.warn('[MP] plan resolve for host failed:', e.message || e);
    return new Set(['atlanta']);
  }
}

/** @param {unknown} G */
function marketIdFromGameState(G) {
  const mid = normalizeMarketId(G && typeof G === 'object' ? G.marketId : null);
  return mid || 'atlanta';
}

/**
 * Pin host entitlement on first G write; later snapshots cannot retarget another market.
 * @param {{ mpMarketId?: string | null }} room
 * @param {object | null | undefined} G
 */
function sanitizeMpHostGameState(room, G) {
  if (!G || typeof G !== 'object' || !room?.mpMarketId) return G;
  if (normalizeMarketId(G.marketId) === room.mpMarketId) return G;
  return { ...G, marketId: room.mpMarketId };
}

/**
 * @param {import('socket.io').Socket} socket
 * @param {unknown} marketId
 * @returns {Promise<{ ok: true, marketId: string } | { ok: false, marketId: string, message: string }>}
 */
async function assertMpHostMaySetMarket(socket, marketId) {
  const mid = normalizeMarketId(marketId) || 'atlanta';
  const allowed = await mpAllowedMarketIdsForHostSocket(socket);
  if (!allowed.has(mid)) {
    return { ok: false, marketId: mid, message: MP_MARKET_NOT_ALLOWED_MSG };
  }
  return { ok: true, marketId: mid };
}

module.exports = {
  MP_MARKET_NOT_ALLOWED_MSG,
  mpAllowedMarketIdsForHostSocket,
  marketIdFromGameState,
  sanitizeMpHostGameState,
  assertMpHostMaySetMarket,
};
