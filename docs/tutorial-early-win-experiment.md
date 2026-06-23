# Tutorial early-win experiment (Act 3.5)

Temporary onboarding experiment: after the format change, the player runs **one** ratings book, sees a **celebration modal** with before/after stats, then continues the **existing** Act 4–8 tutorial unchanged.

## Rollback (restore original tutorial)

The full pre-experiment flow is preserved when the experiment is **off**.

### Option A — constant (source)

In `src/legacy.js`, set:

```javascript
const WL_TUTORIAL_EARLY_WIN_EXPERIMENT_DEFAULT = false;
```

Rebuild / reload.

### Option B — browser (no rebuild)

Console or before starting the tutorial:

```javascript
localStorage.setItem('wlTutorialEarlyWin', '0');
location.reload();
```

### Option C — URL (guest autostart)

Append to the play URL:

```
&tutorialEarlyWin=0
```

Example: `/play-guest.html?scenario=tutorial_turnaround&autostart=1&tutorialEarlyWin=0`

### Re-enable experiment

```javascript
localStorage.setItem('wlTutorialEarlyWin', '1');
// or remove the key
localStorage.removeItem('wlTutorialEarlyWin');
```

## What changes when ON

| Step | Legacy | Experiment |
|------|--------|------------|
| After format apply | → Act 4 immediately | → **Act 35** (3.5): coach “Next Period” once |
| After that book’s summary | — | **Celebration modal** + `tutorial_early_success_seen` |
| Then | Act 4 programming + talent | **Act 4 talent** (programming polish tour skipped; midday focus preset) |

Coach positioning, modal timing, Act 4+ gates, and soft-book logic for Act 5 are **not rewritten** — only a gated insert between Act 3 and Act 4.

## Analytics

- `tutorial_early_success_seen` — celebration modal shown (once per run)
- `tutorial_first_payoff_seen` — unchanged (still Act 5→6 promotion handoff)

### Funnel instrumentation (`source: tutorial_funnel`)

Once per run, for PostHog diagnosis between `tutorial_started` and early win:

| Event | When |
|--------|------|
| `tutorial_intro_dismissed` | Intro modal OK (Act 1) |
| `tutorial_first_advance_clicked` | First **Next Period** completes (Act 1 → 2) |
| `tutorial_research_opened` | Research modal opened (Act 2) |
| `tutorial_research_memo_seen` | Consultant report commissioned / memo available |
| `tutorial_research_closed` | Research closed → Act 3 (consultant done) |
| `tutorial_format_prompt_seen` | Act 3 format phase (research close or format modal open) |
| `tutorial_format_changed` | Format apply succeeds |
| `tutorial_session_replay_started` | PostHog session replay started for this tutorial run |

Recommended funnel:

`tutorial_started` → `tutorial_intro_dismissed` → `tutorial_first_advance_clicked` → `tutorial_research_opened` → `tutorial_research_memo_seen` → `tutorial_research_closed` → `tutorial_format_prompt_seen` → `tutorial_format_changed` → `tutorial_first_payoff_seen` → `tutorial_finished`

Session replays: filter recordings by persons who triggered `tutorial_started` or event `tutorial_session_replay_started` (last 7 days).

## Dev

- `wlTutorialJump(35)` — jump to early-win beat (requires dev flag)
- `wlTutorialEarlyWinExperimentActive()` — returns whether experiment is active

See also `docs/tutorial-turnaround-qa.md` for full QA.
