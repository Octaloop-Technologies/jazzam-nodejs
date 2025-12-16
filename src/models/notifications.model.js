import mongoose from "mongoose";

const NotiifcationSchema = new mongoose.Schema({
    // companyId removed - separate DB per tenant provides isolation
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

export { NotiifcationSchema }

// const Notification = mongoose.model("notifications", NotiifcationSchema);
// export default Notification;