/**
 * Stripe Checkout + Customer linking (Clerk user id ↔ Stripe Customer).
 * Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID (or pass priceId in body) to enable.
 *
 * Webhook: configure endpoint POST /api/stripe/webhook in Stripe Dashboard
 * with signing secret STRIPE_WEBHOOK_SECRET.
 */
const accountStore = require('./accountStore');
const { verifyClerkBearer } = require('./clerkVerify');
const { posthog } = require('./posthog');

function mountStripeBilling(app) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.log('[STRIPE] STRIPE_SECRET_KEY not set — billing routes return 503');
  }

  // Body parsed by app-level express.json in server.js (do not add express.json() here — default limit is ~100kb).
  app.post('/api/billing/create-checkout-session', async (req, res) => {
    if (!secret) return res.status(503).json({ error: 'Billing not configured' });
    let stripe;
    try {
      stripe = require('stripe')(secret);
    } catch (e) {
      return res.status(503).json({ error: 'stripe package missing — run npm install' });
    }

    const auth = req.headers.authorization || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: 'Authorization Bearer token required' });

    let clerkUserId;
    try {
      clerkUserId = await verifyClerkBearer(m[1]);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const priceId = req.body.priceId || process.env.STRIPE_PRICE_ID;
    if (!priceId) return res.status(400).json({ error: 'Missing priceId or STRIPE_PRICE_ID' });

    let customerId = accountStore.getStripeCustomerId(clerkUserId);
    if (!customerId) {
      const c = await stripe.customers.create({
        metadata: { clerk_user_id: clerkUserId },
      });
      customerId = c.id;
      accountStore.setStripeCustomerId(clerkUserId, customerId);
    }

    const baseUrl =
      process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`;

    const session = await stripe.checkout.sessions.create({
      mode: process.env.STRIPE_CHECKOUT_MODE === 'subscription' ? 'subscription' : 'payment',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?billing=cancel`,
      metadata: { clerk_user_id: clerkUserId },
    });

    posthog.capture({
      distinctId: clerkUserId,
      event: 'checkout session created',
      properties: {
        price_id: priceId,
        mode: process.env.STRIPE_CHECKOUT_MODE === 'subscription' ? 'subscription' : 'payment',
        stripe_customer_id: customerId,
      },
    });
    res.json({ url: session.url });
  });
}

async function syncSubscriptionFromStripeObject(stripe, sub) {
  const accountStore = require('./accountStore');
  try {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (!customerId) return;
    const customer = await stripe.customers.retrieve(customerId);
    const uid = customer.metadata?.clerk_user_id;
    if (!uid) return;
    const active = ['active', 'trialing'].includes(sub.status);
    accountStore.setSubscriptionState(uid, {
      active,
      status: sub.status,
      subscriptionId: sub.id,
    });
    console.log('[STRIPE] subscription', sub.id, sub.status, '→ user', uid, active ? 'active' : 'inactive');
    posthog.capture({
      distinctId: uid,
      event: 'subscription activated',
      properties: {
        subscription_id: sub.id,
        status: sub.status,
        active,
      },
    });
  } catch (e) {
    console.warn('[STRIPE] syncSubscriptionFromStripeObject:', e.message);
  }
}

/**
 * Raw body webhook handler — call as:
 *   app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
 */
async function stripeWebhookHandler(req, res) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whSecret) {
    return res.status(503).send('Webhook not configured');
  }
  const stripe = require('stripe')(secret);
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, whSecret);
  } catch (err) {
    console.warn('[STRIPE] Webhook signature:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        const uid = s.metadata?.clerk_user_id;
        if (uid) console.log('[STRIPE] checkout.session.completed for Clerk user', uid);
        let subId = s.subscription;
        if (subId && typeof subId === 'object') subId = subId.id;
        if (typeof subId === 'string') {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscriptionFromStripeObject(stripe, sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await syncSubscriptionFromStripeObject(stripe, sub);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error('[STRIPE] webhook handler error:', e.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
  res.json({ received: true });
}

module.exports = { mountStripeBilling, stripeWebhookHandler };
