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
    subject: {
        type: String,
        default: ""
    },
    message: {
        type: String,
        default: ""
    },
    status: {
        enum: ["submitted", "scheduled", "pending"],
        type: String,
        default: "pending"
    },
    scheduleDate: {
        type: Date,
    },
    scheduled: {
        type: Boolean,
        default: false
    },
    dateOfSubmission: {
        type: Date,
    }
}, { timestamps: true });

const FollowUp = mongoose.model('FollowUp', FollowUpLead);
export default FollowUp;