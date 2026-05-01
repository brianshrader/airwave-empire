/**
 * Home page — membership purchase after optional sign-in (same server routes as elsewhere).
 */
import { Clerk } from '@clerk/clerk-js';
import {
  appendClerkUiScript,
  clearClerkFrontendOverrides,
  clerkConstructorOptionsFromEnv,
} from './clerkClientInit.js';
import { effectiveStripePrices } from './stripePriceIds.js';
import { gameServerApiUrl } from './gameServerApiOrigin.js';

const publishableKey = import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY?.trim?.() ?? '';

function marketingReturnUrl() {
  if (typeof window === 'undefined') return '/#pricing';
  const { origin, pathname, search } = window.location;
  const p = pathname && pathname !== '' ? pathname : '/';
  return `${origin}${p}${search || ''}#pricing`;
}

function renderShell(mountEl) {
  mountEl.innerHTML = `
    <div class="flex flex-col gap-5 md:gap-6">
      <p class="text-center text-sm text-stone-500 leading-relaxed max-w-md mx-auto">
        Subscribe when you want more stations, cities, and saves.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6 items-stretch">
        <section class="rounded-2xl border border-amber-800/28 bg-stone-950/40 p-5 md:p-6 flex flex-col shadow-md shadow-black/20 opacity-[0.92] md:scale-[0.98] md:origin-top hover:border-amber-800/40 transition-all">
          <h3 class="text-xl font-black uppercase tracking-[0.14em] gold" style="color:#d89b2b">STARTER</h3>
          <p class="mt-2 text-stone-500 text-sm leading-relaxed">Take control. Build your station.</p>
          <div class="mt-5 flex flex-col gap-2.5 flex-1 text-[0.875rem] leading-snug text-stone-400">
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> Play across five major markets</div>
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> Run GM scenarios</div>
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> Build your on-air team</div>
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> Expanded creative tools</div>
            <div class="wl-check-index"><span class="mark text-amber-600/80">✓</span> More saves &amp; insights</div>
          </div>
          <div class="mt-6 flex flex-col gap-2">
            <button type="button" data-price="starter_monthly" class="gold-bg w-full rounded-lg px-3 py-3 font-black uppercase tracking-[0.14em] text-xs hover:brightness-110 transition-all shadow-sm shadow-black/40 text-stone-900">
              <span class="block tracking-[0.08em]">KEEP PLAYING — MONTHLY</span>
              <span class="mt-1 block text-[12px] font-bold normal-case tracking-normal opacity-95">$4.99/mo</span>
            </button>
            <button type="button" data-price="starter_annual" class="w-full rounded-lg border border-amber-700/35 bg-transparent px-3 py-2.5 font-black uppercase tracking-[0.14em] text-xs text-amber-200/85 hover:bg-stone-900/60 transition-colors">
              <span class="block">ANNUAL</span>
              <span class="mt-1 block text-[11px] font-semibold text-amber-200/75 normal-case tracking-normal">$49.99/yr</span>
            </button>
          </div>
        </section>

        <section class="relative rounded-2xl border-2 border-violet-400/70 bg-gradient-to-b from-stone-950 via-stone-950 to-violet-950/35 p-6 md:p-7 flex flex-col shadow-[0_0_64px_rgba(139,92,246,0.48)] lg:scale-[1.07] lg:z-10 ring-1 ring-violet-300/35">
          <span class="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-violet-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-white shadow-lg shadow-violet-900/50">
            ★ FULL EXPERIENCE
          </span>
          <h3 class="mt-4 text-2xl md:text-3xl font-black uppercase tracking-[0.12em] text-violet-50">PRO</h3>
          <p class="mt-2 text-violet-200/80 text-sm leading-relaxed">Continue your station&rsquo;s story &mdash; no limits.</p>
          <div class="mt-6 flex flex-col gap-3 flex-1 text-[0.875rem] leading-snug text-stone-100/95">
            <div class="wl-check-index"><span class="mark text-violet-400">✓</span> All markets &mdash; including new expansions</div>
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
            <button type="button" data-price="pro_monthly" class="w-full rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-3 py-3.5 font-black uppercase tracking-[0.08em] text-xs transition-colors shadow-xl shadow-violet-950/50">
              <span class="block">CONTINUE YOUR STATION — MONTHLY</span>
              <span class="mt-1 block text-[12px] font-bold normal-case tracking-normal text-violet-50 opacity-95">$9.99/mo</span>
            </button>
            <button type="button" data-price="pro_annual" class="w-full rounded-lg border-2 border-violet-400/55 bg-violet-950/20 px-3 py-2.5 font-black uppercase tracking-[0.14em] text-xs text-violet-100 hover:bg-violet-950/45 transition-colors">
              <span class="block tracking-[0.12em]">ANNUAL</span>
              <span class="mt-1 block text-[11px] font-semibold text-violet-200/95 normal-case tracking-normal">$99.99/yr</span>
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
  setPricingNotice('One moment…');
  const r = await fetch(gameServerApiUrl('/api/billing/create-checkout-session'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId }),
  }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok || !j.url) {
    setPricingNotice(j.error || 'Something went wrong. Try Account from the footer.');
    return;
  }
  setPricingNotice('');
  window.location.assign(j.url);
}

async function init() {
  const mountEl = document.getElementById('wl-index-pricing-clerk');
  if (!mountEl) return;

  if (!publishableKey) {
    mountEl.innerHTML =
      '<p class="text-stone-600 text-[13px] text-center leading-relaxed max-w-sm mx-auto">Memberships aren’t available on this preview. Continue in <a href="/account.html" class="text-amber-200/85 underline underline-offset-2 hover:text-amber-100">Account</a>.</p>';
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

    mountEl.querySelectorAll('button[data-price]').forEach((btn) => {
      btn.addEventListener('click', () => startCheckout(clerk, btn.getAttribute('data-price')));
    });
  } catch (e) {
    console.error('[indexMarketing] pricing:', e);
    mountEl.innerHTML =
      '<p class="text-stone-600 text-[13px] text-center leading-relaxed">Could not load memberships. Try <a href="/account.html" class="text-amber-200/85 underline underline-offset-2">Account</a> or <a href="/play.html" class="text-amber-200/85 underline underline-offset-2">Play</a>.</p>';
  }
}

init();
