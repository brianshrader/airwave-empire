# Audience Expansion Audit — Anchor 10 vs 16 vs 18

Runs: 40/market/anchor · seed 20260609 · 1970 opening · `under`

## 1. Opening metrics by market & anchor (medians)

| Market | Anchor | Comm | Total AQH | Half-period billing | Revenue pool | Avg rev/st | Avg share/st | AQH/st | $/AQH |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| seattle | 10 | 8 | 92,741 | $8,959,673 | $8,959,673 | $1,119,959 | 12.26% | 11,593 | $96.88 |
| seattle | 16 | 14 | 91,264 | $8,959,673 | $8,959,673 | $639,977 | 7.06% | 6,519 | $98.27 |
| seattle | 18 | 16 | 92,028 | $8,959,673 | $8,959,673 | $559,980 | 6.18% | 5,752 | $97.45 |
| sanfrancisco | 10 | 8 | 82,478 | $8,633,427 | $8,633,427 | $1,079,178 | 12.26% | 10,310 | $104.95 |
| sanfrancisco | 16 | 14 | 80,894 | $8,633,427 | $8,633,427 | $616,673 | 7.05% | 5,778 | $106.82 |
| sanfrancisco | 18 | 16 | 81,765 | $8,633,427 | $8,633,427 | $539,589 | 6.18% | 5,110 | $105.69 |
| atlanta | 10 | 8 | 51,934 | $6,854,400 | $6,854,400 | $856,800 | 12.24% | 6,492 | $132.34 |
| atlanta | 16 | 14 | 51,211 | $6,854,400 | $6,854,400 | $489,600 | 7.05% | 3,658 | $133.97 |
| atlanta | 18 | 16 | 51,489 | $6,854,400 | $6,854,400 | $428,400 | 6.17% | 3,218 | $133.23 |

## 2. Growth rates (median aggregates)

| Market | Transition | Station count | Revenue pool | Total AQH | Half billing | Avg rev/st | Avg share/st | Gap (st−rev) | Gap (st−AQH) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| seattle | 10→16 | 75.0% | 0.0% | -1.6% | 0.0% | -42.9% | -42.4% | 75.0% | 76.6% |
| seattle | 10→18 | 100.0% | 0.0% | -0.8% | 0.0% | -50.0% | -49.6% | 100.0% | 100.8% |
| sanfrancisco | 10→16 | 75.0% | 0.0% | -1.9% | 0.0% | -42.9% | -42.4% | 75.0% | 76.9% |
| sanfrancisco | 10→18 | 100.0% | -0.0% | -0.9% | 0.0% | -50.0% | -49.6% | 100.0% | 100.9% |
| atlanta | 10→16 | 75.0% | 0.0% | -1.4% | 0.0% | -42.9% | -42.4% | 75.0% | 76.4% |
| atlanta | 10→18 | 100.0% | 0.0% | -0.9% | 0.0% | -50.0% | -49.6% | 100.0% | 100.9% |
| **pooled** | **10→16** | **75.0%** | **0.0%** | **-1.9%** | **0.0%** | **-42.9%** | **-42.4%** | **75.0%** | **76.9%** |

## 3. Answers

**A) Does the market itself become larger?** billing/revenue pool flat; AQH mass does not scale with dial — redistribution

**B) Does total commercial billing increase proportionally with station count?** half-period billing target unchanged by anchor (marketAnnualBilling spine)

**C) Redistribution vs expansion?** mostly redistributing fixed pool among more stations

Anchor dial increases commercial station count; opening half-period billing target and summed commercial revenue pool stay ~flat per market. Total commercial AQH and per-station average share/revenue fall ~in proportion to added stations — audience fragmentation without meaningful audience/revenue expansion.

Mechanism: `seedRev` scales station dollars to `marketAnnualBilling(year, marketId)` half-period target — **not** station count. `applyListeningHoursShareFromAqh` normalizes headline shares to AQH mass; more competitors split cohort listening in `recalc`.
