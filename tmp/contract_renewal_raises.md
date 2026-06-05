# Contract renewal raises (diagnostic)

Generated: 2026-06-04T17:57:25.599Z

## Definition

- **Renewal raise** = percent change in **annual salary** when a contract is extended (`doExtend` for player; AI uses `salary × U(1.08, 1.22)`).
- **Not included:** automatic **Fall COLA** / share-pressure bumps each half-year (`advTurn` period 2).
- Player offers come from `buildContractEconObject` (demand, leverage, elite anchor, retention modifiers).

## Sample

| Source | N | Mean raise % |
| --- | ---: | ---: |
| All renewals | 58955 | 14.71 |
| Player extend | 1757 | 5.56 |
| AI rival | 57198 | 14.99 |

## By dimension (all renewals)

### marketSize_rankTier

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| large | 10873 | 14.7 | 14.81 |
| medium | 8865 | 14.59 | 14.67 |
| mega | 28878 | 14.79 | 14.84 |
| small | 10339 | 14.61 | 14.73 |

### stationRank_bookShare

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| bottom_third | 9054 | 14.48 | 14.73 |
| mid_pack | 17478 | 14.47 | 14.56 |
| rank6-10 | 15451 | 14.81 | 14.84 |
| top3 | 10153 | 15 | 14.94 |
| top4-5 | 6819 | 15 | 15.05 |

### talentQuality_trueQ

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| entry_<42 | 32227 | 14.51 | 14.61 |
| mid_42-71 | 26712 | 14.96 | 15 |
| strong_72-84 | 16 | 13.85 | 12.59 |

### stationProfitability_ebitdaMargin

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| high_35pct+ | 23769 | 14.99 | 15 |
| loss | 22749 | 14.34 | 14.47 |
| low_0-15pct | 3960 | 14.78 | 14.86 |
| mid_15-35pct | 8424 | 14.92 | 14.95 |
| no_rev | 53 | 13.66 | 12.62 |

### tenureYearsAtRenewal

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| 0-1yr | 11092 | 14.93 | 14.94 |
| 10-14yr | 4139 | 14.18 | 14.38 |
| 15-19yr | 1556 | 13.58 | 14.15 |
| 2-4yr | 27409 | 14.87 | 14.88 |
| 20yr+ | 882 | 12.64 | 13.35 |
| 5-9yr | 13877 | 14.64 | 14.72 |

## By dimension (player extends only)

### marketSize_rankTier

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| large | 357 | 4.79 | 4.68 |
| medium | 384 | 6.22 | 5.71 |
| mega | 667 | 5.4 | 5 |
| small | 349 | 5.93 | 5 |

### stationRank_bookShare

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| bottom_third | 524 | 4.76 | 4.17 |
| mid_pack | 870 | 5.34 | 5 |
| rank6-10 | 341 | 7.07 | 6.25 |
| top4-5 | 22 | 9.94 | 8.48 |

### talentQuality_trueQ

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| entry_<42 | 1581 | 5.41 | 5 |
| mid_42-71 | 176 | 6.91 | 5.99 |

### stationProfitability_ebitdaMargin

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| high_35pct+ | 56 | 7.66 | 6.4 |
| loss | 1550 | 5.38 | 4.98 |
| low_0-15pct | 89 | 6.68 | 6.22 |
| mid_15-35pct | 60 | 6.68 | 6.02 |
| no_rev | 2 | 5.14 | 5.14 |

### tenureYearsAtRenewal

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| 0-1yr | 182 | 7.51 | 6.4 |
| 10-14yr | 304 | 4.35 | 4.2 |
| 15-19yr | 213 | 3.67 | 3.13 |
| 2-4yr | 342 | 7.53 | 6.35 |
| 20yr+ | 176 | 2.96 | 2.45 |
| 5-9yr | 540 | 5.93 | 5.41 |

## Tenure milestones (years after hire at renewal)

### 5yr after hire

| Cohort | N | Mean % | Median % |
| --- | ---: | ---: | ---: |
| All renewals | 14247 | 14.82 | 14.85 |
| Player only | 326 | 6.68 | 5.81 |

### 5yr — player — market tier

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| large | 70 | 5.78 | 5.29 |
| medium | 71 | 8.41 | 7.14 |
| mega | 124 | 5.78 | 5.28 |
| small | 61 | 7.55 | 5.88 |

### 5yr — player — quality

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| entry_<42 | 297 | 6.73 | 5.71 |
| mid_42-71 | 29 | 6.25 | 6.01 |

### 5yr — player — station profitability

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| loss | 303 | 6.82 | 5.88 |
| low_0-15pct | 17 | 5 | 4.26 |
| mid_15-35pct | 6 | 4.82 | 4.53 |

### 10yr after hire

| Cohort | N | Mean % | Median % |
| --- | ---: | ---: | ---: |
| All renewals | 3727 | 14.27 | 14.53 |
| Player only | 255 | 4.65 | 4.76 |

### 10yr — player — market tier

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| large | 49 | 3.95 | 4.19 |
| medium | 57 | 5.52 | 5.46 |
| mega | 97 | 4.43 | 4.35 |
| small | 52 | 4.74 | 4.87 |

### 10yr — player — quality

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| entry_<42 | 250 | 4.64 | 4.71 |
| mid_42-71 | 5 | 5.22 | 5.5 |

### 10yr — player — station profitability

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| loss | 251 | 4.67 | 4.76 |
| low_0-15pct | 3 | 3.88 | 3.45 |
| mid_15-35pct | 1 | 0 | 0 |

### 20yr after hire

| Cohort | N | Mean % | Median % |
| --- | ---: | ---: | ---: |
| All renewals | 501 | 13.11 | 13.55 |
| Player only | 79 | 3.44 | 2.83 |

### 20yr — player — market tier

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| large | 15 | 2.57 | 2.29 |
| medium | 19 | 3.55 | 2.76 |
| mega | 27 | 4.05 | 2.94 |
| small | 18 | 3.13 | 2.9 |

### 20yr — player — quality

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| entry_<42 | 79 | 3.44 | 2.83 |

### 20yr — player — station profitability

| Bucket | N | Mean raise % | Median raise % |
| --- | ---: | ---: | ---: |
| high_35pct+ | 1 | 3.16 | 3.16 |
| loss | 78 | 3.45 | 2.82 |

