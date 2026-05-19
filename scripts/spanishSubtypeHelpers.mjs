/**
 * Phase 1 — Spanish subtype catalog + inference (diagnostics / AI ecology metadata only).
 * Does not change runtime SPANISH format IDs or gameplay.
 *
 * @see data/spanishFormats.v1.json
 * @see docs/SPANISH_FORMAT_SPLIT_SPEC.md
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deriveMarketEcology } from '../src/marketEcology.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, '..', 'data', 'spanishFormats.v1.json');

/** @type {Record<string, object> | null} */
let _catalog = null;

export function loadSpanishFormatsCatalog() {
  if (_catalog) return _catalog;
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8'));
  _catalog = raw;
  return raw;
}

/** @returns {string[]} */
export function spanishSubtypeIds() {
  const cat = loadSpanishFormatsCatalog();
  return Object.keys(cat.subtypes || {});
}

/** @param {string} id */
export function getSpanishSubtypeDef(id) {
  const cat = loadSpanishFormatsCatalog();
  return cat.subtypes?.[id] ?? null;
}

/**
 * @param {object} market — MARKETS row
 * @returns {object}
 */
function marketGeoSignals(market) {
  const region = String(market?.region || '');
  const arch = String(market?.archetypeId || '');
  const mid = String(market?.id || market?.marketId || '').toLowerCase();
  const hisp = Number(market?.hispPop2020) || 0;
  const cultSpan = Number(market?.culture?.spanish) || 0;
  const rank = String(market?.rankTier || '');
  const blackPop = Number(market?.blackPop) || 0;

  const sunbelt =
    /sunbelt|southwest|diversified/i.test(arch) ||
    region === 'Southwest' ||
    region === 'South';
  const northeastMega = arch === 'northeast_mega' || (region === 'Northeast' && rank === 'mega');
  const midwestLegacy = arch === 'midwest_legacy' || region === 'Midwest';
  const westFmFragmented = arch === 'west_fm_fragmented' || region === 'West Coast';
  const caribbeanLean =
    blackPop >= 0.1 &&
    cultSpan >= 0.1 &&
    (northeastMega || region === 'South' || (westFmFragmented && hisp >= 0.2));
  const texasMexLean =
    /houston|sanantonio|dallas|elpaso|austin|mcallen/.test(mid) ||
    (region === 'Southwest' && hisp >= 0.32 && !westFmFragmented);
  const miamiLean = mid === 'miami' || (region === 'Southeast' && cultSpan >= 0.14);
  const caribbeanMarket =
    miamiLean || (region === 'Southeast' && hisp >= 0.4 && cultSpan >= 0.18);
  const laMegaWest = mid === 'losangeles' || (westFmFragmented && rank === 'mega' && hisp >= 0.35);

  return {
    region,
    arch,
    mid,
    hisp,
    cultSpan,
    rank,
    sunbelt,
    northeastMega,
    midwestLegacy,
    westFmFragmented,
    caribbeanLean,
    texasMexLean,
    miamiLean,
    caribbeanMarket,
    laMegaWest,
    mega: rank === 'mega',
    large: rank === 'large' || rank === 'mega',
  };
}

/** @param {string} subtypeId @param {number} year */
function subtypeLaunched(subtypeId, year) {
  const def = getSpanishSubtypeDef(subtypeId);
  return year >= (def?.launchYear ?? 1970);
}

/**
 * Markets that should keep Regional Mexican dominance (Phoenix / Texas-shaped).
 * @param {ReturnType<typeof marketGeoSignals>} g
 */
function isRmDominantMarket(g) {
  if (g.texasMexLean) return true;
  if (g.mid === 'phoenix') return true;
  if (g.sunbelt && g.region === 'Southwest' && !g.laMegaWest && !g.caribbeanMarket) return true;
  return false;
}

/**
 * Ordered dial slots for multi-station Spanish books (diagnostic only).
 * @param {object} market
 * @param {number} year
 * @param {object | null} ecology
 * @param {number} totalSpanish — stations in this book
 * @returns {string[] | null}
 */
export function resolveSpanishDialSlotPlan(market, year, ecology, totalSpanish) {
  if (totalSpanish < 2) return null;

  const g = marketGeoSignals(market);
  const base = scoreSpanishSubtypeMarketAffinities(market, year, ecology);

  /** @param {string[]} lanes */
  const filterLaunched = (lanes) => lanes.filter((id) => subtypeLaunched(id, year));

  if (isRmDominantMarket(g)) {
    const plan = [];
    for (let i = 0; i < totalSpanish; i++) {
      if (i === 0 || i === 1) plan.push('REGIONAL_MEXICAN');
      else if (year >= 2002 && subtypeLaunched('SPANISH_ADULT_HITS', year)) {
        plan.push('SPANISH_ADULT_HITS');
      } else if (subtypeLaunched('SPANISH_CONTEMPORARY', year)) {
        plan.push('SPANISH_CONTEMPORARY');
      } else {
        plan.push('REGIONAL_MEXICAN');
      }
    }
    return plan;
  }

  if (g.laMegaWest) {
    return expandSlotPlan(
      filterLaunched(['REGIONAL_MEXICAN', 'SPANISH_CONTEMPORARY', 'SPANISH_TROPICAL']),
      totalSpanish,
    );
  }

  if (g.northeastMega && g.mid === 'newyork') {
    return expandSlotPlan(
      filterLaunched(['SPANISH_NEWS_TALK', 'SPANISH_CONTEMPORARY', 'SPANISH_TROPICAL']),
      totalSpanish,
    );
  }

  if (g.midwestLegacy && g.mid === 'chicago') {
    return expandSlotPlan(
      filterLaunched(['REGIONAL_MEXICAN', 'SPANISH_NEWS_TALK', 'SPANISH_CONTEMPORARY']),
      totalSpanish,
    );
  }

  if (g.caribbeanMarket && !g.texasMexLean) {
    return expandSlotPlan(
      filterLaunched(['SPANISH_TROPICAL', 'SPANISH_NEWS_TALK', 'SPANISH_CONTEMPORARY']),
      totalSpanish,
    );
  }

  if (totalSpanish < 3) return null;

  const top3 = Object.entries(base)
    .filter(([id]) => id !== 'SPANISH_SPORTS_TALK' && id !== 'SPANISH_ADULT_HITS')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  return expandSlotPlan(filterLaunched(top3), totalSpanish);
}

/** @param {string[]} lanes @param {number} n */
function expandSlotPlan(lanes, n) {
  if (!lanes.length) return null;
  const plan = [];
  for (let i = 0; i < n; i++) plan.push(lanes[i % lanes.length]);
  return plan;
}

/**
 * Base subtype affinity scores from market + ecology (no station yet).
 *
 * @param {object} market
 * @param {number} year
 * @param {object | null} ecology — deriveMarketEcology output
 * @returns {Record<string, number>}
 */
export function scoreSpanishSubtypeMarketAffinities(market, year, ecology = null) {
  const g = marketGeoSignals(market);
  const spoken =
    Number(ecology?.spokenWordStrength) ||
    Number(market?.culture?.newsTalk) * 0.55 ||
    0;
  const sports = Number(ecology?.sportsStrength) || 0;

  const scores = {
    REGIONAL_MEXICAN:
      g.hisp * 1.35 +
      g.cultSpan * 0.85 +
      (g.sunbelt ? 0.55 : 0) +
      (g.midwestLegacy ? 0.55 : 0) +
      (g.midwestLegacy && g.hisp >= 0.2 ? 0.35 : 0) +
      (g.texasMexLean ? 0.65 : 0) +
      (g.westFmFragmented && g.hisp >= 0.25 ? 0.35 : 0) -
      (g.northeastMega && !g.midwestLegacy ? 0.15 : 0) -
      (g.caribbeanMarket && !g.texasMexLean ? 0.85 : 0),
    SPANISH_CONTEMPORARY:
      (g.mega ? 0.45 : g.large ? 0.25 : 0) +
      g.cultSpan * 0.65 +
      g.hisp * 0.55 +
      (g.westFmFragmented ? 0.4 : 0) +
      (g.northeastMega ? 0.48 : 0) +
      (g.midwestLegacy ? 0.22 : 0),
    SPANISH_TROPICAL:
      (g.caribbeanLean ? 0.68 : 0) +
      (g.miamiLean ? 0.95 : 0) +
      (g.caribbeanMarket ? 0.55 : 0) +
      (g.northeastMega ? 0.32 : 0) +
      (g.westFmFragmented && g.hisp >= 0.2 ? 0.38 : 0) +
      g.cultSpan * 0.25,
    SPANISH_NEWS_TALK:
      spoken * 0.9 +
      (g.northeastMega ? 0.52 : 0) +
      (g.midwestLegacy ? 0.35 : 0) +
      (g.miamiLean ? 0.3 : 0) +
      (year >= 1995 ? 0.2 : year >= 1988 ? 0.08 : 0),
    SPANISH_SPORTS_TALK:
      sports * 0.85 + (g.mega ? 0.15 : 0) + (year >= 2005 ? 0.15 : 0),
    SPANISH_ADULT_HITS:
      (year >= 2002 ? 0.35 : -0.5) +
      (g.mega && g.hisp >= 0.2 ? 0.25 : 0) +
      (g.hisp >= 0.28 ? 0.2 : 0),
  };

  const cat = loadSpanishFormatsCatalog();
  for (const id of Object.keys(cat.subtypes || {})) {
    const def = cat.subtypes[id];
    if (year < (def.launchYear ?? 1970)) scores[id] = (scores[id] ?? 0) - 2;
  }

  return scores;
}

/**
 * @param {object} station — { sigType, share, spanishLaunchId, spanishLaunchEntrant, megaFrag, id, callLetters }
 * @param {Record<string, number>} baseScores
 * @param {number} year
 * @returns {Record<string, number>}
 */
function applyStationSubtypeAdjustments(station, baseScores, year) {
  const out = { ...baseScores };
  const band = String(station?.sigType || '').toUpperCase();
  const isFm = band === 'FM';
  const isAm = band === 'AM';
  const launchId = String(station?.spanishLaunchId || '');
  const isSecondLaunch =
    station?.spanishLaunchEntrant ||
    /200[2-9]|201[0-9]|202[0-9]/.test(launchId) ||
    /_200[2-9]|_201[0-9]|_202/.test(launchId);

  if (isFm) {
    out.SPANISH_CONTEMPORARY = (out.SPANISH_CONTEMPORARY ?? 0) + 0.1;
    out.SPANISH_TROPICAL = (out.SPANISH_TROPICAL ?? 0) + 0.16;
    out.REGIONAL_MEXICAN = (out.REGIONAL_MEXICAN ?? 0) + 0.08;
    out.SPANISH_ADULT_HITS = (out.SPANISH_ADULT_HITS ?? 0) + (year >= 2002 ? 0.15 : 0);
    out.SPANISH_NEWS_TALK = (out.SPANISH_NEWS_TALK ?? 0) - 0.08;
  }
  if (isAm) {
    out.SPANISH_NEWS_TALK = (out.SPANISH_NEWS_TALK ?? 0) + 0.28;
    out.SPANISH_SPORTS_TALK = (out.SPANISH_SPORTS_TALK ?? 0) + 0.12;
    out.REGIONAL_MEXICAN = (out.REGIONAL_MEXICAN ?? 0) + 0.1;
    out.SPANISH_CONTEMPORARY = (out.SPANISH_CONTEMPORARY ?? 0) - 0.12;
  }
  if (isSecondLaunch) {
    out.SPANISH_ADULT_HITS = (out.SPANISH_ADULT_HITS ?? 0) + 0.22;
    out.SPANISH_TROPICAL = (out.SPANISH_TROPICAL ?? 0) + 0.08;
    out.REGIONAL_MEXICAN = (out.REGIONAL_MEXICAN ?? 0) - 0.06;
  }
  if (station?.megaFrag) {
    out.SPANISH_CONTEMPORARY = (out.SPANISH_CONTEMPORARY ?? 0) + 0.06;
  }

  return out;
}

/** Stable tie-break among near-top scores. */
function stablePickSubtype(scores, station, marketId) {
  const entries = Object.entries(scores).filter(([, v]) => v > -1);
  if (!entries.length) return 'SPANISH_CONTEMPORARY';
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0][1];
  const near = entries.filter(([, v]) => v >= top - 0.06);
  if (near.length === 1) return near[0][0];
  const key = `${marketId}|${station?.id || ''}|${station?.callLetters || ''}|${station?.sigType || ''}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return near[h % near.length][0];
}

/**
 * Infer diagnostic subtype for one umbrella SPANISH station.
 *
 * @param {object} market — MARKETS row
 * @param {number} year
 * @param {object} station
 * @param {object | null} [ecology]
 * @returns {string}
 */
export function inferSpanishSubtype(market, year, station, ecology = null) {
  const eco =
    ecology ??
    (() => {
      try {
        return deriveMarketEcology(market, market?.id || market?.marketId, year, null);
      } catch {
        return null;
      }
    })();
  const base = scoreSpanishSubtypeMarketAffinities(market, year, eco);
  const adjusted = applyStationSubtypeAdjustments(station, base, year);
  return stablePickSubtype(adjusted, station, market?.id || market?.marketId || '');
}

/**
 * When multiple Spanish stations share a book, rotate through top market priors
 * (by share rank) so mega markets show Contemporary / Regional / Tropical mixes.
 *
 * @param {object} market
 * @param {number} year
 * @param {object} station
 * @param {number} stationIndex — 0 = highest share Spanish station
 * @param {number} totalSpanish
 * @param {object | null} [ecology]
 */
/**
 * Soft AM/FM alignment after slot assignment (does not override diversity slots).
 * @param {string} subtype
 * @param {object} station
 * @param {ReturnType<typeof marketGeoSignals>} g
 */
function applyBandSlotNudge(subtype, station, g) {
  const band = String(station?.sigType || '').toUpperCase();
  if (band === 'AM') {
    if (subtype === 'SPANISH_CONTEMPORARY' || subtype === 'SPANISH_TROPICAL') {
      if (g.northeastMega || g.midwestLegacy || g.miamiLean) return 'SPANISH_NEWS_TALK';
      return 'REGIONAL_MEXICAN';
    }
  }
  return subtype;
}

export function inferSpanishSubtypeForDialPosition(
  market,
  year,
  station,
  stationIndex,
  totalSpanish,
  ecology = null,
) {
  if (totalSpanish <= 1) return inferSpanishSubtype(market, year, station, ecology);

  const eco =
    ecology ??
    (() => {
      try {
        return deriveMarketEcology(market, market?.id || market?.marketId, year, null);
      } catch {
        return null;
      }
    })();
  const g = marketGeoSignals(market);
  const plan = resolveSpanishDialSlotPlan(market, year, eco, totalSpanish);

  if (plan?.length) {
    const slot = plan[Math.min(stationIndex, plan.length - 1)];
    return applyBandSlotNudge(slot, station, g);
  }

  const base = scoreSpanishSubtypeMarketAffinities(market, year, eco);
  const marketLanes = Object.entries(base)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  const lane = marketLanes[Math.min(stationIndex, marketLanes.length - 1)];
  const adjusted = applyStationSubtypeAdjustments(station, base, year);
  const solo = stablePickSubtype(adjusted, station, market?.id || market?.marketId || '');
  const laneScore = adjusted[lane] ?? -999;
  const soloScore = adjusted[solo] ?? -999;
  return applyBandSlotNudge(laneScore >= soloScore - 0.04 ? lane : solo, station, g);
}

/**
 * @param {object[]} stations — book Spanish snapshots
 * @param {object} market
 * @param {number} year
 * @param {object | null} [ecology]
 */
export function summarizeSpanishSubtypeBook(stations, market, year, ecology = null) {
  const eco =
    ecology ??
    (() => {
      try {
        return deriveMarketEcology(market, market?.id || market?.marketId, year, null);
      } catch {
        return null;
      }
    })();

  const subtypeCounts = {};
  const subtypeShare = {};
  const assignments = [];
  let totalShare = 0;

  const ordered = [...stations].sort((a, b) => (Number(b.share) || 0) - (Number(a.share) || 0));
  for (let i = 0; i < ordered.length; i++) {
    const st = ordered[i];
    const sub = inferSpanishSubtypeForDialPosition(market, year, st, i, ordered.length, eco);
    subtypeCounts[sub] = (subtypeCounts[sub] || 0) + 1;
    const sh = Number(st.share) || 0;
    subtypeShare[sub] = (subtypeShare[sub] || 0) + sh;
    totalShare += sh;
    assignments.push({ ...st, inferredSubtype: sub });
  }

  const subtypeSharePct = {};
  for (const [k, v] of Object.entries(subtypeShare)) {
    subtypeSharePct[k] = totalShare > 0 ? v / totalShare : 0;
  }

  const leaderEntry = Object.entries(subtypeShare).sort((a, b) => b[1] - a[1])[0];
  const marketAffinity = scoreSpanishSubtypeMarketAffinities(market, year, eco);

  return {
    totalSpanishStations: stations.length,
    subtypeCounts,
    subtypeShareEstimates: subtypeShare,
    subtypeSharePct,
    leadershipBySubtype: leaderEntry ? { subtype: leaderEntry[0], bookShare: leaderEntry[1] } : null,
    marketAffinityPrior: marketAffinity,
    assignments,
  };
}

/**
 * @param {object} st — legacy station in book
 * @returns {object}
 */
export function spanishStationSnapshotFromLegacy(st) {
  return {
    id: String(st?.id ?? ''),
    callLetters: String(st?.callLetters ?? st?.call ?? ''),
    share: Number(st?.rat?.share) || 0,
    sigType: st?.sig?.type || '',
    spanishLaunchId: st?._spanishLaunchId || '',
    spanishLaunchEntrant: !!st?._spanishLaunchEntrant,
    megaFrag: !!st?._megaFragmentationEntrant,
  };
}

/** Truth-audit IIFE snippet (fmtKey === SPANISH only; no isSpanishLanguageFormat). */
export const TRUTH_AUDIT_SPANISH_BOOK_SNIPPET = `
      var spanishBookStations=[];
      for(var sbi=0;sbi<book.length;sbi++){
        var sbst=book[sbi];
        if(fmtKey(sbst.format)!=='SPANISH')continue;
        spanishBookStations.push({
          id:String(sbst.id||''),
          callLetters:String(sbst.callLetters||sbst.call||''),
          share:Number(sbst.rat&&sbst.rat.share)||0,
          sigType:(sbst.sig&&sbst.sig.type)||'',
          spanishLaunchId:sbst._spanishLaunchId||'',
          spanishLaunchEntrant:!!sbst._spanishLaunchEntrant,
          megaFrag:!!sbst._megaFragmentationEntrant
        });
      }
`;

/** VM harness snippet: collect Spanish stations from sorted book array. */
export const SPANISH_BOOK_STATIONS_SNIPPET = `
      var spanishBookStations=[];
      for(var sbi=0;sbi<book.length;sbi++){
        var sbst=book[sbi];
        if(!isSpanishLanguageFormat(sbst.format))continue;
        spanishBookStations.push({
          id:String(sbst.id||''),
          callLetters:String(sbst.callLetters||sbst.call||''),
          share:Number(sbst.rat&&sbst.rat.share)||0,
          sigType:(sbst.sig&&sbst.sig.type)||'',
          spanishLaunchId:sbst._spanishLaunchId||'',
          spanishLaunchEntrant:!!sbst._spanishLaunchEntrant,
          megaFrag:!!sbst._megaFragmentationEntrant
        });
      }
`;
