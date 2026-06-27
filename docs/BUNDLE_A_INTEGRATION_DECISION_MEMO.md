# Bundle A Integration — Decision Memo

**Status:** One-time architectural decision — **decisions locked pending D4**  
**Date:** 2026-06-25 · **Rev 1.1** (CEO D4 + market matrix)  
**Audience:** Product / engineering — determines what Cursor builds next  
**Inputs:** Spanish Composition v1 (scored Success) · [REALISM_FORMAT_FOUNDATION_PRIORITY_SPEC.md](./REALISM_FORMAT_FOUNDATION_PRIORITY_SPEC.md) · [BUNDLE_A_MARKET_IMPACT_MATRIX.md](./BUNDLE_A_MARKET_IMPACT_MATRIX.md)

---

## Decision summary (read this first)

| Question | Answer | Status |
|----------|--------|--------|
| **D1 — Is Spanish Composition intended to ship?** | **Yes.** Permanent format architecture, not a science project. Original complaint was real; POC materially improved it. | ✅ Locked |
| **D2 — Is Bundle A one foundation?** | **Yes.** Formats added because the **universe is too coarse**, not because they’re historically interesting. | ✅ Locked |
| **D3 — Build from prototype branch?** | **Yes.** `prototype/share-compression-phase1` is the realism laboratory (Share Compression, SAC, Response Quality, Spanish Composition). | ✅ Locked |
| **D4 — Implementation order?** | **CEO order (Option B):** Adult Hits → Conservative Talk → CCM → Spanish promotion. See [matrix](./BUNDLE_A_MARKET_IMPACT_MATRIX.md). | ✅ Locked |
| **D5 — Recalibrate after Bundle A?** | **Yes.** Do not perfect Dallas/Phoenix/NYC/Houston on incomplete taxonomy. | ✅ Locked |
| **What if we code Adult Hits on `main`?** | **Reject.** Second realism universe; guaranteed double migration. | ✅ Locked |

---

## 1. Current state (why this decision matters now)

### 1.1 Branch reality

| Location | What exists |
|----------|-------------|
| **`main`** | Production taxonomy: 22 commercial formats, umbrella `SPANISH` only. No Spanish Composition, no share-compression stack, no competitive-response POC. |
| **`prototype/share-compression-phase1`** | Share compression Phase 1 · Competitive Response POC · Spanish Composition v1 · realism architecture docs · harness baselines · `protoRealismPlayLoader` (`?proto=share+sac+spanish`). |

Spanish Composition v1 is **merged to the prototype branch** (commit `c46ba81`). It is **not** on `main`. It is **not** default-on for all players — it is gated by `__WL_REALISM_SPANISH_COMPOSITION_POC` and prototype URL flags.

### 1.2 How Spanish Composition works today

Spanish pillars are **not** first-class `FM{}` gameplay keys yet. They are a **composition overlay**:

- `src/realismSpanishComposition.js` runtime-installs pillar appeal tables and launch logic when the POC flag is true.
- `legacy.js` contains **~30 guarded hook sites** (`spanishCompositionIsSpanishLaneFmt`, `spanishCompositionApplBaseAff`, launch def patching, etc.).
- Player stations remain umbrella `SPANISH`; AI/launch/CR paths use pillar keys when POC enabled.
- Phoenix pathology fix **only exists in this configuration**.

**Implication:** Bundle A cannot be “Adult Hits on main + Spanish maybe later” without forking realism reality.

### 1.3 The underlying problem (one expansion, not four)

Rock Composition and Spanish Composition converged on the same diagnosis:

> **Mature markets are modeled with too few meaningful audience products.**

Bundle A addresses that once:

| Format | Audience-product gap |
|--------|---------------------|
| **Spanish pillars** | Hispanic music is one competitive clone bucket |
| **Adult Hits** | Post-2000 FM gold variety has no product |
| **Commercial CCM** | Christian lane is Gospel + institutional only |
| **Conservative Talk** | Spoken lane collapses news, syndicated opinion, lifestyle, and sports-adjacent talk |

Further mature-market calibration **on the old taxonomy** will misattribute errors and require redoing work after Bundle A lands.

---

## 2. Question 1 — Is Spanish Composition expected to become permanent format architecture?

### Recommendation: **Yes — ship it.**

| If YES | If NO (keep as experiment) |
|--------|----------------------------|
| Bundle A built on one universe | Adult Hits / CCM / Conservative Talk ship on `main` without Hispanic decomposition |
| Phoenix fix preserved | Phoenix reverts to umbrella pathology when POC off |
| Composition pattern reused for English formats | Two migration passes: English formats first, Spanish later |
| Realism calibration runs once on expanded dial | Calibration runs twice; first pass partially wasted |

**“Ship” does not mean “keep the POC overlay forever.”** It means:

1. Spanish music pillars (`REGIONAL_MEXICAN`, `SPANISH_CONTEMPORARY`, `SPANISH_ADULT_HITS`, gated `SPANISH_TROPICAL`) become **first-class competitive formats** in `FM{}`, save schema, launch sequencer, and CR/SAC targeting.
2. The overlay module (`realismSpanishComposition.js`) is **retired or reduced to config** after promotion — not the long-term architecture.
3. Umbrella `SPANISH` becomes **save-compat alias / migration target**, not the competitive product (per [SPANISH_FORMAT_SPLIT_SPEC.md](./SPANISH_FORMAT_SPLIT_SPEC.md) Phase 3 direction).

**What “ship” does not require immediately:** Player picker exposure in all markets; Spanish specialty spoken formats; tropical in every Sunbelt market.

**Decision:** Treat Spanish Composition v1 as **approved foundation work awaiting promotion**, not a disposable experiment. Do not implement other Bundle A formats on a branch or taxonomy that assumes umbrella Spanish is the permanent competitive model.

---

## 3. Question 2 — Recommended Bundle A implementation order

**Locked: CEO Option B** (supported by [BUNDLE_A_MARKET_IMPACT_MATRIX.md](./BUNDLE_A_MARKET_IMPACT_MATRIX.md)).

| Step | Work | Rationale |
|------|------|-----------|
| **0 — Gate** | Cut `feature/format-foundation` from `prototype/share-compression-phase1`. Spanish POC **stays enabled** on branch until step 4. | Single realism universe |
| **1 — Adult Hits** | Native `FM{}` + DRIFT + FA + reformat graph | **7 playable markets at High+**; self-contained; no save migration; highest ROI |
| **2 — Conservative Talk** | Spoken taxonomy + News/Talk drift re-scope | **5 markets at H+**; NYC Very High; unblocks spoken stacking |
| **3 — Commercial CCM** | Christian family + institutional disambiguation | **6 markets at H+**; Nashville/Atlanta Very High; independent of Spanish |
| **4 — Spanish promotion** | Integrate POC → permanent `FM{}` / save / launch; retire overlay | **3 markets at H+** but **Very High in Phoenix + LA** (original complaint); touches most systems |
| **5 — New realism baseline** | Reset harness baselines; fresh truth audits (NYC, LA, Phoenix, Wichita) | Only after all four competitive |

**Why not Spanish-first:** Spanish promotion is the **most elegant** realism work (composition depth) but **not the broadest** — Adult Hits moves more truth-audit markets at High+. Spanish-first optimizes architecture cleanliness; CEO order optimizes **learning rate** while English universe expands.

**Overlay coexistence (steps 1–3):** Acceptable. Spanish POC overlay remains active for Hispanic paths while English formats ship natively. Step 4 must follow without a long gap — not deferred to a later initiative.

### Superseded: Option A (Spanish-first)

Architecture-first ordering remains valid if bundling all four in one implementation wave. **Rejected for serialized work** per CEO — Adult Hits first when steps are sequential.

### Not recommended

| Order | Why reject |
|-------|------------|
| Any Bundle A work on **`main`** without Spanish decision | Second universe |
| Tier 2 formats (Smooth Jazz, Business Talk) before Bundle A | Recalibrate twice |
| Further Spanish Composition POC tuning | Frozen at diminishing returns |

### Authorized single-format exception

If exactly **one** format may start before full Bundle A specs: **Adult Hits only**, on **`feature/format-foundation` from prototype**, with Spanish POC **still enabled** on that branch — not on `main`.

---

## 4. Question 3 — Architecture changes vs. simple format additions

| Format | Type | What changes beyond `FM{}` + label |
|--------|------|-----------------------------------|
| **Adult Hits** | **Simple addition** (within existing patterns) | Hits family FA/DRIFT; Oldies/Classic Hits reformat edges; unlock ~1998; no new family |
| **Commercial CCM** | **Moderate** | Christian family expansion; **must disambiguate** from `RELIGIOUS_NETWORK` (institutional); `ccmStrength` ecology wiring; advertiser category |
| **Conservative Talk** | **Architecture change** | New spoken product; `TALK_FMTS` extension; News/Talk drift **re-scope** (move political editorial off conflated axis); Personality Talk scope narrowed; likely **spoken Demand subfamilies** before anchor retune |
| **Spanish pillars** | **Architecture change** (largest) | Multi-ID save migration; launch sequencer; CR/SAC subtype targeting; retire overlay hooks; umbrella alias; player picker rules (market-gated); intra-subtype cannibalization in `appl()` |

**Rule of thumb:**

- **Simple addition** = one new competitive product, existing family, no taxonomy surgery.
- **Architecture change** = multiple products replace one bucket, or spoken/institutional boundaries move.

Bundle A is **two architecture changes + two additions** (Spanish + Conservative Talk are structural; Adult Hits + CCM are additions with CCM moderate overlap).

---

## 5. Question 4 — Which realism branches become obsolete once Bundle A exists?

### Obsolete or frozen (do not continue)

| Branch / work | Why obsolete after Bundle A |
|---------------|----------------------------|
| **Spanish Composition POC iteration** | v1 succeeded; remaining work is **promotion**, not hypothesis testing |
| **Umbrella-only Spanish competitive paths** | Replaced by pillar keys in launch / CR / fragmentation |
| **Diagnostic-only subtype inference as substitute for gameplay** | `_diagSpanishSubtype` without competitive keys was Phase 1; promotion supersedes |
| **Personality Talk as political/conservative absorber** | Conservative Talk owns syndicated opinion |
| **Rock Blueprint `seedWeight`-only** | Failed; composition layer is the lever |
| **Sports spoken anchor-only Demand POC** | Too coarse; Conservative Talk + spoken subfamilies is prerequisite |
| **Per-market Phoenix Spanish exception tables** | Anti-pattern; national composition rules only |
| **Realism calibration on pre-Bundle-A taxonomy** | Misleading baselines |

### Still required (not obsolete)

| Branch / work | Relationship to Bundle A |
|---------------|-------------------------|
| **Share compression Phase 1** | Stays; retarget to new format keys |
| **Competitive Response / SAC** | Stays; adjacent lists and spawn pools need pillar + Adult Hits + Conservative entries |
| **Response Quality / adjacent-first** | Stays; format neighbor lists expand |
| **Legacy Blueprint composition** (Rock / Country / Gold birth seats) | **Orthogonal** — runs **after** Bundle A baseline reset |
| **Demand evolution** (macro families) | Recalibrate **after** Bundle A; spoken may need subfamilies first |
| **Fragmentation** (capture, min competitors) | Recalibrate **after** Bundle A |
| **Spanish Tropical, specialty spoken** | Tier 2/3 — after foundation |

---

## 6. Question 5 — Minimum implementation set before further realism calibration is meaningful

### Minimum viable Bundle A (MVB-A)

All **four** must be in **competitive paths** (AI launch, CR, fragmentation spawn, `appl()`), not player-picker polish:

1. **Spanish music pillars promoted** (at minimum RM + Contemporary + Adult Hits)  
2. **Adult Hits**  
3. **Conservative Talk** (with News/Talk / Personality scope fix)  
4. **Commercial CCM**  

**Why all four, not three:** Priority analysis shows each fixes a **different** mature-market failure mode (Phoenix/LA · Sunbelt/ large FM · NYC/Dallas spoken · Nashville/Atlanta/Dallas Christian). Calibrating after only Adult Hits + Spanish still leaves spoken and Christian lanes structurally wrong — half the CEO thesis.

### Minimum before **player-facing** ship (can lag MVB-A)

- Save migration polish for all player-owned stations  
- Market-gated picker for Spanish pillars and CCM  
- Smooth Jazz, Tier 2 formats  
- Spoken Demand subfamily scalar split (can follow MVB-A if Conservative Talk format cardinality exists)

### Calibration gate (explicit)

```
Bundle A competitive paths complete
        ↓
Reset harness baselines (document universe change)
        ↓
Legacy Blueprint composition (Rock/Country/Gold)
        ↓
Demand evolution + spoken subfamilies (if needed)
        ↓
Fragmentation retune on expanded key set
        ↓
Tier 2 enrichment formats (optional second calibration)
```

**Do not pause realism work indefinitely.** Pause **scalar calibration on the old taxonomy**. Resume on MVB-A.

---

## 7. Branch and merge strategy

| Step | Action |
|------|--------|
| 1 | **Decision:** Spanish ships · Bundle A is one foundation · work on prototype-derived branch |
| 2 | Create `feature/format-foundation` from `prototype/share-compression-phase1` |
| 3 | Implement MVB-A (Option A or B order) |
| 4 | Reset diagnostics / update REALISM_CHANGELOG |
| 5 | Merge to `main` when MVB-A competitive paths work **without** `?proto=` flags for Bundle A formats |
| 6 | Resume realism calibration on new baselines |

**Do not merge Adult Hits alone to `main` while Spanish remains prototype-only** unless explicitly accepting a third taxonomy state (production · prototype · format-foundation).

---

## 8. What to do tonight

| Action | Authorized? |
|--------|---------------|
| **Accept this memo** (Spanish ships · Bundle A · branch rule) | ✅ Yes |
| Write Bundle A **implementation spec** (one doc, four formats) | ✅ Yes |
| Implement Adult Hits only (Option B step 1, on format-foundation branch) | ✅ If coding must start |
| Implement Smooth Jazz / Business Talk / Tier 2 | ❌ No |
| Further Spanish Composition POC | ❌ No |
| Realism scalar retune | ❌ No — wait for MVB-A |
| Play prototype with `?proto=share+sac+spanish` | ✅ Yes — validates current universe |

---

## 9. Decisions (locked)

- [x] **D1:** Spanish Composition **will ship** as permanent architecture (pillar promotion, overlay retired).  
- [x] **D2:** Bundle A is **one foundation expansion**, not four independent features.  
- [x] **D3:** All Bundle A implementation on **`feature/format-foundation`** from prototype, not `main`.  
- [x] **D4:** Implementation order: **Adult Hits → Conservative Talk → CCM → Spanish promotion → baseline reset.**  
- [x] **D5:** Realism calibration **resumes after MVB-A** (all four formats competitive), not before.  

**Pre-implementation gate complete:** [BUNDLE_A_MARKET_IMPACT_MATRIX.md](./BUNDLE_A_MARKET_IMPACT_MATRIX.md) quantifies market coverage. Next artifact: **Bundle A implementation spec** (one doc or per-format cluster — engineering choice).

---

## 10. Matrix headline (from impact analysis)

| Format | Markets at High+ | Weighted score (11 playable) | Primary role |
|--------|------------------|-------------------------------|--------------|
| Adult Hits | **7** | **18** | Broadest FM hierarchy ROI |
| Commercial CCM | **6** | 15 | Sunbelt / religious markets |
| Conservative Talk | **5** | 14 | NYC spoken stacking |
| Spanish promotion | **3** | 12 | Phoenix/LA depth; original complaint |

**English formats (steps 1–3) move more markets at High+ than Spanish alone.** Spanish remains **required before calibration** — Phoenix/LA are unfixable without step 4.

---

*Document version: 1.1 — 2026-06-25 — decisions locked; no gameplay changes.*
