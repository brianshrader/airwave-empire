#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'airwave-account-store-'));
const tempDataDir = path.join(tempRoot, 'data-root');
const repoDataFile = path.join(repoRoot, 'data', 'stripe_customers.json');

process.env.WL_DATA_DIR = tempDataDir;

for (const mod of ['server/runtimePaths.js', 'server/accountStore.js']) {
  delete require.cache[require.resolve(path.join(repoRoot, mod))];
}

const accountStore = require(path.join(repoRoot, 'server', 'accountStore.js'));

try {
  assert.strictEqual(accountStore.DATA_DIR, tempDataDir);
  assert.strictEqual(accountStore.FILE, path.join(tempDataDir, 'stripe_customers.json'));
  assert.notStrictEqual(accountStore.FILE, repoDataFile);

  accountStore.setStripeCustomerId('user_test_runtime_paths', 'cus_test_runtime_paths');
  accountStore.setSignupTrialLockOnce('user_test_runtime_paths', {
    kind: 'solo',
    marketId: 'atlanta',
  });

  assert.strictEqual(accountStore.getStripeCustomerId('user_test_runtime_paths'), 'cus_test_runtime_paths');
  assert.deepStrictEqual(accountStore.getSignupTrialLock('user_test_runtime_paths'), {
    kind: 'solo',
    marketId: 'atlanta',
  });
  assert.ok(fs.existsSync(accountStore.FILE), 'account store file should be created under WL_DATA_DIR');

  const stored = JSON.parse(fs.readFileSync(accountStore.FILE, 'utf8'));
  assert.strictEqual(stored.user_test_runtime_paths.stripeCustomerId, 'cus_test_runtime_paths');
  assert.strictEqual(stored.user_test_runtime_paths.signupTrialLockedMarketId, 'atlanta');

  console.log('PASS: accountStore honors WL_DATA_DIR via runtimePaths.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
