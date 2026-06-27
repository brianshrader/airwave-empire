# Realism Format Foundation — Priority Analysis

**Status:** Design / research only — **authorizes prioritization, not implementation**  
**Date:** 2026-06-25  
**Purpose:** Determine which missing formats are likely to **materially change mature-market realism and hierarchy outcomes** versus which are primarily **historical flavor** — so realism calibration is not run twice on the wrong universe.

**Sibling documents:**

- [FORMAT_FOUNDATION_EXPANSION_DESIGN_REVIEW.md](./FORMAT_FOUNDATION_EXPANSION_DESIGN_REVIEW.md) — taxonomy, audience decomposition, spoken resolution (rev 1.1)
- [REALISM_SPANISH_COMPOSITION_POC.md](./REALISM_SPANISH_COMPOSITION_POC.md) — **frozen**; Spanish music pillars green-lit via composition pass
- [REALISM_ARCHITECTURE.md](./REALISM_ARCHITECTURE.md) — Blueprint · Demand · Fragmentation triad

**Explicit non-goals:** No code, no format keys, no harness design, no realism scalar tuning.

---

## 1. Why this document exists

### 1.1 What is frozen

**Spanish Composition** has reached the freeze point:

| Milestone | Status |
|-----------|--------|
| Original player complaint reproduced | Done |
| Hypothesis developed | Done |
| POC built and scored | Success (Pattern C) |
| Major pathology reduced | Done |
| Chair review passed | Done |
| Diminishing returns | Reached |

**Do not continue engineering on Spanish Composition.** Further Spanish realism belongs in the **format foundation + calibration** branch, not another composition POC.

### 1.2 What is not frozen

**Realism work continues** — on the **next foundation branch**: completing the commercial format universe in **impact order**, then recalibrating Blueprint / Demand / Fragmentation once.

### 1.3 The mistake to avoid

Implementing enrichment formats first (Smooth Jazz, Business Talk, Spanish Sports) and discovering later that:

- **Adult Hits** was responsible for half the missing FM competition in Dallas-class markets  
- **Conservative Talk** resolves half of NYC spoken stacking  
- **Commercial CCM** reshapes Nashville, Atlanta, and Dallas religious-market hierarchy  

…forces **two full calibration passes**. Formats will eventually ship; **order matters**.

### 1.4 Scoring methodology

Each candidate is scored on two independent 1–10 scales:

| Scale | Meaning |
|-------|---------|
| **Impact (1–10)** | Expected change to **mature-market hierarchy** (2005–2026 books): podium cardinality, cross-lane cannibalization, strategic choice, calibration validity |
| **Complexity (1–10)** | Expected engineering + design cost: save migration, positioning, reformat graph, institutional overlap, spoken-staffing rules, philosophical unresolved edges |

**Impact** weights:

- Podium / top-5 clone stacking fix potential  
- Number of playable markets materially affected  
- Cross-format share redistribution breadth  
- Whether realism triad tuning is **misleading** without this ID  

**Complexity** weights:

- New family vs. planned ID vs. subtype split  
- Player picker / save migration surface  
- Overlap with existing IDs (slider sufficient?)  
- Spoken vs. music staffing and Demand subfamily needs  

**Recommended phase** derives from impact tier, not complexity alone — high-impact formats ship before low-impact even if harder.

**Markets referenced:** Playable Phase 1 set (`newyork`, `losangeles`, `chicago`, `sanfrancisco`, `dallas`, `houston`, `atlanta`, `seattle`, `phoenix`, `nashville`, `wichita`) plus diag markets (`miami`, `portland`) where noted. Markets outside the game (Charlotte, Tampa, Denver, Raleigh) are cited only as industry comparables.

---

## 2. Candidate format scorecards

### 2.1 Tier A — High realism impact (implement before calibration)

#### Adult Hits / Variety Hits

| Field | Value |
|-------|-------|
| **Historical introduction** | **1998–2002** (Jack FM 2000, Bob FM wave ~2002–2004) |
| **Peak era** | **2005–2015** national; still present secondary 2020s |
| **Market prevalence** | **Very high** — most large and many medium markets had a variety-hits FM by 2010 |
| **Markets most affected** | **Dallas, Phoenix, Atlanta, Seattle, San Francisco, Chicago, Houston, Nashville**; weaker in NYC (talk-heavy) and Wichita (small-tier fragmentation lag) |
| **Existing formats that lose share** | **Classic Hits, Classic Rock, Adult Contemporary, Hot AC**, occasionally **Album Rock / AAA** and **Oldies** successor paths |
| **Mature hierarchy impact** | **Severe omission today.** Post-2005 FM “gold variety” has no product; Classic Hits and Classic Rock absorb misplaced demand; reduces credible second/third FM competitors in Sunbelt and diversified large markets |
| **Impact score** | **10** |
| **Complexity score** | **4** — planned Hits-family ID; drift axis (era mix / variety) straightforward; no institutional overlap; unlock ~1998 |
| **Recommended phase** | **Phase 1 — Bundle A** |

**If only one format may be implemented first:** **Adult Hits** — highest confidence of moving realism outcomes without spoken-philosophy dependency.

---

#### Commercial Contemporary Christian (CCM)

| Field | Value |
|-------|-------|
| **Historical introduction** | **1985–1990** FM growth; mainstream consolidation **1990s** |
| **Peak era** | **2000–2012** |
| **Market prevalence** | **High in religious Sunbelt / growth metros** — not national top-5 everywhere, but **material in many playable markets** |
| **Markets most affected** | **Dallas, Atlanta, Nashville, Houston**; also **Phoenix, Seattle, Wichita** (churchGoing / ccmStrength ecology); weaker **NYC, SF, Chicago** |
| **Existing formats that lose share** | **Hot AC, Adult Contemporary, Gospel** (partial), **institutional Christian CHR** (K-LOVE-style rival), occasional **Country** crosstown |
| **Mature hierarchy impact** | Enables **commercial vs. noncommercial Christian** gameplay; fixes “Gospel only” Christian lane; reshapes FM religious competition where `ccmStrength` is high |
| **Impact score** | **9** |
| **Complexity score** | **6** — must disambiguate from `RELIGIOUS_NETWORK`; lifecycle `CCM` row exists; Christian family expansion; advertiser category distinct from Gospel |
| **Recommended phase** | **Phase 1 — Bundle A** |

**Industry note:** Not niche in Raleigh, Dallas, Nashville, Atlanta — Raleigh is not yet playable but the pattern holds for **Nashville + Atlanta + Dallas** in Phase 1.

---

#### Conservative Talk

| Field | Value |
|-------|-------|
| **Historical introduction** | **1988–1994** (syndicated national model); acceleration **1996–2004** |
| **Peak era** | **2000–2016** |
| **Market prevalence** | **High in spoken-heavy markets** — one to three AM/FM signals in many large metros |
| **Markets most affected** | **New York, Dallas, Houston, Atlanta**; moderate **Chicago, Seattle**; low **Wichita, Nashville** |
| **Existing formats that lose share** | **News / Talk** (political pole today), **Personality Talk** (incorrect absorber), occasional **All-News** (daypart) |
| **Mature hierarchy impact** | **Spoken composition fix** — NYC-style stacking of multiple “talk” stations in one coarse bucket; separates syndicated opinion from local full-service and from FM lifestyle talk |
| **Impact score** | **9** |
| **Complexity score** | **7** — requires spoken taxonomy decision (resolved: first-class format in design review); News/Talk drift re-scope; Personality Talk narrowed; spoken Demand subfamily likely follows |
| **Recommended phase** | **Phase 1 — Bundle A** (with spoken role doc, not ad hoc) |

**Not optional long-term:** Personality Talk cannot carry Rush-style syndication, Larry King, local advice, political talk, and lifestyle talk — different businesses ([FORMAT_FOUNDATION_EXPANSION_DESIGN_REVIEW.md](./FORMAT_FOUNDATION_EXPANSION_DESIGN_REVIEW.md) §6).

---

#### Spanish music pillars (Regional Mexican · Spanish Contemporary · Spanish Adult Hits)

| Field | Value |
|-------|-------|
| **Historical introduction** | RM **1975–1985**; Contemporary **1990**; Adult Hits **2002** |
| **Peak era** | RM **2000–2026** Sunbelt; Contemporary **2000–2016** mega; Adult Hits **2008–2020** |
| **Market prevalence** | **High where Hispanic pop high** — essential in **Phoenix, LA, Houston**; meaningful **NYC, Chicago, Atlanta, Dallas** |
| **Markets most affected** | **Phoenix** (primary), **Los Angeles, Houston**, **New York, Chicago, Miami** (diag) |
| **Existing formats that lose share** | **Umbrella SPANISH** (internal cannibalization), **Classic Rock, Country, AC, CHR** (English crosstown) |
| **Mature hierarchy impact** | **Proven** — Phoenix clone stacking; LA #1 lockout; composition POC success |
| **Impact score** | **10** (Hispanic markets) · **7** national rollup |
| **Complexity score** | **8** — multi-ID migration, launch sequencer, CR/fragmentation key wiring; **composition pass already done** |
| **Recommended phase** | **Phase 1 — frozen path** (format IDs + picker migration); not a new POC |

**Status:** Treat as **parallel Bundle A** — already authorized via Spanish Composition; remaining work is **foundation implementation**, not hypothesis testing.

---

### 2.2 Tier B — Moderate realism impact

#### Urban AC

| Field | Value |
|-------|-------|
| **Historical introduction** | **~1985** (quiet storm / adult R&B FM) |
| **Peak era** | **1995–2010** |
| **Market prevalence** | **Medium** — major in Black adult markets; thin elsewhere |
| **Markets most affected** | **Atlanta, Houston, Dallas**; moderate **Chicago, NYC**; partial via Soul/R&B today |
| **Existing formats that lose share** | **Soul / R&B, Urban Contemporary, Hot AC**, occasional **Gospel** |
| **Mature hierarchy impact** | Refines urban **35–54** lane; reduces Soul→UC bridge compression; moderate podium effect |
| **Impact score** | **7** |
| **Complexity score** | **5** — Soul/UC overlap must be mapped; reformat graph from Soul/R&B |
| **Recommended phase** | **Phase 2** |

---

#### Classic Country

| Field | Value |
|-------|-------|
| **Historical introduction** | **1980s** heritage FM; stronger **1990s** |
| **Peak era** | **1995–2010** regional |
| **Market prevalence** | **Medium-low national** — strong in country-culture markets |
| **Markets most affected** | **Nashville, Wichita**; moderate **Dallas, Houston, Atlanta**; weak coastal |
| **Existing formats that lose share** | **Country** (traditional pole partially covers this today) |
| **Mature hierarchy impact** | Heritage market texture; unlikely to fix mega-market hierarchy pathologies alone |
| **Impact score** | **6** |
| **Complexity score** | **4** — try Country traditional pole first; split ID only if audits fail |
| **Recommended phase** | **Phase 2** |

---

#### Spanish Tropical

| Field | Value |
|-------|-------|
| **Historical introduction** | **1982–1988** |
| **Peak era** | **1995–2016** Caribbean metros |
| **Market prevalence** | **Low national** — **high Miami / NYC** |
| **Markets most affected** | **Miami** (diag), **New York**, **Los Angeles** (mix lane) |
| **Existing formats that lose share** | **Spanish Contemporary, Regional Mexican**, **Urban / Rhythmic** English |
| **Mature hierarchy impact** | Important for **Miami** correctness; minimal Phoenix/Dallas effect |
| **Impact score** | **5** (national) · **8** (Miami) |
| **Complexity score** | **5** — Spanish family split; market gating |
| **Recommended phase** | **Phase 2** (after Spanish music Bundle A) |

---

### 2.3 Tier C — Flavor / enrichment (low hierarchy impact)

#### Smooth Jazz

| Field | Value |
|-------|-------|
| **Historical introduction** | **1982–1987** |
| **Peak era** | **1992–2002** |
| **Market prevalence** | **Medium at peak** — **collapsed ~2005–2012**; few 2026 commercial pillars remain |
| **Markets most affected** | **San Francisco, Seattle, Los Angeles** (educated/coastal); occasional **Dallas, Atlanta** historically |
| **Existing formats that lose share** | **Adult Contemporary, Beautiful Music successor space, AAA**, Public Jazz adjacency |
| **Mature hierarchy impact** | **Lifecycle enrichment** — if omitted, few unexplained 2026 mature-book failures; mostly affects **1985–2005** historical arc |
| **Impact score** | **4** |
| **Complexity score** | **5** — sunset lifecycle, educated-market affinity, decline to specialty |
| **Recommended phase** | **Phase 2–3** (enrichment) |

**CEO read:** Historically important; **most players would not notice** if omitted from Phase 1.

---

#### Classic Hip Hop

| Field | Value |
|-------|-------|
| **Historical introduction** | **~2012** |
| **Peak era** | **2015–2024** |
| **Market prevalence** | **Low–medium** — growing but not universal |
| **Markets most affected** | **Atlanta, Houston, NYC, Chicago, LA** urban cores |
| **Existing formats that lose share** | **Urban Contemporary, Rhythmic CHR**, potential **Urban AC** |
| **Mature hierarchy impact** | Post-2010 urban heritage; **solves fewer problems than Adult Hits**; risk of urban lane proliferation |
| **Impact score** | **4** |
| **Complexity score** | **6** — overlaps UC slider; audit gate required |
| **Recommended phase** | **Phase 2–3** (future-era enricher) |

---

#### Business / Financial Talk

| Field | Value |
|-------|-------|
| **Historical introduction** | **1990s** (Bloomberg et al.) |
| **Peak era** | **2000–2015** |
| **Market prevalence** | **Very low** — 1–2 metros deep |
| **Markets most affected** | **New York** primarily; **Chicago** secondary |
| **Existing formats that lose share** | **All-News, News/Talk** |
| **Mature hierarchy impact** | Metro texture; **not a national chair problem** |
| **Impact score** | **2** |
| **Complexity score** | **4** — station trait may suffice |
| **Recommended phase** | **Phase 3** |

---

#### Progressive Talk

| Field | Value |
|-------|-------|
| **Historical introduction** | **2004–2008** (Air America era) |
| **Peak era** | **Brief / thin** |
| **Market prevalence** | **Very low** |
| **Markets most affected** | Few coastal markets historically |
| **Existing formats that lose share** | **News/Talk** |
| **Mature hierarchy impact** | Negligible |
| **Impact score** | **2** |
| **Complexity score** | **3** |
| **Recommended phase** | **Phase 3 — reject as pillar** |

---

#### Spanish Sports Talk

| Field | Value |
|-------|-------|
| **Historical introduction** | **1998–2005** |
| **Peak era** | **2010–2020** select metros |
| **Market prevalence** | **Low** — LA, Miami, Houston |
| **Markets most affected** | **Los Angeles, Houston**; diag **Miami** |
| **Existing formats that lose share** | **Spanish music formats, English Sports Talk** |
| **Mature hierarchy impact** | Niche fragmentation; **not a Phoenix/Dallas-class fix** |
| **Impact score** | **2** |
| **Complexity score** | **4** |
| **Recommended phase** | **Phase 3 — specialty catalog** |

---

#### Spanish Religious

| Field | Value |
|-------|-------|
| **Historical introduction** | **1970s AM** |
| **Peak era** | Stable low-share |
| **Market prevalence** | **Ubiquitous but tiny ratings** |
| **Markets most affected** | Hispanic AM markets generally |
| **Existing formats that lose share** | **Brokered, Gospel, umbrella Spanish** |
| **Mature hierarchy impact** | Mis-labeling fix only; **not competitive pillar** |
| **Impact score** | **2** |
| **Complexity score** | **3** — prefer brokered + trait |
| **Recommended phase** | **Phase 3 — specialty catalog** |

---

## 3. Master ranking table

Sorted by **impact score** (desc), then **complexity score** (asc) as tiebreaker.

| Rank | Format | Impact | Complexity | Phase | Category |
|------|--------|--------|------------|-------|----------|
| 1 | **Adult Hits** | 10 | 4 | 1A | Huge realism impact |
| 2 | **Spanish music pillars** (3) | 10 / 7 nat. | 8 | 1A (frozen) | Huge realism impact |
| 3 | **Commercial CCM** | 9 | 6 | 1A | Huge realism impact |
| 4 | **Conservative Talk** | 9 | 7 | 1A | Huge realism impact |
| 5 | **Urban AC** | 7 | 5 | 2 | Moderate impact |
| 6 | **Classic Country** | 6 | 4 | 2 | Moderate impact |
| 7 | **Spanish Tropical** | 5 / 8 Miami | 5 | 2 | Moderate (market-gated) |
| 8 | **Smooth Jazz** | 4 | 5 | 2–3 | Flavor / enrichment |
| 9 | **Classic Hip Hop** | 4 | 6 | 2–3 | Future-era enricher |
| 10 | **Business Talk** | 2 | 4 | 3 | Flavor / metro-specific |
| 11 | **Progressive Talk** | 2 | 3 | 3 | Reject as pillar |
| 12 | **Spanish Sports** | 2 | 4 | 3 | Specialty catalog |
| 13 | **Spanish Religious** | 2 | 3 | 3 | Specialty catalog |

**Ranking matches CEO prior** within ±1 point — sufficient to authorize **Bundle A** as a single implementation wave after this spec.

---

## 4. Impact vs. complexity map

```
Impact
 10 │  Adult Hits          Spanish pillars*
  9 │  CCM                 Conservative Talk
  7 │  Urban AC
  6 │  Classic Country
  5 │  Spanish Tropical
  4 │  Smooth Jazz         Classic Hip Hop
  2 │  Business            Progressive    Spanish Sports/Religious
    └────────────────────────────────────────────────── Complexity
         3        4        5        6        7        8

* Spanish pillars: high complexity but composition POC complete — remaining work is implementation.
```

**Quadrant guidance:**

| Quadrant | Action |
|----------|--------|
| High impact · Low complexity | **Adult Hits** — implement first if forced to serialize |
| High impact · High complexity | **Spanish pillars, Conservative Talk, CCM** — bundle with design specs, not one-offs |
| Low impact · Any complexity | **Defer** until post-calibration enrichment pass |

---

## 5. Mature-market hierarchy — which formats move which failures?

Qualitative map from truth audits, Spanish Composition, and realism POC lineage:

| Market / symptom | Formats most likely to help | Formats unlikely to help |
|------------------|----------------------------|---------------------------|
| **Phoenix** Spanish clone stacking | Spanish music pillars (**done POC**) | Smooth Jazz, Business Talk |
| **Los Angeles** Spanish #1 lockout | Spanish music pillars | Classic Country, Progressive Talk |
| **New York** spoken stacking | **Conservative Talk**, All-News vs News/Talk clarity | Smooth Jazz, Spanish Sports |
| **Dallas** mature hierarchy / concentration | **Adult Hits**, **CCM**, Conservative Talk | Business Talk, Spanish Religious |
| **Atlanta** diversified FM | **Adult Hits**, **Urban AC**, **CCM** | Progressive Talk |
| **Nashville** country + religious | **CCM**, Classic Country | Classic Hip Hop |
| **Houston** Sunbelt mix | Spanish pillars, **CCM**, Urban AC | Smooth Jazz |
| **Seattle / SF** educated FM | **Adult Hits**, Smooth Jazz (historical), AAA already present | Spanish Religious |
| **Wichita** small-market | Classic Country, CCM (churchGoing) | Business Talk, Conservative Talk |
| **Chicago** mega fragmentation | **Adult Hits**, Conservative Talk, Urban AC | Spanish Tropical |

**Hypothesis to validate after Bundle A ships:** Adult Hits + CCM + Conservative Talk + Spanish pillars explain **more mature-market hierarchy variance** than all Tier C formats combined.

---

## 6. Recommended implementation authorization

### 6.1 Best path (recommended tonight)

| Step | Action |
|------|--------|
| 1 | **Accept this priority spec** |
| 2 | Write **implementation specs** for Bundle A only (one spec per family cluster, not one mega-PR) |
| 3 | Implement **Bundle A as a wave** before realism calibration retune |
| 4 | **Do not** implement Tier C formats until Bundle A is in and harness baselines reset |

**Bundle A (authorized as a set after specs):**

1. Adult Hits  
2. Commercial CCM  
3. Conservative Talk (+ spoken role clarification)  
4. Spanish music pillar **format foundation** (migration from composition POC — not new hypothesis work)

### 6.2 If engineering must start before full Bundle A specs

**Authorize only: Adult Hits.**

| Reason | Detail |
|--------|--------|
| Unquestionably real | Jack/Bob/Mike/Simon/Frank national wave |
| Unambiguously missing | Planned ID in family architecture |
| Broad market reach | Dallas, Phoenix, Atlanta, Seattle, SF, Chicago, Houston, Nashville |
| Hierarchy impact | Direct FM competitor to Classic Hits / Rock / AC cluster |
| Low philosophical risk | No spoken-taxonomy dependency |
| Highest ROI if serialized | One format, maximum realism surface area |

**Do not start:** Smooth Jazz, Business Talk, Spanish Sports, Urban AC, Classic Hip Hop — **until Adult Hits + priority spec accepted**, or Bundle A specs land.

### 6.3 Explicitly not authorized tonight

| Item | Reason |
|------|--------|
| Further Spanish Composition POC work | Frozen at diminishing returns |
| Tier C format implementation | Flavor-first ordering risk |
| Realism scalar retune | Universe incomplete |
| Full Bundle A without implementation specs | Design gate |

---

## 7. Calibration sequencing rule

```
┌─────────────────────────────────────────────────────────────┐
│  1. Bundle A format IDs exist in gameplay (competitive)      │
├─────────────────────────────────────────────────────────────┤
│  2. Reset regression baselines / document universe change    │
├─────────────────────────────────────────────────────────────┤
│  3. Blueprint composition (Legacy Rock/Country/Gold)         │
├─────────────────────────────────────────────────────────────┤
│  4. Demand evolution per macro family (+ spoken subfamilies?)  │
├─────────────────────────────────────────────────────────────┤
│  5. Fragmentation (capture, SAC, CR targets on new keys)     │
├─────────────────────────────────────────────────────────────┤
│  6. Tier B enrichment formats (optional second calibration)  │
└─────────────────────────────────────────────────────────────┘
```

**Rule:** Steps 3–5 are **invalid** for mature-market conclusions while Adult Hits, CCM, Conservative Talk, and Spanish pillars are absent from competitive paths — regardless of historical flavor formats present.

---

## 8. Deliverable summary

### Final impact ranking (confirmed)

| Format | Impact | Complexity | Phase |
|--------|--------|------------|-------|
| Adult Hits | **10** | 4 | 1A |
| Commercial CCM | **9** | 6 | 1A |
| Conservative Talk | **9** | 7 | 1A |
| Spanish music pillars | **10** / 7 | 8 | 1A (frozen POC) |
| Urban AC | 7 | 5 | 2 |
| Classic Country | 6 | 4 | 2 |
| Smooth Jazz | 4 | 5 | 2–3 |
| Classic Hip Hop | 4 | 6 | 2–3 |
| Business Talk | 2 | 4 | 3 |
| Progressive Talk | 2 | 3 | 3 |
| Spanish Sports / Religious | 2 | 3–4 | 3 |

### Authorization statement

- **Priority analysis:** Complete (this document).  
- **Bundle A implementation:** Authorized **after** per-cluster implementation specs — **not** ad hoc.  
- **Single-format exception:** **Adult Hits only** if engineering must begin before full Bundle A.  
- **Spanish Composition:** **Frozen** — no further POC engineering.  
- **Tier C formats:** **Not authorized** until Bundle A lands and baselines reset.

### Open questions (for implementation specs, not this doc)

1. Adult Hits vs. Classic Hits — shared Hits sub-lane budget and cannibalization rules  
2. CCM vs. institutional network — competitive boundary and translator era  
3. Conservative Talk — News/Talk drift migration from today’s political pole  
4. Spanish pillar — player picker vs. AI-only Phase 2 (Spanish Composition precedent)  
5. Minimum viable universe — is Bundle A sufficient before *any* Tier B format?

---

*Document version: 1.0 — 2026-06-25 — priority analysis only; no gameplay changes.*
