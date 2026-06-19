/** Shared helpers for share concentration diagnostics (research only). */

export const DUNCAN_AQH_ENVELOPES = {
  newyork: {
    1995: { share1: [5, 7.5], top3: [13, 18], ge10: [0, 0], ge6: [2, 4], note: 'Fragmented mega; Z100/WLTW era ~5–6 leaders' },
    2003: { share1: [5.5, 7], top3: [14, 19], ge10: [0, 0], ge6: [2, 5], note: 'WLTW 6.6 #1; WINS/WQHT ~4–5' },
    2005: { share1: [5.5, 7.5], top3: [14, 20], ge10: [0, 0], ge6: [2, 5], note: 'Proxy from Duncan 2000–03 mega fragmentation' },
    2010: { share1: [5.5, 7.5], top3: [14, 20], ge10: [0, 0], ge6: [2, 5], note: 'Duncan ends 2003; extrapolated mega envelope' },
    2020: { share1: [5, 7], top3: [13, 18], ge10: [0, 0], ge6: [2, 4], note: 'Post-Duncan extrapolation — tight mega ceiling ~8 historical max' },
  },
  nashville: {
    1995: { share1: [12, 16], top3: [28, 38], ge10: [2, 4], ge6: [4, 8], note: 'WSIX 14.5; WRVW 12.0 — country peak era' },
    2003: { share1: [7, 9], top3: [18, 24], ge10: [0, 1], ge6: [3, 6], note: 'WRVW 7.9 #1; fragmented medium market' },
    2005: { share1: [7, 10], top3: [18, 26], ge10: [0, 1], ge6: [3, 6], note: 'Post-peak country; Duncan 2003-shaped' },
    2010: { share1: [7, 10], top3: [18, 26], ge10: [0, 2], ge6: [3, 6], note: 'Medium market allows higher than mega but not 1995 peaks' },
    2020: { share1: [6, 9], top3: [16, 24], ge10: [0, 1], ge6: [2, 5], note: 'Further fragmentation expected' },
  },
};

export const LAYER_LABELS = {
  L1_postCohort: 'After cohort appeal + bleed + cap + momentum',
  L2_postLongTail: 'After commercial long-tail smoothing',
  L3_postHabitReconcile: 'After public habit denominator reconcile',
  L4_postOtherAudio: 'After otherAudio dilution (leader relief applied here)',
  L5_postListeningHours: 'After applyListeningHoursShareFromAqh',
  L6_postTrimBoost: 'After Top40 trim + Spanish leader boost',
  L7_postSanitize: 'After commercial outlier sanitize',
  L8_final: 'Final recalc output (pre daypart)',
};

const DECOMP_SNIPPET = `
function diagShareDecompCommercialMetrics(stations,G){
  var comm=(stations||[]).filter(function(s){
    return s&&!s._bpSlotDeferred&&typeof stationIsNoncommercialInstitutional==='function'
      &&!stationIsNoncommercialInstitutional(s)&&s.rat&&typeof s.rat.share==='number';
  });
  var shares=comm.map(function(s){return Number(s.rat.share)||0;}).filter(function(x){return x>=0;});
  shares.sort(function(a,b){return b-a;});
  var sh1=shares[0]||0,sh2=shares[1]||0,sh3=shares[2]||0;
  var top3=0,top5=0,hhi=0,ge6=0,ge8=0,ge10=0,i;
  for(i=0;i<shares.length;i++){
    if(i<3)top3+=shares[i];
    if(i<5)top5+=shares[i];
    hhi+=shares[i]*shares[i];
    if(shares[i]>=0.06)ge6++;
    if(shares[i]>=0.08)ge8++;
    if(shares[i]>=0.10)ge10++;
  }
  var med=0;
  if(shares.length){
    var mid=Math.floor(shares.length/2);
    med=shares.length%2?shares[mid]:(shares[mid-1]+shares[mid])/2;
  }
  return {
    nComm:comm.length,share1:sh1,share2:sh2,share3:sh3,top3:top3,top5:top5,
    hhi:Math.round(hhi*10000),ge6:ge6,ge8:ge8,ge10:ge10,median:med,
    bookSum:shares.reduce(function(a,b){return a+b;},0),
    leadFormat:(function(){
      if(!comm.length)return '';
      var sorted=comm.slice().sort(function(a,b){return (b.rat.share||0)-(a.rat.share||0);});
      return String(sorted[0].format||'');
    })(),
  };
}
function diagShareDecompCapture(G,layer){
  if(!G._shareDecompActive)return;
  if(!G._shareDecompLayers)G._shareDecompLayers=[];
  var m=diagShareDecompCommercialMetrics(G.stations,G);
  m.layer=layer;
  m.otherAudioF=G._otherAudioShareLast;
  m.otherAudioLeaderRelief=G._otherAudioLeaderReliefLast;
  m.otherAudioNonLeaderBoost=G._otherAudioNonLeaderBoostLast;
  G._shareDecompLayers.push(m);
}
`;

export function injectHeadlessLaunchNewsGuard(src) {
  return src
    .replace(
      'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    )
    .replace(
      'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    )
    .replace(
      'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
      'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
    );
}

export function patchLegacyForShareDecomp(src) {
  if (!src.includes('function diagShareDecompCapture(G,layer)')) {
    src = src.replace(
      'function recalc(stations,G){\n  ensurePublicNceTiersForGame(G);',
      `${DECOMP_SNIPPET}\nfunction recalc(stations,G){\n  if(G._shareDecompActive)G._shareDecompLayers=[];\n  ensurePublicNceTiersForGame(G);`,
    );
  }

  const hooks = [
    [
      "wlCommercialMassProbe(stations,G,'recalc:postCohort');",
      "wlCommercialMassProbe(stations,G,'recalc:postCohort');\n  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L1_postCohort');",
    ],
    [
      '  // Reconcile overall rat.share with PUBLIC_NEWS habit weighting after commercial long-tail (if any).',
      "  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L2_postLongTail');\n  // Reconcile overall rat.share with PUBLIC_NEWS habit weighting after commercial long-tail (if any).",
    ],
    [
      '  // Sports rights: scale cohort shares + AQH + mom so weighted share matches getSportsBonus (internal consistency)',
      "  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L3_postHabitReconcile');\n  // Sports rights: scale cohort shares + AQH + mom so weighted share matches getSportsBonus (internal consistency)",
    ],
    [
      '  applyOtherAudioListeningDilution(stations,G,engageWeightedPop);',
      "  applyOtherAudioListeningDilution(stations,G,engageWeightedPop);\n  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L4_postOtherAudio');",
    ],
    [
      '  applyListeningHoursShareFromAqh(stations,G);\n  wlCommercialMassProbe(stations,G,\'recalc:postAqh1\');',
      "  applyListeningHoursShareFromAqh(stations,G);\n  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L5_postListeningHours');\n  wlCommercialMassProbe(stations,G,'recalc:postAqh1');",
    ],
    [
      '    wlEnsureCommercialRatingsHaveAqhMass(stations,G);\n  }',
      "    wlEnsureCommercialRatingsHaveAqhMass(stations,G);\n  }\n  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L6_postTrimBoost');",
    ],
    [
      '  wlSanitizeCommercialBookShareOutliers(stations,G);',
      "  wlSanitizeCommercialBookShareOutliers(stations,G);\n  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L7_postSanitize');",
    ],
    [
      '  recalcDaypartAudience(stations,G);\n}',
      "  if(G._shareDecompActive&&typeof diagShareDecompCapture==='function')diagShareDecompCapture(G,'L8_final');\n  recalcDaypartAudience(stations,G);\n}",
    ],
  ];

  for (const [needle, repl] of hooks) {
    if (!src.includes(repl) && src.includes(needle)) src = src.replace(needle, repl);
  }
  return src;
}

export function patchPostL1Skips(src) {
  if (!src.includes('G._diagSkipLongTail')) {
    src = src.replace(
      'if (comm.length >= 2 && !G._modernColdStartIncumbentRecalc) {',
      'if (comm.length >= 2 && !G._modernColdStartIncumbentRecalc && !G._diagSkipLongTail) {',
    );
  }
  if (!src.includes('G._diagSkipOtherAudio')) {
    src = src.replace(
      'function applyOtherAudioListeningDilution(stations,G,engageWeightedPop){\n  const mktId=',
      'function applyOtherAudioListeningDilution(stations,G,engageWeightedPop){\n  if(G._diagSkipOtherAudio)return;\n  const mktId=',
    );
  }
  if (!src.includes('G._diagSkipListeningHours')) {
    src = src.replace(
      'function applyListeningHoursShareFromAqh(stations,G,opts){',
      'function applyListeningHoursShareFromAqh(stations,G,opts){\n  if(G&&G._diagSkipListeningHours)return;',
    );
  }
  if (!src.includes('G._diagSkipTrimBoost')) {
    src = src.replace(
      '    applyModernTop40LeaderPeakabilityTrim(stations,G,activeIx,engageWeightedPop,postAqhDenom);',
      '    if(!G._diagSkipTrimBoost)applyModernTop40LeaderPeakabilityTrim(stations,G,activeIx,engageWeightedPop,postAqhDenom);',
    );
    src = src.replace(
      '    applyHighHispanicSpanishLeaderBoost(stations,G,activeIx,engageWeightedPop,postAqhDenom);',
      '    if(!G._diagSkipTrimBoost)applyHighHispanicSpanishLeaderBoost(stations,G,activeIx,engageWeightedPop,postAqhDenom);',
    );
  }
  return src;
}

export function pct(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(d)}%`;
}

export function inBand(val, band) {
  if (val == null || !band) return null;
  return val >= band[0] && val <= band[1];
}

export function envelopeFor(marketId, year) {
  const m = DUNCAN_AQH_ENVELOPES[marketId];
  if (!m) return null;
  if (m[year]) return m[year];
  const keys = Object.keys(m).map(Number).sort((a, b) => a - b);
  let best = keys[0];
  for (const k of keys) {
    if (k <= year) best = k;
  }
  return m[best] || null;
}

export function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function marketSalt(mid) {
  let h = 0;
  for (let i = 0; i < mid.length; i++) h = (h * 31 + mid.charCodeAt(i)) >>> 0;
  return h % 233280;
}
