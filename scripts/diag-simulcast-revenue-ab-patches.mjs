/**
 * String patches for legacy.js — simulcast revenue A/B harness (Variant D dedupe only; A is production).
 */

export function injectSimulcastRevenueAbHooks(legacySrc) {
  let src = legacySrc;

  if (!src.includes('wlSimulcastRevenueAbSkipFmDedupe')) {
    src = src.replace(
      '    const q=fmAmNonDupQualifiedPair(s,G);\n    if(!q||!q.fm)return;',
      '    let q=fmAmNonDupQualifiedPair(s,G);\n    if(!q&&typeof isSimulcastProgrammingReceiver===\'function\'&&isSimulcastProgrammingReceiver(s,G)){\n      const _am=simulcastProgrammingSourceStation(s,G);\n      if(_am&&_am.id!==s.id)q={fm:s,am:_am};\n    }\n    if(!q||!q.fm)return;',
    );
    src = src.replace(
      '    const dup=fmAmCoownedDuplicateClockFraction01(q.fm,G);\n    if(dup<=0)return;',
      '    if(typeof wlSimulcastRevenueAbSkipFmDedupe===\'function\'&&wlSimulcastRevenueAbSkipFmDedupe(q.fm,G))return;\n    const dup=fmAmCoownedDuplicateClockFraction01(q.fm,G);\n    if(dup<=0)return;',
    );
  }

  return src;
}
