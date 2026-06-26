#!/usr/bin/env node
/**
 * Regression coverage for exclusive franchise orphan repair.
 *
 * Ensures the repair only reopens genuinely due/stuck unowned rights and does not
 * pull future-dated unowned contracts into the market early.
 */
/* eslint-disable no-console */

import path from 'path';
import { readFileSync } from 'fs';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { injectMarketEcologyIife } from './vmInjectMarketEcologyIife.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

function injectHeadlessMegaFragNewsGuard(src) {
  return src.replace(
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  const mkt=G.marketId||ACTIVE_MARKET;',
    'function tryLaunchOneMegaMarketFragmentation(G,ent){\n  if(!G.news)G.news=[];\n  const mkt=G.marketId||ACTIVE_MARKET;'
  );
}

function loadLegacySrc() {
  const src = readFileSync(legacyPath, 'utf8');
  if (!src.includes("let ACTIVE_MARKET='atlanta'")) throw new Error('ACTIVE_MARKET anchor missing');
  return injectHeadlessMegaFragNewsGuard(src);
}

function createVmContext() {
  const noop = () => {};
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error },
    __WL_HEADLESS__: true,
    document: {
      body: {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
      removeEventListener() {},
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { href: '' },
    window: null,
    setTimeout() { return 0; },
    setInterval() { return 0; },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame() { return 0; },
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
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Buffer,
    Promise,
  });
  ctx.globalThis = ctx;
  ctx.addEventListener = noop;
  ctx.removeEventListener = noop;
  ctx.window = ctx;
  return ctx;
}

function installRegression(ctx) {
  vm.runInContext(
    `
function __assertFranchiseRepair(cond,msg){
  if(!cond)throw new Error(msg);
}
function __makeFranchiseRepairGame(year,period,rightPatch){
  var right=Object.assign({
    holderId:null,
    holderName:'—',
    fee:240000,
    contractEnd:1994,
    bids:{},
    auctionOpen:false,
    auctionCloses:null,
    relationship:{}
  },rightPatch||{});
  return {
    year:year,
    period:period,
    marketId:'atlanta',
    news:[],
    stations:[{
      id:'talk-1',
      callLetters:'WTLK',
      format:'NEWS_TALK',
      isPlayer:false,
      isPublic:false,
      prog:{},
      fin:{}
    }],
    franchiseRights:{drummond_hour:right}
  };
}
function __runFranchiseRepairCase(name,year,period,rightPatch,expect){
  var G=__makeFranchiseRepairGame(year,period,rightPatch);
  var repaired=wlRepairOrphanExclusiveFranchiseRights(G,null,{silent:false});
  var r=G.franchiseRights.drummond_hour;
  __assertFranchiseRepair(repaired===expect.repaired,name+': repaired '+repaired+' !== '+expect.repaired);
  __assertFranchiseRepair(!!r.auctionOpen===!!expect.auctionOpen,name+': auctionOpen '+r.auctionOpen+' !== '+expect.auctionOpen);
  __assertFranchiseRepair(r.contractEnd===expect.contractEnd,name+': contractEnd '+r.contractEnd+' !== '+expect.contractEnd);
  __assertFranchiseRepair((G.news||[]).length===expect.newsCount,name+': news count '+(G.news||[]).length+' !== '+expect.newsCount);
  return {
    name:name,
    repaired:repaired,
    auctionOpen:!!r.auctionOpen,
    contractEnd:r.contractEnd,
    auctionCloses:r.auctionCloses,
    newsCount:(G.news||[]).length
  };
}
globalThis.__franchiseOrphanRepairRegression=function(){
  return [
    __runFranchiseRepairCase('future unowned remains closed',1990,1,{contractEnd:1994},{
      repaired:0,
      auctionOpen:false,
      contractEnd:1994,
      newsCount:0
    }),
    __runFranchiseRepairCase('stale unowned reopens',1990,1,{contractEnd:1989},{
      repaired:1,
      auctionOpen:true,
      contractEnd:1990,
      newsCount:1
    }),
    __runFranchiseRepairCase('missed spring unowned reopens',1990,2,{contractEnd:1990},{
      repaired:1,
      auctionOpen:true,
      contractEnd:1990,
      newsCount:1
    }),
    __runFranchiseRepairCase('invalid contract year reopens',1990,1,{contractEnd:'not-a-year'},{
      repaired:1,
      auctionOpen:true,
      contractEnd:1990,
      newsCount:1
    })
  ];
};
`,
    ctx
  );
}

function main() {
  const ctx = createVmContext();
  injectMarketEcologyIife(ctx);
  vm.runInContext(loadLegacySrc(), ctx, { filename: 'legacy.js' });
  installRegression(ctx);
  const rows = vm.runInContext('__franchiseOrphanRepairRegression()', ctx);
  console.table(rows);
  console.log('PASS: franchise orphan repair preserves future-dated unowned contracts and reopens due/stuck contracts.');
}

main();
