#!/usr/bin/env node
/**
 * TTL garbage-collect generated logos, remote vans, jingles, and portraits (excluding library/).
 * Pins any path string found in saves/, data/cloud_saves/, multiplayer/saves/.
 *
 * Usage:
 *   node scripts/gc-generated-assets.js
 *   node scripts/gc-generated-assets.js --dry-run
 *
 * Env: see .env.example (GENERATED_ASSET_*)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
if (process.env.WL_ENV_FILE && require('fs').existsSync(process.env.WL_ENV_FILE)) {
  require('dotenv').config({ path: process.env.WL_ENV_FILE, override: true });
}

const { runGeneratedAssetGc } = require('../server/generatedAssetRetention.js');

const argvDry = process.argv.includes('--dry-run') || process.argv.includes('-n');
const dryRun = argvDry || String(process.env.GENERATED_ASSET_GC_DRY_RUN || '').trim() === '1';

const extra = process.env.GENERATED_PIN_EXTRA_JSON_DIRS
  ? process.env.GENERATED_PIN_EXTRA_JSON_DIRS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

const ttlDays = process.env.GENERATED_ASSET_TTL_DAYS
  ? parseInt(process.env.GENERATED_ASSET_TTL_DAYS, 10)
  : undefined;
const minAgeDays = process.env.GENERATED_ASSET_MIN_AGE_DAYS
  ? parseInt(process.env.GENERATED_ASSET_MIN_AGE_DAYS, 10)
  : undefined;

const r = runGeneratedAssetGc({ dryRun, ttlDays, minAgeDays, extraJsonDirs: extra });

console.log(
  `[gc-generated-assets] dryRun=${r.dryRun} ttlDays=${r.ttlDays} minAgeDays=${r.minAgeDays} pinnedRefs=${r.pinned} eligibleFiles=${r.eligible} skippedPinned=${r.skippedPinned} skippedTooNew=${r.skippedNew} ${r.dryRun ? 'wouldDelete' : 'deleted'}=${r.deleted}`,
);
if (r.paths.length && r.paths.length <= 50) {
  r.paths.forEach((p) => console.log(`  ${r.dryRun ? 'would delete' : 'deleted'}: ${p}`));
} else if (r.paths.length > 50) {
  console.log(`  (${r.paths.length} files; omitting list)`);
}
process.exit(0);
