/**
 * JSON registry for talent portraits — maps identity slug → file + traits.
 */

const fs = require('fs');
const path = require('path');
const { GENERATED_PORTRAITS_DIR, ensureDir } = require('./runtimePaths');

const PORTRAIT_DIR = GENERATED_PORTRAITS_DIR;
const REGISTRY_PATH = path.join(PORTRAIT_DIR, 'registry.json');

function ensurePortraitDir() {
  ensureDir(PORTRAIT_DIR);
}

/** @returns {{ entries: Object<string, object> }} */
function readRegistry() {
  ensurePortraitDir();
  if (!fs.existsSync(REGISTRY_PATH)) return { entries: {} };
  try {
    const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    if (!data || typeof data.entries !== 'object') return { entries: {} };
    return data;
  } catch {
    return { entries: {} };
  }
}

/** @param {{ entries: Object }} reg */
function writeRegistry(reg) {
  ensurePortraitDir();
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), 'utf8');
}

/**
 * @param {string} fileBase — without extension
 * @param {object} entry
 */
function setRegistryEntry(fileBase, entry) {
  const reg = readRegistry();
  reg.entries[fileBase] = entry;
  writeRegistry(reg);
}

/** @param {string} fileBase */
function getRegistryEntry(fileBase) {
  return readRegistry().entries[fileBase] || null;
}

module.exports = {
  PORTRAIT_DIR,
  REGISTRY_PATH,
  readRegistry,
  writeRegistry,
  setRegistryEntry,
  getRegistryEntry,
  ensureDir: ensurePortraitDir,
};
