# Subtype Competition — Implementation Spec

**Status:** v1 implemented (Jun 2026) on `feature/format-foundation` / prototype stack  
**Trigger:** Houston playtest — KSPN Spanish Contemporary 6%+ by 1995, 15%+ by 2000; only one weak CHR rival (KEQU 0.6%); flip not visible in station history

## Problem

Spanish Composition **succeeded** at decomposing umbrella `SPANISH` into pillars. Response Quality **adjacent_first** succeeded at avoiding triple-Spanish clone stacks.

New gap: **within-pillar competition** does not read as competition.

| Player sees | Ecology does |
|-------------|--------------|
| “Nobody challenged Spanish CHR” | Spanish family `hotLeader`; CR fires adjacent Urban/Hot AC/Reg Mex |
| KEQU flipped to Spanish Contemporary | `applyCrFlip` did not call `logHistory` |
| KSPN 15% with one CHR rival | `pickCrSpanishFormat` picks **least-used pillar**, not same subtype |

Family-level metrics lump KSPN (Spanish CHR) + KJAS (Reg Mex) → `nStrong: 2` → ecology thinks Spanish is “contested enough.”

## Design principle

> **Decompose the audience (Spanish Composition). Contest each pillar when its leader gets fat (Subtype Competition). Diversify attacks across lanes when pillars are balanced (Response Quality adjacent_first).**

These layers stack; they do not replace each other.

## v1 implementation

### 1. Station history logging (bug fix)

`applyCrFlip` and CR sign-ons now call `logHistory`:

- Flip: `FORMAT` — `Reformatted: X → Y (competition response)`
- Sign-on: `LAUNCH` — `Signed on — Format (band freq)`

### 2. Pillar clone path (`spanishCompositionPickCrCloneFormat`)

When **any** commercial Spanish pillar has:

- Leader share ≥ **6%** (`pillarCloneLeaderShareGe`)
- Fewer than **2** stations ≥ **2%** in that **same pillar** (`pillarCloneStrongTarget`)

…return that pillar format for clone attacks.

### 3. CR action order (Spanish + `adjacent_first`)

Before adjacent mid-pack / cluster / sign-on:

1. **Pillar clone** — mid-pack flip → cluster flip → sign-on (same subtype)
2. Adjacent attacks (existing)
3. Same-family fallback 35% (existing)

`pickLaunchFormat` for Spanish prefers clone format when eligible, then existing `pickCrSpanishFormat`.

### Config (`__REALISM_SPANISH_COMPOSITION_V1__`)

| Key | Default | Meaning |
|-----|---------|---------|
| `pillarCloneLeaderShareGe` | `0.06` | Arm same-pillar clone when pillar leader ≥ 6% |
| `pillarCloneStrongTarget` | `2` | Want 2 strong stations per pillar |

Frozen from CR baseline: `leaderShareThreshold` 0.08, `booksRequired` 2, `actionMode` adjacent_first.

## What this does NOT do

- Reintroduce umbrella `SPANISH` clone stacks
- Lower share scalars
- Add dial supply (see `LARGE_MARKET_DIAL_DEPTH_SUPPLY_SPEC.md`)
- Extend pillar clone to Country/Rock yet (Spanish first; pattern reusable)

## Success criteria (Houston replay)

- KSPN crosses 6% in 1995–96 → **second Spanish Contemporary** entrant or flip within ~2–4 books (probabilistic)
- Competitor intel **shows** format flip with year/period
- Reg Mex still viable as **different pillar**, not blocked
- No return to triple-umbrella-Spanish pathology

## Future (post-MVB-A)

- Pillar clone for **Country** (Sunbelt playtest: lane 14%, leader 9%, player didn’t see “country war”)
- Intel “likely story” line when CR fires adjacent vs clone
- Harness metric: `pillarStrongDeficit` by subtype

## References

- `src/realismCompetitiveResponse.js` — `tryCrPillarCloneActions`, `logHistory` on CR
- `src/realismSpanishComposition.js` — `pickCrCloneFormat`
- `docs/REALISM_RESPONSE_QUALITY_IMPLEMENTATION_SPEC.md`
