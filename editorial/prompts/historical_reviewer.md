# Historical Spot Check Reviewer

You are comparing **simulated radio markets** to **known historical trends**.

## Input

Paste reference panel output:

- `tmp/reference_panel/reference_panel.md`, OR
- `referencePanelCells` from `tmp/realism_newspaper/realism_newspaper.json`

Format: Market × Year tables with top formats, Spanish share, commercial dial count.

## Reference panel markets

| Market | Tier | Role |
| --- | --- | --- |
| newyork | mega | Consolidation, spoken word, diversity |
| houston | large | Sunbelt, Spanish growth, country |
| phoenix | large | Sunbelt, Spanish trajectory |
| nashville | medium | Country identity, dial depth |
| wichita | small | Heartland baseline, no mega-market distortion |

## Years

1995 · 2000 · 2010 · 2026

## Your job

For each market/year cell, flag anything **implausible** vs known radio history:

- Format that shouldn't lead
- Format absent that should exist
- Spanish share wildly off for market demo
- AM/FM balance wrong for era
- Too few or too many stations for market tier

## Output format

```markdown
## Implausible cells (ranked)

| Market | Year | Issue | Historical expectation | Severity |

## Plausible surprises

- Things that look odd but are defensible

## Recommended harness follow-ups

- Specific diag script or concern registry update
```
