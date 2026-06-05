# Morning recovery A/B diagnostic
*(successor ceiling grid: A, G, J, K, L)*

Generated: 2026-05-31T20:24:17.777Z

## Targets
- Fully recover prior Q: 55–65%
- Exceed prior Q: 25–35%
- Median Q recovery: 2–4 years
- Elite revenue median recovery: 1–2 years
- 95–99 OQ bucket: 8–12%
- Mean OQ: 62–66

## Variant comparison (J/K/L use successor-trigger cohort; A/G use major cohort)

| Variant | Major deps | Recover Q% | Exceed Q% | Med yrs Q | Rev recover% | Med yrs rev | Mean OQ | Pct>90 | Pct 95-99 | Score | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 5990 (major) | 84.67% | 41.4% | 0.50 | 82.37% | 0.00 | 67.3 | 32.03% | 21.58% | 134.39 | baseline |
| G | 4184 (major) | 72.8% | 39.1% | 2.00 | 81.07% | 0.00 | 65.3 | 24.83% | 16.97% | 77.11 | leave_alone |
| J | 2679 (succ) | 59.61% | 31.91% | 5.00 | 82.34% | 0.00 | 65.9 | 27.92% | 9.83% | 30.06 | tune |
| K | 1959 (succ) | 42.88% | 23.99% | 1.50 | 81.47% | 0.00 | 64.9 | 19.09% | 8.19% | 77.93 | leave_alone |
| L | 1965 (succ) | 43% | 23.16% | 1.50 | 79.64% | 0.00 | 65.0 | 18.32% | 8.49% | 78.33 | leave_alone |

## Elite losses (slot Q ≥ 90)

| Variant | Deps | Recover Q% | Exceed Q% | Med yrs Q | Med yrs rev |
| --- | --- | --- | --- | --- | --- |
| A | 4971 | 88.55% | 36.85% | 0.5 | 0 |
| G | 3045 | 77.08% | 31.49% | 2 | 0 |
| J | 2609 | 59.18% | 30.89% | 5.5 | 0 |
| K | 1864 | 42.97% | 23.12% | 1.5 | 0 |
| L | 1866 | 43.03% | 22.19% | 1.5 | 0 |

## Recommendation: **TUNE** (variant J)

Baseline A: 84.67% recover (major), 95–99 21.58%, mean OQ 67.33. Prior G (shock): 72.8% recover, 95–99 16.97%, median Q 2y. Best variant J: 59.61% recover, 31.91% exceed, median Q 5y; elite median rev 0y; 95–99 9.83%; mean OQ 65.89. Directionally correct but misses one or more targets — tune parameters.

**Quality inflation:** solved

## Proposed minimal production implementation

Simple fixed cap (88 for 8 periods, +1/period after) — easy to ship but weaker inflation control than dynamic K; use only as fallback.

## 2020 OQ bucket distribution

### A
lt50: 31.95% · 50-59: 8.13% · 60-69: 7.39% · 70-79: 9.05% · 80-89: 11.45% · 90-94: 10.46% · 95-99: 21.58%

### G
lt50: 32.19% · 50-59: 9.53% · 60-69: 9.2% · 70-79: 12.04% · 80-89: 12.21% · 90-94: 7.86% · 95-99: 16.97%

### J
lt50: 34.42% · 50-59: 8.5% · 60-69: 6.42% · 70-79: 6.25% · 80-89: 16.5% · 90-94: 17.92% · 95-99: 10%

### K
lt50: 32.69% · 50-59: 8.78% · 60-69: 7.85% · 70-79: 9.88% · 80-89: 21.71% · 90-94: 10.81% · 95-99: 8.28%

### L
lt50: 32.72% · 50-59: 8.08% · 60-69: 8.33% · 70-79: 11.49% · 80-89: 21.07% · 90-94: 9.83% · 95-99: 8.49%
