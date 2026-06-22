# Sports Demand POC — Implementation Spec

**Status:** Scored 2026-06-21 · one pass complete · **stop**  
**Design review:** [REALISM_SPORTS_DEMAND_POC.md](./REALISM_SPORTS_DEMAND_POC.md) — **Accepted** (2026-06-21)  
**Starting classification:** Sports = **Demand + Fragmentation** (spoken macro · Sports Talk lane)

**Acceptance means:** Test whether Sports mega oversizing is **primarily a Demand lane-total problem** — not “lower Sports.”

---

## 1. Experiment goal (sole purpose)

> **Does reducing spoken-family Demand anchors move mega Sports lane totals on the 2000→2026 trajectory — without touching Blueprint or Fragmentation — and without a capture-only improvement with flat lane totals?**

| In scope | Out of scope |
|----------|--------------|
| Mega Sports **lane total** ↓ on post-1990 trajectory | Fix Sports to 3% reference |
| First-book Sports stays ~0% | Blueprint birth edits |
| Prove Demand **surface** moves totals | `getSportsBonus`, rights, habit, other-audio **direct** patches |
| Hold all `blueprint.*`, all `fragmentation.*` | SAC / challenger tuning |

**One change → existing harnesses → score → stop.**

**Not a stealth Blueprint+Demand experiment:** Blueprint frozen. Fragmentation frozen. Only `demand.*` config reads change.

---

## 2. Macro family registry (data, not parameters)

Demand operates on **spoken** macro family. Harness scores **Sports** lane (format family).

| Macro family | Lane diagnostic | Illustrative format IDs |
|--------------|-----------------|-------------------------|
| **spoken** | Sports, News/Talk | `SPORTS_TALK`, `NEWS_TALK`, `PERSONALITY_TALK`, `ALL_NEWS` |

**Registry rules:**

- Static national lookup in config JSON — not per-market.
- POC scores **Sports lane totals**; Demand knob is **`spoken`** (N/T co-movement documented, not tuned away in v1).
- Sports vs News/Talk split at Demand layer is **out of scope** for v1 (partial-outcome path only).

---

## 3. Where Demand lives (ownership)

| Locus | Demand applies? | Notes |
|-------|-------------------|-------|
| **`realismDemand` config loader** | **Yes** | `data/realismDemand.v1.json` + `src/realismDemand.js` (new, POC-only) |
| **`appl()` / recalc L1 appeal path** | **Yes (required)** | Thin adapter: spoken-family target share by year/tier from anchors |
| **`genMarket()` / Blueprint** | **No (frozen)** | Sports first-book ≈ 0% |
| **`getSportsBonus`, rights, habit reconcile, other-audio** | **No (frozen)** | Provenance names these; POC tests **anchor surface**, not plumbing rewrites |
| **SAC / Fragmentation** | **No (frozen)** | `successAttractsCompetition.js`, `fragmentation.*` untouched |

**Implementation constraint:** If anchors do not connect to sim behavior without editing rights/habit directly, **stop and report** — that falsifies “Demand surface is wired” without running a scored POC.

**Harness injection:** Mirror Blueprint POC — `scripts/injectRealismDemandCtx.mjs` loads JSON + IIFE into VM context for `diag:share-lane-*` harnesses.

---

## 4. Parameters (one primary knob)

**Single scalar change for v1:**

| Parameter | Baseline (placeholder) | POC value | Relative cut |
|-----------|------------------------|-----------|--------------|
| `demand.anchor2026[spoken]` | **0.08** | **0.05** | −37.5% |

**Held constant:**

| Parameter | Value |
|-----------|-------|
| `demand.anchor1990[spoken]` | **0.10** (unchanged) |
| `demand.anchor1990/2026[legacyMusic\|contemporaryMusic\|identity]` | Placeholder defaults unchanged |
| `demand.tierMult[mega\|large]` | Unchanged (1.0 / 1.0 placeholders) |
| `demand.inflectionYear` | **2000** |
| `demand.curveExponent` | **1.0** |
| All `blueprint.*`, all `fragmentation.*` | Unchanged / disabled POC modules off |

**No second knob in v1.** Optional second pass (if ambiguous): `anchor1990[spoken]` *or* `tierMult[mega]` — not both, not in this pass.

**Stealth guardrail (frozen):**

```
POC code may ONLY read demand.* from realismDemand config.
Must NOT modify getSportsBonus, habit reconcile, other-audio relief, or MARKET_BP_PATCH.
```

---

## 5. Experiment design (single pass)

**Hypothesis:**

> Lowering `demand.anchor2026[spoken]` reduces mega Sports lane total @ 2026 by ≥2pt while first-book remains ~0% — proving lane oversizing responds to Demand targets, not Fragmentation-only capture fixes.

**Config sketch (`data/realismDemand.v1.json`):**

```json
{
  "version": 1,
  "poc": "sports-demand-v1",
  "enabled": true,
  "anchor1990": { "legacyMusic": 0.12, "contemporaryMusic": 0.12, "identity": 0.08, "spoken": 0.10 },
  "anchor2026": { "legacyMusic": 0.08, "contemporaryMusic": 0.10, "identity": 0.08, "spoken": 0.05 },
  "tierMult": { "mega": 1.0, "large": 1.0 },
  "inflectionYear": 2000,
  "curveExponent": 1.0
}
```

**Adapter behavior (minimal):** Map year + tier + macro family → target spoken share; apply as bounded multiplier or offset on spoken-lane appeal mass in recalc — **one integration point**, documented in code comment. No per-format tables.

**Harnesses (existing only):**

```bash
npm run diag:share-lane-size-table -- --runs=8
npm run diag:share-lane-demand-provenance
npm run diag:share-lane-ecology-realism    # isolation
npm run diag:share-sac-validation          # isolation
npm run diag:share-laugh-test              # F2 check
```

**Baseline artifacts:** reuse `tmp/share_lane_*_baseline.md` (pre-POC).

---

## 6. Success and falsification

National tier rollups vs baseline. **Mega tier primary gate.**

### Success (Demand-primary @ mega Sports)

| # | Criterion | Threshold |
|---|-----------|-----------|
| S1 | Mega Sports **2026** lane total | ↓ ≥ **2pt** (8.5% → ≤ **6.5%**) |
| S2 | Trajectory not birth | First-book ± **0.5pt**; 2000 or 2010 ↓ ≥ **1.5pt** |
| S3 | Provenance Demand path weakens | Top-3 mechanism mean Δ sum ↓ ≥ **20%** (supporting) |
| S4 | CHR+AC mega 2026 control | \|Δ\| ≤ **1pt** |
| S5 | Not capture-only | S1 passes; F2 does **not** fire |
| S6 | SAC unchanged | `diag:share-sac-validation` ± **10%** |

**Pass if S1 + S2 + S4 + S6 and S5.** S3 supporting.

### Falsification (Demand not primary at anchor surface)

| # | Falsifier | Condition |
|---|-----------|-----------|
| F1 | Lane total immobile | `anchor2026[spoken]` cut ≥20%; mega 2026 ↓ **< 1pt** |
| F2 | Fragmentation-primary | Mega 2026 ↓ **< 1pt** but ecology/laugh **materially** improves |
| F3 | Birth confound | First-book Sports ↑ **≥ 1pt** |
| F4 | Wrong family leak | Rock mega 2026 \|Δ\| **> 2pt** |
| F5 | Control breaks | CHR+AC mega 2026 \|Δ\| **> 2pt** |

**Falsified if F1 or F2.** **Partial if** S1 passes but News/Talk mega 2026 \|Δ\| **> 2pt** (spoken family too coarse).

| Outcome | Classification update |
|---------|----------------------|
| Pass | **Demand-primary (mega)** + Fragmentation co-secondary |
| Partial | **Demand + spoken-family too coarse** |
| F1/F2 | **Fragmentation-primary** (or Demand surface unwired) — no anchor tuning loop |
| Ambiguous | One bounded second pass (`anchor1990[spoken]` only) then re-score |

---

## 7. Non-goals

- Ship / merge without POC score
- Rock Demand, Spanish, News/Talk POCs
- New diagnostics
- Blueprint or Fragmentation edits
- Direct rights/habit/other-audio patches
- Tuning loop on anchor values

---

## 8. Gate

| Step | Activity |
|------|----------|
| 1 | Accept this spec |
| 2 | One implementation pass (`realismDemand.v1.json`, `realismDemand.js`, adapter hook, harness inject) |
| 3 | Run §5 harnesses; archive `tmp/share_lane_*_poc_sports_demand_v1.md` |
| 4 | Score §6; update [REALISM_CHANGELOG.md](./REALISM_CHANGELOG.md) · **stop** |

---

## Change log

| Date | Change |
|------|--------|
| 2026-06-21 | Initial implementation spec (post design review acceptance) |
| 2026-06-21 | **Sports Demand POC v1 executed and scored** — see §9 |

---

## 9. Experiment result (2026-06-21)

**Implementation (uncommitted):** `data/realismDemand.v1.json` (`anchor2026[spoken]` 0.08→0.05); `src/realismDemand.js`; L1 adapter in `appl()`; `scripts/injectRealismDemandCtx.mjs` (Blueprint POC disabled in harness). **No** rights/habit/other-audio/Blueprint/Fragmentation edits.

**Harnesses:** `diag:share-lane-size-table --runs=8`, `diag:share-lane-demand-provenance`, `diag:share-lane-ecology-realism`, `diag:share-sac-validation`, `diag:share-laugh-test` (share+sac).

**Baseline → Sports Demand POC (mega tier, national rollups):**

| Signal | Baseline | POC | Δ | Criterion |
|--------|----------|-----|---|-----------|
| Sports @ 2026 | 8.5% | 5.8% | **−2.7pt** | S1 ≥2pt ↓ — **pass** |
| Sports first-book | 0.0% | 0.0% | 0.0pt | S2 ±0.5pt — **pass** |
| Sports @ 2000 | 5.5% | 5.2% | −0.3pt | S2 ≥1.5pt ↓ — **miss** |
| Sports @ 2010 | 7.4% | 8.4% | **+1.0pt** | S2 ≥1.5pt ↓ — **miss** (wrong direction) |
| Sports @ 2020 | 8.7% | 6.5% | −2.2pt | informational |
| News/Talk @ 2026 | 9.0% | 11.0% | +2.0pt | Partial gate (>2pt) — **borderline** (exactly 2.0) |
| CHR+AC @ 2026 (sum) | 17.6% | 16.2% | −1.4pt | S4 ≤1pt — **marginal miss** |
| CHR @ 2026 | 7.6% | 6.6% | −1.0pt | per-lane OK |
| AC @ 2026 | 10.0% | 9.6% | −0.4pt | per-lane OK |
| Rock @ 2026 | 15.6% | 16.7% | +1.1pt | F4 — **pass** |
| Provenance top-3 Δ sum (Sports mega) | 8.95pt | 6.82pt | −24% | S3 ≥20% — **pass** (supporting) |
| SAC P1→+SAC deltas | unchanged | unchanged | — | S6 — **pass** |

**Falsifiers:** F1 ❌ (lane moved −2.7pt) · F2 ❌ (lane total moved; not capture-only) · F3 ❌ (first-book flat) · F4 ❌ · F5 ❌.

**Verdict:** **Partial — Demand surface is wired, not Demand-primary @ mega Sports.** Anchor cut moved mega Sports @ 2026 by −2.7pt without birth confound, proving the L1 spoken-target adapter reaches lane totals. **S2 trajectory gate failed** (2010 +1.0pt vs baseline; 2000 flat). Provenance still ranks **sports-rights #1**, not L1 cohort appeal — downstream layers remain co-primary. News/Talk co-moved +2.0pt (spoken family coarse; watch for collapse on future cuts). **Not a ship candidate.** **Stop — no anchor tuning.**

**Classification update:** Sports remains **Demand + Fragmentation**; Demand anchor is a **real but insufficient** lever; Fragmentation/rights/habit co-primary for residual mega gap (+2.8pt vs 3.0% target).

**Artifacts:** `tmp/share_lane_size_table_poc_sports_demand_v1.md`, `tmp/share_lane_demand_provenance_poc_sports_demand_v1.md`, `tmp/share_lane_ecology_realism_poc_sports_demand_v1.md`, `tmp/share_sac_validation_poc_sports_demand_v1.md`, `tmp/share_laugh_test_poc_sports_demand_v1.md`.
