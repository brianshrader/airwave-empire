#!/usr/bin/env node
/**
 * Scan a save (or all saves in a dir) for dormant exclusive franchise rights:
 * unowned + auction closed, or contractEnd stuck before game year.
 *
 * Usage: node scripts/diag-franchise-orphan-scan.mjs [save.json]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const EXCLUSIVE = [
  { id: 'morning_standard', name: 'The Morning Standard', introduced: 1975 },
  { id: 'drummond_hour', name: 'The Drummond Hour', introduced: 1988 },
  { id: 'night_owl', name: 'Night Owl with Vic Farrell', introduced: 1993 },
  { id: 'the_blitz', name: 'The Blitz', introduced: 1992 },
  { id: 'the_countdown', name: 'The Countdown', introduced: 1970 },
  { id: 'wild_card', name: 'The Wild Card Morning Show', introduced: 1984 },
  { id: 'smooth_ride', name: 'Smooth Ride with Denny Cole', introduced: 1995 },
];

function scanSave(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const G = raw.G || raw;
  const year = G.year ?? 1970;
  const period = G.period ?? 1;
  const rights = G.franchiseRights || {};
  const orphans = [];
  const dormant = [];

  for (const f of EXCLUSIVE) {
    if (year < f.introduced) continue;
    const r = rights[f.id];
    if (!r) {
      orphans.push({ id: f.id, name: f.name, issue: 'missing franchiseRights record' });
      continue;
    }
    const end = Number(r.contractEnd);
    const staleEnd = Number.isFinite(end) && end < year;
    const unowned = !r.holderId;
    const closed = !r.auctionOpen;
    if (unowned && closed && (staleEnd || !Number.isFinite(end) || end <= year)) {
      dormant.push({
        id: f.id,
        name: f.name,
        contractEnd: r.contractEnd,
        auctionCloses: r.auctionCloses,
        staleEnd,
      });
    }
    if (r.holderId) {
      const hold = (G.stations || []).find((s) => s.id === r.holderId);
      if (!hold) {
        orphans.push({ id: f.id, name: f.name, issue: `phantom holder ${r.holderId}` });
      }
    }
  }

  return {
    path,
    label: raw.label || path,
    city: G.city,
    year,
    period,
    dormant,
    orphans,
  };
}

const savePath = resolve(process.argv[2] || '/Users/brianshrader/Downloads/airwave-empire-2005-0624.json');
if (!existsSync(savePath)) {
  console.error('Save not found:', savePath);
  process.exit(1);
}

const result = scanSave(savePath);
console.log(JSON.stringify(result, null, 2));
if (result.dormant.length) {
  console.error(`\n${result.dormant.length} dormant exclusive franchise(s) — repair should reopen on load.`);
  process.exit(2);
}
console.log('\nNo dormant exclusive franchises detected.');
