/**
 * Suggested MARKETS row — scaffold v2 (DO NOT merge without human review)
 * City: Phoenix (phoenix) | template: sunbelt
 *
 * WARNING:
 * - amFreqs / fmFreqs / fmFacilityByFreq must be FCC-sourced (not template copy).
 * - revScale / adxBonus / teams fees need Nielsen and league research.
 * - Verify callPrefix, region, and timezone with real market geography.
 * - Run: npm run scaffold:market -- --city=phoenix --check
 */
  phoenix:{
    id:'phoenix', callPrefix:'K', label:'Phoenix', region:'Southwest', rankTier:'large', archetypeId:'sunbelt_diversified',
    pop:{'12-17':195,'18-24':220,'25-34':255,'35-49':280,'50-64':210,'65+':145},
    revScale:1.18, adxBonus:0.025,
    // timezone:'America/Phoenix' — add to MARKETS when gameplay supports it
    amFreqs:['550 AM','620 AM','660 AM','710 AM','860 AM','910 AM','960 AM','1010 AM','1060 AM','1100 AM','1150 AM','1230 AM'],
    fmFreqs:['88.3 FM','89.5 FM','91.5 FM','92.3 FM','93.3 FM','94.5 FM','95.5 FM','96.1 FM','96.9 FM','97.9 FM','98.7 FM','99.3 FM','99.9 FM','100.3 FM','100.7 FM','101.1 FM','102.5 FM','103.9 FM','104.7 FM','105.1 FM','105.9 FM','106.9 FM','107.9 FM'],
    fmFacilityByFreq:{
      '88.3 FM':'50kw',
      '89.5 FM':'100kw',
      '91.5 FM':'100kw',
      '92.3 FM':'100kw',
      '93.3 FM':'50kw',
      '94.5 FM':'50kw',
      '95.5 FM':'50kw',
      '96.1 FM':'100kw',
      '96.9 FM':'50kw',
      '97.9 FM':'50kw',
      '98.7 FM':'50kw',
      '99.3 FM':'50kw',
      '99.9 FM':'100kw',
      '100.3 FM':'100kw',
      '100.7 FM':'50kw',
      '101.1 FM':'50kw',
      '102.5 FM':'50kw',
      '103.9 FM':'50kw',
      '104.7 FM':'50kw',
      '105.1 FM':'50kw',
      '105.9 FM':'50kw',
      '106.9 FM':'50kw',
      '107.9 FM':'50kw',
    },
    blackPop:0.071,hispPop1970:0.085,hispPop2000:0.22,hispPop2020:0.301,churchGoing:0.46,countryBonus:0.09,urbanBonus:0.03,
    culture:{country:0.09,urban:0.03,newsTalk:0.07,religion:0.09,spanish:0.15},
    selectBlurb:'A fast-growing Southwest market where Spanish-language and country lanes matter more than coastal AAA or Deep South gospel clusters. Soul/R&B and urban formats exist but stay thinner than Atlanta; talk and sports ride commuter sprawl while FM keeps fragmenting.',
    fmPenBias:0.03, fmMusicFragMult:1.03, spokenWordAmResilience:0.98, heritageAmResilience:1, countryAmHoldout:1.06,
    eduIndex:0.93,
    publicCivicIndex:0.94,
    teams:[
      {id:'dbacks',name:'Phoenix Diamond Dust',sport:'PRO_BASEBALL',introduced:1998,baseFee:185000,baseBonus:0.016,contractYrs:3},
      {id:'cardinals',name:'Phoenix Cactus Cardinals',sport:'PRO_FOOTBALL',introduced:1988,baseFee:360000,baseBonus:0.026,contractYrs:4},
      {id:'suns',name:'Phoenix Solar Flares',sport:'PRO_BASKETBALL',introduced:1970,baseFee:120000,baseBonus:0.012,contractYrs:3},
      {id:'coyotes',name:'Phoenix Desert Coyotes',sport:'PRO_HOCKEY',introduced:1996,baseFee:95000,baseBonus:0.01,contractYrs:3}
    ],
  },

