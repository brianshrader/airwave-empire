/**
 * Vite entry — Clerk (@clerk/clerk-js), UI bundle, SignIn / UserButton in MP lobby, then legacy.js.
 */
import './amFccRules.js';
import { Clerk } from '@clerk/clerk-js';

/** Public URL of the Node game server (Socket.io + /api). Set in .env for production builds. */
const gameServerUrl = import.meta.env?.VITE_GAME_SERVER_URL?.trim?.() ?? '';
if (gameServerUrl) {
  window.__WL_GAME_SERVER_URL = gameServerUrl;
}

const fromEnv = import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY?.trim?.() ?? '';
const fromMeta =
  document.querySelector('meta[name="wl-clerk-publishable-key"]')?.getAttribute('content')?.trim?.() ?? '';
const publishableKey = fromEnv || fromMeta;

function mountClerkLobbyComponents(clerk) {
  const host = document.getElementById('wl-clerk-components');
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
    clerk.mountSignIn(mountEl);
  }
}

if (!publishableKey) {
  console.warn(
    '[Clerk] Add VITE_CLERK_PUBLISHABLE_KEY to .env (or fill the meta tag) to enable multiplayer sign-in.',
  );
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
    await clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
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
  } catch (e) {
    console.error('[Clerk] Initialization failed:', e);
  }
}
