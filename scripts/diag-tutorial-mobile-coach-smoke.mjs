#!/usr/bin/env node
/**
 * Quick smoke test for mobile turnaround tutorial coach helpers (ring-only spotlight,
 * skip-scroll flags, act 7 market explore, act 4 lineup, spot load).
 *
 * Run: node scripts/diag-tutorial-mobile-coach-smoke.mjs
 */
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const legacyPath = path.join(root, 'src', 'legacy.js');

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}
const noop = () => {};

function el(tag, id, cls) {
  const children = [];
  const style = {};
  const classList = {
    _s: new Set(cls ? cls.split(/\s+/).filter(Boolean) : []),
    add(...c) {
      c.forEach((x) => this._s.add(x));
    },
    remove(...c) {
      c.forEach((x) => this._s.delete(x));
    },
    contains(x) {
      return this._s.has(x);
    },
    toggle(x, on) {
      if (on === undefined) on = !this._s.has(x);
      if (on) this._s.add(x);
      else this._s.delete(x);
    },
  };
  const node = {
    tagName: String(tag || 'div').toUpperCase(),
    id: id || '',
    className: cls || '',
    classList,
    style,
    children,
    parentNode: null,
    innerHTML: '',
    textContent: '',
    offsetHeight: 40,
    getBoundingClientRect() {
      return { top: 100, left: 10, bottom: 140, right: 200, width: 190, height: 40 };
    },
    setAttribute() {},
    removeAttribute() {},
    contains(t) {
      return t === node || children.includes(t);
    },
    closest(sel) {
      if (sel === 'button' && node.tagName === 'BUTTON') return node;
      if (sel === '#hdr' && id === 'abtn') return documentStub._hdr;
      if (sel === '.mo') return documentStub._salesMo;
      if (sel === '#m-brand') return null;
      if (sel === '#m-sales') return documentStub._salesOv;
      return null;
    },
    querySelector() {
      return null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  Object.defineProperty(node, 'className', {
    get() {
      return [...classList._s].join(' ');
    },
    set(v) {
      classList._s = new Set(String(v || '').split(/\s+/).filter(Boolean));
    },
  });
  if (id) documentStub._byId[id] = node;
  return node;
}

const documentStub = {
  _byId: {},
  _hdr: null,
  _salesMo: null,
  _salesOv: null,
  body: {
    id: 'wl-play',
    classList: { contains: () => false, toggle: () => {}, add: () => {}, remove: () => {} },
    contains() {
      return true;
    },
    appendChild(node) {
      return node;
    },
  },
  documentElement: { classList: { add: () => {}, remove: () => {} } },
  addEventListener: noop,
  removeEventListener: noop,
  readyState: 'complete',
  getElementById(id) {
    return this._byId[id] || null;
  },
  querySelector(sel) {
    if (sel === '#pl .ph--mkt') return this._byId['ph-mkt'];
    if (sel === '#m-brand .mo') return null;
    if (sel === '#m-sales .mo') return this._salesMo;
    return null;
  },
  querySelectorAll() {
    return [];
  },
  createElement(tag) {
    return el(tag);
  },
};
// Seed #abtn before legacy init so wireNextBtn does not spin.
documentStub._hdr = el('header', 'hdr');
documentStub._byId.abtn = el('button', 'abtn');

function createCtx() {
  const ctx = vm.createContext({
    console,
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
    Symbol,
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
    setTimeout() {
      return 0;
    },
    setInterval: () => 0,
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
    },
    matchMedia(q) {
      return { matches: String(q).includes('768px'), media: q, addListener: noop, removeListener: noop };
    },
    innerWidth: 390,
    innerHeight: 844,
    scrollY: 0,
    pageYOffset: 0,
    scrollTo: noop,
    addEventListener: noop,
    removeEventListener: noop,
    visualViewport: { width: 390, height: 844, offsetLeft: 0 },
  });
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.document = documentStub;
  ctx.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  ctx.sessionStorage = { getItem: noop, setItem: noop };
  ctx.location = { reload: noop, search: '' };
  ctx.MP = { mode: 'solo', playerId: 0, isHost: false, players: [], renderStatus: noop };
  ctx.alert = noop;
  ctx.fetch = null;
  ctx.btoa = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  ctx.atob = (s) => Buffer.from(String(s), 'base64').toString('utf8');
  ctx.showToast = noop;
  return ctx;
}

function setupDom() {
  documentStub._hdr = documentStub._hdr || el('header', 'hdr');
  if (!documentStub._byId.abtn) {
    const abtn = el('button', 'abtn');
    documentStub._hdr.children.push(abtn);
  }
  documentStub._byId['wl-tu-tr-station-lineup'] = el('div', 'wl-tu-tr-station-lineup');
  documentStub._byId['wl-ft-tut-talent-btn'] = el('div', 'wl-ft-tut-talent-btn');
  documentStub._byId['wl-tu-tr-station-midday'] = el('div', 'wl-tu-tr-station-midday');
  documentStub._byId['wl-ft-player-station-card'] = el('div', 'wl-ft-player-station-card');
  documentStub._byId['ph-mkt'] = el('div', '', 'ph ph--mkt');
  documentStub._byId['wl-ft-tut-market-ratings'] = el('table', 'wl-ft-tut-market-ratings');
  documentStub._salesMo = el('div', '', 'mo');
  documentStub._salesOv = el('div', 'm-sales');
  documentStub._salesOv.classList.add('on');
  documentStub._byId['m-sales'] = documentStub._salesOv;
  documentStub._byId['wl-ft-tut-spot-block'] = el('div', 'wl-ft-tut-spot-block');
  documentStub._byId['m-brand'] = el('div', 'm-brand');
  documentStub._byId['m-brand'].classList.add('on');
  documentStub._byId['wl-tu-tr-bm-promo'] = el('div', 'wl-tu-tr-bm-promo');
}

console.log('Loading legacy.js (headless)…');
const t0 = Date.now();
const ctx = createCtx();
const legacySrc = fs.readFileSync(legacyPath, 'utf8');
vm.runInContext(legacySrc, ctx, { filename: 'legacy.js', timeout: 120000 });
console.log(`Loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

vm.runInContext(
  `
  G = {
    tutorialMode: true,
    tutorialAct: 7,
    sc: { id: 'tutorial_turnaround' },
    _tutorialAct7Phase: 2,
    _tutorialProgExtraStep: 0,
    _tutorialSalesCoachStep: 2,
    _tutorialSpotsAdjusted: true,
    ps: [{ id: 'p1', isPlayer: true }],
  };
  `,
  ctx
);

setupDom();

const tests = [
  ['wlTutorialMobileExploreCoachActive', () => ctx.wlTutorialMobileExploreCoachActive()],
  ['wlTutorialAct7MarketRatingsExplore (act7 ph2)', () => ctx.wlTutorialAct7MarketRatingsExplore()],
  ['skip scroll early win act 35', () => ctx.wlTutorialMobileSkipCoachAutoScroll(35)],
  ['skip scroll act7 market', () => ctx.wlTutorialMobileSkipCoachAutoScroll(7)],
  ['skip hdr abtn scroll', () => ctx.wlTutorialSkipHdrTargetAutoScroll(ctx.document.getElementById('abtn'))],
  ['spot load coach active', () => ctx.wlTutorialAct7SalesSpotLoadCoachActive()],
  ['spot load skip scroll', () => ctx.wlTutorialSkipAct7SpotLoadAutoScroll()],
  ['act6 promo budget coach (bx>=2)', () => {
    vm.runInContext(`G.tutorialAct=6;G._tutorialBrandExtraStep=2;G._tutorialPromoRaised=false;`, ctx);
    return ctx.wlTutorialAct6PromoBudgetCoachActive();
  }],
  ['act6 promo skip scroll', () => {
    vm.runInContext(`G.tutorialAct=6;G._tutorialBrandExtraStep=2;`, ctx);
    return ctx.wlTutorialSkipPromoBudgetAutoScroll(6);
  }],
  ['act6 brand step normalize (bx=0→2)', () => {
    vm.runInContext(`
      if(typeof G==='undefined')G={tutorialMode:true,sc:{id:'tutorial_turnaround'}};
      G.tutorialAct=6;
      G._tutorialBrandExtraStep=0;
      G._tutorialBrandTourDone=false;
      G._tutorialPromoRaised=false;
      wlTutorialAct6NormalizeBrandExtraStep();
    `, ctx);
    return !!vm.runInContext('typeof G!=="undefined"&&G._tutorialBrandExtraStep===2', ctx);
  }],
  ['act7 market scroll coach', () => {
    vm.runInContext(`G.tutorialAct=7;G._tutorialAct7Phase=2;`, ctx);
    return ctx.wlTutorialAct7MarketRatingsScrollCoach();
  }],
];

for (const [name, fn] of tests) {
  let ok = false;
  try {
    ok = !!fn();
  } catch (e) {
    failures.push(`${name}: threw ${e.message}`);
    continue;
  }
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  assert(ok, `${name} expected true`);
}

// Ring-only spotlight must not set z-index on #abtn
const abtn = ctx.document.getElementById('abtn');
ctx.wlTuTurnaroundApplySpotlight(abtn, 13020, { noWatch: true });
assert(!abtn.style.zIndex, 'abtn should not get inline z-index (ring-only)');
assert(abtn.classList.contains('wl-ft-tut-spotlight'), 'abtn should get spotlight class');
console.log(`${!abtn.style.zIndex ? '✓' : '✗'} ring-only: abtn has no inline z-index`);

// Modal CTA ring-only
const cfm = ctx.document.createElement('button');
cfm.classList.add('cfm');
cfm.closest = (sel) => (sel === '.mo' ? ctx.document._salesMo : null);
ctx.wlTuTurnaroundApplySpotlight(cfm, 13020, { noWatch: true });
assert(!cfm.style.zIndex, 'modal .cfm should not get inline z-index');
console.log(`${!cfm.style.zIndex ? '✓' : '✗'} ring-only: modal .cfm has no inline z-index`);

// Gate / spotlight targets
vm.runInContext(`G.tutorialAct = 7; G._tutorialAct7Phase = 2;`, ctx);
const gateMkt = ctx.wlTuTurnaroundGetGateTarget(7);
assert(gateMkt && gateMkt.classList.contains('ph--mkt'), 'act7 ph2 gate should target .ph--mkt on mobile explore');
console.log(`${gateMkt && gateMkt.classList.contains('ph--mkt') ? '✓' : '✗'} act7 ph2 gate → MARKET RATINGS header`);

vm.runInContext(`G.tutorialAct = 4; G._tutorialProgExtraStep = 0;`, ctx);
const spotLineup = ctx.wlTuTurnaroundGetSpotlightTarget(4);
assert(spotLineup && spotLineup.id === 'wl-ft-tut-talent-btn', 'act4 talent spotlight should be full lineup block');
const gateMid = ctx.wlTuTurnaroundGetGateTarget(4);
assert(gateMid && gateMid.id === 'wl-tu-tr-station-midday', 'act4 gate should remain midday row');
console.log(`${spotLineup?.id === 'wl-ft-tut-talent-btn' ? '✓' : '✗'} act4 spotlight → full lineup`);
console.log(`${gateMid?.id === 'wl-tu-tr-station-midday' ? '✓' : '✗'} act4 gate → midday`);

// Early win skip scroll + gate target
vm.runInContext(`G.tutorialAct = 35;`, ctx);
assert(ctx.wlTutorialMobileSkipCoachAutoScroll(35), 'early win skip scroll');
assert(ctx.wlTuTurnaroundGetGateTarget(35)?.id === 'abtn', 'early win gate abtn');
console.log('✓ early win skip-scroll + gate');

// Act 7 next period ready helper
vm.runInContext(`
  G.tutorialAct = 7;
  G._tutorialAct7Phase = 1;
  G._tutorialSalesCoachStep = 6;
  G._tutorialSpotsAdjusted = true;
`, ctx);
documentStub._byId['m-sales'].classList._s.delete('on');
assert(ctx.wlTutorialAct7NextPeriodReady(), 'act7 next period ready when sales done');
console.log('✓ wlTutorialAct7NextPeriodReady');

// Syntax / symbol sanity
const required = [
  'wlTuTurnaroundSpotlightPreferRingOnly',
  'wlTuTurnaroundSpotlightRingOnly',
  'wlTuTurnaroundApplySpotlight',
  'wlTutorialAct7SalesSpotLoadCoachActive',
  'wlTutorialAct7MarketRatingsExplore',
  'wlTuTurnaroundAnchorNextPeriodCoachMob',
];
for (const sym of required) {
  assert(typeof ctx[sym] === 'function', `missing export: ${sym}`);
}
console.log('✓ required helpers present');

console.log('\n---');
if (failures.length) {
  console.error(`FAILED (${failures.length}):`);
  failures.forEach((f) => console.error('  •', f));
  process.exit(1);
}
console.log('All smoke checks passed.');
