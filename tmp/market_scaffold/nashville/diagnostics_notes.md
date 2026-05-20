# Diagnostics notes — Nashville (`nashville`)

**Scaffold template:** `southern_country`  
**Scaffold status:** `draft` — not in playable markets

## Readiness (last check)

**State:** `PLAYTEST_READY`  
**Checked:** 2026-05-17T21:37:53.185Z

| Result | Count |
|--------|-------|
| PASS | 16 |
| WARN | 4 |
| FAIL | 0 |

```
[PASS] callPrefix=W
[PASS] rankTier=medium
[PASS] revScale=0.5
[PASS] timezone=America/Chicago
[PASS] region=South
[WARN] _scaffold.dialReviewed is not true — confirm dial is sourced
[PASS] pop cohorts present
[PASS] culture fields present
[PASS] selectBlurb present
[PASS] teams count=3
[PASS] All core ecology traits present (2026)
[PASS] ecology_regression_record.json present
[WARN] _scaffold.dataReviewed is not true
[PASS] signalProfile present (AM=12, FM=14)
[WARN] _scaffold.signalReviewed is not true — human signal-tier review required
[PASS] Band constraints OK
[PASS] signalInventory explicit (viable1983=16, measurable2026=28)
[WARN] signalProfile.am does not match amSignalByFreq tier counts (medium: profile 5 vs metadata 3; small: profile 4 vs metadata 6)
[PASS] 1975 inventory: 10 AM + 4 FM = 14 total (viable 12)
[PASS] medium-tier targets: viable 14–18 (in), measurable 24–32 (in)
```

## Template comparison (diagnostic only)

**Template:** `southern_country`
**Compare to playable markets:** `nashville`, `atlanta`
Country heritage + CCM/gospel institutional tone; weaker coastal secular public curve.

## Trait summary (2026)

| Trait | Value |
|-------|-------|
| version | 1.000 |
| year | 2026.000 |
| publicRadioStrength | 0.156 |
| spanishLanguageStrength | 0.089 |
| blackMusicStrength | 0.362 |
| urbanContemporaryStrength | 0.206 |
| gospelStrength | 0.675 |
| ccmStrength | 0.869 |
| countryStrength | 0.926 |
| aaaAlternativeStrength | 0.065 |
| spokenWordStrength | 0.334 |
| sportsStrength | 0.429 |
| chrResistance | 0.178 |
| marketFragmentation | 0.304 |
| amResilience | 0.733 |
| modernMusicSubstitution | 0.209 |

## Ecology by year

| Year | chrResistance | marketFragmentation | modernMusicSubstitution | countryStrength | publicRadioStrength |
|------|---------------|---------------------|-------------------------|-----------------|---------------------|
| 1970 | 0.14 | 0.30 | 0.00 | 0.93 | 0.16 |
| 1985 | 0.14 | 0.30 | 0.00 | 0.93 | 0.16 |
| 1995 | 0.14 | 0.30 | 0.00 | 0.93 | 0.16 |
| 2005 | 0.14 | 0.30 | 0.00 | 0.93 | 0.16 |
| 2015 | 0.16 | 0.30 | 0.11 | 0.93 | 0.16 |
| 2026 | 0.18 | 0.30 | 0.21 | 0.93 | 0.16 |

## Likely strong formats (heuristic from 2026 traits)

- **COUNTRY** (93% trait proxy)
- **GOSPEL / CCM / RELIGIOUS_NETWORK** (77% trait proxy)

## Likely weak / pressured formats

- **AAA / ALT_ROCK / ALBUM_ROCK** (low aaaAlternativeStrength)
- **SPANISH** (low spanishLanguageStrength)
- **PUBLIC_NEWS / PUBLIC_ECLECTIC / PUBLIC_JAZZ** (low publicRadioStrength)
- **streaming substitution pressure on CHR** (low modernMusicSubstitution)

## Signal inventory (tier targets)

| Era | Value | medium-tier target | Source |
|-----|-------|-----------------------------|--------|
| 1975 historical | 10 AM / 4 FM / 14 total | historical dial | explicit |
| 1983 viable | 16 | 14–18 | explicit |
| 2026 measurable | 28 | 24–32 | explicit |

Primary full-power on dial: **26** (12 AM + 14 FM; 0 excluded translator/HD). Dial listed: 26. Profile grand total: 26. 

Notes: Medium Nashville anchor: 10 AM / 4 FM in 1975; viable1983 ~16; measurable2026 ~28. Dial 12 AM + 14 FM (3 reserved-band). Gameplay MARKETS row uses thinner 9-FM dial — scaffold is ecology-depth superset.


## Revenue assumptions (draft)

| Field | Value | Note |
|-------|-------|------|
| rankTier | medium | Drives dial depth + inventory targets |
| revScale | 0.5 | Compare Nielsen revenue rank |
| adxBonus | 0.03 | Template default until sourced |
| timezone | America/Chicago | Required for merge readiness |
| teams | 3 | Replace TODO team names/fees |

## Workflow commands

```bash
# After editing raw_market_data.json:
npm run scaffold:market -- --city=nashville --derive
npm run scaffold:market -- --city=nashville --check

# After MARKETS merge + market-ids.cjs:
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=nashville --runs=8
# Then save summary to ecology_regression_record.json and re-run --check
```

## Scaffold warnings

- DIAG_ONLY scaffold draft — do not change playable/billing/picker.
- Dial/inventory tuned for tier stress-test; may exceed thin gameplay MARKETS dial where noted.
- Set review flags after human FCC pass.
