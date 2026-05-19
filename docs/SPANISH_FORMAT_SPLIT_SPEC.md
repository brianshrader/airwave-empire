# Spanish format split specification (architecture only)

**Status:** Phase 1 — diagnostic subtype metadata + inference (gameplay still umbrella `SPANISH`)  
**Scope:** Split the gameplay umbrella `SPANISH` into realistic Spanish-language competitive formats  
**Out of scope (this document):** `FM{}` keys, `DRIFT{}`, `appl()`, saves, picker, billing, `MARKETS` tuning, AI format pick

**Related artifacts:**

| Artifact | Role |
|----------|------|
| [`data/formatFamilies.v1.json`](../data/formatFamilies.v1.json) | `SPANISH` family; Phase 1 umbrella |
| [`docs/FORMAT_FAMILY_ARCHITECTURE.md`](FORMAT_FAMILY_ARCHITECTURE.md) | Family taxonomy; Phase 4 `SPANISH_*` placeholder |
| [`docs/FORMAT_LIFECYCLE_LAYER_V1.md`](FORMAT_LIFECYCLE_LAYER_V1.md) | National `SPANISH` lane (`ethnic`); growth curve |
| [`scripts/spanishLanguageFormats.mjs`](../scripts/spanishLanguageFormats.mjs) | Diagnostic bucket IDs (partial future list) |
| [`src/legacy.js`](../src/legacy.js) | Today: single `FM.SPANISH` unlock 1992; `DRIFT.SPANISH` Regional Mexican ↔ Latin Pop; `isHighHispanicMarket`; `spanishLaunches` |

---

## 1. Problem statement

### 1.1 Today

- One competitive format ID: **`SPANISH`** (`FM.l`: “Spanish / Latin”).
- One positioning slider: **Regional Mexican ↔ Latin Pop Crossover** (`DRIFT.SPANISH`).
- Ecology: `spanishLanguageStrength`, `culture.spanish`, `hispPop1970/2000/2020`, `isHighHispanicMarket`, optional `MARKETS[id].spanishLaunches`.
- Diagnostics already list **planned** IDs (`SPANISH_NEWS_TALK`, `SPANISH_CHR`, `SALSA_TROPICAL`, …) but gameplay collapses them into book share for one format.

### 1.2 Why split

| Symptom | Likely cause | Split target |
|---------|--------------|--------------|
| **LA Spanish #1 lockout** (~75% #1 wins @ 2026 in truth audits) | One Spanish station absorbs all Hispanic appeal; no intra-lane competition | Regional Mexican vs Contemporary vs Tropical vs Talk |
| **Phoenix Spanish underperformance** (~5–15% book vs ~30% Hispanic pop) | Umbrella competes with Classic Rock for leadership; wrong *subtype* for Sunbelt Mexican-dominant dial | Regional Mexican + launches timing; less CR #1 bleed |
| **Miami book OK, leadership flat** | Multiple launches, still one format class | Tropical + Contemporary + Talk fragmentation |
| **NYC / Chicago modest Spanish** | Low `spanishLanguageStrength`; AM ethnic heritage | Variety + News/Talk; not forcing Mexican FM in NE/MW |
| **Religious Spanish AM** | Conflated with music formats | `SPANISH_RELIGIOUS` vs commercial music |

### 1.3 Design principles

1. **Family stays `SPANISH`** until a future cross-family rule requires otherwise (all roll up to `SPANISH_LANGUAGE` diagnostic bucket).
2. **Prefix convention:** `SPANISH_*` for music/spoken splits; **`REGIONAL_MEXICAN`** as industry-standard exception (already implied by `DRIFT` poles).
3. **No boost-only profile mistakes** — lifecycle overrides per *subtype* later, not one growth curve for all.
4. **High-Hispanic supply is a dial-system problem** — splits define *what* stations are; `spanishLaunches` / mega supplemental schedule define *how many* and *when*.
5. **Under-splitting is safer than over-splitting** for Phase 1 playable markets; mega markets get full lattice first.

---

## 2. Proposed format registry (summary table)

Canonical **legacy ID** proposals (subject to sign-off before `FM{}`):

| ID | Player-facing label | Unlock (proposed) | Player-selectable (Phase 1) |
|----|---------------------|-------------------|-----------------------------|
| `SPANISH_VARIETY` | Spanish Variety | 1978 | AI-only → Phase 3 review |
| `SPANISH_CONTEMPORARY` | Spanish Contemporary | 1990 | AI-only |
| `SPANISH_ADULT_HITS` | Spanish Adult Hits | 2002 | AI-only |
| `REGIONAL_MEXICAN` | Regional Mexican | 1985 | AI-only → Phase 4 selective |
| `SPANISH_TROPICAL` | Spanish Tropical | 1988 | AI-only |
| `SPANISH_NEWS_TALK` | Spanish News / Talk | 1992 | AI-only |
| `SPANISH_SPORTS_TALK` | Spanish Sports Talk | 1998 | AI-only |
| `SPANISH_RELIGIOUS` | Spanish Religious | 1975 | AI-only (rival); institutional parallel TBD |

**Umbrella retention:** `SPANISH` remains in saves and `FM{}` until migration completes; maps to **subtype inference** or nearest split via diagnostic tags (§5).

---

## 3. Per-format specification

### 3.1 Spanish Variety (`SPANISH_VARIETY`)

| # | Field | Definition |
|---|--------|------------|
| 1 | **Player-facing label** | Spanish Variety |
| 2 | **Family** | `SPANISH` |
| 3 | **Launch / viability era** | **1978–1995** viable; decline **1995–2005** (FM niche formats eat variety); floor as AM daypart / brokered-adjacent **2005+** |
| 4 | **Market conditions** | Early Hispanic AM; low FM penetration; markets with **1970s–80s** ethnic AM heritage; pre-consolidation dial |
| 5 | **Demographic / ecology drivers** | `hispPop1970` moderate+; `spanishLanguageStrength` ≥ 0.35; **low** `modernMusicSubstitution`; AM-viable |
| 6 | **Competing English formats** | `MOR`, `ADULT_STANDARDS`, `GOSPEL`, brokered blocks; later `ADULT_CONTEMP` |
| 7 | **Overlap with Spanish formats** | Parent of nothing; **superseded by** Contemporary, Regional Mexican, Tropical as FM matures |
| 8 | **Positioning slider** | **Variety ↔ Gold hits** (AM carousel) — optional Phase 4; or inherit umbrella pole until split |
| 9 | **Lifecycle notes** | Low `modernRetention`; historic anchor only; national lane `ethnic` with **early peak** |
| 10 | **Market preference** | **LA** (AM heritage), **NYC**, **Chicago** (early ethnic AM); weak **Phoenix** post-1990; weak **Miami** (bilingual FM market) |
| 11 | **Selectable?** | **AI-only** (Phase 0–2); player sees umbrella `SPANISH` |

---

### 3.2 Spanish Contemporary (`SPANISH_CONTEMPORARY`)

| # | Field | Definition |
|---|--------|------------|
| 1 | **Player-facing label** | Spanish Contemporary |
| 2 | **Family** | `SPANISH` |
| 3 | **Launch / viability era** | **1990–2010** peak; **2010–2026** stable but streaming-pressured |
| 4 | **Market conditions** | Hispanic **FM** clusters; **Mexican-American + Central American** youth; markets where Spanish CHR competes with English CHR |
| 5 | **Demographic / ecology drivers** | High `spanishLanguageStrength`; `hispPop2000` trajectory; competes with `modernMusicSubstitution` / CHR damp |
| 6 | **Competing English formats** | `TOP40`, `RHYTHMIC`, `HOT_AC`, `URBAN_CONTEMP` |
| 7 | **Overlap** | vs `SPANISH_ADULT_HITS` (older demo); vs `REGIONAL_MEXICAN` (format pole); vs `SPANISH_TROPICAL` (rhythm lane) |
| 8 | **Positioning slider** | **Pop ↔ Urbano** (reggaeton-forward post-2005) |
| 9 | **Lifecycle notes** | Successor to variety; national ethnic lane **growth** post-2000 |
| 10 | **Market preference** | **LA**, **Miami**, **Houston/SA** (future); **Phoenix** moderate; **NYC** moderate (competes with English CHR) |
| 11 | **Selectable?** | AI-only → **Phase 4** candidate for LA/Miami playable |

---

### 3.3 Spanish Adult Hits (`SPANISH_ADULT_HITS`)

| # | Field | Definition |
|---|--------|------------|
| 1 | **Player-facing label** | Spanish Adult Hits |
| 2 | **Family** | `SPANISH` |
| 3 | **Launch / viability era** | **2002–2026**; no meaningful pre-2000 |
| 4 | **Market conditions** | Second / third Spanish FM; **35–54** Hispanic; Jack-FM-style gold mix in Spanish |
| 5 | **Demographic / ecology drivers** | Mature Hispanic FM penetration; moderate `chrResistance` in market helps English AC, not this lane |
| 6 | **Competing English formats** | `HOT_AC`, `ADULT_CONTEMP`, `CLASSIC_HITS`, `OLDIES` |
| 7 | **Overlap** | vs `SPANISH_CONTEMPORARY` (current hits vs gold); vs `REGIONAL_MEXICAN` (traditional vs recurrent) |
| 8 | **Positioning slider** | **2000s recurrent ↔ 90s gold** |
| 9 | **Lifecycle notes** | Late entrant; `modernRetention` medium-high in Hispanic growth metros |
| 10 | **Market preference** | **LA**, **Miami**; rare **Phoenix**; low **NYC/Chicago** |
| 11 | **Selectable?** | AI-only |

---

### 3.4 Regional Mexican (`REGIONAL_MEXICAN`)

| # | Field | Definition |
|---|--------|------------|
| 1 | **Player-facing label** | Regional Mexican |
| 2 | **Family** | `SPANISH` |
| 3 | **Launch / viability era** | **1985–2026** core Sunbelt format; **1975–1985** emerging on AM |
| 4 | **Market conditions** | `hispPop2020` ≥ 0.25 OR Sunbelt / border proximity; **country-adjacent** culture; Mexican heritage dial |
| 5 | **Demographic / ecology drivers** | High `spanishLanguageStrength`; `culture.spanish`; negative correlation with coastal `countryStrength` suppression |
| 6 | **Competing English formats** | `COUNTRY` (English), `ADULT_CONTEMP`, `CLASSIC_ROCK` (Phoenix pathology) |
| 7 | **Overlap** | vs `SPANISH_TROPICAL` (Caribbean markets); vs `SPANISH_CONTEMPORARY` (youth pop); **dominant** in Phoenix when split |
| 8 | **Positioning slider** | **Banda / Norteño ↔ Grupero / Ranchera** (inherits current `DRIFT.SPANISH` “Regional Mexican” pole) |
| 9 | **Lifecycle notes** | Strong `modernRetention` in Phoenix profile; national ethnic growth |
| 10 | **Market preference** | **Phoenix** (primary), **Houston/SA**, **LA** (shared), **Miami** (lower — Tropical competes) |
| 11 | **Selectable?** | AI-only → **first player-facing split candidate** for Sunbelt DIAG markets |

---

### 3.5 Spanish Tropical (`SPANISH_TROPICAL`)

| # | Field | Definition |
|---|--------|------------|
| 1 | **Player-facing label** | Spanish Tropical |
| 2 | **Family** | `SPANISH` |
| 3 | **Launch / viability era** | **1988–2026**; Caribbean inflection strengthens **1995+** |
| 4 | **Market conditions** | Cuban / Puerto Rican / Caribbean diaspora; **Miami** essential; also NY/NJ |
| 5 | **Demographic / ecology drivers** | `blackMusicStrength` + high Hispanic; `urbanContemporaryStrength` correlation for cross-audience |
| 6 | **Competing English formats** | `URBAN_CONTEMP`, `RHYTHMIC`, `ADULT_CONTEMP` |
| 7 | **Overlap** | vs `REGIONAL_MEXICAN` (Mexican Sunbelt); vs `SPANISH_CONTEMPORARY` (pop vs salsa/bachata core) |
| 8 | **Positioning slider** | **Salsa ↔ Reggaeton / Latin rhythm** |
| 9 | **Lifecycle notes** | Align diagnostic alias `SALSA_TROPICAL` → `SPANISH_TROPICAL` on migration |
| 10 | **Market preference** | **Miami** (primary), **NYC**, **Chicago** (Puerto Rican); weak **Phoenix** |
| 11 | **Selectable?** | AI-only |

---

### 3.6 Spanish News / Talk (`SPANISH_NEWS_TALK`)

| # | Field | Definition |
|---|--------|------------|
| 1 | **Player-facing label** | Spanish News / Talk |
| 2 | **Family** | `SPANISH` |
| 3 | **Launch / viability era** | **1992–2026**; AM news heritage earlier (tag as variety subtype pre-1992) |
| 4 | **Market conditions** | Mega Hispanic markets; **spokenWordStrength** high; news culture |
| 5 | **Demographic / ecology drivers** | `spokenWordStrength`, `culture.newsTalk`, `spanishLanguageStrength` ≥ 0.5 |
| 6 | **Competing English formats** | `NEWS_TALK`, `PERSONALITY_TALK`, `ALL_NEWS` (English) |
| 7 | **Overlap** | vs `SPANISH_SPORTS_TALK`; vs music formats (daypart separation on same owner cluster) |
| 8 | **Positioning slider** | **Noticias ↔ Opinión / personality** |
| 9 | **Lifecycle notes** | Spoken lane; separate staffing rules from music (mirror `TALK_FMTS` extension later) |
| 10 | **Market preference** | **LA**, **Miami**, **NYC**; moderate **Chicago**; low **Phoenix** |
| 11 | **Selectable?** | AI-only; **reduces LA single-station Spanish #1** when AI assigns talk vs music |

---

### 3.7 Spanish Sports Talk (`SPANISH_SPORTS_TALK`)

| # | Field | Definition |
|---|--------|------------|
| 1 | **Player-facing label** | Spanish Sports Talk |
| 2 | **Family** | `SPANISH` |
| 3 | **Launch / viability era** | **1998–2026** |
| 4 | **Market conditions** | Markets with **Spanish sports rights** culture; MLS/Liga MX/Serie A fan bases; FM sports clusters |
| 5 | **Demographic / ecology drivers** | `sportsStrength`, `spanishLanguageStrength`, male-skew cohorts |
| 6 | **Competing English formats** | `SPORTS_TALK` |
| 7 | **Overlap** | vs `SPANISH_NEWS_TALK` (sports vs news dayparts) |
| 8 | **Positioning slider** | **Local teams ↔ National soccer / boxing** |
| 9 | **Lifecycle notes** | Late; niche #1 but stabilizes fragmentation |
| 10 | **Market preference** | **LA**, **Miami**, **Houston/SA**; emerging **Phoenix** |
| 11 | **Selectable?** | AI-only |

---

### 3.8 Spanish Religious (`SPANISH_RELIGIOUS`)

| # | Field | Definition |
|---|--------|------------|
| 1 | **Player-facing label** | Spanish Religious |
| 2 | **Family** | `SPANISH` (commercial) or **`INSTITUTIONAL`** if network-owned — **default `SPANISH`** for Phase 0 |
| 3 | **Launch / viability era** | **1975–2026** AM-stable; low ratings ceiling |
| 4 | **Market conditions** | Hispanic AM brokers; **churchGoing** moderate+; not competing for #1 |
| 5 | **Demographic / ecology drivers** | `gospelStrength` / `ccmStrength` weakly correlated; separate from `GOSPEL` (English Black gospel) |
| 6 | **Competing English formats** | `GOSPEL`, `RELIGIOUS_NETWORK` (institutional English Christian) |
| 7 | **Overlap** | Minimal music-format overlap; competes with `SPANISH_VARIETY` on AM |
| 8 | **Positioning slider** | **Catholic traditional ↔ Evangelical contemporary** (optional Phase 4) |
| 9 | **Lifecycle notes** | Low book share; prevents mis-labeling religious AM as Regional Mexican |
| 10 | **Market preference** | **LA**, **Chicago**, **Houston/SA**; universal low share |
| 11 | **Selectable?** | **AI-only**; likely **never** player mainstream pick |

---

## 4. High-Hispanic mega supply model

### 4.1 Layers (do not conflate)

```text
┌─────────────────────────────────────────────────────────────┐
│  A. Format splits (this spec) — WHAT programming type        │
├─────────────────────────────────────────────────────────────┤
│  B. Station supply — HOW MANY signals (spanishLaunches,     │
│     HIGH_HISPANIC_MEGA_SPANISH_SUPPLEMENTAL, tier inject)     │
├─────────────────────────────────────────────────────────────┤
│  C. Appeal / lifecycle — HOW STRONG per subtype per year      │
│     (formatLifecycle ethnic lane + per-subtype profiles)    │
├─────────────────────────────────────────────────────────────┤
│  D. Leadership physics — WHO wins #1 (intra-lane competition) │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 `isHighHispanicMarket` (today)

- Gate: `hispPop2020 ≥ 0.20` OR `culture.spanish ≥ 0.12`.
- Effects: extra `mktFmt` on `SPANISH`; leader nudges; supplemental mega launches; Phoenix-specific diag hooks.

### 4.3 After split (target behavior)

| Supply mechanism | Phase 2 behavior |
|------------------|------------------|
| `MARKETS[id].spanishLaunches[]` | Each launch specifies **`fmt`** = split ID (e.g. `REGIONAL_MEXICAN`) |
| Mega supplemental schedule | Stagger **subtypes** (1994 RM, 1998 Tropical, 2002 Contemporary) not three `SPANISH` |
| Tier inject | Last resort; prefer subtype-specific inject lists per archetype |
| Diagnostic subtype tags | Stations still `SPANISH` in saves but carry `station._diagSpanishSubtype` until Phase 3 |

### 4.4 Fixing known pathologies

| Market | Issue | Split-based remedy |
|--------|-------|-------------------|
| **LA** | One `SPANISH` wins #1 ~75% runs | Allocate launches across **Contemporary + Regional Mexican + News/Talk**; intra-family HHI rises |
| **Phoenix** | ~15% Spanish book vs ~30% Hispanic | Default new Spanish FM to **`REGIONAL_MEXICAN`**; reduce Classic Rock leader cap interaction; align `spanishLaunches` subtype |
| **Miami** | Book ~19% OK, subtype wrong | **`SPANISH_TROPICAL`** + **Contemporary** dual FM |
| **NYC / Chicago** | Spanish modest | **Variety** AM + **News/Talk**; avoid over-supplying Mexican FM |

---

## 5. Migration path from umbrella `SPANISH`

### Phase 0 (this document) — **no gameplay keys**

- [x] Spec + registry table
- [ ] Extend `data/formatFamilies.v1.json` `plannedIds` / `legacyIdMap` stubs (metadata only)
- [ ] Extend `scripts/spanishLanguageFormats.mjs` to reference this spec
- [ ] Lint rules: every planned `SPANISH_*` maps to family `SPANISH`

### Phase 1 — Diagnostic subtype tags (no save migration) — **implemented**

1. **Catalog:** [`data/spanishFormats.v1.json`](../data/spanishFormats.v1.json) — six subtypes (no `SPANISH_RELIGIOUS`; religious → `BROKERED_PROGRAMMING`).
2. **Inference:** [`scripts/spanishSubtypeHelpers.mjs`](../scripts/spanishSubtypeHelpers.mjs) — `inferSpanishSubtype(market, year, station)` via market traits + ecology + station traits (AM/FM, launch era). Multi-station books use `resolveSpanishDialSlotPlan()` for market-specific slot rotation (LA / NYC / Chicago / Miami / RM-dominant Sunbelt) when ≥2 Spanish stations — diagnostic only, no per-market gameplay hacks.
3. **Reporting:** [`scripts/spanishSubtypeDiagnostics.mjs`](../scripts/spanishSubtypeDiagnostics.mjs) — subtype counts, share-of-Spanish-mass, leadership-by-subtype in ecology regression + Phoenix / LA / NYC truth audits.
4. Optional future: harness field `_diagSpanishSubtype` on station objects (not required for Phase 1 reports).

### Phase 2 — AI / rival generation only

1. Rivals and `spanishLaunches` spawn split IDs.
2. Player stations remain `SPANISH` with display label mapping from slider → subtype.
3. `appl()` accepts split IDs; umbrella alias `SPANISH` → inferred subtype for appeal tables.
4. `DRIFT.SPANISH` poles **migrate** to `DRIFT.REGIONAL_MEXICAN` + `DRIFT.SPANISH_CONTEMPORARY`.

### Phase 3 — Player format picker + saves

1. Add `FM{}` entries (unlock years per §2).
2. `migrateSave`: map `SPANISH` → most likely subtype by market/year seed (deterministic).
3. Reformat graph edges between Spanish splits (see §6).
4. Enable player select for **Regional Mexican**, **Spanish Contemporary** in high-Hispanic markets only.

### Phase 4 — Lifecycle + ecology per subtype

1. `formatLifecycle.v1.json` national rows per subtype OR profile blocks under `marketProfiles`.
2. Retire umbrella `SPANISH` lifecycle row when all stations migrated.
3. Remove `DRIFT.SPANISH` umbrella slider.

---

## 6. Reformat graph (planned)

Mirror English adjacency; Spanish splits are **more constrained** (no path from Religious to Contemporary without brokered).

| From | To (allowed) | Notes |
|------|----------------|-------|
| `SPANISH_VARIETY` | `REGIONAL_MEXICAN`, `SPANISH_CONTEMPORARY`, `SPANISH_NEWS_TALK` | AM upgrade path |
| `REGIONAL_MEXICAN` | `SPANISH_CONTEMPORARY`, `SPANISH_ADULT_HITS` | Youth shift |
| `SPANISH_CONTEMPORARY` | `SPANISH_ADULT_HITS`, `RHYTHMIC`* | *English only if bilingual station rules added later |
| `SPANISH_TROPICAL` | `SPANISH_CONTEMPORARY` | Rhythm → pop |
| `SPANISH_NEWS_TALK` | `SPANISH_SPORTS_TALK` | Spoken lane |
| `SPANISH_RELIGIOUS` | `BROKERED_PROGRAMMING` | Economic exit |

`*` Cross-family reformat to English formats remains **out of scope** until bilingual stations exist (`BILINGUAL_AC` diagnostic placeholder).

---

## 7. Interaction with format families & lifecycle

| Layer | Umbrella today | After split |
|-------|----------------|-------------|
| **formatFamilies.v1.json** | `SPANISH` family | All `SPANISH_*` + `REGIONAL_MEXICAN` → `family: SPANISH` |
| **Family bucket diag** | Sum all Spanish IDs | Same sum; subtype breakdown report |
| **formatLifecycle ethnic lane** | One `SPANISH` national row | **Phase 4:** per-subtype rows with shared `spanishGrowth` interaction |
| **marketProfiles** (e.g. Phoenix) | `SPANISH.modernRetention` | Split: high RM retention, lower Tropical |

---

## 8. Risks of over-splitting

| Risk | Mitigation |
|------|------------|
| **Too few stations per subtype** | Minimum 1.5 mean stations per subtype before reporting subtype #1; collapse to umbrella under threshold |
| **Player cognitive load** | Delay player picker; AI-only through Phase 2 |
| **Save bloat / migration bugs** | Deterministic `SPANISH` → subtype map; alias backwards compatibility 5 years |
| **Reformat graph explosion** | Allow only **adjacent** subtypes; no 8-way complete graph |
| **Double-counting appeal** | Single `appl()` path per station; no stacking umbrella + subtype mult |
| **Low-Hispanic markets** | Subtype launches **gated** off below `isHighHispanicMarket`; NYC/Chicago stay 0–2 Spanish signals |
| **Diag / gameplay drift** | Phase 1 tags harness-only; lint blocks `_diag*` in production paths |

---

## 9. Implementation phases (0 / 1 / 2)

### Phase 0 — Spec & metadata (current)

- This document.
- `plannedIds` in `formatFamilies.v1.json` (no `FM{}`).
- Cross-links in `FORMAT_FAMILY_ARCHITECTURE.md`, `spanishLanguageFormats.mjs` header.
- Truth-audit checklist rows for subtype tags (manual).

### Phase 1 — Diagnostics only — **in progress / landed**

- [x] `data/spanishFormats.v1.json` + `inferSpanishSubtype` in `scripts/spanishSubtypeHelpers.mjs`
- [x] `lint:format-families` validates Phase 1 subtypes are not in `FM{}`
- [x] `diag:market-ecology-regression` Spanish block + `spanish_format_diag.json` subtype section
- [x] Phoenix / LA / NYC truth audits: subtype distribution section + JSON artifact
- [ ] `diag:format-family-buckets` optional `--spanish-subtypes` (future)
- **Success criteria (unchanged):** LA umbrella Spanish #1 wins drop **in diagnostic sim** when subtypes compete without changing `appl()` — requires Phase 2+ competitive wiring.

### Phase 2 — AI / launch wiring (DIAG markets first)

- `spanishLaunches[].bp.fmt` uses split IDs on Phoenix, Miami, LA (DIAG_ONLY).
- Rival gen uses subtype weights.
- Umbrella `SPANISH` still accepted; maps to subtype at gen.
- **Success criteria:** Phoenix 2026 Spanish book 12–18%; LA 2026 #1 Spanish wins &lt; 50%; no playable market regression.

### Phase 3+ — Playable + saves

- Full `FM{}` / `DRIFT` / save migration per market sign-off.
- Per-subtype lifecycle profiles.
- Consider **`BILINGUAL_AC`** as separate ADULT-family experiment (not in this split set).

---

## 10. Final proposed format table (canonical)

| ID | Label | Family | Era (core) | Slider (proposed) | LA | Miami | Phoenix | NYC | Chicago | H-Town/SA | AI-only Phase |
|----|-------|--------|------------|-------------------|----|-------|---------|-----|---------|-----------|---------------|
| `SPANISH_VARIETY` | Spanish Variety | SPANISH | 1978–1995 | Variety ↔ Gold | ◐ | ○ | ○ | ◐ | ◐ | ◐ | Yes |
| `SPANISH_CONTEMPORARY` | Spanish Contemporary | SPANISH | 1990–2026 | Pop ↔ Urbano | ● | ● | ◐ | ◐ | ○ | ● | Yes |
| `SPANISH_ADULT_HITS` | Spanish Adult Hits | SPANISH | 2002–2026 | 00s ↔ 90s gold | ◐ | ◐ | ○ | ○ | ○ | ○ | Yes |
| `REGIONAL_MEXICAN` | Regional Mexican | SPANISH | 1985–2026 | Banda ↔ Grupero | ● | ◐ | ● | ○ | ○ | ● | Yes → Phase 4 pick |
| `SPANISH_TROPICAL` | Spanish Tropical | SPANISH | 1988–2026 | Salsa ↔ Reggaeton | ◐ | ● | ○ | ● | ● | ◐ | Yes |
| `SPANISH_NEWS_TALK` | Spanish News / Talk | SPANISH | 1992–2026 | News ↔ Opinion | ● | ● | ○ | ● | ◐ | ◐ | Yes |
| `SPANISH_SPORTS_TALK` | Spanish Sports Talk | SPANISH | 1998–2026 | Local ↔ Soccer | ◐ | ◐ | ◐ | ○ | ○ | ● | Yes |
| `SPANISH_RELIGIOUS` | Spanish Religious | SPANISH | 1975–2026 | Traditional ↔ Evangelical | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | Yes |

**Legend:** ● primary ◐ secondary ○ rare / wrong market fit

---

## 11. Unresolved questions

1. **`REGIONAL_MEXICAN` vs `SPANISH_REGIONAL`** — Keep industry-standard bare name or enforce `SPANISH_` prefix for lint consistency?
2. **`BILINGUAL_AC`** — Separate format (ADULT family) vs Spanish sub-lane for NYC/Miami?
3. **`SPANISH_RELIGIOUS` family** — Stay `SPANISH` or parallel `INSTITUTIONAL` like `RELIGIOUS_NETWORK`?
4. **Tejano / Norteño** — Sub-pole of Regional Mexican only, or ninth format when Houston ships?
5. **LA #1 fix priority** — Subtype supply alone vs required leader-cap / intra-Spanish redistribution (like English TOP40 trim)?
6. **Phoenix** — Is underperformance primarily **subtype** (RM) or **supply timing** (second FM 2002 too late)?
7. **Player-facing umbrella** — Keep “Spanish / Latin” as picker entry that opens subtype chooser, or hide until Phase 4?
8. **`SALSA_TROPICAL` diagnostic ID** — Rename to `SPANISH_TROPICAL` on Phase 1 diag alignment?
9. **Save migration** — One-shot subtype assignment vs keep `SPANISH` forever as alias for lowest subtype share?
10. **Cross-format bilingual simulcast** — FM Spanish + AM English legal in engine today?

---

## 12. Document changelog

| Date | Change |
|------|--------|
| 2026-05-19 | Initial Phase 0 spec (architecture only) |
