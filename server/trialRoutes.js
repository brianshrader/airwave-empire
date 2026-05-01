'use strict';

const accountStore = require('./accountStore');
const { verifyClerkBearer } = require('./clerkVerify');
const { resolveStripePlanForUser } = require('./stripePlanResolve');
const { CLERK_PLAN } = require('./aiEntitlements');
const { getTrialQuotaSnapshot } = require('./trialQuotaStore');

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

/** Called when the client finishes the signup trial run (Fall 2020) — locks account to free tier markets until they subscribe. */
function mountTrialRoutes(app) {
  /** Signed-in trial users: lifetime AI usage tallies for signup trial caps. */
  app.get('/api/trial/quota', async (req, res) => {
    const uid = await requireUid(req, res);
    if (!uid) return;
    try {
      const resolved = await resolveStripePlanForUser(uid);
      if (resolved.planSlug !== CLERK_PLAN.TRIAL) {
        return res.json({ ok: true, trial: false });
      }
      return res.json({ ok: true, trial: true, trialQuota: getTrialQuotaSnapshot(uid) });
    } catch (e) {
      console.error('[trial] quota GET:', e.message || e);
      res.status(503).json({ ok: false, error: 'Could not load trial usage.' });
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
