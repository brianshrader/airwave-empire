'use strict';

const crypto = require('crypto');

/**
 * Stateless guest bearer tokens for anonymous onboarding (HMAC, no jwt dependency).
 * Format: base64url(payloadJson).base64url(hmacSha256)
 */
function guestJwtSecret() {
  const fromEnv = String(process.env.GUEST_JWT_SECRET || process.env.CLERK_SECRET_KEY || '').trim();
  if (fromEnv) return fromEnv;
  /** Local dev with MP auth bypass — mint guest tokens without Clerk dashboard secrets. */
  if (process.env.NODE_ENV !== 'production' && process.env.WL_ALLOW_MP_AUTH_BYPASS === '1') {
    return 'wl-dev-guest-jwt-not-for-production';
  }
  return '';
}

function signGuestToken(guestId) {
  const secret = guestJwtSecret();
  if (!secret) throw new Error('GUEST_JWT_SECRET or CLERK_SECRET_KEY required for guest tokens');
  const payload = Buffer.from(
    JSON.stringify({
      typ: 'wl_guest',
      sub: String(guestId),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    }),
    'utf8',
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** @returns {string|null} guest uuid */
function verifyGuestToken(token) {
  const secret = guestJwtSecret();
  if (!secret || !token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let j;
  try {
    j = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!j || j.typ !== 'wl_guest' || typeof j.sub !== 'string' || !j.sub.trim()) return null;
  if (typeof j.exp === 'number' && j.exp < Date.now() / 1000) return null;
  return j.sub.trim();
}

module.exports = { signGuestToken, verifyGuestToken, guestJwtSecret };
