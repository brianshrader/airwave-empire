# Houston playability harness

Runs per cell: **30** · seed base **20260605** · bot **aggressive** · AI **HARD** · end **2026 P2**

## Summary table

| Market | Start | Survival | Win rate | Med 1st profit | Med 1st #1 | Med 1st acq | Avg final rank | Avg cluster share | Top winning formats |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| houston | 1970 | 86.7% | 0.0% | 1970 | — | 1974 | 12.5 | 0.029 | — |
| dallas | 1970 | 83.3% | 3.3% | 1970 | 1983 | 1974 | 11.9 | 0.038 | COUNTRY 100% |
| atlanta | 1970 | 70.0% | 0.0% | 1970 | — | 1976 | 11.8 | 0.032 | — |
| phoenix | 1970 | 76.7% | 40.0% | 1970 | 1979 | 1974 | 8.2 | 0.089 | COUNTRY 25%, ALBUM_ROCK 17%, ADULT_CONTEMP 8%, CLASSIC_ROCK 8%, SPANISH 8%, SOUL_RNB 8%, UNKNOWN 8%, URBAN_CONTEMP 8%, HOT_AC 8% |
| houston | 1985 | 13.3% | 0.0% | — | — | 1986 | 13.5 | 0.024 | — |
| dallas | 1985 | 16.7% | 0.0% | 1987 | — | 1987 | 15.0 | 0.020 | — |
| atlanta | 1985 | 96.7% | 3.3% | 1989 | 2026 | 1987 | 9.4 | 0.048 | HOT_AC 100% |
| phoenix | 1985 | 63.3% | 0.0% | 1988 | — | 1985 | 12.2 | 0.035 | — |
| houston | 2000 | 3.3% | 0.0% | — | — | 2000 | 19.0 | 0.015 | — |
| dallas | 2000 | 10.0% | 0.0% | 2000 | — | 2000 | 15.0 | 0.028 | — |
| atlanta | 2000 | 83.3% | 0.0% | 2000 | — | 2000 | 11.0 | 0.035 | — |
| phoenix | 2000 | 3.3% | 0.0% | 2000 | — | 2000 | 12.0 | 0.032 | — |

## Houston vs Dallas — five questions

### 1970 start
1. **Harder than Dallas?** No
2. **Easier than Dallas?** No
3. **Multiple viable paths?** Limited
4. **One format dominating?** No
5. **Spanish mandatory?** No

### 1985 start
1. **Harder than Dallas?** No (comparable — both low survival)
2. **Easier than Dallas?** No
3. **Multiple viable paths?** Limited
4. **One format dominating?** No
5. **Spanish mandatory?** No

### 2000 start
1. **Harder than Dallas?** Yes (material gap)
2. **Easier than Dallas?** No
3. **Multiple viable paths?** Limited
4. **One format dominating?** No
5. **Spanish mandatory?** No

## Recommendation

**PLAYABLE_CANDIDATE**
- 1970 anchor: Houston survival 86.7% vs Dallas 83.3%; avg final rank 12.5 vs 11.9; cluster share 0.029 vs 0.038.
- 1970 start vs Dallas: comparable bot survivability and end-state (neither market is a cakewalk).
- 1970 vs Phoenix: Houston cluster share 0.029 vs 0.089; win rate 0.0% vs 40.0% (Phoenix scaffold is bot-friendlier, not a Houston block).
- Late starts (1985/2000) punish Texas large-tier bot runs vs Atlanta — shared scaffold issue, not Houston-only.
- Spanish is not a mandatory bot strategy in this harness.
- Bot win samples are thin — format diversity inconclusive; human paths may differ.
- Recommendation: stop auditing ecology; promote Houston to playable and learn from real playthroughs.

Win definition: survived bankruptcy with stations at end AND (ever #1 OR final best rank ≤3 OR cluster share ≥10%).