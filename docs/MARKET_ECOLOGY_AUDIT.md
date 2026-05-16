# Market ecology audit — city-specific vs trait-driven (`legacy.js` focus)

**Scope:** `src/legacy.js` plus cross-refs noted below. **Goal:** catalog ecology-affecting logic that is **market-id–specific**, **table-driven per city**, or **implicitly “top-8” calibrated**, so we can migrate toward `deriveMarketEcology()` and `MARKETS` raw fields without `marketId === 'seattle'` style patches.

**Legend — migration class**

| Class | Meaning |
|-------|---------|
| **trait-derived** | Should read `deriveMarketEcology` (or a cached snapshot) + `year` + optional `G`. |
| **raw data field** | Belongs on `MARKETS[id]` (or JSON scaffold), not code branches. |
| **explicit override** | Rare `marketOverrides.json`-style escape hatch for real-world exceptions. |
| **remain as-is** | Global mechanics, FCC-ish rules, or not ecology. |

---

## 1. Ratings / appeal

| Location | Function / constant | Logic | Class |
|----------|---------------------|-------|-------|
| `legacy.js` | `appl()` | Large pipeline: cohort FA, lean, FM pref, AM penalties, `modernChrPressure01`, lane crowding, `gospelCommercialMarketAppealDelta`, `gospelCommercialMarketFit01`, `aaaMarketPlausibility01`, `marketFormatMonMult`, etc. | **trait-derived** for market-specific sub-parts; core pipeline remain as-is |
| `legacy.js` | `gospelCommercialMarketAppealDelta` | `marketId === 'atlanta'|'nashville'|'chicago'|'newyork'|'losangeles'|'wichita'|'seattle'|'sanfrancisco'` bumps + archetype | **trait-derived** → `gospelStrength`, `urbanContemporaryStrength`, `blackMusicStrength`, `spanishLanguageStrength` |
| `legacy.js` | `gospelCommercialMarketFit01` | Same pattern + `memphis`/`birmingham` + coastal list | **trait-derived** (Phase 3A blends `gospelStrength` when IIFE loaded) |
| `legacy.js` | `aaaMarketPlausibility01` | edu/rev/tier/arch + **was** Seattle/SF +0.05, Wichita −0.06 | **trait-derived** (Phase 3A: `aaaAlternativeStrength` when IIFE loaded) |
| `legacy.js` | `modernChrPressure01` | Already routes through `__wlDeriveMarketEcology` + `modernChrPressure01FromEcology` with fallback | **trait-derived** ✓ |
| `legacy.js` | `top40ModernSubstitutionBleedExtra01` | Uses ecology for Spanish strength + `modernChrPressure01` | **trait-derived** ✓ |
| `legacy.js` | `fmMusicEraPreferenceMult` | Era × `fmMusicFragMult` on `MARKETS` row | **raw data field** (`fmMusicFragMult`) + remain as-is global curve |
| `legacy.js` | `marketFormatMonMult` / `MARKET_FMT_ADJ` | Per-`marketId` object: NY/LA/Chicago/Seattle/SF/Nashville format revenue multipliers | **trait-derived** replacement target (revenue-only) or **raw data** per-market JSON |
| `legacy.js` | `applyMarketOpeningShape` | NY/LA/Chicago/Nashville OQ nudges by `marketId` | **trait-derived** (country / spokenWord / marketFragmentation) |
| `legacy.js` | `appl` inner blocks ~11810+ | `marketId === 'losangeles'|'newyork'` AM talk tweaks, mega `DEV_BENCHMARK_MEGA_MARKET_IDS` | **explicit override** or **trait-derived** (`spokenWordStrength`, `sportsStrength`) |

---

## 2. Dial / station generation

| Location | Function | Logic | Class |
|----------|----------|-------|-------|
| `legacy.js` | `computePublicStationTargetCount` | Tier + edu/civic + hashes; **was** `mid === 'nashville'` for 3rd public when civic arts | **trait-derived** (Phase 3A: `countryStrength` proxy for “music-city civic arts” when ecology present) |
| `legacy.js` | `computePublicExpansionFormatsAfterBase` | **Was** `mid === 'nashville'` for large-tier eclectic/jazz split threshold | **trait-derived** ✓ (same `countryStrength` gate) |
| `legacy.js` | `computePublicNceTier` / `publicNceTierQuantile01` | Deterministic tier from edu/civic/tier + format; comment mentions Seattle | **trait-derived** → `publicRadioStrength` + raw edu/civic |
| `legacy.js` | `religiousNetworkInstitutionalPresenceCore` | **Was** hard list Nashville/Atlanta/Wichita | **trait-derived** (Phase 3A: `gospelStrength` / `ccmStrength` / `countryStrength` thresholds when ecology present) |
| `legacy.js` | `religiousNetworkCcmCoreMarket`, `religiousNetworkMarketAffinity01` | Archetype / region / `churchGoing` / `culture.religion` | Mostly **raw data**; optional **trait-derived** alignment with `gospelStrength` / `ccmStrength` |
| `legacy.js` | `formatAllowedInMarket` | `FM[fmt].marketsOnly` list | **raw data field** on FM definition |
| `legacy.js` | `applyModernColdStartCommercialIncumbentConcentration` | Tier + format priority list — **no city ids** | **trait-derived** candidate selection (future); **remain as-is** for save stability until designed |

---

## 3. AI behavior

| Location | Function | Logic | Class |
|----------|----------|-------|-------|
| `legacy.js` | `aiGospelFormatPlausibilityMult` | Uses `gospelCommercialMarketFit01` + deltas | **trait-derived** ✓ (fit now blends `gospelStrength` when available) |
| `legacy.js` | AI reformat scoring (~25240+) | `aaaMarketPlausibility01`, format counts, archetypes | **trait-derived** for AAA ✓ |
| `legacy.js` | `aaaMarketPlausibility01` (callers) | `appl` + AI path pass `(marketId, year, G)` | **trait-derived** ✓ |

---

## 4. Revenue-only

| Location | Function | Logic | Class |
|----------|----------|-------|-------|
| `legacy.js` | `MARKET_FMT_ADJ` + `marketFormatMonMult` | City-keyed format monetization ±~10% | **trait-derived** (e.g. `publicRadioStrength` → news, `aaaAlternativeStrength` → AAA) or **explicit override** table |

---

## 5. UI / product (not ecology math but city strings)

| Location | Logic | Class |
|----------|-------|-------|
| `legacy.js` | Pro/starter copy referencing `seattle` / `wichita` / `sanfrancisco` | **remain as-is** (product) |

---

## 6. Constants & lists

| Item | Class |
|------|-------|
| `PHASE1_MARKET_IDS`, `DEV_BENCHMARK_MEGA_MARKET_IDS`, `ALL_PLAYABLE_MARKET_IDS` | **raw data** / build-time config for scaffold |
| `MARKETS` object rows | **raw data** — single source for scaffold output |

---

## 7. Related modules (not exhaustive)

| File | Notes |
|------|-------|
| `src/marketEcologyCore.js` | Canonical `deriveMarketEcology` — **source of truth** for traits |
| `src/marketEcology.js` | Re-exports for Node/report |
| `src/marketTraitProfile.js` | Diagnostic affinities — align naming with gameplay traits over time |
| `scripts/report-market-traits.mjs` | Reporting only |

---

## Summary counts (legacy hotspots)

- **`marketId === '...'`** style appeal / dial / opening-shape: **15+** occurrences in `appl` neighborhood and public/religious helpers (grep `marketId===`).
- **`MARKET_FMT_ADJ`**: **6** cities explicitly keyed.
- **Public / religious “presence”**: previously **4** city hooks (Nashville ×2, Nashville/Atlanta/Wichita relnet); **Phase 3A** replaces relnet core + two public branches when ecology IIFE is present.

---

*Generated for Phase 2/3 architecture migration. Update as code moves.*
