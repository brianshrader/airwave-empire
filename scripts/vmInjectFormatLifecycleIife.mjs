/**
 * Preload format lifecycle profile IIFE before legacy.js (Portland COUNTRY mktFmt bridge).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IIFE_PATH = path.join(ROOT, 'src', 'formatLifecycleProfileRuntime.iife.js');

export function injectFormatLifecycleIife(ctx) {
  const code = readFileSync(IIFE_PATH, 'utf8');
  vm.runInContext(code, ctx, { filename: 'formatLifecycleProfileRuntime.iife.js' });
}
