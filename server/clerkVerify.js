'use strict';

/**
 * Optional allowlist for Clerk session JWT `azp` (SPA origin).
 * Example: CLERK_AUTHORIZED_PARTIES=https://www.airwaveempire.com,https://airwaveempire.com
 * Omit entirely to skip azp checks (library default — same helpful for simple setups).
 */
function clerkAuthorizedPartiesFromEnv() {
  const raw = (process.env.CLERK_AUTHORIZED_PARTIES || '').trim();
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

/** Verify a Clerk session JWT; returns Clerk user id (`sub`) or throws. */
async function verifyClerkBearer(tokenRaw) {
  const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';
  if (!token) throw new Error('empty token');

  const secret = process.env.CLERK_SECRET_KEY && String(process.env.CLERK_SECRET_KEY).trim();
  const jwtKey = process.env.CLERK_JWT_KEY && String(process.env.CLERK_JWT_KEY).trim();
  if (!secret && !jwtKey) throw new Error('CLERK_SECRET_KEY is not set (or set CLERK_JWT_KEY for PEM verification)');

  const { verifyToken } = require('@clerk/backend');
  const opts = jwtKey ? { jwtKey } : { secretKey: secret };
  const parties = clerkAuthorizedPartiesFromEnv();
  if (parties) opts.authorizedParties = parties;

  try {
    const payload = await verifyToken(token, opts);
    if (!payload || !payload.sub) throw new Error('no sub');
    return payload.sub;
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.warn('[clerk-verify]', msg);
    throw e;
  }
}

module.exports = { verifyClerkBearer };
