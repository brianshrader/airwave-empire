# Rock Blueprint POC — Design Review (Hypothesis Document)

**Status:** POC v1 + v2 executed · **Not a successful POC** · final classification **Blueprint + Demand** · see §11.1–§11.2  
**Hypothesis under test:** Mega and large **Rock lane oversizing is primarily a Blueprint problem** (`legacyMusic` family at market birth).  
**Architecture:** [REALISM_ARCHITECTURE.md](./REALISM_ARCHITECTURE.md) · **Scalars:** [REALISM_SCALAR_SPEC.md](./REALISM_SCALAR_SPEC.md)

This document defines **what would be changed**, **what must not move**, **success criteria**, and **falsification criteria** before any production work. It is a scientific test of whether the triad framework is **predictive**, not merely descriptive.

---

## 1. Current evidence (baseline)

National harness (`share+sac`, 8 runs/market, tier rollups):

| Signal | Mega Rock | Large Rock |
|--------|-----------|------------|
| First-book lane total | ~24.6% | ~20.9% |
| 1990 lane total | ~22.9% (+10.9pt vs band) | ~19.8% (+8.8pt) |
| 2026 lane total | ~15.6% (+7.6pt) | ~12.2% (+2.2pt) |
| Inflation timing | `initial_seeding` + `market_evolution` | Same |
| Top provenance mechanism @ 2026 | Blueprint first-book mass (HIGH) | Blueprint first-book mass (HIGH) |
| Ecology fork | Lane-total / **DEMAND** (not capture-primary) | Same |

**Interpretation:** Rock is **born too large**, stays large in 1990, decays slowly but remains above band. Not primarily a fragmentation/capture pathology.

---

## 2. Hypothesis

> Reducing **Blueprint** parameters for the **`legacyMusic`** macro family will reduce **Rock lane totals** at first book and 1990 **nationally** (mega and large rollups), with **minimal collateral movement** in contemporary music (control family), spoken lanes, or fragmentation diagnostics — **without** changing Demand or Fragmentation scalars.

If true: Blueprint ownership and validation methodology are credible; Rock POC validates the architecture.  
If false: Rock classification must be revised before Sports, Spanish, or News/Talk work proceeds.

---

## 3. Scalars in scope

### 3.1 Modified (Blueprint · `legacyMusic` only)

| Scalar | POC intent | Direction (qualitative) | Rationale |
|--------|------------|-------------------------|-----------|
| `blueprint.seedWeight[legacyMusic]` | Primary knob | **Decrease** | Directly reduces legacy-music share of commercial blueprint slots at `genMarket` |
| `blueprint.maxSlots[legacyMusic]` | Secondary knob (if implemented) | **Decrease** | Caps rock/country/oldies station count at birth; use only if seedWeight alone insufficient |

**Optional tier interaction (same POC, still Blueprint):**

| Scalar | POC intent | Direction | Note |
|--------|------------|-----------|------|
| `blueprint.tierSeedMult[mega]` | Tertiary, if mega remains hot after family weight cut | **Decrease** (< 1.0) | Tests tier-scoped blueprint without touching large tier |

**POC rule:** Change **at most two** Blueprint scalars in the first implementation pass (`seedWeight[legacyMusic]` required; one of `maxSlots[legacyMusic]` or `tierSeedMult[mega]` optional). No simultaneous Demand or Fragmentation edits.

### 3.2 Explicitly untouched

| Scalar group | Why untouched |
|--------------|---------------|
| All **Demand** scalars (`demand.*`) | Isolates Blueprint; if Rock moves without these, Demand is not the primary fix |
| All **Fragmentation** scalars (`fragmentation.*`) | Rock is not capture-primary; touching SAC would confound the test |
| `blueprint.seedWeight[contemporaryMusic]` | Control family — must remain at placeholder default |
| `blueprint.seedWeight[identity]` | Different failure mode (Urban/Spanish); out of scope |
| `blueprint.seedWeight[spoken]` | Sports/N/T proof case; out of scope |
| `blueprint.maxSlots[*]` except optional `legacyMusic` | Hold constant to isolate seedWeight effect |
| `blueprint.tierSeedMult[large]` | Hold constant unless falsification path requires tier split test (Phase 2) |
| Per-market BP patches, mktFmt, habit, rights, other-audio | Not Blueprint; confounds hypothesis |
| Any market-specific parameter | Forbidden by architecture |

---

## 4. Expected national behavior

### 4.1 Should move (if hypothesis is correct)

| Observable | Tier | Era | Expected direction |
|------------|------|-----|-------------------|
| Rock **lane total** | mega | First book / 1990 | **Down** toward reference band (material: ≥3pt reduction at 1990 mega) |
| Rock **lane total** | mega | 2026 | **Down** (≥2pt vs baseline); may still miss band if Demand decay also wrong |
| Rock **lane total** | large | 1990 / 2026 | **Down** (≥1.5pt at 1990) |
| Provenance `genesisFirstBook` / `initial_seeding` | mega + large | — | Timing flag still present but **magnitude reduced** |
| Provenance rank-1 mechanism | Rock @ 2026 | — | Blueprint first-book still top cause **or** superseded by Demand only if birth fixed but trajectory wrong |

### 4.2 Should not move (isolation checks)

| Observable | Pass if |
|------------|---------|
| **CHR + AC + Rhythmic** (contemporary control) lane total | Δ ≤ 1.0pt absolute at mega 2026 vs baseline |
| **Sports** lane total @ 2026 mega | Δ ≤ 1.0pt (Blueprint should not create/destroy sports mass) |
| **Spanish** lane total @ 2026 mega | Δ ≤ 1.5pt |
| **News/Talk** lane total @ 2026 large | Δ ≤ 1.5pt |
| Ecology **FRAGMENTATION** fork rate for Rock | No improvement required; must **not** be primary Rock fix |
| `diag:share-laugh-test` Rock leader exceedance | Secondary; may improve slightly if lane total falls — **not** primary success metric |
| `diag:share-sac-validation` event counts | Unchanged ±10% (no Fragmentation edits) |
| `diag:share-success-competition` | Unchanged ±10% |

### 4.3 May move (acceptable collateral)

| Observable | Acceptable if |
|------------|---------------|
| **Country** lane total | Moves with `legacyMusic` family (same macro family); document magnitude |
| **Urban** lane total | ≤ 1.5pt change (no identity blueprint edits) |
| Mega vs large **relative** gap | May shift; report but do not tune |

Country co-movement is **expected** (shared `legacyMusic` family). Splitting Rock vs Country within legacy music is **out of scope** for POC v1; noted as follow-up if falsification implicates family granularity.

---

## 5. Success criteria (confirm hypothesis)

All checked on **national tier rollups** after POC implementation, using **existing** harnesses only:

| # | Criterion | Diagnostic | Threshold (national) |
|---|-----------|------------|----------------------|
| S1 | First-book Rock mass drops | `diag:share-lane-demand-provenance` | Mega first-book Rock ↓ ≥ **4pt** vs baseline (~24.6% → ≤ ~20.6%) |
| S2 | 1990 Rock mass drops | `diag:share-lane-size-table` | Mega 1990 Rock ↓ ≥ **3pt**; large 1990 ↓ ≥ **2pt** |
| S3 | 2026 Rock mass drops | `diag:share-lane-size-table` | Mega 2026 Rock ↓ ≥ **2pt**; large 2026 ↓ ≥ **1pt** |
| S4 | Provenance attributes shift toward birth | `diag:share-lane-demand-provenance` | Blueprint first-book `meanDeltaPt` vs target ↓ ≥ **25%**; inflation timing unchanged or weakened |
| S5 | Control family stable | `diag:share-lane-size-table` | Contemporary (CHR+AC lane rollup) mega 2026 \|Δ\| ≤ **1pt** |
| S6 | Non-Rock systems unchanged | `diag:share-sac-validation` · ecology Sports/Spanish fork counts | No systematic improvement in Sports/Spanish **unless** incidental; SAC metrics stable |
| S7 | No Fragmentation-led Rock fix | `diag:share-lane-ecology-realism` | Rock cells: fork remains **DEMAND** or **OK**; capture not primary improvement |

**POC passes** if **S1 + S2 + S3 + S5** hold and **S7** holds. S4 and S6 are supporting.

---

## 6. Failure criteria (falsify hypothesis)

> **If we reduce Legacy Music blueprint mass and Rock remains oversized in provenance and lane-size diagnostics, then Rock is not primarily a Blueprint problem.**

| # | Falsifier | Diagnostic | Condition |
|---|-----------|------------|-----------|
| F1 | Birth does not move | Provenance + lane-size | After meaningful `seedWeight[legacyMusic]` cut (≥15% relative), mega first-book Rock ↓ **< 2pt** |
| F2 | 1990 does not follow birth | Lane-size | 1990 mega Rock ↓ **< 1.5pt** while F1 also failed |
| F3 | 2026 unchanged despite birth fix | Lane-size | First-book ↓ ≥ 4pt but 2026 mega Rock ↓ **< 1pt** → **Demand evolution** (or recalc implementation) dominates; reclassify Rock as **Blueprint + Demand** |
| F4 | Provenance still blames blueprint at same magnitude | Provenance | Blueprint first-book excess vs target unchanged ± **10%** relative after scalar cut |
| F5 | Control family breaks | Lane-size | Contemporary mega 2026 \|Δ\| **> 2pt** → Blueprint change too blunt or wrong family mapping |
| F6 | Fragmentation explains improvement | Ecology + laugh test | Rock lane total barely moves but leader/capture improves → hypothesis **wrong**; primary lever is **Fragmentation**, not Blueprint |

**Hypothesis falsified** if **F1**, or **F3**, or **F6** fires.  
**Partial falsification** if birth moves (S1) but 2026 does not (F3) → architecture stands but Rock requires **Demand** work before other lanes.

---

## 7. Diagnostic protocol (no new harnesses)

```bash
# Baseline (record before POC)
npm run diag:share-lane-size-table
npm run diag:share-lane-demand-provenance

# After POC implementation (same stack: share+sac, 8 runs/market)
npm run diag:share-lane-size-table
npm run diag:share-lane-demand-provenance

# Isolation (no change expected)
npm run diag:share-lane-ecology-realism
npm run diag:share-sac-validation
```

Compare **mega/large tier rollups** only. Manual market playtests are spot checks, not pass/fail.

---

## 8. Implementation gate (ordered)

| Step | Activity | Owner |
|------|----------|-------|
| 1 | Accept this design review | Product / CTO |
| 2 | Implement Blueprint config surface + `legacyMusic` scalar read in `genMarket()` only | Engineering |
| 3 | Run diagnostic protocol; record baseline vs POC tables | Engineering |
| 4 | Evaluate success §5 vs falsification §6 | Product / CTO |
| 5a | **Pass** → document calibrated values; queue Demand POC (Sports) | — |
| 5b | **Fail** → revise Rock classification; **do not** tune Sports/Spanish/N/T until resolved | — |

**Forbidden before Step 4 completes:** Demand scalar changes, Fragmentation/SAC changes, per-market patches, “Rock-only” format hacks outside `legacyMusic` Blueprint.

---

## 9. What this POC proves if successful

| Claim validated |
|-----------------|
| Blueprint / Demand / Fragmentation triad is **predictive** |
| Scalar ownership map is **correct** for birth-time mass |
| National validation methodology **detects** system-scoped changes |
| Rock → Blueprint provenance trail **causal**, not narrative |

---

## 10. What this POC proves if falsified

| Claim revised |
|---------------|
| Rock requires **Demand evolution** (or recalc-as-demand) as co-primary |
| `legacyMusic` family may be **too coarse** (Rock vs Country split needed) |
| Blueprint config surface may be **wrong locus** (BP patches elsewhere still dominate) |
| **Pause** other lane POCs until classification updated |

---

## 11. Classification confidence update

This POC tests whether the **triad classification predicts reality**, not whether a tuning pass “feels better.” After one implementation pass and harness scoring, update the working classification as follows:

| Outcome | Criteria (summary) | New classification for Rock |
|---------|-------------------|-------------------------------|
| **Success** | §5 passes (S1+S2+S3+S5+S7); falsifiers F1/F3/F6 do not fire | **Blueprint-primary** — confidence **HIGH**; proceed to other lanes without revisiting Rock system assignment |
| **Partial success** | Birth/first-book moves (S1 or ≥4pt first-book ↓) but 2026 mega miss persists (F3: 2026 ↓ < 1pt) | **Blueprint + Demand** — birth fixed, trajectory wrong; Demand evolution (legacyMusic) is co-primary before Sports/Spanish/N/T |
| **Failure** | F1 fires (birth barely moves after meaningful seed cut) and/or F6 fires (capture improves, lane total flat) | **Re-open classification** — Blueprint is **not** the primary hypothesis; investigate Demand implementation, family mapping (`legacyMusic` too coarse), or wrong code locus (BP patches outside config surface) |
| **Ambiguous** | S2/S3 marginal; control family (F5) or Country collateral dominates story | **Hold** — no lane reclassification; one bounded second pass (alternate scalar: `maxSlots` vs `tierSeedMult[mega]`) then re-score; still no Demand/Fragmentation edits |

**Document the outcome** in this file’s change log (date · result · new classification). That record is the scientific output of the POC — not the delta in Rock percentage alone.

### 11.1 POC v1 execution result (2026-06-21)

**Implementation:** `blueprint.seedWeight[legacyMusic]` 0.25 → 0.17 via `data/realismBlueprint.v1.json` + `src/realismBlueprint.js` (`realismBlueprintApplyBpPlan` demotes excess legacy BP slots; inject cap on tier dial fill). No Demand, Fragmentation, or secondary Blueprint scalars touched.

**Harnesses run (post-POC, same stack share+sac, 8 runs/market):** `diag:share-lane-size-table --runs=8`, `diag:share-lane-demand-provenance`.

**Baseline → POC (national tier rollups):**

| Observable | Baseline | POC v1 | Δ | Criterion |
|------------|----------|--------|---|-----------|
| Mega Rock first-book | 24.6% | 22.1% | **−2.5pt** | S1: need ≥4pt — **miss** |
| Mega Rock 1990 | 22.9% | 20.9% | **−2.0pt** | S2 mega: need ≥3pt — **miss** |
| Mega Rock 2026 | 15.6% | 14.4% | **−1.2pt** | S3 mega: need ≥2pt — **miss** |
| Large Rock 1990 | 19.8% | 20.2% | **+0.4pt** | S2 large: need ≥2pt ↓ — **miss** |
| Large Rock 2026 | 12.2% | 12.7% | **+0.5pt** | S3 large: need ≥1pt ↓ — **miss** |
| Blueprint first-book mean Δ (mega Rock @ 2026) | +16.57 pt | +14.07 pt | **−15% relative** | S4: need ≥25% — **miss** |
| Contemporary (CHR+AC) mega 2026 | 17.6% | 17.3% | **−0.3pt** | S5: \|Δ\| ≤1pt — **pass** |
| Mega Country 2026 (collateral) | 7.2% | 8.0% | +0.8pt | Expected co-movement |
| Large Country 1990 (collateral) | 11.8% | 5.4% | **−6.4pt** | Collateral dominates large-tier story |

**Success criteria:** S1 ❌ · S2 ❌ · S3 ❌ · S4 ❌ · S5 ✅ · S6 ✅ (no Fragmentation edits; SAC stack unchanged) · S7 not re-run (Rock lane totals still HIGH; no capture-led improvement observed).

**Falsification criteria:** F1 ❌ (first-book ↓ 2.5pt, not <2pt after 32% relative seed cut) · F2 n/a (F1 did not fire) · F3 ❌ (first-book ↓ <4pt) · F4 ❌ (blueprint mean Δ did move ~15%) · F5 ❌ · F6 not evaluated.

**Classification update:** **Ambiguous — Hold.**

Directional evidence that Blueprint-only touch moves **mega** Rock birth and provenance attribution, but magnitude is below every primary threshold; **large-tier Rock did not follow**; **Country collateral** (especially large 1990) is larger than Rock movement. Framework shows *some* explanatory power; scalar/locus/family granularity remain unresolved.

**Next step (when authorized):** One bounded second pass per §11 — alternate scalar only (`maxSlots[legacyMusic]` vs `tierSeedMult[mega]`), same harnesses, no Demand/Fragmentation. Do **not** proceed to Country, Urban, Sports, Spanish, or News/Talk until second pass is scored.

**Artifacts:** `tmp/share_lane_size_table_baseline.md`, `tmp/share_lane_demand_provenance_baseline.md` (pre-POC); `tmp/share_lane_size_table_poc_v1_seedweight.md`, `tmp/share_lane_demand_provenance_poc_v1_seedweight.md` (v1).

### 11.2 POC v2 execution result (2026-06-21)

**Hypothesis:** Rock oversizing is **too many legacy BP slots / wrong subformat composition**, not merely high seed weight.

**Implementation:** `blueprint.maxSlots[legacyMusic]` 3 → 2 only. `seedWeight[legacyMusic]` restored to baseline 0.25. No Demand, Fragmentation, `tierSeedMult`, or other scalars touched. Same code surface as v1; demotion logic keyed to `maxSlots` cap instead of seed-weight ratio.

**Harnesses:** same as v1 (share+sac, 8 runs/market).

**Baseline → POC v2 (national tier rollups):**

| Observable | Baseline | POC v2 | Δ | Criterion |
|------------|----------|--------|---|-----------|
| Mega Rock first-book | 24.6% | 13.3% | **−11.3pt** | S1: need ≥4pt — **pass** |
| Mega Rock 1990 | 22.9% | 15.7% | **−7.2pt** | S2 mega: need ≥3pt — **pass** |
| Mega Rock 2026 | 15.6% | 11.8% | **−3.8pt** | S3 mega: need ≥2pt — **pass** |
| Large Rock 1990 | 19.8% | 18.3% | **−1.5pt** | S2 large: need ≥2pt ↓ — **miss** |
| Large Rock 2026 | 12.2% | 10.7% | **−1.5pt** | S3 large: need ≥1pt ↓ — **pass** |
| Blueprint first-book mean Δ (mega Rock @ 2026) | +16.57 pt | +5.29 pt | **−68% relative** | S4: need ≥25% — **pass** |
| Contemporary (CHR+AC) mega 2026 | 17.6% | 18.8% | **+1.2pt** | S5: \|Δ\| ≤1pt — **miss** |
| Large AC 1990 (collateral) | 16.5% | 24.7% | **+8.2pt** | Demoted legacy → contemporary formats |
| Large Country 1990 (collateral) | 11.8% | 2.1% | **−9.7pt** | Country hit harder than Rock at birth |

**Provenance shift @ mega Rock 2026:** rank-1 mechanism moved from **Blueprint first-book** (+16.57 pt) to **Public habit denominator reconcile** (+8.24 pt); Blueprint first-book now rank-2 (+5.29 pt). Birth mass responds to slot cap; **remaining 2026 gap is no longer Blueprint-primary**.

**Success criteria:** S1 ✅ · S2 ✅ mega / ❌ large · S3 ✅ · S4 ✅ · S5 ❌ · S6 ✅ · S7 not re-run (provenance suggests Demand co-primary at 2026).

**POC outcome (both passes):** **Not Success.** v1 Ambiguous; v2 confirms **Blueprint birth lever works via `maxSlots`**, not `seedWeight`, on mega Rock — but full §5 gate fails (S5, large-tier 1990) and **legacyMusic is too coarse** (Country/AC absorb demotions).

**Final classification update:** **Blueprint + Demand** — Blueprint slot count at birth is a real mega-Rock lever; trajectory and residual gap require Demand evolution work. **Defer Rock-specific Blueprint implementation** until sub-family composition (Rock vs Country) is defined; do not commit v1/v2 code as candidate fix.

**Stop:** No further Blueprint scalar tuning. No Country/Urban/Sports/Spanish/N/T/Demand/Fragmentation work without new hypothesis doc.

**Artifacts:** `tmp/share_lane_size_table_poc_v2_maxSlots.md`, `tmp/share_lane_demand_provenance_poc_v2_maxSlots.md`.

### 11.3 CTO verdict and design lesson (2026-06-21)

**Ship decision:** Do **not** commit experimental code. Preserve experiment results in docs and harness artifacts only.

**What this proved (not a ship candidate, but a good outcome):**

1. **The architecture predicted the right system.** Rock responds to Blueprint; the v2 `maxSlots` first-book move (−11.3pt mega) is too large to ignore. Blueprint did not fail — the **macro-family surface is too coarse**.
2. **The issue is wrong legacy composition, not merely too much legacy music.** `legacyMusic` bundles Rock and Country; v2 damaged Country badly while moving Rock. Collateral was predictable and diagnostic.

**Working classification for Rock:**

> **Rock = Blueprint + Demand**, with **Blueprint composition unresolved**.

Not Blueprint-failed. Blueprint is the right layer; the current four-family seed surface cannot express Rock vs Country birth allocation.

**What the triad made legible (first real contact with reality):**

| Observation | System read |
|-------------|-------------|
| Touching Blueprint moved first-book Rock (v2) | Blueprint ownership confirmed |
| Wrong scalar (`seedWeight`) → weak move; right scalar (`maxSlots`) → strong move | Scalar/locus matters; framework discriminates |
| Wrong scalar → Country/AC collateral | Family granularity matters |
| Residual 2026 gap; provenance rank-1 → habit | Demand co-primary |

**Next design lesson (national, not market-specific):**

Distinguish:

- **Macro family for Demand:** Legacy Music (unchanged)
- **Subfamily composition for Blueprint:** Rock · Country · Classic Hits allocation at birth

This is **not** Houston Rock / Phoenix Country / Dallas Rock tables. It is a **national composition rule**:

> Legacy Music blueprint composition = Rock / Country / Classic Hits allocation

Still whack-a-mole resistant.

**Next Rock work:** Requires a **new hypothesis document** focused on Legacy Music **subfamily Blueprint composition** — not more scalar tweaking on `seedWeight` or `maxSlots[legacyMusic]`. Demand work for Rock trajectory remains co-primary but is out of scope until composition hypothesis is defined.

---

## 12. Explicit non-goals

- Tuning Rock to hit exact reference percentages
- Fixing Country, Urban, Sports, Spanish, or News/Talk in the same pass
- New diagnostics, caps, dampeners, or SAC v2
- City validation as success gate

---

## Post-commit discipline

After this document is committed:

1. **One** implementation pass (Blueprint · `legacyMusic` only).
2. Run before/after harnesses (§7).
3. **Stop and score** success (§5), falsification (§6), and classification update (§11).
4. Do **not** immediately tune Rock further, stack Demand/Fragmentation changes, or start Sports/Spanish/N/T until §11 is recorded.

Either outcome advances the project: success validates the triad; failure validates falsification before wider spend.

---

## Change log

| Date | Change |
|------|--------|
| 2026-06-21 | Initial Rock Blueprint POC design review |
| 2026-06-21 | Add §11 Classification confidence update; post-commit discipline |
| 2026-06-21 | **POC v1 executed and scored** — outcome **Ambiguous (Hold)**; see §11.1 |
| 2026-06-21 | **POC v2 executed and scored** — `maxSlots[legacyMusic]` 3→2; mega Rock birth fixed, full POC not Success; see §11.2 |
| 2026-06-21 | **CTO verdict** — Rock = Blueprint + Demand, composition unresolved; no code ship; see §11.3 |
