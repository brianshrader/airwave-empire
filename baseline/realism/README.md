# Realism baseline

Pinned simulation snapshots used by the **Automated Realism Newspaper** (`npm run diag:realism-newspaper`).

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Label, git SHA, seed, pin date |
| `metrics.json` | Flat metric set for delta diffs |
| `reference_panel.json` | Full reference panel snapshot |
| `market_suite_summary.json` | Playable-market QA verdicts (optional) |

## Pin a baseline

After a build you want to diff against:

```bash
npm run diag:realism-baseline -- --label=post-supply-phase1
```

Include a fresh market suite run:

```bash
npm run diag:realism-baseline -- --label=post-supply-phase1 --include-market-suite --runs=10
```

Commit `baseline/realism/` when the pin represents an intentional checkpoint.

## Generate delta report

```bash
npm run diag:realism-newspaper
```

Refresh market suite as part of the report:

```bash
npm run diag:realism-newspaper -- --full --runs=10
```
