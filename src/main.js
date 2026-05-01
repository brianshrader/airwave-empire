/**
 * Vite entry — Clerk (@clerk/clerk-js), UI bundle, SignIn / UserButton in MP lobby, optional beta solo gate, then legacy.js.
 */
import './amFccRules.js';
import { Clerk } from '@clerk/clerk-js';
import {
  appendClerkUiScript,
  clearClerkFrontendOverrides,
  clerkConstructorOptionsFromEnv,
} from './clerkClientInit.js';
import { marketIdsForClerkPlanSlug, syncPlanMarkets } from './billingEntitlements.js';
import { BILLING_PRICE_SUMMARY_LINE } from './billingPriceLabels.js';

if (typeof window !== 'undefined') {
  window.__WL_BILLING_PRICE_SUMMARY_LINE = BILLING_PRICE_SUMMARY_LINE;
}

/** Public URL of the Node game server (Socket.io + /api). Vite: .env VITE_GAME_SERVER_URL; or meta on play.html. */
let gameServerUrl = import.meta.env?.VITE_GAME_SERVER_URL?.trim?.() ?? '';
if (!gameServerUrl && typeof document !== 'undefined') {
  gameServerUrl =
    document.querySelector('meta[name="wl-game-server-url"]')?.getAttribute('content')?.trim?.() ?? '';
}
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

/**
 * Solo gate: `<meta name="wl-require-clerk" content="1">` requires sign-in.
 * `content="0"` turns the gate off — including over `VITE_REQUIRE_CLERK=true` in `.env.local`, so Vite dev
 * (which injects 0 via vite.config.js) works without deleting env vars.
 * If meta is absent or not 0/1, `VITE_REQUIRE_CLERK` can still require sign-in (alternate HTML).
 * We do not honor `VITE_REQUIRE_CLERK=false` when meta=1 (production safety).
 */
const wlRequireRaw =
  document.querySelector('meta[name="wl-require-clerk"]')?.getAttribute('content')?.trim?.() ?? '';
const clerkRequireEnv =
  import.meta.env?.VITE_REQUIRE_CLERK === 'true' || import.meta.env?.VITE_REQUIRE_CLERK === '1';
const requireClerk =
  wlRequireRaw === '0'
    ? false
    : wlRequireRaw === '1'
      ? true
      : clerkRequireEnv;
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
      'Beta mode requires a Clerk publishable key. Set <code style="color:var(--amb)">VITE_CLERK_PUBLISHABLE_KEY</code> in <code>.env</code> or the <code>wl-clerk-publishable-key</code> meta tag, then rebuild.<br><br>' +
      '<span style="color:var(--mut);font-size:14px">If this persists with <code>npm run client:dev</code>, hard-refresh the page (cached HTML may lack Vite’s <code>wl-require-clerk=0</code> injection).</span>';
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
  let termsEl = null;
  if (host.id === 'wl-solo-clerk-mount') termsEl = document.getElementById('wl-solo-auth-terms');
  else if (host.id === 'wl-clerk-components') termsEl = document.getElementById('wl-mp-auth-terms');
  if (termsEl) termsEl.style.display = clerk.isSignedIn ? 'none' : '';
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

/** Avoid remounting Clerk widgets on every `addListener` tick — remount restarts email OTP / Turnstile. */
let __wlClerkLobbyMountKind = null;

function mountClerkLobbyComponents(clerk) {
  const host = document.getElementById('wl-clerk-components');
  if (!host) return;
  if (!shouldMountClerkLobby(clerk)) {
    clearClerkHost(clerk, host);
    // When `requireClerk` is on, we avoid mounting the full SignIn widget here (duplicate Turnstile vs #wl-solo-clerk-mount).
    // After sign-out from the UserButton, the solo gate also shows SignIn — but the MP overlay can still look "empty."
    // Offer a single redirect so the lobby is never a blank box.
    if (requireClerk && clerk && !clerk.isSignedIn) {
      const after = playAfterAuthUrl();
      const go = () => {
        try {
          const u = clerk.buildSignInUrl?.({
            forceRedirectUrl: after,
            fallbackRedirectUrl: after,
          });
          if (u) window.location.assign(u);
        } catch (e) {
          console.warn('[Clerk] buildSignInUrl failed:', e);
        }
      };
      host.innerHTML = `<button type="button" class="abt" id="wl-mp-clerk-fallback-signin" style="padding:10px 16px;letter-spacing:1px">Sign in</button>`;
      const btn = host.querySelector('#wl-mp-clerk-fallback-signin');
      if (btn) btn.addEventListener('click', go, { once: true });
    }
    __wlClerkLobbyMountKind = 'fallback';
    return;
  }
  const wantKind = clerk.isSignedIn ? 'user' : 'signin';
  if (host.__wlClerkMountEl && __wlClerkLobbyMountKind === wantKind) return;
  __wlClerkLobbyMountKind = wantKind;
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
      if (solo) clearClerkHost(clerk, solo);
      return;
    }
    if (gate) {
      gate.style.display = 'flex';
      gate.setAttribute('aria-hidden', 'false');
    }
    // Clerk fires this listener often during "check your email" / OTP; remounting SignIn resends codes.
    if (solo && solo.__wlClerkMountEl) return;
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
  // `legacy.js` (deferred) can run while this module is still awaiting Clerk. Without a preset,
  // `wlGetAllowedPhase1MarketIds` treats "Clerk not loaded" as "unlock every market" and the
  // scenario screen briefly shows the wrong lock state. Seed conservative defaults until
  // `syncPlanMarkets` replaces them with the real plan.
  if (typeof window !== 'undefined') {
    window.__WL_PLAN_MARKET_IDS = marketIdsForClerkPlanSlug('free_user');
  }
  try {
    clearClerkFrontendOverrides();
    await appendClerkUiScript(publishableKey, 'Failed to load @clerk/ui bundle');

    const clerk = new Clerk(publishableKey, clerkConstructorOptionsFromEnv());
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

    try {
      await syncPlanMarkets(clerk);
    } catch (e) {
      console.warn('[entitlements] initial sync failed:', e?.message || e);
      window.__WL_CLERK_PLAN_SLUG = 'free_user';
      window.__WL_PLAN_MARKET_IDS = marketIdsForClerkPlanSlug('free_user');
    }
    if (typeof window.wlRefreshOpenScenIfPlanChanged === 'function') {
      window.wlRefreshOpenScenIfPlanChanged();
    }

    window.__wlSyncPlanMarkets = () => syncPlanMarkets(clerk);

    let __wlPlanSyncTimer = null;
    const schedulePlanSync = () => {
      clearTimeout(__wlPlanSyncTimer);
      __wlPlanSyncTimer = setTimeout(() => {
        syncPlanMarkets(clerk)
          .then(() => {
            if (typeof window.wlRefreshOpenScenIfPlanChanged === 'function') {
              window.wlRefreshOpenScenIfPlanChanged();
            }
          })
          .catch((err) => console.warn('[entitlements] sync failed:', err?.message || err));
      }, 250);
    };

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
      schedulePlanSync();
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
