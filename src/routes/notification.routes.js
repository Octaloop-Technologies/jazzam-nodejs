import { Router } from "express";
import { allNotifications } from "../controllers/notifications.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// ================================================
// Get all notifications
// ================================================

router.use(verifyJWT);

// /api/v1/notifications/get-notifications
router.route('/get-notifications').get(allNotifications);

export default router;