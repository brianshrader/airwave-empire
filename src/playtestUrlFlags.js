/**
 * Client-only playtest query flags (localhost, Vite dev, deploy staging host).
 *
 * These adjust window globals for scenario-picker UX and sim prototypes. They are NOT
 * billing enforcement — paid surfaces (AI quotas, cloud saves, Stripe plan, trial locks)
 * remain server-authoritative via `/api/entitlements` and related routes.
 *
 * Production (airwaveempire.com / www) never applies these params.
 *
 * Query params (playtest hosts only):
 *   ?plan=pro|starter|trial_user|free_user  — preview picker locks (unsigned / pre-sync)
 *   ?pro=1                                  — shorthand for ?plan=pro
 *   ?playtestPlanOverride=1                 — keep ?plan= on window after Clerk entitlements sync (dev/staging)
 *   ?supplyPhase1=1                         — Station Supply Phase 1 sim anchors (client sim flag)
 *   ?nielsenCaps=1                          — Nielsen-shaped share caps prototype (client sim flag)
 */
import { marketIdsForClerkPlanSlug, PRO_ONLY_MARKET_IDS } from './billingEntitlements.js';
import {
  isPlaytestQueryFlagEnabled,
  isPlaytestUrlEnvironment as coreIsPlaytestUrlEnvironment,
  truthyQueryValue,
} from './playtestUrlEnvironmentCore.js';

const VALID_PLAN_SLUGS = Object.freeze(['free_user', 'starter', 'trial_user', 'pro']);

const PLAYTEST_PLAN_OVERRIDE_PARAM = 'playtestPlanOverride';

const playtestEnvOptions = () => ({ viteDev: !!import.meta.env?.DEV });

/** @param {string} [hostname] */
export function isPlaytestUrlEnvironment(hostname) {
  return coreIsPlaytestUrlEnvironment(hostname, playtestEnvOptions());
}

/** Stronger opt-in: required to re-apply ?plan= after Clerk `/api/entitlements` sync. */
export function allowsPlaytestPlanOverrideAfterEntitlementsSync(search) {
  if (import.meta.env?.DEV) return true;
  if (!isPlaytestUrlEnvironment()) return false;
  let raw = search;
  if (raw == null && typeof location !== 'undefined') raw = location.search;
  return truthyQueryValue(new URLSearchParams(raw || '').get(PLAYTEST_PLAN_OVERRIDE_PARAM));
}

/** @param {string} [search] */
export function parsePlaytestUrlFlags(search) {
  const q = new URLSearchParams(typeof search === 'string' ? search : '');
  let plan = q.get('plan')?.trim() || '';
  if (!plan && truthyQueryValue(q.get('pro'))) plan = 'pro';
  if (plan && !VALID_PLAN_SLUGS.includes(plan)) plan = '';
  return {
    plan,
    supplyPhase1: isPlaytestQueryFlagEnabled('supplyPhase1', search, undefined, playtestEnvOptions()),
    nielsenCaps: isPlaytestQueryFlagEnabled('nielsenCaps', search, undefined, playtestEnvOptions()),
    planOverrideAfterSync: allowsPlaytestPlanOverrideAfterEntitlementsSync(search),
  };
}

function applyPlaytestPlanSlugToWindow(plan) {
  if (!plan || !VALID_PLAN_SLUGS.includes(plan)) return;
  window.__WL_PLAYTEST_PLAN_SLUG_OVERRIDE = plan;
  window.__WL_CLERK_PLAN_SLUG = plan;
  window.__WL_PLAN_MARKET_IDS = marketIdsForClerkPlanSlug(plan);
  window.__WL_PRO_ONLY_MARKET_IDS = [...PRO_ONLY_MARKET_IDS];
  if (plan === 'pro' || plan === 'starter') {
    window.__WL_TRIAL_LOCK_KIND = '';
    window.__WL_TRIAL_LOCKED_MARKET_ID = '';
  }
}

/**
 * Apply playtest flags to window globals (sync — safe before legacy.js).
 * @param {string} [search]
 * @returns {{ applied: boolean, plan?: string, supplyPhase1?: boolean, nielsenCaps?: boolean }}
 */
export function applyPlaytestUrlFlagsToWindow(search) {
  if (typeof window === 'undefined' || !isPlaytestUrlEnvironment()) {
    return { applied: false };
  }
  const resolvedSearch =
    search ?? (typeof location !== 'undefined' ? location.search : '');
  const { plan, supplyPhase1, nielsenCaps } = parsePlaytestUrlFlags(resolvedSearch);
  if (plan) {
    applyPlaytestPlanSlugToWindow(plan);
  }
  if (supplyPhase1) {
    window.__WL_SUPPLY_PHASE1_PLAYTEST = true;
  }
  if (nielsenCaps) {
    window.__WL_NIELSEN_SHARE_CALIB_PLAYTEST = true;
  }
  if (plan || supplyPhase1 || nielsenCaps) {
    const parts = [];
    if (plan) parts.push(`plan=${plan}`);
    if (supplyPhase1) parts.push('supplyPhase1=1');
    if (nielsenCaps) parts.push('nielsenCaps=1');
    console.info('[playtest] client-only flags:', parts.join(', '));
  }
  return {
    applied: true,
    plan: plan || undefined,
    supplyPhase1: supplyPhase1 || undefined,
    nielsenCaps: nielsenCaps || undefined,
  };
}

/**
 * Re-apply ?plan= after Clerk entitlements sync — only when explicitly opted in
 * (?playtestPlanOverride=1) or Vite dev. Server plan from `/api/entitlements` wins otherwise.
 */
export function applyPlaytestPlanOverrideAfterEntitlementsSync() {
  if (typeof window === 'undefined' || !isPlaytestUrlEnvironment()) return null;
  if (!allowsPlaytestPlanOverrideAfterEntitlementsSync()) return null;
  const override = String(window.__WL_PLAYTEST_PLAN_SLUG_OVERRIDE || '').trim();
  if (!override || !VALID_PLAN_SLUGS.includes(override)) return null;
  applyPlaytestPlanSlugToWindow(override);
  return override;
}

// Re-export for callers that need the shared helper without window shim.
export { isPlaytestQueryFlagEnabled } from './playtestUrlEnvironmentCore.js';
