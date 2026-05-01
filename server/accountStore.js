/**
 * Minimal JSON store: Clerk user id → Stripe customer id.
 * Replace with Postgres/Dynamo later when you scale.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'stripe_customers.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf8');
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(obj) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8');
}

function getStripeCustomerId(clerkUserId) {
  const m = readAll();
  return m[clerkUserId]?.stripeCustomerId || null;
}

function setStripeCustomerId(clerkUserId, stripeCustomerId) {
  const m = readAll();
  m[clerkUserId] = {
    ...(m[clerkUserId] || {}),
    stripeCustomerId,
    updatedAt: new Date().toISOString(),
  };
  writeAll(m);
}

/** Stripe subscription cache (updated from webhooks + occasional live checks). */
function setSubscriptionState(
  clerkUserId,
  { active, status, subscriptionId, priceId, planSlug, currentPeriodEnd, cancelAtPeriodEnd },
) {
  const m = readAll();
  m[clerkUserId] = {
    ...(m[clerkUserId] || {}),
    subscriptionActive: !!active,
    subscriptionStatus: status || null,
    subscriptionId: subscriptionId || null,
    subscriptionPriceId: priceId || null,
    subscriptionPlanSlug: planSlug || null,
    subscriptionCurrentPeriodEnd: currentPeriodEnd || null,
    subscriptionCancelAtPeriodEnd: cancelAtPeriodEnd == null ? null : !!cancelAtPeriodEnd,
    subscriptionUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeAll(m);
}

function getSubscriptionActive(clerkUserId) {
  return !!readAll()[clerkUserId]?.subscriptionActive;
}

function getSubscriptionPlanSlug(clerkUserId) {
  const v = readAll()[clerkUserId]?.subscriptionPlanSlug;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function getSubscriptionPriceId(clerkUserId) {
  const v = readAll()[clerkUserId]?.subscriptionPriceId;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function getSubscriptionStatus(clerkUserId) {
  const v = readAll()[clerkUserId]?.subscriptionStatus;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function getSubscriptionId(clerkUserId) {
  const v = readAll()[clerkUserId]?.subscriptionId;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function getSubscriptionCurrentPeriodEnd(clerkUserId) {
  const v = readAll()[clerkUserId]?.subscriptionCurrentPeriodEnd;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function getSubscriptionCancelAtPeriodEnd(clerkUserId) {
  const v = readAll()[clerkUserId]?.subscriptionCancelAtPeriodEnd;
  if (v == null) return null;
  return !!v;
}

/** Fix rows where webhook wrote status active/trialing but subscriptionActive was lost or never set. */
function repairSubscriptionActiveIfStatusSaysSo(clerkUserId) {
  const m = readAll();
  const row = m[clerkUserId];
  if (!row) return;
  const st = typeof row.subscriptionStatus === 'string' ? row.subscriptionStatus.trim() : '';
  if (!st || (st !== 'active' && st !== 'trialing')) return;
  if (row.subscriptionActive === true) return;
  m[clerkUserId] = {
    ...row,
    subscriptionActive: true,
    updatedAt: new Date().toISOString(),
  };
  writeAll(m);
}

/** After Fall 2020 trial finale — user drops to free-tier entitlements until they subscribe. */
function getTrialGameCompleted(clerkUserId) {
  return !!readAll()[clerkUserId]?.trialGameCompleted;
}

function setTrialGameCompleted(clerkUserId, done) {
  const m = readAll();
  m[clerkUserId] = {
    ...(m[clerkUserId] || {}),
    trialGameCompleted: !!done,
    updatedAt: new Date().toISOString(),
  };
  writeAll(m);
}

/** Set once when Stripe reports Starter/Pro — trial never applies again. */
function getEverHadPaidSubscription(clerkUserId) {
  return !!readAll()[clerkUserId]?.everHadPaidSubscription;
}

function setEverHadPaidSubscription(clerkUserId, v) {
  if (!v) return;
  const m = readAll();
  m[clerkUserId] = {
    ...(m[clerkUserId] || {}),
    everHadPaidSubscription: true,
    updatedAt: new Date().toISOString(),
  };
  writeAll(m);
}

module.exports = {
  getStripeCustomerId,
  setStripeCustomerId,
  setSubscriptionState,
  getSubscriptionActive,
  getSubscriptionPlanSlug,
  getSubscriptionPriceId,
  getSubscriptionStatus,
  getSubscriptionId,
  getSubscriptionCurrentPeriodEnd,
  getSubscriptionCancelAtPeriodEnd,
  repairSubscriptionActiveIfStatusSaysSo,
  getTrialGameCompleted,
  setTrialGameCompleted,
  getEverHadPaidSubscription,
  setEverHadPaidSubscription,
  DATA_DIR,
  FILE,
};
