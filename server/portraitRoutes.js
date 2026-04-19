/**
 * POST /api/generate-portrait — stock library first (gender + era + fallbacks), then ShortAPI, then xAI/Grok.
 */

const fs = require('fs');
const path = require('path');
const {
  portraitFileBase,
  eraBucketFromYear,
  derivePortraitProfile,
  deriveAppearanceTraits,
  portraitHashKey,
  portraitIdentityKey,
} = require('./portraitIdentity');
const { buildPortraitPrompt } = require('./portraitPrompt');
const {
  generateXaiImage,
  generateShortapiImage,
  imageGenerationConfigured,
  getActiveImageProvider,
} = require('./services/logoProvider');
const { PORTRAIT_DIR, getRegistryEntry, setRegistryEntry, ensureDir } = require('./portraitRegistry');
const {
  pickLibraryImageExclusive,
  libraryRelativePortraitsPath,
  libraryInventory,
  grokInventory,
  libraryFirstEnabled,
  normalizeEraDir,
  ERA_DIRS,
} = require('./portraitLibrary');

function shortapiConfigured() {
  return Boolean(process.env.SHORTAPI_KEY);
}

/**
 * @param {object} body
 * @returns {{ claimedLibraryAssets: string[], gamePortraitSession: string | null }}
 */
function readPortraitClaimBody(body) {
  const claimedLibraryAssets = Array.isArray(body?.claimedLibraryAssets)
    ? body.claimedLibraryAssets
        .filter((x) => typeof x === 'string' && x.length < 600)
        .map((x) => x.replace(/\\/g, '/').trim())
    : [];
  let gamePortraitSession = null;
  if (body?.gamePortraitSession != null && typeof body.gamePortraitSession === 'string') {
    const t = body.gamePortraitSession.trim();
    if (t.length > 0 && t.length <= 96) gamePortraitSession = t;
  }
  return { claimedLibraryAssets, gamePortraitSession };
}

const TRY_EXTS = ['png', 'webp', 'jpg'];
const TRY_DOT_EXTS = ['.png', '.webp', '.jpg'];

/**
 * @returns {{ absPath: string, relPosix: string } | null}
 * relPosix is relative to PORTRAIT_DIR with forward slashes (for URLs + registry).
 */
function locateExistingPortraitFile(fileBase) {
  const reg = getRegistryEntry(fileBase);
  if (reg?.fileName && typeof reg.fileName === 'string') {
    const normalized = reg.fileName.replace(/\\/g, path.sep);
    const absReg = path.join(PORTRAIT_DIR, normalized);
    if (fs.existsSync(absReg)) {
      return { absPath: absReg, relPosix: reg.fileName.split(path.sep).join('/') };
    }
  }
  for (const e of TRY_EXTS) {
    const flat = path.join(PORTRAIT_DIR, `${fileBase}.${e}`);
    if (fs.existsSync(flat)) return { absPath: flat, relPosix: `${fileBase}.${e}` };
  }
  const grokRoot = path.join(PORTRAIT_DIR, 'grok');
  if (fs.existsSync(grokRoot)) {
    for (const gender of ['male', 'female', 'unknown']) {
      for (const era of ERA_DIRS) {
        for (const e of TRY_EXTS) {
          const relSegs = ['grok', gender, era, `${fileBase}.${e}`];
          const abs = path.join(PORTRAIT_DIR, ...relSegs);
          if (fs.existsSync(abs)) {
            return { absPath: abs, relPosix: relSegs.join('/') };
          }
        }
      }
    }
  }
  return null;
}

/** Remove other extension variants for this fileBase (flat + grok tree). */
function unlinkPortraitVariantsExcept(fileBase, keepAbsPath) {
  for (const dotExt of TRY_DOT_EXTS) {
    const flat = path.join(PORTRAIT_DIR, `${fileBase}${dotExt}`);
    if (fs.existsSync(flat) && flat !== keepAbsPath) {
      try {
        fs.unlinkSync(flat);
      } catch (_e) {}
    }
    const grokRoot = path.join(PORTRAIT_DIR, 'grok');
    if (fs.existsSync(grokRoot)) {
      for (const gender of ['male', 'female', 'unknown']) {
        for (const era of ERA_DIRS) {
          const p = path.join(grokRoot, gender, era, `${fileBase}${dotExt}`);
          if (fs.existsSync(p) && p !== keepAbsPath) {
            try {
              fs.unlinkSync(p);
            } catch (_e) {}
          }
        }
      }
    }
  }
}

function validateBody(body) {
  const err = [];
  if (!body || typeof body !== 'object') err.push('Body required.');
  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) err.push('name is required.');
  else if (name.length > 100) err.push('name too long.');
  const y = Number(body.firstHireYear);
  if (!Number.isFinite(y) || y < 1950 || y > 2040) err.push('firstHireYear must be 1950–2040.');
  const g = body.gender;
  if (g != null && g !== 'male' && g !== 'female') err.push('gender must be male or female if provided.');
  if (body.talentId != null && typeof body.talentId !== 'string') err.push('talentId must be a string if provided.');
  return err;
}

function readOptionalPortraitGameplay(body) {
  const talentId =
    typeof body.talentId === 'string' && body.talentId.trim() ? body.talentId.trim() : null;
  let morale = Number(body.morale);
  if (!Number.isFinite(morale)) morale = undefined;
  else morale = Math.max(0, Math.min(100, morale));
  let quality = Number(body.quality);
  if (!Number.isFinite(quality)) quality = undefined;
  else quality = Math.max(0, Math.min(100, quality));
  let yearsExperience = Number(body.yearsExperience);
  if (!Number.isFinite(yearsExperience)) yearsExperience = undefined;
  else yearsExperience = Math.max(0, Math.min(80, Math.floor(yearsExperience)));
  return { talentId, morale, quality, yearsExperience };
}

function mountPortraitRoutes(app) {
  ensureDir();

  app.get('/api/portrait-library/status', (_req, res) => {
    try {
      const inv = libraryInventory();
      const grok = grokInventory();
      return res.json({
        ok: true,
        ...inv,
        grok,
        note:
          'library = hand-placed stock pool for random assignment; grok = AI-generated portraits saved by gender/era.',
        libraryFirst: libraryFirstEnabled(),
        grokConfigured: Boolean(process.env.GROK_API_KEY),
        shortapiConfigured: Boolean(process.env.SHORTAPI_KEY),
        imageGenerationConfigured: imageGenerationConfigured(),
        activeImageProvider: getActiveImageProvider(),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  app.post('/api/generate-portrait', async (req, res) => {
    const verr = validateBody(req.body || {});
    if (verr.length) {
      return res.status(400).json({ ok: false, error: verr.join(' ') });
    }

    const name = req.body.name.trim();
    const firstHireYear = Math.floor(Number(req.body.firstHireYear));
    const gender = req.body.gender === 'female' ? 'female' : req.body.gender === 'male' ? 'male' : null;
    const { talentId, morale, quality, yearsExperience } = readOptionalPortraitGameplay(req.body);
    const { claimedLibraryAssets, gamePortraitSession } = readPortraitClaimBody(req.body || {});
    const claimedSet = new Set(claimedLibraryAssets);
    const fileBase = portraitFileBase(name, firstHireYear, gamePortraitSession || undefined);
    const eraBucket = eraBucketFromYear(firstHireYear);
    const identitySlug = fileBase;
    const hashKey = portraitHashKey(identitySlug, talentId);

    try {
      const located = locateExistingPortraitFile(fileBase);
      const reg = getRegistryEntry(fileBase);
      if (located) {
        const imageUrl = `/generated-portraits/${located.relPosix}`;
        if (!reg?.imageUrl) {
          const traits = derivePortraitProfile(identitySlug, talentId);
          const appearance = deriveAppearanceTraits(hashKey, {
            yearsExperience,
            morale,
            quality,
            eraBucket,
            gender,
          });
          setRegistryEntry(fileBase, {
            imageUrl,
            fileName: located.relPosix,
            eraBucket,
            wardrobeType: traits.wardrobeType,
            expressionType: traits.expressionType,
            settingType: traits.settingType,
            identityKey: portraitIdentityKey(name, firstHireYear),
            name,
            firstHireYear,
            gender,
            ...appearance,
          });
        }
        const r = getRegistryEntry(fileBase);
        return res.json({
          ok: true,
          cached: true,
          libraryAsset: r?.libraryAsset ?? null,
          source: r?.source ?? null,
          imageUrl: r?.imageUrl || imageUrl,
          profile: {
            eraBucket: r?.eraBucket || eraBucket,
            wardrobeType: r?.wardrobeType,
            expressionType: r?.expressionType,
            settingType: r?.settingType,
            identityKey: portraitIdentityKey(name, firstHireYear),
            gender: r?.gender ?? gender,
            ageRange: r?.ageRange,
            bodyType: r?.bodyType,
            faceShape: r?.faceShape,
            hairStyle: r?.hairStyle,
            personalStyle: r?.personalStyle,
            heritageId: r?.heritageId,
            heritagePrompt: r?.heritagePrompt,
            facialDetail: r?.facialDetail,
            demeanor: r?.demeanor,
            attractivenessAnchor: r?.attractivenessAnchor,
            variationSeed: r?.variationSeed,
            libraryAsset: r?.libraryAsset ?? null,
          },
        });
      }

      const traits = derivePortraitProfile(identitySlug, talentId);
      const appearance = deriveAppearanceTraits(hashKey, {
        yearsExperience,
        morale,
        quality,
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
        talentId: talentId || undefined,
        ...appearance,
      };

      if (gender) {
        const libSrc = pickLibraryImageExclusive(gender, eraBucket, claimedSet);
        if (libSrc) {
          // Point at the library file directly — no per-talent copy under generated-portraits/ root (saves disk).
          const libraryRel = libraryRelativePortraitsPath(libSrc).replace(/\\/g, '/');
          const imageUrl = `/generated-portraits/${libraryRel}`;
          setRegistryEntry(fileBase, {
            imageUrl,
            fileName: libraryRel,
            ...profile,
            source: 'library',
            libraryAsset: libraryRel,
          });
          return res.json({
            ok: true,
            cached: false,
            source: 'library',
            libraryAsset: libraryRel,
            imageUrl,
            profile: {
              eraBucket: profile.eraBucket,
              wardrobeType: profile.wardrobeType,
              expressionType: profile.expressionType,
              settingType: profile.settingType,
              identityKey: profile.identityKey,
              gender: profile.gender,
              ageRange: profile.ageRange,
              bodyType: profile.bodyType,
              faceShape: profile.faceShape,
              hairStyle: profile.hairStyle,
              personalStyle: profile.personalStyle,
              heritageId: profile.heritageId,
              heritagePrompt: profile.heritagePrompt,
              facialDetail: profile.facialDetail,
              demeanor: profile.demeanor,
              attractivenessAnchor: profile.attractivenessAnchor,
              variationSeed: profile.variationSeed,
              libraryAsset: libraryRel,
            },
          });
        }
      }

      const prompt = buildPortraitPrompt(profile);
      let buffer;
      let ext;
      let aiSource;
      if (shortapiConfigured()) {
        const r = await generateShortapiImage({ prompt, aspect_ratio: '1:1' });
        buffer = r.buffer;
        ext = r.ext;
        aiSource = 'shortapi';
      } else if (imageGenerationConfigured()) {
        const r = await generateXaiImage({ prompt, aspect_ratio: '1:1' });
        buffer = r.buffer;
        ext = r.ext;
        aiSource = getActiveImageProvider() || 'ai';
      } else {
        return res.status(503).json({
          ok: false,
          error:
            'No portrait source: add stock images under generated-portraits/library/<male|female>/<era>/ (and enable library picks), or set SHORTAPI_KEY / GROK_API_KEY.',
        });
      }
      const safeExt = TRY_EXTS.includes(ext) ? ext : 'png';
      const genderSeg =
        gender === 'male' ? 'male' : gender === 'female' ? 'female' : 'unknown';
      const eraSeg = normalizeEraDir(eraBucket);
      const relSegs = ['grok', genderSeg, eraSeg, `${fileBase}.${safeExt}`];
      const absPath = path.join(PORTRAIT_DIR, ...relSegs);
      const relPosix = relSegs.join('/');
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      unlinkPortraitVariantsExcept(fileBase, absPath);
      fs.writeFileSync(absPath, buffer);

      const imageUrl = `/generated-portraits/${relPosix}`;
      setRegistryEntry(fileBase, {
        imageUrl,
        fileName: relPosix,
        ...profile,
        source: aiSource,
        libraryAsset: null,
      });

      return res.json({
        ok: true,
        cached: false,
        source: aiSource,
        libraryAsset: null,
        imageUrl,
        profile: {
          eraBucket: profile.eraBucket,
          wardrobeType: profile.wardrobeType,
          expressionType: profile.expressionType,
          settingType: profile.settingType,
          identityKey: profile.identityKey,
          gender: profile.gender,
          ageRange: profile.ageRange,
          bodyType: profile.bodyType,
          faceShape: profile.faceShape,
          hairStyle: profile.hairStyle,
          personalStyle: profile.personalStyle,
          heritageId: profile.heritageId,
          heritagePrompt: profile.heritagePrompt,
          facialDetail: profile.facialDetail,
          demeanor: profile.demeanor,
          attractivenessAnchor: profile.attractivenessAnchor,
          variationSeed: profile.variationSeed,
          libraryAsset: null,
        },
      });
    } catch (e) {
      const status = e.status && Number.isInteger(e.status) ? e.status : 500;
      console.error('[portrait]', e.message || e);
      const detail = String(e.message || 'Portrait generation failed').slice(0, 400);
      return res.status(status).json({ ok: false, error: detail });
    }
  });
}

module.exports = { mountPortraitRoutes, PORTRAIT_DIR };
