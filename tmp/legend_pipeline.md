# Legend pipeline diagnostic

Generated: 2026-06-05T00:31:13.328Z

## Tier definitions

| Tier | Criteria |
| --- | --- |
| Star | trueQ ≥ 75 or market top 10% |
| Elite | trueQ ≥ 85, morning/afternoon drive, station rank ≤ 5 |
| Legend candidate | 10yr tenure, rank ≤ 3, share ≥ 8%, trueQ ≥ 85 |
| Franchise legend | 15yr tenure, 10yr top-3, share ≥ 10%, trueQ ≥ 90, poach/cap history |

## 1. Pipeline survival (% of all hired careers)

| Tier | % | Count |
| --- | ---: | ---: |
| Star | 21.79% | 1620 |
| Elite | 0% | 0 |
| Legend candidate | 0% | 0 |
| Franchise legend | 0% | 0 |
| Career rows | — | 7436 |

## 2. Time to tier (median years from hire)

| Star | 0 |
| Elite | — |
| Legend candidate | — |
| Franchise legend | — |

## 3. Salary progression by tier (end-state Fall)

**ordinary** (n=7436) — median $55,000, P90 $119,000, P99 $178,500, × market median 1, × station median 1
**star** (n=1620) — median $73,500, P90 $144,500, P99 $219,000, × market median 1, × station median 1
**endStateStarNotLegend** (n=1620) — median $73,500, P90 $144,500, P99 $219,000, × market median 1, × station median 1

## 4. Station dependence (legend / franchise subsets)

{
  "legendCandidate": null,
  "franchiseLegend": null
}

## 5. Cap interaction

{
  "legendCandidate": {
    "n": 0
  },
  "franchiseLegend": {
    "n": 0
  }
}

## 6. Poaching interaction

{
  "legendCandidate": {
    "n": 0
  },
  "franchiseLegend": {
    "n": 0
  }
}

## 7. Market tier effects

**small** — franchise 0%, legend 0%, star 23.44%, star median $50,000
**medium** — franchise 0%, legend 0%, star 22.01%, star median $55,000
**large** — franchise 0%, legend 0%, star 22.24%, star median $76,750
**mega** — franchise 0%, legend 0%, star 21.34%, star median $86,000

**Mega vs creation:** Mega markets chiefly lift star pay; franchise creation rates stay similar or only modestly higher.

## trueQ ceiling (talent generation)

| Metric | Value |
| --- | ---: |
| Max observed trueQ (any career) | 81 |
| % careers with max trueQ ≥ 75 | 0.09% |
| % careers with max trueQ ≥ 85 | 0% |
| % careers with max trueQ ≥ 90 | 0% |
| % careers with max display quality ≥ 85 | 0% |

## 8. Bottleneck analysis

**Strict (trueQ ≥ 85, tenure ≥ 10, never legend):** 0 careers


**Star + tenure ≥ 10, never legend:** 89 (1.2% of all)

- **quality_trueQ_below_85**: 89 (100% of star near-miss)

## Franchise promotion blockers (legend candidates who never franchise)


## Key deliverable

### Why does the simulation currently produce only ~0.1–0.2% franchise-tier talent?

**Observed franchise rate:** 0% of career rows.

**Ranked causes (by measured contribution weight):**

1. Talent generation ceiling: trueQ rarely reaches elite/legend thresholds (85/90) — max observed trueQ 81; 0% careers ever ≥85 trueQ (QRG star hire ≤82, Fall cap 94)
2. Among stars with 10yr+ tenure (no legend): #1 limiter = quality_trueQ_below_85 — 89 careers (100% of star near-miss)
3. Upstream: few careers reach legend-candidate gate (station rank + share + tenure) — 0% legend candidates vs 21.79% stars
4. Franchise definition stack (15yr + 10yr top-3 + 10% share + Q≥90 + poach/cap history) — 0% franchise vs 0% legend candidate

**Diagnosis:** Primarily upstream talent-generation (_trueQuality ceiling) — elite/legend/franchise tier gates are unreachable in cold sims before station-rank or salary-cap constraints matter.

