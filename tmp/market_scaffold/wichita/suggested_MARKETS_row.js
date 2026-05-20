/**
 * Suggested MARKETS row — scaffold v2 (DO NOT merge without human review)
 * City: Wichita (wichita) | template: midwest_legacy
 *
 * WARNING:
 * - amFreqs / fmFreqs / fmFacilityByFreq must be FCC-sourced (not template copy).
 * - revScale / adxBonus / teams fees need Nielsen and league research.
 * - Verify callPrefix, region, and timezone with real market geography.
 * - Run: npm run scaffold:market -- --city=wichita --check
 */
  wichita:{
    id:'wichita', callPrefix:'K', label:'Wichita', region:'Midwest', rankTier:'small', archetypeId:'midwest_legacy',
    pop:{'12-17':52,'18-24':60,'25-34':66,'35-49':82,'50-64':68,'65+':42},
    revScale:0.32, adxBonus:0.025,
    // timezone:'America/Chicago' — add to MARKETS when gameplay supports it
    amFreqs:['900 AM','1070 AM','1240 AM','1330 AM','1410 AM'],
    fmFreqs:['88.7 FM','91.5 FM','92.3 FM','93.9 FM','94.5 FM','95.1 FM','96.7 FM','97.3 FM','98.1 FM','99.9 FM','100.1 FM','101.9 FM','102.7 FM','103.1 FM','104.5 FM','105.3 FM','105.9 FM','106.5 FM','107.1 FM','107.9 FM'],
    fmFacilityByFreq:{
      '88.7 FM':'50kw',
      '91.5 FM':'50kw',
      '92.3 FM':'50kw',
      '93.9 FM':'50kw',
      '94.5 FM':'50kw',
      '95.1 FM':'100kw',
      '96.7 FM':'50kw',
      '97.3 FM':'50kw',
      '98.1 FM':'50kw',
      '99.9 FM':'100kw',
      '100.1 FM':'50kw',
      '101.9 FM':'50kw',
      '102.7 FM':'50kw',
      '103.1 FM':'50kw',
      '104.5 FM':'50kw',
      '105.3 FM':'50kw',
      '105.9 FM':'100kw',
      '106.5 FM':'50kw',
      '107.1 FM':'50kw',
      '107.9 FM':'50kw',
    },
    blackPop:0.11,hispPop1970:0.02,hispPop2000:0.08,hispPop2020:0.16,churchGoing:0.52,countryBonus:0.1,urbanBonus:0.03,
    culture:{country:0.14,urban:0.04,newsTalk:0.05,religion:0.09,spanish:0.04},
    selectBlurb:'Small Great Plains market — country and classic rock on AM heritage, thin Spanish, modest public/NCE, and AM-to-FM blueprint shifts on a tight five-stick AM dial.',
    fmPenBias:-0.04, fmMusicFragMult:0.98, spokenWordAmResilience:1.02, heritageAmResilience:1.04, countryAmHoldout:1.05,
    eduIndex:0.9,
    publicCivicIndex:0.94,
    teams:[
      {id:'wingnuts',name:'Wichita Wind Socks',sport:'PRO_BASEBALL',introduced:1970,baseFee:12000,baseBonus:0.004,contractYrs:3}
    ],
  },

