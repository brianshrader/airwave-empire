#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const accountStore = require('../server/accountStore');
const { CLERK_PLAN } = require('../server/aiEntitlements');
const { resolveStripePlanForUser } = require('../server/stripePlanResolve');

const originalEnv = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  WL_USE_CLERK_BILLING: process.env.WL_USE_CLERK_BILLING,
};

const file = accountStore.FILE;
const dataDir = accountStore.DATA_DIR;
const existed = fs.existsSync(file);
const previousContents = existed ? fs.readFileSync(file, 'utf8') : null;

function resetStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, '{}', 'utf8');
}

try {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.WL_USE_CLERK_BILLING;
  resetStore();

  const canceledUid = `test_canceled_paid_${Date.now()}`;
  accountStore.setSubscriptionState(canceledUid, {
    active: false,
    status: 'canceled',
    subscriptionId: 'sub_canceled',
    priceId: 'price_starter',
    planSlug: CLERK_PLAN.STARTER,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
  accountStore.setEverHadPaidSubscription(canceledUid, true);

  const canceledResolved = await resolveStripePlanForUser(canceledUid);
  assert.equal(canceledResolved.planSlug, CLERK_PLAN.FREE);
  assert.notEqual(canceledResolved.source, 'cache');
  assert.equal(canceledResolved.billing.subscriptionActive, false);
  assert.equal(canceledResolved.billing.subscriptionStatus, 'canceled');

  const activeUid = `test_active_paid_${Date.now()}`;
  accountStore.setSubscriptionState(activeUid, {
    active: true,
    status: 'active',
    subscriptionId: 'sub_active',
    priceId: 'price_pro',
    planSlug: CLERK_PLAN.PRO,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });

  const activeResolved = await resolveStripePlanForUser(activeUid);
  assert.equal(activeResolved.planSlug, CLERK_PLAN.PRO);
  assert.equal(activeResolved.source, 'cache');
  assert.equal(activeResolved.billing.subscriptionActive, true);

  console.log('subscription cancel cache regression passed');
} finally {
  if (previousContents == null) {
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, previousContents, 'utf8');
  }

  if (originalEnv.STRIPE_SECRET_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalEnv.STRIPE_SECRET_KEY;

  if (originalEnv.WL_USE_CLERK_BILLING === undefined) delete process.env.WL_USE_CLERK_BILLING;
  else process.env.WL_USE_CLERK_BILLING = originalEnv.WL_USE_CLERK_BILLING;
}
