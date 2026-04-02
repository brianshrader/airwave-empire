#!/usr/bin/env node
/**
 * Batch-generate stock portraits into generated-portraits/library/{male|female}/{era}/
 * using the same prompt pipeline as POST /api/generate-portrait (preferGrok path).
 *
 * Requires SHORTAPI_KEY and/or GROK_API_KEY (see IMAGE_GEN_PROVIDER in server).
 * Loads .env from the repo root.
 *
 * Usage:
 *   node scripts/batch-generate-portrait-library.mjs                    # plan only (dry-run)
 *   node scripts/batch-generate-portrait-library.mjs --apply            # generate (defaults below)
 *   node scripts/batch-generate-portrait-library.mjs --apply --male 50 --female 50
 *   node scripts/batch-generate-portrait-library.mjs --apply --delay-ms 1500 --max 5
 *
 * Defaults: --male 250 --female 250 split evenly across 1980s, 1990s, 2000s+.
 */

import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

require('dotenv').config({ path: path.join(root, '.env') });

const { PORTRAIT_DIR, ensureDir } = require('../server/portraitRegistry.js');
const {
  portraitFileBase,
  eraBucketFromYear,
  portraitHashKey,
  portraitIdentityKey,
  derivePortraitProfile,
  deriveAppearanceTraits,
} = require('../server/portraitIdentity.js');
const { buildPortraitPrompt } = require('../server/portraitPrompt.js');
const { generateXaiImage, imageGenerationConfigured } = require('../server/services/logoProvider.js');
const { normalizeEraDir } = require('../server/portraitLibrary.js');

const ERAS = ['1980s', '1990s', '2000s+'];
const TRY_EXTS = ['png', 'webp', 'jpg'];

function parseArgs(argv) {
  const a = { apply: false, male: 250, female: 250, delayMs: 1000, max: null, bail: false };
  for (let i = 2; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--apply') a.apply = true;
    else if (x === '--bail') a.bail = true;
    else if (x === '--male') a.male = Math.max(0, Number(argv[++i]));
    else if (x === '--female') a.female = Math.max(0, Number(argv[++i]));
    else if (x === '--delay-ms') a.delayMs = Math.max(0, Number(argv[++i]) || 0);
    else if (x === '--max') {
      const v = Number(argv[++i]);
      if (Number.isFinite(v) && v >= 0) a.max = v;
    }
  }
  return a;
}

/** @param {number} n @param {number} parts */
function splitTotal(n, parts) {
  const base = Math.floor(n / parts);
  const rem = n % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0));
}

/** @param {string} era */
function randomYearInEra(era) {
  if (era === '1980s') return 1980 + Math.floor(Math.random() * 10);
  if (era === '1990s') return 1990 + Math.floor(Math.random() * 10);
  return 2000 + Math.floor(Math.random() * 21);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {{ name: string, firstHireYear: number, gender: 'male'|'female', talentId?: string }} p
 */
async function generateOneLibraryPortrait(p) {
  const { name, firstHireYear, gender } = p;
  const talentId = p.talentId || `batch-${Date.now()}`;
  const fileBase = portraitFileBase(name, firstHireYear);
  const eraBucket = eraBucketFromYear(firstHireYear);
  const identitySlug = fileBase;
  const hashKey = portraitHashKey(identitySlug, talentId);

  const traits = derivePortraitProfile(identitySlug, talentId);
  const appearance = deriveAppearanceTraits(hashKey, {
    eraBucket,
    gender,
  });
  const profile = {
    eraBucket,
    wardrobeType: traits.wardrobeType,
    expressionType: traits.expressionType,
    settingType: traits.settingType,
    identityKey: portraitIdentityKey(name, firstHireYear),
    name,
    firstHireYear,
    gender,
    talentId,
    ...appearance,
  };

  const prompt = buildPortraitPrompt(profile);
  const { buffer, ext } = await generateXaiImage({ prompt, aspect_ratio: '1:1' });
  const safeExt = TRY_EXTS.includes(ext) ? ext : 'png';
  const eraSeg = normalizeEraDir(eraBucket);
  const relSegs = ['library', gender, eraSeg, `${fileBase}.${safeExt}`];
  const absPath = path.join(PORTRAIT_DIR, ...relSegs);
  ensureDir();
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, buffer);
  return { absPath, relSegs: relSegs.join('/') };
}

async function main() {
  const args = parseArgs(process.argv);

  const plan = [];
  let seq = 0;
  planLoop: for (const gender of ['male', 'female']) {
    const total = gender === 'male' ? args.male : args.female;
    const splits = splitTotal(total, ERAS.length);
    for (let ei = 0; ei < ERAS.length; ei++) {
      const eraBucket = ERAS[ei];
      const count = splits[ei];
      for (let i = 0; i < count; i++) {
        if (args.max != null && plan.length >= args.max) break planLoop;
        seq++;
        const firstHireYear = randomYearInEra(eraBucket);
        const name = `Stock ${gender} ${eraBucket} ${seq}`;
        plan.push({ name, firstHireYear, gender, eraBucket });
      }
    }
  }

  console.log(`Planned generations: ${plan.length} (male total ${args.male}, female total ${args.female}, eras ${ERAS.join(', ')})`);
  const byEra = { '1980s': 0, '1990s': 0, '2000s+': 0 };
  for (const row of plan) byEra[row.eraBucket]++;
  console.log('By era:', byEra);
  console.log(`Delay between calls: ${args.delayMs}ms (~${Math.ceil((plan.length * args.delayMs) / 60000)} min sleep-only)`);

  if (!args.apply) {
    console.log('\nDry run — no API calls. Pass --apply to generate.');
    return;
  }

  if (plan.length === 0) {
    console.log('Nothing to generate (totals or --max 0).');
    return;
  }

  if (!imageGenerationConfigured()) {
    console.error('No image API configured. Set SHORTAPI_KEY and/or GROK_API_KEY (and optionally IMAGE_GEN_PROVIDER).');
    process.exit(1);
  }

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < plan.length; i++) {
    const row = plan[i];
    const talentId = `batch-${row.gender}-${row.eraBucket}-${i}`;
    try {
      const { relSegs } = await generateOneLibraryPortrait({
        name: row.name,
        firstHireYear: row.firstHireYear,
        gender: row.gender,
        talentId,
      });
      ok++;
      console.log(`[${i + 1}/${plan.length}] OK ${relSegs}`);
    } catch (e) {
      fail++;
      console.error(`[${i + 1}/${plan.length}] FAIL ${row.name}:`, e.message || e);
      if (args.bail) process.exit(1);
    }
    if (i < plan.length - 1 && args.delayMs > 0) await sleep(args.delayMs);
  }

  console.log(`\nDone. ${ok} written, ${fail} failed.`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
