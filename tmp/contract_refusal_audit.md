# Contract Refusal Audit

Generated: 2026-06-04T17:56:22.093Z

## Model note

- There is **no random roll when you click Sign** — refusal only happens if `_wantsExit` was already set by retention logic.
- **3-year refusal** is UI-only (`satisfaction < 52` or exit intent disables 3yr tile; 1–2 yr may still work).
- Diagnostic simulates an **active player** auto-extending when contract ≤ 0.5 yr remaining.

## All markets summary

| Metric | Count |
| --- | ---: |
| Renewal opportunities (≤0.5 yr, player talent-periods) | 22 |
| Simulated extend attempts | 20 |
| Extend blocked (exit intent) | 0 |
| Exit intent newly set | 1 |
| Contract modifier checks (UI open) | 40 |
| refuse3yr blocks | 26 |
| Departure/refusal-like news | 1 |
| Expiry warnings | 0 |

## Nashville 1970–1985

| Metric | Count |
| --- | ---: |
| Renewal opportunities | 15 |
| Extend attempts | 15 |
| Extend refused | 0 |
| Exit intent set | 0 |
| Departure/refusal news | 0 |

## By market

| Market | Runs | Renew opps | Extend tries | Refused | Exit intent | Refuse 3yr | Departures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| wichita | 1 | 22 | 20 | 0 | 1 | 26 | 1 |