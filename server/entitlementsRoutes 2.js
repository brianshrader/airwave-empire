'use strict';

const { verifyClerkBearer } = require('./clerkVerify');
const { CLERK_PLAN } = require('./aiEntitlements');
const { resolveStripePlanForUser } = require('./stripePlanResolve');
const { marketIdsForPlanSlug } = require('./planMarkets');

async function requireUserIdOrNull(req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    return await verifyClerkBearer(m[1]);
  } catch {
    return null;
  }
}

function mountEntitlementsRoutes(app) {
  app.get('/api/entitlements', async (req, res) => {
    const sk = (process.env.CLERK_SECRET_KEY && String(process.env.CLERK_SECRET_KEY).trim()) || '';
    if (!sk) {
      return res.status(503).json({
        ok: false,
        code: 'missing_clerk_secret',
        error: 'Server auth is not configured (CLERK_SECRET_KEY).',
      });
    }
    const uid = await requireUserIdOrNull(req);
    if (!uid) {
      const marketIds = marketIdsForPlanSlug(CLERK_PLAN.FREE);
      return res.json({ ok: true, plan: CLERK_PLAN.FREE, marketIds, signedIn: false });
    }
    try {
      const resolved = await resolveStripePlanForUser(uid);
      const planSlug = resolved.planSlug;
      const marketIds = marketIdsForPlanSlug(planSlug);
      return res.json({
        ok: true,
        plan: planSlug,
        marketIds,
        signedIn: true,
        billingSource: resolved.source,
        billing: resolved.billing || null,
      });
    } catch (e) {
      const detail = e && e.message ? String(e.message) : String(e);
      console.error('[entitlements] resolve failed:', detail);
      return res.status(503).json({
        ok: false,
        code: 'billing_resolve_failed',
        error: 'Could not verify subscription (Stripe or cache error). Check server logs and STRIPE_SECRET_KEY.',
      });
    }
  });
}

module.exports = { mountEntitlementsRoutes };

