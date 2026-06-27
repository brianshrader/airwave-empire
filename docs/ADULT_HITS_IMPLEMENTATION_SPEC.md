# Adult Hits — Implementation Spec (Bundle A step 1)

**Status:** Implemented on `main` (verify in-game picker post-1998)  
**Branch from:** `main`  
**Scope:** First native Bundle A format — no realism scalar tuning

## Goal

Add **Adult Hits / Variety Hits** as a playable commercial format (Jack FM / Bob FM lane): broad gold variety FM, unlock **1998**, competes with Classic Hits, Hot AC, AC, and heritage rock.

## Out of scope

- Commercial CCM, Conservative Talk, Spanish promotion
- Demand / Blueprint / Fragmentation retune
- Save migration (new format only; no renames)
- Player-only market gates

## Gameplay surface

| System | Change |
|--------|--------|
| `FM.ADULT_HITS` | New entry: fm, unlock 1998, moderate CPM, lighter spot load |
| `FA.ADULT_HITS` | Broad 25–54 skew; younger than Classic Hits |
| `DRIFT.ADULT_HITS` | Shuffle variety ↔ decade lean |
| `REFORMAT_ADJ` | Adjacent to Classic Hits, Hot AC, AC, Classic Rock, Oldies |
| Industry event | ~2002 Jack/Bob FM wave (unlock reminder + rival spawn hook) |
| Lists | Music automation, staffing, research, CR adjacency, logos (`hit` family) |
| `formatFamilies.v1.json` | Promote planned → implemented |

## Success (manual)

- Format appears in picker after 1998
- Dallas / Atlanta / Seattle FM reformat targets include Adult Hits
- No regression to Spanish POC paths (`?proto=share+sac+spanish`)
