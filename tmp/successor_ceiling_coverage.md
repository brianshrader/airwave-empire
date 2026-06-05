# Successor Ceiling Coverage Audit

Generated: 2026-05-31T22:49:07.424Z

Total successor fills: **3528**
Has ceiling after fill (snap): **57.79%**
Enforcement on fill turn: **58.36%**
onSlotFill wrapper called: **61.73%**
noteClear called: **65.28%**
Slot Q > ceiling at fill: **0%**
Impossible immediate (capped): **0**
Missing mc at snap (telemetry): **1489**
True missing enforcement: **0**

## By enforcement class

| Class | Count |
| --- | --- |
| ceiling_active_at_fill | 2039 |
| internal_promotion_direct | 1201 |
| no_ceiling_required_sub90 | 268 |
| ceiling_cleared_same_turn | 11 |
| ceiling_applied_cleared_same_turn | 9 |

## By fill path

| Path | Count | No mc@snap | No wrapper | Q > ceiling | True missing |
| --- | --- | --- | --- | --- | --- |
| ai_empty_slot_external | 1319 | 497 | 404 | 0 | 0 |
| ai_poach_instant | 710 | 253 | 222 | 0 | 0 |
| internal_promotion_direct | 540 | 474 | 532 | 0 | 0 |
| ai_contract_external | 410 | 147 | 139 | 0 | 0 |
| ai_internal_promotion | 325 | 53 | 0 | 0 | 0 |
| ai_defensive_replace | 224 | 65 | 53 | 0 | 0 |