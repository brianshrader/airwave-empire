# Format Foundation Expansion — Design Review

**Status:** Design / research phase only  
**Date:** 2026-06-25 · **Rev 1.1** (CEO prioritization pass)  
**Scope:** Define the commercial format universe that should exist *before* further realism calibration — not how to build it  

**Explicit non-goals:**

- No implementation, save migration, or format keys in this document
- No realism scalar tuning, harness design, or POC scoring
- No Nielsen label encyclopedia — audience products only

**Related artifacts:**

- [FORMAT_FAMILY_ARCHITECTURE.md](./FORMAT_FAMILY_ARCHITECTURE.md) — current family taxonomy and planned IDs
- [SPANISH_FORMAT_SPLIT_SPEC.md](./SPANISH_FORMAT_SPLIT_SPEC.md) — Spanish decomposition architecture
- [REALISM_SPANISH_COMPOSITION_POC.md](./REALISM_SPANISH_COMPOSITION_POC.md) — audience-decomposition lesson (accepted)
- [REALISM_ROCK_BLUEPRINT_POC.md](./REALISM_ROCK_BLUEPRINT_POC.md) · [REALISM_LEGACY_COMPOSITION_POC.md](./REALISM_LEGACY_COMPOSITION_POC.md) — Rock / legacy composition lessons
- [REALISM_ARCHITECTURE.md](./REALISM_ARCHITECTURE.md) — Blueprint · Demand · Fragmentation triad

**Premise:** Future realism work should run against a *reasonably complete* format universe. Calibrating against an obviously incomplete dial produces false conclusions.

**Rev 1.1 framing:** *Historically important* formats and *realism-important* formats are not the same thing. This document now separates those lenses and prioritizes by **mature-market realism impact** — what changes podium shape, cross-lane cannibalization, and strategic choice in 2005–2026 books — not by Nielsen completeness or nostalgia value.

**CEO hypothesis (to validate in later realism work):** Adding only **Adult Hits**, **Commercial CCM**, and a **correct spoken taxonomy** likely delivers more realism benefit than adding ten enrichment formats combined.

---

## Executive summary — CEO ranking

Work order after Spanish Composition (conceptual tiers, not implementation sequence):

| Tier | Items | Rationale |
|------|-------|-----------|
| **Tier 1** | 1. Adult Hits · 2. Commercial CCM · 3. Spoken decomposition (Conservative Talk decision) | Largest holes in the *current* universe; reshape mature-market books and player strategy |
| **Tier 1 (parallel)** | Spanish music pillars (Regional Mexican, Spanish Contemporary, Spanish Adult Hits) | Already green-lit; same *composition* category as Adult Hits |
| **Tier 2** | Smooth Jazz · Classic Hip Hop · Urban AC (if Soul/UC insufficient) | Realism enrichment; fewer mature-market pathologies solved |
| **Tier 3** | Business Talk · Spanish specialty spoken · Nielsen micro-labels | Metro-specific or catalog depth |

**Tier 1 is a bundle, not a waterfall.** Spanish decomposition, Adult Hits, CCM, and spoken taxonomy should all exist before the next major realism calibration pass. Tier 2 formats can wait.

---

## Section 0 — Mature-market realism impact (new lens)

*Which missing formats are most likely to change mature-market realism if added?*

This is the prioritization question that matters for product. Scoring is qualitative (High / Medium / Low) against:

| Criterion | Question |
|-----------|----------|
| **Podium cardinality** | Does absence force clone stacking or wrong #1 products in mega/large 2026 books? |
| **Cross-lane cannibalization** | Does the format fight multiple existing lanes (AC, Rock, Hits, Christian, spoken)? |
| **Strategic choice** | Does the player gain a distinct reformat / launch decision? |
| **Calibration dependency** | Will Blueprint/Demand/Fragmentation tuning be misleading without this ID? |

| Missing format | Mature-market impact | Historical importance | Notes |
|----------------|---------------------|----------------------|-------|
| **Adult Hits** | **High** | High (2000s+) | Strongest single omission. Jack/Bob/Mike/Simon/Frank reshaped FM in the mid-2000s. Fights Classic Hits, Classic Rock, AC, Hot AC, and Rock ecosystems simultaneously. |
| **Commercial CCM** | **High** | High (1990s–2000s) | Not niche in Raleigh, Dallas, Nashville, Atlanta. Game already models institutional Christian CHR — commercial CCM completes the competitive triangle (Gospel · CCM · K-LOVE-style network). |
| **Conservative Talk** (resolved: first-class) | **High** | High (1990s–2010s) | NYC/Dallas/Houston spoken stacking; distinct from All-News, local News/Talk, Sports, and FM personality. |
| **Spanish music pillars** | **High** | High | Proven composition pathology (Phoenix, LA). |
| **Urban AC** | **Medium** | Medium | Matters in Atlanta, DC, Philly; partially expressible via Soul/R&B → UC path. |
| **Smooth Jazz** | **Low–Medium** | High (1985–2005) | Historically important; if it vanished from the roadmap, few 2026 mature-book failures would remain unexplained. |
| **Classic Hip Hop** | **Low–Medium** | Low (pre-2010) | Solves fewer realism problems than Adult Hits; urban lane refinement. |
| **Business Talk** | **Low** | Medium in 2–3 metros | NYC/Chicago texture; not a national chair problem. |
| **Spanish specialty spoken** | **Low** | Varies | Miami/LA exception; catalog not pillar. |

**Implication:** Phase 1 = everything with **High** mature-market impact. Phase 2 = **Medium**. Phase 3 = **Low** or enrichment-only.

---

## Section 1 — Current format inventory

### 1.1 Playable commercial formats (today)

The simulation ships **22 player-selectable commercial formats** plus brokered inventory. Institutional and public formats exist for rivals but are not player picks.

| Family | Implemented formats | Notes |
|--------|---------------------|-------|
| **Hits / CHR** | Top 40 / CHR, Rhythmic CHR, Oldies, Classic Hits | No Adult Hits. Oldies → Classic Hits successor exists; Jack-FM era unrepresented. |
| **Rock** | Album Rock (progressive/AOR lineage), Classic Rock, Alternative, AAA | Adequate for rock decomposition; birth-time composition is the realism lever, not new rock labels. |
| **Adult / AC** | MOR, Beautiful Music, Adult Contemporary, Hot AC, Adult Standards | Soft AC is a drift pole on AC, not a format. |
| **Country** | Country | No heritage/classic split. |
| **Urban** | Soul / R&B, Urban Contemporary | Hip-hop is UC drift pole B. No Urban AC. |
| **Spoken** | News / Talk, Sports Talk, Personality Talk, All-News | **Over-compressed.** Personality Talk cannot stand in for Rush, Larry King, local advice, political talk, and lifestyle talk — different businesses. |
| **Christian (commercial)** | Gospel only | Institutional Christian CHR exists as rival; commercial CCM lifecycle row exists but no playable ID. |
| **Spanish** | Spanish / Latin (umbrella) | Six diagnostic subtypes; not first-class competitive products. |
| **Remnant** | Brokered / Paid Programming | Meta inventory. |

### 1.2 Strongest omissions (CEO read)

1. **Adult Hits** — same category as Spanish decomposition: obvious hole, not a nice-to-have.
2. **Commercial CCM** — meaningful business in many markets; enables K-LOVE vs. commercial CCM gameplay.
3. **Spoken taxonomy** — Conservative / news / personality / sports are not one bucket.

### 1.3 Formats adequately covered today

Progressive/AOR/heritage rock, Soft AC, Rhythmic vs. CHR, Oldies → Classic Hits, Tejano as Regional Mexican pole, Full Service heritage via MOR/Beautiful Music sunsets.

---

## Section 2 — Candidate additions

Evaluation uses two lenses: **historical plausibility** and **mature-market realism impact** (Section 0).

### 2.1 Tier 1 candidates

#### Adult Hits / Variety Hits

| Dimension | Assessment |
|-----------|------------|
| Historical realism | Late 1990s–2000s; Jack FM, Bob FM, Mike FM, Simon, Frank nationally visible by mid-2000s. |
| Mature-market impact | **Highest of any single missing English format.** Reshapes 2005–2026 FM in large markets. |
| Cross-lane effects | Cannibalizes **Classic Hits, Classic Rock, AC, Hot AC**, and adjacent Rock — not a siloed niche. |
| Audience / sales | Broad 35–54 variety gold; distinct “no repeat” workplace product. |
| Classification | **Major commercial pillar.** |

**Verdict:** **Tier 1 / Phase 1** — peer priority with Spanish decomposition, not Phase 2 enrichment.

---

#### Commercial Contemporary Christian (CCM)

| Dimension | Assessment |
|-----------|------------|
| Historical realism | Commercial FM CCM meaningful **1990s–2000s** in Sunbelt and growth metros. |
| Mature-market impact | **High** — not niche in Raleigh, Dallas, Nashville, Atlanta. |
| Gameplay | Commercial CCM vs. **institutional Christian CHR** (K-LOVE-style) vs. **Gospel** is already an interesting realism question the game is set up to ask. |
| Audience / sales | White/evangelical/suburban; faith-category advertisers; distinct from Black Gospel. |
| Classification | **Major pillar** in religious markets; nationally material. |

**Verdict:** **Tier 1 / Phase 1** — move up from “regional secondary” framing; national footprint is thinner than Adult Hits but **calibration impact is high** where `ccmStrength` markets exist.

---

#### Conservative Talk — **decision resolved**

**Do not leave this unresolved.** Two defensible architectures; one must be chosen for format foundation.

| Option | Description | Mature-market impact |
|--------|-------------|---------------------|
| **A — First-class Conservative Talk** | Syndicated opinion / partisan talk as its own commercial product | **High** — fixes spoken composition; distinct launch, fragmentation, and cannibalization vs. News/Talk |
| **B — News/Talk + political positioning slider** | Single News/Talk ID; slider expresses conservative editorial | **Medium** — may suffice for *tone* but weak for *product cardinality* (multiple News/Talk stations at different poles still clone-stack) |

**Rejected approach:** Using **Personality Talk** to absorb Rush Limbaugh, Larry King, local advice, political talk, and lifestyle talk. Those are different businesses, sales stories, and talent models. Personality Talk should mean **FM hot talk / lifestyle** (Howard Stern lane, advice, entertainment) — not syndicated AM conservatism.

**Recommendation: Option A — Conservative Talk as first-class format.**

| Spoken product | Role after resolution |
|----------------|----------------------|
| **All-News** | Continuous news (WINS, KNX) |
| **News / Talk** | Local full-service; news blocks + local talk; drift **news-heavy ↔ talk-heavy** (fix axis from today’s hard-news ↔ political, which belongs elsewhere) |
| **Conservative Talk** | Syndicated opinion stack (post-1990 national model) |
| **Personality Talk** | FM lifestyle / edgy entertainment — **not** political syndication |
| **Sports Talk** | Rights-coupled sports |

Option B’s slider remains useful **inside** News/Talk for local editorial shade; it does not replace a Conservative Talk product for NYC-style stacking.

**Verdict:** **Tier 1 / Phase 1** — implement as format, not trait.

---

#### Spanish music pillars (parallel Tier 1)

Unchanged from Spanish Composition direction:

| Pillar | Phase |
|--------|-------|
| Regional Mexican | Tier 1 |
| Spanish Contemporary / CHR | Tier 1 |
| Spanish Adult Hits | Tier 1 |
| Spanish Tropical | Tier 2 |
| Spanish specialty spoken / religious | Tier 3 |

---

### 2.2 Tier 2 candidates

#### Smooth Jazz

Historically important (1980s–2000s rise and collapse). **Low mature-market impact today.** Realism enrichment for educated metros 1985–2005; few players would notice if omitted from Phase 1.

**Verdict:** **Tier 2 / Phase 2.**

---

#### Classic Hip Hop

Liked; post-2010 urban heritage. **Solves fewer realism problems than Adult Hits.** Risk of urban lane proliferation with UC + Rhythmic + Urban AC.

**Verdict:** **Tier 2 / Phase 2** — after Urban lane audit.

---

#### Urban AC

Meaningful 35–54 Black adult product. **Medium mature-market impact** — Atlanta, DC, Philly; partially covered by Soul/R&B era poles and UC “R&B core.”

**Verdict:** **Tier 2 / Phase 2** — add if harness shows Soul/UC bridge insufficient; **not** Tier 1 unless audits prove mature urban books wrong.

---

### 2.3 Tier 3 and rejected

| Candidate | Verdict |
|-----------|---------|
| **Business / Financial Talk** | **Tier 3 / Phase 2–3** — very metro-specific (NYC, Chicago); trait before format |
| **News/Talk hybrid** (as label) | **Reject** — schedule architecture |
| **Progressive Talk** | **Reject** major — specialty catalog |
| **Spanish specialty spoken** | **Tier 3** — catalog, not competitive pillar |
| **Soft AC standalone** | **Reject** — AC pole A |
| **Nielsen micro-labels** | **Reject** unless audience-product proven |

---

## Section 3 — Major pillar vs. specialty

| Candidate | Tier | Mature-market impact |
|-----------|------|---------------------|
| Adult Hits | Major pillar | High |
| Commercial CCM | Major pillar (religious markets) / national material | High |
| Conservative Talk | Major pillar (spoken metros) | High |
| Spanish music pillars (3) | Major pillar | High |
| Urban AC | Major (urban) / secondary national | Medium |
| Smooth Jazz | Secondary → specialty by 2010 | Low–Medium |
| Classic Hip Hop | Secondary | Low–Medium |
| Business Talk | Secondary / specialty | Low |

---

## Section 4 — Audience decomposition

Lessons from Spanish Composition and Rock/Legacy Composition unchanged:

> New format = meaningfully different **audience product**, not a Nielsen label.

**Adult Hits** and **Commercial CCM** pass all four tests (audience, sales story, competition mode, strategic choice) at Tier 1 strength.

**Conservative Talk** passes all four; **Personality Talk fails** as a proxy for political syndication.

**Decomposition failure mode:** Cosmetic relabeling without distinct appeal curves and intra-lane cannibalization (Spanish POC).

**Rock lesson:** Prefer Blueprint **composition** (Rock / Country / Gold seats) over new rock subformats.

---

## Section 5 — Lifecycle realism

| Format / product | Emergence | Peak | Decline / notes |
|------------------|-----------|------|-----------------|
| Adult Hits | 1998–2002 | 2005–2018 | Viable secondary 2020s |
| Commercial CCM | 1985–1990 FM | 2000–2012 | Plateau; competes with institutional network post-2004 |
| Conservative Talk | 1988–1994 | 2000–2016 | Podcast fragmentation; loyal core remains |
| Smooth Jazz | 1982–1987 | 1992–2002 | Collapse ~2005–2012 |
| Classic Hip Hop | ~2012 | 2015–2024 | Demo-aging driven |
| Urban AC | ~1985 | 1995–2010 | Stable niche |
| Spanish pillars | per split spec | per split spec | per split spec |

Tier 1 formats with steep decline (none of the Tier 1 set except All-News heritage) still need lifecycle curves — CCM and Conservative Talk **plateau** rather than collapse.

---

## Section 6 — Spoken-word decomposition (resolved)

### 6.1 Problem

NYC-style spoken stacking = **composition problem** (parallel to Phoenix Spanish). Spoken Demand macro is too coarse (Sports POC collateral moved News/Talk when spoken anchor moved).

### 6.2 Target spoken taxonomy (Phase 1)

| Product | Keep / add | Scope |
|---------|------------|-------|
| All-News | Keep | Coastal/edu exceptions; steep decline |
| News / Talk | Keep — **re-scope drift** | Local full-service; news-heavy ↔ talk-heavy |
| **Conservative Talk** | **Add (Tier 1)** | Syndicated opinion; not Personality Talk |
| Personality Talk | Keep — **narrow scope** | FM lifestyle / edgy; not Rush, not Larry King |
| Sports Talk | Keep | Rights-coupled |
| Brokered | Keep | Remnant |

### 6.3 What Personality Talk is NOT

| Content | Belongs in |
|---------|------------|
| Rush-style syndicated conservatism | Conservative Talk |
| Continuous news | All-News |
| Local issue / call-in full-service | News / Talk |
| Sports | Sports Talk |
| Howard Stern / lifestyle / advice | Personality Talk |

### 6.4 Business Talk

**Tier 3.** Bloomberg-style — station trait first; format only if NYC audit requires after Tier 1 spoken foundation.

### 6.5 Demand architecture (still open for implementation phase)

Spoken subfamily Demand (news vs. sports vs. opinion) likely required before anchor tuning — but **format cardinality comes first**.

---

## Section 7 — Prioritized roadmap (rev 1.1)

### Phase 1 — Foundation (before further realism calibration)

**All Tier 1 items in parallel:**

| # | Addition | Family |
|---|----------|--------|
| 1 | **Adult Hits / Variety Hits** | Hits |
| 2 | **Commercial CCM** | Christian |
| 3 | **Conservative Talk** + spoken role clarification (Section 6) | Spoken |
| 4 | Spanish music pillars: Regional Mexican, Spanish Contemporary, Spanish Adult Hits | Spanish |

**Removed from Phase 1 (vs. rev 1.0):** Urban AC → Phase 2.

**Phase 1 exit criteria:** Mature mega/large 2026 books can assign distinct products for Hispanic music, post-2000 gold FM, commercial Christian (vs. Gospel vs. network), and syndicated conservative talk — without umbrella compression or Personality Talk catch-all.

### Phase 2 — Valuable additions (enrichment)

| Format | Rationale |
|--------|-----------|
| Smooth Jazz | Historical arc 1985–2005 |
| Classic Hip Hop | Post-2010 urban (conditional) |
| Urban AC | If Soul/UC bridge insufficient |
| Spanish Tropical | Miami / NYC |
| Classic Country | Heritage markets |
| Dedicated youth Hip Hop | UC slider failure mode only |

### Phase 3 — Specialty / niche

Business Talk, Spanish specialty spoken, Progressive Talk, Spanish Variety, Nielsen micro-labels, ethnic non-Spanish.

---

## Deliverable summary

### 1. Recommended Phase 1 additions

1. **Adult Hits / Variety Hits** — strongest English omission; mid-2000s ecosystem player  
2. **Commercial Contemporary Christian** — Raleigh/Dallas/Nashville/Atlanta material; vs. K-LOVE gameplay  
3. **Conservative Talk** (first-class) + narrowed Personality Talk + re-scoped News/Talk  
4. **Spanish music decomposition** — Regional Mexican, Spanish Contemporary, Spanish Adult Hits  

### 2. Recommended Phase 2 additions

1. Smooth Jazz  
2. Classic Hip Hop (conditional)  
3. Urban AC (conditional)  
4. Spanish Tropical  
5. Classic Country  

### 3. Formats explicitly rejected

| Rejected | Reason |
|----------|--------|
| Personality Talk as conservative/political catch-all | Different businesses |
| News/Talk hybrid as standalone format | Schedule architecture |
| Soft AC standalone | AC pole A |
| Progressive Talk as major pillar | Thin footprint |
| Spanish spoken/religious as competitive pillars | Tier 3 specialty |
| Nielsen micro-labels | Composition lessons |
| Business Talk in Phase 1 | Metro-specific; Tier 3 |

### 4. Open realism questions (rev 1.1)

| # | Question |
|---|----------|
| 1 | **CCM vs. institutional network:** competitive boundaries and translator-era footprint without double-counting religious listening |
| 2 | **Adult Hits vs. Classic Hits:** cannibalization rules, Oldies sunset handoff, Hits sub-lane budget |
| 3 | **News/Talk drift migration:** how to split today’s hard-news ↔ political axis between News/Talk and Conservative Talk |
| 4 | **Spoken Demand subfamilies:** news vs. sports vs. opinion split before anchor retune |
| 5 | **Urban triad:** Urban AC + UC + Rhythmic vs. Classic Hip Hop — audit gate for Phase 2 |
| 6 | **Blueprint composition:** Rock/Country/Gold birth seats — orthogonal but must align with Adult Hits era |
| 7 | **Fragmentation regime:** Spanish music Identity Demand vs. capture rules |
| 8 | **Player cognitive load:** Tier 1 AI-only vs. market-gated picker (Spanish precedent) |
| 9 | **Smooth Jazz:** sunset format vs. time-bounded AC competitor — Phase 2 only |
| 10 | **Minimum viable universe test:** does Adult Hits + CCM + spoken taxonomy + Spanish pillars suffice before *any* Tier 2 format? |

**Resolved (rev 1.1):** Conservative Talk = **Option A**, first-class format. Personality Talk ≠ political syndication.

---

## Appendix A — Impact vs. history (quick reference)

```
Mature-market impact (priority)     Historical fame (enrichment)
─────────────────────────────     ────────────────────────────
Adult Hits              ████████    Smooth Jazz         ████████
Commercial CCM          ████████    Classic Hip Hop     ████
Conservative Talk       ████████    Business Talk       ███
Spanish pillars         ████████    Urban AC            █████
Urban AC                █████
Smooth Jazz             ███
Classic Hip Hop         ███
Business Talk           ██
```

**Working thesis:** The top three English additions (Adult Hits, CCM, spoken taxonomy) plus Spanish pillars complete the **minimum viable commercial universe** for mature-market realism calibration. Tier 2 is optional depth.

---

## Appendix B — Universe size (headline)

| State | Commercial formats (conceptual) |
|-------|--------------------------------|
| Today | 22 + brokered; Spanish umbrella |
| After Phase 1 | ~29–31 (+Adult Hits, +CCM, +Conservative Talk, +3 Spanish music; −umbrella competitive) |
| After Phase 2 | ~33–35 |

---

*Document version: 1.1 — 2026-06-25 — CEO prioritization pass; design review only.*
