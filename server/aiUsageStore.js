'use strict';

/**
 * Per–Clerk-user, UTC calendar month counters for AI generations. Persists under data/ai_usage/.
 * Serialized per user to avoid double-spend on concurrent requests.
 */

const fs = require('fs');
const path = require('path');
const { aiUsageDir, ensureDir } = require('./runtimePaths');

const ROOT = aiUsageDir();
const USER_MUTEX = new Map();

function utcYearMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function safeUid(uid) {
  return String(uid)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 180);
}

function filePathForUser(uid) {
  return path.join(ROOT, `${safeUid(uid)}.json`);
}

function ensureRoot() {
  ensureDir(ROOT);
}

/**
 * @template T
 * @param {string} userId
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withUserLock(userId, fn) {
  const prev = USER_MUTEX.get(userId) || Promise.resolve();
  const run = async () => {
    try {
      await prev.catch(() => {});
    } catch (_) {
      /* noop */
    }
    return fn();
  };
  const p = run();
  USER_MUTEX.set(userId, p.finally(() => {
    if (USER_MUTEX.get(userId) === p) USER_MUTEX.delete(userId);
  }));
  return p;
}

/**
 * @param {string} userId
 * @returns {{ period: string, logo: number, jingle: number, van: number, digest: number }}
 */
function readState(userId) {
  const p = filePathForUser(userId);
  if (!fs.existsSync(p)) {
    return { period: utcYearMonth(), logo: 0, jingle: 0, van: 0, digest: 0 };
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!j || typeof j !== 'object') {
      return { period: utcYearMonth(), logo: 0, jingle: 0, van: 0, digest: 0 };
    }
    const current = utcYearMonth();
    const period = typeof j.period === 'string' && j.period ? j.period : current;
    if (period !== current) {
      return { period: current, logo: 0, jingle: 0, van: 0, digest: 0 };
    }
    return {
      period: current,
      logo: Math.max(0, Math.min(1e6, Math.floor(Number(j.logo) || 0))),
      jingle: Math.max(0, Math.min(1e6, Math.floor(Number(j.jingle) || 0))),
      van: Math.max(0, Math.min(1e6, Math.floor(Number(j.van) || 0))),
      digest: Math.max(0, Math.min(1e6, Math.floor(Number(j.digest) || 0))),
    };
  } catch {
    return { period: utcYearMonth(), logo: 0, jingle: 0, van: 0, digest: 0 };
  }
}

function writeState(userId, state) {
  ensureRoot();
  fs.writeFileSync(filePathForUser(userId), JSON.stringify(state, null, 2), 'utf8');
}

/**
 * @param {'logo' | 'jingle' | 'van' | 'digest'} kind
 * @param {number} limit
 * @returns {Promise<{ ok: boolean, used: number, limit: number, period: string }>}
 */
async function tryConsume(userId, kind, limit) {
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  if (cap <= 0) {
    return { ok: false, used: cap, limit: cap, period: utcYearMonth() };
  }
  return withUserLock(userId, () => {
    const st = readState(userId);
    const used = st[kind] || 0;
    if (used >= cap) {
      return { ok: false, used, limit: cap, period: st.period };
    }
    st[kind] = used + 1;
    writeState(userId, st);
    return { ok: true, used: st[kind], limit: cap, period: st.period };
  });
}

/**
 * @param {'logo' | 'jingle' | 'van' | 'digest'} kind
 * @returns {Promise<void>}
 */
async function refundOne(userId, kind) {
  return withUserLock(userId, () => {
    const st = readState(userId);
    if (!st[kind] || st[kind] < 1) return;
    st[kind] = st[kind] - 1;
    writeState(userId, st);
  });
}

module.exports = { utcYearMonth, readState, tryConsume, refundOne, ROOT };
