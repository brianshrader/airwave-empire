/**
 * POST /api/analytics/solo-session — product analytics for solo (non-multiplayer) play.
 * Called from the browser when a new game starts or an autosave is resumed.
 */
'use strict';

const { posthog } = require('./posthog');

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 120;
const rateMap = new Map();

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim().slice(0, 80);
  return String(req.socket?.remoteAddress || req.ip || '').slice(0, 80) || 'unknown';
}

function allowRate(ip) {
  const now = Date.now();
  let e = rateMap.get(ip);
  if (!e || now > e.reset) {
    e = { n: 0, reset: now + RATE_WINDOW_MS };
    rateMap.set(ip, e);
  }
  if (e.n >= RATE_MAX) return false;
  e.n += 1;
  return true;
}

function safeStr(v, max) {
  if (v == null) return '';
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function mountAnalytics(app) {
  app.post('/api/analytics/solo-session', (req, res) => {
    const ip = clientIp(req);
    if (!allowRate(ip)) {
      return res.status(429).json({ error: 'Too many requests.' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const source = safeStr(body.source, 32);
    const allowedSources = new Set([
      'new_game',
      'resume_autosave',
      'campaign_new',
      'campaign_next',
    ]);
    if (!allowedSources.has(source)) {
      return res.status(400).json({ error: 'Invalid source.' });
    }

    const scenarioId = safeStr(body.scenario_id, 64);
    const marketId = safeStr(body.market_id, 64);
    if (!scenarioId || !marketId) {
      return res.status(400).json({ error: 'scenario_id and market_id required.' });
    }

    const clerkUserId = safeStr(body.clerk_user_id, 128);
    const clientDistinctId = safeStr(body.client_distinct_id, 128);
    const distinctId = clerkUserId || clientDistinctId || ip;

    let eventName = 'solo game started';
    if (source === 'resume_autosave') eventName = 'solo game resumed';
    else if (source === 'campaign_next') eventName = 'solo campaign continued';
    else if (source === 'campaign_new') eventName = 'solo campaign started';

    posthog.capture({
      distinctId,
      event: eventName,
      properties: {
        scenario_id: scenarioId,
        market_id: marketId,
        source,
        session_source: source,
        mode: 'solo',
      },
    });

    res.json({ ok: true });
  });
}

module.exports = { mountAnalytics };
