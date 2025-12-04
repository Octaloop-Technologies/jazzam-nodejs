import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  getLeadHealth,
  // getDashboardMetrics,
  getEngagementHistory,
  logEngagement,
  recalculateHealth,
  batchCalculateHealth,
  getAtRiskLeads,
} from "../controllers/dealHealth.controller.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// Get dashboard metrics for company
// GET /api/v1/deal-health/dashboard
// router.get("/dashboard", getDashboardMetrics);

// Get deal health for a specific lead
// GET /api/v1/deal-health/:leadId
router.get("/:leadId", getLeadHealth);

// Get engagement history for a lead
// GET /api/v1/deal-health/:leadId/engagement
router.get("/:leadId/engagement", getEngagementHistory);

// Log engagement event
// POST /api/v1/deal-health/:leadId/engagement
router.post("/:leadId/engagement", logEngagement);

// Manually recalculate health
// POST /api/v1/deal-health/:leadId/recalculate
router.post("/:leadId/recalculate", recalculateHealth);

// Batch calculate health
// POST /api/v1/deal-health/batch/calculate
router.post("/batch/calculate", batchCalculateHealth);

// Get at-risk leads
// GET /api/v1/deal-health/at-risk
router.get("/at-risk", getAtRiskLeads);

export default router;