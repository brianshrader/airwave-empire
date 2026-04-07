# LMA fee model (Airwave Empire)

## Problem

The previous model used a **flat 65% of station gross revenue** per half-year as the LMA payment. That behaved like profit extraction, not a lease: fees could exceed plausible station operating profit and dominated cash flow.

## New formula (half-year dollars)

All fees round to the nearest **$1,000** (unchanged convention).

**Inputs**

- **Half-period market pool** — same construction as `seedRev` billing:  
  `annualMarketBilling(year, marketId) × 0.5 × marketHalfSeasonFactor(year, period) × max(0.75, adx)`.
- **Gross revenue** — station billing for the half-year (`_lmaGrossRev` when set, else `fin.rev`).
- **Seed EBITDA** — operating EBITDA *before* LMA cash: for a **lessor** station, stored as `_lmaSeedEbitda` in `seedRev` before the lessor P&L override; for a **lessee**, current `fin.ebitda`.
- **Market tier** — `MARKETS[marketId].rankTier` (`medium` / `large` / `mega`) scales the market-base term.
- **Year** — drives the **era curve** `lmaEraFactor(year)`.
- **FM vs AM** — FM pays a **6%** higher performance component (signal multiplier 1.06 on the revenue term only).

**Hybrid**

```
raw = (halfPool × K_base[tier] + grossRev × 0.0185 × sigFmMult) × lmaEraFactor(year)
fee = min(raw,
          0.11 × grossRev,
          0.28 × seedEBITDA  if seedEBITDA > 0 else ∞,
          absoluteCap(year, tier))
```

**Constants (tunable)**

| Symbol | Value | Role |
|--------|-------|------|
| `K_base` mega | 0.0022 | Market rent–like base per dollar of half-pool |
| `K_base` large | 0.00165 | |
| `K_base` medium | 0.00072 | |
| `K_base` small | 0.00055 | Reserved if tiers expand |
| Perf on gross | 1.85% × FM 1.06 | Scales **slower than revenue** than a flat % |
| Revenue cap | 11% of gross | Hard guardrail vs billing |
| EBITDA cap | 28% of positive seed EBITDA | Keeps fee below “rent + profit share” feel |
| Absolute cap | ~$2.15M × (0.62 + 0.38 × era) × tier | Mega peak ~low single-digit $M / half |

**Era curve** `lmaEraFactor(year)` (qualitative targets)

- **Pre-1990:** weak (~0.34–0.42) — LMAs rarer / weaker economics.
- **1990–1995:** ramp (~0.46 → ~0.90) — growing use.
- **1996–2003:** peak (~0.90 → ~1.02) — strongest LMA era.
- **2004+:** flatter / lower — relative importance fades.

## Why it scales

- **Market pool** ties the fee to **market billing** and rank (via tier), not only one station’s revenue.
- The **4.8% gross term** grows with the station but **much slower** than the old 65%.
- **Era** modulates prevalence and typical deal economics without touching other revenue/expense systems.
- **Caps** (revenue %, EBITDA %, absolute) prevent absurd outcomes and keep typical fees in a **~20–28% of EBITDA** band when EBITDA is positive (by construction of the EBITDA cap).

## Code map

- **`src/legacy.js`** — `LMA_FEE_MODEL_SYNC` block: `lmaEraFactor`, `lmaComputeFeeRounded`, `lmaHalfPeriodMarketPool`, `lmaFeeForStation`.
- **`scripts/lmaFeeModelShared.mjs`** — same numerical kernel for audits (keep in sync).
- **`scripts/audit-lma-fees.mjs`** — old vs new comparison table.

## Maintenance

When tuning, update **both** `legacy.js` and `lmaFeeModelShared.mjs` inside the marked SYNC regions.
