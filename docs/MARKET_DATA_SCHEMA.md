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
| `signalInventory` | object | Era inventory counts for tier sanity checks (see below). |

---

## `signalInventory` (tier targets v2)

Rough **competitive station inventory** by market era — not exact FCC engineering. Used by `--derive` / `--check` to warn when a market is thin or overstuffed for its `rankTier`.

**1970s starts:** Scenarios beginning in the 1970s should document **historical** AM/FM availability at start (`am1975`, `fm1975`, `total1975`) — not the size of the modern `amFreqs` / `fmFreqs` lists used for 2026 gameplay. FM expansion and rimshots inflate the modern dial; the scaffold warns when no 1975 anchors are set but the dial looks like a 2026 inventory.

```json
{
  "am1975": 11,
  "fm1975": 9,
  "total1975": 20,
  "viable1975": 20,
  "viable1983": 22,
  "measurable2026": 38,
  "inventoryExplained": true,
  "notes": "Phoenix large-market anchor: ~22 viable (1983), ~38 measurable (2026)."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `am1975` | number | Historical AM stations on air / competitive ~1975. |
| `fm1975` | number | Historical FM stations on air / competitive ~1975. |
| `total1975` | number | Total historical signals ~1975; must equal `am1975 + fm1975` when all three are set. |
| `viable1975` | number | Optional competitive subset in 1975 (≤ `total1975`). |
| `viable1983` | number | Full-power signals that could compete in the early-1980s (~1983 anchor). |
| `measurable2026` | number | Stations that would show as measurable in a modern Nielsen-style book (~2026 anchor). |
| `inventoryExplained` | boolean | Set when era counts intentionally differ from dial-listed totals. |
| `notes` | string | Provenance / anchor comparison (e.g. Phoenix vs Wichita). |

**Tier target ranges** (scaffold warns outside range; does not require FCC perfection):

| `rankTier` | 1983 viable | 2026 measurable |
|------------|-------------|-----------------|
| `small` | 10–14 | 16–24 |
| `medium` | 14–18 | 24–32 |
| `large` | 18–26 | 32–42 |
| `mega` | 28–35 | 45–55 |

**Rough anchors:** Wichita (small) ~12 / ~20; Phoenix (large) ~22 / ~38; NYC (mega) ~30 / ~48.

**1975 example anchors (documentation):**

| Market | 1975 AM | 1975 FM | 1975 total | Later |
|--------|---------|---------|------------|-------|
| NYC | 11 | 9 | 20 | mega 2026 measurable ~48 |
| New Orleans | 9 | 7 | 16 | 1985 total ~20; 2026 measurable ~20 |

**Primary full-power dial count:** `amFreqs` + `fmFreqs` minus rows marked `translatorFed`, `hdSubchannel`, `hdFed`, or `excludeFromPrimaryInventory` in `amSignalByFreq` / `fmSignalByFreq`. Include translators only when `includeInPrimaryInventory: true`.

**Validation**

| Check | Level |
|-------|--------|
| Below/above tier range for `viable1983` or `measurable2026` | **WARN** |
| Missing explicit counts (proxy from dial/profile) | **WARN** |
| `viable1983` === `measurable2026` === dial total without `inventoryExplained` / `notes` | **WARN** |
| No `am1975` / `fm1975` / `total1975` but modern dial listed (`inventory_1975_modern_dial_assumed`) | **WARN** |
| `total1975` ≠ `am1975 + fm1975` when all three set | **WARN**; **FAIL** if `signalReviewed` |
| Incomplete 1975 band fields (only some of am/fm/total) | **WARN** |
| Modern dial ≈ `total1975` while `measurable2026` much higher (unexplained) | **WARN** |
| Missing `viable1983` or `measurable2026` after `_scaffold.signalReviewed: true` | **FAIL** |

Output: `signal_allocation.json` → `signalInventory` block (targets, `inventory1975`, counts, sources, warnings).

### Profile vs per-frequency metadata (v2)

`signal_allocation.json` → `profileMetadataConsistency` compares `signalProfile` tier totals to explicit `signalTier` tags in `amSignalByFreq` / `fmSignalByFreq` (AM may infer tier from `amClassHint` when `signalTier` is omitted).

| Check | Level |
|-------|--------|
| Tier count mismatch (`am_profile_metadata_mismatch`, `fm_profile_metadata_mismatch`) | **WARN** |
| Mismatch after `_scaffold.signalReviewed: true` | **FAIL** |
| Dial freq missing tier metadata | Treated as mismatch (incomplete metadata) |

`signalProfile` may remain draft-estimated until `signalReviewed`; metadata should be filled for every dial row before review.

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
| `translatorFed` | boolean | HD/translator-fed — excluded from primary inventory count unless `includeInPrimaryInventory` |
| `hdSubchannel` | boolean | HD subchannel — excluded from primary inventory count |
| `excludeFromPrimaryInventory` | boolean | Exclude from primary full-power inventory count |
| `includeInPrimaryInventory` | boolean | Force-include translator/HD row in primary count |

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
| `signalInventory` | object | Era viable/measurable counts for tier inventory checks (v1). |
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
- `signalInventory` outside tier range (`inventory_viable_*`, `inventory_measurable_*`)
- Missing explicit `signalInventory` counts (WARN until reviewed)

**FAIL** (invalid scaffold state):

- `_scaffold.dialReviewed` true while `signalReviewed` is false
- `_scaffold.dialReviewed` or `signalReviewed` true while band constraint validation fails
- Graveyard AM (`1230`–`1490` local channels) marked **big** / **clear**, or **> 1 kW** without `graveyardOverride`
- `_scaffold.signalReviewed` true but `signalInventory.viable1983` or `measurable2026` still missing

---

## Validation after merge

```bash
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=<id> --runs=8
npm run diag:tier-concentration-formats -- --markets=<id> --years=1995,2026 --runs=10
```
