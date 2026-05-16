/**
 * Preload market ecology IIFE into a VM context before `legacy.js` so `modernChrPressure01`
 * can delegate to `deriveMarketEcology` (globalThis.__wlDeriveMarketEcology).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IIFE_PATH = path.join(ROOT, 'src', 'marketEcologyCore.iife.js');

export function injectMarketEcologyIife(ctx) {
  const code = readFileSync(IIFE_PATH, 'utf8');
  vm.runInContext(code, ctx, { filename: 'marketEcologyCore.iife.js' });
}
