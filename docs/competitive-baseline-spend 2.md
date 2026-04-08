# Player competitive baseline (promo + programming)

## Problem

Player stations could leave marketing and programming sliders at zero while still holding large audience share. AI rivals spend roughly 2–4% of revenue via `runAI`. That mismatch inflated EBITDA and cash versus realistic late-1990s / 2000s radio competition.

## Approach (Option A)

**Soft floor, sliders preserved.** For **player-owned** commercial stations only:

- `effPromo = max(min(ops.promo, promoCap), baselinePromo)`
- `effProg = max(min(ops.progBudget, progCap), baselineProg)`

AI stations use capped slider values only (their sliders are already populated by AI behavior). No second floor on AI.

Baseline is **not** a flat tax: it scales with market tier, audience share, era, and realized half-period revenue (`totalRev` in `calcRev`, then `s.fin.rev` again in `seedRev` after pool normalization so dollars stay consistent with P&L).

## Code locations

- `playerCompetitiveBaselinePromoProg` and tunable constants in `src/legacy.js` (after `progBudgetCapForPeriod`).
- `calcRev`: effective promo/prog are computed **after** `totalRev` is final, then written to `s.fin.effPromo`, `s.fin.effProg`, `s.fin.competitiveBaselinePromo`, `s.fin.competitiveBaselineProg`, and included in `s.fin.cost`.
- `seedRev`: when revenue is rescaled to the half-period pool, the same baseline logic runs on scaled `s.fin.rev` so costs match displayed revenue.

## Scaling (tuning knobs)

| Input | Role |
|--------|------|
| `PLAYER_BASELINE_SHARE_START` / `PLAYER_BASELINE_SHARE_FULL` | No floor below start; full tier strength at/above full share (decimal ARP, e.g. `0.055` = 5.5%). |
| `sqrt(rawShareK)` | Convex ramp: mid-share stations pay more than a purely linear ramp would imply, without a discrete cliff. |
| `tierCorePct` | Medium / large / mega core % of revenue at full `shareK` and `eraK` (~1.5% / ~2.7% / ~3.6% before era modifiers). |
| Era | Ramps from 1978, extra weight 1988–1998 and a small post-1996 bump (Telecom Act / consolidation). |
| `PLAYER_BASELINE_PROMO_SHARE` | Splits combined baseline dollars between promo and programming (~46% / ~54%). |
| Caps | Baseline lines are clamped by `promoBudgetCapForPeriod` / `progBudgetCapForPeriod` like slider spend. |

## UI / display

Station cards still show **slider** values (`ops.promo` / `ops.progBudget`). P&L uses **effective** amounts when the floor binds. Optional future work: hint when `effPromo > ops.promo` (no UI in this pass).

## Diagnostics

`npm run diag:late-era-cost-mix` — uses `s.fin.effPromo` / `effProg` and reports `floor%` (baseline as % of player cluster revenue). Mega markets include 1999-Fall and 2000-Fall for LA, NY, Chicago; Atlanta remains a control snapshot.

## Calibration note

First-pass tuning targets **~2–4% combined promo+prog** for strong player positions in mega markets in late eras, while keeping sub-2% ARP stations nearly free of floor. If playtests show **too much** pressure in medium markets, reduce `tierCorePct` for `medium` first. If **dominant** mega stations still feel too cheap, raise mega `tierCorePct` slightly or narrow `PLAYER_BASELINE_SHARE_FULL` (full pressure at lower share).
