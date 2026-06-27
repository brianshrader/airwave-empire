# Commercial CCM — Implementation Spec (Bundle A step 3)

**Status:** Implemented on `main`  
**Scope:** Playable **CHRISTIAN** (`FM.CHRISTIAN`) — commercial Contemporary Christian AC/CHR, distinct from **GOSPEL** and **RELIGIOUS_NETWORK**  
**Out of scope:** Supply anchors, scalar calibration (D5), Spanish promotion (step 4), FORMAT_SUNSET / purge

---

## Design questions (answered before code)

### What audience does Commercial CCM serve?

Suburban and Sunbelt **evangelical-adjacent 18–49**, especially women 25–49 and families: contemporary Christian AC/CHR (worship-pop, rock-lean CCM), church-adjacent but **not** Black gospel heritage. Strong in Nashville, Atlanta, Dallas, Phoenix, Wichita, Raleigh-class markets — weak in secular coastal metros.

### What audience does institutional CCM serve?

Same broad **Christian music appetite**, but delivered as **non-commercial network CHR** (K-LOVE / Air1-style): donation-funded, no spot load, national brand, reserved-band / NCE footprint. Skews slightly younger in the sim demo table; ratings weight grows with `religiousNetworkEraMult` post-2005.

### How do they compete?

| Layer | Commercial CHRISTIAN | Institutional RELIGIOUS_NETWORK |
|-------|---------------------|--------------------------------|
| Economics | Spot revenue, CPM ~0.88 | No terrestrial ads |
| Dial | Commercial FM (and some AM) | Institutional spawn plan, NCE-capable |
| Ratings | Full `appl` + promo stack | Parallel institutional audience path |
| Player | Selectable, ownable | Rival-only |

They **share listening occasions** (Christian music dayparts) but **not ownership or revenue models**. Ecology lane IDs remain **separate** (`CHRISTIAN` vs `GOSPEL` vs institutional excluded from commercial peer counts).

### When does the institutional network overwhelm local commercial operators?

**Post-2005**, as `religiousNetworkEraMult` rises and slot count grows (mega 1–3, large 1–2). Overwhelming is modeled as **commercial viability pressure on new entrants**, not format death:

- AI greenfield launch weight damped (`aiChristianFormatPlausibilityMult`)
- New stations: light revenue viability + audience spillover mults when `relN ≥ 1`
- **Heritage stations** (launched ≤2004 or ≥8 sim-years on format): **exempt** from decline mechanics

Nashville/Dallas/Atlanta can support **both** a flagship institutional signal and a heritage commercial CCM into the 2010s; launching a **third** commercial CCM in the 2020s should be rare.

### Does Commercial CCM decline nationally after K-LOVE, or merely become harder to launch?

**Harder to launch, not audience-collapse sunset.** No `FORMAT_SUNSET`, no `fmt_purge`, no MOR-style extinction. Lifecycle row `CCM` keeps moderate `modernRetention` (0.65) — diagnostic, not a forced ratings cliff.

| Era | Behavior |
|-----|----------|
| 1990–2004 | Launch window — CCM spreads on commercial FM |
| 2005–2012 | Institutional era mult rises; greenfield damp |
| 2013+ | New commercial CCM launches progressively harder; heritage operators can still win |

### Mechanism choice (research conclusion)

| System | Used? | Role |
|--------|-------|------|
| Blueprint birth rates | No change in Bundle A | Supply branch deferred |
| **AI launch desirability** | **Yes** | Primary greenfield gate post-2005 |
| **Revenue viability (calcRev)** | **Yes** | New entrants only; simulates advertiser/programmer caution |
| **Audience spillover (appl)** | **Yes** | Light mult for non-heritage vs institutional count |
| Ownership ecology | No | Deferred |
| Competitive pressure (FMT_COMPETITION) | Yes | Adjacency vs AC, Hot AC, Gospel, institutional lane |
| Heritage exemption | **Yes** | `christianCommercialIsHeritageStation()` |

---

## Gameplay surface

| System | Change |
|--------|--------|
| `FM.CHRISTIAN` | Commercial CCM, unlock **1990**, FM-first |
| `FA.CHRISTIAN` | 18–49 suburban skew |
| `DRIFT.CHRISTIAN` | Worship AC ↔ Rock Edge |
| `christianCommercialMarketFit01` | Sunbelt / `ccmStrength` ecology fit |
| `aiChristianFormatPlausibilityMult` | Institutional crowding → greenfield damp |
| `christianCommercialRevenueViabilityMult` | New entrants only, post-2008 |
| `christianCommercialInstitutionalAudienceMult` | New entrants only, light appl damp |
| Industry event | ~1992 Christian AC mainstream wave |
| `formatFamilies.v1.json` | `CHRISTIAN` promoted planned → implemented |
| `formatLifecycle.v1.json` | `CCM` row notes updated |

## Success (manual)

- Picker shows Christian after 1990 in Nashville / Atlanta / Dallas
- Institutional network still spawns independently
- Heritage CCM station started in 1995 still viable in 2018+
- AI rarely greenfields CHRISTIAN in 2020+ when market already has 2+ institutional signals
- Gospel and Christian coexist in Atlanta without shared ecology lane crowding
