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
| 2026-06-21 | `ffb369e` | Blueprint | Legacy music | Rock lane oversizing is primarily Blueprint (`legacyMusic` seed mass at birth) | **Pending** | **Pending** |

### ffb369e — Rock Blueprint POC v1 (pending implementation)

- **Spec:** [REALISM_ROCK_BLUEPRINT_POC.md](./REALISM_ROCK_BLUEPRINT_POC.md)
- **Scalars in scope:** `blueprint.seedWeight[legacyMusic]` (required); optional one of `maxSlots[legacyMusic]` or `tierSeedMult[mega]`
- **Untouched:** all `demand.*`, all `fragmentation.*`, other families
- **Harnesses (before/after):** `diag:share-lane-size-table`, `diag:share-lane-demand-provenance`; isolation: `diag:share-lane-ecology-realism`, `diag:share-sac-validation`
- **Score against:** POC §5 success, §6 falsification, §11 classification confidence update
- **Implementation commit:** _TBD_
- **Notes:** _Record national tier rollups only; update this row when scored_

---

## Classification reference (from Rock POC §11)

| Outcome | Classification update |
|---------|-------------------------|
| Success | Rock remains **Blueprint-primary** |
| Partial (birth fixed, 2026 still high) | Rock → **Blueprint + Demand** |
| Failure | **Re-open classification**; Blueprint not primary |
| Ambiguous | **Hold**; one bounded scalar swap, re-score |

---

## Change log (this file)

| Date | Change |
|------|--------|
| 2026-06-21 | Initial changelog; Rock Blueprint POC entry pending |
