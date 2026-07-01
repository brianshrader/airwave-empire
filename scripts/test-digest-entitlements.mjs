#!/usr/bin/env node
/**
 * Sanity checks for ratings digest plan quotas.
 *
 *   node scripts/test-digest-entitlements.mjs
 */
/* eslint-disable no-console */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { CLERK_PLAN, DIGEST_LIMITS, digestMonthlyLimitForPlan } = require('../server/aiEntitlements.js');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  }
}

assert(DIGEST_LIMITS[CLERK_PLAN.FREE] === 15, 'free digest limit');
assert(DIGEST_LIMITS[CLERK_PLAN.STARTER] === 100, 'starter digest limit');
assert(DIGEST_LIMITS[CLERK_PLAN.PRO] === 500, 'pro digest limit');
assert(digestMonthlyLimitForPlan(CLERK_PLAN.FREE) === 15, 'free resolver');
assert(digestMonthlyLimitForPlan(CLERK_PLAN.TRIAL) === 100, 'trial matches starter');
assert(digestMonthlyLimitForPlan(CLERK_PLAN.STARTER) === 100, 'starter resolver');
assert(digestMonthlyLimitForPlan(CLERK_PLAN.PRO) === 500, 'pro resolver');
assert(digestMonthlyLimitForPlan('unknown_plan') === 15, 'unknown falls back to free');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('OK — digest entitlement limits passed');
