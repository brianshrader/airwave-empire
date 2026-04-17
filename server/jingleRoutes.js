'use strict';

/**
 * POST /api/generate-station-jingle — ShortAPI Suno v5.5, poll, save under /generated-jingles/
 * GET  /api/station-jingle/status — { configured, model }
 *
 * Env: SHORTAPI_KEY (shared with images). Optional: SHORTAPI_SUNO_MODEL, SHORTAPI_SUNO_POLL_MAX_MS, JINGLE_MAX_PER_HOUR
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildSunoJingleArgs } = require('./jinglePrompt');
const { posthog } = require('./posthog');
const {
  sunoConfigured,
  sunoModelSlug,
  createAndPollSunoJingle,
  downloadAudioUrl,
} = require('./services/sunoJingleProvider');

const GENERATED_DIR = path.join(__dirname, '..', 'generated-jingles');

const RATE_WINDOW_MS = 60 * 60 * 1000;
const jingleRateMap = new Map();

function jingleRateLimitPerHour() {
  const raw = process.env.JINGLE_MAX_PER_HOUR;
  if (raw == null || String(raw).trim() === '') return 40;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return 40;
  if (n <= 0) return 0;
  return Math.min(500, n);
}

function ensureDir() {
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim().slice(0, 80);
  return String(req.socket?.remoteAddress || req.ip || '').slice(0, 80) || 'unknown';
}

function allowJingleRate(ip) {
  const max = jingleRateLimitPerHour();
  if (max <= 0) return true;
  const now = Date.now();
  let e = jingleRateMap.get(ip);
  if (!e || now > e.reset) {
    e = { n: 0, reset: now + RATE_WINDOW_MS };
    jingleRateMap.set(ip, e);
  }
  if (e.n >= max) return false;
  e.n += 1;
  return true;
}

function slugPart(s, max) {
  const t = String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return t || 'x';
}

function validateBody(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('Body must be a JSON object.');

  const stationId = body.stationId;
  if (typeof stationId !== 'string' || !stationId.trim()) errors.push('stationId is required.');
  else if (!/^[a-zA-Z0-9_-]{1,64}$/.test(stationId.trim())) errors.push('stationId has invalid characters.');

  const brand = body.brand;
  if (typeof brand !== 'string' || !brand.trim()) errors.push('brand is required (non-empty string).');
  else if (brand.length > 120) errors.push('brand too long (max 120).');

  const format = body.format;
  if (typeof format !== 'string' || !format.trim()) errors.push('format is required.');
  else if (format.length > 100) errors.push('format too long (max 100).');

  const year = Number(body.year);
  if (!Number.isFinite(year) || year < 1930 || year > 2040) errors.push('year must be between 1930 and 2040.');

  if (body.tagline != null && body.tagline !== '') {
    if (typeof body.tagline !== 'string' || body.tagline.length > 60) errors.push('tagline must be a string (max 60) if provided.');
  }
  if (body.frequency != null && body.frequency !== '') {
    if (typeof body.frequency !== 'string' || body.frequency.length > 24) errors.push('frequency must be a string (max 24) if provided.');
  }
  if (body.band != null && body.band !== '') {
    const b = String(body.band).toUpperCase();
    if (b !== 'AM' && b !== 'FM') errors.push('band must be "AM", "FM", or omitted.');
  }
  if (body.formatId != null && body.formatId !== '') {
    if (typeof body.formatId !== 'string' || body.formatId.length > 40) errors.push('formatId must be a string (max 40) if provided.');
  }

  if (body.audienceHint != null && body.audienceHint !== '') {
    if (typeof body.audienceHint !== 'string' || body.audienceHint.length > 100) {
      errors.push('audienceHint must be a string (max 100) if provided.');
    }
  }
  if (body.positionHint != null && body.positionHint !== '') {
    if (typeof body.positionHint !== 'string' || body.positionHint.length > 140) {
      errors.push('positionHint must be a string (max 140) if provided.');
    }
  }
  if (body.callLetters != null && body.callLetters !== '') {
    if (typeof body.callLetters !== 'string' || body.callLetters.length > 12) {
      errors.push('callLetters must be a string (max 12) if provided.');
    }
  }

  return errors;
}

/** Strip control chars; trim and cap (defense in depth vs client). */
function sanitizeJingleSonicHint(str, maxLen) {
  if (str == null || str === '') return '';
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * @param {import('express').Express} app
 */
function mountJingleRoutes(app) {
  ensureDir();

  app.get('/api/station-jingle/status', (_req, res) => {
    res.json({
      ok: true,
      configured: sunoConfigured(),
      model: sunoModelSlug(),
    });
  });

  app.post('/api/generate-station-jingle', async (req, res) => {
    if (!sunoConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Jingle generation unavailable — set SHORTAPI_KEY on the server.',
      });
    }

    const ip = clientIp(req);
    if (!allowJingleRate(ip)) {
      return res.status(429).json({ ok: false, error: 'Too many jingle requests — try again later.' });
    }

    const body = req.body || {};
    const verrors = validateBody(body);
    if (verrors.length) {
      return res.status(400).json({ ok: false, error: verrors.join(' ') });
    }

    const stationId = String(body.stationId).trim();
    const audienceHint = sanitizeJingleSonicHint(body.audienceHint, 100);
    const positionHint = sanitizeJingleSonicHint(body.positionHint, 140);
    const sunoArgs = buildSunoJingleArgs({
      brand: String(body.brand).trim(),
      format: String(body.format).trim(),
      year: Math.floor(Number(body.year)),
      tagline: typeof body.tagline === 'string' ? body.tagline : '',
      frequency: typeof body.frequency === 'string' ? body.frequency : '',
      band: typeof body.band === 'string' ? body.band : '',
      formatId: typeof body.formatId === 'string' ? body.formatId : '',
      callLetters: typeof body.callLetters === 'string' ? body.callLetters : '',
      audienceHint,
      positionHint,
    });

    const stamp = Date.now();
    const h = crypto.createHash('sha256').update(JSON.stringify(sunoArgs) + stamp).digest('hex').slice(0, 10);
    const base = `${slugPart(stationId, 32)}-${stamp}-${h}`;

    try {
      const { musics } = await createAndPollSunoJingle(sunoArgs);
      const variants = [];

      for (let i = 0; i < musics.length; i++) {
        const m = musics[i];
        const { buffer, ext } = await downloadAudioUrl(m.url);
        const fname = `${base}-v${i + 1}.${ext}`;
        const abs = path.join(GENERATED_DIR, fname);
        fs.writeFileSync(abs, buffer);
        variants.push({
          audioUrl: `/generated-jingles/${fname}`,
          remoteTitle: m.title || null,
        });
        await sleep(80);
      }

      if (!variants.length) {
        return res.status(502).json({ ok: false, error: 'No audio variants were saved.' });
      }

      posthog.capture({
        distinctId: ip,
        event: 'station jingle generated',
        properties: {
          station_id: stationId,
          format: String(body.format).trim(),
          year: Math.floor(Number(body.year)),
          band: body.band || null,
          variant_count: variants.length,
          model: sunoModelSlug(),
        },
      });
      return res.json({ ok: true, variants });
    } catch (e) {
      console.error('[jingle]', e.message || e);
      posthog.captureException(e, ip);
      const status = e.status && Number.isInteger(e.status) ? e.status : 500;
      const detail = String(e.message || 'Jingle generation failed').slice(0, 400);
      return res.status(status).json({ ok: false, error: detail });
    }
  });
}

module.exports = { mountJingleRoutes, GENERATED_DIR };
