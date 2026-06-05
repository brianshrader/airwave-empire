# Large-Market Audience/Billing Expansion A/B (anchor 16)

Diagnostic: `scripts/diag-large-market-expansion-ab.mjs`  
Artifacts: `tmp/large_market_expansion_ab.json`

Seattle · San Francisco · Atlanta · 1970 · 18 runs/variant · seed 20260610 · aggressive benchmark bot to 2000

**Anchor 10 reference survival:** 81.5% · **A16 baseline (A):** 50.0%

---

## A–H comparison (pooled medians)

| Var | Model | Surv@2000 | Δ vs A | Open player sh | Rev pool | Avg rev/st | Top-3 sh | FM comm | Peak sh |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | Baseline anchor 16 | 50.0% | — | 6.6% | $8,398,275 | $221,352 | 47.8% | 28.6% | — |
| B | +15% billing only | 50.0% | 0.0 | 6.6% | $8,633,427 | $218,361 | 47.8% | 28.6% | — |
| C | +30% billing only | 50.0% | 0.0 | 6.6% | $8,633,427 | $218,361 | 47.8% | 28.6% | — |
| D | +15% listening only | 50.0% | 0.0 | 5.5% | $8,633,427 | $211,318 | 45.1% | 28.6% | — |
| E | +30% listening only | 50.0% | 0.0 | 5.5% | $8,633,427 | $211,318 | 45.1% | 28.6% | — |
| F | +15% both | 50.0% | 0.0 | 5.5% | $8,633,427 | $211,318 | 45.1% | 28.6% | — |
| G | +30% bill / +15% listen | 50.0% | 0.0 | 5.5% | $8,633,427 | $211,318 | 45.1% | 28.6% | — |
| H | Elastic (+24% bill / +15% listen @14 st) | 50.0% | 0.0 | 5.5% | $8,633,427 | $211,318 | 45.1% | 28.6% | — |
| Ref | Anchor 10 (no expansion) | **81.5%** | — | ~10% | — | **$1,049,784** | — | — | — |

---

## Opening expansion (what changed)

| Var | Total AQH | Half-period billing target | Player rev | Player EBITDA |
| --- | ---: | ---: | ---: | ---: |
| A | 84,463 | $8,633,427 | $340,886 | positive |
| B | 84,463 | $9,928,441 (+15%) | $271,646 | positive |
| C | 81,012 | $11,223,455 (+30%) | $271,646 | positive |
| D–H | ~81,012 | varies | ~$236,988 | positive |

- **Billing-only (B/C):** Ecology preserved (top-3 **47.8%**, rock present, FM ~29% of commercials). Revenue pool rises only **~+2.8%** vs A in summed `fin.rev` (second `seedRev` pass); player revenue **falls** vs A because monetization-efficiency re-split, not because share moved.
- **Listening (D–H):** `otherAudio` dilution cut via `recalc` → player share **6.6% → 5.5%**, top-3 **47.8% → 45.1%** (below 47–52% ecology band). No survival lift.

---

## Long-run (snowball to 2000)

| Metric | All A–H | Anchor 10 ref |
| --- | --- | --- |
| Survival | **50.0%** (every variant) | **81.5%** |
| Mechanism | Bimodal seeds: ~5.5% open share → fail; ~8%+ → often survive | Higher median open share (~10%) |
| Distress / acq | Unchanged across variants | — |

Partial market expansion **does not move** runs across the ~6.5–7% share survival cliff in this harness.

---

## Ecology vs targets

| Target | A / B / C | D–H |
| --- | --- | --- |
| Top-3 **47–52%** | **OK** (~47.8%) | **Miss** (~45.1%) |
| Rock present | OK | OK |
| FM depth > anchor 10 | OK (~29% FM) | OK |
| Avg rev/st ≤ anchor 10 | OK (~$220k vs $1.05M) | OK |

---

## Answers (diagnostic only)

### Is anchor 16 viable after partial expansion?

**No** — none of A–H beat **50%** pooled survival or approach **81.5%** anchor-10 survival.

### Billing, listening, or both?

| Lever | Effect | Survival |
| --- | --- | --- |
| **Billing only (B/C)** | Modest pool target (+15–30%); **~+3%** realized pool; share/ecology stable | **No change** |
| **Listening only (D/E)** | Shifts shares down; hurts top-3 band | **No change** |
| **Combined / elastic (F–H)** | Listening path dominates; ecology drift | **No change** |

**Both** are needed in principle (dollars + share), but this study’s **listening path via full `recalc`** is the wrong tool — it **reduces** player share. Prior **+4 share-point** sensitivity moved survival; **billing alone did not**.

### Recommended model

**None of A–H are production-ready as-is.**

If pursuing expansion in design:

1. **Prefer billing-only elastic** (~**+24%** half-period target at 14 stations: `1 + min(0.35, extra×0.04)`) to avoid ecology damage from listening `recalc`.
2. **Do not rely on pool growth alone** — must also lift **player opening share** toward **~7%+** (station-scaled share floor or opening-shape fix), consistent with starter-station and sensitivity audits.
3. **Avoid** proportional **+75%** billing (would push avg rev/st toward anchor-10 per-station levels and overshoot realism).

### Anchor 16 becomes viable?

**Not from partial AQH/billing expansion alone** in these variants. Viability still requires **share recovery**, not just a larger revenue pie.

---

## Harness notes

- Same seeds across A–H per run index (paired comparison).
- Headless `wlTalentHasExitIntent` errors may appear during `advTurn`; runs still complete.
- Re-run: `node scripts/diag-large-market-expansion-ab.mjs`
