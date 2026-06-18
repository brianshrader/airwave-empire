'use strict';

/**
 * Lifetime AI caps for the one-time signup trial (not calendar-month).
 * Logo + remote-van share one pool (20 total); jingles separate (5).
 */

const TRIAL_IMAGES_CAP = 20;
const TRIAL_JINGLE_CAP = 5;

const fs = require('fs');
const path = require('path');
const { trialAiDir, ensureDir } = require('./runtimePaths');

const ROOT = trialAiDir();
const USER_MUTEX = new Map();

function safeUid(uid) {
  return String(uid)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 180);
}

function ensureRoot() {
  ensureDir(ROOT);
}

function filePath(userId) {
  return path.join(ROOT, `${safeUid(userId)}.json`);
}

function readRow(userId) {
  ensureRoot();
  const p = filePath(userId);
  if (!fs.existsSync(p)) return { imagesUsed: 0, jinglesUsed: 0 };
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!j || typeof j !== 'object') return { imagesUsed: 0, jinglesUsed: 0 };
    return {
      imagesUsed: Math.max(0, Math.min(1e6, Math.floor(Number(j.imagesUsed) || 0))),
      jinglesUsed: Math.max(0, Math.min(1e6, Math.floor(Number(j.jinglesUsed) || 0))),
    };
  } catch {
    return { imagesUsed: 0, jinglesUsed: 0 };
  }
}

function writeRow(userId, row) {
  ensureRoot();
  fs.writeFileSync(filePath(userId), JSON.stringify(row, null, 2), 'utf8');
}

function withUserLock(userId, fn) {
  const prev = USER_MUTEX.get(userId) || Promise.resolve();
  const run = async () => {
    try {
      await prev.catch(() => {});
    } catch (_) {}
    return fn();
  };
  const p = run();
  USER_MUTEX.set(
    userId,
    p.finally(() => {
      if (USER_MUTEX.get(userId) === p) USER_MUTEX.delete(userId);
    }),
  );
  return p;
}

/** Logo or remote-van image — shared 20 lifetime during trial. */
async function tryConsumeTrialImage(userId, limit) {
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  if (cap <= 0) return { ok: false, used: 0, limit: cap };
  return withUserLock(userId, () => {
    const row = readRow(userId);
    const used = row.imagesUsed || 0;
    if (used >= cap) return { ok: false, used, limit: cap };
    row.imagesUsed = used + 1;
    writeRow(userId, row);
    return { ok: true, used: row.imagesUsed, limit: cap };
  });
}

async function tryConsumeTrialJingle(userId, limit) {
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  if (cap <= 0) return { ok: false, used: 0, limit: cap };
  return withUserLock(userId, () => {
    const row = readRow(userId);
    const used = row.jinglesUsed || 0;
    if (used >= cap) return { ok: false, used, limit: cap };
    row.jinglesUsed = used + 1;
    writeRow(userId, row);
    return { ok: true, used: row.jinglesUsed, limit: cap };
  });
}

async function refundTrialImage(userId) {
  return withUserLock(userId, () => {
    const row = readRow(userId);
    if (!row.imagesUsed || row.imagesUsed < 1) return;
    row.imagesUsed = row.imagesUsed - 1;
    writeRow(userId, row);
  });
}

async function refundTrialJingle(userId) {
  return withUserLock(userId, () => {
    const row = readRow(userId);
    if (!row.jinglesUsed || row.jinglesUsed < 1) return;
    row.jinglesUsed = row.jinglesUsed - 1;
    writeRow(userId, row);
  });
}

/** Current trial usage (no consume). Used by API responses and GET /api/trial/quota. */
function getTrialQuotaSnapshot(userId) {
  const row = readRow(userId);
  return {
    images: { used: row.imagesUsed || 0, limit: TRIAL_IMAGES_CAP },
    jingles: { used: row.jinglesUsed || 0, limit: TRIAL_JINGLE_CAP },
  };
}

module.exports = {
  TRIAL_IMAGES_CAP,
  TRIAL_JINGLE_CAP,
  tryConsumeTrialImage,
  tryConsumeTrialJingle,
  refundTrialImage,
  refundTrialJingle,
  getTrialQuotaSnapshot,
  ROOT,
};
