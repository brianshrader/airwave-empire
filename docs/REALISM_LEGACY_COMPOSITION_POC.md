# Legacy Blueprint Composition — Design Review (Hypothesis Document)

**Status:** **Design review accepted** (2026-06-21) · Composition is the **next question worth testing** — not proven as the answer  
**Next artifact:** [REALISM_LEGACY_COMPOSITION_IMPLEMENTATION_SPEC.md](./REALISM_LEGACY_COMPOSITION_IMPLEMENTATION_SPEC.md)  
**Question under review:** Is **Blueprint composition** a separate concept from **Blueprint family allocation**?  
**Predecessor:** [REALISM_ROCK_BLUEPRINT_POC.md](./REALISM_ROCK_BLUEPRINT_POC.md) (v1+v2 executed; not a ship candidate)  
**Architecture:** [REALISM_ARCHITECTURE.md](./REALISM_ARCHITECTURE.md) · **Scalars:** [REALISM_SCALAR_SPEC.md](./REALISM_SCALAR_SPEC.md)

This document decides **whether a national Legacy Music composition layer is worth an experiment** — before any implementation, new diagnostics, or Demand/Sports/Spanish/News-Talk work.

---

## 1. Why this document exists

Rock Blueprint POC v1+v2 did not produce a merge candidate. It **did** produce a structural read:

| Lever | Mega Rock first-book | Read |
|-------|---------------------|------|
| `seedWeight[legacyMusic]` | −2.5pt | Family **weight** is not the primary birth lever |
| `maxSlots[legacyMusic]` | **−11.3pt** | Family **seat count** is |

v2 collateral (national tier rollups vs baseline):

| Lane | Signal | Interpretation |
|------|--------|----------------|
| Rock | Down (mega birth −11.3pt) | Intended direction |
| Country | Down sharply (large 1990: 11.8% → 2.1%) | Same family bucket — collateral |
| AC | Up (large 1990: +8.2pt) | Demoted legacy seats → contemporary replacement formats |

**The experiment was not really about Rock.** It exposed hidden **composition** inside the blueprint: lowering *legacy seats* moved Rock and Country together and pushed mass into AC. That is exactly what should happen if birth allocation treats **Rock-family**, **Country-family**, and **Gold-family** seats as interchangeable legacy chairs.

Rock classification after Rock POC: **Blueprint + Demand**, with **Blueprint composition unresolved** ([Rock POC §11.3](./REALISM_ROCK_BLUEPRINT_POC.md)).

---

## 2. The architecture question

### 2.1 Current model (four macro families everywhere)

```
Blueprint   ──►  Legacy · Contemporary · Identity · Spoken
Demand      ──►  Legacy · Contemporary · Identity · Spoken
Fragmentation ─►  music / spoken regimes (mapped from families)
```

Rock POC suggests **one hierarchy may not fit all three systems**.

### 2.2 Proposed split (hypothesis — not approved)

```
Blueprint family allocation (unchanged count at top):
  Legacy Music · Contemporary Music · Identity · Spoken

Blueprint composition (new layer, Legacy only — **subfamilies, not simulation lanes**):
  Legacy Music
    ├─ Rock-family    (registry maps format IDs — taxonomy TBD separately)
    ├─ Country-family
    └─ Gold-family    (Classic Hits / Oldies / gold-oriented legacy)

Demand + Fragmentation (unchanged):
  Legacy Music · Contemporary · Identity · Spoken
```

**Composition** = *which legacy sub-lane gets each legacy seat at `genMarket`*  
**Family allocation** = *how many total seats each macro family gets*

These are different questions:

| Question | Example knob (illustrative) | Rock POC lesson |
|----------|----------------------------|-----------------|
| How many **Legacy Music** seats? | `maxSlots[legacyMusic]` | Moves all legacy lanes together |
| How many **Rock-family** vs **Country-family** vs **Gold-family** seats *within* Legacy? | `composition.rockFamily` (hypothetical) | Required to fix Rock without crushing Country |

---

## 3. Core hypothesis

> National **Blueprint composition** can distinguish Rock-family, Country-family, and Gold-family birth allocation **without** splitting the four-family model for **Demand evolution** or **Fragmentation** — and without per-market tables.

If true: Rock POC v2 collateral is explained; next experiment is well-scoped; anti-whack-a-mole discipline holds.  
If false: four-family Blueprint stays as-is; Rock work waits on Demand evolution or accepts coarse legacy tradeoffs.

---

## 4. Explaining v2 collateral (design success criterion #1)

v2 reduced `maxSlots[legacyMusic]` from 3 → 2. Implementation demoted **tail legacy blueprint rows** to contemporary formats (HOT_AC / ADULT_CONTEMP) without distinguishing Rock vs Country vs Classic Hits.

**Predicted collateral if composition is the hidden variable:**

| Observation | v2 actual | Explained? |
|-------------|-----------|------------|
| Rock first-book down | Yes (−11.3pt mega) | Yes — fewer legacy seats |
| Country first-book down ≥ Rock relative hit | Yes (large 1990 Country −9.7pt vs Rock mixed) | Yes — Country is legacy-formatted at birth |
| AC up where demoted slots land | Yes (large 1990 AC +8.2pt) | Yes — replacement fmt is contemporary |
| Contemporary control (CHR+AC mega 2026) within 1pt | No (+1.2pt) | Partial — demotion path is blunt |
| Urban / Sports / Spanish unchanged by design | Mostly yes | Yes — other families untouched |

**Conclusion for this document:** v2 collateral is **coherent evidence** that the blueprint conflates *legacy seat count* with *legacy subformat mix*. A composition layer is a **plausible** explanation — not yet proven as the *right* fix.

---

## 5. National composition rule (design success criterion #2)

### 5.1 Acceptable shape

A composition model must be expressible as **one national rule** (tier-aware allowed; market-specific forbidden):

**Illustrative forms (pick one in implementation spec — not decided here):**

| Form | Example | Parameters (illustrative) |
|------|---------|---------------------------|
| **Normalized shares** | Legacy seats split Rock-family / Country-family / Gold-family | 3 composition weights summing to 1.0 |
| **Per-subfamily caps** | caps on each subfamily | 3 caps ≤ `maxSlots[legacyMusic]` |
| **Priority fill order** | Fill Country-family first, then Rock-family, then Gold-family | Ordered list + caps |

All forms share: **national**, **tier-scoped at most**, **no `MARKETS[id].rockBias`**.

### 5.2 Whack-a-mole resistance test

| Allowed | Forbidden |
|---------|-----------|
| “Mega legacy composition skews Rock-heavy at birth” | “Houston needs fewer Rock slots” |
| “Large tier allocates more Country within Legacy” | “Phoenix Country table” |
| Tier × composition interaction (2 tiers × 3 subfamilies) | Market × lane parameter grid |

Parameter count stays bounded: composition adds **O(subfamilies under Legacy)** at Blueprint only — not × markets.

### 5.3 Mapping to format IDs (registry, not tuning)

Blueprint composition operates on **subfamily buckets**, not simulation lanes. Exact format ID → subfamily mapping is **registry data** ([FORMAT_FAMILY_ARCHITECTURE.md](./FORMAT_FAMILY_ARCHITECTURE.md)), not experiment parameters. Whether AAA belongs in Rock-family vs Gold-family is a registry question — separate from “does composition exist?”

---

## 6. What stays four-family (design success criterion #3)

| System | Grouping | Rationale |
|--------|----------|-----------|
| **Demand evolution** | Legacy Music macro | Listening cohorts aggregate over decades; provenance already treats legacy trajectory as macro |
| **Fragmentation** | music / spoken regimes | Competitor structure after success; no Rock POC evidence that split belongs at birth-composition granularity |
| **Contemporary / Identity / Spoken Blueprint** | Unchanged | Rock POC scoped Legacy only; no evidence to subdivide Urban/Spanish or CHR/AC at birth |

**Demand is not next.** Dual classification (Blueprint + Demand) describes Rock **after** composition is resolved — not permission to tune `demand.anchor*` while composition is still open.

---

## 7. Relationship to existing Blueprint scalars

Rock POC tested macro-family knobs:

| Scalar | Layer | v2 lesson |
|--------|-------|-----------|
| `blueprint.seedWeight[legacyMusic]` | Family allocation | Weak lever for Rock |
| `blueprint.maxSlots[legacyMusic]` | Family allocation (seat count) | Strong but indiscriminate |

Composition would add a **sibling layer under Legacy**, not replace four-family allocation:

```
maxSlots[legacyMusic]     → total legacy chairs
composition.*             → how chairs are labeled Rock-family / Country-family / Gold-family
seedWeight[legacyMusic]   → may remain weak; revisit after composition exists
```

**Design rule:** Do not add composition *and* retune macro `seedWeight` in the same experiment pass.

---

## 8. Document acceptance criteria (design review — scored 2026-06-21)

| # | Criterion | Verdict | Notes |
|---|-----------|---------|-------|
| D1 | Explains v2 collateral as composition/conflation | ✅ | Strongest section — Rock↓, Country↓, AC↑ = seat allocation + implicit composition |
| D2 | Stays national; no market tables | ✅ | |
| D3 | Preserves four-family Demand and Fragmentation | ✅ | Prevents architecture sprawl |
| D4 | Bounded parameter surface | ✅ | Adds hierarchy, not a fourth realism system |
| D5 | No implementation disguised as design | ✅ | |
| D6 | Falsifiable next experiment | ✅ | See implementation spec §6 |

**Design review: Accepted.** Composition is the **next question worth testing** — not proof that composition is the answer. v2 revealed a **hidden variable**; subfamily labels (Rock-family / Country-family / Gold-family) are provisional registry buckets, not the experiment itself.

**Document fails** if reviewers had concluded composition folds into macro `maxSlots` / `seedWeight` without a new layer — **family model stays as-is** for Blueprint. That case did not apply.

---

## 9. Future implementation gate

**Authorized:** [REALISM_LEGACY_COMPOSITION_IMPLEMENTATION_SPEC.md](./REALISM_LEGACY_COMPOSITION_IMPLEMENTATION_SPEC.md) — registry, ownership, 3 composition parameters, experiment success criteria. **No code until spec is accepted.**

Hypothesis for the **next** experiment (detail in implementation spec):

> Adjusting **Blueprint composition** (Rock-family vs Country-family vs Gold-family national allocation) reduces **Rock lane first-book** mass without **Country lane** collateral beyond threshold — holding `maxSlots[legacyMusic]` and all Demand/Fragmentation scalars constant.

**Harnesses:** existing only — `diag:share-lane-size-table`, `diag:share-lane-demand-provenance` (same stack as Rock POC).

**One pass · score · stop.**

---

## 10. Explicit non-goals

- Implementation or prototype code
- New diagnostics or harnesses
- Demand evolution work (“Rock is Blueprint + Demand” is not a Demand green light)
- Sports, Spanish, News/Talk, Urban lane POCs
- Per-market composition tables or BP patch migration plan
- Merging Rock POC experimental code (`realismBlueprint.js`, etc.)
- Tuning `seedWeight` / `maxSlots[legacyMusic]` further without composition

---

## 11. Decision outcomes

| Outcome | Action |
|---------|--------|
| **Design accepted** | Implementation spec → **one** composition experiment → score → stop |
| **Design rejected** | Keep four-family Blueprint; Rock remains Blueprint + Demand at macro granularity; next work is Demand-side hypothesis doc, not composition |
| **Design ambiguous** | One bounded revision (e.g. caps vs normalized shares only); re-review; still no code |

---

## 12. Standard going forward

Rock POC validated the **process** and the **triad prediction**:

| Before experiment | After experiment |
|-------------------|------------------|
| Rock probably **Blueprint + Demand** | Rock **Blueprint + Demand** |

Success = framework correctly anticipated **which system moves first** when isolated — not “numbers got better.”

Composition POC design uses the same standard: decide whether the next experiment is worth running **before** writing code.

---

## Change log

| Date | Change |
|------|--------|
| 2026-06-21 | Initial Legacy Blueprint composition design review |
| 2026-06-21 | **Design review accepted** (D1–D6); subfamily terminology Rock-family / Country-family / Gold-family |
