# Starter Rank Position Audit

Diagnostic: scripts/diag-starter-rank-position-audit.mjs

Markets: seattle, sanfrancisco, atlanta · 18 runs · seed 20260611 · rank pin uses fixed commercial share pool (applyWlHarnessPlayerSharePin)

## Opening position by anchor (variant A, pooled)

| Anchor | Surv@2000 | Med rank | Med share | Gap to #1 | Gap to #3 | Gap to median | Share pctile |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 59.3% | #5 | 10.6% | 12.2% | 10.5% | 9.8% | 37.5 |
| 16 | 44.4% | #5 | 7.8% | 10.1% | 8.9% | -0.7% | 64.3 |
| 18 | 42.6% | #5.5 | 7.7% | 10.0% | 9.1% | -2.5% | 68.8 |

## Survival by opening rank bucket (anchor 16, variant A)

| Bucket | N | Surv@2000 | Peak share | Stations@2000 | Acq |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1-3 | 0 | — | — | — | — |
| 4-5 | 30 | 63.3% | 6.5% | 1 | 12.5 |
| 6-7 | 24 | 20.8% | 6.0% | 0 | 0 |
| 8+ | 0 | — | — | — | — |

## Rank-pin variants @ anchor 16 (same station asset, fixed market audience)

| Var | Target rank | Med rank | Med share | Surv@2000 | Δ vs A | Peak sh |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | — | #5 | 7.8% | 44.4% | 0.0% | 6.3% |
| B | 5 | #5 | 8.0% | 31.5% | -13.0% | 6.4% |
| C | 4 | #4 | 12.0% | 55.6% | 11.1% | 6.7% |
| D | 3 | #2 | 15.3% | 44.4% | 0.0% | 7.4% |

## Answer

**Weak rank-pin effect in this harness.** Survival stayed near **50%** for A–D; bimodal seed cliff may dominate over rank reassignment within anchor 16. Compare rank buckets and anchor 10 vs 16 at similar ranks.

- Anchor 10 survival **59.3%** (med rank **#5**, share **10.6%**) vs anchor 16 **44.4%** (med rank **#5**, share **7.8%**).
- Pin to rank #3 (D) vs current (A) @ anchor 16: survival **44.4%** vs **44.4%** (0.0% delta).
