/**
 * Stock portrait pool: place era- and gender-tagged images under
 * generated-portraits/library/{male|female}/{1970s|1980s|1990s|2000s+}/
 * (png, webp, or jpg). The server copies a random match into the per-talent
 * filename before calling Grok.
 */

const fs = require('fs');
const path = require('path');
const { PORTRAIT_DIR } = require('./portraitRegistry');
const { eraBucketFromYear } = require('./portraitIdentity');

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
 * @param {string[]} claimedRel — posix paths under PORTRAIT_DIR (e.g. library/male/1980s/a.png)
 */
function posixRelativeUnderPortraitDir(absPath) {
  return path.relative(PORTRAIT_DIR, absPath).split(path.sep).join('/');
}

/**
 * Pick a random library image for gender, avoiding paths already claimed in this game.
 * Order: primary era → 1970s → remaining eras (all for that gender).
 * @param {'male'|'female'} gender
 * @param {string} eraBucket
 * @param {Set<string>|string[]} claimedRel
 * @returns {string | null} absolute path
 */
function pickLibraryImageExclusive(gender, eraBucket, claimedRel) {
  if (gender !== 'male' && gender !== 'female') return null;
  const claimed = claimedRel instanceof Set ? claimedRel : new Set(claimedRel || []);
  const primary = normalizeEraDir(eraBucket);
  const eraOrder = [];
  if (primary) eraOrder.push(primary);
  if (primary !== '1970s') eraOrder.push('1970s');
  for (const e of ERA_DIRS) {
    if (!eraOrder.includes(e)) eraOrder.push(e);
  }
  for (const era of eraOrder) {
    const paths = listLibraryImages(gender, era);
    const free = paths.filter((p) => !claimed.has(posixRelativeUnderPortraitDir(p)));
    const picked = pickRandom(free);
    if (picked) return picked;
  }
  return null;
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

/**
 * Match game naming: `sanitized-name-1985` → 1985 (same as portraitFileBase + ext).
 * @param {string} fileBase — filename without extension
 * @returns {number | null}
 */
function inferYearFromPortraitFileBase(fileBase) {
  const m = String(fileBase).match(/-(\d{4})$/);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1950 || y > 2040) return null;
  return y;
}

/**
 * Target folder for a stock library asset: library/{gender}/{era}/
 * @param {'male'|'female'} gender
 * @param {number} firstHireYear
 * @returns {{ eraBucket: string, destDir: string }}
 */
function libraryFolderForGenderAndYear(gender, firstHireYear) {
  if (gender !== 'male' && gender !== 'female') {
    throw new Error('libraryFolderForGenderAndYear: gender must be male or female');
  }
  const y = Math.floor(Number(firstHireYear));
  if (!Number.isFinite(y)) throw new Error('libraryFolderForGenderAndYear: invalid year');
  const eraBucket = normalizeEraDir(eraBucketFromYear(y));
  const destDir = path.join(libraryRootAbs(), gender, eraBucket);
  return { eraBucket, destDir };
}

/**
 * Move or copy one image into library/{male|female}/{era}/ using hire year for era.
 * Year comes from `firstHireYear` or from basename `...-YYYY` if omitted.
 *
 * @param {string} srcAbs
 * @param {{ gender: 'male'|'female', firstHireYear?: number }} opts
 * @param {{ mode?: 'move'|'copy', onCollision?: 'skip'|'suffix' }} [options]
 * @returns {{ ok: boolean, destAbs?: string, reason?: string, eraBucket?: string }}
 */
function placeImageInLibraryTree(srcAbs, opts, options = {}) {
  const mode = options.mode === 'copy' ? 'copy' : 'move';
  const onCollision = options.onCollision === 'suffix' ? 'suffix' : 'skip';
  const gender = opts.gender;
  if (gender !== 'male' && gender !== 'female') {
    return { ok: false, reason: 'gender must be male or female' };
  }
  if (!fs.existsSync(srcAbs) || !fs.statSync(srcAbs).isFile()) {
    return { ok: false, reason: 'source file missing' };
  }
  const ext = path.extname(srcAbs).toLowerCase();
  const base = path.basename(srcAbs, ext);
  let year = opts.firstHireYear != null ? Math.floor(Number(opts.firstHireYear)) : inferYearFromPortraitFileBase(base);
  if (year == null || !Number.isFinite(year)) {
    return { ok: false, reason: 'could not resolve hire year (pass firstHireYear or use basename like name-1992.png)' };
  }
  const { eraBucket, destDir } = libraryFolderForGenderAndYear(gender, year);
  fs.mkdirSync(destDir, { recursive: true });
  let fileName = path.basename(srcAbs);
  let destAbs = path.join(destDir, fileName);
  if (fs.existsSync(destAbs)) {
    const same =
      fs.statSync(srcAbs).size === fs.statSync(destAbs).size;
    if (same && onCollision === 'skip') {
      return { ok: true, destAbs, eraBucket, reason: 'already exists (same path, skipped)' };
    }
    if (onCollision === 'suffix') {
      let n = 2;
      const stem = base;
      const safeExt = ext;
      while (fs.existsSync(destAbs)) {
        fileName = `${stem}-${n}${safeExt}`;
        destAbs = path.join(destDir, fileName);
        n++;
      }
    } else if (fs.existsSync(destAbs)) {
      return { ok: false, reason: `destination exists: ${destAbs}` };
    }
  }
  if (mode === 'copy') {
    fs.copyFileSync(srcAbs, destAbs);
  } else {
    try {
      fs.renameSync(srcAbs, destAbs);
    } catch (e) {
      if (e && e.code === 'EXDEV') {
        fs.copyFileSync(srcAbs, destAbs);
        fs.unlinkSync(srcAbs);
      } else {
        throw e;
      }
    }
  }
  return { ok: true, destAbs, eraBucket };
}

module.exports = {
  libraryRootAbs,
  grokRootAbs,
  listLibraryImages,
  listGrokImages,
  pickRandomLibraryImage,
  pickLibraryImageExclusive,
  posixRelativeUnderPortraitDir,
  libraryRelativePortraitsPath,
  installLibraryFileToPortrait,
  libraryInventory,
  grokInventory,
  libraryFirstEnabled,
  normalizeEraDir,
  inferYearFromPortraitFileBase,
  libraryFolderForGenderAndYear,
  placeImageInLibraryTree,
  LIBRARY_SEGMENT,
  GROK_SEGMENT,
  ERA_DIRS,
};
