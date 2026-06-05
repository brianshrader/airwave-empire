# PM Drive Quality A/B

Generated: 2026-06-01T04:25:46.875Z

**Recommendation:** variant **F**

Variant F (B + decay 0.040) if E still leaves PM 98+ elevated; decay-only (C) is insufficient alone per measurements.

## Root cause

runAI() maintenance bumps (p.ms → +1..4, cap 100) on AI stations saturate afternoonDrive at 100; lower PM decay (0.030 vs 0.035/0.040) and cohost/reveal additive gains sustain 98–99 band. Morning/Midday share runAI bumps but lack PM cohost strength and have equal/higher decay — inflation is PM-specific at 98+.

Root cause confirmed by measurement: **yes**

## Variant definitions

- **A**: Baseline — revert production E (decay .030, uncapped runAI bump)
- **B**: Ceiling only — production ceiling with decay reverted to .030
- **C**: Decay .040 only — revert ceiling, no cohost change
- **D**: Remove PM cohost strength — revert production E mechanics
- **E**: Production — talent-supported AI PM ceiling + afternoonDrive decay .035
- **F**: Stronger decay — production ceiling + afternoonDrive decay .040

## Comparison (2020 snapshot, pooled across markets/runs)

| Var | PM 90+ | PM 95+ | PM 98+ | Low-talent PM≥95 | runAI→100 | exact 98/99/100 | Mean OQ | 95–99 OQ | Zombies | Spirals | Cert proxy |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| A | 41.6% | 37.77% | 36.11% | 75 | 9659 | 22554/2573/9661 | 66.91 | 18.33% | 134 | 159 | 67.84% |
| E | 37.31% | 34.79% | 0.84% | 82 | 9 | 15774/943/9 | 66.28 | 18.85% | 151 | 170 | 67.4% |
| F | 33.39% | 29.79% | 0.82% | 120 | 1 | 7592/31/1 | 65.2 | 18.74% | 138 | 178 | 64.51% |

## PM 98+ by decade (pooled)

| Var | 1980 | 1990 | 2000 | 2010 | 2020 |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 38.48% | 27.45% | 29.44% | 31.08% | 36.11% |
| E | 2.26% | 1.63% | 0.76% | 0.78% | 0.84% |
| F | 2.47% | 1.14% | 1.36% | 0.62% | 0.82% |

## Prime daypart 98+ at 2020

| Var | Morning | Midday | PM |
| --- | ---: | ---: | ---: |
| A | 0.67% | 0.5% | 36.11% |
| E | 0.84% | 0.5% | 0.84% |
| F | 1.47% | 0.65% | 0.82% |

## Production patch locations

- `src/legacy.js` ~~18031: runAI maintenance bump: if(Math.random()<p.ms) sd.quality=Math.min(100, sd.quality+rnd(1,4))
- `src/legacy.js` ~~16723: decay rates: afternoonDrive 0.030 vs morning 0.035 vs midday 0.040
- `src/legacy.js` ~~3616: COHOST_SLOT_STRENGTH afternoonDrive 0.42 (midday 0)
- `src/legacy.js` ~~3796-3811: applyCoHostChemistryRevealDecayStep adds slot Q

## Morning/Midday

Morning/Midday receive the same runAI maintenance bump; audit shows far lower 98+ rates because decay is higher (midday) and PM-only cohost/reveal mechanics are absent. Soft ceiling could be generalized later but is not required for Morning/Midday 98+ saturation today.