# Successor Recovery Timing Audit

Generated: 2026-05-31T21:10:26.244Z

**Verdict:** mixed

Same-turn apples-to-apples: external recovers faster despite similar starting slot Q — likely cohort mix within 90–98 band, not vacancy artifact. Delayed fills (1244): vacancy degrades slot Q before fill; if metrics used fill-time slot Q as target, external would look 9pp faster (65.96% vs 56.9%).

## Replacement-type × timing

| Timing | Count | Filled | Recover (orig) | Med yrs (orig) | Immediate (orig) | Avg prior Q | Avg repl Q |
| --- | --- | --- | --- | --- | --- | --- | --- |
| same_turn_fill | 2087 | 2087 | 69.29% | 0 | 41.78% | 94.9 | 87.8 |
| delayed_fill | 1556 | 1556 | 42.74% | 3 | 8.48% | 95.0 | 81.6 |
| vacancy_still_open | 67 | 0 | 0% | — | 0% | 94.2 | — |

## Same-turn apples-to-apples (prior Q 90–98)

| Type | Count | Recover (orig) | Med yrs (orig) | Avg repl Q | Avg ceiling | Immediate |
| --- | --- | --- | --- | --- | --- | --- |
| internal | 702 | 33.62% | 3.5 | 87.3 | 88.0 | 2.71% |
| external | 1321 | 73.35% | 0 | 87.0 | 89.3 | 48.75% |

## Harness vs original target

{
  "eventsWhereHarnessEasier": 766,
  "eventsWhereHarnessTargetUsed": 1244,
  "pctRecoverOriginal": 56.9,
  "pctRecoverHarness": 65.96,
  "medianYearsOriginal": 1,
  "medianYearsHarness": 1,
  "externalMedianHarness0": 0.5,
  "externalPctImmediateHarness": 40.41,
  "externalImmediateDueToLoweredTarget": 110
}

## Recommendations

- **Metrics:** Track recovery against originalPriorSlotQ at successor departure (stored in morningSuccessorCeiling.priorSlotQ), never against post-vacancy degraded slot Q. Split reporting by fillTiming: same_turn vs delayed.
- **Gameplay:** No gameplay change needed until metrics use original priorSlotQ and separate fill timing buckets.