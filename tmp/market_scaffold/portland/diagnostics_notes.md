# Diagnostics notes — Portland (`portland`)

**Scaffold template:** `west_fm_fragmented`  
**Scaffold status:** `draft` — not in playable markets

## Readiness (last check)

**State:** `PLAYTEST_READY`  
**Checked:** 2026-05-17T18:45:31.410Z

| Result | Count |
|--------|-------|
| PASS | 17 |
| WARN | 3 |
| FAIL | 0 |

```
[PASS] callPrefix=K
[PASS] rankTier=large
[PASS] revScale=1.38
[PASS] timezone=America/Los_Angeles
[PASS] region matches geography hint (West Coast)
[WARN] _scaffold.dialReviewed is not true — confirm dial is sourced
[PASS] pop cohorts present
[PASS] culture fields present
[PASS] selectBlurb present
[PASS] teams count=2
[PASS] All core ecology traits present (2026)
[PASS] ecology_regression_record.json present
[WARN] _scaffold.dataReviewed is not true
[PASS] signalProfile present (AM=12, FM=22)
[WARN] _scaffold.signalReviewed is not true — human signal-tier review required
[PASS] Band constraints OK
[PASS] signalInventory explicit (viable1983=20, measurable2026=34)
[PASS] signalProfile tier counts match per-frequency metadata
[PASS] 1975 inventory: 11 AM + 8 FM = 19 total (viable 17)
[PASS] large-tier targets: viable 18–26 (in), measurable 32–42 (in)
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
| publicRadioStrength | 0.830 |
| spanishLanguageStrength | 0.185 |
| blackMusicStrength | 0.187 |
| urbanContemporaryStrength | 0.285 |
| gospelStrength | 0.218 |
| ccmStrength | 0.226 |
| countryStrength | 0.261 |
| aaaAlternativeStrength | 0.754 |
| spokenWordStrength | 0.669 |
| sportsStrength | 0.475 |
| chrResistance | 0.652 |
| marketFragmentation | 0.587 |
| amResilience | 0.513 |
| modernMusicSubstitution | 0.647 |

## Ecology by year

| Year | chrResistance | marketFragmentation | modernMusicSubstitution | countryStrength | publicRadioStrength |
|------|---------------|---------------------|-------------------------|-----------------|---------------------|
| 1970 | 0.54 | 0.58 | 0.00 | 0.26 | 0.83 |
| 1985 | 0.54 | 0.59 | 0.00 | 0.26 | 0.83 |
| 1995 | 0.54 | 0.59 | 0.00 | 0.26 | 0.83 |
| 2005 | 0.54 | 0.59 | 0.00 | 0.26 | 0.83 |
| 2015 | 0.60 | 0.59 | 0.35 | 0.26 | 0.83 |
| 2026 | 0.65 | 0.59 | 0.65 | 0.26 | 0.83 |

## Likely strong formats (heuristic from 2026 traits)

- **AAA / ALT_ROCK / ALBUM_ROCK** (75% trait proxy)
- **NEWS_TALK / SPORTS_TALK / ALL_NEWS** (67% trait proxy)
- **PUBLIC_NEWS / PUBLIC_ECLECTIC / PUBLIC_JAZZ** (83% trait proxy)
- **TOP40 / HOT_AC (era-dependent)** (65% trait proxy)
- **streaming substitution pressure on CHR** (65% trait proxy)

## Likely weak / pressured formats

- **GOSPEL / CCM / RELIGIOUS_NETWORK** (low gospelStrength/ccmStrength)
- **SPANISH** (low spanishLanguageStrength)

## Signal inventory (tier targets)

| Era | Value | large-tier target | Source |
|-----|-------|-----------------------------|--------|
| 1975 historical | 11 AM / 8 FM / 19 total | historical dial | explicit |
| 1983 viable | 20 | 18–26 | explicit |
| 2026 measurable | 34 | 32–42 | explicit |

Primary full-power on dial: **34** (12 AM + 22 FM; 0 excluded translator/HD). Dial listed: 34. Profile grand total: 34. 

Notes: Approximate mid-1970s Portland dial anchor (11 AM / 8 FM / 19 total; viable 17) — modern measurable count includes later FM/rimshot/NCE growth and must not be assumed for 1970s starts. Large-tier but less dense than Phoenix (~22 / ~38). viable1983 is the early-1980s competitive set; measurable2026 includes rimshots, fringe FMs, and reserved-band NCE/public capacity beyond the 34 dial-listed gameplay tokens.


## Revenue assumptions (draft)

| Field | Value | Note |
|-------|-------|------|
| rankTier | large | Drives dial depth + inventory targets |
| revScale | 1.38 | Compare Nielsen revenue rank |
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

- Real-data draft (May 2026) — demographics anchored to Nielsen FA24 / PDX dial research.
- signalProfile first-pass — set _scaffold.signalReviewed after competitive signal review.
- Five reserved-band NCE/public slots — strong OPB cluster vs Phoenix three.
- Dial is Portland-specific (not Seattle template copy); dialReviewed false until human FCC pass.
- Do not add to playable market lists until MERGE_READY and explicit sign-off.
