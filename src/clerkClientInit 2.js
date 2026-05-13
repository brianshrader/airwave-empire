/**
 * Shared Clerk bootstrap: drop deployment-time proxy/domain globals so the SDK uses
 * the Frontend API host embedded in the publishable key (Clerk default), unless
 * VITE_CLERK_PROXY_URL is explicitly set after verifying the proxy in Clerk.
 */

function trimOrEmpty(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function clearClerkFrontendOverrides() {
  if (typeof window === 'undefined') return;
  try {
    delete window.__clerk_proxy_url;
    delete window.__clerk_domain;
  } catch (_e) {}
}

/**
 * Second argument to `new Clerk(publishableKey, options)`.
 * Leave VITE_CLERK_PROXY_URL unset at launch; only set when the proxy is verified in Clerk Dashboard.
 */
export function clerkConstructorOptionsFromEnv() {
  const proxyUrl = trimOrEmpty(import.meta.env?.VITE_CLERK_PROXY_URL);
  return proxyUrl ? { proxyUrl } : {};
}

export function clerkUiScriptOriginFromPublishableKey(publishableKey) {
  const pk = trimOrEmpty(publishableKey);
  if (!pk) return '';
  try {
    const parts = pk.split('_');
    if (parts.length < 3) return '';
    const raw = atob(parts[2]);
    return raw.endsWith('$') ? raw.slice(0, -1) : raw;
  } catch (_e) {
    return '';
  }
}

/** Load @clerk/ui from the same host as Clerk’s Frontend API for this key. */
export function appendClerkUiScript(publishableKey, onErrorMessage = 'Failed to load @clerk/ui') {
  const host = clerkUiScriptOriginFromPublishableKey(publishableKey);
  if (!host) {
    return Promise.reject(new Error('Invalid or missing Clerk publishable key'));
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://${host}/npm/@clerk/ui@1/dist/ui.browser.js`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = () => reject(new Error(onErrorMessage));
    document.head.appendChild(script);
  });
}
