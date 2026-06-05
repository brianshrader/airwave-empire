# Elite Daypart Quality Audit

Generated: 2026-06-01T04:25:03.438Z

## Notes

- Diagnostic is **measurement-only**; no tuning changes.
- “Minimal investment” in UI is `progBudget < 34% of cap` (see `progBudgetInvestmentTierLabel`).
- Slot quality can rise via: programming budget boosts, focused-programming bump, reveal steps, hires/poaches, and other mechanics; attribution is coarse and tracked in events.

## Snapshot distribution (aggregated across runs/markets)

### 1980

Total station-rows: 972
- morningDrive: 90+ 40.6% · 95+ 38.5% · 98+ 2.1% (denom 972)
- midday: 90+ 36.6% · 95+ 34.5% · 98+ 0.9% (denom 972)
- afternoonDrive: 90+ 38.6% · 95+ 37.6% · 98+ 2.6% (denom 972)
- allPrime95: 296 · allPrime98: 0

### 1990

Total station-rows: 1224
- morningDrive: 90+ 30.1% · 95+ 28.3% · 98+ 1.1% (denom 1224)
- midday: 90+ 28.6% · 95+ 26.1% · 98+ 0.4% (denom 1224)
- afternoonDrive: 90+ 30.1% · 95+ 27.1% · 98+ 0.7% (denom 1224)
- allPrime95: 227 · allPrime98: 0

### 2000

Total station-rows: 1311
- morningDrive: 90+ 31.7% · 95+ 30.1% · 98+ 0.8% (denom 1311)
- midday: 90+ 29.4% · 95+ 27.2% · 98+ 0.3% (denom 1311)
- afternoonDrive: 90+ 29.8% · 95+ 28% · 98+ 0.8% (denom 1311)
- allPrime95: 263 · allPrime98: 0

### 2010

Total station-rows: 1243
- morningDrive: 90+ 31.7% · 95+ 29.4% · 98+ 0.7% (denom 1243)
- midday: 90+ 29.8% · 95+ 27.1% · 98+ 0.2% (denom 1243)
- afternoonDrive: 90+ 34.4% · 95+ 31.1% · 98+ 1% (denom 1243)
- allPrime95: 210 · allPrime98: 0

### 2020

Total station-rows: 1156
- morningDrive: 90+ 37.2% · 95+ 33.5% · 98+ 0.7% (denom 1156)
- midday: 90+ 33.5% · 95+ 30.4% · 98+ 0.6% (denom 1156)
- afternoonDrive: 90+ 36.3% · 95+ 32.2% · 98+ 0.4% (denom 1156)
- allPrime95: 239 · allPrime98: 0

## Nashville 1970 start case study

Diagnostic variant: force top-2 commercial stations to `isPlayer=true` at start (measurement only) and simulate to 1980.

Runs: 6/6
- By 1980: allPrime95=34 · allPrime98=0 (across all stations, aggregated)
- Morning 95+=43/120 · 98+=4/120
