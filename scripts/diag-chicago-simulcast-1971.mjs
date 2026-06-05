#!/usr/bin/env node
/**
 * Audit AM/FM explicit simulcast economics — Chicago 1971 Fall, shares ~AM 3.9% / FM 1.2%.
 * Uses full seedRev path (market pool + FM revenue dedupe), not calcRev-only.
 *
 *   node scripts/diag-chicago-simulcast-1971.mjs
 */
/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

const noop = () => {};
function stubEl() {
  return {
    disabled: false,
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    classList: { add: noop, remove: noop, contains: () => false },
    addEventListener: noop,
    removeEventListener: noop,
    click: noop,
  };
}

function createCtx() {
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error },
    __WL_HEADLESS__: true,
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
    parseInt,
    parseFloat,
    Infinity,
    NaN,
    undefined,
    Int8Array,
    Uint8Array,
    Buffer,
    Promise,
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 0;
    },
    setInterval: () => 0,
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.document = {
    readyState: 'complete',
    getElementById(id) {
      if (id === 'abtn') return stubEl();
      const el = stubEl();
      el.dataset = {};
      return el;
    },
    querySelectorAll: () => [],
    body: { innerHTML: '', appendChild: noop, dataset: {} },
    documentElement: { dataset: {} },
    head: { appendChild: noop },
    addEventListener: noop,
    removeEventListener: noop,
    createElement: () => stubEl(),
  };
  ctx.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  ctx.sessionStorage = { getItem: noop, setItem: noop };
  ctx.location = { reload: noop, search: '', href: 'http://127.0.0.1/' };
  ctx.alert = noop;
  ctx.fetch = null;
  ctx.btoa = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  ctx.atob = (s) => Buffer.from(String(s), 'base64').toString('utf8');
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus: noop, action: noop, emit: noop };
  return ctx;
}

function loadLegacyChicago() {
  let src = fs.readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  return src.replace(/let ACTIVE_MARKET='atlanta'/, "let ACTIVE_MARKET='chicago'");
}

const harnessJs = `
(function () {
  function finRow(st, G) {
    var f = st.fin || {};
    return {
      call: st.callLetters,
      format: st.format,
      sharePct: Math.round((st.rat?.share || 0) * 1000) / 10,
      sig: (st.sig && st.sig.type) + ' ' + (st.sig && st.sig.pw),
      isProgRcv: isSimulcastProgrammingReceiver(st, G),
      rev: f.rev,
      cost: f.cost,
      ebitda: f.ebitda,
      marginPct: f.rev > 0 ? Math.round((f.ebitda / f.rev) * 100) : null,
      fix: f.fix,
      tal: f.tal,
      salesAdmin: f.salesAdmin,
      opsFloor: f.opsFloor,
      effPromo: f.effPromo,
      effProg: f.effProg,
      syndicationRights: f.syndicationRights,
      identityPnl: stationIdentityBudgetPnlContribution(st, G),
    };
  }

  function pinShare(st, sh) {
    st.rat = st.rat || {};
    st.rat.share = sh;
    var cur = {};
    var cohorts = COH || [];
    for (var i = 0; i < cohorts.length; i++) {
      var c = cohorts[i];
      cur[c] = { aqh: Math.round(sh * 50000), share: sh };
    }
    st.rat.cur = cur;
    st.rat.aqh = cohorts.reduce(function (sum, c) {
      return sum + (cur[c] && cur[c].aqh ? cur[c].aqh : 0);
    }, 0);
  }

  function runScenario(label, year, period, amSh, fmSh, useSeedRev) {
    G = genMarketMP('1970');
    G.marketId = 'chicago';
    G.year = year;
    G.period = period;
    G.turn = (year - 1970) * 2 + (period === 2 ? 1 : 0);

    var comm = (G.stations || []).filter(function (s) {
      return s && !s._bpSlotDeferred && !stationIsNoncommercialInstitutional(s);
    });
    var am = comm.find(function (s) {
      return s.sig && s.sig.type === 'AM' && !s.fmBooster;
    });
    var fm = comm.find(function (s) {
      return s.sig && s.sig.type === 'FM' && !s.fmBooster && am && s.id !== am.id;
    });
    if (!am || !fm) throw new Error('need AM+FM');

    am.isPlayer = true;
    fm.isPlayer = true;
    am._mpOwner = 0;
    fm._mpOwner = 0;
    G.ps = [am, fm];

    breakSimulcast(G, am.id);
    breakSimulcast(G, fm.id);
    pinShare(am, amSh);
    pinShare(fm, fmSh);
    if (!am.ops) am.ops = { spots: 14, sell: 0.62, promo: 12000, progBudget: 8000 };
    if (!fm.ops) fm.ops = { spots: 14, sell: 0.45, promo: 8000, progBudget: 5000 };

    applySimulcastPair(am.id, fm.id, { suppressNews: true });

    var revBeforeDedupe = null;
    if (useSeedRev) {
      comm.forEach(function (s) {
        calcRev(s, G);
      });
      revBeforeDedupe = { am: am.fin.rev, fm: fm.fin.rev };
      seedRev(G.stations, G);
    } else {
      comm.forEach(function (s) {
        calcRev(s, G);
      });
    }

    var combinedShare = stationCardSimulcastCombinedShare01(am, fm);
    return {
      label: label,
      year: year,
      period: period === 2 ? 'FALL' : 'SPRING',
      maxDupPct: getMaxSimulcastPctForMarket(year, 'chicago'),
      dupFrac: fmAmCoownedDuplicateClockFraction01(fm, G),
      revBeforeDedupe: revBeforeDedupe,
      combinedSharePct: Math.round(combinedShare * 1000) / 10,
      am: finRow(am, G),
      fm: finRow(fm, G),
      combined: {
        rev: (am.fin.rev || 0) + (fm.fin.rev || 0),
        cost: (am.fin.cost || 0) + (fm.fin.cost || 0),
        ebitda: (am.fin.ebitda || 0) + (fm.fin.ebitda || 0),
      },
      fmCostPctOfAm: am.fin.cost > 0 ? Math.round(((fm.fin.cost || 0) / am.fin.cost) * 1000) / 10 : null,
      fmRevPctOfAm: am.fin.rev > 0 ? Math.round(((fm.fin.rev || 0) / am.fin.rev) * 1000) / 10 : null,
      receiverPolicy: simulcastReceiverExpensePolicy(fm, G),
    };
  }

  return {
    userTargetShares: runScenario('1971_FALL_user_shares_seedRev', 1971, 2, 0.039, 0.012, true),
    calcRevOnly: runScenario('1971_FALL_user_shares_calcRevOnly', 1971, 2, 0.039, 0.012, false),
    spring1971: runScenario('1971_SPR_user_shares_seedRev', 1971, 1, 0.046, 0.011, true),
    fall1970: runScenario('1970_FALL_user_shares_seedRev', 1970, 2, 0.049, 0.011, true),
  };
})()
`;

function main() {
  const ctx = createCtx();
  injectMarketEcologyIife(ctx);
  vm.runInContext(loadLegacyChicago(), ctx);
  const out = vm.runInContext(harnessJs, ctx);

  const md = [];
  md.push('# Chicago simulcast economics audit (1970–71)');
  md.push('');
  md.push('Pinned shares to match reported financials (~AM 3.9% / FM 1.2% Fall 1971).');
  md.push('Explicit star-model simulcast (AM source, FM receiver). Full `seedRev` path.');
  md.push('');

  for (const key of ['userTargetShares', 'spring1971', 'fall1970', 'calcRevOnly']) {
    const r = out[key];
    md.push(`## ${r.label} (${r.year} ${r.period})`);
    md.push('');
    md.push(`- FCC max dup %: **${r.maxDupPct}%** · FM dup clock fraction: **${Math.round(r.dupFrac * 100)}%**`);
    md.push(`- Combined deduped share: **${r.combinedSharePct}%**`);
    if (r.revBeforeDedupe) {
      md.push(`- FM rev before dedupe+pool: **$${Math.round(r.revBeforeDedupe.fm / 1000)}K** → after seedRev: **$${Math.round(r.fm.rev / 1000)}K**`);
      md.push(`- AM rev before → after: **$${Math.round(r.revBeforeDedupe.am / 1000)}K** → **$${Math.round(r.am.rev / 1000)}K**`);
    }
    md.push(`- FM rev = **${r.fmRevPctOfAm}%** of AM · FM cost = **${r.fmCostPctOfAm}%** of AM`);
    md.push('');
    md.push('| Leg | Share | Rev | Cost | EBITDA | fix | tal | salesAdmin | opsFloor | promo | prog |');
    md.push('|-----|-------|-----|------|--------|-----|-----|------------|----------|-------|------|');
    for (const leg of [r.am, r.fm]) {
      md.push(
        `| ${leg.call} | ${leg.sharePct}% | $${Math.round(leg.rev / 1000)}K | $${Math.round(leg.cost / 1000)}K | $${Math.round(leg.ebitda / 1000)}K | $${Math.round(leg.fix / 1000)}K | $${Math.round((leg.tal || 0) / 1000)}K | $${Math.round((leg.salesAdmin || 0) / 1000)}K | $${Math.round((leg.opsFloor || 0) / 1000)}K | $${Math.round((leg.effPromo || 0) / 1000)}K | $${Math.round((leg.effProg || 0) / 1000)}K |`
      );
    }
    md.push(
      `| **Combined** | ${r.combinedSharePct}% | $${Math.round(r.combined.rev / 1000)}K | $${Math.round(r.combined.cost / 1000)}K | $${Math.round(r.combined.ebitda / 1000)}K | | | | | | |`
    );
    md.push('');
  }

  md.push('## Diagnosis (code paths)');
  md.push('');
  md.push('1. **Revenue**: Each leg bills from its own AQH/share. FM also gets `cpEraFactor` ≈ 0.15 in 1971 (FM ad market immature) + low-share sellout penalties.');
  md.push('2. **FM dedupe**: `applySimulcastCoownedFmRevenueDedupe` scales FM rev by `(1-dup)+dup×0.40`. Chicago 1971 max dup = **50%** → mult ≈ **0.70** on the duplicated slice.');
  md.push('3. **Costs**: Receiver uses `simulcastReceiverExpensePolicy` (~38% staff/fac, 30% ops floor, trimmed sales admin) but **talent stays on AM only**.');
  md.push('4. **Mismatch**: Ratings dedupe overlap (combined 4.7%) but revenue does not get a “one product” uplift on FM — FM is penalized twice (tiny leg share + dedupe + immature FM CPM era).');

  const jsonPath = path.join(root, 'tmp', 'chicago_simulcast_1971_audit.json');
  const mdPath = path.join(root, 'tmp', 'chicago_simulcast_1971_audit.md');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  fs.writeFileSync(mdPath, md.join('\n'));
  console.log(JSON.stringify(out.userTargetShares, null, 2));
  console.error('\\nWrote', mdPath);
}

main();
