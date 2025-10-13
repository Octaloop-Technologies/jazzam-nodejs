import { Router } from "express";
import {
  createCheckoutSession,
  handleStripeWebhook,
  handlePayfortCallback,
  cancelSubscription,
  createBillingPortal,
  subscriptionHistory,
} from "../controllers/subscription.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// ==============================================================
// Public webhook endpoints (no auth required - validated by signature)
// ==============================================================

// get billing history
router.route("/:id/billing-history").get(subscriptionHistory)

// Stripe webhook endpoint
router.route("/webhook/stripe").post(handleStripeWebhook);

// PayFort callback endpoint (supports both POST and GET)
router
  .route("/webhook/payfort")
  .post(handlePayfortCallback)
  .get(handlePayfortCallback);

// ==============================================================
// Protected routes
// ==============================================================
router.use(verifyJWT);

// Create checkout session for paid plans (Stripe or PayFort)
router.route("/checkout").post(createCheckoutSession);

// Cancel subscription
router.route("/cancel").post(cancelSubscription);

// Create Stripe billing portal session
router.route("/billing-portal").post(createBillingPortal);

export default router;
