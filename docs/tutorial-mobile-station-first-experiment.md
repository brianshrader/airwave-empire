# Tutorial mobile station-first layout experiment

On phones, the play shell stacks the market column (`#pl`) before your stations (`#pc`). Desktop keeps the side-by-side layout. This experiment reorders **tutorial + mobile only** so the station card and action pills appear first.

## Hypothesis

New mobile players explore market rankings before finding their station. Station-first layout should lift `tutorial_intro_dismissed → tutorial_first_advance_clicked` (and ideally `tutorial_research_opened`).

## Rollback (disable experiment)

In `src/legacy.js`:

```javascript
const WL_TUTORIAL_MOBILE_STATION_FIRST_EXPERIMENT_ACTIVE = false;
```

Rebuild / reload. All players get the legacy mobile order.

## Force a variant (QA / replays)

**URL** (guest autostart example):

```
/play-guest.html?scenario=tutorial_turnaround&autostart=1&tutorialMobileLayout=station_first
/play-guest.html?scenario=tutorial_turnaround&autostart=1&tutorialMobileLayout=control
```

**Console** (persists in localStorage):

```javascript
localStorage.setItem('wlTutorialMobileStationFirst', 'station_first'); // or 'control'
location.reload();
```

Clear assignment:

```javascript
localStorage.removeItem('wlTutorialMobileStationFirst');
location.reload();
```

## What changes when ON

| Viewport | Scenario | Variant | Layout |
|----------|----------|---------|--------|
| Desktop (any width) | Any | Any | Unchanged — market left, stations right |
| Mobile ≤768px | Any | Any | `#pc` (YOUR STATIONS) above `#pl` (market ratings) |
| Mobile ≤768px | `tutorial_turnaround` + tutorial mode | `station_first` / `control` | Same layout; experiment measures **coach** behavior only |

Assignment is **50/50** per browser when the experiment is active (sticky via `localStorage`).

Body class: `wl-mobile-station-first` on `#wl-play` when viewport ≤768px (all scenarios). Tutorial A/B variant no longer changes panel order.

## Analytics

Every tutorial funnel event (`source: tutorial_funnel`) includes:

| Property | Values |
|----------|--------|
| `mobile_layout_experiment` | `active` \| `off` |
| `mobile_layout_variant` | `station_first` \| `control` \| `off` |
| `mobile_viewport` | boolean at event time |
| `mobile_coach_mode` | `explore` \| `direct` \| `off` — explore = station-first mobile acts 1–3 (no auto-scroll, card spotlight) |

Primary funnel (PostHog):

`tutorial_started` → `tutorial_intro_dismissed` → `tutorial_first_advance_clicked`

**Break down by** `mobile_layout_variant` and filter `mobile_viewport = true`.

Secondary: `tutorial_first_advance_clicked` → `tutorial_research_opened`.

Session replay: mobile + `tutorial_started` in last 7 days; compare treatment vs control scroll paths (rankings/intel before first advance).

## Dev

```javascript
wlTutorialMobileLayoutVariant()              // 'station_first' | 'control'
wlTutorialMobileStationFirstExperimentActive() // true if treatment applies now
wlTutorialMobileLayoutAnalyticsProps()       // props object for debugging
```

## After a win

1. Ship the same `#pc`-before-`#pl` reorder for **all mobile gameplay** (not just tutorial).
2. Re-run tutorial QA on mobile (`docs/tutorial-turnaround-qa.md`) — coach spotlight scroll targets may need a pass.
3. Then tune tutorial progression / coach copy on the new layout.

## Tutorial alignment (mobile station-first treatment)

When `wlTutorialMobileCoachLayoutActive()` (treatment + viewport ≤768px):

| Area | Behavior |
|------|----------|
| Intro modal | “Your station is on the main screen” + **OK — SHOW MY STATION** |
| Acts 1–3 coach copy | Emphasizes **your station card** (Research, Programming) |
| **Explore coach** (`mobile_coach_mode: explore`) | Acts 1–3: **no auto-scroll**; acts 2–3 spotlight **whole station card** while gate stays on Research / Programming buttons; coach pinned below header |
| After intro dismiss | Scrolls station section into view (legacy mobile only — explore skips scroll) |
| Act 2 spotlight | Legacy mobile: scrolls station card. Explore: player finds station card |
| Acts 1–3 discovery | Ranker, Digest, competitor intel nudge back to coach (soft gate via COACH NOTE) |
| Act 7+ | Unchanged — market table / Ranker sequence as before |

Disable explore coach only (keep station-first layout):

```javascript
const WL_TUTORIAL_MOBILE_EXPLORE_COACH_ACTIVE = false; // in src/legacy.js
```

Control variant + desktop: legacy tutorial copy and behavior.

## Sign-off

| Start | End | Primary metric (treatment vs control, mobile) | Decision |
|-------|-----|-----------------------------------------------|----------|
|       |     | intro_dismissed → first_advance_clicked       |          |
