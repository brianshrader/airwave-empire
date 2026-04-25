/**
 * Home page (index.html) — Clerk Billing pricing table for testing / production.
 * Requires VITE_CLERK_PUBLISHABLE_KEY (same dev or prod app as play.html).
 */
import { Clerk } from '@clerk/clerk-js';

const publishableKey = import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY?.trim?.() ?? '';

/** After successful paid checkout only — user continues in the game. */
function playAfterSubscribeUrl() {
  if (typeof window === 'undefined') return '/play.html';
  return `${window.location.origin}/play.html`;
}

/**
 * After sign-in / sign-up from the pricing table, stay on the home page so Clerk can
 * start Stripe checkout. If this points at play.html, users skip payment and load as free tier.
 */
function marketingReturnUrl() {
  if (typeof window === 'undefined') return '/#pricing';
  const { origin, pathname, search } = window.location;
  const p = pathname && pathname !== '' ? pathname : '/';
  return `${origin}${p}${search || ''}#pricing`;
}

async function init() {
  const mountEl = document.getElementById('wl-index-pricing-clerk');
  if (!mountEl) return;

  if (!publishableKey) {
    mountEl.innerHTML =
      '<p class="text-stone-400 text-sm leading-relaxed">Set <code class="text-amber-200/90">VITE_CLERK_PUBLISHABLE_KEY</code> in <code class="text-amber-200/90">.env.local</code> and restart Vite to show Starter / Pro plans from Clerk.</p>';
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

    const clerk = new Clerk(publishableKey);
    const returnToPricing = marketingReturnUrl();
    const afterPay = playAfterSubscribeUrl();
    await clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      signInForceRedirectUrl: returnToPricing,
      signUpForceRedirectUrl: returnToPricing,
      signInFallbackRedirectUrl: returnToPricing,
      signUpFallbackRedirectUrl: returnToPricing,
    });

    clerk.mountPricingTable(mountEl, {
      /** Fires after checkout completes and user continues — not after email/password sign-in. */
      newSubscriptionRedirectUrl: afterPay,
    });
  } catch (e) {
    console.error('[Clerk] index pricing table:', e);
    mountEl.innerHTML = `<p class="text-stone-400 text-sm leading-relaxed">Could not load subscription plans. Try <a href="/play.html" class="text-amber-200 underline">Play</a> to sign in, or check the browser console.</p>`;
  }
}

init();
