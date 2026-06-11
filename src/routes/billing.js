const express = require('express');
const { FieldValue } = require('@google-cloud/firestore');

const { db, stripe } = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Helper: resolve userPhone from Stripe event ───────────────────────
async function resolveUserPhoneFromEvent(event) {
    const obj = event.data.object;
    let userPhone = null;

    if (obj.metadata && obj.metadata.userPhone) {
        userPhone = obj.metadata.userPhone;
    } else if (obj.subscription_data && obj.subscription_data.metadata && obj.subscription_data.metadata.userPhone) {
        userPhone = obj.subscription_data.metadata.userPhone;
    } else if (obj.subscription_details && obj.subscription_details.metadata && obj.subscription_details.metadata.userPhone) {
        userPhone = obj.subscription_details.metadata.userPhone;
    }

    if (!userPhone) {
        const customerId = obj.customer || (event.type.startsWith('customer.subscription.') ? obj.id : null);
        if (customerId) {
            const snap = await db.collectionGroup('settings')
                .where('stripe_customer_id', '==', customerId)
                .limit(1)
                .get();
            if (!snap.empty) {
                const userDocRef = snap.docs[0].ref.parent.parent;
                if (userDocRef) userPhone = userDocRef.id;
            }
        }
    }
    return userPhone;
}

// ── Stripe webhook handler (exported for pre-body-parser mounting) ─────
async function stripeWebhookHandler(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const obj        = event.data.object;
    const customerId = obj.customer || (event.type.startsWith('customer.subscription.') ? obj.id : null);

    try {
        const userPhone = await resolveUserPhoneFromEvent(event);
        if (!userPhone) {
            console.warn(`[webhook] Could not resolve userPhone for customer ${customerId} from event ${event.type}`);
            return res.status(200).json({ received: true });
        }

        const configRef  = db.collection('users').doc(userPhone).collection('settings').doc('config');
        let   updateData = {};

        switch (event.type) {
            case 'customer.subscription.created':
                updateData = { active_subscription: true, subscription_status: 'active', stripe_customer_id: customerId };
                break;
            case 'invoice.payment_succeeded':
                updateData = { active_subscription: true, subscription_status: 'active' };
                break;
            case 'customer.subscription.deleted':
                updateData = { active_subscription: false, subscription_status: 'canceled' };
                break;
            case 'invoice.payment_failed':
                updateData = { active_subscription: false, subscription_status: 'past_due' };
                break;
            default:
                console.log(`[webhook] Unhandled event type ${event.type}`);
        }

        if (Object.keys(updateData).length > 0) {
            await configRef.set(updateData, { merge: true });
            console.log(`[webhook] Processed ${event.type} for ${userPhone}`, updateData);
        }
        return res.status(200).json({ received: true });
    } catch (err) {
        console.error(`[webhook] Database error handling event ${event.type}:`, err.message);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

// ── POST /api/billing/create-checkout-session ─────────────────────────
router.post('/create-checkout-session', requireAuth, async (req, res) => {
    try {
        const userPhone  = req.userPhone;
        const configSnap = await db.collection('users').doc(userPhone).collection('settings').doc('config').get();
        let   contactEmail = '';

        if (configSnap.exists) {
            const data = configSnap.data();
            if (data.contact_email && data.contact_email.trim()) contactEmail = data.contact_email.trim();
        }
        if (!contactEmail && req.authedUser && req.authedUser.email) {
            contactEmail = req.authedUser.email.trim();
        }

        const sessionConfig = {
            mode:                'subscription',
            payment_method_types: ['card'],
            line_items:          [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
            success_url:         `${process.env.APP_URL || 'http://localhost:8080'}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:          `${process.env.APP_URL || 'http://localhost:8080'}/dashboard`,
            client_reference_id: userPhone,
            subscription_data:   { metadata: { userPhone } },
        };
        if (contactEmail) sessionConfig.customer_email = contactEmail;

        const session = await stripe.checkout.sessions.create(sessionConfig);
        res.json({ url: session.url });
    } catch (err) {
        console.error('Checkout session creation failed:', err.message);
        res.status(500).json({ error: 'checkout_failed', message: err.message });
    }
});

// ── POST /api/billing/verify-session ─────────────────────────────────
router.post('/verify-session', requireAuth, async (req, res) => {
    const { session_id } = req.body;
    if (!session_id || !session_id.startsWith('cs_')) {
        return res.status(400).json({ error: 'Invalid session_id.' });
    }
    try {
        const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['subscription'] });

        if (session.client_reference_id !== req.userPhone) {
            return res.status(403).json({ error: 'Session does not belong to this account.' });
        }

        if (session.payment_status === 'paid') {
            const configRef = db.collection('users').doc(req.userPhone).collection('settings').doc('config');
            await configRef.set({
                active_subscription:     true,
                subscription_status:     'active',
                stripe_customer_id:      session.customer,
                stripe_subscription_id:  typeof session.subscription === 'object'
                    ? session.subscription.id
                    : session.subscription,
            }, { merge: true });
            return res.json({ success: true, activated: true });
        }
        return res.json({ success: true, activated: false });
    } catch (err) {
        console.error('[verify-session]', err.message);
        return res.status(500).json({ error: 'Verification failed.' });
    }
});

module.exports = { billingRouter: router, stripeWebhookHandler };
