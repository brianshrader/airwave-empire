/**
 * Shared playtest host allowlist — single source of truth for client-only URL flags.
 * Imported by playtestUrlFlags.js (Vite) and playtestUrlEnvironmentShim.js (play shell, before legacy.js).
 *
 * Not billing enforcement; see playtestUrlFlags.js.
 */

/** Amplify staging frontend — keep in sync with scripts/deploy-config.sh (DEPLOY_AMPLIFY_APP_ID + branch). */
export const AMPLIFY_STAGING_HOSTS = Object.freeze(['staging.d11e4bu75ja2xt.amplifyapp.com']);

export function truthyQueryValue(v) {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function normalizeHostname(hostname) {
  return String(hostname ?? '')
    .trim()
    .toLowerCase();
}

/**
 * @param {string} [hostname]
 * @param {{ viteDev?: boolean }} [options]
 */
export function isPlaytestUrlEnvironment(hostname, options) {
  try {
    if (options?.viteDev) return true;
    if (typeof window === 'undefined') return false;
    const h = normalizeHostname(hostname ?? window.location?.hostname ?? '');
    if (h === 'localhost' || h === '127.0.0.1') return true;
    if (AMPLIFY_STAGING_HOSTS.includes(h)) return true;
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * @param {string} paramName
 * @param {string} [search]
 * @param {string} [hostname]
 * @param {{ viteDev?: boolean }} [options]
 */
export function isPlaytestQueryFlagEnabled(paramName, search, hostname, options) {
  if (!isPlaytestUrlEnvironment(hostname, options)) return false;
  let raw = search;
  if (raw == null && typeof location !== 'undefined') raw = location.search;
  return truthyQueryValue(new URLSearchParams(raw || '').get(paramName));
}
