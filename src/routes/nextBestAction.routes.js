import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  generateAction,
  getLeadAction,
  getPendingActions,
  executeAction,
  snoozeAction,
  declineAction,
  batchGenerateActions,
  getActionHistory,
  getActionStats,
} from "../controllers/nextBestAction.controller.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// Get pending actions for company dashboard
// GET /api/v1/next-best-action/pending
router.get("/pending", getPendingActions);

// Get action statistics
// GET /api/v1/next-best-action/stats
router.get("/stats", getActionStats);

// Generate action for a specific lead
// POST /api/v1/next-best-action/:leadId/generate
router.post("/:leadId/generate", generateAction);

// Get next best action for a lead
// GET /api/v1/next-best-action/:leadId
router.get("/:leadId", getLeadAction);

// Get action history for a lead
// GET /api/v1/next-best-action/:leadId/history
router.get("/:leadId/history", getActionHistory);

// Execute an action
// POST /api/v1/next-best-action/:actionId/execute
router.post("/:actionId/execute", executeAction);

// Snooze an action
// POST /api/v1/next-best-action/:actionId/snooze
router.post("/:actionId/snooze", snoozeAction);

// Decline an action
// POST /api/v1/next-best-action/:actionId/decline
router.post("/:actionId/decline", declineAction);

// Batch generate actions
// POST /api/v1/next-best-action/batch/generate
router.post("/batch/generate", batchGenerateActions);

export default router;