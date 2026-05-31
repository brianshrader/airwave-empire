#!/usr/bin/env node
/**
 * Phoenix scaffold reality audit — dial/signal/metadata vs runtime (read-only).
 * Does not change gameplay or market exposure. Phoenix remains DIAG_ONLY.
 *
 *   npm run diag:phoenix-scaffold-reality
 *
 * @see tmp/market_scaffold/phoenix/*
 * @see tmp/phoenix_internal_playtest_harness.json (optional cross-check)
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  ALL_PLAYABLE_MARKET_IDS,
  DIAG_ONLY_MARKET_IDS,
} = require('./market-ids.cjs');
const {
  ALL_PLAYABLE_MARKET_IDS_ORDERED,
  STARTER_MARKET_IDS,
  PRO_ONLY_MARKET_IDS,
  marketIdsForPlanSlug,
} = require('../server/planMarkets.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const scaffoldDir = path.join(root, 'tmp', 'market_scaffold', 'phoenix');
const legacyPath = path.join(root, 'src', 'legacy.js');
const playtestHarnessPath = path.join(root, 'tmp', 'phoenix_internal_playtest_harness.json');
const outJson = path.join(root, 'tmp', 'phoenix_scaffold_reality.json');

const PHOENIX = 'phoenix';

/** Large-tier gameplay dial bands (not mega NYC/LA). */
const LARGE_DIAL = {
  amCommercial: [10, 14],
  fmCommercial: [18, 22],
  fmNce: [2, 4],
  totalTokens: [30, 38],
  minFmSpacingMhz: 0.55,
};

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function readJsonOptional(p) {
  if (!existsSync(p)) return null;
  try {
    return readJson(p);
  } catch {
    return null;
  }
}

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function check(level, code, message, detail = {}) {
  return { level, code, message, detail };
}

function extractBracketArray(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return [];
  const start = src.indexOf('[', i);
  if (start < 0) return [];
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    const ch = src[j];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        const inner = src.slice(start + 1, j);
        const items = inner.match(/'([^']+)'/g);
        return items ? items.map((s) => s.slice(1, -1)) : [];
      }
    }
  }
  return [];
}

function extractPhoenixLegacySlice(legacySrc) {
  const start = legacySrc.indexOf('phoenix:{');
  if (start < 0) return '';
  const end = legacySrc.indexOf('\n  portland:{', start);
  return legacySrc.slice(start, end > start ? end : start + 12000);
}

function parseLaunchCount(slice, key) {
  const m = slice.match(new RegExp(`${key}:\\[([\\s\\S]*?)\\],`));
  if (!m) return 0;
  return (m[1].match(/\{id:/g) || []).length;
}

function extractMarketBpPatch(legacySrc) {
  const patchStart = legacySrc.indexOf('const MARKET_BP_PATCH=');
  if (patchStart < 0) return {};
  const phxStart = legacySrc.indexOf('phoenix:{', patchStart);
  if (phxStart < 0) return {};
  const phxEnd = legacySrc.indexOf('\n  },', phxStart);
  const block = legacySrc.slice(phxStart, phxEnd > phxStart ? phxEnd + 4 : phxStart + 800);
  const slots = {};
  for (const m of block.matchAll(/(\d+):\{fmt:'([^']+)',str:'([^']+)'/g)) {
    slots[m[1]] = { fmt: m[2], str: m[3] };
  }
  return slots;
}

function fmMhz(freq) {
  const m = String(freq).match(/(\d{2,3}\.\d|\d{2,3})\s*FM/i);
  return m ? parseFloat(m[1]) : null;
}

function amKhz(freq) {
  const m = String(freq).match(/(\d{3,4})\s*AM/i);
  return m ? parseInt(m[1], 10) : null;
}

function findDuplicates(freqs) {
  const seen = new Set();
  const dups = [];
  for (const f of freqs) {
    const k = String(f).trim().toUpperCase();
    if (seen.has(k)) dups.push(k);
    seen.add(k);
  }
  return [...new Set(dups)];
}

function minFmSpacingMhz(fmFreqs) {
  const mhz = fmFreqs.map(fmMhz).filter((x) => x != null).sort((a, b) => a - b);
  if (mhz.length < 2) return null;
  let min = Infinity;
  for (let i = 1; i < mhz.length; i++) min = Math.min(min, mhz[i] - mhz[i - 1]);
  return min;
}

function classifyNceFm(fmFreqs, fmSignalByFreq = {}) {
  return fmFreqs.filter((f) => {
    const meta = fmSignalByFreq[f] || {};
    if (meta.reservedBand || meta.nceEligible) return true;
    const m = fmMhz(f);
    return m != null && m < 92;
  });
}

function auditExposure() {
  const checks = [];
  const inDiag = DIAG_ONLY_MARKET_IDS.includes(PHOENIX);
  const inPlayable = ALL_PLAYABLE_MARKET_IDS.includes(PHOENIX);
  const billingLists = {
    allPlayableOrdered: ALL_PLAYABLE_MARKET_IDS_ORDERED.includes(PHOENIX),
    starter: STARTER_MARKET_IDS.includes(PHOENIX),
    proOnly: PRO_ONLY_MARKET_IDS.includes(PHOENIX),
    free: marketIdsForPlanSlug('free').includes(PHOENIX),
    starterPlan: marketIdsForPlanSlug('starter').includes(PHOENIX),
    proPlan: marketIdsForPlanSlug('pro').includes(PHOENIX),
    trialPlan: marketIdsForPlanSlug('trial').includes(PHOENIX),
  };
  const billingLeak = Object.entries(billingLists).some(([, v]) => v);

  if (inDiag) checks.push(check('pass', 'diag_only', 'phoenix ∈ DIAG_ONLY_MARKET_IDS'));
  else checks.push(check('fail', 'diag_only', 'phoenix missing from DIAG_ONLY_MARKET_IDS'));

  if (!inPlayable) checks.push(check('pass', 'not_playable', 'phoenix ∉ ALL_PLAYABLE_MARKET_IDS'));
  else checks.push(check('fail', 'not_playable', 'phoenix incorrectly in ALL_PLAYABLE_MARKET_IDS'));

  if (!billingLeak) checks.push(check('pass', 'billing_safe', 'phoenix absent from all billing/plan market lists'));
  else {
    const leaked = Object.entries(billingLists)
      .filter(([, v]) => v)
      .map(([k]) => k);
    checks.push(check('fail', 'billing_leak', `phoenix found in billing lists: ${leaked.join(', ')}`));
  }

  const status = checks.some((c) => c.level === 'fail') ? 'fail' : 'pass';
  return { checks, status, inDiag, inPlayable, billingLists };
}

function auditDial(scaffoldRaw, runtimeSlice) {
  const flags = [];
  const checks = [];

  const scaffoldAm = scaffoldRaw.amFreqs || [];
  const scaffoldFmAll = scaffoldRaw.fmFreqs || [];
  const scaffoldNce = classifyNceFm(scaffoldFmAll, scaffoldRaw.fmSignalByFreq || {});
  const scaffoldFmComm = scaffoldFmAll.filter((f) => !scaffoldNce.includes(f));

  const runtimeAm = extractBracketArray(runtimeSlice, 'amFreqs:');
  const runtimeFm = extractBracketArray(runtimeSlice, 'fmFreqs:');

  const scaffoldDup = findDuplicates([...scaffoldAm, ...scaffoldFmAll]);
  const runtimeDup = findDuplicates([...runtimeAm, ...runtimeFm]);
  const minSpacingScaffold = minFmSpacingMhz(scaffoldFmComm);
  const minSpacingRuntime = minFmSpacingMhz(runtimeFm);

  const runtimeOnlyFm = runtimeFm.filter((f) => !scaffoldFmAll.includes(f));
  const scaffoldOnlyFm = scaffoldFmAll.filter((f) => !runtimeFm.includes(f));
  const runtimeOnlyAm = runtimeAm.filter((f) => !scaffoldAm.includes(f));
  const scaffoldOnlyAm = scaffoldAm.filter((f) => !runtimeAm.includes(f));

  const report = {
    scaffold: {
      amCommercial: scaffoldAm.length,
      fmCommercial: scaffoldFmComm.length,
      fmNce: scaffoldNce.length,
      totalStations: scaffoldAm.length + scaffoldFmAll.length,
      duplicateFreqs: scaffoldDup,
      minFmSpacingMhz: minSpacingScaffold,
    },
    runtime: {
      amCommercial: runtimeAm.length,
      fmCommercial: runtimeFm.length,
      fmNce: 0,
      totalStations: runtimeAm.length + runtimeFm.length,
      duplicateFreqs: runtimeDup,
      minFmSpacingMhz: minSpacingRuntime,
    },
    drift: {
      scaffoldOnlyFm,
      runtimeOnlyFm,
      scaffoldOnlyAm,
      runtimeOnlyAm,
      amMatch: scaffoldOnlyAm.length === 0 && runtimeOnlyAm.length === 0,
      fmCommercialMatch: scaffoldFmComm.every((f) => runtimeFm.includes(f)),
    },
  };

  if (scaffoldDup.length) {
    flags.push('DUPLICATE_FREQS');
    checks.push(check('fail', 'dial_dup_scaffold', `Scaffold duplicate freqs: ${scaffoldDup.join(', ')}`));
  } else checks.push(check('pass', 'dial_dup_scaffold', 'No duplicate scaffold frequencies'));

  if (runtimeDup.length) {
    flags.push('DUPLICATE_FREQS');
    checks.push(check('fail', 'dial_dup_runtime', `Runtime duplicate freqs: ${runtimeDup.join(', ')}`));
  } else checks.push(check('pass', 'dial_dup_runtime', 'No duplicate runtime frequencies'));

  const total = report.scaffold.totalStations;
  if (total < LARGE_DIAL.totalTokens[0]) {
    flags.push('TOO_THIN');
    checks.push(check('warn', 'dial_thin', `Scaffold total ${total} below large-market floor ${LARGE_DIAL.totalTokens[0]}`));
  } else if (total > LARGE_DIAL.totalTokens[1]) {
    flags.push('TOO_CROWDED');
    checks.push(check('warn', 'dial_crowded', `Scaffold total ${total} above large-market ceiling ${LARGE_DIAL.totalTokens[1]}`));
  } else {
    checks.push(check('pass', 'dial_size', `Scaffold total ${total} within large-market band`));
  }

  if (scaffoldFmComm.length < LARGE_DIAL.fmCommercial[0]) {
    flags.push('MISSING_MAJOR_BANDS');
    checks.push(check('warn', 'fm_thin', `FM commercial ${scaffoldFmComm.length} — thin for fragmented Sunbelt FM`));
  }

  if (minSpacingScaffold != null && minSpacingScaffold < LARGE_DIAL.minFmSpacingMhz) {
    checks.push(
      check('warn', 'fm_spacing', `Tightest commercial FM spacing ${minSpacingScaffold.toFixed(2)} MHz (<${LARGE_DIAL.minFmSpacingMhz})`),
    );
  } else if (minSpacingScaffold != null) {
    checks.push(check('pass', 'fm_spacing', `Commercial FM spacing OK (min ${minSpacingScaffold.toFixed(2)} MHz)`));
  }

  if (scaffoldOnlyFm.length) {
    const nceOnly = scaffoldOnlyFm.every((f) => scaffoldNce.includes(f));
    if (nceOnly) {
      checks.push(
        check(
          'warn',
          'runtime_omits_nce',
          `Runtime omits ${scaffoldOnlyFm.length} scaffold NCE/reserved FM (${scaffoldOnlyFm.join(', ')}) — public dial is commercial-only`,
        ),
      );
    } else {
      flags.push('MISSING_MAJOR_BANDS');
      checks.push(
        check('warn', 'dial_drift', `Scaffold FM not in runtime: ${scaffoldOnlyFm.join(', ')}`),
      );
    }
  } else if (report.drift.fmCommercialMatch) {
    checks.push(check('pass', 'dial_runtime_match', 'Runtime commercial FM matches scaffold commercial dial'));
  }

  if (!report.drift.amMatch) {
    checks.push(
      check('warn', 'am_drift', `AM drift scaffold-only=[${scaffoldOnlyAm}] runtime-only=[${runtimeOnlyAm}]`),
    );
  } else {
    checks.push(check('pass', 'am_match', 'Scaffold AM matches runtime AM dial'));
  }

  const inv = scaffoldRaw.signalInventory || {};
  if (inv.measurable2026 != null && inv.measurable2026 > 42) {
    flags.push('TOO_CROWDED');
    checks.push(check('warn', 'measurable_high', `measurable2026=${inv.measurable2026} above large-tier target 42`));
  }

  return { report, flags: [...new Set(flags)], checks };
}

function auditSignals(scaffoldRaw, signalAlloc) {
  const flags = [];
  const checks = [];
  const fmSig = scaffoldRaw.fmSignalByFreq || {};
  const amSig = scaffoldRaw.amSignalByFreq || {};

  let fm100 = 0;
  let fmMajor = 0;
  let fmRim = 0;
  for (const [freq, meta] of Object.entries(fmSig)) {
    const erp = Number(meta.erpKw) || 0;
    if (erp >= 100) fm100++;
    if (meta.signalTier === 'major') fmMajor++;
    if (meta.signalTier === 'rimshot') fmRim++;
  }

  const nce = classifyNceFm(scaffoldRaw.fmFreqs || [], fmSig);
  let nce100 = 0;
  for (const f of nce) {
    if ((Number(fmSig[f]?.erpKw) || 0) >= 100) nce100++;
  }

  let amBigNightWeak = 0;
  for (const [, meta] of Object.entries(amSig)) {
    if (meta.signalTier === 'big' && Number(meta.nightPowerKw) < 10) amBigNightWeak++;
  }

  const report = {
    fm100kwCount: fm100,
    fmMajorCount: fmMajor,
    fmRimshotCount: fmRim,
    nceCount: nce.length,
    nce100kwCount: nce100,
    amBigNightWeak,
    signalProfile: scaffoldRaw.signalProfile || signalAlloc?.signalProfile || null,
    summary: signalAlloc?.summary || null,
  };

  if (fm100 >= 10) {
    flags.push('SIGNAL_OVERPOWERED');
    checks.push(check('warn', 'fm_100kw_many', `${fm100} FM facilities at 100kW ERP — high for non-mega market`));
  } else if (fm100 >= 7) {
    checks.push(check('warn', 'fm_100kw_elevated', `${fm100} FM at 100kW — review monster-signal count`));
  } else {
    checks.push(check('pass', 'fm_100kw', `FM 100kW count ${fm100} plausible for large Sunbelt`));
  }

  if (nce.length && nce100 === nce.length && nce.length >= 2) {
    checks.push(check('pass', 'nce_signals', `${nce.length} NCE channels with strong ERP metadata`));
  } else if (nce.length && nce100 < nce.length) {
    flags.push('NCE_SIGNAL_ODD');
    checks.push(check('warn', 'nce_power', 'Some NCE channels lack 50–100kW-class metadata'));
  }

  if (amBigNightWeak >= 2) {
    flags.push('AM_IMPLAUSIBLE');
    checks.push(check('warn', 'am_big_night', `${amBigNightWeak} clear-channel AM big sticks with weak night power`));
  } else {
    checks.push(check('pass', 'am_survival', 'AM big-stick night power plausible'));
  }

  const major = report.signalProfile?.fm?.major ?? fmMajor;
  if (major >= 8) {
    flags.push('SIGNAL_OVERPOWERED');
    checks.push(check('warn', 'fm_major_tier', `signalProfile.fm.major=${major} — many monster FM tiers`));
  }

  if (signalAlloc?.summary?.am?.graveyard >= 1) {
    checks.push(check('pass', 'am_graveyard', `Graveyard AM present (${signalAlloc.summary.am.graveyard})`));
  }

  const reviewed = scaffoldRaw._scaffold?.signalReviewed === true;
  if (!reviewed) {
    checks.push(check('warn', 'signal_unreviewed', '_scaffold.signalReviewed is not true — human signal-tier review pending'));
  }

  return { report, flags: [...new Set(flags)], checks };
}

function auditIdentity(scaffoldRaw, runtimeSlice, bpPatch) {
  const checks = [];
  const flags = [];

  const meta = {
    rankTier: scaffoldRaw.rankTier,
    archetypeId: scaffoldRaw.archetypeId,
    blackPop: scaffoldRaw.blackPop,
    hispPop2020: scaffoldRaw.hispPop2020,
    urbanBonus: scaffoldRaw.urbanBonus,
    culture: scaffoldRaw.culture,
    spanishLaunches: parseLaunchCount(runtimeSlice, 'spanishLaunches'),
    fragmentationLaunches: parseLaunchCount(runtimeSlice, 'fragmentationLaunches'),
    marketBpPatchSlots: Object.keys(bpPatch).length,
    marketBpPatch: bpPatch,
    selectBlurb: (scaffoldRaw.selectBlurb || '').slice(0, 120),
    region: scaffoldRaw.region,
    revScale: scaffoldRaw.revScale,
  };

  if (meta.archetypeId === 'sunbelt_diversified') {
    checks.push(check('pass', 'archetype', 'archetypeId=sunbelt_diversified'));
  } else {
    checks.push(check('fail', 'archetype', `Unexpected archetypeId=${meta.archetypeId}`));
  }

  if (meta.hispPop2020 >= 0.28) {
    checks.push(check('pass', 'hispanic', `hispPop2020=${meta.hispPop2020} — strong Sunbelt Hispanic`));
  } else if (meta.hispPop2020 >= 0.2) {
    checks.push(check('warn', 'hispanic', `hispPop2020=${meta.hispPop2020} — moderate; sim may need launches`));
  } else {
    flags.push('IDENTITY_MISMATCH');
    checks.push(check('fail', 'hispanic', `hispPop2020=${meta.hispPop2020} too low for Phoenix`));
  }

  if ((meta.culture?.spanish ?? 0) >= 0.12) {
    checks.push(check('pass', 'culture_spanish', `culture.spanish=${meta.culture.spanish}`));
  } else {
    checks.push(check('warn', 'culture_spanish', `culture.spanish=${meta.culture?.spanish} — thin vs market reality`));
  }

  if ((meta.culture?.newsTalk ?? 0) <= 0.12) {
    checks.push(check('pass', 'culture_talk', 'newsTalk not NYC-dominant'));
  } else {
    checks.push(check('warn', 'culture_talk', 'newsTalk elevated — watch spoken dominance'));
  }

  if (meta.spanishLaunches >= 3) {
    checks.push(check('pass', 'spanish_launches', `${meta.spanishLaunches} spanishLaunches scheduled`));
  } else {
    checks.push(check('warn', 'spanish_launches', `Only ${meta.spanishLaunches} spanishLaunches`));
  }

  if (meta.fragmentationLaunches >= 3) {
    checks.push(check('pass', 'frag_launches', `${meta.fragmentationLaunches} fragmentationLaunches`));
  } else {
    checks.push(check('warn', 'frag_launches', `Only ${meta.fragmentationLaunches} fragmentationLaunches`));
  }

  if (meta.marketBpPatchSlots >= 4) {
    checks.push(check('pass', 'bp_patch', `MARKET_BP_PATCH.phoenix has ${meta.marketBpPatchSlots} slots`));
  } else {
    checks.push(check('warn', 'bp_patch', 'Sparse MARKET_BP_PATCH.phoenix'));
  }

  const bp18 = bpPatch['18'];
  if (bp18?.fmt === 'HOT_AC') {
    checks.push(check('pass', 'bp_slot18', 'BP slot 18 = HOT_AC (rock trim wired)'));
  } else if (bp18) {
    checks.push(check('warn', 'bp_slot18', `BP slot 18 = ${bp18.fmt}`));
  }

  const ecology2026 = readJsonOptional(path.join(scaffoldDir, 'derived_ecology.json'))?.byYear?.['2026'];
  if (ecology2026) {
    if (ecology2026.spanishLanguageStrength >= 0.4) {
      checks.push(
        check('pass', 'trait_spanish', `spanishLanguageStrength@2026=${ecology2026.spanishLanguageStrength.toFixed(3)}`),
      );
    } else {
      checks.push(check('warn', 'trait_spanish', `spanishLanguageStrength@2026=${ecology2026.spanishLanguageStrength}`));
    }
    if (ecology2026.spokenWordStrength <= 0.5) {
      checks.push(check('pass', 'trait_spoken', 'spokenWordStrength not mega-dominant'));
    } else {
      checks.push(check('warn', 'trait_spoken', `spokenWordStrength=${ecology2026.spokenWordStrength}`));
    }
  }

  const dialReviewed = scaffoldRaw._scaffold?.dialReviewed === true;
  if (!dialReviewed) {
    checks.push(check('warn', 'dial_unreviewed', '_scaffold.dialReviewed is not true'));
  }

  return { meta, flags, checks };
}

function auditPlaytestCross(harness) {
  const checks = [];
  const flags = [];
  if (!harness?.phoenixByYear?.['2026']) {
    return {
      present: false,
      checks: [check('warn', 'harness_missing', 'tmp/phoenix_internal_playtest_harness.json missing or stale — run diag:phoenix-internal-playtest')],
      flags,
      summary: null,
    };
  }

  const y = harness.phoenixByYear['2026'];
  const summary = {
    spanish: y.spanishShare,
    rock: y.rockFamilyShare,
    chr: y.chrShare,
    country: y.countryShare,
    publicShare: y.publicShare,
    leaderFamilyHist: y.leaderFamilyHist,
    leaderFmtHist: y.leaderFmtHist,
    hhi: y.hhi,
    stationCount: y.stationCount,
  };

  if (y.spanishShare >= 0.18) {
    checks.push(check('pass', 'sim_spanish', `Sim Spanish ${pct(y.spanishShare)} aligns with Sunbelt scaffold`));
  } else {
    flags.push('IDENTITY_MISMATCH');
    checks.push(check('warn', 'sim_spanish', `Sim Spanish ${pct(y.spanishShare)} below scaffold Hispanic expectation`));
  }

  if (y.rockFamilyShare <= 0.2) {
    checks.push(check('pass', 'sim_rock', `Rock family ${pct(y.rockFamilyShare)} — meaningful but not dominant`));
  } else {
    checks.push(check('warn', 'sim_rock', `Rock family ${pct(y.rockFamilyShare)} elevated vs scaffold fragmentation story`));
  }

  if (y.leaderFamilyHist?.startsWith('SPANISH')) {
    checks.push(check('pass', 'sim_leader', `#1 family ${y.leaderFamilyHist}`));
  } else {
    flags.push('IDENTITY_MISMATCH');
    checks.push(check('warn', 'sim_leader', `#1 family ${y.leaderFamilyHist} — expected SPANISH leadership @2026`));
  }

  const rm = y.spanishSubtype?.meanSubtypeSharePct?.REGIONAL_MEXICAN;
  if (rm != null && rm >= 50) {
    checks.push(check('pass', 'sim_rm', `Regional Mexican ${rm.toFixed(1)}% of Spanish mass`));
  }

  if (harness.verdict?.status === 'pass') {
    checks.push(check('pass', 'harness_verdict', 'Internal playtest harness overall PASS'));
  } else {
    checks.push(check('warn', 'harness_verdict', `Internal playtest harness ${harness.verdict?.status || 'unknown'}`));
  }

  return { present: true, checks, flags, summary };
}

function humanChecklist(sections) {
  const sim = sections.playtest?.summary;
  const hints = {
    spanish: sim ? `${pct(sim.spanish)} sim / hispPop2020 ${sections.identity?.meta?.hispPop2020}` : 'run playtest harness',
    rm: sim ? 'RM dominant in harness subtype block' : '—',
    rock: sim ? `${pct(sim.rock)} rock family` : '—',
    chr: sim ? `${pct(sim.chr)} CHR bucket` : '—',
    country: sim ? `${pct(sim.country)} country` : '—',
    spoken: sections.identity?.meta?.culture?.newsTalk != null ? `newsTalk culture ${sections.identity.meta.culture.newsTalk}` : '—',
    public: sim
      ? `sim ${pct(sim.publicShare)} | scaffold NCE×${sections.dial?.report?.scaffold?.fmNce ?? 3}`
      : 'NCE on scaffold dial; runtime commercial-only',
    am: sections.dial?.report?.scaffold?.amCommercial != null ? `${sections.dial.report.scaffold.amCommercial} AM tokens` : '—',
    clusters: sections.dial?.report?.scaffold?.minFmSpacingMhz != null ? `min FM spacing ${sections.dial.report.scaffold.minFmSpacingMhz.toFixed(2)} MHz` : '—',
  };

  return [
    { item: 'Spanish feels strong but not absurd', hint: hints.spanish },
    { item: 'Regional Mexican dominates Spanish', hint: hints.rm },
    { item: 'Rock remains meaningful', hint: hints.rock },
    { item: 'CHR viable', hint: hints.chr },
    { item: 'country viable', hint: hints.country },
    { item: 'spoken not absurd', hint: hints.spoken },
    { item: 'public/NCE presence believable', hint: hints.public },
    { item: "AM doesn't feel dead too early", hint: hints.am },
    { item: 'no bizarre station clusters', hint: hints.clusters },
  ];
}

function finalVerdict(allChecks, exposureStatus, readiness) {
  const fail = allChecks.filter((c) => c.level === 'fail').length;
  const warn = allChecks.filter((c) => c.level === 'warn').length;
  const pass = allChecks.filter((c) => c.level === 'pass').length;

  let internalReady = exposureStatus === 'pass' && fail === 0;
  if (readiness?.readiness === 'PLAYTEST_READY' && fail === 0) internalReady = internalReady && warn <= 6;

  let confidence = 'medium';
  if (fail > 0) confidence = 'low';
  else if (warn <= 3) confidence = 'high';
  else if (warn > 8) confidence = 'low';

  return {
    internalPlaytestReady: internalReady,
    publicReady: false,
    confidence,
    counts: { pass, warn, fail },
  };
}

function main() {
  console.log('Phoenix scaffold reality audit (read-only, DIAG_ONLY)\n');

  const legacySrc = readFileSync(legacyPath, 'utf8');
  const runtimeSlice = extractPhoenixLegacySlice(legacySrc);
  const bpPatch = extractMarketBpPatch(legacySrc);

  const scaffoldRaw = readJson(path.join(scaffoldDir, 'raw_market_data.json'));
  const signalAlloc = readJsonOptional(path.join(scaffoldDir, 'signal_allocation.json'));
  const readiness = readJsonOptional(path.join(scaffoldDir, 'readiness.json'));
  const harness = readJsonOptional(playtestHarnessPath);

  const exposure = auditExposure();
  const dial = auditDial(scaffoldRaw, runtimeSlice);
  const signals = auditSignals(scaffoldRaw, signalAlloc);
  const identity = auditIdentity(scaffoldRaw, runtimeSlice, bpPatch);
  const playtest = auditPlaytestCross(harness);

  const allChecks = [
    ...exposure.checks,
    ...dial.checks,
    ...signals.checks,
    ...identity.checks,
    ...playtest.checks,
  ];

  const allFlags = [...new Set([...dial.flags, ...signals.flags, ...identity.flags, ...playtest.flags])];

  const sections = { exposure, dial, signals, identity, playtest };
  const checklist = humanChecklist(sections);
  const verdict = finalVerdict(allChecks, exposure.status, readiness);

  console.log('═══ 1. Exposure safety ═══\n');
  for (const c of exposure.checks) console.log(`  [${c.level.toUpperCase()}] ${c.message}`);

  console.log('\n═══ 2. Dial inventory realism ═══\n');
  const d = dial.report;
  console.log('Scaffold vs runtime (commercial gameplay dial):');
  console.log(
    `  AM: scaffold ${d.scaffold.amCommercial} | runtime ${d.runtime.amCommercial} | match ${d.drift.amMatch ? 'yes' : 'no'}`,
  );
  console.log(
    `  FM commercial: scaffold ${d.scaffold.fmCommercial} | runtime ${d.runtime.fmCommercial} | NCE scaffold-only ${d.drift.scaffoldOnlyFm.length}`,
  );
  console.log(`  FM NCE (scaffold): ${d.scaffold.fmNce} | runtime NCE: ${d.runtime.fmNce}`);
  console.log(`  Total tokens: scaffold ${d.scaffold.totalStations} | runtime ${d.runtime.totalStations}`);
  if (d.scaffold.duplicateFreqs.length) console.log(`  Duplicate freqs (scaffold): ${d.scaffold.duplicateFreqs.join(', ')}`);
  if (d.drift.scaffoldOnlyFm.length) console.log(`  Scaffold-only FM: ${d.drift.scaffoldOnlyFm.join(', ')}`);
  if (d.scaffold.minFmSpacingMhz != null) console.log(`  Min commercial FM spacing: ${d.scaffold.minFmSpacingMhz.toFixed(2)} MHz`);
  if (dial.flags.length) console.log(`  Flags: ${dial.flags.join(', ')}`);
  for (const c of dial.checks) console.log(`  [${c.level.toUpperCase()}] ${c.message}`);

  console.log('\n═══ 3. Signal realism ═══\n');
  const s = signals.report;
  console.log(`  FM 100kW: ${s.fm100kwCount} | major tier: ${s.fmMajorCount} | rimshot: ${s.fmRimshotCount}`);
  console.log(`  NCE: ${s.nceCount} (${s.nce100kwCount} at 100kW)`);
  if (signals.flags.length) console.log(`  Flags: ${signals.flags.join(', ')}`);
  for (const c of signals.checks) console.log(`  [${c.level.toUpperCase()}] ${c.message}`);

  console.log('\n═══ 4. Identity realism ═══\n');
  const m = identity.meta;
  console.log(`  rankTier=${m.rankTier} archetypeId=${m.archetypeId} region=${m.region}`);
  console.log(`  blackPop=${m.blackPop} hispPop2020=${m.hispPop2020} urbanBonus=${m.urbanBonus}`);
  console.log(`  culture=${JSON.stringify(m.culture)}`);
  console.log(`  spanishLaunches=${m.spanishLaunches} fragmentationLaunches=${m.fragmentationLaunches} BP slots=${m.marketBpPatchSlots}`);
  for (const c of identity.checks) console.log(`  [${c.level.toUpperCase()}] ${c.message}`);

  console.log('\n═══ 5. Internal playtest cross-check ═══\n');
  if (playtest.present && playtest.summary) {
    const p = playtest.summary;
    console.log(
      `  @2026: Spanish ${pct(p.spanish)} | Rock ${pct(p.rock)} | CHR ${pct(p.chr)} | Country ${pct(p.country)}`,
    );
    console.log(`  #1 family: ${p.leaderFamilyHist} | #1 format: ${p.leaderFmtHist}`);
    console.log(`  HHI: ${p.hhi?.toFixed(0)} | stations/run: ${p.stationCount?.toFixed(1)}`);
  }
  for (const c of playtest.checks) console.log(`  [${c.level.toUpperCase()}] ${c.message}`);

  console.log('\n═══ 6. Human playtest checklist ═══\n');
  console.log('Phoenix internal human playtest checklist:');
  for (const row of checklist) {
    console.log(`[ ] ${row.item}  (${row.hint})`);
  }

  console.log('\n═══ 7. Final verdict ═══\n');
  console.log(`Checks: ${verdict.counts.pass} pass, ${verdict.counts.warn} warn, ${verdict.counts.fail} fail`);
  if (allFlags.length) console.log(`Aggregate flags: ${allFlags.join(', ')}`);
  console.log(`INTERNAL_PLAYTEST_READY: ${verdict.internalPlaytestReady ? 'yes' : 'no'}`);
  console.log(`PUBLIC_READY: ${verdict.publicReady ? 'yes' : 'no'}`);
  console.log(`CONFIDENCE: ${verdict.confidence}`);

  if (readiness) {
    console.log(`\nScaffold readiness.json: ${readiness.readiness} (${readiness.counts?.WARN ?? 0} warn)`);
  }

  const artifact = {
    recordedAt: new Date().toISOString(),
    marketId: PHOENIX,
    diagOnly: {
      inDiagOnly: exposure.inDiag,
      inPlayable: exposure.inPlayable,
      billingLists: exposure.billingLists,
    },
    scaffoldPaths: {
      raw: path.join(scaffoldDir, 'raw_market_data.json'),
      signalAllocation: path.join(scaffoldDir, 'signal_allocation.json'),
      readiness: path.join(scaffoldDir, 'readiness.json'),
    },
    exposure,
    dial,
    signals,
    identity,
    playtest,
    flags: allFlags,
    humanChecklist: checklist,
    verdict,
    blockers: allChecks.filter((c) => c.level === 'fail').map((c) => c.message),
    warnings: allChecks.filter((c) => c.level === 'warn').map((c) => c.message),
  };

  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`\nWrote ${outJson}`);

  if (verdict.counts.fail > 0) process.exitCode = 1;
}

main();
