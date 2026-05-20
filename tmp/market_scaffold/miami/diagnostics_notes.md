# Diagnostics notes — Miami (`miami`)

**Scaffold template:** `sunbelt`  
**Scaffold status:** `draft` — not in playable markets

## Readiness (last check)

**State:** `PLAYTEST_READY`  
**Checked:** 2026-05-17T20:54:53.944Z

| Result | Count |
|--------|-------|
| PASS | 17 |
| WARN | 3 |
| FAIL | 0 |

```
[PASS] callPrefix=W
[PASS] rankTier=large
[PASS] revScale=1.42
[PASS] timezone=America/New_York
[PASS] region matches geography hint (Southeast)
[WARN] _scaffold.dialReviewed is not true — confirm dial is sourced
[PASS] pop cohorts present
[PASS] culture fields present
[PASS] selectBlurb present
[PASS] teams count=4
[PASS] All core ecology traits present (2026)
[PASS] ecology_regression_record.json present
[WARN] _scaffold.dataReviewed is not true
[PASS] signalProfile present (AM=12, FM=23)
[WARN] _scaffold.signalReviewed is not true — human signal-tier review required
[PASS] Band constraints OK
[PASS] signalInventory explicit (viable1983=24, measurable2026=40)
[PASS] signalProfile tier counts match per-frequency metadata
[PASS] 1975 inventory: 10 AM + 7 FM = 17 total (viable 15)
[PASS] large-tier targets: viable 18–26 (in), measurable 32–42 (in)
```

## Template comparison (diagnostic only)

**Template:** `sunbelt`
**Compare to playable markets:** `atlanta`, `nashville`
Sunbelt growth: soul/R&B, Top 40, gospel lanes. Compare Hispanic share to Dallas/Phoenix-type desert metros (often higher than Atlanta).

## Trait summary (2026)

| Trait | Value |
|-------|-------|
| version | 1.000 |
| year | 2026.000 |
| publicRadioStrength | 0.119 |
| spanishLanguageStrength | 0.727 |
| blackMusicStrength | 0.386 |
| urbanContemporaryStrength | 0.575 |
| gospelStrength | 0.620 |
| ccmStrength | 0.609 |
| countryStrength | 0.322 |
| aaaAlternativeStrength | 0.303 |
| spokenWordStrength | 0.365 |
| sportsStrength | 0.651 |
| chrResistance | 0.254 |
| marketFragmentation | 0.683 |
| amResilience | 0.453 |
| modernMusicSubstitution | 0.500 |

## Ecology by year

| Year | chrResistance | marketFragmentation | modernMusicSubstitution | countryStrength | publicRadioStrength |
|------|---------------|---------------------|-------------------------|-----------------|---------------------|
| 1970 | 0.19 | 0.67 | 0.00 | 0.32 | 0.12 |
| 1985 | 0.18 | 0.68 | 0.00 | 0.32 | 0.12 |
| 1995 | 0.18 | 0.68 | 0.00 | 0.32 | 0.12 |
| 2005 | 0.18 | 0.68 | 0.00 | 0.32 | 0.12 |
| 2015 | 0.22 | 0.68 | 0.27 | 0.32 | 0.12 |
| 2026 | 0.25 | 0.68 | 0.50 | 0.32 | 0.12 |

## Likely strong formats (heuristic from 2026 traits)

- **GOSPEL / CCM / RELIGIOUS_NETWORK** (61% trait proxy)
- **SPANISH** (73% trait proxy)
- **URBAN_CONTEMP / SOUL_RNB / RHYTHMIC** (48% trait proxy)
- **SPORTS_TALK** (65% trait proxy)
- **streaming substitution pressure on CHR** (50% trait proxy)

## Likely weak / pressured formats

- **PUBLIC_NEWS / PUBLIC_ECLECTIC / PUBLIC_JAZZ** (low publicRadioStrength)

## Signal inventory (tier targets)

| Era | Value | large-tier target | Source |
|-----|-------|-----------------------------|--------|
| 1975 historical | 10 AM / 7 FM / 17 total | historical dial | explicit |
| 1983 viable | 24 | 18–26 | explicit |
| 2026 measurable | 40 | 32–42 | explicit |

Primary full-power on dial: **35** (12 AM + 23 FM; 0 excluded translator/HD). Dial listed: 35. Profile grand total: 35. 

Notes: Approximate mid-1970s Miami dial (10 AM / 7 FM / 17 total; viable 15) — Cuban AM heritage and early FM only; modern measurable count includes Spanish FM explosion, rimshots, and reserved-band NCE. Large-tier fragmented major market: viable1983 ~24 competitive signals; measurable2026 ~40 book-measurable (dial lists 35 gameplay tokens: 12 AM + 23 FM incl. 3 reserved-band NCE).


## Revenue assumptions (draft)

| Field | Value | Note |
|-------|-------|------|
| rankTier | large | Drives dial depth + inventory targets |
| revScale | 1.42 | Compare Nielsen revenue rank |
| adxBonus | 0.028 | Template default until sourced |
| timezone | America/New_York | Required for merge readiness |
| teams | 4 | Replace TODO team names/fees |

## Workflow commands

```bash
# After editing raw_market_data.json:
npm run scaffold:market -- --city=miami --derive
npm run scaffold:market -- --city=miami --check

# After MARKETS merge + market-ids.cjs:
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=miami --runs=8
# Then save summary to ecology_regression_record.json and re-run --check
```

## Scaffold warnings

- Real-data draft (May 2026) — demographics anchored to Nielsen FA24 / Census trends.
- signalProfile is first-pass gameplay tier draft — set _scaffold.signalReviewed after competitive signal review.
- Reserved-band FM (88.9 / 89.7 / 91.3) for modest NCE/public capacity — not full FCC dial pass.
- Dial lists are Miami-specific (not sunbelt template); dialReviewed false until human FCC pass.
- spanishLaunches / fragmentationLaunches live on MARKETS row in legacy.js (not raw JSON).
- Do not add to playable market lists until MERGE_READY and explicit sign-off.
