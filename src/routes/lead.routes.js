import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  getLeads,
  getLeadById,
  updateLeadById,
  searchLeads,
  updateLeadStatus,
  getLeadStats,
  deleteLead,
  qualifyLeadBANT,
  batchQualifyLeadsBANT,
  followUpEmail,
  followUpLeads,
  scheduleFollowUpLeads,
  createLeadFollowup,
} from "../controllers/lead.controller.js";

const router = Router();

// ================================================
// Public route - Create lead (for form submission)
// ================================================
// Update lead bant object
// PATCH /api/v1/lead/:id
router.route("/:id").patch(updateLeadById);

// ================================================
// Protected routes - Require authentication
// ================================================
router.use(verifyJWT);

// Get all leads with pagination, filtering, and sorting
// GET /api/v1/lead/all?page=1&limit=10&status=hot&industry=Technology
router.route("/all").get(getLeads);

// Get all follow up leads
// GET /api/lead/follow-up-leads
router.route("/follow-up-leads").get(followUpLeads)

// Search leads by text query
// GET /api/v1/lead/search?query=john&page=1&limit=10&status=warm
router.route("/search").get(searchLeads);

// Get lead statistics and analytics
// GET /api/v1/lead/stats
router.route("/stats").get(getLeadStats);

// ================================================
// BANT Qualification Routes (only for manual qualification)
// ================================================

// Batch qualify multiple leads using BANT
// POST /api/v1/lead/bant/batch
// Body: { leadIds: [...], filters: {...} }
router.route("/bant/batch").post(batchQualifyLeadsBANT);

// Qualify a single lead using BANT
// POST /api/v1/lead/:id/bant
router.route("/:id/bant").post(qualifyLeadBANT);

// Get single lead by ID
// GET /api/v1/lead/:id
router.route("/:id").get(getLeadById);

// Update lead status and notes
// PATCH /api/v1/lead/:id/status
router.route("/:id/status").patch(updateLeadStatus);

// Soft delete a lead
// DELETE /api/v1/lead/:id
router.route("/:id").delete(deleteLead);

// Create lead followup
// POST /api/v1/lead/create-followup
router.route("/create-followup/:id").post(createLeadFollowup)

// lead follow up email
router.route("/follow-up/:id").post(followUpEmail)

// schedule followup lead
router.route("/schedule-follow-up/:id").post(scheduleFollowUpLeads) 

export default router;
