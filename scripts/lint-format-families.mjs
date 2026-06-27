#!/usr/bin/env node
/**
 * Phase 0 — format family registry lint (metadata only).
 *
 *   npm run lint:format-families
 *
 * Verifies data/formatFamilies.v1.json against src/legacy.js FM{}, DRIFT{}, FORMAT_SUNSET
 * and data/formatLifecycle.v1.json nationalFormats keys.
 *
 * @see docs/FORMAT_FAMILY_ARCHITECTURE.md
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const familiesPath = path.join(root, 'data', 'formatFamilies.v1.json');
const lifecyclePath = path.join(root, 'data', 'formatLifecycle.v1.json');
const spanishFormatsPath = path.join(root, 'data', 'spanishFormats.v1.json');

const errors = [];
const warnings = [];

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

/** @param {string} src @param {string} constName */
function extractObjectKeys(src, constName) {
  const anchor = `const ${constName}=`;
  const start = src.indexOf(anchor);
  if (start < 0) {
    err(`Could not find ${anchor} in legacy.js`);
    return [];
  }
  const braceStart = src.indexOf('{', start);
  if (braceStart < 0) {
    err(`Could not find opening brace for ${constName}`);
    return [];
  }
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const block = src.slice(braceStart, i);
  const keys = [];
  const re = /^\s{2}([A-Z][A-Z0-9_]*)\s*:/gm;
  let m;
  while ((m = re.exec(block)) !== null) keys.push(m[1]);
  return keys;
}

/** Primary appl() FORMAT_SUNSET (includes OLDIES) — brace-balanced parse. */
function extractFormatSunsetKeys(src) {
  const anchor = 'const FORMAT_SUNSET=';
  const idx = src.indexOf(anchor);
  if (idx < 0) {
    err('Could not find FORMAT_SUNSET in legacy.js');
    return [];
  }
  const braceStart = src.indexOf('{', idx);
  if (braceStart < 0) {
    err('Could not find FORMAT_SUNSET opening brace');
    return [];
  }
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const block = src.slice(braceStart, i);
  return [...block.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gm)].map((x) => x[1]);
}

function resolveDriftTarget(catalog, legacyId) {
  const entry = catalog.legacyIdMap[legacyId];
  if (!entry) return null;
  if (entry.driftKey) return entry.driftKey;
  const alias = catalog.saveAliases?.[legacyId];
  if (alias) {
    const a = catalog.legacyIdMap[alias];
    return a?.driftKey || alias;
  }
  return null;
}

/** Allowed diagnostic lane ≠ canonical family lifecycleLane (e.g. HOT_AC). */
function crossFamilyLaneOverrideOk(legacyId, catalog, lifecycleSpec) {
  const entry = catalog.legacyIdMap?.[legacyId];
  const ov = entry?.lifecycleLaneOverride;
  if (ov?.crossFamilyLaneAllowed && lifecycleSpec?.crossFamilyLaneAllowed) {
    if (ov.canonicalFamily && lifecycleSpec.canonicalFamily && ov.canonicalFamily !== lifecycleSpec.canonicalFamily) {
      return false;
    }
    if (entry.family && ov.canonicalFamily && entry.family !== ov.canonicalFamily) {
      return false;
    }
    return true;
  }
  return false;
}

function resolveLifecycleBinding(catalog, lifecycleKey) {
  const map = catalog.lifecycleCatalogMap?.[lifecycleKey];
  if (!map) return null;
  if (map.legacyId) return { type: 'legacy', id: map.legacyId };
  if (map.plannedId) return { type: 'planned', id: map.plannedId };
  if (map.aggregateLegacyIds?.length) return { type: 'aggregate', ids: map.aggregateLegacyIds };
  if (map.institutionalProxyLegacyId) {
    return { type: 'institutional', id: map.institutionalProxyLegacyId, plannedId: map.plannedId };
  }
  return null;
}

function main() {
  const legacySrc = readFileSync(legacyPath, 'utf8');
  const catalog = JSON.parse(readFileSync(familiesPath, 'utf8'));
  const lifecycle = JSON.parse(readFileSync(lifecyclePath, 'utf8'));

  const familyIds = new Set(Object.keys(catalog.families || {}));
  const fmKeys = extractObjectKeys(legacySrc, 'FM');
  const driftKeys = new Set(extractObjectKeys(legacySrc, 'DRIFT'));
  const sunsetKeys = extractFormatSunsetKeys(legacySrc);
  const lifecycleKeys = Object.keys(lifecycle.nationalFormats || {});
  const legacyMap = catalog.legacyIdMap || {};
  const planned = catalog.plannedIds || {};

  // —— Family registry sanity ——
  for (const [id, fam] of Object.entries(catalog.families || {})) {
    if (fam.meta && fam.competitive) {
      warn(`Family ${id}: meta families should not be competitive ratings lanes`);
    }
  }

  // —— Every FM{} key mapped ——
  for (const key of fmKeys) {
    if (!legacyMap[key]) {
      err(`FM key ${key} has no entry in formatFamilies.v1.json legacyIdMap`);
    }
  }

  for (const key of Object.keys(legacyMap)) {
    if (legacyMap[key].formatSunsetOnly) continue;
    if (!fmKeys.includes(key) && !planned[key]) {
      warn(`legacyIdMap.${key} is not in FM{} (expected for sunset-only or planned-only entries)`);
    }
  }

  // —— Explicit meta / institutional ——
  const brokered = legacyMap.BROKERED_PROGRAMMING;
  if (!brokered) err('Missing legacyIdMap.BROKERED_PROGRAMMING');
  else {
    if (brokered.family !== 'REMNANT') err('BROKERED_PROGRAMMING must map to family REMNANT');
    if (brokered.metaClassification !== 'remnant_inventory') {
      err('BROKERED_PROGRAMMING must set metaClassification remnant_inventory');
    }
    if (brokered.competitiveRatings !== false) {
      err('BROKERED_PROGRAMMING must set competitiveRatings false');
    }
  }

  const relNet = legacyMap.RELIGIOUS_NETWORK;
  if (!relNet) err('Missing legacyIdMap.RELIGIOUS_NETWORK');
  else {
    if (relNet.family !== 'INSTITUTIONAL') err('RELIGIOUS_NETWORK must map to family INSTITUTIONAL');
    if (relNet.metaClassification !== 'institutional_religious_network') {
      err('RELIGIOUS_NETWORK must set metaClassification institutional_religious_network');
    }
    if (relNet.playerSelectable !== false) {
      err('RELIGIOUS_NETWORK must set playerSelectable false');
    }
  }

  // —— HOT_AC cross-tags + cross-family lane override ——
  const hotAc = legacyMap.HOT_AC;
  if (!hotAc) err('Missing legacyIdMap.HOT_AC');
  else {
    if (hotAc.family !== 'ADULT') err('HOT_AC canonical family must be ADULT');
    const tags = new Set(hotAc.crossTags || []);
    if (!tags.has('chrPressure')) err('HOT_AC must include crossTag chrPressure');
    if (!tags.has('hitsLineage')) err('HOT_AC must include crossTag hitsLineage');
    const hotLc = lifecycle.nationalFormats?.HOT_AC;
    const hotLane = hotLc?.diagnosticLane || hotLc?.lane;
    const adultLane = catalog.families?.ADULT?.lifecycleLane;
    if (hotLane && adultLane && hotLane !== adultLane) {
      if (!crossFamilyLaneOverrideOk('HOT_AC', catalog, hotLc)) {
        err(
          `HOT_AC: diagnostic lane "${hotLane}" ≠ ADULT lifecycleLane "${adultLane}" without crossFamilyLaneAllowed in both formatFamilies and formatLifecycle`,
        );
      }
    }
    const ov = hotAc.lifecycleLaneOverride;
    if (!ov?.crossFamilyLaneAllowed) {
      err('HOT_AC must declare lifecycleLaneOverride.crossFamilyLaneAllowed in formatFamilies.v1.json');
    }
    if (hotLc && !hotLc.crossFamilyLaneAllowed) {
      err('HOT_AC must declare crossFamilyLaneAllowed in formatLifecycle.v1.json');
    }
    if (hotLc?.canonicalFamily && hotLc.canonicalFamily !== hotAc.family) {
      err(`HOT_AC: formatLifecycle canonicalFamily ${hotLc.canonicalFamily} must match legacyIdMap family ${hotAc.family}`);
    }
  }

  // —— Other cross-family lane overrides (extensible) ——
  for (const [id, entry] of Object.entries(legacyMap)) {
    if (id === 'HOT_AC' || !entry.lifecycleLaneOverride?.crossFamilyLaneAllowed) continue;
    const lc = lifecycle.nationalFormats?.[entry.lifecycleCatalogKey || id];
    if (!lc?.crossFamilyLaneAllowed) {
      err(`${id}: lifecycleLaneOverride requires crossFamilyLaneAllowed on matching formatLifecycle row`);
    }
  }

  // —— Unknown families ——
  for (const [id, entry] of Object.entries(legacyMap)) {
    if (!familyIds.has(entry.family)) err(`legacyIdMap.${id}: unknown family "${entry.family}"`);
  }
  for (const [id, entry] of Object.entries(planned)) {
    if (!familyIds.has(entry.family)) err(`plannedIds.${id}: unknown family "${entry.family}"`);
  }

  // —— Planned IDs not required in FM ——
  for (const pid of Object.keys(planned)) {
    if (fmKeys.includes(pid)) {
      err(`plannedIds.${pid} must not exist in FM{} until implemented`);
    }
    if (planned[pid].implemented !== false) {
      err(`plannedIds.${pid} must set implemented: false`);
    }
  }

  // —— DRIFT coverage ——
  for (const dKey of driftKeys) {
    const hasOwner = Object.entries(legacyMap).some(([, e]) => e.driftKey === dKey);
    if (!hasOwner && dKey !== 'TOP40') {
      err(`DRIFT key ${dKey} has no legacyIdMap entry with driftKey ${dKey}`);
    }
  }

  for (const fmKey of fmKeys) {
    const entry = legacyMap[fmKey];
    if (!entry) continue;
    if (entry.family === 'REMNANT' || entry.family === 'INSTITUTIONAL' || entry.family === 'PUBLIC') {
      if (entry.driftKey && !driftKeys.has(entry.driftKey)) {
        err(`${fmKey}: driftKey ${entry.driftKey} not found in DRIFT{}`);
      }
      continue;
    }
    if (entry.publicFormat || entry.institutional) continue;
    if (fmKey === 'ALL_NEWS') {
      if (entry.driftKey) warn('ALL_NEWS has driftKey in catalog but no DRIFT{} entry in gameplay (expected until Phase 3)');
      continue;
    }
    const target = resolveDriftTarget(catalog, fmKey);
    if (!target) {
      if (!entry.talkFormat) warn(`${fmKey}: no driftKey mapped (non-talk music format without DRIFT)`);
    } else if (!driftKeys.has(target)) {
      err(`${fmKey}: resolved drift target ${target} not in DRIFT{}`);
    }
  }

  // —— FORMAT_SUNSET ——
  for (const sKey of sunsetKeys) {
    if (!legacyMap[sKey]) {
      err(`FORMAT_SUNSET key ${sKey} has no legacyIdMap entry`);
    } else if (!legacyMap[sKey].formatSunset && !legacyMap[sKey].formatSunsetOnly) {
      err(`FORMAT_SUNSET key ${sKey}: legacyIdMap entry must set formatSunset or formatSunsetOnly`);
    }
  }

  // —— Lifecycle catalog keys ——
  for (const lcKey of lifecycleKeys) {
    const binding = resolveLifecycleBinding(catalog, lcKey);
    if (!binding) {
      err(`formatLifecycle nationalFormats.${lcKey} has no lifecycleCatalogMap entry`);
      continue;
    }
    if (binding.type === 'legacy') {
      if (!legacyMap[binding.id] && !planned[binding.id]) {
        err(`lifecycleCatalogMap.${lcKey} -> legacyId ${binding.id} not in legacyIdMap or plannedIds`);
      }
    }
    if (binding.type === 'planned') {
      if (!planned[binding.id]) {
        err(`lifecycleCatalogMap.${lcKey} -> plannedId ${binding.id} not in plannedIds`);
      }
    }
    if (binding.type === 'aggregate') {
      for (const id of binding.ids) {
        if (!fmKeys.includes(id)) err(`lifecycleCatalogMap.${lcKey} aggregate references missing FM key ${id}`);
      }
    }
    if (binding.type === 'institutional') {
      if (!legacyMap[binding.id]) {
        err(`lifecycleCatalogMap.${lcKey} institutionalProxy ${binding.id} missing from legacyIdMap`);
      }
    }
  }

  // —— lifecycleCatalogKey on legacy entries should exist in catalog or map ——
  for (const [id, entry] of Object.entries(legacyMap)) {
    if (entry.lifecycleCatalogKey && !lifecycleKeys.includes(entry.lifecycleCatalogKey)) {
      warn(
        `${id}: lifecycleCatalogKey ${entry.lifecycleCatalogKey} not in formatLifecycle.v1.json yet (Phase 1)`,
      );
    }
    if (entry.lifecycleCatalogAggregate && !lifecycleKeys.includes(entry.lifecycleCatalogAggregate)) {
      err(`${id}: lifecycleCatalogAggregate ${entry.lifecycleCatalogAggregate} missing from formatLifecycle.v1.json`);
    }
  }

  // —— Save alias CHR ——
  if (catalog.saveAliases?.CHR !== 'TOP40') {
    err('saveAliases.CHR must map to TOP40');
  }

  // —— Spanish subtype catalog (Phase 1 diagnostics) ——
  let spanishCatalog;
  try {
    spanishCatalog = JSON.parse(readFileSync(spanishFormatsPath, 'utf8'));
  } catch (e) {
    err(`Could not read ${spanishFormatsPath}: ${e.message}`);
    spanishCatalog = null;
  }
  const requiredSpanishSubtypes = [
    'SPANISH_CONTEMPORARY',
    'REGIONAL_MEXICAN',
    'SPANISH_TROPICAL',
    'SPANISH_NEWS_TALK',
    'SPANISH_SPORTS_TALK',
    'SPANISH_ADULT_HITS',
  ];
  if (spanishCatalog?.subtypes) {
    for (const id of requiredSpanishSubtypes) {
      const st = spanishCatalog.subtypes[id];
      if (!st) err(`spanishFormats.v1.json missing subtype ${id}`);
      else {
        if (st.family !== 'SPANISH') err(`${id}: family must be SPANISH`);
        if (st.id !== id) err(`${id}: id field mismatch`);
        if (!st.label || typeof st.launchYear !== 'number') {
          err(`${id}: requires label and launchYear`);
        }
        if (fmKeys.includes(id)) {
          const promoted = ['REGIONAL_MEXICAN', 'SPANISH_CONTEMPORARY', 'SPANISH_TROPICAL', 'SPANISH_ADULT_HITS'];
          if (!promoted.includes(id)) {
            err(`${id}: Phase 1 subtype must not appear in FM{} yet (diagnostics only)`);
          }
        }
      }
    }
    if (spanishCatalog.subtypes.SPANISH_RELIGIOUS) {
      err('spanishFormats: SPANISH_RELIGIOUS removed — use BROKERED_PROGRAMMING');
    }
    for (const id of Object.keys(spanishCatalog.subtypes)) {
      if (!requiredSpanishSubtypes.includes(id)) {
        warn(`spanishFormats.v1.json unexpected subtype ${id}`);
      }
    }
  }

  // —— Orphan lifecycle map keys ——
  for (const lcKey of Object.keys(catalog.lifecycleCatalogMap || {})) {
    if (!lifecycleKeys.includes(lcKey)) {
      warn(`lifecycleCatalogMap.${lcKey} is not in formatLifecycle.v1.json nationalFormats`);
    }
  }

  console.log('lint:format-families');
  console.log(`  FM{} keys: ${fmKeys.length}`);
  console.log(`  DRIFT{} keys: ${driftKeys.size}`);
  console.log(`  FORMAT_SUNSET keys: ${sunsetKeys.length}`);
  console.log(`  lifecycle nationalFormats: ${lifecycleKeys.length}`);
  console.log(`  legacyIdMap entries: ${Object.keys(legacyMap).length}`);
  console.log(`  plannedIds: ${Object.keys(planned).length}`);

  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }

  if (errors.length) {
    console.error(`\nErrors (${errors.length}):`);
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  console.log('\nOK — format family registry lint passed');
  if (warnings.length) process.exit(0);
}

main();
