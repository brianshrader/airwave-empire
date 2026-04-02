#!/usr/bin/env node
/**
 * Find duplicate image files (same bytes) under generated-portraits/library and
 * generated-portraits/grok. Keeps one file per hash (lexicographically first path),
 * optionally deletes the rest.
 *
 * Usage:
 *   node scripts/dedupe-portrait-library.mjs           # dry-run (default)
 *   node scripts/dedupe-portrait-library.mjs --apply   # delete duplicates
 *
 * Does not touch per-talent files at generated-portraits root — only library + grok pools.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'generated-portraits');
const APPLY = process.argv.includes('--apply');

const IMAGE_EXTS = new Set(['.png', '.webp', '.jpg', '.jpeg']);

function walkImages(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkImages(p, acc);
    else if (IMAGE_EXTS.has(path.extname(n).toLowerCase())) acc.push(p);
  }
  return acc;
}

function hashFile(abs) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(abs));
  return h.digest('hex');
}

const segments = ['library', 'grok'].map((s) => path.join(ROOT, s));
const files = segments.flatMap((t) => walkImages(t));
const byHash = new Map();

for (const f of files) {
  const hash = hashFile(f);
  if (!byHash.has(hash)) byHash.set(hash, []);
  byHash.get(hash).push(f);
}

let wouldRemove = 0;
for (const [hash, paths] of byHash) {
  if (paths.length < 2) continue;
  paths.sort((a, b) => a.localeCompare(b));
  const keep = paths[0];
  const drop = paths.slice(1);
  console.log(`DUPE ${hash.slice(0, 16)}… (${paths.length} copies) keep ${path.relative(ROOT, keep)}`);
  for (const p of drop) {
    console.log(`  ${APPLY ? 'remove' : 'would remove'} ${path.relative(ROOT, p)}`);
    if (APPLY) fs.unlinkSync(p);
    wouldRemove++;
  }
}

if (wouldRemove === 0) {
  console.log('No duplicate byte-identical images under library/ or grok/.');
} else {
  console.log(
    APPLY ? `Removed ${wouldRemove} duplicate file(s).` : `Dry run: ${wouldRemove} duplicate(s); pass --apply to delete.`,
  );
}
