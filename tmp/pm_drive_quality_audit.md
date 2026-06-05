# PM Drive Quality Audit

Generated: 2026-06-01T04:01:55.285Z

## Config

- Runs: 6
- Markets: newyork, losangeles, chicago, seattle, sanfrancisco, atlanta, nashville, wichita
- Window: 1970 → 2021

## Top causes of PM (afternoonDrive) increases

| Source tag | # inc events | ΣΔQ | jump→98 | jump→99 | jump→100 |
| --- | ---: | ---: | ---: | ---: | ---: |
| decay | 32312 | 169011.89 | 3917 | 876 | 0 |
| advTurn_net | 50317 | 168290.75 | 3620 | 1139 | 0 |
| runAI | 56582 | 139395.86 | 330 | 2850 | 19001 |

## PM exact elite hits

- PM ending at exactly 98: 44144
- PM ending at exactly 99: 5161
- PM ending at exactly 100: 19001

## Median ΔQ per-period by source (PM vs Morning vs Midday)

### decay
- morning: n=111148 medΔ=-0.5887900875243073
- midday: n=105258 medΔ=-0.42503416680957073
- pm: n=110801 medΔ=-0.6000559104223271

### runAI
- morning: n=69888 medΔ=2.1000000000000085
- midday: n=51006 medΔ=2.1543157367268577
- pm: n=68338 medΔ=1.8598781978944317

### advTurn_net
- morning: n=96380 medΔ=0.14699999999999136
- midday: n=92852 medΔ=-0.16799999999999216
- pm: n=95868 medΔ=0.12600000000000477
