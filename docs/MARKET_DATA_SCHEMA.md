# Market data schema (scaffold v2)

Schema for `raw_market_data.json` produced by `npm run scaffold:market`. Values are **draft placeholders** until sourced, checked, and reviewed.

See also: [MARKET_ADD_CHECKLIST.md](./MARKET_ADD_CHECKLIST.md), [MARKET_ECOLOGY_MIGRATION_PLAN.md](./MARKET_ECOLOGY_MIGRATION_PLAN.md).

---

## Workflow

| Step | Command | Output |
|------|---------|--------|
| Create | `npm run scaffold:market -- --city=<slug> --template=<name>` | Full folder under `tmp/market_scaffold/<slug>/` |
| Edit | (manual) | Update `raw_market_data.json` with real sources |
| Derive | `npm run scaffold:market -- --city=<slug> --derive` | Refreshes `derived_ecology.json`, `suggested_MARKETS_row.js`, `diagnostics_notes.md`, `signal_allocation.json` |
| Check | `npm run scaffold:market -- --city=<slug> --check` | Console PASS/WARN/FAIL + `readiness.json` + `signal_allocation.json` |

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
| `signalProfile` | object | Competitive signal-depth tiers (gameplay abstraction; see below). |

---

## `signalProfile` (signal allocation v1–v2)

**Not FCC engineering.** `signalProfile` is a gameplay abstraction that classifies how many *competitive* signals exist at each strength tier in the market. It informs future dial realism and allocation scaffolds; it does not change ecology derivation or sim behavior today.

**v2** adds band-constraint validation in `signal_allocation.json` (AM graveyard channels, FM NCE vs commercial band, optional per-frequency metadata). See [Band constraints (v2)](#band-constraints-v2) below.

```json
{
  "am": {
    "big": 3,
    "medium": 5,
    "small": 6
  },
  "fm": {
    "major": 7,
    "medium": 8,
    "rimshot": 5
  }
}
```

| Tier | Band | Meaning |
|------|------|---------|
| `am.big` | AM | **clear / big-stick** — dominant full-market AM (gameplay tier, not FCC class A/B) |
| `am.medium` | AM | **regional** — useful metro signal, not dominant |
| `am.small` | AM | **local** — local, fringe, specialty, or graveyard-channel AM |
| `fm.major` | FM | Full-market competitive FM |
| `fm.medium` | FM | Viable metro / suburban FM |
| `fm.rimshot` | FM | Weaker or edge-of-market FM |

Tier counts should roughly align with `amFreqs` / `fmFreqs` length (see `signal_allocation.json` after `--derive` or `--check`). Human review sets `_scaffold.signalReviewed` when tiers match competitive reality.

Derived artifact: `tmp/market_scaffold/<slug>/signal_allocation.json` — profile totals, per-frequency band classification, constraint warnings/failures, and suggested dial-tier placeholders when lists are incomplete.

### Band constraints (v2)

Validated on `--derive` / `--check`. Blocks **MERGE_READY** when constraint **FAIL** items exist (especially if `signalReviewed` or `dialReviewed` is true).

**AM graveyard / local channels (kHz):** `1230`, `1240`, `1340`, `1400`, `1450`, `1490`

- Must be **local / small** tier only — never **clear / big-stick** (`big`).
- **FAIL** if classified `big` or `amClassHint: clear`.
- **FAIL** if `medium` / `regional` or power **> 1 kW** without `graveyardOverride: true`.

**FM bands**

| MHz | Role |
|-----|------|
| 87.9 – 91.9 | NCE reserved band — public radio, CCM/NCE-style stations should prefer here |
| 92.1 – 107.9 | Commercial FM band — do not default NCE/CCM/public here without `commercialOverride` |

**Reserved-band capacity (not fixed occupants):** Dial entries in 87.9–91.9 MHz are **capacity** for NCE-eligible signals. Public, university, jazz, classical, CCM, religious, and ethnic NCE formats compete for these slots — the scaffold does not require specific format assignments or an exact station count.

| Reserved-band count | Check |
|---------------------|--------|
| 0 when ecology expects public/CCM/NCE | **WARN** (`nce_reserved_capacity_missing`) |
| 1 in `large` / `mega` markets | **WARN** (`nce_reserved_capacity_low`) |
| 2–6 | Plausible (no warning) |
| >6 | **Info** only (`nce_reserved_capacity_high`) |

**CCM / K-Love / Air1 (pre-HD layer):** Prefer reserved-band for CCM/religious NCE assumptions. Full-power commercial-band K-Love/Air1 via HD-fed translators is **deferred** until the HD radio / subchannel / translator layer exists.

**Optional per-frequency metadata** (scaffold-only; not merged into `MARKETS`):

`amSignalByFreq` — keyed by dial token (e.g. `"1230 AM"`):

| Field | Type | Description |
|-------|------|-------------|
| `dayPowerKw` | number | Day power (kW), gameplay token |
| `nightPowerKw` | number | Night power (kW) |
| `directionalDay` | boolean | Directional day pattern |
| `directionalNight` | boolean | Directional night pattern |
| `amClassHint` | string | `clear` \| `regional` \| `local` \| `unknown` |
| `signalTier` | string | `big` \| `medium` \| `small` (maps to profile tiers) |
| `graveyardOverride` | boolean | Allow non-local tier or >1 kW on graveyard channel (document why) |

`fmSignalByFreq` — keyed by dial token (e.g. `"88.5 FM"`):

| Field | Type | Description |
|-------|------|-------------|
| `classHint` | string | `C` \| `C0` \| `C1` \| `C2` \| `C3` \| `A` \| `B` \| `B1` \| `unknown` |
| `erpKw` | number | ERP kW (overrides `fmFacilityByFreq` token when set) |
| `haatM` | number | Height above average terrain (meters), optional |
| `reservedBand` | boolean | Station uses NCE reserved band |
| `nceEligible` | boolean | NCE/public/CCM-eligible allocation |
| `signalTier` | string | `major` \| `medium` \| `rimshot` |
| `formatHint` | string | e.g. `CCM`, `PUBLIC_NEWS` — triggers NCE/commercial band rules |
| `commercialOverride` | boolean | Explicit commercial-band NCE/translator (HD era; rare in v2) |

**WARN (v2, not FAIL):** Missing or thin reserved-band **capacity** vs ecology (`nce_reserved_capacity_missing`, `nce_reserved_capacity_low`). **Info only** when >6 reserved-band slots are listed.

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
| `amSignalByFreq` | object | Per-AM signal metadata for band-constraint validation (v2). |
| `fmSignalByFreq` | object | Per-FM signal metadata for band-constraint validation (v2). |
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
    "signalReviewed": false,
    "dataReviewed": false,
    "ecologyRegressionRecorded": false,
    "warnings": []
  }
}
```

| Flag | When to set |
|------|-------------|
| `signalReviewed` | `true` after human confirms `signalProfile` tiers vs competitive reality (required before merge) |
| `dialReviewed` | `true` after FCC-sourced `amFreqs` / `fmFreqs` verified — **only if `signalReviewed` is also true** |
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
- `_scaffold.signalReviewed` / `dialReviewed` / `dataReviewed` not set
- Missing `signalProfile` (WARN at **ECOLOGY_READY** and below; **FAIL** at **PLAYTEST_READY** and above)

**FAIL** (invalid scaffold state):

- `_scaffold.dialReviewed` true while `signalReviewed` is false
- `_scaffold.dialReviewed` or `signalReviewed` true while band constraint validation fails
- Graveyard AM (`1230`–`1490` local channels) marked **big** / **clear**, or **> 1 kW** without `graveyardOverride`

---

## Validation after merge

```bash
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=<id> --runs=8
npm run diag:tier-concentration-formats -- --markets=<id> --years=1995,2026 --runs=10
```
