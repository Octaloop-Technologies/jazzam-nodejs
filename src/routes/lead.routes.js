import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  getLeads,
  createLead,
  getLeadById,
  searchLeads,
  updateLeadStatus,
  getLeadStats,
  deleteLead,
} from "../controllers/lead.controller.js";

const router = Router();

// ================================================
// Public route - Create lead (for form submission)
// ================================================
// POST /api/v1/lead/create
router.route("/create").post(createLead);

// ================================================
// Protected routes - Require authentication
// ================================================
router.use(verifyJWT);

// Get all leads with pagination, filtering, and sorting
// GET /api/v1/lead/all?page=1&limit=10&status=hot&industry=Technology
router.route("/all").get(getLeads);

// Search leads by text query
// GET /api/v1/lead/search?query=john&page=1&limit=10&status=warm
router.route("/search").get(searchLeads);

// Get lead statistics and analytics
// GET /api/v1/lead/stats
router.route("/stats").get(getLeadStats);

// Get single lead by ID
// GET /api/v1/lead/:id
router.route("/:id").get(getLeadById);

// Update lead status and notes
// PATCH /api/v1/lead/:id/status
router.route("/:id/status").patch(updateLeadStatus);

// Soft delete a lead
// DELETE /api/v1/lead/:id
router.route("/:id").delete(deleteLead);

export default router;
