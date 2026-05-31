/**
 * String patches for legacy.js — inject diagnostic morning-recovery hooks (VM only).
 */

export function injectRecoveryAbHooks(legacySrc) {
  let src = legacySrc;

  src = src.replace(
    'function decay(s,year,period){\n  if(!s||s._bpSlotDeferred)return;',
    'function decay(s,year,period){\n  if(!s||s._bpSlotDeferred)return;\n  if(typeof wlMorningRecoveryShockDecayStep===\'function\')wlMorningRecoveryShockDecayStep(s,G,year,period);',
  );

  src = src.replace(
    'if(hostTal&&hostTal._budgetHire)bb*=0.66;\n      s.prog[sl].quality=Math.min(100,s.prog[sl].quality+bb);',
    'if(hostTal&&hostTal._budgetHire)bb*=0.66;\n      if(sl===\'morningDrive\'&&typeof wlMorningRecoveryMorningProgMult===\'function\')bb*=wlMorningRecoveryMorningProgMult(s);\n      s.prog[sl].quality=Math.min(100,s.prog[sl].quality+bb);',
  );

  src = src.replace(
    'const q=s.oq/65;\n\n  // Signal reach:',
    'let q=s.oq/65;\n  if(typeof wlMorningRecoveryAppealMult===\'function\')q*=wlMorningRecoveryAppealMult(s);\n\n  // Signal reach:',
  );

  if (!src.includes('s._wlLastProgSpend=totalProgSpend')) {
    src = src.replace(
      'const totalProgSpend=cappedProg+(s.progInvestment||0);',
      'const totalProgSpend=cappedProg+(s.progInvestment||0);\n  s._wlLastProgSpend=totalProgSpend;',
    );
  }

  if (!src.includes('wlMorningRecoveryShareMult')) {
    src = src.replace(
      'const bleedTot=raw.reduce((a,b)=>a+b,0)||1;\n    raw=raw.map(v=>v/bleedTot);',
      'const bleedTot=raw.reduce((a,b)=>a+b,0)||1;\n    raw=raw.map(v=>v/bleedTot);\n    if(typeof wlMorningRecoveryShareMult===\'function\'){\n      raw=raw.map((v,ri)=>v*wlMorningRecoveryShareMult(stations[activeIx[ri]]));\n      const _mrsTot=raw.reduce((a,b)=>a+b,0)||1;\n      raw=raw.map(v=>v/_mrsTot);\n    }',
    );
  }

  return src;
}
