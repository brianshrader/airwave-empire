#!/usr/bin/env node
/**
 * Thin wrapper: runs talent diagnostics in sensitivity mode unless --mode= is set.
 *   node scripts/compare-talent-sensitivity.mjs
 *   node scripts/compare-talent-sensitivity.mjs --markets=chicago --years=2005
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'diagnose-talent-costs.mjs');
const userArgs = process.argv.slice(2);
const hasMode = userArgs.some((a) => a.startsWith('--mode='));
const args = hasMode ? [script, ...userArgs] : [script, '--mode=sensitivity', ...userArgs];
const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
