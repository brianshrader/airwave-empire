#!/usr/bin/env node
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function extractAutosaveSlice(relPath) {
  const src = readFileSync(path.join(root, relPath), 'utf8');
  const start = src.indexOf('async function wlFetchRollingCloudAutosavePayload()');
  const uploadStart = src.indexOf('function wlCloudSaveUploadStatus', start);
  const loadStart = src.indexOf('function loadLocalSave()', uploadStart);
  const exportEnd = src.indexOf('\n}\n\n// ── LOAN UI', loadStart);
  if (start < 0 || uploadStart < 0 || loadStart < 0 || exportEnd < 0) {
    throw new Error(`Could not extract autosave slice from ${relPath}`);
  }
  return `${src.slice(start, uploadStart)}\n${src.slice(loadStart, exportEnd + 3)}`;
}

function makeCtx({ local, cloud, cloudSaved, eligible = true }) {
  const applied = [];
  const toasts = [];
  const storageWrites = [];
  const fetches = [];
  const ctx = vm.createContext({
    console,
    Date,
    JSON,
    Promise,
    Number,
    SAVE_KEY: 'wl-save',
    LEGACY_SAVE_KEY: 'legacy-wl-save',
    window: null,
    globalThis: null,
    localStorage: {
      setItem(key, value) {
        storageWrites.push({ key, value: JSON.parse(value) });
      },
      removeItem(key) {
        storageWrites.push({ key, removed: true });
      },
    },
    wlCloudAutosaveEligible() {
      return eligible;
    },
    async wlGetClerkToken() {
      return 'token';
    },
    wlGameApiUrl(p) {
      return p;
    },
    async fetch(url) {
      fetches.push(url);
      if (!cloud) {
        return { status: 404, ok: false, json: async () => ({}) };
      }
      if (url.endsWith('/meta')) {
        return { status: 200, ok: true, json: async () => ({ saved: cloudSaved }) };
      }
      return { status: 200, ok: true, json: async () => cloud };
    },
    getLocalSave() {
      return local;
    },
    async wlApplyLoadedGamePayload(payload, opts) {
      applied.push({ payload, opts });
      return {};
    },
    showToast(msg, kind) {
      toasts.push({ msg, kind });
    },
    __applied: applied,
    __toasts: toasts,
    __storageWrites: storageWrites,
    __fetches: fetches,
  });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return ctx;
}

function game(label, saved, year) {
  return {
    label,
    saved,
    G: {
      year,
      period: 1,
      sc: { id: 'classic' },
      stations: [{ id: `${label}-station` }],
    },
  };
}

function sameSavedGame(a, b) {
  return a?.label === b?.label && a?.saved === b?.saved && a?.G?.year === b?.G?.year;
}

async function runCase(relPath, name, fn) {
  try {
    await fn();
    console.log(`OK ${relPath} ${name}`);
  } catch (e) {
    console.error(`FAIL ${relPath} ${name}:`, e.message);
    process.exitCode = 1;
  }
}

async function runSuite(relPath) {
  const code = extractAutosaveSlice(relPath);

  await runCase(relPath, 'resume picks newer cloud autosave and syncs localStorage', async () => {
    const local = game('local-old', '2026-01-01T00:00:00.000Z', 2001);
    const cloud = game('cloud-new', '2026-02-01T00:00:00.000Z', 2002);
    const ctx = makeCtx({ local, cloud, cloudSaved: cloud.saved });
    vm.runInContext(code, ctx, { filename: relPath });
    await vm.runInContext('loadLocalSaveAsync()', ctx);
    assert(ctx.__applied.length === 1, 'expected one loaded payload');
    assert(ctx.__applied[0].payload === cloud, 'expected cloud payload to load');
    assert(ctx.__applied[0].opts.source === 'cloud_autosave', 'expected cloud source');
    assert(ctx.__storageWrites.some((w) => w.key === 'wl-save' && sameSavedGame(w.value, cloud)), 'expected cloud payload to sync to localStorage');
    assert(ctx.__toasts.some((t) => t.msg === 'Resumed from your latest save.'), 'expected latest-save toast');
  });

  await runCase(relPath, 'resume keeps newer local autosave', async () => {
    const local = game('local-new', '2026-03-01T00:00:00.000Z', 2003);
    const cloud = game('cloud-old', '2026-02-01T00:00:00.000Z', 2002);
    const ctx = makeCtx({ local, cloud, cloudSaved: cloud.saved });
    vm.runInContext(code, ctx, { filename: relPath });
    await vm.runInContext('wlResumeBestAutosave()', ctx);
    assert(ctx.__applied.length === 1, 'expected one loaded payload');
    assert(ctx.__applied[0].payload === local, 'expected local payload to load');
    assert(ctx.__applied[0].opts.source === 'resume_autosave', 'expected local resume source');
    assert(!ctx.__storageWrites.some((w) => w.key === 'wl-save'), 'did not expect localStorage overwrite');
  });

  await runCase(relPath, 'force cloud loads cloud even when local is newer', async () => {
    const local = game('local-new', '2026-03-01T00:00:00.000Z', 2003);
    const cloud = game('cloud-old', '2026-02-01T00:00:00.000Z', 2002);
    const ctx = makeCtx({ local, cloud, cloudSaved: cloud.saved });
    vm.runInContext(code, ctx, { filename: relPath });
    await vm.runInContext('wlCloudSaveLoadRollingAutosave()', ctx);
    assert(ctx.__applied.length === 1, 'expected one loaded payload');
    assert(ctx.__applied[0].payload === cloud, 'expected forced cloud payload to load');
    assert(ctx.__applied[0].opts.source === 'cloud_autosave', 'expected cloud source');
  });

  await runCase(relPath, 'init sync returns newer cloud payload without loading game', async () => {
    const local = game('local-old', '2026-01-01T00:00:00.000Z', 2001);
    const cloud = game('cloud-new', '2026-02-01T00:00:00.000Z', 2002);
    const ctx = makeCtx({ local, cloud, cloudSaved: cloud.saved });
    vm.runInContext(code, ctx, { filename: relPath });
    const res = await vm.runInContext('wlCloudAutosaveTryResumeOnInit(getLocalSave())', ctx);
    assert(res?.payload === cloud, 'expected init to return cloud payload');
    assert(ctx.__applied.length === 0, 'init sync should not load the game');
    assert(ctx.__storageWrites.some((w) => w.key === 'wl-save' && sameSavedGame(w.value, cloud)), 'expected init to sync localStorage');
  });
}

await runSuite('src/legacy.js');
await runSuite('dist/src/legacy.js');

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('All cloud autosave resume checks passed.');
