/**
 * Shared Spanish subtype diagnostic reporting (Phase 1 — no gameplay changes).
 */

import vm from 'vm';
import { deriveMarketEcology } from '../src/marketEcology.js';
import {
  loadSpanishFormatsCatalog,
  spanishSubtypeIds,
  summarizeSpanishSubtypeBook,
} from './spanishSubtypeHelpers.mjs';

/**
 * Attach spanishSubtypeSummary to regression / truth-audit rows (Node-side).
 *
 * @param {object[]} rows
 * @param {object} ctx — VM context with MARKETS
 * @param {Record<string, object>} [marketOverrides] — hardcoded audit markets
 */
export function enrichSpanishSubtypeOnRows(rows, ctx, marketOverrides = {}) {
  const MARKETS = vm.runInContext('typeof MARKETS !== "undefined" ? MARKETS : {}', ctx);
  for (const row of rows) {
    if (!row.ok || !Array.isArray(row.spanishBookStations)) continue;
    const mid = row.marketId;
    const market = marketOverrides[mid] || MARKETS?.[mid] || { id: mid };
    let ecology = null;
    try {
      ecology = deriveMarketEcology(market, mid, row.year, null);
    } catch {
      ecology = null;
    }
    row.spanishSubtypeSummary = summarizeSpanishSubtypeBook(
      row.spanishBookStations,
      market,
      row.year,
      ecology,
    );
  }
  return rows;
}

/**
 * Mean subtype counts / shares across runs.
 *
 * @param {object[]} runs
 */
export function meanSpanishSubtypeAcrossRuns(runs) {
  const withSub = runs.filter((r) => r.spanishSubtypeSummary);
  if (!withSub.length) return null;

  const countAgg = {};
  const shareAgg = {};
  const priorAgg = {};

  for (const r of withSub) {
    const s = r.spanishSubtypeSummary;
    for (const [k, v] of Object.entries(s.subtypeCounts || {})) {
      countAgg[k] = (countAgg[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(s.subtypeSharePct || {})) {
      shareAgg[k] = (shareAgg[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(s.marketAffinityPrior || {})) {
      priorAgg[k] = (priorAgg[k] || 0) + v;
    }
  }

  const n = withSub.length;
  const meanCounts = {};
  const meanSharePct = {};
  const meanPrior = {};
  for (const id of spanishSubtypeIds()) {
    meanCounts[id] = (countAgg[id] || 0) / n;
    meanSharePct[id] = (shareAgg[id] || 0) / n;
    meanPrior[id] = (priorAgg[id] || 0) / n;
  }

  const leaders = {};
  for (const r of withSub) {
    const lt = r.spanishSubtypeSummary?.leadershipBySubtype?.subtype;
    if (lt) leaders[lt] = (leaders[lt] || 0) + 1;
  }

  return {
    runs: n,
    meanSubtypeCounts: meanCounts,
    meanSubtypeSharePct: meanSharePct,
    meanMarketAffinityPrior: meanPrior,
    leadershipWinsBySubtype: leaders,
    meanTotalSpanishStations:
      withSub.reduce((s, r) => s + (r.spanishSubtypeSummary?.totalSpanishStations || 0), 0) / n,
  };
}

/**
 * @param {object | null} summary — meanSpanishSubtypeAcrossRuns output
 * @param {string} [indent]
 */
export function formatSpanishSubtypeBlock(summary, indent = '       ') {
  if (!summary) return `${indent}(no Spanish subtype data — no stations in book)`;
  const lines = [];
  lines.push(
    `${indent}Spanish subtypes (diag inference, umbrella SPANISH unchanged): ` +
      `stations/run ${summary.meanTotalSpanishStations?.toFixed(2) ?? '—'}`,
  );
  const countParts = spanishSubtypeIds()
    .filter((id) => (summary.meanSubtypeCounts[id] || 0) > 0.01)
    .map((id) => `${id}:${summary.meanSubtypeCounts[id].toFixed(2)}`);
  lines.push(`${indent}  mean counts/run: ${countParts.length ? countParts.join(' ') : '(none)'}`);
  const shareParts = spanishSubtypeIds()
    .filter((id) => (summary.meanSubtypeSharePct[id] || 0) > 0.01)
    .map((id) => `${id}:${(summary.meanSubtypeSharePct[id] * 100).toFixed(1)}%`);
  lines.push(`${indent}  share of Spanish mass: ${shareParts.length ? shareParts.join(' ') : '(none)'}`);
  const leadParts = Object.entries(summary.leadershipWinsBySubtype || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}/${summary.runs}`);
  if (leadParts.length) {
    lines.push(`${indent}  leadership by subtype (runs): ${leadParts.join(' ')}`);
  }
  const topPrior = Object.entries(summary.meanMarketAffinityPrior || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}:${v.toFixed(2)}`);
  if (topPrior.length) {
    lines.push(`${indent}  market affinity prior (top): ${topPrior.join(' ')}`);
  }
  return lines.join('\n');
}

export function describeSpanishSubtypeCatalog() {
  const cat = loadSpanishFormatsCatalog();
  return `Phase 1 subtypes (${Object.keys(cat.subtypes || {}).length}): ${spanishSubtypeIds().join(', ')}`;
}
