/**
 * Lightweight Meta/Facebook Pixel integration.
 * - Only initializes when `VITE_META_PIXEL_ID` is set at build time.
 * - Safe/no-op when blocked by ad blockers or script errors.
 * - Centralized: call `initMetaPixel()` once per page, then `trackMetaFromAppEvent()`.
 */
 
const META_PIXEL_ID = (import.meta.env?.VITE_META_PIXEL_ID?.trim?.() ?? '').trim();
const ANALYTICS_DEBUG = (import.meta.env?.VITE_ANALYTICS_DEBUG?.trim?.() ?? '') === '1';
 
function safeStr(v, max = 96) {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}
 
function safeProps(props) {
  const p = props && typeof props === 'object' ? props : {};
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else out[k] = safeStr(v, 96);
  }
  return out;
}
 
function debugLog(name, props) {
  if (!ANALYTICS_DEBUG) return;
  try {
    // eslint-disable-next-line no-console
    console.log('[MetaPixel]', name, props || {});
  } catch (_e) {}
}
 
function fbqSafe(...args) {
  try {
    const fbq = typeof window !== 'undefined' ? window.fbq : null;
    if (typeof fbq === 'function') fbq(...args);
  } catch (_e) {}
}
 
export function initMetaPixel() {
  if (typeof window === 'undefined') return;
  if (!META_PIXEL_ID) return;
  if (window.__WL_META_PIXEL_INIT === true) return;
  window.__WL_META_PIXEL_INIT = true;
 
  try {
    // Standard Meta Pixel bootstrap (minimized, but faithful).
    // If an ad blocker strips the script, `fbq` remains a queue and we no-op safely.
    // eslint-disable-next-line no-unused-vars
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = function () {
        // eslint-disable-next-line prefer-rest-params
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
 
    fbqSafe('init', META_PIXEL_ID);
 
    // Avoid double PageView: only track on first init.
    fbqSafe('track', 'PageView');
    debugLog('PageView', { pixel_id: META_PIXEL_ID });
  } catch (_e) {
    // If script fails, keep the flag so we don't thrash.
  }
}
 
function metaEventPropsFromAppProps(appProps) {
  const p = safeProps(appProps);
  return {
    source: safeStr(p.source || p.reason || '', 64) || undefined,
    plan: safeStr(p.plan || '', 32) || undefined,
    scenario: safeStr(p.scenario || p.scenario_id || '', 64) || undefined,
    market: safeStr(p.market || '', 64) || undefined,
    selected_plan: safeStr(p.selected_plan || p.plan || '', 32) || undefined,
    billing_cycle: safeStr(p.billing_cycle || p.cadence || '', 16) || undefined,
  };
}
 
/**
 * Bridge from existing app analytics events → Meta Pixel custom events.
 * @param {string} eventName - existing PostHog/app event name
 * @param {Record<string, unknown>} [props] - merged analytics props
 */
export function trackMetaFromAppEvent(eventName, props) {
  if (typeof window === 'undefined') return;
  if (!META_PIXEL_ID) return;
  // Ensure init is attempted at least once before firing custom events.
  initMetaPixel();
 
  const name = safeStr(eventName, 64);
  if (!name) return;
 
  let metaName = '';
  switch (name) {
    case 'tutorial_started':
      metaName = 'TutorialStarted';
      break;
    case 'tutorial_first_payoff_seen':
      metaName = 'TutorialPayoff';
      break;
    case 'tutorial_completed':
      metaName = 'TutorialCompleted';
      break;
    case 'paywall_viewed':
      metaName = 'PaywallViewed';
      break;
    case 'checkout_started':
      metaName = 'CheckoutStarted';
      break;
    case 'subscription_access_detected':
      metaName = 'SubscribeSuccess';
      break;
    default:
      metaName = '';
  }
  if (!metaName) return;
 
  const mp = metaEventPropsFromAppProps(props);
  try {
    fbqSafe('trackCustom', metaName, mp);
    debugLog(metaName, mp);
  } catch (_e) {}
}
 
