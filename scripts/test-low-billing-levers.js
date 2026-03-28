#!/usr/bin/env node
/**
 * Injects one of three narrow low-billing FM patches into legacy.js source (in memory), runs VM scenarios.
 * Usage: node scripts/test-low-billing-levers.js [baseline|ops|fixed|sellout]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCENARIOS = [
  { market: 'losangeles', scen: 'under', key: 'LA_Underdog' },
  { market: 'chicago', scen: 'under', key: 'CHI_Underdog' },
  { market: 'atlanta', scen: 'under', key: 'ATL_Underdog' },
  { market: 'losangeles', scen: 'stack', key: 'LA_Stack' },
];

const SEED = 424242;

function baseLegacy() {
  const legacyPath = path.join(__dirname, '..', 'src', 'legacy.js');
  let s = fs.readFileSync(legacyPath, 'utf8');
  return s;
}

function patch(mode, src) {
  if (mode === 'baseline') return src;

  if (mode === 'ops') {
    const needle = '  opsFloor=Math.round(opsFloor*mktFixMult);';
    const add = `  opsFloor=Math.round(opsFloor*mktFixMult);
  if(year<1980&&s.sig.type==='FM'&&!TALK_FMTS.includes(s.format)&&totalRev<120000){
    const _lbu=Math.max(0,Math.min(1,totalRev/120000));
    opsFloor=Math.round(opsFloor*(0.58+0.42*_lbu));
  }`;
    if (!src.includes(needle)) throw new Error('anchor opsFloor not found');
    return src.replace(needle, add);
  }

  if (mode === 'fixed') {
    let s = src.replace('  const fixedCost=staffCost+facCost+regCostScaled+sfCostScaled;', '  let fixedCost=staffCost+facCost+regCostScaled+sfCostScaled;');
    const needle = '  opsFloor=Math.round(opsFloor*mktFixMult);';
    const add = `  opsFloor=Math.round(opsFloor*mktFixMult);
  if(year<1980&&s.sig.type==='FM'&&!TALK_FMTS.includes(s.format)&&totalRev<120000){
    const _lbu=Math.max(0,Math.min(1,totalRev/120000));
    fixedCost=Math.round(fixedCost*(0.70+0.30*_lbu));
  }`;
    if (!s.includes(needle)) throw new Error('anchor opsFloor not found');
    return s.replace(needle, add);
  }

  if (mode === 'sellout') {
    const needle = `  if(year<1980&&_sellTier!=='mega'&&s.sig.type==='FM'&&!TALK_FMTS.includes(s.format)&&shareSelloutMult<0.76)shareSelloutMult=0.76;
  rev=Math.round(rev*shareSelloutMult);`;
    const add = `  if(year<1980&&_sellTier!=='mega'&&s.sig.type==='FM'&&!TALK_FMTS.includes(s.format)&&shareSelloutMult<0.76)shareSelloutMult=0.76;
  if(year<1980&&_sellTier==='mega'&&s.sig.type==='FM'&&!TALK_FMTS.includes(s.format)&&shareSelloutMult<0.62)shareSelloutMult=0.62;
  rev=Math.round(rev*shareSelloutMult);`;
    if (!src.includes(needle)) throw new Error('anchor sellout not found');
    return src.replace(needle, add);
  }

  throw new Error('unknown mode ' + mode);
}

function makeCtx(legacySrc) {
  function stubEl() {
    return {
      disabled: false, textContent: '', innerHTML: '', value: '',
      style: {}, classList: { contains() { return false; }, add() {}, remove() {} },
      appendChild() {}, querySelector() { return null; }, focus() {}, click() {},
      addEventListener() {}, removeEventListener() {},
    };
  }
  const documentStub = {
    body: { innerHTML: '' },
    head: { appendChild() {} },
    createElement() { return { href: '', download: '', click() {} }; },
    getElementById() { return stubEl(); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    readyState: 'complete',
  };
  const ctx = vm.createContext({
    console: { log() {}, error: console.error },
    __WL_HEADLESS__: true,
    globalThis: null,
    window: null,
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {} },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    setInterval() { return 0; },
    clearTimeout() {}, clearInterval() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
    alert() {},
    fetch: null,
    btoa: (s) => Buffer.from(s, 'utf8').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('utf8'),
    Blob: class { constructor() {} },
    FileReader: class { readAsText() {} },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
    Symbol, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
    Int8Array, Uint8Array, Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInContext(legacySrc, ctx);
  return ctx;
}

function runScenario(ctx, marketId, scenId) {
  const mid = marketId === 'atlanta' ? 'atlanta' : marketId;
  vm.runInContext(`ACTIVE_MARKET='${mid}';`, ctx);
  vm.runInContext(
    `
    (function(){
      var s = ${SEED};
      Math.random = function(){
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    })();
    G = genMarket(${JSON.stringify(scenId)});
    seedRev(G.stations, G);
    `,
    ctx
  );
  return vm.runInContext(
    `
    (function(){
      var mkt = G.marketId || ACTIVE_MARKET;
      var players = G.stations.filter(function(s){ return s && s.isPlayer; });
      return players.map(function(p){
        var rev = p.fin && p.fin.rev || 0;
        var ebitda = p.fin && p.fin.ebitda;
        return {
          callLetters: p.callLetters,
          sig: p.sig && p.sig.type,
          revenue: rev,
          totalCost: p.fin && p.fin.cost,
          ebitda: ebitda,
          marginPct: rev > 0 ? (ebitda / rev) * 100 : null,
        };
      });
    })()
    `,
    ctx
  );
}

function main() {
  const mode = process.argv[2] || 'baseline';
  const src = patch(mode, baseLegacy());
  const ctx = makeCtx(src);

  const out = { mode, rows: {} };
  for (const { market, scen, key } of SCENARIOS) {
    runScenario(ctx, market, scen);
    const players = vm.runInContext(
      `
      G.stations.filter(function(s){ return s && s.isPlayer; }).map(function(p){
        var rev = p.fin && p.fin.rev || 0;
        var ebitda = p.fin && p.fin.ebitda;
        return {
          callLetters: p.callLetters,
          sig: p.sig && p.sig.type,
          revenue: rev,
          totalCost: p.fin && p.fin.cost,
          ebitda: ebitda,
          marginPct: rev > 0 ? (ebitda / rev) * 100 : null,
        };
      })
      `,
      ctx
    );
    out.rows[key] = players;
  }
  console.log(JSON.stringify(out, null, 2));
}

main();
