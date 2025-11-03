// routes/invitationRoutes.js
import { Router } from "express";
import { sendInvitation, acceptInvitation } from "../controllers/invitation.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js";
const router = Router();

// ================================================
// Protected routes - Require authentication
// ================================================
router.use(verifyJWT);

router.post("/send", sendInvitation);
router.post("/accept", acceptInvitation);

export default router;
