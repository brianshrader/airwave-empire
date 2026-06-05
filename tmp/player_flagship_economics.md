# Player Flagship Economics Audit

Diagnostic: `scripts/diag-player-flagship-economics.mjs` · `npm run diag:player-flagship-economics`

Markets: sanfrancisco, seattle, atlanta, nashville, wichita
Start years: 1970, 1985 · 4 seeds/cell · snapshots: 1980, 1990, 2000, 2010, 2020

Run types: **passive_ai** (no player, all AI) · **player_flagship** (underdog + aggressive benchmark bot) · **dep_flag** (clone flagship, strip `isPlayer`, recalc at snapshot)

## Verdict: **E) Further targeted audit needed (live flagship not reproduced; validate with human-play snapshot export)**

- SF 1980 FM AC player flagship NOT reproduced: 0 hits with rev≥$1.5M and margin≥40% in 40 benchmark-bot player runs
- Benchmark bot often leaves underdog on weak AM while AI FM leads; live manual FM/AC flagship build is not captured by this harness
- Stripping isPlayer changes economics (median rev Δ $-8K, margin Δ -54.6%) — indirect via promo baseline / identity / digital
- Prior `diag:station-economics` cleared all `isPlayer` flags and averaged the full commercial book (median SF 1980 margin ~−105%). This harness keeps the underdog player station, runs the benchmark bot (hires, promo/prog, optional FM acquisition), and compares player flagship vs AI #1 at the same calendar snapshot.

## San Francisco 1980 reproduction (player flagship, FM AC)
- Reproduced (rev≥$1.5M, margin≥40%): **NO** (0 hits / 40 player sims)

## Player flagship vs AI #1 (same market/year snapshot)
| Metric | Player flagship | AI #1 | Median Δ |
| --- | ---: | ---: | ---: |
| Revenue | $57K | $336K | $-281K |
| Expenses | $411K | $594K | $-111K |
| EBITDA margin | -557.7% | -81.5% | -463.2% |
| Share | — | — | -6.7% |
| N pairs | 10 | | |

## Player flagship (max revenue player station) by era
| Era | N | Med rev | Med margin | >30% | >40% | Talent % | Fixed % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1980s | 10 | $57K | -557.7% | 0.0% | 0.0% | 70.2% | 301.7% |

## isPlayer strip test (dep_flag at snapshot)
- Snapshots tested: **10**
- Median rev Δ: **$-8K** · expenses Δ: **$-4K** · margin Δ: **-54.6%**
- Identical rev after strip: **0.0%** · identical margin: **0.0%**

## Prior station-economics audit discrepancy
Prior `diag:station-economics` cleared all `isPlayer` flags and averaged the full commercial book (median SF 1980 margin ~−105%). This harness keeps the underdog player station, runs the benchmark bot (hires, promo/prog, optional FM acquisition), and compares player flagship vs AI #1 at the same calendar snapshot.

## Talent-cut what-if (player flagships)
- Cases: **10** · median EBITDA Δ **$43K** · median rev Δ **$-12K**
- Boosts profitable flagships: **0.0%** · rev loss > save: **80.0%**

## Rerun
```bash
npm run diag:player-flagship-economics
node scripts/diag-player-flagship-economics.mjs --runs=8 --seed=20260616
```