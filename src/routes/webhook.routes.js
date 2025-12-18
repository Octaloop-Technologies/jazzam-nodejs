import { Router } from "express";
import { 
  handleHubSpotWebhook,
  handleZohoWebhook, 
  handleWebhook 
} from "../controllers/webhook.controller.js";

const router = Router();

// Webhook endpoints (No auth - public endpoints for CRM webhooks)
// These endpoints receive webhook events from external CRM systems

// POST /api/v1/webhooks/hubspot (HubSpot specific endpoint)
router.post("/hubspot", handleHubSpotWebhook);

// POST /api/v1/webhooks/zoho (Zoho specific endpoint)
router.post("/zoho", handleZohoWebhook);

// POST /api/v1/webhooks/:provider (Generic webhook endpoint for other CRMs)
router.post("/:provider", handleWebhook);

export default router;
