'use strict';

/**
 * POST /api/generate-station-jingle — queues ShortAPI Suno job, returns `{ jobId }` immediately (avoids reverse-proxy
 * timeouts while the server polls Suno for 1–5+ minutes). Client polls GET /api/station-jingle/job/:jobId until `complete`.
 * GET  /api/station-jingle/status — { configured, model }
 *
 * Env: SHORTAPI_KEY (shared with images). Optional: SHORTAPI_SUNO_MODEL, SHORTAPI_SUNO_POLL_MAX_MS, JINGLE_MAX_PER_HOUR
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = crypto;
const { buildSunoJingleArgs } = require('./jinglePrompt');
const { posthog } = require('./posthog');
const {
  sunoConfigured,
  sunoModelSlug,
  createAndPollSunoJingle,
  downloadAudioUrl,
} = require('./services/sunoJingleProvider');
const { tryConsume } = require('./aiUsageStore');
const { requireClerkUserIdForAi, requirePlanSlugOr503, tryConsumeQuota } = require('./aiQuotaHttp');
const { getTrialQuotaSnapshot } = require('./trialQuotaStore');
const { CLERK_PLAN } = require('./aiEntitlements');

const GENERATED_DIR = path.join(__dirname, '..', 'generated-jingles');

const RATE_WINDOW_MS = 60 * 60 * 1000;
const jingleRateMap = new Map();

/** @type {Map<string, { status: 'pending'|'complete'|'failed', created: number, ip: string, sunoArgs: object, base: string, stationId: string, trace: object, variants?: object[], error?: string, completedAt?: number, clerkUserId?: string, planSlug?: string }>} */
const jingleJobs = new Map();
const JINGLE_JOB_TTL_MS = 2 * 60 * 60 * 1000;

function pruneJingleJobs() {
  const now = Date.now();
  for (const [id, j] of jingleJobs) {
    if (now - j.created > JINGLE_JOB_TTL_MS) jingleJobs.delete(id);
  }
}

async function runJingleJob(jobId) {
  const j = jingleJobs.get(jobId);
  if (!j || j.status !== 'pending') return;
  try {
    const { musics } = await createAndPollSunoJingle(j.sunoArgs);
    const variants = [];
    for (let i = 0; i < musics.length; i++) {
      const m = musics[i];
      const { buffer, ext } = await downloadAudioUrl(m.url);
      const fname = `${j.base}-v${i + 1}.${ext}`;
      const abs = path.join(GENERATED_DIR, fname);
      fs.writeFileSync(abs, buffer);
      variants.push({
        audioUrl: `/generated-jingles/${fname}`,
        remoteTitle: m.title || null,
      });
      await sleep(80);
    }
    if (!variants.length) {
      j.status = 'failed';
      j.error = 'No audio variants were saved.';
      j.completedAt = Date.now();
      return;
    }
    j.status = 'complete';
    j.variants = variants;
    j.completedAt = Date.now();
    posthog.capture({
      distinctId: j.ip,
      event: 'station jingle generated',
      properties: {
        station_id: j.stationId,
        format: j.trace.format,
        year: j.trace.year,
        band: j.trace.band,
        variant_count: variants.length,
        model: sunoModelSlug(),
      },
    });
  } catch (e) {
    console.error('[jingle job]', jobId, e.message || e);
    posthog.captureException(e, j.ip);
    j.status = 'failed';
    j.error = String(e.message || 'Jingle generation failed').slice(0, 400);
    j.completedAt = Date.now();
  }
}

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
  const iv = setInterval(pruneJingleJobs, 10 * 60 * 1000);
  if (typeof iv.unref === 'function') iv.unref();

  app.get('/api/station-jingle/status', (_req, res) => {
    res.json({
      ok: true,
      configured: sunoConfigured(),
      model: sunoModelSlug(),
    });
  });

  /** Browsers paste GET here and see "Cannot GET" — jingle creation is POST from the game only. */
  app.get('/api/generate-station-jingle', (_req, res) => {
    res
      .status(405)
      .set('Allow', 'POST')
      .json({
        ok: false,
        error:
          'Use POST from the game (Brand & Promotion → Commission jingle). Opening this URL in a tab does not generate audio.',
      });
  });

  app.get('/api/station-jingle/job/:jobId', (req, res) => {
    const jobId = String(req.params.jobId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      return res.status(400).json({ ok: false, error: 'Invalid job id.' });
    }
    const j = jingleJobs.get(jobId);
    if (!j) {
      return res.status(404).json({ ok: false, error: 'Job not found or expired. Commission again if needed.' });
    }
    if (j.status === 'pending') {
      return res.json({ ok: true, status: 'pending' });
    }
    if (j.status === 'failed') {
      return res.json({ ok: false, status: 'failed', error: j.error || 'Jingle generation failed.' });
    }
    const out = {
      ok: true,
      status: 'complete',
      variants: j.variants || [],
      ...(j.sunoPromptConfidence ? { sunoPromptConfidence: j.sunoPromptConfidence } : {}),
    };
    if (j.planSlug === CLERK_PLAN.TRIAL && j.clerkUserId) {
      out.trialQuota = getTrialQuotaSnapshot(j.clerkUserId);
    }
    return res.json(out);
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

    const clerkUserId = await requireClerkUserIdForAi(req, res);
    if (!clerkUserId) return;
    const planSlug = await requirePlanSlugOr503(res, clerkUserId);
    if (planSlug == null) return;

    const stationId = String(body.stationId).trim();
    const audienceHint = sanitizeJingleSonicHint(body.audienceHint, 100);
    const positionHint = sanitizeJingleSonicHint(body.positionHint, 140);
    const sunoArgPayload = {
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
    };
    const sunoArgs = buildSunoJingleArgs(sunoArgPayload);

    const allowed = await tryConsumeQuota(res, planSlug, 'jingle', tryConsume, clerkUserId);
    if (!allowed) return;

    const stamp = Date.now();
    const h = crypto.createHash('sha256').update(JSON.stringify(sunoArgs) + stamp).digest('hex').slice(0, 10);
    const base = `${slugPart(stationId, 32)}-${stamp}-${h}`;
    const jobId = randomUUID();

    jingleJobs.set(jobId, {
      status: 'pending',
      created: Date.now(),
      ip,
      sunoArgs,
      base,
      stationId,
      clerkUserId,
      planSlug,
      trace: {
        format: String(body.format).trim(),
        year: Math.floor(Number(body.year)),
        band: body.band || null,
      },
    });

    runJingleJob(jobId).catch((e) => {
      console.error('[jingle job unhandled]', jobId, e);
      const j = jingleJobs.get(jobId);
      if (j && j.status === 'pending') {
        j.status = 'failed';
        j.error = String(e.message || 'Jingle job crashed').slice(0, 400);
        j.completedAt = Date.now();
      }
    });

    const out = { ok: true, jobId };
    if (planSlug === CLERK_PLAN.TRIAL) out.trialQuota = getTrialQuotaSnapshot(clerkUserId);
    return res.json(out);
  });
}

module.exports = { mountJingleRoutes, GENERATED_DIR };
