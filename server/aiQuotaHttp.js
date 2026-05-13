'use strict';

const { verifyClerkBearer } = require('./clerkVerify');
const { verifyGuestToken } = require('./guestJwt');
const guestAiUsage = require('./guestAiUsageStore');

const GUEST_AI_QUOTA_MSG =
  'Free guest AI limit reached. Create a free account or subscribe for more.';
const { monthlyLimitForPlan, CLERK_PLAN } = require('./aiEntitlements');
const { resolveStripePlanForUser } = require('./stripePlanResolve');
const {
  tryConsumeTrialImage,
  tryConsumeTrialJingle,
  TRIAL_IMAGES_CAP,
  TRIAL_JINGLE_CAP,
} = require('./trialQuotaStore');
const TRIAL_QUOTA_MSG =
  "You've run out of generation credits for our free trial. Subscribe to bring your station to life with more generation credits!";

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<string|null>} Clerk user id, or null after res.json
 */
async function requireClerkUserIdForAi(req, res) {
  if (!process.env.CLERK_SECRET_KEY) {
    res.status(503).json({
      ok: false,
      error: 'Server auth is not configured (CLERK_SECRET_KEY).',
      code: 'clerk_unconfigured',
    });
    return null;
  }
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({
      ok: false,
      error: 'Sign in required',
      code: 'auth_required',
    });
    return null;
  }
  try {
    return await verifyClerkBearer(m[1]);
  } catch {
    res.status(401).json({
      ok: false,
      error: 'Invalid session',
      code: 'auth_invalid',
    });
    return null;
  }
}

/**
 * @param {import('express').Response} res
 * @param {string} userId
 * @returns {Promise<string|null>} plan slug or null if 503 sent
 */
async function requirePlanSlugOr503(res, userId) {
  try {
    const r = await resolveStripePlanForUser(userId);
    return r.planSlug;
  } catch (e) {
    console.error('[ai-quota] Stripe plan resolution failed:', e.message || e);
    res.status(503).json({
      ok: false,
      error: 'Could not verify your subscription. Try again in a moment.',
      code: 'plan_unavailable',
    });
    return null;
  }
}

/**
 * @param {import('express').Response} res
 * @param {string} planSlug
 * @param {'logo' | 'jingle' | 'van'} kind
 * @param {(userId: string, kind: string, limit: number) => Promise<{ ok: boolean, used: number, limit: number, period: string }>} tryConsume
 * @param {string} userId
 * @returns {Promise<boolean>} true if allowed
 */
async function tryConsumeQuota(res, planSlug, kind, tryConsume, userId) {
  if (planSlug === CLERK_PLAN.TRIAL) {
    if (kind === 'jingle') {
      const out = await tryConsumeTrialJingle(userId, TRIAL_JINGLE_CAP);
      if (!out.ok) {
        res.status(403).json({
          ok: false,
          error: TRIAL_QUOTA_MSG,
          code: 'trial_quota_exhausted',
          kind: 'jingle',
          limit: out.limit,
          used: out.used,
        });
        return false;
      }
      return true;
    }
    if (kind === 'logo' || kind === 'van') {
      const out = await tryConsumeTrialImage(userId, TRIAL_IMAGES_CAP);
      if (!out.ok) {
        res.status(403).json({
          ok: false,
          error: TRIAL_QUOTA_MSG,
          code: 'trial_quota_exhausted',
          kind,
          limit: out.limit,
          used: out.used,
        });
        return false;
      }
      return true;
    }
  }

  const limit = monthlyLimitForPlan(planSlug, kind);
  const out = await tryConsume(userId, kind, limit);
  if (out.ok) return true;
  res.status(403).json({
    ok: false,
    error: `Monthly ${kind} generation limit reached for your plan — upgrade or try next month (UTC).`,
    code: 'quota_exceeded',
    kind,
    plan: planSlug,
    limit: out.limit,
    used: out.used,
    period: out.period,
  });
  return false;
}

/**
 * Clerk JWT or guest HMAC token (anonymous onboarding).
 * @returns {Promise<{ kind: 'clerk', userId: string } | { kind: 'guest', guestId: string } | null>}
 */
async function resolveAiPrincipal(req, res) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({
      ok: false,
      error: 'Sign in required',
      code: 'auth_required',
    });
    return null;
  }
  const bearer = m[1].trim();
  const guestId = verifyGuestToken(bearer);
  if (guestId) return { kind: 'guest', guestId };

  if (!process.env.CLERK_SECRET_KEY) {
    res.status(503).json({
      ok: false,
      error: 'Server auth is not configured (CLERK_SECRET_KEY).',
      code: 'clerk_unconfigured',
    });
    return null;
  }
  try {
    const userId = await verifyClerkBearer(bearer);
    return { kind: 'clerk', userId };
  } catch {
    res.status(401).json({
      ok: false,
      error: 'Invalid session',
      code: 'auth_invalid',
    });
    return null;
  }
}

/**
 * @param {'logo' | 'jingle' | 'van'} kind
 * @returns {Promise<boolean>}
 */
async function consumeGuestAi(res, guestId, kind) {
  const out = await guestAiUsage.tryConsume(guestId, kind);
  if (out.ok) return true;
  res.status(403).json({
    ok: false,
    code: 'guest_quota_exhausted',
    kind: out.kind,
    limit: out.limit,
    used: out.used,
    error: GUEST_AI_QUOTA_MSG,
  });
  return false;
}

module.exports = {
  requireClerkUserIdForAi,
  requirePlanSlugOr503,
  tryConsumeQuota,
  monthlyLimitForPlan,
  resolveAiPrincipal,
  consumeGuestAi,
  refundGuestAi: guestAiUsage.refundOne,
  GUEST_AI_QUOTA_MSG,
};
