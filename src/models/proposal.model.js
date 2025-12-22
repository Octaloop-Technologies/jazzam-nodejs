// src /model/proposal.model.js
import mongoose, { Schema } from "mongoose";

const proposalSchema = new Schema({
    // Reference to the lead this proposal is for
    leadId: {
        type: Schema.Types.ObjectId,
        ref: "Lead",
        required: true,
        index: true,
    },

    // Proposal title
    title: {
        type: String,
        required: true,
        trim: true,
    },

    // Generated proposal content (AI-generated text)
    content: {
        type: String,
        required: true,
    },

    // Proposal status
    status: {
        type: String,
        enum: ["draft", "sent", "accepted", "rejected"],
        default: "draft",
    },

    // BANT-based customization (e.g., "hot" leads get premium proposals)
    bantCategory: {
        type: String,
        enum: ["hot", "warm", "cold"],
        required: true,
    },

    // Additional metadata
    generatedAt: {
        type: Date,
        default: Date.now,
    },

    // Optional: Store AI prompt/response for debugging
    aiPrompt: {
        type: String,
    },
    aiResponse: {
        type: Schema.Types.Mixed,
    },

    // Word document file path
    filePath: {
        type: String,
        trim: true,
    },
}, { timestamps: true });

// Indexes for performance
proposalSchema.index({ leadId: 1 });
proposalSchema.index({ status: 1 });

export { proposalSchema }
