# Sports rights era-scaling A/B

Generated: 2026-06-05T05:12:12.185Z

## Recommendation

**F** — Piecewise (pre-1980^0.55, 80s^0.65, 90s+^0.8)

- Variant F scored 11 vs A at 11. Tied at score 11 with F/D/C/A; F preferred for era-tier piecewise curve.
- Chicago 1970 NFL flagship: A=$142,000 → F=$167,000 (UI est. value $332,000, sim lift $399,778).
- Static baseFee in team data acts as a 2020 anchor; production should scale at bid/init/auction time, not rewrite per-team baseFee tables.
- Full billing index (B) over-corrects early era ($66K Chicago NFL 1970); baseline A remains ~6.7× era-scaled.

## Variant scores

| Var | Score | Chicago 1970 NFL | Med fee/value |
|-----|-------|------------------|---------------|
| A | 11 | $142,000 | 0.43× |
| C | 11 | $186,000 | 0.56× |
| D | 11 | $136,000 | 0.41× |
| F | 11 | $167,000 | 0.50× |
| B | 8 | $66,000 | 0.20× |
| E | 8 | $111,000 | 0.33× |

## UI copy

Keep est. revenue lift formula; it tracks realized lift on SPORTS_TALK (~100% capture). Update holder-fee display to use era-scaled fee so fee/value ratios match player experience. Clarify that estimated annual value is not break-even after scaling.

## Production hooks

- **initSportsRights (~6940)**: Replace team.baseFee*(0.7+rand*0.6) with eraScaledSportsFee(team,G)*jitter
- **resolveRightsAuction AI bids (~7088)**: Use eraScaledSportsFee(team,G) instead of team.baseFee for aiBid baseline
- **openSports sugBid / slider bounds (~33006)**: Scale _sMin/_sMax/sugBid off eraScaledSportsFee; show scaled fee in Current holder row
- **new helper near marketAnnualBilling (~6531)**: Add eraScaledSportsFee(team,year,marketId,curve) centralizing variant curve

No production patch applied by this harness.