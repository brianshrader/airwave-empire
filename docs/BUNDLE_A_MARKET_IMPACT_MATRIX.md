# Bundle A — Market Impact Matrix

**Status:** Pre-implementation gate — quantifies *which problem each format solves*  
**Date:** 2026-06-25  
**Inputs:** Playable market ecology (2026) · truth audits (NYC, LA, Phoenix, Wichita) · Spanish Composition v1 · [REALISM_FORMAT_FOUNDATION_PRIORITY_SPEC.md](./REALISM_FORMAT_FOUNDATION_PRIORITY_SPEC.md)

**Not a philosophy document.** Each cell answers: *If this format existed tomorrow, would this market’s mature-book realism materially change?*

---

## 1. Impact scale

| Label | Meaning | Score (for totals) |
|-------|---------|-------------------|
| **Very High** | Primary failure mode for this market; truth audit or player complaint tied here | 3 |
| **High** | Regular top-10 / top-5 competitor; wrong hierarchy without it | 2 |
| **Medium** | Present in industry; improves realism but not primary gap | 1 |
| **Low** | Rare or marginal; enrichment only | 0 |
| **None** | Format essentially absent from market reality | 0 |

**“Materially change”** = expected movement in 2026 book shape, podium cardinality, or strategic reformat choice — not historical nostalgia.

---

## 2. Master matrix — playable markets (2026)

| Market | Tier | Adult Hits | Commercial CCM | Conservative Talk | Spanish promotion |
|--------|------|:----------:|:--------------:|:-----------------:|:-----------------:|
| **New York** | mega | Medium | Low | **Very High** | Medium |
| **Los Angeles** | mega | High | Low | High | **Very High** |
| **Chicago** | mega | High | Medium | High | Medium |
| **San Francisco** | large | High | Low | Medium | Medium |
| **Dallas** | large | High | High | Medium | Medium |
| **Houston** | large | High | High | Medium | High |
| **Atlanta** | large | High | **Very High** | Medium | Low |
| **Seattle** | large | High | Low | High | Low |
| **Phoenix** | large (diag) | Medium | High | Low | **Very High** |
| **Nashville** | medium | Medium | **Very High** | Low | Low |
| **Wichita** | small | Medium | High | Low | Low |

**Diag markets (not playable, truth-audit reference):**

| Market | Adult Hits | CCM | Conservative Talk | Spanish promotion |
|--------|:----------:|:---:|:-----------------:|:-----------------:|
| **Miami** | Medium | Medium | Medium | **Very High** (tropical) |
| **Portland** | High | Low | Medium | Low |

---

## 3. What each cell is solving

### New York
| Format | Problem solved |
|--------|----------------|
| Adult Hits | Secondary FM fragmentation; some gold variety exists but talk dominates |
| CCM | Minimal — coastal secular; Gospel/CCM not chair drivers |
| **Conservative Talk** | **Spoken stacking** — multiple talk products compressed into News/Talk + Personality |
| Spanish | Meaningful minority (~26% Hispanic) but not primary NYC pathology |

### Los Angeles
| Format | Problem solved |
|--------|----------------|
| Adult Hits | FM variety / Classic Hits–Rock cannibalization in fragmented mega dial |
| CCM | Low — not a CCM pillar market |
| Conservative Talk | Strong talk market; syndicated opinion distinct from news blocks |
| **Spanish promotion** | **#1 lockout / umbrella clone** — LA Spanish leadership pathology |

### Chicago
| Format | Problem solved |
|--------|----------------|
| Adult Hits | Large fragmented FM; post-2000 gold variety |
| CCM | Midwest religious FM (ecology `ccmStrength` 0.57) |
| Conservative Talk | Strong spoken market (0.65 spokenWordStrength) |
| Spanish | Growing Hispanic (~22%); medium decomposition need |

### Dallas
| Format | Problem solved |
|--------|----------------|
| **Adult Hits** | **Mature hierarchy** — missing FM gold competitor; Classic Hits/Rock absorb |
| **CCM** | **Commercial Christian** (`ccmStrength` 0.77) vs Gospel-only + K-LOVE network |
| Conservative Talk | Talk present; secondary to FM music gaps |
| Spanish | Hispanic growth (~29%); medium — not primary Dallas complaint in audits |

### Houston
| Format | Problem solved |
|--------|----------------|
| Adult Hits | Sunbelt FM fragmentation |
| CCM | High religious market (0.68) |
| Conservative Talk | Medium talk |
| **Spanish promotion** | High Hispanic (0.58 spanishLanguageStrength) |

### Atlanta
| Format | Problem solved |
|--------|----------------|
| **Adult Hits** | Diversified large-market FM competitor |
| **CCM** | **Top CCM market** (0.83) — not niche |
| Conservative Talk | Medium |
| Spanish | Low Hispanic share in ecology (0.10) |

### Phoenix
| Format | Problem solved |
|--------|----------------|
| Adult Hits | Classic Rock / Country / AC crowding; gold variety secondary |
| CCM | Sunbelt religious (`ccmStrength` 0.72) |
| Conservative Talk | Not primary pathology |
| **Spanish promotion** | **Original player complaint** — triple-stack umbrella clones |

### Nashville
| Format | Problem solved |
|--------|----------------|
| Adult Hits | Medium — country-heavy; some variety FM exists industry-side |
| **CCM** | **Highest CCM ecology in playable set** (0.87) |
| Conservative Talk | Low |
| Spanish | Low |

### Seattle / San Francisco
| Format | Problem solved |
|--------|----------------|
| **Adult Hits** | Educated fragmented FM; Jack/Bob-class markets historically |
| CCM | Low coastal secular |
| Seattle: **Conservative Talk** | Moderate-high spoken |
| Spanish | Low–medium (SF Hispanic growing) |

### Wichita
| Format | Problem solved |
|--------|----------------|
| Adult Hits | Medium — small market lags fragmentation |
| CCM | High churchGoing (0.64) |
| Conservative Talk | Low |
| Spanish | Low but growing |

---

## 4. Quantified summary — which format moves the most markets?

### 4.1 Counts at High or Very High (primary impact band)

| Format | Very High markets | High markets | **H+ total** | Medium markets | Low/None |
|--------|-------------------|--------------|--------------|----------------|----------|
| **Adult Hits** | 0 | **7** | **7** | 4 | 0 |
| **Commercial CCM** | **2** | **4** | **6** | 1 | 4 |
| **Conservative Talk** | **1** | **4** | **5** | 3 | 3 |
| **Spanish promotion** | **2** | **1** | **3** | 4 | 4 |

**Playable set:** 11 markets.

### 4.2 Weighted impact score (VH=3, H=2, M=1)

| Format | Weighted score | Avg / market |
|--------|----------------|--------------|
| **Adult Hits** | **18** | 1.64 |
| **Commercial CCM** | **15** | 1.36 |
| **Conservative Talk** | **14** | 1.27 |
| **Spanish promotion** | **12** | 1.09 |

### 4.3 Markets with at least one Very High format need

| Market | Primary gap(s) |
|--------|----------------|
| New York | Conservative Talk |
| Los Angeles | Spanish promotion (+ Adult Hits) |
| Phoenix | Spanish promotion |
| Atlanta | CCM (+ Adult Hits) |
| Nashville | CCM |

### 4.4 Unique market coverage (H+ only)

| Format | Markets at H+ |
|--------|---------------|
| Adult Hits | LA, Chicago, SF, Dallas, Houston, Atlanta, Seattle |
| CCM | Dallas, Houston, Phoenix, Atlanta, Nashville, Wichita (+ Chicago M) |
| Conservative Talk | NYC (VH), LA, Chicago, Seattle |
| Spanish promotion | LA (VH), Phoenix (VH), Houston |

**Combined English Bundle (AH + CCM + CT) H+ coverage:** all 11 playable markets have at least one format at Medium+; **10 of 11** have at least one at High+ (only Wichita lacks H+ — Medium across board).

**Spanish promotion H+ coverage:** **3 playable + Miami diag** — narrow but deep where it hits.

---

## 5. Key finding (CEO suspicion confirmed)

> **Spanish promotion may be the most elegant realism work. Adult Hits may be the highest-ROI realism work. Those are not the same thing.**

| Lens | Winner |
|------|--------|
| **Breadth** (most markets at H+) | **Adult Hits** (7) |
| **Peak pathology fix** (VH) | **Conservative Talk** (NYC) · **Spanish** (Phoenix, LA) · **CCM** (Nashville, Atlanta) |
| **Sunbelt religious realism** | **CCM** |
| **Depth in one complaint** | **Spanish promotion** |
| **Weighted total across playable set** | **Adult Hits > CCM > Conservative Talk > Spanish** |

**Adult Hits + Conservative Talk** together touch **more distinct high-impact markets** than Spanish promotion alone:

- English formats at H+: NYC, LA, Chicago, Seattle, Dallas, Houston, Atlanta (7 unique mega/large)
- Spanish at H+: LA, Phoenix, Houston (3; overlap LA/Houston)

Spanish remains **mandatory for ship** (D1) because Phoenix/LA failures are **unfixable** without it — but **implementation order** can prioritize English formats first without abandoning Spanish promotion before calibration.

---

## 6. Problem-type map (what kind of gap?)

| Gap type | Formats that fix it | Example markets |
|----------|---------------------|-----------------|
| **FM gold / variety missing** | Adult Hits | Dallas, Atlanta, Seattle, LA, Chicago |
| **Christian lane incomplete** | Commercial CCM | Nashville, Atlanta, Dallas, Phoenix, Wichita |
| **Spoken product stacking** | Conservative Talk | NYC, Chicago, Seattle, LA |
| **Hispanic music composition** | Spanish promotion | Phoenix, LA, Houston |
| **None of the above primary** | — | Wichita (medium across; small-market physics) |

---

## 7. Implication for implementation order

Matrix supports **CEO Option B** (Adult Hits first):

| Step | Format | Matrix justification |
|------|--------|---------------------|
| 1 | **Adult Hits** | Widest H+ footprint (7 markets); self-contained; immediate FM hierarchy signal |
| 2 | **Conservative Talk** | Second-broadest spoken fix; unblocks NYC before CCM |
| 3 | **Commercial CCM** | 6 H+ markets; Sunbelt religious — independent of Spanish |
| 4 | **Spanish promotion** | Narrowest H+ count (3) but **VH in the complaint market**; must complete before calibration |
| 5 | New realism baseline + fresh truth audits | All four in competitive paths |

**Critical constraint (unchanged):** Steps 1–4 all on `feature/format-foundation` from `prototype/share-compression-phase1`. Spanish POC stays **enabled** until step 4 promotes pillars to permanent architecture.

**Calibration gate:** Step 5 only after step 4 — not after step 1 alone.

---

## 8. Truth-audit markets — expected movement

| Audit market | Formats most likely to move 2026 bucket deltas |
|--------------|--------------------------------------------------|
| **NYC** | Conservative Talk >> Adult Hits > Spanish |
| **LA** | Spanish promotion ≈ Adult Hits >> CCM |
| **Phoenix** | Spanish promotion >> CCM > Adult Hits |
| **Wichita** | CCM > Adult Hits |

Fresh truth audits should be run **after full Bundle A**, not after Adult Hits alone — otherwise Phoenix/LA still reflect umbrella Spanish and NYC still reflects spoken compression.

---

*Document version: 1.0 — 2026-06-25 — matrix only; no gameplay changes.*
