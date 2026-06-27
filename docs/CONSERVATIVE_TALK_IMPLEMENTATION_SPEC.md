# Conservative Talk — Implementation Spec (Bundle A step 2)

**Status:** Implemented on `main` (verify in-game picker post-1990)  
**Scope:** Second native Bundle A format — syndicated partisan talk lane, distinct from News/Talk and Personality Talk  
**Out of scope:** Supply anchors, pillar-competition generalization, scalar calibration (D5)

## Goal

Add **Conservative Talk** as a playable commercial spoken format: syndicated partisan AM/FM stack, unlock **1990**, competes with News/Talk, Sports Talk, and Personality Talk for 35–64 male cume.

## Gameplay surface

| System | Change |
|--------|--------|
| `FM.CONSERVATIVE_TALK` | New entry: talk, unlock 1990, moderate CPM, lighter spot load than News/Talk |
| `FA.CONSERVATIVE_TALK` | Older male skew; partisan 35–64 core |
| `DRIFT.CONSERVATIVE_TALK` | Syndicated National ↔ Local Grassroots |
| `REFORMAT_ADJ` / `FADJ` | Adjacent to News/Talk, Sports Talk, Personality Talk, All News |
| `FMT_COMPETITION` | Spoken-news lane; CR adjacency |
| Industry event | 1990 unlock bundled with Sports Talk national launch |
| Lists | `TALK_FMTS`, election formats, AM survival pool, syndication (Drummond Hour), logos (`news` family) |
| `formatFamilies.v1.json` | Implemented SPOKEN family row |
| `formatLifecycle.v1.json` | Diagnostic lifecycle row (1990 emergence) |

## Success (manual)

- Format appears in picker after 1990
- AM MOR/News survivors can reformat into Conservative Talk
- Drummond Hour franchise eligible on Conservative Talk stations
- No regression to Spanish POC paths (`?proto=share+sac+spanish`)
