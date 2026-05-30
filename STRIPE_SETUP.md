# Stripe Billing & Subscription Gate Environment Setup

To deploy the secure subscription gating and automated billing pipeline to Google Cloud Run, verify and configure the following environment variables.

## Environment Variables Configuration

Add these variables to your production environment (e.g., Google Cloud Secret Manager or Cloud Run Environment configuration):

1. **`STRIPE_SECRET_KEY`**
   - **Source**: Stripe Dashboard -> Developers -> API Keys (restricted or secret key, starts with `sk_live_` or `sk_test_`).
   - **Role**: Authenticates backend requests to Stripe to create checkout sessions.

2. **`STRIPE_WEBHOOK_SECRET`**
   - **Source**: Stripe Dashboard -> Developers -> Webhooks (retrieve signing secret, starts with `whsec_`).
   - **Role**: Validates that incoming webhook payloads originate securely from Stripe.

3. **`STRIPE_PRICE_ID`**
   - **Source**: Stripe Dashboard -> Products -> select subscription product price ID (starts with `price_`).
   - **Role**: Directs the checkout creation engine to subscribe users to the correct recurring pricing tier.

4. **`APP_URL`**
   - **Source**: Your production domain address (e.g., `https://lone-ranger-app-xxxxxx.run.app`).
   - **Role**: Hydrates the redirect success and cancel landing paths for Stripe Checkout.
