#!/usr/bin/env node
/**
 * Regression coverage for critical autosave and simulcast talent routing bugs.
 *
 *   node scripts/test-cloud-autosave-simulcast-regressions.mjs
 */
/* eslint-disable no-console */

import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function createLegacyContext() {
  const noop = () => {};
  const store = new Map();
  const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: console.error },
    __WL_HEADLESS__: true,
    document: {
      body: {},
      querySelector(sel) {
        return sel === 'meta[name="wl-clerk-publishable-key"]'
          ? { getAttribute() { return 'pk_test'; } }
          : null;
      },
      querySelectorAll() { return []; },
      getElementById() { return null; },
      addEventListener() {},
      removeEventListener() {},
    },
    localStorage: {
      getItem(k) { return store.get(k) ?? null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); },
    },
    location: { href: 'http://127.0.0.1/', search: '', hostname: 'localhost', port: '' },
    addEventListener: noop,
    removeEventListener: noop,
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
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
    Promise,
    URL,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.Clerk = { load: async () => {}, session: { getToken: async () => 'token' } };
  ctx.__WL_CLERK_PLAN_SLUG = 'starter';
  ctx.__store = store;
  vm.runInContext(readFileSync(legacyPath, 'utf8'), ctx, { filename: 'legacy.js', timeout: 180000 });
  return ctx;
}

async function testCloudResumeKeepsAdvancedLocalProgress() {
  const ctx = createLegacyContext();
  const fetches = [];
  ctx.localPayload = {
    saved: '2026-01-01T00:00:00.000Z',
    G: { year: 2010, period: 2, sc: { id: 'sc' }, stations: [{ id: 's1' }] },
  };
  const staleCloud = {
    saved: '2026-01-02T00:00:00.000Z',
    G: { year: 2008, period: 1, sc: { id: 'sc' }, stations: [{ id: 's1' }] },
  };
  ctx.fetch = async (url) => {
    fetches.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => (
        String(url).includes('/meta')
          ? { saved: staleCloud.saved, year: staleCloud.G.year, period: staleCloud.G.period }
          : staleCloud
      ),
    };
  };

  const result = await vm.runInContext('wlCloudAutosaveTryResumeOnInit(localPayload)', ctx, { timeout: 30000 });
  assert(result == null, 'older cloud progress must not auto-resume over advanced local progress');
  assert(fetches.length === 1 && fetches[0].includes('/meta'), 'older cloud metadata should prevent full autosave fetch');
  assert(ctx.__store.size === 0, 'older cloud progress must not be written to localStorage');
}

async function testCloudResumeAcceptsAdvancedCloudProgress() {
  const ctx = createLegacyContext();
  ctx.localPayload = {
    saved: '2026-01-02T00:00:00.000Z',
    G: { year: 2010, period: 1, sc: { id: 'sc' }, stations: [{ id: 's1' }] },
  };
  const newerCloud = {
    saved: '2026-01-01T00:00:00.000Z',
    G: { year: 2010, period: 2, sc: { id: 'sc' }, stations: [{ id: 's1' }] },
  };
  ctx.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => (
      String(url).includes('/meta')
        ? { saved: newerCloud.saved, year: newerCloud.G.year, period: newerCloud.G.period }
        : newerCloud
    ),
  });

  const result = await vm.runInContext('wlCloudAutosaveTryResumeOnInit(localPayload)', ctx, { timeout: 30000 });
  assert(result?.payload?.G?.period === 2, 'advanced cloud progress should resume even with an older saved timestamp');
  assert(ctx.__store.size === 1, 'accepted cloud progress should be persisted locally');
}

function installTalentRoutingFixtures(ctx) {
  vm.runInContext(`
renderManageTalentStation=function(){};
renderAll=function(){};
autoSave=function(){};
showToast=function(){};
logHistory=function(){};
cm=function(){};
MP.action=function(){};
function __makeTalentRoutingState(){
  G={year:2010,period:1,cash:1000000,news:[],_soloBankrupt:false,stations:[
    {id:'src',isPlayer:true,callLetters:'WSRC',format:'NEWS_TALK',_simulcastSource:true,sig:{type:'AM'},prog:{morningDrive:{talent:{id:'sourceHost',name:'Source Host',salary:100000,cyr:1},quality:70}}},
    {id:'rx',isPlayer:true,callLetters:'WRX',format:'NEWS_TALK',simulcastSourceStationId:'src',sig:{type:'FM'},prog:{morningDrive:{talent:{id:'localHost',name:'Local Host',salary:90000,cyr:1,morale:70},quality:65}}}
  ]};
}
`, ctx, { timeout: 30000 });
}

function testSimulcastFireKeepsSourceHost() {
  const ctx = createLegacyContext();
  installTalentRoutingFixtures(ctx);
  vm.runInContext(`
__makeTalentRoutingState();
doFire('rx','morningDrive');
globalThis.__fireCheck={
  source:G.stations[0].prog.morningDrive.talent&&G.stations[0].prog.morningDrive.talent.id,
  receiver:G.stations[1].prog.morningDrive.talent&&G.stations[1].prog.morningDrive.talent.id
};
`, ctx, { timeout: 30000 });
  assert(ctx.__fireCheck.source === 'sourceHost', 'receiver-local fire must not remove source host');
  assert(ctx.__fireCheck.receiver == null, 'receiver-local fire should clear receiver host');
}

function testSimulcastLetExpireKeepsSourceHost() {
  const ctx = createLegacyContext();
  installTalentRoutingFixtures(ctx);
  vm.runInContext(`
__makeTalentRoutingState();
doLetExpire('rx','morningDrive','host',false);
globalThis.__letExpireCheck={
  source:G.stations[0].prog.morningDrive.talent&&G.stations[0].prog.morningDrive.talent._letExpire,
  receiver:G.stations[1].prog.morningDrive.talent&&G.stations[1].prog.morningDrive.talent._letExpire
};
`, ctx, { timeout: 30000 });
  assert(ctx.__letExpireCheck.source !== true, 'receiver-local let-expire must not flag source host');
  assert(ctx.__letExpireCheck.receiver === true, 'receiver-local let-expire should flag receiver host');
}

await testCloudResumeKeepsAdvancedLocalProgress();
await testCloudResumeAcceptsAdvancedCloudProgress();
testSimulcastFireKeepsSourceHost();
testSimulcastLetExpireKeepsSourceHost();

console.log('ok - cloud autosave and simulcast talent routing regressions passed (4 cases).');
