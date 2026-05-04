import{i as b,c as l,a as h,b as f,s as v,d as k,e as w}from"./analyticsClient-DseHga0r.js";import{B as y,e as _}from"./billingPriceLabels-BRS4POW_.js";import{e as A,g as C}from"./gameServerApiOrigin-fKQqZOIP.js";const o={},d="pk_live_Y2xlcmsuYWlyd2F2ZWVtcGlyZS5jb20k".trim?.()??"";b();const E=Object.freeze({starter_monthly:o?.VITE_ACCOUNT_PRICE_STARTER_MONTHLY,starter_annual:o?.VITE_ACCOUNT_PRICE_STARTER_ANNUAL,pro_monthly:o?.VITE_ACCOUNT_PRICE_PRO_MONTHLY,pro_annual:o?.VITE_ACCOUNT_PRICE_PRO_ANNUAL});function L(e){const t=String(e||""),n=t.startsWith("pro")?"pro":"starter",a=t.endsWith("annual")?"annual":"monthly";return{plan:n,cadence:a}}function I(){try{const e=typeof location<"u"?location.pathname+(location.search||""):"/";let t="";try{t=typeof document<"u"&&document.referrer||"",t.length>200&&(t=t.slice(0,200))}catch{}l("landing_viewed",{path:e,referrer:t})}catch{}}function m(e){const t=document.getElementById("wl-nav-primary-cta");if(!t)return;!!(e?.isSignedIn||e?.user)?(t.setAttribute("href","/play.html"),t.textContent="Play now",t.setAttribute("data-wl-cta-label","play_now")):(t.setAttribute("href","#pricing"),t.innerHTML="Plans &amp; trial",t.setAttribute("data-wl-cta-label","plans_and_trial"))}function N(){document.querySelectorAll("[data-wl-cta]").forEach(e=>{e.addEventListener("click",()=>{try{const t=e.getAttribute("data-wl-cta-location")||"unknown",n=e.getAttribute("data-wl-cta-label")||e.textContent?.trim?.()||"cta";let a=e.getAttribute("href")||e.getAttribute("data-wl-cta-dest")||"";a.length>120&&(a=a.slice(0,120)),l("cta_clicked",{location:t,label:n.slice(0,80),destination:a})}catch{}})})}function T(){if(typeof window>"u")return"/#pricing";const{origin:e,pathname:t,search:n}=window.location;return`${e}${t&&t!==""?t:"/"}${n||""}#pricing`}function x(e){e.innerHTML=`
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
              <span class="mt-1 block text-[10px] font-medium text-violet-300/85 normal-case tracking-normal leading-snug">${y}</span>
            </button>
          </div>
        </section>
      </div>
      <p class="text-center text-[11px] md:text-[12px] text-stone-500 leading-relaxed mt-6 max-w-xl mx-auto px-2">
        By subscribing, you agree to recurring billing and the
        <a href="/terms" class="text-amber-200/90 hover:text-amber-100 underline underline-offset-2">Terms of Service</a>.
      </p>
    </div>
  `}function r(e){const t=document.getElementById("wl-index-pricing-clerk");if(!t)return;let n=document.getElementById("wl-index-pricing-notice");if(!e){n&&n.remove();return}n||(n=document.createElement("p"),n.id="wl-index-pricing-notice",n.className="mt-5 text-center text-[13px] text-stone-500 leading-relaxed max-w-md mx-auto",t.appendChild(n)),n.textContent=e}async function U(e,t){const n=A()[t];if(!n)return;if(!e?.session){r("Open Account to sign in, then return here to subscribe.");return}const a=await e.session.getToken().catch(()=>null);if(!a){r("Open Account to sign in, then return here to subscribe.");return}const{plan:i,cadence:p}=L(t),u=_(t,E[t])||"";try{l("checkout_started",{plan:i,cadence:p,price_label:u.slice(0,48),source:"landing"})}catch{}r("One moment…");const s=await fetch(C("/api/billing/create-checkout-session"),{method:"POST",headers:{Authorization:`Bearer ${a}`,"Content-Type":"application/json"},body:JSON.stringify({priceId:n})}).catch(()=>null),c=s?await s.json().catch(()=>({})):{};if(!s||!s.ok||!c.url){try{l("checkout_failed",{plan:i,cadence:p,source:"landing",error_type:s?s.status>=500?"server_error":"checkout_denied":"network"})}catch{}r(c.error||"Something went wrong. Try Account from the footer.");return}r(""),window.location.assign(c.url)}async function R(){I(),queueMicrotask(()=>N());const e=document.getElementById("wl-index-pricing-clerk");if(e){if(!d){x(e);const t=document.createElement("p");t.className="mt-4 text-center text-[13px] text-stone-500 leading-relaxed max-w-lg mx-auto px-2",t.innerHTML='Checkout isn’t wired on this deployment. Open <a href="/account.html#wl-account-plan-actions" class="text-amber-200/85 underline underline-offset-2 hover:text-amber-100">Account</a> to sign in and subscribe.',e.appendChild(t),e.querySelectorAll("button[data-price]").forEach(n=>{n.addEventListener("click",()=>{try{l("cta_clicked",{location:"pricing_membership",label:"plan_button_no_clerk_key",destination:"account_fallback"})}catch{}window.location.assign("/account.html#wl-account-plan-actions")})});return}try{x(e),h(),await f(d,"Failed to load @clerk/ui");const t=new v(d,k()),n=T();await t.load({ui:{ClerkUI:window.__internal_ClerkUICtor},signInForceRedirectUrl:n,signUpForceRedirectUrl:n,signInFallbackRedirectUrl:n,signUpFallbackRedirectUrl:n});try{const a=t.user?.id;a&&w(String(a))}catch{}m(t),t.addListener(()=>m(t)),e.querySelectorAll("button[data-price]").forEach(a=>{a.addEventListener("click",()=>{try{const i=a.getAttribute("data-price")||"";l("cta_clicked",{location:"pricing_membership",label:i||"plan_button",destination:"stripe_checkout"})}catch{}U(t,a.getAttribute("data-price"))})})}catch(t){console.error("[indexMarketing] pricing:",t),e.innerHTML='<p class="text-stone-600 text-[13px] text-center leading-relaxed">Could not load memberships. Try <a href="/account.html" class="text-amber-200/85 underline underline-offset-2">Account</a> or <a href="/play.html" class="text-amber-200/85 underline underline-offset-2">Play</a>.</p>'}}}R();
