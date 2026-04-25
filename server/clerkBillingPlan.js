'use strict';

/**
 * Resolve Clerk Billing plan slug via BAPI: GET /v1/users/{id}/billing/subscription
 * (@clerk/backend 1.34 in this project does not expose a billing client — same endpoint as the SDK).
 */

const CLERK_API_BASE = String(process.env.CLERK_API_URL || 'https://api.clerk.com')
  .trim()
  .replace(/\/$/, '');

const { CLERK_PLAN } = require('./aiEntitlements');

/**
 * @param {object|null|undefined} data
 * @returns {string}
 */
function planSlugFromSubscriptionJson(data) {
  if (data == null) return CLERK_PLAN.FREE;
  const body = data.response && typeof data.response === 'object' ? data.response : data;
  if (body == null) return CLERK_PLAN.FREE;

  const items = body.items || body.subscription_items;
  const list = Array.isArray(items) ? items : [];
  const pickActive = (st) => {
    const s = String(st || '')
      .toLowerCase()
      .trim();
    return s === 'active' || s === 'trialing' || s === 'past_due';
  };
  const active = list.filter((i) => i && pickActive(i.status));
  const use = active.length ? active : list;
  const first = use[0];
  if (!first) return CLERK_PLAN.FREE;
  const plan = first.plan || first.billing_plan;
  if (!plan || typeof plan !== 'object') return CLERK_PLAN.FREE;
  const slug = plan.slug || plan.key;
  if (typeof slug === 'string' && slug.trim()) {
    return slug.trim();
  }
  return CLERK_PLAN.FREE;
}

/**
 * @param {string} clerkUserId
 * @returns {Promise<string>} plan key slug (e.g. free_user, starter, pro)
 * @throws {Error} on transport/HTTP failure — caller should map to 503; code on error object when set
 */
async function fetchClerkBillingPlanSlug(clerkUserId) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret || !String(secret).trim()) {
    const e = new Error('CLERK_SECRET_KEY is not set');
    e.code = 'NO_CLERK_SECRET';
    throw e;
  }

  const url = `${CLERK_API_BASE}/v1/users/${encodeURIComponent(clerkUserId)}/billing/subscription`;
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${String(secret).trim()}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    const e = new Error((err && err.message) || 'Clerk API unreachable');
    e.code = 'CLERK_BILLING_NETWORK';
    e.cause = err;
    throw e;
  }

  if (res.status === 404) {
    return CLERK_PLAN.FREE;
  }

  if (res.status === 401 || res.status === 403) {
    const t = await res.text().catch(() => '');
    const e = new Error(
      `Clerk API rejected the secret (HTTP ${res.status}): ${t.slice(0, 120)}`,
    );
    e.code = 'CLERK_BILLING_AUTH';
    e.status = res.status;
    throw e;
  }

  if (res.status >= 500) {
    const t = await res.text().catch(() => '');
    const e = new Error(`Clerk API server error (HTTP ${res.status}): ${t.slice(0, 200)}`);
    e.code = 'CLERK_BILLING_UPSTREAM';
    e.status = res.status;
    throw e;
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const e = new Error(`Clerk billing API HTTP ${res.status}: ${t.slice(0, 300)}`);
    e.code = 'CLERK_BILLING_HTTP';
    e.status = res.status;
    throw e;
  }

  const text = await res.text();
  if (!text) return CLERK_PLAN.FREE;

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const e = new Error('Clerk billing response was not valid JSON');
    e.code = 'CLERK_BILLING_JSON';
    throw e;
  }
  return planSlugFromSubscriptionJson(data);
}

module.exports = { fetchClerkBillingPlanSlug, planSlugFromSubscriptionJson, CLERK_API_BASE };
