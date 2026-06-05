# Successor Legitimacy Study

Generated: 2026-05-31T22:49:47.164Z

> Passive AI always external-hires vacant morning slots. This harness deterministically rewrites a share of successor departures into internal promotions (bench) or cluster transfers so P1–P4 can be measured. J1 uses the same rewritten mix without legitimacy bonuses.

## J1 vs P1–P4 (successor-trigger cohort)

| Variant | Events | Recover Q% | Exceed Q% | Med yrs Q | Mean OQ | 95–99% | Spiral | Int recover% | Ext recover% | Int−Ext med | Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PROD | 3596 | 65.29% | 18.6% | 1.00 | 64.0 | 11.28% | 338 | 85.98% | 54.01% | 3 | 14.58 |

## Recommendation: **PROD** (tune further)

Best variant PROD: 65.29% recover, median 1y, 95–99 11.28%; internal recover 85.98% vs external 54.01%. Does not yet meet all success criteria — tune or combine partial winners.

### PROD — recovery by replacement type (integrity-clean headline)

Headline (clean): 53.59% recover, median 2.5y; excluded 1498 integrity-flagged / 0 impossible immediate.

| Type | Count | Recover% | Med yrs | Same-turn | Delayed |
| --- | --- | --- | --- | --- | --- |
| external | 1877 | 50.29% | 3 | 49.13% | 54.05% |
| internal | 145 | 95.86% | 0 | 95.86% | 0% |
| cluster | 12 | 58.33% | 2 | 54.55% | 100% |

### PROD — legacy end-of-turn metrics

| Type | Deps | Recover Q% | Exceed Q% | Med yrs Q |
| --- | --- | --- | --- | --- |
| external | 2170 | 54.01% | 21.75% | 2.5 |
| internal | 1348 | 85.98% | 14.32% | 0.5 |
| cluster | 14 | 57.14% | 0% | 2 |

## Production implementation

## Production design: successor ceiling + legitimacy

### Trigger (all variants)
Apply `morningSuccessorCeiling` when morning talent departs and:
- departing slot Q ≥ 90, OR
- departing slot Q ≥ 85 AND tenure ≥ 12 periods, OR
- departing host `superstar === true`.

### Replacement classification (at hire/promotion time)
- **Internal**: new morning talent ID was on another daypart at same station pre-turn.
- **Cluster**: new talent ID was on another station with same `corpOwner`.
- **External**: neither.

### J1 base ceiling (all variants)
- External fixed cap **88** for **6** periods, then **+1**/period.
- Clear when replacement tenure ≥ 8 and ceiling ≥ prior slot Q.
- Clamp in `decay()` after prog investment; `refreshStationOQ` after clamp.

### P4: Bench-strength scaled
- Trust transfer: internal up to 25%, cluster up to 12% scaled by bench score.
- Initial cap: internal up to 92, cluster up to 90, from tenure/slot Q/talent Q/identity.

### Station state
```js
station.morningSuccessorCeiling = {
  ceiling, fixedCap, fixedPeriods: 6, risePerPeriod: 1,
  priorSlotQ, priorShare, periodsActive, replacementType
};
```

### Integration points
1. Morning departure handlers (AI contract, poach, player move).
2. `decay()` — step ceiling, clamp morning slot Q.
3. Optional UI: show successor legitimacy tier on talent move.