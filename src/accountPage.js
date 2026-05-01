/**
 * /account.html — Stripe subscription summary + Stripe portal/checkout; Clerk profile & security.
 */
import { Clerk } from '@clerk/clerk-js';
import {
  appendClerkUiScript,
  clearClerkFrontendOverrides,
  clerkConstructorOptionsFromEnv,
} from './clerkClientInit.js';
import { effectivePriceLabelForKey } from './billingPriceLabels.js';
import { billingCadenceFromStripePriceId, effectiveStripePrices } from './stripePriceIds.js';
import { gameServerApiUrl as apiUrl } from './gameServerApiOrigin.js';

const publishableKey = import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY?.trim?.() ?? '';

function planDisplayName(slug) {
  const s = String(slug || '').trim();
  if (s === 'starter') return 'Starter';
  if (s === 'pro') return 'Pro';
  if (s === 'trial_user') return 'Signup trial';
  if (s === 'free_user') return 'Free';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Free';
}

function formatSubscriptionStatus(status) {
  const s = String(status || '').trim();
  if (!s || s === 'none') return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const PRICE_LABEL_ENV = Object.freeze({
  starter_monthly: import.meta.env?.VITE_ACCOUNT_PRICE_STARTER_MONTHLY,
  starter_annual: import.meta.env?.VITE_ACCOUNT_PRICE_STARTER_ANNUAL,
  pro_monthly: import.meta.env?.VITE_ACCOUNT_PRICE_PRO_MONTHLY,
  pro_annual: import.meta.env?.VITE_ACCOUNT_PRICE_PRO_ANNUAL,
});

function applyPlanPriceLabels() {
  document.querySelectorAll('[data-wl-price-label]').forEach((el) => {
    const k = el.getAttribute('data-wl-price-label');
    const raw = k ? effectivePriceLabelForKey(k, PRICE_LABEL_ENV[k]) : '';
    el.textContent = raw;
    if (raw) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });
}

async function startCheckoutForPriceKey(clerk, priceKey) {
  const priceIdToUse = effectiveStripePrices()[priceKey];
  if (!priceIdToUse || !clerk?.isSignedIn) return;
  try {
    setBillingError('');
    const t = await clerk.session?.getToken?.();
    if (!t) return;
    const cr = await fetch(apiUrl('/api/billing/create-checkout-session'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: priceIdToUse }),
    });
    const cj = await cr.json().catch(() => ({}));
    if (!cr.ok || !cj.url) {
      setBillingError(cj.error || cr.statusText || 'Could not start checkout.');
      return;
    }
    window.location.assign(cj.url);
  } catch (e) {
    setBillingError(String(e.message || e || 'Checkout error'));
  }
}

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

function setBillingError(msg) {
  const el = document.getElementById('wl-account-billing-err');
  if (!el) return;
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function refreshStripeBillingPanel(clerk) {
  const subEl = document.getElementById('wl-account-billing-sub');
  const portalBtn = document.getElementById('wl-account-portal');
  const actions = document.getElementById('wl-account-plan-actions');

  if (!subEl || !portalBtn || !actions) return;

  /** Plan cards stay visible; only billing status / portal depend on API. */
  actions.classList.remove('hidden');

  if (!clerk?.isSignedIn) {
    subEl.textContent = 'Sign in below to see your current plan and choose a subscription.';
    portalBtn.classList.add('hidden');
    portalBtn.onclick = null;
    setBillingError('');
    return;
  }

  try {
    const token = await clerk.session?.getToken?.();
    if (!token) {
      subEl.textContent = 'Could not read your session token. Try signing out and back in.';
      portalBtn.classList.add('hidden');
      return;
    }

    const r = await fetch(apiUrl('/api/entitlements'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      subEl.textContent = j.error || 'Could not load subscription status. Plans below — retry or open Manage in Stripe if you already subscribe.';
      portalBtn.classList.add('hidden');
      return;
    }

    if (j.signedIn === false) {
      subEl.textContent =
        'We could not verify your sign-in for billing. Open this page from the same website as the game, or sign out and sign back in. You can still pick a plan below once your session syncs.';
      portalBtn.classList.add('hidden');
      return;
    }

    const plan = String(j.plan || 'free_user');
    const b = j.billing || {};
    const status = b.subscriptionStatus ? String(b.subscriptionStatus) : '';
    const active =
      !!b.subscriptionActive || status === 'active' || status === 'trialing';
    const priceId = b.subscriptionPriceId ? String(b.subscriptionPriceId) : '';
    const cadence = billingCadenceFromStripePriceId(priceId);
    const ends = b.subscriptionCurrentPeriodEnd ? String(b.subscriptionCurrentPeriodEnd) : '';
    const cancelEnd = b.subscriptionCancelAtPeriodEnd === true;
    const paid = plan === 'starter' || plan === 'pro';
    const label = planDisplayName(plan);
    const statusDisp = formatSubscriptionStatus(status);

    let line = '';
    if (plan === 'free_user') {
      line = `Current plan: ${label}`;
      if (statusDisp) line += ` · ${statusDisp}`;
    } else if (!active && paid) {
      line = `Current plan: ${label} — billing sync pending; refresh or open Manage in Stripe.`;
      if (statusDisp) line += ` · ${statusDisp}`;
      if (cadence) line += ` · ${cadence}`;
    } else if (!active) {
      line = `Current plan: ${label}`;
      if (statusDisp) line += ` · ${statusDisp}`;
    } else {
      const bits = [];
      if (cadence) bits.push(cadence);
      if (statusDisp) bits.push(statusDisp);
      line = `Current plan: ${label}`;
      if (bits.length) line += ` · ${bits.join(' · ')}`;
      if (ends) {
        const d = new Date(ends);
        if (!Number.isNaN(d.getTime())) line += ` · Renews ${d.toLocaleString()}`;
      }
      if (cancelEnd) line += ' · Ends at period end';
    }
    subEl.textContent = line;

    portalBtn.classList.remove('hidden');
    portalBtn.onclick = async () => {
      try {
        const t = await clerk.session?.getToken?.();
        if (!t) return;
        const pr = await fetch(apiUrl('/api/billing/create-portal-session'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const pj = await pr.json().catch(() => ({}));
        if (!pr.ok || !pj.url) {
          setBillingError(pj.error || pr.statusText || 'Could not open Stripe portal.');
          return;
        }
        setBillingError('');
        window.location.assign(pj.url);
      } catch (e) {
        setBillingError(String(e.message || e || 'Portal error'));
      }
    };
  } catch (e) {
    subEl.textContent = String(e.message || e || 'Could not load billing info. Plans below remain available.');
    portalBtn.classList.add('hidden');
  }
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
    void refreshStripeBillingPanel(null);
    return;
  }
  if (noKey) noKey.classList.add('hidden');
  setSignOutButton(!!clerk.isSignedIn, clerk);

  const createTerms = document.getElementById('wl-account-create-terms');
  if (createTerms) {
    if (clerk.isSignedIn) createTerms.classList.add('hidden');
    else createTerms.classList.remove('hidden');
  }

  const want = clerk.isSignedIn ? 'profile' : 'signin';
  if (__wlAccountMountKind === want) {
    void refreshStripeBillingPanel(clerk);
    return;
  }

  void refreshStripeBillingPanel(clerk);

  clearAccountHost(clerk, host);
  const after = accountReturnUrl();
  const signProps = {
    forceRedirectUrl: after,
    fallbackRedirectUrl: after,
  };

  if (clerk.isSignedIn) {
    clerk.mountUserProfile(host, {
      routing: 'hash',
      appearance: {
        elements: {
          // Clerk Billing tab (legacy Clerk products). Hide — Stripe is source of truth now.
          navbarButton__billing: { display: 'none' },
        },
      },
    });
    __wlAccountMountKind = 'profile';
  } else {
    clerk.mountSignIn(host, signProps);
    __wlAccountMountKind = 'signin';
  }
}

async function init() {
  applyPlanPriceLabels();

  const planActions = document.getElementById('wl-account-plan-actions');
  if (planActions) {
    planActions.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('button[data-wl-price]');
      if (!btn) return;
      const key = btn.getAttribute('data-wl-price');
      const clerk = window.__wlClerkAccount;
      if (!key || !clerk?.isSignedIn) return;
      e.preventDefault();
      void startCheckoutForPriceKey(clerk, key);
    });
  }

  if (!publishableKey) {
    const noKey = document.getElementById('wl-account-no-key');
    if (noKey) noKey.classList.remove('hidden');
    return;
  }

  try {
    clearClerkFrontendOverrides();
    await appendClerkUiScript(publishableKey, 'Failed to load @clerk/ui');

    const after = accountReturnUrl();
    const clerk = new Clerk(publishableKey, clerkConstructorOptionsFromEnv());
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
