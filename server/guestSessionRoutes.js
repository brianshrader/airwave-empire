'use strict';

const crypto = require('crypto');
const { signGuestToken, guestJwtSecret } = require('./guestJwt');

/** Simple sliding window per IP for POST /api/guest/session */
const RATE = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_MINTS_PER_WINDOW = 40;

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function rateOk(ip) {
  const now = Date.now();
  let e = RATE.get(ip);
  if (!e || now - e.t > WINDOW_MS) {
    e = { t: now, n: 0 };
  }
  e.n += 1;
  e.t = now;
  RATE.set(ip, e);
  return e.n <= MAX_MINTS_PER_WINDOW;
}

/**
 * @param {import('express').Express} app
 */
function mountGuestSessionRoutes(app) {
  app.post('/api/guest/session', (req, res) => {
    try {
      if (!guestJwtSecret()) {
        return res.status(503).json({
          ok: false,
          code: 'guest_unconfigured',
          error: 'Guest sessions are not configured on this server.',
        });
      }
      const ip = clientIp(req);
      if (!rateOk(ip)) {
        return res.status(429).json({
          ok: false,
          code: 'rate_limited',
          error: 'Too many requests. Try again later.',
        });
      }
      const guestId = crypto.randomUUID();
      const token = signGuestToken(guestId);
      return res.json({ ok: true, token, guestId });
    } catch (e) {
      console.error('[guest/session]', e.message || e);
      return res.status(500).json({ ok: false, error: 'Could not create guest session.' });
    }
  });
}

module.exports = { mountGuestSessionRoutes };
