/**
 * Suggested MARKETS row — scaffold v2 (DO NOT merge without human review)
 * City: Miami (miami) | template: sunbelt
 *
 * WARNING:
 * - amFreqs / fmFreqs / fmFacilityByFreq must be FCC-sourced (not template copy).
 * - revScale / adxBonus / teams fees need Nielsen and league research.
 * - Verify callPrefix, region, and timezone with real market geography.
 * - Run: npm run scaffold:market -- --city=miami --check
 */
  miami:{
    id:'miami', callPrefix:'W', label:'Miami', region:'Southeast', rankTier:'large', archetypeId:'sunbelt_diversified',
    pop:{'12-17':210,'18-24':245,'25-34':285,'35-49':340,'50-64':265,'65+':175},
    revScale:1.42, adxBonus:0.028,
    // timezone:'America/New_York' — add to MARKETS when gameplay supports it
    amFreqs:['560 AM','610 AM','680 AM','790 AM','880 AM','940 AM','1010 AM','1080 AM','1210 AM','1400 AM','1470 AM','1700 AM'],
    fmFreqs:['88.9 FM','89.7 FM','91.3 FM','92.3 FM','93.1 FM','94.1 FM','94.9 FM','95.7 FM','96.5 FM','97.3 FM','97.9 FM','98.3 FM','99.1 FM','100.3 FM','101.1 FM','101.5 FM','102.7 FM','103.5 FM','104.3 FM','105.1 FM','105.9 FM','106.7 FM','107.5 FM'],
    fmFacilityByFreq:{
      '88.9 FM':'25kw',
      '89.7 FM':'6kw',
      '91.3 FM':'100kw',
      '92.3 FM':'100kw',
      '93.1 FM':'50kw',
      '94.1 FM':'100kw',
      '94.9 FM':'50kw',
      '95.7 FM':'50kw',
      '96.5 FM':'100kw',
      '97.3 FM':'50kw',
      '97.9 FM':'50kw',
      '98.3 FM':'100kw',
      '99.1 FM':'50kw',
      '100.3 FM':'100kw',
      '101.1 FM':'50kw',
      '101.5 FM':'50kw',
      '102.7 FM':'50kw',
      '103.5 FM':'50kw',
      '104.3 FM':'50kw',
      '105.1 FM':'50kw',
      '105.9 FM':'100kw',
      '106.7 FM':'50kw',
      '107.5 FM':'50kw',
    },
    blackPop:0.185,hispPop1970:0.17,hispPop2000:0.36,hispPop2020:0.475,churchGoing:0.41,countryBonus:0.04,urbanBonus:0.11,
    culture:{country:0.04,urban:0.11,newsTalk:0.06,religion:0.07,spanish:0.28},
    selectBlurb:'A tropical Hispanic-major market where Spanish tropical and regional Mexican lanes dominate, urban and rhythmic CHR compete without Midwest sunbelt homogeneity, and fragmented FM keeps carving niches — country and gospel stay thin, public radio is modest (WLRN cluster), and AM still carries Cuban talk heritage.',
    fmPenBias:0.052, fmMusicFragMult:1.09, spokenWordAmResilience:1, heritageAmResilience:0.98, countryAmHoldout:0.86,
    eduIndex:0.91,
    publicCivicIndex:0.86,
    teams:[
      {id:'marlins',name:'Miami Coral Marlins',sport:'PRO_BASEBALL',introduced:1993,baseFee:195000,baseBonus:0.017,contractYrs:3},
      {id:'dolphins',name:'Miami Palm Dolphins',sport:'PRO_FOOTBALL',introduced:1970,baseFee:380000,baseBonus:0.027,contractYrs:4},
      {id:'heat',name:'Miami Heat Wave',sport:'PRO_BASKETBALL',introduced:1988,baseFee:135000,baseBonus:0.013,contractYrs:3},
      {id:'panthers',name:'Miami Everglades Panthers',sport:'PRO_HOCKEY',introduced:1993,baseFee:105000,baseBonus:0.011,contractYrs:3}
    ],
  },

