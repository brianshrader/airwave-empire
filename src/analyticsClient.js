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

const WL_UTM_FIRST_LS = 'wl_utm_first_v1';
const WL_UTM_LATEST_LS = 'wl_utm_latest_v1';
const WL_UTM_REGISTERED_SS = 'wl_utm_ph_registered_v1';
const WL_SUBSCRIPTION_STARTED_SS = 'wl_ph_subscription_started_v1';
const UTM_PARAM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];

/** @param {string} [search] */
function parseUtmFromSearch(search) {
  const out = {};
  try {
    const params = new URLSearchParams(search || '');
    for (const k of UTM_PARAM_KEYS) {
      const v = params.get(k);
      if (v) out[k] = safeString(v, 120);
    }
  } catch (_e) {}
  return out;
}

/** @param {string} key */
function readStoredUtm(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return {};
    const out = {};
    for (const k of UTM_PARAM_KEYS) {
      if (j[k]) out[k] = safeString(String(j[k]), 120);
    }
    return out;
  } catch (_e) {
    return {};
  }
}

/** @param {string} key @param {Record<string, string>} utm */
function writeStoredUtm(key, utm) {
  if (!utm || !Object.keys(utm).length) return;
  try {
    localStorage.setItem(key, JSON.stringify(utm));
  } catch (_e) {}
}

/** @param {Array<Record<string, string>>} sources */
function mergeUtmSources(sources) {
  const out = {};
  for (const src of sources) {
    if (!src) continue;
    for (const k of UTM_PARAM_KEYS) {
      if (src[k] && !out[k]) out[k] = src[k];
    }
  }
  return out;
}

/** Latest UTM when present; otherwise first-touch values from localStorage. */
function getActiveUtmAttribution() {
  if (typeof window === 'undefined') return {};
  const fromUrl = parseUtmFromSearch(window.location.search);
  const latest = mergeUtmSources([fromUrl, readStoredUtm(WL_UTM_LATEST_LS)]);
  const first = mergeUtmSources([readStoredUtm(WL_UTM_FIRST_LS), fromUrl]);
  return mergeUtmSources([latest, first]);
}

function utmPersonPropertySets() {
  const fromUrl = typeof window !== 'undefined' ? parseUtmFromSearch(window.location.search) : {};
  const firstTouch = mergeUtmSources([readStoredUtm(WL_UTM_FIRST_LS), fromUrl]);
  const latestTouch = mergeUtmSources([fromUrl, readStoredUtm(WL_UTM_LATEST_LS)]);
  const setOnce = {};
  const set = {};
  for (const k of UTM_PARAM_KEYS) {
    if (firstTouch[k]) setOnce[`initial_${k}`] = firstTouch[k];
    if (latestTouch[k]) set[k] = latestTouch[k];
  }
  return { setOnce, set, active: mergeUtmSources([latestTouch, firstTouch]) };
}

function persistUtmFromUrl() {
  if (typeof window === 'undefined') return false;
  const fromUrl = parseUtmFromSearch(window.location.search);
  if (!Object.keys(fromUrl).length) return false;
  writeStoredUtm(WL_UTM_LATEST_LS, fromUrl);
  if (!Object.keys(readStoredUtm(WL_UTM_FIRST_LS)).length) {
    writeStoredUtm(WL_UTM_FIRST_LS, fromUrl);
  }
  return true;
}

function applyMarketingAttribution() {
  if (!_inited) return;
  const hadUrlUtms = persistUtmFromUrl();
  const { setOnce, set, active } = utmPersonPropertySets();
  if (!Object.keys(active).length) return;
  try {
    posthog.register(active);
  } catch (_e) {}
  if (!Object.keys(setOnce).length && !Object.keys(set).length) return;

  let shouldCapture = hadUrlUtms;
  if (!shouldCapture) {
    try {
      shouldCapture = sessionStorage.getItem(WL_UTM_REGISTERED_SS) !== '1';
      if (shouldCapture) sessionStorage.setItem(WL_UTM_REGISTERED_SS, '1');
    } catch (_e) {}
  }
  if (!shouldCapture) return;

  try {
    posthog.capture('utm_attribution_captured', {
      ...active,
      ...(Object.keys(setOnce).length ? { $set_once: setOnce } : {}),
      ...(Object.keys(set).length ? { $set: set } : {}),
    });
  } catch (_e) {}
}

function maybeTrackSubscriptionStarted(props) {
  try {
    const plan = String(props?.plan || props?.selected_plan || '').trim();
    if (plan !== 'starter' && plan !== 'pro') return;
    if (sessionStorage.getItem(WL_SUBSCRIPTION_STARTED_SS) === '1') return;
    sessionStorage.setItem(WL_SUBSCRIPTION_STARTED_SS, '1');
    const base = analyticsBaseProps();
    const merged = sanitizeProps({ ...base, ...(props && typeof props === 'object' ? props : {}) });
    if (!_inited) return;
    posthog.capture('subscription_started', merged);
  } catch (_e) {}
}

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

    Object.assign(out, getActiveUtmAttribution());
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
    applyMarketingAttribution();
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
    if (name === 'subscription_access_detected') maybeTrackSubscriptionStarted(merged);
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
    const { setOnce, set } = utmPersonPropertySets();
    if (Object.keys(setOnce).length || Object.keys(set).length) {
      posthog.identify(id, set, setOnce);
    } else {
      posthog.identify(id);
    }
  } catch (_e) {}
}

installLegacyAnalyticsBridge();

export { posthog, sanitizeProps, safeString };
