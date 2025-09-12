import { Router } from "express";
import {
  submitWaitlist,
  testEmailConfig,
  testWaitlistEmail,
} from "../controllers/email.controller.js";

const router = Router();

// ================================================
// Public route - Submit email for waitlist
// ================================================

// POST /api/v1/email/waitlist
router.route("/waitlist").post(submitWaitlist);

// ================================================
// Protected route
// ================================================

// Test email configuration
// GET /api/v1/email/test
router.route("/test").get(testEmailConfig);

// Send test waitlist email
// POST /api/v1/email/test-waitlist
router.route("/test-waitlist").post(testWaitlistEmail);

export default router;
