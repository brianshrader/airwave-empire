/**
 * Centralized server-side environment checks. Call once after dotenv (and optional WL_ENV_FILE).
 * Fails fast on unsafe multiplayer auth configuration.
 */
'use strict';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function hasClerkSecretKey() {
  const k = process.env.CLERK_SECRET_KEY;
  return typeof k === 'string' && k.trim().length > 0;
}

/** Explicit dev-only: allow Socket.io without Clerk JWT verification. */
function mpAuthDevBypassEnabled() {
  return process.env.WL_ALLOW_MP_AUTH_BYPASS === '1';
}

/**
 * Validates required / inconsistent configuration.
 * @returns {{ production: boolean, clerkSecret: boolean, mpAuthBypass: boolean }}
 */
function validateServerEnv() {
  const production = isProduction();
  const clerkSecret = hasClerkSecretKey();
  const mpAuthBypass = mpAuthDevBypassEnabled();

  if (production && !clerkSecret) {
    console.error(
      '[ENV] FATAL: NODE_ENV=production requires CLERK_SECRET_KEY (multiplayer Socket.io auth).',
    );
    process.exit(1);
  }

  if (production && mpAuthBypass) {
    console.error(
      '[ENV] FATAL: WL_ALLOW_MP_AUTH_BYPASS=1 is not allowed when NODE_ENV=production.',
    );
    process.exit(1);
  }

  if (!production && !clerkSecret && !mpAuthBypass) {
    console.error(
      '[ENV] FATAL: CLERK_SECRET_KEY is unset. Set it for local multiplayer, or set WL_ALLOW_MP_AUTH_BYPASS=1 to run without Clerk (development only). See .env.example.',
    );
    process.exit(1);
  }

  if (mpAuthBypass && clerkSecret) {
    console.warn(
      '[ENV] WL_ALLOW_MP_AUTH_BYPASS=1 is set while CLERK_SECRET_KEY is present — bypass is ignored; Clerk verification is used.',
    );
  }

  const stripeSk = (process.env.STRIPE_SECRET_KEY || '').trim();
  const stripeWh = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (stripeSk && !stripeWh) {
    console.warn(
      '[ENV] STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing — POST /api/stripe/webhook will return 503 until both are configured.',
    );
  }
  if (stripeWh && !stripeSk) {
    console.warn(
      '[ENV] STRIPE_WEBHOOK_SECRET is set without STRIPE_SECRET_KEY — webhook handler requires the Stripe secret key.',
    );
  }

  return { production, clerkSecret, mpAuthBypass };
}

module.exports = {
  validateServerEnv,
  isProduction,
  hasClerkSecretKey,
  mpAuthDevBypassEnabled,
};
