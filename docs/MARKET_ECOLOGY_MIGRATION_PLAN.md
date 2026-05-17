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

## 4. Market scaffold workflow (v1 — diagnostic only)

**Docs:** [MARKET_ADD_CHECKLIST.md](./MARKET_ADD_CHECKLIST.md) · [MARKET_DATA_SCHEMA.md](./MARKET_DATA_SCHEMA.md)

### CLI

```bash
npm run scaffold:market -- --city=phoenix
npm run scaffold:market -- --city=phoenix --template=sunbelt
npm run scaffold:market -- --city=portland --template=west_fm_fragmented --out=tmp/market_scaffold/portland
```

**Templates (built-in, no live fetch):** `sunbelt`, `northeast_mega`, `west_fm_fragmented`, `southern_country`, `midwest_legacy`, `coastal_secular`, `plains_small`

**Output folder:** `tmp/market_scaffold/<cityId>/`

| File | Purpose |
|------|---------|
| `raw_market_data.json` | Draft market row + `_scaffold` metadata and TODO source notes |
| `derived_ecology.json` | `deriveMarketEcology` for 1970, 1985, 1995, 2005, 2015, 2026 |
| `suggested_MARKETS_row.js` | Copy-paste `MARKETS` entry (commented warnings) |
| `diagnostics_notes.md` | Trait summary, format heuristics, revenue notes, post-merge commands |

### Pipeline (human-in-the-loop)

1. Run scaffold → edit `raw_market_data.json` with real sources.
2. Re-run scaffold or hand-edit `derived_ecology.json` after demographic changes.
3. Merge reviewed `suggested_MARKETS_row.js` into `src/legacy.js` `MARKETS`.
4. Add id to `scripts/market-ids.cjs`, billing/plan lists, scenario picker.
5. Run `report-market-traits`, `diag:market-ecology-regression`, tier concentration diag.

**Not in v2:** automatic `legacy.js` insertion, FCC/Census API fetch, gameplay changes, adding cities to playable lists from scaffold alone.

### Readiness gates (v2)

```bash
npm run scaffold:market -- --city=<slug> --derive   # refresh after raw edits
npm run scaffold:market -- --city=<slug> --check    # DRAFT → … → MERGE_READY
```

See [MARKET_ADD_CHECKLIST.md](./MARKET_ADD_CHECKLIST.md) and [MARKET_DATA_SCHEMA.md](./MARKET_DATA_SCHEMA.md). Check writes `readiness.json` and updates `diagnostics_notes.md` with last results.

### Engineering

- **Script:** `scripts/scaffold-market.mjs`
- **Validation:** `marketTraitProfile` + `report-market-traits` after id is in `market-ids.cjs` / `ALL_PLAYABLE_MARKET_IDS`.
- **Expansion:** Top-50 = repeated scaffold + review; **no** new `if (marketId === 'phoenix')` in gameplay.

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| IIFE missing in some harnesses | Keep **legacy branches** for all Phase 3A hooks |
| Trait thresholds drift calibration | `diag-market-ecology-regression.mjs` + tier diag before/after |
| Religious / public dial count regressions | Compare `computeReligiousNetworkPresence` slot counts vs baseline CSV |

---

*Living document — update per phase completion.*
