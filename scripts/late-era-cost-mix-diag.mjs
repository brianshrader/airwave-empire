#!/usr/bin/env node
/**
 * Late-1990s / 2000s cost-mix diagnostic (headless VM).
 *
 * Measures player cluster vs top-AI-rival cost structure at chosen year/period.
 * Promo/prog uses `s.fin.effPromo` / `s.fin.effProg` when set (includes player
 * competitive baseline floor from calcRev/seedRev); otherwise capped slider values.
 *
 * Before competitive baseline (historical): player clusters at 0% slider showed ~0%
 * promo+prog vs AI top-4 ~2–4%. After: expect player ~2–4% in mega markets when
 * share is high (floor scales with tier, share, era).
 *
 *   node scripts/late-era-cost-mix-diag.mjs
 *   npm run diag:late-era-cost-mix
 *
 * Output: reports/late-era-cost-mix-diag.json (+ stdout summary)
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
const outJson = path.join(outDir, 'late-era-cost-mix-diag.json');

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function injectFixSplitInstrumentation(src) {
  return src.replace(
    's.fin.tal=talCost;s.fin.fix=fixedCost;s.fin.groupOverhead=groupOverheadHalf;',
    's.fin._diagFixSplit={staff:staffCost,fac:facCost,reg:regCostScaled,sf:sfCostScaled,group:groupOverheadHalf};s.fin.tal=talCost;s.fin.fix=fixedCost;s.fin.groupOverhead=groupOverheadHalf;'
  );
}

function makeLegacySrc(marketId) {
  let legacySrc = fs.readFileSync(legacyPath, 'utf8');
  if (!legacySrc.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  const mid = marketId === 'atlanta' ? 'atlanta' : marketId;
  return legacySrc.replace(/let ACTIVE_MARKET='atlanta'/, `let ACTIVE_MARKET='${mid}'`);
}

function buildSrc(marketId) {
  return injectFixSplitInstrumentation(injectHeadlessMegaFragNewsGuard(makeLegacySrc(marketId)));
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
          return { ok: false, steps: steps, error: 'overshot' };
        advTurn();
        steps++;
      }
      return { ok: false, steps: steps, error: 'maxSteps' };
    })()
    `,
    ctx
  );
}

function runForwardPeriods(ctx, n) {
  return vm.runInContext(
    `
    (function(){
      var cash0 = G.cash || 0;
      for (var i = 0; i < ${n}; i++) advTurn();
      return { cash0: cash0, cash1: G.cash || 0, delta: (G.cash || 0) - cash0 };
    })()
    `,
    ctx
  );
}

/** Full cost-mix snapshot inside VM (mirrors calcRev + seedRev cost line). */
const AGG_FN = `
function __wlAggStations(stations, G) {
  var pc = promoBudgetCapForPeriod(G);
  var pgc = progBudgetCapForPeriod(G);
  var rev = 0, fix = 0, fixStaff = 0, fixFac = 0, fixReg = 0, fixSf = 0, groupOH = 0;
  var tal = 0, salesAdmin = 0, opsFloor = 0, promo = 0, prog = 0, baselinePP = 0, identity = 0;
  var streamU = 0, simFee = 0, synd = 0, aiInt = 0, cost = 0, ebitda = 0;
  stations.forEach(function(s) {
    if (!s || s._bpSlotDeferred || s.isPublic) return;
    var f = s.fin || {};
    var sp = f._diagFixSplit;
    if (sp) {
      fixStaff += sp.staff || 0;
      fixFac += sp.fac || 0;
      fixReg += sp.reg || 0;
      fixSf += sp.sf || 0;
      groupOH += sp.group || 0;
    }
    var ep = f.effPromo != null ? f.effPromo : Math.min(s.ops && s.ops.promo || 0, pc);
    var epg = f.effProg != null ? f.effProg : Math.min(s.ops && s.ops.progBudget || 0, pgc);
    baselinePP += (f.competitiveBaselinePromo || 0) + (f.competitiveBaselineProg || 0);
    rev += f.rev || 0;
    fix += f.fix || 0;
    tal += f.tal || 0;
    salesAdmin += f.salesAdmin || 0;
    opsFloor += f.opsFloor || 0;
    promo += ep;
    prog += epg;
    identity += s.identityBudget || 0;
    streamU += f.streamUpkeep || 0;
    simFee += f.simulcastProgFee || 0;
    synd += f.syndicationRights || 0;
    aiInt += f.aiLoanInterest || 0;
    cost += f.cost || 0;
    ebitda += f.ebitda || 0;
  });
  var otherFixed = Math.max(0, fix - fixStaff - fixFac - fixReg - fixSf);
  return {
    n: stations.length,
    rev: rev,
    fix: fix,
    fixStaff: fixStaff,
    fixFac: fixFac,
    fixRegSf: fixReg + fixSf,
    groupOverheadInFix: groupOH,
    otherFixedPlug: otherFixed,
    tal: tal,
    salesAdmin: salesAdmin,
    opsFloor: opsFloor,
    promo: promo,
    prog: prog,
    promoProg: promo + prog,
    baselinePromoProg: baselinePP,
    identity: identity,
    streamUpkeep: streamU,
    simulcastProgFee: simFee,
    syndication: synd,
    aiLoanInterest: aiInt,
    cost: cost,
    ebitda: ebitda,
    marginPct: rev > 0 ? (ebitda / rev) * 100 : null
  };
}
function __wlPct(x, rev) { return rev > 0 ? (x / rev) * 100 : null; }
`;

function runScenario(marketId, clusterSize, seed, endYear, endPeriod, forwardPeriods, snapshotTag) {
  const ctx = createContext();
  loadLegacy(ctx, buildSrc(marketId));
  vm.runInContext(`syncMarketPopToMarket(${JSON.stringify(marketId)});`, ctx);
  promoteClusterSize(ctx, clusterSize, seed);

  const restoreUi = patchTimersAndUi(ctx);
  try {
    const adv = advanceToYearPeriod(ctx, endYear, endPeriod, 700);
    if (!adv.ok) return { error: adv, marketId, clusterSize };

    vm.runInContext(AGG_FN, ctx);

    const row = vm.runInContext(
      `
      (function(){
        var ps = G.stations.filter(function(s){ return s && s.isPlayer; });
        var player = __wlAggStations(ps, G);
        var rivals = G.stations.filter(function(s){
          return s && !s._bpSlotDeferred && !s.isPublic && !s.isPlayer;
        }).sort(function(a,b){ return (b.fin && b.fin.rev || 0) - (a.fin && a.fin.rev || 0); });
        var top4 = rivals.slice(0, 4);
        var aiTop4 = __wlAggStations(top4, G);
        var lead = ps.slice().sort(function(a,b){ return (b.fin && b.fin.rev || 0) - (a.fin && a.fin.rev || 0); })[0];
        var leadRow = lead ? __wlAggStations([lead], G) : null;
        player.pct = {
          fix: __wlPct(player.fix, player.rev),
          tal: __wlPct(player.tal, player.rev),
          salesAdmin: __wlPct(player.salesAdmin, player.rev),
          opsFloor: __wlPct(player.opsFloor, player.rev),
          promoProg: __wlPct(player.promoProg, player.rev),
          baselinePP: __wlPct(player.baselinePromoProg, player.rev),
          syndication: __wlPct(player.syndication, player.rev),
          streamUpkeep: __wlPct(player.streamUpkeep, player.rev)
        };
        aiTop4.pct = {
          fix: __wlPct(aiTop4.fix, aiTop4.rev),
          tal: __wlPct(aiTop4.tal, aiTop4.rev),
          salesAdmin: __wlPct(aiTop4.salesAdmin, aiTop4.rev),
          opsFloor: __wlPct(aiTop4.opsFloor, aiTop4.rev),
          promoProg: __wlPct(aiTop4.promoProg, aiTop4.rev),
          syndication: __wlPct(aiTop4.syndication, aiTop4.rev),
          streamUpkeep: __wlPct(aiTop4.streamUpkeep, aiTop4.rev)
        };
        if (leadRow) {
          leadRow.pct = {
            fix: __wlPct(leadRow.fix, leadRow.rev),
            tal: __wlPct(leadRow.tal, leadRow.rev),
            salesAdmin: __wlPct(leadRow.salesAdmin, leadRow.rev),
            opsFloor: __wlPct(leadRow.opsFloor, leadRow.rev),
            promoProg: __wlPct(leadRow.promoProg, leadRow.rev),
            baselinePP: __wlPct(leadRow.baselinePromoProg, leadRow.rev)
          };
        }
        return {
          year: G.year,
          period: G.period,
          advSteps: ${adv.steps},
          player: player,
          aiTop4ByRev: aiTop4,
          leadingPlayerStation: leadRow
        };
      })()
      `,
      ctx
    );

    const cashAtSnap = vm.runInContext('G.cash||0', ctx);
    const fwd = runForwardPeriods(ctx, forwardPeriods);
    return {
      marketId,
      clusterSize,
      seed,
      snapshotLabel: (snapshotTag || endYear + 'p' + endPeriod) + ' (clock ' + endYear + 'p' + endPeriod + ')',
      snapshotTag: snapshotTag || null,
      ...row,
      cashAtSnapshot: cashAtSnap,
      forwardPeriods,
      cashDeltaForward: fwd.delta,
      cashAfterForward: fwd.cash1,
    };
  } finally {
    restoreUi();
  }
}

function main() {
  const mega = [
    { id: 'losangeles', label: 'LA' },
    { id: 'newyork', label: 'NY' },
    { id: 'chicago', label: 'Chicago' },
  ];
  const control = [{ id: 'atlanta', label: 'Atlanta (control)' }];
  const clusterSizes = [4, 6];
  const seedBase = 424242;
  const forwardPeriods = 8;

  /** Mega markets: user-requested late-90s / 2000 snapshots (Fall = period 2). */
  const megaSnapshots = [
    { year: 1999, period: 2, tag: '1999-Fall' },
    { year: 2000, period: 2, tag: '2000-Fall' },
  ];

  const rows = [];
  for (const snap of megaSnapshots) {
    for (const m of mega) {
      for (const k of clusterSizes) {
        const seed = seedBase + k * 97 + m.id.length * 13 + snap.year * 3 + snap.period;
        const r = runScenario(m.id, k, seed, snap.year, snap.period, forwardPeriods, snap.tag);
        rows.push({ ...r, marketLabel: m.label });
      }
    }
  }
  for (const m of control) {
    for (const k of clusterSizes) {
      const seed = seedBase + k * 97 + m.id.length * 13 + 2001;
      const r = runScenario(m.id, k, seed, 2001, 1, forwardPeriods, '2001-Spring-control');
      rows.push({ ...r, marketLabel: m.label });
    }
  }

  const bad = rows.filter((r) => r.error);
  if (bad.length) {
    console.error(JSON.stringify(bad, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(rows, null, 2), 'utf8');

  console.log('\n=== Late-era cost mix (player cluster vs AI top-4 by rev) ===');
  console.log(
    'Mega: LA/NY/Chicago at 1999-Fall & 2000-Fall; control: Atlanta 2001-Spring. ' +
      'Forward: ' +
      forwardPeriods +
      ' advTurns. Units: $/half unless noted.'
  );
  console.log(
    'Before baseline (legacy): player promo+prog% tracked slider-only (~0% at defaults). ' +
      'After: effPromo/effProg include competitive floor for player stations.\n'
  );

  console.log(
    [
      'snap',
      'mkt',
      'k',
      'playerRev',
      'margin%',
      'fix%',
      'tal%',
      'salesAdm%',
      'opsFl%',
      'promo+prog%',
      'floor%',
      'synd%',
      'AI4_promo+prog%',
      'Δcash8p',
    ].join('\t')
  );

  for (const r of rows) {
    const p = r.player;
    const a = r.aiTop4ByRev;
    const snapShort = r.snapshotTag || '';
    console.log(
      [
        snapShort.slice(0, 12),
        r.marketId.slice(0, 2),
        r.clusterSize,
        Math.round(p.rev),
        p.marginPct != null ? p.marginPct.toFixed(1) : '',
        p.pct.fix != null ? p.pct.fix.toFixed(2) : '',
        p.pct.tal != null ? p.pct.tal.toFixed(2) : '',
        p.pct.salesAdmin != null ? p.pct.salesAdmin.toFixed(2) : '',
        p.pct.opsFloor != null ? p.pct.opsFloor.toFixed(2) : '',
        p.pct.promoProg != null ? p.pct.promoProg.toFixed(2) : '',
        p.pct.baselinePP != null ? p.pct.baselinePP.toFixed(2) : '',
        p.pct.syndication != null ? p.pct.syndication.toFixed(2) : '',
        a.pct.promoProg != null ? a.pct.promoProg.toFixed(2) : '',
        Math.round(r.cashDeltaForward),
      ].join('\t')
    );
  }

  console.log('\nLeading player station (max rev in cluster), k=6 only:');
  for (const r of rows.filter((x) => x.clusterSize === 6)) {
    const L = r.leadingPlayerStation;
    if (!L || !L.rev) continue;
    console.log(
      (r.snapshotTag || '') +
        '\t' +
        r.marketId +
        '\trev=' +
        Math.round(L.rev) +
        '\tmargin%=' +
        (L.marginPct != null ? L.marginPct.toFixed(1) : '') +
        '\ttal%=' +
        (L.pct.tal != null ? L.pct.tal.toFixed(2) : '') +
        '\tpromo+prog%=' +
        (L.pct.promoProg != null ? L.pct.promoProg.toFixed(2) : '') +
        '\tfloor%=' +
        (L.pct.baselinePP != null ? L.pct.baselinePP.toFixed(2) : '')
    );
  }

  console.log('\nWritten', outJson);
}

main();
