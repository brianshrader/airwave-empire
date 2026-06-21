# Realism Scalar Specification — Control Panel (Design Only)

**Status:** Design exercise · **Provisional** (names, ranges, defaults, counts)  
**Frozen inputs:** [REALISM_ARCHITECTURE.md](./REALISM_ARCHITECTURE.md) — triad, four macro families, two tiers, national validation  
**Not in scope:** implementation, tuning, new diagnostics, market/lane/city parameters

**Macro families:** `legacyMusic` · `contemporaryMusic` · `identity` · `spoken`  
**Tiers:** `mega` · `large` (medium/small inherit `large` at implementation time — not a realism parameter)

**Notation:** `[f]` = per family (×4). `[t]` = per tier (×2). `[r]` = per fragmentation regime (×2: `music` · `spoken`).

---

## 1. Parameter inventory

### System 1 — Blueprint (initial lane mass at birth)

| Parameter | Symbol | Count | Range | Default (placeholder) | Owner | Validates via |
|-----------|--------|------:|-------|-------------------------|-------|-----------------|
| Family seed weight (normalized slot budget) | `blueprint.seedWeight[f]` | 4 | 0.05 – 0.45 | 0.25 each | Blueprint | Lane-size · Provenance |
| Tier seed multiplier | `blueprint.tierSeedMult[t]` | 2 | 0.70 – 1.30 | mega 1.00 · large 1.00 | Blueprint | Lane-size · Provenance |
| Max commercial stations per family at seed | `blueprint.maxSlots[f]` | 4 | 0 – 6 | legacy 3 · contemp 2 · identity 1 · spoken 1 | Blueprint | Competitor-supply · Provenance |
| **Blueprint subtotal** | | **10** | | | | |

### System 2 — Demand evolution (lane total over decades)

| Parameter | Symbol | Count | Range | Default (placeholder) | Owner | Validates via |
|-----------|--------|------:|-------|-------------------------|-------|-----------------|
| Demand anchor at era A (1990) | `demand.anchor1990[f]` | 4 | 0.02 – 0.35 | legacy 0.12 · contemp 0.12 · identity 0.08 · spoken 0.10 | Demand | Lane-size |
| Demand anchor at era B (2026) | `demand.anchor2026[f]` | 4 | 0.02 – 0.35 | legacy 0.08 · contemp 0.10 · identity 0.08 · spoken 0.08 | Demand | Lane-size |
| Tier demand multiplier | `demand.tierMult[t]` | 2 | 0.70 – 1.30 | mega 0.90 · large 1.00 | Demand | Lane-size · Provenance |
| Global era inflection year | `demand.inflectionYear` | 1 | 1985 – 2005 | 2000 | Demand | Lane-size |
| Curve shape exponent (shared interpolation) | `demand.curveExponent` | 1 | 0.5 – 2.0 | 1.0 (linear) | Demand | Provenance |
| **Demand subtotal** | | **12** | | | | |

*Demand parameters express **target lane-family share of commercial book** at anchor years. Current L1 appeal / mktFmt / habit / bleed become **implementations** that chase these targets — not separate knobs.*

### System 3 — Fragmentation (split after success)

| Parameter | Symbol | Count | Range | Default (placeholder) | Owner | Validates via |
|-----------|--------|------:|-------|-------------------------|-------|-----------------|
| Lane share threshold to arm fragmentation | `fragmentation.successThreshold` | 1 | 0.06 – 0.18 | 0.12 | Fragmentation | SAC validation · Success-competition |
| Minimum books lane must hold threshold | `fragmentation.minBooks` | 1 | 1 – 4 | 2 | Fragmentation | SAC validation |
| Minimum viable competitors per regime | `fragmentation.minCompetitors[r]` | 2 | 1 – 5 | music 2 · spoken 2 | Fragmentation | Ecology · Competitor-supply |
| Max leader capture of **lane total** per regime | `fragmentation.maxLaneCapture[r]` | 2 | 0.35 – 0.85 | music 0.55 · spoken 0.50 | Fragmentation | Ecology · Laugh test |
| Challenger spawn intensity (events per triggered book) | `fragmentation.challengerRate[r]` | 2 | 0.0 – 1.0 | music 0.5 · spoken 0.6 | Fragmentation | Success-competition · Competitor-supply |
| Cooldown books between forced challengers | `fragmentation.cooldownBooks` | 1 | 0 – 6 | 2 | Fragmentation | SAC validation |
| **Fragmentation subtotal** | | **9** | | | | |

*Regime `music` ← legacyMusic + contemporaryMusic + identity (provisional mapping). Regime `spoken` ← spoken family (provisional; Spanish may split — see ambiguities).*

### Shared (non-realism constants — not tuned)

| Item | Role |
|------|------|
| `REALISM_ERA_A` = 1990 · `REALISM_ERA_B` = 2026 | Anchor years for demand (fixed) |
| Format → macro family lookup table | Data registry, not a scalar (`data/realismFamilies.v1.json` — hypothetical) |
| Reference bands in harnesses | Measurement priors only |

---

## 2. Code ownership map

| System | Authoritative subsystem | Config surface (hypothetical) | Consumes | Must not live in |
|--------|-------------------------|-------------------------------|----------|------------------|
| **Blueprint** | `genMarket()` station/format assignment | `data/realismBlueprint.v1.json` | Tier from `MARKETS[id].rankTier` · family lookup | `appl()` · per-market `MARKET_BP_PATCH` tables · SAC |
| **Demand evolution** | Cohort appeal / recalc mass (`appl()`, `recalc` L1 path) | `data/realismDemand.v1.json` + single loader | Year · tier · family target share | Fragmentation launches · SAC thresholds |
| **Fragmentation** | Success-attracts-competition + scheduled entrant pipeline | `data/realismFragmentation.v1.json` + `successAttractsCompetition.js` | Lane family share · regime · tier | Blueprint slot counts · demand anchors |

**Migration intent (when coding):** replace scattered realism behavior (`MARKET_BP_PATCH`, market `fragmentationLaunches`, ad-hoc mktFmt bonuses) with reads from the three config surfaces above. Medium/small markets read `large` tier multipliers unless proven otherwise.

---

## 3. Validation map

Use **existing** harnesses only — national tier×decade rollups, not city targets.

| System | Primary diagnostic | Secondary diagnostic | Pass signal (conceptual) |
|--------|-------------------|----------------------|--------------------------|
| **Blueprint** | `diag:share-lane-size-table` (1990 / first-book column) | `diag:share-lane-demand-provenance` (`genesisFirstBook`, inflation timing) | First-book family mass moves toward band; provenance shows `initial_seeding` fixes without touching demand/frag |
| **Demand evolution** | `diag:share-lane-size-table` (2000→2026 trajectory) | `diag:share-lane-demand-provenance` (decade trajectory · L1 delta) | Lane totals track anchor curve by family×tier; contemporary control family stable |
| **Fragmentation** | `diag:share-lane-ecology-realism` (capture · fork) | `diag:share-competitor-supply` · `diag:share-success-competition` · `diag:share-sac-validation` · `diag:share-laugh-test` | FRAGMENTATION fork ↓; ≥2% competitor count ↑; leader exceedance ↓ when lane total OK |

**Cross-system proof cases (first implementation candidates):**

| Change | System · Family | Primary validation |
|--------|-----------------|-------------------|
| Rock born too large | Blueprint · legacyMusic | Lane-size 1990 + provenance first-book |
| Sports 0→overshoot | Demand · spoken (+ Fragmentation if capture hot) | Lane-size trajectory + ecology BOTH fork |
| Spanish leader hot | Fragmentation · regime TBD | Ecology FRAGMENTATION + laugh test |
| N/T large lane high | Demand · spoken | Lane-size large tier + ecology DEMAND |

---

## 4. Estimated parameter count

| System | Scalars |
|--------|--------:|
| Blueprint | 10 |
| Demand evolution | 12 |
| Fragmentation | 9 |
| **Total** | **31** |

Plus **one data registry** (format → macro family, ~40 format IDs — not counted as tunable scalars).

Target band discussed in design review was ~15–24; this spec is **31** intentionally explicit (includes `maxSlots` and `curveExponent`). A minimal cut merges `maxSlots` into `seedWeight` (−4 → **27**) and fixes `curveExponent` at 1.0 (−1 → **26**) if implementation pressure requires fewer knobs.

---

## 5. Unresolved ambiguities (provisional until validated)

1. **Identity vs spoken fragmentation for Spanish** — Identity family for Blueprint/Demand; music or spoken regime for Fragmentation? Ecology suggests capture pathology like spoken; lane totals behave like identity.

2. **Legacy music sub-lanes** — Rock and Country share `legacyMusic` but provenance diverges (mega rock = blueprint; large country = blueprint; mega country = demand). One family, two lane behaviors — acceptable if tier×anchor explains it; if not, sub-family split re-expands the surface (explicitly deferred).

3. **Contemporary music as control** — Full demand anchors required (4 params) even though not a failure lane; used to detect global recalc regressions, not player-facing tuning.

4. **Scheduled `fragmentationLaunches` vs SAC** — Today both add stations; spec assumes SAC + challenger rate own **Fragmentation**; market-scheduled launches may be retired or folded into national queue (implementation choice).

5. **Demand implementation locus** — Single `realismDemand` target fed into `appl()` vs continuing to tune mktFmt/cultural/demo piecemeal; architecture says one system, code may need a thin adapter layer.

6. **Recalc pipeline side effects** — Habit reconcile, sports rights, other-audio relief currently move lane totals and capture; spec treats them as **implementations** of Demand and Fragmentation respectively, not extra parameters, until provenance shows independent degrees of freedom.

7. **Tier mapping** — Which `rankTier` values map to `mega` vs `large` for national rollups; medium/small inheritance rule.

8. **Placeholder defaults** — All defaults above are **neutral placeholders**, not calibrated values. First POC (Rock · Blueprint · legacyMusic) calibrates only `blueprint.seedWeight[legacyMusic]` and `blueprint.tierSeedMult[*]` against national harness — not markets.

---

## Governance (unchanged)

Every realism PR: **System · Macro family · Tier** — which knob moved, which diagnostic improved.

**First proof-of-concept (when coding resumes):** Blueprint · legacyMusic · Rock validation path — cleanest provenance, fewest cross-system interactions.
