/**
 * Shared aggregation for successor recovery diagnostics.
 * Uses originalPriorSlotQ at departure; excludes integrity-flagged events from headline medians.
 */

export const CEILING_TOLERANCE = 1;
export const PRIOR_BUCKETS = ['85-89', '90-93', '94+'];
export const FILL_TIMINGS = ['same_turn', 'delayed', 'open'];

export function priorBucket(q) {
  const n = q | 0;
  if (n < 90) return '85-89';
  if (n < 94) return '90-93';
  return '94+';
}

export function fillTimingLabel(ev) {
  if (ev.fillTiming === 'same_turn_fill') return 'same_turn';
  if (ev.fillTiming === 'delayed_fill') return 'delayed';
  if (ev.fillTiming === 'vacancy_still_open' || ev.finalStatus === 'vacancy_still_open') return 'open';
  if (ev.fillTiming === 'same_turn') return 'same_turn';
  if (ev.fillTiming === 'delayed') return 'delayed';
  return ev.fillTiming || 'unknown';
}

export function computeIntegrityFlags(ev, tolerance = CEILING_TOLERANCE) {
  const flags = [];
  if (!ev || ev.replacementType === 'vacant' || fillTimingLabel(ev) === 'open') {
    return { flags, flagged: false };
  }

  const prior = ev.originalPriorSlotQ ?? ev.departingSlotQ | 0;
  const repl = ev.replacementSlotQAtFill ?? ev.replacementSlotQ | 0;
  const ceiling = ev.ceilingAtFill;
  const hasCeiling = ev.hasCeilingAfterFill ?? ev.hasCeilingAtFill;

  if (ev.filled !== false && ev.isSuccessorDeparture !== false) {
    if (hasCeiling === false) flags.push('no_ceiling_after_fill');
    if (ceiling != null && repl > ceiling + tolerance) flags.push('repl_above_ceiling');
    if (
      ceiling != null &&
      prior > ceiling + tolerance &&
      repl >= prior &&
      repl > ceiling + tolerance
    ) {
      flags.push('immediate_while_capped');
    }
  }

  return { flags, flagged: flags.length > 0 };
}

function mean(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x));
  if (!a.length) return null;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function median(xs) {
  const a = xs.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((100 * n) / d * 100) / 100;
}

export function summarizeRecoveryGroup(events, label = 'group') {
  const n = events.length;
  const recovered = events.filter((e) => e.recoveredQuality || e.recoveredOriginal);
  const immediate = events.filter(
    (e) => e.immediateRecoverTPlus1 ?? e.immediateRecoverOriginal,
  );
  const years = events
    .map((e) => e.yearsToRecoverQuality ?? e.yearsToRecoverOriginal)
    .filter((y) => y != null);

  return {
    label,
    count: n,
    pctRecovered: pct(recovered.length, n),
    medianYears: median(years),
    avgYears: mean(years),
    pctImmediate: pct(immediate.length, n),
    avgOriginalPriorSlotQ: mean(events.map((e) => e.originalPriorSlotQ ?? e.departingSlotQ)),
    avgReplacementSlotQ: mean(
      events.map((e) => e.replacementSlotQAtFill ?? e.replacementSlotQ).filter((x) => x != null),
    ),
    avgCeilingAtFill: mean(events.map((e) => e.ceilingAtFill).filter((x) => x != null)),
    integrityFlagged: events.filter((e) => computeIntegrityFlags(e).flagged).length,
  };
}

export function buildRecoveryReport(events, opts = {}) {
  const filled = events.filter(
    (e) =>
      e.replacementType !== 'vacant' &&
      fillTimingLabel(e) !== 'open' &&
      (e.filled !== false || e.replacementSlotQ != null || e.replacementSlotQAtFill != null),
  );

  const withFlags = filled.map((e) => {
    const { flags, flagged } = computeIntegrityFlags(e);
    return { ...e, integrityFlags: flags, integrityFlagged: flagged };
  });

  const clean = withFlags.filter((e) => !e.integrityFlagged);
  const raw = summarizeRecoveryGroup(filled, 'raw_all');
  const filtered = summarizeRecoveryGroup(clean, 'headline_clean');

  const byTiming = {};
  for (const t of FILL_TIMINGS) {
    byTiming[t] = {
      raw: summarizeRecoveryGroup(
        filled.filter((e) => fillTimingLabel(e) === t),
        `${t}_raw`,
      ),
      clean: summarizeRecoveryGroup(
        clean.filter((e) => fillTimingLabel(e) === t),
        `${t}_clean`,
      ),
    };
  }

  const byPriorBucket = {};
  for (const bucket of PRIOR_BUCKETS) {
    byPriorBucket[bucket] = {
      raw: summarizeRecoveryGroup(
        filled.filter((e) => priorBucket(e.originalPriorSlotQ ?? e.departingSlotQ) === bucket),
        `${bucket}_raw`,
      ),
      clean: summarizeRecoveryGroup(
        clean.filter((e) => priorBucket(e.originalPriorSlotQ ?? e.departingSlotQ) === bucket),
        `${bucket}_clean`,
      ),
    };
  }

  const byTypeAndTiming = {};
  for (const type of ['internal', 'external', 'cluster']) {
    byTypeAndTiming[type] = {};
    for (const t of FILL_TIMINGS) {
      const subset = clean.filter(
        (e) => e.replacementType === type && fillTimingLabel(e) === t,
      );
      byTypeAndTiming[type][t] = summarizeRecoveryGroup(subset, `${type}_${t}`);
    }
    byTypeAndTiming[type].all = summarizeRecoveryGroup(
      clean.filter((e) => e.replacementType === type),
      type,
    );
  }

  const sameTurnClean = clean.filter(
    (e) => fillTimingLabel(e) === 'same_turn' && priorBucket(e.originalPriorSlotQ ?? e.departingSlotQ) !== '85-89',
  );
  const intSame = sameTurnClean.filter((e) => e.replacementType === 'internal');
  const extSame = sameTurnClean.filter((e) => e.replacementType === 'external');

  const impossibleImmediate = filled.filter((e) => {
    const imm = e.immediateRecoverEndOfFill ?? e.immediateRecoverOriginal;
    if (!imm) return false;
    const prior = e.originalPriorSlotQ ?? e.departingSlotQ | 0;
    const repl = e.replacementSlotQAtFill ?? e.replacementSlotQ | 0;
    const ceiling = e.ceilingAtFill;
    return prior >= 90 && ceiling != null && prior > ceiling + CEILING_TOLERANCE && repl >= prior;
  });

  return {
    totalEvents: events.length,
    filledCount: filled.length,
    integrityExcluded: withFlags.filter((e) => e.integrityFlagged).length,
    impossibleImmediateEndOfFill: impossibleImmediate.length,
    headline: filtered,
    rawHeadline: raw,
    byTiming,
    byPriorBucket,
    byTypeAndTiming,
    applesToApplesSameTurn: {
      filter: 'same_turn, prior 90+, integrity-clean',
      internal: summarizeRecoveryGroup(intSame, 'apples_internal'),
      external: summarizeRecoveryGroup(extSame, 'apples_external'),
      internalAdvantagePct:
        intSame.length && extSame.length
          ? Math.round(
              (summarizeRecoveryGroup(intSame).pctRecovered -
                summarizeRecoveryGroup(extSame).pctRecovered) *
                100,
            ) / 100
          : null,
    },
    integrityBreakdown: {
      no_ceiling_after_fill: withFlags.filter((e) =>
        e.integrityFlags?.includes('no_ceiling_after_fill'),
      ).length,
      repl_above_ceiling: withFlags.filter((e) => e.integrityFlags?.includes('repl_above_ceiling'))
        .length,
      immediate_while_capped: withFlags.filter((e) =>
        e.integrityFlags?.includes('immediate_while_capped'),
      ).length,
    },
    ...opts,
  };
}
