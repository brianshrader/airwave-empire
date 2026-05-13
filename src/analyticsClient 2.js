/**
 * Browser PostHog — launch funnel and product analytics.
 * Safe when disabled, missing key, DNT, or opt-out. No PII in events.
 */
import posthog from 'posthog-js';

let _inited = false;

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

export function initAnalyticsClient() {
  if (typeof window === 'undefined' || _inited) return;
  if (analyticsDisabled()) {
    window.__WL_ANALYTICS_DISABLED = true;
    return;
  }
  const key = import.meta.env?.VITE_POSTHOG_API_KEY?.trim?.() ?? '';
  const host = (import.meta.env?.VITE_POSTHOG_HOST?.trim?.() ?? 'https://us.i.posthog.com').replace(/\/$/, '');
  if (!key) {
    window.__WL_ANALYTICS_NO_KEY = true;
    return;
  }
  try {
    posthog.init(key, {
      api_host: host,
      persistence: 'localStorage+cookie',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
    });
    _inited = true;
    window.__WL_POSTHOG_READY = true;
    window.__WL_ANALYTICS_CAPTURE = captureEvent;
  } catch (_e) {
    window.__WL_ANALYTICS_INIT_ERR = true;
  }
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [props]
 */
export function captureEvent(event, props) {
  try {
    if (!_inited) return;
    const name = safeString(event, 64);
    if (!name) return;
    posthog.capture(name, sanitizeProps(props));
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

export { posthog, sanitizeProps, safeString };
