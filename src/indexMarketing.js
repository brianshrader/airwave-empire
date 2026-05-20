/**
 * Home page — membership purchase after optional sign-in (same server routes as elsewhere).
 */
import { Clerk } from '@clerk/clerk-js';
import { BILLING_PRO_ANNUAL_LAUNCH_TAGLINE } from './billingPriceLabels.js';
import {
  appendClerkUiScript,
  clearClerkFrontendOverrides,
  clerkConstructorOptionsFromEnv,
} from './clerkClientInit.js';
import { effectiveStripePrices } from './stripePriceIds.js';
import { gameServerApiUrl } from './gameServerApiOrigin.js';
import { captureEvent, identifyClerkUser, initAnalyticsClient } from './analyticsClient.js';
import { initMetaPixel } from './metaPixelClient.js';
import { effectivePriceLabelForKey } from './billingPriceLabels.js';

const publishableKey = import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY?.trim?.() ?? '';

initAnalyticsClient();
initMetaPixel();

async function subscribeMarketingEmail(opts) {
  const o = opts || {};
  const email = String(o.email || '').trim();
  const source = String(o.source || 'home').trim() || 'home';
  const plan = String(o.plan || '').trim();
  const market = String(o.market || '').trim();
  const r = await fetch(gameServerApiUrl('/api/marketing/subscribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      SOURCE: source,
      PLAN: plan,
      MARKET: market,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j || !j.ok) {
    const e = new Error(String(j?.error || 'Subscribe failed'));
    e.status = r.status;
    throw e;
  }
  return true;
}

function bindHomeEmailSignup() {
  const form = document.getElementById('wl-home-email-form');
  if (!form || form.__wlBound) return;
  form.__wlBound = true;
  try {
    if (sessionStorage.getItem('wl_mk_sub_seen_homepage') !== '1') {
      sessionStorage.setItem('wl_mk_sub_seen_homepage', '1');
      captureEvent('marketing_subscribe_viewed', { source: 'homepage' });
    }
  } catch (_e) {}
  const emailEl = document.getElementById('wl-home-email');
  const statusEl = document.getElementById('wl-home-email-status');
  const setStatus = (msg, kind) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className =
      'mt-3 text-sm ' +
      (kind === 'ok' ? 'text-emerald-300' : kind === 'bad' ? 'text-rose-300' : 'text-stone-400');
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = String(emailEl?.value || '').trim();
    if (!email) {
      setStatus('Enter your email to sign up.', 'bad');
      return;
    }
    setStatus('Signing you up…');
    try {
      captureEvent('marketing_subscribe_submitted', { source: 'homepage' });
    } catch (_e) {}
    subscribeMarketingEmail({ email, source: 'home_pricing_follow', plan: '', market: '' })
      .then(() => {
        setStatus('Subscribed. Thanks!', 'ok');
        try {
          captureEvent('marketing_subscribe_success', { source: 'home_pricing_follow' });
        } catch (_e) {}
        if (emailEl) emailEl.value = '';
      })
      .catch((err) => {
        setStatus('Could not subscribe. Double-check the email and try again.', 'bad');
        try {
          captureEvent('marketing_subscribe_failed', {
            source: 'home_pricing_follow',
            error_type: err?.status >= 500 ? 'server_error' : 'denied',
          });
        } catch (_e) {}
      });
  });
}

const PRICE_LABEL_ENV = Object.freeze({
  starter_monthly: import.meta.env?.VITE_ACCOUNT_PRICE_STARTER_MONTHLY,
  starter_annual: import.meta.env?.VITE_ACCOUNT_PRICE_STARTER_ANNUAL,
  pro_monthly: import.meta.env?.VITE_ACCOUNT_PRICE_PRO_MONTHLY,
  pro_annual: import.meta.env?.VITE_ACCOUNT_PRICE_PRO_ANNUAL,
});

function planCadenceFromPriceKey(priceKey) {
  const k = String(priceKey || '');
  const plan = k.startsWith('pro') ? 'pro' : 'starter';
  const cadence = k.endsWith('annual') ? 'annual' : 'monthly';
  return { plan, cadence };
}

function trackLandingView() {
  try {
    const path = typeof location !== 'undefined' ? location.pathname + (location.search || '') : '/';
    let referrer = '';
    try {
      referrer = typeof document !== 'undefined' ? document.referrer || '' : '';
      if (referrer.length > 200) referrer = referrer.slice(0, 200);
    } catch (_e) {}
    captureEvent('landing_viewed', { path, referrer });
  } catch (_e) {}
}

/** Top-nav gold CTA: play free for guests, Play when signed in (returning players). */
function updateIndexNavPrimaryCta(clerk) {
  const el = document.getElementById('wl-nav-primary-cta');
  if (!el) return;
  const signedIn = !!(clerk?.isSignedIn || clerk?.user);
  if (signedIn) {
    el.setAttribute('href', '/play.html');
    el.textContent = 'Play now';
    el.setAttribute('data-wl-cta-label', 'play_now');
  } else {
    el.setAttribute('href', '/play-guest.html');
    el.textContent = 'Play free';
    el.setAttribute('data-wl-cta-label', 'play_free_now');
  }
}

function wireLandingCtas() {
  document.querySelectorAll('[data-wl-cta]').forEach((el) => {
    el.addEventListener('click', () => {
      try {
        const locationId = el.getAttribute('data-wl-cta-location') || 'unknown';
        const label = el.getAttribute('data-wl-cta-label') || el.textContent?.trim?.() || 'cta';
        let destination = el.getAttribute('href') || el.getAttribute('data-wl-cta-dest') || '';
        if (destination.length > 120) destination = destination.slice(0, 120);
        captureEvent('cta_clicked', { location: locationId, label: label.slice(0, 80), destination });
      } catch (_e) {}
    });
  });
}

function marketingReturnUrl() {
  if (typeof window === 'undefined') return '/#pricing';
  const { origin, pathname, search } = window.location;
  const p = pathname && pathname !== '' ? pathname : '/';
  return `${origin}${p}${search || ''}#pricing`;
}

function renderShell(mountEl) {
  mountEl.innerHTML = `
    <div class="flex flex-col gap-5 md:gap-6 min-w-0 max-w-full">
      <p class="text-center text-sm text-stone-500 leading-relaxed max-w-md mx-auto">
        Subscribe when you want more stations, cities, and saves.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6 items-stretch min-w-0">
        <section class="rounded-2xl border border-amber-800/28 bg-stone-950/40 p-5 md:p-6 flex flex-col shadow-md shadow-black/20 opacity-[0.92] md:scale-[0.98] md:origin-top hover:border-amber-800/40 transition-all min-w-0 max-w-full">
          <h3 class="text-xl font-black uppercase tracking-[0.14em] gold" style="color:#d89b2b">STARTER</h3>
          <div class="mt-3 rounded-xl border border-amber-700/30 bg-stone-900/55 px-4 py-3">
            <p class="text-[1.65rem] md:text-[1.85rem] font-black tracking-tight leading-none gold">
              $4.99<span class="text-base md:text-lg font-bold text-stone-400">/mo</span>
            </p>
            <p class="mt-2 text-[13px] text-stone-400 leading-snug">Annual <strong class="text-stone-300">$49.99/yr</strong> · Launch pricing</p>
          </div>
          <p class="mt-3 text-stone-500 text-sm leading-relaxed">Take control. Build your station.</p>
          <div class="mt-5 flex flex-col gap-2.5 flex-1 text-[0.875rem] leading-snug text-stone-400">
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> Play across five major markets</div>
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> Access more scenarios — full 1970 &amp; 1978 solo eras</div>
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> Run GM scenarios</div>
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> Build your on-air team</div>
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> Expanded creative tools</div>
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> More saves &amp; insights</div>
          </div>
          <div class="mt-6 flex flex-col gap-2">
            <button type="button" data-price="starter_monthly" class="gold-bg w-full rounded-lg px-3 py-3 font-black uppercase tracking-[0.1em] text-[11px] sm:text-xs hover:brightness-110 transition-all shadow-sm shadow-black/40 text-stone-900">
              <span class="block tracking-[0.06em]">EXPAND YOUR EMPIRE</span>
              <span class="mt-1 block text-[12px] font-bold normal-case tracking-normal opacity-95">Monthly · $4.99/mo</span>
            </button>
            <button type="button" data-price="starter_annual" class="w-full rounded-lg border border-amber-700/35 bg-transparent px-3 py-2.5 font-black uppercase tracking-[0.14em] text-xs text-amber-200/85 hover:bg-stone-900/60 transition-colors">
              <span class="block">ANNUAL</span>
              <span class="mt-1 block text-[11px] font-semibold text-amber-200/75 normal-case tracking-normal">$49.99/yr</span>
            </button>
          </div>
        </section>

        <section class="relative rounded-2xl border-2 border-violet-400/70 bg-gradient-to-b from-stone-950 via-stone-950 to-violet-950/35 p-6 md:p-7 flex flex-col shadow-[0_0_64px_rgba(139,92,246,0.48)] lg:z-10 ring-1 ring-violet-300/35 min-w-0 max-w-full">
          <span class="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-violet-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-white shadow-lg shadow-violet-900/50">
            ★ FULL EXPERIENCE
          </span>
          <h3 class="mt-4 text-2xl md:text-3xl font-black uppercase tracking-[0.12em] text-violet-50">PRO</h3>
          <div class="mt-3 rounded-xl border border-violet-500/35 bg-violet-950/35 px-4 py-3">
            <p class="text-[1.65rem] md:text-[1.85rem] font-black tracking-tight leading-none text-violet-50">
              $9.99<span class="text-base md:text-lg font-bold text-violet-300/80">/mo</span>
            </p>
            <p class="mt-2 text-[13px] text-violet-200/75 leading-snug">Annual <strong class="text-violet-100">$79.99/yr</strong> · Launch pricing</p>
          </div>
          <p class="mt-3 text-violet-200/80 text-sm leading-relaxed">Continue your station&rsquo;s story &mdash; no limits.</p>
          <div class="mt-5 flex flex-col gap-3 flex-1 text-[0.875rem] leading-snug text-stone-100/95">
            <div class="wl-check-index"><span class="mark text-violet-400">✓</span> All markets &mdash; including new expansions</div>
            <div class="wl-check-index"><span class="mark text-violet-400">✓</span> Exclusive 1985 Format Wars scenarios</div>
            <div class="wl-check-index"><span class="mark text-violet-400">✓</span> Full campaign mode</div>
            <div class="wl-check-index"><span class="mark text-violet-400">✓</span> Full creative control</div>
            <div class="wl-check-index"><span class="mark text-violet-400">✓</span> No ownership limits</div>
            <div class="wl-check-index"><span class="mark text-violet-400">✓</span> Unlimited cloud saves</div>
            <div class="wl-check-index"><span class="mark text-violet-400">✓</span> Advanced ratings insights</div>
            <div class="wl-check-index"><span class="mark text-violet-400">✓</span> Be first to play new features and updates</div>
          </div>
          <p class="mt-4 flex items-center justify-center gap-2 text-[11px] text-violet-300/85 text-center">
            <span aria-hidden="true">↻</span> Continue right where you left off
          </p>
          <div class="mt-4 flex flex-col gap-2.5">
            <button type="button" data-price="pro_monthly" class="w-full rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-3 py-3.5 font-black uppercase tracking-[0.06em] text-[11px] sm:text-xs transition-colors shadow-xl shadow-violet-950/50">
              <span class="block">UNLOCK THE FULL DIAL</span>
              <span class="mt-1 block text-[12px] font-bold normal-case tracking-normal text-violet-50 opacity-95">Monthly · $9.99/mo</span>
            </button>
            <button type="button" data-price="pro_annual" class="w-full rounded-lg border-2 border-violet-400/55 bg-violet-950/20 px-3 py-2.5 font-black uppercase tracking-[0.14em] text-xs text-violet-100 hover:bg-violet-950/45 transition-colors">
              <span class="block tracking-[0.12em]">ANNUAL · LAUNCH PRICING</span>
              <span class="mt-1 block text-[11px] font-semibold text-violet-200/95 normal-case tracking-normal">$79.99/yr</span>
              <span class="mt-1 block text-[10px] font-medium text-violet-300/85 normal-case tracking-normal leading-snug">${BILLING_PRO_ANNUAL_LAUNCH_TAGLINE}</span>
            </button>
          </div>
        </section>
      </div>
      <p class="text-center text-[11px] md:text-[12px] text-stone-500 leading-relaxed mt-6 max-w-xl mx-auto px-2">
        By subscribing, you agree to recurring billing and the
        <a href="/terms" class="text-amber-200/90 hover:text-amber-100 underline underline-offset-2">Terms of Service</a>.
      </p>
    </div>
  `;
}

/** Inline feedback under pricing (shell no longer includes a status row). */
function setPricingNotice(text) {
  const mount = document.getElementById('wl-index-pricing-clerk');
  if (!mount) return;
  let el = document.getElementById('wl-index-pricing-notice');
  if (!text) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('p');
    el.id = 'wl-index-pricing-notice';
    el.className = 'mt-5 text-center text-[13px] text-stone-500 leading-relaxed max-w-md mx-auto';
    mount.appendChild(el);
  }
  el.textContent = text;
}

async function startCheckout(clerk, priceKey) {
  const priceId = effectiveStripePrices()[priceKey];
  if (!priceId) return;
  if (!clerk?.session) {
    setPricingNotice('Open Account to sign in, then return here to subscribe.');
    return;
  }
  const token = await clerk.session.getToken().catch(() => null);
  if (!token) {
    setPricingNotice('Open Account to sign in, then return here to subscribe.');
    return;
  }
  const { plan, cadence } = planCadenceFromPriceKey(priceKey);
  const price_label = effectivePriceLabelForKey(priceKey, PRICE_LABEL_ENV[priceKey]) || '';
  try {
    captureEvent('checkout_started', {
      plan,
      cadence,
      selected_plan: plan,
      billing_cycle: cadence,
      price_label: price_label.slice(0, 48),
      source: 'landing',
    });
  } catch (_e) {}
  setPricingNotice('One moment…');
  const r = await fetch(gameServerApiUrl('/api/billing/create-checkout-session'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId }),
  }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok || !j.url) {
    try {
      captureEvent('checkout_failed', {
        plan,
        cadence,
        selected_plan: plan,
        billing_cycle: cadence,
        source: 'landing',
        error_type: !r ? 'network' : r.status >= 500 ? 'server_error' : 'checkout_denied',
      });
    } catch (_e) {}
    setPricingNotice(j.error || 'Something went wrong. Try Account from the footer.');
    return;
  }
  setPricingNotice('');
  window.location.assign(j.url);
}

async function init() {
  trackLandingView();
  queueMicrotask(() => wireLandingCtas());
  queueMicrotask(() => bindHomeEmailSignup());

  const mountEl = document.getElementById('wl-index-pricing-clerk');
  if (!mountEl) return;

  /** Pricing UI always renders; Clerk + Stripe checkout only when `VITE_CLERK_PUBLISHABLE_KEY` is set (local dev often omits it). */
  if (!publishableKey) {
    renderShell(mountEl);
    const hint = document.createElement('p');
    hint.className =
      'mt-4 text-center text-[13px] text-stone-500 leading-relaxed max-w-lg mx-auto px-2';
    hint.innerHTML = import.meta.env.DEV
      ? '<span class="text-stone-400">Local dev:</span> add <code class="text-amber-200/90 text-[12px]">VITE_CLERK_PUBLISHABLE_KEY</code> to <code class="text-amber-200/90 text-[12px]">.env.local</code> to test checkout from this page. Until then, plan buttons open <a href="/account#wl-account-plan-actions" class="text-amber-200/85 underline underline-offset-2 hover:text-amber-100">Account</a>.'
      : 'Checkout isn’t wired on this deployment. Open <a href="/account#wl-account-plan-actions" class="text-amber-200/85 underline underline-offset-2 hover:text-amber-100">Account</a> to sign in and subscribe.';
    mountEl.appendChild(hint);
    mountEl.querySelectorAll('button[data-price]').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          captureEvent('cta_clicked', {
            location: 'pricing_membership',
            label: 'plan_button_no_clerk_key',
            destination: 'account_fallback',
          });
        } catch (_e) {}
        window.location.assign('/account#wl-account-plan-actions');
      });
    });
    return;
  }

  try {
    renderShell(mountEl);
    clearClerkFrontendOverrides();
    await appendClerkUiScript(publishableKey, 'Failed to load @clerk/ui');

    const clerk = new Clerk(publishableKey, clerkConstructorOptionsFromEnv());
    const returnToPricing = marketingReturnUrl();
    await clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      signInForceRedirectUrl: returnToPricing,
      signUpForceRedirectUrl: returnToPricing,
      signInFallbackRedirectUrl: returnToPricing,
      signUpFallbackRedirectUrl: returnToPricing,
    });

    try {
      const uid = clerk.user?.id;
      if (uid) identifyClerkUser(String(uid));
    } catch (_e) {}

    updateIndexNavPrimaryCta(clerk);
    clerk.addListener(() => updateIndexNavPrimaryCta(clerk));

    mountEl.querySelectorAll('button[data-price]').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          const pk = btn.getAttribute('data-price') || '';
          captureEvent('cta_clicked', {
            location: 'pricing_membership',
            label: pk || 'plan_button',
            destination: 'stripe_checkout',
          });
        } catch (_e) {}
        startCheckout(clerk, btn.getAttribute('data-price'));
      });
    });
  } catch (e) {
    console.error('[indexMarketing] pricing:', e);
    mountEl.innerHTML =
      '<p class="text-stone-600 text-[13px] text-center leading-relaxed">Could not load memberships. Try <a href="/account" class="text-amber-200/85 underline underline-offset-2">Account</a> or <a href="/play.html" class="text-amber-200/85 underline underline-offset-2">Play</a>.</p>';
  }
}

init();
