import Stripe from "stripe";
import { ApiError } from "../utils/ApiError.js";

// Initialize Stripe with API key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-11-20.acacia",
});

// Pricing configuration
const PLAN_PRICES = {
  starter: 2900, // $29.00 in cents
  growth: 7900, // $79.00 in cents
  pro: 19900, // $199.00 in cents
};

/**
 * Create a Stripe checkout session for subscription
 * @param {Object} params
 * @param {string} params.plan - Plan key (starter, growth, pro)
 * @param {string} params.companyId - Company ID
 * @param {string} params.companyEmail - Company email
 * @param {string} params.companyName - Company name
 * @returns {Promise<{sessionId: string, url: string}>}
 */
export const createStripeCheckoutSession = async ({
  plan,
  companyId,
  companyEmail,
  companyName,
}) => {
  try {
    if (!PLAN_PRICES[plan]) {
      throw new ApiError(400, `Invalid plan: ${plan}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer_email: companyEmail,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
              description: `${companyName} subscription`,
            },
            unit_amount: PLAN_PRICES[plan],
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL}/super-user?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/super-user/subscription?payment=cancelled`,
      client_reference_id: companyId.toString(),
      metadata: {
        companyId: companyId.toString(),
        plan: plan,
        provider: "stripe",
      },
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  } catch (error) {
    console.error("Stripe checkout session creation error:", error);
    throw new ApiError(
      500,
      error?.message || "Failed to create Stripe checkout session"
    );
  }
};

/**
 * Verify Stripe webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @returns {Object} Verified Stripe event
 */
export const verifyStripeWebhook = (payload, signature) => {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new ApiError(500, "Stripe webhook secret not configured");
    }

    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
    return event;
  } catch (error) {
    console.error("Stripe webhook verification error:", error);
    throw new ApiError(401, "Invalid webhook signature");
  }
};

/**
 * Handle Stripe checkout session completed event
 * @param {Object} session - Stripe checkout session object
 * @returns {Object} Payment data for updating company
 */
export const handleStripeCheckoutCompleted = async (session) => {
  try {
    const companyId = session.metadata.companyId;
    const plan = session.metadata.plan;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    // Retrieve subscription details for more information
    let subscription = null;
    if (subscriptionId) {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    }

    return {
      companyId,
      plan,
      customerId,
      subscriptionId,
      status: session.payment_status,
      currentPeriodStart: subscription
        ? new Date(subscription.current_period_start * 1000)
        : new Date(),
      currentPeriodEnd: subscription
        ? new Date(subscription.current_period_end * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  } catch (error) {
    console.error("Error handling Stripe checkout completion:", error);
    throw new ApiError(
      500,
      error?.message || "Failed to process checkout completion"
    );
  }
};

/**
 * Handle Stripe subscription updated event
 * @param {Object} subscription - Stripe subscription object
 * @returns {Object} Updated subscription data
 */
export const handleStripeSubscriptionUpdated = async (subscription) => {
  try {
    const customerId = subscription.customer;

    return {
      subscriptionId: subscription.id,
      customerId,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  } catch (error) {
    console.error("Error handling Stripe subscription update:", error);
    throw new ApiError(
      500,
      error?.message || "Failed to process subscription update"
    );
  }
};

/**
 * Cancel a Stripe subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Object>} Cancelled subscription
 */
export const cancelStripeSubscription = async (subscriptionId) => {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    return subscription;
  } catch (error) {
    console.error("Error cancelling Stripe subscription:", error);
    throw new ApiError(500, error?.message || "Failed to cancel subscription");
  }
};

/**
 * Retrieve customer's payment methods
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Array>} List of payment methods
 */
export const getStripePaymentMethods = async (customerId) => {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    return paymentMethods.data;
  } catch (error) {
    console.error("Error retrieving payment methods:", error);
    throw new ApiError(
      500,
      error?.message || "Failed to retrieve payment methods"
    );
  }
};

/**
 * Create a billing portal session for customer to manage subscription
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<{url: string}>}
 */
export const createStripeBillingPortalSession = async (customerId) => {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.CLIENT_URL}/super-user/settings`,
    });
    return { url: session.url };
  } catch (error) {
    console.error("Error creating billing portal session:", error);
    throw new ApiError(
      500,
      error?.message || "Failed to create billing portal session"
    );
  }
};
