import Notifications from "../models/notifications.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const allNotifications = asyncHandler(async(req, res) => {
    try {
        const companyId = req.params.id;
        const notifications = await Notifications.find({ companyId: companyId }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: notifications})
    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
});
