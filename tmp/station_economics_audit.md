# Station Economics / EBITDA Margin Audit

Diagnostic: `scripts/diag-station-economics-audit.mjs` · `npm run diag:station-economics`

Markets: newyork, losangeles, chicago, seattle, sanfrancisco, atlanta, nashville, wichita
Start years: 1970, 1985, 2000 · 4 seeds/cell · snapshots: 1980, 1990, 2000, 2010, 2020, 2025

_Method: headless `genMarket('under')` with all `isPlayer` cleared — full commercial book, not a single player flagship._

## Verdict: **E) Needs further targeted audit**

Talent-cut what-if (non-morning daypart removed): **A**

- Cutting a daypart raises EBITDA on 97.2% of already-profitable stations (mechanical save; see margin tables)
- San Francisco 1980: 0.0% of commercial snapshots ≥45% margin (median -105.5%)
- 98.0% of 2010–2025 commercial snapshots are unprofitable (high distress, not weak pressure)
- Market-wide modern snapshots are mostly deep losses with almost no high-margin outliers — player-flagship audit recommended

## EBITDA margin by era × market tier (commercial stations)
| Era | Tier | N | Med margin | P25 | P75 | >30% | >40% | Neg EBITDA |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1980s | mega | 240 | -171.7% | -475.2% | -45.0% | 5.0% | 0.8% | 86.7% |
| 1980s | large | 168 | -117.1% | -242.7% | -42.5% | 0.0% | 0.0% | 92.9% |
| 1980s | medium | 52 | -214.3% | -477.8% | -125.7% | 0.0% | 0.0% | 100.0% |
| 1980s | small | 32 | -277.2% | -485.6% | -109.2% | 0.0% | 0.0% | 100.0% |
| 1990s | mega | 480 | -490.7% | -2729.9% | -74.0% | 3.3% | 1.5% | 90.6% |
| 1990s | large | 336 | -472.7% | -1033.3% | -50.8% | 0.3% | 0.0% | 92.9% |
| 1990s | medium | 104 | -606.8% | -974.7% | -239.5% | 0.0% | 0.0% | 100.0% |
| 1990s | small | 64 | -662.1% | -939.4% | -337.1% | 0.0% | 0.0% | 100.0% |
| 2000s | mega | 756 | -1096.7% | -5773.0% | -172.6% | 3.4% | 0.1% | 92.3% |
| 2000s | large | 504 | -1503.0% | -2996.4% | -91.9% | 0.0% | 0.0% | 92.9% |
| 2000s | medium | 156 | -1733.1% | -2595.5% | -158.1% | 0.0% | 0.0% | 100.0% |
| 2000s | small | 96 | -828.1% | -1974.6% | -122.4% | 0.0% | 0.0% | 100.0% |
| 2010s | mega | 756 | -1277.1% | -7576.8% | -252.3% | 2.6% | 0.0% | 97.2% |
| 2010s | large | 504 | -2215.2% | -4670.5% | -205.6% | 0.0% | 0.0% | 96.2% |
| 2010s | medium | 156 | -4449.8% | -6750.3% | -758.7% | 0.0% | 0.0% | 100.0% |
| 2010s | small | 96 | -1795.4% | -3484.7% | -215.9% | 0.0% | 0.0% | 100.0% |
| 2020s | mega | 1512 | -2095.9% | -7558.6% | -334.8% | 0.0% | 0.0% | 97.3% |
| 2020s | large | 1008 | -3041.5% | -5819.4% | -357.0% | 0.0% | 0.0% | 98.9% |
| 2020s | medium | 312 | -5710.4% | -8238.5% | -525.3% | 0.0% | 0.0% | 100.0% |
| 2020s | small | 192 | -2140.6% | -5407.1% | -279.3% | 0.0% | 0.0% | 100.0% |

## Successful stations — margin by era × rank bucket
| Era | Rank | N | Med margin | Med rev | Talent % rev | Fixed % rev |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1980s | rank1 | 32 | -4.2% | $767K | 5.7% | 45.4% |
| 1980s | top3 | 64 | -22.3% | $553K | 6.0% | 59.1% |
| 1980s | top5 | 64 | -44.9% | $338K | 8.9% | 80.2% |
| 1990s | rank1 | 64 | 18.7% | $1.56M | 2.7% | 29.9% |
| 1990s | top3 | 128 | -39.0% | $598K | 6.5% | 75.2% |
| 1990s | top5 | 128 | -142.0% | $366K | 8.7% | 145.7% |
| 2000s | rank1 | 96 | 15.8% | $1.83M | 3.4% | 28.6% |
| 2000s | top3 | 192 | -83.7% | $592K | 9.0% | 97.9% |
| 2000s | top5 | 192 | -391.5% | $234K | 20.3% | 333.2% |
| 2010s | rank1 | 96 | -40.2% | $1.19M | 7.5% | 64.5% |
| 2010s | top3 | 192 | -187.7% | $364K | 16.7% | 184.4% |
| 2010s | top5 | 192 | -992.0% | $103K | 44.9% | 762.2% |
| 2020s | rank1 | 192 | -87.4% | $792K | 15.8% | 104.7% |
| 2020s | top3 | 384 | -260.6% | $249K | 28.5% | 225.8% |
| 2020s | top5 | 384 | -1194.0% | $73K | 74.8% | 948.7% |

## Modern era (2010–2025 snapshots)
- Commercial station-periods: **4536**
- Unprofitable (EBITDA < 0): **98.0%**
- Profitable but <15% margin: **99.0%**
- Above 30% margin: **0.5%**
- Above 40% margin: **0.0%**

## San Francisco 1980 (player concern benchmark)
- N=56 · median margin **-105.5%** · p75 **-37.3%**
- Share ≥45% margin: **0.0%** · ≥40%: **0.0%**
- Median rev $212K · expenses $463K · EBITDA $-216K · talent 13.3% of rev

## Elite stations (OQ ≥ 90, rank ≤ 5)
| N | Med margin | Talent % | Fixed % | Staffed DP | Automated DP |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | — | — | — | — | — |

## Talent-cut what-if (last snapshot year per run)
- Cases: **1512** · median EBITDA Δ **$162K** · median rev Δ **$-149**
- Saves distressed: **99.7%** · Boosts profitable: **97.2%**
- Rev loss > salary save: **1.1%** · Minimal effect: **0.1%**

Interpretation key: **A** saves distressed · **B** margin-harvest on winners · **C** revenue hit dominates · **D** negligible

## Rerun
```bash
npm run diag:station-economics
node scripts/diag-station-economics-audit.mjs --runs=6 --seed=20260615
```