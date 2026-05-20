/**
 * Suggested MARKETS row — scaffold v2 (DO NOT merge without human review)
 * City: Nashville (nashville) | template: southern_country
 *
 * WARNING:
 * - amFreqs / fmFreqs / fmFacilityByFreq must be FCC-sourced (not template copy).
 * - revScale / adxBonus / teams fees need Nielsen and league research.
 * - Verify callPrefix, region, and timezone with real market geography.
 * - Run: npm run scaffold:market -- --city=nashville --check
 */
  nashville:{
    id:'nashville', callPrefix:'W', label:'Nashville', region:'South', rankTier:'medium', archetypeId:'southern_country',
    pop:{'12-17':95,'18-24':110,'25-34':120,'35-49':150,'50-64':125,'65+':75},
    revScale:0.5, adxBonus:0.03,
    // timezone:'America/Chicago' — add to MARKETS when gameplay supports it
    amFreqs:['650 AM','760 AM','800 AM','1000 AM','1040 AM','1160 AM','1240 AM','1300 AM','1400 AM','1470 AM','1510 AM','1560 AM'],
    fmFreqs:['88.3 FM','90.3 FM','91.1 FM','93.1 FM','94.1 FM','96.3 FM','97.9 FM','100.1 FM','100.3 FM','102.9 FM','103.3 FM','104.5 FM','105.1 FM','107.5 FM'],
    fmFacilityByFreq:{
      '88.3 FM':'50kw',
      '90.3 FM':'50kw',
      '91.1 FM':'50kw',
      '93.1 FM':'100kw',
      '94.1 FM':'100kw',
      '96.3 FM':'50kw',
      '97.9 FM':'100kw',
      '100.1 FM':'50kw',
      '100.3 FM':'50kw',
      '102.9 FM':'100kw',
      '103.3 FM':'50kw',
      '104.5 FM':'50kw',
      '105.1 FM':'50kw',
      '107.5 FM':'50kw',
    },
    blackPop:0.18,hispPop1970:0.008,hispPop2000:0.045,hispPop2020:0.095,churchGoing:0.58,countryBonus:0.18,urbanBonus:0.02,
    culture:{country:0.26,urban:0.03,newsTalk:0.04,religion:0.1,spanish:0.02},
    selectBlurb:'Grand Ole Opry country loyalty on AM and FM, gospel and CCM lanes stronger than coastal markets, thin Spanish, and medium-market dial depth without mega fragmentation.',
    fmPenBias:-0.058, fmMusicFragMult:0.96, spokenWordAmResilience:1, heritageAmResilience:1.06, countryAmHoldout:1.2,
    eduIndex:0.88,
    publicCivicIndex:0.96,
    teams:[
      {id:'sounds',name:'Nashville Hot Chicken',sport:'PRO_BASEBALL',introduced:1978,baseFee:28000,baseBonus:0.006,contractYrs:3},
      {id:'predators',name:'Nashville Catfish Rodeo',sport:'PRO_HOCKEY',introduced:1998,baseFee:115000,baseBonus:0.014,contractYrs:3},
      {id:'titans',name:'Tennessee Titan-Ups',sport:'PRO_FOOTBALL',introduced:1997,baseFee:340000,baseBonus:0.028,contractYrs:4}
    ],
  },

