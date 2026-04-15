/**
 * Generated asset retention: pin paths referenced by JSON saves, TTL-delete unreferenced files.
 * Scans: saves/*.json (multiplayer rooms), data/cloud_saves/**, optional multiplayer/saves/**.
 * GC roots: generated-logos, generated-remote-vans, generated-jingles, generated-portraits
 * (excludes generated-portraits/library/** and generated-portraits/registry.json).
 *
 * Run: node scripts/gc-generated-assets.js  or  npm run gc:generated-assets
 * Env: GENERATED_ASSET_TTL_DAYS, GENERATED_ASSET_GC_DRY_RUN, GENERATED_ASSET_MIN_AGE_DAYS
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

/** Paths under site root that appear in save JSON or URLs (with or without leading slash). */
const GENERATED_REF_RES = [
  /\/generated-(?:logos|remote-vans|jingles|portraits)\/[^\s"'<>\\]*/g,
  /(?:^|["'\s])generated-(?:logos|remote-vans|jingles|portraits)\/[^\s"'<>\\]*/g,
];

/**
 * @param {string} text
 * @returns {Set<string>} posix relative paths from repo root, e.g. generated-logos/foo.png
 */
function extractGeneratedRefsFromText(text) {
  const set = new Set();
  if (!text || typeof text !== 'string') return set;
  for (const pattern of GENERATED_REF_RES) {
    const re = new RegExp(pattern.source, 'g');
    let m;
    while ((m = re.exec(text))) {
      let chunk = m[0];
      chunk = chunk.replace(/^[-"'\s]+/, '');
      const q = chunk.indexOf('?');
      if (q >= 0) chunk = chunk.slice(0, q);
      chunk = chunk.replace(/^\/+/, '');
      if (chunk.startsWith('generated-')) set.add(chunk.replace(/\\/g, '/'));
    }
  }
  return set;
}

function readUtf8Safe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/**
 * All .json files under dir (recursive).
 * @param {string} absDir
 * @returns {string[]}
 */
function collectJsonFilesRecursive(absDir) {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name.endsWith('.json')) out.push(p);
    }
  }
  walk(absDir);
  return out;
}

/**
 * JSON files in a single directory (non-recursive).
 * @param {string} absDir
 * @returns {string[]}
 */
function collectJsonFilesFlat(absDir) {
  if (!fs.existsSync(absDir)) return [];
  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => path.join(absDir, e.name));
}

/**
 * Build pinned relative paths from default save locations + optional extra dirs.
 * @param {{ extraJsonDirs?: string[] }} [opts]
 * @returns {Set<string>}
 */
function buildPinnedRelativePaths(opts) {
  const opts2 = opts || {};
  const pinned = new Set();

  const scanFile = (abs) => {
    const txt = readUtf8Safe(abs);
    extractGeneratedRefsFromText(txt).forEach((p) => pinned.add(p));
  };

  collectJsonFilesFlat(path.join(REPO_ROOT, 'saves')).forEach(scanFile);
  collectJsonFilesRecursive(path.join(REPO_ROOT, 'data', 'cloud_saves')).forEach(scanFile);

  const mpSaves = path.join(REPO_ROOT, 'multiplayer', 'saves');
  if (fs.existsSync(mpSaves)) collectJsonFilesFlat(mpSaves).forEach(scanFile);

  const extra = opts2.extraJsonDirs || [];
  for (const d of extra) {
    const abs = path.isAbsolute(d) ? d : path.join(REPO_ROOT, d);
    if (fs.existsSync(abs)) {
      if (fs.statSync(abs).isDirectory()) {
        collectJsonFilesRecursive(abs).forEach(scanFile);
      } else if (abs.endsWith('.json')) {
        scanFile(abs);
      }
    }
  }

  return pinned;
}

/**
 * @param {string} relPosix path like generated-portraits/foo.png
 */
function shouldSkipGcPortrait(relPosix) {
  return (
    relPosix.includes('generated-portraits/library/') ||
    relPosix === 'generated-portraits/registry.json' ||
    relPosix.endsWith('/.gitkeep')
  );
}

/**
 * @returns {{ abs: string, relPosix: string }[]}
 */
function listGcEligibleFiles() {
  const out = [];
  const roots = ['generated-logos', 'generated-remote-vans', 'generated-jingles', 'generated-portraits'];

  function walk(absDir, baseRel) {
    if (!fs.existsSync(absDir)) return;
    for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
      const rel = baseRel ? `${baseRel}/${ent.name}` : ent.name;
      const abs = path.join(absDir, ent.name);
      const relPosix = rel.split(path.sep).join('/');
      if (ent.isDirectory()) {
        if (relPosix === 'generated-portraits/library') continue;
        walk(abs, rel);
      } else if (ent.isFile()) {
        if (relPosix.startsWith('generated-portraits/') && shouldSkipGcPortrait(relPosix)) continue;
        out.push({ abs, relPosix });
      }
    }
  }

  for (const r of roots) {
    walk(path.join(REPO_ROOT, r), r);
  }
  return out;
}

/**
 * @param {{
 *   dryRun?: boolean,
 *   ttlDays?: number,
 *   minAgeDays?: number,
 *   now?: number,
 *   extraJsonDirs?: string[],
 * }} opts
 * @returns {{ pinned: number, eligible: number, deleted: number, skippedNew: number, skippedPinned: number, dryRun: boolean, ttlDays: number, paths: string[] }}
 */
function runGeneratedAssetGc(opts) {
  const o = opts || {};
  const dryRun = Boolean(o.dryRun);
  const ttlDays = Math.max(1, Number(o.ttlDays != null ? o.ttlDays : process.env.GENERATED_ASSET_TTL_DAYS) || 60);
  const minAgeDays = Math.max(0, Number(o.minAgeDays != null ? o.minAgeDays : process.env.GENERATED_ASSET_MIN_AGE_DAYS) || 7);
  const now = o.now != null ? o.now : Date.now();
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;

  const pinned = buildPinnedRelativePaths({ extraJsonDirs: o.extraJsonDirs });
  const eligible = listGcEligibleFiles();

  let deleted = 0;
  let skippedNew = 0;
  let skippedPinned = 0;
  const deletedPaths = [];

  for (const { abs, relPosix } of eligible) {
    if (pinned.has(relPosix)) {
      skippedPinned++;
      continue;
    }
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    const age = now - st.mtimeMs;
    if (age < minAgeMs) {
      skippedNew++;
      continue;
    }
    if (age <= ttlMs) continue;

    if (!dryRun) {
      try {
        fs.unlinkSync(abs);
      } catch (e) {
        console.warn('[gc-generated-assets] unlink failed:', relPosix, e.message);
        continue;
      }
    }
    deleted++;
    deletedPaths.push(relPosix);
  }

  return {
    pinned: pinned.size,
    eligible: eligible.length,
    deleted,
    skippedNew,
    skippedPinned,
    dryRun,
    ttlDays,
    minAgeDays,
    paths: deletedPaths,
  };
}

module.exports = {
  REPO_ROOT,
  extractGeneratedRefsFromText,
  buildPinnedRelativePaths,
  listGcEligibleFiles,
  runGeneratedAssetGc,
};
