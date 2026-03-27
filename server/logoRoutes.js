/**
 * POST /api/generate-logo — cosmetic station logos via Grok (xAI Images).
 * Caches files under /generated-logos. Regenerate overwrites the cached file.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildLogoPrompt } = require('./logoPrompt');
const { generateStationLogo } = require('./services/logoProvider');

const GENERATED_DIR = path.join(__dirname, '..', 'generated-logos');

function ensureDir() {
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
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
  ensureDir();

  if (process.env.GROK_API_KEY) {
    console.log('[logo] Grok API key detected');
  } else {
    console.warn('[logo] Grok API key missing — set GROK_API_KEY in .env for logo generation');
  }

  app.post('/api/generate-logo', async (req, res) => {
    if (!process.env.GROK_API_KEY) {
      return res.status(503).json({
        ok: false,
        error: 'Logo generation failed',
      });
    }

    const body = req.body || {};
    const verrors = validateBody(body);
    if (verrors.length) {
      return res.status(400).json({ ok: false, error: verrors.join(' ') });
    }

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
        return res.json({ ok: true, cached: true, imageUrl: `/generated-logos/${existing.name}` });
      }

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

      return res.json({ ok: true, cached: false, imageUrl: `/generated-logos/${finalName}` });
    } catch (e) {
      console.error('[logo] Grok / save failed:', e.message || e);
      const status = e.status && Number.isInteger(e.status) ? e.status : 500;
      return res.status(status).json({
        ok: false,
        error: 'Logo generation failed',
      });
    }
  });
}

module.exports = { mountLogoRoutes, GENERATED_DIR };
