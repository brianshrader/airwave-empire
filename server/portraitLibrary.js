/**
 * Stock portrait pool: place era- and gender-tagged images under
 * generated-portraits/library/{male|female}/{1970s|1980s|1990s|2000s+}/
 * (png, webp, or jpg). The server copies a random match into the per-talent
 * filename before calling Grok.
 */

const fs = require('fs');
const path = require('path');
const { PORTRAIT_DIR } = require('./portraitRegistry');

const LIBRARY_SEGMENT = 'library';
/** Grok-generated portraits (never mixed into stock pickRandomLibraryImage pool). */
const GROK_SEGMENT = 'grok';
const ERA_DIRS = ['1970s', '1980s', '1990s', '2000s+'];
const IMAGE_EXTS = ['.png', '.webp', '.jpg', '.jpeg'];

function libraryRootAbs() {
  return path.join(PORTRAIT_DIR, LIBRARY_SEGMENT);
}

function grokRootAbs() {
  return path.join(PORTRAIT_DIR, GROK_SEGMENT);
}

/** @param {string} eraBucket — from eraBucketFromYear */
function normalizeEraDir(eraBucket) {
  return ERA_DIRS.includes(eraBucket) ? eraBucket : '2000s+';
}

/**
 * @param {'male'|'female'} gender
 * @param {string} eraBucket
 * @returns {string[]} absolute paths to image files
 */
function listImagesInDir(dirAbs) {
  if (!fs.existsSync(dirAbs)) return [];
  const out = [];
  for (const n of fs.readdirSync(dirAbs)) {
    const ext = path.extname(n).toLowerCase();
    if (IMAGE_EXTS.includes(ext)) out.push(path.join(dirAbs, n));
  }
  return out.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function listLibraryImages(gender, eraBucket) {
  if (gender !== 'male' && gender !== 'female') return [];
  const dir = path.join(libraryRootAbs(), gender, normalizeEraDir(eraBucket));
  return listImagesInDir(dir);
}

/**
 * Grok-saved portraits under generated-portraits/grok/{male|female|unknown}/{era}/
 * @param {'male'|'female'|'unknown'} gender
 * @param {string} eraBucket
 */
function listGrokImages(gender, eraBucket) {
  if (gender !== 'male' && gender !== 'female' && gender !== 'unknown') return [];
  const dir = path.join(grokRootAbs(), gender, normalizeEraDir(eraBucket));
  return listImagesInDir(dir);
}

function pickRandom(paths) {
  if (!paths.length) return null;
  return paths[Math.floor(Math.random() * paths.length)];
}

/**
 * @param {'male'|'female'} gender
 * @param {string} eraBucket
 * @returns {string | null} absolute path to chosen file
 */
function pickRandomLibraryImage(gender, eraBucket) {
  return pickRandom(listLibraryImages(gender, eraBucket));
}

/**
 * Path under generated-portraits for logging / registry (posix-style).
 * @param {string} absSrc
 */
function libraryRelativePortraitsPath(absSrc) {
  const rel = path.relative(PORTRAIT_DIR, absSrc);
  return rel.split(path.sep).join('/');
}

/**
 * Copy a library asset to the per-talent portrait path. Removes other
 * extensions for the same fileBase (matches Grok path behavior).
 * @param {string} srcAbs
 * @param {string} fileBase — without extension
 * @param {string} portraitDir — usually PORTRAIT_DIR
 * @returns {{ absPath: string, ext: string, finalName: string }}
 */
function installLibraryFileToPortrait(srcAbs, fileBase, portraitDir) {
  let ext = path.extname(srcAbs).toLowerCase();
  if (ext === '.jpeg') ext = '.jpg';
  if (!['.png', '.webp', '.jpg'].includes(ext)) ext = '.png';
  const safeExt = ext.slice(1);
  const finalName = `${fileBase}.${safeExt}`;
  const absPath = path.join(portraitDir, finalName);

  for (const e of ['.png', '.webp', '.jpg', '.jpeg']) {
    const p = path.join(portraitDir, `${fileBase}${e}`);
    if (fs.existsSync(p) && p !== absPath) fs.unlinkSync(p);
  }
  fs.copyFileSync(srcAbs, absPath);
  return { absPath, ext: safeExt, finalName };
}

/**
 * Counts images per gender and era (for GET /api/portrait-library/status).
 */
function libraryInventory() {
  const counts = { male: {}, female: {} };
  for (const g of ['male', 'female']) {
    for (const era of ERA_DIRS) {
      counts[g][era] = listLibraryImages(g, era).length;
    }
  }
  const total = Object.values(counts.male).reduce((a, b) => a + b, 0) +
    Object.values(counts.female).reduce((a, b) => a + b, 0);
  return { counts, total, eraDirs: [...ERA_DIRS], libraryRelativeUrlPrefix: '/generated-portraits/library' };
}

/** Counts for AI-generated portraits on disk (by gender + era folders). */
function grokInventory() {
  const counts = { male: {}, female: {}, unknown: {} };
  for (const g of ['male', 'female', 'unknown']) {
    for (const era of ERA_DIRS) {
      counts[g][era] = listGrokImages(g, era).length;
    }
  }
  const total =
    Object.values(counts.male).reduce((a, b) => a + b, 0) +
    Object.values(counts.female).reduce((a, b) => a + b, 0) +
    Object.values(counts.unknown).reduce((a, b) => a + b, 0);
  return {
    counts,
    total,
    eraDirs: [...ERA_DIRS],
    grokRelativeUrlPrefix: '/generated-portraits/grok',
  };
}

function libraryFirstEnabled() {
  return process.env.PORTRAIT_LIBRARY_FIRST !== '0';
}

module.exports = {
  libraryRootAbs,
  grokRootAbs,
  listLibraryImages,
  listGrokImages,
  pickRandomLibraryImage,
  libraryRelativePortraitsPath,
  installLibraryFileToPortrait,
  libraryInventory,
  grokInventory,
  libraryFirstEnabled,
  normalizeEraDir,
  LIBRARY_SEGMENT,
  GROK_SEGMENT,
  ERA_DIRS,
};
