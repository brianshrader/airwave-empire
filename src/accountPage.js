/**
 * /account.html — Clerk UserProfile (profile, security, subscription / billing when enabled).
 */
import { Clerk } from '@clerk/clerk-js';

const publishableKey = import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY?.trim?.() ?? '';

function accountReturnUrl() {
  if (typeof window === 'undefined') return '/account.html';
  return `${window.location.origin}/account.html`;
}

/** What we mount in #wl-account-clerk */
let __wlAccountMountKind = null;

function setSignOutButton(visible, clerk) {
  const btn = document.getElementById('wl-account-signout');
  if (!btn) return;
  if (!visible || !clerk) {
    btn.classList.add('hidden');
    btn.onclick = null;
    return;
  }
  btn.classList.remove('hidden');
  btn.onclick = () => {
    void clerk
      .signOut({ redirectUrl: accountReturnUrl() })
      .catch((err) => console.error('[Clerk] signOut:', err));
  };
}

function clearAccountHost(clerk, host) {
  if (!host || !clerk) return;
  if (__wlAccountMountKind === 'profile') {
    try {
      clerk.unmountUserProfile(host);
    } catch (_) {
      /* noop */
    }
  } else if (__wlAccountMountKind === 'signin') {
    try {
      clerk.unmountSignIn(host);
    } catch (_) {
      /* noop */
    }
  }
  __wlAccountMountKind = null;
  host.innerHTML = '';
}

function syncAccountView(clerk) {
  const host = document.getElementById('wl-account-clerk');
  const noKey = document.getElementById('wl-account-no-key');
  if (!host) return;
  if (!publishableKey) {
    if (noKey) {
      noKey.classList.remove('hidden');
    }
    setSignOutButton(false);
    return;
  }
  if (noKey) noKey.classList.add('hidden');
  setSignOutButton(!!clerk.isSignedIn, clerk);

  const want = clerk.isSignedIn ? 'profile' : 'signin';
  if (__wlAccountMountKind === want) return;

  clearAccountHost(clerk, host);
  const after = accountReturnUrl();
  const signProps = {
    forceRedirectUrl: after,
    fallbackRedirectUrl: after,
  };

  if (clerk.isSignedIn) {
    clerk.mountUserProfile(host, {
      routing: 'hash',
    });
    __wlAccountMountKind = 'profile';
  } else {
    clerk.mountSignIn(host, signProps);
    __wlAccountMountKind = 'signin';
  }
}

async function init() {
  if (!publishableKey) {
    const noKey = document.getElementById('wl-account-no-key');
    if (noKey) noKey.classList.remove('hidden');
    return;
  }

  try {
    const clerkDomain = atob(publishableKey.split('_')[2]).slice(0, -1);
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load @clerk/ui'));
      document.head.appendChild(script);
    });

    const after = accountReturnUrl();
    const clerk = new Clerk(publishableKey);
    await clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      signInForceRedirectUrl: after,
      signUpForceRedirectUrl: after,
      signInFallbackRedirectUrl: after,
      signUpFallbackRedirectUrl: after,
    });

    window.__wlClerkAccount = clerk;
    syncAccountView(clerk);
    clerk.addListener(() => syncAccountView(clerk));
  } catch (e) {
    console.error('[Clerk] account page:', e);
    const host = document.getElementById('wl-account-clerk');
    if (host) {
      host.innerHTML = `<p class="text-stone-400 text-sm">Could not load account UI. <a href="/play.html" class="text-amber-200 underline">Open Play</a> to sign in.</p>`;
    }
  }
}

init();
