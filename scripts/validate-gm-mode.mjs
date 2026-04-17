/**
 * Validates gmMode.js self-test in Node (no browser).
 * Run: node scripts/validate-gm-mode.mjs
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(join(__dirname, '../src/gmMode.js'), 'utf8');
eval(src);

const r = globalThis.wlGmMode.runSelfTest();
console.log('GM mode self-test:', JSON.stringify(r, null, 2));
if (!r || !r.ok || r.reviews < 1) {
  console.error('validate-gm-mode: failed');
  process.exit(1);
}
console.log('validate-gm-mode: ok');
