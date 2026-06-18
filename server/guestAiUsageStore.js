'use strict';

/**
 * Cumulative AI usage caps per guest id (anonymous onboarding). Not monthly — totals for token lifetime.
 */
const fs = require('fs');
const path = require('path');
const { guestAiUsageDir, ensureDir } = require('./runtimePaths');

const ROOT = guestAiUsageDir();
const MUTEX = new Map();

const CAPS = Object.freeze({
  logo: 3,
  jingle: 1,
  van: 1,
});

function safeId(guestId) {
  return String(guestId)
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .slice(0, 128);
}

function filePath(guestId) {
  return path.join(ROOT, `${safeId(guestId)}.json`);
}

function ensureRoot() {
  ensureDir(ROOT);
}

function readState(guestId) {
  const p = filePath(guestId);
  if (!fs.existsSync(p)) return { logo: 0, jingle: 0, van: 0 };
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!j || typeof j !== 'object') return { logo: 0, jingle: 0, van: 0 };
    return {
      logo: Math.max(0, Math.min(1e6, Math.floor(Number(j.logo) || 0))),
      jingle: Math.max(0, Math.min(1e6, Math.floor(Number(j.jingle) || 0))),
      van: Math.max(0, Math.min(1e6, Math.floor(Number(j.van) || 0))),
    };
  } catch {
    return { logo: 0, jingle: 0, van: 0 };
  }
}

function writeState(guestId, st) {
  ensureRoot();
  fs.writeFileSync(filePath(guestId), JSON.stringify(st, null, 2), 'utf8');
}

function withLock(guestId, fn) {
  const prev = MUTEX.get(guestId) || Promise.resolve();
  const run = async () => {
    try {
      await prev.catch(() => {});
    } catch (_) {}
    return fn();
  };
  const p = run();
  MUTEX.set(
    guestId,
    p.finally(() => {
      if (MUTEX.get(guestId) === p) MUTEX.delete(guestId);
    }),
  );
  return p;
}

/**
 * @param {'logo' | 'jingle' | 'van'} kind
 */
async function tryConsume(guestId, kind) {
  const cap = CAPS[kind] ?? 0;
  if (!cap) return { ok: false, used: 0, limit: 0, kind };
  return withLock(guestId, () => {
    const st = readState(guestId);
    const used = st[kind] || 0;
    if (used >= cap) return { ok: false, used, limit: cap, kind };
    st[kind] = used + 1;
    writeState(guestId, st);
    return { ok: true, used: st[kind], limit: cap, kind };
  });
}

async function refundOne(guestId, kind) {
  return withLock(guestId, () => {
    const st = readState(guestId);
    if (!st[kind] || st[kind] < 1) return;
    st[kind] = st[kind] - 1;
    writeState(guestId, st);
  });
}

module.exports = { tryConsume, refundOne, CAPS, ROOT };
