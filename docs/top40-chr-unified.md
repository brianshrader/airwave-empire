# Unified Top 40 / CHR lineage

## A. Design note

Airwave Empire now treats **Top 40** and **CHR** as one **internal format** with id `TOP40`. The on-screen name and the meaning of the **single positioning slider** change with era:

- **1970s–early 1980s:** Label **Top 40**; poles **Bubblegum Pop ↔ Rock Edge**; demos blend toward the historical broad AM hit station.
- **Mid/late 1980s:** Label **Hit Radio**; poles describe a **tightening FM hits lane** moving from rock overlap toward **rhythmic crossover**.
- **1990s+:** Label **CHR**; poles **Pure Pop Hits ↔ Rhythmic Edge**; demo table blends toward the former standalone CHR profile.

The blend uses a smoothstep on calendar year from **1978 → 1992** (`hitsLineageAxisBlendT`) so there is no hard year flip. Gameplay keeps one saved drift value under `s.drift.TOP40`.

## B. Code (summary)

- `src/legacy.js`: helpers (`isHitsFormatLineage`, `canonicalHitsFormatKey`, `hitsFormatSurfaceLabel`, `fmtLabel`, `hitsDriftPolesForYear`, `hitsTop40DemoEffect`, `migrateHitsLineage`); `FM` drops `CHR`; `FADJ` / `FMT_COMPETITION` / AI lists / sellout affinity / AM implausibility use `TOP40` only; merged `DRIFT.TOP40` inflections; `getDrift` returns era-specific pole copy; `appl` blends `FA` demos and applies a small era multiplier for breadth → FM youth focus; `migrateSave` calls `migrateHitsLineage` first; rival events use `rival-TOP40-…` with canonical format for `mkStn`.
- `src/logoGalleryPage.js`: gallery rows use `formatKey: 'TOP40'` where they previously used `CHR`.
- `dist/src/legacy.js` updated via `npm run build` (Vite copies `legacy.js`).

## C. Old saves and `CHR` stations

`migrateHitsLineage(G)` runs at the start of `migrateSave(G)` and:

1. Sets every `s.format === 'CHR'` to **`TOP40`**.
2. Copies `s.drift.CHR` → `s.drift.TOP40` if needed, then deletes `s.drift.CHR` (same for `driftHistory`).
3. Removes **`CHR`** from `G.unlockedFormats`.
4. Merges talent `formatFit.CHR` into `formatFit.TOP40` on bench and on-air talent.

`canonicalHitsFormatKey` and `genderCPM` / `FGS` still map **`CHR` → `TOP40`** if any edge case leaves the old id in memory before migration.

## D. How it reads by year (examples)

| Year | Surface label   | Slider poles (summary)                          |
|------|-----------------|-------------------------------------------------|
| 1970 | **Top 40**      | Bubblegum Pop ↔ Rock Edge                       |
| 1980 | **Top 40**      | Still early-era poles (blend t ≈ 0.14)          |
| 1990 | **Hit Radio**   | Transition copy (pop hits ↔ rhythmic lean)    |
| 2000 | **CHR**         | Pure Pop Hits ↔ Rhythmic Edge                   |

(Exact thresholds: `hitsFormatSurfaceLabel` uses t &lt; 0.28 → Top 40, t &lt; 0.72 → Hit Radio, else CHR.)

## E. Adjacency, demos, economics

- **Adjacency / competition:** `CHR` removed from `FADJ` and `FMT_COMPETITION`; hit radio competes as **`TOP40`** against Soul/R&B, Album Rock, Urban, Rhythmic, Hot AC, etc. (same cluster idea, one less duplicate row).
- **Demographics:** `FA.CHR` removed; `appl` lerps between legacy **Top 40** and legacy **CHR** demo weights using `hitsLineageAxisBlendT`.
- **Economics:** Single `FM.TOP40` row (cpm **1.08**, sp **14**); `STRAF.TOP40` **0.91**; `fmtSellAffinity` uses one **`TOP40`** entry (**0.13**). Minor **appeal** multipliers in `appl` model broad-then-tight and FM-youth lift for `TOP40` over time.
- **AM implausibility:** `AM_IMPLAUSIBLE_AFTER.TOP40` **2000** (replaces former `CHR` entry).
