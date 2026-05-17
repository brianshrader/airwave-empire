# Diagnostics notes — Portland (`portland`)

**Scaffold template:** `west_fm_fragmented`  
**Scaffold status:** `draft` — not in playable markets

## Readiness (last check)

**State:** `DRAFT`  
**Checked:** 2026-05-17T14:48:51.596Z

| Result | Count |
|--------|-------|
| PASS | 8 |
| WARN | 4 |
| FAIL | 1 |

```
[PASS] callPrefix=K
[PASS] rankTier=large
[PASS] revScale=1.55
[PASS] timezone=America/Los_Angeles
[PASS] region matches geography hint (West Coast)
[FAIL] Dial lists match untouched template fingerprint (west_fm_fragmented) — FCC review required
[PASS] pop cohorts present
[PASS] culture fields present
[WARN] selectBlurb still contains TODO
[WARN] One or more teams still have TODO names
[PASS] All core ecology traits present (2026)
[WARN] No ecology regression record — run diag after MARKETS merge, save ecology_regression_record.json
[WARN] _scaffold.dataReviewed is not true
```

## Template comparison (diagnostic only)

**Template:** `west_fm_fragmented`
**Compare to playable markets:** `seattle`, `sanfrancisco`
Pacific NW / West FM fragmentation: rock/alt/AAA heritage, educated public radio, lower gospel cluster. Portland-type markets sit between Seattle and SF on Spanish share.

## Trait summary (2026)

| Trait | Value |
|-------|-------|
| version | 1.000 |
| year | 2026.000 |
| publicRadioStrength | 0.752 |
| spanishLanguageStrength | 0.233 |
| blackMusicStrength | 0.241 |
| urbanContemporaryStrength | 0.342 |
| gospelStrength | 0.281 |
| ccmStrength | 0.276 |
| countryStrength | 0.381 |
| aaaAlternativeStrength | 0.718 |
| spokenWordStrength | 0.628 |
| sportsStrength | 0.484 |
| chrResistance | 0.592 |
| marketFragmentation | 0.591 |
| amResilience | 0.560 |
| modernMusicSubstitution | 0.620 |

## Ecology by year

| Year | chrResistance | marketFragmentation | modernMusicSubstitution | countryStrength | publicRadioStrength |
|------|---------------|---------------------|-------------------------|-----------------|---------------------|
| 1970 | 0.49 | 0.59 | 0.00 | 0.38 | 0.75 |
| 1985 | 0.49 | 0.59 | 0.00 | 0.38 | 0.75 |
| 1995 | 0.49 | 0.59 | 0.00 | 0.38 | 0.75 |
| 2005 | 0.48 | 0.59 | 0.00 | 0.38 | 0.75 |
| 2015 | 0.54 | 0.59 | 0.33 | 0.38 | 0.75 |
| 2026 | 0.59 | 0.59 | 0.62 | 0.38 | 0.75 |

## Likely strong formats (heuristic from 2026 traits)

- **AAA / ALT_ROCK / ALBUM_ROCK** (72% trait proxy)
- **NEWS_TALK / SPORTS_TALK / ALL_NEWS** (63% trait proxy)
- **PUBLIC_NEWS / PUBLIC_ECLECTIC / PUBLIC_JAZZ** (75% trait proxy)
- **TOP40 / HOT_AC (era-dependent)** (59% trait proxy)
- **streaming substitution pressure on CHR** (62% trait proxy)

## Likely weak / pressured formats

- (none flagged)

## Revenue assumptions (draft)

| Field | Value | Note |
|-------|-------|------|
| rankTier | large | Drives dial depth targets |
| revScale | 1.55 | Compare Nielsen revenue rank |
| adxBonus | 0.025 | Template default until sourced |
| timezone | America/Los_Angeles | Required for merge readiness |
| teams | 2 | Replace TODO team names/fees |

## Workflow commands

```bash
# After editing raw_market_data.json:
npm run scaffold:market -- --city=portland --derive
npm run scaffold:market -- --city=portland --check

# After MARKETS merge + market-ids.cjs:
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=portland --runs=8
# Then save summary to ecology_regression_record.json and re-run --check
```

## Scaffold warnings

- PLACEHOLDER — template copy; not sourced from Census/Nielsen/FCC.
- Dial lists (amFreqs/fmFreqs/fmFacilityByFreq) require human review before merge.
- Set _scaffold.dialReviewed=true after FCC-sourced dial is verified.
- teams names/fees are TODO stubs.
- Do not add this market to playable lists until readiness is MERGE_READY.
