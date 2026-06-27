# Large-Market Dial Depth / Supply Spec

**Status:** Design — implement after MVB-A (Bundle A complete)  
**Trigger:** Phoenix + Houston playtests (Jun 2026); Duncan book comparisons

## Problem

Large-tier markets feel **thin** by ~2000: players report ~30–31 live signals while Duncan/Nielsen-shaped books show **~36–38 measurable stations** (Phoenix ~36, Houston ~38).

Symptoms without any ratings bug:

- Fatter per-station shares (15%+ leaders more common)
- Stronger lane hoarding
- Less clutter / competitive pressure
- “Market feels good but sparse” — not “Spanish is broken”

This is **orthogonal** to Bundle A format cardinality and to share-compression calibration.

## Root cause (code)

`LARGE_MARKET_TOTAL_STATIONS_ANCHORS` in `src/legacy.js`:

| Year | Current anchor (total) | Duncan-ish target |
|------|------------------------|-------------------|
| 1995 | 25 | ~32 |
| 2000 | **27** | **~36–38** |
| 2005 | 24 | ~34 |
| 2026 | 30 | ~38 (scaffold measurable) |

`tierMarketCommercialTargetForGen` returns `tot - 2` (NCE/public headroom), so 2000 commercial target ≈ **25** before scheduled launches add a few.

Phoenix scaffold: **35 dial-listed tokens**, **38 measurable @ 2026**.  
Houston `MARKETS` row: **12 AM + 23 FM** → **~32 commercial-usable slots** today (reserved-band FMs excluded). Duncan **38** may require **dial inventory expansion**, not anchor bump alone.

## Proposed anchor revision (large tier)

Interpolate between scaffold **viable1983 (~22)** and **measurable2026 (~38)**:

| Year | Proposed total | Notes |
|------|----------------|-------|
| 1985 | 26 | Slight trim vs today |
| 1990 | 28 | |
| 1995 | 32 | Fragmentation era |
| **2000** | **36** | Duncan midpoint Phoenix/Houston |
| 2005 | 37 | |
| 2010 | 38 | |
| 2026 | 40 | Rimshot / measurable headroom |

Mega tier unchanged (separate curve). Small tier unchanged.

## Per-market work (not one scalar)

| Market | Action |
|--------|--------|
| **Houston** | Scaffold pass: enumerate 38 measurable @ 2000; add FM/AM tokens if dial cap < 38 |
| **Phoenix** | Align anchors with existing `signal_allocation.json` (38 measurable) |
| **Dallas / Atlanta** | Same large-tier curve; verify dial lists support target |
| **Miami** | Spanish-heavy; confirm launches + cap |

## Implementation order

1. **Memo approved** (this doc)
2. **After MVB-A** — revise `LARGE_MARKET_TOTAL_STATIONS_ANCHORS` + `tierMarketBpTailDeferIndices` QA
3. **Houston + Phoenix scaffold** — dial token audit vs Duncan
4. **Truth audit** — `diag-phoenix-truth-audit.mjs` + Houston equivalent @ 2000 station count + top-5 mass
5. **Then** realism scalar calibration (D5)

## Out of scope

- Share compression scalar retune (pre-MVB-A)
- Spanish Composition changes
- Mega-market anchor changes (unless playtests show same thin-dial complaint)

## Success criteria

- Large-tier playable markets @ 2000: **34–38 live signals** (commercial + public), within dial cap
- Median commercial share **~2.5–3.0%** without calibration change
- Top station **≤12%** in fragmented Sunbelt books (directional; not hard gate)
- Player complaint shifts from “thin dial” to “believable fragmentation”

## References

- `tmp/market_scaffold/phoenix/signal_allocation.json`
- `docs/BUNDLE_A_INTEGRATION_DECISION_MEMO.md` (D5 calibration deferral)
- Playtest saves: `airwave-empire-2000-0626.json` (Phoenix), `airwave-empire-2000-0626-2.json` (Houston)
