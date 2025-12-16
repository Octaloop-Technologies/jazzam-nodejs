import mongoose, { Schema } from "mongoose";

const nextBestActionSchema = new Schema(
  {
    // References
    // companyId: {
    //   type: Schema.Types.ObjectId,
    //   ref: "Company",
    //   required: true,
    //   index: true,
    // },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },
    dealHealthId: {
      type: Schema.Types.ObjectId,
      ref: "DealHealth",
    },

    // Action Details
    actionType: {
      type: String,
      enum: [
        "send_email",
        "schedule_call",
        "send_personalized_message",
        "escalate_to_sales",
        "move_to_nurture",
        "send_case_study",
        "request_meeting",
        "follow_up_check_in",
        "share_resources",
        "pause_outreach",
      ],
      required: true,
      index: true,
    },

    // Action Title and Description
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },

    // Recommended Timing
    recommendedTiming: {
      type: String,
      enum: ["immediate", "within_24h", "within_3_days", "within_week", "flexible"],
      default: "flexible",
    },
    recommendedDate: {
      type: Date,
    },

    // Channel for action
    channel: {
      type: String,
      enum: ["email", "phone", "linkedin", "meeting", "multi_channel"],
      default: "email",
    },

    // Template suggestion (for emails)
    templateSuggestion: {
      name: String,
      content: String,
      subject: String,
    },

    // Priority and Confidence
    priority: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      default: "medium",
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },

    // Reasoning and Context
    reasoning: {
      healthScore: Number,
      healthStatus: String,
      lastContactDays: Number,
      engagementTrend: String,
      riskFactors: [String],
      opportunities: [String],
    },

    // AI Analysis Context
    aiReasoning: {
      analysis: String,
      keyInsights: [String],
      suggestedMessage: String,
    },

    // Action Status Tracking
    status: {
      type: String,
      enum: ["pending", "suggested", "accepted", "executed", "declined", "snoozed"],
      default: "suggested",
      index: true,
    },
    executedAt: {
      type: Date,
    },
    executedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    outcome: {
      type: String,
      enum: ["success", "failed", "no_response", "pending"],
      default: "pending",
    },
    outcomeNotes: String,

    // Snoozed until date
    snoozedUntil: {
      type: Date,
    },

    // Related actions
    relatedActions: [
      {
        type: Schema.Types.ObjectId,
        ref: "NextBestAction",
      },
    ],

    // Performance metrics
    metrics: {
      isEffective: Boolean,
      resultingEngagement: Schema.Types.Mixed,
      leadStatusChanged: Boolean,
      newLeadStatus: String,
    },

    // Expiry (action suggestion becomes stale)
    expiresAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
nextBestActionSchema.index({ leadId: 1, status: 1 });
nextBestActionSchema.index({ status: 1, priority: 1 });
nextBestActionSchema.index({ createdAt: -1 });
nextBestActionSchema.index({ leadId: 1, isActive: 1 });
nextBestActionSchema.index({ expiresAt: 1 }, { sparse: true });

// TTL index for auto-removal of expired actions
nextBestActionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export { nextBestActionSchema }

// export const NextBestAction = mongoose.model(
//   "NextBestAction",
//   nextBestActionSchema
// );