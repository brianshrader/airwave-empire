# G.cash mutation inventory (Airwave Empire / `legacy.js`)

Audit-only reference: where player cash can change. Regenerate line hints with ripgrep when refactoring.

## advTurn rollover (solo) — audited by `__WL_CASH_BRIDGE_AUDIT__`

| Step | Mechanism |
|------|-----------|
| Start of period advance | `wlCashBridgeAuditPush('BEFORE_ADVANCE')` — baseline cash |
| After revenue / AI / consolidation, before LMA | `AFTER_REV_AND_AI_BEFORE_LMA` — detects early-pipeline drift |
| `processLMAFees` | Lessee fee out, lessor fee in (`G.cash` ± fees) |
| After LMA | `AFTER_LMA` |
| EBITDA credit | Solo: `G.cash += profit` after MP wallet sync (MP uses `_playerCash`) |
| `applyLoanInterest` | Solo: `G.cash -= interest` via `G._lastLoanInterestCharge` |
| `checkPressure` | Distress sale proceeds, solo bankruptcy clamp (`G._lastPressureCashDelta`) |
| Period clock | Does not change cash |

## Direct `G.cash` assignment / arithmetic (grep anchors)

Search: `G.cash`, `wlAdjustMyCash`, `_playerCash` sync.

**Multiplayer wallet sync:** many branches set `G.cash = G._playerCash[pid]` after mutating `_playerCash`.

**Loan / LOC:** `doBorrow`, `doRepay`, `applyLoanInterest` — principal draw, full repay, interest.

**LMA:** `doLMALessee`, `processLMAFees`, `doLMALessor` (no immediate cash on lessor sign — fees accrue in `processLMAFees`).

**Pressure / bankruptcy:** `checkPressure`, `soloExecuteBankruptcy`, `mpExecuteBankruptcy`, `mpExecuteForcedDistressSale`, distress sale pricing.

**Player actions (UI):** research, FCC fees, talent buyouts/fire/hire, streaming launch, upgrades, acquisitions, station sales, loan payments, etc.

**Helpers:** `wlAdjustMyCash` (central delta for solo/MP), franchise/sports event handlers that use `tCash` closures touching `G.cash` (lines ~711+).

## Files

Primary: `src/legacy.js` (all gameplay). Diagnostics: `src/marketSimHarness.js` (`runCashBridgeAudit`, LMA inject probes — read-only mutations for testing).
