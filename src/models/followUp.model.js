import mongoose from "mongoose";

const FollowUpLead = new mongoose.Schema({
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Lead",
    },
    channel: {
        enum: ["email", "whatsapp"],
        type: String,
        default: "email"
    },
    status: {
        enum: ["submitted", "schedules", "pending"],
        type: String,
        default: "pending"
    },
    scheduleDate: {
        type: Date,
    },
    dateOfSubmission: {
        type: Date,
    }
}, { timestamps: true });

const FollowUp = mongoose.model('FollowUp', FollowUpLead);
export default FollowUp;