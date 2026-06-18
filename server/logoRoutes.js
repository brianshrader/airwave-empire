/**
 * POST /api/generate-logo — cosmetic station logos via ShortAPI (z-image) or Grok (xAI Images).
 * Caches files under /generated-logos. Regenerate overwrites the cached file.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildLogoPrompt } = require('./logoPrompt');
const { posthog } = require('./posthog');
const {
  generateStationLogo,
  imageGenerationConfigured,
  getActiveImageProvider,
} = require('./services/logoProvider');
const { tryConsume, refundOne } = require('./aiUsageStore');
const {
  requirePlanSlugOr503,
  tryConsumeQuota,
  resolveAiPrincipal,
  consumeGuestAi,
  refundGuestAi,
} = require('./aiQuotaHttp');
const { refundTrialImage, getTrialQuotaSnapshot } = require('./trialQuotaStore');
const { CLERK_PLAN } = require('./aiEntitlements');
const { GENERATED_LOGOS_DIR, ensureDir } = require('./runtimePaths');

const GENERATED_DIR = GENERATED_LOGOS_DIR;

function ensureDirLocal() {
  ensureDir(GENERATED_DIR);
}

/** Slug for filesystem-safe deterministic names. */
function slugPart(s, max) {
  const t = String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return t || 'x';
}

/**
 * Deterministic cache key from all inputs that define the “same” logo request.
 */
function cacheKeyParts(body) {
  const norm = (s) =>
    String(s ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  return [
    norm(body.stationName),
    norm(body.format),
    String(Math.floor(Number(body.year) || 0)),
    norm(body.tone),
    norm(body.frequency),
    norm(body.band).toUpperCase(),
  ].join('|');
}

/**
 * e.g. fm104-rock-1978.png — optional metadata adds a short hash so cache stays correct.
 */
function logoBaseFileName(body, keyMaterial) {
  const y = String(Math.floor(Number(body.year)));
  const base = `${slugPart(body.stationName, 48)}-${slugPart(body.format, 32)}-${y}`;
  const hasOpt = [body.tone, body.frequency, body.band].some((x) => x != null && String(x).trim() !== '');
  const suffix = hasOpt ? `-${crypto.createHash('sha256').update(keyMaterial, 'utf8').digest('hex').slice(0, 8)}` : '';
  return `${base}${suffix}`;
}

function validateBody(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('Request body must be a JSON object.');
  const stationName = body.stationName;
  if (typeof stationName !== 'string' || !stationName.trim()) errors.push('stationName is required (non-empty string).');
  else if (stationName.length > 120) errors.push('stationName too long (max 120).');

  const format = body.format;
  if (typeof format !== 'string' || !format.trim()) errors.push('format is required (non-empty string).');
  else if (format.length > 100) errors.push('format too long (max 100).');

  const year = Number(body.year);
  if (!Number.isFinite(year) || year < 1930 || year > 2040) errors.push('year must be a number between 1930 and 2040.');

  if (body.tone != null && body.tone !== '') {
    if (typeof body.tone !== 'string' || body.tone.length > 80) errors.push('tone must be a string (max 80) if provided.');
  }
  if (body.frequency != null && body.frequency !== '') {
    if (typeof body.frequency !== 'string' || body.frequency.length > 40) errors.push('frequency must be a string (max 40) if provided.');
  }
  if (body.band != null && body.band !== '') {
    const b = String(body.band).toUpperCase();
    if (b !== 'AM' && b !== 'FM') errors.push('band must be "AM", "FM", or omitted.');
  }
  return errors;
}

/**
 * @param {import('express').Express} app
 */
function mountLogoRoutes(app) {
  ensureDirLocal();

  if (imageGenerationConfigured()) {
    console.log('[logo] Image generation:', getActiveImageProvider());
  } else {
    console.warn('[logo] No image API — set SHORTAPI_KEY or GROK_API_KEY in .env');
  }

  app.post('/api/generate-logo', async (req, res) => {
    if (!imageGenerationConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Logo generation unavailable — set SHORTAPI_KEY or GROK_API_KEY in .env',
      });
    }

    const body = req.body || {};
    const verrors = validateBody(body);
    if (verrors.length) {
      return res.status(400).json({ ok: false, error: verrors.join(' ') });
    }

    const principal = await resolveAiPrincipal(req, res);
    if (!principal) return;

    const regenerate = body.regenerate === true;
    const keyMaterial = cacheKeyParts(body);
    const base = logoBaseFileName(body, keyMaterial);

    const prompt = buildLogoPrompt({
      stationName: body.stationName.trim(),
      format: body.format.trim(),
      year: Math.floor(Number(body.year)),
      tone: typeof body.tone === 'string' ? body.tone : '',
      frequency: typeof body.frequency === 'string' ? body.frequency : '',
      band: typeof body.band === 'string' ? body.band : '',
    });

    let needRefund = false;
    try {
      const tryExts = ['png', 'webp', 'jpg'];
      const tryNames = tryExts.map((e) => `${base}.${e}`);
      let existing = null;
      for (const n of tryNames) {
        const p = path.join(GENERATED_DIR, n);
        if (fs.existsSync(p)) {
          existing = { name: n, abs: p };
          break;
        }
      }

      if (!regenerate && existing) {
        const payload = { ok: true, cached: true, imageUrl: `/generated-logos/${existing.name}` };
        if (principal.kind === 'clerk') {
          const planSlug = await requirePlanSlugOr503(res, principal.userId);
          if (planSlug == null) return;
          if (planSlug === CLERK_PLAN.TRIAL) payload.trialQuota = getTrialQuotaSnapshot(principal.userId);
        }
        return res.json(payload);
      }

      let planSlug = null;
      if (principal.kind === 'guest') {
        const okGuest = await consumeGuestAi(res, principal.guestId, 'logo');
        if (!okGuest) return;
      } else {
        planSlug = await requirePlanSlugOr503(res, principal.userId);
        if (planSlug == null) return;
        const allowed = await tryConsumeQuota(res, planSlug, 'logo', tryConsume, principal.userId);
        if (!allowed) return;
      }

      needRefund = true;
      const { buffer, ext } = await generateStationLogo({ prompt });
      const safeExt = tryExts.includes(ext) ? ext : 'png';
      const finalName = `${base}.${safeExt}`;
      const absPath = path.join(GENERATED_DIR, finalName);

      // Drop older variants for this base so we do not leave stale duplicates.
      for (const n of tryNames) {
        const p = path.join(GENERATED_DIR, n);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }

      fs.writeFileSync(absPath, buffer);
      needRefund = false;

      posthog.capture({
        distinctId: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown',
        event: 'station logo generated',
        properties: {
          format: body.format,
          year: Math.floor(Number(body.year)),
          band: body.band || null,
          regenerate,
          provider: getActiveImageProvider(),
        },
      });
      const payload = { ok: true, cached: false, imageUrl: `/generated-logos/${finalName}` };
      if (principal.kind === 'clerk' && planSlug === CLERK_PLAN.TRIAL)
        payload.trialQuota = getTrialQuotaSnapshot(principal.userId);
      return res.json(payload);
    } catch (e) {
      if (needRefund) {
        if (principal.kind === 'guest') await refundGuestAi(principal.guestId, 'logo');
        else if (planSlug === CLERK_PLAN.TRIAL) await refundTrialImage(principal.userId);
        else await refundOne(principal.userId, 'logo');
      }
      console.error('[logo] Image API / save failed:', e.message || e);
      posthog.captureException(e, req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown');
      const status = e.status && Number.isInteger(e.status) ? e.status : 500;
      const detail = String(e.message || 'Logo generation failed').slice(0, 400);
      return res.status(status).json({
        ok: false,
        error: detail,
      });
    }
  });
}

module.exports = {
  mountLogoRoutes,
  GENERATED_DIR,
  cacheKeyParts,
  logoBaseFileName,
  validateBody,
};
