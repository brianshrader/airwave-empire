/**
 * Account-scoped solo game saves (JSON) on disk under data/cloud_saves/<clerkUserId>/.
 * Requires Clerk Bearer token; Stripe subscription when enabled (see subscriptionAccess).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { verifyClerkBearer } = require('./clerkVerify');
const { userHasActiveSubscription, userCloudAutosaveEligible, subscriptionCheckEnabled } = require('./subscriptionAccess');
const { assertCloudSaveMarketAllowedForPlan } = require('./planMarketAccess');
const { posthog } = require('./posthog');
const { cloudSavesDir, ensureDir: ensureRuntimeDir } = require('./runtimePaths');

const ROOT = cloudSavesDir();
ensureRuntimeDir(ROOT);
const MAX_SAVES = Math.min(50, parseInt(process.env.CLOUD_SAVE_MAX_SLOTS || '10', 10) || 10);
/** Default 12 MiB — late-game JSON can exceed 6 MiB; hard cap 24 MiB. Must stay ≤ server.js express.json (JSON_BODY_LIMIT). */
const MAX_BYTES = Math.min(
  24 * 1024 * 1024,
  parseInt(process.env.CLOUD_SAVE_MAX_BYTES || String(12 * 1024 * 1024), 10) || 12 * 1024 * 1024,
);
const AUTOSAVE_FILENAME = 'autosave.json';
const AUTOSAVE_RETENTION_DAYS = Math.max(
  7,
  parseInt(process.env.CLOUD_AUTOSAVE_RETENTION_DAYS || '60', 10) || 60,
);
// Ops: if browsers show HTTP 413 + “CORS” errors, nginx (or ALB) is rejecting the body before Node — raise client_max_body_size (e.g. 25m) for /api/.

function safeUid(uid) {
  return String(uid).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
}

function userRoot(uid) {
  return path.join(ROOT, safeUid(uid));
}

function manifestPath(uid) {
  return path.join(userRoot(uid), 'manifest.json');
}

function savePath(uid, id) {
  return path.join(userRoot(uid), `${id}.json`);
}

function autosavePath(uid) {
  return path.join(userRoot(uid), AUTOSAVE_FILENAME);
}

function metaFromPayloadBody(payload, bytes) {
  const G = payload.G || {};
  return {
    saved: payload.saved || new Date().toISOString(),
    year: typeof G.year === 'number' ? G.year : null,
    period: typeof G.period === 'number' ? G.period : null,
    marketId: G.marketId || null,
    bytes,
  };
}

/** Drop rolling autosave when older than retention window (file mtime). */
function purgeStaleAutosaveIfNeeded(uid) {
  const p = autosavePath(uid);
  if (!fs.existsSync(p)) return false;
  try {
    const ageMs = Date.now() - fs.statSync(p).mtimeMs;
    if (ageMs > AUTOSAVE_RETENTION_DAYS * 86400000) {
      fs.unlinkSync(p);
      return true;
    }
  } catch (e) {
    console.warn('[CLOUD] autosave retention check:', e.message || e);
  }
  return false;
}

function readAutosaveMeta(uid) {
  if (purgeStaleAutosaveIfNeeded(uid)) return null;
  const p = autosavePath(uid);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const payload = JSON.parse(raw);
    return metaFromPayloadBody(payload, Buffer.byteLength(raw, 'utf8'));
  } catch (e) {
    console.warn('[CLOUD] autosave meta read:', e.message || e);
    return null;
  }
}

function ensureUserDir(uid) {
  ensureRuntimeDir(userRoot(uid));
}

function readManifest(uid) {
  const p = manifestPath(uid);
  if (!fs.existsSync(p)) return { saves: [] };
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(j.saves)) j.saves = [];
    return j;
  } catch {
    return { saves: [] };
  }
}

function writeManifest(uid, man) {
  ensureUserDir(uid);
  fs.writeFileSync(manifestPath(uid), JSON.stringify(man, null, 2), 'utf8');
}

function metaFromPayload(id, payload, bytes) {
  const G = payload.G || {};
  return {
    id,
    label: String(payload.label || 'Cloud save').slice(0, 200),
    saved: payload.saved || new Date().toISOString(),
    year: typeof G.year === 'number' ? G.year : null,
    period: typeof G.period === 'number' ? G.period : null,
    marketId: G.marketId || null,
    bytes,
  };
}

async function getUserId(req, res) {
  if (!process.env.CLERK_SECRET_KEY) {
    res.status(503).json({ error: 'CLERK_SECRET_KEY not configured on server' });
    return null;
  }
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({ error: 'Sign in required' });
    return null;
  }
  try {
    return await verifyClerkBearer(m[1]);
  } catch (e) {
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'Invalid body';
  if (body.v == null) return 'Missing save version';
  if (!body.G || typeof body.G !== 'object') return 'Missing game state';
  if (typeof body.G.year !== 'number') return 'Invalid game state';
  return null;
}

function mountCloudSaves(app) {
  const router = express.Router();
  // JSON body is parsed by app-level express.json (see server.js). We only enforce MAX_BYTES on POST/PUT.

  /** Who can use cloud (auth + subscription gate for UI). */
  router.get('/status', async (req, res) => {
    const uid = await getUserId(req, res);
    if (!uid) return;
    const subRequired = subscriptionCheckEnabled();
    const hasSub = subRequired ? await userHasActiveSubscription(uid) : true;
    const autosaveEligible = await userCloudAutosaveEligible(uid);
    const cloudAutosave = autosaveEligible ? readAutosaveMeta(uid) : null;
    res.json({
      authenticated: true,
      subscriptionRequired: subRequired,
      subscriptionActive: hasSub,
      canWrite: hasSub,
      maxSaves: MAX_SAVES,
      maxBytes: MAX_BYTES,
      cloudAutosaveEligible: autosaveEligible,
      cloudAutosaveRetentionDays: AUTOSAVE_RETENTION_DAYS,
      cloudAutosave,
    });
  });

  router.get('/', async (req, res) => {
    const uid = await getUserId(req, res);
    if (!uid) return;
    if (subscriptionCheckEnabled() && !(await userHasActiveSubscription(uid))) {
      return res.status(402).json({ error: 'subscription_required', message: 'Active subscription required for cloud saves.' });
    }
    const man = readManifest(uid);
    const autosaveEligible = await userCloudAutosaveEligible(uid);
    res.json({
      saves: man.saves.map(s => ({
        id: s.id,
        label: s.label,
        saved: s.saved,
        year: s.year,
        period: s.period,
        marketId: s.marketId,
        bytes: s.bytes,
      })),
      autosave: autosaveEligible ? readAutosaveMeta(uid) : null,
    });
  });

  /** Rolling autosave — one file per account, Starter/Pro only; must register before /:id. */
  router.get('/autosave/meta', async (req, res) => {
    const uid = await getUserId(req, res);
    if (!uid) return;
    if (!(await userCloudAutosaveEligible(uid))) {
      return res.status(402).json({ error: 'plan_required', message: 'Rolling cloud autosave requires Starter or Pro.' });
    }
    const meta = readAutosaveMeta(uid);
    if (!meta) return res.status(404).json({ error: 'not_found' });
    res.json(meta);
  });

  router.get('/autosave', async (req, res) => {
    const uid = await getUserId(req, res);
    if (!uid) return;
    if (!(await userCloudAutosaveEligible(uid))) {
      return res.status(402).json({ error: 'plan_required', message: 'Rolling cloud autosave requires Starter or Pro.' });
    }
    const p = autosavePath(uid);
    if (purgeStaleAutosaveIfNeeded(uid) || !fs.existsSync(p)) {
      return res.status(404).json({ error: 'not_found' });
    }
    try {
      const raw = fs.readFileSync(p, 'utf8');
      res.type('json').send(raw);
    } catch (e) {
      res.status(500).json({ error: 'Read failed' });
    }
  });

  router.put('/autosave', async (req, res) => {
    const uid = await getUserId(req, res);
    if (!uid) return;
    if (!(await userCloudAutosaveEligible(uid))) {
      return res.status(402).json({ error: 'plan_required', message: 'Rolling cloud autosave requires Starter or Pro.' });
    }
    const err = validatePayload(req.body);
    if (err) return res.status(400).json({ error: err });
    if (!(await assertCloudSaveMarketAllowedForPlan(res, uid, req.body.G.marketId))) return;
    const raw = JSON.stringify(req.body);
    const bytes = Buffer.byteLength(raw, 'utf8');
    if (bytes > MAX_BYTES) {
      return res.status(413).json({ error: 'save_too_large', maxBytes: MAX_BYTES });
    }
    ensureUserDir(uid);
    fs.writeFileSync(autosavePath(uid), raw, 'utf8');
    const meta = metaFromPayloadBody(req.body, bytes);
    posthog.capture({
      distinctId: uid,
      event: 'cloud autosave synced',
      properties: { year: meta.year, market_id: meta.marketId, bytes: meta.bytes },
    });
    res.json({ ok: true, meta });
  });

  router.get('/:id', async (req, res) => {
    const uid = await getUserId(req, res);
    if (!uid) return;
    if (subscriptionCheckEnabled() && !(await userHasActiveSubscription(uid))) {
      return res.status(402).json({ error: 'subscription_required' });
    }
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const man = readManifest(uid);
    if (!man.saves.some(s => s.id === id)) return res.status(404).json({ error: 'Not found' });
    const p = savePath(uid, id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
    try {
      const raw = fs.readFileSync(p, 'utf8');
      res.type('json').send(raw);
    } catch (e) {
      res.status(500).json({ error: 'Read failed' });
    }
  });

  router.post('/', async (req, res) => {
    const uid = await getUserId(req, res);
    if (!uid) return;
    if (subscriptionCheckEnabled() && !(await userHasActiveSubscription(uid))) {
      return res.status(402).json({ error: 'subscription_required', message: 'Active subscription required for cloud saves.' });
    }
    const err = validatePayload(req.body);
    if (err) return res.status(400).json({ error: err });
    if (!(await assertCloudSaveMarketAllowedForPlan(res, uid, req.body.G.marketId))) return;
    const raw = JSON.stringify(req.body);
    if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) {
      return res.status(413).json({ error: 'save_too_large', maxBytes: MAX_BYTES });
    }
    const man = readManifest(uid);
    if (man.saves.length >= MAX_SAVES) {
      return res.status(400).json({ error: 'save_limit', maxSaves: MAX_SAVES });
    }
    const id = `cs_${crypto.randomBytes(12).toString('hex')}`;
    ensureUserDir(uid);
    fs.writeFileSync(savePath(uid, id), raw, 'utf8');
    const meta = metaFromPayload(id, req.body, Buffer.byteLength(raw, 'utf8'));
    man.saves.unshift(meta);
    writeManifest(uid, man);
    posthog.capture({
      distinctId: uid,
      event: 'cloud save created',
      properties: { save_id: id, year: meta.year, market_id: meta.marketId, bytes: meta.bytes },
    });
    res.status(201).json({ id, meta });
  });

  router.put('/:id', async (req, res) => {
    const uid = await getUserId(req, res);
    if (!uid) return;
    if (subscriptionCheckEnabled() && !(await userHasActiveSubscription(uid))) {
      return res.status(402).json({ error: 'subscription_required' });
    }
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const err = validatePayload(req.body);
    if (err) return res.status(400).json({ error: err });
    if (!(await assertCloudSaveMarketAllowedForPlan(res, uid, req.body.G.marketId))) return;
    const raw = JSON.stringify(req.body);
    if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) {
      return res.status(413).json({ error: 'save_too_large', maxBytes: MAX_BYTES });
    }
    const man = readManifest(uid);
    const idx = man.saves.findIndex(s => s.id === id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    ensureUserDir(uid);
    fs.writeFileSync(savePath(uid, id), raw, 'utf8');
    const meta = metaFromPayload(id, req.body, Buffer.byteLength(raw, 'utf8'));
    man.saves[idx] = meta;
    writeManifest(uid, man);
    posthog.capture({
      distinctId: uid,
      event: 'cloud save updated',
      properties: { save_id: id, year: meta.year, market_id: meta.marketId, bytes: meta.bytes },
    });
    res.json({ id, meta });
  });

  router.delete('/:id', async (req, res) => {
    const uid = await getUserId(req, res);
    if (!uid) return;
    if (subscriptionCheckEnabled() && !(await userHasActiveSubscription(uid))) {
      return res.status(402).json({ error: 'subscription_required' });
    }
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const man = readManifest(uid);
    const next = man.saves.filter(s => s.id !== id);
    if (next.length === man.saves.length) return res.status(404).json({ error: 'Not found' });
    const p = savePath(uid, id);
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) {
      console.warn('[CLOUD] delete file:', e.message);
    }
    man.saves = next;
    writeManifest(uid, man);
    posthog.capture({
      distinctId: uid,
      event: 'cloud save deleted',
      properties: { save_id: id },
    });
    res.json({ ok: true });
  });

  app.use('/api/saves/cloud', router);
}

module.exports = { mountCloudSaves };
