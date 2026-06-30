# Editorial realism workflow

Automated realism QA stack for Airwave Empire: baseline pinning, delta newspaper, concern registry, and AI review roles.

## Architecture

```
Harness layer     → diag:reference-panel, diag:market-suite, existing diags
Delta layer       → baseline/realism/ vs current run
Editorial layer   → realism newspaper + AI prompts
Memory layer      → editorial/concern_registry.json
```

## Quick start

### 1. Pin a baseline (first time or after major change)

```bash
npm run diag:realism-baseline -- --label=initial
```

With fresh market suite:

```bash
npm run diag:realism-baseline -- --label=post-supply-phase1 --include-market-suite --runs=10
```

Commit `baseline/realism/` when the pin is intentional.

### 2. Generate the delta newspaper

```bash
npm run diag:realism-newspaper
```

**All-in-one** (reference panel + newspaper + review bundle):

```bash
npm run diag:realism-report
```

**Pre-deploy gate:**

```bash
npm run diag:realism-gate
```

Full run (refreshes market suite — slow):

```bash
npm run diag:realism-newspaper -- --full --runs=10
```

**Artifacts:**

- `tmp/realism_newspaper/realism_newspaper.md` — human-readable report
- `tmp/realism_newspaper/realism_newspaper.json` — machine-readable for AI review
- `tmp/realism_newspaper/review_bundle.md` — pointers for AI sessions
- `tmp/realism_newspaper/audit_*.md` — saved Chief Economist / historical audits

### 3. Run AI review roles

Paste the JSON (or markdown) into ChatGPT/Cursor and use prompts from `editorial/prompts/`:

| Role | Prompt file | When |
| --- | --- | --- |
| Chief Economist | `chief_economist.md` | After every major realism change |
| Historical reviewer | `historical_reviewer.md` | After reference panel runs |
| Fun Detector | `fun_detector.md` | Before/after gameplay-affecting changes |
| Executive Producer | `executive_producer.md` | When scoping work; rabbit-hole prevention |
| Player Experience | `player_experience.md` | After UI/feature ships |

## Reference panel

Five markets × four years (1995, 2000, 2010, 2026):

- **newyork** — mega
- **houston** — large
- **phoenix** — large
- **nashville** — medium
- **wichita** — small

Default seed: `20260628` (reproducible diffs).

```bash
npm run diag:reference-panel
npm run diag:reference-panel -- --seed=42 --markets=houston,phoenix
```

## Concern registry

`editorial/concern_registry.json` tracks chronic realism and gameplay debts.

Each concern can list `metricKeys` that the newspaper watches for deltas, e.g.:

```json
"metricKeys": ["phoenix:2026:spanishLaneShare", "phoenix:2026:nCommDial"]
```

Update status manually:

- `chronic` — known long-term debt
- `watch` — active monitoring
- `resolved` — fixed; newspaper still lists in "recently resolved"
- `new` — suggested by newspaper, not yet confirmed

## Pre-deploy gate (lightweight)

Before shipping a build:

1. `npm run diag:realism-newspaper` — any new significant movers?
2. Did any **playable** market flip PASS → WARN/FAIL in market suite?
3. Any new suggested concerns worth adding to registry?

If all three are clean, ship. If not, read the newspaper (5 minutes).

## Metric keys

Flat keys for diffing: `{market}:{year}:{metric}`

| Metric | Meaning |
| --- | --- |
| `nCommDial` | Commercial stations on dial |
| `nBook` | Stations in ratings book |
| `spanishLaneShare` | Aggregate Spanish book share (percentage points) |
| `topShare` | #1 station share |
| `top5Share` | Sum of top 5 shares |
| `hhi` | Herfindahl index (×10000) |
| `midTierCompetitors` | Stations with 0.5–3.5% share (acquisition proxy) |
| `amCommercial` / `fmCommercial` | Band split |

Delta thresholds: `scripts/editorial/config.mjs` → `DELTA_THRESHOLDS`.

## Related harnesses

The newspaper composes existing diagnostics; it does not replace them:

- `npm run diag:market-suite` — playable QA dashboard
- `npm run diag:market-certification` — Monte Carlo per-market cert
- `npm run diag:bundle-a-ecology-audit` — extended ecology (separate from reference panel)
- Individual market truth audits — deep dives when newspaper flags an issue

## Workflow after a realism change

1. Make code changes
2. `npm run diag:realism-newspaper`
3. Chief Economist prompt on JSON output
4. Fun Detector if gameplay metrics moved
5. Update concern registry (resolve / add / escalate)
6. Pin new baseline when satisfied: `npm run diag:realism-baseline -- --label=…`
