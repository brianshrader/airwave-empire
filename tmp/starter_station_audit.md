# Starter Station Audit — Large Market Survival Root Cause

Opening runs: 1/market/year · Snowball: 18/market/anchor · seed 20260608 · pre-turn open share in snowball

## 1–3. Opening position (anchor 10 production dial)
| Market | Year | Comm | Med share | Med rank | Med rev | Med EBITDA |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| newyork | 1970 | 20 | 6.9% | #5 | $615,810 | $184,264 |
| newyork | 1985 | 31 | 0.9% | #25 | $37,571 | $-803,904 |
| newyork | 2000 | 35 | 0.6% | #6 | $1,218,779 | $-553,637 |
| losangeles | 1970 | 20 | 5.2% | #8 | $451,451 | $58,999 |
| losangeles | 1985 | 32 | 1.2% | #25 | $62,234 | $-1,057,858 |
| losangeles | 2000 | 36 | 0.4% | #31 | $32,295 | $-982,592 |
| chicago | 1970 | 20 | 7.2% | #4 | $460,357 | $12,222 |
| chicago | 1985 | 31 | 0.8% | #27 | $19,584 | $-899,076 |
| chicago | 2000 | 37 | 0.6% | #31 | $38,926 | $-1,768,838 |
| seattle | 1970 | 14 | 8.6% | #6 | $526,723 | $170,496 |
| seattle | 1985 | 25 | 1.0% | #22 | $40,299 | $-503,678 |
| seattle | 2000 | 27 | 0.7% | #23 | $127,080 | $-642,273 |
| sanfrancisco | 1970 | 14 | 4.9% | #7 | $195,912 | $-18,301 |
| sanfrancisco | 1985 | 26 | 1.5% | #21 | $133,153 | $-531,266 |
| sanfrancisco | 2000 | 28 | 0.4% | #25 | $58,639 | $-588,291 |
| atlanta | 1970 | 14 | 8.1% | #6 | $395,665 | $159,791 |
| atlanta | 1985 | 25 | 1.0% | #22 | $49,872 | $-317,411 |
| atlanta | 2000 | 27 | 0.7% | #23 | $87,477 | $-555,423 |
| nashville | 1970 | 13 | 4.9% | #7 | $103,301 | $-30,978 |
| nashville | 1985 | 21 | 2.5% | #17 | $164,432 | $-369,717 |
| nashville | 2000 | 21 | 0.7% | #17 | $60,831 | $-384,446 |
| wichita | 1970 | 8 | 15.0% | #4 | $358,829 | $133,629 |
| wichita | 1985 | 12 | 6.8% | #8 | $463,362 | $-163,776 |
| wichita | 2000 | 20 | 1.7% | #20 | $207,380 | $-446,612 |

## 4. Anchor 10 vs 16 @ 1970 (large markets)
- **seattle:** Same blueprint spec: **true** · commercial count 14→14 · share 8.7%→5.1% · rank #6→#7
- **sanfrancisco:** Same blueprint spec: **true** · commercial count 14→14 · share 5.0%→8.6% · rank #7→#7
- **atlanta:** Same blueprint spec: **true** · commercial count 14→14 · share 8.8%→4.9% · rank #5→#7

## 5–6. Survival correlation & thresholds (large-market snowball)
- Pearson(open share, surv@2000): **0.714**
- Pearson(share rank, surv@2000): **-0.339**
- Anchor 10 survival: **66.7%** (pooled large)
- Anchor 16 survival: **64.8%**

### Share bins → survival @2000 (anchor 16)
- 6.5%–8.0%: 26.9% (26 runs)
- 8.0%–100.0%: 100.0% (28 runs)

## Answer

B — insufficient opening audience share (competitive dilution), not a different starter station asset. Same BP slot 1 (AM TOP40 50kw strong); anchor 16 adds competitors and cuts share/revenue rank; survival tracks share/rank strongly.

Median opening share: A10 **10.3%** · A16 **10.1%**
Median share @2000: survivors A16 **12.8%** · failures A16 **7.5%**
