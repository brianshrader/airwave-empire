# Morning recovery A/B diagnostic
*(J successor ceiling tune grid: J0–J6)*

Generated: 2026-05-31T20:34:56.453Z

## Targets
- Fully recover prior Q: 55–65%
- Exceed prior Q: 25–35%
- Median Q recovery: 2–4 years
- Elite revenue median recovery: 1–2 years
- 95–99 OQ bucket: 8–12%
- Mean OQ: 62–66

## Variant comparison (J/K/L use successor-trigger cohort; A/G use major cohort)

| Variant | Deps | Recover Q% | Exceed Q% | Med yrs Q | Mean OQ | Pct>90 | Pct 95-99 | Spiral | Score | Ready | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| J0 | 2688 (succ) | 59.93% | 31.88% | 5.00 | 65.8 | 27.85% | 9.89% | 325 | 28.95 | no | tune |
| J1 | 2889 (succ) | 66.74% | 35.44% | 4.50 | 66.5 | 28.44% | 12.76% | 287 | 64.27 | no | leave_alone |
| J2 | 4905 (succ) | 79.37% | 50.97% | 0.50 | 65.9 | 27.68% | 16.15% | 313 | 117.94 | no | leave_alone |
| J3 | 2991 (succ) | 70.88% | 34.8% | 4.50 | 66.7 | 30.15% | 13.23% | 287 | 73.14 | no | leave_alone |
| J4 | 4907 (succ) | 80.03% | 49.3% | 1.00 | 66.6 | 27.94% | 15.75% | 307 | 120.23 | no | leave_alone |
| J5 | 3179 (succ) | 68.35% | 37.68% | 4.50 | 66.7 | 28.88% | 13.61% | 283 | 73.25 | no | leave_alone |
| J6 | 4824 (succ) | 79.02% | 51.64% | 1.00 | 66.5 | 28.46% | 17.2% | 289 | 125.31 | no | leave_alone |

## Elite losses (slot Q ≥ 90)

| Variant | Deps | Recover Q% | Exceed Q% | Med yrs Q | Med yrs rev |
| --- | --- | --- | --- | --- | --- |
| J0 | 2617 | 59.5% | 30.84% | 5.5 | 0 |
| J1 | 2810 | 66.65% | 34.7% | 5 | 0 |
| J2 | 4872 | 79.5% | 50.9% | 0.5 | 0 |
| J3 | 2909 | 70.57% | 33.48% | 4.5 | 0 |
| J4 | 4880 | 80.1% | 49.22% | 1 | 0 |
| J5 | 3097 | 68.07% | 36.68% | 4.5 | 0 |
| J6 | 4799 | 79.08% | 51.57% | 1 | 0 |

## Recommendation: **TUNE** (variant J0)

J0 baseline: 59.93% recover, median Q 5y, 95–99 9.89%. Best variant J0: 59.93% recover, 31.88% exceed, median Q 5y; elite median rev 0y; 95–99 9.89%; mean OQ 65.79. Directionally correct but misses one or more targets — continue tuning.

**Quality inflation:** solved

## Proposed minimal production implementation

1. On successor-trigger morning departure (slot Q≥90 OR tenure≥12 & slot Q≥85 OR superstar): set `station.morningSuccessorCeiling`.
2. Fixed cap 88 for 8 periods; clamp morningDrive.quality in `decay()` after prog investment each turn.
3. After fixed window: ceiling += 1 per period until replacement tenure ≥8 and ceiling ≥ prior slot Q, then delete state.
4. Store on station: `{ ceiling, fixedCap, fixedPeriods, risePerPeriod, priorSlotQ, priorShare, periodsActive }`.
5. Wire in real departure handlers (contract expiry, poach, player hire) — same trigger predicate as diagnostic.
6. Call `refreshStationOQ(st, G)` after clamp; no separate AI path.

## 2020 OQ bucket distribution

### J0
lt50: 34.75% · 50-59: 8.48% · 60-69: 6.07% · 70-79: 6.4% · 80-89: 16.46% · 90-94: 17.79% · 95-99: 10.06%

### J1
lt50: 32.03% · 50-59: 8.84% · 60-69: 7.51% · 70-79: 6.84% · 80-89: 16.35% · 90-94: 15.6% · 95-99: 12.84%

### J2
lt50: 32.95% · 50-59: 9.31% · 60-69: 6.59% · 70-79: 7.74% · 80-89: 15.73% · 90-94: 11.29% · 95-99: 16.39%

### J3
lt50: 31.66% · 50-59: 8.79% · 60-69: 7.87% · 70-79: 6.95% · 80-89: 14.57% · 90-94: 16.83% · 95-99: 13.32%

### J4
lt50: 33.42% · 50-59: 7.79% · 60-69: 6.88% · 70-79: 8.37% · 80-89: 15.59% · 90-94: 12.19% · 95-99: 15.75%

### J5
lt50: 31.55% · 50-59: 7.93% · 60-69: 7.76% · 70-79: 8.68% · 80-89: 15.19% · 90-94: 15.28% · 95-99: 13.61%

### J6
lt50: 31.3% · 50-59: 9.85% · 60-69: 6.59% · 70-79: 10.1% · 80-89: 13.69% · 90-94: 11.27% · 95-99: 17.2%
