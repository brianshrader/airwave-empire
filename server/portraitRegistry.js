/**
 * JSON registry for talent portraits — maps identity slug → file + traits.
 */

const fs = require('fs');
const path = require('path');

const PORTRAIT_DIR = path.join(__dirname, '..', 'generated-portraits');
const REGISTRY_PATH = path.join(PORTRAIT_DIR, 'registry.json');

function ensureDir() {
  if (!fs.existsSync(PORTRAIT_DIR)) fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
}

/** @returns {{ entries: Object<string, object> }} */
function readRegistry() {
  ensureDir();
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
  ensureDir();
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
  ensureDir,
};
