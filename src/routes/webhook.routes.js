import { Router } from "express";
import {
  testWebhook,
  getWebhookInfo,
} from "../controllers/webhook.controller.js";

const router = Router();

// Get webhook configuration and status
// GET /api/v1/webhook/info
router.route("/info").get(getWebhookInfo);

// Test webhook connectivity
// GET /api/v1/webhook/test
router.route("/test").get(testWebhook);

export default router;
