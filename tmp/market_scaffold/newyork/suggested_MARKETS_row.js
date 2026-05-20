/**
 * Suggested MARKETS row — scaffold v2 (DO NOT merge without human review)
 * City: New York (newyork) | template: northeast_mega
 *
 * WARNING:
 * - amFreqs / fmFreqs / fmFacilityByFreq must be FCC-sourced (not template copy).
 * - revScale / adxBonus / teams fees need Nielsen and league research.
 * - Verify callPrefix, region, and timezone with real market geography.
 * - Run: npm run scaffold:market -- --city=newyork --check
 */
  newyork:{
    id:'newyork', callPrefix:'W', label:'New York', region:'Northeast', rankTier:'mega', archetypeId:'northeast_mega',
    pop:{'12-17':1050,'18-24':1000,'25-34':1100,'35-49':1400,'50-64':1200,'65+':750},
    revScale:6.8, adxBonus:0.05,
    // timezone:'America/New_York' — add to MARKETS when gameplay supports it
    amFreqs:['660 AM','710 AM','770 AM','880 AM','1000 AM','1010 AM','1050 AM','1130 AM','1200 AM','1280 AM','1380 AM','1500 AM','1560 AM','1600 AM'],
    fmFreqs:['88.1 FM','89.3 FM','90.3 FM','91.5 FM','92.1 FM','92.3 FM','92.5 FM','93.1 FM','93.5 FM','93.9 FM','94.1 FM','94.7 FM','95.1 FM','95.5 FM','95.9 FM','96.3 FM','97.1 FM','97.5 FM','98.1 FM','98.7 FM','99.1 FM','100.3 FM','101.1 FM','102.7 FM','103.5 FM','104.3 FM','105.1 FM','106.7 FM','107.1 FM','107.9 FM'],
    fmFacilityByFreq:{
      '88.1 FM':'50kw',
      '89.3 FM':'50kw',
      '90.3 FM':'50kw',
      '91.5 FM':'50kw',
      '92.1 FM':'50kw',
      '92.3 FM':'50kw',
      '92.5 FM':'50kw',
      '93.1 FM':'100kw',
      '93.5 FM':'50kw',
      '93.9 FM':'50kw',
      '94.1 FM':'50kw',
      '94.7 FM':'50kw',
      '95.1 FM':'100kw',
      '95.5 FM':'50kw',
      '95.9 FM':'50kw',
      '96.3 FM':'100kw',
      '97.1 FM':'100kw',
      '97.5 FM':'50kw',
      '98.1 FM':'50kw',
      '98.7 FM':'100kw',
      '99.1 FM':'50kw',
      '100.3 FM':'100kw',
      '101.1 FM':'100kw',
      '102.7 FM':'100kw',
      '103.5 FM':'100kw',
      '104.3 FM':'100kw',
      '105.1 FM':'100kw',
      '106.7 FM':'100kw',
      '107.1 FM':'100kw',
      '107.9 FM':'50kw',
    },
    blackPop:0.21,hispPop1970:0.12,hispPop2000:0.22,hispPop2020:0.26,churchGoing:0.42,countryBonus:0,urbanBonus:0.14,
    culture:{country:0.008,urban:0.16,newsTalk:0.12,religion:0.06,spanish:0.14},
    selectBlurb:'The #1 radio market — fragmented FM, talk-heavy AM heritage, modest country, strong urban and Spanish lanes, and deep public/NCE capacity without coastal-west secular shape.',
    fmPenBias:0.055, fmMusicFragMult:1.06, spokenWordAmResilience:1.11, heritageAmResilience:1.08, countryAmHoldout:0.76,
    eduIndex:1.22,
    publicCivicIndex:1.08,
    teams:[
      {id:'yankees',name:'New York Cows',sport:'PRO_BASEBALL',introduced:1970,baseFee:520000,baseBonus:0.03,contractYrs:4},
      {id:'mets',name:'New York Pigeon Lords',sport:'PRO_BASEBALL',introduced:1970,baseFee:240000,baseBonus:0.018,contractYrs:3},
      {id:'giants_ny',name:'New York Commuter Rage',sport:'PRO_FOOTBALL',introduced:1970,baseFee:580000,baseBonus:0.032,contractYrs:4},
      {id:'jets',name:'New York Bodega Cats',sport:'PRO_FOOTBALL',introduced:1970,baseFee:380000,baseBonus:0.026,contractYrs:4},
      {id:'knicks',name:'New York Pizza Rats',sport:'PRO_BASKETBALL',introduced:1970,baseFee:220000,baseBonus:0.02,contractYrs:3},
      {id:'rangers',name:'New York Frost Giants',sport:'PRO_HOCKEY',introduced:1970,baseFee:180000,baseBonus:0.016,contractYrs:3}
    ],
  },

