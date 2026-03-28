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
const ERA_DIRS = ['1970s', '1980s', '1990s', '2000s+'];
const IMAGE_EXTS = ['.png', '.webp', '.jpg', '.jpeg'];

function libraryRootAbs() {
  return path.join(PORTRAIT_DIR, LIBRARY_SEGMENT);
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
function listLibraryImages(gender, eraBucket) {
  if (gender !== 'male' && gender !== 'female') return [];
  const dir = path.join(libraryRootAbs(), gender, normalizeEraDir(eraBucket));
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const n of fs.readdirSync(dir)) {
    const ext = path.extname(n).toLowerCase();
    if (IMAGE_EXTS.includes(ext)) out.push(path.join(dir, n));
  }
  return out.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
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

function libraryFirstEnabled() {
  return process.env.PORTRAIT_LIBRARY_FIRST !== '0';
}

module.exports = {
  libraryRootAbs,
  listLibraryImages,
  pickRandomLibraryImage,
  libraryRelativePortraitsPath,
  installLibraryFileToPortrait,
  libraryInventory,
  libraryFirstEnabled,
  LIBRARY_SEGMENT,
  ERA_DIRS,
};
