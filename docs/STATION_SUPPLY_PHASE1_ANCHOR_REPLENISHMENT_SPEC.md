# Station Supply Phase 1 — Anchor + Replenishment POC

**Status:** Implementation in tree — **opt-in only** (`supplyPhase1Enabled===true`); validation incomplete; do not merge until PASS  
**Branch:** Primary realism — station supply  
**Date:** 2026-06-27  
**Predecessors:** [MARKET_SUPPLY_COMPARATIVE_AUDIT.md](./MARKET_SUPPLY_COMPARATIVE_AUDIT.md) · [LARGE_MARKET_DIAL_DEPTH_SUPPLY_SPEC.md](./LARGE_MARKET_DIAL_DEPTH_SUPPLY_SPEC.md)

---

## 1. Problem statement

The sim generates **thin markets** and then **shrinks them over time**:

```text
thin genesis (~25 commercial @ 2000 large-tier)
  → attrition removes weak AMs (permanent splice)
  → no symmetric replacement pipeline
  → fewer competitors → fatter leaders
```

A 1985→2026 career should feel **more fragmented and crowded**, not cleaner. Ecology symptoms (Spanish pressure, monocultures, 15%+ leaders, missing niches) are **plausibly supply-driven** and should be re-tested after supply fixes **before** any Spanish, share-compression, or leader-cap tuning.

**Diagnosis summary (baseline harness, `genMarketMP('1985')` → 2025):**

| Market | Tier | 2020s commercial (mean) | Duncan ~2000 | Removed cum. @ 2020s |
|--------|------|-------------------------|--------------|----------------------|
| Houston | large | **24** | ~38 | 8.1 |
| Dallas | large | 26 | ~37 | 10.1 |
| Seattle | large | 26 | ~36 | 6.1 |
| San Francisco | large | 26 | ~36 | 8.0 |
| Phoenix | large | **29** | ~36 | 7.5 |
| Atlanta | large | 28 | ~35 | 7.4 |
| Chicago | mega | 31 | ~42 | **16.8** |

No major market is oversupplied. Large markets are **8–14 commercial stations light** vs Duncan-style expectations.

---

## 2. Scope

### In scope (Phase 1 POC)

1. **Tier anchor revision** — modest, testable bump for `large` and `mega` curves (not full measurable targets).
2. **Attrition-aware replenishment** — controlled sign-on path when stations are permanently removed.
3. **MKTCAP realignment** — attrition over-cap logic must scale with tier targets (see §5.3).
4. **Before/after harness** — six POC markets, 1985→2026 cold sims, inventory + ecology metrics.
5. **Feature flag** — `G._supplyPhase1Enabled` or compile-time guard for A/B without affecting production until pass.

### Out of scope (explicit)

| Item | Rationale |
|------|-----------|
| Per-market dial expansion (Option B) | Defer until tier fix measured; Houston may reach 30–32 without new FM tokens |
| Translators / rimshots / measurable layer (Option C/E) | Architecture + UI; not needed for learning pass |
| Spanish composition / demand tuning | Supply hypothesis first |
| Share compression / leader caps | Symptom treatment |
| Hand-patching Houston `MARKETS` row | Tier-level fix first |
| Small / medium tier anchor changes | Large + mega only |

### POC markets

`houston`, `phoenix`, `dallas`, `atlanta`, `seattle`, `chicago`

Chicago included as the **mega-tier attrition stress test** (highest removals + niche pile in baseline).

---

## 3. Design goals

| Goal | Acceptance direction |
|------|----------------------|
| Houston / Phoenix / Dallas move toward real-world counts | Houston **24 → 30–32** commercial @ 2000–2026 without dial expansion |
| No absurd crowding | No market > LFP cap; no sustained >40 commercial on 32-token dial |
| Leader shares soften naturally | Median #1 share ↓; fewer ≥15% monsters |
| Spanish complaints reduce **without Spanish tuning** | Spanish lane share ↓ or stabilizes as book thickens |
| Dial complexity grows over decades | 2026 commercial ≥ 2000 commercial (or flat), not monotonic shrink |

---

## 4. Part A — Tier anchor revision

### 4.1 Principle

Raise genesis targets **modestly** — enough to learn whether tier-level supply fixes ecology, **not** full Duncan/measurable alignment if `countUsableCommercialDialSlots` would block it.

Commercial genesis target today:

```text
tierMarketCommercialTargetForGen(marketId, bpYear)
  = min(countUsableCommercialDialSlots(marketId), tierTotalForYear(bpYear) - 2)
```

Anchor change affects **cold start + tier inject fill** (`injectTierMarketCommercialExtras`). Scheduled Spanish/fragmentation launches unchanged in Phase 1.

### 4.2 Current anchors (`src/legacy.js`)

```text
LARGE:  [1975,10] [1980,24] [1985,27] [1990,25] [1995,25] [2000,27] [2005,24] [2026,30]
MEGA:   [1975,22] [1985,32] [1995,35] [2025,42] [2026,44]
```

### 4.3 Proposed Phase 1 anchors (POC — modest)

Interpolate smoothly; **large @ 2000 = 32 total (~30 commercial)** — +5 total vs today, still **4 below** full audit target (36) and **2 below** Houston LFP cap (32).

| Year | Large (current → POC) | Mega (current → POC) |
|------|----------------------|----------------------|
| 1985 | 27 → **28** | 32 → **33** |
| 1990 | 25 → **29** | 35 → **36** |
| 1995 | 25 → **30** | 35 → **38** |
| **2000** | **27 → 32** | **36 → 40** |
| 2005 | 24 → **33** | — → **41** |
| 2010 | — → **34** | — → **42** |
| 2026 | 30 → **36** | 44 → **46** |

**Mega @ 2000 = 40 total (~38 commercial)** — modest +4 vs today; Chicago stress case gets headroom without jumping to measurable 42–48.

### 4.4 Cap interaction matrix (POC)

| Market | LFP cap | POC comm @ 2000 | Binds? |
|--------|---------|-----------------|--------|
| Houston | 32 | ~30 | No (headroom 2) |
| Phoenix | 32 | ~30 | No |
| Dallas | 33 | ~30 | No |
| Atlanta | 33 | ~30 | No |
| Seattle | ~33 | ~30 | No |
| Chicago | mega dial | ~38 | Unlikely |

If POC commercial target approaches cap, genesis inject stops — **expected**; do not expand dial in Phase 1.

### 4.5 QA checklist (anchors only)

- [ ] `tierMarketBpTailDeferIndices` — fewer deferred BP slots at 2000 start
- [ ] `injectTierMarketCommercialExtras` fills to new target without infinite loop (80-guard)
- [ ] `nextUnusedCommercialFreq` returns null before exceeding dial (no synthetic freqs)
- [ ] Phoenix diag inject blocks (`phoenixDiagTierInjectFormatBlocked`) still behave
- [ ] Save migration: anchors apply on **new games only**; existing saves unchanged unless `migrateSave` hook added (default: **new game only**)

---

## 5. Part B — Attrition-aware replenishment

### 5.1 Principle

When `runMarketAttrition` **permanently removes** a station (`G.stations.splice` + `_attritionRemovedCumulative++`), enqueue a **replacement candidate** — not instant, not guaranteed, not every dead AM.

Replenishment restores **measurable competitive depth**, not resurrection of the removed signal.

### 5.2 Trigger

On each permanent removal in `runMarketAttrition`:

```text
enqueueAttritionReplenishment(G, {
  removedAtYear: G.year,
  removedAtPeriod: G.period,
  band: s.sig.type,           // AM | FM — informational
  formatFamily: s.format,     // informational only; replacement format from inject pool
})
```

Maintain `G._attritionReplenishQueue` (array of pending entries).

### 5.3 Process queue (new function)

**`processAttritionReplenishmentLaunches(G)`** — call from same lifecycle as Spanish/fragmentation launches (after ratings, Fall or every period — **recommend every period**, launch attempts gated internally).

Per queued entry, attempt launch only when **all** hold:

| Gate | Rule |
|------|------|
| **Cooldown** | `G.year > ent.removedAtYear + REPLENISH_MIN_LAG_YEARS` (POC: **2**) |
| **Era throttle** | Max **1 successful replenishment per market per calendar year** (POC) |
| **Under-target** | `countCommercialActive(G) < tierReplenishTarget(G)` |
| **Dial headroom** | `countMegaFragmentationEligibleCommercial(G.stations) < countUsableCommercialDialSlots(mkt)` |
| **Probability** | `REPLENISH_ATTEMPT_P` per eligible period (POC: **0.35** Fall only, **0.15** Spring) |
| **Format pool** | Reuse `tierMarketInjectBpList(marketId)` + `formatAllowedInMarket` — **no** Spanish-only bias unless market Spanish launches already define lane |

**`tierReplenishTarget(G)`** (new helper):

```text
tierMarketCommercialTargetForGen(marketId, G.year) - REPLENISH_HEADROOM
```

POC: `REPLENISH_HEADROOM = 1` (replenish up to 1 below genesis target for era — avoids overshooting inject + launches).

### 5.4 Launch implementation

Reuse existing spawn path (mirror `tryLaunchOneMarketFragmentation`):

- `nextUnusedCommercialFreq(G, bp.type)`
- `mkStn(bp, freq, G.year)`
- `seedNewEntry(s, G)` · `calcRev(s, G)`
- Tag: `s._attritionReplenishEntrant = true`
- Optional low-visibility news item (suppress in `simQuiet` / harness)

**Do not** clone the removed station's callsign, format, or owner.

### 5.5 What replenishment is NOT

- Not instant (min 2-year lag)
- Not 1:1 (probability + yearly cap)
- Not zombie resurrection (zombie → niche flip unchanged)
- Not translator/rimshot (full LFP entrant only)
- Not player-facing auction (NPC-only POC)

### 5.6 MKTCAP realignment (required companion change)

**Problem:** `runMarketAttrition` uses a **global** `MKTCAP` (21–26 commercial post-1995) with an Atlanta-era comment. At 30+ commercial stations, `overCap` is always positive → **attrition actively fights anchor raises**.

**POC fix:** Replace fixed `MKTCAP` with tier-scaled cap:

```text
tierAttritionCommercialCap(marketId, year)
  = tierMarketCommercialTargetForGen(marketId, year) + ATTRITION_CAP_SLACK
```

POC: `ATTRITION_CAP_SLACK = 2` (allows brief overshoot before removal bias).

Keep `MKTFLOOR = 8` for POC; revisit if large markets feel protected from cleanup.

**Without this change, Part A + Part B partially cancel.**

### 5.7 State & migration

| Field | Purpose |
|-------|---------|
| `G._attritionReplenishQueue` | Pending replacements |
| `G._attritionReplenishLaunchedCumulative` | Telemetry |
| `G._supplyPhase1Enabled` | Feature flag (default `true` on new games in POC branch) |

`migrateSave`: initialize empty queue; do not retroactively enqueue for past removals.

---

## 6. POC harness & metrics

### 6.1 Script

**New:** `scripts/diag-supply-phase1-ab.mjs`

Pattern: `run-phase1-market-health-smoke.mjs` VM harness (`injectMarketEcologyIife`, headless `advTurn`).

```bash
# Baseline (flag off) vs Phase 1 (flag on)
npm run diag:supply-phase1-ab
node scripts/diag-supply-phase1-ab.mjs --markets=houston,phoenix,dallas,atlanta,seattle,chicago --runs=12 --endYear=2026
```

Run each market × N seeds × {baseline, phase1}. Write:

- `tmp/supply_phase1_ab_summary.md`
- `tmp/supply_phase1_ab_summary.json`
- `tmp/supply_phase1_ab_per_market.csv`

### 6.2 Checkpoints

`1990`, `1995`, `2000`, `2005`, `2010`, `2015`, `2020`, `2026` (Fall, period 2 where applicable)

### 6.3 Metrics per checkpoint

**Inventory (existing `marketHealthSnapshot` + cumulatives):**

| Metric | Source |
|--------|--------|
| commercial | `marketHealthSnapshot(G).commercial` |
| active / public / deferred / zombie / niche | same |
| removedCumulative | `G._attritionRemovedCumulative` |
| replenishedCumulative | `G._attritionReplenishLaunchedCumulative` |
| netShrink | `removedCumulative - replenishedCumulative` |

**Ecology (extend harness or inline in script):**

| Metric | Definition |
|--------|------------|
| leaderShare | #1 commercial `rat.share` |
| top5ShareMass | sum of top 5 commercial shares |
| countShareOver8pct | commercial stations with share > 8% |
| countShareOver15pct | "monsters" |
| formatFamilies | count distinct `format` among commercial active |
| formatEntropy | Shannon entropy over commercial format counts (optional) |
| spanishLaneShare | sum of shares where `spanishCompositionIsSpanishLaneFmt(fmt)` |
| spanishStationCount | count commercial Spanish-lane stations |

Reuse `megaSnapshotMetrics` / `commercialShareTop1AndTop5Cutoff` from `marketSimHarness.js` where possible.

### 6.4 Success criteria (POC pass / fail)

**PASS** if **≥4 of 6** POC markets meet **all** inventory rows **and** **≥3 of 4** ecology rows:

**Inventory (vs baseline mean):**

| Criterion | Target |
|-----------|--------|
| Commercial @ 2000 | **+3 to +6** vs baseline for Houston/Dallas/Seattle |
| Commercial @ 2026 | **≥ 2000 level** (no decade shrink) |
| Houston @ 2026 | **30–32** commercial |
| Removed @ 2026 | netShrink **< 50%** of baseline netShrink |

**Ecology (vs baseline mean, no Spanish/demand changes):**

| Criterion | Target |
|-----------|--------|
| Median leaderShare @ 2000 | **−1.5 pp** or more |
| top5ShareMass @ 2000 | **−3 pp** or more |
| countShareOver15pct @ 2026 | **−30%** relative |
| spanishLaneShare @ 2000 (Houston/Phoenix) | **−2 pp** or flat (not worse) |

**FAIL triggers (any):**

- Any market commercial **> LFP cap − 1**
- Chicago commercial **> 42** sustained
- Replenishment **> 40%** Spanish-format launches (pool bias bug)
- Niche/zombie count **+50%** vs baseline (failed cleanup)

### 6.5 Baseline capture

Before implementing, archive current baseline:

```bash
npm run sim:phase1-health-smoke   # or existing script
cp tmp/phase1_market_health_smoke.txt tmp/supply_phase1_baseline_20260627.txt
```

---

## 7. Implementation order

| Step | Work | Est. risk |
|------|------|-----------|
| **0** | Archive baseline harness outputs | None |
| **1** | Add feature flag + harness hook (`G._supplyPhase1Enabled`) | Low |
| **2** | Revise `LARGE_MARKET_TOTAL_STATIONS_ANCHORS` + `MEGA_MARKET_TOTAL_STATIONS_ANCHORS` per §4.3 | Medium — genesis QA |
| **3** | `tierAttritionCommercialCap` — replace fixed `MKTCAP` in `runMarketAttrition` | Medium — survival feel |
| **4** | `enqueueAttritionReplenishment` + `processAttritionReplenishmentLaunches` | Medium |
| **5** | Wire `processAttritionReplenishmentLaunches` into turn pipeline (near `processMarketSpanishLaunches`) | Low |
| **6** | `diag-supply-phase1-ab.mjs` + package.json script | Low |
| **7** | Run POC (12 runs/market); write scorecard | — |
| **8** | CEO review: PASS → merge; FAIL → tune POC constants only (not Spanish/demand) | — |

**Single PR scope:** steps 1–6. Step 7 is validation artifact.

---

## 8. Constants (POC defaults — tunable in POC only)

```text
REPLENISH_MIN_LAG_YEARS     = 2
REPLENISH_ATTEMPT_P_FALL    = 0.35
REPLENISH_ATTEMPT_P_SPRING  = 0.15
REPLENISH_MAX_PER_YEAR      = 1
REPLENISH_HEADROOM          = 1
ATTRITION_CAP_SLACK         = 2
```

Do not expose to player UI in Phase 1.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Houston hits 32 LFP cap with anchor + replenishment | Expected ceiling; document; Phase 2 = dial expansion **with justification** |
| MKTCAP slack too loose → overcrowding | FAIL trigger on cap breach; reduce `ATTRITION_CAP_SLACK` |
| Replenishment clones Spanish monoculture | Format pool = full `tierMarketInjectBpList`; monitor Spanish % |
| Chicago mega + replenishment → too many FM | Mega anchor POC only +40 total @ 2000; Chicago-specific watch |
| Existing saves diverge | New-game-only flag default; migration noop |
| Attrition + replenishment oscillate | Yearly cap + headroom below target |

---

## 10. What happens after POC

| Outcome | Next branch |
|---------|-------------|
| **PASS** — Houston 30–32, ecology softens | Merge Phase 1; consider **full anchor curve** (36 @ 2000 large) as Phase 2a |
| **PASS inventory, FAIL ecology** | Supply helped counts but not shares → **then** revisit demand/compression (D5) |
| **FAIL inventory** — still < 28 Houston | Phase 2b: Houston/Phoenix **dial expansion** (Option B) with scaffold |
| **PASS with cap bind** | Document measurable layer (Option C) for long-term NYC/Houston 38+ |

---

## 11. Code touchpoints (implementation reference)

| Area | File | Symbols |
|------|------|---------|
| Anchors | `src/legacy.js` | `LARGE_MARKET_TOTAL_STATIONS_ANCHORS`, `MEGA_MARKET_TOTAL_STATIONS_ANCHORS` |
| Genesis cap | `src/legacy.js` | `tierMarketCommercialTargetForGen`, `injectTierMarketCommercialExtras` |
| Dial cap | `src/legacy.js` | `countUsableCommercialDialSlots`, `nextUnusedCommercialFreq` |
| Attrition | `src/legacy.js` | `runMarketAttrition` (~20525), `MKTCAP`, `MKTFLOOR` |
| Launch precedents | `src/legacy.js` | `tryLaunchOneMarketFragmentation`, `tryLaunchOneMarketSpanish` |
| Turn pipeline | `src/legacy.js` | `advTurn` sim quiet path (~33770) |
| Harness | `src/marketSimHarness.js` | `marketHealthSnapshot`, `megaSnapshotMetrics`, `commercialShareTop1AndTop5Cutoff` |
| Smoke | `scripts/run-phase1-market-health-smoke.mjs` | VM pattern |
| Long-run ecology | `scripts/diag-longrun-market-ecology.mjs` | checkpoint + monster template |

---

## 12. Approval checklist

- [x] POC anchor table (§4.3) approved — **Large @ 2000 = 32 total** (not 30)
- [x] Replenishment gates (§5.3) approved — **2-year lag, max 1/year**
- [x] MKTCAP realignment (§5.6) approved as **mandatory** Phase 1 requirement
- [x] Success criteria (§6.4) approved
- [x] Replacement **format-family distribution** metric required (fail if ≥50% Spanish, Brokered, or Religious)
- [x] Explicit non-goals (§2) acknowledged

**Authorized to implement:** 2026-06-27 (CEO sign-off)
