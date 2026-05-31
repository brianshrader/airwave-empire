# Morning recovery A/B diagnostic

Generated: 2026-05-31T20:06:54.447Z

## Targets
- Fully recover prior Q: 55–65%
- Exceed prior Q: 25–35%
- Median Q recovery: 1.5–2.5 years
- 95–99 OQ bucket: ideally under 10–12%

## Baseline vs variants (major morning departures)

| Variant | Major deps | Recover Q% | Exceed Q% | Med yrs Q | Rev recover% | Med yrs rev | Mean OQ | Pct>90 | Pct 95-99 | Score | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 5990 | 84.67% | 41.4% | 0.50 | 82.37% | 0.00 | 67.3 | 32.03% | 21.58% | 114.89 | baseline |
| B | 5749 | 83.77% | 39.35% | 0.50 | 81.01% | 0.00 | 67.2 | 31.79% | 23.47% | 114.74 | leave_alone |
| C | 4539 | 77.09% | 43.03% | 1.50 | 81.21% | 0.00 | 65.0 | 25.68% | 19.39% | 85.7 | leave_alone |
| D | 4393 | 75.23% | 40.97% | 1.50 | 80.49% | 0.00 | 64.4 | 24.94% | 18.68% | 77.12 | tune |
| E | 4378 | 74.19% | 40.22% | 2.00 | 80.74% | 0.00 | 64.2 | 23.18% | 15.59% | 65.19 | tune |

## Recommendation: **Variant E** (tune)

Baseline (A): 84.67% recover, 41.4% exceed, median 0.5y; 95–99 bucket 21.58%. Best-scoring variant E: 74.19% recover, 40.22% exceed, median 2y; 95–99 15.59%; score 65.19. Closest variant needs parameter tuning before shipping.

## 2020 OQ bucket distribution (commercial, all runs pooled)

### A
lt50: 31.95% · 50-59: 8.13% · 60-69: 7.39% · 70-79: 9.05% · 80-89: 11.45% · 90-94: 10.46% · 95-99: 21.58%

### B
lt50: 33.39% · 50-59: 9.08% · 60-69: 5.55% · 70-79: 7.49% · 80-89: 12.7% · 90-94: 8.33% · 95-99: 23.47%

### C
lt50: 33.47% · 50-59: 9.36% · 60-69: 9.53% · 70-79: 10.69% · 80-89: 11.27% · 90-94: 6.3% · 95-99: 19.39%

### D
lt50: 35.11% · 50-59: 9.09% · 60-69: 7.92% · 70-79: 11.43% · 80-89: 11.51% · 90-94: 6.26% · 95-99: 18.68%

### E
lt50: 34.53% · 50-59: 9.47% · 60-69: 9.06% · 70-79: 11.59% · 80-89: 12.16% · 90-94: 7.51% · 95-99: 15.67%
