import mongoose, { Schema } from 'mongoose';

const engagementHistorySchema = new Schema({
    // References (companyId removed - separate DB per tenant)
    leadId: {
        type: Schema.Types.ObjectId,
        ref: "Lead",
        required: true,
        index: true
    },
    // Engagement type
    engagementType: {
        type: String,
        enum: ["email_sent", "email_opened", "response", "contact", "meeting"],
        required: true,
        index: true
    },
    // Email specific data
    emailMetrics: {
        subject: String,
        sentAt: Date,
        openedAt: Date,
        respondedAt: Date,
        linkClicked: String,
        openCount: { type: Number, default: 0 },
        clickCount: { type: Number, default: 0 },
        messageId: String
    },
    // contact data
    contactType: {
        type: String,
        enum: ["email", "phone", "linkedin", "meeting", "note", "form_submission"]
    },

    direction: {
        type: String,
        enum: ["inbound", "outbound"]
    },
    responseTime: Number,
    outcome: {
        type: String,
        enum: ["positive", "negative", "neutral", "no_response"]
    },

    // Additional metadata
    notes: String,
    metadata: Schema.Types.Mixed,

    // Timestamp
    engagementDate: {
        type: Date,
        default: Date.now,
        index: true
    },
}, { timestamps: true });

// Indexes for better query performance
engagementHistorySchema.index({ leadId: 1, engagementDate: -1 });
engagementHistorySchema.index({ leadId: 1, engagementType: 1 });
engagementHistorySchema.index({ engagementDate: -1 });

export { engagementHistorySchema };