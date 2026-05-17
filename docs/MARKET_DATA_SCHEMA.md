# Market data schema (scaffold v2)

Schema for `raw_market_data.json` produced by `npm run scaffold:market`. Values are **draft placeholders** until sourced, checked, and reviewed.

See also: [MARKET_ADD_CHECKLIST.md](./MARKET_ADD_CHECKLIST.md), [MARKET_ECOLOGY_MIGRATION_PLAN.md](./MARKET_ECOLOGY_MIGRATION_PLAN.md).

---

## Workflow

| Step | Command | Output |
|------|---------|--------|
| Create | `npm run scaffold:market -- --city=<slug> --template=<name>` | Full folder under `tmp/market_scaffold/<slug>/` |
| Edit | (manual) | Update `raw_market_data.json` with real sources |
| Derive | `npm run scaffold:market -- --city=<slug> --derive` | Refreshes `derived_ecology.json`, `suggested_MARKETS_row.js`, `diagnostics_notes.md` |
| Check | `npm run scaffold:market -- --city=<slug> --check` | Console PASS/WARN/FAIL + `readiness.json` |

**Readiness states** (from `--check`, lowest wins):

| State | Meaning |
|-------|---------|
| `DRAFT` | Blocking FAIL (missing data, placeholder dial, region mismatch, etc.) |
| `DATA_READY` | Core demographics/revenue fields present; dial or region may still block merge |
| `ECOLOGY_READY` | `derived_ecology.json` valid; ecology regression not recorded yet |
| `PLAYTEST_READY` | Ecology OK; minor WARN (TODO blurb/teams, unreviewed flags) |
| `MERGE_READY` | Safe to merge into `MARKETS` and market ID lists (human sign-off still required) |

---

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Lowercase slug, no spaces (e.g. `phoenix`). Must match `MARKETS` key. |
| `label` | string | Display name (e.g. `Phoenix`). |
| `region` | string | UI region label (e.g. `Southwest`, `West Coast`, `Northeast`). Must match real geography. |
| `callPrefix` | string | Station callsign prefix (`K`, `W`, …). |
| `rankTier` | string | `mega` \| `large` \| `medium` \| `small` |
| `archetypeId` | string | Ecology archetype (e.g. `sunbelt_diversified`, `west_fm_fragmented`). |
| `revScale` | number | Revenue scale vs baseline (~0.3 small → ~7 mega). |
| `adxBonus` | number | Market-level ad-market bump (often 0.02–0.05). |
| `timezone` | string | IANA timezone (e.g. `America/Phoenix`) — **required for MERGE_READY** (gameplay field TBD). |
| `pop` | object | Cohort population weights: keys `12-17`, `18-24`, `25-34`, `35-49`, `50-64`, `65+` (arbitrary units, relative). |
| `blackPop` | number | 0–1 Black population share (modern anchor). |
| `hispPop1970` | number | Hispanic share ~1970 (0–1). |
| `hispPop2000` | number | Hispanic share ~2000 (0–1). |
| `hispPop2020` | number | Hispanic share ~2020 (0–1). |
| `churchGoing` | number | Church-attendance proxy (0–1). |
| `countryBonus` | number | Country format civic bonus (0–~0.22). |
| `urbanBonus` | number | Urban core bonus (0–~0.16). |
| `culture.country` | number | Country culture lane (0–1 scale used in ecology). |
| `culture.urban` | number | Urban / rhythmic culture lane. |
| `culture.spanish` | number | Spanish-language lane. |
| `culture.religion` | number | Religious / CCM lane. |
| `culture.newsTalk` | number | News / talk lane. |
| `eduIndex` | number | Education proxy (~0.88–1.24). |
| `publicCivicIndex` | number | Public-media civic proxy (~0.92–1.12). |
| `fmPenBias` | number | FM penetration bias (signed, ~−0.06–0.07). |
| `fmMusicFragMult` | number | FM music fragmentation (~0.92–1.14). |
| `spokenWordAmResilience` | number | AM spoken-word holdout (~0.72–1.22). |
| `heritageAmResilience` | number | Heritage AM resilience. |
| `countryAmHoldout` | number | Country AM holdout. |
| `amFreqs` | string[] | Commercial AM dial tokens (e.g. `'1010 AM'`). |
| `fmFreqs` | string[] | Commercial FM dial tokens (must be >91.9 MHz for generators). |
| `fmFacilityByFreq` | object | Map freq → ERP token (`10kw`, `50kw`, `100kw`). |
| `teams` | array | Sports teams: `{ id, name, sport, introduced, baseFee, baseBonus, contractYrs }`. |
| `selectBlurb` | string | Scenario picker description. |

---

## Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `sportsMarketIndex` | number | Extra sports-talk prior (scaffold only). |
| `collegeTownIndex` | number | College / AAA prior hint. |
| `commuterStressIndex` | number | Drive-time / talk prior hint. |
| `marketEcologyOverrides` | object | Future: per-trait overrides after `deriveMarketEcology`. |
| `dialBpAmToFm` | object | Blueprint AM→FM overrides (small markets). |
| `amFacilityByFreq` | object | Per-AM facility overrides. |
| `sourceNotes` | object | Provenance per field: `{ "revScale": "Nielsen 2024 rank …" }`. |

---

## Scaffold metadata (`_scaffold`)

```json
{
  "_scaffold": {
    "version": 2,
    "template": "sunbelt",
    "status": "draft",
    "dialReviewed": false,
    "dataReviewed": false,
    "ecologyRegressionRecorded": false,
    "warnings": []
  }
}
```

| Flag | When to set |
|------|-------------|
| `dialReviewed` | `true` after FCC-sourced `amFreqs` / `fmFreqs` verified (clears placeholder-dial FAIL) |
| `dataReviewed` | `true` after demographics/revenue manually verified |
| `ecologyRegressionRecorded` | `true` after post-merge diag (prefer `ecology_regression_record.json`) |

Do **not** merge `_scaffold` into `legacy.js` `MARKETS` rows.

---

## Post-merge artifact: `ecology_regression_record.json`

After the market exists in `MARKETS` and `market-ids.cjs`:

```bash
npm run diag:market-ecology-regression -- --markets=<id> --runs=8
```

Save a short record in the scaffold folder:

```json
{
  "marketId": "phoenix",
  "recordedAt": "2026-05-16T12:00:00.000Z",
  "command": "npm run diag:market-ecology-regression -- --markets=phoenix --runs=8",
  "note": "CHR bucket ~12%, no script errors",
  "pass": true
}
```

Required for **MERGE_READY** readiness (or set `_scaffold.ecologyRegressionRecorded` with file present).

---

## Template archetypes (v1)

| Template key | `archetypeId` | Compare (diagnostics only) |
|--------------|---------------|----------------------------|
| `sunbelt` | `sunbelt_diversified` | atlanta, nashville (+ Dallas/Phoenix notes) |
| `northeast_mega` | `northeast_mega` | newyork, losangeles (large_coastal mega) |
| `west_fm_fragmented` | `west_fm_fragmented` | seattle, sanfrancisco, portland-type |
| `coastal_secular` | `coastal_secular` | sanfrancisco, seattle (large_coastal large) |
| `southern_country` | `southern_country` | nashville, atlanta |
| `midwest_legacy` | `midwest_legacy` | chicago, wichita |
| `plains_small` | `plains_small` | wichita |

---

## Merge blockers (checked by `--check`)

**FAIL** (typically **DRAFT** or **DATA_READY**):

- Dial list still matches untouched template fingerprint (`dialReviewed` false)
- Region mismatch vs known city geography (e.g. Phoenix + `Southeast`)
- Missing/invalid `callPrefix`, `rankTier`, `revScale`, `timezone`
- Missing `derived_ecology.json` or ecology traits
- Missing scaffold files (`diagnostics_notes.md`, etc.)

**WARN** (blocks **MERGE_READY** until cleared):

- No `ecology_regression_record.json`
- `selectBlurb` / team names still contain `TODO`
- `_scaffold.dialReviewed` / `dataReviewed` not set

---

## Validation after merge

```bash
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=<id> --runs=8
npm run diag:tier-concentration-formats -- --markets=<id> --years=1995,2026 --runs=10
```
