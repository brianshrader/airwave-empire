# Morning recovery A/B diagnostic
*(follow-up grid: A, E, F, G, H, I)*

Generated: 2026-05-31T20:13:39.424Z

## Targets
- Fully recover prior Q: 55–65%
- Exceed prior Q: 25–35%
- Median Q recovery: 1.5–3.0 years
- Elite revenue median recovery: 1–2 years
- 95–99 OQ bucket: 8–12%
- Mean OQ: 62–66

## Variant comparison (major morning departures)

| Variant | Major deps | Recover Q% | Exceed Q% | Med yrs Q | Rev recover% | Med yrs rev | Mean OQ | Pct>90 | Pct 95-99 | Score | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 5990 | 84.67% | 41.4% | 0.50 | 82.37% | 0.00 | 67.3 | 32.03% | 21.58% | 133.39 | baseline |
| E | 4350 | 73.56% | 39.75% | 2.00 | 80.46% | 0.00 | 65.2 | 24.1% | 17.55% | 78.98 | tune |
| F | 4472 | 75.96% | 41.12% | 1.50 | 81.4% | 0.00 | 64.8 | 23.81% | 16.57% | 83.65 | tune |
| G | 4184 | 72.8% | 39.1% | 2.00 | 81.07% | 0.00 | 65.3 | 24.83% | 16.97% | 75.11 | tune |
| H | 4318 | 74.04% | 40.18% | 2.00 | 79.46% | 0.00 | 65.2 | 24.63% | 16.94% | 79.02 | tune |
| I | 4543 | 75.63% | 40.63% | 1.50 | 80.34% | 0.00 | 64.5 | 23.61% | 16.62% | 81.99 | tune |

## Elite losses (slot Q ≥ 90)

| Variant | Deps | Recover Q% | Exceed Q% | Med yrs Q | Med yrs rev |
| --- | --- | --- | --- | --- | --- |
| A | 4971 | 88.55% | 36.85% | 0.5 | 0 |
| E | 3229 | 77.95% | 33.45% | 1.5 | 0 |
| F | 3351 | 78.63% | 32.56% | 2 | 0 |
| G | 3045 | 77.08% | 31.49% | 2 | 0 |
| H | 3246 | 78.13% | 33.73% | 1.5 | 0 |
| I | 3407 | 78.78% | 33.11% | 2 | 0 |

## Recommendation: **TUNE** (variant G)

Baseline A: 84.67% recover, 41.4% exceed, median Q 0.5y; 95–99 21.58%; mean OQ 67.33. Prior E: 73.56% recover, 95–99 17.55%, mean OQ 65.24. Best grid variant G: major recover 72.8%, exceed 39.1%, median Q 2y; elite median rev 0y; 95–99 16.97%; mean OQ 65.29. Strongest levers: recover Q → E vs A (combined shock+reset baseline) (-11.11); 95–99 bucket → E vs A (combined shock+reset baseline) (-4.03); median Q time → E vs A (combined shock+reset baseline) (+1.5). Directionally correct but misses one or more targets — tune parameters.

**Quality inflation:** reduced_not_solved

## Parameter levers (largest movers vs E)

- **pctFullyRecoverQuality**: E vs A (combined shock+reset baseline) (-11.11)
- **pctExceedPriorQuality**: E vs A (combined shock+reset baseline) (-1.65)
- **medianYearsToRecoverQuality**: E vs A (combined shock+reset baseline) (+1.5)
- **medianYearsToRecoverRevenue**: n/a
- **pct9599**: E vs A (combined shock+reset baseline) (-4.03)
- **meanOqAcrossRuns**: E vs A (combined shock+reset baseline) (-2.09)

## 2020 OQ bucket distribution

### A
lt50: 31.95% · 50-59: 8.13% · 60-69: 7.39% · 70-79: 9.05% · 80-89: 11.45% · 90-94: 10.46% · 95-99: 21.58%

### E
lt50: 32.75% · 50-59: 8.73% · 60-69: 10.33% · 70-79: 11.08% · 80-89: 13.01% · 90-94: 6.55% · 95-99: 17.55%

### F
lt50: 33.39% · 50-59: 9.74% · 60-69: 9.74% · 70-79: 9.49% · 80-89: 13.82% · 90-94: 7.24% · 95-99: 16.57%

### G
lt50: 32.19% · 50-59: 9.53% · 60-69: 9.2% · 70-79: 12.04% · 80-89: 12.21% · 90-94: 7.86% · 95-99: 16.97%

### H
lt50: 32.89% · 50-59: 10.41% · 60-69: 8.1% · 70-79: 11.49% · 80-89: 12.48% · 90-94: 7.6% · 95-99: 17.02%

### I
lt50: 34.5% · 50-59: 8.81% · 60-69: 8.15% · 70-79: 12.05% · 80-89: 12.88% · 90-94: 6.9% · 95-99: 16.71%
