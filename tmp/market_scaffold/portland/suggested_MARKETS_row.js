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
    pop:{'12-17':260,'18-24':280,'25-34':310,'35-49':390,'50-64':330,'65+':200},
    revScale:1.38, adxBonus:0.025,
    // timezone:'America/Los_Angeles' — add to MARKETS when gameplay supports it
    amFreqs:['620 AM','750 AM','800 AM','860 AM','910 AM','970 AM','1010 AM','1080 AM','1150 AM','1190 AM','1230 AM','1330 AM'],
    fmFreqs:['88.3 FM','89.1 FM','89.9 FM','90.7 FM','91.5 FM','92.3 FM','93.1 FM','93.9 FM','94.7 FM','95.5 FM','97.1 FM','98.7 FM','99.5 FM','100.3 FM','101.1 FM','101.9 FM','103.3 FM','104.1 FM','105.1 FM','105.9 FM','106.7 FM','107.5 FM'],
    fmFacilityByFreq:{
      '88.3 FM':'3.5kw',
      '89.1 FM':'7.9kw',
      '89.9 FM':'5.9kw',
      '90.7 FM':'26.5kw',
      '91.5 FM':'73kw',
      '92.3 FM':'100kw',
      '93.1 FM':'1.6kw',
      '93.9 FM':'52kw',
      '94.7 FM':'6.3kw',
      '95.5 FM':'100kw',
      '97.1 FM':'100kw',
      '98.7 FM':'37kw',
      '99.5 FM':'52kw',
      '100.3 FM':'100kw',
      '101.1 FM':'100kw',
      '101.9 FM':'100kw',
      '103.3 FM':'100kw',
      '104.1 FM':'7kw',
      '105.1 FM':'22.5kw',
      '105.9 FM':'22.5kw',
      '106.7 FM':'100kw',
      '107.5 FM':'68kw',
    },
    blackPop:0.062,hispPop1970:0.04,hispPop2000:0.085,hispPop2020:0.125,churchGoing:0.34,countryBonus:0.07,urbanBonus:0.05,
    culture:{country:0.08,urban:0.06,newsTalk:0.1,religion:0.04,spanish:0.06},
    selectBlurb:'Pacific Northwest dial with strong OPB/NCE public radio, AAA and alternative heritage, and fragmented commercial FM — country and gospel stay thinner than Sunbelt markets, Spanish is present but modest, and indie/eclectic lanes compete with news/talk on AM big sticks.',
    fmPenBias:0.044, fmMusicFragMult:1.05, spokenWordAmResilience:1.04, heritageAmResilience:0.99, countryAmHoldout:0.9,
    eduIndex:1.14,
    publicCivicIndex:1.1,
    teams:[
      {id:'blazers',name:'Portland Trail Roses',sport:'PRO_BASKETBALL',introduced:1970,baseFee:115000,baseBonus:0.012,contractYrs:3},
      {id:'winterhawks',name:'Portland Winter Hawks',sport:'PRO_HOCKEY',introduced:1970,baseFee:75000,baseBonus:0.009,contractYrs:3}
    ],
  },

