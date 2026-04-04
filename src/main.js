/**
 * Vite entry — Clerk (@clerk/clerk-js), UI bundle, SignIn / UserButton in MP lobby, optional beta solo gate, then legacy.js.
 */
import './amFccRules.js';
import { Clerk } from '@clerk/clerk-js';

/** Public URL of the Node game server (Socket.io + /api). Set in .env for production builds. */
const gameServerUrl = import.meta.env?.VITE_GAME_SERVER_URL?.trim?.() ?? '';
if (gameServerUrl) {
  window.__WL_GAME_SERVER_URL = gameServerUrl;
}

/**
 * FormSubmit destination email — browser POSTs directly to formsubmit.co/ajax/… so Cloudflare does not
 * block datacenter/VPS IPs (server-side forwarding often gets HTTP 403 “Just a moment…”).
 * Match FEEDBACK_TO. Optional meta: wl-feedback-formsubmit-email on play.html.
 */
const feedbackFormsubmit =
  import.meta.env?.VITE_FEEDBACK_FORMSUBMIT_EMAIL?.trim?.() ??
  document.querySelector('meta[name="wl-feedback-formsubmit-email"]')?.getAttribute('content')?.trim?.() ??
  '';
if (feedbackFormsubmit) {
  window.__WL_FEEDBACK_FORMSUBMIT_EMAIL = feedbackFormsubmit;
}

/** Google OAuth rejects embedded WebViews (Instagram, TikTok, FB in-app, etc.) — “secure browsers” policy. */
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

const fromEnv = import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY?.trim?.() ?? '';
const fromMeta =
  document.querySelector('meta[name="wl-clerk-publishable-key"]')?.getAttribute('content')?.trim?.() ?? '';
const publishableKey = fromEnv || fromMeta;

/** When true, solo play waits for Clerk sign-in (beta testers). Set VITE_REQUIRE_CLERK=true or meta wl-require-clerk=1 */
const requireClerk =
  import.meta.env?.VITE_REQUIRE_CLERK === 'true' ||
  import.meta.env?.VITE_REQUIRE_CLERK === '1' ||
  document.querySelector('meta[name="wl-require-clerk"]')?.getAttribute('content') === '1';
window.__WL_REQUIRE_CLERK = !!requireClerk;

/** Clerk defaults sign-in fallback to `/` (marketing). Force completed OAuth/email sign-in to the game shell. */
function playAfterAuthUrl() {
  if (typeof window === 'undefined') return '/play.html';
  return `${window.location.origin}/play.html`;
}

function signInMountProps() {
  const url = playAfterAuthUrl();
  return { forceRedirectUrl: url, fallbackRedirectUrl: url };
}

function emitBetaAuthOk() {
  if (window.__wlBetaAuthDone) return;
  window.__wlBetaAuthDone = true;
  window.__wlBetaAuthUnlocked = true;
  window.dispatchEvent(new CustomEvent('wl-beta-auth-ok'));
}

if (!requireClerk) {
  window.__wlBetaAuthUnlocked = true;
  queueMicrotask(() => emitBetaAuthOk());
}

function showMissingClerkKeyGate() {
  const gate = document.getElementById('wl-beta-auth-gate');
  const msg = document.getElementById('wl-beta-auth-msg');
  const title = document.getElementById('wl-beta-auth-title');
  if (title) title.textContent = 'CLERK NOT CONFIGURED';
  if (msg) {
    msg.innerHTML =
      'Beta mode requires a Clerk publishable key. Set <code style="color:var(--amb)">VITE_CLERK_PUBLISHABLE_KEY</code> in <code>.env</code> or the <code>wl-clerk-publishable-key</code> meta tag, then rebuild.';
  }
  if (gate) {
    gate.style.display = 'flex';
    gate.setAttribute('aria-hidden', 'false');
  }
}

function mountClerkInHost(clerk, host) {
  if (!host || !clerk) return;
  const prev = host.__wlClerkMountEl;
  if (prev) {
    try {
      clerk.unmountSignIn(prev);
    } catch (_) {
      /* noop */
    }
    try {
      clerk.unmountUserButton(prev);
    } catch (_) {
      /* noop */
    }
    host.__wlClerkMountEl = null;
  }
  host.innerHTML = '';
  const mountEl = document.createElement('div');
  mountEl.style.cssText = 'width:100%;max-width:100%;';
  host.appendChild(mountEl);
  host.__wlClerkMountEl = mountEl;
  if (clerk.isSignedIn) {
    clerk.mountUserButton(mountEl);
  } else {
    clerk.mountSignIn(mountEl, signInMountProps());
  }
}

/** Clear Clerk widgets from a host (e.g. when skipping duplicate mounts). */
function clearClerkHost(clerk, host) {
  if (!host || !clerk) return;
  const prev = host.__wlClerkMountEl;
  if (prev) {
    try {
      clerk.unmountSignIn(prev);
    } catch (_) {
      /* noop */
    }
    try {
      clerk.unmountUserButton(prev);
    } catch (_) {
      /* noop */
    }
    host.__wlClerkMountEl = null;
  }
  host.innerHTML = '';
}

/**
 * When beta requires Clerk (`requireClerk`), the solo gate mounts SignIn in #wl-solo-clerk-mount.
 * Do not also mount SignIn in the MP lobby until signed in — two mounts load Cloudflare Turnstile twice
 * and trigger duplicate-widget warnings / flaky Google OAuth.
 */
function shouldMountClerkLobby(clerk) {
  if (!requireClerk) return true;
  return !!clerk?.isSignedIn;
}

function mountClerkLobbyComponents(clerk) {
  const host = document.getElementById('wl-clerk-components');
  if (!host) return;
  if (!shouldMountClerkLobby(clerk)) {
    clearClerkHost(clerk, host);
    return;
  }
  mountClerkInHost(clerk, host);
}

function setupBetaSoloGate(clerk) {
  const gate = document.getElementById('wl-beta-auth-gate');
  const solo = document.getElementById('wl-solo-clerk-mount');
  const sync = () => {
    if (clerk.isSignedIn) {
      if (gate) {
        gate.style.display = 'none';
        gate.setAttribute('aria-hidden', 'true');
      }
      emitBetaAuthOk();
      return;
    }
    if (gate) {
      gate.style.display = 'flex';
      gate.setAttribute('aria-hidden', 'false');
    }
    mountClerkInHost(clerk, solo);
  };
  sync();
  clerk.addListener(sync);
}

if (!publishableKey) {
  console.warn(
    '[Clerk] Add VITE_CLERK_PUBLISHABLE_KEY to .env (or fill the meta tag) to enable multiplayer sign-in.',
  );
  if (requireClerk) {
    queueMicrotask(() => showMissingClerkKeyGate());
  }
} else {
  try {
    const clerkDomain = atob(publishableKey.split('_')[2]).slice(0, -1);

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load @clerk/ui bundle'));
      document.head.appendChild(script);
    });

    const clerk = new Clerk(publishableKey);
    const afterAuth = playAfterAuthUrl();
    await clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      signInFallbackRedirectUrl: afterAuth,
      signUpFallbackRedirectUrl: afterAuth,
      signInForceRedirectUrl: afterAuth,
      signUpForceRedirectUrl: afterAuth,
    });

    window.Clerk = clerk;
    window.__wlClerkLoaded = true;

    let meta = document.querySelector('meta[name="wl-clerk-publishable-key"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'wl-clerk-publishable-key');
      document.head.prepend(meta);
    }
    meta.setAttribute('content', publishableKey);

    /** Remount SignIn vs UserButton when session changes (e.g. after sign-in). */
    window.wlRemountClerkLobby = () => mountClerkLobbyComponents(clerk);
    clerk.addListener(() => {
      mountClerkLobbyComponents(clerk);
    });
    mountClerkLobbyComponents(clerk);

    if (requireClerk) {
      setupBetaSoloGate(clerk);
    }
  } catch (e) {
    console.error('[Clerk] Initialization failed:', e);
    if (requireClerk) {
      queueMicrotask(() => {
        const msg = document.getElementById('wl-beta-auth-msg');
        if (msg) msg.textContent = String(e.message || e);
        showMissingClerkKeyGate();
      });
    }
  }
}
