#!/usr/bin/env node
/**
 * Headless harness — rivalry prototype challenger creation & Rival Watch sampling.
 *
 * Loads real legacy.js + rivalryPrototype.js in VM, runs genMarket + advTurn loops,
 * and records when lane threats appear and portfolio challengers are picked.
 *
 *   npm run diag:rivalry-creation
 *   npm run diag:rivalry-creation -- --runs=30 --periods=48 --markets=phoenix,atlanta
 *   npm run diag:rivalry-creation -- --json=tmp/rivalry_creation_harness.json
 *
 * Options:
 *   --runs <n>           Seeds per market (default 24)
 *   --seed-start <n>     First seed (default 88001)
 *   --periods <n>        advTurn calls per run (default 56)
 *   --market <id>        Single market if --markets omitted (default phoenix)
 *   --markets <a,b,c>    Comma-separated markets
 *   --scenario <id>      genMarket scenario (default under)
 *   --json [path]        Write JSON (default tmp/rivalry_creation_harness.json when flag alone)
 *   --md [path]          Write markdown summary alongside JSON
 *   --verbose            Include per-run event lists in JSON
 *   --quiet              Suppress stdout table; still writes --json/--md
 */
/* eslint-disable no-console */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const rivalryPath = path.join(root, 'src', 'rivalryPrototype.js');
const retentionPath = path.join(root, 'src', 'talentRetention.js');
const defaultJson = path.join(root, 'tmp', 'rivalry_creation_harness.json');
const defaultMd = path.join(root, 'tmp', 'rivalry_creation_harness.md');

const THREAT_TIER_BASE = 0.12;

function injectHeadlessLaunchNewsGuard(src) {
  let out = src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketSpanish(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketSpanish(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  out = out.replace(
    'function tryLaunchOneMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;',
  );
  return out;
}

function makeLegacySrc(marketId) {
  let legacySrc = readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('ACTIVE_MARKET anchor missing in legacy.js');
  }
  legacySrc = legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${marketId}'`);
  return injectHeadlessLaunchNewsGuard(legacySrc);
}

function mulberry32(a) {
  return function mulberry32Inner() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createHeadlessContext(quiet) {
  const noop = () => {};
  const stubEl = () => ({
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    dataset: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
    getAttribute() { return null; },
    setAttribute() {},
  });
  const documentStub = {
    body: { innerHTML: '', prepend() {}, appendChild() {} },
    head: { appendChild() {} },
    createElement() { return stubEl(); },
    getElementById() { return stubEl(); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    readyState: 'complete',
    addEventListener: noop,
    removeEventListener: noop,
  };
  const ctx = vm.createContext({
    console: quiet
      ? { log: noop, warn: noop, error: console.error, table: noop, info: noop }
      : console,
    __WL_HEADLESS__: true,
    __WL_RIVALRY_PROTOTYPE: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() {}, setItem() {} },
    location: { reload() {}, search: '', href: 'http://127.0.0.1/' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert: noop,
    fetch: null,
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    crypto: {
      getRandomValues(a) {
        for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        return a;
      },
      randomUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      },
    },
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    Symbol,
    Proxy,
    Reflect,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Int8Array,
    Uint8Array,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.MP = { mode: 'solo', playerId: 0, isHost: true, players: [], renderStatus: noop };
  ctx.cm = noop;
  ctx.om = noop;
  ctx.showToast = noop;
  ctx.showError = noop;
  ctx.autoSave = noop;
  ctx.wlTrackSoloSession = noop;
  ctx.getLocalSave = () => null;
  ctx.openScenSelect = noop;
  return ctx;
}

function loadEngine(ctx, marketId) {
  injectMarketEcologyIife(ctx);
  vm.runInContext(readFileSync(retentionPath, 'utf8'), ctx, { filename: 'talentRetention.js', timeout: 300_000 });
  vm.runInContext(makeLegacySrc(marketId), ctx, { filename: 'legacy.js', timeout: 300_000 });
  vm.runInContext(readFileSync(rivalryPath, 'utf8'), ctx, { filename: 'rivalryPrototype.js' });
  vm.runInContext('showToast=function(){}; showToastWithSubscribeCta=function(){};', ctx);
  if (!ctx.rivalryPrototypeEnabled?.()) {
    throw new Error('rivalryPrototype.js did not enable — check __WL_RIVALRY_PROTOTYPE');
  }
}

const FLAGS_WITH_VALUE = new Set(['runs', 'seed-start', 'periods', 'market', 'markets', 'scenario', 'json', 'md']);

function parseArgs(argv) {
  const out = {
    runs: 24,
    seedStart: 88001,
    periods: 56,
    market: 'phoenix',
    markets: null,
    scenario: 'under',
    json: null,
    md: null,
    verbose: false,
    quiet: false,
  };

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    let key;
    let val;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      key = token.slice(2, eq);
      val = token.slice(eq + 1);
      i++;
    } else {
      key = token.slice(2);
      if (key === 'verbose' || key === 'quiet') {
        out[key] = true;
        i++;
        continue;
      }
      if (key === 'json' || key === 'md') {
        if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
          val = argv[i + 1];
          i += 2;
        } else {
          val = undefined;
          i++;
        }
        out[key] = val != null && String(val).trim() ? String(val).trim() : true;
        continue;
      }
      if (!FLAGS_WITH_VALUE.has(key)) throw new Error(`Unknown flag: --${key}`);
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new Error(`Missing value for --${key}`);
      }
      val = argv[i + 1];
      i += 2;
    }
    switch (key) {
      case 'runs':
        out.runs = Math.max(1, parseInt(String(val), 10) || 24);
        break;
      case 'seed-start':
        out.seedStart = parseInt(String(val), 10) || out.seedStart;
        break;
      case 'periods':
        out.periods = Math.max(1, parseInt(String(val), 10) || 56);
        break;
      case 'market':
        out.market = String(val || 'phoenix').trim() || 'phoenix';
        break;
      case 'markets':
        out.markets = String(val || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case 'scenario':
        out.scenario = String(val || 'under').trim() || 'under';
        break;
      case 'json':
        out.json = val != null && String(val).trim() ? String(val).trim() : true;
        break;
      case 'md':
        out.md = val != null && String(val).trim() ? String(val).trim() : true;
        break;
      default:
        break;
    }
  }
  return out;
}

/** In-VM lane id mirror (keep aligned with rivalryPrototype.js). */
const RIVALRY_LANE_HELPER = `
function __wlCanonFmt(fmt){
  var f=String(fmt||'').trim().toUpperCase();
  return f==='CHR'?'TOP40':f;
}
function __wlRivalryLaneId(fmt){
  var f=__wlCanonFmt(fmt);
  if(f==='TOP40'||f==='RHYTHMIC')return 'lane_chr';
  if(f==='HOT_AC'||f==='ADULT_CONTEMP'||f==='MOR'||f==='BEAUTIFUL_MUSIC'||f==='ADULT_STANDARDS')return 'lane_ac';
  if(f==='COUNTRY')return 'lane_country';
  if(f==='CLASSIC_ROCK')return 'lane_classic_rock';
  if(f==='ALBUM_ROCK'||f==='ALT_ROCK'||f==='AAA'||f==='ACTIVE_ROCK')return 'lane_album_rock';
  if(f==='URBAN_CONTEMP'||f==='SOUL_RNB')return 'lane_urban';
  if(typeof isSpanishLanguageFormat==='function'&&isSpanishLanguageFormat(f))return 'lane_spanish';
  if(f.indexOf('SPANISH_')===0)return 'lane_spanish';
  if(f==='NEWS_TALK'||f==='ALL_NEWS')return 'lane_news_talk';
  return 'lane_fmt_'+f;
}
`;

function runOne(ctx, opts) {
  const { seed, marketId, periods, scenarioId } = opts;
  return vm.runInContext(
    `
    (function(){
      ${RIVALRY_LANE_HELPER}
      var rng = (${mulberry32.toString()})(${seed >>> 0});
      Math.random = function(){ return rng(); };
      ACTIVE_MARKET = ${JSON.stringify(marketId)};
      _selectedMarket = ${JSON.stringify(marketId)};
      if (typeof syncMarketPopToMarket === 'function') syncMarketPopToMarket(${JSON.stringify(marketId)});

      G = genMarket(${JSON.stringify(scenarioId)});
      G.marketId = ${JSON.stringify(marketId)};
      G.ps = (G.stations || []).filter(function(s){ return s && s.isPlayer; });

      var prevPicks = {};
      var events = [];
      var threatFirstSeen = {};
      var maxLeaderShare = 0;
      var rivalWatchHits = 0;
      var rivalWatchSamples = [];

      for (var t = 0; t < ${periods | 0}; t++) {
        var y0 = G.year, p0 = G.period;
        advTurn();

        var threats = G._domThreats || {};
        Object.keys(threats).forEach(function(lid){
          var th = threats[lid];
          if (!threatFirstSeen[lid]) {
            threatFirstSeen[lid] = {
              turn: t + 1,
              bookYear: y0,
              bookPeriod: p0,
              laneId: lid,
              leaderCall: th.leaderCall,
              leaderShare: th.leaderShare,
              leaderFmt: th.leaderFmt,
              tier: th.tier,
            };
          }
          if (th.leaderShare > maxLeaderShare) maxLeaderShare = th.leaderShare;
        });

        var picks = G._rivalryPick || {};
        Object.keys(picks).forEach(function(pk){
          var stId = picks[pk];
          if (prevPicks[pk] === stId) return;
          var st = (G.stations || []).find(function(s){ return s.id === stId; });
          if (!st) return;
          var lid = __wlRivalryLaneId(st.format);
          var th = threats[lid] || null;
          events.push({
            kind: 'challenger_picked',
            turn: t + 1,
            bookYear: y0,
            bookPeriod: p0,
            portfolioKey: pk,
            challengerCall: st.callLetters,
            challengerFmt: st.format,
            challengerShare: st.rat && st.rat.share != null ? st.rat.share : null,
            pickScore: G._rivalryPickScore && G._rivalryPickScore[pk] != null ? G._rivalryPickScore[pk] : null,
            untilYear: G._rivalryPickUntil && G._rivalryPickUntil[pk] != null ? G._rivalryPickUntil[pk] : null,
            leaderCall: th && th.leaderCall,
            leaderShare: th && th.leaderShare,
            leaderFmt: th && th.leaderFmt,
            tier: th && th.tier,
            laneId: lid,
            replacedPrior: prevPicks[pk] || null,
          });
        });
        prevPicks = {};
        Object.keys(picks).forEach(function(pk){ prevPicks[pk] = picks[pk]; });

        (G._lastTurnHeadlines || []).forEach(function(h){
          var txt = h.t || '';
          if (/gunning for|🎯/.test(txt)) {
            events.push({ kind: 'gunning_headline', turn: t + 1, bookYear: y0, bookPeriod: p0, text: txt });
          }
          if (/⚔️|poaches|makes a run at/.test(txt)) {
            events.push({ kind: 'poach_headline', turn: t + 1, bookYear: y0, bookPeriod: p0, text: txt });
          }
        });

        if (typeof buildPeriodRivalWatchItems === 'function') {
          var rw = buildPeriodRivalWatchItems(G, []);
          if (rw && rw.length) {
            rivalWatchHits++;
            if (rivalWatchSamples.length < 6) {
              rivalWatchSamples.push({
                turn: t + 1,
                bookYear: y0,
                bookPeriod: p0,
                playerFormats: G.ps.map(function(s){ return s.format; }),
                items: rw.map(function(x){ return x.t; }),
              });
            }
          }
        }
      }

      var finalChallengers = (G.stations || []).filter(function(s){ return s && s._rivalryChallenger; }).map(function(s){
        return {
          call: s.callLetters,
          fmt: s.format,
          share: s.rat && s.rat.share,
          graceUntil: s._challengerGraceUntil,
          domShare: s._challengerDomShare,
        };
      });

      return {
        ok: true,
        seed: ${seed},
        marketId: ${JSON.stringify(marketId)},
        playerFormats: G.ps.map(function(s){ return s.format; }),
        playerCalls: G.ps.map(function(s){ return s.callLetters; }),
        endYear: G.year,
        endPeriod: G.period,
        maxLeaderShare: maxLeaderShare,
        threatLanes: Object.keys(threatFirstSeen).length,
        threatFirstSeen: threatFirstSeen,
        challengerPickEvents: events.filter(function(e){ return e.kind === 'challenger_picked'; }),
        gunningHeadlines: events.filter(function(e){ return e.kind === 'gunning_headline'; }).length,
        poachHeadlines: events.filter(function(e){ return e.kind === 'poach_headline'; }).length,
        events: events,
        finalChallengerCount: finalChallengers.length,
        finalChallengers: finalChallengers,
        rivalWatchPeriodsWithItems: rivalWatchHits,
        rivalWatchSamples: rivalWatchSamples,
      };
    })()
    `,
    ctx,
    { timeout: 300_000 },
  );
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pct(x, digits = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(100 * x).toFixed(digits)}%`;
}

function sharePct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(100 * x).toFixed(1)}%`;
}

function aggregateRuns(runs) {
  const n = runs.length;
  const withThreat = runs.filter((r) => r.threatLanes > 0).length;
  const withChallenger = runs.filter((r) => r.challengerPickEvents.length > 0).length;
  const withGunning = runs.filter((r) => r.gunningHeadlines > 0).length;
  const pickEvents = runs.flatMap((r) => r.challengerPickEvents);
  const firstThreatTurns = runs
    .map((r) => {
      const vals = Object.values(r.threatFirstSeen || {});
      if (!vals.length) return null;
      return Math.min(...vals.map((v) => v.turn));
    })
    .filter((x) => x != null);
  const firstPickTurns = runs
    .map((r) => {
      if (!r.challengerPickEvents.length) return null;
      return Math.min(...r.challengerPickEvents.map((e) => e.turn));
    })
    .filter((x) => x != null);

  const byLane = {};
  for (const e of pickEvents) {
    const lid = e.laneId || '?';
    if (!byLane[lid]) {
      byLane[lid] = { picks: 0, leaderShares: [], challengerShares: [], tiers: {} };
    }
    byLane[lid].picks++;
    if (e.leaderShare != null) byLane[lid].leaderShares.push(e.leaderShare);
    if (e.challengerShare != null) byLane[lid].challengerShares.push(e.challengerShare);
    const tierKey = e.tier != null ? String(Math.round(e.tier * 1000) / 1000) : '?';
    byLane[lid].tiers[tierKey] = (byLane[lid].tiers[tierKey] || 0) + 1;
  }
  const byLaneSummary = {};
  for (const [lid, row] of Object.entries(byLane)) {
    byLaneSummary[lid] = {
      picks: row.picks,
      meanLeaderShareAtPick: mean(row.leaderShares),
      meanChallengerShareAtPick: mean(row.challengerShares),
      tierHist: row.tiers,
    };
  }

  return {
    runs: n,
    runsWithLaneThreat: withThreat,
    pctRunsWithLaneThreat: n ? withThreat / n : 0,
    runsWithChallengerPick: withChallenger,
    pctRunsWithChallengerPick: n ? withChallenger / n : 0,
    runsWithGunningHeadline: withGunning,
    pctRunsWithGunningHeadline: n ? withGunning / n : 0,
    totalChallengerPickEvents: pickEvents.length,
    totalGunningHeadlines: runs.reduce((s, r) => s + r.gunningHeadlines, 0),
    totalPoachHeadlines: runs.reduce((s, r) => s + r.poachHeadlines, 0),
    meanFirstThreatTurn: mean(firstThreatTurns),
    meanFirstChallengerPickTurn: mean(firstPickTurns),
    meanMaxLeaderShare: mean(runs.map((r) => r.maxLeaderShare)),
    meanFinalChallengers: mean(runs.map((r) => r.finalChallengerCount)),
    meanRivalWatchPeriodsWithItems: mean(runs.map((r) => r.rivalWatchPeriodsWithItems)),
    picksBelow12LeaderShare: pickEvents.filter((e) => (e.leaderShare || 0) < THREAT_TIER_BASE).length,
    byLane: byLaneSummary,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Rivalry creation harness');
  lines.push('');
  lines.push(`Runs per market: **${report.meta.runsPerMarket}** · Periods/run: **${report.meta.periodsPerRun}** · Scenario: \`${report.meta.scenario}\``);
  lines.push(`Markets: ${report.meta.markets.join(', ')}`);
  lines.push(`Threat tier base: **${THREAT_TIER_BASE * 100}%** share`);
  lines.push('');

  for (const [mid, block] of Object.entries(report.byMarket)) {
    const a = block.aggregate;
    lines.push(`## ${mid}`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`| --- | --- |`);
    lines.push(`| Runs with lane threat (≥12% leader) | ${a.runsWithLaneThreat}/${a.runs} (${pct(a.pctRunsWithLaneThreat)}) |`);
    lines.push(`| Runs with challenger pick | ${a.runsWithChallengerPick}/${a.runs} (${pct(a.pctRunsWithChallengerPick)}) |`);
    lines.push(`| Runs with gunning headline | ${a.runsWithGunningHeadline}/${a.runs} (${pct(a.pctRunsWithGunningHeadline)}) |`);
    lines.push(`| Mean first threat turn | ${a.meanFirstThreatTurn != null ? a.meanFirstThreatTurn.toFixed(1) : '—'} |`);
    lines.push(`| Mean first challenger pick turn | ${a.meanFirstChallengerPickTurn != null ? a.meanFirstChallengerPickTurn.toFixed(1) : '—'} |`);
    lines.push(`| Mean max lane-leader share | ${sharePct(a.meanMaxLeaderShare)} |`);
    lines.push(`| Total pick events | ${a.totalChallengerPickEvents} |`);
    lines.push(`| Picks below 12% leader (unexpected) | ${a.picksBelow12LeaderShare} |`);
    lines.push(`| Mean Rival Watch periods w/ items | ${a.meanRivalWatchPeriodsWithItems != null ? a.meanRivalWatchPeriodsWithItems.toFixed(1) : '—'} |`);
    lines.push('');

    const lanes = Object.entries(a.byLane || {}).sort((x, y) => y[1].picks - x[1].picks);
    if (lanes.length) {
      lines.push('### Picks by lane');
      lines.push('');
      lines.push('| Lane | Picks | Mean leader @ pick | Mean challenger @ pick |');
      lines.push('| --- | ---: | ---: | ---: |');
      for (const [lid, row] of lanes) {
        lines.push(
          `| ${lid} | ${row.picks} | ${sharePct(row.meanLeaderShareAtPick)} | ${sharePct(row.meanChallengerShareAtPick)} |`,
        );
      }
      lines.push('');
    }

    const samples = (block.sampleRivalWatch || []).slice(0, 3);
    if (samples.length) {
      lines.push('### Rival Watch samples');
      lines.push('');
      for (const s of samples) {
        lines.push(`- Turn ${s.turn} (${s.bookYear} P${s.bookPeriod}) · player ${(s.playerFormats || []).join(', ')}`);
        for (const t of s.items || []) lines.push(`  - ${t}`);
      }
      lines.push('');
    }
  }

  lines.push('## Global');
  lines.push('');
  const g = report.global;
  lines.push(`- ${g.runsWithChallengerPick}/${g.runs} runs saw at least one challenger pick (${pct(g.pctRunsWithChallengerPick)})`);
  lines.push(`- ${g.totalChallengerPickEvents} total pick events · ${g.totalGunningHeadlines} gunning headlines · ${g.totalPoachHeadlines} poach headlines`);
  lines.push('');
  return lines.join('\n');
}

function main() {
  let opts;
  let markets;
  try {
    opts = parseArgs(process.argv.slice(2));
    markets = opts.markets?.length ? opts.markets : [opts.market];
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }

  if (!opts.quiet) {
    console.error('[diag-rivalry-creation]', {
      runs: opts.runs,
      seedStart: opts.seedStart,
      periods: opts.periods,
      markets,
      scenario: opts.scenario,
    });
  }

  const byMarket = {};
  const allRuns = [];

  for (const marketId of markets) {
    const ctx = createHeadlessContext(opts.quiet);
    loadEngine(ctx, marketId);
    const runs = [];

    for (let i = 0; i < opts.runs; i++) {
      const seed = opts.seedStart + i;
      try {
        const out = runOne(ctx, { seed, marketId, periods: opts.periods, scenarioId: opts.scenario });
        runs.push(out);
        allRuns.push(out);
      } catch (err) {
        runs.push({ ok: false, seed, marketId, error: String(err.message || err) });
      }
    }

    const okRuns = runs.filter((r) => r.ok);
    byMarket[marketId] = {
      aggregate: aggregateRuns(okRuns),
      sampleRivalWatch: okRuns.flatMap((r) => r.rivalWatchSamples || []).slice(0, 8),
      samplePickEvents: okRuns
        .flatMap((r) => (r.challengerPickEvents || []).slice(0, 2))
        .slice(0, 6),
      runs: opts.verbose ? okRuns : undefined,
      failed: runs.filter((r) => !r.ok),
    };
  }

  const okAll = allRuns.filter((r) => r.ok);
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      rivalryPrototype: true,
      threatTierBase: THREAT_TIER_BASE,
      runsPerMarket: opts.runs,
      seedRange: [opts.seedStart, opts.seedStart + opts.runs - 1],
      periodsPerRun: opts.periods,
      scenario: opts.scenario,
      markets,
    },
    global: aggregateRuns(okAll),
    byMarket,
  };

  if (!opts.quiet) {
    console.log(JSON.stringify(report, null, 2));
  }

  const jsonPath = opts.json === true ? defaultJson : opts.json;
  const mdPath = opts.md === true ? defaultMd : opts.md;
  if (jsonPath) {
    mkdirSync(path.dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    if (!opts.quiet) console.error('Wrote', jsonPath);
  }
  if (mdPath) {
    mkdirSync(path.dirname(mdPath), { recursive: true });
    writeFileSync(mdPath, buildMarkdown(report), 'utf8');
    if (!opts.quiet) console.error('Wrote', mdPath);
  }
}

main();
