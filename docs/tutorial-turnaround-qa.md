# Turnaround tutorial QA checklist

Manual pass for **scenario `tutorial_turnaround`** (solo). Use this after changing `src/legacy.js` tutorial/coach code, modal timing, or `#wl-tu-tr-card` styles in `src/styles.css`.

## When to run

- Any edit touching: `wlTuTurnaround*`, `tutorialTurnaround*`, `_wlModalAfterClose` for `m-sum` / `m-research` / `m-turnaround-tip`, or coach positioning (`WL_TU_MODAL_COACH_DESKTOP_MIN_W`, `wlTuTurnaroundModalCoachInGutter`, `wlTuTurnaroundCoachClearOfRect`).
- At minimum: rerun the acts you touched **plus** the act before and after.

## Viewports

| Pass | Approx. width | Intent |
|------|----------------|--------|
| **Desktop** | ≥ 900 px (e.g. 1280×800) | Coach docked **left** of `.mo`; modal highlights visible; scripted tip above coach when both exist. |
| **Tablet** | 640–899 px | Left gutter preferred when space allows; may use right gutter. |
| **Mobile** | ≤ 520 px | Coach may overlap modal; controls must remain reachable after “Continue without guide” if needed. |

Resize once mid-step on desktop to confirm nothing throws in the console and the coach snaps without a dead overlay.

---

## Global checks (every pass)

- [ ] **Console**: no uncaught errors during the whole checklist for that viewport.
- [ ] **`#wl-tu-tr-root`**: spotlight/dim aligns with highlight; `#m-turnaround-tip` (when open) stays **readable and on top** of the floating coach (`z-index` / stack).
- [ ] **Desktop**: coach card beside modal sits in the **left** margin (`#wl-tu-tr-card.wl-ft-tut-card--modal-gutter`); long copy scrolls inside the card, not clipped at ~240 px.
- [ ] **“Continue without guide”** still hides the scripted flow without soft-locking core game UI.

---

## Act map (happy path)

| Act | Goal (player) |
|-----|----------------|
| **1** | First **Next Period**. |
| **2** | **Research** → listener/consultant/memo → close research. |
| **3** | **Programming** → **Format** change. |
| **4** | Programming tour (Positioning, Demo Target, Budget, Focus **Midday**) → talent on **Midday** → contract flow as scripted. |
| **5** | **Next Period** twice (Midday focus); summaries dismissed. |
| **6** | **Promotion** (tour/budget commit) → advance as coached. |
| **7** | **Sales** (spots + team + commit) → **Next Period** → market table → Ranker sequence. |
| **8** | Final **Next Period** → graduation / normal play. |

---

## Scripted center modals (`#m-turnaround-tip`)

These are separate from the floating coach card. Confirm each appears once at the intended moment, dismisses cleanly, and does not leave `#wl-tu-tr-root` stuck visible above them.

Rough inventory (trim or extend if copy changes):

- After **first period** (act 2): “Results are in…”
- **Not** duplicated: old act-3 takeaway modal (“Takeaway: old-fashioned…”); coach carries act 3 copy instead.
- **First summary after a format flip**: only the floating coach **“Don’t worry about a soft book”** (when act 5 summary opens); no separate scripted flip listener modal on summary open.
- **Act 5**: spotlight carries next-period guidance — no extra scripted “Run Next Period twice…” center modal on act entry.
- **After two act-5 summaries** → act 6: promotion line (single beat, not stacks of duplicates).
- **After raising promotion**, **first summary close** advancing to Sales: spots / sales message (`m-sum` path).
- **Act 8** finale line (if still present).
- Other warn/info toasts (`Midday only`, Ranker gated messages, etc.): acceptable if they fire at the correct gate only.

Tick per run:

- [ ] No scripted modal **under** the dimmed coach overlay.
- [ ] No **double** modals teaching the same beat back-to-back (e.g. two “soft book” speeches).

---

## Act-by-act checklist

### Act 1 — First period

- [ ] Intro scenario modal if shown; dismiss → spotlight on **Next Period**.
- [ ] Announce → spotlight OK; desktop coach position acceptable.

### Act 2 — Research

- [ ] Scripted tip after advancing (act 2) behaves; coach highlights **Research**.
- [ ] **Open Research**: stepped coach (listener → consultant → memo) stays in **margins** on desktop (`wlTuTurnaroundModalCoachInGutter`); no redundant COACH NOTE on open (only stepped cards).
- [ ] Consultant / memo completes; **close research** advances to act 3; takeaway/tip/coach ordering: no spotlight **on top of** scripted takeaway when takeaway should lead.

### Act 3 — Programming / format

- [ ] Coach copy matches **Fix the sound** / Programming panel framing; Programming open shows **FORMAT** highlight.
- [ ] Applying **format** increments act → **programming polish** (act 4) path; **no** immediate format-flip comfort modal on selection (deferred until first **summary opens**).

### Act 4 — Programming tour & talent

- [ ] Steps: Positioning → Demo Target → Budget (coach **left**, not covering slider on desktop) → Focus **Midday** → close programming.
- [ ] Inline “Midday focus” cue on station card coach (no extra duplicate `#m-turnaround-tip` stacking with lineup coach).
- [ ] Talent / contract: introductory cards + **Contract & pay** + later steps; card has enough **vertical space** (scroll inside card acceptable; not a tiny strip).
- [ ] Bench/replace/hire path completes; act advances to **5** when appropriate.

### Act 5 — Two books

- [ ] Spotlight **Next Period**; first summary shows **don’t worry about soft book** coach when flagged (if still in script).
- [ ] Format-flip listener comfort line appears on **opening** summary after flip once, not duplicated.
- [ ] Advance to **act 6** only after **two summary dismissals** (or validated fallback counters); promotion scripted line **after** second summary closes, **not** under unread summary.

### Act 6 — Promotion

- [ ] Promotion modal tour / budget coaching; desktop left gutter.
- [ ] Closing promotion and advancing: no duplicated promotion notes before summaries.

### Act 7 — Sales & Ranker

- [ ] Transition to Sales after **closing** the period summary that follows committing promotion (`_tutorialAct6SalesIntroPending` path).
- [ ] Sales in-modal stepped coaches (`m-sales`); apply/commit gates.
- [ ] Ratings table → Ranker gating OK; stray Ranker clicks show warn only where intended.

### Act 8 — Finale

- [ ] Final **Next Period**; graduation modal; tutorial mode clears; expansion coach if applicable unchanged.

---

## Dev shortcuts (solo, fast retest)

Requires `localStorage.setItem('wlTutorialDev','1')` then reload. See **`wlTutorialDevHelp()`** in console for full text.

Examples:

```text
wlTutorialJump(2)   // Research act
wlTutorialJump(3)   // Post-research Programming
wlTutorialJump(5)   // Midday periods segment
wlTutorialJump(6)   // Promotion
wlTutorialJump('sales')       // Sales + book
wlTutorialJump('afterSales')  // After spots, NEXT PERIOD spotlight
wlTutorialJump('market')      // Phase 2 table
wlTutorialJump('ranker')
wlTutorialJump('finale')
```

**Note:** Jumps adjust **tutorial flags only**, not sim state (`wlTutorialDevHelp` comment). Combine with saves or partial manual play when testing real station state.

Keyboard: **Ctrl+Shift+Space** (with dev flag) skips announce / primary coach OK for faster stepping.

---

## Quick code grep (optional after edits)

```bash
rg "tutorialTurnaroundCoachAfterRender\\(\\)|tutorialTurnaroundCoachSync\\(\\)" src/legacy.js
```

Review hits next to **`om(`** / **`cm(`** / **`tutorialTurnaroundUIMessage`** — avoid scheduling coach layout immediately after opening `#m-turnaround-tip` unless the tip branch intentionally defers coach (e.g. `m-research` close).

---

## Sign-off

| Date | Tester | Viewports checked | Acts / areas | Notes |
|------|--------|-------------------|--------------|-------|
|      |        | Desktop / Tablet / Mobile |       |       |
