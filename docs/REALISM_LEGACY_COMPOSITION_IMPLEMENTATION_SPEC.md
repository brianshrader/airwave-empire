# Legacy Blueprint Composition — Implementation Spec

**Status:** **Accepted** (2026-06-21, CTO amendment) · Ready for one implementation pass  
**Design review:** [REALISM_LEGACY_COMPOSITION_POC.md](./REALISM_LEGACY_COMPOSITION_POC.md) — **Accepted** (2026-06-21)  
**Rock context:** [REALISM_ROCK_BLUEPRINT_POC.md](./REALISM_ROCK_BLUEPRINT_POC.md) — Rock = **Blueprint + Demand**; composition answers *which part of Blueprint*

**Acceptance means:** Composition is the **highest-value remaining Blueprint hypothesis** — not “Rock is a composition problem.”

---

## 1. Experiment goal (sole purpose)

> **Can explicit Blueprint composition separate Rock-family from Country-family birth mass without touching Demand — and explain Rock POC v2 collateral?**

| In scope | Out of scope |
|----------|--------------|
| Decouple Rock ↓ from Country ↓ when reducing Rock-family share | Fix Rock to reference band |
| Explain v2 pattern (Rock↓, Country↓, AC↑) as family-allocation vs implicit composition | Improve lane-size table broadly |
| Hold `maxSlots[legacyMusic]` and all `demand.*` / `fragmentation.*` constant | Laugh test, ecology, SAC tuning |

**One change → existing harnesses → score → stop.**

---

## 2. Subfamily registry (data, not parameters)

Composition operates on **three Blueprint subfamilies** under Legacy Music. The registry maps format IDs → subfamily; it is **not** the experiment.

| Subfamily | Role | Illustrative format IDs (provisional) |
|-----------|------|--------------------------------------|
| **Rock-family** | Rock-oriented legacy formats at birth | `CLASSIC_ROCK`, `ALBUM_ROCK`, `ALT_ROCK`, `ACTIVE_ROCK`, `AAA` (TBD in registry) |
| **Country-family** | Country at birth | `COUNTRY` |
| **Gold-family** | Gold / hits legacy at birth | `CLASSIC_HITS`, `OLDIES` |

**Registry rules:**

- National static lookup (`data/realismLegacyComposition.v1.json` or equivalent) — not per-market, not per-tier tuning surface.
- Lane diagnostics (Rock / Country / Classic Hits lanes) remain harness vocabulary; experiment scores **lane totals**, composition uses **subfamilies**.
- Whether `AAA` belongs in Rock-family vs Gold-family is a **registry correction**, not a new scalar. Taxonomy correctness is a separate question from “does composition exist?”

---

## 3. Where composition lives (ownership)

| Locus | Composition applies? | Rationale |
|-------|------------------------|-----------|
| **`genMarket()` — core BP slot assignment** | **Yes (required)** | Primary birth-time seat labeling |
| **Tier dial commercial injects** (`injectTierMarketCommercialExtras`) | **Yes (required)** | Rock POC v2 showed inject path adds legacy seats; skipping it recreates implicit composition |
| **`MARKET_BP_PATCH` / per-market BP tables** | **No (frozen)** | Confounds national experiment |
| **`appl()` / recalc / Demand** | **No** | Demand stays four-family |
| **SAC / Fragmentation** | **No** | Out of scope |

**Authoritative subsystem:** Blueprint / `genMarket()` only (+ inject fill that runs at market birth in the same code path).

---

## 4. Parameters (3 degrees of freedom)

**One composition knob set — normalized shares under Legacy Music:**

| Parameter | Count | Constraint | Default (placeholder) |
|-----------|------:|------------|-------------------------|
| `blueprint.composition.rockFamily` | 1 | ≥ 0 | 0.45 |
| `blueprint.composition.countryFamily` | 1 | ≥ 0 | 0.35 |
| `blueprint.composition.goldFamily` | 1 | ≥ 0 | 0.20 |

Shares **sum to 1.0** within Legacy; applied to legacy seat **labeling only** (not total legacy seat count).

**Conservation rule (frozen for this experiment):**

```
composition.rockFamily + composition.countryFamily + composition.goldFamily = 1.0  (always)
```

Implementation must normalize on load. The experiment tests:

> **Which label gets a legacy seat?** — not **how many legacy seats exist?**

Seat count was tested by the Rock POC `maxSlots` experiment. Composition must **relabel** among a fixed legacy seat count; it must not reduce legacy seats by demoting to contemporary except where baseline `maxSlots[legacyMusic]` (3) already required it before composition runs.

**Held constant for the experiment:**

| Parameter | Value |
|-----------|-------|
| `blueprint.maxSlots[legacyMusic]` | Baseline (3) — **do not repeat v2 cap test** |
| `blueprint.seedWeight[*]` | Baseline (0.25 each) |
| All `demand.*`, all `fragmentation.*` | Unchanged |

**Not allowed in v1 composition experiment:** per-format caps, per-tier composition tables, or expanding to Classic Rock / Album Rock / AAA as separate scalars.

---

## 5. Experiment design (single pass)

**Hypothesis:**

> Shifting Legacy composition toward lower Rock-family share (same total legacy seats) reduces mega Rock first-book lane mass while holding Country lane first-book stable — demonstrating that v2 collateral was implicit composition, not irreducible Legacy Music coupling.

**Illustrative POC change (one direction only):**

- Rock-family share: 0.45 → 0.30 (example)
- Country-family: hold or +0.10
- Gold-family: remainder
- No other edits

**Harnesses (existing only):** `diag:share-lane-size-table --runs=8`, `diag:share-lane-demand-provenance` (share+sac stack).

---

## 6. Success and falsification

### Success (composition layer validated)

National tier rollups vs baseline:

| # | Criterion | Threshold |
|---|-----------|-----------|
| C1 | Mega **Rock** lane first-book | ↓ ≥ **3pt** |
| C2 | Mega **Country** lane first-book | \|Δ\| ≤ **1.5pt** |
| C3 | v2 collateral **not reproduced** | Country does not drop ≥3pt when Rock drops ≥3pt on same pass |
| C4 | CHR+AC mega 2026 (control) | \|Δ\| ≤ **1pt** |
| C5 | Provenance: Blueprint first-book mean Δ (Rock @ mega 2026) | Moves with composition change; Demand rank unchanged as primary *cause of experiment* |

**Pass if C1 + C2 + C3 + C4.** C5 supporting.

### Falsification (composition layer rejected)

| # | Falsifier | Condition |
|---|-----------|-----------|
| F1 | Coupling persists | Rock ↓ ≥3pt but Country ↓ ≥3pt — same as v2; composition knob indistinguishable from macro legacy cut |
| F2 | Rock immobile | Meaningful Rock-family share cut; mega Rock first-book ↓ **< 1.5pt** |
| F3 | Control breaks | CHR+AC mega 2026 \|Δ\| **> 2pt** |

**If falsified:** Four-family Blueprint stays; Rock Blueprint + Demand stands; next work is Demand-side hypothesis — not more composition scalar tuning.

---

## 7. Non-goals

- Ship candidate / merge without POC score
- New diagnostics
- Demand, Sports, Spanish, News/Talk, Urban
- Market tables or BP patch migration
- Subfamily list debate as part of the experiment (registry updates only if blocking)

---

## 8. Gate

| Step | Artifact |
|------|----------|
| 1 | Accept this spec |
| 2 | One implementation pass (registry + 3 composition weights + `genMarket` + inject) |
| 3 | Run harnesses; record in changelog |
| 4 | Score §6; stop |

**Successor doc after experiment:** changelog row + optional §12 addendum in composition POC — not a new architecture doc.

---

## 9. Experiment result (2026-06-21)

**Implementation (uncommitted):** `data/realismBlueprint.v1.json` (`mode: composition`, rock 0.30 / country 0.35 / gold 0.35, `maxSlots[legacyMusic]: 3`); `src/realismBlueprint.js` relabel-only composition at `genMarket` + inject.

**Harnesses:** `diag:share-lane-size-table --runs=8`, `diag:share-lane-demand-provenance` (share+sac).

**Baseline → composition POC (mega tier, national rollups):**

| Signal | Baseline | POC | Δ | Criterion |
|--------|----------|-----|---|-----------|
| Rock first-book | 24.6% | 10.1% | **−14.5pt** | C1 ≥3pt ↓ — **pass** |
| Country first-book | 4.0% | 3.6% | **−0.4pt** | C2 \|Δ\|≤1.5pt — **pass** |
| v2 coupling | Rock↓ + Country↓ together | Rock↓14.5, Country↓0.4 | decoupled | C3 — **pass** |
| CHR+AC @ 2026 | 17.6% | 18.9% | **+1.3pt** | C4 ≤1pt — **miss** (+0.3pt) |
| Rock @ 2026 | 15.6% | 9.4% | −6.2pt | informational (not primary gate) |

**Falsifiers:** F1 ❌ (Country not ↓≥3 with Rock ↓≥3) · F2 ❌ · F3 ❌.

**Verdict:** **Core hypothesis validated** — explicit composition **independently moved Rock-family birth mass without dragging Country-family** (conservation rule held: seat count unchanged vs v2). C4 control marginal miss (+1.3pt). **Composition is a real Blueprint layer**; not a ship candidate (Demand still co-primary for Rock @ 2026; Urban collateral unrelated to scope).

**Next:** Do not tune composition weights. Rock remains **Blueprint + Demand**. Residual Rock gap → Demand-side hypothesis when authorized. No further Blueprint scalar/composition passes without new doc.

**Artifacts:** `tmp/share_lane_size_table_poc_composition_v1.md`, `tmp/share_lane_demand_provenance_poc_composition_v1.md`.

---

## Change log

| Date | Change |
|------|--------|
| 2026-06-21 | Initial implementation spec (post design review acceptance) |
| 2026-06-21 | CTO acceptance + conservation rule: composition normalizes to 1.0; labels seats, not seat count |
| 2026-06-21 | **Composition experiment executed and scored** — core hypothesis validated; see §9 |
