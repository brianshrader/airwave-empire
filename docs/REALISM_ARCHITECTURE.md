# Realism Architecture — Frozen (Share / Lane Ecology)

**Status:** Approved · **Frozen** (architecture only)  
**Scope:** National share realism — lane mass, evolution, and competitor structure  
**Branch context:** Share compression / SAC research (`prototype/share-compression-phase1` and successors)

This document freezes **how we diagnose and change realism**. It does not freeze parameter values, scalar counts, or family-to-regime mappings — those remain **implementation hypotheses** until validated by national harnesses.

**Related (separate concerns):**

- [FORMAT_FAMILY_ARCHITECTURE.md](./FORMAT_FAMILY_ARCHITECTURE.md) — format taxonomy and lifecycle lanes
- Diagnostic harnesses under `scripts/diag-share-*` — measurement only; not tuning targets
- Provenance audit: `tmp/share_lane_demand_provenance.md` (evidence that led to this architecture)

---

## 1. The realism triad (frozen)

All national share realism issues classify into exactly three systems:

| System | Question |
|--------|----------|
| **1. Blueprint** | How much of each format family exists when the market is born? |
| **2. Demand evolution** | How much total audience should this family command as decades pass? |
| **3. Fragmentation** | Once a lane becomes successful, how many meaningful competitors appear (and how is share split)? |

**Examples (diagnostic, not prescriptions):**

- Rock starts too large → **Blueprint**
- Sports grows too much over decades → **Demand evolution**
- Mega Urban grows when it should shrink → **Demand evolution**
- Spanish / News/Talk leaders too hot with too few ≥2% competitors → **Fragmentation**
- Sports starts at zero, then overshoots lane total and capture → **Demand evolution** + **Fragmentation**

### 1.1 Governance rule (frozen)

**Every realism change proposal must open with:** *Which of the three systems is wrong?*

| Acceptable | Not acceptable |
|------------|----------------|
| “Blueprint is wrong for legacy music at mega tier.” | “Houston feels wrong.” |
| “Fragmentation is wrong for spoken lanes.” | “NYC Spanish is 16%.” |
| “Demand evolution is wrong for the Identity family post-2000.” | “Fix Phoenix Country.” |

Markets are **validation**, not **diagnosis** (see §4).

### 1.2 What is not a fourth system

These map **into** the triad or are out of scope:

| Issue | Classification |
|-------|----------------|
| Wrong stations / formats at `genMarket` | **Blueprint** |
| Lane total wrong for era/tier | **Demand evolution** (includes L1 appeal, bleed, habit, and other recalc effects on **aggregate lane share** — implementation of demand, not a separate pillar) |
| Too few stations, leader too hot, capture too high | **Fragmentation** (includes SAC, launch sequencing, rights stacking on **split**, etc.) |
| Book doesn’t sum, AQH collapse, sanitize | **Infrastructure** (correctness) |
| Player vs AI behavior | **Gameplay** |
| Public / noncommercial skew | **Demand evolution** adjacency (denominator / mass accounting), not a fourth realism system |

**Design-review test:** If a change doesn’t start with Blueprint, Demand, or Fragmentation, ask: *Is this realism, infrastructure, or gameplay?* Only realism must pick a system.

---

## 2. Macro families (frozen count; mappings provisional)

Realism is parameterized at **four macro families**, not six lanes and not per-market tables:

| Macro family | Typical lane members (illustrative) |
|--------------|----------------------------------------|
| **Legacy music** | Rock, Country, Classic Hits / Oldies |
| **Contemporary music** | CHR, AC, Hot AC, Rhythmic (non-urban) |
| **Identity** | Urban, Spanish |
| **Spoken** | News/Talk, Sports, Personality |

Contemporary music acts as a **control family**: if contemporary tracks national bands while legacy/identity/spoken do not, the bug is family-scoped, not global recalc.

**Frozen:** four families exist as the realism grouping layer.  
**Provisional:** exact format→family assignments, subformat splits, and whether a lane uses one family for Blueprint/Demand and another for Fragmentation (e.g. Identity demand vs spoken fragmentation) — to be validated during implementation, not frozen here.

---

## 3. Tiers (frozen)

Realism distinguishes **two tiers** only at the national layer:

| Tier | Role |
|------|------|
| **Mega** | Largest markets (national rollup) |
| **Large** | Next tier (national rollup) |

**Frozen:** realism parameters may vary by tier (e.g. tier scalers on blueprint or demand).  
**Provisional:** exact tier definitions in code (`rankTier` mapping), tier-specific multiplier values, and whether medium/small tiers inherit large rules — implementation detail.

No **per-market** realism offsets. Tier is the only geographic stratification for realism parameters.

---

## 4. Markets are validation, not diagnosis (frozen)

Manual playtests and individual market saves are **spot checks** that generalized national rules did not break edge cases.

**Acceptable use of markets:**

- Confirm a national rule doesn’t produce absurd outliers
- Regression spot-check after a triad-scoped change

**Unacceptable use:**

- Tuning targets (“make NYC Spanish 10%”)
- Diagnosis (“Houston is wrong” without naming Blueprint / Demand / Fragmentation)
- Parameter surfaces that encode market-specific constants

---

## 5. National validation methodology (frozen)

Realism work is accepted or rejected using **aggregated national harnesses**, not city scorecards.

### 5.1 Primary signals

| Signal | What it measures | System hint |
|--------|------------------|-------------|
| **Lane-size table** | Tier × decade **lane totals** vs reference bands | Blueprint (birth / 1990) · Demand (trajectory) |
| **Lane demand provenance** | When inflation appears; layer attribution on frozen books | Confirms which system to touch |
| **Lane ecology realism** | Lane total vs **capture** vs ≥2% competitor count | Demand vs **Fragmentation** fork |
| **Laugh test** | Leader exceedance (e.g. 15%+) | Often **Fragmentation** when lane total is OK |

### 5.2 Fork vocabulary (frozen)

From ecology diagnostics:

| Fork | Meaning |
|------|---------|
| **DEMAND** | Lane **total** mass wrong |
| **FRAGMENTATION** | Lane total near OK; **capture** / competitor structure wrong |
| **BOTH** | Lane total and split both wrong |

### 5.3 Pass criteria (conceptual)

A triad-scoped change is candidate-ready when, **nationally**:

- Oversized lanes move toward tier×decade bands without per-market patches
- Provenance timing matches the system changed (e.g. Rock first-book ↓ after Blueprint work; Sports trajectory ↓ after Demand work)
- Ecology **FRAGMENTATION** cells decrease for spoken/identity lanes where that was the diagnosed fork
- Contemporary music control family remains stable when changing legacy/identity/spoken

Reference bands in harnesses are **Nielsen/Duncan-shaped priors for measurement**, not product targets to hit by city.

### 5.4 Harness commands (reference)

```bash
npm run diag:share-lane-size-table
npm run diag:share-lane-demand-provenance
npm run diag:share-lane-ecology-realism
npm run diag:share-laugh-test
```

Quick variants (`:quick`) are for iteration; full runs gate merges.

---

## 6. Provenance anchors (evidence; not frozen values)

These guide **which system to touch first** — not parameter numbers:

| Lane | Clean signal | Primary system(s) |
|------|--------------|---------------------|
| **Rock** | Born too large (~2–3× band at first book); decays but stays high | **Blueprint** (+ Demand decay rate) |
| **Sports** | Starts at **zero**; lane appears ~2000+; then overshoots | **Demand evolution** + **Fragmentation** |
| **Spanish** | National lane total often near band; leader/capture fails | **Fragmentation** (+ blueprint entry timing) |
| **News/Talk** | Large tier lane total high; mega capture often high | **Demand evolution** + **Fragmentation** |
| **Urban** | Mega seeded high and **rises** while reference falls | **Blueprint** + **Demand evolution** |
| **Country** | Large seeded high; mega grows from thin start | **Blueprint** + **Demand evolution** |

**Cross-contamination rule:** Do not fix Rock via Sports/fragmentation. Do not fix Sports via Rock blueprint.

---

## 7. Implementation hypotheses (provisional — not frozen)

The following are **starting hypotheses** for implementation. They may change after national validation.

### 7.1 Parameter surface (provisional)

A minimal national surface might bundle:

- **Blueprint:** family seed weights + tier seed multipliers
- **Demand evolution:** family demand anchors at era endpoints + shared era interpolation + tier demand multipliers
- **Fragmentation:** success threshold, min competitors, max capture, fragmentation rate — possibly split by **music vs spoken regime**

**Not frozen:** exact scalar count (~15–24 was a design-review estimate), names, bounds, or code ownership (`genMarket` vs `appl()` vs SAC).

### 7.2 Family / regime mappings (provisional)

- Whether Spanish uses Identity family for demand and spoken regime for fragmentation is **hypothesis**, not policy.
- Per-lane curves, per-market tables, and lane-specific simulation modules are **explicitly out of scope** unless provenance shows the triad cannot explain a failure.

### 7.3 Suggested implementation order (when coding resumes)

1. **Blueprint** — Legacy music (Rock proof: born too large)
2. **Demand evolution** — Spoken (Sports proof: zero → grow)
3. **Fragmentation** — spoken-regime candidates (Spanish / News/Talk proof: capture)

Each PR must state: **System · Family · Tier** — not market name.

---

## 8. One-sentence architecture

**National realism is three systems — Blueprint, Demand evolution, and Fragmentation — parameterized by four macro families and two tiers, validated nationally; markets spot-check, they do not steer.**

---

## 9. Change log

| Date | Change |
|------|--------|
| 2026-06-21 | Initial freeze: triad, governance rule, four families, two tiers, national validation methodology |
