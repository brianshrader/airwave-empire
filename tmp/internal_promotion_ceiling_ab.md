# Internal Promotion Ceiling A/B/C/D

Generated: 2026-06-01T00:27:10.418Z

**Recommendation:** implement_internal_specific — variant **C**

Variant C best balances targets (score 75). Prefer implementing as internal-only ceiling/trust parameters rather than blind wrapper routing.

## Variant definitions

- **A**: Current production — internalPromotionDirect, no wrapper ceiling/trust
- **B**: Original design — 25% trust transfer + J1 cap 88 / 6 periods / +1 rise via wrapper
- **C**: Internal-friendly — 25% trust + cap 89 (internal only) / 6 / +1 via wrapper
- **D**: Legacy handoff — 35% trust + cap 88 / 6 / +1 via wrapper

## Comparison table

| Var | Int recover% | Ext recover% | Int−Ext med (y) | Same-turn 90+ med | Int 94+ med | 95–99% | Mean OQ | Spirals | Impossible imm | Int events |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 97.95% | 49.81% | -3 | 0.5 | 0 | 10.99% | 64.05 | 336 | 0 | 1351 |
| B | 41.84% | 53.72% | -0.5 | 3.5 | 1.5 | 11.3% | 64 | 324 | 0 | 1151 |
| C | 45.86% | 52.46% | -0.5 | 3.5 | 2 | 10.65% | 64.02 | 332 | 0 | 1145 |
| D | 44.81% | 52.55% | -0.5 | 3.5 | 1.5 | 11.14% | 63.92 | 319 | 0 | 1139 |