# Format Picker Grouping + Spanish Subtype Player Selection

**Status:** Implemented — ships with Spanish Composition v1  
**Ships with:** `src/realismSpanishComposition.js` (Spanish Composition v1)  
**Related:** [SPANISH_FORMAT_SPLIT_SPEC.md](./SPANISH_FORMAT_SPLIT_SPEC.md), [data/formatFamilies.v1.json](../data/formatFamilies.v1.json)

---

## Deploy gate

**Do not deploy Spanish Composition to production without this picker work.**

Rivals will run as Regional Mexican, Spanish Contemporary, Spanish Tropical, and Spanish Adult Hits while the player still sees only **Spanish / Latin**. That is a product-surface lie, not a backend-only change.

This bundle is one release:

1. Spanish Composition runtime (already built)
2. Grouped format picker + Spanish subtype player selection (this spec)
3. Umbrella `SPANISH` save migration (this spec)

---

## Goal

Replace the flat format-change modal with a grouped accordion picker that:

- Separates **General Market Formats** from **Spanish-Language Formats**
- Makes the four Spanish music subtypes **player-selectable**
- **Hides umbrella `SPANISH`** from new player choices
- **Preserves umbrella `SPANISH`** for saves, AI fallback, and scenario compatibility
- **Auto-migrates** player/rival stations on load from umbrella → subtype (drift-informed)
- Keeps tutorial and coach hooks working via stable selectors
- Surfaces honest positioning slider labels per subtype
- Shows market-fit advisory copy (never blocks selection)

---

## Out of scope

- Spanish spoken formats (News/Talk, Sports, Religious) — picker section placeholder only
- Loading `formatFamilies.v1.json` at runtime (mirror grouping in a small picker config for v1)
- Search/filter box
- Hard-blocking Spanish formats in low-Hispanic markets (advisory UI only in v1)
- Cross-family bilingual stations
- Retiring `DRIFT.SPANISH` from codebase (keep for migration + AI umbrella fallback)

---

## Picker information architecture

### Top-level sections (always visible)

| Section | Label | Contents |
|---------|-------|----------|
| A | **General Market Formats** | English-primary commercial formats + Gospel, Christian, Brokered |
| B | **Spanish-Language Formats** | Four music subtypes only (v1) |

“General Market” avoids implying every format is English-defined (Gospel, Brokered, Urban, etc.).

### General Market groups (accordion)

| Group | Formats |
|-------|---------|
| Hits / CHR | `TOP40`, `RHYTHMIC`, `OLDIES`, `CLASSIC_HITS`, `ADULT_HITS` |
| Rock | `ALBUM_ROCK`, `CLASSIC_ROCK`, `ALT_ROCK`, `AAA` |
| Adult / AC | `ADULT_CONTEMP`, `HOT_AC`, `MOR`, `BEAUTIFUL_MUSIC`, `ADULT_STANDARDS` |
| Urban | `SOUL_RNB`, `URBAN_CONTEMP` |
| Country | `COUNTRY` |
| Spoken | `NEWS_TALK`, `CONSERVATIVE_TALK`, `SPORTS_TALK`, `PERSONALITY_TALK`, `ALL_NEWS` |
| Christian | `GOSPEL`, `CHRISTIAN` |
| Brokered / Specialty | `BROKERED_PROGRAMMING` |

Sort within each group: **unlocked first**, then by `FM[].unlock` ascending, then label.

### Spanish-Language group (accordion, single group in v1)

| Format | Player label |
|--------|----------------|
| `REGIONAL_MEXICAN` | Regional Mexican |
| `SPANISH_CONTEMPORARY` | Spanish Contemporary |
| `SPANISH_TROPICAL` | Spanish Tropical |
| `SPANISH_ADULT_HITS` | Spanish Adult Hits |

No umbrella row. No future spoken ghosts greyed out.

### Accordion UX

- Same modal shell (`#m-fm`, `#fmb`, `.fmg` grid replaced by grouped layout)
- Section headers: sticky within scroll on desktop; collapsible `<details>` or toggle headers
- **Default expanded:** group containing the station’s current format; if current is umbrella `SPANISH` (pre-migration edge), expand Spanish section
- Preserve existing per-format cards: `.fmo`, badges (`OPEN` / `CONTESTED` / `CROWDED` / `UNLOCKS yyyy`), CPM line, description
- Empty groups: omit header entirely (do not show “Rock (0)”)

---

## `FM{}` visibility changes

| Key | Change |
|-----|--------|
| `SPANISH` | Add `playerHidden: true` — picker excludes; `fmtLabel()` and saves unchanged |
| `REGIONAL_MEXICAN` | Remove `playerHidden` |
| `SPANISH_CONTEMPORARY` | Remove `playerHidden` |
| `SPANISH_TROPICAL` | Remove `playerHidden` |
| `SPANISH_ADULT_HITS` | Remove `playerHidden` |

Sync `data/formatFamilies.v1.json` `playerSelectable` / `playerHidden` flags to match.

`rFmt()` filter stays: `if (FM[f]?.playerHidden) return false`.

---

## Picker implementation (`rFmt` / `openFmt`)

### New config constant (v1)

Add `WL_FMT_PICKER_SECTIONS` near `FM{}` — static array, not loaded from JSON:

```javascript
// shape: { id, label, groups: [{ id, label, formats: ['TOP40', ...] }] }
```

Helper: `wlFmtPickerEligibleFormats(s, G)` — current `allFmts` logic extracted unchanged.

Helper: `wlFmtPickerRenderCard(f, s, G, FS)` — existing card HTML builder.

Helper: `wlFmtPickerRenderGrouped(s, G, FS)` — builds section HTML + accordions.

Replace flat `<div class="fmg">${opts}</div>` with grouped output.

### Stable selectors (tutorial / coach)

Every format card MUST include:

```html
<div class="fmo …" data-fmt="TOP40" …>
```

Tutorial turnaround Act 3:

- Keep `id="wl-tu-tr-fmt-top40"` on the **TOP40** card (not position-dependent)
- Keep `id="wl-tu-tr-fmt-apply"` on confirm button
- Coach scroll logic (`document.getElementById('wl-tu-tr-fmt-top40')`) must work when TOP40 is inside collapsed “Hits / CHR” — **auto-expand Hits / CHR** when tutorial opens format modal and `_tutorialFmtCoachStep === 1`

---

## Umbrella migration (`migrateSpanishSubtypeFromUmbrella`)

Add to `migrateSave(G)` after `migrateGospelTaxonomy`, gated once:

```javascript
G._spanishSubtypeMigratedV1 = 1;
```

### Stations to migrate

All `G.stations` where `s.format === 'SPANISH'` (player, rival, LMA, blueprint-resolved — everyone).

Do **not** re-run if station already on a subtype key.

### Auto-map from umbrella drift

Read `s.drift?.SPANISH` (default `DRIFT.SPANISH.default` → 40 if missing).

| Drift (`SPANISH` pole A=Regional ← → pole B=Tropical/Pop) | Year gate | Target subtype |
|-------------------------------------------------------------|-----------|----------------|
| ≤ 32 | — | `REGIONAL_MEXICAN` |
| 33 – 51 | — | `SPANISH_CONTEMPORARY` |
| 52 – 67 | — | `SPANISH_TROPICAL` |
| ≥ 68 | `< 2002` | `SPANISH_TROPICAL` |
| ≥ 68 | `≥ 2002` | `SPANISH_ADULT_HITS` if drift ≥ 78, else `SPANISH_TROPICAL` |

Tropical vs Adult Hits at high drift: **78+ → Adult Hits** encodes “older/gold skew” on the pop side of the legacy slider.

### Drift carryover

```javascript
s.format = target;
if (s.drift?.SPANISH != null) {
  s.drift[target] = s.drift.SPANISH;
}
delete s.drift?.SPANISH;
// same for driftHistory.SPANISH → driftHistory[target]
```

Set drift default for target if none: `DRIFT[target].default`.

### Player notification (optional, recommended)

If `s.isPlayer` and migration changed format:

```javascript
G.news.unshift({
  v: 'MEDIUM',
  t: `📻 ${s.callLetters}: Spanish programming refined to ${fmtLabel(target)} (was umbrella Spanish / Latin). Open FORMAT to adjust.`,
  y: G.year, p: G.period, iy: true
});
```

**No blocking modal** in v1 — auto-map with format change available immediately.

### `unlockedFormats`

Replace `'SPANISH'` with migrated subtype keys where present. Do not remove umbrella from saves that never had a station on it.

### AI / gen / blueprint

After migration, new player picks use subtypes only. AI and composition already prefer subtypes when composition is enabled. Umbrella remains valid in:

- Old scenario JSON that has not been loaded through `migrateSave`
- AI fallback paths when composition disabled (`isCommercialFmt` returns umbrella-only)
- Diagnostic harnesses forcing umbrella

---

## Intra-Spanish reformat adjacency

Extend `FADJ` so subtype ↔ subtype flips are **adjacent** (2-period ratings hit, not 3):

```javascript
REGIONAL_MEXICAN: [..., 'SPANISH_CONTEMPORARY', 'SPANISH_TROPICAL', 'SPANISH_ADULT_HITS'],
SPANISH_CONTEMPORARY: [..., 'SPANISH_TROPICAL', 'SPANISH_ADULT_HITS'],
SPANISH_TROPICAL: [..., 'SPANISH_ADULT_HITS'],
// SPANISH_ADULT_HITS already lists REGIONAL_MEXICAN
```

Remove `SPANISH: ['URBAN_CONTEMP']` from player-facing concern; keep for legacy AI if umbrella persists on rivals pre-migration.

---

## Positioning slider labels (`DRIFT{}`)

Subtype rows currently duplicate pole names (placeholders). Replace with spec-aligned poles **before deploy**:

| Format | Label | Pole A | Pole B | Default |
|--------|-------|--------|--------|---------|
| `REGIONAL_MEXICAN` | Musical Style | Banda / Norteño | Grupero / Ranchera | 28 |
| `SPANISH_CONTEMPORARY` | Musical Style | Pop | Urbano | 55 |
| `SPANISH_TROPICAL` | Musical Style | Salsa | Reggaeton / Latin rhythm | 62 |
| `SPANISH_ADULT_HITS` | Musical Style | 90s gold | 2000s recurrent | 48 |

Keep `demoEffect` / `inflections` wiring; subtype-specific inflections can remain empty in v1.

**Umbrella `DRIFT.SPANISH`:** unchanged — used only for migration inference and any remaining umbrella stations.

Programming panel copy (`openDrift`, positioning memo) must call `DRIFT[s.format]` so subtype stations show the correct poles automatically once updated.

---

## Market-fit advisory copy

Advisory only — **never block** format selection (consistent with acquisition market research).

### When to show

On format card (muted badge) and/or confirmation panel when `FS.chosen` is a Spanish subtype.

### Gate helpers (existing)

- `isHighHispanicMarket(marketId)` — `hispPop2020 ≥ 0.20` OR `culture.spanish ≥ 0.12`
- Optional strong-fit hint: `isHighHispanicMegaMarket(marketId)`

### Copy matrix

| Condition | Badge / warning |
|-----------|-----------------|
| Spanish subtype + `!isHighHispanicMarket` | **LOW HISPANIC POPULATION** — “Spanish formats can launch anywhere, but ratings and revenue scale with Hispanic population. Expect an uphill climb here.” |
| `REGIONAL_MEXICAN` + Sunbelt archetype (`sunbelt_diversified`, etc.) | **STRONG MARKET FIT** (ok badge) — optional green hint |
| `SPANISH_TROPICAL` + Miami / NYC / `northeast_mega` | **STRONG MARKET FIT** |
| `SPANISH_ADULT_HITS` + `G.year < 2002` | **UNLOCKS 2002** (existing year lock — already handled) |
| Spanish subtype + ≥2 Spanish-family stations on dial | **CROWDED SPANISH DIAL** — reuse lane intel: “N Spanish stations split X% of listening.” |

Implement helper: `wlSpanishFormatMarketFitHint(fmt, marketId, G)` → `{ badge, bc, confirmHtml }`.

Surface `confirmHtml` in the warning stack above APPLY (same slot as franchise / identity warnings).

---

## CSS (minimal)

In `src/styles.css`:

- `.fmt-section` — top-level General vs Spanish spacing
- `.fmt-section-title` — “General Market Formats” / “Spanish-Language Formats”
- `.fmt-group` / `.fmt-group-hd` — accordion header
- `.fmt-group-body` — indented card list
- Mobile: same structure; reduce padding; one group open at a time optional

Do not change modal width unless grouped content overflows.

---

## Files to touch

| File | Change |
|------|--------|
| `src/legacy.js` | `FM{}` flags, `WL_FMT_PICKER_SECTIONS`, `rFmt` refactor, `migrateSpanishSubtypeFromUmbrella`, `FADJ`, `DRIFT` subtype poles, `wlSpanishFormatMarketFitHint` |
| `src/styles.css` | Accordion / section classes |
| `data/formatFamilies.v1.json` | `playerSelectable` / `playerHidden` sync |
| `scripts/lint-format-families.mjs` | Verify SPANISH umbrella hidden + subtypes selectable |
| `dist/*` | Build output |

No change required to `realismSpanishComposition.js` beyond deploy ordering — it already treats subtypes as commercial formats.

---

## Manual test plan

### Picker

- [ ] Format modal shows two top sections: General Market / Spanish-Language
- [ ] General groups collapse/expand; current format’s group opens by default
- [ ] Umbrella **Spanish / Latin** does **not** appear
- [ ] All four subtypes appear under Spanish-Language when year/market unlocked
- [ ] Badges (OPEN, UNLOCKS, CROWDED) unchanged behavior
- [ ] Tutorial Act 3: coach finds `#wl-tu-tr-fmt-top40`, APPLY enables after pick
- [ ] Mobile: scrollable, tappable, no layout break

### Migration

- [ ] Load save with player station `format: 'SPANISH'`, `drift.SPANISH: 25` → becomes `REGIONAL_MEXICAN`, drift preserved
- [ ] `drift.SPANISH: 45` → `SPANISH_CONTEMPORARY`
- [ ] `drift.SPANISH: 60` → `SPANISH_TROPICAL`
- [ ] `drift.SPANISH: 80`, year 2010 → `SPANISH_ADULT_HITS`
- [ ] News item on player station after migration
- [ ] Re-load same save: idempotent (no double migration)

### Gameplay coupling

- [ ] Player picks Regional Mexican in Houston 2026 → lane intel shows **Spanish** family; positioning shows Banda/Norteño ↔ Grupero/Ranchera
- [ ] Reformat RM → Contemporary: 2-period penalty (adjacent)
- [ ] Spanish Composition enabled: rivals and player use same subtype keys in book
- [ ] Low-Hispanic market (e.g. Portland): advisory copy visible; selection still works

### Deploy smoke

- [ ] `npm run build` clean
- [ ] `npm run lint:format-families` pass
- [ ] Houston save bankruptcy path unaffected
- [ ] `?proto=share+sac+spanish` harness still runs

---

## Success criteria

1. Player and rival format keys match in Spanish markets after composition deploy  
2. No player-facing umbrella `SPANISH` in the picker  
3. Old saves load without manual intervention; drift-informed subtype assignment  
4. Picker scannable at ~30 general + 4 Spanish formats  
5. Tutorial turnaround completes without coach regression  

---

## Implementation order

1. `DRIFT` subtype poles + `FADJ` intra-Spanish edges  
2. `migrateSpanishSubtypeFromUmbrella` + `migrateSave` hook  
3. `FM{}` / formatFamilies visibility flags  
4. `WL_FMT_PICKER_SECTIONS` + grouped `rFmt` + CSS  
5. Market-fit hints + confirm panel copy  
6. Tutorial auto-expand group fix  
7. Manual test plan + deploy with Spanish Composition  
