/**
 * Standalone Clerk sign-in for the signup free trial: marketing → sign-in → /play.html.
 */
import { Clerk } from '@clerk/clerk-js';
import {
  appendClerkUiScript,
  clearClerkFrontendOverrides,
  clerkConstructorOptionsFromEnv,
} from './clerkClientInit.js';
import { captureEvent, identifyClerkUser, initAnalyticsClient } from './analyticsClient.js';
import { initMetaPixel } from './metaPixelClient.js';

initAnalyticsClient();
initMetaPixel();

function wlDetectInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|musical_ly|BytedanceWebview|MicroMessenger|Snapchat/i.test(ua);
}

function wlInitInAppBrowserHint() {
  if (!wlDetectInAppBrowser() || sessionStorage.getItem('wl-hide-inapp-hint') === '1') return;
  const bar = document.getElementById('wl-inapp-browser-hint');
  if (!bar) return;
  bar.style.display = 'block';
  const close = document.getElementById('wl-inapp-browser-hint-close');
  if (close) {
    close.onclick = () => {
      bar.style.display = 'none';
      sessionStorage.setItem('wl-hide-inapp-hint', '1');
    };
  }
}
queueMicrotask(() => wlInitInAppBrowserHint());

function playAfterAuthUrl() {
  if (typeof window === 'undefined') return '/play.html';
  return `${window.location.origin.replace(/\/$/, '')}/play.html`;
}

const fromEnv = import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY?.trim?.() ?? '';
const fromMeta =
  document.querySelector('meta[name="wl-clerk-publishable-key"]')?.getAttribute('content')?.trim?.() ?? '';
const publishableKey = fromEnv || fromMeta;

function showMissingKey(message) {
  const el = document.getElementById('wl-play-signin-nokey');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML =
    message ||
    'Sign-in is unavailable: add <code>VITE_CLERK_PUBLISHABLE_KEY</code> at build time or set the <code>wl-clerk-publishable-key</code> meta tag.';
}

if (!publishableKey) {
  queueMicrotask(() =>
    showMissingKey(
      'Add your Clerk publishable key via <strong>VITE_CLERK_PUBLISHABLE_KEY</strong> (<code>.env</code>) or the <strong>wl-clerk-publishable-key</strong> meta tag.',
    ),
  );
} else {
  try {
    clearClerkFrontendOverrides();
    await appendClerkUiScript(publishableKey, 'Failed to load @clerk/ui bundle');

    const clerk = new Clerk(publishableKey, clerkConstructorOptionsFromEnv());
    const after = playAfterAuthUrl();
    await clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      signInFallbackRedirectUrl: after,
      signUpFallbackRedirectUrl: after,
      signInForceRedirectUrl: after,
      signUpForceRedirectUrl: after,
    });

    window.Clerk = clerk;

    try {
      captureEvent('signin_page_viewed', { source: 'play_signin' });
    } catch (_e) {}

    let metaEl = document.querySelector('meta[name="wl-clerk-publishable-key"]');
    if (!metaEl) {
      metaEl = document.createElement('meta');
      metaEl.setAttribute('name', 'wl-clerk-publishable-key');
      document.head.prepend(metaEl);
    }
    metaEl.setAttribute('content', publishableKey);

    const host = document.getElementById('wl-play-signin-clerk-mount');
    if (!host) throw new Error('Missing #wl-play-signin-clerk-mount');

    const goPlay = () => {
      window.location.replace(after);
    };

    if (clerk.isSignedIn) {
      try {
        const uid = clerk.user?.id;
        if (uid) identifyClerkUser(String(uid));
      } catch (_e) {}
      goPlay();
    } else {
      host.innerHTML = '';
      const mountEl = document.createElement('div');
      mountEl.style.cssText = 'width:100%;max-width:100%;';
      host.appendChild(mountEl);
      clerk.mountSignIn(mountEl, {
        forceRedirectUrl: after,
        fallbackRedirectUrl: after,
      });
      clerk.addListener(() => {
        if (clerk.isSignedIn) {
          try {
            const uid = clerk.user?.id;
            if (uid) identifyClerkUser(String(uid));
          } catch (_e) {}
          goPlay();
        }
      });
    }
  } catch (e) {
    console.error('[Clerk play-signin]', e);
    showMissingKey(String(e?.message || e));
  }
}
