'use strict';

const accountStore = require('./accountStore');
const { verifyClerkBearer } = require('./clerkVerify');
const { resolveStripePlanForUser } = require('./stripePlanResolve');
const { CLERK_PLAN } = require('./aiEntitlements');
const { getTrialQuotaSnapshot } = require('./trialQuotaStore');
const { marketIdsForPlanSlug } = require('./planMarkets');

/** Signup trial solo lock — same cities as client trial plan (Pro-only markets excluded). */
const ALLOWED_MARKET = new Set(marketIdsForPlanSlug(CLERK_PLAN.TRIAL));

async function requireUid(req, res) {
  if (!process.env.CLERK_SECRET_KEY) {
    res.status(503).json({ ok: false, error: 'Server auth not configured.' });
    return null;
  }
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({ ok: false, error: 'Authorization Bearer token required' });
    return null;
  }
  try {
    return await verifyClerkBearer(m[1]);
  } catch {
    res.status(401).json({ ok: false, error: 'Invalid session' });
    return null;
  }
}

function trialLockResponse(lock) {
  if (!lock || !lock.kind) {
    return { trialLockKind: null, lockedMarketId: null };
  }
  return {
    trialLockKind: lock.kind,
    lockedMarketId:
      lock.marketId != null && String(lock.marketId).trim() ? String(lock.marketId).trim() : null,
  };
}

async function processTrialLockCommit(uid, body, res) {
  const resolved = await resolveStripePlanForUser(uid);
  if (resolved.planSlug !== CLERK_PLAN.TRIAL) {
    res.status(403).json({ ok: false, error: 'Not on signup trial.' });
    return;
  }

  let kind = body && body.kind != null ? String(body.kind).trim().toLowerCase() : '';
  const rawMid = body && body.marketId != null ? String(body.marketId) : '';
  if (!kind && rawMid.trim()) kind = 'solo';
  if (!['solo', 'tutorial', 'campaign'].includes(kind)) {
    res.status(400).json({ ok: false, error: 'Invalid lock kind.' });
    return;
  }

  const payload =
    kind === 'solo'
      ? { kind: 'solo', marketId: rawMid.trim().toLowerCase() }
      : kind === 'tutorial'
        ? { kind: 'tutorial' }
        : { kind: 'campaign' };

  if (payload.kind === 'solo') {
    if (!ALLOWED_MARKET.has(payload.marketId)) {
      res.status(400).json({ ok: false, error: 'Invalid market.' });
      return;
    }
  }

  const existing = accountStore.getSignupTrialLock(uid);
  const saved = accountStore.setSignupTrialLockOnce(uid, payload);
  if (!saved) {
    res.status(409).json({
      ok: false,
      error: 'Trial game already committed.',
      ...trialLockResponse(existing),
    });
    return;
  }
  res.json({ ok: true, ...trialLockResponse(saved) });
}

/** Called when the client finishes the signup trial run (Fall 2020) — locks account to free tier markets until they subscribe. */
function mountTrialRoutes(app) {
  /** Signed-in trial users: lifetime AI usage + trial game commit (solo / tutorial / campaign). */
  app.get('/api/trial/quota', async (req, res) => {
    const uid = await requireUid(req, res);
    if (!uid) return;
    try {
      const resolved = await resolveStripePlanForUser(uid);
      if (resolved.planSlug !== CLERK_PLAN.TRIAL) {
        return res.json({ ok: true, trial: false, trialLockKind: null, lockedMarketId: null });
      }
      const lock = accountStore.getSignupTrialLock(uid);
      return res.json({
        ok: true,
        trial: true,
        ...trialLockResponse(lock),
        trialQuota: getTrialQuotaSnapshot(uid),
      });
    } catch (e) {
      console.error('[trial] quota GET:', e.message || e);
      res.status(503).json({ ok: false, error: 'Could not load trial usage.' });
    }
  });

  /**
   * Commit the one signup trial game: { kind: 'solo', marketId } | { kind: 'tutorial' } | { kind: 'campaign' }.
   */
  app.post('/api/trial/lock-commit', async (req, res) => {
    const uid = await requireUid(req, res);
    if (!uid) return;
    try {
      await processTrialLockCommit(uid, req.body || {}, res);
    } catch (e) {
      console.error('[trial] lock-commit:', e.message || e);
      res.status(500).json({ ok: false, error: 'Could not save trial lock.' });
    }
  });

  /** @deprecated Older clients — body { marketId } implies solo. */
  app.post('/api/trial/lock-market', async (req, res) => {
    const uid = await requireUid(req, res);
    if (!uid) return;
    try {
      const body = { ...(req.body || {}), kind: 'solo' };
      await processTrialLockCommit(uid, body, res);
    } catch (e) {
      console.error('[trial] lock-market:', e.message || e);
      res.status(500).json({ ok: false, error: 'Could not save trial lock.' });
    }
  });

  app.post('/api/trial/complete', async (req, res) => {
    const uid = await requireUid(req, res);
    if (!uid) return;
    try {
      accountStore.setTrialGameCompleted(uid, true);
      res.json({ ok: true });
    } catch (e) {
      console.error('[trial] complete:', e.message || e);
      res.status(500).json({ ok: false, error: 'Could not save trial state.' });
    }
  });
}

module.exports = { mountTrialRoutes };
