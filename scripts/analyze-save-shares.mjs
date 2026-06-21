#!/usr/bin/env node
/**
 * Quick share / rivalry / quality snapshot from a solo save export.
 *
 *   node scripts/analyze-save-shares.mjs path/to/save.json
 *   npm run analyze:save -- ~/Downloads/airwave-empire-1990-0621.json
 *
 * Optional: --json writes tmp/save_share_analysis.json
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/** Rough Duncan-style #1 bands for playtest sanity (not harness truth). */
const DUNCAN_NUM1_BAND = {
  newyork: [5.5, 7.5],
  losangeles: [5.5, 7.5],
  chicago: [5.5, 7.5],
  sanfrancisco: [5.5, 7.5],
  dallas: [7, 10],
  houston: [7, 10],
  atlanta: [7, 10],
  seattle: [7, 10],
  phoenix: [8, 11],
  nashville: [7, 9],
  wichita: [9, 12],
};

function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

const MARKET_BILLING_CURVE = {
  1970: 14_000_000,
  1975: 24_000_000,
  1980: 42_000_000,
  1985: 68_000_000,
  1987: 82_000_000,
  1990: 100_000_000,
  1995: 130_000_000,
  2000: 160_000_000,
  2005: 148_000_000,
  2010: 130_000_000,
  2015: 116_000_000,
  2020: 110_000_000,
};

/** revScale from MARKETS — enough for billing cap approximations. */
const MARKET_REV_SCALE = {
  newyork: 6.8,
  losangeles: 5.2,
  chicago: 3.4,
  sanfrancisco: 2.4,
  dallas: 1.55,
  houston: 1.45,
  atlanta: 1.0,
  seattle: 1.35,
  phoenix: 1.18,
  nashville: 0.82,
  wichita: 0.55,
};

const BILLING_REVSCALE_EXP = 0.6;

function billingEffectiveRevScale(rs) {
  const r = rs == null || Number.isNaN(rs) ? 1 : Number(rs);
  if (r <= 1) return r;
  return Math.pow(r, BILLING_REVSCALE_EXP);
}

function marketRevScaleSecondaryLift(rs) {
  const r = rs == null || Number.isNaN(rs) ? 1 : rs;
  if (r >= 1) return 1;
  return 1 + (1 - r) * 0.5;
}

function marketAnnualBilling(year, marketId) {
  const rsRaw = MARKET_REV_SCALE[marketId] ?? 1;
  const rs = billingEffectiveRevScale(rsRaw);
  const lift = marketRevScaleSecondaryLift(rsRaw);
  const ys = Object.keys(MARKET_BILLING_CURVE)
    .map(Number)
    .sort((a, b) => a - b);
  if (year <= ys[0]) return Math.round(MARKET_BILLING_CURVE[ys[0]] * rs * lift);
  if (year >= ys[ys.length - 1]) {
    return Math.round(MARKET_BILLING_CURVE[ys[ys.length - 1]] * rs * lift);
  }
  for (let i = 1; i < ys.length; i++) {
    const y0 = ys[i - 1];
    const y1 = ys[i];
    if (year <= y1) {
      const t = (year - y0) / (y1 - y0);
      const v = MARKET_BILLING_CURVE[y0] + (MARKET_BILLING_CURVE[y1] - MARKET_BILLING_CURVE[y0]) * t;
      return Math.round(v * rs * lift);
    }
  }
  return Math.round(MARKET_BILLING_CURVE[1987] * rs * lift);
}

/** Mirrors promoBudgetCapForPeriod() in legacy.js. */
function promoCapApprox(year, marketId) {
  const a = marketAnnualBilling(year, marketId);
  const eraK = smoothstep(1970, 1992, year);
  const mult = 0.00058 + eraK * 0.00405;
  const raw = Math.round(a * mult);
  const floor = Math.round(13_000 + smoothstep(1970, 1995, year) * 56_000);
  const ceil = Math.round(820_000 + smoothstep(1970, 2020, year) * 680_000);
  return Math.max(floor, Math.min(ceil, raw));
}

function pct(x) {
  return `${(Number(x) * 100).toFixed(1)}%`;
}

function isCommercialBook(st) {
  if (!st || st._bpSlotDeferred) return false;
  if (st.isPublic) return false;
  const fmt = String(st.format || '');
  if (fmt.startsWith('PUBLIC_')) return false;
  if (fmt === 'RELIGIOUS_NETWORK') return false;
  return typeof st.rat?.share === 'number';
}

function loadSave(filePath) {
  const abs = path.resolve(filePath);
  const raw = readFileSync(abs, 'utf8');
  const j = JSON.parse(raw);
  const G = j.G || j.game || j;
  if (!G || !Array.isArray(G.stations)) {
    throw new Error('Not a recognized save — expected { G: { stations: [...] } }');
  }
  return { abs, label: j.label || path.basename(abs), G };
}

function playerStations(G) {
  const ps = G.ps || [];
  if (!ps.length) return [];
  if (typeof ps[0] === 'string') {
    return ps.map((id) => G.stations.find((s) => s.id === id)).filter(Boolean);
  }
  return ps.filter(Boolean);
}

function analyzeSave(G, meta) {
  const marketId = String(G.marketId || G.city || 'unknown').toLowerCase();
  const year = G.year | 0;
  const period = G.period | 0;
  const season = period === 2 ? 'Fall' : period === 1 ? 'Spring' : `P${period}`;
  const promoCap = promoCapApprox(year, marketId);
  const band = DUNCAN_NUM1_BAND[marketId];

  const comm = G.stations.filter(isCommercialBook).slice();
  comm.sort((a, b) => (b.rat.share || 0) - (a.rat.share || 0));

  const top = comm.slice(0, 15).map((s, i) => {
    const share = s.rat.share || 0;
    const promo = s.ops?.promo | 0;
    const flags = [];
    if (s.isPlayer) flags.push('PLAYER');
    if (s._rivalryChallenger) flags.push('RIVALRY_CHALL');
    if (s._chStratPick) flags.push('chStrat');
    const hist = s._history?.length | 0;
    const ratHist = s.rat?.hist;
    const prevShare =
      Array.isArray(ratHist) && ratHist.length > 1 ? ratHist[ratHist.length - 2]?.share : null;
    return {
      rank: i + 1,
      call: s.callLetters,
      format: s.format,
      share,
      sharePct: pct(share),
      oq: s.oq | 0,
      promo,
      promoPctOfCap: promoCap > 0 ? Math.round((promo / promoCap) * 1000) / 10 : null,
      overPromoCap: promoCap > 0 && promo > promoCap * 1.02,
      flags: flags.join(' ') || null,
      historyEntries: hist,
      shareDeltaVsPrev:
        prevShare != null ? Math.round((share - prevShare) * 1000) / 10 : null,
    };
  });

  const num1 = top[0]?.share ?? 0;
  const top3 = comm.slice(0, 3).reduce((a, s) => a + (s.rat.share || 0), 0);
  const hhi = comm.reduce((a, s) => {
    const sh = s.rat.share || 0;
    return a + sh * sh * 10_000;
  }, 0);
  const over10 = comm.filter((s) => (s.rat.share || 0) >= 0.1);
  const over15 = comm.filter((s) => (s.rat.share || 0) >= 0.15);
  const oq95 = comm.filter((s) => (s.oq | 0) >= 95);

  const rivalry = {
    domThreats: G._domThreats || {},
    pick: G._rivalryPick || {},
    pickUntil: G._rivalryPickUntil || {},
    newsSeen: Object.keys(G._rivalryNewsSeen || {}).length,
    challengers: comm
      .filter((s) => s._rivalryChallenger || s._chStratPick)
      .map((s) => ({
        call: s.callLetters,
        share: s.rat.share,
        graceUntil: s._challengerGraceUntil,
      })),
  };

  const players = playerStations(G).map((s) => ({
    call: s.callLetters,
    format: s.format,
    share: s.rat?.share ?? 0,
    sharePct: pct(s.rat?.share || 0),
    oq: s.oq | 0,
  }));

  const inBand = band ? num1 >= band[0] / 100 && num1 <= band[1] / 100 : null;

  return {
    file: meta.abs,
    label: meta.label,
    marketId,
    year,
    period,
    season,
    turn: G.turn | 0,
    commercialCount: comm.length,
    promoCapApprox: promoCap,
    duncanNum1Band: band ? `${band[0]}–${band[1]}%` : null,
    num1Share: num1,
    num1InDuncanBand: inBand,
    top3Share: top3,
    hhi: Math.round(hhi),
    stationsOver10Pct: over10.length,
    stationsOver15Pct: over15.length,
    oq95Count: oq95.length,
    top,
    players,
    rivalry,
  };
}

function formatMarkdown(r) {
  const lines = [];
  lines.push('# Save share analysis');
  lines.push('');
  lines.push(`**File:** ${r.file}`);
  lines.push(`**Label:** ${r.label}`);
  lines.push(
    `**Sim:** ${r.marketId} · ${r.year} ${r.season} · turn ${r.turn} · ${r.commercialCount} commercial stations`,
  );
  lines.push('');
  lines.push('## Headline metrics');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| #1 share | ${pct(r.num1Share)} |`);
  if (r.duncanNum1Band) {
    lines.push(`| Duncan #1 band | ${r.duncanNum1Band} |`);
    lines.push(`| In band? | ${r.num1InDuncanBand ? 'yes' : '**no**'} |`);
  }
  lines.push(`| Top-3 sum | ${pct(r.top3Share)} |`);
  lines.push(`| HHI | ${r.hhi} |`);
  lines.push(`| Stations ≥10% | ${r.stationsOver10Pct} |`);
  lines.push(`| Stations ≥15% | ${r.stationsOver15Pct} |`);
  lines.push(`| Stations OQ≥95 | ${r.oq95Count} |`);
  lines.push(`| Promo cap (approx) | $${r.promoCapApprox.toLocaleString()}/period |`);
  lines.push('');
  if (r.players.length) {
    lines.push('## Player stations');
    lines.push('');
    for (const p of r.players) {
      lines.push(`- **${p.call}** ${p.format} — ${p.sharePct} · OQ ${p.oq}`);
    }
    lines.push('');
  }
  lines.push('## Top 15 (commercial book)');
  lines.push('');
  lines.push('| # | Call | Format | Share | OQ | Promo | % cap | Notes |');
  lines.push('| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |');
  for (const row of r.top) {
    const notes = [
      row.flags,
      row.overPromoCap ? 'OVER_CAP' : null,
      row.historyEntries ? `hist:${row.historyEntries}` : null,
      row.shareDeltaVsPrev != null ? `Δ${row.shareDeltaVsPrev}pt` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    lines.push(
      `| ${row.rank} | ${row.call} | ${row.format} | ${row.sharePct} | ${row.oq} | $${row.promo.toLocaleString()} | ${row.promoPctOfCap ?? '—'}% | ${notes || '—'} |`,
    );
  }
  lines.push('');
  if (Object.keys(r.rivalry.domThreats).length || r.rivalry.challengers.length) {
    lines.push('## Rivalry prototype');
    lines.push('');
    for (const [lane, th] of Object.entries(r.rivalry.domThreats)) {
      lines.push(
        `- **${lane}:** ${th.leaderCall} at ${pct(th.leaderShare)} (${th.leaderFmt}) · tier ${Math.round((th.tier || 0) * 100)}% · since ${th.sinceYear}`,
      );
    }
    for (const c of r.rivalry.challengers) {
      lines.push(
        `- Challenger **${c.call}** ${pct(c.share)} · grace until ${c.graceUntil ?? '—'}`,
      );
    }
    if (r.rivalry.newsSeen) lines.push(`- Rivalry news events logged: ${r.rivalry.newsSeen}`);
    lines.push('');
  }
  return lines.join('\n');
}

function printConsole(r) {
  console.log(`\n=== Save share analysis ===`);
  console.log(`File: ${r.file}`);
  console.log(`${r.label}`);
  console.log(`${r.marketId} · ${r.year} ${r.season} · turn ${r.turn} · ${r.commercialCount} commercial`);
  console.log(
    `#1 ${pct(r.num1Share)}${r.duncanNum1Band ? ` (Duncan ${r.duncanNum1Band}${r.num1InDuncanBand ? ', in band' : ', **HIGH**'})` : ''}`,
  );
  console.log(
    `Top-3 ${pct(r.top3Share)} · HHI ${r.hhi} · ≥10%: ${r.stationsOver10Pct} · ≥15%: ${r.stationsOver15Pct} · OQ≥95: ${r.oq95Count}`,
  );
  console.log(`Promo cap ~$${r.promoCapApprox.toLocaleString()}/period\n`);
  if (r.players.length) {
    console.log('Player:', r.players.map((p) => `${p.call} ${p.sharePct}`).join(', '));
  }
  console.log('\nTop stations:');
  for (const row of r.top.slice(0, 12)) {
    const cap = row.promoPctOfCap != null ? `${row.promoPctOfCap}% cap` : '';
    const fl = row.flags ? ` [${row.flags}]` : '';
    console.log(
      `  ${String(row.rank).padStart(2)}. ${row.call.padEnd(6)} ${row.sharePct.padStart(6)}  OQ ${String(row.oq).padStart(2)}  promo $${String(row.promo).padStart(6)}  ${cap}${fl}`,
    );
  }
  if (Object.keys(r.rivalry.domThreats).length) {
    console.log('\nRivalry:');
    for (const [lane, th] of Object.entries(r.rivalry.domThreats)) {
      console.log(`  ${lane}: ${th.leaderCall} ${pct(th.leaderShare)} (tier ${Math.round((th.tier || 0) * 100)}%)`);
    }
    for (const c of r.rivalry.challengers) {
      console.log(`  challenger ${c.call} ${pct(c.share)} until ${c.graceUntil ?? '?'}`);
    }
  }
  console.log('');
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--json');
  const writeJson = process.argv.includes('--json');
  const savePath = args[0];
  if (!savePath) {
    console.error('Usage: node scripts/analyze-save-shares.mjs <save.json> [--json]');
    process.exit(1);
  }
  const meta = loadSave(savePath);
  const result = analyzeSave(meta.G, meta);
  printConsole(result);
  if (writeJson) {
    mkdirSync(path.join(root, 'tmp'), { recursive: true });
    const base = path.basename(meta.abs, path.extname(meta.abs));
    const outJson = path.join(root, 'tmp', `${base}_share_analysis.json`);
    const outMd = path.join(root, 'tmp', `${base}_share_analysis.md`);
    writeFileSync(outJson, JSON.stringify(result, null, 2));
    writeFileSync(outMd, formatMarkdown(result));
    console.log(`Wrote ${outJson}`);
    console.log(`Wrote ${outMd}`);
  }
}

main();
