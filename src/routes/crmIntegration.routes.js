import { Router } from "express";
import {
  createCrmIntegration,
  getCrmIntegration,
  updateCrmIntegration,
  deleteCrmIntegration,
  testCrmConnection,
  syncLeadsToCrm,
  getCrmSyncStatus,
  updateFieldMapping,
  getCrmErrorLogs,
  resolveCrmError,
} from "../controllers/crmIntegration.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// ================================================
// Secured routes (authentication required)
// ================================================

router.use(verifyJWT);

// POST /api/v1/crm-integration (Create CRM integration)
router.route("/").post(createCrmIntegration);

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

// GET /api/v1/crm-integration/sync-status (Get sync status)
router.route("/sync-status").get(getCrmSyncStatus);

// PATCH /api/v1/crm-integration/field-mapping (Update field mapping)
router.route("/field-mapping").patch(updateFieldMapping);

// GET /api/v1/crm-integration/error-logs (Get error logs)
router.route("/error-logs").get(getCrmErrorLogs);

// PATCH /api/v1/crm-integration/error-logs/:errorId/resolve (Resolve error)
router.route("/error-logs/:errorId/resolve").patch(resolveCrmError);

export default router;
