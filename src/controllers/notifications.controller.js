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

export const markAllAsRead = asyncHandler(async (req, res) => {
    try {
        const companyId = req.params.id;
        await Notifications.updateMany({ companyId: companyId, isRead: false }, { $set: { isRead: true } });
        // Fetch updated notifications and emit to realtime clients
        const notifications = await Notifications.find({ companyId: companyId }).sort({ createdAt: -1 });
        if (req?.io) req.io.emit(`notifications`, { action: 'markAllRead', notifications });
        return res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

export const clearAll = asyncHandler(async (req, res) => {
    try {
        const companyId = req.params.id;
        await Notifications.deleteMany({ companyId: companyId });
        // Emit cleared event to realtime clients
        if (req?.io) req.io.emit(`notifications`, { action: 'clearAll', notifications: [] });
        return res.status(200).json({ success: true, message: 'All notifications cleared' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
