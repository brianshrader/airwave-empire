# Diagnostics notes — New York (`newyork`)

**Scaffold template:** `northeast_mega`  
**Scaffold status:** `draft` — not in playable markets

## Readiness (last check)

**State:** `PLAYTEST_READY`  
**Checked:** 2026-05-17T21:26:03.103Z

| Result | Count |
|--------|-------|
| PASS | 17 |
| WARN | 4 |
| FAIL | 0 |

```
[PASS] callPrefix=W
[PASS] rankTier=mega
[PASS] revScale=6.8
[PASS] timezone=America/New_York
[PASS] region=Northeast
[WARN] _scaffold.dialReviewed is not true — confirm dial is sourced
[PASS] pop cohorts present
[PASS] culture fields present
[PASS] selectBlurb present
[PASS] teams count=6
[PASS] All core ecology traits present (2026)
[PASS] ecology_regression_record.json present
[WARN] _scaffold.dataReviewed is not true
[PASS] signalProfile present (AM=14, FM=30)
[WARN] _scaffold.signalReviewed is not true — human signal-tier review required
[WARN] 89.3 FM in NCE reserved band with non-NCE formatHint PUBLIC_CLASSICAL
[PASS] Band constraints OK (1 warning(s))
[PASS] signalInventory explicit (viable1983=30, measurable2026=48)
[PASS] signalProfile tier counts match per-frequency metadata
[PASS] 1975 inventory: 11 AM + 9 FM = 20 total (viable 18)
[PASS] mega-tier targets: viable 28–35 (in), measurable 45–55 (in)
```

## Template comparison (diagnostic only)

**Template:** `large_coastal (mega)`
**Compare to playable markets:** `newyork`, `losangeles`
Large coastal / mega: fragmented dial, talk-heavy, high revenue. Use northeast_mega template only when Nielsen rank justifies mega tier and revScale.

## Trait summary (2026)

| Trait | Value |
|-------|-------|
| version | 1.000 |
| year | 2026.000 |
| publicRadioStrength | 0.887 |
| spanishLanguageStrength | 0.415 |
| blackMusicStrength | 0.435 |
| urbanContemporaryStrength | 0.757 |
| gospelStrength | 0.453 |
| ccmStrength | 0.326 |
| countryStrength | 0.011 |
| aaaAlternativeStrength | 0.632 |
| spokenWordStrength | 0.815 |
| sportsStrength | 0.992 |
| chrResistance | 0.618 |
| marketFragmentation | 0.826 |
| amResilience | 0.527 |
| modernMusicSubstitution | 0.823 |

## Ecology by year

| Year | chrResistance | marketFragmentation | modernMusicSubstitution | countryStrength | publicRadioStrength |
|------|---------------|---------------------|-------------------------|-----------------|---------------------|
| 1970 | 0.50 | 0.82 | 0.00 | 0.01 | 0.89 |
| 1985 | 0.50 | 0.82 | 0.00 | 0.01 | 0.89 |
| 1995 | 0.50 | 0.82 | 0.00 | 0.01 | 0.89 |
| 2005 | 0.49 | 0.83 | 0.00 | 0.01 | 0.89 |
| 2015 | 0.56 | 0.83 | 0.44 | 0.01 | 0.89 |
| 2026 | 0.62 | 0.83 | 0.82 | 0.01 | 0.89 |

## Likely strong formats (heuristic from 2026 traits)

- **AAA / ALT_ROCK / ALBUM_ROCK** (63% trait proxy)
- **SPANISH** (42% trait proxy)
- **URBAN_CONTEMP / SOUL_RNB / RHYTHMIC** (60% trait proxy)
- **NEWS_TALK / SPORTS_TALK / ALL_NEWS** (82% trait proxy)
- **PUBLIC_NEWS / PUBLIC_ECLECTIC / PUBLIC_JAZZ** (89% trait proxy)
- **SPORTS_TALK** (99% trait proxy)
- **TOP40 / HOT_AC (era-dependent)** (62% trait proxy)
- **streaming substitution pressure on CHR** (82% trait proxy)

## Likely weak / pressured formats

- **COUNTRY** (low countryStrength)

## Signal inventory (tier targets)

| Era | Value | mega-tier target | Source |
|-----|-------|-----------------------------|--------|
| 1975 historical | 11 AM / 9 FM / 20 total | historical dial | explicit |
| 1983 viable | 30 | 28–35 | explicit |
| 2026 measurable | 48 | 45–55 | explicit |

Primary full-power on dial: **44** (14 AM + 30 FM; 0 excluded translator/HD). Dial listed: 44. Profile grand total: 44. 

Anchor newyork (mega); 1975: 11 AM / 9 FM / 20 total; ~30 viable (1983); ~48 measurable (2026)
Notes: Mega NYC anchor: 11 AM / 9 FM in 1975 (20 total); ~30 viable early-1980s; ~48 measurable 2026. Dial lists 14 AM + 30 FM (4 reserved-band 88.1–91.5). Aligns with gameplay MARKETS.newyork.


## Revenue assumptions (draft)

| Field | Value | Note |
|-------|-------|------|
| rankTier | mega | Drives dial depth + inventory targets |
| revScale | 6.8 | Compare Nielsen revenue rank |
| adxBonus | 0.05 | Template default until sourced |
| timezone | America/New_York | Required for merge readiness |
| teams | 6 | Replace TODO team names/fees |

## Workflow commands

```bash
# After editing raw_market_data.json:
npm run scaffold:market -- --city=newyork --derive
npm run scaffold:market -- --city=newyork --check

# After MARKETS merge + market-ids.cjs:
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=newyork --runs=8
# Then save summary to ecology_regression_record.json and re-run --check
```

## Scaffold warnings

- DIAG_ONLY scaffold draft — do not change playable/billing/picker.
- Dial/inventory tuned for tier stress-test; may exceed thin gameplay MARKETS dial where noted.
- Set review flags after human FCC pass.
