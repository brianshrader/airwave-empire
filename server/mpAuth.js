/**
 * Clerk JWT verification for Socket.io (multiplayer + authenticated features).
 *
 * Requires CLERK_SECRET_KEY in production (see server/validateEnv.js).
 * Development without a key: only allowed when WL_ALLOW_MP_AUTH_BYPASS=1 (explicit opt-in).
 */
function attachSocketAuth(io) {
  io.use(async (socket, next) => {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret || typeof secret !== 'string' || !secret.trim()) {
      socket.data.clerkUserId = null;
      return next();
    }
    // TV/spectate board: allow unauthenticated read-only (see spectate.html)
    const auth = socket.handshake.auth || {};
    if (auth.spectate === true && !auth.token) {
      socket.data.clerkUserId = null;
      socket.data.spectator = true;
      return next();
    }
    const token = auth.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('auth_required'));
    }
    try {
      const { verifyToken } = require('@clerk/backend');
      const payload = await verifyToken(token, {
        secretKey: secret.trim(),
      });
      socket.data.clerkUserId = payload.sub || null;
      next();
    } catch (e) {
      console.warn('[AUTH] Clerk verify failed:', e.message);
      return next(new Error('invalid_token'));
    }
  });
}

module.exports = { attachSocketAuth };
