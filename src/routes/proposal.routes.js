// src/routes/proposal.routes.js
import { Router } from "express";
import {
  generateProposal,
  getProposalsByLead,
  updateProposalStatus,
} from "../controllers/proposal.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { injectTenantConnection } from "../middlewares/tenant.middleware.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// Apply tenant middleware to all routes
router.use(injectTenantConnection);

// Generate a new proposal for a lead
router.post("/leads/:leadId/generate", generateProposal);

// Get all proposals for a lead
router.get("/leads/:leadId", getProposalsByLead);

// Update proposal status
router.patch("/:proposalId/status", updateProposalStatus);

export default router;