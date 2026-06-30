/**
 * Flatten reference panel + market suite into diffable metrics.
 */
import { DELTA_THRESHOLDS } from './config.mjs';

function metricKey(marketId, year, name) {
  return `${marketId}:${year}:${name}`;
}

function pct(n) {
  return Math.round(Number(n) * 1000) / 10;
}

export function metricsFromReferencePanel(panel) {
  const metrics = {};
  const topFormatsByCell = {};

  for (const cell of panel.cells || []) {
    if (!cell.ok) {
      metrics[`${cell.marketId}:${cell.year}:error`] = cell.err || 'fail';
      continue;
    }
    const base = `${cell.marketId}:${cell.year}`;
    metrics[`${base}:nBook`] = cell.nBook;
    metrics[`${base}:nCommDial`] = cell.nCommDial;
    metrics[`${base}:amCommercial`] = cell.amCommercial;
    metrics[`${base}:fmCommercial`] = cell.fmCommercial;
    metrics[`${base}:spanishLaneShare`] = pct(cell.spanishLaneShare);
    metrics[`${base}:topShare`] = pct(cell.topShare);
    metrics[`${base}:top5Share`] = pct(cell.top5Share);
    metrics[`${base}:hhi`] = Math.round(cell.hhi);
    metrics[`${base}:midTierCompetitors`] = cell.midTierCompetitors;
    metrics[`${base}:leaderFormat`] = cell.topFormats?.[0]?.format || cell.ranker?.[0]?.format || '?';
    metrics[`${base}:leaderShare`] = pct(cell.topShare);

    topFormatsByCell[`${cell.marketId}:${cell.year}`] = (cell.topFormats || []).map((f) => ({
      format: f.format,
      share: pct(f.share),
    }));
  }

  return { metrics, topFormatsByCell };
}

export function summarizeMarketSuite(suite) {
  if (!suite?.rows) return { byMarket: {}, overall: 'SKIP' };
  const byMarket = {};
  for (const row of suite.rows) {
    byMarket[row.marketId] = {
      overall: row.overall,
      cert: row.cert,
      stability: row.stability,
      era: row.era,
      spanish: row.spanish,
      exposureAudit: row.exposureAudit,
      inPlayable: row.audit?.inPlayable ?? false,
      notes: row.notes || '',
    };
  }
  return { byMarket, overall: suite.verdict || 'SKIP', generatedAt: suite.generatedAt };
}

export function diffMetrics(current, baseline, thresholds = DELTA_THRESHOLDS) {
  const allKeys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  const deltas = [];

  for (const key of allKeys) {
    const cur = current[key];
    const base = baseline[key];
    if (cur === base) continue;
    if (typeof cur === 'string' || typeof base === 'string') {
      if (cur !== base) {
        deltas.push({ key, baseline: base, current: cur, delta: null, kind: 'categorical' });
      }
      continue;
    }
    if (typeof cur !== 'number' || typeof base !== 'number') continue;

    const delta = cur - base;
    const abs = Math.abs(delta);
    let significant = false;
    let kind = 'other';

    if (key.endsWith(':spanishLaneShare') || key.endsWith(':topShare') || key.endsWith(':top5Share') || key.endsWith(':leaderShare')) {
      kind = 'share';
      significant = abs >= thresholds.sharePoints;
    } else if (key.endsWith(':nCommDial') || key.endsWith(':amCommercial') || key.endsWith(':fmCommercial')) {
      kind = 'commercial';
      significant = abs >= thresholds.commercialCount;
    } else if (key.endsWith(':nBook') || key.endsWith(':midTierCompetitors')) {
      kind = 'structure';
      significant = abs >= thresholds.stationCount;
    } else if (key.endsWith(':hhi')) {
      kind = 'concentration';
      significant = abs >= 25;
    }

    deltas.push({ key, baseline: base, current: cur, delta, kind, significant });
  }

  deltas.sort((a, b) => {
    const sa = a.significant ? 1 : 0;
    const sb = b.significant ? 1 : 0;
    if (sb !== sa) return sb - sa;
    return Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0);
  });

  return deltas;
}

export function diffMarketSuite(current, baseline) {
  const flips = [];
  const markets = new Set([...Object.keys(current.byMarket || {}), ...Object.keys(baseline.byMarket || {})]);

  for (const marketId of markets) {
    const cur = current.byMarket?.[marketId];
    const base = baseline.byMarket?.[marketId];
    if (!cur && !base) continue;

    const curV = cur?.overall || 'SKIP';
    const baseV = base?.overall || 'SKIP';
    if (curV !== baseV) {
      flips.push({
        marketId,
        baseline: baseV,
        current: curV,
        inPlayable: cur?.inPlayable ?? base?.inPlayable ?? false,
        notes: cur?.notes || '',
      });
    }
  }

  const order = { FAIL: 3, WARN: 2, PASS: 1, SKIP: 0 };
  flips.sort((a, b) => (order[b.current] ?? 0) - (order[a.current] ?? 0));

  return {
    overallBaseline: baseline.overall || 'SKIP',
    overallCurrent: current.overall || 'SKIP',
    overallChanged: (baseline.overall || 'SKIP') !== (current.overall || 'SKIP'),
    flips,
  };
}

export function classifyDelta(delta) {
  const { key, delta: d, kind } = delta;
  const [market, year] = key.split(':');
  const label = key.split(':').slice(2).join(':');

  if (kind === 'share') {
    const direction = d > 0 ? 'up' : 'down';
    return { section: 'realism', market, year, summary: `${market} ${year} ${label} ${direction} ${Math.abs(d).toFixed(1)} pts` };
  }
  if (kind === 'commercial' || kind === 'structure') {
    const direction = d > 0 ? '+' : '';
    return {
      section: d > 0 ? 'gameplay' : 'realism',
      market,
      year,
      summary: `${market} ${year} ${label} ${direction}${d}`,
    };
  }
  if (kind === 'concentration') {
    return { section: 'realism', market, year, summary: `${market} ${year} HHI ${d > 0 ? '+' : ''}${d}` };
  }
  return { section: 'realism', market, year, summary: `${key}: ${delta.baseline} → ${delta.current}` };
}

export function topMovers(deltas, { limit = 10, significantOnly = true } = {}) {
  const pool = significantOnly ? deltas.filter((d) => d.significant) : deltas;
  const winners = [];
  const losers = [];

  for (const d of pool) {
    if (d.delta == null) continue;
    const info = classifyDelta(d);
    const entry = { ...d, ...info };
    if (d.kind === 'share' || d.kind === 'concentration') {
      if (d.key.includes('spanish') && d.delta > 0) losers.push(entry);
      else if (d.key.includes('nCommDial') && d.delta > 0) winners.push(entry);
      else if (d.key.includes('topShare') && d.delta < 0) winners.push(entry);
      else if (d.delta > 0) winners.push(entry);
      else losers.push(entry);
    } else if (d.kind === 'commercial' || d.kind === 'structure') {
      if (d.delta > 0) winners.push(entry);
      else losers.push(entry);
    }
  }

  return {
    winners: winners.slice(0, limit),
    losers: losers.slice(0, limit),
  };
}
