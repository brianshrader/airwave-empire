/**
 * POST /api/generate-portrait — cosmetic talent portraits (Grok / xAI).
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
const { generateXaiImage } = require('./services/logoProvider');
const { PORTRAIT_DIR, getRegistryEntry, setRegistryEntry, ensureDir } = require('./portraitRegistry');
const {
  pickRandomLibraryImage,
  libraryRelativePortraitsPath,
  installLibraryFileToPortrait,
  libraryInventory,
  libraryFirstEnabled,
} = require('./portraitLibrary');

const TRY_EXTS = ['png', 'webp', 'jpg'];

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
      return res.json({
        ok: true,
        ...inv,
        libraryFirst: libraryFirstEnabled(),
        grokConfigured: Boolean(process.env.GROK_API_KEY),
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
    const preferGrok = req.body.preferGrok === true;
    const { talentId, morale, quality, yearsExperience } = readOptionalPortraitGameplay(req.body);
    const fileBase = portraitFileBase(name, firstHireYear);
    const eraBucket = eraBucketFromYear(firstHireYear);
    const identitySlug = fileBase;
    const hashKey = portraitHashKey(identitySlug, talentId);

    try {
      const existingPath = TRY_EXTS.map((e) => path.join(PORTRAIT_DIR, `${fileBase}.${e}`)).find((p) =>
        fs.existsSync(p)
      );
      const reg = getRegistryEntry(fileBase);
      if (existingPath) {
        const ext = path.extname(existingPath).slice(1) || 'png';
        const imageUrl = `/generated-portraits/${fileBase}.${ext}`;
        if (!reg?.imageUrl) {
          const traits = derivePortraitProfile(identitySlug, talentId);
          const appearance = deriveAppearanceTraits(hashKey, {
            yearsExperience,
            morale,
            quality,
            eraBucket,
          });
          setRegistryEntry(fileBase, {
            imageUrl,
            fileName: `${fileBase}.${ext}`,
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
            variationSeed: r?.variationSeed,
          },
        });
      }

      const traits = derivePortraitProfile(identitySlug, talentId);
      const appearance = deriveAppearanceTraits(hashKey, {
        yearsExperience,
        morale,
        quality,
        eraBucket,
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

      if (!preferGrok && libraryFirstEnabled() && gender) {
        const libSrc = pickRandomLibraryImage(gender, eraBucket);
        if (libSrc) {
          const { finalName } = installLibraryFileToPortrait(libSrc, fileBase, PORTRAIT_DIR);
          const imageUrl = `/generated-portraits/${finalName}`;
          const libraryRel = libraryRelativePortraitsPath(libSrc);
          setRegistryEntry(fileBase, {
            imageUrl,
            fileName: finalName,
            ...profile,
            source: 'library',
            libraryAsset: libraryRel,
          });
          return res.json({
            ok: true,
            cached: false,
            source: 'library',
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
              variationSeed: profile.variationSeed,
            },
          });
        }
      }

      if (!process.env.GROK_API_KEY) {
        return res.status(503).json({
          ok: false,
          error:
            'No portrait source: add images under generated-portraits/library/<male|female>/<era>/ or set GROK_API_KEY.',
        });
      }

      const prompt = buildPortraitPrompt(profile);
      const { buffer, ext } = await generateXaiImage({ prompt, aspect_ratio: '1:1' });
      const safeExt = TRY_EXTS.includes(ext) ? ext : 'png';
      const finalName = `${fileBase}.${safeExt}`;
      const absPath = path.join(PORTRAIT_DIR, finalName);

      for (const e of TRY_EXTS) {
        const p = path.join(PORTRAIT_DIR, `${fileBase}.${e}`);
        if (fs.existsSync(p) && p !== absPath) fs.unlinkSync(p);
      }
      fs.writeFileSync(absPath, buffer);

      const imageUrl = `/generated-portraits/${finalName}`;
      setRegistryEntry(fileBase, {
        imageUrl,
        fileName: finalName,
        ...profile,
        source: 'grok',
      });

      return res.json({
        ok: true,
        cached: false,
        source: 'grok',
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
          variationSeed: profile.variationSeed,
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
