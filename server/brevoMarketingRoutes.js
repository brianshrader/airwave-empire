'use strict';

const BREVO_API_BASE = 'https://api.brevo.com/v3';

function isConfigured() {
  const key = String(process.env.BREVO_API_KEY || '').trim();
  const listId = String(process.env.BREVO_LIST_ID || '').trim();
  return !!key && !!listId;
}

function parseListId() {
  const raw = String(process.env.BREVO_LIST_ID || '').trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function validEmail(email) {
  const s = String(email || '').trim();
  if (!s || s.length > 254) return false;
  // Intentionally simple: good UX + avoids rejecting legitimate edge cases.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function safeAttr(v, max = 80) {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Creates or updates a contact, ensuring it is on the configured list.
 * Uses Brevo "create contact" with updateEnabled, so repeated opt-ins are idempotent.
 */
async function brevoUpsertContact({ email, listId, attributes }) {
  const key = String(process.env.BREVO_API_KEY || '').trim();
  const url = `${BREVO_API_BASE}/contacts?updateEnabled=true`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email,
      listIds: [listId],
      attributes,
    }),
  });

  const text = await resp.text().catch(() => '');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_e) {
    json = null;
  }

  if (!resp.ok) {
    const msg =
      (json && (json.message || json.error || json.code)) ||
      text ||
      `Brevo HTTP ${resp.status}`;
    const err = new Error(String(msg).slice(0, 300));
    err.status = resp.status;
    err.brevo = json || text;
    throw err;
  }

  return json || { ok: true };
}

/**
 * @param {import('express').Express} app
 */
function mountBrevoMarketingRoutes(app) {
  if (isConfigured()) {
    console.log('[brevo] Marketing signup: enabled (BREVO_API_KEY + BREVO_LIST_ID)');
  } else {
    console.warn('[brevo] Marketing signup disabled — set BREVO_API_KEY and BREVO_LIST_ID for /api/marketing/subscribe');
  }

  app.post('/api/marketing/subscribe', async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Email signup is not configured on this server.',
      });
    }

    const listId = parseListId();
    if (!listId) {
      return res.status(503).json({
        ok: false,
        error: 'BREVO_LIST_ID is invalid on this server.',
      });
    }

    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    if (!validEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
    }

    const attributes = {};
    const source = safeAttr(body.SOURCE || body.source, 60);
    const plan = safeAttr(body.PLAN || body.plan, 40);
    const market = safeAttr(body.MARKET || body.market, 40);
    const signupDate = safeAttr(body.SIGNUP_DATE || body.signup_date, 32);

    if (source) attributes.SOURCE = source;
    if (plan) attributes.PLAN = plan;
    if (market) attributes.MARKET = market;
    // Default SIGNUP_DATE to server time if not provided.
    attributes.SIGNUP_DATE = signupDate || new Date().toISOString();

    try {
      await brevoUpsertContact({ email, listId, attributes });
      return res.json({ ok: true });
    } catch (e) {
      const status = e.status && Number.isInteger(e.status) ? e.status : 502;
      console.warn('[brevo] subscribe failed:', e?.message || e);
      return res.status(status).json({
        ok: false,
        error: 'Could not subscribe right now. Please try again in a moment.',
      });
    }
  });
}

module.exports = { mountBrevoMarketingRoutes };

