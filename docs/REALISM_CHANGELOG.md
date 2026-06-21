# Realism Changelog — Institutional Memory

**Purpose:** Record every realism experiment derived from [REALISM_ARCHITECTURE.md](./REALISM_ARCHITECTURE.md). One pass per entry. No tuning loops without a new hypothesis document.

**Framework (frozen — no new architecture docs):**

| Layer | Document |
|-------|----------|
| Constitution | [REALISM_ARCHITECTURE.md](./REALISM_ARCHITECTURE.md) |
| Control panel | [REALISM_SCALAR_SPEC.md](./REALISM_SCALAR_SPEC.md) |
| Experiment spec | [REALISM_ROCK_BLUEPRINT_POC.md](./REALISM_ROCK_BLUEPRINT_POC.md) (and successors) |

**Governance:** Each entry names **System · Family · Hypothesis · Result · Classification change**. Markets are validation notes only — not diagnosis.

**Discipline:** Implement once → run existing harnesses → score → record → stop. No run/tweak/run cycles on the same hypothesis.

---

## Experiments

| Date | Commit | System | Family | Hypothesis | Result | Classification change |
|------|--------|--------|--------|------------|--------|-------------------------|
| 2026-06-21 | `ffb369e` | Blueprint | Legacy music | Rock lane oversizing is primarily Blueprint at birth | **Not Success** (v1+v2) | **Blueprint + Demand** · Blueprint composition unresolved · no code commit |

**Rock (current working classification):** Blueprint + Demand. Blueprint birth is a confirmed mega-Rock lever (`maxSlots`, not `seedWeight`). Residual 2026 gap is Demand-side. **`legacyMusic` macro family too coarse** for Blueprint — need subfamily composition (Rock / Country / Classic Hits) before further Rock Blueprint implementation.

**Next authorized work:** New hypothesis doc for Legacy Music **subfamily Blueprint composition** — not scalar tweaking, not market tables, not Demand/Fragmentation until scored.

### ffb369e — Rock Blueprint POC v1 (scored 2026-06-21)

- **Spec:** [REALISM_ROCK_BLUEPRINT_POC.md](./REALISM_ROCK_BLUEPRINT_POC.md) · **§11.1**
- **Scalars changed:** `blueprint.seedWeight[legacyMusic]` 0.25 → 0.17 only
- **Outcome:** **Ambiguous (Hold)** — mega birth −2.5pt; S1–S3 missed; large Rock flat/up; Country collateral large
- **Artifacts:** `tmp/share_lane_size_table_poc_v1_seedweight.md`, `tmp/share_lane_demand_provenance_poc_v1_seedweight.md`

### Rock Blueprint POC v2 — maxSlots second pass (scored 2026-06-21)

- **Spec:** [REALISM_ROCK_BLUEPRINT_POC.md](./REALISM_ROCK_BLUEPRINT_POC.md) · **§11.2**
- **Scalars changed:** `blueprint.maxSlots[legacyMusic]` 3 → 2 only; seedWeight restored to 0.25
- **Untouched:** all `demand.*`, all `fragmentation.*`, `tierSeedMult`, other families
- **Implementation (uncommitted — not candidate fix):** same surface as v1; `realismBlueprint.js` refactored to cap by `maxSlots`
- **Harnesses:** `diag:share-lane-size-table --runs=8`, `diag:share-lane-demand-provenance`
- **Key deltas vs baseline:** mega Rock first-book 24.6→13.3% (−11.3pt, S1 pass); mega 1990 22.9→15.7% (−7.2pt); mega 2026 15.6→11.8% (−3.8pt); large 2026 12.2→10.7% (−1.5pt); Blueprint mean Δ mega −68%; CHR+AC mega 2026 +1.2pt (S5 miss); large AC 1990 +8.2pt collateral
- **Outcome:** Birth hypothesis **validated on mega** via slot cap; full POC **not Success** (S5, large 1990); provenance rank-1 @ mega 2026 → habit not Blueprint
- **Classification:** **Blueprint + Demand**; sub-family composition refinement needed before Rock Blueprint implementation
- **Artifacts:** `tmp/share_lane_size_table_poc_v2_maxSlots.md`, `tmp/share_lane_demand_provenance_poc_v2_maxSlots.md`

---

## Classification reference (from Rock POC §11)

| Outcome | Classification update |
|---------|-------------------------|
| Success | Rock remains **Blueprint-primary** |
| Partial (birth fixed, 2026 still high) | Rock → **Blueprint + Demand** |
| Failure | **Re-open classification**; Blueprint not primary |
| Ambiguous | **Hold**; one bounded scalar swap, re-score |

---

## Process notes

Institutional memory from the first completed experiment cycle — the **process result**, not parameter values.

### What the old path looked like (avoid)

Rock too big → lower Rock → Country breaks → raise Country → Phoenix weird → Phoenix exception → Houston weird → Houston exception → six months later nobody remembers why anything exists.

### What happened instead (2026-06-21)

Hypothesis → isolate one system → change one thing → measure → document → **stop**. Experimental code not merged; knowledge preserved in docs and harness artifacts (`6bf6293`).

### Structural insight (Rock Blueprint POC)

| Lever | Mega Rock first-book | Implication |
|-------|---------------------|-------------|
| `seedWeight[legacyMusic]` 0.25→0.17 | −2.5pt | Not primarily “too much legacy mass budget” |
| `maxSlots[legacyMusic]` 3→2 | **−11.3pt** | **Too many legacy-format seats at birth** |

Markets became Rock-heavy because the blueprint kept assigning Rock-family chairs before evolution — Blueprint pathology (seat count / composition), not stations winning share over decades.

### Why Blueprint + Demand is the right classification

| If purely… | Predicted | Observed |
|------------|-----------|----------|
| **Blueprint** | First-book fix ≈ fixes 2026 | First-book dropped; 2026 gap remains (habit/evolution rank-1) |
| **Demand** | Blueprint touches barely move birth | v2 moved birth dramatically |

Both narratives partially true; neither alone survives one isolated change. That is how the triad should behave.

### Next design gate (not tuning)

> Can Blueprint remain national and whack-a-mole resistant while distinguishing Rock, Country, and Classic Hits composition inside Legacy Music?

Macro family for **Demand** may stay Legacy Music. **Blueprint** may need a sub-layer. That is taxonomy refinement, not architecture failure.

**Explicitly deferred:** Demand work “because Rock is Blueprint + Demand.” Blueprint composition must be answered first.

---

## Change log (this file)

| Date | Change |
|------|--------|
| 2026-06-21 | Initial changelog; Rock Blueprint POC entry pending |
| 2026-06-21 | Rock Blueprint POC v1 scored — **Ambiguous (Hold)**; see experiment row |
| 2026-06-21 | Rock Blueprint POC v2 scored — **Not Success**; reclassified **Blueprint + Demand**; see §11.2 |
| 2026-06-21 | CTO verdict recorded — composition too coarse; experimental code not shipped; see POC §11.3 |
| 2026-06-21 | Process notes added — structural insight, experiment discipline, next design gate |
