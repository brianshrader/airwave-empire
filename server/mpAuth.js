/**
 * Optional Clerk JWT verification for Socket.io connections.
 * When CLERK_SECRET_KEY is unset, all connections are allowed (local / LAN dev).
 */
function attachSocketAuth(io) {
  io.use(async (socket, next) => {
    if (!process.env.CLERK_SECRET_KEY) {
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
        secretKey: process.env.CLERK_SECRET_KEY,
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
