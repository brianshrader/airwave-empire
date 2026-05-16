# Market ecology migration plan — trait consumption map + rollout

**Principles:** No save-schema changes; no global “nerf TOP40” without diagnostics; prefer `deriveMarketEcology(market, marketId, year, G)` (or `marketEcologySnapshotForGameplay` in `legacy.js`) over new `marketId` branches; keep **legacy fallbacks** when IIFE globals are absent (VM/tools without inject).

---

## 1. Trait inventory (from `deriveMarketEcology`)

| Trait | Typical use |
|-------|----------------|
| `publicRadioStrength` | Public dial count / NCE tier / noncom news competition insulation |
| `spanishLanguageStrength` | Spanish format lift, CHR dampening, substitution bleed |
| `blackMusicStrength` | Urban / rhythmic / soul lanes |
| `urbanContemporaryStrength` | Youth / CHR dampening, urban lanes |
| `gospelStrength` | Commercial gospel fit, religious adjacency |
| `ccmStrength` | CCM / religious institutional presence |
| `countryStrength` | Country appeal + “music city” civic proxies |
| `aaaAlternativeStrength` | AAA / alt credibility, AI plausibility |
| `spokenWordStrength` | Talk density, AM news viability |
| `sportsStrength` | Sports talk share priors |
| `chrResistance` | CHR / TOP40 era pressure (already → `modernChrPressure01`) |
| `marketFragmentation` | FM fragmentation, dial competition |
| `amResilience` | AM music / heritage holdouts |
| `modernMusicSubstitution` | Streaming-era substitution (paired with CHR resistance) |

---

## 2. Gameplay system → trait map

### Ratings / appeal (`appl` and helpers)

| System | Traits (primary → secondary) | Notes |
|--------|-------------------------------|-------|
| Gospel appeal delta / fit | `gospelStrength`, `blackMusicStrength`, `urbanContemporaryStrength` | Replace per-city `marketId` bumps |
| AAA plausibility + AAA era mult | `aaaAlternativeStrength`, `marketFragmentation`, `edu` raw | Phase 3A: AAA plausibility uses trait when IIFE present |
| CHR / hits lineage pressure | `chrResistance`, `modernMusicSubstitution`, `spanishLanguageStrength`, `urbanContemporaryStrength` | Done via `modernChrPressure01` |
| TOP40 substitution bleed | Same + on-air format presence | Done Phase 2A |
| Public news / eclectic appeal | `publicRadioStrength` | Tiering still edu/civic — migrate gradually |
| Talk / news AM tweaks | `spokenWordStrength`, `sportsStrength` | Replace mega benchmark id lists where possible |
| FM preference mult | `marketFragmentation`, `amResilience` + raw `fmMusicFragMult` | Keep global era curve |

### Dial generation

| System | Traits | Notes |
|--------|--------|-------|
| `computePublicStationTargetCount` / expansion | `publicRadioStrength`, `countryStrength` (civic-music proxy) | Phase 3A: `countryStrength` replaces Nashville-only third-public gate when ecology present |
| Religious network institutional core | `gospelStrength`, `ccmStrength`, `countryStrength` | Phase 3A thresholds when ecology present |
| Commercial station targets / BP | `marketFragmentation`, `rankTier`, raw `revScale` | Mostly raw + tier |

### AI

| System | Traits |
|--------|--------|
| AAA candidate scoring | `aaaAlternativeStrength`, `modernMusicSubstitution` |
| Gospel flip / plausibility | `gospelStrength`, `gospelStrength` blend in fit |
| Format gap-fill weights | `marketFragmentation`, `spokenWordStrength`, `countryStrength` |

### Revenue

| System | Traits |
|--------|--------|
| `MARKET_FMT_ADJ` | Map each format column to trait-derived multiplier (e.g. NEWS_TALK ← `spokenWordStrength`, AAA ← `aaaAlternativeStrength`, SPANISH ← `spanishLanguageStrength`) + **cap** ±10% |

### Cold start

| System | Traits |
|--------|--------|
| `applyModernColdStartCommercialIncumbentConcentration` | `chrResistance`, `marketFragmentation`, `spokenWordStrength` to pick **which** formats get incumbent lift — **not in Phase 3A** (save-sensitive behavior) |

---

## 3. Phased rollout (recommended)

| Phase | Scope |
|-------|--------|
| **3A (done / partial)** | `marketEcologySnapshotForGameplay`; AAA plausibility; gospel fit blend; religious network presence core; public third-station + large expansion `countryStrength` gate; callers pass `year,G` where needed |
| **3B** | `gospelCommercialMarketAppealDelta` city table → traits; `applyMarketOpeningShape` → traits |
| **3C** | Replace `MARKET_FMT_ADJ` with trait-derived `marketFormatMonMult` + JSON fallback |
| **3D** | Public NCE tier S-score: inject `publicRadioStrength` |
| **4** | Cold-start incumbent **selection** trait-driven (behind flag + diagnostic) |

---

## 4. Task 5 — Market scaffold factory (design only)

### CLI (future)

```bash
npm run scaffold:market -- --city=phoenix
```

### Pipeline

1. **Input:** `--city=phoenix` (slug), optional `--fccRank`, `--population`, `--archetypeHint`.
2. **Raw demographic JSON** — Census-style fields already used in ecology (`hispPop*`, `blackPop`, `urbanBonus`, `culture.*`, `churchGoing`, `eduIndex`, `publicCivicIndex`, …).
3. **Revenue calibration JSON** — `revScale`, `fmMusicFragMult`, billing curve anchor inputs.
4. **Derived ecology JSON** — run `deriveMarketEcology` on the candidate row + scenario years `[1995,2010,2026]` for sanity.
5. **Suggested `MARKETS` row** — TypeScript-shaped object matching existing keys used by `legacy.js`.
6. **Diagnostics report** — same metrics as `diag-market-ecology-regression.mjs` (single-run smoke).
7. **Assumptions notes** — archetype choice, missing-field defaults, comparison to nearest neighbor market.

### Engineering

- **Package:** script in `scripts/scaffold-market.mjs` (not implemented in Phase 3A).
- **Validation:** `marketTraitProfile` + `report-market-traits` must accept new id once added to `market-ids.cjs` / `ALL_PLAYABLE_MARKET_IDS`.
- **Expansion:** Top-50 = 50 rows of raw JSON + one codegen pass; **no** new `if (marketId === 'phoenix')` in gameplay.

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| IIFE missing in some harnesses | Keep **legacy branches** for all Phase 3A hooks |
| Trait thresholds drift calibration | `diag-market-ecology-regression.mjs` + tier diag before/after |
| Religious / public dial count regressions | Compare `computeReligiousNetworkPresence` slot counts vs baseline CSV |

---

*Living document — update per phase completion.*
