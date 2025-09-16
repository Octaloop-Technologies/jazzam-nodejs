import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  joinWaitlist,
  getWaitlistStats,
  getWaitlistEntries,
  updateWaitlistStatus,
  deleteWaitlistEntry,
} from "../controllers/waitlist.controller.js";

const router = Router();

// ================================================
// Public route - Join waitlist
// ================================================
// POST /api/v1/waitlist/join
router.route("/join").post(joinWaitlist);

// ================================================
// Protected routes - Require authentication (Admin only)
// ================================================
router.use(verifyJWT);

// Get waitlist statistics
// GET /api/v1/waitlist/stats
router.route("/stats").get(getWaitlistStats);

// Get all waitlist entries with pagination and filtering
// GET /api/v1/waitlist/entries?page=1&limit=10&status=pending&source=website
router.route("/entries").get(getWaitlistEntries);

// Update waitlist entry status
// PATCH /api/v1/waitlist/:id/status
router.route("/:id/status").patch(updateWaitlistStatus);

// Delete waitlist entry (soft delete)
// DELETE /api/v1/waitlist/:id
router.route("/:id").delete(deleteWaitlistEntry);

export default router;
