/**
 * Suggested MARKETS row — scaffold v2 (DO NOT merge without human review)
 * City: Portland (portland) | template: west_fm_fragmented
 *
 * WARNING:
 * - amFreqs / fmFreqs / fmFacilityByFreq must be FCC-sourced (not template copy).
 * - revScale / adxBonus / teams fees need Nielsen and league research.
 * - Verify callPrefix, region, and timezone with real market geography.
 * - Run: npm run scaffold:market -- --city=portland --check
 */
  portland:{
    id:'portland', callPrefix:'K', label:'Portland', region:'West Coast', rankTier:'large', archetypeId:'west_fm_fragmented',
    pop:{'12-17':320,'18-24':340,'25-34':380,'35-49':480,'50-64':400,'65+':240},
    revScale:1.55, adxBonus:0.025,
    // timezone:'America/Los_Angeles' — add to MARKETS when gameplay supports it
    amFreqs:['570 AM','800 AM','1000 AM','1090 AM','1150 AM','1180 AM','1250 AM','1300 AM','1420 AM','1500 AM'],
    fmFreqs:['92.5 FM','93.3 FM','93.7 FM','94.1 FM','94.9 FM','95.7 FM','96.5 FM','96.9 FM','97.1 FM','98.9 FM','99.1 FM','100.3 FM','101.1 FM','102.5 FM','103.3 FM','104.5 FM','105.9 FM','106.1 FM','107.7 FM'],
    fmFacilityByFreq:{
      '92.5 FM':'100kw',
      '93.7 FM':'100kw',
      '94.1 FM':'100kw',
      '96.5 FM':'100kw',
      '97.1 FM':'100kw',
      '98.9 FM':'100kw',
      '100.3 FM':'100kw',
      '104.5 FM':'100kw',
    },
    blackPop:0.09,hispPop1970:0.03,hispPop2000:0.09,hispPop2020:0.14,churchGoing:0.38,countryBonus:0.1,urbanBonus:0.06,
    culture:{country:0.12,urban:0.07,newsTalk:0.09,religion:0.05,spanish:0.08},
    selectBlurb:'TODO: West FM-fragmented — rock/alt heritage, educated listeners, competitive news.',
    fmPenBias:0.042, fmMusicFragMult:1.04, spokenWordAmResilience:1.05, heritageAmResilience:1, countryAmHoldout:0.95,
    eduIndex:1.12,
    publicCivicIndex:1.07,
    teams:[
      {id:'pro_baseball',name:'TODO MLB',sport:'PRO_BASEBALL',introduced:1977,baseFee:200000,baseBonus:0.018,contractYrs:3},
      {id:'pro_football',name:'TODO NFL',sport:'PRO_FOOTBALL',introduced:1976,baseFee:380000,baseBonus:0.027,contractYrs:4}
    ],
  },

