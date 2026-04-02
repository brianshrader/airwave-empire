#!/usr/bin/env node
/**
 * Move images from a staging tree into generated-portraits/library/{male|female}/{era}/.
 *
 * Layout:
 *   generated-portraits/incoming/male/*.png   (or .jpg, .webp)
 *   generated-portraits/incoming/female/*.png
 *
 * Each filename must end with -YYYY before the extension (same convention as portraitFileBase),
 * e.g. jamie-ortiz-1988.png → library/male/1980s/jamie-ortiz-1988.png
 *
 * Usage:
 *   node scripts/sort-portraits-into-library.mjs              # dry-run
 *   node scripts/sort-portraits-into-library.mjs --apply
 *   node scripts/sort-portraits-into-library.mjs --from /path/to/incoming --apply
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  placeImageInLibraryTree,
  inferYearFromPortraitFileBase,
  libraryFolderForGenderAndYear,
} = require('../server/portraitLibrary.js');

const APPLY = process.argv.includes('--apply');
const fromIdx = process.argv.indexOf('--from');
const INCOMING =
  fromIdx >= 0 && process.argv[fromIdx + 1]
    ? path.resolve(process.argv[fromIdx + 1])
    : path.join(__dirname, '..', 'generated-portraits', 'incoming');

const IMAGE_EXTS = new Set(['.png', '.webp', '.jpg', '.jpeg']);

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => IMAGE_EXTS.has(path.extname(n).toLowerCase()))
    .map((n) => path.join(dir, n))
    .sort((a, b) => a.localeCompare(b));
}

let moved = 0;
let skipped = 0;
let errors = 0;

for (const gender of ['male', 'female']) {
  const gDir = path.join(INCOMING, gender);
  for (const abs of listFiles(gDir)) {
    const base = path.basename(abs, path.extname(abs));
    const year = inferYearFromPortraitFileBase(base);
    if (year == null) {
      console.error(`SKIP (no -YYYY in name): ${path.relative(process.cwd(), abs)}`);
      skipped++;
      continue;
    }
    if (!APPLY) {
      const { eraBucket, destDir } = libraryFolderForGenderAndYear(gender, year);
      const destAbs = path.join(destDir, path.basename(abs));
      console.log(`would move ${gender}/${path.basename(abs)} → library/${gender}/${eraBucket}/ (${destAbs})`);
      moved++;
      continue;
    }
    const result = placeImageInLibraryTree(abs, { gender, firstHireYear: year }, { mode: 'move', onCollision: 'suffix' });
    if (!result.ok) {
      console.error(`FAIL: ${abs} → ${result.reason}`);
      errors++;
      continue;
    }
    console.log(`moved → ${path.relative(path.join(__dirname, '..', 'generated-portraits'), result.destAbs)}`);
    moved++;
  }
}

if (!APPLY) {
  console.log(`Dry run: ${moved} file(s). Pass --apply to move into library/.`);
} else {
  console.log(`Done: ${moved} placed, ${skipped} skipped, ${errors} errors.`);
}
