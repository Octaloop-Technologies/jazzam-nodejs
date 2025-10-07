### 1. Create Stripe Account

1. Sign up at [stripe.com](https://stripe.com)
2. Complete account verification
3. Navigate to Developers > API keys
4. Copy your Secret Key (starts with `sk_test_` or `sk_live_`)

### 2. Configure Webhook Endpoint

1. Go to Developers > Webhooks in Stripe Dashboard
2. Click "Add endpoint"
3. Enter webhook URL: `https://yourdomain.com/api/v1/billing/webhook/stripe`
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the Webhook Signing Secret (starts with `whsec_`)

# Stripe Webhook Setup Guide

## Quick Setup for Your Application

### Step 1: Get Your Stripe API Keys

1. Go to [https://dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)
2. Copy your **Secret key** (starts with `sk_test_`)
3. Add to your `.env` file:
   ```env
   STRIPE_SECRET_KEY=sk_test_your_key_here
   ```

### Step 2: Set Up Webhook Endpoint

#### For Local Testing (Development)

**Option A: Use Stripe CLI (Recommended)**

1. Install Stripe CLI:

   ```bash
   # Windows (with Scoop)
   scoop install stripe

   # Or download from: https://github.com/stripe/stripe-cli/releases
   ```

2. Login to Stripe:

   ```bash
   stripe login
   ```

3. Forward webhooks to your local server:

   ```bash
   stripe listen --forward-to localhost:5000/api/v1/billing/webhook/stripe
   ```

4. Copy the webhook signing secret (starts with `whsec_`) from the terminal output

5. Add to your `.env` file:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_cli_secret_here
   ```

**Option B: Use ngrok**

1. Install ngrok: [https://ngrok.com/download](https://ngrok.com/download)

2. Start your backend server:

   ```bash
   cd backend
   npm run dev
   ```

3. In another terminal, expose your local server:

   ```bash
   ngrok http 5000
   ```

4. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

5. Go to Stripe Dashboard > Developers > Webhooks

6. Click "Add endpoint"

7. Enter: `https://abc123.ngrok.io/api/v1/billing/webhook/stripe`

8. Select events:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `invoice.payment_succeeded`
   - ✅ `invoice.payment_failed`

9. Click "Add endpoint"

10. Copy the webhook signing secret and add to `.env`

#### For Production

1. Go to [https://dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)

2. Click "Add endpoint"

3. Enter your production webhook URL:

   ```
   https://yourdomain.com/api/v1/billing/webhook/stripe
   ```

4. Select the same events as above

5. Click "Add endpoint"

6. Copy the webhook signing secret

7. Add to your production environment variables

### Step 3: Test the Integration

1. Make sure your backend is running:

   ```bash
   cd backend
   npm run dev
   ```

2. Make sure your frontend is running:

   ```bash
   cd frontend
   npm run dev
   ```

3. If using Stripe CLI, make sure it's forwarding webhooks:

   ```bash
   stripe listen --forward-to localhost:5000/api/v1/billing/webhook/stripe
   ```

4. Navigate to: `http://localhost:3000/super-user/subscription`

5. Click "Subscribe with Stripe" on any plan

6. Use test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits

7. Complete the checkout

8. You should:
   - Be redirected back to your dashboard
   - See the subscription activated in settings
   - See webhook logs in your terminal

### Step 4: Verify It's Working

Check your backend logs for:

```
Stripe checkout session created
Stripe webhook received: checkout.session.completed
Subscription activated for company: [id]
```

Check your frontend:

- Go to Settings
- Should show "Current Plan: Starter" (or whichever you chose)
- Should show "Payment Method: stripe"
- Should show billing dates

### Environment Variables Summary

Your `.env` file should have:

```env
# Required for Stripe
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
CLIENT_URL=http://localhost:3000

# Optional - only if you want PayFort too
PAYFORT_MERCHANT_IDENTIFIER=
PAYFORT_ACCESS_CODE=
PAYFORT_SHA_REQUEST_PHRASE=
PAYFORT_SHA_RESPONSE_PHRASE=
```

## Test Cards

| Card Number         | Description                         |
| ------------------- | ----------------------------------- |
| 4242 4242 4242 4242 | Success                             |
| 4000 0000 0000 0002 | Decline                             |
| 4000 0027 6000 3184 | 3D Secure (requires authentication) |
| 4000 0000 0000 9995 | Insufficient funds                  |

All test cards:

- Use any future expiry date
- Use any 3-digit CVC
- Use any ZIP code

## Troubleshooting

### "Webhook signature verification failed"

**Solution:**

1. Make sure `STRIPE_WEBHOOK_SECRET` matches the one from Stripe Dashboard or CLI
2. Restart your server after changing `.env`
3. If using ngrok, make sure the URL in Stripe dashboard matches your current ngrok URL

### "No webhook events received"

**Solution:**

1. Check Stripe CLI is running: `stripe listen --forward-to localhost:5000/api/v1/billing/webhook/stripe`
2. Or check ngrok is running and URL is correct in Stripe dashboard
3. Verify your backend server is running on port 5000
4. Check the webhook endpoint URL is exactly: `/api/v1/billing/webhook/stripe`

### "Checkout works but subscription doesn't activate"

**Solution:**

1. Check backend logs for webhook errors
2. Verify company ID exists in database
3. Make sure webhook events are selected in Stripe dashboard
4. Test webhook manually: `stripe trigger checkout.session.completed`

### "PayFort not configured" error

This is normal if you haven't set up PayFort credentials. You can:

1. **Option A:** Only use Stripe (users won't see PayFort button errors)
2. **Option B:** Configure PayFort credentials in `.env` when ready

## Quick Reference

### Stripe Dashboard URLs

- **API Keys:** https://dashboard.stripe.com/test/apikeys
- **Webhooks:** https://dashboard.stripe.com/test/webhooks
- **Payments:** https://dashboard.stripe.com/test/payments
- **Customers:** https://dashboard.stripe.com/test/customers
- **Subscriptions:** https://dashboard.stripe.com/test/subscriptions

### Useful Stripe CLI Commands

```bash
# Listen for webhooks
stripe listen --forward-to localhost:4000/api/v1/billing/webhook/stripe

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_succeeded

# View recent events
stripe events list --limit 10

# View logs
stripe logs tail
```
