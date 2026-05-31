/**
 * Browser PostHog — launch funnel and product analytics.
 * Safe when disabled, missing key, DNT, or opt-out. No PII in events.
 */
import posthog from 'posthog-js';
import { trackMetaFromAppEvent } from './metaPixelClient.js';

let _inited = false;

/** Events from legacy.js before PostHog finishes init (microsecond race); flushed once `_inited`. */
const _legacyPending = [];
const LEGACY_QUEUE_CAP = 120;

function flushLegacyQueue() {
  while (_legacyPending.length && _inited) {
    const x = _legacyPending.shift();
    if (x) captureEvent(x.event, x.props);
  }
}

/**
 * Set immediately so `src/legacy.js` never calls an undefined hook.
 * Queues until PostHog init succeeds; replaced with `captureEvent` after flush.
 */
function installLegacyAnalyticsBridge() {
  if (typeof window === 'undefined') return;
  window.__WL_ANALYTICS_CAPTURE = (event, props) => {
    try {
      // Meta Pixel bridge should work even if PostHog is disabled/missing.
      try {
        const name = safeString(event, 64);
        if (name) trackMetaFromAppEvent(name, sanitizeProps(props && typeof props === 'object' ? props : {}));
      } catch (_e2) {}
      if (_inited) {
        captureEvent(event, props);
        return;
      }
      if (_legacyPending.length < LEGACY_QUEUE_CAP) _legacyPending.push({ event, props });
    } catch (_e) {}
  };
}

function analyticsDisabled() {
  if (typeof window === 'undefined') return true;
  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return true;
    if (localStorage.getItem('wl_analytics_opt_out') === '1') return true;
  } catch (_e) {}
  return false;
}

function safeString(v, max = 200) {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s) return '';
  if (s.length > max) return s.slice(0, max);
  if (/@[^.\s]+(\.[^.\s]+)+/.test(s) && s.length < 80) return '[redacted]';
  return s;
}

/**
 * @param {Record<string, unknown>} [props]
 */
function sanitizeProps(props) {
  if (!props || typeof props !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v > 1e12 || v < -1e12) continue;
      out[k] = v;
    } else if (typeof v === 'boolean') {
      out[k] = v;
    } else {
      out[k] = safeString(v, 120);
    }
  }
  return out;
}

/** Narrow Clerk billing slug → PostHog plan dimension (avoid raw slug proliferation). */
function planDimensionFromSlug(slug) {
  const s = String(slug || '').trim();
  if (s === 'starter') return 'starter';
  if (s === 'pro') return 'pro';
  if (s === 'trial_user') return 'trial';
  if (s === 'free_user') return 'free';
  return s ? safeString(s, 32) : 'unknown';
}

/**
 * Default properties merged into every browser `captureEvent` call.
 * Callers override these keys intentionally. Omits unset optionals.
 *
 * Uses `globalThis.G` when present (solo game loads before legacy globals bind to `window.G`).
 */
export function analyticsBaseProps() {
  const out = {};
  try {
    let mode = '';
    try {
      mode = String(import.meta.env?.MODE || '');
    } catch (_e) {
      mode = '';
    }
    if (mode === 'production') out.build_env = 'prod';
    else if (mode === 'development') out.build_env = 'dev';
    else if (mode) out.build_env = safeString(mode, 16);
    else out.build_env = 'unknown';

    let av = '';
    try {
      av = String(import.meta.env?.VITE_APP_VERSION || '').trim();
    } catch (_e) {
      av = '';
    }
    if (av) out.app_version = av.slice(0, 48);

    if (typeof window === 'undefined') return out;

    const w = innerWidth || 1024;
    if (w < 640) out.viewport_type = 'mobile';
    else if (w < 1100) out.viewport_type = 'tablet';
    else out.viewport_type = 'desktop';

    out.logged_in = !!(typeof window.Clerk?.isSignedIn === 'boolean' ? window.Clerk.isSignedIn : window.Clerk?.user);

    const slug = typeof window.__WL_CLERK_PLAN_SLUG === 'string' ? window.__WL_CLERK_PLAN_SLUG.trim() : '';
    out.plan = planDimensionFromSlug(slug);

    const g =
      typeof globalThis !== 'undefined' && globalThis.G && typeof globalThis.G === 'object' ? globalThis.G : null;
    if (g) {
      const mid = typeof g.marketId === 'string' ? g.marketId.trim() : '';
      if (mid) out.market = safeString(mid, 48);
      const scid =
        typeof g.sc?.id === 'string'
          ? g.sc.id.trim()
          : typeof g.sc === 'object' && g.sc && typeof g.sc.id === 'string'
            ? String(g.sc.id).trim()
            : '';
      if (scid) out.scenario = safeString(scid, 48);
      let m = 'unknown';
      try {
        const Mp = typeof globalThis !== 'undefined' ? globalThis.MP : undefined;
        if (Mp && Mp.mode === 'live') m = 'multiplayer';
        else if (g.careerCampaign || g.campaignAssignment) m = 'gm_career';
        else if (g.sc?.id === 'gm_under') m = 'gm';
        else if (g.tutorialMode || g.sc?.id === 'tutorial_turnaround') m = 'tutorial';
        else m = 'classic';
      } catch (_e) {
        m = 'unknown';
      }
      out.mode = safeString(m, 24);
    }
  } catch (_e) {
    /* swallow */
  }
  return out;
}

export function initAnalyticsClient() {
  if (typeof window === 'undefined' || _inited) return;
  installLegacyAnalyticsBridge();
  if (analyticsDisabled()) {
    window.__WL_ANALYTICS_DISABLED = true;
    _legacyPending.length = 0;
    window.__WL_ANALYTICS_CAPTURE = () => {};
    return;
  }
  const key = import.meta.env?.VITE_POSTHOG_API_KEY?.trim?.() ?? '';
  const host = (import.meta.env?.VITE_POSTHOG_HOST?.trim?.() ?? 'https://us.i.posthog.com').replace(/\/$/, '');
  if (!key) {
    window.__WL_ANALYTICS_NO_KEY = true;
    _legacyPending.length = 0;
    window.__WL_ANALYTICS_CAPTURE = () => {};
    return;
  }
  try {
    posthog.init(key, {
      api_host: host,
      persistence: 'localStorage+cookie',
      autocapture: false,
      /** PostHog-recommended defaults: automatic $pageview (history API on SPAs, load on static pages). */
      defaults: '2026-01-30',
      capture_pageleave: false,
      disable_session_recording: true,
    });
    _inited = true;
    window.__WL_POSTHOG_READY = true;
    flushLegacyQueue();
    window.__WL_ANALYTICS_CAPTURE = captureEvent;
  } catch (_e) {
    window.__WL_ANALYTICS_INIT_ERR = true;
    _legacyPending.length = 0;
    window.__WL_ANALYTICS_CAPTURE = () => {};
  }
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [props]
 */
export function captureEvent(event, props) {
  try {
    const name = safeString(event, 64);
    if (!name) return;
    const base = analyticsBaseProps();
    const extras = props && typeof props === 'object' ? props : {};
    const merged = sanitizeProps({ ...base, ...extras });
    // Meta Pixel bridge: only emits for a tiny allowlist of milestones.
    try {
      trackMetaFromAppEvent(name, merged);
    } catch (_e2) {}
    if (!_inited) return;
    posthog.capture(name, merged);
  } catch (_e) {}
}

/**
 * @param {string} clerkUserId — Clerk `user.id` only
 */
export function identifyClerkUser(clerkUserId) {
  try {
    if (!_inited) return;
    const id = safeString(clerkUserId, 128);
    if (!id || id.startsWith('[redacted]')) return;
    posthog.identify(id);
  } catch (_e) {}
}

installLegacyAnalyticsBridge();

export { posthog, sanitizeProps, safeString };
