# Entitlements (Clerk Billing)

**Source of truth (product):** this document.  
**Source of truth (who paid):** Clerk Billing + Stripe (via Connect). **Server code** must resolve the user’s plan (`has()` / Clerk API / session claims) and **enforce** these numbers — do not trust the client for limits.

**Clerk plan keys (from Dashboard):** `free_user` | `starter` | `pro`

| Capability | `free_user` | `starter` | `pro` |
|------------|------------|-----------|-------|
| **Monthly AI logo generations** | 5 | 40 | 200 |
| **Monthly AI jingle generations** | 2 | 15 | 80 |
| **Monthly AI van / remote-van “image” generations** | 3* | 20 | 100 |
| **Markets (solo scenario picker)** | **Atlanta only** | **6** — all Phase-1 markets **except Seattle** | **All 7** — includes **Seattle** |
| **Multiplayer** | On (Host: Atlanta only) | On | On |
| **Cloud save slots** | 0 (local download/upload only) | 3 | Unlimited |
| **Monthly Ratings Digest (OpenRouter)** | 15 | 100 | 500 |
| **General Manager campaign** | Off | On | On |

\* If you allow 0 on Free, UI should hide or block van-image flows; if you allow a non-AI purchasable boost only, call that out separately (not counted here).

† **TBD** — not in the last tier spec; set to On/Off and quotas here when decided, then update code in one pass.

## Billing period

- **“Monthly” quotas** = per user per **subscription billing period** (recommended) or a fixed calendar month; pick one and use the same meaning in UI copy and server reset logic.
- **Annual** subscribers: same *monthly* limits **within** the product (e.g. 40 logos per month, not 40×12 up front) unless you explicitly choose “pool for the year.”

## Implementation notes (later)

- **Keys:** use Clerk’s `free_user`, `starter`, `pro` in server-side checks; avoid renaming plan keys in Dashboard after launch.
- **“Unlimited” saves (Pro):** still enforce a **sane upper bound** in code if you need abuse protection; document the cap here if you add one.
- **Markets (implemented in client, test):** `src/billingEntitlements.js` + `window.__WL_PLAN_MARKET_IDS` — `starter` omits `seattle`; `pro` includes it; `free_user` is Atlanta only. New markets: add to `ALL_PLAYABLE_MARKET_IDS_ORDERED` and decide per tier.

## Revision history

| Date | Change |
|------|--------|
| 2026-04-24 | Initial table from product discussion + Clerk plan keys. |

When you change quotas or add features, **edit this file first**, then code.
