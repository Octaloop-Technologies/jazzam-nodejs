import { Router } from "express";
import {
  getProviders,
  initOAuthFlow,
  handleOAuthCallback,
  getCrmIntegration,
  updateCrmIntegration,
  deleteCrmIntegration,
  testCrmConnection,
  syncLeadsToCrm,
  importFromCrm,
  getCrmSyncStatus,
  retryFailedLeads,
  updateFieldMapping,
  getCrmErrorLogs,
  resolveCrmError,
} from "../controllers/crmIntegration.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// ================================================
// Public OAuth callback routes (no auth required)
// ================================================

// GET /api/v1/crm-integration/oauth/callback/:provider
router.route("/oauth/callback/:provider").get(handleOAuthCallback);

// ================================================
// Secured routes (authentication required)
// ================================================

router.use(verifyJWT);

// GET /api/v1/crm-integration/providers (Get configured providers)
router.route("/providers").get(getProviders);

// POST /api/v1/crm-integration/oauth/init (Initialize OAuth flow)
router.route("/oauth/init").post(initOAuthFlow);

// GET /api/v1/crm-integration (Get CRM integration)
router.route("/").get(getCrmIntegration);

// PATCH /api/v1/crm-integration (Update CRM integration)
router.route("/").patch(updateCrmIntegration);

// DELETE /api/v1/crm-integration (Delete CRM integration)
router.route("/").delete(deleteCrmIntegration);

// POST /api/v1/crm-integration/test-connection (Test CRM connection)
router.route("/test-connection").post(testCrmConnection);

// POST /api/v1/crm-integration/sync-leads (Sync leads to CRM)
router.route("/sync-leads").post(syncLeadsToCrm);

// POST /api/v1/crm-integration/import (Import leads from CRM)
router.route("/import").post(importFromCrm);

// GET /api/v1/crm-integration/sync-status (Get sync status)
router.route("/sync-status").get(getCrmSyncStatus);

// POST /api/v1/crm-integration/retry-failed (Retry failed syncs)
router.route("/retry-failed").post(retryFailedLeads);

// PATCH /api/v1/crm-integration/field-mapping (Update field mapping)
router.route("/field-mapping").patch(updateFieldMapping);

// GET /api/v1/crm-integration/error-logs (Get error logs)
router.route("/error-logs").get(getCrmErrorLogs);

// PATCH /api/v1/crm-integration/error-logs/:errorId/resolve (Resolve error)
router.route("/error-logs/:errorId/resolve").patch(resolveCrmError);

export default router;
