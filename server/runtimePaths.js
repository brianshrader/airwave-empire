'use strict';

/**
 * Runtime persistence roots — keep user data off the deploy sync tree when possible.
 *
 * WL_PERSIST_ROOT (e.g. ~/airwave-persist on production): cloud saves, quotas,
 * multiplayer room JSON, and generated player assets live here.
 *
 * APP_ROOT/data/*.v1.json — shipped game-design catalogs (repo); not user state.
 */

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');

function resolveDir(envVal, ...fallbackParts) {
  if (envVal && String(envVal).trim()) return path.resolve(String(envVal).trim());
  return path.join(...fallbackParts);
}

const PERSIST_ROOT = resolveDir(process.env.WL_PERSIST_ROOT, APP_ROOT);

const DATA_DIR = resolveDir(process.env.WL_DATA_DIR, PERSIST_ROOT, 'data');
const SAVES_DIR = resolveDir(process.env.WL_SAVES_DIR, PERSIST_ROOT, 'saves');
const GENERATED_LOGOS_DIR = resolveDir(process.env.WL_GENERATED_LOGOS_DIR, PERSIST_ROOT, 'generated-logos');
const GENERATED_PORTRAITS_DIR = resolveDir(
  process.env.WL_GENERATED_PORTRAITS_DIR,
  PERSIST_ROOT,
  'generated-portraits',
);
const GENERATED_JINGLES_DIR = resolveDir(process.env.WL_GENERATED_JINGLES_DIR, PERSIST_ROOT, 'generated-jingles');
const GENERATED_REMOTE_VANS_DIR = resolveDir(
  process.env.WL_GENERATED_REMOTE_VANS_DIR,
  PERSIST_ROOT,
  'generated-remote-vans',
);

const GAME_DATA_DIR = path.join(APP_ROOT, 'data');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function cloudSavesDir() {
  return path.join(DATA_DIR, 'cloud_saves');
}
function aiUsageDir() {
  return path.join(DATA_DIR, 'ai_usage');
}
function guestAiUsageDir() {
  return path.join(DATA_DIR, 'guest_ai_usage');
}
function trialAiDir() {
  return path.join(DATA_DIR, 'trial_ai');
}
function simInvariantSnapshotsDir() {
  return path.join(DATA_DIR, 'sim-invariant-snapshots');
}
function stripeCustomersFile() {
  return path.join(DATA_DIR, 'stripe_customers.json');
}

module.exports = {
  APP_ROOT,
  PERSIST_ROOT,
  GAME_DATA_DIR,
  DATA_DIR,
  SAVES_DIR,
  GENERATED_LOGOS_DIR,
  GENERATED_PORTRAITS_DIR,
  GENERATED_JINGLES_DIR,
  GENERATED_REMOTE_VANS_DIR,
  ensureDir,
  cloudSavesDir,
  aiUsageDir,
  guestAiUsageDir,
  trialAiDir,
  simInvariantSnapshotsDir,
  stripeCustomersFile,
};
