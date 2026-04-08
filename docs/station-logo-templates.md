# Station logo template system (SVG)

## Overview

Procedural station logos are **template-driven**, not free-form decoration. The runtime picks **one of at most three layout archetypes** per **format family × AM/FM**, then renders a **three-tier radio lockup** in the large (brand hero) view: **hero line**, **secondary line**, and **calls**, plus a small **format descriptor**.

Determinism is unchanged: the same station id, format, era bucket, dial, calls, brand, variant bump, and optional cosmetic overrides yield the same SVG.

## Format → template family

Game formats map to internal families in `src/stationLogoConfig.js` (`FORMAT_TO_FAMILY`), for example:

| Player-facing spirit | Game formats (examples) | Family key |
|---------------------|---------------------------|------------|
| AM news / talk | `NEWS_TALK`, `ALL_NEWS`, `PUBLIC_NEWS` | `news` |
| AM full-service / heritage | (news family on AM with heritage templates) | `news` |
| FM CHR / hit | `CHR`, `TOP40` | `hit` |
| FM rhythmic | `RHYTHMIC` | `rhythmic` |
| FM AC / soft | `ADULT_CONTEMP`, `HOT_AC`, `MOR`, … | `ac` |
| FM rock | `ALBUM_ROCK`, `ALT_ROCK` | `rock` |
| FM classic rock / classic hits | `CLASSIC_ROCK` (uses classic-hit **oldies** templates), `OLDIES`, `CLASSIC_HITS` | `oldies` |
| FM country | `COUNTRY` | `country` |
| Sports talk | `SPORTS_TALK` | `sports` |

`CLASSIC_ROCK` is routed to the **oldies** family so marks read as classic-hit / heritage rather than aggressive album-rock slabs.

## Band-specific template pools

`LOGO_TEMPLATE_VARIANTS_BY_BAND` in `stationLogoConfig.js` lists **exactly three** archetype ids per family for **AM** and **FM**. The chosen index is:

`(eraLayoutStructure[era].archetypeEraOffset + hash(seed, variant, bump, format) + variant * 7) % 3`

So **era shifts** which template appears for a given hash bucket without breaking stability for a saved game.

## Hero modal (large logo)

The **brand hero** SVG uses a **single centered lockup**:

1. **Primary** — one or two lines: the station **brand** string (large, primary font). Spoken dial words in the brand (e.g. “Nine Fifty” for 950 AM) are replaced with **digits** for display when the dial has no decimal (typical AM); the saved brand text can stay verbose for jingles / Suno.
2. **Subline** — small secondary type, centered under the brand: **`CALL-AM/FM` + city of license** (from `G.city` / market label, passed as `licenseCity` in the procedural logo input).

Background **shapes** still follow the template archetype + era; only the text stack is simplified.

## Era and shapes

Era still drives `ERA_LAYOUT_STRUCTURE` (frame layers, asymmetry, hierarchy gap) and `ERA_MODIFIERS` (corner radius, rule weight, glow, on-air tag). Template **geometry** (tabs, stripes, shields, etc.) stays in the existing per-family `switch` in `buildBrandHeroLayout`; we reduced template **count** and improved **text lockup** so fills read as station marks rather than empty UI tiles.

## Player overrides

`cosmeticProcLayout` is validated against the **current band’s** three-template list (via `layoutListForFamilyBand`). Palette and font index overrides are unchanged.

## Comparing samples

After `npm run build`, open `dist/inspect-logo-templates.html` (or run Vite dev and open `/inspect-logo-templates.html`) to view a grid of deterministic examples across formats and eras.
