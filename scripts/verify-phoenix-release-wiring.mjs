#!/usr/bin/env node
/** @deprecated Use verify-market-registry.mjs — thin alias for older docs/scripts. */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-market-registry.mjs')], {
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
