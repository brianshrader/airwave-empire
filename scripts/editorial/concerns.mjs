/**
 * Chronic concern registry — tracks known realism and gameplay debts across builds.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { paths } from './config.mjs';

const VALID_STATUS = new Set(['chronic', 'watch', 'resolved', 'new']);
const VALID_CATEGORY = new Set(['realism', 'gameplay', 'player_experience', 'ship_blocker']);
const VALID_SCOPE = new Set(['structural', 'behavioral', 'ui']);

export function loadConcernRegistry() {
  const raw = readFileSync(paths.concernRegistry, 'utf8');
  return JSON.parse(raw);
}

export function saveConcernRegistry(registry) {
  registry.updatedAt = new Date().toISOString();
  mkdirSync(path.dirname(paths.concernRegistry), { recursive: true });
  writeFileSync(paths.concernRegistry, `${JSON.stringify(registry, null, 2)}\n`);
}

export function matchConcernsToDeltas(registry, deltas) {
  const deltaByKey = Object.fromEntries(deltas.map((d) => [d.key, d]));
  const matched = [];
  const untouched = [];

  for (const concern of registry.concerns || []) {
    if (concern.status === 'resolved') {
      untouched.push({ concern, reason: 'resolved' });
      continue;
    }
    const keys = concern.metricKeys || [];
    const hits = keys.map((k) => deltaByKey[k]).filter(Boolean);
    if (hits.length) {
      matched.push({ concern, deltas: hits, moved: hits.some((h) => h.significant) });
    } else {
      untouched.push({ concern, reason: 'no_metric_delta' });
    }
  }

  return { matched, untouched };
}

export function suggestNewConcerns(deltas, existingIds) {
  const suggestions = [];
  for (const d of deltas.filter((x) => x.significant)) {
    const [market, year, ...rest] = d.key.split(':');
    const metric = rest.join(':');
    const id = `${market}-${year}-${metric}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
    if (existingIds.has(id)) continue;

    let title = `${market} ${year} ${metric} moved ${d.delta > 0 ? '+' : ''}${d.delta}`;
    let category = 'realism';
    if (metric.includes('nCommDial') || metric.includes('midTier')) {
      category = 'gameplay';
      title = `${market} ${year}: ${metric} ${d.delta > 0 ? 'increased' : 'decreased'} (${d.baseline} → ${d.current})`;
    }
    if (metric.includes('spanish')) {
      title = `${market} ${year}: Spanish lane share ${d.delta > 0 ? 'up' : 'down'} ${Math.abs(d.delta).toFixed(1)} pts`;
    }

    suggestions.push({
      id,
      title,
      category,
      severity: Math.abs(d.delta ?? 0) >= 2 ? 'watch' : 'watch',
      scope: metric.includes('Share') || metric.includes('hhi') ? 'behavioral' : 'structural',
      markets: [market],
      status: 'new',
      metricKeys: [d.key],
      delta: d,
    });
  }
  return suggestions.slice(0, 8);
}

export function formatConcernSection(registry, { matched, untouched, suggestions, suiteDiff }) {
  const lines = [];
  const resolved = (registry.concerns || []).filter((c) => c.status === 'resolved');
  const chronic = (registry.concerns || []).filter((c) => c.status === 'chronic' || c.status === 'watch');

  lines.push('## Concern registry');
  lines.push('');

  if (matched.length) {
    lines.push('### Moved this build');
    for (const { concern, deltas, moved } of matched) {
      const deltaStr = deltas.map((d) => `${d.key.split(':').slice(2).join(':')} ${d.delta > 0 ? '+' : ''}${d.delta}`).join(', ');
      lines.push(`- **${concern.title}** (${concern.status}) — ${moved ? 'significant' : 'minor'}: ${deltaStr}`);
    }
    lines.push('');
  }

  if (suggestions.length) {
    lines.push('### Suggested new concerns');
    for (const s of suggestions) {
      lines.push(`- **${s.title}** — consider adding \`${s.id}\` to concern registry`);
    }
    lines.push('');
  }

  if (suiteDiff?.flips?.length) {
    lines.push('### Market suite verdict changes');
    for (const f of suiteDiff.flips) {
      const tag = f.inPlayable ? 'playable' : 'diag';
      lines.push(`- ${f.marketId} (${tag}): ${f.baseline} → **${f.current}**${f.notes ? ` — ${f.notes.slice(0, 80)}` : ''}`);
    }
    lines.push('');
  }

  lines.push('### Chronic concerns (tracking)');
  if (!chronic.length) lines.push('_None registered._');
  for (const c of chronic) {
    lines.push(`- [${c.severity}] **${c.title}** (${c.markets?.join(', ') || 'global'}) — ${c.notes || ''}`);
  }
  lines.push('');

  if (resolved.length) {
    lines.push('### Recently resolved');
    for (const c of resolved.slice(-5)) {
      lines.push(`- ~~${c.title}~~`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
