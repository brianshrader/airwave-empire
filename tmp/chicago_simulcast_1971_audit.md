# Chicago simulcast economics audit (1970–71)

Pinned shares to match reported financials (~AM 3.9% / FM 1.2% Fall 1971).
Explicit star-model simulcast (AM source, FM receiver). Full `seedRev` path.

## 1971_FALL_user_shares_seedRev (1971 FALL)

- FCC max dup %: **50%** · FM dup clock fraction: **50%**
- Combined deduped share: **9.2%**
- FM rev before dedupe+pool: **$12K** → after seedRev: **$21K**
- AM rev before → after: **$110K** → **$321K**
- FM rev = **6.7%** of AM · FM cost = **21.5%** of AM

| Leg | Share | Rev | Cost | EBITDA | fix | tal | salesAdmin | opsFloor | promo | prog |
|-----|-------|-----|------|--------|-----|-----|------------|----------|-------|------|
| WJPQ | 3.9% | $321K | $532K | $-211K | $280K | $36K | $95K | $121K | $0K | $0K |
| WIEB | 1.2% | $21K | $115K | $-93K | $97K | $0K | $2K | $15K | $0K | $0K |
| **Combined** | 9.2% | $343K | $647K | $-304K | | | | | | |

## 1971_SPR_user_shares_seedRev (1971 SPRING)

- FCC max dup %: **50%** · FM dup clock fraction: **50%**
- Combined deduped share: **10.3%**
- FM rev before dedupe+pool: **$8K** → after seedRev: **$17K**
- AM rev before → after: **$124K** → **$457K**
- FM rev = **3.7%** of AM · FM cost = **19.8%** of AM

| Leg | Share | Rev | Cost | EBITDA | fix | tal | salesAdmin | opsFloor | promo | prog |
|-----|-------|-----|------|--------|-----|-----|------------|----------|-------|------|
| WPXN | 4.6% | $457K | $570K | $-113K | $280K | $31K | $135K | $121K | $0K | $0K |
| WWYX | 1.1% | $17K | $113K | $-96K | $96K | $0K | $2K | $15K | $0K | $0K |
| **Combined** | 10.3% | $474K | $683K | $-209K | | | | | | |

## 1970_FALL_user_shares_seedRev (1970 FALL)

- FCC max dup %: **50%** · FM dup clock fraction: **50%**
- Combined deduped share: **12.7%**
- FM rev before dedupe+pool: **$9K** → after seedRev: **$21K**
- AM rev before → after: **$142K** → **$604K**
- FM rev = **3.6%** of AM · FM cost = **20.7%** of AM

| Leg | Share | Rev | Cost | EBITDA | fix | tal | salesAdmin | opsFloor | promo | prog |
|-----|-------|-----|------|--------|-----|-----|------------|----------|-------|------|
| WTDD | 4.9% | $604K | $536K | $67K | $196K | $37K | $179K | $117K | $0K | $0K |
| WHGY | 1.1% | $21K | $111K | $-89K | $94K | $0K | $2K | $15K | $0K | $0K |
| **Combined** | 12.7% | $625K | $647K | $-22K | | | | | | |

## 1971_FALL_user_shares_calcRevOnly (1971 FALL)

- FCC max dup %: **50%** · FM dup clock fraction: **50%**
- Combined deduped share: **10.8%**
- FM rev = **10.4%** of AM · FM cost = **28%** of AM

| Leg | Share | Rev | Cost | EBITDA | fix | tal | salesAdmin | opsFloor | promo | prog |
|-----|-------|-----|------|--------|-----|-----|------------|----------|-------|------|
| WLMT | 3.9% | $103K | $405K | $-303K | $217K | $37K | $31K | $121K | $0K | $0K |
| WDRC | 1.2% | $11K | $114K | $-103K | $97K | $0K | $1K | $15K | $0K | $0K |
| **Combined** | 10.8% | $113K | $519K | $-406K | | | | | | |

## Diagnosis (code paths)

1. **Revenue**: Each leg bills from its own AQH/share. FM also gets `cpEraFactor` ≈ 0.15 in 1971 (FM ad market immature) + low-share sellout penalties.
2. **FM dedupe**: `applySimulcastCoownedFmRevenueDedupe` scales FM rev by `(1-dup)+dup×0.40`. Chicago 1971 max dup = **50%** → mult ≈ **0.70** on the duplicated slice.
3. **Costs**: Receiver uses `simulcastReceiverExpensePolicy` (~38% staff/fac, 30% ops floor, trimmed sales admin) but **talent stays on AM only**.
4. **Mismatch**: Ratings dedupe overlap (combined 4.7%) but revenue does not get a “one product” uplift on FM — FM is penalized twice (tiny leg share + dedupe + immature FM CPM era).