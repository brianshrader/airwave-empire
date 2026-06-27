# Market Supply — Comparative Audit

**Status:** Diagnostic complete — **no implementation authorized**  
**Date:** 2026-06-26  
**Trigger:** Independent Phoenix and Houston playtests (Spring/Fall 2000) vs Duncan-era book station counts  
**Next realism branch (post–Bundle A):** Supply architecture — not share scalars, not format cardinality

**Related:** [LARGE_MARKET_DIAL_DEPTH_SUPPLY_SPEC.md](./LARGE_MARKET_DIAL_DEPTH_SUPPLY_SPEC.md) (draft targets) · [BUNDLE_A_INTEGRATION_DECISION_MEMO.md](./BUNDLE_A_INTEGRATION_DECISION_MEMO.md) (D5: calibrate after MVB-A)

---

## 1. Executive summary

Playtests and harness data show **large-tier markets are systematically under-supplied** relative to Duncan/Nielsen-shaped books. Mega markets are **closer but still below scaffold “measurable” counts**, often for a **different reason** (counting definition, not genesis cap).

| Root cause | Large tier (Phoenix, Houston, Dallas, Atlanta) | Mega tier (NY, LA) |
|------------|-----------------------------------------------|---------------------|
| **Blueprint anchor too low** | **Primary** — shared `LARGE_MARKET_TOTAL_STATIONS_ANCHORS` @ 2000 = **27 total** (~25 commercial) | **Moderate** — mega anchor @ 2000 = **36** (~34 commercial) |
| **Dial inventory cap** | **Binding** for Phoenix/Houston (cap **32** commercial; Duncan **36–38**) | **Partial** — NY cap **40**, LA **42** |
| **Station survival erosion** | **Secondary** — harness counts **fall** 1995→2026 | **Secondary** — same pattern |
| **Measurable vs licensed counting** | **Mixed** — scaffold measurable > primary dial listed | **Primary gap** — NY measurable **48** vs harness **~37** @ 2026 |

**Recommended next realism project (after Bundle A):** **A) Large-market anchor revision** as the tier-wide fix, plus **B) per-market dial inventory** where cap binds (Houston first), plus **D) canonical counting methodology** before debating mega-market numbers.

---

## 2. Counting methodology (canonical definitions)

The game currently mixes three concepts without always labeling which is in use. **Future supply work must pick one target per era.**

### 2.1 Definitions

| Term | Meaning | Used for |
|------|---------|----------|
| **Licensed full-power (LFP)** | AM + FM frequencies in `MARKETS.*.amFreqs` / `fmFreqs` that are commercial-usable (FM > 91.9 MHz unless override) | **Hard ceiling** on `countUsableCommercialDialSlots()` |
| **Dial-listed** | LFP + reserved-band NCE slots on the market row (may include 88.1–91.9 institutional) | Scaffold `primaryFullPower.dialListed` |
| **Blueprint live** | Stations from national `BP[]` + `MARKET_BP_PATCH` + tier inject, capped by `tierMarketCommercialTargetForGen` and tail-defer | **Genesis / starting commercial count** |
| **Gameplay active** | `G.stations` entries with `!_bpSlotDeferred` | **What the player sees in ranker** |
| **Book-measurable (Duncan / scaffold)** | Signals that would appear in a Nielsen-style book: full-power + rimshots + some translators/LPFM-style fragmentation **not** always on primary dial list | Scaffold `measurable2026`; Duncan playtest references |

### 2.2 Recommended canonical target (decision for supply branch)

| Era | Target type | Rationale |
|-----|-------------|-----------|
| **1975–1983 starts** | **Viable competitive** — stations that could matter in ratings | Historical dial; `viable1983` / `inventory1975` |
| **1995–2005 mature** | **Book-measurable** — align with Duncan comparisons | Playtest complaints (“36 stations in Phoenix”) |
| **Genesis cap (`tierMarket*ForYear`)** | Should approach **measurable − public/NCE headroom**, not a separate low curve | Fixes thin dial without double-counting |
| **Hard cap** | **LFP slots** unless HD/translator layer is built | Houston cannot reach 38 on 32 LFP tokens without expansion **or** measurable definition that includes non-LFP |

### 2.3 Counting rule (proposed)

> **Official sim target @ 2000 (large tier):** book-measurable commercial signals in ranker ≈ **34–38**, including scheduled launches and fragmentation injects, with **3–4 public/NCE** on top of commercial measurable where scaffold specifies.

> **Official sim target @ 2000 (mega tier):** book-measurable ≈ **42–48** (NYC high end), subject to LFP cap unless translator layer ships.

**Do not** compare Duncan measurable directly to `tierMarketCommercialTargetForGen` without adjustment — they measure different things today.

---

## 3. Tier station-count targets (corrected)

Current code anchors (`src/legacy.js`):

```text
SMALL:  [1975,10] [1995,15] [2000,17] [2026,22]
LARGE:  [1975,10] [1980,24] [1985,27] [1990,25] [1995,25] [2000,27] [2005,24] [2026,30]
MEGA:   [1975,22] [1985,32] [1995,35] [2025,42] [2026,44]
```

Scaffold tier bands (`scripts/scaffold-market.mjs` `SIGNAL_INVENTORY_TARGETS`):

| Tier | viable1983 | measurable2026 |
|------|------------|----------------|
| small | 10–14 | 16–24 |
| medium | 14–18 | 24–32 |
| **large** | **18–26** | **32–42** |
| **mega** | **28–35** | **45–55** |

### 3.1 Proposed tier targets @ key eras (supply branch — not implemented)

Interpolate **viable1983 → measurable2026** for blueprint **total** station targets (commercial + ~2–4 public headroom in anchor math):

| Year | Small | Large | Mega |
|------|-------|-------|------|
| 1983 | 12 | 22 | 30 |
| 1995 | 15 | 32 | 38 |
| **2000** | **17** | **36** | **42** |
| 2005 | 18 | 37 | 43 |
| 2026 | 22 | 40 | 48 |

**Duncan alignment (user-verified + scaffold):**

| Market | Tier | Duncan ~2000 | Proposed large/mega @ 2000 |
|--------|------|--------------|----------------------------|
| Phoenix | large | **36** | 36 |
| Houston | large | **38** | 36–38 |
| Dallas | large | ~37 (tier est.) | 36 |
| Atlanta | large | ~35 (tier est.) | 36 |
| Los Angeles | mega | ~45 (tier est.) | 42 |
| New York | mega | **48** (scaffold) | 42–48 |

---

## 4. Per-market comparative table

**Sources:** `MARKETS` rows · `tierMarketCommercialTargetForGen` logic · Phoenix/NYC `tmp/market_scaffold/*/signal_allocation.json` · ecology regression `mean_nBook` (1985 chrwar, 8 runs) · playtest saves Jun 2026.

### 4.1 Inventory and caps

| Market | Tier | AM | FM listed | FM commercial | **LFP cap** | Scaffold measurable | Scheduled injects (Spanish+frag) |
|--------|------|-----|-----------|---------------|-------------|---------------------|----------------------------------|
| Phoenix | large | 12 | 23 | 20 | **32** | 38 | 4 + 5 |
| Houston | large | 12 | 23 | 20 | **32** | — | 3 + 0 |
| Dallas | large | 12 | 21 | 21 | **33** | — | 2 + 0 |
| Atlanta | large | 12 | 21 | 21 | **33** | — | 0 + 0 |
| Los Angeles | mega | 15 | 32 | 27 | **42** | — | 0 + 0 |
| New York | mega | 14 | 30 | 26 | **40** | **48** | 0 + 0 |

### 4.2 Era comparison @ 2000

| Market | Anchor total | Comm target | LFP cap | Duncan ~2000 | Harness nBook† | Playtest active | **Limiting factor** |
|--------|--------------|-------------|---------|--------------|----------------|-----------------|---------------------|
| **Phoenix** | 27 | 25 | 32 | **36** | 33.6 @1995 | **30** | **Anchor** (+ cap binds @ 38) |
| **Houston** | 27 | 25 | 32 | **38** | — | **31** | **Anchor + inventory** |
| **Dallas** | 27 | 25 | 33 | ~37 | — | — | **Anchor** |
| **Atlanta** | 27 | 25 | 33 | ~35 | 30.8 @1995 | — | **Anchor** |
| **Los Angeles** | 36 | 34 | 42 | ~45 | **42.8** @1995 | — | **Counting / slight anchor** |
| **New York** | 36 | 34 | 40 | **48** | **41.8** @1995 | — | **Counting (+ inventory @ 48)** |

†Harness: `tmp/market_ecology_regression.csv` column `mean_nBook`; no Houston/Dallas rows in current regression batch.

### 4.3 Maturity drift (harness `mean_nBook`, same batch)

| Market | 1995 | 2005 | 2026 | Scaffold measurable 2026 | Δ 1995→2026 |
|--------|------|------|------|--------------------------|-------------|
| Phoenix | 33.6 | 31.1 | **29.0** | 38 | **−4.6** |
| Atlanta | 30.8 | 29.9 | **29.6** | — | −1.2 |
| Los Angeles | 42.8 | 38.8 | **36.9** | — | −5.9 |
| New York | 41.8 | 38.5 | **37.4** | 48 | **−4.4** |

Declining active count into the 2020s suggests **survival/consolidation** shaves stations after genesis — separate from the 2000 thin-dial complaint but relevant for 2026 scaffold gap.

---

## 5. Limiting-factor classification

| Market | Anchor-limited | Inventory-limited | Survival-limited | Counting mismatch |
|--------|----------------|-------------------|------------------|-------------------|
| **Phoenix** | ✅ Primary @ 2000 | ✅ @ measurable 38 | ⚠️ Late-era | ⚠️ measurable > LFP |
| **Houston** | ✅ Primary | ✅ **Cannot reach 38 on 32 LFP** | — | ⚠️ |
| **Dallas** | ✅ Primary | ⚠️ Cap 33 vs target ~37 | — | — |
| **Atlanta** | ✅ Primary | ⚠️ Cap 33 | ⚠️ Mild late-era | — |
| **Los Angeles** | ⚠️ Minor | — | ⚠️ Late-era | ✅ Harness ~43 vs Duncan ~45 |
| **New York** | ⚠️ Minor | ✅ Cap 40 vs measurable 48 | ⚠️ Late-era | ✅ **Primary** |

**Legend:**

- **Anchor-limited:** `tierMarketCommercialTargetForGen` stops genesis well below Duncan/scaffold before dial fills.
- **Inventory-limited:** `countUsableCommercialDialSlots` < book-measurable target even if anchor is raised.
- **Survival-limited:** Harness/playtest count **drops** over decades; stations defer, flip, or consolidate away.
- **Counting mismatch:** Duncan/scaffold “measurable” includes signals not represented as LFP tokens in `MARKETS`.

---

## 6. Where the missing stations go (mechanism stack)

For a **large-tier market @ 2000** targeting Duncan **36** but realizing **~30**:

```text
Duncan book-measurable target          36
  − Blueprint anchor comm target      −25   ← PRIMARY GAP (~9–11 vs anchor path)
  + Spanish/fragmentation injects       +4–6  (market-dependent)
  − Tail defer (_bpSlotDeferred)        −0–2
  − Survival / consolidation (era)    −0–2  (worse by 2026)
  ≈ Playtest / harness realized       ~30–34
```

**Missing stations are not “lost” to one bug.** They are never born (anchor), cannot be born (inventory cap), or die later (survival). Phoenix/Houston playtests match the **anchor + partial inject** story; Houston additionally **cannot** reach 38 without inventory or counting-scope change.

---

## 7. Answers to the three design questions

### Q1: What is the correct station-count target for each market tier?

| Tier | @ 1983 (viable) | @ 2000 (measurable) | @ 2026 (measurable) |
|------|-----------------|---------------------|---------------------|
| **Small** | 12 | 17 | 22 |
| **Medium** | 16 | 28 | 32 |
| **Large** | 22 | **36** | **40** |
| **Mega** | 30 | **42** | **48** |

Per-market overrides (scaffold anchors): Phoenix measurable **38**, NYC measurable **48**, Wichita **20**, etc. Tier curve is the default; scaffold rows are market truth where they exist.

### Q2: What is the correct counting methodology?

- **Player-facing ranker / CEO comparisons:** **book-measurable** (Duncan-aligned), documented per market in scaffold `signalInventory`.
- **Engine genesis cap:** same measurable target minus explicit public/NCE slots — not today’s separate low anchor curve.
- **Hard ceiling:** LFP dial tokens until translator/HD layer exists; if measurable > LFP, either expand `fmFreqs`/`amFreqs` or document rimshots as non-LFP measurable (future layer).

### Q3: Which markets are inventory-limited vs anchor-limited?

| Classification | Markets |
|----------------|---------|
| **Anchor-limited (all large tier)** | Phoenix, Houston, Dallas, Atlanta |
| **Inventory-limited (cap binds before Duncan)** | **Houston** (32 cap vs 38), **Phoenix** (32 cap vs 38), **New York** (40 cap vs 48) |
| **Anchor + inventory** | Houston (worst case) |
| **Mostly counting / late survival** | Los Angeles, New York (harness within ~5 of Duncan @ 1995; gap widens vs 2026 measurable) |
| **Neither (adequate @ 2000)** | *None confirmed in large tier*; LA nearest on harness |

---

## 8. What NOT to do yet

- ❌ Share compression scalar retune (D5 — after Bundle A)
- ❌ Spanish / pillar competition changes (separate spec)
- ❌ Per-market scatter fixes without tier anchor + counting decision
- ❌ Assume Duncan count = LFP count without scaffold pass

---

## 9. Recommended supply-branch sequence (post–Bundle A)

1. **Lock counting methodology** (this doc §2) — CEO sign-off
2. **Revise tier anchors** to §3.1 proposed curve
3. **Scaffold pass:** Houston (required), Dallas, Atlanta — `signal_allocation.json` + dial tokens if measurable > LFP
4. **Truth audit harness** — add Houston/Dallas to `market_ecology_regression` batch; assert `mean_nBook` @ 2000 per market
5. **Survival audit** — explain 1995→2026 `mean_nBook` decline before tuning survival knobs
6. **Then** realism scalar calibration (D5)

---

## 10. Evidence references

| Artifact | Path |
|----------|------|
| Tier anchors | `src/legacy.js` — `LARGE_MARKET_TOTAL_STATIONS_ANCHORS`, `MEGA_MARKET_TOTAL_STATIONS_ANCHORS` |
| Commercial target | `tierMarketCommercialTargetForGen()`, `countUsableCommercialDialSlots()` |
| Phoenix scaffold | `tmp/market_scaffold/phoenix/signal_allocation.json` |
| NYC scaffold | `tmp/market_scaffold/newyork/signal_allocation.json` |
| Harness regression | `tmp/market_ecology_regression.csv` — `mean_nBook` |
| Playtest saves | `airwave-empire-2000-0626.json` (Phoenix), `airwave-empire-2000-0626-2.json` (Houston) |
| Scaffold tier bands | `scripts/scaffold-market.mjs` — `SIGNAL_INVENTORY_TARGETS` |
