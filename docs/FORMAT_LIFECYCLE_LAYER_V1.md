# Format Lifecycle Layer v1 — architecture & migration

**Status:** Design / diagnostics only (v1). No gameplay wiring, no market tuning, no playable-market changes.

**Problem:** `MARKETS` rows and `deriveMarketEcology()` capture **local affinities** well, but **format persistence over decades** can stay too sticky because national era curves are scattered (`FORMAT_SUNSET` in `appl()`, CHR bucket anchors in `marketEcologyCore`, ad-hoc `hitsLineageEraMult`, per-market opening shape). There is no single place that answers: *“How strong should COUNTRY be in Portland in 2026 vs 1985, given both national trend and local culture?”*

**Goal:** A three-layer model that separates **national format lifecycle**, **market affinity modifiers**, and **era × market interaction**, with a data-driven catalog and QA harnesses before any `legacy.js` behavior change.

Related: [FORMAT_FAMILY_ARCHITECTURE.md](./FORMAT_FAMILY_ARCHITECTURE.md), [data/formatFamilies.v1.json](../data/formatFamilies.v1.json) (`npm run lint:format-families`), [MARKET_ECOLOGY_MIGRATION_PLAN.md](./MARKET_ECOLOGY_MIGRATION_PLAN.md), [MARKET_DATA_SCHEMA.md](./MARKET_DATA_SCHEMA.md).

---

## 1. Three-layer model

```
┌─────────────────────────────────────────────────────────────────┐
│  A) National format lifecycle  (format × year → viability 0–1)   │
│     data/formatLifecycle.v1.json + formatLifecycleCore.js        │
└────────────────────────────┬────────────────────────────────────┘
                             │  ×
┌────────────────────────────▼────────────────────────────────────┐
│  B) Market affinity modifiers  (market × format → retention 0–1) │
│     MARKETS culture + deriveMarketEcology traits + optional profile │
└────────────────────────────┬────────────────────────────────────┘
                             │  ⊗  (interaction — see §4)
┌────────────────────────────▼────────────────────────────────────┐
│  C) Era × market interaction  (year gates, resistance, boosts)   │
│     coastal/education/urban/HD-era curves applied per format family │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
              formatLifecyclePrior(...) → directionalWeight 0–1
              (diagnostic index; not book share or appeal mult)
```

| Layer | Question it answers | Stable inputs | Must not do |
|-------|---------------------|---------------|-------------|
| **A — National** | “How big is this format **in the US** at year Y?” | Format id, year | Per-market hacks |
| **B — Market** | “Does this **metro** historically over/under-index?” | `MARKETS` row, ecology traits | Replace station simulation |
| **C — Interaction** | “How does national decline interact with local retention?” | A × B with resist/boost curves | `marketId === 'portland' && year === 2026` |

**Output (v1):** A **directional weight index** per `(formatFamily, marketId, year)` used to compare against regression CSVs and `appl()`-implied stickiness — **not** book share, Nielsen targets, or `#1 leadership probability`.

### Diagnostic semantics (v1 harness)

| Term | Meaning | Display scale |
|------|---------|----------------|
| **National viability index** | Layer A — how viable the format is **nationally** at year Y | 0–100 (index, not share) |
| **Directional weight** | Layers A×B×C per format — **relative** local pull vs other formats in same market/year | 0–100, hard-capped |
| **Relative-to-leader** | Format weight ÷ leader weight × 100 | 0–100 (ranking aid only) |
| **Hits-lane index** | `min(100, TOP40 + HOT_AC + RHYTHMIC)` directional weights | 0–100 capped sum — **not** CHR book % |

Do **not** label directional weights as “share”, “prior %”, or “probability”. Regression **book share** comes from `diag:market-ecology-regression`; lifecycle output is a **directional QA grid** only.

---

## 2. National format lifecycle (layer A)

Each format **family** is defined by piecewise anchors (same interpolation style as `CHR_BUCKET_ERA_ANCHORS` in `marketEcologyCore.js`).

### 2.1 Canonical fields (per format family)

| Field | Meaning |
|-------|---------|
| `emergence` | Year format becomes materially viable nationally (~0.15 viability) |
| `peak` | Year of maximum national cultural pull |
| `plateauEnd` | Optional; end of “still mainstream” before structural decline |
| `declineEnd` | Year viability floors (~0.05–0.12); format may remain as niche |
| `modernRetention` | 0–1: how much peak strength survives into 2020s (1 = sticky, 0 = cliff) |
| `declineSteepness` | 0–1: sharpness of post-peak fade (MOR = steep, Country = gentle) |
| `lane` | Grouping for interaction rules (`hits`, `rock`, `spoken`, `public`, …) |
| `notes` | Human rationale |

**Viability curve (conceptual):**

1. Ramp: `emergence` → `peak` via smoothstep to 1.0  
2. Plateau: optional flat top `peak` → `plateauEnd`  
3. Decline: `plateauEnd` or `peak` → `declineEnd` scaled by `declineSteepness` and `modernRetention` floor  
4. Niche tail: never below `floor` (default ~0.06) before format unlock rules zero it out  

### 2.2 Format catalog (conceptual v1)

| Family | Emergence | Peak | Modern retention | Decline tendency | Comments |
|--------|-----------|------|------------------|------------------|----------|
| **TOP40 / CHR** | ~1955 | **1980–1985** | Low (~0.25) | Steep post-1998 | Dominant in 1980 sims; national lane fragments into HOT_AC / Rhythmic; streaming accelerates 2005+ |
| **HOT_AC** | ~1988 | **2000–2008** | Medium (~0.55) | Moderate | Successor lane to mass-appeal CHR; competes with Top 40 and AAA edges |
| **AC (ADULT_CONTEMP)** | ~1970 | **1985–1995** | Medium-high (~0.65) | Gentle | Workhorse 35–54; stable but not era-defining in 2020s |
| **CLASSIC_HITS** | ~1995 | **2005–2015** | Medium (~0.5) | Moderate | Oldies successor; demo ages out 2010+ |
| **CLASSIC_ROCK** | ~1985 | **1995–2005** | High (~0.75) | Slow | Heritage FM; still credible #1 in fragmented markets |
| **ALBUM_ROCK / AOR** | ~1970 | **1978–1988** | Low (~0.35) | Steep 1990s | Supplanted by Classic Rock / AAA; AM died first |
| **COUNTRY** | ~1960 | **1995–2010** (2nd peak) | High (~0.8) | Slow national fade | **Grows nationally** over decades; local strength varies (coastal resistance) |
| **NEWS_TALK** | ~1985 | **2005–2018** | High (~0.85) | Slow | AM → FM migration; podcast pressure post-2015 |
| **SPORTS_TALK** | ~1990 | **2010–2020** | High (~0.8) | Slow | Tied to team inventory + FM sports clusters |
| **ALL_NEWS** | ~1990 | **1995–2005** | Low (~0.3) | Steep post-2010 | Few markets sustain; edu/coastal boost |
| **PUBLIC** (NCE music/news) | ~1970 | **2010–2026** | Rising (~0.9↑) | None (growth) | Gradual **growth**, especially educated metros; not one format key — lane aggregate |
| **SPANISH** | ~1975 | **2010–2026** | Rising (~0.95↑) | None (growth) | Demographic-driven; `%Hispanic` trajectory dominates |
| **URBAN** (incl. Soul lineage) | ~1970 | **1990–2005** | Medium (~0.55) | Moderate | FM migration from AM; competes with Rhythmic |
| **RHYTHMIC** | ~1995 | **2005–2015** | Medium (~0.5) | Moderate | CHR sub-lane; youth streaming drag |
| **AAA** | ~1985 | **2005–2018** | Medium-high (~0.6) | Gentle | **Emerges later**; edu/fragmented-FM markets |
| **ALTERNATIVE / ALT_ROCK** | ~1988 | **1995–2005** | Medium (~0.45) | Moderate-steep | Select metros; post-peak niche |
| **GOSPEL / CCM** | ~1965 / ~1980 | **1995–2010** | Medium (~0.55) | Split | Commercial gospel vs **RELIGIOUS_NETWORK** institutional; HD/translator era widens CCM footprint post-~2004 |
| **STANDARDS / MOR** | ~1960 | **1972–1980** | Very low (~0.15) | Very steep | **MOR/Standards decline**; overlaps `FORMAT_SUNSET` in `legacy.js` |
| **BEAUTIFUL_MUSIC** | ~1965 | **1975–1985** | Very low | Very steep | Effectively extinct by 1995 gameplay |
| **OLDIES** | ~1975 | **~2000** | Low (~0.35) | Moderate–steep | Aligns `FORMAT_SUNSET`; successor Classic Hits |
| **SOUL / R&B** | ~1965 | **~1978** | Low–medium (~0.42) | Moderate | Yields to Urban Contemporary on FM |
| **PERSONALITY_TALK** | ~1990 | **~2005** | Medium (~0.48) | Moderate | FM hot talk; post-podcast pressure |
| **HOT_AC** (taxonomy) | ~1988 | **2000–2008** | Medium (~0.55) | Moderate | **Canonical family ADULT**; diagnostic lane `hits` for CHR cross-tags (`crossFamilyLaneAllowed`) |

Institutional / non-player formats (`PUBLIC_*`, `RELIGIOUS_NETWORK`) use **lane-level** lifecycle rows for diagnostics, not per-station gameplay keys.

---

## 3. Market affinity modifiers (layer B)

v1 extends (does not replace) `deriveMarketEcology()` traits with **format-facing modifiers**. These are **slow-changing** market identity fields — not year-dependent.

### 3.1 Candidate parameters

| Parameter | Type | Role |
|-----------|------|------|
| `historicStrength` | 0–1 per format family | “Did this market ever index high?” (e.g. Nashville → country) |
| `modernRetention` | 0–1 per format family | Local stickiness **after** national decline (Portland country) |
| `coastalResistance` | 0–1 scalar | Dampens country / gospel / AM heritage |
| `urbanResistance` | 0–1 | Dampens country / MOR; boosts urban/rhythmic |
| `educationBoost` | 0–1 | Boosts PUBLIC, AAA, ALL_NEWS, alt lanes |
| `publicAffinity` | 0–1 | From `publicRadioStrength` / civic index |
| `spanishGrowth` | 0–1 | From Hispanic share trajectory + `culture.spanish` |
| `countryRetention` | 0–1 | Decouples “historic country” from “2026 country” |
| `youthMusicDecay` | 0–1 | How fast CHR/hits fades locally vs national |
| `sportsInventory` | 0–1 | From teams + `sportsStrength` |
| `spokenWordAffinity` | 0–1 | From `spokenWordStrength`, news culture |
| `fragmentationAffinity` | 0–1 | From `marketFragmentation` — more niches survive |

**Derivation (v1 diag):** Map existing ecology traits + `MARKETS.culture.*` + `archetypeId` heuristics into these parameters (see `formatLifecycleCore.js` `deriveMarketFormatModifiers`). Optional future: explicit `formatAffinityProfile` on `MARKETS[id]` for merge-reviewed markets.

### 3.2 Example market sketches (design targets, not tuning)

| Market | Historic | Modern retention | Other |
|--------|----------|------------------|-------|
| **Portland** | Solid country, moderate rock | **Weak** modern country retention | Strong **public** + **AAA** growth; coastal + edu boosts |
| **Nashville** | Very strong country | **Strong** modern country retention | Weak coastal resistance; gospel/ccm elevated |
| **Phoenix** | Moderate country | Moderate country retention | **Stronger Spanish growth**; sunbelt CHR historically high (diag only) |
| **Atlanta** | Strong urban + CHR historic | Medium retention on urban/CHR | Sunbelt gospel; country present not dominant |
| **NYC / LA** | High CHR historic | Low country retention, high fragmentation | ALL_NEWS / spoken elevated; coastal resistance |

These are **QA personas** for harness output — not shipped constants.

---

## 4. Era × market interaction (layer C)

National viability and market modifiers combine with **explicit interaction rules** so we avoid double-counting (e.g. national CHR decline **and** `chrResistance` **and** `FORMAT_SUNSET` all firing independently).

### 4.1 Recommended combine (v1 diagnostic)

```text
nationalViability = nationalLifecycle(format, year)     // layer A, 0–1

marketAffinity = clamp01(
  baseHistoric(historicStrength, format) *
  modernRetentionCurve(format, year, modernRetention) +
  traitBoosts(ecology, format)                           // layer B
)

interaction = eraMarketGate(year, format.lane, ecology)  // layer C
  // examples:
  // - coastalResistance dampens COUNTRY after 1995
  // - educationBoost ramps PUBLIC/AAA after 1990
  // - spanishGrowth scales SPANISH with hispPop(year)
  // - youthMusicDecay accelerates hits decline post-2005 in edu metros
  // - hdTranslatorEraBoost for CCM after 2004

directionalWeight = clamp01( nationalViability * marketAffinity * interaction )
```

**Properties:**

- **Multiplicative** core keeps priors bounded.  
- **Additive trait boosts** capped small (±0.15) to prevent blow-ups.  
- **Resistance** terms are `(1 - resistance × nationalDeclinePhase)` so locals can **hold** format while nation fades (Portland country).  
- **Growth** formats (Spanish, Public) use `(1 + growth × nationalGrowthPhase)` capped.

### 4.2 Overlap with existing systems

| Existing mechanism | Lifecycle layer relationship |
|--------------------|------------------------------|
| `deriveMarketEcology()` traits | Feed layer B; eventually **one** CHR pressure path |
| `CHR_BUCKET_ERA_ANCHORS` | Should **align** with national TOP40/CHR lifecycle (diag diff) |
| `FORMAT_SUNSET` in `appl()` | Subset of layer A for MOR/Beautiful; migrate into catalog |
| `modernChrPressure01` | Layer C for hits lane post-2005 |
| `applyMarketOpeningShape` | **Anti-pattern** for v2 — replace with B+C priors at gen |
| Phoenix `phoenixDiag*` helpers | **Do not extend** — fold into opt-in profile when gameplay wires |

---

## 5. Implementation recommendation

### 5.1 Module placement

| Location | Responsibility |
|----------|----------------|
| **`data/formatLifecycle.v1.json`** | National curves, lane rules, interaction coefficients (authoring) |
| **`src/formatLifecycleCore.js`** | Pure functions: load catalog, `nationalLifecycle`, `deriveMarketFormatModifiers`, `formatLifecyclePrior` |
| **`src/marketEcologyCore.js`** | **Unchanged in v1.** Stays market-trait derivation; may **read** lifecycle priors later for trait calibration |
| **`deriveMarketEcology()`** | **Do not embed lifecycle curves** — keeps “who is this market?” separate from “what year is it for format X?” |
| **`legacy.js`** | **No v1 changes.** Future: read `formatLifecyclePrior` behind `MARKETS[id].formatLifecycleV1 === true` or global dev flag |
| **`scripts/diag-format-lifecycle.mjs`** | Print priors + diff vs ecology regression CSV |

**Do not** fold lifecycle into `marketEcologyCore.js` — file is already trait-focused; mixing causes circular dependencies and makes national curves harder to regression-test in isolation.

Optional later: **`src/formatLifecycle.js`** ESM re-export (mirror `marketEcology.js`) + **`formatLifecycleCore.iife.js`** for VM harnesses.

### 5.2 Example schema (JSON)

See `data/formatLifecycle.v1.json`. Top-level shape:

```json
{
  "version": 1,
  "nationalFormats": {
    "TOP40": {
      "lane": "hits",
      "emergence": 1955,
      "peak": 1982,
      "plateauEnd": 1992,
      "declineEnd": 2020,
      "modernRetention": 0.25,
      "declineSteepness": 0.85,
      "floor": 0.08,
      "notes": "CHR umbrella; aligns with CHR_BUCKET decline"
    }
  },
  "laneInteraction": {
    "hits": { "youthMusicDecayTraitWeight": 0.4, "eduAccelPost2005": 0.12 },
    "country": { "coastalResistanceTraitWeight": 0.35, "postPeakRetentionKey": "countryRetention" }
  },
  "traitToModifier": {
    "publicRadioStrength": { "PUBLIC": 0.35, "AAA": 0.12 },
    "spanishLanguageStrength": { "SPANISH": 0.45 }
  }
}
```

Market-specific overrides (optional, v1.1):

```json
{
  "marketProfiles": {
    "portland": {
      "formatModifiers": {
        "COUNTRY": { "historicStrength": 0.72, "modernRetention": 0.38 },
        "AAA": { "historicStrength": 0.55, "modernRetention": 0.78 }
      }
    }
  }
}
```

**Playable markets:** profiles only via **archetype defaults** until merge-reviewed; no silent edits to `atlanta`, `newyork`, etc.

---

## 6. Migration strategy

| Phase | Deliverable | Gameplay impact |
|-------|-------------|-----------------|
| **0 — Now** | This doc + `formatLifecycleCore.js` + `diag-format-lifecycle` | None |
| **1 — Diagnostics** | Compare `prior` grids to `tmp/market_ecology_regression.csv` by format bucket | None |
| **2 — Alignment** | Tune **national JSON only** until CHR/Country/Public priors match Duncan anchors ± tolerance | None |
| **3 — Opt-in shadow** | `MARKETS[id].formatLifecycleProfile` or `ecologyFlags.useFormatLifecycleV1` — compute prior alongside `appl`, log delta | None (logging) |
| **4 — Appeal wiring** | Replace scattered sunset/CHR gates **per format family** behind flag | Controlled rollout |
| **4a — Portland bridge (shipped)** | `formatLifecycleProfileRuntime.iife.js` → `profileCountryLifecycleMktFmtMult` on COUNTRY `mktFmt` for `marketId==='portland'` only; damp when profile `modernRetention` &lt; national | DIAG_ONLY market; no playable-list change |
| **5 — Gen / AI** | Dial generation & AI format pick use priors | Full migration |

**Harness commands (v1):**

```bash
npm run diag:format-lifecycle
npm run diag:format-lifecycle -- --markets=portland,nashville,phoenix,atlanta --years=1985,1995,2005,2026
npm run diag:market-ecology-regression   # existing — compare side-by-side
```

**Gradual opt-in:** Only markets with explicit profile or `DIAG_ONLY` ids get `marketProfiles` overrides in JSON; playable markets use archetype-derived modifiers until sign-off.

**Save safety:** Priors are derived from `MARKETS` + year + optional `G.streamDrag` — **no new persisted fields**.

---

## 7. Biggest risks

| Risk | Mitigation |
|------|------------|
| **Double-counting** with `appl()` era mults | Shadow-mode diff logs before any wiring; one owner per format family |
| **Overfitting diag markets** | Freeze national JSON; profile overrides only in `marketProfiles` / DIAG_ONLY |
| **Catalog drift** vs `FM{}` keys | Lint script: every commercial `FM` format maps to a lifecycle family |
| **False precision** | Priors are **relatives**, not Nielsen shares; calibrate to bucket totals first |
| **Scope creep** | v1 forbids AI/dial/gen changes; ecology trait rewrites wait for phase 2 |
| **Performance** | Precompute priors per `(market, year)` once per turn in shadow mode, not per cohort in `appl()` |

---

## 8. What NOT to do

- **`if (marketId === 'portland' && year === 2026)`** (or Phoenix) appeal hacks — use profiles + traits.  
- **Immediate `appl()` rewrite** — breaks regression baselines without shadow period.  
- **Bespoke per-market patches in `legacy.js`** — continues `applyMarketOpeningShape` / `phoenixDiag*` sprawl.  
- **Storing lifecycle state on saves** — must remain derivable.  
- **Tuning playable markets** during v1 — diag/archetype only.  
- **Replacing station-level format drift** — lifecycle is a **prior**, not deterministic flips.  
- **Merging into `deriveMarketEcology` without separation** — couples static market identity to national trends.  
- **Exposing diag markets** in picker/billing (`ALL_PLAYABLE_MARKET_IDS`).  

---

## 9. Success criteria (v1 complete)

1. National curves for all commercial families in JSON with documented emergence/peak/decline.  
2. `diag:format-lifecycle` prints stable grids for reference markets (Portland, Nashville, Phoenix, Atlanta + one mega).  
3. Written diff notes: where priors **disagree** with current regression (CHR stickiness, coastal country, public growth).  
4. Migration plan approved before any `legacy.js` flag.  

---

## Appendix: file map (v1 scaffolding)

| Path | Purpose |
|------|---------|
| `docs/FORMAT_LIFECYCLE_LAYER_V1.md` | This document |
| `data/formatLifecycle.v1.json` | National catalog + lane interaction weights |
| `src/formatLifecycleCore.js` | Pure math + trait mapping (diagnostic) |
| `scripts/diag-format-lifecycle.mjs` | CLI harness |

No changes to `src/legacy.js`, playable market lists, or Phoenix/Portland tuning in v1.
