/**
 * Opt-in playtest query flags — localhost, Vite dev, and staging/preview hosts only.
 * Production (airwaveempire.com) ignores these params.
 *
 * ?plan=pro              — preview Pro entitlements (all markets + 1985 scenarios)
 * ?pro=1                 — shorthand for ?plan=pro
 * ?supplyPhase1=1        — Station Supply Phase 1 anchors + replenishment on new games
 * ?nielsenCaps=1         — Prototype Nielsen-shaped #1 caps on mega/large (playtest only)
 */
import { marketIdsForClerkPlanSlug, PRO_ONLY_MARKET_IDS } from './billingEntitlements.js';

const VALID_PLAN_SLUGS = Object.freeze(['free_user', 'starter', 'trial_user', 'pro']);

function truthyQueryValue(v) {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/** @param {string} [hostname] */
export function isPlaytestUrlEnvironment(hostname) {
  try {
    if (import.meta.env?.DEV) return true;
    if (typeof window === 'undefined') return false;
    const h = String(hostname ?? window.location?.hostname ?? '').toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1') return true;
    if (h.includes('staging')) return true;
    if (h.endsWith('.amplifyapp.com')) return true;
    return false;
  } catch (_e) {
    return false;
  }
}

/** @param {string} [search] */
export function parsePlaytestUrlFlags(search) {
  const q = new URLSearchParams(typeof search === 'string' ? search : '');
  let plan = q.get('plan')?.trim() || '';
  if (!plan && truthyQueryValue(q.get('pro'))) plan = 'pro';
  if (plan && !VALID_PLAN_SLUGS.includes(plan)) plan = '';
  return {
    plan,
    supplyPhase1: truthyQueryValue(q.get('supplyPhase1')),
    nielsenCaps: truthyQueryValue(q.get('nielsenCaps')),
  };
}

/**
 * Apply playtest flags to window globals (sync — safe before legacy.js).
 * @param {string} [search]
 * @returns {{ applied: boolean, plan?: string, supplyPhase1?: boolean }}
 */
export function applyPlaytestUrlFlagsToWindow(search) {
  if (typeof window === 'undefined' || !isPlaytestUrlEnvironment()) {
    return { applied: false };
  }
  const { plan, supplyPhase1, nielsenCaps } = parsePlaytestUrlFlags(
    search ?? (typeof location !== 'undefined' ? location.search : ''),
  );
  if (plan) {
    window.__WL_PLAYTEST_PLAN_SLUG_OVERRIDE = plan;
    window.__WL_CLERK_PLAN_SLUG = plan;
    window.__WL_PLAN_MARKET_IDS = marketIdsForClerkPlanSlug(plan);
    window.__WL_PRO_ONLY_MARKET_IDS = [...PRO_ONLY_MARKET_IDS];
    if (plan === 'pro' || plan === 'starter') {
      window.__WL_TRIAL_LOCK_KIND = '';
      window.__WL_TRIAL_LOCKED_MARKET_ID = '';
    }
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
    console.info('[playtest]', parts.join(', '));
  }
  return { applied: true, plan: plan || undefined, supplyPhase1: supplyPhase1 || undefined, nielsenCaps: nielsenCaps || undefined };
}

/** Re-apply plan override after Clerk entitlements sync (if URL set one). */
export function applyPlaytestPlanOverrideAfterEntitlementsSync() {
  if (typeof window === 'undefined' || !isPlaytestUrlEnvironment()) return null;
  const override = String(window.__WL_PLAYTEST_PLAN_SLUG_OVERRIDE || '').trim();
  if (!override || !VALID_PLAN_SLUGS.includes(override)) return null;
  window.__WL_CLERK_PLAN_SLUG = override;
  window.__WL_PLAN_MARKET_IDS = marketIdsForClerkPlanSlug(override);
  window.__WL_PRO_ONLY_MARKET_IDS = [...PRO_ONLY_MARKET_IDS];
  if (override === 'pro' || override === 'starter') {
    window.__WL_TRIAL_LOCK_KIND = '';
    window.__WL_TRIAL_LOCKED_MARKET_ID = '';
  }
  return override;
}
