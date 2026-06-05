# Large-Market Survival Sensitivity (anchor 16)

**Setup:** Seattle / San Francisco / Atlanta · 1970 under · aggressive production bot · anchor **16** · **18 runs**/market/lever · seed `20260607`

**Reference:** anchor **10** control (pooled) = **81.5%** survival to 2000

**Artifacts:** `tmp/large_market_survival_sensitivity.json` · `scripts/diag-large-market-survival-sensitivity.mjs`

---

## Pooled survival to 2000

| ID | Lever | Survival | Δ vs A16 baseline | End-state (typical) |
| --- | --- | ---: | ---: | --- |
| — | Anchor 16 control | **0.0%** | — | ~87% bot-gap observer |
| A | +25% starting cash | 0.0% | 0 | Observer |
| B | +50% starting cash | 0.0% | 0 | Observer |
| C | +100% starting cash | 0.0% | 0 | Observer |
| D | Starter +2 share pts | 0.0% | 0 | Observer (better EBITDA, still 0 st) |
| **E** | **Starter +4 share pts** | **22.2%** | **+22.2 pp** | SF 38.9% · ATL 22.2% · SEA 5.6% |
| F | −15% player opex | 0.0% | 0 | Observer |
| G | −25% player opex | 0.0% | 0 | Observer |
| H | Distress grace 2→4 periods | 0.0% | 0 | Observer (later wipe, same end) |
| I | Combo (+50% cash, +2 share, −15% opex) | 0.0% | 0 | Observer |

**Smallest intervention with any lift:** **E (+4 share points)** — no other single lever moves pooled survival off zero.

---

## Pooled median metrics

| ID | Open share | Peak share | Rev/st | EBITDA/st | Distress periods | Acq | Observer end |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| — | 4.55% | 4.55% | $116k | −$73k | 1 | 0 | 47/54 |
| D | 4.19% | 4.19% | $146k | −$52k | 1 | 0 | 52/54 |
| E | **5.44%** | **5.46%** | **$235k** | **−$8k** | 1 | 0 | 42/54 |
| H | 4.58% | 4.58% | $128k | −$62k | 1 | 0 | 39/54 |
| I | 4.25% | 4.26% | $149k | −$49k | 1 | 0 | 54/54 |
| A10 ref | 7.42% | 8.22% | $301k | +$498 | 0 | 0 | 10/54 |

Survivors under **E** keep **1 station** @ 2000 with near-breakeven operating EBITDA; they still rarely acquire (median acq 0).

---

## Which lever has the largest effect?

| Lever class | Verdict |
| --- | --- |
| **Initial share position** | **Dominant.** +4 pts (E) is the only lever that produces meaningful survival; +2 pts (D) improves rev/EBITDA but **0%** survival. |
| **Capital** | **Negligible** for survival (+25% / +50% / +100% cash → still **0%**; observers remain cash-rich). |
| **Operating costs** | **Negligible** at −15% / −25% on player `fin.cost` (still **0%** survival). |
| **Distress timing** | **Negligible** for survival (doubling grace → **0%**; slightly later failure, same terminal shape). |
| **Combo I** | **No synergy** in this harness — **0%** despite stacking B+D+F mechanics (+2 share only, not +4). |

---

## Goal: smallest path toward anchor-10 survival

- Anchor 10 reference: **81.5%** pooled (44/54 survived, median rev/st **$301k**, distress **0**).
- Best anchor 16 lever tested: **E at 22.2%** pooled — **~59 pp below** anchor 10.
- **No tested package reaches “reasonable” anchor-10-like survival** (even SF-only best case E = **38.9%**).

Phase 2 showed ~89% of control failures are bot non-rebuy; sensitivity uses **production bot**, so remaining failures are **share/revenue insufficiency** — capital and opex trims do not substitute for audience position.

---

*Diagnostic only — no design recommendations in this artifact.*
