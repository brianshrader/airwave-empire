import{i as h,a as f,c as o,b as k,d as v,s as _,e as w,f as y}from"./analyticsClient-CfAY6Y7_.js";import{B as E,e as A}from"./billingPriceLabels-BRS4POW_.js";import{e as C,g}from"./gameServerApiOrigin-fKQqZOIP.js";const m={},p="pk_live_Y2xlcmsuYWlyd2F2ZWVtcGlyZS5jb20k".trim?.()??"";h();f();async function I(t){const e=t||{},n=String(e.email||"").trim(),a=String(e.source||"home").trim()||"home",s=String(e.plan||"").trim(),r=String(e.market||"").trim(),l=await fetch(g("/api/marketing/subscribe"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:n,SOURCE:a,PLAN:s,MARKET:r})}),i=await l.json().catch(()=>({}));if(!l.ok||!i||!i.ok){const c=new Error(String(i?.error||"Subscribe failed"));throw c.status=l.status,c}return!0}function S(){const t=document.getElementById("wl-home-email-form");if(!t||t.__wlBound)return;t.__wlBound=!0;try{sessionStorage.getItem("wl_mk_sub_seen_homepage")!=="1"&&(sessionStorage.setItem("wl_mk_sub_seen_homepage","1"),o("marketing_subscribe_viewed",{source:"homepage"}))}catch{}const e=document.getElementById("wl-home-email"),n=document.getElementById("wl-home-email-status"),a=(s,r)=>{n&&(n.textContent=s||"",n.className="mt-3 text-sm "+(r==="ok"?"text-emerald-300":r==="bad"?"text-rose-300":"text-stone-400"))};t.addEventListener("submit",s=>{s.preventDefault();const r=String(e?.value||"").trim();if(!r){a("Enter your email to sign up.","bad");return}a("Signing you up…");try{o("marketing_subscribe_submitted",{source:"homepage"})}catch{}I({email:r,source:"home_pricing_follow",plan:"",market:""}).then(()=>{a("Subscribed. Thanks!","ok");try{o("marketing_subscribe_success",{source:"home_pricing_follow"})}catch{}e&&(e.value="")}).catch(l=>{a("Could not subscribe. Double-check the email and try again.","bad");try{o("marketing_subscribe_failed",{source:"home_pricing_follow",error_type:l?.status>=500?"server_error":"denied"})}catch{}})})}const L=Object.freeze({starter_monthly:m?.VITE_ACCOUNT_PRICE_STARTER_MONTHLY,starter_annual:m?.VITE_ACCOUNT_PRICE_STARTER_ANNUAL,pro_monthly:m?.VITE_ACCOUNT_PRICE_PRO_MONTHLY,pro_annual:m?.VITE_ACCOUNT_PRICE_PRO_ANNUAL});function N(t){const e=String(t||""),n=e.startsWith("pro")?"pro":"starter",a=e.endsWith("annual")?"annual":"monthly";return{plan:n,cadence:a}}function T(){try{const t=typeof location<"u"?location.pathname+(location.search||""):"/";let e="";try{e=typeof document<"u"&&document.referrer||"",e.length>200&&(e=e.slice(0,200))}catch{}o("landing_viewed",{path:t,referrer:e})}catch{}}function u(t){const e=document.getElementById("wl-nav-primary-cta");if(!e)return;!!(t?.isSignedIn||t?.user)?(e.setAttribute("href","/play.html"),e.textContent="Play now",e.setAttribute("data-wl-cta-label","play_now")):(e.setAttribute("href","/play-guest.html"),e.textContent="Play free",e.setAttribute("data-wl-cta-label","play_free_now"))}function U(){document.querySelectorAll("[data-wl-cta]").forEach(t=>{t.addEventListener("click",()=>{try{const e=t.getAttribute("data-wl-cta-location")||"unknown",n=t.getAttribute("data-wl-cta-label")||t.textContent?.trim?.()||"cta";let a=t.getAttribute("href")||t.getAttribute("data-wl-cta-dest")||"";a.length>120&&(a=a.slice(0,120)),o("cta_clicked",{location:e,label:n.slice(0,80),destination:a})}catch{}})})}function P(){if(typeof window>"u")return"/#pricing";const{origin:t,pathname:e,search:n}=window.location;return`${t}${e&&e!==""?e:"/"}${n||""}#pricing`}function x(t){t.innerHTML=`
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
              <span class="mt-1 block text-[10px] font-medium text-violet-300/85 normal-case tracking-normal leading-snug">${E}</span>
            </button>
          </div>
        </section>
      </div>
      <p class="text-center text-[11px] md:text-[12px] text-stone-500 leading-relaxed mt-6 max-w-xl mx-auto px-2">
        By subscribing, you agree to recurring billing and the
        <a href="/terms" class="text-amber-200/90 hover:text-amber-100 underline underline-offset-2">Terms of Service</a>.
      </p>
    </div>
  `}function d(t){const e=document.getElementById("wl-index-pricing-clerk");if(!e)return;let n=document.getElementById("wl-index-pricing-notice");if(!t){n&&n.remove();return}n||(n=document.createElement("p"),n.id="wl-index-pricing-notice",n.className="mt-5 text-center text-[13px] text-stone-500 leading-relaxed max-w-md mx-auto",e.appendChild(n)),n.textContent=t}async function R(t,e){const n=C()[e];if(!n)return;if(!t?.session){d("Open Account to sign in, then return here to subscribe.");return}const a=await t.session.getToken().catch(()=>null);if(!a){d("Open Account to sign in, then return here to subscribe.");return}const{plan:s,cadence:r}=N(e),l=A(e,L[e])||"";try{o("checkout_started",{plan:s,cadence:r,selected_plan:s,billing_cycle:r,price_label:l.slice(0,48),source:"landing"})}catch{}d("One moment…");const i=await fetch(g("/api/billing/create-checkout-session"),{method:"POST",headers:{Authorization:`Bearer ${a}`,"Content-Type":"application/json"},body:JSON.stringify({priceId:n})}).catch(()=>null),c=i?await i.json().catch(()=>({})):{};if(!i||!i.ok||!c.url){try{o("checkout_failed",{plan:s,cadence:r,selected_plan:s,billing_cycle:r,source:"landing",error_type:i?i.status>=500?"server_error":"checkout_denied":"network"})}catch{}d(c.error||"Something went wrong. Try Account from the footer.");return}d(""),window.location.assign(c.url)}async function O(){T(),queueMicrotask(()=>U()),queueMicrotask(()=>S());const t=document.getElementById("wl-index-pricing-clerk");if(t){if(!p){x(t);const e=document.createElement("p");e.className="mt-4 text-center text-[13px] text-stone-500 leading-relaxed max-w-lg mx-auto px-2",e.innerHTML='Checkout isn’t wired on this deployment. Open <a href="/account#wl-account-plan-actions" class="text-amber-200/85 underline underline-offset-2 hover:text-amber-100">Account</a> to sign in and subscribe.',t.appendChild(e),t.querySelectorAll("button[data-price]").forEach(n=>{n.addEventListener("click",()=>{try{o("cta_clicked",{location:"pricing_membership",label:"plan_button_no_clerk_key",destination:"account_fallback"})}catch{}window.location.assign("/account#wl-account-plan-actions")})});return}try{x(t),k(),await v(p,"Failed to load @clerk/ui");const e=new _(p,w()),n=P();await e.load({ui:{ClerkUI:window.__internal_ClerkUICtor},signInForceRedirectUrl:n,signUpForceRedirectUrl:n,signInFallbackRedirectUrl:n,signUpFallbackRedirectUrl:n});try{const a=e.user?.id;a&&y(String(a))}catch{}u(e),e.addListener(()=>u(e)),t.querySelectorAll("button[data-price]").forEach(a=>{a.addEventListener("click",()=>{try{const s=a.getAttribute("data-price")||"";o("cta_clicked",{location:"pricing_membership",label:s||"plan_button",destination:"stripe_checkout"})}catch{}R(e,a.getAttribute("data-price"))})})}catch(e){console.error("[indexMarketing] pricing:",e),t.innerHTML='<p class="text-stone-600 text-[13px] text-center leading-relaxed">Could not load memberships. Try <a href="/account" class="text-amber-200/85 underline underline-offset-2">Account</a> or <a href="/play.html" class="text-amber-200/85 underline underline-offset-2">Play</a>.</p>'}}}O();
