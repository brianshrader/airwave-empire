# Diagnostics notes — Phoenix (`phoenix`)

**Scaffold template:** `sunbelt`  
**Scaffold status:** `draft` — not in playable markets

## Readiness (last check)

**State:** `PLAYTEST_READY`  
**Checked:** 2026-05-17T21:35:10.618Z

| Result | Count |
|--------|-------|
| PASS | 17 |
| WARN | 3 |
| FAIL | 0 |

```
[PASS] callPrefix=K
[PASS] rankTier=large
[PASS] revScale=1.18
[PASS] timezone=America/Phoenix
[PASS] region matches geography hint (Southwest)
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
[PASS] signalInventory explicit (viable1983=22, measurable2026=38)
[PASS] signalProfile tier counts match per-frequency metadata
[PASS] 1975 inventory: 14 AM + 9 FM = 23 total (viable 20)
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
| publicRadioStrength | 0.178 |
| spanishLanguageStrength | 0.457 |
| blackMusicStrength | 0.260 |
| urbanContemporaryStrength | 0.200 |
| gospelStrength | 0.555 |
| ccmStrength | 0.716 |
| countryStrength | 0.499 |
| aaaAlternativeStrength | 0.228 |
| spokenWordStrength | 0.421 |
| sportsStrength | 0.636 |
| chrResistance | 0.276 |
| marketFragmentation | 0.560 |
| amResilience | 0.587 |
| modernMusicSubstitution | 0.418 |

## Ecology by year

| Year | chrResistance | marketFragmentation | modernMusicSubstitution | countryStrength | publicRadioStrength |
|------|---------------|---------------------|-------------------------|-----------------|---------------------|
| 1970 | 0.21 | 0.55 | 0.00 | 0.50 | 0.18 |
| 1985 | 0.21 | 0.56 | 0.00 | 0.50 | 0.18 |
| 1995 | 0.21 | 0.56 | 0.00 | 0.50 | 0.18 |
| 2005 | 0.20 | 0.56 | 0.00 | 0.50 | 0.18 |
| 2015 | 0.24 | 0.56 | 0.22 | 0.50 | 0.18 |
| 2026 | 0.28 | 0.56 | 0.42 | 0.50 | 0.18 |

## Likely strong formats (heuristic from 2026 traits)

- **COUNTRY** (50% trait proxy)
- **GOSPEL / CCM / RELIGIOUS_NETWORK** (64% trait proxy)
- **SPANISH** (46% trait proxy)
- **SPORTS_TALK** (64% trait proxy)

## Likely weak / pressured formats

- **AAA / ALT_ROCK / ALBUM_ROCK** (low aaaAlternativeStrength)
- **PUBLIC_NEWS / PUBLIC_ECLECTIC / PUBLIC_JAZZ** (low publicRadioStrength)

## Signal inventory (tier targets)

| Era | Value | large-tier target | Source |
|-----|-------|-----------------------------|--------|
| 1975 historical | 14 AM / 9 FM / 23 total | historical dial | explicit |
| 1983 viable | 22 | 18–26 | explicit |
| 2026 measurable | 38 | 32–42 | explicit |

Primary full-power on dial: **35** (12 AM + 23 FM; 0 excluded translator/HD). Dial listed: 35. Profile grand total: 35. 

Anchor phoenix (large); ~22 viable (1983); ~38 measurable (2026)
Notes: Approximate mid-1970s Phoenix dial anchor (14 AM / 9 FM / 23 total; viable 20) — modern dial is larger and must not be assumed for 1970s starts. Large-market anchors: ~22 viable (1983), ~38 measurable (2026). Dial lists 35 gameplay tokens (12 AM + 23 FM incl. 3 reserved-band NCE); measurable includes fragmentation/rimshots in book.


## Revenue assumptions (draft)

| Field | Value | Note |
|-------|-------|------|
| rankTier | large | Drives dial depth + inventory targets |
| revScale | 1.18 | Compare Nielsen revenue rank |
| adxBonus | 0.025 | Template default until sourced |
| timezone | America/Phoenix | Required for merge readiness |
| teams | 4 | Replace TODO team names/fees |

## Workflow commands

```bash
# After editing raw_market_data.json:
npm run scaffold:market -- --city=phoenix --derive
npm run scaffold:market -- --city=phoenix --check

# After MARKETS merge + market-ids.cjs:
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=phoenix --runs=8
# Then save summary to ecology_regression_record.json and re-run --check
```

## Scaffold warnings

- Real-data draft (May 2026) — demographics sourced to Nielsen FA24 / Census anchors.
- signalProfile is a first-pass gameplay tier draft — set _scaffold.signalReviewed after competitive signal review.
- Reserved-band FM (88.3 / 89.5 / 91.5) added for NCE/public/CCM scaffold capacity — not full FCC dial pass.
- Dial lists are Phoenix-specific (not sunbelt template) but _scaffold.dialReviewed remains false until human FCC pass (after signalReviewed).
- revScale and team fees need finance pass before merge.
- Do not add to playable market lists until MERGE_READY and explicit sign-off.
