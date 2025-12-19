import { getTenantModels } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const allNotifications = asyncHandler(async(req, res) => {
    try {
        // Get tenant-specific models
        const { Notification } = getTenantModels(req.tenantConnection);
        
        // No need for companyId filter - separate DB per tenant!
        const notifications = await Notification.find({}).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: notifications})
    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
});

export const markAllAsRead = asyncHandler(async (req, res) => {
    try {
        // Get tenant-specific models
        const { Notification } = getTenantModels(req.tenantConnection);
        
        // No need for companyId filter
        await Notification.updateMany({ isRead: false }, { $set: { isRead: true } });
        
        // Fetch updated notifications and emit to realtime clients
        const notifications = await Notification.find({}).sort({ createdAt: -1 });
        if (req?.io) req.io.emit(`notifications`, { action: 'markAllRead', notifications });
        return res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

export const clearAll = asyncHandler(async (req, res) => {
    try {
        // Get tenant-specific models
        const { Notification } = getTenantModels(req.tenantConnection);
        
        // No need for companyId filter
        await Notification.deleteMany({});
        
        // Emit cleared event to realtime clients
        if (req?.io) req.io.emit(`notifications`, { action: 'clearAll', notifications: [] });
        return res.status(200).json({ success: true, message: 'All notifications cleared' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
