# Diagnostics notes — Wichita (`wichita`)

**Scaffold template:** `midwest_legacy`  
**Scaffold status:** `draft` — not in playable markets

## Readiness (last check)

**State:** `PLAYTEST_READY`  
**Checked:** 2026-05-17T21:26:18.015Z

| Result | Count |
|--------|-------|
| PASS | 17 |
| WARN | 3 |
| FAIL | 0 |

```
[PASS] callPrefix=K
[PASS] rankTier=small
[PASS] revScale=0.32
[PASS] timezone=America/Chicago
[PASS] region=Midwest
[WARN] _scaffold.dialReviewed is not true — confirm dial is sourced
[PASS] pop cohorts present
[PASS] culture fields present
[PASS] selectBlurb present
[PASS] teams count=1
[PASS] All core ecology traits present (2026)
[PASS] ecology_regression_record.json present
[WARN] _scaffold.dataReviewed is not true
[PASS] signalProfile present (AM=5, FM=20)
[WARN] _scaffold.signalReviewed is not true — human signal-tier review required
[PASS] Band constraints OK
[PASS] signalInventory explicit (viable1983=12, measurable2026=20)
[PASS] signalProfile tier counts match per-frequency metadata
[PASS] 1975 inventory: 5 AM + 3 FM = 8 total (viable 7)
[PASS] small-tier targets: viable 10–14 (in), measurable 16–24 (in)
```

## Template comparison (diagnostic only)

**Template:** `midwest`
**Compare to playable markets:** `chicago`, `wichita`
Midwest legacy: country/classic rock, AM holdouts fading; medium markets use Wichita scale, large use Chicago.

## Trait summary (2026)

| Trait | Value |
|-------|-------|
| version | 1.000 |
| year | 2026.000 |
| publicRadioStrength | 0.143 |
| spanishLanguageStrength | 0.163 |
| blackMusicStrength | 0.306 |
| urbanContemporaryStrength | 0.233 |
| gospelStrength | 0.408 |
| ccmStrength | 0.639 |
| countryStrength | 0.588 |
| aaaAlternativeStrength | 0.117 |
| spokenWordStrength | 0.285 |
| sportsStrength | 0.186 |
| chrResistance | 0.155 |
| marketFragmentation | 0.215 |
| amResilience | 0.633 |
| modernMusicSubstitution | 0.212 |

## Ecology by year

| Year | chrResistance | marketFragmentation | modernMusicSubstitution | countryStrength | publicRadioStrength |
|------|---------------|---------------------|-------------------------|-----------------|---------------------|
| 1970 | 0.12 | 0.21 | 0.00 | 0.59 | 0.14 |
| 1985 | 0.12 | 0.21 | 0.00 | 0.59 | 0.14 |
| 1995 | 0.12 | 0.21 | 0.00 | 0.59 | 0.14 |
| 2005 | 0.12 | 0.21 | 0.00 | 0.59 | 0.14 |
| 2015 | 0.14 | 0.21 | 0.11 | 0.59 | 0.14 |
| 2026 | 0.16 | 0.21 | 0.21 | 0.59 | 0.14 |

## Likely strong formats (heuristic from 2026 traits)

- **COUNTRY** (59% trait proxy)
- **GOSPEL / CCM / RELIGIOUS_NETWORK** (52% trait proxy)

## Likely weak / pressured formats

- **AAA / ALT_ROCK / ALBUM_ROCK** (low aaaAlternativeStrength)
- **SPANISH** (low spanishLanguageStrength)
- **PUBLIC_NEWS / PUBLIC_ECLECTIC / PUBLIC_JAZZ** (low publicRadioStrength)
- **SPORTS_TALK** (low sportsStrength)
- **streaming substitution pressure on CHR** (low modernMusicSubstitution)

## Signal inventory (tier targets)

| Era | Value | small-tier target | Source |
|-----|-------|-----------------------------|--------|
| 1975 historical | 5 AM / 3 FM / 8 total | historical dial | explicit |
| 1983 viable | 12 | 10–14 | explicit |
| 2026 measurable | 20 | 16–24 | explicit |

Primary full-power on dial: **25** (5 AM + 20 FM; 0 excluded translator/HD). Dial listed: 25. Profile grand total: 25. 

Anchor wichita (small); ~12 viable (1983); ~20 measurable (2026)
Notes: Small Wichita anchor: 5 AM / 3 FM in 1975 (matches gameplay five-AM constraint); viable1983 12; measurable2026 20. Dial 5 AM + 20 FM incl. 2 reserved-band.


## Revenue assumptions (draft)

| Field | Value | Note |
|-------|-------|------|
| rankTier | small | Drives dial depth + inventory targets |
| revScale | 0.32 | Compare Nielsen revenue rank |
| adxBonus | 0.025 | Template default until sourced |
| timezone | America/Chicago | Required for merge readiness |
| teams | 1 | Replace TODO team names/fees |

## Workflow commands

```bash
# After editing raw_market_data.json:
npm run scaffold:market -- --city=wichita --derive
npm run scaffold:market -- --city=wichita --check

# After MARKETS merge + market-ids.cjs:
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=wichita --runs=8
# Then save summary to ecology_regression_record.json and re-run --check
```

## Scaffold warnings

- DIAG_ONLY scaffold draft — do not change playable/billing/picker.
- Dial/inventory tuned for tier stress-test; may exceed thin gameplay MARKETS dial where noted.
- Set review flags after human FCC pass.
