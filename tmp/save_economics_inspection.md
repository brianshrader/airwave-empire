# Save Economics Inspection

Inspector: `scripts/inspect-save-economics.mjs` · `npm run inspect:save-economics`

**Save:** 1981 Spring — KBAY, KSFM · saved 2026-06-04T16:40:31.981Z · game sanfrancisco 1981 Spring

## Saved vs inspector pipeline (important)

| | Saved (matches live UI) | After inspector pipeline | Δ |
| --- | ---: | ---: | ---: |
| EBITDA | $1.66M | $1.80M | $143K |
| Revenue | $3.39M | $3.65M | $258K |

Inspector now matches load path (migrateSave→recalc→seedRev, no calcRev). Use --trace-pnl to see calcRev-only drift.

Use `--raw-only` or `--trace-pnl` to inspect without assuming pipeline numbers match the game UI.

## Station snapshot (after migrateSave → recalc → seedRev, same as game load)

| Field | Value |
| --- | --- |
| Calls / brand | KSFM / FM 93 |
| Format / signal | ADULT_CONTEMP FM 50kw |
| Owner | player · isPlayer=true |
| Rank / share / AQH | #4 · 7.1% · 6124 |
| Revenue / period | $3.65M |
| Expenses / period | $1.85M |
| EBITDA / margin | $1.80M · 49.3% |
| Terrestrial / stream / digital | $3.61M / $0 / $0 |
| Fixed / talent | $362K (9.9% rev) / $76K (2.1% rev) |
| Sellout / OQ / identity | 77.7% / 61 / 20 |
| Ops promo/prog (eff) | $11K / $14K → eff $23K / $27K |
| Player baseline floor | promo $24K · prog $28K |

### Dayparts
- Morning 73 · Mid 56 · PM 62 · Eve 44
- Staffed 4 · vacant 1 · automated 0

| Slot | Talent | Salary | Q |
| --- | --- | ---: | ---: |
| morningDrive | George Zamora | $47K | 50 |
| midday | Dominique Ryan | $26K | 47 |
| afternoonDrive | Carol Yancey | $46K | 56 |
| evening | Jacqueline Cox | $34K | 50 |

## Revenue decomposition
- Market annual billing: $58.99M · half-period pool: $27.95M
- Station share of pool: 13.06% · monetization eff: 0.9266
- AQH 6124 · sellout 77.7% · share 7.1%
- Player baseline promo+prog floor (cost): $51K

## Cost breakdown (period)

| Line | $ |
| --- | ---: |
| Fixed (staff/fac/reg/SF/cluster) | $362K |
| Talent payroll | $76K |
| Sales & admin | $1.26M |
| Ops floor | $98K |
| Promo (effective) | $23K |
| Programming (effective) | $27K |

## Counterfactuals
1. **isPlayer=false** — rev $610K (Δ $-3.15M) · margin -28.5%
2. **No player baseline promo/prog** — EBITDA $-177K (saved spend $0)
3. **Cut afternoonDrive** — EBITDA Δ $-1.92M · rev Δ $-3.09M · rational=no
4. **Payroll ×2** — expenses $2.02M · EBITDA $1.82M
5. **Fixed +25%** — EBITDA $-268K · margin -44.5%

## Q&A
**Why is revenue ~$3650664/period?**
~13.06% of market half-period billing pool; share 7.1%; sellout 78%; player competitive baseline spend floor ~$51142/period (cost)

**Is ~49% EBITDA margin plausible?**
Yes — within plausible range for a high-share FM leader if fixed/talent load is not over-scaled.

**Would talent cuts materially improve EBITDA?**
Cut afternoonDrive hurts EBITDA by $1917054 — rev loss exceeds payroll save.

**Profitable under higher overhead?**
Not profitable at +25% fixed costs bump.

**Vs AI #1 in save (KMLW)**
Player rev $3650664 vs AI $5614614; share 7.1% vs 13.8%.

**Balance read:** matches_live_sf1980_pattern

Drivers: ~13.06% of market half-period billing pool · share 7.1% · sellout 78% · player competitive baseline spend floor ~$51142/period (cost)

## All player stations in save
| Calls | Format | Rev | Margin |
| --- | --- | ---: | ---: |
| KBAY | NEWS_TALK AM | $3.65M | 32.4% |
| KSFM | ADULT_CONTEMP FM | $3.65M | 49.3% |

## Export save from browser
See `public/export-save-for-inspector.html` or in-game **Save/Load → Download save file**.

```bash
npm run inspect:save-economics -- --file=/path/to/airwave-empire-*.json --station=KXXX
```