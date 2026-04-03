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
function setSubscriptionState(clerkUserId, { active, status, subscriptionId }) {
  const m = readAll();
  m[clerkUserId] = {
    ...(m[clerkUserId] || {}),
    subscriptionActive: !!active,
    subscriptionStatus: status || null,
    subscriptionId: subscriptionId || null,
    subscriptionUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeAll(m);
}

function getSubscriptionActive(clerkUserId) {
  return !!readAll()[clerkUserId]?.subscriptionActive;
}

module.exports = {
  getStripeCustomerId,
  setStripeCustomerId,
  setSubscriptionState,
  getSubscriptionActive,
  DATA_DIR,
  FILE,
};
