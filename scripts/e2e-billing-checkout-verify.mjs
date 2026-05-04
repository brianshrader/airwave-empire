#!/usr/bin/env node
/**
 * End-to-end billing smoke (Stripe test + Clerk):
 * 1) Spawn game server on a free port
 * 2) Create a fresh Clerk user + session JWT
 * 3) POST /api/billing/create-checkout-session — verify Stripe Checkout Session + Customer
 * 4) Create a Stripe Subscription on that Customer (Checkout pay UI is not automated here)
 * 5) Replay webhook logic via syncSubscriptionFromStripeObject
 * 6) Verify data/stripe_customers.json + GET /api/entitlements
 * 7) POST /api/billing/create-portal-session — verify 200 + URL
 *
 * Requires: STRIPE_SECRET_KEY=sk_test_*, CLERK_SECRET_KEY, and a test Price ID (STRIPE_PRICE_ID or STRIPE_TEST_PRICE_ID).
 *
 * Usage: node scripts/e2e-billing-checkout-verify.mjs
 */

import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });
const envLocal = path.join(root, '.env.local');
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, override: true });
if (process.env.WL_ENV_FILE && fs.existsSync(process.env.WL_ENV_FILE)) {
  dotenv.config({ path: process.env.WL_ENV_FILE, override: true });
}

const { createClerkClient } = await import('@clerk/backend');
const Stripe = (await import('stripe')).default;

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
}

const sk = (process.env.STRIPE_SECRET_KEY || '').trim();
const ck = (process.env.CLERK_SECRET_KEY || '').trim();
if (!sk) {
  fail(
    'STRIPE_SECRET_KEY is empty. Use a Stripe TEST secret key (sk_test_...) in .env or export it for this command.',
  );
}
if (!sk.startsWith('sk_test_')) {
  fail(
    'This script only accepts Stripe test keys (sk_test_...). Refusing to run with a live secret.',
  );
}
if (!ck) fail('CLERK_SECRET_KEY is required.');

const priceId =
  (process.env.STRIPE_TEST_PRICE_ID || '').trim() ||
  (process.env.STRIPE_PRICE_ID || '').trim() ||
  'price_1TRQLSRV8iDbXZazQogqgaob'; /* Pro Monthly (test) from server/stripePlan.js */

const stripe = new Stripe(sk);
const clerk = createClerkClient({ secretKey: ck });

function waitForHttp(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      http
        .get(`http://127.0.0.1:${port}/`, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() - started > timeoutMs) reject(new Error('server did not start'));
          else setTimeout(tryOnce, 200);
        });
    };
    tryOnce();
  });
}

async function main() {
  const port = 37500 + Math.floor(Math.random() * 200);
  const proc = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  proc.stdout.on('data', (d) => {
    serverLog += d.toString();
  });
  proc.stderr.on('data', (d) => {
    serverLog += d.toString();
  });

  try {
    await waitForHttp(port);
    console.log(`Server up on http://127.0.0.1:${port}/\n`);

    const tag = `wl-e2e-${Date.now()}`;
    const email = `${tag}@example.com`;
    console.log('Creating Clerk test user…');
    const user = await clerk.users.createUser({
      emailAddress: [email],
      password: 'E2eBillingSmoke99!zz',
    });
    const clerkUserId = user.id;
    console.log(`  clerkUserId=${clerkUserId}`);

    const session = await clerk.sessions.createSession({ userId: clerkUserId });
    const tokenRes = await clerk.sessions.getToken(session.id, '__session');
    const jwt = typeof tokenRes?.jwt === 'string' ? tokenRes.jwt : '';
    assert(typeof jwt === 'string' && jwt.length > 20, 'Could not obtain session JWT from Clerk');

    const base = `http://127.0.0.1:${port}`;
    console.log('\nPOST /api/billing/create-checkout-session …');
    const coRes = await fetch(`${base}/api/billing/create-checkout-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ priceId }),
    });
    const coJson = await coRes.json().catch(() => ({}));
    assert(coRes.ok && coJson.url, `create-checkout-session failed: ${coRes.status} ${JSON.stringify(coJson)}`);

    const urlObj = new URL(coJson.url);
    const pathParts = urlObj.pathname.split('/');
    const csId = pathParts[pathParts.length - 1];
    assert(csId && csId.startsWith('cs_'), 'Could not parse Checkout Session id from URL');

    const cs = await stripe.checkout.sessions.retrieve(csId, { expand: ['customer'] });
    const custId = typeof cs.customer === 'string' ? cs.customer : cs.customer?.id;
    assert(custId, 'Checkout Session missing customer');

    console.log('\n── Stripe Checkout Session ──');
    console.log(`  session.id=${cs.id}`);
    console.log(`  client_reference_id=${cs.client_reference_id || '(missing)'}`);
    assert(cs.client_reference_id === clerkUserId, 'client_reference_id should equal Clerk user id');

    const md = cs.metadata || {};
    console.log(`  metadata.clerk_user_id=${md.clerk_user_id || ''}`);
    console.log(`  metadata.clerkUserId=${md.clerkUserId || ''}`);
    console.log(`  metadata.price_id=${md.price_id || ''}`);
    console.log(`  metadata.environment=${md.environment || ''}`);
    assert(md.clerk_user_id === clerkUserId && md.clerkUserId === clerkUserId, 'Session metadata should carry Clerk id');

    const customer = await stripe.customers.retrieve(custId);
    console.log('\n── Stripe Customer ──');
    console.log(`  id=${customer.id}`);
    console.log(`  email=${customer.email || '(none)'}`);
    assert(customer.email, 'Stripe Customer should have email from Clerk');
    assert(
      customer.metadata?.clerk_user_id === clerkUserId,
      'Customer metadata.clerk_user_id should match Clerk user',
    );

    console.log('\nCreating Stripe test Subscription on same Customer (simulates paid Checkout outcome)…');
    await stripe.paymentMethods.attach('pm_card_visa', { customer: custId });
    await stripe.customers.update(custId, {
      invoice_settings: { default_payment_method: 'pm_card_visa' },
    });
    const subscription = await stripe.subscriptions.create({
      customer: custId,
      items: [{ price: priceId }],
    });

    const subFull = await stripe.subscriptions.retrieve(subscription.id);
    assert(subFull.customer === custId, 'Subscription must reference same Customer as Checkout');

    const { syncSubscriptionFromStripeObject } = require(path.join(root, 'server/stripeBilling.js'));
    await syncSubscriptionFromStripeObject(stripe, subFull);

    const storePath = path.join(root, 'data', 'stripe_customers.json');
    const storeRaw = fs.readFileSync(storePath, 'utf8');
    const store = JSON.parse(storeRaw);
    const row = store[clerkUserId];
    console.log('\n── data/stripe_customers.json ──');
    assert(row, `No row for ${clerkUserId}`);
    console.log(`  stripeCustomerId=${row.stripeCustomerId}`);
    console.log(`  billingEmail=${row.billingEmail || '(none)'}`);
    assert(row.stripeCustomerId === custId, 'Account store stripeCustomerId should match Stripe Customer');
    assert(row.billingEmail && row.billingEmail.includes('@'), 'billingEmail should be set');

    console.log('\nGET /api/entitlements …');
    const entRes = await fetch(`${base}/api/entitlements`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const ent = await entRes.json().catch(() => ({}));
    console.log(`  plan=${ent.plan} billingSource=${ent.billingSource || ''}`);
    assert(entRes.ok && ent.ok, `entitlements failed: ${JSON.stringify(ent)}`);
    assert(
      ent.plan === 'pro' || ent.plan === 'starter',
      `Expected paid plan slug on account (got ${ent.plan}) — check price→plan mapping in server/stripePlan.js for ${priceId}`,
    );

    console.log('\nPOST /api/billing/create-portal-session …');
    const porRes = await fetch(`${base}/api/billing/create-portal-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const porJson = await porRes.json().catch(() => ({}));
    assert(porRes.ok && porJson.url, `portal session failed: ${JSON.stringify(porJson)}`);
    assert(
      String(porJson.url).includes('billing.stripe.com'),
      'Portal URL should be a Stripe billing host',
    );
    console.log('  portal session URL ok (same Clerk user → same stored customer on server).');

    console.log('\n✓ All automated checks passed.');
    console.log(
      '\nNote: Checkout was not completed in a browser; subscription was created via Stripe API on the',
      'same Customer as the Checkout Session — identity linkage matches a successful paid Checkout.',
    );
  } finally {
    proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    if (proc.exitCode === null) proc.kill('SIGKILL');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
