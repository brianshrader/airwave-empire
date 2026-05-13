/**
 * POST /api/generate-remote-van — Grok Imagine *edit* using the station logo as reference.
 * Logo pixels: prefer ShortAPI (same pipeline as /api/generate-logo when SHORTAPI_KEY is set),
 * else use cached file from /generated-logos, else same auto provider as generate-logo.
 *
 * Requires GROK_API_KEY. Optional: SHORTAPI_KEY for fresh logo generation step.
 */

const fs = require('fs');
const path = require('path');
const { buildLogoPrompt, buildRemoteVanPrompt } = require('./logoPrompt');
const {
  generateShortapiImage,
  generateStationLogo,
  generateGrokImageEdit,
  grokImageEditConfigured,
  imageGenerationConfigured,
} = require('./services/logoProvider');
const { GENERATED_DIR, cacheKeyParts, logoBaseFileName, validateBody } = require('./logoRoutes');
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

const GENERATED_VAN_DIR = path.join(__dirname, '..', 'generated-remote-vans');

/** Grok accepts multiple ratios; 3:2 reads more “photo” and avoids ultra-wide 16:9 stretch artifacts on some runs. */
const ALLOWED_VAN_AR = new Set(['16:9', '3:2', '4:3', '1:1']);

function resolveVanAspectRatio() {
  const raw = String(process.env.GROK_VAN_ASPECT_RATIO || '3:2').trim();
  return ALLOWED_VAN_AR.has(raw) ? raw : '3:2';
}

function ensureVanDir() {
  if (!fs.existsSync(GENERATED_VAN_DIR)) fs.mkdirSync(GENERATED_VAN_DIR, { recursive: true });
}

/** Resolve absolute path to a logo file under generated-logos (client passes /generated-logos/…). */
function safeExistingLogoFileFromUrl(cosmeticLogoUrl) {
  if (typeof cosmeticLogoUrl !== 'string' || !cosmeticLogoUrl.trim()) return null;
  const clean = cosmeticLogoUrl.split('?')[0].trim();
  if (!/^\/generated-logos\/[a-zA-Z0-9._-]+\.(png|webp|jpe?g)$/i.test(clean)) return null;
  const fname = path.basename(clean);
  const abs = path.resolve(path.join(GENERATED_DIR, fname));
  const root = path.resolve(GENERATED_DIR);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return fs.existsSync(abs) ? abs : null;
}

/**
 * Prefer the station’s saved AI logo on disk when the client sends cosmeticLogoUrl (fixes reload / cache-key mismatch).
 * Otherwise generate or load via the same cache key as before.
 */
async function resolveLogoBufferForVan(body, regenerateLogo) {
  const fromUrl = safeExistingLogoFileFromUrl(body.cosmeticLogoUrl);
  if (fromUrl) return fs.readFileSync(fromUrl);
  return getOrCreateLogoPngBuffer(body, regenerateLogo);
}

/** Stable slug for van filename: matches source logo file when provided. */
function vanFileSlugFromBody(body, keyMaterial) {
  if (typeof body.cosmeticLogoUrl === 'string' && body.cosmeticLogoUrl.trim()) {
    const base = path.basename(body.cosmeticLogoUrl.split('?')[0]);
    const noExt = base.replace(/\.(png|webp|jpe?g)$/i, '');
    return noExt || logoBaseFileName(body, keyMaterial);
  }
  return logoBaseFileName(body, keyMaterial);
}

/**
 * @param {object} body
 * @param {boolean} regenerate
 * @returns {Promise<Buffer>}
 */
async function getOrCreateLogoPngBuffer(body, regenerate) {
  const keyMaterial = cacheKeyParts(body);
  const base = logoBaseFileName(body, keyMaterial);
  const tryNames = ['png', 'webp', 'jpg'].map((e) => `${base}.${e}`);
  if (!regenerate) {
    for (const n of tryNames) {
      const p = path.join(GENERATED_DIR, n);
      if (fs.existsSync(p)) return fs.readFileSync(p);
    }
  }

  const prompt = buildLogoPrompt({
    stationName: body.stationName.trim(),
    format: body.format.trim(),
    year: Math.floor(Number(body.year)),
    tone: typeof body.tone === 'string' ? body.tone : '',
    frequency: typeof body.frequency === 'string' ? body.frequency : '',
    band: typeof body.band === 'string' ? body.band : '',
  });

  if (process.env.SHORTAPI_KEY) {
    const { buffer } = await generateShortapiImage({ prompt, aspect_ratio: '1:1' });
    const absPath = path.join(GENERATED_DIR, `${base}.png`);
    for (const n of tryNames) {
      const oldP = path.join(GENERATED_DIR, n);
      if (fs.existsSync(oldP)) fs.unlinkSync(oldP);
    }
    fs.writeFileSync(absPath, buffer);
    return buffer;
  }

  if (!imageGenerationConfigured()) {
    const err = new Error(
      'No logo source: set SHORTAPI_KEY to generate a logo, or generate a logo once via /api/generate-logo so it is cached.'
    );
    err.status = 503;
    throw err;
  }

  const { buffer } = await generateStationLogo({ prompt });
  const safeExt = 'png';
  const finalName = `${base}.${safeExt}`;
  const absPath = path.join(GENERATED_DIR, finalName);
  for (const n of tryNames) {
    const p = path.join(GENERATED_DIR, n);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  fs.writeFileSync(absPath, buffer);
  return buffer;
}

/**
 * @param {import('express').Express} app
 */
function mountRemoteVanRoutes(app) {
  ensureVanDir();

  if (grokImageEditConfigured()) {
    console.log('[remote-van] Grok image edit: enabled (GROK_API_KEY)');
  } else {
    console.warn('[remote-van] Grok image edit disabled — set GROK_API_KEY for /api/generate-remote-van');
  }

  app.post('/api/generate-remote-van', async (req, res) => {
    if (!grokImageEditConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Remote van images require GROK_API_KEY (xAI Imagine edit endpoint).',
      });
    }

    const body = req.body || {};
    const verrors = validateBody(body);
    if (verrors.length) {
      return res.status(400).json({ ok: false, error: verrors.join(' ') });
    }

    const principal = await resolveAiPrincipal(req, res);
    if (!principal) return;

    const regenerateVan = body.regenerate === true;
    const keyMaterial = cacheKeyParts(body);
    const slug = vanFileSlugFromBody(body, keyMaterial);
    const vanName = `${slug}-remote-van.png`;
    const vanPath = path.join(GENERATED_VAN_DIR, vanName);

    if (!regenerateVan && fs.existsSync(vanPath)) {
      const payload = { ok: true, cached: true, imageUrl: `/generated-remote-vans/${vanName}` };
      if (principal.kind === 'clerk') {
        const ps = await requirePlanSlugOr503(res, principal.userId);
        if (ps == null) return;
        if (ps === CLERK_PLAN.TRIAL) payload.trialQuota = getTrialQuotaSnapshot(principal.userId);
      }
      return res.json(payload);
    }

    let planSlug = null;
    if (principal.kind === 'guest') {
      const okG = await consumeGuestAi(res, principal.guestId, 'van');
      if (!okG) return;
    } else {
      planSlug = await requirePlanSlugOr503(res, principal.userId);
      if (planSlug == null) return;
      const allowed = await tryConsumeQuota(res, planSlug, 'van', tryConsume, principal.userId);
      if (!allowed) return;
    }

    let needRefund = true;
    try {
      const logoBuf = await resolveLogoBufferForVan(body, false);
      const prompt = buildRemoteVanPrompt({
        stationName: body.stationName.trim(),
        format: body.format.trim(),
        year: Math.floor(Number(body.year)),
        tone: typeof body.tone === 'string' ? body.tone : '',
        band: typeof body.band === 'string' ? body.band : '',
      });

      const { buffer } = await generateGrokImageEdit({
        prompt,
        sourcePngBuffer: logoBuf,
        aspect_ratio: resolveVanAspectRatio(),
        resolution: process.env.GROK_VAN_RESOLUTION === '2k' ? '2k' : '1k',
      });

      if (fs.existsSync(vanPath)) fs.unlinkSync(vanPath);
      fs.writeFileSync(vanPath, buffer);

      needRefund = false;
      const payload = { ok: true, cached: false, imageUrl: `/generated-remote-vans/${vanName}` };
      if (principal.kind === 'clerk' && planSlug === CLERK_PLAN.TRIAL)
        payload.trialQuota = getTrialQuotaSnapshot(principal.userId);
      return res.json(payload);
    } catch (e) {
      if (needRefund) {
        if (principal.kind === 'guest') await refundGuestAi(principal.guestId, 'van');
        else if (planSlug === CLERK_PLAN.TRIAL) await refundTrialImage(principal.userId);
        else await refundOne(principal.userId, 'van');
      }
      console.error('[remote-van] failed:', e.message || e);
      const status = e.status && Number.isInteger(e.status) ? e.status : 500;
      const detail = String(e.message || 'Remote van generation failed').slice(0, 400);
      return res.status(status).json({ ok: false, error: detail });
    }
  });
}

module.exports = { mountRemoteVanRoutes, GENERATED_VAN_DIR };
