import mongoose from "mongoose";

const FollowUpLeadSchema = new mongoose.Schema({
    // companyId: {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: "Company",
    // },
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
        default: null
    },
    scheduled: {
        type: Boolean,
        default: false
    },
    dateOfSubmission: {
        type: Date,
    },
    responseReceived: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

export { FollowUpLeadSchema }

// const FollowUp = mongoose.model('FollowUp', FollowUpLead);
// export default FollowUp;