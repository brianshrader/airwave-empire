# Large-market 1970 scaffold A/B (diagnostic)

Runs/market/variant: 30 · seed 20260603
Patch: `LARGE_MARKET_TOTAL_STATIONS_ANCHORS[1975]` only — mega anchors unchanged.

## Opening book (1970) by anchor variant

| Anchor | Market | Stations | Top-3 | Top-5 | Comm FM | FM adopt | Rock present | Rock share | Diversity |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | seattle | 10 | 61.9% | 88.8% | 1 | 12.5% | 0% | 0.0% | 5.54 |
| 10 | sanfrancisco | 10 | 62.1% | 89.1% | 1 | 12.5% | 0% | 0.0% | 5.50 |
| 10 | atlanta | 11 | 61.1% | 87.7% | 1 | 12.5% | 0% | 0.0% | 5.77 |
| 14 | seattle | 14 | 52.8% | 74.1% | 2 | 16.7% | 100% | 1.3% | 5.27 |
| 14 | sanfrancisco | 14 | 52.7% | 73.6% | 2 | 16.7% | 100% | 1.4% | 5.23 |
| 14 | atlanta | 15 | 52.3% | 73.0% | 2 | 16.7% | 100% | 1.3% | 5.41 |
| 16 | seattle | 16 | 52.0% | 72.2% | 4 | 28.6% | 100% | 3.1% | 5.49 |
| 16 | sanfrancisco | 16 | 51.6% | 71.7% | 4 | 28.6% | 100% | 3.1% | 5.47 |
| 16 | atlanta | 17 | 51.2% | 71.4% | 4 | 28.6% | 100% | 3.0% | 5.62 |
| 18 | seattle | 18 | 51.1% | 71.0% | 6 | 37.5% | 100% | 3.5% | 5.55 |
| 18 | sanfrancisco | 18 | 50.9% | 70.5% | 6 | 37.5% | 100% | 3.5% | 5.53 |
| 18 | atlanta | 19 | 50.7% | 70.1% | 6 | 37.5% | 100% | 3.5% | 5.70 |

## Mega reference (production scaffold)

| Market | Stations | Top-3 | Top-5 | FM adopt | Rock present |
| --- | ---: | ---: | ---: | ---: | ---: |
| newyork | 23 | 45.6% | 68.3% | 45.0% | 100% |
| losangeles | 22 | 42.1% | 64.0% | 45.0% | 100% |
| chicago | 24 | 46.8% | 66.2% | 45.0% | 100% |
| **Mega median** | — | 45.6% | 66.2% | 45.0% | 10000% |

## Long-run snapshots (median across markets)

### 1980
| Anchor | Top-3 μ | Top-5 μ | FM adopt μ | Rock present μ | HHI μ | Zombie μ | Spiral μ | Removed μ | OQ μ |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 38.1% | 55.3% | 35.7% | 100% | 917 | 0 | 2 | 0 | 73.0 |
| 14 | 30.5% | 45.5% | 33.3% | 100% | 710 | 0 | 3 | 0 | 73.5 |
| 16 | 28.6% | 43.3% | 40.0% | 100% | 651 | 0 | 3 | 0 | 72.2 |
| 18 | 27.2% | 40.3% | 45.5% | 100% | 606 | 0 | 4 | 0 | 70.0 |

### 1990
| Anchor | Top-3 μ | Top-5 μ | FM adopt μ | Rock present μ | HHI μ | Zombie μ | Spiral μ | Removed μ | OQ μ |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 37.1% | 54.5% | 52.6% | 100% | 808 | 0 | 4.5 | 0 | 66.7 |
| 14 | 34.7% | 50.7% | 47.8% | 100% | 728 | 0 | 6 | 0 | 64.0 |
| 16 | 32.4% | 48.6% | 52.0% | 100% | 682 | 0 | 7 | 0 | 63.1 |
| 18 | 31.5% | 46.0% | 55.6% | 100% | 653 | 0 | 8 | 0 | 61.9 |

### 2000
| Anchor | Top-3 μ | Top-5 μ | FM adopt μ | Rock present μ | HHI μ | Zombie μ | Spiral μ | Removed μ | OQ μ |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 36.7% | 53.9% | 57.1% | 100% | 799 | 0 | 6 | 0 | 62.5 |
| 14 | 34.6% | 51.2% | 54.2% | 100% | 734 | 0 | 9 | 1 | 60.3 |
| 16 | 32.9% | 47.1% | 57.7% | 100% | 683 | 0 | 9 | 2 | 61.5 |
| 18 | 32.0% | 47.3% | 61.5% | 100% | 663 | 0 | 8.5 | 4 | 62.3 |

## Cluster cohesion (Seattle ≈ Atlanta ≈ SF?)

- Anchor **10**: top-3 spread 1.0% · rock-presence spread 0%
- Anchor **14**: top-3 spread 0.5% · rock-presence spread 0%
- Anchor **16**: top-3 spread 0.8% · rock-presence spread 0%
- Anchor **18**: top-3 spread 0.4% · rock-presence spread 0%

## Answers

1. **Rock/FM from anchor alone?** Mostly yes at anchor≥14
2. **Concentration → mega at anchor 18?** SF top-3 50.9% vs mega med 45.6% — partial/no
3. **SF still wrong at 18?** rock present 100%, FM 37.5%, still tracks Seattle (true)
4. **SF gap at 18:** {"rockPresence":1,"fmAdoption":0.375,"diversity":5.533887520209865,"megaRockPresence":1,"deltaTop3VsMega":0.05370873999999992}
5. **Best anchor tradeoff:** {"anchor":18,"score":2.51562818,"rockPresence":1,"top3":0.5093718199999999,"fm":0.375}

## Recommendation hierarchy: **D**

Mixed — see per-metric table; may need blueprint/ecology layer beyond anchor count.
