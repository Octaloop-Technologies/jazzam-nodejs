import { Router } from "express";
import {
  createPlatformForm,
  getPlatformForms,
  getAvailablePlatforms,
  getForms,
  getFormById,
  updateForm,
  deleteForm,
  getFormByAccessToken,
  submitFormData,
  addFormField,
  removeFormField,
} from "../controllers/form.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// ================================================
// Public routes (no authentication required)
// ================================================

// POST /api/v1/forms/:accessToken/submit (Form submission)
router.route("/:accessToken/submit").post(submitFormData);

// GET /api/v1/forms/:accessToken (Public form access) - Must be last to avoid conflicts
router.route("/:accessToken").get(getFormByAccessToken);

// ================================================
// Secured routes (authentication required)
// ================================================

router.use(verifyJWT);

// Platform-specific form routes (must be before parameterized routes)
// POST /api/v1/forms/platform/create (Create platform-specific form)
router.route("/platform/create").post(createPlatformForm);

// GET /api/v1/forms/platform/available (Get available platforms)
router.route("/platform/available").get(getAvailablePlatforms);

// GET /api/v1/forms/platform (Get platform forms)
router.route("/platform").get(getPlatformForms);

// General form management routes
// GET /api/v1/forms (Get all forms for company)
router.route("/").get(getForms);

// GET /api/v1/forms/:formId (Get specific form)
router.route("/:formId").get(getFormById);

// PATCH /api/v1/forms/:formId (Update form)
router.route("/:formId").patch(updateForm);

// DELETE /api/v1/forms/:formId (Delete form)
router.route("/:formId").delete(deleteForm);

// POST /api/v1/forms/:formId/fields (Add field to form)
router.route("/:formId/fields").post(addFormField);

// DELETE /api/v1/forms/:formId/fields/:fieldId (Remove field from form)
router.route("/:formId/fields/:fieldId").delete(removeFormField);

export default router;
