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

const GENERATED_VAN_DIR = path.join(__dirname, '..', 'generated-remote-vans');

function ensureVanDir() {
  if (!fs.existsSync(GENERATED_VAN_DIR)) fs.mkdirSync(GENERATED_VAN_DIR, { recursive: true });
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

    const regenerateVan = body.regenerate === true;
    const keyMaterial = cacheKeyParts(body);
    const logoBase = logoBaseFileName(body, keyMaterial);
    const vanName = `${logoBase}-remote-van.png`;
    const vanPath = path.join(GENERATED_VAN_DIR, vanName);

    if (!regenerateVan && fs.existsSync(vanPath)) {
      return res.json({ ok: true, cached: true, imageUrl: `/generated-remote-vans/${vanName}` });
    }

    try {
      // Always use cached logo for the same brand/format key when present; regenerate station logo separately if needed.
      const logoBuf = await getOrCreateLogoPngBuffer(body, false);
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
        aspect_ratio: '16:9',
        resolution: process.env.GROK_VAN_RESOLUTION === '2k' ? '2k' : '1k',
      });

      if (fs.existsSync(vanPath)) fs.unlinkSync(vanPath);
      fs.writeFileSync(vanPath, buffer);

      return res.json({ ok: true, cached: false, imageUrl: `/generated-remote-vans/${vanName}` });
    } catch (e) {
      console.error('[remote-van] failed:', e.message || e);
      const status = e.status && Number.isInteger(e.status) ? e.status : 500;
      const detail = String(e.message || 'Remote van generation failed').slice(0, 400);
      return res.status(status).json({ ok: false, error: detail });
    }
  });
}

module.exports = { mountRemoteVanRoutes, GENERATED_VAN_DIR };
