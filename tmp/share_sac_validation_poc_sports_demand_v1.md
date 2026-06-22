# SAC validation — Phase 1 vs Phase 1+SAC

Generated: 2026-06-21T23:48:43.809Z · 12 paired runs/market

**Clean experiment:** Success Attracts Competition v1 only (lane family). No umbrella / all-news / public v2.

**Tier thresholds (Duncan-calibrated):** mega >8% remarkable · >9% wrong · large >10% · >12%

## Global

| Metric | Phase 1 | Phase 1 + SAC |
| --- | ---: | ---: |
| % books > wrong tier | 54.0% | 51.8% |
| % books > remarkable | 79.3% | 79.6% |
| Mean leader capture @ wrong books | 44.8% | 38.4% |
| Mean ≥2% competitors @ wrong books | 6.13 | 6.67 |
| Max share observed | 33.4% | 22.7% |

## Laugh-test grid (max share at spot book, paired seeds)

| Market | Year | Tier wrong | P1 max | +SAC max |
| --- | ---: | ---: | ---: | ---: |
| newyork | 2010 | >9.0% | 25.5% | 14.1% |
| houston | 2000 | >12.0% | 14.0% | 15.6% |
| dallas | 2000 | >12.0% | 14.0% | 14.4% |
| phoenix | 2026 | >12.0% | 17.4% | 12.9% |

## By market

### newyork (mega)

- Wrong-tier books: **86.7%** → **84.0%**
- Leader capture @ wrong: 62.2% → 57.0% · ≥2% count: 3.07 → 3.44

### houston (large)

- Wrong-tier books: **44.9%** → **48.7%**
- Leader capture @ wrong: 48.3% → 39.0% · ≥2% count: 5.36 → 6.11

### dallas (large)

- Wrong-tier books: **55.2%** → **46.5%**
- Leader capture @ wrong: 45.1% → 32.5% · ≥2% count: 5.63 → 7.52

### phoenix (large)

- Wrong-tier books: **29.2%** → **28.0%**
- Leader capture @ wrong: 23.6% → 23.7% · ≥2% count: 10.45 → 9.90

## Verdict

SAC v1 improves tier-wrong exceedance and/or leader capture — validate with manual playtest before SAC v2.