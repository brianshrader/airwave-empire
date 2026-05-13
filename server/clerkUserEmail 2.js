'use strict';

const CLERK_API_BASE = String(process.env.CLERK_API_URL || 'https://api.clerk.com')
  .trim()
  .replace(/\/$/, '');

/**
 * Primary email for a Clerk user (for Stripe customer / checkout metadata). Best-effort; returns '' on failure.
 * @param {string} clerkUserId
 * @returns {Promise<string>}
 */
async function fetchClerkPrimaryEmail(clerkUserId) {
  const secret = (process.env.CLERK_SECRET_KEY || '').trim();
  const uid = String(clerkUserId || '').trim();
  if (!secret || !uid) return '';

  const url = `${CLERK_API_BASE}/v1/users/${encodeURIComponent(uid)}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    });
  } catch {
    return '';
  }
  if (!res.ok) return '';
  let j;
  try {
    j = await res.json();
  } catch {
    return '';
  }
  if (!j || typeof j !== 'object') return '';
  const emails = Array.isArray(j.email_addresses) ? j.email_addresses : [];
  const primaryId = j.primary_email_address_id;
  let pick = emails.find((e) => e && e.id === primaryId);
  if (!pick && emails.length) {
    pick = emails.find((e) => e && e.verification && e.verification.status === 'verified') || emails[0];
  }
  const addr = pick && (pick.email_address || pick.emailAddress);
  return typeof addr === 'string' && addr.trim() ? addr.trim() : '';
}

module.exports = { fetchClerkPrimaryEmail };
