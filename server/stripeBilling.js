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
const { planFromStripeSubscription } = require('./stripePlan');
const {
  findCustomerIdByClerkUserId,
  clerkUserIdFromCustomerMetadata,
  clerkUserIdFromCheckoutSession,
} = require('./stripeCustomerLookup');
const { fetchClerkPrimaryEmail } = require('./clerkUserEmail');

/** Stripe mode + optional NODE_ENV snippet for Checkout Session metadata (support traceability). */
function stripeDeploymentEnvLabel() {
  const sk = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (sk.startsWith('sk_live')) return 'live';
  if (sk.startsWith('sk_test')) return 'test';
  const n = (process.env.NODE_ENV || '').trim();
  return n || 'unknown';
}

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

    const userEmail = (await fetchClerkPrimaryEmail(clerkUserId).catch(() => '')) || '';
    const envLabel = stripeDeploymentEnvLabel();

    let customerId = accountStore.getStripeCustomerId(clerkUserId);
    if (!customerId) {
      customerId = await findCustomerIdByClerkUserId(stripe, clerkUserId);
      if (customerId) {
        accountStore.setStripeCustomerId(
          clerkUserId,
          customerId,
          userEmail ? { billingEmail: userEmail } : undefined,
        );
      }
    }
    if (!customerId) {
      const c = await stripe.customers.create({
        email: userEmail || undefined,
        metadata: { clerk_user_id: clerkUserId },
      });
      customerId = c.id;
      accountStore.setStripeCustomerId(
        clerkUserId,
        customerId,
        userEmail ? { billingEmail: userEmail } : undefined,
      );
    }

    const baseUrl =
      process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: clerkUserId,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Shows “Add promotion code” on Checkout; create coupons + promotion codes in Stripe Dashboard.
      allow_promotion_codes: true,
      success_url: `${baseUrl}/play.html?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/#pricing`,
      metadata: {
        clerk_user_id: clerkUserId,
        clerkUserId: clerkUserId,
        price_id: priceId,
        environment: envLabel,
        ...(userEmail ? { user_email: userEmail } : {}),
      },
    });

    console.log('[STRIPE] checkout session created', {
      stripeSessionId: session.id,
      clerkUserId,
      stripeCustomerId: customerId,
      priceId,
      environment: envLabel,
      userEmail: userEmail || null,
    });

    posthog.capture({
      distinctId: clerkUserId,
      event: 'checkout session created',
      properties: {
        price_id: priceId,
        mode: 'subscription',
        stripe_customer_id: customerId,
        stripe_session_id: session.id,
        environment: envLabel,
      },
    });
    res.json({ url: session.url });
  });

  // Stripe Customer Portal (self-serve manage subscription).
  app.post('/api/billing/create-portal-session', async (req, res) => {
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

    const baseUrl = process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`;
    const returnUrl = `${baseUrl}/account.html`;

    let customerId = accountStore.getStripeCustomerId(clerkUserId);
    if (!customerId) {
      customerId = await findCustomerIdByClerkUserId(stripe, clerkUserId);
      if (customerId) {
        accountStore.setStripeCustomerId(clerkUserId, customerId);
      }
    }
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer for this account yet' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    console.log('[STRIPE] billing portal session created', {
      clerkUserId,
      stripeCustomerId: customerId,
      stripePortalSessionId: session.id,
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
    const uid = clerkUserIdFromCustomerMetadata(customer.metadata);
    const billingEmail =
      typeof customer.email === 'string' && customer.email.trim() ? customer.email.trim() : '';

    if (!uid) {
      console.warn('[STRIPE] subscription webhook: Stripe Customer missing Clerk id (metadata.clerk_user_id / user_id)', {
        stripeSubscriptionId: sub.id,
        stripeCustomerId: customerId,
        subscriptionStatus: sub.status,
        billingEmail: billingEmail || null,
      });
      return;
    }

    accountStore.setStripeCustomerId(
      uid,
      customerId,
      billingEmail ? { billingEmail } : undefined,
    );

    const active = ['active', 'trialing'].includes(sub.status);
    const { planSlug, priceId } = planFromStripeSubscription(sub);
    accountStore.setSubscriptionState(uid, {
      active,
      status: sub.status,
      subscriptionId: sub.id,
      priceId,
      planSlug,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    });
    const { CLERK_PLAN } = require('./aiEntitlements');
    if (planSlug === CLERK_PLAN.STARTER || planSlug === CLERK_PLAN.PRO) {
      accountStore.setEverHadPaidSubscription(uid, true);
    }

    console.log(
      '[STRIPE] subscription synced',
      JSON.stringify({
        clerkUserId: uid,
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        status: sub.status,
        planSlug,
        priceId: priceId || null,
        billingEmail: billingEmail || null,
        active,
      }),
    );

    posthog.capture({
      distinctId: uid,
      event: 'subscription activated',
      properties: {
        subscription_id: sub.id,
        status: sub.status,
        active,
        plan: planSlug,
        price_id: priceId,
        stripe_customer_id: customerId,
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
        const uid = clerkUserIdFromCheckoutSession(s);
        const custId =
          typeof s.customer === 'string'
            ? s.customer
            : s.customer && typeof s.customer === 'object'
              ? s.customer.id
              : null;

        if (!uid) {
          console.warn('[STRIPE] checkout.session.completed missing Clerk identity (client_reference_id / metadata)', {
            stripeSessionId: s.id,
            stripeCustomerId: custId,
            client_reference_id: s.client_reference_id || null,
            metadataKeys: s.metadata && typeof s.metadata === 'object' ? Object.keys(s.metadata) : [],
          });
        } else {
          let email =
            s.customer_details &&
            typeof s.customer_details.email === 'string' &&
            s.customer_details.email.trim()
              ? s.customer_details.email.trim()
              : '';
          if (!email && custId) {
            try {
              const c = await stripe.customers.retrieve(custId);
              if (typeof c.email === 'string' && c.email.trim()) email = c.email.trim();
            } catch (_e) {
              /* ignore */
            }
          }
          if (custId) {
            accountStore.setStripeCustomerId(
              uid,
              custId,
              email ? { billingEmail: email } : undefined,
            );
          }
          console.log('[STRIPE] checkout.session.completed', {
            clerkUserId: uid,
            stripeSessionId: s.id,
            stripeCustomerId: custId,
            billingEmail: email || null,
          });
        }

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

module.exports = {
  mountStripeBilling,
  stripeWebhookHandler,
  /** For integration scripts only — replays subscription state into accountStore like webhooks. */
  syncSubscriptionFromStripeObject,
};
