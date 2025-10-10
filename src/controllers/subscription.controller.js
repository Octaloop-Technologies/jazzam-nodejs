import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Company } from "../models/company.model.js";
import {
  createStripeCheckoutSession,
  verifyStripeWebhook,
  handleStripeCheckoutCompleted,
  handleStripeSubscriptionUpdated,
  cancelStripeSubscription,
  createStripeBillingPortalSession,
} from "../services/stripe.service.js";
import {
  createPayfortPaymentRequest,
  handlePayfortPaymentResponse,
  verifyPayfortSignature,
  queryPayfortTransaction,
  storePendingPaymentMetadata,
  isPayfortConfigured,
} from "../services/payfort.service.js";

// ==============================================================
// Checkout Session Creation
// ==============================================================

/**
 * Create a checkout session for Stripe or PayFort
 * @route POST /api/v1/subscription/checkout
 */
const createCheckoutSession = asyncHandler(async (req, res) => {
  const { plan, provider = "stripe" } = req.body;
  const company = req.company;

  // Validate plan
  const validPlans = ["starter", "growth", "pro"];
  if (!validPlans.includes(plan)) {
    throw new ApiError(400, "Invalid subscription plan");
  }

  // Validate provider
  const validProviders = ["stripe", "payfort"];
  if (!validProviders.includes(provider)) {
    throw new ApiError(400, "Invalid payment provider");
  }

  // Check if provider is configured
  if (provider === "payfort" && !isPayfortConfigured()) {
    throw new ApiError(
      501,
      "PayFort is not configured. Please use Stripe or contact support."
    );
  }

  try {
    if (provider === "stripe") {
      // Create Stripe checkout session
      const { sessionId, url } = await createStripeCheckoutSession({
        plan,
        companyId: company._id.toString(),
        companyEmail: company.email,
        companyName: company.companyName,
      });

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            provider: "stripe",
            sessionId,
            url,
          },
          "Stripe checkout session created"
        )
      );
    } else if (provider === "payfort") {
      // Create PayFort payment request
      const { paymentUrl, merchantReference, params, metadata } =
        await createPayfortPaymentRequest({
          plan,
          companyId: company._id.toString(),
          companyEmail: company.email,
          companyName: company.companyName,
        });

      // Store metadata temporarily for callback processing
      storePendingPaymentMetadata(merchantReference, metadata);

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            provider: "payfort",
            paymentUrl,
            merchantReference,
            params,
          },
          "PayFort payment request created"
        )
      );
    }
  } catch (error) {
    console.error("Checkout session creation error:", error);
    throw new ApiError(
      500,
      error?.message || "Failed to create checkout session"
    );
  }
});

// ==============================================================
// Stripe Webhook Handler
// ==============================================================

/**
 * Handle Stripe webhooks
 * @route POST /api/v1/subscription/webhook/stripe
 */
const handleStripeWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const rawBody = req.rawBody; // We'll need to capture raw body in middleware

  console.log("calling webhook**********")

  try {
    // Verify webhook signature
    const event = verifyStripeWebhook(rawBody, signature);

    console.log(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const paymentData = await handleStripeCheckoutCompleted(session);

        // Update company subscription
        const company = await Company.findById(paymentData.companyId);
        if (!company) {
          throw new ApiError(404, "Company not found");
        }

        company.subscriptionStatus = "active";
        company.subscriptionPlan = paymentData.plan;
        company.subscriptionStartDate = paymentData.currentPeriodStart;
        company.subscriptionEndDate = paymentData.currentPeriodEnd;
        company.paymentMethod = "stripe";
        company.paymentDetails = {
          ...company.paymentDetails,
          stripeCustomerId: paymentData.customerId,
          stripeSubscriptionId: paymentData.subscriptionId,
          lastPaymentDate: new Date(),
          nextPaymentDate: paymentData.currentPeriodEnd,
          paymentCurrency: "USD",
        };

        await company.save();
        console.log(`Subscription activated for company: ${company._id}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const subData = await handleStripeSubscriptionUpdated(subscription);

        // Find company by Stripe customer ID
        const company = await Company.findOne({
          "paymentDetails.stripeCustomerId": subData.customerId,
        });

        if (company) {
          company.subscriptionEndDate = subData.currentPeriodEnd;
          company.paymentDetails.nextPaymentDate = subData.currentPeriodEnd;

          if (subData.cancelAtPeriodEnd) {
            company.subscriptionStatus = "cancelled";
          }

          await company.save();
          console.log(`Subscription updated for company: ${company._id}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        // Find company and downgrade to free plan
        const company = await Company.findOne({
          "paymentDetails.stripeSubscriptionId": subscription.id,
        });

        if (company) {
          company.subscriptionStatus = "expired";
          company.subscriptionPlan = "free";
          company.subscriptionEndDate = null;
          company.paymentMethod = "none";

          await company.save();
          console.log(`Subscription cancelled for company: ${company._id}`);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;

        // Update last payment date
        const company = await Company.findOne({
          "paymentDetails.stripeCustomerId": invoice.customer,
        });

        if (company) {
          company.paymentDetails.lastPaymentDate = new Date();
          company.paymentDetails.lastPaymentAmount = invoice.amount_paid / 100;
          await company.save();
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;

        // Mark subscription as pending payment
        const company = await Company.findOne({
          "paymentDetails.stripeCustomerId": invoice.customer,
        });

        if (company) {
          company.subscriptionStatus = "pending_payment";
          await company.save();
          console.log(`Payment failed for company: ${company._id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Webhook processed successfully"));
  } catch (error) {
    console.error("Stripe webhook error:", error);
    throw new ApiError(
      500,
      error?.message || "Failed to process Stripe webhook"
    );
  }
});

// ==============================================================
// PayFort Webhook/Callback Handler
// ==============================================================

/**
 * Handle PayFort payment response (can be GET or POST)
 * @route POST /api/v1/subscription/webhook/payfort
 * @route GET /api/v1/subscription/webhook/payfort (for redirects)
 */
const handlePayfortCallback = asyncHandler(async (req, res) => {
  const paymentResponse = req.method === "POST" ? req.body : req.query;

  try {
    // Process and verify PayFort response
    const paymentData = await handlePayfortPaymentResponse(paymentResponse);

    if (!paymentData.success) {
      throw new ApiError(400, "Payment verification failed");
    }

    // Find company by ID from merchant reference
    const company = await Company.findById(paymentData.companyId);
    if (!company) {
      throw new ApiError(404, "Company not found");
    }

    // Query transaction to get additional details
    const transactionStatus = await queryPayfortTransaction(
      paymentData.merchantReference
    );

    // Determine plan from transaction (you may need to store this in metadata)
    // For now, we'll extract from the amount
    let plan = "starter";
    if (paymentData.amount === 7900) plan = "growth";
    if (paymentData.amount === 19900) plan = "pro";

    // Update company subscription
    company.subscriptionStatus = "active";
    company.subscriptionPlan = plan;
    company.subscriptionStartDate = new Date();
    company.subscriptionEndDate = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    );
    company.paymentMethod = "payfort";
    company.paymentDetails = {
      ...company.paymentDetails,
      payfortMerchantReference: paymentData.merchantReference,
      payfortFortId: paymentData.fortId,
      lastPaymentDate: new Date(),
      nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastPaymentAmount: paymentData.amount / 100,
      paymentCurrency: paymentData.currency,
    };

    await company.save();
    console.log(`PayFort payment successful for company: ${company._id}`);

    // For webhook, return JSON
    if (req.headers["content-type"]?.includes("application/json")) {
      return res
        .status(200)
        .json(new ApiResponse(200, null, "Payment processed successfully"));
    }

    // For redirect, redirect to success page
    return res.redirect(`${process.env.CLIENT_URL}/super-user?payment=success`);
  } catch (error) {
    console.error("PayFort callback error:", error);

    // For webhook, return JSON error
    if (req.headers["content-type"]?.includes("application/json")) {
      throw new ApiError(
        500,
        error?.message || "Failed to process PayFort payment"
      );
    }

    // For redirect, redirect to error page
    return res.redirect(
      `${process.env.CLIENT_URL}/super-user/subscription?payment=failed`
    );
  }
});

// ==============================================================
// Subscription Management
// ==============================================================

/**
 * Cancel subscription
 * @route POST /api/v1/subscription/cancel
 */
const cancelSubscription = asyncHandler(async (req, res) => {
  const company = req.company;

  if (
    company.paymentMethod === "stripe" &&
    company.paymentDetails?.stripeSubscriptionId
  ) {
    // Cancel Stripe subscription at period end
    await cancelStripeSubscription(company.paymentDetails.stripeSubscriptionId);

    company.subscriptionStatus = "cancelled";
    await company.save();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "Subscription will be cancelled at the end of the billing period"
        )
      );
  } else if (company.paymentMethod === "payfort") {
    // For PayFort, mark as cancelled (manual process for recurring)
    company.subscriptionStatus = "cancelled";
    company.subscriptionPlan = "free";
    company.paymentMethod = "none";
    await company.save();

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Subscription cancelled"));
  } else {
    throw new ApiError(400, "No active subscription to cancel");
  }
});

/**
 * Create Stripe billing portal session
 * @route POST /api/v1/subscription/billing-portal
 */
const createBillingPortal = asyncHandler(async (req, res) => {
  const company = req.company;

  if (
    company.paymentMethod !== "stripe" ||
    !company.paymentDetails?.stripeCustomerId
  ) {
    throw new ApiError(
      400,
      "Stripe billing portal is only available for Stripe customers"
    );
  }

  const { url } = await createStripeBillingPortalSession(
    company.paymentDetails.stripeCustomerId
  );

  return res
    .status(200)
    .json(new ApiResponse(200, { url }, "Billing portal session created"));
});

export {
  createCheckoutSession,
  handleStripeWebhook,
  handlePayfortCallback,
  cancelSubscription,
  createBillingPortal,
};
