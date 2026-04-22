#!/usr/bin/env node
/**
 * Before/after fixed-cost & cluster economics diagnostic (late 1990s / early 2000s).
 *
 * Same world state, two cost models: injects G._fixedCostDiagBaseline into a VM copy of
 * legacy.js (not repo src). After advancing to a calendar checkpoint, runs seedRev twice
 * (baseline flag on/off) so revenue matches and only fixed-cost/cluster rules differ.
 *
 * Output: stdout summary + reports/fixed-cost-cluster-diag.json + .csv
 *
 * Usage: node scripts/fixed-cost-cluster-diag.mjs
 */
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');
const outDir = path.join(root, 'reports');
const outJson = path.join(outDir, 'fixed-cost-cluster-diag.json');
const outCsv = path.join(outDir, 'fixed-cost-cluster-diag.csv');

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

/**
 * G._fixedCostDiagBaseline: apply pre-refactor cluster **fixed-cost** rules on **player** stations
 * only so rival calcRev (and seedRev pool scaling) stay aligned.
 */
function injectFixedCostDiagBaselineToggle(src) {
  let s = src.replace(
    '  const adx=G.adx,streamDrag=G.streamDrag,year=G.year;\n  const clusterPeers=clusterOwnershipPeersForStation(s,G);',
    '  const adx=G.adx,streamDrag=G.streamDrag,year=G.year;\n  const _wlDiagBase=!!(G&&G._fixedCostDiagBaseline);\n  const _wlPl=!!(s&&s.isPlayer);\n  const clusterPeers=_wlDiagBase&&_wlPl?(G?.ps||G?.stations||[]).filter(st=>st&&!st._bpSlotDeferred&&!st.isPublic):clusterOwnershipPeersForStation(s,G);'
  );
  s = s.replace(
    '    const clusterDiscount=stationRank<=0?0:stationRank===1?0.26*clusterEra:(0.34+Math.min(0.12,(stationRank-2)*0.04))*clusterEra;',
    '    const clusterDiscount=_wlDiagBase&&_wlPl?(stationRank<=0?0:stationRank===1?0.38*clusterEra:(0.50+Math.min(0.10,(stationRank-2)*0.05))*clusterEra):(stationRank<=0?0:stationRank===1?0.26*clusterEra:(0.34+Math.min(0.12,(stationRank-2)*0.04))*clusterEra);'
  );
  s = s.replace(
    '    efficiencyMult=Math.max(0.36,1-clusterDiscount-autoDiscount-fmtAutoDiscount);',
    '    efficiencyMult=Math.max(_wlDiagBase&&_wlPl?0.28:0.36,1-clusterDiscount-autoDiscount-fmtAutoDiscount);'
  );
  s = s.replace(
    '  const groupOverheadHalf=clusterGroupOverheadPerStationHalfPeriod(year,clusterPeers.length,mktFixMult,mktIdForFix,inflFactor);\n  fixedCost+=groupOverheadHalf;',
    '  const groupOverheadHalf=_wlDiagBase&&_wlPl?0:clusterGroupOverheadPerStationHalfPeriod(year,clusterPeers.length,mktFixMult,mktIdForFix,inflFactor);\n  fixedCost+=groupOverheadHalf;'
  );
  return s;
}

function injectFixSplitInstrumentation(src) {
  return src.replace(
    's.fin.tal=talCost;s.fin.fix=fixedCost;s.fin.groupOverhead=groupOverheadHalf;',
    's.fin._diagFixSplit={staff:staffCost,fac:facCost,reg:regCostScaled,sf:sfCostScaled,group:groupOverheadHalf};s.fin.tal=talCost;s.fin.fix=fixedCost;s.fin.groupOverhead=groupOverheadHalf;'
  );
}

function makeLegacySrc(marketId) {
  let legacySrc = fs.readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) {
    throw new Error('Expected ACTIVE_MARKET anchor not found');
  }
  const mid = marketId === 'atlanta' ? 'atlanta' : marketId;
  return legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${mid}'`);
}

function buildDiagLegacySrc(marketId) {
  return injectFixSplitInstrumentation(
    injectFixedCostDiagBaselineToggle(injectHeadlessMegaFragNewsGuard(makeLegacySrc(marketId)))
  );
}

function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    classList: { contains() { return false; }, add() {}, remove() {} },
    appendChild() {},
    querySelector() { return null; },
    focus() {},
    click() {},
    addEventListener() {},
    removeEventListener() {},
  };
}

const documentStub = {
  body: { innerHTML: '' },
  head: { appendChild() {} },
  createElement() {
    return { href: '', download: '', click() {} };
  },
  getElementById() {
    return stubEl();
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
  readyState: 'complete',
};

function patchTimersAndUi(ctx) {
  const origSetTimeout = ctx.setTimeout;
  const origSetInterval = ctx.setInterval;
  const origGetElementById = ctx.document.getElementById;
  ctx.setTimeout = function (fn) {
    if (typeof fn === 'function') fn();
    return 0;
  };
  ctx.setInterval = function () {
    return 0;
  };
  ctx.document.getElementById = function (id) {
    if (id === 'abtn') return { disabled: false, textContent: '', style: {} };
    return origGetElementById.call(ctx.document, id);
  };
  const noop = () => {};
  const saved = {};
  for (const name of [
    'renderAll',
    'showSum',
    'showGrade',
    'autoSave',
    'showToast',
    'injectTradeNewsForeshadow',
    'queuePlayerTalentPortraits',
    'queueAutoLogosForPlayerStations',
    'flushMilestones',
  ]) {
    if (typeof ctx[name] === 'function') {
      saved[name] = ctx[name];
      ctx[name] = noop;
    }
  }
  if (ctx.MP && typeof ctx.MP.renderStatus === 'function') {
    saved._mpRenderStatus = ctx.MP.renderStatus;
    ctx.MP.renderStatus = noop;
  }
  return () => {
    ctx.setTimeout = origSetTimeout;
    ctx.setInterval = origSetInterval;
    ctx.document.getElementById = origGetElementById;
    for (const k of Object.keys(saved)) {
      if (k === '_mpRenderStatus') {
        if (ctx.MP) ctx.MP.renderStatus = saved[k];
      } else {
        ctx[k] = saved[k];
      }
    }
  };
}

function createContext() {
  const ctx = vm.createContext({
    console: { log() {}, error: console.error },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {} },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval() {
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class {
      constructor() {}
    },
    FileReader: class {
      readAsText() {}
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
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus() {} };
  return ctx;
}

function loadLegacy(ctx, src) {
  vm.runInContext(src, ctx);
}

function promoteClusterSize(ctx, clusterSize, seed) {
  vm.runInContext(
    `
    (function(){
      (function(){
        var s = ${seed};
        Math.random = function(){
          s = (s * 9301 + 49297) % 233280;
          return s / 233280;
        };
      })();
    G = genMarket('chrwar');
    var want = ${clusterSize};
    var players = G.stations.filter(function(st){ return st && st.isPlayer; });
    if (players.length !== 1) throw new Error('expected 1 starter player, got ' + players.length);
    if (want < 1) throw new Error('clusterSize');
    var need = want - 1;
    if (need > 0) {
      var pool = G.stations.filter(function(st){
        return st && !st._bpSlotDeferred && !st.isPublic && !st.isPlayer;
      });
      pool.sort(function(a,b){ return (b.rat && b.rat.share || 0) - (a.rat && a.rat.share || 0); });
      for (var i = 0; i < need && i < pool.length; i++) {
        pool[i].isPlayer = true;
        pool[i].color = '#f5a623';
      }
    }
    G.ps = G.stations.filter(function(s){ return s && s.isPlayer; });
    if (G.ps.length !== want) throw new Error('cluster size mismatch want '+want+' have '+G.ps.length);
    recalc(G.stations, G);
    seedRev(G.stations, G);
    })();
    `,
    ctx
  );
}

function advanceToYearPeriod(ctx, endYear, endPeriod, maxSteps) {
  return vm.runInContext(
    `
    (function(){
      var steps = 0;
      var maxSteps = ${maxSteps};
      while (steps < maxSteps) {
        if (G.year === ${endYear} && G.period === ${endPeriod}) return { ok: true, steps: steps };
        if (G.year > ${endYear} || (G.year === ${endYear} && G.period > ${endPeriod}))
          return { ok: false, steps: steps, error: 'overshot', at: { year: G.year, period: G.period } };
        advTurn();
        steps++;
      }
      return { ok: false, steps: steps, error: 'maxSteps', at: { year: G.year, period: G.period } };
    })()
    `,
    ctx
  );
}

function runForwardPeriods(ctx, n) {
  return vm.runInContext(
    `
    (function(){
      var profits = [];
      var cash0 = G.cash || 0;
      for (var i = 0; i < ${n}; i++) {
        advTurn();
        var p = (G.stations || []).filter(function(s){ return s && s.isPlayer; })
          .reduce(function(sum, st){ return sum + (st.fin && st.fin.ebitda != null ? st.fin.ebitda : 0); }, 0);
        profits.push(p);
      }
      return { cashStart: cash0, cashEnd: G.cash || 0, profits: profits, sumProfit: profits.reduce(function(a,b){ return a+b; }, 0) };
    })()
    `,
    ctx
  );
}

/** Same G: CURRENT then BASELINE finances via seedRev toggle; restore CURRENT for forward sim. */
function dualSeedRevCompare(ctx) {
  return vm.runInContext(
    `
    (function(){
      G._fixedCostDiagBaseline = false;
      seedRev(G.stations, G);
      var cur = null;
      var base = null;
      (function(){
        var ps = (G.stations || []).filter(function(s){ return s && s.isPlayer; });
        var rev = 0, cost = 0, fix = 0, tal = 0, ebitda = 0, opsFloor = 0, salesAdmin = 0;
        var staff = 0, fac = 0, reg = 0, sf = 0, group = 0;
        ps.forEach(function(s){
          var f = s.fin || {};
          rev += f.rev || 0;
          cost += f.cost || 0;
          fix += f.fix || 0;
          tal += f.tal || 0;
          ebitda += f.ebitda || 0;
          opsFloor += f.opsFloor || 0;
          salesAdmin += f.salesAdmin || 0;
          var sp = f._diagFixSplit;
          if (sp) {
            staff += sp.staff || 0;
            fac += sp.fac || 0;
            reg += sp.reg || 0;
            sf += sp.sf || 0;
            group += sp.group || 0;
          }
        });
        cur = {
          nStations: ps.length,
          rev: rev, cost: cost, fix: fix, tal: tal, ebitda: ebitda,
          opsFloor: opsFloor, salesAdmin: salesAdmin,
          staff: staff, fac: fac, reg: reg, sf: sf, groupOverhead: group,
          ebitdaMarginPct: rev > 0 ? (ebitda / rev) * 100 : null
        };
      })();
      G._fixedCostDiagBaseline = true;
      seedRev(G.stations, G);
      (function(){
        var ps = (G.stations || []).filter(function(s){ return s && s.isPlayer; });
        var rev = 0, cost = 0, fix = 0, tal = 0, ebitda = 0, opsFloor = 0, salesAdmin = 0;
        var staff = 0, fac = 0, reg = 0, sf = 0, group = 0;
        ps.forEach(function(s){
          var f = s.fin || {};
          rev += f.rev || 0;
          cost += f.cost || 0;
          fix += f.fix || 0;
          tal += f.tal || 0;
          ebitda += f.ebitda || 0;
          opsFloor += f.opsFloor || 0;
          salesAdmin += f.salesAdmin || 0;
          var sp = f._diagFixSplit;
          if (sp) {
            staff += sp.staff || 0;
            fac += sp.fac || 0;
            reg += sp.reg || 0;
            sf += sp.sf || 0;
            group += sp.group || 0;
          }
        });
        base = {
          nStations: ps.length,
          rev: rev, cost: cost, fix: fix, tal: tal, ebitda: ebitda,
          opsFloor: opsFloor, salesAdmin: salesAdmin,
          staff: staff, fac: fac, reg: reg, sf: sf, groupOverhead: group,
          ebitdaMarginPct: rev > 0 ? (ebitda / rev) * 100 : null
        };
      })();
      G._fixedCostDiagBaseline = false;
      seedRev(G.stations, G);
      return { current: cur, baseline: base };
    })()
    `,
    ctx
  );
}

function runScenario(marketId, clusterSize, seed, targetYear, targetPeriod, forwardPeriods) {
  const ctx = createContext();
  loadLegacy(ctx, buildDiagLegacySrc(marketId));
  vm.runInContext(`syncMarketPopToMarket(${JSON.stringify(marketId)});`, ctx);
  promoteClusterSize(ctx, clusterSize, seed);

  const restoreUi = patchTimersAndUi(ctx);
  try {
    const adv = advanceToYearPeriod(ctx, targetYear, targetPeriod, 600);
    if (!adv.ok) {
      return { error: adv, marketId, clusterSize };
    }
    const cmp = dualSeedRevCompare(ctx);
    const cashAtSnap = vm.runInContext('G.cash||0', ctx);
    const fwd = runForwardPeriods(ctx, forwardPeriods);
    const dRev = cmp.current.rev - cmp.baseline.rev;
    const dFix = cmp.current.fix - cmp.baseline.fix;
    const dStaff = cmp.current.staff - cmp.baseline.staff;
    const dFac = cmp.current.fac - cmp.baseline.fac;
    const dGroup = cmp.current.groupOverhead - cmp.baseline.groupOverhead;
    const dEbit = cmp.current.ebitda - cmp.baseline.ebitda;
    const implied6p = forwardPeriods * dEbit;
    return {
      marketId,
      clusterSize,
      seed,
      advStepsToTarget: adv.steps,
      year: targetYear,
      period: targetPeriod,
      forwardPeriods,
      cashAtSnapshot: cashAtSnap,
      cashAfterForward: fwd.cashEnd,
      cashDeltaForward: fwd.cashEnd - cashAtSnap,
      sumPlayerEbitdaForward: fwd.sumProfit,
      baseline: cmp.baseline,
      current: cmp.current,
      delta_rev: dRev,
      delta_fix: dFix,
      delta_staff: dStaff,
      delta_fac: dFac,
      delta_groupOverhead: dGroup,
      delta_ebitda_halfPeriod: dEbit,
      implied_cash_delta_if_flat_ebitda: implied6p,
      rev_match_ok:
        Math.abs(dRev) <=
        1 + 0.025 * Math.max(cmp.current.rev, cmp.baseline.rev, 1),
      delta_rev_pct: cmp.baseline.rev > 0 ? (dRev / cmp.baseline.rev) * 100 : null,
    };
  } finally {
    restoreUi();
  }
}

function escapeCsv(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function flattenRow(r) {
  if (r.error) return r;
  const b = r.baseline;
  const c = r.current;
  return {
    marketId: r.marketId,
    clusterSize: r.clusterSize,
    seed: r.seed,
    year: r.year,
    period: r.period,
    advStepsToTarget: r.advStepsToTarget,
    forwardPeriods: r.forwardPeriods,
    cashAtSnapshot: r.cashAtSnapshot,
    cashAfterForward: r.cashAfterForward,
    cashDeltaForward: r.cashDeltaForward,
    sumPlayerEbitdaForward: r.sumPlayerEbitdaForward,
    baseline_rev: b.rev,
    baseline_fix: b.fix,
    baseline_staff: b.staff,
    baseline_fac: b.fac,
    baseline_reg: b.reg,
    baseline_sf: b.sf,
    baseline_groupOverhead: b.groupOverhead,
    baseline_ebitda: b.ebitda,
    baseline_margin_pct: b.ebitdaMarginPct,
    current_rev: c.rev,
    current_fix: c.fix,
    current_staff: c.staff,
    current_fac: c.fac,
    current_reg: c.reg,
    current_sf: c.sf,
    current_groupOverhead: c.groupOverhead,
    current_ebitda: c.ebitda,
    current_margin_pct: c.ebitdaMarginPct,
    delta_rev: r.delta_rev,
    delta_fix: r.delta_fix,
    delta_staff: r.delta_staff,
    delta_fac: r.delta_fac,
    delta_groupOverhead: r.delta_groupOverhead,
    delta_ebitda_halfPeriod: r.delta_ebitda_halfPeriod,
    implied_cash_delta_if_flat_ebitda: r.implied_cash_delta_if_flat_ebitda,
    delta_rev_pct: r.delta_rev_pct,
    rev_match_ok: r.rev_match_ok,
  };
}

function main() {
  const markets = [
    { id: 'losangeles', label: 'Los Angeles (mega)' },
    { id: 'newyork', label: 'New York (mega)' },
    { id: 'chicago', label: 'Chicago (mega)' },
    { id: 'atlanta', label: 'Atlanta (medium control)' },
  ];
  const clusterSizes = [1, 2, 4, 6];
  const seed = 424242;
  const targetYear = 1999;
  const targetPeriod = 1;
  const forwardPeriods = 6;

  const rows = [];
  for (const m of markets) {
    for (const k of clusterSizes) {
      const r = runScenario(m.id, k, seed + k * 97 + m.id.length * 13, targetYear, targetPeriod, forwardPeriods);
      rows.push({ ...r, scenarioLabel: m.label });
    }
  }

  const errors = rows.filter((r) => r.error);
  if (errors.length) {
    console.error('Diagnostic errors:', JSON.stringify(errors, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const flat = rows.map(flattenRow);
  fs.writeFileSync(outJson, JSON.stringify(flat, null, 2), 'utf8');

  const header = Object.keys(flat[0]).join(',');
  fs.writeFileSync(outCsv, [header, ...flat.map((o) => Object.values(o).map(escapeCsv).join(','))].join('\n'), 'utf8');

  console.log('\n=== Fixed-cost / cluster diagnostic (same world, dual seedRev @ ' + targetYear + 'p' + targetPeriod + ') ===\n');
  console.log(
    'Snapshot: BASELINE = old cluster rules on **player** stations only. Sellout still uses that peer list → small raw-rev/pool drift vs CURRENT (see delta_rev_pct in JSON).'
  );
  console.log('Forward: ' + forwardPeriods + ' advTurns under CURRENT rules only.');
  console.log('implied_cash_delta_if_flat_ebitda = ' + forwardPeriods + ' × (current_ebitda − baseline_ebitda) at snapshot (rough scaling).\n');

  function block(title, filter) {
    console.log(title);
    console.log(
      [
        'k',
        'rev(b=c)',
        'fix B',
        'fix C',
        'Δfix',
        'grp C',
        'EBITDA B',
        'EBITDA C',
        'Δmargin pp',
        'cash@snap',
        'Δcash 6p',
        'implied6p×ΔEBITDA',
      ].join('\t')
    );
    for (const k of clusterSizes) {
      const r = rows.find((x) => filter(x) && x.clusterSize === k);
      if (!r || r.error) continue;
      const b = r.baseline;
      const c = r.current;
      const dM = (c.ebitdaMarginPct || 0) - (b.ebitdaMarginPct || 0);
      console.log(
        [
          k,
          Math.round(c.rev),
          Math.round(b.fix),
          Math.round(c.fix),
          Math.round(r.delta_fix),
          Math.round(c.groupOverhead),
          Math.round(b.ebitda),
          Math.round(c.ebitda),
          dM.toFixed(2),
          Math.round(r.cashAtSnapshot),
          Math.round(r.cashDeltaForward),
          Math.round(r.implied_cash_delta_if_flat_ebitda),
        ].join('\t')
      );
    }
    console.log('');
  }

  block('--- Los Angeles ---', (x) => x.marketId === 'losangeles');
  block('--- New York ---', (x) => x.marketId === 'newyork');
  block('--- Chicago ---', (x) => x.marketId === 'chicago');
  block('--- Atlanta ---', (x) => x.marketId === 'atlanta');

  const la4 = rows.find((x) => x.marketId === 'losangeles' && x.clusterSize === 4);
  if (la4 && !la4.error) {
    const df = la4.delta_fix;
    const dg = la4.delta_groupOverhead;
    const dsf = la4.delta_staff + la4.delta_fac;
    console.log('--- LA k=4: share of Δfix (CURRENT − BASELINE) ---');
    console.log('Δfix total:', Math.round(df));
    console.log('  from group OH line:', Math.round(dg), '(' + ((dg / df) * 100).toFixed(1) + '% of Δfix)');
    console.log('  from staff+fac:', Math.round(dsf), '(' + ((dsf / df) * 100).toFixed(1) + '% of Δfix)');
    console.log('ΔEBITDA (half, portfolio):', Math.round(la4.delta_ebitda_halfPeriod));
  }

  const revBad = rows.filter((r) => !r.rev_match_ok);
  if (revBad.length) {
    console.log('\nNote: |delta_rev| > 2.5% of portfolio rev on', revBad.length, 'rows (sellout × cluster peer list).');
  }

  console.log('\nFiles written:\n ', outJson, '\n ', outCsv);

  console.log('\n=== Interpretation ===');
  console.log(
    'Group overhead alone is a modest share of total Δfix; staff+fac (softer discount + higher floor) usually dominates.'
  );
  console.log(
    'Snapshot EBITDA deltas are authoritative for same-world cost rules; 6-period cash includes revenue growth & AI path under CURRENT only.'
  );
}

main();
