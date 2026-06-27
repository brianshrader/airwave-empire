import{i as h,a as f,c,b as _,d as w,s as y,e as k,f as v}from"./analyticsClient-BN8GngS2.js";import{B as A,e as E,g as b}from"./gameServerApiOrigin-BQisP3Bi.js";import{e as C}from"./stripePriceIds-BonboTBH.js";const p={},m="pk_live_Y2xlcmsuYWlyd2F2ZWVtcGlyZS5jb20k".trim?.()??"",I="/play-guest.html?scenario=tutorial_turnaround&autostart=1",S="/play.html";h();f();async function L(e){const t=e||{},a=String(t.email||"").trim(),n=String(t.source||"home").trim()||"home",i=String(t.plan||"").trim(),s=String(t.market||"").trim(),l=await fetch(b("/api/marketing/subscribe"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:a,SOURCE:n,PLAN:i,MARKET:s})}),r=await l.json().catch(()=>({}));if(!l.ok||!r||!r.ok){const d=new Error(String(r?.error||"Subscribe failed"));throw d.status=l.status,d}return!0}function N(){const e=document.getElementById("wl-home-email-form");if(!e||e.__wlBound)return;e.__wlBound=!0;try{sessionStorage.getItem("wl_mk_sub_seen_homepage")!=="1"&&(sessionStorage.setItem("wl_mk_sub_seen_homepage","1"),c("marketing_subscribe_viewed",{source:"homepage"}))}catch{}const t=document.getElementById("wl-home-email"),a=document.getElementById("wl-home-email-status"),n=(i,s)=>{a&&(a.textContent=i||"",a.className="mt-3 text-sm "+(s==="ok"?"text-emerald-300":s==="bad"?"text-rose-300":"text-stone-400"))};e.addEventListener("submit",i=>{i.preventDefault();const s=String(t?.value||"").trim();if(!s){n("Enter your email to sign up.","bad");return}n("Signing you up…");try{c("marketing_subscribe_submitted",{source:"homepage"})}catch{}L({email:s,source:"home_pricing_follow",plan:"",market:""}).then(()=>{n("Subscribed. Thanks!","ok");try{c("marketing_subscribe_success",{source:"home_pricing_follow"})}catch{}t&&(t.value="")}).catch(l=>{n("Could not subscribe. Double-check the email and try again.","bad");try{c("marketing_subscribe_failed",{source:"home_pricing_follow",error_type:l?.status>=500?"server_error":"denied"})}catch{}})})}const P=Object.freeze({starter_monthly:p?.VITE_ACCOUNT_PRICE_STARTER_MONTHLY,starter_annual:p?.VITE_ACCOUNT_PRICE_STARTER_ANNUAL,pro_monthly:p?.VITE_ACCOUNT_PRICE_PRO_MONTHLY,pro_annual:p?.VITE_ACCOUNT_PRICE_PRO_ANNUAL});function T(e){const t=String(e||""),a=t.startsWith("pro")?"pro":"starter",n=t.endsWith("annual")?"annual":"monthly";return{plan:a,cadence:n}}function U(){try{const e=typeof location<"u"?location.pathname+(location.search||""):"/";let t="";try{t=typeof document<"u"&&document.referrer||"",t.length>200&&(t=t.slice(0,200))}catch{}c("landing_viewed",{path:e,referrer:t})}catch{}}function g(e){const t=!!(e?.isSignedIn||e?.user),a=t?S:I;document.querySelectorAll("[data-wl-home-play-cta]").forEach(o=>{o.setAttribute("href",a),t?(o.removeAttribute("data-wl-no-signup"),o.setAttribute("data-wl-cta-dest","play_scenario_picker"),o.setAttribute("data-wl-funnel","signed_in_play"),o.setAttribute("data-wl-cta-label","play_now")):(o.setAttribute("data-wl-no-signup","true"),o.setAttribute("data-wl-cta-dest","guest_tutorial_turnaround"),o.setAttribute("data-wl-funnel","guest_tutorial"))});const n=document.getElementById("wl-nav-primary-cta");n&&(n.textContent=t?"Play now":"Play free",t||(n.setAttribute("data-wl-cta-label","Play Free Now"),n.setAttribute("data-wl-cta-id","header_play_free"),n.setAttribute("data-wl-cta-placement","landing_header")));const i=document.getElementById("wl-hero-cta");i&&(i.textContent=t?"Play now":"Play free now",t||(i.setAttribute("data-wl-cta-label","Play Free Now"),i.setAttribute("data-wl-cta-id","hero_play_free"),i.setAttribute("data-wl-cta-placement","landing_hero")));const s=document.getElementById("wl-hero-visual-play");s&&(s.setAttribute("aria-label",t?"Play Airwave Empire — choose a scenario":"Play Airwave Empire free — start the tutorial"),t||(s.setAttribute("data-wl-cta-label","Play Free Now"),s.setAttribute("data-wl-cta-id","hero_image_play_free"),s.setAttribute("data-wl-cta-placement","landing_hero_image")));const l=document.getElementById("wl-pricing-guest-play");l&&(l.textContent=t?"Play now":"Play free — no signup required",t||l.setAttribute("data-wl-cta-label","play_free_no_signup"));const r=document.getElementById("wl-hero-cta-sub");r&&(r.textContent=t?"Pick a scenario and continue your empire.":"No signup. No download. Start playing instantly.");const d=document.getElementById("wl-pricing-signin-hint");d&&(d.style.display=t?"none":"")}function R(){document.querySelectorAll("[data-wl-cta]").forEach(e=>{e.addEventListener("click",()=>{try{const t=e.getAttribute("data-wl-cta-location")||"unknown",a=e.getAttribute("data-wl-cta-label")||e.textContent?.trim?.()||"cta";let n=e.getAttribute("href")||e.getAttribute("data-wl-cta-dest")||"";n.length>120&&(n=n.slice(0,120)),c("cta_clicked",{location:t,label:a.slice(0,80),destination:n,cta_id:(e.getAttribute("data-wl-cta-id")||"").slice(0,48),cta_label:a.slice(0,80),cta_placement:(e.getAttribute("data-wl-cta-placement")||t).slice(0,48),cta_destination:(e.getAttribute("data-wl-cta-dest")||n).slice(0,120),funnel:(e.getAttribute("data-wl-funnel")||"").slice(0,32),no_signup:e.getAttribute("data-wl-no-signup")==="true"})}catch{}})})}function O(){if(typeof window>"u")return"/#pricing";const{origin:e,pathname:t,search:a}=window.location;return`${e}${t&&t!==""?t:"/"}${a||""}#pricing`}function x(e){e.innerHTML=`
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
              <span class="mt-1 block text-[10px] font-medium text-violet-300/85 normal-case tracking-normal leading-snug">${A}</span>
            </button>
          </div>
        </section>
      </div>
      <p class="text-center text-[11px] md:text-[12px] text-stone-500 leading-relaxed mt-6 max-w-xl mx-auto px-2">
        By subscribing, you agree to recurring billing and the
        <a href="/terms" class="text-amber-200/90 hover:text-amber-100 underline underline-offset-2">Terms of Service</a>.
      </p>
    </div>
  `}function u(e){const t=document.getElementById("wl-index-pricing-clerk");if(!t)return;let a=document.getElementById("wl-index-pricing-notice");if(!e){a&&a.remove();return}a||(a=document.createElement("p"),a.id="wl-index-pricing-notice",a.className="mt-5 text-center text-[13px] text-stone-500 leading-relaxed max-w-md mx-auto",t.appendChild(a)),a.textContent=e}async function B(e,t){const a=C()[t];if(!a)return;if(!e?.session){u("Open Account to sign in, then return here to subscribe.");return}const n=await e.session.getToken().catch(()=>null);if(!n){u("Open Account to sign in, then return here to subscribe.");return}const{plan:i,cadence:s}=T(t),l=E(t,P[t])||"";try{c("checkout_started",{plan:i,cadence:s,selected_plan:i,billing_cycle:s,price_label:l.slice(0,48),source:"landing"})}catch{}u("One moment…");const r=await fetch(b("/api/billing/create-checkout-session"),{method:"POST",headers:{Authorization:`Bearer ${n}`,"Content-Type":"application/json"},body:JSON.stringify({priceId:a})}).catch(()=>null),d=r?await r.json().catch(()=>({})):{};if(!r||!r.ok||!d.url){try{c("checkout_failed",{plan:i,cadence:s,selected_plan:i,billing_cycle:s,source:"landing",error_type:r?r.status>=500?"server_error":"checkout_denied":"network"})}catch{}u(d.error||"Something went wrong. Try Account from the footer.");return}u(""),window.location.assign(d.url)}async function F(){U(),queueMicrotask(()=>R()),queueMicrotask(()=>N());const e=document.getElementById("wl-index-pricing-clerk");if(e){if(!m){x(e);const t=document.createElement("p");t.className="mt-4 text-center text-[13px] text-stone-500 leading-relaxed max-w-lg mx-auto px-2",t.innerHTML='Checkout isn’t wired on this deployment. Open <a href="/account#wl-account-plan-actions" class="text-amber-200/85 underline underline-offset-2 hover:text-amber-100">Account</a> to sign in and subscribe.',e.appendChild(t),e.querySelectorAll("button[data-price]").forEach(a=>{a.addEventListener("click",()=>{try{c("cta_clicked",{location:"pricing_membership",label:"plan_button_no_clerk_key",destination:"account_fallback"})}catch{}window.location.assign("/account#wl-account-plan-actions")})});return}try{x(e),_(),await w(m,"Failed to load @clerk/ui");const t=new y(m,k()),a=O();await t.load({ui:{ClerkUI:window.__internal_ClerkUICtor},signInForceRedirectUrl:a,signUpForceRedirectUrl:a,signInFallbackRedirectUrl:a,signUpFallbackRedirectUrl:a});try{const n=t.user?.id;n&&v(String(n))}catch{}g(t),t.addListener(()=>g(t)),e.querySelectorAll("button[data-price]").forEach(n=>{n.addEventListener("click",()=>{try{const i=n.getAttribute("data-price")||"";c("cta_clicked",{location:"pricing_membership",label:i||"plan_button",destination:"stripe_checkout"})}catch{}B(t,n.getAttribute("data-price"))})})}catch(t){console.error("[indexMarketing] pricing:",t),e.innerHTML='<p class="text-stone-600 text-[13px] text-center leading-relaxed">Could not load memberships. Try <a href="/account" class="text-amber-200/85 underline underline-offset-2">Account</a> or <a href="/play.html" class="text-amber-200/85 underline underline-offset-2">Play</a>.</p>'}}}F();
