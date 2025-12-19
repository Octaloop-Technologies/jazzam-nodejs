import { Router } from "express";
import { allNotifications, markAllAsRead, clearAll } from "../controllers/notifications.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { injectTenantConnection } from "../middlewares/tenant.middleware.js";

const router = Router();

// ================================================
// Get all notifications (tenant-specific)
// ================================================

router.use(verifyJWT, injectTenantConnection);

// /api/v1/notifications/get-notifications
router.route('/get-notifications/:id').get(allNotifications);

// Mark all notifications as read for a company
// /api/v1/notifications/mark-all-read/:id
router.route('/mark-all-read/:id').post(markAllAsRead);

// Clear all notifications for a company
// /api/v1/notifications/clear-all/:id
router.route('/clear-all/:id').delete(clearAll);

export default router;