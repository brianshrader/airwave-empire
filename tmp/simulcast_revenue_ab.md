# Simulcast revenue A/B harness

VM-only patches — **not shipped** to production.

| Variant | Description |
|---------|-------------|
| **CURRENT** | Production (FM dedupe + per-leg billing) |
| **A** | Post-`seedRev` cluster allocation — FM target ≈ (20% + era×15%) of AM billings |
| **D** | Skip `applySimulcastCoownedFmRevenueDedupe` for explicit programming receivers |

## Pinned Chicago scenarios (explicit AM/FM simulcast)

| Scenario | Variant | FM rev % AM | FM EBITDA | Combined EBITDA | AM EBITDA |
|----------|---------|-------------|-----------|-----------------|-----------|
| chicago_1971_fall_user_shares | CURRENT | 6% | $-93K | $-240K | $-147K |
| chicago_1971_fall_user_shares | A | 24.4% | $-45K | $-216K | $-171K |
| chicago_1971_fall_user_shares | D | 7.9% | $-86K | $-219K | $-132K |
| chicago_1971_spring | CURRENT | 3.6% | $-92K | $-45K | $47K |
| chicago_1971_spring | A | 24.9% | $-2K | $-25K | $-24K |
| chicago_1971_spring | D | 5.1% | $-84K | $-37K | $47K |
| chicago_1970_fall | CURRENT | 3.4% | $-94K | $-132K | $-37K |
| chicago_1970_fall | A | 24% | $-24K | $-116K | $-92K |
| chicago_1970_fall | D | 4.9% | $-88K | $-124K | $-36K |

## Chicago Fall 1971 — delta vs CURRENT

### Variant A

- FM rev as % of AM: **+18.4 pp**
- FM EBITDA: **$48K** (52% of FM deficit closed)
- Combined EBITDA: **$24K**

### Variant D

- FM rev as % of AM: **+1.9000000000000004 pp**
- FM EBITDA: **$7K** (7% of FM deficit closed)
- Combined EBITDA: **$21K**

## AI co-owned pair adoption survey

Co-owned AM+FM clusters (corp or indie licensee). Compares explicit simulcast vs separate programming EBITDA.

| Market / Year | Variant | Pairs | % attractive | % mandatory | Median FM rev % AM |
|---------------|---------|-------|--------------|-------------|-------------------|
| chicago_1971 | CURRENT | 3/3 | 33.3% | 0% | 7.9% |
| chicago_1971 | A | 3/3 | 33.3% | 0% | 7.9% |
| chicago_1971 | D | 3/3 | 33.3% | 0% | 7.9% |
| chicago_1975 | CURRENT | 2/2 | 0% | 0% | 5.3% |
| chicago_1975 | A | 2/2 | 0% | 0% | 5.3% |
| chicago_1975 | D | 2/2 | 0% | 0% | 5.3% |
| chicago_1980 | CURRENT | 0/0 | —% | —% | —% |
| chicago_1980 | A | 0/0 | —% | —% | —% |
| chicago_1980 | D | 0/0 | —% | —% | —% |
| atlanta_1971 | CURRENT | 1/1 | 0% | 0% | 11.5% |
| atlanta_1971 | A | 1/1 | 0% | 0% | 11.5% |
| atlanta_1971 | D | 1/1 | 0% | 0% | 11.5% |
| atlanta_1975 | CURRENT | 1/1 | 0% | 0% | 1.9% |
| atlanta_1975 | A | 1/1 | 0% | 0% | 1.9% |
| atlanta_1975 | D | 1/1 | 0% | 0% | 1.9% |
| atlanta_1980 | CURRENT | 0/0 | —% | —% | —% |
| atlanta_1980 | A | 0/0 | —% | —% | —% |
| atlanta_1980 | D | 0/0 | —% | —% | —% |
| dallas_1971 | CURRENT | 0/0 | —% | —% | —% |
| dallas_1971 | A | 0/0 | —% | —% | —% |
| dallas_1971 | D | 0/0 | —% | —% | —% |
| dallas_1975 | CURRENT | 1/1 | 100% | 100% | 83.8% |
| dallas_1975 | A | 1/1 | 100% | 100% | 83.8% |
| dallas_1975 | D | 1/1 | 100% | 100% | 83.8% |
| dallas_1980 | CURRENT | 1/1 | 100% | 100% | 145.5% |
| dallas_1980 | A | 1/1 | 100% | 100% | 145.5% |
| dallas_1980 | D | 1/1 | 100% | 100% | 145.5% |

## Interpretation notes

- Pinned scenarios: explicit star-model simulcast, shares fixed, full seedRev path.
- Variant A uses production applySimulcastClusterRevenueAllocation (CURRENT/D disable via G._wlDisableSimulcastClusterAlloc).
- Variant D: skip FM revenue dedupe for explicit programming receivers only.
- Adoption survey: co-owned AI AM+FM pairs (corp or indie licensee); simulcast vs separate EBITDA.
- attractive = simulcast uplift > $5K and not worse than AM-only by > $35K; mandatory = uplift > $25K and beats AM-only by > $5K.

**Design targets (1971 simulcast):** FM rev ~15–25% of AM; FM cost ~15–22% of AM; combined EBITDA within ~$50K of AM-only in Fall 1971.
