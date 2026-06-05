# Legend pipeline A/B (diagnostic only)

Generated: 2026-06-05T04:05:23.569Z

## Variants

- **A**: Baseline — current production behavior
- **B**: Rare high-ceiling generation — trueQ 85–92 at hire, market-tier scaled
- **C**: Career breakout path — gradual trueQ lift after tenure + station success
- **D**: B mild + C mild combined
- **E**: B strong + C strong combined

## A–E comparison (pooled across markets × start years × seeds)

| Variant | Med trueQ | P90 TQ | Max TQ | %≥85 | %≥90 | %Star | %Elite | %Legend | %Franchise | %≥5× sal | %cap pin | mean OQ | %95–99 OQ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 45 | 60 | 63 | 0% | 0% | 22.53% | 0% | 0% | 0% | 0.21% | 23.17% | 61.33 | 20.87% |
| B | 45 | 60 | 86 | 1.08% | 0.19% | 21.75% | 0.22% | 0% | 0% | 0.2% | 23.01% | 61.53 | 21.64% |
| C | 45 | 60 | 65 | 0% | 0% | 22.69% | 0% | 0% | 0% | 0.2% | 22.84% | 61.38 | 20.91% |
| D | 46 | 60 | 90 | 1.03% | 0.17% | 22.1% | 0.23% | 0% | 0% | 0.2% | 23.74% | 62.08 | 20.99% |
| E | 45 | 61 | 90 | 1.79% | 0.31% | 21.26% | 0.47% | 0% | 0% | 0.2% | 22.51% | 61.46 | 19.5% |

## Targets

- trueQ ≥85: **1–3%** of careers
- trueQ ≥90: **0.2–0.8%**
- Franchise legends: **0.3–1%**
- Salary ≥5× median: **1–3%**

## Mechanism comparison

Best balanced variant by guardrail score: **E** (score 80).
High-ceiling **generation (B)** produces more trueQ≥85 careers than breakout-only (C).
Salary caps appear to bind a large share of high-trueQ careers — compensation may become the next bottleneck after generation is fixed.
Station OQ guardrails held — no broad quality inflation detected in the winning variant.
**Direction (diagnostic only):** pursue upstream trueQ tail creation before salary tuning; prefer the scored variant mechanism mix for a production design spike.

## Salary & cap detail

**A** — med $64,375, P99 $193,500, max $743,500, ≥10× 0.01%, high-Q at cap 0%
**B** — med $62,500, P99 $188,500, max $876,500, ≥10× 0.01%, high-Q at cap 28.7%
**C** — med $62,125, P99 $191,500, max $759,500, ≥10× 0%, high-Q at cap 0%
**D** — med $65,250, P99 $197,250, max $980,500, ≥10× 0.01%, high-Q at cap 33.74%
**E** — med $61,250, P99 $188,000, max $797,500, ≥10× 0.02%, high-Q at cap 25.34%

## Station impact

**A** — share lift w/ high-Q —pp, replacement drop —pp, poach on high-Q 0%
**B** — share lift w/ high-Q 0.15pp, replacement drop 0.74pp, poach on high-Q 0%
**C** — share lift w/ high-Q —pp, replacement drop —pp, poach on high-Q 0%
**D** — share lift w/ high-Q 0.09pp, replacement drop 0.69pp, poach on high-Q 0.24%
**E** — share lift w/ high-Q 0.25pp, replacement drop 0.66pp, poach on high-Q 0%

## Economy guardrails

**A** — HHI 579, zombies 6.15, spirals 8.24, bankrupt runs 0
**B** — HHI 580, zombies 5.56, spirals 8.29, bankrupt runs 0
**C** — HHI 607, zombies 6.1, spirals 8.71, bankrupt runs 0
**D** — HHI 579, zombies 5.64, spirals 7.85, bankrupt runs 0
**E** — HHI 594, zombies 6.01, spirals 8.42, bankrupt runs 0

