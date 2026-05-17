# Market add checklist

Use this when adding a **new playable market** (top-50 expansion). The scaffold tool generates drafts and **readiness gates** tell you when merge is safe.

```bash
npm run scaffold:market -- --city=<slug> --template=<template>
npm run scaffold:market -- --city=<slug> --derive    # after editing raw JSON
npm run scaffold:market -- --city=<slug> --check      # PASS / WARN / FAIL + readiness state
```

Output: `tmp/market_scaffold/<slug>/` — see [MARKET_DATA_SCHEMA.md](./MARKET_DATA_SCHEMA.md).

---

## Readiness states (from `--check`)

| State | Safe to merge? | Typical gaps |
|-------|----------------|--------------|
| **DRAFT** | No | FAIL: placeholder dial, wrong region, missing timezone |
| **DATA_READY** | No | Dial/region/ecology blockers remain |
| **ECOLOGY_READY** | No | Run post-merge ecology diag; record results |
| **PLAYTEST_READY** | Almost | Clear TODO blurb/teams; set review flags |
| **MERGE_READY** | Yes* | Human sign-off; then merge `MARKETS` + ID lists |

\*Tool gate only — you still review `suggested_MARKETS_row.js` manually.

---

## 1. Collect raw data

- [ ] Nielsen / BIA market rank and revenue tier (→ `rankTier`, `revScale`, `adxBonus`)
- [ ] Population by age cohort (→ `pop`)
- [ ] Demographics: Black, Hispanic trend 1970/2000/2020 (→ `blackPop`, `hispPop*`)
- [ ] Culture proxies: country, urban, Spanish, religion, news/talk (→ `culture.*`)
- [ ] Education / civic proxies (→ `eduIndex`, `publicCivicIndex`)
- [ ] Church / country / urban bonuses (→ `churchGoing`, `countryBonus`, `urbanBonus`)
- [ ] FM fragmentation and AM resilience research (→ `fmPenBias`, `fmMusicFragMult`, AM holdout fields)
- [ ] **IANA timezone** (→ `timezone` in raw JSON)
- [ ] Real commercial dial plan: AM/FM frequencies and ERP (→ `amFreqs`, `fmFreqs`, `fmFacilityByFreq`)
- [ ] Pro sports inventory and rough rights fees (→ `teams`)
- [ ] Scenario picker blurb (→ `selectBlurb`)
- [ ] Callsign prefix (`K` / `W`) and region label

Record sources in `raw_market_data.json` → `sourceNotes`.

---

## 2. Create scaffold

- [ ] `npm run scaffold:market -- --city=<slug> --template=<template>`
- [ ] Review `tmp/market_scaffold/<slug>/raw_market_data.json`
- [ ] Replace template placeholders (dial, region, teams, blurb)

---

## 3. Edit raw data + derive

- [ ] Edit `raw_market_data.json` (demographics, revenue, dial, timezone, region)
- [ ] `npm run scaffold:market -- --city=<slug> --derive`
- [ ] Review `derived_ecology.json` and `diagnostics_notes.md` (template comparison section)

---

## 4. Check readiness

- [ ] `npm run scaffold:market -- --city=<slug> --check`
- [ ] Fix all **FAIL** items (expect **DRAFT** until fixed)
- [ ] Set `_scaffold.dialReviewed: true` only after FCC dial verified
- [ ] Target **MERGE_READY** before touching `legacy.js`

---

## 5. Merge `MARKETS` row

- [ ] Copy reviewed block from `suggested_MARKETS_row.js` into `src/legacy.js` `MARKETS`
- [ ] Confirm dial lists are **real** frequencies, not template copies
- [ ] Confirm `fmFreqs` entries are >91.9 MHz where required

---

## 6. Update plan / billing / picker lists

- [ ] `scripts/market-ids.cjs` → `ALL_PLAYABLE_MARKET_IDS`
- [ ] `src/legacy.js` → playable market arrays if duplicated
- [ ] `src/billingEntitlements.js`, `server/planMarkets.js`
- [ ] Scenario picker / campaign allowlists

---

## 7. Post-merge diagnostics

```bash
npm run report:market-traits -- --years=1970,1995,2026
npm run diag:market-ecology-regression -- --markets=<slug> --runs=8
npm run diag:tier-concentration-formats -- --markets=<slug> --years=1995,2026 --runs=10
```

- [ ] Save `ecology_regression_record.json` in scaffold folder (or copy notes into it)
- [ ] Re-run `--check` → confirm **MERGE_READY**

---

## 8. Build / smoke

```bash
npm run build
npm run sim:phase1-health-smoke
```

- [ ] Play-test one scenario in the new market

---

## 9. Commit

- [ ] One commit: market row + ID lists (+ docs if needed)
- [ ] Do **not** commit `tmp/market_scaffold/` unless archiving intentional drafts

---

## Not in scaffold v2

- Automatic insertion into `legacy.js`
- Live Census / FCC API fetch
- Gameplay `timezone` field on `MARKETS` (scaffold tracks it for readiness)
