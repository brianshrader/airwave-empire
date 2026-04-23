/**
 * POST /api/analytics/solo-session — product analytics for solo (non-multiplayer) play.
 * Called from the browser when a new game starts or an autosave is resumed.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { posthog } = require('./posthog');

const SEEDREV_SNAPSHOT_DIR = path.join(__dirname, '..', 'data', 'sim-invariant-snapshots');

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

function nIntSigned(v, def, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function sanitizeStationsTop5(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw.slice(0, 5)) {
    if (!row || typeof row !== 'object') continue;
    out.push({
      id: safeStr(row.id, 64) || 'unknown',
      share: typeof row.share === 'number' && Number.isFinite(row.share)
        ? Math.round(row.share * 1e8) / 1e8
        : 0,
      aqh: nIntSigned(row.aqh, 0, 0, 1e9),
      rev: nIntSigned(row.rev, 0, -1e12, 1e12),
    });
  }
  return out;
}

/** Local JSON only for seedrev_zero_raw_pool (repair miss diagnosis). */
function writeSeedrevZeroRawPoolSnapshot(body, props) {
  try {
    fs.mkdirSync(SEEDREV_SNAPSHOT_DIR, { recursive: true });
    const top5 = sanitizeStationsTop5(body.stations_top5);
    const sumShare = typeof body.sum_share === 'number' && Number.isFinite(body.sum_share)
      ? Math.round(body.sum_share * 1e6) / 1e6
      : null;
    const snapshot = {
      timestamp: new Date().toISOString(),
      market_id: props.market_id,
      scenario_id: props.scenario_id,
      solo_live: props.mp_mode,
      year: props.year,
      period: props.period,
      turn: props.turn,
      total_commercial_share: sumShare,
      halfTarget: props.half_target,
      sum_raw_rev: props.sum_raw_rev,
      top5_commercial_stations: top5,
    };
    const fname = `seedrev-zero-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`;
    fs.writeFileSync(path.join(SEEDREV_SNAPSHOT_DIR, fname), JSON.stringify(snapshot), 'utf8');
  } catch (e) {
    console.error('[analytics] seedrev snapshot write failed:', e && e.message ? e.message : e);
  }
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

  /**
   * POST /api/analytics/sim-invariant — rare ratings/revenue book desync (cohort AQH vs headline share, $0 rev pool).
   * Fire-and-forget from the client when repair runs or seedRev sees an empty raw pool despite positive shares.
   */
  app.post('/api/analytics/sim-invariant', (req, res) => {
    const ip = clientIp(req);
    if (!allowRate(ip)) {
      return res.status(429).json({ error: 'Too many requests.' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const phase = safeStr(body.phase, 48);
    const allowedPhases = new Set([
      'recalc_rat_cur_repaired',
      'migrate_load_rat_cur_repaired',
      'seedrev_zero_raw_pool',
    ]);
    if (!allowedPhases.has(phase)) {
      return res.status(400).json({ error: 'Invalid phase.' });
    }

    const clerkUserId = safeStr(body.clerk_user_id, 128);
    const clientDistinctId = safeStr(body.client_distinct_id, 128);
    const distinctId = clerkUserId || clientDistinctId || ip;

    const nInt = (v, def, max) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return def;
      return Math.max(0, Math.min(max, Math.round(n)));
    };

    const sumRawRev = nIntSigned(body.sum_raw_rev, 0, -1e12, 1e12);

    const props = {
      phase,
      mp_mode: safeStr(body.mp_mode, 16) === 'live' ? 'live' : 'solo',
      year: nInt(body.year, 0, 2100),
      period: nInt(body.period, 0, 3),
      turn: nInt(body.turn, 0, 500000),
      market_id: safeStr(body.market_id, 64) || 'unknown',
      scenario_id: safeStr(body.scenario_id, 64) || 'unknown',
      n_repaired: nInt(body.n_repaired, 0, 500),
      n_comm: nInt(body.n_comm, 0, 500),
      sum_share: typeof body.sum_share === 'number' && Number.isFinite(body.sum_share) ? Math.round(body.sum_share * 1e6) / 1e6 : null,
      sum_raw_rev: sumRawRev,
      half_target: nInt(body.half_target, 0, 1e12),
    };

    if (phase === 'seedrev_zero_raw_pool') {
      writeSeedrevZeroRawPoolSnapshot(body, props);
    }

    posthog.capture({
      distinctId,
      event: 'sim invariant anomaly',
      properties: props,
    });

    res.json({ ok: true });
  });
}

module.exports = { mountAnalytics };
